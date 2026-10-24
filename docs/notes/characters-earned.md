# Several characters: the Characters page, accounts and what each earned

Split from characters.md on 24 October 2026 (the notes budget: Todo.tsx loaded 139,125 of 140,000), every fact kept. Decisions worth not undoing. Which account each character is on, the Characters page's cards (not known is never a zero), what each character earned and mined, `check-income`, and the limits of these. How alts are kept apart and transfers are in characters.md.

- **Which account each character is on is set by hand, once per character** (`accounts.ts`, the synced `accounts` doc, 20
  October 2026; ESI has no notion of an account). The user: "on the characters page I need to be able to group them. This might
  be important for PI", and "imagine trying to make sense of 20 characters in the future and knowing which account each belongs
  to when i switch to them". Cards sit under "Which account?" (a new character lands there; the add flow is untouched), then
  each account, the main's first, with its name, "N of 3 characters" and its clone state (characters-cloud.md). A card's small
  control moves it; **a fourth is refused, saying why**, counted over the characters on the page. Names "Main account", then
  "Account 2"… in the order made, or typed; an emptied account stays until removed, so no default name moves. Groups are
  sections, never panels (check-income finds the main's card as the first panel with a pilot); nothing writes the doc without
  a click. Every Show for picker lists characters by account (`byAccount`, `Seg`'s `group`), labelled only with two or more.
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
- **Earned counts what a character built and sold as Industry** (Industry stage 2, Task 13; positions-results-wallet.md): its own
  delivered jobs against its own sales, an alt's from its pulled copy, the materials at its own purchases. While the blueprints
  load the card says "Reading the blueprints, to cost what you built…"; if they couldn't be loaded, "In the last 7 days, without
  what was built" (its tip says so), and the card adds nothing to Earned, all characters, whose count says how many did.
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

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **The income recording compares figures as the pages show them** ("−41.48 B ISK"), so a drift under about half a
  percent of a row wouldn't show there; the exact sums are pinned by the hand-worked tests in `scripts/check.mjs`.
- **An alt's Earned leaves out ships it lost and what it bought for freelance jobs**, since the cloud reads neither for
  an alt, and it's as of the cloud's last read of it. Its card's tip says so.
- **A courier contract between two of your characters isn't a transfer**: the hauler's reward names the Secure Commerce
  Commission (eve-facts), so it's Hauling income, which the Characters page's Earned for all characters counts, and the
  issuer's side is a running cost ("Couriers & contract fees") unless it names both characters (not yet seen).
- **Contract and direct-trade transfers between your characters rest on the both-parties rule alone**: no real
  `contract_price` or `player_trading` entry between two characters has been seen.
- **A character taken off the roster stays yours for good** (`chars` keeps it, so past transfers stay transfers). One
  sold to another player keeps reading as yours: their ISK to you is "Between your characters", not money in, and the
  unusual-activity list never calls them a new donor.
