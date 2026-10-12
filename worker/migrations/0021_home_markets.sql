-- Home markets for the Industry tab (worker/src/homeMarkets.ts, docs/notes/industry.md, stage 4). A structure's own market, read
-- hourly by the cloud with the login of the character you pick (its reader), for the watch set's types only.
-- home_markets: every choice you make, keyed by ledger and structure. Goonmetrics' two hubs are read with the main without a row;
-- a row gives one of them another reader or switches it off (removed_at), or adds a hub, with the system and region the finder
-- needs (read publicly when it was added).
-- home_books: one row a structure: its last good read (at, data, pages, types, read_by: whose it was; at 0 = never read) apart from
-- its last try (tried, reader, error), and since when that reader has been refused by the structure's access list (refused_at). A
-- read cut short is never stored. Only adds tables: old code runs on it as before.
CREATE TABLE IF NOT EXISTS home_markets (
  ledger INTEGER NOT NULL,
  structure_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  system_id INTEGER NOT NULL,
  region_id INTEGER NOT NULL,
  reader INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  removed_at INTEGER,
  PRIMARY KEY (ledger, structure_id)
);
CREATE TABLE IF NOT EXISTS home_books (
  structure_id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  pages INTEGER,
  types INTEGER NOT NULL DEFAULT 0,
  tried INTEGER NOT NULL DEFAULT 0,
  reader INTEGER,
  error TEXT,
  refused_at INTEGER,
  read_by INTEGER
);
