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
  set, 2,916 types: every Tech I and Tech II product, their materials and the datacores (1,858 before Tech II), and the 1,673
  blueprints whose NPC sellers the scan keeps).
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
- **The scan's watch set** (`worker/src/scan.ts`, `src/data/industryTypes.json`; 2,916 types: every Tech I and Tech II
  product, their materials and the datacores (1,858 before Tech II)). Read with the morning scan whatever its candidate gate (one-sided, or NPC-sold in Jita), so
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
- **The finder** (`industryFinder.ts`, `IndustryBuild.tsx`, `IndustryDetail.tsx`): every Tech I blueprint (1,652) ranked
  for the default site at the shown character's skills, fees and clone, by profit a day for one factory slot; first on the
  morning's books, then the top 40 rows' products and materials on live ones (the Loyalty pattern), each row saying which.
  It waits, saying what for, until a site, the skills (an empty or absent skills doc is not level 0), the scan, ESI's indices
  and CCP's adjusted prices are in; nothing is ranked on a guess. Books are everyone else's (`othersBook`). A row not priced
  is counted by why ("1,650 have no Jita book this morning"), never shown at 0. Decisions (site, share, ships switch, ME/TE
  assumed) are the synced doc's; kind, "Can build now", "BPO up to", the sort and the open row are this browser's
  (`jita-ledger:industry-finder`, `jita-ledger:industry-open`).
- **A site whose facility tax isn't typed is ranked before it** (the user's own case, a home they can't dock in): the head
  reads "Profit a day, before the facility tax" and each row "each 1% of tax: X a day". **A clone state not read leaves the
  0.25% Alpha tax out the same way** (`Row.costKnown`): the count line, each row and the detail's tile say so.
- **The original's price**: NPCs' in The Forge from the morning's NPC row ("1.25 M ISK at <station> (and 1 more)"); not
  there after a complete read, "NPCs don't sell it in The Forge; CCP's base price X" with no payback; after a partial read
  alone, "No NPC seller found (this morning's read missed N pages)". The cloud off, a version behind (404) or failing says
  which, never that NPCs don't sell it. On asking, a row reads the seven regions the research found NPCs seeding originals
  in (Lonetrek, Domain, Genesis, Syndicate, Outer Ring, Pure Blind, Great Wildlands).
- **A station is said by its name, else by its system, never "Station #id"** (`stationSaid`, `useStationSaid`): while the
  name is read, the system's name alone; when ESI answered without it, "A station in Itamo". `nameReader.ts` (pure, tested)
  keeps only a definite answer (the ID answered without, or refused with a 400/404); a throw, a 5xx or being offline caches
  nothing, so a later visit asks again, and each single-ID retry is shared in flight (a refused batch is asked one by one).
- **"Never haul ships to Jita" with a high-sec site whose distance to Jita isn't known** keeps the ships home, and the
  count line says the distance isn't known; for a null-sec site the band is the reason and nothing more is said.
- **Mined materials**: "Which ore gives the most?" loads CCP's reprocessing table (481 KB, only then) and the base ores'
  volumes, and names the ore giving the most of each mineral a m³ at the character's yield in Jita 4-4; Mining's Best ore is
  linked for where it pays most.
- **Home prices from Goonmetrics** (`src/lib/homeMarket.ts`, `worker/src/goonmetrics.ts`, migration 0019 `home_prices`,
  `GET /v1/home/prices?hub=`). Goonmetrics is a Goonswarm tool ("Goonmetrics © GARPA 2012–2026") that gathers data from CCP
  and members' client uploads; it publishes no terms, key or limit, sends no CORS header (only the cloud can read it) and no
  cache headers. So the cloud reads it gently: the watch set (`industryTypes.json`), 50 types a call, 1.5 s apart, every
  six hours a hub, after the alts' hourly read on the `37` cron (no new cron: one took 26 minutes to first fire), with a
  User-Agent naming the project only. A hub's read is one row; a read that fails keeps the last good one, three failed
  calls in a row end the round, and it isn't a watched job (as Abyss Tracker: someone else's site, the tab says how old
  its figures are). `GOONMETRICS_ON = false` switches it off if its authors object; the route then says so and the tab
  says "Goonmetrics isn't read". **Not known is never 0**: `weekly_movement` −1.0 is null, and a side with 0.00 and 0
  listed is none. The hubs are UALX-3's 1st Byzantigoon (the Imperium's market) and C-J6MT; 1DQ1-A is left out (almost
  nothing listed). Brave's own UALX-3 Keepstar, Mothership Bellicose, isn't tracked by Goonmetrics and joins as a hub in
  stage 4, once a character of the user's can see it.
