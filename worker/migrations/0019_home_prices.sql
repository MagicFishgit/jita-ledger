-- Home prices for the Industry tab, read by the cloud from Goonmetrics (a Goonswarm tool; its API sends no CORS header, so
-- browsers can't): one row per hub, every watched type's prices with each one's own `updated`, refreshed every six hours
-- (worker/src/goonmetrics.ts). A failed batch leaves the last good row's types. Only adds a table: old code runs on it as before.
CREATE TABLE IF NOT EXISTS home_prices (
  hub INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  at INTEGER NOT NULL,
  data TEXT NOT NULL,
  -- when a read of the hub was last tried (good or not): a hub is read at most once per refresh whatever its last round did
  tried INTEGER NOT NULL DEFAULT 0
);
