# Several characters in one Jita Ledger

**Date:** 2026-09-30
**Status:** design, reviewed against the code for gaps (the review's changes are listed at the end)

## What the user asked for

"I have a few alt characters, currently alpha but they will go back and forth to omega. I just want to use them to
do some semi afk mining and perhaps other activities later on during the day while I'm working. It is time we fully
prep the site to handle multiple accounts and characters. Just got to be sure that the information doesn't get
jumbled between accounts and my main account."

Decided with the user on 30 September 2026:

1. **An alt feeds the one ledger.** It never logs in to the app. Its login is handed to the cloud once, the way the
   mail sender's is, and its data shows under its own name. Trading (orders, positions, Results) stays the main's.
2. **Read for each alt:** mining; wallet and income; assets and net worth; skills, skill queue and clone state.
3. **Money stays apart, plus one total.** The main's Wallet, Results, net worth and runway are the main's alone, as
   today. A Characters page shows each alt and an all-characters total, and the Wallet's net worth gains one line
   for that total. ISK sent between the user's own characters is a transfer, never income or spending.
4. **Each alt's data lives under its own character ID**, in the cloud and in a separate read-only store in the
   browser. The main's ledger never holds a row of an alt's.

Success is:

- alts' mining, ISK and skills visible per character and as a fleet;
- no way, by construction, for an alt's record to reach the main's ledger;
- nothing an alt's data holds changes a figure on the main's existing pages. The one intended change there is the
  transfers rule, which reads only the main's own journal and the list of which characters are yours.

## How things stand (read 30 September 2026)

- **The browser's ledger is one store, not keyed by character** (`store.ts`: IndexedDB `jita-ledger` / `kv`). A
  different character logging in would merge its trades into the main's, and the first cloud sync (`firstSync` in
  `cloud.ts`) would push the main's whole ledger into that character's cloud copy. Today only the owner lock
  (`OWNER_CHARS`, one ID) prevents it: anyone else is logged straight out.
- **In the cloud a ledger is a character.** `records`, `docs`, `revs`, `jobs`, `mining_state`, `mining_ticks`,
  `safety_seen` and the rest are keyed by `char_id`, which is the `sub` of the caller's EVE token. `keys` is
  `(char_id, purpose)` with purpose `main` or `mailer`, and `keepLogin('main')` refuses a login whose character
  isn't the ledger's. Every per-ledger job starts from `SELECT char_id FROM keys WHERE purpose = 'main'`.
- **Mining already carries its character**: `MiningRecord.charId`, `miningKey` begins with it, `mining_ticks` is
  keyed by the login's character.
