-- Add admin authority + session revocation support.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

