# Planets

Decisions worth not undoing. The Planets side hustle (Side hustles → Planets): the static-data bundle, what fits on a planet,
the extraction readings, learned rates, the `planets` document and customs tax, and the page (Plan, Chart). The planner's own
rules (the five setups) are in `planets-planner.md`, the prices it buys and sells at and the exact sizing in `planets-market.md`, the
feed, the chain and the searches in `planets-searches.md`; the
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
  at: never scaled, never decayed again. `rateFor` takes the learned rate for that P0, then a typed one, then the same P0 learned on
  another planet type (planner fix 1, marked `otherType`, said and set aside as T15b-12 sets aside a borrowed rate: the user's Gas Aqueous
  Liquids, 16,919, had been passed over for Barren's Noble Metals, 19,062, and decided which planet made Water), then the type's other
  learned P0 (most extractors, then lowest ID), marked `otherP0` and said. A learned rate can't be typed over (the page offers no
  box: `rateFor` would never use it). Since planner fix 2 a rate also outlasts its colony (the learned rates' record, "learned before",
  after typed at each step: planets-kept.md). Every character's kept colonies teach it since Task 16 (the main's and each alt's, a refused alt's
  last read among them: `useLearned`, Plan and Colonies alike); the shown character's alone before. A typed rate needs P0 an hour, the
  programme's hours and heads, all three. The programme length defaults to the median of the learned programmes, else 72 h (the
  spec's 3 days), until typed into the `planets` doc; a rate from another length says "you chose" only for a typed one (planner fix 1),
  else "the median of your programmes" or the default (`programFrom`).