- **EVE facts that shape this** (eve-facts.md): logging a character in with a different set of permissions stops
  that character's earlier logins, while two logins with the same set live side by side. An Alpha account can't be
  in game at the same time as any other account (the user confirmed it; they'll play one at a time).
- **Alpha's skill limits are in CCP's static data**: `cloneGrades.jsonl` (build 3561556, 30 September 2026; a copy
  is in `.playwright-mcp/sde/`) has four Alpha grades, one a race, each the same 175 skills with the same level caps
  (Mining IV, Broker Relations II, Trade III; Accounting absent, so 0). ESI has no clone-state field; its skills
  answer gives `trained_skill_level` and `active_skill_level`, which differ only while Alpha caps a skill.
- **The cron limits** (CLAUDE.md): a cron more frequent than hourly gets 30 s of CPU; an hourly one gets `cpu_ms`
  (2 minutes) and 15 minutes of wall clock; the full-market scan keeps an 11-minute budget inside the hourly run.

## The design

### 1. The roster: an alt is a login kept under the main's ledger

- An alt's login is a `keys` row `(char_id = the main, purpose = 'alt:<altId>', token_char_id = altId)`. `purpose`
  is already free text and part of the key, so any number fit with no change to the table's shape, and every
  existing `purpose = 'main'` query keeps meaning "a full ledger". The ID in a purpose is always a parsed integer.
- Migration `0016` only adds: `keys.sender INTEGER` (1 on the alt that sends alert mail) and
  `mining_state.ship_type_id INTEGER` (the hull at the last mining read, for an alt's "right now").
- **Handing one over**: `loginAltForCloud()` in `auth.ts` (PKCE purpose `cloud-alt`, the main's scope set:
  `SCOPES` plus any asked optional ones). The refresh token goes to `POST /v1/keys` with `purpose: 'alt'` and is
  never stored in the browser. The Worker refreshes it once to prove it, then:
  - refuses the ledger's own character ("that's your main");
  - stores it sealed, as today's logins are;
  - if that character is the ledger's `mailer`, deletes the `mailer` row and sets `sender = 1` on the alt row: one
    login per character, because the new login has already stopped the old one.
  The toast names the character that was added, since EVE's page, not the app, decides which one it is.
- **The sender** is the `mailer` row when there is one, else the alt with `sender = 1`. One helper in `eve.ts`
  (`useSender`, `senderOf`) replaces every lookup of `purpose = 'mailer'`: `send` and `tidy` and `alertRound` in
  `alerts.ts`, `mailSafety`, `mailLedger` in `snipe.ts`, the watchdog. `POST /v1/alts/<id>/sender` with `{on}`
  makes an alt the sender (dropping a `mailer` row) or stops it.
- **One set of permissions per character is a trap the app has to keep the user out of.** EVE stops a character's
  earlier logins at its own login page, before the app or the Worker sees anything. So logging an alt in as a
  separate mail sender (two permissions) would stop its cloud login, and nothing can undo that afterwards. Therefore:
  - once the roster has an alt, Settings → Alerts and To do no longer offer a separate sender login; they link to
    the Characters page, where a sender is one of your characters;
  - a `mailer` hand-over that turns out to be an alt (`POST /v1/keys`), or a browser sender login that does
    (`handleCallback`, checked against `chars`), is refused with what happened and what to do: "That login has
    stopped the cloud's login for Miner Two. Hand Miner Two over again on the Characters page, and choose it as the
    sender there."
- **An app version behind** sees no alt rows: `/v1/status` lists only the `main` and `mailer` logins in
  `background.keys`, as now, plus a sender alt shown as a `mailer` entry so `cloudSendsMail` stays true and that tab
  doesn't mail as well. `DELETE /v1/keys?purpose=mailer` on a sender alt unsets `sender` and leaves its login. (The
  old To do turned every refused key into "log in a sender", which for an alt would be exactly the trap above.)
- **Same permissions as the main**, so the same reading code works and a later promotion to a full ledger needs no
  new login. A login handed over before a scope was added keeps working; the card names what's missing.
- **The owner lock is unchanged.** Alts are not added to `OWNER_CHARS`. Only the main's token can add, read or
  remove an alt.
- **Removing**: `DELETE /v1/alts/<id>?data=keep|delete` revokes the login at EVE and drops the row. `delete` also
  removes the alt's rows from `records`, `docs`, `revs`, `jobs`, `mining_state`, `mining_ticks` and `safety_seen`.
  Kept data is unreachable until the character is added again. The question says so when the alt is the sender:
  alert mail stops until another is chosen.
- **Scale**: about ten alts expected; nothing caps it.

### 2. What the cloud reads, and where it goes

Everything read for an alt is stored under `char_id = altId`, in the same kinds and documents as a main's ledger.

- **A reader is told whose login and whose data**: the jobs take `{ ledger, purpose, char }` instead of one
  `charId` (`useLogin(env, ledger, purpose)` for the token, `char` for ESI paths and for `push`). For a main all
  three are what they are today. A reader checks the alt's `keys` row is still there before it writes, so an alt
  removed mid-read doesn't get rows back.
- **Hourly, on a cron of its own** (`37 * * * *`, the Worker's fifth): every alt's full read, one after another,
  `/markets/prices/` fetched once and shared. Not on the existing hourly cron, where alt reads would run ahead of a
  scan whose 11-minute budget doesn't know they happened; not in the five-minute round, which has 30 s of CPU and
  the main's alerts to get through. A cron of its own gets the hourly CPU allowance and 15 minutes. (A new cron
  took 26 minutes to first fire last time; the `scheduled` handler's last branch is the hourly archive, so the new
  one is matched by name before it.)
- **The full read** (`archive`, unchanged in what it reads): wallet trades and journal, orders and order history,
  assets (`stock`, asset safety wraps registered but not mailed), loyalty points, item names, one net-worth point
  a day.
- **With it, new, alts only** (`sheet.ts`): `/skills/`, `/skillqueue/`, `/attributes/`, `/wallet/`. Written as the
  alt's `skills` doc (trained levels, the main's shape) and `meta` doc with the main's field names: `walletBalance`,
  `walletAt`, `totalSp`, `skillSp`, `skillQueue`, `attributes`, `lpBalances`, `cloneDetected`, and new `cloneSince`
  and `activeSkills` (only the skills whose usable level is below trained). Pushed only when something other than
  a timestamp changed.
