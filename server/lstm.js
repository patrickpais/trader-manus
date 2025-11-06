// Modelo LSTM Simplificado para Predição de Preços

/**
 * Normaliza dados para o intervalo [0, 1]
 * @param {Array} data - Array de valores
 * @returns {Object} { normalized, min, max }
 */
function normalizeData(data) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const normalized = data.map((x) => (x - min) / range);

  return { normalized, min, max, range };
}

/**
 * Desnormaliza dados
 * @param {Number} value - Valor normalizado
 * @param {Number} min - Valor mínimo original
 * @param {Number} max - Valor máximo original
 * @returns {Number} Valor desnormalizado
 */
function denormalizeData(value, min, max) {
  const range = max - min || 1;
  return value * range + min;
}

/**
 * Calcula média móvel exponencial
 * @param {Array} data - Array de dados
 * @param {Number} alpha - Fator de suavização
 * @returns {Array} Array com EMA
 */
function calculateEMA(data, alpha = 0.3) {
  if (data.length === 0) return [];

  const ema = [data[0]];

  for (let i = 1; i < data.length; i++) {
    ema.push(alpha * data[i] + (1 - alpha) * ema[i - 1]);
  }

  return ema;
}

/**
 * Extrai features dos preços
 * @param {Array} closes - Array de preços de fechamento
 * @param {Number} lookback - Número de períodos anteriores
 * @returns {Array} Array de features
 */
function extractFeatures(closes, lookback = 60) {
  if (closes.length < lookback) return [];

  const features = [];
  const recentCloses = closes.slice(-lookback);

  // Normaliza os preços
  const { normalized } = normalizeData(recentCloses);

  // Calcula retornos
  const returns = [];
  for (let i = 1; i < normalized.length; i++) {
    returns.push(normalized[i] - normalized[i - 1]);
  }

  // Calcula volatilidade
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
    returns.length;
  const volatility = Math.sqrt(variance);

  // Calcula tendência
  const trend =
    (normalized[normalized.length - 1] - normalized[0]) / normalized.length;

  // Calcula momentum
  const momentum = returns[returns.length - 1];

  // Cria feature vector
  features.push({
    normalized,
    returns,
    volatility,
    trend,
    momentum,
    avgReturn,
  });

  return features;
}

/**
 * Prediz próximo movimento usando análise técnica
 * @param {Array} closes - Array de preços de fechamento
 * @param {Number} lookback - Número de períodos anteriores
 * @returns {Object} { prediction, confidence, direction }
 */
export function predictPrice(closes, lookback = 60) {
  if (closes.length < lookback) {
    return {
      prediction: closes[closes.length - 1],
      confidence: 0,
      direction: 'neutral',
    };
  }

  const features = extractFeatures(closes, lookback);

  if (features.length === 0) {
    return {
      prediction: closes[closes.length - 1],
      confidence: 0,
      direction: 'neutral',
    };
  }

  const {
    normalized,
    returns,
    volatility,
    trend,
    momentum,
    avgReturn,
  } = features[0];

  // Calcula sinais
  let bullishSignals = 0;
  let bearishSignals = 0;
  let confidence = 50;

  // Sinal 1: Tendência
  if (trend > 0.001) {
    bullishSignals++;
  } else if (trend < -0.001) {
    bearishSignals++;
  }

  // Sinal 2: Momentum
  if (momentum > avgReturn) {
    bullishSignals++;
  } else if (momentum < avgReturn) {
    bearishSignals++;
  }

  // Sinal 3: Retornos recentes
  const recentReturns = returns.slice(-5);
  const positiveReturns = recentReturns.filter((r) => r > 0).length;

  if (positiveReturns >= 3) {
    bullishSignals++;
  } else if (positiveReturns <= 2) {
    bearishSignals++;
  }

  // Sinal 4: Volatilidade (baixa volatilidade = mais confiança)
  if (volatility < 0.02) {
    confidence += 10;
  } else if (volatility > 0.05) {
    confidence -= 10;
  }

  // Calcula confiança
  const signalDifference = Math.abs(bullishSignals - bearishSignals);
  confidence = 50 + signalDifference * 15;
  confidence = Math.min(99, Math.max(1, confidence));

  // Predição de preço
  const currentPrice = closes[closes.length - 1];
  const expectedReturn = trend + momentum * 0.5;
  const prediction = currentPrice * (1 + expectedReturn);

  // Direção
  let direction = 'neutral';
  if (bullishSignals > bearishSignals) {
    direction = 'bullish';
  } else if (bearishSignals > bullishSignals) {
    direction = 'bearish';
  }

  return {
    prediction: Math.round(prediction * 100) / 100,
    confidence: Math.round(confidence),
    direction,
    signals: {
      bullish: bullishSignals,
      bearish: bearishSignals,
      trend,
      momentum,
      volatility,
    },
  };
}

