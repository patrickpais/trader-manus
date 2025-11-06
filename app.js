import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  startTrading,
  stopTrading,
  getStatus,
  runTradingCycle,
} from './server/tradingEngine.js';
import { testConnection } from './server/bybit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// API ROUTES
// ============================================

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Status do sistema
 */
app.get('/api/status', (req, res) => {
  const status = getStatus();
  res.json({
    ...status,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Inicia trading
 */
app.post('/api/trading/start', async (req, res) => {
  try {
    // Verifica conexão com Bybit
    const connected = await testConnection();

    if (!connected) {
      return res.status(400).json({
        error: 'Não conseguiu conectar com Bybit API',
      });
    }

    startTrading();

    // Executa primeiro ciclo imediatamente
    await runTradingCycle();

    res.json({
      message: 'Trading iniciado com sucesso',
      status: getStatus(),
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Para trading
 */
app.post('/api/trading/stop', (req, res) => {
  stopTrading();

  res.json({
    message: 'Trading parado com sucesso',
    status: getStatus(),
  });
});

/**
 * Executa ciclo manualmente
 */
app.post('/api/trading/cycle', async (req, res) => {
  try {
    const result = await runTradingCycle();

    res.json({
      message: 'Ciclo executado',
      result,
      status: getStatus(),
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Posições abertas
 */
app.get('/api/positions/open', (req, res) => {
  const status = getStatus();
  res.json({
    positions: status.positions,
    count: status.positions.length,
  });
});

/**
 * Histórico de trades
 */
app.get('/api/trades/history', (req, res) => {
  const status = getStatus();
  res.json({
    trades: status.trades,
    count: status.trades.length,
  });
});

/**
 * Sinais atuais
 */
app.get('/api/signals', (req, res) => {
  const status = getStatus();

  // Filtra apenas sinais BUY/SELL
  const activeSignals = status.signals.filter((s) => s.signal !== 'HOLD');

  res.json({
    signals: activeSignals,
    count: activeSignals.length,
  });
});

/**
 * Dashboard data
 */
app.get('/api/dashboard', (req, res) => {
  const status = getStatus();

  // Calcula estatísticas
  const totalTrades = status.trades.length;
  const winTrades = status.trades.filter((t) => t.pnl > 0).length;
  const lossTrades = status.trades.filter((t) => t.pnl < 0).length;
  const totalPnl = status.trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(1) : 0;

  res.json({
    balance: status.balance,
    positions: status.positions.length,
    openPositions: status.positions,
    trades: {
      total: totalTrades,
      wins: winTrades,
      losses: lossTrades,
      winRate: parseFloat(winRate),
      totalPnl: parseFloat(totalPnl.toFixed(2)),
    },
    signals: status.signals,
    isRunning: status.isRunning,
    lastUpdate: status.lastUpdate,
  });
});

/**
 * Serve frontend
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║     🤖 TRADER-MANUS INICIADO 🤖       ║
╚════════════════════════════════════════╝

🌐 Servidor rodando em: http://localhost:${PORT}
📊 Dashboard: http://localhost:${PORT}
🔗 API Health: http://localhost:${PORT}/api/health
📈 Status: http://localhost:${PORT}/api/status

Aguardando comandos...
  `);
});

export default app;
