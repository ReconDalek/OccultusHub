import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getFactionRankPerkExpense } from './xanaxController.js';

const FACTION_IDS = [33097, 9728, 9171];

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeEndDate(startDate, durationMonths) {
  const d = new Date(startDate + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + durationMonths);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  const now = new Date();
  const target = new Date(dateStr + 'T00:00:00Z');
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getAccountingSettings(request, env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT key, value FROM system_settings WHERE key IN ('accounting_respect_value', 'accounting_points_value')`
    ).all();

    const map = {};
    for (const row of results) map[row.key] = parseFloat(row.value) || 0;

    return jsonResponse({
      respect_value: map['accounting_respect_value'] ?? 0,
      points_value: map['accounting_points_value'] ?? 0,
    });
  } catch (e) {
    return errorResponse('Failed to fetch accounting settings: ' + e.message, 500);
  }
}

export async function updateAccountingSetting(request, env) {
  try {
    const body = await request.json();
    const { key, value } = body;

    const allowed = ['accounting_respect_value', 'accounting_points_value'];
    if (!allowed.includes(key)) return errorResponse('Invalid setting key', 400);

    await env.DB.prepare(
      `INSERT INTO system_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    ).bind(key, String(parseFloat(value) || 0)).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update accounting setting: ' + e.message, 500);
  }
}

// ── Investments ───────────────────────────────────────────────────────────────

export async function getInvestments(request, env) {
  try {
    const url = new URL(request.url);
    const factionId = url.searchParams.get('faction_id');

    let query = `SELECT * FROM accounting_investments WHERE is_active = 1`;
    const params = [];
    if (factionId) {
      query += ` AND faction_id = ?`;
      params.push(parseInt(factionId));
    }
    query += ` ORDER BY end_date ASC`;

    const { results } = await env.DB.prepare(query).bind(...params).all();

    const enriched = results.map(row => {
      const profit = row.amount * (row.rate / 100);
      const memberKeeps = profit * (row.member_profit_pct / 100);
      const factionIncome = profit - memberKeeps;
      return {
        ...row,
        profit,
        member_keeps: memberKeeps,
        faction_income: factionIncome,
        days_until_end: daysUntil(row.end_date),
        tci_window_open: daysUntil(row.end_date) <= 7 && daysUntil(row.end_date) >= 0,
      };
    });

    return jsonResponse({ investments: enriched });
  } catch (e) {
    return errorResponse('Failed to fetch investments: ' + e.message, 500);
  }
}

