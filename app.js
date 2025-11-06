import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuração
const BYBIT_API_KEY = process.env.BYBIT_API_KEY;
const BYBIT_API_SECRET = process.env.BYBIT_API_SECRET;
const BYBIT_API_URL = 'https://api.bybit.com/v5';

// Estado da aplicação
let tradingState = {
  balance: 100,
  openPositions: [],
  closedPositions: [],
  totalTrades: 0,
  winTrades: 0,
  lossTrades: 0,
  totalProfit: 0,
  isRunning: false,
  lastUpdate: new Date(),
};

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Status do sistema
app.get('/api/status', (req, res) => {
  res.json({
    status: tradingState.isRunning ? 'running' : 'stopped',
    balance: tradingState.balance,
    totalTrades: tradingState.totalTrades,
    winRate: tradingState.totalTrades > 0 ? ((tradingState.winTrades / tradingState.totalTrades) * 100).toFixed(2) : 0,
    totalProfit: tradingState.totalProfit.toFixed(2),
    openPositions: tradingState.openPositions.length,
    timestamp: new Date().toISOString(),
  });
});

// Posições abertas
app.get('/api/positions/open', (req, res) => {
  res.json(tradingState.openPositions);
});

// Posições fechadas
app.get('/api/positions/closed', (req, res) => {
  res.json(tradingState.closedPositions);
});

// Iniciar trading
app.post('/api/trading/start', (req, res) => {
  if (tradingState.isRunning) {
    return res.status(400).json({ error: 'Trading já está ativo' });
  }

  tradingState.isRunning = true;
  res.json({ message: 'Trading iniciado', status: 'running' });

  // Inicia o loop de monitoramento
  startTradingLoop();
});

// Parar trading
app.post('/api/trading/stop', (req, res) => {
  tradingState.isRunning = false;
  res.json({ message: 'Trading parado', status: 'stopped' });
});

// ============================================
// LÓGICA DE TRADING
// ============================================

async function getBybitBalance() {
  try {
    const response = await axios.get(`${BYBIT_API_URL}/account/wallet-balance`, {
      headers: {
        'X-BAPI-KEY': BYBIT_API_KEY,
        'X-BAPI-SIGN': '', // Simplificado
        'X-BAPI-TIMESTAMP': Date.now(),
      },
      params: {
        accountType: 'UNIFIED',
      },
    });

    if (response.data.result && response.data.result.list && response.data.result.list[0]) {
      const wallet = response.data.result.list[0];
      const totalBalance = wallet.totalWalletBalance || 0;
      return parseFloat(totalBalance);
    }
  } catch (error) {
    console.error('Erro ao buscar saldo:', error.message);
  }

  return tradingState.balance;
}

async function getMarketData(symbol) {
  try {
    const response = await axios.get(`${BYBIT_API_URL}/market/kline`, {
      params: {
        category: 'linear',
        symbol: symbol,
        interval: '5',
        limit: 50,
      },
    });

    if (response.data.result && response.data.result.list) {
      return response.data.result.list.map((candle) => ({
        timestamp: parseInt(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));
    }
  } catch (error) {
    console.error(`Erro ao buscar dados de ${symbol}:`, error.message);
  }

  return [];
}

function calculateIndicators(candles) {
  if (candles.length < 14) return null;

  const closes = candles.map((c) => c.close);

  // RSI (14)
  let gains = 0,
    losses = 0;
  for (let i = 1; i < 14; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  // SMA (20)
  const sma20 = closes.slice(-20).reduce((a, b) => a + b) / 20;

  // Preço atual
  const currentPrice = closes[closes.length - 1];

  return {
    rsi: rsi.toFixed(2),
    sma20: sma20.toFixed(2),
    price: currentPrice,
    trend: rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'neutral',
  };
}

function generateSignal(indicators) {
  if (!indicators) return 'hold';

  const rsi = parseFloat(indicators.rsi);

  if (rsi < 35) return 'buy';
  if (rsi > 65) return 'sell';
  return 'hold';
}

async function executeTradeSimulation(symbol, signal, price) {
  if (signal === 'hold') return;

  const positionSize = (tradingState.balance * 0.1) / price; // 10% do saldo
  const leverage = 5;
  const stopLoss = signal === 'buy' ? price * 0.98 : price * 1.02;
  const takeProfit = signal === 'buy' ? price * 1.04 : price * 0.96;

  const position = {
    id: `${symbol}-${Date.now()}`,
    symbol,
    side: signal === 'buy' ? 'LONG' : 'SHORT',
    entryPrice: price,
    quantity: positionSize,
    leverage,
    stopLoss,
    takeProfit,
    openedAt: new Date(),
    status: 'open',
  };

  tradingState.openPositions.push(position);
  console.log(`✅ Posição aberta: ${symbol} ${position.side} @ ${price}`);

  // Simula fechamento após 5 minutos
  setTimeout(() => {
    closePositionSimulation(position);
  }, 5 * 60 * 1000);
}

function closePositionSimulation(position) {
  const index = tradingState.openPositions.indexOf(position);
  if (index === -1) return;

  tradingState.openPositions.splice(index, 1);

  // Simula P&L aleatório
  const pnl = (Math.random() - 0.4) * 50; // -40% a +60% chance de lucro
  position.closePrice = position.entryPrice + (pnl / 100) * position.entryPrice;
  position.profit = pnl;
  position.closedAt = new Date();
  position.status = 'closed';

  tradingState.closedPositions.push(position);
  tradingState.totalTrades++;

  if (pnl > 0) {
    tradingState.winTrades++;
    tradingState.totalProfit += pnl;
  } else {
    tradingState.lossTrades++;
    tradingState.totalProfit += pnl;
  }

  console.log(`🔒 Posição fechada: ${position.symbol} - P&L: ${pnl.toFixed(2)}`);
}

async function monitoringCycle() {
  if (!tradingState.isRunning) return;

  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'];

  for (const symbol of symbols) {
    try {
      const candles = await getMarketData(symbol);
      if (candles.length === 0) continue;

      const indicators = calculateIndicators(candles);
      if (!indicators) continue;

      const signal = generateSignal(indicators);
      console.log(`📊 ${symbol}: RSI=${indicators.rsi}, Signal=${signal}`);

      if (signal !== 'hold' && tradingState.openPositions.length < 5) {
        await executeTradeSimulation(symbol, signal, indicators.price);
      }
    } catch (error) {
      console.error(`Erro ao processar ${symbol}:`, error.message);
    }
  }

  tradingState.lastUpdate = new Date();
}

function startTradingLoop() {
  console.log('🚀 Iniciando loop de monitoramento...');

  // Executa a cada 5 minutos
  setInterval(() => {
    monitoringCycle();
  }, 5 * 60 * 1000);

  // Primeira execução imediata
  monitoringCycle();
}

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
  console.log(`🤖 Trader-Manus rodando em http://localhost:${PORT}`);
  console.log(`📊 Painel: http://localhost:${PORT}/`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
});
