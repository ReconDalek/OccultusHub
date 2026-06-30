import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';

// ── Constants ────────────────────────────────────────────────────────────────

const SPECIES_BASE = {
  vorryn: { str: 7, agi: 6, vit: 5, arc: 4, res: 4, ess: 4 },
  saelix:  { str: 4, agi: 5, vit: 4, arc: 7, res: 3, ess: 7 },
  thrael:  { str: 5, agi: 3, vit: 7, arc: 3, res: 8, ess: 4 },
};

const NATURE_MODS = {
  feisty:  { str:  2, agi:  1, res: -2, vit: -1 },
  timid:   { res:  2, vit:  2, str: -2, agi: -2 },
  cunning: { arc:  2, agi:  2, vit: -2, str: -2 },
  stoic:   { res:  2, ess:  2, agi: -2, arc: -2 },
  feral:   { str:  3, arc:  1, res: -3, ess: -1 },
};

const NATURES  = Object.keys(NATURE_MODS);
const SPECIES  = Object.keys(SPECIES_BASE);
const STATS    = ['str', 'agi', 'vit', 'arc', 'res', 'ess'];

// Nature primary stat for nature revelation event
const NATURE_PRIMARY = {
  feisty: 'str', timid: 'res', cunning: 'arc', stoic: 'ess', feral: 'str',
};

const COOLDOWNS = {
  train: 6 * 60 * 60 * 1000,
  hunt:  4 * 60 * 60 * 1000,
  rest:  12 * 60 * 60 * 1000,
  duel:  2 * 60 * 60 * 1000,
};

const XP_GAIN = {
  train:    { min: 40, max: 80 },
  hunt:     { min: 20, max: 40 },
  duel_win: { min: 50, max: 100 },
  duel_loss:{ min: 10, max: 25 },
};

const SHARD_GAIN = {
  hunt_base:   { min: 30, max: 80 },
  duel_win:    { min: 50, max: 120 },
  wild_win:    { min: 30, max: 80 },
  shard_cache: { min: 50, max: 150 },
};

const STAGE_THRESHOLDS = { 1: 1, 2: 16, 3: 36 };

// Bond system
const NATURE_BOND_RATE = {
  feisty:  0.75,
  timid:   0.70,
  cunning: 0.90,
  stoic:   0.85,
  feral:   0.60,
};

const BOND_GAIN_RANGE = {
  train:     { min: 2, max: 4 },
  hunt:      { min: 1, max: 3 },
  rest:      { min: 3, max: 5 },
  duel_win:  { min: 2, max: 3 },
  duel_loss: { min: 0, max: 1 },
};

const SCROLL_REQUIRE_LEVEL = 5;
const SCROLL_REQUIRE_BOND  = 40; // Trusted tier

