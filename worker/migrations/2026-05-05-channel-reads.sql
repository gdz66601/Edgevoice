CREATE TABLE IF NOT EXISTS channel_reads (
  channel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  last_read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (last_read_message_id) REFERENCES messages(id)
);

CREATE INDEX IF NOT EXISTS idx_channel_reads_user
  ON channel_reads(user_id, channel_id);