- **Every ten minutes**, at the end of the five-minute round, after every ledger's orders, the market watch, the
  alerts and the watchdog (`readMiningRound`, as for a main): the mining ledger and the ship it's in, as `mining`
  records and `mining_ticks` under the alt's ID. The ship is also kept on `mining_state` whether or not anything
  was mined.
- **Not done for an alt**: the twenty-minute orders refresh, order judging, alerts and alert mail, opportunity
  mail, the track record, share measuring, the Sniper's bids, asset-safety mail, killmails. `watchedTypes` leaves
  out characters that are alts, so their sell orders don't add watched books.
- **Clone state** (`cloneState` in `lib/roster.ts`, pure, used by the Worker):
  - `alpha` when any skill's active level is below its trained level;
  - `omega` when any skill is active above Alpha's cap for it (`lib/alphaCaps.ts`, generated from `cloneGrades.jsonl`
    by `scripts/alpha-caps.mjs`; a skill not listed has cap 0);
  - otherwise `unknown`: nothing trained past Alpha's limits, which ESI can't tell apart. The card says "can't
    tell" and takes a choice by hand (a label only: with nothing past the limits, what the character can use is the
    same either way).
  - `cloneSince` is set when the state differs from the stored one.
  - The main's own clone detection in `sync.ts` is left alone: it sets `settings.clone`, which moves the fees.
- **Jobs and the watchdog**: each alt's jobs (`archive`, `sheet`, `mining`) are noted under the alt's ID. The main's
  watchdog round also reads its alts' job rows and their `keys` rows; a finding's key carries the character, and
  the mail names it: "Reading Miner Two's mining ledger has failed 3 times in a row", "Cloud lost Miner Two's
  login". One mail per refused login, as now. A refused login of the alt that sends the mail can't be mailed, as a
  refused sender can't today: it shows in the app only.
- **Routes**, all new paths, each checking the alt is on the caller's roster. A Worker a version behind answers 404,
  so it can never hand back the main's ledger as an alt's:
  - `GET /v1/alts`: each alt's ID, name, scopes, when its login last worked, a refusal, whether it sends mail, its
    jobs, its revision, and its ship with the time of that read.
  - `GET /v1/alts/<id>/pull?since=&after=`: `pull` for that character.
  - `GET /v1/alts/mining/ticks?days=`: every alt's ticks, each with its character.
  - `POST /v1/alts/<id>/read`: run its full read now (used right after adding one, to prove the login).
  - `POST /v1/alts/<id>/sender`, `DELETE /v1/alts/<id>` as above.
- **The Worker's list of documents gains `chars`** (below) in stage 1, before any app pushes it: a push naming a
  document the Worker doesn't know is refused whole.

### 3. In the browser

- **`lib/roster.ts`** (pure): the roster's types; `cloneState`; `usableSkills` (the trained level, or ESI's active
  level where `activeSkills` has one); `altLedger`, which turns what was pulled into a `Data`-shaped value so the
  app's own rules read an alt unchanged; `ownTransfer`, which says whether a journal entry is ISK between two of
  the user's characters; totals across characters.
- **`lib/altStore.ts`** (I/O): its own IndexedDB database, `jita-ledger-alts`, holding the roster and each alt's
  pulled records with the revision reached. It reads `GET /v1/alts` every minute while the app is open and when the
  tab comes back into view, and pulls an alt only when its revision has moved. It starts only for the owner with
  the cloud switched on. No function in it calls `update()` with an alt's record, and nothing else writes to it.
  `clearAll` empties it. A backup export is still the main's ledger only; alts come back from the cloud.
- **Your characters, as the main's ledger knows them**: `Data.chars`, a synced document of its own (like `leave`
  and `plans`), a map of character ID to `{ name, clone? }`, `clone` being the choice made by hand. It is the only
  thing about an alt the main's ledger holds: who is yours, never a record of theirs. It means the transfers rule
  works on any device at once, and a removed alt whose data was kept still counts as yours. The cloud's roster is
  the truth: every read of `GET /v1/alts` adds any alt missing from `chars` and corrects names, so a hand-over
  whose write here failed is put right on the next read. Only deleting an alt's data takes it out. (Not in `prefs`:
  `sanitizePrefs` keeps only the fields it knows, so an app version behind would have dropped it on its next save.)
