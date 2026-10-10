# Industry: a side hustle for building, researching and copying — design

Written 10 October 2026 from the user's choices of 9 October and the blueprint research of the same day
(`.playwright-mcp/research/bpo/report.md` with its "Ships sold at home" and "Selling blueprint copies" sections, and
`data/*.md` beside it; gitignored); revised the same day after a review against the code and the user's answers to its
open questions (Revision 1, at the end). This spec carries the facts it rests on, each with its source. The research's
own figures (its top picks, its profit a day) are one day's prices and are never copied into the app: the tab works
every figure out live, the way the research did.

## What the user asked for, and what they chose

"an industry side husltle, with the same effort we have given each other. Progression and guides and tools to help you
figure out what to manufacuture where to buy the materials and or get them near you depending on where you plan to build
and also help you find any lucrative bpo copies to sell." (9 October 2026)

Settled with them on 9 and 10 October 2026:

- **Four stages, designed together here and built in sequence without stopping** (a written spec, reviews and a final
  review, as for R&D agents): 1 what to build and how to start; 2 your blueprints and jobs; 3 copies to sell;
  4 Brave and Imperium markets through structure markets.
- **The builder is any character**, picked on the tab ("Show for", as Research and Mining). Alts are read by the cloud,
  never logged in to the app. **They will scale up across characters**: "I will probably be adding the skills to more
  and more of my characters to scale up" (10 October), so the tab has a Your characters table and an All-characters
  filter (stage 2).
- **Home prices come from Goonmetrics, read gently by the cloud** (10 October: every six hours, one call every 1.5 s, a
  User-Agent naming only the project), labelled with source and time, until the user's own structure-market reads
  work. One constant switches it off, for if its authors object.
- **Home markets are read by "all my characters but especially my main"** (10 October): each hub names its reader, the
  main by default, and any character, main or alt, can be one.
