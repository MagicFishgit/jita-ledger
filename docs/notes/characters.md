# Several characters

Decisions worth not undoing. How alts (characters on the owner's other accounts) are kept apart from the main, on the
browser's side: the alt store, the Characters page, what each character earned, transfers. The cloud's side and the
logins are in characters-cloud.md, mining across characters in mining.md (split on 1 October 2026).

- **An alt feeds the one ledger and never logs in to the app** (decided with the user, 30 September 2026; the design
  is `docs/superpowers/specs/2026-09-30-multi-character-design.md`). Their accounts: the main account holds the trading
  character and a second one used only to send alert mail; each alt account has one character for now and may grow
  into industry and planets. Their one fear was information getting jumbled, so the separation is structural: an alt's
  login is handed to the cloud once, everything read for it is filed under its own character ID, and the main's ledger
  holds no row of an alt's.
- **The browser never holds an alt's login, and its copy of an alt is read-only** (`lib/altStore.ts`, the Characters
  page). "Add a character" asks EVE for a login with the purpose `cloud-alt`; `handleCallback` hands its refresh token
  on for the Worker and stores nothing (a purpose it didn't know fell through to the trading login's slot, where the
  owner check would have logged the owner out). What the cloud holds for each alt is pulled into an IndexedDB database
  of its own, `jita-ledger-alts`, only when the alt's revision has moved: one roster request a minute, not one per alt.
  The shell reads the roster alone (`useAltRoster`), and a read equal to the last keeps the same array, so the pages
  aren't drawn again at every step of a read. The Wallet and To do read only the fields they use (`useAltCopies`,
  `useRosterAt`, `useRosterLive`), and a read that pulls nothing keeps the copies' object.
- **An alt deleted and added again starts its copy afresh** (`altCopyFor` in `lib/roster.ts`, final review, 30 September
  2026). "Remove and delete" deletes an alt's rows in the cloud outright, with no removal left to pull, and keeps its
  revision; a device that missed the removal and the re-add (a phone in the background, an app closed) pulled only what
  came after its old revision and kept every row the owner had asked to delete. The Worker writes a new `alts` row, with
  a new `added_at`, on a re-add after a delete, and keeps the row and its `added_at` on one after "keep" (whose rows are
  still valid). So each copy keeps the roster's `addedAt`, and a different one, or a revision below the one held, starts
  a fresh copy, decided before a matching revision is skipped. A copy stored before `addedAt` was kept is kept, not
  pulled again, and takes the roster's at once.
- **What keeps an alt's rows out of the ledger is that the alt store can't write to it.** From `store.ts` it imports
  `mergeChars`, `dataGeneration` and `onClearAll`, never `update`; and only `App.tsx`, `Characters.tsx`, `hustles/Mining.tsx`, `hustles/Research.tsx`, `Todo.tsx` and `Wallet.tsx` import the
  alt store (To do joined in stage 4 to list an alt whose cloud login is refused or missing, one item per alt keyed
  `cloudLogin:alt:<id>`, whose button opens the Characters page and never hands over the main's or the sender's login; it
  ticks off only on a roster read of this session newer than the one that showed it (`judgeAltLogin`), working again or no
  longer listed. Settings reads `chars` instead, for "Delete all data" saying the alts' copy here goes too: no new importer. Mining joined in stage 3: it shows each character's mining; it calls `useAlts()` and hands the value to
  `useMiningFleet` in `miningFleet.ts`, which doesn't import the store itself. The Research tab joined with its stage 1
  (3 October 2026) for its "Show for": the same way, `useAlts()` handed to `useResearchChars` in `researchChars.ts`, which
  reads each alt's skills, standings and sales tax from its pulled copy and writes nothing. To do and the Wallet hand
  `useResearchChars` their own `useAltCopies()` and roster the same way since the research cash-in (3 October 2026: To do's
  item per agent past an amount, the Wallet's research card, research.md): no new importer. The Wallet joined in stage 4 for its
  "All characters" line beside the net worth: the main's total plus each alt's newest daily point, shown on the page
  inside `data-alts` and never added to `nwParts`, `nwTotal` or what the Wallet saves to `netWorth`; `check-income`'s
  isolation check leaves `[data-alts]` out of the Wallet's text and still compares the ledger. Its tip gives each alt's
  last read (`lastRead`): ISK sent to an alt leaves the main's total at once and reaches the alt's point at the cloud's
  next hourly read, which rewrites the day's point when it moves 0.5%, so the line can dip for up to an hour. The
  Characters page's All net worth adds the main's last saved point instead, so the two can differ; both tips say so). The Characters page writes `chars` (a clone state set by hand) and the public type names it looks up
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
- **ISK moved between two of your characters is a transfer** (stage 4: `ownTransfer` and `ownIds` in `lib/roster.ts`, the
  optional `mine` on `categoryOf`, `describeRef`, `flows`, `unusual` and `attribute`; without it each answers as before).
  Yours are the main and every character in `chars`, removed ones too, so past transfers stay transfers (limits.md: a
  sold one stays yours). A donation, direct trade or contract counts only when it names two *distinct* parties, both
  yours: CCP writes some of a character's own entries (`market_escrow` among them) with it on both sides, which a set of
  the main alone would otherwise make transfers. Only donations are known to name both (eve-facts). The Wallet shows them once, as "Between your characters", and nothing it sums counts them
  (positions-results). A Characters card's set is the same family, for an alt plus itself, so a contract between two of
  yours would read the same on every card.
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
  earned and mined (stage 2b) and Mining across characters (stage 3) came next, then the Wallet's total, transfers and
  To do (4).
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
