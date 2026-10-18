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
- **The Colonies section** (`Colonies.tsx`, Task 12): with no read in memory, the main's kept document, saying it is as of the
  last read (this browser's or the cloud's hourly one) and when EVE last updated the newest: the document has no read time,
  and `lastUpdate` is the game's, never said as a read. No prices come with it: "–" and "not priced", never 0. Goods are named
  from the planets bundle, never "Item #…". Without the planets permission but with a kept document, the permission notice
  shows above the kept colonies.
  - **Each extractor shows its programme's total both ways** (`data-planets="program:<pinId>"`: "789,314 by CCP's formula,
    661,675 as 6,965 × 95 cycles: not yet checked against the game's total"); the live read's too (`Extractor.install`). Its
    per-hour figure is ESI's figure a cycle turned into an hour, "unconfirmed on cycles over 15 minutes" (eve-planets.md), no
    longer "the top of the range". With `PI_READING` set it says which reading the game uses.
  - **On a phone** an opened colony's detail wraps (`.col-unfold`), pinned within the table's visible width, and the extractor
    cards take the row's width; `check-phone` lets a box that scrolls sideways be, so the page case checks each total's right
    edge against its `.tbl-scroll` box (the crash's leftover rule, planted back, put both 31 px past).
  - **From 641 to 1,099 px** (Ruling T12-3, the final fix round) the same, sized beside the rail as it is: `calc(100vw -
    var(--rail-w) - 184px)`, 166 px of the content's, the panel's and the cell's padding measured at 800 px with either rail,
    and 18 for a desktop scrollbar on the content (headless Chromium hides scrollbars, so the check can't see one). The phone's
    width (for its 56 px rail) would still run past with the rail open: before, the cards ran 179 and 147 px past at 800 with the
    rail shut (72 px, as it starts there), 309 and 277 open (236). The page case measures every card and total at 800 px both ways.
- **Stage 2** (planned): the cloud reads every alt's colonies with its own login in the hourly alt read, filed under the alt;
  Colonies shows the shown character's or All; To do lists each character's expiring extractors (an alt's judged on a roster
  read of this session); mail stays the main's alone.

## Open, and left for the stage-1 final review

- **No real colony has been drawn yet**: the first hourly read after the ship is the first look, and its kept
  document is what the in-game check reads (planets.md).
- `readColoniesFor` pushes under `who.ledger`, which is right for the main; Task 14 must push an alt's under `who.char`.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **No real colony has been drawn yet.** Colonies draws the main's kept `colonies` document, which the cloud keeps hourly, and the
  page case draws a seeded one; nothing of Planets has shipped, so the first real look is after the first hourly read
  following the ship (planets.md).
