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
  - **Each extractor shows its programme's total by CCP's formula, as the game reads it** (`data-planets="program:<pinId>"`:
    "789,314 over 1d 23h, 16,617 an hour on average"); the live read's too (`Extractor.install`). Its per hour is that average,
    the game's own "Avg. Per hour" (`perHourOf` in colony.ts; the in-game check, planets.md), and so are the colony's ISK an hour
    and To do's stake. It was ESI's figure a cycle turned into an hour, a quarter of the truth on 1-hour cycles. Before the check
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
  pins each rule (planted wrong: pushing under the ledger, no permission gate, always pushing each failed it). Still planned:
  Colonies shows the shown character's or All; To do lists each character's expiring extractors (an alt's judged on a roster
  read of this session); mail stays the main's alone.
- **A colony's real chain** (Task 15 and its fix rounds, `colonyChain`, `versusBest` in `colonyChain.ts`, pure; Task 16 draws it).
  From a kept colony and the planet's customs tax (`customsRate`'s, passed in: the document carries no security or skills):
  - **Pins**: an extractor and a factory by their shape; storage, a launchpad, a command centre and a factory with no schematic by
    ESI's type ID (`PIN_TYPES`, CCP's static data build 3569502: the bundle holds capacities, not IDs).
  - **Rates**: each extractor's whole programme on the reading `checked` names (`PI_READING` by default), the other beside it while
    unchecked; a programme that gives none (no quantity a cycle) is null with why, and then nothing is worked out, never at 0.
  - **The routes, pin by pin** (Ruling T15-3). Each factory input is decided from the routes first: it reaches (routed from a pin
    that makes it, or from storage or a launchpad such a pin routes it into), it's imported, or it doesn't (`starving` at that
    factory, which makes nothing; one flag a factory for each reason, naming its inputs). Then, a tier at a time, what a pin makes
    goes to the factories routed straight from it, up to what they take at full rate, then into the storage or launchpads it's
    routed to; a storage or launchpad supplies only what's routed into it (its contents are stock, never a rate), and what's left
    there is exported. A factory runs at its least share (fewer cycles when short); what it drew beyond its use goes back to
    storage. The first version pooled each good across the colony, so Basics drawing from a storage nothing filled read as fed.
    **The command centre is storage here** (Ruling T15-6): a route into or out of it is followed, which the first fix round's
    didn't (an extractor routed into it read as starving its Basics). A factory drawing from a holder that nothing on the planet
    routes a good into, the good also made here, "runs only on what you bring in": the chain counts it as making none, but "so it
    makes none" was false for a factory the user tops up.
  - **Imports** (Ruling T15-2): an input nothing on the planet makes, routed in from storage or a launchpad, is brought in (a
    factory planet fed from its launchpad): never starving, worked out as kept stocked (`imports`), and the planet's ISK a day is
    null, "Its … come from off the planet, and their cost isn't known here", never 0. The first version read such a planet as
    "starving, makes nothing" at 0 ISK.
  - **Valuing**: what's left of each good is an output (the surplus P1 and P0 included), sold and taxed as the planner does
    (`taxRows`; I1). A good that can't leave sells none, "isn't shipped", counted in `unshipped`, never as unpriced. ISK a day is 0
    with no why when nothing it makes leaves: Task 16 says so in words, never "0 ISK".
  - **Flags, only at the root** (Ruling T15-3): `starving` under `STARVING_BELOW` (95%) of what an input's factories take (a Basic
    losing about 2 of its 48 cycles a day; a programme's rate is its average, which falls across it), its percent floored, never
    "100%", on the lower reading saying when the higher gives enough, its words naming the factories after it that it holds back;
    never a shortfall a flag before it explains (an extractor with no programme, for its P0 or, with no product set, only the goods
    its routes carry; a maker routed nowhere; makers short of their own inputs). The first version flagged 11,950 into 12,000 and
    the good after it, "100% of the time"; the first fix round let an extractor with no product set explain every P0, hiding
    another's real shortfall. `buildingUp` for an extractor's or a running factory's product routed nowhere (a factory that
    doesn't run makes nothing to build up, and explains nothing after it), or more than the factories it's routed to take with no
    storage route, said as the route alone;
    `storageFull` at 95% of capacity, as of the colony's last update in game; `expired` and `endingSoon` as the colony panel judges
    them (`ENDING_SOON_HOURS`), the figures staying at the programme's rate; `idle` for a factory with no schematic or an extractor
    with no programme.
  - **`versusBest`** sets the planet's ISK a day against the better of `planSingle`'s P0 → P1 and P0 → P2 for that planet alone, at
    the same rates and the colony's own level (the caller plans with `ccLevel` the chain's `level`): what it pays more and on what
    ("the best P2 it can make alone here, Mechanical Parts, pays 480,000 ISK more a day"), a rate the planner only assumes said as
    that, nothing within a cent or above. **A best that doesn't fit at the colony's own level is no better**: nothing said, never a
    suggestion to train (Ruling T15-1; the fit's CPU and powergrid against that level's budget), and so is one whose fit isn't
    checked (the planet's size not known). On the formula's reading the first version told every real colony the planner's own
    layout paid more: sized to the higher rate, it didn't fit at their level. An output unpriced on either side, or no valued ISK on either, gives no gain, with why: never a gain against 0.

## Open, and left for the stage-1 final review

- **The first real colonies were kept on 18 October 2026** (the 22:35 UTC hourly read after stage 1 shipped; D1, SELECT only):
  every one inside the fit model's heads beside its factories (planets.md). That read found every factory kept as storage: ESI
  sends the schematic as the pin's own `schematic_id` (eve-planets.md), and only `factory_details` was read. Both are now; the next
  hourly read refills the document, since ties go to the read. The in-game check reads this document (planets.md).
- `readColoniesFor` now pushes under `who.char` (Task 14; the same for the main).

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Colonies hasn't been looked at on a real colony yet.** The cloud has kept the main's since 18 October 2026 (above), but the
  page case draws a seeded one, and nobody has opened the page on the real document.
- **A colony's chain is a model of its routes, not the game's router**: it follows each good pin by pin, but where the game's
  order isn't known it's chosen: a pin's product goes first to the factories routed straight from it, splits evenly over the
  storage it's routed to, and a storage's is shared among the factories routed from it by what each takes at full rate. Route
  quantities and factories' own buffers aren't read, storage routed into storage isn't followed, and a factory whose output goes
  nowhere is counted as running. The command centre is taken as storage (the game's own handling of a route through it isn't in
  these notes), and isn't judged full: its capacity isn't in the planets bundle.
- **What reaches storage, a launchpad or the command centre is counted as exported and sold**: nothing leaves until it goes through the customs office
  (from storage, a transfer to a launchpad first), so the chain's ISK a day is what the colony makes for market, not what has
  sold; a P0 surplus left in storage is counted with it.