/**
 * Prediz múltiplos períodos à frente
 * @param {Array} closes - Array de preços de fechamento
 * @param {Number} periods - Número de períodos a prever
 * @returns {Array} Array de predições
 */
export function predictMultiplePeriods(closes, periods = 5) {
  const predictions = [];
  let currentCloses = [...closes];

  for (let i = 0; i < periods; i++) {
    const pred = predictPrice(currentCloses);
    predictions.push(pred);

    // Adiciona predição ao array para próxima iteração
    currentCloses.push(pred.prediction);
  }

  return predictions;
}

/**
 * Calcula score de confiança ajustado por múltiplos fatores
 * @param {Object} indicators - Objeto com indicadores técnicos
 * @param {Object} prediction - Predição do LSTM
 * @returns {Number} Score de confiança (0-100)
 */
export function calculateConfidenceScore(indicators, prediction) {
  let score = prediction.confidence || 50;

  // Ajusta por RSI
  const rsi = indicators.rsi || 50;
  if ((rsi < 30 && prediction.direction === 'bullish') ||
      (rsi > 70 && prediction.direction === 'bearish')) {
    score += 15;
  } else if ((rsi < 30 && prediction.direction === 'bearish') ||
             (rsi > 70 && prediction.direction === 'bullish')) {
    score -= 15;
  }

  // Ajusta por MACD
  const macd = indicators.macd || {};
  if ((macd.histogram > 0 && prediction.direction === 'bullish') ||
      (macd.histogram < 0 && prediction.direction === 'bearish')) {
    score += 10;
  } else if ((macd.histogram > 0 && prediction.direction === 'bearish') ||
             (macd.histogram < 0 && prediction.direction === 'bullish')) {
    score -= 10;
  }

  // Ajusta por Bollinger Bands
  const bb = indicators.bollinger || {};
  const price = indicators.price || 0;

  if (price < bb.lower && prediction.direction === 'bullish') {
    score += 10;
  } else if (price > bb.upper && prediction.direction === 'bearish') {
    score += 10;
  }

  // Ajusta por volatilidade
  const atr = indicators.atr || 0;
  if (atr < 50) {
    score += 5; // Baixa volatilidade = mais confiança
  } else if (atr > 200) {
    score -= 10; // Alta volatilidade = menos confiança
  }

  // Limita entre 1 e 99
  return Math.min(99, Math.max(1, Math.round(score)));
}

/**
 * Gera sinal de trading baseado em todos os indicadores
 * @param {Object} indicators - Indicadores técnicos
 * @param {Object} prediction - Predição do LSTM
 * @returns {Object} { signal, confidence, reason }
 */
export function generateTradingSignal(indicators, prediction) {
  const confidence = calculateConfidenceScore(indicators, prediction);

  let signal = 'HOLD';
  let reason = [];

  const rsi = indicators.rsi || 50;
  const macd = indicators.macd || {};
  const bb = indicators.bollinger || {};
  const price = indicators.price || 0;
  const sma20 = indicators.sma20 || 0;
  const sma50 = indicators.sma50 || 0;

  // Sinal de COMPRA
  if (
    rsi < 35 &&
    macd.histogram > 0 &&
    price > sma20 &&
    prediction.direction === 'bullish' &&
    confidence > 65
  ) {
    signal = 'BUY';
    reason = [
      'RSI sobrevendido',
      'MACD positivo',
      'Acima SMA20',
      'LSTM bullish',
    ];
  }

  // Sinal de VENDA
  if (
    rsi > 65 &&
    macd.histogram < 0 &&
    price < sma20 &&
    prediction.direction === 'bearish' &&
    confidence > 65
  ) {
    signal = 'SELL';
    reason = [
      'RSI sobrecomprado',
      'MACD negativo',
      'Abaixo SMA20',
      'LSTM bearish',
    ];
  }

  return {
    signal,
    confidence,
    direction: prediction.direction,
    reason,
    indicators: {
      rsi,
      macd: macd.macd,
      price,
      sma20,
      sma50,
    },
  };
}
