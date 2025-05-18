import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

import { HandlersCadastro } from './handlers/cadastro';
import { HandlersLogin, loginSessions } from './handlers/login';
import { HandlersAdicionais } from './handlers/adicionais';

dotenv.config();
const token = process.env.TELEGRAM_TOKEN;
if (!token) throw new Error('TELEGRAM_TOKEN não definido no .env');

export const bot = new TelegramBot(token, { polling: true });
export const userSessions = new Map<number, any>();
export const loggedInUsers = new Map<number, number>();

export const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '📝 Cadastro' }, { text: '🔑 Login' }],
      [{ text: '📋 Editais' }, { text: '🔍 Buscar Edital' }],
      [{ text: 'ℹ️ Ajuda' }, { text: '🚪 Logout' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// ALIAS dos comandos para comparação flexível (sem barra, tudo em minúsculo)
const ALIAS_COMANDOS: { [key: string]: string } = {
  'cadastro': '📝 Cadastro',
  '📝 Cadastro': '📝 Cadastro',
  'Cadastro': '📝 Cadastro',
  'login': '🔑 Login',
  '🔑 Login': '🔑 Login',
  'Login': '🔑 Login',
  'editais': '📋 Editais',
  '📋 Editais': '📋 Editais',
  'Editais': '📋 Editais',
  'buscar edital': '🔍 Buscar Edital',
  '🔍 Buscar Edital': '🔍 Buscar Edital',
  'Buscar Edital': '🔍 Buscar Edital',
  'ajuda': 'ℹ️ Ajuda',
  'ℹ️ Ajuda': 'ℹ️ Ajuda',
  'Ajuda': 'ℹ️ Ajuda',
  'logout': '🚪 Logout',
  'sair': '🚪 Logout',
  'Logout': '🚪 Logout',
  '🚪 Logout': '🚪 Logout'
};

// Objeto de handlers (ajuste para incluir handlers reais dos fluxos)
const COMANDOS_MENU: { [key: string]: (chatId: number) => Promise<any> } = {
'📝 Cadastro': HandlersCadastro.iniciar,
'🔑 Login': HandlersLogin.iniciar,
'📋 Editais': async (chatId) => { await HandlersAdicionais.listarSitesParaBusca(chatId); },
'🔍 Buscar Edital': async (chatId) => { await HandlersAdicionais.listarSitesParaBusca(chatId); },
'ℹ️ Ajuda': async (chatId) => {
  await bot.sendMessage(chatId, 'ℹ️ Este bot permite cadastro, login e acesso a editais de leilões!', mainMenu);
},
  '🚪 Logout': async (chatId) => {
    if (loggedInUsers.has(chatId)) {
      loggedInUsers.delete(chatId);
      await bot.sendMessage(chatId, '✅ Você foi deslogado.', mainMenu);
    } else {
      await bot.sendMessage(chatId, 'ℹ️ Você não estava logado.', mainMenu);
    }
  } 
};

// Handler de mensagens principal

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  console.log('Texto recebido:', JSON.stringify(text));

  // 1. Ignora comandos iniciados por barra (ex: /start, /login)
  if (text && text.startsWith('/')) return;

  // 2. Processa documentos/fotos durante cadastro
  if (!text && msg.photo && userSessions.has(chatId)) {
    const user = userSessions.get(chatId)!;
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await HandlersCadastro.processarDocumento(chatId, user, fileId);
    return;
  }

  // 3. Processa comandos do menu principal (clicou no botão!)
  if (text) {
   
    const comandoChave = ALIAS_COMANDOS[text ?? ''] || text;
    const handler = COMANDOS_MENU[comandoChave as keyof typeof COMANDOS_MENU];

    if (handler) {
      await handler(chatId);
      return;
    }
  }

  // 4. Processa login em andamento
  if (loginSessions.has(chatId)) {
    await HandlersLogin.processarEtapa(msg, loginSessions.get(chatId)!);
    return;
  }

  // 5. Processa cadastro em andamento
  if (userSessions.has(chatId)) {
    await HandlersCadastro.processarEtapa(msg, userSessions.get(chatId)!);
    return;
  }

  // 6. Saudações e primeira mensagem: sempre mostra o menu
  if (/^(oi|olá|ola|start|iniciar)$/i.test(text || '')) {
    await bot.sendMessage(chatId, '🤖 Bem-vindo ao Bot de Leilões!\nEscolha uma opção:', mainMenu);
    return;
  }

  // 7. Mensagem não reconhecida: volta ao menu
  await bot.sendMessage(chatId, 'Escolha uma opção:', mainMenu);
});

// Handler para o /start — só para garantir, mas já não é mais necessário
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🤖 Bem-vindo ao Bot de Leilões!\nEscolha uma opção:', mainMenu);
});

// Handler para /ajuda — opcional
bot.onText(/\/ajuda/, (msg) => {
  bot.sendMessage(msg.chat.id, 'ℹ️ Este bot permite cadastro, login e acesso a editais de leilões!', mainMenu);
});

// Erro global
process.on('unhandledRejection', (error) => {
  console.error('Erro não tratado:', error);
});
process.on('uncaughtException', (error) => {
  console.error('Exceção não capturada:', error);
});

// Inicia o bot
console.log('🤖 Bot iniciado!');
