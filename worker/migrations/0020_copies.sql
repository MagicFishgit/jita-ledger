-- What blueprint copies sell for in The Forge (worker/src/copies.ts, docs/notes/industry.md, stage 3). Every six hours the
-- cloud reads EVE Ref's public-contract snapshot and keeps The Forge's single-kind copy contracts as a set, in rows of 3,000
-- contracts (`data`: [contract, type, ME, TE, runs a copy, copies, price, issuer, expires in seconds, item IDs][]; every row
-- carries the snapshot's time); each contract of the last set that vanished before expiry, not relisted by its seller, goes in
-- copy_sold at the newer snapshot's time, kept eight days. The round's own state and the summary are in scan_meta ('copies',
-- 'copySummary'). Only adds tables: old code runs on it as before.
CREATE TABLE IF NOT EXISTS copy_set (
  part INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS copy_sold (
  contract_id INTEGER PRIMARY KEY,
  type_id INTEGER NOT NULL,
  me INTEGER NOT NULL,
  te INTEGER NOT NULL,
  runs INTEGER NOT NULL,
  copies INTEGER NOT NULL,
  price REAL NOT NULL,
  issuer INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS copy_sold_at ON copy_sold (at);
