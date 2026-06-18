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

  const res = await fetch(`${TORN_API_BASE}/torn/stocks?selections=stocks`, {
    headers: { Authorization: `ApiKey ${key}` },
  });
  if (!res.ok) throw new Error(`Torn API error: ${res.status}`);
  const json = await res.json();

  if (!json?.stocks) throw new Error('Unexpected Torn stocks response');

  await env.DB.prepare(`DELETE FROM stock_list_cache`).run();
  await env.DB.prepare(`INSERT INTO stock_list_cache (data) VALUES (?)`).bind(JSON.stringify(json.stocks)).run();

  return { count: json.stocks.length };
}

export async function fetchAndCacheStockDetail(env) {
  const key = await getApiKey(env);
  if (!key) throw new Error('No API key available');

  const errors = [];
  let fetched = 0;

  for (const stockId of STOCK_IDS) {
    try {
      const res = await fetch(`${TORN_API_BASE}/torn/stocks?id=${stockId}&selections=stocks`, {
        headers: { Authorization: `ApiKey ${key}` },
      });
      if (!res.ok) { errors.push(`${stockId}: HTTP ${res.status}`); continue; }
      const json = await res.json();

      const stockArr = Array.isArray(json?.stocks) ? json.stocks : Object.values(json?.stocks || {});
      const stock = stockArr[0];
      if (!stock) { errors.push(`${stockId}: no stock data`); continue; }

      // Store latest price in history
      if (stock.market?.price) {
        await env.DB.prepare(
          `INSERT INTO stock_price_history (stock_id, price) VALUES (?, ?)`
        ).bind(stockId, stock.market.price).run();
      }

      // Cache full detail (includes chart.performance)
      await env.DB.prepare(
        `INSERT INTO stock_detail_cache (stock_id, data) VALUES (?, ?)
         ON CONFLICT(stock_id) DO UPDATE SET data = excluded.data, fetched_at = CURRENT_TIMESTAMP`
      ).bind(stockId, JSON.stringify(stock)).run();

      fetched++;
    } catch (e) {
      errors.push(`${stockId}: ${e.message}`);
    }
  }

  // Prune history older than 90 days
  await env.DB.prepare(
    `DELETE FROM stock_price_history WHERE recorded_at < datetime('now', '-90 days')`
  ).run();

  return { fetched, errors };
}

export async function getStockListFromCache(env) {
  const row = await env.DB.prepare(`SELECT data, fetched_at FROM stock_list_cache ORDER BY id DESC LIMIT 1`).first();
  if (!row) return null;
  return { stocks: JSON.parse(row.data), fetched_at: row.fetched_at };
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
