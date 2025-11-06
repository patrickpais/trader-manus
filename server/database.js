/**
 * Trade Database - MySQL Version
 * Sistema de persistência de dados para machine learning
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

let pool = null;

/**
 * Inicializa o pool de conexões MySQL
 */
function initDatabase() {
  if (pool) return pool;
  
  try {
    pool = mysql.createPool({
      host: 'gateway02.us-east-1.prod.aws.tidbcloud.com',
      port: 4000,
      user: 'i4eWuXmqdJD31yc.root',
      password: 'v4Q7qqU8oYA5g46PKkCW',
      database: 'Cp5JEc3tFKKzfsKUJ75GgH',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      ssl: {
        rejectUnauthorized: true
      }
    });
    
    console.log('[Database] Pool de conexões MySQL criado');
    return pool;
  } catch (error) {
    console.error('[Database] Erro ao criar pool MySQL:', error);
    throw error;
  }
}

/**
 * Cria as tabelas necessárias
 */
async function createTables() {
  const db = initDatabase();
  
  try {
    // Tabela de trades
    await db.execute(`
      CREATE TABLE IF NOT EXISTS trades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        side VARCHAR(10) NOT NULL,
        entry_price DECIMAL(20, 8) NOT NULL,
        exit_price DECIMAL(20, 8),
        quantity DECIMAL(20, 8) NOT NULL,
        leverage INT,
        stop_loss DECIMAL(20, 8),
        take_profit DECIMAL(20, 8),
        
        -- Indicadores de entrada
        entry_rsi DECIMAL(10, 4),
        entry_macd DECIMAL(20, 10),
        entry_macd_signal DECIMAL(20, 10),
        entry_volume_ratio DECIMAL(10, 4),
        entry_trend VARCHAR(20),
        entry_volatility DECIMAL(20, 10),
        entry_confidence DECIMAL(10, 4),
        entry_score DECIMAL(10, 4),
        entry_reasons TEXT,
        
        -- Indicadores de saída
        exit_rsi DECIMAL(10, 4),
        exit_macd DECIMAL(20, 10),
        exit_macd_signal DECIMAL(20, 10),
        exit_volume_ratio DECIMAL(10, 4),
        
        -- Resultado
        pnl DECIMAL(20, 8),
        pnl_percent DECIMAL(10, 4),
        exit_reason VARCHAR(50),
        
        -- Tracking durante o trade
        max_profit DECIMAL(20, 8),
        max_loss DECIMAL(20, 8),
        price_history TEXT,
        
        -- Timestamps
        opened_at DATETIME NOT NULL,
        closed_at DATETIME,
        duration_minutes INT,
        
        -- Índices para queries rápidas
        INDEX idx_symbol (symbol),
        INDEX idx_opened_at (opened_at),
        INDEX idx_pnl (pnl),
        INDEX idx_confidence (entry_confidence)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Tabela de snapshots de mercado
    await db.execute(`
      CREATE TABLE IF NOT EXISTS market_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trade_id INT,
        symbol VARCHAR(20) NOT NULL,
        timestamp DATETIME NOT NULL,
        price DECIMAL(20, 8) NOT NULL,
        rsi DECIMAL(10, 4),
        macd DECIMAL(20, 10),
        volume_ratio DECIMAL(10, 4),
        pnl DECIMAL(20, 8),
        
        FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
        INDEX idx_trade_id (trade_id),
        INDEX idx_timestamp (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('[Database] ✅ Tabelas criadas/verificadas com sucesso');
  } catch (error) {
    console.error('[Database] Erro ao criar tabelas:', error);
    throw error;
  }
}

/**
 * Insere um novo trade
 */
async function insertTrade(tradeData) {
  const db = initDatabase();
  
  try {
    const [result] = await db.execute(
      `INSERT INTO trades (
        symbol, side, entry_price, quantity, leverage, stop_loss, take_profit,
        entry_rsi, entry_macd, entry_macd_signal, entry_volume_ratio,
        entry_trend, entry_volatility, entry_confidence, entry_score, entry_reasons,
        opened_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tradeData.symbol,
        tradeData.side,
        tradeData.entry_price,
        tradeData.quantity,
        tradeData.leverage || 0,
        tradeData.stop_loss || 0,
        tradeData.take_profit || 0,
        tradeData.entry_rsi || null,
        tradeData.entry_macd || null,
        tradeData.entry_macd_signal || null,
        tradeData.entry_volume_ratio || null,
        tradeData.entry_trend || null,
        tradeData.entry_volatility || null,
        tradeData.entry_confidence || null,
        tradeData.entry_score || null,
        tradeData.entry_reasons || null,
        tradeData.opened_at || new Date()
      ]
    );
    
    console.log(`[Database] ✅ Trade inserido: ${tradeData.symbol} (ID: ${result.insertId})`);
    return result.insertId;
  } catch (error) {
    console.error('[Database] Erro ao inserir trade:', error);
    throw error;
  }
}

/**
 * Atualiza dados de saída de um trade
 */
async function updateTradeExit(symbol, openedAt, exitData) {
  const db = initDatabase();
  
  try {
    const [result] = await db.execute(
      `UPDATE trades SET
        exit_price = ?,
        exit_rsi = ?,
        exit_macd = ?,
        exit_macd_signal = ?,
        exit_volume_ratio = ?,
        pnl = ?,
        pnl_percent = ?,
        exit_reason = ?,
        duration_minutes = ?,
        closed_at = NOW()
      WHERE symbol = ? AND opened_at = ? AND closed_at IS NULL`,
      [
        exitData.exit_price,
        exitData.exit_rsi || null,
        exitData.exit_macd || null,
        exitData.exit_macd_signal || null,
        exitData.exit_volume_ratio || null,
        exitData.pnl,
        exitData.pnl_percent,
        exitData.exit_reason,
        exitData.duration_minutes,
        symbol,
        openedAt
      ]
    );
    
    if (result.affectedRows > 0) {
      console.log(`[Database] ✅ Trade atualizado: ${symbol}`);
    } else {
      console.log(`[Database] ⚠️ Trade não encontrado para atualização: ${symbol}`);
    }
    
    return result.affectedRows > 0;
  } catch (error) {
    console.error('[Database] Erro ao atualizar trade:', error);
    throw error;
  }
}

/**
 * Insere snapshot de mercado
 */
async function insertMarketSnapshot(snapshotData) {
  const db = initDatabase();
  
  try {
    await db.execute(
      `INSERT INTO market_snapshots (
        trade_id, symbol, timestamp, price, rsi, macd, volume_ratio, pnl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshotData.trade_id,
        snapshotData.symbol,
        snapshotData.timestamp || new Date(),
        snapshotData.price,
        snapshotData.rsi || null,
        snapshotData.macd || null,
        snapshotData.volume_ratio || null,
        snapshotData.pnl || null
      ]
    );
  } catch (error) {
    console.error('[Database] Erro ao inserir snapshot:', error);
    throw error;
  }
}

/**
 * Busca trades vencedores (PnL > 0)
 */
async function getWinningTrades() {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(
      'SELECT * FROM trades WHERE pnl > 0 ORDER BY opened_at DESC'
    );
    return rows;
  } catch (error) {
    console.error('[Database] Erro ao buscar trades vencedores:', error);
    return [];
  }
}

/**
 * Busca trades perdedores (PnL <= 0)
 */
async function getLosingTrades() {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(
      'SELECT * FROM trades WHERE pnl <= 0 ORDER BY opened_at DESC'
    );
    return rows;
  } catch (error) {
    console.error('[Database] Erro ao buscar trades perdedores:', error);
    return [];
  }
}

