import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import axios from 'axios';
import cheerio from 'cheerio';
import { salvarUsuario, buscarUsuarioPorEmail, listarSites, verificarCredenciais } from './db';
import { enviarCodigo } from './mail';
import { HandlersLogin } from './handlers/login';
import { HandlersAdicionais } from './handlers/adicionais';
import { HandlersCadastro } from './handlers/cadastro';

// Configuração inicial
dotenv.config();
const token = process.env.TELEGRAM_TOKEN;
if (!token) throw new Error('TELEGRAM_TOKEN não definido no .env');

export const bot = new TelegramBot(token, { polling: true });
export const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : null;

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
  comprovante_residencia_id?: string;
  lastActivity: number;
}

interface SiteLeilao {
  id: number;
  nome: string;
  url: string;
  seletor?: string;
}

interface Edital {
  titulo: string;
  link: string;
}

// Configurações
const SESSION_TIMEOUT = 15 * 60 * 1000;
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;

export const SITES_EDITAIS = {
  'site_exemplo': {
    url: 'https://www.siteexemplo.com.br/editais',
    seletor: 'a[href$=".pdf"]'
  }
};

// Armazenamento de sessão
export const userSessions = new Map<number, CadastroState>();
export const loggedInUsers = new Map<number, number>();

// Textos fixos
const helpText = `
🛠 *Menu de Ajuda*

📝 *Cadastro* - Iniciar cadastro
🔑 *Login* - Fazer login
📋 *Editais* - Ver editais
🔍 *Buscar Edital* - Buscar editais
ℹ️ *Ajuda* - Esta mensagem
🚪 *Logout* - Sair da conta
`;

// Menu principal
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

  static estaLogado(chatId: number): boolean {
    return loggedInUsers.has(chatId);
  }
}

// Serviços
class ServicoEdital {
  static async buscarEditais(url: string, seletor?: string): Promise<Edital[]> {
    try {
      const { data } = await axios.get<string>(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (typeof data !== 'string') {
        throw new Error('Resposta inesperada do servidor');
      }

      const $ = cheerio.load(data);
      const editais: Edital[] = [];

      const selector = seletor || 'a[href$=".pdf"]';
      
      $(selector).each((_, element) => {
        const href = $(element).attr('href');
        const texto = $(element).text().trim();
        
        if (href && (seletor || /edital|licitação|concorrência/i.test(texto))) {
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

// Objeto de comandos do menu
const COMANDOS_MENU = {
  '📝 cadastro': HandlersCadastro.iniciar,
  '🔑 login': HandlersLogin.iniciar,
  '📋 editais': async (chatId: number) => {
    const sites = await listarSites();
    await bot.sendMessage(chatId, "Escolha um site:", {
      reply_markup: {
        inline_keyboard: sites.map(site => [
          { text: site.nome, callback_data: `edital_${site.id}` }
        ])
      }
    });
  },
  '🔍 buscar edital': HandlersAdicionais.listarSitesParaBusca,
  'ℹ️ ajuda': async (chatId: number) => {
    await bot.sendMessage(chatId, helpText, { 
      parse_mode: 'Markdown',
      reply_markup: mainMenu.reply_markup 
    });
  },
  '🚪 logout': async (chatId: number) => {
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
  const text = msg.text?.trim() || '';
  
  // 1. Processa documentos/fotos durante cadastro
  if (!text && msg.photo && userSessions.has(chatId)) {
    const user = userSessions.get(chatId)!;
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    await HandlersCadastro.processarDocumento(chatId, user, fileId);
    return;
  }

  // 2. Ignora mensagens sem texto fora do cadastro
  if (!text) return;

  // 3. Processa comandos do menu principal
  const comandoNormalizado = text.toLowerCase();
const ALIAS_COMANDOS: { [key: string]: string } = {
  'cadastro': '📝 cadastro',
  '📝 cadastro': '📝 cadastro',
  'login': '🔑 login',
  '🔑 login': '🔑 login',
  'editais': '📋 editais',
  '📋 editais': '📋 editais',
  'buscar edital': '🔍 buscar edital',
  '🔍 buscar edital': '🔍 buscar edital',
  'ajuda': 'ℹ️ ajuda',
  'ℹ️ ajuda': 'ℹ️ ajuda',
  'logout': '🚪 logout',
  'sair': '🚪 logout',
  '🚪 logout': '🚪 logout'
};

const comandoChave = ALIAS_COMANDOS[comandoNormalizado] || comandoNormalizado;
const handler = COMANDOS_MENU[comandoChave as keyof typeof COMANDOS_MENU];
  
  if (handler) {
    await handler(chatId);
    return;
  }

  // 4. Processa cadastro em andamento
  if (userSessions.has(chatId)) {
    await HandlersCadastro.processarEtapa(msg, userSessions.get(chatId)!);
    return;
  }

  // 5. Responde a saudações genéricas
  if (/^(oi|olá|ola|start|iniciar)$/i.test(text)) {
    await bot.sendMessage(chatId, '🤖 Bem-vindo ao Bot de Leilões!', mainMenu);
    return;
  }

  // 6. Mensagem não reconhecida
  await bot.sendMessage(chatId, 'Comando não reconhecido. Escolha uma opção:', mainMenu);
});

// Handlers de comandos específicos
bot.onText(/\/start/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🤖 Bem-vindo ao Bot de Leilões!', mainMenu);
});

bot.onText(/\/ajuda/, (msg) => {
  bot.sendMessage(msg.chat.id, helpText, {
    parse_mode: 'Markdown',
    reply_markup: mainMenu.reply_markup
  });
});

// Gerenciamento de erros
process.on('unhandledRejection', (error) => {
  console.error('Erro não tratado:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Exceção não capturada:', error);
});

// Inicia o bot
console.log('🤖 Bot iniciado!');
setInterval(Sessao.limparSessoesInativas, CLEANUP_INTERVAL);