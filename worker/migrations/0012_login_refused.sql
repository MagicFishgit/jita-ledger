-- A kept login EVE has refused (its refresh token no longer works, e.g. once the character's grant for the app was
-- replaced by a login with other permissions): when it was first refused, what EVE said, and when the watchdog last
-- mailed about it. The next refresh that works, or the login handed over again, clears all three.
ALTER TABLE keys ADD COLUMN refused_at INTEGER;
ALTER TABLE keys ADD COLUMN refused TEXT;
ALTER TABLE keys ADD COLUMN refused_warned INTEGER;