const LOGIN_EVENT_TYPES = [
  { type: 'void_surge',          weight: 35 },
  { type: 'shadow_encounter',    weight: 20 },
  { type: 'shard_cache',         weight: 20 },
  { type: 'nature_revelation',   weight: 10 },
  { type: 'omen',                weight: 10 },
  { type: 'resting_challenger',  weight: 5  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseTS(str) {
  if (!str) return null;
  return new Date(str.replace(' ', 'T') + 'Z').getTime();
}

function rollStats(species, nature) {
  const base = SPECIES_BASE[species];
  const mods = NATURE_MODS[nature];
  const stats = {};
  for (const stat of STATS) {
    const b = (base[stat] || 0) + (mods[stat] || 0);
    const variance = rand(-2, 2);
    stats[stat] = Math.max(1, b + variance);
  }
  return stats;
}

function xpToNext(level) {
  return level * 120;
}

function stageForLevel(level) {
  if (level >= 36) return 3;
  if (level >= 16) return 2;
  return 1;
}

function maxHp(vit) {
  return vit * 10;
}

function conditionEfficiency(familiar) {
  const hpRatio        = familiar.hp / familiar.max_hp;
  const happinessRatio = familiar.happiness / 100;
  return hpRatio * 0.4 + happinessRatio * 0.6;
}

function levelMultiplier(level) {
  return 1 + (level - 1) * 0.04;
}

function conditionGrade(efficiency) {
  if (efficiency >= 0.85) return 'Excellent';
  if (efficiency >= 0.65) return 'Good';
  if (efficiency >= 0.45) return 'Fair';
  if (efficiency >= 0.25) return 'Poor';
  return 'Critical';
}

async function applyBond(db, familiar, action) {
  const range = BOND_GAIN_RANGE[action];
  const base  = rand(range.min, range.max);
  const rate  = NATURE_BOND_RATE[familiar.nature] ?? 1;
  const gain  = Math.max(0, Math.round(base * rate));
  const newBond = Math.min(100, (familiar.bond || 0) + gain);
  if (gain > 0) {
    await db.prepare(`UPDATE familiars SET bond = ? WHERE id = ?`).bind(newBond, familiar.id).run();
  }
  return { bondGain: gain, newBond };
}

function pickWeighted(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.type;
  }
  return items[items.length - 1].type;
}

// ── Battle engine ────────────────────────────────────────────────────────────

function resolveBattle(a, b) {
  // Working copies with full HP
  const fc = { id: a.id, species: a.species, nature: a.nature,
    str: a.stat_str, agi: a.stat_agi, res: a.stat_res,
    hp: maxHp(a.stat_vit), maxHp: maxHp(a.stat_vit), happiness: a.happiness };
  const fd = { id: b.id, species: b.species, nature: b.nature,
    str: b.stat_str, agi: b.stat_agi, res: b.stat_res,
    hp: maxHp(b.stat_vit), maxHp: maxHp(b.stat_vit), happiness: b.happiness };

  // Happiness bonus: +5% damage per 20 happiness above 50
  function happinessBonus(f) {
    return f.happiness > 50 ? 1 + (f.happiness - 50) / 20 * 0.05 : 1;
  }

  const cFirst = fc.agi > fd.agi || (fc.agi === fd.agi && Math.random() < 0.5);
  const order = cFirst ? [fc, fd] : [fd, fc];
  const rounds = [];
  const MAX_ROUNDS = 40;

  for (let turn = 0; turn < MAX_ROUNDS && fc.hp > 0 && fd.hp > 0; turn++) {
    const attacker = order[turn % 2];
    const target   = attacker === fc ? fd : fc;

    // Timid: defensive dodge when HP below 50%
    if (target.nature === 'timid' && target.hp < target.maxHp * 0.5 && Math.random() < 0.12) {
      rounds.push({ turn: turn + 1, attacker: attacker.id, type: 'dodge', passive: 'timid_evasion', targetHp: target.hp, targetMaxHp: target.maxHp });
      continue;
    }

    // Cunning: dodge
    if (target.nature === 'cunning' && Math.random() < 0.15) {
      rounds.push({ turn: turn + 1, attacker: attacker.id, type: 'dodge', passive: 'cunning_dodge', targetHp: target.hp, targetMaxHp: target.maxHp });
      continue;
    }

    let effectiveStr = attacker.str;
    let effectiveRes = target.res;
    let passive = null;

    // Feisty: +25% STR when HP < 40%
    if (attacker.nature === 'feisty' && attacker.hp < attacker.maxHp * 0.4) {
      effectiveStr = Math.floor(effectiveStr * 1.25);
      passive = 'feisty_rage';
    }
    // Cunning: +15% STR when HP > 60% (patient precision)
    if (attacker.nature === 'cunning' && attacker.hp > attacker.maxHp * 0.6) {
      effectiveStr = Math.floor(effectiveStr * 1.15);
      if (!passive) passive = 'cunning_precision';
    }
    // Stoic: 1.4x RES
    if (target.nature === 'stoic') {
      effectiveRes = Math.floor(effectiveRes * 1.4);
      if (!passive) passive = 'stoic_fortified';
    }

    let dmg = Math.max(1, effectiveStr - Math.floor(effectiveRes / 2));
    dmg = Math.round(dmg * happinessBonus(attacker));

    // Feral: ±30% variance + first 3 rounds +20%
    if (attacker.nature === 'feral') {
      dmg = Math.max(1, Math.round(dmg * (0.7 + Math.random() * 0.6)));
      if (turn < 3) {
        dmg = Math.max(1, Math.round(dmg * 1.2));
        passive = 'feral_frenzy';
      }
    }

    // Timid: 15% dmg reduction when HP < 50%
    if (target.nature === 'timid' && target.hp < target.maxHp * 0.5) {
      dmg = Math.max(1, Math.round(dmg * 0.85));
    }

    target.hp = Math.max(0, target.hp - dmg);
    rounds.push({ turn: turn + 1, attacker: attacker.id, type: 'attack', damage: dmg, passive, targetHp: target.hp, targetMaxHp: target.maxHp });
  }

  let winnerId;
  if (fc.hp > fd.hp) winnerId = a.id;
  else if (fd.hp > fc.hp) winnerId = b.id;
  else winnerId = Math.random() < 0.5 ? a.id : b.id;

  return { winnerId, rounds, challengerHpLeft: fc.hp, defenderHpLeft: fd.hp };
}

// ── Wild familiar for shadow encounter events ────────────────────────────────

function makeWildFamiliar(level) {
  const species = SPECIES[rand(0, SPECIES.length - 1)];
  const nature  = NATURES[rand(0, NATURES.length - 1)];
  const stats   = rollStats(species, nature);
  return { id: -1, species, nature, stat_str: stats.str, stat_agi: stats.agi,
    stat_vit: Math.max(3, stats.vit + rand(-1, 1)), stat_res: stats.res,
    happiness: 100 };
}

// ── Happiness decay ───────────────────────────────────────────────────────────

const HAPPINESS_DECAY_PER_DAY = 5;
const REVIVAL_COST = 500;

async function applyHappinessDecay(db, familiar) {
  const now  = Date.now();
  const last = parseTS(familiar.last_happiness_decay_at) || parseTS(familiar.created_at) || now;
  const daysPassed = Math.floor((now - last) / (24 * 60 * 60 * 1000));
  if (daysPassed < 1) return familiar;

  const decay        = daysPassed * HAPPINESS_DECAY_PER_DAY;
  const newHappiness = Math.max(0, familiar.happiness - decay);
  const goingDormant = newHappiness === 0 && !familiar.dormant;

  await db.prepare(`
    UPDATE familiars
    SET happiness = ?,
        last_happiness_decay_at = CURRENT_TIMESTAMP,
        dormant = CASE WHEN ? THEN 1 ELSE dormant END,
        dormant_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE dormant_at END
    WHERE id = ?
  `).bind(newHappiness, goingDormant ? 1 : 0, goingDormant ? 1 : 0, familiar.id).run();

  return { ...familiar, happiness: newHappiness,
    dormant: goingDormant ? 1 : familiar.dormant,
    dormant_at: goingDormant ? new Date().toISOString() : familiar.dormant_at };
}

// ── Login event rolling ──────────────────────────────────────────────────────

async function rollLoginEvent(db, familiar) {
  // One event per calendar day (UTC)
  const last = parseTS(familiar.last_login_event_at);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  if (last && last >= todayStart.getTime()) return null;

  // 15% chance
  if (Math.random() >= 0.15) {
    await db.prepare(`UPDATE familiars SET last_login_event_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(familiar.id).run();
    return null;
  }

  const type = pickWeighted(LOGIN_EVENT_TYPES);
  let detail = {};

  if (type === 'void_surge') {
    const xp = rand(XP_GAIN.train.min, XP_GAIN.train.max);
    detail = { xp, message: 'The void pulses. Your familiar stirs, absorbing the dark energy.' };
    await applyXp(db, familiar, xp);

  } else if (type === 'shard_cache') {
    const shards = rand(SHARD_GAIN.shard_cache.min, SHARD_GAIN.shard_cache.max);
    detail = { shards, message: 'Your familiar returns from the void with something clutched in its form.' };
    await db.prepare(`UPDATE familiars SET shards = shards + ?, last_login_event_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(shards, familiar.id).run();

  } else if (type === 'nature_revelation') {
    const stat = NATURE_PRIMARY[familiar.nature];
    const col  = `stat_${stat}`;
    detail = { stat, message: `Your familiar's ${familiar.nature} nature asserts itself. Something hardens within it.` };
    await db.prepare(`UPDATE familiars SET ${col} = ${col} + 1, last_login_event_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(familiar.id).run();

  } else if (type === 'omen') {
    detail = { message: 'A dark sign crosses the veil. Your next hunt will cost less time.' };
    await db.prepare(`UPDATE familiars SET omen_active = 1, last_login_event_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(familiar.id).run();

  } else if (type === 'shadow_encounter') {
    const wild   = makeWildFamiliar(familiar.level);
    const result = resolveBattle(familiar, wild);
    const won    = result.winnerId === familiar.id;
    const shards = won ? rand(SHARD_GAIN.wild_win.min, SHARD_GAIN.wild_win.max) : 0;
    const xp     = won ? rand(XP_GAIN.duel_win.min, XP_GAIN.duel_win.max) : rand(XP_GAIN.duel_loss.min, XP_GAIN.duel_loss.max);
    detail = { won, wildSpecies: wild.species, wildNature: wild.nature, shards, xp, rounds: result.rounds,
      message: won ? 'A shadow creature challenged your familiar while you were away. It was driven back.' :
                     'A shadow creature challenged your familiar while you were away. Your familiar was bested.' };
    await db.prepare(`UPDATE familiars SET shards = shards + ?, last_login_event_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(shards, familiar.id).run();
    await applyXp(db, familiar, xp);

  } else if (type === 'resting_challenger') {
    // Find a random other familiar to have "challenged" this one
    const other = await db.prepare(
      `SELECT f.*, u.username FROM familiars f JOIN users u ON u.id = f.user_id WHERE f.id != ? ORDER BY RANDOM() LIMIT 1`
    ).bind(familiar.id).first();
    if (!other) {
      // No one to challenge — fall back to void surge
      const xp = rand(25, 50);
      detail = { xp, message: 'The void pulses. Your familiar stirs, absorbing the dark energy.' };
      await applyXp(db, familiar, xp);
    } else {
      const result = resolveBattle(familiar, other);
      const won    = result.winnerId === familiar.id;
      const shards = won ? rand(SHARD_GAIN.duel_win.min, SHARD_GAIN.duel_win.max) : 0;
      const xp     = won ? rand(XP_GAIN.duel_win.min, XP_GAIN.duel_win.max) : rand(XP_GAIN.duel_loss.min, XP_GAIN.duel_loss.max);
      detail = { won, opponentUsername: other.username, opponentSpecies: other.species, shards, xp, rounds: result.rounds,
        message: won ? `While you were away, ${other.username}'s ${other.species} challenged your familiar. It was repelled.` :
                       `While you were away, ${other.username}'s ${other.species} challenged your familiar. Your familiar fell.` };
      await db.prepare(`UPDATE familiars SET shards = shards + ?, last_login_event_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(shards, familiar.id).run();
      await applyXp(db, familiar, xp);
    }
  }

  await db.prepare(
    `INSERT INTO familiar_events (familiar_id, event_type, detail_json) VALUES (?, ?, ?)`
  ).bind(familiar.id, type, JSON.stringify(detail)).run();

  return { type, detail };
}

// ── XP + level-up ────────────────────────────────────────────────────────────

async function applyXp(db, familiar, amount) {
  let { level, xp, stat_points } = familiar;
  const oldStage = stageForLevel(level);
  xp += amount;
  let levelsGained = 0;

  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
    levelsGained++;
    stat_points += 3;
  }

  const stage = stageForLevel(level);
  const newXpToNext = xpToNext(level);
  const evolved = stage > oldStage;

  await db.prepare(
    `UPDATE familiars SET level = ?, xp = ?, xp_to_next = ?, stage = ?, stat_points = ? WHERE id = ?`
  ).bind(level, xp, newXpToNext, stage, stat_points, familiar.id).run();

  return { levelsGained, newLevel: level, evolved, newStage: stage };
}

// ── Controller functions ─────────────────────────────────────────────────────

export async function getFamiliar(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  let familiar = await env.DB.prepare(
    `SELECT * FROM familiars WHERE user_id = ?`
  ).bind(user.userId).first();

  if (!familiar) return jsonResponse({ familiar: null });

  // Apply passive happiness decay (once per day at most)
  await applyHappinessDecay(env.DB, familiar);

  // Reload after potential decay mutation
  familiar = await env.DB.prepare(`SELECT * FROM familiars WHERE id = ?`).bind(familiar.id).first();

  // Roll login event — skip if dormant
  if (!familiar.dormant) {
    await rollLoginEvent(env.DB, familiar);
  }

  // Reload familiar after potential mutations
  familiar = await env.DB.prepare(`SELECT * FROM familiars WHERE id = ?`).bind(familiar.id).first();

  // Pending unseen events
  const events = await env.DB.prepare(
    `SELECT * FROM familiar_events WHERE familiar_id = ? AND seen = 0 ORDER BY created_at DESC`
  ).bind(familiar.id).all();

  return jsonResponse({ familiar, events: events.results });
}

export async function createFamiliar(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const existing = await env.DB.prepare(
    `SELECT id FROM familiars WHERE user_id = ?`
  ).bind(user.userId).first();
  if (existing) return errorResponse('You have already bound a familiar', 409);

  const body = await request.json().catch(() => ({}));
  const { species } = body;
  if (!SPECIES.includes(species)) return errorResponse('Invalid species', 400);

  const nature = NATURES[rand(0, NATURES.length - 1)];
  const stats  = rollStats(species, nature);
  const hp     = maxHp(stats.vit);

  await env.DB.prepare(`
    INSERT INTO familiars
      (user_id, species, nature, stat_str, stat_agi, stat_vit, stat_arc, stat_res, stat_ess, hp, max_hp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(user.userId, species, nature, stats.str, stats.agi, stats.vit, stats.arc, stats.res, stats.ess, hp, hp).run();

  const familiar = await env.DB.prepare(`SELECT * FROM familiars WHERE user_id = ?`).bind(user.userId).first();
  return jsonResponse({ familiar }, 201);
}

export async function trainFamiliar(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const familiar = await env.DB.prepare(`SELECT * FROM familiars WHERE user_id = ?`).bind(user.userId).first();
  if (!familiar) return errorResponse('No familiar bound', 404);

  if (familiar.dormant) return errorResponse('Your familiar is dormant — perform the revival rite first', 403);

  const last = parseTS(familiar.last_trained_at);
  if (last && Date.now() - last < COOLDOWNS.train) {
    const remaining = Math.ceil((COOLDOWNS.train - (Date.now() - last)) / 1000);
    return errorResponse('Your familiar is still recovering from training', 429, { remaining });
  }

  const efficiency = conditionEfficiency(familiar);
  const lvMult     = levelMultiplier(familiar.level);
  const grade      = conditionGrade(efficiency);
  const failed     = efficiency < 0.15;

  // Always stamp cooldown — failure means the familiar tried and couldn't
  await env.DB.prepare(`UPDATE familiars SET last_trained_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(familiar.id).run();

  if (failed) {
    return jsonResponse({
      failed: true, xp: 0, levelsGained: 0, newLevel: familiar.level,
      evolved: false, newStage: familiar.stage,
      efficiency: Math.round(efficiency * 100),
      grade,
      condition: { hp: familiar.hp, max_hp: familiar.max_hp, happiness: familiar.happiness },
    });
  }

  const baseXp  = rand(XP_GAIN.train.min, XP_GAIN.train.max);
  const scaledXp = Math.max(1, Math.round(baseXp * lvMult * efficiency));
  const { levelsGained, newLevel, evolved, newStage } = await applyXp(env.DB, familiar, scaledXp);
  const { bondGain, newBond } = await applyBond(env.DB, familiar, 'train');

  return jsonResponse({
    failed: false, xp: scaledXp, baseXp,
    efficiency: Math.round(efficiency * 100),
    lvMult: Math.round(lvMult * 100),
    grade,
    condition: { hp: familiar.hp, max_hp: familiar.max_hp, happiness: familiar.happiness },
    levelsGained, newLevel, evolved, newStage, bondGain, newBond,
  });
}

export async function huntFamiliar(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const familiar = await env.DB.prepare(`SELECT * FROM familiars WHERE user_id = ?`).bind(user.userId).first();
  if (!familiar) return errorResponse('No familiar bound', 404);

  if (familiar.dormant) return errorResponse('Your familiar is dormant — perform the revival rite first', 403);

  const cd = familiar.omen_active ? COOLDOWNS.hunt / 2 : COOLDOWNS.hunt;
  const last = parseTS(familiar.last_hunted_at);
  if (last && Date.now() - last < cd) {
    const remaining = Math.ceil((cd - (Date.now() - last)) / 1000);
    return errorResponse('Your familiar is still out in the void', 429, { remaining });
  }

  const efficiency = conditionEfficiency(familiar);
  const lvMult     = levelMultiplier(familiar.level);
  const grade      = conditionGrade(efficiency);
  const failed     = efficiency < 0.15;

  if (failed) {
    await env.DB.prepare(`UPDATE familiars SET omen_active = 0, last_hunted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(familiar.id).run();
    return jsonResponse({
      failed: true, xp: 0, shards: 0, levelsGained: 0, newLevel: familiar.level,
      evolved: false, newStage: familiar.stage, encounter: null,
      efficiency: Math.round(efficiency * 100), grade,
      condition: { hp: familiar.hp, max_hp: familiar.max_hp, happiness: familiar.happiness },
    });
  }

  const baseXp    = rand(XP_GAIN.hunt.min, XP_GAIN.hunt.max);
  const baseShards = rand(SHARD_GAIN.hunt_base.min, SHARD_GAIN.hunt_base.max);
  const scaledXp    = Math.max(1, Math.round(baseXp    * lvMult * efficiency));
  const scaledShards = Math.max(1, Math.round(baseShards * lvMult * efficiency));

  let { levelsGained, newLevel, evolved, newStage } = await applyXp(env.DB, familiar, scaledXp);
  let encounter = null;

  // Encounter chance scales with condition — poor condition reduces encounter rate
  if (Math.random() < 0.2 * efficiency) {
    const wild        = makeWildFamiliar(familiar.level);
    const result      = resolveBattle(familiar, wild);
    const won         = result.winnerId === familiar.id;
    const bonusShards = won ? rand(SHARD_GAIN.wild_win.min, SHARD_GAIN.wild_win.max) : 0;
    const bonusXp     = won ? rand(XP_GAIN.duel_win.min, XP_GAIN.duel_win.max) : rand(XP_GAIN.duel_loss.min, XP_GAIN.duel_loss.max);
    encounter = { won, wildSpecies: wild.species, wildNature: wild.nature, bonusShards, bonusXp, rounds: result.rounds };
    const refreshed = await env.DB.prepare(`SELECT * FROM familiars WHERE id = ?`).bind(familiar.id).first();
    const bonusResult = await applyXp(env.DB, refreshed, bonusXp);
    if (bonusResult.evolved) { evolved = true; newStage = bonusResult.newStage; }
    await env.DB.prepare(`UPDATE familiars SET shards = shards + ?, omen_active = 0, last_hunted_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(scaledShards + bonusShards, familiar.id).run();
  } else {
    await env.DB.prepare(`UPDATE familiars SET shards = shards + ?, omen_active = 0, last_hunted_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(scaledShards, familiar.id).run();
  }

  const { bondGain, newBond } = await applyBond(env.DB, familiar, 'hunt');

  return jsonResponse({
    failed: false, xp: scaledXp, baseXp, shards: scaledShards, baseShards,
    efficiency: Math.round(efficiency * 100),
    lvMult: Math.round(lvMult * 100),
    grade,
    condition: { hp: familiar.hp, max_hp: familiar.max_hp, happiness: familiar.happiness },
    levelsGained, newLevel, evolved, newStage, encounter, bondGain, newBond,
  });
}

export async function restFamiliar(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const familiar = await env.DB.prepare(`SELECT * FROM familiars WHERE user_id = ?`).bind(user.userId).first();
  if (!familiar) return errorResponse('No familiar bound', 404);

  if (familiar.dormant) return errorResponse('Your familiar is dormant — perform the revival rite first', 403);

  const last = parseTS(familiar.last_rested_at);
  if (last && Date.now() - last < COOLDOWNS.rest) {
    const remaining = Math.ceil((COOLDOWNS.rest - (Date.now() - last)) / 1000);
    return errorResponse('Your familiar is already rested', 429, { remaining });
  }

  const newHappiness = Math.min(100, familiar.happiness + 10);
  const hpRestored   = familiar.max_hp - familiar.hp;
  await env.DB.prepare(
    `UPDATE familiars SET hp = max_hp, happiness = ?, last_rested_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(newHappiness, familiar.id).run();

  const { bondGain, newBond } = await applyBond(env.DB, familiar, 'rest');

  return jsonResponse({
    hpRestored, newHp: familiar.max_hp, maxHp: familiar.max_hp,
    happinessGained: newHappiness - familiar.happiness, newHappiness,
    bondGain, newBond,
  });
}

export async function duelFamiliar(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const body = await request.json().catch(() => ({}));
  const { targetUserId } = body;
  if (!targetUserId) return errorResponse('targetUserId required', 400);
  if (targetUserId === user.userId) return errorResponse('You cannot duel yourself', 400);

  const [mine, theirs] = await Promise.all([
    env.DB.prepare(`SELECT f.*, u.username FROM familiars f JOIN users u ON u.id = f.user_id WHERE f.user_id = ?`).bind(user.userId).first(),
    env.DB.prepare(`SELECT f.*, u.username FROM familiars f JOIN users u ON u.id = f.user_id WHERE f.user_id = ?`).bind(targetUserId).first(),
  ]);

  if (!mine)   return errorResponse('You have no bound familiar', 404);
  if (!theirs) return errorResponse('That user has no bound familiar', 404);
  if (mine.dormant) return errorResponse('Your familiar is dormant — perform the revival rite first', 403);

  const lastDuel = parseTS(mine.last_dueled_at);
  if (lastDuel && Date.now() - lastDuel < COOLDOWNS.duel) {
    const remaining = Math.ceil((COOLDOWNS.duel - (Date.now() - lastDuel)) / 1000);
    return errorResponse('Your familiar needs time to recover from its last duel', 429, { remaining });
  }

  const DUEL_LEVEL_CAP = 10;
  if (Math.abs(mine.level - theirs.level) > DUEL_LEVEL_CAP) {
    return errorResponse(
      `Level mismatch — you may only duel familiars within ${DUEL_LEVEL_CAP} levels of your own (you: ${mine.level}, them: ${theirs.level})`,
      403,
    );
  }

  const result = resolveBattle(mine, theirs);
  const won    = result.winnerId === mine.id;

  const xp     = won ? rand(XP_GAIN.duel_win.min, XP_GAIN.duel_win.max) : rand(XP_GAIN.duel_loss.min, XP_GAIN.duel_loss.max);
  const shards = won ? rand(SHARD_GAIN.duel_win.min, SHARD_GAIN.duel_win.max) : 0;
  const happinessChange = won ? 0 : -5;

  const { levelsGained, newLevel, evolved, newStage } = await applyXp(env.DB, mine, xp);

  await env.DB.prepare(`
    UPDATE familiars
    SET wins   = wins + ?,
        losses = losses + ?,
        shards = shards + ?,
        happiness = MAX(0, MIN(100, happiness + ?)),
        last_dueled_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(won ? 1 : 0, won ? 0 : 1, shards, happinessChange, mine.id).run();

  await env.DB.prepare(`
    INSERT INTO familiar_battles (challenger_id, defender_id, winner_id, rounds_json, trigger)
    VALUES (?, ?, ?, ?, 'manual')
  `).bind(mine.id, theirs.id, result.winnerId, JSON.stringify(result.rounds)).run();

  // Notify the defender
  await env.DB.prepare(
    `INSERT INTO familiar_events (familiar_id, event_type, detail_json) VALUES (?, 'challenged', ?)`
  ).bind(theirs.id, JSON.stringify({
    challenger_username: mine.username,
    challenger_species:  mine.species,
    defender_won: result.winnerId === theirs.id,
    rounds: result.rounds.length,
    message: result.winnerId === theirs.id
      ? `${mine.username}'s familiar challenged yours while you were away — and was repelled.`
      : `${mine.username}'s familiar challenged yours while you were away — and claimed victory.`,
  })).run();

  const { bondGain, newBond } = await applyBond(env.DB, mine, won ? 'duel_win' : 'duel_loss');

  return jsonResponse({
    won, xp, shards, levelsGained, newLevel, evolved, newStage,
    rounds: result.rounds,
    opponent: { username: theirs.username, species: theirs.species, nature: theirs.nature },
    bondGain, newBond,
  });
}

export async function allocateStat(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const body = await request.json().catch(() => ({}));
  const { stat } = body;
  if (!STATS.includes(stat)) return errorResponse('Invalid stat', 400);

  const familiar = await env.DB.prepare(`SELECT * FROM familiars WHERE user_id = ?`).bind(user.userId).first();
  if (!familiar) return errorResponse('No familiar bound', 404);
  if (familiar.dormant) return errorResponse('Your familiar is dormant — perform the revival rite first', 403);
  if (familiar.stat_points < 1) return errorResponse('No stat points available', 400);

  const col = `stat_${stat}`;
  await env.DB.prepare(`UPDATE familiars SET ${col} = ${col} + 1, stat_points = stat_points - 1 WHERE id = ?`).bind(familiar.id).run();

  // If VIT increased, also raise max_hp
  if (stat === 'vit') {
    await env.DB.prepare(`UPDATE familiars SET max_hp = max_hp + 10 WHERE id = ?`).bind(familiar.id).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM familiars WHERE id = ?`).bind(familiar.id).first();
  return jsonResponse({ familiar: updated });
}

export async function reviveFamiliar(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const familiar = await env.DB.prepare(`SELECT * FROM familiars WHERE user_id = ?`).bind(user.userId).first();
  if (!familiar)         return errorResponse('No familiar bound', 404);
  if (!familiar.dormant) return errorResponse('Your familiar is not dormant', 400);
  if (familiar.shards < REVIVAL_COST)
    return errorResponse(`Insufficient shards — the revival rite requires ${REVIVAL_COST} shards`, 400);

  const newHp = Math.ceil(familiar.max_hp * 0.5);

  await env.DB.prepare(`
    UPDATE familiars
    SET dormant = 0, dormant_at = NULL, happiness = 40, hp = ?,
        shards = shards - ?, last_happiness_decay_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(newHp, REVIVAL_COST, familiar.id).run();

  const updated = await env.DB.prepare(`SELECT * FROM familiars WHERE id = ?`).bind(familiar.id).first();
  return jsonResponse({ familiar: updated, revived: true });
}

export async function renameFamiliar(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const familiar = await env.DB.prepare(`SELECT * FROM familiars WHERE user_id = ?`).bind(user.userId).first();
  if (!familiar) return errorResponse('No familiar bound', 404);

  if (familiar.level < SCROLL_REQUIRE_LEVEL)
    return errorResponse(`Your familiar must reach level ${SCROLL_REQUIRE_LEVEL} before it can be named`, 403);
  if ((familiar.bond || 0) < SCROLL_REQUIRE_BOND)
    return errorResponse('Your familiar does not yet trust you enough to accept a name', 403);

  const body = await request.json().catch(() => ({}));
  const { name } = body;
  if (!name || typeof name !== 'string') return errorResponse('Name required', 400);
  const cleaned = name.trim().slice(0, 24);
  if (cleaned.length < 2) return errorResponse('Name must be at least 2 characters', 400);

  await env.DB.prepare(`UPDATE familiars SET name = ? WHERE id = ?`).bind(cleaned, familiar.id).run();
  const updated = await env.DB.prepare(`SELECT * FROM familiars WHERE id = ?`).bind(familiar.id).first();
  return jsonResponse({ familiar: updated });
}

export async function markEventSeen(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const eventId = parseInt(parts[parts.length - 2], 10);

  const familiar = await env.DB.prepare(`SELECT id FROM familiars WHERE user_id = ?`).bind(user.userId).first();
  if (!familiar) return errorResponse('No familiar bound', 404);

  await env.DB.prepare(
    `UPDATE familiar_events SET seen = 1 WHERE id = ? AND familiar_id = ?`
  ).bind(eventId, familiar.id).run();

  return jsonResponse({ ok: true });
}

export async function getLeaderboard(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const rows = await env.DB.prepare(`
    SELECT f.species, f.nature, f.name, f.stage, f.level, f.wins, f.losses, f.happiness, f.bond,
           u.username, u.image_url
    FROM familiars f
    JOIN users u ON u.id = f.user_id
    ORDER BY f.wins DESC, f.level DESC
    LIMIT 20
  `).all();

  return jsonResponse({ leaderboard: rows.results });
}

export async function getOtherFamiliars(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const rows = await env.DB.prepare(`
    SELECT f.id, f.species, f.nature, f.name, f.stage, f.level, f.wins, f.losses,
           u.id as user_id, u.username, u.image_url
    FROM familiars f
    JOIN users u ON u.id = f.user_id
    WHERE f.user_id != ?
    ORDER BY f.level DESC
  `).bind(user.userId).all();

  return jsonResponse({ familiars: rows.results });
}

// ── Shop ─────────────────────────────────────────────────────────────────────

const SHOP_ITEMS = {
  feast: {
    name: 'Void Feast',
    cost: 200,
    desc: 'Restores your familiar to full HP and raises happiness by 15.',
  },
  elixir: {
    name: 'Growth Elixir',
    cost: 300,
    desc: 'Infuses your familiar with raw essence, granting 150 XP instantly.',
  },
  shadow_charm: {
    name: 'Shadow Charm',
    cost: 400,
    desc: 'Activates the omen — halves your hunt cooldown until next hunt.',
  },
  tonic: {
    name: 'Binding Tonic',
    cost: 150,
    desc: 'Restores 20 HP and eases unrest — raises happiness by 10.',
  },
  scroll_of_binding: {
    name: 'Scroll of Binding',
    cost: 400,
    desc: 'Bestow a name upon your familiar, or change the one already given. Requires trust (level 5 · Trusted bond).',
    requireLevel: SCROLL_REQUIRE_LEVEL,
    requireBond:  SCROLL_REQUIRE_BOND,
  },
};

export async function shopBuy(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const body = await request.json().catch(() => ({}));
  const { item } = body;
  if (!SHOP_ITEMS[item]) return errorResponse('Unknown item', 400);

  const familiar = await env.DB.prepare(`SELECT * FROM familiars WHERE user_id = ?`).bind(user.userId).first();
  if (!familiar) return errorResponse('No familiar bound', 404);

  const shopItem = SHOP_ITEMS[item];
  if (familiar.shards < shopItem.cost) return errorResponse('Not enough shards', 400);

  // Scroll of Binding: validate requirements, deduct, return name_scroll effect (no rename here)
  if (item === 'scroll_of_binding') {
    if (familiar.level < shopItem.requireLevel)
      return errorResponse(`Your familiar must reach level ${shopItem.requireLevel} before it can be named`, 403);
    if ((familiar.bond || 0) < shopItem.requireBond)
      return errorResponse('Your familiar does not yet trust you enough to accept a name', 403);
    await env.DB.prepare(`UPDATE familiars SET shards = shards - ? WHERE id = ?`).bind(shopItem.cost, familiar.id).run();
    await env.DB.prepare(`INSERT INTO familiar_items (familiar_id, item_key, qty) VALUES (?, ?, 1) ON CONFLICT(familiar_id, item_key) DO UPDATE SET qty = qty + 1`).bind(familiar.id, item).run();
    const updated = await env.DB.prepare(`SELECT * FROM familiars WHERE id = ?`).bind(familiar.id).first();
    return jsonResponse({ familiar: updated, item, effect: { type: 'name_scroll' } });
  }

  // Deduct shards first
  await env.DB.prepare(`UPDATE familiars SET shards = shards - ? WHERE id = ?`).bind(shopItem.cost, familiar.id).run();

  // Apply item effect
  let result = {};
  if (item === 'feast') {
    await env.DB.prepare(`UPDATE familiars SET hp = max_hp, happiness = MIN(100, happiness + 15) WHERE id = ?`).bind(familiar.id).run();
    result = { hp: familiar.max_hp, happiness: Math.min(100, familiar.happiness + 15) };
  } else if (item === 'elixir') {
    const { levelsGained, newLevel, evolved, newStage } = await applyXp(env.DB, familiar, 150);
    result = { xp: 150, levelsGained, newLevel, evolved, newStage };
  } else if (item === 'shadow_charm') {
    await env.DB.prepare(`UPDATE familiars SET omen_active = 1 WHERE id = ?`).bind(familiar.id).run();
    result = { omen_active: true };
  } else if (item === 'tonic') {
    const newHp = Math.min(familiar.max_hp, familiar.hp + 20);
    const newHappiness = Math.min(100, familiar.happiness + 10);
    await env.DB.prepare(`UPDATE familiars SET hp = ?, happiness = ? WHERE id = ?`).bind(newHp, newHappiness, familiar.id).run();
    result = { hp: newHp, happiness: newHappiness };
  }

  // Record in familiar_items for history
  await env.DB.prepare(`
    INSERT INTO familiar_items (familiar_id, item_key, qty)
    VALUES (?, ?, 1)
    ON CONFLICT(familiar_id, item_key) DO UPDATE SET qty = qty + 1
  `).bind(familiar.id, item).run();

  const updated = await env.DB.prepare(`SELECT * FROM familiars WHERE id = ?`).bind(familiar.id).first();
  return jsonResponse({ familiar: updated, item, effect: result });
}

export async function getShopItems(_request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);
  return jsonResponse({ items: SHOP_ITEMS });
}

export async function getRecentBattles(request, env, user) {
  if (!user) return errorResponse('Unauthorised', 401);

  const familiar = await env.DB.prepare(`SELECT id FROM familiars WHERE user_id = ?`).bind(user.userId).first();
  if (!familiar) return jsonResponse({ battles: [] });

  const rows = await env.DB.prepare(`
    SELECT b.*,
           cu.username as challenger_username, cf.species as challenger_species,
           du.username as defender_username,   df.species as defender_species
    FROM familiar_battles b
    JOIN familiars cf ON cf.id = b.challenger_id
    JOIN familiars df ON df.id = b.defender_id
    JOIN users cu ON cu.id = cf.user_id
    JOIN users du ON du.id = df.user_id
    WHERE b.challenger_id = ? OR b.defender_id = ?
    ORDER BY b.battled_at DESC
    LIMIT 10
  `).bind(familiar.id, familiar.id).all();

  return jsonResponse({ battles: rows.results });
}
