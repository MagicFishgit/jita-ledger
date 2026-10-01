# Several characters

Decisions worth not undoing. How alts (characters on the owner's other accounts) are kept apart from the main.

- **An alt feeds the one ledger and never logs in to the app** (decided with the user, 30 September 2026; the design
  is `docs/superpowers/specs/2026-09-30-multi-character-design.md`). Their accounts: the main account holds the trading
  character and a second one used only to send alert mail; each alt account has one character for now and may grow
  into industry and planets. Their one fear was information getting jumbled, so the separation is structural: an alt's
  login is handed to the cloud once, everything read for it is filed under its own character ID, and the main's ledger
  holds no row of an alt's.
- **The roster is the `alts` table, the login a `keys` row `(the main, 'alt:<id>')`** (migration 0016, `worker/src/alts.ts`).
  Alts are found through the table, never by matching a purpose's text, and a removed alt whose data was kept stays in
  it (`removed_at`), so it is still known not to be a ledger: the market watch reads every ledger's open orders.
- **A reader is told whose login it uses and whose data it writes** (`Reader` in `worker/src/eve.ts`). Only `useLogin`
  takes the ledger and the purpose; every ESI path, table, `push` and `noteJob` take `char`; `readerLogin` refuses
  before anything is read when the login isn't that character's. `readMiningRound` was written when the two were one
  character and bound some tables by its argument and others by the login's: refactored naively it would push an alt's
  mining into the main's records. `scripts/check-worker.mjs` runs each reader for an alt against real SQL and checks
  the main's rows are untouched.
- **The main's path through the readers is as it was.** `stillKept` gates an alt's writes only: a ledger whose login
  is dropped mid-read still has that read's rows written, as before. The `archive` job's detail doesn't carry the
  wallet and points `archive` hands the sheet. And `useLogin` marks a login refused only if the row still holds the
  token it tried, so two jobs refreshing one login at once can't leave a working login marked refused.
- **Mining pushes its records before it advances the snapshot.** What changed is measured against the stored
  snapshot, so a push that failed after the snapshot moved was never sent again, and for an alt the cloud is the
  only writer.
- **EVE's page picks the character, so the cloud sorts out who came back** (`sortLogin` in `lib/roster.ts`,
  `keepHandedOver`). Adding an alt while still signed in to the main account at EVE offers the main and the mail
  character; either, picked by mistake, is kept as its own login and nothing is added. A sender login that turns out
  to be an alt is refused, its alt's login marked refused at once. The main's and the sender's own flows are unchanged:
  the user asked for care with logins.
- **The app says when EVE has just stopped this browser's own login** (`stoppedBy` in `lib/roster.ts`, App.tsx; the
  final review, 30 September 2026). EVE stops a character's earlier logins that carry a different set of permissions,
  at its own page (eve-facts), so a cloud login that comes back as a character this browser also holds a login for,
  with another set, has killed that one. The callback keeps the granted scopes (only purpose and refresh token go to the
  Worker) and compares them as sets. Kept as the main, with this browser's main on another set: the toast adds "EVE has
  also stopped this browser's own login for X … log in again here", and the login is left for the next refresh to find,
  as before. Without it the owner was logged out minutes after adding an alt, with no reason given, when an app release
  or an optional permission had changed the set since they last logged in. Kept as the sender, with this browser's
  sender on another set: that login is dead, so it is taken out here (`logoutMailer`) and the toast says so.
- **This browser's own mail sender, picked while adding a character, is handed over as the sender** (`handOverAs`).
  With no sender in the cloud, the Worker can't know it (`sortLogin` gets no mailer) and added it as an alt: read hourly,
  counted in the wallets, and then logged out of this browser by the sender check. The toast still says what was
  asked for, and the rule above takes out the stopped browser sender. **Except a character already in `chars`**, on the
  roster or taken off it: then it's being added (back) as an alt, which is what "Add a character" asked. Sent as the
  sender, one still on the roster would be refused by the Worker, which marks that alt's working login refused. This
  is the one place `chars` rather than the live roster decides, on purpose: here a removed alt coming back is an alt.
- **The browser's sender check reads the live roster, and only a roster read in this session** (App.tsx, `rosterLive` in
  the alt store). A sender logged in to this browser that the cloud reads as an alt is logged out, which revokes it at
  EVE, with a message. It reads the roster as the cloud has it, never `chars`, which keeps characters taken off the
  roster: after removing X (the remedy the app suggests) and logging X in as the sender, a check on `chars` revoked the
  new login and said X was one of the characters the cloud reads, which was false. And it waits until the roster has
  been read from the cloud since the app opened: the copy on disk may be from before X was taken off.
- **Only the trading login reaches the trading login's slot** (`handleCallback`): the purposes `main` and none (a login
  started before purposes were kept). Any other is revoked with an error, and a `never` check fails the build when a new
  purpose isn't handled, since a purpose that fell through there would take the owner's place.
