// Algoritmo Avançado de Trading com Múltiplos Filtros

import { predictPrice, calculateConfidenceScore } from './lstm.js';

/**
 * Detecta tendência forte
 */
function detectTrend(indicators) {
  const { sma20, sma50, ema20, price } = indicators;
  
  // Tendência de alta forte
  if (sma20 > sma50 && price > sma20 && ema20 > sma20) {
    return { trend: 'strong_bull', strength: 3 };
  }
  
  // Tendência de alta moderada
  if (sma20 > sma50 && price > sma20) {
    return { trend: 'bull', strength: 2 };
  }
  
  // Tendência de baixa forte
  if (sma20 < sma50 && price < sma20 && ema20 < sma20) {
    return { trend: 'strong_bear', strength: 3 };
  }
  
  // Tendência de baixa moderada
  if (sma20 < sma50 && price < sma20) {
    return { trend: 'bear', strength: 2 };
  }
  
  // Sem tendência clara
  return { trend: 'neutral', strength: 0 };
}

/**
 * Analisa volume
 */
function analyzeVolume(candles) {
  if (candles.length < 20) return { volumeStrength: 0, volumeTrend: 'neutral' };
  
  const recentVolumes = candles.slice(-20).map(c => c.volume);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const currentVolume = candles[candles.length - 1].volume;
  
  const volumeRatio = currentVolume / avgVolume;
  
  // Volume forte (acima de 1.5x a média)
  if (volumeRatio > 1.5) {
    return { volumeStrength: 3, volumeTrend: 'increasing' };
  }
  
  // Volume moderado (acima de 1.2x a média)
  if (volumeRatio > 1.2) {
    return { volumeStrength: 2, volumeTrend: 'increasing' };
  }
  
  // Volume fraco (abaixo de 0.8x a média)
  if (volumeRatio < 0.8) {
    return { volumeStrength: -1, volumeTrend: 'decreasing' };
  }
  
  return { volumeStrength: 1, volumeTrend: 'normal' };
}

/**
 * Calcula volatilidade
 */
function calculateVolatility(candles) {
  if (candles.length < 20) return 0;
  
  const returns = [];
  for (let i = 1; i < candles.length; i++) {
    const ret = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
    returns.push(ret);
  }
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance);
  
  return volatility;
}

/**
 * Verifica divergência RSI
 */
function checkRSIDivergence(candles, rsiValues) {
  if (candles.length < 10 || rsiValues.length < 10) return { divergence: 'none', strength: 0 };
  
  const recentCandles = candles.slice(-10);
  const recentRSI = rsiValues.slice(-10);
  
  // Divergência bullish: preço fazendo mínimas mais baixas, RSI fazendo mínimas mais altas
  const priceMin1 = Math.min(...recentCandles.slice(0, 5).map(c => c.low));
  const priceMin2 = Math.min(...recentCandles.slice(5, 10).map(c => c.low));
  const rsiMin1 = Math.min(...recentRSI.slice(0, 5));
  const rsiMin2 = Math.min(...recentRSI.slice(5, 10));
  
  if (priceMin2 < priceMin1 && rsiMin2 > rsiMin1) {
    return { divergence: 'bullish', strength: 2 };
  }
  
  // Divergência bearish: preço fazendo máximas mais altas, RSI fazendo máximas mais baixas
  const priceMax1 = Math.max(...recentCandles.slice(0, 5).map(c => c.high));
  const priceMax2 = Math.max(...recentCandles.slice(5, 10).map(c => c.high));
  const rsiMax1 = Math.max(...recentRSI.slice(0, 5));
  const rsiMax2 = Math.max(...recentRSI.slice(5, 10));
  
  if (priceMax2 > priceMax1 && rsiMax2 < rsiMax1) {
    return { divergence: 'bearish', strength: 2 };
  }
  
  return { divergence: 'none', strength: 0 };
}

/**
 * Gera sinal de trading avançado
 */
