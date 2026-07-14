import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getStaffApiKeyForFaction, fetchWithRetry } from '../services/tornApiService.js';
import { logInfo, logWarn, logError } from '../services/logger.js';

const FACTION_IDS   = [33097, 9728, 9171];
const TORN_API_BASE = 'https://api.torn.com/v2';


// ── Text parsing helpers ──────────────────────────────────────────────────────

function parseScheduledStart(text) {
  const m = text.match(/will begin in \d+ hours? on \w+ (\d{2}:\d{2}:\d{2}) - (\d{2})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  const [, time, day, month, yr] = m;
  const [h, min, s] = time.split(':').map(Number);
  return Math.floor(Date.UTC(2000 + parseInt(yr, 10), parseInt(month, 10) - 1, parseInt(day, 10), h, min, s) / 1000);
}

function parseOpponentFactionId(text, ourFactionId) {
  const re = /factions\.php\?step=profile&ID=(\d+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const id = parseInt(m[1], 10);
    if (id !== ourFactionId) return id;
  }
  return null;
}

function parseOpponentName(text, ourFactionId) {
  const re = /factions\.php\?step=profile&ID=(\d+)[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (parseInt(m[1], 10) !== ourFactionId) return m[2].trim();
  }
  return null;
}

function parseWarId(text) {
  const m = text.match(/rankID=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseRankChange(text) {
  const m = text.match(/ranked (down|up) from (.+?) and received/);
  return m ? `Ranked ${m[1]} from ${m[2].trim()}` : null;
}

function parseBonusRespect(text) {
  const m = text.match(/([\d,]+) bonus respect/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

function parseRewards(text) {
  // Everything after "bonus respect, " is cache rewards, e.g. "1x Heavy Arms Cache, 3x Armor Cache"
  const m = text.match(/bonus respect,\s*(.+?)\s*$/);
  if (!m) return null;
  const items = m[1].split(',').map(s => s.trim()).filter(Boolean);
  return items.length ? JSON.stringify(items) : null;
}

// Items to silently ignore in armory tracking (consumed freely, not worth reporting)
const ARMORY_IGNORE = /^beer$|bottle of beer|can of beer/i;

function parseArmoryEntry(text) {
  const userM = text.match(/XID=(\d+)[^>]*>([^<]+)<\/a>/);
  if (!userM) return null;

  let item_name = null;
  let action_type = 'used';

  // "used one of the faction's Xanax items"
  const usedM = text.match(/faction's (.+?) items?/);
  if (usedM) { item_name = usedM[1].trim(); action_type = 'used'; }

  // "filled one of the faction's Empty Blood Bags to create a Blood Bag : A+"
  if (!item_name) {
    const fillM = text.match(/create a (.+?)(?:<|$)/);
    if (fillM && text.includes('filled one of the faction')) { item_name = fillM[1].trim(); action_type = 'used'; }
  }

  // loaned/gave/returned — ignore, we only track consumed items
  if (!item_name) return null;
  if (ARMORY_IGNORE.test(item_name)) return null;
  return { torn_user_id: parseInt(userM[1], 10), username: userM[2].trim(), item_name };
}

function categoriseAttack(attack, ourFactionId, opponentFactionId) {
  const af  = attack.attacker?.faction?.id ?? null;
  const df  = attack.defender?.faction?.id ?? null;
  const res = attack.result;

  // War assist: our member assisted an attack specifically on the opponent
  if (res === 'Assist' && af === ourFactionId && df === opponentFactionId) return 'assist';
  // Any other assist (chain assists, etc.) — ignore
  if (res === 'Assist') return null;

  if (af === ourFactionId  && df === opponentFactionId) return 'war_attack';
  if (af === opponentFactionId && df === ourFactionId)  return 'war_defend';
  if (af === ourFactionId  && df === ourFactionId)      return 'friendly_hit';
  if (af === ourFactionId)                              return 'outside_attack';
  if (df === ourFactionId)                              return 'outside_defend';
  return null;
}

// ── Aggregate member stats from war_attacks (shared SQL) ─────────────────────

async function buildMemberStats(env, warId) {
  const { results: attackerStats } = await env.DB.prepare(
    `SELECT
       attacker_id, attacker_name,
       COUNT(CASE WHEN attack_type='war_attack' THEN 1 END)                                                              AS war_attacks,
       COUNT(CASE WHEN attack_type='war_attack' AND result NOT IN ('Escape','Lost','Stalemate') AND is_interrupted=0 THEN 1 END) AS war_hits,
       COUNT(CASE WHEN attack_type='war_attack' AND (result IN ('Escape','Lost') OR is_interrupted=1) THEN 1 END)        AS war_losses,
       COUNT(CASE WHEN attack_type='war_attack' AND is_interrupted=1 THEN 1 END)                                         AS war_interrupted,
       ROUND(SUM(CASE WHEN attack_type='war_attack'    THEN respect_gain ELSE 0 END), 2)                                 AS war_respect_gained,
       ROUND(AVG(CASE WHEN attack_type='war_attack'    THEN fair_fight   END), 2)                                        AS avg_fair_fight,
       COUNT(CASE WHEN attack_type='outside_attack'    THEN 1 END)                                                       AS outside_attacks,
       ROUND(SUM(CASE WHEN attack_type='outside_attack' THEN respect_gain ELSE 0 END), 2)                                AS outside_respect,
       COUNT(CASE WHEN attack_type='assist'            THEN 1 END)                                                       AS assists,
       COUNT(CASE WHEN attack_type='friendly_hit'      THEN 1 END)                                                       AS friendly_hits,
       ROUND(SUM(CASE WHEN attack_type='war_attack' AND chain_count IN (10,25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000) THEN respect_gain ELSE 0 END), 2) AS bonus_respect,
       COUNT(CASE WHEN attack_type IN ('war_attack','outside_attack','assist') THEN 1 END) * 25                          AS energy_used
     FROM war_attacks WHERE ranked_war_id=? AND attacker_id>0 AND attack_type != 'war_defend'
     GROUP BY attacker_id, attacker_name ORDER BY war_hits DESC`
  ).bind(warId).all();

  const { results: defendStats } = await env.DB.prepare(
    `SELECT
       defender_id, defender_name,
       COUNT(*)                                                                                                    AS total_defends,
       COUNT(CASE WHEN result NOT IN ('Escape','Lost','Stalemate') AND is_interrupted=0 THEN 1 END)              AS defends_lost,
       COUNT(CASE WHEN result IN ('Escape','Lost','Stalemate') OR is_interrupted=1 THEN 1 END)                   AS defends_won,
       COUNT(CASE WHEN is_interrupted=1 THEN 1 END)                                                              AS defends_interrupted,
       -- respect_loss in Torn API v2 is 0 for war_defend rows; respect_gain holds the attacker's gain = our member's loss
       ROUND(SUM(CASE WHEN result NOT IN ('Escape','Lost','Stalemate') AND is_interrupted=0 THEN respect_gain ELSE 0 END), 2) AS respect_lost_defending
     FROM war_attacks WHERE ranked_war_id=? AND attack_type='war_defend' AND defender_id>0
     GROUP BY defender_id, defender_name`
  ).bind(warId).all();

  const totals = await env.DB.prepare(
    `SELECT
       -- Successful hits we landed on the enemy (war_attack, did not fail)
       COUNT(CASE WHEN attack_type='war_attack'
                   AND result NOT IN ('Escape','Lost','Stalemate')
                   AND is_interrupted=0 THEN 1 END)                                             AS total_war_hits,

       -- Defends we won: enemy attacked us but failed
       COUNT(CASE WHEN attack_type='war_defend'
                   AND (result IN ('Escape','Lost','Stalemate') OR is_interrupted=1) THEN 1 END) AS total_defends_won,

       -- Enemy attacks that landed on us (they succeeded)
       COUNT(CASE WHEN attack_type='war_defend'
                   AND result NOT IN ('Escape','Lost','Stalemate')
                   AND is_interrupted=0 THEN 1 END)                                             AS total_enemy_hits,

       COUNT(CASE WHEN attack_type='outside_attack' THEN 1 END)                                 AS total_outside_attacks,
       COUNT(CASE WHEN attack_type='assist'         THEN 1 END)                                 AS total_assists,
       COUNT(CASE WHEN attack_type='friendly_hit'   THEN 1 END)                                 AS total_friendly_hits,

       -- Respect we gained from our successful war attacks
       ROUND(SUM(CASE WHEN attack_type='war_attack' THEN respect_gain ELSE 0 END), 2)           AS total_respect_gained,

       -- Respect we lost when the enemy successfully attacked us
       -- (Torn API v2 stores attacker's gain in respect_gain; respect_loss is 0 for these rows)
       ROUND(SUM(CASE WHEN attack_type='war_defend'
                       AND result NOT IN ('Escape','Lost','Stalemate')
                       AND is_interrupted=0 THEN respect_gain ELSE 0 END), 2)                   AS total_respect_lost,

       -- Net respect across war context
       ROUND(
         SUM(CASE WHEN attack_type='war_attack' THEN respect_gain ELSE 0 END) -
         SUM(CASE WHEN attack_type='war_defend'
                   AND result NOT IN ('Escape','Lost','Stalemate')
                   AND is_interrupted=0 THEN respect_gain ELSE 0 END)
       , 2)                                                                                       AS total_net_respect
     FROM war_attacks WHERE ranked_war_id=?`
  ).bind(warId).first();

  const rows = await enrichEnergyAndOD(env, warId, attackerStats || []);

  return { attackerStats: rows, defendStats: defendStats || [], totals: totals || {} };
}

// ── Shared: attach Energy In (Xanax) and OD (overdose delta) to attacker rows ─
// Used by both the live path (buildMemberStats) and the Verify Data path
// (verifyWarData) so both produce the same attackerStats shape.

async function enrichEnergyAndOD(env, warId, rows) {
  if (!rows.length) return rows;

  // ── Energy In: Xanax used during this war (stacking + war period) ──────────
  const { results: xanaxRows } = await env.DB.prepare(
    `SELECT torn_user_id, COUNT(*) AS xanax_count
     FROM war_armory_usage
     WHERE ranked_war_id=? AND item_name='Xanax' AND (action_type IS NULL OR action_type != 'loaned')
     GROUP BY torn_user_id`
  ).bind(warId).all();
  const xanaxMap = {};
  for (const x of xanaxRows || []) xanaxMap[x.torn_user_id] = x.xanax_count;

  // ── OD: overdoses delta from personal stats snapshots over the war's tracked period ──
  const periodRow = await env.DB.prepare(
    `SELECT MIN(started_at) AS min_ts, MAX(started_at) AS max_ts FROM war_attacks WHERE ranked_war_id=?`
  ).bind(warId).first();

  const odMap = {};
  if (periodRow?.min_ts) {
    const fromDate = new Date(periodRow.min_ts * 1000).toISOString().slice(0, 10);
    const toDate   = new Date((periodRow.max_ts || Math.floor(Date.now() / 1000)) * 1000).toISOString().slice(0, 10);
    const [odStartRows, odEndRows] = await Promise.all([
      env.DB.prepare(`
        SELECT p.torn_user_id, CAST(json_extract(p.stats, '$.drugs.overdoses') AS INTEGER) AS val
        FROM personal_stats_snapshots p
        INNER JOIN (
          SELECT torn_user_id, MIN(snapshot_date) AS min_date
          FROM personal_stats_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ? GROUP BY torn_user_id
        ) s ON p.torn_user_id = s.torn_user_id AND p.snapshot_date = s.min_date
      `).bind(fromDate, toDate).all(),
      env.DB.prepare(`
        SELECT p.torn_user_id, CAST(json_extract(p.stats, '$.drugs.overdoses') AS INTEGER) AS val
        FROM personal_stats_snapshots p
        INNER JOIN (
          SELECT torn_user_id, MAX(snapshot_date) AS max_date
          FROM personal_stats_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ? GROUP BY torn_user_id
        ) e ON p.torn_user_id = e.torn_user_id AND p.snapshot_date = e.max_date
      `).bind(fromDate, toDate).all(),
    ]);
    const odStart = {};
    for (const r of odStartRows.results || []) odStart[r.torn_user_id] = r.val ?? 0;
    for (const r of odEndRows.results || []) {
      odMap[r.torn_user_id] = Math.max(0, (r.val ?? 0) - (odStart[r.torn_user_id] ?? 0));
    }
  }

  for (const row of rows) {
    row.xanax_used = xanaxMap[row.attacker_id] || 0;
    row.energy_in  = row.xanax_used * 250;
    row.overdoses  = odMap[row.attacker_id] || 0;
  }

  return rows;
}

// ── Summarise completed war (raw rows kept until payout is saved to rankings) ─

async function summariseAndCleanWar(env, warId, factionId) {
  const stats = await buildMemberStats(env, warId);
  const summaryJson = JSON.stringify(stats);
  await env.DB.prepare(`UPDATE ranked_wars SET summary_json=? WHERE id=?`).bind(summaryJson, warId).run();
  console.log(`summariseAndCleanWar: war ${warId} — summary stored (raw attack rows kept until hits_saved)`);
}

// ── Fetch live scores from rankedwars API and update DB ───────────────────────

async function fetchAndUpdateScores(env, warId, factionId, opponentId, apiKey) {
  let data;
  try {
    data = await fetchWithRetry(
      `${TORN_API_BASE}/faction/rankedwars?limit=20&sort=DESC&comment=OccHub`,
      { Authorization: `ApiKey ${apiKey}` }
    );
  } catch { return null; }

  for (const rw of data.rankedwars || []) {
    const ids = rw.factions.map((f) => f.id);
    if (!ids.includes(factionId) || !ids.includes(opponentId)) continue;

    const ourFac = rw.factions.find((f) => f.id === factionId);
    const oppFac = rw.factions.find((f) => f.id === opponentId);
    if (!ourFac || !oppFac) continue;

    // War ended: end timestamp is set in the API
    if (rw.end > 0) {
      return { ended: true, tornWarId: rw.id, winner: rw.winner, target: rw.target, endedAt: rw.end, ourScore: ourFac.score, oppScore: oppFac.score, ourChain: ourFac.chain, oppChain: oppFac.chain };
    }

    // War still active — update live scores
    await env.DB.prepare(
      `UPDATE ranked_wars SET our_score=?, opponent_score=?, target=?, our_chain=?, opponent_chain=?, torn_war_id=?, last_checked_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(ourFac.score, oppFac.score, rw.target, ourFac.chain, oppFac.chain, rw.id, warId).run();

    console.log(`fetchAndUpdateScores: war ${warId} scores updated — us=${ourFac.score} opp=${oppFac.score} target=${rw.target}`);
    return { ended: false, ourScore: ourFac.score, oppScore: oppFac.score };
  }

  // War not found in rankedwars API response — log for diagnostics
  console.warn(`fetchAndUpdateScores: war ${warId} (faction ${factionId} vs ${opponentId}) not found in rankedwars response (${(data.rankedwars || []).length} wars returned)`);
  return null;
}

// ── Cron: check for new war matches (Tuesday 01:00 UTC) ──────────────────────

export async function checkWarMatches(env, trigger = 'cron') {
  const now          = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 24 * 3600;
  const results      = [];

  for (const factionId of FACTION_IDS) {
    try {
      const apiKeyObj = await getStaffApiKeyForFaction(env, factionId); const apiKey = apiKeyObj?.key ?? null;
      if (!apiKey) { results.push({ factionId, error: 'no API key' }); continue; }

      const data = await fetchWithRetry(
        `${TORN_API_BASE}/faction/news?striptags=false&limit=100&sort=DESC&cat=rankedWar&comment=OccHub`,
        { Authorization: `ApiKey ${apiKey}` }
      );

      for (const item of data.news || []) {
        if (item.timestamp < sevenDaysAgo)     continue;
        if (!item.text.includes('will begin')) continue;

        const scheduledStart = parseScheduledStart(item.text);
        const opponentId     = parseOpponentFactionId(item.text, factionId);
        const opponentName   = parseOpponentName(item.text, factionId);
        if (!scheduledStart || !opponentId) continue;

        const existing = await env.DB.prepare(
          `SELECT id FROM ranked_wars WHERE faction_id=? AND opponent_faction_id=? AND scheduled_start=?`
        ).bind(factionId, opponentId, scheduledStart).first();

        if (!existing) {
          await env.DB.prepare(
            `INSERT INTO ranked_wars (faction_id, opponent_faction_id, opponent_faction_name, status, scheduled_start, last_checked_at)
             VALUES (?, ?, ?, 'matched', ?, CURRENT_TIMESTAMP)`
          ).bind(factionId, opponentId, opponentName, scheduledStart).run();
          results.push({ factionId, opponentId, opponentName, scheduledStart, action: 'created' });
          console.log(`checkWarMatches: faction ${factionId} vs ${opponentId} scheduled ${new Date(scheduledStart * 1000).toISOString()}`);
          await logInfo(env, { category: 'war_cron', event: 'war_matched', message: `Faction ${factionId} matched vs ${opponentName} (${opponentId}), starts ${new Date(scheduledStart * 1000).toISOString()}`, meta: { factionId, opponentId, opponentName, scheduledStart } }).catch(() => {});
        } else {
          results.push({ factionId, opponentId, action: 'exists' });
        }
      }
    } catch (err) {
      console.error(`checkWarMatches: faction ${factionId}:`, err.message);
      results.push({ factionId, error: err.message });
    }
  }
  return results;
}

// ── Cron: track matched/active wars (every 30 minutes) ───────────────────────

export async function trackActiveWars(env, trigger = 'cron') {
  const now          = Math.floor(Date.now() / 1000);
  const fourDaysAgo  = now - 7 * 24 * 3600; // 7 days covers 3-day match window + 3-day war + buffer

  const { results: wars } = await env.DB.prepare(
    `SELECT * FROM ranked_wars WHERE status IN ('matched', 'active')`
  ).all();

  if (!wars?.length) return { checked: 0, errors: [] };

  let checked = 0;
  const errors = [];

  for (const war of wars) {
    const { id: warId, faction_id: factionId, opponent_faction_id: opponentId,
            status, scheduled_start, started_at: warStartedAtInitial,
            last_attack_fetched: lastAttackId, created_at } = war;
    // Mutable — a matched→active transition detected later in this same poll
    // must update this before it's used by fetchAndStoreAttacks, or the fetch
    // runs with no lower time bound and vacuums in pre-war activity.
    let warStartedAt = warStartedAtInitial;
    const createdAtUnix = created_at
      ? Math.floor(new Date(created_at.replace(' ', 'T') + 'Z').getTime() / 1000)
      : null;
    try {
      const apiKeyObj = await getStaffApiKeyForFaction(env, factionId); const apiKey = apiKeyObj?.key ?? null;
      if (!apiKey) {
        console.warn(`trackActiveWars: no API key for faction ${factionId}`);
        await logError(env, { category: 'war_cron', event: 'war_poll_error', message: `No API key for faction ${factionId} (war ${warId})`, meta: { warId, factionId } }).catch(() => {});
        errors.push({ warId, factionId, error: `no API key for faction ${factionId}` });
        continue;
      }

      // ── 1. Fetch live scores from rankedwars API ────────────────────────────
      // For active wars: updates scores OR detects war end
      if (status === 'active') {
        const scoreResult = await fetchAndUpdateScores(env, warId, factionId, opponentId, apiKey);

        if (scoreResult?.ended) {
          const result       = scoreResult.winner === factionId ? 'won' : 'lost';
          const tornEndedAt  = scoreResult.endedAt; // exact end time from Torn API
          // Save final scores before summarising
          await env.DB.prepare(
            `UPDATE ranked_wars SET our_score=?, opponent_score=?, target=?, our_chain=?, opponent_chain=?, torn_war_id=?, status='completed', ended_at=?, result=?, last_checked_at=CURRENT_TIMESTAMP WHERE id=?`
          ).bind(scoreResult.ourScore, scoreResult.oppScore, scoreResult.target, scoreResult.ourChain, scoreResult.oppChain, scoreResult.tornWarId, tornEndedAt, result, warId).run();

          // Final attack fetch capped at exact Torn war end time
          await fetchAndStoreAttacks(env, warId, factionId, opponentId, warStartedAt || 0, lastAttackId || 0, apiKey, tornEndedAt);

          await summariseAndCleanWar(env, warId, factionId);
          console.log(`trackActiveWars: war ${warId} ended (scores API) — ${result}`);
          await logInfo(env, { category: 'war_cron', event: 'war_ended', message: `War ${warId} ended (scores API): ${result}`, meta: { warId, factionId, result } }).catch(() => {});
          checked++;
          continue;
        }

        if (scoreResult === null) {
          await logWarn(env, { category: 'war_cron', event: 'war_score_miss', message: `War ${warId}: not found in rankedwars API — scores not updated`, meta: { warId, factionId, opponentId } }).catch(() => {});
        }
      }

      // ── 2. Check rankedWar news for state changes ───────────────────────────
      let newsItems = [];
      try {
        const newsData = await fetchWithRetry(
          `${TORN_API_BASE}/faction/news?striptags=false&limit=100&sort=DESC&cat=rankedWar&comment=OccHub`,
          { Authorization: `ApiKey ${apiKey}` }
        );
        newsItems = newsData.news || [];
      } catch (e) {
        console.warn(`trackActiveWars: war ${warId} news fetch failed: ${e.message}`);
      }

      if (newsItems.length) {
        const items = newsItems;

        for (const item of items) {
          const involvesBoth = item.text.includes(`ID=${factionId}`) && item.text.includes(`ID=${opponentId}`);
          if (!involvesBoth) continue;

          // War ended — "defeated ... in a ranked war [view]"
          if (item.text.includes('defeated') && item.text.includes('rankID=')) {
            const tornWarId    = parseWarId(item.text);
            const weWon        = item.text.match(new RegExp(`ID=${factionId}[^>]*>[^<]+<\\/a> defeated`));
            const result       = weWon ? 'won' : 'lost';
            const warEndedAt   = item.timestamp;
            let rankChange     = null;
            let bonusRespect   = null;
            let rewardsJson = null;
            for (const n of items) {
              if ((n.text.includes('ranked down') || n.text.includes('ranked up')) && n.text.includes('bonus respect')) {
                rankChange   = parseRankChange(n.text);
                bonusRespect = parseBonusRespect(n.text);
                rewardsJson  = parseRewards(n.text);
                break;
              }
            }
            await env.DB.prepare(
              `UPDATE ranked_wars SET status='completed', ended_at=?, torn_war_id=?, result=?, rank_change=?, bonus_respect=?, rewards_json=?, last_checked_at=CURRENT_TIMESTAMP WHERE id=? AND status!='completed'`
            ).bind(warEndedAt, tornWarId, result, rankChange, bonusRespect, rewardsJson, warId).run();

            // Final attack fetch capped at war end — captures any attacks that
            // occurred since the last cron run up to the exact war end timestamp.
            await fetchAndStoreAttacks(env, warId, factionId, opponentId, warStartedAt || 0, lastAttackId || 0, apiKey, warEndedAt);

            await summariseAndCleanWar(env, warId, factionId);
            console.log(`trackActiveWars: war ${warId} ended (news) — ${result}`);
            await logInfo(env, { category: 'war_cron', event: 'war_ended', message: `War ${warId} ended (news): ${result}`, meta: { warId, factionId, result } }).catch(() => {});
            checked++;
            continue;
          }

          // War started — "has begun"
          if (status === 'matched' && item.text.includes('has begun')) {
            await env.DB.prepare(
              `UPDATE ranked_wars SET status='active', started_at=?, last_checked_at=CURRENT_TIMESTAMP WHERE id=? AND status='matched'`
            ).bind(item.timestamp, warId).run();
            warStartedAt = item.timestamp; // keep local value in sync — used by fetchAndStoreAttacks below this same poll
            console.log(`trackActiveWars: war ${warId} now ACTIVE`);
            await logInfo(env, { category: 'war_cron', event: 'war_started', message: `War ${warId} (faction ${factionId} vs ${opponentId}) now ACTIVE`, meta: { warId, factionId, opponentId } }).catch(() => {});
            break;
          }
        }
      }

      // Promote to active by scheduled_start if news missed it
      if (status === 'matched' && scheduled_start && scheduled_start <= now) {
        await env.DB.prepare(
          `UPDATE ranked_wars SET status='active', started_at=?, last_checked_at=CURRENT_TIMESTAMP WHERE id=? AND status='matched'`
        ).bind(scheduled_start, warId).run();
        warStartedAt = scheduled_start; // keep local value in sync — used by fetchAndStoreAttacks below this same poll
      }

      // ── 3. Armory usage ─────────────────────────────────────────────────────
      const currentWar = await env.DB.prepare(`SELECT status, ended_at FROM ranked_wars WHERE id=?`).bind(warId).first();
      const armoryEndCap = currentWar?.ended_at ?? now;
      // from = max(matchmaking detection time, scheduled_start - 3 days)
      // scheduled_start - 3 days covers the full pre-war announcement window.
      // createdAtUnix (when we inserted the matched row) is the floor — no items before matchmaking.
      const armoryEarliest = scheduled_start ? scheduled_start - (3 * 86400) : fourDaysAgo;
      const armoryFrom = createdAtUnix ? Math.max(armoryEarliest, createdAtUnix) : armoryEarliest;
      let newArmory = 0;
      let armoryMeta = null;
      const armoryKeyObj = await getStaffApiKeyForFaction(env, factionId);
      const armoryKey = armoryKeyObj?.key ?? apiKey;
      const armoryKeyUser = armoryKeyObj?.username ?? apiKeyObj?.username ?? 'unknown';
      const armoryKeyType = armoryKeyObj ? 'leadership' : 'fallback';
      try {
        const armoryData = await fetchWithRetry(
          `${TORN_API_BASE}/faction/news?striptags=false&limit=100&sort=DESC&from=${armoryFrom}&cat=armoryAction&comment=OccHub`,
          { Authorization: `ApiKey ${armoryKey}` }
        );
        const armoryItems = armoryData.news || [];
        let dupArmory = 0;
        for (const item of armoryItems) {
          if (item.timestamp > armoryEndCap) continue;
          const parsed = parseArmoryEntry(item.text);
          if (!parsed) continue;
          const { meta } = await env.DB.prepare(
            `INSERT OR IGNORE INTO war_armory_usage (ranked_war_id, faction_id, torn_news_id, torn_user_id, username, item_name, used_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(warId, factionId, item.id, parsed.torn_user_id, parsed.username, parsed.item_name, item.timestamp).run();
          if (meta?.changes > 0) newArmory++; else dupArmory++;
        }
        armoryMeta = { fetched: armoryItems.length, newArmory, dupArmory, keyUser: armoryKeyUser, keyType: armoryKeyType };
      } catch (e) {
        console.error(`trackActiveWars: war ${warId} armory fetch failed (key: ${armoryKeyUser} [${armoryKeyType}]): ${e.message}`);
        await logError(env, { category: 'war_cron', event: 'war_poll_error', message: `War ${warId} armory fetch failed (key: ${armoryKeyUser} [${armoryKeyType}]): ${e.message}`, meta: { warId, factionId, keyUser: armoryKeyUser, keyType: armoryKeyType } }).catch(() => {});
      }

      // ── 4. Fetch attacks (active wars only, isolated to this faction) ───────
      let newAttacks = 0;
      if (currentWar?.status === 'active') {
        newAttacks = await fetchAndStoreAttacks(env, warId, factionId, opponentId, warStartedAt || 0, lastAttackId || 0, apiKey, null);
      }

      await env.DB.prepare(`UPDATE ranked_wars SET last_checked_at=CURRENT_TIMESTAMP WHERE id=?`).bind(warId).run();

      await logInfo(env, {
        category: 'war_cron',
        event: 'war_poll',
        message: `[${trigger}] War ${warId} (${factionId} vs ${opponentId}, ${currentWar?.status ?? status}): +${newAttacks} attacks, +${newArmory} new armory (${armoryMeta?.dupArmory ?? 0} already logged, ${armoryMeta?.fetched ?? 0} fetched) via ${armoryKeyUser} [${armoryKeyType}]`,
        meta: { warId, factionId, opponentId, status: currentWar?.status ?? status, trigger, newAttacks, newArmory, dupArmory: armoryMeta?.dupArmory ?? 0, armoryFetched: armoryMeta?.fetched ?? 0, keyUser: armoryKeyUser, keyType: armoryKeyType },
      }).catch(() => {});

      checked++;
    } catch (err) {
      console.error(`trackActiveWars: war ${warId}:`, err.message);
      errors.push({ warId, factionId, error: err.message });
      await logError(env, {
        category: 'war_cron',
        event: 'war_poll_error',
        message: `War ${warId} (faction ${factionId}): ${err.message}`,
      }).catch(() => {});
    }
  }
  return { checked, errors };
}

async function fetchAndStoreAttacks(env, warId, factionId, opponentFactionId, warStartedAt, lastAttackId, apiKey, warEndedAt = null) {
  // lastAttackId: highest torn attack ID already stored — stop when we see IDs <= this
  // warEndedAt: when set, attacks after this timestamp are ignored (final-fetch on war end)
  // Pagination: follow _metadata.links.prev "to" timestamp until we've gone past war start
  // INSERT OR IGNORE handles any page-boundary overlaps automatically

  let nextUrl     = `${TORN_API_BASE}/faction/attacks?limit=100&sort=DESC&comment=OccHub`;
  let maxId       = lastAttackId;
  let totalNew    = 0;
  let reachedBoundary = false; // true once we've connected back to lastAttackId or the war start
  const MAX_PAGES = 30; // 3,000 raw attacks/poll headroom; watermark logic below is the real gap guard

  for (let page = 0; page < MAX_PAGES; page++) {
    let data;
    try {
      data = await fetchWithRetry(nextUrl, { Authorization: `ApiKey ${apiKey}` });
    } catch (e) { console.error(`fetchAndStoreAttacks: ${e.message}`); break; }

    const attacks = data.attacks || [];
    if (!attacks.length) { reachedBoundary = true; break; } // no data at all == nothing further back

    let allOlderThanWar = true;  // assume true; set false if any attack is within war window
    let hitWatermark    = false;

    for (const attack of attacks) {
      // Stop indicator: we've reached already-fetched territory
      if (attack.id <= lastAttackId) { hitWatermark = true; break; }

      // Track max ID seen this run
      if (attack.id > maxId) maxId = attack.id;

      // Skip attacks that occurred after the war ended
      if (warEndedAt && attack.started > warEndedAt) continue;

      // Skip attacks from before the war started (boundary pages mix pre/post-war attacks)
      if (warStartedAt > 0 && attack.started < warStartedAt) continue;

      // If this attack started during the war window, mark page as relevant
      if (attack.started >= warStartedAt) allOlderThanWar = false;

      const attackType = categoriseAttack(attack, factionId, opponentFactionId);
      if (!attackType) continue;

      const { meta } = await env.DB.prepare(
        `INSERT OR IGNORE INTO war_attacks
           (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name,
            defender_id, defender_name, attack_type, result, respect_gain, respect_loss,
            is_interrupted, fair_fight, started_at, chain_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        warId, factionId, attack.id,
        attack.attacker?.id   ?? 0, attack.attacker?.name ?? null,
        attack.defender?.id   ?? 0, attack.defender?.name ?? null,
        attackType, attack.result ?? null,
        attack.respect_gain   ?? 0, attack.respect_loss ?? 0,
        attack.is_interrupted ? 1 : 0, attack.modifiers?.fair_fight ?? 1,
        attack.started, attack.chain ?? 0
      ).run();
      if (meta?.changes > 0) totalNew++;
    }

    // Stop if we've hit the watermark or the page only contains pre-war attacks or no more pages
    if (hitWatermark || allOlderThanWar) { reachedBoundary = true; break; }

    // Follow the prev link for the next (older) page
    const prevUrl = data._metadata?.links?.prev;
    if (!prevUrl) { reachedBoundary = true; break; } // no more pages == naturally reached the end

    // Extract `to` timestamp from the prev URL for the next fetch
    nextUrl = `${TORN_API_BASE}/faction/attacks?limit=100&sort=DESC&comment=OccHub` +
              `&to=${new URL(prevUrl).searchParams.get('to')}`;
  }

  // Only advance the watermark once we've confirmed a gapless connection back to
  // lastAttackId (or the war start / end of history). If MAX_PAGES was exhausted
  // mid-run, advancing anyway would permanently skip the unfetched middle section —
  // instead leave the watermark where it was so the next poll retries and expands
  // further back until it reconnects (INSERT OR IGNORE makes re-fetching safe).
  if (reachedBoundary && maxId > lastAttackId) {
    await env.DB.prepare(
      `UPDATE ranked_wars SET last_attack_fetched=?, last_checked_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(maxId, warId).run();
  } else if (!reachedBoundary) {
    console.warn(`fetchAndStoreAttacks: war ${warId} — hit MAX_PAGES (${MAX_PAGES}) before reconnecting to watermark; will retry next poll`);
    await logWarn(env, {
      category: 'war_cron', event: 'war_attack_fetch_truncated',
      message: `War ${warId}: attack fetch truncated at ${MAX_PAGES} pages — watermark not advanced, will retry`,
      meta: { warId, factionId, lastAttackId, maxIdSeen: maxId },
    }).catch(() => {});
  }
  if (totalNew > 0) console.log(`fetchAndStoreAttacks: war ${warId} — ${totalNew} new attacks (maxId=${maxId}, reachedBoundary=${reachedBoundary})`);
  return totalNew;
}

// ── GET /api/leadership/wars?faction_id=X ────────────────────────────────────

export async function getWars(request, env) {
  try {
    const url       = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);
    if (!factionId || !FACTION_IDS.includes(factionId)) {
      return errorResponse('Invalid or missing faction_id', 400);
    }
    const { results } = await env.DB.prepare(
      `SELECT * FROM ranked_wars WHERE faction_id=? ORDER BY COALESCE(scheduled_start, 0) DESC LIMIT 5`
    ).bind(factionId).all();
    return jsonResponse({ wars: results || [] });
  } catch (err) {
    console.error('getWars error:', err);
    return errorResponse('Failed to fetch wars', 500);
  }
}

// ── GET /api/leadership/war/:id ───────────────────────────────────────────────
// Falls back to summary_json when raw attack rows have been purged.

export async function getWarDetails(request, env) {
  try {
    const match = request.url.match(/\/war\/(\d+)(?:$|\?|\/)/);
    const warId = match ? parseInt(match[1], 10) : null;
    if (!warId) return errorResponse('Invalid war ID', 400);

    const war = await env.DB.prepare(`SELECT * FROM ranked_wars WHERE id=?`).bind(warId).first();
    if (!war) return errorResponse('War not found', 404);

    // Once leadership has applied Verify Data, summary_json is authoritative —
    // skip live recomputation from war_attacks even if raw rows still exist
    // (they always do pre-payout, which is exactly when Verify gets used).
    if (!war.verified_override) {
      // Check whether raw attack rows exist
      const attackCount = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM war_attacks WHERE ranked_war_id=?`
      ).bind(warId).first();

      if ((attackCount?.n ?? 0) > 0) {
        // Live data from war_attacks
        const { attackerStats, defendStats, totals } = await buildMemberStats(env, warId);
        return jsonResponse({ war, summary: totals, attackerStats, defendStats, fromSummary: false });
      }
    }

    // Archived / verified data from summary_json
    if (war.summary_json) {
      const archived = JSON.parse(war.summary_json);
      return jsonResponse({ war, summary: archived.totals || {}, attackerStats: archived.attackerStats || [], defendStats: archived.defendStats || [], fromSummary: true });
    }

    return jsonResponse({ war, summary: {}, attackerStats: [], defendStats: [], fromSummary: false });
  } catch (err) {
    console.error('getWarDetails error:', err);
    return errorResponse('Failed to fetch war details', 500);
  }
}

// ── GET /api/leadership/war/:id/armory ───────────────────────────────────────

export async function getWarArmory(request, env) {
  try {
    const match = request.url.match(/\/war\/(\d+)\/armory/);
    const warId = match ? parseInt(match[1], 10) : null;
    if (!warId) return errorResponse('Invalid war ID', 400);
    const { results } = await env.DB.prepare(
      `SELECT
         a.torn_user_id, a.username, a.item_name,
         COUNT(*) AS count,
         COUNT(CASE WHEN w.started_at IS NULL OR a.used_at < w.started_at THEN 1 END)      AS stacking_count,
         COUNT(CASE WHEN w.started_at IS NOT NULL AND a.used_at >= w.started_at THEN 1 END) AS war_count,
         MIN(a.used_at) AS first_used, MAX(a.used_at) AS last_used
       FROM war_armory_usage a
       JOIN ranked_wars w ON w.id = a.ranked_war_id
       WHERE a.ranked_war_id=? AND (a.action_type IS NULL OR a.action_type != 'loaned')
       GROUP BY a.torn_user_id, a.username, a.item_name
       ORDER BY a.torn_user_id, MAX(a.used_at) DESC`
    ).bind(warId).all();
    return jsonResponse({ armory: results || [] });
  } catch (err) {
    console.error('getWarArmory error:', err);
    return errorResponse('Failed to fetch armory data', 500);
  }
}

// ── GET /api/wars/summary  (public — for home page) ──────────────────────────

export async function getWarsSummary(request, env) {
  try {
    const summary = {};
    for (const factionId of FACTION_IDS) {
      const { results } = await env.DB.prepare(
        `SELECT id, faction_id, opponent_faction_id, opponent_faction_name,
                status, scheduled_start, started_at, ended_at, result, rank_change, bonus_respect, rewards_json,
                our_score, opponent_score, target, our_chain, opponent_chain, last_checked_at
         FROM ranked_wars WHERE faction_id=? ORDER BY COALESCE(scheduled_start, 0) DESC LIMIT 5`
      ).bind(factionId).all();
      summary[factionId] = results || [];
    }
    return jsonResponse({ summary });
  } catch (err) {
    console.error('getWarsSummary error:', err);
    return errorResponse('Failed to fetch wars summary', 500);
  }
}

// ── GET /api/leadership/war/:id/payout ───────────────────────────────────────

export async function getWarPayout(request, env) {
  try {
    const id = parseInt(request.url.match(/\/war\/(\d+)\/payout/)?.[1], 10);
    if (!id) return errorResponse('Invalid war id', 400);
    const war = await env.DB.prepare(`SELECT payout_json, is_paid FROM ranked_wars WHERE id=?`).bind(id).first();
    if (!war) return errorResponse('War not found', 404);
    return jsonResponse({ payout: war.payout_json ? JSON.parse(war.payout_json) : null, is_paid: !!war.is_paid });
  } catch (err) {
    console.error('getWarPayout error:', err);
    return errorResponse('Failed to fetch payout', 500);
  }
}

// ── POST /api/leadership/war/:id/payout ──────────────────────────────────────

export async function saveWarPayout(request, env) {
  try {
    const id = parseInt(request.url.match(/\/war\/(\d+)\/payout/)?.[1], 10);
    if (!id) return errorResponse('Invalid war id', 400);
    const body = await request.json();
    const { payout, is_paid } = body;
    await env.DB.prepare(
      `UPDATE ranked_wars SET payout_json=?, is_paid=?, last_checked_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(JSON.stringify(payout), is_paid ? 1 : 0, id).run();
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('saveWarPayout error:', err);
    return errorResponse('Failed to save payout', 500);
  }
}

// ── POST /api/leadership/war/:id/save-hits ───────────────────────────────────
// Writes permanent war_hits records for ranking. Requires is_paid=1 on the war.
// Protected by hits_saved flag to prevent double-saves.

export async function saveWarHits(request, env, user) {
  try {
    const id = parseInt(request.url.match(/\/war\/(\d+)\/save-hits/)?.[1], 10);
    if (!id) return errorResponse('Invalid war id', 400);

    const war = await env.DB.prepare(`SELECT faction_id, is_paid, hits_saved FROM ranked_wars WHERE id=?`).bind(id).first();
    if (!war) return errorResponse('War not found', 404);
    if (!war.is_paid) return errorResponse('War must be fully paid before saving to rankings', 400);
    if (war.hits_saved) return errorResponse('Hits already saved to rankings for this war', 409);

    const body = await request.json();
    const { members } = body;
    if (!Array.isArray(members) || !members.length) return errorResponse('members array required', 400);

    let saved = 0;
    for (const m of members) {
      if (!m.torn_user_id) continue;
      await env.DB.prepare(
        `INSERT INTO war_hits
           (ranked_war_id, faction_id, torn_user_id, username, war_hits, outside_hits, assists, respect_gained, payout_amount, units, saved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ranked_war_id, torn_user_id) DO UPDATE SET
           username=excluded.username, war_hits=excluded.war_hits,
           outside_hits=excluded.outside_hits, assists=excluded.assists,
           respect_gained=excluded.respect_gained, payout_amount=excluded.payout_amount,
           units=excluded.units, saved_by=excluded.saved_by, saved_at=CURRENT_TIMESTAMP`
      ).bind(
        id, war.faction_id, m.torn_user_id, m.username ?? null,
        m.war_hits ?? 0, m.outside_hits ?? 0, m.assists ?? 0,
        m.respect_gained ?? 0, m.payout_amount ?? 0, m.units ?? 0,
        user.userId
      ).run();

      // Ensure member is in faction_members (add if unknown)
      if (m.username) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO faction_members
             (torn_user_id, username, faction_id, is_active, joined_at, last_updated_at)
           VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        ).bind(m.torn_user_id, m.username, war.faction_id).run();
      }

      saved++;
    }

    await env.DB.prepare(`UPDATE ranked_wars SET hits_saved=1 WHERE id=?`).bind(id).run();
    // Raw attack rows are no longer needed once payout is finalised and hits are in rankings
    await env.DB.prepare(`DELETE FROM war_attacks WHERE ranked_war_id=?`).bind(id).run();
    return jsonResponse({ saved, message: `${saved} member war records saved to rankings` });
  } catch (err) {
    console.error('saveWarHits error:', err);
    return errorResponse('Failed to save war hits', 500);
  }
}

// ── POST /api/leadership/wars/manual ─────────────────────────────────────────
// Creates a manual war entry (for historic data) + saves war_hits.
// Accepts: { faction_id, started_at, opponent_name, members: [{torn_user_id, username, war_hits}] }

export async function createManualWar(request, env, user) {
  try {
    const body = await request.json();
    const { faction_id, started_at, opponent_name, members } = body;

    if (!faction_id || !FACTION_IDS.includes(faction_id)) return errorResponse('Invalid faction_id', 400);
    if (!started_at) return errorResponse('started_at (unix timestamp) required', 400);
    if (!Array.isArray(members) || !members.length) return errorResponse('members array required', 400);

    // Create the ranked_wars entry
    const result = await env.DB.prepare(
      `INSERT INTO ranked_wars
         (faction_id, opponent_faction_id, opponent_faction_name, status, started_at,
          is_manual, hits_saved, is_paid, last_checked_at)
       VALUES (?, 0, ?, 'manual', ?, 1, 1, 1, CURRENT_TIMESTAMP)`
    ).bind(faction_id, opponent_name || 'Manual Entry', started_at).run();

    const warId = result.meta?.last_row_id;
    if (!warId) return errorResponse('Failed to create war entry', 500);

    // Build all insert statements first, then execute in batches of 100.
    // This replaces N sequential awaits with a handful of batch calls,
    // reducing 800 round trips to ~8 and keeping well within Worker CPU limits.
    const warHitsStmts    = [];
    const factionMemberStmts = [];
    let saved = 0;

    for (const m of members) {
      if (!((m.war_hits ?? 0) > 0)) continue;

      let tornId   = m.torn_user_id ? parseInt(m.torn_user_id, 10) : null;
      let username = m.username ?? null;

      // Username-only lookup still requires a DB read — keep sequential but these are rare
      if (!tornId && username) {
        const found = await env.DB.prepare(
          `SELECT torn_user_id FROM faction_members WHERE username=? AND faction_id=? LIMIT 1`
        ).bind(username, faction_id).first();
        if (found) tornId = found.torn_user_id;
      }
      if (!tornId) continue;

      warHitsStmts.push(
        env.DB.prepare(
          `INSERT INTO war_hits
             (ranked_war_id, faction_id, torn_user_id, username, war_hits, outside_hits, assists, respect_gained, payout_amount, units, saved_by)
           VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)
           ON CONFLICT(ranked_war_id, torn_user_id) DO UPDATE SET
             username=excluded.username, war_hits=excluded.war_hits, units=excluded.units,
             saved_by=excluded.saved_by, saved_at=CURRENT_TIMESTAMP`
        ).bind(warId, faction_id, tornId, username, m.war_hits, m.war_hits, user.userId)
      );

      if (username) {
        factionMemberStmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO faction_members
               (torn_user_id, username, faction_id, is_active, joined_at, last_updated_at)
             VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
          ).bind(tornId, username, faction_id)
        );
      }

      saved++;
    }

    // Execute war_hits inserts in batches of 100
    for (let i = 0; i < warHitsStmts.length; i += 100) {
      await env.DB.batch(warHitsStmts.slice(i, i + 100));
    }

    // Execute faction_members inserts in batches of 100
    for (let i = 0; i < factionMemberStmts.length; i += 100) {
      await env.DB.batch(factionMemberStmts.slice(i, i + 100));
    }

    return jsonResponse({ warId, saved, message: `Manual war entry created with ${saved} member records` });
  } catch (err) {
    console.error('createManualWar error:', err);
    return errorResponse('Failed to create manual war entry', 500);
  }
}

// ── GET /api/leadership/war/:id/attacks ──────────────────────────────────────
// Returns raw war_attacks rows for debugging column counts.

export async function getWarAttackLog(request, env) {
  try {
    const match = request.url.match(/\/war\/(\d+)\/attacks/);
    const warId = match ? parseInt(match[1], 10) : null;
    if (!warId) return errorResponse('Invalid war ID', 400);

    const war = await env.DB.prepare(
      `SELECT started_at, ended_at, scheduled_start, opponent_faction_name FROM ranked_wars WHERE id=?`
    ).bind(warId).first();
    if (!war) return errorResponse('War not found', 404);

    const { results: attacks } = await env.DB.prepare(
      `SELECT torn_attack_id, attacker_id, attacker_name, defender_id, defender_name,
              attack_type, result, is_interrupted, respect_gain, respect_loss,
              fair_fight, chain_count, started_at
       FROM war_attacks WHERE ranked_war_id=?
       ORDER BY started_at ASC`
    ).bind(warId).all();

    return jsonResponse({ war, attacks: attacks || [] });
  } catch (err) {
    console.error('getWarAttackLog error:', err);
    return errorResponse('Failed to fetch attack log', 500);
  }
}

// ── Verify: fetch all attacks in a timestamp range from Torn API ──────────────

async function fetchAttacksInRange(apiKey, factionId, opponentFactionId, startAt, endAt) {
  const seen       = new Set();
  const collected  = [];
  let   fromTs     = startAt;
  const MAX_PAGES  = 60;

  for (let page = 0; page < MAX_PAGES; page++) {
    let data;
    try {
      data = await fetchWithRetry(
        `${TORN_API_BASE}/faction/attacks?limit=100&sort=ASC&from=${fromTs}&comment=OccHub`,
        { Authorization: `ApiKey ${apiKey}` }
      );
    } catch (e) {
      console.error(`fetchAttacksInRange p${page}: ${e.message}`);
      break;
    }

    const attacks = data.attacks || [];
    if (!attacks.length) break;

    let advanced = false;

    for (const attack of attacks) {
      if (seen.has(attack.id)) continue;
      seen.add(attack.id);

      // sort=ASC — first attack past endAt means we are done
      if (attack.started > endAt) return { attacks: collected, truncated: false };

      if (attack.started > fromTs) { fromTs = attack.started; advanced = true; }

      const attack_type = categoriseAttack(attack, factionId, opponentFactionId);
      if (attack_type) collected.push({ ...attack, attack_type });
    }

    if (!advanced) fromTs += 1; // bump past timestamp ties to avoid infinite loop
  }

  return { attacks: collected, truncated: collected.length > 0 };
}

// ── Verify: aggregate raw attack objects into member stats (mirrors buildMemberStats) ─

const CHAIN_BONUS_COUNTS = new Set([10,25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000]);

function aggregateVerifiedAttacks(attacks) {
  const aMap = {}; // attacker stats keyed by id
  const dMap = {}; // defender stats keyed by id

  const getA = (id, name) => {
    if (!aMap[id]) aMap[id] = {
      attacker_id: id, attacker_name: name,
      war_hits: 0, war_losses: 0, war_interrupted: 0,
      war_respect_gained: 0, avg_fair_fight: 0,
      outside_attacks: 0, assists: 0, friendly_hits: 0,
      bonus_respect: 0, energy_used: 0,
      _ff_sum: 0, _ff_count: 0,
    };
    return aMap[id];
  };

  const getD = (id, name) => {
    if (!dMap[id]) dMap[id] = {
      defender_id: id, defender_name: name,
      defends_won: 0, defends_lost: 0, defends_interrupted: 0,
      respect_lost_defending: 0,
    };
    return dMap[id];
  };

  for (const a of attacks) {
    const { attack_type, result, is_interrupted, respect_gain = 0, modifiers, chain = 0 } = a;
    const success = !['Escape','Lost','Stalemate'].includes(result) && !is_interrupted;

    if (attack_type === 'war_attack') {
      const m = getA(a.attacker?.id ?? 0, a.attacker?.name ?? null);
      if (success) m.war_hits++; else m.war_losses++;
      if (is_interrupted) m.war_interrupted++;
      m.war_respect_gained += respect_gain;
      if (CHAIN_BONUS_COUNTS.has(chain)) m.bonus_respect += respect_gain;
      m._ff_sum += modifiers?.fair_fight ?? 1; m._ff_count++;
      m.energy_used += 25;
    } else if (attack_type === 'outside_attack') {
      const m = getA(a.attacker?.id ?? 0, a.attacker?.name ?? null);
      m.outside_attacks++;
      m.energy_used += 25;
    } else if (attack_type === 'assist') {
      const m = getA(a.attacker?.id ?? 0, a.attacker?.name ?? null);
      m.assists++;
      m.energy_used += 25;
    } else if (attack_type === 'friendly_hit') {
      const m = getA(a.attacker?.id ?? 0, a.attacker?.name ?? null);
      m.friendly_hits++;
      m.energy_used += 25;
    } else if (attack_type === 'war_defend') {
      const d = getD(a.defender?.id ?? 0, a.defender?.name ?? null);
      if (success) { d.defends_lost++; d.respect_lost_defending += respect_gain; }
      else d.defends_won++;
      if (is_interrupted) d.defends_interrupted++;
    }
  }

  const attackerStats = Object.values(aMap).map(m => ({
    ...m,
    avg_fair_fight:      m._ff_count > 0 ? Math.round(m._ff_sum / m._ff_count * 100) / 100 : 0,
    war_respect_gained:  Math.round(m.war_respect_gained * 100) / 100,
    bonus_respect:       Math.round(m.bonus_respect * 100) / 100,
    _ff_sum: undefined, _ff_count: undefined,
  })).sort((a, b) => b.war_hits - a.war_hits);

  const defendStats = Object.values(dMap).map(d => ({
    ...d, respect_lost_defending: Math.round(d.respect_lost_defending * 100) / 100,
  }));

  let total_war_hits = 0, total_defends_won = 0, total_enemy_hits = 0;
  let total_outside_attacks = 0, total_assists = 0, total_friendly_hits = 0;
  let total_respect_gained = 0, total_respect_lost = 0;

  for (const a of attacks) {
    const { attack_type, result, is_interrupted, respect_gain = 0 } = a;
    const success = !['Escape','Lost','Stalemate'].includes(result) && !is_interrupted;
    if (attack_type === 'war_attack') {
      if (success) total_war_hits++;
      total_respect_gained += respect_gain;
    } else if (attack_type === 'war_defend') {
      if (success) { total_enemy_hits++; total_respect_lost += respect_gain; }
      else total_defends_won++;
    } else if (attack_type === 'outside_attack') total_outside_attacks++;
    else if (attack_type === 'assist')           total_assists++;
    else if (attack_type === 'friendly_hit')     total_friendly_hits++;
  }

  return {
    attackerStats,
    defendStats,
    totals: {
      total_war_hits,
      total_defends_won,
      total_enemy_hits,
      total_outside_attacks,
      total_assists,
      total_friendly_hits,
      total_respect_gained: Math.round(total_respect_gained * 100) / 100,
      total_respect_lost:   Math.round(total_respect_lost   * 100) / 100,
      total_net_respect:    Math.round((total_respect_gained - total_respect_lost) * 100) / 100,
    },
  };
}

// ── POST /api/leadership/war/:id/verify ──────────────────────────────────────
// Fetches all attacks in range from Torn API and returns new stats without writing to DB.

export async function verifyWarData(request, env) {
  try {
    const match = request.url.match(/\/war\/(\d+)\/verify$/);
    const warId = match ? parseInt(match[1], 10) : null;
    if (!warId) return errorResponse('Invalid war ID', 400);

    const war = await env.DB.prepare(
      `SELECT faction_id, opponent_faction_id, started_at, ended_at FROM ranked_wars WHERE id=?`
    ).bind(warId).first();
    if (!war) return errorResponse('War not found', 404);

    const body      = await request.json().catch(() => ({}));
    const startAt   = body.start_at ?? war.started_at;
    const endAt     = body.end_at   ?? war.ended_at;
    if (!startAt || !endAt) return errorResponse('start_at and end_at are required', 400);

    const apiKeyObj = await getStaffApiKeyForFaction(env, war.faction_id);
    if (!apiKeyObj?.key) return errorResponse('No leadership API key available for this faction', 503);

    const { attacks, truncated } = await fetchAttacksInRange(
      apiKeyObj.key, war.faction_id, war.opponent_faction_id, startAt, endAt
    );

    const stats = aggregateVerifiedAttacks(attacks);
    stats.attackerStats = await enrichEnergyAndOD(env, warId, stats.attackerStats);

    // Trimmed raw rows — sent back so "Apply" can replace war_attacks itself,
    // keeping the Attack Log debug tab in sync with the verified data too.
    const rawAttacks = attacks.map(a => ({
      torn_attack_id: a.id,
      attacker_id:    a.attacker?.id   ?? 0,
      attacker_name:  a.attacker?.name ?? null,
      defender_id:    a.defender?.id   ?? 0,
      defender_name:  a.defender?.name ?? null,
      attack_type:    a.attack_type,
      result:         a.result ?? null,
      respect_gain:   a.respect_gain ?? 0,
      respect_loss:   a.respect_loss ?? 0,
      is_interrupted: a.is_interrupted ? 1 : 0,
      fair_fight:     a.modifiers?.fair_fight ?? 1,
      started_at:     a.started,
      chain_count:    a.chain ?? 0,
    }));

    return jsonResponse({
      ...stats,
      attacks: rawAttacks,
      attack_count: attacks.length,
      truncated,
      key_user: apiKeyObj.username,
      range: { start_at: startAt, end_at: endAt },
    });
  } catch (err) {
    console.error('verifyWarData error:', err);
    return errorResponse('Verification failed: ' + err.message, 500);
  }
}

// ── POST /api/leadership/war/:id/verify/apply ─────────────────────────────────
// Overwrites summary_json with the verified stats, and — unless the war is
// already paid/locked — replaces the raw war_attacks rows too, so the Attack
// Log debug tab shows the same verified data instead of the original (possibly
// bad) live-tracked log.

export async function applyVerifiedWarData(request, env) {
  try {
    const match = request.url.match(/\/war\/(\d+)\/verify\/apply$/);
    const warId = match ? parseInt(match[1], 10) : null;
    if (!warId) return errorResponse('Invalid war ID', 400);

    const { attackerStats, defendStats, totals, attacks } = await request.json();

    const war = await env.DB.prepare(`SELECT faction_id, hits_saved FROM ranked_wars WHERE id=?`).bind(warId).first();
    if (!war) return errorResponse('War not found', 404);

    // Once payout is finalised and raw rows purged, don't resurrect them —
    // the summary_json override is the only thing that should change.
    if (!war.hits_saved && Array.isArray(attacks) && attacks.length > 0) {
      await env.DB.prepare(`DELETE FROM war_attacks WHERE ranked_war_id=?`).bind(warId).run();

      const insertStmt = env.DB.prepare(
        `INSERT OR IGNORE INTO war_attacks
           (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name,
            defender_id, defender_name, attack_type, result, respect_gain, respect_loss,
            is_interrupted, fair_fight, started_at, chain_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const bound = attacks.map(a => insertStmt.bind(
        warId, war.faction_id, a.torn_attack_id, a.attacker_id, a.attacker_name,
        a.defender_id, a.defender_name, a.attack_type, a.result,
        a.respect_gain ?? 0, a.respect_loss ?? 0, a.is_interrupted ?? 0,
        a.fair_fight ?? 1, a.started_at, a.chain_count ?? 0
      ));

      // D1 batch sends many statements in one round trip instead of awaiting
      // each insert individually — chunked to stay well under batch size limits.
      const CHUNK = 200;
      for (let i = 0; i < bound.length; i += CHUNK) {
        await env.DB.batch(bound.slice(i, i + CHUNK));
      }
    }

    await env.DB.prepare(
      `UPDATE ranked_wars SET summary_json=?, verified_override=1 WHERE id=?`
    ).bind(JSON.stringify({ attackerStats, defendStats, totals }), warId).run();

    return jsonResponse({ ok: true, attacksReplaced: !war.hits_saved && Array.isArray(attacks) ? attacks.length : 0 });
  } catch (err) {
    console.error('applyVerifiedWarData error:', err);
    return errorResponse('Failed to apply verified data: ' + err.message, 500);
  }
}

// ── POST /api/admin/wars/check  (manual trigger) ─────────────────────────────

export async function triggerWarCheck(request, env) {
  try {
    const matchResults  = await checkWarMatches(env, 'manual');
    const trackResults  = await trackActiveWars(env, 'manual');
    return jsonResponse({ message: 'War check + track complete', matchResults, trackResults });
  } catch (err) {
    console.error('triggerWarCheck error:', err);
    return errorResponse('War check failed', 500);
  }
}

// ── POST /api/admin/wars/backfill ─────────────────────────────────────────────
// One-shot: fetch last 10 ranked wars per faction from Torn API and insert any
// not already in the DB. Skips wars already present (by torn_war_id).
// Safe to call multiple times — duplicates are ignored.

export async function backfillHistoricWars(request, env) {
  const summary = [];

  for (const factionId of FACTION_IDS) {
    try {
      const apiKeyObj = await getStaffApiKeyForFaction(env, factionId); const apiKey = apiKeyObj?.key ?? null;
      if (!apiKey) { summary.push({ factionId, error: 'no API key' }); continue; }

      const res = await fetch(
        `${TORN_API_BASE}/faction/rankedwars?limit=10&sort=DESC&comment=OccHub`,
        { headers: { Authorization: `ApiKey ${apiKey}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.error || JSON.stringify(data.error));

      const wars   = data.rankedwars || [];
      let inserted = 0;
      let skipped  = 0;

      for (const rw of wars) {
        // Only store wars that include this faction
        const ourFac = rw.factions?.find(f => f.id === factionId);
        const oppFac = rw.factions?.find(f => f.id !== factionId);
        if (!ourFac || !oppFac) { skipped++; continue; }

        // Skip if already stored by torn_war_id
        const existing = await env.DB.prepare(
          `SELECT id FROM ranked_wars WHERE torn_war_id=? AND faction_id=?`
        ).bind(rw.id, factionId).first();
        if (existing) { skipped++; continue; }

        const isCompleted = rw.end > 0;
        const status      = isCompleted ? 'completed' : (rw.start > 0 ? 'active' : 'matched');
        const result      = isCompleted
          ? (rw.winner === factionId ? 'won' : 'lost')
          : null;

        await env.DB.prepare(
          `INSERT INTO ranked_wars
             (faction_id, opponent_faction_id, opponent_faction_name,
              torn_war_id, status, result,
              started_at, ended_at,
              our_score, opponent_score, target,
              our_chain, opponent_chain,
              hits_saved, last_checked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`
        ).bind(
          factionId,
          oppFac.id,
          oppFac.name ?? null,
          rw.id,
          status,
          result,
          rw.start > 0 ? rw.start : null,
          isCompleted  ? rw.end   : null,
          ourFac.score ?? 0,
          oppFac.score ?? 0,
          rw.target    ?? 0,
          ourFac.chain ?? 0,
          oppFac.chain ?? 0
        ).run();

        inserted++;
      }

      summary.push({ factionId, wars: wars.length, inserted, skipped });
    } catch (err) {
      console.error(`backfillHistoricWars faction ${factionId}:`, err);
      summary.push({ factionId, error: err.message });
    }
  }

  return jsonResponse({ summary });
}
