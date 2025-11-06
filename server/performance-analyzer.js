// Sistema de Análise de Performance e Aprendizado Automático

import fs from 'fs';
import path from 'path';
import * as patternAnalyzer from './pattern-analyzer.js';

export class PerformanceAnalyzer {
  constructor() {
    this.learningFile = path.join(process.cwd(), 'learning-log.json');
    this.performanceFile = path.join(process.cwd(), 'performance-history.json');
    this.loadLearningData();
  }

  // Carregar dados de aprendizado
  loadLearningData() {
    try {
      if (fs.existsSync(this.learningFile)) {
        const data = fs.readFileSync(this.learningFile, 'utf8');
        this.learningData = JSON.parse(data);
      } else {
        this.learningData = {
          optimizations: [],
          disabled_coins: [],
          prioritized_coins: ['BTCUSDT', 'ETHUSDT'],
          current_parameters: {
            confidence_threshold: 70,
            stop_loss_percent: 5,
            take_profit_percent: 15,
            max_trades_per_day: 50,
            risk_per_trade: 15
          },
          coin_performance: {}
        };
      }
    } catch (error) {
      console.error('[Performance] Erro ao carregar dados de aprendizado:', error);
      this.learningData = { optimizations: [], disabled_coins: [], prioritized_coins: [], current_parameters: {}, coin_performance: {} };
    }
  }

  // Salvar dados de aprendizado
  saveLearningData() {
    try {
      fs.writeFileSync(this.learningFile, JSON.stringify(this.learningData, null, 2));
    } catch (error) {
      console.error('[Performance] Erro ao salvar dados de aprendizado:', error);
    }
  }

  // Analisar performance das últimas 24h
  async analyzeRecentPerformance(trades) {
    console.log('[Performance] Analisando performance recente...');
    
    // Adiciona análise de padrões do banco de dados
    console.log('[Performance] Analisando padrões de trades...');
    const patternAnalysis = patternAnalyzer.analyzeWinningPatterns();
    const performanceStats = patternAnalyzer.getPerformanceStats();
    
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    
    // Filtrar trades das últimas 24h
    const recentTrades = trades.filter(t => new Date(t.closed_at || t.opened_at).getTime() > last24h);
    
    if (recentTrades.length === 0) {
      return {
        period: '24h',
        total_trades: 0,
        win_rate: 0,
        roi: 0,
        message: 'Sem trades nas últimas 24h'
      };
    }

    // Calcular métricas
    const closedTrades = recentTrades.filter(t => t.status === 'closed');
    const winningTrades = closedTrades.filter(t => t.pnl > 0);
    const losingTrades = closedTrades.filter(t => t.pnl <= 0);
    
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 0;
    
    // Análise por moeda
    const coinPerformance = {};
    for (const trade of closedTrades) {
      if (!coinPerformance[trade.symbol]) {
        coinPerformance[trade.symbol] = {
          trades: 0,
          wins: 0,
          losses: 0,
          total_pnl: 0
        };
      }
      
      coinPerformance[trade.symbol].trades++;
      if (trade.pnl > 0) {
        coinPerformance[trade.symbol].wins++;
      } else {
        coinPerformance[trade.symbol].losses++;
      }
      coinPerformance[trade.symbol].total_pnl += trade.pnl || 0;
    }

    // Calcular win rate por moeda
    for (const symbol in coinPerformance) {
      const perf = coinPerformance[symbol];
      perf.win_rate = perf.trades > 0 ? (perf.wins / perf.trades) * 100 : 0;
      perf.roi = perf.total_pnl; // Simplificado
    }

    return {
      period: '24h',
      total_trades: recentTrades.length,
      closed_trades: closedTrades.length,
      win_rate: winRate,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      total_pnl: totalPnl,
      roi: totalPnl, // Simplificado
      avg_win: avgWin,
      avg_loss: avgLoss,
      profit_factor: avgLoss > 0 ? avgWin / avgLoss : 0,
      coin_performance: coinPerformance,
      pattern_analysis: patternAnalysis,
      performance_stats: performanceStats
    };
  }

