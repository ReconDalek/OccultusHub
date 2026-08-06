import { jsonResponse, errorResponse } from '../middleware/errorHandler.js';
import { getStaffApiKeyForFaction, getRandomUserApiKey, fetchWithRetry } from '../services/tornApiService.js';
import { logInfo, logWarn, logError } from '../services/logger.js';

// ── Personal stats field definitions ─────────────────────────────────────────
// Each entry: key (internal), path (nested cat=all format), label, category,
// stat (Torn v2 ?stat= name — null means private/unavailable via public API).
export const PERSONAL_STAT_FIELDS = [
  // Attacking — Attacks
  { key: 'atk_won',          path: ['attacking','attacks','won'],                         label: 'Attacks Won',          category: 'attacking',     stat: 'attackswon'            },
  { key: 'atk_lost',         path: ['attacking','attacks','lost'],                        label: 'Attacks Lost',         category: 'attacking',     stat: 'attackslost'           },
  { key: 'atk_stalemate',    path: ['attacking','attacks','stalemate'],                   label: 'Stalemates',           category: 'attacking',     stat: 'attacksdraw'           },
  { key: 'atk_assist',       path: ['attacking','attacks','assist'],                      label: 'Assists',              category: 'attacking',     stat: 'attacksassisted'        },
  { key: 'atk_stealth',      path: ['attacking','attacks','stealth'],                     label: 'Stealth Attacks',      category: 'attacking',     stat: 'attacksstealthed'        },
  // Attacking — Defends
  { key: 'def_won',          path: ['attacking','defends','won'],                         label: 'Defends Won',          category: 'attacking',     stat: 'defendswon'            },
  { key: 'def_lost',         path: ['attacking','defends','lost'],                        label: 'Defends Lost',         category: 'attacking',     stat: 'defendslost'           },
  { key: 'def_stalemate',    path: ['attacking','defends','stalemate'],                   label: 'Def. Stalemates',      category: 'attacking',     stat: 'defendsstalemated'      },
  { key: 'def_total',        path: ['attacking','defends','total'],                       label: 'Total Defends',        category: 'attacking',     stat: null                    },
  // Attacking — Combat stats
  { key: 'elo',              path: ['attacking','elo'],                                   label: 'ELO',                  category: 'attacking',     stat: 'elo'                   },
  { key: 'unarmored_wins',   path: ['attacking','unarmored_wins'],                        label: 'Unarmored Wins',       category: 'attacking',     stat: 'unarmoredwon'         },
  { key: 'highest_level',    path: ['attacking','highest_level_beaten'],                  label: 'Highest Level Beaten', category: 'attacking',     stat: 'highestbeaten'    },
  { key: 'killstreak_best',  path: ['attacking','killstreak','best'],                     label: 'Best Killstreak',      category: 'attacking',     stat: 'bestkillstreak'        },
  { key: 'hits_success',     path: ['attacking','hits','success'],                        label: 'Hits',                 category: 'attacking',     stat: 'attackhits'            },
  { key: 'hits_miss',        path: ['attacking','hits','miss'],                           label: 'Misses',               category: 'attacking',     stat: 'attackmisses'          },
  { key: 'hits_critical',    path: ['attacking','hits','critical'],                       label: 'Critical Hits',        category: 'attacking',     stat: 'attackcriticalhits'       },
  { key: 'hits_ohk',         path: ['attacking','hits','one_hit_kills'],                  label: 'One Hit Kills',        category: 'attacking',     stat: 'onehitkills'           },
  { key: 'dmg_total',        path: ['attacking','damage','total'],                        label: 'Total Damage',         category: 'attacking',     stat: 'attackdamage'            },
  { key: 'dmg_best',         path: ['attacking','damage','best'],                         label: 'Best Hit Damage',      category: 'attacking',     stat: 'bestdamage'            },
  // Attacking — Escapes
  { key: 'esc_player',       path: ['attacking','escapes','player'],                      label: 'Player Escapes',       category: 'attacking',     stat: 'yourunaway'            },
  { key: 'esc_foes',         path: ['attacking','escapes','foes'],                        label: 'Foe Escapes',          category: 'attacking',     stat: 'theyrunaway'          },
  // Attacking — Faction
  { key: 'war_hits',         path: ['attacking','faction','ranked_war_hits'],             label: 'Ranked War Hits',      category: 'attacking',     stat: 'rankedwarhits'         },
  { key: 'raid_hits',        path: ['attacking','faction','raid_hits'],                   label: 'Raid Hits',            category: 'attacking',     stat: 'raidhits'              },
  { key: 'faction_respect',  path: ['attacking','faction','respect'],                     label: 'Faction Respect',      category: 'attacking',     stat: 'respectforfaction'     },
  { key: 'faction_retals',   path: ['attacking','faction','retaliations'],                label: 'Retaliations',         category: 'attacking',     stat: 'retals'          },
  { key: 'wall_joins',       path: ['attacking','faction','territory','wall_joins'],      label: 'Wall Joins',           category: 'attacking',     stat: 'territoryjoins'             },
  { key: 'wall_clears',      path: ['attacking','faction','territory','wall_clears'],     label: 'Wall Clears',          category: 'attacking',     stat: 'territoryclears'            },
  { key: 'wall_time',        path: ['attacking','faction','territory','wall_time'],       label: 'Wall Time (s)',        category: 'attacking',     stat: 'territorytime'              },
  // Attacking — Ammunition
  { key: 'ammo_total',       path: ['attacking','ammunition','total'],                    label: 'Ammo Used',            category: 'attacking',     stat: 'roundsfired'           },
  { key: 'ammo_special',     path: ['attacking','ammunition','special'],                  label: 'Special Ammo',         category: 'attacking',     stat: 'specialammoused'       },
  { key: 'ammo_hp',          path: ['attacking','ammunition','hollow_point'],             label: 'Hollow Point',         category: 'attacking',     stat: 'hollowammoused'       },
  { key: 'ammo_tracer',      path: ['attacking','ammunition','tracer'],                   label: 'Tracer',               category: 'attacking',     stat: 'tracerammoused'            },
  { key: 'ammo_piercing',    path: ['attacking','ammunition','piercing'],                 label: 'Piercing Ammo',        category: 'attacking',     stat: 'piercingammoused'          },
  { key: 'ammo_incendiary',  path: ['attacking','ammunition','incendiary'],               label: 'Incendiary',           category: 'attacking',     stat: 'incendiaryammoused'        },
  // Attacking — Mugging
  { key: 'money_mugged',     path: ['attacking','networth','money_mugged'],               label: 'Money Mugged',         category: 'attacking',     stat: 'moneymugged'           },
  { key: 'largest_mug',      path: ['attacking','networth','largest_mug'],                label: 'Largest Mug',          category: 'attacking',     stat: 'largestmug'         },
  { key: 'items_looted',     path: ['attacking','networth','items_looted'],               label: 'Items Looted',         category: 'attacking',     stat: 'itemslooted'           },
  // Jobs
  { key: 'job_points',       path: ['jobs','job_points_used'],                            label: 'Job Points Used',      category: 'jobs',          stat: 'jobpointsused'         },
  { key: 'trains_received',  path: ['jobs','trains_received'],                            label: 'Trains Received',      category: 'jobs',          stat: 'trainsreceived'        },
  // Trading
  { key: 'bought_market',    path: ['trading','items','bought','market'],                 label: 'Market Purchases',     category: 'trading',       stat: 'marketitemsbought'            },
  { key: 'bought_shops',     path: ['trading','items','bought','shops'],                  label: 'Shop Purchases',       category: 'trading',       stat: 'cityitemsbought'              },
  { key: 'auctions_won',     path: ['trading','items','auctions','won'],                  label: 'Auctions Won',         category: 'trading',       stat: 'auctionswon'           },
  { key: 'auctions_sold',    path: ['trading','items','auctions','sold'],                 label: 'Auctions Listed',      category: 'trading',       stat: 'auctionsells'          },
  { key: 'items_sent',       path: ['trading','items','sent'],                            label: 'Items Sent',           category: 'trading',       stat: 'itemssent'             },
  { key: 'trades',           path: ['trading','trades'],                                  label: 'Trades',               category: 'trading',       stat: 'trades'                },
  { key: 'points_bought',    path: ['trading','points','bought'],                         label: 'Points Bought',        category: 'trading',       stat: 'pointsbought'          },
  { key: 'points_sold',      path: ['trading','points','sold'],                           label: 'Points Sold',          category: 'trading',       stat: null                    },
  { key: 'bazaar_customers', path: ['trading','bazaar','customers'],                      label: 'Bazaar Customers',     category: 'trading',       stat: 'bazaarcustomers'       },
  { key: 'bazaar_sales',     path: ['trading','bazaar','sales'],                          label: 'Bazaar Sales',         category: 'trading',       stat: 'bazaarsales'           },
  { key: 'bazaar_profit',    path: ['trading','bazaar','profit'],                         label: 'Bazaar Profit',        category: 'trading',       stat: 'bazaarprofit'          },
  { key: 'imarket_customers',path: ['trading','item_market','customers'],                 label: 'IM Customers',         category: 'trading',       stat: null   },
  { key: 'imarket_sales',    path: ['trading','item_market','sales'],                     label: 'IM Sales',             category: 'trading',       stat: null       },
  { key: 'imarket_revenue',  path: ['trading','item_market','revenue'],                   label: 'IM Revenue',           category: 'trading',       stat: null     },
  // Jail
  { key: 'times_jailed',     path: ['jail','times_jailed'],                               label: 'Times Jailed',         category: 'jail',          stat: 'jailed'                },
  { key: 'busts',            path: ['jail','busts','success'],                            label: 'Busts',                category: 'jail',          stat: 'peoplebusted'          },
  { key: 'bust_fails',       path: ['jail','busts','fails'],                              label: 'Bust Fails',           category: 'jail',          stat: 'failedbusts'           },
  { key: 'bails',            path: ['jail','bails','amount'],                             label: 'Bails',                category: 'jail',          stat: 'peoplebought'          },
  { key: 'bail_fees',        path: ['jail','bails','fees'],                               label: 'Bail Fees',            category: 'jail',          stat: 'peopleboughtspent'              },
  // Hospital
  { key: 'hosp',             path: ['hospital','times_hospitalized'],                     label: 'Times Hosp.',          category: 'hospital',      stat: 'hospital'         },
  { key: 'medical_items',    path: ['hospital','medical_items_used'],                     label: 'Medical Items Used',   category: 'hospital',      stat: 'medicalitemsused'      },
  { key: 'blood_withdrawn',  path: ['hospital','blood_withdrawn'],                        label: 'Blood Withdrawn',      category: 'hospital',      stat: 'bloodwithdrawn'        },
  { key: 'revives',          path: ['hospital','reviving','revives'],                     label: 'Revives Given',        category: 'hospital',      stat: 'revives'               }, // ✓
  { key: 'revives_received', path: ['hospital','reviving','revives_received'],            label: 'Revives Received',     category: 'hospital',      stat: 'revivesreceived'       },
  // Finishing Hits
  { key: 'fh_heavy_arty',   path: ['finishing_hits','heavy_artillery'],                  label: 'Heavy Artillery',      category: 'finishing',     stat: 'heavyhits'    },
  { key: 'fh_machine_guns', path: ['finishing_hits','machine_guns'],                     label: 'Machine Guns',         category: 'finishing',     stat: 'machinehits'        },
  { key: 'fh_rifles',       path: ['finishing_hits','rifles'],                           label: 'Rifles',               category: 'finishing',     stat: 'riflehits'             },
  { key: 'fh_smg',          path: ['finishing_hits','sub_machine_guns'],                 label: 'SMGs',                 category: 'finishing',     stat: 'smghits'               },
  { key: 'fh_shotguns',     path: ['finishing_hits','shotguns'],                         label: 'Shotguns',             category: 'finishing',     stat: 'shotgunhits'           },
  { key: 'fh_pistols',      path: ['finishing_hits','pistols'],                          label: 'Pistols',              category: 'finishing',     stat: 'pistolhits'            },
  { key: 'fh_temporary',    path: ['finishing_hits','temporary'],                        label: 'Temporary',            category: 'finishing',     stat: 'temphits'         },
  { key: 'fh_piercing',     path: ['finishing_hits','piercing'],                         label: 'Piercing',             category: 'finishing',     stat: 'piercinghits'          },
  { key: 'fh_slashing',     path: ['finishing_hits','slashing'],                         label: 'Slashing',             category: 'finishing',     stat: 'slashinghits'          },
  { key: 'fh_clubbing',     path: ['finishing_hits','clubbing'],                         label: 'Clubbing',             category: 'finishing',     stat: 'clubbinghits'          },
  { key: 'fh_mechanical',   path: ['finishing_hits','mechanical'],                       label: 'Mechanical',           category: 'finishing',     stat: 'mechanicalhits'        },
  { key: 'fh_h2h',          path: ['finishing_hits','hand_to_hand'],                     label: 'Hand to Hand',         category: 'finishing',     stat: 'h2hhits'        },
  // Communication
  { key: 'mails_total',     path: ['communication','mails_sent','total'],                label: 'Mails Sent',           category: 'communication', stat: 'mailssent'             },
  { key: 'mails_friends',   path: ['communication','mails_sent','friends'],              label: 'To Friends',           category: 'communication', stat: 'friendmailssent'       },
  { key: 'mails_faction',   path: ['communication','mails_sent','faction'],              label: 'To Faction',           category: 'communication', stat: 'factionmailssent'      },
  { key: 'mails_colleagues',path: ['communication','mails_sent','colleagues'],           label: 'To Colleagues',        category: 'communication', stat: 'companymailssent'    },
  { key: 'classified_ads',  path: ['communication','classified_ads'],                    label: 'Classified Ads',       category: 'communication', stat: 'classifiedadsplaced'   },
  // Crimes
  { key: 'crimes',          path: ['crimes','total'],                                     label: 'Total Crimes',         category: 'crimes',        stat: 'criminaloffenses'           },
  { key: 'oc',              path: ['crimes','offenses','organized_crimes'],               label: 'Org. Crimes',          category: 'crimes',        stat: 'organizedcrimes'       },
  { key: 'crime_vandalism', path: ['crimes','offenses','vandalism'],                      label: 'Vandalism',            category: 'crimes',        stat: 'vandalism'             },
  { key: 'crime_fraud',     path: ['crimes','offenses','fraud'],                          label: 'Fraud',                category: 'crimes',        stat: 'fraud'                 },
  { key: 'crime_theft',     path: ['crimes','offenses','theft'],                          label: 'Theft',                category: 'crimes',        stat: 'theft'                 },
  { key: 'crime_counterfeit',path: ['crimes','offenses','counterfeiting'],                label: 'Counterfeiting',       category: 'crimes',        stat: 'counterfeiting'        },
  { key: 'crime_illicit',   path: ['crimes','offenses','illicit_services'],               label: 'Illicit Services',     category: 'crimes',        stat: 'illicitservices'       },
  { key: 'crime_cyber',     path: ['crimes','offenses','cybercrime'],                     label: 'Cybercrime',           category: 'crimes',        stat: 'cybercrime'            },
  { key: 'crime_extortion', path: ['crimes','offenses','extortion'],                      label: 'Extortion',            category: 'crimes',        stat: 'extortion'             },
  { key: 'crime_illprod',   path: ['crimes','offenses','illegal_production'],             label: 'Illegal Production',   category: 'crimes',        stat: 'illegalproduction'     },
  // Bounties
  { key: 'bounties_placed', path: ['bounties','placed','amount'],                         label: 'Bounties Placed',      category: 'bounties',      stat: 'bountiesplaced'        },
  { key: 'bounty_val_placed',path: ['bounties','placed','value'],                         label: 'Value Placed',         category: 'bounties',      stat: 'totalbountyspent'           },
  { key: 'bounties_coll',   path: ['bounties','collected','amount'],                      label: 'Bounties Collected',   category: 'bounties',      stat: 'bountiescollected'     },
  { key: 'bounty_val_coll', path: ['bounties','collected','value'],                       label: 'Value Collected',      category: 'bounties',      stat: 'totalbountyreward'    },
  { key: 'bounties_received',path: ['bounties','received','amount'],                      label: 'Bounties Received',    category: 'bounties',      stat: 'bountiesreceived'      },
  // Items
  { key: 'items_city',      path: ['items','found','city'],                               label: 'Found in City',        category: 'items',         stat: 'cityfinds'             },
  { key: 'items_dump',      path: ['items','found','dump'],                               label: 'Found in Dump',        category: 'items',         stat: 'dumpfinds'             },
  { key: 'items_trashed',   path: ['items','trashed'],                                    label: 'Items Trashed',        category: 'items',         stat: 'itemsdumped'        },
  { key: 'viruses_coded',   path: ['items','viruses_coded'],                              label: 'Viruses Coded',        category: 'items',         stat: 'virusescoded'            },
  { key: 'books_used',      path: ['items','used','books'],                               label: 'Books Read',           category: 'items',         stat: 'booksread'             },
  { key: 'boosters_used',   path: ['items','used','boosters'],                            label: 'Boosters Used',        category: 'items',         stat: 'boostersused'          },
  { key: 'consumables_used',path: ['items','used','consumables'],                         label: 'Consumables Used',     category: 'items',         stat: 'consumablesused'       },
  { key: 'candy_used',      path: ['items','used','candy'],                               label: 'Candy Used',           category: 'items',         stat: 'candyused'             },
  { key: 'alcohol_used',    path: ['items','used','alcohol'],                             label: 'Alcohol Used',         category: 'items',         stat: 'alcoholused'           },
  { key: 'energy_used',     path: ['items','used','energy'],                              label: 'Energy Items Used',    category: 'items',         stat: 'energydrinkused'       },
  // Travel
  { key: 'travel',          path: ['travel','total'],                                      label: 'Trips',                category: 'travel',        stat: 'traveltimes'           },
  { key: 'travel_time',     path: ['travel','time_spent'],                                label: 'Time Travelling (s)',  category: 'travel',        stat: 'timespenttraveling'         },
  { key: 'travel_items',    path: ['travel','items_bought'],                              label: 'Items Bought Abroad',  category: 'travel',        stat: 'itemsboughtabroad'     },
  { key: 'travel_atk_won',  path: ['travel','attacks_won'],                               label: 'Attacks Won Abroad',   category: 'travel',        stat: 'attackswonabroad'      },
  { key: 'travel_def_lost', path: ['travel','defends_lost'],                              label: 'Defends Lost Abroad',  category: 'travel',        stat: 'defendslostabroad'     },
  { key: 'travel_argentina',path: ['travel','argentina'],                                 label: 'Argentina',            category: 'travel',        stat: 'argtravel'             },
  { key: 'travel_canada',   path: ['travel','canada'],                                    label: 'Canada',               category: 'travel',        stat: 'cantravel'             },
  { key: 'travel_cayman',   path: ['travel','cayman_islands'],                            label: 'Cayman Islands',       category: 'travel',        stat: 'caytravel'         },
  { key: 'travel_china',    path: ['travel','china'],                                     label: 'China',                category: 'travel',        stat: 'chitravel'             },
  { key: 'travel_hawaii',   path: ['travel','hawaii'],                                    label: 'Hawaii',               category: 'travel',        stat: 'hawtravel'             },
  { key: 'travel_japan',    path: ['travel','japan'],                                     label: 'Japan',                category: 'travel',        stat: 'japtravel'             },
  { key: 'travel_mexico',   path: ['travel','mexico'],                                    label: 'Mexico',               category: 'travel',        stat: 'mextravel'             },
  { key: 'travel_uae',      path: ['travel','united_arab_emirates'],                      label: 'UAE',                  category: 'travel',        stat: 'uaetravel'             },
  { key: 'travel_uk',       path: ['travel','united_kingdom'],                            label: 'United Kingdom',       category: 'travel',        stat: 'uktravel'              },
  { key: 'travel_sa',       path: ['travel','south_africa'],                              label: 'South Africa',         category: 'travel',        stat: 'satravel'           },
  { key: 'travel_swiss',    path: ['travel','switzerland'],                               label: 'Switzerland',          category: 'travel',        stat: 'switravel'           },
  // Drugs
  { key: 'drugs',           path: ['drugs','total'],                                       label: 'Total Drugs',          category: 'drugs',         stat: 'drugsused'             }, // ✓
  { key: 'drug_overdoses',  path: ['drugs','overdoses'],                                  label: 'Overdoses',            category: 'drugs',         stat: 'overdosed'             },
  { key: 'drug_rehabs',     path: ['drugs','rehabilitations','amount'],                   label: 'Rehabilitations',      category: 'drugs',         stat: 'rehabs'                }, // ✓
  { key: 'drug_cannabis',   path: ['drugs','cannabis'],                                   label: 'Cannabis',             category: 'drugs',         stat: 'cantaken'              },
  { key: 'drug_ecstasy',    path: ['drugs','ecstasy'],                                    label: 'Ecstasy',              category: 'drugs',         stat: 'exttaken'              },
  { key: 'drug_ketamine',   path: ['drugs','ketamine'],                                   label: 'Ketamine',             category: 'drugs',         stat: 'kettaken'              },
  { key: 'drug_lsd',        path: ['drugs','lsd'],                                        label: 'LSD',                  category: 'drugs',         stat: 'lsdtaken'              },
  { key: 'drug_opium',      path: ['drugs','opium'],                                      label: 'Opium',                category: 'drugs',         stat: 'opitaken'              },
  { key: 'drug_pcp',        path: ['drugs','pcp'],                                        label: 'PCP',                  category: 'drugs',         stat: 'pcptaken'              },
  { key: 'drug_shrooms',    path: ['drugs','shrooms'],                                    label: 'Shrooms',              category: 'drugs',         stat: 'shrtaken'              },
  { key: 'drug_speed',      path: ['drugs','speed'],                                      label: 'Speed',                category: 'drugs',         stat: 'spetaken'              },
  { key: 'drug_vicodin',    path: ['drugs','vicodin'],                                    label: 'Vicodin',              category: 'drugs',         stat: 'victaken'              },
  { key: 'drug_xanax',      path: ['drugs','xanax'],                                      label: 'Xanax',                category: 'drugs',         stat: 'xantaken'              }, // ✓
  // Missions
  { key: 'missions',        path: ['missions','missions'],                                 label: 'Missions',             category: 'missions',      stat: 'missionscompleted'     },
  { key: 'contracts',       path: ['missions','contracts','total'],                        label: 'Contracts',            category: 'missions',      stat: 'contractscompleted'    },
  { key: 'mission_credits', path: ['missions','credits'],                                  label: 'Mission Credits',      category: 'missions',      stat: 'missioncreditsearned'  },
  // Racing
  { key: 'races_entered',   path: ['racing','races','entered'],                           label: 'Races Entered',        category: 'racing',        stat: 'racesentered'          },
  { key: 'races_won',       path: ['racing','races','won'],                               label: 'Races Won',            category: 'racing',        stat: 'raceswon'              },
  { key: 'racing_points',   path: ['racing','points'],                                     label: 'Racing Points',        category: 'racing',        stat: 'racingpointsearned'    },
  // Networth
  { key: 'networth',        path: ['networth','total'],                                    label: 'Net Worth',            category: 'networth',      stat: 'networth'              },
  // Other
  { key: 'active_time',     path: ['other','activity','time'],                             label: 'Active Time (s)',      category: 'other',         stat: 'timeplayed'            },
  { key: 'streak_current',  path: ['other','activity','streak','current'],                label: 'Current Streak',       category: 'other',         stat: 'activestreak'            },
  { key: 'streak_best',     path: ['other','activity','streak','best'],                   label: 'Best Streak',          category: 'other',         stat: 'bestactivestreak'         },
  { key: 'awards',          path: ['other','awards'],                                      label: 'Awards',               category: 'other',         stat: 'awards'                },
  { key: 'merits_bought',   path: ['other','merits_bought'],                              label: 'Merits Bought',        category: 'other',         stat: 'meritsbought'          },
  { key: 'refills_energy',  path: ['other','refills','energy'],                           label: 'Energy Refills',       category: 'other',         stat: 'refills'         },
  { key: 'refills_nerve',   path: ['other','refills','nerve'],                            label: 'Nerve Refills',        category: 'other',         stat: 'nerverefills'          },
  { key: 'donator_days',    path: ['other','donator_days'],                               label: 'Donator Days',         category: 'other',         stat: 'daysbeendonator'           },
  { key: 'ranked_war_wins', path: ['other','ranked_war_wins'],                            label: 'Ranked War Wins',      category: 'other',         stat: null         },
];

