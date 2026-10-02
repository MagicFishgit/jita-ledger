-- What kind of thing each type is, as ESI says (type → group → category), looked up once and kept: a type doesn't
-- change group. The Sniper leaves blueprints (category 9) out of its mail unless asked, so it needs each listing's
-- category, and only types not seen before are asked for. Only adds a table: old code runs on it as before.
CREATE TABLE IF NOT EXISTS type_kinds (
  type_id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  at INTEGER NOT NULL
);
-- A new type's category is read from a kept type of the same group before asking ESI for the group.
CREATE INDEX IF NOT EXISTS type_kinds_by_group ON type_kinds (group_id);
