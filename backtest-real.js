// Backtesting com Dados REAIS da Binance (API Pública)

import axios from 'axios';
import { analyzeIndicators } from './server/indicators.js';
import { predictPrice, generateTradingSignal } from './server/lstm.js';

// Configurações
const INITIAL_BALANCE = 100; // USDT
const RISK_PERCENT = 2; // % do saldo por trade
const BINANCE_API = 'https://api.binance.com/api/v3';

/**
 * Busca dados históricos reais da Binance
 */
async function getBinanceKlines(symbol, interval = '5m', limit = 1000) {
  try {
    const response = await axios.get(`${BINANCE_API}/klines`, {
      params: {
        symbol,
        interval,
        limit,
      },
    });

    return response.data.map((k) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (error) {
    console.error(`Erro ao buscar ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Calcula alavancagem baseada em confiança
 */
function calculateLeverage(confidence) {
  if (confidence < 65) return 0;
  if (confidence < 70) return 2;
  if (confidence < 75) return 3;
  if (confidence < 80) return 5;
  if (confidence < 85) return 7;
  if (confidence < 90) return 8;
  if (confidence < 95) return 9;
  return 10;
}

/**
 * Calcula quantidade baseada em risco
 */
function calculateQuantity(balance, price, leverage) {
  const riskAmount = balance * (RISK_PERCENT / 100);
  const quantity = (riskAmount * leverage) / price;
  return quantity;
}

/**
 * Calcula Stop Loss e Take Profit
 */
function calculateSLTP(entryPrice, side, leverage) {
  const stopLossPercent = 2 / leverage;
  const takeProfitPercent = 4 / leverage;

  if (side === 'Buy') {
    return {
      stopLoss: entryPrice * (1 - stopLossPercent / 100),
      takeProfit: entryPrice * (1 + takeProfitPercent / 100),
    };
  } else {
    return {
      stopLoss: entryPrice * (1 + stopLossPercent / 100),
      takeProfit: entryPrice * (1 - takeProfitPercent / 100),
    };
  }
}

/**
 * Simula posição até fechamento
 */
function simulatePosition(position, futureCandles) {
  for (let i = 0; i < futureCandles.length; i++) {
    const candle = futureCandles[i];
    const { high, low, close } = candle;

    // Verifica Stop Loss e Take Profit
    if (position.side === 'Buy') {
      if (low <= position.stopLoss) {
        return {
          ...position,
          exitPrice: position.stopLoss,
          exitTime: candle.timestamp,
          reason: 'Stop Loss',
          profit: (position.stopLoss - position.entryPrice) * position.quantity * position.leverage,
        };
      }
      if (high >= position.takeProfit) {
        return {
          ...position,
          exitPrice: position.takeProfit,
          exitTime: candle.timestamp,
          reason: 'Take Profit',
          profit: (position.takeProfit - position.entryPrice) * position.quantity * position.leverage,
        };
      }
    } else {
      if (high >= position.stopLoss) {
        return {
          ...position,
          exitPrice: position.stopLoss,
          exitTime: candle.timestamp,
          reason: 'Stop Loss',
          profit: (position.entryPrice - position.stopLoss) * position.quantity * position.leverage,
        };
      }
      if (low <= position.takeProfit) {
        return {
          ...position,
          exitPrice: position.takeProfit,
          exitTime: candle.timestamp,
          reason: 'Take Profit',
          profit: (position.entryPrice - position.takeProfit) * position.quantity * position.leverage,
        };
      }
    }
  }

  // Fecha na última vela
  const lastCandle = futureCandles[futureCandles.length - 1];
  const exitPrice = lastCandle.close;
  const profit =
    position.side === 'Buy'
      ? (exitPrice - position.entryPrice) * position.quantity * position.leverage
      : (position.entryPrice - exitPrice) * position.quantity * position.leverage;

  return {
    ...position,
    exitPrice,
    exitTime: lastCandle.timestamp,
    reason: 'Fechamento Manual',
    profit,
  };
}

/**
 * Executa backtesting para uma moeda
 */
async function backtestSymbol(symbol) {
  console.log(`\n📊 Backtesting ${symbol}...`);

  // Busca dados reais da Binance (últimos 1000 candles de 5min = ~3.5 dias)
  const klines = await getBinanceKlines(symbol, '5m', 1000);

  if (klines.length < 200) {
    console.log(`❌ Dados insuficientes para ${symbol}`);
    return null;
  }

  const trades = [];
  let balance = INITIAL_BALANCE;

  // Simula trading a cada 12 velas (1 hora)
  for (let i = 200; i < klines.length - 100; i += 12) {
    const historicalData = klines.slice(i - 200, i);
    const futureData = klines.slice(i, i + 100);

    // Analisa indicadores
    const indicators = analyzeIndicators(historicalData);
    indicators.price = historicalData[historicalData.length - 1].close;

    // Prediz movimento
    const closes = historicalData.map((k) => k.close);
    const prediction = predictPrice(closes);

    // Gera sinal
    const signal = generateTradingSignal(indicators, prediction);

    // Verifica se deve abrir posição
    const leverage = calculateLeverage(signal.confidence);

    if (signal.signal !== 'HOLD' && leverage > 0) {
      const entryPrice = historicalData[historicalData.length - 1].close;
      const quantity = calculateQuantity(balance, entryPrice, leverage);
      const side = signal.signal === 'BUY' ? 'Buy' : 'Sell';
      const { stopLoss, takeProfit } = calculateSLTP(entryPrice, side, leverage);

      const position = {
        symbol,
        side,
        entryPrice,
        quantity,
        leverage,
        stopLoss,
        takeProfit,
        entryTime: historicalData[historicalData.length - 1].timestamp,
        confidence: signal.confidence,
      };

      const closedPosition = simulatePosition(position, futureData);
      trades.push(closedPosition);

      balance += closedPosition.profit;

      console.log(
        `  ${closedPosition.side} @ $${closedPosition.entryPrice.toFixed(2)} → $${closedPosition.exitPrice.toFixed(2)} | ${closedPosition.reason} | P&L: $${closedPosition.profit.toFixed(2)}`
      );
    }
  }

  return { symbol, trades, finalBalance: balance };
}

/**
 * Executa backtesting completo
 */
async function runBacktest() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   🔬 BACKTESTING - DADOS REAIS        ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`💰 Saldo Inicial: $${INITIAL_BALANCE} USDT`);
  console.log(`📊 Fonte: Binance API (dados reais)`);
  console.log(`⚙️  Risco por Trade: ${RISK_PERCENT}%`);
  console.log(`🔄 Intervalo: 5 minutos (análise a cada 1 hora)`);
  console.log(`📅 Período: Últimos ~3.5 dias (1000 velas)\n`);

  const symbols = [
    'BTCUSDT',
    'ETHUSDT',
    'BNBUSDT',
    'SOLUSDT',
    'XRPUSDT',
    'ADAUSDT',
    'DOGEUSDT',
    'LINKUSDT',
    'AVAXUSDT',
    'MATICUSDT',
  ];

  const results = [];

  for (const symbol of symbols) {
    try {
      const result = await backtestSymbol(symbol);
      if (result) {
        results.push(result);
      }
      // Aguarda 500ms entre requisições
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`❌ Erro em ${symbol}:`, error.message);
    }
  }

  // Calcula estatísticas gerais
  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║        📈 RESULTADOS FINAIS            ║');
  console.log('╚════════════════════════════════════════╝\n');

  let totalTrades = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let totalProfit = 0;
  let totalLoss = 0;
  let finalBalance = INITIAL_BALANCE;

  results.forEach((result) => {
    result.trades.forEach((trade) => {
      totalTrades++;
      if (trade.profit > 0) {
        winningTrades++;
        totalProfit += trade.profit;
      } else {
        losingTrades++;
        totalLoss += Math.abs(trade.profit);
      }
    });
    finalBalance += result.finalBalance - INITIAL_BALANCE;
  });

  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const netProfit = finalBalance - INITIAL_BALANCE;
  const roi = ((netProfit / INITIAL_BALANCE) * 100).toFixed(2);
  const avgWin = winningTrades > 0 ? totalProfit / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0;

  console.log(`📊 Total de Trades: ${totalTrades}`);
  console.log(`✅ Trades Vencedores: ${winningTrades} (${winRate.toFixed(2)}%)`);
  console.log(`❌ Trades Perdedores: ${losingTrades} (${(100 - winRate).toFixed(2)}%)`);
  console.log(`\n💰 Saldo Inicial: $${INITIAL_BALANCE.toFixed(2)}`);
  console.log(`💰 Saldo Final: $${finalBalance.toFixed(2)}`);
  console.log(`📈 Lucro Líquido: $${netProfit.toFixed(2)}`);
  console.log(`📊 ROI: ${roi}%`);
  console.log(`\n📊 Lucro Médio: $${avgWin.toFixed(2)}`);
  console.log(`📊 Perda Média: $${avgLoss.toFixed(2)}`);
  console.log(`📊 Profit Factor: ${profitFactor.toFixed(2)}`);

  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║      📋 RESULTADOS POR MOEDA           ║');
  console.log('╚════════════════════════════════════════╝\n');

  results.forEach((result) => {
    const profit = result.finalBalance - INITIAL_BALANCE;
    const roi = ((profit / INITIAL_BALANCE) * 100).toFixed(2);
    console.log(
      `${result.symbol.padEnd(12)} | Trades: ${result.trades.length.toString().padStart(3)} | P&L: $${profit.toFixed(2).padStart(8)} | ROI: ${roi.padStart(7)}%`
    );
  });

  console.log('\n✅ Backtesting com dados reais concluído!\n');
}

// Executa backtesting
runBacktest().catch((error) => {
  console.error('Erro no backtesting:', error);
  process.exit(1);
});
