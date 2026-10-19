# Planets

Decisions worth not undoing. The Planets side hustle (Side hustles → Planets): the static-data bundle, what fits on a planet,
the extraction readings, learned rates, the `planets` document and customs tax, and the page (Plan, Chart). The planner's own
rules (the five setups, the search, the exact sizing, the prices it buys and sells at) are in `planets-planner.md`; the
colonies (the `colonies` document, the cloud's hourly read, the Colonies section) in `planets-colonies.md`. The user (10 and
17 October 2026): they live in null-sec (Brave, Tenerifis), want to give the page a system and be told "per setup type what
the isk is you can make best from it and then what to get from which planet", and "most of my setups will be P0 -> P2 per
planet to save on management time. I don't know if this is the most profitable." Spec
`docs/superpowers/specs/2026-10-17-planets-design.md`, plan `docs/superpowers/plans/2026-10-17-planets.md`, research
`.playwright-mcp/research/planets/` (gitignored: `mechanics.md` gives each fact's source and how sure it is). Stage 1 (plan a
system, the Chart, the main's colonies kept) is Tasks 1–12 on branch `planets`; stage 2 (every character's colonies) is Tasks
14–17.

- **The bundle is CCP's static data, not ESI** (`scripts/planets-bundle.mjs`, build 3569502, `SDE_ZIP=` reuses a download; a
  rebuild of the same build is byte-identical). ESI's schematic route gives only a name and a cycle time, and nothing of pin
  costs, command centre levels or radii. `src/data/planets.json` (27 KB, 3 KB gzipped; `piBundle.ts`) holds the 83 goods (15 /
  15 / 24 / 21 / 8 by tier) with volumes and tax bases, the 68 schematics, each planet type's P0s (group 1026's `harvesterType`),
  command centre levels 0–V (1,675 CPU / 6,000 MW at 0, 25,415 / 19,000 at V) and every pin's and the link's cost, all
  eve-planets.md's figures. `src/data/planetRadii.json` (675 KB, about 230 KB gzipped, 7,983 systems): every PI planet's radius,
  delta-encoded by system (the plain pairs were 1.21 MB / 362 KB), loaded only when a system is planned. The link's minimum
  length and the 10 heads an extractor aren't in the static data: named constants with their source. Both chunks load through
  `planetsBundle.ts`; a failed one offers "Reload to try again" (gotchas.md: a failed dynamic import can't be retried in place). `pi.ts` keeps only `PLANET_TYPES`,
  `parsePlanetType`, `PI_LINKS` and `setupSteps`: its hand-typed tables went (one spelled "Micro Organisms"; CCP's is
  Microorganisms, 2073).
- **What fits uses each planet's own radius, never a type's median** (`piFit.ts`: `fitOf`, `maxHeads`, `maxFactories`, `linkKm`).
  Links are the structures less one (the command centre isn't counted), each at the minimum length. Within one type the radius
  runs from 348 to 159,270 km (Gas), so a median would make a head count look exact when it isn't. On the research's medians
  (Barren 3,750 km, a 45 km link; Gas 26,370 km) the code gives the research's table: Barren P0 → P2 at CCU IV holds 11 heads
  with 2 Advanced + 4 Basic, 7 with 3 + 6; at V 15 and 10; Gas at IV 10 and 6; a factory planet with one launchpad 22 Advanced
  (25 at V) or 15 High-Tech (19). A link per structure (one too many) still passes that table, since an extra link moves no
  floor: only the exact-cost test catches it. Advanced and Basic layouts run out of powergrid, High-Tech out of CPU. A radius
  not known isn't fitted, and says so.
- **The extraction formula, and the reading the game settled** (`piExtraction.ts`: `cycleOutputs`, `readings`, `lowerReading`;
  the formula is eve-planets.md's). `Math.floor` on doubles: CCP's example (6,965, 30-minute cycles,
  47.5 h) is 24,261 first, 5,389 last, **789,314** in all (eve-pi's "always take one off" gives 789,219). Read as the current
  cycle's output, the same programme is 6,965 × 95 = **661,675**. A cycle's first output is up to 16× apart between the two
  readings (4-hour cycles); over a programme, with the decay, about 2× on 3 days and 3× on 14. `readings` gives both, null
  (never 0 or NaN) for a programme whose times are missing or reversed or whose quantity or cycle isn't positive (Ruling T3-1).
  - **The game reads CCP's formula** (`PI_READING` `'formula'`, `piLearn.ts`; the in-game check, 19 October 2026). The main's
    5-NZNW IV Noble Metals extractor (5 heads, `qty_per_cycle` 10,196, 1-hour cycles, 73 h from 17 October 14:03 UTC, as the
    cloud kept it) read "Total: 1,473,445" and "Avg. Per hour: 20,184" in the game's extraction programme window; the formula
    gives 1,473,446 (20,184.2 an hour), the figure a cycle 744,308. The user had changed other colonies the day before; this
    programme was the kept one. So ESI's `qty_per_cycle` is the formula's base for 15 minutes, and the Plan ranks on the formula,
    with nothing beside it (`higher` null, so no "up to X if the game reads extraction the other way").
  - **Before it, the planner ranked on the lower reading** and showed the higher beside it: a figure that might be four times
    too high mustn't put a setup on top (the spec). Learned rates and Colonies' programmes said "not yet checked against the
    game’s total" (`PI_UNCHECKED`, kept for a build with `PI_READING` null). The lower was the figure a cycle on every real
    programme: Plan read the user's planets at half their yield or less until the check.
- **Learned rates** (`piLearn.ts`: `learnedRates`, `rateFor`). Each extractor's per hour over its whole programme (ended ones too:
  a programme that ran out still says what the planet gave), keyed by planet type and product P0; only extractors with a quantity
  over 0, known install and expiry, a planet type and a P0 product. The two readings are averaged apart and the lower mean is the
  rate, the other `higher`; with `PI_READING` set, that reading alone, `higher` null. Programme hours and heads are the medians of
  what was averaged, heads over the extractors that said how many (0 is not known, Ruling T8-1: [0, 10] read 5, a count neither
  had, until the final review; now 10, and all zeros not known). A rate is for the head count and programme length it was measured
  at: never scaled, never decayed again. `rateFor` takes the learned rate for that P0, then a typed one, then the type's other
  learned P0 (most extractors, then lowest ID), marked `otherP0` and said. A learned rate can't be typed over (the page offers no
  box: `rateFor` would never use it). In stage 1 only the shown character's own kept colonies teach it (the main's; an alt's once
  Task 14 keeps them). A typed rate needs P0 an hour, the programme's hours and heads, all three. The programme length defaults to
  the median of the shown character's learned programmes, else 72 h (the spec's 3 days), until typed into the `planets` doc.
