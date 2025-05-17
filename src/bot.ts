import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import axios from 'axios';
import cheerio from 'cheerio';
import { salvarUsuario, buscarUsuarioPorEmail, listarSites } from './db';
import { enviarCodigo } from './mail';

// Configuração inicial
dotenv.config();
const token = process.env.TELEGRAM_TOKEN;
if (!token) throw new Error('TELEGRAM_TOKEN não definido no .env');

const bot = new TelegramBot(token, { polling: true });
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : null;

// =====================
// Interfaces e Tipos
// =====================
interface Usuario {
  id?: number;
  nome: string;
  email: string;
  cpf_cnpj: string;
  senha: string;
  endereco_cpf: string;
  endereco_cnpj: string;
  imagem_doc_id: string;
  comprovante_residencia_id: string;
  chat_id: number;
}

interface CadastroState {
  usuario_id?: number;
  comprovante_residencia_id: string;
  etapa: number;
  nome?: string;
  email?: string;
  codigo?: string;
  cpf_cnpj?: string;
  cnpj?: string;
  senha?: string;
  endereco_cpf?: string;
  endereco_cnpj?: string;
  imagem_doc_id?: string;
  lastActivity: number;
}

interface SiteLeilao {
  id: number;
  nome: string;
  url: string;
}

interface Edital {
  titulo: string;
  link: string;
}

// =====================
// Configurações
// =====================
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutos
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutos
const MIN_PASSWORD_LENGTH = 6;

// =====================
// Armazenamento de Sessão
// =====================
const userSessions = new Map<number, CadastroState>();

// =====================
// Utilitários
// =====================
class Validacao {
  static validarEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  static validarCPF(cpf: string): boolean {
    return /^\d{11}$/.test(cpf);
  }

  static validarCNPJ(cnpj: string): boolean {
    return /^\d{14}$/.test(cnpj);
  }

  static validarSenha(senha: string): boolean {
    return senha.length >= MIN_PASSWORD_LENGTH;
  }
}

class Sessao {
  static atualizarAtividade(chatId: number): void {
    const user = userSessions.get(chatId);
    if (user) user.lastActivity = Date.now();
  }

  static limparSessoesInativas(): void {
    const agora = Date.now();
    for (const [chatId, sessao] of userSessions.entries()) {
      if (agora - sessao.lastActivity > SESSION_TIMEOUT) {
        userSessions.delete(chatId);
      }
    }
  }
}

// =====================
// Serviços
// =====================
class ServicoEdital {
  static async buscarEditais(url: string): Promise<Edital[]> {
    try {
      const { data } = await axios.get<string>(url, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const $ = cheerio.load(data);
      const editais: Edital[] = [];

      $('a').each((_, element) => {
        const href = $(element).attr('href');
        const texto = $(element).text().trim();
        
        if (href && /edital/i.test(href) && /\.pdf$/i.test(href)) {
          const linkCompleto = href.startsWith('http') ? href : new URL(href, url).href;
          editais.push({ 
            titulo: texto || 'Edital', 
            link: linkCompleto 
          });
        }
      });

      return editais.slice(0, 5);
    } catch (error) {
      console.error(`Erro ao buscar editais em ${url}:`, error);
      return [];
    }
  }
}

// =====================
// Handlers
// =====================
class HandlersCadastro {
  static async iniciar(chatId: number): Promise<void> {
    userSessions.set(chatId, {
      etapa: 1,
      comprovante_residencia_id: '',
      imagem_doc_id: '',
      lastActivity: Date.now()
    });
    await bot.sendMessage(chatId, '👤 *Cadastro* \n\nDigite seu nome completo:', { parse_mode: 'Markdown' });
  }

  static async processarDocumento(chatId: number, user: CadastroState, fileId: string): Promise<void> {
    if (user.etapa === 8) {
      user.imagem_doc_id = fileId;
      user.etapa = 9;
      await bot.sendMessage(chatId, '✅ *Documento recebido!* \n\nAgora envie uma foto do seu comprovante de residência:', { 
        parse_mode: 'Markdown' 
      });
    } else if (user.etapa === 9) {
      user.comprovante_residencia_id = fileId;
      user.etapa = 10;
      await bot.sendMessage(chatId, '✅ *Documentos recebidos!* \n\nAgora crie uma senha (mínimo 6 caracteres):', {
        parse_mode: 'Markdown'
      });
    }
  }

