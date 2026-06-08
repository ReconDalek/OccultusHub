-- Test data for ranked war tracking UI

INSERT OR IGNORE INTO ranked_wars (faction_id, opponent_faction_id, opponent_faction_name, torn_war_id, status, scheduled_start, started_at, ended_at, result, rank_change, bonus_respect, last_attack_fetched, last_checked_at) VALUES (33097, 27312, 'SA Succession', 42344, 'completed', 1779548422, 1779774000, 1779774485, 'lost', 'Ranked down from Diamond to Platinum III', 9172, 1779774485, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ranked_wars (faction_id, opponent_faction_id, opponent_faction_name, torn_war_id, status, scheduled_start, started_at, ended_at, result, rank_change, bonus_respect, last_attack_fetched, last_checked_at) VALUES (33097, 10174, 'AQUA-Poseidon', 41421, 'completed', 1778358457, 1778458457, 1778558457, 'lost', 'Ranked down from Diamond I to Diamond', 9142, 1778558457, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ranked_wars (faction_id, opponent_faction_id, opponent_faction_name, torn_war_id, status, scheduled_start, started_at, ended_at, result, rank_change, bonus_respect, last_attack_fetched, last_checked_at) VALUES (33097, 8765, 'Dark Matter', NULL, 'active', 1780500000, 1780600000, NULL, NULL, NULL, NULL, 1780820000, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ranked_wars (faction_id, opponent_faction_id, opponent_faction_name, torn_war_id, status, scheduled_start, started_at, ended_at, result, rank_change, bonus_respect, last_attack_fetched, last_checked_at) VALUES (9728, 15234, 'Vanguard Elite', 43100, 'completed', 1779200000, 1779300000, 1779400000, 'won', 'Ranked up from Gold II to Gold III', 5200, 1779400000, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ranked_wars (faction_id, opponent_faction_id, opponent_faction_name, torn_war_id, status, scheduled_start, started_at, ended_at, result, rank_change, bonus_respect, last_attack_fetched, last_checked_at) VALUES (9728, 22871, 'Iron Wolves', NULL, 'matched', 1780900000, NULL, NULL, NULL, NULL, NULL, 0, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO ranked_wars (faction_id, opponent_faction_id, opponent_faction_name, torn_war_id, status, scheduled_start, started_at, ended_at, result, rank_change, bonus_respect, last_attack_fetched, last_checked_at) VALUES (9171, 31456, 'Shadow Pact', 42800, 'completed', 1778900000, 1779000000, 1779100000, 'lost', 'Ranked down from Silver I to Silver', 3100, 1779100000, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522001, 1291268, 'TugaRambo', 9001, 'EnemyAlpha', 'war_attack', 'Hospitalized', 10.50, 2.63, 0, 3.00, 1780820100 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522002, 1291268, 'TugaRambo', 9002, 'EnemyBeta', 'war_attack', 'Hospitalized', 11.20, 2.80, 0, 3.00, 1780820200 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522003, 1291268, 'TugaRambo', 9003, 'EnemyGamma', 'war_attack', 'Mugged', 9.80, 2.45, 0, 3.00, 1780820300 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522004, 1291268, 'TugaRambo', 9004, 'EnemyDelta', 'war_attack', 'Escape', 0, 3.10, 0, 3.00, 1780820400 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522005, 3431288, 'Kunyiw', 9001, 'EnemyAlpha', 'war_attack', 'Hospitalized', 8.40, 2.10, 0, 2.80, 1780820500 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522006, 3431288, 'Kunyiw', 9002, 'EnemyBeta', 'war_attack', 'Hospitalized', 9.10, 2.28, 0, 2.80, 1780820600 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522007, 3431288, 'Kunyiw', 9003, 'EnemyGamma', 'outside_attack', 'Mugged', 3.20, 0.80, 0, 1.77, 1780820700 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522008, 3659067, 'KlattLadd', 9005, 'EnemyEpsilon', 'war_attack', 'Hospitalized', 12.30, 3.08, 0, 3.00, 1780820800 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522009, 3659067, 'KlattLadd', 5550001, 'RandomTarget', 'outside_attack', 'Attacked', 2.07, 0.52, 0, 1.77, 1780820900 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522010, 9010, 'EnemyAttacker', 1291268, 'TugaRambo', 'war_defend', 'Hospitalized', 0, 15.20, 0, 2.50, 1780821000 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522011, 9010, 'EnemyAttacker', 3431288, 'Kunyiw', 'war_defend', 'Escape', 0, 0, 0, 2.50, 1780821100 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522012, 9011, 'EnemyAttacker2', 3659067, 'KlattLadd', 'war_defend', 'Hospitalized', 0, 12.60, 0, 3.00, 1780821200 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522013, 3439382, 'TezSteg', 9006, 'EnemyZeta', 'war_attack', 'Mugged', 7.80, 1.95, 0, 2.50, 1780821300 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_attacks (ranked_war_id, faction_id, torn_attack_id, attacker_id, attacker_name, defender_id, defender_name, attack_type, result, respect_gain, respect_loss, is_interrupted, fair_fight, started_at) SELECT id, 33097, 481522014, 3439382, 'TezSteg', 9001, 'EnemyAlpha', 'war_attack', 'Hospitalized', 9.40, 2.35, 0, 3.00, 1780821400 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_armory_usage (ranked_war_id, faction_id, torn_news_id, torn_user_id, username, item_name, used_at) SELECT id, 33097, 'test_arm_001', 1291268, 'TugaRambo', 'Xanax', 1780820050 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_armory_usage (ranked_war_id, faction_id, torn_news_id, torn_user_id, username, item_name, used_at) SELECT id, 33097, 'test_arm_002', 1291268, 'TugaRambo', 'Xanax', 1780820150 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_armory_usage (ranked_war_id, faction_id, torn_news_id, torn_user_id, username, item_name, used_at) SELECT id, 33097, 'test_arm_003', 1291268, 'TugaRambo', 'First Aid Kit', 1780820250 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_armory_usage (ranked_war_id, faction_id, torn_news_id, torn_user_id, username, item_name, used_at) SELECT id, 33097, 'test_arm_004', 3431288, 'Kunyiw', 'Xanax', 1780820350 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_armory_usage (ranked_war_id, faction_id, torn_news_id, torn_user_id, username, item_name, used_at) SELECT id, 33097, 'test_arm_005', 3431288, 'Kunyiw', 'Blood Bag', 1780820450 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_armory_usage (ranked_war_id, faction_id, torn_news_id, torn_user_id, username, item_name, used_at) SELECT id, 33097, 'test_arm_006', 3659067, 'KlattLadd', 'Xanax', 1780820550 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_armory_usage (ranked_war_id, faction_id, torn_news_id, torn_user_id, username, item_name, used_at) SELECT id, 33097, 'test_arm_007', 3659067, 'KlattLadd', 'Energy Drink', 1780820650 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;

INSERT OR IGNORE INTO war_armory_usage (ranked_war_id, faction_id, torn_news_id, torn_user_id, username, item_name, used_at) SELECT id, 33097, 'test_arm_008', 3439382, 'TezSteg', 'First Aid Kit', 1780820750 FROM ranked_wars WHERE faction_id=33097 AND status='active' LIMIT 1;
