// Backtesting Ultra-Avançado - 6 Meses

import { analyzeIndicators } from './server/indicators.js';
import { generateUltraTradingSignal, calculateUltraSLTP } from './server/ultra-algorithm.js';

// Configurações
const INITIAL_BALANCE = 100; // USDT
const RISK_PERCENT = 2; // % do saldo por trade
const DAYS = 180; // 6 meses
const CANDLES_PER_DAY = 288; // 5 min intervals
const TOTAL_CANDLES = DAYS * CANDLES_PER_DAY;

console.log(`Total de velas: ${TOTAL_CANDLES.toLocaleString()}`);

/**
 * Gera dados de preço simulados realistas
 */
function generateRealisticPriceData(symbol, startPrice, trend = 'neutral') {
  const candles = [];
  let price = startPrice;
  
  // Volatilidade baseada na moeda
  const volatility = symbol.includes('BTC') ? 0.015 : symbol.includes('ETH') ? 0.02 : 0.025;
  
  // Tendência (mais sutil para 6 meses)
  let trendStrength = 0;
  if (trend === 'bull') trendStrength = 0.0001;
  else if (trend === 'bear') trendStrength = -0.0001;
  
  for (let i = 0; i < TOTAL_CANDLES; i++) {
    // Ciclos de mercado (bull/bear alternados)
    const cyclePosition = (i / TOTAL_CANDLES) * 4; // 4 ciclos em 6 meses
    const cycleTrend = Math.sin(cyclePosition * Math.PI) * 0.0001;
    
    // Movimento aleatório com tendência e ciclos
    const randomMove = (Math.random() - 0.5) * volatility;
    const totalMove = randomMove + trendStrength + cycleTrend;
    
    // Calcula OHLC
    const open = price;
    const close = price * (1 + totalMove);
    const high = Math.max(open, close) * (1 + Math.random() * volatility / 2);
    const low = Math.min(open, close) * (1 - Math.random() * volatility / 2);
    const volume = 1000000 + Math.random() * 500000;
    
    candles.push({
      timestamp: Date.now() - (TOTAL_CANDLES - i) * 5 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume,
    });
    
    price = close;
  }
  
  return candles;
}

/**
 * Calcula alavancagem baseada em confiança
 */
function calculateLeverage(confidence) {
  if (confidence < 75) return 0;
  if (confidence < 80) return 2;
  if (confidence < 85) return 3;
  if (confidence < 90) return 5;
  if (confidence < 95) return 7;
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
function backtestSymbol(symbol, startPrice, trend) {
  console.log(`\n📊 Backtesting ${symbol} (${trend})...`);

  const klines = generateRealisticPriceData(symbol, startPrice, trend);
  const trades = [];
  let balance = INITIAL_BALANCE;
  let peakBalance = INITIAL_BALANCE;
  let maxDrawdown = 0;

  // Simula trading a cada 12 velas (1 hora)
  for (let i = 200; i < klines.length - 100; i += 12) {
    const historicalData = klines.slice(i - 200, i);
    const futureData = klines.slice(i, i + 100);

    // Analisa com algoritmo ultra-avançado
    const signal = generateUltraTradingSignal(symbol, historicalData);

    // Verifica se deve abrir posição
    const leverage = calculateLeverage(signal.confidence);

    if (signal.signal !== 'HOLD' && leverage > 0) {
      const entryPrice = historicalData[historicalData.length - 1].close;
      const quantity = calculateQuantity(balance, entryPrice, leverage);
      const side = signal.signal === 'BUY' ? 'Buy' : 'Sell';
      
      // Calcula indicadores para SL/TP
      const indicators = analyzeIndicators(historicalData);
      const volumeAnalysis = signal.details.volumeAnalysis;
      
      // Usa Stop Loss/Take Profit ultra-dinâmicos
      const sltp = calculateUltraSLTP(entryPrice, side, indicators, volumeAnalysis, leverage);

      const position = {
        symbol,
        side,
        entryPrice,
        quantity,
        leverage,
        stopLoss: sltp.stopLoss,
        takeProfit: sltp.takeProfit,
        riskReward: sltp.riskReward,
        entryTime: historicalData[historicalData.length - 1].timestamp,
        confidence: signal.confidence,
        score: signal.score,
      };

      const closedPosition = simulatePosition(position, futureData);
      trades.push(closedPosition);

      balance += closedPosition.profit;
      
      // Calcula drawdown
      if (balance > peakBalance) {
        peakBalance = balance;
      }
      const currentDrawdown = ((peakBalance - balance) / peakBalance) * 100;
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
      }
    }
  }

  return { symbol, trades, finalBalance: balance, trend, maxDrawdown };
}

