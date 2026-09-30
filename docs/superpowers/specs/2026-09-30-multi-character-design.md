# Several characters in one Jita Ledger

**Date:** 2026-09-30
**Status:** design, revised after three reviews against the code (what they changed is listed at the end)

## What the user asked for

"I have a few alt characters, currently alpha but they will go back and forth to omega. I just want to use them to
do some semi afk mining and perhaps other activities later on during the day while I'm working. It is time we fully
prep the site to handle multiple accounts and characters. Just got to be sure that the information doesn't get
jumbled between accounts and my main account."

**Their accounts** (an EVE account holds up to three characters; EVE's login asks for the account, then which of
its characters):

- Main account: the main (trading) character, and a second character used only to send the alert mail.
- Alt accounts: separate accounts, one character each for now, which may later grow into industry and planet setups.

So the mail sender is not one of the mining alts, and they asked for care with any change to logging in.

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
  transfers rule, which reads only the main's own journal and the list of which characters are yours;
- the main's login and the mail sender's login work exactly as they do today.

## How things stand (read 30 September 2026)

- **The browser's ledger is one store, not keyed by character** (`store.ts`: IndexedDB `jita-ledger` / `kv`). A
  different character logging in would merge its trades into the main's, and the first cloud sync (`firstSync` in
  `cloud.ts`) would push the main's whole ledger into that character's cloud copy. Today only the owner lock
  (`OWNER_CHARS`, one ID) prevents it: anyone else is logged straight out. `constants.ts` and app-conventions.md
  still say "add an alt here to let it in", which would cause exactly that.
- **In the cloud a ledger is a character.** `records`, `docs`, `revs`, `jobs`, `mining_state`, `mining_ticks`,
  `safety_seen` and the rest are keyed by `char_id`, which is the `sub` of the caller's EVE token. `keys` is
  `(char_id, purpose)` with purpose `main` or `mailer`, and `keepLogin('main')` refuses a login whose character
  isn't the ledger's. Every per-ledger job starts from `SELECT char_id FROM keys WHERE purpose = 'main'`. The only
  queries with no character filter are `watchedTypes` (market.ts) and `background()` (index.ts).
- **The readers already hold two identities that happen to be equal.** In `readMiningRound` the `charId` argument
  binds `mining_state`, `push` and `noteJob`, while `login.charId` binds the ESI paths, the records and
  `mining_ticks`. `archive` uses `charId` as whose data everywhere except `useLogin` and `mailSafety`.
- **Mining carries its character in its records**, but a tick (`MiningTick`) has none and `miningSessions` groups
  by time alone.
- **EVE facts that shape this** (eve-facts.md): logging a character in with a different set of permissions stops
  that character's earlier logins, at EVE's own login page, before the app sees anything; two logins with the same
  set live side by side; it is per character, not per account (the mail character's login lived through the main's
  relog on 29 September). An Alpha account can't be in game at the same time as any other account.
- **Alpha's skill limits are in CCP's static data**: `cloneGrades.jsonl` (build 3561556, 30 September 2026; a copy
  is in `.playwright-mcp/sde/`) has four Alpha grades, one a race, each the same 175 skills with the same level caps
  (Mining IV, Broker Relations II, Trade III; Accounting absent, so 0). ESI has no clone-state field; its skills
  answer gives `trained_skill_level` and `active_skill_level`, which differ only while Alpha caps a skill.
- **The user's real journal** (the cloud's copy, read 30 September 2026): a `player_donation` has the giver as
  `firstPartyId` and the receiver as `secondPartyId`. It holds no contract payment between characters to check.
- **The cron limits** (CLAUDE.md): a cron more frequent than hourly gets 30 s of CPU; an hourly one gets `cpu_ms`
  (2 minutes) and 15 minutes of wall clock; the full-market scan keeps an 11-minute budget inside the hourly run.

## The design

### 1. The roster, and the one new login

- **Migration `0016` only adds**: a table `alts (char_id PRIMARY KEY, ledger, name, added_at, removed_at)`, the
  lasting record of which characters are alts of which ledger, and `mining_state.ship_type_id` (the hull at the
  last mining read).
