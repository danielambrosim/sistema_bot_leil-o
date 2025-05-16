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
exports.connectionPromise = void 0;
exports.salvarUsuario = salvarUsuario;
exports.salvarMensagem = salvarMensagem;
exports.adicionarSiteParaUsuario = adicionarSiteParaUsuario;
exports.buscarUsuarioPorEmail = buscarUsuarioPorEmail;
exports.listarSites = listarSites;
exports.salvarNovoSite = salvarNovoSite;
exports.buscarUsuariosComSites = buscarUsuariosComSites;
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.connectionPromise = promise_1.default.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'chatbot_database',
    port: Number(process.env.DATABASE_PORT) || 3306,
});
// Salvar novo usuário
function salvarUsuario(nome, email, cpf_cnpj, senha, endereco_cpf, endereco_cnpj, telegram_chat_id, imagem_doc_id, comprovante_residencia_id) {
    return __awaiter(this, void 0, void 0, function* () {
        const sql = `INSERT INTO usuarios 
    (nome, email, cpf_cnpj, senha, endereco_cpf, endereco_cnpj, telegram_chat_id, imagem_doc_id, comprovante_residencia_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const connection = yield exports.connectionPromise;
        const [result] = yield connection.execute(sql, [
            nome,
            email,
            cpf_cnpj,
            senha,
            endereco_cpf,
            endereco_cnpj,
            telegram_chat_id,
            imagem_doc_id,
            comprovante_residencia_id,
        ]);
        return result;
    });
}
// Salvar mensagem recebida
function salvarMensagem(chatId, mensagem) {
    return __awaiter(this, void 0, void 0, function* () {
        const sql = `INSERT INTO mensagens (chat_id, mensagem, data) VALUES (?, ?, NOW())`;
        const connection = yield exports.connectionPromise;
        const [result] = yield connection.execute(sql, [chatId, mensagem]);
        return result;
    });
}
// Vincular site ao usuário
function adicionarSiteParaUsuario(usuario_id, site_id) {
    return __awaiter(this, void 0, void 0, function* () {
        const sql = `INSERT IGNORE INTO usuarios_sites (usuario_id, site_id) VALUES (?, ?)`;
        const connection = yield exports.connectionPromise;
        const [result] = yield connection.execute(sql, [usuario_id, site_id]);
        return result;
    });
}
// Buscar usuário pelo email
function buscarUsuarioPorEmail(email) {
    return __awaiter(this, void 0, void 0, function* () {
        const sql = `SELECT id, senha FROM usuarios WHERE email = ?`;
        const connection = yield exports.connectionPromise;
        const [rows] = yield connection.execute(sql, [email]);
        return rows; // retorna array
    });
}
// Listar sites disponíveis
function listarSites() {
    return __awaiter(this, void 0, void 0, function* () {
        const sql = 'SELECT id, nome, url FROM sites_leiloes';
        const connection = yield exports.connectionPromise;
        const [rows] = yield connection.query(sql);
        return rows;
    });
}
// Salvar novo site (para administrador)
function salvarNovoSite(nome, url) {
    return __awaiter(this, void 0, void 0, function* () {
        const sql = `INSERT INTO sites_leiloes (nome, url) VALUES (?, ?)`;
        const connection = yield exports.connectionPromise;
        const [result] = yield connection.execute(sql, [nome, url]);
        return result;
    });
}
// Buscar todos os usuários com seus sites (para notificações automáticas)
function buscarUsuariosComSites() {
    return __awaiter(this, void 0, void 0, function* () {
        const sql = `
    SELECT u.telegram_chat_id AS chat_id, s.nome, s.url
    FROM usuarios u
    JOIN usuarios_sites us ON us.usuario_id = u.id
    JOIN sites_leiloes s ON s.id = us.site_id
  `;
        const connection = yield exports.connectionPromise;
        const [rows] = yield connection.query(sql);
        return rows;
    });
}
