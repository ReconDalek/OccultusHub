import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getRandomApiKeyForFaction, fetchWithRetry } from '../services/tornApiService.js';
import { logInfo, logWarn, logError } from '../services/logger.js';

// ── Personal stats field definitions ─────────────────────────────────────────
// Each entry: key (flat identifier), path (nested in personalstats), label, category
const PERSONAL_STAT_FIELDS = [
  // Attacking — Attacks
  { key: 'atk_won',          path: ['attacking','attacks','won'],                         label: 'Attacks Won',          category: 'attacking' },
  { key: 'atk_lost',         path: ['attacking','attacks','lost'],                        label: 'Attacks Lost',         category: 'attacking' },
  { key: 'atk_stalemate',    path: ['attacking','attacks','stalemate'],                   label: 'Stalemates',           category: 'attacking' },
  { key: 'atk_assist',       path: ['attacking','attacks','assist'],                      label: 'Assists',              category: 'attacking' },
  { key: 'atk_stealth',      path: ['attacking','attacks','stealth'],                     label: 'Stealth Attacks',      category: 'attacking' },
  // Attacking — Defends
  { key: 'def_won',          path: ['attacking','defends','won'],                         label: 'Defends Won',          category: 'attacking' },
  { key: 'def_lost',         path: ['attacking','defends','lost'],                        label: 'Defends Lost',         category: 'attacking' },
  { key: 'def_stalemate',    path: ['attacking','defends','stalemate'],                   label: 'Def. Stalemates',      category: 'attacking' },
  { key: 'def_total',        path: ['attacking','defends','total'],                       label: 'Total Defends',        category: 'attacking' },
  // Attacking — Combat stats
  { key: 'elo',              path: ['attacking','elo'],                                   label: 'ELO',                  category: 'attacking' },
  { key: 'unarmored_wins',   path: ['attacking','unarmored_wins'],                        label: 'Unarmored Wins',       category: 'attacking' },
  { key: 'highest_level',    path: ['attacking','highest_level_beaten'],                  label: 'Highest Level Beaten', category: 'attacking' },
  { key: 'killstreak_best',  path: ['attacking','killstreak','best'],                     label: 'Best Killstreak',      category: 'attacking' },
  { key: 'hits_success',     path: ['attacking','hits','success'],                        label: 'Hits',                 category: 'attacking' },
  { key: 'hits_miss',        path: ['attacking','hits','miss'],                           label: 'Misses',               category: 'attacking' },
  { key: 'hits_critical',    path: ['attacking','hits','critical'],                       label: 'Critical Hits',        category: 'attacking' },
  { key: 'hits_ohk',         path: ['attacking','hits','one_hit_kills'],                  label: 'One Hit Kills',        category: 'attacking' },
  { key: 'dmg_total',        path: ['attacking','damage','total'],                        label: 'Total Damage',         category: 'attacking' },
  { key: 'dmg_best',         path: ['attacking','damage','best'],                         label: 'Best Hit Damage',      category: 'attacking' },
  // Attacking — Escapes
  { key: 'esc_player',       path: ['attacking','escapes','player'],                      label: 'Player Escapes',       category: 'attacking' },
  { key: 'esc_foes',         path: ['attacking','escapes','foes'],                        label: 'Foe Escapes',          category: 'attacking' },
  // Attacking — Faction
  { key: 'war_hits',         path: ['attacking','faction','ranked_war_hits'],             label: 'Ranked War Hits',      category: 'attacking' },
  { key: 'raid_hits',        path: ['attacking','faction','raid_hits'],                   label: 'Raid Hits',            category: 'attacking' },
  { key: 'faction_respect',  path: ['attacking','faction','respect'],                     label: 'Faction Respect',      category: 'attacking' },
  { key: 'faction_retals',   path: ['attacking','faction','retaliations'],                label: 'Retaliations',         category: 'attacking' },
  { key: 'wall_joins',       path: ['attacking','faction','territory','wall_joins'],      label: 'Wall Joins',           category: 'attacking' },
  { key: 'wall_clears',      path: ['attacking','faction','territory','wall_clears'],     label: 'Wall Clears',          category: 'attacking' },
  { key: 'wall_time',        path: ['attacking','faction','territory','wall_time'],       label: 'Wall Time (s)',        category: 'attacking' },
  // Attacking — Ammunition
  { key: 'ammo_total',       path: ['attacking','ammunition','total'],                    label: 'Ammo Used',            category: 'attacking' },
  { key: 'ammo_special',     path: ['attacking','ammunition','special'],                  label: 'Special Ammo',         category: 'attacking' },
  { key: 'ammo_hp',          path: ['attacking','ammunition','hollow_point'],             label: 'Hollow Point',         category: 'attacking' },
  { key: 'ammo_tracer',      path: ['attacking','ammunition','tracer'],                   label: 'Tracer',               category: 'attacking' },
  { key: 'ammo_piercing',    path: ['attacking','ammunition','piercing'],                 label: 'Piercing Ammo',        category: 'attacking' },
  { key: 'ammo_incendiary',  path: ['attacking','ammunition','incendiary'],               label: 'Incendiary',           category: 'attacking' },
  // Attacking — Mugging
  { key: 'money_mugged',     path: ['attacking','networth','money_mugged'],               label: 'Money Mugged',         category: 'attacking' },
  { key: 'largest_mug',      path: ['attacking','networth','largest_mug'],                label: 'Largest Mug',          category: 'attacking' },
  { key: 'items_looted',     path: ['attacking','networth','items_looted'],               label: 'Items Looted',         category: 'attacking' },
  // Jobs
  { key: 'job_points',       path: ['jobs','job_points_used'],                            label: 'Job Points Used',      category: 'jobs'      },
  { key: 'trains_received',  path: ['jobs','trains_received'],                            label: 'Trains Received',      category: 'jobs'      },
  // Trading
  { key: 'bought_market',    path: ['trading','items','bought','market'],                 label: 'Market Purchases',     category: 'trading'   },
  { key: 'bought_shops',     path: ['trading','items','bought','shops'],                  label: 'Shop Purchases',       category: 'trading'   },
  { key: 'auctions_won',     path: ['trading','items','auctions','won'],                  label: 'Auctions Won',         category: 'trading'   },
  { key: 'auctions_sold',    path: ['trading','items','auctions','sold'],                 label: 'Auctions Listed',      category: 'trading'   },
  { key: 'items_sent',       path: ['trading','items','sent'],                            label: 'Items Sent',           category: 'trading'   },
  { key: 'trades',           path: ['trading','trades'],                                  label: 'Trades',               category: 'trading'   },
  { key: 'points_bought',    path: ['trading','points','bought'],                         label: 'Points Bought',        category: 'trading'   },
  { key: 'points_sold',      path: ['trading','points','sold'],                           label: 'Points Sold',          category: 'trading'   },
  { key: 'bazaar_customers', path: ['trading','bazaar','customers'],                      label: 'Bazaar Customers',     category: 'trading'   },
  { key: 'bazaar_sales',     path: ['trading','bazaar','sales'],                          label: 'Bazaar Sales',         category: 'trading'   },
  { key: 'bazaar_profit',    path: ['trading','bazaar','profit'],                         label: 'Bazaar Profit',        category: 'trading'   },
  { key: 'imarket_customers',path: ['trading','item_market','customers'],                 label: 'IM Customers',         category: 'trading'   },
  { key: 'imarket_sales',    path: ['trading','item_market','sales'],                     label: 'IM Sales',             category: 'trading'   },
  { key: 'imarket_revenue',  path: ['trading','item_market','revenue'],                   label: 'IM Revenue',           category: 'trading'   },
  // Jail
  { key: 'times_jailed',     path: ['jail','times_jailed'],                               label: 'Times Jailed',         category: 'jail'      },
  { key: 'busts',            path: ['jail','busts','success'],                            label: 'Busts',                category: 'jail'      },
  { key: 'bust_fails',       path: ['jail','busts','fails'],                              label: 'Bust Fails',           category: 'jail'      },
  { key: 'bails',            path: ['jail','bails','amount'],                             label: 'Bails',                category: 'jail'      },
  { key: 'bail_fees',        path: ['jail','bails','fees'],                               label: 'Bail Fees',            category: 'jail'      },
  // Hospital
  { key: 'hosp',             path: ['hospital','times_hospitalized'],                     label: 'Times Hosp.',          category: 'hospital'  },
  { key: 'medical_items',    path: ['hospital','medical_items_used'],                     label: 'Medical Items Used',   category: 'hospital'  },
  { key: 'blood_withdrawn',  path: ['hospital','blood_withdrawn'],                        label: 'Blood Withdrawn',      category: 'hospital'  },
  { key: 'revives',          path: ['hospital','reviving','revives'],                     label: 'Revives Given',        category: 'hospital'  },
  { key: 'revives_received', path: ['hospital','reviving','revives_received'],            label: 'Revives Received',     category: 'hospital'  },
  // Finishing Hits
  { key: 'fh_heavy_arty',   path: ['finishing_hits','heavy_artillery'],                  label: 'Heavy Artillery',      category: 'finishing' },
  { key: 'fh_machine_guns', path: ['finishing_hits','machine_guns'],                     label: 'Machine Guns',         category: 'finishing' },
  { key: 'fh_rifles',       path: ['finishing_hits','rifles'],                           label: 'Rifles',               category: 'finishing' },
  { key: 'fh_smg',          path: ['finishing_hits','sub_machine_guns'],                 label: 'SMGs',                 category: 'finishing' },
  { key: 'fh_shotguns',     path: ['finishing_hits','shotguns'],                         label: 'Shotguns',             category: 'finishing' },
  { key: 'fh_pistols',      path: ['finishing_hits','pistols'],                          label: 'Pistols',              category: 'finishing' },
  { key: 'fh_temporary',    path: ['finishing_hits','temporary'],                        label: 'Temporary',            category: 'finishing' },
  { key: 'fh_piercing',     path: ['finishing_hits','piercing'],                         label: 'Piercing',             category: 'finishing' },
  { key: 'fh_slashing',     path: ['finishing_hits','slashing'],                         label: 'Slashing',             category: 'finishing' },
  { key: 'fh_clubbing',     path: ['finishing_hits','clubbing'],                         label: 'Clubbing',             category: 'finishing' },
  { key: 'fh_mechanical',   path: ['finishing_hits','mechanical'],                       label: 'Mechanical',           category: 'finishing' },
  { key: 'fh_h2h',          path: ['finishing_hits','hand_to_hand'],                     label: 'Hand to Hand',         category: 'finishing' },
  // Communication
  { key: 'mails_total',     path: ['communication','mails_sent','total'],                label: 'Mails Sent',           category: 'communication' },
  { key: 'mails_friends',   path: ['communication','mails_sent','friends'],              label: 'To Friends',           category: 'communication' },
  { key: 'mails_faction',   path: ['communication','mails_sent','faction'],              label: 'To Faction',           category: 'communication' },
  { key: 'mails_colleagues',path: ['communication','mails_sent','colleagues'],           label: 'To Colleagues',        category: 'communication' },
  { key: 'classified_ads',  path: ['communication','classified_ads'],                    label: 'Classified Ads',       category: 'communication' },
  // Crimes
  { key: 'crimes',          path: ['crimes','total'],                                     label: 'Total Crimes',         category: 'crimes'    },
  { key: 'oc',              path: ['crimes','offenses','organized_crimes'],               label: 'Org. Crimes',          category: 'crimes'    },
  { key: 'crime_vandalism', path: ['crimes','offenses','vandalism'],                      label: 'Vandalism',            category: 'crimes'    },
  { key: 'crime_fraud',     path: ['crimes','offenses','fraud'],                          label: 'Fraud',                category: 'crimes'    },
  { key: 'crime_theft',     path: ['crimes','offenses','theft'],                          label: 'Theft',                category: 'crimes'    },
  { key: 'crime_counterfeit',path: ['crimes','offenses','counterfeiting'],                label: 'Counterfeiting',       category: 'crimes'    },
  { key: 'crime_illicit',   path: ['crimes','offenses','illicit_services'],               label: 'Illicit Services',     category: 'crimes'    },
  { key: 'crime_cyber',     path: ['crimes','offenses','cybercrime'],                     label: 'Cybercrime',           category: 'crimes'    },
  { key: 'crime_extortion', path: ['crimes','offenses','extortion'],                      label: 'Extortion',            category: 'crimes'    },
  { key: 'crime_illprod',   path: ['crimes','offenses','illegal_production'],             label: 'Illegal Production',   category: 'crimes'    },
  // Bounties
  { key: 'bounties_placed', path: ['bounties','placed','amount'],                         label: 'Bounties Placed',      category: 'bounties'  },
  { key: 'bounty_val_placed',path: ['bounties','placed','value'],                         label: 'Value Placed',         category: 'bounties'  },
  { key: 'bounties_coll',   path: ['bounties','collected','amount'],                      label: 'Bounties Collected',   category: 'bounties'  },
  { key: 'bounty_val_coll', path: ['bounties','collected','value'],                       label: 'Value Collected',      category: 'bounties'  },
  { key: 'bounties_received',path: ['bounties','received','amount'],                      label: 'Bounties Received',    category: 'bounties'  },
  // Items
  { key: 'items_city',      path: ['items','found','city'],                               label: 'Found in City',        category: 'items'     },
  { key: 'items_dump',      path: ['items','found','dump'],                               label: 'Found in Dump',        category: 'items'     },
  { key: 'items_trashed',   path: ['items','trashed'],                                    label: 'Items Trashed',        category: 'items'     },
  { key: 'viruses_coded',   path: ['items','viruses_coded'],                              label: 'Viruses Coded',        category: 'items'     },
  { key: 'books_used',      path: ['items','used','books'],                               label: 'Books Read',           category: 'items'     },
  { key: 'boosters_used',   path: ['items','used','boosters'],                            label: 'Boosters Used',        category: 'items'     },
  { key: 'consumables_used',path: ['items','used','consumables'],                         label: 'Consumables Used',     category: 'items'     },
  { key: 'candy_used',      path: ['items','used','candy'],                               label: 'Candy Used',           category: 'items'     },
  { key: 'alcohol_used',    path: ['items','used','alcohol'],                             label: 'Alcohol Used',         category: 'items'     },
  { key: 'energy_used',     path: ['items','used','energy'],                              label: 'Energy Items Used',    category: 'items'     },
  // Travel
  { key: 'travel',          path: ['travel','total'],                                      label: 'Trips',                category: 'travel'    },
  { key: 'travel_time',     path: ['travel','time_spent'],                                label: 'Time Travelling (s)',  category: 'travel'    },
  { key: 'travel_items',    path: ['travel','items_bought'],                              label: 'Items Bought Abroad',  category: 'travel'    },
  { key: 'travel_atk_won',  path: ['travel','attacks_won'],                               label: 'Attacks Won Abroad',   category: 'travel'    },
  { key: 'travel_def_lost', path: ['travel','defends_lost'],                              label: 'Defends Lost Abroad',  category: 'travel'    },
  { key: 'travel_argentina',path: ['travel','argentina'],                                 label: 'Argentina',            category: 'travel'    },
  { key: 'travel_canada',   path: ['travel','canada'],                                    label: 'Canada',               category: 'travel'    },
  { key: 'travel_cayman',   path: ['travel','cayman_islands'],                            label: 'Cayman Islands',       category: 'travel'    },
  { key: 'travel_china',    path: ['travel','china'],                                     label: 'China',                category: 'travel'    },
  { key: 'travel_hawaii',   path: ['travel','hawaii'],                                    label: 'Hawaii',               category: 'travel'    },
  { key: 'travel_japan',    path: ['travel','japan'],                                     label: 'Japan',                category: 'travel'    },
  { key: 'travel_mexico',   path: ['travel','mexico'],                                    label: 'Mexico',               category: 'travel'    },
  { key: 'travel_uae',      path: ['travel','united_arab_emirates'],                      label: 'UAE',                  category: 'travel'    },
  { key: 'travel_uk',       path: ['travel','united_kingdom'],                            label: 'United Kingdom',       category: 'travel'    },
  { key: 'travel_sa',       path: ['travel','south_africa'],                              label: 'South Africa',         category: 'travel'    },
  { key: 'travel_swiss',    path: ['travel','switzerland'],                               label: 'Switzerland',          category: 'travel'    },
  // Drugs
  { key: 'drugs',           path: ['drugs','total'],                                       label: 'Total Drugs',          category: 'drugs'     },
  { key: 'drug_overdoses',  path: ['drugs','overdoses'],                                  label: 'Overdoses',            category: 'drugs'     },
  { key: 'drug_rehabs',     path: ['drugs','rehabilitations','amount'],                   label: 'Rehabilitations',      category: 'drugs'     },
  { key: 'drug_cannabis',   path: ['drugs','cannabis'],                                   label: 'Cannabis',             category: 'drugs'     },
  { key: 'drug_ecstasy',    path: ['drugs','ecstasy'],                                    label: 'Ecstasy',              category: 'drugs'     },
  { key: 'drug_ketamine',   path: ['drugs','ketamine'],                                   label: 'Ketamine',             category: 'drugs'     },
  { key: 'drug_lsd',        path: ['drugs','lsd'],                                        label: 'LSD',                  category: 'drugs'     },
  { key: 'drug_opium',      path: ['drugs','opium'],                                      label: 'Opium',                category: 'drugs'     },
  { key: 'drug_pcp',        path: ['drugs','pcp'],                                        label: 'PCP',                  category: 'drugs'     },
  { key: 'drug_shrooms',    path: ['drugs','shrooms'],                                    label: 'Shrooms',              category: 'drugs'     },
  { key: 'drug_speed',      path: ['drugs','speed'],                                      label: 'Speed',                category: 'drugs'     },
  { key: 'drug_vicodin',    path: ['drugs','vicodin'],                                    label: 'Vicodin',              category: 'drugs'     },
  { key: 'drug_xanax',      path: ['drugs','xanax'],                                      label: 'Xanax',                category: 'drugs'     },
  // Missions
  { key: 'missions',        path: ['missions','missions'],                                 label: 'Missions',             category: 'missions'  },
  { key: 'contracts',       path: ['missions','contracts','total'],                        label: 'Contracts',            category: 'missions'  },
  { key: 'mission_credits', path: ['missions','credits'],                                  label: 'Mission Credits',      category: 'missions'  },
  // Racing
  { key: 'races_entered',   path: ['racing','races','entered'],                           label: 'Races Entered',        category: 'racing'    },
  { key: 'races_won',       path: ['racing','races','won'],                               label: 'Races Won',            category: 'racing'    },
  { key: 'racing_points',   path: ['racing','points'],                                     label: 'Racing Points',        category: 'racing'    },
  // Networth
  { key: 'networth',        path: ['networth','total'],                                    label: 'Net Worth',            category: 'networth'  },
  // Other
  { key: 'active_time',     path: ['other','activity','time'],                             label: 'Active Time (s)',      category: 'other'     },
  { key: 'streak_current',  path: ['other','activity','streak','current'],                label: 'Current Streak',       category: 'other'     },
  { key: 'streak_best',     path: ['other','activity','streak','best'],                   label: 'Best Streak',          category: 'other'     },
  { key: 'awards',          path: ['other','awards'],                                      label: 'Awards',               category: 'other'     },
  { key: 'merits_bought',   path: ['other','merits_bought'],                              label: 'Merits Bought',        category: 'other'     },
  { key: 'refills_energy',  path: ['other','refills','energy'],                           label: 'Energy Refills',       category: 'other'     },
  { key: 'refills_nerve',   path: ['other','refills','nerve'],                            label: 'Nerve Refills',        category: 'other'     },
  { key: 'donator_days',    path: ['other','donator_days'],                               label: 'Donator Days',         category: 'other'     },
  { key: 'ranked_war_wins', path: ['other','ranked_war_wins'],                            label: 'Ranked War Wins',      category: 'other'     },
];

