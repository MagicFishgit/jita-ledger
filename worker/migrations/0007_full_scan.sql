-- The daily full-market scan: every Jita item worth checking, in the shapes the app's Prospects scan uses, so a
-- browser can take it as its own scan.
CREATE TABLE scan_items (
  type_id INTEGER PRIMARY KEY,
  -- ProspectStats (statsFrom) and the Book summary (best levels, order counts, what the orders have sold).
  stats TEXT NOT NULL,
  book TEXT NOT NULL,
  -- Jita orders on the item, both sides: the scan's exact count, where a browser's scan estimates from a sample.
  orders INTEGER NOT NULL,
  -- The run that wrote it: rows from an older run are items today's scan no longer lists, and are removed.
  run INTEGER NOT NULL
);

-- One row: when the last scan finished and what it covered.
CREATE TABLE scan_meta (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
