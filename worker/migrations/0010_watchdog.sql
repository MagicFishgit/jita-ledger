-- The watchdog: each job's failures in a row (EVE's daily downtime not counted), when the streak began, and when
-- it was last mailed about. A success clears all three.
ALTER TABLE jobs ADD COLUMN fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN failing_since INTEGER;
ALTER TABLE jobs ADD COLUMN warned INTEGER;
