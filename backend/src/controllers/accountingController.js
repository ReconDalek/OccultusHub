import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getFactionRankPerkExpense, getFactionODInsuranceExpense } from './xanaxController.js';
import { getFactionArmoryExpense } from './armoryController.js';
import { getFactionOCProfit } from './ocController.js';
import { computeWarEconomics } from './warController.js';
import { getFactionBountyExpense } from './bountyController.js';

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

// Resolves an optional ?year=&month= pair (1-indexed month) into the bounds
// every date-scoped income/expense figure below needs. Omitted year/month
// default to the current calendar month, so every caller that doesn't pass
// them keeps behaving exactly as before this was added.
function getMonthBounds(yearParam, monthParam) {
  const now = new Date();
  const year  = yearParam  ? parseInt(yearParam, 10)  : now.getUTCFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : now.getUTCMonth() + 1; // 1-indexed
  const monthStartTs = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
  const monthEndTs   = Math.floor(Date.UTC(year, month, 1) / 1000) - 1;
  const monthStartDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndDate   = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
  return { year, month, monthStartTs, monthEndTs, monthStartDate, monthEndDate, isCurrentMonth };
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
// Split into computeAccountingSummaryData (the actual query/math, reusable for
// both the live endpoint and the month-end snapshot cron) and getSummary (the
// HTTP handler, which prefers a frozen snapshot for any completed past month
// before falling back to a live recompute) — see snapshotAccountingMonth below
// for why a past month needs freezing at all: armory expense, OD Insurance,
// and OC item costs all price against item_prices_cache's CURRENT price, so
// recomputing a past month live months later silently uses today's drifted
// prices instead of what those items actually cost back then.

async function computeAccountingSummaryData(env, factionId, monthBounds) {
  const { year, month, monthStartTs, monthEndTs, monthStartDate, monthEndDate, isCurrentMonth } = monthBounds;

  const invParams = factionId ? [parseInt(factionId)] : [];
    const invWhere = factionId ? `WHERE faction_id = ? AND is_active = 1` : `WHERE is_active = 1`;

    const stockWhere = factionId ? `WHERE faction_id = ? AND is_active = 1` : `WHERE is_active = 1`;

    const companyWhere = factionId ? `WHERE c.faction_id = ?` : ``;
    const warWhere = factionId ? `WHERE faction_id = ? AND is_paid = 1 AND hits_saved = 1` : `WHERE is_paid = 1 AND hits_saved = 1`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    // Companies and stocks both branch on isCurrentMonth: the current month
    // isn't finished yet, so we keep the existing run-rate PROJECTION (avg
    // daily cut × days in month / flat per-payout estimate) — genuinely
    // "proposed/potential profit", never written anywhere as real funds.
    // A past month already happened, so instead of projecting we sum the
    // ACTUAL dated records for it (company_profit_snapshots.faction_cut,
    // accounting_stock_collections.amount_paid) — real settled income for
    // that specific month, not an estimate.
    const companyQuery = isCurrentMonth
      ? `SELECT c.principal, c.has_api_key, c.principal_paid,
                COALESCE(AVG(CASE WHEN s.snapshot_date >= date('now','start of month') THEN CAST(s.faction_cut AS REAL) END), c.faction_cut) AS avg_daily_cut,
                NULL AS actual_month_cut
         FROM company_profit_cache c
         LEFT JOIN company_profit_snapshots s ON s.company_id = c.company_id
         ${companyWhere}
         GROUP BY c.company_id`
      : `SELECT c.principal, c.has_api_key, c.principal_paid, NULL AS avg_daily_cut,
                COALESCE(SUM(CASE WHEN s.snapshot_date >= ? AND s.snapshot_date <= ? THEN CAST(s.faction_cut AS REAL) END), 0) AS actual_month_cut
         FROM company_profit_cache c
         LEFT JOIN company_profit_snapshots s ON s.company_id = c.company_id
         ${companyWhere}
         GROUP BY c.company_id`;
    const companyParams = isCurrentMonth ? invParams : [monthStartDate, monthEndDate, ...invParams];

    // stockWhere is either "WHERE faction_id = ? AND is_active = 1" or "WHERE is_active = 1" —
    // the aliased past-month query needs the faction column qualified as s.faction_id.
    const stockWhereAliased = factionId ? `WHERE s.faction_id = ? AND s.is_active = 1` : `WHERE s.is_active = 1`;
    const stockQuery = isCurrentMonth
      ? `SELECT id, payout_frequency, tier, stock_cost, member_keeps_amount, NULL AS actual_collected FROM accounting_stocks ${stockWhere}`
      : `SELECT s.id, s.payout_frequency, s.tier, s.stock_cost, s.member_keeps_amount,
                (SELECT COALESCE(SUM(c.amount_paid), 0) FROM accounting_stock_collections c
                  WHERE c.stock_entry_id = s.id AND date(c.collected_at) >= ? AND date(c.collected_at) <= ?) AS actual_collected
         FROM accounting_stocks s ${stockWhereAliased}`;
    const stockParams = isCurrentMonth ? invParams : [monthStartDate, monthEndDate, ...invParams];

    const [invRows, stockRows, companyRows, warIdRows] = await Promise.all([
      env.DB.prepare(`SELECT amount, rate, duration_months, member_profit_pct FROM accounting_investments ${invWhere}`).bind(...invParams).all(),
      env.DB.prepare(stockQuery).bind(...stockParams).all(),
      env.DB.prepare(companyQuery).bind(...companyParams).all(),
      // War income (actual): which fully paid-out wars in the target month
      // qualify. Wars are sporadic, not daily recurring like companies, so
      // actual-per-war is more honest than a projection regardless of month.
      // Bucketed by payout_processed_at (when Save to Rankings locked it in)
      // with a fallback to ended_at for wars paid before that column existed.
      // Only the war IDs are fetched here — the actual income figure is
      // computed per-war below via computeWarEconomics, so it nets out that
      // war's own armory/bounty/other expenses instead of counting the gross
      // faction-share-of-payout.
      env.DB.prepare(
        `SELECT id FROM ranked_wars
         ${warWhere}
           AND payout_json IS NOT NULL
           AND date(COALESCE(payout_processed_at, datetime(ended_at, 'unixepoch'))) >= ?
           AND date(COALESCE(payout_processed_at, datetime(ended_at, 'unixepoch'))) <= ?`
      ).bind(...invParams, monthStartDate, monthEndDate).all(),
    ]);

    // Net, not gross: each war's own armory usage, bounty spend, and any
    // logged "Other" expenses come straight out of that war's income here —
    // previously this used the raw faction-share-of-payout figure, overstating
    // MTD war income by whatever was actually spent running the war.
    const warIds = (warIdRows.results || []).map(r => r.id);
    let warIncome = 0;
    for (const id of warIds) {
      const econ = await computeWarEconomics(env, id);
      warIncome += econ?.net_profit ?? 0;
    }
    warIncome = Math.round(warIncome * 100) / 100;
    const warCount = warIds.length;

    // Bank investments have no actual-payout log (unlike stocks below), so
    // this stays a flat amortized run-rate of currently active investments
    // for every month — clearly "proposed/potential profit" on the frontend,
    // never written into vault/networth anywhere in this response.
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
      if (isCurrentMonth) {
        const payoutsPerMonth = row.payout_frequency === '7-day' ? 4 : 1;
        stockMonthlyIncome += (row.member_keeps_amount || 0) * (row.tier || 1) * payoutsPerMonth;
      } else {
        stockMonthlyIncome += row.actual_collected || 0;
      }
      stockTotalInvested += row.stock_cost || 0;
    }

    let companyTotalPrincipal = 0;
    let companyMonthlyIncome = 0;
    let companyWithKey = 0;
    for (const row of (companyRows.results || [])) {
      if (row.principal_paid) companyTotalPrincipal += row.principal || 0;
      companyMonthlyIncome += isCurrentMonth
        ? Math.round((row.avg_daily_cut || 0) * daysInMonth)
        : Math.round(row.actual_month_cut || 0);
      if (row.has_api_key) companyWithKey++;
    }

    const tciDue = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM accounting_investments
      WHERE is_active = 1 AND tci_purchased = 0
      ${factionId ? 'AND faction_id = ?' : ''}
      AND date(end_date) <= date('now', '+7 days') AND date(end_date) >= date('now')
    `).bind(...invParams).first();

    // Rank Perks stays a flat current-membership run-rate for every month
    // (no dated record of who was "entitled" in a past month) — clearly
    // labeled on the frontend as a current rate, not this month's actual.
    // OD Insurance / Armory / OC / Bounties are all genuinely dated records,
    // so they're scoped to the requested month's bounds below.
    const perkFactionIds = factionId ? [parseInt(factionId)] : FACTION_IDS;
    const [rankPerkResults, odInsuranceResults, armoryExpenseResults, ocProfitResults, bountyExpenseResults] = await Promise.all([
      Promise.all(perkFactionIds.map(id => getFactionRankPerkExpense(env, id))),
      Promise.all(perkFactionIds.map(id => getFactionODInsuranceExpense(env, id, monthStartTs, monthEndTs))),
      Promise.all(perkFactionIds.map(id => getFactionArmoryExpense(env, id, monthStartTs, monthEndTs))),
      Promise.all(perkFactionIds.map(id => getFactionOCProfit(env, id, monthStartTs, monthEndTs))),
      Promise.all(perkFactionIds.map(id => getFactionBountyExpense(env, id, monthStartTs, monthEndTs))),
    ]);
    const rankPerks = rankPerkResults.reduce((acc, r) => ({
      eligible_members: acc.eligible_members + r.eligible_members,
      total_xanax:       acc.total_xanax + r.total_xanax,
      unit_price:         r.unit_price,
      monthly_cost:       acc.monthly_cost + r.monthly_cost,
      configured:         true,
    }), { eligible_members: 0, total_xanax: 0, unit_price: 0, monthly_cost: 0, configured: false });
    const odInsurance = odInsuranceResults.reduce((acc, r) => ({
      eligible_members:        acc.eligible_members + r.eligible_members,
      members_with_overdoses:  acc.members_with_overdoses + r.members_with_overdoses,
      total_overdoses:         acc.total_overdoses + r.total_overdoses,
      unit_price:              r.unit_price,
      monthly_cost:            acc.monthly_cost + r.monthly_cost,
      configured:              true,
    }), { eligible_members: 0, members_with_overdoses: 0, total_overdoses: 0, unit_price: 0, monthly_cost: 0, configured: false });
    const armoryExpense = armoryExpenseResults.reduce((acc, r) => ({
      deposit_count: acc.deposit_count + r.deposit_count,
      total_items:   acc.total_items + r.total_items,
      monthly_cost:  acc.monthly_cost + r.monthly_cost,
      configured:    true,
    }), { deposit_count: 0, total_items: 0, monthly_cost: 0, configured: false });
    const ocProfit = ocProfitResults.reduce((acc, r) => ({
      paid_crimes:    acc.paid_crimes + r.paid_crimes,
      gross_income:   acc.gross_income + r.gross_income,
      item_expense:   acc.item_expense + r.item_expense,
      monthly_income: acc.monthly_income + r.monthly_income,
      configured:     true,
    }), { paid_crimes: 0, gross_income: 0, item_expense: 0, monthly_income: 0, configured: false });
    // Bounties already attributed to a war are deliberately excluded from this
    // (getFactionBountyExpense filters ranked_war_id IS NULL) — those already
    // reduce that specific war's own net_profit via computeWarEconomics, and
    // counting them again here would double-subtract the same expense.
    const bountyExpense = bountyExpenseResults.reduce((acc, r) => ({
      bounty_count:  acc.bounty_count + r.bounty_count,
      monthly_cost:  acc.monthly_cost + r.monthly_cost,
      configured:    true,
    }), { bounty_count: 0, monthly_cost: 0, configured: false });

  return {
    investments: {
      total: invResults.length,
      total_amount: invTotalAmount,
      monthly_income: invMonthlyIncome,
      // Always a projection (no actual-payout log exists for bank
      // investments) — "proposed/potential profit", not a real settled
      // figure for the selected month. Never added to vault/networth.
      is_estimate: true,
      tci_action_required: tciDue?.count ?? 0,
    },
    stocks: {
      total: (stockRows.results || []).length,
      monthly_income: stockMonthlyIncome,
      total_invested: stockTotalInvested,
      // Current month = projected run-rate; past month = actual logged
      // collections for that month (accounting_stock_collections).
      is_estimate: isCurrentMonth,
    },
    companies: {
      total: (companyRows.results || []).length,
      with_key: companyWithKey,
      total_principal: companyTotalPrincipal,
      monthly_income: companyMonthlyIncome,
      // Current month = avg-daily-cut × days-in-month projection; past
      // month = actual summed daily snapshots for that month.
      is_estimate: isCurrentMonth,
    },
    wars: {
      count: warCount,
      monthly_income: warIncome,
    },
    oc: ocProfit,
    expenses: {
      armory:       armoryExpense,
      od_insurance: odInsurance,
      // Rank Perks is always a flat current-membership run-rate — no dated
      // record of who was "entitled" in a past month exists to look up.
      rank_perks:   { ...rankPerks, is_estimate: true },
      bounties:     bountyExpense,
    },
  };
}

// ── HTTP handler: prefers a frozen snapshot for a completed past month ──────

export async function getSummary(request, env) {
  try {
    const url = new URL(request.url);
    const factionIdParam = url.searchParams.get('faction_id');
    const factionId = factionIdParam ? parseInt(factionIdParam, 10) : null;
    const monthBounds = getMonthBounds(url.searchParams.get('year'), url.searchParams.get('month'));
    const { year, month, isCurrentMonth } = monthBounds;

    // Only single-faction requests get snapshotted (that's the only shape the
    // frontend ever asks for — see AccountingTab.jsx) — a past month with a
    // faction_id and a frozen row wins over recomputing live.
    if (factionId && !isCurrentMonth) {
      const snap = await env.DB.prepare(
        `SELECT summary_json FROM accounting_monthly_snapshots WHERE faction_id=? AND year=? AND month=?`
      ).bind(factionId, year, month).first();
      if (snap) {
        const data = JSON.parse(snap.summary_json);
        return jsonResponse({ month: { year, month, is_current_month: false, is_snapshot: true }, ...data });
      }
    }

    const data = await computeAccountingSummaryData(env, factionId, monthBounds);
    return jsonResponse({ month: { year, month, is_current_month: isCurrentMonth, is_snapshot: false }, ...data });
  } catch (e) {
    return errorResponse('Failed to fetch summary: ' + e.message, 500);
  }
}

// ── GET /api/leadership/accounting/snapshot-months ───────────────────────────
// Which past months actually have a frozen snapshot — the frontend's month
// picker uses this to only ever offer months it can show real data for
// (current month is always offered separately, since that's always live).
export async function getSnapshotMonths(request, env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT year, month FROM accounting_monthly_snapshots ORDER BY year DESC, month DESC`
    ).all();
    return jsonResponse({ months: results || [] });
  } catch (e) {
    return errorResponse('Failed to fetch snapshot months: ' + e.message, 500);
  }
}