  static async processarEtapa(msg: TelegramBot.Message, user: CadastroState): Promise<void> {
    const chatId = msg.chat.id;
    const texto = msg.text?.trim() || '';

    try {
      switch(user.etapa) {
        case 1: // Nome
          user.nome = texto;
          user.etapa = 2;
          await bot.sendMessage(chatId, '📧 Digite seu e-mail:');
          break;

        case 2: // Email
          if (!Validacao.validarEmail(texto)) {
            await bot.sendMessage(chatId, '❌ E-mail inválido. Por favor, digite um e-mail válido:');
            return;
          }
          user.email = texto;
          user.codigo = Math.floor(100000 + Math.random() * 900000).toString();
          await enviarCodigo(user.email, user.codigo);
          user.etapa = 3;
          await bot.sendMessage(chatId, '✉️ Um código de verificação foi enviado para seu e-mail. Por favor, digite o código:');
          break;

        case 3: // Código
          if (texto !== user.codigo) {
            await bot.sendMessage(chatId, '❌ Código incorreto. Por favor, tente novamente:');
            return;
          }
          user.etapa = 4;
          await bot.sendMessage(chatId, '🔢 Digite seu CPF (apenas números, 11 dígitos):');
          break;

        case 4: // CPF
          if (!Validacao.validarCPF(texto)) {
            await bot.sendMessage(chatId, '❌ CPF inválido. Digite apenas os 11 números:');
            return;
          }
          user.cpf_cnpj = texto;
          user.etapa = 5;
          await bot.sendMessage(chatId, 'Deseja cadastrar também um CNPJ? (responda "sim" ou "não")');
          break;

        case 5: // CNPJ opcional
          if (texto.toLowerCase() === 'sim') {
            user.etapa = 6;
            await bot.sendMessage(chatId, '🏢 Digite o CNPJ (apenas números, 14 dígitos):');
          } else if (texto.toLowerCase() === 'não' || texto.toLowerCase() === 'nao') {
            user.etapa = 7;
            await bot.sendMessage(chatId, '🏠 Digite seu endereço completo:');
          } else {
            await bot.sendMessage(chatId, 'Por favor, responda apenas "sim" ou "não":');
          }
          break;

        case 6: // CNPJ
          if (!Validacao.validarCNPJ(texto)) {
            await bot.sendMessage(chatId, '❌ CNPJ inválido. Digite apenas os 14 números:');
            return;
          }
          user.cnpj = texto;
          user.etapa = 7;
          await bot.sendMessage(chatId, '🏠 Digite seu endereço completo (relacionado ao CPF):');
          break;

        case 7: // Endereço CPF
          user.endereco_cpf = texto;
          if (user.cnpj) {
            user.etapa = 7.5;
            await bot.sendMessage(chatId, '🏢 Digite o endereço do CNPJ (ou escreva "mesmo" se for igual ao CPF):');
          } else {
            user.endereco_cnpj = user.endereco_cpf;
            user.etapa = 8;
            await bot.sendMessage(chatId, '📷 *Agora envie uma foto do seu documento de identificação (RG ou CNH):*', {
              parse_mode: 'Markdown'
            });
          }
          break;

        case 7.5: // Endereço CNPJ
          user.endereco_cnpj = texto.toLowerCase() === 'mesmo' ? user.endereco_cpf : texto;
          user.etapa = 8;
          await bot.sendMessage(chatId, '📷 *Agora envie uma foto do seu documento de identificação (RG ou CNH):*', {
            parse_mode: 'Markdown'
          });
          break;

        case 8: // Aguardando documento
          await bot.sendMessage(chatId, '❌ Você precisa enviar uma foto do documento. Por favor, envie uma foto do seu RG ou CNH:');
          break;

        case 9: // Aguardando comprovante
          await bot.sendMessage(chatId, '❌ Você precisa enviar uma foto do comprovante de residência. Por favor, envie agora:');
          break;

        case 10: // Senha
          if (!Validacao.validarSenha(texto)) {
            await bot.sendMessage(chatId, `❌ Senha muito curta. Por favor, digite uma senha com pelo menos ${MIN_PASSWORD_LENGTH} caracteres:`);
            return;
          }
          
          // Verificar se todos os documentos foram enviados
          if (!user.imagem_doc_id || !user.comprovante_residencia_id) {
            await bot.sendMessage(chatId, '❌ Documentos não recebidos. Por favor, reinicie o cadastro com /cadastro');
            userSessions.delete(chatId);
            return;
          }

          try {
            user.senha = await bcrypt.hash(texto, 10);
            const usuario: Usuario = {
              nome: user.nome!,
              email: user.email!,
              cpf_cnpj: user.cnpj ? `${user.cpf_cnpj}/${user.cnpj}` : user.cpf_cnpj!,
              senha: user.senha,
              endereco_cpf: user.endereco_cpf!,
              endereco_cnpj: user.endereco_cnpj!,
              chat_id: chatId,
              imagem_doc_id: user.imagem_doc_id,
              comprovante_residencia_id: user.comprovante_residencia_id
            };

            await salvarUsuario(usuario);
            await bot.sendMessage(chatId, '🎉 *Cadastro concluído com sucesso!* \n\nAgora você pode fazer login com /login', {
              parse_mode: 'Markdown'
            });

            if (ADMIN_CHAT_ID) {
              await bot.sendMessage(ADMIN_CHAT_ID, `📝 Novo cadastro:\nNome: ${usuario.nome}\nEmail: ${usuario.email}`);
            }

            userSessions.delete(chatId);
          } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            await bot.sendMessage(chatId, '❌ Ocorreu um erro ao salvar seu cadastro. Por favor, tente novamente mais tarde.');
          }
          break;
      }
    } catch (error) {
      console.error('Erro no processo de cadastro:', error);
      await bot.sendMessage(chatId, '❌ Ocorreu um erro inesperado. Por favor, tente novamente.');
    }
  }
}

