# Several characters in one Jita Ledger

**Date:** 2026-09-30
**Status:** design, awaiting review

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

Success is: alts' mining, ISK and skills visible per character and as a fleet; every figure on the main's existing
pages identical with and without alts; and no way, by construction, for an alt's record to reach the main's ledger.

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
- **Alpha's skill limits are in CCP's static data**: `cloneGrades.jsonl` (build 3561556, 30 September 2026) has four
  Alpha grades, one a race, each the same 175 skills with the same level caps (Mining IV, Broker Relations II,
  Trade III; Accounting absent, so 0). ESI has no clone-state field; its skills answer gives `trained_skill_level`
  and `active_skill_level`, which differ only while Alpha caps a skill.

## The design

### 1. The roster: an alt is a login kept under the main's ledger

- An alt's login is a `keys` row `(char_id = the main, purpose = 'alt:<altId>', token_char_id = altId)`. `purpose`
  is already free text and part of the key, so any number fit with no change to the table's shape, and every
  existing `purpose = 'main'` query keeps meaning "a full ledger".
- Migration `0016`: `ALTER TABLE keys ADD COLUMN sender INTEGER` (1 on the alt that sends alert mail). It only adds.
- **Handing one over**: `loginAltForCloud()` in `auth.ts` (PKCE purpose `cloud-alt`, the main's scope set:
  `SCOPES` plus any asked optional ones). The refresh token goes to `POST /v1/keys` with `purpose: 'alt'` and is
  never stored in the browser. The Worker refreshes it once to prove it, then:
  - refuses the ledger's own character ("that's your main");
  - stores it sealed, as today's logins are;
  - if that character is the ledger's `mailer`, deletes the `mailer` row and sets `sender = 1` on the alt row: one
    login per character, because the new login has already stopped the old one.
- `POST /v1/keys` with `purpose: 'mailer'` for a character that is already an alt is refused with "choose it as the
  sender on the Characters page": accepting it would stop the alt's login.
- **The sender** is the `mailer` row when there is one, else the alt with `sender = 1`. One helper in `eve.ts`
  (`useSender`, `hasSender`) replaces the five places that look up `purpose = 'mailer'` (alerts ×2, safety,
  watchdog, snipe). `POST /v1/alts/<id>/sender` with `{on}` makes an alt the sender (dropping a `mailer` row) or
  stops it. For an app version behind, `/v1/status` also lists a sender alt as a `mailer` entry, so
  `cloudSendsMail` stays true and that tab doesn't mail as well.
- **Same permissions as the main**, so the same reading code works and a later promotion to a full ledger needs no
  new login. A login handed over before a scope was added keeps working; the card names what's missing.
- **The owner lock is unchanged.** Alts are not added to `OWNER_CHARS`. Only the main's token can add, read or
  remove an alt.
- **Removing**: `DELETE /v1/alts/<id>?data=keep|delete` revokes the login at EVE and drops the row. `delete` also
  removes the alt's rows from `records`, `docs`, `revs`, `jobs`, `mining_state`, `mining_ticks` and `safety_seen`.
  Kept data is unreachable until the character is added again.
- **Scale**: up to about ten alts. Each adds one mining read every ten minutes and one full read an hour.

### 2. What the cloud reads, and where it goes

Everything read for an alt is stored under `char_id = altId`, in the same kinds and documents as a main's ledger.

- **A reader is told whose login and whose data**: the jobs take `{ ledger, purpose, char }` instead of one
  `charId` (`useLogin(env, ledger, purpose)` for the token, `char` for ESI paths and for `push`). For a main all
  three are what they are today.
- **Hourly, after the ledgers' own copies** (`archive`, unchanged in what it reads): wallet trades and journal,
  orders and order history, assets (`stock`, asset safety wraps registered but not mailed), loyalty points, item
  names, one net-worth point a day. `/markets/prices/` is fetched once for the round and shared.