- **Alts are read hourly on a cron of their own** (`37 * * * *`, `altsHourly`) and their mining every ten minutes at the
  end of the five-minute round. Not on the `:07` cron: the full-market scan's 11-minute budget doesn't know alt reads
  ran ahead of it. Not in the five-minute round: 30 s of CPU.
- **What isn't done for an alt**: order refresh and judging, alerts, opportunity mail, the track record, share
  measuring, the Sniper's bids, asset-safety mail, killmails, the `orders` job row. An alt's first `archive` would
  otherwise mail the main about every wrap it holds.
- **Clone state is worked out, and can be unknown** (`cloneState`): Alpha when a skill is usable below its trained
  level, Omega when one is usable above Alpha's cap (`lib/alphaCaps.ts`, from CCP's `cloneGrades.jsonl`), else it can't
  be told. "Since" is kept only for a change the cloud saw.
- **The watchdog is by character**: an alt's job findings name it and carry its ID in their key, and a refused login
  quiets only its own character's job mails. It used to be "any refused login quiets them all".
- **An app version behind is shown no alt logins** (`/v1/status` lists only `main` and `mailer`): its To do turns every
  refused login it sees, other than the main's, into "log in a sender", which for an alt is the login that stops its own.
- **Removing an alt** drops its mining snapshot and job rows either way (a re-add starts from a fresh baseline with no
  old failing streak) and never its `revs` row (a revision that restarted would let a device holding the old one miss
  what follows).
- **The browser never holds an alt's login, and its copy of an alt is read-only** (`lib/altStore.ts`, the Characters
  page). "Add a character" asks EVE for a login with the purpose `cloud-alt`; `handleCallback` hands its refresh token
  on for the Worker and stores nothing (a purpose it didn't know fell through to the trading login's slot, where the
  owner check would have logged the owner out). What the cloud holds for each alt is pulled into an IndexedDB database
  of its own, `jita-ledger-alts`, only when the alt's revision has moved: one roster request a minute, not one per alt.
  The shell reads the roster alone (`useAltRoster`), and a read equal to the last keeps the same array, so the pages
  aren't drawn again at every step of a read.
- **An alt deleted and added again starts its copy afresh** (`altCopyFor` in `lib/roster.ts`, final review, 30 September
  2026). "Remove and delete" deletes an alt's rows in the cloud outright, with no removal left to pull, and keeps its
  revision; a device that missed the removal and the re-add (a phone in the background, an app closed) pulled only what
  came after its old revision and kept every row the owner had asked to delete. The Worker writes a new `alts` row, with
  a new `added_at`, on a re-add after a delete, and keeps the row and its `added_at` on one after "keep" (whose rows are
  still valid). So each copy keeps the roster's `addedAt`, and a different one, or a revision below the one held, starts
  a fresh copy, decided before a matching revision is skipped. A copy stored before `addedAt` was kept is kept, not
  pulled again, and takes the roster's at once.
- **What keeps an alt's rows out of the ledger is that the alt store can't write to it.** From `store.ts` it imports
  `mergeChars`, `dataGeneration` and `onClearAll`, never `update`; and only `App.tsx` and `Characters.tsx` import the
  alt store. The Characters page writes `chars` (a clone state set by hand) and the public type names it looks up
  (skills, hulls), nothing of an alt's. Two tests in `scripts/check.mjs` read the source and fail if either changes;
  the first reads every import clause from `./store`, so a default, namespace (`import * as S`, then `S.update`) or
  dynamic import fails it, while `import type` passes. A later page that needs alt data is added to that list on
  purpose, in the commit that makes it read it. They are tripwires: a helper module calling `update` for the alt store
  wouldn't show, which is why stage 2b starts with a test that the main's figures don't move when an alt is pulled.
- **`chars` is the one thing about an alt the main's ledger holds**: a synced document of its own, ID to name, and a
  clone state set by hand. Two things write it: the roster read (`mergeChars`, whose rule is `mergeCharsDoc` in
  `prefs.ts`: it adds and renames, never removes one, and keeps a hand-set clone through a rename) and the Characters
  page's Alpha/Omega buttons. An imported backup without it leaves the present one. Not a field of `prefs`:
  `sanitizePrefs` would drop it on an older version's save.
