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
- **Stage 1 is the cloud side only, and ships dark**: no page can add an alt until stage 2. The browser (the Characters page, the alt store), Mining across
  characters and the Wallet's transfers are stages 2 to 4 of the spec.
