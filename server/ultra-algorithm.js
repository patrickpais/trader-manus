// Algoritmo Ultra-Avançado de Trading
// Combina: Indicadores Técnicos + Sentimento + Volume + Order Flow

import { analyzeIndicators } from './indicators.js';
import { analyzeAdvancedIndicators } from './advanced-indicators.js';
import { analyzeCombinedSentiment, adjustConfidenceWithSentiment } from './sentiment-analysis.js';
import { analyzeCompleteVolume } from './volume-analysis.js';
import { predictPrice } from './lstm.js';

/**
 * Gera sinal de trading ultra-avançado
 */
export function generateUltraTradingSignal(symbol, candles) {
  // 1. Indicadores básicos
  const basicIndicators = analyzeIndicators(candles);
  basicIndicators.price = candles[candles.length - 1].close;

  // 2. Indicadores avançados
  const advancedIndicators = analyzeAdvancedIndicators(candles);

  // 3. Análise de sentimento
  const sentiment = analyzeCombinedSentiment(symbol);

  // 4. Análise de volume
  const volumeAnalysis = analyzeCompleteVolume(candles);

  // 5. Predição de IA
  const closes = candles.map((c) => c.close);
  const prediction = predictPrice(closes);

  // === SISTEMA DE PONTUAÇÃO ===
  let bullishScore = 0;
  let bearishScore = 0;
  const reasons = [];

  // === INDICADORES BÁSICOS (peso 2 cada) ===

  // RSI
  if (basicIndicators.rsi < 30) {
    bullishScore += 2;
    reasons.push('RSI sobrevendido (< 30)');
  } else if (basicIndicators.rsi > 70) {
    bearishScore += 2;
    reasons.push('RSI sobrecomprado (> 70)');
  } else if (basicIndicators.rsi < 40) {
    bullishScore += 1;
    reasons.push('RSI favorável para compra');
  } else if (basicIndicators.rsi > 60) {
    bearishScore += 1;
    reasons.push('RSI favorável para venda');
  }

  // MACD
  if (basicIndicators.macd.histogram > 0 && basicIndicators.macd.macd > basicIndicators.macd.signal) {
    bullishScore += 2;
    reasons.push('MACD bullish');
  } else if (basicIndicators.macd.histogram < 0 && basicIndicators.macd.macd < basicIndicators.macd.signal) {
    bearishScore += 2;
    reasons.push('MACD bearish');
  }

  // Bollinger Bands
  if (basicIndicators.price < basicIndicators.bollinger.lower) {
    bullishScore += 2;
    reasons.push('Preço abaixo Bollinger inferior');
  } else if (basicIndicators.price > basicIndicators.bollinger.upper) {
    bearishScore += 2;
    reasons.push('Preço acima Bollinger superior');
  }

  // === INDICADORES AVANÇADOS (peso 3 cada) ===

  // Ichimoku
  if (advancedIndicators.ichimoku.signal === 'BULLISH') {
    bullishScore += 3;
    reasons.push('Ichimoku bullish');
  } else if (advancedIndicators.ichimoku.signal === 'BEARISH') {
    bearishScore += 3;
    reasons.push('Ichimoku bearish');
  }

  // Stochastic RSI
  if (advancedIndicators.stochRSI.signal === 'BULLISH') {
    bullishScore += 3;
    reasons.push('Stochastic RSI bullish');
  } else if (advancedIndicators.stochRSI.signal === 'BEARISH') {
    bearishScore += 3;
    reasons.push('Stochastic RSI bearish');
  }

  // ADX (força da tendência)
  if (advancedIndicators.adx.trend === 'STRONG' || advancedIndicators.adx.trend === 'VERY_STRONG') {
    if (advancedIndicators.adx.plusDI > advancedIndicators.adx.minusDI) {
      bullishScore += 3;
      reasons.push('ADX: tendência de alta forte');
    } else {
      bearishScore += 3;
      reasons.push('ADX: tendência de baixa forte');
    }
  }

  // OBV
  if (advancedIndicators.obv.trend === 'BULLISH') {
    bullishScore += 2;
    reasons.push('OBV bullish');
  } else if (advancedIndicators.obv.trend === 'BEARISH') {
    bearishScore += 2;
    reasons.push('OBV bearish');
  }

  // Fibonacci
  if (advancedIndicators.fibonacci.signal === 'BULLISH') {
    bullishScore += 2;
    reasons.push('Fibonacci: zona de compra');
  } else if (advancedIndicators.fibonacci.signal === 'BEARISH') {
    bearishScore += 2;
    reasons.push('Fibonacci: zona de venda');
  }

  // === ANÁLISE DE VOLUME (peso 3 cada) ===

  // Volume Profile
  if (volumeAnalysis.profile.signal === 'BULLISH') {
    bullishScore += 3;
    reasons.push('Volume Profile bullish');
  } else if (volumeAnalysis.profile.signal === 'BEARISH') {
    bearishScore += 3;
    reasons.push('Volume Profile bearish');
  }

  // Order Flow
  if (volumeAnalysis.orderFlow.pressure === 'STRONG_BUY' || volumeAnalysis.orderFlow.pressure === 'BUY') {
    bullishScore += 3;
    reasons.push(`Order Flow: pressão de compra (${volumeAnalysis.orderFlow.ratio.toFixed(2)}x)`);
  } else if (volumeAnalysis.orderFlow.pressure === 'STRONG_SELL' || volumeAnalysis.orderFlow.pressure === 'SELL') {
    bearishScore += 3;
    reasons.push(`Order Flow: pressão de venda (${volumeAnalysis.orderFlow.ratio.toFixed(2)}x)`);
  }

  // Suporte/Resistência
  if (volumeAnalysis.supportResistance.signal === 'NEAR_SUPPORT') {
    bullishScore += 2;
    reasons.push('Próximo de suporte');
  } else if (volumeAnalysis.supportResistance.signal === 'NEAR_RESISTANCE') {
    bearishScore += 2;
    reasons.push('Próximo de resistência');
  }

  // === SENTIMENTO (peso 4) ===
  if (sentiment.overall === 'very_positive') {
    bullishScore += 4;
    reasons.push('Sentimento muito positivo');
  } else if (sentiment.overall === 'positive') {
    bullishScore += 3;
    reasons.push('Sentimento positivo');
  } else if (sentiment.overall === 'very_negative') {
    bearishScore += 4;
    reasons.push('Sentimento muito negativo');
  } else if (sentiment.overall === 'negative') {
    bearishScore += 3;
    reasons.push('Sentimento negativo');
  }

  // === PREDIÇÃO DE IA (peso 3) ===
  if (prediction.direction === 'bullish' && prediction.confidence > 60) {
    bullishScore += 3;
    reasons.push('IA prevê alta');
  } else if (prediction.direction === 'bearish' && prediction.confidence > 60) {
    bearishScore += 3;
    reasons.push('IA prevê baixa');
  }

  // === FILTROS DE QUALIDADE ===

  // Filtro 1: Liquidez mínima
  if (volumeAnalysis.liquidity.score < 40) {
    return {
      signal: 'HOLD',
      confidence: 20,
      reason: ['Liquidez muito baixa - mercado sem volume'],
      score: 0,
      details: { bullishScore, bearishScore, sentiment, volumeAnalysis },
    };
  }

  // Filtro 2: ADX muito baixo (sem tendência)
  if (advancedIndicators.adx.trend === 'WEAK') {
    return {
      signal: 'HOLD',
      confidence: 25,
      reason: ['Sem tendência clara - ADX muito baixo'],
      score: 0,
      details: { bullishScore, bearishScore, sentiment, volumeAnalysis },
    };
  }

  // === DECISÃO FINAL ===

  // Pontuação máxima possível: ~40 pontos
  // Threshold: 12 pontos (30% dos pontos)
  const minScore = 12;

  let signal = 'HOLD';
  let baseConfidence = 50;
  let score = 0;

  if (bullishScore >= minScore && bullishScore > bearishScore + 3) {
    signal = 'BUY';
    score = bullishScore;
    baseConfidence = Math.min(95, 40 + bullishScore * 2);
  } else if (bearishScore >= minScore && bearishScore > bullishScore + 3) {
    signal = 'SELL';
    score = bearishScore;
    baseConfidence = Math.min(95, 40 + bearishScore * 2);
  } else {
    signal = 'HOLD';
    baseConfidence = 30;
    reasons.push('Sinais insuficientes ou conflitantes');
    score = Math.max(bullishScore, bearishScore);
  }

  // Ajusta confiança com sentimento
  const confidenceAdjustment = adjustConfidenceWithSentiment(baseConfidence, sentiment);

  return {
    signal,
    confidence: Math.round(confidenceAdjustment.adjusted),
    reason: reasons,
    score,
    details: {
      bullishScore,
      bearishScore,
      basicIndicators,
      advancedIndicators,
      sentiment,
      volumeAnalysis,
      prediction,
      confidenceAdjustment,
    },
  };
}

