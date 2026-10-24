# Planets: the colonies

Decisions worth not undoing. Your colonies as the app keeps them: the synced `colonies` document, the cloud's hourly read of
the main's, and the Planets tab's Colonies section. Stage 1 keeps the main's, so the planner can learn extraction from them
(planets.md); stage 2 (Tasks 14–17) adds every character's, read by the cloud with each alt's own login. The rest of Planets is
in planets.md and planets-planner.md.

- **The `colonies` document** (`colonies.ts`, pure, the Worker imports it; Task 4): ESI's colony in the app's names, every pin
  with its install, expiry, last cycle, schematic, extractor (cycle, product, `qty`, heads) and contents, and the links and
  routes; sorted, so equal reads stringify equal. `qty` is null when ESI sends none ("often null until Submit"), never 0; an
  extractor with no heads sent (an empty list or none) is kept at 0, which the planner reads as not known (Ruling T8-1). ESI's `planet_type` is lowercase
  (`planetTypeOfEsi`: `parsePlanetType` reads only "Planet (Barren)"); one the app doesn't know is null. `mergeColonies`: the
  read decides which colonies exist (one given up drops), and a planet in both keeps the later `lastUpdate`, so an older read
  can't roll a colony back. Absent means never read. Synced (`DOC_KEYS` on both sides, newest write wins), sanitized on pull
  (`sanitizeColonies`), held back by `refusedDoc` while the Worker is a version behind, ignored by an older browser.
  `colonyOfKept` rebuilds a `Colony` from it, so the panel, To do and the alerts work from the document.
- **The browser's read writes it** (`colonyStore.readColonies`) through `update` against live state, only when the merge's JSON
  differs from what's held, and never after a wipe or a login change while it ran (Task 4's fix: `dataGeneration` and the
  logged-in character, as the alt store does).
- **The cloud keeps the main's hourly, whatever the alert settings say** (`worker/src/planets.ts`, Task 5; cloud.md). The read
  lived inside the alert round behind `cfg.ev.pi && cfg.mailEv.pi` (alerts.ts), so a ledger with PI alerts off, or no sender,
  never had its colonies kept. Now `mainColoniesHourly` runs in `fiveMinutes` before each ledger's alert round, in its own
  try/catch, when the main's login holds the planets permission and an hour has passed since the `'pi'` job last ran;
  `readColoniesFor` reads the planets and each colony, merges against D1's document and pushes only when that changed and the
  login is still kept. `alertRound`'s PI findings come from the kept document (`colonyOfKept`), never ESI, every round under
  those settings; `mailKey` and "Remind me again after" keep them from going out every round, and system names are still read
  publicly. A failing read mails "Cloud job failing" with PI alerts off too: `'pi'` is watchdog-mailed, and the read is what
  keeps the colonies (its mail says the colonies aren't kept meanwhile, so the planner doesn't learn from them). `check-worker`
  pins it: kept with PI alerts off, the same read twice writes nothing, a 500 keeps the document, a login without the permission
  reads nothing, and in one round the read then the alert round finds an ended programme from the document alone.
  - **Only the read notes `'pi'`** (the final review's M1). The alert round's catch noted `'pi'` too, which stamped its last run, so
    the hourly read (gated on it) skipped; with a failure every round the colonies stopped being kept while the watchdog mailed
    "Reading your planets" failing when the read was fine. Now that failure is logged and kept in the `'alerts'` job's detail
    (`piError`); `check-worker` throws in it and finds `'pi'` as the read left it, and the next hour's read still running.
  - **The read's job is noted at its own `now`** (`noteJob`'s optional `now`, the default `Date.now()`), the clock its hour's gate
    reads; nothing changes in production, where it is `Date.now()`. The suite's block is pinned to 14:00 UTC: on the real clock
    its "and notes the failure" failed when run from 10:55 to 11:30 UTC, EVE's downtime, when a failure isn't counted.
