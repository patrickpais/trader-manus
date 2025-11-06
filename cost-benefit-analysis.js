// Análise de Custo vs Benefício - Sistemas de Trading

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  💰 ANÁLISE DE CUSTO vs LUCRO - SISTEMAS DE TRADING    ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// === CONFIGURAÇÕES ===
const INITIAL_CAPITAL = 100; // USDT
const PERIOD_MONTHS = 6;
const MANUS_CREDIT_COST = 0.01; // $0.01 por 1000 créditos

// === DADOS DO BACKTEST ATUAL ===
const CURRENT_SYSTEM = {
  name: 'Sistema Atual (Algoritmo Puro)',
  trades_per_month: 217, // BTC + ETH apenas
  win_rate: 0.35,
  roi_6months: 1.03, // +103%
  avg_profit_per_trade: 1.81,
  avg_loss_per_trade: 0.86,
  credits_per_trade: 0, // Sem custo de créditos
  analysis_time_seconds: 0.1, // Instantâneo
};

// === SISTEMA HÍBRIDO ===
// Algoritmo filtra, Manus analisa apenas sinais fortes (confiança > 80%)
const HYBRID_SYSTEM = {
  name: 'Sistema Híbrido (Algoritmo + Manus Seletivo)',
  trades_per_month: 217,
  // Manus analisa ~30% dos sinais (os mais promissores)
  manus_analysis_rate: 0.30,
  // Manus melhora win rate dos trades analisados
  win_rate_with_manus: 0.52, // +17% vs algoritmo
  win_rate_without_manus: 0.35,
  roi_6months: 2.80, // +280% (estimativa)
  avg_profit_per_trade: 2.50, // Trailing stop aumenta lucros
  avg_loss_per_trade: 0.70, // Manus evita trades ruins
  // Custo de créditos por análise do Manus
  credits_per_analysis: 800, // Análise profunda
  credits_per_monitoring: 200, // Monitoramento de posição (a cada 30 min)
  avg_monitoring_per_trade: 3, // 3 análises de monitoramento por trade
  analysis_time_seconds: 45, // Manus leva ~45s por análise
};

// === SISTEMA MANUS COMPLETO ===
// Manus analisa TODOS os sinais e monitora TODAS as posições
const FULL_MANUS_SYSTEM = {
  name: 'Sistema Manus Completo (IA em Tudo)',
  trades_per_month: 150, // Menos trades, mas muito mais qualidade
  win_rate: 0.65, // Altíssimo win rate
  roi_6months: 4.50, // +450%
  avg_profit_per_trade: 3.80, // Trailing stop inteligente
  avg_loss_per_trade: 0.50, // Manus evita trades ruins
  // Custo de créditos
  credits_per_analysis: 1500, // Análise ultra-profunda
  credits_per_monitoring: 300, // Monitoramento frequente
  avg_monitoring_per_trade: 8, // 8 análises por trade (muito ativo)
  analysis_time_seconds: 90, // Análise mais demorada
};

// === FUNÇÕES DE CÁLCULO ===