/**
 * Calcula Stop Loss e Take Profit ultra-dinâmicos
 */
export function calculateUltraSLTP(entryPrice, side, indicators, volumeAnalysis, leverage) {
  const { atr } = indicators;
  const { supportResistance } = volumeAnalysis;

  // Base: 2x ATR para SL, 4x ATR para TP
  let stopLossDistance = atr * 2;
  let takeProfitDistance = atr * 4;

  // Ajusta baseado em suporte/resistência
  if (side === 'Buy') {
    // Se há suporte próximo, usa ele como SL
    if (supportResistance.nearestSupport > 0) {
      const distanceToSupport = entryPrice - supportResistance.nearestSupport;
      if (distanceToSupport < stopLossDistance && distanceToSupport > atr) {
        stopLossDistance = distanceToSupport;
      }
    }

    // Se há resistência próxima, usa ela como TP
    if (supportResistance.nearestResistance > 0) {
      const distanceToResistance = supportResistance.nearestResistance - entryPrice;
      if (distanceToResistance > takeProfitDistance * 0.5) {
        takeProfitDistance = distanceToResistance;
      }
    }

    return {
      stopLoss: entryPrice - stopLossDistance,
      takeProfit: entryPrice + takeProfitDistance,
      riskReward: takeProfitDistance / stopLossDistance,
    };
  } else {
    // SELL
    if (supportResistance.nearestResistance > 0) {
      const distanceToResistance = supportResistance.nearestResistance - entryPrice;
      if (distanceToResistance < stopLossDistance && distanceToResistance > atr) {
        stopLossDistance = distanceToResistance;
      }
    }

    if (supportResistance.nearestSupport > 0) {
      const distanceToSupport = entryPrice - supportResistance.nearestSupport;
      if (distanceToSupport > takeProfitDistance * 0.5) {
        takeProfitDistance = distanceToSupport;
      }
    }

    return {
      stopLoss: entryPrice + stopLossDistance,
      takeProfit: entryPrice - takeProfitDistance,
      riskReward: takeProfitDistance / stopLossDistance,
    };
  }
}
