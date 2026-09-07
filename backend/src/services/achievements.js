// Member achievements/badges — derived entirely from data already tracked
// elsewhere (war_hits, chain_hits, oc_crime_slots, the mini-games, forums,
// cipher, mentoring, discord linking). No new tables for the badges
// themselves: they're always recomputed live from a stats snapshot, never
// stored/unlocked-once, so tweaking a threshold takes effect immediately for
// everyone. `achievement_configs` (migration_add_achievement_configs.sql)
// only stores admin overrides — enabled/disabled + tier thresholds — on top
// of the coded defaults below; see Admin > Achievements.
//
// Tiered badges (`tiers`) count up Bronze → Silver → Gold as a numeric stat
// crosses each threshold. Binary badges (`binary: true`) are earned/not —
// there's no meaningful "tier" for e.g. "has linked Discord".

export const BADGE_DEFS = [
  { key: 'veteran',        label: 'Veteran',        icon: '🎖️', statKey: 'days_in_faction',       description: 'Consecutive days in the faction (current stint — resets if you leave and rejoin).',            tiers: [{ name: 'Bronze', threshold: 100 }, { name: 'Silver', threshold: 365 }, { name: 'Gold', threshold: 1000 }] },
  { key: 'war_hero',       label: 'War Hero',       icon: '⚔️', statKey: 'wars_fought',           description: 'Number of distinct ranked wars you have a saved payout record in.',                              tiers: [{ name: 'Bronze', threshold: 5 },   { name: 'Silver', threshold: 25 },  { name: 'Gold', threshold: 50 }] },
  { key: 'chain_breaker',  label: 'Chain Breaker',  icon: '⛓️', statKey: 'chains_fought',         description: 'Number of distinct saved chains you landed at least one hit in.',                                tiers: [{ name: 'Bronze', threshold: 5 },   { name: 'Silver', threshold: 25 },  { name: 'Gold', threshold: 50 }] },
  { key: 'respect_earner', label: 'Respect Earner', icon: '👑', statKey: 'total_respect',         description: 'Lifetime respect gained across all saved wars and chains combined.',                             tiers: [{ name: 'Bronze', threshold: 1000 },{ name: 'Silver', threshold: 10000 },{ name: 'Gold', threshold: 50000 }] },
  { key: 'crime_boss',     label: 'Crime Boss',     icon: '🕵️', statKey: 'oc_joined',             description: 'Number of Organized Crime slots you have joined, successful or not.',                            tiers: [{ name: 'Bronze', threshold: 10 },  { name: 'Silver', threshold: 50 },  { name: 'Gold', threshold: 200 }] },
  { key: 'angler',         label: 'Angler',         icon: '🎣', statKey: 'fishing_catches',       description: 'Number of fish caught in the Fishing easter egg.',                                               tiers: [{ name: 'Bronze', threshold: 10 },  { name: 'Silver', threshold: 50 },  { name: 'Gold', threshold: 200 }] },
  { key: 'rune_master',    label: 'Rune Master',    icon: '🔯', statKey: 'rune_casts',            description: 'Number of casts made in the Rune Casting easter egg.',                                           tiers: [{ name: 'Bronze', threshold: 10 },  { name: 'Silver', threshold: 50 },  { name: 'Gold', threshold: 200 }] },
  // Binary, not tiered: The Sanctum's essence economy is exponential idle-game
  // scale (real production values span from 0 to 90+ quadrillion depending on
  // how long someone's been playing) — no fixed linear threshold means
  // anything sensible across that range, so this just tracks participation.
  { key: 'sanctum_adept',  label: 'Sanctum Adept',  icon: '🔮', statKey: 'has_sanctum',           description: 'Earned simply by having started The Sanctum (idle game) at least once — essence totals grow far too exponentially for a fair fixed threshold.', binary: true },
  { key: 'familiar_bond',  label: 'Familiar Bond',  icon: '🐾', statKey: 'familiar_level',        description: "Your Binding Game familiar's current level.",                                                    tiers: [{ name: 'Bronze', threshold: 10 },  { name: 'Silver', threshold: 25 },  { name: 'Gold', threshold: 50 }] },
  { key: 'card_shark',     label: 'Card Shark',     icon: '🃏', statKey: 'cah_games',             description: 'Number of distinct Cards Against Occultus rooms you have played in.',                            tiers: [{ name: 'Bronze', threshold: 5 },   { name: 'Silver', threshold: 20 },  { name: 'Gold', threshold: 50 }] },
  { key: 'ritualist',      label: 'Ritualist',      icon: '🕯️', statKey: 'rite_games',            description: 'Number of distinct The Rite rooms you have played in.',                                          tiers: [{ name: 'Bronze', threshold: 5 },   { name: 'Silver', threshold: 20 },  { name: 'Gold', threshold: 50 }] },
  { key: 'forum_voice',    label: 'Forum Voice',    icon: '📜', statKey: 'forum_posts',           description: 'Number of forum posts you have authored.',                                                       tiers: [{ name: 'Bronze', threshold: 1 },   { name: 'Silver', threshold: 10 },  { name: 'Gold', threshold: 25 }] },
  { key: 'cipher_sage',    label: 'Cipher Sage',    icon: '🔍', statKey: 'cipher_solves',         description: 'Number of Daily Cipher puzzles you have solved correctly.',                                      tiers: [{ name: 'Bronze', threshold: 5 },   { name: 'Silver', threshold: 25 },  { name: 'Gold', threshold: 100 }] },
  { key: 'mentor',         label: 'Mentor',         icon: '🧭', statKey: 'is_mentor',         description: 'Earned by being registered as an active mentor on the Mentoring tab.', binary: true },
  { key: 'discord_linked', label: 'Discord Linked', icon: '💬', statKey: 'discord_linked',    description: 'Earned by linking your Discord account to occultusHub.',              binary: true },
];

