// Telegram Bot otimizado: cadastro, login, scraping, sessão e administração
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import axios from 'axios';
import cheerio from 'cheerio';
import { salvarUsuario, adicionarSiteParaUsuario, buscarUsuarioPorEmail, listarSites, buscarUsuariosComSites, salvarNovoSite } from './db';
import { enviarCodigo } from './mail';

dotenv.config();
const token = process.env.TELEGRAM_TOKEN;
if (!token) throw new Error('TELEGRAM_TOKEN não definido no .env');

const bot = new TelegramBot(token, { polling: true });

interface Cadastro {
  usuario_id?: number;
  comprovante_residencia_id: string;
  etapa: number;
  nome?: string;
  email?: string;
  codigo?: string;
  cpf_cnpj?: string;
  senha?: string;
  endereco_cpf?: string;
  endereco_cnpj?: string;
  imagem_doc_id?: string;
  modo?: 'cadastro' | 'login' | 'publico';
  sitesSelecionados?: Set<number>;
  lastActivity: number;
}

const usuarios = new Map<number, Cadastro>();
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID); // defina no .env

// =====================
// Funções auxiliares
// =====================
function atualizarAtividade(chatId: number) {
  const user = usuarios.get(chatId);
  if (user) user.lastActivity = Date.now();
}

function validarEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarCPF(cpf: string) {
  return /^\d{11}$/.test(cpf);
}

function validarCNPJ(cnpj: string) {
  return /^\d{14}$/.test(cnpj);
}

async function buscarEditais(siteUrl: string): Promise<string[]> {
  const { data } = await axios.get<string>(siteUrl);  // <--- AQUI
  const $ = cheerio.load(data);
  const editais: string[] = [];

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const texto = $(el).text().trim();
    if (href && /edital/i.test(href) && /\.pdf$/i.test(href)) {
      const completo = href.startsWith('http') ? href : siteUrl + href;
      editais.push(`${texto}: ${completo}`);
    }
  });
  return editais.slice(0, 3);
}

// =====================
// Sessão: limpeza automática
// =====================
setInterval(() => {
  const agora = Date.now();
  for (const [chatId, cadastro] of usuarios.entries()) {
    if (agora - cadastro.lastActivity > 15 * 60 * 1000) {
      usuarios.delete(chatId);
    }
  }
}, 5 * 60 * 1000);

// =====================
// Comandos
// =====================
bot.onText(/\/ajuda/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Comandos:\n/start – reiniciar\n/ajuda – ajuda\n/sobre – sobre o sistema');
});

bot.onText(/\/sobre/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Bot de leilões com cadastro, login e acesso a editais.');
});

// =====================
// Comando admin para adicionar novo site
// =====================
bot.onText(/\/adicionarsite (.+)/, async (msg, match) => {
  if (msg.chat.id !== ADMIN_CHAT_ID) return;
  const entrada = match?.[1];
  if (!entrada || !entrada.includes('|')) {
    return bot.sendMessage(msg.chat.id, 'Formato inválido. Use: /adicionarsite Nome do Site | https://url.com');
  }

  const [nome, url] = entrada.split('|').map(s => s.trim());
  if (!nome || !url.startsWith('http')) {
    return bot.sendMessage(msg.chat.id, 'Dados inválidos. Exemplo correto: /adicionarsite Leilões XYZ | https://xyz.com');
  }

  try {
    await salvarNovoSite(nome, url);
    bot.sendMessage(msg.chat.id, `✅ Site "${nome}" adicionado com sucesso.`);
  } catch (err) {
    console.error('Erro ao salvar site:', err);
    bot.sendMessage(msg.chat.id, '❌ Erro ao adicionar site.');
  }
});

// =====================
// Cadastro/Login por comando (simplificado)
// =====================
bot.onText(/\/cadastro/, async (msg) => {
  const chatId = msg.chat.id;
  usuarios.set(chatId, {
    etapa: 1,
    comprovante_residencia_id: '',
    lastActivity: Date.now(),
    sitesSelecionados: new Set()
  });
  bot.sendMessage(chatId, 'Digite seu nome completo:');
});

bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id;
  usuarios.set(chatId, {
    etapa: 100,
    comprovante_residencia_id: '',
    lastActivity: Date.now(),
    sitesSelecionados: new Set()
  });
  bot.sendMessage(chatId, 'Digite seu e-mail:');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const texto = msg.text?.trim() || '';
  if (!usuarios.has(chatId) || texto.startsWith('/')) return;

  const user = usuarios.get(chatId)!;
  atualizarAtividade(chatId);

  switch (user.etapa) {
    case 1:
      user.nome = texto;
      user.etapa = 2;
      return bot.sendMessage(chatId, 'Digite seu e-mail:');
    case 2:
      if (!validarEmail(texto)) return bot.sendMessage(chatId, 'E-mail inválido.');
      user.email = texto;
      user.codigo = Math.floor(100000 + Math.random() * 900000).toString();
      try {
        await enviarCodigo(user.email, user.codigo);
        user.etapa = 3;
        return bot.sendMessage(chatId, 'Digite o código enviado ao seu e-mail:');
      } catch {
        return bot.sendMessage(chatId, 'Erro ao enviar código.');
      }
    case 3:
      if (texto !== user.codigo) return bot.sendMessage(chatId, 'Código incorreto.');
      user.etapa = 4;
      return bot.sendMessage(chatId, 'Digite sua senha (mínimo 6 caracteres):');
    case 4:
      if (texto.length < 6) return bot.sendMessage(chatId, 'Senha muito curta.');
      user.senha = await bcrypt.hash(texto, 10);
      user.etapa = 5;
      return bot.sendMessage(chatId, 'Cadastro quase finalizado. Digite seu CPF (11 dígitos):');
    case 5:
      if (!validarCPF(texto)) return bot.sendMessage(chatId, 'CPF inválido.');
      user.cpf_cnpj = texto;
      user.etapa = 6;
      return bot.sendMessage(chatId, 'Digite seu endereço completo:');
    case 6:
      user.endereco_cpf = texto;
      user.endereco_cnpj = texto;
      try {
        const result = await salvarUsuario(
          user.nome!, user.email!, user.cpf_cnpj!, user.senha!,
          user.endereco_cpf!, user.endereco_cnpj!, chatId, '', ''
        );
        user.usuario_id = (result as any).insertId;
        user.etapa = 0;
        return bot.sendMessage(chatId, '✅ Cadastro completo! Use /login para acessar.');
      } catch (err) {
        console.error('Erro ao salvar cadastro:', err);
        return bot.sendMessage(chatId, 'Erro ao salvar dados.');
      }

    case 100:
      if (!validarEmail(texto)) return bot.sendMessage(chatId, 'E-mail inválido.');
      user.email = texto;
      user.etapa = 101;
      return bot.sendMessage(chatId, 'Digite sua senha:');
    case 101:
      try {
        const dados = await buscarUsuarioPorEmail(user.email!);
        const usuario = dados[0];
        if (!usuario) return bot.sendMessage(chatId, 'E-mail não encontrado.');
        const match = await bcrypt.compare(texto, usuario.senha);
        if (!match) return bot.sendMessage(chatId, 'Senha incorreta.');
        user.usuario_id = usuario.id;
        user.etapa = 0;
        return bot.sendMessage(chatId, '✅ Login realizado com sucesso!');
      } catch (err) {
        console.error('Erro no login:', err);
        return bot.sendMessage(chatId, 'Erro ao tentar fazer login.');
      }
  }
});
