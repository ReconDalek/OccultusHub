import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { requireLeadership } from '../middleware/auth.js';
import { getWarningsForMember } from './warningsController.js';
import { PERSONAL_STAT_FIELDS, getEnergyDeltaForUser } from './activityController.js';

// Small curated subset of the 135 personal-stat fields — this is a summary
// card, not the full breakdown PersonalStatsPanel already provides.
const PROFILE_STAT_KEYS = ['atk_won', 'atk_lost', 'killstreak_best', 'dmg_total', 'drug_overdoses'];

function getPath(obj, pathArr) {
  return pathArr.reduce((curr, key) => curr?.[key], obj) ?? 0;
}

function monthStartDate() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
function monthEndDate() {
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// GET /api/members/:tornUserId/profile
// Self-view always allowed; viewing another member requires leadership.
export async function getMemberProfile(request, env, user) {
  try {
    if (!user) return errorResponse('Authentication required', 401);

    const match = request.url.match(/\/members\/(\d+)\/profile/);
    const tornUserId = match ? parseInt(match[1], 10) : null;
    if (!tornUserId) return errorResponse('Invalid member id', 400);

    const isSelf = String(user.tornUserId) === String(tornUserId);
    if (!isSelf) {
      const isLeader = await requireLeadership(user, env);
      if (!isLeader) return errorResponse('Leadership access required to view another member', 403);
    }

    const monthStart = monthStartDate();
    const monthEnd   = monthEndDate();

    const [
      identity,
      accountRow, // occultusHub's own account for this torn_user_id, if they've ever logged in
      chainRow,
      warRow,
      recentWars,
      customRow,
      ocSummary,
      ocCpr,
      armoryThisMonth,
      recentArmoryUsed,
      xanaxRecent,
      investments,
      stocks,
      bountiesPlaced,
      bountiesReceived,
      energy,
      monthStatsRows,
      warnings,
    ] = await Promise.all([
      env.DB.prepare(
        `SELECT torn_user_id, username, faction_id, faction_position, level, is_active, joined_at
         FROM faction_members WHERE torn_user_id=?`
      ).bind(tornUserId).first(),

      env.DB.prepare(
        `SELECT id, image_url, fishing_points, rune_points FROM users WHERE torn_user_id=?`
      ).bind(tornUserId).first(),

      env.DB.prepare(
        `SELECT COALESCE(SUM(total_attacks),0) AS total_attacks, COALESCE(SUM(total_respect),0) AS total_respect
         FROM chain_hits WHERE torn_user_id=?`
      ).bind(tornUserId).first(),

      env.DB.prepare(
        `SELECT COALESCE(SUM(war_hits),0) AS war_hits, COALESCE(SUM(outside_hits),0) AS outside_hits,
                COALESCE(SUM(assists),0) AS assists, COALESCE(SUM(respect_gained),0) AS respect_gained,
                COALESCE(SUM(payout_amount),0) AS payout_amount
         FROM war_hits WHERE torn_user_id=?`
      ).bind(tornUserId).first(),

      env.DB.prepare(
        `SELECT wh.ranked_war_id, wh.war_hits, wh.respect_gained, wh.payout_amount,
                w.opponent_faction_name, w.ended_at
         FROM war_hits wh LEFT JOIN ranked_wars w ON w.id = wh.ranked_war_id
         WHERE wh.torn_user_id=? ORDER BY w.ended_at DESC LIMIT 5`
      ).bind(tornUserId).all(),

      env.DB.prepare(
        `SELECT COALESCE(SUM(hits),0) AS total_hits FROM custom_hits WHERE torn_user_id=?`
      ).bind(tornUserId).first(),

      // Organized Crime summary — own section, not folded into Combat totals.
      env.DB.prepare(
        `SELECT COUNT(*) AS joined,
                SUM(CASE WHEN outcome='Successful' THEN 1 ELSE 0 END) AS successful,
                SUM(CASE WHEN outcome IN ('Failed','Hospitalized','Jailed','Injured') THEN 1 ELSE 0 END) AS failed
         FROM oc_crime_slots WHERE torn_user_id=?`
      ).bind(tornUserId).first(),

      env.DB.prepare(
        `SELECT crime_name, position, best_pass_rate FROM oc_member_cpr
         WHERE torn_user_id=? ORDER BY best_pass_rate DESC LIMIT 8`
      ).bind(tornUserId).all(),

      env.DB.prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(quantity),0) AS total_qty
         FROM armory_deposits WHERE torn_user_id=? AND deposited_at >= ?`
      ).bind(tornUserId, Math.floor(new Date(monthStart + 'T00:00:00Z').getTime() / 1000)).first(),

      env.DB.prepare(
        `SELECT item_name, used_at FROM war_armory_usage
         WHERE torn_user_id=? ORDER BY used_at DESC LIMIT 10`
      ).bind(tornUserId).all(),

      env.DB.prepare(
        `SELECT distribution_year, distribution_month, quantity FROM xanax_distributions
         WHERE torn_user_id=? ORDER BY distribution_year DESC, distribution_month DESC LIMIT 6`
      ).bind(tornUserId).all(),

      env.DB.prepare(
        `SELECT amount, rate, duration_months, start_date, end_date FROM accounting_investments
         WHERE torn_user_id=? AND is_active=1`
      ).bind(tornUserId).all(),

      env.DB.prepare(
        `SELECT stock_acronym, tier, payout_frequency, member_keeps_amount FROM accounting_stocks
         WHERE torn_user_id=? AND is_active=1`
      ).bind(tornUserId).all(),

      env.DB.prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total_cost),0) AS total_cost
         FROM bounties WHERE placer_torn_id=?`
      ).bind(tornUserId).first(),

      env.DB.prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total_cost),0) AS total_cost
         FROM bounties WHERE target_torn_id=?`
      ).bind(tornUserId).first(),

      // Same per-faction-delta + calendar-day-average calc the Energy tab
      // itself uses (getEnergyActivity) — NOT a naive MAX-MIN, which silently
      // mixes energy_total baselines across a mid-period faction switch and
      // can wildly overstate the total (confirmed live: 52x too high for one
      // member before this fix).
      getEnergyDeltaForUser(env, tornUserId, monthStart, monthEnd),

      // First and latest snapshot of THIS month, in one query — delta between
      // them is this month's activity, not the lifetime cumulative total.
      env.DB.prepare(
        `SELECT snapshot_date, stats FROM personal_stats_snapshots
         WHERE torn_user_id=? AND snapshot_date >= ? ORDER BY snapshot_date ASC`
      ).bind(tornUserId, monthStart).all(),

      getWarningsForMember(env, tornUserId),
    ]);

    // This-month delta, not lifetime cumulative — same MIN/MAX-date pattern
    // enrichEnergyAndOD (warController.js) uses for OD deltas over a war period.
    let personalStats = null;
    const statsRows = monthStatsRows.results || [];
    if (statsRows.length) {
      try {
        const firstObj = JSON.parse(statsRows[0].stats);
        const lastObj  = JSON.parse(statsRows[statsRows.length - 1].stats);
        personalStats = { since_date: statsRows[0].snapshot_date, as_of_date: statsRows[statsRows.length - 1].snapshot_date };
        for (const key of PROFILE_STAT_KEYS) {
          const field = PERSONAL_STAT_FIELDS.find(f => f.key === key);
          if (field) personalStats[key] = { label: field.label, value: getPath(lastObj, field.path) - getPath(firstObj, field.path) };
        }
      } catch { /* malformed snapshot — leave personalStats null */ }
    }

    const ocJoined     = ocSummary?.joined ?? 0;
    const ocSuccessful = ocSummary?.successful ?? 0;
    const ocFailed     = ocSummary?.failed ?? 0;

    // Minigame stats only exist if this person has an occultusHub account
    // (users.id) — fishing/runes/sanctum/familiars/CAH/Rite all key off that
    // internal id, not torn_user_id. Skip the whole batch if they've never logged in.
    let games = null;
    if (accountRow?.id) {
      const internalId = accountRow.id;
      const [fishing, runes, sanctum, familiar, cah, rite] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) AS catches FROM fishing_catches WHERE user_id=?`).bind(internalId).first(),
        env.DB.prepare(`SELECT COUNT(*) AS casts FROM rune_casts WHERE user_id=?`).bind(internalId).first(),
        env.DB.prepare(`SELECT essence, total_essence FROM sanctum_saves WHERE user_id=?`).bind(internalId).first(),
        env.DB.prepare(`SELECT id, species, nature, name, level, stage FROM familiars WHERE user_id=?`).bind(internalId).first(),
        env.DB.prepare(
          `SELECT COUNT(DISTINCT room_id) AS games_played, COALESCE(SUM(souls),0) AS total_souls
           FROM cah_players WHERE user_id=?`
        ).bind(internalId).first(),
        env.DB.prepare(`SELECT COUNT(DISTINCT room_id) AS games_played FROM game_players WHERE user_id=?`).bind(internalId).first(),
      ]);

      let familiarBattles = null;
      if (familiar?.id) {
        familiarBattles = await env.DB.prepare(
          `SELECT COUNT(*) AS total, SUM(CASE WHEN winner_id=? THEN 1 ELSE 0 END) AS wins
           FROM familiar_battles WHERE challenger_id=? OR defender_id=?`
        ).bind(familiar.id, familiar.id, familiar.id).first();
      }

      games = {
        fishing: { essence: accountRow.fishing_points ?? 0, catches: fishing?.catches ?? 0 },
        runes: { essence: accountRow.rune_points ?? 0, casts: runes?.casts ?? 0 },
        sanctum: sanctum ? { essence: sanctum.essence, total_essence: sanctum.total_essence } : null,
        binding_game: familiar ? {
          species: familiar.species, name: familiar.name, nature: familiar.nature, level: familiar.level, stage: familiar.stage,
          battles: familiarBattles?.total ?? 0, wins: familiarBattles?.wins ?? 0,
        } : null,
        cah: { games_played: cah?.games_played ?? 0, essence: cah?.total_souls ?? 0 },
        rite: { games_played: rite?.games_played ?? 0 },
      };
    }

    return jsonResponse({
      identity: { ...(identity ?? { torn_user_id: tornUserId }), image_url: accountRow?.image_url ?? null },
      combat: {
        chain_hits: chainRow,
        war_hits: warRow,
        recent_wars: recentWars.results || [],
        custom_hits: customRow?.total_hits ?? 0,
      },
      oc: {
        joined: ocJoined,
        successful: ocSuccessful,
        failed: ocFailed,
        success_pct: ocJoined > 0 ? Math.round((ocSuccessful / ocJoined) * 1000) / 10 : null,
        cpr: ocCpr.results || [],
      },
      financial: {
        armory_deposits_this_month: armoryThisMonth,
        recent_armory_used: recentArmoryUsed.results || [],
        xanax_recent: xanaxRecent.results || [],
        investments: investments.results || [],
        stocks: stocks.results || [],
        bounties_placed: bountiesPlaced,
        bounties_received: bountiesReceived,
      },
      activity: {
        energy_this_month_total: energy.total_energy,
        energy_this_month_avg: energy.avg_per_day,
        personal_stats: personalStats,
      },
      games,
      warnings,
    });
  } catch (err) {
    console.error('getMemberProfile error:', err);
    return errorResponse('Failed to fetch member profile', 500);
  }
}