- **Each planet's own rate comes first** (`learnedPlanetRates`, `rateFor`'s planet argument; 24 October 2026). The user: "some of my
  current gas planets … are struggling a bit with resources because they are a bit scarce on the planet and I hope the planner is aware of
  choosing the best planets" (not typed scan ratings). Richness is in no API (eve-planets.md); their Gas planet 40308021 runs about 1.1–1.3k
  an hour a head, another 1.6–2.0k, and one rate a type dragged both down. Ruling F18: each kept colony teaches its planet's `factor`, its
  per-head yield over the other planets' of the type (none alone, or with no heads known: the type's rate, said). Plan uses the type's rate
  times it, at the type's heads (nothing scaled by heads), before a typed rate. A planet with a factor is its own class to the feed and
  chain (`PlanInput.planetKey`). Its line says "learned on this planet: about 64% of your other Gas planets a head", and "gives about 64% a
  head" past `OWN_POOR_UNDER` (15%) under.
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
  each setup's "How to build it" (`setupSteps`). The skills panel stays, at the shown character. **Plan, the Chart and Colonies
  load as chunks of their own** (Ruling F2, `section` in Planets.tsx, App.tsx's `page` rule: a renamed chunk reloads once, then
  "Reload to try again"), so the other Side hustles tabs don't carry the planner: SideHustles' chunk went from 637 KB (198 KB
  gzipped) to 481 KB (143 KB) on 24 October 2026; Plan's chunk is 133 KB (48 KB), Colonies' 46 KB (18 KB, and it loads Plan's for
  its outputs' lines), the Chart's 17 KB (7 KB).
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
    has stood still 350 ms, a step at a time in slices of 8 ms (planets-searches.md), the last ranking shown meanwhile ("Working
    them out again"). First on
    the morning's books, then again on the live books of the goods that first ranking names (never the live ranking's: each
    re-rank could name more). Only an input whose contents changed starts it (planets-planner.md), never a write elsewhere.
  - **Plan**: the setups first, ranked, then the inputs (tax chips, "Not Brave's space", rates) and the planets; the programme length
    sits at the top beside the system (the user: "that control seems like it should rather be at the top": it changes every row).
    Each setup is a row until opened, then a board of planet cards (planets-board.md).
    P0 → P2 is always there, with how far it is from the best (`data-planets="gap"`). A row says its reason when blocked, a search
    cut short as "The best of the arrangements tried: the search ran out of its budget first, so it may be well under what this
    system can do", a tax not known with each 1%'s cost, and outputs not valued by count. A planet whose layout fits at no level is
    still ranked and said, in the row's head and on its line (the spec; whether to rank it is the final review's).
  - **Each setup shows its day as a week and a month, and the month against a month of Omega** (Ruling F10, `lib/iskPeriods.ts`; 19
    October 2026). The user: "i also need to be able to see during planning and after i have built the isk per day/week/month", and
    "the latest youtube guides say that you can easily plex your account and then some with null PI". A week is 7 days and a month
    30 (Research's convention); the share is the month over `plexPerMonth` × the PLEX price (Omega's own sum, `monthOfOmega`), "15%",
    "1.4×" past 100%, its tip giving the PLEX count, price, the price's age and that it is one account's month. A chain's is per
    character, as its day is. No PLEX price read yet: the share is "–" with why, never 0%; no ISK a day, no periods. Colonies has it
    since Task 16 (planets-colonies.md); a chain's per-character lines say their week and month, and a chain across characters its
    figure in all.
  - **The repeat line counts accounts** (20 October 2026; the accounts are characters.md's): what its characters make together in a
    month against K months of Omega, K the distinct accounts of the characters it counts, one whose account isn't set counting as
    its own, said ("for their 2 accounts, 1 character’s account not set"). A chain's per-character lines name each account once
    any is set; a single row's share stays one account's month. Show for lists characters by account.
  - **Plan it: Plan held to one good** (19 October 2026; `PlanInput.only`, `onlyWhy`, `Setup.repeat` in piPlan.ts; `PlanningGood`,
    `RepeatLine` in PlanetsPlan.tsx). The user: "I am clicking on Gel-Matrix Biopaste which is the one I want to go for but when I go
    to PLAN I don't think it is showing how to build it on which planet to make that item". Plan ranked each kind by its own best
    product, so a good showed only when it won.
    - The Chart's picked good (P1 to P4) has **Plan it**: `hustles/planets/plan?good=<id>`, kept per browser
    (`jita-ledger:planets-plan-good`) until **Every product**. "Planning Gel-Matrix Biopaste for Owner at 5-NZNW · Every product".
    - Every setup is held to it (planets-searches.md): a planet that can't make it alone says so; a kind that can't make it says why on
    `canMake`'s reasons (now in piPlan.ts, re-exported by piChart.ts): "Can’t make Gel-Matrix Biopaste, a P3: it sells P2 only", "Can’t
    make Superconductors: no planet here gives Aqueous Liquids and Suspended Plasma together", a good with no price "isn’t priced".
    - **What choosing it costs** (the user: "max profit will probably be best to use planner as it is currently"): every product's
    ranking is worked out beside the held one, each on live books of its own (one set for both would rank the full one again for the
    held one's goods), and once both are in for these inputs, said side by side, each on its own footing, since units first values the
    good with no market cap: "Every product’s best here: 25.14 M ISK a day (bought, Organic Mortar Applicators), at what the markets
    take at your share. Gel-Matrix Biopaste’s best makes 104 a day (a fed factory), 16.73 M ISK a day if every one sells at today’s
    price" (the user's 23 October rates on the page case's prices, at UALX-3). Until planner fix 1 it said the gap ("… under it").
    - **Units first** (planner fix 1, 24 October 2026; `heldInput`, `UNITS_WEIGHT`, `Setup.made`, `extraOf`, `fitLevel` in piPlan.ts).
    The user: "the more it makes the better", "we don't need to estimae how long the output takes to sell … have the planner maximise
    the system i have chosen … so i can pump out as much as possible. the selling is my problem", and "i think the plan showed me to
    make electrolytes and chiral structures at one time and so i went with it and thought they needed it". Plan it ranked on ISK with
    the good held to what UALX-3 takes at a 10% share, 12 Gel-Matrix Biopaste a day, a sixth of a factory, the rest P1 sold as surplus
    (planner-bugs-report.md). Now:
      - the searches value the good at 1e7 a unit, uncapped (planets-searches.md), so the most units win and extras break ties by ISK;
        what's shown values it at its first unit's net with no cap or pace (planets-market.md). The head figure is its units a day, the
        ISK beside; rows rank by units. Bought makes as many as pay and stands apart, below: "Or buy the inputs instead";
      - the factory draws each good fill-first (lowest tax, then the planet listed first), never in proportion: split in proportion,
        163 Precious Metals from III and 163 from IV read as two planets feeding it, and both were built. A second planet gives a good
        only where the first can't cover the need (Ruling FX1-1), and its line says it tops up ("Tops up Water: the factory takes all of
        5-NZNW III’s 2,707 a day and the last 54 a day from here; the rest is sold": the user's own rates, Water the scarcest P1, the
        second line lifting 101.5 a day to 103.5). A line the factory draws nothing from says "Extra: Gel-Matrix Biopaste doesn’t use
        Chiral Structures; it’s sold" or "Extra: the factory takes all its Precious Metals from 5-NZNW IV". At 5 planets two of eight
        lines can't add a unit whatever the arrangement, so two extras are chosen by ISK (Ruling FX1-2);
      - the factory is sized for all its planets ship and must fit at the character's own level (a chain's highest), not V (T9-3
        stands for every product); "How to build it" names what to route into a P3 or P4 factory (one of the user's three had none);
      - check.mjs pins 102 a day and 3/3/3 and 2 factories on round 17,000 rates, the same with Jita capped at 50, P1s at 30 times
        their price, and 11 draws of pace and ±3%, and a top-up (Aqueous Liquids at 12,000: 1,920 and 800 Water, fill-first, said);
        the page check Lava II's "Extra", one planet a good and the units head.
    - **Repeated on each character** (the user: "i will rarely go cross character setups and mostly repeat the P3 setup on each
    character to make things simple to manage and scale"): a line on P0 → P1, P0 → P2, feed and bought rows, never a chain's: "On each
    of your 3 characters doing planetary industry: about X a day together (Y a month)". Counted: skills read, not Alpha, a clone not
    read said. Not: fewer planets than it uses, or a lower Command Center Upgrades level where a colony doesn't fit ("Willi Wakkerr:
    Command Center Upgrades III"). Valued as the setup values itself on N copies on the same planets (a character holds one colony a
    planet): each good summed and sold once, `keptWhy`, customs on what's exported; bought's N sized together by its linear programme.
    The cap is named: the market at your share, or an input's supply (5-NZNW's bought Gel-Matrix Biopaste already buys Jita's 10% share
    of Oxides for one character, so two make no more).
    - **Resets** (the user, on "Resets a week: 11.7 · a program each extraction planet" at 72 hours: "why does this say i wil have to
    reset 11 times a week, thats impossible"; it was 5 planets × 168 ÷ 72): "Every 3 days" ("every 18 hours" under a day), "5 planets
    (10 extractors) each time: about 2.3 sittings and 11.7 planet resets a week"; a chain's each character's planets.
  - **Chart** (`PlanetsChart.tsx`, `piChart.ts`): the 83 goods by tier from the bundle (never evehelper's data), each tier most ISK a
    unit first, a good not valued last (24 October 2026, the user: "so i can easily see the highest earners first"), each valued a unit
    and a m³ at the chosen market, a picked good's recipe down to P0 with quantities and cycles, the planet types and the system's
    planets that give its P0s. **Ruling T12-1**: "Which setups can make it at X" reads what each kind *can* make from the bundle
    (`canMake`), beside what Plan's ranking *does* make (`makingIn`, from roles); roles alone can't name Nanites at 5-NZNW, the
    plan's own example (the ranked P0 → P2 makes Mechanical Parts there: Nanites is the cheapest Barren P2). A chain's P3 "can"
    only when it needs more planets than one character has (`CHAIN_P3_WHEN`). **Ruling T12-2**: each value says the book it's on
    (`UnitNet.book`: Jita now, this morning's Jita book, the hub's own read, Goonmetrics'), since only the ranking's goods are read
    live. With Sell at the hub, a good it doesn't price is valued at Jita's (F11, planets-market.md): the chip ends "· Jita's"
    (`data-fallback`), its tip and recipe head say "No price at UALX-3: valued at Jita's: … (Jita lists it at …)"; Oxides read "–".
    Goods the system can't supply are greyed (`aria-disabled`, still pickable): **UALX-3 lacks four P0s**, not the plan's
    two (no Lava, Plasma, Ice or Oceanic planet: Felsic Magma, Heavy Metals, Non-CS Crystals, Planktic Colonies), and 40 goods are
    greyed there; 5-NZNW has all 15. Scrolls to the recipe only on a pick, never on opening with a good kept
    (`jita-ledger:planets-good`).
    - **The picked good's panel is drawn** (the user, 24 October 2026: "hard to read and process… use some icons or images or graphics"; 600 px beside the grid): ISK a unit and a m³ as tiles; the recipe as a left-to-right tree of icon cards (`recipeTree`, a good used twice appears once per parent, so no line crosses; paths are the ship trees' `edgeShape`, and check.mjs runs `treeProblems` over all 83 goods at the card size `RECIPE_BOX`); each step as an equation of icons with a facility badge and its cycle; P0s with their planet types' icons (images.evetech.net serves `/types/<planet type id>/icon`). The sums "in all" stay as chips.
  - **Phone**: the Chart's tiers wrap two goods a row; a setup's planet lines stack; Colonies in planets-colonies.md.
- **The page case** (`scripts/pages.mjs`, the `planets` ledger; `scripts/fixtures/planets-5nznw.json`, committed so the deploy
  can read it: 5-NZNW's and UALX-3's planets as ESI answered, the goods' books and Goonmetrics rows from the research's prices)
  checks every state above at both widths, an Alpha and an unread alt among them. Its colony, two extractors at 10 heads with no
  factories, is seeded, not the user's.
- **The chain's time, settled in the final fix round (Ruling T11-13)**: with two characters doing planetary industry the chain
  was one main-thread task of 282–346 ms on 5-NZNW (this machine, 18 October 2026; the re-review measured 740–910 ms), twice a
  ranking (morning, then live): in the browser, tasks of 298 and 239 ms. Its search is now sliced (planets-searches.md): the
  longest slice holding the chain 10–14 ms, the whole ranking unchanged at 330–490 ms. Not a Web Worker (`PlanInput`'s closures
  don't clone) and not a tighter budget. P0 → P1 and bought are still one step each: on 5-NZNW at the real rates 23–25 and 11–14 ms
  warm, 57–59 and 28–31 ms the first time in a fresh process (Task 15b's fix round; 25–45 warm and up to 68 first before F9).

## Open, and left for the stage-1 final review

- **The chain at the real rate**, closed (Task 15b): two characters at IV on 5-NZNW read cut at 80,000 arrangements, 15,862,624 a
  character, and 15,970,910 at 8 M (35 s), 0.7% more. No `RAN_OUT`, and too little for a seeded bound to be worth it. The row
  still says it "may be well under what this system can do", which overstates a 0.7% gap there; the words stay (the ruling).
- **The real colony's head count** (the first kept read, 18 October 2026; planets-colonies.md): the main's five colonies run 9 or
  10 heads at CCU IV (4 + 5 or 5 + 5), inside the fit model beside their factories. It bit at the formula's rates: the planner's
  layouts wanted 7–10 factories where 6 fit, so Ruling F9 ranks the most that fit (Task 15b, planets-planner.md).
- Settled in the final fix round (planets-market.md): `sizeGroup`'s status (T11-12), "No input is priced to buy", the sizing
  question (only bought is sized to what pays), the chain's timing (above). Kept as ruled: a layout that fits at no level is still
  ranked and said, since F9 only where the least layout of its kind doesn't fit. The colonies' own are in planets-colonies.md.
- **A bought setup cut because its sizing didn't settle says the budget ran out** (`cut`'s one note): untrue for that path, never
  seen (no LP in 5,500 random programmes or any gate failed to settle). Telling the two apart needs a field saying which kind of
  cut; carried to stage 2 (the final re-review, 18 October 2026).

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **A kept plan and the learned rates' record are fields of the `planets` doc**, which an older build's save drops (planets-kept.md).
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
- **Repeated on each character is the shown character's layout run N times on the same planets**: a character at a higher Command
  Center Upgrades level, or with more planets, could run more there, and is still counted at this layout; each runs every planet this
  uses (no other planets of the system are tried for the others). What they make together is sold once at your share.
- **Planets' customs tax is typed or Brave's wiki's 2023 rates** (2% Barren and Temperate, 5% the rest, in sov null-sec): ESI
  shows no skyhook's or office's rate, and what a high-sec InterBus office charges is unverified. A system "not Brave's" or a
  wormhole is ranked before the tax.
