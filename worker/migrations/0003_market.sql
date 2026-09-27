-- Market watching around the clock: the Jita book of every item any ledger trades or watches, read every
-- five minutes. Market data is the same for everyone, so these are keyed by item, not by character.

-- The last read of each book, to compare the next one against: [[order id, is buy (0/1), price, units left], ...]
CREATE TABLE IF NOT EXISTS books (
  type_id INTEGER PRIMARY KEY,
  stamp INTEGER NOT NULL,        -- ESI's Expires for that read: two reads with the same one are the same snapshot
  orders TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- What the books showed happening, per item and UTC day: hours watched, units bought from listings (sell),
-- units sold into bids (buy), and units newly placed at the front of each side. The same counts the app's
-- flow log keeps (src/lib/flow.ts), gathered without a browser.
CREATE TABLE IF NOT EXISTS flow (
  type_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  h REAL NOT NULL,
  sell REAL NOT NULL,
  buy REAL NOT NULL,
  new_sell REAL NOT NULL,
  new_buy REAL NOT NULL,
  PRIMARY KEY (type_id, day)
);

-- Hour by hour: the best prices and the units at them, as last seen in that hour. ESI's history is daily.
CREATE TABLE IF NOT EXISTS prices (
  type_id INTEGER NOT NULL,
  hour INTEGER NOT NULL,         -- epoch hour (ms / 3,600,000)
  best_buy REAL,
  best_sell REAL,
  buy_units INTEGER,
  sell_units INTEGER,
  PRIMARY KEY (type_id, hour)
);