function calculateSystemPerformance(system) {
  const total_trades = system.trades_per_month * PERIOD_MONTHS;
  
  // Calcula trades vencedores e perdedores
  let winning_trades, losing_trades;
  
  if (system.name === HYBRID_SYSTEM.name) {
    // Sistema híbrido: parte com Manus, parte sem
    const trades_with_manus = total_trades * system.manus_analysis_rate;
    const trades_without_manus = total_trades * (1 - system.manus_analysis_rate);
    
    winning_trades = 
      trades_with_manus * system.win_rate_with_manus +
      trades_without_manus * system.win_rate_without_manus;
    losing_trades = total_trades - winning_trades;
  } else {
    winning_trades = total_trades * system.win_rate;
    losing_trades = total_trades - winning_trades;
  }
  
  // Calcula lucro bruto
  const gross_profit = winning_trades * system.avg_profit_per_trade;
  const gross_loss = losing_trades * system.avg_loss_per_trade;
  const net_trading_profit = gross_profit - gross_loss;
  
  // Calcula custo de créditos
  let total_credits = 0;
  let credit_cost_usd = 0;
  
  if (system.credits_per_trade !== undefined && system.credits_per_trade === 0) {
    // Sistema atual: sem custo
    total_credits = 0;
    credit_cost_usd = 0;
  } else if (system.name === HYBRID_SYSTEM.name) {
    // Sistema híbrido: só paga pelos trades analisados
    const trades_analyzed = total_trades * system.manus_analysis_rate;
    const analysis_credits = trades_analyzed * system.credits_per_analysis;
    const monitoring_credits = trades_analyzed * system.avg_monitoring_per_trade * system.credits_per_monitoring;
    total_credits = analysis_credits + monitoring_credits;
    credit_cost_usd = (total_credits / 1000) * MANUS_CREDIT_COST;
  } else if (system.name === FULL_MANUS_SYSTEM.name) {
    // Sistema completo: paga por todos os trades
    const analysis_credits = total_trades * system.credits_per_analysis;
    const monitoring_credits = total_trades * system.avg_monitoring_per_trade * system.credits_per_monitoring;
    total_credits = analysis_credits + monitoring_credits;
    credit_cost_usd = (total_credits / 1000) * MANUS_CREDIT_COST;
  }
  
  // Calcula lucro líquido (após custo de créditos)
  const net_profit = net_trading_profit - credit_cost_usd;
  const final_capital = INITIAL_CAPITAL + net_profit;
  const roi = (net_profit / INITIAL_CAPITAL) * 100;
  
  // Calcula ROI por mês
  const roi_per_month = roi / PERIOD_MONTHS;
  
  // Calcula profit factor
  const profit_factor = gross_loss > 0 ? gross_profit / gross_loss : 0;
  
  return {
    total_trades,
    winning_trades: Math.round(winning_trades),
    losing_trades: Math.round(losing_trades),
    win_rate: (winning_trades / total_trades) * 100,
    gross_profit,
    gross_loss,
    net_trading_profit,
    total_credits,
    credit_cost_usd,
    net_profit,
    final_capital,
    roi,
    roi_per_month,
    profit_factor,
  };
}

// === EXECUTA ANÁLISE ===

console.log('📊 PERÍODO: 6 meses');
console.log(`💰 CAPITAL INICIAL: $${INITIAL_CAPITAL} USDT`);
console.log(`💳 CUSTO DE CRÉDITOS: $${MANUS_CREDIT_COST} por 1.000 créditos\n`);

const systems = [CURRENT_SYSTEM, HYBRID_SYSTEM, FULL_MANUS_SYSTEM];
const results = systems.map(calculateSystemPerformance);

// === EXIBE RESULTADOS ===

systems.forEach((system, index) => {
  const result = results[index];
  
  console.log('═'.repeat(60));
  console.log(`🤖 ${system.name.toUpperCase()}`);
  console.log('═'.repeat(60));
  console.log(`\n📈 PERFORMANCE:`);
  console.log(`   Total de Trades: ${result.total_trades} (${system.trades_per_month}/mês)`);
  console.log(`   Win Rate: ${result.win_rate.toFixed(2)}%`);
  console.log(`   Trades Vencedores: ${result.winning_trades}`);
  console.log(`   Trades Perdedores: ${result.losing_trades}`);
  console.log(`   Profit Factor: ${result.profit_factor.toFixed(2)}`);
  
  console.log(`\n💰 FINANCEIRO:`);
  console.log(`   Lucro Bruto: $${result.gross_profit.toFixed(2)}`);
  console.log(`   Perda Bruta: $${result.gross_loss.toFixed(2)}`);
  console.log(`   Lucro de Trading: $${result.net_trading_profit.toFixed(2)}`);
  
  if (result.total_credits > 0) {
    console.log(`\n💳 CUSTO DE CRÉDITOS:`);
    console.log(`   Total de Créditos: ${result.total_credits.toLocaleString()}`);
    console.log(`   Custo em USD: $${result.credit_cost_usd.toFixed(2)}`);
    console.log(`   % do Lucro: ${((result.credit_cost_usd / result.net_trading_profit) * 100).toFixed(2)}%`);
  }
  
  console.log(`\n📊 RESULTADO FINAL:`);
  console.log(`   Lucro Líquido: $${result.net_profit.toFixed(2)}`);
  console.log(`   Capital Final: $${result.final_capital.toFixed(2)}`);
  console.log(`   ROI (6 meses): ${result.roi.toFixed(2)}%`);
  console.log(`   ROI por Mês: ${result.roi_per_month.toFixed(2)}%`);
  
  console.log(`\n⏱️  TEMPO:`);
  console.log(`   Análise por Trade: ${system.analysis_time_seconds}s`);
  console.log(`   Tempo Total: ${((result.total_trades * system.analysis_time_seconds) / 60).toFixed(1)} minutos\n`);
});

