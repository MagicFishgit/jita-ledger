# Industry: build sites, the finder, the ladder and Tech II

Split from industry.md on 19 October 2026: stage 1's decisions on where to build and what pays. Decisions worth not
undoing. Build sites and freight, the finder and its rows, the original's price, the ladder on Start, Tech II through
invention, and stage 1's final review.

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
  - **The watch set grew to 2,959 for Planets** (17 October 2026): every planetary good (market groups 1333-1337, 83 types) joins it, 43
    of them new (15 P0, 11 P1, 10 P2, 7 P3), since Planets values every output at home. Goonmetrics goes from 59 to 60 calls a hub
    (50 types a call, 1.5 s apart, every six hours, unchanged); the hubs' own reads and the morning scan's watch-only pass take them with no code
    change. `scripts/industry-bundle.mjs` adds them from `types.jsonl`'s `marketGroupID`; the other outputs came out byte-identical, and
    `npm run check` asserts all 83 IDs of `planets.json` are watched.
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
  - **Left as a limit** (industry-home.md): the row doesn't record which types a cut-short round asked for, so a type in a batch it
    never reached reads as no price there, and a round always starts from the first batch. No read has been cut short yet. (Left for stage 4 and done there: Task 18E below.)

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Selling at the industry share of each side's pace is a guess** (10% unless typed), and profit a day is linear in it. No
  competition, undercutting or relist fees are modelled. **Materials are bought at today's asks**; a patient bid is shown,
  not assumed. **Mined materials cost what they'd sell for**, never nothing, and are counted only for a builder with mining
  records in the last 30 days.
- **A structure's facility tax and rigs are typed until measured** (stage 2 measures the tax); until then profit is ranked
  before the tax, said. **NPC BPO places outside The Forge are read when a row is opened**; the list's price elsewhere is
  CCP's base price.
- **Tech II's invention cost is EVE Ref's formula checked on a one-run rig copy.** For a ten-run module copy the job is
  taken, as the spec reads it, on one run's EIV an attempt; that case hasn't been checked against a real job. Decryptors
  and reactions aren't modelled, and each Tech II row assumes one lab slot inventing for its one factory slot.
- **A Tech II row is one job a day**, as every row is (a job is a day of runs): a one-run copy builds one hull a day though a
  factory slot could take two or three if jobs were installed more often, so Tech II rows read below what a factory slot
  and a lab slot can make then. The detail says so where it binds ("One job a day").
