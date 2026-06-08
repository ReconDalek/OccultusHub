import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

const FACTION_IDS = [33097, 9728, 9171];

// ─────────────────────────────────────────────────────────────────────────────
// Internal: sync faction_members from the already-cached faction_cache rows.
// No extra API calls — reads data that was just written by fetchAndCacheFactions.
//
// Logic:
//  1. Record syncStart timestamp (before any writes).
//  2. For each faction in faction_cache, upsert every member:
//       - INSERT if new (sets joined_at = now).
//       - UPDATE if exists: name/position/level/days/status/faction may all change.
//       - On re-join: clear left_at.
//  3. After all factions processed, mark any active member whose
//     last_updated_at < syncStart as departed (is_active=0, left_at=now).
// ─────────────────────────────────────────────────────────────────────────────
export async function syncMembersFromCache(env) {
  // D1 CURRENT_TIMESTAMP format is 'YYYY-MM-DD HH:MM:SS' (UTC, no Z).
  // We store syncStart in the same format so the departure query can compare.
  const now       = new Date();
  const syncStart = now.toISOString().replace('T', ' ').slice(0, 19);

  let totalSynced  = 0;
  let totalAdded   = 0;
  const errors     = [];

  for (const factionId of FACTION_IDS) {
    try {
      const row = await env.DB.prepare(
        `SELECT data FROM faction_cache WHERE faction_id = ?`
      ).bind(factionId).first();

      if (!row?.data) {
        errors.push(`Faction ${factionId}: no cache data — run a cache refresh first`);
        continue;
      }

      let factionData;
      try {
        factionData = JSON.parse(row.data);
      } catch {
        errors.push(`Faction ${factionId}: corrupt cache JSON`);
        continue;
      }

      // The Torn API v1 basic+members response stores members as an object
      // keyed by torn_user_id string: { "2741093": { name, level, ... } }
      const rawMembers = factionData.members || {};

      // Handle both object (v1 keyed) and array (legacy/transformed) formats
      const memberEntries = Array.isArray(rawMembers)
        ? rawMembers.map((m) => [String(m.id ?? m.torn_user_id ?? ''), m])
        : Object.entries(rawMembers);

      for (const [idStr, member] of memberEntries) {
        const tornUserId = parseInt(idStr, 10);
        if (!tornUserId || isNaN(tornUserId)) continue;

        const username        = member.name         || '';
        const position        = member.position      || null;
        const level           = member.level         ?? null;
        const daysInFaction   = member.days_in_faction ?? null;
        const statusState     = member.status?.state  || null;
        const lastSeenAt      = member.last_action?.timestamp || null;

        const result = await env.DB.prepare(
          `INSERT INTO faction_members
             (torn_user_id, username, faction_id, faction_position,
              level, days_in_faction, status, last_seen_at,
              is_active, last_updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
           ON CONFLICT(torn_user_id) DO UPDATE SET
             username         = excluded.username,
             faction_id       = excluded.faction_id,
             faction_position = excluded.faction_position,
             level            = excluded.level,
             days_in_faction  = excluded.days_in_faction,
             status           = excluded.status,
             last_seen_at     = excluded.last_seen_at,
             is_active        = 1,
             left_at          = CASE
                                  WHEN faction_members.is_active = 0 THEN NULL
                                  ELSE faction_members.left_at
                                END,
             last_updated_at  = CURRENT_TIMESTAMP`
        ).bind(
          tornUserId, username, factionId, position,
          level, daysInFaction, statusState, lastSeenAt
        ).run();

        if (result.meta?.changes > 0) totalSynced++;

        // Track newly inserted rows (last_row_id only set on INSERT, not UPDATE)
        // If the row didn't exist before, SQLite sets last_row_id to the new pk
        // We check by seeing if joined_at was just set — simplest proxy is if
        // changes > 0 and the upsert inserted a brand-new row.
        // (We count inserts separately for reporting)
        if (result.meta?.last_row_id && result.meta.changes > 0) {
          // Check if this was a new insert by seeing if joined_at == now (within 1s)
          const check = await env.DB.prepare(
            `SELECT joined_at FROM faction_members WHERE torn_user_id = ?`
          ).bind(tornUserId).first();
          if (check?.joined_at && check.joined_at >= syncStart) {
            totalAdded++;
          }
        }
      }

      console.log(`syncMembersFromCache: faction ${factionId} — ${Object.keys(rawMembers instanceof Object && !Array.isArray(rawMembers) ? rawMembers : {}).length || memberEntries.length} members processed`);
    } catch (err) {
      console.error(`syncMembersFromCache: faction ${factionId} error:`, err);
      errors.push(`Faction ${factionId}: ${err.message}`);
    }
  }

  // ── Departure detection ──
  // Any member who is still marked active but was NOT touched in this sync
  // (last_updated_at < syncStart) has left all 3 factions.
  let departed = 0;
  try {
    const result = await env.DB.prepare(
      `UPDATE faction_members
       SET is_active = 0,
           left_at   = CURRENT_TIMESTAMP
       WHERE is_active = 1
         AND last_updated_at < ?`
    ).bind(syncStart).run();

    departed = result.meta?.changes || 0;
    if (departed > 0) {
      console.log(`syncMembersFromCache: ${departed} member(s) marked as departed`);
    }
  } catch (err) {
    console.error('syncMembersFromCache: departure detection error:', err);
    errors.push(`Departure detection: ${err.message}`);
  }

  return { synced: totalSynced, added: totalAdded, departed, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leadership/members?faction_id=X
// Returns all active members for the faction with total chain hits from chain_hits.
// ─────────────────────────────────────────────────────────────────────────────
export async function getFactionMembers(request, env) {
  try {
    const url      = new URL(request.url);
    const factionId = parseInt(url.searchParams.get('faction_id'), 10);

    if (!factionId || !FACTION_IDS.includes(factionId)) {
      return errorResponse('Invalid or missing faction_id. Valid values: 33097, 9728, 9171', 400);
    }

    const result = await env.DB.prepare(
      `SELECT
         fm.torn_user_id,
         fm.username,
         fm.faction_id,
         fm.faction_position,
         fm.level,
         fm.days_in_faction,
         fm.status,
         fm.last_seen_at,
         fm.joined_at,
         COALESCE(SUM(ch.total_attacks), 0)                        AS total_chain_hits,
         COALESCE(SUM(ch.bonus_hits),    0)                        AS total_bonus_hits,
         COALESCE(SUM(wh.war_hits),      0)                        AS total_war_hits,
         COALESCE(SUM(wh.outside_hits),  0)                        AS total_war_outside_hits,
         COALESCE(SUM(wh.assists),       0)                        AS total_war_assists,
         COALESCE(SUM(wh.payout_amount), 0)                        AS total_war_payout,
         ROUND(COALESCE(SUM(wh.units),   0), 1)                    AS total_war_units,
         COALESCE(SUM(cx.hits),          0)                        AS total_custom_hits,
         COALESCE(SUM(ch.total_attacks), 0)
           + ROUND(COALESCE(SUM(wh.units), 0), 0)
           + COALESCE(SUM(cx.hits), 0)                             AS total_hits
       FROM faction_members fm
       LEFT JOIN chain_hits  ch ON ch.torn_user_id = fm.torn_user_id
       LEFT JOIN war_hits    wh ON wh.torn_user_id = fm.torn_user_id
       LEFT JOIN custom_hits cx ON cx.torn_user_id = fm.torn_user_id
       WHERE fm.is_active = 1
         AND fm.faction_id = ?
       GROUP BY fm.torn_user_id
       ORDER BY total_hits DESC, fm.username ASC`
    ).bind(factionId).all();

    return jsonResponse({ members: result.results || [] });
  } catch (err) {
    console.error('getFactionMembers error:', err);
    return errorResponse('Failed to fetch faction members', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/members/status
// Summary stats for the admin cache panel.
// ─────────────────────────────────────────────────────────────────────────────
export async function getMemberSyncStatus(request, env) {
  try {
    const totals = await env.DB.prepare(
      `SELECT
         COUNT(*)                                    AS total_members,
         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_members,
         MAX(last_updated_at)                        AS last_synced
       FROM faction_members`
    ).first();

    // Per-faction breakdown
    const perFaction = await env.DB.prepare(
      `SELECT faction_id,
              COUNT(*) AS total,
              SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
       FROM faction_members
       GROUP BY faction_id`
    ).all();

    const factionBreakdown = {};
    for (const id of FACTION_IDS) {
      factionBreakdown[id] = { total: 0, active: 0 };
    }
    for (const row of perFaction.results || []) {
      factionBreakdown[row.faction_id] = { total: row.total, active: row.active };
    }

    return jsonResponse({
      totalMembers:   totals?.total_members  || 0,
      activeMembers:  totals?.active_members || 0,
      lastSynced:     totals?.last_synced    || null,
      factionBreakdown,
    });
  } catch (err) {
    console.error('getMemberSyncStatus error:', err);
    return errorResponse('Failed to fetch member sync status', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/members/sync
// Manually trigger a member sync from the current faction cache.
// ─────────────────────────────────────────────────────────────────────────────
export async function triggerMemberSync(request, env, user) {
  try {
    const result = await syncMembersFromCache(env);

    const parts = [`${result.synced} member record${result.synced !== 1 ? 's' : ''} synced`];
    if (result.added > 0)    parts.push(`${result.added} new`);
    if (result.departed > 0) parts.push(`${result.departed} departed`);

    return jsonResponse({
      message:    parts.join(' — '),
      synced:     result.synced,
      added:      result.added,
      departed:   result.departed,
      errors:     result.errors,
      syncedAt:   new Date().toISOString(),
    });
  } catch (err) {
    console.error('triggerMemberSync error:', err);
    return errorResponse('Failed to sync members', 500);
  }
}
