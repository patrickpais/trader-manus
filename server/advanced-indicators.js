// Indicadores Técnicos Avançados

/**
 * Calcula Ichimoku Cloud
 */
export function calculateIchimoku(candles) {
  if (candles.length < 52) {
    return {
      tenkan: 0,
      kijun: 0,
      senkouA: 0,
      senkouB: 0,
      chikou: 0,
      signal: 'NEUTRAL',
    };
  }

  // Tenkan-sen (Conversion Line): (9-period high + 9-period low) / 2
  const tenkanPeriod = 9;
  const tenkanHigh = Math.max(...candles.slice(-tenkanPeriod).map((c) => c.high));
  const tenkanLow = Math.min(...candles.slice(-tenkanPeriod).map((c) => c.low));
  const tenkan = (tenkanHigh + tenkanLow) / 2;

  // Kijun-sen (Base Line): (26-period high + 26-period low) / 2
  const kijunPeriod = 26;
  const kijunHigh = Math.max(...candles.slice(-kijunPeriod).map((c) => c.high));
  const kijunLow = Math.min(...candles.slice(-kijunPeriod).map((c) => c.low));
  const kijun = (kijunHigh + kijunLow) / 2;

  // Senkou Span A: (Tenkan-sen + Kijun-sen) / 2, plotted 26 periods ahead
  const senkouA = (tenkan + kijun) / 2;

  // Senkou Span B: (52-period high + 52-period low) / 2, plotted 26 periods ahead
  const senkouBPeriod = 52;
  const senkouBHigh = Math.max(...candles.slice(-senkouBPeriod).map((c) => c.high));
  const senkouBLow = Math.min(...candles.slice(-senkouBPeriod).map((c) => c.low));
  const senkouB = (senkouBHigh + senkouBLow) / 2;

  // Chikou Span: Current close, plotted 26 periods behind
  const chikou = candles[candles.length - 1].close;

  // Determina sinal
  const currentPrice = candles[candles.length - 1].close;
  let signal = 'NEUTRAL';

  // Bullish: preço acima da nuvem e Tenkan > Kijun
  if (currentPrice > Math.max(senkouA, senkouB) && tenkan > kijun) {
    signal = 'BULLISH';
  }
  // Bearish: preço abaixo da nuvem e Tenkan < Kijun
  else if (currentPrice < Math.min(senkouA, senkouB) && tenkan < kijun) {
    signal = 'BEARISH';
  }

  return {
    tenkan,
    kijun,
    senkouA,
    senkouB,
    chikou,
    signal,
  };
}

/**
 * Calcula Stochastic RSI
 */
