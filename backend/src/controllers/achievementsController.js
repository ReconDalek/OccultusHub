import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { BADGE_DEFS, getAchievementConfigs, getEffectiveBadgeDefs, computeAchievements } from '../services/achievements.js';

// ── GET /api/admin/achievements/configs ──────────────────────────────────────
// Every badge definition merged with its current admin override (if any) —
// what Admin > Achievements' management table renders.
export async function getAchievementAdminConfigs(request, env) {
  try {
    const configs = await getAchievementConfigs(env);
    const defs = getEffectiveBadgeDefs(configs).map(def => ({
      key: def.key,
      label: def.label,
      icon: def.icon,
      binary: !!def.binary,
      enabled: def.enabled,
      tiers: def.binary ? null : def.tiers,
      has_override: !!configs[def.key],
    }));
    return jsonResponse({ badges: defs });
  } catch (e) {
    return errorResponse('Failed to fetch achievement configs: ' + e.message, 500);
  }
}

// ── PUT /api/admin/achievements/configs/:key ─────────────────────────────────
// Body: { enabled, bronze_threshold, silver_threshold, gold_threshold }.
// Binary badges only ever use `enabled` — thresholds are ignored/stay NULL.
export async function updateAchievementConfig(request, env, user) {
  try {
    const match = request.url.match(/\/achievements\/configs\/([a-z_]+)/);
    const key = match?.[1];
    if (!key || !BADGE_DEFS.some(d => d.key === key)) return errorResponse('Unknown badge key', 400);

    const body = await request.json();
    const def = BADGE_DEFS.find(d => d.key === key);
    const enabled = body.enabled ? 1 : 0;
    const bronze = def.binary ? null : (body.bronze_threshold ?? null);
    const silver = def.binary ? null : (body.silver_threshold ?? null);
    const gold   = def.binary ? null : (body.gold_threshold ?? null);

    await env.DB.prepare(
      `INSERT INTO achievement_configs (key, enabled, bronze_threshold, silver_threshold, gold_threshold, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(key) DO UPDATE SET
         enabled = excluded.enabled, bronze_threshold = excluded.bronze_threshold,
         silver_threshold = excluded.silver_threshold, gold_threshold = excluded.gold_threshold,
         updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by`
    ).bind(key, enabled, bronze, silver, gold, user.userId).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return errorResponse('Failed to update achievement config: ' + e.message, 500);
  }
}