/**
 * Executa backtesting completo
 */
function runBacktest() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║ 🚀 BACKTEST ULTRA-AVANÇADO - 6 MESES ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`💰 Saldo Inicial: $${INITIAL_BALANCE} USDT`);
  console.log(`📊 Período: ${DAYS} dias (6 meses)`);
  console.log(`⚙️  Risco por Trade: ${RISK_PERCENT}%`);
  console.log(`🔄 Intervalo: 5 minutos (análise a cada 1 hora)`);
  console.log(`🎯 Algoritmo: ULTRA-AVANÇADO`);
  console.log(`   ✅ Indicadores: RSI, MACD, Bollinger, Ichimoku, Stoch RSI, ADX, OBV, Fibonacci`);
  console.log(`   ✅ Sentimento: Notícias + Redes Sociais`);
  console.log(`   ✅ Volume: Profile, Order Flow, Suporte/Resistência, Liquidez`);
  console.log(`   ✅ IA: LSTM + Predição de Preço\n`);

  // Simula diferentes moedas e cenários
  const scenarios = [
    { symbol: 'BTCUSDT', startPrice: 95000, trend: 'bull' },
    { symbol: 'ETHUSDT', startPrice: 3500, trend: 'bull' },
    { symbol: 'XRPUSDT', startPrice: 2.5, trend: 'neutral' },
  ];

  const results = scenarios.map((scenario) =>
    backtestSymbol(scenario.symbol, scenario.startPrice, scenario.trend)
  );

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
  let maxDrawdown = 0;

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
    if (result.maxDrawdown > maxDrawdown) {
      maxDrawdown = result.maxDrawdown;
    }
  });

  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const netProfit = finalBalance - INITIAL_BALANCE;
  const roi = ((netProfit / INITIAL_BALANCE) * 100).toFixed(2);
  const avgWin = winningTrades > 0 ? totalProfit / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0;
  const avgTradesPerMonth = (totalTrades / 6).toFixed(1);

  console.log(`📊 Total de Trades: ${totalTrades} (${avgTradesPerMonth}/mês)`);
  console.log(`✅ Trades Vencedores: ${winningTrades} (${winRate.toFixed(2)}%)`);
  console.log(`❌ Trades Perdedores: ${losingTrades} (${(100 - winRate).toFixed(2)}%)`);
  console.log(`\n💰 Saldo Inicial: $${INITIAL_BALANCE.toFixed(2)}`);
  console.log(`💰 Saldo Final: $${finalBalance.toFixed(2)}`);
  console.log(`📈 Lucro Líquido: $${netProfit.toFixed(2)}`);
  console.log(`📊 ROI: ${roi}%`);
  console.log(`📉 Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`\n📊 Lucro Médio: $${avgWin.toFixed(2)}`);
  console.log(`📊 Perda Média: $${avgLoss.toFixed(2)}`);
  console.log(`📊 Profit Factor: ${profitFactor.toFixed(2)}`);
  console.log(`📊 Risk/Reward: ${avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A'}`);

  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║      📋 RESULTADOS POR MOEDA           ║');
  console.log('╚════════════════════════════════════════╝\n');

  results.forEach((result) => {
    const profit = result.finalBalance - INITIAL_BALANCE;
    const roi = ((profit / INITIAL_BALANCE) * 100).toFixed(2);
    const trendIcon = result.trend === 'bull' ? '📈' : result.trend === 'bear' ? '📉' : '↔️';
    const profitIcon = profit > 0 ? '🟢' : profit < 0 ? '🔴' : '⚪';
    console.log(
      `${profitIcon} ${trendIcon} ${result.symbol.padEnd(12)} | Trades: ${result.trades.length.toString().padStart(3)} | P&L: $${profit.toFixed(2).padStart(8)} | ROI: ${roi.padStart(7)}% | DD: ${result.maxDrawdown.toFixed(1)}%`
    );
  });

  console.log('\n✅ Backtesting ultra-avançado de 6 meses concluído!\n');
}

// Executa backtesting
runBacktest();
