-- The ship each mining tick was mined in (esi-location.read_ship_type.v1, read with the ledger every ten minutes), so each
-- hull on the Mining ladder shows your own measured pace in it. Null when the permission isn't granted, or before this.
ALTER TABLE mining_ticks ADD COLUMN ship_type_id INTEGER;