- **The `planets` document** (`planetsDoc.ts`, `sanitizePlanets`): per system, customs tax by planet type and by planet, which
  high-sec planets are InterBus's, "not Brave's", and typed rates by type and P0; plus the programme length. Fractions 0 to 1,
  rates and hours positive and finite, at most 40 systems. Synced like `colonies` (`DOC_KEYS` on both sides), sanitized on pull,
  held back by `refusedDoc` while the Worker is a version behind, ignored by an older browser.
- **Customs tax** (`customsRate`; never 0 for not known). The owner's rate is the planet's own, else the type's typed rate.
  - **Sovereign null-sec defaults to Brave's wiki**: 2% on Barren and Temperate, 5% on every other type (`BRAVE_TAX`; "Brave
    Industry Taxes", last modified 17 July 2023, `BRAVE_TAX_SOURCE`). The user, 17 October 2026: "use the taxes brave wiki states.
    it is usually up to date, i will tell you later if it is different". Said on each type's chip ("2% · Brave’s wiki, 17 Jul
    2023"). In sov null-sec the Orbital Skyhook is the customs office (eve-planets.md) and ESI shows no skyhook's rate, so this is
    a default, not a reading. Not in wormholes (ID 31,000,000 and up), and not in a system switched to "Not Brave's space": no rate
    is assumed there, the setups are ranked before the tax, and each row says what each 1% costs a day.
  - **High-sec**: a player office's typed rate plus the NPC part (eve-planets.md), null until both it and Customs Code Expertise
    are known; an InterBus office is its typed rate alone, said as unverified. **Low-sec**: typed. Imports pay half; a launch
    from the command centre (1.5×) isn't modelled, since no setup launches.
