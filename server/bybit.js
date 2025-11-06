// Integração com Bybit API

import axios from 'axios';
import crypto from 'crypto';

const BYBIT_API_URL = 'https://api.bybit.com';
const API_KEY = process.env.BYBIT_API_KEY || '';
const API_SECRET = process.env.BYBIT_API_SECRET || '';

/**
 * Gera assinatura para requisições autenticadas
 */
function generateSignature(params, timestamp) {
  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  const message = `${queryString}&timestamp=${timestamp}`;
  const signature = crypto
    .createHmac('sha256', API_SECRET)
    .update(message)
    .digest('hex');

  return signature;
}

/**
 * Faz requisição autenticada para Bybit
 */
async function authenticatedRequest(method, path, params = {}) {
  try {
    const timestamp = Date.now();
    const signature = generateSignature(params, timestamp);

    const config = {
      method,
      url: `${BYBIT_API_URL}${path}`,
      headers: {
        'X-BYBIT-API-KEY': API_KEY,
        'X-BYBIT-TIMESTAMP': timestamp,
        'X-BYBIT-SIGN': signature,
      },
    };

    if (method === 'GET') {
      config.params = { ...params, timestamp };
    } else {
      config.data = { ...params, timestamp };
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('Bybit API Error:', error.message);
    throw error;
  }
}

/**
 * Busca dados de velas (candles) para uma moeda
 */
export async function getKlines(symbol, interval = '5', limit = 200) {
  try {
    const response = await axios.get(`${BYBIT_API_URL}/v5/market/kline`, {
      params: {
        category: 'linear',
        symbol,
        interval,
        limit,
      },
    });

    if (response.data.retCode === 0) {
      return response.data.result.list.map((candle) => ({
        timestamp: parseInt(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error fetching klines for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Busca preço atual de uma moeda
 */
export async function getPrice(symbol) {
  try {
    const response = await axios.get(`${BYBIT_API_URL}/v5/market/tickers`, {
      params: {
        category: 'linear',
        symbol,
      },
    });

    if (response.data.retCode === 0 && response.data.result.list.length > 0) {
      const ticker = response.data.result.list[0];
      return {
        symbol,
        price: parseFloat(ticker.lastPrice),
        bid: parseFloat(ticker.bid1Price),
        ask: parseFloat(ticker.ask1Price),
        volume24h: parseFloat(ticker.volume24h),
        change24h: parseFloat(ticker.price24hPcnt) * 100,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Busca saldo da conta
 */
export async function getBalance() {
  try {
    const response = await authenticatedRequest('GET', '/v5/account/wallet-balance', {
      accountType: 'UNIFIED',
    });

    if (response.retCode === 0) {
      const coins = response.result.list[0].coin;
      const balance = {};

      coins.forEach((coin) => {
        balance[coin.coin] = {
          available: parseFloat(coin.availableToWithdraw),
          total: parseFloat(coin.walletBalance),
          equity: parseFloat(coin.equity),
        };
      });

      return balance;
    }

    return {};
  } catch (error) {
    console.error('Error fetching balance:', error.message);
    return {};
  }
}

/**
 * Abre uma posição de trading
 */
export async function openPosition(symbol, side, quantity, leverage, stopLoss, takeProfit) {
  try {
    const params = {
      category: 'linear',
      symbol,
      side: side.toUpperCase(),
      orderType: 'Market',
      qty: quantity.toString(),
      leverage: leverage.toString(),
      positionIdx: 0,
    };

    // Adiciona stop loss e take profit se fornecidos
    if (stopLoss) {
      params.stopLoss = stopLoss.toString();
      params.slTriggerBy = 'LastPrice';
    }

    if (takeProfit) {
      params.takeProfit = takeProfit.toString();
      params.tpTriggerBy = 'LastPrice';
    }

    const response = await authenticatedRequest('POST', '/v5/order/create', params);

    if (response.retCode === 0) {
      return {
        orderId: response.result.orderId,
        symbol,
        side,
        quantity,
        leverage,
        status: 'opened',
      };
    }

    console.error('Error opening position:', response.retMsg);
    return null;
  } catch (error) {
    console.error('Error opening position:', error.message);
    return null;
  }
}

/**
 * Fecha uma posição de trading
 */
export async function closePosition(symbol, side) {
  try {
    const params = {
      category: 'linear',
      symbol,
      side: side === 'Buy' ? 'Sell' : 'Buy',
      orderType: 'Market',
      qty: '0', // Fecha posição inteira
      positionIdx: 0,
      reduceOnly: true,
    };

    const response = await authenticatedRequest('POST', '/v5/order/create', params);

    if (response.retCode === 0) {
      return {
        orderId: response.result.orderId,
        symbol,
        status: 'closed',
      };
    }

    console.error('Error closing position:', response.retMsg);
    return null;
  } catch (error) {
    console.error('Error closing position:', error.message);
    return null;
  }
}

/**
 * Busca posições abertas
 */
export async function getOpenPositions() {
  try {
    const response = await authenticatedRequest('GET', '/v5/position/list', {
      category: 'linear',
      settleCoin: 'USDT',
    });

    if (response.retCode === 0) {
      return response.result.list.map((pos) => ({
        symbol: pos.symbol,
        side: pos.side,
        size: parseFloat(pos.size),
        entryPrice: parseFloat(pos.avgPrice),
        currentPrice: parseFloat(pos.markPrice),
        leverage: parseFloat(pos.leverage),
        unrealizedPnl: parseFloat(pos.unrealisedPnl),
        unrealizedPnlPercent: parseFloat(pos.unrealisedPnlPcnt) * 100,
        stopLoss: pos.stopLoss ? parseFloat(pos.stopLoss) : null,
        takeProfit: pos.takeProfit ? parseFloat(pos.takeProfit) : null,
      }));
    }

    return [];
  } catch (error) {
    console.error('Error fetching open positions:', error.message);
    return [];
  }
}

/**
 * Busca histórico de trades
 */
export async function getTradeHistory(symbol = null, limit = 50) {
  try {
    const params = {
      category: 'linear',
      limit,
    };

    if (symbol) {
      params.symbol = symbol;
    }

    const response = await authenticatedRequest('GET', '/v5/execution/list', params);

    if (response.retCode === 0) {
      return response.result.list.map((trade) => ({
        orderId: trade.orderId,
        symbol: trade.symbol,
        side: trade.side,
        size: parseFloat(trade.qty),
        price: parseFloat(trade.execPrice),
        fee: parseFloat(trade.execFee),
        timestamp: parseInt(trade.execTime),
        pnl: parseFloat(trade.closedPnl) || 0,
      }));
    }

    return [];
  } catch (error) {
    console.error('Error fetching trade history:', error.message);
    return [];
  }
}

/**
 * Modifica alavancagem de uma posição
 */
export async function setLeverage(symbol, leverage) {
  try {
    const response = await authenticatedRequest('POST', '/v5/position/set-leverage', {
      category: 'linear',
      symbol,
      buyLeverage: leverage.toString(),
      sellLeverage: leverage.toString(),
    });

    if (response.retCode === 0) {
      return true;
    }

    console.error('Error setting leverage:', response.retMsg);
    return false;
  } catch (error) {
    console.error('Error setting leverage:', error.message);
    return false;
  }
}

/**
 * Verifica se API está conectada
 */
export async function testConnection() {
  try {
    const response = await axios.get(`${BYBIT_API_URL}/v5/market/tickers`, {
      params: {
        category: 'linear',
        symbol: 'BTCUSDT',
      },
    });

    return response.data.retCode === 0;
  } catch (error) {
    console.error('Connection test failed:', error.message);
    return false;
  }
}
