-- Several characters in one ledger. An alt is a character on another of the owner's accounts: the cloud keeps its
-- login under the main's ledger (keys: char_id = the main, purpose = 'alt:<its id>') and reads it into rows under
-- its own character ID. This table is the lasting record of which characters are alts of which ledger, so that a
-- removed alt whose data was kept is still known not to be a ledger of its own (the market watch reads every
-- ledger's open orders), and so alts are never found by matching the text of a purpose.
CREATE TABLE IF NOT EXISTS alts (
  char_id INTEGER PRIMARY KEY,   -- the alt
  ledger INTEGER NOT NULL,       -- the main whose ledger it feeds
  name TEXT,
  added_at INTEGER NOT NULL,
  removed_at INTEGER             -- set when removed with its data kept; the row goes when its data is deleted
);
CREATE INDEX IF NOT EXISTS alts_by_ledger ON alts (ledger);

-- The hull at the last mining read, whether or not anything was mined: an alt's "right now" comes from here, since
-- the browser holds no alt login to ask ESI with.
ALTER TABLE mining_state ADD COLUMN ship_type_id INTEGER;
