import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

// Definindo a interface Usuario
export interface Usuario {
  id?: number;
  nome: string;
  email: string;
  cpf_cnpj: string;
  senha: string;
  endereco_cpf: string;
  endereco_cnpj: string;
  chat_id: number;
  imagem_doc_id: string;
  comprovante_residencia_id: string;
}

export const connectionPromise = mysql.createConnection({
  host: process.env.DATABASE_HOST || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'chatbot_database',
  port: Number(process.env.DATABASE_PORT) || 3306,
});

// Salvar novo usuário
export async function salvarUsuario(usuario: Usuario) {
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
    usuario.chat_id,
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

// Buscar usuário pelo email (atualizada para retornar todos os campos necessários)
export async function buscarUsuarioPorEmail(email: string): Promise<Usuario | null> {
  const sql = `SELECT 
    id, 
    nome, 
    email, 
    cpf_cnpj, 
    senha, 
    endereco_cpf, 
    endereco_cnpj, 
    telegram_chat_id AS chat_id, 
    imagem_doc_id, 
    comprovante_residencia_id 
    FROM usuarios WHERE email = ?`;
  
  const connection = await connectionPromise;
  const [rows]: any = await connection.execute(sql, [email]);
  
  return rows[0] || null;
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

// Verificar credenciais do usuário
export async function verificarCredenciais(email: string, senha: string): Promise<Usuario | null> {
  const usuario = await buscarUsuarioPorEmail(email);
  if (!usuario || !usuario.senha) return null;
  
  const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
  return senhaCorreta ? usuario : null;
}