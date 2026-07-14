-- Temporary member/leader access override, granted by admins from the Users page
-- (e.g. for members visiting from another Occultus faction temporarily).
-- Their own API key/faction data is never trusted for this — it's a manual admin grant.
ALTER TABLE users ADD COLUMN access_override TEXT;                 -- 'member' | 'leader' | NULL
ALTER TABLE users ADD COLUMN access_override_expires_at DATETIME;  -- NULL = indefinite (until manually revoked)
ALTER TABLE users ADD COLUMN access_override_note TEXT;            -- optional admin note, e.g. "Visiting from Occul2us"
ALTER TABLE users ADD COLUMN access_override_granted_by INTEGER;   -- FK -> users.id (admin who granted it)
ALTER TABLE users ADD COLUMN access_override_granted_at DATETIME;
