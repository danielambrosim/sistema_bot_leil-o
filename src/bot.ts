import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import axios from 'axios';
import cheerio from 'cheerio';
import { 
  salvarUsuario, 
  buscarUsuarioPorEmail, 
  listarSites 
} from './db';
import { enviarCodigo } from './mail';

// Configuração inicial
dotenv.config();
const token = process.env.TELEGRAM_TOKEN;
if (!token) throw new Error('TELEGRAM_TOKEN não definido no .env');

const bot = new TelegramBot(token, { polling: true });
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);

// Interfaces
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

// Constantes
const SESSION_TIMEOUT = 15 * 60 * 1000;
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;

// Armazenamento de sessão
const userSessions = new Map<number, CadastroState>();

// Utilitários
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

// Serviços
class ServicoEdital {
  static async buscarEditais(url: string): Promise<{titulo: string, link: string}[]> {
    try {
      // Tipagem explícita da resposta como string
      const { data } = await axios.get<string>(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const $ = cheerio.load(data);
      const editais: {titulo: string, link: string}[] = [];

      $('a').each((_, element) => {
        const href = $(element).attr('href');
        const texto = $(element).text().trim();
        
        if (href && /edital/i.test(href) && /\.pdf$/i.test(href)) {
          const linkCompleto = href.startsWith('http') 
            ? href 
            : new URL(href, url).href;
            
          editais.push({
            titulo: texto || 'Edital',
            link: linkCompleto
          });
        }
      });

      return editais.slice(0, 5);
    } catch (erro) {
      console.error(`Erro ao buscar editais em ${url}:`, erro);
      return [];
    }
  }
}

// Handlers
class Handlers {
  static async iniciarCadastro(chatId: number): Promise<void> {
    userSessions.set(chatId, {
      etapa: 1,
      comprovante_residencia_id: '',
      lastActivity: Date.now()
    });
    await bot.sendMessage(chatId, '👤 Por favor, digite seu nome completo:');
  }

  static async iniciarLogin(chatId: number): Promise<void> {
    userSessions.set(chatId, {
      etapa: 100,
      comprovante_residencia_id: '',
      lastActivity: Date.now()
    });
    await bot.sendMessage(chatId, '📧 Digite seu e-mail:');
  }

  static async handleDocumentos(chatId: number, user: CadastroState, fileId: string): Promise<void> {
    if (user.etapa === 8) {
      user.imagem_doc_id = fileId;
      user.etapa = 9;
      await bot.sendMessage(chatId, '📄 Documento recebido! Agora envie o comprovante de residência:');
    } else if (user.etapa === 9) {
      user.comprovante_residencia_id = fileId;
      user.etapa = 10;
      await bot.sendMessage(chatId, '✅ Documentos recebidos! Agora crie uma senha (mínimo 6 caracteres):');
    }
  }

  static async handleCadastro(msg: TelegramBot.Message, user: CadastroState): Promise<void> {
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
            await bot.sendMessage(chatId, '❌ E-mail inválido. Digite novamente:');
            return;
          }
          user.email = texto;
          user.codigo = Math.floor(100000 + Math.random() * 900000).toString();
          await enviarCodigo(user.email, user.codigo);
          user.etapa = 3;
          await bot.sendMessage(chatId, '✉️ Código enviado! Digite o código recebido:');
          break;

        case 3: // Código
          if (texto !== user.codigo) {
            await bot.sendMessage(chatId, '❌ Código incorreto. Tente novamente:');
            return;
          }
          user.etapa = 4;
          await bot.sendMessage(chatId, '🔢 Digite seu CPF (apenas números, 11 dígitos):');
          break;

        case 4: // CPF
          if (!Validacao.validarCPF(texto)) {
            await bot.sendMessage(chatId, '❌ CPF inválido. Digite 11 números:');
            return;
          }
          user.cpf_cnpj = texto;
          user.etapa = 5;
          await bot.sendMessage(chatId, 'Deseja cadastrar CNPJ? (sim/não)');
          break;

