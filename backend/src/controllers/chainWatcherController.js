import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getRandomUserApiKey, getStaffApiKeyForFaction, fetchWithRetry } from '../services/tornApiService.js';
import { recordBonusHitEntries, MERIT_THRESHOLDS, ALL_BONUS_POSITIONS, meritTypeForChainPosition } from './meritController.js';
import { TARGET_LENGTHS, estimateChainDuration } from './chainController.js';
import { parseArmoryEntry } from './warController.js';

const TORN_API_BASE = 'https://api.torn.com/v2';
const DISCORD_API = 'https://discord.com/api/v10';
const FACTION_IDS = [33097, 9728, 9171];
const FACTION_NAMES = { 33097: 'Occultus', 9728: 'Occul2us', 9171: 'Occul3us' };
const HOUR = 3600;

function validFactionId(raw) {
  const id = parseInt(raw, 10);
  return FACTION_IDS.includes(id) ? id : null;
}

// Bot-facing auth — shared secret, same pattern as the OC Inactivity/OD
// reimbursement bot endpoints. The Discord bot has no JWT, so it can't go
// through the member/leadership checks the website routes use.
function checkChainBotSecret(request, env) {
  const auth = request.headers.get('Authorization') || '';
  return !!env.CHAIN_BOT_SECRET && auth === `Bearer ${env.CHAIN_BOT_SECRET}`;
}

