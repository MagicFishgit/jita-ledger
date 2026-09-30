-- Abyss Tracker's figures, kept by the cloud for the Abyssal page (browsers can't read its API: it sends no CORS header).
-- One row per tier and weather, refreshed daily: runs logged, median loot by hull size, the most-run fits and top drops.
-- No pilot names or run lists are kept: only the figures the page shows.
CREATE TABLE IF NOT EXISTS abyss_cells (
  tier INTEGER NOT NULL,
  weather INTEGER NOT NULL,
  at INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (tier, weather)
);
-- A fit's EFT and its measured performance per tier and weather, fetched when the page opens it, kept a week.
CREATE TABLE IF NOT EXISTS abyss_fits (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  json TEXT NOT NULL
);
