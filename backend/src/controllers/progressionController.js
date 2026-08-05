import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const FACTION_IDS   = [33097, 9728, 9171];
const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' };

// Same tiers as RANK_TIERS in MemberRanksTab.jsx — Acolyte (0) excluded,
// nobody needs an estimate for the rank everyone starts at.
const RANK_TIERS = [
  { tier: 'Adept',     min: 500   },
  { tier: 'Arcanist',  min: 1000  },
  { tier: 'Sentinel',  min: 2500  },
  { tier: 'Doomsayer', min: 5000  },
  { tier: 'Harbinger', min: 15000 },
];

const DAY_MS   = 86400000;
const AVG_DAYS_PER_MONTH = 30.44;

// D1 DATETIME strings are 'YYYY-MM-DD HH:MM:SS' with no timezone marker —
// must be normalised to UTC before parsing (see backend architecture notes).
function parseD1(str) {
  if (!str) return null;
  const t = Date.parse(str.replace(' ', 'T') + 'Z');
  return isNaN(t) ? null : t;
}

function monthKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/progression
// Monthly per-faction, per-average-member progression trend (attacks + rank
// units, chain vs war vs custom breakdown), plus empirical + projected
// "time to reach each rank" estimates. Always computed live — no config to save.
//
// Data-quality notes (both discovered against real prod data while building
// this — see feedback_data_accuracy_debugging memory pattern of confirming
// direction before trusting a number):
//  - `faction_members.joined_at` is when OUR row was created/last resynced,
//    not the member's real Torn join date — bulk-imported/veteran members
//    can show joined_at of a few weeks ago while Torn's own `days_in_faction`
//    says 1500+. Real tenure is derived from `days_in_faction` instead.
//  - Per-month historical headcount reconstruction is therefore unreliable
//    (placeholder rows with unset left_at would count as "active" for any
//    past month). Every month instead divides by each faction's CURRENT
//    active roster size — a stable denominator, and the natural reading of
//    "what does an average member of this faction earn per month".
// ─────────────────────────────────────────────────────────────────────────────
export async function getProgressionTrend(request, env) {
  try {
    const [chainRows, warRows, customRows, memberRows] = await Promise.all([
      env.DB.prepare(
        `SELECT COALESCE(fm.faction_id, ch.faction_id) AS faction_id,
                ch.torn_user_id, ch.total_attacks, ch.start_at
         FROM chain_hits ch
         LEFT JOIN faction_members fm ON fm.torn_user_id = ch.torn_user_id`
      ).all(),
      env.DB.prepare(
        `SELECT COALESCE(fm.faction_id, wh.faction_id) AS faction_id,
                wh.torn_user_id, wh.war_hits, wh.outside_hits, wh.assists, wh.units,
                COALESCE(rw.ended_at, rw.started_at, rw.scheduled_start) AS event_at
         FROM war_hits wh
         JOIN ranked_wars rw ON rw.id = wh.ranked_war_id
         LEFT JOIN faction_members fm ON fm.torn_user_id = wh.torn_user_id`
      ).all(),
      // 'Historic Hits'/'Historical Hits' are a one-time 2026-06-08 bulk
      // backfill of pre-tracking-system totals (avg ~2000/718 per entry,
      // all stamped the same import timestamp) — not dated activity. Left
      // in they'd render as a fake single-day mega-spike on the monthly
      // curve and corrupt every recipient's empirical days-to-rank. Real
      // dated custom-hit types (event/raid/war credits) are kept.
      env.DB.prepare(
        `SELECT COALESCE(fm.faction_id, cx.faction_id) AS faction_id,
                cx.torn_user_id, cx.hits, cx.saved_at
         FROM custom_hits cx
         LEFT JOIN faction_members fm ON fm.torn_user_id = cx.torn_user_id
         WHERE cx.hit_type NOT LIKE 'Historic%'`
      ).all(),
      env.DB.prepare(
        `SELECT torn_user_id, faction_id, is_active, days_in_faction FROM faction_members`
      ).all(),
    ]);

    // ── Current roster + estimated real join date (from Torn's days_in_faction) ──
    const now = Date.now();
    const memberByTornId = {};
    const activeCounts = {};
    for (const id of FACTION_IDS) activeCounts[id] = 0;

    for (const m of memberRows.results || []) {
      const estimatedJoinTs = (m.days_in_faction != null) ? now - m.days_in_faction * DAY_MS : null;
      memberByTornId[m.torn_user_id] = {
        torn_user_id: m.torn_user_id,
        faction_id: m.faction_id,
        isActive: !!m.is_active,
        estimatedJoinTs,
      };
      if (m.is_active && FACTION_IDS.includes(m.faction_id)) activeCounts[m.faction_id]++;
    }

    // ── Normalise every hit source into one flat event list — only for
    // members currently active in one of the 3 tracked factions, so the
    // "average member" numerator and denominator are the same population ──
    const events = [];

    function pushEvent(factionId, tornUserId, ts, chainAttacks, warAttacks, customHits, units) {
      if (!FACTION_IDS.includes(factionId) || !ts) return;
      const m = memberByTornId[tornUserId];
      if (!m || !m.isActive || m.faction_id !== factionId) return;
      events.push({ faction_id: factionId, torn_user_id: tornUserId, ts, chainAttacks, warAttacks, customHits, units });
    }

    for (const r of chainRows.results || []) {
      pushEvent(r.faction_id, r.torn_user_id, r.start_at ? r.start_at * 1000 : null, r.total_attacks || 0, 0, 0, r.total_attacks || 0);
    }
    for (const r of warRows.results || []) {
      const warAttacks = (r.war_hits || 0) + (r.outside_hits || 0) + (r.assists || 0);
      pushEvent(r.faction_id, r.torn_user_id, r.event_at ? r.event_at * 1000 : null, 0, warAttacks, 0, r.units || 0);
    }
    for (const r of customRows.results || []) {
      pushEvent(r.faction_id, r.torn_user_id, parseD1(r.saved_at), 0, 0, r.hits || 0, r.hits || 0);
    }

    if (!events.length) {
      const factions = {};
      for (const id of FACTION_IDS) {
        factions[id] = {
          name: FACTION_NAMES[id], monthly: [], monthlyRate: 0,
          rankEstimates: RANK_TIERS.map(t => ({ ...t, empiricalAvgDays: null, empiricalSample: 0, empiricalEligible: 0, projectedDays: null })),
        };
      }
      return jsonResponse({ months: [], factions });
    }

    // ── Build the full ascending month range, gap-filled ──
    const minTs = Math.min(...events.map(e => e.ts));
    const firstMonth = monthKeyOf(minTs);
    const currentMonth = monthKeyOf(now);
    const months = [];
    for (let mk = firstMonth; ; mk = addMonths(mk, 1)) {
      months.push(mk);
      if (mk === currentMonth) break;
    }

    // ── Monthly totals per faction ──
    const totals = {}; // factionId -> monthKey -> { chainAttacks, warAttacks, customHits, totalUnits }
    for (const id of FACTION_IDS) {
      totals[id] = {};
      for (const mk of months) totals[id][mk] = { chainAttacks: 0, warAttacks: 0, customHits: 0, totalUnits: 0 };
    }
    for (const e of events) {
      const mk = monthKeyOf(e.ts);
      const bucket = totals[e.faction_id]?.[mk];
      if (!bucket) continue;
      bucket.chainAttacks += e.chainAttacks;
      bucket.warAttacks   += e.warAttacks;
      bucket.customHits   += e.customHits;
      bucket.totalUnits   += e.units;
    }

    // ── Empirical cohort: per-member running total vs. estimated real join date ──
    const eventsByMember = {};
    for (const e of events) {
      (eventsByMember[e.torn_user_id] ||= []).push(e);
    }

    const cohort = {}; // factionId -> tier -> { totalDays, sample, eligible }
    for (const id of FACTION_IDS) {
      cohort[id] = {};
      for (const t of RANK_TIERS) cohort[id][t.tier] = { totalDays: 0, sample: 0, eligible: 0 };
    }

    for (const [tornIdStr, memberEvents] of Object.entries(eventsByMember)) {
      const m = memberByTornId[tornIdStr];
      if (!m || m.estimatedJoinTs == null) continue;

      // Only count hits earned during the member's CURRENT stint (their
      // days_in_faction window). Some members' chain/war history predates
      // that window entirely (a prior stint, or activity attributed to
      // their current faction from before a rejoin) — without this filter
      // those pre-stint hits look like an instant post-join rank-up, which
      // isn't what "how fast would a new member progress" is asking.
      const postJoinEvents = memberEvents
        .filter(e => e.ts >= m.estimatedJoinTs)
        .sort((a, b) => a.ts - b.ts);
      if (!postJoinEvents.length) continue;

      for (const t of RANK_TIERS) cohort[m.faction_id][t.tier].eligible++;

      let running = 0;
      let tierIdx = 0;
      for (const e of postJoinEvents) {
        running += e.units;
        while (tierIdx < RANK_TIERS.length && running >= RANK_TIERS[tierIdx].min) {
          const tierName = RANK_TIERS[tierIdx].tier;
          const days = (e.ts - m.estimatedJoinTs) / DAY_MS;
          cohort[m.faction_id][tierName].totalDays += days;
          cohort[m.faction_id][tierName].sample++;
          tierIdx++;
        }
        if (tierIdx >= RANK_TIERS.length) break;
      }
    }

    // ── Assemble per-faction response ──
    const factions = {};
    for (const id of FACTION_IDS) {
      const denom = Math.max(1, activeCounts[id]);
      let cumAvgAttacks = 0;
      let cumAvgUnits = 0;
      const monthly = months.map(mk => {
        const t = totals[id][mk];
        const totalAttacks = t.chainAttacks + t.warAttacks + t.customHits;
        const avgAttacks = totalAttacks / denom;
        const avgUnits   = t.totalUnits  / denom;
        cumAvgAttacks += avgAttacks;
        cumAvgUnits   += avgUnits;
        return {
          month: mk,
          chainAttacks: t.chainAttacks, warAttacks: t.warAttacks, customHits: t.customHits,
          totalAttacks, totalUnits: t.totalUnits, activeMembers: activeCounts[id],
          avgAttacks, avgUnits, cumAvgAttacks, cumAvgUnits,
        };
      });

      // Projected rate: trailing full months (exclude current partial month),
      // up to the last 6 available.
      const completeMonths = monthly.filter(m => m.month !== currentMonth);
      const trailing = completeMonths.slice(-6);
      const monthlyRate = trailing.length
        ? trailing.reduce((s, m) => s + m.avgUnits, 0) / trailing.length
        : 0;

      const rankEstimates = RANK_TIERS.map(t => {
        const c = cohort[id][t.tier];
        return {
          tier: t.tier,
          min: t.min,
          empiricalAvgDays: c.sample > 0 ? c.totalDays / c.sample : null,
          empiricalSample: c.sample,
          empiricalEligible: c.eligible,
          projectedDays: monthlyRate > 0 ? (t.min / monthlyRate) * AVG_DAYS_PER_MONTH : null,
        };
      });

      factions[id] = { name: FACTION_NAMES[id], monthly, monthlyRate, rankEstimates };
    }

    return jsonResponse({ months, factions });
  } catch (err) {
    console.error('getProgressionTrend error:', err);
    return errorResponse('Failed to compute progression trend', 500);
  }
}