// The actual Torn call, shared by the website's session-gated endpoint and
// the bot-facing one (which manages its own watch state and isn't gated by
// a website session). The faction chain endpoint is public — any valid key
// can read any faction's chain status — so this draws from the full
// submitted-key pool rather than requiring one belonging to this specific
// faction's own leadership, which would fail outright if that faction
// happened to have no staff key on file.
async function fetchLiveChainFromTorn(env, factionId) {
  const keyProbe = await getRandomUserApiKey(env);
  if (!keyProbe?.key) {
    const err = new Error('No API key available');
    err.status = 503;
    throw err;
  }

  const data = await fetchWithRetry(
    `${TORN_API_BASE}/faction/${factionId}/chain`,
    () => getRandomUserApiKey(env),
    env
  );

  const chain = data.chain || {};
  let status = 'idle';
  if (chain.timeout > 0) status = 'active';
  else if (chain.cooldown > 0) status = 'cooldown';

  return {
    factionId,
    status,
    current: chain.current || 0,
    timeout: chain.timeout || 0,
    cooldown: chain.cooldown || 0,
    start: chain.start || 0,
    end: chain.end || 0,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

// Deterministic simulated chain data for test mode — no Torn call. Cycles
// through a 5-minute window per "hit" window so the countdown, hit count, and
// the urgent/about-to-drop styling all get exercised automatically without
// needing a real chain or any manual input.
const TEST_CYCLE_SECONDS = 300;
const TEST_HIT_INTERVAL_SECONDS = 20;

function generateTestChainData(factionId, session) {
  const nowSecs = Math.floor(Date.now() / 1000);
  const elapsed = Math.max(0, nowSecs - (session.started_at || nowSecs));
  const cyclePos = elapsed % TEST_CYCLE_SECONDS;

  return {
    factionId,
    status: 'active',
    current: Math.floor(elapsed / TEST_HIT_INTERVAL_SECONDS) + 1,
    timeout: TEST_CYCLE_SECONDS - cyclePos,
    cooldown: 0,
    start: session.started_at,
    end: 0,
    fetchedAt: nowSecs,
    isTest: true,
  };
}

// Reads the faction's current session row, flipping a 'scheduled' session to
// 'active' once its scheduled_start has passed (lazily, on read — no cron
// needed). Returns null if nothing is scheduled/active.
async function loadCurrentSession(env, factionId) {
  const row = await env.DB.prepare(
    `SELECT * FROM chain_watch_sessions WHERE faction_id = ? AND status IN ('scheduled','active') ORDER BY id DESC LIMIT 1`
  ).bind(factionId).first();
  if (!row) return null;

  const nowSecs = Math.floor(Date.now() / 1000);
  if (row.status === 'scheduled' && row.scheduled_start != null && row.scheduled_start <= nowSecs) {
    await env.DB.prepare(
      `UPDATE chain_watch_sessions SET status = 'active', started_at = ? WHERE id = ?`
    ).bind(nowSecs, row.id).run();
    row.status = 'active';
    row.started_at = nowSecs;
  }
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/session?faction_id=X
// Cheap, DB-only — tells the frontend whether it should even be polling the
// live Torn endpoint. No Torn API call happens here.
// ─────────────────────────────────────────────────────────────────────────────
export async function getActiveSession(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    const session = await loadCurrentSession(env, factionId);
    return jsonResponse({ session });
  } catch (err) {
    console.error('getActiveSession error:', err);
    return errorResponse('Failed to fetch session', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/session  { faction_id, scheduled_start?, is_test?, target_length? }
// Leadership-only (enforced in routes.js). scheduled_start omitted/in the
// past = starts immediately; otherwise the session stays 'scheduled' until
// that time, and no Torn polling happens in the meantime. is_test starts a
// simulated chain (always immediately — there's no reason to schedule a test
// for later) so the live view can be exercised without a real chain.
// target_length is an optional goal chain length, one of TARGET_LENGTHS.
// ─────────────────────────────────────────────────────────────────────────────
export async function scheduleSession(request, env, user) {
  try {
    const body = await request.json();
    const factionId = validFactionId(body.faction_id);
    if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

    const existing = await loadCurrentSession(env, factionId);
    if (existing) return errorResponse('A chain watch is already scheduled or active for this faction', 409);

    let targetLength = null;
    if (body.target_length != null) {
      const t = parseInt(body.target_length, 10);
      if (!TARGET_LENGTHS.includes(t)) return errorResponse('Invalid target_length', 400);
      targetLength = t;
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    const isTest = !!body.is_test;
    const scheduledStart = isTest ? null : (body.scheduled_start ? parseInt(body.scheduled_start, 10) : null);
    const startsNow = isTest || !scheduledStart || scheduledStart <= nowSecs;

    const result = await env.DB.prepare(
      `INSERT INTO chain_watch_sessions (faction_id, status, scheduled_start, started_at, created_by, is_test, target_length)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      factionId,
      startsNow ? 'active' : 'scheduled',
      scheduledStart,
      startsNow ? nowSecs : null,
      user.tornUserId,
      isTest ? 1 : 0,
      targetLength
    ).run();

    return jsonResponse({ success: true, id: result.meta.last_row_id });
  } catch (err) {
    console.error('scheduleSession error:', err);
    return errorResponse('Failed to schedule chain watch', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/target-estimate?faction_id=X&target=Y — leadership-
// only. Estimated time to reach a target chain length, from this faction's
// own chain history — see estimateChainDuration for the method/caveats.
// ─────────────────────────────────────────────────────────────────────────────
export async function getTargetEstimate(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  const target = parseInt(url.searchParams.get('target'), 10);
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);
  if (!TARGET_LENGTHS.includes(target)) return errorResponse('Invalid target', 400);

  try {
    const estimate = await estimateChainDuration(env, factionId, target);
    return jsonResponse({ target, ...estimate });
  } catch (err) {
    console.error('getTargetEstimate error:', err);
    return errorResponse('Failed to compute estimate', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/session/:id/end — leadership-only.
// Ending a test session also runs a synthetic bonus-hit report through the
// same recordBonusHitEntries insertion a real chain uses — one simulated hit
// at each merit type's lowest threshold, attributed to the leader ending it —
// so the whole auto-tracking pipeline (chain_bonus_hits log + member_merits
// auto-award) can be verified on demand without a real chain ever running.
// ─────────────────────────────────────────────────────────────────────────────
export async function endSession(request, env, user) {
  try {
    const match = new URL(request.url).pathname.match(/\/api\/chain-watcher\/session\/(?<id>\d+)\/end/);
    const id = match?.groups?.id;
    if (!id) return errorResponse('Invalid session id', 400);

    const session = await env.DB.prepare(
      `SELECT * FROM chain_watch_sessions WHERE id = ? AND status IN ('scheduled','active')`
    ).bind(id).first();
    if (!session) return errorResponse('Session not found or already ended', 404);

    const nowSecs = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE chain_watch_sessions SET status = 'ended', ended_at = ? WHERE id = ?`
    ).bind(nowSecs, id).run();

    let meritTest = null;
    if (session.is_test) {
      const testChainId = -session.id; // negative — can never collide with a real Torn chain id
      const bonuses = Object.values(MERIT_THRESHOLDS).map((positions) => ({
        attacker_id: user.tornUserId,
        chain: positions[0],
        respect: null,
      }));
      meritTest = await recordBonusHitEntries(env, testChainId, session.faction_id, bonuses);
    }

    return jsonResponse({ success: true, meritTest });
  } catch (err) {
    console.error('endSession error:', err);
    return errorResponse('Failed to end session', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/live?faction_id=X
// Live proxy to Torn's chain endpoint — must use a key belonging to that exact
// faction, since Torn scopes the chain selection to the key's own faction.
// Only actually calls Torn while a session is active; otherwise this is a
// cheap no-op so a stray/old client polling this can't burn API quota.
// ─────────────────────────────────────────────────────────────────────────────
export async function getLiveStatus(request, env, user, ctx) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    const session = await loadCurrentSession(env, factionId);
    if (!session || session.status !== 'active') {
      return jsonResponse({ factionId, status: 'no_session', fetchedAt: Math.floor(Date.now() / 1000) });
    }

    // Only counts as "watching" once there's an actual live timer to watch —
    // a stray/old tab polling with no active session doesn't count. Best
    // effort: never let a tracking hiccup break the actual poll response.
    const viewers = await trackViewer(env, user.tornUserId, factionId).catch((e) => {
      console.error('trackViewer error:', e);
      return null;
    });

    if (session.is_test) return jsonResponse({ ...generateTestChainData(factionId, session), viewers, bonusAwards: [] });

    const liveData = await fetchLiveChainFromTorn(env, factionId);

    // Fire-and-forget — the attack/armory sync pages through Torn's API
    // sequentially (can take several seconds), so it must NOT block this
    // response. Broke live polling in production the first time this was
    // written as a synchronous `await` here (2026-10-27): every ~8s the one
    // viewer whose poll won the throttle claim could take many extra
    // seconds, well past what the frontend's poll loop expects, reading as
    // "endlessly loading". ctx.waitUntil lets the response return with the
    // chain's actual timer data immediately regardless of how long the
    // background sync takes; its results just show up on a later poll.
    if (liveData.current > 0 && ctx) {
      ctx.waitUntil((async () => {
        try {
          const syncResult = await syncChainAttacks(env, session, factionId, liveData.current);
          // Armory sync piggybacks on the same throttle claim as the attack
          // sync (whichever poll wins that tick does both) rather than its
          // own separate claim — no reason to double the Torn API traffic.
          if (!syncResult.skipped) {
            await syncChainArmory(env, session, factionId);
          }
        } catch (e) {
          console.error('live chain sync error:', e);
        }
      })());
    }
    const bonusAwards = await fetchRecentBonusAwards(env, session.id).catch(() => []);

    return jsonResponse({ ...liveData, viewers, bonusAwards });
  } catch (err) {
    console.error('getLiveStatus error:', err);
    return errorResponse(err.status ? err.message : `Torn API error: ${err.message}`, err.status || 502);
  }
}

const VIEWER_ACTIVE_WINDOW_SECONDS = 15; // a little more than the 10s client poll interval

// Upserts this user's "last polled" timestamp, then returns how many
// viewers are currently active (polled within the last 15s) for this
// faction and overall (all factions combined), bumping the all-time peak(s)
// if this moment's count is a new high.
async function trackViewer(env, tornUserId, factionId) {
  const nowSecs = Math.floor(Date.now() / 1000);
  const cutoff = nowSecs - VIEWER_ACTIVE_WINDOW_SECONDS;

  await env.DB.prepare(
    `INSERT INTO chain_watch_viewers (torn_user_id, faction_id, last_polled_at) VALUES (?, ?, ?)
     ON CONFLICT(torn_user_id, faction_id) DO UPDATE SET last_polled_at = excluded.last_polled_at`
  ).bind(tornUserId, factionId, nowSecs).run();

  const { count: current } = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM chain_watch_viewers WHERE faction_id = ? AND last_polled_at >= ?`
  ).bind(factionId, cutoff).first();

  const { count: currentOverall } = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM chain_watch_viewers WHERE last_polled_at >= ?`
  ).bind(cutoff).first();

  const [perFaction, overall] = await Promise.all([
    bumpViewerPeak(env, factionId, current),
    bumpViewerPeak(env, 0, currentOverall),
  ]);

  return {
    current, peak: perFaction.peak_count, peakAt: perFaction.peak_at,
    currentOverall, peakOverall: overall.peak_count, peakOverallAt: overall.peak_at,
  };
}

// faction_id = 0 is the combined/overall peak across all factions at once.
async function bumpViewerPeak(env, factionId, currentCount) {
  const existing = await env.DB.prepare(
    `SELECT peak_count, peak_at FROM chain_watch_viewer_peaks WHERE faction_id = ?`
  ).bind(factionId).first();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO chain_watch_viewer_peaks (faction_id, peak_count, peak_at) VALUES (?, ?, CURRENT_TIMESTAMP)`
    ).bind(factionId, currentCount).run();
    return { peak_count: currentCount, peak_at: new Date().toISOString() };
  }

  if (currentCount > existing.peak_count) {
    await env.DB.prepare(
      `UPDATE chain_watch_viewer_peaks SET peak_count = ?, peak_at = CURRENT_TIMESTAMP WHERE faction_id = ?`
    ).bind(currentCount, factionId).run();
    return { peak_count: currentCount, peak_at: new Date().toISOString() };
  }

  return existing;
}

const SYNC_CHECK_INTERVAL_SECONDS = 8; // throttles the /faction/attacks lookup to roughly once per poll cycle, regardless of viewer count
const SYNC_LOOKBACK_PAGES = 10; // up to 1,000 attacks per routine check — a generous budget for the gap since the last check, not a fixed "recent window"
const BACKFILL_LOOKBACK_PAGES = 300; // up to 30,000 attacks per backfill pass
const BACKFILL_MAX_PASSES = 10; // up to 300,000 attacks total across passes — the feed includes every attack by/against the faction, not just chain hits, so a long/high-member-count chain can run well past its own hit count
const BONUS_NOTICE_WINDOW_SECONDS = 20; // how long a freshly-detected bonus hit stays visible to pollers that didn't win the check
const ARMORY_SYNC_LOOKBACK_PAGES = 5;
const ARMORY_BACKFILL_LOOKBACK_PAGES = 200;

// Claims the "sync" job for this poll tick (first poll past the throttle
// window wins; everyone else skips it this tick — same claim pattern as a
// single-winner optimistic UPDATE), then walks the faction's own attack log
// (the only live source with a per-attack chain position — Torn's
// chainreport isn't available until the chain itself has ended) to do two
// things in one pass: (1) record every chain-counted attack by one of our
// own members into chain_watch_attacks — the source for the live Attacks/
// Energy Out economics — and (2) attribute any bonus-threshold position
// the chain has already passed to whoever landed it, same as before.
//
// Confirmed live (2026-10-26): a fixed "last 300 attacks from now" window
// only works right after a threshold is crossed — once a chain has run long
// enough without anyone's poll happening to trigger a check in between, an
// earlier attack falls permanently out of that window (a chain at position
// 14734 could no longer find position 10000, hours in the past). Fixed with
// a per-session watermark (`session.attack_sync_watermark`, the highest
// attack id already scanned): each check only has to cover the gap since
// the LAST check, not a fixed recent slice, so it keeps up under normal
// viewing. If a gap builds up anyway (nobody watched for a while) the
// watermark still advances to whatever was actually scanned this run,
// trading "never catches up" for "makes steady forward progress" — call
// with `force`/a larger `maxPages` (see backfillChainEconomics) to
// deliberately close a big gap in one go instead.
async function syncChainAttacks(env, session, factionId, currentPosition, { force = false, maxPages = SYNC_LOOKBACK_PAGES, resumeFromTs = null, onProgress = null } = {}) {
  const nowSecs = Math.floor(Date.now() / 1000);
  if (!force) {
    const claim = await env.DB.prepare(
      `UPDATE chain_watch_sessions SET last_bonus_check_at = ?
       WHERE id = ? AND (last_bonus_check_at IS NULL OR last_bonus_check_at <= ?)`
    ).bind(nowSecs, session.id, nowSecs - SYNC_CHECK_INTERVAL_SECONDS).run();
    if (!claim.meta?.changes) return { skipped: true };
  }

  const { results: already } = await env.DB.prepare(
    `SELECT chain_position FROM chain_watch_bonus_detections WHERE session_id = ?`
  ).bind(session.id).all();
  const pendingBonus = new Set(
    ALL_BONUS_POSITIONS.filter(p => p <= currentPosition && !(already || []).some(r => r.chain_position === p))
  );

  const keyProbe = await getStaffApiKeyForFaction(env, factionId);
  if (!keyProbe?.key) return { error: 'no staff key available' };

  const watermark = force ? 0 : (session.attack_sync_watermark || 0);
  let url = `${TORN_API_BASE}/faction/attacks?limit=100&sort=DESC&comment=OccHub` + (resumeFromTs ? `&to=${resumeFromTs}` : '');
  let maxIdSeen = watermark;
  let newAttacks = 0;
  let oldestTsSeen = null;
  let reachedSessionStart = false;

  for (let page = 0; page < maxPages; page++) {
    let data;
    try {
      data = await fetchWithRetry(url, () => getStaffApiKeyForFaction(env, factionId), env);
    } catch (e) {
      console.error('syncChainAttacks attacks fetch failed:', e.message);
      break;
    }

    const attacks = data.attacks || [];
    if (!attacks.length) { reachedSessionStart = true; break; }

    let stop = false;
    for (const attack of attacks) {
      oldestTsSeen = attack.started;
      if (attack.id <= watermark || attack.started < session.started_at) { stop = true; reachedSessionStart = true; break; }
      if (attack.id > maxIdSeen) maxIdSeen = attack.id;
      if (!(attack.chain > 0 && attack.attacker?.id && attack.attacker?.faction?.id === factionId)) continue;

      const { meta } = await env.DB.prepare(
        `INSERT OR IGNORE INTO chain_watch_attacks (session_id, torn_attack_id, attacker_id, attacker_name, chain_position, respect_gain, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(session.id, attack.id, attack.attacker.id, attack.attacker.name ?? null, attack.chain, attack.respect_gain ?? 0, attack.started).run();
      if (meta?.changes > 0) newAttacks++;

      if (pendingBonus.has(attack.chain)) {
        const meritType = meritTypeForChainPosition(attack.chain);
        if (meritType) {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO member_merits (torn_user_id, merit_type) VALUES (?, ?)`
          ).bind(attack.attacker.id, meritType).run();
          await env.DB.prepare(
            `INSERT OR IGNORE INTO chain_watch_bonus_detections (session_id, chain_position, torn_user_id, merit_type, detected_at)
             VALUES (?, ?, ?, ?, ?)`
          ).bind(session.id, attack.chain, attack.attacker.id, meritType, nowSecs).run();
          pendingBonus.delete(attack.chain);
        }
      }
    }
    if (stop) break;
    if (onProgress && page % 10 === 9) await onProgress({ page: page + 1, newAttacks, oldestTsSeen });

    const prevUrl = data._metadata?.links?.prev;
    if (!prevUrl) { reachedSessionStart = true; break; }
    url = `${TORN_API_BASE}/faction/attacks?limit=100&sort=DESC&comment=OccHub&to=${new URL(prevUrl).searchParams.get('to')}`;
  }

  if (maxIdSeen > (session.attack_sync_watermark || 0)) {
    await env.DB.prepare(
      `UPDATE chain_watch_sessions SET attack_sync_watermark = ? WHERE id = ?`
    ).bind(maxIdSeen, session.id).run();
  }
  return { newAttacks, reachedSessionStart, oldestTsSeen };
}

// Mirrors war tracking's armory-usage ingestion (same news feed, same
// parser) but scoped to a chain watch session instead of a war — the
// source for "Faction Energy In". Paginates OLDEST-reachable-first via the
// `to=` cursor same as war tracking, stopping at session.started_at, an
// already-logged item (once armory_backfilled), running out of pages, or
// the page cap.
async function syncChainArmory(env, session, factionId, { force = false, maxPages = ARMORY_SYNC_LOOKBACK_PAGES } = {}) {
  const keyProbe = await getStaffApiKeyForFaction(env, factionId);
  if (!keyProbe?.key) return { error: 'no staff key available' };

  const backfilled = !!session.armory_backfilled;
  const baseUrl = `${TORN_API_BASE}/faction/news?striptags=false&limit=100&sort=DESC&cat=armoryAction&comment=OccHub&from=${session.started_at}`;
  let url = baseUrl;
  let newUsage = 0;
  let reachedStart = false;

  for (let page = 0; page < maxPages; page++) {
    let data;
    try {
      data = await fetchWithRetry(url, () => getStaffApiKeyForFaction(env, factionId), env);
    } catch (e) {
      console.error('syncChainArmory news fetch failed:', e.message);
      break;
    }

    const items = data.news || [];
    if (!items.length) { reachedStart = true; break; }

    let pageDup = 0;
    for (const item of items) {
      const parsed = parseArmoryEntry(item.text);
      if (!parsed) continue;
      const { meta } = await env.DB.prepare(
        `INSERT OR IGNORE INTO chain_watch_armory_usage (session_id, torn_news_id, torn_user_id, username, item_name, used_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(session.id, item.id, parsed.torn_user_id, parsed.username, parsed.item_name, item.timestamp).run();
      if (meta?.changes > 0) newUsage++; else pageDup++;
    }
    if (pageDup > 0 && backfilled && !force) break; // caught up with already-logged news

    const oldestTs = items[items.length - 1].timestamp;
    if (oldestTs <= session.started_at) { reachedStart = true; break; }

    const prevUrl = data._metadata?.links?.prev;
    if (!prevUrl) { reachedStart = true; break; }
    url = `${baseUrl}&to=${new URL(prevUrl).searchParams.get('to')}`;
  }

  if (!backfilled && reachedStart) {
    await env.DB.prepare(`UPDATE chain_watch_sessions SET armory_backfilled = 1 WHERE id = ?`).bind(session.id).run();
  }
  return { newUsage, reachedStart };
}

// ─────────────────────────────────────────────────────────────────────────────
// Live chain economics — Attacks / Energy Out / Energy In (faction + personal,
// with a combined total) / ODs, per member and faction-wide, for the chain
// currently (or most recently) being watched.
// ─────────────────────────────────────────────────────────────────────────────

const ENERGY_PER_XANAX = 250;
const ENERGY_PER_CAN = 150; // every "Can of ___" flavour refills the same 150 energy in Torn
const ENERGY_PER_REFILL = 100;
const ENERGY_PER_REFILL_DONATOR = 150;

function energyArmoryKind(itemName) {
  if (itemName === 'Xanax') return 'xanax';
  if (/^Can of /i.test(itemName)) return 'can';
  return null; // not an energy item (e.g. Cannabis, First Aid Kit) — ignored for this tracker
}

// Delta of personal (self-reported, not armory-attributed) xanax/energy-
// drink/energy-refill/overdose counts over the chain's window, from personal_stats_snapshots
// — the only source available for a member's OWN usage, since we can't poll
// everyone's individual attack/item logs. Snapshots are once-daily, so a
// chain that starts and ends the same calendar day will show 0 here (same
// known limitation war tracking's own OD delta already has) — this only
// resolves once a later day's snapshot lands.
async function fetchPersonalStatDeltas(env, tornUserIds, fromTs, toTs) {
  if (!tornUserIds.length) return {};
  const fromDate = new Date(fromTs * 1000).toISOString().slice(0, 10);
  const toDate = new Date(toTs * 1000).toISOString().slice(0, 10);
  const ph = tornUserIds.map(() => '?').join(',');
  const cols = `p.torn_user_id,
    CAST(json_extract(p.stats, '$.drugs.xanax') AS INTEGER) AS xanax,
    CAST(json_extract(p.stats, '$.items.used.energy') AS INTEGER) AS energy_drinks,
    CAST(json_extract(p.stats, '$.other.refills.energy') AS INTEGER) AS energy_refills,
    CAST(json_extract(p.stats, '$.drugs.overdoses') AS INTEGER) AS overdoses`;

  const [startRows, endRows] = await Promise.all([
    env.DB.prepare(`
      SELECT ${cols}
      FROM personal_stats_snapshots p
      INNER JOIN (
        SELECT torn_user_id, MIN(snapshot_date) AS min_date
        FROM personal_stats_snapshots WHERE torn_user_id IN (${ph}) AND snapshot_date >= ? AND snapshot_date <= ? GROUP BY torn_user_id
      ) s ON p.torn_user_id = s.torn_user_id AND p.snapshot_date = s.min_date
    `).bind(...tornUserIds, fromDate, toDate).all(),
    env.DB.prepare(`
      SELECT ${cols}
      FROM personal_stats_snapshots p
      INNER JOIN (
        SELECT torn_user_id, MAX(snapshot_date) AS max_date
        FROM personal_stats_snapshots WHERE torn_user_id IN (${ph}) AND snapshot_date >= ? AND snapshot_date <= ? GROUP BY torn_user_id
      ) e ON p.torn_user_id = e.torn_user_id AND p.snapshot_date = e.max_date
    `).bind(...tornUserIds, fromDate, toDate).all(),
  ]);

  const start = {};
  for (const r of startRows.results || []) start[r.torn_user_id] = r;
  const deltas = {};
  for (const r of endRows.results || []) {
    const s = start[r.torn_user_id] || {};
    deltas[r.torn_user_id] = {
      xanax: Math.max(0, (r.xanax ?? 0) - (s.xanax ?? 0)),
      energy_drinks: Math.max(0, (r.energy_drinks ?? 0) - (s.energy_drinks ?? 0)),
      energy_refills: Math.max(0, (r.energy_refills ?? 0) - (s.energy_refills ?? 0)),
      overdoses: Math.max(0, (r.overdoses ?? 0) - (s.overdoses ?? 0)),
    };
  }
  return deltas;
}

// Per-member + faction-wide totals. Only covers members who either attacked
// in the chain or used the faction armory during its window — a member who
// used ONLY their own personal xanax/cans and never attacked or touched the
// armory has no signal tying them to this chain at all, so they're out of
// scope (same boundary war tracking's armory-only-members handling draws).
async function computeChainEconomics(env, session) {
  const toTs = session.ended_at ?? Math.floor(Date.now() / 1000);

  const [{ results: attackRows }, { results: armoryRows }] = await Promise.all([
    env.DB.prepare(
      `SELECT attacker_id, COALESCE(MAX(attacker_name), '') AS attacker_name, COUNT(*) AS attacks, SUM(COALESCE(respect_gain,0)) AS respect
       FROM chain_watch_attacks WHERE session_id = ? GROUP BY attacker_id`
    ).bind(session.id).all(),
    env.DB.prepare(
      `SELECT torn_user_id, COALESCE(MAX(username), '') AS username, item_name, COUNT(*) AS used_qty
       FROM chain_watch_armory_usage WHERE session_id = ? GROUP BY torn_user_id, item_name`
    ).bind(session.id).all(),
  ]);

  const memberMap = new Map();
  function getRow(id, name) {
    if (!memberMap.has(id)) {
      memberMap.set(id, {
        torn_user_id: id, username: name || `#${id}`,
        attacks: 0, respect: 0, energy_out: 0,
        faction_xanax: 0, faction_cans: 0, faction_energy_in: 0,
        personal_energy_in: 0, combined_energy_in: 0, overdoses: 0,
      });
    } else if (name) {
      memberMap.get(id).username = name;
    }
    return memberMap.get(id);
  }

  for (const r of attackRows || []) {
    const row = getRow(r.attacker_id, r.attacker_name);
    row.attacks = r.attacks;
    row.respect = r.respect || 0;
    row.energy_out = r.attacks * 25;
  }

  for (const r of armoryRows || []) {
    const kind = energyArmoryKind(r.item_name);
    if (!kind) continue;
    const row = getRow(r.torn_user_id, r.username);
    if (kind === 'xanax') row.faction_xanax += r.used_qty;
    else row.faction_cans += r.used_qty;
  }
  for (const row of memberMap.values()) {
    row.faction_energy_in = row.faction_xanax * ENERGY_PER_XANAX + row.faction_cans * ENERGY_PER_CAN;
  }

  const memberIds = [...memberMap.keys()];
  const personalDeltas = await fetchPersonalStatDeltas(env, memberIds, session.started_at, toTs);

  // Energy refills are a paid, non-armory action — entirely personal, no
  // faction-usage portion to subtract. Donator refills for 150, everyone
  // else 100; status is fetched live (best-effort) only for members who
  // actually refilled, not the whole roster.
  const refillUsers = [...memberMap.keys()].filter(id => (personalDeltas[id]?.energy_refills || 0) > 0);
  const donatorStatus = {};
  for (const id of refillUsers) {
    const profile = await fetchTornUserProfile(env, id).catch(() => null);
    donatorStatus[id] = !!profile?.donator;
  }

  for (const [id, row] of memberMap) {
    const d = personalDeltas[id] || { xanax: 0, energy_drinks: 0, energy_refills: 0, overdoses: 0 };
    // Only the portion NOT already counted as faction-armory usage counts as
    // "personal" — otherwise an armory-sourced Xanax would be counted twice
    // once the two numbers are added into the combined total.
    const personalXanax = Math.max(0, d.xanax - row.faction_xanax);
    const personalCans = Math.max(0, d.energy_drinks - row.faction_cans);
    const refillEnergy = (d.energy_refills || 0) * (donatorStatus[id] ? ENERGY_PER_REFILL_DONATOR : ENERGY_PER_REFILL);
    row.personal_energy_in = personalXanax * ENERGY_PER_XANAX + personalCans * ENERGY_PER_CAN + refillEnergy;
    row.combined_energy_in = row.faction_energy_in + row.personal_energy_in;
    row.overdoses = d.overdoses;
  }

  // Resolve any member who still has no username (armory log sometimes
  // precedes a faction_members row existing) from the roster as a fallback.
  const unresolvedIds = [...memberMap.values()].filter(m => !m.username || m.username.startsWith('#')).map(m => m.torn_user_id);
  if (unresolvedIds.length) {
    const ph = unresolvedIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT torn_user_id, username FROM faction_members WHERE torn_user_id IN (${ph})`
    ).bind(...unresolvedIds).all();
    for (const r of results || []) {
      const row = memberMap.get(r.torn_user_id);
      if (row) row.username = r.username;
    }
  }

  const members = [...memberMap.values()].sort((a, b) => b.attacks - a.attacks);
  const totals = members.reduce((acc, m) => ({
    attacks: acc.attacks + m.attacks,
    energy_out: acc.energy_out + m.energy_out,
    faction_energy_in: acc.faction_energy_in + m.faction_energy_in,
    personal_energy_in: acc.personal_energy_in + m.personal_energy_in,
    combined_energy_in: acc.combined_energy_in + m.combined_energy_in,
    overdoses: acc.overdoses + m.overdoses,
  }), { attacks: 0, energy_out: 0, faction_energy_in: 0, personal_energy_in: 0, combined_energy_in: 0, overdoses: 0 });

  return { members, totals };
}

// GET /api/chain-watcher/economics?faction_id=X — any member. Shows the
// most recent session for the faction regardless of status, so the numbers
// don't just disappear the moment a chain ends.
export async function getChainEconomics(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    const session = await env.DB.prepare(
      `SELECT * FROM chain_watch_sessions WHERE faction_id = ? ORDER BY id DESC LIMIT 1`
    ).bind(factionId).first();
    if (!session) return jsonResponse({ session: null });

    const economics = await computeChainEconomics(env, session);
    return jsonResponse({
      session: { id: session.id, status: session.status, started_at: session.started_at, ended_at: session.ended_at },
      backfillStatus: session.backfill_status,
      backfillNote: session.backfill_note,
      ...economics,
    });
  } catch (err) {
    console.error('getChainEconomics error:', err);
    return errorResponse('Failed to compute chain economics', 500);
  }
}

// One-off manual catch-up: pages all the way back through the attack log
// and armory news from the chain's actual start, instead of waiting for the
// routine per-poll sync to close the gap incrementally (useful right after
// turning this feature on, or any time a chain ran mostly unwatched).
// Runs in the background via ctx.waitUntil — the request returns
// immediately, progress/result is polled via getChainEconomics' session
// fields (backfillStatus/backfillNote).
async function runChainEconomicsBackfill(env, session, factionId) {
  try {
    // A single syncChainAttacks call is capped at BACKFILL_LOOKBACK_PAGES —
    // not enough on its own for a long, high-volume chain (the attack feed
    // includes every attack by/against the faction, not just chain hits, so
    // a 48h/95-member chain can have far more rows than its own hit count).
    // Resuming across passes (via resumeFromTs, persisted as
    // backfill_oldest_ts between passes) instead of one fixed-size scan
    // means this either reaches the actual chain start or says plainly that
    // it didn't, rather than silently stopping partway through.
    let resumeFromTs = session.backfill_oldest_ts || null;
    let attacksTotal = 0;
    let reachedStart = false;
    for (let pass = 0; pass < BACKFILL_MAX_PASSES; pass++) {
      const result = await syncChainAttacks(env, session, factionId, Number.MAX_SAFE_INTEGER, {
        force: true, maxPages: BACKFILL_LOOKBACK_PAGES, resumeFromTs,
        onProgress: ({ page, newAttacks }) => env.DB.prepare(`UPDATE chain_watch_sessions SET backfill_note = ? WHERE id = ?`)
          .bind(`Scanning attacks… pass ${pass + 1}/${BACKFILL_MAX_PASSES}, page ${page} — ${attacksTotal + newAttacks} new so far`, session.id).run(),
      });
      attacksTotal += result.newAttacks ?? 0;
      await env.DB.prepare(`UPDATE chain_watch_sessions SET backfill_note = ? WHERE id = ?`)
        .bind(`Scanning attacks… ${attacksTotal} new so far (pass ${pass + 1}/${BACKFILL_MAX_PASSES})`, session.id).run();
      if (result.reachedSessionStart) { reachedStart = true; break; }
      if (!result.oldestTsSeen) break;
      resumeFromTs = result.oldestTsSeen;
      await env.DB.prepare(`UPDATE chain_watch_sessions SET backfill_oldest_ts = ? WHERE id = ?`)
        .bind(resumeFromTs, session.id).run();
    }

    if (!reachedStart) {
      await env.DB.prepare(
        `UPDATE chain_watch_sessions SET backfill_status = 'done', backfill_note = ? WHERE id = ?`
      ).bind(`Stopped before reaching chain start — ${attacksTotal} attacks scanned. Run Backfill again to continue from there.`, session.id).run();
      return;
    }

    await env.DB.prepare(`UPDATE chain_watch_sessions SET backfill_oldest_ts = NULL, backfill_note = ? WHERE id = ?`)
      .bind(`Reached chain start (${attacksTotal} attacks) — checking armory…`, session.id).run();

    const armoryResult = await syncChainArmory(env, session, factionId, {
      force: true, maxPages: ARMORY_BACKFILL_LOOKBACK_PAGES,
    });
    const armoryNote = armoryResult.reachedStart
      ? `${armoryResult.newUsage ?? 0} armory action(s)`
      : `${armoryResult.newUsage ?? 0} armory action(s) (didn't reach chain start — run Backfill again)`;

    await env.DB.prepare(
      `UPDATE chain_watch_sessions SET backfill_status = 'done', backfill_note = ? WHERE id = ?`
    ).bind(`Done — ${attacksTotal} attacks, ${armoryNote} scanned from chain start.`, session.id).run();
  } catch (err) {
    console.error('runChainEconomicsBackfill error:', err);
    await env.DB.prepare(
      `UPDATE chain_watch_sessions SET backfill_status = 'error', backfill_note = ? WHERE id = ?`
    ).bind(`Failed: ${err.message}`, session.id).run();
  }
}

// POST /api/chain-watcher/economics/backfill  { faction_id } — leadership-only
export async function backfillChainEconomics(request, env, user, ctx) {
  try {
    const body = await request.json();
    const factionId = validFactionId(body.faction_id);
    if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

    const session = await env.DB.prepare(
      `SELECT * FROM chain_watch_sessions WHERE faction_id = ? ORDER BY id DESC LIMIT 1`
    ).bind(factionId).first();
    if (!session) return errorResponse('No chain watch session found for this faction', 404);
    if (session.backfill_status === 'running') return errorResponse('A backfill is already running for this chain', 409);

    await env.DB.prepare(
      `UPDATE chain_watch_sessions SET backfill_status = 'running', backfill_note = 'Starting…' WHERE id = ?`
    ).bind(session.id).run();

    ctx.waitUntil(runChainEconomicsBackfill(env, session, factionId));

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('backfillChainEconomics error:', err);
    return errorResponse('Failed to start backfill', 500);
  }
}

// Every viewer's poll (not just whichever one won the check above) gets to
// see a just-landed bonus hit, so the "notifier" isn't limited to the one
// request that happened to detect it.
async function fetchRecentBonusAwards(env, sessionId) {
  const cutoff = Math.floor(Date.now() / 1000) - BONUS_NOTICE_WINDOW_SECONDS;
  const { results } = await env.DB.prepare(
    `SELECT d.chain_position, d.torn_user_id, d.merit_type, d.source, COALESCE(fm.username, 'Unknown') AS username
     FROM chain_watch_bonus_detections d
     LEFT JOIN faction_members fm ON fm.torn_user_id = d.torn_user_id
     WHERE d.session_id = ? AND d.detected_at >= ?
     ORDER BY d.detected_at ASC`
  ).bind(sessionId, cutoff).all();
  return results || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/discord/chain-watcher/live?faction_id=X — bot-facing, shared-secret
// auth. No website session gate: the Discord bot tracks its own per-faction
// watch state (see OccultusBot's chainWatchers map) independently of the
// website's leader-scheduled sessions, so it polls this directly whenever
// its own /chainwatcher command is active for that faction.
// ─────────────────────────────────────────────────────────────────────────────
export async function getLiveStatusForBot(request, env) {
  if (!checkChainBotSecret(request, env)) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    return jsonResponse(await fetchLiveChainFromTorn(env, factionId));
  } catch (err) {
    console.error('getLiveStatusForBot error:', err);
    return errorResponse(err.status ? err.message : `Torn API error: ${err.message}`, err.status || 502);
  }
}

// Current hour + the LITERAL next hour's assignment (no skip-ahead) — the
// bot's hourly ping needs to tell apart three distinct cases for the next
// hour specifically: nobody signed up (a gap — announce it, don't silently
// search further ahead for someone), the same person covering back-to-back
// (double duty), or a genuine handoff to someone else. Deliberately NOT the
// "collapse consecutive hours / skip past gaps" rule the website's own
// WatcherBanner uses for its own different purpose (a running summary of who
// has the chain covered) — that's wrong for a ping that fires fresh every
// hour and would otherwise present someone 3 hours out as if they're "up
// next" while the hour right after this one sits silently unclaimed.
async function computeCurrentWatcher(env, factionId) {
  const hour = 3600;
  // The bot's ping fires 5 minutes BEFORE each hour (see startChainWatcher),
  // to announce the handoff just ahead of it happening — so "current" here
  // means the slot about to start, not the one about to end. Plain wall-
  // clock `now` at :55 still falls inside the ending hour, which produced
  // exactly that bug: at 00:55, it announced the 00:00 watcher as "current"
  // (already finishing) and the 01:00 watcher as "next" (already starting).
  // A small forward offset — comfortably past the 5-minute early-fire
  // window but nowhere near the following hour's own early-fire window —
  // pushes `now` past the boundary so curSlot resolves to the upcoming hour.
  const nowSecs = Math.floor(Date.now() / 1000) + 10 * 60;
  const curSlot = Math.floor(nowSecs / hour) * hour;
  const nextSlot = curSlot + hour;

  const { results } = await env.DB.prepare(
    `SELECT s.slot_start, s.torn_user_id,
       COALESCE(
         (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id AND faction_id = s.faction_id LIMIT 1),
         (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id ORDER BY is_active DESC LIMIT 1)
       ) AS username,
       dl.discord_id
     FROM chain_watch_shifts s
     LEFT JOIN users u ON u.torn_user_id = s.torn_user_id
     LEFT JOIN discord_links dl ON dl.user_id = u.id
     WHERE s.faction_id = ? AND s.slot_start IN (?, ?)`
  ).bind(factionId, curSlot, nextSlot).all();

  const byStart = new Map((results || []).map(r => [r.slot_start, r]));
  const current = byStart.get(curSlot) || null;
  const next = byStart.get(nextSlot) || null;

  return {
    current: current ? { torn_user_id: current.torn_user_id, username: current.username, discord_id: current.discord_id || null } : null,
    next: next ? { torn_user_id: next.torn_user_id, username: next.username, discord_id: next.discord_id || null } : null,
    currentSlot: curSlot,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/discord/chain-watcher/watcher?faction_id=X — bot-facing, shared-
// secret auth. Replaces the Google Sheet the bot used to read for its hourly
// shift-rotation ping — sign-ups now happen on the website.
// ─────────────────────────────────────────────────────────────────────────────
export async function getCurrentWatcherForBot(request, env) {
  if (!checkChainBotSecret(request, env)) return errorResponse('Unauthorized', 401);

  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    return jsonResponse(await computeCurrentWatcher(env, factionId));
  } catch (err) {
    console.error('getCurrentWatcherForBot error:', err);
    return errorResponse('Failed to compute current watcher', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/shifts?faction_id=X&from=unix&to=unix
// Claimed shifts in range (an hour with no row is open). Defaults to a window
// starting an hour ago through 7 days out. Resolves the username from
// faction_members (not users) via a scalar subquery rather than a plain JOIN,
// for two reasons found the hard way: (1) a member can be assigned a shift
// without ever having a website account — an INNER JOIN against users
// silently dropped those rows while still enforcing the one-per-hour UNIQUE
// constraint, making an already-claimed slot look open; (2) leadership signs
// up for shifts across all three factions, not just their own roster's — a
// plain JOIN requiring faction_members.faction_id to match the shift's own
// faction_id dropped THEM too (e.g. an Occ1 leader self-signing up for an
// Occ2 slot). The subquery prefers a faction_members row matching the
// shift's own faction, falling back to any row for that user (so a
// cross-faction signup still resolves a username) rather than requiring one.
// ─────────────────────────────────────────────────────────────────────────────
export async function listShifts(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  const nowSecs = Math.floor(Date.now() / 1000);
  const from = parseInt(url.searchParams.get('from'), 10) || (nowSecs - 3600);
  const to   = parseInt(url.searchParams.get('to'), 10)   || (from + 7 * 86400);

  try {
    const result = await env.DB.prepare(
      `SELECT s.id, s.slot_start, s.torn_user_id, s.note,
         COALESCE(
           (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id AND faction_id = s.faction_id LIMIT 1),
           (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id ORDER BY is_active DESC LIMIT 1)
         ) AS username
       FROM chain_watch_shifts s
       WHERE s.faction_id = ? AND s.slot_start >= ? AND s.slot_start < ?
       ORDER BY s.slot_start ASC`
    ).bind(factionId, from, to).all();

    return jsonResponse({ shifts: result.results || [] });
  } catch (err) {
    console.error('listShifts error:', err);
    return errorResponse('Failed to fetch shifts', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/shifts  { faction_id, slot_start, torn_user_id? }
// Claims an open hour slot for the calling member. Once claimed, only
// leadership can free it again (see cancelShift) — there's no self-service
// cancel, by design: the frontend makes members confirm that before signing up.
// A leader may pass torn_user_id to assign the slot to someone else (e.g. a
// member who asked a leader to sign them up) — anyone else attempting that
// is rejected.
// ─────────────────────────────────────────────────────────────────────────────
export async function signUpShift(request, env, user) {
  try {
    const body = await request.json();
    const factionId = validFactionId(body.faction_id);
    const slotStart = parseInt(body.slot_start, 10);

    if (!factionId) return errorResponse('Invalid or missing faction_id', 400);
    if (!slotStart || slotStart % 3600 !== 0) {
      return errorResponse('slot_start must be a unix timestamp on the hour', 400);
    }

    const currentHour = Math.floor(Date.now() / 3600000) * 3600;
    if (slotStart < currentHour) return errorResponse('Cannot sign up for a past shift', 400);

    let targetUserId = user.tornUserId;
    if (body.torn_user_id != null && parseInt(body.torn_user_id, 10) !== user.tornUserId) {
      if (!user.isLeader && !user.isAdmin && !user.isOwner) {
        return errorResponse('Leadership access required to assign another member', 403);
      }
      targetUserId = parseInt(body.torn_user_id, 10);
      const target = await env.DB.prepare(
        `SELECT torn_user_id FROM faction_members WHERE torn_user_id = ? AND faction_id = ? AND is_active = 1`
      ).bind(targetUserId, factionId).first();
      if (!target) return errorResponse('That member is not an active member of this faction', 400);
    }

    await env.DB.prepare(
      `INSERT INTO chain_watch_shifts (faction_id, slot_start, torn_user_id) VALUES (?, ?, ?)`
    ).bind(factionId, slotStart, targetUserId).run();

    return jsonResponse({ success: true });
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      return errorResponse('That shift is already taken', 409);
    }
    console.error('signUpShift error:', err);
    return errorResponse('Failed to sign up for shift', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/members?faction_id=X — leadership-only.
// Plain active-member roster for the shift-assign picker.
// ─────────────────────────────────────────────────────────────────────────────
export async function listActiveMembers(request, env) {
  const url = new URL(request.url);
  const factionId = validFactionId(url.searchParams.get('faction_id'));
  if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

  try {
    const { results } = await env.DB.prepare(
      `SELECT torn_user_id, username FROM faction_members WHERE faction_id = ? AND is_active = 1 ORDER BY username ASC`
    ).bind(factionId).all();
    return jsonResponse({ members: results || [] });
  } catch (err) {
    console.error('listActiveMembers error:', err);
    return errorResponse('Failed to fetch members', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/chain-watcher/shifts/:id — leadership-only (enforced in
// routes.js; checked again here too). A member who signed up can't remove
// themselves — only leadership frees a slot (e.g. a no-show).
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelShift(request, env, user) {
  try {
    if (!user.isLeader && !user.isAdmin && !user.isOwner) {
      return errorResponse('Leadership access required', 403);
    }

    const url = new URL(request.url);
    const id = parseInt(url.pathname.split('/').pop(), 10);
    if (!id) return errorResponse('Invalid shift id', 400);

    const result = await env.DB.prepare(`DELETE FROM chain_watch_shifts WHERE id = ?`).bind(id).run();
    if (!result.meta.changes) return errorResponse('Shift not found', 404);

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('cancelShift error:', err);
    return errorResponse('Failed to cancel shift', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/shifts/:id/note  { note }
// Leadership-only. Record of what happened on a shift (e.g. a no-show) —
// surfaced to leadership in the frontend, not shown to regular members.
// ─────────────────────────────────────────────────────────────────────────────
export async function setShiftNote(request, env) {
  try {
    const match = new URL(request.url).pathname.match(/\/api\/chain-watcher\/shifts\/(?<id>\d+)\/note/);
    const id = match?.groups?.id;
    if (!id) return errorResponse('Invalid shift id', 400);

    const { note } = await request.json();

    const result = await env.DB.prepare(
      `UPDATE chain_watch_shifts SET note = ? WHERE id = ?`
    ).bind(note || null, id).run();

    if (!result.meta.changes) return errorResponse('Shift not found', 404);
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('setShiftNote error:', err);
    return errorResponse('Failed to save note', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chain-watcher/shifts/:id/reassign  { torn_user_id, reason }
// Leadership-only. Changes who gets credit for an ALREADY-COMPLETED shift —
// e.g. the signed-up member never showed and someone else actually covered
// it. Only works on a past shift (an upcoming one is still just Remove +
// re-sign-up); a reason is mandatory and becomes the shift's note, since
// that's exactly what it's explaining. original_torn_user_id is set once
// (COALESCE) so it keeps pointing at who was there first even if a shift
// gets reassigned more than once.
// ─────────────────────────────────────────────────────────────────────────────
export async function reassignShift(request, env, user) {
  try {
    if (!user.isLeader && !user.isAdmin && !user.isOwner) {
      return errorResponse('Leadership access required', 403);
    }

    const match = new URL(request.url).pathname.match(/\/api\/chain-watcher\/shifts\/(?<id>\d+)\/reassign/);
    const id = match?.groups?.id;
    if (!id) return errorResponse('Invalid shift id', 400);

    const body = await request.json();
    const newUserId = parseInt(body.torn_user_id, 10);
    const reason = (body.reason || '').trim();
    if (!newUserId) return errorResponse('torn_user_id is required', 400);
    if (!reason) return errorResponse('A reason is required to reassign a past shift', 400);

    const shift = await env.DB.prepare(
      `SELECT faction_id, slot_start, torn_user_id FROM chain_watch_shifts WHERE id = ?`
    ).bind(id).first();
    if (!shift) return errorResponse('Shift not found', 404);

    const currentHour = Math.floor(Date.now() / 3600000) * 3600;
    if (shift.slot_start >= currentHour) {
      return errorResponse('This shift hasn’t completed yet — remove and re-assign it instead', 400);
    }

    const target = await env.DB.prepare(
      `SELECT torn_user_id FROM faction_members WHERE torn_user_id = ? AND faction_id = ? AND is_active = 1`
    ).bind(newUserId, shift.faction_id).first();
    if (!target) return errorResponse('That member is not an active member of this faction', 400);

    await env.DB.prepare(
      `UPDATE chain_watch_shifts
       SET torn_user_id = ?, note = ?,
           original_torn_user_id = COALESCE(original_torn_user_id, ?),
           reassigned_by = ?, reassigned_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(newUserId, reason, shift.torn_user_id, user.userId, id).run();

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('reassignShift error:', err);
    return errorResponse('Failed to reassign shift', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron: DMs anyone signed up for a chain-watch shift starting in about an
// hour, if they've linked Discord. Runs every 10 min; the check window (50-70
// min out) is wider than the cron interval so a shift can never slip through
// between two ticks, and reminder_sent_at stops the same shift firing twice.
// ─────────────────────────────────────────────────────────────────────────────
export async function sendShiftReminders(env) {
  if (!env.DISCORD_BOT_TOKEN) {
    console.warn('[chain-watch reminders] no DISCORD_BOT_TOKEN configured, skipping');
    return { sent: 0, failed: 0 };
  }

  const nowSecs = Math.floor(Date.now() / 1000);
  const windowStart = nowSecs + 50 * 60;
  const windowEnd = nowSecs + 70 * 60;

  const { results } = await env.DB.prepare(
    `SELECT s.id, s.faction_id, s.slot_start, dl.discord_id
     FROM chain_watch_shifts s
     JOIN users u ON u.torn_user_id = s.torn_user_id
     JOIN discord_links dl ON dl.user_id = u.id
     WHERE s.reminder_sent_at IS NULL AND s.slot_start >= ? AND s.slot_start < ?
       AND NOT EXISTS (
         -- Skip anyone already on shift the hour immediately before this
         -- one — if they're the current watcher continuing straight into
         -- the next hour, they're already actively watching and don't
         -- need a "starts in an hour" heads up.
         SELECT 1 FROM chain_watch_shifts prev
         WHERE prev.faction_id = s.faction_id AND prev.torn_user_id = s.torn_user_id
           AND prev.slot_start = s.slot_start - 3600
       )`
  ).bind(windowStart, windowEnd).all();

  let sent = 0, failed = 0;
  for (const shift of (results || [])) {
    try {
      const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
        method: 'POST',
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: shift.discord_id }),
      });
      if (!dmRes.ok) throw new Error(`open DM channel: HTTP ${dmRes.status}`);
      const dmChannel = await dmRes.json();

      const factionName = FACTION_NAMES[shift.faction_id] || `faction ${shift.faction_id}`;
      // Discord's <t:...> timestamp renders in each viewer's own local time/format automatically.
      const content = `⏰ Your ${factionName} chain watch shift starts <t:${shift.slot_start}:t> (in about an hour). Thanks for covering it!`;

      const msgRes = await fetch(`${DISCORD_API}/channels/${dmChannel.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!msgRes.ok) throw new Error(`send DM: HTTP ${msgRes.status}`);
      sent++;
    } catch (err) {
      failed++;
      console.error(`[chain-watch reminders] failed for shift ${shift.id}:`, err.message);
    } finally {
      // Mark attempted either way — a failure (e.g. DMs closed, not linked
      // properly) isn't worth retrying every 10 minutes for the same shift.
      await env.DB.prepare(`UPDATE chain_watch_shifts SET reminder_sent_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(shift.id).run();
    }
  }

  console.log(`[chain-watch reminders] ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

const WATCH_GAP_SECONDS = 3 * 86400; // 3+ days with nothing claimed = a separate watch

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chain-watcher/watch-totals?faction_id=X — leadership-only
// Groups every claimed shift for this faction into separate "watches" by
// gap — a run of claimed hours broken by 3+ days with nothing claimed is
// treated as a different (future) watch rather than lumped into the current
// one's totals, picks whichever group is "current", and returns per-member
// completed/upcoming/total counts for just that group.
// ─────────────────────────────────────────────────────────────────────────────
export async function getWatchTotals(request, env) {
  try {
    const url = new URL(request.url);
    const factionId = validFactionId(url.searchParams.get('faction_id'));
    if (!factionId) return errorResponse('Invalid or missing faction_id', 400);

    const { results } = await env.DB.prepare(
      `SELECT s.slot_start, s.torn_user_id, s.note,
         COALESCE(
           (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id AND faction_id = s.faction_id LIMIT 1),
           (SELECT username FROM faction_members WHERE torn_user_id = s.torn_user_id ORDER BY is_active DESC LIMIT 1)
         ) AS username
       FROM chain_watch_shifts s
       WHERE s.faction_id = ?
       ORDER BY s.slot_start ASC`
    ).bind(factionId).all();

    const shifts = results || [];
    if (!shifts.length) {
      return jsonResponse({ watchStart: null, watchEnd: null, totalShifts: 0, members: [] });
    }

    // Split into groups wherever two consecutive claimed hours are more
    // than WATCH_GAP_SECONDS apart.
    const groups = [];
    let current = [shifts[0]];
    for (let i = 1; i < shifts.length; i++) {
      if (shifts[i].slot_start - shifts[i - 1].slot_start > WATCH_GAP_SECONDS) {
        groups.push(current);
        current = [];
      }
      current.push(shifts[i]);
    }
    groups.push(current);

    const nowSecs = Math.floor(Date.now() / 1000);
    // Prefer the group that actually brackets "now"; otherwise the most
    // recently-started group that's already underway; otherwise (nothing
    // has started yet) the earliest upcoming one.
    let activeGroup = groups.find(g => g[0].slot_start <= nowSecs && nowSecs < g[g.length - 1].slot_start + HOUR);
    if (!activeGroup) {
      const pastGroups = groups.filter(g => g[0].slot_start <= nowSecs);
      activeGroup = pastGroups.length ? pastGroups[pastGroups.length - 1] : groups[0];
    }

    const totals = new Map(); // torn_user_id -> { username, completed, upcoming, notes }
    for (const s of activeGroup) {
      const entry = totals.get(s.torn_user_id) || { torn_user_id: s.torn_user_id, username: s.username, completed: 0, upcoming: 0, notes: [] };
      if (s.slot_start + HOUR <= nowSecs) entry.completed++;
      else entry.upcoming++;
      if (s.note) entry.notes.push({ slot_start: s.slot_start, note: s.note });
      totals.set(s.torn_user_id, entry);
    }

    const members = [...totals.values()]
      .map(m => ({ ...m, total: m.completed + m.upcoming }))
      .sort((a, b) => b.total - a.total);

    return jsonResponse({
      watchStart: activeGroup[0].slot_start,
      watchEnd: activeGroup[activeGroup.length - 1].slot_start + HOUR,
      totalShifts: activeGroup.length,
      members,
    });
  } catch (err) {
    console.error('getWatchTotals error:', err);
    return errorResponse('Failed to compute watch totals', 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Target — mirrors OccultusBot's findChainUser (the "attack this
// hospital-out target" suggestion it posts when a chain is about to drop):
// a small shared pool of arranged chain-saving accounts, not regular faction
// members. Shared across all three factions, same as the bot's own
// hardcoded list, rather than split per faction. Any member can check it;
// only leadership can edit the pool.
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTornUserProfile(env, tornUserId) {
  const data = await fetchWithRetry(
    `${TORN_API_BASE}/user/${tornUserId}/profile?striptags=true&comment=OccHub`,
    () => getRandomUserApiKey(env),
    env
  );
  return data?.profile || null;
}

// GET /api/chain-watcher/quick-target-pool — leadership-only
export async function listQuickTargets(request, env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT torn_user_id, username, added_at FROM chain_save_targets ORDER BY added_at DESC`
    ).all();
    return jsonResponse({ targets: results || [] });
  } catch (err) {
    console.error('listQuickTargets error:', err);
    return errorResponse('Failed to fetch the quick target pool', 500);
  }
}

// POST /api/chain-watcher/quick-target-pool  { torn_user_id } — leadership-only
export async function addQuickTarget(request, env, user) {
  try {
    const body = await request.json();
    const tornUserId = parseInt(body.torn_user_id, 10);
    if (!tornUserId) return errorResponse('Invalid or missing torn_user_id', 400);

    let username = null;
    try {
      const profile = await fetchTornUserProfile(env, tornUserId);
      username = profile?.name || null;
    } catch (e) {
      console.error('addQuickTarget: profile lookup failed:', e.message);
    }

    const { meta } = await env.DB.prepare(
      `INSERT OR IGNORE INTO chain_save_targets (torn_user_id, username, added_by) VALUES (?, ?, ?)`
    ).bind(tornUserId, username, user.userId).run();

    if (!meta?.changes) return errorResponse('That user is already in the pool', 409);
    return jsonResponse({ success: true, username });
  } catch (err) {
    console.error('addQuickTarget error:', err);
    return errorResponse('Failed to add quick target', 500);
  }
}

// DELETE /api/chain-watcher/quick-target-pool?torn_user_id=X — leadership-only
export async function removeQuickTarget(request, env) {
  try {
    const url = new URL(request.url);
    const tornUserId = parseInt(url.searchParams.get('torn_user_id'), 10);
    if (!tornUserId) return errorResponse('Invalid or missing torn_user_id', 400);

    await env.DB.prepare(`DELETE FROM chain_save_targets WHERE torn_user_id = ?`).bind(tornUserId).run();
    return jsonResponse({ success: true });
  } catch (err) {
    console.error('removeQuickTarget error:', err);
    return errorResponse('Failed to remove quick target', 500);
  }
}

// GET /api/chain-watcher/quick-target — any member. Shuffles the pool and
// returns the first account currently out of hospital, not travelling/
// jailed (Torn's `status.state === 'Okay'`) — the exact same check the
// bot's findChainUser uses. Best-effort: a dead/rate-limited key or a
// lookup failure on one candidate just moves on to the next rather than
// failing the whole request.
export async function getQuickTarget(request, env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT torn_user_id, username FROM chain_save_targets`
    ).all();
    const pool = [...(results || [])].sort(() => Math.random() - 0.5);

    for (const candidate of pool) {
      try {
        const profile = await fetchTornUserProfile(env, candidate.torn_user_id);
        if (profile?.status?.state === 'Okay') {
          return jsonResponse({
            target: { torn_user_id: candidate.torn_user_id, username: profile.name || candidate.username },
          });
        }
      } catch (e) {
        console.error(`getQuickTarget: check failed for ${candidate.torn_user_id}:`, e.message);
      }
    }

    return jsonResponse({ target: null });
  } catch (err) {
    console.error('getQuickTarget error:', err);
    return errorResponse('Failed to find a quick target', 500);
  }
}
