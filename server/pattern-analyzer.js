/**
 * Pattern Analyzer - Analisa padrões de trades para aprendizado
 * Usa dados do banco SQLite para identificar o que funciona e o que não funciona
 */

const tradeDB = require('./trade-database');

/**
 * Analisa padrões de trades vencedores vs perdedores
 */
function analyzeWinningPatterns() {
  try {
    console.log('[Pattern] Analisando padrões de trades vencedores...');
    
    const winningTrades = tradeDB.getWinningTrades();
    const losingTrades = tradeDB.getLosingTrades();
    
    if (winningTrades.length === 0 && losingTrades.length === 0) {
      console.log('[Pattern] Sem trades suficientes para análise');
      return {
        status: 'insufficient_data',
        message: 'Aguardando mais trades para análise de padrões',
        totalTrades: 0,
      };
    }
    
    console.log(`[Pattern] Analisando ${winningTrades.length} trades vencedores e ${losingTrades.length} perdedores`);
    
    // Análise de indicadores de entrada
    const winningEntryPatterns = analyzeEntryIndicators(winningTrades);
    const losingEntryPatterns = analyzeEntryIndicators(losingTrades);
    
    // Análise de condições de mercado
    const winningMarketConditions = analyzeMarketConditions(winningTrades);
    const losingMarketConditions = analyzeMarketConditions(losingTrades);
    
    // Análise de timing
    const winningTiming = analyzeTradeTimings(winningTrades);
    const losingTiming = analyzeTradeTimings(losingTrades);
    
    // Gera recomendações
    const recommendations = generateRecommendations(
      winningEntryPatterns,
      losingEntryPatterns,
      winningMarketConditions,
      losingMarketConditions
    );
    
    const analysis = {
      status: 'success',
      totalTrades: winningTrades.length + losingTrades.length,
      winRate: (winningTrades.length / (winningTrades.length + losingTrades.length) * 100).toFixed(2),
      winningPatterns: {
        entry: winningEntryPatterns,
        market: winningMarketConditions,
        timing: winningTiming,
      },
      losingPatterns: {
        entry: losingEntryPatterns,
        market: losingMarketConditions,
        timing: losingTiming,
      },
      recommendations,
      timestamp: new Date().toISOString(),
    };
    
    console.log('[Pattern] ✅ Análise de padrões concluída');
    console.log(`[Pattern] Win Rate: ${analysis.winRate}%`);
    console.log(`[Pattern] Recomendações: ${recommendations.length}`);
    
    return analysis;
  } catch (error) {
    console.error('[Pattern] Erro ao analisar padrões:', error);
    return {
      status: 'error',
      message: error.message,
    };
  }
}

/**
 * Analisa indicadores de entrada
 */
function analyzeEntryIndicators(trades) {
  if (trades.length === 0) return {};
  
  const patterns = {
    avgRSI: 0,
    avgMACD: 0,
    avgVolumeRatio: 0,
    avgConfidence: 0,
    trendDistribution: { bullish: 0, bearish: 0, neutral: 0 },
    commonReasons: {},
  };
  
  let rsiSum = 0, macdSum = 0, volumeSum = 0, confidenceSum = 0;
  
  for (const trade of trades) {
    // RSI
    if (trade.entry_rsi) rsiSum += trade.entry_rsi;
    
    // MACD
    if (trade.entry_macd) macdSum += trade.entry_macd;
    
    // Volume
    if (trade.entry_volume_ratio) volumeSum += trade.entry_volume_ratio;
    
    // Confidence
    if (trade.entry_confidence) confidenceSum += trade.entry_confidence;
    
    // Trend
    if (trade.entry_trend) {
      patterns.trendDistribution[trade.entry_trend] = 
        (patterns.trendDistribution[trade.entry_trend] || 0) + 1;
    }
    
    // Reasons (parse JSON)
    if (trade.entry_reasons) {
      try {
        const reasons = JSON.parse(trade.entry_reasons);
        for (const reason of reasons) {
          patterns.commonReasons[reason] = (patterns.commonReasons[reason] || 0) + 1;
        }
      } catch (err) {
        // Ignora erros de parse
      }
    }
  }
  
  const count = trades.length;
  patterns.avgRSI = (rsiSum / count).toFixed(2);
  patterns.avgMACD = (macdSum / count).toFixed(4);
  patterns.avgVolumeRatio = (volumeSum / count).toFixed(2);
  patterns.avgConfidence = (confidenceSum / count).toFixed(2);
  
  // Ordena reasons por frequência
  patterns.topReasons = Object.entries(patterns.commonReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));
  
  return patterns;
}

