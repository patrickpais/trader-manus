// Trading Engine Inteligente com Aprendizado Contínuo

import {
  getKlines,
  getPrice,
  getBalance,
  openPosition,
  closePosition,
  getOpenPositions,
  setLeverage,
} from './bybit.js';
import { generateSignalUltraAdvanced } from './ultra-algorithm.js';
import { SystemDiagnostics } from './system-diagnostics.js';
import { PerformanceAnalyzer } from './performance-analyzer.js';

// Instâncias dos sistemas
const diagnostics = new SystemDiagnostics();
const performanceAnalyzer = new PerformanceAnalyzer();

// Estado global do trading
export const tradingState = {
  isRunning: false,
  balance: 0,
  positions: [],
  trades: [],
  signals: [],
  lastUpdate: null,
  lastDiagnostic: null,
  lastOptimization: null,
};

// Contador de ciclos
let cycleCount = 0;

/**
 * Calcula alavancagem dinâmica baseada em confiança e parâmetros aprendidos
 */
function calculateLeverage(confidence, parameters) {
  const threshold = parameters.confidence_threshold || 70;
  
  if (confidence < threshold) return 0; // Não opera
  if (confidence < threshold + 5) return 2;
  if (confidence < threshold + 10) return 3;
  if (confidence < threshold + 15) return 5;
  if (confidence < threshold + 20) return 7;
  if (confidence < threshold + 25) return 8;
  return 10;
}

/**
 * Calcula quantidade de moedas a operar
 */
function calculateQuantity(balance, price, leverage, riskPercent = 2) {
  const riskAmount = balance * (riskPercent / 100);
  const quantity = (riskAmount * leverage) / price;
  return Math.max(quantity, 0.001); // Mínimo 0.001
}

/**
 * Calcula stop loss e take profit dinâmicos
 */
