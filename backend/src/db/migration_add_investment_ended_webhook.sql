-- New event type: fires once per bank investment, the first time its
-- end_date has passed, stating how much (principal + faction's profit
-- share) is owed back to the faction. Separate concern from investment_tci
-- (the "buy TCI before it expires" reminder).
INSERT OR IGNORE INTO webhook_configs (event_type) VALUES ('investment_ended');
