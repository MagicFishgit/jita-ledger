# Industry, stage 1: what to build and how to start — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seventh Side hustles tab, Industry, whose Start section is a ladder from a first high-sec job to capitals and
whose Build section ranks every blueprint sold on the market (and, last, every Tech II product through invention) for the
user's own build site, skills and markets, with the cloud keeping the NPC sellers of every blueprint and home prices from
Goonmetrics.

**Architecture:** CCP's static data is trimmed by a script into three JSON files (the tab's own chunk, the ME 0 materials
for stage 2, and the type IDs the cloud reads). The rules are pure (`src/lib/industry.ts`, `industryRank.ts`,
`industrySites.ts`, `industryLadder.ts`, `homeMarket.ts`, `altFees.ts`), tested in `npm run check` on EVE Ref's own
outputs. The cloud's morning scan gains a watch set and an `industry_npc` row; the alts' hourly cron gains a Goonmetrics
read every six hours into `home_prices`. The browser reads those, ESI's indices and adjusted prices, the scan it already
adopts, and live Jita books for the top 40 rows, and ranks in the tab. Decisions are a synced `industry` doc; view state
stays per browser.

**Tech Stack:** React 18 + TypeScript + Vite; Cloudflare Worker + D1; ESI (`X-Compatibility-Date: 2026-08-18`); Node's type
stripping for pure tests (`scripts/check.mjs`), the in-memory D1 stand-in for the Worker (`scripts/check-worker.mjs`),
Playwright for pages (`scripts/pages.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-10-industry-design.md`. Read it whole first, Revisions 1 and 2 included: it
carries the facts each rule rests on and every state's wording. This plan builds its build-order tasks 1–8 (stage 1). The
research behind it is `.playwright-mcp/research/bpo/report.md` (gitignored, on this machine), with EVE Ref's answers in
`.playwright-mcp/research/bpo/data/web/everef-25894.json` and `everef-26302.json` and ESI's in
`.playwright-mcp/research/industry-spec/`.

**Task layout.** The spec's eight stage-1 tasks, with two of them split so each part is reviewable and ship-safe alone:
Task 4 is **4A** (the tab shell, the `industry` doc, Show for and the alt broker-fee fix) and **4B** (build sites and
`FindStructure`); Task 5 is **5A** (the Worker: the scan's watch set, the NPC row, every scan reader leaving watch-only
rows out) and **5B** (the finder and its detail in the tab). The spec's numbering is kept, so its stage-2 references
("from task 10…") still mean the same task.

## Where this plan corrects the spec

Each is said again in the task that owns it, and goes in `docs/notes/industry.md`.

1. **The job cost figure.** The spec's "17,213,889 against EVE Ref's 17,213,916" is an arithmetic slip in the research's
   write-up: the job cost worked out from the stated inputs at ESI's full-precision adjusted prices is 17,213,916.04,
   EVE Ref's figure to the ISK. Task 2 pins EVE Ref's 17,213,916 (±30 ISK, the spec's tolerance) and the time at two
   decimals, 1,318.95 s (EVE Ref's 21 min 58.953 s; the formula gives 1,318.948).
2. **`watchOnly` lives on the stats row, not the book.** `overScan` (evaluate.ts) rebuilds a live book over the scan's and
   carries only `npcSell`, `npcAnywhere` and `sellsTo`; `mergeLiveBooks` calls it for every item the cloud watches, so a
   flag on the book would be dropped the first time a watched book landed. The flag is `ProspectStats.watchOnly`, set by
   the Worker after `statsFrom`; `judgeProspect`, the Sniper's finders and Hub arbitrage read the stats anyway.
3. **Rigs.** A modifier source's `dogmaAttributeID` (2538, 2539…) names the structure attribute it moves and isn't on the
   rig. The rig's value is its own 2594 (material), 2593 (time) or 2595 (cost), times 2355/2356/2357 by security. Only
   Tech I and Tech II engineering rigs (metaGroup 54 and 53) are kept, with their size (dogma 1547): **106** rigs, not
   the spec's 220 sources (Thukker, faction structures and reaction-only rigs are out).
4. **Counts.** Built from build 3569502: 2,693 blueprints (1,741 on the market, 1,020 Tech II, 68 both), 5,670 types,
   2,305 stations, 57 skills, 602 named groups; `industry.json` 1,056 KB and 145 KB gzipped (budget 1.2 MB and 160 KB); `industryEiv.json`
   4,039 blueprints (spec 4,038); the stage-1 watch set **1,858** types (the 1,673 Tech I blueprints that aren't Tech II,
   their products and materials) and **2,916** once Task 8 adds Tech II and datacores (spec 1,926 and 2,915).
5. **The 68 old Tech II originals** (Helios, Crow, Raptor…) are on the market *and* invention products. They're Tech II
   here: NPCs never sold them, so costing them as an original you'd buy would be a fiction. Tasks 5B–7 leave every
   invention product out; Task 8 costs all 1,020 through invention.
6. **Mined as a "cheapest" source.** A bid is always under an ask, so the spec's three-way pick would choose "mined" for
   every mineral and the finder would read as if every builder mined. Mined is picked only for a material in a mineable
   group (minerals 18, ice products 423, moon materials 427) **and** only when the shown character has mining records in
   the last 30 days (the Mining tab's own data). Otherwise it's listed in the detail beside the pick, never picked. No
   new control.
7. **Seven tabs at 1,440.** `.htabs`' 172 px minimum fits six. The tab row becomes a container: seven columns from a
   container width of 1,040 px, four below that, two on a phone with an odd last tab spanning the row, so no tab ever
   sits alone. The page check asserts one row at 1,440.
8. **`.ladder` is already two classes** (styles.css: the mining ladder's grid of cards, and Planets' step chips). The
   rungs get their own, `.ind-rung`.
9. **`industryEiv.json` has no stage-1 reader.** Task 1 builds it as the spec asks (stage 2's first-sight EIV needs it),
   with its size checked; nothing imports it until stage 2.
10. **Home pace before the home history is read.** The spec reads the home region's history "for ranked products, on
    demand"; ranking needs a pace first. The first pass ranks home sales on Goonmetrics' weekly movement ÷ 7 at an even
    split, labelled as such; the top 40 rows then read their home history and are re-ranked on its `paceDay` × history's
    split, as the spec says.
11. **The `industry_npc` row keeps `pages_failed`** beside the spec's `(run, at, complete, data)`: "this
    morning's read missed N pages" needs it.
12. **The ladder's levels, which the spec names without levels** (Task 7): each skill's first useful level, More slots at
    V and the advanced skills' I, and **Capital Ship Construction III**, not I: the bundle's 29 capital hulls ask for III
    (12), IV, V or Advanced Capital Ship Construction, so at I the rung would open none.
13. **"Needs Omega" is read from CCP's caps for any Alpha, main or alt** (Task 7). An alt's pilot marks only skills trained
    past their cap, so an Alpha alt at Mass Production III would be promised IV's training time; `SkillNeeds` gains an
    optional `beyond` to say "Alpha uses III: Omega opens V" instead. The derivation gives the spec's rungs 2, 3, 6 and 7.
    A rung's skills are drawn with `SkillNeeds` (a skill at a level: pips, queue, training time, "Needs X first"), the
    mining ladder's, rather than the spec's `SkillStrip`, which shows a page's skills with what each next level does and
    has no level to aim at.
14. **Build at home has no skill**: it's met by a structure among the sites added (a decision in the `industry` doc, not a
    stage-2 read), so "You're here" can stand on rung 5 (Task 7).
15. **A Tech II row is one factory slot fed by one lab slot** (Task 8): it makes no more a day than the lab invents for,
    and says when that binds; the spec's "profit a day, one slot" would otherwise read the Cerberus at half a hull a day
    against about 5.7 days of lab time a success. Its original is the Tech I one, "to copy from"; datacores held count
    wherever they are; the encryption skill is found by its name.
16. **A slot's day under one unit reads to a tenth** (`dayCount`), never "0" (Task 8; a long Tech I build had it too).

## Global Constraints

- Nothing not known reads as a zero: no "0 ISK", "0%" or "0 a day" stands for not read, not typed or not priced. Each
  state says what it is ("–" with why, "Reading…", "Not read yet", "a version behind").
- Pure modules (`src/lib/industry.ts`, `industryRank.ts`, `industrySites.ts`, `industryLadder.ts`, `homeMarket.ts`,
  `altFees.ts`, `prefs.ts`) import no `./config`, `./store`, React or DOM, even for a type: Node's type stripping loads
  them in `npm run check` and `tsc -p worker` pulls in whatever the Worker imports.
- The site and the Worker deploy in either order: a migration only adds (`CREATE TABLE IF NOT EXISTS`); a Worker a version
  behind refuses the `industry` doc ("Unknown document: industry") and `refusedDoc` holds it back; a route it doesn't have
  answers 404, which the tab says as "the cloud is a version behind", never as data.
- Budgets: `src/data/industry.json` at most 1.2 MB and 160 KB gzipped, its own chunk, loaded by the tab only;
  `typeMaterials.json` (481 KB) only when a finder row's detail opens; `universeGraph.json` (287 KB) with the tab.
- Goonmetrics: read by the cloud only, every six hours per hub, one call every 1.5 s, at most 50 types a call, a
  User-Agent naming only the project (`jita-ledger (hobby tool)`), `GOONMETRICS_ON` switches it off, not a watched job.
  Hubs: UALX-3 "1st Byzantigoon" 1046664001931 (Tenerifis 10000061), C-J6MT "Ceci n'est pas une keeptar" 1049588174021
  (Insmother 10000009). 1DQ1-A is left out.
- Named constants stated in the copy: `NEAR_JITA_JUMPS` 10, `HOME_DEPTH` 10, the industry share 10% by default, `SCC`
  4%, `SCC_COPY` 4% (EVE Ref's reading), `SCC_RESEARCH` 2% (on the research job's base, the research's reading),
  `ALPHA_TAX` 0.25%, `NPC_FACILITY_TAX` 0.25%, `LEVEL_MOD` 0, 105, 250, 595, 1,414, 3,360, 8,000, 19,000, 45,255,
  107,700, 256,000, slots at most 11.
- Decisions are synced in the `industry` doc (sites, freight routes, typed taxes and broker fees, the industry share, the
  ships switch, the ME/TE assumed, the default site, where to sell, the home hub); view state is per browser:
  `jita-ledger:industry-section`, `jita-ledger:industry-show`, `jita-ledger:industry-finder`,
  `jita-ledger:industry-open`, each read and written inside `try`/`catch`.
- Only `components/hustles/Industry.tsx` imports the alt store in this tab (the tripwire in `scripts/check.mjs` and
  characters.md's list gain it in Task 4A); everything of an alt's is read, never written.
- Stand-in data lives in an `industry` case of its own in `scripts/pages.mjs`, never in `scripts/ledgers.mjs`
  (`npm run check-income` records that ledger and must pass unchanged).
- Facts that come from ESI, CCP's static data or Goonmetrics at build time are fetched exactly as the task says: public ESI
  with `User-Agent: jita-ledger (research)` and `X-Compatibility-Date: 2026-08-18`, never a login; Goonmetrics only from
  the cloud; then pinned in a test fixture under `scripts/fixtures/` (`.playwright-mcp/` is gitignored).
- The app's voice (app-conventions.md): a section is a lead line and three or four points; a long tip is a lead line,
  bullets, then an example (`tipText`); a count is a tile; facts are said where they're used; plain words, no figure
  invented; a typed figure says "typed by you".
- Every task: `npm run check`, `npm run build`, `npm run check-pages` (with `LEDGER=industry` while iterating, the full run
  before committing), `npm run check-phone` for UI, `npm run check-income` unchanged; a browser look with screenshots
  under `.playwright-mcp/industry/`; the note's additions; a commit whose message says what was wrong or missing, why,
  and the evidence, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf`.
- Each test is shown failing with its rule planted wrong (the step names the planted line), then passing.

## Review Focus

1. **A cloud a version behind**: `/v1/industry/npc` or `/v1/home/prices` answers 404, and the tab must say the cloud is
   a version behind, never "NPCs don't sell it" or "none listed at UALX-3". Pinned in Task 5B, step 9 (the NPC row), and
   Task 6, step 7 (home prices: and Either sells in Jita meanwhile).
2. **A site whose facility tax isn't typed** (the user's own case, a home they can't dock in) and a hub whose broker fee
   isn't: the finder ranks before them, says so in the column head with each 1%'s cost a day, never assumes 0% and never
   blanks the table. Pinned in Task 3, step 1 (`buildRow`'s `taxPerPct` and `brokerPerPct`) and Task 5B, step 9 (the
   head's words).
3. **An alt whose standings aren't read**: its Jita broker fee is at no standing and says so, never the main's fee and
   never a fee from `altLedger`'s zeros presented as read. Pinned in Task 4A, step 1 (`jitaStandings`) and step 9 (the
   page case's alt lines).
4. **A watch-only row reaching Prospects or the mail**: a live book merged over a watch-only row (`mergeLiveBooks`), or a
   browser a version behind pushing a watch-only type into the `watch` doc, must still keep it out of Prospects, Busy
   markets, the planner, the opportunity mail, the Sniper and Hub arbitrage. Pinned in Task 5A, steps 1 and 5.
5. **A builder who doesn't mine**: "mined" is never picked for them and never free for anyone; a mined source is the
   material's bid. Pinned in Task 3, step 1 (`sourceMaterial`).

## Files

| File | Responsibility | Task |
| --- | --- | --- |
| `scripts/industry-bundle.mjs` | Builds the three JSON files from CCP's static data | 1, 8 |
| `src/data/industry.json` | Blueprints, types, filters, rigs, structures, stations, skills: the tab's chunk | 1 |
| `src/data/industryEiv.json` | Every published blueprint's ME 0 materials (stage 2's reader) | 1 |
| `src/data/industryTypes.json` | The cloud's watch set and the blueprints whose NPC sellers it keeps | 1, 8 |
| `docs/notes/industry.md`, `.claude/rules/industry.md` | The note and the rule that loads it with these files | 1, every task |
| `scripts/fixtures/industry-everef.json` | EVE Ref's outputs, ESI's adjusted prices and indices the rules are pinned on | 2 |
| `scripts/fixtures/goonmetrics-34.xml` | One saved Goonmetrics answer | 6 |
| `src/lib/industry.ts` | The bundle's types and index; materials, time, job cost, research, copying, invention, slots, rigs | 2 |
| `src/lib/industryRank.ts` | Sourcing, selling, freight, the ships switch, one slot's day, a row, ME levels, start-up, shopping list, BPO places, Tech II's invention | 3, 8 |
| `src/lib/altFees.ts` | A character's Jita rates at its read standings | 4A |
| `src/lib/prefs.ts` | `IndustryDoc`, `sanitizeIndustry`, `DEFAULT_INDUSTRY` | 4A |
| `src/lib/industrySites.ts` | Quiet stations near Jita, the nearest lab, a site's facts and its lab (`labFor`), freight presets and routes | 4B, 8 |
| `src/lib/homeMarket.ts` | The hubs, `parseGoonmetrics`, `homeQuote` | 6 |
| `src/lib/industryLadder.ts` | The seven rungs, what each needs and opens, Alpha's caps, where you stand, what each pays | 7, 8 |
| `src/components/hustles/Industry.tsx` | The tab: sections, Show for, the only alt-store reader | 4A, 4B, 7 |
| `src/components/hustles/industryChars.ts` | `useIndustryChars`: each character's pilot, clone, fees, held stock, mining | 4A |
| `src/components/hustles/industryBundle.ts` | Loads the bundle and the stargate map (chunks) | 4A |
| `src/components/hustles/IndustryStart.tsx` | Start: lead, where you stand, the ladder | 4A, 7, 8 |
| `src/components/hustles/IndustrySites.tsx` | Where you build: the sites and freight routes | 4B |
| `src/components/FindStructure.tsx` | Find a structure by name, out of Reprocess.tsx | 4B |
| `src/components/hustles/industryMarket.ts` | Indices, adjusted prices, the scan, the NPC row, live books, home prices and histories | 4B, 5B, 6 |
| `src/components/hustles/industryFinder.ts` | `useFinder`: assembles the inputs and ranks (Build and Start share it) | 5B, 6, 8 |
| `src/components/hustles/IndustryBuild.tsx` | Build: choices and the finder table | 4B, 5B, 6, 8 |
| `src/components/hustles/IndustryDetail.tsx` | A row's detail: materials, job, sale, ME levels or invention, BPO places, start-up, shopping, steps | 5B, 6, 8 |
| `worker/src/scan.ts` | The watch set (`watchOnly`) and the BPOs' NPC sellers | 5A |
| `worker/src/industryNpc.ts` | Keeps the NPC rows (latest complete, newer partial) and serves them | 5A |
| `worker/migrations/0018_industry_npc.sql` | `industry_npc` | 5A |
| `worker/src/goonmetrics.ts` | The six-hourly Goonmetrics read and `/v1/home/prices` | 6 |
| `worker/migrations/0019_home_prices.sql` | `home_prices` | 6 |
| `worker/src/index.ts` | Routes and the `37` cron's chain | 5A, 6 |

Modified along the way: `src/lib/constants.ts` (`CALDARI_STATE`), `src/lib/types.ts` (`ProspectStats.watchOnly`),
`src/lib/evaluate.ts`, `src/lib/snipe.ts`, `src/components/Arbitrage.tsx`, `worker/src/alerts.ts`, `src/lib/market.ts`
(`industrySystemsShared`), `src/lib/cloud.ts`, `src/lib/cloudSync.ts`, `worker/src/sync.ts`, `src/lib/store.ts`,
`src/lib/emptyData.ts`, `src/components/hustles/researchChars.ts`, `src/components/Reprocess.tsx`,
`src/components/SideHustles.tsx`, `src/components/SkillStrip.tsx` (`SkillNeeds`' `beyond`), `src/styles.css`, `worker/tsconfig.json`, `scripts/check.mjs`,
`scripts/check-worker.mjs`, `scripts/pages.mjs`, `CLAUDE.md` (the notes list), `docs/notes/characters.md`,
`docs/notes/finding-trades.md`, `docs/notes/limits.md`.

---
### Task 1: The bundle, the note and the rule

**Files:**
- Create: `scripts/industry-bundle.mjs`, `src/data/industry.json`, `src/data/industryEiv.json`, `src/data/industryTypes.json`
  (all three written by the script), `docs/notes/industry.md`, `.claude/rules/industry.md`
- Modify: `scripts/check.mjs` (a section "Industry: the bundle" before the final `console.log(failed ? …)`), `CLAUDE.md`
  (the notes list)

**Interfaces:**
- Consumes: CCP's static data build 3569502, already on this machine at
  `.playwright-mcp/research/rd-agents/sde-3569502.zip` (md5 `b1379fc2f4e61507a959d855378e60f2`, the same file as
  `.playwright-mcp/rd-agents-build/eve-online-static-data-3569502-jsonl.zip`).
- Produces (read by every later task; the TypeScript types for them are Task 2's):
  - `src/data/industry.json`: `{ build: 3569502, released, source, bps, types, filters, rigs, structures, stations, skills }`
    - `bps: [bp, maxRuns, manufacturing, copying, researchMaterial, researchTime, invention][]`, sorted by `bp`; an
      activity is `0` or `[time, [[material, qty]], [[skill, level]], [[product, qty, probability?]]]`. The invention
      product's `qty` is the runs on the Tech II copy (1 for ships and rigs, 10 for most modules).
    - `types: { [id]: [name, group, category, packagedVolume, basePrice, mineable] }`; `basePrice` 0 means CCP gives none,
      `mineable` 1 for groups 18, 423, 427.
    - `groups: { [id]: [name, category] }`: every group those types are in (602), named, so the finder can sort products
      into kinds (a ship rig's group is "Rig …").
    - `filters: { [id]: [name, categories[], groups[]] }`.
    - `rigs: [type, size (2 M, 3 L, 4 XL), tech (1, 2), [[activity, kind, filter]], [time, material, cost], [high, low, null]][]`;
      activity one of `manufacturing`, `copying`, `invention`, `researchMaterial`, `researchTime`; kind `material`,
      `time` or `cost`; filter 0 when the rig helps everything.
    - `structures: { 35825: [0.99, 0.97, 0.85], 35826: [0.99, 0.96, 0.8], 35827: [0.99, 0.95, 0.7] }` (material, cost, time).
    - `stations: [station, system, services][]`, services 1 a Factory, 2 a Laboratory, 3 both.
    - `skills: { [id]: [rank, primary, secondary, bonusAttribute, bonus] }`: 440 Industry −4, 1961 Advanced Industry −3,
      1982 a science or construction skill's −1 manufacturing time a level, 452 Science −5, 453 Research −5,
      468 Metallurgy −5, 450 Mass Production +1, 471 Laboratory Operation +1; 0 and 0 for none.
  - `src/data/industryEiv.json`: `{ build, eiv: { [bp]: [[material, qty]] } }`, 4,039 blueprints. No stage-1 reader.
  - `src/data/industryTypes.json`: `{ build, watch: number[], bpos: number[] }`: 1,858 watched types, 1,673 blueprints.

- [ ] **Step 1: Write the failing test**

Add this section to `scripts/check.mjs`, just before the closing `console.log(failed ? …)`:

```js
console.log('\n--- Industry: the bundle (scripts/industry-bundle.mjs, CCP static data build 3569502) ---');
{
  // The Industry tab's static data (docs/superpowers/specs/2026-10-10-industry-design.md). The worked item is the research's
  // (.playwright-mcp/research/bpo/report.md): Large Trimark Armor Pump I, checked there against EVE Ref's industry API.
  const fsI = await import('node:fs');
  const zlibI = await import('node:zlib');
  const read = (p) => fsI.readFileSync(new URL(p, import.meta.url));
  const raw = read('../src/data/industry.json');
  const b = JSON.parse(raw);
  const bp = (id) => b.bps.find((x) => x[0] === id);
  eq('  the build and its counts: 2,693 blueprints, 5,670 types in 602 groups, 106 rigs, 2,305 stations, 57 skills, 3 engineering complexes',
    [b.build, b.bps.length, Object.keys(b.types).length, Object.keys(b.groups).length, b.rigs.length, b.stations.length, Object.keys(b.skills).length, Object.keys(b.structures).length],
    [3569502, 2693, 5670, 602, 106, 2305, 57, 3]);
  eq('  a group, named: a ship rig\'s, and the fuel blocks\'', [b.groups[773], b.groups[1136]], [['Rig Armor', 7], ['Fuel Block', 4]]);
  eq('  under its budget: 1.2 MB, 160 KB gzipped', [raw.length <= 1.2e6, zlibI.gzipSync(raw).length <= 160_000], [true, true]);
  eq('  the Large Trimark Armor Pump I Blueprint: 40 runs a copy; 4,500 s and 83 / 72 / 56 a run to build',
    bp(25895).slice(0, 3), [25895, 40, [4500, [[25601, 83], [25605, 72], [25590, 56]], [[3380, 1], [26253, 1]], [[25894, 1]]]]);
  eq('    copying 3,600 s a run; ME and TE research 1,575 s for the first level (a rank 15 blueprint)', [bp(25895)[3][0], bp(25895)[4][0], bp(25895)[5][0]], [3600, 1575, 1575]);
  eq('    invention: 3 + 3 datacores, three skills, a 34% chance of a one-run Tech II copy',
    bp(25895)[6], [23400, [[20416, 3], [20171, 3]], [[11443, 1], [11442, 1], [23087, 1]], [[26303, 1, 0.34]]]);
  eq('  its Tech II blueprint, invented and never sold: one run a copy, 45,000 s, 20 / 15 / 1 / 23 a run',
    [bp(26303)[1], bp(26303)[2][0], bp(26303)[2][1], bp(26303)[6]], [1, 45000, [[25624, 20], [25609, 15], [11475, 1], [25620, 23]], 0]);
  eq('  a type: name, group, category, packaged volume, base price (0: none), mineable',
    [b.types[25894], b.types[34], b.types[621]], [['Large Trimark Armor Pump I', 773, 7, 20, 0, 0], ['Tritanium', 18, 4, 0.01, 2, 1], ['Caracal', 26, 6, 10000, 8000000, 0]]);
  eq('  the engineering complexes\' role bonuses (material, cost, time)', b.structures, { 35825: [0.99, 0.97, 0.85], 35826: [0.99, 0.96, 0.8], 35827: [0.99, 0.95, 0.7] });
  // A modifier source names the structure attribute it moves (2538…); the rig's value is its own 2594 / 2593 / 2595.
  eq('  a rig\'s own values: Standup L-Set Equipment Manufacturing Efficiency I',
    b.rigs.find((r) => r[0] === 37170), [37170, 3, 1, [['manufacturing', 'material', 2], ['manufacturing', 'time', 2]], [-20, -2, 0], [1, 1.9, 2.1]]);
  eq('    the M-Set Basic Medium Ship material rigs, Tech I and Tech II',
    [b.rigs.find((r) => r[0] === 37146), b.rigs.find((r) => r[0] === 37147)],
    [[37146, 2, 1, [['manufacturing', 'material', 7]], [0, -2, 0], [1, 1.9, 2.1]], [37147, 2, 2, [['manufacturing', 'material', 7]], [0, -2.4, 0], [1, 1.9, 2.1]]]);
  eq('    a copy-and-research rig helps every blueprint (no filter)', b.rigs.find((r) => r[0] === 37183)[3].every((m) => m[2] === 0), true);
  eq('    no Thukker or faction rig', b.rigs.every((r) => r[2] === 1 || r[2] === 2), true);
  eq('  the filter a medium ship rig reads', b.filters[7], ['Medium T1 Ships', [], [26, 28, 419, 463, 1201, 4902, 5087]]);
  eq('  the industry skills: rank, attributes, and the bonus each carries',
    [3380, 3388, 3387, 24625, 3406, 24624, 3402, 3403, 3409, 11442].map((s) => b.skills[s]),
    [[1, 166, 165, 440, -4], [3, 166, 165, 1961, -3], [2, 166, 165, 450, 1], [8, 166, 165, 450, 1], [1, 165, 166, 471, 1], [8, 165, 166, 471, 1],
      [1, 165, 166, 452, -5], [1, 165, 166, 453, -5], [3, 165, 166, 468, -5], [5, 165, 166, 1982, -1]]);
  eq('  stations with a Factory, and the far fewer with a Laboratory', [b.stations.filter((s) => s[2] & 1).length, b.stations.filter((s) => s[2] & 2).length], [2259, 510]);
  const eivF = JSON.parse(read('../src/data/industryEiv.json'));
  eq('  every published blueprint\'s ME 0 materials (stage 2 reads them)', [Object.keys(eivF.eiv).length, eivF.eiv[25895]], [4039, [[25601, 83], [25605, 72], [25590, 56]]]);
  const watchF = JSON.parse(read('../src/data/industryTypes.json'));
  eq('  the cloud\'s watch set (every Tech I product and its materials) and the blueprints it keeps NPC sellers for', [watchF.watch.length, watchF.bpos.length], [1858, 1673]);
  eq('    the pump and its circuits watched; its Tech II blueprint no NPC\'s; its Tech II product not watched yet',
    [watchF.watch.includes(25894), watchF.watch.includes(25601), watchF.bpos.includes(25895), watchF.bpos.includes(26303), watchF.watch.includes(26302)], [true, true, true, false, false]);
  eq('    sorted, so a rebuild of one build changes nothing', [watchF.watch.every((t, i, a) => !i || a[i - 1] < t), b.bps.every((x, i, a) => !i || a[i - 1][0] < x[0])], [true, true]);
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run check 2>&1 | grep -A3 "Industry: the bundle"`
Expected: the section throws `ENOENT … src/data/industry.json` (no bundle yet) and the run ends in FAILURES.

- [ ] **Step 3: Write the script**

Create `scripts/industry-bundle.mjs` (it was run in drafting against build 3569502 and printed the counts in Step 5):

```js
// Industry's static data, trimmed for the app: ESI serves no blueprints, rigs, structure bonuses or station services, so
// they come from CCP's static data (SDE). Run after a game update changes blueprints:
//
//   node scripts/industry-bundle.mjs <folder>
//   SDE_ZIP=<a build's JSONL zip> node scripts/industry-bundle.mjs     (that build, already downloaded; nothing fetched)
//
// It reads the SDE's current build from developers.eveonline.com, downloads that build's JSONL zip into <folder> unless
// it's already there (User-Agent "jita-ledger"; ~99 MB), reads what it needs straight from the zip, and writes three files:
//
// src/data/industry.json (the Industry tab's own chunk; types in src/lib/industry.ts):
//   { build, released, source,
//     bps:        [bp, maxRuns, manufacturing, copying, researchMaterial, researchTime, invention][]   sorted by bp
//                 each activity 0 or [time, [[material, qty]], [[skill, level]], [[product, qty, probability?]]]
//     types:      { id: [name, group, category, packagedVolume, basePrice, mineable] }
//     groups:     { id: [name, category] }                   every group those types are in
//     filters:    { id: [name, categories[], groups[]] }      which products a rig helps (industryTargetFilters)
//     rigs:       [type, size, tech, [[activity, kind, filter]], [time, material, cost], [high, low, null]][]
//     structures: { type: [material, cost, time] }            Raitaru, Azbel, Sotiyo: dogma 2600, 2601, 2602
//     stations:   [station, system, services][]               services 1 a Factory, 2 a Laboratory, 3 both
//     skills:     { id: [rank, primary, secondary, bonusAttribute, bonus] } }
// src/data/industryEiv.json: { build, eiv: { bp: [[material, qty]] } }, every published blueprint's ME 0 manufacturing
//   materials: what a job's estimated item value is worked out from (stage 2 keeps a job's EIV at first sight).
// src/data/industryTypes.json: { build, watch: number[], bpos: number[] }, the type IDs the cloud reads for the tab: the
//   watch set (every Tech I product and its materials) and the blueprints whose NPC sellers the morning scan keeps.
//
// Which blueprints: every published blueprint on the market whose product is on the market too (Tech I and the 68 old
// Tech II originals among them), and every blueprint those invent (Tech II). A blueprint that's an invention product is
// Tech II wherever it's sold: the tab costs it through invention, never as an original you'd buy.
// Rigs: the engineering rigs of Tech I and Tech II (metaGroup 54 and 53) with their size (dogma 1547: 2 M-Set, 3 L-Set,
// 4 XL-Set). A modifier source's own dogmaAttributeID names the structure's attribute it moves (2538…), which the rig
// doesn't carry: its value is the rig's 2593 (time), 2594 (material) or 2595 (cost), times 2355/2356/2357 by security.
// Thukker and faction rigs (metaGroup 52) and the faction citadels are left out.
// Every list is sorted, so a rebuild of the same SDE build changes nothing.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';

const [dir] = process.argv.slice(2);
const given = process.env.SDE_ZIP;
if (!dir && !given) { console.error('usage: node scripts/industry-bundle.mjs <folder for the SDE zip>, or SDE_ZIP=<zip> node scripts/industry-bundle.mjs'); process.exit(1); }
const SDE = 'https://developers.eveonline.com/static-data/tranquility';
const HEADERS = { 'User-Agent': 'jita-ledger' };

const ACTIVITIES = ['manufacturing', 'copying', 'research_material', 'research_time', 'invention'];
const RIG_ACTIVITIES = new Set(['manufacturing', 'copying', 'invention', 'researchMaterial', 'researchTime']);
const RIG_KINDS = new Set(['material', 'time', 'cost']);
const TECH = { 54: 1, 53: 2 };
const STRUCTURES = [35825, 35826, 35827];
/** Minerals, ice products and moon materials: what mining (and reprocessing what's mined) makes. */
const MINEABLE_GROUPS = new Set([18, 423, 427]);
/** The skills the tab names whether or not a blueprint asks for them. */
const INDUSTRY_SKILLS = [3380, 3387, 3388, 3402, 3403, 3406, 3409, 22242, 24624, 24625];
/** A skill's bonus, the first of these it carries: Industry 440, Advanced Industry 1961, a science or construction skill's
 *  1982 (manufacturing time a level, on what requires it), Science 452, Research 453, Metallurgy 468, slots 450 and 471. */
const BONUS_ATTRS = [440, 1961, 1982, 452, 453, 468, 450, 471];

const latest = given ? null : JSON.parse((await (await fetch(`${SDE}/latest.jsonl`, { headers: HEADERS })).text()).trim().split('\n')[0]);
const zipPath = given ?? path.join(dir, `eve-online-static-data-${latest.buildNumber}-jsonl.zip`);
if (!fs.existsSync(zipPath)) {
  if (given) throw new Error(`${given} isn't there`);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`downloading build ${latest.buildNumber}…`);
  const res = await fetch(`${SDE}/eve-online-static-data-${latest.buildNumber}-jsonl.zip`, { headers: HEADERS });
  if (!res.ok) throw new Error(`the SDE zip answered ${res.status}`);
  fs.writeFileSync(`${zipPath}.part`, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(`${zipPath}.part`, zipPath);
}

// A zip's members, from its central directory (every SDE member is deflated, method 8; stored ones are read as they are).
const zip = fs.readFileSync(zipPath);
const members = new Map();
{
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error(`${zipPath} isn't a zip`);
  let at = zip.readUInt32LE(eocd + 16);
  const count = zip.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('a broken central directory');
    const method = zip.readUInt16LE(at + 10), size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28), extraLen = zip.readUInt16LE(at + 30), commentLen = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    members.set(zip.toString('utf8', at + 46, at + 46 + nameLen), { method, size, local });
    at += 46 + nameLen + extraLen + commentLen;
  }
}
async function* lines(name) {
  const m = members.get(name);
  if (!m) throw new Error(`${name} isn't in the zip`);
  const start = m.local + 30 + zip.readUInt16LE(m.local + 26) + zip.readUInt16LE(m.local + 28);
  const raw = Readable.from([zip.subarray(start, start + m.size)]);
  const input = m.method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
  for await (const l of readline.createInterface({ input, crlfDelay: Infinity })) if (l.trim()) yield JSON.parse(l);
}
const all = async (name) => { const out = new Map(); for await (const r of lines(name)) out.set(r._key, r); return out; };

let sde = null;
for await (const s of lines('_sde.jsonl')) sde = s;
const types = await all('types.jsonl');
const groups = await all('groups.jsonl');
const bps = await all('blueprints.jsonl');

const man = (b) => { const m = b.activities?.manufacturing; return m?.products?.length ? m : null; };
const onMarket = (id) => types.get(id)?.marketGroupID != null;

// Tech I (sold on the market, its product too) and Tech II (what they invent).
const t1 = new Set(), t2 = new Set();
for (const [id, b] of bps) {
  const m = man(b);
  if (m && types.get(id)?.published && onMarket(id) && onMarket(m.products[0].typeID)) t1.add(id);
}
for (const id of t1) for (const p of bps.get(id).activities.invention?.products ?? []) if (bps.has(p.typeID) && man(bps.get(p.typeID))) t2.add(p.typeID);
const kept = [...new Set([...t1, ...t2])].sort((a, b) => a - b);

const wanted = new Set(INDUSTRY_SKILLS);
const activity = (a) => {
  if (!a) return 0;
  const mats = (a.materials ?? []).map((m) => [m.typeID, m.quantity]);
  const skills = (a.skills ?? []).map((s) => [s.typeID, s.level]);
  const products = (a.products ?? []).map((p) => (p.probability != null ? [p.typeID, p.quantity, p.probability] : [p.typeID, p.quantity]));
  for (const [t] of [...mats, ...skills, ...products]) wanted.add(t);
  return [a.time ?? 0, mats, skills, products];
};
const outBps = kept.map((id) => {
  const b = bps.get(id);
  wanted.add(id);
  return [id, b.maxProductionLimit ?? 0, ...ACTIVITIES.map((n) => activity(b.activities?.[n]))];
});

// Rigs: their dogma, then the modifier sources of the Tech I and Tech II engineering rigs.
const sources = [];
for await (const m of lines('industryModifierSources.jsonl')) sources.push(m);
const want = new Set([...sources.map((m) => m._key), ...STRUCTURES]);
const dogma = new Map();
for await (const t of lines('typeDogma.jsonl')) if (want.has(t._key) || wanted.has(t._key)) dogma.set(t._key, Object.fromEntries((t.dogmaAttributes ?? []).map((a) => [a.attributeID, a.value])));
const rigs = [];
for (const m of sources) {
  const t = types.get(m._key), d = dogma.get(m._key) ?? {};
  const tech = TECH[t?.metaGroupID];
  const size = d[1547];
  if (!t?.published || !tech || ![2, 3, 4].includes(size)) continue;
  const mods = [];
  for (const [act, kinds] of Object.entries(m)) {
    if (act === '_key' || !RIG_ACTIVITIES.has(act)) continue;
    for (const [kind, list] of Object.entries(kinds)) {
      if (!RIG_KINDS.has(kind)) continue;
      for (const x of list) mods.push([act, kind, x.filterID ?? 0]);
    }
  }
  if (!mods.length) continue;
  mods.sort((a, b) => `${a[0]}:${a[1]}:${a[2]}`.localeCompare(`${b[0]}:${b[1]}:${b[2]}`));
  rigs.push([m._key, size, tech, mods, [d[2593] ?? 0, d[2594] ?? 0, d[2595] ?? 0], [d[2355] ?? 1, d[2356] ?? 1, d[2357] ?? 1]]);
  wanted.add(m._key);
}
rigs.sort((a, b) => a[0] - b[0]);

const structures = {};
for (const id of STRUCTURES) {
  const d = dogma.get(id);
  if (!d || d[2600] == null || d[2601] == null || d[2602] == null) throw new Error(`structure ${id} has no engineering bonuses`);
  structures[id] = [d[2600], d[2601], d[2602]];
}

const filters = {};
for await (const f of lines('industryTargetFilters.jsonl')) filters[f._key] = [f.name, [...(f.categoryIDs ?? [])].sort((a, b) => a - b), [...(f.groupIDs ?? [])].sort((a, b) => a - b)];

const outTypes = {};
for (const id of [...wanted].sort((a, b) => a - b)) {
  const t = types.get(id);
  if (!t) throw new Error(`type ${id} isn't in types.jsonl`);
  const g = groups.get(t.groupID);
  outTypes[id] = [t.name?.en ?? `Item #${id}`, t.groupID, g?.categoryID ?? 0, t.packagedVolume ?? t.volume ?? 0, t.basePrice ?? 0, MINEABLE_GROUPS.has(t.groupID) ? 1 : 0];
}

// The groups those types are in, named: the finder sorts products into kinds by them (a ship rig's group is "Rig …").
const outGroups = {};
for (const t of Object.values(outTypes)) if (!outGroups[t[1]]) outGroups[t[1]] = [groups.get(t[1])?.name?.en ?? `Group #${t[1]}`, t[2]];

const skills = {};
for (const id of Object.keys(outTypes).map(Number)) {
  if (groups.get(types.get(id).groupID)?.categoryID !== 16) continue;
  const d = dogma.get(id);
  if (!d || d[275] == null) throw new Error(`skill ${id} has no rank`);
  const attr = BONUS_ATTRS.find((a) => d[a] != null) ?? 0;
  skills[id] = [d[275], d[180], d[181], attr, attr ? d[attr] : 0];
}

const service = new Map();
for await (const s of lines('stationServices.jsonl')) service.set(s._key, s.serviceName?.en);
const ops = await all('stationOperations.jsonl');
const stations = [];
for await (const s of lines('npcStations.jsonl')) {
  const names = new Set((ops.get(s.operationID)?.services ?? []).map((x) => service.get(x)));
  const services = (names.has('Factory') ? 1 : 0) + (names.has('Laboratory') ? 2 : 0);
  if (services) stations.push([s._key, s.solarSystemID, services]);
}
stations.sort((a, b) => a[0] - b[0]);

// Every published blueprint's ME 0 manufacturing materials, for a job's estimated item value.
const eiv = {};
for (const [id, b] of [...bps].sort((a, b) => a[0] - b[0])) {
  const m = man(b);
  if (m && types.get(id)?.published) eiv[id] = (m.materials ?? []).map((x) => [x.typeID, x.quantity]);
}

// The watch set: every Tech I product and its materials. The blueprints whose NPC sellers the scan keeps: Tech I only.
const watch = new Set(), bpos = [];
for (const id of [...t1].filter((x) => !t2.has(x)).sort((a, b) => a - b)) {
  const m = man(bps.get(id));
  watch.add(m.products[0].typeID);
  for (const x of m.materials ?? []) watch.add(x.typeID);
  bpos.push(id);
}

const released = sde.releaseDate;
const out = { build: sde.buildNumber, released, source: `CCP static data build ${sde.buildNumber}, released ${released}`, bps: outBps, types: outTypes, groups: outGroups, filters, rigs, structures, stations, skills };
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/industry.json', JSON.stringify(out));
fs.writeFileSync('src/data/industryEiv.json', JSON.stringify({ build: sde.buildNumber, eiv }));
fs.writeFileSync('src/data/industryTypes.json', JSON.stringify({ build: sde.buildNumber, watch: [...watch].sort((a, b) => a - b), bpos }));

const kb = (f) => `${(fs.statSync(f).size / 1024).toFixed(1)} KB, ${(zlib.gzipSync(fs.readFileSync(f)).length / 1024).toFixed(1)} KB gzipped`;
console.log(out.source);
console.log(`${outBps.length} blueprints (${t1.size} on the market, ${t2.size} Tech II, ${[...t1].filter((x) => t2.has(x)).length} both), ${Object.keys(outTypes).length} types in ${Object.keys(outGroups).length} groups, ${rigs.length} rigs, ${stations.length} stations, ${Object.keys(skills).length} skills`);
console.log(`src/data/industry.json: ${kb('src/data/industry.json')}`);
console.log(`src/data/industryEiv.json: ${Object.keys(eiv).length} blueprints, ${kb('src/data/industryEiv.json')}`);
console.log(`src/data/industryTypes.json: ${watch.size} watched, ${bpos.length} blueprints, ${kb('src/data/industryTypes.json')}`);
```

- [ ] **Step 4: Build the bundle**

Run: `SDE_ZIP=.playwright-mcp/research/rd-agents/sde-3569502.zip node scripts/industry-bundle.mjs`
Expected, exactly:

```
CCP static data build 3569502, released 2026-10-02T11:08:57Z
2693 blueprints (1741 on the market, 1020 Tech II, 68 both), 5670 types in 602 groups, 106 rigs, 2305 stations, 57 skills
src/data/industry.json: 1056.4 KB, 144.5 KB gzipped
src/data/industryEiv.json: 4039 blueprints, 269.7 KB, 50.6 KB gzipped
src/data/industryTypes.json: 1858 watched, 1673 blueprints, 19.6 KB, 7.9 KB gzipped
```

Run it a second time and `git diff --stat src/data/`: nothing changes (a rebuild of one build is byte-identical).

- [ ] **Step 5: Run the test to see it pass, then plant each rule wrong**

Run: `npm run check 2>&1 | grep -B2 -A2 "FAIL\|all passed"`
Expected: `all passed` for the pure checks (the Worker checks follow and pass as before).

Then plant, rebuild with Step 4's command, and see the named test fail; undo and rebuild after each:
- In the rig loop, read `d[x.dogmaAttributeID]` instead of `d[2593]`, `d[2594]`, `d[2595]`: "a rig's own values" fails (zeros).
- In the watch loop, iterate `[...t1]` without `.filter((x) => !t2.has(x))`: "the cloud's watch set" fails (1,927 / 1,741).
- Drop `![2, 3, 4].includes(size)` from the rig filter: the counts line fails.

- [ ] **Step 6: Write the note and its rule**

Create `docs/notes/industry.md`:

```markdown
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
```

Create `.claude/rules/industry.md`:

```markdown
---
paths:
  - "src/lib/{industry,industryRank,industrySites,industryLadder,homeMarket,altFees}.ts"
  - "src/components/hustles/{Industry.tsx,IndustryStart.tsx,IndustrySites.tsx,IndustryBuild.tsx,IndustryDetail.tsx,industryChars.ts,industryBundle.ts,industryMarket.ts,industryFinder.ts}"
  - "src/components/FindStructure.tsx"
  - "src/data/{industry,industryEiv,industryTypes}.json"
  - "scripts/industry-bundle.mjs"
  - "worker/src/{industryNpc,goonmetrics}.ts"
  - "worker/migrations/{0018_industry_npc,0019_home_prices}.sql"
---

# Industry

These files are covered by `docs/notes/industry.md`, imported below: the Industry side hustle, its bundle from CCP's
static data, the rules for jobs, research, copying and invention, build sites, the finder, home prices from Goonmetrics
and the ladder. If the note's text doesn't follow this paragraph, Read that file before changing anything here.

@../../docs/notes/industry.md
```

In `CLAUDE.md`, under "Loaded when you read a file it covers", after the `research.md` line, add:

```markdown
- `industry.md`: the Industry side hustle: the static-data bundle, the job, research, copying and invention rules, build
  sites, the finder, home prices from Goonmetrics, the ladder.
```

Check the rule's frontmatter parses: `node -e "const s=require('fs').readFileSync('.claude/rules/industry.md','utf8'); const m=/^---\n([\s\S]*?)\n---/.exec(s); console.log(m[1].split('\n').filter((l)=>l.startsWith('  - ')).length)"`
Expected: `7`.

- [ ] **Step 7: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-income`
Expected: all pass. Nothing imports the bundle yet, so no page changes; `vite build` doesn't emit the JSON until Task 4A
imports it.

- [ ] **Step 8: Commit**

```bash
git add scripts/industry-bundle.mjs src/data/industry.json src/data/industryEiv.json src/data/industryTypes.json \
  docs/notes/industry.md .claude/rules/industry.md scripts/check.mjs CLAUDE.md
git commit -m "$(cat <<'MSG'
Industry: the static-data bundle the tab and the cloud read

What was missing: ESI serves no blueprints, rigs, structure bonuses or station services, and the Industry tab (spec
2026-10-10-industry-design.md) works every figure out from them.

What it is: scripts/industry-bundle.mjs reads CCP's static data (build 3569502, SDE_ZIP reuses the zip already here)
into three files. industry.json, the tab's own chunk: 2,693 blueprints (1,741 on the market, 1,020 Tech II they
invent, 68 both), 5,670 types in 602 named groups, 106 rigs, 2,305 NPC stations with a Factory or Laboratory, 57
skills; 1,056 KB and 145 KB gzipped against the spec's 1.2 MB / 160 KB. industryEiv.json, every published blueprint's ME 0 materials (4,039),
for stage 2's first-sight EIV. industryTypes.json, the cloud's watch set (1,858) and the 1,673 blueprints whose NPC
sellers the morning scan will keep.

Two readings the spec got wrong, found building it: a modifier source's dogmaAttributeID (2538…) names the structure
attribute it moves and isn't on the rig, so a rig's value is its own 2593/2594/2595 times its security multiplier; and
only Tech I and Tech II engineering rigs are kept (106, not 220: Thukker, faction and reaction-only rigs out). The 68 old
Tech II originals count as Tech II: NPCs never sold them.

Tests: the worked Large Trimark Armor Pump I and its Tech II blueprint, the rig values, filters, skills, station services,
the counts and the budget. Reading the source's attribute for a rig, a watch set with Tech II in it and no size filter
each failed a check.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
MSG
)"
```

---
### Task 2: `industry.ts`, the rules, pinned on EVE Ref's figures

**Files:**
- Create: `src/lib/industry.ts`, `scripts/fixtures/industry-everef.json`
- Modify: `scripts/check.mjs` (a section "Industry: the rules"), `docs/notes/industry.md`

**Interfaces:**
- Consumes: `src/data/industry.json` (Task 1).
- Produces (every later task imports these from `src/lib/industry.ts`):
  - Types: `Activity` (`'manufacturing' | 'copying' | 'researchMaterial' | 'researchTime' | 'invention'`), `BpActivity`,
    `BundleBp`, `BundleType`, `BundleRig`, `RigKind`, `IndustryBundle`, `Indexed`, `SiteKind`
    (`'npc' | 'raitaru' | 'azbel' | 'sotiyo' | 'astrahus' | 'fortizar' | 'keepstar' | 'other'`), `SecBand`
    (`'high' | 'low' | 'null'`), `Bonus` (`{ material; time; cost }`), `Clone` (`'alpha' | 'omega' | 'unknown'`),
    `CostAt` (`{ index; structure; rig; tax: number | null; clone }`), `JobCost`
    (`{ base; index; bonus; tax: number | null; scc; alpha: number | null; total }`), `IndustryIndex`
    (`{ manufacturing; copying; invention; researchMaterial; researchTime }`).
  - `indexBundle(b): Indexed` (`bp`, `byProduct`, `t2`, `inventedFrom`, `rig` maps), `activityOf(bp, a)`,
    `nameOf(ix, id)`, `productOf(bp): { type; perRun } | null`.
  - Constants: `SCC` 0.04, `SCC_COPY` 0.04, `SCC_RESEARCH` 0.02, `ALPHA_TAX` 0.0025, `NPC_FACILITY_TAX` 0.0025,
    `COPY_BASE`, `RESEARCH_BASE`, `INVENTION_BASE` 0.02, `LEVEL_MOD`, `MAX_SLOTS` 11, `DAY_S` 86,400, `SKILL`,
    `STRUCTURE_TYPE`, `RIG_SIZE`, `KIND_SAID`, `NO_BONUS`.
  - Rules: `kindOfType(typeId)`, `secBand(security)`, `structureBonus(ix, kind)`, `inFilter(ix, filter, product)`,
    `rigFor(ix, rigs, kind, band, product, activity): Bonus`, `materialsFor(mats, runs, me, structure, rig)`,
    `manufacturingSkills(ix, required, skills)`, `jobTime(base, te, skills, structure, rig)`,
    `runsPerDay(timePerRun, cap?)`, `copyTime(ix, base, runs, copies, skills, structure, rig)`,
    `researchTime(ix, base, 'me' | 'te', from, to, skills, structure, rig)`,
    `inventionTime(ix, base, skills, structure, rig)`, `inventionChance(base, sci1, sci2, enc, decryptor = 0)`,
    `jobCostOf(base, c, scc)`, `manufacturingCost(eivRun, runs, c)`, `copyCost(eivRun, runs, copies, c)`,
    `researchCost(eivRun, from, to, c)`, `inventionCost(eivT2Run, attempts, c)`, `eivOf(mats, adjusted): number | null`,
    `slots(ix, skills): { factory; science }`, `lacking(required, skills)`, `parseIndices(raw)`, `indexFor(index, a)`.

- [ ] **Step 1: Pin the figures in a fixture**

EVE Ref's answers and ESI's adjusted prices and indices are on this machine from the research (gitignored). Write
`.playwright-mcp/industry/build-fixture.mjs`:

```js
// Builds scripts/fixtures/industry-everef.json from the research's saved answers (gitignored, on this machine).
import fs from 'node:fs';
const R = process.env.REPO ?? '.';
const web = (f) => JSON.parse(fs.readFileSync(`${R}/.playwright-mcp/research/bpo/data/web/${f}`, 'utf8'));
const spec = (f) => JSON.parse(fs.readFileSync(`${R}/.playwright-mcp/research/industry-spec/${f}`, 'utf8'));
const t1 = web('everef-25894.json'), t2 = web('everef-26302.json');
const TYPES = [25601, 25605, 25590, 25624, 25609, 11475, 25620, 20416, 20171, 34, 35, 36, 37, 38, 39, 40];
const SYSTEMS = [30000142, 30000144, 30000140, 30000139, 30000119, 30001363, 30004807, 30000772];
const prices = spec('markets_prices.json'), systems = spec('industry_systems.json');
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const out = {
  read: {
    everef: 'api.everef.net/v1/industry/cost, 9 October 2026 (the research, .playwright-mcp/research/bpo/data/web/everef-25894.json and everef-26302.json)',
    esi: 'ESI /markets/prices/ and /industry/systems/, 10 October 2026 05:44 UTC, no login, User-Agent jita-ledger (research), X-Compatibility-Date 2026-08-18 (.playwright-mcp/research/industry-spec/)',
  },
  adjusted: Object.fromEntries(prices.filter((p) => TYPES.includes(p.type_id)).map((p) => [p.type_id, p.adjusted_price])),
  systems: systems.filter((s) => SYSTEMS.includes(s.solar_system_id)),
  t1: {
    input: pick(t1.input, ['me', 'te', 'runs', 'industry', 'advanced_industry', 'science', 'structure_type_id', 'rig_id', 'security', 'facility_tax', 'manufacturing_cost', 'copying_cost']),
    manufacturing: pick(t1.manufacturing['25894'], ['estimated_item_value', 'facility_tax', 'materials', 'runs', 'scc_surcharge', 'system_cost_bonuses', 'system_cost_index', 'time_per_run', 'total_job_cost']),
    copying: pick(t1.copying['25895'], ['estimated_item_value', 'facility_tax', 'job_cost_base', 'runs', 'scc_surcharge', 'time', 'total_job_cost']),
  },
  t2: {
    input: pick(t2.input, ['industry', 'advanced_industry', 'hydromagnetic_physics', 'nanite_engineering', 'amarr_encryption_methods', 'structure_type_id', 'rig_id', 'security', 'facility_tax', 'manufacturing_cost', 'invention_cost']),
    manufacturing: pick(t2.manufacturing['26302'], ['estimated_item_value', 'materials', 'me', 'te', 'time', 'runs']),
    invention: pick(t2.invention['26303'], ['estimated_item_value', 'job_cost_base', 'probability', 'runs', 'system_cost_index', 'system_cost_bonuses', 'facility_tax', 'scc_surcharge', 'total_job_cost', 'avg_time_per_copy', 'materials']),
  },
};
for (const m of Object.values(out.t1.manufacturing.materials)) for (const k of ['cost', 'cost_per_unit']) delete m[k];
for (const m of Object.values(out.t2.manufacturing.materials)) for (const k of ['cost', 'cost_per_unit']) delete m[k];
for (const m of Object.values(out.t2.invention.materials)) for (const k of ['cost', 'cost_per_unit']) delete m[k];
fs.mkdirSync('scripts/fixtures', { recursive: true });
fs.writeFileSync('scripts/fixtures/industry-everef.json', JSON.stringify(out, null, 1) + '\n');
console.log(`scripts/fixtures/industry-everef.json: ${Object.keys(out.adjusted).length} prices, ${out.systems.length} systems, ${(fs.statSync('scripts/fixtures/industry-everef.json').size / 1024).toFixed(1)} KB`);
```

Run: `mkdir -p .playwright-mcp/industry && node .playwright-mcp/industry/build-fixture.mjs`
Expected: `scripts/fixtures/industry-everef.json: 16 prices, 8 systems, 7.6 KB`. Its `read` says where every figure came
from. (Were the research's files gone, the same figures come from ESI's public `/markets/prices/` and
`/industry/systems/` with `User-Agent: jita-ledger (research)` and `X-Compatibility-Date: 2026-08-18`, and from
`https://api.everef.net/v1/industry/cost?product_id=25894&runs=65&me=10&te=20&industry=4&advanced_industry=2&structure_type_id=35826&rig_id=37170&security=NULL_SEC&facility_tax=0.01&manufacturing_cost=0.0617`;
adjusted prices move daily, so re-pinning means re-reading EVE Ref the same hour.)

- [ ] **Step 2: Write the failing test**

Add to `scripts/check.mjs`, after Task 1's section:

```js
console.log('\n--- Industry: the rules (industry.ts), on EVE Ref\'s own figures ---');
{
  // Each rule against EVE Ref's industry API on the research's Large Trimark Armor Pump I (an Azbel in null-sec with a
  // Tech I L-Set Equipment rig, UALX-3's 6.17% index, 1% facility tax) and its Tech II, with ESI's adjusted prices of 10
  // October 2026 at full precision (scripts/fixtures/industry-everef.json).
  const I = await import('../src/lib/industry.ts');
  const fsI = await import('node:fs');
  const fx = JSON.parse(fsI.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8'));
  const ix = I.indexBundle(JSON.parse(fsI.readFileSync(new URL('../src/data/industry.json', import.meta.url), 'utf8')));
  const near = (label, got, want, tol) => { if (!(Math.abs(got - want) <= tol)) { failed++; console.log(`  FAIL ${label}: got ${got}, want ${want} ± ${tol}`); } };
  const LTAP = ix.bp.get(25895), LTAP2 = ix.bp.get(26303);
  const azbel = I.structureBonus(ix, 'azbel');
  const rig = I.rigFor(ix, [37170], 'azbel', 'null', 25894, 'manufacturing');
  const r6 = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 1e6) / 1e6]));
  eq('  the Azbel\'s role bonus, and the Tech I L-Set Equipment rig in null-sec on a large armor rig', [azbel, r6(rig)], [{ material: 0.99, cost: 0.96, time: 0.8 }, { material: 0.958, time: 0.58, cost: 1 }]);

  // Materials, as EVE Ref read them: 4,606 / 3,995 / 3,108 for 65 runs at ME 10.
  const mats = I.materialsFor(LTAP[2][1], 65, 10, azbel.material, rig.material);
  eq('  a day\'s 65 runs at ME 10 use 4,606 / 3,995 / 3,108', mats, [[25601, 4606], [25605, 3995], [25590, 3108]]);
  eq('    as EVE Ref read them', mats.map(([t, q]) => fx.t1.manufacturing.materials[t].quantity === q), [true, true, true]);
  eq('    rounded per job, not per run (65 × ceil(83 × 0.8536) would be 4,615)', mats[0][1], 4606);
  eq('    a material needed once a run never falls under the runs', I.materialsFor([[11475, 1]], 1, 2, 0.99, 0.958), [[11475, 1]]);

  // Time: 4,500 × 0.80 (TE 20) × 0.84 (Industry IV) × 0.94 (Advanced Industry II) × 0.80 × 0.58 = 1,318.95 s; EVE Ref 21 min 58.953 s.
  const sk1 = { 3380: 4, 3388: 2 };
  const t1 = I.jobTime(LTAP[2][0], 20, I.manufacturingSkills(ix, LTAP[2][2], sk1), azbel.time, rig.time);
  eq('  a run takes 1,318.95 s, and a day holds 65 of them', [Math.round(t1 * 100) / 100, I.runsPerDay(t1)], [1318.95, 65]);

  // Job cost: 65 × EIV × (6.17% × 0.96 + 1% + 4%): EVE Ref 17,213,916.
  const eiv1 = I.eivOf(LTAP[2][1], fx.adjusted);
  near('  the estimated item value of 65 runs, as EVE Ref read it', eiv1 * 65, fx.t1.manufacturing.estimated_item_value, 1);
  const job = I.manufacturingCost(eiv1, 65, { index: 0.0617, structure: azbel.cost, rig: 1, tax: 0.01, clone: 'omega' });
  near('  the job costs 17,213,916, as EVE Ref charges it (the spec\'s 17,213,889 doesn\'t follow from its own inputs)', job.total, fx.t1.manufacturing.total_job_cost, 30);
  near('    its index part', job.index, fx.t1.manufacturing.system_cost_index, 1);
  near('    the Azbel\'s 4% off the index part only', job.bonus, fx.t1.manufacturing.system_cost_bonuses, 1);
  near('    the facility tax', job.tax, fx.t1.manufacturing.facility_tax, 1);
  near('    the SCC', job.scc, fx.t1.manufacturing.scc_surcharge, 1);
  eq('    no Alpha tax for Omega', job.alpha, 0);
  eq('    an Alpha pays 0.25% of the base more; a clone not known leaves it out, never 0', [Math.round(I.manufacturingCost(eiv1, 65, { index: 0.0617, structure: 0.96, rig: 1, tax: 0.01, clone: 'alpha' }).total - job.total), I.manufacturingCost(eiv1, 65, { index: 0.0617, structure: 0.96, rig: 1, tax: 0.01, clone: 'unknown' }).alpha], [393976, null]);
  const untaxed = I.manufacturingCost(eiv1, 65, { index: 0.0617, structure: 0.96, rig: 1, tax: null, clone: 'omega' });
  eq('    a facility tax not known is null, and left out of the total', [untaxed.tax, Math.round(job.total - untaxed.total)], [null, Math.round(job.tax)]);
  eq('  an adjusted price missing leaves the EIV unknown, never a smaller one', I.eivOf(LTAP[2][1], { 25601: 1915.27, 25605: 30108.09 }), null);

  // Copying the BPO for 65 runs: base 3,151,808, SCC 126,072, tax 31,518 (EVE Ref; copying index 0 there).
  const copy = I.copyCost(eiv1, 65, 1, { index: 0, structure: azbel.cost, rig: 1, tax: 0.01, clone: 'omega' });
  eq('  copying 65 runs: base 3,151,808, SCC 126,072, tax 31,518, as EVE Ref charges', [copy.base, copy.scc, copy.tax].map(Math.round), [fx.t1.copying.job_cost_base, fx.t1.copying.scc_surcharge, fx.t1.copying.facility_tax]);
  eq('    and takes 36 h 39 min 36 s at Science V, Advanced Industry II in an Azbel', I.copyTime(ix, LTAP[3][0], 65, 1, { 3402: 5, 3388: 2 }, azbel.time, 1), 131976);

  // Invention at Hydromagnetic Physics III, Nanite Engineering III, Amarr Encryption Methods III: 0.4335; base 1,638,947.87
  // on an EIV of 81,947,396.54 (the Tech II product's 35,524,196 a run, for 2.3068 attempts).
  const p = I.inventionChance(LTAP[6][3][0][2], 3, 3, 3);
  eq('  invention\'s chance at III, III and III: 0.4335, as EVE Ref', p, fx.t2.invention.probability);
  const eiv2 = I.eivOf(LTAP2[2][1], fx.adjusted);
  near('  the Tech II product\'s EIV a run', eiv2, fx.t2.manufacturing.estimated_item_value, 1);
  const inv = I.inventionCost(eiv2, 1 / p, { index: 0.0793, structure: azbel.cost, rig: 1, tax: 0.01, clone: 'omega' });
  near('  invention\'s base for the attempts one copy takes: 1,638,947.87', inv.base, fx.t2.invention.job_cost_base, 0.1);
  near('    and its job cost, 206,717.19', inv.total, fx.t2.invention.total_job_cost, 0.1);
  // EVE Ref's input had Science V: no science skill shortens invention, so it must change nothing.
  near('    an attempt takes 17,596.8 s, a copy 11 h 16 min 32.4 s, Science V or not', I.inventionTime(ix, LTAP[6][0], { 3388: 2, 3402: 5 }, azbel.time, 1) / p, 40592.387, 0.01);

  // Tech II manufacturing at ME 2 / TE 4: 19 / 14 / 1 / 22, 4 h 8 min 12 s (the science skills' 1% a level, from dogma 1982).
  eq('  the Tech II pump at ME 2: 19 / 14 / 1 / 22, as EVE Ref read them', I.materialsFor(LTAP2[2][1], 1, 2, azbel.material, rig.material), [[25624, 19], [25609, 14], [11475, 1], [25620, 22]]);
  const sk2 = { 3380: 4, 3388: 2, 11442: 3, 11443: 3 };
  eq('    and takes 14,892 s, 4 h 8 min 12 s', Math.round(I.jobTime(LTAP2[2][0], 4, I.manufacturingSkills(ix, LTAP2[2][2], sk2), azbel.time, rig.time)), 14892);

  // ME research on the level table: ME 8 is about 18% of ME 10's time.
  const me10 = I.researchTime(ix, LTAP[4][0], 'me', 0, 10, { 3409: 5, 3388: 5 }, 1, 1);
  const me8 = I.researchTime(ix, LTAP[4][0], 'me', 0, 8, { 3409: 5, 3388: 5 }, 1, 1);
  eq('  ME 0 → 10 at Metallurgy V and Advanced Industry V in a station: 2,448,000 s (28.3 days); ME 8: 432,750.94 s', [me10, me8], [2448000, 432750.9375]);
  eq('    ME 8 takes 17.7% of ME 10\'s time (the research\'s "about 18%")', Math.round((me8 / me10) * 1000) / 10, 17.7);
  eq('    TE 0 → 20 (level 10) reads Research, not Metallurgy', [I.researchTime(ix, LTAP[5][0], 'te', 0, 10, { 3403: 5, 3388: 5 }, 1, 1), I.researchTime(ix, LTAP[5][0], 'te', 0, 10, { 3409: 5, 3388: 5 }, 1, 1)], [2448000, 3264000]);
  const rc = I.researchCost(eiv1, 0, 10, { index: 0.0725, structure: 1, rig: 1, tax: I.NPC_FACILITY_TAX, clone: 'omega' });
  eq('  ME 0 → 10 at Perimeter\'s 7.25% ME index in a station: base 118,221,673, 2% SCC, 11,231,059 in all', [Math.round(rc.base), Math.round(rc.scc), Math.round(rc.total)], [118221673, 2364433, 11231059]);

  eq('  slots: Mass Production V and Advanced V make 11 factory slots; Laboratory Operation IV 5 science slots; none, one each',
    [I.slots(ix, { 3387: 5, 24625: 5, 3406: 4 }), I.slots(ix, {})], [{ factory: 11, science: 5 }, { factory: 1, science: 1 }]);
  // The rig filter: a Medium T1 rig helps a cruiser and not a frigate, fits a Raitaru and not an Azbel, and doubles in null-sec.
  eq('  the M-Set Basic Medium Ship ME rig: a Caracal in high-sec 0.98, a Rifter nothing, on an Azbel nothing, in null-sec 0.958',
    [I.rigFor(ix, [37146], 'raitaru', 'high', 621, 'manufacturing').material, I.rigFor(ix, [37146], 'raitaru', 'high', 587, 'manufacturing').material,
      I.rigFor(ix, [37146], 'azbel', 'high', 621, 'manufacturing').material, I.rigFor(ix, [37146], 'raitaru', 'null', 621, 'manufacturing').material], [0.98, 1, 1, 0.958]);
  eq('    Tech I and Tech II together on one product: the better is taken', I.rigFor(ix, [37146, 37147], 'raitaru', 'high', 621, 'manufacturing').material, 0.976);
  eq('    an NPC station takes no rig', I.rigFor(ix, [37146], 'npc', 'high', 621, 'manufacturing'), I.NO_BONUS);
  eq('  security bands as reprocess.ts reads them', [0.45, 0.449, 0.1, 0, -0.2].map(I.secBand), ['high', 'low', 'low', 'null', 'null']);
  eq('  a structure\'s kind from its type: an Azbel, a Fortizar, an Athanor (no bonuses here)', [35826, 35833, 35835].map(I.kindOfType), ['azbel', 'fortizar', 'other']);
  const idx = I.parseIndices(fx.systems);
  eq('  ESI\'s indices by system: UALX-3\'s manufacturing 6.12%, ME research 9.47%; a system missing an activity isn\'t listed',
    [idx[30004807].manufacturing, idx[30004807].researchMaterial, I.parseIndices([{ solar_system_id: 1, cost_indices: [{ activity: 'manufacturing', cost_index: 0.1 }] }])[1]], [0.0612, 0.0947, undefined]);
  eq('  the named constants the copy states', [I.SCC, I.SCC_COPY, I.SCC_RESEARCH, I.ALPHA_TAX, I.NPC_FACILITY_TAX, I.LEVEL_MOD.length, I.MAX_SLOTS], [0.04, 0.04, 0.02, 0.0025, 0.0025, 11, 11]);
  eq('  the bundle indexed: the pump\'s blueprint by its product, its Tech II invented from it', [ix.byProduct.get(25894)?.[0], ix.t2.has(26303), ix.inventedFrom.get(26303), ix.t2.has(25895), ix.t2.size], [25895, true, 25895, false, 1020]);
}
```

- [ ] **Step 3: Run it to see it fail**

Run: `npm run check 2>&1 | grep -A3 "Industry: the rules"`
Expected: `ERR_MODULE_NOT_FOUND … src/lib/industry.ts`.

- [ ] **Step 4: Write `src/lib/industry.ts`**

```ts
/**
 * Industry's rules (docs/notes/industry.md; spec docs/superpowers/specs/2026-10-10-industry-design.md): what a job uses,
 * how long it takes and what the game charges for it, for manufacturing, ME and TE research, copying and invention; the
 * slots a character has; which rigs help a product; the bundle's shape (src/data/industry.json, scripts/industry-bundle.mjs).
 * Pure: no config, store, React or DOM, so check.mjs loads it and the Worker may import it. Every rule was checked against
 * EVE Ref's industry API on the research's Large Trimark Armor Pump I and its Tech II (scripts/fixtures/industry-everef.json).
 */

export type Activity = 'manufacturing' | 'copying' | 'researchMaterial' | 'researchTime' | 'invention';
/** One activity of a blueprint: time (s, a run), materials a run, skills, products (an invention product carries its chance). */
export type BpActivity = [time: number, materials: [number, number][], skills: [number, number][], products: number[][]];
export type BundleBp = [bp: number, maxRuns: number, manufacturing: BpActivity | 0, copying: BpActivity | 0, researchMaterial: BpActivity | 0, researchTime: BpActivity | 0, invention: BpActivity | 0];
/** A type: name, group, category, packaged volume (m³), CCP's base price (0: none), mineable (minerals, ice products, moon materials). */
export type BundleType = [name: string, group: number, category: number, volume: number, basePrice: number, mineable: 0 | 1];
export type RigKind = 'material' | 'time' | 'cost';
/** A rig: type, size (2 M-Set, 3 L-Set, 4 XL-Set), tech (1, 2), what it helps, its time / material / cost bonus (%), and its multipliers by security. */
export type BundleRig = [type: number, size: number, tech: number, mods: [Activity, RigKind, number][], values: [time: number, material: number, cost: number], sec: [high: number, low: number, nul: number]];
export type IndustryBundle = {
  build: number; released: string; source: string;
  bps: BundleBp[];
  types: Record<string, BundleType>;
  groups: Record<string, [name: string, category: number]>;
  filters: Record<string, [name: string, categories: number[], groups: number[]]>;
  rigs: BundleRig[];
  /** Raitaru, Azbel, Sotiyo: material, cost, time. */
  structures: Record<string, [number, number, number]>;
  /** NPC stations: station, system, services (1 a Factory, 2 a Laboratory). */
  stations: [number, number, number][];
  /** Skills: rank, primary, secondary, the bonus attribute it carries (0: none), and its value a level. */
  skills: Record<string, [number, number, number, number, number]>;
};

/** The bundle, indexed once for the lookups every row makes. */
export type Indexed = {
  b: IndustryBundle;
  bp: Map<number, BundleBp>;
  /** A manufacturing product's blueprint. */
  byProduct: Map<number, BundleBp>;
  /** Blueprints some blueprint invents: Tech II, costed through invention. */
  t2: Set<number>;
  /** A Tech II blueprint → the Tech I blueprint that invents it. */
  inventedFrom: Map<number, number>;
  rig: Map<number, BundleRig>;
};

const ACT: Record<Activity, 2 | 3 | 4 | 5 | 6> = { manufacturing: 2, copying: 3, researchMaterial: 4, researchTime: 5, invention: 6 };

export function indexBundle(b: IndustryBundle): Indexed {
  const ix: Indexed = { b, bp: new Map(), byProduct: new Map(), t2: new Set(), inventedFrom: new Map(), rig: new Map(b.rigs.map((r) => [r[0], r])) };
  for (const x of b.bps) {
    ix.bp.set(x[0], x);
    const m = x[2];
    if (m && m[3][0]) ix.byProduct.set(m[3][0][0], x);
  }
  for (const x of b.bps) {
    const inv = x[6];
    if (!inv) continue;
    for (const p of inv[3]) if (ix.bp.has(p[0])) { ix.t2.add(p[0]); ix.inventedFrom.set(p[0], x[0]); }
  }
  return ix;
}

/** One activity of a blueprint, or null when it has none. */
export const activityOf = (bp: BundleBp, a: Activity): BpActivity | null => (bp[ACT[a]] || null) as BpActivity | null;
/** A type's name from the bundle; "Item #id" when it isn't in it. */
export const nameOf = (ix: Indexed, id: number): string => ix.b.types[id]?.[0] ?? `Item #${id}`;
/** What a blueprint builds and how many a run, or null for one that builds nothing. */
export function productOf(bp: BundleBp): { type: number; perRun: number } | null {
  const m = bp[2];
  return m && m[3][0] ? { type: m[3][0][0], perRun: m[3][0][1] } : null;
}

/**
 * The SCC surcharge on manufacturing and invention: 4% of the job's base since patch 21.06 (1 February 2024); EVE Ref
 * charges the same.
 */
export const SCC = 0.04;
/**
 * Copying's SCC: EVE Ref's calculator charges 4% of the job base (its copying output, 9 October 2026: base 3,151,808, SCC
 * 126,072); EVE University's copy formula has none. EVE Ref's reading until a copy job in an NPC station settles it.
 */
export const SCC_COPY = 0.04;
/**
 * Research's SCC: 2% since 17 July 2025 (CCP, "Exploration & Industry Balance Rework", called temporary), charged here on
 * the research job's base, the research's reading: CCP doesn't say on what. A research job in an NPC station settles it.
 */
export const SCC_RESEARCH = 0.02;
/** The Alpha clone tax on a job's base (EVE University; EVE Ref's `alpha_clone_tax`). */
export const ALPHA_TAX = 0.0025;
/** An NPC station's facility tax (EVE University, "Manufacturing", "Tax"): ESI's /industry/facilities gives none. */
export const NPC_FACILITY_TAX = 0.0025;
/** Copying, research and invention are charged on 2% of the estimated item value (EVE University; EVE Ref). */
export const COPY_BASE = 0.02;
export const RESEARCH_BASE = 0.02;
export const INVENTION_BASE = 0.02;
/**
 * Seconds to research a rank 1 blueprint to each level, 0 to 10 (EVE University, "Research"). A blueprint's own first-level
 * time in the static data is already rank × 105.
 */
export const LEVEL_MOD = [0, 105, 250, 595, 1414, 3360, 8000, 19000, 45255, 107700, 256000] as const;
/** Slots of each kind at most (EVE University, "Industry skills"): 1, Mass Production V and Advanced Mass Production V. */
export const MAX_SLOTS = 11;
export const DAY_S = 86_400;

/** The industry skills the rules read. Capital Ship Construction is for the ladder's last rung. */
export const SKILL = {
  industry: 3380, advancedIndustry: 3388, massProduction: 3387, advancedMassProduction: 24625,
  labOp: 3406, advancedLabOp: 24624, science: 3402, research: 3403, metallurgy: 3409, capitalShips: 22242,
} as const;

/** Where a job runs: an NPC station, an engineering complex, a citadel (no role bonus), or a structure the app has no bonuses for. */
export type SiteKind = 'npc' | 'raitaru' | 'azbel' | 'sotiyo' | 'astrahus' | 'fortizar' | 'keepstar' | 'other';
export const STRUCTURE_TYPE = { raitaru: 35825, azbel: 35826, sotiyo: 35827, astrahus: 35832, fortizar: 35833, keepstar: 35834 } as const;
/** The rig size a kind takes: M-Set (2) on a Raitaru or Astrahus, L-Set (3) on an Azbel or Fortizar, XL-Set (4) on a Sotiyo or Keepstar. */
export const RIG_SIZE: Record<SiteKind, number> = { npc: 0, other: 0, raitaru: 2, astrahus: 2, azbel: 3, fortizar: 3, sotiyo: 4, keepstar: 4 };
export const KIND_SAID: Record<SiteKind, string> = {
  npc: 'NPC station', raitaru: 'Raitaru', azbel: 'Azbel', sotiyo: 'Sotiyo', astrahus: 'Astrahus', fortizar: 'Fortizar', keepstar: 'Keepstar', other: 'a structure the app has no bonuses for',
};
/** A structure's kind from its type (ESI's /universe/structures `type_id`). */
export function kindOfType(typeId: number | null | undefined): SiteKind {
  for (const [k, id] of Object.entries(STRUCTURE_TYPE)) if (id === typeId) return k as SiteKind;
  return 'other';
}

export type SecBand = 'high' | 'low' | 'null';
/** A system's band for a rig's multiplier: 0.45 and up is high-sec, above 0 low-sec, the rest (wormholes too) null. As reprocess.ts reads it. */
export const secBand = (security: number): SecBand => (security >= 0.45 ? 'high' : security > 0 ? 'low' : 'null');

export type Bonus = { material: number; time: number; cost: number };
export const NO_BONUS: Bonus = { material: 1, time: 1, cost: 1 };

/** An engineering complex's role bonus (dogma 2600 material, 2601 cost, 2602 time); none for a station, a citadel or another structure. */
export function structureBonus(ix: Indexed, kind: SiteKind): Bonus {
  const id = (STRUCTURE_TYPE as Record<string, number>)[kind];
  const s = id != null ? ix.b.structures[id] : undefined;
  return s ? { material: s[0], cost: s[1], time: s[2] } : NO_BONUS;
}

/** Whether a product is in one of the static data's rig filters (0 is every product). */
export function inFilter(ix: Indexed, filter: number, product: number | null): boolean {
  if (!filter) return true;
  const f = ix.b.filters[filter], t = product != null ? ix.b.types[product] : null;
  return !!f && !!t && (f[1].includes(t[2]) || f[2].includes(t[1]));
}

/**
 * What a site's rigs do for one product's activity: of each kind, the best rig that fits the structure and helps that
 * product, at the site's security (1 + bonus% × multiplier). Two rigs of one kind on one product don't stack here: the
 * better is taken. A rig of another size, or any rig at an NPC station, does nothing.
 */
export function rigFor(ix: Indexed, rigs: readonly number[], kind: SiteKind, band: SecBand, product: number | null, activity: Activity): Bonus {
  const out = { ...NO_BONUS };
  const size = RIG_SIZE[kind];
  if (!size) return out;
  const sec = band === 'high' ? 0 : band === 'low' ? 1 : 2;
  const at: Record<RigKind, 0 | 1 | 2> = { time: 0, material: 1, cost: 2 };
  for (const id of rigs) {
    const r = ix.rig.get(id);
    if (!r || r[1] !== size) continue;
    for (const [act, k, filter] of r[3]) {
      if (act !== activity || !inFilter(ix, filter, product)) continue;
      out[k] = Math.min(out[k], 1 + (r[4][at[k]] * r[5][sec]) / 100);
    }
  }
  return out;
}

/**
 * What one job uses: max(runs, ceil(round(runs × qty × (1 − ME/100) × structure × rig, 2))) of each material, rounded per
 * job and not per run (Qoi, "Formulas for EVE Industry" v2.2, 2016; EVE University, "Research" and "Manufacturing"). The
 * round to two places keeps 3,995.000000001 at 3,995. A material needed once a run can't fall below the runs.
 */
export function materialsFor(mats: readonly [number, number][], runs: number, me: number, structure: number, rig: number): [number, number][] {
  const mod = (1 - me / 100) * structure * rig;
  return mats.map(([t, q]) => [t, Math.max(runs, Math.ceil(Math.round(runs * q * mod * 100) / 100))]);
}

/** A skill's level-scaled bonus as the bundle reads it from dogma: 1 + bonus/100 × level, or 1 when it carries another. */
function skillBonus(ix: Indexed, skill: number, attr: number, skills: Record<number, number>): number {
  const s = ix.b.skills[skill];
  return s && s[3] === attr ? 1 + (s[4] / 100) * Math.max(0, Math.min(5, skills[skill] ?? 0)) : 1;
}

/**
 * The skills' share of a manufacturing job's time: Industry (−4% a level), Advanced Industry (−3%), and each skill the
 * blueprint requires that carries dogma 1982 (−1% a level: the science and advanced construction skills a Tech II item
 * asks for). How EVE Ref's Tech II time comes out (4 h 8 min 12 s for the Large Trimark Armor Pump II at III and III).
 */
export function manufacturingSkills(ix: Indexed, required: readonly [number, number][], skills: Record<number, number>): number {
  let f = skillBonus(ix, SKILL.industry, 440, skills) * skillBonus(ix, SKILL.advancedIndustry, 1961, skills);
  for (const [id] of required) f *= skillBonus(ix, id, 1982, skills);
  return f;
}

/** A manufacturing run's time: base × (1 − TE/100) × the skills × structure × rig. */
export const jobTime = (base: number, te: number, skills: number, structure: number, rig: number): number =>
  base * (1 - te / 100) * skills * structure * rig;

/** A day's runs, the research's job length: as many as finish in a day, at least one; a copy's own runs cap it. */
export function runsPerDay(timePerRun: number, cap?: number | null): number {
  const n = Math.max(1, Math.floor(DAY_S / timePerRun));
  return cap != null && cap > 0 ? Math.min(n, cap) : n;
}

/** Copying: copy time × runs × copies × (1 − 5% × Science) × (1 − 3% × Advanced Industry) × structure × rig. TE doesn't touch it. */
export const copyTime = (ix: Indexed, base: number, runs: number, copies: number, skills: Record<number, number>, structure: number, rig: number): number =>
  base * runs * copies * skillBonus(ix, SKILL.science, 452, skills) * skillBonus(ix, SKILL.advancedIndustry, 1961, skills) * structure * rig;

/**
 * ME or TE research from one level to another (0 to 10; a TE level is 2%, so TE 20 is level 10): the blueprint's first-level
 * time (rank × 105 s already) × (LEVEL_MOD[to] − LEVEL_MOD[from]) ÷ 105 × (1 − 5% × Metallurgy) for ME or (1 − 5% × Research)
 * for TE × (1 − 3% × Advanced Industry) × structure × rig.
 */
export function researchTime(ix: Indexed, base: number, what: 'me' | 'te', from: number, to: number, skills: Record<number, number>, structure: number, rig: number): number {
  if (to <= from) return 0;
  const skill = what === 'me' ? skillBonus(ix, SKILL.metallurgy, 468, skills) : skillBonus(ix, SKILL.research, 453, skills);
  return (base * (LEVEL_MOD[to] - LEVEL_MOD[from])) / 105 * skill * skillBonus(ix, SKILL.advancedIndustry, 1961, skills) * structure * rig;
}

/** Invention's time an attempt: base × (1 − 3% × Advanced Industry) × structure × rig. No science skill shortens it (EVE Ref). */
export const inventionTime = (ix: Indexed, base: number, skills: Record<number, number>, structure: number, rig: number): number =>
  base * skillBonus(ix, SKILL.advancedIndustry, 1961, skills) * structure * rig;

/**
 * Invention's chance: base × (1 + (science 1 + science 2) / 30 + encryption / 40) × (1 + decryptor) (EVE University;
 * EVE Ref's 0.4335 for a base of 0.34 at III, III and III). Decryptors aren't modelled: 0.
 */
export const inventionChance = (base: number, science1: number, science2: number, encryption: number, decryptor = 0): number =>
  base * (1 + (science1 + science2) / 30 + encryption / 40) * (1 + decryptor);

export type Clone = 'alpha' | 'omega' | 'unknown';
/** Where a job is charged: the system's index for the activity, the structure's and the rigs' cost bonuses, the facility tax (null: not known), the clone. */
export type CostAt = { index: number; structure: number; rig: number; tax: number | null; clone: Clone };
export type JobCost = {
  base: number;
  /** The system's index × base, and what the structure's and rigs' cost bonuses take off that part only (≤ 0). */
  index: number; bonus: number;
  /** The facility tax; null when it isn't known (a structure whose owner's tax isn't typed or measured). */
  tax: number | null;
  scc: number;
  /** The Alpha clone tax: 0 for Omega, null when the clone state isn't known (left out, and said). */
  alpha: number | null;
  /** Everything known: a facility tax or Alpha tax not known is left out. */
  total: number;
};

/**
 * A job's cost: base × (index × structure × rig + facility tax + SCC + Alpha tax). The bonuses come off the index part
 * only, as EVE Ref's output splits them (`system_cost_bonuses`: −4% of `system_cost_index` in an Azbel).
 */
export function jobCostOf(base: number, c: CostAt, scc: number): JobCost {
  const index = base * c.index;
  const bonus = index * (c.structure * c.rig - 1);
  const tax = c.tax == null ? null : base * c.tax;
  const sccPart = base * scc;
  const alpha = c.clone === 'alpha' ? base * ALPHA_TAX : c.clone === 'omega' ? 0 : null;
  return { base, index, bonus, tax, scc: sccPart, alpha, total: index + bonus + (tax ?? 0) + sccPart + (alpha ?? 0) };
}

/** Manufacturing: on the estimated item value of the runs. */
export const manufacturingCost = (eivRun: number, runs: number, c: CostAt): JobCost => jobCostOf(eivRun * runs, c, SCC);
/** Copying: on 2% of the estimated item value of every run on every copy (the product's ME 0 manufacturing materials). */
export const copyCost = (eivRun: number, runs: number, copies: number, c: CostAt): JobCost => jobCostOf(COPY_BASE * eivRun * runs * copies, c, SCC_COPY);
/** ME or TE research: on 2% of the EIV × the level table's steps ÷ 105, without the blueprint's rank (EVE University's table). */
export const researchCost = (eivRun: number, from: number, to: number, c: CostAt): JobCost =>
  jobCostOf((RESEARCH_BASE * eivRun * (LEVEL_MOD[to] - LEVEL_MOD[from])) / 105, c, SCC_RESEARCH);
/** Invention: on 2% of the Tech II product's EIV (one run) for each attempt. */
export const inventionCost = (eivT2Run: number, attempts: number, c: CostAt): JobCost => jobCostOf(INVENTION_BASE * eivT2Run * attempts, c, SCC);

/** The estimated item value of one run: its ME 0 materials at CCP's adjusted prices; null when any of them has none. */
export function eivOf(mats: readonly [number, number][], adjusted: Record<number, number>): number | null {
  let v = 0;
  for (const [t, q] of mats) {
    const p = adjusted[t];
    if (p == null || !Number.isFinite(p)) return null;
    v += q * p;
  }
  return v;
}

/** Factory and science slots from skills: 1 + Mass Production + Advanced Mass Production, 1 + Laboratory Operation + Advanced Laboratory Operation, at most 11 each. */
export function slots(ix: Indexed, skills: Record<number, number>): { factory: number; science: number } {
  const add = (ids: number[], attr: number) => ids.reduce((n, id) => {
    const s = ix.b.skills[id];
    return n + (s && s[3] === attr ? s[4] * Math.max(0, Math.min(5, skills[id] ?? 0)) : 0);
  }, 1);
  return {
    factory: Math.min(MAX_SLOTS, add([SKILL.massProduction, SKILL.advancedMassProduction], 450)),
    science: Math.min(MAX_SLOTS, add([SKILL.labOp, SKILL.advancedLabOp], 471)),
  };
}

/** Skills an activity asks for that a character lacks, with the level it asks. */
export const lacking = (required: readonly [number, number][], skills: Record<number, number>): { id: number; level: number }[] =>
  required.filter(([id, lvl]) => (skills[id] ?? 0) < lvl).map(([id, level]) => ({ id, level }));

/** ESI's /industry/systems/ answer, per system. A system is kept only with all five indices. */
export type IndustryIndex = { manufacturing: number; copying: number; invention: number; researchMaterial: number; researchTime: number };
const INDEX_OF: Record<string, keyof IndustryIndex> = {
  manufacturing: 'manufacturing', copying: 'copying', invention: 'invention',
  researching_material_efficiency: 'researchMaterial', researching_time_efficiency: 'researchTime',
};
export function parseIndices(raw: readonly { solar_system_id: number; cost_indices: readonly { activity: string; cost_index: number }[] }[]): Record<number, IndustryIndex> {
  const out: Record<number, IndustryIndex> = {};
  for (const s of raw) {
    const x: Partial<IndustryIndex> = {};
    for (const c of s.cost_indices ?? []) {
      const k = INDEX_OF[c.activity];
      if (k && Number.isFinite(c.cost_index) && c.cost_index >= 0) x[k] = c.cost_index;
    }
    if (Object.keys(x).length === 5) out[s.solar_system_id] = x as IndustryIndex;
  }
  return out;
}

/** The index an activity is charged at. */
export const indexFor = (ix: IndustryIndex, a: Activity): number => ix[a];
```

- [ ] **Step 5: Run the test to see it pass, then plant each rule wrong**

Run: `npm run check 2>&1 | grep -B1 -A3 "Industry: the rules"`
Expected: no `FAIL` under it, and `all passed` at the end of the pure checks.

Plant each, run, see the named lines fail, undo:
- `materialsFor`: `return mats.map(([t, q]) => [t, Math.max(runs, runs * Math.ceil(q * mod))]);` (per run): "4,606 / 3,995 /
  3,108" and "rounded per job" fail.
- `jobCostOf`: `const bonus = (base * c.index + base * scc) * (c.structure * c.rig - 1);` (bonus off more than the index
  part): "17,213,916" and "the Azbel's 4% off the index part only" fail.
- `manufacturingSkills`: delete the `for (const [id] of required)` line: "14,892 s" fails.
- `inventionTime`: multiply in `skillBonus(ix, SKILL.science, 452, skills)`: "Science V or not" fails.
- `researchTime`: multiply by `(base / 105)` again (the rank twice): "2,448,000 s" fails.

- [ ] **Step 6: Add to the note**

Append to `docs/notes/industry.md`:

```markdown
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
```

- [ ] **Step 7: The checks**

Run: `npm run check && npm run build && npm run check-income`
Expected: all pass (no page changed: `check-pages` can wait for Task 4A, the first task with UI, but run it if in doubt).

- [ ] **Step 8: Commit**

```bash
git add src/lib/industry.ts scripts/fixtures/industry-everef.json scripts/check.mjs docs/notes/industry.md
git commit -m "$(cat <<'MSG'
Industry: the job, research, copying and invention rules, pinned on EVE Ref

What was missing: the Industry tab works every job out itself (spec 2026-10-10-industry-design.md); ESI's job record
says only what the game charged.

What it is: src/lib/industry.ts, pure, so the Worker can import it later. Materials rounded per job, a run's time with
each skill's bonus read from dogma (the science and construction skills' 1982 for Tech II), the job cost with the
structure's and rigs' bonuses off the index part only, ME/TE research on the level table from the blueprint's own
first-level time, copying, invention's chance and cost, slots, which rigs help a product at the site's size and
security, the indices parsed from ESI.

Evidence: every figure matches EVE Ref's industry API on the research's Large Trimark Armor Pump I and its Tech II
(scripts/fixtures/industry-everef.json): 4,606 / 3,995 / 3,108, 1,318.95 s, 17,213,916 ISK; copying 3,151,808 /
126,072 / 31,518; invention 0.4335 and 1,638,947.87; 19 / 14 / 1 / 22 and 14,892 s. The spec's 17,213,889 was a slip in
the research's write-up: its own inputs, at ESI's full-precision adjusted prices, give EVE Ref's figure. Rounding per run,
the bonus off the whole cost, no 1982 bonus, Science on invention and the rank counted twice each failed a check.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
MSG
)"
```

---
### Task 3: `industryRank.ts`, the finder's rules

**Files:**
- Create: `src/lib/industryRank.ts`
- Modify: `scripts/check.mjs` (a section "Industry: the finder's rules"), `docs/notes/industry.md`

**Interfaces:**
- Consumes: `src/lib/industry.ts` (Task 2): `indexBundle`, `productOf`, `structureBonus`, `rigFor`, `materialsFor`,
  `manufacturingSkills`, `jobTime`, `runsPerDay`, `eivOf`, `manufacturingCost`, `researchTime`, `researchCost`, `lacking`,
  `DAY_S` and its types. From the app: `listingPrice`, `reachedBid`, `recentRange` (fills.ts), `median`, `paceDay`
  (prospects.ts), `buyerShare`, `tradingSplit`, `EVEN_SPLIT`, `BookSold`, `SplitFrom` (split.ts).
- Produces (Tasks 5B, 6, 7 and 8 use these exact names):
  - Constants: `NEAR_JITA_JUMPS` 10, `HOME_DEPTH` 10, `DEFAULT_SHARE` 10, `LIVE_ROWS` 40, `ME_LEVELS`.
  - Types: `Freight` (`{ perM3; collateral; min: number | null }`), `Leg`
    (`{ kind: 'here' } | { kind: 'carry'; jumps } | { kind: 'route'; f: Freight; name } | { kind: 'none' }`), `JitaBook`
    (`{ ask; bid; bids; sold?; at; live }`), `HomeQuote` (`{ sell; buy; weekly; at }`), `Market`
    (`{ jita; stats; watched?; home?; homeHist? }`), `Source`, `SourceOption`, `MaterialPick`, `Sale`, `SlotDay`, `Missing`
    (`'noBook' | 'noIndex' | 'noAdjusted' | 'noMaterials' | 'noSale'`), `RowSite`, `RowInput`, `Row`, `ProductKind`,
    `MeLevel`, `LabSite`, `Held` (`{ units(type); cost(type, units) }`), `NpcRow`, `BpoWhere`.
  - Functions: `paceFromSpark(spark)`, `freightCost(f, m3, value)`, `freightPerUnit(f, volume, price, weekUnits)`,
    `legCost(leg, volume, price, weekUnits)`, `batchLeg(leg, lines)`, `shipToJita({ ship, noShipsToJita, band, jitaJumps })`,
    `sourceMaterial(o)`, `sellAt(place, market, o)`, `slotDay(makes, sale, costUnit, share)`, `buildRow(o): Row`,
    `productKind(ix, product)`, `finderBlueprints(ix)`, `rankBuilds(o, bps)`, `meLevels(o, lab)`,
    `startUp(row, { bpo, research, held })`, `shoppingList(row, held)`, `bpoWhere(rows, bp, basePrice)`,
    `payback(bpo, profitDay)`.

**The mined rule (a deviation the plan states, and the note records).** The spec lists mined among the "cheapest
delivered" sources at what it would sell for. A bid is always under an ask, so for any mineral that pick would always be
"mined", and every builder would be costed as a miner. Mined is picked only for a mineable material (the bundle's
`mineable`: minerals, ice products, moon materials) **and** a builder whose mining records show mining in the last 30 days
(`mines`, worked out by `useIndustryChars` in Task 4A from the Mining tab's own records). Otherwise it's listed in the
detail beside the pick, with why.

**Freight's minimum.** A week's materials go in one contract, so `batchLeg` spreads a route's minimum over the whole
batch; a product's week of sales goes in one contract, so `sellAt` spreads it over a week's sales at your share. Without
the first, each material paid the 5 M minimum alone and the research's row read 8,001 ISK a unit dearer.

- [ ] **Step 1: Write the failing test**

Add to `scripts/check.mjs`, after Task 2's section:

```js
console.log('\n--- Industry: the finder\'s rules (industryRank.ts) ---');
{
  // The research's worked row (.playwright-mcp/research/bpo/report.md, "Worked by hand"): the Large Trimark Armor Pump I at
  // ME 10 / TE 20 in an Azbel in null-sec, materials from Jita by Brave Freight (900 ISK a m³, 0.75% of a 105% collateral),
  // listed in Jita at 7,040,000 after 1.3% and 3.375%: 5,959,979 of materials and 264,829 of job a unit, 412,632 profit
  // a unit, and the slot (65 a day) binding under 81 a day of listings at a 10% share.
  const I = await import('../src/lib/industry.ts');
  const K = await import('../src/lib/industryRank.ts');
  const fsI = await import('node:fs');
  const fx = JSON.parse(fsI.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8'));
  const ix = I.indexBundle(JSON.parse(fsI.readFileSync(new URL('../src/data/industry.json', import.meta.url), 'utf8')));
  const near = (label, got, want, tol) => { if (!(got != null && Math.abs(got - want) <= tol)) { failed++; console.log(`  FAIL ${label}: got ${got}, want ${want} ± ${tol}`); } };
  const NOW3 = Date.parse('2026-10-09T15:00:00Z');
  const BRAVE = { perM3: 900, collateral: 0.0075 * 1.05, min: 5_000_000 };
  const route = { kind: 'route', f: BRAVE, name: 'Brave Freight' };

  eq('  pace from the scan\'s spark: the last 14 days\' median; their average when it\'s 0; nothing without a spark',
    [K.paceFromSpark([...Array(16).fill(5), ...Array(14).fill(841)]), K.paceFromSpark([...Array(23).fill(0), 7, 7, 0, 0, 7, 0, 0]), K.paceFromSpark(undefined)], [841, 1.5, null]);
  eq('  freight: a Large rig to Jita is 18,000 + 55,440 of collateral, 73,440 a unit in a week\'s batch', K.freightPerUnit(BRAVE, 20, 7_040_000, 455), 73_440);
  eq('    a small batch pays the 5 M minimum, spread over it', K.freightPerUnit(BRAVE, 5, 100_000, 10), 500_000);
  eq('    you carry it, or it\'s where it\'s sold: no ISK; no route set: not known', [K.legCost({ kind: 'carry', jumps: 4 }, 20, 1e6, 7), K.legCost({ kind: 'here' }, 20, 1e6, 7), K.legCost({ kind: 'none' }, 20, 1e6, 7)], [0, 0, null]);

  eq('  never haul ships to Jita: a ship built in null-sec, or 11 high-sec jumps out, stays home; 6 jumps out may go; a module always may; the switch off, anything may',
    [K.shipToJita({ ship: true, noShipsToJita: true, band: 'null', jitaJumps: null }), K.shipToJita({ ship: true, noShipsToJita: true, band: 'high', jitaJumps: 11 }),
      K.shipToJita({ ship: true, noShipsToJita: true, band: 'high', jitaJumps: 6 }), K.shipToJita({ ship: false, noShipsToJita: true, band: 'null', jitaJumps: null }),
      K.shipToJita({ ship: true, noShipsToJita: false, band: 'null', jitaJumps: null })], [false, false, true, true, true]);

  // Sourcing: the cheapest delivered, home only where deep enough, mined never free and only for a builder who mines.
  const gm = (sell, buy, weekly) => ({ sell, buy, weekly, at: '2026-10-09T14:00:00Z' });
  const src = (o) => K.sourceMaterial({ type: 34, weekNeed: 500, volume: 0.01, mineable: false, mines: false, jita: { ask: 100, bid: 95, patient: 96 }, jitaLeg: { kind: 'carry', jumps: 4 }, home: null, homeLeg: null, hubName: null, ...o });
  const plain = src({});
  eq('  Jita\'s best ask, carried: 100, with the patient bid beside it', [plain.pick, plain.price, plain.patient, plain.options[0].why], ['jita', 100, 96, 'Jita’s best ask; you carry it']);
  eq('    with a route and no minimum, plus freight (9 ISK a 0.01 m³ unit and 0.79% of its value)', src({ jitaLeg: { ...route, f: { ...BRAVE, min: null } } }).price, 100 + 9 + 0.007875 * 100);
  eq('    a material shipped alone pays the whole 5 M minimum over its week\'s 500 units', src({ jitaLeg: route }).price, 100 + 10_000);
  const batch = K.batchLeg(route, [{ volume: 0.01, price: 4213, units: 32_242 }, { volume: 0.01, price: 25_980, units: 27_965 }]);
  eq('  a week\'s materials in one contract: over the 5 M minimum, the route\'s own terms; a small batch, scaled up to it',
    [batch.f, K.batchLeg(route, [{ volume: 0.01, price: 100, units: 500 }]).f.perM3 > 900, K.batchLeg({ kind: 'carry', jumps: 2 }, [])], [{ perM3: 900, collateral: 0.007875, min: null }, true, { kind: 'carry', jumps: 2 }]);
  eq('    no route set: Jita can\'t be priced, and nothing is picked', [src({ jitaLeg: { kind: 'none' } }).pick, src({ jitaLeg: { kind: 'none' } }).options[0].why], [null, 'no freight route from Jita']);
  const home = { homeLeg: { kind: 'here' }, hubName: 'UALX-3' };
  eq('  the home hub when it moves ten times a week\'s need and is cheaper', [src({ ...home, home: gm(90, 80, 5000) }).pick, src({ ...home, home: gm(90, 80, 5000) }).price], ['home', 90]);
  const thin = src({ ...home, home: gm(90, 80, 4999) });
  eq('    under ten times: too thin, Jita picked, the reason said', [thin.pick, thin.options.find((x) => x.source === 'home').why], ['jita', 'too thin to buy a week’s need at UALX-3']);
  eq('    weekly movement not known (Goonmetrics\' −1): its depth can\'t be judged, never picked', src({ ...home, home: gm(90, 80, null) }).pick, 'jita');
  const notMiner = src({ mineable: true, ...home, home: gm(120, 80, 5000) });
  eq('  mined, for a builder who doesn\'t mine: listed at the home bid, never picked', [notMiner.pick, notMiner.options.find((x) => x.source === 'mined')], ['jita', { source: 'mined', price: 80, why: 'valued at what it would sell for; not counted, since you haven’t mined in 30 days', pickable: false }]);
  eq('    for one who does: picked at what it would sell for, never free', [src({ mineable: true, mines: true, ...home, home: gm(120, 80, 5000) }).pick, src({ mineable: true, mines: true, ...home, home: gm(120, 80, 5000) }).price], ['mined', 80]);
  eq('    no home bid: valued at Jita\'s; no bid anywhere: no price, not free', [src({ mineable: true, mines: true }).price, src({ mineable: true, mines: true, jita: { ask: 100, bid: null, patient: null } }).price], [95, 100]);
  eq('    a material no market lists and nobody mines: nothing picked', src({ jita: null }).pick, null);

  // Selling at home: the region's history decides the split, so a market that sells into bids paces below one that doesn't.
  const day = (i, avg) => ({ date: new Date(NOW3 - (i + 1) * 86400_000).toISOString().slice(0, 10), average: avg, highest: 110, lowest: 90, volume: 1000, order_count: 50 });
  const dumps = Array.from({ length: 30 }, (_, i) => day(i, 92)).reverse(), buys = Array.from({ length: 30 }, (_, i) => day(i, 108)).reverse();
  const at = (hist) => K.sellAt('home', { jita: null, stats: null, home: gm(105, 95, 7000), homeHist: hist }, { broker: null, tax: 0.03375, leg: { kind: 'here' }, volume: 1, makes: 50, share: 10, now: NOW3, hubName: 'UALX-3' });
  eq('  at home, a market that sells into bids paces below one where buyers take listings (history\'s split, 1,000 a day)',
    [at(dumps).listPace, at(buys).listPace, at(dumps).paceFrom], [100, 900, 'history']);
  eq('    before its history is read: Goonmetrics\' weekly movement ÷ 7, at an even split, said', [at(null).pace, at(null).split, at(null).paceFrom], [1000, 0.5, 'goonmetrics']);
  eq('    the hub\'s broker fee not known: the net leaves it out and says so', [at(null).brokerKnown, at(null).listNet], [false, 104.9 * (1 - 0.03375)]);
  eq('  no Jita book this morning: said, never a 0', K.sellAt('jita', { jita: null, stats: null }, { broker: 0.013, tax: 0.03375, leg: { kind: 'carry', jumps: 3 }, volume: 1, makes: 1, share: 10, now: NOW3 }).why, 'No Jita book this morning');
  eq('  a book but no history to pace it: said, never a pace of 0', K.sellAt('jita', { jita: { ask: 10, bid: 9, bids: [], at: '', live: true }, stats: null }, { broker: 0.013, tax: 0.03375, leg: { kind: 'carry', jumps: 3 }, volume: 1, makes: 1, share: 10, now: NOW3 }).why, 'No history this morning to say how fast it sells');

  // One slot's day.
  const sale = (o) => ({ place: 'jita', list: 100, listNet: 95, bid: 90, bidNet: 87, pace: 1000, listPace: 600, bidPace: 400, split: 0.6, splitFrom: 'book', paceFrom: 'scan', freight: 0, brokerKnown: true, why: null, ...o });
  eq('  the slot binds: listings take all 50 it makes', K.slotDay(50, sale({}), 80, 10), { list: 50, bids: 0, units: 50, profit: 750, limit: 'slot' });
  eq('  the market binds: 60 to listings, then 40 into bids where that pays too, of 200 made', K.slotDay(200, sale({}), 80, 10), { list: 60, bids: 40, units: 100, profit: 60 * 15 + 40 * 7, limit: 'market' });
  eq('    bids that lose aren\'t sold into', K.slotDay(200, sale({ bidNet: 70 }), 80, 10), { list: 60, bids: 0, units: 60, profit: 900, limit: 'market' });
  eq('    a listing that loses is still shown, as a loss, when it\'s the better side', K.slotDay(50, sale({ listNet: 75, bidNet: 70 }), 80, 10).profit, -250);

  // The research's row.
  const ASK = { 25601: 4213, 25605: 25_980, 25590: 84_000 };
  const spark = [...Array(16).fill(800), ...Array(14).fill(841)];
  const highs14 = [7_100_000, 7_050_000, 7_045_000, 7_041_000, 6_900_000, 6_950_000, 6_990_000, 7_000_000, 7_010_000, 6_980_000, 6_970_000, 6_960_000, 6_950_000, 6_940_000];
  const sold = { sell: 1690, buy: 62, single: { sell: 0, buy: 0 }, orders: { sell: 20, buy: 5 } };
  const market = (t) => t === 25894 ? { jita: { ask: 7_041_000, bid: 6_240_000, bids: [{ price: 6_240_000, volume: 100 }], sold, at: '', live: false }, stats: { spark, highs14, buyerShare: 0.5 } }
    : ASK[t] ? { jita: { ask: ASK[t], bid: ASK[t] * 0.9, bids: [], at: '', live: false }, stats: null } : { jita: null, stats: null };
  const idx = I.parseIndices(fx.systems);
  const base = {
    ix, bp: ix.bp.get(25895), me: 10, te: 20, skills: { 3380: 4, 3388: 2 }, clone: 'omega',
    site: { kind: 'azbel', rigs: [37170], band: 'null', tax: 0.01, index: { ...idx[30004807], manufacturing: 0.0617 } },
    adjusted: fx.adjusted, market, sell: 'jita', share: 10, fees: { broker: 0.013, tax: 0.03375, hubBroker: null },
    legs: { jita: route, home: null }, noShipsToJita: true, jitaJumps: null, mines: false, hubName: null, now: NOW3,
  };
  const row = K.buildRow(base);
  eq('  the worked row: 65 runs, 65 made a day, materials 4,606 / 3,995 / 3,108, sold in Jita at 7,040,000', [row.runs, row.makes, row.materials.map((m) => m.qty), row.sale?.list], [65, 65, [4606, 3995, 3108], 7_040_000]);
  near('    materials 5,959,979 a unit, as the research worked them', row.materialCost / 65, 5_959_979, 1);
  near('    the job 264,830 a unit (EVE Ref\'s 17,213,916 ÷ 65)', row.job.total / 65, 264_829.5, 1);
  near('    the sale nets 6,637,440 after fees and 73,440 of freight', row.sale.listNet, 6_637_440, 0.5);
  near('    412,632 profit a unit', row.sale.listNet - row.costUnit, 412_632, 1);
  eq('    the slot binds (81 a day of buyers at 10% is more than 65), 26.8 M a day', [row.day.limit, row.day.list, Math.round(row.day.profit)], ['slot', 65, Math.round(65 * (row.sale.listNet - row.costUnit))]);
  eq('    nothing missing, and the skills it asks for are trained', [row.missing, row.lacking], [null, [{ id: 26253, level: 1 }]]);
  // A site whose facility tax isn't typed: ranked before it, with what each 1% costs a day.
  const untaxed = K.buildRow({ ...base, site: { ...base.site, tax: null } });
  near('  a tax not typed: ranked before it, profit a day higher by exactly the tax', untaxed.day.profit - row.day.profit, row.job.tax, 0.01);
  near('    and each 1% of it costs 1,575,904 a day', untaxed.taxPerPct, 1_575_904.13, 0.5);
  eq('    a known tax has no "each 1%" line', row.taxPerPct, null);
  eq('  no index for the site\'s system: said, the job not costed', [K.buildRow({ ...base, site: { ...base.site, index: null } }).missing, K.buildRow({ ...base, site: { ...base.site, index: null } }).job], ['noIndex', null]);
  eq('  adjusted prices not read yet: said', K.buildRow({ ...base, adjusted: null }).missing, 'noAdjusted');
  eq('  no Jita book this morning for the product: said', K.buildRow({ ...base, market: (t) => (t === 25894 ? { jita: null, stats: null } : market(t)) }).missing, 'noBook');
  // Selling at home with the hub's broker fee not typed: before it, with each 1%'s cost a day.
  const homeRow = K.buildRow({ ...base, sell: 'home', hubName: 'UALX-3', legs: { jita: route, home: { kind: 'here' } },
    market: (t) => (t === 25894 ? { ...market(t), home: gm(7_500_000, 7_000_000, 7 * 841), homeHist: null } : market(t)) });
  eq('  at home with no broker fee typed: before it, and each 1% costs a day\'s listings × price × 1%', [homeRow.sale?.place, homeRow.sale?.brokerKnown, Math.round(homeRow.brokerPerPct)], ['home', false, Math.round(homeRow.day.list * homeRow.sale.list * 0.01)]);
  // A ship at a null-sec site, Jita only, the switch on: kept home, nowhere to sell, said.
  const caracal = K.buildRow({ ...base, bp: ix.byProduct.get(621), me: 0, te: 0, site: { ...base.site, rigs: [] }, market: () => ({ jita: { ask: 10e6, bid: 9e6, bids: [], at: '', live: false }, stats: { spark, buyerShare: 0.5 } }) });
  eq('  a ship from a null-sec site with "never haul ships to Jita" on: kept home, not sold in Jita', [caracal.shipsKeptHome, caracal.sales.length, caracal.missing], [true, 0, 'noSale']);

  eq('  where the original is sold: in The Forge, the partial read\'s newer sellers on top; else NPCs don\'t sell it there (after a complete read), or no seller found (a partial one), or not read',
    [K.bpoWhere({ complete: { at: 'a', complete: true, pagesFailed: 0, sellers: { 25895: [1_250_000, [60001]] } }, partial: { at: 'b', complete: false, pagesFailed: 3, sellers: { 25895: [1_200_000, [60002]] } } }, 25895, 1_250_000),
      K.bpoWhere({ complete: { at: 'a', complete: true, pagesFailed: 0, sellers: {} }, partial: null }, 25895, 1_250_000),
      K.bpoWhere({ complete: null, partial: { at: 'b', complete: false, pagesFailed: 4, sellers: {} } }, 25895, 1_250_000),
      K.bpoWhere(null, 25895, 1_250_000), K.bpoWhere({ complete: { at: 'a', complete: true, pagesFailed: 0, sellers: {} }, partial: null }, 25895, 0).base],
    [{ state: 'forge', price: 1_200_000, stations: [60002] }, { state: 'notForge', base: 1_250_000, at: 'a' }, { state: 'unknown', base: 1_250_000, missed: 4 }, { state: 'unread' }, null]);
  eq('  payback: the original ÷ profit a day; none without a price or a profit', [K.payback(1_250_000, 250_000), K.payback(null, 1), K.payback(1, -5)], [5, null, null]);

  // ME levels: research days at the builder's skills in a station with a Laboratory (no rigs, 0.25% tax, Perimeter's indices).
  const lab = { kind: 'npc', rigs: [], band: 'high', tax: I.NPC_FACILITY_TAX, index: idx[30000144] };
  const lv = K.meLevels({ ...base, skills: { 3380: 4, 3388: 5, 3409: 5, 3403: 5 } }, lab);
  eq('  ME levels: 0/0, 6/0, 8/0, 10/0, 10/20', lv.map((x) => [x.me, x.te]), [[0, 0], [6, 0], [8, 0], [10, 0], [10, 20]]);
  eq('    profit grows with research; 0/0 costs nothing to research', [lv[0].profit < lv[3].profit, lv[3].profit < lv[4].profit, lv[0].days, lv[0].cost], [true, true, 0, 0]);
  near('    ME 10 takes 28.3 days at Metallurgy V and Advanced Industry V; 10/20 twice that in one lab slot', lv[3].days, 28.333, 0.001);
  near('      10/20', lv[4].days, 56.667, 0.001);

  // Start-up and the shopping list: held materials count here, never in the profit a day.
  const held = { units: (t) => (t === 25601 ? 1000 : 0), cost: (t, n) => (t === 25601 ? n * 4000 : null) };
  const su = K.startUp(row, { bpo: 1_250_000, research: 11_231_059, held });
  near('  start-up: the original, research, and a day\'s materials less the 1,000 held', su.materials, row.materialCost - 1000 * row.materials[0].price, 0.01);
  eq('    with what those 1,000 cost you, and the total', [su.heldUnits, su.heldCost, Math.round(su.total)], [1000, 4_000_000, Math.round(1_250_000 + 11_231_059 + su.materials)]);
  eq('  the shopping list buys what isn\'t held', K.shoppingList(row, held).map((x) => [x.type, x.qty, x.source]), [[25601, 3606, 'jita'], [25605, 3995, 'jita'], [25590, 3108, 'jita']]);
  eq('  the profit a day is the same with or without the held materials', K.buildRow(base).day.profit, row.day.profit);

  eq('  kinds: a large armor rig, a cruiser, a frigate, a fuel block, a carrier (left out of the finder)',
    [25894, 621, 587, 4051, 23757].map((t) => K.productKind(ix, t)), ['rigs', 'hulls-medium', 'hulls-small', 'fuel', 'capital']);
  eq('  the finder\'s blueprints: Tech I, no invention product, no capital hull', [K.finderBlueprints(ix).length, K.finderBlueprints(ix).some((b) => ix.t2.has(b[0]))], [1652, false]);
  eq('  the named constants the copy states', [K.NEAR_JITA_JUMPS, K.HOME_DEPTH, K.DEFAULT_SHARE, K.LIVE_ROWS], [10, 10, 10, 40]);
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run check 2>&1 | grep -A3 "the finder's rules"`
Expected: `ERR_MODULE_NOT_FOUND … src/lib/industryRank.ts`.

- [ ] **Step 3: Write `src/lib/industryRank.ts`**

```ts
import { listingPrice, reachedBid, recentRange } from './fills';
import { median, paceDay } from './prospects';
import { buyerShare, EVEN_SPLIT, tradingSplit, type BookSold, type SplitFrom } from './split';
import type { BookLevel, HistRow, ProspectStats } from './types';
import {
  DAY_S, eivOf, jobTime, lacking, manufacturingCost, manufacturingSkills, materialsFor, productOf, researchCost, researchTime,
  rigFor, runsPerDay, structureBonus, type BpActivity, type BundleBp, type Clone, type Indexed, type IndustryIndex,
  type JobCost, type SecBand, type SiteKind,
} from './industry';

/**
 * The Industry finder's rules (docs/notes/industry.md): where each material comes from, what a product fetches where you'd
 * sell it, what freight costs, what one factory slot earns a day, and what each blueprint row comes to. Pure: no config,
 * store, React or DOM, so check.mjs loads it. Every figure not known stays null and says why; nothing is ever priced at 0
 * for not known.
 */

/** A site within this many high-sec jumps of Jita can carry to and from it, and sell ships there. */
export const NEAR_JITA_JUMPS = 10;
/** The home hub's market must move this many times a week's need before a material is bought there (the research's rule). */
export const HOME_DEPTH = 10;
/** The industry share by default: the part of each market's daily trade you'd sell, in percent (the research's figure for modules). */
export const DEFAULT_SHARE = 10;
/** Rows re-read on live Jita books after the first ranking on the morning's scan (the Loyalty pattern). */
export const LIVE_ROWS = 40;
/** Capital hulls sell on contracts, not the market: the finder leaves them out. Titans and supercarriers sit outside the static data's capital filter. */
const CAPITAL_GROUPS = new Set([30, 659]);

/** Units a typical day from the scan's 30 days (zeros on days nothing traded): paceDay's rule, the last 14 days' median, or their average when the median is 0. */
export function paceFromSpark(spark: readonly number[] | null | undefined): number | null {
  if (!spark?.length) return null;
  const last = spark.slice(-14);
  const m = median([...last]);
  return m > 0 ? m : last.reduce((s, v) => s + v, 0) / 14;
}

/** A freight route's terms: ISK a m³ of packaged volume, a share of the goods' value for collateral, a minimum a contract (null: none stated). */
export type Freight = { perM3: number; collateral: number; min: number | null };
/** One contract: the minimum, or ISK a m³ × m³ + the collateral share × value, whichever is more. */
export const freightCost = (f: Freight, m3: number, value: number): number => Math.max(f.min ?? 0, f.perM3 * m3 + f.collateral * value);
/** A unit's share of a week's batch in one contract, so the minimum is spread over the batch. */
export const freightPerUnit = (f: Freight, volume: number, price: number, weekUnits: number): number => {
  const n = Math.max(1, weekUnits);
  return freightCost(f, volume * n, price * n) / n;
};

/**
 * How goods get between a site and a market: `here` (the site is the market's own system), `carry` (high-sec within
 * NEAR_JITA_JUMPS of Jita with no rate typed: you carry it, no ISK), `route` (a freight route picked), `none` (no way set).
 */
export type Leg = { kind: 'here' } | { kind: 'carry'; jumps: number } | { kind: 'route'; f: Freight; name: string } | { kind: 'none' };
/** What a leg costs a unit, or null when there's no way set. */
export const legCost = (l: Leg, volume: number, price: number, weekUnits: number): number | null =>
  l.kind === 'here' || l.kind === 'carry' ? 0 : l.kind === 'route' ? freightPerUnit(l.f, volume, price, weekUnits) : null;

/**
 * A week's materials travel in one contract, so a route's minimum is spread over the whole batch, not charged on each
 * material: the route's terms scaled up by minimum ÷ the batch's own cost when that's more than 1, with no minimum left.
 * Any other leg is as it was.
 */
export function batchLeg(leg: Leg, lines: readonly { volume: number; price: number; units: number }[]): Leg {
  if (leg.kind !== 'route') return leg;
  const raw = lines.reduce((s, x) => s + x.units * (leg.f.perM3 * x.volume + leg.f.collateral * x.price), 0);
  const scale = raw > 0 ? Math.max(1, (leg.f.min ?? 0) / raw) : 1;
  return { kind: 'route', name: leg.name, f: { perM3: leg.f.perM3 * scale, collateral: leg.f.collateral * scale, min: null } };
}

/**
 * Whether a product may be sold in Jita from a site: anything may, except a ship while "never haul ships to Jita" is on
 * and the site is outside high-sec or more than NEAR_JITA_JUMPS high-sec jumps from Jita (the user: "too bulky expensive
 * and risky").
 */
export function shipToJita(o: { ship: boolean; noShipsToJita: boolean; band: SecBand; jitaJumps: number | null }): boolean {
  if (!o.ship || !o.noShipsToJita) return true;
  return o.band === 'high' && o.jitaJumps != null && o.jitaJumps <= NEAR_JITA_JUMPS;
}

/** A Jita book as the finder reads it: everyone else's orders, the morning's or a live read. */
export type JitaBook = { ask: number | null; bid: number | null; bids: BookLevel[]; sold?: BookSold; at: string; live: boolean };
/** A home hub's prices as Goonmetrics gives them (Task 6): best sell and buy, weekly movement; null where not known. */
export type HomeQuote = { sell: number | null; buy: number | null; weekly: number | null; at: string };
/** What the finder knows of one item's markets. */
export type Market = {
  jita: JitaBook | null;
  stats: ProspectStats | null;
  watched?: { sell: number; buy: number; h: number } | null;
  home?: HomeQuote | null;
  /** The home region's daily history (Tenerifis, Insmother), once read; until then home pace is Goonmetrics' weekly movement ÷ 7. */
  homeHist?: HistRow[] | null;
};

export type Source = 'jita' | 'home' | 'mined';
export type SourceOption = { source: Source; price: number | null; why: string; pickable: boolean };
export type MaterialPick = { type: number; qty: number; pick: Source | null; price: number | null; options: SourceOption[]; patient: number | null };

/**
 * Where one material comes from for the steady profit a day: the cheapest delivered of Jita's best ask plus freight in, the
 * home hub's best sell (only where it moves HOME_DEPTH times the week's need), and mining it, valued at what it would sell
 * for (the home bid, else Jita's), never free. Mined is picked only for a mineable material and a builder who mines (its
 * mining records in the last 30 days): a bid is always under an ask, so without that it would win every mineral and read
 * as if every builder mined. Jita's patient price (a bid where trading reaches) is said beside it, never picked.
 */
export function sourceMaterial(o: {
  type: number; weekNeed: number; volume: number; mineable: boolean; mines: boolean;
  jita: { ask: number | null; bid: number | null; patient: number | null } | null;
  jitaLeg: Leg;
  home: HomeQuote | null; homeLeg: Leg | null; hubName: string | null;
}): Omit<MaterialPick, 'qty'> {
  const options: SourceOption[] = [];
  const ask = o.jita?.ask ?? null;
  if (ask == null) options.push({ source: 'jita', price: null, why: 'none listed in Jita', pickable: false });
  else {
    const f = legCost(o.jitaLeg, o.volume, ask, o.weekNeed);
    options.push(f == null ? { source: 'jita', price: null, why: 'no freight route from Jita', pickable: false }
      : { source: 'jita', price: ask + f, why: o.jitaLeg.kind === 'route' ? 'Jita’s best ask, plus freight' : o.jitaLeg.kind === 'carry' ? 'Jita’s best ask; you carry it' : 'Jita’s best ask', pickable: true });
  }
  if (o.home && o.homeLeg && o.hubName) {
    const at = o.hubName, sell = o.home.sell, weekly = o.home.weekly;
    const f = sell != null ? legCost(o.homeLeg, o.volume, sell, o.weekNeed) : null;
    options.push(sell == null ? { source: 'home', price: null, why: `none listed at ${at}`, pickable: false }
      : weekly == null ? { source: 'home', price: sell, why: `${at}’s weekly movement isn’t known, so its depth can’t be judged`, pickable: false }
        : weekly < HOME_DEPTH * o.weekNeed ? { source: 'home', price: sell, why: `too thin to buy a week’s need at ${at}`, pickable: false }
          : f == null ? { source: 'home', price: null, why: `no freight route from ${at}`, pickable: false }
            : { source: 'home', price: sell + f, why: `${at}’s best sell`, pickable: true });
  }
  if (o.mineable) {
    const value = o.home?.buy ?? o.jita?.bid ?? null;
    options.push(value == null ? { source: 'mined', price: null, why: 'no bid to value it at', pickable: false }
      : { source: 'mined', price: value, why: o.mines ? 'you mine: valued at what it would sell for' : 'valued at what it would sell for; not counted, since you haven’t mined in 30 days', pickable: o.mines });
  }
  let best: SourceOption | null = null;
  for (const x of options) if (x.pickable && x.price != null && (!best || x.price < best.price!)) best = x;
  return { type: o.type, pick: best?.source ?? null, price: best?.price ?? null, options, patient: o.jita?.patient ?? null };
}

/** A sale at one place, per unit after fees and freight out, with each side's pace. */
export type Sale = {
  place: 'jita' | 'home';
  /** The price to list at, and what a unit nets after the broker fee (left out when not known), sales tax and freight. */
  list: number | null; listNet: number | null;
  /** The best bid of others, and what a unit nets sold into it after sales tax and freight. */
  bid: number | null; bidNet: number | null;
  /** Units a typical day, and how much of it is buyers taking listings (share) and sellers selling into bids. */
  pace: number | null; listPace: number | null; bidPace: number | null;
  split: number; splitFrom: SplitFrom | 'goonmetrics';
  paceFrom: 'scan' | 'history' | 'goonmetrics' | null;
  freight: number | null; brokerKnown: boolean;
  /** Why it can't be sold there; null when it can. */
  why: string | null;
};

/**
 * What a product fetches at one place. Jita: `listingPrice` on others' book with this morning's highs, after your broker
 * fee and sales tax, less freight from the site; into the best bid after tax. Pace: the scan's typical day × the split
 * `tradingSplit` reads (the book's sold counts, history's guess, or even). A home hub: Goonmetrics' best sell less a tick,
 * checked against the home region's 14 days of highs once its history is read, after your sales tax and the hub's broker
 * fee (left out until typed or measured: ranked before it); its pace the home region's typical day × history's split, or,
 * until that history is read, Goonmetrics' weekly movement ÷ 7 at an even split. Freight's minimum is spread over a week's
 * sales at your share.
 */
export function sellAt(place: 'jita' | 'home', m: Market, o: { broker: number | null; tax: number; leg: Leg | null; volume: number; makes: number; share: number; now: number; hubName?: string | null }): Sale {
  const base: Sale = { place, list: null, listNet: null, bid: null, bidNet: null, pace: null, listPace: null, bidPace: null, split: EVEN_SPLIT, splitFrom: 'even', paceFrom: null, freight: null, brokerKnown: o.broker != null, why: null };
  let list: number | null, bid: number | null, pace: number | null, split: number, splitFrom: Sale['splitFrom'], paceFrom: Sale['paceFrom'];
  if (place === 'jita') {
    if (!m.jita) return { ...base, why: 'No Jita book this morning' };
    list = listingPrice(m.jita.ask, m.jita.bid, m.stats?.highs14);
    bid = m.jita.bid;
    pace = paceFromSpark(m.stats?.spark);
    const s = tradingSplit({ history: m.stats?.buyerShare ?? null, book: m.jita.sold ?? null, watched: m.watched ?? null, typicalDay: pace });
    split = s.share; splitFrom = s.from; paceFrom = pace != null ? 'scan' : null;
  } else {
    const h = m.home;
    if (!h) return { ...base, why: `Not read at ${o.hubName ?? 'home'} yet` };
    const hist = m.homeHist && m.homeHist.length ? m.homeHist : null;
    list = listingPrice(h.sell, h.buy, hist ? recentRange(hist, 14, o.now).highs : null);
    bid = h.buy;
    if (hist) {
      pace = paceDay(hist, o.now);
      const s = tradingSplit({ history: buyerShare(hist.slice(-30)) });
      split = s.share; splitFrom = s.from; paceFrom = 'history';
    } else {
      pace = h.weekly != null ? h.weekly / 7 : null;
      split = EVEN_SPLIT; splitFrom = 'goonmetrics'; paceFrom = pace != null ? 'goonmetrics' : null;
    }
  }
  // A pace not known is never a pace of 0: the row says so, and isn't ranked on a guess.
  if (pace == null) return { ...base, list, bid, split, splitFrom, why: place === 'jita' ? 'No history this morning to say how fast it sells' : `Nothing says how fast it sells at ${o.hubName ?? 'home'}` };
  if (o.leg == null || o.leg.kind === 'none') return { ...base, list, bid, pace, split, splitFrom, paceFrom, why: place === 'jita' ? 'no freight route to Jita' : `no freight route to ${o.hubName ?? 'home'}` };
  const cap = pace != null ? (pace * o.share) / 100 : 0;
  const week = 7 * Math.min(o.makes, cap > 0 ? cap : o.makes);
  const ref = list ?? bid;
  const freight = ref != null ? legCost(o.leg, o.volume, ref, week) : null;
  const fee = o.broker ?? 0;
  return {
    ...base, list, bid, pace, split, splitFrom, paceFrom, freight,
    listNet: list != null && freight != null ? list * (1 - fee - o.tax) - freight : null,
    bidNet: bid != null && freight != null ? bid * (1 - o.tax) - freight : null,
    listPace: pace != null ? pace * split : null,
    bidPace: pace != null ? pace * (1 - split) : null,
    why: list == null && bid == null ? (place === 'jita' ? 'none listed or bid in Jita' : `none listed at ${o.hubName ?? 'home'}`) : null,
  };
}

/** One factory slot's day: units onto listings and into bids, what they make, and whether the market or the slot limits it. */
export type SlotDay = { list: number; bids: number; units: number; profit: number; limit: 'market' | 'slot' };

/**
 * What one slot earns a day selling at one place: the better-paying side first, up to your share of its pace, then the
 * other side only where it pays, both together no more than the slot makes. A side that loses is still sold when it's the
 * better one: the row shows the loss rather than hiding it. Null when neither side has a price.
 */
export function slotDay(makes: number, sale: Sale, costUnit: number, share: number): SlotDay | null {
  const capOf = (pace: number | null) => (pace != null && pace > 0 ? (pace * share) / 100 : 0);
  const sides = ([
    { side: 'list', profit: sale.listNet == null ? null : sale.listNet - costUnit, cap: capOf(sale.listPace) },
    { side: 'bids', profit: sale.bidNet == null ? null : sale.bidNet - costUnit, cap: capOf(sale.bidPace) },
  ] as const).filter((s): s is typeof s & { profit: number } => s.profit != null).sort((a, b) => b.profit - a.profit);
  if (!sides.length) return null;
  let left = makes, profit = 0;
  const n = { list: 0, bids: 0 };
  sides.forEach((s, i) => {
    if (i > 0 && !(s.profit > 0)) return;
    const take = Math.min(left, s.cap);
    n[s.side] = take; left -= take; profit += take * s.profit;
  });
  const units = n.list + n.bids;
  return { list: n.list, bids: n.bids, units, profit, limit: units >= makes - 1e-9 ? 'slot' : 'market' };
}

/** Why a row isn't priced: no Jita book this morning; indices, adjusted prices or a material's price not known; nowhere it may be sold. */
export type Missing = 'noBook' | 'noIndex' | 'noAdjusted' | 'noMaterials' | 'noSale';

export type RowSite = { kind: SiteKind; rigs: readonly number[]; band: SecBand; tax: number | null; index: IndustryIndex | null };
export type RowInput = {
  ix: Indexed; bp: BundleBp;
  me: number; te: number; copyRuns?: number | null;
  skills: Record<number, number>; clone: Clone;
  site: RowSite;
  adjusted: Record<number, number> | null;
  market: (type: number) => Market;
  sell: 'jita' | 'home' | 'best';
  share: number;
  fees: { broker: number; tax: number; hubBroker: number | null };
  /** site ↔ Jita and site ↔ the home hub (null: no hub picked). */
  legs: { jita: Leg; home: Leg | null };
  noShipsToJita: boolean; jitaJumps: number | null;
  mines: boolean; hubName: string | null;
  now: number;
};

export type Row = {
  bp: number; product: number; perRun: number; ship: boolean;
  time: number; runs: number; makes: number;
  materials: MaterialPick[]; materialCost: number | null;
  eiv: number | null; job: JobCost | null;
  costUnit: number | null;
  sales: Sale[]; sale: Sale | null; day: SlotDay | null;
  /** When the facility tax isn't known: what each 1% of it would cost a day. */
  taxPerPct: number | null;
  /** When selling at a hub whose broker fee isn't known: what each 1% of it would cost a day. */
  brokerPerPct: number | null;
  lacking: { id: number; level: number }[];
  missing: Missing | null;
  /** Ships the switch keeps out of Jita from this site. */
  shipsKeptHome: boolean;
};

/** One blueprint built at a site and sold where the choices say: a day's job, its materials, its cost, its sale, one slot's day. */
export function buildRow(o: RowInput): Row {
  const { ix, bp } = o;
  const m = bp[2] as BpActivity;
  const prod = productOf(bp)!;
  const t = ix.b.types[prod.type];
  const ship = t?.[2] === 6;
  const sb = structureBonus(ix, o.site.kind);
  const rig = rigFor(ix, o.site.rigs, o.site.kind, o.site.band, prod.type, 'manufacturing');
  const time = jobTime(m[0], o.te, manufacturingSkills(ix, m[2], o.skills), sb.time, rig.time);
  const runs = runsPerDay(time, o.copyRuns);
  const days = Math.max(1, (runs * time) / DAY_S);
  const made = runs * prod.perRun;
  const makes = made / days;
  const need = materialsFor(m[1], runs, o.me, sb.material, rig.material);
  const week = (qty: number) => (qty * 7) / days;
  const lines = (price: (mk: Market) => number | null | undefined) => need.map(([type, qty]) => ({ volume: ix.b.types[type]?.[3] ?? 0, price: price(o.market(type)) ?? 0, units: week(qty) }));
  const jitaLeg = batchLeg(o.legs.jita, lines((mk) => mk.jita?.ask));
  const homeLeg = o.legs.home ? batchLeg(o.legs.home, lines((mk) => mk.home?.sell)) : null;
  const materials: MaterialPick[] = need.map(([type, qty]) => {
    const mk = o.market(type), mt = ix.b.types[type];
    const pick = sourceMaterial({
      type, weekNeed: week(qty), volume: mt?.[3] ?? 0, mineable: mt?.[5] === 1, mines: o.mines,
      jita: mk.jita ? { ask: mk.jita.ask, bid: mk.jita.bid, patient: mk.stats?.lows14 ? reachedBid(mk.stats.lows14) : null } : null,
      jitaLeg, home: mk.home ?? null, homeLeg, hubName: o.hubName,
    });
    return { ...pick, qty };
  });
  const materialCost = materials.every((x) => x.price != null) ? materials.reduce((s, x) => s + x.qty * x.price!, 0) : null;
  const eiv = o.adjusted ? eivOf(m[1], o.adjusted) : null;
  const job = eiv != null && o.site.index ? manufacturingCost(eiv, runs, { index: o.site.index.manufacturing, structure: sb.cost, rig: rig.cost, tax: o.site.tax, clone: o.clone }) : null;
  const costUnit = materialCost != null && job ? (materialCost + job.total) / made : null;

  const pm = o.market(prod.type);
  const jitaOk = shipToJita({ ship, noShipsToJita: o.noShipsToJita, band: o.site.band, jitaJumps: o.jitaJumps });
  const places: ('jita' | 'home')[] = o.sell === 'jita' ? ['jita'] : o.sell === 'home' ? ['home'] : ['jita', 'home'];
  const sales = places.filter((p) => (p === 'jita' ? jitaOk : o.legs.home != null)).map((p) => sellAt(p, pm, {
    broker: p === 'jita' ? o.fees.broker : o.fees.hubBroker, tax: o.fees.tax, leg: p === 'jita' ? o.legs.jita : o.legs.home,
    volume: t?.[3] ?? 0, makes, share: o.share, now: o.now, hubName: o.hubName,
  }));
  let sale: Sale | null = null, day: SlotDay | null = null;
  if (costUnit != null) for (const s of sales) {
    const d = s.why ? null : slotDay(makes, s, costUnit, o.share);
    if (d && (!day || d.profit > day.profit)) { sale = s; day = d; }
  }
  const missing: Missing | null = !pm.jita && !pm.home ? 'noBook' : !o.site.index ? 'noIndex' : eiv == null ? 'noAdjusted'
    : materialCost == null ? 'noMaterials' : !day ? 'noSale' : null;
  return {
    bp: bp[0], product: prod.type, perRun: prod.perRun, ship, time, runs, makes, materials, materialCost, eiv, job, costUnit, sales, sale, day,
    taxPerPct: job && o.site.tax == null ? (job.base * 0.01) / days : null,
    brokerPerPct: day && sale?.place === 'home' && !sale.brokerKnown && sale.list != null ? day.list * sale.list * 0.01 : null,
    lacking: lacking(m[2], o.skills), missing,
    shipsKeptHome: ship && !jitaOk && o.sell !== 'home',
  };
}

/** The finder's kinds, from a product's category, group and the static data's filters. */
export type ProductKind = 'rigs' | 'modules' | 'charges' | 'drones' | 'deployables' | 'hulls-small' | 'hulls-medium' | 'hulls-large' | 'hulls-other'
  | 'fuel' | 'structures' | 'components' | 'capital-parts' | 'capital' | 'other';
export function productKind(ix: Indexed, product: number): ProductKind {
  const t = ix.b.types[product];
  if (!t) return 'other';
  const [, group, cat] = t;
  const inF = (f: number) => { const x = ix.b.filters[f]; return !!x && (x[1].includes(cat) || x[2].includes(group)); };
  if (cat === 7) return ix.b.groups[group]?.[0].startsWith('Rig ') ? 'rigs' : 'modules';
  if (cat === 8) return 'charges';
  if (cat === 18 || cat === 87) return 'drones';
  if (cat === 22) return 'deployables';
  if (cat === 6) return inF(11) || CAPITAL_GROUPS.has(group) ? 'capital' : inF(5) || inF(6) ? 'hulls-small' : inF(7) || inF(8) ? 'hulls-medium' : inF(9) || inF(10) ? 'hulls-large' : 'hulls-other';
  if (group === 1136) return 'fuel';
  if (inF(13) || inF(15)) return 'capital-parts';
  if (inF(14)) return 'components';
  if (inF(12)) return 'structures';
  return 'other';
}

/** The blueprints the finder ranks: Tech I (not invention products: Tech II is costed through invention) and no capital hull. */
export function finderBlueprints(ix: Indexed): BundleBp[] {
  return ix.b.bps.filter((bp) => {
    const p = productOf(bp);
    return !!p && !!bp[2] && !ix.t2.has(bp[0]) && productKind(ix, p.type) !== 'capital';
  });
}

/** Every finder blueprint as a row, priced first, best profit a day first; rows not priced after, in the bundle's order. */
export function rankBuilds(o: Omit<RowInput, 'bp'>, bps: readonly BundleBp[]): Row[] {
  const rows = bps.map((bp) => buildRow({ ...o, bp }));
  return rows.sort((a, b) => (b.day ? b.day.profit : -Infinity) - (a.day ? a.day.profit : -Infinity));
}

/** The research step a row's detail offers: profit a day at each ME/TE, and days and ISK to research there from 0/0. */
export type MeLevel = { me: number; te: number; profit: number | null; days: number | null; cost: number | null };
/** Where research runs: the site when it has a Laboratory, else the nearest one, with its index and bonuses. */
export type LabSite = { kind: SiteKind; rigs: readonly number[]; band: SecBand; tax: number | null; index: IndustryIndex | null };
export const ME_LEVELS: [number, number][] = [[0, 0], [6, 0], [8, 0], [10, 0], [10, 20]];

/**
 * Profit a day at ME 0, 6, 8, 10 and 10/20, with the days and ISK to research a fresh original to each in one lab slot,
 * one level after another, at the lab's index and bonuses and the builder's skills. Research ISK is null while the lab's
 * index or the EIV isn't known.
 */
export function meLevels(o: RowInput, lab: LabSite): MeLevel[] {
  const { ix, bp } = o;
  const rme = bp[4], rte = bp[5];
  const sb = structureBonus(ix, lab.kind);
  const cost = (a: 'researchMaterial' | 'researchTime') => rigFor(ix, lab.rigs, lab.kind, lab.band, null, a);
  return ME_LEVELS.map(([me, te]) => {
    const row = buildRow({ ...o, me, te });
    const meT = rme ? researchTime(ix, rme[0], 'me', 0, me, o.skills, sb.time, cost('researchMaterial').time) : null;
    const teT = rte ? researchTime(ix, rte[0], 'te', 0, te / 2, o.skills, sb.time, cost('researchTime').time) : null;
    const at = (a: 'researchMaterial' | 'researchTime') => lab.index ? { index: lab.index[a], structure: sb.cost, rig: cost(a).cost, tax: lab.tax, clone: o.clone } : null;
    const meC = row.eiv != null && at('researchMaterial') ? researchCost(row.eiv, 0, me, at('researchMaterial')!).total : null;
    const teC = row.eiv != null && at('researchTime') ? researchCost(row.eiv, 0, te / 2, at('researchTime')!).total : null;
    return {
      me, te, profit: row.day?.profit ?? null,
      days: meT != null && teT != null ? (meT + teT) / DAY_S : null,
      cost: me === 0 && te === 0 ? 0 : meC != null && teC != null ? meC + teC : null,
    };
  });
}

/** What's held where the site is, per type (the builder's loose hangar stock there), and what it cost the builder. */
export type Held = { units: (type: number) => number; cost: (type: number, units: number) => number | null };

/**
 * What starting costs: the original (NPCs' price; null when no NPC sells it), research to the ME/TE assumed, and a day's
 * materials less what's held at the site. Held materials count here and in the shopping list only, never in the steady
 * profit a day, since they're one-off and carry no freight in.
 */
export function startUp(row: Row, o: { bpo: number | null; research: number | null; held: Held }): { bpo: number | null; research: number | null; materials: number | null; heldUnits: number; heldCost: number | null; total: number | null } {
  let materials = 0, heldUnits = 0, heldCost: number | null = 0, known = true;
  for (const x of row.materials) {
    const h = Math.min(x.qty, Math.max(0, o.held.units(x.type)));
    heldUnits += h;
    if (h > 0) { const c = o.held.cost(x.type, h); heldCost = heldCost != null && c != null ? heldCost + c : null; }
    if (x.price == null) { known = false; continue; }
    materials += (x.qty - h) * x.price;
  }
  const mats = known ? materials : null;
  return { bpo: o.bpo, research: o.research, materials: mats, heldUnits, heldCost, total: o.bpo != null && o.research != null && mats != null ? o.bpo + o.research + mats : null };
}

/** What to buy for a day's job beyond what's held, per source: each line the units, the delivered price and the source picked. */
export function shoppingList(row: Row, held: Held): { type: number; qty: number; price: number | null; source: Source | null }[] {
  return row.materials.map((x) => ({ type: x.type, qty: Math.max(0, x.qty - Math.max(0, held.units(x.type))), price: x.price, source: x.pick })).filter((x) => x.qty > 0);
}

/** The morning scan's NPC sellers of every bundle blueprint in The Forge (`industry_npc`): price and stations, cheapest first. */
export type NpcRow = { at: string; complete: boolean; pagesFailed: number; sellers: Record<string, [price: number, stations: number[]]> };
export type BpoWhere =
  | { state: 'forge'; price: number; stations: number[] }
  | { state: 'notForge'; base: number | null; at: string }
  | { state: 'unknown'; base: number | null; missed: number }
  | { state: 'unread' };

/**
 * Where an original is sold, from the latest complete read and any newer partial one: the partial's sellers on top. In
 * The Forge, the price and stations. Not there after a complete read: NPCs don't sell it in The Forge (CCP's base price
 * beside, no payback). Not there with only a partial read: no seller found, the pages it missed said, no payback. No read
 * at all (the cloud off, a version behind, or no scan yet): not read.
 */
export function bpoWhere(rows: { complete: NpcRow | null; partial: NpcRow | null } | null, bp: number, basePrice: number): BpoWhere {
  if (!rows || (!rows.complete && !rows.partial)) return { state: 'unread' };
  const hit = rows.partial?.sellers[bp] ?? rows.complete?.sellers[bp];
  if (hit) return { state: 'forge', price: hit[0], stations: hit[1] };
  const base = basePrice > 0 ? basePrice : null;
  if (rows.complete) return { state: 'notForge', base, at: rows.complete.at };
  return { state: 'unknown', base, missed: rows.partial!.pagesFailed };
}

/** Days for the original to pay for itself out of one slot's profit a day; null with no original price or no profit. */
export const payback = (bpo: number | null, profitDay: number | null | undefined): number | null =>
  bpo != null && profitDay != null && profitDay > 0 ? bpo / profitDay : null;
```

- [ ] **Step 4: Run the test to see it pass, then plant each rule wrong**

Run: `npm run check 2>&1 | grep -B1 -A3 "the finder's rules"`
Expected: no `FAIL`.

Plant each, run, see the named line fail, undo:
- `sourceMaterial`: the mined option's `pickable: o.mines` → `pickable: true`: "mined, for a builder who doesn't mine" fails.
- `sourceMaterial`: `: weekly < HOME_DEPTH * o.weekNeed ?` → `: false ?`: "under ten times: too thin" fails.
- `sellAt`: `listPace: pace != null ? pace * split : null,` → `listPace: pace,`: "a market that sells into bids paces below"
  fails.
- `buildRow`: `const jitaLeg = batchLeg(o.legs.jita, …)` → `const jitaLeg = o.legs.jita;`: "materials 5,959,979 a unit"
  and "412,632 profit a unit" fail.
- `buildRow`: `tax: o.site.tax` → `tax: o.site.tax ?? 0.0025` (an untyped tax quietly taken as a station's): "a tax not
  typed: ranked before it" fails.

- [ ] **Step 5: Add to the note**

Append to `docs/notes/industry.md`:

```markdown
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
```

- [ ] **Step 6: The checks**

Run: `npm run check && npm run build && npm run check-income`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/industryRank.ts scripts/check.mjs docs/notes/industry.md
git commit -m "$(cat <<'MSG'
Industry: the finder's rules, from sourcing to one slot's day

What was missing: the finder (spec 2026-10-10-industry-design.md, "Build") needs, per blueprint, where each material
comes from, what the product fetches where you'd sell it, what freight costs, and what one factory slot earns a day.

What it is: src/lib/industryRank.ts, pure. Sourcing per material (Jita's ask plus freight, the home hub where it's deep
enough, mined at its bid), selling at Jita (listingPrice on others' book, tradingSplit for the split) or at home
(Goonmetrics, the region's history once read), freight with its minimum spread over a batch, the ships switch by site,
one slot's day, a row with every reason it may not be priced, ME levels, start-up and the shopping list with held
materials, where NPCs sell the original.

Two deviations from the spec, said in the note: mined is picked only for a builder with mining records in the last 30
days (a bid is always under an ask, so it would have won every mineral for everyone); and home pace is Goonmetrics'
weekly movement ÷ 7 until the home history is read, since ranking needs a pace first.

Evidence: the research's worked row comes out to the ISK: 5,959,979 of materials and 264,830 of job a unit, 6,637,440
net, 412,632 profit a unit, the slot binding. Mined picked for a non-miner, no depth check at home, no split on the home
pace, a route's minimum charged per material and an untyped tax taken as 0.25% each failed a check.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
MSG
)"
```

---
### Task 4A: The tab shell, the `industry` doc, Show for, and an alt's broker fee

**Files:**
- Create: `src/lib/altFees.ts`, `src/components/hustles/industryBundle.ts`, `src/components/hustles/industryChars.ts`,
  `src/components/hustles/IndustryStart.tsx`, `src/components/hustles/Industry.tsx`
- Modify: `src/lib/constants.ts` (`CALDARI_STATE`), `src/lib/industryRank.ts` (`minedLately`), `src/lib/prefs.ts`
  (`IndustryDoc`, `sanitizeIndustry`), `src/lib/cloudSync.ts` (`DOC_KEYS`), `worker/src/sync.ts` (`DOC_KEYS`),
  `src/lib/store.ts`, `src/lib/emptyData.ts`, `src/lib/cloud.ts` (the pull's sanitizers),
  `src/components/hustles/researchChars.ts` (the alt's fee; `openInJita` exported), `src/components/SideHustles.tsx`,
  `src/styles.css`, `scripts/check.mjs`, `scripts/check-worker.mjs`, `scripts/pages.mjs`, `docs/notes/industry.md`,
  `docs/notes/characters.md`

**Interfaces:**
- Consumes: `indexBundle`, `slots`, `MAX_SLOTS`, `Clone`, `SiteKind`, `NPC_FACILITY_TAX` (Task 2); `DEFAULT_SHARE`
  (Task 3).
- Produces:
  - `src/lib/constants.ts`: `CALDARI_STATE = 500001`.
  - `src/lib/altFees.ts`: `type StandingLike = { id: number; type: string; standing: number }`,
    `jitaStandings(list): { faction: number; corp: number } | null`, `ratesAtStandings(settings, list): Rates`.
  - `src/lib/industryRank.ts`: `MINED_DAYS = 30`, `minedLately(records, charId, now): boolean`.
  - `src/lib/prefs.ts`: `IndustrySite`, `FreightRoute`, `IndustryDoc`, `DEFAULT_INDUSTRY`, `SITE_KINDS`,
    `ASSUME_CHOICES`, `MAX_SITES` 12, `MAX_ROUTES` 12, `sanitizeIndustry(v): IndustryDoc`.
  - `Data.industry: IndustryDoc` (store.ts), synced as a doc.
  - `src/components/hustles/industryBundle.ts`: `loadIndustry(): Promise<Indexed>`, `loadGraph(): Promise<Graph>`.
  - `src/components/hustles/industryChars.ts`: `type IndustryChar`, `type IndustryAlts`,
    `useIndustryChars(alts): IndustryChar[]` (the main first), `skillsWhy(c): string`.
  - `src/components/hustles/Industry.tsx`: `Industry({ route })`, `SECTIONS`.
  - `src/components/hustles/researchChars.ts`: `openInJita(orders)` exported.

`IndustryChar`:

```ts
export type IndustryChar = {
  charId: number; name: string; isMain: boolean; pilot: Pilot;
  /** As read from its skills, or set by hand; `unknown` is never called Alpha. */
  clone: Clone;
  /** Its Jita 4-4 broker fee and sales tax: the main's from its settings; an alt's at its read standings (none read: no standing). */
  broker: number; tax: number;
  /** An alt's standings read (the cloud's hourly sheet); always true for the main, whose fee follows its settings. */
  standingsRead: boolean;
  /** Loose items per station or structure as last read, and when: the main's by its sync, an alt's by the cloud's hourly read. Null when not read. */
  stock: { byLocation: Record<number, Record<number, number>>; at: string } | null;
  /** Its own purchases, for what held materials cost it (heldCost). */
  buys: Tx[];
  /** Mining records in the last 30 days: "mined" is picked only for a builder who mines (Task 3). */
  mines: boolean;
  /** Its open Jita 4-4 orders, so a sale is worked out on everyone else's book. */
  own: OwnOrder[];
};
```

**Ship-safety.** The browser's `DOC_KEYS` gains `industry` in this task, so a Worker a version behind that answers 400
"Unknown document: industry" has that document held back by `refusedDoc` (cloud.ts' push loop) while everything else
goes up; the Worker's `DOC_KEYS` gains it in the same commit. An older browser ignores the doc when it comes down
(`isDocKey`). The tab writes the doc only from Task 4B on (sites), but the doc exists from here so every device sanitizes
it.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 3's section:

```js
console.log('\n--- an alt\'s Jita broker fee at its read standings (altFees.ts) ---');
{
  // An alt's copy (altLedger) carries faction and corporation standing 0, and the Research tab took its fee from that
  // (researchChars.ts), so an alt with standings paid, on paper, the fee of one with none. The fee now reads Caldari State
  // and Caldari Navy (Jita 4-4's owners) from its read standings, raw and floored at 0, as the main's sync does (sync.ts).
  const A = await import('../src/lib/altFees.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const read = [{ id: 500001, type: 'faction', standing: 3.63 }, { id: 1000035, type: 'npc_corp', standing: 7.04 }, { id: 3016563, type: 'agent', standing: 0.5 }];
  eq('  Caldari State and Caldari Navy, raw, as the main\'s sync takes them', A.jitaStandings(read), { faction: 3.63, corp: 7.04 });
  eq('  a negative standing floored at 0, as the sync floors it; one missing is none', A.jitaStandings([{ id: 500001, type: 'faction', standing: -2 }]), { faction: 0, corp: 0 });
  eq('  not read is not zero: null', [A.jitaStandings(undefined), A.jitaStandings(null)], [null, null]);
  const s = sanitizeSettings({ br: 3, acc: 4, clone: 'omega' });
  // 3% − 0.3% × 3 − 0.03% × 3.63 − 0.02% × 7.04 = 1.8503%; with none read, the settings' own 2.1%.
  eq('  the fee at those standings at Broker Relations III, and with none read', [A.ratesAtStandings(s, read).f, A.ratesAtStandings(s, undefined).f].map((f) => +f.toFixed(6)), [0.018503, 0.021]);
}

console.log('\n--- the industry doc: what you decide, synced (prefs.ts) ---');
{
  const P = await import('../src/lib/prefs.ts');
  const D = P.DEFAULT_INDUSTRY;
  eq('  nothing, or anything not a doc, is the default: no sites, Jita, 10%, no ships to Jita, 0/0', [P.sanitizeIndustry(undefined), P.sanitizeIndustry([1]), P.sanitizeIndustry('x')],
    [D, D, D]);
  eq('    the default\'s figures', [D.sell, D.share, D.noShipsToJita, D.assume, D.sites, D.freight, D.hub], ['jita', 10, true, { me: 0, te: 0 }, [], [], null]);
  const npc = { id: 'npc:60003466', name: 'Perimeter II - Moon 1 - Caldari Navy Assembly Plant', systemId: 30000144, kind: 'npc', stationId: 60003466, rigs: [37146], tax: 0.05, lab: true };
  const home = { id: 'home:30004807', name: 'Home in UALX-3', systemId: 30004807, kind: 'azbel', rigs: [37170, 37170, 37171, 37172, 37173], tax: null };
  const found = { id: 'st:1046664001931', name: 'UALX-3 - 1st Byzantigoon', systemId: 30004807, kind: 'keepstar', structureId: 1046664001931, rigs: [], tax: 0.01 };
  const doc = P.sanitizeIndustry({ sites: [npc, home, found, { ...npc }, { id: 'bad', name: 'x', systemId: 1, kind: 'npc' }, { id: 'odd', name: 'y', systemId: 30000144, kind: 'castle' }],
    site: 'home:30004807', sell: 'best', hub: 1046664001931, hubFees: { 1046664001931: 0.013, x: 0.5, 1049588174021: 0.9 }, share: 7.5, noShipsToJita: false, assume: { me: 10, te: 20 },
    freight: [{ id: 'brave', name: 'Brave Freight', a: 30000142, b: 30004807, perM3: 900, collateral: 0.007875, min: 5e6, source: 'Brave wiki, 3 June 2026' }, { id: 'bad', name: 'z', a: 1, b: 2, perM3: 1, collateral: 0, min: null, source: null }] });
  eq('  an NPC station keeps no rigs and takes its 0.25% facility tax, whatever was stored', doc.sites[0], { ...npc, rigs: [], tax: 0.0025 });
  eq('  a structure keeps three rigs at most, each once; a tax not typed stays null, never 0', doc.sites[1], { ...home, rigs: [37170, 37171, 37172] });
  eq('  a structure found by name keeps its ID', doc.sites[2], found);
  eq('  a duplicate, a system out of range and a kind the app doesn\'t know are dropped', doc.sites.length, 3);
  eq('  the rest as stored: default site, where to sell, hub, its typed fee, share, the switch, ME/TE', [doc.site, doc.sell, doc.hub, doc.hubFees, doc.share, doc.noShipsToJita, doc.assume],
    ['home:30004807', 'best', 1046664001931, { 1046664001931: 0.013 }, 7.5, false, { me: 10, te: 20 }]);
  eq('  a freight route kept, one between systems that don\'t exist dropped', doc.freight.map((r) => r.id), ['brave']);
  eq('  a default site that isn\'t one of the sites, an ME/TE that isn\'t a choice, a share of 0: back to the default',
    [P.sanitizeIndustry({ site: 'gone' }).site, P.sanitizeIndustry({ assume: { me: 9, te: 0 } }).assume, P.sanitizeIndustry({ share: 0 }).share], [null, { me: 0, te: 0 }, 10]);
  const { refusedDoc, DOC_KEYS } = await import('../src/lib/cloudSync.ts');
  eq('  synced as a doc, and held back by a Worker a version behind that refuses it', [DOC_KEYS.includes('industry'), refusedDoc('Unknown document: industry')], [true, 'industry']);
  const { emptyData } = await import('../src/lib/emptyData.ts');
  eq('  an empty ledger has the default doc', emptyData().industry, D);
}

console.log('\n--- who mines (industryRank.ts minedLately) ---');
{
  const K = await import('../src/lib/industryRank.ts');
  const NOW4 = Date.parse('2026-10-10T12:00:00Z');
  const rec = (charId, date) => ({ charId, date, systemId: 30000142, typeId: 1230, qty: 1000 });
  const mining = { a: rec(95210486, '2026-09-10'), b: rec(900001, '2026-10-09') };
  eq('  mining records in the last 30 days, by character: the alt mined yesterday, the main 30 days ago, not 31; none, none',
    [K.minedLately(mining, 900001, NOW4), K.minedLately(mining, 95210486, NOW4), K.minedLately({ a: rec(95210486, '2026-09-09') }, 95210486, NOW4), K.minedLately({}, 1, NOW4)], [true, true, false, false]);
  eq('    by character: the alt\'s record isn\'t the main\'s', K.minedLately({ b: rec(900001, '2026-10-09') }, 95210486, NOW4), false);
}
```

Add to `scripts/check-worker.mjs`, before its final `console.log(failed ? …)`:

```js
console.log('\n--- the industry doc goes up like any other ---');
{
  const { push } = await import('../worker/src/sync.ts');
  const db = d1();
  const r = await push(db, MAIN, { records: [], docs: [{ key: 'industry', d: { sites: [], share: 10 } }] });
  eq('  a push carrying the industry doc is taken, not refused as unknown', [r.docs, db.rows(`SELECT key FROM docs WHERE char_id = ?`, MAIN).map((x) => x.key)], [1, ['industry']]);
}
```

And widen the alt-store tripwire in `scripts/check.mjs` (the line that lists the files reading the alt store):

```js
  eq('  and only the shell, the Characters page, the Mining, Research and Industry tabs, the Wallet and To do read the alt store', users, ['App.tsx', 'components/Characters.tsx', 'components/Todo.tsx', 'components/Wallet.tsx', 'components/hustles/Industry.tsx', 'components/hustles/Mining.tsx', 'components/hustles/Research.tsx']);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -B1 -A3 "altFees\|the industry doc\|who mines\|alt store"`
Expected: `altFees.ts` not found, `DEFAULT_INDUSTRY` undefined, `minedLately` not a function, the tripwire's list short
of `components/hustles/Industry.tsx`; the Worker check fails on "Unknown document: industry".

- [ ] **Step 3: An alt's fee at its read standings**

In `src/lib/constants.ts`, under `CALDARI_NAVY`:

```ts
/** Caldari State: with Caldari Navy, the owner of Jita 4-4, whose standings set a broker fee there. */
export const CALDARI_STATE = 500001;
```

Create `src/lib/altFees.ts`:

```ts
import { CALDARI_NAVY, CALDARI_STATE } from './constants';
import { rates, type Rates, type Settings } from './fees';

/**
 * A character's Jita 4-4 rates at its own read standings (docs/notes/industry.md). Jita 4-4's owners are Caldari State
 * and Caldari Navy, and the broker fee turns on the raw standing with each, floored at 0, exactly as the main's sync fills
 * `settings.faction` and `settings.corp` (sync.ts). An alt's copy (altLedger) carries standing 0 for both, so without this
 * an alt with standings was charged, on paper, a fee it doesn't pay. altLedger's zeros stay: the income an alt earned is
 * worked out on them (characters.md), and that's another change. Pure: no config or store.
 */
export type StandingLike = { id: number; type: string; standing: number };

/** Caldari State's and Caldari Navy's raw standings, each floored at 0; null when the standings weren't read. One missing is no standing: 0. */
export function jitaStandings(list: readonly StandingLike[] | null | undefined): { faction: number; corp: number } | null {
  if (!list) return null;
  const raw = (type: string, id: number) => list.find((r) => r.type === type && r.id === id)?.standing ?? 0;
  return { faction: Math.max(0, raw('faction', CALDARI_STATE)), corp: Math.max(0, raw('npc_corp', CALDARI_NAVY)) };
}

/** Rates at a character's read standings, or as its settings have them when none were read. */
export function ratesAtStandings(settings: Settings, list: readonly StandingLike[] | null | undefined): Rates {
  const s = jitaStandings(list);
  return rates(s ? { ...settings, ...s } : settings);
}
```

In `src/components/hustles/researchChars.ts`: import `ratesAtStandings` from `'../../lib/altFees'`, export the existing
`openInJita` (`export const openInJita = …`), and in the alt's branch, beside `const rs = ledger.meta.research;`, add

```ts
      // At its read standings with Jita 4-4's owners (altFees.ts), not altLedger's zeros.
      const fee = ratesAtStandings(ledger.settings, st?.list);
```

and replace `tax: rates(ledger.settings).t, broker: rates(ledger.settings).f,` with `tax: fee.t, broker: fee.f,`
(`rates` stays imported for the main's line).

- [ ] **Step 4: The `industry` doc**

In `src/lib/prefs.ts`, add at the top `import { NPC_FACILITY_TAX, type SiteKind } from './industry';` and, after
`sanitizeLeaveFrom`:

```ts
/**
 * A place to build (docs/notes/industry.md): an NPC station near Jita, a structure found by name, or a home typed by you.
 * What's kept is what you'd do in game; what the market or ESI says is read fresh.
 */
export type IndustrySite = {
  /** `npc:<station>`, `st:<structure>`, or `home:<system>`. */
  id: string;
  name: string;
  systemId: number;
  kind: SiteKind;
  /** An NPC station's ID. */
  stationId?: number;
  /** A structure's ID once found by name: what its hangar stock is filed under. A home typed by you has none. */
  structureId?: number;
  /** Its engineering rigs, the bundle's type IDs, at most 3, of the structure's size. An NPC station has none. */
  rigs: number[];
  /** Its facility tax as a fraction: an NPC station's 0.25%; a structure's as typed, null until it is (never taken as 0). */
  tax: number | null;
  /** An NPC station with a Laboratory, where research, copying and invention run. */
  lab?: boolean;
};
/** A freight route between two systems, either way: ISK a m³ of packaged volume, a share of the goods' value, a minimum (null: none stated). */
export type FreightRoute = { id: string; name: string; a: number; b: number; perM3: number; collateral: number; min: number | null; source: string | null };
/** What you've decided about building, synced so every device works it out the same (the spec's "What's kept where"). */
export type IndustryDoc = {
  sites: IndustrySite[];
  /** The site the finder works for (an id in `sites`), or none. */
  site: string | null;
  sell: 'jita' | 'home' | 'best';
  /** The home hub sold at and bought from: a Goonmetrics hub's structure ID. */
  hub: number | null;
  /** A hub's broker fee as you typed it, a fraction, by hub ID. Untyped is absent: ranked before it. */
  hubFees: Record<string, number>;
  freight: FreightRoute[];
  /** The part of each market's daily trade you'd sell, in percent: 10 by default, the research's figure for modules. */
  share: number;
  /** Never haul ships to Jita: the user's own words, 9 October 2026 ("too bulky expensive and risky"). */
  noShipsToJita: boolean;
  /** The ME and TE assumed for an original you'd buy: 0/0, 8/0 or 10/20. */
  assume: { me: number; te: number };
};
export const DEFAULT_INDUSTRY: IndustryDoc = { sites: [], site: null, sell: 'jita', hub: null, hubFees: {}, freight: [], share: 10, noShipsToJita: true, assume: { me: 0, te: 0 } };
export const SITE_KINDS: readonly SiteKind[] = ['npc', 'raitaru', 'azbel', 'sotiyo', 'astrahus', 'fortizar', 'keepstar', 'other'];
export const ASSUME_CHOICES: readonly { me: number; te: number }[] = [{ me: 0, te: 0 }, { me: 8, te: 0 }, { me: 10, te: 20 }];
export const MAX_SITES = 12;
export const MAX_ROUTES = 12;
const isSystem = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 30_000_000 && (n as number) < 33_000_000;

/** The doc as stored or pulled, cleaned: anything it doesn't know, or out of range, goes; a site or route that can't be read is dropped whole. */
export function sanitizeIndustry(v: unknown): IndustryDoc {
  const x = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const text = (s: unknown, max: number) => (typeof s === 'string' && s.trim() && s.length <= max ? s : null);
  const share = (n: unknown, hi: number) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= hi ? n : null);
  const sites: IndustrySite[] = [];
  for (const raw of Array.isArray(x.sites) ? x.sites : []) {
    if (!raw || typeof raw !== 'object' || sites.length >= MAX_SITES) continue;
    const s = raw as Record<string, unknown>;
    const id = text(s.id, 64), name = text(s.name, 120), kind = SITE_KINDS.find((k) => k === s.kind), systemId = s.systemId;
    if (!id || !name || !isSystem(systemId) || !kind || sites.some((y) => y.id === id)) continue;
    if (kind === 'npc') {
      const stationId = s.stationId;
      if (!Number.isInteger(stationId) || (stationId as number) < 60_000_000 || (stationId as number) >= 64_000_000) continue;
      sites.push({ id, name, systemId, kind, stationId: stationId as number, rigs: [], tax: NPC_FACILITY_TAX, ...(s.lab === true ? { lab: true } : {}) });
      continue;
    }
    const rigs = [...new Set((Array.isArray(s.rigs) ? s.rigs : []).filter((r): r is number => Number.isInteger(r) && r > 0))].slice(0, 3);
    const structureId = Number.isInteger(s.structureId) && (s.structureId as number) >= 1e12 ? (s.structureId as number) : null;
    sites.push({ id, name, systemId, kind, ...(structureId != null ? { structureId } : {}), rigs, tax: share(s.tax, 0.5) });
  }
  const freight: FreightRoute[] = [];
  for (const raw of Array.isArray(x.freight) ? x.freight : []) {
    if (!raw || typeof raw !== 'object' || freight.length >= MAX_ROUTES) continue;
    const r = raw as Record<string, unknown>;
    const id = text(r.id, 64), name = text(r.name, 80), perM3 = share(r.perM3, 1e5), collateral = share(r.collateral, 0.2), a = r.a, b = r.b;
    if (!id || !name || !isSystem(a) || !isSystem(b) || perM3 == null || collateral == null || freight.some((y) => y.id === id)) continue;
    const min = r.min == null ? null : share(r.min, 1e10);
    if (r.min != null && min == null) continue;
    freight.push({ id, name, a, b, perM3, collateral, min, source: text(r.source, 120) });
  }
  const hubFees: Record<string, number> = {};
  if (x.hubFees && typeof x.hubFees === 'object' && !Array.isArray(x.hubFees)) {
    for (const [k, f] of Object.entries(x.hubFees as Record<string, unknown>)) { const n = share(f, 0.2); if (/^\d{13,}$/.test(k) && n != null) hubFees[k] = n; }
  }
  const a = x.assume as { me?: unknown; te?: unknown } | undefined;
  const assume = ASSUME_CHOICES.find((c) => c.me === a?.me && c.te === a?.te) ?? ASSUME_CHOICES[0];
  const sh = share(x.share, 100);
  return {
    sites,
    site: typeof x.site === 'string' && sites.some((s) => s.id === x.site) ? x.site : null,
    sell: x.sell === 'home' || x.sell === 'best' ? x.sell : 'jita',
    hub: Number.isInteger(x.hub) && (x.hub as number) >= 1e12 ? (x.hub as number) : null,
    hubFees, freight,
    share: sh != null && sh >= 0.1 ? sh : DEFAULT_INDUSTRY.share,
    noShipsToJita: x.noShipsToJita !== false,
    assume: { ...assume },
  };
}
```

In `src/lib/emptyData.ts`: import `DEFAULT_INDUSTRY` beside `DEFAULT_ALERTS, DEFAULT_PREFS`, and add
`industry: { ...DEFAULT_INDUSTRY },` to the object (after `chars: {},`).

- [ ] **Step 5: Who mines**

Append to `src/lib/industryRank.ts`:

```ts
/** How far back a mining record says a character mines. */
export const MINED_DAYS = 30;
/**
 * Whether a character mined in the last 30 days, by its own mining records (the Mining tab's: the main's in the ledger, an
 * alt's in its pulled copy): only then is "mined" picked as a material's source (sourceMaterial).
 */
export function minedLately(records: Record<string, { charId: number; date: string }>, charId: number, now: number): boolean {
  const since = new Date(now - MINED_DAYS * 86_400_000).toISOString().slice(0, 10);
  return Object.values(records).some((r) => r.charId === charId && r.date >= since);
}
```

- [ ] **Step 6: Run the pure tests, then plant each rule wrong**

Run: `npm run check 2>&1 | grep -B1 -A3 "altFees\|the industry doc\|who mines"`
Expected: no `FAIL` in those sections (the tripwire and the Worker's still fail until Steps 7 and 8).

Plant, run, see it fail, undo:
- `jitaStandings`: drop both `Math.max(0, …)`: "a negative standing floored at 0" fails.
- `jitaStandings`: read `'npc_corp', CALDARI_STATE`: "Caldari State and Caldari Navy, raw" fails.
- `sanitizeIndustry`: keep the stored `tax` on an NPC site: "an NPC station … takes its 0.25%" fails.
- `minedLately`: `MINED_DAYS = 29`: "the main 30 days ago" fails; drop `r.charId === charId &&`: "the alt's record isn't the
  main's" fails.

- [ ] **Step 7: The doc travels like any other**

- `src/lib/cloudSync.ts`: `DOC_KEYS` ends `…, 'chars', 'leaveFrom', 'industry'] as const;`.
- `worker/src/sync.ts`: `DOC_KEYS` gains `'industry'` (and its comment above gains "`industry` is the Industry tab's
  decisions: sites, freight, typed taxes, the share").
- `src/lib/store.ts`: import `sanitizeIndustry, type IndustryDoc` from `'./prefs'`; add to `Data`:

  ```ts
  /** The Industry tab's decisions: build sites, freight routes, typed taxes and broker fees, the share, the ships switch (prefs.ts). */
  industry: IndustryDoc;
  ```

  add `'industry'` at the end of `KEYS`; in `initStore`, after `data.chars = sanitizeChars(data.chars);`, add
  `data.industry = sanitizeIndustry(data.industry);`; in `importAll`, after the `plans` line, add
  `if (p.industry) p.industry = sanitizeIndustry(p.industry);`.
- `src/lib/cloud.ts`: import `sanitizeIndustry` with the other sanitizers from `'./prefs'`, and in `pullNow` after
  `if (p.chars) p.chars = sanitizeChars(p.chars);` add `if (p.industry) p.industry = sanitizeIndustry(p.industry);`.

Run: `npm run check 2>&1 | tail -40`
Expected: the Worker's "the industry doc goes up like any other" passes; only the tripwire still fails (no
`Industry.tsx` yet).

- [ ] **Step 8: The tab: its bundle, its characters, Start, the shell**

Create `src/components/hustles/industryBundle.ts`:

```ts
import { indexBundle, type Indexed, type IndustryBundle } from '../../lib/industry';
import type { Graph } from '../../lib/jumps';

/**
 * The Industry bundle (src/data/industry.json, scripts/industry-bundle.mjs) and the stargate map, each a chunk of its own,
 * loaded once by the Industry tab and indexed once. A failed load is asked again next time.
 */
let bundleP: Promise<Indexed> | null = null;
export const loadIndustry = (): Promise<Indexed> =>
  (bundleP ??= import('../../data/industry.json').then((m) => indexBundle(m.default as unknown as IndustryBundle)).catch((e) => { bundleP = null; throw e; }));

let graphP: Promise<Graph> | null = null;
export const loadGraph = (): Promise<Graph> =>
  (graphP ??= import('../../data/universeGraph.json').then((m) => (m.default as unknown as { systems: Graph }).systems).catch((e) => { graphP = null; throw e; }));
```

Create `src/components/hustles/industryChars.ts`:

```ts
import { useMemo } from 'react';
import { ratesAtStandings } from '../../lib/altFees';
import { altLedger } from '../../lib/altLedger';
import { askedScopes } from '../../lib/auth';
import { SCOPES } from '../../lib/config';
import { rates } from '../../lib/fees';
import { useAuth } from '../../lib/hooks';
import type { Clone } from '../../lib/industry';
import { minedLately } from '../../lib/industryRank';
import { pilotFrom, unreadNote, type Pilot } from '../../lib/pilot';
import type { OwnOrder } from '../../lib/researchTrack';
import { emptyAlt, loginState, type AltSaved, type RosterEntry } from '../../lib/roster';
import { useData } from '../../lib/store';
import type { Tx } from '../../lib/types';
import { openInJita } from './researchChars';

/**
 * Every character the Industry tab can be shown for: the main from the store, each alt from its pulled copy (altLedger),
 * with its pilot (skills, queue, attributes), clone, Jita fees at its read standings, held stock by place, purchases and
 * whether it mines. Industry.tsx passes the alt store's value in (the one file of the tab allowed to import it,
 * docs/notes/characters.md); this file writes nothing.
 */
export type IndustryChar = {
  charId: number; name: string; isMain: boolean; pilot: Pilot;
  /** As read from its skills, or set by hand; `unknown` is never called Alpha. */
  clone: Clone;
  /** Its Jita 4-4 broker fee and sales tax: the main's from its settings; an alt's at its read standings (none read: no standing). */
  broker: number; tax: number;
  /** An alt's standings read (the cloud's hourly sheet); always true for the main, whose fee follows its settings. */
  standingsRead: boolean;
  /** Loose items per station or structure as last read, and when: the main's by its sync, an alt's by the cloud's hourly read. Null when not read. */
  stock: { byLocation: Record<number, Record<number, number>>; at: string } | null;
  /** Its own purchases, for what held materials cost it (heldCost). */
  buys: Tx[];
  /** Mining records in the last 30 days: "mined" is picked only for a builder who mines (industryRank.ts). */
  mines: boolean;
  /** Its open Jita 4-4 orders, so a sale is worked out on everyone else's book. */
  own: OwnOrder[];
};
export type IndustryAlts = { roster: RosterEntry[]; alts: Record<number, AltSaved> };

const NO_ALT = emptyAlt();

export function useIndustryChars(alts: IndustryAlts): IndustryChar[] {
  const d = useData();
  const auth = useAuth();
  const mainId = auth?.characterId ?? 0;
  const mainName = auth?.characterName ?? 'You';
  const { skills, meta, settings, orders, txs, stock, mining, chars: known } = d;
  // The hour, so a minute's re-render keeps the same characters (minedLately's 30 days don't need finer).
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  return useMemo(() => {
    const r = rates(settings);
    const main: IndustryChar = {
      charId: mainId, name: mainName, isMain: true,
      pilot: pilotFrom({ skills, meta, settings }, { charId: mainId, name: mainName, isMain: true }, false),
      clone: meta.cloneDetected ?? (settings.clone === 'omega' ? 'omega' : 'unknown'),
      broker: r.f, tax: r.t, standingsRead: true,
      stock: stock?.byLocation ? { byLocation: stock.byLocation, at: stock.at } : null,
      buys: Object.values(txs).filter((t) => t.isBuy),
      mines: minedLately(mining, mainId, hour),
      own: openInJita(orders),
    };
    const wanted = [...SCOPES, ...askedScopes()];
    const others = alts.roster.map((entry): IndustryChar => {
      const saved = alts.alts[entry.charId] ?? NO_ALT;
      const byHand = known[String(entry.charId)]?.clone;
      const ledger = altLedger(saved, byHand);
      const name = entry.name ?? known[String(entry.charId)]?.name ?? `Character ${entry.charId}`;
      const login = loginState(entry, wanted);
      const lost = login.state === 'working' ? undefined : login.state;
      const list = ledger.meta.standings?.list;
      const ra = ratesAtStandings(ledger.settings, list);
      const st = ledger.stock;
      return {
        charId: entry.charId, name, isMain: false,
        pilot: { ...pilotFrom(ledger, { charId: entry.charId, name, isMain: false }, true), lost },
        clone: (ledger.meta as { cloneDetected?: 'alpha' | 'omega' }).cloneDetected ?? byHand ?? 'unknown',
        broker: ra.f, tax: ra.t, standingsRead: !!list,
        stock: st?.byLocation ? { byLocation: st.byLocation, at: st.at } : null,
        buys: Object.values(ledger.txs).filter((t) => t.isBuy),
        mines: minedLately(ledger.mining, entry.charId, hour),
        own: openInJita(ledger.orders),
      };
    });
    return [main, ...others];
  }, [mainId, mainName, skills, meta, settings, orders, txs, stock, mining, known, alts.roster, alts.alts, hour]);
}

/** Why a character's skills aren't shown, as a sentence: the main's next sync, an alt's first read, or its login to hand over again. */
export const skillsWhy = (c: IndustryChar): string => (c.isMain ? 'Your skills come with the next sync.' : `${unreadNote(c.pilot)}.`);
```

Create `src/components/hustles/IndustryStart.tsx`:

```tsx
import { MapPin, ScrollText, Store } from 'lucide-react';
import { pct } from '../../lib/format';
import { MAX_SLOTS, slots, type Indexed } from '../../lib/industry';
import { Points } from '../Facts';
import { Tiles } from '../ui';
import { skillsWhy, type IndustryChar } from './industryChars';

/**
 * Start (docs/notes/industry.md): the lead, where the shown character stands (its slots, its Jita fees, its clone), and,
 * from Task 7, the ladder of rungs from a first job to capitals. Nothing not read reads as a zero: an alt's skills not
 * read say so, and its fee is "–" until they are.
 */
export function IndustryStart({ c, ix }: { c: IndustryChar; ix: Indexed }) {
  const sk = c.pilot.skills;
  const s = sk ? slots(ix, sk) : null;
  const why = skillsWhy(c);
  const feeKnown = c.isMain || !!sk;
  const feeSaid = c.isMain ? `sales tax ${pct(c.tax)}, as Settings has them`
    : c.standingsRead ? `sales tax ${pct(c.tax)}, at ${c.name}’s standings with Caldari State and Caldari Navy`
      : `sales tax ${pct(c.tax)}; standings not read: broker fee at no standing`;
  return (
    <section className="col" style={{ gap: 14 }} aria-label="Start" data-industry="start">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Industry turns materials into things that sell. You need a blueprint, a factory slot, and somewhere to build.</p>
        <Points compact items={[
          { kind: 'good', icon: ScrollText, lead: 'A blueprint original', text: 'builds for ever, and can be researched and copied.' },
          { kind: 'info', icon: Store, lead: 'What limits most items', text: 'is what the market takes, not your factory.' },
          { kind: 'info', icon: MapPin, lead: 'Nothing has to move', text: 'to null-sec to start: a high-sec NPC station near Jita will do.' },
        ]} />
      </div>
      <div data-industry="where">
        <Tiles min={200} items={[
          {
            l: 'Factory slots', v: s ? `${s.factory} of ${MAX_SLOTS}` : '–', n: s ? 'one job each: 1, plus Mass Production and Advanced Mass Production' : why,
            tip: 'How many manufacturing jobs run at once.\n\n• One, plus one a level of Mass Production and of Advanced Mass Production.\n• Eleven at most (EVE University, "Industry skills").',
          },
          {
            l: 'Science slots', v: s ? `${s.science} of ${MAX_SLOTS}` : '–', n: s ? 'research, copying and invention: 1, plus Laboratory Operation and Advanced Laboratory Operation' : why,
            tip: 'How many research, copying and invention jobs run at once.\n\n• One, plus one a level of Laboratory Operation and of Advanced Laboratory Operation.\n• Eleven at most.',
          },
          {
            l: 'Jita broker fee', v: feeKnown ? pct(c.broker) : '–', n: feeKnown ? feeSaid : why,
            tip: 'What a listing in Jita 4-4 costs to place, and what each sale pays in tax.\n\n• From Broker Relations and Accounting.\n• And the standings with Jita 4-4’s owners, Caldari State and Caldari Navy: raw, floored at 0, as the sync takes the main’s.\n• An alt’s are the cloud’s hourly read of it; not read yet, it pays as if it had none.',
          },
          {
            l: 'Clone', v: c.clone === 'alpha' ? 'Alpha' : c.clone === 'omega' ? 'Omega' : 'Not read',
            n: c.clone === 'alpha' ? 'Alpha can’t use Metallurgy, Research or Laboratory Operation: researching needs Omega'
              : c.clone === 'omega' ? 'every industry skill is open'
                : 'clone state not read: the 0.25% Alpha job tax is left out where it can’t be told',
          },
        ]} />
      </div>
    </section>
  );
}
```

Create `src/components/hustles/Industry.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useAlts } from '../../lib/altStore';
import { navigate, type Route } from '../../lib/hooks';
import type { Indexed } from '../../lib/industry';
import { PilotProvider } from '../pilot';
import { Seg } from '../ui';
import { loadIndustry } from './industryBundle';
import { useIndustryChars } from './industryChars';
import { IndustryStart } from './IndustryStart';

/**
 * Industry: what to build, where, and what it pays (docs/notes/industry.md; spec
 * docs/superpowers/specs/2026-10-10-industry-design.md). Its sections sit in the address (hustles/industry/<section>)
 * and the last one picked is kept per browser: Start (where you stand and the ladder) and, from Task 4B, Build (where you
 * build and the finder); stages 2 to 4 add Blueprints & jobs, Copies and Home markets. "Show for" picks whose skills,
 * clone, fees, held stock and mining every figure uses: the main, or an alt from its pulled copy, read and never written.
 * The one file of the tab that imports the alt store (scripts/check.mjs keeps the list).
 */
const SECTION_KEY = 'jita-ledger:industry-section';
const SHOW_KEY = 'jita-ledger:industry-show';
const readKept = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const keep = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* just not kept */ } };

export const SECTIONS = [
  { key: 'start', label: 'Start', tip: 'Where you stand, and the steps from a first job to capitals' },
] as const;
type Section = (typeof SECTIONS)[number]['key'];

export function Industry({ route }: { route: Route }) {
  // The alt store is read here because this is the file allowed to read it (scripts/check.mjs keeps the list).
  const alts = useAlts();
  const chars = useIndustryChars(alts);
  const main = chars[0];
  // A kept character no longer on the roster falls back to the main, without forgetting the kept one: the roster loads
  // after the tab first draws.
  const [keptShow, setKeptShow] = useState(() => Number(readKept(SHOW_KEY)) || null);
  const shown = chars.find((c) => c.charId === keptShow) ?? main;
  const chooseShow = (id: number) => { setKeptShow(id); keep(SHOW_KEY, String(id)); };

  const kept = readKept(SECTION_KEY);
  const section: Section = SECTIONS.find((s) => s.key === route.path[2])?.key ?? SECTIONS.find((s) => s.key === kept)?.key ?? 'start';
  const choose = (s: Section) => { keep(SECTION_KEY, s); navigate(`hustles/industry/${s}`); };

  const [ix, setIx] = useState<Indexed | 'failed' | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    loadIndustry().then((b) => { if (alive) setIx(b); }, () => { if (alive) setIx('failed'); });
    return () => { alive = false; };
  }, [tries]);

  return (
    <div className="col" style={{ gap: 16 }} data-industry="tab">
      {(SECTIONS.length > 1 || chars.length > 1) && (
        <div className="row ind-head">
          {SECTIONS.length > 1 && <Seg label="Industry section" value={section} onChange={choose} options={SECTIONS.map((s) => ({ v: s.key, label: s.label, tip: s.tip }))} />}
          {chars.length > 1 && (
            <Seg size="sm" label="Show for" value={shown.charId} onChange={chooseShow}
              options={chars.map((c) => ({ v: c.charId, label: c.name, tip: c.isMain ? 'Your skills, clone, fees, stock and mining' : `${c.name}’s skills, clone, fees, stock and mining, as the cloud last read them`, tipTitle: `Show for ${c.name}` }))} />
          )}
        </div>
      )}
      {ix === 'failed' ? (
        <p className="note small" style={{ margin: 0 }}>Couldn’t load the blueprints just now. <button type="button" className="link-btn" onClick={() => { setIx(null); setTries((n) => n + 1); }}>Try again</button></p>
      ) : !ix ? (
        <p className="note small" style={{ margin: 0 }}>Loading the blueprints…</p>
      ) : (
        <PilotProvider value={shown.pilot}>
          {section === 'start' && <IndustryStart key={shown.charId} c={shown} ix={ix} />}
        </PilotProvider>
      )}
    </div>
  );
}
```

In `src/components/SideHustles.tsx`: import `Factory` from `lucide-react` and `{ Industry }` from `'./hustles/Industry'`;
add to `TABS`, last:
`{ key: 'industry', label: 'Industry', blurb: 'What to build, where, and what it pays', icon: Factory },`;
render it: `sub === 'industry' ? <Industry route={route} /> : …` before the Research branch; wrap the `<nav className="htabs">`
in `<div className="htabs-wrap">…</div>`; and add to the Guide's `steps`, last:
`{ icon: Factory, title: 'Industry', body: 'Pick where you build, find what pays there, research ME before you build much.' },`.
The comment over `TABS` gains: "…and industry wants a blueprint, a slot and somewhere to build, and pays in what the market
takes."

In `src/styles.css`, replace the `.htabs` and `.htab` / `.htab svg` / `.htab .hl` rules (lines 1009–1012) with:

```css
/*
 * Side hustles' tabs (SideHustles.tsx): seven in one row where they fit (the page at 1,440 with the sidebar open is about
 * 1,090 px), else four and three, else two with an odd last tab across the row, so no tab ever sits alone
 * (docs/notes/industry.md). By the row's own width, not the screen's: the sidebar open or shut changes it.
 */
.htabs-wrap { container-type: inline-size; }
.htabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.htabs > .htab:last-child:nth-child(odd) { grid-column: 1 / -1; }
@container (min-width: 560px) {
  .htabs { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .htabs > .htab:last-child:nth-child(odd) { grid-column: auto; }
}
@container (min-width: 1040px) { .htabs { grid-template-columns: repeat(7, minmax(0, 1fr)); } }
.htab { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; align-items: center; padding: 11px 10px; background: rgba(2, 7, 12, .45); border: 1px solid var(--line); text-align: left; color: var(--dim); }
.htab svg { width: 18px; height: 18px; color: #8a9fb3; }
.htab .hl { font-family: var(--f-head); font-weight: 600; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
```

and add, beside the Research rules (around line 1091):

```css
/* The Industry tab (hustles/Industry.tsx): its section switch and Show for share a row, wrapping on a phone. */
.ind-head { gap: 10px 16px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
```

Run: `npm run check && npm run build`
Expected: all pass, the tripwire included; `vite build` emits the bundle as a chunk of its own
(`dist/assets/industry-*.js`, about 1 MB, 145 KB gzipped): check with `ls -la dist/assets | grep -i industry`.

- [ ] **Step 9: The page check's `industry` case**

In `scripts/pages.mjs`, add `'hustles/industry'` to `PAGES` after `'hustles/research'`. In the plain-load loop, beside the
Research tab's block (`if (hash === 'hustles/research') …`), add:

```js
      // The Industry tab on these ledgers: Start's lead always draws; a main with no skills synced says when they come.
      if (hash === 'hustles/industry') {
        if (!(await page.locator('[data-industry="start"]', { hasText: 'Industry turns materials into things that sell.' }).count())) problems.push('not drawn: the Industry tab’s Start');
        if (/\bNaN\b/.test(await page.locator('.page').innerText().catch(() => ''))) problems.push('the Industry tab shows NaN');
      }
```

Then add the case of its own, after the Research case (before "Positions' "Check my hangar""). Later tasks insert their
blocks above the `// --- the end of the industry case` line:

```js
  // The Industry tab (docs/superpowers/plans/2026-10-10-industry-stage-1.md), in a ledger of its own: never the shared
  // large one, which check-income records. Task 4A: Start's lead and where each character stands (its slots, its Jita fees
  // at its own read standings, its clone), Show for over the main and three alts (one read with standings, one with skills
  // and no standings read, one whose login EVE refused with nothing read), and the seven tabs in one row at 1,440. Each
  // later task adds its block above "the end of the industry case". Both widths.
  if (SHOWN.includes('hustles/industry') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('industry'))) {
    const now = Date.now(), iso = (t) => new Date(t).toISOString();
    const ok = (job, ago) => ({ job, lastRun: now - ago, lastOk: now - ago, lastError: null });
    const ATTRS = { intelligence: 24, memory: 24, perception: 20, willpower: 20, charisma: 23 };
    // The main: Broker Relations IV and Accounting IV at Caldari State 3.63, Caldari Navy 7.04 (the research's own), so its
    // fee is 3% − 1.2% − 0.03% × 3.63 − 0.02% × 7.04 = 1.55%, and its tax 7.5% × (1 − 0.44) = 4.20%.
    const ledger = {
      settings: { acc: 4, br: 4, abr: 0, trade: 4, retail: 0, wholesale: 0, tycoon: 0, clone: 'omega', faction: 3.63, corp: 7.04, fromCharacter: true },
      skills: { 3380: 5, 3387: 4, 3388: 2, 3406: 3, 3402: 4, 3409: 2, 3403: 2, 3446: 4, 16622: 4, 26253: 1 },
      meta: { lastSync: iso(now - 600_000), cloneDetected: 'omega', walletBalance: 2e9, attributes: ATTRS,
        standings: { at: iso(now - 600_000), list: [{ id: 500001, type: 'faction', standing: 3.63 }, { id: 1000035, type: 'npc_corp', standing: 7.04 }] } },
    };
    const BUILDER = 900091, FRESH = 900092, LOST = 900093;
    const entry = (charId, name, extra = {}) => ({ charId, name, addedAt: now - 5 * 86400_000,
      scopes: ['esi-characters.read_standings.v1', 'esi-skills.read_skills.v1', 'esi-assets.read_assets.v1'],
      at: now - 3600_000, refusedAt: null, refused: null, rev: 2, ship: null, shipAt: null, jobs: [ok('archive', 1800_000), ok('sheet', 1700_000)], ...extra });
    // Builder Alt: Broker Relations III at Caldari State 2.0, Caldari Navy 3.0: 3% − 0.9% − 0.06% − 0.06% = 1.98% (at
    // altLedger's zero standings it read 2.10%). Fresh Alt: skills read, standings not: 2.10%, said. Lost Alt: refused.
    const altStore = {
      roster: { at: now - 60_000, list: [entry(BUILDER, 'Builder Alt'), entry(FRESH, 'Fresh Alt'), entry(LOST, 'Lost Alt', { refusedAt: now - 7200_000, refused: 'invalid_grant', rev: 0, jobs: [] })] },
      [`alt:${BUILDER}`]: { rev: 2, addedAt: now - 5 * 86400_000, records: {}, docs: { skills: { 3446: 3, 16622: 4, 3380: 4, 3387: 2, 3406: 1 }, meta: { cloneDetected: 'omega', attributes: ATTRS,
        standings: { list: [{ id: 500001, type: 'faction', standing: 2 }, { id: 1000035, type: 'npc_corp', standing: 3 }] } } } },
      [`alt:${FRESH}`]: { rev: 2, addedAt: now - 5 * 86400_000, records: {}, docs: { skills: { 3446: 3, 16622: 4, 3380: 1 }, meta: { attributes: ATTRS } } },
      [`alt:${LOST}`]: { rev: 0, records: {}, docs: {} },
    };
    const page = await browser.newPage(VIEW);
    let esiAsked = 0;
    // Each later task fills these with the answers it needs: ESI by path, the cloud by path.
    const ESI = {};
    const CLOUD = {};
    await page.route('**/*', (route) => {
      const req = route.request(), url = new URL(req.url());
      if (req.url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { expires: new Date(now + 300_000).toUTCString(), 'x-pages': '1' }, body: JSON.stringify(body) });
      if (url.hostname === 'esi.evetech.net') {
        esiAsked++;
        const answer = ESI[url.pathname];
        return answer ? answer(url, req, json) : route.abort();
      }
      const cloud = CLOUD[url.pathname];
      return cloud ? cloud(url, req, json) : route.abort();
    });
    const problems = [];
    page.on('pageerror', (e) => problems.push(`threw: ${e.message.split('\n')[0]}`));
    page.on('console', (m) => { if (m.type() === 'error' && /^Warning: /.test(m.text())) problems.push(`React: ${m.text().split('\n')[0].replace(/%s/g, '').slice(0, 160)}`); });
    const seed = (d, alts) => page.evaluate(async ([d2, auth, a]) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('jita-ledger:auth', JSON.stringify(auth));
      for (const [db, put] of [['jita-ledger', d2], ['jita-ledger-cache', a.cache ?? {}], ['jita-ledger-alts', a.alts]]) {
        const h = await new Promise((res) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
        if (!h.objectStoreNames.contains('kv')) { h.close(); continue; }
        await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
        h.close();
      }
    }, [d, ownerAuth(), alts]);
    const text = async (sel = '.page') => (await page.locator(sel).innerText().catch(() => '')).replace(/\s+/g, ' ');
    const tiles = (sel) => page.locator(`${sel} .tile`).evaluateAll((ts) => Object.fromEntries(ts.map((t) => [t.querySelector('.tile-l')?.firstChild?.textContent?.trim(), [t.querySelector('.tile-v')?.textContent?.trim(), t.querySelector('.tile-n')?.textContent?.trim()]]))).catch(() => ({}));
    const showFor = async (name) => { await page.locator('[aria-label="Show for"] button', { hasText: name }).click().catch((e) => problems.push(`couldn’t show for ${name}: ${e.message.split('\n')[0]}`)); await page.waitForTimeout(600); };
    await page.goto(SEED_PAGE);
    await seed(ledger, { alts: altStore });

    // --- Start (Task 4A): where each character stands.
    await page.goto(`${BASE}#hustles/industry/start`);
    await page.waitForSelector('[data-industry="start"]', { timeout: 20_000 }).catch(() => problems.push('Start never drew'));
    const want = {
      You: { 'Factory slots': ['5 of 11'], 'Science slots': ['4 of 11'], 'Jita broker fee': ['1.55%', 'sales tax 4.20%, as Settings has them'], Clone: ['Omega'] },
      'Builder Alt': { 'Factory slots': ['3 of 11'], 'Science slots': ['2 of 11'], 'Jita broker fee': ['1.98%', 'sales tax 4.20%, at Builder Alt’s standings with Caldari State and Caldari Navy'], Clone: ['Omega'] },
      'Fresh Alt': { 'Jita broker fee': ['2.10%', 'sales tax 4.20%; standings not read: broker fee at no standing'], Clone: ['Not read'] },
      'Lost Alt': { 'Factory slots': ['–', 'Not read: EVE refused Lost Alt’s login; hand it over again on the Characters page.'], 'Jita broker fee': ['–', 'Not read: EVE refused Lost Alt’s login; hand it over again on the Characters page.'] },
    };
    for (const [who, rows] of Object.entries(want)) {
      if (who !== 'You') await showFor(who);
      const got = await tiles('[data-industry="where"]');
      for (const [label, [v, n]] of Object.entries(rows)) {
        if (got[label]?.[0] !== v || (n && got[label]?.[1] !== n)) problems.push(`Start for ${who}: “${label}” reads ${JSON.stringify(got[label])}, not ${JSON.stringify([v, n].filter(Boolean))}`);
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}-industry-start-${who.replace(/\W+/g, '_')}.png` });
    }
    await showFor('Owner');
    // Seven tabs: one row at 1,440, no name cut off; on a phone, no tab alone on its row.
    if (!PHONE) {
      const tops = await page.locator('.htabs .htab').evaluateAll((ts) => ts.map((t) => t.offsetTop));
      if (tops.length !== 7 || new Set(tops).size !== 1) problems.push(`the seven Side hustles tabs aren’t one row at 1,440: ${JSON.stringify(tops)}`);
      const cut = await page.locator('.htabs .htab .hl').evaluateAll((ls) => ls.filter((l) => l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent));
      if (cut.length) problems.push(`a tab’s name is cut off at 1,440: ${cut.join(', ')}`);
    } else {
      const alone = await page.evaluate(() => {
        const nav = document.querySelector('.htabs'); const rows = {};
        for (const t of nav.querySelectorAll('.htab')) (rows[t.offsetTop] ??= []).push(t);
        return Object.values(rows).filter((r) => r.length === 1 && r[0].offsetWidth < nav.clientWidth - 2).length;
      });
      if (alone) problems.push('a Side hustles tab sits alone on its row on a phone');
    }

    // --- the end of the industry case
    const all = await text();
    if (/\bNaN\b/.test(all)) problems.push('the Industry tab shows NaN');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out: ${o}`);
    const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'industry', page: 'hustles/industry', problems: unique });
    process.stdout.write(unique.length ? `  FAIL industry #hustles/industry\n${unique.map((x) => `       ${x}`).join('\n')}\n` : `  ok   industry #hustles/industry (Start for the main and three alts, each one’s fee at its own standings; ${esiAsked} ESI reads)\n`);
    await page.close();
  }
```

The stand-in login's name is "Owner" (`ownerAuth()`), so the main's Show for button reads "Owner"; the table `want`
keys the main as "You" only for its label in failures.

Run: `LEDGER=industry PAGE=hustles/industry npm run check-pages` then `LEDGER=industry PAGE=hustles/industry npm run check-phone`
Expected: `ok   industry #hustles/industry …` at both widths.

Then see it catch the bug it guards: plant the old rule in `useIndustryChars`, `const ra = rates(ledger.settings);` for
the alt; the case fails with "Start for Builder Alt: “Jita broker fee” reads ["1.98%" …]" turned `["2.10%", …]`. Put it
back.

Run the full checks: `npm run check-pages && npm run check-phone`
Expected: every load passes, `hustles/industry` among the plain loads.

- [ ] **Step 10: A look in a browser**

Run: `SHOTS=.playwright-mcp/industry/4a LEDGER=industry PAGE=hustles/industry npm run check-pages` and
`SHOTS=.playwright-mcp/industry/4a-phone LEDGER=industry PAGE=hustles/industry npm run check-phone`, then open the
screenshots: Start's lead and points, four tiles a row at 1,440 and stacked lines at 390, the seven tabs in one row at
1,440 with no name cut, four-and-three or two-by-two with Industry across the last row on a phone, the Show for buttons
wrapping on a phone. Also `npm run dev` and look at `#hustles/industry` on the real store: the tab loads the bundle once
(Network: one `industry-*.js`), and the Research tab's cards for an alt with standings now show its fee at them.

- [ ] **Step 11: The notes**

Append to `docs/notes/industry.md`:

```markdown
- **The tab** (`components/hustles/Industry.tsx`): sections in the address (`hustles/industry/<section>`), the last kept
  per browser (`jita-ledger:industry-section`); "Show for" (`jita-ledger:industry-show`) picks whose skills, clone, Jita
  fees, held stock and mining every figure uses, the main or an alt, falling back to the main without forgetting the kept
  one. Industry.tsx is the one file of the tab importing the alt store; `useIndustryChars` reads each alt's pulled copy and
  writes nothing.
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
```

In `docs/notes/characters.md`, in the paragraph listing the alt store's importers ("only `App.tsx`, `Characters.tsx`,
`hustles/Mining.tsx`, `hustles/Research.tsx`, `Todo.tsx` and `Wallet.tsx` import the alt store"), add
`hustles/Industry.tsx` and a clause: "The Industry tab joined with its first task (10 October 2026): `useAlts()` handed to
`useIndustryChars` in `industryChars.ts`, which reads each alt's skills, standings, stock, purchases and mining from its
pulled copy and writes nothing."

- [ ] **Step 12: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass; `check-income` unchanged (the Research tab's fee isn't income, and altLedger is untouched).

- [ ] **Step 13: Commit**

```bash
git add src/lib/altFees.ts src/lib/constants.ts src/lib/industryRank.ts src/lib/prefs.ts src/lib/cloudSync.ts src/lib/store.ts \
  src/lib/emptyData.ts src/lib/cloud.ts worker/src/sync.ts src/components/hustles/industryBundle.ts src/components/hustles/industryChars.ts \
  src/components/hustles/IndustryStart.tsx src/components/hustles/Industry.tsx src/components/hustles/researchChars.ts \
  src/components/SideHustles.tsx src/styles.css scripts/check.mjs scripts/check-worker.mjs scripts/pages.mjs \
  docs/notes/industry.md docs/notes/characters.md
git commit -m "$(cat <<'MSG'
Industry: the tab, its synced doc, Show for, and an alt's broker fee at its own standings

What was missing: the seventh Side hustles tab (spec 2026-10-10-industry-design.md). It opens on Start: the lead, and
where the shown character stands (factory and science slots, its Jita fees, its clone), for the main or any alt.

What was wrong, found building it: an alt's copy (altLedger) carries standing 0 with Caldari State and Caldari Navy, and
the Research tab took an alt's broker fee from it (researchChars.ts), so an alt with standings was charged, on paper,
the fee of one with none. altFees.ts reads the alt's own standings, raw and floored at 0 as the main's sync does; both
tabs use it. In the page case Builder Alt (Broker Relations III, State 2.0, Navy 3.0) reads 1.98%, where it read 2.10%;
one whose standings aren't read pays as if it had none, and says so.

Also: the industry doc (sanitizeIndustry; synced; refusedDoc holds it back from a Worker a version behind), who mines
(minedLately: the finder picks "mined" only for a builder who mines), the bundle loaded as its own chunk, the tripwire's
list of alt-store readers, and the tabs' row as a container: seven in a row at 1,440 where 172 px fitted six, four and
three or two below, never one alone.

Tests: the fee at read standings (floored, missing, not read), the doc's sanitizer, the Worker taking the doc, who mines;
the page case for the main and three alts at both widths. The fee from altLedger's zeros, unfloored standings, an NPC
site's stored tax and a 29-day window each failed a check.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
MSG
)"
```

---
### Task 4B: Build sites, freight routes and `FindStructure`

**Files:**
- Create: `src/lib/industrySites.ts`, `src/components/FindStructure.tsx`, `src/components/hustles/industryMarket.ts`,
  `src/components/hustles/IndustrySites.tsx`, `src/components/hustles/IndustryBuild.tsx`
- Modify: `src/lib/market.ts` (`industrySystemsShared`), `src/components/Reprocess.tsx` (uses `FindStructure`),
  `src/components/hustles/Industry.tsx` (the Build section), `scripts/check.mjs`, `scripts/pages.mjs`,
  `docs/notes/industry.md`, `docs/notes/loyalty-hustles.md` (Reprocessing's FindStructure moved)

**Interfaces:**
- Consumes: `Indexed`, `IndustryIndex`, `parseIndices`, `secBand`, `kindOfType`, `RIG_SIZE`, `KIND_SAID`,
  `NPC_FACILITY_TAX`, `SiteKind`, `SecBand`, `BundleRig` (Task 2); `Leg`, `NEAR_JITA_JUMPS` (Task 3); `IndustryDoc`,
  `IndustrySite`, `FreightRoute`, `sanitizeIndustry`, `SITE_KINDS`, `MAX_SITES`, `MAX_ROUTES` (Task 4A);
  `IndustryChar`, `loadGraph` (Task 4A); `jumpsFrom`, `HIGH_SEC`, `Graph` (jumps.ts); `resolveNames` (market.ts).
- Produces:
  - `src/lib/industrySites.ts`: `JITA_SYSTEM` 30000142, `HOME_SYSTEMS`, `BRAVE_SOURCE`, `FREIGHT_PRESETS`,
    `type StationPick`, `quietStations(stations, graph, indices, { maxJumps, need, limit })`,
    `nearestLab(stations, graph, from)`, `type SiteFacts`, `siteFacts(site, graph, jitaHigh, indices)`,
    `rigsFitting(ix, kind)`, `routeBetween(routes, a, b)`, `legFor(site, facts, market, routes): Leg`,
    `stationSite(pick, name)`, `structureSite(found)`, `homeSite(systemId, system, kind)`.
  - `src/lib/market.ts`: `industrySystemsShared(): Promise<Record<number, IndustryIndex>>` (an hour, shared).
  - `src/components/FindStructure.tsx`: `type FoundStructure = { id; name; systemId; system; security: number | null; typeId?: number }`,
    `FindStructure({ onPick, picked?, describe, label? })`.
  - `src/components/hustles/industryMarket.ts`: `type Loaded<T> = { state: 'loading' } | { state: 'failed'; error: string; retry: () => void } | { state: 'ok'; value: T }`,
    `useIndices(): Loaded<Record<number, IndustryIndex>>`, `useStationNames(ids): Record<number, string>`,
    `useIndustryDoc(): [IndustryDoc, (patch: Partial<IndustryDoc>) => void]`.
  - `src/components/hustles/IndustrySites.tsx`: `IndustrySites({ c, ix, graph, mainName })`.
  - `src/components/hustles/IndustryBuild.tsx`: `IndustryBuild({ c, ix, graph, mainName })` (Task 5B adds the finder).

**Where the sites live.** In the Build section, as "Where you build", a panel of its own under the finder (Task 5B puts the
finder above it). Open while there's no site, shut after, the choice kept per browser inside the finder's view state
(`jita-ledger:industry-finder`, `sitesOpen`). A site's tax and rigs are typed in its row; a structure found by name keeps
its ID (what its hangar stock is filed under), a home typed by you has none and holds nothing known (said).

- [ ] **Step 1: Write the failing test**

Add to `scripts/check.mjs`, after Task 4A's sections:

```js
console.log('\n--- Industry: where you build (industrySites.ts) ---');
{
  // ESI's indices of 10 October 2026 for the systems in the fixture (Jita, Perimeter, Maurasi, Urlen, Itamo, Sobaseki, UALX-3,
  // C-J6MT), CCP's stations and their services, and the stargate map.
  const I = await import('../src/lib/industry.ts');
  const S = await import('../src/lib/industrySites.ts');
  const { jumpsFrom, HIGH_SEC } = await import('../src/lib/jumps.ts');
  const fsI = await import('node:fs');
  const ix = I.indexBundle(JSON.parse(fsI.readFileSync(new URL('../src/data/industry.json', import.meta.url), 'utf8')));
  const g = JSON.parse(fsI.readFileSync(new URL('../src/data/universeGraph.json', import.meta.url), 'utf8')).systems;
  const fx = JSON.parse(fsI.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8'));
  const idx = I.parseIndices(fx.systems);
  const high = jumpsFrom(g, S.JITA_SYSTEM, (_, s) => s >= HIGH_SEC);
  const quiet = S.quietStations(ix.b.stations, g, idx, { maxJumps: 10, need: 'factory', limit: 50 });
  eq('  the quietest factories near Jita first: Itamo (3.94%, 2 jumps), then Perimeter, Maurasi, Sobaseki, Jita', [...new Set(quiet.map((x) => x.system))], ['Itamo', 'Perimeter', 'Maurasi', 'Sobaseki', 'Jita']);
  eq('    a system ESI lists no index for is left out', quiet.every((x) => idx[x.systemId]), true);
  eq('  a Laboratory near Jita, quietest first: Sobaseki\'s', S.quietStations(ix.b.stations, g, idx, { maxJumps: 10, need: 'lab', limit: 3 }).map((x) => [x.stationId, x.system, x.lab]), [[60002419, 'Sobaseki', true]]);
  eq('  the nearest Laboratory: a jump from Jita; twelve from UALX-3', [S.nearestLab(ix.b.stations, g, 30000142), S.nearestLab(ix.b.stations, g, 30004807)],
    [{ stationId: 60002419, systemId: 30001363, jumps: 1 }, { stationId: 60012751, systemId: 30001014, jumps: 12 }]);
  const home = S.homeSite(30004807, 'UALX-3', 'azbel');
  const facts = S.siteFacts(home, g, high, idx);
  eq('  a home in UALX-3: null-sec, no high-sec route from Jita, its index, its tax not typed (null, never 0)', [facts.band, facts.jitaJumps, facts.nearJita, facts.index.manufacturing, facts.tax, facts.canScience], ['null', null, false, 0.0612, null, true]);
  eq('    before ESI\'s indices are read: no index, said', [S.siteFacts(home, g, high, null).index, S.siteFacts(home, g, high, null).indexWhy], [null, 'Reading the industry indices…']);
  eq('    a system ESI lists no index for, said by name', S.siteFacts(S.homeSite(30000168, 'Friggi', 'raitaru'), g, high, idx).indexWhy, 'ESI lists no industry index for Friggi');
  const st = S.stationSite({ stationId: 60003466, systemId: 30000144, system: 'Perimeter', security: 0.949, jumps: 1, index: 0.0695, lab: false }, 'Perimeter station');
  const stFacts = S.siteFacts(st, g, high, idx);
  eq('  an NPC station a jump from Jita: 0.25%, carried to Jita, no Laboratory so no research there', [stFacts.tax, stFacts.jitaJumps, stFacts.nearJita, stFacts.canScience], [0.0025, 1, true, false]);
  eq('  goods to Jita: carried from Perimeter; no way from UALX-3 until a route is picked; Brave Freight once it is; none to UALX-3\'s own market',
    [S.legFor(st, stFacts, S.JITA_SYSTEM, []), S.legFor(home, facts, S.JITA_SYSTEM, []), S.legFor(home, facts, S.JITA_SYSTEM, S.FREIGHT_PRESETS).kind, S.legFor(home, facts, 30004807, [])],
    [{ kind: 'carry', jumps: 1 }, { kind: 'none' }, 'route', { kind: 'here' }]);
  eq('  Brave Freight\'s presets: 900 ISK a m³, 0.75% of 105%, 5 M; Jita ↔ C-J6MT 1,150 with no minimum stated; UALX-3 ↔ C-J6MT 415, 50 M',
    S.FREIGHT_PRESETS.map((r) => [r.perM3, +r.collateral.toFixed(6), r.min]), [[900, 0.007875, 5e6], [1150, 0.007875, null], [415, 0, 5e7]]);
  eq('  the rigs each structure takes: 34 L-Set for an Azbel, 64 M-Set for a Raitaru, 8 XL-Set for a Sotiyo, none in a station',
    ['azbel', 'raitaru', 'sotiyo', 'npc'].map((k) => S.rigsFitting(ix, k).length), [34, 64, 8, 0]);
  eq('  a structure found by name: its kind from its type; its rigs and tax yours to type',
    S.structureSite({ id: 1046664001931, name: 'UALX-3 - 1st Byzantigoon', systemId: 30004807, typeId: 35834 }),
    { id: 'st:1046664001931', name: 'UALX-3 - 1st Byzantigoon', systemId: 30004807, kind: 'keepstar', structureId: 1046664001931, rigs: [], tax: null });
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run check 2>&1 | grep -A3 "where you build"`
Expected: `ERR_MODULE_NOT_FOUND … src/lib/industrySites.ts`.

- [ ] **Step 3: Write `src/lib/industrySites.ts`**

```ts
import { HIGH_SEC, jumpsFrom, type Graph } from './jumps';
import { NPC_FACILITY_TAX, RIG_SIZE, secBand, kindOfType, type BundleRig, type Indexed, type IndustryIndex, type SecBand, type SiteKind } from './industry';
import { NEAR_JITA_JUMPS, type Leg } from './industryRank';
import type { FreightRoute, IndustrySite } from './prefs';

/**
 * Where you build (docs/notes/industry.md): quiet NPC stations near Jita, a site's facts (its band, its jumps from Jita,
 * its index, whether it can research), the rigs a structure takes, freight presets, and how goods get between a site and a
 * market. Pure: no config, store, React or DOM.
 */

export const JITA_SYSTEM = 30000142;
/** The home systems offered first: UALX-3, Brave's (the user's planned home), and C-J6MT, the Imperium's staging. */
export const HOME_SYSTEMS = [{ systemId: 30004807, name: 'UALX-3' }, { systemId: 30000772, name: 'C-J6MT' }] as const;

/** Brave Freight's published routes (Brave wiki "BRAVE Freight", revised 3 June 2026; its calculator, 9 October 2026), offered as presets, applied only once picked. */
export const BRAVE_SOURCE = 'Brave wiki, 3 June 2026';
export const FREIGHT_PRESETS: FreightRoute[] = [
  // 900 ISK a m³, 0.75% of a collateral of 105% of Jita's value on routes to or from high-sec, 5 M minimum.
  { id: 'brave-jita-ualx', name: 'Brave Freight, Jita ↔ UALX-3', a: JITA_SYSTEM, b: 30004807, perM3: 900, collateral: 0.0075 * 1.05, min: 5_000_000, source: BRAVE_SOURCE },
  // 1,150 a m³ (the calculator); to or from high-sec, so the same collateral; no minimum stated for this route.
  { id: 'brave-jita-cj6', name: 'Brave Freight, Jita ↔ C-J6MT', a: JITA_SYSTEM, b: 30000772, perM3: 1150, collateral: 0.0075 * 1.05, min: null, source: 'Brave Freight’s calculator, 9 October 2026' },
  // 415 a m³, 50 M minimum, no high-sec end so no collateral charge.
  { id: 'brave-ualx-cj6', name: 'Brave Freight, UALX-3 ↔ C-J6MT', a: 30004807, b: 30000772, perM3: 415, collateral: 0, min: 50_000_000, source: BRAVE_SOURCE },
];

export type StationPick = { stationId: number; systemId: number; system: string; security: number; jumps: number; index: number; lab: boolean };

/**
 * High-sec NPC stations with a Factory (or a Laboratory) within `maxJumps` high-sec jumps of Jita, quietest first: by the
 * index of the activity you'd run there (manufacturing for a Factory, ME research for a Laboratory), then the jumps. A
 * system ESI lists no index for is left out (it can't be costed). At most `limit`.
 */
export function quietStations(stations: readonly [number, number, number][], graph: Graph, indices: Record<number, IndustryIndex>, o: { maxJumps: number; need: 'factory' | 'lab'; limit: number }): StationPick[] {
  const high = jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC);
  const out: StationPick[] = [];
  for (const [stationId, systemId, services] of stations) {
    if (!(services & (o.need === 'factory' ? 1 : 2))) continue;
    const jumps = high.get(systemId), sys = graph[systemId], ix = indices[systemId];
    if (jumps == null || jumps > o.maxJumps || !sys || !ix) continue;
    out.push({ stationId, systemId, system: sys[1], security: sys[0], jumps, index: o.need === 'factory' ? ix.manufacturing : ix.researchMaterial, lab: !!(services & 2) });
  }
  return out.sort((a, b) => a.index - b.index || a.jumps - b.jumps || a.stationId - b.stationId).slice(0, o.limit);
}

/** The nearest NPC station with a Laboratory to a system, by any route; null when none can be reached on the map. */
export function nearestLab(stations: readonly [number, number, number][], graph: Graph, from: number): { stationId: number; systemId: number; jumps: number } | null {
  const any = jumpsFrom(graph, from);
  let best: { stationId: number; systemId: number; jumps: number } | null = null;
  for (const [stationId, systemId, services] of stations) {
    const j = any.get(systemId);
    if (!(services & 2) || j == null) continue;
    if (!best || j < best.jumps || (j === best.jumps && stationId < best.stationId)) best = { stationId, systemId, jumps: j };
  }
  return best;
}

/** What a site is, worked out: its system's name and band, its high-sec jumps from Jita (null: no high-sec route), its index, whether it can research. */
export type SiteFacts = {
  system: string | null; security: number | null; band: SecBand;
  jitaJumps: number | null; nearJita: boolean;
  /** ESI's indices for the site's system; null while not read or when ESI lists none (`indexWhy` says which). */
  index: IndustryIndex | null; indexWhy: string | null;
  /** Research, copying and invention: an NPC station with a Laboratory, or any structure (taken as having a lab: its owner says otherwise). */
  canScience: boolean;
  tax: number | null;
};
export function siteFacts(site: IndustrySite, graph: Graph, jitaHigh: Map<number, number>, indices: Record<number, IndustryIndex> | null): SiteFacts {
  const sys = graph[site.systemId];
  const jitaJumps = jitaHigh.get(site.systemId) ?? null;
  const index = indices?.[site.systemId] ?? null;
  return {
    system: sys?.[1] ?? null, security: sys?.[0] ?? null, band: sys ? secBand(sys[0]) : 'null',
    jitaJumps, nearJita: jitaJumps != null && jitaJumps <= NEAR_JITA_JUMPS,
    index, indexWhy: !indices ? 'Reading the industry indices…' : index ? null : `ESI lists no industry index for ${sys?.[1] ?? `system ${site.systemId}`}`,
    canScience: site.kind === 'npc' ? !!site.lab : true,
    tax: site.kind === 'npc' ? NPC_FACILITY_TAX : site.tax,
  };
}

/** The bundle's rigs a kind of structure takes (its size), Tech I first, by name. None for a station or a structure the app has no bonuses for. */
export function rigsFitting(ix: Indexed, kind: SiteKind): BundleRig[] {
  const size = RIG_SIZE[kind];
  if (!size) return [];
  return ix.b.rigs.filter((r) => r[1] === size).sort((a, b) => a[2] - b[2] || (ix.b.types[a[0]]?.[0] ?? '').localeCompare(ix.b.types[b[0]]?.[0] ?? ''));
}

/** A freight route between two systems, either way; the first one listed. */
export const routeBetween = (routes: readonly FreightRoute[], a: number, b: number): FreightRoute | null =>
  routes.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) ?? null;

/**
 * How goods get between a site and a market's system: the market's own system is `here`; a route set between them is
 * taken; with none, a high-sec site within NEAR_JITA_JUMPS of Jita carries to and from Jita itself (no ISK, said), and
 * anything else has no way set.
 */
export function legFor(site: { systemId: number }, facts: Pick<SiteFacts, 'nearJita' | 'jitaJumps'>, market: number, routes: readonly FreightRoute[]): Leg {
  if (site.systemId === market) return { kind: 'here' };
  const r = routeBetween(routes, site.systemId, market);
  if (r) return { kind: 'route', name: r.name, f: { perM3: r.perM3, collateral: r.collateral, min: r.min } };
  if (market === JITA_SYSTEM && facts.nearJita && facts.jitaJumps != null) return { kind: 'carry', jumps: facts.jitaJumps };
  return { kind: 'none' };
}

/** A site for an NPC station picked from the quiet list. */
export const stationSite = (p: StationPick, name: string): IndustrySite =>
  ({ id: `npc:${p.stationId}`, name, systemId: p.systemId, kind: 'npc', stationId: p.stationId, rigs: [], tax: NPC_FACILITY_TAX, ...(p.lab ? { lab: true } : {}) });
/** A site for a structure found by name: its kind from its type; rigs and tax yours to type. */
export const structureSite = (f: { id: number; name: string; systemId: number; typeId?: number }): IndustrySite =>
  ({ id: `st:${f.id}`, name: f.name, systemId: f.systemId, kind: kindOfType(f.typeId), structureId: f.id, rigs: [], tax: null });
/** A home typed by you: a system and a kind of structure, with no structure ID, so it holds nothing known. */
export const homeSite = (systemId: number, system: string, kind: SiteKind): IndustrySite =>
  ({ id: `home:${systemId}`, name: `Home in ${system}`, systemId, kind, rigs: [], tax: null });
```

- [ ] **Step 4: Run the test to see it pass, then plant each rule wrong**

Run: `npm run check 2>&1 | grep -B1 -A3 "where you build"`
Expected: no `FAIL`.

Plant, run, see it fail, undo:
- `quietStations`: sort `b.index - a.index` (busiest first): "the quietest factories near Jita first" fails.
- `legFor`: drop `facts.nearJita &&`: "no way from UALX-3 until a route is picked" still holds (no jumps), so also drop
  `facts.jitaJumps != null &&`: it fails with a carry of `null` jumps.
- `siteFacts`: `canScience: true` for every kind: "no Laboratory so no research there" fails.
- `siteFacts`: `tax: site.tax ?? 0` : "its tax not typed (null, never 0)" fails.

- [ ] **Step 5: ESI's indices, shared**

In `src/lib/market.ts`, import `{ parseIndices, type IndustryIndex }` from `'./industry'` and add after
`adjustedPricesShared`:

```ts
let indices: { at: number; p: Promise<Record<number, IndustryIndex>> } | null = null;
/**
 * ESI's industry cost indices for every system (/industry/systems/, no login, about 2 MB, cached an hour by ESI), read at
 * most once an hour however many panels ask, and shared while in flight. A failure isn't kept.
 */
export function industrySystemsShared(): Promise<Record<number, IndustryIndex>> {
  if (!indices || Date.now() - indices.at > 3600_000) {
    const p = esi<{ solar_system_id: number; cost_indices: { activity: string; cost_index: number }[] }[]>('/industry/systems/').then(({ data }) => parseIndices(data));
    indices = { at: Date.now(), p };
    p.catch(() => { indices = null; });
  }
  return indices.p;
}
```

Create `src/components/hustles/industryMarket.ts`:

```ts
import { useEffect, useMemo, useState } from 'react';
import type { IndustryIndex } from '../../lib/industry';
import { industrySystemsShared, resolveNames } from '../../lib/market';
import { sanitizeIndustry, type IndustryDoc } from '../../lib/prefs';
import { update, useData } from '../../lib/store';

/**
 * What the Industry tab reads besides its bundle (docs/notes/industry.md): ESI's indices (an hour, shared), NPC stations'
 * names, and the synced doc. Task 5B adds adjusted prices, the scan, the NPC row and live books; Task 6 home prices and
 * histories. Nothing read is never a zero: a read still going is `loading`, one refused `failed`, with its retry.
 */
export type Loaded<T> = { state: 'loading' } | { state: 'failed'; error: string; retry: () => void } | { state: 'ok'; value: T };

/** A shared read as a hook's state, read again on retry or when `key` changes. */
export function useShared<T>(read: () => Promise<T>, key = ''): Loaded<T> {
  const [st, setSt] = useState<Loaded<T>>({ state: 'loading' });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    setSt({ state: 'loading' });
    read().then((value) => { if (alive) setSt({ state: 'ok', value }); },
      (e) => { if (alive) setSt({ state: 'failed', error: e instanceof Error ? e.message : String(e), retry: () => setTries((n) => n + 1) }); });
    return () => { alive = false; };
  }, [tries, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

export const useIndices = (): Loaded<Record<number, IndustryIndex>> => useShared(industrySystemsShared);

/** NPC stations' names (ESI's /universe/names, one request for all asked), kept for the visit; one ESI didn't name reads "Station #id". */
const stationNames = new Map<number, string>();
export function useStationNames(ids: readonly number[]): Record<number, string> {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  const [ver, bump] = useState(0);
  useEffect(() => {
    const want = key ? key.split(',').map(Number).filter((id) => !stationNames.has(id)) : [];
    if (!want.length) return;
    let alive = true;
    resolveNames(want).then((got) => {
      for (const [id, n] of Object.entries(got)) stationNames.set(Number(id), n);
      if (alive) bump((n) => n + 1);
    }, () => undefined);
    return () => { alive = false; };
  }, [key]);
  return useMemo(() => Object.fromEntries((key ? key.split(',').map(Number) : []).map((id) => [id, stationNames.get(id) ?? `Station #${id}`])), [key, ver]);
}

/** The synced `industry` doc, and a writer that cleans each change as disk and the cloud do. */
export function useIndustryDoc(): [IndustryDoc, (patch: Partial<IndustryDoc>) => void] {
  const doc = useData().industry;
  return [doc, (patch) => update((x) => ({ industry: sanitizeIndustry({ ...x.industry, ...patch }) }))];
}
```

- [ ] **Step 6: `FindStructure` out of Reprocessing**

Create `src/components/FindStructure.tsx`, the component moved out of `Reprocess.tsx` (lines 247–296) and made to hand
back the structure itself, each page saying what it is to it:

```tsx
import { useState } from 'react';
import { getAuth } from '../lib/auth';
import { esi } from '../lib/esi';
import { toast } from '../lib/toast';
import { structureInfo, system } from '../lib/universe';

/**
 * Find a structure by name (esi-search.search_structures.v1): ESI searches the structures the logged-in character can see,
 * and each one found is read for its name, type and system (esi-universe.read_structures.v1). Moved out of Reprocessing,
 * where it picks a refinery, so the Industry tab can pick a build site with it: each page says what a structure is to it
 * (`describe`). It searches as this browser's login, the main.
 */
export type FoundStructure = { id: number; name: string; systemId: number; system: string; security: number | null; typeId?: number };

export function FindStructure({ onPick, picked, describe, label = 'Find a structure by name' }: {
  onPick: (f: FoundStructure) => void; picked?: string; describe: (f: FoundStructure) => string; label?: string;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundStructure[] | null>(null);
  const [busy, setBusy] = useState(false);
  const find = async () => {
    const a = getAuth();
    if (!a || q.trim().length < 3) { toast('Type at least three letters of its name.', 'warn'); return; }
    setBusy(true);
    try {
      const { data } = await esi<{ structure?: number[] }>(`/characters/${a.characterId}/search/`, { auth: true, query: { categories: 'structure', search: q.trim(), strict: 'false' } });
      const out: FoundStructure[] = [];
      for (const id of (data.structure ?? []).slice(0, 15)) {
        const s = await structureInfo(id);
        if (s.status !== 'found') continue;
        const sys = await system(s.systemId).catch(() => null);
        out.push({ id, name: s.name, systemId: s.systemId, system: sys?.name ?? '', security: sys?.security ?? null, ...(s.typeId != null ? { typeId: s.typeId } : {}) });
      }
      setFound(out);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
    finally { setBusy(false); }
  };
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="num" placeholder="Find it by name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void find(); }} style={{ width: 220, maxWidth: '100%' }} aria-label={label} />
        <button type="button" className="btn sm" disabled={busy} onClick={() => void find()}>{busy ? 'Searching…' : 'Find'}</button>
        {picked && <span className="note small" style={{ margin: 0 }}>At {picked}</span>}
      </div>
      {found && (found.length ? (
        <div className="col" style={{ gap: 2 }}>
          {found.map((f) => (
            <button key={f.id} type="button" className="link-btn" style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={() => { onPick(f); setFound(null); setQ(''); }}>
              {f.name} <span className="faint">· {f.system}{f.security != null ? ` ${f.security.toFixed(1)}` : ''} · {describe(f)}</span>
            </button>
          ))}
        </div>
      ) : <p className="note small" style={{ margin: 0 }}>No structure you can see by that name.</p>)}
    </div>
  );
}
```

In `src/components/Reprocess.tsx`: delete the local `FindStructure` (its doc comment and function, lines 247–296),
import `{ FindStructure }` from `'./FindStructure'`, delete the line `import { structureInfo, system } from '../lib/universe';`
and take `getAuth` out of `import { getAuth, hasScope } from '../lib/auth';` (both were the local component's alone;
`tsc` names them otherwise), and change its one use to:

```tsx
                {hasScope(SCOPE.search) && <FindStructure onPick={(f) => setPlace({ ...place, ...siteFromStructure(f.typeId, f.security), name: f.name })} picked={place.name}
                  describe={(f) => { const k = siteFromStructure(f.typeId, f.security).structure; return k === 'other' ? 'not a refinery' : k === 'tatara' ? 'Tatara' : 'Athanor'; }} />}
```

What Reprocessing shows is unchanged: the same list, the same words, the same refinery and band.

- [ ] **Step 7: Where you build, in the Build section**

Create `src/components/hustles/IndustrySites.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Building2, ChevronRight, Factory, Truck } from 'lucide-react';
import { hasScope } from '../../lib/auth';
import { SCOPE } from '../../lib/config';
import { iskBig, pct } from '../../lib/format';
import { KIND_SAID, kindOfType, type Indexed, type SiteKind } from '../../lib/industry';
import { NEAR_JITA_JUMPS } from '../../lib/industryRank';
import { FREIGHT_PRESETS, HOME_SYSTEMS, homeSite, JITA_SYSTEM, quietStations, rigsFitting, routeBetween, siteFacts, stationSite, structureSite } from '../../lib/industrySites';
import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
import { MAX_ROUTES, MAX_SITES, type FreightRoute, type IndustrySite } from '../../lib/prefs';
import { Points } from '../Facts';
import { FindStructure } from '../FindStructure';
import { NumChip, Seg, Th } from '../ui';
import type { IndustryChar } from './industryChars';
import { useIndices, useIndustryDoc, useStationNames } from './industryMarket';

/**
 * Where you build (docs/notes/industry.md): the build sites in the synced `industry` doc, each with what's known of it
 * (its system, band, jumps from Jita, ESI's index) and what's yours to type (a structure's kind, rigs and facility tax);
 * three ways to add one (a quiet NPC station near Jita, a structure found by name, a home typed by you); and freight
 * routes between sites and markets, Brave Freight's offered as presets and none used until picked.
 */
const STRUCTURE_KINDS: SiteKind[] = ['raitaru', 'azbel', 'sotiyo', 'astrahus', 'fortizar', 'keepstar', 'other'];
/** A kind as a choice in a list: short, since a select is as wide as its longest option. */
const KIND_PICK: Record<SiteKind, string> = { npc: 'NPC station', raitaru: 'Raitaru', azbel: 'Azbel', sotiyo: 'Sotiyo', astrahus: 'Astrahus', fortizar: 'Fortizar', keepstar: 'Keepstar', other: 'Other, no bonus' };
/** A rig's name without the "Standup " every engineering rig's name starts with. */
const rigName = (ix: Indexed, id: number) => (ix.b.types[id]?.[0] ?? `Rig #${id}`).replace(/^Standup /, '');
type Adding = 'near' | 'name' | 'home';

export function IndustrySites({ c, ix, graph, mainName }: { c: IndustryChar; ix: Indexed; graph: Graph; mainName: string }) {
  const [doc, setDoc] = useIndustryDoc();
  const indices = useIndices();
  const idx = indices.state === 'ok' ? indices.value : null;
  const jitaHigh = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC), [graph]);
  const [adding, setAdding] = useState<Adding>('near');
  const add = (s: IndustrySite) => {
    if (doc.sites.some((x) => x.id === s.id) || doc.sites.length >= MAX_SITES) return;
    setDoc({ sites: [...doc.sites, s], site: doc.site ?? s.id });
  };
  const change = (id: string, patch: Partial<IndustrySite>) => setDoc({ sites: doc.sites.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const remove = (id: string) => setDoc({ sites: doc.sites.filter((s) => s.id !== id), site: doc.site === id ? (doc.sites.find((s) => s.id !== id)?.id ?? null) : doc.site });
  const sysName = (id: number) => graph[id]?.[1] ?? `System #${id}`;

  return (
    <section className="col" style={{ gap: 12 }} aria-label="Where you build" data-industry="sites">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Where you build decides a job’s cost, how long it takes, and what it costs to reach a market.</p>
        <Points compact items={[
          { kind: 'info', icon: Building2, lead: 'An NPC station', text: 'charges a 0.25% facility tax and takes no rigs: what high-sec near Jita offers.' },
          { kind: 'good', icon: Factory, lead: 'An engineering complex', text: 'cuts a job’s time, materials and cost, and its rigs cut more; its owner sets the tax.' },
          { kind: 'warn', lead: 'Not in ESI', text: 'a structure’s tax and rigs: typed by you, and said wherever they’re used.' },
        ]} />
      </div>

      {doc.sites.length ? (
        <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
          <table className="tbl compact rd-table ind-sites" data-industry="site-list">
            <thead>
              <tr>
                <Th left>Site</Th>
                <Th left className="rd-wide">Where</Th>
                <Th left className="rd-wide" tip="An engineering complex (Raitaru, Azbel, Sotiyo) cuts time, materials and cost; a citadel takes rigs but has no role bonus.">Kind</Th>
                <Th left className="rd-wide" tip="Engineering rigs of the structure’s size, at most three. Each helps the products its group names, more in low-sec (×1.9) and null-sec (×2.1).">Rigs</Th>
                <Th className="rd-wide" tip="Set by a structure’s owner and shown in the game’s Industry window; an NPC station’s is 0.25% (EVE University). Not in ESI.">Facility tax</Th>
                <Th className="rd-wide" tip="ESI’s manufacturing cost index for the system, read hourly: the busier the system, the dearer a job.">Index</Th>
              </tr>
            </thead>
            <tbody>
              {doc.sites.map((s) => {
                const f = siteFacts(s, graph, jitaHigh, idx);
                const where = `${f.system ?? sysName(s.systemId)}${f.security != null ? ` ${f.security.toFixed(1)}` : ''} · ${f.jitaJumps != null ? `${f.jitaJumps} high-sec jump${f.jitaJumps === 1 ? '' : 's'} from Jita` : 'no high-sec route from Jita'}`;
                const kind = s.kind === 'npc' ? (s.lab ? 'NPC station with a Laboratory' : 'NPC station') : KIND_SAID[s.kind];
                const tax = f.tax != null ? `${pct(f.tax)}${s.kind === 'npc' ? '' : ' typed by you'}` : '–: type it from the Industry window';
                const index = f.index ? pct(f.index.manufacturing) : f.indexWhy;
                const fitting = rigsFitting(ix, s.kind).filter((r) => !s.rigs.includes(r[0]));
                return (
                  <tr key={s.id} data-site={s.id}>
                    <td className="l rd-main">
                      <span className="nm">{s.name}</span>
                      <span className="ind-acts">
                        {doc.site === s.id ? <span className="ind-default">Default</span>
                          : <button type="button" className="link-btn" onClick={() => setDoc({ site: s.id })}>Make it the default</button>}
                        <button type="button" className="link-btn" onClick={() => remove(s.id)}>Remove</button>
                      </span>
                      {!s.structureId && s.kind !== 'npc' && <span className="sub">Typed by you: with no structure ID, the app knows nothing held there.</span>}
                      <span className="rd-phone"><span>{where}</span><span>{kind}</span><span>Tax: {tax}</span><span>Index: {index}</span></span>
                    </td>
                    <td className="l rd-wide">{where}</td>
                    <td className="l rd-wide">
                      {s.kind === 'npc' ? kind : (
                        <select className="ind-sel" aria-label={`Kind of ${s.name}`} value={s.kind} onChange={(e) => change(s.id, { kind: e.target.value as SiteKind, rigs: [] })}>
                          {STRUCTURE_KINDS.map((k) => <option key={k} value={k}>{KIND_PICK[k]}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="l rd-wide ind-rigs">
                      {s.kind === 'npc' ? 'none' : (
                        <span className="col" style={{ gap: 4 }}>
                          {s.rigs.map((r) => (
                            <span key={r} className="ind-rig">{rigName(ix, r)}
                              <button type="button" className="link-btn" aria-label={`Take off ${rigName(ix, r)}`} onClick={() => change(s.id, { rigs: s.rigs.filter((x) => x !== r) })}>×</button>
                            </span>
                          ))}
                          {s.rigs.length < 3 && fitting.length > 0 && (
                            <select className="ind-sel" aria-label={`Add a rig to ${s.name}`} value="" onChange={(e) => change(s.id, { rigs: [...s.rigs, Number(e.target.value)] })}>
                              <option value="">Add a rig…</option>
                              {fitting.map((r) => <option key={r[0]} value={r[0]}>{rigName(ix, r[0])}</option>)}
                            </select>
                          )}
                          {!fitting.length && !s.rigs.length && <span className="faint">takes no rigs the app knows</span>}
                        </span>
                      )}
                    </td>
                    <td className="rd-wide">
                      {s.kind === 'npc' ? tax : (
                        <NumChip label="Facility tax" hideLabel percent width={60} value={s.tax != null ? +(s.tax * 100).toFixed(4) : null} placeholder="–"
                          onChange={(n) => change(s.id, { tax: n == null ? null : n / 100 })} tip={s.tax == null ? 'Not typed: the finder ranks before it and says what each 1% costs a day.' : 'Typed by you.'} />
                      )}
                    </td>
                    <td className="rd-wide">{index}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="note small" style={{ margin: 0 }}>No build sites yet: add a quiet station near Jita, a structure you can see, or your home.</p>}

      {doc.sites.length < MAX_SITES ? (
        <div className="col" style={{ gap: 10 }} data-industry="add-site">
          <Seg size="sm" label="Add a site" value={adding} onChange={setAdding}
            options={[{ v: 'near', label: 'A station near Jita' }, { v: 'name', label: 'A structure by name' }, { v: 'home', label: 'Home' }]} />
          {adding === 'near' && <NearJita ix={ix} graph={graph} indices={indices} sites={doc.sites} add={add} />}
          {adding === 'name' && (hasScope(SCOPE.search) && hasScope(SCOPE.structures) ? (
            <div className="col" style={{ gap: 6 }}>
              <FindStructure label="Find a structure to build in by name" onPick={(f) => add(structureSite(f))}
                describe={(f) => { const k = kindOfType(f.typeId); return k === 'other' ? 'no manufacturing bonus the app knows' : KIND_SAID[k]; }} />
              <p className="note small" style={{ margin: 0 }}>Searches as {c.isMain ? 'you' : mainName}: the structures EVE lets {c.isMain ? 'you' : mainName} see.{c.isMain ? '' : ` ${c.name}’s own aren’t searched here.`}</p>
            </div>
          ) : <p className="note small" style={{ margin: 0 }}>Log in again: finding a structure by name needs EVE’s permission to search structures.</p>)}
          {adding === 'home' && <AddHome graph={graph} sites={doc.sites} add={add} />}
        </div>
      ) : <p className="note small" style={{ margin: 0 }}>{MAX_SITES} sites is the most kept: remove one to add another.</p>}

      <Freight graph={graph} routes={doc.freight} setRoutes={(freight) => setDoc({ freight })} />
    </section>
  );
}

/** The quietest high-sec NPC stations within NEAR_JITA_JUMPS of Jita, with a Factory or with a Laboratory, each with its index. */
function NearJita({ ix, graph, indices, sites, add }: { ix: Indexed; graph: Graph; indices: ReturnType<typeof useIndices>; sites: IndustrySite[]; add: (s: IndustrySite) => void }) {
  const [lab, setLab] = useState(false);
  const list = useMemo(() => (indices.state === 'ok' ? quietStations(ix.b.stations, graph, indices.value, { maxJumps: NEAR_JITA_JUMPS, need: lab ? 'lab' : 'factory', limit: 6 }) : []), [ix, graph, indices, lab]);
  const names = useStationNames(list.map((x) => x.stationId));
  if (indices.state === 'loading') return <p className="note small" style={{ margin: 0 }}>Reading the industry indices…</p>;
  if (indices.state === 'failed') return <p className="note small" style={{ margin: 0 }}>Couldn’t read ESI’s industry indices just now. <button type="button" className="link-btn" onClick={indices.retry}>Try again</button></p>;
  return (
    <div className="col" style={{ gap: 6 }} data-industry="near-jita">
      <p className="note small" style={{ margin: 0 }}>The quietest high-sec stations within {NEAR_JITA_JUMPS} jumps of Jita: a lower index is a cheaper job.</p>
      <Seg size="sm" label="Station services" value={lab ? 'lab' : 'factory'} onChange={(v) => setLab(v === 'lab')}
        options={[{ v: 'factory', label: 'With a Factory', tip: 'For building: 2,259 NPC stations have one.' }, { v: 'lab', label: 'With a Laboratory', tip: 'For research, copying and invention: only 510 NPC stations have one.' }]} />
      {list.length ? list.map((p) => {
        const id = `npc:${p.stationId}`, have = sites.some((s) => s.id === id), name = names[p.stationId] ?? `Station #${p.stationId}`;
        return (
          <div key={p.stationId} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span className="nm">{name}</span>
            <span className="faint">{p.system} {p.security.toFixed(1)} · {p.jumps} jump{p.jumps === 1 ? '' : 's'} · {lab ? 'ME research' : 'manufacturing'} index {pct(p.index)}{p.lab && !lab ? ' · has a Laboratory' : ''}</span>
            {have ? <span className="faint">Added</span> : <button type="button" className="btn sm" onClick={() => add(stationSite(p, name))}>Add</button>}
          </div>
        );
      }) : <p className="note small" style={{ margin: 0 }}>No station with {lab ? 'a Laboratory' : 'a Factory'} within {NEAR_JITA_JUMPS} high-sec jumps has an index ESI lists.</p>}
    </div>
  );
}

/** A home typed by you: a system (UALX-3 offered first) and the kind of structure you'd build in there. */
function AddHome({ graph, sites, add }: { graph: Graph; sites: IndustrySite[]; add: (s: IndustrySite) => void }) {
  const [system, setSystem] = useState<number>(HOME_SYSTEMS[0].systemId);
  const [typed, setTyped] = useState('');
  const [kind, setKind] = useState<SiteKind>('azbel');
  const found = typed.trim() ? Object.entries(graph).find(([, v]) => v[1].toLowerCase() === typed.trim().toLowerCase()) : null;
  const pick = typed.trim() ? (found ? Number(found[0]) : null) : system;
  const have = pick != null && sites.some((s) => s.id === `home:${pick}`);
  return (
    <div className="col" style={{ gap: 8 }} data-industry="add-home">
      <Seg size="sm" label="Home system" value={typed.trim() ? 0 : system} onChange={(v) => { setSystem(v); setTyped(''); }}
        options={[...HOME_SYSTEMS.map((h) => ({ v: h.systemId, label: h.name })), ...(typed.trim() ? [{ v: 0, label: 'Typed' }] : [])]} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="num" style={{ width: 160 }} placeholder="Or a system’s name" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="A home system by name" />
        <select className="ind-sel" aria-label="Kind of structure" value={kind} onChange={(e) => setKind(e.target.value as SiteKind)}>
          {STRUCTURE_KINDS.map((k) => <option key={k} value={k}>{KIND_PICK[k]}</option>)}
        </select>
        <button type="button" className="btn sm" disabled={pick == null || have} onClick={() => pick != null && add(homeSite(pick, graph[pick]?.[1] ?? `System #${pick}`, kind))}>{have ? 'Added' : 'Add'}</button>
      </div>
      {typed.trim() && !found && <p className="note small" style={{ margin: 0 }}>No system by that name on the map.</p>}
      <p className="note small" style={{ margin: 0 }}>Typed by you: a home with no structure ID holds nothing the app can read, and its tax and rigs are yours to type.</p>
    </div>
  );
}

/** Freight routes: Brave Freight's offered with their source, typed ones kept, none used until it's in this list. */
function Freight({ graph, routes, setRoutes }: { graph: Graph; routes: FreightRoute[]; setRoutes: (r: FreightRoute[]) => void }) {
  const [open, setOpen] = useState(routes.length > 0);
  const [a, setA] = useState(''), [b, setB] = useState('');
  const [perM3, setPerM3] = useState<number | null>(null), [coll, setColl] = useState<number | null>(null), [min, setMin] = useState<number | null>(null);
  const sys = (name: string) => { const e = Object.entries(graph).find(([, v]) => v[1].toLowerCase() === name.trim().toLowerCase()); return e ? Number(e[0]) : null; };
  const name = (id: number) => graph[id]?.[1] ?? `System #${id}`;
  const add = (r: FreightRoute) => { if (routes.length < MAX_ROUTES && !routes.some((x) => x.id === r.id)) setRoutes([...routes, r]); };
  const sa = sys(a), sb = sys(b);
  const said = (r: FreightRoute) => `${r.perM3.toLocaleString('en-US')} ISK a m³${r.collateral ? `, ${pct(r.collateral)} of the goods’ value` : ''}, ${r.min != null ? `${iskBig(r.min)} minimum` : 'no minimum stated'}`;
  return (
    <div className="col" style={{ gap: 8 }} data-industry="freight">
      <button type="button" className="panel-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight className="chev" aria-hidden="true" /><span className="panel-title"><Truck aria-hidden="true" /> Freight</span>
      </button>
      {open && (
        <>
          <p className="note small" style={{ margin: 0 }}>What a hauler charges between two systems: ISK a m³ of packaged volume, a share of the goods’ value, a minimum a contract. None is used until it’s listed here; from a high-sec station within {NEAR_JITA_JUMPS} jumps of Jita you carry it yourself, for no ISK.</p>
          {routes.map((r) => (
            <div key={r.id} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }} data-route={r.id}>
              <span className="nm">{r.name}</span><span className="faint">{said(r)}{r.source ? ` · ${r.source}` : ' · typed by you'}</span>
              <button type="button" className="link-btn" onClick={() => setRoutes(routes.filter((x) => x.id !== r.id))}>Remove</button>
            </div>
          ))}
          {FREIGHT_PRESETS.filter((p) => !routeBetween(routes, p.a, p.b)).map((p) => (
            <div key={p.id} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>{p.name}</span><span className="faint">{said(p)} · {p.source}</span>
              <button type="button" className="btn sm" onClick={() => add(p)}>Use it</button>
            </div>
          ))}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }} data-industry="route-form">
            <input className="num" style={{ width: 120 }} placeholder="From" value={a} onChange={(e) => setA(e.target.value)} aria-label="Route from (a system)" />
            <input className="num" style={{ width: 120 }} placeholder="To" value={b} onChange={(e) => setB(e.target.value)} aria-label="Route to (a system)" />
            <NumChip label="ISK a m³" width={70} value={perM3} onChange={setPerM3} />
            <NumChip label="Of the value" percent width={50} value={coll} onChange={setColl} />
            <NumChip label="Minimum" width={90} value={min} onChange={setMin} placeholder="none" />
            <button type="button" className="btn sm" disabled={sa == null || sb == null || sa === sb || perM3 == null}
              onClick={() => { add({ id: `typed:${sa}:${sb}`, name: `${name(sa!)} ↔ ${name(sb!)}`, a: sa!, b: sb!, perM3: perM3!, collateral: (coll ?? 0) / 100, min, source: null }); setA(''); setB(''); }}>Add a route</button>
          </div>
          {(a.trim() && sa == null) || (b.trim() && sb == null) ? <p className="note small" style={{ margin: 0 }}>No system by that name on the map.</p> : null}
        </>
      )}
    </div>
  );
}
```

In `src/styles.css`, after Task 4A's `.ind-head` rule:

```css
/* The sites' table (IndustrySites.tsx): short selects (a select is as wide as its longest option), and cells that wrap, since
   a site's note and its rigs' names would otherwise run it past the page at 1,440 (gotchas.md: table cells don't wrap). */
.ind-sel { max-width: 170px; height: 30px; padding: 0 6px; background: var(--field); border: 1px solid rgba(130, 185, 225, .18); }
.ind-rigs { white-space: normal; min-width: 180px; }
.ind-rig { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--body); }
.ind-acts { display: flex; gap: 12px; align-items: baseline; margin-top: 2px; }
.ind-default { font-family: var(--f-head); font-size: 11px; letter-spacing: .06em; color: var(--acc); }
.ind-sites td { white-space: normal; vertical-align: top; }
.ind-sites td.rd-main { min-width: 220px; }
```

(Drafted, the table ran 474 px past the page at 1,440: the "Add a rig" select was as wide as "Standup L-Set Equipment
Manufacturing Efficiency I" and the site's note didn't wrap. These rules, the rig names without "Standup ", and Remove
folded under the site's name bring it inside; the page check below fails if it scrolls sideways again.)

On a phone each site folds under its name (where, kind, tax, index); its kind, rigs and tax are edited at desktop width.

Create `src/components/hustles/IndustryBuild.tsx` (Task 5B puts the finder above the sites):

```tsx
import type { Indexed } from '../../lib/industry';
import type { Graph } from '../../lib/jumps';
import type { IndustryChar } from './industryChars';
import { IndustrySites } from './IndustrySites';

/** Build (docs/notes/industry.md): what pays at your build site (the finder, from Task 5B), and where you build. */
export function IndustryBuild({ c, ix, graph, mainName }: { c: IndustryChar; ix: Indexed; graph: Graph; mainName: string }) {
  return (
    <section className="col" style={{ gap: 16 }} aria-label="Build" data-industry="build">
      <IndustrySites c={c} ix={ix} graph={graph} mainName={mainName} />
    </section>
  );
}
```

In `src/components/hustles/Industry.tsx`:
- `SECTIONS` gains, after Start: `{ key: 'build', label: 'Build', tip: 'What pays at your build site, and where you build' },`.
- Import `loadGraph` (from `./industryBundle`), `IndustryBuild` and `type Graph` (from `'../../lib/jumps'`); load the map
  beside the bundle:

  ```tsx
  const [graph, setGraph] = useState<Graph | 'failed' | null>(null);
  ```

  and in the same effect `loadGraph().then((g) => { if (alive) setGraph(g); }, () => { if (alive) setGraph('failed'); });`
  (the Try again button resets both: `setIx(null); setGraph(null); setTries(…)`).
- The failure line names what failed: `Couldn’t load {ix === 'failed' ? 'the blueprints' : 'the stargate map'} just now.`
  with Try again; loading: `Loading the blueprints and the map…`.
- Render `{section === 'build' && <IndustryBuild key={shown.charId} c={shown} ix={ix} graph={graph} mainName={main.name} />}`
  under the Start line, inside the `PilotProvider`, once both are loaded.

Run: `npm run check && npm run build`
Expected: all pass.

- [ ] **Step 8: The page case: sites**

In `scripts/pages.mjs`, at the top add `import fs from 'node:fs';` (if it isn't there) and, inside the industry case,
before `await page.goto(SEED_PAGE);`, give ESI its answers for this task:

```js
    const FX = JSON.parse(fs.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8'));
    ESI['/industry/systems/'] = (url, req, json) => json(FX.systems);
    ESI['/universe/names/'] = (url, req, json) => json(JSON.parse(req.postData() ?? '[]').map((id) => ({ id, name: `Station ${id}`, category: 'station' })));
```

Then insert above `// --- the end of the industry case`:

```js
    // --- Build: where you build (Task 4B).
    await page.goto(`${BASE}#hustles/industry/build`);
    await page.waitForSelector('[data-industry="sites"]', { timeout: 20_000 }).catch(() => problems.push('Where you build never drew'));
    if (!(await text('[data-industry="sites"]')).includes('No build sites yet: add a quiet station near Jita, a structure you can see, or your home.')) problems.push('no sites, and it doesn’t say how to add one');
    // A quiet station: ESI's indices of 10 October 2026, Itamo's 3.94% the quietest within 10 jumps.
    await page.waitForSelector('[data-industry="near-jita"] button', { timeout: 15_000 }).catch(() => problems.push('the quiet stations never listed'));
    const nearText = await text('[data-industry="near-jita"]');
    if (!nearText.includes('Itamo 0.7 · 2 jumps · manufacturing index 3.94%')) problems.push(`the quietest station isn’t Itamo at 3.94%: “${nearText.slice(0, 200)}”`);
    await page.locator('[data-industry="near-jita"] button', { hasText: 'Add' }).first().click();
    await page.waitForTimeout(400);
    const st = await text('[data-industry="site-list"]');
    for (const t of ['Default', '2 high-sec jumps from Jita', '0.25%', '3.94%']) if (!st.includes(t)) problems.push(`the station site doesn’t say “${t}”: “${st.slice(0, 240)}”`);
    await page.locator('[aria-label="Station services"] button', { hasText: 'With a Laboratory' }).click();
    await page.waitForTimeout(300);
    if (!(await text('[data-industry="near-jita"]')).includes('Sobaseki 0.8 · 1 jump · ME research index 16.41%')) problems.push('with a Laboratory, Sobaseki isn’t offered at its 16.41% ME research index');
    // A home typed by you: UALX-3, an Azbel, no tax typed, then 1% typed and an L-Set rig.
    await page.locator('[aria-label="Add a site"] button', { hasText: 'Home' }).click();
    await page.locator('[data-industry="add-home"] button', { hasText: 'Add' }).click();
    await page.waitForTimeout(400);
    const homeRow = () => text('[data-site="home:30004807"]');
    for (const t of ['Home in UALX-3', 'no high-sec route from Jita', '6.12%', 'Typed by you: with no structure ID, the app knows nothing held there.']) if (!(await homeRow()).includes(t)) problems.push(`the home site doesn’t say “${t}”`);
    if (!PHONE && !(await page.locator('[data-site="home:30004807"] input[placeholder="–"]').count())) problems.push('the home’s tax isn’t an empty box (it must never read 0%)');
    if (PHONE && !(await homeRow()).includes('Tax: –: type it from the Industry window')) problems.push('on a phone, the home’s tax doesn’t say it isn’t typed');
    if (!PHONE) {
      await page.locator('[data-site="home:30004807"] .chip input').fill('1');
      await page.locator('[data-site="home:30004807"] select[aria-label^="Add a rig"]').selectOption({ label: 'L-Set Equipment Manufacturing Efficiency I' });
      await page.waitForTimeout(400);
      if (!(await homeRow()).includes('L-Set Equipment Manufacturing Efficiency I')) problems.push('the rig picked isn’t on the home site');
      await page.reload();
      // From Task 5B the panel opens shut once sites exist: open it.
      await page.waitForSelector('[data-industry="build"]', { timeout: 20_000 });
      if (!(await page.locator('[data-industry="sites"]').isVisible().catch(() => false))) await page.locator('button.panel-toggle', { hasText: 'Where you build' }).click();
      await page.waitForSelector('[data-site="home:30004807"]', { timeout: 20_000 });
      if ((await page.locator('[data-site="home:30004807"] .chip input').inputValue().catch(() => '')) !== '1') problems.push('the home’s typed 1% tax wasn’t kept');
    }
    // By name: the stand-in login has no search permission.
    await page.locator('[aria-label="Add a site"] button', { hasText: 'A structure by name' }).click();
    if (!(await text('[data-industry="add-site"]')).includes('Log in again: finding a structure by name needs EVE’s permission to search structures.')) problems.push('finding a structure without the permission doesn’t say to log in again');
    // Freight: Brave Freight's preset, used.
    await page.locator('[data-industry="freight"] .panel-toggle').click();
    await page.locator('[data-industry="freight"] button', { hasText: 'Use it' }).first().click();
    await page.waitForTimeout(300);
    const fr = await text('[data-route="brave-jita-ualx"]');
    if (!fr.includes('900 ISK a m³, 0.79% of the goods’ value, 5 M ISK minimum · Brave wiki, 3 June 2026')) problems.push(`Brave Freight’s route doesn’t read as published: “${fr}”`);
    const siteFit = await sideways(page, '[data-industry="sites"] .tbl-scroll');
    if (!PHONE && siteFit && siteFit.over > 0) problems.push(`the sites table scrolls sideways at 1,440 (${siteFit.over} px)`);
    if (SHOTS) { await page.locator('[data-industry="sites"]').scrollIntoViewIfNeeded().catch(() => undefined); await page.screenshot({ path: `${SHOTS}-industry-sites.png` }); }
```

Run: `LEDGER=industry PAGE=hustles/industry npm run check-pages` and the same with `check-phone`.
Expected: `ok   industry …` at both widths. Plant `tax: site.tax ?? 0` in `siteFacts`: at 390 the case fails with "on a phone, the home's tax doesn't say it isn't
typed"; undo. Take `.ind-sites td { white-space: normal; … }` out of styles.css: at 1,440 it fails with "the sites
table scrolls sideways"; put it back.

- [ ] **Step 9: A look in a browser**

Run the case with `SHOTS=.playwright-mcp/industry/4b` at both widths and look: the sites table at 1,440 (Where, Kind,
Rigs, Facility tax, Index columns; the default chip), each site folded under its name on a phone; the Add switch, the
quiet stations with their indices, the home form, the freight presets with their sources. In `npm run dev`, check
Reprocessing still finds a structure by name and reads it as before (with a login holding the search permission).

- [ ] **Step 10: The notes**

Append to `docs/notes/industry.md`:

```markdown
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
```

In `docs/notes/loyalty-hustles.md`, in the Reprocessing bullet's "Where you refine can be found by name (`FindStructure`,
…)" sentence, add: "(now `components/FindStructure.tsx`, shared with the Industry tab's build sites, 10 October 2026)".

- [ ] **Step 11: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add src/lib/industrySites.ts src/lib/market.ts src/components/FindStructure.tsx src/components/Reprocess.tsx \
  src/components/hustles/industryMarket.ts src/components/hustles/IndustrySites.tsx src/components/hustles/IndustryBuild.tsx \
  src/components/hustles/Industry.tsx scripts/check.mjs scripts/pages.mjs docs/notes/industry.md docs/notes/loyalty-hustles.md
git commit -m "$(cat <<'MSG'
Industry: build sites, freight routes, and FindStructure shared with Reprocessing

What was missing: the finder works for a site (spec 2026-10-10-industry-design.md, "Build sites"), and the user will
build both near Jita and at a home they can't dock in yet.

What it is: the Build section's "Where you build". A quiet NPC station within 10 high-sec jumps of Jita, by ESI's
manufacturing index (or its ME research index, for a Laboratory: 510 stations have one); a structure found by name,
FindStructure moved out of Reprocess.tsx to hand back the structure itself; or a home typed by you, UALX-3 first. Each
site says its band, its jumps from Jita and its index; a structure's kind, rigs (of its size) and tax are typed, and a
tax not typed stays empty, never 0%. Freight routes: Brave Freight's three as presets with their source, none used until
picked, and typed ones.

Tests: the quietest stations on ESI's indices of 10 October 2026 (Itamo 3.94% first; Sobaseki for a Laboratory), the
nearest lab, a site's facts, each leg to a market, the presets, the rigs each structure takes; the page case adds a
station, a home with its tax and a rig kept across a reload, and Brave Freight. Busiest first, research everywhere and
an untyped tax read as 0 each failed a check.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
MSG
)"
```

---
### Task 5A: The scan's watch set, the NPC row, and every scan reader leaving watch-only rows out

**Files:**
- Create: `worker/migrations/0018_industry_npc.sql`, `worker/src/industryNpc.ts`
- Modify: `worker/tsconfig.json` (`resolveJsonModule`), `worker/src/scan.ts`, `worker/src/index.ts` (the route),
  `worker/src/alerts.ts` (`scanNotes`, `opportunities`), `src/lib/types.ts` (`ProspectStats.watchOnly`),
  `src/lib/evaluate.ts` (`judgeProspect`), `src/lib/snipe.ts` (`findListing`, `findBid`, `SnipeStats`),
  `src/lib/arbitrage.ts` (`scanBusiest`), `src/components/Arbitrage.tsx`, `scripts/check.mjs`, `scripts/check-worker.mjs`,
  `scripts/pages.mjs` (`planScan`, `PLAN_PROOF`), `docs/notes/industry.md`, `docs/notes/finding-trades.md`

**Interfaces:**
- Consumes: `src/data/industryTypes.json` (Task 1), `NpcRow` (Task 3).
- Produces:
  - `ProspectStats.watchOnly?: true` (types.ts).
  - `worker/src/industryNpc.ts`: `type BpoSellers`, `foldBpo(out, want, order)`, `npcRowOf(out, at, pagesFailed): NpcRow`,
    `saveNpcRow(db, run, row)`, `npcRows(db): Promise<{ complete: NpcRow | null; partial: NpcRow | null }>`.
  - `worker/src/scan.ts`: `type IndustryTypes = { watch: number[]; bpos: number[] }`, `foldPage(aggs, npc, orders, bpos?)`,
    `fullScan(db, now?, summarise?, industry = industryTypes.json)`, `ScanMeta.watchOnly?: number`.
  - `GET /v1/industry/npc` → `{ complete: NpcRow | null; partial: NpcRow | null }` (Task 5B reads it).
  - `src/lib/arbitrage.ts`: `scanBusiest(stats, books, n): number[]`.

**Why on the stats and not the book** (a correction to the spec, said in the note): `overScan` (evaluate.ts) rebuilds a
live book from the cloud's five-minute watch over the scan's and carries over only `npcSell`, `npcAnywhere` and
`sellsTo`, and `mergeLiveBooks` does that for every watched item, so a flag on the book would be lost the first time a
position or watchlist entry got the item watched. The stats are never replaced that way, and every reader the spec names
reads them: `judgeProspect` (Prospects, Busy markets, the planner, and through `pushWatch` the opportunity mail's `watch`
doc), the Sniper's finders (the Worker reads only the `stats` column), and Hub arbitrage's busiest.

**Ship-safety.** The migration only adds a table; the deploy workflow applies it before the Worker deploys. A browser a
version behind doesn't know `watchOnly` and would rank the new rows on Prospects until it reloads (minutes, the spec's
accepted cost); the opportunity mail reads the flag from D1 itself, so an old browser's `watch` doc can't get one mailed.
Nothing in the browser calls `/v1/industry/npc` until Task 5B.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 4B's section:

```js
console.log('\n--- a scan row read only for the Industry tab stays out of every trade finder (Task 5A) ---');
{
  const { judgeProspect } = await import('../src/lib/evaluate.ts');
  const { DEFAULT_FILTERS } = await import('../src/lib/prospects.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const S = await import('../src/lib/snipe.ts');
  const { scanBusiest } = await import('../src/lib/arbitrage.ts');
  const fsW = await import('node:fs');
  // Molecular Engineering as read on 2 October 2026 (scripts/fixtures/npc-anywhere.json): a clean prospect at the user's rates.
  const x = JSON.parse(fsW.readFileSync(new URL('./fixtures/npc-anywhere.json', import.meta.url), 'utf8')).items[11529];
  const settings = sanitizeSettings({ acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, target: 5, share: 7.5 });
  const filters = { ...DEFAULT_FILTERS, budget: 20e6, horizonDays: 14, minTrades: 5, minDays: 20, minRoi: 0.03, maxSpikiness: 0.5, busy: false, partial: false };
  eq('  Prospects (and Busy markets, the planner, the watch doc): a prospect as read, none when watch-only',
    [judgeProspect(x.stats, x.book, settings, filters, x.orders)?.typeId, judgeProspect({ ...x.stats, watchOnly: true }, x.book, settings, filters, x.orders)], [11529, null]);
  eq('    even judged with any return, as Busy markets is', judgeProspect({ ...x.stats, watchOnly: true }, x.book, settings, { ...filters, busy: true }, x.orders, true), null);
  // The Sniper: a mistake listing at 5 M under a market that trades at 10 M (invented for the test).
  const NOWS = Date.parse('2026-10-10T12:00:00Z');
  const sells = [{ id: 1, price: 5e6, units: 2, total: 2, issued: new Date(NOWS - 3600_000).toISOString() }, { id: 2, price: 10e6, units: 50, total: 50, issued: new Date(NOWS - 5 * 86400_000).toISOString() }];
  const s = { highs14: Array(14).fill(10e6), unitsPerDay: 100, daysTraded: 30, lastMove: 0 };
  const bid = { id: 9, price: 20e6, units: 5, minVolume: 1, issued: new Date(NOWS - 3600_000).toISOString() };
  eq('  the Sniper: the listing and the high bid found, and neither on a watch-only row',
    [S.findListing(1, sells, false, s, NOWS)?.units, S.findListing(1, sells, false, { ...s, watchOnly: true }, NOWS), S.findBid(1, bid, s)?.price, S.findBid(1, bid, { ...s, watchOnly: true })], [2, null, 20e6, null]);
  const st = (typeId, unitsPerDay, extra = {}) => ({ typeId, unitsPerDay, avgPrice: 1e6, ...extra });
  eq('  Hub arbitrage\'s busiest: by ISK traded a day, with a book, never a watch-only row however busy',
    scanBusiest({ 1: st(1, 100), 2: st(2, 900, { watchOnly: true }), 3: st(3, 50), 4: st(4, 70) }, { 1: {}, 2: {}, 3: {} }, 2), [1, 3]);
}
```

Add to `scripts/check-worker.mjs`, before its final line:

```js
console.log('\n--- the full scan reads the Industry tab\'s watch set, and keeps NPCs\' blueprint sellers (Task 5A) ---');
{
  const { fullScan } = await import('../worker/src/scan.ts');
  const { npcRows, saveNpcRow } = await import('../worker/src/industryNpc.ts');
  const JITA = 60003760, NOW = Date.parse('2026-10-10T11:30:00Z'), DAY = 86400_000;
  // Invented for the test. Tritanium (34) trades both ways at a wide spread: a candidate anyway, and in the watch set. Fried
  // Interface Circuit (25601) is listed in Jita and nobody bids: the gate leaves it out, the watch set reads it. Armor Plates
  // (25605) has no Jita order at all. 30000 trades both ways and isn't in the watch set. NPCs sell the pump's blueprint
  // (25895) at 1,250,000 in two stations and a dearer copy of it in a third; and another blueprint nobody asked about.
  const industry = { watch: [34, 25601, 25605], bpos: [25895] };
  let id = 1;
  const order = (t, location, buy, price, remain, duration = 90) => ({ order_id: id++, type_id: t, location_id: location, is_buy_order: buy, price, volume_remain: remain, volume_total: remain, duration, issued: '2026-10-10T09:00:00Z', min_volume: 1, range: 'region' });
  const book = [
    order(34, JITA, true, 3, 1e6), order(34, JITA, false, 4, 1e6),
    order(25601, JITA, false, 4200, 5000),
    order(30000, JITA, true, 90, 100), order(30000, JITA, false, 110, 100),
    order(25895, 60001, false, 1_250_000, 10, 365), order(25895, 60002, false, 1_250_000, 10, 365), order(25895, 60003, false, 1_300_000, 10, 365),
    order(25895, 60004, false, 900_000, 1, 90), order(999, 60001, false, 5_000_000, 10, 365),
  ];
  const hist = Array.from({ length: 30 }, (_, i) => ({ date: new Date(NOW - (i + 1) * DAY).toISOString().slice(0, 10), average: 100, highest: 110, lowest: 90, volume: 1000, order_count: 20 })).reverse();
  const db = d1();
  for (const t of [34, 25601, 25605, 30000]) db.run('INSERT INTO hist (type_id, expires, rows) VALUES (?, ?, ?)', t, NOW + DAY, JSON.stringify(hist));
  const f = stubFetch([['/markets/10000002/orders/', book], ['/markets/19000001/orders/', []]]);
  const meta = await fullScan(db, NOW, undefined, industry);
  f.restore();
  const row = (t) => { const r = db.rows('SELECT stats FROM scan_items WHERE type_id = ?', t)[0]; return r ? JSON.parse(r.stats) : null; };
  eq('  a candidate in the watch set is a candidate as before, not watch-only', [row(34)?.typeId, row(34)?.watchOnly], [34, undefined]);
  eq('  a material traded one way only, left out by the gate, is read for the tab and marked watch-only', [row(25601)?.typeId, row(25601)?.watchOnly], [25601, true]);
  eq('  one with no Jita order gets no row (the tab says "No Jita book this morning")', row(25605), null);
  eq('  a candidate outside the watch set is as before', [row(30000)?.typeId, row(30000)?.watchOnly], [30000, undefined]);
  eq('  the run counts the watch set it read', [meta.checked, meta.watchOnly], [3, 1]);
  const rows = await npcRows(db);
  eq('  NPCs\' sellers of the tab\'s blueprints: the lowest price and every station, cheapest first; a player\'s order and a blueprint not asked about left out',
    [rows.complete?.sellers, rows.complete?.complete, rows.complete?.pagesFailed, rows.partial], [{ 25895: [1_250_000, [60001, 60002, 60003]] }, true, 0, null]);
  // What D1 keeps: the latest complete read, and a newer partial one beside it, and only those.
  const at = (t) => new Date(t).toISOString();
  const keep = d1();
  await saveNpcRow(keep, 1, { at: at(1000), complete: true, pagesFailed: 0, sellers: { 1: [10, [60001]] } });
  await saveNpcRow(keep, 2, { at: at(2000), complete: false, pagesFailed: 3, sellers: { 2: [20, [60002]] } });
  const both = await npcRows(keep);
  eq('  a partial read after a complete one: both kept, the partial\'s missed pages said', [both.complete?.sellers, both.partial?.sellers, both.partial?.pagesFailed], [{ 1: [10, [60001]] }, { 2: [20, [60002]] }, 3]);
  await saveNpcRow(keep, 3, { at: at(3000), complete: false, pagesFailed: 1, sellers: { 3: [30, [60003]] } });
  eq('    another partial one replaces the older partial', [keep.rows('SELECT run FROM industry_npc ORDER BY run').map((r) => r.run), (await npcRows(keep)).partial?.sellers], [[1, 3], { 3: [30, [60003]] }]);
  await saveNpcRow(keep, 4, { at: at(4000), complete: true, pagesFailed: 0, sellers: { 4: [40, [60004]] } });
  eq('    a complete read drops every older row', [keep.rows('SELECT run FROM industry_npc ORDER BY run').map((r) => r.run), (await npcRows(keep)).partial], [[4], null]);
  eq('  before any run: nothing, and nothing claimed', await npcRows(d1()), { complete: null, partial: null });
}
```

and, at the end of the existing block "the opportunity mail leaves out whatever NPCs sell anywhere in The Forge", after
its last `eq`:

```js
  // A browser a version behind doesn't know the flag and can still put a watch-only type in its watch doc: the mail reads
  // the flag from the scan's own row in D1 and leaves it out.
  const wdb = ledger(x.book);
  wdb.run('UPDATE scan_items SET stats = ? WHERE type_id = ?', JSON.stringify({ ...x.stats, watchOnly: true }), MOLE);
  eq('  a watch-only scan row in the watch doc: not mailed', (await opportunities(wdb, MAIN, settings, NOW, false)).qualifying, []);
```

In `scripts/pages.mjs`' `planScan`, add a watch-only item priced like 990101, which would otherwise top Prospects and the
planner. In the doc comment's list:
`* - 990109: priced like 990101, but read by the cloud only for the Industry tab (\`watchOnly\` on its stats): never on Prospects, Busy markets or the planner.`
In `items`: `990109: [stats(990109, flat(1 * M), flat(1.4 * M), { ...trips([12, 26, 33, 40, 25]), watchOnly: true }), book(990109, 1 * M, 1.4 * M)],`;
in `sample.counts`: `990109: 60`; and in `PLAN_PROOF`, `absent` gains `'990109'` for both `prospects` and `planner`.

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -B1 -A3 "watch-only\|watch set"`
Expected: the pure section fails (judgeProspect prices the watch-only row, `scanBusiest` isn't a function); the Worker
section fails (`industryNpc.ts` missing). `LEDGER=large PAGE=prospects npm run check-pages` fails with "in the table, and
shouldn't be: “990109”".

- [ ] **Step 3: The table and the NPC row's keeper**

Create `worker/migrations/0018_industry_npc.sql`:

```sql
-- The morning scan's NPC sellers of every blueprint the Industry tab ranks (src/data/industryTypes.json `bpos`), with their
-- stations, whatever the scan's own candidate gate. A row per run: `data` is the sellers by blueprint, [lowest price,
-- [stations, cheapest first]]; `complete` is 1 when every page of The Forge was read, and `pages_failed` how many weren't.
-- Only the latest complete row and any newer partial one are kept (worker/src/industryNpc.ts).
-- Only adds a table: old code runs on it as before.
CREATE TABLE IF NOT EXISTS industry_npc (
  run INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  complete INTEGER NOT NULL,
  pages_failed INTEGER NOT NULL,
  data TEXT NOT NULL
);
```

Create `worker/src/industryNpc.ts`:

```ts
/**
 * Where NPCs sell the Industry tab's blueprints (docs/notes/industry.md). The morning scan reads every order in The Forge;
 * NPCs' sell orders run 365 days, so each blueprint the tab ranks is kept with its lowest NPC price and the stations
 * selling it, whatever the scan's candidate gate (which keeps only items traded both ways in Jita). One row a run in
 * `industry_npc`; D1 keeps the latest complete read and, beside it, any newer partial one, and only those two, so the
 * browser can say "NPCs don't sell it in The Forge" only after a read that missed no page.
 */
import type { NpcRow } from '../../src/lib/industryRank';

/** NPC sell orders of the blueprints asked for, by blueprint and station: the lowest price at each. */
export type BpoSellers = Map<number, Map<number, number>>;

/** One order into the fold, if it's an NPC's sell order (365 days) of a blueprint asked for. */
export function foldBpo(out: BpoSellers, want: ReadonlySet<number>, o: { type_id: number; location_id: number; price: number; is_buy_order: boolean; duration?: number }) {
  if (o.is_buy_order || (o.duration ?? 0) < 365 || !want.has(o.type_id)) return;
  let m = out.get(o.type_id);
  if (!m) out.set(o.type_id, (m = new Map()));
  const was = m.get(o.location_id);
  if (was == null || o.price < was) m.set(o.location_id, o.price);
}

/** The row kept: each blueprint's lowest NPC price and every station selling it, cheapest first, then by ID. Complete when no page failed. */
export function npcRowOf(out: BpoSellers, at: number, pagesFailed: number): NpcRow {
  const sellers: NpcRow['sellers'] = {};
  for (const [bp, st] of [...out].sort((a, b) => a[0] - b[0])) {
    const list = [...st].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    sellers[bp] = [list[0][1], list.map(([s]) => s)];
  }
  return { at: new Date(at).toISOString(), complete: pagesFailed === 0, pagesFailed, sellers };
}

/** Saves a run's row, then keeps only the latest complete row and, beside it, a newer partial one. */
export async function saveNpcRow(db: D1Database, run: number, row: NpcRow): Promise<void> {
  await db.batch([
    db.prepare(`INSERT INTO industry_npc (run, at, complete, pages_failed, data) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(run) DO UPDATE SET at = excluded.at, complete = excluded.complete, pages_failed = excluded.pages_failed, data = excluded.data`)
      .bind(run, Date.parse(row.at), row.complete ? 1 : 0, row.pagesFailed, JSON.stringify(row.sellers)),
    db.prepare(`DELETE FROM industry_npc WHERE run != ?1 AND (complete = 0 OR run < (SELECT MAX(run) FROM industry_npc WHERE complete = 1))`).bind(run),
  ]);
}

/** For `GET /v1/industry/npc`: the latest complete read, and a partial one only when it's newer. Nulls before any run. */
export async function npcRows(db: D1Database): Promise<{ complete: NpcRow | null; partial: NpcRow | null }> {
  const rows = (await db.prepare('SELECT run, at, complete, pages_failed, data FROM industry_npc ORDER BY run DESC')
    .all<{ run: number; at: number; complete: number; pages_failed: number; data: string }>()).results;
  const read = (r: (typeof rows)[number]): NpcRow => ({ at: new Date(r.at).toISOString(), complete: !!r.complete, pagesFailed: r.pages_failed, sellers: JSON.parse(r.data) });
  const complete = rows.find((r) => r.complete) ?? null;
  const partial = rows.find((r) => !r.complete && (!complete || r.run > complete.run)) ?? null;
  return { complete: complete ? read(complete) : null, partial: partial ? read(partial) : null };
}
```

Apply it to the local D1 (CLAUDE.md: the in-memory stand-in reads the migrations, `wrangler dev` needs this):
`npx wrangler d1 migrations apply jita-ledger --local` (from `worker/`).

- [ ] **Step 4: The scan reads the watch set and keeps the NPC row**

In `worker/tsconfig.json`, add `"resolveJsonModule": true` to `compilerOptions` (the Worker's first JSON import: Node's
type stripping in `npm run check` needs the `with { type: 'json' }` attribute below, and `tsc -p worker` needs this).

In `worker/src/scan.ts`:

1. Imports, after `import { noteRate } from './rate';`:

   ```ts
   import INDUSTRY from '../../src/data/industryTypes.json' with { type: 'json' };
   import { foldBpo, npcRowOf, saveNpcRow, type BpoSellers } from './industryNpc';
   ```

2. Replace `foldPage` with:

   ```ts
   /**
    * Every order on a page: Jita's into the item's book, NPC sellers anywhere into `npc`, and NPCs' sell orders of the Industry
    * tab's blueprints, by station, into `bpos`. Exported to measure the fold.
    */
   export function foldPage(aggs: Map<number, Agg>, npc: Map<number, number>, orders: RawOrder[], bpos?: { want: ReadonlySet<number>; out: BpoSellers }) {
     for (const o of orders) {
       foldNpc(npc, o);
       if (bpos) foldBpo(bpos.out, bpos.want, o);
       if (o.location_id === JITA_44) fold(aggs, o);
     }
   }

   /** The Industry tab's watch set and the blueprints whose NPC sellers it shows (src/data/industryTypes.json). */
   export type IndustryTypes = { watch: number[]; bpos: number[] };
   ```

3. `ScanMeta` gains, after `partial: boolean;`:

   ```ts
     /** Of `checked`, the Industry tab's watch set read only for it (`watchOnly` on their stats). Absent on runs before it. */
     watchOnly?: number;
   ```

4. `fullScan`'s signature becomes
   `export async function fullScan(db: D1Database, now = Date.now(), summarise = summaryOf, industry: IndustryTypes = INDUSTRY as IndustryTypes): Promise<ScanMeta> {`;
   beside `const npc = new Map<number, number>();` add `const bpos = { want: new Set(industry.bpos), out: new Map() as BpoSellers };`,
   and both `foldPage(…)` calls pass `bpos` as their fourth argument.

5. After the PLEX `try { … } catch { /* PLEX left out today */ }`, move `const run = started;` up to here and save the row:

   ```ts
     const run = started;
     // The Industry tab's NPC sellers of every blueprint it ranks, whatever the gate below: saved even when the history stops at
     // the time budget, since the pages are all read by now (or the row says how many weren't).
     await saveNpcRow(db, run, npcRowOf(bpos.out, now, pagesFailed)).catch((e) => console.error('industry npc row failed', e));
   ```

   (and delete the `const run = started;` line that followed `.slice(0, HISTORY_CAP);`).

6. After `.slice(0, HISTORY_CAP);`:

   ```ts
     // The Industry tab's watch set (every Tech I product and its materials) with a Jita book, whatever the gate above (traded
     // one way only, or NPC-sold in Jita): read for the tab and marked `watchOnly` on their stats, so Prospects, Busy markets,
     // the planner, the opportunity mail, the Sniper and Hub arbitrage leave them out. One with no Jita order gets no row.
     const natural = new Set(candidates);
     const watchOnly = new Set(industry.watch.filter((t) => aggs.has(t) && !natural.has(t)));
     const all = [...candidates, ...watchOnly];
   ```

   and every later `candidates` in `fullScan` becomes `all` (the three `progress(…, candidates.length)` calls and
   `eachHistory(db, candidates, …)`); in the history callback, after `if (!stats || !a) { … return; }`, add
   `if (watchOnly.has(t)) stats.watchOnly = true;`; and the meta's `checked: candidates.length` becomes
   `checked: all.length` with `watchOnly: watchOnly.size` beside `partial`.

In `worker/src/index.ts`, import `{ npcRows }` from `'./industryNpc'` and add, beside the Abyss Tracker routes:

```ts
      // The Industry tab's NPC sellers of every blueprint it ranks, from the morning scan (industryNpc.ts).
      if (url.pathname === '/v1/industry/npc' && request.method === 'GET') return json(await npcRows(env.DB), 200, c);
```

- [ ] **Step 5: Every reader of the scan leaves them out**

`src/lib/types.ts`, at the end of `ProspectStats`:

```ts
  /**
   * Read by the cloud's scan only for the Industry tab's watch set (src/data/industryTypes.json): a product or material the
   * candidate gate would have left out. Prospects, Busy markets, the planner, the opportunity mail, the Sniper and Hub
   * arbitrage leave it out; on the stats, not the book, since a live book from the watch replaces the scan's (overScan).
   */
  watchOnly?: true;
```

`src/lib/evaluate.ts`, first lines of `judgeProspect`'s body:

```ts
  // Read by the cloud's scan only for the Industry tab (industryTypes.json): never a prospect, whichever page asks.
  if (stats.watchOnly) return null;
```

`src/lib/snipe.ts`: `SnipeStats` picks `'watchOnly'` too; `findListing`'s first line becomes
`if (!sells.length || !s?.highs14 || s.watchOnly) return null;` (with the comment "A row the cloud's scan read only for the
Industry tab: not one the Sniper ever judged, and it doesn't start now.") and `findBid`'s
`if (!s?.highs14 || s.watchOnly) return null;`.

`src/lib/arbitrage.ts`: `import type { ProspectStats } from './types';` and

```ts
/**
 * The busiest items in a scan by ISK traded a day (units a day × average price), those with a book, at most `n`: Hub
 * arbitrage's candidates. A row the cloud's scan read only for the Industry tab (`watchOnly`) isn't one: it never passed the
 * scan's own gate.
 */
export function scanBusiest(stats: Record<number, Pick<ProspectStats, 'typeId' | 'unitsPerDay' | 'avgPrice' | 'watchOnly'>>, books: Record<number, unknown>, n: number): number[] {
  return Object.values(stats).filter((x) => books[x.typeId] && !x.watchOnly)
    .sort((a, b) => b.unitsPerDay * b.avgPrice - a.unitsPerDay * a.avgPrice).slice(0, n).map((x) => x.typeId);
}
```

`src/components/Arbitrage.tsx`: import `scanBusiest` with the rest from `'../lib/arbitrage'` and replace the `busiest`
block (lines 66–69) with `const busiest = scanBusiest(cache.stats, cache.books, CANDIDATES);` (its comment stays).

`worker/src/alerts.ts`: `ScanNotes` gains `watchOnly?: true`; `scanNotes` selects
`json_extract(stats, '$.watchOnly') AS watch_only` beside the book's two notes (its row type gains `watch_only: number | null`),
sets `if (r.watch_only) note.watchOnly = true;`, and keeps a note when any of the three is set; in `opportunities`,
`const fresh = types.filter((t) => books[t]);` becomes `const fresh = types.filter((t) => books[t] && !notes.get(t)?.watchOnly);`.

- [ ] **Step 6: Run the tests to see them pass, then plant each rule wrong**

Run: `npm run check && LEDGER=large PAGE=prospects,planner npm run check-pages`
Expected: all pass.

Plant, run, see it fail, undo:
- `fullScan`: drop `if (watchOnly.has(t)) stats.watchOnly = true;`: "marked watch-only" fails, and the large ledger's
  check is unaffected (it seeds the flag) — so also drop `judgeProspect`'s guard: "Prospects … none when watch-only" and the
  page check's "in the table, and shouldn't be: “990109”" fail.
- `saveNpcRow`'s delete: `complete = 0 AND run != ?1` only (keeps old complete rows): "a complete read drops every older
  row" fails.
- `foldBpo`: drop the `(o.duration ?? 0) < 365` test: "a player's order … left out" fails (the 900,000 listing wins).
- `opportunities`: the old `fresh` line: "a watch-only scan row in the watch doc: not mailed" fails.
- `scanBusiest`: drop `&& !x.watchOnly`: "never a watch-only row however busy" fails.

- [ ] **Step 7: The notes**

Append to `docs/notes/industry.md`:

```markdown
- **The scan's watch set** (`worker/src/scan.ts`, `src/data/industryTypes.json`; 1,858 types in stage 1: every Tech I
  product and its materials). Read with the morning scan whatever its candidate gate (one-sided, or NPC-sold in Jita), so
  the finder has a Jita book and history for them; one with no Jita order still gets no row, and the finder says "No Jita
  book this morning". **Marked `watchOnly` on the stats, not the book** (a correction to the spec): `overScan` rebuilds a
  live book over the scan's for every watched item and carries only three notes, so a flag on the book would have been
  lost the first time a position got the item watched. Prospects, Busy markets and the planner (`judgeProspect`), the
  opportunity mail (it reads the flag from D1 itself, so an old browser's `watch` doc can't get one mailed), the Sniper
  (`findListing`, `findBid`) and Hub arbitrage (`scanBusiest`) leave them out. A browser's own quick or deep scan judges
  what it samples as before.
- **The NPC row** (`industry_npc`, migration 0018; `worker/src/industryNpc.ts`; `GET /v1/industry/npc`): each run keeps
  the NPC sellers of the 1,673 Tech I blueprints (365-day sell orders anywhere in The Forge), the lowest price and every
  station, cheapest first, whatever the gate. `complete` when no page failed, with the pages missed beside. D1 keeps the
  latest complete row and any newer partial one, and only those two; the browser reads the complete one with the partial's
  newer sellers on top, and says "NPCs don't sell it in The Forge" only after a complete read.
```

In `docs/notes/finding-trades.md`, after the "The cloud reads the whole market once a day" bullet, add:

```markdown
- **The scan also reads the Industry tab's watch set** (10 October 2026, docs/notes/industry.md): every Tech I product and
  its materials with a Jita book, whatever the gate, marked `watchOnly` on their stats so no trade finder here sees them
  (`judgeProspect`, the Sniper's finders, `scanBusiest`, the opportunity mail). And it keeps NPCs' sellers of every Tech I
  blueprint, with their stations, in `industry_npc`: `foldNpc`'s one lowest price an item says nothing about where.
```

- [ ] **Step 8: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass (`tsc -p worker` takes the JSON import).

- [ ] **Step 9: Commit**

```bash
git add worker/migrations/0018_industry_npc.sql worker/src/industryNpc.ts worker/tsconfig.json worker/src/scan.ts worker/src/index.ts \
  worker/src/alerts.ts src/lib/types.ts src/lib/evaluate.ts src/lib/snipe.ts src/lib/arbitrage.ts src/components/Arbitrage.tsx \
  scripts/check.mjs scripts/check-worker.mjs scripts/pages.mjs docs/notes/industry.md docs/notes/finding-trades.md
git commit -m "$(cat <<'MSG'
Industry: the morning scan reads the tab's watch set and keeps NPCs' blueprint sellers

What was missing: the finder needs a Jita book and history for every Tech I product and its materials, and where NPCs
sell each original (spec 2026-10-10-industry-design.md, "The scan's watch set", "The BPO's price and where"). The scan
stored a row only for a trade candidate (two-sided in Jita, no NPC seller there, a wide spread or among the 300 busiest),
and kept NPC sellers as one lowest price, not a station: the research found its own top picks' BPOs absent from the 9
October export though NPCs sell them in The Forge.

What it is: the scan reads the watch set (industryTypes.json, 1,858 types) whatever the gate and marks those rows
watchOnly; it saves NPCs' sellers of the 1,673 Tech I blueprints by station in industry_npc (migration 0018), D1 keeping
the latest complete read and a newer partial one; GET /v1/industry/npc serves them. The Worker's first JSON import.

A correction to the spec: the flag is on the stats, not the book. overScan rebuilds a live book over the scan's for
every watched item and carries three notes only, so a book flag would have been dropped as soon as a position got the
item watched. Every reader the spec names reads the stats: judgeProspect (Prospects, Busy markets, the planner, the watch
doc), the Sniper's finders, Hub arbitrage's busiest (now scanBusiest), and the opportunity mail reads it from D1 so an
old browser can't get one mailed.

Tests: a watch-only row read and marked, a candidate not, no Jita order no row; the NPC row's sellers and what D1 keeps
across complete and partial reads; each reader leaving the row out, and the large ledger's Prospects and planner never
drawing 990109. Dropping the mark and the guard, keeping old complete rows, counting players' orders as NPCs', the
mail's old filter and scanBusiest's guard each failed a check.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
MSG
)"
```

---
### Task 5B: The finder and its detail

**Files:**
- Create: `src/components/hustles/industryFinder.ts`, `src/components/hustles/IndustryDetail.tsx`
- Modify: `src/lib/industryRank.ts` (`othersBook`, `bestOreFor`), `src/lib/cloud.ts` (`cloudIndustryNpc`),
  `src/components/hustles/industryMarket.ts` (the finder's reads), `src/components/hustles/IndustryBuild.tsx` (the finder
  above the sites), `src/styles.css`, `scripts/check.mjs`, `scripts/pages.mjs`, `docs/notes/industry.md`, `docs/notes/limits.md`

**Interfaces:**
- Consumes: everything in Tasks 2–5A; `GET /v1/industry/npc` (5A); `watchedFlow` (flowStore.ts), `loadCache`,
  `useScanState`, `ScanCache` (scan.ts), `adjustedPricesShared`, `jitaBook`, `setDestination` (market.ts), `heldCost`
  (heldCost.ts), `oreBaseIds` (orePricing.ts), `yieldOf`, `Materials` (reprocess.ts), `typeInfo` (universe.ts),
  `copyMultibuy`, `copyPrice` (common.tsx), `withoutOwn` (prospects.ts), `SPLIT_SAID` (split.ts).
- Produces:
  - `src/lib/industryRank.ts`: `othersBook(book, own, typeId, live): JitaBook`, `bestOreFor(material, ores, yieldOf): { id; perM3 } | null`.
  - `src/lib/cloud.ts`: `cloudIndustryNpc(): Promise<{ complete: NpcRow | null; partial: NpcRow | null } | null>`.
  - `src/components/hustles/industryMarket.ts`: `useAdjusted()`, `useScanCache()`, `type NpcState`, `useNpcRow()`,
    `useLiveBooks(types)`, `NPC_REGIONS`, `type RegionSeller`, `regionSellers(bp)`.
  - `src/components/hustles/industryFinder.ts`: `type FinderView`, `FINDER_KEY`, `useFinderView()`, `type Finder`
    (`{ site; facts; waiting; rows; live; input; npc; bpo(bp); scan }`), `useFinder(c, ix, graph): Finder`, `KIND_LABEL`,
    `FINDER_KINDS`, `bpoSaid(where, npc, station): { v; n }`. Task 7 (the ladder's "pays now") and Task 8 use `useFinder`.
  - `src/components/hustles/IndustryDetail.tsx`: `IndustryDetail({ c, ix, graph, row, finder, mainName })`.

**How the finder ranks.** `useFinder` waits, saying what for, until the site, the character's skills, the scan this
browser holds, ESI's indices and CCP's adjusted prices are in; then ranks every finder blueprint (1,652) on the morning's
books, reads the top 40 rows' products and materials live (`jitaBook`, four at a time), and ranks again on those (the
Loyalty pattern). Books are everyone else's (`othersBook` takes the builder's own orders off their level). A watch-only
row (Task 5A) is the finder's to use: that's what it was read for. Sells at Jita in this task; Task 6 adds the home hub.

- [ ] **Step 1: Write the failing test**

Add to `scripts/check.mjs`, after Task 5A's section:

```js
console.log('\n--- Industry: the finder reads others\' books, and the ore a mineral comes from (Task 5B) ---');
{
  const K = await import('../src/lib/industryRank.ts');
  const book = { bestBuy: 100, bestSell: 120, topBuys: [{ price: 100, volume: 10 }, { price: 99, volume: 50 }], topSells: [{ price: 120, volume: 5 }, { price: 121, volume: 40 }], at: '2026-10-10T11:25:00Z' };
  const own = [{ typeId: 7, isBuy: true, price: 100, volume: 10 }, { typeId: 7, isBuy: false, price: 120, volume: 2 }, { typeId: 8, isBuy: false, price: 121, volume: 40 }];
  eq('  your own whole bid comes off, so the best bid is the next; your listing leaves 3 of the front', K.othersBook(book, own, 7, true),
    { ask: 120, bid: 99, bids: [{ price: 99, volume: 50 }], at: '2026-10-10T11:25:00Z', live: true });
  eq('    another item\'s orders change nothing', K.othersBook(book, own, 9, false).bid, 100);
  // Two ores (invented): A gives 400 Tritanium a 100-unit portion at 0.1 m³ a unit, B 1,000 at 1 m³. At a 50% yield, A
  // gives 400 × 0.5 ÷ 100 ÷ 0.1 = 20 a m³, B 5: A it is.
  const ores = [{ id: 1, mats: [100, [[34, 400]]], volume: 0.1 }, { id: 2, mats: [100, [[34, 1000], [35, 50]]], volume: 1 }, { id: 3, mats: [100, [[36, 5]]], volume: 0.1 }];
  eq('  the ore giving the most of a mineral a m³ at your yield', K.bestOreFor(34, ores, () => 0.5), { id: 1, perM3: 20 });
  eq('    none of them yields it: none', K.bestOreFor(40, ores, () => 0.5), null);
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run check 2>&1 | grep -A3 "others' books"`
Expected: `K.othersBook is not a function`.

- [ ] **Step 3: The two rules**

In `src/lib/industryRank.ts`, change the prospects import to `import { median, paceDay, withoutOwn } from './prospects';`
and append:

```ts

/**
 * A Jita book as the finder reads it: everyone else's orders, the builder's own taken off their price's level (selling
 * into your own bid, or undercutting your own listing, is no sale). `live` when it's a read of now, not the morning's.
 */
export function othersBook(b: { bestBuy: number | null; bestSell: number | null; topBuys: BookLevel[]; topSells: BookLevel[]; sold?: BookSold; at: string },
  own: readonly { typeId: number; isBuy: boolean; price: number; volume: number }[], typeId: number, live: boolean): JitaBook {
  const mine = own.filter((o) => o.typeId === typeId);
  const asks = withoutOwn(b.topSells, mine.filter((o) => !o.isBuy));
  const bids = withoutOwn(b.topBuys, mine.filter((o) => o.isBuy));
  return { ask: asks[0]?.price ?? null, bid: bids[0]?.price ?? null, bids, ...(b.sold ? { sold: b.sold } : {}), at: b.at, live };
}

/**
 * The ore that gives the most of a material a m³ mined, at the builder's yield where it's refined: each ore's units of the
 * material a portion × yield ÷ portion ÷ its volume. Null when none of the ores given yields it.
 */
export function bestOreFor(material: number, ores: readonly { id: number; mats: [number, [number, number][], number?]; volume: number }[], yieldOf: (m: [number, [number, number][], number?]) => number): { id: number; perM3: number } | null {
  let best: { id: number; perM3: number } | null = null;
  for (const o of ores) {
    const q = o.mats[1].find(([t]) => t === material)?.[1];
    if (!q || !(o.volume > 0)) continue;
    const perM3 = (q * yieldOf(o.mats)) / o.mats[0] / o.volume;
    if (!best || perM3 > best.perM3) best = { id: o.id, perM3 };
  }
  return best;
}
```

Run: `npm run check 2>&1 | grep -B1 -A3 "others' books"`
Expected: no `FAIL`. Plant `const bids = b.topBuys;` in `othersBook`: "your own whole bid comes off" fails. Plant
`/ o.mats[0]` without `/ o.volume` in `bestOreFor`: "the ore giving the most of a mineral a m³" fails. Undo both.

- [ ] **Step 4: The cloud's NPC row in the browser**

In `src/lib/cloud.ts`, add `import type { NpcRow } from './industryRank';` and, before `cloudTestMail`:

```ts
/**
 * The morning scan's NPC sellers of every blueprint the Industry tab ranks (industryNpc.ts): the latest complete read and a
 * newer partial one. A Worker a version behind answers 404 (the error's `status`).
 */
export const cloudIndustryNpc = () => call<{ complete: NpcRow | null; partial: NpcRow | null } | null>('/v1/industry/npc');
```

- [ ] **Step 5: The finder's reads**

Replace the imports at the top of `src/components/hustles/industryMarket.ts` with:

```ts
import { useEffect, useMemo, useState } from 'react';
import { cloudEnabled, cloudIndustryNpc, useCloud } from '../../lib/cloud';
import { esi } from '../../lib/esi';
import { shareInFlight } from '../../lib/inFlight';
import type { IndustryIndex } from '../../lib/industry';
import type { NpcRow } from '../../lib/industryRank';
import { adjustedPricesShared, industrySystemsShared, jitaBook, resolveNames } from '../../lib/market';
import { sanitizeIndustry, type IndustryDoc } from '../../lib/prefs';
import { loadCache, useScanState, type ScanCache } from '../../lib/scan';
import type { BookSold } from '../../lib/split';
import { update, useData } from '../../lib/store';
import type { BookLevel } from '../../lib/types';
```

and append:

```ts

/** CCP's adjusted prices (an hour, shared): what a job's estimated item value is worked out on. */
export const useAdjusted = (): Loaded<Record<number, number>> => useShared(adjustedPricesShared);

/** The scan this browser holds (the cloud's morning scan once adopted, or its own), read again whenever a scan lands. */
export function useScanCache(): Loaded<ScanCache> {
  const saved = useScanState().saved;
  return useShared(loadCache, String(saved));
}

/**
 * The morning scan's NPC sellers of every blueprint (`GET /v1/industry/npc`): `off` with the cloud copy off in this
 * browser, `behind` when the Worker doesn't have the route yet (404), `failed` otherwise, else the rows (both null before
 * the first scan after the Worker began keeping them).
 */
export type NpcState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string }
  | { status: 'ok'; rows: { complete: NpcRow | null; partial: NpcRow | null } };
export function useNpcRow(): NpcState {
  const cloud = useCloud();
  const [st, setSt] = useState<NpcState>(() => (cloudEnabled() ? { status: 'loading' } : { status: 'off' }));
  useEffect(() => {
    if (!cloudEnabled()) { setSt({ status: 'off' }); return; }
    if (!cloud.started) return;
    let alive = true;
    cloudIndustryNpc().then((rows) => { if (alive) setSt({ status: 'ok', rows: { complete: rows?.complete ?? null, partial: rows?.partial ?? null } }); },
      (e) => { if (alive) setSt((e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [cloud.started]);
  return st;
}

/**
 * Jita books now for the types asked (jitaBook: kept until ESI has a newer one, shared in flight), four at a time in the
 * order asked: the top rows' products and materials, after a first ranking on the morning's books. One that can't be read
 * is left on the morning's book, which the row's tip says.
 */
export function useLiveBooks(types: readonly number[]): Record<number, { bestBuy: number | null; bestSell: number | null; topBuys: BookLevel[]; topSells: BookLevel[]; sold?: BookSold; at: string }> {
  const key = types.join(',');
  const [got, setGot] = useState<Record<number, { bestBuy: number | null; bestSell: number | null; topBuys: BookLevel[]; topSells: BookLevel[]; sold?: BookSold; at: string }>>({});
  useEffect(() => {
    let alive = true;
    const queue = key ? key.split(',').map(Number) : [];
    let next = 0;
    const work = async () => {
      while (alive && next < queue.length) {
        const t = queue[next++];
        const b = await jitaBook(t).catch(() => null);
        if (!alive) return;
        if (b) setGot((x) => ({ ...x, [t]: { bestBuy: b.bestBuy, bestSell: b.bestSell, topBuys: b.topBuys, topSells: b.topSells, ...(b.sold ? { sold: b.sold } : {}), at: b.fetchedAt } }));
      }
    };
    for (let i = 0; i < 4; i++) void work();
    return () => { alive = false; };
  }, [key]);
  return got;
}

/** The regions the research found NPCs seeding Tech I originals in, besides The Forge (the scan's): looked in when a row opens. */
export const NPC_REGIONS: Record<number, string> = {
  10000016: 'Lonetrek', 10000043: 'Domain', 10000067: 'Genesis', 10000041: 'Syndicate', 10000057: 'Outer Ring', 10000023: 'Pure Blind', 10000011: 'Great Wildlands',
};
export type RegionSeller = { region: number; station: number; system: number; price: number };
/** NPCs' sell orders (365 days) of one original in each of NPC_REGIONS: seven public reads, shared while in flight. A region that can't be read is left out and counted. */
export const regionSellers = shareInFlight((bp: number) => String(bp), async (bp: number): Promise<{ sellers: RegionSeller[]; failed: number }> => {
  const sellers: RegionSeller[] = [];
  let failed = 0;
  await Promise.all(Object.keys(NPC_REGIONS).map(Number).map(async (region) => {
    try {
      const { data } = await esi<{ location_id: number; system_id: number; price: number; duration: number; is_buy_order: boolean }[]>(`/markets/${region}/orders/`, { query: { order_type: 'sell', type_id: bp } });
      for (const o of data) if (!o.is_buy_order && o.duration >= 365) sellers.push({ region, station: o.location_id, system: o.system_id, price: o.price });
    } catch { failed++; }
  }));
  return { sellers: sellers.sort((a, b) => a.price - b.price || a.station - b.station), failed };
});
```

- [ ] **Step 6: `useFinder`**

Create `src/components/hustles/industryFinder.ts`:

```ts
import { useMemo, useState } from 'react';
import { iskBig } from '../../lib/format';
import { watchedFlow } from '../../lib/flowStore';
import type { Indexed } from '../../lib/industry';
import {
  bpoWhere, finderBlueprints, LIVE_ROWS, othersBook, rankBuilds, type BpoWhere, type Market, type ProductKind, type Row, type RowInput,
} from '../../lib/industryRank';
import { JITA_SYSTEM, legFor, siteFacts, type SiteFacts } from '../../lib/industrySites';
import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
import type { IndustrySite } from '../../lib/prefs';
import type { IndustryChar } from './industryChars';
import { useAdjusted, useIndices, useIndustryDoc, useLiveBooks, useNpcRow, useScanCache, type Loaded, type NpcState } from './industryMarket';

/**
 * The finder's inputs, gathered once for Build and Start (docs/notes/industry.md): the site, its facts and legs, ESI's
 * indices and adjusted prices, the scan this browser holds, the cloud's NPC row, and live Jita books for the top rows,
 * then every finder blueprint ranked (rankBuilds) first on the morning's books and again with the top LIVE_ROWS' products
 * and materials on live ones (the Loyalty pattern). Reads nothing an earlier state can't use: nothing is ranked until the
 * site, the scan, the indices and the adjusted prices are in, and each says what it's waiting on.
 */
export type FinderView = { kind: ProductKind | 'all'; canBuild: boolean; bpoUpTo: number | null; sort: 'day' | 'unit' | 'payback'; sitesOpen: boolean | null };
export const FINDER_KEY = 'jita-ledger:industry-finder';
const DEFAULT_VIEW: FinderView = { kind: 'all', canBuild: false, bpoUpTo: null, sort: 'day', sitesOpen: null };
const readView = (): FinderView => { try { return { ...DEFAULT_VIEW, ...(JSON.parse(localStorage.getItem(FINDER_KEY) ?? '{}') as Partial<FinderView>) }; } catch { return DEFAULT_VIEW; } };

/** The finder's view, kept per browser: kind, "Can build now", "BPO up to", the sort, and the sites panel open or shut. */
export function useFinderView(): [FinderView, (patch: Partial<FinderView>) => void] {
  const [v, setV] = useState(readView);
  return [v, (patch) => setV((x) => { const n = { ...x, ...patch }; try { localStorage.setItem(FINDER_KEY, JSON.stringify(n)); } catch { /* just not kept */ } return n; })];
}

export type Finder = {
  site: IndustrySite | null; facts: SiteFacts | null;
  /** What it's waiting on, as a sentence; null once rows are ranked. */
  waiting: { text: string; retry?: () => void } | null;
  rows: Row[]; live: boolean;
  /** The inputs the rows were ranked on, `market` the live-merged one once live books are in. */
  input: Omit<RowInput, 'bp'> | null;
  npc: NpcState; bpo: (bp: number) => BpoWhere;
  scan: Loaded<unknown>;
};

export function useFinder(c: IndustryChar, ix: Indexed, graph: Graph): Finder {
  const [doc] = useIndustryDoc();
  const site = doc.sites.find((s) => s.id === doc.site) ?? doc.sites[0] ?? null;
  const indices = useIndices(), adjusted = useAdjusted(), scan = useScanCache(), npc = useNpcRow();
  const jitaHigh = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC), [graph]);
  const idx = indices.state === 'ok' ? indices.value : null;
  const facts = useMemo(() => (site ? siteFacts(site, graph, jitaHigh, idx) : null), [site, graph, jitaHigh, idx]);
  const cache = scan.state === 'ok' ? scan.value : null;
  const hasScan = !!cache && Object.keys(cache.stats).length > 0;
  const skills = c.pilot.skills;

  const input = useMemo((): Omit<RowInput, 'bp'> | null => {
    if (!site || !facts || !facts.index || !cache || !hasScan || adjusted.state !== 'ok' || !skills) return null;
    const flows = new Map<number, ReturnType<typeof watchedFlow>>();
    const market = (t: number): Market => {
      const b = cache.books[t];
      if (!flows.has(t)) flows.set(t, watchedFlow(t));
      return { jita: b ? othersBook(b, c.own, t, false) : null, stats: cache.stats[t] ?? null, watched: flows.get(t) ?? null };
    };
    return {
      ix, me: doc.assume.me, te: doc.assume.te, skills, clone: c.clone,
      site: { kind: site.kind, rigs: site.rigs, band: facts.band, tax: facts.tax, index: facts.index },
      adjusted: adjusted.value, market, sell: 'jita', share: doc.share,
      fees: { broker: c.broker, tax: c.tax, hubBroker: null },
      legs: { jita: legFor(site, facts, JITA_SYSTEM, doc.freight), home: null },
      noShipsToJita: doc.noShipsToJita, jitaJumps: facts.jitaJumps, mines: c.mines, hubName: null, now: Date.now(),
    };
  }, [site, facts, cache, hasScan, adjusted, skills, c, ix, doc.assume, doc.share, doc.freight, doc.noShipsToJita]);

  const bps = useMemo(() => finderBlueprints(ix), [ix]);
  const first = useMemo(() => (input ? rankBuilds(input, bps) : []), [input, bps]);
  // The top rows' products and materials, read live; ranked again on them.
  const liveTypes = useMemo(() => [...new Set(first.filter((r) => r.day).slice(0, LIVE_ROWS).flatMap((r) => [r.product, ...r.materials.map((m) => m.type)]))], [first]);
  const liveBooks = useLiveBooks(liveTypes);
  const live = Object.keys(liveBooks).length > 0;
  const liveInput = useMemo(() => {
    if (!input || !live) return input;
    const market = (t: number): Market => {
      const m = input.market(t), b = liveBooks[t];
      return b ? { ...m, jita: othersBook(b, c.own, t, true) } : m;
    };
    return { ...input, market };
  }, [input, live, liveBooks, c.own]);
  const rows = useMemo(() => (liveInput && live ? rankBuilds(liveInput, bps) : first), [liveInput, live, first, bps]);

  const npcRows = npc.status === 'ok' ? npc.rows : null;
  const bpo = (bp: number) => bpoWhere(npcRows, bp, ix.b.types[bp]?.[4] ?? 0);

  const waiting = !site ? { text: 'Pick where you build first: add a site under Where you build, below.' }
    : !skills ? { text: c.isMain ? 'Your skills come with the next sync; the finder works at them.' : `${c.name}’s skills aren’t read yet; the finder works at them.` }
      : scan.state === 'loading' ? { text: 'Reading the market scan held in this browser…' }
        : !hasScan ? { text: 'No market scan here yet: the cloud’s comes every morning.' }
          : indices.state === 'loading' ? { text: 'Reading the industry indices…' }
            : indices.state === 'failed' ? { text: 'Couldn’t read ESI’s industry indices just now, so no job can be costed.', retry: indices.retry }
              : facts && !facts.index ? { text: facts.indexWhy ?? 'ESI lists no industry index for this system.' }
                : adjusted.state === 'loading' ? { text: 'Reading CCP’s adjusted prices…' }
                  : adjusted.state === 'failed' ? { text: 'Couldn’t read CCP’s adjusted prices just now, so no job can be costed.', retry: adjusted.retry }
                    : null;
  return { site, facts, waiting, rows, live, input: liveInput, npc, bpo, scan };
}

/** The finder's kinds as the choice lists them. */
export const KIND_LABEL: Record<ProductKind | 'all', string> = {
  all: 'Everything', rigs: 'Rigs', modules: 'Modules', charges: 'Ammo and charges', components: 'Components', drones: 'Drones and fighters',
  deployables: 'Deployables', 'hulls-small': 'Frigates and destroyers', 'hulls-medium': 'Cruisers and battlecruisers', 'hulls-large': 'Battleships',
  'hulls-other': 'Other hulls', fuel: 'Fuel blocks', structures: 'Structures', 'capital-parts': 'Capital parts', capital: 'Capitals', other: 'Other',
};
export const FINDER_KINDS: (ProductKind | 'all')[] = ['all', 'rigs', 'modules', 'charges', 'components', 'drones', 'deployables', 'hulls-small', 'hulls-medium', 'hulls-large', 'fuel', 'structures', 'capital-parts', 'other'];

/** What the BPO's column says: NPCs' price and where, or why there isn't one. */
export function bpoSaid(w: BpoWhere, npc: NpcState, station: (id: number) => string): { v: string; n: string } {
  if (w.state === 'forge') return { v: iskBig(w.price), n: `at ${station(w.stations[0])}${w.stations.length > 1 ? ` (and ${w.stations.length - 1} more)` : ''}` };
  if (w.state === 'notForge') return { v: '–', n: `NPCs don’t sell it in The Forge${w.base != null ? `; CCP’s base price ${iskBig(w.base)}` : ''}` };
  if (w.state === 'unknown') return { v: '–', n: `No NPC seller found (this morning’s read missed ${w.missed} page${w.missed === 1 ? '' : 's'})${w.base != null ? `; base price ${iskBig(w.base)}` : ''}` };
  if (npc.status === 'off') return { v: '–', n: 'NPC sellers come from the cloud’s morning scan, which isn’t on in this browser' };
  if (npc.status === 'loading') return { v: '…', n: 'Reading NPC sellers from the cloud…' };
  if (npc.status === 'behind') return { v: '–', n: 'The cloud is a version behind: NPC sellers come once it’s updated' };
  if (npc.status === 'failed') return { v: '–', n: `Couldn’t read NPC sellers from the cloud: ${npc.error}` };
  return { v: '–', n: 'The cloud hasn’t run a morning scan since it began keeping NPC sellers' };
}

```

- [ ] **Step 7: The finder in Build, and a row's detail**

Replace `src/components/hustles/IndustryBuild.tsx` with:

```tsx
import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Coins, Scale, Store } from 'lucide-react';
import { iskBig, iskBigSigned, pct, units } from '../../lib/format';
import { navigate } from '../../lib/hooks';
import type { Indexed } from '../../lib/industry';
import { payback, productKind, type BpoWhere, type Row } from '../../lib/industryRank';
import type { Graph } from '../../lib/jumps';
import { ASSUME_CHOICES } from '../../lib/prefs';
import { Points } from '../Facts';
import { Check, NumChip, Seg, Th } from '../ui';
import type { IndustryChar } from './industryChars';
import { IndustryDetail } from './IndustryDetail';
import { bpoSaid, FINDER_KINDS, KIND_LABEL, useFinder, useFinderView, type Finder } from './industryFinder';
import { useIndustryDoc, useStationNames } from './industryMarket';
import { IndustrySites } from './IndustrySites';

/**
 * Build (docs/notes/industry.md): the finder, every Tech I blueprint sold on the market worked out for the default site,
 * the shown character's skills and fees and where it'd sell, best profit a day for one factory slot first; then where you
 * build. A row opens to its detail. Choices that are decisions (the site, the share, the ships switch, the ME/TE assumed)
 * are the synced `industry` doc's; the kind, "Can build now", "BPO up to", the sort and the open row are this browser's.
 */
const OPEN_KEY = 'jita-ledger:industry-open';
const SHOWN = 50;
/** Why rows aren't priced, by how many: "1,650 have no Jita book this morning", "1 has nowhere it may be sold". */
const MISSING_SAID: Record<NonNullable<Row['missing']>, (one: boolean) => string> = {
  noBook: (one) => `${one ? 'has' : 'have'} no Jita book this morning`,
  noIndex: () => 'can’t be costed: no index for the site',
  noAdjusted: () => 'can’t be costed: no adjusted price for a material',
  noMaterials: (one) => `${one ? 'needs' : 'need'} a material nobody lists where it can be bought`,
  noSale: (one) => `${one ? 'has' : 'have'} nowhere ${one ? 'it' : 'they'} may be sold`,
};

const bpoPrice = (w: BpoWhere) => (w.state === 'forge' ? w.price : null);
const unitProfit = (r: Row) => (r.day && r.day.units > 0 ? r.day.profit / r.day.units : r.sale && r.costUnit != null ? (r.sale.listNet ?? r.sale.bidNet ?? NaN) - r.costUnit : null);

export function IndustryBuild({ c, ix, graph, mainName }: { c: IndustryChar; ix: Indexed; graph: Graph; mainName: string }) {
  const [doc, setDoc] = useIndustryDoc();
  const f = useFinder(c, ix, graph);
  const [view, setView] = useFinderView();
  const [open, setOpen] = useState<number | null>(() => { try { return Number(localStorage.getItem(OPEN_KEY)) || null; } catch { return null; } });
  const toggle = (bp: number) => { const n = open === bp ? null : bp; setOpen(n); try { if (n) localStorage.setItem(OPEN_KEY, String(n)); else localStorage.removeItem(OPEN_KEY); } catch { /* just not kept */ } };
  const [more, setMore] = useState(0);
  // Shut once there's a site, open while there's none; decided as the section opens, so adding the first site doesn't fold it
  // away under you. A choice made here is kept.
  const [openAtStart] = useState(() => doc.sites.length === 0);
  const sitesOpen = view.sitesOpen ?? openAtStart;

  const priced = useMemo(() => f.rows.filter((r) => r.day), [f.rows]);
  const shown = useMemo(() => {
    const keep = priced.filter((r) => (view.kind === 'all' || productKind(ix, r.product) === view.kind) && (!view.canBuild || !r.lacking.length)
      && (view.bpoUpTo == null || ((p) => p != null && p <= view.bpoUpTo!)(bpoPrice(f.bpo(r.bp)))));
    const pb = (r: Row) => payback(bpoPrice(f.bpo(r.bp)), r.day?.profit) ?? Infinity;
    return [...keep].sort(view.sort === 'unit' ? (a, b) => (unitProfit(b) ?? -Infinity) - (unitProfit(a) ?? -Infinity)
      : view.sort === 'payback' ? (a, b) => pb(a) - pb(b) : (a, b) => b.day!.profit - a.day!.profit);
  }, [priced, view, ix, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const unpriced = f.rows.length - priced.length;
  const why = useMemo(() => {
    const n: Partial<Record<NonNullable<Row['missing']>, number>> = {};
    for (const r of f.rows) if (!r.day && r.missing) n[r.missing] = (n[r.missing] ?? 0) + 1;
    return Object.entries(n).map(([k, v]) => `${units(v)} ${MISSING_SAID[k as NonNullable<Row['missing']>](v === 1)}`).join(', ');
  }, [f.rows]);
  const keptHome = f.rows.filter((r) => r.shipsKeptHome).length;
  const stations = useStationNames(shown.slice(0, SHOWN + more).flatMap((r) => { const w = f.bpo(r.bp); return w.state === 'forge' ? [w.stations[0]] : []; }));
  const station = (id: number) => stations[id] ?? `Station #${id}`;
  const beforeTax = f.facts != null && f.facts.tax == null;

  return (
    <section className="col" style={{ gap: 16 }} aria-label="Build" data-industry="build">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Every blueprint sold on the market, worked out for your build site, your skills and where you’d sell.</p>
        <Points compact items={[
          { kind: 'info', icon: Scale, lead: 'Profit a day', text: `is for one factory slot, capped by what the market takes at your industry share (${pct(doc.share / 100, doc.share % 1 ? 1 : 0)}).` },
          { kind: 'info', icon: Coins, lead: 'Materials', text: 'come from wherever is cheapest delivered.' },
          { kind: 'good', icon: Store, lead: 'Nothing is sold', text: 'where you said you wouldn’t.' },
        ]} />
      </div>

      <div className="row ind-choices" data-industry="choices">
        {doc.sites.length > 1 && (
          <label className="chip h34"><span className="cl">Build at</span>
            <select value={f.site?.id ?? ''} onChange={(e) => setDoc({ site: e.target.value })} aria-label="Build at">
              {doc.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <NumChip label="Industry share" percent width={44} value={doc.share} onChange={(n) => { if (n != null && n > 0) setDoc({ share: n }); }}
          tip={'The part of each market’s daily trade you’d sell.\n\n• The research used 10%.\n• Profit a day is linear in it: doubling it doubles a market-limited row.'} />
        <Seg size="sm" label="ME and TE of an original you’d buy" value={`${doc.assume.me}/${doc.assume.te}`} onChange={(v) => { const [me, te] = v.split('/').map(Number); setDoc({ assume: { me, te } }); }}
          options={ASSUME_CHOICES.map((a) => ({ v: `${a.me}/${a.te}`, label: `ME ${a.me} / TE ${a.te}`, tip: a.me === 0 ? 'As NPCs sell it: unresearched.' : 'Researched first: the detail says how long it takes and what it costs.' }))} />
        <Check checked={doc.noShipsToJita} onChange={(v) => setDoc({ noShipsToJita: v })}
          tip={`Your words: ships are “too bulky expensive and risky” to haul to Jita. On, a ship built outside high-sec or more than 10 high-sec jumps from Jita sells at home or not at all.`}>Never haul ships to Jita</Check>
      </div>
      <div className="row ind-choices">
        <label className="chip h34"><span className="cl">Kind</span>
          <select value={view.kind} onChange={(e) => setView({ kind: e.target.value as typeof view.kind })} aria-label="Kind">
            {FINDER_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <Check checked={view.canBuild} onChange={(v) => setView({ canBuild: v })} tip={c.isMain ? 'Only what your skills build now.' : `Only what ${c.name}’s skills build now.`}>Can build now</Check>
        <NumChip label="BPO up to" width={90} value={view.bpoUpTo} onChange={(n) => setView({ bpoUpTo: n })} placeholder="no cap" tip="The most you’d pay NPCs for an original. Blank: no cap. An original NPCs don’t sell in The Forge has no price, so a cap leaves it out." />
        <Seg size="sm" label="Sort" value={view.sort} onChange={(v) => setView({ sort: v })}
          options={[{ v: 'day', label: 'Profit a day' }, { v: 'unit', label: 'Profit a unit' }, { v: 'payback', label: 'Payback' }]} />
      </div>

      {f.waiting ? (
        <p className="note small" style={{ margin: 0 }} data-industry="finder-wait">
          {f.waiting.text}
          {f.waiting.retry && <> <button type="button" className="link-btn" onClick={f.waiting.retry}>Try again</button></>}
          {f.waiting.text.startsWith('No market scan') && <> <button type="button" className="link-btn" onClick={() => navigate('prospects')}>Open Prospects</button></>}
        </p>
      ) : (
        <div className="col" style={{ gap: 8 }} data-industry="finder">
          <p className="note small" style={{ margin: 0 }} data-industry="finder-count">
            {units(shown.length)} of {units(priced.length)} priced at {f.site?.name}{f.live ? '; the top rows on Jita’s books now, the rest on this morning’s' : ', on this morning’s Jita books'}.
            {unpriced > 0 && ` ${units(unpriced)} aren’t priced: ${why}.`}
            {keptHome > 0 && doc.noShipsToJita && ` ${units(keptHome)} ${keptHome === 1 ? 'ship stays' : 'ships stay'} home: never haul ships to Jita is on.`}
          </p>
          <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
            <table className="tbl compact rd-table ind-finder">
              <thead>
                <tr>
                  <Th left className="ind-c-name">Product</Th>
                  <Th left className="rd-wide ind-c-bpo" tip="NPCs’ price for the original in The Forge this morning, and where; or why there isn’t one.">BPO</Th>
                  <Th className="rd-wide" tip="What one unit makes after its materials, the job, fees and freight, on the better side it sells on.">Profit a unit</Th>
                  <Th className="rd-wide" tip="A day’s job: what one factory slot makes, and what the market takes at your industry share, and which of the two limits it.">One slot a day</Th>
                  <Th className="ind-c-day" tip={`What one factory slot earns a day.${beforeTax ? '\n\n• Before the facility tax: the site’s isn’t typed. Each row says what each 1% costs a day.' : ''}`}>{beforeTax ? 'Profit a day, before the facility tax' : 'Profit a day, one slot'}</Th>
                  <Th className="rd-wide" tip="Days for one slot’s profit to pay for the original at NPCs’ price.">Payback</Th>
                  <Th className="rd-wide" tip="Skills the blueprint asks for that aren’t trained to its level.">Skills</Th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, SHOWN + more).map((r) => {
                  const w = f.bpo(r.bp), b = bpoSaid(w, f.npc, station);
                  const pb = payback(bpoPrice(w), r.day?.profit);
                  const up = unitProfit(r);
                  const name = ix.b.types[r.product]?.[0] ?? `Item #${r.product}`;
                  const tax = r.taxPerPct != null ? `each 1% of tax: ${iskBig(r.taxPerPct)} a day` : null;
                  const book = r.sale && f.input ? (f.input.market(r.product).jita?.live ? 'Jita’s book now' : 'this morning’s book') : null;
                  return (
                    <Fragment key={r.bp}>
                      <tr className={open === r.bp ? 'open' : undefined} data-bp={r.bp}>
                        <td className="l rd-main">
                          <button type="button" className="expander" aria-expanded={open === r.bp} onClick={() => toggle(r.bp)}>
                            <ChevronRight className="chev" aria-hidden="true" /><span className="nm">{name}</span>
                          </button>
                          <span className="sub">{KIND_LABEL[productKind(ix, r.product)]}{book ? ` · ${book}` : ''}</span>
                          <span className="rd-phone">
                            <span>BPO: {b.v} {b.n}</span>
                            <span>Profit a unit: {iskBigSigned(up)}</span>
                            <span>One slot: {units(r.day!.units)} of {units(r.makes)} a day, the {r.day!.limit === 'market' ? 'market' : 'slot'} limits it</span>
                            {tax && <span>{tax}</span>}
                            <span>Payback: {pb != null ? `${pb.toFixed(1)} days` : '–'}</span>
                          </span>
                        </td>
                        <td className="l rd-wide"><span>{b.v}</span><span className="sub">{b.n}</span></td>
                        <td className="rd-wide">{iskBigSigned(up)}</td>
                        <td className="rd-wide">{units(r.day!.units)} / {units(r.makes)}<span className="sub">the {r.day!.limit === 'market' ? 'market' : 'slot'} limits it</span></td>
                        <td>{iskBigSigned(r.day!.profit)}{tax && <span className="sub">{tax}</span>}</td>
                        <td className="rd-wide">{pb != null ? `${pb.toFixed(1)} days` : '–'}<span className="sub">{pb != null ? '' : bpoPrice(w) == null ? 'no NPC price' : 'never, at a loss'}</span></td>
                        <td className="rd-wide">{r.lacking.length ? `${r.lacking.length} to train` : 'trained'}</td>
                      </tr>
                      {open === r.bp && f.input && (
                        <tr className="detail"><td colSpan={7}><IndustryDetail c={c} ix={ix} graph={graph} row={r} finder={f as Finder} mainName={mainName} /></td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!shown.length && <p className="note small" style={{ margin: 0 }}>Nothing priced fits these choices: widen the kind, untick Can build now, or raise BPO up to.</p>}
          {shown.length > SHOWN + more && <button type="button" className="link-btn" onClick={() => setMore(more + SHOWN)}>Show {Math.min(SHOWN, shown.length - SHOWN - more)} more</button>}
        </div>
      )}

      <div className="col" style={{ gap: 10 }}>
        <button type="button" className="panel-toggle" aria-expanded={sitesOpen} onClick={() => setView({ sitesOpen: !sitesOpen })}>
          <ChevronRight className="chev" aria-hidden="true" /><span className="panel-title">Where you build</span>
        </button>
        {sitesOpen && <IndustrySites c={c} ix={ix} graph={graph} mainName={mainName} />}
      </div>
    </section>
  );
}
```

Create `src/components/hustles/IndustryDetail.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { hasScope } from '../../lib/auth';
import { SCOPE } from '../../lib/config';
import { isk, iskBig, iskBigSigned, pct, units } from '../../lib/format';
import { heldCost } from '../../lib/heldCost';
import { navigate } from '../../lib/hooks';
import { DAY_S, KIND_SAID, NPC_FACILITY_TAX, secBand, SKILL, structureBonus, rigFor, type Indexed } from '../../lib/industry';
import { bestOreFor, meLevels, payback, shoppingList, startUp, type Held, type LabSite, type Row } from '../../lib/industryRank';
import { JITA_SYSTEM, nearestLab } from '../../lib/industrySites';
import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
import { setDestination } from '../../lib/market';
import { oreBaseIds } from '../../lib/orePricing';
import { yieldOf, type Materials } from '../../lib/reprocess';
import { SPLIT_SAID } from '../../lib/split';
import { toast } from '../../lib/toast';
import { typeInfo } from '../../lib/universe';
import { copyMultibuy, copyPrice } from '../common';
import { Tiles } from '../ui';
import type { IndustryChar } from './industryChars';
import { bpoSaid, type Finder } from './industryFinder';
import { NPC_REGIONS, regionSellers, useIndices, useStationNames, type RegionSeller } from './industryMarket';

/**
 * A finder row's detail (docs/notes/industry.md): every material with its sources, the job's time and cost broken down,
 * the sale and its pace, profit at each ME level with the research it takes, where NPCs sell the original (The Forge from
 * the morning scan, the regions the research found them in on asking), what starting costs, the shopping list with Copy
 * for Multibuy, and the steps. Everything is the finder's own figures for the row; nothing is guessed to fill a gap.
 */
const SOURCE_SAID = { jita: 'Jita', home: 'home hub', mined: 'mined' } as const;

export function IndustryDetail({ c, ix, graph, row, finder, mainName }: { c: IndustryChar; ix: Indexed; graph: Graph; row: Row; finder: Finder; mainName: string }) {
  const input = finder.input!;
  const site = finder.site!, facts = finder.facts!;
  const indices = useIndices();
  const idx = indices.state === 'ok' ? indices.value : null;
  const name = (id: number) => ix.b.types[id]?.[0] ?? `Item #${id}`;
  const jitaAny = useMemo(() => jumpsFrom(graph, JITA_SYSTEM), [graph]);
  const jitaHigh = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, s) => s >= HIGH_SEC), [graph]);
  const fromSite = useMemo(() => jumpsFrom(graph, site.systemId), [graph, site.systemId]);

  // What's held where the site is: the builder's loose stock there, at what its own latest buys cost it.
  const loc = site.stationId ?? site.structureId ?? null;
  const here = loc != null ? c.stock?.byLocation[loc] ?? {} : {};
  const held: Held = {
    units: (t) => here[t] ?? 0,
    cost: (t, n) => heldCost(c.buys.filter((b) => b.typeId === t), n, new Set(), c.broker),
  };

  // Research runs at the site when it has a Laboratory, else at the nearest one.
  const lab = useMemo((): { at: string; site: LabSite } | null => {
    if (facts.canScience) return { at: site.name, site: { kind: site.kind, rigs: site.rigs, band: facts.band, tax: facts.tax, index: facts.index } };
    const n = nearestLab(ix.b.stations, graph, site.systemId);
    if (!n) return null;
    const sys = graph[n.systemId];
    return { at: `the nearest Laboratory, in ${sys?.[1] ?? `system ${n.systemId}`} (${n.jumps} jump${n.jumps === 1 ? '' : 's'})`, site: { kind: 'npc', rigs: [], band: secBand(sys?.[0] ?? 0), tax: NPC_FACILITY_TAX, index: idx?.[n.systemId] ?? null } };
  }, [facts, site, ix, graph, idx]);
  const bpRow = ix.bp.get(row.bp)!;
  const levels = useMemo(() => (lab ? meLevels({ ...input, bp: bpRow }, lab.site) : null), [input, bpRow, lab]);
  const assumed = levels?.find((l) => l.me === input.me && l.te === input.te) ?? null;
  const w = finder.bpo(row.bp);
  const bpo = w.state === 'forge' ? w.price : null;
  const su = startUp(row, { bpo, research: assumed?.cost ?? null, held });
  const shop = shoppingList(row, held);
  const jitaLines = shop.filter((x) => x.source === 'jita');
  const stations = useStationNames(w.state === 'forge' ? w.stations : []);
  const station = (id: number) => stations[id] ?? `Station #${id}`;
  const b = bpoSaid(w, finder.npc, station);

  // Other regions NPCs seed originals in, read on asking.
  const [regions, setRegions] = useState<{ sellers: RegionSeller[]; failed: number } | 'reading' | 'failed' | null>(null);
  const regionStations = useStationNames(regions && typeof regions === 'object' ? regions.sellers.map((s) => s.station) : []);
  const lookElsewhere = () => { setRegions('reading'); regionSellers(row.bp).then(setRegions, () => setRegions('failed')); };

  // The ore that gives the most of a mineral, on asking (CCP's reprocessing table is a chunk of its own, 481 KB).
  const [ores, setOres] = useState<Record<number, { name: string; perM3: number } | null> | 'reading' | 'failed' | null>(null);
  const mineable = row.materials.filter((m) => ix.b.types[m.type]?.[5] === 1).map((m) => m.type);
  const whichOre = async () => {
    setOres('reading');
    try {
      const [tm, base] = await Promise.all([import('../../data/typeMaterials.json').then((m) => (m.default as unknown as { types: Record<string, Materials> }).types), oreBaseIds()]);
      const ids = Object.values(base).filter((id) => tm[id]?.[2] != null);
      const vols = await Promise.all(ids.map((id) => typeInfo(id).then((t) => ({ id, name: t.name, volume: t.volume }), () => null)));
      const list = vols.filter((x): x is { id: number; name: string; volume: number } => !!x).map((x) => ({ ...x, mats: tm[x.id] }));
      const y = (m: Materials) => yieldOf(m, c.pilot.skills ?? {}, { kind: 'station', base: 0.5, tax: 0 });
      const out: Record<number, { name: string; perM3: number } | null> = {};
      for (const t of mineable) { const best = bestOreFor(t, list, y); out[t] = best ? { name: list.find((x) => x.id === best.id)!.name, perM3: best.perM3 } : null; }
      setOres(out);
    } catch { setOres('failed'); }
  };

  const job = row.job;
  const sb = structureBonus(ix, site.kind);
  const rig = rigFor(ix, site.rigs, site.kind, facts.band, row.product, 'manufacturing');
  const sale = row.sale;
  const listPrice = sale?.list ?? null;
  const setDest = async (id: number) => {
    try { await setDestination(id); toast(`Destination set in ${c.isMain ? 'your' : `${mainName}’s`} client.`, 'info'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
  };
  const destLabel = c.isMain ? 'Set destination' : `Sets ${mainName}’s destination`;
  const time = (s: number) => (s >= DAY_S ? `${(s / DAY_S).toFixed(1)} days` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);

  return (
    <div className="col ind-detail" style={{ gap: 14 }} data-industry="detail">
      <div className="col" style={{ gap: 6 }}>
        <span className="lbl">Materials for a day’s {units(row.runs)} runs at ME {input.me}</span>
        <div className="tbl-scroll">
          <table className="tbl compact rd-table">
            <thead><tr><th className="l">Material</th><th>A day</th><th className="l rd-wide">Each source, delivered</th><th className="l rd-wide">Picked</th><th className="rd-wide">Held here</th></tr></thead>
            <tbody>
              {row.materials.map((m) => {
                const said = m.options.map((o) => `${SOURCE_SAID[o.source]}: ${o.price != null ? isk(o.price) : '–'} (${o.why})`).join(' · ');
                const pick = m.pick ? `${SOURCE_SAID[m.pick]}, ${isk(m.price)}` : '–: nothing can be picked';
                const ore = ores && typeof ores === 'object' ? ores[m.type] : undefined;
                return (
                  <tr key={m.type}>
                    <td className="l rd-main"><span className="nm">{name(m.type)}</span>
                      {m.patient != null && <span className="sub">{isk(m.patient)} if you wait for a bid to fill</span>}
                      {ore !== undefined && <span className="sub">{ore ? `Mined: ${ore.name} gives the most, ${ore.perM3.toFixed(1)} a m³ at ${c.isMain ? 'your' : `${c.name}’s`} yield` : 'No ore the app knows refines into it'}</span>}
                      <span className="rd-phone"><span>{said}</span><span>Picked: {pick}</span></span>
                    </td>
                    <td>{units(m.qty)}</td>
                    <td className="l rd-wide ind-wrap">{said}</td>
                    <td className="l rd-wide">{pick}</td>
                    <td className="rd-wide">{loc == null ? '–' : units(held.units(m.type))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loc == null && <p className="note small" style={{ margin: 0 }}>A home typed by you has no structure ID, so nothing held there is known.</p>}
        {mineable.length > 0 && ores == null && <button type="button" className="link-btn" onClick={() => void whichOre()}>Which ore gives the most of {mineable.length === 1 ? 'it' : 'each'}?</button>}
        {ores === 'reading' && <p className="note small" style={{ margin: 0 }}>Reading CCP’s reprocessing table and the ores…</p>}
        {ores === 'failed' && <p className="note small" style={{ margin: 0 }}>Couldn’t read the ores just now. <button type="button" className="link-btn" onClick={() => void whichOre()}>Try again</button></p>}
        {mineable.length > 0 && <p className="note small" style={{ margin: 0 }}>Mined materials are valued at what they’d sell for, never free. <button type="button" className="link-btn" onClick={() => navigate('hustles/mining')}>Mining’s Best ore</button> says which ore pays most where you are.</p>}
      </div>

      <Tiles min={180} items={[
        { l: 'A run', v: time(row.time), n: `${units(row.runs)} runs a day, ${units(row.makes)} made · ${KIND_SAID[site.kind]}${sb.time < 1 ? ` ×${sb.time}` : ''}${rig.time < 1 ? `, rigs ×${rig.time.toFixed(3)}` : ''}` },
        {
          l: 'The job', v: job ? iskBig(job.total) : '–',
          n: job ? `index ${pct(input.site.index!.manufacturing)} → ${iskBig(job.index)}${job.bonus ? `, bonuses ${iskBigSigned(job.bonus)}` : ''} · facility tax ${job.tax != null ? iskBig(job.tax) : '–: not typed'} · SCC ${iskBig(job.scc)} · ${job.alpha == null ? 'Clone state not read: the 0.25% Alpha tax is left out' : job.alpha ? `Alpha tax ${iskBig(job.alpha)}` : 'no Alpha tax'}` : 'not costed',
          tip: 'The game charges a job on its estimated item value (the ME 0 materials at CCP’s adjusted prices) × runs:\n\n• × the system’s index, less the structure’s and rigs’ cost bonuses on that part;\n• + the facility tax, the 4% SCC surcharge, and 0.25% more for an Alpha.',
        },
        {
          l: sale?.place === 'home' ? 'The sale at home' : 'The sale in Jita', v: listPrice != null ? iskBig(listPrice) : '–',
          n: sale ? `nets ${iskBig(sale.listNet)} listed, ${iskBig(sale.bidNet)} into the best bid · ${units(sale.pace)} a day, ${pct(sale.split, 0)} buyers taking listings (${sale.splitFrom === 'goonmetrics' ? 'even, until the home history is read' : SPLIT_SAID[sale.splitFrom]})${sale.freight ? ` · freight ${isk(sale.freight)} a unit` : ''}` : 'not sold anywhere you said',
        },
        { l: 'Profit a day, one slot', v: iskBigSigned(row.day?.profit), n: row.taxPerPct != null ? `before the facility tax; each 1% costs ${iskBig(row.taxPerPct)} a day` : row.day ? `${units(row.day.units)} sold of ${units(row.makes)} made` : '' },
      ]} />

      {levels && (
        <div className="col" style={{ gap: 6 }}>
          <span className="lbl">Researching it first, at {lab!.at}</span>
          <div className="tbl-scroll">
            <table className="tbl compact" data-industry="me-levels">
              <thead><tr><th className="l nowrap">ME / TE</th><th>Profit a day</th><th>Research, one lab slot</th><th>Research ISK</th></tr></thead>
              <tbody>
                {levels.map((l) => (
                  <tr key={`${l.me}/${l.te}`} className={l.me === input.me && l.te === input.te ? 'on' : undefined}>
                    <td className="l nowrap">ME {l.me} / TE {l.te}</td>
                    <td>{iskBigSigned(l.profit)}</td>
                    <td>{l.days == null ? '–' : l.days === 0 ? 'none' : `${l.days.toFixed(1)} days`}</td>
                    <td>{l.cost == null ? (lab!.site.index ? '–' : '–: no index for the lab’s system') : l.cost === 0 ? 'none' : iskBig(l.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note small" style={{ margin: 0 }}>At {c.isMain ? 'your' : `${c.name}’s`} skills: Metallurgy {c.pilot.skills?.[SKILL.metallurgy] ?? 0}, Research {c.pilot.skills?.[SKILL.research] ?? 0}, Advanced Industry {c.pilot.skills?.[SKILL.advancedIndustry] ?? 0}. ME 8 takes about 18% of ME 10’s time.</p>
        </div>
      )}
      {!lab && <p className="note small" style={{ margin: 0 }}>No Laboratory can be reached on the map from {site.name}, so research isn’t worked out.</p>}

      <div className="col" style={{ gap: 6 }} data-industry="bpo-places">
        <span className="lbl">The original</span>
        <p style={{ margin: 0 }}>{b.v !== '–' ? `${b.v} ${b.n}` : b.n}.</p>
        {w.state === 'forge' && w.stations.map((s) => {
          const sys = graph[findSystem(ix, s) ?? 0];
          const sysId = findSystem(ix, s);
          return <div key={s} className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span>{station(s)}</span>
            <span className="faint">{sys ? `${sys[1]} ${sys[0].toFixed(1)}` : ''}{sysId != null ? ` · ${jitaHigh.get(sysId) ?? jitaAny.get(sysId) ?? '–'} jumps from Jita, ${fromSite.get(sysId) ?? '–'} from ${site.name}` : ''}</span>
            {hasScope(SCOPE.waypoint) && <button type="button" className="link-btn" onClick={() => void setDest(s)}>{destLabel}</button>}
          </div>;
        })}
        {regions == null && <button type="button" className="link-btn" onClick={lookElsewhere}>Look in the regions NPCs seed originals in</button>}
        {regions === 'reading' && <p className="note small" style={{ margin: 0 }}>Reading {Object.keys(NPC_REGIONS).length} regions’ markets…</p>}
        {regions === 'failed' && <p className="note small" style={{ margin: 0 }}>Couldn’t read the regions just now. <button type="button" className="link-btn" onClick={lookElsewhere}>Try again</button></p>}
        {regions && typeof regions === 'object' && (regions.sellers.length ? regions.sellers.slice(0, 8).map((x) => (
          <div key={`${x.region}:${x.station}`} className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span>{regionStations[x.station] ?? `Station #${x.station}`}</span>
            <span className="faint">{NPC_REGIONS[x.region]} · {iskBig(x.price)} · {jitaAny.get(x.system) ?? '–'} jumps from Jita, {fromSite.get(x.system) ?? '–'} from {site.name}</span>
          </div>
        )) : <p className="note small" style={{ margin: 0 }}>NPCs don’t sell it in {Object.values(NPC_REGIONS).join(', ')} either{regions.failed ? ` (${regions.failed} couldn’t be read)` : ''}.</p>)}
      </div>

      <Tiles min={180} items={[
        { l: 'Start-up', v: iskBig(su.total), n: su.total == null ? (bpo == null ? 'no NPC price for the original' : su.research == null ? 'research not worked out' : 'a material can’t be priced') : `original ${iskBig(su.bpo)} · research to ME ${input.me} / TE ${input.te} ${su.research ? iskBig(su.research) : 'none'} · a day’s materials ${iskBig(su.materials)}` },
        { l: 'Held here', v: units(su.heldUnits), n: su.heldUnits ? `cost you ${su.heldCost != null ? iskBig(su.heldCost) : '– (not all bought: no cost)'}; counted in start-up and the list, never in the profit a day` : loc == null ? 'nothing known at a home typed by you' : 'none of its materials held here' },
        { l: 'Payback', v: payback(bpo, row.day?.profit) != null ? `${payback(bpo, row.day?.profit)!.toFixed(1)} days` : '–', n: 'the original at NPCs’ price, out of one slot’s profit a day' },
      ]} />

      <div className="col" style={{ gap: 6 }}>
        <span className="lbl">Shopping list, beyond what’s held</span>
        {shop.length ? shop.map((x) => <div key={x.type} className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span>{units(x.qty)} {name(x.type)}</span><span className="faint">{x.source ? `${SOURCE_SAID[x.source]}, ${isk(x.price)} each` : 'nothing can be picked'}</span>
        </div>) : <p className="note small" style={{ margin: 0 }}>Everything a day’s job needs is held here.</p>}
        {jitaLines.length > 0 && (
          <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => void copyMultibuy(jitaLines.map((x) => `${name(x.type)} ${x.qty}`).join('\n'), jitaLines.length, jitaLines.reduce((s, x) => s + x.qty * (input.market(x.type).jita?.ask ?? 0), 0))}>Copy for Multibuy</button>
        )}
      </div>

      <div className="col" style={{ gap: 6 }} data-industry="steps">
        <span className="lbl">The steps</span>
        <div className="ladder">
          {[
            w.state === 'forge' ? `Buy the original at ${station(w.stations[0])}` : 'Find an original: no NPC sells it in The Forge',
            input.me || input.te ? `Research it to ME ${input.me} / TE ${input.te} at ${lab?.at ?? 'a Laboratory'}${assumed?.days ? `, ${assumed.days.toFixed(1)} days` : ''}` : 'No research: build at ME 0',
            'Buy the materials',
            `Install the job at ${site.name}`,
            sale ? `List at ${sale.place === 'home' ? input.hubName ?? 'home' : 'Jita 4-4'}${listPrice != null ? ` at ${isk(listPrice)}` : ''}` : 'Nowhere you said it may be sold',
          ].map((x, i) => <span key={x} className="step">{i > 0 && <ArrowRight aria-hidden="true" />}<span>{x}</span></span>)}
        </div>
        {listPrice != null && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => void copyPrice(listPrice)}>Copy the price to list at</button>}
      </div>
    </div>
  );
}

/** A station's system, from the bundle's stations. */
const findSystem = (ix: Indexed, station: number): number | null => ix.b.stations.find((s) => s[0] === station)?.[1] ?? null;
```

In `src/styles.css`, after Task 4B's `.ind-sites` rules:

```css
/* The finder (IndustryBuild.tsx): its choices wrap; a row's detail spans the table and wraps its words. */
.ind-choices { gap: 8px 12px; flex-wrap: wrap; align-items: center; }
/* Fixed layout: a row's detail spans the table's own width, and what it holds scrolls inside it (its tables have their own
   .tbl-scroll) rather than widening the finder past the page. */
.ind-finder { table-layout: fixed; width: 100%; }
.ind-finder th, .ind-finder td { white-space: normal; vertical-align: top; }
.ind-finder .ind-c-name { width: 26%; }
.ind-finder .ind-c-bpo { width: 20%; }
.ind-finder .ind-c-day { width: 16%; }
.ind-finder td .sub { white-space: normal; }
.ind-finder tr.detail td { padding: 14px 12px; background: rgba(2, 7, 12, .35); }
.ind-wrap { white-space: normal; min-width: 260px; }
```

(Drafted without `table-layout: fixed`, the open detail's tables widened the finder 269 px past the page at 1,440, and the
column head "Profit a day, one slot, before the facility tax" stood eight lines tall; the head is now the spec's own
"Profit a day, before the facility tax" in a column of its own width.)

Run: `npm run check && npm run build`
Expected: all pass.

- [ ] **Step 8: The plain loads: Build with no site**

In `scripts/pages.mjs`, `PAGES` gains `'hustles/industry/build'` after `'hustles/industry'`, and the plain-load block for
the tab gains, above `if (hash === 'hustles/industry') {`:

```js
      // Build on a ledger with no build site: the finder asks for one, and nothing is ranked.
      if (hash === 'hustles/industry/build' && !(await page.locator('[data-industry="finder-wait"]', { hasText: 'Pick where you build first: add a site under Where you build, below.' }).count())) problems.push('Build with no site doesn’t ask for one');
```

- [ ] **Step 9: The page case: the finder**

Insert above `// --- the end of the industry case` (after Task 4B's block):

```js
    // --- Build: the finder (Task 5B). Before a scan is held, it says so.
    await page.goto(`${BASE}#hustles/industry/build`);
    await page.waitForSelector('[data-industry="build"]', { timeout: 20_000 }).catch(() => problems.push('Build never drew'));
    await page.waitForTimeout(1000);
    if (!(await text('[data-industry="finder-wait"]')).includes('No market scan here yet: the cloud’s comes every morning.')) problems.push(`with no scan held, the finder doesn’t say so: “${await text('[data-industry="build"]')}”`.slice(0, 300));
    // Then a scan as the cloud's morning one leaves it: the Large Trimark Armor Pump I (listed at 7,041,000, reached on 4 of
    // 14 days, 841 a day), its three salvage materials read only for the tab (watchOnly: the finder uses them all the same),
    // a Caracal and its minerals. ESI answers adjusted prices and live books; the cloud the NPC row. Three sites: Itamo's
    // station (the default), UALX-3 (1% typed, an L-Set Equipment rig) and C-J6MT (tax not typed), Brave Freight to both.
    const day5 = (i) => iso(now - i * 86400_000).slice(0, 10);
    const st5 = (typeId, perDay, highs, extra = {}) => ({ typeId, at: iso(now - 3600_000), daysTraded: 30, tradesPerDay: 40, unitsPerDay: perDay, spikiness: 0.05, dailyRange: 0.1, trend: 0,
      avgPrice: highs[0], spark: Array(30).fill(perDay), buyerShare: 0.5, lows14: Array(14).fill(highs[0] * 0.9), lowsEnd: day5(1), highs14: highs, lastMove: 0, ...extra });
    const bk5 = (bid, ask, sold) => ({ at: iso(now - 3600_000), bestBuy: bid, bestSell: ask, buyOrders: 5, sellOrders: 20, topBuys: [{ price: bid, volume: 500 }], topSells: [{ price: ask, volume: 5_000_000 }], npcSell: false, ...(sold ? { sold } : {}) });
    const PUMP = 25894, CARACAL = 621, MINERAL = { 34: 3.5, 35: 13, 36: 40, 37: 160, 38: 600, 39: 1150, 40: 1500 };
    const ITEMS = {
      [PUMP]: [st5(PUMP, 841, [7_100_000, 7_050_000, 7_045_000, 7_041_000, ...Array(10).fill(6_960_000)]), bk5(6_240_000, 7_041_000, { sell: 1690, buy: 62, single: { sell: 0, buy: 0 }, orders: { sell: 20, buy: 5 } })],
      25601: [st5(25601, 20_000, Array(14).fill(4300), { watchOnly: true }), bk5(3900, 4213)],
      25605: [st5(25605, 20_000, Array(14).fill(26_500), { watchOnly: true }), bk5(24_000, 25_980)],
      25590: [st5(25590, 20_000, Array(14).fill(85_000), { watchOnly: true }), bk5(80_000, 84_000)],
      [CARACAL]: [st5(CARACAL, 40, Array(14).fill(14e6)), bk5(11e6, 14e6)],
      ...Object.fromEntries(Object.entries(MINERAL).map(([t, p]) => [t, [st5(Number(t), 1e7, Array(14).fill(p * 1.1)), bk5(p * 0.95, p)]])),
    };
    const SCAN = { stats: Object.fromEntries(Object.entries(ITEMS).map(([t, [s]]) => [t, s])), books: Object.fromEntries(Object.entries(ITEMS).map(([t, [, b]]) => [t, b])),
      sample: { at: iso(now - 3600_000), totalPages: 400, sampledPages: 400, minSampled: 1, counts: {} }, runs: { cloud: iso(now - 3600_000) } };
    ESI['/markets/prices/'] = (url, req, json) => json(Object.entries(FX.adjusted).map(([t, p]) => ({ type_id: Number(t), adjusted_price: p, average_price: p })));
    ESI['/markets/10000002/orders/'] = (url, req, json) => {
      const t = Number(url.searchParams.get('type_id')), b = ITEMS[t]?.[1];
      if (!b) return json([]);
      const o = (id, buy, price, n) => ({ order_id: t * 10 + id, type_id: t, location_id: 60003760, system_id: 30000142, is_buy_order: buy, price, volume_remain: n, volume_total: n, issued: iso(now - 86400_000), duration: 90, min_volume: 1, range: 'station' });
      return json([o(1, true, b.bestBuy, 500), o(2, false, b.bestSell, 5_000_000)]);
    };
    let npcAnswer = { complete: { at: iso(now - 3 * 3600_000), complete: true, pagesFailed: 0, sellers: { 25895: [1_250_000, [60001483, 60001486]] } }, partial: null };
    CLOUD['/v1/pull'] = (url, req, json) => json({ rev: 1, next: null, records: [], docs: [] });
    CLOUD['/v1/push'] = (url, req, json) => json({ rev: 2 });
    CLOUD['/v1/industry/npc'] = (url, req, json) => (npcAnswer === 404 ? json({ error: 'Not found' }, 404) : json(npcAnswer));
    const BRAVE = [{ id: 'brave-jita-ualx', name: 'Brave Freight, Jita ↔ UALX-3', a: 30000142, b: 30004807, perM3: 900, collateral: 0.007875, min: 5e6, source: 'Brave wiki, 3 June 2026' },
      { id: 'brave-jita-cj6', name: 'Brave Freight, Jita ↔ C-J6MT', a: 30000142, b: 30000772, perM3: 1150, collateral: 0.007875, min: null, source: 'Brave Freight’s calculator, 9 October 2026' }];
    const DOC = { sites: [
      { id: 'npc:60001483', name: 'Station 60001483', systemId: 30000119, kind: 'npc', stationId: 60001483, rigs: [], tax: 0.0025 },
      { id: 'home:30004807', name: 'Home in UALX-3', systemId: 30004807, kind: 'azbel', rigs: [37170], tax: 0.01 },
      { id: 'home:30000772', name: 'Home in C-J6MT', systemId: 30000772, kind: 'raitaru', rigs: [], tax: null },
    ], site: 'npc:60001483', sell: 'jita', hub: null, hubFees: {}, freight: BRAVE, share: 10, noShipsToJita: true, assume: { me: 0, te: 0 } };
    const CLOUD_STATE = { charId: ownerAuth().characterId, rev: 1, started: true, dirty: { r: [], d: [] } };
    await page.goto(SEED_PAGE);
    await seed({ ...ledger, industry: DOC, cloud: CLOUD_STATE }, { alts: altStore, cache: { prospects: SCAN } });
    const finder = async () => {
      await page.goto(`${BASE}#hustles/industry/build`);
      await page.reload();
      await page.waitForSelector('[data-industry="finder"] [data-bp="25895"]', { timeout: 30_000 }).catch(async () => problems.push(`the finder never priced the pump: “${(await text('[data-industry="build"]')).slice(0, 300)}”`));
      await page.waitForTimeout(1200);
    };
    await finder();
    // Headers and labels are drawn in capitals: compare words, not case.
    const head = () => page.locator('.ind-finder thead').innerText().then((t) => t.replace(/\s+/g, ' ').toLowerCase()).catch(() => '');
    const count = await text('[data-industry="finder-count"]');
    if (!count.includes('priced at Station 60001483')) problems.push('the finder doesn’t say which site it priced at');
    if (!/aren’t priced: [\d,]+ have no Jita book this morning/.test(count)) problems.push(`the finder doesn’t count what has no Jita book this morning: “${count}”`);
    if ((await head()).includes('before the facility tax')) problems.push('a station’s known 0.25% tax, and the head says “before the facility tax”');
    const pump = await text('[data-bp="25895"]');
    if (!pump.includes('at Station 60001483 (and 1 more)')) problems.push(`the pump’s original isn’t NPCs’ at Itamo’s station: “${pump}”`);
    if (!pump.includes('Jita’s book now')) problems.push('the pump, a top row, isn’t said to be on Jita’s book now after the live read');
    if (!(await text('[data-bp="687"]')).includes('NPCs don’t sell it in The Forge; CCP’s base price 82.5 M ISK')) problems.push('the Caracal’s original doesn’t say NPCs don’t sell it in The Forge, with CCP’s base price');
    // At C-J6MT: no tax typed, so ranked before it, said in the head and each row; ships stay home.
    await page.locator('select[aria-label="Build at"]').selectOption({ label: 'Home in C-J6MT' });
    await page.waitForTimeout(1500);
    if (!(await head()).includes('profit a day, before the facility tax')) problems.push(`with C-J6MT’s tax not typed, the head doesn’t say “Profit a day, before the facility tax”: “${await head()}”`);
    if (!(await text('[data-bp="25895"]')).includes('each 1% of tax:')) problems.push('the pump’s row doesn’t say what each 1% of tax costs a day');
    if (!/\d+ ships stay home: never haul ships to Jita is on\./.test(await text('[data-industry="finder-count"]'))) problems.push('from a null-sec site, it doesn’t say ships stay home');
    if (await page.locator('[data-bp="687"]').count()) problems.push('a Caracal built in C-J6MT is offered for sale in Jita with “never haul ships to Jita” on');
    // The pump's detail.
    await page.locator('[data-bp="25895"] .expander').click();
    await page.waitForTimeout(800);
    const detail = (await text('[data-industry="detail"]')).toLowerCase();
    for (const t of ['Materials for a day’s', 'Researching it first, at', 'ME 10 / TE 20', 'Install the job at Home in C-J6MT', 'Copy for Multibuy', 'Shopping list, beyond what’s held', 'A home typed by you has no structure ID, so nothing held there is known.'])
      if (!detail.includes(t.toLowerCase())) problems.push(`the pump’s detail doesn’t say “${t}”`);
    if (SHOTS) { await page.locator('[data-industry="detail"]').scrollIntoViewIfNeeded().catch(() => undefined); await page.screenshot({ path: `${SHOTS}-industry-detail.png` }); }
    // The NPC row: a partial read only, then a cloud a version behind.
    npcAnswer = { complete: null, partial: { at: iso(now - 3600_000), complete: false, pagesFailed: 3, sellers: {} } };
    await finder();
    if (!(await text('[data-bp="25895"]')).includes('No NPC seller found (this morning’s read missed 3 pages); base price 1.25 M ISK')) problems.push('after a partial read alone, the pump doesn’t say no seller was found and how many pages were missed');
    npcAnswer = 404;
    await finder();
    if (!(await text('[data-bp="25895"]')).includes('The cloud is a version behind: NPC sellers come once it’s updated')) problems.push('with the cloud a version behind, the pump’s original doesn’t say so');
    if (/NPCs don’t sell it in The Forge/.test(await text('[data-industry="finder"]'))) problems.push('with the cloud a version behind, a row says NPCs don’t sell it');
    const finderFit = await sideways(page, '[data-industry="finder"] .tbl-scroll');
    if (!PHONE && finderFit && finderFit.over > 0) problems.push(`the finder scrolls sideways at 1,440 (${finderFit.over} px)`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-industry-finder.png` });
```

Run: `LEDGER=industry PAGE=hustles/industry npm run check-pages` and the same with `check-phone`; then
`PAGE=hustles/industry npm run check-pages` (every ledger, the two plain pages included).
Expected: every load `ok`. Drafted and run on this plan's code: 9 loads at 1,440 and the case at 390 passed.

Plant each and see the case fail, then undo:
- `bpoSaid`: drop the `behind` line (a 404 falls through to "The cloud hasn't run a morning scan…"): "with the cloud a version
  behind, the pump's original doesn't say so".
- `IndustryBuild`: the head always `'Profit a day, one slot'`: "doesn't say “Profit a day, before the facility tax”".
- `useFinder`: `noShipsToJita: false` in `input`: "a Caracal built in C-J6MT is offered for sale in Jita with “never haul
  ships to Jita” on" fails.

- [ ] **Step 10: A look in a browser**

Run the case with `SHOTS=.playwright-mcp/industry/5b` at both widths and look at `-industry-finder.png` and
`-industry-detail.png`: the choices on two rows, the count line, the table inside the page at 1,440 with the open row's
detail (materials, the four tiles, ME levels, the original, start-up, the shopping list, the steps) spanning it; on a
phone, each row folded under its name. Then `npm run dev` on the real store with the cloud on: Build at an NPC station
near Jita ranks within a second or two of the scan loading; the top rows switch to "Jita's book now"; opening a row and
"Look in the regions NPCs seed originals in" reads seven regions once (Network).

- [ ] **Step 11: The notes**

Append to `docs/notes/industry.md`:

```markdown
- **The finder** (`industryFinder.ts`, `IndustryBuild.tsx`, `IndustryDetail.tsx`): every Tech I blueprint (1,652) ranked
  for the default site at the shown character's skills, fees and clone, by profit a day for one factory slot; first on the
  morning's books, then the top 40 rows' products and materials on live ones (the Loyalty pattern), each row saying which.
  It waits, saying what for, until a site, the skills, the scan, ESI's indices and CCP's adjusted prices are in; nothing is
  ranked on a guess. Books are everyone else's (`othersBook`). A row not priced is counted by why ("1,650 have no Jita book
  this morning"), never shown at 0. Decisions (site, share, ships switch, ME/TE assumed) are the synced doc's; kind, "Can
  build now", "BPO up to", the sort and the open row are this browser's (`jita-ledger:industry-finder`,
  `jita-ledger:industry-open`).
- **A site whose facility tax isn't typed is ranked before it** (the user's own case, a home they can't dock in): the head
  reads "Profit a day, before the facility tax" and each row "each 1% of tax: X a day".
- **The original's price**: NPCs' in The Forge from the morning's NPC row ("1.25 M ISK at <station> (and 1 more)"); not
  there after a complete read, "NPCs don't sell it in The Forge; CCP's base price X" with no payback; after a partial read
  alone, "No NPC seller found (this morning's read missed N pages)". The cloud off, a version behind (404) or failing says
  which, never that NPCs don't sell it. On asking, a row reads the seven regions the research found NPCs seeding originals
  in (Lonetrek, Domain, Genesis, Syndicate, Outer Ring, Pure Blind, Great Wildlands).
- **Mined materials**: "Which ore gives the most?" loads CCP's reprocessing table (481 KB, only then) and the base ores'
  volumes, and names the ore giving the most of each mineral a m³ at the character's yield in Jita 4-4; Mining's Best ore is
  linked for where it pays most.
```

Append to `docs/notes/limits.md`:

```markdown
- **Selling at the industry share of each side's pace is a guess** (10% unless typed), and profit a day is linear in it. No
  competition, undercutting or relist fees are modelled. **Materials are bought at today's asks**; a patient bid is shown,
  not assumed. **Mined materials cost what they'd sell for**, never nothing, and are counted only for a builder with mining
  records in the last 30 days.
- **A structure's facility tax and rigs are typed until measured** (stage 2 measures the tax); until then profit is ranked
  before the tax, said. **NPC BPO places outside The Forge are read when a row is opened**; the list's price elsewhere is
  CCP's base price.
```

- [ ] **Step 12: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass.

- [ ] **Step 13: Commit**

```bash
git add src/lib/industryRank.ts src/lib/cloud.ts src/components/hustles/industryMarket.ts src/components/hustles/industryFinder.ts \
  src/components/hustles/IndustryBuild.tsx src/components/hustles/IndustryDetail.tsx src/styles.css scripts/check.mjs scripts/pages.mjs \
  docs/notes/industry.md docs/notes/limits.md
git commit -m "$(cat <<'MSG'
Industry: the finder, every Tech I blueprint ranked for your site, and each row's detail

What was missing: the spec's "Build: the finder": what to build, where, and what it pays, at the shown character's
skills and fees, for one factory slot.

What it is: Build ranks the 1,652 Tech I blueprints that aren't invention products or capital hulls for the default
site (rankBuilds), first on the morning scan's books, then the top 40 rows' products and materials on Jita's books now.
It waits, saying what for, until the site, skills, scan, ESI's indices and CCP's adjusted prices are in. Choices: the
site, the industry share, the ME/TE assumed, never haul ships to Jita (synced); kind, Can build now, BPO up to and the
sort (this browser's). A row opens to its materials and each source, the job's cost broken down, the sale and its pace,
profit at each ME level with the research it takes, where NPCs sell the original (The Forge, and seven regions on
asking), start-up, the shopping list with Copy for Multibuy, and the steps.

States said, never a zero: no scan held, no site, NPCs not in The Forge after a complete read, no seller found after a
partial one, the cloud off or a version behind, a tax not typed (ranked before it, each 1%'s cost beside), ships kept
home, rows not priced counted by why.

Evidence: the page case on the research's pump at three sites, its NPC row complete, partial and 404, its detail; the
table fits at 1,440 (drafted, an open detail widened it 269 px). The 404 falling through to "no scan yet", the head without
"before the facility tax" and ships allowed to Jita each failed it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
MSG
)"
```

---
### Task 6: Home prices from Goonmetrics in the cloud, and selling at home in the finder

**Files:**
- Create: `src/lib/homeMarket.ts`, `worker/migrations/0019_home_prices.sql`, `worker/src/goonmetrics.ts`,
  `scripts/fixtures/goonmetrics-34.xml`
- Modify: `worker/src/index.ts` (the route, and the `37` cron's chain), `src/lib/cloud.ts` (`cloudHomePrices`),
  `src/components/hustles/industryMarket.ts` (`useHomePrices`, `useHomeHistory`), `src/components/hustles/industryFinder.ts`
  (the hub, home prices and history into the finder; `homeSaid`), `src/components/hustles/IndustryBuild.tsx` (Home hub,
  Sell at, Broker fee at the hub, the line saying how old the prices are, the head), `src/components/hustles/IndustryDetail.tsx`
  (a sale tile per place), `scripts/check.mjs`, `scripts/check-worker.mjs`, `scripts/pages.mjs`, `docs/notes/industry.md`,
  `docs/notes/limits.md`

**Interfaces:**
- Consumes: `HomeQuote`, `Market.home`, `Market.homeHist`, `RowInput.sell`, `RowInput.fees.hubBroker`, `RowInput.legs.home`,
  `RowInput.hubName`, `Row.sales`, `Row.brokerPerPct`, `Sale.{place, why, brokerKnown, paceFrom, splitFrom}` (Task 3: the
  selling rules, already tested there); `IndustryDoc.{hub, sell, hubFees, freight}` (Task 4A); `legFor` (Task 4B);
  `useFinder`, `Finder`, `IndustryBuild`, `IndustryDetail` (Task 5B); `src/data/industryTypes.json`'s `watch` (Task 1);
  `BadRequest` (worker/src/sync.ts).
- Produces:
  - `src/lib/homeMarket.ts`: `HOME_HUBS` (each `{ id, name, short, systemId, region, regionName }`), `type HomeHub`,
    `hubOf(id): HomeHub | null`, `HOME_STALE_MS`, `type HomeRow = [updated, weekly, buy, buyListed, sell, sellListed]`,
    `parseGoonmetrics(xml): Record<number, HomeRow>`, `homeQuote(row?): HomeQuote | null`.
  - `worker/src/goonmetrics.ts`: `GOONMETRICS_ON`, `REFRESH_MS`, `refreshHomePrices(db, now?, types?, pause?, on?)`,
    `homePrices(db, hub, on?)`.
  - `GET /v1/home/prices?hub=` → `{ off: true } | { hub, source, at, prices: Record<type, HomeRow> } | null`; 400 for a hub
    the cloud doesn't read.
  - `cloudHomePrices(hub)` (cloud.ts); `type HomeState`, `useHomePrices(hub)`, `useHomeHistory(types, region)`
    (industryMarket.ts); `Finder.hub`, `Finder.home`, `homeSaid(f, now, ago)` (industryFinder.ts). Task 7's ladder reads
    `useFinder` as it stands after this task.

**Ship-safety.** The migration only adds a table, applied before the Worker deploys. A site ahead of its Worker gets 404
from `/v1/home/prices` and says "The cloud is a version behind: home prices come once it's updated", selling in Jita only
meanwhile (a row offered at home with no prices has no home sale). A Worker ahead of its site reads Goonmetrics with nobody
asking. Goonmetrics is read only from the cloud (its API sends no CORS header), with a User-Agent naming the project only.

- [ ] **Step 1: Write the failing tests**

Copy the research's answer for Tritanium at UALX-3 (read 10 October 2026, 05:44:18 UTC) into the fixtures:

```bash
cp .playwright-mcp/research/industry-spec/gm-api-34.xml scripts/fixtures/goonmetrics-34.xml
```

It is exactly this (432 bytes; write it by hand if the research folder isn't on the machine):

```xml
<goonmetrics method="price_data" version="1.0">
  <price_data>
    
    <type id="34">
      <updated>2026-10-10T05:15:12Z</updated>
      <all>
        <weekly_movement>1236237101.9</weekly_movement>
      </all>
      <buy>
        <max>3.21</max>
        <listed>898989626</listed>
      </buy>
      <sell>
        <min>3.52</min>
        <listed>665373133</listed>
      </sell>
    </type>
    
  </price_data>
</goonmetrics>
```

Add to `scripts/check.mjs`, after Task 5B's section:

```js
console.log('\n--- Industry: home prices from Goonmetrics (homeMarket.ts) ---');
{
  const H = await import('../src/lib/homeMarket.ts');
  const fsH = await import('node:fs');
  // Goonmetrics' answer for Tritanium at UALX-3, read 10 October 2026 05:44 UTC (scripts/fixtures/goonmetrics-34.xml).
  const xml = fsH.readFileSync(new URL('./fixtures/goonmetrics-34.xml', import.meta.url), 'utf8');
  eq('  a type\'s row: updated, weekly movement, best buy and listed, best sell and listed', H.parseGoonmetrics(xml), { 34: ['2026-10-10T05:15:12Z', 1236237101.9, 3.21, 898989626, 3.52, 665373133] });
  // A type with no data, and a side with no orders (as Goonmetrics writes them; seen on one type, with 23 listed).
  const none = '<goonmetrics><price_data><type id="7"><updated>2026-10-10T05:00:00Z</updated><all><weekly_movement>-1.0</weekly_movement></all><buy><max>0.00</max><listed>0</listed></buy><sell><min>120.5</min><listed>23</listed></sell></type></price_data></goonmetrics>';
  eq('    weekly movement −1 is not known, a side with nothing listed is none: never 0', H.parseGoonmetrics(none), { 7: ['2026-10-10T05:00:00Z', null, null, 0, 120.5, 23] });
  eq('  a kept row as the finder reads it, and none for a type the read doesn\'t have', [H.homeQuote(['t', 700, 3.21, 9, 3.52, 9]), H.homeQuote(undefined)], [{ sell: 3.52, buy: 3.21, weekly: 700, at: 't' }, null]);
  eq('  the hubs: UALX-3\'s 1st Byzantigoon (Tenerifis) and C-J6MT (Insmother); 1DQ1-A left out', H.HOME_HUBS.map((h) => [h.id, h.short, h.region]), [[1046664001931, 'UALX-3', 10000061], [1049588174021, 'C-J6MT', 10000009]]);
}
```

Add to `scripts/check-worker.mjs`, after Task 5A's section (it uses the file's `eq`, `rejects` and `d1`):

```js
console.log('\n--- home prices from Goonmetrics, read gently by the cloud (Task 6) ---');
{
  const { refreshHomePrices, homePrices, REFRESH_MS } = await import('../worker/src/goonmetrics.ts');
  const NOW = Date.parse('2026-10-10T12:37:00Z');
  const xmlFor = (ids) => `<goonmetrics method="price_data" version="1.0"><price_data>${ids.map((id) => `<type id="${id}"><updated>2026-10-10T12:00:00Z</updated><all><weekly_movement>700</weekly_movement></all><buy><max>9.5</max><listed>100</listed></buy><sell><min>10</min><listed>200</listed></sell></type>`).join('')}</price_data></goonmetrics>`;
  // Every call answered from the type IDs it asks for, its User-Agent and size recorded; `fail` makes chosen calls fail.
  const run = async (db, { types, fail = () => false, now = NOW, on = true } = {}) => {
    const real = globalThis.fetch, calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const ids = (url.searchParams.get('type_id') ?? '').split(',').map(Number);
      calls.push({ host: url.host, path: url.pathname, hub: Number(url.searchParams.get('station_id')), n: ids.length, ua: init.headers?.['User-Agent'] });
      if (fail(calls.length)) return new Response('busy', { status: 503 });
      return new Response(xmlFor(ids), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    };
    let pauses = 0;
    try { return { r: await refreshHomePrices(db, now, types, async () => { pauses++; }, on), calls, pauses }; } finally { globalThis.fetch = real; }
  };
  const types = Array.from({ length: 120 }, (_, i) => 1000 + i);
  const db = d1();
  const first = await run(db, { types });
  eq('  both hubs read, 50 types a call (3 calls a hub), a pause before every call but the first', [first.r.done, first.calls.length, first.calls.map((c) => c.n), first.pauses], [{ 'UALX-3': 'read', 'C-J6MT': 'read' }, 6, [50, 50, 20, 50, 50, 20], 5]);
  eq('    from Goonmetrics\' API, with a User-Agent naming the project only', [first.calls[0].host, first.calls[0].path, first.calls[0].ua], ['goonmetrics.apps.goonswarm.org', '/api/price_data/', 'jita-ledger (hobby tool)']);
  eq('    one row a hub, every type in it', db.rows('SELECT hub, source FROM home_prices ORDER BY hub').map((r) => [r.hub, r.source]), [[1046664001931, 'goonmetrics'], [1049588174021, 'goonmetrics']]);
  const served = await homePrices(db, 1046664001931);
  eq('  the route serves a hub\'s read', [Object.keys(served.prices).length, served.prices[1000]], [120, ['2026-10-10T12:00:00Z', 700, 9.5, 100, 10, 200]]);
  eq('  within six hours nothing is read again', [(await run(db, { types, now: NOW + REFRESH_MS - 60_000 })).calls.length], [0]);
  // Six hours on, C-J6MT's second call fails: its last good row stays; UALX-3's is new.
  const before = db.rows('SELECT at FROM home_prices WHERE hub = ?', 1049588174021)[0].at;
  const later = await run(db, { types, now: NOW + REFRESH_MS, fail: (n) => n === 5 });
  eq('  a hub whose read fails keeps its last good row, and says why', [later.r.done, db.rows('SELECT at FROM home_prices WHERE hub = ?', 1049588174021)[0].at === before, later.r.error], [{ 'UALX-3': 'read', 'C-J6MT': 'failed' }, true, 'Goonmetrics answered 503 for C-J6MT']);
  const down = await run(d1(), { types, fail: () => true });
  eq('  three failed calls in a row end the round: the site is down', [down.calls.length, down.r.stopped], [3, true]);
  eq('  switched off: nothing read, and the route says so', [(await run(d1(), { types, on: false })).calls.length, await homePrices(d1(), 1046664001931, false)], [0, { off: true }]);
  eq('  before its first read: nothing, not an empty price list', await homePrices(d1(), 1049588174021), null);
  await rejects('  a hub the cloud doesn\'t read is refused', () => homePrices(d1(), 1030049082711), /Not a hub the cloud reads/);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -A3 "Goonmetrics"`
Expected: both sections fail to import (`homeMarket.ts`, `goonmetrics.ts` missing).

- [ ] **Step 3: The parser and the hubs**

Create `src/lib/homeMarket.ts`:

```ts
import type { HomeQuote } from './industryRank';

/**
 * Home prices for the Industry tab (docs/notes/industry.md): Goonmetrics, a Goonswarm tool ("Goonmetrics © GARPA
 * 2012–2026") that gathers data from CCP and from members' client uploads, read by the cloud only (its API sends no CORS
 * header), gently, every six hours. Pure: the Worker parses with it and the browser reads what the Worker keeps.
 */

/** The hubs Goonmetrics tracks that the tab reads (its importing page, 9 October 2026). 1DQ1-A is left out: the research found almost nothing listed there. */
export const HOME_HUBS = [
  // The Imperium's market at UALX-3 (the user, 10 October 2026: "1st Byzantigoon is probably the goons and therefor the imperium alliances market").
  { id: 1046664001931, name: 'UALX-3 - 1st Byzantigoon', short: 'UALX-3', systemId: 30004807, region: 10000061, regionName: 'Tenerifis' },
  // Goonswarm's staging.
  { id: 1049588174021, name: 'C-J6MT - Ceci n’est pas une keeptar', short: 'C-J6MT', systemId: 30000772, region: 10000009, regionName: 'Insmother' },
] as const;
export type HomeHub = (typeof HOME_HUBS)[number];
export const hubOf = (id: number | null | undefined): HomeHub | null => HOME_HUBS.find((h) => h.id === id) ?? null;

/** Home prices older than this say so with their time. */
export const HOME_STALE_MS = 24 * 3600_000;

/** One type's prices at a hub as kept: its `updated`, weekly movement, best buy and units listed, best sell and units listed; null where not known or none. */
export type HomeRow = [updated: string, weekly: number | null, buy: number | null, buyListed: number, sell: number | null, sellListed: number];

/**
 * Goonmetrics' `/api/price_data/` XML, by type. A type with no data reads `weekly_movement` −1.0 (not known: null), and a
 * side with no orders reads 0.00 with 0 listed (none: null), never a price or pace of 0. Read with a pattern a `<type>` at a
 * time: Workers have no DOMParser.
 */
export function parseGoonmetrics(xml: string): Record<number, HomeRow> {
  const out: Record<number, HomeRow> = {};
  const num = (block: string, re: RegExp) => { const m = re.exec(block); const n = m ? Number(m[1]) : NaN; return Number.isFinite(n) ? n : null; };
  for (const m of xml.matchAll(/<type id="(\d+)">([\s\S]*?)<\/type>/g)) {
    const t = Number(m[1]), b = m[2];
    const updated = /<updated>([^<]+)<\/updated>/.exec(b)?.[1] ?? '';
    const weekly = num(b, /<weekly_movement>([^<]+)<\/weekly_movement>/);
    const buy = /<buy>([\s\S]*?)<\/buy>/.exec(b)?.[1] ?? '', sell = /<sell>([\s\S]*?)<\/sell>/.exec(b)?.[1] ?? '';
    const max = num(buy, /<max>([^<]+)<\/max>/), buyListed = num(buy, /<listed>([^<]+)<\/listed>/) ?? 0;
    const min = num(sell, /<min>([^<]+)<\/min>/), sellListed = num(sell, /<listed>([^<]+)<\/listed>/) ?? 0;
    out[t] = [updated, weekly != null && weekly >= 0 ? weekly : null, max != null && max > 0 && buyListed > 0 ? max : null, buyListed, min != null && min > 0 && sellListed > 0 ? min : null, sellListed];
  }
  return out;
}

/** A type's kept row as the finder reads it (industryRank's HomeQuote); null when the hub's read doesn't have it. */
export const homeQuote = (row: HomeRow | undefined): HomeQuote | null => (row ? { sell: row[4], buy: row[2], weekly: row[1], at: row[0] } : null);
```

- [ ] **Step 4: The table, the reader, the route and the cron**

Create `worker/migrations/0019_home_prices.sql`:

```sql
-- Home prices for the Industry tab, read by the cloud from Goonmetrics (a Goonswarm tool; its API sends no CORS header, so
-- browsers can't): one row per hub, every watched type's prices with each one's own `updated`, refreshed every six hours
-- (worker/src/goonmetrics.ts). A failed read leaves the last good row. Only adds a table: old code runs on it as before.
CREATE TABLE IF NOT EXISTS home_prices (
  hub INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  at INTEGER NOT NULL,
  data TEXT NOT NULL
);
```

Create `worker/src/goonmetrics.ts`:

```ts
/**
 * Home prices for the Industry tab (docs/notes/industry.md), read from Goonmetrics: a Goonswarm tool that publishes no
 * terms, no key and no limit, so it's read gently. Every six hours per hub, after the alts' hourly read on the `37` cron;
 * one call every 1.5 s, at most 50 types a call (its API's own limit); a User-Agent naming the project only. Each hub's
 * read is one row in `home_prices`; a hub whose read fails keeps its last good row, three failed calls in a row end the
 * round, and it isn't a watched job (as Abyss Tracker: someone else's site, and the tab says how old its figures are).
 * `GOONMETRICS_ON` switches it off, for if its authors object: off, nothing is read and the route says so.
 */
import INDUSTRY from '../../src/data/industryTypes.json' with { type: 'json' };
import { HOME_HUBS, parseGoonmetrics, type HomeRow } from '../../src/lib/homeMarket';
import { BadRequest } from './sync';

export const GOONMETRICS_ON = true;
const API = 'https://goonmetrics.apps.goonswarm.org/api/price_data/';
const HEADERS = { 'User-Agent': 'jita-ledger (hobby tool)' };
/** How old a hub's row may be before the round reads it again. */
export const REFRESH_MS = 6 * 3600_000;
const PAUSE_MS = 1500;
const PER_CALL = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads each hub whose row is six hours old or more. Returns what it did: per hub read, skipped (fresh) or failed (with the
 * first error), and whether three failures in a row stopped it. `pause` and `on` are for the tests.
 */
export async function refreshHomePrices(db: D1Database, now = Date.now(), types: readonly number[] = (INDUSTRY as { watch: number[] }).watch, pause: (ms: number) => Promise<unknown> = sleep, on = GOONMETRICS_ON) {
  if (!on) return { off: true as const };
  const rows = (await db.prepare('SELECT hub, at FROM home_prices').all<{ hub: number; at: number }>()).results;
  const at = new Map(rows.map((r) => [r.hub, r.at]));
  const done: Record<string, 'read' | 'fresh' | 'failed'> = {};
  let error: string | null = null, inARow = 0, calls = 0;
  for (const hub of HOME_HUBS) {
    if (now - (at.get(hub.id) ?? 0) < REFRESH_MS) { done[hub.short] = 'fresh'; continue; }
    const got: Record<number, HomeRow> = {};
    let ok = true;
    for (let i = 0; i < types.length; i += PER_CALL) {
      if (calls++) await pause(PAUSE_MS);
      try {
        const res = await fetch(`${API}?station_id=${hub.id}&type_id=${types.slice(i, i + PER_CALL).join(',')}`, { headers: HEADERS });
        if (!res.ok) { await res.body?.cancel(); throw new Error(`Goonmetrics answered ${res.status} for ${hub.short}`); }
        Object.assign(got, parseGoonmetrics(await res.text()));
        inARow = 0;
      } catch (e) {
        ok = false;
        error ??= e instanceof Error ? e.message : String(e);
        if (++inARow >= 3) { done[hub.short] = 'failed'; return { done, error, stopped: true }; }
      }
    }
    if (!ok) { done[hub.short] = 'failed'; continue; }
    await db.prepare(`INSERT INTO home_prices (hub, source, at, data) VALUES (?1, 'goonmetrics', ?2, ?3)
      ON CONFLICT(hub) DO UPDATE SET source = excluded.source, at = excluded.at, data = excluded.data`).bind(hub.id, now, JSON.stringify(got)).run();
    done[hub.short] = 'read';
  }
  return { done, error, stopped: false };
}

/** For `GET /v1/home/prices?hub=`: a hub's last good read, null before the first, or `off` when switched off. */
export async function homePrices(db: D1Database, hub: number, on = GOONMETRICS_ON): Promise<{ off: true } | { hub: number; source: string; at: string; prices: Record<string, HomeRow> } | null> {
  if (!HOME_HUBS.some((h) => h.id === hub)) throw new BadRequest('Not a hub the cloud reads');
  if (!on) return { off: true };
  const r = await db.prepare('SELECT hub, source, at, data FROM home_prices WHERE hub = ?1').bind(hub).first<{ hub: number; source: string; at: number; data: string }>();
  return r ? { hub: r.hub, source: r.source, at: new Date(r.at).toISOString(), prices: JSON.parse(r.data) } : null;
}
```

In `worker/src/index.ts`, import beside Task 5A's `npcRows`:

```ts
import { homePrices, refreshHomePrices } from './goonmetrics';
```

Replace the `ALTS_CRON` branch of `scheduled`:

```ts
    if (event.cron === ALTS_CRON) {
      ctx.waitUntil(altsHourly(env).then((r) => console.log('alts hourly', JSON.stringify(r))).catch((e) => console.error('alts hourly failed', e))
        // Then home prices for the Industry tab, when a hub's are six hours old (goonmetrics.ts): after the alts, never in
        // their way; not a watched job (someone else's site, and the tab says how old its figures are).
        .finally(async () => {
          try { console.log('goonmetrics', JSON.stringify(await refreshHomePrices(env.DB))); } catch (e) { console.error('goonmetrics failed', e); }
        }));
      return;
    }
```

(`finally` waits for the promise its callback returns, so `waitUntil` covers the read. Its time is waiting, not CPU:
38 calls a hub at 1.5 s apart is about two minutes for both hubs, 59 a hub with Task 8's watch set; the hourly cron's
CPU limit isn't touched, and its 15-minute wall time is far off.)

And beside Task 5A's `/v1/industry/npc` route:

```ts
      // A home hub's prices as the cloud last read them from Goonmetrics (goonmetrics.ts); 400 for a hub it doesn't read.
      if (url.pathname === '/v1/home/prices' && request.method === 'GET') return json(await homePrices(env.DB, Number(url.searchParams.get('hub'))), 200, c);
```

Then apply the migration locally for `wrangler dev`: `npx wrangler d1 migrations apply jita-ledger --local`.

- [ ] **Step 5: Run the tests to see them pass, then plant each rule wrong**

Run: `npm run check`
Expected: all pass, `tsc -p worker` (in `npm run build`) too.

Plant, run, see it fail, undo:
- `parseGoonmetrics`: drop `weekly >= 0 ?` (keep −1): "weekly movement −1 is not known" fails.
- `parseGoonmetrics`: drop `&& buyListed > 0` and `max > 0` (keep 0.00): the same test fails on the buy side.
- `refreshHomePrices`: `PER_CALL = 100`: "50 types a call" fails; drop `if (calls++) await pause(PAUSE_MS);`: the pause
  count fails.
- `refreshHomePrices`: write the row even when `!ok`: "a hub whose read fails keeps its last good row" fails.
- `refreshHomePrices`: `>= 4` for the run of failures: "three failed calls in a row end the round" fails (4 calls).
- `homePrices`: drop the hub check: "a hub the cloud doesn't read is refused" fails.

- [ ] **Step 6: Home prices in the browser**

In `src/lib/cloud.ts`, import `type HomeRow` from `'./homeMarket'` and add after `cloudIndustryNpc`:

```ts
/**
 * A home hub's prices as the cloud last read them from Goonmetrics (goonmetrics.ts): null before its first read, `off` when
 * the cloud has Goonmetrics switched off. A Worker a version behind answers 404 (the error's `status`).
 */
export const cloudHomePrices = (hub: number) => call<{ off: true } | { hub: number; source: string; at: string; prices: Record<string, HomeRow> } | null>(`/v1/home/prices?hub=${hub}`);
```

In `src/components/hustles/industryMarket.ts`, import `cloudHomePrices` from `'../../lib/cloud'` (beside
`cloudIndustryNpc`), `regionHistory` from `'../../lib/market'`, `type HomeRow` from `'../../lib/homeMarket'` and
`type HistRow` from `'../../lib/types'`, and add at the end:

```ts
/**
 * A home hub's prices from the cloud (Goonmetrics, six-hourly): `off` with the cloud copy off in this browser, `switched`
 * when the cloud has Goonmetrics off, `none` before its first read, `behind` for a Worker without the route (404), `failed`
 * otherwise; `ok` with when it was read and each type's row.
 */
export type HomeState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string } | { status: 'switched' } | { status: 'none' }
  | { status: 'ok'; at: string; prices: Record<string, HomeRow> };
export function useHomePrices(hub: number | null): HomeState {
  const cloud = useCloud();
  const [st, setSt] = useState<HomeState>({ status: 'loading' });
  useEffect(() => {
    if (hub == null) return;
    if (!cloudEnabled()) { setSt({ status: 'off' }); return; }
    if (!cloud.started) return;
    let alive = true;
    setSt({ status: 'loading' });
    cloudHomePrices(hub).then((r) => { if (alive) setSt(!r ? { status: 'none' } : 'off' in r ? { status: 'switched' } : { status: 'ok', at: r.at, prices: r.prices }); },
      (e) => { if (alive) setSt((e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [hub, cloud.started]);
  return st;
}

/** The home region's daily history for the types asked (regionHistory: kept three hours, shared in flight), four at a time. One that can't be read is left out. */
export function useHomeHistory(types: readonly number[], region: number | null): Record<number, HistRow[]> {
  const key = region ? `${region}:${types.join(',')}` : '';
  const [got, setGot] = useState<Record<number, HistRow[]>>({});
  useEffect(() => {
    setGot({});
    if (!key) return;
    let alive = true;
    const queue = key.split(':')[1].split(',').filter(Boolean).map(Number);
    let next = 0;
    const work = async () => {
      while (alive && next < queue.length) {
        const t = queue[next++];
        const rows = await regionHistory(t, region!).catch(() => null);
        if (alive && rows) setGot((x) => ({ ...x, [t]: rows }));
      }
    };
    for (let i = 0; i < 4; i++) void work();
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return got;
}
```

In `src/components/hustles/industryFinder.ts`:

1. Imports: add the second line below after `iskBig`'s, and replace the `./industryMarket` import with the last:

```ts
import { iskBig } from '../../lib/format';
import { HOME_STALE_MS, homeQuote, hubOf, type HomeHub } from '../../lib/homeMarket';
import { useAdjusted, useHomeHistory, useHomePrices, useIndices, useIndustryDoc, useLiveBooks, useNpcRow, useScanCache, type HomeState, type Loaded, type NpcState } from './industryMarket';
```

2. `Finder` gains:

```ts
  /** The home hub picked, and its prices from the cloud. */
  hub: HomeHub | null; home: HomeState;
```

3. In `useFinder`, after `const skills = c.pilot.skills;`:

```ts
  const hub = hubOf(doc.hub);
  const home = useHomePrices(hub?.id ?? null);
  const prices = hub && home.status === 'ok' ? home.prices : null;
```

4. The first `market` and the input it builds take the hub (replacing Task 5B's Jita-only lines):

```ts
    const market = (t: number): Market => {
      const b = cache.books[t];
      if (!flows.has(t)) flows.set(t, watchedFlow(t));
      return { jita: b ? othersBook(b, c.own, t, false) : null, stats: cache.stats[t] ?? null, watched: flows.get(t) ?? null, home: prices ? homeQuote(prices[t]) : null };
    };
    return {
      ix, me: doc.assume.me, te: doc.assume.te, skills, clone: c.clone,
      site: { kind: site.kind, rigs: site.rigs, band: facts.band, tax: facts.tax, index: facts.index },
      adjusted: adjusted.value, market, sell: hub ? doc.sell : 'jita', share: doc.share,
      fees: { broker: c.broker, tax: c.tax, hubBroker: hub ? doc.hubFees[hub.id] ?? null : null },
      legs: { jita: legFor(site, facts, JITA_SYSTEM, doc.freight), home: hub ? legFor(site, facts, hub.systemId, doc.freight) : null },
      noShipsToJita: doc.noShipsToJita, jitaJumps: facts.jitaJumps, mines: c.mines, hubName: hub?.short ?? null, now: Date.now(),
    };
  }, [site, facts, cache, hasScan, adjusted, skills, c, ix, doc.assume, doc.share, doc.freight, doc.noShipsToJita, doc.sell, doc.hubFees, hub, prices]);
```

5. After `const liveBooks = useLiveBooks(liveTypes);`, the home region's history for the top rows sold at home, and the
   live re-rank takes it:

```ts
  // The home region's history for the top rows sold at home: their pace and split, where Goonmetrics' weekly movement stood in.
  const homeTypes = useMemo(() => (hub ? first.filter((r) => r.day && r.sale?.place === 'home').slice(0, LIVE_ROWS).map((r) => r.product) : []), [first, hub]);
  const homeHist = useHomeHistory(homeTypes, hub?.region ?? null);
  const live = Object.keys(liveBooks).length > 0 || Object.keys(homeHist).length > 0;
  const liveInput = useMemo(() => {
    if (!input || !live) return input;
    const market = (t: number): Market => {
      const m = input.market(t), b = liveBooks[t];
      return { ...m, ...(b ? { jita: othersBook(b, c.own, t, true) } : {}), ...(homeHist[t] ? { homeHist: homeHist[t] } : {}) };
    };
    return { ...input, market };
  }, [input, live, liveBooks, homeHist, c.own]);
```

6. The return gains `hub, home`: `return { site, facts, waiting, rows, live, input: liveInput, npc, bpo, scan, hub, home };`
7. At the end of the file:

```ts
/** What the home hub's prices are, as a sentence beside the choices (`now` ticks so "read 2 h ago" moves). */
export function homeSaid(f: Pick<Finder, 'hub' | 'home'>, now: number, ago: (iso: string, now: number) => string): string | null {
  const h = f.hub, st = f.home;
  if (!h) return null;
  if (st.status === 'off') return 'Home prices come from the cloud, which isn’t on in this browser (Settings → Your data).';
  if (st.status === 'loading') return `Reading ${h.short}’s prices from the cloud…`;
  if (st.status === 'behind') return 'The cloud is a version behind: home prices come once it’s updated.';
  if (st.status === 'failed') return `Couldn’t read ${h.short}’s prices from the cloud: ${st.error}.`;
  if (st.status === 'switched') return 'Goonmetrics isn’t read: the cloud has it switched off.';
  if (st.status === 'none') return `Not read yet: the cloud reads ${h.short}’s prices from Goonmetrics every six hours.`;
  const old = now - Date.parse(st.at) > HOME_STALE_MS;
  return `${h.short}’s prices: Goonmetrics, read ${ago(st.at, now)}${old ? ': older than a day' : ''}.`;
}
```

In `src/components/hustles/IndustryBuild.tsx`:

1. Imports: the `format` and `hooks` lines become the first and third below, `homeMarket`'s goes between them, and
   `./industryFinder`'s gains `homeSaid`:

```ts
import { ago, iskBig, iskBigSigned, pct, units } from '../../lib/format';
import { HOME_HUBS } from '../../lib/homeMarket';
import { navigate, useNow } from '../../lib/hooks';
import { bpoSaid, FINDER_KINDS, homeSaid, KIND_LABEL, useFinder, useFinderView, type Finder } from './industryFinder';
```

2. After `const beforeTax = …;`:

```ts
  // Ranked before the hub's broker fee when a row shown sells at home and the fee isn't typed.
  const beforeBroker = shown.slice(0, SHOWN + more).some((r) => r.brokerPerPct != null);
  const before = [beforeTax && 'the facility tax', beforeBroker && `the broker fee at ${f.hub?.short}`].filter(Boolean).join(' and ');
  const headSaid = before ? `Profit a day, before ${before}` : 'Profit a day, one slot';
  const now = useNow(60_000);
  const homeLine = homeSaid(f, now, ago);
```

3. In the choices row, after the Build at select and before Industry share:

```tsx
        <label className="chip h34"><span className="cl">Home hub</span>
          <select value={doc.hub ?? ''} onChange={(e) => setDoc({ hub: e.target.value ? Number(e.target.value) : null })} aria-label="Home hub">
            <option value="">None</option>
            {HOME_HUBS.map((h) => <option key={h.id} value={h.id}>{h.short}</option>)}
          </select>
        </label>
        {f.hub && (
          <Seg size="sm" label="Sell at" value={doc.sell} onChange={(v) => setDoc({ sell: v })}
            options={[{ v: 'jita', label: 'Jita' }, { v: 'home', label: f.hub.short }, { v: 'best', label: 'Either', tip: 'Whichever pays more a day, for each item.' }]} />
        )}
        {f.hub && (
          <NumChip label={`Broker fee at ${f.hub.short}`} percent width={50} value={doc.hubFees[f.hub.id] != null ? +(doc.hubFees[f.hub.id] * 100).toFixed(4) : null} placeholder="–"
            onChange={(n) => { const next = { ...doc.hubFees }; if (n == null) delete next[f.hub!.id]; else next[f.hub!.id] = n / 100; setDoc({ hubFees: next }); }}
            tip={'A structure’s broker fee is set by its owner and isn’t in ESI.\n\n• Typed by you.\n• Blank: the finder ranks before it and says what each 1% costs a day.'} />
        )}
```

   (A cleared box deletes the hub's key: `sanitizeIndustry` keeps only numbers, and a blank must read "not typed", never
   0%.)
4. Before `{f.waiting ? (`:

```tsx
      {homeLine && <p className="note small" style={{ margin: 0 }} data-industry="home-said">{homeLine}</p>}
```

5. The Profit a day header becomes:

```tsx
                  <Th className="ind-c-day" tip={`What one factory slot earns a day.${before ? `\n\n• Before ${before}: not typed. Each row says what each 1% costs a day.` : ''}`}>{headSaid}</Th>
```

6. In each row, `tax` and `book` become:

```ts
                  const tax = [r.taxPerPct != null && `each 1% of tax: ${iskBig(r.taxPerPct)} a day`, r.brokerPerPct != null && `each 1% of broker fee at ${f.hub?.short}: ${iskBig(r.brokerPerPct)} a day`].filter(Boolean).join(' · ') || null;
                  const book = !r.sale || !f.input ? null : r.sale.place === 'home' ? `sold at ${f.hub?.short}, Goonmetrics’ prices` : f.input.market(r.product).jita?.live ? 'Jita’s book now' : 'this morning’s book';
```

In `src/components/hustles/IndustryDetail.tsx`, the one sale tile (Task 5B's "The sale in Jita") becomes one per place the
row sold at (both with Either), each saying where its pace came from and Goonmetrics' weekly movement beside a home sale:

```tsx
        ...(row.sales.length ? row.sales : [null]).map((s) => s ? ({
          l: s.place === 'home' ? `The sale at ${input.hubName}` : 'The sale in Jita', v: s.list != null ? iskBig(s.list) : '–',
          n: s.why ?? `nets ${iskBig(s.listNet)} listed${s.brokerKnown ? '' : ' (before the broker fee: not typed)'}, ${iskBig(s.bidNet)} into the best bid · ${units(s.pace)} a day, ${pct(s.split, 0)} buyers taking listings (${s.paceFrom === 'goonmetrics' ? 'Goonmetrics’ weekly movement ÷ 7, at an even split, until the home history is read' : SPLIT_SAID[s.splitFrom as Exclude<typeof s.splitFrom, 'goonmetrics'>]})${s.place === 'home' ? ` · Goonmetrics: ${((w) => (w != null ? units(w) : '–'))(input.market(row.product).home?.weekly)} a week` : ''}${s.freight ? ` · freight ${isk(s.freight)} a unit` : ''}`,
        }) : { l: 'The sale', v: '–', n: 'not sold anywhere you said' }),
```

Run: `npm run build`
Expected: passes.

- [ ] **Step 7: The page case: selling at home**

Insert above `// --- the end of the industry case` (after Task 5B's block):

```js
    // --- Selling at home (Task 6): the cloud's Goonmetrics read for UALX-3 two hours old, C-J6MT's 26 hours old; built at
    // the UALX-3 home (1% tax typed, so the head is before the broker fee alone), sold at UALX-3.
    npcAnswer = { complete: { at: iso(now - 3 * 3600_000), complete: true, pagesFailed: 0, sellers: { 25895: [1_250_000, [60001483, 60001486]] } }, partial: null };
    const UALX_HUB = 1046664001931;
    let homeAnswer = (hub) => (hub === UALX_HUB
      ? { hub, source: 'goonmetrics', at: iso(now - 2 * 3600_000), prices: { [PUMP]: [iso(now - 2 * 3600_000), 7 * 841, 7_000_000, 40, 7_500_000, 50] } }
      : { hub, source: 'goonmetrics', at: iso(now - 26 * 3600_000), prices: {} });
    CLOUD['/v1/home/prices'] = (url, req, json) => { const a = homeAnswer(Number(url.searchParams.get('hub'))); return a === 404 ? json({ error: 'Not found' }, 404) : json(a); };
    let homeHistory = false;
    ESI['/markets/10000061/history/'] = (url, req, json) => (homeHistory && Number(url.searchParams.get('type_id')) === PUMP
      ? json(Array.from({ length: 30 }, (_, i) => ({ date: day5(30 - i), average: 7_300_000, highest: 7_520_000, lowest: 7_050_000, order_count: 30, volume: 600 })))
      : json({ error: 'Not found' }, 404));
    // The finder's own head (a row's detail holds tables of its own), and the pump's detail open (the open row is kept per browser).
    const finderHead = () => page.locator('.ind-finder > thead').innerText().then((t) => t.replace(/\s+/g, ' ').toLowerCase()).catch(() => '');
    const pumpOpen = async () => {
      if ((await page.locator('[data-bp="25895"] .expander').getAttribute('aria-expanded').catch(() => null)) !== 'true') await page.locator('[data-bp="25895"] .expander').click();
      await page.waitForTimeout(800);
      return text('[data-industry="detail"]');
    };
    await finder();
    await page.locator('select[aria-label="Build at"]').selectOption({ label: 'Home in UALX-3' });
    await page.locator('select[aria-label="Home hub"]').selectOption({ label: 'UALX-3' });
    await page.locator('[aria-label="Sell at"] button', { hasText: 'UALX-3' }).click();
    await page.waitForTimeout(1500);
    if (!(await text('[data-industry="home-said"]')).includes('UALX-3’s prices: Goonmetrics, read 2 h ago.')) problems.push(`the home hub’s prices don’t say when the cloud read them: “${await text('[data-industry="home-said"]')}”`);
    if (!(await finderHead()).includes('profit a day, before the broker fee at ualx-3')) problems.push(`with UALX-3’s broker fee not typed, the head doesn’t say so: “${await finderHead()}”`);
    const atHome = await text('[data-bp="25895"]');
    for (const t of ['sold at UALX-3, Goonmetrics’ prices', 'each 1% of broker fee at UALX-3:']) if (!atHome.includes(t)) problems.push(`the pump sold at UALX-3 doesn’t say “${t}”: “${atHome.slice(0, 200)}”`);
    const homeDetail = (await pumpOpen()).toLowerCase();
    for (const t of ['The sale at UALX-3', '(before the broker fee: not typed)', 'Goonmetrics’ weekly movement ÷ 7, at an even split, until the home history is read', 'Goonmetrics: 5,887 a week'])
      if (!homeDetail.includes(t.toLowerCase())) problems.push(`the pump’s detail at home doesn’t say “${t}”`);
    if (SHOTS) { await page.locator('[data-industry="detail"]').scrollIntoViewIfNeeded().catch(() => undefined); await page.screenshot({ path: `${SHOTS}-industry-home.png` }); }
    // The broker fee typed: ranked after it, nothing said before it.
    await page.locator('label.chip', { hasText: 'Broker fee at UALX-3' }).locator('input').fill('1');
    await page.waitForTimeout(1200);
    if ((await finderHead()).includes('before the broker fee')) problems.push('with UALX-3’s broker fee typed, the head still says before it');
    if ((await text('[data-bp="25895"]')).includes('each 1% of broker fee')) problems.push('with UALX-3’s broker fee typed, the pump still says what each 1% costs');
    // The home region's history read: the pace is its own, no longer Goonmetrics' weekly movement.
    homeHistory = true;
    await finder();
    const histDetail = await pumpOpen();
    if (histDetail.includes('Goonmetrics’ weekly movement ÷ 7')) problems.push('with the home history read, the pump’s pace still comes from Goonmetrics’ weekly movement');
    if (!histDetail.includes('guessed from where each day’s average sat between its low and high')) problems.push('with the home history read, the pump’s split doesn’t say it comes from history');
    // C-J6MT's read is 26 hours old: said with its time.
    await page.locator('select[aria-label="Home hub"]').selectOption({ label: 'C-J6MT' });
    await page.waitForTimeout(1200);
    if (!(await text('[data-industry="home-said"]')).includes('C-J6MT’s prices: Goonmetrics, read 1 day ago: older than a day.')) problems.push(`C-J6MT’s day-old prices aren’t said as older than a day: “${await text('[data-industry="home-said"]')}”`);
    // Back at UALX-3, selling wherever pays more: with Goonmetrics switched off in the cloud, then the cloud a version
    // behind, it's said, and the pump sells in Jita rather than at home on prices nobody read.
    await page.locator('select[aria-label="Home hub"]').selectOption({ label: 'UALX-3' });
    await page.locator('[aria-label="Sell at"] button', { hasText: 'Either' }).click();
    await page.waitForTimeout(800);
    for (const [answer, said] of [[() => ({ off: true }), 'Goonmetrics isn’t read: the cloud has it switched off.'], [() => 404, 'The cloud is a version behind: home prices come once it’s updated.']]) {
      homeAnswer = answer;
      await finder();
      if (!(await text('[data-industry="home-said"]')).includes(said)) problems.push(`the home prices line doesn’t say “${said}”`);
      const pumpRow = await text('[data-bp="25895"]');
      if (pumpRow.includes('Goonmetrics’ prices') || !/Jita’s book now|this morning’s book/.test(pumpRow)) problems.push(`with no home prices (“${said}”), the pump isn’t sold in Jita: “${pumpRow.slice(0, 200)}”`);
    }
    const homeFit = await sideways(page, '[data-industry="finder"] .tbl-scroll');
    if (!PHONE && homeFit && homeFit.over > 0) problems.push(`the finder with a home hub scrolls sideways at 1,440 (${homeFit.over} px)`);
```

Run: `LEDGER=industry PAGE=hustles/industry npm run check-pages` and again with `PHONE=1`
Expected: `ok   industry #hustles/industry` at both widths.

Plant, run, see it fail, undo:
- `HOME_STALE_MS = 48 * 3600_000`: "C-J6MT's day-old prices aren't said as older than a day".
- `useHomePrices`: treat 404 as `failed`: "the home prices line doesn't say “The cloud is a version behind…”".
- `useFinder`'s first `market`: `home: null` always: "the pump sold at UALX-3 doesn't say “sold at UALX-3, Goonmetrics’
  prices”".
- IndustryBuild: the head without `beforeBroker`: "with UALX-3's broker fee not typed, the head doesn't say so".

- [ ] **Step 8: A look in a browser**

Run the case with `SHOTS=.playwright-mcp/industry/6` at both widths and look at `-industry-home.png`: the Home hub, Sell
at and Broker fee chips on the choices' first row at 1,440, the line "UALX-3's prices: Goonmetrics, read 2 h ago." over
the table, the pump's row "sold at UALX-3, Goonmetrics' prices" with what each 1% of the broker fee costs, and its detail's
"The sale at UALX-3" tile with Goonmetrics' weekly movement beside the pace; on a phone the chips wrap and nothing sticks
out. Then, with `npm run worker:dev` on a local D1 (`--test-scheduled`), `curl "localhost:8787/__scheduled?cron=37+*+*+*+*"`
reads both hubs from the real Goonmetrics (about two minutes; the log line `goonmetrics {"done":{"UALX-3":"read",…}}`), and
`curl -H "Authorization: Bearer dev-token" "localhost:8787/v1/home/prices?hub=1046664001931"` returns its row; run it again
within six hours and nothing is read (`"fresh"`). Pick UALX-3 in the app against that Worker: rows sold at UALX-3 show,
their history read from Tenerifis.

- [ ] **Step 9: The notes**

Append to `docs/notes/industry.md`:

```markdown
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
- **Selling at home** (the finder's Home hub, Sell at Jita / the hub / Either): Goonmetrics' best sell less a tick, checked
  against the home region's 14 days of highs once its history is read (`useHomeHistory`: Tenerifis or Insmother, only the
  top 40 rows sold at home), after your sales tax and the hub's broker fee. Its pace is that history's typical day split by
  `buyerShare`, or, before it's read, Goonmetrics' weekly movement ÷ 7 at an even split, said so on the row's sale. The
  broker fee is typed (a structure's owner sets it; ESI doesn't say): blank, the finder ranks before it, the head says
  "Profit a day, before the broker fee at UALX-3" and each row what each 1% costs a day. Home prices are said with how old
  they are, "older than a day" past 24 hours; off, not read yet, failing, switched off or the cloud a version behind each
  say which, and nothing is sold at home on prices nobody read (Either falls back to Jita).
```

Append to `docs/notes/limits.md`:

```markdown
- **Home prices are Goonmetrics'**, a Goonswarm tool fed partly by its members' client uploads, read every six hours: a
  hub's best sell can be hours old, and its weekly movement is the only pace until the home region's history is read (and
  that history is the whole region's, not the hub's). The hub's broker fee is typed, not known.
```

- [ ] **Step 10: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add src/lib/homeMarket.ts worker/migrations/0019_home_prices.sql worker/src/goonmetrics.ts worker/src/index.ts src/lib/cloud.ts \
  src/components/hustles/industryMarket.ts src/components/hustles/industryFinder.ts src/components/hustles/IndustryBuild.tsx \
  src/components/hustles/IndustryDetail.tsx scripts/fixtures/goonmetrics-34.xml scripts/check.mjs scripts/check-worker.mjs \
  scripts/pages.mjs docs/notes/industry.md docs/notes/limits.md
git commit -m "$(cat <<'MSG'
Industry: home prices from Goonmetrics, read by the cloud, and selling at home in the finder

What was missing: the spec's home hub. The user is moving to null-sec, and ships are "too bulky expensive and risky" to
haul to Jita, so the finder has to say what a build fetches at UALX-3 or C-J6MT. Nothing in ESI gives a structure
market's prices without a login that can dock there; Goonmetrics, the Imperium's own tool, publishes them.

What it does: the cloud reads Goonmetrics for both hubs every six hours, after the alts' hourly read on the existing 37
cron, 50 types a call, 1.5 s apart, a User-Agent naming the project only. Its API sends no CORS header, so only the cloud
can. A failing read keeps the last good one, three failures in a row end the round, and GOONMETRICS_ON switches it off
if its authors object. The finder gains Home hub, Sell at (Jita, the hub, either) and the hub's broker fee, typed, or
ranked before it with each 1%'s cost beside. A home sale's pace is the home region's history once read, Goonmetrics'
weekly movement until then, said.

Never a zero for not known: weekly movement -1 and an empty side read as none, and prices are said with their age, older
than a day said so; the cloud off, not read yet, switched off or a version behind each say which, and Either falls back
to Jita rather than selling at home on prices nobody read.

Evidence: the parser on Goonmetrics' own answer for Tritanium at UALX-3 (10 October 2026); the reader on the D1 stand-in
(50 a call, a pause before each but the first, a failed hub keeping its row, three failures stopping, off, refused hub);
the page case on the research's pump sold at UALX-3. A stale threshold of two days and a 404 read as a failure each
failed it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
MSG
)"
```

---
### Task 7: The ladder on Start, by skills alone, with Alpha's "Needs Omega" from CCP's caps

**Files:**
- Create: `src/lib/industryLadder.ts`
- Modify: `src/components/hustles/IndustryStart.tsx` (the ladder), `src/components/hustles/Industry.tsx` (Start gets the
  map), `src/components/SkillStrip.tsx` (`SkillNeeds` gains an optional `beyond`), `src/styles.css` (`.ind-ladder`,
  `.ind-rung`…), `scripts/check.mjs`, `scripts/pages.mjs`, `docs/notes/industry.md`

**Interfaces:**
- Consumes: `SKILL`, `MAX_SLOTS`, `slots`, `lacking`, `productOf`, `type Clone`, `type BpActivity`, `type Indexed`
  (Task 2); `buildRow`, `finderBlueprints`, `productKind`, `type Row`, `type RowInput` (Task 3); `IndustryChar`,
  `skillsWhy` (Task 4A); `useIndustryDoc` (Task 4B); `useFinder`, `type Finder` (Tasks 5B and 6);
  `ALPHA_SKILL_CAPS` (`src/lib/alphaCaps.ts`, CCP's cloneGrades, build 3561556).
- Produces (`src/lib/industryLadder.ts`): `type RungKey`, `type Need`, `type Rung`, `RUNGS`, `alphaCapOf(skill)`,
  `usable(skills, clone)`, `beyondAlpha(rung)`, `omegaSaid(rung, clone)`, `needBeyond(clone, skill, level)`,
  `cumulative(key)`, `rungCount(ix, key, skills, clone)`, `type RungState`, `type RungView`,
  `ladderOf({ skills, clone, structureSite })`, `rowsOpened(ix, rows, key, skills, clone)`, `paying(rows)`,
  `researchedRows(input, opened, n?)`, `slotsPay(opened, slots)`. `SkillNeeds({ needs, beyond? })`. Task 8 adds rung 6's
  "pays now" from Tech II rows with `rowsOpened(…, 't2', …)`.

**The levels the spec leaves blank, decided here** (said in the note): rung 1 Industry I and Mass Production I (the
second job); rung 2 Laboratory Operation I, Metallurgy I and Research I; rung 3 Mass Production V, Advanced Mass
Production I, Laboratory Operation V and Advanced Laboratory Operation I; rung 4 Science I; rung 6 Science V; rung 7
Industry V, Advanced Industry V and **Capital Ship Construction III**: the bundle's 29 capital hulls ask for it at III
(12: carriers, dreadnoughts, force auxiliaries), IV (5 supercarriers) or V (4 titans), or Advanced Capital Ship
Construction (8), so at I the rung would open none. Prerequisites aren't rung needs: the skill rows say "Needs X first"
from ESI (read 10 October 2026: Mass Production and Advanced Industry need Industry III; Research and Laboratory
Operation, Science III; Metallurgy, Science IV; Capital Ship Construction, Industry V, Advanced Industry V and Mechanics V),
and a rung's training time includes them that way.

**Two more decisions.** "Needs Omega" is worked out from the caps for **any** Alpha character (an alt's pilot marks only
skills trained past their cap, so an Alpha alt with Mass Production at III would otherwise be promised "IV takes 2 days"),
and the derivation yields exactly the spec's rungs 2, 3, 6 and 7, tested. **Build at home** has no skill: it's met when a
structure (not an NPC station) is among the `industry` doc's sites, a decision the user made, not a stage-2 read; "You're
here" is the last of an unbroken run of met rungs from the first, so a character can stand on rung 5.

**Ship-safety.** Browser only; `SkillNeeds`' new prop is optional, so its other users (FitParts, ShipTree) are unchanged.

- [ ] **Step 1: Write the failing test**

Add to `scripts/check.mjs`, after Task 6's section:

```js
console.log('\n--- Industry: the ladder (industryLadder.ts) ---');
{
  const I = await import('../src/lib/industry.ts');
  const K = await import('../src/lib/industryRank.ts');
  const L = await import('../src/lib/industryLadder.ts');
  const fsL = await import('node:fs');
  const ix = I.indexBundle(JSON.parse(fsL.readFileSync(new URL('../src/data/industry.json', import.meta.url), 'utf8')));
  const fx = JSON.parse(fsL.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8'));
  // The page case's main: Industry V, Mass Production IV, Advanced Industry II, Laboratory Operation III, Science IV,
  // Metallurgy II, Research II (and trade and rigging skills the ladder doesn't ask for).
  const MAIN = { 3380: 5, 3387: 4, 3388: 2, 3406: 3, 3402: 4, 3409: 2, 3403: 2, 3446: 4, 16622: 4, 26253: 1 };
  const keys = (v) => v.rungs.map((r) => `${r.rung.key}:${r.state}`);

  eq('  seven rungs, in the spec\'s order', L.RUNGS.map((r) => r.key), ['npc', 'research', 'slots', 'copy', 'home', 't2', 'capital']);
  eq('  "Needs Omega" worked out from CCP\'s caps: rungs 2, 3, 6 and 7, as the spec says', L.RUNGS.map((r) => L.beyondAlpha(r).length > 0), [false, true, true, false, false, true, true]);
  eq('  an Alpha\'s usable levels: Mass Production held to III, Laboratory Operation to none; an Omega\'s as trained',
    [L.usable(MAIN, 'alpha')[3387], L.usable(MAIN, 'alpha')[3406], L.usable(MAIN, 'alpha')[3380], L.usable(MAIN, 'omega')[3387], L.usable(MAIN, 'unknown')[3406]], [3, 0, 5, 4, 3]);

  const main = L.ladderOf({ skills: MAIN, clone: 'omega', structureSite: false });
  eq('  the main, Omega: on rung 2 (rung 3 wants Mass Production V); Copy met past the gap stays ahead',
    [main.here, keys(main), main.rungs.map((r) => r.met)], [1, ['npc:done', 'research:here', 'slots:next', 'copy:ahead', 'home:ahead', 't2:ahead', 'capital:ahead'], [true, true, false, true, false, false, false]]);
  eq('    the same main as an Alpha: rung 1, its Laboratory Operation unusable', L.ladderOf({ skills: MAIN, clone: 'alpha', structureSite: false }).here, 0);
  const four = { 3380: 1, 3387: 5, 24625: 1, 3406: 5, 24624: 1, 3409: 1, 3403: 1, 3402: 1 };
  eq('  Build at home is met by a structure among the sites, not a skill: rung 4 without one, rung 5 with',
    [L.ladderOf({ skills: four, clone: 'omega', structureSite: false }).here, L.ladderOf({ skills: four, clone: 'omega', structureSite: true }).here], [3, 4]);
  eq('  no Industry or Mass Production: not on the first rung, which is next', [L.ladderOf({ skills: { 3380: 1 }, clone: 'omega', structureSite: true }).here, keys(L.ladderOf({ skills: { 3380: 1 }, clone: 'omega', structureSite: true }))[0]], [null, 'npc:next']);
  const unread = L.ladderOf({ skills: null, clone: 'unknown', structureSite: true });
  eq('  skills not read: nothing judged, nothing here', [unread.here, unread.rungs.every((r) => r.met === null && r.state === 'ahead')], [null, true]);

  const research = L.RUNGS[1], slots = L.RUNGS[2];
  eq('  what a rung says of Alpha: Needs Omega for an Alpha, "Clone state not read" when unknown (never "Alpha"), nothing for an Omega',
    [L.omegaSaid(research, 'alpha'), L.omegaSaid(slots, 'alpha'), L.omegaSaid(research, 'unknown'), L.omegaSaid(research, 'omega'), L.omegaSaid(L.RUNGS[0], 'alpha')],
    ['Needs Omega: Alpha can’t use Laboratory Operation, Metallurgy or Research.',
      'Needs Omega: Alpha uses Mass Production to III, and can’t use Advanced Mass Production, Laboratory Operation or Advanced Laboratory Operation.',
      'Clone state not read: an Alpha can’t use Laboratory Operation, Metallurgy or Research.', null, null]);
  eq('  a skill row past Alpha\'s cap says so instead of a training time; within it, or not an Alpha, nothing',
    [L.needBeyond('alpha', 3387, 5), L.needBeyond('alpha', 3406, 1), L.needBeyond('alpha', 3387, 1), L.needBeyond('unknown', 3406, 1)],
    ['Alpha uses III: Omega opens V', 'Alpha can’t use it: Omega opens it', null, null]);

  // Counts from the bundle (build 3569502), at the skills raised to each rung's.
  const counts = (sk, clone) => L.RUNGS.map((r) => L.rungCount(ix, r.key, sk, clone));
  eq('  what each rung opens with no skills: 766 of 1,652 Tech I items built, 1,229 researched, 1,633 copied, no Tech II, 12 of 29 capital hulls',
    counts({}, 'omega'), [{ n: 766, of: 1652 }, { n: 1229, of: 1652 }, null, { n: 1633, of: 1652 }, null, { n: 0, of: 1020 }, { n: 12, of: 29 }]);
  eq('    the main\'s own skills open more on rungs 1 and 2: 954 and 1,259 (952 as an Alpha)',
    [counts(MAIN, 'omega')[0].n, counts(MAIN, 'omega')[1].n, counts(MAIN, 'alpha')[0].n], [954, 1259, 952]);
  eq('    a Tech II item counts once its Tech I\'s invention skills are in: the pump II with Hydromagnetic Physics, Nanite Engineering and Amarr Encryption Methods',
    L.rungCount(ix, 't2', { 11443: 1, 11442: 1, 23087: 1 }, 'omega').n > 0, true);

  // The rows a rung opens: the pump (Industry I and Armor Rigging I) and the Caracal (Industry I).
  const r = (bp, product, profit) => ({ bp, product, day: profit == null ? null : { profit } });
  const rows = [r(25895, 25894, 5e6), r(687, 621, 3e6), r(687, 621, -1e6), r(687, 621, null)];
  eq('  rows a rung opens: the Caracal at rung 1 with no rigging skill; the pump too once trained; unpriced rows never',
    [L.rowsOpened(ix, rows, 'npc', {}, 'omega').map((x) => x.day.profit), L.rowsOpened(ix, rows, 'npc', { 26253: 1 }, 'omega').map((x) => x.day.profit)], [[3e6, -1e6], [5e6, 3e6, -1e6]]);
  eq('  one item a slot: the best paying rows, as many as there are slots, and how many there were',
    [L.slotsPay(L.rowsOpened(ix, rows, 'npc', { 26253: 1 }, 'omega'), 1), L.slotsPay(L.rowsOpened(ix, rows, 'npc', { 26253: 1 }, 'omega'), 11)], [{ profit: 5e6, items: 1 }, { profit: 8e6, items: 2 }]);

  // Research's worth, on Task 3's worked row (the pump in the Azbel at UALX-3, sold in Jita).
  const ASK = { 25601: 4213, 25605: 25_980, 25590: 84_000 };
  const spark = [...Array(16).fill(800), ...Array(14).fill(841)];
  const highs14 = [7_100_000, 7_050_000, 7_045_000, 7_041_000, 6_900_000, 6_950_000, 6_990_000, 7_000_000, 7_010_000, 6_980_000, 6_970_000, 6_960_000, 6_950_000, 6_940_000];
  const market = (t) => t === 25894 ? { jita: { ask: 7_041_000, bid: 6_240_000, bids: [{ price: 6_240_000, volume: 100 }], at: '', live: false }, stats: { spark, highs14, buyerShare: 0.5 } }
    : ASK[t] ? { jita: { ask: ASK[t], bid: ASK[t] * 0.9, bids: [], at: '', live: false }, stats: null } : { jita: null, stats: null };
  const idx = I.parseIndices(fx.systems);
  const input = {
    ix, me: 0, te: 0, skills: { 3380: 4, 3388: 2, 26253: 1 }, clone: 'omega',
    site: { kind: 'azbel', rigs: [37170], band: 'null', tax: 0.01, index: { ...idx[30004807], manufacturing: 0.0617 } },
    adjusted: fx.adjusted, market, sell: 'jita', share: 10, fees: { broker: 0.013, tax: 0.03375, hubBroker: null },
    legs: { jita: { kind: 'route', f: { perM3: 900, collateral: 0.0075 * 1.05, min: 5_000_000 }, name: 'Brave Freight' }, home: null },
    noShipsToJita: true, jitaJumps: null, mines: false, hubName: null, now: Date.parse('2026-10-09T15:00:00Z'),
  };
  const at0 = K.buildRow({ ...input, bp: ix.bp.get(25895) });
  const best = L.researchedRows(input, [at0]), b = best[0] ?? {};
  eq('  research\'s worth: the row priced again at ME 0 / TE 0 and at ME 10 / TE 20, ME 10 paying more',
    [best.length, Math.round(b.at0), Math.round(b.at10), b.at10 > b.at0],
    [1, Math.round(at0.day.profit), Math.round(K.buildRow({ ...input, bp: ix.bp.get(25895), me: 10, te: 20 }).day.profit), true]);
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run check 2>&1 | grep -A3 "the ladder"`
Expected: FAIL to import `../src/lib/industryLadder.ts`.

- [ ] **Step 3: The ladder's rules**

Create `src/lib/industryLadder.ts`:

```ts
import { ALPHA_SKILL_CAPS } from './alphaCaps';
import { lacking, MAX_SLOTS, productOf, SKILL, type BpActivity, type Clone, type Indexed } from './industry';
import { buildRow, finderBlueprints, productKind, type Row, type RowInput } from './industryRank';

/**
 * The ladder on Start (docs/notes/industry.md; the spec's "Start: the ladder"): seven rungs from a first job in a
 * high-sec NPC station to capitals. Each has the skills it needs, what it opens and how many blueprints, whether an Alpha
 * can climb it (read from CCP's caps for any Alpha character, main or alt: an alt's pilot marks only skills trained past
 * their cap, so a level an Alpha can't train would otherwise read as days of training), and where the shown character
 * stands: by its skills, and for building at home by the sites added. Its blueprints and jobs aren't read until stage 2.
 * Pure: no config, store, React or DOM.
 */

export type RungKey = 'npc' | 'research' | 'slots' | 'copy' | 'home' | 't2' | 'capital';
export type Need = { skill: number; level: number; name: string };
export type Rung = { key: RungKey; title: string; opens: string; needs: Need[] };

const ind = (level: number): Need => ({ skill: SKILL.industry, level, name: 'Industry' });
const mass = (level: number): Need => ({ skill: SKILL.massProduction, level, name: 'Mass Production' });
const lab = (level: number): Need => ({ skill: SKILL.labOp, level, name: 'Laboratory Operation' });
const science = (level: number): Need => ({ skill: SKILL.science, level, name: 'Science' });

/**
 * The rungs and the levels each asks for. The spec names the skills; the levels are this plan's: a rung asks for the
 * first level that does its job (Mass Production I runs a second job, Science I a copy), "More slots" for the five
 * levels and the advanced skill's first, Capitals for Capital Ship Construction III (the first capital hulls: I opens
 * none of the 29). Prerequisites aren't listed here: the skill rows say "Needs X first" from ESI
 * (Mass Production and Advanced Industry need Industry III; Research and Laboratory Operation, Science III; Metallurgy,
 * Science IV; Capital Ship Construction, Industry V, Advanced Industry V and Mechanics V: ESI, 10 October 2026).
 */
export const RUNGS: Rung[] = [
  {
    key: 'npc', title: 'Build in a high-sec NPC station', needs: [ind(1), mass(1)],
    opens: 'A factory slot in any NPC station with a Factory, and an original bought from NPCs, which builds for ever. Mass Production I runs a second job.',
  },
  {
    key: 'research', title: 'Research ME first', needs: [lab(1), { skill: SKILL.metallurgy, level: 1, name: 'Metallurgy' }, { skill: SKILL.research, level: 1, name: 'Research' }],
    opens: 'Material efficiency on your originals, in a station with a Laboratory: ME 8 takes a fraction of ME 10’s time, and each finder row’s detail gives the days at your skills.',
  },
  {
    key: 'slots', title: 'More slots', needs: [mass(5), { skill: SKILL.advancedMassProduction, level: 1, name: 'Advanced Mass Production' }, lab(5), { skill: SKILL.advancedLabOp, level: 1, name: 'Advanced Laboratory Operation' }],
    opens: `Up to ${MAX_SLOTS} factory jobs and ${MAX_SLOTS} science jobs at once. What limits most items is what the market takes, so each slot builds another item.`,
  },
  {
    key: 'copy', title: 'Copy, and sell copies', needs: [science(1)],
    opens: 'Copies keep the original’s ME and TE: build from them in more places, or sell them on contracts.',
  },
  {
    key: 'home', title: 'Build at home', needs: [],
    opens: 'An Azbel or Raitaru with rigs in null-sec builds for less (a rig counts 2.1 times there), with materials bought there or freighted in, and ships sold at home.',
  },
  {
    key: 't2', title: 'Tech II through invention', needs: [science(5)],
    opens: 'Invent Tech II copies from Tech I copies: Science V, the item’s two sciences and its race’s encryption skill, and datacores, which R&D agents make.',
  },
  {
    key: 'capital', title: 'Capitals', needs: [ind(5), { skill: SKILL.advancedIndustry, level: 5, name: 'Advanced Industry' }, { skill: SKILL.capitalShips, level: 3, name: 'Capital Ship Construction' }],
    opens: 'Carriers, dreadnoughts and force auxiliaries (Capital Ship Construction IV and V build supercarriers and titans), in a structure with a Standup Capital Shipyard.',
  },
];

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const listed = (xs: string[], last: 'and' | 'or') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${last} ${xs[xs.length - 1]}`);

/** The level of a skill an Alpha can use (CCP's cloneGrades: a skill not listed, none). */
export const alphaCapOf = (skill: number): number => ALPHA_SKILL_CAPS[skill] ?? 0;

/**
 * The levels a character can use: an Alpha's held to CCP's caps. A main's skills are what it trained (its pilot carries
 * no caps); an alt's are already what it can use, so capping again changes nothing.
 */
export function usable(skills: Record<number, number>, clone: Clone): Record<number, number> {
  if (clone !== 'alpha') return skills;
  return Object.fromEntries(Object.entries(skills).map(([id, l]) => [id, Math.min(l, alphaCapOf(Number(id)))]));
}

/** A rung's needs past what an Alpha can use. */
export const beyondAlpha = (r: Rung): Need[] => r.needs.filter((n) => n.level > alphaCapOf(n.skill));

/** What a rung says about Alpha: "Needs Omega" for an Alpha, "Clone state not read" when unknown (never "Alpha"); nothing for Omega or a rung Alpha climbs. */
export function omegaSaid(r: Rung, clone: Clone): string | null {
  const over = beyondAlpha(r);
  if (!over.length || clone === 'omega') return null;
  const uses = over.filter((n) => alphaCapOf(n.skill) > 0).map((n) => `uses ${n.name} to ${ROMAN[alphaCapOf(n.skill)]}`);
  const cant = over.filter((n) => alphaCapOf(n.skill) === 0).map((n) => n.name);
  const said = [...uses, ...(cant.length ? [`can’t use ${listed(cant, 'or')}`] : [])].join(', and ');
  return clone === 'alpha' ? `Needs Omega: Alpha ${said}.` : `Clone state not read: an Alpha ${said}.`;
}

/** One skill row's words for an Alpha, in place of its training time (SkillNeeds' `beyond`): null where an Alpha can use the level, or the clone isn't Alpha. */
export function needBeyond(clone: Clone, skill: number, level: number): string | null {
  if (clone !== 'alpha') return null;
  const cap = alphaCapOf(skill);
  if (level <= cap) return null;
  return cap ? `Alpha uses ${ROMAN[cap]}: Omega opens ${ROMAN[level]}` : 'Alpha can’t use it: Omega opens it';
}

/** Every need up to and including a rung, at the highest level any asks. */
export function cumulative(key: RungKey): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of RUNGS) {
    for (const n of r.needs) out[n.skill] = Math.max(out[n.skill] ?? 0, n.level);
    if (r.key === key) break;
  }
  return out;
}

/** A character's usable levels raised to what the rung (and every rung before it) asks: what it could do on that rung. */
function onRung(key: RungKey, skills: Record<number, number>, clone: Clone): Record<number, number> {
  const out = { ...usable(skills, clone) };
  for (const [id, l] of Object.entries(cumulative(key))) out[Number(id)] = Math.max(out[Number(id)] ?? 0, l);
  return out;
}

const can = (act: BpActivity | 0 | undefined, s: Record<number, number>) => !!act && lacking(act[2], s).length === 0;

/**
 * How many blueprints a rung opens, from the bundle's skill lists against the character's usable levels raised to the
 * rung's: Tech I originals the finder ranks that it can build (rung 1), research (2) and copy (4); Tech II items whose Tech I
 * it can invent from (6); capital hulls it can build (7). None for More slots and Build at home: a count of slots, and a place.
 */
export function rungCount(ix: Indexed, key: RungKey, skills: Record<number, number>, clone: Clone): { n: number; of: number } | null {
  const s = onRung(key, skills, clone);
  const t1 = () => finderBlueprints(ix);
  if (key === 'npc') { const all = t1(); return { n: all.filter((bp) => can(bp[2], s)).length, of: all.length }; }
  if (key === 'research') { const all = t1(); return { n: all.filter((bp) => can(bp[4], s)).length, of: all.length }; }
  if (key === 'copy') { const all = t1(); return { n: all.filter((bp) => can(bp[3], s)).length, of: all.length }; }
  if (key === 't2') {
    const all = [...ix.t2];
    return { n: all.filter((t2) => { const from = ix.inventedFrom.get(t2); const bp = from != null ? ix.bp.get(from) : undefined; return !!bp && can(bp[6], s); }).length, of: all.length };
  }
  if (key === 'capital') {
    const all = ix.b.bps.filter((bp) => { const p = productOf(bp); return !!p && productKind(ix, p.type) === 'capital'; });
    return { n: all.filter((bp) => can(bp[2], s)).length, of: all.length };
  }
  return null;
}

export type RungState = 'done' | 'here' | 'next' | 'ahead';
export type RungView = { rung: Rung; met: boolean | null; state: RungState };
/**
 * Where the character stands. A rung is met when its needs are all within the usable levels (Build at home: when a
 * structure is among the sites added). "Here" is the last of an unbroken run of met rungs from the first, "next" the one
 * after it; a rung met past a gap stays "ahead" (its words still say the skills cover it). Skills not read: nothing is
 * judged.
 */
export function ladderOf(o: { skills: Record<number, number> | null; clone: Clone; structureSite: boolean }): { rungs: RungView[]; here: number | null } {
  if (!o.skills) return { rungs: RUNGS.map((rung) => ({ rung, met: null, state: 'ahead' })), here: null };
  const s = usable(o.skills, o.clone);
  const met = RUNGS.map((r) => (r.key === 'home' ? o.structureSite : r.needs.every((n) => (s[n.skill] ?? 0) >= n.level)));
  let here: number | null = null;
  for (let i = 0; i < met.length && met[i]; i++) here = i;
  const next = here == null ? 0 : here + 1;
  return { rungs: RUNGS.map((rung, i) => ({ rung, met: met[i], state: here != null && i < here ? 'done' : i === here ? 'here' : i === next ? 'next' : 'ahead' })), here };
}

/** The finder's priced rows a rung opens (manufacturing skills within the usable levels raised to the rung's), best profit a day first, losing ones too. */
export function rowsOpened(ix: Indexed, rows: readonly Row[], key: RungKey, skills: Record<number, number>, clone: Clone): Row[] {
  const s = onRung(key, skills, clone);
  return rows.filter((r) => r.day && can(ix.bp.get(r.bp)?.[2] ?? 0, s)).sort((a, b) => b.day!.profit - a.day!.profit);
}

/** The rows that make a profit, of those. */
export const paying = (rows: readonly Row[]): Row[] => rows.filter((r) => r.day && r.day.profit > 0);

/**
 * Research's worth on the rows rung 2 opens: the ten best at the finder's ME and TE (losing ones too: research is what
 * can turn one), each priced again at ME 0 / TE 0 and at ME 10 / TE 20, best at ME 10 first. What one slot makes a day
 * either way; a row that still loses at ME 10 is left out.
 */
export function researchedRows(input: Omit<RowInput, 'bp'>, opened: readonly Row[], n = 3): { row: Row; at0: number | null; at10: number }[] {
  const out: { row: Row; at0: number | null; at10: number }[] = [];
  for (const row of opened.slice(0, 10)) {
    const bp = input.ix.bp.get(row.bp);
    if (!bp) continue;
    const at10 = buildRow({ ...input, bp, me: 10, te: 20 }).day?.profit;
    if (at10 == null || !(at10 > 0)) continue;
    out.push({ row, at0: buildRow({ ...input, bp, me: 0, te: 0 }).day?.profit ?? null, at10 });
  }
  return out.sort((a, b) => b.at10 - a.at10).slice(0, n);
}

/** One item a slot: what the best `slots` paying rows make a day together, and how many there were to fill them. */
export function slotsPay(opened: readonly Row[], slots: number): { profit: number; items: number } {
  const top = paying(opened).slice(0, slots);
  return { profit: top.reduce((a, r) => a + r.day!.profit, 0), items: top.length };
}
```

- [ ] **Step 4: Run the test to see it pass, then plant each rule wrong**

Run: `npm run check`
Expected: all pass.

Plant, run, see it fail, undo:
- `alphaCapOf` reading `{ ...ALPHA_SKILL_CAPS, 3406: 5 }`: "an Alpha's usable levels" and "what a rung says of Alpha" fail.
- `ladderOf`: Build at home always met (`r.key === 'home' ? true`): "Build at home is met by a structure…" fails.
- `ladderOf`: `const s = o.skills;` (no caps): "the same main as an Alpha: rung 1" fails.
- `researchedRows`: `at10` priced at ME 0 / TE 0: "research's worth" fails (the row is left out).
- `omegaSaid`: always "Needs Omega": the "Clone state not read" line fails.

- [ ] **Step 5: `SkillNeeds` says what an Alpha can't train past**

In `src/components/SkillStrip.tsx`, the doc comment and signature of `SkillNeeds` become:

```tsx
/**
 * Skills a thing needs, each at a level (a ship to fly, a module to fit): your level against it, and where it stands in
 * your queue, or what's missing first. For the mining ladder's rungs. `beyond` says when a level is past what the
 * character can use whatever it trains (Industry's ladder: an Alpha's caps, which an alt's pilot marks only for skills
 * trained past them), in place of the training time; such a level never reads as trained.
 */
export function SkillNeeds({ needs, beyond }: { needs: { skill: number; level: number }[]; beyond?: (skill: number, level: number) => string | null }) {
```

and in its row, `met` and the queue cell become:

```tsx
        const over = beyond?.(n.skill, n.level) ?? null;
        const met = !over && s.have >= n.level;
        const q = queueSaid(s, train[n.skill], now, name);
        return (
          <div key={n.skill} className="skill-need">
            <span className="sk-name">{name(n.skill)} {ROMAN[n.level]}</span>
            <SkillPips s={s} want={n.level} />
            <span className="sk-q" style={{ color: met ? 'var(--pos)' : TONE[over ? 'idle' : q.tone] }}>{over ?? (met ? `Trained (${ROMAN[s.have]})` : q.text)}</span>
```

- [ ] **Step 6: The ladder on Start**

In `src/components/hustles/Industry.tsx`, Start gets the map the finder needs:

```tsx
          {section === 'start' && <IndustryStart key={shown.charId} c={shown} ix={ix} graph={graph} />}
```

Replace `src/components/hustles/IndustryStart.tsx` (Task 4A's lead and tiles are kept, the slots tile now counts an
Alpha's usable levels, and the ladder follows):

```tsx
import { useMemo } from 'react';
import { FlaskConical, MapPin, ScrollText, Store } from 'lucide-react';
import { iskBig, iskBigSigned, pct, units } from '../../lib/format';
import { navigate } from '../../lib/hooks';
import { MAX_SLOTS, slots, type Indexed } from '../../lib/industry';
import { ladderOf, needBeyond, omegaSaid, paying, researchedRows, rowsOpened, rungCount, slotsPay, usable, type RungKey } from '../../lib/industryLadder';
import type { Graph } from '../../lib/jumps';
import { Points } from '../Facts';
import { SkillNeeds } from '../SkillStrip';
import { Tiles } from '../ui';
import { skillsWhy, type IndustryChar } from './industryChars';
import { useFinder, type Finder } from './industryFinder';
import { useIndustryDoc } from './industryMarket';

/**
 * Start (docs/notes/industry.md): the lead, where the shown character stands (its slots, its Jita fees, its clone), and
 * the ladder of rungs from a first job to capitals (industryLadder.ts): each rung's skills at the shown character's
 * pilot, what it opens, how many blueprints, whether an Alpha can climb it, and what it pays now from the finder's own
 * rows. Nothing not read reads as a zero: an alt's skills not read say so, and its fee is "–" until they are.
 */
export function IndustryStart({ c, ix, graph }: { c: IndustryChar; ix: Indexed; graph: Graph }) {
  const sk = c.pilot.skills;
  const s = sk ? slots(ix, usable(sk, c.clone)) : null;
  const why = skillsWhy(c);
  const feeKnown = c.isMain || !!sk;
  const feeSaid = c.isMain ? `sales tax ${pct(c.tax)}, as Settings has them`
    : c.standingsRead ? `sales tax ${pct(c.tax)}, at ${c.name}’s standings with Caldari State and Caldari Navy`
      : `sales tax ${pct(c.tax)}; standings not read: broker fee at no standing`;
  const [doc] = useIndustryDoc();
  const structure = doc.sites.find((x) => x.kind !== 'npc') ?? null;
  const lad = useMemo(() => ladderOf({ skills: sk ?? null, clone: c.clone, structureSite: !!structure }), [sk, c.clone, structure]);
  const finder = useFinder(c, ix, graph);
  const whose = c.isMain ? 'your' : `${c.name}’s`;
  const hereSaid = !sk ? why
    : lad.here == null ? `Not on the first rung yet, by ${whose} skills: Industry I and Mass Production I start it.`
      : `You’re on rung ${lad.here + 1}, ${lad.rungs[lad.here].rung.title}, by ${whose} skills and the sites you’ve added. ${c.isMain ? 'Your' : `${c.name}’s`} blueprints and jobs aren’t read here yet.`;
  return (
    <section className="col" style={{ gap: 14 }} aria-label="Start" data-industry="start">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Industry turns materials into things that sell. You need a blueprint, a factory slot, and somewhere to build.</p>
        <Points compact items={[
          { kind: 'good', icon: ScrollText, lead: 'A blueprint original', text: 'builds for ever, and can be researched and copied.' },
          { kind: 'info', icon: Store, lead: 'What limits most items', text: 'is what the market takes, not your factory.' },
          { kind: 'info', icon: MapPin, lead: 'Nothing has to move', text: 'to null-sec to start: a high-sec NPC station near Jita will do.' },
        ]} />
      </div>
      <div data-industry="where">
        <Tiles min={200} items={[
          {
            l: 'Factory slots', v: s ? `${s.factory} of ${MAX_SLOTS}` : '–', n: s ? 'one job each: 1, plus Mass Production and Advanced Mass Production' : why,
            tip: 'How many manufacturing jobs run at once.\n\n• One, plus one a level of Mass Production and of Advanced Mass Production.\n• Eleven at most (EVE University, "Industry skills").',
          },
          {
            l: 'Science slots', v: s ? `${s.science} of ${MAX_SLOTS}` : '–', n: s ? 'research, copying and invention: 1, plus Laboratory Operation and Advanced Laboratory Operation' : why,
            tip: 'How many research, copying and invention jobs run at once.\n\n• One, plus one a level of Laboratory Operation and of Advanced Laboratory Operation.\n• Eleven at most.',
          },
          {
            l: 'Jita broker fee', v: feeKnown ? pct(c.broker) : '–', n: feeKnown ? feeSaid : why,
            tip: 'What a listing in Jita 4-4 costs to place, and what each sale pays in tax.\n\n• From Broker Relations and Accounting.\n• And the standings with Jita 4-4’s owners, Caldari State and Caldari Navy: raw, floored at 0, as the sync takes the main’s.\n• An alt’s are the cloud’s hourly read of it; not read yet, it pays as if it had none.',
          },
          {
            l: 'Clone', v: c.clone === 'alpha' ? 'Alpha' : c.clone === 'omega' ? 'Omega' : 'Not read',
            n: c.clone === 'alpha' ? 'Alpha can’t use Metallurgy, Research or Laboratory Operation: researching needs Omega'
              : c.clone === 'omega' ? 'every industry skill is open'
                : 'clone state not read: the 0.25% Alpha job tax is left out where it can’t be told',
          },
        ]} />
      </div>

      <div className="col" style={{ gap: 10 }}>
        <span className="lbl">From a first job to capitals</span>
        <p className="note small" style={{ margin: 0 }} data-industry="here">{hereSaid}</p>
        <ol className="ind-ladder" aria-label="From a first job to capitals" data-industry="ladder">
          {lad.rungs.map((v, i) => {
            const r = v.rung;
            const omega = omegaSaid(r, c.clone);
            const count = sk ? rungCount(ix, r.key, sk, c.clone) : null;
            return (
              <li key={r.key} className={`ind-rung ${v.state}`} data-rung={r.key}>
                <span className="ind-rung-n" aria-hidden="true">{i + 1}</span>
                <div className="col" style={{ gap: 8, minWidth: 0 }}>
                  <div className="ind-rung-head">
                    <b>{r.title}</b>
                    {v.state === 'here' && <span className="ind-rung-tag here">You’re here</span>}
                    {v.state !== 'here' && v.met === true && <span className="ind-rung-tag">{r.key === 'home' ? 'Site added' : 'Your skills cover it'}</span>}
                  </div>
                  <p className="note small" style={{ margin: 0 }}>{r.opens}</p>
                  {omega && <p className="ind-omega" style={{ margin: 0 }}>{omega}</p>}
                  {r.needs.length > 0 && <SkillNeeds needs={r.needs.map((n) => ({ skill: n.skill, level: n.level }))} beyond={(skill, level) => needBeyond(c.clone, skill, level)} />}
                  {count && <p className="note small" style={{ margin: 0 }}>{COUNT_SAID[r.key]?.(count.n, count.of)}</p>}
                  <RungPays k={r.key} c={c} ix={ix} f={finder} factory={s?.factory ?? null} structure={structure?.name ?? null} />
                  {r.key === 't2' && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('hustles/research')}><FlaskConical aria-hidden="true" />R&amp;D agents make datacores: the Research tab</button>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** Each rung's count of what it opens, at the shown character's skills raised to the rung's. */
const COUNT_SAID: Partial<Record<RungKey, (n: number, of: number) => string>> = {
  npc: (n, of) => `Builds ${units(n)} of the ${units(of)} Tech I items the finder ranks, at these skills.`,
  research: (n, of) => `Researches ${units(n)} of the ${units(of)} originals.`,
  copy: (n, of) => `Copies ${units(n)} of the ${units(of)} originals.`,
  t2: (n, of) => `Invents ${units(n)} of the ${units(of)} Tech II items with the sciences and encryption skills ${n ? 'already trained' : 'trained so far'}.`,
  capital: (n, of) => `Builds ${units(n)} of the ${units(of)} capital hulls.`,
};

/** What a rung pays now, from the finder's own rows at its site (useFinder), or why there's nothing to show. */
function RungPays({ k, c, ix, f, factory, structure }: { k: RungKey; c: IndustryChar; ix: Indexed; f: Finder; factory: number | null; structure: string | null }) {
  const name = (t: number) => ix.b.types[t]?.[0] ?? `Item #${t}`;
  const sk = c.pilot.skills;
  if (k === 'copy') return <p className="note small" style={{ margin: 0 }}>Copies sell on contracts, which this tab doesn’t read yet: the finder prices what you build from them.</p>;
  if (k === 'home') return <p className="note small" style={{ margin: 0 }}>{structure ? `${structure}: its tax, rigs and broker fee are what you typed under Build’s Where you build.` : 'A structure’s tax, rigs and broker fee aren’t known until you dock: add your home under Build’s Where you build, and type them.'}</p>;
  if (k === 'capital') return <p className="note small" style={{ margin: 0 }}>Capitals sell on contracts, not the market, so the finder doesn’t price them.</p>;
  if (k === 't2') return null;
  if (!sk) return null;
  if (f.waiting) return <p className="note small" style={{ margin: 0 }} data-pays="waiting">{f.waiting.text}</p>;
  if (!f.input || !f.rows.length) return <p className="note small" style={{ margin: 0 }} data-pays="working">Working out what pays…</p>;
  const at = f.site?.name ?? 'your build site';
  const opened = rowsOpened(ix, f.rows, k, sk, c.clone);
  if (k === 'npc') {
    const pays = paying(opened);
    if (!pays.length) return <p className="note small" style={{ margin: 0 }} data-pays="none">Nothing it opens makes a profit at {at} today.</p>;
    return (
      <div className="col ind-pays" data-pays="rows">
        <span className="note small">Pays now at {at}, one slot a day, at ME {f.input.me} / TE {f.input.te}:</span>
        {pays.slice(0, 3).map((r) => <div key={r.bp} className="ind-pay"><span>{name(r.product)}</span><b>{iskBigSigned(r.day!.profit)}</b></div>)}
      </div>
    );
  }
  if (k === 'research') {
    const best = researchedRows(f.input, opened);
    if (!best.length) return <p className="note small" style={{ margin: 0 }} data-pays="none">Nothing it opens makes a profit at ME 10 at {at} today.</p>;
    return (
      <div className="col ind-pays" data-pays="rows">
        <span className="note small">Researched to ME 10 / TE 20, one slot a day at {at}:</span>
        {best.map((x) => <div key={x.row.bp} className="ind-pay"><span>{name(x.row.product)}{x.at0 != null && <span className="sub">{iskBigSigned(x.at10 - x.at0)} a day over ME 0</span>}</span><b>{iskBigSigned(x.at10)}</b></div>)}
      </div>
    );
  }
  // More slots: one item a slot, the best ones first.
  const all = slotsPay(opened, MAX_SLOTS);
  if (!all.items || factory == null) return <p className="note small" style={{ margin: 0 }} data-pays="none">Nothing it opens makes a profit at {at} today.</p>;
  const now = slotsPay(opened, factory);
  const items = (n: number) => `${units(n)} item${n === 1 ? '' : 's'}`;
  return (
    <p className="note small" style={{ margin: 0 }} data-pays="slots">
      {c.isMain ? 'Your' : `${c.name}’s`} {units(factory)} factory slot{factory === 1 ? '' : 's'}: {now.items < factory
        ? `only ${items(now.items)} ${now.items === 1 ? 'pays' : 'pay'} at ${at} today, making ${iskBig(now.profit)} a day.`
        : `the best ${items(now.items)} at ${at} make ${iskBig(now.profit)} a day.`}
      {all.items > now.items && ` With ${MAX_SLOTS} slots, the best ${items(all.items)} make ${iskBig(all.profit)} a day.`}
    </p>
  );
}
```

In `src/styles.css`, after Task 5B's `.ind-wrap` rule:

```css
/* The ladder on Start (IndustryStart.tsx): one card a rung down the page, its number beside it, the rung you're on lit and
   the ones below it dimmed. Not .ladder, which is already two other things (Planets' step chips, the old mining cards). */
.ind-ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.ind-rung { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 12px; padding: 12px 14px; border: 1px solid var(--line-2); background: rgba(2, 7, 12, .35); min-width: 0; }
.ind-rung.here { border-color: var(--acc); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--acc) 40%, transparent); }
.ind-rung.done { opacity: .7; }
.ind-rung-n { font-family: var(--f-head); font-size: 22px; line-height: 1; color: var(--label); }
.ind-rung.here .ind-rung-n, .ind-rung.done .ind-rung-n { color: var(--acc); }
.ind-rung-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; color: var(--ink); }
.ind-rung-tag { font-family: var(--f-head); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--pos); }
.ind-rung-tag.here { color: var(--acc); }
.ind-omega { font-size: 12.5px; color: var(--acc2); }
.ind-pays { gap: 3px; }
.ind-pay { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; font-size: 12.5px; color: var(--body); max-width: 560px; }
.ind-pay b { font-weight: 500; color: var(--ink); white-space: nowrap; }
.ind-pay .sub { display: block; color: var(--label); font-size: 11.5px; }
```

Run: `npm run build`
Expected: passes.

- [ ] **Step 7: The page case: the ladder**

Insert above `// --- the end of the industry case` (after Task 6's block). It reseeds the main with the scan and the
`industry` doc (Itamo's station the default, the UALX-3 and C-J6MT homes among the sites), names the rungs' skills in the
`/universe/names` stub, and asserts the main (Omega) on rung 2, each rung's count and what it pays, then the main as an
Alpha (rung 1, "Needs Omega" on 2, 3, 6 and 7 and not on 1, 4 or 5, Mass Production V "Alpha uses III: Omega opens V"),
Fresh Alt (clone not read: "Clone state not read", never "Needs Omega"; not on the first rung) and Lost Alt (skills not
read: nothing judged):

```js
    // --- The ladder (Task 7): the main (Omega) on rung 2 by its skills, what each rung pays at Itamo's station (the
    // default site); then the main as an Alpha, Fresh Alt's clone not read, and Lost Alt's skills not read.
    npcAnswer = { complete: { at: iso(now - 3 * 3600_000), complete: true, pagesFailed: 0, sellers: { 25895: [1_250_000, [60001483, 60001486]] } }, partial: null };
    // The skills the rungs name, so each row reads as the game names it (the case's other names are stations).
    const SKILL_NAMES = { 3380: 'Industry', 3387: 'Mass Production', 24625: 'Advanced Mass Production', 3406: 'Laboratory Operation', 24624: 'Advanced Laboratory Operation',
      3409: 'Metallurgy', 3403: 'Research', 3402: 'Science', 3388: 'Advanced Industry', 22242: 'Capital Ship Construction' };
    ESI['/universe/names/'] = (url, req, json) => json(JSON.parse(req.postData() ?? '[]').map((id) => (SKILL_NAMES[id] ? { id, name: SKILL_NAMES[id], category: 'inventory_type' } : { id, name: `Station ${id}`, category: 'station' })));
    const ladderOf = async (d) => {
      await page.goto(SEED_PAGE);
      await seed({ ...d, industry: DOC, cloud: CLOUD_STATE }, { alts: altStore, cache: { prospects: SCAN } });
      await page.goto(`${BASE}#hustles/industry/start`);
      await page.reload();
      await page.waitForSelector('[data-industry="ladder"]', { timeout: 20_000 }).catch(() => problems.push('the ladder never drew'));
    };
    // A rung's words, compared without case (its tags are drawn in capitals).
    const rung = (k) => text(`[data-rung="${k}"]`).then((t) => t.toLowerCase());
    const says = async (k, t) => (await rung(k)).includes(t.toLowerCase());
    await ladderOf(ledger);
    await page.waitForSelector('[data-rung="npc"] [data-pays="rows"]', { timeout: 30_000 }).catch(async () => problems.push(`rung 1 never said what it pays: “${(await rung('npc')).slice(0, 300)}”`));
    await page.waitForTimeout(800);
    if (!(await text('[data-industry="here"]')).includes('You’re on rung 2, Research ME first, by your skills and the sites you’ve added. Your blueprints and jobs aren’t read here yet.')) problems.push(`the main isn’t on rung 2: “${await text('[data-industry="here"]')}”`);
    if (!(await page.locator('[data-rung="research"].here').count())) problems.push('rung 2 isn’t lit as where the main is');
    for (const t of ['Your skills cover it', 'Industry I', 'Mass Production I', 'Builds 954 of the 1,652 Tech I items the finder ranks, at these skills.', 'Pays now at Station 60001483, one slot a day, at ME 0 / TE 0:', 'Caracal'])
      if (!(await says('npc', t))) problems.push(`rung 1 doesn’t say “${t}”`);
    for (const t of ['You’re here', 'Researches 1,259 of the 1,652 originals.', 'Researched to ME 10 / TE 20, one slot a day at Station 60001483:', 'a day over ME 0'])
      if (!(await says('research', t))) problems.push(`rung 2 doesn’t say “${t}”`);
    if (!/your 5 factory slots: (only \d+ items? pays? at station 60001483 today, making|the best \d+ items at station 60001483 make) .+ a day\./.test(await rung('slots'))) problems.push(`rung 3 doesn’t say what the main’s 5 slots make: “${(await rung('slots')).slice(0, 300)}”`);
    if (!(await says('copy', 'Copies 1,633 of the 1,652 originals.'))) problems.push('rung 4 doesn’t count what the main can copy');
    if (!(await says('home', 'Site added')) || !(await says('home', 'Home in UALX-3: its tax, rigs and broker fee are what you typed'))) problems.push('rung 5 doesn’t say a structure site is added');
    if (!(await says('t2', 'Invents 0 of the 1,020 Tech II items with the sciences and encryption skills trained so far.'))) problems.push('rung 6 doesn’t count the Tech II the main can invent');
    for (const t of ['Capital Ship Construction III', 'Builds 12 of the 29 capital hulls.', 'Capitals sell on contracts, not the market, so the finder doesn’t price them.'])
      if (!(await says('capital', t))) problems.push(`rung 7 doesn’t say “${t}”`);
    if (/needs omega|clone state not read/i.test(await text('[data-industry="ladder"]'))) problems.push('the Omega main’s ladder speaks of Alpha');
    if (SHOTS) { await page.locator('[data-industry="ladder"]').scrollIntoViewIfNeeded().catch(() => undefined); await page.screenshot({ path: `${SHOTS}-industry-ladder.png` }); }
    // The main as an Alpha: Mass Production held to III, Laboratory Operation, Metallurgy and Research unusable, so rung 1.
    await ladderOf({ ...ledger, settings: { ...ledger.settings, clone: 'alpha' }, meta: { ...ledger.meta, cloneDetected: 'alpha' } });
    await page.waitForTimeout(1500);
    if (!(await text('[data-industry="here"]')).includes('You’re on rung 1, Build in a high-sec NPC station')) problems.push(`the Alpha main isn’t on rung 1: “${await text('[data-industry="here"]')}”`);
    for (const k of ['research', 'slots', 't2', 'capital']) if (!(await says(k, 'Needs Omega: Alpha'))) problems.push(`the Alpha main’s rung ${k} doesn’t say it needs Omega`);
    for (const k of ['npc', 'copy', 'home']) if (await says(k, 'Needs Omega')) problems.push(`the Alpha main’s rung ${k} says it needs Omega`);
    if (!(await says('research', 'Needs Omega: Alpha can’t use Laboratory Operation, Metallurgy or Research.'))) problems.push('rung 2 doesn’t name what an Alpha can’t use');
    if (!(await says('slots', 'Alpha uses III: Omega opens V'))) problems.push('the Alpha main’s Mass Production V reads as training, not as Alpha’s cap');
    if (SHOTS) { await page.locator('[data-industry="ladder"]').scrollIntoViewIfNeeded().catch(() => undefined); await page.screenshot({ path: `${SHOTS}-industry-ladder-alpha.png` }); }
    // Fresh Alt: its clone not read, never called Alpha; not on the first rung (no Mass Production).
    await ladderOf(ledger);
    await showFor('Fresh Alt');
    await page.waitForTimeout(800);
    if (!(await text('[data-industry="here"]')).includes('Not on the first rung yet, by Fresh Alt’s skills: Industry I and Mass Production I start it.')) problems.push(`Fresh Alt’s place on the ladder isn’t said: “${await text('[data-industry="here"]')}”`);
    if (!(await says('research', 'Clone state not read: an Alpha can’t use Laboratory Operation, Metallurgy or Research.'))) problems.push('Fresh Alt’s rung 2 doesn’t say its clone isn’t read');
    if (/needs omega/i.test(await text('[data-industry="ladder"]'))) problems.push('Fresh Alt, its clone not read, is told it needs Omega');
    // Lost Alt: skills not read; nothing judged, no count, no pays.
    await showFor('Lost Alt');
    await page.waitForTimeout(800);
    if (/your skills cover it|you’re here|builds \d|pays now/i.test(await text('[data-industry="ladder"]'))) problems.push('Lost Alt, its skills not read, is placed on the ladder');
    if (!(await text('[data-industry="here"]')).includes('Lost Alt')) problems.push(`Lost Alt’s ladder doesn’t say its skills aren’t read: “${await text('[data-industry="here"]')}”`);
```

Run: `LEDGER=industry PAGE=hustles/industry npm run check-pages` and again with `PHONE=1`; then
`PAGE=hustles/industry,hustles/industry/build npm run check-pages` (the plain loads: with nothing seeded, each rung's
"pays now" says the finder's own waiting words).
Expected: all pass.

Plant, run, see it fail, undo:
- `IndustryStart`: `needBeyond(c.clone, …)` replaced by `null` in `beyond`: "the Alpha main's Mass Production V reads as
  training, not as Alpha's cap".
- `IndustryStart`: `structureSite: false` always: "rung 5 doesn't say a structure site is added".
- `IndustryStart`: `ladderOf({ …, clone: 'omega', … })` whatever the clone: "the Alpha main isn't on rung 1".

- [ ] **Step 8: A look in a browser**

Run the case with `SHOTS=.playwright-mcp/industry/7` at both widths and look at `-industry-ladder.png` and
`-industry-ladder-alpha.png`: seven cards down the page, rung 2 lit with "You're here", rung 1 dimmed with "Your skills
cover it", each skill row with its pips and where it stands, the count and the pays lines; as an Alpha, the amber "Needs
Omega" line on 2, 3, 6 and 7 and the capped rows. On a phone the cards keep their number beside them, a long item name
wraps beside its figure, and "a day over ME 0" sits under the name.

- [ ] **Step 9: The notes**

Append to `docs/notes/industry.md`:

```markdown
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
  - **Where you stand is by skills alone** ("Your blueprints and jobs aren't read here yet", until stage 2), and Build at
    home, which has no skill, by a structure among the sites added. "You're here" is the last of an unbroken run of met
    rungs from the first; one met past a gap says "Your skills cover it" without being where you stand.
  - **Counts** are the bundle's skill lists against the character's usable levels raised to the rung's: with no skills,
    766 of the 1,652 Tech I items built, 1,229 researched, 1,633 copied, 12 of the 29 capital hulls (build 3569502).
  - **Pays now** is the finder's rows at its site: rung 1 the best three a slot makes a day; rung 2 the ten best priced
    again at ME 0 and at ME 10 / TE 20, the best three by ME 10 with the gain; rung 3 what the character's factory slots and
    eleven make, one item a slot. Rungs 4, 5 and 7 say why there's nothing to price (copies and capitals sell on contracts;
    a structure's tax, rigs and broker fee aren't known until docked). Nothing ranked yet says the finder's own waiting
    words, or "Working out what pays…".
```

- [ ] **Step 10: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add src/lib/industryLadder.ts src/components/hustles/IndustryStart.tsx src/components/hustles/Industry.tsx \
  src/components/SkillStrip.tsx src/styles.css scripts/check.mjs scripts/pages.mjs docs/notes/industry.md
git commit -m "$(cat <<'MSG'
Industry: the ladder on Start, from a first job to capitals, with Alpha's limits from CCP's caps

What was missing: the spec's Start ladder. The user has never done industry and asked the tab to teach it and help get it
going; the finder says what pays, but not what to train next or what each step opens.

What it is: seven rungs (build in a high-sec NPC station, research ME, more slots, copy, build at home, Tech II, capitals),
each with its skills at the shown character's pilot, what it opens, how many blueprints at those skills, and what it pays
now from the finder's own rows. Where the character stands is by its skills alone, said so, and Build at home by a
structure among the sites added.

Alpha: "Needs Omega" is worked out from CCP's caps for any Alpha, main or alt, and comes to the spec's rungs 2, 3, 6 and 7.
An alt's pilot marks only skills trained past their cap, so SkillNeeds gains an optional beyond: a level past the cap says
"Alpha uses III: Omega opens V" instead of a training time it can't have. A clone not read says so, never "Alpha".

Decided here, with the evidence: Capital Ship Construction III, not I, since the bundle's 29 capital hulls ask for III or
more (at I the rung opened none); the other levels are each skill's first useful one.

Evidence: the pure test on the bundle (766 / 1,229 / 1,633 / 12 of 29 with no skills; the page case's main on rung 2,
rung 1 as an Alpha); the page case at both widths. Caps read without 3406, Build at home always met, usable levels ignored
and an unread clone called Alpha each failed it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
MSG
)"
```

---
### Task 8: Tech II through invention

**Files:**
- Modify: `scripts/industry-bundle.mjs` (the watch set gains Tech II), `src/data/industryTypes.json` (rebuilt),
  `src/lib/industryRank.ts` (invention, Tech II rows, `inventionBlueprints`), `src/lib/industrySites.ts` (`labFor`),
  `src/lib/industryLadder.ts` (rung 6 opens Tech II rows), `src/components/hustles/industryFinder.ts`,
  `src/components/hustles/IndustryBuild.tsx`, `src/components/hustles/IndustryDetail.tsx`,
  `src/components/hustles/IndustryStart.tsx`, `scripts/check.mjs` (Task 1's watch-set count and a section of its own),
  `scripts/pages.mjs`, `docs/notes/industry.md`, `docs/notes/limits.md`

**Interfaces:**
- Consumes: `inventionChance`, `inventionCost`, `inventionTime`, `copyCost`, `copyTime`, `SKILL` (Task 2); `buildRow`,
  `sourceMaterial`, `MaterialPick`, `Leg`, `LabSite`, `startUp`, `shoppingList` (Task 3); `nearestLab`, `siteFacts`
  (Task 4B); `useFinder`, `IndustryBuild`, `IndustryDetail` (Tasks 5B and 6); `rowsOpened`, `paying`, `IndustryStart`
  (Task 7).
- Produces: `RowInput.lab?: LabSite | null`; `T2_ME`, `T2_TE`; `isEncryption(ix, skill)`; `type Invention`;
  `Row.invention: Invention | null`; `SlotDay.limit` gains `'invention'`; `Missing` gains `'noInvention'`;
  `inventionBlueprints(ix)`; `labFor(site, facts, stations, graph, indices): { at; site: LabSite } | null`;
  `Finder.lab`; `FinderView.tech: 'all' | 't1' | 't2'`.

**Decisions, said in the note:**
- **Costing** (the spec's): attempts = 1 / chance at the builder's skills; each attempt a one-run Tech I copy (the copy loses
  a run an attempt, EVE University) and its datacores, sourced like materials (Jita's ask plus freight, or the home hub);
  invention's job on 2% of the Tech II product's EIV an attempt (Task 2's `inventionCost`), the copy's on 2% of the Tech I's;
  then manufacturing at **ME 2 / TE 4 whatever the finder assumes**, a job no longer than the copy's runs. Checked to the
  ISK against EVE Ref's pump II at its own prices.
- **Which skill is the encryption one**: by its name ("… Encryption Methods"); the static data has no flag. Capital Ship
  Construction and Outpost Construction, which gate some capital modules' inventions, aren't sciences. At III/III/III a
  swap can't show (both read 0.4335 only by coincidence of equal levels), so the test sets unequal ones.
- **One factory slot fed by one lab slot**: a Tech II row makes no more a day than one lab slot invents for (copying
  included), and says so when that binds ("the lab slot inventing for it limits it"). Without it the Cerberus, two days to
  build and about 5.7 days of lab time a success at a 26% chance, read as half a hull a day.
- **The original is the Tech I one**, "to copy from", with payback on it; a Tech II copy can't be researched, so its detail
  has no level table and says why.
- **Datacores held count wherever they are** (an R&D agent's sit at its station), in start-up and the shopping list.
- **The lab** is `labFor`'s: the site when it can, else the nearest Laboratory. IndustryDetail's own research lab moves into
  it, so the row's invention and the detail's research can't come from different labs.
- **A slot's day under one unit** reads to a tenth ("0.2 / 0.5"), never "0" (`dayCount`): Tech II ships make it common.
- **Rung 6's "pays now"**: Tech II rows whose building the character could do with the item's own sciences and encryption
  skill (the rung's), at its own sciences' chance now.

**Ship-safety.** `industryTypes.json` grows from 1,858 to 2,916 types, so the cloud's morning scan reads about 1,058 more
types (watch-only, as Task 5A marks them) and Goonmetrics 59 calls a hub instead of 38. The Worker redeploys on this push
because `src/lib/` changes (a change to `src/data/` alone wouldn't). Nothing else in the cloud changes; an old browser
ignores the new rows' Tech II, which only this tab ranks.

- [ ] **Step 1: Write the failing tests**

In `scripts/check.mjs`, Task 1's two watch-set lines become:

```js
  eq('  the cloud\'s watch set (every Tech I and Tech II product, their materials and the datacores) and the blueprints it keeps NPC sellers for', [watchF.watch.length, watchF.bpos.length], [2916, 1673]);
  eq('    the pump and its circuits watched; its Tech II blueprint no NPC\'s; its Tech II product and datacores watched',
    [watchF.watch.includes(25894), watchF.watch.includes(25601), watchF.bpos.includes(25895), watchF.bpos.includes(26303), watchF.watch.includes(26302), watchF.watch.includes(20171)], [true, true, true, false, true, true]);
```

(Task 1's planted fault, the Tech I loop without its Tech II filter, still fails this line, now on the blueprints alone:
1,741 against 1,673.)

And add, after Task 7's section:

```js
console.log('\n--- Industry: Tech II through invention (industryRank.ts, industrySites.ts) ---');
{
  // EVE Ref's Large Trimark Armor Pump II (api.everef.net/v1/industry/cost, 9 October 2026, the research's
  // everef-26302.json): skills Industry IV, Advanced Industry II, Science V, Hydromagnetic Physics, Nanite Engineering and
  // Amarr Encryption Methods III; built in an Azbel with the L-Set rig in null-sec (6.17% manufacturing, 1% tax) and
  // invented there (7.93% invention, copying index 0, as EVE Ref's input); materials and datacores at EVE Ref's own prices
  // (Jita's lowest sell): 1,656,000 / 1,675,000 / 648.3 / 18,830, datacores 93,970 and 99,830. EVE Ref: invention
  // 1,547,893.66 a unit (datacores 1,341,176.47, jobs 206,717.19), a build 59,209,287.3, copying 5,593.23 for its copies.
  const I = await import('../src/lib/industry.ts');
  const K = await import('../src/lib/industryRank.ts');
  const S = await import('../src/lib/industrySites.ts');
  const { jumpsFrom, HIGH_SEC } = await import('../src/lib/jumps.ts');
  const fsT = await import('node:fs');
  const ix = I.indexBundle(JSON.parse(fsT.readFileSync(new URL('../src/data/industry.json', import.meta.url), 'utf8')));
  const g = JSON.parse(fsT.readFileSync(new URL('../src/data/universeGraph.json', import.meta.url), 'utf8')).systems;
  const fx = JSON.parse(fsT.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8'));
  const idx = I.parseIndices(fx.systems);
  const near = (label, got, want, tol) => { if (!(got != null && Math.abs(got - want) <= tol)) { failed++; console.log(`  FAIL ${label}: got ${got}, want ${want} ± ${tol}`); } };
  const ASK = { 25624: 1_656_000, 25609: 1_675_000, 11475: 648.3, 25620: 18_830, 20171: 93_970, 20416: 99_830 };
  const market = (t) => t === 26302 ? { jita: { ask: 65_270_000, bid: 61_550_000, bids: [{ price: 61_550_000, volume: 100 }], at: '', live: false }, stats: { spark: Array(30).fill(332), highs14: Array(14).fill(65_300_000), buyerShare: 0.5 } }
    : ASK[t] ? { jita: { ask: ASK[t], bid: ASK[t] * 0.9, bids: [], at: '', live: false }, stats: null } : { jita: null, stats: null };
  const azbel = { kind: 'azbel', rigs: [37170], band: 'null', tax: 0.01, index: { ...idx[30004807], manufacturing: 0.0617, invention: 0.0793, copying: 0 } };
  const input = {
    ix, bp: ix.bp.get(26303), me: 0, te: 0, skills: { 3380: 4, 3388: 2, 3402: 5, 11443: 3, 11442: 3, 23087: 3 }, clone: 'omega',
    site: azbel, lab: azbel, adjusted: fx.adjusted, market, sell: 'jita', share: 10, fees: { broker: 0.013, tax: 0.03375, hubBroker: null },
    legs: { jita: { kind: 'carry', jumps: 0 }, home: null }, noShipsToJita: true, jitaJumps: null, mines: false, hubName: null, now: Date.parse('2026-10-09T15:00:00Z'),
  };
  const row = K.buildRow(input), inv = row.invention;
  eq('  invented from the Tech I pump, at 43.35%: 2.3068 attempts a one-run copy, Hydromagnetic and Nanite the sciences, Amarr the encryption',
    [inv.from, inv.chance, inv.attempts, inv.runsPerCopy, inv.sciences.map((x) => x.id), inv.encryption?.id], [25895, 0.4335, 1 / 0.4335, 1, [11443, 11442], 23087]);
  eq('  built at ME 2 / TE 4 whatever the finder assumes: 19 / 14 / 1 / 22, one run a job (the copy\'s one run)', [row.materials.map((m) => m.qty), row.runs], [[19, 14, 1, 22], 1]);
  near('    the materials, at EVE Ref\'s prices: 55,328,908.30', row.materialCost, 55_328_908.3, 0.01);
  near('    the job: 3,880,379', row.job.total, 3_880_379, 1);
  near('  the datacores a copy: 6.92 of each, 1,341,176.47', inv.datacoreCost, 1_341_176.47, 0.01);
  near('  the invention jobs a copy: 206,717.19', inv.job.total, 206_717.19, 0.1);
  near('    and the two together, EVE Ref\'s invention a unit: 1,547,893.66', inv.datacoreCost + inv.job.total, 1_547_893.66, 0.5);
  near('  the Tech I copies a success, at a copying index of 0: 5,593.23', inv.copy.total, 5_593.23, 1);
  near('  a unit costs the build and the invention: 59,209,287.30 + 1,547,893.66 + the copies', row.costUnit, 59_209_287.3 + 1_547_893.66 + inv.copy.total, 1);
  near('  listed one tick under Jita\'s 65,270,000 it makes the research\'s 1,451,914.04 a unit, less the copies', row.sale.listNet - row.costUnit, 1_451_914.04 - inv.copy.total, 1);
  near('  one lab slot: 2.3068 × (17,596.8 s inventing + 2,030.4 s copying) a success, 1.91 units a day', inv.labPerDay, 86_400 / (inv.attempts * (17_596.8 + 2_030.4)), 0.01);
  eq('    which doesn\'t bind a one-run job a day: the slot limits it', [row.makes, row.day.limit], [1, 'slot']);
  eq('  a day\'s datacores: 3 an attempt, 6.92 a success, at the one a day it makes', inv.datacores.map((d) => [d.type, +d.qty.toFixed(4)]), [[20416, 6.9204], [20171, 6.9204]]);
  eq('  the skills it asks for: Industry V to build Tech II, Armor Rigging III; the sciences and encryption trained', row.lacking, [{ id: 3380, level: 5 }, { id: 26253, level: 3 }]);
  const su = K.startUp(row, { bpo: 1_250_000, research: 0, held: { units: (t) => (t === 20171 ? 4 : 0), cost: () => 0 } });
  near('  start-up counts a day\'s datacores beside the materials, less those held', su.materials, row.materialCost + 6.9204152 * 99_830 + (6.9204152 - 4) * 93_970, 1);
  eq('    and the shopping list buys the rest', K.shoppingList(row, { units: (t) => (t === 20171 ? 4 : 0), cost: () => 0 }).filter((x) => x.type === 20171).map((x) => +x.qty.toFixed(4)), [2.9204]);

  // The chance by which skill is which: a science counts a thirtieth a level, the encryption skill a fortieth.
  const at = (sk) => K.buildRow({ ...input, skills: { 3380: 4, 3388: 2, 3402: 5, ...sk } }).invention.chance;
  eq('  the chance at unequal levels: a science at IV 38.53%, the encryption skill at IV 37.40%, nothing trained 34%', [+at({ 11443: 4 }).toFixed(6), +at({ 23087: 4 }).toFixed(6), at({})], [0.385333, 0.374, 0.34]);
  eq('    the encryption skill found by its name', [K.isEncryption(ix, 23087), K.isEncryption(ix, 11443)], [true, false]);

  // Where invention can't be costed: said, and the row not priced.
  const noLab = K.buildRow({ ...input, lab: null });
  eq('  no Laboratory reachable: the invention isn\'t costed and the row says why', [noLab.missing, noLab.invention.why, noLab.costUnit, noLab.day], ['noInvention', 'no Laboratory can be reached', null, null]);
  eq('    a lab with no index read: likewise', K.buildRow({ ...input, lab: { ...azbel, index: null } }).invention.why, 'no index for the lab’s system');
  eq('    a datacore nobody lists: likewise', K.buildRow({ ...input, market: (t) => (t === 20171 ? { jita: null, stats: null } : market(t)) }).invention.why, 'a datacore nobody lists where it can be bought');

  // The lab binds where invention is slower than the build: the Cerberus, a 26% one-run copy, a 2-day build.
  const cer = ix.bp.get(11994), cerT1 = ix.bp.get(ix.inventedFrom.get(11994));
  const adj = Object.fromEntries([...cer[2][1], ...cerT1[2][1]].map(([t]) => [t, 1000]));
  const npc = { kind: 'npc', rigs: [], band: 'high', tax: 0.0025, index: idx[30000119] };
  const cerRow = K.buildRow({ ...input, bp: cer, site: npc, lab: npc, adjusted: adj, skills: { 3380: 5, 3388: 2, 3402: 5 }, noShipsToJita: false,
    market: (t) => (t === 11993 ? { jita: { ask: 300e6, bid: 280e6, bids: [{ price: 280e6, volume: 10 }], at: '', live: false }, stats: { spark: Array(30).fill(20), highs14: Array(14).fill(310e6), buyerShare: 0.5 } } : { jita: { ask: 1000, bid: 900, bids: [], at: '', live: false }, stats: null }) });
  eq('  the lab binds a Tech II cruiser: it makes what one lab slot invents for, not the half a day the factory could', [cerRow.makes === cerRow.invention.labPerDay, cerRow.makes < 0.5, cerRow.day.limit], [true, true, 'invention']);

  // The ladder's rung 6 opens Tech II rows: their own sciences and encryption skill are the rung's, their building isn't.
  const L = await import('../src/lib/industryLadder.ts');
  const t2row = { bp: 26303, product: 26302, day: { profit: 2e6 }, invention: { from: 25895 } };
  eq('  rung 6 opens the pump II with its sciences untrained, only with Armor Rigging III, and no other rung opens it',
    [L.rowsOpened(ix, [t2row], 't2', { 3380: 5, 26253: 3 }, 'omega').length, L.rowsOpened(ix, [t2row], 't2', { 3380: 5 }, 'omega').length, L.rowsOpened(ix, [t2row], 'npc', { 3380: 5, 26253: 3 }, 'omega').length], [1, 0, 0]);

  eq('  the finder costs 1,012 Tech II blueprints through invention (no capital hull), apart from its 1,652 Tech I',
    [K.inventionBlueprints(ix).length, K.inventionBlueprints(ix).some((bp) => K.finderBlueprints(ix).includes(bp))], [1012, false]);

  // Where the lab is: the site when it has a Laboratory, else the nearest one, at that system's index.
  const high = jumpsFrom(g, S.JITA_SYSTEM, (_, s) => s >= HIGH_SEC);
  const home = S.homeSite(30004807, 'UALX-3', 'azbel'), homeFacts = S.siteFacts(home, g, high, idx);
  const st = S.stationSite({ stationId: 60003466, systemId: 30000144, system: 'Perimeter', security: 0.949, jumps: 1, index: 0.0695, lab: false }, 'Perimeter station');
  const stLab = S.labFor(st, S.siteFacts(st, g, high, idx), ix.b.stations, g, idx);
  eq('  the lab: a structure is its own; an NPC station without one sends you to the nearest (Sirppala, from Perimeter) at an NPC station\'s 0.25%, its index none where ESI\'s list (here the fixture\'s eight systems) has none',
    [S.labFor(home, homeFacts, ix.b.stations, g, idx).at, S.labFor(home, homeFacts, ix.b.stations, g, idx).site.index === homeFacts.index, stLab.at, stLab.site.tax, stLab.site.index],
    ['Home in UALX-3', true, 'the nearest Laboratory, in Sirppala (2 jumps)', 0.0025, null]);
  eq('    from Itamo, Sobaseki\'s, at its index', S.labFor(S.homeSite(30000119, 'Itamo', 'other'), { ...S.siteFacts(S.homeSite(30000119, 'Itamo', 'other'), g, high, idx), canScience: false }, ix.b.stations, g, idx).site.index === idx[30001363], true);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -A3 "watch set\|Tech II through invention"`
Expected: the watch set reads 1,858; the Tech II section fails (`row.invention` undefined).

- [ ] **Step 3: Tech II in the watch set**

In `scripts/industry-bundle.mjs`:

```diff
--- a/scripts/industry-bundle.mjs
+++ b/scripts/industry-bundle.mjs
@@ -205,7 +205,8 @@
   if (m && types.get(id)?.published) eiv[id] = (m.materials ?? []).map((x) => [x.typeID, x.quantity]);
 }
 
-// The watch set: every Tech I product and its materials. The blueprints whose NPC sellers the scan keeps: Tech I only.
+// The watch set: every Tech I product and its materials, then Tech II's (below). The blueprints whose NPC sellers the scan
+// keeps: Tech I only.
 const watch = new Set(), bpos = [];
 for (const id of [...t1].filter((x) => !t2.has(x)).sort((a, b) => a - b)) {
   const m = man(bps.get(id));
@@ -213,6 +214,14 @@
   for (const x of m.materials ?? []) watch.add(x.typeID);
   bpos.push(id);
 }
+// Tech II, costed through invention: every invention product and its materials, and the datacores each Tech I's
+// invention takes. Their blueprints aren't NPCs' (none sells a Tech II original), so not in bpos.
+for (const id of [...t2].sort((a, b) => a - b)) {
+  const m = man(bps.get(id));
+  watch.add(m.products[0].typeID);
+  for (const x of m.materials ?? []) watch.add(x.typeID);
+}
+for (const id of [...t1].sort((a, b) => a - b)) for (const x of bps.get(id).activities.invention?.materials ?? []) watch.add(x.typeID);
 
 const released = sde.releaseDate;
 const out = { build: sde.buildNumber, released, source: `CCP static data build ${sde.buildNumber}, released ${released}`, bps: outBps, types: outTypes, groups: outGroups, filters, rigs, structures, stations, skills };
```

Run: `SDE_ZIP=.playwright-mcp/research/rd-agents/sde-3569502.zip node scripts/industry-bundle.mjs`
Expected: `src/data/industryTypes.json: 2916 watched, 1673 blueprints, 25.7 KB, 10.3 KB gzipped`; `industry.json` and
`industryEiv.json` byte for byte as before (`git diff --stat src/data` shows only `industryTypes.json`).

- [ ] **Step 4: Where the lab is**

In `src/lib/industrySites.ts`:

```diff
--- a/src/lib/industrySites.ts
+++ b/src/lib/industrySites.ts
@@ -1,6 +1,6 @@
 import { HIGH_SEC, jumpsFrom, type Graph } from './jumps';
 import { NPC_FACILITY_TAX, RIG_SIZE, secBand, kindOfType, type BundleRig, type Indexed, type IndustryIndex, type SecBand, type SiteKind } from './industry';
-import { NEAR_JITA_JUMPS, type Leg } from './industryRank';
+import { NEAR_JITA_JUMPS, type LabSite, type Leg } from './industryRank';
 import type { FreightRoute, IndustrySite } from './prefs';
 
 /**
@@ -55,6 +55,23 @@
   return best;
 }
 
+/**
+ * Where a site's research, copying and invention run: the site itself when it can (an NPC station with a Laboratory, or
+ * any structure), else the nearest NPC station with one by any route, at its system's index (null while the indices
+ * aren't read, or when ESI lists none for it) and an NPC station's tax. Null when no Laboratory can be reached on the map.
+ * The finder (Tech II's invention) and a row's detail (research) both take it from here, so they can't disagree.
+ */
+export function labFor(site: IndustrySite, facts: SiteFacts, stations: readonly [number, number, number][], graph: Graph, indices: Record<number, IndustryIndex> | null): { at: string; site: LabSite } | null {
+  if (facts.canScience) return { at: site.name, site: { kind: site.kind, rigs: site.rigs, band: facts.band, tax: facts.tax, index: facts.index } };
+  const n = nearestLab(stations, graph, site.systemId);
+  if (!n) return null;
+  const sys = graph[n.systemId];
+  return {
+    at: `the nearest Laboratory, in ${sys?.[1] ?? `system ${n.systemId}`} (${n.jumps} jump${n.jumps === 1 ? '' : 's'})`,
+    site: { kind: 'npc', rigs: [], band: secBand(sys?.[0] ?? 0), tax: NPC_FACILITY_TAX, index: indices?.[n.systemId] ?? null },
+  };
+}
+
 /** What a site is, worked out: its system's name and band, its high-sec jumps from Jita (null: no high-sec route), its index, whether it can research. */
 export type SiteFacts = {
   system: string | null; security: number | null; band: SecBand;
```

- [ ] **Step 5: Invention in the finder's rules**

In `src/lib/industryRank.ts`:

```diff
--- a/src/lib/industryRank.ts
+++ b/src/lib/industryRank.ts
@@ -3,9 +3,9 @@
 import { buyerShare, EVEN_SPLIT, tradingSplit, type BookSold, type SplitFrom } from './split';
 import type { BookLevel, HistRow, ProspectStats } from './types';
 import {
-  DAY_S, eivOf, jobTime, lacking, manufacturingCost, manufacturingSkills, materialsFor, productOf, researchCost, researchTime,
-  rigFor, runsPerDay, structureBonus, type BpActivity, type BundleBp, type Clone, type Indexed, type IndustryIndex,
-  type JobCost, type SecBand, type SiteKind,
+  copyCost, copyTime, DAY_S, eivOf, inventionChance, inventionCost, inventionTime, jobTime, lacking, manufacturingCost, manufacturingSkills,
+  materialsFor, productOf, researchCost, researchTime, rigFor, runsPerDay, SKILL, structureBonus, type BpActivity, type BundleBp,
+  type Clone, type Indexed, type IndustryIndex, type JobCost, type SecBand, type SiteKind,
 } from './industry';
 
 /**
@@ -201,8 +201,11 @@
   };
 }
 
-/** One factory slot's day: units onto listings and into bids, what they make, and whether the market or the slot limits it. */
-export type SlotDay = { list: number; bids: number; units: number; profit: number; limit: 'market' | 'slot' };
+/**
+ * One factory slot's day: units onto listings and into bids, what they make, and whether the market, the slot or (Tech
+ * II) the lab slot inventing for it limits it.
+ */
+export type SlotDay = { list: number; bids: number; units: number; profit: number; limit: 'market' | 'slot' | 'invention' };
 
 /**
  * What one slot earns a day selling at one place: the better-paying side first, up to your share of its pace, then the
@@ -227,8 +230,8 @@
   return { list: n.list, bids: n.bids, units, profit, limit: units >= makes - 1e-9 ? 'slot' : 'market' };
 }
 
-/** Why a row isn't priced: no Jita book this morning; indices, adjusted prices or a material's price not known; nowhere it may be sold. */
-export type Missing = 'noBook' | 'noIndex' | 'noAdjusted' | 'noMaterials' | 'noSale';
+/** Why a row isn't priced: no Jita book this morning; indices, adjusted prices or a material's price not known; nowhere it may be sold; (Tech II) its invention can't be costed. */
+export type Missing = 'noBook' | 'noIndex' | 'noAdjusted' | 'noMaterials' | 'noSale' | 'noInvention';
 
 export type RowSite = { kind: SiteKind; rigs: readonly number[]; band: SecBand; tax: number | null; index: IndustryIndex | null };
 export type RowInput = {
@@ -246,6 +249,35 @@
   noShipsToJita: boolean; jitaJumps: number | null;
   mines: boolean; hubName: string | null;
   now: number;
+  /** Where research, copying and invention run (industrySites' labFor): the site, or the nearest Laboratory; null when none can be reached. Tech II's invention needs it. */
+  lab?: LabSite | null;
+};
+
+/** A Tech II copy as invented: ME 2, TE 4 (EVE University, "Invention"). Decryptors, which change them, aren't modelled. */
+export const T2_ME = 2, T2_TE = 4;
+/** Skills an invention lists that aren't its sciences: Capital Ship Construction and Outpost Construction gate some capital modules'. */
+const NOT_SCIENCE = new Set<number>([SKILL.capitalShips, 3400]);
+/** An encryption skill, by its name: the static data has no flag for it, and its level counts a quarter less than a science's. */
+export const isEncryption = (ix: Indexed, skill: number): boolean => (ix.b.types[skill]?.[0] ?? '').endsWith('Encryption Methods');
+
+/**
+ * A Tech II unit's invention, a success at a time: the chance at the builder's skills (the two sciences a thirtieth a
+ * level, the encryption skill a fortieth), attempts = 1 / chance, each attempt a one-run Tech I copy (the copy loses a run
+ * an attempt) and its datacores, at the lab's index and bonuses. A success is a copy of `runsPerCopy` runs at ME 2 / TE 4.
+ * `labPerDay` is what one lab slot invents for a day, copying included. Costs not known (no lab, no index there, a
+ * datacore nobody lists, no adjusted price) stay null, with `why`.
+ */
+export type Invention = {
+  from: number; chance: number; attempts: number; runsPerCopy: number; unitsPerCopy: number;
+  sciences: { id: number; level: number }[]; encryption: { id: number; level: number } | null;
+  /** Each datacore an attempt; and a day's, sourced like a material (qty: a day's, at the units a day made). */
+  perAttempt: { type: number; qty: number }[];
+  datacores: MaterialPick[];
+  /** A success's datacores, invention jobs and one-run copies; and all of it a unit. */
+  datacoreCost: number | null; job: JobCost | null; copy: JobCost | null; perUnit: number | null;
+  /** Lab seconds a success (its copies and attempts), and units a day one lab slot invents for. */
+  labSeconds: number; labPerDay: number;
+  why: string | null;
 };
 
 export type Row = {
@@ -255,6 +287,8 @@
   eiv: number | null; job: JobCost | null;
   costUnit: number | null;
   sales: Sale[]; sale: Sale | null; day: SlotDay | null;
+  /** Tech II: its invention, costed into costUnit; null for Tech I. */
+  invention: Invention | null;
   /** When the facility tax isn't known: what each 1% of it would cost a day. */
   taxPerPct: number | null;
   /** When selling at a hub whose broker fee isn't known: what each 1% of it would cost a day. */
@@ -272,14 +306,21 @@
   const prod = productOf(bp)!;
   const t = ix.b.types[prod.type];
   const ship = t?.[2] === 6;
+  // Tech II: built from an invented copy, at ME 2 / TE 4, a job no longer than the copy's runs.
+  const from = ix.inventedFrom.get(bp[0]);
+  const t1 = from != null ? ix.bp.get(from) : undefined;
+  const invented = t1 ? (t1[6] as BpActivity | 0 || null)?.[3].find((p) => p[0] === bp[0]) ?? null : null;
+  const me = invented ? T2_ME : o.me, te = invented ? T2_TE : o.te;
   const sb = structureBonus(ix, o.site.kind);
   const rig = rigFor(ix, o.site.rigs, o.site.kind, o.site.band, prod.type, 'manufacturing');
-  const time = jobTime(m[0], o.te, manufacturingSkills(ix, m[2], o.skills), sb.time, rig.time);
-  const runs = runsPerDay(time, o.copyRuns);
+  const time = jobTime(m[0], te, manufacturingSkills(ix, m[2], o.skills), sb.time, rig.time);
+  const runs = runsPerDay(time, invented ? o.copyRuns ?? invented[1] : o.copyRuns);
   const days = Math.max(1, (runs * time) / DAY_S);
   const made = runs * prod.perRun;
-  const makes = made / days;
-  const need = materialsFor(m[1], runs, o.me, sb.material, rig.material);
+  const lab = t1 && invented ? inventionLab(o, t1, invented, prod.perRun) : null;
+  // One factory slot fed by one lab slot: Tech II makes no more a day than the lab invents for.
+  const makes = lab ? Math.min(made / days, lab.labPerDay) : made / days;
+  const need = materialsFor(m[1], runs, me, sb.material, rig.material);
   const week = (qty: number) => (qty * 7) / days;
   const lines = (price: (mk: Market) => number | null | undefined) => need.map(([type, qty]) => ({ volume: ix.b.types[type]?.[3] ?? 0, price: price(o.market(type)) ?? 0, units: week(qty) }));
   const jitaLeg = batchLeg(o.legs.jita, lines((mk) => mk.jita?.ask));
@@ -296,7 +337,8 @@
   const materialCost = materials.every((x) => x.price != null) ? materials.reduce((s, x) => s + x.qty * x.price!, 0) : null;
   const eiv = o.adjusted ? eivOf(m[1], o.adjusted) : null;
   const job = eiv != null && o.site.index ? manufacturingCost(eiv, runs, { index: o.site.index.manufacturing, structure: sb.cost, rig: rig.cost, tax: o.site.tax, clone: o.clone }) : null;
-  const costUnit = materialCost != null && job ? (materialCost + job.total) / made : null;
+  const invention = t1 && invented && lab ? inventionCosts(o, t1, invented, lab, eiv, makes, jitaLeg, homeLeg) : null;
+  const costUnit = materialCost != null && job && (!invented || invention?.perUnit != null) ? (materialCost + job.total) / made + (invention?.perUnit ?? 0) : null;
 
   const pm = o.market(prod.type);
   const jitaOk = shipToJita({ ship, noShipsToJita: o.noShipsToJita, band: o.site.band, jitaJumps: o.jitaJumps });
@@ -310,17 +352,81 @@
     const d = s.why ? null : slotDay(makes, s, costUnit, o.share);
     if (d && (!day || d.profit > day.profit)) { sale = s; day = d; }
   }
+  // The lab binds when it invents for fewer than the factory slot makes and every one of those sells.
+  if (day && lab && lab.labPerDay < made / days && day.limit === 'slot') day = { ...day, limit: 'invention' };
   const missing: Missing | null = !pm.jita && !pm.home ? 'noBook' : !o.site.index ? 'noIndex' : eiv == null ? 'noAdjusted'
-    : materialCost == null ? 'noMaterials' : !day ? 'noSale' : null;
+    : materialCost == null ? 'noMaterials' : invented && invention?.perUnit == null ? 'noInvention' : !day ? 'noSale' : null;
+  // A tax not typed: the manufacturing job's, and the lab's too where the lab is the site, each 1% of their bases a day.
+  const labTaxed = invention?.job && invention.copy && o.lab?.tax == null ? ((invention.job.base + invention.copy.base) * makes) / invention.unitsPerCopy : 0;
   return {
-    bp: bp[0], product: prod.type, perRun: prod.perRun, ship, time, runs, makes, materials, materialCost, eiv, job, costUnit, sales, sale, day,
-    taxPerPct: job && o.site.tax == null ? (job.base * 0.01) / days : null,
+    bp: bp[0], product: prod.type, perRun: prod.perRun, ship, time, runs, makes, materials, materialCost, eiv, job, costUnit, sales, sale, day, invention,
+    taxPerPct: job && o.site.tax == null ? (job.base / days + labTaxed) * 0.01 : null,
     brokerPerPct: day && sale?.place === 'home' && !sale.brokerKnown && sale.list != null ? day.list * sale.list * 0.01 : null,
-    lacking: lacking(m[2], o.skills), missing,
+    lacking: lackingAll(m[2], t1, o.skills), missing,
     shipsKeptHome: ship && !jitaOk && o.sell !== 'home',
   };
 }
 
+/** The skills a row asks for: its manufacturing's, and for Tech II its Tech I's invention and copying too, each at the highest level asked. */
+function lackingAll(made: [number, number][], t1: BundleBp | undefined, skills: Record<number, number>): { id: number; level: number }[] {
+  const want = new Map<number, number>();
+  const lists = [made, ...(t1 ? [(t1[6] || null)?.[2] ?? [], (t1[3] || null)?.[2] ?? []] : [])];
+  for (const list of lists) for (const [id, l] of list) want.set(id, Math.max(want.get(id) ?? 0, l));
+  return lacking([...want], skills);
+}
+
+/** A Tech II row's lab: its chance, attempts and lab time, before any price (so the slot's units a day can be capped first). */
+function inventionLab(o: RowInput, t1: BundleBp, invented: number[], perRun: number) {
+  const { ix } = o;
+  const inv = t1[6] as BpActivity, cp = t1[3] as BpActivity | 0;
+  const level = (id: number) => Math.max(0, Math.min(5, o.skills[id] ?? 0));
+  const listed = inv[2].filter(([id]) => !NOT_SCIENCE.has(id));
+  const enc = listed.find(([id]) => isEncryption(ix, id));
+  const sciences = listed.filter(([id]) => !isEncryption(ix, id)).map(([id]) => ({ id, level: level(id) }));
+  const encryption = enc ? { id: enc[0], level: level(enc[0]) } : null;
+  const chance = inventionChance(invented[2] ?? 0, sciences[0]?.level ?? 0, sciences[1]?.level ?? 0, encryption?.level ?? 0);
+  const attempts = chance > 0 ? 1 / chance : Infinity;
+  const runsPerCopy = invented[1];
+  const lab = o.lab ?? null;
+  const sb = structureBonus(ix, lab?.kind ?? 'npc');
+  const rigT = (a: 'invention' | 'copying') => (lab ? rigFor(ix, lab.rigs, lab.kind, lab.band, null, a).time : 1);
+  const labSeconds = attempts * (inventionTime(ix, inv[0], o.skills, sb.time, rigT('invention')) + (cp ? copyTime(ix, cp[0], 1, 1, o.skills, sb.time, rigT('copying')) : 0));
+  return { inv, sciences, encryption, chance, attempts, runsPerCopy, unitsPerCopy: runsPerCopy * perRun, labSeconds, labPerDay: Number.isFinite(labSeconds) && labSeconds > 0 ? (DAY_S / labSeconds) * runsPerCopy * perRun : 0 };
+}
+
+/** A Tech II row's invention, priced: datacores sourced like materials, the invention jobs and the one-run copies at the lab. */
+function inventionCosts(o: RowInput, t1: BundleBp, invented: number[], l: ReturnType<typeof inventionLab>, eivT2: number | null, makes: number, jitaLeg: Leg, homeLeg: Leg | null): Invention {
+  const { ix } = o;
+  const lab = o.lab ?? null;
+  const perDay = makes / l.unitsPerCopy * l.attempts;
+  const datacores: MaterialPick[] = l.inv[1].map(([type, qty]) => {
+    const mk = o.market(type), mt = ix.b.types[type];
+    return {
+      ...sourceMaterial({
+        type, weekNeed: qty * perDay * 7, volume: mt?.[3] ?? 0, mineable: false, mines: false,
+        jita: mk.jita ? { ask: mk.jita.ask, bid: mk.jita.bid, patient: mk.stats?.lows14 ? reachedBid(mk.stats.lows14) : null } : null,
+        jitaLeg, home: mk.home ?? null, homeLeg, hubName: o.hubName,
+      }),
+      qty: qty * perDay,
+    };
+  });
+  const perAttempt = l.inv[1].reduce<number | null>((sum, [type, qty], i) => (sum == null || datacores[i].price == null ? null : sum + qty * datacores[i].price!), 0);
+  const eivT1 = o.adjusted && t1[2] ? eivOf((t1[2] as BpActivity)[1], o.adjusted) : null;
+  const sb = structureBonus(ix, lab?.kind ?? 'npc');
+  const at = (a: 'invention' | 'copying') => (lab?.index ? { index: lab.index[a], structure: sb.cost, rig: rigFor(ix, lab.rigs, lab.kind, lab.band, null, a).cost, tax: lab.tax, clone: o.clone } : null);
+  const job = eivT2 != null && at('invention') && Number.isFinite(l.attempts) ? inventionCost(eivT2, l.attempts, at('invention')!) : null;
+  const copy = eivT1 != null && at('copying') && Number.isFinite(l.attempts) ? copyCost(eivT1, 1, l.attempts, at('copying')!) : null;
+  const datacoreCost = perAttempt != null && Number.isFinite(l.attempts) ? perAttempt * l.attempts : null;
+  const why = !lab ? 'no Laboratory can be reached' : !lab.index ? 'no index for the lab’s system' : !Number.isFinite(l.attempts) ? 'no chance of success at these skills'
+    : datacoreCost == null ? 'a datacore nobody lists where it can be bought' : job == null || copy == null ? 'no adjusted price for it' : null;
+  return {
+    from: t1[0], chance: l.chance, attempts: l.attempts, runsPerCopy: l.runsPerCopy, unitsPerCopy: l.unitsPerCopy,
+    sciences: l.sciences, encryption: l.encryption, perAttempt: l.inv[1].map(([type, qty]) => ({ type, qty })), datacores, datacoreCost, job, copy,
+    perUnit: why ? null : (datacoreCost! + job!.total + copy!.total) / l.unitsPerCopy,
+    labSeconds: l.labSeconds, labPerDay: l.labPerDay, why,
+  };
+}
+
 /** The finder's kinds, from a product's category, group and the static data's filters. */
 export type ProductKind = 'rigs' | 'modules' | 'charges' | 'drones' | 'deployables' | 'hulls-small' | 'hulls-medium' | 'hulls-large' | 'hulls-other'
   | 'fuel' | 'structures' | 'components' | 'capital-parts' | 'capital' | 'other';
@@ -349,6 +455,14 @@
   });
 }
 
+/** Tech II blueprints the finder costs through invention: every one invented from a Tech I (the 68 old originals on the market too), no capital hull. */
+export function inventionBlueprints(ix: Indexed): BundleBp[] {
+  return ix.b.bps.filter((bp) => {
+    const p = productOf(bp);
+    return !!p && !!bp[2] && ix.inventedFrom.has(bp[0]) && productKind(ix, p.type) !== 'capital';
+  });
+}
+
 /** Every finder blueprint as a row, priced first, best profit a day first; rows not priced after, in the bundle's order. */
 export function rankBuilds(o: Omit<RowInput, 'bp'>, bps: readonly BundleBp[]): Row[] {
   const rows = bps.map((bp) => buildRow({ ...o, bp }));
@@ -396,7 +510,7 @@
  */
 export function startUp(row: Row, o: { bpo: number | null; research: number | null; held: Held }): { bpo: number | null; research: number | null; materials: number | null; heldUnits: number; heldCost: number | null; total: number | null } {
   let materials = 0, heldUnits = 0, heldCost: number | null = 0, known = true;
-  for (const x of row.materials) {
+  for (const x of [...row.materials, ...(row.invention?.datacores ?? [])]) {
     const h = Math.min(x.qty, Math.max(0, o.held.units(x.type)));
     heldUnits += h;
     if (h > 0) { const c = o.held.cost(x.type, h); heldCost = heldCost != null && c != null ? heldCost + c : null; }
@@ -409,7 +523,7 @@
 
 /** What to buy for a day's job beyond what's held, per source: each line the units, the delivered price and the source picked. */
 export function shoppingList(row: Row, held: Held): { type: number; qty: number; price: number | null; source: Source | null }[] {
-  return row.materials.map((x) => ({ type: x.type, qty: Math.max(0, x.qty - Math.max(0, held.units(x.type))), price: x.price, source: x.pick })).filter((x) => x.qty > 0);
+  return [...row.materials, ...(row.invention?.datacores ?? [])].map((x) => ({ type: x.type, qty: Math.max(0, x.qty - Math.max(0, held.units(x.type))), price: x.price, source: x.pick })).filter((x) => x.qty > 0);
 }
 
 /** The morning scan's NPC sellers of every bundle blueprint in The Forge (`industry_npc`): price and stations, cheapest first. */
```

In `src/lib/industryLadder.ts`, rung 6 opens Tech II rows and no other rung does:

```diff
--- a/src/lib/industryLadder.ts
+++ b/src/lib/industryLadder.ts
@@ -154,10 +154,22 @@
   return { rungs: RUNGS.map((rung, i) => ({ rung, met: met[i], state: here != null && i < here ? 'done' : i === here ? 'here' : i === next ? 'next' : 'ahead' })), here };
 }
 
-/** The finder's priced rows a rung opens (manufacturing skills within the usable levels raised to the rung's), best profit a day first, losing ones too. */
+/**
+ * The finder's priced rows a rung opens (manufacturing skills within the usable levels raised to the rung's), best profit a
+ * day first, losing ones too. Tech II rows are rung 6's alone, whose own sciences and encryption skill are the rung's ("the
+ * item's two sciences, its encryption skill"): its Tech I's invention skills are raised too before its building is checked
+ * (a Tech II build asks for the sciences as well). Every other rung opens Tech I rows.
+ */
 export function rowsOpened(ix: Indexed, rows: readonly Row[], key: RungKey, skills: Record<number, number>, clone: Clone): Row[] {
   const s = onRung(key, skills, clone);
-  return rows.filter((r) => r.day && can(ix.bp.get(r.bp)?.[2] ?? 0, s)).sort((a, b) => b.day!.profit - a.day!.profit);
+  const at = (r: Row) => {
+    const inv = r.invention ? (ix.bp.get(r.invention.from)?.[6] || null) : null;
+    if (!inv) return s;
+    const up = { ...s };
+    for (const [id, l] of inv[2]) up[id] = Math.max(up[id] ?? 0, l);
+    return up;
+  };
+  return rows.filter((r) => r.day && (key === 't2') === !!r.invention && can(ix.bp.get(r.bp)?.[2] ?? 0, at(r))).sort((a, b) => b.day!.profit - a.day!.profit);
 }
 
 /** The rows that make a profit, of those. */
```

- [ ] **Step 6: Run the tests to see them pass, then plant each rule wrong**

Run: `npm run check`
Expected: all pass, Task 7's ladder section unchanged.

Plant, run, see it fail, undo (each run checked when this plan was written):
- `isEncryption` always false: the encryption skill is never counted, so every EVE Ref figure from "invented from the Tech I
  pump, at 43.35%" on fails, and "the chance at unequal levels" (34% where 37.40% is right) and "found by its name".
- `const makes = made / days;` (no lab cap): "the lab binds a Tech II cruiser" fails.
- `perUnit` without `copy!.total`: "a unit costs the build and the invention" and "listed one tick under…" fail.
- `startUp` over `row.materials` alone: "start-up counts a day's datacores" fails.
- In `rowsOpened`, `up[id] = up[id] ?? 0` (the Tech I's invention skills not raised): "rung 6 opens the pump II with its
  sciences untrained" fails.

- [ ] **Step 7: Tech II in the tab**

`src/components/hustles/industryFinder.ts` (the lab, Tech II ranked beside Tech I, its datacores read live, its original
the Tech I one, the Tech choice kept per browser):

```diff
--- a/src/components/hustles/industryFinder.ts
+++ b/src/components/hustles/industryFinder.ts
@@ -4,9 +4,9 @@
 import { watchedFlow } from '../../lib/flowStore';
 import type { Indexed } from '../../lib/industry';
 import {
-  bpoWhere, finderBlueprints, LIVE_ROWS, othersBook, rankBuilds, type BpoWhere, type Market, type ProductKind, type Row, type RowInput,
+  bpoWhere, finderBlueprints, inventionBlueprints, LIVE_ROWS, othersBook, rankBuilds, type BpoWhere, type LabSite, type Market, type ProductKind, type Row, type RowInput,
 } from '../../lib/industryRank';
-import { JITA_SYSTEM, legFor, siteFacts, type SiteFacts } from '../../lib/industrySites';
+import { JITA_SYSTEM, labFor, legFor, siteFacts, type SiteFacts } from '../../lib/industrySites';
 import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
 import type { IndustrySite } from '../../lib/prefs';
 import type { IndustryChar } from './industryChars';
@@ -19,12 +19,12 @@
  * and materials on live ones (the Loyalty pattern). Reads nothing an earlier state can't use: nothing is ranked until the
  * site, the scan, the indices and the adjusted prices are in, and each says what it's waiting on.
  */
-export type FinderView = { kind: ProductKind | 'all'; canBuild: boolean; bpoUpTo: number | null; sort: 'day' | 'unit' | 'payback'; sitesOpen: boolean | null };
+export type FinderView = { kind: ProductKind | 'all'; tech: 'all' | 't1' | 't2'; canBuild: boolean; bpoUpTo: number | null; sort: 'day' | 'unit' | 'payback'; sitesOpen: boolean | null };
 export const FINDER_KEY = 'jita-ledger:industry-finder';
-const DEFAULT_VIEW: FinderView = { kind: 'all', canBuild: false, bpoUpTo: null, sort: 'day', sitesOpen: null };
+const DEFAULT_VIEW: FinderView = { kind: 'all', tech: 'all', canBuild: false, bpoUpTo: null, sort: 'day', sitesOpen: null };
 const readView = (): FinderView => { try { return { ...DEFAULT_VIEW, ...(JSON.parse(localStorage.getItem(FINDER_KEY) ?? '{}') as Partial<FinderView>) }; } catch { return DEFAULT_VIEW; } };
 
-/** The finder's view, kept per browser: kind, "Can build now", "BPO up to", the sort, and the sites panel open or shut. */
+/** The finder's view, kept per browser: kind, Tech I or II, "Can build now", "BPO up to", the sort, and the sites panel open or shut. */
 export function useFinderView(): [FinderView, (patch: Partial<FinderView>) => void] {
   const [v, setV] = useState(readView);
   return [v, (patch) => setV((x) => { const n = { ...x, ...patch }; try { localStorage.setItem(FINDER_KEY, JSON.stringify(n)); } catch { /* just not kept */ } return n; })];
@@ -32,6 +32,8 @@
 
 export type Finder = {
   site: IndustrySite | null; facts: SiteFacts | null;
+  /** Where research, copying and invention run for the site (labFor), named; null with no site or no Laboratory reachable. */
+  lab: { at: string; site: LabSite } | null;
   /** What it's waiting on, as a sentence; null once rows are ranked. */
   waiting: { text: string; retry?: () => void } | null;
   rows: Row[]; live: boolean;
@@ -50,6 +52,7 @@
   const jitaHigh = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC), [graph]);
   const idx = indices.state === 'ok' ? indices.value : null;
   const facts = useMemo(() => (site ? siteFacts(site, graph, jitaHigh, idx) : null), [site, graph, jitaHigh, idx]);
+  const lab = useMemo(() => (site && facts ? labFor(site, facts, ix.b.stations, graph, idx) : null), [site, facts, ix, graph, idx]);
   const cache = scan.state === 'ok' ? scan.value : null;
   const hasScan = !!cache && Object.keys(cache.stats).length > 0;
   const skills = c.pilot.skills;
@@ -72,13 +75,15 @@
       fees: { broker: c.broker, tax: c.tax, hubBroker: hub ? doc.hubFees[hub.id] ?? null : null },
       legs: { jita: legFor(site, facts, JITA_SYSTEM, doc.freight), home: hub ? legFor(site, facts, hub.systemId, doc.freight) : null },
       noShipsToJita: doc.noShipsToJita, jitaJumps: facts.jitaJumps, mines: c.mines, hubName: hub?.short ?? null, now: Date.now(),
+      lab: lab?.site ?? null,
     };
-  }, [site, facts, cache, hasScan, adjusted, skills, c, ix, doc.assume, doc.share, doc.freight, doc.noShipsToJita, doc.sell, doc.hubFees, hub, prices]);
+  }, [site, facts, lab, cache, hasScan, adjusted, skills, c, ix, doc.assume, doc.share, doc.freight, doc.noShipsToJita, doc.sell, doc.hubFees, hub, prices]);
 
-  const bps = useMemo(() => finderBlueprints(ix), [ix]);
+  // Tech I and, through invention, Tech II: ranked together.
+  const bps = useMemo(() => [...finderBlueprints(ix), ...inventionBlueprints(ix)], [ix]);
   const first = useMemo(() => (input ? rankBuilds(input, bps) : []), [input, bps]);
   // The top rows' products and materials, read live; ranked again on them.
-  const liveTypes = useMemo(() => [...new Set(first.filter((r) => r.day).slice(0, LIVE_ROWS).flatMap((r) => [r.product, ...r.materials.map((m) => m.type)]))], [first]);
+  const liveTypes = useMemo(() => [...new Set(first.filter((r) => r.day).slice(0, LIVE_ROWS).flatMap((r) => [r.product, ...r.materials.map((m) => m.type), ...(r.invention?.datacores.map((d) => d.type) ?? [])]))], [first]);
   const liveBooks = useLiveBooks(liveTypes);
   // The home region's history for the top rows sold at home: their pace and split, where Goonmetrics' weekly movement stood in.
   const homeTypes = useMemo(() => (hub ? first.filter((r) => r.day && r.sale?.place === 'home').slice(0, LIVE_ROWS).map((r) => r.product) : []), [first, hub]);
@@ -95,7 +100,8 @@
   const rows = useMemo(() => (liveInput && live ? rankBuilds(liveInput, bps) : first), [liveInput, live, first, bps]);
 
   const npcRows = npc.status === 'ok' ? npc.rows : null;
-  const bpo = (bp: number) => bpoWhere(npcRows, bp, ix.b.types[bp]?.[4] ?? 0);
+  // A Tech II row's original is the Tech I one its copies are made from.
+  const bpo = (bp: number) => { const o = ix.inventedFrom.get(bp) ?? bp; return bpoWhere(npcRows, o, ix.b.types[o]?.[4] ?? 0); };
 
   const waiting = !site ? { text: 'Pick where you build first: add a site under Where you build, below.' }
     : !skills ? { text: c.isMain ? 'Your skills come with the next sync; the finder works at them.' : `${c.name}’s skills aren’t read yet; the finder works at them.` }
@@ -107,7 +113,7 @@
                 : adjusted.state === 'loading' ? { text: 'Reading CCP’s adjusted prices…' }
                   : adjusted.state === 'failed' ? { text: 'Couldn’t read CCP’s adjusted prices just now, so no job can be costed.', retry: adjusted.retry }
                     : null;
-  return { site, facts, waiting, rows, live, input: liveInput, npc, bpo, scan, hub, home };
+  return { site, facts, lab, waiting, rows, live, input: liveInput, npc, bpo, scan, hub, home };
 }
 
 /** The finder's kinds as the choice lists them. */
```

`src/components/hustles/IndustryBuild.tsx` (the Tech choice, a Tech II row's tag and original, what limits a slot, a
slot's day to a tenth, why there's no payback on a phone too):

```diff
--- a/src/components/hustles/IndustryBuild.tsx
+++ b/src/components/hustles/IndustryBuild.tsx
@@ -3,10 +3,11 @@
 import { ago, iskBig, iskBigSigned, pct, units } from '../../lib/format';
 import { HOME_HUBS } from '../../lib/homeMarket';
 import { navigate, useNow } from '../../lib/hooks';
-import type { Indexed } from '../../lib/industry';
+import { productOf, type Indexed } from '../../lib/industry';
 import { payback, productKind, type BpoWhere, type Row } from '../../lib/industryRank';
 import type { Graph } from '../../lib/jumps';
 import { ASSUME_CHOICES } from '../../lib/prefs';
+import { dayCount } from '../../lib/split';
 import { Points } from '../Facts';
 import { Check, NumChip, Seg, Th } from '../ui';
 import type { IndustryChar } from './industryChars';
@@ -30,7 +31,10 @@
   noAdjusted: () => 'can’t be costed: no adjusted price for a material',
   noMaterials: (one) => `${one ? 'needs' : 'need'} a material nobody lists where it can be bought`,
   noSale: (one) => `${one ? 'has' : 'have'} nowhere ${one ? 'it' : 'they'} may be sold`,
+  noInvention: (one) => `${one ? 'is' : 'are'} Tech II whose invention can’t be costed here`,
 };
+/** What limits one slot's day, as each row says it. */
+const LIMIT_SAID: Record<NonNullable<Row['day']>['limit'], string> = { market: 'the market limits it', slot: 'the slot limits it', invention: 'the lab slot inventing for it limits it' };
 
 const bpoPrice = (w: BpoWhere) => (w.state === 'forge' ? w.price : null);
 const unitProfit = (r: Row) => (r.day && r.day.units > 0 ? r.day.profit / r.day.units : r.sale && r.costUnit != null ? (r.sale.listNet ?? r.sale.bidNet ?? NaN) - r.costUnit : null);
@@ -49,13 +53,14 @@
 
   const priced = useMemo(() => f.rows.filter((r) => r.day), [f.rows]);
   const shown = useMemo(() => {
-    const keep = priced.filter((r) => (view.kind === 'all' || productKind(ix, r.product) === view.kind) && (!view.canBuild || !r.lacking.length)
+    const keep = priced.filter((r) => (view.kind === 'all' || productKind(ix, r.product) === view.kind) && (view.tech === 'all' || (view.tech === 't2') === !!r.invention) && (!view.canBuild || !r.lacking.length)
       && (view.bpoUpTo == null || ((p) => p != null && p <= view.bpoUpTo!)(bpoPrice(f.bpo(r.bp)))));
     const pb = (r: Row) => payback(bpoPrice(f.bpo(r.bp)), r.day?.profit) ?? Infinity;
     return [...keep].sort(view.sort === 'unit' ? (a, b) => (unitProfit(b) ?? -Infinity) - (unitProfit(a) ?? -Infinity)
       : view.sort === 'payback' ? (a, b) => pb(a) - pb(b) : (a, b) => b.day!.profit - a.day!.profit);
   }, [priced, view, ix, f]); // eslint-disable-line react-hooks/exhaustive-deps
   const unpriced = f.rows.length - priced.length;
+  const t2Priced = useMemo(() => priced.filter((r) => r.invention).length, [priced]);
   const why = useMemo(() => {
     const n: Partial<Record<NonNullable<Row['missing']>, number>> = {};
     for (const r of f.rows) if (!r.day && r.missing) n[r.missing] = (n[r.missing] ?? 0) + 1;
@@ -119,7 +124,9 @@
             {FINDER_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
           </select>
         </label>
-        <Check checked={view.canBuild} onChange={(v) => setView({ canBuild: v })} tip={c.isMain ? 'Only what your skills build now.' : `Only what ${c.name}’s skills build now.`}>Can build now</Check>
+        <Seg size="sm" label="Tech" value={view.tech} onChange={(v) => setView({ tech: v })}
+          options={[{ v: 'all', label: 'Tech I and II' }, { v: 't1', label: 'Tech I' }, { v: 't2', label: 'Tech II', tip: 'Costed through invention: a Tech I copy, datacores and the chance at your skills, then built at ME 2 / TE 4. Decryptors and reactions aren’t modelled.' }]} />
+        <Check checked={view.canBuild} onChange={(v) => setView({ canBuild: v })} tip={c.isMain ? 'Only what your skills build now (for Tech II, invent and copy too).' : `Only what ${c.name}’s skills build now (for Tech II, invent and copy too).`}>Can build now</Check>
         <NumChip label="BPO up to" width={90} value={view.bpoUpTo} onChange={(n) => setView({ bpoUpTo: n })} placeholder="no cap" tip="The most you’d pay NPCs for an original. Blank: no cap. An original NPCs don’t sell in The Forge has no price, so a cap leaves it out." />
         <Seg size="sm" label="Sort" value={view.sort} onChange={(v) => setView({ sort: v })}
           options={[{ v: 'day', label: 'Profit a day' }, { v: 'unit', label: 'Profit a unit' }, { v: 'payback', label: 'Payback' }]} />
@@ -138,6 +145,7 @@
             {units(shown.length)} of {units(priced.length)} priced at {f.site?.name}{f.live ? '; the top rows on Jita’s books now, the rest on this morning’s' : ', on this morning’s Jita books'}.
             {unpriced > 0 && ` ${units(unpriced)} aren’t priced: ${why}.`}
             {keptHome > 0 && doc.noShipsToJita && ` ${units(keptHome)} ${keptHome === 1 ? 'ship stays' : 'ships stay'} home: never haul ships to Jita is on.`}
+            {t2Priced > 0 && ` ${units(t2Priced)} of those priced are Tech II, invented at ${f.lab?.at ?? 'a Laboratory'}; decryptors and reactions aren’t modelled.`}
           </p>
           <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
             <table className="tbl compact rd-table ind-finder">
@@ -146,9 +154,9 @@
                   <Th left className="ind-c-name">Product</Th>
                   <Th left className="rd-wide ind-c-bpo" tip="NPCs’ price for the original in The Forge this morning, and where; or why there isn’t one.">BPO</Th>
                   <Th className="rd-wide" tip="What one unit makes after its materials, the job, fees and freight, on the better side it sells on.">Profit a unit</Th>
-                  <Th className="rd-wide" tip="A day’s job: what one factory slot makes, and what the market takes at your industry share, and which of the two limits it.">One slot a day</Th>
+                  <Th className="rd-wide" tip={'A day’s job: what one factory slot makes, and what the market takes at your industry share, and which limits it.\n\n• Tech II: one lab slot invents for the factory slot, and makes it no more a day than it invents for.'}>One slot a day</Th>
                   <Th className="ind-c-day" tip={`What one factory slot earns a day.${before ? `\n\n• Before ${before}: not typed. Each row says what each 1% costs a day.` : ''}`}>{headSaid}</Th>
-                  <Th className="rd-wide" tip="Days for one slot’s profit to pay for the original at NPCs’ price.">Payback</Th>
+                  <Th className="rd-wide" tip="Days for one slot’s profit to pay for the original at NPCs’ price (Tech II: the Tech I original its copies are made from).">Payback</Th>
                   <Th className="rd-wide" tip="Skills the blueprint asks for that aren’t trained to its level.">Skills</Th>
                 </tr>
               </thead>
@@ -160,6 +168,10 @@
                   const name = ix.b.types[r.product]?.[0] ?? `Item #${r.product}`;
                   const tax = [r.taxPerPct != null && `each 1% of tax: ${iskBig(r.taxPerPct)} a day`, r.brokerPerPct != null && `each 1% of broker fee at ${f.hub?.short}: ${iskBig(r.brokerPerPct)} a day`].filter(Boolean).join(' · ') || null;
                   const book = !r.sale || !f.input ? null : r.sale.place === 'home' ? `sold at ${f.hub?.short}, Goonmetrics’ prices` : f.input.market(r.product).jita?.live ? 'Jita’s book now' : 'this morning’s book';
+                  // Tech II: what it's invented from, and its original is the Tech I one to copy from.
+                  const t1 = r.invention ? productOf(ix.bp.get(r.invention.from)!)?.type : null;
+                  const tech = t1 != null ? `Tech II from ${ix.b.types[t1]?.[0] ?? `Item #${t1}`}` : null;
+                  const bn = r.invention ? `${b.n}; the Tech I original, to copy from` : b.n;
                   return (
                     <Fragment key={r.bp}>
                       <tr className={open === r.bp ? 'open' : undefined} data-bp={r.bp}>
@@ -167,18 +179,18 @@
                           <button type="button" className="expander" aria-expanded={open === r.bp} onClick={() => toggle(r.bp)}>
                             <ChevronRight className="chev" aria-hidden="true" /><span className="nm">{name}</span>
                           </button>
-                          <span className="sub">{KIND_LABEL[productKind(ix, r.product)]}{book ? ` · ${book}` : ''}</span>
+                          <span className="sub">{KIND_LABEL[productKind(ix, r.product)]}{tech ? ` · ${tech}` : ''}{book ? ` · ${book}` : ''}</span>
                           <span className="rd-phone">
-                            <span>BPO: {b.v} {b.n}</span>
+                            <span>BPO: {b.v} {bn}</span>
                             <span>Profit a unit: {iskBigSigned(up)}</span>
-                            <span>One slot: {units(r.day!.units)} of {units(r.makes)} a day, the {r.day!.limit === 'market' ? 'market' : 'slot'} limits it</span>
+                            <span>One slot: {dayCount(r.day!.units)} of {dayCount(r.makes)} a day, {LIMIT_SAID[r.day!.limit]}</span>
                             {tax && <span>{tax}</span>}
-                            <span>Payback: {pb != null ? `${pb.toFixed(1)} days` : '–'}</span>
+                            <span>Payback: {pb != null ? `${pb.toFixed(1)} days` : `–, ${bpoPrice(w) == null ? 'no NPC price' : 'never, at a loss'}`}</span>
                           </span>
                         </td>
-                        <td className="l rd-wide"><span>{b.v}</span><span className="sub">{b.n}</span></td>
+                        <td className="l rd-wide"><span>{b.v}</span><span className="sub">{bn}</span></td>
                         <td className="rd-wide">{iskBigSigned(up)}</td>
-                        <td className="rd-wide">{units(r.day!.units)} / {units(r.makes)}<span className="sub">the {r.day!.limit === 'market' ? 'market' : 'slot'} limits it</span></td>
+                        <td className="rd-wide">{dayCount(r.day!.units)} / {dayCount(r.makes)}<span className="sub">{LIMIT_SAID[r.day!.limit]}</span></td>
                         <td>{iskBigSigned(r.day!.profit)}{tax && <span className="sub">{tax}</span>}</td>
                         <td className="rd-wide">{pb != null ? `${pb.toFixed(1)} days` : '–'}<span className="sub">{pb != null ? '' : bpoPrice(w) == null ? 'no NPC price' : 'never, at a loss'}</span></td>
                         <td className="rd-wide">{r.lacking.length ? `${r.lacking.length} to train` : 'trained'}</td>
@@ -192,7 +204,7 @@
               </tbody>
             </table>
           </div>
-          {!shown.length && <p className="note small" style={{ margin: 0 }}>Nothing priced fits these choices: widen the kind, untick Can build now, or raise BPO up to.</p>}
+          {!shown.length && <p className="note small" style={{ margin: 0 }}>Nothing priced fits these choices: widen the kind or Tech, untick Can build now, or raise BPO up to.</p>}
           {shown.length > SHOWN + more && <button type="button" className="link-btn" onClick={() => setMore(more + SHOWN)}>Show {Math.min(SHOWN, shown.length - SHOWN - more)} more</button>}
         </div>
       )}
```

`src/components/hustles/IndustryDetail.tsx` (the lab from `finder.lab`, datacores held anywhere, the invention tiles, no
level table for Tech II, its steps):

```diff
--- a/src/components/hustles/IndustryDetail.tsx
+++ b/src/components/hustles/IndustryDetail.tsx
@@ -5,21 +5,21 @@
 import { isk, iskBig, iskBigSigned, pct, units } from '../../lib/format';
 import { heldCost } from '../../lib/heldCost';
 import { navigate } from '../../lib/hooks';
-import { DAY_S, KIND_SAID, NPC_FACILITY_TAX, secBand, SKILL, structureBonus, rigFor, type Indexed } from '../../lib/industry';
-import { bestOreFor, meLevels, payback, shoppingList, startUp, type Held, type LabSite, type Row } from '../../lib/industryRank';
-import { JITA_SYSTEM, nearestLab } from '../../lib/industrySites';
+import { DAY_S, KIND_SAID, SKILL, structureBonus, rigFor, type Indexed } from '../../lib/industry';
+import { bestOreFor, meLevels, payback, shoppingList, startUp, T2_ME, T2_TE, type Held, type Row } from '../../lib/industryRank';
+import { JITA_SYSTEM } from '../../lib/industrySites';
 import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
 import { setDestination } from '../../lib/market';
 import { oreBaseIds } from '../../lib/orePricing';
 import { yieldOf, type Materials } from '../../lib/reprocess';
-import { SPLIT_SAID } from '../../lib/split';
+import { dayCount, SPLIT_SAID } from '../../lib/split';
 import { toast } from '../../lib/toast';
 import { typeInfo } from '../../lib/universe';
 import { copyMultibuy, copyPrice } from '../common';
 import { Tiles } from '../ui';
 import type { IndustryChar } from './industryChars';
 import { bpoSaid, type Finder } from './industryFinder';
-import { NPC_REGIONS, regionSellers, useIndices, useStationNames, type RegionSeller } from './industryMarket';
+import { NPC_REGIONS, regionSellers, useStationNames, type RegionSeller } from './industryMarket';
 
 /**
  * A finder row's detail (docs/notes/industry.md): every material with its sources, the job's time and cost broken down,
@@ -32,35 +32,32 @@
 export function IndustryDetail({ c, ix, graph, row, finder, mainName }: { c: IndustryChar; ix: Indexed; graph: Graph; row: Row; finder: Finder; mainName: string }) {
   const input = finder.input!;
   const site = finder.site!, facts = finder.facts!;
-  const indices = useIndices();
-  const idx = indices.state === 'ok' ? indices.value : null;
   const name = (id: number) => ix.b.types[id]?.[0] ?? `Item #${id}`;
   const jitaAny = useMemo(() => jumpsFrom(graph, JITA_SYSTEM), [graph]);
   const jitaHigh = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, s) => s >= HIGH_SEC), [graph]);
   const fromSite = useMemo(() => jumpsFrom(graph, site.systemId), [graph, site.systemId]);
 
-  // What's held where the site is: the builder's loose stock there, at what its own latest buys cost it.
+  // What's held where the site is: the builder's loose stock there, at what its own latest buys cost it. A Tech II row's
+  // datacores count wherever they're held: an R&D agent's sit at its station, and the builder carries them to the lab.
   const loc = site.stationId ?? site.structureId ?? null;
   const here = loc != null ? c.stock?.byLocation[loc] ?? {} : {};
+  const inv = row.invention;
+  const cores = new Set(inv?.datacores.map((d) => d.type) ?? []);
+  const anywhere = (t: number) => Object.values(c.stock?.byLocation ?? {}).reduce((a, x) => a + (x[t] ?? 0), 0);
   const held: Held = {
-    units: (t) => here[t] ?? 0,
+    units: (t) => (cores.has(t) ? anywhere(t) : here[t] ?? 0),
     cost: (t, n) => heldCost(c.buys.filter((b) => b.typeId === t), n, new Set(), c.broker),
   };
 
-  // Research runs at the site when it has a Laboratory, else at the nearest one.
-  const lab = useMemo((): { at: string; site: LabSite } | null => {
-    if (facts.canScience) return { at: site.name, site: { kind: site.kind, rigs: site.rigs, band: facts.band, tax: facts.tax, index: facts.index } };
-    const n = nearestLab(ix.b.stations, graph, site.systemId);
-    if (!n) return null;
-    const sys = graph[n.systemId];
-    return { at: `the nearest Laboratory, in ${sys?.[1] ?? `system ${n.systemId}`} (${n.jumps} jump${n.jumps === 1 ? '' : 's'})`, site: { kind: 'npc', rigs: [], band: secBand(sys?.[0] ?? 0), tax: NPC_FACILITY_TAX, index: idx?.[n.systemId] ?? null } };
-  }, [facts, site, ix, graph, idx]);
+  // Research runs at the site when it has a Laboratory, else at the nearest one (labFor, as Tech II's invention). A Tech II
+  // copy can't be researched: no level table for it.
+  const lab = finder.lab;
   const bpRow = ix.bp.get(row.bp)!;
-  const levels = useMemo(() => (lab ? meLevels({ ...input, bp: bpRow }, lab.site) : null), [input, bpRow, lab]);
+  const levels = useMemo(() => (lab && !inv ? meLevels({ ...input, bp: bpRow }, lab.site) : null), [input, bpRow, lab, inv]);
   const assumed = levels?.find((l) => l.me === input.me && l.te === input.te) ?? null;
   const w = finder.bpo(row.bp);
   const bpo = w.state === 'forge' ? w.price : null;
-  const su = startUp(row, { bpo, research: assumed?.cost ?? null, held });
+  const su = startUp(row, { bpo, research: inv ? 0 : assumed?.cost ?? null, held });
   const shop = shoppingList(row, held);
   const jitaLines = shop.filter((x) => x.source === 'jita');
   const stations = useStationNames(w.state === 'forge' ? w.stations : []);
@@ -104,7 +101,7 @@
   return (
     <div className="col ind-detail" style={{ gap: 14 }} data-industry="detail">
       <div className="col" style={{ gap: 6 }}>
-        <span className="lbl">Materials for a day’s {units(row.runs)} runs at ME {input.me}</span>
+        <span className="lbl">Materials for a day’s {units(row.runs)} run{row.runs === 1 ? '' : 's'} at ME {inv ? T2_ME : input.me}</span>
         <div className="tbl-scroll">
           <table className="tbl compact rd-table">
             <thead><tr><th className="l">Material</th><th>A day</th><th className="l rd-wide">Each source, delivered</th><th className="l rd-wide">Picked</th><th className="rd-wide">Held here</th></tr></thead>
@@ -138,7 +135,7 @@
       </div>
 
       <Tiles min={180} items={[
-        { l: 'A run', v: time(row.time), n: `${units(row.runs)} runs a day, ${units(row.makes)} made · ${KIND_SAID[site.kind]}${sb.time < 1 ? ` ×${sb.time}` : ''}${rig.time < 1 ? `, rigs ×${rig.time.toFixed(3)}` : ''}` },
+        { l: 'A run', v: time(row.time), n: `${units(row.runs)} run${row.runs === 1 ? '' : 's'} a job, ${dayCount(row.makes)} made a day · ${KIND_SAID[site.kind]}${sb.time < 1 ? ` ×${sb.time}` : ''}${rig.time < 1 ? `, rigs ×${rig.time.toFixed(3)}` : ''}` },
         {
           l: 'The job', v: job ? iskBig(job.total) : '–',
           n: job ? `index ${pct(input.site.index!.manufacturing)} → ${iskBig(job.index)}${job.bonus ? `, bonuses ${iskBigSigned(job.bonus)}` : ''} · facility tax ${job.tax != null ? iskBig(job.tax) : '–: not typed'} · SCC ${iskBig(job.scc)} · ${job.alpha == null ? 'Clone state not read: the 0.25% Alpha tax is left out' : job.alpha ? `Alpha tax ${iskBig(job.alpha)}` : 'no Alpha tax'}` : 'not costed',
@@ -148,9 +145,35 @@
           l: s.place === 'home' ? `The sale at ${input.hubName}` : 'The sale in Jita', v: s.list != null ? iskBig(s.list) : '–',
           n: s.why ?? `nets ${iskBig(s.listNet)} listed${s.brokerKnown ? '' : ' (before the broker fee: not typed)'}, ${iskBig(s.bidNet)} into the best bid · ${units(s.pace)} a day, ${pct(s.split, 0)} buyers taking listings (${s.paceFrom === 'goonmetrics' ? 'Goonmetrics’ weekly movement ÷ 7, at an even split, until the home history is read' : SPLIT_SAID[s.splitFrom as Exclude<typeof s.splitFrom, 'goonmetrics'>]})${s.place === 'home' ? ` · Goonmetrics: ${((w) => (w != null ? units(w) : '–'))(input.market(row.product).home?.weekly)} a week` : ''}${s.freight ? ` · freight ${isk(s.freight)} a unit` : ''}`,
         }) : { l: 'The sale', v: '–', n: 'not sold anywhere you said' }),
-        { l: 'Profit a day, one slot', v: iskBigSigned(row.day?.profit), n: row.taxPerPct != null ? `before the facility tax; each 1% costs ${iskBig(row.taxPerPct)} a day` : row.day ? `${units(row.day.units)} sold of ${units(row.makes)} made` : '' },
+        { l: 'Profit a day, one slot', v: iskBigSigned(row.day?.profit), n: row.taxPerPct != null ? `before the facility tax; each 1% costs ${iskBig(row.taxPerPct)} a day` : row.day ? `${dayCount(row.day.units)} sold of ${dayCount(row.makes)} made` : '' },
       ]} />
 
+      {inv && (
+        <div className="col" style={{ gap: 6 }} data-industry="invention">
+          <span className="lbl">Invention, at {lab?.at ?? 'no Laboratory'}</span>
+          <Tiles min={180} items={[
+            {
+              l: 'Chance', v: pct(inv.chance, 1),
+              n: `${[...inv.sciences, ...(inv.encryption ? [inv.encryption] : [])].map((x) => `${name(x.id)} ${x.level}`).join(', ')} · ${inv.attempts.toFixed(2)} attempts a copy of ${units(inv.runsPerCopy)} run${inv.runsPerCopy === 1 ? '' : 's'}, at ME ${T2_ME} / TE ${T2_TE}`,
+              tip: 'Invention’s chance: the base × (1 + both sciences’ levels ÷ 30 + the encryption skill’s ÷ 40) (EVE University).\n\n• Each attempt takes a run of a Tech I copy and its datacores, success or not.\n• Decryptors, which change the chance, runs, ME and TE, aren’t modelled.',
+            },
+            {
+              l: 'Datacores a copy', v: iskBig(inv.datacoreCost),
+              n: `${inv.perAttempt.map((d) => `${units(d.qty)} ${name(d.type)}`).join(' and ')} an attempt${inv.datacores.some((d) => d.price == null) ? ': one isn’t listed where it can be bought' : ''} · held anywhere count in start-up`,
+            },
+            {
+              l: 'Jobs a copy', v: inv.job && inv.copy ? iskBig(inv.job.total + inv.copy.total) : '–',
+              n: inv.job && inv.copy ? `invention ${iskBig(inv.job.total)}, its Tech I copies ${iskBig(inv.copy.total)}${inv.job.tax == null ? ' · the lab’s tax not typed: left out' : ''}` : inv.why ?? 'not costed',
+            },
+            {
+              l: 'A unit', v: inv.perUnit != null ? iskBig(inv.perUnit) : '–',
+              n: inv.perUnit != null ? `${units(inv.unitsPerCopy)} unit${inv.unitsPerCopy === 1 ? '' : 's'} a copy · one lab slot invents for ${dayCount(inv.labPerDay)} a day${row.day?.limit === 'invention' ? ', which limits the slot' : ''}` : inv.why ?? 'not costed',
+            },
+          ]} />
+          <p className="note small" style={{ margin: 0 }}>A Tech II copy can’t be researched: it builds at ME {T2_ME} / TE {T2_TE}, as invented. Decryptors aren’t modelled, nor are reactions: what they make is bought.</p>
+        </div>
+      )}
+
       {levels && (
         <div className="col" style={{ gap: 6 }}>
           <span className="lbl">Researching it first, at {lab!.at}</span>
@@ -172,10 +195,10 @@
           <p className="note small" style={{ margin: 0 }}>At {c.isMain ? 'your' : `${c.name}’s`} skills: Metallurgy {c.pilot.skills?.[SKILL.metallurgy] ?? 0}, Research {c.pilot.skills?.[SKILL.research] ?? 0}, Advanced Industry {c.pilot.skills?.[SKILL.advancedIndustry] ?? 0}. ME 8 takes about 18% of ME 10’s time.</p>
         </div>
       )}
-      {!lab && <p className="note small" style={{ margin: 0 }}>No Laboratory can be reached on the map from {site.name}, so research isn’t worked out.</p>}
+      {!lab && <p className="note small" style={{ margin: 0 }}>No Laboratory can be reached on the map from {site.name}, so {inv ? 'invention' : 'research'} isn’t worked out.</p>}
 
       <div className="col" style={{ gap: 6 }} data-industry="bpo-places">
-        <span className="lbl">The original</span>
+        <span className="lbl">{inv ? 'The Tech I original, to copy from' : 'The original'}</span>
         <p style={{ margin: 0 }}>{b.v !== '–' ? `${b.v} ${b.n}` : b.n}.</p>
         {w.state === 'forge' && w.stations.map((s) => {
           const sys = graph[findSystem(ix, s) ?? 0];
@@ -198,9 +221,9 @@
       </div>
 
       <Tiles min={180} items={[
-        { l: 'Start-up', v: iskBig(su.total), n: su.total == null ? (bpo == null ? 'no NPC price for the original' : su.research == null ? 'research not worked out' : 'a material can’t be priced') : `original ${iskBig(su.bpo)} · research to ME ${input.me} / TE ${input.te} ${su.research ? iskBig(su.research) : 'none'} · a day’s materials ${iskBig(su.materials)}` },
+        { l: 'Start-up', v: iskBig(su.total), n: su.total == null ? (bpo == null ? 'no NPC price for the original' : su.research == null ? 'research not worked out' : 'a material can’t be priced') : inv ? `the Tech I original ${iskBig(su.bpo)} · a day’s materials and datacores ${iskBig(su.materials)}` : `original ${iskBig(su.bpo)} · research to ME ${input.me} / TE ${input.te} ${su.research ? iskBig(su.research) : 'none'} · a day’s materials ${iskBig(su.materials)}` },
         { l: 'Held here', v: units(su.heldUnits), n: su.heldUnits ? `cost you ${su.heldCost != null ? iskBig(su.heldCost) : '– (not all bought: no cost)'}; counted in start-up and the list, never in the profit a day` : loc == null ? 'nothing known at a home typed by you' : 'none of its materials held here' },
-        { l: 'Payback', v: payback(bpo, row.day?.profit) != null ? `${payback(bpo, row.day?.profit)!.toFixed(1)} days` : '–', n: 'the original at NPCs’ price, out of one slot’s profit a day' },
+        { l: 'Payback', v: payback(bpo, row.day?.profit) != null ? `${payback(bpo, row.day?.profit)!.toFixed(1)} days` : '–', n: `${inv ? 'the Tech I original' : 'the original'} at NPCs’ price, out of one slot’s profit a day` },
       ]} />
 
       <div className="col" style={{ gap: 6 }}>
@@ -218,10 +241,13 @@
         <span className="lbl">The steps</span>
         <div className="ladder">
           {[
-            w.state === 'forge' ? `Buy the original at ${station(w.stations[0])}` : 'Find an original: no NPC sells it in The Forge',
-            input.me || input.te ? `Research it to ME ${input.me} / TE ${input.te} at ${lab?.at ?? 'a Laboratory'}${assumed?.days ? `, ${assumed.days.toFixed(1)} days` : ''}` : 'No research: build at ME 0',
+            w.state === 'forge' ? `Buy the ${inv ? 'Tech I ' : ''}original at ${station(w.stations[0])}` : `Find ${inv ? 'a Tech I' : 'an'} original: no NPC sells it in The Forge`,
+            ...(inv ? [
+              `Copy it at ${lab?.at ?? 'a Laboratory'}: ${inv.attempts.toFixed(1)} one-run copies a success`,
+              `Invent at ${lab?.at ?? 'a Laboratory'}: ${pct(inv.chance, 0)} a try, with its datacores`,
+            ] : [input.me || input.te ? `Research it to ME ${input.me} / TE ${input.te} at ${lab?.at ?? 'a Laboratory'}${assumed?.days ? `, ${assumed.days.toFixed(1)} days` : ''}` : 'No research: build at ME 0']),
             'Buy the materials',
-            `Install the job at ${site.name}`,
+            `Install the job at ${site.name}${inv ? ` at ME ${T2_ME}` : ''}`,
             sale ? `List at ${sale.place === 'home' ? input.hubName ?? 'home' : 'Jita 4-4'}${listPrice != null ? ` at ${isk(listPrice)}` : ''}` : 'Nowhere you said it may be sold',
           ].map((x, i) => <span key={x} className="step">{i > 0 && <ArrowRight aria-hidden="true" />}<span>{x}</span></span>)}
         </div>
```

`src/components/hustles/IndustryStart.tsx` (rung 6 says what Tech II pays):

```diff
--- a/src/components/hustles/IndustryStart.tsx
+++ b/src/components/hustles/IndustryStart.tsx
@@ -116,18 +116,17 @@
   if (k === 'copy') return <p className="note small" style={{ margin: 0 }}>Copies sell on contracts, which this tab doesn’t read yet: the finder prices what you build from them.</p>;
   if (k === 'home') return <p className="note small" style={{ margin: 0 }}>{structure ? `${structure}: its tax, rigs and broker fee are what you typed under Build’s Where you build.` : 'A structure’s tax, rigs and broker fee aren’t known until you dock: add your home under Build’s Where you build, and type them.'}</p>;
   if (k === 'capital') return <p className="note small" style={{ margin: 0 }}>Capitals sell on contracts, not the market, so the finder doesn’t price them.</p>;
-  if (k === 't2') return null;
   if (!sk) return null;
   if (f.waiting) return <p className="note small" style={{ margin: 0 }} data-pays="waiting">{f.waiting.text}</p>;
   if (!f.input || !f.rows.length) return <p className="note small" style={{ margin: 0 }} data-pays="working">Working out what pays…</p>;
   const at = f.site?.name ?? 'your build site';
   const opened = rowsOpened(ix, f.rows, k, sk, c.clone);
-  if (k === 'npc') {
+  if (k === 'npc' || k === 't2') {
     const pays = paying(opened);
     if (!pays.length) return <p className="note small" style={{ margin: 0 }} data-pays="none">Nothing it opens makes a profit at {at} today.</p>;
     return (
       <div className="col ind-pays" data-pays="rows">
-        <span className="note small">Pays now at {at}, one slot a day, at ME {f.input.me} / TE {f.input.te}:</span>
+        <span className="note small">{k === 't2' ? `Pays now at ${at}, one slot a day, invented at ${f.lab?.at ?? 'a Laboratory'} at ${c.isMain ? 'your' : `${c.name}’s`} sciences:` : `Pays now at ${at}, one slot a day, at ME ${f.input.me} / TE ${f.input.te}:`}</span>
         {pays.slice(0, 3).map((r) => <div key={r.bp} className="ind-pay"><span>{name(r.product)}</span><b>{iskBigSigned(r.day!.profit)}</b></div>)}
       </div>
     );
```

Run: `npm run build`
Expected: passes (`tsc -p worker` too: the Worker imports industryRank's types).

- [ ] **Step 8: The page case: Tech II**

Insert above `// --- the end of the industry case` (after Task 7's block). It adds the pump II, its four materials and two
datacores at EVE Ref's prices of 9 October 2026 to the scan and the live books, and asserts the row (its tag, the Tech I
original to copy from, the count line's Tech II and where it's invented), the Tech choice, the detail (the invention tiles,
no level table, the steps, the datacores on the shopping list), that at Itamo's station it loses and says it never pays
back, and rung 6's pays once the pump II sells higher and the main has Armor Rigging III:

```js
    // --- Tech II (Task 8): the Large Trimark Armor Pump II through invention, at EVE Ref's prices of 9 October 2026 (its
    // four materials and two datacores), built at Itamo's station and invented at the nearest Laboratory, Sobaseki's.
    Object.assign(ITEMS, {
      26302: [st5(26302, 332, Array(14).fill(65_300_000)), bk5(61_550_000, 65_270_000)],
      ...Object.fromEntries(Object.entries({ 25624: 1_656_000, 25609: 1_675_000, 11475: 648.3, 25620: 18_830, 20171: 93_970, 20416: 99_830 })
        .map(([t, p]) => [t, [st5(Number(t), 5000, Array(14).fill(p * 1.05)), bk5(p * 0.95, p)]])),
    });
    for (const [t, [s, b]] of Object.entries(ITEMS)) { SCAN.stats[t] = s; SCAN.books[t] = b; }
    await page.goto(SEED_PAGE);
    await seed({ ...ledger, industry: DOC, cloud: CLOUD_STATE }, { alts: altStore, cache: { prospects: SCAN } });
    await page.goto(`${BASE}#hustles/industry/build`);
    await page.reload();
    await page.waitForSelector('[data-industry="finder"] [data-bp="26303"]', { timeout: 30_000 }).catch(async () => problems.push(`the finder never priced the Tech II pump: “${(await text('[data-industry="build"]')).slice(0, 300)}”`));
    await page.waitForTimeout(1200);
    const t2 = await text('[data-bp="26303"]');
    for (const t of ['Large Trimark Armor Pump II', 'Tech II from Large Trimark Armor Pump I', '1.25 M ISK', 'the Tech I original, to copy from'])
      if (!t2.includes(t)) problems.push(`the Tech II pump’s row doesn’t say “${t}”: “${t2.slice(0, 240)}”`);
    if (!/\d+ of those priced (is|are) Tech II, invented at the nearest Laboratory, in Sobaseki \(\d+ jumps?\); decryptors and reactions aren’t modelled\./.test(await text('[data-industry="finder-count"]'))) problems.push(`the count doesn’t say how many are Tech II and where they’re invented: “${await text('[data-industry="finder-count"]')}”`);
    await page.locator('[aria-label="Tech"] button', { hasText: /^Tech II$/ }).click();
    await page.waitForTimeout(600);
    if (await page.locator('[data-bp="25895"]').count() || !(await page.locator('[data-bp="26303"]').count())) problems.push('Tech II alone still shows Tech I rows, or not the Tech II pump');
    await page.locator('[aria-label="Tech"] button', { hasText: /^Tech I$/ }).click();
    await page.waitForTimeout(600);
    if (await page.locator('[data-bp="26303"]').count()) problems.push('Tech I alone still shows the Tech II pump');
    await page.locator('[aria-label="Tech"] button', { hasText: 'Tech I and II' }).click();
    await page.waitForTimeout(600);
    await page.locator('[data-bp="26303"] .expander').click();
    await page.waitForTimeout(1000);
    const inv = await text('[data-industry="detail"]');
    for (const t of ['Invention, at the nearest Laboratory, in Sobaseki', 'attempts a copy of 1 run, at ME 2 / TE 4', '3 Datacore - Nanite Engineering and 3 Datacore - Hydromagnetic Physics an attempt',
      'one lab slot invents for', 'A Tech II copy can’t be researched: it builds at ME 2 / TE 4, as invented. Decryptors aren’t modelled', 'Materials for a day’s 1 run at ME 2',
      'The Tech I original, to copy from', 'Copy it at the nearest Laboratory', 'Invent at the nearest Laboratory', 'Install the job at Station 60001483 at ME 2'])
      if (!inv.toLowerCase().includes(t.toLowerCase())) problems.push(`the Tech II pump’s detail doesn’t say “${t}”`);
    if (await page.locator('[data-industry="detail"] [data-industry="me-levels"]').count()) problems.push('the Tech II pump’s detail offers to research it');
    const shop = await text('[data-industry="detail"]');
    if (!/Datacore - Hydromagnetic Physics\s+Jita, 93,970/.test(shop)) problems.push('the Tech II pump’s shopping list doesn’t buy its datacores');
    if (SHOTS) { await page.locator('[data-industry="invention"]').scrollIntoViewIfNeeded().catch(() => undefined); await page.screenshot({ path: `${SHOTS}-industry-t2.png` }); }
    const t2Fit = await sideways(page, '[data-industry="finder"] .tbl-scroll');
    if (!PHONE && t2Fit && t2Fit.over > 0) problems.push(`the finder with a Tech II row open scrolls sideways at 1,440 (${t2Fit.over} px)`);
    if (!(await text('[data-bp="26303"]')).includes('never, at a loss')) problems.push('the Tech II pump, losing at Itamo, doesn’t say it never pays back');
    // Rung 6 pays from Tech II rows once the main could build the pump II (Armor Rigging III) and the pump II sold higher
    // (70.27 M ISK: at EVE Ref's 65.27 M it loses at Itamo's station, above).
    ITEMS[26302] = [st5(26302, 332, Array(14).fill(70_300_000)), bk5(66_000_000, 70_270_000)];
    SCAN.stats[26302] = ITEMS[26302][0]; SCAN.books[26302] = ITEMS[26302][1];
    await ladderOf({ ...ledger, skills: { ...ledger.skills, 26253: 3 } });
    await page.waitForSelector('[data-rung="t2"] [data-pays="rows"]', { timeout: 30_000 }).catch(async () => problems.push(`rung 6 never said what Tech II pays: “${(await rung('t2')).slice(0, 300)}”`));
    if (!(await says('t2', 'Pays now at Station 60001483, one slot a day, invented at the nearest Laboratory, in Sobaseki')) || !(await says('t2', 'Large Trimark Armor Pump II'))) problems.push('rung 6 doesn’t say what the Tech II pump pays');
```

Run: `LEDGER=industry PAGE=hustles/industry npm run check-pages`, again with `PHONE=1`, then
`PAGE=hustles/industry,hustles/industry/build npm run check-pages`.
Expected: all pass.

Plant, run, see it fail, undo:
- `useFinder`'s `bps` without `inventionBlueprints`: "the finder never priced the Tech II pump".
- `IndustryDetail`: `levels` computed for Tech II too (`lab ? meLevels(…)`): "the Tech II pump's detail offers to research it".
- `IndustryBuild`'s `shown` without the Tech filter: "Tech I alone still shows the Tech II pump".

- [ ] **Step 9: A look in a browser**

Run the case with `SHOTS=.playwright-mcp/industry/8` at both widths and look at `-industry-t2.png`: the pump II's row
with its "Tech II from Large Trimark Armor Pump I" tag, the Tech I original's price "to copy from", its detail's four
invention tiles (chance 34.0% at no sciences, 2.94 attempts a one-run copy, datacores and jobs a copy, a unit, what one lab
slot invents for), the note that a Tech II copy can't be researched, and the steps (copy, invent, build at ME 2). On a
phone the tiles stack and the row's folded lines say the payback's reason. Then `npm run dev` on the real store with the
cloud's first scan after this push: Tech II rows among the finder's, a few hundred priced.

- [ ] **Step 10: The notes**

In `docs/notes/industry.md`, Task 1's bundle bullet's "`industryTypes.json` (the cloud's watch set, 1,858 types, …" and
Task 5A's watch-set bullet's "1,858 types in stage 1: every Tech I product and its materials" each become "2,916 types:
every Tech I and Tech II product, their materials and the datacores (1,858 before Tech II)". Then append:

```markdown
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
  - **A slot's day under one unit reads to a tenth** (`dayCount`), never "0".
  - The watch set grew to 2,916 (Tech II products, their materials, the datacores): the morning scan reads them watch-only,
    Goonmetrics 59 calls a hub.
  - **Rung 6's "pays now"** is the Tech II rows the character could build with the item's own sciences and encryption skill
    (the rung's), at its sciences' chance now.
```

Append to `docs/notes/limits.md`:

```markdown
- **Tech II's invention cost is EVE Ref's formula checked on a one-run rig copy.** For a ten-run module copy the job is
  taken, as the spec reads it, on one run's EIV an attempt; that case hasn't been checked against a real job. Decryptors
  and reactions aren't modelled, and each Tech II row assumes one lab slot inventing for its one factory slot.
```

- [ ] **Step 11: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add scripts/industry-bundle.mjs src/data/industryTypes.json src/lib/industryRank.ts src/lib/industrySites.ts src/lib/industryLadder.ts \
  src/components/hustles/industryFinder.ts src/components/hustles/IndustryBuild.tsx src/components/hustles/IndustryDetail.tsx \
  src/components/hustles/IndustryStart.tsx scripts/check.mjs scripts/pages.mjs docs/notes/industry.md docs/notes/limits.md
git commit -m "$(cat <<'MSG'
Industry: Tech II through invention, ranked beside Tech I

What was missing: the spec's last stage-1 task. Tech II originals aren't sold any more; the research worked the pump II out
by hand (EVE Ref's industry API) and found it pays less than its Tech I for a beginner, which the finder should be able to
say for every item.

What it does: the 1,012 invention products (no capital hull) are costed through invention: the chance at the builder's
skills, 1 / chance attempts, each a one-run Tech I copy and its datacores at the lab, then built at ME 2 / TE 4. The lab is
the site's own or the nearest Laboratory (labFor, which the detail's research now shares). A Tech II row makes no more a
day than one lab slot invents for, and says when that binds; its original is the Tech I one to copy from; its detail shows
the invention and has no research table. The cloud's watch set adds Tech II products, their materials and the datacores.

Evidence: EVE Ref's pump II to the ISK at its own prices (materials, the job, datacores, invention jobs; copies within 1 ISK);
the chance at unequal levels, which catches a science taken for the encryption skill where III/III/III can't; the Cerberus,
which the lab binds; the page case at both widths. Encryption not found, the lab cap removed, copies left out, start-up
without datacores and rung 6 without the item's own sciences each failed it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
MSG
)"
```

---

## After Task 8: shipping stage 1

Each task is ship-safe alone, so each may go out as it's done (CLAUDE.md: a branch, `--ff-only` merge to `main`, delete
the branch both sides, `npm run deployed` until it says "Shipped." before the next change). Once the last is live:

- [ ] **The cloud's first morning scan after Task 5A** (11:25 EVE): `npx wrangler tail jita-ledger-cloud` shows the run's
  `watchOnly` count (2,916 types read for the tab once Task 8 is out, less those with no Jita order), and
  `npx wrangler d1 execute jita-ledger --remote --command "SELECT run, complete, pages_failed, length(data) FROM industry_npc"`
  one complete row. Add both figures to `docs/notes/industry.md`.
- [ ] **The first Goonmetrics read after Task 6** (the `37` cron, within the hour of the deploy, then six-hourly): the log
  line `goonmetrics {"done":{"UALX-3":"read","C-J6MT":"read"},…}`, and
  `SELECT hub, at, length(data) FROM home_prices` two rows. If Goonmetrics answers anything but 200, the note says what,
  and `GOONMETRICS_ON` stays as it is unless its authors ask.
- [ ] **The tab on the real store**: Build at a quiet station near Jita ranks within seconds of the scan; the pump II and a
  few hundred Tech II rows are priced; Start puts the main where its skills say. Note any figure that surprises in
  `docs/notes/industry.md` with its evidence, as the notes always do.
