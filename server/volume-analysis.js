// Análise de Volume e Order Flow

/**
 * Analisa perfil de volume
 */
export function analyzeVolumeProfile(candles, bins = 20) {
  if (candles.length < 20) {
    return {
      poc: 0, // Point of Control
      vah: 0, // Value Area High
      val: 0, // Value Area Low
      signal: 'NEUTRAL',
    };
  }

  // Encontra range de preços
  const prices = candles.flatMap((c) => [c.high, c.low]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  const binSize = priceRange / bins;

  // Cria bins de volume
  const volumeBins = new Array(bins).fill(0);

  candles.forEach((candle) => {
    const binIndex = Math.min(
      bins - 1,
      Math.floor((candle.close - minPrice) / binSize)
    );
    volumeBins[binIndex] += candle.volume;
  });

  // Encontra POC (bin com maior volume)
  const maxVolumeIndex = volumeBins.indexOf(Math.max(...volumeBins));
  const poc = minPrice + maxVolumeIndex * binSize + binSize / 2;

  // Calcula Value Area (70% do volume)
  const totalVolume = volumeBins.reduce((a, b) => a + b, 0);
  const targetVolume = totalVolume * 0.7;
  let accumulatedVolume = volumeBins[maxVolumeIndex];
  let lowIndex = maxVolumeIndex;
  let highIndex = maxVolumeIndex;

  while (accumulatedVolume < targetVolume && (lowIndex > 0 || highIndex < bins - 1)) {
    const lowVolume = lowIndex > 0 ? volumeBins[lowIndex - 1] : 0;
    const highVolume = highIndex < bins - 1 ? volumeBins[highIndex + 1] : 0;

    if (lowVolume > highVolume && lowIndex > 0) {
      lowIndex--;
      accumulatedVolume += lowVolume;
    } else if (highIndex < bins - 1) {
      highIndex++;
      accumulatedVolume += highVolume;
    } else {
      break;
    }
  }

  const val = minPrice + lowIndex * binSize;
  const vah = minPrice + (highIndex + 1) * binSize;

  // Determina sinal baseado na posição do preço atual
  const currentPrice = candles[candles.length - 1].close;
  let signal = 'NEUTRAL';

  if (currentPrice > vah) {
    signal = 'BULLISH'; // Preço acima da Value Area
  } else if (currentPrice < val) {
    signal = 'BEARISH'; // Preço abaixo da Value Area
  } else if (currentPrice > poc) {
    signal = 'SLIGHTLY_BULLISH';
  } else if (currentPrice < poc) {
    signal = 'SLIGHTLY_BEARISH';
  }

  return { poc, vah, val, signal };
}

/**
 * Analisa order flow (compra vs venda)
 */
export function analyzeOrderFlow(candles) {
  if (candles.length < 20) {
    return {
      buyVolume: 0,
      sellVolume: 0,
      ratio: 1,
      pressure: 'NEUTRAL',
    };
  }

  let buyVolume = 0;
  let sellVolume = 0;

  // Estima volume de compra/venda baseado no movimento de preço
  candles.forEach((candle) => {
    const priceChange = candle.close - candle.open;
    const volume = candle.volume;

    if (priceChange > 0) {
      // Vela verde = mais compra
      const buyRatio = priceChange / (candle.high - candle.low);
      buyVolume += volume * buyRatio;
      sellVolume += volume * (1 - buyRatio);
    } else if (priceChange < 0) {
      // Vela vermelha = mais venda
      const sellRatio = Math.abs(priceChange) / (candle.high - candle.low);
      sellVolume += volume * sellRatio;
      buyVolume += volume * (1 - sellRatio);
    } else {
      // Doji = neutro
      buyVolume += volume / 2;
      sellVolume += volume / 2;
    }
  });

  const ratio = sellVolume === 0 ? 10 : buyVolume / sellVolume;

  let pressure = 'NEUTRAL';
  if (ratio > 1.5) pressure = 'STRONG_BUY';
  else if (ratio > 1.2) pressure = 'BUY';
  else if (ratio < 0.67) pressure = 'STRONG_SELL';
  else if (ratio < 0.83) pressure = 'SELL';

  return {
    buyVolume,
    sellVolume,
    ratio,
    pressure,
  };
}

/**
 * Identifica zonas de suporte e resistência
 */
export function identifySupportResistance(candles, tolerance = 0.02) {
  if (candles.length < 50) {
    return {
      supports: [],
      resistances: [],
      nearestSupport: 0,
      nearestResistance: 0,
      signal: 'NEUTRAL',
    };
  }

  const currentPrice = candles[candles.length - 1].close;
  const prices = candles.map((c) => c.close);

  // Encontra pivots (máximos e mínimos locais)
  const pivots = [];
  for (let i = 5; i < candles.length - 5; i++) {
    const slice = prices.slice(i - 5, i + 6);
    const price = prices[i];

    if (price === Math.max(...slice)) {
      pivots.push({ price, type: 'resistance' });
    } else if (price === Math.min(...slice)) {
      pivots.push({ price, type: 'support' });
    }
  }

  // Agrupa pivots próximos
  const supports = [];
  const resistances = [];

  pivots.forEach((pivot) => {
    const list = pivot.type === 'support' ? supports : resistances;
    const existing = list.find((p) => Math.abs(p - pivot.price) / pivot.price < tolerance);

    if (existing) {
      // Atualiza para média
      const index = list.indexOf(existing);
      list[index] = (existing + pivot.price) / 2;
    } else {
      list.push(pivot.price);
    }
  });

  // Ordena
  supports.sort((a, b) => b - a); // Maior para menor
  resistances.sort((a, b) => a - b); // Menor para maior

  // Encontra suporte/resistência mais próximos
  const nearestSupport = supports.find((s) => s < currentPrice) || 0;
  const nearestResistance = resistances.find((r) => r > currentPrice) || 0;

  // Determina sinal
  let signal = 'NEUTRAL';
  const distanceToSupport = nearestSupport ? (currentPrice - nearestSupport) / currentPrice : 1;
  const distanceToResistance = nearestResistance
    ? (nearestResistance - currentPrice) / currentPrice
    : 1;

  if (distanceToSupport < 0.01) {
    signal = 'NEAR_SUPPORT'; // Próximo de suporte = possível compra
  } else if (distanceToResistance < 0.01) {
    signal = 'NEAR_RESISTANCE'; // Próximo de resistência = possível venda
  }

  return {
    supports: supports.slice(0, 3),
    resistances: resistances.slice(0, 3),
    nearestSupport,
    nearestResistance,
    signal,
  };
}

/**
 * Analisa liquidez do mercado
 */
export function analyzeLiquidity(candles) {
  if (candles.length < 20) {
    return {
      avgVolume: 0,
      currentVolume: 0,
      liquidity: 'LOW',
      score: 0,
    };
  }

  const volumes = candles.map((c) => c.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = currentVolume / avgVolume;

  let liquidity = 'LOW';
  let score = 0;

  if (volumeRatio > 2) {
    liquidity = 'VERY_HIGH';
    score = 100;
  } else if (volumeRatio > 1.5) {
    liquidity = 'HIGH';
    score = 80;
  } else if (volumeRatio > 1) {
    liquidity = 'NORMAL';
    score = 60;
  } else if (volumeRatio > 0.5) {
    liquidity = 'LOW';
    score = 40;
  } else {
    liquidity = 'VERY_LOW';
    score = 20;
  }

  return {
    avgVolume,
    currentVolume,
    liquidity,
    score,
  };
}

/**
 * Análise completa de volume
 */
export function analyzeCompleteVolume(candles) {
  return {
    profile: analyzeVolumeProfile(candles),
    orderFlow: analyzeOrderFlow(candles),
    supportResistance: identifySupportResistance(candles),
    liquidity: analyzeLiquidity(candles),
  };
}
