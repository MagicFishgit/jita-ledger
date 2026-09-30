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
- **What keeps an alt's rows out of the ledger is that the alt store can't write to it.** From `store.ts` it imports
  `mergeChars`, `dataGeneration` and `onClearAll`, never `update`; and only `App.tsx` and `Characters.tsx` import the
  alt store. The Characters page writes `chars` (a clone state set by hand) and the public type names it looks up
  (skills, hulls), nothing of an alt's. Two tests in `scripts/check.mjs` read the source and fail if either changes. A later page that needs
  alt data is added to that list on purpose, in the commit that makes it read it.
- **`chars` is the one thing about an alt the main's ledger holds**: a synced document of its own, ID to name, and a
  clone state set by hand. Only the roster read writes it (`mergeChars`), it never removes one, and an imported backup
  without it leaves the present one. Not a field of `prefs`: `sanitizePrefs` would drop it on an older version's save.
- **A card never shows a zero for "not known"** (`charFacts`): an alt just added has no wallet, net-worth point or
  queue yet, and each reads "–" with why. An alt's net worth is its newest daily point and says its date; its wallet
  time is when the balance last changed, since the cloud pushes the sheet only when something other than a timestamp
  moved. When it was last read comes from its jobs (`lastRead`).
- **Stage 2a is the Characters page with the roster, and ends with a real alt being read.** What each character
  earned and mined (stage 2b), Mining across characters (3) and the Wallet's total and transfers (4) follow.
