PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS admin_audit_log_new;

CREATE TABLE IF NOT EXISTS admin_audit_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  details TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES users(id)
);

INSERT INTO admin_audit_log_new (
  id,
  admin_user_id,
  action,
  target_type,
  target_id,
  details,
  ip_address,
  user_agent,
  created_at
)
SELECT
  id,
  admin_user_id,
  action,
  target_type,
  target_id,
  details,
  ip_address,
  user_agent,
  created_at
FROM admin_audit_log;

DROP TABLE admin_audit_log;
ALTER TABLE admin_audit_log_new RENAME TO admin_audit_log;

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_log(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_action
  ON admin_audit_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_target
  ON admin_audit_log(target_type, target_id, created_at DESC);

PRAGMA foreign_keys = ON;