// ── GET /api/admin/achievements/holders ──────────────────────────────────────
// Computes every badge for every faction member (active + departed) in one
// pass — bulk per-stat queries, not N individual profile fetches — then
// inverts the result into "who holds each badge, at which tier."
//
// ⚠️ Two ID spaces to bridge here (see [[achievements_feature]]): war/chain/OC
// data keys by torn_user_id (works for anyone Torn-synced, no site account
// needed); the mini-games/forums/cipher/discord tables key by users.id (only
// exists if they've logged into occultusHub) — bridged via `users.torn_user_id`.
export async function getAchievementHolders(request, env) {
  try {
    const [
      configs,
      members,
      usersRows,
      warsFoughtRows, chainsFoughtRows, warRespectRows, chainRespectRows,
      ocJoinedRows, mentorRows,
      fishingRows, runeRows, familiarRows, cahRows, riteRows,
      forumRows, cipherRows, sanctumRows, discordRows,
    ] = await Promise.all([
      getAchievementConfigs(env),
      env.DB.prepare(`SELECT torn_user_id, username, faction_id, is_active, days_in_faction FROM faction_members`).all(),
      env.DB.prepare(`SELECT id, torn_user_id FROM users`).all(),
      env.DB.prepare(`SELECT torn_user_id, COUNT(DISTINCT ranked_war_id) AS val FROM war_hits GROUP BY torn_user_id`).all(),
      env.DB.prepare(`SELECT torn_user_id, COUNT(DISTINCT torn_chain_id) AS val FROM chain_hits GROUP BY torn_user_id`).all(),
      env.DB.prepare(`SELECT torn_user_id, COALESCE(SUM(respect_gained),0) AS val FROM war_hits GROUP BY torn_user_id`).all(),
      env.DB.prepare(`SELECT torn_user_id, COALESCE(SUM(total_respect),0) AS val FROM chain_hits GROUP BY torn_user_id`).all(),
      env.DB.prepare(`SELECT torn_user_id, COUNT(*) AS val FROM oc_crime_slots WHERE torn_user_id IS NOT NULL GROUP BY torn_user_id`).all(),
      env.DB.prepare(`SELECT DISTINCT torn_user_id FROM mentors`).all(),
      env.DB.prepare(`SELECT user_id, COUNT(*) AS val FROM fishing_catches GROUP BY user_id`).all(),
      env.DB.prepare(`SELECT user_id, COUNT(*) AS val FROM rune_casts GROUP BY user_id`).all(),
      env.DB.prepare(`SELECT user_id, level FROM familiars`).all(),
      env.DB.prepare(`SELECT user_id, COUNT(DISTINCT room_id) AS val FROM cah_players WHERE user_id IS NOT NULL GROUP BY user_id`).all(),
      env.DB.prepare(`SELECT user_id, COUNT(DISTINCT room_id) AS val FROM game_players WHERE user_id IS NOT NULL GROUP BY user_id`).all(),
      env.DB.prepare(`SELECT author_id AS user_id, COUNT(*) AS val FROM forum_posts GROUP BY author_id`).all(),
      env.DB.prepare(`SELECT user_id, COUNT(*) AS val FROM cipher_submissions WHERE is_correct=1 AND user_id IS NOT NULL GROUP BY user_id`).all(),
      env.DB.prepare(`SELECT DISTINCT user_id FROM sanctum_saves`).all(),
      env.DB.prepare(`SELECT DISTINCT user_id FROM discord_links`).all(),
    ]);

    const toMap  = (rows, keyField, valField) => { const m = {}; for (const r of rows.results || []) m[r[keyField]] = r[valField]; return m; };
    const toSet  = (rows, keyField) => new Set((rows.results || []).map(r => r[keyField]));

    const idToTorn = {};
    for (const u of (usersRows.results || [])) idToTorn[u.id] = u.torn_user_id;

    const warsFought    = toMap(warsFoughtRows, 'torn_user_id', 'val');
    const chainsFought  = toMap(chainsFoughtRows, 'torn_user_id', 'val');
    const warRespect    = toMap(warRespectRows, 'torn_user_id', 'val');
    const chainRespect  = toMap(chainRespectRows, 'torn_user_id', 'val');
    const ocJoined      = toMap(ocJoinedRows, 'torn_user_id', 'val');
    const mentorSet     = toSet(mentorRows, 'torn_user_id');

    // users.id-keyed maps, re-keyed to torn_user_id via the bridge above.
    function rekeyToTorn(rows, valField) {
      const out = {};
      for (const r of (rows.results || [])) {
        const torn = idToTorn[r.user_id];
        if (torn != null) out[torn] = valField ? r[valField] : true;
      }
      return out;
    }
    const fishing      = rekeyToTorn(fishingRows, 'val');
    const runes        = rekeyToTorn(runeRows, 'val');
    const familiars     = rekeyToTorn(familiarRows, 'level');
    const cah           = rekeyToTorn(cahRows, 'val');
    const rite           = rekeyToTorn(riteRows, 'val');
    const cipherSolves  = rekeyToTorn(cipherRows, 'val');
    const sanctumSet    = new Set(Object.keys(rekeyToTorn(sanctumRows)));
    const discordSet    = new Set(Object.keys(rekeyToTorn(discordRows)));

    // forum_posts keys by author_id (= users.id) directly, same bridge.
    const forumPostsByTorn = rekeyToTorn(forumRows, 'val');

    const badgeHolders = {};
    for (const def of BADGE_DEFS) badgeHolders[def.key] = [];

    for (const m of (members.results || [])) {
      const t = m.torn_user_id;
      const stats = {
        days_in_faction: m.days_in_faction ?? 0,
        wars_fought:     warsFought[t] ?? 0,
        chains_fought:   chainsFought[t] ?? 0,
        total_respect:   (warRespect[t] ?? 0) + (chainRespect[t] ?? 0),
        oc_joined:       ocJoined[t] ?? 0,
        fishing_catches: fishing[t] ?? 0,
        rune_casts:      runes[t] ?? 0,
        has_sanctum:     sanctumSet.has(String(t)),
        familiar_level:  familiars[t] ?? 0,
        cah_games:       cah[t] ?? 0,
        rite_games:      rite[t] ?? 0,
        forum_posts:     forumPostsByTorn[t] ?? 0,
        cipher_solves:   cipherSolves[t] ?? 0,
        is_mentor:       mentorSet.has(t),
        discord_linked:  discordSet.has(String(t)),
      };

      const achievements = computeAchievements(stats, configs);
      for (const a of achievements) {
        if (!a.earned) continue;
        badgeHolders[a.key].push({
          torn_user_id: t, username: m.username, faction_id: m.faction_id, is_active: m.is_active,
          tier: a.binary ? null : a.tier, value: a.value,
        });
      }
    }

    // Sort holders: tiered by value desc, binary just alphabetical.
    for (const key of Object.keys(badgeHolders)) {
      badgeHolders[key].sort((a, b) => (typeof a.value === 'number' && typeof b.value === 'number') ? b.value - a.value : 0);
    }

    return jsonResponse({ holders: badgeHolders, member_count: (members.results || []).length });
  } catch (e) {
    console.error('getAchievementHolders error:', e);
    return errorResponse('Failed to compute achievement holders: ' + e.message, 500);
  }
}
