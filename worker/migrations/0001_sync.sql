-- The ledger in the cloud, per EVE character: one row per record (a trade, a journal entry, an order, a
-- position...) and one per whole document (settings, stock, skills). Every write takes the character's
-- next revision number, so a device asks "what changed after revision N" and gets exactly that.

CREATE TABLE IF NOT EXISTS records (
  char_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  -- JSON of the record, or NULL when it was deleted: the deletion has to travel to other devices too.
  data TEXT,
  rev INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (char_id, kind, id)
);
CREATE INDEX IF NOT EXISTS records_by_rev ON records (char_id, rev);

CREATE TABLE IF NOT EXISTS docs (
  char_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  rev INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (char_id, key)
);
CREATE INDEX IF NOT EXISTS docs_by_rev ON docs (char_id, rev);

CREATE TABLE IF NOT EXISTS revs (
  char_id INTEGER PRIMARY KEY,
  rev INTEGER NOT NULL
);