  // Identificar problemas e oportunidades
  identifyIssuesAndOpportunities(performance) {
    const issues = [];
    const opportunities = [];
    const recommendations = [];
    
    // Adiciona recomendações do pattern analyzer
    if (performance.pattern_analysis && performance.pattern_analysis.recommendations) {
      console.log(`[Performance] Incorporando ${performance.pattern_analysis.recommendations.length} recomendações do pattern analyzer`);
      
      for (const patternRec of performance.pattern_analysis.recommendations) {
        if (patternRec.priority === 'high') {
          recommendations.push({
            action: 'apply_pattern_insight',
            description: patternRec.message,
            pattern_type: patternRec.type,
            pattern_data: patternRec
          });
        }
      }
    }

    // 1. Win Rate Baixo
    if (performance.win_rate < 45) {
      issues.push({
        type: 'low_win_rate',
        severity: 'high',
        description: `Win rate muito baixo: ${performance.win_rate.toFixed(1)}%`,
        current_value: performance.win_rate,
        target_value: 50
      });
      
      recommendations.push({
        action: 'increase_threshold',
        description: 'Aumentar threshold de confiança para filtrar sinais fracos',
        from: this.learningData.current_parameters.confidence_threshold,
        to: this.learningData.current_parameters.confidence_threshold + 5
      });
    }

    // 2. Overtrading
    if (performance.total_trades > 50) {
      issues.push({
        type: 'overtrading',
        severity: 'medium',
        description: `Muitos trades em 24h: ${performance.total_trades}`,
        current_value: performance.total_trades,
        target_value: 30
      });
      
      recommendations.push({
        action: 'reduce_trading_frequency',
        description: 'Aumentar threshold ou reduzir frequência de análise',
        from: this.learningData.current_parameters.max_trades_per_day,
        to: 30
      });
    }

    // 3. Moedas Problemáticas
    for (const [symbol, perf] of Object.entries(performance.coin_performance || {})) {
      if (perf.trades >= 3 && perf.win_rate < 30) {
        issues.push({
          type: 'poor_coin_performance',
          severity: 'medium',
          description: `${symbol} com win rate muito baixo: ${perf.win_rate.toFixed(1)}%`,
          symbol,
          win_rate: perf.win_rate
        });
        
        recommendations.push({
          action: 'disable_coin',
          description: `Pausar ${symbol} por 24-48h`,
          symbol
        });
      }
      
      // Moedas com bom desempenho
      if (perf.trades >= 3 && perf.win_rate > 65 && perf.total_pnl > 0) {
        opportunities.push({
          type: 'high_performing_coin',
          description: `${symbol} com excelente performance: ${perf.win_rate.toFixed(1)}% win rate`,
          symbol,
          win_rate: perf.win_rate,
          roi: perf.total_pnl
        });
        
        recommendations.push({
          action: 'prioritize_coin',
          description: `Aumentar alocação em ${symbol}`,
          symbol
        });
      }
    }

    // 4. ROI Negativo
    if (performance.roi < 0) {
      issues.push({
        type: 'negative_roi',
        severity: 'critical',
        description: `ROI negativo: $${performance.roi.toFixed(2)}`,
        current_value: performance.roi
      });
      
      recommendations.push({
        action: 'pause_trading',
        description: 'Considerar pausar trading e revisar estratégia',
        duration: '24h'
      });
    }

    return { issues, opportunities, recommendations };
  }

  // Aplicar otimizações automaticamente
  async applyOptimizations(recommendations) {
    console.log(`[Performance] Aplicando ${recommendations.length} otimizações...`);
    
    const applied = [];
    const failed = [];

    for (const rec of recommendations) {
      try {
        const result = await this.applyOptimization(rec);
        if (result.success) {
          applied.push({ ...rec, result });
          
          // Registrar otimização
          this.learningData.optimizations.push({
            timestamp: new Date().toISOString(),
            action: rec.action,
            description: rec.description,
            parameters_before: { ...this.learningData.current_parameters },
            parameters_after: null // Será preenchido após aplicar
          });
        } else {
          failed.push({ ...rec, error: result.error });
        }
      } catch (error) {
        console.error(`[Performance] Erro ao aplicar otimização ${rec.action}:`, error);
        failed.push({ ...rec, error: error.message });
      }
    }

    // Salvar dados atualizados
    this.saveLearningData();

    console.log(`[Performance] Otimizações aplicadas: ${applied.length}, Falhas: ${failed.length}`);
    
    return { applied, failed };
  }

