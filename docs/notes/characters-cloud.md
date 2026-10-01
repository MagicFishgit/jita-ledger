# Several characters: the cloud and the logins

Decisions worth not undoing. How the cloud reads alts and keeps them apart, and how a login that comes back from EVE is
sorted out. Split from characters.md on 1 October 2026, which keeps the principle (an alt feeds the one ledger and never
logs in to the app) and the browser's side.

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
- **The first real alt** (30 September 2026, 21:12 UTC): the owner added FannySchmeller (2122193260) from the Characters
  page and it came back as the alt (`POST /v1/keys`, then `/read`, then the pull, all in about 13 s; no exception). Its
  first read, about ten seconds: 36 trades, 83 journal entries, 30 orders, 164 names, stock and one net-worth point
  (1.05 B), all under its own ID; the sheet found 98 skills, 6.3 M SP and a 17-level queue, and read it as Omega from its
  skills. The next five-minute round read its mining (10 ledger rows, `alts mining {"alts":1,"read":1,"failed":0}`), none
  under the main. The main's and the sender's logins kept working and the main's alerts, orders and archive jobs stayed
  ok. The one row of the main's that names the alt is the main's own `player_donation` of 100 M to it at 15:47 UTC,
  hours before: the main's data, which stage 4 counts as a transfer.
  The owner confirmed in game that it is Omega, as the cloud read it: `cloneState` right on its first real character.
