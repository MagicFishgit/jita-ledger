-- Background work: the EVE logins the Worker keeps so it can read ESI while no browser is open, and what
-- each scheduled job last did. A login's refresh token is stored encrypted (AES-GCM, key in the Worker's
-- TOKEN_KEY secret), never in the clear.

CREATE TABLE IF NOT EXISTS keys (
  char_id INTEGER NOT NULL,          -- the ledger this login serves
  purpose TEXT NOT NULL,             -- 'main': the trading character; 'mailer': the one that sends alert mail
  token_char_id INTEGER NOT NULL,    -- whose login it is
  token_char_name TEXT,
  scopes TEXT NOT NULL,
  refresh_enc TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (char_id, purpose)
);

CREATE TABLE IF NOT EXISTS jobs (
  char_id INTEGER NOT NULL,
  job TEXT NOT NULL,
  last_run INTEGER,
  last_ok INTEGER,
  last_error TEXT,
  detail TEXT,
  PRIMARY KEY (char_id, job)
);
