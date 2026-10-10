-- The morning scan's NPC sellers of every blueprint the Industry tab ranks (src/data/industryTypes.json `bpos`), with their
-- stations, whatever the scan's own candidate gate. A row per run: `data` is the sellers by blueprint, [lowest price,
-- [stations, cheapest first]]; `complete` is 1 when every page of The Forge was read, and `pages_failed` how many weren't.
-- Only the latest complete row and any newer partial one are kept (worker/src/industryNpc.ts).
-- Only adds a table: old code runs on it as before.
CREATE TABLE IF NOT EXISTS industry_npc (
  run INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  complete INTEGER NOT NULL,
  pages_failed INTEGER NOT NULL,
  data TEXT NOT NULL
);