- **The page** (`Planets.tsx`; sections in the address, `hustles/planets/<section>`, the last kept in `jita-ledger:planets-section`).
  The old four-step walkthrough, its region scan and `PiDiagram` went: its pieces live on as the P0 → P1 setup, the planner and
  each setup's "How to build it" (`setupSteps`). The skills panel stays, at the shown character.
  - **Show for** (`jita-ledger:planets-show`, falling back to the main without forgetting the kept one, as Industry's): planets
    allowed (1 + Interplanetary Consolidation, never typed: a skill that sets a figure exactly fills it), the CCU level the fits
    assume, the clone state, and fees from `useIndustryChars`.
    `planCharOf`: skills not read (absent, or `{}`) give no planets and no level, never 1 planet at CCU 0; an Alpha is "Alphas
    can’t do planetary industry" (none of the planet skills is in any Alpha grade); a clone not read is planned as Omega and said.
    `Planets.tsx` is an importer of the alt store (characters.md lists it) and writes nothing of an alt's.
  - **The system**: typed (the stargate map's names, else `/universe/ids`), "Where <main> is" (only with the location permission,
    which is read, never asked for; one read a minute shared, `useMainSystem`), or a chip per system of the shown character's
    colonies. Kept in `jita-ledger:planets-system`. Planet types come from the bundle by type ID (`planetTypeOf`): Shattered and
    Scorched Barren are null, "No planetary industry on this kind of planet".
  - **One ranking for Plan and Chart** (`planetsPlanning.ts`, `usePlanning`, Task 12): the inputs and the planner run once for
    whichever section draws, so the Chart's "the ranking makes" and the Plan's rows can't differ. The setups run once the input
    has stood still 350 ms, a step at a time in slices of 8 ms (planets-planner.md), the last ranking shown meanwhile ("Working
    them out again"). First on
    the morning's books, then again on the live books of the goods that first ranking names (never the live ranking's: each
    re-rank could name more). Only an input whose contents changed starts it (planets-planner.md), never a write elsewhere.
  - **Plan**: the setups first, ranked, then the inputs (tax chips, "Not Brave's space", rates, programme length) and the planets.
    P0 → P2 is always there, with how far it is from the best (`data-planets="gap"`). A row says its reason when blocked, a search
    cut short as "The best of the arrangements tried: the search ran out of its budget first, so it may be well under what this
    system can do", a tax not known with each 1%'s cost, and outputs not valued by count. A planet whose layout fits at no level is
    still ranked and said, in the row's head and on its line (the spec; whether to rank it is the final review's).
  - **Chart** (`PlanetsChart.tsx`, `piChart.ts`): the 83 goods by tier from the bundle (never evehelper's data), each valued a unit
    and a m³ at the chosen market, a picked good's recipe down to P0 with quantities and cycles, the planet types and the system's
    planets that give its P0s. **Ruling T12-1**: "Which setups can make it at X" reads what each kind *can* make from the bundle
    (`canMake`), beside what Plan's ranking *does* make (`makingIn`, from roles); roles alone can't name Nanites at 5-NZNW, the
    plan's own example (the ranked P0 → P2 makes Mechanical Parts there: Nanites is the cheapest Barren P2). A chain's P3 "can"
    only when it needs more planets than one character has (`CHAIN_P3_WHEN`). **Ruling T12-2**: each value says the book it's on
    (`UnitNet.book`: Jita now, this morning's Jita book, the hub's own read, Goonmetrics'), since only the ranking's goods are read
    live. Goods the system can't supply are greyed (`aria-disabled`, still pickable): **UALX-3 lacks four P0s**, not the plan's
    two (no Lava, Plasma, Ice or Oceanic planet: Felsic Magma, Heavy Metals, Non-CS Crystals, Planktic Colonies), and 40 goods are
    greyed there; 5-NZNW has all 15. Scrolls to the recipe only on a pick, never on opening with a good kept
    (`jita-ledger:planets-good`).
  - **Phone**: the Chart's tiers wrap two goods a row; a setup's planet lines stack; Colonies in planets-colonies.md.
- **The page case** (`scripts/pages.mjs`, the `planets` ledger; `scripts/fixtures/planets-5nznw.json`, committed so the deploy
  can read it: 5-NZNW's and UALX-3's planets as ESI answered, the goods' books and Goonmetrics rows from the research's prices)
  checks every state above at both widths, an Alpha and an unread alt among them. Its colony, two extractors at 10 heads with no
  factories, is seeded, not the user's.
- **The chain's time, settled in the final fix round (Ruling T11-13)**: with two characters doing planetary industry the chain
  was one main-thread task of 282–346 ms on 5-NZNW (this machine, 18 October 2026; the re-review measured 740–910 ms), twice a
  ranking (morning, then live): in the browser, tasks of 298 and 239 ms. Its search is now sliced (planets-planner.md): the
  longest slice holding the chain 10–14 ms, the whole ranking unchanged at 330–490 ms. Not a Web Worker (`PlanInput`'s closures
  don't clone) and not a tighter budget. P0 → P1 and bought are still one step each: 25–45 ms warm, up to 68 ms the first time.

## Open, and left for the stage-1 final review

- **The chain at the real rate**, closed (Task 15b): two characters at IV on 5-NZNW read cut at 80,000 arrangements, 15,862,624 a
  character, and 15,970,910 at 8 M (35 s), 0.7% more. No `RAN_OUT`, and too little for a seeded bound to be worth it.
- **The real colony's head count** (the first kept read, 18 October 2026; planets-colonies.md): the main's five colonies run 9 or
  10 heads at CCU IV (4 + 5 or 5 + 5), inside the fit model beside their factories. It bit at the formula's rates: the planner's
  layouts wanted 7–10 factories where 6 fit, so Ruling F9 ranks the most that fit (Task 15b, planets-planner.md).
- Settled in the final fix round (planets-planner.md): `sizeGroup`'s status (T11-12), "No input is priced to buy", the sizing
  question (only bought is sized to what pays), the chain's timing (above). Kept as ruled: a layout that fits at no level is still
  ranked and said, since F9 only one whose heads leave room for no factory. The colonies' own are in planets-colonies.md.
- **A bought setup cut because its sizing didn't settle says the budget ran out** (`cut`'s one note): untrue for that path, never
  seen (no LP in 5,500 random programmes or any gate failed to settle). Telling the two apart needs a field saying which kind of
  cut; carried to stage 2 (the final re-review, 18 October 2026).

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Planets' fits are CPU and powergrid at minimum-length links** (planets.md): the command centre's budget at your Command
  Center Upgrades level, extractors and heads, factories, one launchpad and the links, all from the static data on the planet's
  own radius. Not modelled: links longer than the minimum (a real layout's are, so it fits less), storage, link upgrades and
  whether a route's bandwidth carries the flow, and where pins sit (head overlap moves the yield, not the fit).
- **A planet's yield can't be known before it is built.** A learned rate averages your own extractors of that planet type and
  P0, measured at their head count and programme length (another length says so, never rescaled), and planets of one type
  differ; with none, a setup is ranked at what its factories take, "if your extractors deliver" 12,000 an hour, never claimed.
- **The reading rests on one programme checked in game** (5-NZNW IV's Noble Metals, 1-hour cycles, 73 h: the formula's total
  to the unit). Another cycle length hasn't been checked; the formula is CCP's own for all of them. A programme's output
  decays: no per-hour figure is steady, and the rates are each programme's average.
- **Planets' customs tax is typed or Brave's wiki's 2023 rates** (2% Barren and Temperate, 5% the rest, in sov null-sec): ESI
  shows no skyhook's or office's rate, and what a high-sec InterBus office charges is unverified. A system "not Brave's" or a
  wormhole is ranked before the tax.