function getPath(obj, pathArr) {
  return pathArr.reduce((curr, key) => curr?.[key], obj) ?? 0;
}

function extractStats(statsObj) {
  const out = {};
  for (const f of PERSONAL_STAT_FIELDS) out[f.key] = getPath(statsObj, f.path);
  return out;
}

// Round-robin key pool with per-key 60s rate limiting (max 45 calls/key/min)
class KeyPool {
  constructor(keys) {
    this.keys = keys.map(k => ({ ...k, used: 0, windowStart: Date.now() }));
    this.idx = 0;
  }
  async getKey() {
    const now = Date.now();
    for (const k of this.keys) {
      if (now - k.windowStart >= 60000) { k.used = 0; k.windowStart = now; }
    }
    for (let i = 0; i < this.keys.length; i++) {
      const k = this.keys[(this.idx + i) % this.keys.length];
      if (k.used < 45) {
        k.used++;
        this.idx = (this.idx + i + 1) % this.keys.length;
        return k;
      }
    }
    // All keys at limit — wait for earliest window to expire
    const earliest = Math.min(...this.keys.map(k => k.windowStart));
    const waitMs = 60000 - (Date.now() - earliest) + 500;
    console.log(`[personal stats] rate limit reached, waiting ${Math.round(waitMs / 1000)}s`);
    await new Promise(r => setTimeout(r, waitMs));
    return this.getKey();
  }
}

