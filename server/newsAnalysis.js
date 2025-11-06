import axios from 'axios';

const sentimentKeywords = {
  positive: [
    'bull', 'bullish', 'surge', 'pump', 'rally', 'gain', 'profit', 'moon',
    'rocket', 'uptrend', 'breakout', 'positive', 'good', 'great', 'excellent',
    'soar', 'jump', 'spike', 'record', 'high', 'strong', 'bullrun'
  ],
  negative: [
    'bear', 'bearish', 'crash', 'dump', 'fall', 'loss', 'decline', 'rekt',
    'liquidation', 'downtrend', 'breakdown', 'negative', 'bad', 'terrible',
    'plunge', 'collapse', 'drop', 'weak', 'fear', 'panic', 'selloff'
  ]
};

async function fetchCryptoNews(symbol) {
  try {
    const response = await axios.get('https://cryptopanic.com/api/v1/posts/', {
      params: {
        auth_token: process.env.CRYPTOPANIC_API_KEY || 'demo',
        kind: 'news',
        filter: 'important',
        currencies: symbol.replace('USDT', '').toLowerCase()
      },
      timeout: 5000
    });

    return response.data.results || [];
  } catch (error) {
    console.log(`Erro ao buscar notícias para ${symbol}:`, error.message);
    return [];
  }
}

function analyzeSentiment(text) {
  if (!text) return { score: 0, sentiment: 'neutral' };

  const lowerText = text.toLowerCase();
  let positiveCount = 0;
  let negativeCount = 0;

  sentimentKeywords.positive.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) positiveCount += matches.length;
  });

  sentimentKeywords.negative.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) negativeCount += matches.length;
  });

  const total = positiveCount + negativeCount;
  let score = 0;

  if (total > 0) {
    score = ((positiveCount - negativeCount) / total) * 100;
  }

  let sentiment = 'neutral';
  if (score > 20) sentiment = 'positive';
  else if (score < -20) sentiment = 'negative';

  return {
    score: Math.round(score),
    sentiment,
    positiveCount,
    negativeCount,
    confidence: Math.min(100, (total / 10) * 100)
  };
}

async function analyzeSymbolNews(symbol) {
  try {
    const news = await fetchCryptoNews(symbol);

    if (news.length === 0) {
      return {
        symbol,
        sentiment: 'neutral',
        score: 0,
        newsCount: 0,
        impact: 0
      };
    }

    const sentiments = news.slice(0, 10).map(article => {
      const text = `${article.title} ${article.body || ''}`;
      return analyzeSentiment(text);
    });

    const averageScore = Math.round(
      sentiments.reduce((sum, s) => sum + s.score, 0) / sentiments.length
    );

    const averageConfidence = Math.round(
      sentiments.reduce((sum, s) => sum + s.confidence, 0) / sentiments.length
    );

    let sentiment = 'neutral';
    if (averageScore > 20) sentiment = 'positive';
    else if (averageScore < -20) sentiment = 'negative';

    const impact = Math.abs(averageScore);

    return {
      symbol,
      sentiment,
      score: averageScore,
      confidence: averageConfidence,
      newsCount: news.length,
      impact,
      news: news.slice(0, 5).map(n => ({
        title: n.title,
        url: n.url,
        published: n.published_at
      }))
    };
  } catch (error) {
    console.error(`Erro ao analisar notícias de ${symbol}:`, error);
    return {
      symbol,
      sentiment: 'neutral',
      score: 0,
      confidence: 0,
      newsCount: 0,
      impact: 0,
      error: error.message
    };
  }
}

function adjustConfidenceByNews(signalConfidence, newsSentiment) {
  let adjustment = 0;

  if (newsSentiment.sentiment === 'positive') {
    adjustment = (newsSentiment.impact / 100) * 25;
  } else if (newsSentiment.sentiment === 'negative') {
    adjustment = -(newsSentiment.impact / 100) * 25;
  }

  const adjustedConfidence = Math.max(0, Math.min(100, signalConfidence + adjustment));

  return {
    original: signalConfidence,
    adjusted: Math.round(adjustedConfidence),
    adjustment: Math.round(adjustment),
    reason: `Sentimento ${newsSentiment.sentiment}: ${newsSentiment.score > 0 ? '+' : ''}${newsSentiment.score}`
  };
}

async function analyzeMultipleSymbols(symbols) {
  const results = await Promise.all(
    symbols.map(symbol => analyzeSymbolNews(symbol))
  );

  return results;
}

export default {
  fetchCryptoNews,
  analyzeSentiment,
  analyzeSymbolNews,
  adjustConfidenceByNews,
  analyzeMultipleSymbols
};
