import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getStaffApiKeyForFaction, fetchWithRetry, getRandomUserApiKey } from '../services/tornApiService.js';
import { ARMORY_IGNORE } from './warController.js';

const FACTION_IDS = [33097, 9171, 9728];

// Torn removed the old combined `/v2/faction?selections=armor,boosters,...`
// endpoint — `/v2/faction/inventory` replaces it but only returns ONE
// category per call (cat= query param), so a full refresh now needs one
// call per category per faction. `caches`/`cesium` (old selections) no
// longer exist as categories; `consumables`/`utilities`/`loot` are new.
const ARMORY_CATEGORIES = ['weapons', 'armor', 'temporary', 'medical', 'consumables', 'drugs', 'boosters', 'utilities', 'loot'];

export async function fetchAndCacheArmory(env) {
  const results = { fetched: 0, errors: [] };

  for (const factionId of FACTION_IDS) {
    console.log(`[armory] fetching faction ${factionId}...`);
    try {
      const apiKeyObj = await getStaffApiKeyForFaction(env, factionId);
      if (!apiKeyObj?.key) {
        const err = 'No API key available for this faction';
        console.error(`[armory] faction ${factionId}: ${err}`);
        results.errors.push({ factionId, error: err });
        continue;
      }
      console.log(`[armory] faction ${factionId}: using key from user ${apiKeyObj.tornUserId} (${apiKeyObj.username})`);

      // Reassemble into the same category-keyed shape (data.weapons = [...],
      // data.drugs = [...], etc.) every existing consumer (getArmory,
      // ArmoryTab's loan-detail expander, the low-stock webhook) already
      // expects, with items normalized back to the old field names (new API
      // uses lowercase id/amount, one row per loan instead of one row per item).
      //
      // IMPORTANT: the new endpoint returns a SEPARATE inventory row per loan
      // in addition to the main unloaned stack — e.g. a Blood Bag with 44 in
      // the armory and 3 individually loaned out to members comes back as
      // FOUR rows, all sharing the same item id: {amount:44, loaned:null},
      // {amount:1, loaned:{id,name}} × 3. The old API exposed one row per
      // item with quantity/available/loaned/loaned_to already computed, which
      // ArmoryTab.jsx's loan-detail expander still relies on — so rows
      // sharing an id are merged back into that shape: `quantity` is the
      // real total (all rows summed — confirmed against a live mismatch:
      // Blood Bag: Irradiated and Ipecac Syrup, both partly loaned, were
      // caching as 1 instead of their true 47/117 totals when rows weren't
      // merged), `available` is the loaned:null portion, `loaned` is the
      // count on loan, `loaned_to` is a comma-joined list of borrower torn
      // IDs (repeated per unit) matching the old delimited-list format
      // LoanExpandedRow already parses with `.split(',')`.
      const data = {};
      const categoryErrors = [];
      for (const cat of ARMORY_CATEGORIES) {
        try {
          const url = `https://api.torn.com/v2/faction/inventory?cat=${cat}`;
          const catData = await fetchWithRetry(url, { Authorization: `ApiKey ${apiKeyObj.key}` });
          if (catData?.error) {
            categoryErrors.push(`${cat}: ${catData.error.code} ${catData.error.error}`);
            continue;
          }
          const merged = new Map(); // item id -> aggregated row
          for (const item of (catData.inventory || [])) {
            let row = merged.get(item.id);
            if (!row) {
              row = { ID: item.id, name: item.name, type: item.type, quantity: 0, available: 0, loaned: 0, loanedTo: [], uids: [] };
              merged.set(item.id, row);
            }
            const amt = item.amount ?? 0;
            row.quantity += amt;
            if (item.loaned) {
              row.loaned += amt;
              for (let i = 0; i < amt; i++) row.loanedTo.push(item.loaned.id);
            } else {
              row.available += amt;
            }
            if (Array.isArray(item.uids)) row.uids.push(...item.uids);
          }
          data[cat] = Array.from(merged.values()).map(r => ({
            ID:        r.ID,
            name:      r.name,
            type:      r.type,
            quantity:  r.quantity,
            available: r.available,
            loaned:    r.loaned,
            loaned_to: r.loanedTo.join(','),
            uids:      r.uids,
          }));
        } catch (catErr) {
          categoryErrors.push(`${cat}: ${catErr.message}`);
        }
      }

      if (categoryErrors.length) {
        console.warn(`[armory] faction ${factionId}: category errors — ${categoryErrors.join('; ')}`);
      }
      if (!Object.keys(data).length) {
        const err = `All categories failed: ${categoryErrors.join('; ')}`;
        console.error(`[armory] faction ${factionId}: ${err}`);
        results.errors.push({ factionId, error: err });
        continue;
      }

      const categories = Object.keys(data).filter(k => Array.isArray(data[k]));
      const totalItems = categories.reduce((s, k) => s + data[k].length, 0);
      console.log(`[armory] faction ${factionId}: got ${totalItems} item types across [${categories.join(', ')}]`);

      await env.DB.prepare(
        `INSERT INTO armory_cache (faction_id, data, fetched_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(faction_id) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at`
      ).bind(factionId, JSON.stringify(data)).run();

      console.log(`[armory] faction ${factionId}: cached successfully`);
      results.fetched++;
      if (categoryErrors.length) results.errors.push({ factionId, error: `Partial (some categories failed): ${categoryErrors.join('; ')}` });
    } catch (e) {
      console.error(`[armory] faction ${factionId} failed:`, e.message, e.stack ?? '');
      results.errors.push({ factionId, error: e.message });
    }
  }

  console.log(`[armory] done — ${results.fetched}/3 fetched, ${results.errors.length} errors`);
  if (results.errors.length) console.error('[armory] errors:', JSON.stringify(results.errors));
  return results;
}

