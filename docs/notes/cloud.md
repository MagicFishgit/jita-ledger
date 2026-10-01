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
- **`meta.freelance` stays in each browser** (`LOCAL_META`, 1 October 2026): every browser rebuilds the freelance history
  from the journal and ESI, so a newest-wins doc can't drop a job another found. `meta.corp` rides the doc, read fresh
  each sync. The hourly archive sends a held journal entry again only when ESI gives a tax its record lacks
  (`journalGainedTax`, field by field, reading those rows back 90 at a time).
- **"Delete all data" makes the sync meet the cloud again as a new browser** (`onClearAll` hook in `lib/cloud.ts`). The
  sync's state lives in the ledger's own IndexedDB store (`STATE_KEY`), but its copy in memory outlived the wipe: the
  next minute's pull saved "already met the cloud at revision N" back, so after a reload only what was newer came down
  and the ledger stayed empty, with default settings the next settings change would have pushed over the cloud's; and
  changes still waiting to go up were read from the emptied ledger and sent as removals. Both reproduced on a local
  Worker (30 September 2026: a name edited just before the wipe was deleted in the cloud; after a tick and a reload the
  ledger was empty, target back to 5). Found by reading during the multi-character reviews; it predates them. Now the
  wipe drops the unsent list and the saved state, and a first sync starts at once, so the cloud's copy comes straight
  back down (the dialog says so; with sync switched off it stays empty). Pushes, pulls and first syncs in flight stop
  when `dataGeneration()` moves under them: a pull from before the wipe that moved the revision on would make the first
  sync after it start past most of the ledger. **Until that first sync, the cloud's copy wins** (`wiped`, saved at once
  so a reload keeps it): a sync normally lets what's waiting here beat what comes down, but after a wipe what's here
  was written by the ESI sync onto an empty ledger (settings rebuilt from the defaults with only the character's own
  fields, orders without their price history), and with the cloud unreachable at the wipe it would have finished first
  and gone up over the cloud's. Checked the same way: with the local Worker stopped, a wipe, a settings change and a
  record written, a reload, then the Worker started: the cloud's settings and record came down and the cloud kept its
  own. Only a wipe sets it: a browser that never met the cloud (sync switched on late) still keeps what it has.
  **Not covered**: a wipe while logged out (the sync has no state then, so there's nothing to mark) and a brand-new
  browser both meet the cloud with the ordinary rule, so if the cloud is unreachable at that first start and the ESI sync
  finishes first, its default-based settings can still go up over the cloud's. That race predates the fix and needs the
  cloud down at exactly that moment.
- **Every job reports to `jobs`, and the Sniper does it every five minutes** (for the watchdog, see orders-alerts):
  about 290 row writes a day for the Sniper on top of the per-ledger jobs, well inside the plan's 50 M a month.
- **The cloud's hour-by-hour prices show on the Calculator** ("Jita, hour by hour": best bid and ask per hour
  from `/v1/prices`, a missing hour breaking the line) for items the cloud watches. ESI's history is daily; this is
  the only view inside a day. Nothing shows without the cloud or for items it doesn't watch.
- **The cloud reads Abyss Tracker for the Abyssal page** (`worker/src/abyss.ts`, migration 0015; `lib/abyssTracker.ts` is
  shared). Its API sends no CORS header, so the browser can't. The hourly job (7 past, after the scan, whose time budget it mustn't take from) reads every tier and
  weather whose copy is over 20 hours old, one request at a time 800 ms apart (all 35 took 54 s locally), with a
  User-Agent naming only the project, and keeps each as its figures (`abyss_cells`). `GET /v1/abyss` returns them all;
  `GET /v1/abyss/fit?id=` reads a fit's EFT and performance the first time it's asked for and keeps it a week
  (`abyss_fits`); `POST /v1/jobs/abyss` runs the refresh by hand. Until the first hourly run after a deploy the page says
  the cloud hasn't read that cell yet, and a cloud a version behind says it couldn't read them, rather than "Reading…"
  for good (`TrackerState`). **Its failures aren't a watched job**: the user chose (30 September 2026) not to be mailed when Abyss Tracker is down,
  since it's someone else's site and the page says how old its figures are. A cell that keeps failing is passed over, and
  three failures in a row end the round. Fits kept over a week are deleted each hour; one asked for again is read afresh.
