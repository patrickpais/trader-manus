import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Criar banco de dados
const dbPath = path.join(__dirname, '..', 'trading.db');
const db = new Database(dbPath);

// Habilitar WAL mode para melhor performance
db.pragma('journal_mode = WAL');

// Schema do banco de dados
const schema = `
-- Tabela principal de trades
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  
  -- Entrada
  entry_price REAL NOT NULL,
  entry_time TEXT NOT NULL,
  entry_confidence INTEGER,
  entry_score INTEGER,
  entry_reasons TEXT,
  entry_rsi REAL,
  entry_macd REAL,
  entry_macd_signal REAL,
  entry_macd_histogram REAL,
  entry_bb_upper REAL,
  entry_bb_middle REAL,
  entry_bb_lower REAL,
  entry_volume_ratio REAL,
  entry_trend TEXT,
  entry_volatility REAL,
  
  -- Condições de mercado na entrada
  market_volatility_24h REAL,
  market_volume_24h REAL,
  market_price_change_1h REAL,
  market_price_change_24h REAL,
  
  -- Configuração do trade
  quantity REAL NOT NULL,
  leverage INTEGER NOT NULL,
  stop_loss REAL,
  take_profit REAL,
  
  -- Durante o trade
  max_profit REAL DEFAULT 0,
  max_profit_time TEXT,
  max_loss REAL DEFAULT 0,
  max_loss_time TEXT,
  duration_minutes INTEGER,
  
  -- Saída
  exit_price REAL,
  exit_time TEXT,
  exit_reason TEXT,
  exit_rsi REAL,
  exit_macd REAL,
  exit_trend TEXT,
  
  -- Resultado
  pnl REAL,
  pnl_percent REAL,
  status TEXT NOT NULL DEFAULT 'open',
  
  -- Metadados
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de snapshots (movimentação durante o trade)
CREATE TABLE IF NOT EXISTS market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  price REAL NOT NULL,
  rsi REAL,
  macd REAL,
  volume_ratio REAL,
  pnl REAL,
  pnl_percent REAL,
  FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time);
CREATE INDEX IF NOT EXISTS idx_trades_pnl ON trades(pnl);
CREATE INDEX IF NOT EXISTS idx_snapshots_trade_id ON market_snapshots(trade_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON market_snapshots(timestamp);
`;

// Executar schema
db.exec(schema);

console.log('[Database] Banco de dados inicializado:', dbPath);

// ==================== FUNÇÕES DE TRADES ====================

/**
 * Criar novo trade
 */
export function createTrade(tradeData) {
  const stmt = db.prepare(`
    INSERT INTO trades (
      symbol, side, entry_price, entry_time, entry_confidence, entry_score, entry_reasons,
      entry_rsi, entry_macd, entry_macd_signal, entry_macd_histogram,
      entry_bb_upper, entry_bb_middle, entry_bb_lower, entry_volume_ratio,
      entry_trend, entry_volatility, market_volatility_24h, market_volume_24h,
      market_price_change_1h, market_price_change_24h, quantity, leverage,
      stop_loss, take_profit, status
    ) VALUES (
      @symbol, @side, @entry_price, @entry_time, @entry_confidence, @entry_score, @entry_reasons,
      @entry_rsi, @entry_macd, @entry_macd_signal, @entry_macd_histogram,
      @entry_bb_upper, @entry_bb_middle, @entry_bb_lower, @entry_volume_ratio,
      @entry_trend, @entry_volatility, @market_volatility_24h, @market_volume_24h,
      @market_price_change_1h, @market_price_change_24h, @quantity, @leverage,
      @stop_loss, @take_profit, @status
    )
  `);
  
  const result = stmt.run(tradeData);
  return result.lastInsertRowid;
}

/**
 * Atualizar trade
 */
