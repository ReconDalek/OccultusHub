-- Company Monthly Payouts webhook: 1st-of-month Discord post listing each
-- company director's owed 30% faction cut for the month that just ended, with
-- a negative-amount Torn "add money" link button per member (Components V2).
-- The Admin > Webhooks tab only lists event types that have a row here.
INSERT OR IGNORE INTO webhook_configs (event_type) VALUES ('company_monthly');
