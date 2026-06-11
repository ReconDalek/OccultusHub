import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

// Upgrade definitions — must stay in sync with src/components/Sanctum/sanctumData.js
const UPGRADE_DEFS = {
  // Tier 1
  altar:           { baseCost: 50,            costMult: 1.15, production: 0.1,      clickBonus: 0, globalMult: 0    },
  familiar:        { baseCost: 100,           costMult: 1.20, production: 0,        clickBonus: 2, globalMult: 0    },
  soul_fragments:  { baseCost: 400,           costMult: 1.15, production: 0.5,      clickBonus: 0, globalMult: 0    },
  ley_line:        { baseCost: 4000,          costMult: 1.15, production: 5,        clickBonus: 0, globalMult: 0    },
  grimoire:        { baseCost: 20000,         costMult: 1.30, production: 0,        clickBonus: 0, globalMult: 0.10 },
  shadow_pact:     { baseCost: 200000,        costMult: 1.40, production: 0,        clickBonus: 0, globalMult: 0.25 },
  // Tier 2
  the_rift:        { baseCost: 2000000,       costMult: 1.15, production: 100,      clickBonus: 0, globalMult: 0    },
  blood_covenant:  { baseCost: 8000000,       costMult: 1.35, production: 0,        clickBonus: 0, globalMult: 0.20 },
  void_conduit:    { baseCost: 25000000,      costMult: 1.15, production: 600,      clickBonus: 0, globalMult: 0    },
  // Tier 3
  elder_seal:      { baseCost: 200000000,     costMult: 1.45, production: 0,        clickBonus: 0, globalMult: 0.50 },
  lich_throne:     { baseCost: 500000000,     costMult: 1.15, production: 4000,     clickBonus: 0, globalMult: 0    },
  void_ascension:  { baseCost: 5000000000,    costMult: 1.50, production: 0,        clickBonus: 0, globalMult: 1.00 },
  // Tier 4
  nexus:           { baseCost: 10000000000,   costMult: 1.12, production: 30000,    clickBonus: 0, globalMult: 0    },
  the_abyss:       { baseCost: 250000000000,  costMult: 1.12, production: 250000,   clickBonus: 0, globalMult: 0    },
  final_pact:      { baseCost: 100000000000,  costMult: 1.55, production: 0,        clickBonus: 0, globalMult: 2.50 },
  // Tier 5
  primordial_rift: { baseCost: 5000000000000, costMult: 1.10, production: 2500000,  clickBonus: 0, globalMult: 0    },
};

const OFFLINE_CAP_SECONDS = 8 * 3600;

function computeStats(upgrades) {
  let baseProduction = 0;
  let clickPower = 1;
  let multiplier = 1;

  for (const [key, def] of Object.entries(UPGRADE_DEFS)) {
    const level = upgrades[key] || 0;
    baseProduction += level * def.production;
    clickPower += level * def.clickBonus;
    multiplier += level * def.globalMult;
  }

  return {
    essencePerSec: baseProduction * multiplier,
    clickPower,
  };
}

function upgradeCost(id, currentLevel) {
  const def = UPGRADE_DEFS[id];
  if (!def) return null;
  return Math.floor(def.baseCost * Math.pow(def.costMult, currentLevel));
}

function parseTS(str) {
  return new Date(str.replace(' ', 'T') + 'Z').getTime();
}

async function getOrCreateSave(db, userId) {
  let save = await db.prepare(
    'SELECT * FROM sanctum_saves WHERE user_id = ?'
  ).bind(userId).first();

  if (!save) {
    await db.prepare(
      `INSERT INTO sanctum_saves (user_id, essence, total_essence, upgrades)
       VALUES (?, 0, 0, '{}')`
    ).bind(userId).run();
    save = await db.prepare(
      'SELECT * FROM sanctum_saves WHERE user_id = ?'
    ).bind(userId).first();
  }

  return save;
}