- **Hourly, new, alts only** (`sheet.ts`): `/skills/`, `/skillqueue/`, `/attributes/`, `/wallet/`. Written as the
  alt's `skills` doc (trained levels, the main's shape) and `meta` doc with the main's field names: `walletBalance`,
  `walletAt`, `totalSp`, `skillSp`, `skillQueue`, `attributes`, `lpBalances`, `cloneDetected`, and new `cloneSince`
  and `activeSkills` (only the skills whose usable level is below trained).
- **Every ten minutes** (`readMiningRound`, as for a main): the mining ledger and the ship it's in, as `mining`
  records and `mining_ticks` under the alt's ID.
- **Not done for an alt**: the twenty-minute orders refresh, order judging, alerts and alert mail, opportunity
  mail, the track record, share measuring, the Sniper's bids, asset-safety mail. `watchMarkets` leaves out
  characters that are alts, so their sell orders don't add watched books.
- **Clone state** (`cloneState` in `lib/roster.ts`, pure, used by the Worker):
  - `alpha` when any skill's active level is below its trained level;
  - `omega` when any skill is active above Alpha's cap for it (`lib/alphaCaps.ts`, generated from `cloneGrades.jsonl`
    by `scripts/alpha-caps.mjs`; a skill not listed has cap 0);
  - otherwise `unknown`: nothing trained past Alpha's limits, which ESI can't tell apart. The card says "can't
    tell" and takes a choice by hand (a label only: with nothing past the limits, what the character can use is the
    same either way).
  - `cloneSince` is set when the state differs from the stored one.
- **Jobs and the watchdog**: each alt's jobs (`archive`, `sheet`, `mining`) are noted under the alt's ID. The main's
  watchdog round also reads its alts' job rows and their `keys` rows, and the mail names the character: "Reading
  Miner Two's mining ledger has failed 3 times in a row", "Cloud lost Miner Two's login". One mail per refused
  login, as now.
- **Routes**, all new paths, each checking the alt is on the caller's roster. A Worker a version behind answers 404,
  so it can never hand back the main's ledger as an alt's:
  - `GET /v1/alts`: each alt's ID, name, scopes, when its login last worked, a refusal, whether it sends mail, its
    jobs, its revision.
  - `GET /v1/alts/<id>/pull?since=&after=`: `pull` for that character.
  - `GET /v1/alts/<id>/mining/ticks?days=`.
  - `POST /v1/alts/<id>/read`: run its hourly read now (used right after adding one, to prove the login).
  - `POST /v1/alts/<id>/sender`, `DELETE /v1/alts/<id>` as above.

### 3. In the browser

- **`lib/roster.ts`** (pure): the roster's types; `cloneState`; `usableSkills` (the trained level, or ESI's active
  level where `activeSkills` has one);
  `altLedger`, which turns what was pulled into a `Data`-shaped value so the app's own rules read an alt unchanged
  (`attribute` and `otherSales` in `results.ts`, the mining rules, `netWorth` records); `ownTransfer`, which says
  whether a journal entry is ISK between two of the user's characters; totals across characters.
- **`lib/altStore.ts`** (I/O): its own IndexedDB database, `jita-ledger-alts`, holding the roster and each alt's
  pulled records with the revision reached. Pull-only, every minute while the app is open and when the tab comes
  back into view. No function in it calls `update()`, and nothing else writes to it. `clearAll` empties it. A
  backup export is still the main's ledger only; alts come back from the cloud.