/**
 * Analisa condições de mercado
 */
function analyzeMarketConditions(trades) {
  if (trades.length === 0) return {};
  
  const conditions = {
    avgVolatility: 0,
    sideDistribution: { Buy: 0, Sell: 0 },
    symbolDistribution: {},
  };
  
  let volatilitySum = 0;
  
  for (const trade of trades) {
    // Volatility
    if (trade.entry_volatility) volatilitySum += trade.entry_volatility;
    
    // Side
    if (trade.side) {
      conditions.sideDistribution[trade.side] = 
        (conditions.sideDistribution[trade.side] || 0) + 1;
    }
    
    // Symbol
    if (trade.symbol) {
      conditions.symbolDistribution[trade.symbol] = 
        (conditions.symbolDistribution[trade.symbol] || 0) + 1;
    }
  }
  
  const count = trades.length;
  conditions.avgVolatility = (volatilitySum / count).toFixed(4);
  
  // Top símbolos
  conditions.topSymbols = Object.entries(conditions.symbolDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([symbol, count]) => ({ symbol, count }));
  
  return conditions;
}

/**
 * Analisa timing dos trades
 */
function analyzeTradeTimings(trades) {
  if (trades.length === 0) return {};
  
  const timing = {
    avgDuration: 0,
    exitReasonDistribution: {},
  };
  
  let durationSum = 0;
  let durationCount = 0;
  
  for (const trade of trades) {
    // Duration
    if (trade.duration_minutes) {
      durationSum += trade.duration_minutes;
      durationCount++;
    }
    
    // Exit reason
    if (trade.exit_reason) {
      timing.exitReasonDistribution[trade.exit_reason] = 
        (timing.exitReasonDistribution[trade.exit_reason] || 0) + 1;
    }
  }
  
  if (durationCount > 0) {
    timing.avgDuration = Math.round(durationSum / durationCount);
  }
  
  return timing;
}

/**
 * Gera recomendações baseadas nos padrões
 */