function applyOffline(save) {
  const upgrades = JSON.parse(save.upgrades);
  const { essencePerSec, clickPower } = computeStats(upgrades);
  const now = Date.now();
  const lastActive = parseTS(save.last_active_at);
  const elapsed = Math.min((now - lastActive) / 1000, OFFLINE_CAP_SECONDS);
  const gained = elapsed * essencePerSec;

  return {
    essence: save.essence + gained,
    totalEssence: save.total_essence + gained,
    essencePerSec,
    clickPower,
    upgrades,
    offlineGained: gained,
    offlineSeconds: elapsed,
  };
}

export async function getState(request, env, user) {
  const save = await getOrCreateSave(env.DB, user.userId);
  const state = applyOffline(save);

  await env.DB.prepare(
    `UPDATE sanctum_saves
     SET essence = ?, total_essence = ?, last_active_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`
  ).bind(state.essence, state.totalEssence, user.userId).run();

  return jsonResponse({
    essence: state.essence,
    totalEssence: state.totalEssence,
    essencePerSec: state.essencePerSec,
    clickPower: state.clickPower,
    upgrades: state.upgrades,
    offlineGained: state.offlineGained,
    offlineSeconds: Math.floor(state.offlineSeconds),
  });
}

export async function click(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const clicks = Math.min(Math.max(1, Math.floor(body.clicks || 1)), 50);
  const clientEssence = body.currentEssence;
  const clientTotal   = body.currentTotal;

  const save = await getOrCreateSave(env.DB, user.userId);
  const state = applyOffline(save);
  const { clickPower } = computeStats(state.upgrades);
  const gained = clickPower * clicks;

  // Anchor to whichever is higher so local tick gains are never rolled back
  const base      = (typeof clientEssence === 'number' && clientEssence > state.essence) ? clientEssence : state.essence;
  const baseTotal = (typeof clientTotal   === 'number' && clientTotal   > state.totalEssence) ? clientTotal : state.totalEssence;
  const newEssence = base + gained;
  const newTotal   = baseTotal + gained;

  await env.DB.prepare(
    `UPDATE sanctum_saves
     SET essence = ?, total_essence = ?, last_active_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`
  ).bind(newEssence, newTotal, user.userId).run();

  return jsonResponse({ essence: newEssence, totalEssence: newTotal, gained });
}

export async function buyUpgrade(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const { upgradeId, currentEssence, currentTotal } = body;

  if (!UPGRADE_DEFS[upgradeId]) return errorResponse('Unknown upgrade', 400);

  const save = await getOrCreateSave(env.DB, user.userId);
  const state = applyOffline(save);
  const upgrades = state.upgrades;
  const currentLevel = upgrades[upgradeId] || 0;
  const cost = upgradeCost(upgradeId, currentLevel);

  // Use whichever value is higher: the client's local-tick value or the
  // DB value + offline accumulation. This prevents the tick-lag mismatch
  // from blocking purchases the player genuinely has enough essence for.
  const essence = (typeof currentEssence === 'number' && currentEssence > state.essence)
    ? currentEssence
    : state.essence;
  const total = (typeof currentTotal === 'number' && currentTotal > state.totalEssence)
    ? currentTotal
    : state.totalEssence;

  if (essence < cost) return errorResponse('Insufficient essence', 400);

  upgrades[upgradeId] = currentLevel + 1;
  const newEssence = essence - cost;
  const { essencePerSec, clickPower } = computeStats(upgrades);

  await env.DB.prepare(
    `UPDATE sanctum_saves
     SET essence = ?, total_essence = ?, upgrades = ?, last_active_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`
  ).bind(newEssence, total, JSON.stringify(upgrades), user.userId).run();

  return jsonResponse({
    essence: newEssence,
    totalEssence: state.totalEssence,
    essencePerSec,
    clickPower,
    upgrades,
    purchased: upgradeId,
    newLevel: currentLevel + 1,
  });
}

export async function sync(request, env, user) {
  return getState(request, env, user);
}

export async function getLeaderboard(request, env) {
  const rows = await env.DB.prepare(
    `SELECT u.username, s.total_essence, s.upgrades
     FROM sanctum_saves s
     JOIN users u ON u.id = s.user_id
     ORDER BY s.total_essence DESC
     LIMIT 20`
  ).all();

  return jsonResponse({ leaderboard: rows.results || [] });
}
