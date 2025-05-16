"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Telegram Bot otimizado: cadastro, login, scraping, sessão e administração
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const dotenv_1 = __importDefault(require("dotenv"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = __importDefault(require("cheerio"));
const db_1 = require("./db");
const mail_1 = require("./mail");
dotenv_1.default.config();
const token = process.env.TELEGRAM_TOKEN;
if (!token)
    throw new Error('TELEGRAM_TOKEN não definido no .env');
const bot = new node_telegram_bot_api_1.default(token, { polling: true });
const usuarios = new Map();
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID); // defina no .env
// =====================
// Funções auxiliares
// =====================
function atualizarAtividade(chatId) {
    const user = usuarios.get(chatId);
    if (user)
        user.lastActivity = Date.now();
}
function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validarCPF(cpf) {
    return /^\d{11}$/.test(cpf);
}
function validarCNPJ(cnpj) {
    return /^\d{14}$/.test(cnpj);
}
function buscarEditais(siteUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const { data } = yield axios_1.default.get(siteUrl); // <--- AQUI
        const $ = cheerio_1.default.load(data);
        const editais = [];
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            const texto = $(el).text().trim();
            if (href && /edital/i.test(href) && /\.pdf$/i.test(href)) {
                const completo = href.startsWith('http') ? href : siteUrl + href;
                editais.push(`${texto}: ${completo}`);
            }
        });
        return editais.slice(0, 3);
    });
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
bot.onText(/\/adicionarsite (.+)/, (msg, match) => __awaiter(void 0, void 0, void 0, function* () {
    if (msg.chat.id !== ADMIN_CHAT_ID)
        return;
    const entrada = match === null || match === void 0 ? void 0 : match[1];
    if (!entrada || !entrada.includes('|')) {
        return bot.sendMessage(msg.chat.id, 'Formato inválido. Use: /adicionarsite Nome do Site | https://url.com');
    }
    const [nome, url] = entrada.split('|').map(s => s.trim());
    if (!nome || !url.startsWith('http')) {
        return bot.sendMessage(msg.chat.id, 'Dados inválidos. Exemplo correto: /adicionarsite Leilões XYZ | https://xyz.com');
    }
    try {
        yield (0, db_1.salvarNovoSite)(nome, url);
        bot.sendMessage(msg.chat.id, `✅ Site "${nome}" adicionado com sucesso.`);
    }
    catch (err) {
        console.error('Erro ao salvar site:', err);
        bot.sendMessage(msg.chat.id, '❌ Erro ao adicionar site.');
    }
}));
// =====================
// Cadastro/Login por comando (simplificado)
// =====================
bot.onText(/\/cadastro/, (msg) => __awaiter(void 0, void 0, void 0, function* () {
    const chatId = msg.chat.id;
    usuarios.set(chatId, {
        etapa: 1,
        comprovante_residencia_id: '',
        lastActivity: Date.now(),
        sitesSelecionados: new Set()
    });
    bot.sendMessage(chatId, 'Digite seu nome completo:');
}));
bot.onText(/\/login/, (msg) => __awaiter(void 0, void 0, void 0, function* () {
    const chatId = msg.chat.id;
    usuarios.set(chatId, {
        etapa: 100,
        comprovante_residencia_id: '',
        lastActivity: Date.now(),
        sitesSelecionados: new Set()
    });
    bot.sendMessage(chatId, 'Digite seu e-mail:');
}));
bot.on('message', (msg) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const chatId = msg.chat.id;
    const texto = ((_a = msg.text) === null || _a === void 0 ? void 0 : _a.trim()) || '';
    if (!usuarios.has(chatId) || texto.startsWith('/'))
        return;
    const user = usuarios.get(chatId);
    atualizarAtividade(chatId);
    switch (user.etapa) {
        case 1:
            user.nome = texto;
            user.etapa = 2;
            return bot.sendMessage(chatId, 'Digite seu e-mail:');
        case 2:
            if (!validarEmail(texto))
                return bot.sendMessage(chatId, 'E-mail inválido.');
            user.email = texto;
            user.codigo = Math.floor(100000 + Math.random() * 900000).toString();
            try {
                yield (0, mail_1.enviarCodigo)(user.email, user.codigo);
                user.etapa = 3;
                return bot.sendMessage(chatId, 'Digite o código enviado ao seu e-mail:');
            }
            catch (_b) {
                return bot.sendMessage(chatId, 'Erro ao enviar código.');
            }
        case 3:
            if (texto !== user.codigo)
                return bot.sendMessage(chatId, 'Código incorreto.');
            user.etapa = 4;
            return bot.sendMessage(chatId, 'Digite sua senha (mínimo 6 caracteres):');
        case 4:
            if (texto.length < 6)
                return bot.sendMessage(chatId, 'Senha muito curta.');
            user.senha = yield bcrypt_1.default.hash(texto, 10);
            user.etapa = 5;
            return bot.sendMessage(chatId, 'Cadastro quase finalizado. Digite seu CPF (11 dígitos):');
        case 5:
            if (!validarCPF(texto))
                return bot.sendMessage(chatId, 'CPF inválido.');
            user.cpf_cnpj = texto;
            user.etapa = 6;
            return bot.sendMessage(chatId, 'Digite seu endereço completo:');
        case 6:
            user.endereco_cpf = texto;
            user.endereco_cnpj = texto;
            try {
                const result = yield (0, db_1.salvarUsuario)(user.nome, user.email, user.cpf_cnpj, user.senha, user.endereco_cpf, user.endereco_cnpj, chatId, '', '');
                user.usuario_id = result.insertId;
                user.etapa = 0;
                return bot.sendMessage(chatId, '✅ Cadastro completo! Use /login para acessar.');
            }
            catch (err) {
                console.error('Erro ao salvar cadastro:', err);
                return bot.sendMessage(chatId, 'Erro ao salvar dados.');
            }
        case 100:
            if (!validarEmail(texto))
                return bot.sendMessage(chatId, 'E-mail inválido.');
            user.email = texto;
            user.etapa = 101;
            return bot.sendMessage(chatId, 'Digite sua senha:');
        case 101:
            try {
                const dados = yield (0, db_1.buscarUsuarioPorEmail)(user.email);
                const usuario = dados[0];
                if (!usuario)
                    return bot.sendMessage(chatId, 'E-mail não encontrado.');
                const match = yield bcrypt_1.default.compare(texto, usuario.senha);
                if (!match)
                    return bot.sendMessage(chatId, 'Senha incorreta.');
                user.usuario_id = usuario.id;
                user.etapa = 0;
                return bot.sendMessage(chatId, '✅ Login realizado com sucesso!');
            }
            catch (err) {
                console.error('Erro no login:', err);
                return bot.sendMessage(chatId, 'Erro ao tentar fazer login.');
            }
    }
}));