// =====================
// Handlers de Comandos
// =====================
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '🤖 *Bem-vindo ao Bot de Leilões* \n\nUse /cadastro para se registrar ou /ajuda para ver os comandos.', {
    parse_mode: 'Markdown'
  });
});

bot.onText(/\/ajuda/, (msg) => {
  const helpText = `
📚 *Comandos Disponíveis*:

/cadastro - Iniciar processo de cadastro
/login - Fazer login na sua conta
/editais - Ver editais de leilões disponíveis
/ajuda - Mostrar esta mensagem de ajuda

*Dúvidas?* Entre em contato com o suporte.
  `;
  bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

bot.onText(/\/cadastro/, (msg) => {
  if (userSessions.has(msg.chat.id)) {
    bot.sendMessage(msg.chat.id, '⚠️ Você já tem um cadastro em andamento. Continue o processo ou aguarde a sessão expirar.');
    return;
  }
  HandlersCadastro.iniciar(msg.chat.id);
});

bot.onText(/\/editais/, async (msg) => {
  try {
    const sites = await listarSites();
    if (!sites.length) {
      await bot.sendMessage(msg.chat.id, 'ℹ️ Nenhum site de leilão cadastrado no momento.');
      return;
    }

    const keyboard = sites.map((site: SiteLeilao) => [
      { text: site.nome, callback_data: `edital_${site.id}` }
    ]);

    await bot.sendMessage(msg.chat.id, '📋 Selecione um site para ver os editais:', {
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('Erro ao listar sites:', error);
    await bot.sendMessage(msg.chat.id, '❌ Ocorreu um erro ao buscar os sites. Tente novamente mais tarde.');
  }
});

// =====================
// Handlers de Mensagens
// =====================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  Sessao.atualizarAtividade(chatId);

  if (!msg.text && !msg.photo) return;
  if (!userSessions.has(chatId)) return;

  const user = userSessions.get(chatId)!;

  // Processar fotos (documentos)
  if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await HandlersCadastro.processarDocumento(chatId, user, fileId);
    return;
  }

  // Processar texto (cadastro)
  if (msg.text && !msg.text.startsWith('/')) {
    await HandlersCadastro.processarEtapa(msg, user);
  }
});

// =====================
// Handlers de Callback
// =====================
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message?.chat.id;
  const data = callbackQuery.data;

  if (!chatId || !data || !data.startsWith('edital_')) return;

  try {
    const siteId = parseInt(data.split('_')[1]);
    const sites = await listarSites();
    const site = sites.find((s: SiteLeilao) => s.id === siteId);

    if (!site) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Site não encontrado' });
      return;
    }

    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Buscando editais...' });
    const editais = await ServicoEdital.buscarEditais(site.url);

    if (!editais.length) {
      await bot.sendMessage(chatId, `ℹ️ Nenhum edital encontrado em ${site.nome}`);
      return;
    }

    let response = `📑 *Editais em ${site.nome}:*\n\n`;
    editais.forEach((edital, i) => {
      response += `${i+1}. [${edital.titulo}](${edital.link})\n`;
    });

    await bot.sendMessage(chatId, response, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true 
    });
  } catch (error) {
    console.error('Erro ao processar callback:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Erro ao buscar editais' });
  }
});

// =====================
// Limpeza de Sessões
// =====================
setInterval(Sessao.limparSessoesInativas, CLEANUP_INTERVAL);

console.log('🤖 Bot iniciado e pronto para operar!');