- **The browser holds a hub's read like the NPC row** (`useHomePrices`, `homeHoldMs`): shared in flight, kept until the
  cloud's next refresh could have replaced it (its `at` + 6 h + 10 minutes) or 15 minutes, whichever is sooner, and dropped
  when the cloud is switched off, on a different login and on "Delete all data". A hub just picked never shows the last
  hub's prices for a render (the state is kept with its hub).
- **Selling at home** (the finder's Home hub, Sell at Jita / the hub / Either): Goonmetrics' best sell less a tick, checked
  against the home region's 14 days of highs once its history is read (`useHomeHistory`: Tenerifis or Insmother, only the
  top 40 rows sold at home), after your sales tax and the hub's broker fee. Its pace is that history's typical day split by
  `buyerShare`, or, before it's read, Goonmetrics' weekly movement ÷ 7 at an even split, said so on the row's sale. The
  broker fee is typed (a structure's owner sets it; ESI doesn't say): blank, the finder ranks before it, the head says
  "Profit a day, before the broker fee at UALX-3" and each row what each 1% costs a day, the row's profit a unit and the
  detail's profit tile say so too, never a fee of 0% shown as if typed. Home prices are said with how old
  they are, "older than a day" past 24 hours; off, not read yet, failing, switched off or the cloud a version behind each
  say which, and nothing is sold at home on prices nobody read (Either falls back to Jita). A row that can sell at home isn't
  "nowhere it may be sold" for its Jita leg missing: the count line gives every place's own reason ("no freight route to
  Jita; not read at UALX-3 yet"), and "No freight route between the site and Jita" is said only for a material nothing else supplies.

