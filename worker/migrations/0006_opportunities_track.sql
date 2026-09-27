-- Opportunity mail: the watched items that clear a ledger's Prospects filters right now. An item is mailed
-- when it first appears here, not every round it stays.
CREATE TABLE opp_seen (
  char_id INTEGER NOT NULL,
  type_id INTEGER NOT NULL,
  since INTEGER NOT NULL,
  PRIMARY KEY (char_id, type_id)
);

-- "Clears in", checked: each beaten order's prediction at the price it stood at, and what happened. One row per
-- order and price; a new price is a new prediction and voids the old one.
CREATE TABLE predictions (
  char_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  price REAL NOT NULL,
  type_id INTEGER NOT NULL,
  is_buy INTEGER NOT NULL,
  at INTEGER NOT NULL,
  hours REAL NOT NULL,
  ahead INTEGER NOT NULL,
  -- 'front' (reached the front), 'void' (repriced, cancelled or unreadable), 'late' (not at the front after 14 days)
  outcome TEXT,
  resolved_at INTEGER,
  PRIMARY KEY (char_id, order_id, price)
);