        case 5: // CNPJ opcional
          if (texto.toLowerCase() === 'sim') {
            user.etapa = 6;
            await bot.sendMessage(chatId, '🏢 Digite o CNPJ (14 dígitos):');
          } else if (texto.toLowerCase() === 'não' || texto.toLowerCase() === 'nao') {
            user.etapa = 7;
            await bot.sendMessage(chatId, '🏠 Digite seu endereço completo:');
          } else {
            await bot.sendMessage(chatId, 'Responda "sim" ou "não":');
          }
          break;

        case 6: // CNPJ
          if (!Validacao.validarCNPJ(texto)) {
            await bot.sendMessage(chatId, '❌ CNPJ inválido. Digite 14 números:');
            return;
          }
          user.cnpj = texto;
          user.etapa = 7;
          await bot.sendMessage(chatId, '🏠 Digite seu endereço (CPF):');
          break;

        case 7: // Endereço
          user.endereco_cpf = texto;
          if (user.cnpj) {
            user.etapa = 7.5;
            await bot.sendMessage(chatId, '🏢 Digite o endereço do CNPJ (ou "mesmo"):');
          } else {
            user.endereco_cnpj = user.endereco_cpf;
            user.etapa = 8;
            await bot.sendMessage(chatId, '📷 Envie foto do seu documento (RG/CNH):');
          }
          break;

        case 7.5: // Endereço CNPJ
          user.endereco_cnpj = texto.toLowerCase() === 'mesmo' ? user.endereco_cpf : texto;
          user.etapa = 8;
          await bot.sendMessage(chatId, '📷 Envie foto do seu documento (RG/CNH):');
          break;

        case 10: // Senha
          if (!Validacao.validarSenha(texto)) {
            await bot.sendMessage(chatId, `❌ Senha muito curta (mínimo ${MIN_PASSWORD_LENGTH} caracteres):`);
            return;
          }
          
          // Verificar documentos
          if (!user.imagem_doc_id || !user.comprovante_residencia_id) {
            await bot.sendMessage(chatId, '❌ Documentos não recebidos. Reinicie o cadastro.');
            userSessions.delete(chatId);
            return;
          }

          try {
            user.senha = await bcrypt.hash(texto, 10);
            await salvarUsuario({
              nome: user.nome!,
              email: user.email!,
              cpf_cnpj: user.cnpj ? `${user.cpf_cnpj}/${user.cnpj}` : user.cpf_cnpj!,
              senha: user.senha,
              endereco_cpf: user.endereco_cpf!,
              endereco_cnpj: user.endereco_cnpj!,
              chat_id: chatId,
              imagem_doc_id: user.imagem_doc_id,
              comprovante_residencia_id: user.comprovante_residencia_id
            });

            await bot.sendMessage(chatId, '✅ Cadastro concluído com sucesso!');
            userSessions.delete(chatId);

            if (ADMIN_CHAT_ID) {
              await bot.sendMessage(ADMIN_CHAT_ID, `Novo cadastro: ${user.nome} (${user.email})`);
            }
          } catch (erro) {
            console.error('Erro ao salvar usuário:', erro);
            await bot.sendMessage(chatId, '❌ Erro ao salvar cadastro. Tente novamente.');
          }
          break;
      }
    } catch (erro) {
      console.error('Erro no cadastro:', erro);
      await bot.sendMessage(chatId, '❌ Ocorreu um erro. Tente novamente.');
    }
  }
}

// Comandos
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Bem-vindo ao bot de leilões! Use /ajuda para ver os comandos.');
});

bot.onText(/\/cadastro/, (msg) => {
  Handlers.iniciarCadastro(msg.chat.id);
});

bot.onText(/\/login/, (msg) => {
  Handlers.iniciarLogin(msg.chat.id);
});

// Mensagens
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  Sessao.atualizarAtividade(chatId);

  if (!userSessions.has(chatId)) return;

  const user = userSessions.get(chatId)!;

  // Processar fotos (documentos)
  if (msg.photo && (user.etapa === 8 || user.etapa === 9)) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await Handlers.handleDocumentos(chatId, user, fileId);
    return;
  }

  // Processar texto (cadastro/login)
  if (msg.text && !msg.text.startsWith('/')) {
    await Handlers.handleCadastro(msg, user);
  }
});

// Limpeza de sessões
setInterval(Sessao.limparSessoesInativas, CLEANUP_INTERVAL);

console.log('Bot iniciado com sucesso!');