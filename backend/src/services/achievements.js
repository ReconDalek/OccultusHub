// Member achievements/badges — derived entirely from data already tracked
// elsewhere (war_hits, chain_hits, oc_crime_slots, the mini-games, forums,
// cipher, mentoring, discord linking). No new tables: badges are always
// recomputed live from a stats snapshot, never stored/unlocked-once, so
// tweaking a threshold here takes effect immediately for everyone.
//
// Tiered badges (`tiers`) count up Bronze → Silver → Gold as a numeric stat
// crosses each threshold. Binary badges (`binary: true`) are earned/not —
// there's no meaningful "tier" for e.g. "has linked Discord".

export const BADGE_DEFS = [
  { key: 'veteran',        label: 'Veteran',        icon: '🎖️', statKey: 'days_in_faction',       tiers: [{ name: 'Bronze', threshold: 100 }, { name: 'Silver', threshold: 365 }, { name: 'Gold', threshold: 1000 }] },
  { key: 'war_hero',       label: 'War Hero',       icon: '⚔️', statKey: 'wars_fought',           tiers: [{ name: 'Bronze', threshold: 5 },   { name: 'Silver', threshold: 25 },  { name: 'Gold', threshold: 50 }] },
  { key: 'chain_breaker',  label: 'Chain Breaker',  icon: '⛓️', statKey: 'chains_fought',         tiers: [{ name: 'Bronze', threshold: 5 },   { name: 'Silver', threshold: 25 },  { name: 'Gold', threshold: 50 }] },
  { key: 'respect_earner', label: 'Respect Earner', icon: '👑', statKey: 'total_respect',         tiers: [{ name: 'Bronze', threshold: 1000 },{ name: 'Silver', threshold: 10000 },{ name: 'Gold', threshold: 50000 }] },
  { key: 'crime_boss',     label: 'Crime Boss',     icon: '🕵️', statKey: 'oc_joined',             tiers: [{ name: 'Bronze', threshold: 10 },  { name: 'Silver', threshold: 50 },  { name: 'Gold', threshold: 200 }] },
  { key: 'angler',         label: 'Angler',         icon: '🎣', statKey: 'fishing_catches',       tiers: [{ name: 'Bronze', threshold: 10 },  { name: 'Silver', threshold: 50 },  { name: 'Gold', threshold: 200 }] },
  { key: 'rune_master',    label: 'Rune Master',    icon: '🔯', statKey: 'rune_casts',            tiers: [{ name: 'Bronze', threshold: 10 },  { name: 'Silver', threshold: 50 },  { name: 'Gold', threshold: 200 }] },
  // Binary, not tiered: The Sanctum's essence economy is exponential idle-game
  // scale (real production values span from 0 to 90+ quadrillion depending on
  // how long someone's been playing) — no fixed linear threshold means
  // anything sensible across that range, so this just tracks participation.
  { key: 'sanctum_adept',  label: 'Sanctum Adept',  icon: '🔮', statKey: 'has_sanctum',           binary: true },
  { key: 'familiar_bond',  label: 'Familiar Bond',  icon: '🐾', statKey: 'familiar_level',        tiers: [{ name: 'Bronze', threshold: 10 },  { name: 'Silver', threshold: 25 },  { name: 'Gold', threshold: 50 }] },
  { key: 'card_shark',     label: 'Card Shark',     icon: '🃏', statKey: 'cah_games',             tiers: [{ name: 'Bronze', threshold: 5 },   { name: 'Silver', threshold: 20 },  { name: 'Gold', threshold: 50 }] },
  { key: 'ritualist',      label: 'Ritualist',      icon: '🕯️', statKey: 'rite_games',            tiers: [{ name: 'Bronze', threshold: 5 },   { name: 'Silver', threshold: 20 },  { name: 'Gold', threshold: 50 }] },
  { key: 'forum_voice',    label: 'Forum Voice',    icon: '📜', statKey: 'forum_posts',           tiers: [{ name: 'Bronze', threshold: 1 },   { name: 'Silver', threshold: 10 },  { name: 'Gold', threshold: 25 }] },
  { key: 'cipher_sage',    label: 'Cipher Sage',    icon: '🔍', statKey: 'cipher_solves',         tiers: [{ name: 'Bronze', threshold: 5 },   { name: 'Silver', threshold: 25 },  { name: 'Gold', threshold: 100 }] },
  { key: 'mentor',         label: 'Mentor',         icon: '🧭', statKey: 'is_mentor',         binary: true },
  { key: 'discord_linked', label: 'Discord Linked', icon: '💬', statKey: 'discord_linked',    binary: true },
];

export function computeAchievements(stats) {
  return BADGE_DEFS.map(def => {
    const raw = stats[def.statKey];

    if (def.binary) {
      const earned = !!raw;
      return { key: def.key, label: def.label, icon: def.icon, binary: true, earned, value: earned };
    }

    const value = raw ?? 0;
    let tier = null, tierIndex = -1;
    def.tiers.forEach((t, i) => { if (value >= t.threshold) { tier = t.name; tierIndex = i; } });
    const nextTier = def.tiers[tierIndex + 1] ?? null;

    return {
      key: def.key,
      label: def.label,
      icon: def.icon,
      value,
      earned: tierIndex >= 0,
      tier,
      next_tier: nextTier?.name ?? null,
      next_threshold: nextTier?.threshold ?? null,
      max_threshold: def.tiers[def.tiers.length - 1].threshold,
    };
  });
}
