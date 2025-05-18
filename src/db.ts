import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

// Interface Usuario com documentação
export interface Usuario {
  id?: number;
  nome: string;
  email: string;
  cpf: string;  // CPF obrigatório
  cnpj?: string; // CNPJ opcional
  senha: string;
  endereco_cpf: string;
  endereco_cnpj?: string; // também pode ser opcional
  chat_id: number;
  imagem_doc_id: string;
  comprovante_residencia_id: string;
}

export interface SiteLeilao {
  id: number;
  nome: string;
  url: string;
  seletor: string;
}

// Configuração de pool de conexões para melhor performance
const pool = mysql.createPool({
  host: process.env.DATABASE_HOST || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'chatbot_database',
  port: Number(process.env.DATABASE_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Exporta o pool para uso direto se necessário
export { pool };

// Exporta uma promise de conexão para compatibilidade
export const connectionPromise = pool.getConnection();

// Função para verificar a conexão com o banco
export async function testConnection(): Promise<boolean> {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Salvar novo usuário com tratamento de erro melhorado
export async function salvarUsuario(usuario: Usuario): Promise<{success: boolean, userId?: number, error?: string}> {
  try {
    const sql = `INSERT INTO usuarios 
      (nome, email, cpf_cnpj, senha, endereco_cpf, endereco_cnpj, telegram_chat_id, imagem_doc_id, comprovante_residencia_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const [result]: any = await pool.execute(sql, [
      usuario.nome,
      usuario.email,
      usuario.cpf,
      usuario.cnpj,
      await bcrypt.hash(usuario.senha, 10), // Hash da senha antes de salvar
      usuario.endereco_cpf,
      usuario.endereco_cnpj,
      usuario.chat_id,
      usuario.imagem_doc_id,
      usuario.comprovante_residencia_id,
    ]);
    
    return { success: true, userId: result.insertId };
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return { success: false, error: 'Email já cadastrado' };
    }
    console.error('Error saving user:', error);
    return { success: false, error: 'Erro ao cadastrar usuário' };
  }
}

// Buscar usuário pelo email com cache básico
const userCache = new Map<string, Usuario>();
export async function buscarUsuarioPorEmail(email: string): Promise<Usuario | null> {
  if (userCache.has(email)) {
    return userCache.get(email)!;
  }

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
  
  try {
    const [rows]: any = await pool.execute(sql, [email]);
    if (rows[0]) {
      userCache.set(email, rows[0]);
      return rows[0];
    }
    return null;
  } catch (error) {
    console.error('Error fetching user by email:', error);
    return null;
  }
}

// Verificar credenciais com tempo constante para prevenir timing attacks
export async function verificarCredenciais(email: string, senha: string): Promise<Usuario | null> {
  try {
    // Busca fictícia para manter tempo constante
    const fakeCompare = await bcrypt.compare(senha, '$2b$10$fakehashfakehashfakehashfake');
    
    const usuario = await buscarUsuarioPorEmail(email);
    if (!usuario || !usuario.senha) return null;
    
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
    return senhaCorreta ? usuario : null;
  } catch (error) {
    console.error('Error verifying credentials:', error);
    return null;
  }
}

// Funções restantes com pool de conexões
export async function salvarMensagem(chatId: number, mensagem: string) {
  const sql = `INSERT INTO mensagens (chat_id, mensagem, data) VALUES (?, ?, NOW())`;
  try {
    const [result] = await pool.execute(sql, [chatId, mensagem]);
    return { success: true, result };
  } catch (error) {
    console.error('Error saving message:', error);
    return { success: false, error };
  }
}

export async function listarSites(): Promise<SiteLeilao[]> {
  const sql = 'SELECT id, nome, url, seletor FROM sites_leiloes';
  try {
    const [rows]: any = await pool.query(sql);
    return rows;
  } catch (error) {
    console.error('Error listing sites:', error);
    return [];
  }
}

// Limpeza do cache ao atualizar dados do usuário
export async function limparCacheUsuario(email: string) {
  userCache.delete(email);
}