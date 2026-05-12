ALTER TABLE channel_members ADD COLUMN muted_until TEXT;

INSERT OR IGNORE INTO site_settings (setting_key, setting_value)
VALUES ('blocked_words', '[]');
