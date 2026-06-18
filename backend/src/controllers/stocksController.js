import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getStockListFromCache, getStockDetailFromCache, getStockHistory } from '../services/stocksService.js';

export async function getStocksList(request, env) {
  try {
    const cached = await getStockListFromCache(env);
    if (!cached) return errorResponse('Stock data not yet cached', 503);
    return jsonResponse({ stocks: cached.stocks, fetched_at: cached.fetched_at });
  } catch (e) {
    return errorResponse('Failed to fetch stocks list: ' + e.message, 500);
  }
}

export async function getStockDetail(request, env) {
  try {
    const url = new URL(request.url);
    const stockId = parseInt(url.pathname.split('/').pop());
    if (!stockId || stockId < 1 || stockId > 35) return errorResponse('Invalid stock ID', 400);

    // Prefer detail cache (has performance data); fall back to list cache
    const detailCached = await getStockDetailFromCache(env, stockId);
    let stock = detailCached?.stock;

    if (!stock) {
      const listCached = await getStockListFromCache(env);
      if (!listCached) return errorResponse('Stock data not yet cached', 503);
      const arr = Array.isArray(listCached.stocks) ? listCached.stocks : Object.values(listCached.stocks || {});
      stock = arr.find(s => s.id === stockId);
    }

    if (!stock) return errorResponse('Stock not found', 404);

    const history = await getStockHistory(env, stockId);

    return jsonResponse({ stock, history });
  } catch (e) {
    return errorResponse('Failed to fetch stock detail: ' + e.message, 500);
  }
}