function calculateSLTP(entryPrice, side, leverage, parameters) {
  const stopLossPercent = (parameters.stop_loss_percent || 5) / leverage;
  const takeProfitPercent = (parameters.take_profit_percent || 15) / leverage;

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
 * Analisa uma moeda com algoritmo ultra-avançado
 */
async function analyzeSymbol(symbol, parameters) {
  try {
    // Busca dados históricos
    const klines = await getKlines(symbol, '5', 200);
    if (klines.length === 0) return null;

    // Busca preço atual
    const priceData = await getPrice(symbol);
    if (!priceData) return null;

    // Gera sinal com algoritmo ultra-avançado
    const signal = await generateSignalUltraAdvanced(klines, priceData, symbol);

    if (!signal) return null;

    // Calcula alavancagem baseada em parâmetros aprendidos
    const leverage = calculateLeverage(signal.confidence, parameters);

    return {
      symbol,
      timestamp: Date.now(),
      price: priceData.price,
      signal: signal.signal,
      confidence: signal.confidence,
      direction: signal.direction,
      indicators: signal.indicators,
      sentiment: signal.sentiment,
      leverage,
    };
  } catch (error) {
    console.error(`[Trading] Erro ao analisar ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Executa trade baseado em sinal
 */
async function executeTrade(signal, balance, parameters) {
  try {
    if (signal.signal === 'HOLD' || signal.leverage === 0) {
      return null;
    }

    // Calcula quantidade
    const riskPercent = parameters.risk_per_trade || 2;
    const quantity = calculateQuantity(balance, signal.price, signal.leverage, riskPercent);

    // Calcula SL e TP
    const side = signal.signal === 'BUY' ? 'Buy' : 'Sell';
    const { stopLoss, takeProfit } = calculateSLTP(signal.price, side, signal.leverage, parameters);

    // Define alavancagem
    await setLeverage(signal.symbol, signal.leverage);

    // Abre posição
    const position = await openPosition(
      signal.symbol,
      side,
      quantity,
      signal.leverage,
      stopLoss,
      takeProfit
    );

    if (position) {
      const trade = {
        ...position,
        confidence: signal.confidence,
        entryPrice: signal.price,
        stopLoss,
        takeProfit,
        sentiment: signal.sentiment,
        expectedProfit: (signal.price * quantity * ((parameters.take_profit_percent || 15) / 100) * signal.leverage).toFixed(2),
        opened_at: new Date().toISOString(),
        status: 'open'
      };

      // Registra trade
      tradingState.trades.push(trade);

      console.log(`[Trading] ✅ Trade aberto: ${signal.symbol} ${side} ${quantity} @ ${signal.price} (${signal.leverage}x)`);
      
      return trade;
    }

    return null;
  } catch (error) {
    console.error('[Trading] Erro ao executar trade:', error.message);
    return null;
  }
}

/**
 * Monitora posições abertas com trailing stop
 */
async function monitorPositions(parameters) {
  try {
    const positions = await getOpenPositions();

    for (const pos of positions) {
      const pnlPercent = pos.unrealizedPnlPercent;

      // Trailing stop: se lucro > 10%, ajusta stop loss para breakeven
      if (pnlPercent > 10) {
        console.log(`[Trading] 🎯 ${pos.symbol}: Lucro de ${pnlPercent.toFixed(2)}% - Trailing stop ativo`);
        // Implementar lógica de trailing stop aqui
      }

      // Se atingiu TP ou SL, fecha posição
      const stopLossPercent = -(parameters.stop_loss_percent || 5);
      const takeProfitPercent = parameters.take_profit_percent || 15;

      if (pnlPercent <= stopLossPercent || pnlPercent >= takeProfitPercent) {
        console.log(`[Trading] 🔔 Fechando ${pos.symbol}: PnL = ${pnlPercent.toFixed(2)}%`);
        
        await closePosition(pos.symbol, pos.side);

        // Atualiza trade no histórico
        const tradeIndex = tradingState.trades.findIndex(
          t => t.symbol === pos.symbol && t.status === 'open'
        );

        if (tradeIndex > -1) {
          tradingState.trades[tradeIndex] = {
            ...tradingState.trades[tradeIndex],
            exitPrice: pos.currentPrice,
            pnl: pos.unrealizedPnl,
            pnlPercent: pnlPercent,
            closed_at: new Date().toISOString(),
            status: 'closed',
          };
        }
      }
    }

    tradingState.positions = positions;
  } catch (error) {
    console.error('[Trading] Erro ao monitorar posições:', error.message);
  }
}

/**
 * Executa diagnóstico do sistema
 */
async function runDiagnostic() {
  try {
    console.log('[Trading] 🔍 Executando diagnóstico do sistema...');
    const diagnostic = await diagnostics.runFullDiagnostic();
    tradingState.lastDiagnostic = diagnostic;

    if (diagnostic.status === 'critical') {
      console.error('[Trading] ⚠️ SISTEMA COM PROBLEMAS CRÍTICOS!');
      console.error('[Trading] Issues:', diagnostic.issues);
      
      // Tentar correção automática
      for (const issue of diagnostic.issues) {
        await diagnostics.attemptAutoFix(issue);
      }
    } else if (diagnostic.status === 'warning') {
      console.warn('[Trading] ⚠️ Sistema com avisos:', diagnostic.warnings);
    } else {
      console.log('[Trading] ✅ Sistema saudável');
    }

    return diagnostic;
  } catch (error) {
    console.error('[Trading] Erro ao executar diagnóstico:', error);
    return null;
  }
}

/**
 * Executa análise de performance e otimização
 */
async function runPerformanceAnalysis() {
  try {
    console.log('[Trading] 📊 Analisando performance...');
    
    // Analisa performance recente
    const performance = await performanceAnalyzer.analyzeRecentPerformance(tradingState.trades);
    
    console.log(`[Trading] Performance 24h: ${performance.total_trades} trades, ${performance.win_rate.toFixed(1)}% win rate, ROI: $${performance.roi.toFixed(2)}`);

    // Identifica problemas e oportunidades
    const analysis = performanceAnalyzer.identifyIssuesAndOpportunities(performance);
    
    if (analysis.issues.length > 0) {
      console.log(`[Trading] ⚠️ ${analysis.issues.length} problemas identificados`);
      for (const issue of analysis.issues) {
        console.log(`[Trading]   - ${issue.description}`);
      }
    }

    if (analysis.opportunities.length > 0) {
      console.log(`[Trading] 💡 ${analysis.opportunities.length} oportunidades identificadas`);
      for (const opp of analysis.opportunities) {
        console.log(`[Trading]   + ${opp.description}`);
      }
    }

    // Aplica otimizações automaticamente
    if (analysis.recommendations.length > 0) {
      console.log(`[Trading] 🔧 Aplicando ${analysis.recommendations.length} otimizações...`);
      const result = await performanceAnalyzer.applyOptimizations(analysis.recommendations);
      console.log(`[Trading] ✅ ${result.applied.length} otimizações aplicadas com sucesso`);
      
      if (result.failed.length > 0) {
        console.warn(`[Trading] ⚠️ ${result.failed.length} otimizações falharam`);
      }
    }

    // Gera relatório
    const report = performanceAnalyzer.generateReport(performance, analysis);
    tradingState.lastOptimization = {
      timestamp: new Date().toISOString(),
      performance,
      analysis,
      optimizations_applied: analysis.recommendations.length
    };

    return report;
  } catch (error) {
    console.error('[Trading] Erro ao analisar performance:', error);
    return null;
  }
}

/**
 * Ciclo principal de trading inteligente
 */
export async function runIntelligentTradingCycle() {
  try {
    cycleCount++;
    console.log(`\n[Trading] ========== CICLO #${cycleCount} ==========`);
    console.log('[Trading] Iniciando ciclo de trading inteligente...');
    
    // A cada 12 ciclos (1 hora), executa diagnóstico
    if (cycleCount % 12 === 0) {
      await runDiagnostic();
    }

    // A cada 24 ciclos (2 horas), executa análise de performance
    if (cycleCount % 24 === 0) {
      await runPerformanceAnalysis();
    }

    // Obter parâmetros atuais (aprendidos)
    const parameters = performanceAnalyzer.getCurrentParameters();
    const disabledCoins = performanceAnalyzer.getDisabledCoins();
    const prioritizedCoins = performanceAnalyzer.getPrioritizedCoins();

    console.log('[Trading] Parâmetros atuais:', parameters);
    console.log('[Trading] Moedas desabilitadas:', disabledCoins);
    console.log('[Trading] Moedas priorizadas:', prioritizedCoins);

    // Atualiza saldo
    const balance = await getBalance();
    
    if (!balance || Object.keys(balance).length === 0) {
      console.error('[Trading] Erro: Saldo vazio ou inválido');
      return null;
    }
    
    const usdtBalance = balance.USDT?.available || 0;
    tradingState.balance = usdtBalance;
    console.log('[Trading] Saldo USDT disponível:', usdtBalance);

    // Lista de moedas (filtra desabilitadas e prioriza)
    let symbols = [
      'BTCUSDT',
      'ETHUSDT',
      'BNBUSDT',
      'SOLUSDT',
      'XRPUSDT',
      'ADAUSDT',
      'DOGEUSDT',
      'LINKUSDT',
      'AVAXUSDT',
      'MATICUSDT',
      'LTCUSDT',
      'UNIUSDT',
      'ATOMUSDT',
      'APTUSDT',
      'FILUSDT',
    ];

    // Remove moedas desabilitadas
    symbols = symbols.filter(s => !disabledCoins.includes(s));

    // Prioriza moedas com bom desempenho
    if (prioritizedCoins.length > 0) {
      symbols = [
        ...prioritizedCoins.filter(s => symbols.includes(s)),
        ...symbols.filter(s => !prioritizedCoins.includes(s))
      ];
    }

    console.log(`[Trading] Analisando ${symbols.length} moedas...`);
    
    // Analisa cada moeda
    const signals = [];
    for (const symbol of symbols) {
      const signal = await analyzeSymbol(symbol, parameters);
      if (signal) {
        console.log(`[Trading] ${symbol}: ${signal.signal} (${signal.confidence}%)`);
        signals.push(signal);
      }
    }
    
    console.log(`[Trading] Total de sinais gerados: ${signals.length}`);
    tradingState.signals = signals;

    // Monitora posições abertas
    await monitorPositions(parameters);

    // Limita número de trades por dia
    const maxTradesPerDay = parameters.max_trades_per_day || 50;
    const today = new Date().toDateString();
    const todayTrades = tradingState.trades.filter(t => 
      new Date(t.opened_at).toDateString() === today
    ).length;

    if (todayTrades >= maxTradesPerDay) {
      console.log(`[Trading] ⚠️ Limite diário de trades atingido (${todayTrades}/${maxTradesPerDay})`);
      return {
        success: true,
        message: 'Limite diário atingido',
        signals: signals.length,
        trades_executed: 0
      };
    }

    // Executa trades com sinal BUY/SELL
    let tradesExecuted = 0;
    for (const signal of signals) {
      if (signal.signal !== 'HOLD' && todayTrades + tradesExecuted < maxTradesPerDay) {
        const trade = await executeTrade(signal, tradingState.balance, parameters);
        if (trade) {
          tradesExecuted++;
        }
      }
    }

    tradingState.lastUpdate = new Date().toISOString();

    console.log(`[Trading] Ciclo concluído: ${tradesExecuted} trades executados`);
    console.log(`[Trading] ========================================\n`);

    return {
      success: true,
      balance: tradingState.balance,
      signals: signals.length,
      trades_executed: tradesExecuted,
      positions_open: tradingState.positions.length
    };

  } catch (error) {
    console.error('[Trading] Erro no ciclo de trading:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Exportar estado e funções
export { tradingState };
export default runIntelligentTradingCycle;
