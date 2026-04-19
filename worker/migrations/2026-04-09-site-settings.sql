CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_settings (setting_key, setting_value)
VALUES ('site_name', 'Edgechat');

INSERT OR IGNORE INTO site_settings (setting_key, setting_value)
VALUES ('site_icon_url', '');