  // Aplicar uma otimização específica
  async applyOptimization(recommendation) {
    const { action } = recommendation;

    switch (action) {
      case 'increase_threshold':
        this.learningData.current_parameters.confidence_threshold = recommendation.to;
        console.log(`[Performance] Threshold aumentado: ${recommendation.from}% → ${recommendation.to}%`);
        return { success: true, message: 'Threshold atualizado' };

      case 'reduce_trading_frequency':
        this.learningData.current_parameters.max_trades_per_day = recommendation.to;
        console.log(`[Performance] Max trades/dia reduzido: ${recommendation.from} → ${recommendation.to}`);
        return { success: true, message: 'Frequência reduzida' };

      case 'disable_coin':
        if (!this.learningData.disabled_coins.includes(recommendation.symbol)) {
          this.learningData.disabled_coins.push(recommendation.symbol);
          console.log(`[Performance] Moeda desabilitada: ${recommendation.symbol}`);
        }
        return { success: true, message: `${recommendation.symbol} desabilitada` };

      case 'prioritize_coin':
        if (!this.learningData.prioritized_coins.includes(recommendation.symbol)) {
          this.learningData.prioritized_coins.push(recommendation.symbol);
          console.log(`[Performance] Moeda priorizada: ${recommendation.symbol}`);
        }
        return { success: true, message: `${recommendation.symbol} priorizada` };

      case 'pause_trading':
        console.log(`[Performance] ALERTA: ROI negativo - considerar pausar trading`);
        return { success: true, message: 'Alerta registrado' };
      
      case 'apply_pattern_insight':
        console.log(`[Performance] Aplicando insight de padrão: ${recommendation.pattern_type}`);
        const patternData = recommendation.pattern_data;
        
        // Aplica ajustes baseados no tipo de insight
        if (patternData.type === 'threshold' && patternData.suggestedValue) {
          this.learningData.current_parameters.confidence_threshold = patternData.suggestedValue;
          console.log(`[Performance] Threshold ajustado para ${patternData.suggestedValue}% baseado em padrões`);
        } else if (patternData.type === 'indicator' && patternData.suggestedRange) {
          console.log(`[Performance] Insight registrado: ${patternData.indicator} deve estar em [${patternData.suggestedRange.join(', ')}]`);
        }
        
        return { success: true, message: 'Insight de padrão aplicado' };

      default:
        return { success: false, error: 'Ação desconhecida' };
    }
  }

  // Obter parâmetros atuais
  getCurrentParameters() {
    return { ...this.learningData.current_parameters };
  }

  // Obter moedas desabilitadas
  getDisabledCoins() {
    return [...this.learningData.disabled_coins];
  }

  // Obter moedas priorizadas
  getPrioritizedCoins() {
    return [...this.learningData.prioritized_coins];
  }

  // Reabilitar moeda após período
  reenableCoin(symbol) {
    const index = this.learningData.disabled_coins.indexOf(symbol);
    if (index > -1) {
      this.learningData.disabled_coins.splice(index, 1);
      this.saveLearningData();
      console.log(`[Performance] Moeda reabilitada: ${symbol}`);
      return true;
    }
    return false;
  }

  // Gerar relatório completo
  generateReport(performance, analysis) {
    const report = {
      timestamp: new Date().toISOString(),
      performance,
      analysis,
      current_parameters: this.getCurrentParameters(),
      disabled_coins: this.getDisabledCoins(),
      prioritized_coins: this.getPrioritizedCoins(),
      recent_optimizations: this.learningData.optimizations.slice(-10)
    };

    // Salvar relatório
    try {
      const reportFile = path.join(process.cwd(), `performance-report-${Date.now()}.json`);
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      console.log(`[Performance] Relatório salvo: ${reportFile}`);
    } catch (error) {
      console.error('[Performance] Erro ao salvar relatório:', error);
    }

    return report;
  }
}

export default PerformanceAnalyzer;
