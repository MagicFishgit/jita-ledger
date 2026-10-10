# Industry

Decisions worth not undoing. The Industry side hustle (Side hustles → Industry): what to build, where, and what it pays;
the static-data bundle it rests on; the rules for jobs, research, copying and invention; build sites; the finder; home
prices from Goonmetrics; the ladder. The spec is `docs/superpowers/specs/2026-10-10-industry-design.md`; the research
behind it `.playwright-mcp/research/bpo/report.md` (gitignored). Stage 1 (what to build and how to start) is built by
`docs/superpowers/plans/2026-10-10-industry-stage-1.md`.

- **The bundle comes from CCP's static data, not ESI** (`scripts/industry-bundle.mjs`, build 3569502, 2 October 2026;
  `SDE_ZIP=<zip>` reuses a download). ESI serves no blueprints, rigs, structure bonuses or station services. Three files:
  `src/data/industry.json` (the tab's chunk: 2,693 blueprints, 5,670 types in 602 named groups, 106 rigs, 2,305 stations,
  57 skills; 1,056 KB, 145 KB gzipped, against a budget of 1.2 MB and 160 KB), `industryEiv.json` (every published blueprint's ME 0
  materials, 4,039, for stage 2's first-sight EIV: nothing reads it in stage 1), and `industryTypes.json` (the cloud's watch
  set, 1,858 types, and the 1,673 blueprints whose NPC sellers the scan keeps).
- **Which blueprints**: every published blueprint on the market whose product is on the market (1,741), and every one
  they invent (1,020 Tech II). 68 are both (the old Tech II originals: Helios, Crow, Raptor…): they're Tech II here,
  costed through invention, since NPCs never sold them and an original you'd buy would be a fiction.
