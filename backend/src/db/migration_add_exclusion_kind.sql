-- 'excuse' (default) or 'boot'. A boot is recorded like an excuse but is shown
-- with its date on the Warnings tab. It never touches member_warnings, so it
-- cannot count toward the 3-in-6-months kick threshold.
ALTER TABLE warning_exclusions ADD COLUMN kind TEXT NOT NULL DEFAULT 'excuse';
