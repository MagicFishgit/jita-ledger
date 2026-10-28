---
paths:
  - "src/lib/{planKeep,piLearn,planetsDoc,piPlan}.ts"
  - "src/components/hustles/{planetsPlanning.ts,PlanetsPlan.tsx}"
---

# Planets: a plan kept, and rates that outlast a colony

Decisions worth not undoing. Planner fix 2 (24 October 2026): Keep this plan, the learned rates' record, and Plan it's rows drawn from
the live pass once. The user: "it would say one planet setup and configuratiion and then if you wait a bit later it completely changes
planets and recipies even putting in a temperate planet and then later changing again. this caused me a lot of setup and redo work";
they build over hours and switch Show for between their characters while planning. The investigation
(`.superpowers/sdd/2026-10-17-planets/planner-bugs-report.md`, Bug 2) drew six layouts and 23 changes in 200 s in a browser, from six
causes; fix 1's units objective took the pace out of the held search (planets.md), this takes out the rest. The rest of Planets is in
planets.md, the ranking in planets-planner.md.

The rest of Planets is in `docs/notes/planets.md`, the ranking in `docs/notes/planets-planner.md`: Read them before changing what
a kept plan rests on.

- **Keep this plan** (`planKeep.ts`, pure: `keptOf`, `keptPlanetsOf`, `layoutKey`, `basisOf`, `newerThan`, `changedSince`; piPlan's
  `planKept`, `keptFed`, `keptSingle`, `keptPlanOf`; `KeptPlanBlock` in PlanetsPlan.tsx; the `planets` doc's `systems[<system>].kept[<good>]`).
  - **What it keeps**: the kind (P0 → P1, P0 → P2, a fed factory or a chain; bought isn't kept: it extracts nothing), each planet with
    whose it is, each extractor's P0, heads and Basics, the factories beyond the Basics, when it was kept and the good's units a day then,
    and what it rested on (`KeptBasis`: the character shown, their planets and level, the programme length, every P0's rate and its source
    on the system's planet types). Per system and good, never per character: the user repeats the setup on each character, so shown for
    another it's worked out at that character's level, said when it takes more planets than they have ("It takes 5 planets: Willi has 4").
    A chain's colonies stay with the characters they were kept for.
  - **What Plan shows**: the kept plan worked out on today's inputs (`planKept`), its planets and what each runs as kept. The flows follow
    today's rates within the kept factories: a Basic short of P0 runs fewer cycles, more P0 than its Basics take is left over and said ("5
    Basics, as kept: they take …"), the factory makes no more than its kept factories can (`keptCap`, `FedCtx.fixed`; "its factories, as
    kept, make 72 …; its planets ship enough for 100"). A feeder the factory no longer draws from stays, said as an extra. A rate measured
    at other heads than kept is said, never scaled. Today's ranking folds under it ("Every setup worked out today"), so nothing that moves
    sits in view.
  - **On the inputs it was kept on it is the planner's own, to the ISK** (check.mjs: a feed on round rates, a feed on the steps case's
    rates, a chain of two characters, P0 → P2 and P0 → P1). A borrowed rate whose heads leave no room is set aside as the planner sets it
    aside (Ruling T15b-12), at the fit the planner uses: the planet's own size for a single planet, its class's largest for a feeder. The
    first version didn't, and the page case's kept feed read a 2-head Aqueous Liquids line at another P0's 16,617 an hour where the planner
    had assumed 12,000: caught by looking, then pinned.
  - **A newer layout is offered beside it, never put in its place** (`newerThan`, `KEEP_MARGIN` 5%): only when today's best (bought aside) is
    another layout (`layoutKey`) making at least 5% more of the good a day per character than the kept plan does today, or the kept plan
    makes none; with what changed since it was kept (`changedSince`: the character shown, their planets and level, the programme length,
    rates learned now, typed or moved over 5% by planet type, or by P0 when one moved on many types) and **Use the new one**. A pin, not a
    margin alone: the user builds while rates move, and a margin alone switches silently once crossed. **Forget this plan** lets it go;
    any row of today's ranking can be kept instead. Past 20 kept plans in a system the oldest by when it was kept goes, never the one
    just kept (`MAX_KEPT_PLANS`; fix round 1: the first version dropped whatever came last in the document, the newest among them).
  - **The page case** keeps the held feed, then pulls colonies through the store as the cloud brings them (every line's P0 learned above the
    12,000 its rows assumed, Barren's fourfold; then every colony torn down): the kept layout (`data-layout`) never moves, and the newer one
    is offered both times (100 a day against the kept 72, 38% more) saying the rates are learned now. Planted with the kept feed replanned
    by the search, both pulls failed it.
- **The learned rates' record** (`recordOf`, `withRecorded` in piLearn.ts; the `planets` doc's top-level `learned`, by planet type and P0:
  rate, higher, programme hours, heads, extractors, systems, `at`). Cause 1: the rates followed the colonies being rebuilt to the plan; a
  colony torn down left the document (`mergeColonies`) and its rate the planner, and the plan moved. Every read through `useLearned` (Plan,
  the Chart, Colonies) writes what the colonies show into the record when it changed, stamped then; nothing is dropped. `rateFor`'s order,
  a rate shown now before the record at each step: learned now, typed, recorded ("learned before, last on 24 Oct: no colony of yours shows
  it now"), the same P0 on another type, another P0. Typed before the record, so a torn-down planet's rate can be typed over (the Inputs panel
  offers a box for it; none for a rate learned now). Written only once the alt store has loaded (`alts.ready`), or the main's colonies alone
  would be recorded over every character's and back a moment later; and only once this visit's first cloud pull has landed
  (`CloudStatus.pulled`, `useCloudPulled`; at once with the sync off: fix round 1, Ruling FX2-2), as `releaseOrphanLeave` waits. It is the
  app's own write into a newest-wins document, the first one with no user behind it, so a device opened on a copy from before another
  device's Keep this plan would otherwise push that copy, the plan missing, over it. The page case holds the first pull until the plan has
  drawn and finds nothing recorded meanwhile (planted without the wait, it failed). At most 40 P0s a planet type (`MAX_RECORDED_P0S`).
  The planner keys on the rates, the system's planets and the typed rates by value (`useStable`), so a write to the `planets` doc (the
  record, a plan kept) works nothing out again.
  - **The record also feeds the default programme length and the assumed heads** (`ownHours`, `assumedHeads`, over every rate the planner
    reads), on purpose (fix round 1's M4, Ruling FX2-3): a rebuild no longer moves the median of your programmes or of your heads, which moved
    every unrated line's heads and every row's resets with it. So a programme length or a head count from a colony long gone still counts
    in them until a newer read of that type and P0 replaces its entry.
- **Plan it's rows are the live pass's alone** (planetsPlanning.ts; `useLiveRead`, `useHomeHistoryRead`, `PlanetMarket.settled`). Cause 2:
  the morning pass was drawn as the answer, then the live one (104 a day, then 23, on one visit). The morning pass now only names the goods
  to read; the rows say "Working it out…" until every live read (Jita's books, and with a hub its region's history) has come back or failed,
  then the live pass is drawn once, never batch by batch, the last kept (as being worked out again) while another is. A morning pass naming
  no goods (every setup blocked) is the answer as it is. The page case answers Tenerifis' history 2.5 s late and polls the held feed's layout
  every 250 ms from its first draw: one layout, first drawn after Gel-Matrix Biopaste's history was in (planted with the morning pass drawn,
  it failed). Every product's ranking is as before.
  - **Bounded at 45 s** (`LIVE_READ_BOUND_MS`; fix round 1's M7): neither `esi()` nor the cloud's reads set a timeout, and a read that hangs
    without failing would have held "Working it out…" for good. Past the bound the rows are worked out on what came in, saying how many reads
    hadn't ("… so these are worked out on what had: those goods are on this morning's books"), and worked out again when they land.
- **The rows stay while the morning's market is read again, not for a lasting reason** (Ruling F27-2, `usePlanned`'s `keep`, `PlanetMarket.pending`;
  team-p1). Keeping the last rows whenever the input was null (so nothing folds on a refresh) also kept them when it was null for good: a scan emptied
  in this browser left rows priced on it, "Working them out again…" over them for ever (Show for on a character whose skills aren't read hides the rows
  through `blockedWhy` anyway, so the page case can't use it). `usePlanning`'s `lastO` fallback is gated the same way. `pending` is
  true only while the market scan, the cloud's home-markets list or the hub's prices are being read; otherwise the rows go and the reason
  shows. A hub whose read fails leaves the market ready, so that isn't a case. The page case's fold test empties the scan with rows drawn
  and asserts none, the reason and no "Working them out again", then restores it (planted with keep always, 6 rows stayed and it failed); the refresh events still keep every fold.
- **Causes 3 and 4** (the hub region's history emptied on a change of goods; the hub's own read ageing out with the page open) are fixed
  where they live: industry-home.md.

- **Under the four steps' what-if** (planets-flow.md, fix round 1) a kept plan is worked out at the characters' skills as they are, with every
  character, never at V, said on its block; no newer layout is offered while the what-if is on.

- **The record also holds each planet's own rates** (`planetLearned`, `recordOwnOf`, `withRecordedOwn`): by planet ID and P0 with their
  factor and when last learned, so a torn-down colony's planet keeps it. Sanitized like the type record, capped (`MAX_RECORDED_PLANETS`,
  `MAX_RECORDED_PLANET_P0S`); a kept plan's basis carries them (`KeptBasis.planetRates`).

## Limits

State these rather than letting them be discovered.

- **Kept plans and the record (the planets' own rates among them) ride the synced `planets` doc, and an older build's save drops both** (`sanitizePlanets` keeps only the
  fields it knows): a kept plan comes back forgotten and the record empty until kept again. Browsers reload to a new version within minutes.
- **A planet's own rate is a per-head factor, approximate**: per-head yield isn't linear in heads (placement, overlap), and the factor is
  worked out from the colonies kept now, so a torn-down twin leaves it as last recorded. A typed rate is overridden on a planet with its own
  reading. A plan kept before planet rates says nothing of them in what changed.
- **The record learns only while a Planets section is open with every character's copy loaded**: a colony built and torn down between two
  visits never taught it, and the cloud's hourly reads don't write it.
- **A kept plan's factories cap it**: a rate rise past what its Basics and factories take reads as P0 left over and a newer layout offered
  past 5%, never more of the good on its own.
- **The margin is on units per character**: a newer layout under 5% more isn't offered, whatever it pays in ISK.
- **What changed is the basis kept against today's for every planet type of the system**, not only the lines either layout uses.
- **"Working it out…" lasts as long as the slowest live read, up to 45 s**; a read that fails counts as in, and past the bound the rows rest
  on this morning's books for what hadn't come back, said, then move once more when it lands.
- **The record's write waits for this visit's first pull, but two devices open at once can still cross** (Ruling FX2-2): a record written on
  one inside the other's pull interval (a minute) goes up as the whole `planets` doc, newest wins, and can take a plan kept on the other in
  that minute with it. A doc merged by field (with tombstones for Forget) would close it; the user plans on the PC.
- **No pull this visit, no record**: with the cloud unreachable all visit, nothing is recorded until a later visit's pull lands.
- **The record steadies the default programme length and the assumed heads**, so one from a colony long gone counts until a newer read of
  its planet type and P0 replaces it.
