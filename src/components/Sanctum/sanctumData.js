// Upgrade definitions — must stay in sync with sanctumController.js
export const UPGRADES = [
  // ── Tier 1 generators ──────────────────────────────────────────────
  {
    id: 'altar',
    name: 'Altar of Shadows',
    description: 'The focal point of your dark rituals. Generates essence passively.',
    flavour: 'Where blood meets stone, power is born.',
    icon: '🕯️',
    baseCost: 50,       costMult: 1.15,
    production: 0.1,    clickBonus: 0,   globalMult: 0,
    unlockAt: 0,        type: 'generator',
  },
  {
    id: 'familiar',
    name: 'Bound Familiar',
    description: 'A bound spirit that amplifies every invocation you make.',
    flavour: 'It whispers back whatever you pour into the dark.',
    icon: '🐦‍⬛',
    baseCost: 100,      costMult: 1.20,
    production: 0,      clickBonus: 2,   globalMult: 0,
    unlockAt: 25,       type: 'click',
  },
  {
    id: 'soul_fragments',
    name: 'Soul Fragments',
    description: 'Captured fragments of spent souls leak essence endlessly.',
    flavour: 'Even the dead serve the Sanctum.',
    icon: '💀',
    baseCost: 400,      costMult: 1.15,
    production: 0.5,    clickBonus: 0,   globalMult: 0,
    unlockAt: 200,      type: 'generator',
  },
  {
    id: 'ley_line',
    name: 'Ley Line Tap',
    description: 'Draw raw power from the earth\'s hidden veins.',
    flavour: 'The world bleeds for those who know where to cut.',
    icon: '⚡',
    baseCost: 4000,     costMult: 1.15,
    production: 5,      clickBonus: 0,   globalMult: 0,
    unlockAt: 2000,     type: 'generator',
  },

  // ── Tier 1 multipliers ─────────────────────────────────────────────
  {
    id: 'grimoire',
    name: 'Grimoire Pages',
    description: 'Ancient texts multiply all essence production.',
    flavour: 'Knowledge is the oldest currency.',
    icon: '📖',
    baseCost: 20000,    costMult: 1.30,
    production: 0,      clickBonus: 0,   globalMult: 0.10,
    unlockAt: 10000,    type: 'multiplier',
  },
  {
    id: 'shadow_pact',
    name: 'Shadow Pact',
    description: 'A pact with forces beyond comprehension. Greatly amplifies all production.',
    flavour: 'The price was paid long before you asked.',
    icon: '🌑',
    baseCost: 200000,   costMult: 1.40,
    production: 0,      clickBonus: 0,   globalMult: 0.25,
    unlockAt: 100000,   type: 'multiplier',
  },

  // ── Tier 2 generators ──────────────────────────────────────────────
  {
    id: 'the_rift',
    name: 'The Rift',
    description: 'A tear in reality pours essence endlessly into your sanctum.',
    flavour: 'Some doors, once opened, cannot be closed.',
    icon: '🌀',
    baseCost: 2000000,  costMult: 1.15,
    production: 100,    clickBonus: 0,   globalMult: 0,
    unlockAt: 1000000,  type: 'generator',
  },
  {
    id: 'blood_covenant',
    name: 'Blood Covenant',
    description: 'A pact sealed in blood magnifies the flow of all essence.',
    flavour: 'Not a deal. A binding.',
    icon: '🩸',
    baseCost: 8000000,  costMult: 1.35,
    production: 0,      clickBonus: 0,   globalMult: 0.20,
    unlockAt: 3000000,  type: 'multiplier',
  },
  {
    id: 'void_conduit',
    name: 'Void Conduit',
    description: 'A channel bored through the void itself funnels raw power.',
    flavour: 'The void is not empty. It was waiting.',
    icon: '🔮',
    baseCost: 25000000, costMult: 1.15,
    production: 600,    clickBonus: 0,   globalMult: 0,
    unlockAt: 10000000, type: 'generator',
  },

  // ── Tier 3 generators + multipliers ───────────────────────────────
  {
    id: 'elder_seal',
    name: 'Elder Seal',
    description: 'An ancient ward repurposed to amplify rather than contain.',
    flavour: 'The seal no longer holds. It feeds.',
    icon: '🔱',
    baseCost: 200000000,costMult: 1.45,
    production: 0,      clickBonus: 0,   globalMult: 0.50,
    unlockAt: 75000000, type: 'multiplier',
  },
  {
    id: 'lich_throne',
    name: 'Lich Throne',
    description: 'The seat of undying power radiates essence across eternity.',
    flavour: 'He has sat there so long the stone became part of him.',
    icon: '👑',
    baseCost: 500000000,costMult: 1.15,
    production: 4000,   clickBonus: 0,   globalMult: 0,
    unlockAt: 200000000,type: 'generator',
  },
  {
    id: 'void_ascension',
    name: 'Void Ascension',
    description: 'Partial ascension into the void doubles your essence throughput.',
    flavour: 'One foot in this world. One foot in nothing.',
    icon: '✨',
    baseCost: 5000000000,costMult: 1.50,
    production: 0,       clickBonus: 0,  globalMult: 1.00,
    unlockAt: 2000000000,type: 'multiplier',
  },

  // ── Tier 4 generators + multipliers ───────────────────────────────
  {
    id: 'nexus',
    name: 'Nexus of Eternity',
    description: 'A convergence point of all dark ley lines. Immense passive generation.',
    flavour: 'All rivers of shadow flow here.',
    icon: '🌐',
    baseCost: 10000000000, costMult: 1.12,
    production: 30000,     clickBonus: 0, globalMult: 0,
    unlockAt: 5000000000,  type: 'generator',
  },
  {
    id: 'the_abyss',
    name: 'The Abyss',
    description: 'Tap directly into the primordial abyss for near-limitless essence.',
    flavour: 'You stared long enough. Now it pours.',
    icon: '⚫',
    baseCost: 250000000000,costMult: 1.12,
    production: 250000,    clickBonus: 0, globalMult: 0,
    unlockAt: 100000000000,type: 'generator',
  },
  {
    id: 'final_pact',
    name: 'The Final Pact',
    description: 'A pact with the void itself. Multiplies all production enormously.',
    flavour: 'There is nothing left to give. And yet.',
    icon: '🌌',
    baseCost: 100000000000,costMult: 1.55,
    production: 0,          clickBonus: 0, globalMult: 2.50,
    unlockAt: 40000000000,  type: 'multiplier',
  },

  // ── Tier 5 — endgame ───────────────────────────────────────────────
  {
    id: 'primordial_rift',
    name: 'Primordial Rift',
    description: 'A fracture in existence older than time. The apex of power.',
    flavour: 'Before the first word was spoken, this was already open.',
    icon: '🕳️',
    baseCost: 5000000000000,costMult: 1.10,
    production: 2500000,    clickBonus: 0, globalMult: 0,
    unlockAt: 2000000000000,type: 'generator',
  },
];

export function computeStats(upgrades) {
  let baseProduction = 0;
  let clickPower = 1;
  let multiplier = 1;

  for (const def of UPGRADES) {
    const level = upgrades[def.id] || 0;
    baseProduction += level * def.production;
    clickPower += level * def.clickBonus;
    multiplier += level * def.globalMult;
  }

  return {
    essencePerSec: baseProduction * multiplier,
    clickPower,
  };
}

export function upgradeCost(id, currentLevel) {
  const def = UPGRADES.find(u => u.id === id);
  if (!def) return Infinity;
  return Math.floor(def.baseCost * Math.pow(def.costMult, currentLevel));
}

export function formatEssence(n) {
  if (n >= 1e15) return (n / 1e15).toFixed(2) + 'Q';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2)  + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + 'K';
  return Math.floor(n).toString();
}

export function formatTime(seconds) {
  if (seconds < 60)   return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
