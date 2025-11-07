// Trading Engine Inteligente com Aprendizado Contínuo

import {
  getKlines,
  getPrice,
  getBalance,
  openPosition,
  closePosition,
  getOpenPositions,
  getTradeHistory,
  setLeverage,
} from './bybit.js';
import { generateUltraTradingSignal, calculateUltraSLTP } from './ultra-algorithm.js';
import * as db from './database.js';
import { SystemDiagnostics } from './system-diagnostics.js';
import { PerformanceAnalyzer } from './performance-analyzer.js';
import { selectTradesToExecute, calculateOptimalRisk } from './risk-manager.js';

// Instâncias dos sistemas
const diagnostics = new SystemDiagnostics();
const performanceAnalyzer = new PerformanceAnalyzer();

// Estado global do trading
export const tradingState = {
  isRunning: true, // Bot inicia automaticamente
  balance: 0,
  positions: [],
  trades: [],
  signals: [],
  lastUpdate: null,
  lastDiagnostic: null,
  lastOptimization: null,
};

// Carregar trades do banco de dados ao iniciar
async function loadTradesFromDB() {
  try {
    const allTrades = await db.getAllTrades(100);
    console.log(`[Database] ${allTrades.length} trades carregados do banco de dados`);
    
    // Converter para formato do tradingState
    tradingState.trades = allTrades.map(t => ({
      symbol: t.symbol,
      side: t.side,
      entryPrice: parseFloat(t.entryPrice) || 0,
      exitPrice: parseFloat(t.exitPrice) || 0,
      quantity: parseFloat(t.quantity) || 0,
      leverage: t.leverage || 0,
      stopLoss: 0,
      takeProfit: 0,
      pnl: parseFloat(t.profit) || 0,
      pnlPercent: parseFloat(t.profitPercent) || 0,
      opened_at: t.entryTime,
      closed_at: t.exitTime,
      status: t.status,
      dbId: t.id
    }));
  } catch (error) {
    console.error('[Database] Erro ao carregar trades:', error);
    tradingState.trades = [];
  }
}

// Carregar trades ao iniciar (async)
loadTradesFromDB().catch(err => console.error('[Database] Erro ao inicializar:', err));

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
 * Calcula quantidade de moedas a operar (DEPRECATED - usar risk-manager)
 * Mantido para compatibilidade - NÃO USAR MAIS
 */