function generateRecommendations(winEntry, loseEntry, winMarket, loseMarket) {
  const recommendations = [];
  
  // RSI
  if (winEntry.avgRSI && loseEntry.avgRSI) {
    const rsiDiff = Math.abs(winEntry.avgRSI - loseEntry.avgRSI);
    if (rsiDiff > 10) {
      recommendations.push({
        type: 'indicator',
        priority: 'high',
        indicator: 'RSI',
        message: `Trades vencedores têm RSI médio de ${winEntry.avgRSI} vs ${loseEntry.avgRSI} em perdedores. Ajustar filtro de RSI.`,
        suggestedRange: winEntry.avgRSI > loseEntry.avgRSI 
          ? [parseFloat(winEntry.avgRSI) - 10, parseFloat(winEntry.avgRSI) + 10]
          : [parseFloat(loseEntry.avgRSI) - 10, parseFloat(loseEntry.avgRSI) + 10],
      });
    }
  }
  
  // Confidence
  if (winEntry.avgConfidence && loseEntry.avgConfidence) {
    const confDiff = winEntry.avgConfidence - loseEntry.avgConfidence;
    if (confDiff > 5) {
      recommendations.push({
        type: 'threshold',
        priority: 'high',
        parameter: 'confidence_threshold',
        message: `Trades vencedores têm confiança média de ${winEntry.avgConfidence}% vs ${loseEntry.avgConfidence}% em perdedores. Aumentar threshold mínimo.`,
        suggestedValue: Math.max(70, parseFloat(winEntry.avgConfidence) - 5),
      });
    }
  }
  
  // Trend
  if (winEntry.trendDistribution && loseEntry.trendDistribution) {
    const winTrend = Object.entries(winEntry.trendDistribution).sort((a, b) => b[1] - a[1])[0];
    const loseTrend = Object.entries(loseEntry.trendDistribution).sort((a, b) => b[1] - a[1])[0];
    
    if (winTrend && loseTrend && winTrend[0] !== loseTrend[0]) {
      recommendations.push({
        type: 'strategy',
        priority: 'medium',
        parameter: 'trend_preference',
        message: `Trades vencedores são predominantemente ${winTrend[0]} (${winTrend[1]} trades), enquanto perdedores são ${loseTrend[0]} (${loseTrend[1]} trades). Focar em tendências ${winTrend[0]}.`,
        suggestedValue: winTrend[0],
      });
    }
  }
  
  // Volume
  if (winEntry.avgVolumeRatio && loseEntry.avgVolumeRatio) {
    const volDiff = winEntry.avgVolumeRatio - loseEntry.avgVolumeRatio;
    if (Math.abs(volDiff) > 0.5) {
      recommendations.push({
        type: 'indicator',
        priority: 'medium',
        indicator: 'volume_ratio',
        message: `Volume ratio médio em vencedores: ${winEntry.avgVolumeRatio}x vs ${loseEntry.avgVolumeRatio}x em perdedores. ${volDiff > 0 ? 'Priorizar' : 'Evitar'} trades com volume alto.`,
        suggestedMinimum: volDiff > 0 ? parseFloat(winEntry.avgVolumeRatio) * 0.8 : null,
      });
    }
  }
  
  // Symbols
  if (winMarket.topSymbols && loseMarket.topSymbols) {
    const winSymbols = winMarket.topSymbols.map(s => s.symbol);
    const loseSymbols = loseMarket.topSymbols.map(s => s.symbol);
    
    const goodSymbols = winSymbols.filter(s => !loseSymbols.includes(s));
    const badSymbols = loseSymbols.filter(s => !winSymbols.includes(s));
    
    if (goodSymbols.length > 0) {
      recommendations.push({
        type: 'asset',
        priority: 'low',
        parameter: 'preferred_symbols',
        message: `Símbolos com melhor performance: ${goodSymbols.join(', ')}`,
        suggestedValue: goodSymbols,
      });
    }
    
    if (badSymbols.length > 0) {
      recommendations.push({
        type: 'asset',
        priority: 'low',
        parameter: 'avoid_symbols',
        message: `Símbolos com pior performance: ${badSymbols.join(', ')}`,
        suggestedValue: badSymbols,
      });
    }
  }
  
  return recommendations;
}

/**
 * Obtém estatísticas gerais de performance
 */
function getPerformanceStats() {
  try {
    const recentTrades = tradeDB.getRecentTrades(30); // Últimos 30 dias
    
    if (recentTrades.length === 0) {
      return {
        status: 'no_data',
        message: 'Sem trades nos últimos 30 dias',
      };
    }
    
    const winners = recentTrades.filter(t => t.pnl > 0);
    const losers = recentTrades.filter(t => t.pnl < 0);
    
    const totalPnl = recentTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgPnl = totalPnl / recentTrades.length;
    const winRate = (winners.length / recentTrades.length * 100).toFixed(2);
    
    const avgWinAmount = winners.length > 0 
      ? winners.reduce((sum, t) => sum + t.pnl, 0) / winners.length 
      : 0;
    const avgLossAmount = losers.length > 0 
      ? losers.reduce((sum, t) => sum + t.pnl, 0) / losers.length 
      : 0;
    
    const profitFactor = avgLossAmount !== 0 
      ? Math.abs(avgWinAmount / avgLossAmount) 
      : 0;
    
    return {
      status: 'success',
      period: '30 days',
      totalTrades: recentTrades.length,
      winners: winners.length,
      losers: losers.length,
      winRate: parseFloat(winRate),
      totalPnl: totalPnl.toFixed(2),
      avgPnl: avgPnl.toFixed(2),
      avgWin: avgWinAmount.toFixed(2),
      avgLoss: avgLossAmount.toFixed(2),
      profitFactor: profitFactor.toFixed(2),
      bestTrade: recentTrades.reduce((best, t) => t.pnl > best.pnl ? t : best, recentTrades[0]),
      worstTrade: recentTrades.reduce((worst, t) => t.pnl < worst.pnl ? t : worst, recentTrades[0]),
    };
  } catch (error) {
    console.error('[Pattern] Erro ao obter estatísticas:', error);
    return {
      status: 'error',
      message: error.message,
    };
  }
}

module.exports = {
  analyzeWinningPatterns,
  getPerformanceStats,
};