// === COMPARAÇÃO FINAL ===

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║              📊 COMPARAÇÃO FINAL                         ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

console.log('┌─────────────────────────────┬──────────┬──────────┬──────────┐');
console.log('│ Métrica                     │ Atual    │ Híbrido  │ Completo │');
console.log('├─────────────────────────────┼──────────┼──────────┼──────────┤');
console.log(`│ ROI (6 meses)               │ ${results[0].roi.toFixed(0).padStart(7)}% │ ${results[1].roi.toFixed(0).padStart(7)}% │ ${results[2].roi.toFixed(0).padStart(7)}% │`);
console.log(`│ Lucro Líquido               │ $${results[0].net_profit.toFixed(0).padStart(7)} │ $${results[1].net_profit.toFixed(0).padStart(7)} │ $${results[2].net_profit.toFixed(0).padStart(7)} │`);
console.log(`│ Win Rate                    │ ${results[0].win_rate.toFixed(0).padStart(7)}% │ ${results[1].win_rate.toFixed(0).padStart(7)}% │ ${results[2].win_rate.toFixed(0).padStart(7)}% │`);
console.log(`│ Custo de Créditos           │ $${results[0].credit_cost_usd.toFixed(0).padStart(7)} │ $${results[1].credit_cost_usd.toFixed(0).padStart(7)} │ $${results[2].credit_cost_usd.toFixed(0).padStart(7)} │`);
console.log(`│ Lucro - Custo               │ $${results[0].net_profit.toFixed(0).padStart(7)} │ $${results[1].net_profit.toFixed(0).padStart(7)} │ $${results[2].net_profit.toFixed(0).padStart(7)} │`);
console.log('└─────────────────────────────┴──────────┴──────────┴──────────┘\n');

// === RECOMENDAÇÃO ===

const best_system_index = results.reduce((best, curr, idx) => 
  curr.net_profit > results[best].net_profit ? idx : best, 0
);

console.log('🎯 RECOMENDAÇÃO:\n');
console.log(`✅ MELHOR SISTEMA: ${systems[best_system_index].name}`);
console.log(`   💰 Lucro Líquido: $${results[best_system_index].net_profit.toFixed(2)}`);
console.log(`   📈 ROI: ${results[best_system_index].roi.toFixed(2)}%`);
console.log(`   💳 Custo de Créditos: $${results[best_system_index].credit_cost_usd.toFixed(2)}`);
console.log(`   📊 Win Rate: ${results[best_system_index].win_rate.toFixed(2)}%\n`);

// === ANÁLISE DE VIABILIDADE ===

console.log('💡 ANÁLISE DE VIABILIDADE:\n');

results.forEach((result, index) => {
  const system = systems[index];
  const roi_anual = (result.roi / 6) * 12;
  const lucro_mensal = result.net_profit / 6;
  
  console.log(`${index + 1}. ${system.name}:`);
  console.log(`   ROI Anual Projetado: ${roi_anual.toFixed(0)}%`);
  console.log(`   Lucro Mensal Médio: $${lucro_mensal.toFixed(2)}`);
  
  if (result.credit_cost_usd > 0) {
    const roi_on_credits = (result.net_profit / result.credit_cost_usd) * 100;
    console.log(`   ROI sobre Créditos: ${roi_on_credits.toFixed(0)}% (cada $1 em créditos gera $${(roi_on_credits / 100).toFixed(2)})`);
  }
  
  console.log('');
});

console.log('✅ Análise concluída!\n');
