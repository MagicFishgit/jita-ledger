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
  - **Where you stand is by skills alone**, and Build at home, which has no skill, by a structure among the sites added.
    (Stage 2 changed what Start *says*, never where you stand: the reads annotate it, see Stage 2 below.) "You're here" is the last of an unbroken run of met
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
    never reached reads as no price there, and a round always starts from the first batch. No read has been cut short yet. (Left for stage 4 and done there: Task 18E below.)

## Stage 2: blueprints and jobs

Decisions worth not undoing (spec `docs/superpowers/specs/2026-10-10-industry-design.md`, plan `docs/superpowers/plans/2026-10-10-industry-stage-2.md`). Task 9A: the data layer on the browser's side.

- **Jobs are records, blueprints a document** (kind `jobs` by job ID, every status, kept past ESI's 90 days; the `blueprints` doc; `JobRecord`, `BlueprintsDoc` in `industryTrack.ts`). The row shapes are ESI's OpenAPI at 2026-08-18; the Worker reads at 2025-08-26 and the two schemas for these routes are identical. Neither has been seen with a real login yet: the first real read by the browser and by the Worker is the check of the data; record here what it shows.
  - **Check on the first real reads: does every fee entry of a job carry `industry_job_id`?** `builtAndSold` charged only the named
    journal entries once any named a job and ignored ESI's `cost`, while the job check takes `cost` as the whole fee (the final
    review, 11 October 2026: only the facility tax tagged, the installation fee not, charged −10,000 of 1,000,000, said nothing).
    Now, when `cost` is known and the named entries fall more than 1 ISK short of it, `cost` is charged and the job counted
    (`feePartial`; Results says "the journal named only part of N jobs' fees"). If the first real journal shows every entry named,
    the clause never fires; if some are not, that note says how often.
- **First sight** (`FIRST_SIGHT_MS` 90 minutes, `firstSight`): only a job first seen while active gets what can only be known then (its blueprint's ME and TE as last read for its item ID, the system, that system's index for its activity, the EIV a run at that hour's prices). Invention's EIV is on the Tech II blueprint it makes (`eivBlueprintOf`), as `inventionCost` charges. Anything not read is null, never 0.
- **Every writer merges** (`mergeJob`): first-sight fields are never dropped, the earliest `seenAt` wins, ESI's own fields come from the record with the later status (delivered, cancelled or reverted over ready over active or paused; a tie goes to the read being written), because a read time on every record would push every job every sync. A pull merges too (`applyPulled`), since a record a device built after the job ended must not erase the first-sight fields another holds.
- **Units a run** are in `src/data/industryEiv.json` as `out: { blueprint: [product, perRun] }`, from the same SDE build (3569502): ESI's job doesn't say how many units it made and built-and-sold claims sales by them. The file went from the eiv alone to 340.0 KB (70.4 KB gzipped) for 4,039 blueprints; `industry.json` and `industryTypes.json` came out byte-identical. The bundle script's local is `perRunOf` (`out` is already the main bundle's).
- **One read of the main's jobs** (`include_completed=true`) feeds both `meta.industry` (To do's jobs to deliver, shape and key unchanged) and the records. `meta.jobsRead` marks that jobs were read at all (the main's sync, an alt's sheet): a read with no jobs writes no record, and the stage-1 `meta.industry` doesn't count, since every older ledger has one.
- **First sight's blueprint and time**: the blueprint is looked up in the read just taken, else in the doc held before it (`bpFrom`). ESI does list a blueprint while a job runs on it (`location_flag` "Hangar"; the main's blueprints doc, 11 October 2026). The sighting keeps its own time in `first.at`, which `checkable` judges by, since the earliest `seenAt` may be a sighting of the job paused.
  **A running job's missing levels are filled later** (follow-up, 11 October 2026). The main's five active research jobs (activities 3 and 4, started 9 October) were first seen by the cloud's 13:07 archive, before its browser pushed the first `blueprints` doc (13:58): their `first` had `systemId`, `index` and `eiv` but `me: null, te: null`, and nothing filled them, since first sight runs only for jobs not held and `mergeJob` kept the earliest `first` whole. A blueprint's ME and TE don't change while a job runs on it (research and copying apply at delivery), so while a held job is `active` or `paused` and its `first` lacks `me` or `te`, `readJobs` (both writers) fills just those two from `bpFrom`'s lookup; `systemId`, `index`, `eiv` and `at` stay the first sight's. Never once it is ready, delivered, cancelled or reverted (the level may have moved). `mergeJob` also keeps a filled `me`/`te` against the other writer's null ones, in either order. A read with nothing to fill returns the held record, so nothing is pushed.
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

- **Blueprints & jobs** (`industryOwned.ts` pure, `IndustryOwned.tsx`; Task 10A, 11 October 2026; section key `blueprints`).
  Your characters (slots in use of the slots skills give, jobs ready, originals, copies, the first rung's missing skills with
  their training time, `Needs Omega` for an Alpha), the filter's tiles, one blueprint row a kind and character, every job
  running or ready and those finished in 30 days. The All-characters filter is Mining's rule (`jita-ledger:industry-char`):
  picking in it lets go of Show for; a kept character off the roster falls back to All without being forgotten.
  - **Read states, never zeros** (`Read<T>`, `charRows`): not read yet, login lacking the permission, handed over without it,
    lost. Read data wins over a lost login and says it is as the cloud last read it (`lostSaid`, now in `pilot.ts` for Research
    and Industry). Totals count only characters read and say how many. A stage-1 `meta.industry` is not a jobs read.
  - **Slots in use count ready jobs** (correction 13): a finished job is said to hold its slot until delivered (limits.md).
  - **Each blueprint row is worked out at its own character's** usable skills, clone, Jita fees and mining (`charInput`), with
    every character's open orders off the books (`useFinder`'s `own`); the finder's inputs come from the shown character, else
    the first with skills read. A held copy is built as it is and never invented again (`RowInput.held`, correction 12).
  - **Where a blueprint sits** (`placeSaid`): a station by ESI's name; a name in the doc as it is; asset item IDs are 13 digits
    like structures', so a place in the doc's `items` is a container or ship ("you haven't named" / "<name> hasn't named" with
    `''`, else "not named yet"), a place not in `items` with `''` is a structure its login can't see, and one neither named nor
    in `items` is "a container, ship or structure (not named yet)". Jobs only run in stations or structures. The page case
    holds a container at 1044519007308.
  - **Next research** is the level table's step at the lab (`nextResearch`): ME to 10, then TE to 20; a copy can't be
    researched; no Laboratory reached gives the time and no price.
  - **Review fixes (11 October 2026).** A job's place is its own rule (`jobPlaceSaid`): a station by ESI, a structure by the blueprints
    doc's name, else the main's sync's (`meta.industry.places`), else "a structure in <system>" from `first.systemId`; never a
    container. Types the bundle lacks (1,346 published blueprints) are named by `useEnsureNames`, "…" while it looks. The Jobs
    ready tile filters the running table (`useTileFilter`). Slots with jobs not read say "– of 5 in use"; the slot and Copies
    tiles say how many characters they count (`slotsRead`); an unpriced row says Build's reason (`MISSING_SAID`) and "N to
    train". The page case plants an Alpha alt and a figure of Builder Alt's to catch a row priced at the shown character's input.
