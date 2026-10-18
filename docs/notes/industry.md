# Industry

Decisions worth not undoing. The Industry side hustle (Side hustles → Industry): what to build, where, and what it pays;
the static-data bundle it rests on; the rules for jobs, research, copying and invention; build sites; the finder; home
prices from Goonmetrics; the ladder. The spec is `docs/superpowers/specs/2026-10-10-industry-design.md`; the research
behind it `.playwright-mcp/research/bpo/report.md` (gitignored). Stage 1 (what to build and how to start) is built by
`docs/superpowers/plans/2026-10-10-industry-stage-1.md`.

Split on 19 October 2026 to keep each file's notes under the instruction budget (CLAUDE.md, "Notes by topic"): this note
keeps stage 1's bundle, rules, tab, synced doc, watch set and NPC row; stage 1's build sites, finder, ladder and Tech II
are in industry-build.md, its Goonmetrics home prices with stage 4 (home markets) in industry-home.md, stage 2
(blueprints and jobs) in industry-jobs.md, and stage 3 (copies to sell) in industry-copy-round.md (the cloud's count)
and industry-copies.md (the Copies section and your copy contracts).

- **The bundle comes from CCP's static data, not ESI** (`scripts/industry-bundle.mjs`, build 3569502, 2 October 2026;
  `SDE_ZIP=<zip>` reuses a download). ESI serves no blueprints, rigs, structure bonuses or station services. Three files:
  `src/data/industry.json` (the tab's chunk: 2,693 blueprints, 5,670 types in 602 named groups, 106 rigs, 2,305 stations,
  57 skills; 1,056 KB, 145 KB gzipped, against a budget of 1.2 MB and 160 KB), `industryEiv.json` (every published blueprint's ME 0
  materials, 4,039, for stage 2's first-sight EIV: nothing reads it in stage 1), and `industryTypes.json` (the cloud's watch
  set, 2,959 types: every Tech I and Tech II product, their materials and the datacores (1,858 before Tech II, 2,916 before
  Planets added every planetary good), and the 1,673 blueprints whose NPC sellers the scan keeps).
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
- **The scan's watch set** (`worker/src/scan.ts`, `src/data/industryTypes.json`; 2,959 types: every Tech I and Tech II
  product, their materials, the datacores and every planetary good (1,858 before Tech II, 2,916 before Planets)). Read with the morning scan whatever its candidate gate (one-sided, or NPC-sold in Jita), so
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
- **The first real reads after stage 1 shipped** (main b82b56e, deployed 10 October 2026 about 21:50 UTC; read from D1 with
  SELECTs only):
  - **Goonmetrics**: the first `37` round after the deploy (10 October, 22:37:50 UTC) read both hubs in one go, 2,916 types
    each. UALX-3's 1st Byzantigoon: 1,808 with a sell price, 901 with a buy, 2,432 with a weekly movement, a 160 KB row;
    C-J6MT: 2,230, 1,500 and 2,520, 166 KB. A read a minute into the round showed only UALX-3: both rows carry the round's
    start as `at`, and the second hub's lands a minute or so later.
  - **The morning scan with the watch set** (11 October, 11:25:40 to 11:27:33 UTC, 113 s): 398 pages, none failed; 15,344
    items checked, 13,479 kept, **245 watch-only** (the watch set's types that weren't already candidates; the rest pass the
    gate anyway); history 15,192 fetched, 5 failed. `industry_npc`: one complete row, **1,207 of the 1,673 Tech I
    blueprints** with NPC sellers somewhere in The Forge, 190 KB.