- **The roster's merge into `chars` is applied as a change from the cloud and never pushed** (`update(…, { origin:
  'cloud' })`). Pushed on every roster read, a device whose ledger hadn't caught up with the cloud's (a new one before
  its first sync, one just wiped) would have sent a list built from the roster alone over the cloud's, dropping
  characters taken off the roster and clone states set by hand. A "ledger is current" gate on the push was tried first
  and dropped: after "Delete all data" without a reload, a token refresh re-runs the cloud sync's start, which re-arms
  its state on the emptied ledger (and that state is unreliable after a wipe anyway: known-bugs), so the gate turned true
  on an empty ledger. `chars` goes up only when you edit it (a clone state), carrying every character the device knows.
- **A card never shows a zero for "not known"** (`charFacts`): an alt just added has no wallet, net-worth point or
  queue yet, and each reads "–" with why; the Training tile says "Nothing in the queue" only when the queue was read
  (`queueKnown`), else "Not read yet". An alt's net worth is its newest daily point and says its date. **An alt's wallet
  says when the cloud last read it**: the `sheet` job's `lastOk` from the roster (the wallet is read by `archive` and
  handed to the sheet in the same run), never the meta doc's `walletAt`. The cloud's sheet blanks only `walletAt`
  before comparing (`settled`), so it pushes the meta doc, with `walletAt` set to now, whenever anything else in it
  moves (a queue level finishing, LP, attributes) and not when only the time would: `walletAt` is neither when the
  balance changed nor when it was last read. (This note said "when the balance last changed" until the final review.)
  The main's wallet time is its own `walletAt`, from the browser's sync, which is when it was read. When an alt was last
  read in full comes from its jobs (`lastRead`).
- **A refused alt, or one with no login, doesn't promise reads**: its card says nothing more is read until its login is
  handed over again. One alt's failing pull is said with its name ("Reading Miner Two failed: …", `failedAlt`), apart
  from the roster's own read ("The cloud couldn't be reached just now").
- **Stage 2a is the Characters page with the roster, and ends with a real alt being read.** What each character
  earned and mined (stage 2b), Mining across characters (3) and the Wallet's total and transfers (4) follow.
- **The first real alt** (30 September 2026, 21:12 UTC): the owner added FannySchmeller (2122193260) from the Characters
  page and it came back as the alt (`POST /v1/keys`, then `/read`, then the pull, all in about 13 s; no exception). Its
  first read, about ten seconds: 36 trades, 83 journal entries, 30 orders, 164 names, stock and one net-worth point
  (1.05 B), all under its own ID; the sheet found 98 skills, 6.3 M SP and a 17-level queue, and read it as Omega from its
  skills. The next five-minute round read its mining (10 ledger rows, `alts mining {"alts":1,"read":1,"failed":0}`), none
  under the main. The main's and the sender's logins kept working and the main's alerts, orders and archive jobs stayed
  ok. The one row of the main's that names the alt is the main's own `player_donation` of 100 M to it at 15:47 UTC,
  hours before: the main's data, which stage 4 counts as a transfer.
  The owner confirmed in game that it is Omega, as the cloud read it: `cloneState` right on its first real character.
- **What each character earned and mined** (stage 2b, `lib/income.ts`, `lib/altLedger.ts`, `components/charIncome.ts`).
  The Wallet's "All income against play" became a pure function of a ledger (`activityEvents`, `incomeRows`), and an
  alt's pulled copy becomes a ledger (`altLedger`: its own trades, journal, orders, names, net worth and mining; fees
  from its own trade skills and clone state with standings 0; an unknown clone taken as Omega). The same rules then run
  on each card. **Earned** is that sum for the period; for an alt it leaves out ships it lost (its killmails aren't
  read) and what it bought for freelance jobs (its jobs aren't read, so a reward counts in full), and it's up to the
  cloud's last read of it. **Mined** is beside it, never added: the ore at the main's own valuation (the Mining tab's
  `priceOres`, now `lib/orePricing.ts`), with how many ores were priced; mining is recorded by day, so "24 hours" says
  "since yesterday". The all-characters total counts only cards whose figure is known and says how many.
- **A card says "Not read yet" until that part was read** (`altReadState`): Earned once the alt has trades or journal
  rows or its `archive` job has succeeded, Mined once it has mining rows or its `mining` job has; an alt whose login
  lacks the mining permission says so, as the main's card does. Saying "Nothing earned" for an alt whose wallet read
  never succeeded would be a zero for not known.
- **An alt's income is worked out once a revision.** `altLedger` returns the same object for the same pulled copy,
  `everyItemCalcs` and the hook's memos key on it, and the income takes a minute-rounded clock, so the minute's roster
  read and the page's ticking don't redo it. `loadTypeSets` keeps one answer per set of loyalty stores, so the main's and
  an alt's don't evict each other. Every cache the main and the alts share is keyed by object identity, so the main's
  pages can't be handed an alt's result (the final review traced each one).
- **`npm run check-income` is the proof, and runs in the deploy** (`scripts/income.mjs`, `scripts/ledgers.mjs`). It
  records the main's income figures (the Wallet's "All income" at all four periods, Results' "By activity") at a fixed
  clock with ESI's item groups stubbed, recorded before any code moved, so the move couldn't drift; checks the main's
  Characters card says the Wallet's figure; and proves isolation: with alts that trade and mine in the browser, the
  main's Wallet, Results and Positions read the same before and after the Characters page has worked out every alt's
  income (it fails if an alt's Earned never appears), and the same as with no alts, and the main's ledger (less names
  and chars) is equal as a value. What made it flaky, and the fix: the ledger compared as a JSON string (the app writes a
  document's fields in whatever order its updates land), pages read mid-render (now read once settled), and seeding
  IndexedDB while the app was open (now from a page on the same origin that isn't the app; docs/notes/gotchas.md). A
  deliberate change to the Wallet's or Results' wording means re-recording with `RECORD=1` in the same commit.
