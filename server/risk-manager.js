/**
 * Risk Manager - Gestão Inteligente de Risco
 * Calcula quanto usar de cada trade baseado em quantidade mínima e saldo disponível
 */

// Quantidades mínimas por moeda na Bybit (aproximadas)
const MIN_QUANTITIES = {
  'BTCUSDT': 0.001,    // ~$100
  'ETHUSDT': 0.01,     // ~$40
  'BNBUSDT': 0.01,     // ~$6
  'SOLUSDT': 0.1,      // ~$20
  'XRPUSDT': 10,       // ~$25
  'ADAUSDT': 10,       // ~$10
  'DOGEUSDT': 100,     // ~$40
  'LINKUSDT': 1,       // ~$20
  'AVAXUSDT': 0.1,     // ~$4
  'MATICUSDT': 10,     // ~$10
  'LTCUSDT': 0.1,      // ~$10
  'UNIUSDT': 1,        // ~$15
  'ATOMUSDT': 1,       // ~$10
  'APTUSDT': 1,        // ~$10
  'FILUSDT': 1,        // ~$5
};

/**
 * Calcula o risco percentual ideal para um trade
 * @param {string} symbol - Símbolo da moeda
 * @param {number} price - Preço atual
 * @param {number} totalBalance - Saldo total disponível
 * @param {number} leverage - Alavancagem
 * @returns {object} { riskPercent, quantity, estimatedCost }
 */
export function calculateOptimalRisk(symbol, price, totalBalance, leverage = 1) {
  const minQty = MIN_QUANTITIES[symbol] || 0.001;
  
  // Calcula custo mínimo (quantidade mínima / alavancagem)
  const minCost = (minQty * price) / leverage;
  
  // Calcula percentual mínimo necessário
  const minRiskPercent = (minCost / totalBalance) * 100;
  
  // Define percentual ideal (entre 5% e 20%)
  let optimalRiskPercent;
  
  if (minRiskPercent <= 5) {
    // Se quantidade mínima cabe em 5%, usa 5%
    optimalRiskPercent = 5;
  } else if (minRiskPercent <= 20) {
    // Se quantidade mínima precisa entre 5-20%, usa o mínimo necessário
    optimalRiskPercent = Math.ceil(minRiskPercent);
  } else {
    // Se quantidade mínima precisa mais de 20%, não opera
    return {
      canTrade: false,
      reason: `Quantidade mínima requer ${minRiskPercent.toFixed(1)}% do saldo (máximo: 20%)`,
      riskPercent: 0,
      quantity: 0,
      estimatedCost: 0
    };
  }
  
  // Calcula quantidade baseada no risco ideal
  const riskAmount = totalBalance * (optimalRiskPercent / 100);
  const quantity = (riskAmount * leverage) / price;
  
  // Garante que atende quantidade mínima
  const finalQuantity = Math.max(quantity, minQty);
  const finalCost = (finalQuantity * price) / leverage;
  const finalRiskPercent = (finalCost / totalBalance) * 100;
  
  return {
    canTrade: true,
    riskPercent: finalRiskPercent,
    quantity: finalQuantity,
    estimatedCost: finalCost,
    minQuantity: minQty,
    usedMinimum: finalQuantity === minQty
  };
}

/**
 * Verifica se ainda há saldo disponível para novos trades
 * @param {number} totalBalance - Saldo total
 * @param {number} usedBalance - Saldo já alocado em trades abertos
 * @param {number} requiredPercent - Percentual necessário para o novo trade
 * @returns {boolean}
 */
export function hasAvailableBalance(totalBalance, usedBalance, requiredPercent) {
  const availableBalance = totalBalance - usedBalance;
  const requiredAmount = totalBalance * (requiredPercent / 100);
  
  return availableBalance >= requiredAmount;
}

/**
 * Calcula saldo total alocado em trades abertos
 * @param {Array} openPositions - Posições abertas
 * @returns {number}
 */
export function calculateUsedBalance(openPositions) {
  return openPositions.reduce((total, pos) => {
    const positionValue = (pos.quantity * pos.entryPrice) / (pos.leverage || 1);
    return total + positionValue;
  }, 0);
}

/**
 * Ordena sinais por prioridade (maior confiança primeiro)
 * @param {Array} signals - Sinais de trading
 * @returns {Array}
 */
export function prioritizeSignals(signals) {
  return signals.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Seleciona quais trades executar baseado em saldo disponível
 * @param {Array} signals - Sinais de trading
 * @param {number} totalBalance - Saldo total
 * @param {Array} openPositions - Posições já abertas
 * @returns {Array} Sinais selecionados para execução
 */
export function selectTradesToExecute(signals, totalBalance, openPositions) {
  const usedBalance = calculateUsedBalance(openPositions);
  const prioritized = prioritizeSignals(signals);
  const selected = [];
  
  let currentUsed = usedBalance;
  
  for (const signal of prioritized) {
    const risk = calculateOptimalRisk(
      signal.symbol,
      signal.price,
      totalBalance,
      signal.leverage
    );
    
    if (!risk.canTrade) {
      console.log(`[Risk] ❌ ${signal.symbol}: ${risk.reason}`);
      continue;
    }
    
    // Verifica se há saldo disponível
    const availableBalance = totalBalance - currentUsed;
    
    if (availableBalance >= risk.estimatedCost) {
      selected.push({
        ...signal,
        riskPercent: risk.riskPercent,
        quantity: risk.quantity,
        estimatedCost: risk.estimatedCost
      });
      
      currentUsed += risk.estimatedCost;
      
      console.log(`[Risk] ✅ ${signal.symbol}: ${risk.riskPercent.toFixed(1)}% (${risk.quantity} moedas, $${risk.estimatedCost.toFixed(2)})`);
    } else {
      console.log(`[Risk] ⏭️  ${signal.symbol}: Saldo insuficiente (disponível: $${availableBalance.toFixed(2)}, necessário: $${risk.estimatedCost.toFixed(2)})`);
    }
  }
  
  console.log(`[Risk] Total selecionado: ${selected.length}/${signals.length} trades`);
  console.log(`[Risk] Saldo alocado: $${currentUsed.toFixed(2)}/${totalBalance.toFixed(2)} (${((currentUsed/totalBalance)*100).toFixed(1)}%)`);
  
  return selected;
}

export default {
  calculateOptimalRisk,
  hasAvailableBalance,
  calculateUsedBalance,
  prioritizeSignals,
  selectTradesToExecute
};