// ── Month-end snapshot: freezes each faction's completed-month summary ──────
// Called by the cron on the 1st of the month (targeting the month that just
// ended) and by the admin manual-refresh endpoint below (for backfilling
// months that predate this feature, or re-freezing one after a data fix).

export async function snapshotAccountingMonth(env, year, month) {
  const monthBounds = getMonthBounds(String(year), String(month));
  const results = [];
  for (const factionId of FACTION_IDS) {
    const data = await computeAccountingSummaryData(env, factionId, monthBounds);
    const summaryJson = JSON.stringify(data);
    await env.DB.prepare(
      `INSERT INTO accounting_monthly_snapshots (faction_id, year, month, summary_json)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(faction_id, year, month) DO UPDATE SET
         summary_json = excluded.summary_json, snapshotted_at = CURRENT_TIMESTAMP`
    ).bind(factionId, year, month, summaryJson).run();
    results.push({ factionId, year, month });
  }
  return { snapshotted: results.length, results };
}

// ── POST /api/admin/accounting/snapshot ──────────────────────────────────────
// Manual trigger — defaults to the previous calendar month (same target the
// cron uses), or accepts an explicit { year, month } body for backfilling
// older months / re-freezing one after a correction.
export async function refreshAccountingSnapshot(request, env) {
  try {
    let body = {};
    try { body = await request.json(); } catch { /* empty body is fine */ }

    let { year, month } = body;
    if (!year || !month) {
      const now = new Date();
      const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      year = prev.getUTCFullYear();
      month = prev.getUTCMonth() + 1;
    }

    const result = await snapshotAccountingMonth(env, parseInt(year, 10), parseInt(month, 10));
    return jsonResponse({ year: parseInt(year, 10), month: parseInt(month, 10), ...result });
  } catch (e) {
    return errorResponse('Failed to snapshot accounting month: ' + e.message, 500);
  }
}
