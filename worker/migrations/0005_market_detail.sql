-- More of what the five-minute reads show, per item and day (see `bookFills` in src/lib/flow.ts).

-- The exact lowest price a Jita buy order visibly filled at, and the highest a sell order sold at.
ALTER TABLE flow ADD COLUMN buy_low REAL;
ALTER TABLE flow ADD COLUMN sell_high REAL;
-- Times the best price improved on each side (the front was undercut or outbid), and same-order repricings.
ALTER TABLE flow ADD COLUMN front_sell INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flow ADD COLUMN front_buy INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flow ADD COLUMN reprice_sell INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flow ADD COLUMN reprice_buy INTEGER NOT NULL DEFAULT 0;

-- The same trade by UTC hour of day, for when an item's buyers and sellers are about. Kept 28 days.
CREATE TABLE flow_hod (
  type_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  hod INTEGER NOT NULL,
  h REAL NOT NULL,
  sell REAL NOT NULL,
  buy REAL NOT NULL,
  PRIMARY KEY (type_id, day, hod)
);