- **Characters page** (`Characters.tsx`, rail group Pilot, before Omega). Tiles above: all-characters wallet, net
  worth and earnings for the period. Then a card per character, the main first:
  - portrait, name, clone state and since when;
  - wallet, net worth (its newest daily point), the skill in training and when the queue ends;
  - for the chosen period, what it earned by activity (Results' rules on its own records) and what it mined;
  - when the cloud last read it; its login (working, refused, permissions missing);
  - Add a character, Hand the cloud this login again, Send alert mail from this character, Remove (asks keep or
    delete, through the app's confirm dialog).
  - The add button says that EVE's login page shows the account you're signed in to there, and how to pick a
    character on another account.
- **Mining tab**: a character filter (All, or one) kept per browser; a per-character table with fleet totals;
  sessions say who mined. "Scaling up" gets "Show for", and the tree marks what that character can fly from its
  own usable skills and queue.
- **Wallet**: the net-worth tile gains "All characters", linking to the Characters page.
- **Your characters, as the main's ledger knows them**: `prefs.chars`, a synced map of character ID to
  `{ name, clone? }`, written when an alt is added, dropped when its data is deleted, `clone` being the choice made
  by hand. It is the only thing about an alt the main's ledger holds: who is yours, never a record of theirs. It
  means the rules below work on any device before the alt store has loaded, and a removed alt whose data was kept
  still counts as yours.
- **Transfers between your own characters**: a journal entry whose `refType` is `player_donation` or starts with
  `contract_`, and whose two parties are the main and a character in `prefs.chars`, is "Between your characters" in
  the Wallet's categories. It counts as neither income nor spending there, in Results or in "All income against
  play", and `unusual` no longer flags one of your characters as a new donor. The rules take the IDs as an argument
  and stay pure.
- **To do**: an alt's refused login (kind `cloudLogin`, keyed by character), ticked off on a newer read of the roster.
- **Settings**: the cloud panel links to the Characters page; "Clear all data" says it clears the alts' copy too.

### 4. Why nothing can get jumbled

1. An alt never logs in to the app, so `syncCharacter` and the main's cloud sync only ever run as the main.
2. In the cloud an alt's rows are keyed by its own ID; the main's `pull` selects `char_id = the main`.
3. In the browser alt data has its own database and no path into `Data`. The main's ledger holds only
   `prefs.chars`: which characters are yours.
4. The alt routes are new paths, so version skew can't return the wrong ledger.
5. Per-ledger jobs enumerate `purpose = 'main'` rows, which an alt never has; the market watch excludes alts.
6. One login per character, so adding an alt can't silently kill the mail sender.

## Testing

- **Pure logic** (`npm run check`): `cloneState` over the real caps (Alpha capped; Omega by a skill above cap;
  unknown); `usableSkills`; `altLedger` round trip; `ownTransfer` and the Wallet, Results and `unusual` rules with
  and without `prefs.chars`; the roster's sender rules; `sanitizePrefs` keeping and cleaning `chars`.
- **Isolation**: with alts seeded with their own trades, journal and mining, `getData()` is deep-equal before and
  after an alt pull, and the main's Wallet, Results and Positions figures are identical with and without them.
- **Pages**: `check-pages` and `check-phone` run the Characters page and the Mining tab with no alts, one and
  several, on the empty, small and large ledgers.
- **Worker, locally** (`worker:dev`, local D1): a seeded alt's rows and `keys` row; the routes refuse a character
  not on the roster, page a pull, and delete what `data=delete` says; the sender rules on hand-over.
- **Not testable locally**: the cloud reading a real alt through ESI, since the local D1 holds no EVE logins. It is
  proven when the first alt is added in production, watched in `wrangler tail`, with `POST /v1/alts/<id>/read`.

## Stages

Each is its own branch, verified and shipped (`npm run deployed`) before the next.

1. **Cloud**: migration 0016, alt hand-over and the sender rule, the readers told whose login and whose data,
   `sheet.ts`, `alphaCaps.ts`, the alt routes, the watchdog naming characters, the market watch excluding alts.
2. **Browser**: `roster.ts`, `altStore.ts`, the Characters page with add, hand over again, sender and remove.
3. **Mining** across characters, and the tree per character.
4. **Wallet** total, transfers between characters, To do, Settings.

The notes gain what each stage learns: `cloud.md` (alts), `eve-facts.md` (clone grades, the Alpha rule),
`loyalty-hustles.md` (mining across characters), `positions-results.md` (transfers), and a rule file for any new
source files.

## Not in this design

- An alt as a full ledger with a character switcher. This design doesn't block it: the alt's cloud data is already
  ledger-shaped under its own ID.
- Order advice, alerts and To do items about an alt's own activity, beyond its login being refused.
- Planets, industry jobs, contracts, killmails and freelance jobs for alts.
- Grouping characters by account, and Omega's cost per account: ESI doesn't say which account a character is on.
- Acting in game as an alt from the browser (opening a market window, setting a destination): the browser holds no
  alt token.
