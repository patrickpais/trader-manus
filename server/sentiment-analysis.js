// Análise de Sentimento - Notícias e Redes Sociais

/**
 * Simula análise de sentimento de notícias
 * (Em produção, usaria CryptoPanic API ou similar)
 */
export function analyzeNewsSentiment(symbol) {
  // Remove "USDT" do símbolo
  const coin = symbol.replace('USDT', '');

  // Simula busca de notícias e análise de sentimento
  // Em produção, faria requisição real para API de notícias

  // Gera sentimento aleatório ponderado (mais neutro)
  const rand = Math.random();
  let sentiment = 'neutral';
  let score = 0;
  let confidence = 50;

  if (rand < 0.2) {
    // 20% chance de muito positivo
    sentiment = 'very_positive';
    score = 80 + Math.random() * 20;
    confidence = 75 + Math.random() * 25;
  } else if (rand < 0.4) {
    // 20% chance de positivo
    sentiment = 'positive';
    score = 60 + Math.random() * 20;
    confidence = 60 + Math.random() * 20;
  } else if (rand < 0.6) {
    // 20% chance de neutro
    sentiment = 'neutral';
    score = 40 + Math.random() * 20;
    confidence = 40 + Math.random() * 20;
  } else if (rand < 0.8) {
    // 20% chance de negativo
    sentiment = 'negative';
    score = 20 + Math.random() * 20;
    confidence = 60 + Math.random() * 20;
  } else {
    // 20% chance de muito negativo
    sentiment = 'very_negative';
    score = 0 + Math.random() * 20;
    confidence = 75 + Math.random() * 25;
  }

  return {
    sentiment,
    score,
    confidence,
    newsCount: Math.floor(Math.random() * 50) + 10,
    source: 'simulated',
  };
}

/**
 * Simula análise de sentimento de redes sociais
 * (Em produção, usaria Twitter API, Reddit API, etc.)
 */
export function analyzeSocialSentiment(symbol) {
  const coin = symbol.replace('USDT', '');

  // Simula análise de redes sociais
  const rand = Math.random();
  let sentiment = 'neutral';
  let score = 50;
  let engagement = 0;

  if (rand < 0.25) {
    sentiment = 'bullish';
    score = 60 + Math.random() * 40;
    engagement = 5000 + Math.random() * 10000;
  } else if (rand < 0.5) {
    sentiment = 'bearish';
    score = 0 + Math.random() * 40;
    engagement = 5000 + Math.random() * 10000;
  } else {
    sentiment = 'neutral';
    score = 40 + Math.random() * 20;
    engagement = 1000 + Math.random() * 5000;
  }

  return {
    sentiment,
    score,
    engagement: Math.floor(engagement),
    mentions: Math.floor(Math.random() * 1000) + 100,
    source: 'simulated',
  };
}

/**
 * Combina análise de notícias e redes sociais
 */
export function analyzeCombinedSentiment(symbol) {
  const news = analyzeNewsSentiment(symbol);
  const social = analyzeSocialSentiment(symbol);

  // Peso: 60% notícias, 40% redes sociais
  const combinedScore = news.score * 0.6 + social.score * 0.4;

  let overallSentiment = 'neutral';
  let impact = 0;

  if (combinedScore >= 70) {
    overallSentiment = 'very_positive';
    impact = 15; // +15% na confiança
  } else if (combinedScore >= 55) {
    overallSentiment = 'positive';
    impact = 10; // +10% na confiança
  } else if (combinedScore >= 45) {
    overallSentiment = 'neutral';
    impact = 0; // Sem impacto
  } else if (combinedScore >= 30) {
    overallSentiment = 'negative';
    impact = -10; // -10% na confiança
  } else {
    overallSentiment = 'very_negative';
    impact = -15; // -15% na confiança
  }

  return {
    overall: overallSentiment,
    score: combinedScore,
    impact,
    news,
    social,
    confidence: (news.confidence + social.score) / 2,
  };
}

/**
 * Ajusta confiança do sinal baseado em sentimento
 */
export function adjustConfidenceWithSentiment(baseConfidence, sentiment) {
  let adjusted = baseConfidence + sentiment.impact;

  // Limita entre 0 e 100
  adjusted = Math.max(0, Math.min(100, adjusted));

  return {
    original: baseConfidence,
    adjusted,
    sentimentImpact: sentiment.impact,
    sentimentScore: sentiment.score,
  };
}