/**
 * Busca trades recentes (últimos N dias)
 */
async function getRecentTrades(days = 30) {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(
      'SELECT * FROM trades WHERE opened_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ORDER BY opened_at DESC',
      [days]
    );
    return rows;
  } catch (error) {
    console.error('[Database] Erro ao buscar trades recentes:', error);
    return [];
  }
}

/**
 * Busca trades por símbolo
 */
async function getTradesBySymbol(symbol) {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(
      'SELECT * FROM trades WHERE symbol = ? ORDER BY opened_at DESC',
      [symbol]
    );
    return rows;
  } catch (error) {
    console.error('[Database] Erro ao buscar trades por símbolo:', error);
    return [];
  }
}

/**
 * Busca trades por confiança mínima
 */
async function getTradesByConfidence(minConfidence) {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(
      'SELECT * FROM trades WHERE entry_confidence >= ? ORDER BY opened_at DESC',
      [minConfidence]
    );
    return rows;
  } catch (error) {
    console.error('[Database] Erro ao buscar trades por confiança:', error);
    return [];
  }
}

/**
 * Busca trades vencedores com alta confiança
 */
async function getHighConfidenceWinners() {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(
      'SELECT * FROM trades WHERE pnl > 0 AND entry_confidence > 80 ORDER BY opened_at DESC'
    );
    return rows;
  } catch (error) {
    console.error('[Database] Erro ao buscar high confidence winners:', error);
    return [];
  }
}