function getPath(obj, pathArr) {
  return pathArr.reduce((curr, key) => curr?.[key], obj) ?? 0;
}

export function extractStats(statsObj) {
  const out = {};
  // Flat backfill format: keys are our internal field keys directly
  if (statsObj.__backfill) {
    for (const f of PERSONAL_STAT_FIELDS) out[f.key] = statsObj[f.key] ?? 0;
    return out;
  }
  // Normal nested format from cat=all daily snapshot
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

// Fetch gym energy contributors for a faction — cat=all includes ex-members who contributed.
async function fetchGymEnergy(apiKey) {
  const data = await fetchWithRetry(
    `${TORN_API_BASE}/faction/contributors?stat=gymenergy&cat=all&comment=OccHub`,
    { Authorization: `ApiKey ${apiKey}` }
  );
  return data.contributors || [];
}

// Called by daily cron — snapshot current energy totals for all factions.
// Torn's gymenergy contributor totals only advance once per day — whatever we
// read here (even at 01:00 UTC, an hour into the new day) is still the value
// as of yesterday's end, not today's. Stamp the snapshot with yesterday's
// date to match (same reasoning already applied to personal_stats_snapshots).
export async function takeEnergySnapshot(env) {
  const yesterday    = new Date(Date.now() - 86400000).toISOString().slice(0, 10); // date being stamped
  const twoDaysAgo    = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10); // what the previous run should have stamped
  const now       = Math.floor(Date.now() / 1000);

  // Gap detection — warn if the previous run's snapshot is absent
  const { count: prevRunCount } = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM energy_snapshots WHERE snapshot_date = ?`
  ).bind(twoDaysAgo).first();
  if (!prevRunCount) {
    await logWarn(env, {
      category: 'cron', event: 'energy_snapshot_gap',
      message: `Energy snapshot gap detected: no data for ${twoDaysAgo}. Yesterday's cron may have failed.`,
      meta: { missing_date: twoDaysAgo },
    });
  }

  const results = await Promise.allSettled(
    FACTION_IDS.map(async (factionId) => {
      const apiKeyObj = await getStaffApiKeyForFaction(env, factionId);
      if (!apiKeyObj?.key) throw new Error(`No API key for faction ${factionId}`);

      // fetchWithRetry handles transient errors (3 retries, 2/4/8s backoff)
      const contributors = await fetchGymEnergy(apiKeyObj.key);
      console.log(`[energy snapshot] faction ${factionId}: ${contributors.length} members`);

      const stmt = env.DB.prepare(`
        INSERT INTO energy_snapshots (torn_user_id, username, faction_id, energy_total, snapshot_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(torn_user_id, faction_id, snapshot_date) DO UPDATE SET
          energy_total = excluded.energy_total,
          username     = excluded.username
      `);

      const validContributors = contributors.filter(c => c.value > 0);
      if (validContributors.length) {
        await env.DB.batch(
          validContributors.map(c => stmt.bind(c.id, c.username, factionId, c.value, yesterday, now))
        );
      }

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

// Single-member version of the energy-delta calc below — same per-faction-
// delta logic (a member who switched factions mid-period gets credit summed
// across both, rather than a raw MAX-MIN silently mixing two factions'
// energy_total baselines together) and the same calendar-day average.
// Used by memberProfileController so the profile card's energy figures
// always match what the Energy tab itself would show for the same period.
//
// Baseline is the last snapshot per faction STRICTLY BEFORE fromDate, not the
// first snapshot inside the period — using an in-period snapshot as its own
// zero-point would make that day's own training invisible (delta against
// itself is 0). Falls back to a faction's own first-in-period snapshot only
// when it has no prior data at all (new member/faction combo), same as
// getEnergyMemberBreakdown. Day count is therefore inclusive of both
// endpoints (fromDate through toDate), not the exclusive date difference.
export async function getEnergyDeltaForUser(env, tornUserId, fromDate, toDate) {
  const [priorRows, rows] = await Promise.all([
    env.DB.prepare(
      `SELECT faction_id, energy_total FROM energy_snapshots e1
       WHERE torn_user_id = ? AND snapshot_date < ? AND energy_total > 0
       AND snapshot_date = (
         SELECT MAX(snapshot_date) FROM energy_snapshots e2
         WHERE e2.torn_user_id = e1.torn_user_id AND e2.faction_id = e1.faction_id
           AND e2.snapshot_date < ? AND e2.energy_total > 0
       )`
    ).bind(tornUserId, fromDate, fromDate).all(),
    env.DB.prepare(
      `SELECT faction_id, snapshot_date, energy_total FROM energy_snapshots
       WHERE torn_user_id = ? AND snapshot_date >= ? AND snapshot_date <= ? AND energy_total > 0
       ORDER BY snapshot_date ASC`
    ).bind(tornUserId, fromDate, toDate).all(),
  ]);

  const baselineByFaction = {};
  for (const r of priorRows.results || []) baselineByFaction[r.faction_id] = r.energy_total;

  const latestByFaction = {};
  for (const r of rows.results || []) {
    if (baselineByFaction[r.faction_id] == null) baselineByFaction[r.faction_id] = r.energy_total;
    latestByFaction[r.faction_id] = r.energy_total; // rows ASC — last write wins = latest date
  }

  let totalEnergy = 0;
  for (const factionId of Object.keys(latestByFaction)) {
    totalEnergy += Math.max(0, latestByFaction[factionId] - baselineByFaction[factionId]);
  }

  const fromTs = Date.UTC(...fromDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v)) / 1000;
  const toTs   = Date.UTC(...toDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v)) / 1000;
  const days   = Math.max(1, (toTs - fromTs) / 86400 + 1);

  return { total_energy: totalEnergy, avg_per_day: Math.round(totalEnergy / days) };
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// GET /api/leadership/energy/member-breakdown?userId=X&year=YYYY&month=M(1-12)
// Day-by-day snapshot breakdown for a single member across one calendar month:
// energy trained that specific day, the running month-to-date total, and the
// rolling average (month-to-date total / day-of-month) as of that date — lets
// a leader see exactly which days moved a member's monthly average.
export async function getEnergyMemberBreakdown(request, env) {
  try {
    const url = new URL(request.url);
    const tornUserId = url.searchParams.get('userId');
    if (!tornUserId) return errorResponse('userId is required', 400);

    const now = new Date();
    const year  = parseInt(url.searchParams.get('year'), 10)  || now.getUTCFullYear();
    const month = parseInt(url.searchParams.get('month'), 10) || (now.getUTCMonth() + 1);
    if (month < 1 || month > 12) return errorResponse('month must be 1-12', 400);

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const isCurrentMonth = year === now.getUTCFullYear() && month === (now.getUTCMonth() + 1);
    // Current month caps at yesterday — today's row can't exist until tomorrow's cron.
    const monthEnd = isCurrentMonth
      ? new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      : `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

    // A member can carry a stale row in a faction they've left (frozen energy_total
    // that never updates again) alongside their live faction's row on the same date —
    // same reason getEnergyDeltaForUser/getEnergyActivity sum deltas per faction_id
    // rather than a raw MAX-MIN: mixing two factions' baselines together silently
    // corrupts the numbers. Baseline is therefore tracked per faction_id, and each
    // faction only starts contributing once its own first snapshot is seen.
    const priorRows = await env.DB.prepare(
      `SELECT faction_id, energy_total, snapshot_date, username FROM energy_snapshots
       WHERE torn_user_id = ? AND snapshot_date < ? AND energy_total > 0
       ORDER BY snapshot_date ASC`
    ).bind(tornUserId, monthStart).all();

    const rows = await env.DB.prepare(
      `SELECT faction_id, snapshot_date, energy_total, username FROM energy_snapshots
       WHERE torn_user_id = ? AND snapshot_date >= ? AND snapshot_date <= ? AND energy_total > 0
       ORDER BY snapshot_date ASC`
    ).bind(tornUserId, monthStart, monthEnd).all();

    const priorList = priorRows.results || [];
    const snapshotRows = rows.results || [];
    const username = snapshotRows[snapshotRows.length - 1]?.username
      ?? priorList[priorList.length - 1]?.username ?? null;

    const baselineDate = priorList[priorList.length - 1]?.snapshot_date ?? null;

    // Latest pre-month value per faction (list is ASC, so later entries overwrite).
    const baselineByFaction = {};
    for (const r of priorList) baselineByFaction[r.faction_id] = r.energy_total;

    const byDate = new Map();
    for (const r of snapshotRows) {
      if (!byDate.has(r.snapshot_date)) byDate.set(r.snapshot_date, []);
      byDate.get(r.snapshot_date).push(r);
    }

    const cumulativeByFaction = {};
    let prevMonthTotal = 0;
    const days = [...byDate.keys()].sort().map(date => {
      const dayOfMonth = parseInt(date.slice(8, 10), 10);
      const weekday = WEEKDAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];

      for (const r of byDate.get(date)) {
        if (baselineByFaction[r.faction_id] == null) baselineByFaction[r.faction_id] = r.energy_total;
        cumulativeByFaction[r.faction_id] = Math.max(0, r.energy_total - baselineByFaction[r.faction_id]);
      }
      const monthTotal = Object.values(cumulativeByFaction).reduce((s, v) => s + v, 0);
      const dailyEnergy = Math.max(0, monthTotal - prevMonthTotal);
      const rollingAvg = Math.round(monthTotal / dayOfMonth);
      prevMonthTotal = monthTotal;

      return {
        date,
        weekday,
        day_of_month: dayOfMonth,
        daily_energy: dailyEnergy,
        month_total: monthTotal,
        rolling_avg: rollingAvg,
      };
    });

    return jsonResponse({
      torn_user_id: Number(tornUserId),
      username,
      year, month,
      month_start: monthStart,
      month_end: monthEnd,
      baseline_date: baselineDate,
      days,
    });
  } catch (err) {
    console.error('getEnergyMemberBreakdown error:', err);
    return errorResponse('Failed to fetch energy breakdown', 500);
  }
}

// GET /api/leadership/energy?from=YYYY-MM-DD&to=YYYY-MM-DD
// Diffs stored snapshots between two dates to calculate energy trained in that period.
export async function getEnergyActivity(request, env) {
  try {
    const url = new URL(request.url);

    // Default: start of current UTC month → yesterday (today's snapshot can't
    // exist yet — Torn only updates gymenergy totals once per day, so the
    // earliest today could have a row is tomorrow's cron run).
    const nowDate = new Date();
    const defaultFrom = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo   = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const fromDate = url.searchParams.get('from') || defaultFrom;
    const toDate   = url.searchParams.get('to')   || defaultTo;

    // Sum per-faction deltas so members who switch between factions mid-period
    // get credit for contributions in both factions rather than one overwriting the other.
    // Baseline is the last snapshot per (member, faction) STRICTLY BEFORE fromDate,
    // not the first snapshot inside the period — using an in-period snapshot as its
    // own zero-point would make that day's own training invisible. Falls back to a
    // faction's own first-in-period value only when there's no prior data at all
    // (new member/faction combo within the period) — same pattern getEnergyDeltaForUser
    // and getEnergyMemberBreakdown use.
    const rows = await env.DB.prepare(`
      WITH baseline AS (
        SELECT torn_user_id, faction_id, energy_total AS baseline_value
        FROM (
          SELECT torn_user_id, faction_id, energy_total,
                 ROW_NUMBER() OVER (PARTITION BY torn_user_id, faction_id ORDER BY snapshot_date DESC) AS rn
          FROM energy_snapshots
          WHERE snapshot_date < ? AND energy_total > 0
        )
        WHERE rn = 1
      ),
      in_period AS (
        SELECT
          torn_user_id, faction_id,
          MAX(username)      AS username,
          MIN(snapshot_date)  AS start_date,
          MAX(snapshot_date)  AS end_date,
          MIN(energy_total)   AS first_value,
          MAX(energy_total)   AS latest_value
        FROM energy_snapshots
        WHERE snapshot_date >= ? AND snapshot_date <= ? AND energy_total > 0
        GROUP BY torn_user_id, faction_id
      ),
      per_faction AS (
        SELECT
          ip.torn_user_id, ip.username, ip.start_date, ip.end_date,
          MAX(0, ip.latest_value - COALESCE(b.baseline_value, ip.first_value)) AS faction_delta
        FROM in_period ip
        LEFT JOIN baseline b ON b.torn_user_id = ip.torn_user_id AND b.faction_id = ip.faction_id
      )
      SELECT
        agg.torn_user_id,
        agg.username,
        agg.start_date,
        agg.end_date,
        agg.total_energy,
        fm.level,
        fm.days_in_faction,
        fm.faction_id AS current_faction_id
      FROM (
        SELECT
          torn_user_id,
          MAX(username)      AS username,
          MIN(start_date)    AS start_date,
          MAX(end_date)      AS end_date,
          SUM(faction_delta) AS total_energy
        FROM per_faction
        GROUP BY torn_user_id
        HAVING total_energy > 0
      ) agg
      LEFT JOIN faction_members fm ON fm.torn_user_id = agg.torn_user_id
    `).bind(fromDate, fromDate, toDate).all();

    // Calculate days for avg/day — inclusive of both endpoints (fromDate through
    // toDate), matching the baseline-before-fromDate logic above: every day from
    // fromDate to toDate now genuinely contributes its own measured delta.
    const fromTs = Date.UTC(...fromDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v)) / 1000;
    const toTs   = Date.UTC(...toDate.split('-').map((v, i) => i === 1 ? +v - 1 : +v)) / 1000;
    const days   = Math.max(1, (toTs - fromTs) / 86400 + 1);

    const members = (rows.results || [])
      .map(r => ({
        id:              r.torn_user_id,
        username:        r.username,
        level:           r.level ?? null,
        days_in_faction: r.days_in_faction ?? null,
        faction_id:      r.current_faction_id ?? null,
        start_date:      r.start_date,
        end_date:   r.end_date,
        energy:     r.total_energy,
        avg_day:    Math.round(r.total_energy / days),
      }))
      .sort((a, b) => b.energy - a.energy);

    // Check whether we have any snapshot data at all for this period
    const [snapshotCheck, overallCheck] = await Promise.all([
      env.DB.prepare(
        `SELECT MIN(snapshot_date) as earliest, MAX(snapshot_date) as latest, COUNT(DISTINCT snapshot_date) as days_covered
         FROM energy_snapshots WHERE snapshot_date >= ? AND snapshot_date <= ?`
      ).bind(fromDate, toDate).first(),
      env.DB.prepare(`SELECT MIN(snapshot_date) as overall_earliest FROM energy_snapshots`).first(),
    ]);

    // ── Extras: revives delta from personal stats snapshots ──────────────────
    // Use earliest and latest snapshot within the period per member.
    const [reviveStartRows, reviveEndRows] = await Promise.all([
      env.DB.prepare(`
        SELECT p.torn_user_id,
               CAST(json_extract(p.stats, '$.hospital.reviving.revives') AS INTEGER) AS val
        FROM personal_stats_snapshots p
        INNER JOIN (
          SELECT torn_user_id, MIN(snapshot_date) AS min_date
          FROM personal_stats_snapshots
          WHERE snapshot_date >= ? AND snapshot_date <= ?
          GROUP BY torn_user_id
        ) s ON p.torn_user_id = s.torn_user_id AND p.snapshot_date = s.min_date
      `).bind(fromDate, toDate).all(),
      env.DB.prepare(`
        SELECT p.torn_user_id,
               CAST(json_extract(p.stats, '$.hospital.reviving.revives') AS INTEGER) AS val
        FROM personal_stats_snapshots p
        INNER JOIN (
          SELECT torn_user_id, MAX(snapshot_date) AS max_date
          FROM personal_stats_snapshots
          WHERE snapshot_date >= ? AND snapshot_date <= ?
          GROUP BY torn_user_id
        ) e ON p.torn_user_id = e.torn_user_id AND p.snapshot_date = e.max_date
      `).bind(fromDate, toDate).all(),
    ]);

    const reviveStart = {};
    for (const r of (reviveStartRows.results || [])) reviveStart[r.torn_user_id] = r.val ?? 0;
    const revives = {};
    for (const r of (reviveEndRows.results || [])) {
      const delta = (r.val ?? 0) - (reviveStart[r.torn_user_id] ?? 0);
      if (delta > 0) revives[r.torn_user_id] = delta;
    }

    // ── Extras: attack counts from saved wars + chains in period ─────────────
    const periodFromTs = Math.floor(new Date(fromDate + 'T00:00:00Z').getTime() / 1000);
    const periodToTs   = Math.floor(new Date(toDate   + 'T23:59:59Z').getTime() / 1000);

    const [warHitRows, chainHitRows] = await Promise.all([
      env.DB.prepare(`
        SELECT wh.torn_user_id,
               SUM(wh.war_hits + wh.outside_hits + wh.assists) AS total
        FROM war_hits wh
        JOIN ranked_wars rw ON wh.ranked_war_id = rw.id
        WHERE COALESCE(rw.started_at, rw.scheduled_start) >= ?
          AND COALESCE(rw.started_at, rw.scheduled_start) <= ?
        GROUP BY wh.torn_user_id
      `).bind(periodFromTs, periodToTs).all(),
      env.DB.prepare(`
        SELECT ch.torn_user_id, SUM(ch.total_attacks) AS total
        FROM chain_hits ch
        JOIN chain_cache cc ON ch.torn_chain_id = cc.torn_chain_id
        WHERE cc.start_at >= ? AND cc.start_at <= ?
        GROUP BY ch.torn_user_id
      `).bind(periodFromTs, periodToTs).all(),
    ]);

    const attacks = {};
    for (const r of (warHitRows.results || [])) {
      attacks[r.torn_user_id] = (attacks[r.torn_user_id] ?? 0) + (r.total ?? 0);
    }
    for (const r of (chainHitRows.results || [])) {
      attacks[r.torn_user_id] = (attacks[r.torn_user_id] ?? 0) + (r.total ?? 0);
    }

    return jsonResponse({
      members,
      period: { from: fromDate, to: toDate, days: Math.round(days * 10) / 10 },
      coverage: snapshotCheck,
      overall_earliest: overallCheck?.overall_earliest || null,
      extras: { revives, attacks },
    });
  } catch (error) {
    console.error('getEnergyActivity error:', error);
    return errorResponse('Failed to fetch energy activity', 500);
  }
}

// GET /api/leadership/warnings/generate/energy?year=&month=1-12&factions=33097,9728,9171&includeAttacks=1&includeNewMembers=0
// Source data for Warnings > Generate: one row per member with their gym+attack
// energy total for the selected calendar month and the resulting daily average,
// so leadership can compare it against a per-faction target (entered client-side,
// not stored server-side) and one-click "report" a warning for anyone falling
// short. Mirrors getEnergyActivity's per-faction-delta baseline logic (a member
// switching factions mid-month gets credit summed across both) but scoped to a
// calendar month and restricted to the selected factions only, and — unlike
// getEnergyActivity — does NOT drop zero-energy members, since low/no energy is
// exactly what this report exists to surface.
export async function generateEnergyWarningReport(request, env) {
  try {
    const url  = new URL(request.url);
    const year  = parseInt(url.searchParams.get('year'), 10);
    const month = parseInt(url.searchParams.get('month'), 10);
    if (!year || !month || month < 1 || month > 12) {
      return errorResponse('year and month (1-12) are required', 400);
    }

    const factionsParam = url.searchParams.get('factions');
    const factions = (factionsParam ? factionsParam.split(',') : FACTION_IDS.map(String))
      .map(s => parseInt(s, 10))
      .filter(f => FACTION_IDS.includes(f));
    if (!factions.length) return errorResponse('At least one valid faction is required', 400);

    const includeAttacks    = url.searchParams.get('includeAttacks') !== '0';
    const includeNewMembers = url.searchParams.get('includeNewMembers') === '1';

    const monthStart  = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const nowDate = new Date();
    const isCurrentMonth = year === nowDate.getUTCFullYear() && month === (nowDate.getUTCMonth() + 1);
    // Current month caps data collection at yesterday (today's snapshot doesn't exist
    // yet), but the average is still divided by the full calendar days in the month
    // per the requested "total for the month / days in the month" formula — this
    // report is meant to be run on completed months, so an in-progress month
    // understating its own average is an accepted edge case, not a bug to guard.
    const monthEnd = isCurrentMonth
      ? new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      : `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const ph = factions.map(() => '?').join(',');

    const rows = await env.DB.prepare(`
      WITH baseline AS (
        SELECT torn_user_id, faction_id, energy_total AS baseline_value
        FROM (
          SELECT torn_user_id, faction_id, energy_total,
                 ROW_NUMBER() OVER (PARTITION BY torn_user_id, faction_id ORDER BY snapshot_date DESC) AS rn
          FROM energy_snapshots
          WHERE snapshot_date < ? AND energy_total > 0 AND faction_id IN (${ph})
        )
        WHERE rn = 1
      ),
      in_period AS (
        SELECT
          torn_user_id, faction_id,
          MAX(username)      AS username,
          MIN(snapshot_date)  AS start_date,
          MAX(snapshot_date)  AS end_date,
          MIN(energy_total)   AS first_value,
          MAX(energy_total)   AS latest_value
        FROM energy_snapshots
        WHERE snapshot_date >= ? AND snapshot_date <= ? AND energy_total > 0 AND faction_id IN (${ph})
        GROUP BY torn_user_id, faction_id
      ),
      per_faction AS (
        SELECT
          ip.torn_user_id, ip.faction_id, ip.username, ip.start_date, ip.end_date,
          MAX(0, ip.latest_value - COALESCE(b.baseline_value, ip.first_value)) AS faction_delta,
          CASE WHEN b.baseline_value IS NULL THEN 1 ELSE 0 END AS is_new_in_faction
        FROM in_period ip
        LEFT JOIN baseline b ON b.torn_user_id = ip.torn_user_id AND b.faction_id = ip.faction_id
      )
      SELECT
        agg.torn_user_id,
        agg.username,
        agg.start_date,
        agg.end_date,
        agg.gym_energy,
        agg.all_factions_new,
        fm.level,
        fm.faction_id AS current_faction_id,
        fm.is_active
      FROM (
        SELECT
          torn_user_id,
          MAX(username)          AS username,
          MIN(start_date)        AS start_date,
          MAX(end_date)          AS end_date,
          SUM(faction_delta)     AS gym_energy,
          MIN(is_new_in_faction) AS all_factions_new
        FROM per_faction
        GROUP BY torn_user_id
      ) agg
      LEFT JOIN faction_members fm ON fm.torn_user_id = agg.torn_user_id
    `).bind(monthStart, ...factions, monthStart, monthEnd, ...factions).all();

    // ── Attacks: saved wars + chains in period, restricted to the selected factions ──
    const attacks = {};
    if (includeAttacks) {
      const periodFromTs = Math.floor(new Date(monthStart + 'T00:00:00Z').getTime() / 1000);
      const periodToTs   = Math.floor(new Date(monthEnd   + 'T23:59:59Z').getTime() / 1000);

      const [warHitRows, chainHitRows] = await Promise.all([
        env.DB.prepare(`
          SELECT wh.torn_user_id, SUM(wh.war_hits + wh.outside_hits + wh.assists) AS total
          FROM war_hits wh
          JOIN ranked_wars rw ON wh.ranked_war_id = rw.id
          WHERE wh.faction_id IN (${ph})
            AND COALESCE(rw.started_at, rw.scheduled_start) >= ?
            AND COALESCE(rw.started_at, rw.scheduled_start) <= ?
          GROUP BY wh.torn_user_id
        `).bind(...factions, periodFromTs, periodToTs).all(),
        env.DB.prepare(`
          SELECT ch.torn_user_id, SUM(ch.total_attacks) AS total
          FROM chain_hits ch
          JOIN chain_cache cc ON ch.torn_chain_id = cc.torn_chain_id
          WHERE ch.faction_id IN (${ph}) AND cc.start_at >= ? AND cc.start_at <= ?
          GROUP BY ch.torn_user_id
        `).bind(...factions, periodFromTs, periodToTs).all(),
      ]);
      for (const r of (warHitRows.results || []))   attacks[r.torn_user_id] = (attacks[r.torn_user_id] ?? 0) + (r.total ?? 0);
      for (const r of (chainHitRows.results || [])) attacks[r.torn_user_id] = (attacks[r.torn_user_id] ?? 0) + (r.total ?? 0);
    }

    const members = [];
    for (const r of (rows.results || [])) {
      // "New member" = no snapshot at all before this month, in any of the
      // selected factions, AND their first snapshot fell after the 1st —
      // tracking genuinely started mid-month rather than the month just
      // happening to be their first with data from day one.
      const joinedMidMonth = Boolean(r.all_factions_new) && r.start_date > monthStart;
      if (joinedMidMonth && !includeNewMembers) continue;

      const gymEnergy    = r.gym_energy || 0;
      const attackHits   = attacks[r.torn_user_id] || 0;
      const attackEnergy = attackHits * 25;
      const totalEnergy  = gymEnergy + attackEnergy;

      let trackedDays = daysInMonth;
      if (joinedMidMonth && r.start_date) {
        const startTs = Date.parse(r.start_date + 'T00:00:00Z');
        const endTs   = Date.parse(monthEnd + 'T00:00:00Z');
        trackedDays = Math.max(1, Math.round((endTs - startTs) / 86400000) + 1);
      }

      members.push({
        torn_user_id:     r.torn_user_id,
        username:         r.username,
        faction_id:       r.current_faction_id ?? null,
        level:            r.level ?? null,
        is_active:        r.is_active ?? null,
        gym_energy:       gymEnergy,
        attack_hits:      attackHits,
        attack_energy:    attackEnergy,
        total_energy:     totalEnergy,
        start_date:       r.start_date,
        end_date:         r.end_date,
        joined_mid_month: joinedMidMonth,
        tracked_days:     trackedDays,
        avg_per_day:      Math.round(totalEnergy / trackedDays),
      });
    }

    members.sort((a, b) => a.avg_per_day - b.avg_per_day);

    return jsonResponse({
      year, month,
      month_start: monthStart, month_end: monthEnd,
      days_in_month: daysInMonth,
      factions,
      include_attacks: includeAttacks,
      include_new_members: includeNewMembers,
      members,
    });
  } catch (err) {
    console.error('generateEnergyWarningReport error:', err);
    return errorResponse('Failed to generate energy warning report', 500);
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
      await fetchAndStoreMemberStats(env, member, keyObj.key, yesterday, now);
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
        await fetchAndStoreMemberStats(env, member, keyObj.key, yesterday, now);
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

    // ── Single-day mode: return raw snapshot totals, not deltas ───────────────
    if (fromDate === toDate) {
      const rows = await env.DB.prepare(`
        SELECT torn_user_id, username, faction_id, stats, snapshot_date
        FROM personal_stats_snapshots WHERE snapshot_date = ?
      `).bind(fromDate).all();

      const members = [];
      for (const r of (rows.results || [])) {
        let statsObj;
        try { statsObj = JSON.parse(r.stats); } catch { continue; }
        members.push({ id: r.torn_user_id, username: r.username, faction_id: r.faction_id, snapshot_date: r.snapshot_date, stats: extractStats(statsObj) });
      }

      const coverage = await env.DB.prepare(
        `SELECT MIN(snapshot_date) AS earliest, MAX(snapshot_date) AS latest, COUNT(DISTINCT snapshot_date) AS days_covered FROM personal_stats_snapshots`
      ).first();

      return jsonResponse({ members, fields: FIELDS_META, mode: 'day', period: { from: fromDate, to: toDate, days: 1 }, coverage });
    }

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
      let prevVal  = null;
      const points = [];
      for (const r of member.rows) {
        let statsObj;
        try { statsObj = JSON.parse(r.stats); } catch { continue; }
        const val = getPath(statsObj, field.path);
        if (baseline === null) { baseline = val; prevVal = val; continue; }
        const dayGain = Math.max(0, val - prevVal);
        points.push({ date: r.snapshot_date, delta: Math.max(0, val - baseline), day_gain: dayGain, total: val });
        prevVal = val;
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

// ── Personal stats gaps ───────────────────────────────────────────────────────
// GET /api/leadership/personal-stats/gaps
// For each date that has snapshot data, returns active members with a missing row.
export async function getPersonalStatsGaps(request, env) {
  try {
    const gapRows = await env.DB.prepare(`
      SELECT fm.torn_user_id, fm.username, fm.faction_id, dates.snapshot_date
      FROM faction_members fm
      CROSS JOIN (
        SELECT DISTINCT snapshot_date
        FROM personal_stats_snapshots
        ORDER BY snapshot_date DESC
        LIMIT 60
      ) dates
      WHERE fm.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM personal_stats_snapshots p
          WHERE p.torn_user_id = fm.torn_user_id AND p.snapshot_date = dates.snapshot_date
        )
        AND EXISTS (
          SELECT 1 FROM personal_stats_snapshots p2
          WHERE p2.torn_user_id = fm.torn_user_id AND p2.snapshot_date < dates.snapshot_date
        )
      ORDER BY dates.snapshot_date DESC, fm.username
    `).all();

    const rows = gapRows.results || [];

    const byDate = {};
    for (const row of rows) {
      if (!byDate[row.snapshot_date]) {
        byDate[row.snapshot_date] = {
          date: row.snapshot_date,
          timestamp: Math.floor(new Date(row.snapshot_date + 'T01:00:00Z').getTime() / 1000),
          missing: [],
        };
      }
      byDate[row.snapshot_date].missing.push({
        torn_user_id: row.torn_user_id,
        username: row.username,
        faction_id: row.faction_id,
      });
    }

    return jsonResponse({
      gaps: Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)),
      total: rows.length,
    });
  } catch (err) {
    console.error('getPersonalStatsGaps error:', err);
    return errorResponse('Failed to fetch personal stats gaps', 500);
  }
}

// Stat names for ?stat= backfill, batched into groups of 10.
const BACKFILL_STAT_CHUNKS = [];
{ const names = PERSONAL_STAT_FIELDS.filter(f => f.stat).map(f => f.stat);
  for (let i = 0; i < names.length; i += 10) BACKFILL_STAT_CHUNKS.push(names.slice(i, i + 10)); }

// ── Personal stats backfill ───────────────────────────────────────────────────
// POST /api/leadership/personal-stats/backfill
// Body: { torn_user_id, snapshot_date }
// Uses ?stat=name1,name2,...&timestamp= (10 per call) which correctly returns
// historical data. Stores result in a flat __backfill format read by extractStats.
export async function backfillPersonalStats(request, env, user) {
  try {
    const { torn_user_id, snapshot_date } = await request.json();

    if (!torn_user_id || !snapshot_date) {
      return errorResponse('Missing required fields: torn_user_id, snapshot_date', 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot_date)) {
      return errorResponse('Invalid snapshot_date format, expected YYYY-MM-DD', 400);
    }

    const member = await env.DB.prepare(
      `SELECT torn_user_id, username, faction_id FROM faction_members WHERE torn_user_id = ?`
    ).bind(torn_user_id).first();
    if (!member) return errorResponse(`Member ${torn_user_id} not found in faction_members`, 404);

    const apiKeyObj = await getRandomUserApiKey(env);
    if (!apiKeyObj?.key) return errorResponse('No API key available', 503);

    // 01:00 UTC on the missing date — matches when the daily cron runs.
    const timestamp = Math.floor(new Date(snapshot_date + 'T01:00:00Z').getTime() / 1000);

    // Build all chunk URLs up front so we can include them in debug output.
    const allUrls = BACKFILL_STAT_CHUNKS.map(chunk =>
      `${TORN_API_BASE}/user/${torn_user_id}/personalstats?stat=${chunk.join(',')}&timestamp=${timestamp}&comment=OccHub`
    );

    console.log('[backfill] starting', JSON.stringify({ torn_user_id, snapshot_date, timestamp, chunks: allUrls.length }));

    // Fetch all chunks sequentially with a brief pause to avoid rate limits.
    // stat= response: { personalstats: [{name, value, timestamp}] }
    const flatByStatName = {};
    const chunkErrors = [];

    for (let i = 0; i < allUrls.length; i++) {
      try {
        const data = await fetchWithRetry(allUrls[i], { Authorization: `ApiKey ${apiKeyObj.key}` });
        if (Array.isArray(data?.personalstats)) {
          for (const entry of data.personalstats) {
            if (entry?.name) flatByStatName[entry.name] = entry.value ?? 0;
          }
        }
      } catch (err) {
        chunkErrors.push(`chunk${i} [${BACKFILL_STAT_CHUNKS[i].join(',')}]: ${err?.message}`);
      }
      if (i < allUrls.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    if (chunkErrors.length > 0) {
      return errorResponse(
        `Backfill aborted — ${chunkErrors.length} chunk(s) failed: ${chunkErrors.join(', ')}. Please retry.`,
        502
      );
    }

    // Map stat names back to our internal field keys.
    const flatResult = { __backfill: true };
    for (const f of PERSONAL_STAT_FIELDS) {
      flatResult[f.key] = flatByStatName[f.stat] ?? 0;
    }

    // Validate against the NEXT snapshot after the backfill date.
    // - ANY probe field strictly higher than next → abort (corruption)
    // - At least 2 probe fields strictly lower than next → confirmed historical
    // - Fewer than 2 confirmed → abort (can't verify data is historical)
    const nextRow = await env.DB.prepare(
      `SELECT snapshot_date, stats FROM personal_stats_snapshots
       WHERE torn_user_id = ? AND snapshot_date > ?
       ORDER BY snapshot_date ASC LIMIT 1`
    ).bind(torn_user_id, snapshot_date).first();

    if (nextRow) {
      try {
        const fetchedStats = extractStats(flatResult);
        const nextStats    = extractStats(JSON.parse(nextRow.stats));
        const probeFields  = ['active_time', 'drugs', 'travel_time', 'crimes', 'dmg_total', 'atk_won', 'war_hits', 'streak_current'];
        const probeComparisons = {};
        for (const f of probeFields) probeComparisons[f] = { backfill: fetchedStats[f] ?? null, next: nextStats[f] ?? null };
        const corrupted = probeFields.filter(f => (fetchedStats[f] ?? 0) > (nextStats[f] ?? 0));
        const confirmed = probeFields.filter(f => (fetchedStats[f] ?? 0) < (nextStats[f] ?? 0));

        console.log('[backfill] probe comparison', JSON.stringify({ torn_user_id, snapshot_date, next_snapshot_date: nextRow.snapshot_date, comparisons: probeComparisons, corrupted_fields: corrupted, confirmed_fields: confirmed }));

        if (corrupted.length > 0) {
          return new Response(JSON.stringify({
            error: `Backfill data is corrupt for ${snapshot_date} — values exceed ${nextRow.snapshot_date} snapshot for: ${corrupted.join(', ')}.`,
            inflation_detected: true, corrupted_fields: corrupted,
            debug: { timestamp, snapshot_date, urls: allUrls, comparisons: probeComparisons, next_snapshot_date: nextRow.snapshot_date },
          }), { status: 422, headers: { 'Content-Type': 'application/json' } });
        }

        if (confirmed.length < 2) {
          return new Response(JSON.stringify({
            error: `Cannot confirm backfill is historical for ${snapshot_date} — only ${confirmed.length} probe field(s) lower than ${nextRow.snapshot_date} snapshot (${confirmed.join(', ') || 'none'}).`,
            inflation_detected: true, confirmed_fields: confirmed,
            debug: { timestamp, snapshot_date, urls: allUrls, comparisons: probeComparisons, next_snapshot_date: nextRow.snapshot_date },
          }), { status: 422, headers: { 'Content-Type': 'application/json' } });
        }
      } catch (validationErr) {
        console.error('[backfill] validation error', validationErr?.message);
      }
    } else {
      console.log('[backfill] skipped validation — no later snapshot found', { torn_user_id, snapshot_date });
    }

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      INSERT INTO personal_stats_snapshots (torn_user_id, username, faction_id, snapshot_date, stats, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(torn_user_id, snapshot_date) DO UPDATE SET
        stats = excluded.stats, username = excluded.username, faction_id = excluded.faction_id
    `).bind(torn_user_id, member.username, member.faction_id, snapshot_date, JSON.stringify(flatResult), now).run();

    await logInfo(env, {
      category: 'admin', event: 'personal_stats_backfill',
      message: `Personal stats backfilled for ${member.username} on ${snapshot_date}`,
      torn_user_id: user?.userId, username: user?.username,
      meta: { target_user: torn_user_id, target_username: member.username, snapshot_date, timestamp },
    });

    return jsonResponse({
      success: true, torn_user_id, username: member.username, snapshot_date,
      stats_fetched: Object.keys(flatByStatName).length,
      debug: { timestamp, snapshot_date, urls: allUrls },
    });
  } catch (err) {
    console.error('backfillPersonalStats error:', err);
    return errorResponse(`Backfill failed: ${err.message}`, 500);
  }
}

// ── Delete a specific personal stats snapshot ─────────────────────────────────
// DELETE /api/leadership/personal-stats/snapshot?torn_user_id=X&snapshot_date=YYYY-MM-DD
export async function deletePersonalStatsSnapshot(request, env, user) {
  try {
    const url           = new URL(request.url);
    const torn_user_id  = parseInt(url.searchParams.get('torn_user_id'), 10);
    const snapshot_date = url.searchParams.get('snapshot_date');

    if (!torn_user_id || !snapshot_date) {
      return errorResponse('Missing torn_user_id or snapshot_date', 400);
    }

    const result = await env.DB.prepare(
      `DELETE FROM personal_stats_snapshots WHERE torn_user_id = ? AND snapshot_date = ?`
    ).bind(torn_user_id, snapshot_date).run();

    const deleted = result.meta?.changes ?? 0;

    await logInfo(env, {
      category: 'admin', event: 'personal_stats_delete_snapshot',
      message: `Personal stats snapshot deleted for user ${torn_user_id} on ${snapshot_date}`,
      torn_user_id: user?.userId, username: user?.username,
      meta: { target_user: torn_user_id, snapshot_date, deleted },
    });

    return jsonResponse({ success: true, deleted });
  } catch (err) {
    console.error('deletePersonalStatsSnapshot error:', err);
    return errorResponse('Failed to delete snapshot', 500);
  }
}

// ── Admin: manually trigger energy snapshot ───────────────────────────────────
export async function triggerEnergySnapshotAdmin(request, env) {
  try {
    const summary = await takeEnergySnapshot(env);
    const errors = summary.filter(r => r.error);
    const totalSaved = summary.filter(r => !r.error).reduce((s, r) => s + r.count, 0);
    return jsonResponse({
      message: `Energy snapshot: ${totalSaved} members stored across ${FACTION_IDS.length - errors.length} factions`,
      summary,
      errors: errors.length,
    });
  } catch (error) {
    console.error('triggerEnergySnapshotAdmin error:', error);
    return errorResponse('Energy snapshot failed: ' + error.message, 500);
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
    // Snapshots are stamped with the date their data represents (yesterday,
    // relative to when the cron actually ran) — "today" can never have a row.
    const today = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
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