export async function createInvestment(request, env, user) {
  try {
    const body = await request.json();
    const { torn_user_id, discord_id, faction_id, amount, rate, duration_months, member_profit_pct, start_date, notes } = body;

    if (!torn_user_id || !faction_id || !amount || !duration_months || !start_date) {
      return errorResponse('Missing required fields', 400);
    }

    const end_date = computeEndDate(start_date, parseInt(duration_months));

    await env.DB.prepare(`
      INSERT INTO accounting_investments
        (torn_user_id, discord_id, faction_id, amount, rate, duration_months, member_profit_pct, start_date, end_date, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      parseInt(torn_user_id), discord_id || null, parseInt(faction_id),
      parseFloat(amount), parseFloat(rate || 0), parseInt(duration_months),
      parseFloat(member_profit_pct ?? 100), start_date, end_date,
      notes || null, user.userId
    ).run();

    return jsonResponse({ success: true, end_date });
  } catch (e) {
    return errorResponse('Failed to create investment: ' + e.message, 500);
  }
}

export async function updateInvestment(request, env, user) {
  try {
    const url = new URL(request.url);
    const id = parseInt(url.pathname.split('/').pop());
    const body = await request.json();

    const allowed = ['discord_id', 'amount', 'rate', 'duration_months', 'member_profit_pct', 'start_date', 'tci_purchased', 'tci_received', 'notes', 'is_active'];
    const sets = [];
    const params = [];

    for (const key of allowed) {
      if (key in body) {
        sets.push(`${key} = ?`);
        params.push(body[key]);
      }
    }

    if (sets.length === 0) return errorResponse('No fields to update', 400);

    // Recompute end_date if duration or start changed
    let startDate = body.start_date;
    let durationMonths = body.duration_months;
    if (startDate || durationMonths) {
      if (!startDate || !durationMonths) {
        const existing = await env.DB.prepare(`SELECT start_date, duration_months FROM accounting_investments WHERE id = ?`).bind(id).first();
        startDate = startDate || existing.start_date;
        durationMonths = durationMonths || existing.duration_months;
      }
      const newEnd = computeEndDate(startDate, parseInt(durationMonths));
      sets.push(`end_date = ?`);
      params.push(newEnd);
    }

    if ('tci_purchased' in body && body.tci_purchased) {
      sets.push(`tci_purchased_at = ?`);
      params.push(new Date().toISOString().slice(0, 10));
    }

    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    await env.DB.prepare(`UPDATE accounting_investments SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update investment: ' + e.message, 500);
  }
}

export async function deleteInvestment(request, env) {
  try {
    const url = new URL(request.url);
    const id = parseInt(url.pathname.split('/').pop());
    await env.DB.prepare(`UPDATE accounting_investments SET is_active = 0 WHERE id = ?`).bind(id).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete investment: ' + e.message, 500);
  }
}

// ── Stocks ────────────────────────────────────────────────────────────────────

export async function getStocks(request, env) {
  try {
    const url = new URL(request.url);
    const factionId = url.searchParams.get('faction_id');

    let query = `SELECT s.*, (
      SELECT json_group_array(json_object(
        'id', c.id,
        'period_label', c.period_label,
        'amount_paid', c.amount_paid,
        'collected_at', c.collected_at,
        'notes', c.notes
      )) FROM accounting_stock_collections c WHERE c.stock_entry_id = s.id ORDER BY c.collected_at DESC LIMIT 12
    ) as collections FROM accounting_stocks s WHERE s.is_active = 1`;
    const params = [];
    if (factionId) {
      query += ` AND s.faction_id = ?`;
      params.push(parseInt(factionId));
    }
    query += ` ORDER BY s.torn_user_id ASC`;

    const { results } = await env.DB.prepare(query).bind(...params).all();

    const parsed = results.map(r => ({
      ...r,
      collections: r.collections ? JSON.parse(r.collections) : [],
    }));

    return jsonResponse({ stocks: parsed });
  } catch (e) {
    return errorResponse('Failed to fetch stocks: ' + e.message, 500);
  }
}

export async function createStock(request, env, user) {
  try {
    const body = await request.json();
    const { torn_user_id, discord_id, faction_id, stock_acronym, tier, payout_frequency, stock_cost, member_keeps_amount, notes } = body;

    if (!torn_user_id || !faction_id || !stock_acronym) {
      return errorResponse('Missing required fields', 400);
    }

    const tierVal = Math.min(3, Math.max(1, parseInt(tier || 1)));

    await env.DB.prepare(`
      INSERT INTO accounting_stocks
        (torn_user_id, discord_id, faction_id, stock_acronym, tier, payout_frequency, stock_cost, member_keeps_amount, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      parseInt(torn_user_id), discord_id || null, parseInt(faction_id),
      stock_acronym.toUpperCase(), tierVal,
      payout_frequency || '31-day', parseFloat(stock_cost || 0),
      parseFloat(member_keeps_amount || 0),
      notes || null, user.userId
    ).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to create stock entry: ' + e.message, 500);
  }
}

export async function updateStock(request, env, user) {
  try {
    const url = new URL(request.url);
    const id = parseInt(url.pathname.split('/').pop());
    const body = await request.json();

    const allowed = ['discord_id', 'stock_acronym', 'tier', 'payout_frequency', 'stock_cost', 'member_keeps_amount', 'notes', 'is_active'];
    const sets = [];
    const params = [];

    for (const key of allowed) {
      if (key in body) {
        let val = body[key];
        if (key === 'stock_acronym') val = val.toUpperCase();
        if (key === 'tier') val = Math.min(3, Math.max(1, parseInt(val)));
        sets.push(`${key} = ?`);
        params.push(val);
      }
    }

    if (sets.length === 0) return errorResponse('No fields to update', 400);

    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    await env.DB.prepare(`UPDATE accounting_stocks SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update stock entry: ' + e.message, 500);
  }
}

export async function deleteStock(request, env) {
  try {
    const url = new URL(request.url);
    const id = parseInt(url.pathname.split('/').pop());
    await env.DB.prepare(`UPDATE accounting_stocks SET is_active = 0 WHERE id = ?`).bind(id).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete stock entry: ' + e.message, 500);
  }
}

export async function logCollection(request, env, user) {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const stockEntryId = parseInt(parts[parts.length - 2]);

    const body = await request.json();
    const { period_label, amount_paid, notes } = body;

    if (!period_label) return errorResponse('period_label required', 400);

    const entry = await env.DB.prepare(`SELECT torn_user_id FROM accounting_stocks WHERE id = ?`).bind(stockEntryId).first();
    if (!entry) return errorResponse('Stock entry not found', 404);

    await env.DB.prepare(`
      INSERT INTO accounting_stock_collections (stock_entry_id, torn_user_id, period_label, amount_paid, notes, collected_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(stockEntryId, entry.torn_user_id, period_label, parseFloat(amount_paid ?? 0), notes || null, user.userId).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to log collection: ' + e.message, 500);
  }
}

export async function deleteCollection(request, env) {
  try {
    const url = new URL(request.url);
    const id = parseInt(url.pathname.split('/').pop());
    await env.DB.prepare(`DELETE FROM accounting_stock_collections WHERE id = ?`).bind(id).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to delete collection: ' + e.message, 500);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

export async function getSummary(request, env) {
  try {
    const url = new URL(request.url);
    const factionId = url.searchParams.get('faction_id');

    const invParams = factionId ? [parseInt(factionId)] : [];
    const invWhere = factionId ? `WHERE faction_id = ? AND is_active = 1` : `WHERE is_active = 1`;

    const stockWhere = factionId ? `WHERE faction_id = ? AND is_active = 1` : `WHERE is_active = 1`;

    const companyWhere = factionId ? `WHERE c.faction_id = ?` : ``;
    const warWhere = factionId ? `WHERE faction_id = ? AND is_paid = 1 AND hits_saved = 1` : `WHERE is_paid = 1 AND hits_saved = 1`;
    const now = new Date();
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

    const [invRows, stockRows, companyRows, warRow] = await Promise.all([
      env.DB.prepare(`SELECT amount, rate, duration_months, member_profit_pct FROM accounting_investments ${invWhere}`).bind(...invParams).all(),
      env.DB.prepare(`SELECT payout_frequency, tier, stock_cost, member_keeps_amount FROM accounting_stocks ${stockWhere}`).bind(...invParams).all(),
      env.DB.prepare(
        `SELECT c.principal, c.has_api_key, c.principal_paid,
                COALESCE(AVG(CASE WHEN s.snapshot_date >= date('now','start of month') THEN CAST(s.faction_cut AS REAL) END), c.faction_cut) AS avg_daily_cut
         FROM company_profit_cache c
         LEFT JOIN company_profit_snapshots s ON s.company_id = c.company_id
         ${companyWhere}
         GROUP BY c.company_id`
      ).bind(...invParams).all(),
      // War income (MTD actual): 10% (or whatever factionShare was set to) of each
      // fully paid-out war's total payout this month. Wars are sporadic, not daily
      // recurring like companies, so MTD-actual is more honest than a projection.
      // Bucketed by payout_processed_at (when Save to Rankings locked it in) with a
      // fallback to ended_at for wars paid before that column existed.
      env.DB.prepare(
        `SELECT
           COUNT(*) AS war_count,
           SUM(CAST(json_extract(payout_json,'$.settings.totalAmount') AS REAL)
               * CAST(json_extract(payout_json,'$.settings.factionShare') AS REAL) / 100.0) AS war_income
         FROM ranked_wars
         ${warWhere}
           AND payout_json IS NOT NULL
           AND date(COALESCE(payout_processed_at, datetime(ended_at, 'unixepoch'))) >= date('now','start of month')`
      ).bind(...invParams).first(),
    ]);

    const invResults = invRows.results || [];
    let invTotalAmount = 0;
    let invMonthlyIncome = 0;
    for (const row of invResults) {
      invTotalAmount += row.amount || 0;
      const totalProfit = (row.amount || 0) * ((row.rate || 0) / 100);
      const factionIncome = totalProfit * (1 - (row.member_profit_pct || 0) / 100);
      invMonthlyIncome += factionIncome / (row.duration_months || 1);
    }

    let stockMonthlyIncome = 0;
    let stockTotalInvested = 0;
    for (const row of (stockRows.results || [])) {
      const payoutsPerMonth = row.payout_frequency === '7-day' ? 4 : 1;
      stockMonthlyIncome += (row.member_keeps_amount || 0) * (row.tier || 1) * payoutsPerMonth;
      stockTotalInvested += row.stock_cost || 0;
    }

    let companyTotalPrincipal = 0;
    let companyMonthlyIncome = 0;
    let companyWithKey = 0;
    for (const row of (companyRows.results || [])) {
      if (row.principal_paid) companyTotalPrincipal += row.principal || 0;
      companyMonthlyIncome += Math.round((row.avg_daily_cut || 0) * daysInMonth);
      if (row.has_api_key) companyWithKey++;
    }

    const tciDue = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM accounting_investments
      WHERE is_active = 1 AND tci_purchased = 0
      ${factionId ? 'AND faction_id = ?' : ''}
      AND date(end_date) <= date('now', '+7 days') AND date(end_date) >= date('now')
    `).bind(...invParams).first();

    // Rank Perks expense: base xanax × rank coefficient per eligible member,
    // priced at the current cached Xanax market value (item_prices_cache).
    const rankPerkFactionIds = factionId ? [parseInt(factionId)] : FACTION_IDS;
    const rankPerkResults = await Promise.all(rankPerkFactionIds.map(id => getFactionRankPerkExpense(env, id)));
    const rankPerks = rankPerkResults.reduce((acc, r) => ({
      eligible_members: acc.eligible_members + r.eligible_members,
      total_xanax:       acc.total_xanax + r.total_xanax,
      unit_price:         r.unit_price,
      monthly_cost:       acc.monthly_cost + r.monthly_cost,
      configured:         true,
    }), { eligible_members: 0, total_xanax: 0, unit_price: 0, monthly_cost: 0, configured: false });

    return jsonResponse({
      investments: {
        total: invResults.length,
        total_amount: invTotalAmount,
        monthly_income: invMonthlyIncome,
        tci_action_required: tciDue?.count ?? 0,
      },
      stocks: {
        total: (stockRows.results || []).length,
        monthly_income: stockMonthlyIncome,
        total_invested: stockTotalInvested,
      },
      companies: {
        total: (companyRows.results || []).length,
        with_key: companyWithKey,
        total_principal: companyTotalPrincipal,
        monthly_income: companyMonthlyIncome,
      },
      wars: {
        count: warRow?.war_count ?? 0,
        monthly_income: warRow?.war_income ?? 0,
      },
      // Not yet tracked — placeholders so the UI structure is ready before real data exists
      oc: {
        monthly_income: 0,
        configured: false,
      },
      expenses: {
        armory:       { monthly_cost: 0, configured: false },
        od_insurance: { monthly_cost: 0, configured: false },
        rank_perks:   rankPerks,
      },
    });
  } catch (e) {
    return errorResponse('Failed to fetch summary: ' + e.message, 500);
  }
}