const FACTION_IDS = [33097, 9728, 9171];
const TORN_API_BASE = 'https://api.torn.com/v2';

// Fetch current gym energy contributors for a faction (cat=current = active members only).
async function fetchGymEnergy(apiKey) {
  const data = await fetchWithRetry(
    `${TORN_API_BASE}/faction/contributors?stat=gymenergy&cat=current&comment=OccHub`,
    { Authorization: `ApiKey ${apiKey}` }
  );
  return data.contributors || [];
}

// Called by daily cron — snapshot current energy totals for all factions.
export async function takeEnergySnapshot(env) {
  const today     = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const now       = Math.floor(Date.now() / 1000);

  // Gap detection — warn if yesterday's snapshot is absent
  const { count: yesterdayCount } = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM energy_snapshots WHERE snapshot_date = ?`
  ).bind(yesterday).first();
  if (!yesterdayCount) {
    await logWarn(env, {
      category: 'cron', event: 'energy_snapshot_gap',
      message: `Energy snapshot gap detected: no data for ${yesterday}. Yesterday's cron may have failed.`,
      meta: { missing_date: yesterday },
    });
  }

  const results = await Promise.allSettled(
    FACTION_IDS.map(async (factionId) => {
      const apiKeyObj = await getRandomApiKeyForFaction(env, factionId);
      if (!apiKeyObj?.key) throw new Error(`No API key for faction ${factionId}`);

      // fetchWithRetry handles transient errors (3 retries, 2/4/8s backoff)
      const contributors = await fetchGymEnergy(apiKeyObj.key);
      console.log(`[energy snapshot] faction ${factionId}: ${contributors.length} members`);

      const stmt = env.DB.prepare(`
        INSERT INTO energy_snapshots (torn_user_id, username, faction_id, energy_total, snapshot_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(torn_user_id, snapshot_date) DO UPDATE SET
          energy_total = excluded.energy_total,
          username     = excluded.username,
          faction_id   = excluded.faction_id
      `);

      await env.DB.batch(
        contributors.map(c => stmt.bind(c.id, c.username, factionId, c.value || 0, today, now))
      );

      return { factionId, count: contributors.length };
    })
  );

  // Purge snapshots older than 6 months
  await env.DB.prepare(
    `DELETE FROM energy_snapshots WHERE snapshot_date < date('now', '-6 months')`
  ).run();

  const summary    = results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message });
  const errors     = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);
  const totalSaved = results.filter(r => r.status === 'fulfilled').reduce((s, r) => s + r.value.count, 0);

  await logInfo(env, {
    category: 'cron', event: 'energy_snapshot',
    message: `Energy snapshot complete: ${totalSaved} members saved across ${FACTION_IDS.length} factions`,
    meta: { summary, errors: errors.length ? errors : undefined },
  });
  if (errors.length) {
    await logError(env, {
      category: 'cron', event: 'energy_snapshot_failed',
      message: `Energy snapshot failed for ${errors.length} faction(s): ${errors.join(', ')}`,
      meta: { errors },
    });
  }
  console.log('[energy snapshot] complete:', JSON.stringify(summary));
  return summary;
}

