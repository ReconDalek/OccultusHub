import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getStockListFromCache, getStockDetailFromCache, getStockHistory, fetchAndCacheStockDetail } from '../services/stocksService.js';

export async function refreshStockHistory(request, env) {
  try {
    const result = await fetchAndCacheStockDetail(env);
    return jsonResponse({ success: true, ...result });
  } catch (e) {
    return errorResponse('Refresh failed: ' + e.message, 500);
  }
}

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

    const detailCached = await getStockDetailFromCache(env, stockId);
    let stock = detailCached?.stock;

    if (!stock) {
      // Fall back to list cache (no chart data, but at least has price)
      const listCached = await getStockListFromCache(env);
      if (!listCached) return errorResponse('Stock data not yet cached', 503);
      const arr = Array.isArray(listCached.stocks) ? listCached.stocks : Object.values(listCached.stocks || {});
      stock = arr.find(s => s.id === stockId);
    }

    if (!stock) return errorResponse('Stock not found', 404);

    // Our own long-term hourly history (builds up over days/weeks)
    const storedHistory = await getStockHistory(env, stockId);

    return jsonResponse({ stock, history: storedHistory });
  } catch (e) {
    return errorResponse('Failed to fetch stock detail: ' + e.message, 500);
  }
}