export function calculateStochasticRSI(candles, period = 14) {
  if (candles.length < period + 1) {
    return { k: 50, d: 50, signal: 'NEUTRAL' };
  }

  // Primeiro calcula RSI
  const closes = candles.map((c) => c.close);
  const rsiValues = [];

  for (let i = period; i < closes.length; i++) {
    const slice = closes.slice(i - period, i);
    let gains = 0;
    let losses = 0;

    for (let j = 1; j < slice.length; j++) {
      const change = slice[j] - slice[j - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    rsiValues.push(rsi);
  }

  if (rsiValues.length < 14) {
    return { k: 50, d: 50, signal: 'NEUTRAL' };
  }

  // Calcula Stochastic do RSI
  const rsiPeriod = 14;
  const recentRSI = rsiValues.slice(-rsiPeriod);
  const maxRSI = Math.max(...recentRSI);
  const minRSI = Math.min(...recentRSI);
  const currentRSI = rsiValues[rsiValues.length - 1];

  const k = maxRSI === minRSI ? 50 : ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100;

  // %D é a média móvel de 3 períodos do %K
  const kValues = [];
  for (let i = rsiValues.length - 3; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(Math.max(0, i - rsiPeriod), i);
    const max = Math.max(...slice);
    const min = Math.min(...slice);
    const rsi = rsiValues[i];
    kValues.push(max === min ? 50 : ((rsi - min) / (max - min)) * 100);
  }
  const d = kValues.reduce((a, b) => a + b, 0) / kValues.length;

  // Determina sinal
  let signal = 'NEUTRAL';
  if (k < 20 && k > d) signal = 'BULLISH'; // Oversold e cruzando para cima
  else if (k > 80 && k < d) signal = 'BEARISH'; // Overbought e cruzando para baixo

  return { k, d, signal };
}

/**
 * Calcula ADX (Average Directional Index)
 */
export function calculateADX(candles, period = 14) {
  if (candles.length < period + 1) {
    return { adx: 0, plusDI: 0, minusDI: 0, trend: 'WEAK' };
  }

  const tr = [];
  const plusDM = [];
  const minusDM = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    // True Range
    const trValue = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trValue);

    // Directional Movement
    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  if (tr.length < period) {
    return { adx: 0, plusDI: 0, minusDI: 0, trend: 'WEAK' };
  }

  // Smoothed TR, +DM, -DM
  const smoothTR = tr.slice(-period).reduce((a, b) => a + b, 0);
  const smoothPlusDM = plusDM.slice(-period).reduce((a, b) => a + b, 0);
  const smoothMinusDM = minusDM.slice(-period).reduce((a, b) => a + b, 0);

  // Directional Indicators
  const plusDI = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
  const minusDI = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;

  // DX
  const dx =
    plusDI + minusDI === 0 ? 0 : (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;

  // ADX (média do DX)
  const adx = dx; // Simplificado

  // Determina força da tendência
  let trend = 'WEAK';
  if (adx > 50) trend = 'VERY_STRONG';
  else if (adx > 25) trend = 'STRONG';
  else if (adx > 20) trend = 'MODERATE';

  return { adx, plusDI, minusDI, trend };
}

/**
 * Calcula OBV (On-Balance Volume)
 */
export function calculateOBV(candles) {
  if (candles.length < 2) {
    return { obv: 0, trend: 'NEUTRAL' };
  }

  let obv = 0;
  const obvValues = [0];

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      obv += candles[i].volume;
    } else if (candles[i].close < candles[i - 1].close) {
      obv -= candles[i].volume;
    }
    obvValues.push(obv);
  }

  // Determina tendência do OBV
  const recentOBV = obvValues.slice(-20);
  const obvSMA = recentOBV.reduce((a, b) => a + b, 0) / recentOBV.length;
  const currentOBV = obvValues[obvValues.length - 1];

  let trend = 'NEUTRAL';
  if (currentOBV > obvSMA * 1.1) trend = 'BULLISH';
  else if (currentOBV < obvSMA * 0.9) trend = 'BEARISH';

  return { obv: currentOBV, trend };
}

/**
 * Calcula níveis de Fibonacci Retracement
 */
export function calculateFibonacci(candles, lookback = 100) {
  if (candles.length < lookback) {
    return {
      high: 0,
      low: 0,
      levels: {},
      signal: 'NEUTRAL',
    };
  }

  const recentCandles = candles.slice(-lookback);
  const high = Math.max(...recentCandles.map((c) => c.high));
  const low = Math.min(...recentCandles.map((c) => c.low));
  const diff = high - low;

  const levels = {
    '0%': high,
    '23.6%': high - diff * 0.236,
    '38.2%': high - diff * 0.382,
    '50%': high - diff * 0.5,
    '61.8%': high - diff * 0.618,
    '78.6%': high - diff * 0.786,
    '100%': low,
  };

  const currentPrice = candles[candles.length - 1].close;

  // Determina sinal baseado em níveis de Fibonacci
  let signal = 'NEUTRAL';

  // Bullish: preço próximo de 61.8% ou 78.6% (zona de compra)
  if (
    Math.abs(currentPrice - levels['61.8%']) / currentPrice < 0.01 ||
    Math.abs(currentPrice - levels['78.6%']) / currentPrice < 0.01
  ) {
    signal = 'BULLISH';
  }
  // Bearish: preço próximo de 23.6% ou 38.2% (zona de venda)
  else if (
    Math.abs(currentPrice - levels['23.6%']) / currentPrice < 0.01 ||
    Math.abs(currentPrice - levels['38.2%']) / currentPrice < 0.01
  ) {
    signal = 'BEARISH';
  }

  return { high, low, levels, signal };
}

/**
 * Analisa todos os indicadores avançados
 */
export function analyzeAdvancedIndicators(candles) {
  return {
    ichimoku: calculateIchimoku(candles),
    stochRSI: calculateStochasticRSI(candles),
    adx: calculateADX(candles),
    obv: calculateOBV(candles),
    fibonacci: calculateFibonacci(candles),
  };
}