- **A rig's value is its own dogma, not its modifier source's attribute.** `industryModifierSources` names, per rig, the
  activity, the kind and the filter it helps, with a `dogmaAttributeID` (2538, 2539…) that names the structure attribute
  it moves and isn't on the rig at all (690 such attributes missing, checked). The rig carries 2594 (material: Tech I −2.0,
  Tech II −2.4), 2593 (time: −20, −24) and 2595 (cost: the copy and research rigs' −10, −12), times 2355 / 2356 / 2357
  (1.0 high-sec, 1.9 low, 2.1 null and wormholes). Kept: Tech I and Tech II engineering rigs (metaGroup 54, 53) with their
  size (dogma 1547: 2 M-Set, 3 L-Set, 4 XL-Set), 106 of the 220 sources. Thukker and faction rigs (52) and the faction
  citadels are left out. The copying, invention and research rigs carry no filter: they help every blueprint.
- **A skill's bonus is read from its dogma** (`skills`: rank, attributes, and the one bonus attribute it carries): Industry
  440 (−4% time a level), Advanced Industry 1961 (−3%), a science or advanced construction skill's 1982 (−1% manufacturing
  time a level, on what requires it: how EVE Ref's Tech II time comes out), Science 452 (−5% copy time), Research 453
  (−5% TE research time), Metallurgy 468 (−5% ME research time), Mass Production and Laboratory Operation 450 / 471 (+1
  slot).
- **Station services from `stationOperations`**: 2,259 NPC stations have a Factory and only 510 a Laboratory, so a quiet
  station to build in is often not one to research in.
- **The rules match EVE Ref to the ISK on the research's item** (`src/lib/industry.ts`, `scripts/fixtures/industry-everef.json`).
  The Large Trimark Armor Pump I, 65 runs at ME 10 / TE 20 in an Azbel in null-sec with a Tech I L-Set Equipment rig, 6.17%
  index, 1% tax, Industry IV, Advanced Industry II: materials 4,606 / 3,995 / 3,108, 1,318.95 s a run (EVE Ref 21 min
  58.953 s), job cost 17,213,916, EVE Ref's own figure, at ESI's adjusted prices at full precision. **The spec's
  "17,213,889" was a slip in the research's write-up**: its own inputs give EVE Ref's figure. Copying 65 runs: base
  3,151,808, SCC 126,072, tax 31,518. Invention at III / III / III: 0.4335, base 1,638,947.87 for the 2.3068 attempts a copy
  takes, job cost 206,717.19; the Tech II pump at ME 2 / TE 4: 19 / 14 / 1 / 22 and 14,892 s.
  - **Materials round per job**: `max(runs, ceil(round(runs × qty × (1 − ME/100) × structure × rig, 2)))`.
  - **The structure's and rigs' cost bonuses come off the index part only**; the facility tax, SCC and Alpha tax are on
    the base. A facility tax not known is `null` and left out of the total (the finder says so), never 0%.
  - **A research job's time is the blueprint's own first-level time** (rank × 105 s, already in the static data) × the level
    table's steps ÷ 105: never the rank again. Its cost has no rank (EVE University's table, the research's reading).
  - **Invention has no science-skill time bonus** (EVE Ref: 23,400 × 0.94 × 0.8 = 17,596.8 s an attempt, Science V or not);
    copying has Science's 5% a level. Tech II manufacturing gets each required skill's dogma 1982 (−1% a level).
  - **Rigs of one kind on one product don't stack here**: the better is taken. No source says how two would combine.
- **The finder reproduces the research's worked row** (`src/lib/industryRank.ts`): the Large Trimark Armor Pump I at
  ME 10 / TE 20 in an Azbel in null-sec, materials from Jita by Brave Freight, listed in Jita at 7,040,000: 5,959,979 of
  materials and 264,830 of job a unit, a sale netting 6,637,440 after 1.3%, 3.375% and 73,440 of freight, 412,632 profit a
  unit, and one slot's 65 a day binding under 81 a day of buyers at a 10% share.
  - **A job is a day of runs** (the research's choice): as many as finish in a day, at least one; a run over a day makes
    its units over the days it takes.
  - **Freight's minimum is spread over a batch**: a week's materials in one contract (`batchLeg`), a week's sales at your
    share in another. Charged per material, the 5 M minimum made the research's row 8,001 ISK a unit dearer.
  - **Sourcing is per material**: Jita's best ask plus freight in (carried, with no ISK, from a high-sec site within 10
    jumps), the home hub's best sell only where its weekly movement is ten times the week's need, and mined at what it
    would sell for, never free. **Mined is picked only for a mineable material and a builder with mining records in the
    last 30 days**: a bid is always under an ask, so otherwise every mineral would read as mined and every builder as a
    miner (a deviation from the spec's "cheapest of three", 10 October 2026). Jita's patient bid is said, never picked.
  - **One slot's day**: the better-paying side first, at your share of its pace (buyers taking listings, sellers selling
    into bids, from `tradingSplit`), then the other only where it pays, both no more than the slot makes. A side that loses
    is still shown, as a loss.
  - **Not known stays not known**: no Jita book this morning, no history to pace it, no index for the system, adjusted
    prices not read, a material nobody lists, no freight route: each a reason, never a 0. A facility tax not typed is left
    out of the job cost and the row says what each 1% would cost a day; likewise a hub's broker fee.
  - **Home pace before the home history is read is Goonmetrics' weekly movement ÷ 7 at an even split**, said as such;
    once read, the region's typical day × history's split, so a market that sells into bids paces below one where buyers
    take listings.
  - **The finder ranks the 1,652 Tech I blueprints that aren't invention products or capital hulls.** Titans and
    supercarriers (groups 30, 659) sit outside the static data's capital filter and are left out by group.
  - **A row says whether its job cost is whole** (`costKnown`): false while the facility tax or the clone state (Alpha tax)
    isn't known, because `jobCostOf`'s total leaves them out; such a row is ranked before the missing part, never with it as 0.
  - **Known and left alone (Task 3 review)**: a sale's freight minimum is spread over a week at your share of the pace, not over the week's smaller sale when the slot makes less (minor). A site whose distance to Jita isn't known (`jitaJumps == null`) keeps ships home while "never haul ships to Jita" is on; the UI says "distance to Jita not known".
- **The tab** (`components/hustles/Industry.tsx`): sections in the address (`hustles/industry/<section>`), the last kept
  per browser (`jita-ledger:industry-section`); "Show for" (`jita-ledger:industry-show`) picks whose skills, clone, Jita
  fees, held stock and mining every figure uses, the main or an alt, falling back to the main without forgetting the kept
  one. Industry.tsx is the one file of the tab importing the alt store; `useIndustryChars` reads each alt's pulled copy and
  writes nothing.
- **Skills not read are not level 0, and a fee is shown only when it is known** (`IndustryChar.feeKnown`, `hasSkills`,
  `IndustryStart`). A main before its first sync has no `skills` at all (`emptyData` has no such key); an alt's pulled copy
  has `{}` until the cloud reads it. Either, taken as trained-nothing, gives "1" factory slot and the fee of an untrained
  character. So slots need skills with at least one level (`{}` counts as unread). The fee is known for the main when it
  types its own broker fee and sales tax (Settings' override), or its settings aren't filled from the character, or its
  skills are read; for an alt when its skills are read (`altFees` works its fee out from them). Otherwise it is "–" with
  when the skills come. The slots tiles show the number alone ("5") with "11 at most" in the note: "5 of 11" read as five
  in use. The page check asserts the empty ledger shows "–" for both, and a main with typed fees and no skills shows them.
- **An alt's Jita broker fee is at its read standings** (`altFees.ts`, 10 October 2026): Caldari State and Caldari Navy,
  raw, each floored at 0, exactly as the main's sync fills its settings. `altLedger` carries standing 0 for both, and the
  Research tab took an alt's fee from that (`researchChars.ts`), so an alt with standings read 2.10% at Broker Relations
  III where it pays 1.98% (the page case's Builder Alt). Both tabs now use `ratesAtStandings`. One whose standings aren't
  read pays as if it had none, and says so; one whose skills aren't read shows no fee. `altLedger`'s own zeros stay: an
  alt's Earned is worked out on them, and changing that moves the income check.
- **The `industry` doc** (`prefs.ts` `sanitizeIndustry`, synced; not in `prefs`, whose sanitizer would drop it on an
  older build's save): sites, the default site, where to sell, the home hub and its typed broker fee, freight routes, the
  industry share (10%), never haul ships to Jita (on), the ME/TE assumed (0/0, 8/0 or 10/20). An NPC station's site keeps
  no rigs and takes 0.25%; a structure's tax not typed stays null, never 0. A Worker a version behind refuses the doc and
  `refusedDoc` holds it back.
- **Seven Side hustles tabs**: the row is a container, seven columns from 1,040 px, four below, two on a phone with an odd
  last tab across the row, so none sits alone. 172 px a tab (the old minimum) fitted six at 1,440.

- **Build sites** (`industrySites.ts`, `IndustrySites.tsx`; the `industry` doc's `sites`). Three ways in: a quiet NPC
  station within 10 high-sec jumps of Jita (ESI's `/industry/systems` index, lowest first; a Factory, or a Laboratory for
  research: only 510 stations have one), a structure found by name (`FindStructure`, now `components/FindStructure.tsx`,
  shared with Reprocessing; it searches as the browser's login, the main), or a home typed by you (UALX-3 offered first).
  A site says its system, band, high-sec jumps from Jita and index; its kind, rigs (of its size, at most three) and tax
  are yours to type. An NPC station is 0.25% and takes no rigs. A tax not typed is an empty box and "–: type it from the
  Industry window", never 0%. A home with no structure ID holds nothing the app can read.
- **Freight** (`FREIGHT_PRESETS`, the doc's `freight`): a route is ISK a m³ of packaged volume, a share of the goods'
  value, and a minimum a contract. Brave Freight's three are offered with their source (Jita ↔ UALX-3 900 ISK a m³, 0.75%
  of a 105% collateral, 5 M minimum; Jita ↔ C-J6MT 1,150 with no minimum stated; UALX-3 ↔ C-J6MT 415 and 50 M) and none
  is used until picked. From a high-sec station within 10 jumps of Jita you carry it yourself, for no ISK (`legFor`).
- **A security not known is its own band** (`secBand` returns `'unknown'` for NaN, undefined or null; Task 2's review). Null-sec
  has the best rig multiplier, so a home typed as a system the map lacks must not take it: `rigFor` gives an unknown band no
  rig bonus, `siteFacts` carries it, and the sites table shows no security for it.
- **The scan's watch set** (`worker/src/scan.ts`, `src/data/industryTypes.json`; 1,858 types in stage 1: every Tech I
  product and its materials). Read with the morning scan whatever its candidate gate (one-sided, or NPC-sold in Jita), so
  the finder has a Jita book and history for them; one with no Jita order still gets no row, and the finder says "No Jita
  book this morning". They are appended after the trading candidates, so a run that hits the time budget drops them first.
  **Marked `watchOnly` on the stats, not the book** (a correction to the spec): `overScan` rebuilds a
  live book over the scan's for every watched item and carries only three notes, so a flag on the book would have been
  lost the first time a position got the item watched. The stats are replaced only by a browser scan's own history read, which keeps the flag (`keepWatchOnly`). Prospects, Busy markets and the planner (`judgeProspect`), the
  opportunity mail (it reads the flag from D1 itself, so an old browser's `watch` doc can't get one mailed), the Sniper
  (`findListing`, `findBid`) and Hub arbitrage (`scanBusiest`) leave them out, and so does `passesGate`, which the browser
  scan's book requests, Prospects' "most any item could swallow" and `coverage`'s checked, candidate and priced counts go through (Prospects would otherwise say "Scan again to widen the net" every day). Settings → Market scan shows the run's `watchOnly` apart and counts `kept` without them. Left alone on
  purpose: Reprocessing's scanner and Freelance read books only (more items valued is fine), and `mergeLiveBooks` only
  lays books over stats. A browser's own quick or deep scan judges what it samples as before.
- **The NPC row** (`industry_npc`, migration 0018; `worker/src/industryNpc.ts`; `GET /v1/industry/npc`): each run keeps
  the NPC sellers of the 1,673 Tech I blueprints (365-day sell orders anywhere in The Forge), the lowest price and every
  station, cheapest first, whatever the gate. `complete` when no page failed, with the pages missed beside. D1 keeps the
  latest complete row and any newer partial one, and only those two; the browser reads the complete one with the partial's
  newer sellers on top, and says "NPCs don't sell it in The Forge" only after a complete read.