// GET /api/leadership/energy?from=YYYY-MM-DD&to=YYYY-MM-DD
// Diffs stored snapshots between two dates to calculate energy trained in that period.
export async function getEnergyActivity(request, env) {
  try {
    const url = new URL(request.url);

    // Default: start of current UTC month → today
    const nowDate = new Date();
    const defaultFrom = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo   = nowDate.toISOString().slice(0, 10);

    const fromDate = url.searchParams.get('from') || defaultFrom;
    const toDate   = url.searchParams.get('to')   || defaultTo;

    // Find the earliest snapshot on or after fromDate for each member,
    // and the latest snapshot on or before toDate. Diff = energy in period.
    const rows = await env.DB.prepare(`
      SELECT
        torn_user_id,
        MAX(username) AS username,
        MIN(CASE WHEN snapshot_date >= ? THEN energy_total END) AS start_energy,
        MAX(CASE WHEN snapshot_date <= ? THEN energy_total END) AS end_energy
      FROM energy_snapshots
      WHERE snapshot_date >= ? AND snapshot_date <= ?
      GROUP BY torn_user_id
      HAVING end_energy IS NOT NULL AND start_energy IS NOT NULL
         AND end_energy > start_energy
    `).bind(fromDate, toDate, fromDate, toDate).all();

    // Calculate days for avg/day
    const fromTs = Date.UTC(...fromDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v)) / 1000;
    const toTs   = Date.UTC(...toDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v)) / 1000;
    const days   = Math.max(1, (toTs - fromTs) / 86400);

    const members = (rows.results || [])
      .map(r => ({
        id:       r.torn_user_id,
        username: r.username,
        energy:   r.end_energy - r.start_energy,
        avg_day:  Math.round((r.end_energy - r.start_energy) / days),
      }))
      .sort((a, b) => b.energy - a.energy);

    // Check whether we have any snapshot data at all for this period
    const snapshotCheck = await env.DB.prepare(
      `SELECT MIN(snapshot_date) as earliest, MAX(snapshot_date) as latest, COUNT(DISTINCT snapshot_date) as days_covered
       FROM energy_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ?`
    ).bind(fromDate, toDate).first();

    return jsonResponse({
      members,
      period: { from: fromDate, to: toDate, days: Math.round(days * 10) / 10 },
      coverage: snapshotCheck,
    });
  } catch (error) {
    console.error('getEnergyActivity error:', error);
    return errorResponse('Failed to fetch energy activity', 500);
  }
}