export function generateAdvancedTradingSignal(candles, indicators, prediction) {
  let signal = 'HOLD';
  let confidence = 50;
  let reason = [];
  let score = 0;
  
  const { rsi, macd, bollinger, price, sma20, sma50, ema20, atr } = indicators;
  
  // 1. Detecta tendência
  const trendAnalysis = detectTrend(indicators);
  
  // 2. Analisa volume
  const volumeAnalysis = analyzeVolume(candles);
  
  // 3. Calcula volatilidade
  const volatility = calculateVolatility(candles);
  
  // 4. Verifica divergência RSI (precisa de array de RSI histórico)
  // Por enquanto vamos usar apenas o RSI atual
  
  // === FILTROS DE QUALIDADE ===
  
  // Filtro 1: Só opera em tendências moderadas ou fortes
  if (trendAnalysis.strength < 1) {
    return {
      signal: 'HOLD',
      confidence: 30,
      reason: ['Tendência fraca - aguardando tendência clara'],
      score: 0,
    };
  }
  
  // Filtro 2: Volatilidade muito alta = não opera
  if (volatility > 0.08) {
    return {
      signal: 'HOLD',
      confidence: 20,
      reason: ['Volatilidade muito alta - mercado instável'],
      score: 0,
    };
  }
  
  // Filtro 3: Volume muito baixo = não opera
  if (volumeAnalysis.volumeStrength < 0) {
    return {
      signal: 'HOLD',
      confidence: 25,
      reason: ['Volume muito baixo - falta confirmação'],
      score: 0,
    };
  }
  
  // === ANÁLISE DE SINAIS ===
  
  let bullishScore = 0;
  let bearishScore = 0;
  
  // Sinal 1: Tendência (peso 3)
  if (trendAnalysis.trend === 'strong_bull') {
    bullishScore += 3;
    reason.push('Tendência de alta forte');
  } else if (trendAnalysis.trend === 'bull') {
    bullishScore += 2;
    reason.push('Tendência de alta');
  } else if (trendAnalysis.trend === 'strong_bear') {
    bearishScore += 3;
    reason.push('Tendência de baixa forte');
  } else if (trendAnalysis.trend === 'bear') {
    bearishScore += 2;
    reason.push('Tendência de baixa');
  }
  
  // Sinal 2: RSI (peso 2)
  if (rsi < 30) {
    bullishScore += 2;
    reason.push('RSI sobrevendido');
  } else if (rsi > 70) {
    bearishScore += 2;
    reason.push('RSI sobrecomprado');
  } else if (rsi < 40 && trendAnalysis.trend.includes('bull')) {
    bullishScore += 1;
    reason.push('RSI favorável para compra');
  } else if (rsi > 60 && trendAnalysis.trend.includes('bear')) {
    bearishScore += 1;
    reason.push('RSI favorável para venda');
  }
  
  // Sinal 3: MACD (peso 2)
  if (macd.histogram > 0 && macd.macd > macd.signal) {
    bullishScore += 2;
    reason.push('MACD bullish');
  } else if (macd.histogram < 0 && macd.macd < macd.signal) {
    bearishScore += 2;
    reason.push('MACD bearish');
  }
  
  // Sinal 4: Bollinger Bands (peso 2)
  if (price < bollinger.lower && trendAnalysis.trend.includes('bull')) {
    bullishScore += 2;
    reason.push('Preço abaixo Bollinger inferior');
  } else if (price > bollinger.upper && trendAnalysis.trend.includes('bear')) {
    bearishScore += 2;
    reason.push('Preço acima Bollinger superior');
  }
  
  // Sinal 5: Volume (peso 2)
  if (volumeAnalysis.volumeStrength >= 2) {
    if (trendAnalysis.trend.includes('bull')) {
      bullishScore += 2;
      reason.push('Volume forte confirmando alta');
    } else if (trendAnalysis.trend.includes('bear')) {
      bearishScore += 2;
      reason.push('Volume forte confirmando baixa');
    }
  }
  
  // Sinal 6: IA/LSTM (peso 2)
  if (prediction.direction === 'bullish' && prediction.confidence > 60) {
    bullishScore += 2;
    reason.push('IA prevê alta');
  } else if (prediction.direction === 'bearish' && prediction.confidence > 60) {
    bearishScore += 2;
    reason.push('IA prevê baixa');
  }
  
  // === DECISÃO FINAL ===
  
  // Precisa de pelo menos 6 pontos (de 13 possíveis) para gerar sinal
  const minScore = 6;
  
  if (bullishScore >= minScore && bullishScore > bearishScore) {
    signal = 'BUY';
    score = bullishScore;
    confidence = Math.min(95, 50 + bullishScore * 5);
  } else if (bearishScore >= minScore && bearishScore > bullishScore) {
    signal = 'SELL';
    score = bearishScore;
    confidence = Math.min(95, 50 + bearishScore * 5);
  } else {
    signal = 'HOLD';
    confidence = 30;
    reason = ['Sinais insuficientes ou conflitantes'];
    score = Math.max(bullishScore, bearishScore);
  }
  
  return {
    signal,
    confidence,
    reason,
    score,
    details: {
      trend: trendAnalysis,
      volume: volumeAnalysis,
      volatility: volatility.toFixed(4),
      bullishScore,
      bearishScore,
    },
  };
}

/**
 * Calcula Stop Loss e Take Profit dinâmicos baseados em ATR
 */
export function calculateDynamicSLTP(entryPrice, side, atr, leverage) {
  // Stop Loss: 2x ATR
  const stopLossDistance = atr * 2;
  
  // Take Profit: 4x ATR (Risk/Reward 1:2)
  const takeProfitDistance = atr * 4;
  
  if (side === 'Buy') {
    return {
      stopLoss: entryPrice - stopLossDistance,
      takeProfit: entryPrice + takeProfitDistance,
    };
  } else {
    return {
      stopLoss: entryPrice + stopLossDistance,
      takeProfit: entryPrice - takeProfitDistance,
    };
  }
}