function pad2(n) { return String(n).padStart(2, '0'); }

// Same 6-month rolling window WarningsTab.jsx uses for its kick-count badge —
// ported to the backend (UTC-explicit) rather than re-derived on the frontend.
function getSixMonthWindowUTC() {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const endMonth = now.getUTCMonth(); // 0-indexed; exclusive end = 1st of this month
  let startYear = endYear;
  let startMonth = endMonth - 6;
  if (startMonth < 0) { startMonth += 12; startYear -= 1; }
  return {
    start: `${startYear}-${pad2(startMonth + 1)}-01`,
    end: `${endYear}-${pad2(endMonth + 1)}-01`,
  };
}
function isInWindow(periodYear, periodMonth, win) {
  if (periodYear == null || periodMonth == null) return false;
  const periodStr = `${periodYear}-${pad2(periodMonth)}-01`;
  return periodStr >= win.start && periodStr < win.end;
}

// GET /api/members/nav-summary — always self (the navbar dropdown never shows
// anyone else's data), no id param needed. Reuses the exact same
// getEnergyDeltaForUser/getWarningsForMember calls getMemberProfile already
// uses — no new calculations, just a lighter-weight response for a widget that
// loads every time the dropdown opens rather than the full profile aggregate.
export async function getNavSummary(request, env, user) {
  try {
    if (!user) return errorResponse('Authentication required', 401);
    const tornUserId = user.tornUserId;
    const monthStart = monthStartDate();
    const monthEnd = monthEndDate();

    const [energy, warnings] = await Promise.all([
      getEnergyDeltaForUser(env, tornUserId, monthStart, monthEnd),
      getWarningsForMember(env, tornUserId),
    ]);

    const window = getSixMonthWindowUTC();
    const recentWarningCount = warnings.filter(w => isInWindow(w.period_year, w.period_month, window)).length;

    return jsonResponse({ energy_avg: energy.avg_per_day, recent_warning_count: recentWarningCount });
  } catch (err) {
    console.error('getNavSummary error:', err);
    return errorResponse('Failed to fetch nav summary', 500);
  }
}