- **Characters page** (`Characters.tsx`, rail group Pilot, before Omega). Tiles above: all-characters wallet, net
  worth and earnings for the period. Then a card per character, the main first:
  - portrait, name, clone state and since when;
  - wallet, net worth, the skill in training and when the queue ends;
  - for the chosen period, what it earned and what it mined (both defined below);
  - when the cloud last read it; its login (working, refused, permissions missing);
  - Add a character, Hand the cloud this login again, Send alert mail from this character, Remove (asks keep or
    delete, through the app's confirm dialog).
  - The add button says what EVE's login does: it remembers the account you last signed in with, so for a
    character on another account, sign out on EVE's login page first and sign in with that account. Not in a
    private window: the login has to come back to this tab, which holds the other half of it (the PKCE verifier,
    in `sessionStorage`).
  - With the cloud switched off in this browser, the page says the characters are read by the cloud and offers to
    switch it on.
- **What an alt earned** is the sum behind the Wallet's "All income against play", made a function of a ledger
  (today it lives in `useActivityEvents` and the `AllIncome` component, reading the store): each activity by
  Results' rules, every item bought and sold again by its profit, and what was sold but never bought (ore, loot) by
  what it sold for after tax. For an alt:
  - its fee rates come from its own trade skills and clone state, with standings taken as 0 (they aren't read);
    that matters only for a sale whose tax the journal doesn't show;
  - ships it lost aren't subtracted, since its killmails aren't read. The card says so.
- **What an alt mined** is an estimate beside its earnings, never added to them: the ore at the Mining tab's own
  valuation, which is the main's (its reprocessing skills, standing and tax). Earnings are ISK that reached a
  wallet; ore hauled to the main and sold there is the main's income when it sells.
- **Ages are said.** The main's wallet and net worth are live; an alt's wallet is as of its last hourly read, and
  its net worth is the cloud's latest daily point (CCP's average prices, kept when it moves half a percent). The
  all-characters total says what it adds up.
- **Mining tab**: a character filter (All, or one) kept per browser; a per-character table with fleet totals;
  sessions say who mined. "Scaling up" gets "Show for", and the tree marks what that character can fly from its
  own usable skills and queue. `ShipTree`, `MiningTree` and `MasteryTiers` take the pilot (skills, queue, skill
  points, attributes) as a prop rather than reading the store; the Abyssal and Hauling trees pass the main.
- **"Right now" for an alt comes from the cloud, not from ESI live**: the browser has no alt token, so
  `useRightNow` (location, online, ship, read with the main's login) stays the main's. For an alt, the Mining tab
  and the tree's lit hull use the ship at the cloud's last ten-minute read, "mining now" when its ledger grew in
  that read or the one before, and say how old it is ("as of 14:20"). Where an alt is, and whether it's logged in,
  aren't read.
- **Wallet**: the net-worth tile gains "All characters", linking to the Characters page.
- **Transfers between your own characters**: a journal entry whose `refType` is `player_donation` or starts with
  `contract_`, and whose two parties (`firstPartyId`, `secondPartyId`) are the main and a character in `chars`, is
  "Between your characters". `categoryOf`, `flows` and `unusual` in `wallet.ts` take the IDs as an argument and
  stay pure. Such an entry is a line of its own in the Wallet, in neither money in nor money out; today ISK sent to
  an alt counts as "Donations given", which is play, and ISK from one as income. `unusual` no longer flags your own
  character as a new donor or a large donation out. Requiring both parties to be yours fails safe: if a contract
  entry names its parties differently from a donation, it simply isn't relabelled. The plan checks that against a
  real contract entry in the user's journal before relying on it.
- **To do**: an alt's refused login (kind `cloudLogin`, keyed by character, its button handing that alt over
  again), ticked off on a newer read of the roster.
- **Settings**: the cloud panel links to the Characters page; "Clear all data" says it clears the alts' copy too.

### 4. Why nothing can get jumbled

1. An alt never logs in to the app, so `syncCharacter` and the main's cloud sync only ever run as the main.
2. In the cloud an alt's rows are keyed by its own ID; the main's `pull` selects `char_id = the main`.
3. In the browser alt data has its own database and no path into `Data`. The main's ledger holds only `chars`:
   which characters are yours.
4. The alt routes are new paths, and an app version behind is shown no alt logins, so version skew can neither
   return the wrong ledger nor offer the wrong login.
5. Per-ledger jobs enumerate `purpose = 'main'` rows, which an alt never has; the market watch excludes alts.
6. One login per character, and no separate sender login once there are alts, so adding one can't silently kill
   another.

## Testing

- **Pure logic** (`npm run check`): `cloneState` over the real caps (Alpha capped; Omega by a skill above cap;
  unknown); `usableSkills`; `altLedger` round trip; the income function giving the main's present figures;
  `ownTransfer`, `categoryOf`, `flows` and `unusual` with and without `chars`; the roster's sender rules; `chars`
  cleaned like the other documents.
- **Isolation**: with the alt store seeded with alts' own trades, journal and mining and `chars` left empty,
  `getData()` is deep-equal before and after an alt pull, and the main's Wallet, Results and Positions figures are
  identical to those with no alt store at all.
- **Pages**: `check-pages` and `check-phone` run the Characters page and the Mining tab with no alts, one and
  several, on the empty, small and large ledgers, the alt store seeded directly (the harness lets no request out,
  so the pages must draw from what's stored). The logged-out and stranger checks still see only the landing, with
  an alt store present.
- **Worker, locally** (`worker:dev`, local D1): a seeded alt's rows and `keys` row; the routes refuse a character
  not on the roster, page a pull, and delete what `data=delete` says; the sender rules on hand-over; `/v1/status`
  listing no alt rows; the `37` cron run by hand (`/__scheduled?cron=37+*+*+*+*`) skipping alts with no login.
- **Not testable locally**: the cloud reading a real alt through ESI, since the local D1 holds no EVE logins. It is
  proven when the first alt is added in production, watched in `wrangler tail`, with `POST /v1/alts/<id>/read`.

## Stages

Each is its own branch, verified and shipped (`npm run deployed`) before the next.

1. **Cloud**: migration 0016, the `chars` document allowed, alt hand-over and the sender rules, the readers told
   whose login and whose data, `sheet.ts`, `alphaCaps.ts`, the `37` cron and alt mining in the five-minute round,
   the alt routes, the watchdog naming characters, `/v1/status` without alt rows, the market watch excluding alts.
2. **Browser**: `roster.ts`, `altStore.ts`, `Data.chars`, the income function, the Characters page with add, hand
   over again, sender and remove, and Settings and To do pointing at it for a sender.
3. **Mining** across characters, and the trees taking a pilot.
4. **Wallet** total, transfers between characters, To do, Settings.

The notes gain what each stage learns: a new `docs/notes/characters.md` with a rule of its own in `.claude/rules/`
covering the new files, `eve-facts.md` (clone grades, the Alpha rule, the sender trap), `loyalty-hustles.md` (mining
across characters), `positions-results.md` (transfers).

## Not in this design

- An alt as a full ledger with a character switcher. This design doesn't block it: the alt's cloud data is already
  ledger-shaped under its own ID.
- Order advice, alerts and To do items about an alt's own activity, beyond its login being refused.
- Planets, industry jobs, contracts, killmails, standings and freelance jobs for alts.
- Valuing an alt's loyalty points (the rate per point is worked out in the browser for the main's stores).
- Grouping characters by account, and Omega's cost per account: ESI doesn't say which account a character is on.
- Acting in game as an alt from the browser (opening a market window, setting a destination): the browser holds no
  alt token.

## What the review changed (30 September 2026)

The user approved the design and asked for a review for gaps. Reading the code it touches found these, all folded
in above:

1. **Alt reads moved off the five-minute round** onto a cron of their own: that round has 30 s of CPU. The cap of
   twelve alts went with it.
2. **The sender trap.** The first draft had the Worker refuse a sender login for an alt "because accepting it would
   stop the alt's login". EVE stops it at its own login page, before the Worker is asked, so refusing protects
   nothing. The app now keeps the user away from a separate sender login once there are alts.
3. **An app version behind would have offered exactly that login**: its To do turns every refused login the cloud
   lists into "log in a sender" unless it's the main's. Alt rows are therefore not in `/v1/status`.
4. **`chars` is a document of its own, not a field of `prefs`**: `sanitizePrefs` would have dropped it on an older
   version's next save. And the Worker must know the document before any app sends it.
5. **The success test was wrong as written.** The transfers rule changes the main's Wallet on purpose (ISK sent to
   an alt is "Donations given", counted as play, today), so "identical with and without alts" now means alt *data*.
6. **More places look up the sender than the draft listed** (`send`, `tidy`), and a watchdog finding's key needs
   the character, or two alts failing the same job share one.
7. **Things the draft left unsaid**: whose rates value an alt's ore and sales, that its ship losses aren't counted,
   how old each figure is, that the trees read the store directly and need a pilot passed in, that the income sum
   is inside a hook and a component and has to become a function, one request a minute instead of one per alt, the
   removal race, and that contract entries' parties need checking on a real one.