- **Industry has a share of its own**: what part of each market's pace the finder assumes you sell, typed on the tab,
  kept in the synced `industry` doc, 10% by default (the research's figure for modules), not Prospects'
  `settings.share`.
- **Built and sold is counted**: an Industry activity in Results (stage 2), so a built product's sale stops reading as
  "Sold, never bought" at its whole value.
- **The Blueprints page stays in Ledger** (the controller's ruling), reading the same `blueprints` doc as the tab.
- **They are applying to Brave** (Imperium) and can't dock in or read Brave structures yet.
- **They will never haul ships to Jita** ("too bulky expensive and risky"). Ships built in null sell at home (UALX-3,
  C-J6MT).
- **No budget yet.** Nothing is capped by ISK unless they type a cap.

**Changed from the brief, by the code**: `esi-characters.read_blueprints.v1` is already in `SCOPE` (commit 8047f8c, 29
September 2026, 12:25 +0200, the Blueprints page), and every login since has asked for it. Whether the cloud's logins
hold it today isn't visible from here: Settings (`scopesMissing`) and the Characters page (`loginState(...).missing`)
say so, and if not, the user hands them over once, as they will for structure markets anyway. **Only
`esi-markets.structure_markets.v1` is new.** The corporation scopes the user also registered (corporation blueprints,
contracts, structures, starbases, customs offices) are left out: ESI's spec requires a Director or Factory_Manager role
for them, and nothing here asks for a corporation's data.

## The facts it rests on

Settled on 10 October 2026 with public ESI calls (`User-Agent: jita-ledger (research)`, `X-Compatibility-Date:
2026-08-18`, no login; answers kept in `.playwright-mcp/research/industry-spec/`), ESI's OpenAPI spec at that date
(`.playwright-mcp/research/rd-agents/openapi.json`), CCP's static data build 3569502 (2 October 2026), the research, and
the code (file and line given where it matters).

**ESI**

- `GET /industry/systems/`: 5,485 systems, each with six indices (manufacturing, researching_material_efficiency,
  researching_time_efficiency, copying, invention, reaction), as fractions (Jita manufacturing 0.1651; the floor 0.0014).
  About 2 MB, `cache-control: public`, an hour (`Expires` = `Last-Modified` + 1 h), rate group `industry` 150 tokens a
  quarter hour. Four decimals only: EVE Ref's docs (5 November 2025) put the error at about 0.004% of a job's cost.
- `GET /industry/facilities/`: 2,321 rows, **every one an NPC station** (IDs 60,000,355 to 60,015,252), none with the
  `tax` the spec allows. So it says nothing about structures, and the NPC station's 0.25% facility tax comes from EVE
  University ("Manufacturing", "Tax"), not ESI.
- `GET /markets/prices/`: 15,988 types, every one with `adjusted_price`; an hour's cache. The estimated item value (EIV)
  that job costs are charged on is the ME 0 materials at these prices (EVE University "Manufacturing").
- `GET /characters/{id}/blueprints/` (scope held): `item_id`, `type_id`, `location_id` (a station, a ship, or a
  container's item ID), `location_flag`, `quantity` (−1 original, −2 copy, a positive count for a stack of unused
  originals), `runs` (−1 for an original), `material_efficiency`, `time_efficiency`. Paged; an hour's cache; rate group
  `char-industry`, 600 a quarter hour. `readBlueprints` in `lib/blueprints.ts` already reads this shape.
- `GET /characters/{id}/industry/jobs/` (scope held): with `include_completed=true`, jobs from the last 90 days. Each
  has `activity_id`, `blueprint_id` (the blueprint's item ID), `blueprint_type_id`, `facility_id`, `station_id`, `runs`,
  `licensed_runs`, `successful_runs`, `probability`, **`cost` ("the sum of job installation fee and industry facility
  tax")**, `duration`, start and end dates, `status` (active, cancelled, delivered, paused, ready, reverted). **No
  system index and no EIV**: what the game charged is `cost` alone. Five minutes' cache. The sync keeps only active,
  ready and paused jobs today (`meta.industry`, for To do).
- `GET /markets/structures/{id}/`: every order in a structure, paged, **no type filter** (the whole book or nothing),
  five minutes' cache, no rate group named in the spec. Without a login it answers 401 ("No token provided"). It needs
  `esi-markets.structure_markets.v1` and a character the structure lets use its market; ESI's spec doesn't describe the
  refusal, so its shape is taken from the first real one (`/universe/structures/{id}` documents "Forbidden" for anyone
  off the access list).
- `GET /universe/structures/?filter=market` lists 51 public market structures, `filter=manufacturing_basic` 290; none of
  Goonmetrics' three hubs (below) is among them, so their markets are open only to their access lists.
- Your own contract items (`/characters/{id}/contracts/{id}/items/`, scope held) say a copy only by `raw_quantity` −2:
  no ME, TE or runs, and the sync drops even that (`sync.ts:260` keeps type, quantity, included), reads items only for
  finished item exchanges (`itemsToRead`, `contracts.ts:41–44`) and keeps them for good. **ESI's public
  `/contracts/public/items/{contract_id}`** (no login, an hour's cache) gives `is_blueprint_copy`,
  `material_efficiency`, `time_efficiency` and `runs`, while the contract is public and outstanding (204 once expired
  or accepted). Contracts are read for the main only: the cloud's archive reads no alt's contracts.
- The journal's industry ref types (ESI spec): `industry_job_tax`, `manufacturing`, `industry_security_tax`,
  `reprocessing_tax`, `datacore_fee`, among others, with `context_id_type` `industry_job_id` available. Which of them a
  job writes, and with which context, is unseen. The Wallet files the job ones and `reprocessing_tax` under "Industry"
  (`wallet.ts:115`); `reprocessing_tax` isn't a job fee. The main's ME research job on a Scourge Rocket Blueprint (the
  research saw it active on 9 October, due the 8th) is the first to check.

**CCP's static data** (build 3569502; `scripts/type-materials.mjs` and `research-agents.mjs` show how it's bundled)

- `blueprints.jsonl`: 5,082 blueprints. Activities: manufacturing 4,872, copying 4,343, research_material 4,343,
  research_time 4,343, invention 1,117, reaction 120. Each with time, materials, products (invention's with a
  `probability`), skills, and `maxProductionLimit` (the most runs a copy can hold). Raw, 3.2 MB. 1,741 blueprints are
  sold on the market with a market product; 1,020 Tech II products are invented from them.
- A blueprint type's `basePrice` is its NPC seeding price where NPCs seed it (Raven Blueprint 1,135,000,000; the research
  found NPCs selling it at that in Maurasi). Products carry `packagedVolume` (a Raven 50,000 m³) for freight.
- Structures' role bonuses in dogma: 2600 material, 2601 cost, 2602 time. Raitaru 0.99 / 0.97 / 0.85, Azbel 0.99 / 0.96 /
  0.80, Sotiyo 0.99 / 0.95 / 0.70. Astrahus, Fortizar and Keepstar have none (only three faction Fortizars and the Upwell
  outposts appear in `industryModifierSources`).
- Engineering rigs: 2594 material (Tech I −2.0, Tech II −2.4), 2593 time (−20 / −24), 2595 cost (the copy rigs' −10),
  times a security multiplier, 2355 high 1.0, 2356 low 1.9, 2357 null and wormhole 2.1. Which products a rig helps is
  `industryModifierSources` (220 sources: each rig's activity, attribute and filter) with `industryTargetFilters` (18
  filters: "Equipment", "Medium T1 Ships", "Capital Components"…). The 2016 dev blog "Building Dreams" gives the same
  multipliers.
- `stationOperations.jsonl` names each NPC station's services: a Factory at 2,259 stations, a Laboratory at only 510. Of
  ESI's 2,321 facilities, 2,247 have a Factory, 510 a Laboratory, 28 neither. **Research, copying and invention need a
  Laboratory**, so a quiet station to build in is often not one to research in.
- **Alpha** (`alphaCaps.ts`, from CCP's `cloneGrades`): Industry V, Mass Production III and Science IV are usable;
  Metallurgy, Research, Laboratory Operation, Advanced Industry, Advanced Mass Production and Advanced Laboratory
  Operation aren't in it at all, so Alpha can't use them.

**The rules** (manufacturing checked by the research against EVE Ref's industry API, `api.everef.net`: to the unit and
the second on the Large Trimark Armor Pump I, and to within 27 ISK on its job cost; the others are EVE University's and
EVE Ref's, and they disagree only where said)

- **Materials**, per job: `max(runs, ceil(round(runs × base × (1 − ME/100) × structure × rig, 2)))`, rounded per job,
  not per run (Qoi, "Formulas for EVE Industry" v2.2, 2016; EVE University "Research" and "Manufacturing").
- **Time**: base × (1 − TE/100) × (1 − 4% × Industry) × (1 − 3% × Advanced Industry) × structure × rig (the skills' own
  descriptions in the static data). Tech II manufacturing adds skill bonuses EVE Ref models (its inputs list the
  advanced construction and science skills); the bundle reads each from its dogma, checked against EVE Ref on one Tech II
  item before shipping, never guessed.
- **Job cost**: EIV × runs × (system index × structure cost bonus × rig cost bonus + facility tax + SCC surcharge +
  Alpha clone tax). EVE University cites CCP's Viridian notes; EVE Ref's output splits the bonus off the index part only
  (its `system_cost_bonuses` is −4% of `system_cost_index` in an Azbel). SCC on manufacturing 4% (patch 21.06, 1
  February 2024; EVE Ref the same). Facility tax 0.25% in NPC stations, set by the owner in a structure, at most 10%
  (EVE University). **Alpha clone tax 0.25%** (EVE University; EVE Ref's `alpha_clone_tax`): the research left it out,
  the app adds it when the builder is Alpha.
- **ME and TE research**: time from the level table (`LEVEL_MOD` 0, 105, 250, 595, 1,414, 3,360, 8,000, 19,000, 45,255,
  107,700, 256,000 for a rank-1 blueprint) × rank × (1 − 5% × Metallurgy) for ME or (1 − 5% × Research) for TE ×
  (1 − 3% × Advanced Industry) × structure × lab rig. Cost: EIV × 0.02 × the level steps / 105 × (index × bonuses + tax +
  SCC). **SCC on research is 2% since 17 July 2025** (CCP, "Exploration & Industry Balance Rework", which calls it
  temporary); **what base it's charged on isn't documented** (the research's open caveat), nor whether the blueprint's
  rank enters the cost (EVE University's level table is a rank-1 blueprint's; the research read it without). A research
  job in an NPC station settles both (stage 2's job check).
- **Copying**: time = copy time × runs × copies × (1 − 5% × Science) × (1 − 3% × Advanced Industry) × structure × rig;
  cost = EIV × 0.02 × runs × copies × (index × bonuses + tax + SCC). **Sources disagree on the SCC here**: EVE University's
  copy formula has none; EVE Ref's calculator charges 4% of the job base (its copying output, 9 October: base 3,151,808,
  SCC 126,072). The app follows EVE Ref and says so, until a copy job in an NPC station settles it (stage 2).
- **Invention**: chance = base × (1 + (science 1 + science 2) / 30 + encryption / 40) × (1 + decryptor) (EVE University;
  EVE Ref's 0.4335 for a base 0.34 at skills III matches). The base is the static data's `probability`. Cost per attempt:
  2% of the Tech II product's EIV × (index × bonuses + tax + SCC 4%) (EVE Ref: base 1,638,947.87 on an EIV of
  81,947,396.54), plus the datacores. A success is a Tech II copy at ME 2, TE 4, with 10 runs, or 1 for ships and rigs
  (EVE University).
- **Slots**: manufacturing jobs 1 + Mass Production + Advanced Mass Production; science jobs (research, copying,
  invention) 1 + Laboratory Operation + Advanced Laboratory Operation; at most 11 each (EVE University "Industry skills").
- **Market fees at home**: sales tax is the character's own everywhere; a structure's broker fee is set by its owner and
  skills don't touch it (EVE University "Tax"). Neither the fee nor a structure's industry tax or rigs is in ESI.

**The code it builds on** (read on 10 October 2026)

- **The morning scan** (`worker/src/scan.ts`) folds all of The Forge's book, but stores a row in `scan_items` only for a
  candidate: two-sided in Jita with no NPC seller there (`:236`), gated on spread or among the 300 busiest, and with a
  history (`:259`). NPC sellers anywhere in The Forge are kept as a price, not a station (`foldNpc`, `:105`), and reach
  a row's `npcAnywhere` only for a stored candidate (`:128`, `:263`). The review found the research's own top picks
  (22783, 28647, 49100) absent from the 9 October export though NPCs sell their BPOs in The Forge. A run counts the
  pages it failed (`pagesFailed`).
- **The watch's flow** (`flow.ts`) compares two reads order by order (`bookFills`, `:57`) and counts no gap over half an
  hour (`MAX_GAP_H` 0.5, `:103`).
- **Held stock by place exists**: the stock record's `byLocation` (loose hangar items per station or structure) is
  counted by `countStock` in `esiRecords.ts`, which both the sync and the cloud's archive call.
- **An alt's broker fee**: `altLedger` builds an alt's settings with faction and corporation standings 0
  (`altLedger.ts:34`), and `researchChars` takes its rates from that (`researchChars.ts:113`).
- **`measuredRates`** (`standings.ts:58`) is one broker rate a day over every matched placement, wherever it was.
- **`FindStructure`** (`Reprocess.tsx:253–296`) searches with the main's browser login and hands back a refinery kind,
  security band and name, not the structure's ID, system or type.

**Goonmetrics** (`goonmetrics.apps.goonswarm.org`, read 10 October 2026)

- A Goonswarm tool ("Goonmetrics © GARPA 2012–2026"): it "gathers data from CCP" and from members' client uploads. Its
  XML API, `/api/price_data/?station_id=<id>&type_id=<up to 50, comma-separated>`, gives each type's `updated` time,
  `weekly_movement`, best buy (`max`, units `listed`) and best sell (`min`, `listed`). Its hubs (from its importing
  page, 9 October): UALX-3 "1st Byzantigoon" 1046664001931, C-J6MT 1049588174021, 1DQ1-A 1030049082711.
- **No terms are published**: no terms page, `robots.txt` answers 404, and the API page states no key, limit or
  condition. It sends **no CORS header** (none came back to a request carrying an `Origin`) and no cache headers, so only
  the cloud can read it. Its data is fresh: Tritanium at UALX-3 was updated 29 minutes before the read.
- A type with no data reads `weekly_movement` −1.0 (seen on one, with 23 listed), and a side with no orders reads 0.00
  with 0 listed: both are "not known" or "none", never a price or pace of 0.
- **Two markets at UALX-3** (the user, 10 October 2026): "Mothership Bellicose is usually the brave corp
  market/staging which means 1st Byzantigoon is probably the goons and therefor the imperium alliances market". So
  1st Byzantigoon (1046664001931, the one Goonmetrics tracks) is the Imperium's market, and Mothership Bellicose
  (Brave's wiki: UALX-3's staging Keepstar) is Brave's own, which Goonmetrics doesn't track and whose ID isn't public;
  it's added as a hub once a character of the user's can see it (`FindStructure`).

**Home and freight** (the research's sources; a figure from these is shown with its source and date)

- Brave holds 106 systems (Tenerifis 81, Feythabolis 18, Impass 7), home UALX-3; Goonswarm 509, staging C-J6MT
  (Insmother). ESI's region history for Tenerifis (10000061) and Insmother (10000009) counts the structures' trades.
- Brave Freight (Brave wiki, revised 3 June 2026; its calculator, 9 October): Jita ↔ UALX-3 900 ISK a m³ plus 0.75% of
  collateral on routes to or from high-sec, 5 M minimum, 340,000 m³ a package (130,000 to Jita); C-J6MT ↔ Jita 1,150 a
  m³; UALX-3 → C-J6MT 415 a m³, 50 M minimum.
- What the research found, as direction rather than figures: cheap module BPOs sold in Jita pay best to start and need
  no research to pay; ME 8 takes about 18% of the time to ME 10; ships built in null lose money freighted to Jita, and
  sold at home pay only for some hulls, at prices local builders already set; copies that sell are ME 10 / TE 20, so a lab
  slot copying earns less than a factory slot building; Brave gives members researched copies free, so copies don't sell
  at home; Tech I beats invention for a beginner.

## The tab

**Industry** (`hustles/industry`), the seventh Side hustles tab: "Industry", "What to build, where, and what it pays".
Seven tabs don't sit in one row at 1440 at today's 172 px minimum (the page is about 1,146 px wide there with the
sidebar open, less the panel's padding): the minimum goes to what fits seven, checked by the page check at 1440, or the
blurbs shorten; no tab wraps alone.

Five sections, a `Seg` under the intro, and in the address (`hustles/industry/<section>`): **Start** (the ladder),
**Build** (the finder), **Blueprints & jobs**, **Copies**, **Home markets**. Each is a stage's, and each works without the
later ones. The Side hustles Guide gains an Industry step ("Pick where you build, find what pays there, research ME
before you build much").

**What's kept where.** Decisions, what you'd do in game, are synced in the `industry` doc and so the same on every
device: the build sites, freight routes, typed facility taxes and broker fees, the industry share, the ships-to-Jita
switch, the ME/TE assumed for a BPO you'd buy, the default site and where to sell. View state is kept per browser: the
section (`jita-ledger:industry-section`), Show for (`-show`), the All-characters filter (`-char`), the finder's kind,
"Can build now", "BPO up to" and sort (`-finder`), and which detail is open.

**Show for** (as Mining's and Research's): the main or an alt, falling back to the main when the alt is gone, without
forgetting the kept one. It drives whose skills, clone state, broker fee and sales tax, blueprints, jobs and held
materials every figure uses. The skills come through the existing pilot (`usePilot`, `PilotProvider`); the rest through
`useIndustryChars(alts)`, which takes `useAlts()` from `Industry.tsx` (the one file here allowed to import the alt store)
and writes nothing. **An alt's Jita broker fee comes from its read standings** (its `meta.standings`: Caldari State and
Caldari Navy, Jita 4-4's owners, each raw standing floored at 0, as the main's sync fills `settings.faction` and
`settings.corp`, `sync.ts:161–162`), not `altLedger`'s zeros; one not read yet says "standings not read: broker fee at no
standing". Set destination is the main's only, labelled "Sets <main>'s destination" under an alt.

**Build sites** (where to build), in the `industry` doc. A site is: a system, a kind (NPC station, or a structure:
Raitaru, Azbel, Sotiyo, or a citadel with no bonus), its rigs (none, Tech I or Tech II, per rig the bundle names for the
products it builds), its facility tax, and for a structure its name and ID. Three ways to add one:

- **A quiet NPC station near Jita**: the app lists high-sec NPC stations with a Factory (and those with a Laboratory)
  by manufacturing index and high-sec jumps from Jita (`/industry/systems`, the static data's services, the bundled
  stargate map), the quietest few within `NEAR_JITA_JUMPS` (10, said in the copy). Tax 0.25%, no rigs, known.
- **A structure found by name**: `FindStructure`, refactored out of Reprocessing into its own component, returns the
  structure's ID, name, system, security and type; it searches as a chosen character: the main in the browser (as now),
  an alt through the cloud (`POST /v1/structures/search`, with the alt's search and structure permissions, both in
  `SCOPE`). Reprocessing keeps its refinery kind from the type (`siteFromStructure`). Rigs and tax typed.
- **Home**: a system picked from the map (UALX-3 offered first, as the user's planned home), a structure kind, rigs and
  tax typed, labelled "typed by you"; with no structure ID it holds nothing known (below).

A structure's facility tax that hasn't been typed reads "–: type it from the Industry window, or run a job there and the
app measures it". **Measured from your jobs** (stage 2, rules below): once a manufacturing job there gives a measure,
the site offers it with **Use this** ("Your job of 9 Oct there paid 1.00%: Use this"), as the fee override's **Use
these** (app-conventions); it never replaces the typed figure by itself.

## Stage 1: what to build and how to start

### Start: the ladder

Lead: "Industry turns materials into things that sell. You need a blueprint, a factory slot, and somewhere to build." Then
three points: a blueprint original builds for ever and can be researched and copied; what limits most items is what the
market takes, not your factory; nothing has to move to null-sec to start.

A ladder (`.ladder`, as Planets) of seven rungs, each with what it opens, the skills it needs as a `SkillStrip` at the
shown character's pilot (pips, queue, training time at its attributes), and what it pays **now** (the best few finder rows
that rung opens, at this character's skills, live):

1. **Build in a high-sec NPC station.** Industry, Mass Production; a cheap BPO bought from NPCs.
2. **Research ME first.** A Laboratory station, Laboratory Operation, Metallurgy, Research; ME 8 for a fraction of ME
   10's time (the level table, said in days at this character's skills).
3. **More slots.** Mass Production V, Advanced Mass Production; Laboratory Operation V, Advanced Laboratory Operation.
4. **Copy, and sell copies.** Science; copies keep ME and TE; stage 3's finder.
5. **Build at home.** An Azbel or Raitaru with rigs in null-sec (the rig multiplier), materials local or freighted, ships
   sold at home. Says what isn't known until docked: the structure's tax, rigs and broker fee.
6. **Tech II through invention.** Science V, the item's two sciences, its encryption skill; datacores, which R&D agents
   make (a link to Research).
7. **Capitals.** Industry V, Advanced Industry V, Capital Ship Construction, a Standup Capital Shipyard; sold on
   contracts, not the market, so the finder doesn't price them.

**Alpha**: a skill Alpha can't use, or caps below what a rung needs, says "Needs Omega" from `alphaCaps.ts` for the main
too when its clone is Alpha (the main's pilot carries no `capped`, so the rung reads the caps itself), and "Clone state
not read" where it's unknown, never "Alpha". Rungs 2, 3, 6 and 7 need Omega (Laboratory Operation, Metallurgy,
Research, Advanced Mass Production, Science V, Advanced Industry).

**Where you stand.** Until stage 2's reads, "You're here" is by skills alone and says so ("by your skills; your
blueprints and jobs aren't read here yet"), and a rung's slots are its capacity from skills. From task 10 it also reads
originals held and jobs run, and slots in use. Each rung's count of blueprints it opens comes from the bundle's skills
against the pilot's. The "pays now" rows are the finder's own; with nothing ranked yet, "Working out what pays…", and
with no scan in the browser, the finder's own "Scan" words.

### Build: the finder

Lead: "Every blueprint sold on the market, worked out for your build site, your skills and where you'd sell." Points:
profit a day is for one factory slot, capped by what the market takes at your industry share; materials come from
wherever is cheapest delivered; nothing is sold where you said you wouldn't.

**Choices**: the build site; where to sell (Jita, a home hub, or either: best of the two); **never haul ships to Jita**
(on by default, in the user's words; on, a ship built at a site outside high-sec, or more than `NEAR_JITA_JUMPS`
high-sec jumps from Jita, is sold at home or not at all); the **industry share** (10% by default, said beside it: "the
part of each market's daily trade you'd sell; the research used 10%"); ME/TE to assume for a BPO you'd buy (0/0 by
default, with 8/0 and 10/20); and, per browser, kind (rigs, modules, ammo and charges, components, drones and fighters,
deployables, hulls by size, fuel blocks, structures, capital parts, from product groups), "Can build now" (skills) and
"BPO up to" (blank: no cap).

**A row**: the product (name, kind); the BPO's price and where (below); profit a unit; one slot a day (makes / you can
sell, and which limits it: "the market" or "the slot"); **profit a day, one slot**; payback on the BPO; skills lacking.
Sorted by profit a day.

**The BPO's price and where.** The morning scan saves the NPC sellers of every bundle blueprint, price **and** stations,
as a row of its own (`industry_npc`, with whether the run read every page), whatever the candidate gate. D1 keeps the
latest complete row and, beside it, any newer partial one (a carry-on run re-reads every page), and only those two;
`GET /v1/industry/npc` returns both, and the browser reads the complete one, with the partial one's newer sellers on
top. A row then says:
- NPCs sell it in The Forge: "X at Maurasi (and 2 more)", with payback;
- not in this morning's read and the read was complete: "NPCs don't sell it in The Forge; CCP's base price X", no
  payback until the detail's region read finds a seller ("NPCs sell it in Domain at X");
- not in it and the read was partial: "No NPC seller found (this morning's read missed N pages); base price X", no
  payback.

**Untyped tax or broker fee doesn't blank the finder** (the user's own case: a home they can't dock in yet). Profit
ranks **before the facility tax** where a site's tax isn't typed or measured, said in the column head ("Profit a day,
before the facility tax"), with "each 1% of tax costs X a day" beside it; likewise before the broker fee at a home hub
with no fee typed or measured. Once typed or measured, the profit after them shows and the head drops "before".

**The figures**, all pure and tested:

- **Materials** per unit at the site (the job rules above), a job being a day of runs (the research's choice; a copy's
  runs cap it), each priced by its **source** (below). The ME is the BPO assumed, or the character's own blueprint when it
  holds one of that kind (stage 2).
- **Job cost**: the rules above, with the site's index, kind, rigs and tax, the SCC, and the Alpha tax when the builder
  is Alpha ("Clone state not read: the 0.25% Alpha tax is left out" when unknown; never called Alpha).
- **Selling**, per place:
  - **Jita**: `listingPrice` (fills.ts) on others' book, after the character's broker fee and sales tax, less freight
    from the site; into bids, `walkBids` after tax. Pace: `paceDay` × the buyer/seller split (`tradingSplit`) per side.
  - **A home hub**: Goonmetrics' best sell less one tick (or the structure's own read, stage 4), checked against the
    home region's history highs with the same reach rule (`listingPrice`'s, on Tenerifis' or Insmother's 14 days), after
    the character's sales tax and the hub's broker fee. Pace: the home region's `paceDay` × the split from
    `tradingSplit` (the structure read's sold counts when there is one, else history's guess, `buyerShare`, on the
    home region's history, else even), so a market that sells into bids isn't counted as buyers taking listings.
    Goonmetrics' weekly movement sits beside it, labelled.
  - Each side's sales are capped at the **industry share** of its pace, and both together at what the slot makes.
- **Freight**: a route from the `industry` doc (ISK a m³ of packaged volume, a collateral share, a minimum per
  contract), applied to materials in and products out. Brave Freight's published routes are presets, shown with "Brave
  wiki, 3 June 2026" and editable; none is applied until picked. A minimum is spread over a batch of a week's sales,
  said. Built in high-sec near Jita, "you carry it: N jumps, X m³" and no ISK, unless a rate is typed.

**Sourcing, per material at the site** (`sourceMaterial`), for the steady profit a day: the cheapest delivered of

- **Jita**: the best ask now plus freight in (the patient price, `reachedBid`, beside it: "if you wait for a bid to
  fill");
- **the home hub**: its best sell, only where the hub moves at least ten times the week's need (`HOME_DEPTH` 10, the
  research's rule, said in the tip), else "too thin to buy a week's need";
- **mined**: valued at what it would sell for (the home bid, else Jita's), never free, with the ore that refines into it
  best at the character's yield (`reprocess.ts`, `typeMaterials.json`) and a link to Mining's Best ore.

**Held materials** are the builder's loose hangar stock at the site (the stock record's `byLocation`, the main's from its
sync, an alt's from the cloud's hourly read; a site with no structure ID holds nothing known, said). They're one-off and
carry no freight in, so they count in **start-up** and the **shopping list** (bought less what's held, at what it cost
you, `heldCost`), never in the steady profit a day.

The detail lists every material with its quantity, each source's price, the one picked and why.

**The detail** (a row opens under itself): materials as above; the job's time and cost broken down (index, structure,
rig, tax, SCC, Alpha); the sale per place with its pace and source; **ME levels** (profit a day at ME 0, 6, 8, 10 and
10/20, and research days and cost to each at the site, or the nearest Laboratory when the site has none); where NPCs
sell the BPO (the morning's Forge stations, and on opening `/markets/{region}/orders?type_id=` over the other regions
NPCs seed, a handful of requests, each station named with its jumps from Jita and from the site); **start-up**: the
BPO, research to the chosen level, and a day's materials less what's held; a **shopping list** (what to buy beyond
what's held, per source) with Copy for Multibuy (`copyMultibuy`, the Jita part, saying its total at the asks just read);
and **its steps** (a `.ladder`, the guide for this item): buy the BPO at <station> (Set destination), research it to the
chosen ME at <laboratory> (its time), buy the materials, install the job at <site>, list at <place> (the price to list
at, copied); from stage 2, each step ticks itself off once a read shows it done (the original held, its ME reached, the
job running, the product listed), never on absence.

**Tech II** (the last task of stage 1): a Tech II product is costed through invention: attempts = 1 / chance at the
builder's skills, each attempt's datacores (Jita asks; the Research tab's datacores the builder holds count in start-up)
and job cost, the Tech I copy's copy cost, then manufacturing at ME 2 / TE 4. Decryptors aren't modelled, and the row
says so. Reactions aren't modelled: their products are bought.

**Data it reads**: the cloud's morning scan the browser already adopts (Jita books and history), which from this stage
on also stores the bundle's types (the watch set, below) and the NPC sellers' row; `/markets/prices` and
`/industry/systems` (each an hour, shared in flight, `shareInFlight`); the home region histories for ranked products,
read on demand; home prices from the cloud. Ranking runs in the browser over the bundle (the 1,741 Tech I products, and
the Tech II ones from task 8), first on the scan, then the top 40 rows on live books (`jitaBook`), the Loyalty pattern;
a row still on the morning's book says "this morning's book" in its tip. `typeMaterials.json` (481 KB) loads only when a
detail opens (for the mined source); `universeGraph.json` (287 KB) with the tab, for the sites' jumps.

**The scan's watch set.** `worker/src/scan.ts` reads the bundle's types (`industryTypes.json`) as well as its candidates,
bypassing the two-sided and NPC-seller filter (`:236`), and marks them `watchOnly` in their book so Prospects, Busy
markets, the planner, the opportunity mail, **the Sniper** (its stats read, `worker/src/snipe.ts:128`, which mails, and
the browser's `findListing`, `snipe.ts:110`, which skips an item without scan stats) and **Hub arbitrage's busiest**
(`Arbitrage.tsx:67`, which reads every scan row) leave them out (a browser a version behind would rank them until it
reloads, minutes). A type with no Jita order or no history still gets no row (`:259`): the finder says "No Jita book
this morning" for it.

**Every state says what it is**: the bundle loading ("Loading the blueprints…") or failing (Try again); no scan in the
browser ("No market scan here yet: the cloud's comes every morning", with Prospects' link); no Jita book or history for
an item ("No Jita book this morning", no profit); indices or adjusted prices not read ("Reading the industry indices…",
and no job cost); a system ESI lists no index for ("ESI lists no industry index for X"); home prices not read yet,
failed, switched off, or older than a day (said with their time); a hub listing none ("none listed at UALX-3"); weekly
movement unknown ("–"); a blank tax or broker fee (ranked before it, above); no freight route ("–" with what to pick). No
"0 ISK" stands for anything not known.

### Home prices from Goonmetrics (stage 1's cloud part)

The cloud reads Goonmetrics for the hubs in a constant (UALX-3 and C-J6MT; 1DQ1-A is left out: the research found almost
nothing listed there), for the watch set (`industryTypes.json`: the 1,741 products and their 397 materials, 1,926 types,
39 calls a hub; with Tech II, task 8, 2,915 types, 59 a hub; counted on the static data), one call every 1.5 s, every six
hours, after the alts' hourly read on the `37 * * * *` cron (no new cron: a new one took 26 minutes to first fire). Each
hub's read is one D1 row (`home_prices`), a compact blob by type with each type's own `updated`. `GET /v1/home/prices?hub=`
returns it. A failing read keeps the last good one, three failures in a row end the round, and it isn't a watched job:
as with Abyss Tracker (the user's choice of 30 September), it's someone else's site and the page says how old its
figures are. The User-Agent names the project only, no contact details. **`GOONMETRICS_ON`** in the Worker switches it
off (for if its authors object); off, the route answers "switched off" and the tab says Goonmetrics isn't read.

## Stage 2: your blueprints and jobs

**Reads**:

- **Blueprints**, per character, into a new synced document `blueprints` (`{ list: [itemId, typeId, locationId, flag,
  quantity, runs, me, te][] }`, sorted by item ID). Absent is not read; an empty list is read. The main's browser sync
  reads it (an hour's cache) and writes the doc only when the list changed; its read time is `meta.blueprintsAt`,
  synced as Research's `at` is (the main's meta goes up every sync anyway). The cloud's hourly alt read (`sheet.ts`)
  reads an alt's into the alt's doc, with no read time in it (the R&D lesson: a time would be a revision every hour); its
  read time is the `sheet` job's `lastOk`. A failed read keeps what's held.
- **Jobs**, per character, as records of a new kind `jobs`, keyed by job ID, every status, read with
  `include_completed=true` (90 days) and kept past that, as mining records outlive ESI's 30 days. **The main's** are
  read by its browser sync each sync (five minutes' cache) and by the cloud's hourly archive (`:07`, job `archive`), so
  a job is first seen within the hour even with no browser open. **An alt's** blueprints and jobs are both read in its
  hourly sheet read (`sheet.ts`, `37` cron), and **its `sheet` job's `lastOk` dates both**, for the reads, the tab and
  To do's seenAt alike. **At first sight, while the job is active**, its record keeps what
  ESI's job doesn't say: the blueprint's ME and TE as last read for its item ID (none read is "not known", never 0),
  the job's system (`/universe/stations/{id}`, or `/universe/structures/{id}` with the reader's login), that system's
  index for the activity, and the EIV a run at that hour's adjusted prices (`/markets/prices` with the blueprint's ME 0
  materials from `src/data/industryEiv.json`, below), with `seenAt`. A job first seen after it ended has none of these.
- **Two writers merge, never overwrite** (`mergeJob`, pure). A record travels whole and a browser's unsent record wins
  on pull (cloud.md), so a browser that first saw a job after it ended would push a record without first-sight fields
  over the cloud's. So every writer merges onto the stored record: the browser's sync onto its local one, the archive
  and sheet onto D1's, the Worker's push for kind `jobs` onto D1's (the one kind it merges), and the browser's pull onto
  its local one. First-sight fields, once present, are never dropped; the earliest `seenAt` wins; ESI's own fields
  (status, end, cost) take the newest read. Tested with the browser seeing the job late, before and after the cloud's
  record comes down.
- **A Worker a version behind refuses a whole push carrying an unknown record kind** ("Unknown record kind: jobs") and
  there's no handling for that today, only `refusedDoc`. So stage 2's first task adds `refusedKind` beside it (the push
  is sent without that kind, which waits), and an older browser ignores a kind it doesn't know.

**The job check, and what it measures** (`jobCheck`, `measuredTax`):

- A finished job is checked only when first seen within `FIRST_SIGHT_MS` (90 minutes: ESI holds jobs five minutes and
  the cron sometimes starts late, so an alt's job started just before a `:37` read is first seen 61 to 65 minutes on) of
  its `start_date`, with its index
  and EIV kept: the app's cost, worked out from those, against ESI's `cost`. Differing by more than 1%, it says so ("The
  app worked out 1.21 M; EVE charged 1.25 M") with the parts.
- **Facility tax is measured from manufacturing jobs only**: (`cost` − EIV × runs × (index × bonuses + SCC + Alpha
  tax)) ÷ (EIV × runs), at a site whose kind and rigs are set; offered with **Use this**, never applied by itself.
- **The SCC bases of research and copying are settled from jobs in NPC stations only**, where the tax is known
  (0.25%): the residual says which reading holds (2% of the job value or not; rank in or out; copying's 4% or none),
  recorded in the notes and then fixed in the constants, not learned at run time.
- An alt whose clone state is unknown can't measure (the Alpha tax may be in the cost), and says so.

**Blueprints & jobs** (the section): lead "What your characters hold and have running." An **All-characters filter**
beside Show for (All, or one character; Mining's rule: picking in the filter lets go of Show for, which then follows the
filter's character, the main for All). Then:

- **Your characters** (as Mining's): one row a character: factory slots in use / free, science slots in use / free, jobs
  ready, originals and copies held, and the industry skills it still lacks for its next rung with their training time
  at its attributes ("Laboratory Operation III, Metallurgy IV: 3 d 2 h"; Alpha's "Needs Omega"); the fleet's totals
  under it (slots, jobs ready, blueprints). An alt not read says so across its row ("Not read yet: the cloud's next
  hourly read", or to hand its login over again), never zeros; a total counts only characters read and says how many.
- Tiles for the filter's characters: originals, copies, factory slots in use of free, science slots in use of free,
  jobs ready to deliver.
- **Blueprints**, one row a kind (character under All, product, original or copy, ME/TE, runs, how many, where: station,
  structure or the container's name), with what it builds at the default site (the finder's profit a day for it at its
  own ME/TE, **worked out at that row's own character's pilot, broker fee and sales tax**, under All too, never the
  main's or Show for's), and for an original its next research step ("ME 4 → 5: 6 h 10 min and 1.2 M at <site>"). "Price for
  selling" links each kind to the Blueprints page.
- **Jobs**: running and ready, with character, activity, product, runs, where, and time left (`useNow`); finished ones
  of the last 30 days with **what the job cost** (ESI's `cost`) and the job check above.

Nothing of an alt's goes into the main's ledger (characters.md): the tab reads each alt's pulled copy and writes nothing.

**The Blueprints page** stays in Ledger and reads the same doc: it shows the stored read with its time, and its read
button does a fresh read that writes the doc. No second reader.

**Built and sold** (the stage's last task). Today a built product sold reads on the Wallet and in All income as "Sold,
never bought" at its whole sale value, while the materials bought for it count nowhere (not play, not resold), so All
income overstates industry by every material bought. An **Industry** activity in Results (and so in All income and a
Characters card's Earned) counts, per character:

- **One claim order**: Industry claims first, the product's sales no position counts (a trade a position counts stays
  trading), oldest sales first, up to the units its delivered manufacturing jobs made (records, runs × units a run),
  claimed by trade ID and units (a sale can be split). **Built types don't join the activity sets**: those apply to a
  whole item (`incomeRows` drops an item in them from "Trading, every item" and "Sold, never bought",
  `income.ts:87–89`, and `otherSales` skips its sales, `results.ts:143`), which would take an item both built and bought
  out of trading entirely. Instead **the claims are passed in**: `everyItemCalcs` (the claims in its memo key),
  `otherSales` (`results.ts:137–147`) and `neverBought` (`income.ts:89`) take each claimed sale's claimed units off it
  and see only what's left, so an item both built and bought keeps its bought part's profit in trading. Tested.
- **After tax, less the job fees** (the journal's job entries, by job where the context names one; never
  `reprocessing_tax`), **less the materials each job used** (the bundle at the job's recorded ME, with the bonuses of the
  site it ran at when that facility is one of the user's sites, else none, said), costed at the character's own latest
  purchases before the job, each purchase once (the Freelance rule). Materials it never bought (mined, looted, from
  before) are said apart, never costed at 0; a job with no recorded ME says its materials aren't known.
- Copies sold on contracts join it in stage 3. The recorded ledgers hold no jobs, so `npm run check-income` passes
  unchanged; a case of its own tests it, an item both built and bought among it.

**Every state**: blueprints or jobs not read ("Not read yet: the next sync", or for an alt "the cloud's next hourly
read"); the main's login without the permission ("Log in again"); an alt's login without it ("Hand the cloud X's login
again"); an alt's login refused or not kept (its words from `lostSaid`); a container not named (its type, as Check my
hangar).

## Stage 3: copies to sell

**Copies** (the section): lead "Researched originals can make copies that sell on contract." Points: buyers pay for the
research, so the copies that sell are ME 10 / TE 20; a lab slot copying adds to building rather than replacing it; Brave
gives its members copies free, so copies sell in The Forge, not at home.

**What sold, read every six hours.** Two snapshots seven days apart miss a contract listed and sold within the week
(`vanishedSince` sees only the older snapshot's contracts, `bpContracts.ts:98–104`). So on the `37` cron, every six
hours, the cloud unpacks EVE Ref's latest snapshot, keeps The Forge's single-kind copy contracts as a compact set
(contract, kind, runs, quantity, price, issuer, expiry, item IDs: 11,267 contracts, 1.13 MB, 242 KB gzipped on the
research's 9 October snapshot, under D1's 2 MB row; split by type range if it nears 1.5 MB), compares it with the set it
kept last time, and appends each contract that vanished before expiry (reprices by the same issuer left out, as
`vanishedSince` does) to `copy_sold`, kept eight days. A contract listed and sold within six hours is still missed, and
said. `GET /v1/copies` sums the last seven days of `copy_sold` per kind (type, ME, TE, runs): contracts and runs sold,
sellers, the median price a run sold, and the current set's cheapest ask a run.

**The finder**: every kind sold in the last seven days, at the shown character: copy time and cost a run at the chosen
site (the copying index, a copy rig if typed), runs a lab slot makes a day, runs a day at the **industry share** of what
sold, ISK a day for one lab slot, the BPO's price, research to the kind that sells (days and cost at this character's
skills and the nearest Laboratory), payback, and "building instead" (the finder's profit a day for one factory slot). A
kind with under three sales a week or one seller says so ("1 seller: one person's prices"). Before the first week of
reads, "Counting what sells: N days so far".

**Your copy business**: copy jobs running and done (stage 2's jobs); copies held (the blueprints doc, with "Price for
selling" to the Blueprints page); **your copy contracts**: your item exchanges whose items are all copies. The sync
widens `itemsToRead` to your outstanding item exchanges, keeps `raw_quantity` (dropped today), and reads each public
outstanding one's kinds once from ESI's public `/contracts/public/items/{id}` (ME, TE, runs; no login); a private one
says "kinds not known: a private contract isn't public". Status from the sync's own read: listed (with the current set's
cheapest ask of the same kind beside it), sold, expired, deleted. Sold copies count in the Industry activity: the
contract's price less the copy jobs' fees for those runs. **Contracts are read for the main only**, so under an alt the
section says "<alt>'s contracts aren't read: the cloud reads an alt's wallet, orders and assets, not its contracts".

## Stage 4: home markets

**Home markets** (the section): lead "Prices at home, from Goonmetrics until a character of yours can read the market
itself." A hub is a structure with a name and **a reader**: the character whose login reads it, the main by default, any
character the user picks (the user: "all my characters but especially my main"). The list starts with Goonmetrics' two
(UALX-3 1st Byzantigoon, the Imperium's market, and C-J6MT), and a character who can see a structure adds one with
`FindStructure` as that character (the main in the browser, an alt through the cloud): Brave's own Mothership
Bellicose at UALX-3 first among them, which the section names as the one to add once a character has docking access
("Brave's market at UALX-3, Mothership Bellicose: add it once one of your characters can see it").

**Reading a structure's market**: the cloud reads `/markets/structures/{id}` hourly on the `37` cron with the reader's
login, folding page by page (the fold moves from `worker/src/scan.ts` to `src/lib/bookFold.ts`, so the scan and this
share it) into a summary for **the watch set's types only**: best bid and ask, units at the best few levels, order
counts, and what the live orders have sold (`volume_total − volume_remain`, by side) from that one read. One D1 row a
read (`home_books`), small since it's the watch set only, and the last good one kept. No order-by-order comparison
between reads: `bookFills` counts no gap over half an hour and keeps orders, not a per-type summary, so home pace stays
the region's history, with the read's sold counts as the split (above). `POST /v1/home/read` reads one at once, for the
first time after adding.

**Which price speaks**: the structure's own read, when one is under two hours old; else Goonmetrics', labelled with its
time; else none. The finder, the detail and the ladder say which.

**The broker fee there** is typed per hub, else **measured** from the reader's own orders there once it places some:
`feeMatch.ts` already matches broker fees to orders by the second, and the measure is `measuredRates`' rule over that
hub's orders only (its `locationId`), offered with **Use this** as the facility tax is.

**Every state**: the reader's login without the permission ("Log in again: reading a structure's market needs EVE's
permission for structure markets", or for an alt "Hand the cloud X's login again"); refused ("EVE refused <char>'s read
of <hub>: it isn't on its access list. Goonmetrics' prices stand in."); not read yet; read, with its time; failing, with
the last good read's time.

## Permissions

`esi-markets.structure_markets.v1` goes in `SCOPE` with its `SCOPE_INFO` entry (label "Structure markets"; unlocks: home
prices from a structure's own market, for Side hustles → Industry; without: home prices come from Goonmetrics alone),
in stage 4's first task. **Every login then asks for it**, and a login with a different set of permissions stops the
character's earlier logins (eve-facts.md): the user's next login stops the cloud's main login and the alt's, and any
other device's login, so **they hand the cloud the main's and every alt's logins again** and log in again on the phone.
Settings' `scopesMissing` and the Characters page's `loginState(...).missing` already say so; the mail sender's login,
with its own set, is untouched. Read blueprints, industry jobs, structure search and structure names are already held,
so stages 1 to 3 need no new permission and no relog.

## Pure rules and I/O

Pure (`src/lib`, no `./config`, store, React or DOM; tested in `npm run check`; the Worker may import them):

- `industry.ts`: `materialsFor`, `jobTime`, `jobCost` (with its parts), `researchTime`, `researchCost`, `copyTime`,
  `copyCost`, `inventionChance`, `inventionCost`, `slots`, `rigFor` (which rig applies to a product), `secBand`, `eivOf`,
  the constants (`SCC`, `SCC_RESEARCH`, `SCC_COPY`, `ALPHA_TAX`, `NPC_FACILITY_TAX`, `LEVEL_MOD`), each with its source.
- `industryRank.ts`: `sourceMaterial`, `sellAt` (Jita and home, with or without the tax and fee), `freightCost`,
  `shipToJita` (the switch, by site), `slotDay` (what limits it), `rankBuilds`, `meLevels`, `startUp`, `shoppingList`,
  `bpoWhere` (the NPC row's three cases).
- `industryLadder.ts`: the rungs, what each opens against a pilot, Alpha's "Needs Omega" from `alphaCaps`, "you're
  here" with or without stage 2's reads.
- `industryTrack.ts`: `readJobs`, `firstSight`, `mergeJob`, `slotsUsed`, `jobCheck`, `measuredTax`, `charRows` (Your
  characters), `builtClaims` (trade ID and units) and `builtAndSold`, `builtItems` (To do's held-units rule).
- `bookFold.ts` (moved from the Worker's scan): `fold`, `Agg`, `foldPage`, and `foldStructurePage` over it.
- `homeMarket.ts`: `parseGoonmetrics` (−1 and 0 as not known), `homeSummary`, `homePrice` (which source speaks),
  `hubFeeRate` (`measuredRates` over one hub's orders).
- `copyMarket.ts`: `compactCopies`, `copiesSold` (two sets, with `vanishedSince`'s reprice rule), `copySummary`,
  `copyRow`.

I/O: `components/hustles/Industry.tsx` and its section files, `components/FindStructure.tsx` (out of Reprocess.tsx),
`industryChars.ts` (as `researchChars.ts`, with the alt's read standings), `industryMarket.ts` (books, histories,
indices, prices, shared in flight), `industryBundle.ts` (the chunks); `lib/sync.ts` (blueprints, jobs, contract
items); `worker/src/archive.ts` and `sheet.ts` (jobs and blueprints), `worker/src/goonmetrics.ts`,
`worker/src/homeMarkets.ts`, `worker/src/copies.ts`, `worker/src/structures.ts` (the cloud's search);
`worker/src/scan.ts` (the watch set, the NPC row).

## Data

- **The bundle** `src/data/industry.json`, built by `scripts/industry-bundle.mjs` from the static data zip (`SDE_ZIP=`
  to reuse a download, as `research-agents.mjs`): the 2,693 blueprints sold on the market and the Tech II ones invented
  from them, in integer tuples (blueprint, max runs, each activity's time, materials, skills, products and invention's
  probability); per type its English name, group, category, packaged volume and base price (5,666 types); the 220
  modifier sources with their dogma values and the 18 filters; the 2,305 NPC stations with a Factory or Laboratory and
  their systems; the industry skills' ranks and attributes. Re-measured with all of that (10 October 2026): 1.11 MB,
  141 KB gzipped (`scripts/bundle-trial.py` under `.playwright-mcp/research/industry-spec/`). **Budget: 1.2 MB, 160 KB
  gzipped**, its own chunk, loaded by the tab only; the Tech II part can split into a second chunk if it grows.
- `src/data/industryEiv.json`: every published blueprint's ME 0 manufacturing materials (4,038 blueprints, 276 KB, 51 KB
  gzipped), the one thing the readers need to keep a job's EIV at first sight: the sync `import()`s it only when a job
  not seen before appears; the Worker imports it (its first JSON imports, with `industryTypes.json`: task 5).
- `src/data/industryTypes.json` (type IDs only): the watch set the cloud's scan, Goonmetrics and the structure reads use.
- **Synced docs**: `blueprints` (above); `industry` (the decisions listed under "What's kept where"), sanitized by
  `sanitizeIndustry` on disk and on pull. Both go in the Worker's and the browser's `DOC_KEYS`, `Data` in `store.ts`,
  `emptyData`; a Worker a version behind refuses them and `refusedDoc` holds them back, as `leaveFrom`. Not in `prefs`:
  an older build's save drops what `sanitizePrefs` doesn't know. Which hubs the cloud reads, and with whose login, live
  in D1's `home_markets`, since the cloud acts on them.
- **Records**: kind `jobs` (above), in both `RECORD_KINDS`, with `refusedKind`. `meta.blueprintsAt` in the main's meta.
- **The stock record** is unchanged: `byLocation` is already there.
- **The alt's copy** (`altStore`, `altLedger`) pulls `blueprints` and `jobs` with the rest; nothing of an alt's is
  written to the main's ledger.
- **D1, one migration per task that needs it, each only adding, never editing one already applied** (numbers are the
  next free ones when built): task 5, `industry_npc (run, at, complete, data)`; task 6, `home_prices (hub, source, at,
  data)`; task 14, `copy_set (at, data)` and `copy_sold (contract_id, type_id, me, te, runs, qty, price, issuer, at)`;
  task 18, `home_markets (ledger, structure_id, name, reader, added_at, removed_at)` and `home_books (structure_id, at,
  data, error, refused_at)`.

## The cloud's part, and its budget

- **Blueprints and jobs**: two more reads in each alt's hourly sheet read and one (jobs) in the main's hourly archive
  (`char-industry`, 600 a quarter hour), pushed only when changed; `/industry/systems` and `/markets/prices` read when a
  job not seen before appears. A job writes a row a few times in its life (active, ready, delivered).
- **The scan**: the watch set's histories (the gate skipped 187 of the Tech I products the research ranked: a few hundred
  more inside its 11-minute budget, about 15,000 today), a few hundred more `scan_items` rows a day, and one
  `industry_npc` row a run.
- **Goonmetrics**: 78 calls every six hours (312 a day), 118 (472) once Tech II is in, two D1 rows a refresh, about 2 to 3
  minutes of wall time after the alts' read; no CPU of note.
- **Copies**: one EVE Ref snapshot (about 6 MB) unpacked every six hours (about 2 s, the Blueprints route's measure),
  one `copy_set` row and about 320 `copy_sold` rows a day (2,231 a week sold, the research).
- **Structure markets**: one read a hub an hour with its reader's login, page by page, one small D1 row each; on the
  hourly cron's 120 s of CPU, never in the five-minute round (30 s). A hub's page count is unknown until read.
- Together: well under 1 M of the plan's 50 M D1 row writes a month. No new cron.

## To do

Thin, and every judge answers only from a read newer than the one that showed the item (orders-alerts.md: absent is
not done).

- **An alt's jobs to deliver** (kind `industry`, source `industry`): the main's stays `industry:<place>` (unchanged, so
  no remembered item reopens); an alt's is `industry:<char>:<place>`, version the job IDs, built from its `jobs` records.
  Its `seenAt` is that alt's `sheet` `lastOk`, not the main's `industryAt` (Todo.tsx's dispatch by source picks the
  main's today, `:429`), and its judge reads that alt's `jobs` records for the waiting set and its `lastOk` as the read
  time, only on a roster read of this session (`rosterLive`, as `judgeAltLogin`), never the main's `meta.industry`
  (`:504`). An alt gone from a live roster just goes.
- **List what you built** (kind `built`, Needs action): one item per character, product and place, once products of
  delivered manufacturing jobs sit loose in that place's hangar (`stock.byLocation`), with the price to list at (Jita's
  or the home hub's, as the finder's) copied on opening. Key `built:<char>:<type>:<place>`, **version the delivered job
  IDs** (not the units, which move with every listing). **Built only while the place holds at least the units those
  jobs made**: the newest delivered jobs of that product there, newest first, as long as the place holds at least their
  units together. `remember` refreshes an item the build still produces as open and judges only one it no longer does
  (`todo.ts:139–145`), so once fewer are held the item isn't built, and its judge, on a stock read newer than the one
  that showed it, says "Listed, sold or moved: 10 left": building 50, listing 40 and keeping 10 ends it, and the next
  delivery (new job IDs) reopens it. In `HOLDS_UNTIL_CHANGED` (`todo.ts:85`): a hand tick holds by its version, the job
  IDs, until another delivery. Seen on the stock read it was built from.
- **A copy contract that expired** (kind `copyContract`): your outstanding item exchange of copies past its expiry,
  keyed `copies:<contractId>`, version `1`, done when a newer contracts read shows it deleted or finished.

Nothing for idle slots or idle blueprints (the user's "not too tight"), and nothing mailed.

## What it won't do

Install, deliver or cancel a job, or place an order (ESI can't); haul a ship to Jita while that switch is on; price
capitals (contracts, not the market) or reactions; model decryptors, Thukker or faction structures' extras, or
corporation blueprints; read an alt's notifications or contracts; learn a fee or tax and apply it without a **Use
this**; promise a structure's rigs, tax or broker fee it hasn't been told or measured.

## Honest limits (for limits.md)

- **Selling at the industry share of each side's pace is a guess** (10% unless typed), and profit a day is linear in
  it. No competition, undercutting or relist fees are modelled.
- **Home prices are Goonmetrics' until a structure read works**: a Goonswarm tool fed by members' uploads, with no
  published terms, read gently and switchable off; its time is shown. **Home pace is the whole region's history**, split
  by history's guess until a structure read gives its own sold counts.
- **A structure's facility tax, rigs and broker fee are typed until measured**; until then profit is ranked before
  them, said. A measure from one job or a few orders holds until the owner changes it, and is only offered.
- **The SCC's base on research and copying is EVE Ref's reading** (EVE University's copy formula has none) until a job in
  an NPC station settles it.
- **A job's check and measured tax need it first seen within 90 minutes of its start**: a job installed and finished
  between reads can't be checked. EIV is at that hour's adjusted prices; indices are ESI's four decimals (a few hundred
  ISK on a big job).
- **Materials are bought at today's asks**; a patient bid is shown, not assumed.
- **Mined materials cost what they'd sell for**, never nothing; the ore advice is the Mining tab's pricing.
- **Built and sold costs each job's materials at the blueprint's ME as last read before the job**, at your latest
  purchases before it; materials you never bought are said apart, not costed; a sale split between built and bought
  units is claimed for the built ones first.
- **Held materials count loose hangar stock only** (`byLocation`), as of the last assets read (the main's sync, an alt's
  hourly read by the cloud), and count only in start-up and the shopping list. An alt's blueprints and jobs are as of the
  cloud's last hourly read.
- **Copies "sold" are contracts that vanished before expiry** (a seller cancelling looks the same), read every six hours,
  so one listed and sold within six hours is missed; public contracts only, so Brave's corporation and alliance
  contracts aren't visible. Your own copy contracts are the main's only.
- **A home market's read is the watch set's types only**, hourly, from one read each time, not watched between reads.
- **NPC BPO places outside The Forge are read when an item is opened**; the list's price there is CCP's base price.
- **An alt's Jita broker fee is at its read standings, floored at 0 as the main's**; one not read yet is at no
  standing, and says so.

## Phone

Every table keeps its first column and folds the rest under it (`.rd-table` / `.rd-phone`, as Research), Your characters
included; a finder row's detail opens under it, full width; the ladder's rungs stack with their hexagon beside the title;
tiles in a card become lines (label and figure side by side, note under). `npm run check-phone` at 390 on every section.

## Testing

- **Pure** (`npm run check`): materials, time and job cost on the research's worked Large Trimark Armor Pump I (4,606 /
  3,995 / 3,108; 1,318.95 s a run; job cost 17,213,889 against EVE Ref's 17,213,916); copying against EVE Ref's output
  (base 3,151,808, SCC 126,072, tax 31,518); invention chance 0.4335 and base 1,638,947.87; ME levels' days on the level
  table; slots; the rig filter (a Medium T1 rig helps a cruiser and not a frigate); `bpoWhere`'s three cases (in The
  Forge; complete read without it; partial read); ranking before an untyped tax and fee, with the cost of each 1%;
  sourcing (home too thin, mined never free, held only in start-up); selling at home with the split from history's guess
  (a market that sells into bids paces below one that doesn't); `shipToJita` by site (a Lonetrek station within
  `NEAR_JITA_JUMPS` may sell in Jita, a null site may not); the industry share; Alpha's "Needs Omega" for the main;
  `firstSight` (90 minutes, active only); `mergeJob` (the browser sees the job after it ended, before and after the
  cloud's record comes down: first-sight fields kept, the earliest `seenAt`, ESI's fields the newest); `jobCheck`,
  `measuredTax` (manufacturing only, clone unknown can't); `charRows` (an alt not read is "Not read yet", no zeros;
  totals count the read); under All, a blueprint row at its own character's pilot and fees; an alt's broker fee from its
  read standings floored at 0; `parseGoonmetrics` on −1 and 0; the structure
  fold over the watch set; `copiesSold` on the research's three snapshots (a contract listed and sold between two reads
  counted, a reprice not); `builtClaims` (an item both built and bought: built units' sales claimed first, the rest
  matched to buys, **the bought part's profit still in "Trading, every item"**; a position's trade stays trading;
  `everyItemCalcs`, `otherSales` and `neverBought` see only what's left; no built type in the activity sets);
  `hubFeeRate` (other hubs' orders left out); `refusedKind`; `sanitizeIndustry`; each To do judge (newer read, absent
  stays checking, the alt's live gate and its `sheet` read time; `built` produced only while the place holds the jobs'
  units, judged done on a newer read once it doesn't, a hand tick held until new job IDs). Each rule planted wrong must
  fail.
- **Worker** (`scripts/check-worker.mjs`): an alt's blueprints and jobs filed under it, the main's rows untouched, a read
  with nothing new pushing nothing; a job's first-sight fields kept and never rewritten, a push from a browser without
  them merged onto D1's record; the Worker's JSON imports loading under Node's type stripping; the scan storing
  watch-only rows (and the Sniper's stats read leaving them out) and the NPC row (the latest complete and a newer partial
  kept, an older one dropped); Goonmetrics writing one row a hub, keeping the last good one on failure,
  and reading nothing when switched off; the copy set and `copy_sold`; a structure read refused and read; the cloud's
  structure search under an alt's login.
- **Tripwire**: `scripts/check.mjs`' list of files importing the alt store gains `components/hustles/Industry.tsx`, and
  characters.md's list, in the commit that makes it read it.
- **Pages** (`scripts/pages.mjs`, an `industry` case of its own, never the shared large ledger, which `check-income`
  records): the main with industry skills, a site of each kind (one home with no tax typed), originals and copies, jobs
  active, ready and finished (one whose `cost` differs from the app's, one with a measured tax offered); an alt with
  blueprints and jobs read, an alt not read, an alt refused; the All-characters filter and Your characters; an Alpha
  main ("Needs Omega"); ESI stubbed for indices, prices, a handful of books and histories, and the Tenerifis history;
  the cloud stubbed for home prices (one hub fresh, one a day old, then switched off), the NPC row (one BPO in The Forge,
  one not, one from a partial read), the copy summary and one structure read refused. Asserts each section's words for
  every state above, "before the facility tax" in the head, no NaN, no "0 ISK" for not known, the seven tabs at 1440,
  both widths. The plain loads assert the tab with nothing read says so.
- **After shipping**: the first real job read checked against the app's cost (and the SCC bases recorded in the notes);
  the first industry journal entries' ref types and contexts; the first structure-market refusal's shape.

## Build order

Each task ends with `npm run check`, `npm run build`, `npm run check-pages` (and `check-phone` for UI), a look in a
browser, and its notes; each is testable alone.

**Stage 1**
1. `scripts/industry-bundle.mjs`: `src/data/industry.json`, `industryEiv.json` and `industryTypes.json`, under budget;
   the bundle's shape tested (the Large Trimark's materials and times as the research read them).
2. `industry.ts`: the rules, tested on EVE Ref's figures above.
3. `industryRank.ts`: sourcing, selling (home with the split), freight, the ships switch by site, ranking before an
   untyped tax and fee, ME levels, start-up and shopping list with held stock, `bpoWhere`; tested.
4. The tab shell: the seventh tab, the sections, Show for with `useIndustryChars` (an alt's read standings), the
   tripwire updated; build sites and the `industry` doc (decisions synced, view state per browser) with
   `sanitizeIndustry` and `refusedDoc`; `FindStructure` out of Reprocess.tsx with ID, system and type (the main's
   browser search).
5. The scan: the watch set (`watchOnly`, kept out of Prospects, Busy markets, the planner, the opportunity mail, the
   Sniper and Hub arbitrage's busiest) and the `industry_npc` row (its migration; the latest complete and any newer
   partial kept; `GET /v1/industry/npc`); the finder and its detail on them and live books. **The Worker's first JSON
   imports** (`industryTypes.json` here, `industryEiv.json` in task 9): `worker/tsconfig.json` gains `resolveJsonModule`,
   and the imports carry `with { type: 'json' }`, which Node 24's type stripping (`npm run check`) needs.
6. Goonmetrics in the cloud (`home_prices` and its migration, the `37` cron, `GOONMETRICS_ON`, `/v1/home/prices`), and
   the finder's home selling.
7. The ladder, by skills alone, with Alpha's "Needs Omega" from `alphaCaps`.
8. Tech II through invention.

**Stage 2**
9. `refusedKind`; records `jobs` with their first-sight fields (`FIRST_SIGHT_MS` 90 minutes) and `mergeJob` in every
   writer, the Worker's push and the browser's pull; doc `blueprints` (with `meta.blueprintsAt`), read by the main's
   sync, the cloud's archive for the main's jobs and the alt's sheet for an alt's both; the alt copy pulls them.
10. Blueprints & jobs: the All-characters filter, Your characters with fleet totals, the tiles, blueprints, jobs; the
    ladder's "You're here" and slots in use from the reads; the Blueprints page on the doc.
11. The job check and measured tax (**Use this**), NPC-station settling of the SCC bases noted.
12. To do: an alt's jobs to deliver (its `sheet` seenAt and judge inputs), and List what you built (built only while the
    place holds the jobs' units, judged once it doesn't, `HOLDS_UNTIL_CHANGED`).
13. Built and sold: the claims passed into `everyItemCalcs`, `otherSales` and `neverBought` (built types kept out of the
    activity sets); the Industry activity in Results and All income, with its own income case (an item both built and
    bought, its bought part's profit still in trading).

**Stage 3**
14. The copy reads every six hours (`copy_set`, `copy_sold` and their migration, `/v1/copies`), `copyMarket.ts`; the
    copy finder.
15. Your copy business: copy jobs, copies held, copy contracts (outstanding items read, `raw_quantity` kept, kinds from
    ESI's public contract items); copy sales in the Industry activity; the expired-contract To do item; the alt's line.

**Stage 4**
16. The permission in `SCOPE` and `SCOPE_INFO`; the notes say every login must be handed over again.
17. The cloud's structure search (`POST /v1/structures/search`) for an alt, and `FindStructure` as any character.
18. Home markets: `home_markets` and `home_books` (their migration), the fold moved to `src/lib/bookFold.ts`, the hourly
    read of the watch set with each hub's reader's login, the section, which price speaks, the hub's measured broker
    fee (**Use this**).

## Notes

A new note, `docs/notes/industry.md`, with `.claude/rules/industry.md` naming the new files in its `paths:` (CLAUDE.md: a
new note gets a rule of its own); `SCOPE_INFO` gains the new permission's purpose; characters.md gains the tab in its
list of alt-store readers; limits.md the limits above; positions-results.md the Industry activity and its claim order;
finding-trades.md the scan's watch set and NPC row.

## Open questions

None. The last one, which UALX-3 Keepstar holds the market, the user answered on 10 October 2026: both do, Mothership
Bellicose Brave's own and 1st Byzantigoon the Imperium's (above).

## Revision 1 (10 October 2026)

What changed after the review against the code and the user's answers, and why (one line each):

- A1 Goonmetrics: read gently as specified, with `GOONMETRICS_ON` to switch it off; out of Open questions.
- A2 Home market readers: each hub names its reader, the main by default, any character; out of Open questions.
- A3 Share: industry's own share, 10% by default in the synced `industry` doc, wherever `settings.share` was used.
- A4 Built and sold: the Industry activity is in, with the claim order (B6).
- A5 Blueprints page: stays in Ledger on the same doc; out of Open questions.
- A6 Many characters: Your characters table with fleet totals, and an All-characters filter on Blueprints & jobs
  (Mining's rule); an alt not read says so, never zeros.
- B1 BPO price: the scan saves every bundle blueprint's NPC sellers with stations as its own row; "outside The Forge"
  only after a complete read, else "no NPC seller found" with the base price and no payback.
- B2 Measured tax: the job keeps its system, index and EIV at first sight while active; checks only jobs seen within an
  hour of start; tax from manufacturing only; SCC bases from NPC-station jobs only; clone unknown can't measure; offered
  with **Use this**.
- B3 Watch set: bypasses the two-sided and NPC filter, marked `watchOnly` and kept out of Prospects, Busy markets, the
  planner and the opportunity mail; no Jita book still means no row, said.
- B4 Untyped tax or broker fee: profit ranks before them, said in the head, with each 1%'s cost a day beside it.
- B5 Copies sold: a snapshot every six hours compared with the last kept set, vanishings added up over seven days
  (chosen over daily snapshots, which would miss more).
- B6 Built and sold: one claim order, Industry first by trade ID and units, the rest see what's left; built types in the
  activity sets; `reprocessing_tax` out of job fees; a test of an item both built and bought.
- B7 To do: `built` is in `HOLDS_UNTIL_CHANGED`, versioned by delivered job IDs and done at fewer units; an alt's
  `industry` item has its own seenAt and judge inputs.
- B8 Stage 4: one read's sold counts over the watch set; the `bookFills` and queue-ceiling claims dropped.
- B9 FindStructure: refactored to return ID, name, system and type; a cloud search for alts.
- B10 Home pace: split by `tradingSplit` (history's guess on the home region, or the structure read's sold counts).
- Minor: `meta.blueprintsAt` synced; decisions synced, view state per browser; the ships switch keyed on the site; one
  migration per task; the ladder by skills alone until stage 2; Alpha's "Needs Omega" for the main from `alphaCaps`;
  copy contracts' kinds from ESI's public items, `raw_quantity` kept, alt contracts said unread; the fold moved to
  `src/lib`; an alt's broker fee from its read standings; the bundle re-measured (1.11 MB, 141 KB gzipped) and
  `typeMaterials` loaded with a detail only; `measuredRates` filtered to the hub; held materials in start-up and the
  shopping list only.
- Disagreed in part: the review said `researchChars` takes an alt's read standings for its broker fee; it doesn't
  (`researchChars.ts:113`, `rates(ledger.settings)` on `altLedger`'s zeros), so the Industry tab reads `meta.standings`
  itself, and the Research tab's cards carry the same zero-standing fee for an alt (outside this spec; worth a fix).

## Revision 2 (10 October 2026)

The reviewer re-checked Revision 1 (every first-round finding resolved, the 18-task order standing) and found these;
all applied as written:

- Built and sold: built types stay out of the activity sets, which apply to a whole item (`income.ts:87–89`,
  `results.ts:143`) and would have dropped an item both built and bought from trading; the claims (trade ID and units)
  go into `everyItemCalcs`, `otherSales` and `neverBought` instead, tested with the bought part's profit still shown.
- List what you built: built only while the place holds at least the jobs' units, since `remember` refreshes a present
  item as open and judges only a gone one (`todo.ts:139–145`); a hand tick holds by the job IDs.
- Jobs' two writers: `mergeJob` in the browser's sync and pull, the archive, the sheet and the Worker's push for `jobs`;
  first-sight fields never dropped, the earliest `seenAt` wins; tested with the browser seeing a job late.
- Watch-only rows: the Sniper (`worker/src/snipe.ts:128`, `snipe.ts:110`) and Hub arbitrage's busiest
  (`Arbitrage.tsx:67`) leave them out too.
- The Worker's first JSON imports (task 5): `resolveJsonModule` in `worker/tsconfig.json`, `with { type: 'json' }` for
  Node 24's check.
- `FIRST_SIGHT_MS` is 90 minutes: an alt's job started just before a `:37` read is first seen 61 to 65 minutes on.
- One job dates an alt's industry reads: its `sheet` job's `lastOk`, for the reads, the tab and To do's seenAt; the
  archive reads only the main's jobs.
- `industry_npc`: `GET /v1/industry/npc`; the latest complete row kept beside any newer partial one, and only those two.
- Under All, each blueprint row is worked out at its own character's pilot and fees.
- An alt's broker fee mirrors the main's sync: raw standing floored at 0 (`sync.ts:161–162`).
