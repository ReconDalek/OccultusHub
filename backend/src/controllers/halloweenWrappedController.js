import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { PERSONAL_STAT_FIELDS, extractStats } from './activityController.js';

const FACTION_IDS = [33097, 9728, 9171];
const FACTION_LABELS = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' };

// Trick-or-treat window. Aggregate (faction/global) totals always use the
// fixed window — a new recruit simply has no rows in our faction-scoped
// tables (chains, OC, watch shifts, etc.) before they joined, so those
// categories self-clamp. personal_stats_snapshots is the one exception —
// it's the player's lifetime Torn account stats, not faction-scoped, so a
// member's own recap additionally re-queries it from whichever is later:
// the window start or their faction join date.
const WINDOW_START_DATE = '2026-10-25';
const WINDOW_END_DATE   = '2026-11-01';
const WINDOW_START_DT   = '2026-10-25 00:00:00';
const WINDOW_END_DT     = '2026-11-01 23:59:59';
const WINDOW_START_TS   = Math.floor(Date.UTC(2026, 9, 25, 0, 0, 0) / 1000);
const WINDOW_END_TS     = Math.floor(Date.UTC(2026, 10, 1, 23, 59, 59) / 1000);

// Quirky flavour name for whichever tracked category a member's own best
// family-wide showing falls into — see the title computation below.
const TITLE_NAMES = {
  chainHits: { name: 'The Chainbreaker', icon: '⛓️' },
  ocSuccess: { name: 'The Criminal Mastermind', icon: '🔮' },
  watchHours: { name: 'The Night Watch', icon: '👁️' },
  gamesPlayed: { name: 'The Game Room Regular', icon: '🎲' },
  attacksWon: { name: 'The Brawler', icon: '💥' },
  xanaxTaken: { name: 'The Pill Popper', icon: '💊' },
  moneyMugged: { name: 'The Midnight Mugger', icon: '💰' },
  bountyMoney: { name: 'The Bounty Hunter', icon: '💵' },
  crimes: { name: 'The Career Criminal', icon: '🔪' },
  mailsSent: { name: 'The Town Crier', icon: '✉️' },
};

const CURATED_PERSONAL_FIELDS = [
  'atk_won', 'atk_lost', 'hosp', 'drug_xanax', 'drugs', 'crimes',
  'networth', 'bounties_coll', 'bounty_val_coll', 'money_mugged', 'mails_total', 'travel', 'active_time',
];

