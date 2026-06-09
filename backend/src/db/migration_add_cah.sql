-- Cards Against Occultus — DB migration

CREATE TABLE IF NOT EXISTS cah_shadow_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  picks INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cah_fate_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL DEFAULT '',
  is_blank INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cah_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'lobby',
  host_name TEXT NOT NULL,
  souls_to_win INTEGER NOT NULL DEFAULT 5,
  omens_enabled INTEGER NOT NULL DEFAULT 1,
  pact_used INTEGER NOT NULL DEFAULT 0,
  current_round_id INTEGER,
  winner_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cah_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  user_id INTEGER,
  display_name TEXT NOT NULL,
  guest_token TEXT,
  souls INTEGER NOT NULL DEFAULT 0,
  is_host INTEGER NOT NULL DEFAULT 0,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(room_id) REFERENCES cah_rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cah_hands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  UNIQUE(room_id, player_id, card_id)
);

CREATE TABLE IF NOT EXISTS cah_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  shadow_card_id INTEGER NOT NULL,
  harbinger_player_id INTEGER NOT NULL,
  winner_player_id INTEGER,
  omen TEXT,
  status TEXT NOT NULL DEFAULT 'picking',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, round_number)
);

CREATE TABLE IF NOT EXISTS cah_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  pick_order INTEGER NOT NULL DEFAULT 1,
  custom_text TEXT,
  UNIQUE(round_id, player_id, pick_order)
);

CREATE TABLE IF NOT EXISTS cah_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  player_id INTEGER,
  display_name TEXT NOT NULL,
  message TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cah_players_room ON cah_players(room_id);
CREATE INDEX IF NOT EXISTS idx_cah_hands_player ON cah_hands(player_id, room_id);
CREATE INDEX IF NOT EXISTS idx_cah_rounds_room ON cah_rounds(room_id);
CREATE INDEX IF NOT EXISTS idx_cah_submissions_round ON cah_submissions(round_id);
CREATE INDEX IF NOT EXISTS idx_cah_messages_room ON cah_messages(room_id);

-- ============================================================
-- Seed: Shadow Cards (prompts)
-- ============================================================
INSERT INTO cah_shadow_cards (text, picks) VALUES
  ('When Occultus needs to win a war, leadership''s secret weapon is _______.', 1),
  ('The new recruit showed up to their first chain with nothing but _______.', 1),
  ('Our faction''s most forbidden ritual requires _______ and complete silence.', 1),
  ('The Harbinger of Occultus is known throughout Torn City for _______.', 1),
  ('What truly unites the three factions of Occultus? _______.', 1),
  ('Before every war, the Warden checks for _______. Every single time.', 1),
  ('The oracle''s prophecy spoke of our downfall — but only because of _______.', 1),
  ('Occultus''s recruitment pamphlet includes a section titled "_______.".', 1),
  ('During the last chain, someone accidentally broadcasted _______ to the entire faction.', 1),
  ('The reason our last war ended early was _______.', 1),
  ('Leadership''s official explanation for that incident: "_______." Nobody believed it.', 1),
  ('The true cost of being in Occultus: _______ and absolutely no refunds.', 1),
  ('Every midnight in Torn City, someone in Occultus is secretly _______.', 1),
  ('Our rivals fear us because of _______. As they should.', 1),
  ('The initiation ritual has three steps: join the Discord, read the rules, and _______.', 1),
  ('When the blood moon rises over Torn City, members must avoid _______.', 1),
  ('The faction vault contains many things, but nothing as dangerous as _______.', 1),
  ('New rule: anyone caught _______ during a chain will be immediately hospitalized.', 1),
  ('The Grimoire''s most cursed page describes, in detail, _______.', 1),
  ('_______ and _______ were the only survivors of that particular war.', 2),
  ('The Council meeting minutes mostly consist of debates about _______.', 1),
  ('Deep in the Torn City archives, there is a file labelled "_______". It is sealed.', 1),
  ('The shadow that follows every Occultus member home is called _______.', 1),
  ('We don''t talk about what happened during the chain. All we know is that it involved _______.', 1),
  ('The one thing that unites every faction member, no matter their rank, is a deep fear of _______.', 1);

-- ============================================================
-- Seed: Fate Cards (answers)
-- ============================================================
INSERT INTO cah_fate_cards (text, is_blank) VALUES
  ('A suspiciously timed hospital visit', 0),
  ('Sending "good luck" to the opposing faction', 0),
  ('An outdated API key', 0),
  ('The chain counter hitting zero at 999', 0),
  ('Three Cabal members and a parking dispute', 0),
  ('Whispering runes into the faction Discord at 3am', 0),
  ('Logging off mid-chain without explanation', 0),
  ('Blaming lag for the failed attack', 0),
  ('A passive-aggressive faction notice', 0),
  ('Whatever is in the basement of Torn City Hall', 0),
  ('The respect points we sacrificed along the way', 0),
  ('An uninvited Warden with opinions', 0),
  ('Screaming into the void and receiving a job offer', 0),
  ('That one recruit who actually read every rule', 0),
  ('Suspicious amounts of dark energy', 0),
  ('A strongly-worded message to hospital staff', 0),
  ('The prophecy that nobody remembered to follow', 0),
  ('Attacking the wrong person. Twice.', 0),
  ('The leaderboard we do not speak of', 0),
  ('An Inquisitor on their day off', 0),
  ('The blood oath we all definitely signed', 0),
  ('A faction-wide moment of existential crisis', 0),
  ('Six shadows and one very confused tourist', 0),
  ('Making direct eye contact during a mugging', 0),
  ('The body that appeared on the faction notice board', 0),
  ('Blaming the Acolyte', 0),
  ('The sound of 500 chains breaking simultaneously', 0),
  ('A second opinion from the void', 0),
  ('Disappearing for 12 hours without explanation', 0),
  ('The Grimoire page that keeps getting torn out', 0),
  ('Aggressive diplomacy', 0),
  ('Hospital bills with no explanation attached', 0),
  ('One perfectly-timed banishment', 0),
  ('The rule that only exists because someone did that thing', 0),
  ('A knife, a candle, and an expired coupon', 0),
  ('The Discord server going offline at the worst possible moment', 0),
  ('An anonymous threat written in archaic script', 0),
  ('A faction member who was "just curious"', 0),
  ('The darkness that precedes a very large chain', 0),
  ('What the Inquisitor found but chose not to report', 0),
  ('Absolute power with a 12-hour cooldown', 0),
  ('Two Harbingers and a scheduling conflict', 0),
  ('The thing we all agreed never to speak of', 0),
  ('An unsolicited ritual at 3am', 0),
  ('Respectfully claiming to know absolutely nothing', 0),
  ('The faction rule added after the incident', 0),
  ('A Cabal member with strong opinions about fonts', 0),
  ('The shadows that followed you home from the war', 0),
  ('The faction-wide silence that said everything', 0),
  ('Asking for a revive in the wrong Discord channel', 0),
  ('The real members we hospitalised along the way', 0),
  ('An intern with admin access and no supervision', 0),
  ('Enthusiastic consent from the void', 0),
  ('Clicking "Attack" on a faction officer. Your own faction officer.', 0),
  ('The ancient prophecy no one reads anymore', 0),
  ('Rune-powered emotional support', 0),
  ('The part of the Rite that we don''t talk about', 0),
  -- Blank Vessels
  ('', 1),
  ('', 1),
  ('', 1);