- **The Colonies section** (`Colonies.tsx`; Task 12, every character since Task 16, 24 October 2026): drawn from the kept documents
  alone, never a live read's prices: the main's (Read my colonies writes it, as To do, the alerts and the cloud's hourly read do) and
  each alt's the cloud keeps, which Planets.tsx passes down (the one importer of the alt store). A read is said as the last one
  (the main's has no read time: "as kept", with when EVE last updated the newest; an alt's at its `sheet` job's `lastOk`); `lastUpdate`
  is the game's, never said as a read. Goods are named from the planets bundle, never "Item #…".
  - **Show for gains All** here alone (`jita-ledger:planets-colonies-show`; picking a character picks it for Show for too), grouped by
    account. **Where each stands** (colonyTotals.ts' `coloniesWhy`): a kept document is read, a refused alt's too, said with `lostSaid`
    (read data wins); else the main's login without the permission, an alt's refused or not held, one handed over without the planets
    permission ("Hand the cloud X’s login again on the Characters page"), or "Not read yet". The alt's `colonies` comes through `altLedger`.
  - **Each colony is its chain** (planets-chain.md) at its character's own fees (a `usePlanetMarket` a character, the colony's goods
    read live) and its customs tax at its own system's security (waiting, said, until that's read). **One figure**, the chain's ISK a
    day with its week and month (Ruling F10); colony.ts' ISK an hour, its "A week of this" and the Jita-priced "Waiting to be
    collected" went, so nothing is said twice. "Makes nothing that leaves the planet" (or "Makes nothing"), never 0 ISK; "–" with why
    when not known. Opened: its extractors ("heads not said" for 0), what its factories make and bring in (kept stocked), its outputs
    (one that can't leave says "none of it leaves" and why, never sold for 0 ISK; goods valued at Jita's named with the hub's reason, F11),
    its figures with the share of one account's month of Omega, its flags, then versusBest's words whole below them ("(a flag above
    says why)"), any figure with its qualifier, never the gain alone; stored goods by units, as of EVE's last update.
  - **Its best** (`bestsFor`) is planned on the colony's own planet in its own system, never the system Plan plans (a colony elsewhere
    got "no setup"): planet ID and type from the document, radius from planetRadii.json, at Plan's rates (every character's learned
    rates, its system's typed ones, `rateFor`'s fallbacks), heads and programme length; a colony at a time in tasks of their own (3 to
    12 ms each), not on the minute's clock.
  - **Totals** (colonyTotals.ts): a character's colonies summed, and All over the characters read ("3 of 5 characters read"); a
    colony not valued, or still worked out, leaves its character's and All's "–" with how many and why, never a part-sum (research.md's
    six-agents lesson); All's Omega share is against the months of the accounts of the characters it adds up that have a colony
    (`accountCount`, one not set as its own), said. The page case's Task 16 block pins each state; check.mjs the sums.
  - **Each extractor shows its programme's total by CCP's formula, as the game reads it** (`data-planets="program:<pinId>"`:
    "789,314 over 1d 23h, 16,617 an hour on average"); the live read's too (`Extractor.install`). Its per hour is that average,
    the game's own "Avg. Per hour" (`perHourOf` in colony.ts; the in-game check, planets.md), and so is To do's stake. It was ESI's figure a cycle turned into an hour, a quarter of the truth on 1-hour cycles. Before the check
    it gave both totals, "not yet checked against the game's total".
  - **On a phone** an opened colony's detail wraps (`.col-unfold`), pinned within the table's visible width, and the extractor
    cards take the row's width; `check-phone` lets a box that scrolls sideways be, so the page case checks each total's right
    edge against its `.tbl-scroll` box (the crash's leftover rule, planted back, put both 31 px past).
  - **From 641 to 1,099 px** (Ruling T12-3, the final fix round) the same, sized beside the rail as it is: `calc(100vw -
    var(--rail-w) - 184px)`, 166 px of the content's, the panel's and the cell's padding measured at 800 px with either rail,
    and 18 for a desktop scrollbar on the content (headless Chromium hides scrollbars, so the check can't see one). The phone's
    width (for its 56 px rail) would still run past with the rail open: before, the cards ran 179 and 147 px past at 800 with the
    rail shut (72 px, as it starts there), 309 and 277 open (236). The page case measures every card and total at 800 px both ways.
- **The cloud reads every alt's colonies** (Task 14, `colonyDocFor` in worker/src/planets.ts, called by `readSheet`): in the hourly
  sheet, only when the alt's login holds the planets permission, merged against the alt's kept document and pushed with the sheet's
  other documents only when it changed, under the alt, never the main. A failed read keeps what is held and doesn't fail the sheet;
  nothing is written for an alt removed mid-read; the `sheet` job's `lastOk` dates it (no new watched job). The browser needed no
  change: the alt store keeps every document it pulls, and Planets reads `docs.colonies` through `sanitizeColonies`. `check-worker`
  pins each rule (planted wrong: pushing under the ledger, no permission gate, always pushing each failed it). Colonies shows
  them since Task 16 (above). To do lists each character's expiring extractors (Task 17, orders-alerts-todo.md); mail stays the main's alone.
- **A colony's real chain** (Task 15 and Task 15b, `colonyChain`, `versusBest`; Task 16 draws it): in planets-chain.md, with its
  Limits.

## Open, and left for the stage-1 final review

- **The first real colonies were kept on 18 October 2026** (the 22:35 UTC hourly read after stage 1 shipped; D1, SELECT only):
  every one inside the fit model's heads beside its factories (planets.md). That read found every factory kept as storage: ESI
  sends the schematic as the pin's own `schematic_id` (eve-planets.md), and only `factory_details` was read. Both are now; the next
  hourly read refills the document, since ties go to the read. The in-game check reads this document (planets.md).
- `readColoniesFor` now pushes under `who.char` (Task 14; the same for the main).

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Colonies has been looked at on the real colonies only locally** (Task 16, 24 October 2026: the main's five kept documents of 18
  October, seeded into a scratch browser on the page case's prices, not committed): I, IV and VI said nothing against their best,
  III its routing fault, VII another product with its qualifier, every programme ended and counted at the rate it ran. Nobody has
  opened the live page on them at today's prices.