// A snapshot labelled YYYY-MM-DD is taken ~01:00 UTC the NEXT day and holds
// cumulative totals as of that moment — i.e. it represents "end of" that
// date, not the start of it (takePersonalStatsSnapshot stores the live
// fetch under `yesterday`'s date). So the correct lower bound for "all
// activity from date D onward" is the snapshot labelled D-1 (end of D-1 =
// start of D), not D itself — using D as the floor would silently exclude
// everything that happened ON D.
function dayBefore(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function bump(map, tornId, patch) {
  if (!tornId) return;
  const row = map.get(tornId);
  if (!row) return; // not a currently-active member of one of our 3 factions
  for (const [k, v] of Object.entries(patch)) row[k] = (row[k] || 0) + (v || 0);
}

// Same MIN/MAX-join delta pattern getPersonalStats (activityController.js)
// uses for its "range" mode — earliest vs latest snapshot inside the window,
// per user, clamped to >= fromDate.
async function personalStatsDelta(env, fromDate, toDate) {
  const [startRows, endRows] = await Promise.all([
    env.DB.prepare(`
      SELECT p.torn_user_id, p.stats
      FROM personal_stats_snapshots p
      INNER JOIN (
        SELECT torn_user_id, MIN(snapshot_date) AS min_date
        FROM personal_stats_snapshots
        WHERE snapshot_date >= ? AND snapshot_date <= ?
        GROUP BY torn_user_id
      ) s ON p.torn_user_id = s.torn_user_id AND p.snapshot_date = s.min_date
    `).bind(fromDate, toDate).all(),
    env.DB.prepare(`
      SELECT p.torn_user_id, p.stats
      FROM personal_stats_snapshots p
      INNER JOIN (
        SELECT torn_user_id, MAX(snapshot_date) AS max_date
        FROM personal_stats_snapshots
        WHERE snapshot_date >= ? AND snapshot_date <= ?
        GROUP BY torn_user_id
      ) e ON p.torn_user_id = e.torn_user_id AND p.snapshot_date = e.max_date
    `).bind(fromDate, toDate).all(),
  ]);

  const endMap = new Map();
  for (const r of (endRows.results || [])) {
    try { endMap.set(r.torn_user_id, JSON.parse(r.stats)); } catch { /* skip */ }
  }

  const out = new Map();
  for (const r of (startRows.results || [])) {
    const endStats = endMap.get(r.torn_user_id);
    if (!endStats) continue;
    let startStats;
    try { startStats = JSON.parse(r.stats); } catch { continue; }

    const startExtracted = extractStats(startStats);
    const endExtracted = extractStats(endStats);
    const delta = {};
    for (const f of PERSONAL_STAT_FIELDS) {
      delta[f.key] = Math.max(0, (endExtracted[f.key] || 0) - (startExtracted[f.key] || 0));
    }
    out.set(r.torn_user_id, delta);
  }
  return out;
}

function pickCurated(delta) {
  const out = {};
  for (const key of CURATED_PERSONAL_FIELDS) out[key] = delta?.[key] || 0;
  out.items_used = (delta?.candy_used || 0) + (delta?.boosters_used || 0)
    + (delta?.consumables_used || 0) + (delta?.energy_used || 0) + (delta?.alcohol_used || 0);
  return out;
}

function emptyRow(username, factionId) {
  return {
    username, factionId,
    chainHits: 0, chainRespect: 0, chainsPlayed: 0,
    warHits: 0, warRespect: 0,
    ocJoined: 0, ocSuccess: 0,
    watchHours: 0,
    raffleTickets: 0, raffleWins: 0,
    forumPosts: 0, gamesPlayed: 0,
    armoryDeposits: 0, armoryQty: 0,
    bountiesPlaced: 0,
    personal: {},
  };
}

function rankOf(rows, tornId, metricFn, factionId = null) {
  const pool = factionId ? rows.filter(([, r]) => r.factionId === factionId) : rows;
  const sorted = [...pool].sort((a, b) => metricFn(b[1]) - metricFn(a[1]));
  const idx = sorted.findIndex(([id]) => id === tornId);
  if (idx === -1) return null;
  const total = sorted.length;
  return { rank: idx + 1, total, value: metricFn(sorted[idx][1]), percentile: Math.round((1 - idx / total) * 100) };
}

function topOf(rows, metricFn, factionId = null) {
  const pool = factionId ? rows.filter(([, r]) => r.factionId === factionId) : rows;
  let best = null;
  for (const [tornId, r] of pool) {
    const v = metricFn(r);
    if (v > 0 && (!best || v > best.value)) best = { tornId, username: r.username, value: v };
  }
  return best;
}

export async function getHalloweenWrapped(request, env, user) {
  try {
    const meTornId = user.tornUserId;
    if (!meTornId) return errorResponse('No linked Torn account', 400);

    const [membersRes, usersRes, meMemberRow] = await Promise.all([
      env.DB.prepare(
        `SELECT torn_user_id, username, faction_id, joined_at FROM faction_members
         WHERE is_active = 1 AND faction_id IN (${FACTION_IDS.map(() => '?').join(',')})`
      ).bind(...FACTION_IDS).all(),
      env.DB.prepare(`SELECT id, torn_user_id FROM users`).all(),
      env.DB.prepare(`SELECT faction_id, joined_at, username FROM faction_members WHERE torn_user_id = ?`).bind(meTornId).first(),
    ]);

    const idToTorn = new Map((usersRes.results || []).map(u => [u.id, u.torn_user_id]));
    const stats = new Map();
    for (const m of (membersRes.results || [])) {
      stats.set(m.torn_user_id, emptyRow(m.username, m.faction_id));
    }

    const myFactionId = meMemberRow?.faction_id ?? null;
    const myJoinedDate = meMemberRow?.joined_at ? meMemberRow.joined_at.slice(0, 10) : WINDOW_START_DATE;
    const myEffectiveStart = myJoinedDate > WINDOW_START_DATE ? myJoinedDate : WINDOW_START_DATE;

    const [
      chainRows, warRows, ocRows, watchRows, raffleTicketRows, raffleWinRows,
      forumRows, riteRows, cahRows, armoryRows, bountyRows, newMemberRows,
      personalDeltaAll, myPersonalDeltaClamped,
    ] = await Promise.all([
      env.DB.prepare(
        `SELECT torn_user_id, SUM(total_attacks) AS hits, SUM(total_respect) AS respect, COUNT(DISTINCT torn_chain_id) AS chains
         FROM chain_hits WHERE start_at >= ? AND start_at <= ? GROUP BY torn_user_id`
      ).bind(WINDOW_START_TS, WINDOW_END_TS).all(),
      env.DB.prepare(
        `SELECT attacker_id AS torn_user_id, COUNT(*) AS hits, SUM(respect_gain) AS respect
         FROM war_attacks WHERE started_at >= ? AND started_at <= ? AND attack_type = 'war_attack' GROUP BY attacker_id`
      ).bind(WINDOW_START_TS, WINDOW_END_TS).all(),
      env.DB.prepare(
        `SELECT s.torn_user_id, COUNT(*) AS joined, SUM(CASE WHEN c.status = 'Successful' THEN 1 ELSE 0 END) AS successful
         FROM oc_crime_slots s JOIN oc_crimes c ON c.id = s.crime_id
         WHERE c.executed_at >= ? AND c.executed_at <= ? AND s.torn_user_id IS NOT NULL
         GROUP BY s.torn_user_id`
      ).bind(WINDOW_START_TS, WINDOW_END_TS).all(),
      env.DB.prepare(
        `SELECT torn_user_id, COUNT(*) AS hours FROM chain_watch_shifts
         WHERE slot_start >= ? AND slot_start <= ? GROUP BY torn_user_id`
      ).bind(WINDOW_START_TS, WINDOW_END_TS).all(),
      env.DB.prepare(
        `SELECT torn_user_id, COUNT(*) AS tickets FROM chain_raffle_entries
         WHERE slot_start >= ? AND slot_start <= ? GROUP BY torn_user_id`
      ).bind(WINDOW_START_TS, WINDOW_END_TS).all(),
      env.DB.prepare(
        `SELECT torn_user_id, COUNT(*) AS wins FROM chain_raffle_winners
         WHERE drawn_at >= ? AND drawn_at <= ? GROUP BY torn_user_id`
      ).bind(WINDOW_START_DT, WINDOW_END_DT).all(),
      env.DB.prepare(
        `SELECT author_id AS user_id, COUNT(*) AS posts FROM forum_posts
         WHERE created_at >= ? AND created_at <= ? GROUP BY author_id`
      ).bind(WINDOW_START_DT, WINDOW_END_DT).all(),
      env.DB.prepare(
        `SELECT user_id, COUNT(*) AS n FROM game_players
         WHERE user_id IS NOT NULL AND joined_at >= ? AND joined_at <= ? GROUP BY user_id`
      ).bind(WINDOW_START_DT, WINDOW_END_DT).all(),
      env.DB.prepare(
        `SELECT user_id, COUNT(*) AS n FROM cah_players
         WHERE user_id IS NOT NULL AND joined_at >= ? AND joined_at <= ? GROUP BY user_id`
      ).bind(WINDOW_START_DT, WINDOW_END_DT).all(),
      env.DB.prepare(
        `SELECT torn_user_id, COUNT(*) AS deposits, SUM(quantity) AS qty FROM armory_deposits
         WHERE deposited_at >= ? AND deposited_at <= ? GROUP BY torn_user_id`
      ).bind(WINDOW_START_TS, WINDOW_END_TS).all(),
      env.DB.prepare(
        `SELECT placer_torn_id AS torn_user_id, COUNT(*) AS placed FROM bounties
         WHERE placed_at >= ? AND placed_at <= ? AND placer_torn_id IS NOT NULL GROUP BY placer_torn_id`
      ).bind(WINDOW_START_TS, WINDOW_END_TS).all(),
      env.DB.prepare(
        `SELECT faction_id, COUNT(*) AS n FROM faction_members
         WHERE joined_at >= ? AND joined_at <= ? AND faction_id IN (${FACTION_IDS.map(() => '?').join(',')})
         GROUP BY faction_id`
      ).bind(WINDOW_START_DT, WINDOW_END_DT, ...FACTION_IDS).all(),
      personalStatsDelta(env, dayBefore(WINDOW_START_DATE), WINDOW_END_DATE),
      myEffectiveStart !== WINDOW_START_DATE ? personalStatsDelta(env, dayBefore(myEffectiveStart), WINDOW_END_DATE) : null,
    ]);

    for (const r of (chainRows.results || [])) bump(stats, r.torn_user_id, { chainHits: r.hits, chainRespect: r.respect, chainsPlayed: r.chains });
    for (const r of (warRows.results || [])) bump(stats, r.torn_user_id, { warHits: r.hits, warRespect: r.respect });
    for (const r of (ocRows.results || [])) bump(stats, r.torn_user_id, { ocJoined: r.joined, ocSuccess: r.successful });
    for (const r of (watchRows.results || [])) bump(stats, r.torn_user_id, { watchHours: r.hours });
    for (const r of (raffleTicketRows.results || [])) bump(stats, r.torn_user_id, { raffleTickets: r.tickets });
    for (const r of (raffleWinRows.results || [])) bump(stats, r.torn_user_id, { raffleWins: r.wins });
    for (const r of (forumRows.results || [])) bump(stats, idToTorn.get(r.user_id), { forumPosts: r.posts });
    for (const r of (riteRows.results || [])) bump(stats, idToTorn.get(r.user_id), { gamesPlayed: r.n });
    for (const r of (cahRows.results || [])) bump(stats, idToTorn.get(r.user_id), { gamesPlayed: r.n });
    for (const r of (armoryRows.results || [])) bump(stats, r.torn_user_id, { armoryDeposits: r.deposits, armoryQty: r.qty });
    for (const r of (bountyRows.results || [])) bump(stats, r.torn_user_id, { bountiesPlaced: r.placed });
    for (const [tornId, row] of stats) {
      const delta = personalDeltaAll.get(tornId);
      if (delta) row.personal = pickCurated(delta);
    }

    const rows = [...stats.entries()];
    const myRow = stats.get(meTornId) || emptyRow(user.username, myFactionId);
    const myPersonal = myPersonalDeltaClamped
      ? pickCurated(myPersonalDeltaClamped.get(meTornId))
      : myRow.personal;

    const METRICS = [
      { key: 'chainHits', label: 'Chain Hits', icon: '⚔️', get: r => r.chainHits },
      { key: 'warHits', label: 'War Hits', icon: '🗡️', get: r => r.warHits },
      { key: 'ocSuccess', label: 'Successful OCs', icon: '🔮', get: r => r.ocSuccess },
      { key: 'watchHours', label: 'Hours on Watch', icon: '👁️', get: r => r.watchHours },
      { key: 'forumPosts', label: 'Forum Posts', icon: '📜', get: r => r.forumPosts },
      { key: 'gamesPlayed', label: 'Games Played', icon: '🎲', get: r => r.gamesPlayed },
      { key: 'attacksWon', label: 'Attacks Won', icon: '💥', get: r => r.personal?.atk_won || 0 },
      { key: 'xanaxTaken', label: 'Xanax Taken', icon: '💊', get: r => r.personal?.drug_xanax || 0 },
    ];

    const myRanks = {};
    for (const m of METRICS) {
      const v = m.get(myRow);
      if (v > 0) {
        myRanks[m.key] = {
          label: m.label, icon: m.icon, value: v,
          faction: myFactionId ? rankOf(rows, meTornId, m.get, myFactionId) : null,
          global: rankOf(rows, meTornId, m.get),
        };
      }
    }

    // Everyone's personal "title" is whichever tracked category they rank
    // BEST in family-wide, among categories they actually have activity in
    // — not necessarily #1 overall, just their own strongest showing
    // relative to everyone else. "Best" is by PERCENTILE WITHIN THAT
    // CATEGORY'S OWN PARTICIPANT POOL (rank ÷ participants), not raw rank
    // number — a raw-rank comparison unfairly favours small pools (e.g.
    // #5 of 43 chain-watch shifts beating #16 of 191 attackers on paper,
    // despite the attacker having actually out-performed a much bigger
    // field). War/forum categories are excluded outright — nobody has any
    // activity there this period, so they'd never surface anyway, but
    // skipping the sort avoids wasted work.
    const TITLE_METRICS = METRICS
      .filter(m => m.key !== 'warHits' && m.key !== 'forumPosts')
      .concat([
        { key: 'moneyMugged', label: 'Money Mugged', icon: '💰', get: r => r.personal?.money_mugged || 0 },
        { key: 'bountyMoney', label: 'Bounty Money Earned', icon: '💵', get: r => r.personal?.bounty_val_coll || 0 },
        { key: 'crimes', label: 'Crimes Committed', icon: '🔪', get: r => r.personal?.crimes || 0 },
        { key: 'mailsSent', label: 'Mails Sent', icon: '✉️', get: r => r.personal?.mails_total || 0 },
      ]);
    const titlePools = new Map(TITLE_METRICS.map(m => {
      const entries = rows.filter(([, r]) => m.get(r) > 0).sort((a, b) => m.get(b[1]) - m.get(a[1]));
      return [m.key, { rankOf: new Map(entries.map(([tornId], i) => [tornId, i + 1])), poolSize: entries.length }];
    }));
    const titleCounts = new Map();
    const bestKeyByUser = new Map();
    for (const [tornId, row] of rows) {
      let best = null;
      for (const m of TITLE_METRICS) {
        const pool = titlePools.get(m.key);
        const rank = pool.rankOf.get(tornId);
        if (!rank) continue;
        const percentile = rank / pool.poolSize;
        if (!best || percentile < best.percentile) best = { key: m.key, rank, poolSize: pool.poolSize, percentile, value: m.get(row) };
      }
      if (best) {
        bestKeyByUser.set(tornId, best);
        titleCounts.set(best.key, (titleCounts.get(best.key) || 0) + 1);
      }
    }
    const myBest = bestKeyByUser.get(meTornId);
    const myTitle = myBest ? {
      key: myBest.key,
      name: TITLE_NAMES[myBest.key]?.name || 'The Overachiever',
      icon: TITLE_NAMES[myBest.key]?.icon || '🏆',
      metricLabel: TITLE_METRICS.find(m => m.key === myBest.key)?.label,
      value: myBest.value,
      rank: myBest.rank,
      total: myBest.poolSize,
      othersWithTitle: Math.max(0, (titleCounts.get(myBest.key) || 1) - 1),
    } : null;

    function sumFor(factionId) {
      const pool = factionId ? rows.filter(([, r]) => r.factionId === factionId) : rows;
      const totals = {
        members: pool.length,
        chainHits: 0, chainRespect: 0, warHits: 0, warRespect: 0,
        ocJoined: 0, ocSuccess: 0, watchHours: 0, raffleTickets: 0, raffleWins: 0,
        forumPosts: 0, gamesPlayed: 0, armoryDeposits: 0, bountiesPlaced: 0,
        attacksWon: 0, xanaxTaken: 0,
      };
      for (const [, r] of pool) {
        totals.chainHits += r.chainHits; totals.chainRespect += r.chainRespect;
        totals.warHits += r.warHits; totals.warRespect += r.warRespect;
        totals.ocJoined += r.ocJoined; totals.ocSuccess += r.ocSuccess;
        totals.watchHours += r.watchHours; totals.raffleTickets += r.raffleTickets; totals.raffleWins += r.raffleWins;
        totals.forumPosts += r.forumPosts; totals.gamesPlayed += r.gamesPlayed;
        totals.armoryDeposits += r.armoryDeposits; totals.bountiesPlaced += r.bountiesPlaced;
        totals.attacksWon += r.personal?.atk_won || 0; totals.xanaxTaken += r.personal?.drug_xanax || 0;
      }
      return totals;
    }

    function superlatives(factionId) {
      const score = r => r.chainHits + r.warHits * 2 + r.ocSuccess * 3 + r.forumPosts + r.gamesPlayed + r.watchHours * 0.5;
      const mvp = topOf(rows, score, factionId);
      return {
        mvp: mvp && { ...mvp, label: 'Faction MVP', icon: '🎃' },
        pillPopper: wrapSuper(topOf(rows, r => r.personal?.drug_xanax || 0, factionId), 'Pill Popper', '💊'),
        chainChampion: wrapSuper(topOf(rows, r => r.chainHits, factionId), 'Chain Champion', '⚔️'),
        nightWatch: wrapSuper(topOf(rows, r => r.watchHours, factionId), 'Night Watch', '👁️'),
        crimeSyndicate: wrapSuper(topOf(rows, r => r.ocSuccess, factionId), 'Crime Syndicate Star', '🔮'),
        townCrier: wrapSuper(topOf(rows, r => r.forumPosts, factionId), 'Town Crier', '📜'),
        gameRoomRegular: wrapSuper(topOf(rows, r => r.gamesPlayed, factionId), 'Game Room Regular', '🎲'),
      };
    }
    function wrapSuper(best, label, icon) { return best && { ...best, label, icon }; }

    const newMembersByFaction = new Map((newMemberRows.results || []).map(r => [r.faction_id, r.n]));
    const factionTotals = FACTION_IDS.map(id => ({
      factionId: id, label: FACTION_LABELS[id],
      newMembers: newMembersByFaction.get(id) || 0,
      totals: sumFor(id),
      superlatives: superlatives(id),
    }));

    return jsonResponse({
      window: { start: WINDOW_START_DATE, end: WINDOW_END_DATE },
      me: {
        tornUserId: meTornId,
        username: myRow.username || user.username,
        factionId: myFactionId,
        factionLabel: myFactionId ? FACTION_LABELS[myFactionId] : null,
        effectiveStart: myEffectiveStart,
        joinedDuringWindow: myEffectiveStart !== WINDOW_START_DATE,
        personal: myPersonal,
        chain: { hits: myRow.chainHits, respect: myRow.chainRespect, chains: myRow.chainsPlayed },
        war: { hits: myRow.warHits, respect: myRow.warRespect },
        oc: { joined: myRow.ocJoined, successful: myRow.ocSuccess },
        chainWatch: { hours: myRow.watchHours },
        raffle: { tickets: myRow.raffleTickets, wins: myRow.raffleWins },
        forumPosts: myRow.forumPosts,
        gamesPlayed: myRow.gamesPlayed,
        armory: { deposits: myRow.armoryDeposits, quantity: myRow.armoryQty },
        bountiesPlaced: myRow.bountiesPlaced,
        ranks: myRanks,
        title: myTitle,
      },
      myFaction: myFactionId ? factionTotals.find(f => f.factionId === myFactionId) : null,
      factions: factionTotals,
      global: {
        totals: sumFor(null),
        superlatives: superlatives(null),
      },
    });
  } catch (error) {
    console.error('getHalloweenWrapped error:', error);
    return errorResponse('Failed to build Halloween Wrapped', 500);
  }
}