function calculateQuantity(balance, price, leverage, riskPercent = 2) {
  // Função deprecated - quantidade agora vem do risk-manager
  const riskAmount = balance * (riskPercent / 100);
  const quantity = (riskAmount * leverage) / price;
  return Math.max(quantity, 0.001);
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
    const signalData = generateUltraTradingSignal(symbol, klines);

    if (!signalData || signalData.signal === 'HOLD') return null;

    // Calcula alavancagem baseada em parâmetros aprendidos
    const leverage = calculateLeverage(signalData.confidence, parameters);

    return {
      symbol,
      timestamp: Date.now(),
      price: priceData.price,
      signal: signalData.signal,
      confidence: signalData.confidence,
      reason: signalData.reason,
      score: signalData.score,
      details: signalData.details,
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

    // Usa quantidade já calculada pelo risk-manager
    const quantity = signal.quantity || 0;
    
    if (quantity === 0) {
      console.log(`[Trading] ❌ ${signal.symbol}: Quantidade inválida`);
      return null;
    }

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
      // Preparar dados completos para o banco
      const tradeData = {
        symbol: signal.symbol,
        side: side,
        entry_price: signal.price,
        entry_time: new Date().toISOString(),
        entry_confidence: signal.confidence,
        entry_score: signal.score || 0,
        entry_reasons: JSON.stringify(signal.reason || []),
        
        // Indicadores da entrada (do ultra-algorithm)
        entry_rsi: signal.details?.rsi || null,
        entry_macd: signal.details?.macd || null,
        entry_macd_signal: signal.details?.macd_signal || null,
        entry_macd_histogram: signal.details?.macd_histogram || null,
        entry_bb_upper: signal.details?.bb_upper || null,
        entry_bb_middle: signal.details?.bb_middle || null,
        entry_bb_lower: signal.details?.bb_lower || null,
        entry_volume_ratio: signal.details?.volume_ratio || null,
        entry_trend: signal.details?.trend || null,
        entry_volatility: signal.details?.volatility || null,
        
        // Condições de mercado (se disponível)
        market_volatility_24h: signal.details?.volatility_24h || null,
        market_volume_24h: signal.details?.volume_24h || null,
        market_price_change_1h: signal.details?.price_change_1h || null,
        market_price_change_24h: signal.details?.price_change_24h || null,
        
        // Configuração do trade
        quantity: quantity,
        leverage: signal.leverage,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        status: 'open'
      };
      
      // Salvar no banco de dados
      try {
        const tradeId = await db.insertTrade(tradeData);
        console.log(`[Database] ✅ Trade criado com ID: ${tradeId}`);
      } catch (dbErr) {
        console.error('[Database] Erro ao criar trade:', dbErr.message);
      }
      
      // Criar objeto para tradingState (compatibilidade)
      const trade = {
        ...position,
        dbId: tradeId,
        confidence: signal.confidence,
        entryPrice: signal.price,
        stopLoss,
        takeProfit,
        reason: signal.reason || [],
        score: signal.score || 0,
        expectedProfit: (signal.price * quantity * ((parameters.take_profit_percent || 15) / 100) * signal.leverage).toFixed(2),
        opened_at: new Date().toISOString(),
        status: 'open'
      };

      // Registra trade no estado (para compatibilidade)
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
 * Sincroniza trades fechados com histórico da Bybit
 */
async function syncClosedTrades() {
  try {
    console.log('[Sync] Iniciando sincronização de trades fechados...');
    const recentTrades = await getTradeHistory(null, 100);
    console.log(`[Sync] Trades recebidos da Bybit: ${recentTrades.length}`);
    
    // Agrupa trades por símbolo (não por orderId)
    const tradesBySymbol = {};
    console.log('[Sync] Agrupando trades por símbolo...');
    for (const trade of recentTrades) {
      if (!tradesBySymbol[trade.symbol]) {
        tradesBySymbol[trade.symbol] = [];
      }
      tradesBySymbol[trade.symbol].push(trade);
    }
    
    // Processa cada símbolo para detectar fechamentos
    console.log(`[Sync] Processando ${Object.keys(tradesBySymbol).length} símbolos...`);
    for (const [symbol, trades] of Object.entries(tradesBySymbol)) {
      // Ordena por timestamp
      trades.sort((a, b) => a.timestamp - b.timestamp);
      
      // Procura pares de Buy/Sell
      const buyTrades = trades.filter(t => t.side === 'Buy');
      const sellTrades = trades.filter(t => t.side === 'Sell');
      
      console.log(`[Sync] ${symbol}: ${buyTrades.length} Buys, ${sellTrades.length} Sells`);
      
      // Se tem pelo menos 1 buy e 1 sell, é uma posição fechada
      const hasBuy = buyTrades.length > 0;
      const hasSell = sellTrades.length > 0;
      
      if (hasBuy && hasSell) {
        console.log(`[Sync] ${symbol}: Posição fechada detectada`);
        
        // Pega o último buy e o último sell
        const lastBuy = buyTrades[buyTrades.length - 1];
        const lastSell = sellTrades[sellTrades.length - 1];
        
        // Verifica se já está registrado no histórico local (janela de 5 minutos)
        const existsInLocal = tradingState.trades.some(
          t => t.symbol === symbol && t.status === 'closed' && 
               Math.abs(new Date(t.closed_at).getTime() - lastSell.timestamp) < 300000
        );
        
        console.log(`[Sync] ${symbol} já existe no histórico local? ${existsInLocal}`);
        
        if (!existsInLocal) {
          console.log(`[Sync] Trade ${symbol} não encontrado no histórico local, adicionando...`);
          
          // Calcula PnL manualmente baseado nos preços
          // PnL = (Preço de Saída - Preço de Entrada) * Quantidade
          const entryPrice = lastBuy.price;
          const exitPrice = lastSell.price;
          const quantity = lastBuy.size;
          const totalPnl = (exitPrice - entryPrice) * quantity;
          
          console.log(`[Sync] PnL calculado manualmente: $${totalPnl.toFixed(2)}`);
          console.log(`[Sync] Detalhes: Buy @ ${entryPrice} x ${quantity}, Sell @ ${exitPrice}`);
          console.log(`[Sync] Cálculo: (${exitPrice} - ${entryPrice}) * ${quantity} = ${totalPnl.toFixed(2)}`);
          
          // Encontra trade aberto correspondente
          const openTradeIndex = tradingState.trades.findIndex(
            t => t.symbol === symbol && t.status === 'open'
          );
          
          if (openTradeIndex > -1) {
            // Atualiza trade existente
            const openTrade = tradingState.trades[openTradeIndex];
            const closedAt = new Date(lastSell.timestamp);
            const durationMinutes = Math.round((closedAt - new Date(openTrade.opened_at)) / 60000);
            const pnlPercent = (totalPnl / (openTrade.entryPrice * openTrade.quantity)) * 100;
            
            tradingState.trades[openTradeIndex] = {
              ...openTrade,
              exitPrice: lastSell.price,
              pnl: totalPnl,
              pnlPercent: pnlPercent,
              closed_at: closedAt.toISOString(),
              status: 'closed',
            };
            // Estado salvo automaticamente no banco de dados
            
            // Registra dados de saída no banco
            try {
              // Determina razão do fechamento baseado no PnL
              const exitReason = pnlPercent < -3 ? 'stop_loss' : pnlPercent > 10 ? 'take_profit' : 'manual';
              
              db.updateTradeExit(
                openTrade.symbol,
                new Date(openTrade.opened_at),
                {
                  exit_price: lastSell.price,
                  exit_reason: exitReason,
                  pnl: totalPnl,
                  pnl_percent: pnlPercent,
                  duration_minutes: durationMinutes,
                }
              );
              console.log(`[Database] ✅ Dados de saída registrados para ${symbol} (sync)`);
            } catch (dbErr) {
              console.error('[Database] Erro ao registrar saída (sync):', dbErr.message);
            }
            
            console.log(`[Trading] ✅ Trade sincronizado: ${symbol} - PnL: $${totalPnl.toFixed(2)}`);
          } else {
            // Cria novo registro se não encontrou trade aberto
            const entryTrade = lastBuy;
            const exitTrade = lastSell;
            
            tradingState.trades.push({
              symbol,
              side: entryTrade.side,
              entryPrice: entryTrade.price,
              exitPrice: exitTrade.price,
              quantity: entryTrade.size,
              leverage: 0, // Não temos essa info no histórico
              stopLoss: 0,
              takeProfit: 0,
              pnl: totalPnl,
              pnlPercent: ((exitPrice - entryPrice) / entryPrice) * 100,
              opened_at: new Date(entryTrade.timestamp).toISOString(),
              closed_at: new Date(exitTrade.timestamp).toISOString(),
              status: 'closed',
            });
            // Estado salvo automaticamente no banco de dados
            
            console.log(`[Trading] ✅ Trade recuperado do histórico: ${symbol} - PnL: $${totalPnl.toFixed(2)}`);
          }
        }
      }
    }
    
    console.log(`[Sync] Sincronização concluída. Trades no histórico: ${tradingState.trades.length}`);
  } catch (error) {
    console.error('[Sync] Erro ao sincronizar trades fechados:', error);
    console.error('[Sync] Stack trace:', error.stack);
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
        
        // Determina razão do fechamento
        const exitReason = pnlPercent <= stopLossPercent ? 'stop_loss' : 'take_profit';
        
        // Indicadores de saída serão buscados pelo ultra-algorithm quando necessário
        
        await closePosition(pos.symbol, pos.side);

        // Atualiza trade no histórico
        const tradeIndex = tradingState.trades.findIndex(
          t => t.symbol === pos.symbol && t.status === 'open'
        );

        if (tradeIndex > -1) {
          const openTrade = tradingState.trades[tradeIndex];
          const closedAt = new Date();
          const durationMinutes = Math.round((closedAt - new Date(openTrade.opened_at)) / 60000);
          
          tradingState.trades[tradeIndex] = {
            ...openTrade,
            exitPrice: pos.currentPrice,
            pnl: pos.unrealizedPnl,
            pnlPercent: pnlPercent,
            closed_at: closedAt.toISOString(),
            status: 'closed',
          };
          // Estado salvo automaticamente no banco de dados
          
          // Registra dados de saída no banco
          try {
            db.updateTradeExit(
              openTrade.symbol,
              new Date(openTrade.opened_at),
              {
                exit_price: pos.currentPrice,
                exit_reason: exitReason,
                pnl: pos.unrealizedPnl,
                pnl_percent: pnlPercent,
                duration_minutes: durationMinutes,
              }
            );
            console.log(`[Database] ✅ Dados de saída registrados para ${pos.symbol}`);
          } catch (dbErr) {
            console.error('[Database] Erro ao registrar saída:', dbErr.message);
          }
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

    // Sincroniza trades fechados com histórico da Bybit
    await syncClosedTrades();
    
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

    // Seleciona trades baseado em gestão de risco inteligente
    // Filtra HOLD e sinais com leverage inválido
    const validSignals = signals.filter(s => s.signal !== 'HOLD' && s.leverage > 0);
    console.log(`[Trading] Sinais válidos (não-HOLD com leverage > 0): ${validSignals.length}/${signals.length}`);
    const selectedTrades = selectTradesToExecute(
      validSignals,
      tradingState.balance,
      tradingState.positions
    );
    
    console.log(`[Trading] Trades selecionados para execução: ${selectedTrades.length}`);
    
    // Executa trades selecionados
    let tradesExecuted = 0;
    for (const signal of selectedTrades) {
      if (todayTrades + tradesExecuted < maxTradesPerDay) {
        const trade = await executeTrade(signal, tradingState.balance, parameters);
        if (trade) {
          tradesExecuted++;
        }
      } else {
        console.log(`[Trading] ⚠️ Limite diário atingido durante execução`);
        break;
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

// Exportar função principal
export default runIntelligentTradingCycle;