- **An alt's login** is a `keys` row `(char_id = the main, purpose = 'alt:<altId>', token_char_id = altId)`.
  `purpose` is already free text and part of the key, so any number fit, and every existing `purpose = 'main'`
  query keeps meaning "a full ledger". The ID in a purpose is always a parsed integer. Alts are enumerated from
  `alts` joined to `keys`, never by matching the purpose text.
- **The main's login and the mail sender's login are not changed**: the same buttons, the same flows, the same
  `main` and `mailer` rows. An alt can't be the mail sender; the sender stays a character of its own.
- **The one new login, handing an alt to the cloud**: `loginAltForCloud()` in `auth.ts`, PKCE purpose `cloud-alt`,
  the main's scope set (`SCOPES` plus any asked optional ones), so the same reading code works and a later
  promotion to a full ledger needs no new login. `handleCallback` gains a branch for it that never stores the login
  in the browser (today any purpose it doesn't know falls through to the main's slot, and the owner check would
  then log the owner out). Before leaving for EVE the app asks `GET /v1/alts`; if the Worker doesn't know the route
  yet, it says so and doesn't start a login it couldn't keep.
- **EVE picks the character, so the Worker sorts out who came back** (`POST /v1/keys` with `purpose: 'alt'`
  answers `kept: { as, charId, name }`). The likely slip is adding an alt while still signed in to the main account
  at EVE, whose chooser then offers the main and the mail character:
  - **the main came back**: kept as the `main` login, nothing added. With the same scope set as the main's other
    logins nothing was stopped; if the app's set has grown since they were issued, EVE has stopped them, and this
    is then the working login the cloud needs. The message says which it was;
  - **the mail sender came back**: kept as the `mailer` login, nothing added. The full-scope login stopped the
    sender's two-permission one at EVE's page; it can send and tidy mail, so mail carries on;
  - **anyone else**: an alt. Stored sealed, its `alts` row written (or `removed_at` cleared).
  The toast names the character and what it was taken as.
- **The reverse slip can't be absorbed**: a sender login (two permissions) that turns out to be an alt has stopped
  that alt's cloud login, and can't read for it. `POST /v1/keys` with `purpose: 'mailer'` for a character in `alts`
  is refused, the alt's `keys` row is marked refused at once so its card says so, the existing sender is left
  alone, and the message says what happened: "That was Miner Two, one of your characters, not your mail sender.
  EVE allows a character one set of permissions, so that login has stopped the one the cloud reads Miner Two with.
  Hand Miner Two over again on the Characters page." The browser's own sender slot (`loginMailer`, used only when
  the cloud holds no sender) gets the same check in `App.tsx` after the store has loaded, where `chars` is known:
  the login is revoked and removed, with the same message.
- **Handing over again** (a refusal, or new permissions): the same flow; the row is replaced and the refusal
  cleared. A login handed over before a scope was added keeps working; the card names what's missing.
- **The owner lock is unchanged, and said correctly.** Alts are not added to `OWNER_CHARS`; the comment and the
  note that say to are fixed. The Worker also refuses every request whose caller is in `alts`, so an alt could not
  push a ledger over its own cloud copy even if it were let in.
