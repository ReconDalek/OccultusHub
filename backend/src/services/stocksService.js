import { fetchWithRetry } from './tornApiService.js';

const TORN_API_BASE = 'https://api.torn.com/v2';
const STOCK_IDS = Array.from({ length: 35 }, (_, i) => i + 1);

async function getApiKey(env) {
  const row = await env.DB.prepare(
    `SELECT api_key FROM users WHERE api_key IS NOT NULL ORDER BY RANDOM() LIMIT 1`
  ).first();
  if (!row?.api_key) return null;
  try { return atob(row.api_key); } catch { return row.api_key; }
}

export async function fetchAndCacheStockList(env) {
  const key = await getApiKey(env);
  if (!key) throw new Error('No API key available');

  const json = await fetchWithRetry(
    `${TORN_API_BASE}/torn/stocks?selections=stocks`,
    { Authorization: `ApiKey ${key}` }
  );

  if (!json?.stocks) throw new Error('Unexpected Torn stocks response');

  await env.DB.prepare(`DELETE FROM stock_list_cache`).run();
  await env.DB.prepare(`INSERT INTO stock_list_cache (data) VALUES (?)`).bind(JSON.stringify(json.stocks)).run();

  return { count: json.stocks.length };
}

export async function fetchAndCacheStockDetail(env) {
  // Correct endpoint: /v2/torn/{stockId}/stocks  (ID in path, not query param)
  // Response includes chart.performance AND chart.history (60 min at 1-min granularity)
  let written = 0;
  const errors = [];

  for (const stockId of STOCK_IDS) {
    // Rotate API key per request to spread load
    const key = await getApiKey(env);
    if (!key) { errors.push(`${stockId}: no api key`); continue; }

    try {
      const json = await fetchWithRetry(
        `${TORN_API_BASE}/torn/${stockId}/stocks`,
        { Authorization: `ApiKey ${key}` }
      );

      // Response: { stocks: { id, name, market, bonus, chart: { performance, history } } }
      const stock = json?.stocks;
      if (!stock || typeof stock !== 'object' || Array.isArray(stock)) {
        errors.push(`${stockId}: unexpected shape`);
        continue;
      }

      // Write current price to our long-term hourly history table
      if (stock.market?.price != null) {
        await env.DB.prepare(
          `INSERT INTO stock_price_history (stock_id, price) VALUES (?, ?)`
        ).bind(stockId, stock.market.price).run();
      }

      // Cache full detail — includes chart.performance and chart.history (1-hr at 1-min)
      await env.DB.prepare(
        `INSERT INTO stock_detail_cache (stock_id, data) VALUES (?, ?)
         ON CONFLICT(stock_id) DO UPDATE SET data = excluded.data, fetched_at = CURRENT_TIMESTAMP`
      ).bind(stockId, JSON.stringify(stock)).run();

      written++;
    } catch (e) {
      errors.push(`${stockId}: ${e.message}`);
    }
  }

  // Prune our long-term history older than 90 days
  await env.DB.prepare(
    `DELETE FROM stock_price_history WHERE recorded_at < datetime('now', '-90 days')`
  ).run();

  return { written, errors };
}

function computeRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change; else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  // Wilder's smoothing over remaining periods
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

export async function getStockListFromCache(env) {
  const row = await env.DB.prepare(`SELECT data, fetched_at FROM stock_list_cache ORDER BY id DESC LIMIT 1`).first();
  if (!row) return null;

  const stocks = JSON.parse(row.data);

  // Merge chart.performance from detail cache
  const { results: detailRows } = await env.DB.prepare(
    `SELECT stock_id, json_extract(data, '$.chart.performance') as perf FROM stock_detail_cache`
  ).all();
  const perfMap = {};
  for (const d of detailRows) {
    if (d.perf) perfMap[d.stock_id] = JSON.parse(d.perf);
  }

  // Compute RSI using last 20 hourly price points per stock (14-period + 6 for Wilder smoothing)
  const { results: histRows } = await env.DB.prepare(`
    SELECT stock_id, price FROM (
      SELECT stock_id, price, ROW_NUMBER() OVER (PARTITION BY stock_id ORDER BY recorded_at DESC) as rn
      FROM stock_price_history
    ) WHERE rn <= 20 ORDER BY stock_id, rn DESC
  `).all();
  const histMap = {};
  for (const h of histRows) {
    if (!histMap[h.stock_id]) histMap[h.stock_id] = [];
    histMap[h.stock_id].push(h.price);
  }
  const rsiMap = {};
  for (const [id, prices] of Object.entries(histMap)) {
    rsiMap[id] = computeRSI(prices);
  }

  const enriched = stocks.map(s => ({
    ...s,
    chart: { performance: perfMap[s.id] ?? null },
    rsi: rsiMap[s.id] ?? null,
  }));

  return { stocks: enriched, fetched_at: row.fetched_at };
}

export async function getStockDetailFromCache(env, stockId) {
  const row = await env.DB.prepare(
    `SELECT data, fetched_at FROM stock_detail_cache WHERE stock_id = ?`
  ).bind(stockId).first();
  if (!row) return null;
  return { stock: JSON.parse(row.data), fetched_at: row.fetched_at };
}

export async function getStockHistory(env, stockId) {
  const { results } = await env.DB.prepare(
    `SELECT price, recorded_at FROM stock_price_history
     WHERE stock_id = ?
     ORDER BY recorded_at DESC
     LIMIT 2016`
  ).bind(stockId).all();
  return results.reverse();
}
