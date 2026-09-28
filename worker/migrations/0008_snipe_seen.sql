-- What the Sniper has seen, so a buy of yours can be marked "found by the Sniper" (src/lib/sniped.ts). One row per
-- listing, keyed by its cheapest order, with the price range bought out; kept 30 days.
CREATE TABLE snipe_seen (
  order_id INTEGER PRIMARY KEY,
  type_id INTEGER NOT NULL,
  lo REAL NOT NULL,
  hi REAL NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX snipe_seen_type ON snipe_seen (type_id, last_seen);
