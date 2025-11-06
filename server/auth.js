import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const JWT_SECRET = process.env.JWT_SECRET || 'trader-manus-secret-key-2024';
const JWT_EXPIRY = '24h';

let pool;

async function initializePool() {
  if (!pool) {
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
  return pool;
}

async function registerUser(email, password, name) {
  try {
    const pool = await initializePool();
    const connection = await pool.getConnection();

    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      connection.release();
      return { success: false, error: 'Usuário já existe' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await connection.query(
      'INSERT INTO users (email, password, name, role, created_at) VALUES (?, ?, ?, ?, NOW())',
      [email, hashedPassword, name || email, 'trader']
    );

    connection.release();
    return { success: true, message: 'Usuário registrado com sucesso' };
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    return { success: false, error: error.message };
  }
}

async function loginUser(email, password) {
  try {
    const pool = await initializePool();
    const connection = await pool.getConnection();

    const [users] = await connection.query(
      'SELECT id, email, password, name, role FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      connection.release();
      return { success: false, error: 'Usuário não encontrado' };
    }

    const user = users[0];

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      connection.release();
      return { success: false, error: 'Senha incorreta' };
    }

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

    await connection.query(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    connection.release();

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
    console.error('Erro ao fazer login:', error);
    return { success: false, error: error.message };
  }
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, user: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

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
  initializePool
};