// ── Armory deposit log ────────────────────────────────────────────────────────
// "<a href = \"...XID=2754706\">Mozz</a> deposited 2000x Empty Blood Bag"
function parseDepositEntry(text) {
  const m = text.match(/XID=(\d+)[^>]*>([^<]+)<\/a>\s*deposited\s+(\d+)x\s+(.+)$/);
  if (!m) return null;
  const item_name = m[4].trim();
  if (ARMORY_IGNORE.test(item_name)) return null;
  return {
    torn_user_id: parseInt(m[1], 10),
    username: m[2].trim(),
    quantity: parseInt(m[3], 10),
    item_name,
  };
}

export async function fetchAndCacheArmoryDeposits(env) {
  const results = { fetched: 0, inserted: 0, errors: [] };
  const MAX_PAGES = 5; // 500 news entries per faction per run — plenty of headroom

  for (const factionId of FACTION_IDS) {
    try {
      const apiKeyObj = await getStaffApiKeyForFaction(env, factionId);
      if (!apiKeyObj?.key) {
        results.errors.push({ factionId, error: 'No API key available for this faction' });
        continue;
      }

      // Fetch from a bit before our last known deposit — a plain "last 100,
      // no from/pagination" fetch can permanently miss entries if more than
      // 100 armoryDeposit news items land between runs (they'd be pushed
      // past the 100-item window before we ever see them, and the next run
      // would again only look at the newest 100). Padding by 1 hour covers
      // any minor clock drift; falls back to 7 days for a cold start.
      const lastRow = await env.DB.prepare(
        `SELECT MAX(deposited_at) AS max_ts FROM armory_deposits WHERE faction_id=?`
      ).bind(factionId).first();
      const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
      const from = lastRow?.max_ts ? lastRow.max_ts - 3600 : sevenDaysAgo;

      const stmts = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const offset = page * 100;
        const data = await fetchWithRetry(
          `https://api.torn.com/v2/faction/news?striptags=false&limit=100&offset=${offset}&sort=DESC&from=${from}&cat=armoryDeposit`,
          { Authorization: `ApiKey ${apiKeyObj.key}` }
        );
        if (data?.error) {
          results.errors.push({ factionId, error: `Torn API error ${data.error.code}: ${data.error.error}` });
          break;
        }

        const items = data.news || [];
        if (!items.length) break;

        for (const item of items) {
          const parsed = parseDepositEntry(item.text);
          if (!parsed) continue;
          stmts.push(env.DB.prepare(
            `INSERT OR IGNORE INTO armory_deposits
               (faction_id, torn_news_id, torn_user_id, username, item_name, quantity, deposited_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(factionId, item.id, parsed.torn_user_id, parsed.username, parsed.item_name, parsed.quantity, item.timestamp));
        }

        if (items.length < 100) break; // last page
      }

      if (stmts.length) {
        const batchResults = await env.DB.batch(stmts);
        results.inserted += batchResults.filter(r => (r.meta?.changes ?? 0) > 0).length;
      }
      results.fetched++;
    } catch (e) {
      console.error(`[armory-deposits] faction ${factionId} failed:`, e.message);
      results.errors.push({ factionId, error: e.message });
    }
  }

  console.log(`[armory-deposits] done — ${results.fetched}/3 fetched, ${results.inserted} new rows, ${results.errors.length} errors`);
  return results;
}

export async function refreshArmoryDeposits(request, env, user) {
  try {
    const result = await fetchAndCacheArmoryDeposits(env);
    return jsonResponse({
      message: `Armory deposits refreshed: ${result.fetched}/3 factions, ${result.inserted} new`,
      ...result,
      refreshedAt: new Date().toISOString(),
    });
  } catch (e) {
    return errorResponse('Armory deposits refresh failed: ' + e.message, 500);
  }
}

export async function getArmoryDepositsStatus(request, env, user) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT faction_id, COUNT(*) AS count, MAX(fetched_at) AS fetched_at
       FROM armory_deposits GROUP BY faction_id`
    ).all();
    const status = {};
    for (const row of results || []) {
      status[row.faction_id] = { count: row.count, fetched_at: row.fetched_at };
    }
    const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS total FROM armory_deposits`).first();
    return jsonResponse({ status, total: totalRow?.total ?? 0 });
  } catch (e) {
    return errorResponse('Failed to fetch armory deposits status: ' + e.message, 500);
  }
}

export async function getArmoryDeposits(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = url.searchParams.get('faction_id');
    const year = url.searchParams.get('year');
    const month = url.searchParams.get('month');

    // Full-month mode: every deposit for that calendar month, bulk restocks
    // included, no row cap beyond a generous safety ceiling — this is the
    // "sanity check against Accounting" view, so it must match what
    // getFactionArmoryExpense actually counts (which is everything).
    if (year && month) {
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      const monthStartTs = Math.floor(Date.UTC(y, m - 1, 1) / 1000);
      const monthEndTs   = Math.floor(Date.UTC(y, m, 1) / 1000) - 1;

      const where = factionId
        ? 'WHERE d.faction_id = ? AND d.deposited_at >= ? AND d.deposited_at <= ?'
        : 'WHERE d.deposited_at >= ? AND d.deposited_at <= ?';
      const params = factionId
        ? [parseInt(factionId, 10), monthStartTs, monthEndTs]
        : [monthStartTs, monthEndTs];

      const { results } = await env.DB.prepare(
        `SELECT d.id, d.faction_id, d.torn_user_id, d.username, d.item_name, d.quantity, d.deposited_at,
                COALESCE(p.effective_price, 0) AS unit_price
         FROM armory_deposits d
         LEFT JOIN item_prices_cache p ON p.name = d.item_name
         ${where}
         ORDER BY d.deposited_at DESC
         LIMIT 5000`
      ).bind(...params).all();

      return jsonResponse({ deposits: results || [], month_mode: true });
    }

    // Default "recent activity" mode — capped row count, bulk restocks
    // excluded as noise for a feed meant to surface individual "gave it
    // back" activity, same threshold used for Energy Repaid and the war
    // Armory tab. Unchanged from before the month-mode addition.
    const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 200, 500);
    const where = factionId ? 'WHERE d.faction_id = ? AND d.quantity <= 99' : 'WHERE d.quantity <= 99';
    const params = factionId ? [parseInt(factionId, 10)] : [];

    const { results } = await env.DB.prepare(
      `SELECT d.id, d.faction_id, d.torn_user_id, d.username, d.item_name, d.quantity, d.deposited_at,
              COALESCE(p.effective_price, 0) AS unit_price
       FROM armory_deposits d
       LEFT JOIN item_prices_cache p ON p.name = d.item_name
       ${where}
       ORDER BY d.deposited_at DESC
       LIMIT ?`
    ).bind(...params, limit).all();

    return jsonResponse({ deposits: results || [], month_mode: false });
  } catch (e) {
    return errorResponse('Failed to fetch armory deposits: ' + e.message, 500);
  }
}

// This month's Armory expense for one faction — sum of deposited quantity ×
// current cached item price, for deposits logged since the start of the
// current UTC month. Used by accountingController's Armory expense line.
// Deliberately counts EVERY deposit, bulk restocks included — this is meant
// to represent the faction's real total armory spend, not a specific war's
// energy-repaid credit. The >99-unit bulk-restock exclusion used by
// getArmoryDeposits (the admin log display) and the war-scoped calculations
// (Energy Repaid, War Armory tab, War Economics) is intentionally narrower
// than this: those are about "energy spent then given back for THAT war,"
// where a bulk restock unrelated to war usage shouldn't count as repayment —
// that reasoning doesn't apply here. (A brief attempt to apply the same
// >99 filter here was reverted the same day — restocking the armory is
// still real spend for accounting purposes, whatever the deposit size.)
// `monthStartTs`/`monthEndTs` (unix seconds) let accountingController ask
// about a past month instead of always the live current one — both default
// to the current calendar month when omitted, preserving prior behavior.
// Note: valuation always uses TODAY's item_prices_cache regardless of which
// month is requested (no historical price log exists) — a past month's
// figure here is "what those items would cost today", not what they
// actually cost back then.
export async function getFactionArmoryExpense(env, factionId, monthStartTs, monthEndTs) {
  const now = new Date();
  const start = monthStartTs ?? Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const end   = monthEndTs   ?? Math.floor(now.getTime() / 1000);

  const { results } = await env.DB.prepare(
    `SELECT d.quantity, COALESCE(p.effective_price, 0) AS unit_price
     FROM armory_deposits d
     LEFT JOIN item_prices_cache p ON p.name = d.item_name
     WHERE d.faction_id = ? AND d.deposited_at >= ? AND d.deposited_at <= ?`
  ).bind(factionId, start, end).all();

  let depositCount = 0;
  let totalItems = 0;
  let monthlyCost = 0;
  for (const r of results || []) {
    depositCount++;
    totalItems += r.quantity;
    monthlyCost += r.quantity * r.unit_price;
  }

  return {
    deposit_count: depositCount,
    total_items: totalItems,
    monthly_cost: Math.round(monthlyCost),
    configured: true,
  };
}

export async function fetchAndCacheItemPrices(env) {
  console.log('[item-prices] fetching all items from Torn API...');
  try {
    const apiKeyObj = await getRandomUserApiKey(env);
    if (!apiKeyObj?.key) throw new Error('No user API key available');

    const data = await fetchWithRetry(
      'https://api.torn.com/v2/torn/items?cat=All&sort=ASC',
      { Authorization: `ApiKey ${apiKeyObj.key}` }
    );

    if (data?.error) throw new Error(`Torn API error ${data.error.code}: ${data.error.error}`);

    const items = data?.items ?? [];
    if (!items.length) throw new Error('No items returned from API');

    const stmt = env.DB.prepare(
      `INSERT INTO item_prices_cache (item_id, name, effective_price, market_price, sell_price, fetched_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(item_id) DO UPDATE SET
         name = excluded.name,
         effective_price = excluded.effective_price,
         market_price = excluded.market_price,
         sell_price = excluded.sell_price,
         fetched_at = excluded.fetched_at`
    );

    const batch = items.map(item => {
      const market = item.value?.market_price ?? 0;
      const sell = item.value?.sell_price ?? 0;
      const effective = Math.max(market, sell);
      return stmt.bind(item.id, item.name, effective, market, sell);
    });

    await env.DB.batch(batch);
    console.log(`[item-prices] cached ${items.length} items`);
    return { count: items.length };
  } catch (e) {
    console.error('[item-prices] failed:', e.message);
    throw e;
  }
}

export async function getArmoryStatus(request, env, user) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT faction_id, fetched_at FROM armory_cache`
    ).all();
    const status = {};
    for (const row of results) {
      status[row.faction_id] = { fetched_at: row.fetched_at };
    }
    return jsonResponse({ status });
  } catch (e) {
    return errorResponse('Failed to fetch armory status: ' + e.message, 500);
  }
}

export async function getItemPrices(request, env, user) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT item_id, effective_price FROM item_prices_cache`
    ).all();
    const prices = {};
    for (const row of results) prices[row.item_id] = row.effective_price;
    return jsonResponse({ prices });
  } catch (e) {
    return errorResponse('Failed to fetch item prices: ' + e.message, 500);
  }
}

export async function getItemPricesStatus(request, env, user) {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) as count, MAX(fetched_at) as fetched_at FROM item_prices_cache`
    ).first();
    return jsonResponse({ count: row?.count ?? 0, fetched_at: row?.fetched_at ?? null });
  } catch (e) {
    return errorResponse('Failed to fetch item prices status: ' + e.message, 500);
  }
}

