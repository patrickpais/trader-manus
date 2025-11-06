import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const JWT_SECRET = process.env.JWT_SECRET || 'trader-manus-secret-key-2024';
const JWT_EXPIRY = '24h';

let pool;

async function initializePool() {
  if (!pool) {
    try {
      // Usar DATABASE_URL se disponível, senão usar variáveis individuais
      const connectionString = process.env.DATABASE_URL;
      
      if (connectionString) {
        // Parsear DATABASE_URL
        const url = new URL(connectionString);
        pool = mysql.createPool({
          host: url.hostname,
          user: url.username,
          password: url.password,
          database: url.pathname.slice(1),
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
          ssl: 'Amazon RDS',
          enableKeepAlive: true,
          keepAliveInitialDelayMs: 0
        });
      } else {
        // Fallback para variáveis individuais
        pool = mysql.createPool({
          host: process.env.DB_HOST || 'localhost',
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'trader_manus',
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0
        });
      }
      
      console.log('[Auth] Pool de conexão inicializado');
    } catch (error) {
      console.error('[Auth] Erro ao inicializar pool:', error);
      throw error;
    }
  }
  return pool;
}

// Criar tabela users se não existir
async function ensureUsersTable() {
  try {
    const pool = await initializePool();
    const connection = await pool.getConnection();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'trader',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);

    connection.release();
    console.log('[Auth] Tabela users verificada/criada');
  } catch (error) {
    console.error('[Auth] Erro ao criar tabela users:', error);
  }
}

// Registrar novo usuário
async function registerUser(email, password, name) {
  try {
    const pool = await initializePool();
    const connection = await pool.getConnection();

    // Verificar se usuário já existe
    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      connection.release();
      return { success: false, error: 'Usuário já existe' };
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Inserir novo usuário
    await connection.query(
      'INSERT INTO users (email, password, name, role, created_at) VALUES (?, ?, ?, ?, NOW())',
      [email, hashedPassword, name || email, 'trader']
    );

    connection.release();
    console.log('[Auth] Usuário registrado:', email);
    return { success: true, message: 'Usuário registrado com sucesso' };
  } catch (error) {
    console.error('[Auth] Erro ao registrar usuário:', error);
    return { success: false, error: error.message };
  }
}

// Login do usuário
async function loginUser(email, password) {
  try {
    const pool = await initializePool();
    const connection = await pool.getConnection();

    // Buscar usuário
    const [users] = await connection.query(
      'SELECT id, email, password, name, role FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      connection.release();
      return { success: false, error: 'Usuário não encontrado' };
    }

    const user = users[0];

    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      connection.release();
      return { success: false, error: 'Senha incorreta' };
    }

    // Gerar JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Atualizar último login
    await connection.query(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    connection.release();

    console.log('[Auth] Login bem-sucedido:', email);
    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };
  } catch (error) {
    console.error('[Auth] Erro ao fazer login:', error);
    return { success: false, error: error.message };
  }
}

// Verificar token JWT
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, user: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Middleware de autenticação
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const verification = verifyToken(token);

  if (!verification.valid) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  req.user = verification.user;
  next();
}

// Middleware para verificar role
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    next();
  };
}

export default {
  registerUser,
  loginUser,
  verifyToken,
  authMiddleware,
  requireRole,
  initializePool,
  ensureUsersTable
};
