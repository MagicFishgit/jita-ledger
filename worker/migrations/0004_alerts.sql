-- Alert mail from the cloud.

-- What each book's live orders have already sold, per side (`soldFrom` in src/lib/split.ts): the first
-- evidence of who trades an item, before any watching.
ALTER TABLE books ADD COLUMN sold TEXT;

-- The Forge's daily history per item, kept until ESI's copy expires (about a day).
CREATE TABLE hist (
  type_id INTEGER PRIMARY KEY,
  expires INTEGER NOT NULL,
  rows TEXT NOT NULL
);

-- What the cloud has mailed, so a finding isn't mailed again inside six hours.
CREATE TABLE alert_log (
  char_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (char_id, key)
);

-- An access token lasts twenty minutes. Kept (sealed) so each five-minute round doesn't trade the
-- refresh token again.
ALTER TABLE keys ADD COLUMN access_enc TEXT;
ALTER TABLE keys ADD COLUMN access_exp INTEGER;
