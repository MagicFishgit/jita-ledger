-- Asset safety wraps the cloud has registered, per ledger (worker/src/safety.ts): when it first saw each, whether
-- that was within a couple of hours of it going in (so its delivery countdown is known), and when it was first seen
-- delivered. The row with wrap_id 0 marks when the ledger's assets were last read with this tracking on: a wrap that
-- appears after a recent one went in since then; one there on the first read can't be dated.
CREATE TABLE safety_seen (
  char_id INTEGER NOT NULL,
  wrap_id INTEGER NOT NULL,
  first_seen INTEGER NOT NULL,
  start_known INTEGER NOT NULL,
  delivered_at INTEGER,
  PRIMARY KEY (char_id, wrap_id)
);