// Fetch and store a single member's personalstats snapshot for the given date.
// Returns true on success, throws on failure (caller decides retry strategy).
async function fetchAndStoreMemberStats(env, member, apiKey, date, now) {
  const data = await fetchWithRetry(
    `${TORN_API_BASE}/user/${member.torn_user_id}/personalstats?cat=all&comment=OccHub`,
    { Authorization: `ApiKey ${apiKey}` }
  );
  await env.DB.prepare(`
    INSERT INTO personal_stats_snapshots (torn_user_id, username, faction_id, snapshot_date, stats, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(torn_user_id, snapshot_date) DO UPDATE SET
      stats      = excluded.stats,
      username   = excluded.username,
      faction_id = excluded.faction_id
  `).bind(member.torn_user_id, member.username, member.faction_id, date, JSON.stringify(data.personalstats), now).run();
  return true;
}

// ── Personal stats snapshot ───────────────────────────────────────────────────
// Called by daily cron — snapshots personalstats for every active faction member.
export async function takePersonalStatsSnapshot(env) {
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const now       = Math.floor(Date.now() / 1000);

  // Gap detection — warn if yesterday's snapshot has fewer members than today's active count
  const memberRows = await env.DB.prepare(
    `SELECT torn_user_id, username, faction_id FROM faction_members WHERE is_active = 1`
  ).all();
  const members = memberRows.results || [];

  if (!members.length) {
    await logWarn(env, { category: 'cron', event: 'personal_stats_no_members', message: 'No active members for personal stats snapshot' });
    return;
  }

  const { count: yesterdayCount } = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM personal_stats_snapshots WHERE snapshot_date = ?`
  ).bind(yesterday).first();
  if (yesterdayCount === 0) {
    await logWarn(env, {
      category: 'cron', event: 'personal_stats_gap',
      message: `Personal stats gap detected: no data for ${yesterday}. Trigger manual snapshot if needed.`,
      meta: { missing_date: yesterday, active_members: members.length },
    });
  } else if (yesterdayCount < members.length * 0.8) {
    await logWarn(env, {
      category: 'cron', event: 'personal_stats_gap',
      message: `Personal stats partial gap: only ${yesterdayCount}/${members.length} members captured for ${yesterday}.`,
      meta: { missing_date: yesterday, captured: yesterdayCount, active_members: members.length },
    });
  }

  // Load all registered API keys
  const keyRows = await env.DB.prepare(
    `SELECT api_key, torn_user_id, username FROM users WHERE api_key IS NOT NULL`
  ).all();
  const keys = (keyRows.results || []).map(r => {
    try { return { key: atob(r.api_key), tornUserId: r.torn_user_id, username: r.username }; }
    catch { return null; }
  }).filter(Boolean);

  if (!keys.length) {
    await logError(env, { category: 'cron', event: 'personal_stats_no_keys', message: 'No valid API keys for personal stats snapshot' });
    return;
  }

  const pool = new KeyPool(keys);

  // ── Pass 1: main run ────────────────────────────────────────────────────────
  let success = 0;
  const transientFailures = []; // members to retry in pass 2
  const permanentErrors   = []; // Torn API errors / bad member IDs

  for (const member of members) {
    const keyObj = await pool.getKey();
    try {
      await fetchAndStoreMemberStats(env, member, keyObj.key, today, now);
      success++;
    } catch (e) {
      // fetchWithRetry already exhausted retries for transient errors.
      // Classify: Torn API app errors are permanent; anything else may be transient.
      const isAppError = e.message.startsWith('Torn API error:');
      if (isAppError) {
        permanentErrors.push({ id: member.torn_user_id, user: member.username, error: e.message });
      } else {
        transientFailures.push(member);
      }
    }
  }

  // ── Pass 2: retry transient failures after a 15s pause ─────────────────────
  let pass2Success = 0;
  const pass2Errors = [];

  if (transientFailures.length) {
    console.log(`[personal stats] pass 2: retrying ${transientFailures.length} transient failures after 15s`);
    await new Promise(r => setTimeout(r, 15000));

    for (const member of transientFailures) {
      const keyObj = await pool.getKey();
      try {
        await fetchAndStoreMemberStats(env, member, keyObj.key, today, now);
        success++;
        pass2Success++;
      } catch (e) {
        pass2Errors.push({ id: member.torn_user_id, user: member.username, error: e.message });
      }
    }
  }

  const totalErrors = permanentErrors.length + pass2Errors.length;
  const allErrors   = [...permanentErrors, ...pass2Errors];

  // Purge snapshots older than 6 months
  await env.DB.prepare(`DELETE FROM personal_stats_snapshots WHERE snapshot_date < date('now', '-6 months')`).run();

  await logInfo(env, {
    category: 'cron', event: 'personal_stats_snapshot',
    message: `Personal stats snapshot: ${success}/${members.length} saved, ${totalErrors} failed` +
             (pass2Success ? ` (${pass2Success} recovered in pass 2)` : ''),
    meta: {
      success, total: members.length, keys_available: keys.length,
      pass2_recovered: pass2Success,
      permanent_errors: permanentErrors.length,
      transient_errors: pass2Errors.length,
      errors_detail: allErrors.length ? allErrors.slice(0, 30) : undefined,
    },
  });
  if (totalErrors) {
    await logWarn(env, {
      category: 'cron', event: 'personal_stats_snapshot_errors',
      message: `Personal stats: ${totalErrors} members still failed after retry`,
      meta: { errors_detail: allErrors.slice(0, 30) },
    });
  }

  console.log(`[personal stats] complete: ${success} saved, ${totalErrors} errors, ${pass2Success} recovered`);
  return { stored: success, skipped: totalErrors, total: members.length };
}

// ── Personal stats query ──────────────────────────────────────────────────────
// GET /api/leadership/personal-stats?mode=latest
// GET /api/leadership/personal-stats?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function getPersonalStats(request, env) {
  try {
    const url = new URL(request.url);
    const FIELDS_META = PERSONAL_STAT_FIELDS.map(f => ({ key: f.key, label: f.label, category: f.category }));

    // ── Latest mode: raw totals from each member's most recent snapshot ────────
    if (url.searchParams.get('mode') === 'latest') {
      let rows;
      try {
        rows = await env.DB.prepare(`
          SELECT p.torn_user_id, p.username, p.faction_id, p.stats, p.snapshot_date
          FROM personal_stats_snapshots p
          INNER JOIN (
            SELECT torn_user_id, MAX(snapshot_date) AS max_date
            FROM personal_stats_snapshots
            GROUP BY torn_user_id
          ) m ON p.torn_user_id = m.torn_user_id AND p.snapshot_date = m.max_date
        `).all();
      } catch (dbErr) {
        console.error('getPersonalStats latest DB error:', dbErr);
        return jsonResponse({ members: [], fields: FIELDS_META, mode: 'latest', coverage: { earliest: null, latest: null, days_covered: 0 } });
      }

      const members = [];
      for (const r of (rows.results || [])) {
        let statsObj;
        try { statsObj = JSON.parse(r.stats); } catch { continue; }
        members.push({ id: r.torn_user_id, username: r.username, faction_id: r.faction_id, snapshot_date: r.snapshot_date, stats: extractStats(statsObj) });
      }

      const coverage = await env.DB.prepare(
        `SELECT MIN(snapshot_date) AS earliest, MAX(snapshot_date) AS latest, COUNT(DISTINCT snapshot_date) AS days_covered FROM personal_stats_snapshots`
      ).first();

      return jsonResponse({ members, fields: FIELDS_META, mode: 'latest', coverage });
    }

    // ── Range mode: gain (delta) between earliest and latest snapshot in range ─
    const nowDate = new Date();
    const defaultFrom = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo   = nowDate.toISOString().slice(0, 10);
    const fromDate = url.searchParams.get('from') || defaultFrom;
    const toDate   = url.searchParams.get('to')   || defaultTo;

    let startRows, endRows;
    try {
      [startRows, endRows] = await Promise.all([
        env.DB.prepare(`
          SELECT p.torn_user_id, p.username, p.faction_id, p.stats
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
    } catch (dbErr) {
      console.error('getPersonalStats DB error:', dbErr);
      return jsonResponse({ members: [], fields: FIELDS_META, period: { from: fromDate, to: toDate, days: 0 }, coverage: { earliest: null, latest: null, days_covered: 0 } });
    }

    const endMap = new Map();
    for (const r of (endRows.results || [])) {
      try { endMap.set(r.torn_user_id, JSON.parse(r.stats)); } catch { /* skip */ }
    }

    const fromTs = Date.UTC(...fromDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v));
    const toTs   = Date.UTC(...toDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v));
    const days   = Math.max(1, (toTs - fromTs) / 86400000);

    const members = [];
    for (const r of (startRows.results || [])) {
      const endStats = endMap.get(r.torn_user_id);
      if (!endStats) continue;
      let startStats;
      try { startStats = JSON.parse(r.stats); } catch { continue; }

      const startExtracted = extractStats(startStats);
      const endExtracted   = extractStats(endStats);

      const delta = {};
      for (const f of PERSONAL_STAT_FIELDS) {
        delta[f.key] = Math.max(0, (endExtracted[f.key] || 0) - (startExtracted[f.key] || 0));
      }

      members.push({ id: r.torn_user_id, username: r.username, faction_id: r.faction_id, stats: delta });
    }

    const coverage = await env.DB.prepare(
      `SELECT MIN(snapshot_date) AS earliest, MAX(snapshot_date) AS latest, COUNT(DISTINCT snapshot_date) AS days_covered
       FROM personal_stats_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ?`
    ).bind(fromDate, toDate).first();

    return jsonResponse({ members, fields: FIELDS_META, mode: 'range', period: { from: fromDate, to: toDate, days: Math.round(days * 10) / 10 }, coverage });
  } catch (error) {
    console.error('getPersonalStats error:', error);
    return errorResponse('Failed to fetch personal stats', 500);
  }
}