/**
 * Calcula métricas médias
 */
async function getAverageMetrics() {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(`
      SELECT
        AVG(entry_rsi) as avg_rsi,
        AVG(entry_macd) as avg_macd,
        AVG(entry_volume_ratio) as avg_volume_ratio,
        AVG(entry_confidence) as avg_confidence,
        AVG(pnl) as avg_pnl,
        AVG(pnl_percent) as avg_pnl_percent,
        AVG(duration_minutes) as avg_duration
      FROM trades
      WHERE closed_at IS NOT NULL
    `);
    return rows[0] || {};
  } catch (error) {
    console.error('[Database] Erro ao calcular métricas médias:', error);
    return {};
  }
}

/**
 * Busca snapshots de um trade específico
 */
async function getMarketSnapshots(symbol, openedAt) {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(
      `SELECT s.* FROM market_snapshots s
       JOIN trades t ON s.trade_id = t.id
       WHERE t.symbol = ? AND t.opened_at = ?
       ORDER BY s.timestamp ASC`,
      [symbol, openedAt]
    );
    return rows;
  } catch (error) {
    console.error('[Database] Erro ao buscar snapshots:', error);
    return [];
  }
}

/**
 * Conta total de trades
 */
async function getTotalTrades() {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute('SELECT COUNT(*) as total FROM trades');
    return rows[0].total;
  } catch (error) {
    console.error('[Database] Erro ao contar trades:', error);
    return 0;
  }
}

/**
 * Calcula win rate
 */
async function getWinRate() {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins
      FROM trades
      WHERE closed_at IS NOT NULL
    `);
    
    const { total, wins } = rows[0];
    return total > 0 ? (wins / total) * 100 : 0;
  } catch (error) {
    console.error('[Database] Erro ao calcular win rate:', error);
    return 0;
  }
}

/**
 * Calcula PnL médio
 */
async function getAveragePnL() {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(
      'SELECT AVG(pnl) as avg_pnl FROM trades WHERE closed_at IS NOT NULL'
    );
    return rows[0].avg_pnl || 0;
  } catch (error) {
    console.error('[Database] Erro ao calcular PnL médio:', error);
    return 0;
  }
}

/**
 * Busca todos os trades (para dashboard)
 */
async function getAllTrades(limit = 100) {
  const db = initDatabase();
  
  try {
    const [rows] = await db.execute(
      'SELECT * FROM trades ORDER BY opened_at DESC LIMIT ?',
      [limit]
    );
    return rows;
  } catch (error) {
    console.error('[Database] Erro ao buscar todos os trades:', error);
    return [];
  }
}

// Inicializa o banco ao carregar o módulo
initDatabase();

export {
  initDatabase,
  createTables,
  insertTrade,
  updateTradeExit,
  insertMarketSnapshot,
  getWinningTrades,
  getLosingTrades,
  getRecentTrades,
  getTradesBySymbol,
  getTradesByConfidence,
  getHighConfidenceWinners,
  getAverageMetrics,
  getMarketSnapshots,
  getTotalTrades,
  getWinRate,
  getAveragePnL,
  getAllTrades,
};
