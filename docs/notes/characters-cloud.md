---
paths:
  - "worker/src/{alts,sheet,eve,archive,mining,index,watchdog,market}.ts"
  - "src/lib/{roster,alphaCaps,auth}.ts"
  - "src/App.tsx"
  - "src/components/Characters.tsx"
  - "scripts/{d1,check-worker,alpha-caps}.mjs"
---

# Several characters: the cloud and the logins

Decisions worth not undoing. How the cloud reads alts and keeps them apart, and how a login that comes back from EVE is
sorted out. Split from characters.md on 1 October 2026, which keeps the principle (an alt feeds the one ledger and never
logs in to the app) and the browser's side.

- **The roster is the `alts` table, the login a `keys` row `(the main, 'alt:<id>')`**, or the sender's for an alt that is the
  sender (below) (migration 0016, `worker/src/alts.ts`).
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
  character: the main, picked by mistake, is kept as the main's login and nothing is added; the sender is kept as the
  sender and added (below). A sender login with only the mail permissions that turns out to be an alt is refused, its
  alt's login marked refused at once. The main's own flow is unchanged: the user asked for care with logins.
- **The app says when EVE has just stopped this browser's own login** (`stoppedBy` in `lib/roster.ts`, App.tsx; the
  final review, 30 September 2026). EVE stops a character's earlier logins that carry a different set of permissions,
  at its own page (eve-facts), so a cloud login that comes back as a character this browser also holds a login for,
  with another set, has killed that one. The callback keeps the granted scopes (only purpose and refresh token go to the
  Worker) and compares them as sets. Kept as the main, with this browser's main on another set: the toast adds "EVE has
  also stopped this browser's own login for X … log in again here", and the login is left for the next refresh to find,
  as before. Without it the owner was logged out minutes after adding an alt, with no reason given, when an app release
  or an optional permission had changed the set since they last logged in. Kept as the sender, with this browser's
  sender on another set: that login is dead, so it is taken out here and the toast says so (`forgetMailer` since 19
  October 2026, not revoked: the cloud now holds that character's login).
- **This browser's own mail sender, picked while adding a character, is handed over as the sender** (`handOverAs`), with
  `adding: true`. With no sender in the cloud, the Worker can't know it (`sortLogin` gets no mailer). Only while the cloud
  has no sender or it is this character (read fresh at the callback): with another, it goes as an alt, keeping the cloud's
  sender (the review, 19 October 2026: a stale browser sender replaced it); its browser login, which EVE stopped, is taken
  out here (`forgetMailer`), or the sender check would revoke it once the roster lists the character. It went as an alt when already in `chars`,
  because the Worker refused a sender on the roster; it keeps one now, so that exception went, and the rule above takes
  out the stopped browser sender.
- **The browser's sender check reads the live roster, and only a roster read in this session** (App.tsx, `rosterLive` in
  the alt store). A sender logged in to this browser that the cloud reads as an alt is logged out, which revokes it at
  EVE, with a message. It reads the roster as the cloud has it, never `chars`, which keeps characters taken off the
  roster: after removing X (the remedy the app suggests) and logging X in as the sender, a check on `chars` revoked the
  new login and said X was one of the characters the cloud reads, which was false. And it waits until the roster has
  been read from the cloud since the app opened: the copy on disk may be from before X was taken off. When the cloud's
  sender is X (the roster entry's `sender`), X is taken out here without a revoke (`forgetMailer`) and the toast says the
  cloud sends the mail from it and reads it, so this browser needs no login of its own for it.
- **The mail sender can be one of your characters** (19 October 2026; the user added Messenger from God on Characters to
  start planetary industry on it, and the app refused it). EVE allows a character one set of permissions and refresh tokens
  rotate, so **one login does both**: the cloud reads it with the sender's row (`altLogin`: its own `alt:` row when kept,
  else `'mailer'` when that row's `token_char_id` is the alt; `senderReader`). `readerLogin` admits `'mailer'` for an alt
  and still refuses a login that isn't the character written for; `stillKept` for it needs it still the sender and on the
  roster. `altReaders`, `altsStatus` (its login state is the sender's, and `sender: true`), the structure search, the home
  markets and `/v1/alts/<id>/read` all take the same rule. `check-worker` pins each, the main's rows untouched.
  - **It joins only when added** (`sortLogin`'s `reads`, `adding`): a sender login carrying more than the two mail
    permissions (`readsAsAlt`) from Characters (`adding`, or asked as an alt) goes on the roster, or stays on it;
    "Let the cloud send alert mail" never adds one. The app always sends `adding`; an app version behind sends none and the
    scopes say it, since its plain sender hand-overs ask only the mail permissions and only its alt-add asks more.
  - **Only the mail permissions**: added from Characters, kept as the sender, not added, and said (`notAdded:
    'mailOnly'`); for a roster alt, refused as before, marking its own login and, if it is the sender, the sender's.
  - **A roster alt handed over as the sender with the full set** is accepted and stays on the roster: its `alt:` row is
    deleted in the same batch as the sender's, after the refresh proved the new login, and **never revoked** (not needed,
    and what a revoke does to the character's other logins isn't known).
  - **Removing it** stops the reads and never touches the sender's login. **A new sender later** leaves the old one on the
    roster with no login; handed over on Characters, it gets an `alt:` row. Settings' Stop drops the sender's login, so
    its reads stop too (the confirm says so).
  - **A refused sender row** reads as that alt refused; the watchdog has one refusal (the sender's, which can't be mailed)
    and quiets that alt's login-looking job mails. To do lists one item, by key, saying its reads stop too: the roster (read
    every minute) shows it before the status (every ten), so the sender's item is built from the roster's entry until the
    status catches up, the roster's own item is skipped on its `sender` flag, and one remembered from before goes.
  - **Watch stopped** (no main's login): the cloud still reads the sender-alt with its login but sends no mail. Settings →
    Alerts never offers a browser sender login for it (the sender's two would stop the cloud's), and the sender check
    says the cloud sends the mail only when it does (`cloudSendsMail`).
  - **Version skew, for a deploy's minutes.** A new app on an old Worker sends a browser sender that is on the roster as
    the sender; the old Worker refuses it, marks the alt's working `alt:` row refused and revokes the new login (its effect
    on the character's other logins unknown). It heals at the next refresh, within about 20 minutes; home markets skip that
    reader meanwhile. An old app on the new Worker says "Nothing was added" for a sender the Worker added, revokes a browser
    sender EVE already stopped, and its mail-only Settings hand-over of a sender-alt is refused and revoked.
  - **Handed over again from Settings or To do** it asks the full set while `/v1/status` marks the sender's key `alt` (on
    the roster: `senderAsksAll`), else the two mail permissions. No new permission anywhere.
  - On 19 October 2026 the cloud's sender row was Messenger from God with the full set (handed over when the add was
    refused), so adding it again on Characters needs no new login permission.