- **Start reads what's held and run** (Task 10B; correction 14: annotate, never move). "You're here" stays by skills, so a
  character with the skills who never ran a job isn't moved down. The `here` sentence adds what the reads show ("You hold 3
  originals and 1 copy, and ran 5 jobs in the last 90 days.") or why they aren't (`readsWhy`: one sentence where jobs and
  blueprints are alike, else both; the same words `charRows` uses), and with skills unread it still says what's held. Each rung
  adds `rungDone`: jobs of its activity in the last `RUNG_DONE_DAYS` (90, ESI's own span, so the figure doesn't grow with the
  records kept; cancelled and reverted not counted), capitals told from rung 1's by the product's kind; research adds originals
  researched, copying the copies held. More slots and Build at home have none: the slot tiles say "N in use (running, or
  finished and not delivered)" instead (a finished job holds its slot until delivered: the forum reports in the plan's
  correction 13, checked in game after shipping).
- **The Tech II chance tile** writes levels in Roman numerals and each skill once (carried item 2 of stage 1): "Needs
  Hydromagnetic Physics I, Nanite Engineering I and Amarr Encryption Methods I to invent; worked out at I", then only the
  skills it isn't already naming, at their level. It read "Hydromagnetic Physics 1" and repeated the skills after "at I each".
  The page check fails an Arabic level in the tile.
- **The Blueprints page is on the document** (one reader: the sync's `readBlueprintsNow`). It shows the stored `blueprints`
  doc with `meta.blueprintsAt` ("read 10 min ago") and reads only on its button, which reads the assets first when that
  permission is held (their item IDs tell a container or ship from a structure: all are 13 digits) and passes them, or null
  without; the page and the tab read the same doc. A place is `placeSaid`'s words capitalized, stations by ESI's names; the
  first version said every container "A station". `blueprints?type=TYPE` (the Industry tab's "Price for selling") shows that
  blueprint's kinds alone with a way back to all.
- **A blueprints read lands only if no read that started later has** (`readLands` in industryTrack.ts; the 10B review). Both
  writers, the sync and the Blueprints page's button, stamp `meta.blueprintsAt` with when their read *started* and write the doc
  and that time only when the stored one isn't newer. The sync's final `update` ran seconds after its read (jobs, research and
  more come between) and wrote the doc and time over a Read made in that gap, the time moving backwards; the page's write had no
  guard against a newer sync or a pulled doc. The sync reads with `getData().blueprints` as `prev`, not its snapshot, and the
  page drops its write when the ledger was wiped meanwhile (`dataGeneration`). The page case holds the sync's jobs read open
  while a Read runs and asserts the Read's doc and time survive (the guard removed: the sync's older doc wins).
- **`blueprintsAt` rides `meta`, the doc is its own document** (kept so: an `at` inside the doc would rewrite an alt's doc every
  hour, the R&D lesson). With the Worker a version behind (`refusedDoc` holds the doc back) another device can therefore show a
  newer time over an older doc until the doc lands; the time is the main's last read, not a proof of what the cloud holds.
- **Start says a refused alt's reads as the cloud's last** (`lostSaid`): the reads line, each rung's line and "in use" carry "as
  the cloud last read it", as Blueprints & jobs does. `?type=` for a kind no longer held says "You hold none of X now".

- **The job check** (Task 11, 11 October 2026; `jobCheck`, `jobCostFor`, `jobPlace` in industryTrack.ts; the finished jobs' Checked column).
  The app's cost for a job, from what was kept at first sight (the index and the EIV a run, a blueprint's ME and TE for research) and
  where it ran, against ESI's `cost`; said when more than `CHECK_TOLERANCE` (1%) apart, with the parts (index, bonuses, facility
  tax, SCC, Alpha tax) in the tip. Where it ran: an NPC station by its own 0.25%; a structure only when it is one of your build
  sites (its kind, rigs and typed tax); any other structure isn't known (a job's place is a station or a structure, never a
  container). Every reason it can't be checked is said, never a match assumed: not modelled (reactions, reverse engineering),
  first seen after it ended or more than 90 minutes after it started (`checkable`), an input not kept, not one of your sites, the
  facility tax not typed, the clone state not read (the Alpha tax may be in it), ESI gives no cost. Checked on EVE Ref's own job
  (65 pumps, an Azbel with the L-Set rig, null-sec): 17,213,916, to the ISK.
