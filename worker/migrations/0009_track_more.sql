-- "Does it come true?" for three more of the app's claims, like "Clears in" (predictions).

-- Place and leave: each left order's expected pace at the price it stood at (units a day, the planner's model), what
-- was left when first seen and last seen, and in the end what it filled over how many days.
CREATE TABLE leave_track (
  char_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  price REAL NOT NULL,
  type_id INTEGER NOT NULL,
  is_buy INTEGER NOT NULL,
  at INTEGER NOT NULL,
  pred REAL NOT NULL,
  remain0 INTEGER NOT NULL,
  remain INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  -- 'checked' (a day or more to judge by) or 'void'
  outcome TEXT,
  filled INTEGER,
  days REAL,
  resolved_at INTEGER,
  PRIMARY KEY (char_id, order_id, price)
);

-- The Sniper's claim on each listing it showed, fixed at first sight: trading gets up to `resale` (at the best
-- rates). Settled from the item's history over the week after: 'reached' (on day `reached_days`) or 'not'.
ALTER TABLE snipe_seen ADD COLUMN resale REAL;
ALTER TABLE snipe_seen ADD COLUMN clean INTEGER;
ALTER TABLE snipe_seen ADD COLUMN doubts TEXT;
ALTER TABLE snipe_seen ADD COLUMN units INTEGER;
ALTER TABLE snipe_seen ADD COLUMN outcome TEXT;
ALTER TABLE snipe_seen ADD COLUMN reached_days INTEGER;

-- Share of the market, measured once a day from each ledger's own trades of the last 30 days, beside the setting
-- it had then.
CREATE TABLE share_track (
  char_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  buy_median REAL,
  sell_median REAL,
  buy_days INTEGER NOT NULL,
  sell_days INTEGER NOT NULL,
  suggested REAL,
  setting REAL NOT NULL,
  PRIMARY KEY (char_id, day)
);