- **An app version behind** is shown no alt logins: `/v1/status` lists only the `main` and `mailer` rows in
  `background.keys`. (Its To do turns every refused login it's shown, other than the main's, into "log in a
  sender", which for an alt is the slip above.) Alt removal never goes through `/v1/keys`, whose delete treats any
  purpose but `mailer` as `main`.
- **Removing**: `DELETE /v1/alts/<id>?data=keep|delete` revokes the login at EVE and drops the `keys` row. Either
  way its `mining_state` and `jobs` rows go, so a later re-add starts from a fresh mining baseline and no old
  failing streak. `keep` sets `removed_at`; its records stay, unreachable until it's added again, and it stays out
  of the market watch. `delete` also removes its rows from `records`, `docs`, `mining_ticks`, `safety_seen` and
  `alts`. Its `revs` row is kept in both, so its revision never restarts and a device holding an old one can't miss
  what comes after a re-add.
- **With "Stop keeping watch" on the main** (no `main` row): alts are still read, since they have their own
  logins. Nothing about them is mailed, because the watchdog runs in the main's round; the Characters page shows
  their state.
- **Scale**: about ten alts expected; nothing caps it. A second or third character on an alt account is one more
  login and one more card.

### 2. What the cloud reads, and where it goes

Everything read for an alt is stored under `char_id = altId`, in the same kinds and documents as a main's ledger.

- **Whose login, whose data.** Only `useLogin` takes the ledger and the purpose. Every ESI path, every table
  (`mining_state`, `mining_ticks`, `records`, `docs`, `safety_seen`), `push` and `noteJob` take `char`. Each reader
  checks `login.charId === char` before it writes anything, and that `char` is the ledger exactly when the purpose
  is `main`. It also checks the alt's `keys` row is still there, so an alt removed mid-read doesn't get rows back.
  A test runs each reader for an alt and asserts nothing was written under the ledger's ID.
- **Hourly, on a cron of its own** (`37 * * * *`, the Worker's fifth): every alt's full read, one after another,
  `/markets/prices/` fetched once and passed in (`archive` fetches it itself, twice, today). Not on the existing
  hourly cron, where alt reads would run ahead of a scan whose 11-minute budget doesn't know they happened; not in
  the five-minute round, which has 30 s of CPU and the main's alerts to get through. The `scheduled` handler's last
  branch is the hourly archive, so the new cron is matched by name before it. (A new cron took 26 minutes to first
  fire last time.) Ten alts are far inside 2 minutes of CPU and 30,000 subrequests.
- **The full read** is `archive` and then the sheet, for one alt:
  - `archive`, unchanged in what it reads: wallet trades and journal, orders and order history, assets (`stock`,
    asset safety wraps registered), loyalty points, item names, one net-worth point a day. For an alt it skips two
    things it does for a ledger: the asset-safety mail (an alt's first read would otherwise mail the main about
    every wrap it has), and the `orders` job row. It hands back the wallet balance and loyalty points it read.
  - the sheet (`sheet.ts`, alts only): `/skills/`, `/skillqueue/`, `/attributes/`. Written as the alt's `skills`
    doc (trained levels, the main's shape) and `meta` doc with the main's field names: `walletBalance`, `walletAt`,
    `totalSp`, `skillSp`, `skillQueue`, `attributes`, `lpBalances`, `cloneDetected`, and new `cloneSince` and
    `activeSkills` (only the skills whose usable level is below trained). Pushed only when something other than a
    timestamp changed.
- **Every ten minutes**, at the end of the five-minute round, after every ledger's orders, the market watch, the
  alerts and the watchdog (`readMiningRound`): the mining ledger and the ship it's in, as `mining` records and
  `mining_ticks` under the alt's ID. Two changes that apply to the main's mining too:
  - the ship is read on every read and kept on `mining_state` (today the first read skips it);
  - **a snapshot older than 25 minutes is a baseline, not a comparison**: the read stores the new snapshot and
    makes no ticks. Today a first read after a gap (a refused login, a removed and re-added alt) turns everything
    mined in the gap into one tick, which the app reads as one impossible session.
- **Not done for an alt**: the twenty-minute orders refresh, order judging, alerts and alert mail, opportunity
  mail, the track record, share measuring, the Sniper's bids, asset-safety mail, killmails. `watchedTypes` leaves
  out every character in `alts`, removed ones included, so their sell orders don't add watched books.
- **Clone state** (`cloneState` in `lib/roster.ts`, pure, used by the Worker):
  - `alpha` when any skill's active level is below its trained level;
  - `omega` when any skill is active above Alpha's cap for it (`lib/alphaCaps.ts`, generated from `cloneGrades.jsonl`
    by `scripts/alpha-caps.mjs`; a skill not listed has cap 0);
  - otherwise `unknown`: nothing trained past Alpha's limits, which ESI can't tell apart. The card says "can't
    tell" and takes a choice by hand (a label only: with nothing past the limits, what the character can use is the
    same either way).
  - `cloneSince` is set when the state differs from the stored one.
  - The main's own clone detection in `sync.ts` is left alone: it sets `settings.clone`, which moves the fees.
- **Jobs and the watchdog**: an alt's jobs (`archive`, `sheet`, `mining`) are noted under the alt's ID. The main's
  watchdog round also reads its alts' job rows and refused logins, by the `alts` table, and:
  - a finding's key carries the character, and the words name it ("Reading Miner Two's mining ledger has failed 3
    times in a row", "Cloud lost Miner Two's login") instead of "your";
  - a refused login is mailed for the main and for alts, not for the sender (which would send it), as now;
  - **a refused login quiets only its own character's job mails.** Today any refused login drops every
    login-looking job finding, so a refused alt would silence the main's, and the reverse.
- **Two jobs refreshing one alt's login at once** (the `37` read and a five-minute round still running) could get
  one of them refused for a round. It clears on the next, inside the ten minutes a refusal must last before it's
  mailed. Not verified.
- **Routes**, all new paths, each checking the alt is on the caller's roster. A Worker a version behind answers 404,
  so it can never hand back the main's ledger as an alt's:
  - `GET /v1/alts`: each alt's ID, name, scopes, when its login last worked, a refusal, its jobs, its revision, and
    its ship with the time of that read.
  - `GET /v1/alts/mining/ticks?days=`: every alt's ticks, each with its character (matched before the `<id>` routes).
  - `GET /v1/alts/<id>/pull?since=&after=`: `pull` for that character.
  - `POST /v1/alts/<id>/read`: run its full read now (used right after adding one, to prove the login).
  - `DELETE /v1/alts/<id>` as above.
- **The Worker's list of documents gains `chars`** (below) in stage 1, before any app pushes it: a push naming a
  document the Worker doesn't know is refused whole.

### 3. In the browser

**Modules**

- **`lib/roster.ts`** (pure, shared with the Worker, so free of the store): the roster's types, `cloneState`,
  `usableSkills` (the trained level, or ESI's active level where `activeSkills` has one), `ownTransfer`.
- **`lib/altLedger.ts`** (browser): turns what was pulled for an alt into a `Data`-shaped value, so the app's own
  rules read it unchanged. It supplies what an alt doesn't have: no positions, tags or Personal marks, and settings
  built from the alt's own trade skills and clone state with standings 0 (`unknown` is taken as Omega, which is
  the same thing when nothing is past Alpha's caps). It returns the same object until the alt's revision moves:
  `positions.ts` and `refunds.ts` cache by identity, one ledger at a time, so an alt's income is worked out once a
  revision and kept, not recomputed on every render.
- **`lib/income.ts`** (pure): the sum behind the Wallet's "All income against play", lifted out of
  `useActivityEvents` and the `AllIncome` component so it is a function of a ledger, the item groups, the loss
  classification and a window. The hook stays, with the same return shape, for Results. A test written *before*
  the move records the main's present figures on a generated ledger, and the move has to reproduce them: the
  ways it could drift are counting Trading twice, the window's first millisecond, and mixing characters' loyalty
  stores into one set of store goods (each character's item groups use its own stores).
- **`lib/altStore.ts`** (I/O): its own IndexedDB database, `jita-ledger-alts` (object store `kv`), holding the
  roster, each alt's pulled records with the revision reached, and the last ticks read, so the pages draw from it
  with the cloud unreachable. It reads `GET /v1/alts` every minute while the app is open and when the tab comes
  back into view, and pulls an alt only when its revision has moved. It starts only for the owner with the cloud
  switched on. No function in it passes an alt's record to `update()`, and nothing else writes to it. `clearAll`
  empties it, and a pull in flight checks the same wipe counter the sync does before it writes. A backup export is
  still the main's ledger only; alts come back from the cloud.
- **Item names are game facts, not a character's records**: looking up the name of an ore an alt mined may add it
  to the main's `names`, as any page's lookup does.

**Which characters are yours**

- `Data.chars`, a synced document of its own, wired as `leave` and `plans` are (the store's keys and empty value,
  cleaned on load, on import and on pull, both lists of documents). A map of character ID to `{ name, clone? }`,
  `clone` being the choice made by hand. It is the only thing about an alt the main's ledger holds: who is yours,
  never a record of theirs.
- Only the roster read writes it: every read of `GET /v1/alts` adds any alt missing from it and corrects names.
  (The login's return can't: it runs before the store has loaded and before the cloud sync is listening.)
- An entry is never taken out, by removing an alt or deleting its data: past transfers to it stay transfers.
  Importing a backup that has no `chars` leaves the present one.
- Not a field of `prefs`: `sanitizePrefs` keeps only the fields it knows, so an app version behind would have
  dropped it on its next save.

**Characters page** (`Characters.tsx`; registered in `App.tsx`'s lazy pages, `PAGES` and render chain, `nav.ts`'s
`PageKey` and the Pilot group before Omega, `scripts/pages.mjs`, and CLAUDE.md's list of pages)

- Tiles above: all-characters wallet, net worth and earnings for the period, each saying what it adds up.
- A card per character, the main first: portrait, name, clone state and since when; wallet, net worth, the skill
  in training and when the queue ends; for the chosen period what it earned and what it mined; when the cloud last
  read it; its login (working, refused, permissions missing); Hand the cloud this login again; Remove (asks keep
  or delete, through the app's confirm dialog).
- Add a character. Its text says what EVE's login does: it asks for an account, then which of its characters, and
  remembers the account you last used. For an alt on another account, sign out on EVE's page first; if it offers
  your main and your mail character, you're still signed in to your main account. Not in a private window: the
  login has to come back to this tab, which holds the other half of it (the PKCE verifier, in `sessionStorage`).
- With the cloud switched off in this browser, the page says the characters are read by the cloud and offers to
  switch it on.
- Cards, tiles and the period choice wrap at a phone's width; `check-phone` holds it to that.

**What the figures are**

- **What an alt earned**: `income.ts` on its own ledger. Each activity by Results' rules, every item bought and
  sold again by its profit, and what was sold but never bought (ore, loot) by what it sold for after tax. Its fee
  rates matter only for a sale whose tax the journal doesn't show. Ships it lost aren't subtracted, since its
  killmails aren't read; the card says so.
- **What an alt mined** is an estimate beside its earnings, never added to them: the ore at the Mining tab's own
  valuation, which is the main's (its reprocessing skills, standing and tax). Earnings are ISK that reached a
  wallet; ore hauled to the main and sold there is the main's income when it sells.
- **Ages are said.** The main's wallet and net worth are live; an alt's wallet is as of its last hourly read, and
  its net worth is the cloud's latest daily point (CCP's average prices, kept when it moves half a percent).
- **The Wallet's "All characters" line is a figure beside the net worth, never part of it.** The Wallet saves its
  own total to `netWorth`, a synced record that goals and the trend read; the alts' worth is not added to the
  parts, the total, the liquid figure or what's saved.

**Mining**

- Ticks carry their character: the alts' from the cloud, the main's tagged as the main's. **Sessions are built per
  character**, so two characters mining at once are two sessions, not one with their ore summed.
- A character filter (All, or one) kept per browser. A per-character table with fleet totals. Sessions say who.
- "Scaling up" has "Show for", one character: its own measured pace, its own ship, its own most-mined ore, its own
  usable skills, queue and clone state (Alpha trains at half speed). All doesn't apply there.
- The pilot is passed down as a prop to everything that reads the store for skills today: `ShipTree`,
  `MiningTree`, `MasteryTiers`, `SkillNeeds`, `SkillStrip` and `useTrainTimes`. The Abyssal and Hauling trees pass
  the main. For an alt, "Save fit in game" is hidden (it saves to the main's fittings); Copy fit and Multibuy stay.
- **"Right now" for an alt comes from the cloud, not from ESI live**: the browser has no alt token, so
  `useRightNow` stays the main's. For an alt the tab and the tree's lit hull use the ship at the cloud's last
  ten-minute read, "mining now" when its ledger grew in that read or the one before, and say how old it is ("as of
  14:20"). Where an alt is, and whether it's logged in, aren't read.
- The tab's line promising fleets "later" goes.

**Transfers between your own characters**

- The rule (`ownTransfer`): a journal entry whose `refType` is `player_donation`, `player_trading` or starts with
  `contract_`, and whose two parties (`firstPartyId`, `secondPartyId`) are the main and a character in `chars`.
  Requiring both parties to be yours fails safe: an entry that names its parties some other way isn't relabelled.
  Donations are confirmed on the user's journal; contract and direct-trade entries between characters aren't in it
  yet, so they rest on that safety.
- `categoryOf`, `describeRef`, `flows` and `unusual` in `wallet.ts` take the IDs as an optional argument and stay
  pure; without it they answer as today, so the existing tests and Results' own call are unchanged.
- In the Wallet such an entry is "Between your characters": a line of its own that `flows` returns apart from
  money in and money out. That changes, on purpose, everything worked out from those: play (ISK sent to an alt is
  "Donations given" today, which is Personal), the runway, the day's biggest cost, the month's report, and goals
  that earn by cash flow. The balance chart's dots and the CSV say "Between your characters" too.
- In Results, a courier reward between your own characters isn't Hauling income.
- `unusual` doesn't flag your own character as a new donor, a large donation out, or an odd-hour contract.

**To do and Settings**

- An alt's refused login is a To do item (kind `cloudLogin`, keyed by character), read from the roster with the
  roster's read time, its button handing that alt over again; ticked off on a newer roster read.
- Settings' cloud panel links to the Characters page; "Clear all data" says it clears the alts' copy too. The
  sender and watch controls there are untouched.

### 4. Why nothing can get jumbled

1. An alt never logs in to the app, so `syncCharacter` and the main's cloud sync only ever run as the main; the
   Worker refuses a caller that is an alt.
2. In the cloud an alt's rows are keyed by its own ID; every reader is told whose data it writes and checks the
   login is that character's before writing; the main's `pull` selects `char_id = the main`.
3. In the browser alt data has its own database and no path into `Data`. The main's ledger holds only `chars`:
   which characters are yours. The all-characters net worth is shown beside the main's, never saved into it.
4. The alt routes are new paths, and an app version behind is shown no alt logins, so version skew can neither
   return the wrong ledger nor offer the wrong login.
5. Per-ledger jobs enumerate `purpose = 'main'` rows, which an alt never has; the market watch excludes alts.
6. The main's and the sender's logins are untouched, and a wrong character picked at EVE's page is taken as what
   it is, not stored as something else.

## Testing

- **Pure logic** (`npm run check`): `cloneState` over the real caps; `usableSkills`; `altLedger`; `income.ts`
  reproducing the figures recorded before the move; `ownTransfer`, `categoryOf`, `flows`, `unusual` and Results'
  hauling line with and without the IDs; mining sessions per character, and the 25-minute baseline; the watchdog's
  per-character quieting and wording; who-came-back sorting (main, sender, alt); `chars` cleaned like the other
  documents.
- **Isolation**: with the alt store seeded with alts' own trades, journal and mining and `chars` left empty,
  `getData()` is deep-equal before and after an alt pull, and the main's Wallet, Results and Positions figures,
  saved net worth included, are identical to those with no alt store at all.
- **Pages**: `check-pages` and `check-phone` gain an alt dimension (none, one, several), seeding the alt store
  directly and the Mining filter through `localStorage`, on the empty, small and large ledgers; the harness lets no
  request out, so the Characters page and the Mining tab, sessions included, must draw from what's stored. The
  logged-out and stranger runs seed an alt store too and must show no alt's name.
- **Worker, locally** (`worker:dev`, local D1): each reader run for a seeded alt writes nothing under the ledger's
  ID; the routes refuse a character not on the roster, page a pull, and remove what `keep` and `delete` say;
  `/v1/status` lists no alt rows; a caller in `alts` is refused; the `37` cron run by hand
  (`/__scheduled?cron=37+*+*+*+*`) skips alts with no login.
- **Not testable locally**: the cloud reading a real alt through ESI, and EVE's login itself, since the local D1
  holds no EVE logins. They are proven when the first alt is added in production, watched in `wrangler tail`, with
  `POST /v1/alts/<id>/read`.

## Stages

Each is its own branch, verified and shipped (`npm run deployed`) before the next.

1. **Cloud**: migration 0016, the `chars` document allowed, the readers told whose login and whose data, the
   mining baseline, `sheet.ts`, `alphaCaps.ts`, the `37` cron and alt mining in the five-minute round, alt
   hand-over with who-came-back, the alt routes, the watchdog by character, `/v1/status` without alt rows, the
   market watch excluding alts, the caller check, the `OWNER_CHARS` wording.
2. **Browser**: `roster.ts`, `altLedger.ts`, `income.ts` (its recording test first), `altStore.ts`, `Data.chars`,
   the `cloud-alt` login, the Characters page with add, hand over again and remove, the sender-slot check.
3. **Mining** across characters: ticks and sessions per character, the filter and fleet table, the pilot passed to
   the trees and skill strips.
4. **Wallet** total, transfers between characters, To do, Settings.

The notes gain what each stage learns: a new `docs/notes/characters.md` with a rule of its own in `.claude/rules/`
covering the new files, `eve-facts.md` (clone grades, the Alpha rule, one set of permissions a character and where
EVE enforces it, a donation's parties), `loyalty-hustles.md` (mining across characters), `positions-results.md`
(transfers).

## Not in this design

- An alt as a full ledger with a character switcher. This design doesn't block it: the alt's cloud data is already
  ledger-shaped under its own ID.
- An alt as the mail sender.
- Order advice, alerts and To do items about an alt's own activity, beyond its login being refused.
- Planets, industry jobs, contracts, killmails, standings and freelance jobs for alts. The user expects to grow
  the alt accounts into industry and planets; each is another reader run for an alt, which this design's readers
  and jobs are shaped for.
- Valuing an alt's loyalty points (the rate per point is worked out in the browser for the main's stores).
- Grouping characters by account, and Omega's cost per account: ESI doesn't say which account a character is on.
- Acting in game as an alt from the browser (opening a market window, setting a destination, saving a fit): the
  browser holds no alt token.

## What the reviews changed (30 September 2026)

The user approved the design and asked for a review for gaps. Three passes against the code (the author's, then
two independent ones, cloud and browser) and the user's account of their accounts changed these:

**From the user's accounts**

1. The mail sender is a character on the main account, not a mining alt. The draft's "any alt can be the sender",
   its `sender` column and its rule hiding the separate sender login once alts exist are gone: the sender's login
   is untouched. What remains is sorting out a wrong character picked at EVE's page.

**Would have mixed or lost data**

2. `readMiningRound` binds some tables by its argument and others by the login's character; refactored naively an
   alt's mining would be pushed into the main's ledger. Hence "whose login, whose data" spelled out, with a check
   and a test.
3. The Wallet saves its net-worth total into the main's synced ledger; an "All characters" figure added to it
   would have put alts' worth there.
4. `handleCallback` sends any purpose it doesn't know to the main's login slot, and the owner check would then log
   the owner out.
5. Mining ticks have no character and sessions group by time: two characters mining at once would have been one
   session with summed ore, feeding pace and payback.
6. An alt's first `archive` would have mailed the main about every asset-safety wrap the alt has.
7. `constants.ts` and the notes tell you to add an alt to `OWNER_CHARS`, which is the one way to mix the ledgers.
8. Deleting an alt's data restarted its revision, so a device holding the old one would miss everything after a
   re-add; a kept mining snapshot would have turned a gap into one tick.

**Would have misbehaved**

9. Alt reads in the five-minute round: 30 s of CPU. They have a cron of their own.
10. EVE stops a character's earlier logins at its own page, so the Worker refusing a login afterwards protects
    nothing; and the main picked by mistake can be the only working login left. Wrong picks are now kept as what
    they are.
11. An app version behind turns a refused alt login into "log in a sender"; alt rows stay out of `/v1/status`. A
    new app against an old Worker would have sent the user to EVE for a login it couldn't keep; it asks first.
12. Any refused login silenced every login-looking job mail; the watchdog's wording and types assume "your".
13. `chars` inside `prefs` would be dropped by an older version; written from the login's return it would be lost
    (the store isn't loaded yet); removed on delete it would turn past transfers back into play.
14. Transfers reach further than listed: the chart's dots, the CSV, goals by cash flow, Results' hauling line,
    odd-hour contracts, direct trades.
15. A roster kept only as `keys` rows can't say a removed alt is still not a ledger; hence the `alts` table.

**Left unsaid**

16. Whose rates value an alt's ore and sales; that its losses aren't counted; how old each figure is; that the
    trees, skill strips and training times read the store and need a pilot; that the income sum lives in a hook
    and a component and needs a recording test before it moves; one roster request a minute instead of one per
    alt; what the page check has to learn; where a new page is registered.