- **The measured facility tax** (`measuredTax`, `measuredBySite`; the site's Facility tax cell). For a manufacturing job at one of
  your structure sites with the clone state known: (ESI's cost − the base × (index × bonuses + SCC + Alpha tax)) ÷ the base, to
  0.01%. Offered beside the typed tax with **Use this** and never written by itself; when the typed tax already agrees it says the
  job paid the same. Any character's newest job there that measures, with whose it was. Not measured where it can't be, each with
  its reason: another activity, an NPC station or a structure that isn't your site, an unknown clone, a job first seen late, a figure
  under nothing or over `MAX_FACILITY_TAX` (10%, what a structure can charge: the index or prices moved since). EVE Ref's job
  measures 1.00%, as typed in its inputs.
- **Settling the SCC bases** (not changed by Task 11). Each research or copy job checked at an NPC station shows `sccShare`: what
  EVE charged over the app's base besides the index part, the tax and the Alpha tax, as a share of the base. ME research's reading is
  SCC_RESEARCH (2%) on the app's base (2% of the EIV × the level steps ÷ 105, no rank); copying's SCC_COPY (4%) on 2% of the EIV ×
  runs × copies. When the first real job's share isn't the constant to within rounding (the index's four decimals), the reading is
  wrong: say which and change the constant in a commit citing the job. The clean test for a rank missing from the research base is
  charged ÷ the app's total (that ratio is the rank); `sccShare` itself is muddied by it (with rank 2 in the base it reads
  SCC + (rank − 1) × (index × bonus + tax + SCC), 0.0525 for a 2% reading, not a multiple of 2%). Confirm too that the ME/TE kept at
  first sight is the level the job started from (a read after an earlier job was delivered shows the new one, and the check then
  says why it can't work the job out). No SCC on copying reads 0. Until then the constants stand.
- **Inputs not known give a reason, never a figure** (the Task 11 review): research whose kept level plus its levels runs past 10 or
  has none, a copy whose runs a copy takes weren't read, and a site of kind Other (no cost bonus known: a real complex's would land in
  a tax offered) each say why instead of working out a cost. A measured tax within ±0.05% (`MEASURE_BAND`, about what the index's four
  decimals move it) of the typed one reads "paid about the same", with no Use this; two jobs at one site that differ beyond that
  say so ("An earlier job, of 2 Oct, paid 1.00%"), never the newest alone. A cost under `CHECK_FLOOR` (1 ISK) off isn't said to differ.
- **To do lists an alt's jobs to deliver** (Task 12A): `industry:<char>:<place>`, seen at the alt's `sheet` read and judged only on a roster read of this session; the rule is in orders-alerts.md.
- **To do lists what you built** (Task 12B): `built:<char>:<product>:<place>`, the rule and its version in orders-alerts.md. Two corrections to the spec. **Correction 15, where it's listed follows where it sits** (`builtWhere`): in Jita 4-4 on Jita's live book (`listingPrice`, every character's open orders taken off it), at the home hub's structure or in its system on the hub's Goonmetrics sell less a tick, anywhere else by the `industry` doc's `sell` choice, and a ship never goes to Jita while "never haul ships to Jita" is on (with no hub picked it says so and prices nothing). Running the finder inside To do would load the bundle, the map and every book. **Correction 18, versioned by the newest delivered job's ID**, not every delivered job's: the item is built from the newest jobs whose units the place still holds, so listing part of an older batch would drop that job, change the version and reopen a hand tick the user meant to hold. Another delivery changes it, which is when a hand tick should reopen. The place is named as an alt's jobs' facilities are (`jobPlaceSaid`, one `/universe/names` call for both).
- **Built and sold is the Industry activity** (Task 13, 11 October 2026: `builtClaims`, `builtAndSold`, `JOB_FEE_REFS` here; the
  claim order, what it counts and every state's words are in positions-results.md, its limits in limits.md). Three corrections to
  the spec: **9**, the claims are derived from the ledger (`claimsOf(d)`: jobs, trades, positions, Personal marks), not passed by
  each caller, and a split sale rides `Position.claimed` on Results' every-item positions; **10**, the bundle loads beyond this
  tab, on Results, the Wallet and the Characters page, only for a ledger holding a manufacturing job whose ME was recorded (not
  cancelled), and a site's system security (one public read) only for a site with rigs (`useBuiltInputs`): every other ledger,
  and the income recording's, never asks for it, so stage 1's "loaded by the tab only" holds for them; **11**, what Industry
  counts (claimed sales after tax, every job's fee, manufacturing materials at your own purchases before each job; invention's
  datacores and copies not charged). Where a job ran is Task 11's `jobPlace`: an NPC station has no material bonus, a structure
  only when it is one of your sites with a structure ID, so a home typed in costs its jobs without its bonuses, said (limits.md).
  A failed load can't be retried in place (gotchas.md): its button reloads the app, and so does this tab's own "Reload to try
  again" for the bundle and the map (it asked again in place, which did nothing). **A typed home is offered the structure its
  jobs ran at** (the review's ruling, 11 October 2026; positions-results.md): never matched by a guess inside `jobPlace`, which
  the job check, the measured tax and Use this rest on; the sites table offers each structure in the home's system where jobs ran
  and matches no site, and Use it sets the home's structure ID.

## Stage 3: copies to sell

Decisions worth not undoing (spec `docs/superpowers/specs/2026-10-10-industry-design.md`, plan
`docs/superpowers/plans/2026-10-11-industry-stage-3.md`, its corrections numbered there). Task 14A: the cloud counts what copies sell.

- **What copies sell is counted by the cloud every six hours** (`worker/src/copies.ts`, `src/lib/copyMarket.ts`, migration 0020,
  `GET /v1/copies`; 11 October 2026). On the `37` cron after Goonmetrics (`refreshCopies`, its own try/catch, so neither the alts'
  read nor Goonmetrics waits on it), the cloud reads EVE Ref's latest public-contract snapshot and keeps The Forge's **single-kind
  copy contracts** (every item a copy of one type at one ME, TE and runs, nothing asked in return, a price) as a set, `copy_set`,
  in rows of `COPY_PART` (3,000 contracts, about 280 KB of JSON a row, under D1's 2 MB: the set was 1.02 to 1.03 MB on 11
  October and one row would fail outright the day the market doubles; correction 3). A row is `[contract, type, ME, TE, runs a
  copy, copies, price, issuer, expires in seconds, item IDs]`. Each contract of the kept set that is gone from the new snapshot,
  wasn't past its expiry at the new snapshot's time, and none of whose copies came back in a contract by the same seller,
  vanished before expiry (sold, most likely; a seller cancelling looks the same, limits.md) and goes in `copy_sold` at the new
  snapshot's time, kept eight days (`COPY_KEEP_DAYS`; the summary counts seven, `COPY_WINDOW_DAYS`). Back under another seller,
  it was bought and relisted: a sale.
  - **Six-hourly reads, because days apart miss most sales** (correction 2): 327 contracts vanished from 00:00 to 06:00 UTC and
    430 from 06:00 to 12:00 on 11 October, where the research's reads days apart counted about 320 a day (2,683 over 2 to 6
    October): a contract listed and sold between two reads is never seen. The fixture (`scripts/fixtures/copy-snapshots.json`,
    the three snapshots' contracts holding five types) shows it: 16 sold then 12, of which 4 were listed after 00:00, so
    comparing 00:00 with 12:00 counts 25, not 28.
  - **A reprice is told by every copy in the new snapshot's item exchanges** (correction 5), not only the kept set: a seller
    moving a copy into a bundle (with other items, which the comparables leave out) repriced it. The reader notes every copy's
    seller as it streams (`copyIssuers`; 49,531 copies at 12:00, 7,656 of them in contracts the comparables leave out); the tests'
    snapshots, without it, use `itemIssuers` over the blueprint contracts.
  - **Your own contracts are no one's market** (correction 6): what sold and the asks leave out every character whose login the
    cloud holds and every alt on a roster, removed ones too (`ownCharacters`); their rows stay in `copy_sold`.
  - **The summary is worked out once a round** (correction 4): `scan_meta` 'copySummary' (each kind sold in the window: contracts,
    copies, sellers, the median price a run; the asks now per kind: cheapest, median, contracts, sellers; days counted, reads, the
    longest span between two reads) beside the round's own state, 'copies' (when it last tried and read, its error, `stale`, each
    comparison's span). So `GET /v1/copies` never parses a megabyte. What sold, what came back, the set, the summary and the state
    go in one `batch`, one transaction: a round whose write fails leaves the last round's all as it was.
  - **When it reads**: due when its last good read is 5½ hours old (six less Goonmetrics' half-hour slack for the alts' read ahead
    of it) and its last try at least 50 minutes old, so a failed or unmoved read is tried again the next hour, never twice an hour;
    nothing starts 12 minutes past the cron's time (`COPIES_BUDGET_MS`: Goonmetrics may run to 10, the invocation stops at 15).
  - **A round that can't compare writes no sale** (Review Focus 1): the first read only keeps the set (the Copies section says
    counting has begun), so **the first `37` round after a deploy counts nothing and the next, six hours on, is the first to
    count**; a snapshot no newer than the kept one (EVE Ref stalled) is `stale`, not an error, and tried again the next hour; a
    failed read keeps the set and what sold and says why; a kept set more than seven days older than the new snapshot is replaced
    without comparing (a week of sales on one day is no pace).
  - **A snapshot that isn't whole is refused, never compared** (the review of Task 14A). The first `ContractSink` stopped at the
    archive's end and answered the snapshot's time with no contracts, whatever was missing, and the round compared it: an empty
    06:00 read counted all 96 kept contracts as sold and replaced the set with none, and the whole 12:00 snapshot then took 67
    back and left 29 where whole snapshots give 28 (5 reprices under new IDs kept as sales, 4 real sales missed). Now the reader
    refuses an archive lacking meta, contracts or items, a stream cut short (`result()` throws), an empty CSV, and a header
    without a column it reads or with one past the 40 it splits ("EVE Ref’s contracts.csv has no issuer_id column"); the
    Blueprints route then errors rather than answering empty. And the round refuses a snapshot with no copy contracts, always,
    and one under half the kept set (the 11 October sets held 11,402 to 11,432) **only while it would be compared**: a kept set
    over seven days old is replaced as before, never refused. A refusal says so ("under half the kept set (11,402): a snapshot cut
    short, or the market changed; nothing compared (2 of 6 in a row)"), keeps the set and what sold as they are, writes no sale
    and tries again the next hour; the next whole snapshot is compared with the set kept (the fixture's 00:00 against 12:00: 25,
    the six-hourly count's 28 less what the skipped read would have seen).
  - **Six in a row under half the kept set and the newest is kept** (`COPIES_RESET_AFTER`, the re-review's ruling): refused for
    good, a market that really fell would never be read again. Each refusal is counted in the state (`halved`, with the
    snapshot's time, so the same file refused twice counts once); the sixth different snapshot in a row is kept as the set
    without counting a sale from it (no comparison, no read span), and the state and the route carry `note`: "The copy contracts
    fell under half the kept set six times running: kept the new set without counting sales from it", until the next read. A
    contract of `copy_sold` back in it is still taken out (it never left). The hours from the old set to the new count no sales
    but sit inside the summary's days, so a kind's pace reads low by that share until they leave the week (limits.md).
  - **A partial snapshot is undone by the next** (correction 20): a page EVE Ref's scraper missed makes its contracts look sold; a
    contract in `copy_sold` that is back in a newer snapshot never left, and is taken out (`back`). Tested with one contract
    missing from the 06:00 snapshot: 17 counted, then 28, as with whole snapshots.
  - **A round the cloud stops leaves a trace** (correction 21): before it reads, the round stamps its try `INTERRUPTED`; every way
    it ends writes over that, so only a round stopped by memory or the wall limit (no `catch` sees those) leaves it, and the next
    try then waits the full six hours, not the hour. Anything that throws after the read (a write D1 refuses, a kept row that
    won't parse) is stamped with its own error and tried again the next hour (the plan's code caught only the fetch, which would
    have left such a round reading "interrupted" with the six hours' wait); the prune after the batch stays outside that catch, so
    a failed prune can't stamp the last round's state over the one the batch wrote. The fetch gives up after 90 s
    (`READ_TIMEOUT_MS`; the 6.6 MB file came in seconds).
  - **D1's cost**: about 375 inserts and 375 prunes a round, each written twice with the `copy_sold_at` index, and the set's rows
    and the state: about 1,500 row writes a round, 6,000 a day, 180,000 a month, under 0.4% of the plan's 50 M. A round that
    read the same snapshot writes only its state.
  - **EVE Ref unchanged is a 304, not a download** (the review of Task 14A): the round keeps the ETag of the newest file it read
    that wasn't newer than the kept set and, while a set is kept, sends it as `If-None-Match`; a 304 is the same as reading the
    same snapshot (`stale`, tried again the next hour), with nothing downloaded and nothing written but the state. The Blueprints
    route sends none.
  - **`GET /v1/copies` before a set is kept** answers `{ tried, error }` once a round has tried (a failed first read, or one the
    cloud stopped: `INTERRUPTED`), so the tab can say why; `null` only when no round has tried. A summary always carries `at` and
    this never does: Task 14B's `CopiesAnswer` and `useCopyMarket` have to tell them apart (the plan's version maps every answer
    that isn't null or `off` to a summary). A summary's answer also carries `note` (null, or the reset above).
  - **`COPIES_ON`** (copies.ts) switches it off; the route then answers `{ off: true }`. EVE Ref is someone else's site: one file
    every six hours, the Blueprints route's User-Agent naming the project only, not a watched job (the section says how old its
    read is).
- **The snapshot is read as it decompresses** (correction 19; `ContractSink` in `bpContracts.ts`, `readSnapshot` in
  `worker/src/blueprints.ts`, shared with the Blueprints route). The old reader kept the snapshot's contracts and items files whole
  (39 MB of CSV on 11 October) and parsed them after; `ContractSink` splits each CSV line where it lies as the bzip2 decoder
  writes the tar, keeps only the region's public, priced item exchanges whose items are all blueprints given (dropping a contract
  the moment an item says otherwise), notes every copy's seller, and stops once meta, contracts and items are in (EVE Ref's
  order; items before contracts are refused, never read wrong; a line short of fields reads them empty, as from whole files,
  never the bytes the line before left in the buffer). The decoder now reuses its 3.6 MB block buffer (every entry is
  written before it is read), which was most of the garbage. **Measured in Node 24.18 on the real snapshots**
  (`.playwright-mcp/research/industry-stage3-scripts/measure-memory.mjs`, heap plus ArrayBuffers sampled every MB decoded; the
  bar 60 MB for the reader, and the round completing under a 48 MB old space):
  - `reader: 15235 contracts, 46204 items, 49531 copies' sellers; 2341 ms; peak 29.0 MB above 9.0; held after GC 13.9 MB` (12:00;
    29.4 and 29.5 MB on 06:00 and 00:00; 28.8 to 29.5 over repeated runs);
  - `round: {"done":"read","contracts":11402,"sold":327,"parts":4}; 2500 ms` under `--max-old-space-size=48` (00:00 then 06:00;
    06:00 then 12:00 sold 430). Its "peak above" figure is GC timing, not a measure (the base holds the first round's garbage,
    so it reads below zero): with that collected first, the round allocates 52 to 54 MB before collection and holds under 3 MB
    after, and it completes in a 32 MB old space with 1 MB semi-spaces, not in 24;
  - the old reader in the same measure: 119 to 136 MB (the plan's own measure 113 MB, the pre-flight's 122), 83 to 100 MB with
    the block buffer reused. The decoder's working arrays aren't sampled between its writes, so this is the app's measure, not a
    proof; the Worker's first real round (`wrangler tail`'s `copies` line, `scan_meta`) is the rest.
  - **The measure is that sensitive to the hot path**: making a line short of fields read empty by an early `return [0, 0]` in
    `range` (a second fresh array from a function called for every field) took the reader's peak from 29 MB to 41.6 MB, held
    after GC unchanged at 13.9: garbage V8 no longer optimised away. Clearing the stale field bounds in `split` instead kept 29.
    Measure again after any change to `ContractSink`.
  - **The Blueprints route's answer is unchanged**: on the 00:00 and 12:00 snapshots, `ContractSink` from the `.tar.bz2` gave the
    same contracts in the same order as `blueprintContracts` on the unpacked files (every type at the snapshot's time, a day
    later, the five fixture types, and Domain); `npm run check` pins it on a synthetic tar.

- **The Copies section: what's worth copying for one lab slot** (`src/lib/copyFinder.ts` pure, `IndustryCopies.tsx`, `useCopyMarket` in
  industryMarket.ts, `cloudCopies`; stage 3, Task 14B). Each kind that sold in The Forge this week (the cloud's `GET /v1/copies`) at the
  shown character: left out and counted when the bundle lacks its blueprint, it's an invention product (Tech II: Build ranks it) or it
  can't be copied (correction 8); a run's price is the lower of the median sold and the median ask now (correction 7); a run's copy job
  at `labFor`'s lab at its copying index (the product's ME 0 EIV); runs a day a lab slot makes against runs a day sold (runs sold ÷ days
  counted, at least one: correction 16) at the industry share, the lesser, saying which limits it; ISK a day for one lab slot; the
  original (held: nothing to buy or research; else NPCs' price) with research from the held ME/TE; payback; the finder's profit a day
  building instead (only for the rows shown). Under three sales or one seller says so ("1 seller: one person's prices").
  - **The route's four answers are told apart by `at`**: null (no round has tried), `{ off }`, `{ tried, error }` (a round tried, none has
    read: said as what went wrong and when, never "not read yet", no table) and a summary, whose later failed try is said before its
    figures with the last good read's age, and whose `note` (a reset) is said as the cloud wrote it. A 404 is "a version behind". No
    table until a read has compared two sets (`reads > 0`): the counting line alone, never "0 kinds sold".
  - **The copy cost's two unchecked readings** (`copyReadings`, `readingsSaid`, correction 15): copying's SCC taken as EVE Ref's 4%, and a
    copy cost rig multiplying the structure's bonus on the index part. The cost's tip says each is unchecked until a job of yours settles
    it (stage 2's `jobCheck`: a copy job at an NPC station for the SCC; a copy or research job at your structure site with such a rig for
    the rig, nearer-reading when the two differ by more than the index's rounding), and what a job said. A structure with no cost bonus of
    its own (Astrahus, Fortizar) reads the same either way, said so.
  - **Layout**: seven columns at 1,440 (Original and research, and Payback and building instead, each share a column; the table is
    `table-layout: fixed`), the first and ISK a day on a phone, the rest folded into a line under the name.
  - **Fix round (review of 14B)**: an interrupted round (INTERRUPTED, now in copyMarket.ts) waits the full six hours, so the section says "its
    next six-hourly round", never "within the hour"; a try under 3 minutes old with that error is a read in progress ("reading now"), not a
    failure. A row's `lacking` merges copying's and research's skills (about a quarter of blueprints need some to research) and says "N to train";
    research past 30 days is flagged on the row and payback says "from the purchase, after N d of research"; every figure not known says why
    (payback, building, no Laboratory); a pace under one a day is time between ("about one every 2 days"); the left-out counts are kinds.

- **Your copy contracts are a synced document of their own** (`copyContracts`, `src/lib/copyContracts.ts`, Task 15A; corrections 10 to 14).
  ESI lists a character's contracts only 30 days back and the sync replaces `meta.contracts`' list each time, so a copy sold last month
  would drop out of Results after a month; `meta` also goes up every sync, so the contracts get a document that changes only with a copy
  contract. A copy contract is an item exchange you issued whose items, as your own contract items read them, are all given and all copies
  (`raw_quantity` −2; `ContractItem.raw` keeps it, null when ESI gave none, absent on an item read before this stage, which `itemsToRead`
  reads once more). The sync reads items for your outstanding item exchanges as well as the finished ones. Each contract keeps ESI's status,
  price, availability, acceptor, completion and start station, its copies by type, and its kinds `[type, ME, TE, runs, copies]`, read once
  from the public items while outstanding and public (at most 20 a sync): `private` (never asked), `gone` (no longer outstanding or past
  its expiry before they were read, or the answer held no copy), absent (not read: a 404 is asked again next sync). One missing from ESI's
  list and issued more than 30 days before the read is stamped `gone` once (fix round 2 below), its last status kept, and never dropped
  (3,000, `MAX_COPY_CONTRACTS`, newest kept); one still listed whose items aren't usable this read (read before `raw` was kept, or not read
  yet) keeps its copies and follows its status. Written against live state in the final `update`, only when changed.
- **An expired copy contract goes on To do** (Task 15C): one item per contract outstanding past its expiry and still in ESI's list; the rule is in orders-alerts.md.
- **Your copy business** (Copies section, `CopyBusiness`): the shown character's copy jobs (activity 5) and copies held, and the main's copy
  contracts with their state (listed / expired: ESI has no expired status, so an outstanding contract past its expiry, its copies still in it
  until deleted / sold) and the cheapest ask of their kind. It is drawn outside the copy market's gate: it comes from the sync and the
  cloud's reads of your characters, so it shows with the cloud off or a version behind. An alt's contracts aren't read: said, never "none".
  The blueprints in copy contracts join the sync's name lookup, and an expired contract's station is named, for To do later (Task 15C).
- **Fix round 1 of 15A: the history is merged, never replaced** (`mergeCopyContracts`, `mergeCopyContract` in copyContracts.ts). The sync starts at load
  without waiting for the first pull, and the pull used to drop a doc while the local one was dirty: a new browser would have written ESI's 30 days over
  the cloud's history and pushed it, which ESI can't give back. Now both sides merge, as `jobs` do: the browser's pull applies the union whether the local doc is
  dirty or not (and under `cloudWins`), marking it dirty when the union holds more than what came down; the Worker's push reads D1's doc first, writes the
  merge and, when it differs from what was pushed, writes it at a revision of its own after the push's so the pushing browser pulls it back (correction 19's
  way). The merge is by contract, commutative and idempotent: the record whose status is further on (outstanding, in progress, other, deleted, finished) wins its
  own fields, an acceptor or completion either side knows is kept, `gone` is the earliest stamp, kinds read beat `private`, which beats `gone`, which beats unread.
  A contract stamped `gone` stays so even if a later read lists it again (ESI's window only moves forward; a partial list read is the one way that could be wrong).
  **Cap 3,000** (`MAX_COPY_CONTRACTS`; the merge's too): the document is one D1 value (2 MB), measured about 1.54 MB at 5,000 contracts with one kind each and 2.16 MB with five.
  **States**: a contract that left ESI's list while outstanding is "No longer listed by ESI" (its own tile, shown for 30 days after the stamp, "ESI lists contracts
  only 30 days back: if you didn't delete it in game, its copies are still in it"), never Expired; a finished one taken by one of your own characters (`ownIds`) is
  "Taken by <name>", not Sold. **15B must not count a taken contract as copy income** (ISK between your own characters is a transfer, never income); use
  `copyState(c, now, ownIds(...))` and count only `'sold'`. The sync also keeps the items of every contract still in ESI's list, so the oldest listed exchanges aren't
  read again and pruned every sync.
- **Fix round 2 of 15A: `gone` is stamped only against ESI's own list** (`copyContractsOf`; correction 13). The first version stamped a listed contract whenever
  this device's items for it were unusable (read before `raw` was kept, not read, past the cap), and the merge ("gone if either, earliest") put the stamp back after
  each sync stripped it: a push and a later revision every round, the row reading "No longer listed by ESI" while ESI listed it. Now the listed set is every item
  exchange you issued in ESI's list, whatever its items (a listed one with unusable items keeps its old record and follows its status); a held contract missing from
  the list is stamped only when issued **more than 30 days before the read** (ESI lists a character's contracts 30 days back, so a younger one missing is a partial or
  stale read, or issued after the read, never one that left; if the window is measured from completion this only delays a stamp until the contract is missing
  anyway); and a stamp already held is carried forward, so the sync and the merge agree and a sync writes nothing when nothing changed. The Worker keeps D1's doc when
  a pushed one doesn't sanitize (a pre-15A backup's null).

- **Copies you made and sold count in Industry** (Task 15B, 11 October 2026; `copySales`, `CONTRACT_FEE_REFS` in copyContracts.ts, `activityEvents` in income.ts).
  Each copy contract that is `sold` (finished, accepted by someone not yours) adds its price (the journal's `contract_price` entries naming it, else the contract's
  price at its completion, at its listing when ESI gives no completion) times the share of its copies your delivered copy jobs of that blueprint had made before it was listed, claimed in the order contracts were
  listed, each copy once; copies none made are counted apart and said. A `taken` contract (accepted by one of your own characters, `copyState(c, Infinity, mine)`) is a
  transfer, said, never a sale, but it uses up its copies from your copy jobs, oldest first, counting no ISK; `unlisted` (left ESI's list while outstanding), listed, expired and deleted claim nothing. Contract fees the journal names by
  `contract_id` count in full when you'd copied one of the blueprints before listing it (a listing fee is paid whether or not it sells). The copy jobs' own fees are
  stage 2's, charged once at each job's start: `copySales` never charges them again. Nothing touches market trades, so the claims and "Sold, never bought" don't move.
- **After shipping: the first copy contract's journal entries.** Which ref types a copy contract writes (`contract_price`, `contract_brokers_fee`,
  `contract_sales_tax`, or others), and whether they name the contract (`context_id` with type `contract_id`). Until seen, a sale is counted at the contract's price at
  its completion and no fee at all; record what the first real one shows.
- **The first real reads after stage 3 shipped** (read from D1 with SELECTs only, 13 October 2026 at 19:47 UTC): a copy round every six
  hours since 12 October 09:37 UTC, none failed, none refused a snapshot, no reset. The five comparisons counted 282, 324,
  159, 212 and 350 sold (1,327 rows in `copy_sold`), against 327 and 430 in the two six-hour spans measured on 11 October. The kept set
  was 4 rows (`COPY_PART`), 1,052,451 bytes; the summary 160,103 bytes.

## Stage 4: home markets

Decisions worth not undoing (spec `docs/superpowers/specs/2026-10-10-industry-design.md`, plan `docs/superpowers/plans/2026-10-12-industry-stage-4.md`).

- **The permission** (`SCOPE.structureMarkets`, 12 October 2026): asked of every login, registered by the user on 9 October. The user's next
  login stops the cloud's main login and the main's login on any other device, never an alt's (the plan's corrections 1 and 2; eve-facts.md:
  EVE's rule is per character). Settings → Account says so before the relog (`grantSaid`), in the order that keeps every login alive: log in
  here, then hand the cloud the main's login, then log in on any other device, alts on Characters when wanted. The sender's login
  (`MAILER_SCOPES`) is untouched; an alt handed over again gains it (`loginAltForCloud` asks `SCOPES`). Handing the cloud a login first would
  stop this browser's own (`stoppedBy` already says so after the fact).

- **The cloud's structure search** (`POST /v1/structures/search`, `worker/src/structures.ts`, Task 17A): ESI searches the structures a
  character can see only with that character's own login, and the browser never holds an alt's. It runs as the main or an alt on the
  roster, with that character's login (`ledgerReader` / `altReader`); anyone else is refused before EVE is asked, and so is a login handed
  over without the search or structure permissions (said, with where to hand it over: Characters, or Settings → Your data for the main).
  It writes nothing: the found structures go back to the browser, which adds the one picked. A structure the character can't read (403/404)
  is left out, as the browser's `structureInfo` does; each system is read publicly, once for all the structures in it.
- **FindStructure as any character** (Task 17B, 12 October 2026; `as` and `Searcher` in FindStructure.tsx, `cloudStructureSearch` in cloud.ts,
  `FoundStructure` moved to industrySites.ts so cloud.ts doesn't import a component). The main searches with this browser's login, as before;
  an alt through the cloud's `POST /v1/structures/search`, with its own login, which the browser never holds. Each state is said, never
  "nothing found": the cloud switched off in this browser, a Worker a version behind (404: "The cloud is a version behind: searching as X
  comes once it's updated"), and the Worker's own words for a login it can't use. Where you build searches as the shown character
  (the old line "X's own aren't searched here" is gone; an alt's search needs no permission in this browser's login, only the cloud's).
  Reprocessing passes no `as`: it searches as the main, unchanged. The page check's Builder Alt searches through a stubbed route, then the
  route answers 404.

- **The cloud reads each home market** (Task 18A, 12 October 2026; migration 0021 `home_markets` + `home_books`, `worker/src/homeMarkets.ts`,
  `src/lib/bookFold.ts`). A hub is a structure with a name and a reader: Goonmetrics' two read with the main unless a `home_markets` row says
  otherwise (or switches one off with `removed_at`), and any hub you add (at most 10), which carries the system and region the finder needs
  (read publicly when it was added). `home_books` is **the structure's own**, keyed by structure: nothing of it is filed under the main or the
  alt that read it, and `read_by` says whose login the last good read was. A read folds page by page (`foldStructurePage`, the scan's fold with
  no queue count), keeping the watch set's types only (2,916), five levels a side as `[price, units]`, order counts and what the live orders
  sold: about 150 bytes a type. **A read cut short, or with a page failed, is never stored**, and a market over 300 pages isn't read: ESI's
  pages are shuffled by type, so part of them would price every type wrong; the last good read (`at`, `data`, `pages`, `types`) stands apart from
  the last try (`tried`, `reader`, `error`). `refused_at` is when this reader was first refused in a row: a read clears it, another failure
  (a 500 says nothing of access) keeps it, another reader starts it afresh. A refused hub is asked again hourly, so a character accepted onto
  the access list starts reading within the hour.
  - **When it reads**: last on the `37` chain (after the alts' read, Goonmetrics and the copy round: a missed Goonmetrics or copy round slips six
    hours, a missed structure read one), every hub whose last try is 50 minutes old, least recently read first **by `at`** (so a hub cut short goes
    first next hour, and one long market can't keep another unread), no page asked for past 14 minutes from the cron's time. Inside its own
    try/catch; **not a watched job** (a hub refused until the user is accepted would mail daily; the tab says each hub's state). The fold moved out
    of scan.ts unchanged: the scan's tests pass untouched.
  - **A login that can't read is skipped before EVE is asked and not stamped** (`loginOf`, from the keys): not on the roster (`notYours`, never
    read with the main instead), none kept, refused, or handed over without the permission (the deploy-day state of the main's own login: "hand the
    cloud your login again"). `POST /v1/home/read` reads one hub at once with no deadline.
  - **ESI**: `/markets/structures/{id}/` pages of 1,000 orders with `X-Pages`, held about 300 s, no rate group named in the spec; the 403 for a
    reader off the access list has no shape in the spec. **After shipping: record the first real refusal (its status and `error`), the first real
    read's page count, types and row size, and how long a page takes.**
  - **D1's cost**: one `home_books` write a hub an hour, about 2,200 a month for three hubs; `home_markets` is written only on a choice.

- **Which price speaks at a home hub** (Task 18B, 12 October 2026; `homeSpeaks`, `useHomeQuotes`): the hub's own market's read while under two
  hours old (`STRUCTURE_FRESH_MS`; 1 h 59 speaks, 2 h 01 doesn't), else Goonmetrics' (whatever its age, said), else none. Every reader says which:
  the finder's count line, rows (`sold at UALX-3, its own market`) and detail (the sale's note: "<hub>'s own market, read 12 min ago", with
  Goonmetrics' weekly movement beside it where the hub has one), the ladder (Start's "pays now" lines add "sold at UALX-3 on its own market" when a
  row they show sells at home: correction 15), and To do's List what you built. Past two hours the line says its own read is over two hours old
  and Goonmetrics speaks; a hub Goonmetrics doesn't track says it isn't priced.
  - **The hub list** (`hubsFrom`): Goonmetrics' two always (the cloud off, a version behind or failing too), then the hubs the cloud lists that
    you added and haven't removed. `HOME_HUBS` stays Goonmetrics' alone (the Worker's round reads it). `hubShort`: Goonmetrics' two keep UALX-3
    and C-J6MT; a hub you added is its structure's name after the system's ("Mothership Bellicose"; Ruling 2). The cloud's list is asked for always
    in the finder (Build's select offers every hub you added whichever is picked) and, on To do, when a hub you added is picked or when something built lists at the home hub (`useHomeQuotes` reads the hub's state and its own read, Goonmetrics' two included).
  - **At a hub priced by its own read**: a watched type absent from a whole read is "none listed there" (known; Goonmetrics' missing type stays "no price at"); **a type outside the watch set (`industryTypes.json`, loaded when the hub's own read first speaks) is never "none listed"**: the read holds watched types only, so `quote` is null and To do says the hub's own market is read for the Industry tab's items only (the review's fix round: 1,344 products of built jobs aren't in it);
    a material is bought up its best five levels for a week's need (`fillCost`); the pace is the home region's history, or Goonmetrics' weekly
    movement ÷ 7 before it, split by what the hub's live orders sold where the book can tell (the Jita book's rule, `tradingSplit`), else even.
  - **The home history is read for rows priced at the hub with no pace too** (`homeTypes`' `unpaced`, correction 10): a hub Goonmetrics doesn't
    track has no weekly movement, so no row had a pace to be ranked by. The same rescues a Goonmetrics type whose weekly movement is unknown
    (its -1), which stage 1 never paced or read the history of, but only within the 40 rows read, after the rows already sold at home.
  - **The browser's holds**: the cloud's list 15 minutes (shared in flight, read again after any change made here: `refreshHomeMarkets`), a hub's
    own read until the next hourly read could land (`bookHoldMs`, 5 to 15 minutes).
  - **A hub picked that isn't known here** (the list loading, the cloud off in this browser, failing, a version behind, or no longer listing it)
    is never "no hub picked": Build's select keeps it ("Reading…" / "Not listed") and says why; To do lists nothing from it in Jita and says why
    in the same words (`hubWhy`), copying no price.
  - **The page check** found that rung 1 (an NPC original) pays nothing at the page case's home site, so the ladder's words are asserted on the
    research rung.

  - **Fix round 1 (the review of Task 18B)**: **your own orders at the hub come off its read** (`structureQuote`'s `mine`: every character's open orders at that structure, by exact price, a level that empties dropped, an order matching no level leaves them alone; `IndustryChar.hubOrders`, To do's `hubOrders`): the structure's read holds every order, yours included, and priced a tick under your own listing. **Nothing speaks while the hub's own read (or the watch set) is still coming** (`HomeSource.pending`): Goonmetrics' prices no longer rank the rows or price a built item for the moments before the book lands. **To do says only which price it used and its age** ("UALX-3's prices: Goonmetrics, read 5 h ago."; `homeSaid`'s `own: false`): a refused or unreadable own market, a relog or an access list is said on the Industry tab alone (Ruling 1, the logging-in constraint). **"Goonmetrics' prices stand in" only where they do** (`ownMarketSaid`'s `'tracked'`: read and not switched off). **Ages in a hub's lines are minutes up to 2 h 59** (`homeAgo`), so 1 h 59 and 2 h 01 never both read "2 h ago". A hub's read that exists but doesn't speak reads "no price at X", not "not read yet".

  - **Fix round 2**: your orders come off a type's levels only if they are that type's (`ordersInRead`: prices carry four significant figures, so another item's order at a level's price is ordinary) and issued by the time of the read (`issued` moves on a reprice). A watch-set chunk that fails to load is final for the page (gotchas.md): the hub's own read doesn't speak, isn't pending for good, and Build says the item list couldn't be loaded with "Reload to try again" (`HomeSource.itemsFailed`). A Goonmetrics hub isn't "read" while its Goonmetrics read is loading.

- **The Home markets section** (Task 18C, 17 October 2026; `IndustryHome.tsx`, `hustles/industry/home`, the tab's fifth section). Lead
  "Prices at home, from Goonmetrics until a character of yours can read the market itself." One row per hub: Goonmetrics' two always
  (the cloud off, loading, a version behind or failing each said once over the table, in `listWhy`'s words), then the hubs you added,
  as the cloud lists them. Each is named by its structure with its system beside it, "1st Byzantigoon (UALX-3)" (Ruling 2; the
  system's part kept whole so "(C-J6MT)" never breaks at its hyphen), and says:
  - **Prices now**: its own read under two hours old, else Goonmetrics' with its age (`homeAgo`) and "older than a day" past one, else
    nothing, said, or why Goonmetrics' prices aren't here. While its own read is still coming from the cloud it says "Reading…", so
    Goonmetrics' line never shows for a moment and gives way. A default switched to Nobody isn't priced by its own last read (`ownRead`).
    It reads the hub's book and Goonmetrics' row directly, not through `useHomeQuotes`: the section never loads the watch set, so a
    watch-set chunk that failed on Build isn't reflected here (Build says it).
  - **Its own market**: `ownMarketSaid`, with Goonmetrics passed as it is for that row: `true` only while its prices are read, else
    `'tracked'` (a default), `false` for a hub you added. So a default refused by its access list reads calmly, and says "Goonmetrics'
    prices stand in" only where they do. The main's cloud login without the permission (every hub's state from the deploy until it's
    handed over) reads "log in again here, then hand the cloud your login again", never a refusal or a failure.
  - **Its reader**, a select per row (once the cloud's list is in): any of your characters, the main by default; Goonmetrics' two add
    "Nobody: Goonmetrics only", which stops reading them (`DELETE /v1/home/markets`, the cloud keeps the row with `removed_at`); picking a
    character sets it (`POST /v1/home/markets`) and reads at once. A reader the cloud keeps who isn't among your characters here is
    listed as itself, so the select never shows another as the one reading. **Read it now** only while its reader's login can read;
    **Remove** for a hub you added; **Make it the home hub** writes the `industry` doc's `hub` (and removing the home hub clears it).
  - **Its broker fee**, typed per hub into `hubFees` (the cell, and the row's fold on a phone): Task 18D adds the measured one.
  - **Adding a market**: `FindStructure` as any character ("Search as": the main here with this browser's login and its search
    permissions, an alt through the cloud's search with its own login). Whoever finds it reads it. The add posts the structure's name and
    system, then reads it at once, and the toast says "Added <name>." and what that read did in `ownMarketSaid`'s words: read and by
    whom, refused, failing, or skipped without asking EVE for a reader whose login can't (the likeliest first add: an alt handed over
    before the permission, "hand the cloud X's login again on Characters"); never a read it didn't make. A read that throws after the add
    still says Added, with why it couldn't read. Mothership Bellicose is named as the one to add ("Brave's market at UALX-3, Mothership
    Bellicose: add it once one of your characters can see it") once the cloud's list is in and until a hub of that name is listed (shown
    while the list loads, it vanished when a listed Bellicose arrived).
  - **The list's own states say nothing stands in** (fix round 1): with the cloud off in this browser, "Home markets, Goonmetrics'
    prices among them, are read by the cloud, which isn't on in this browser": Goonmetrics is read only through the cloud
    (`useHomePrices` is `off` then), so the first wording's "Goonmetrics' prices are all there is here" was false. A version behind says
    only that reading a market with your characters comes once it's updated: each row says what prices it, and "stand in" is said
    only where Goonmetrics' prices are read.
  - **Logins**: the section calls only the cloud's routes, with the logins the cloud already holds; it never starts an EVE login, hands
    one over or touches `auth.ts`. Where a login is the problem it says where to fix it (Settings → Your data, Characters).
  - The page check's industry case (Task 18C block) drives every state above, the reader select, Nobody, an add as Builder Alt (read,
    and again with its login lacking the permission), Remove, and a cloud a version behind; the plain loads draw the section on the
    empty, small and large ledgers, and `check-phone` measures it.

- **Goonmetrics' round starts where the last stopped** (Task 18E, correction 16; `scan_meta` 'goonmetrics' = `{ next, unread }` per hub, no migration). A hub's round
  began at the first batch every time, so a host that cut it at the same call (a rate limit no read had met) never reached its last
  batches. Now it starts after the last batch tried (`next`: where it started when it tried them all), and the types no round has reached since
  are kept (`unread`: all of them for a hub never read, none for one read before this was kept, less every batch that came back) and served
  with the hub's prices (`GET /v1/home/prices` `unread`, absent when none). Evidence: against a host that answers ten calls a round, C-J6MT's
  eight batches are all read in five rounds (it starts at the sixth batch, types 1250, in round two), tested; planted starting at 0, 50
  types stay out. **A save whose write throws leaves its batches unread** (ruling 18E-1): `settle` removes a batch from `unread` only when the
  row stored it, while `next` moves on either way. The finder, its count line and To do's built item say "not read at X yet" / "Goonmetrics
  hasn’t read it at X yet" for an unread type (`HomeSource.unread`, empty unless Goonmetrics is the source speaking), and "no price" only for a
  type read and absent; a built product outside the watch set at a Goonmetrics hub says Goonmetrics is read for the Industry tab’s items only (the
  watch chunk loads when Goonmetrics speaks too, never holding Build's rows back; To do shows it reading meanwhile). A type added to the watch set
  joins every kept hub's `unread` (`state.types`). Calls, pauses, User-Agent, cadence and `GOONMETRICS_ON` are unchanged.
- **The hub's broker fee, measured from your orders there** (Task 18D, 17 October 2026; `hubFeeRate`, `HUB_FEE_ORDERS`, `HubFee` in homeMarket.ts; `HubFeeLine`
  in IndustryHome.tsx, under each row's typed fee and under the home hub's words on Build; `IndustryChar.orders` / `.journal`). A structure's broker fee is its
  owner's and isn't in ESI. Correction 12: `matchFees` calls a fee a placement only at 75% of the Jita rate times the order, so a hub fee under that (1.2% is,
  at the main's 1.55%) would read as a price change, and `measuredRates` wants three placements a day. So `hubFeeRate` matches by the second itself: a
  placement counts when its order's first version seen is the only version of any of the character's orders in that second, its fee is every `brokers_fee`
  entry of the second (an owner's part and any other alike), and it is over the 100 ISK minimum (which says nothing of the rate). The median of the newest
  five, so a price change the app first saw as an order can't decide it. From any character's orders (the main's from its sync, an alt's from the cloud's
  hourly read): a structure's fee is its owner's, the same for all. **Only offered with Use this**, never applied, and "about the same" within the facility
  tax's band (`taxesDiffer`, ±0.05%); nothing measured draws nothing. The page check compares the offer without case (the button is upper-cased by the stylesheet).
  **After shipping: record the first real order placed at a home hub: how many journal entries its fee wrote, their ref types and amounts, and whether the
  measure matched the fee the market window showed.**

