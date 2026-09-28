# The cloud copy

Decisions worth not undoing. How the ledger lives in the cloud as well as the browser, and what the cloud does with the logins handed to it. How to run and deploy the Worker is in CLAUDE.md.

- **`syncCharacter` merges against live state** via a functional `update()`. It used to snapshot the
  store, spend 10-30s on the network, then write the snapshot back — silently destroying anything done
  meanwhile. Never reintroduce a snapshot write.
- **The ledger syncs to the cloud record by record** (`lib/cloudSync.ts` pure, `lib/cloud.ts` I/O, `worker/src/sync.ts`).
  Collections (txs, journal, orders, names, killmails, tags, positions, goals, watchlist, netWorth) go up one
  record at a time, keyed by kind and ID, so two devices changing different things never collide; small whole
  values (settings, meta, prefs, alerts, stock, skills, ignored, nearDone, unusualOk) go up as documents, newest
  write wins. Fields that belong to one browser stay local (`LOCAL_FIELDS`: meta's visits, sync timers and alert
  mail IDs; prefs' motion), as do `alertLog`. Every change is caught at `update()` (`onDataChange`), diffed by
  record identity (JSON as a fallback), marked with a generation (so an edit made while a push is in flight isn't
  dropped when it lands) and pushed 3 s later; unsent marks are saved beside the ledger (`cloud` in the data
  store). Every push takes the character's next revision in the same D1 transaction as its writes; a pull returns
  everything after the revision a browser last saw, paged by (rev, kind, id). A browser skips its own revisions
  (`ownRevs`) and anything it still has unsent (local wins; its push is newer). **Pulled settings, prefs and alerts
  go through the same sanitizers as disk**: a test document once reset the test browser's settings. **First sync**
  pulls first, then pushes whatever the cloud didn't have: an empty cloud gets everything (the first upload), an
  empty browser gets everything (the restore after a wipe or on a new PC). Clearing a browser doesn't touch the
  cloud; its copy comes back on the next start unless sync is switched off in that browser. The Worker checks
  EVE's RS256 access token against EVE's published keys (issuer, this app's client ID, expiry) and keys data by
  the character in `sub`: being logged in to the app is being logged in to the cloud. D1 Time Travel can rewind
  the database to any minute of the last 30 days (paid plan; 7 on free), which stands in for dated backups. While
  the cloud copy is healthy (`cloudCovers`) the backup reminders (status bar, To do, alerts, Settings tab) stand
  down.
- **The cloud keeps watch with logins handed to it** (`POST /v1/keys`; `loginForCloud` / `loginMailerForCloud` bring
  back a refresh token that goes straight to the Worker and is never stored in the browser). They are sealed with the
  `TOKEN_KEY` secret (AES-GCM); the Worker refreshes one once to prove it, and checks the main login is the ledger's
  character and the sender isn't. Access tokens are kept sealed too (`access_enc`, `access_exp`) and reused until two
  minutes before expiry, so the five-minute round doesn't rotate the refresh token ~300 times a day. The hourly
  archive (`archive.ts`) turns ESI into the same records the app makes (`esiRecords.ts`) and pushes only what's new
  or changed, and keeps one net-worth point a day the Wallet's way; the market watch (`worker/src/market.ts`) does
  `bookFills` all day on every item any ledger has open orders, open positions or watchlist entries on, and the app
  merges that flow with its own (`setCloudFlow`, cloud wins per day).
- **Every job reports to `jobs`, and the Sniper does it every five minutes** (for the watchdog, see orders-alerts):
  about 290 row writes a day for the Sniper on top of the per-ledger jobs, well inside the plan's 50 M a month.
- **The cloud's hour-by-hour prices show on the Calculator** ("Jita, hour by hour": best bid and ask per hour
  from `/v1/prices`, a missing hour breaking the line) for items the cloud watches. ESI's history is daily; this is
  the only view inside a day. Nothing shows without the cloud or for items it doesn't watch.