// ── Config overrides ──────────────────────────────────────────────────────

export async function getAchievementConfigs(env) {
  const { results } = await env.DB.prepare(`SELECT * FROM achievement_configs`).all();
  const map = {};
  for (const row of (results || [])) map[row.key] = row;
  return map;
}

// Merges a badge def with its DB override (if any) into what computeAchievements
// actually uses — a missing config row falls back to the coded default
// (enabled, default thresholds), so this table only needs to store what an
// admin actually changed.
function effectiveDef(def, configs) {
  const cfg = configs?.[def.key];
  const enabled = cfg ? !!cfg.enabled : true;
  if (def.binary) return { ...def, enabled };

  const overrideNames = ['bronze_threshold', 'silver_threshold', 'gold_threshold'];
  const tiers = def.tiers.map((t, i) => {
    const override = cfg?.[overrideNames[i]];
    return { ...t, threshold: (override != null) ? override : t.threshold };
  });
  return { ...def, enabled, tiers };
}

export function getEffectiveBadgeDefs(configs) {
  return BADGE_DEFS.map(def => effectiveDef(def, configs));
}

// ── Compute a member's badge results from a flat stats snapshot ────────────
// `configs` (from getAchievementConfigs) is optional — omit it to use pure
// coded defaults (e.g. a quick script), pass it for anything user-facing so
// admin overrides actually apply. Disabled badges are left out entirely.

export function computeAchievements(stats, configs = null) {
  return getEffectiveBadgeDefs(configs)
    .filter(def => def.enabled)
    .map(def => {
      const raw = stats[def.statKey];

      if (def.binary) {
        const earned = !!raw;
        return { key: def.key, label: def.label, icon: def.icon, description: def.description, binary: true, earned, value: earned };
      }

      const value = raw ?? 0;
      let tier = null, tierIndex = -1;
      def.tiers.forEach((t, i) => { if (value >= t.threshold) { tier = t.name; tierIndex = i; } });
      const nextTier = def.tiers[tierIndex + 1] ?? null;

      return {
        key: def.key,
        label: def.label,
        icon: def.icon,
        description: def.description,
        value,
        earned: tierIndex >= 0,
        tier,
        next_tier: nextTier?.name ?? null,
        next_threshold: nextTier?.threshold ?? null,
        max_threshold: def.tiers[def.tiers.length - 1].threshold,
      };
    });
}