// ── Personal stats compare ────────────────────────────────────────────────────
// GET /api/leadership/personal-stats/compare?members=id1,id2&stat=war_hits&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns per-day delta values for each requested member so the frontend can draw a line chart.
export async function getPersonalStatsCompare(request, env) {
  try {
    const url = new URL(request.url);
    const memberParam = url.searchParams.get('members') || '';
    const statKey     = url.searchParams.get('stat') || 'war_hits';
    const nowDate     = new Date();
    const defaultFrom = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo   = nowDate.toISOString().slice(0, 10);
    const fromDate    = url.searchParams.get('from') || defaultFrom;
    const toDate      = url.searchParams.get('to')   || defaultTo;

    const memberIds = memberParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)).slice(0, 4);
    if (!memberIds.length) return errorResponse('No member IDs provided', 400);

    const field = PERSONAL_STAT_FIELDS.find(f => f.key === statKey);
    if (!field) return errorResponse(`Unknown stat key: ${statKey}`, 400);

    // Load every snapshot in range for the requested members
    const placeholders = memberIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT torn_user_id, username, faction_id, snapshot_date, stats
      FROM personal_stats_snapshots
      WHERE torn_user_id IN (${placeholders})
        AND snapshot_date >= ? AND snapshot_date <= ?
      ORDER BY torn_user_id ASC, snapshot_date ASC
    `).bind(...memberIds, fromDate, toDate).all();

    // Group by member
    const byMember = new Map();
    for (const r of (rows.results || [])) {
      if (!byMember.has(r.torn_user_id)) {
        byMember.set(r.torn_user_id, { id: r.torn_user_id, username: r.username, faction_id: r.faction_id, rows: [] });
      }
      byMember.get(r.torn_user_id).rows.push(r);
    }

    const series = [];
    for (const id of memberIds) {
      const member = byMember.get(id);
      if (!member) { series.push({ id, username: null, faction_id: null, points: [] }); continue; }

      let baseline = null;
      const points = [];
      for (const r of member.rows) {
        let statsObj;
        try { statsObj = JSON.parse(r.stats); } catch { continue; }
        const val = getPath(statsObj, field.path);
        if (baseline === null) baseline = val;
        points.push({ date: r.snapshot_date, delta: Math.max(0, val - baseline) });
      }

      series.push({ id: member.id, username: member.username, faction_id: member.faction_id, points });
    }

    return jsonResponse({
      series,
      stat: { key: field.key, label: field.label },
      period: { from: fromDate, to: toDate },
    });
  } catch (error) {
    console.error('getPersonalStatsCompare error:', error);
    return errorResponse('Failed to fetch comparison data', 500);
  }
}

// ── Admin: manually trigger personal stats snapshot ───────────────────────────
export async function triggerPersonalStatsSnapshotAdmin(request, env) {
  try {
    const result = await takePersonalStatsSnapshot(env);
    return jsonResponse({ message: `Snapshot complete: ${result.stored} members stored, ${result.skipped} skipped`, result });
  } catch (error) {
    console.error('triggerPersonalStatsSnapshotAdmin error:', error);
    return errorResponse('Snapshot failed: ' + error.message, 500);
  }
}

// ── Admin: personal stats snapshot status ────────────────────────────────────
export async function getPersonalStatsSnapshotStatus(request, env) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [overall, todayRow] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(DISTINCT torn_user_id) AS members, COUNT(DISTINCT snapshot_date) AS days,
                MIN(snapshot_date) AS earliest, MAX(snapshot_date) AS latest
         FROM personal_stats_snapshots`
      ).first(),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM personal_stats_snapshots WHERE snapshot_date = ?`
      ).bind(today).first(),
    ]);
    return jsonResponse({
      ...(overall || { members: 0, days: 0, earliest: null, latest: null }),
      today: todayRow?.count ?? 0,
      today_date: today,
    });
  } catch (error) {
    return jsonResponse({ members: 0, days: 0, earliest: null, latest: null, today: 0 });
  }
}
