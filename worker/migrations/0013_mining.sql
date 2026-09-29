-- The mining ledger as the cloud watches it (worker/src/mining.ts): each read's snapshot, to compare the next against,
-- and what grew between reads ("ticks", about ten minutes of mining each), which the app turns into sessions and
-- ISK an hour. Keyed by the character that mined, so a multiboxed fleet is more rows, not a new table.
CREATE TABLE IF NOT EXISTS mining_state (
  char_id INTEGER PRIMARY KEY,   -- the character whose ledger it is
  at INTEGER NOT NULL,           -- when it was read
  data TEXT NOT NULL             -- {key: quantity} as read (mining.ts miningSnapshot)
);
CREATE TABLE IF NOT EXISTS mining_ticks (
  char_id INTEGER NOT NULL,
  at INTEGER NOT NULL,           -- the read that saw it
  system_id INTEGER NOT NULL,
  type_id INTEGER NOT NULL,
  qty INTEGER NOT NULL           -- units mined since the read before
);
CREATE INDEX IF NOT EXISTS mining_ticks_char_at ON mining_ticks (char_id, at);