- **The ladder on Start** (`src/lib/industryLadder.ts`, `IndustryStart.tsx`): seven rungs, the spec's, each with the skills
  it needs (`SkillNeeds` at the shown character's pilot), what it opens, how many blueprints, whether an Alpha can climb it
  and what it pays now from the finder's own rows at its site. **Levels the spec left blank, decided here**: Industry I and
  Mass Production I; Laboratory Operation, Metallurgy and Research I; Mass Production V, Advanced Mass Production I,
  Laboratory Operation V, Advanced Laboratory Operation I; Science I; Science V; Industry V, Advanced Industry V and Capital
  Ship Construction **III** (the 29 capital hulls ask for III, IV, V or Advanced Capital Ship Construction: at I the rung
  would open none). Prerequisites are the skill rows' "Needs X first", from ESI.
  - **"Needs Omega" comes from CCP's caps** (`alphaCaps.ts`) for any Alpha, main or alt: an alt's pilot marks only skills
    trained past their cap, so an Alpha alt at Mass Production III would otherwise be promised IV's training time. The
    derivation gives rungs 2, 3, 6 and 7, as the spec says (tested). A row past the cap says "Alpha uses III: Omega opens V"
    or "Alpha can't use it: Omega opens it" (`SkillNeeds`' `beyond`), never "Trained". Clone not read: "Clone state not
    read: an Alpha can't use …", never "Alpha", training times at Omega's speed. An Alpha's slots and counts are at its
    usable levels.
  - **Skills not read are never level 0**: with no skills (a main before its first sync, an alt's `{}`) the ladder judges
    nothing: no "You're here", no counts, no prices, and each rung lists what it asks bare ("Asks for Industry I, Mass
    Production I. Lost Alt's levels aren't read, so none is counted as trained."), with `skillsWhy` over it. The page case
    checks a refused alt and a main with no skills.
  - **Where you stand is by skills alone** ("Your blueprints and jobs aren't read here yet", until stage 2), and Build at
    home, which has no skill, by a structure among the sites added. "You're here" is the last of an unbroken run of met
    rungs from the first; one met past a gap says "Your skills cover it" without being where you stand.
  - **Counts** are the bundle's skill lists against the character's usable levels raised to the rung's: with no skills,
    766 of the 1,652 Tech I items built, 1,229 researched, 1,633 copied, 12 of the 29 capital hulls (build 3569502).
  - **Pays now** is the finder's rows at its site: rung 1 the best three a slot makes a day; rung 2 the ten best priced
    again at ME 0 and at ME 10 / TE 20, the best three by ME 10 with the gain; rung 3 what the character's factory slots and
    eleven make, one item a slot. Rungs 4, 5 and 7 say why there's nothing to price (copies and capitals sell on contracts;
    a structure's tax, rigs and broker fee aren't known until docked). Nothing ranked yet says the finder's own waiting
    words (a missing site says to add one on the Build tab, since "below" is wrong on Start), or "Working out what pays…".
  - **A figure that leaves something out says so** (`beforeSaid`, from `Row.costKnown`, `taxPerPct`, `brokerPerPct`): the
    header of rungs 1 and 2 and rung 3's closing line name the facility tax or a hub's broker fee not typed and the Alpha tax
    when the clone isn't read, as Build's rows do. The rows are priced at the character's own skills while "opened" by the
    rung's: a rung's profit is what its rows make today for this character, not for one who has just reached the rung.
- **Tech II through invention** (`industryRank.ts`: `inventionLab`, `inventionCosts`, `inventionBlueprints`; `labFor` in
  industrySites.ts; the finder's Tech choice). The 1,012 invention products that aren't capital hulls are ranked beside Tech
  I: attempts = 1 / chance at the builder's skills (the sciences a thirtieth a level, the encryption skill, found by its name,
  a fortieth; Capital Ship Construction and Outpost Construction aren't sciences), each attempt a one-run Tech I copy and
  its datacores (sourced like materials), invention's job on 2% of the Tech II EIV an attempt and the copy's on 2% of the
  Tech I's, at the lab (`labFor`: the site, else the nearest Laboratory); then built at **ME 2 / TE 4, whatever the finder
  assumes**, a job no longer than the copy's runs (one for ships and rigs, ten for most modules). **Checked to the ISK on
  EVE Ref's pump II** (9 October 2026, its own prices): materials 55,328,908.30, the job 3,880,379, datacores 1,341,176.47 and
  invention jobs 206,717.19 a copy (EVE Ref's 1,547,893.66 together), the copies 5,593.23 at a copying index of 0 (EVE Ref
  leaves them out of its invention figure; the app counts them), profit 1,451,914.04 less the copies a unit listed one tick
  under 65,270,000.
  - **One factory slot fed by one lab slot**: a row makes no more a day than one lab slot invents for, copying included
    ("the lab slot inventing for it limits it"). The Cerberus (a two-day build, 26% a try) makes what the lab gives,
    not half a hull a day.
  - **Its original is the Tech I one**, "to copy from", with payback on it; its detail has the invention's tiles and no
    level table ("A Tech II copy can't be researched"), and steps that copy and invent before building.
  - **Datacores held count wherever they're held** (an R&D agent's sit at its station), in start-up and the list.
  - **Not modelled**, and said: decryptors (they change chance, runs, ME and TE), and reactions (what they make is bought).
  - **Not known stays not known**: skills not read give no chance (null, "–", said; never computed at level 0), no
    Laboratory, no index at the lab's system, a datacore nobody lists, no adjusted price and no freight route from Jita for
    the datacores (`noRoute`, as for materials) each leave the row unpriced with its reason (`Missing` `noInvention`). A lab
    tax not typed, or an Alpha tax whose clone state isn't read, is left out of the invention's jobs and the copies and said
    (`Row.costKnown` covers them, `taxPerPct` adds the lab's 1%, the detail's `data-industry="invention-left-out"` note).
  - **A slot's day under one unit is said as time between** ("about one every 2 days", `everyDays`, as Task 6's cell does),
    for what sells and for what the row makes, so a Tech II ship's half a hull a day reads "<1 / <1".
  - **The watch set grew to 2,916** (Tech II products, their materials, the datacores): the morning scan reads up to 1,058
    more types watch-only, Goonmetrics 59 calls a hub instead of 38.
  - **Rung 6's "pays now"** is the Tech II rows the character could build with the item's own sciences and encryption skill,
    at its sciences' chance now, and only when the rung is met and no row shown lacks a skill (as the other rungs): otherwise
    "Not buildable yet. Once <whose> skills cover this, these would make …, priced at <whose> skills today".
  - **Fix round 1 (review of Task 8)**: the shopping list buys whole units (a datacore's a day is an expected value, 6.92, and
    the clipboard must match the list; start-up keeps the expected value). A lab-limited row builds only what the lab invents
    for, so its tax a day and the week's freight basis scale by `makes / made` (the Cerberus at a Raitaru with tax not typed
    read 129,258 ISK a day where 45,783 is right). **EVE needs each of the two sciences and the encryption skill at I to
    invent at all**: an untrained one is worked out at I, listed as needed ("Needs X I to invent: at I each"), and counts in
    the row's `lacking`, so rung 6 and Can build now never call it buildable. `inventedFrom` takes the lowest blueprint ID where
    several Tech I blueprints invent one product (Capital Hull Repairer II: the Tech I, not the meta Capital IEF Compact). The
    detail says datacores held anywhere apart from what's held at the site, and a Tech II row unpriced says why on the count line.
- **Final whole-branch review (10 October 2026): seven fixes.**
  - **A Goonmetrics round stopped by three failures in a row keeps what came and stamps the hub** (`refreshHomePrices`'s `save`).
    It used to return at once on the third failure, throwing away the hub's batches already read and leaving it unstamped. The
    reviewer's probe: a host that answers 10 calls and then sends 429 got 13 calls an hour, 312 a day, with `home_prices` empty
    and C-J6MT never reached; at a 50-call limit that is about 1,270 a day, against the user's condition of a hub every six
    hours, 1.5 s apart, 50 types a call. Now the batches of the current hub that came back are merged over its last good row
    (pruned to `types`) and the hub stamped `partial`; a hub none of whose calls came back is left unstamped (the site is down:
    three calls an hour at most), and hubs not reached stay as they were. Tested: the same host over 24 hourly rounds makes 4
    rounds of 13 calls, with the planted old rule failing all three assertions.
  - **"Each 1% of tax costs X a day" is on the units sold** (`taxPerPct`, `labTaxed`). Profit a day charges costs on `day.units`,
    but the line used units made: the pump row at a 2% share (16.2 sold of 65 made) said 1,575,904 where typing 1% lowers the
    profit by 393,364. Both the site's and the lab's part now use the units sold, as `brokerPerPct` already did, so the line equals
    profit(untyped) − profit(1%) to the ISK.
  - **Tech II start-up and the shopping list are one job's, datacores included** (`Invention.jobDatacores`). They held a full
    job's materials but a day's datacores at the lab's pace: the lab-limited Cerberus row listed 6 of each datacore, while one
    attempt needs 8 and a success takes 28.2 on average, so Copy for Multibuy could not start one invention. Now the datacores
    are whole attempts for the copies the job needs: ceil(runs ÷ the copy's runs) successes, ceil(successes × attempts) attempts
    (at least one), times a datacore's count an attempt. The pump: 3 attempts, 9 of each (was 6.92). The a-day figures
    (`datacores`) still size the weekly sourcing; the detail says "one job's materials, and the datacores for the attempts it
    takes on average". Tech I is unchanged.
  - **The finder prices at usable levels** (`finderSkills` in industryLadder.ts): an Alpha that was once Omega was given Omega's
    job times and "Can build now". Unread skills (absent, null, `{}`) stay undefined, never a map of zeros.
  - **The "One job a day" note** counts the lab too: the slot could take at most `min(slot, labPerDay)`, and the note shows only
    when that is 5% over what's made (it read "could take 2.7 a day" beside "one lab slot inventing for 1.3 a day"). `{0 && …}`
    would have drawn a "0" for a Tech II row without the note; it is `> 0` now.
  - FindStructure prints a negative security with the typographic minus (`MINUS`), as `secText` does; CLAUDE.md lists `homeMarket`
    and `industryRank` among the modules the Worker imports; `nameReader` is in this note's `paths:`.
  - **Left as a limit** (limits.md): the row doesn't record which types a cut-short round asked for, so a type in a batch it
    never reached reads as no price there, and a round always starts from the first batch. No read has been cut short yet.

## Stage 2: blueprints and jobs

Decisions worth not undoing (spec `docs/superpowers/specs/2026-10-10-industry-design.md`, plan `docs/superpowers/plans/2026-10-10-industry-stage-2.md`). Task 9A: the data layer on the browser's side.

- **Jobs are records, blueprints a document** (kind `jobs` by job ID, every status, kept past ESI's 90 days; the `blueprints` doc; `JobRecord`, `BlueprintsDoc` in `industryTrack.ts`). The row shapes are ESI's OpenAPI at 2026-08-18; the Worker reads at 2025-08-26 and the two schemas for these routes are identical. Neither has been seen with a real login yet: the first real read by the browser and by the Worker is the check of the data; record here what it shows.
- **First sight** (`FIRST_SIGHT_MS` 90 minutes, `firstSight`): only a job first seen while active gets what can only be known then (its blueprint's ME and TE as last read for its item ID, the system, that system's index for its activity, the EIV a run at that hour's prices). Invention's EIV is on the Tech II blueprint it makes (`eivBlueprintOf`), as `inventionCost` charges. Anything not read is null, never 0.
- **Every writer merges** (`mergeJob`): first-sight fields are never dropped, the earliest `seenAt` wins, ESI's own fields come from the record with the later status (delivered, cancelled or reverted over ready over active or paused; a tie goes to the read being written), because a read time on every record would push every job every sync. A pull merges too (`applyPulled`), since a record a device built after the job ended must not erase the first-sight fields another holds.
- **Units a run** are in `src/data/industryEiv.json` as `out: { blueprint: [product, perRun] }`, from the same SDE build (3569502): ESI's job doesn't say how many units it made and built-and-sold claims sales by them. The file went from the eiv alone to 340.0 KB (70.4 KB gzipped) for 4,039 blueprints; `industry.json` and `industryTypes.json` came out byte-identical. The bundle script's local is `perRunOf` (`out` is already the main bundle's).
- **One read of the main's jobs** (`include_completed=true`) feeds both `meta.industry` (To do's jobs to deliver, shape and key unchanged) and the records. `meta.jobsRead` marks that jobs were read at all (the main's sync, an alt's sheet): a read with no jobs writes no record, and the stage-1 `meta.industry` doesn't count, since every older ledger has one.
- **First sight's blueprint and time**: the blueprint is looked up in the read just taken, else in the doc held before it (`bpFrom`): whether ESI lists a blueprint while a job has it installed isn't known. The sighting keeps its own time in `first.at`, which `checkable` judges by, since the earliest `seenAt` may be a sighting of the job paused.
- **The blueprints document has `names`**: the containers, ships and structures its rows sit in, read once per new place by the reader's own login (`/assets/names`, `/universe/structures`), `''` when it has none.
  **A container or ship is told from a structure by the character's own assets, never by the size of its ID** (review of Task 9A, 11 October 2026): asset item IDs are 13 digits like structures' (every `item_id` in the user's asset-safety read, 155 rows in `.playwright-mcp/safety-rows.json`, is 1.044e12 to 1.056e12, and their "Equipment" container is 1044519007308), so the first rule (`id >= 1e12` is a structure) sent every container to `/universe/structures`, which refused, wrote `''` and never asked `/assets/names`. Now `placesToName(doc, itemIds)` takes the item IDs of the reader's own assets read: a place among them is named by `/assets/names`, a 13-digit one that isn't is a structure, and with no assets read nothing is classified or marked named, so it is asked again next time. Not by `location_flag`: a blueprint in an asset-safety wrap is `Hangar` at the wrap's 13-digit item ID. The doc keeps the containers and ships found as `items`, so the tab can say container or structure without working it out again; the Worker's reader calls the same function with its own assets read. `isStructureId` stays for a job's facility, which is only ever a station or a structure.
- **A new record kind and a Worker a version behind** (`refusedKind`): as `refusedDoc`, and the push's chunk loop now carries on past a chunk that was all a refused kind. The Worker's `RECORD_KINDS` gets `jobs` in Task 9B; until then it answers 400 and the jobs wait.
- **The cloud's reads** (Task 9B, 11 October 2026; `worker/src/industryJobs.ts`). The main's jobs are read by the hourly archive (`:07`); its
  blueprints are its browser's to read, so the archive's first sight takes ME and TE from the `blueprints` doc the browser pushed. An alt's
  blueprints (the doc) and jobs (records) are read by its hourly sheet (`:37`), each only with its permission, filed under the alt, so the
  `sheet` job's `lastOk` dates every one of an alt's industry reads (the archive reads no alt's jobs). A read with no jobs writes no record, so
  the alt's meta doc carries `jobsRead: true` once one happened: absent is "Not read yet", never "No jobs"; a login without the permission is
  not asked and gets no mark; a failed read leaves what was held and doesn't fail the sheet. The sheet passes the doc held before the read
  (`held`) to first sight, for a blueprint the read doesn't list. **Places are classified by the alt's own asset item IDs, from the archive's
  assets read of the same hourly run** (`ArchiveResult.itemIds`, an alt's only, stripped from the job's detail; `readSheet`'s `extra.itemIds`),
  as the browser's sync does: asset item IDs are 13 digits like structures', so a size rule (≥ 1e12 is a structure) would look a container up as a
  structure. When the archive read no assets (no permission, or it failed, in which case `readAlt` throws before the sheet) the sheet gets none and
  classifies nothing that hour: nothing named, nothing marked, no structure asked about. The tests use real-range IDs (container
  1044519007308, structure 1046664001931) and fail with the size rule planted. **The push merges `jobs` and only `jobs`** (`mergeJob` against
  D1's record, 90 IDs at a time); the other kinds are written as pushed. Pinned in `scripts/check-worker.mjs`: filed under the alt with the main's
  rows untouched, read again unchanged pushes nothing (no revision, no names asked again), a failed read keeps what's held, no permission no
  mark, removed mid-read nothing back, and each rule was planted wrong and failed.