- **Only the trading login reaches the trading login's slot** (`handleCallback`): the purposes `main` and none (a login
  started before purposes were kept). Any other is revoked with an error, and a `never` check fails the build when a new
  purpose isn't handled, since a purpose that fell through there would take the owner's place.
- **Alts are read hourly on a cron of their own** (`37 * * * *`, `altsHourly`) and their mining every ten minutes at the
  end of the five-minute round. Not on the `:07` cron: the full-market scan's 11-minute budget doesn't know alt reads
  ran ahead of it. Not in the five-minute round: 30 s of CPU.
- Since Industry stage 2 (11 October 2026) the sheet also reads an alt's blueprints (the `blueprints` doc) and industry jobs (`jobs` records,
  `meta.jobsRead`) and, since Planets Task 14, its colonies (the `colonies` doc, merged), each only with its permission; the archive reads only the main's jobs, so the `sheet` job's `lastOk` dates every one of an
  alt's industry reads. The archive hands the sheet the alt's asset item IDs, which tell its containers and ships from structures.
- **What isn't done for an alt**: order refresh and judging, alerts, opportunity mail, the track record, share
  measuring, the Sniper's bids, asset-safety mail, killmails, the `orders` job row. An alt's first `archive` would
  otherwise mail the main about every wrap it holds.
- **An alt's login now also serves two requests of the owner's** (Industry stage 4): a structure search when a site or home market is
  added as that alt (`POST /v1/structures/search`), and the hourly read of a home market the alt is the reader of (`home_books`, keyed by
  structure, never under the alt or the main).
- **Clone state is worked out, and can be unknown** (`cloneState`): Alpha when a skill is usable below its trained
  level, Omega when one is usable above Alpha's cap (`lib/alphaCaps.ts`, from CCP's `cloneGrades.jsonl`), else it can't
  be told. "Since" is kept only for a change the cloud saw.
- **And it is an account's, never set by hand** (`accountClones` in accounts.ts, 20 October 2026; the user: "i don't want to
  manually set alpha or omega we can already pick this up from the API"). An account is Omega when a character on it reads
  Omega, Alpha when one reads Alpha, and when they disagree the newest reading (the main's at its `lastSync`, an alt's at its
  `sheet` job's `lastOk`), said on its head as "reads disagree"; else not known. A character whose own skills can't tell takes
  its account's ("Omega, from its account"); its own reading always wins for itself; a state set by hand earlier
  (`chars[id].clone`, the removed buttons') only when nothing is read for it or its account. One rule for `useIndustryChars`,
  `useResearchChars`, `useMiningFleet` and the Characters page: an alt's ledger is built at it (altLedger's fallback, so its pilot
  and fees follow), `clone` carries it (so `planCharOf`: a new PI alt on an Omega account isn't "clone state not read"), and the
  main's pilot takes its account's only when its own skills can't tell. The Wallet's alt ledgers (net worth only) don't need it.
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
