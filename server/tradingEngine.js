// Engine de Trading com Alavancagem Dinâmica

import {
  getKlines,
  getPrice,
  getBalance,
  openPosition,
  closePosition,
  getOpenPositions,
  setLeverage,
} from './bybit.js';
import { analyzeIndicators } from './indicators.js';
import { predictPrice, generateTradingSignal } from './lstm.js';

// Estado global do trading
export const tradingState = {
  isRunning: false,
  balance: 0,
  positions: [],
  trades: [],
  signals: [],
  lastUpdate: null,
};

/**
 * Calcula alavancagem dinâmica baseada em confiança
 */
function calculateLeverage(confidence) {
  if (confidence < 65) return 0; // Não opera
  if (confidence < 70) return 2;
  if (confidence < 75) return 3;
  if (confidence < 80) return 5;
  if (confidence < 85) return 7;
  if (confidence < 90) return 8;
  if (confidence < 95) return 9;
  return 10;
}

/**
 * Calcula quantidade de moedas a operar
 */
function calculateQuantity(balance, price, leverage, riskPercent = 2) {
  const riskAmount = balance * (riskPercent / 100);
  const quantity = (riskAmount * leverage) / price;
  return Math.max(quantity, 0.001); // Mínimo 0.001
}

/**
 * Calcula stop loss e take profit
 */
function calculateSLTP(entryPrice, side, leverage) {
  const stopLossPercent = 2 / leverage; // Reduz SL com alavancagem
  const takeProfitPercent = 4 / leverage; // Reduz TP com alavancagem

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
 * Analisa uma moeda e gera sinal de trading
 */
async function analyzeSymbol(symbol) {
  try {
    // Busca dados históricos
    const klines = await getKlines(symbol, '5', 200);
    if (klines.length === 0) return null;

    // Busca preço atual
    const priceData = await getPrice(symbol);
    if (!priceData) return null;

    // Analisa indicadores técnicos
    const indicators = analyzeIndicators(klines);

    // Prediz próximo movimento
    const closes = klines.map((k) => k.close);
    const prediction = predictPrice(closes);

    // Gera sinal de trading
    const signal = generateTradingSignal(indicators, prediction);

    return {
      symbol,
      timestamp: Date.now(),
      price: priceData.price,
      signal: signal.signal,
      confidence: signal.confidence,
      direction: signal.direction,
      indicators: signal.indicators,
      leverage: calculateLeverage(signal.confidence),
    };
  } catch (error) {
    console.error(`Error analyzing ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Executa trade baseado em sinal
 */
async function executeTrade(signal, balance) {
  try {
    if (signal.signal === 'HOLD' || signal.leverage === 0) {
      return null;
    }

    // Calcula quantidade
    const quantity = calculateQuantity(balance, signal.price, signal.leverage);

    // Calcula SL e TP
    const side = signal.signal === 'BUY' ? 'Buy' : 'Sell';
    const { stopLoss, takeProfit } = calculateSLTP(signal.price, side, signal.leverage);

    // Define alavancagem
    await setLeverage(signal.symbol, signal.leverage);

    // Abre posição
    const position = await openPosition(
      signal.symbol,
      side,
      quantity,
      signal.leverage,
      stopLoss,
      takeProfit
    );

    if (position) {
      return {
        ...position,
        confidence: signal.confidence,
        entryPrice: signal.price,
        stopLoss,
        takeProfit,
        expectedProfit: (signal.price * quantity * (4 / 100) * signal.leverage).toFixed(2),
      };
    }

    return null;
  } catch (error) {
    console.error('Error executing trade:', error.message);
    return null;
  }
}

/**
 * Monitora posições abertas
 */
async function monitorPositions() {
  try {
    const positions = await getOpenPositions();

    // Verifica se alguma posição atingiu SL ou TP
    for (const pos of positions) {
      const pnlPercent = pos.unrealizedPnlPercent;

      // Se atingiu TP ou SL, fecha posição
      if (Math.abs(pnlPercent) >= 2) {
        await closePosition(pos.symbol, pos.side);

        tradingState.trades.push({
          symbol: pos.symbol,
          side: pos.side,
          entryPrice: pos.entryPrice,
          exitPrice: pos.currentPrice,
          quantity: pos.size,
          pnl: pos.unrealizedPnl,
          pnlPercent: pnlPercent,
          timestamp: Date.now(),
          status: 'closed',
        });
      }
    }

    tradingState.positions = positions;
  } catch (error) {
    console.error('Error monitoring positions:', error.message);
  }
}

/**
 * Ciclo principal de trading
 */
export async function runTradingCycle() {
  try {
    // Atualiza saldo
    const balance = await getBalance();
    const usdtBalance = balance.USDT?.available || 0;
    tradingState.balance = usdtBalance;

    // Moedas para monitorar
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
      'LTCUSDT',
      'UNIUSDT',
      'ATOMUSDT',
      'APTUSDT',
      'FILUSDT',
    ];

    // Analisa cada moeda
    const signals = [];
    for (const symbol of symbols) {
      const signal = await analyzeSymbol(symbol);
      if (signal) {
        signals.push(signal);
      }
    }

    tradingState.signals = signals;

    // Executa trades com sinal BUY/SELL
    for (const signal of signals) {
      if (signal.signal !== 'HOLD') {
        const trade = await executeTrade(signal, tradingState.balance);
        if (trade) {
          console.log(`✅ Trade executado: ${trade.symbol} ${trade.side} com ${trade.leverage}x`);
        }
      }
    }

    // Monitora posições abertas
    await monitorPositions();

    tradingState.lastUpdate = new Date().toISOString();

    return {
      balance: tradingState.balance,
      positions: tradingState.positions.length,
      signals: signals.length,
      trades: tradingState.trades.length,
    };
  } catch (error) {
    console.error('Error in trading cycle:', error.message);
    return null;
  }
}

/**
 * Inicia trading automático
 */
export async function startTrading() {
  if (tradingState.isRunning) {
    console.log('Trading já está rodando');
    return;
  }

  tradingState.isRunning = true;
  console.log('🚀 Trading iniciado!');

  // Executa ciclo a cada 5 minutos
  const interval = setInterval(async () => {
    if (tradingState.isRunning) {
      await runTradingCycle();
    }
  }, 5 * 60 * 1000); // 5 minutos

  // Salva interval ID para poder parar depois
  tradingState.intervalId = interval;
}

/**
 * Para trading automático
 */
export function stopTrading() {
  if (tradingState.intervalId) {
    clearInterval(tradingState.intervalId);
  }

  tradingState.isRunning = false;
  console.log('⏹️ Trading parado');
}

/**
 * Retorna status atual
 */
export function getStatus() {
  return {
    isRunning: tradingState.isRunning,
    balance: tradingState.balance,
    positions: tradingState.positions,
    trades: tradingState.trades,
    signals: tradingState.signals,
    lastUpdate: tradingState.lastUpdate,
  };
}
