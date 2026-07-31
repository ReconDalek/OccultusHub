import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { requireLeadership } from '../middleware/auth.js';
import { getWarningsForMember } from './warningsController.js';
import { PERSONAL_STAT_FIELDS } from './activityController.js';

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

    const [
      identity,
      chainRow,
      warRow,
      recentWars,
      customRow,
      ocParticipation,
      ocCpr,
      armoryThisMonth,
      recentArmoryUsed,
      xanaxRecent,
      investments,
      stocks,
      bountiesPlaced,
      bountiesReceived,
      energyRow,
      monthStatsRows,
      warnings,
    ] = await Promise.all([
      env.DB.prepare(
        `SELECT torn_user_id, username, faction_id, faction_position, level, is_active, joined_at
         FROM faction_members WHERE torn_user_id=?`
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

      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM oc_crime_slots WHERE torn_user_id=? AND outcome='Successful'`
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

      // COUNT(DISTINCT snapshot_date), not COUNT(*) — confirmed live that
      // energy_snapshots has duplicate rows for the same date per user
      // (~2x), which would silently deflate the average if counted raw.
      env.DB.prepare(
        `SELECT MAX(energy_total) - MIN(energy_total) AS energy_this_month, COUNT(DISTINCT snapshot_date) AS snapshot_days
         FROM energy_snapshots WHERE torn_user_id=? AND snapshot_date >= ?`
      ).bind(tornUserId, monthStart).first(),

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

    const avgEnergyThisMonth = energyRow?.snapshot_days > 1
      ? Math.round((energyRow.energy_this_month ?? 0) / (energyRow.snapshot_days - 1))
      : null;

    return jsonResponse({
      identity: identity ?? { torn_user_id: tornUserId },
      combat: {
        chain_hits: chainRow,
        war_hits: warRow,
        recent_wars: recentWars.results || [],
        custom_hits: customRow?.total_hits ?? 0,
        oc_participation: ocParticipation?.count ?? 0,
        oc_cpr: ocCpr.results || [],
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
        energy_this_month_total: energyRow?.energy_this_month ?? null,
        energy_this_month_avg: avgEnergyThisMonth,
        personal_stats: personalStats,
      },
      warnings,
    });
  } catch (err) {
    console.error('getMemberProfile error:', err);
    return errorResponse('Failed to fetch member profile', 500);
  }
}