export function updateTrade(tradeId, updates) {
  const fields = Object.keys(updates).map(key => `${key} = @${key}`).join(', ');
  const stmt = db.prepare(`
    UPDATE trades 
    SET ${fields}, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  
  stmt.run({ id: tradeId, ...updates });
}

/**
 * Buscar trade por ID
 */
export function getTradeById(tradeId) {
  const stmt = db.prepare('SELECT * FROM trades WHERE id = ?');
  return stmt.get(tradeId);
}

/**
 * Buscar trades abertos
 */
export function getOpenTrades() {
  const stmt = db.prepare('SELECT * FROM trades WHERE status = ? ORDER BY entry_time DESC');
  return stmt.all('open');
}

/**
 * Buscar trades fechados
 */
export function getClosedTrades(limit = 100) {
  const stmt = db.prepare('SELECT * FROM trades WHERE status = ? ORDER BY exit_time DESC LIMIT ?');
  return stmt.all('closed', limit);
}

/**
 * Buscar todos os trades
 */
export function getAllTrades(limit = 1000) {
  const stmt = db.prepare('SELECT * FROM trades ORDER BY entry_time DESC LIMIT ?');
  return stmt.all(limit);
}

/**
 * Buscar trades por símbolo
 */
export function getTradesBySymbol(symbol) {
  const stmt = db.prepare('SELECT * FROM trades WHERE symbol = ? ORDER BY entry_time DESC');
  return stmt.all(symbol);
}

// ==================== FUNÇÕES DE SNAPSHOTS ====================

/**
 * Adicionar snapshot
 */
export function addSnapshot(snapshotData) {
  const stmt = db.prepare(`
    INSERT INTO market_snapshots (
      trade_id, timestamp, price, rsi, macd, volume_ratio, pnl, pnl_percent
    ) VALUES (
      @trade_id, @timestamp, @price, @rsi, @macd, @volume_ratio, @pnl, @pnl_percent
    )
  `);
  
  stmt.run(snapshotData);
}

/**
 * Buscar snapshots de um trade
 */
export function getSnapshotsByTradeId(tradeId) {
  const stmt = db.prepare('SELECT * FROM market_snapshots WHERE trade_id = ? ORDER BY timestamp ASC');
  return stmt.all(tradeId);
}

// ==================== FUNÇÕES DE ANÁLISE ====================

/**
 * Calcular estatísticas gerais
 */
export function getStatistics() {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total_trades,
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_trades,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_trades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
      SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
      SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) as total_profit,
      SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END) as total_loss,
      SUM(pnl) as net_pnl,
      AVG(pnl) as avg_pnl,
      AVG(pnl_percent) as avg_pnl_percent,
      AVG(duration_minutes) as avg_duration
    FROM trades
    WHERE status = 'closed'
  `);
  
  return stmt.get();
}

/**
 * Buscar padrões vencedores
 */
export function getWinningPatterns() {
  const stmt = db.prepare(`
    SELECT 
      AVG(entry_rsi) as avg_rsi,
      AVG(entry_macd) as avg_macd,
      AVG(entry_volume_ratio) as avg_volume_ratio,
      entry_trend,
      AVG(entry_confidence) as avg_confidence,
      COUNT(*) as count,
      AVG(pnl) as avg_pnl,
      AVG(pnl_percent) as avg_pnl_percent
    FROM trades
    WHERE status = 'closed' AND pnl > 0
    GROUP BY entry_trend
    ORDER BY avg_pnl DESC
  `);
  
  return stmt.all();
}

/**
 * Buscar padrões perdedores
 */
export function getLosingPatterns() {
  const stmt = db.prepare(`
    SELECT 
      AVG(entry_rsi) as avg_rsi,
      AVG(entry_macd) as avg_macd,
      AVG(entry_volume_ratio) as avg_volume_ratio,
      entry_trend,
      AVG(entry_confidence) as avg_confidence,
      COUNT(*) as count,
      AVG(pnl) as avg_pnl,
      AVG(pnl_percent) as avg_pnl_percent
    FROM trades
    WHERE status = 'closed' AND pnl < 0
    GROUP BY entry_trend
    ORDER BY avg_pnl ASC
  `);
  
  return stmt.all();
}

/**
 * Análise por símbolo
 */
export function getSymbolAnalysis() {
  const stmt = db.prepare(`
    SELECT 
      symbol,
      COUNT(*) as total_trades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses,
      ROUND(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as win_rate,
      SUM(pnl) as total_pnl,
      AVG(pnl) as avg_pnl,
      AVG(duration_minutes) as avg_duration
    FROM trades
    WHERE status = 'closed'
    GROUP BY symbol
    ORDER BY total_pnl DESC
  `);
  
  return stmt.all();
}

export default db;
