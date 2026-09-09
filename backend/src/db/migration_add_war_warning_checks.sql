-- War-warning snapshot data: one row per (war, member) captured at war start,
-- updated at war end. Feeds Leadership > Warnings > Generate > War.
--   revive_setting_at_start : member's Torn revive_setting when the war went active
--   revives_flagged         : 1 when that setting was 'Everyone' (revivable by anyone)
--   last_action_at_start    : last_action.timestamp (unix) at war start
--   last_action_at_end      : last_action.timestamp (unix) at war end
--   logged_in_during_war    : 1 when last_action_at_end >= war started_at, else 0
CREATE TABLE IF NOT EXISTS war_warning_checks (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  ranked_war_id           INTEGER NOT NULL,
  faction_id              INTEGER NOT NULL,
  torn_user_id            INTEGER NOT NULL,
  username                TEXT,
  revive_setting_at_start TEXT,
  revives_flagged         INTEGER NOT NULL DEFAULT 0,
  last_action_at_start    INTEGER,
  last_action_at_end      INTEGER,
  logged_in_during_war    INTEGER,
  start_captured_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  end_captured_at         DATETIME,
  UNIQUE(ranked_war_id, torn_user_id)
);

CREATE INDEX IF NOT EXISTS idx_war_warning_checks_war ON war_warning_checks(ranked_war_id);