export async function refreshItemPricesCache(request, env, user) {
  try {
    const result = await fetchAndCacheItemPrices(env);
    return jsonResponse({
      message: `Item prices refreshed: ${result.count} items cached`,
      count: result.count,
      refreshedAt: new Date().toISOString(),
    });
  } catch (e) {
    return errorResponse('Item prices refresh failed: ' + e.message, 500);
  }
}

export async function refreshArmoryCache(request, env, user) {
  try {
    const result = await fetchAndCacheArmory(env);
    return jsonResponse({
      message: `Armory cache refreshed: ${result.fetched}/3 factions`,
      fetched: result.fetched,
      errors: result.errors,
      refreshedAt: new Date().toISOString(),
    });
  } catch (e) {
    return errorResponse('Armory cache refresh failed: ' + e.message, 500);
  }
}

export async function getArmoryMinimums(request, env, user) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT item_id, item_name, category, min_33097, min_9171, min_9728 FROM armory_minimums ORDER BY category, item_name`
    ).all();
    return jsonResponse({ minimums: results });
  } catch (e) {
    return errorResponse('Failed to fetch armory minimums: ' + e.message, 500);
  }
}

export async function saveArmoryMinimums(request, env, user) {
  try {
    const { items } = await request.json();
    if (!Array.isArray(items)) return errorResponse('items array required', 400);

    // Delete rows where all minimums are null/empty, upsert the rest
    const toDelete = items.filter(i => !i.min_33097 && !i.min_9171 && !i.min_9728).map(i => i.item_id);
    const toUpsert = items.filter(i => i.min_33097 || i.min_9171 || i.min_9728);

    const stmt = env.DB.prepare(
      `INSERT INTO armory_minimums (item_id, item_name, category, min_33097, min_9171, min_9728, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(item_id) DO UPDATE SET
         item_name  = excluded.item_name,
         category   = excluded.category,
         min_33097  = excluded.min_33097,
         min_9171   = excluded.min_9171,
         min_9728   = excluded.min_9728,
         updated_at = CURRENT_TIMESTAMP`
    );

    const ops = [];
    for (const item of toUpsert) {
      ops.push(stmt.bind(
        item.item_id,
        item.item_name,
        item.category,
        item.min_33097 || null,
        item.min_9171  || null,
        item.min_9728  || null,
      ));
    }
    for (const id of toDelete) {
      ops.push(env.DB.prepare(`DELETE FROM armory_minimums WHERE item_id = ?`).bind(id));
    }

    if (ops.length) await env.DB.batch(ops);
    return jsonResponse({ success: true, saved: toUpsert.length, cleared: toDelete.length });
  } catch (e) {
    return errorResponse('Failed to save armory minimums: ' + e.message, 500);
  }
}

export async function getArmory(request, env, user) {
  try {
    const url = new URL(request.url);
    const factionId = url.searchParams.get('faction_id');

    // Build query — optionally filter by faction
    let rows;
    if (factionId) {
      rows = await env.DB.prepare(
        `SELECT faction_id, data, fetched_at FROM armory_cache WHERE faction_id = ?`
      ).bind(Number(factionId)).all().then(r => r.results);
    } else {
      rows = await env.DB.prepare(
        `SELECT faction_id, data, fetched_at FROM armory_cache`
      ).all().then(r => r.results);
    }

    if (!rows.length) {
      return jsonResponse({ armory: [], members: {} });
    }

    // Fetch all faction members for name resolution (only those in the requested factions)
    const factionIds = rows.map(r => r.faction_id);
    const placeholders = factionIds.map(() => '?').join(',');
    const { results: members } = await env.DB.prepare(
      `SELECT torn_user_id, username, faction_id FROM faction_members
       WHERE is_active = 1 AND faction_id IN (${placeholders})`
    ).bind(...factionIds).all();

    // Build a lookup map: torn_user_id -> { username, faction_id }
    const memberMap = {};
    for (const m of members) {
      memberMap[String(m.torn_user_id)] = { username: m.username, faction_id: m.faction_id };
    }

    // Load item prices for value calculation
    const { results: priceRows } = await env.DB.prepare(
      `SELECT item_id, effective_price FROM item_prices_cache`
    ).all();
    const priceMap = {};
    for (const p of priceRows) priceMap[p.item_id] = p.effective_price;

    const armory = rows.map(row => {
      const data = JSON.parse(row.data);
      // Sum quantity * effective_price across all categories
      let totalValue = 0;
      for (const category of Object.values(data)) {
        if (!Array.isArray(category)) continue;
        for (const item of category) {
          const price = priceMap[item.ID] ?? 0;
          totalValue += (item.quantity ?? 0) * price;
        }
      }
      return { faction_id: row.faction_id, fetched_at: row.fetched_at, data, totalValue };
    });

    return jsonResponse({ armory, members: memberMap });
  } catch (e) {
    return errorResponse('Failed to fetch armory: ' + e.message, 500);
  }
}
