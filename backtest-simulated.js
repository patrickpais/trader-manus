// Backtesting com Dados Simulados Realistas

import { analyzeIndicators } from './server/indicators.js';
import { predictPrice, generateTradingSignal } from './server/lstm.js';

// Configurações
const INITIAL_BALANCE = 100; // USDT
const RISK_PERCENT = 2; // % do saldo por trade
const DAYS = 30;
const CANDLES_PER_DAY = 288; // 5 min intervals
const TOTAL_CANDLES = DAYS * CANDLES_PER_DAY;

/**
 * Gera dados de preço simulados realistas
 */
function generateRealisticPriceData(symbol, startPrice, trend = 'neutral') {
  const candles = [];
  let price = startPrice;
  
  // Volatilidade baseada na moeda
  const volatility = symbol.includes('BTC') ? 0.02 : symbol.includes('ETH') ? 0.025 : 0.03;
  
  // Tendência
  let trendStrength = 0;
  if (trend === 'bull') trendStrength = 0.0002;
  else if (trend === 'bear') trendStrength = -0.0002;
  
  for (let i = 0; i < TOTAL_CANDLES; i++) {
    // Movimento aleatório com tendência
    const randomMove = (Math.random() - 0.5) * volatility;
    const trendMove = trendStrength;
    const totalMove = randomMove + trendMove;
    
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
  if (confidence < 70) return 0;
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
function backtestSymbol(symbol, startPrice, trend) {
  console.log(`\n📊 Backtesting ${symbol} (${trend})...`);

  const klines = generateRealisticPriceData(symbol, startPrice, trend);
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
    }
  }

  return { symbol, trades, finalBalance: balance, trend };
}

/**
 * Executa backtesting completo
 */
function runBacktest() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🔬 BACKTESTING SIMULADO - 30 DIAS    ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log(`💰 Saldo Inicial: $${INITIAL_BALANCE} USDT`);
  console.log(`📊 Período: ${DAYS} dias`);
  console.log(`⚙️  Risco por Trade: ${RISK_PERCENT}%`);
  console.log(`🔄 Intervalo: 5 minutos (análise a cada 1 hora)\n`);

  // Simula diferentes moedas e cenários
  const scenarios = [
    { symbol: 'BTCUSDT', startPrice: 95000, trend: 'bull' },
    { symbol: 'ETHUSDT', startPrice: 3500, trend: 'bull' },
    { symbol: 'BNBUSDT', startPrice: 650, trend: 'neutral' },
    { symbol: 'SOLUSDT', startPrice: 180, trend: 'bull' },
    { symbol: 'XRPUSDT', startPrice: 2.5, trend: 'neutral' },
    { symbol: 'ADAUSDT', startPrice: 0.95, trend: 'bear' },
    { symbol: 'DOGEUSDT', startPrice: 0.35, trend: 'neutral' },
    { symbol: 'LINKUSDT', startPrice: 22, trend: 'bull' },
    { symbol: 'AVAXUSDT', startPrice: 38, trend: 'neutral' },
    { symbol: 'MATICUSDT', startPrice: 0.48, trend: 'bear' },
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
    const trendIcon = result.trend === 'bull' ? '📈' : result.trend === 'bear' ? '📉' : '↔️';
    console.log(
      `${trendIcon} ${result.symbol.padEnd(12)} | Trades: ${result.trades.length.toString().padStart(3)} | P&L: $${profit.toFixed(2).padStart(8)} | ROI: ${roi.padStart(7)}%`
    );
  });

  console.log('\n✅ Backtesting simulado concluído!\n');
  console.log('📝 Nota: Dados simulados com volatilidade e padrões realistas de mercado.\n');
}

// Executa backtesting
runBacktest();
