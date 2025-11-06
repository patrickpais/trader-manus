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

// Importar novos módulos
import authModule from './server/auth.js';
import newsModule from './server/newsAnalysis.js';
import creditsModule from './server/creditsMonitoring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// AUTENTICAÇÃO MIDDLEWARE
// ============================================

// Middleware de autenticação
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const verification = authModule.verifyToken(token);

  if (!verification.valid) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  req.user = verification.user;
  next();
};

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================

/**
 * Registrar novo usuário
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email e senha são obrigatórios'
      });
    }

    const result = await authModule.registerUser(email, password, name);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * Login do usuário
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email e senha são obrigatórios'
      });
    }

    const result = await authModule.loginUser(email, password);

    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    res.json({
      success: true,
      token: result.token,
      user: result.user
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * Verificar token
 */
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// ============================================
// API ROUTES (PÚBLICAS)
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

// ============================================
// API ROUTES (PROTEGIDAS)
// ============================================

/**
 * Inicia trading
 */
app.post('/api/trading/start', authMiddleware, async (req, res) => {
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
app.post('/api/trading/stop', authMiddleware, (req, res) => {
  stopTrading();

  res.json({
    message: 'Trading parado com sucesso',
    status: getStatus(),
  });
});

/**
 * Executa ciclo manualmente
 */
app.post('/api/trading/cycle', authMiddleware, async (req, res) => {
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
app.get('/api/positions/open', authMiddleware, (req, res) => {
  const status = getStatus();
  res.json({
    positions: status.positions,
    count: status.positions.length,
  });
});

/**
 * Histórico de trades
 */
app.get('/api/trades/history', authMiddleware, (req, res) => {
  const status = getStatus();
  res.json({
    trades: status.trades,
    count: status.trades.length,
  });
});

/**
 * Sinais atuais
 */
app.get('/api/signals', authMiddleware, (req, res) => {
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
app.get('/api/dashboard', authMiddleware, (req, res) => {
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

// ============================================
// ROTAS DE ANÁLISE DE NOTÍCIAS
// ============================================

/**
 * Analisar notícias de uma moeda
 */
app.get('/api/news/analyze/:symbol', authMiddleware, async (req, res) => {
  try {
    const { symbol } = req.params;
    const result = await newsModule.analyzeSymbolNews(symbol);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Analisar notícias de múltiplas moedas
 */
app.post('/api/news/analyze-multiple', authMiddleware, async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!Array.isArray(symbols)) {
      return res.status(400).json({
        error: 'symbols deve ser um array'
      });
    }

    const results = await newsModule.analyzeMultipleSymbols(symbols);

    res.json({
      results,
      count: results.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Ajustar confiança do sinal baseado em notícias
 */
app.post('/api/news/adjust-confidence', authMiddleware, (req, res) => {
  try {
    const { signalConfidence, newsSentiment } = req.body;

    if (signalConfidence === undefined || !newsSentiment) {
      return res.status(400).json({
        error: 'signalConfidence e newsSentiment são obrigatórios'
      });
    }

    const result = newsModule.adjustConfidenceByNews(signalConfidence, newsSentiment);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ============================================
// ROTAS DE MONITORAMENTO DE CRÉDITOS
// ============================================

/**
 * Monitorar créditos
 */
app.post('/api/credits/monitor', authMiddleware, async (req, res) => {
  try {
    const { currentCredits, userPhone } = req.body;

    if (currentCredits === undefined) {
      return res.status(400).json({
        error: 'currentCredits é obrigatório'
      });
    }

    const result = await creditsModule.monitorCredits(
      currentCredits,
      req.user.email,
      userPhone
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Obter nível atual de créditos
 */
app.get('/api/credits/level/:credits', authMiddleware, (req, res) => {
  try {
    const { credits } = req.params;
    const level = creditsModule.getCurrentLevel(parseInt(credits));

    res.json({
      credits: parseInt(credits),
      level,
      limits: creditsModule.CREDIT_LIMITS
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Calcular custo estimado mensal
 */
app.post('/api/credits/estimate-cost', authMiddleware, (req, res) => {
  try {
    const { features } = req.body;

    const monthlyCost = creditsModule.estimateMonthlyCost(features || {});
    const daysRemaining = creditsModule.calculateDaysRemaining(
      process.env.CURRENT_CREDITS || 100,
      features || {}
    );

    res.json({
      monthlyCost,
      daysRemaining: daysRemaining.daysRemaining,
      dailyCost: daysRemaining.dailyCost,
      warningDay: daysRemaining.warningDay
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Calcular dias restantes
 */
app.get('/api/credits/days-remaining/:currentCredits', authMiddleware, (req, res) => {
  try {
    const { currentCredits } = req.params;
    const features = req.query.features ? JSON.parse(req.query.features) : {};

    const result = creditsModule.calculateDaysRemaining(
      parseInt(currentCredits),
      features
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ============================================
// SERVE FRONTEND
// ============================================

/**
 * Serve frontend (sem autenticação)
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Servir arquivos estáticos públicos
 */
app.get('*', (req, res, next) => {
  // Se não for uma rota de API, tenta servir arquivo estático
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
      if (err) next();
    });
  } else {
    next();
  }
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

🔐 Autenticação Ativa
📰 Análise de Notícias Integrada
💰 Monitoramento de Créditos Ativo

Aguardando comandos...
  `);
});

export default app;
