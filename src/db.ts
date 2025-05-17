import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const connectionPromise = mysql.createConnection({
  host: process.env.DATABASE_HOST || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'chatbot_database',
  port: Number(process.env.DATABASE_PORT) || 3306,
});

// Salvar novo usuário
export async function salvarUsuario(usuario: {
  nome: string;
  email: string;
  cpf_cnpj: string;
  senha: string;
  endereco_cpf: string;
  endereco_cnpj: string;
  chat_id: number;  // Note que no SQL você usa telegram_chat_id
  imagem_doc_id: string;
  comprovante_residencia_id: string;
}) {
  const sql = `INSERT INTO usuarios 
    (nome, email, cpf_cnpj, senha, endereco_cpf, endereco_cnpj, telegram_chat_id, imagem_doc_id, comprovante_residencia_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  const connection = await connectionPromise;
  
  const [result] = await connection.execute(sql, [
    usuario.nome,
    usuario.email,
    usuario.cpf_cnpj,
    usuario.senha,
    usuario.endereco_cpf,
    usuario.endereco_cnpj,
    usuario.chat_id, // Aqui usamos chat_id que veio do parâmetro
    usuario.imagem_doc_id,
    usuario.comprovante_residencia_id,
  ]);
  
  return result;
}

// Salvar mensagem recebida
export async function salvarMensagem(chatId: number, mensagem: string) {
  const sql = `INSERT INTO mensagens (chat_id, mensagem, data) VALUES (?, ?, NOW())`;
  const connection = await connectionPromise;
  const [result] = await connection.execute(sql, [chatId, mensagem]);
  return result;
}

// Vincular site ao usuário
export async function adicionarSiteParaUsuario(usuario_id: number, site_id: number) {
  const sql = `INSERT IGNORE INTO usuarios_sites (usuario_id, site_id) VALUES (?, ?)`;
  const connection = await connectionPromise;
  const [result] = await connection.execute(sql, [usuario_id, site_id]);
  return result;
}

// Buscar usuário pelo email
export async function buscarUsuarioPorEmail(email: string) {
  const sql = `SELECT id, senha FROM usuarios WHERE email = ?`;
  const connection = await connectionPromise;
  const [rows]: any = await connection.execute(sql, [email]);
  return rows; // retorna array
}

// Listar sites disponíveis
export async function listarSites() {
  const sql = 'SELECT id, nome, url FROM sites_leiloes';
  const connection = await connectionPromise;
  const [rows] = await connection.query(sql);
  return rows as { id: number; nome: string; url: string }[];
}

// Salvar novo site (para administrador)
export async function salvarNovoSite(nome: string, url: string) {
  const sql = `INSERT INTO sites_leiloes (nome, url) VALUES (?, ?)`;
  const connection = await connectionPromise;
  const [result] = await connection.execute(sql, [nome, url]);
  return result;
}


// Buscar todos os usuários com seus sites (para notificações automáticas)
export async function buscarUsuariosComSites() {
  const sql = `
    SELECT u.telegram_chat_id AS chat_id, s.nome, s.url
    FROM usuarios u
    JOIN usuarios_sites us ON us.usuario_id = u.id
    JOIN sites_leiloes s ON s.id = us.site_id
  `;
  const connection = await connectionPromise;
  const [rows] = await connection.query(sql);
  return rows as { chat_id: number; nome: string; url: string }[];
}