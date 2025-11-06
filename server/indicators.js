// Indicadores Técnicos para Análise de Mercado

/**
 * Calcula RSI (Relative Strength Index)
 * @param {Array} closes - Array de preços de fechamento
 * @param {Number} period - Período (padrão 14)
 * @returns {Number} Valor do RSI (0-100)
 */
export function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  // Calcula ganhos e perdas no período
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return Math.round(rsi * 100) / 100;
}

/**
 * Calcula MACD (Moving Average Convergence Divergence)
 * @param {Array} closes - Array de preços de fechamento
 * @returns {Object} { macd, signal, histogram }
 */
export function calculateMACD(closes) {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  const macd = ema12 - ema26;
  const signal = calculateEMA([macd], 9);
  const histogram = macd - signal;

  return {
    macd: Math.round(macd * 10000) / 10000,
    signal: Math.round(signal * 10000) / 10000,
    histogram: Math.round(histogram * 10000) / 10000,
  };
}

/**
 * Calcula EMA (Exponential Moving Average)
 * @param {Array} data - Array de dados
 * @param {Number} period - Período
 * @returns {Number} Valor do EMA
 */
function calculateEMA(data, period) {
  if (data.length < period) return data[data.length - 1];

  const k = 2 / (period + 1);
  let ema = data[0];

  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }

  return ema;
}

/**
 * Calcula Bollinger Bands
 * @param {Array} closes - Array de preços de fechamento
 * @param {Number} period - Período (padrão 20)
 * @param {Number} stdDev - Desvio padrão (padrão 2)
 * @returns {Object} { upper, middle, lower }
 */
export function calculateBollingerBands(closes, period = 20, stdDev = 2) {
  if (closes.length < period) {
    return { upper: 0, middle: 0, lower: 0 };
  }

  const recentCloses = closes.slice(-period);
  const middle = recentCloses.reduce((a, b) => a + b) / period;

  const variance =
    recentCloses.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) /
    period;
  const std = Math.sqrt(variance);

  return {
    upper: Math.round((middle + stdDev * std) * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round((middle - stdDev * std) * 100) / 100,
  };
}

/**
 * Calcula Moving Averages (SMA)
 * @param {Array} closes - Array de preços de fechamento
 * @param {Number} period - Período
 * @returns {Number} Valor do SMA
 */
export function calculateSMA(closes, period) {
  if (closes.length < period) return closes[closes.length - 1];

  const recentCloses = closes.slice(-period);
  return (
    Math.round(
      (recentCloses.reduce((a, b) => a + b) / period) * 100
    ) / 100
  );
}

/**
 * Calcula Volume Médio
 * @param {Array} volumes - Array de volumes
 * @param {Number} period - Período
 * @returns {Number} Volume médio
 */
export function calculateAverageVolume(volumes, period = 20) {
  if (volumes.length < period) return volumes[volumes.length - 1];

  const recentVolumes = volumes.slice(-period);
  return recentVolumes.reduce((a, b) => a + b) / period;
}

/**
 * Calcula ATR (Average True Range) para volatilidade
 * @param {Array} candles - Array de candles { high, low, close }
 * @param {Number} period - Período (padrão 14)
 * @returns {Number} Valor do ATR
 */
export function calculateATR(candles, period = 14) {
  if (candles.length < period) return 0;

  const trValues = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );

    trValues.push(tr);
  }

  const recentTR = trValues.slice(-period);
  const atr = recentTR.reduce((a, b) => a + b) / period;

  return Math.round(atr * 100) / 100;
}

/**
 * Calcula Stochastic Oscillator
 * @param {Array} candles - Array de candles { high, low, close }
 * @param {Number} period - Período (padrão 14)
 * @returns {Object} { k, d }
 */
export function calculateStochastic(candles, period = 14) {
  if (candles.length < period) return { k: 50, d: 50 };

  const recentCandles = candles.slice(-period);

  const highestHigh = Math.max(...recentCandles.map((c) => c.high));
  const lowestLow = Math.min(...recentCandles.map((c) => c.low));
  const currentClose = candles[candles.length - 1].close;

  const k =
    ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100 || 50;

  // D é a SMA de 3 períodos do K
  const d = k; // Simplificado para esta implementação

  return {
    k: Math.round(k * 100) / 100,
    d: Math.round(d * 100) / 100,
  };
}

/**
 * Analisa todos os indicadores e retorna um resumo
 * @param {Array} candles - Array de candles completos
 * @returns {Object} Resumo de todos os indicadores
 */
export function analyzeIndicators(candles) {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const rsi = calculateRSI(closes);
  const macd = calculateMACD(closes);
  const bb = calculateBollingerBands(closes);
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);
  const atr = calculateATR(candles);
  const stoch = calculateStochastic(candles);
  const avgVolume = calculateAverageVolume(volumes);

  const currentPrice = closes[closes.length - 1];
  const currentVolume = volumes[volumes.length - 1];

  return {
    price: currentPrice,
    rsi,
    macd,
    bollinger: bb,
    sma20,
    sma50,
    atr,
    stochastic: stoch,
    avgVolume,
    currentVolume,
    trend: getTrend(rsi, sma20, sma50, currentPrice),
  };
}

/**
 * Determina a tendência baseada nos indicadores
 * @returns {String} 'bullish', 'bearish', ou 'neutral'
 */
function getTrend(rsi, sma20, sma50, price) {
  let bullishSignals = 0;
  let bearishSignals = 0;

  // RSI
  if (rsi < 30) bullishSignals++;
  if (rsi > 70) bearishSignals++;

  // Moving Averages
  if (sma20 > sma50) bullishSignals++;
  if (sma20 < sma50) bearishSignals++;

  // Preço vs SMA
  if (price > sma20) bullishSignals++;
  if (price < sma20) bearishSignals++;

  if (bullishSignals > bearishSignals) return 'bullish';
  if (bearishSignals > bullishSignals) return 'bearish';
  return 'neutral';
}
