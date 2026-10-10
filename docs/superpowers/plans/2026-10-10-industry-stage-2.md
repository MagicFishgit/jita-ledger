# Industry, stage 2: your blueprints and jobs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every character's blueprints and industry jobs are read (the main's by its browser sync and the cloud's hourly
archive, each alt's by the cloud's hourly sheet), kept past ESI's 90 days, shown on a new Blueprints & jobs section of the
Industry tab with each character's slots and what each blueprint builds, checked against what EVE charged (a structure's
facility tax measured and offered with **Use this**), put on To do (an alt's jobs to deliver, what you built to list), and
counted as an Industry activity in Results, All income and each character's Earned.

**Architecture:** Jobs are a new record kind (`jobs`, keyed by job ID) and blueprints a new synced document
(`blueprints`), with pure rules in `src/lib/industryTrack.ts` (the Worker imports it: reading ESI's rows, first sight,
`mergeJob`, the job check, the measured tax, the built claims and built-and-sold) and `src/lib/industryOwned.ts` (the
tab's rows: Your characters, blueprint kinds, the next research step; browser only). Every writer of a job record merges
onto the stored one (`mergeJob`): the browser's sync and pull, the Worker's archive, sheet and push. A Worker a version
behind refuses the new record kind, and `refusedKind` holds those records back as `refusedDoc` does documents. The tab
reads each alt's pulled copy through `useIndustryChars`, writing nothing; To do and the income rules read the same records.

**Tech Stack:** React 18 + TypeScript + Vite; Cloudflare Worker + D1; ESI (`X-Compatibility-Date: 2026-08-18` from the
browser, `2025-08-26` from the Worker, `worker/src/eve.ts` HEADERS); Node's type stripping for pure tests
(`scripts/check.mjs`), the in-memory D1 stand-in for the Worker (`scripts/check-worker.mjs`), Playwright for pages
(`scripts/pages.mjs`) and the income recording (`scripts/income.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-10-industry-design.md`. Read it whole first, Revisions 1 and 2 included: it
carries the facts each rule rests on and every state's wording. This plan builds its build-order tasks 9–13 (stage 2).
Stage 1's plan (`docs/superpowers/plans/2026-10-10-industry-stage-1.md`) and `docs/notes/industry.md` say what stage 1
built; where this plan names stage-1 code, the code on `main` at b82b56e is what it means.

**Task layout.** The spec's five stage-2 tasks, three of them split so each part is reviewable and ship-safe alone:
**9A** (the pure rules, the sync's new kind and document, and the main's reads in the browser) and **9B** (the Worker:
the push's merge, the archive's and the sheet's reads, an alt's copy); **10A** (the Blueprints & jobs section) and **10B**
(Start's reads, the Tech II tile's levels, the Blueprints page on the document); **12A** (an alt's jobs to deliver) and
**12B** (List what you built). The spec's numbering is kept, so its references ("from task 10…") still mean the same task.

## Where this plan corrects the spec

Each is said again in the task that owns it, and goes in `docs/notes/industry.md`. Where the spec's names or shapes
differ from the code, the code wins.

1. **A job record keeps two fields the spec doesn't list.** `outputId` (ESI's required `output_location_id`: where the
   products land, which List what you built needs, since `station_id` is where the job ran) and `perRun` (units a
   manufacturing run makes). ESI doesn't say how many units a job makes, and the only file with it is the 1 MB bundle, so
   `src/data/industryEiv.json` gains `out: { [bp]: [product, perRun] }` (Task 9A: the bundle script, rebuilt from the same
   SDE build; `industry.json` and `industryTypes.json` must come out byte-identical) and every reader writes `perRun` on
   the record. Built-and-sold then needs no bundle to claim units.
2. **The main's jobs are read once.** `meta.industry` (To do's "Industry jobs to deliver", its key `industry:<place>` kept)
   is derived from the same `include_completed=true` read that writes the records, not a second request.
3. **Whether jobs were read at all.** A read with no jobs writes no record, so "absent is not read" needs a mark: every
   stage-2 jobs read writes `meta.jobsRead: true` (the main's by its sync, an alt's by the cloud's sheet), once; a read
   time there would be a revision every hour for an alt (the R&D lesson). The main's `meta.industry` doesn't count: every
   ledger from before stage 2 has one (To do's jobs to deliver), read without `include_completed`, and taking it as a jobs
   read would say "0 of 5 in use" and "Nothing running" while it lists running jobs (pre-flight M1). Jobs read = the mark,
   or records held (the cloud's archive writes the main's). The read time stays the main's `meta.industry.at` and an
   alt's `sheet` job's `lastOk`, as the spec says.
4. **The `blueprints` document gains `names`.** `{ list, names? }`: the name of each container, ship or structure a
   blueprint sits in, read once per new location by the reader's own login (`/characters/{id}/assets/names` and
   `/universe/structures/{id}`), `''` when it has none. An alt's containers can be named only with the alt's login, which
   only the cloud holds; without this the "where" column would say "a container" for nearly every row (the user keeps
   blueprints in containers: Blueprints.tsx's own header). A place with no name reads "a container or ship you haven't
   named", not its type as Check my hangar says it: the document holds no asset types, and an alt's assets list isn't in
   its copy.
5. **`mergeJob`'s "newest read" is by status, not by a read time.** ESI's fields come from the record with the later
   status (delivered, cancelled or reverted over ready, ready over active or paused; on a tie, the record being written).
   A read time on each record would change at every read and push every job every sync.
6. **The pull merges jobs inside `applyPulled`.** A pull is applied with `origin: 'cloud'` and never marks anything to
   send back, and `applyPulled` replaces a record by ID; for `jobs` it calls `mergeJob` instead.
7. **The tab's rows live in `src/lib/industryOwned.ts`, not `industryTrack.ts`.** `charRows` and the blueprint rows read
   the ladder and the finder's rows (`industryLadder.ts`, `industryRank.ts`), and `industryTrack.ts` is imported by the
   Worker, which would then type-check all of that. `industryTrack.ts` keeps what the readers and the income rules need.
8. **`lostSaid` moves to `src/lib/pilot.ts`**, typed structurally (`{ isMain; name; pilot: Pick<Pilot, 'lost'> }`), and
   `researchChars.ts` re-exports it: Industry needs the same words and `ResearchChar` isn't its type.
9. **Claims are derived from the ledger, not passed by each caller.** `everyItemCalcs(d)` and `activityEvents(d, …)` work
   the built claims out from `d.jobs`, `d.txs`, `d.positions` and `d.ignored` (memoised), so Results, the Wallet, Omega
   and the Characters page get them unchanged; the memo keys gain `jobs` and `positions`. A sale split between built and
   bought units is carried as `Position.claimed` (trade ID → units) on Results' `all:` positions: their sells lose the
   claimed units and that part of their tax pro rata, and the sell orders' broker fees are spread over the claimed units
   too, so trading isn't charged the listing fee of what Industry sold (Industry counts sales after tax, as the spec says;
   that fee is a stated limit).
10. **Industry's materials need the bundle, which loads beyond the tab, only when it's needed.** A job's materials are
    the bundle's at its recorded ME with its site's role and rig bonuses (`materialsFor`, `structureBonus`, `rigFor`), so
    Results, the Wallet and the Characters page load `industry.json` (145 KB gzipped, its own chunk) only for a ledger
    holding a manufacturing job with a recorded ME (not cancelled), and a structure site's security (`system(id)`, one
    public read) only when it has rigs. Stage 1's "loaded by the tab only" stands for every ledger
    without such a job, and `npm run check-income`'s recorded ledgers hold none.
11. **What Industry counts, exactly.** Claimed sales at their time, after tax; every job's fee at its start (the journal's
    entries naming the job by `industry_job_id`, else ESI's `cost` on the job); each manufacturing job's materials at its
    start, costed at the character's purchases before it, newest first, each unit once. Invention's datacores and the
    copies it uses aren't charged (they aren't manufacturing materials, and the spec counts those only): a stated limit.
12. **`buildRow` gains `held`.** A Tech II copy you hold is built as it is (its own ME, TE and runs); without the flag
    `buildRow` costs invention again for every Tech II blueprint.
13. **Slots in use count running and ready jobs** (the controller's ruling on risk 5). EVE University's "Industry" page
    doesn't say whether a finished job holds its slot until delivered (fetched 11 October 2026); forum reports say it does,
    until delivered or cancelled (forums.eveonline.com/t/industry-slots-locked-but-not-having-any-jobs-in-list/153387,
    forums-archive.eveonline.com/message/4828259). So a ready job counts as in use, the tip says so, and it's checked in game
    after shipping.
14. **The ladder: reads annotate, skills still decide.** "You're here" stays by skills (and a structure site for Build at
    home); each rung adds what the reads show ("12 manufacturing jobs in the last 90 days", "3 originals researched") and
    Start's slot tiles say how many are in use. A character with the skills who never ran a job isn't moved down.
15. **To do's price for what you built is where it sits, not the finder's whole choice.** In Jita 4-4: Jita's
    `listingPrice` on others' live book (the plan list step's reads); at a home hub's structure or in its system: that
    hub's Goonmetrics sell less a tick; anywhere else: the `industry` doc's `sell` choice (a ship with "never haul ships to
    Jita" on goes to the hub). Running the finder inside To do would load the bundle, the map and every book.
16. **The section's key is `blueprints`** (`hustles/industry/blueprints`), label "Blueprints & jobs".
17. **The Worker reads with `X-Compatibility-Date: 2025-08-26`** (`worker/src/eve.ts`), the browser with 2026-08-18, and
    that's settled (the controller's ruling on risk 6): ESI's OpenAPI gives `/characters/{id}/blueprints/` and
    `/characters/{id}/industry/jobs/` the identical 200 schema under both dates
    (`.playwright-mcp/research/industry-stage2/openapi-*.json`), so the Worker keeps its date. Every field the app reads
    but `job_id … end_date` is optional in the reader; the first real read is still the check of the data (as for
    `agents_research`), recorded in the note.
18. **List what you built is versioned by the newest delivered job's ID**, not every delivered job's (Task 12B). The item
    is built from the newest jobs whose units the place still holds, so listing part of an older batch would drop that job
    from the set, change a version of all their IDs and reopen a hand tick; the newest job's ID changes only with another
    delivery, which is when the spec says a hand tick should reopen.
19. **A merged job reaches the browser that pushed it** (pre-flight I1; Task 9B). A browser skips its own pushes'
    revisions when it pulls (`ownRevs`), so a job the Worker merged (D1 held first-sight fields the pushed record lacked)
    and wrote at the push's revision would never come back to the browser that pushed it. The Worker writes such rows at a
    revision of its own, after the push's, and reports the push's: the next pull brings them down to every browser,
    including one built before this task, and `applyPulled` merges them in. A job pushed as D1 holds it is written at the
    push's revision as before, so this costs a revision only when a merge added something.
20. **First sight falls back to the blueprints held before the read** (pre-flight I2). Whether ESI lists a blueprint while
    it's installed in a job isn't known (its `location_flag` enum names no industry job), so a job's blueprint is looked up
    in the read just taken, then in the doc held before it (`bpFrom`): "as last read for its item ID", the spec's words.
21. **The first sight keeps its own time** (`first.at`, pre-flight M10): `mergeJob` keeps the earliest `seenAt` but may
    take `first` from a later record (the earlier saw the job paused), so `checkable` judges by when the job was first seen
    running, not first seen at all.

## Global Constraints

- Pure `src/lib` modules the Worker imports (`industryTrack.ts`, and what it imports: `blueprints.ts`, `industry.ts`) stay
  free of `./config`, `./store`, React and the DOM, even for a type; no enums, namespaces or constructor parameter
  properties anywhere the Worker or `npm run check` loads. `industryOwned.ts` is browser-only but pure too (check.mjs
  loads it).
- The site and the Worker deploy in either order: a migration only adds (this stage needs none); a new route 404s on an
  old Worker and the tab says the cloud is a version behind; the new `blueprints` document goes through `refusedDoc`; the
  new record kind `jobs` through `refusedKind` (Task 9A), so an old Worker can't stop the sync; an older browser ignores
  a kind and a document it doesn't know (`isRecordKey`, `isDocKey`).
- Nothing of an alt's is ever written into the main's ledger. The tab, To do and the income rules read each alt's pulled
  copy (`altLedger`) and write nothing. The alt-store tripwire in `scripts/check.mjs` is **unchanged by this stage**:
  `components/hustles/Industry.tsx` and `components/Todo.tsx` already read the alt store, and no other file starts to.
- Not known is never 0 or "none": every state says what it is (not read yet, refused, log in again, hand the login over
  again, a version behind, failed). A blueprint list or a jobs list is "none" only after a read that found none.
- `scripts/income-golden.json` is re-recorded (`RECORD=1 npm run check-income`) only in Task 13, by design, with the
  commit saying why each figure moved; no other task may change it, and every other task's `npm run check-income` passes
  with it byte-identical.
- No new permission in stage 2 (`esi-characters.read_blueprints.v1`, `esi-industry.read_character_jobs.v1`,
  `esi-search.search_structures.v1` and `esi-universe.read_structures.v1` are already in `SCOPE`), so no relog.
- To do follows the user's "not too tight so i don't get suggestions": hand ticks hold (`built` is in
  `HOLDS_UNTIL_CHANGED`), and no version moves with every read (versions are job IDs, never units or prices).
- Never assume ships are hauled to Jita: a ship sold from To do's List what you built goes to the hub while "never haul
  ships to Jita" is on.
- Implementers never deploy, never run `wrangler … --remote`, never touch D1 (remote or local), never call ESI with a
  login. Public ESI at build time, if a task needs it, is called with `User-Agent: jita-ledger (research)` and
  `X-Compatibility-Date: 2026-08-18` and nothing identifying.
- The app's voice (app-conventions.md): a section is a lead line and three or four points; a long tip is a lead line,
  bullets, then an example (`tipText`); a count is a tile; plain words; no figure invented; skill levels in Roman
  numerals (`ROMAN` from `src/lib/skillStatus.ts`).
- Stand-in data lives in the `industry` case of `scripts/pages.mjs` (each block above `// --- the end of the industry
  case`), never in `scripts/ledgers.mjs` (`npm run check-income` records that ledger).
- Every task ends with: `npm run check`, `npm run build`, `npm run check-pages` (`LEDGER=industry` while iterating, the
  full run before committing), `npm run check-phone` for UI, `npm run check-income`, a look at screenshots of what changed
  at 1,440 and 390 px (`SHOTS=.playwright-mcp/industry2/<task> npm run check-pages`, then open the PNGs), the note
  updated (`docs/notes/industry.md`, plus limits.md / positions-results.md / characters.md / orders-alerts.md where the
  spec's Notes section says), and a commit whose message says what was wrong or missing, why, and the evidence, ending
  with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf`.
- Each test is shown failing with its rule planted wrong (the step names the planted line), then passing.

## Review Focus

1. **A Worker a version behind refuses the `jobs` kind.** The rest of that push (trades, the `industry` doc, the
   `blueprints` doc) must still land, the jobs must stay waiting, and later chunks of a large push must still be sent.
   Pinned in Task 9A, step 1 (`refusedKind`) and step 9 (the page case's stubbed cloud answering 400).
2. **A job first seen late by one writer.** A browser that first sees a job after it ended (no first-sight fields) must
   never erase the cloud's record that has them, and must end up holding them itself, whether its record goes up before or
   after the cloud's comes down. Pinned in Task 9A, step 1 (`mergeJob`, `applyPulled` both ways), Task 9B, step 1 (the
   Worker writes a merged job that differs from what was pushed at a revision of its own, after the push's) and Task 9B,
   step 7 (the page case: a browser that pushes its late record before pulling ends up holding `first`).
3. **An alt refused after a read, or never read.** What was read stays shown with "as the cloud last read it" and
   `lostSaid`; nothing reads "0 originals", "0 slots in use" or "No jobs" for an alt whose jobs weren't read; totals count
   only characters read and say how many. Pinned in Task 10A, step 1 (`charRows`, `fleetTotals`) and step 9 (the page case).
4. **A facility tax measured where it can't be.** A job not manufacturing, at a structure that isn't one of your sites,
   first seen more than 90 minutes after it started, or by a character whose clone state isn't read, gives a reason and
   no figure; a figure is only ever offered with **Use this**, never written by itself. Pinned in Task 11, step 1.
5. **A sale before the built units existed.** Industry claims a sale only from units its delivered jobs had made by the
   sale's time; a sale made before the first delivery stays trading or "Sold, never bought". Pinned in Task 13, step 1
   (`builtClaims`, time order).

## Files

| File | Responsibility | Task |
| --- | --- | --- |
| `scripts/industry-bundle.mjs`, `src/data/industryEiv.json` | `out`: each blueprint's product and units a run | 9A |
| `src/lib/industryTrack.ts` (new) | Jobs (`RawJob`, `JobRecord`, `toJob`, `firstSight`, `mergeJob`, `readJobs`), the `blueprints` doc, `slotsUsed`, `jobCheck`, `measuredTax`, `builtClaims`, `builtItems`, `builtAndSold` | 9A, 10A, 11, 12B, 13 |
| `src/lib/industryReads.ts` (new) | The browser's reads of the main's blueprints and jobs (I/O) | 9A, 10B |
| `src/components/Settings.tsx` | Your data names the `jobs` kind (`KIND_SAID`) | 9A |
| `src/lib/cloudSync.ts` | `refusedKind`, the `jobs` kind, the `blueprints` doc, `applyPulled`'s merge | 9A |
| `src/lib/cloud.ts` | `pushNow` holds a refused kind back; `pullNow` sanitizes `blueprints` | 9A |
| `src/lib/store.ts`, `src/lib/emptyData.ts`, `src/lib/types.ts` | `Data.jobs`, `Data.blueprints`, `Meta.blueprintsAt`, `Meta.jobsRead` | 9A |
| `src/lib/sync.ts` | Blueprints and jobs in the main's sync | 9A |
| `src/lib/altLedger.ts` | An alt's copy carries `jobs` and `blueprints` | 9A |
| `worker/src/sync.ts` | `jobs` in `RECORD_KINDS`, merged on push; `blueprints` in `DOC_KEYS` | 9A (doc), 9B |
| `worker/src/industryJobs.ts` (new) | The Worker's reads of jobs and blueprints (first sight, names) | 9B |
| `worker/src/archive.ts`, `worker/src/sheet.ts` | The main's jobs hourly; an alt's blueprints and jobs hourly | 9B |
| `src/lib/industryOwned.ts` (new) | `charRows`, `fleetTotals`, `blueprintKinds`, `nextResearch`, `rungDone` | 10A, 10B |
| `src/lib/pilot.ts`, `src/components/hustles/researchChars.ts` | `lostSaid`, structural | 10A |
| `src/lib/industryRank.ts` | `RowInput.held` | 10A |
| `src/components/hustles/industryChars.ts` | Each character's blueprints and jobs, read states | 10A |
| `src/components/hustles/industryFinder.ts` | `useFinder`'s `own` override | 10A |
| `src/components/hustles/Industry.tsx` | The section, the All-characters filter | 10A |
| `src/components/hustles/IndustryOwned.tsx` (new) | Blueprints & jobs: Your characters, tiles, blueprints, jobs | 10A, 11 |
| `src/components/hustles/IndustryStart.tsx`, `IndustryDetail.tsx` | Start's reads; the Tech II chance tile's levels | 10B |
| `src/components/Blueprints.tsx` | Reads the `blueprints` doc; its button reads afresh into it | 10B |
| `src/components/hustles/IndustrySites.tsx`, `IndustryBuild.tsx` | The measured tax with **Use this** | 11 |
| `src/lib/todo.ts`, `src/components/Todo.tsx` | An alt's jobs to deliver; List what you built | 12A, 12B |
| `src/components/planListing.ts` | `useItemReads` exported | 12B |
| `src/lib/types.ts`, `src/lib/prefs.ts` | `Activity` gains `Industry` | 13 |
| `src/lib/positions.ts`, `src/lib/everyItem.ts`, `src/lib/results.ts`, `src/lib/income.ts`, `src/lib/wallet.ts` | Claims; the Industry activity; `industry_security_tax` filed as Industry | 13 |
| `src/components/activityEvents.ts`, `src/components/Results.tsx`, `src/components/Wallet.tsx`, `src/components/Characters.tsx`, `src/components/charIncome.ts` | Industry's inputs loaded when needed; its row and words while they load or after they fail | 13 |
| `scripts/check.mjs`, `scripts/check-worker.mjs`, `scripts/pages.mjs` | Tests | every task |
| `scripts/income-golden.json` | Re-recorded once | 13 |
| `docs/notes/industry.md`, `limits.md`, `positions-results.md`, `characters.md`, `orders-alerts.md`, `cloud.md`, `CLAUDE.md` | Notes | every task |

`.claude/rules/industry.md`'s `paths:` gains each new file in the task that creates it (a frontmatter that doesn't parse
loads like an import: keep it valid YAML, and run `head -20 .claude/rules/industry.md` after editing).

---
### Task 9A: Jobs and blueprints kept, the sync's new kind and document, and the main's reads

**Files:**
- Create: `src/lib/industryTrack.ts`, `src/lib/industryReads.ts`
- Modify: `scripts/industry-bundle.mjs` and `src/data/industryEiv.json` (rebuilt: `out`), `src/lib/cloudSync.ts`
  (`refusedKind`, `RECORD_KEYS.jobs`, `DOC_KEYS` `'blueprints'`, `applyPulled`), `src/lib/cloud.ts` (`pushNow`, `pullNow`),
  `src/components/Settings.tsx` (`KIND_SAID.jobs`),
  `src/lib/store.ts`, `src/lib/emptyData.ts`, `src/lib/types.ts` (`Meta.blueprintsAt`, `Meta.jobsRead`), `src/lib/sync.ts`,
  `src/lib/altLedger.ts`, `src/components/Todo.tsx` (its `ACTIVITY` map moves to `industryTrack.ts`), `worker/src/sync.ts`
  (`DOC_KEYS` `'blueprints'` only: the `jobs` kind is Task 9B's), `scripts/check.mjs`, `scripts/check-worker.mjs`,
  `scripts/pages.mjs`, `.claude/rules/industry.md`, `docs/notes/industry.md`, `docs/notes/cloud.md`

**Interfaces:**
- Consumes: `readBlueprints`, `type RawBlueprint`, `type OwnedBlueprint` (`src/lib/blueprints.ts`); `eivOf`,
  `parseIndices`, `type Activity`, `type IndustryIndex` (`src/lib/industry.ts`); `station`, `structureInfo`
  (`src/lib/universe.ts`); `industrySystemsShared`, `adjustedPricesShared` (`src/lib/market.ts`); `refusedDoc` (cloudSync).
- Produces (later tasks rely on these exact names):
  - `src/data/industryEiv.json`: `{ build, eiv: { [bp]: [[material, qty]] }, out: { [bp]: [product, perRun] } }`.
  - `src/lib/industryTrack.ts`: `type RawJob`, `type JobRecord`, `type FirstSight`, `type SightInputs`, `type JobsContext`,
    `FIRST_SIGHT_MS` (5,400,000), `ACTIVITY_SAID`, `ACTIVITY_OF`, `SCIENCE_ACTIVITIES`, `toJob(raw, seenAt, perRun)`,
    `eivBlueprintOf(job)`, `firstSight(job, o)`, `mergeJob(stored, incoming)`, `newJobs(raw, stored)`,
    `readJobs(raw, stored, c)`, `jobUnits(job)`, `checkable(job)`; `type BpRow`, `type BlueprintsDoc`, `MAX_BLUEPRINTS`,
    `toBlueprintsDoc(raw, names?)`, `sanitizeBlueprints(v)`, `ownedOf(doc)`, `bpAt(doc, itemId)`,
    `bpFrom(fresh, held)` (correction 20), `placesToName(doc)`, `isStationId(id)`, `isStructureId(id)`. `FirstSight` carries
    `at`, when it was taken (correction 21).
  - `src/lib/industryReads.ts`: `type EivFile`, `loadEiv()`, `readBlueprintsNow(cid, prev, can)`,
    `readJobsNow(cid, stored, bps, heldBps)`.
  - `src/lib/cloudSync.ts`: `refusedKind(message): RecordKey | null`; `RECORD_KEYS.jobs = 'map'`; `'blueprints'` in `DOC_KEYS`.
  - `Data.jobs: Record<string, JobRecord>`, `Data.blueprints?: BlueprintsDoc` (store.ts); `Meta.blueprintsAt?: string`,
    `Meta.jobsRead?: true` (types.ts), the main's and an alt's (correction 3).
  - `altLedger(saved)` carries `jobs` and `blueprints`.
  - `src/components/Settings.tsx`: `KIND_SAID.jobs` (Your data: "1 industry job", "12 industry jobs").

The main's jobs come from one read with `include_completed=true` (correction 2): `meta.industry` (To do's jobs to deliver,
unchanged in shape and key) is derived from it as before, and the records are the same rows kept.

**Ship-safety.** This task adds `jobs` to the browser's `RECORD_KEYS` but **not** to the Worker's `RECORD_KINDS` (Task
9B): until then the Worker answers 400 "Unknown record kind: jobs" to any push carrying one, and `refusedKind` (this
task) sends the rest without them and keeps them waiting, the very path a Worker a version behind takes in production.
The `blueprints` document goes into both `DOC_KEYS` here.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after the section `--- Industry: Tech II through invention …` and before the final
`console.log(failed ? …)`:

```js
console.log('\n--- Industry stage 2: units a run in industryEiv.json (Task 9A) ---');
{
  const fsE = await import('node:fs');
  const E = JSON.parse(fsE.readFileSync(new URL('../src/data/industryEiv.json', import.meta.url)));
  // Built-and-sold claims a job's units from its runs × units a run, which ESI's job doesn't give and only the 1 MB bundle
  // held: every blueprint with ME 0 materials now names its product and how many a run makes.
  eq('  every blueprint in it names its product and units a run', [Object.keys(E.out).length, Object.keys(E.out).every((k) => k in E.eiv)], [Object.keys(E.eiv).length, true]);
  eq('  the Large Trimark Armor Pump I Blueprint makes one a run; the Scourge Cruise Missile Blueprint a hundred', [E.out[25895], E.out[804]], [[25894, 1], [203, 100]]);
}

console.log('\n--- Industry stage 2: jobs kept past ESI\'s 90 days (industryTrack.ts) ---');
{
  const T = await import('../src/lib/industryTrack.ts');
  const I = await import('../src/lib/industry.ts');
  const fsT = await import('node:fs');
  const FX = JSON.parse(fsT.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8'));
  const E = JSON.parse(fsT.readFileSync(new URL('../src/data/industryEiv.json', import.meta.url)));
  const indices = I.parseIndices(FX.systems);
  // ESI's row (OpenAPI 2026-08-18): the pump, 65 runs at UALX-3's 1st Byzantigoon (a structure), started 10:00.
  const raw = (over = {}) => ({
    job_id: 501, installer_id: 95210486, facility_id: 1046664001931, station_id: 1046664001931, activity_id: 1,
    blueprint_id: 7001, blueprint_type_id: 25895, blueprint_location_id: 1046664001931, output_location_id: 1046664001931,
    runs: 65, status: 'active', duration: 66000, start_date: '2026-10-11T10:00:00Z', end_date: '2026-10-12T04:20:00Z',
    product_type_id: 25894, licensed_runs: 40, cost: 17213916, ...over,
  });
  const job = T.toJob(raw(), '2026-10-11T10:20:00Z', 1);
  eq('  ESI\'s row as kept: what ran, where, when, its cost, and where its products land', job, {
    jobId: 501, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 65, licensedRuns: 40, successfulRuns: null,
    probability: null, cost: 17213916, facilityId: 1046664001931, stationId: 1046664001931, outputId: 1046664001931,
    start: '2026-10-11T10:00:00Z', end: '2026-10-12T04:20:00Z', completed: null, status: 'active', perRun: 1, seenAt: '2026-10-11T10:20:00Z',
  });
  eq('  units a run only for manufacturing: a copy job keeps none', T.toJob(raw({ activity_id: 5 }), '2026-10-11T10:20:00Z', 1).perRun, null);

  const sight = { bp: { me: 10, te: 20 }, systemId: 30004807, indices, adjusted: FX.adjusted, eiv: E.eiv };
  const f = T.firstSight(job, sight);
  eq('  first seen while active: the blueprint\'s ME and TE as read, the system, its manufacturing index, the EIV a run',
    [f.me, f.te, f.systemId, f.index, Math.round(f.eiv * 65)], [10, 20, 30004807, indices[30004807].manufacturing, 157590413]);
  eq('    a job first seen after it ended has none', T.firstSight({ ...job, status: 'ready' }, sight), undefined);
  eq('    nothing read is not known, never 0: no blueprint read, no system, no prices', T.firstSight(job, { bp: null, systemId: null, indices: null, adjusted: null, eiv: null }),
    { me: null, te: null, systemId: null, index: null, eiv: null, at: '2026-10-11T10:20:00Z' });
  const inv = T.toJob(raw({ activity_id: 8, product_type_id: 26303, runs: 3 }), '2026-10-11T10:20:00Z', null);
  eq('    invention\'s EIV is the Tech II blueprint\'s it makes, at the invention index', [Math.round(T.firstSight(inv, sight).eiv), T.firstSight(inv, sight).index], [35524196, indices[30004807].invention]);

  // Two writers: the cloud saw it at 10:20 while active; a browser first saw it at 18:00, ready, with no first-sight fields.
  const cloud = { ...job, first: f };
  const late = T.toJob(raw({ status: 'ready', end_date: '2026-10-11T17:50:00Z' }), '2026-10-11T18:00:00Z', 1);
  const m1 = T.mergeJob(late, cloud), m2 = T.mergeJob(cloud, late);
  eq('  merged either way round: first-sight fields kept, the earliest seen, ESI\'s fields from the later status',
    [m1.first, m1.seenAt, m1.status, m1.end, m2.first, m2.seenAt, m2.status, m2.end],
    [f, '2026-10-11T10:20:00Z', 'ready', '2026-10-11T17:50:00Z', f, '2026-10-11T10:20:00Z', 'ready', '2026-10-11T17:50:00Z']);
  eq('    a stale read never moves a delivered job back to active', T.mergeJob({ ...cloud, status: 'delivered', completed: '2026-10-12T05:00:00Z' }, { ...job, seenAt: '2026-10-11T11:00:00Z' }).status, 'delivered');
  eq('    the same job read again is the stored record itself (nothing to push)', T.mergeJob(cloud, { ...job, seenAt: '2026-10-11T12:00:00Z' }) === cloud, true);
  eq('    a stored record that isn\'t one (an older build\'s, or another job) gives way', T.mergeJob({ junk: 1 }, job), job);

  const ctx = { seenAt: '2026-10-11T10:20:00Z', perRun: (bp) => E.out[bp]?.[1] ?? null, bp: (id) => (id === 7001 ? { me: 10, te: 20 } : null), systemOf: () => 30004807, indices, adjusted: FX.adjusted, eiv: E.eiv };
  const got = T.readJobs([raw(), raw({ job_id: 502, status: 'delivered', completed_date: '2026-10-10T08:00:00Z' })], {}, ctx);
  eq('  ESI\'s list read onto nothing held: both kept, first-sight fields only on the active one', got.map((x) => [x.jobId, !!x.first, x.perRun]), [[501, true, 1], [502, false, 1]]);
  const held = Object.fromEntries(got.map((x) => [String(x.jobId), x]));
  eq('    read again unchanged: nothing changed', T.readJobs([raw(), raw({ job_id: 502, status: 'delivered', completed_date: '2026-10-10T08:00:00Z' })], held, { ...ctx, seenAt: '2026-10-11T11:00:00Z' }), []);
  // Held from a late sight (no first-sight fields) and running in this read: it isn't sighted again.
  eq('    a held job isn\'t sighted again, whatever it shows now', T.readJobs([raw()], { 501: late }, ctx)[0]?.first, undefined);
  eq('    the jobs not held yet', T.newJobs([raw(), raw({ job_id: 503 })], held).map((r) => r.job_id), [503]);
  eq('  units a job made: runs × units a run, manufacturing only; not known without units a run', [T.jobUnits(job), T.jobUnits({ ...job, perRun: null }), T.jobUnits(inv)], [65, null, null]);
  const sightAt = (at) => ({ ...cloud, first: { ...f, at } });
  eq('  checked only when first seen running within 90 minutes of its start', [T.checkable(cloud), T.checkable(sightAt('2026-10-11T11:29:00Z')), T.checkable(sightAt('2026-10-11T11:31:00Z')), T.checkable(late)], [true, true, false, false]);
  // Seen paused at 10:05 (no first sight), running at 13:00: merged, the earliest seen is 10:05, but the first sight was
  // taken at 13:00, three hours after the start: not checkable (correction 21, pre-flight M10).
  const pausedEarly = T.toJob(raw({ status: 'paused' }), '2026-10-11T10:05:00Z', 1);
  const runningLate = { ...T.toJob(raw(), '2026-10-11T13:00:00Z', 1), first: { ...f, at: '2026-10-11T13:00:00Z' } };
  const ml = T.mergeJob(pausedEarly, runningLate);
  eq('    a first sight taken later than the first seeing is judged by its own time', [ml.seenAt, ml.first.at, T.checkable(ml)], ['2026-10-11T10:05:00Z', '2026-10-11T13:00:00Z', false]);
  eq('  the Industry window\'s activity names', [T.ACTIVITY_SAID[1], T.ACTIVITY_SAID[4], T.ACTIVITY_SAID[8]], ['Manufacturing', 'ME research', 'Invention']);
}

console.log('\n--- Industry stage 2: the blueprints document (industryTrack.ts) ---');
{
  const T = await import('../src/lib/industryTrack.ts');
  const { readBlueprints } = await import('../src/lib/blueprints.ts');
  const b = (item_id, type_id, location_id, quantity, runs, me, te) => ({ item_id, type_id, location_id, location_flag: 'Hangar', quantity, runs, material_efficiency: me, time_efficiency: te });
  const raw = [b(30, 25895, 60003760, -1, -1, 10, 20), b(10, 25895, 1046664001931, -2, 40, 10, 20), b(20, 804, 1_030_000_001, 3, -1, 0, 0)];
  const doc = T.toBlueprintsDoc(raw, { 1030000001: 'Blueprints', 99: 'gone' });
  eq('  sorted by item ID, each row [item, type, where, flag, quantity, runs, ME, TE]; names only for places it holds', doc, {
    list: [[10, 25895, 1046664001931, 'Hangar', -2, 40, 10, 20], [20, 804, 1030000001, 'Hangar', 3, -1, 0, 0], [30, 25895, 60003760, 'Hangar', -1, -1, 10, 20]],
    names: { 1030000001: 'Blueprints' },
  });
  eq('  read back as the Blueprints page reads ESI', T.ownedOf(doc), readBlueprints([...raw].sort((x, y) => x.item_id - y.item_id)));
  eq('  a blueprint\'s ME and TE by its item ID; one not held is none', [T.bpAt(doc, 30), T.bpAt(doc, 31), T.bpAt(undefined, 30)], [{ me: 10, te: 20 }, null, null]);
  // A running job's blueprint may be missing from the read just taken (ESI may not list one installed in a job): the doc held
  // before the read stands in (correction 20, pre-flight I2).
  const fresh = T.toBlueprintsDoc(raw.filter((x) => x.item_id !== 30));
  eq('  first sight looks in the fresh read, then in the doc held before it', [T.bpFrom(fresh, doc)(30), T.bpFrom(fresh, doc)(10), T.bpFrom(fresh, undefined)(30), T.bpFrom(undefined, doc)(30)],
    [{ me: 10, te: 20 }, { me: 10, te: 20 }, null, { me: 10, te: 20 }]);
  eq('  places still to name: containers and ships, structures; never a station', T.placesToName(T.toBlueprintsDoc(raw)), { items: [1030000001], structures: [1046664001931] });
  eq('    a place named once (or found to have no name) isn\'t asked again', T.placesToName(T.toBlueprintsDoc(raw, { 1030000001: '', 1046664001931: '' })), { items: [], structures: [] });
  eq('  sanitized: absent is not read; a row that isn\'t one is dropped; an empty list is read', [T.sanitizeBlueprints(undefined), T.sanitizeBlueprints({ list: [[1, 2, 3, 'Hangar', -1, -1, 0, 0], ['x'], [5, 6, 7, 'Hangar', -1, -1, 99, 0]] }), T.sanitizeBlueprints({ list: [] }), T.sanitizeBlueprints('x')],
    [undefined, { list: [[1, 2, 3, 'Hangar', -1, -1, 0, 0]] }, { list: [] }, undefined]);
  eq('  the station and structure bands', [T.isStationId(60003760), T.isStationId(1030000001), T.isStructureId(1046664001931)], [true, false, true]);
}

console.log('\n--- Industry stage 2: a new record kind and document sync like the others (cloudSync.ts) ---');
{
  const C = await import('../src/lib/cloudSync.ts');
  eq('  jobs go record by record; blueprints are a document', [C.RECORD_KEYS.jobs, C.DOC_KEYS.includes('blueprints')], ['map', true]);
  // A Worker a version behind answers 400 "Unknown record kind: jobs" and takes nothing of the push: the browser sends the
  // rest without that kind and keeps it waiting (cloud.ts pushNow), as refusedDoc does for a document.
  eq('  a refused kind is named; anything else isn\'t one', [C.refusedKind('Unknown record kind: jobs'), C.refusedKind('Unknown record kind: frogs'), C.refusedKind('Unknown document: blueprints'), C.refusedKind(undefined)], ['jobs', null, null, null]);
  const first = { me: 10, te: 20, systemId: 30004807, index: 0.0617, eiv: 2424467.9 };
  const mine = { jobId: 501, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 65, licensedRuns: 40, successfulRuns: null, probability: null, cost: 17213916,
    facilityId: 1, stationId: 1, outputId: 1, start: '2026-10-11T10:00:00Z', end: '2026-10-12T04:20:00Z', completed: null, status: 'active', perRun: 1, seenAt: '2026-10-11T10:20:00Z', first };
  const down = { ...mine, status: 'ready', seenAt: '2026-10-11T18:00:00Z' };
  delete down.first;
  const { emptyData } = await import('../src/lib/emptyData.ts');
  const p = C.applyPulled({ ...emptyData(), jobs: { 501: mine } }, { records: [{ k: 'jobs', i: '501', d: down }], docs: [] });
  eq('  a job that comes down without its first-sight fields keeps this browser\'s (mergeJob)', [p.jobs[501].first, p.jobs[501].status, p.jobs[501].seenAt], [first, 'ready', '2026-10-11T10:20:00Z']);
  const q = C.applyPulled({ ...emptyData(), jobs: { 501: down } }, { records: [{ k: 'jobs', i: '501', d: mine }], docs: [] });
  eq('  and the other way: a browser holding only its late record takes the cloud\'s first-sight fields when they come down', [q.jobs[501].first, q.jobs[501].status, q.jobs[501].seenAt], [first, 'ready', '2026-10-11T10:20:00Z']);
  eq('  an empty ledger: no jobs, blueprints not read', [emptyData().jobs, 'blueprints' in emptyData()], [{}, false]);
}

console.log('\n--- Industry stage 2: an alt\'s copy carries its jobs and blueprints (altLedger.ts) ---');
{
  const { altLedger } = await import('../src/lib/altLedger.ts');
  const saved = { rev: 3, records: { jobs: { 9: { jobId: 9 } } }, docs: { blueprints: { list: [[1, 25895, 60003760, 'Hangar', -1, -1, 4, 8]] } } };
  const l = altLedger(saved);
  eq('  its jobs and its blueprints doc, read-only', [l.jobs, l.blueprints], [{ 9: { jobId: 9 } }, { list: [[1, 25895, 60003760, 'Hangar', -1, -1, 4, 8]] }]);
  eq('  none read: no jobs, blueprints not read', [altLedger({ rev: 0, records: {}, docs: {} }).jobs, altLedger({ rev: 0, records: {}, docs: {} }).blueprints], [{}, undefined]);
}
```

Add to `scripts/check-worker.mjs`, before its final `console.log(failed ? …)`:

```js
console.log('\n--- the blueprints doc goes up like any other ---');
{
  const { push } = await import('../worker/src/sync.ts');
  const db = d1();
  const r = await push(db, MAIN, { records: [], docs: [{ key: 'blueprints', d: { list: [] } }] });
  eq('  a push carrying the blueprints doc is taken, not refused as unknown', [r.docs, db.rows('SELECT key FROM docs WHERE char_id = ?', MAIN).map((x) => x.key)], [1, ['blueprints']]);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -B1 -A3 "stage 2\|blueprints doc"`
Expected: `E.out` undefined, `industryTrack.ts` not found, `RECORD_KEYS.jobs` undefined, `refusedKind` not a function, the
Worker check failing on "Unknown document: blueprints".

- [ ] **Step 3: Units a run in `industryEiv.json`**

In `scripts/industry-bundle.mjs`, replace the eiv loop and its write:

```js
// Every published blueprint's ME 0 manufacturing materials, for a job's estimated item value, and its product with how many a
// run makes (`out`), for the units a job made: ESI's job doesn't say, and built-and-sold claims sales by them (stage 2).
const eiv = {}, out = {};
for (const [id, b] of [...bps].sort((a, b) => a[0] - b[0])) {
  const m = man(b);
  if (m && types.get(id)?.published) {
    eiv[id] = (m.materials ?? []).map((x) => [x.typeID, x.quantity]);
    out[id] = [m.products[0].typeID, m.products[0].quantity];
  }
}
```

and `fs.writeFileSync('src/data/industryEiv.json', JSON.stringify({ build: sde.buildNumber, eiv, out }));`. In the header
comment, the line for `industryEiv.json` becomes
`// src/data/industryEiv.json: { build, eiv: { bp: [[material, qty]] }, out: { bp: [product, perRun] } }, every published`
`//   blueprint's ME 0 manufacturing materials and its product: a job's estimated item value, and the units it made.`

Run: `SDE_ZIP=.playwright-mcp/research/rd-agents/sde-3569502.zip node scripts/industry-bundle.mjs && git status --short src/data`
Expected: only `src/data/industryEiv.json` modified (the same build: `industry.json` and `industryTypes.json` byte-identical).
Put the size the script prints in the note.

- [ ] **Step 4: `src/lib/industryTrack.ts`**

Create it:

```ts
/**
 * Your industry jobs and blueprints, as the app keeps them (docs/notes/industry.md; spec
 * docs/superpowers/specs/2026-10-10-industry-design.md, stage 2). Jobs are records of their own, kind `jobs`, keyed by
 * job ID, kept past ESI's 90 days; blueprints a synced document, `blueprints`. Several writers keep the same job (the
 * main's browser sync and the cloud's hourly archive; for an alt, the cloud's sheet), so every writer merges onto what it
 * holds (`mergeJob`): what's seen only while a job runs (its blueprint's ME and TE, the system's index, the EIV) is never
 * dropped by a writer that saw it later. Pure: no config, store, React or DOM. The Worker imports it, so it imports only
 * blueprints.ts and industry.ts, which are pure too.
 */
import { readBlueprints, type OwnedBlueprint, type RawBlueprint } from './blueprints';
import { eivOf, type Activity, type IndustryIndex } from './industry';

/**
 * ESI's /characters/{id}/industry/jobs/ row: OpenAPI at 2026-08-18 (`.playwright-mcp/research/rd-agents/openapi.json`). The
 * required fields as ESI requires them, the rest optional. The Worker reads at 2025-08-26 (worker/src/eve.ts), whose schema
 * for this route is identical; the first real read is the check of the data (docs/notes/industry.md).
 */
export type RawJob = {
  job_id: number; installer_id: number; facility_id: number; station_id: number; activity_id: number;
  blueprint_id: number; blueprint_type_id: number; blueprint_location_id: number; output_location_id: number;
  runs: number; status: string; duration: number; start_date: string; end_date: string;
  product_type_id?: number; licensed_runs?: number; successful_runs?: number; probability?: number; cost?: number;
  completed_date?: string; completed_character_id?: number; pause_date?: string;
};

/**
 * How long after a job's start it may first be seen and still be checked (jobCheck): ESI holds jobs five minutes and the
 * hourly cron sometimes starts late, so an alt's job started just before a `:37` read is first seen 61 to 65 minutes on
 * (spec, Revision 2).
 */
export const FIRST_SIGHT_MS = 90 * 60_000;

/** ESI's activity IDs, as the Industry window names them. */
export const ACTIVITY_SAID: Record<number, string> = { 1: 'Manufacturing', 3: 'TE research', 4: 'ME research', 5: 'Copying', 7: 'Reverse engineering', 8: 'Invention', 9: 'Reaction', 11: 'Reaction' };
/** The activities the rules cost (industry.ts), by ESI's ID. Reactions and reverse engineering aren't modelled. */
export const ACTIVITY_OF: Partial<Record<number, Activity>> = { 1: 'manufacturing', 3: 'researchTime', 4: 'researchMaterial', 5: 'copying', 8: 'invention' };
/** What runs in a science slot (research, copying, invention, reverse engineering): every other activity in a factory slot. */
export const SCIENCE_ACTIVITIES: ReadonlySet<number> = new Set([3, 4, 5, 7, 8]);

/**
 * What only a writer who saw the job running can know (spec, "At first sight"): its blueprint's ME and TE as last read
 * for its item ID, the system it ran in, that system's index for its activity, and the EIV a run at that hour's adjusted
 * prices. Each is null when not known: never 0.
 */
export type FirstSight = {
  me: number | null; te: number | null; systemId: number | null; index: number | null; eiv: number | null;
  /** When it was taken (correction 21): a record's earliest `seenAt` may be a sighting of the job paused, hours before. */
  at?: string;
};

/** A job as kept: ESI's fields, units a manufacturing run makes (industryEiv.json `out`), when it was first seen, and its first sight. */
export type JobRecord = {
  jobId: number; activity: number; blueprintId: number; blueprintTypeId: number; productTypeId: number | null;
  runs: number; licensedRuns: number | null; successfulRuns: number | null; probability: number | null;
  /** "The sum of job installation fee and industry facility tax" (ESI): what the game charged. */
  cost: number | null;
  facilityId: number; stationId: number;
  /** Where its products land (ESI's `output_location_id`): List what you built looks for them there. */
  outputId: number;
  start: string; end: string; completed: string | null;
  /** ESI's: active, paused, ready, delivered, cancelled or reverted. */
  status: string;
  /** Units a manufacturing run makes; null for any other activity, or when the reader couldn't say. */
  perRun: number | null;
  /** When it was first seen, by whichever writer saw it first. */
  seenAt: string;
  /** Present only when it was first seen while active. */
  first?: FirstSight;
};

const RANK: Record<string, number> = { active: 0, paused: 0, ready: 1, delivered: 2, cancelled: 2, reverted: 2 };
const rank = (s: string): number => RANK[s] ?? 0;
const num = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/** A record in one key order, so two equal records stringify alike whichever writer built them. */
function shape(x: JobRecord): JobRecord {
  const f = x.first;
  return {
    jobId: x.jobId, activity: x.activity, blueprintId: x.blueprintId, blueprintTypeId: x.blueprintTypeId, productTypeId: x.productTypeId,
    runs: x.runs, licensedRuns: x.licensedRuns, successfulRuns: x.successfulRuns, probability: x.probability, cost: x.cost,
    facilityId: x.facilityId, stationId: x.stationId, outputId: x.outputId, start: x.start, end: x.end, completed: x.completed, status: x.status,
    perRun: x.perRun, seenAt: x.seenAt,
    ...(f ? { first: { me: f.me, te: f.te, systemId: f.systemId, index: f.index, eiv: f.eiv, ...(f.at ? { at: f.at } : {}) } } : {}),
  };
}

/** ESI's row as kept, seen at `seenAt`; `perRun` is kept for manufacturing only. */
export function toJob(r: RawJob, seenAt: string, perRun: number | null): JobRecord {
  return shape({
    jobId: r.job_id, activity: r.activity_id, blueprintId: r.blueprint_id, blueprintTypeId: r.blueprint_type_id,
    productTypeId: num(r.product_type_id), runs: r.runs, licensedRuns: num(r.licensed_runs), successfulRuns: num(r.successful_runs),
    probability: num(r.probability), cost: num(r.cost), facilityId: r.facility_id, stationId: r.station_id ?? r.facility_id,
    outputId: r.output_location_id ?? r.station_id ?? r.facility_id, start: r.start_date, end: r.end_date,
    completed: r.completed_date ?? null, status: r.status, perRun: r.activity_id === 1 ? perRun : null, seenAt,
  });
}

/**
 * The blueprint whose ME 0 materials a job's EIV is worked out on: invention's is the Tech II blueprint it makes (ESI's
 * `product_type_id`), as `inventionCost` charges 2% of the Tech II product's EIV an attempt; every other activity's its own.
 */
export const eivBlueprintOf = (j: Pick<JobRecord, 'activity' | 'blueprintTypeId' | 'productTypeId'>): number | null =>
  j.activity === 8 ? j.productTypeId : j.blueprintTypeId;

export type SightInputs = {
  /** The blueprint's ME and TE as last read for the job's blueprint item ID; null when not held or not read. */
  bp: { me: number; te: number } | null;
  systemId: number | null;
  indices: Record<number, IndustryIndex> | null;
  adjusted: Record<number, number> | null;
  /** industryEiv.json's `eiv`. */
  eiv: Record<string, [number, number][]> | null;
};

/** The first-sight fields, for a job seen while active; undefined for one first seen after it ended. */
export function firstSight(j: JobRecord, o: SightInputs): FirstSight | undefined {
  if (j.status !== 'active') return undefined;
  const act = ACTIVITY_OF[j.activity];
  const sys = o.systemId != null ? o.indices?.[o.systemId] : undefined;
  const bp = eivBlueprintOf(j);
  const mats = bp != null ? o.eiv?.[String(bp)] : undefined;
  return {
    me: o.bp?.me ?? null, te: o.bp?.te ?? null, systemId: o.systemId,
    index: act && sys ? sys[act] : null,
    eiv: mats && o.adjusted ? eivOf(mats, o.adjusted) : null,
    at: j.seenAt,
  };
}

/**
 * One job as two writers saw it, merged (spec, "Two writers merge, never overwrite"). First-sight fields, once present, are
 * never dropped: the earliest-seen record's, else the other's. The earliest `seenAt` wins. ESI's own fields (status, end,
 * cost, completed) come from the record with the later status (a delivered, cancelled or reverted job over a ready one,
 * ready over active or paused), on a tie from `incoming`, the read being written now: a read time on every record would
 * change at every read and push every job every sync. Units a run: either's. Returns `stored` itself when nothing changed,
 * so a writer pushes only what moved; a stored value that isn't this job's record gives way.
 */
export function mergeJob(stored: JobRecord | undefined | null, incoming: JobRecord): JobRecord {
  if (!stored || typeof stored !== 'object' || stored.jobId !== incoming.jobId || typeof stored.seenAt !== 'string') return incoming;
  const sAt = Date.parse(stored.seenAt), iAt = Date.parse(incoming.seenAt);
  const earlier = iAt < sAt ? incoming : stored;
  const later = earlier === stored ? incoming : stored;
  const esi = rank(incoming.status) >= rank(stored.status) ? incoming : stored;
  const first = earlier.first ?? later.first;
  const next = shape({ ...esi, seenAt: earlier.seenAt, perRun: incoming.perRun ?? stored.perRun, first });
  return JSON.stringify(next) === JSON.stringify(shape(stored)) ? stored : next;
}

/** ESI's rows the writer doesn't hold yet. */
export const newJobs = (raw: readonly RawJob[], stored: Readonly<Record<string, JobRecord>>): RawJob[] =>
  raw.filter((r) => Number.isInteger(r?.job_id) && !stored[String(r.job_id)]);

/** What a writer knows while it reads: the time, units a run by blueprint, its blueprints by item ID, each station's system, the indices, prices and EIV table. */
export type JobsContext = Omit<SightInputs, 'bp' | 'systemId'> & {
  seenAt: string;
  perRun: (blueprintTypeId: number) => number | null;
  bp: (itemId: number) => { me: number; te: number } | null;
  systemOf: (stationId: number) => number | null;
};

/**
 * ESI's list folded onto what the writer holds: each row merged onto its record; one not held is seen now, with its
 * first-sight fields while active (a held job is never sighted again, whatever it shows). The records that changed.
 */
export function readJobs(raw: readonly RawJob[], stored: Readonly<Record<string, JobRecord>>, c: JobsContext): JobRecord[] {
  const out: JobRecord[] = [];
  for (const r of raw) {
    if (!Number.isInteger(r?.job_id)) continue;
    const held = stored[String(r.job_id)];
    let j = toJob(r, c.seenAt, c.perRun(r.blueprint_type_id));
    if (!held) {
      const f = firstSight(j, { bp: c.bp(r.blueprint_id), systemId: c.systemOf(j.stationId), indices: c.indices, adjusted: c.adjusted, eiv: c.eiv });
      if (f) j = shape({ ...j, first: f });
    }
    const m = mergeJob(held, j);
    if (m !== held) out.push(m);
  }
  return out;
}

/** Units a job made: runs × units a run, for manufacturing; null when it isn't manufacturing or units a run aren't known. */
export const jobUnits = (j: JobRecord): number | null => (j.activity === 1 && j.perRun != null ? (j.successfulRuns ?? j.runs) * j.perRun : null);

/**
 * Whether a job can be checked against what EVE charged (jobCheck): first seen running within FIRST_SIGHT_MS of its start,
 * judged by when its first sight was taken (`first.at`; a record from before it was kept falls back to `seenAt`).
 */
export const checkable = (j: JobRecord): boolean => !!j.first && Date.parse(j.first.at ?? j.seenAt) - Date.parse(j.start) <= FIRST_SIGHT_MS;

// --- Blueprints ------------------------------------------------------------------------------------------------------

/** One blueprint as ESI lists it, as a row: item ID, type, where, its flag, quantity (−1 original, −2 copy, n unused), runs (−1 an original), ME, TE. */
export type BpRow = [itemId: number, typeId: number, locationId: number, flag: string, quantity: number, runs: number, me: number, te: number];
/**
 * Your blueprints, sorted by item ID, and the names of the containers, ships and structures they sit in, by location ID
 * (`''`: asked, and it has none, or the structure refused the reader). Absent is not read; an empty list is read.
 */
export type BlueprintsDoc = { list: BpRow[]; names?: Record<string, string> };
/** A document is one D1 row (2 MB at most); 20,000 rows are about 1.2 MB. */
export const MAX_BLUEPRINTS = 20_000;

export const isStationId = (id: number): boolean => id >= 60_000_000 && id < 64_000_000;
export const isStructureId = (id: number): boolean => id >= 1_000_000_000_000;
const isInt = (n: unknown): n is number => Number.isInteger(n);
const okRow = (r: unknown): r is BpRow => Array.isArray(r) && r.length === 8 && isInt(r[0]) && r[0] > 0 && isInt(r[1]) && r[1] > 0 && isInt(r[2])
  && typeof r[3] === 'string' && isInt(r[4]) && r[4] >= -2 && isInt(r[5]) && r[5] >= -1 && isInt(r[6]) && r[6] >= 0 && r[6] <= 10 && isInt(r[7]) && r[7] >= 0 && r[7] <= 20;

function withNames(list: BpRow[], names: Record<string, string> | undefined): BlueprintsDoc {
  const used = new Set(list.map((r) => String(r[2])));
  const kept = Object.entries(names ?? {}).filter(([k, v]) => used.has(k) && typeof v === 'string').sort(([a], [b]) => Number(a) - Number(b));
  return kept.length ? { list, names: Object.fromEntries(kept) } : { list };
}

/** ESI's blueprints as the document, with the names already known for the places they're in. */
export function toBlueprintsDoc(raw: readonly RawBlueprint[], names?: Record<string, string>): BlueprintsDoc {
  const list = raw.map((b): BpRow => [b.item_id, b.type_id, b.location_id, b.location_flag, b.quantity, b.runs, b.material_efficiency, b.time_efficiency])
    .filter(okRow).sort((a, b) => a[0] - b[0]).slice(0, MAX_BLUEPRINTS);
  return withNames(list, names);
}

/** The document as stored or pulled, cleaned: undefined (not read) when it isn't one; a row that isn't one dropped. */
export function sanitizeBlueprints(v: unknown): BlueprintsDoc | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !Array.isArray((v as BlueprintsDoc).list)) return undefined;
  const x = v as { list: unknown[]; names?: unknown };
  const list = x.list.filter(okRow).slice(0, MAX_BLUEPRINTS);
  const names = x.names && typeof x.names === 'object' && !Array.isArray(x.names) ? (x.names as Record<string, string>) : undefined;
  return withNames(list, names);
}

const ownedMemo = new WeakMap<BlueprintsDoc, OwnedBlueprint[]>();
/** The document read as the Blueprints page reads ESI (blueprints.ts readBlueprints). */
export function ownedOf(doc: BlueprintsDoc): OwnedBlueprint[] {
  let hit = ownedMemo.get(doc);
  if (!hit) {
    hit = readBlueprints(doc.list.map((r): RawBlueprint => ({ item_id: r[0], type_id: r[1], location_id: r[2], location_flag: r[3], quantity: r[4], runs: r[5], material_efficiency: r[6], time_efficiency: r[7] })));
    ownedMemo.set(doc, hit);
  }
  return hit;
}

/** A blueprint's ME and TE by its item ID, as last read; null when it isn't held or nothing was read. */
export function bpAt(doc: BlueprintsDoc | undefined, itemId: number): { me: number; te: number } | null {
  const r = doc?.list.find((x) => x[0] === itemId);
  return r ? { me: r[6], te: r[7] } : null;
}

/**
 * A job's blueprint by its item ID for first sight (correction 20): in the read just taken, else in the doc held before it.
 * Whether ESI lists a blueprint while it's installed in a job isn't known; "as last read" is the spec's rule.
 */
export const bpFrom = (fresh: BlueprintsDoc | undefined | null, held: BlueprintsDoc | undefined | null) => (itemId: number): { me: number; te: number } | null =>
  bpAt(fresh ?? undefined, itemId) ?? bpAt(held ?? undefined, itemId);

/** The places the document doesn't name yet: containers and ships (by /assets/names), and structures (by /universe/structures). Stations are named by anyone. */
export function placesToName(doc: BlueprintsDoc): { items: number[]; structures: number[] } {
  const ids = [...new Set(doc.list.map((r) => r[2]))].filter((id) => !(String(id) in (doc.names ?? {}))).sort((a, b) => a - b);
  return { items: ids.filter((id) => !isStationId(id) && !isStructureId(id)), structures: ids.filter(isStructureId) };
}
```

- [ ] **Step 5: The sync's new kind and document**

In `src/lib/cloudSync.ts`:
- `import { mergeJob, type JobRecord } from './industryTrack';`
- `RECORD_KEYS` gains `jobs: 'map',` after `mining: 'map',`.
- `DOC_KEYS` ends `…, 'industry', 'blueprints'] as const;`.
- After `refusedDoc`, add:

```ts
/**
 * The record kind a Worker a version behind refused a push over (worker/src/sync.ts answers 400 "Unknown record kind: X" and
 * takes nothing of that push). The browser sends the rest without that kind's records and keeps them waiting, as refusedDoc
 * does for a document: a new kind never stops the sync while the site deploys before the Worker. Null for any other answer.
 */
export function refusedKind(message: string | undefined | null): RecordKey | null {
  const m = /^Unknown record kind: (\w+)$/.exec(message ?? '');
  return m && isRecordKey(m[1]) ? m[1] : null;
}
```

- In `applyPulled`'s `map` branch, replace `for (const { i, d } of rows) { if (d == null) delete next[i]; else next[i] = d; }` with

```ts
      // A job is kept by several writers: what comes down is merged onto what's here (industryTrack.ts mergeJob), so a
      // record a device built after the job ended never drops the first-sight fields this one holds.
      for (const { i, d } of rows) { if (d == null) delete next[i]; else next[i] = key === 'jobs' ? mergeJob(next[i] as JobRecord | undefined, d as JobRecord) : d; }
```

In `src/lib/cloud.ts`:
- import `refusedKind` beside `refusedDoc` from `'./cloudSync'`, and `sanitizeBlueprints` from `'./industryTrack'`.
- In `pushNow`, `const part = recs.slice(i, i + PUSH_CHUNK);` becomes `let part = recs.slice(i, i + PUSH_CHUNK);`, the
  `catch` becomes

```ts
      } catch (e) {
        // A Worker a version behind doesn't know a new document, or a new record kind, yet, and takes nothing of the push:
        // send the rest without it, and keep it waiting for the next push (refusedDoc, refusedKind).
        const bad = (e as { status?: number }).status === 400, msg = (e as Error).message;
        const doc = bad ? refusedDoc(msg) : null;
        if (doc && withDocs.some(([k]) => k === doc)) { withDocs = withDocs.filter(([k]) => k !== doc); continue; }
        const kind = bad ? refusedKind(msg) : null;
        if (kind && part.some(([key]) => key.startsWith(`${kind}|`))) { part = part.filter(([key]) => !key.startsWith(`${kind}|`)); continue; }
        throw e;
      }
```

  and after the loop `if (!res) break;` becomes `if (!res) continue;` (a chunk that was all a refused kind leaves the
  later chunks to be sent).
- In `pullNow`'s sanitizers, after the `industry` line: `if (p.blueprints !== undefined) p.blueprints = sanitizeBlueprints(p.blueprints);`.

In `src/lib/types.ts`, in `Meta` after `research?: …`:

```ts
  /** When your blueprints were last read (the `blueprints` doc: the main's, by the sync). An alt's read time is its `sheet` job's. */
  blueprintsAt?: string;
  /**
   * Jobs have been read at least once by a stage-2 read (the main's by its sync, an alt's by the cloud's sheet): a read with
   * no jobs writes no record, so absent is not read. `industry` isn't a jobs read: every ledger from before had one.
   */
  jobsRead?: true;
```

In `src/lib/store.ts`: import `sanitizeBlueprints, type BlueprintsDoc, type JobRecord` from `'./industryTrack'`; `Data`
gains

```ts
  /** Your industry jobs, every status, kept past ESI's 90 days (industryTrack.ts): records of kind `jobs`, by job ID. */
  jobs: Record<string, JobRecord>;
  /** Your blueprints as last read (industryTrack.ts BlueprintsDoc). Absent: not read yet. */
  blueprints?: BlueprintsDoc;
```

`KEYS` ends `…, 'chars', 'industry', 'jobs', 'blueprints',`; in `initStore` after the `industry` line,
`data.blueprints = sanitizeBlueprints(data.blueprints);`; in `importAll` after the `industry` line,
`if (p.blueprints !== undefined) p.blueprints = sanitizeBlueprints(p.blueprints);`.

In `src/lib/emptyData.ts`: `industry: { ...DEFAULT_INDUSTRY }, jobs: {},` (no `blueprints`: absent is not read).

In `worker/src/sync.ts`: `DOC_KEYS` gains `'blueprints'`, its comment "`blueprints` is your blueprints as last read (the
Industry tab, the Blueprints page)". `RECORD_KINDS` is left alone (Task 9B).

In `src/lib/altLedger.ts`: import `sanitizeBlueprints` from `'./industryTrack'`, and in the ledger built:
`mining: rec('mining'), jobs: rec('jobs'),` and after `stock: …`:
`blueprints: saved.docs.blueprints === undefined ? undefined : sanitizeBlueprints(saved.docs.blueprints),`.

In `src/components/Settings.tsx`, `KIND_SAID` gains `jobs: ['industry job', 'industry jobs'],` (Your data lists what the
cloud holds by kind; without it a ledger reads "1 jobs", beside the cloud's own jobs).

In `src/components/Todo.tsx`: delete the local `ACTIVITY` constant and its comment; import `ACTIVITY_SAID` from
`'../lib/industryTrack'`; `ACTIVITY[j.activity]` becomes `ACTIVITY_SAID[j.activity]`.

- [ ] **Step 6: The main's reads in the browser**

Create `src/lib/industryReads.ts`:

```ts
import type { RawBlueprint } from './blueprints';
import { esi, esiAllPages } from './esi';
import { adjustedPricesShared, industrySystemsShared } from './market';
import { bpFrom, isStationId, isStructureId, newJobs, placesToName, readJobs, toBlueprintsDoc, type BlueprintsDoc, type JobRecord, type RawJob } from './industryTrack';
import { station, structureInfo } from './universe';

/**
 * The main's blueprints and industry jobs, read in the browser (the sync, and the Blueprints page's button): the I/O around
 * industryTrack.ts's rules. An alt's are read by the cloud (worker/src/industryJobs.ts), never here.
 */

/** industryEiv.json: every published blueprint's ME 0 materials and its product, units a run (scripts/industry-bundle.mjs). */
export type EivFile = { build: number; eiv: Record<string, [number, number][]>; out: Record<string, [number, number]> };
let eivP: Promise<EivFile> | null = null;
/** A chunk of its own, loaded the first time a job not held yet turns up, and kept. A failed load is asked again next time. */
export const loadEiv = (): Promise<EivFile> =>
  (eivP ??= import('../data/industryEiv.json').then((m) => m.default as unknown as EivFile).catch((e) => { eivP = null; throw e; }));

/**
 * Your blueprints, with the places they sit in named once each (asked only for a place not named yet): a container or ship
 * by the name you gave it (`/assets/names`, with the assets permission; ESI's "None" is no name), a structure by its own
 * (`/universe/structures`, with the structures permission). `''` marks a place asked and found nameless, so it isn't asked
 * again. A failed name lookup is asked again on the next read.
 */
export async function readBlueprintsNow(cid: number, prev: BlueprintsDoc | undefined, can: { assets: boolean; structures: boolean }): Promise<BlueprintsDoc> {
  const raw = await esiAllPages<RawBlueprint>(`/characters/${cid}/blueprints/`, { auth: true });
  const draft = toBlueprintsDoc(raw, prev?.names);
  const want = placesToName(draft);
  const names: Record<string, string> = { ...(draft.names ?? {}) };
  if (can.assets) {
    for (let i = 0; i < want.items.length; i += 1000) {
      const part = want.items.slice(i, i + 1000);
      try {
        const { data } = await esi<{ item_id: number; name: string }[]>(`/characters/${cid}/assets/names/`, { auth: true, method: 'POST', body: part });
        const got = new Map(data.map((n) => [n.item_id, n.name]));
        for (const id of part) { const n = got.get(id); names[String(id)] = n && n !== 'None' ? n : ''; }
      } catch { /* named on a later read */ }
    }
  }
  if (can.structures) {
    for (const id of want.structures) {
      const s = await structureInfo(id).catch(() => null);
      if (s?.status === 'found') names[String(id)] = s.name;
      else if (s?.status === 'refused') names[String(id)] = '';
    }
  }
  return toBlueprintsDoc(raw, names);
}

/**
 * Your jobs, every status for 90 days (`include_completed`), folded onto what's held (industryTrack.ts readJobs). What a new
 * job needs is read only when one turns up: industryEiv.json (units a run, ME 0 materials), and for one running, ESI's
 * indices, CCP's adjusted prices and its station's system. A lookup that fails leaves that field not known, never 0.
 */
export async function readJobsNow(cid: number, stored: Record<string, JobRecord>, bps: BlueprintsDoc | undefined, heldBps: BlueprintsDoc | undefined): Promise<{ raw: RawJob[]; changed: JobRecord[] }> {
  const { data: raw } = await esi<RawJob[]>(`/characters/${cid}/industry/jobs/`, { auth: true, query: { include_completed: 'true' } });
  const fresh = newJobs(raw, stored);
  const eiv = fresh.length ? await loadEiv().catch(() => null) : null;
  const running = fresh.filter((r) => r.status === 'active');
  const [indices, adjusted] = running.length
    ? await Promise.all([industrySystemsShared().catch(() => null), adjustedPricesShared().catch(() => null)])
    : [null, null];
  const systems = new Map<number, number | null>();
  for (const id of new Set(running.map((r) => r.station_id))) {
    if (isStationId(id)) systems.set(id, (await station(id).catch(() => null))?.systemId ?? null);
    else if (isStructureId(id)) { const s = await structureInfo(id).catch(() => null); systems.set(id, s?.status === 'found' ? s.systemId : null); }
  }
  const changed = readJobs(raw, stored, {
    seenAt: new Date().toISOString(), perRun: (bp) => eiv?.out[String(bp)]?.[1] ?? null, bp: bpFrom(bps, heldBps),
    systemOf: (id) => systems.get(id) ?? null, indices, adjusted, eiv: eiv?.eiv ?? null,
  });
  return { raw, changed };
}
```

In `src/lib/sync.ts`:
- import `readBlueprintsNow, readJobsNow` from `'./industryReads'`, `mergeJob, type BlueprintsDoc, type JobRecord, type RawJob`
  from `'./industryTrack'`;
- `fetched` gains `jobs?: JobRecord[]; blueprints?: BlueprintsDoc;`;
- replace the whole `// Industry jobs not yet delivered…` block with:

```ts
    // Your blueprints (the `blueprints` doc: what each is, ME, TE, runs, where), for the Industry tab and the Blueprints page,
    // with when they were read. Written only when something in it changed. A failed read leaves what's held (absent: not read).
    let bpsNow = d.blueprints;
    if (hasScope(SCOPE.blueprints)) {
      setState({ message: 'Reading your blueprints…' });
      try {
        fetched.blueprints = await readBlueprintsNow(cid, d.blueprints, { assets: hasScope(ASSETS), structures: hasScope(SCOPE.structures) });
        bpsNow = fetched.blueprints;
        metaPatch.blueprintsAt = new Date().toISOString();
        read.push('blueprints');
      } catch { /* read on a later sync */ }
    }
    // Your industry jobs, every status for 90 days, kept as records past that (industryTrack.ts: a job not held yet gets its
    // first-sight fields while it runs). To do's jobs to deliver come from the same read, with their facilities named.
    if (hasScope(SCOPE.industry)) {
      setState({ message: 'Reading your industry jobs…' });
      try {
        // The blueprints read just now, else the doc held before it (correction 20): a blueprint in a job may not be listed.
        const r = await readJobsNow(cid, d.jobs, bpsNow, d.blueprints);
        fetched.jobs = r.changed;
        metaPatch.jobsRead = true;
        const waiting = r.raw.filter((j: RawJob) => j.status === 'active' || j.status === 'ready' || j.status === 'paused').map((j) => ({
          jobId: j.job_id, activity: j.activity_id, blueprintTypeId: j.blueprint_type_id, productTypeId: j.product_type_id ?? null, runs: j.runs,
          end: j.end_date, status: j.status, stationId: j.station_id ?? j.facility_id,
        }));
        const places: Record<number, string> = { ...(d.meta.industry?.places ?? {}) };
        const unknown = [...new Set(waiting.map((j) => j.stationId))].filter((id) => !places[id]);
        const stations = unknown.filter(isStation);
        if (stations.length) Object.assign(places, await resolveNames(stations).catch(() => ({})));
        for (const id of unknown.filter(isStructure)) { const s = await structureInfo(id).catch(() => null); if (s?.status === 'found') places[id] = s.name; }
        metaPatch.industry = { at: new Date().toISOString(), jobs: waiting, places };
        read.push('industry');
      } catch { /* To do and the tab go without */ }
    }
```

- in the final `update((cur) => …)`, after the `mining` block:

```ts
      // Jobs are merged onto what the store holds now (a pull may have brought the cloud's record meanwhile).
      if (fetched.jobs?.length) {
        const j = { ...cur.jobs };
        for (const x of fetched.jobs) j[String(x.jobId)] = mergeJob(cur.jobs[String(x.jobId)], x);
        p.jobs = j;
      }
      if (fetched.blueprints && JSON.stringify(fetched.blueprints) !== JSON.stringify(cur.blueprints)) p.blueprints = fetched.blueprints;
```

- [ ] **Step 7: Run the tests to see them pass, then plant each rule wrong**

Run: `npm run check 2>&1 | tail -30`
Expected: no `FAIL`.

Plant, run, see it fail, undo:
- `mergeJob`: `const first = incoming.first;`: "merged either way round" fails.
- `mergeJob`: `const esi = incoming;`: "a stale read never moves a delivered job back" fails.
- `firstSight`: drop `if (j.status !== 'active') return undefined;`: "a job first seen after it ended has none" fails.
- `eivBlueprintOf`: return `j.blueprintTypeId` always: "invention's EIV is the Tech II blueprint's" fails.
- `readJobs`: sight held jobs too (`if (!held)` → `if (true)`): "a held job isn't sighted again" fails.
- `FIRST_SIGHT_MS = 60 * 60_000`: "checked only when first seen running within 90 minutes" fails.
- `checkable`: judge by `j.seenAt`: "a first sight taken later than the first seeing is judged by its own time" fails.
- `bpFrom`: drop `?? bpAt(held …)`: "first sight looks in the fresh read, then in the doc held before it" fails.
- `applyPulled`: back to `next[i] = d`: "a job that comes down without its first-sight fields" fails (the other direction
  passes either way: a record with them replacing one without; the Worker's half is Task 9B's).
- `refusedKind`: drop `isRecordKey(m[1]) &&` (`return m ? m[1] : null`): "a refused kind is named; anything else isn't" fails.

- [ ] **Step 8: The rule and the note**

`.claude/rules/industry.md`'s first `paths:` line becomes
`  - "src/lib/{industry,industryRank,industrySites,industryLadder,industryTrack,industryReads,homeMarket,altFees,nameReader}.ts"`.

Append to `docs/notes/industry.md` a section **Stage 2: blueprints and jobs** with these bullets (each as a decision with
its evidence, the note's style):
- **Jobs are records, blueprints a document** (`jobs` by job ID, `blueprints`), and the shapes (`JobRecord`,
  `BlueprintsDoc`), pinned to ESI's OpenAPI at 2026-08-18: the first real read by the browser (2026-08-18) and by the
  Worker (2025-08-26) is the check; record what it shows.
- **First sight** (`FIRST_SIGHT_MS` 90 minutes, `firstSight`): what's kept only while a job runs, invention's EIV on the
  Tech II blueprint it makes, nothing not known as 0.
- **Every writer merges** (`mergeJob`): first-sight fields never dropped, earliest `seenAt`, ESI's fields by status order
  (correction 5 and why), the pull merging in `applyPulled` (correction 6).
- **Units a run** (`industryEiv.json` `out`, correction 1), with the size the script printed.
- **One read of the main's jobs** feeds `meta.industry` and the records (correction 2); what marks jobs read
  (`meta.jobsRead`, written by the main's sync and an alt's sheet; never a stage-1 `meta.industry`, correction 3).
- **First sight's blueprint and time**: the fresh read, else the doc held before it (`bpFrom`, correction 20); the sighting's
  own time in `first.at`, which `checkable` judges by (correction 21).
- **The blueprints document's `names`** (correction 4).
- **A new record kind and a Worker a version behind** (`refusedKind`): as `refusedDoc`, and the chunk loop now carries on
  past a chunk that was all a refused kind.

Add to `docs/notes/cloud.md`, after the `refusedDoc` bullet: "**A new record kind doesn't stop the sync either**
(`refusedKind` in cloudSync.ts, `pushNow`; 11 October 2026, with `jobs`): the Worker refuses a whole push carrying a kind
it doesn't know (400 "Unknown record kind: X"); the browser sends the rest without that kind's records, which wait for a
later push, and goes on to the next chunk when a whole chunk was that kind. An older browser ignores a kind it doesn't
know when it comes down (`isRecordKey`). A kind several writers keep (`jobs`) is merged, not replaced, when it comes down
(`applyPulled`)."

- [ ] **Step 9: The page case: a Worker a version behind**

In `scripts/pages.mjs`, above `// --- the end of the industry case`, add:

```js
    // --- Task 9A: a Worker a version behind refuses the new record kind. The rest of the push goes up, the jobs wait.
    {
      const pushes = [];
      // The case's own stand-ins for these two, put back at the end of the block.
      const prevPush = CLOUD['/v1/push'], prevPull = CLOUD['/v1/pull'];
      CLOUD['/v1/push'] = (url, req, json) => {
        const b = JSON.parse(req.postData() ?? '{}');
        pushes.push(b);
        return (b.records ?? []).some((r) => r.k === 'jobs') ? json({ error: 'Unknown record kind: jobs' }, 400) : json({ rev: 2, records: (b.records ?? []).length, docs: (b.docs ?? []).length });
      };
      CLOUD['/v1/pull'] = (url, req, json) => json({ rev: 2, records: [], docs: [], next: null });
      const job = { jobId: 9001, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 10, licensedRuns: 40, successfulRuns: null, probability: null, cost: 1200000,
        facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: iso(now - 7200_000), end: iso(now + 3600_000), completed: null, status: 'active', perRun: 1, seenAt: iso(now - 7000_000) };
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, jobs: { 9001: job }, names: { 34: 'Tritanium' }, cloud: { ...CLOUD_STATE, dirty: { r: ['jobs|9001', 'names|34'], d: ['industry'] } } }, { alts: altStore });
      // From the seed page, a full load: the sync starts on the seeded unsent list. Wait on the condition, never a clock
      // (pre-flight M13): the saved unsent list (`cloud`, written 500 ms after a push) has let go of what went up.
      await page.goto(`${BASE}#hustles/industry/start`);
      const cloudState = () => page.evaluate(() => new Promise((res) => { const q = indexedDB.open('jita-ledger'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('cloud'); g.onsuccess = () => res(g.result); }; }));
      let state = await cloudState();
      for (let i = 0; i < 80 && (state?.dirty?.r ?? ['names|34']).includes('names|34'); i++) { await page.waitForTimeout(250); state = await cloudState(); }
      const sent = pushes.find((b) => !(b.records ?? []).some((r) => r.k === 'jobs'));
      if (!pushes.some((b) => (b.records ?? []).some((r) => r.k === 'jobs'))) problems.push('the push with a job never went up');
      if (!sent || !(sent.records ?? []).some((r) => r.k === 'names' && r.i === '34') || !(sent.docs ?? []).some((x) => x.key === 'industry'))
        problems.push(`with the jobs kind refused, the rest of the push didn’t go up: ${JSON.stringify(pushes).slice(0, 300)}`);
      if (!state?.dirty?.r?.includes('jobs|9001') || state.dirty.r.includes('names|34')) problems.push(`the refused job isn’t kept waiting (or what went up is): ${JSON.stringify(state?.dirty)}`);
      CLOUD['/v1/push'] = prevPush; CLOUD['/v1/pull'] = prevPull;
    }
```

- [ ] **Step 10: The checks**

Run: `npm run check && npm run build && LEDGER=industry npm run check-pages && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass; `git status --short scripts/income-golden.json` prints nothing. A look: with the dev server and the
main logged in for real is not possible here, so the look is the page case's own screenshots
(`SHOTS=.playwright-mcp/industry2/9a LEDGER=industry npm run check-pages`): Start draws as before.

- [ ] **Step 11: Commit**

```bash
git add scripts/industry-bundle.mjs src/data/industryEiv.json src/lib/industryTrack.ts src/lib/industryReads.ts src/lib/cloudSync.ts src/lib/cloud.ts src/lib/store.ts src/lib/emptyData.ts src/lib/types.ts src/lib/sync.ts src/lib/altLedger.ts src/components/Todo.tsx src/components/Settings.tsx worker/src/sync.ts scripts/check.mjs scripts/check-worker.mjs scripts/pages.mjs .claude/rules/industry.md docs/notes/industry.md docs/notes/cloud.md
git commit -m "$(cat <<'EOF'
Industry stage 2: jobs kept as records, blueprints as a document, the main's read in the browser

The tab had no way to know what a character holds or has running: the sync read only the jobs waiting to be delivered,
for To do, and the Blueprints page read blueprints into its own state and kept nothing. Jobs are now records of their
own (kind `jobs`, by job ID, every status, kept past ESI's 90 days) and blueprints a synced document. What only a writer
who saw a job running can know (its blueprint's ME and TE, the system's index, the EIV) is kept at first sight, and every
writer merges onto what it holds, so a browser that first sees a job after it ended can't drop it (tested both ways).

A Worker a version behind refuses a whole push carrying a kind it doesn't know; refusedKind holds those records back and
sends the rest, as refusedDoc does for documents (the page case stubs that Worker). industryEiv.json gains each blueprint's
product and units a run: ESI's job doesn't say how many units it made, and built-and-sold claims sales by them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
)"
```

---
### Task 9B: The cloud keeps jobs and blueprints: the push merges, the archive reads the main's jobs, the sheet an alt's

**Files:**
- Create: `worker/src/industryJobs.ts`
- Modify: `worker/src/sync.ts` (`RECORD_KINDS` `'jobs'`, merged on push), `worker/src/archive.ts` (the main's jobs;
  `storedRecords` exported), `worker/src/sheet.ts` (an alt's blueprints and jobs), `scripts/check-worker.mjs`,
  `scripts/pages.mjs` (the browser's half of correction 19), `CLAUDE.md` (the Worker's imported rules),
  `.claude/rules/industry.md`, `docs/notes/industry.md`, `docs/notes/cloud.md`, `docs/notes/characters-cloud.md`

**Interfaces:**
- Consumes: from Task 9A, `mergeJob`, `readJobs`, `newJobs`, `toBlueprintsDoc`, `placesToName`, `bpAt`, `bpFrom`,
  `sanitizeBlueprints`, `isStationId`, `isStructureId`, `type JobRecord`, `type RawJob`, `type BlueprintsDoc`
  (`src/lib/industryTrack.ts`); `industryEiv.json`'s `out`; `parseIndices` (`src/lib/industry.ts`); `esiGet`, `esiAll`,
  `esiPost`, `EveError` (`worker/src/eve.ts`).
- Produces:
  - `worker/src/industryJobs.ts`: `SCOPE_JOBS`, `SCOPE_BLUEPRINTS`, `readJobsFor(char, token, o): Promise<JobRecord[]>`
    (`o: { bps: BlueprintsDoc | null; held?: BlueprintsDoc | null; stored: (ids: string[]) => Promise<Map<string, JobRecord>>; now?: number }`;
    `held`: the doc before this read, correction 20),
    `readBlueprintsFor(char, token, scopes, prev): Promise<BlueprintsDoc>`.
  - `worker/src/archive.ts`: `storedRecords` exported; `ArchiveResult.jobs?: number`.
  - D1: an alt's `blueprints` doc and `jobs` records under the alt; its meta doc's `jobsRead: true` once its jobs were read.
  - `push` (worker/src/sync.ts): a `jobs` row the merge changed from what was pushed is written at a revision of its own,
    after the push's; the push reports its own (correction 19).

**Ship-safety.** A browser a version behind never sends `jobs` (it doesn't know the kind) and ignores one that comes down
(`isRecordKey`); the Worker accepting `jobs` changes nothing for it. The Worker imports `industryEiv.json` (its second JSON
import, `with { type: 'json' }`, as Task 5 of stage 1 did for `industryTypes.json`; `worker/tsconfig.json` already has
`resolveJsonModule`).

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check-worker.mjs`, before its final `console.log(failed ? …)`:

```js
console.log('\n--- Industry stage 2: jobs and blueprints in the cloud (Task 9B) ---');
{
  const FXI = JSON.parse(fs.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8'));
  const { push, pull } = await import('../worker/src/sync.ts');
  const { archive } = await import('../worker/src/archive.ts');
  const { readAlt } = await import('../worker/src/alts.ts');
  const { altReader, ledgerReader } = await import('../worker/src/eve.ts');
  const docOf = (db, char, key) => { const r = db.rows('SELECT data FROM docs WHERE char_id = ? AND key = ?', char, key)[0]; return r ? JSON.parse(r.data) : null; };
  const jobOf = (db, char, id) => { const r = db.rows(`SELECT data FROM records WHERE char_id = ? AND kind = 'jobs' AND id = ?`, char, String(id))[0]; return r ? JSON.parse(r.data) : null; };
  const rev = (db, char) => db.rows('SELECT rev FROM revs WHERE char_id = ?', char)[0]?.rev ?? 0;
  const IND = [...SCOPES, 'esi-industry.read_character_jobs.v1', 'esi-characters.read_blueprints.v1', 'esi-universe.read_structures.v1'];
  const START = new Date(Date.now() - 20 * 60_000).toISOString(), END = new Date(Date.now() + 6 * 3600_000).toISOString();
  const rawJob = (char, over = {}) => ({ job_id: 801, installer_id: char, facility_id: 60003760, station_id: 60003760, activity_id: 1, blueprint_id: 7001, blueprint_type_id: 25895,
    blueprint_location_id: 60003760, output_location_id: 60003760, runs: 65, status: 'active', duration: 66000, start_date: START, end_date: END, product_type_id: 25894, licensed_runs: 40, cost: 17213916, ...over });
  const rawBp = (over = {}) => ({ item_id: 7001, type_id: 25895, location_id: 1030000001, location_flag: 'Hangar', quantity: -1, runs: -1, material_efficiency: 10, time_efficiency: 20, ...over });
  /** ESI as the industry reads need it, ahead of esiFor's (the first matching route answers). */
  const industryRoutes = (char, over = {}) => [
    [`/characters/${char}/industry/jobs/`, over.jobs ?? [rawJob(char)]],
    [`/characters/${char}/blueprints/`, over.blueprints ?? [rawBp()]],
    [new RegExp(`^POST /characters/${char}/assets/names/$`), over.names ?? [{ item_id: 1030000001, name: 'Blueprints' }]],
    ['/industry/systems/', FXI.systems],
    ['/markets/prices/', Object.entries(FXI.adjusted).map(([t, p]) => ({ type_id: Number(t), adjusted_price: p, average_price: p }))],
    ['/universe/stations/60003760/', { system_id: 30000142, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' }],
  ];
  const jitaIndex = 0.1651, pumpEiv = 157590413.44605502 / 65;

  // The push: a job is merged onto D1's record, never written over it.
  {
    const db = d1();
    const first = { me: 10, te: 20, systemId: 30000142, index: jitaIndex, eiv: pumpEiv };
    const seen = { jobId: 801, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 65, licensedRuns: 40, successfulRuns: null, probability: null, cost: 17213916,
      facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: START, end: END, completed: null, status: 'active', perRun: 1, seenAt: START, first };
    await push(db, MAIN, { records: [{ k: 'jobs', i: '801', d: seen }], docs: [] });
    const late = { ...seen, status: 'delivered', completed: END, seenAt: END };
    delete late.first;
    const p2 = await push(db, MAIN, { records: [{ k: 'jobs', i: '801', d: late }], docs: [] });
    const got = jobOf(db, MAIN, 801);
    eq('  a jobs record is taken now, and one pushed without first-sight fields is merged onto D1\'s, never over it',
      [got.first, got.seenAt, got.status, got.completed], [first, START, 'delivered', END]);
    // The pushing browser skips its push's revision when it pulls (ownRevs), so what the merge added has to come at another.
    const pulled = async () => (await pull(db, MAIN, 0, null)).records.find((r) => r.k === 'jobs' && r.i === '801');
    const row2 = await pulled();
    eq('    written at a revision of its own after the push\'s, so the browser that pushed it pulls the merged job', [row2.r > p2.rev, row2.d.first], [true, first]);
    const p3 = await push(db, MAIN, { records: [{ k: 'jobs', i: '801', d: got }], docs: [] });
    eq('    a job pushed as D1 holds it is written at the push\'s own revision (no revision spent)', (await pulled()).r, p3.rev);
  }

  // The main's jobs, read by the hourly archive: first sight from the blueprints doc its browser keeps.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', 'main');
    await keepKey(db, MAIN, 'main', MAIN, 'Main', IND);
    await push(db, MAIN, { records: [], docs: [{ key: 'blueprints', d: { list: [[7001, 25895, 1030000001, 'Hangar', -1, -1, 10, 20]] } }] });
    let f = stubFetch([...industryRoutes(MAIN), ...esiFor(MAIN)]);
    const r = await archive(env, ledgerReader(MAIN));
    f.restore();
    const j = jobOf(db, MAIN, 801);
    eq('  the main\'s job kept under the main, seen running: its blueprint\'s ME and TE from the doc, Jita\'s index, the EIV a run',
      [r.jobs, j.perRun, j.first.me, j.first.te, j.first.systemId, j.first.index, Math.round(j.first.eiv * 65)], [1, 1, 10, 20, 30000142, jitaIndex, 157590413]);
    // The call is what's pinned (esiFor has no blueprints route, so a read would 404 and be swallowed).
    eq('    the archive reads no blueprints for the main (its browser does)', f.calls.some((c) => /\/blueprints\/$/.test(c.path)), false);
    const jobRev = () => db.rows(`SELECT rev FROM records WHERE char_id = ? AND kind = 'jobs' AND id = '801'`, MAIN)[0].rev;
    const r0 = jobRev();
    f = stubFetch([...industryRoutes(MAIN), ...esiFor(MAIN)]);
    await archive(env, ledgerReader(MAIN));
    f.restore();
    eq('    read again unchanged: the job isn\'t pushed again, and nothing new is sighted (no indices read)',
      [jobRev(), f.calls.some((c) => c.path === '/industry/systems/')], [r0, false]);
    f = stubFetch([...industryRoutes(MAIN, { jobs: [rawJob(MAIN, { status: 'delivered', completed_date: END })] }), ...esiFor(MAIN)]);
    await archive(env, ledgerReader(MAIN));
    f.restore();
    eq('    delivered: the status moves, the first sight stays', [jobOf(db, MAIN, 801).status, jobOf(db, MAIN, 801).first.me], ['delivered', 10]);
  }

  // An alt's blueprints and jobs, read by its hourly sheet, filed under it.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', IND);
    const main = under(db, MAIN);
    let f = stubFetch([...industryRoutes(ALT), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt\'s blueprints: its doc, its container named, no read time in it', docOf(db, ALT, 'blueprints'), { list: [[7001, 25895, 1030000001, 'Hangar', -1, -1, 10, 20]], names: { 1030000001: 'Blueprints' } });
    eq('    its job under it, sighted with its own blueprint\'s ME', [jobOf(db, ALT, 801)?.first?.me, docOf(db, ALT, 'meta').jobsRead], [10, true]);
    eq('    read once, by the sheet: the archive doesn\'t read an alt\'s jobs', f.calls.filter((c) => /\/industry\/jobs\/$/.test(c.path)).length, 1);
    eq('    nothing of it under the main', under(db, MAIN), main);
    const r1 = rev(db, ALT);
    f = stubFetch([...industryRoutes(ALT), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  read again unchanged: no new revision, and the container isn\'t named again', [rev(db, ALT), f.calls.some((c) => c.method === 'POST' && /assets\/names/.test(c.path) && String(c.body).includes('1030000001'))], [r1, false]);
    f = stubFetch([...industryRoutes(ALT, { jobs: new Response('{"error":"down"}', { status: 500 }) }), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  a jobs read that fails leaves what was held, and the sheet still counts as read', [jobOf(db, ALT, 801)?.first?.me, db.rows(`SELECT fails FROM jobs WHERE char_id = ? AND job = 'sheet'`, ALT)[0].fails], [10, 0]);
  }

  // A running job's blueprint may be missing from the read just taken: the doc held before stands in (correction 20).
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', IND);
    await push(db, ALT, { records: [], docs: [{ key: 'blueprints', d: { list: [[7001, 25895, 1030000001, 'Hangar', -1, -1, 10, 20]] } }] });
    const f = stubFetch([...industryRoutes(ALT, { blueprints: [] }), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt\'s job whose blueprint this read doesn\'t list is sighted with the ME held before it', jobOf(db, ALT, 801)?.first?.me, 10);
  }

  // A login handed over without the permissions: nothing asked, nothing written, no mark.
  {
    const { db, env } = await ledgerWithAlt();
    const f = stubFetch([...industryRoutes(ALT), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt whose login lacks them: not asked; no blueprints doc, no jobs, no jobsRead (not "none")',
      [f.calls.some((c) => /\/industry\/jobs\/$|\/blueprints\/$/.test(c.path)), docOf(db, ALT, 'blueprints'), jobOf(db, ALT, 801), 'jobsRead' in (docOf(db, ALT, 'meta') ?? {})], [false, null, null, false]);
  }

  // Taken off the roster while its jobs were read: nothing of it goes back in.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', IND);
    const routes = [...industryRoutes(ALT), ...esiFor(ALT)];
    routes[0] = [`/characters/${ALT}/industry/jobs/`, () => { db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`); return [rawJob(ALT)]; }];
    const f = stubFetch(routes);
    await readAlt(env, altReader(MAIN, ALT)).catch(() => undefined);
    f.restore();
    eq('  an alt removed mid-read gets no jobs and no blueprints doc', [jobOf(db, ALT, 801), docOf(db, ALT, 'blueprints')], [null, null]);
  }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -A3 "Task 9B"`
Expected: "Unknown record kind: jobs" from the push; `r.jobs` undefined; no blueprints doc under the alt.

- [ ] **Step 3: The push merges `jobs`**

In `worker/src/sync.ts`: `import { mergeJob, type JobRecord } from '../../src/lib/industryTrack';`; `RECORD_KINDS` gains
`'jobs'`; above `push`, add

```ts
/** The stored records of one kind with these IDs, 90 at a time (D1 binds at most 100 parameters). */
async function storedOf(db: D1Database, charId: number, kind: string, ids: string[]): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT id, data FROM records WHERE char_id = ?1 AND kind = ?2 AND id IN (${part.map((_, n) => `?${n + 3}`).join(',')})`)
      .bind(charId, kind, ...part).all<{ id: string; data: string | null }>()).results;
    for (const r of rows) if (r.data) out.set(r.id, JSON.parse(r.data));
  }
  return out;
}
```

and in `push`, replace from `const rows: { k: string; i: string; d: string | null }[] = [];` through the
`for (const doc of docs) if (!DOC_KEYS.has(doc.key)) …` line with

```ts
  // A job is kept by several writers (the browser's sync, the archive, the sheet): merged onto D1's record, never written
  // over it (industryTrack.ts mergeJob), so a device that first saw a job after it ended can't drop what was seen while it ran.
  for (const r of records) if (!RECORD_KINDS.has(r.k)) throw new BadRequest(`Unknown record kind: ${r.k}`);
  for (const doc of docs) if (!DOC_KEYS.has(doc.key)) throw new BadRequest(`Unknown document: ${doc.key}`);
  const jobIds = records.filter((r) => r.k === 'jobs' && r.d != null && typeof r.i === 'string').map((r) => r.i);
  const heldJobs = jobIds.length ? await storedOf(db, charId, 'jobs', jobIds) : new Map<string, unknown>();
  // `later`: jobs the merge changed from what was pushed (correction 19), written at a revision of their own below.
  const rows: { k: string; i: string; d: string | null }[] = [], later: typeof rows = [];
  for (const r of records) {
    if (typeof r.i !== 'string' || !r.i || r.i.length > 200) throw new BadRequest('A record needs an ID');
    const value = r.k === 'jobs' && r.d != null ? mergeJob(heldJobs.get(r.i) as JobRecord | undefined, r.d as JobRecord) : r.d;
    const d = value == null ? null : JSON.stringify(value);
    if (d && d.length > MAX_RECORD_BYTES) throw new BadRequest(`A ${r.k} record is too large (${d.length} bytes)`);
    (r.k === 'jobs' && r.d != null && d !== JSON.stringify(r.d) ? later : rows).push({ k: r.k, i: r.i, d });
  }
```

(both refusals now run before any read, so a refused push reads nothing; the messages are unchanged, which
`refusedDoc` and `refusedKind` match). Then the statements: replace from `let chunk: typeof rows = [], size = 0;` through
`return { rev, records: rows.length, docs: docs.length };` with

```ts
  let chunk: typeof rows = [], size = 0;
  const flush = () => { if (chunk.length) stmts.push(upsert.bind(charId, now, JSON.stringify(chunk))); chunk = []; size = 0; };
  const queue = (list: typeof rows) => {
    for (const r of list) {
      const n = (r.d?.length ?? 4) + r.i.length + 40;
      if (size + n > CHUNK_BYTES) flush();
      chunk.push(r); size += n;
    }
    flush();
  };
  queue(rows);
  const setDoc = db.prepare(`
    INSERT INTO docs (char_id, key, data, rev, updated_at) VALUES (?1, ?2, ?3, ${REV}, ?4)
    ON CONFLICT(char_id, key) DO UPDATE SET data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at`);
  for (const doc of docs) stmts.push(setDoc.bind(charId, doc.key, JSON.stringify(doc.d ?? null), now));
  const read = stmts.length;
  stmts.push(db.prepare('SELECT rev FROM revs WHERE char_id = ?1').bind(charId));
  // A job the merge changed from what was pushed (D1 held first-sight fields the pushed record lacked) goes at a revision of
  // its own, after the push's: the browser that pushed skips its own revision when it pulls (ownRevs), and every browser,
  // one built before this too, pulls this one (correction 19). Same transaction; the push reports its own revision.
  if (later.length) {
    stmts.push(db.prepare('UPDATE revs SET rev = rev + 1 WHERE char_id = ?1').bind(charId));
    queue(later);
  }
  const results = await db.batch<{ rev: number }>(stmts);
  const rev = results[read].results[0].rev;
  return { rev, records: rows.length + later.length, docs: docs.length };
```

- [ ] **Step 4: `worker/src/industryJobs.ts`**

Create it:

```ts
/**
 * Industry jobs and blueprints, read by the cloud (docs/notes/industry.md, stage 2): the main's jobs in the hourly archive
 * (its blueprints are its browser's to read), an alt's blueprints and jobs in its hourly sheet. The rules are the browser's
 * own (src/lib/industryTrack.ts); this is the I/O around them, with the reader's login.
 */
import EIV from '../../src/data/industryEiv.json' with { type: 'json' };
import type { RawBlueprint } from '../../src/lib/blueprints';
import { parseIndices, type IndustryIndex } from '../../src/lib/industry';
import { bpFrom, isStationId, isStructureId, newJobs, placesToName, readJobs, toBlueprintsDoc, type BlueprintsDoc, type JobRecord, type RawJob } from '../../src/lib/industryTrack';
import { esiAll, esiGet, esiPost, EveError } from './eve';

export const SCOPE_JOBS = 'esi-industry.read_character_jobs.v1';
export const SCOPE_BLUEPRINTS = 'esi-characters.read_blueprints.v1';
const SCOPE_ASSETS = 'esi-assets.read_assets.v1';
const SCOPE_STRUCTURES = 'esi-universe.read_structures.v1';
const E = EIV as unknown as { eiv: Record<string, [number, number][]>; out: Record<string, [number, number]> };

/** CCP's adjusted prices (/markets/prices/, no login): what a job's EIV is worked out on. */
async function adjustedPrices(): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  for (const p of (await esiGet<{ type_id: number; adjusted_price?: number }[]>('/markets/prices/')).data) if (p.adjusted_price) out[p.type_id] = p.adjusted_price;
  return out;
}

/**
 * A character's jobs, every status for 90 days, folded onto what D1 holds (`stored`). Units a run come from the bundled
 * table for every row; what a job not held yet needs to be sighted (the indices, the prices, its station's system) is read
 * only when one turns up running. A lookup that fails leaves that field not known. The records that changed.
 */
export async function readJobsFor(char: number, token: string, o: { bps: BlueprintsDoc | null; held?: BlueprintsDoc | null; stored: (ids: string[]) => Promise<Map<string, JobRecord>>; now?: number }): Promise<JobRecord[]> {
  const { data: raw } = await esiGet<RawJob[]>(`/characters/${char}/industry/jobs/`, { token, query: { include_completed: 'true' } });
  const held = Object.fromEntries(await o.stored(raw.filter((r) => Number.isInteger(r?.job_id)).map((r) => String(r.job_id))));
  const running = newJobs(raw, held).filter((r) => r.status === 'active');
  let indices: Record<number, IndustryIndex> | null = null, adjusted: Record<number, number> | null = null;
  const systems = new Map<number, number | null>();
  if (running.length) {
    indices = await esiGet<{ solar_system_id: number; cost_indices: { activity: string; cost_index: number }[] }[]>('/industry/systems/').then((r) => parseIndices(r.data)).catch(() => null);
    adjusted = await adjustedPrices().catch(() => null);
    for (const id of new Set(running.map((r) => r.station_id))) {
      try {
        if (isStationId(id)) systems.set(id, (await esiGet<{ system_id: number }>(`/universe/stations/${id}/`)).data.system_id);
        else if (isStructureId(id)) systems.set(id, (await esiGet<{ solar_system_id: number }>(`/universe/structures/${id}/`, { token })).data.solar_system_id);
      } catch { systems.set(id, null); }
    }
  }
  return readJobs(raw, held, {
    seenAt: new Date(o.now ?? Date.now()).toISOString(), perRun: (bp) => E.out[String(bp)]?.[1] ?? null, bp: bpFrom(o.bps, o.held),
    systemOf: (id) => systems.get(id) ?? null, indices, adjusted, eiv: E.eiv,
  });
}

/**
 * A character's blueprints as the `blueprints` doc, the places they sit in named once each with its own login: containers
 * and ships by /assets/names (the assets permission; "None" is no name), structures by /universe/structures (refused: `''`).
 */
export async function readBlueprintsFor(char: number, token: string, scopes: string[], prev: BlueprintsDoc | null): Promise<BlueprintsDoc> {
  const raw = await esiAll<RawBlueprint>(`/characters/${char}/blueprints/`, { token });
  const draft = toBlueprintsDoc(raw, prev?.names);
  const want = placesToName(draft);
  const names: Record<string, string> = { ...(draft.names ?? {}) };
  if (scopes.includes(SCOPE_ASSETS)) {
    for (let i = 0; i < want.items.length; i += 1000) {
      const part = want.items.slice(i, i + 1000);
      try {
        const got = new Map((await esiPost<{ item_id: number; name: string }[]>(`/characters/${char}/assets/names/`, part, token)).map((n) => [n.item_id, n.name]));
        for (const id of part) { const n = got.get(id); names[String(id)] = n && n !== 'None' ? n : ''; }
      } catch { /* named on a later read */ }
    }
  }
  if (scopes.includes(SCOPE_STRUCTURES)) {
    for (const id of want.structures) {
      try { names[String(id)] = (await esiGet<{ name: string }>(`/universe/structures/${id}/`, { token })).data.name; }
      catch (e) { if (e instanceof EveError && (e.status === 401 || e.status === 403)) names[String(id)] = ''; }
    }
  }
  return toBlueprintsDoc(raw, names);
}
```

- [ ] **Step 5: The archive reads the main's jobs; the sheet an alt's blueprints and jobs**

In `worker/src/archive.ts`:
- `export async function storedRecords<T>(…)` (add `export`);
- import `readJobsFor, SCOPE_JOBS` from `'./industryJobs'` and `sanitizeBlueprints, type JobRecord` from
  `'../../src/lib/industryTrack'`;
- `ArchiveResult` gains `/** The main's industry jobs that changed (an alt's are its sheet's). */ jobs?: number;`;
- after the orders block (before `// Assets: …`), add

```ts
  // The main's industry jobs, every status, kept as records (industryTrack.ts). A job not held yet is sighted while it runs,
  // its blueprint's ME and TE from the blueprints doc the main's browser keeps. An alt's are its sheet's (sheet.ts), so one
  // job (`sheet`) dates all of an alt's industry reads. A failed read leaves what's held and doesn't stop the copy.
  if (!alt && has(scopes, SCOPE_JOBS)) {
    try {
      const changed = await readJobsFor(charId, token, { bps: sanitizeBlueprints(await doc(db, charId, 'blueprints')) ?? null, stored: (ids) => storedRecords<JobRecord>(db, charId, 'jobs', ids) });
      for (const j of changed) records.push({ k: 'jobs', i: String(j.jobId), d: j });
      result.jobs = changed.length;
    } catch (e) { console.log('industry jobs read failed', charId, e instanceof Error ? e.message : String(e)); }
  }
```

In `worker/src/sheet.ts`:
- import `readBlueprintsFor, readJobsFor, SCOPE_BLUEPRINTS, SCOPE_JOBS` from `'./industryJobs'`, `storedRecords` from
  `'./archive'`, `sanitizeBlueprints, type JobRecord` from `'../../src/lib/industryTrack'`;
- the header comment's list gains "its blueprints (the `blueprints` doc) and industry jobs (records)";
- after `const docs: …` add `const records: { k: string; i: string; d: unknown }[] = [];`;
- before `if (extra.wallet != null)`, add

```ts
  // Its blueprints (the `blueprints` doc, the main's shape) and its industry jobs (records), each only with its permission.
  // No read time in either: its read time is this job's lastOk, for the tab and To do alike. A read with no jobs writes no
  // record, so `jobsRead` marks that one happened (absent: "Not read yet", never "No jobs"). A failed read leaves what's held.
  // The doc held before this read stands in for a blueprint the read doesn't list (one in a job, correction 20).
  const heldBps = sanitizeBlueprints(await doc(db, char, 'blueprints')) ?? null;
  let bps = heldBps;
  if (login.scopes.includes(SCOPE_BLUEPRINTS)) {
    try {
      const next = await readBlueprintsFor(char, token, login.scopes, bps);
      if (JSON.stringify(next) !== JSON.stringify(bps)) docs.push({ key: 'blueprints', d: next });
      bps = next;
    } catch { /* kept as it was; the next hourly read tries again */ }
  }
  if (login.scopes.includes(SCOPE_JOBS)) {
    try {
      const changed = await readJobsFor(char, token, { bps, held: heldBps, stored: (ids) => storedRecords<JobRecord>(db, char, 'jobs', ids), now });
      for (const j of changed) records.push({ k: 'jobs', i: String(j.jobId), d: j });
      meta.jobsRead = true;
    } catch { /* kept as it was */ }
  }
```

- the push at the end becomes
  `if ((docs.length || records.length) && (await stillKept(db, who))) await push(db, char, { records, docs });` and the
  return `return { skills: count, clone, pushed: docs.length + records.length };`.

- [ ] **Step 6: Run the tests to see them pass, then plant each rule wrong**

Run: `npm run check 2>&1 | tail -30`
Expected: no `FAIL` (the module-load test now loads `industryJobs.ts` with its JSON import too).

Plant, run, see it fail, undo:
- `push`: write `r.d` for jobs as before (no merge): "merged onto D1's, never over it" fails.
- `push`: write `later` with `rows` (`queue([...rows, ...later])`, no second revision): "written at a revision of its own
  after the push's" fails.
- `readJobsFor`: `bp: bpFrom(o.bps, null)`: "an alt's job whose blueprint this read doesn't list" fails.
- `archive`: drop `!alt &&`: "read once, by the sheet" fails (2 reads).
- `sheet`: `meta.jobsRead = true;` just above `if (login.scopes.includes(SCOPE_JOBS))`: "an alt whose login lacks them …
  no jobsRead" fails.
- `sheet`: push the blueprints doc every read (drop the `JSON.stringify` compare): "read again unchanged: no new revision" fails.
- `readBlueprintsFor`: use `toBlueprintsDoc(raw)` without `prev?.names` for the draft: "the container isn't named again" fails.

- [ ] **Step 7: The page case: a browser that pushed its late job first**

The Worker's half is pinned in Step 1; this pins the browser's (Review Focus 2): with a stand-in cloud doing what
`worker/src/sync.ts` now does (the push answers its own revision, the merged job comes down at a later one), the browser
ends up holding `first`. In `scripts/pages.mjs`, above `// --- the end of the industry case`:

```js
    // --- Task 9B: a browser that pushes its late job before pulling ends up holding the cloud's first-sight fields
    // (correction 19). The stand-in cloud answers the push at revision 5 and brings the merged job down at 6.
    {
      const prevPush = CLOUD['/v1/push'], prevPull = CLOUD['/v1/pull'];
      const late = { jobId: 9002, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 10, licensedRuns: 40, successfulRuns: null, probability: null, cost: 1200000,
        facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: iso(now - 7200_000), end: iso(now - 600_000), completed: null, status: 'ready', perRun: 1, seenAt: iso(now - 300_000) };
      const first = { me: 10, te: 20, systemId: 30000142, index: 0.1651, eiv: 2424467.9, at: iso(now - 7000_000) };
      let pushed = false;
      CLOUD['/v1/push'] = (url, req, json) => { pushed = true; return json({ rev: 5, records: 1, docs: 0 }); };
      CLOUD['/v1/pull'] = (url, req, json) => json(pushed
        ? { rev: 6, records: [{ k: 'jobs', i: '9002', d: { ...late, seenAt: iso(now - 7000_000), first }, r: 6 }], docs: [], next: null }
        : { rev: 4, records: [], docs: [], next: null });
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, jobs: { 9002: late }, cloud: { ...CLOUD_STATE, rev: 4, dirty: { r: ['jobs|9002'], d: [] } } }, { alts: altStore });
      await page.goto(`${BASE}#hustles/industry/start`);
      const held = () => page.evaluate(() => new Promise((res) => { const q = indexedDB.open('jita-ledger'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('jobs'); g.onsuccess = () => res(g.result); }; }));
      let jobs = await held();
      for (let i = 0; i < 80 && !jobs?.[9002]?.first; i++) { await page.waitForTimeout(250); jobs = await held(); }
      const j2 = jobs?.[9002];
      if (!j2?.first || j2.first.me !== 10 || j2.seenAt !== iso(now - 7000_000) || j2.status !== 'ready') problems.push(`a browser that pushed its late job first never took the cloud’s first-sight fields: ${JSON.stringify(j2 ?? null).slice(0, 300)}`);
      CLOUD['/v1/push'] = prevPush; CLOUD['/v1/pull'] = prevPull;
    }
```

Planted: in `cloud.ts`'s `pullNow`, skip pulled `jobs` rows (`page.records.filter((r) => r.k !== 'jobs' && …)`): this fails;
undo.

- [ ] **Step 8: The notes**

- `CLAUDE.md`, "The Worker runs the app's own rules" list: add `industryTrack` (jobs, the blueprints doc) and `blueprints`
  (which it imports) after `homeMarket (values)`.
- `.claude/rules/industry.md`: the `worker/src/{industryNpc,goonmetrics}.ts` line becomes
  `  - "worker/src/{industryNpc,goonmetrics,industryJobs}.ts"`.
- `docs/notes/industry.md`, under **Stage 2**: **The cloud's reads** — the main's jobs by the archive (`:07`, its
  blueprints the browser's, so the archive's first sight takes ME and TE from the doc the browser pushed), an alt's
  blueprints and jobs by the sheet (`:37`), `jobsRead`, names with the reader's own login, the push merging `jobs` and only
  `jobs`, what the tests pin (filed under the alt, the main untouched, nothing new pushes nothing, a failed read keeps
  what's held, no permission no mark, removed mid-read nothing back).
- `docs/notes/cloud.md`, after the `refusedKind` bullet: "**A job the Worker merged comes back down** (correction 19 of
  the Industry stage-2 plan): a `jobs` row whose merge changed it from what was pushed is written at a revision of its own,
  after the push's, which the push doesn't report: the pushing browser skips its own revisions when it pulls, so only this
  way does it get the first-sight fields another writer saw. A job pushed as D1 holds it costs no extra revision."
- `docs/notes/characters-cloud.md`: after "**Alts are read hourly on a cron of their own**", add "Since Industry stage 2
  (11 October 2026) the sheet also reads an alt's blueprints (the `blueprints` doc) and industry jobs (`jobs` records,
  `meta.jobsRead`), each only with its permission; the archive reads only the main's jobs, so the `sheet` job's `lastOk`
  dates every one of an alt's industry reads."

- [ ] **Step 9: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-income`
Expected: all pass (`LEDGER=industry npm run check-pages` while iterating on Step 7's block); `scripts/income-golden.json`
unchanged. (No UI changed: `check-phone` and screenshots aren't needed.)

- [ ] **Step 10: Commit**

```bash
git add worker/src/industryJobs.ts worker/src/sync.ts worker/src/archive.ts worker/src/sheet.ts scripts/check-worker.mjs scripts/pages.mjs CLAUDE.md .claude/rules/industry.md docs/notes/industry.md docs/notes/cloud.md docs/notes/characters-cloud.md
git commit -m "$(cat <<'EOF'
Industry stage 2: the cloud keeps jobs and blueprints, merging every writer's job

The browser now reads the main's jobs and blueprints, but nothing read an alt's, and the main's jobs were seen only while
a browser was open: a job installed and finished between visits was never sighted. The hourly archive reads the main's
jobs (first sight from the blueprints doc its browser keeps), and each alt's hourly sheet reads its blueprints and jobs,
filed under the alt, with the main's rows untouched (tested against real SQL). The Worker takes the `jobs` kind and merges
each pushed job onto D1's record (mergeJob), so a browser that first saw a job after it ended can't drop what the cloud
saw while it ran; where the merge added something, the job is written at a revision of its own after the push's, so the
browser that pushed (which skips its own revisions when it pulls) gets the first-sight fields too.

An alt's read with no jobs writes no record, so its meta doc carries jobsRead once a read has happened: absent stays
"Not read yet", never "No jobs".

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
)"
```

---
### Task 10A: Blueprints & jobs: Your characters, the tiles, every blueprint and every job

**Files:**
- Create: `src/lib/industryOwned.ts`, `src/components/hustles/IndustryOwned.tsx`
- Modify: `src/lib/industryTrack.ts` (`slotsUsed`), `src/lib/industryRank.ts` (`RowInput.held`), `src/lib/pilot.ts`
  (`lostSaid`), `src/components/hustles/researchChars.ts` (re-exports it), `src/components/hustles/industryChars.ts`
  (`blueprints`, `jobs`, `places`), `src/components/hustles/industryFinder.ts` (`useFinder`'s `own`),
  `src/components/hustles/Industry.tsx` (the section, the All-characters filter), `src/styles.css`, `scripts/check.mjs`,
  `scripts/pages.mjs`, `.claude/rules/industry.md`, `docs/notes/industry.md`, `docs/notes/characters.md`,
  `docs/notes/limits.md`

**Interfaces:**
- Consumes: `JobRecord`, `ownedOf`, `ACTIVITY_SAID`, `SCIENCE_ACTIVITIES`, `isStationId`, `isStructureId` (Task 9A);
  `slots`, `structureBonus`, `rigFor`, `researchTime`, `researchCost`, `eivOf`, `nameOf`, `type Indexed`, `type BundleBp`,
  `type Clone` (industry.ts); `RUNGS`, `alphaCapOf`, `usable`, `finderSkills`, `beforeSaid` (industryLadder.ts);
  `buildRow`, `type RowInput`, `type LabSite`, `type Row` (industryRank.ts); `spForLevel`, `trainingDays`,
  `type Attributes` (training.ts); `jobWaiting` (todo.ts); `trainSaid`, `ROMAN` (skillStatus.ts); `jobOk`, `loginState`
  (roster.ts).
- Produces:
  - `src/lib/industryTrack.ts`: `slotsUsed(jobs, now): { factory: number; science: number; running: number; ready: number }`.
  - `src/lib/industryRank.ts`: `RowInput.held?: boolean`.
  - `src/lib/pilot.ts`: `lostSaid(c: { isMain: boolean; name: string; pilot: Pick<Pilot, 'lost'> }): string | null`.
  - `src/lib/industryOwned.ts`: `type Read<T>`, `readWhy(c, r, what)`, `type CharIn`, `type CharRow`,
    `charRows(ix, chars, now)`, `type Fleet`, `fleetTotals(rows)`, `type BpKindRow`, `blueprintKinds(chars)`,
    `type NextStep`, `nextResearch(o)`, `charInput(base, c)`.
  - `IndustryChar` gains `blueprints: Read<OwnedBlueprint[]>`, `jobs: Read<JobRecord[]>`, `places: Record<string, string>`.
  - `useFinder(c, ix, graph, opts?: { own?: OwnOrder[] })`.
  - `Industry.tsx`: `SECTIONS` gains `{ key: 'blueprints', label: 'Blueprints & jobs' }`; `jita-ledger:industry-char`.
  - `IndustryOwned({ chars, filter, onFilter, shown, ix, graph })`; `data-industry` hooks `owned`, `char-filter`, `chars`,
    `owned-tiles`, `bp-list`, `jobs-running`, `jobs-done`.

Corrections owned here: 7 (`industryOwned.ts`), 8 (`lostSaid`), 12 (`held`), 13 (slots in use), 16 (the key).

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 9A's sections:

```js
console.log('\n--- Industry stage 2: Blueprints & jobs (industryOwned.ts, Task 10A) ---');
{
  const O = await import('../src/lib/industryOwned.ts');
  const T = await import('../src/lib/industryTrack.ts');
  const K = await import('../src/lib/industryRank.ts');
  const I = await import('../src/lib/industry.ts');
  const { lostSaid } = await import('../src/lib/pilot.ts');
  const fsO = await import('node:fs');
  const ix = I.indexBundle(JSON.parse(fsO.readFileSync(new URL('../src/data/industry.json', import.meta.url))));
  const NOW5 = Date.parse('2026-10-11T12:00:00Z');
  const job = (jobId, activity, status, end, over = {}) => ({ jobId, activity, blueprintId: 1, blueprintTypeId: 25895, productTypeId: 25894, runs: 10, licensedRuns: null, successfulRuns: null, probability: null,
    cost: 1e6, facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: '2026-10-11T00:00:00Z', end, completed: null, status, perRun: 1, seenAt: '2026-10-11T00:05:00Z', ...over });
  const jobs = [job(1, 1, 'active', '2026-10-11T20:00:00Z'), job(2, 1, 'ready', '2026-10-11T08:00:00Z'), job(3, 1, 'active', '2026-10-11T11:00:00Z'), job(4, 5, 'active', '2026-10-12T00:00:00Z'), job(5, 1, 'delivered', '2026-10-10T00:00:00Z'), job(6, 9, 'active', '2026-10-12T00:00:00Z')];
  eq('  slots in use: running and finished-not-delivered, by kind; delivered and reactions take none', T.slotsUsed(jobs, NOW5), { factory: 3, science: 1, running: 2, ready: 2 });

  const read = (value, at = NOW5) => ({ state: 'read', value, at });
  const owned = T.ownedOf({ list: [[10, 25895, 60003760, 'Hangar', -1, -1, 10, 20], [11, 25895, 1030000001, 'Hangar', -2, 40, 10, 20], [12, 804, 60003760, 'Hangar', 3, -1, 0, 0]] });
  const main = { charId: 1, name: 'You', isMain: true, clone: 'omega', skills: { 3380: 1, 3387: 4, 3406: 3 }, sp: {}, attrs: { intelligence: 24, memory: 24, perception: 20, willpower: 20, charisma: 23 }, jobs: read(jobs), blueprints: read(owned) };
  const fresh = { charId: 2, name: 'Fresh Alt', isMain: false, clone: 'unknown', skills: { 3380: 1 }, sp: {}, attrs: undefined, jobs: { state: 'unread' }, blueprints: { state: 'unread' } };
  const lost = { charId: 3, name: 'Lost Alt', isMain: false, clone: 'unknown', skills: undefined, sp: undefined, attrs: undefined, jobs: { state: 'lost', why: 'refused' }, blueprints: { state: 'lost', why: 'refused' }, lost: 'refused' };
  const stale = { charId: 4, name: 'Stale Alt', isMain: false, clone: 'alpha', skills: { 3380: 2, 3387: 1 }, sp: {}, attrs: main.attrs, jobs: read([]), blueprints: read(owned.slice(0, 1)), lost: 'refused' };
  const rows = O.charRows(ix, [main, fresh, lost, stale], NOW5);
  eq('  the main: 5 factory slots (Mass Production IV), 3 in use; 4 science, 1; 2 ready; 4 originals (a stack of 3 unused), 1 copy',
    [rows[0].factory, rows[0].science, rows[0].ready, rows[0].originals, rows[0].copies], [{ used: 3, of: 5 }, { used: 1, of: 4 }, 2, 4, 1]);
  eq('    its next rung: Research ME first, what it lacks, and the training time at its attributes',
    [rows[0].next?.title, rows[0].next?.lacking.map((x) => [x.id, x.level, x.omega]), rows[0].next?.days > 0], ['Research ME first', [[3409, 1, false], [3403, 1, false]], true]);
  eq('  an alt not read: no counts at all, never zeros, and why', [rows[1].factory?.used ?? null, rows[1].ready, rows[1].originals, rows[1].copies, rows[1].why],
    [null, null, null, null, 'Not read yet: Fresh Alt’s industry jobs and blueprints come with the cloud’s next hourly read.']);
  eq('  an alt refused with nothing read: why, and nothing counted', [rows[2].factory, rows[2].originals, rows[2].why], [null, null, 'Not read: EVE refused Lost Alt’s login; hand it over again on the Characters page.']);
  eq('  an alt refused after a read: what was read, and that it\'s as of the cloud\'s last read', [rows[3].originals, rows[3].ready, rows[3].why],
    [1, 0, 'As the cloud last read it. EVE refused Stale Alt’s login; hand it over again on the Characters page.']);
  eq('    an Alpha alt\'s next rung says what needs Omega', rows[3].next?.lacking.find((x) => x.id === 3409)?.omega, true);
  const fleet = O.fleetTotals(rows);
  eq('  the fleet\'s totals count only the characters read, and say how many', [fleet.originals, fleet.copies, fleet.ready, fleet.jobsRead, fleet.bpsRead, fleet.of], [5, 1, 2, 2, 2, 4]);
  eq('  lostSaid, one sentence for any character with a refused login', [lostSaid({ isMain: false, name: 'X', pilot: { lost: 'none' } }), lostSaid({ isMain: true, name: 'You', pilot: {} })],
    ['The cloud holds no login for X; hand one over on the Characters page.', null]);
  eq('  readWhy: the main\'s login without the permission, an alt\'s handed over without it',
    [O.readWhy({ isMain: true, name: 'You' }, { state: 'login' }, 'jobs'), O.readWhy({ isMain: false, name: 'X' }, { state: 'handOver' }, 'blueprints')],
    ['Log in again: this login wasn’t given EVE’s permission to read your industry jobs.', 'Hand the cloud X’s login again: it was handed over without the permission to read blueprints.']);

  const kinds = O.blueprintKinds([{ charId: 1, name: 'You', owned }, { charId: 4, name: 'Stale Alt', owned: owned.slice(0, 1) }]);
  eq('  one row a kind and character: the stack of 3 unused counted 3, each where it sits', kinds.map((k) => [k.charId, k.typeId, k.copy, k.unused, k.me, k.te, k.runs, k.count, k.where]),
    [[1, 804, false, true, 0, 0, null, 3, [[60003760, 3]]], [1, 25895, false, false, 10, 20, null, 1, [[60003760, 1]]], [1, 25895, true, false, 10, 20, 40, 1, [[1030000001, 1]]], [4, 25895, false, false, 10, 20, null, 1, [[60003760, 1]]]]);

  const bp = ix.bp.get(25895);
  const lab = { kind: 'npc', rigs: [], band: 'high', tax: 0.0025, index: { manufacturing: 0.05, copying: 0.05, invention: 0.05, researchMaterial: 0.05, researchTime: 0.05 } };
  const adjusted = JSON.parse(fsO.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8')).adjusted;
  const step = O.nextResearch({ ix, bp, me: 4, te: 0, copy: false, skills: { 3409: 0, 3403: 0 }, clone: 'omega', lab, adjusted });
  eq('  an original\'s next research step: ME 4 → 5 at the level table, priced at the lab', [step.what, step.from, step.to, Math.round(step.seconds), step.cost != null],
    ['me', 4, 5, Math.round(1575 * (3360 - 1414) / 105), true]);
  eq('    at ME 10, TE next (a level is 2%); fully researched, none; a copy can\'t be', [O.nextResearch({ ix, bp, me: 10, te: 6, copy: false, skills: {}, clone: 'omega', lab, adjusted }).what,
    O.nextResearch({ ix, bp, me: 10, te: 20, copy: false, skills: {}, clone: 'omega', lab, adjusted }), O.nextResearch({ ix, bp, me: 10, te: 20, copy: true, skills: {}, clone: 'omega', lab, adjusted })], ['te', 'done', 'copy']);
  eq('    no Laboratory reached: the time at no bonus, no price', O.nextResearch({ ix, bp, me: 0, te: 0, copy: false, skills: {}, clone: 'omega', lab: null, adjusted }).cost, null);

  // Under All, a blueprint row is worked out at its own character's skills, clone, Jita fees and mining, never the shown one's.
  const shownIn = { skills: { 3380: 5 }, clone: 'omega', fees: { broker: 0.02, tax: 0.04, hubBroker: 0.01 }, mines: false, share: 10 };
  eq('  a row\'s inputs at its own character', O.charInput(shownIn, { skills: { 3380: 1 }, clone: 'alpha', broker: 0.0198, tax: 0.0336, mines: true }),
    { skills: { 3380: 1 }, clone: 'alpha', fees: { broker: 0.0198, tax: 0.0336, hubBroker: 0.01 }, mines: true, share: 10 });
  eq('    its skills not read: no row (never worked out at level 0)', O.charInput(shownIn, { skills: undefined, clone: 'omega', broker: 0.02, tax: 0.04, mines: false }), null);

  // A Tech II copy you hold is built as it is: buildRow costs invention only for one you'd invent.
  const t2 = ix.bp.get(26303);
  const base = { ix, me: 2, te: 4, copyRuns: 1, skills: { 3380: 4 }, clone: 'omega', site: { kind: 'npc', rigs: [], band: 'high', tax: 0.0025, index: lab.index }, adjusted, market: () => ({ jita: null, stats: null, watched: null, home: null, homeRead: false }),
    sell: 'jita', share: 10, fees: { broker: 0.02, tax: 0.04, hubBroker: null }, legs: { jita: { kind: 'here' }, home: null }, noShipsToJita: true, jitaJumps: 0, mines: false, hubName: null, now: NOW5, lab };
  eq('  buildRow: a held Tech II copy isn\'t invented again', [K.buildRow({ ...base, bp: t2 }).invention != null, K.buildRow({ ...base, bp: t2, held: true }).invention], [true, null]);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 10A"`
Expected: `industryOwned.ts` not found, `slotsUsed` not a function, `lostSaid` not exported from pilot.ts.

- [ ] **Step 3: Slots in use, `held`, `lostSaid`**

Append to `src/lib/industryTrack.ts`:

```ts
/**
 * Slots in use, from a character's jobs: running (active or paused, not past its end) and finished but not delivered
 * (ready, or active past its end): a finished job holds its slot until it's delivered (forum reports; EVE University's
 * "Industry" page doesn't say; checked in game after shipping, limits.md).
 * Manufacturing takes a factory slot, research, copying, invention and reverse engineering a science slot; reactions have
 * slots of their own, not modelled.
 */
export function slotsUsed(jobs: readonly JobRecord[], now: number): { factory: number; science: number; running: number; ready: number } {
  let factory = 0, science = 0, running = 0, ready = 0;
  for (const j of jobs) {
    if (j.status !== 'active' && j.status !== 'paused' && j.status !== 'ready') continue;
    if (j.activity === 1) factory++; else if (SCIENCE_ACTIVITIES.has(j.activity)) science++; else continue;
    if (j.status === 'ready' || (j.status === 'active' && Date.parse(j.end) <= now)) ready++; else running++;
  }
  return { factory, science, running, ready };
}
```

In `src/lib/industryRank.ts`, `RowInput` gains
`/** The character holds this blueprint (an invented copy included): built at its own ME, TE and runs, never invented again. */ held?: boolean;`
and in `buildRow` `const from = ix.inventedFrom.get(bp[0]);` becomes `const from = o.held ? undefined : ix.inventedFrom.get(bp[0]);`.

In `src/lib/pilot.ts`, append (moved from researchChars.ts, typed structurally; its words unchanged):

```ts
/**
 * An alt whose cloud login EVE refused, or for which the cloud holds none, as a sentence; null for the main and for an alt
 * whose login works. What was read before stays shown wherever it's shown, so this says it's only as of the last read and
 * won't be read again until the login is handed over (the review of 3 October 2026, research.md; Industry since stage 2).
 */
export function lostSaid(c: { isMain: boolean; name: string; pilot: Pick<Pilot, 'lost'> }): string | null {
  if (c.isMain || !c.pilot.lost) return null;
  return c.pilot.lost === 'refused' ? `EVE refused ${c.name}’s login; hand it over again on the Characters page.`
    : `The cloud holds no login for ${c.name}; hand one over on the Characters page.`;
}
```

In `src/components/hustles/researchChars.ts`, delete `lostSaid`'s body and comment and add
`export { lostSaid } from '../../lib/pilot';` (its callers keep importing it from here).

- [ ] **Step 4: `src/lib/industryOwned.ts`**

Create it:

```ts
/**
 * The Blueprints & jobs section's rows (docs/notes/industry.md, stage 2): each character's slots, jobs ready and blueprints
 * held, with the industry skills it lacks for its next rung; the fleet's totals; one blueprint row a kind; an original's
 * next research step. Pure (check.mjs loads it), browser only: it reads the ladder and the finder's rules, which the Worker
 * has no use for, so it isn't industryTrack.ts. Nothing not read is a zero: a count is null with why.
 */
import type { OwnedBlueprint } from './blueprints';
import { eivOf, researchCost, researchTime, rigFor, slots, structureBonus, type BundleBp, type Clone, type Indexed } from './industry';
import { alphaCapOf, RUNGS, usable } from './industryLadder';
import type { LabSite } from './industryRank';
import { slotsUsed, type JobRecord } from './industryTrack';
import { spForLevel, trainingDays, type Attributes } from './training';

/** Where a character's read stands: read (with when), not read yet, the main's login lacking the permission, an alt's handed over without it, or its login lost. */
export type Read<T> =
  | { state: 'read'; value: T; at: number | null }
  | { state: 'unread' } | { state: 'login' } | { state: 'handOver' } | { state: 'lost'; why: 'refused' | 'none' };

const WHAT: Record<'jobs' | 'blueprints', string> = { jobs: 'industry jobs', blueprints: 'blueprints' };
/** Why a read isn't shown, as a sentence; null when read. The research tab's words (researchChars.ts), for jobs and blueprints. */
export function readWhy(c: { isMain: boolean; name: string }, r: Read<unknown>, what: 'jobs' | 'blueprints'): string | null {
  if (r.state === 'read') return null;
  if (r.state === 'unread') return c.isMain ? `Not read yet: your ${WHAT[what]} come with the next sync.` : `Not read yet: ${c.name}’s ${WHAT[what]} come with the cloud’s next hourly read.`;
  if (r.state === 'login') return `Log in again: this login wasn’t given EVE’s permission to read your ${WHAT[what]}.`;
  if (r.state === 'handOver') return `Hand the cloud ${c.name}’s login again: it was handed over without the permission to read ${WHAT[what]}.`;
  return r.why === 'refused' ? `Not read: EVE refused ${c.name}’s login; hand it over again on the Characters page.` : `Not read: the cloud holds no login for ${c.name}; hand one over on the Characters page.`;
}

export type CharIn = {
  charId: number; name: string; isMain: boolean; clone: Clone;
  /** Usable levels (finderSkills): undefined when not read. */
  skills: Record<number, number> | undefined;
  sp: Record<number, number> | undefined; attrs: Attributes | undefined;
  jobs: Read<JobRecord[]>; blueprints: Read<OwnedBlueprint[]>;
  /** An alt whose login EVE refused, or that has none (pilot.lost). */
  lost?: 'refused' | 'none';
};
export type CharRow = {
  charId: number; name: string; isMain: boolean;
  /** Slots from skills (`of`) and in use from jobs (`used`, null when jobs aren't read); null when skills aren't read. */
  factory: { used: number | null; of: number } | null;
  science: { used: number | null; of: number } | null;
  ready: number | null;
  originals: number | null; copies: number | null;
  /** The first rung with a skill it lacks: those skills, which need Omega, and the training time for the rest (null when not known); 'top' with none left; null when skills aren't read. */
  next: { title: string; lacking: { id: number; level: number; name: string; omega: boolean }[]; days: number | null } | 'top' | null;
  /** One sentence for what isn't shown, or that what's shown is as of the cloud's last read; null when everything is read and current. */
  why: string | null;
};

/** The industry skills lacking for the first rung (Build at home has none) the character's usable levels don't cover. */
function nextRung(ix: Indexed, c: CharIn): CharRow['next'] {
  if (!c.skills) return null;
  const have = usable(c.skills, c.clone);
  for (const r of RUNGS) {
    const lacking = r.needs.filter((n) => (have[n.skill] ?? 0) < n.level).map((n) => ({ id: n.skill, level: n.level, name: n.name, omega: c.clone === 'alpha' && n.level > alphaCapOf(n.skill) }));
    if (!lacking.length) continue;
    let days: number | null = 0;
    for (const l of lacking.filter((x) => !x.omega)) {
      const s = ix.b.skills[l.id];
      if (!s || !c.attrs || days == null) { days = null; break; }
      const dg = { rank: s[0], primary: s[1], secondary: s[2] };
      days += trainingDays(dg, c.attrs, Math.max(c.sp?.[l.id] ?? 0, spForLevel(dg.rank, c.skills[l.id] ?? 0)), l.level, c.clone === 'alpha');
    }
    return { title: r.title, lacking, days: lacking.every((x) => x.omega) ? null : days };
  }
  return 'top';
}

/** Neither read yet, said once. */
const both = (c: CharIn): string => (c.isMain ? 'Not read yet: your industry jobs and blueprints come with the next sync.' : `Not read yet: ${c.name}’s industry jobs and blueprints come with the cloud’s next hourly read.`);

const lostLine = (c: CharIn): string | null => (c.isMain || !c.lost ? null : c.lost === 'refused'
  ? `EVE refused ${c.name}’s login; hand it over again on the Characters page.` : `The cloud holds no login for ${c.name}; hand one over on the Characters page.`);

export function charRows(ix: Indexed, chars: readonly CharIn[], now: number): CharRow[] {
  return chars.map((c) => {
    const s = c.skills ? slots(ix, usable(c.skills, c.clone)) : null;
    const used = c.jobs.state === 'read' ? slotsUsed(c.jobs.value, now) : null;
    const bps = c.blueprints.state === 'read' ? c.blueprints.value : null;
    const jobsWhy = readWhy(c, c.jobs, 'jobs'), bpsWhy = readWhy(c, c.blueprints, 'blueprints');
    const anyRead = c.jobs.state === 'read' || c.blueprints.state === 'read';
    const lost = lostLine(c);
    // One sentence where one will do: read data from a lost login says it's the cloud's last read; nothing read at all says
    // why once (both unread alike, or both lost, whose sentence is the same).
    const why = anyRead
      ? [lost ? `As the cloud last read it. ${lost}` : null, jobsWhy, bpsWhy].filter(Boolean).join(' ') || null
      : c.jobs.state === 'unread' && c.blueprints.state === 'unread' ? both(c)
        : jobsWhy === bpsWhy ? jobsWhy : [jobsWhy, bpsWhy].filter(Boolean).join(' ') || null;
    return {
      charId: c.charId, name: c.name, isMain: c.isMain,
      factory: s ? { used: used?.factory ?? null, of: s.factory } : null,
      science: s ? { used: used?.science ?? null, of: s.science } : null,
      ready: used?.ready ?? null,
      originals: bps ? bps.filter((b) => !b.copy).reduce((n, b) => n + b.count, 0) : null,
      copies: bps ? bps.filter((b) => b.copy).reduce((n, b) => n + b.count, 0) : null,
      next: nextRung(ix, c),
      why,
    };
  });
}

/** The fleet's totals, over the characters whose figure is read only, with how many were. */
export type Fleet = {
  factory: { used: number; of: number } | null; science: { used: number; of: number } | null;
  ready: number | null; originals: number | null; copies: number | null;
  jobsRead: number; bpsRead: number; of: number;
};
export function fleetTotals(rows: readonly CharRow[]): Fleet {
  const sum = (xs: (number | null)[]) => { const k = xs.filter((x): x is number => x != null); return k.length ? k.reduce((a, b) => a + b, 0) : null; };
  const slot = (k: 'factory' | 'science') => { const r = rows.map((x) => x[k]).filter((x): x is { used: number; of: number } => x != null && x.used != null); return r.length ? { used: r.reduce((a, b) => a + b.used, 0), of: r.reduce((a, b) => a + b.of, 0) } : null; };
  return {
    factory: slot('factory'), science: slot('science'), ready: sum(rows.map((r) => r.ready)),
    originals: sum(rows.map((r) => r.originals)), copies: sum(rows.map((r) => r.copies)),
    jobsRead: rows.filter((r) => r.ready != null).length, bpsRead: rows.filter((r) => r.originals != null).length, of: rows.length,
  };
}

/** One row of the blueprints table: a kind a character holds, how many, and where (location ID, count), most first. */
export type BpKindRow = { key: string; charId: number; name: string; typeId: number; copy: boolean; unused: boolean; me: number; te: number; runs: number | null; count: number; where: [number, number][] };
/** Every character's blueprints, one row a kind and character, by character in the order given, then item ID order. */
export function blueprintKinds(chars: readonly { charId: number; name: string; owned: readonly OwnedBlueprint[] }[]): BpKindRow[] {
  const out: BpKindRow[] = [];
  for (const c of chars) {
    const by = new Map<string, BpKindRow>();
    for (const b of [...c.owned].sort((x, y) => x.typeId - y.typeId || x.itemId - y.itemId)) {
      const key = `${c.charId}|${b.typeId}|${b.copy ? 1 : 0}|${b.me}|${b.te}|${b.runs ?? ''}|${b.unused ? 'u' : ''}`;
      const r = by.get(key) ?? { key, charId: c.charId, name: c.name, typeId: b.typeId, copy: b.copy, unused: b.unused, me: b.me, te: b.te, runs: b.runs, count: 0, where: [] };
      r.count += b.count;
      const w = r.where.find((x) => x[0] === b.locationId);
      if (w) w[1] += b.count; else r.where.push([b.locationId, b.count]);
      by.set(key, r);
    }
    out.push(...[...by.values()].map((r) => ({ ...r, where: r.where.sort((a, b) => b[1] - a[1]) })));
  }
  return out;
}

/** An original's next research step: ME first to 10, then TE to 20 (a TE level is 2%), its time and cost at the lab. */
export type NextStep = { what: 'me' | 'te'; from: number; to: number; seconds: number; cost: number | null } | 'done' | 'copy' | 'none';
export function nextResearch(o: { ix: Indexed; bp: BundleBp; me: number; te: number; copy: boolean; skills: Record<number, number>; clone: Clone; lab: LabSite | null; adjusted: Record<number, number> | null }): NextStep {
  if (o.copy) return 'copy';
  const what = o.me < 10 ? 'me' : o.te < 20 ? 'te' : null;
  if (!what) return 'done';
  const act = what === 'me' ? o.bp[4] : o.bp[5];
  if (!act) return 'none';
  const from = what === 'me' ? o.me : Math.floor(o.te / 2), to = from + 1;
  const kind = o.lab?.kind ?? 'npc';
  const sb = structureBonus(o.ix, kind);
  const a = what === 'me' ? 'researchMaterial' : 'researchTime';
  const rig = o.lab ? rigFor(o.ix, o.lab.rigs, o.lab.kind, o.lab.band, null, a) : { material: 1, time: 1, cost: 1 };
  const seconds = researchTime(o.ix, act[0], what, from, to, o.skills, sb.time, rig.time);
  const m = o.bp[2];
  const eiv = m && o.adjusted ? eivOf(m[1], o.adjusted) : null;
  const cost = o.lab?.index && eiv != null ? researchCost(eiv, from, to, { index: o.lab.index[a], structure: sb.cost, rig: rig.cost, tax: o.lab.tax, clone: o.clone }).total : null;
  return { what, from: what === 'me' ? from : from * 2, to: what === 'me' ? to : to * 2, seconds, cost };
}

/**
 * The finder's inputs for one character's blueprint row: under All each row is worked out at its own character's usable
 * skills, clone, Jita broker fee and sales tax, and whether it mines, over the shown character's (spec, Revision 2). Null
 * when its skills aren't read: a row is never worked out at level 0.
 */
export function charInput<I extends { skills: Record<number, number>; clone: Clone; fees: { broker: number; tax: number; hubBroker: number | null }; mines: boolean }>(
  base: I, c: { skills: Record<number, number> | undefined; clone: Clone; broker: number; tax: number; mines: boolean },
): I | null {
  if (!c.skills) return null;
  return { ...base, skills: c.skills, clone: c.clone, fees: { ...base.fees, broker: c.broker, tax: c.tax }, mines: c.mines };
}
```

- [ ] **Step 5: Run the pure tests to see them pass, then plant each rule wrong**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 10A"`
Expected: no `FAIL`.

Plant, run, see it fail, undo:
- `slotsUsed`: count only `active`: "slots in use" fails.
- `charRows`: `originals: bps ? … : 0`: "an alt not read: … never zeros" fails.
- `charRows`: drop the `As the cloud last read it.` branch: "an alt refused after a read" fails.
- `fleetTotals`: count `of` rows in `jobsRead`: "the fleet's totals count only the characters read" fails.
- `nextResearch`: `to = from + 2`: "an original's next research step: ME 4 → 5" fails.
- `buildRow`: ignore `held`: "a held Tech II copy isn't invented again" fails.
- `charInput`: keep `base.fees`: "a row's inputs at its own character" fails.

- [ ] **Step 6: Each character's blueprints and jobs**

In `src/components/hustles/industryChars.ts`:
- imports: `hasScope` with `askedScopes` from `'../../lib/auth'`; `SCOPE` with `SCOPES` from `'../../lib/config'`;
  `jobOk` with `emptyAlt, loginState` from `'../../lib/roster'`; `ownedOf, type JobRecord` from `'../../lib/industryTrack'`;
  `type OwnedBlueprint` from `'../../lib/blueprints'`; `type Read` from `'../../lib/industryOwned'`.
- `IndustryChar` gains

```ts
  /** Its blueprints as last read: the main's by its sync (`meta.blueprintsAt`), an alt's by the cloud's sheet (its `lastOk`). */
  blueprints: Read<OwnedBlueprint[]>;
  /** Its industry jobs, every status kept: the main's by its sync and the cloud's archive, an alt's by the sheet. */
  jobs: Read<JobRecord[]>;
  /** What its blueprints doc names: the containers, ships and structures they sit in (`''`: no name). */
  places: Record<string, string>;
```

- in the hook, destructure `jobs, blueprints` from `d` too; add a module-level
  `const timeOf = (iso: string | undefined): number | null => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };`;
  the main gets

```ts
      blueprints: blueprints ? { state: 'read', value: ownedOf(blueprints), at: timeOf(meta.blueprintsAt) } : hasScope(SCOPE.blueprints) ? { state: 'unread' } : { state: 'login' },
      // Read once a stage-2 read has happened (meta.jobsRead, correction 3) or a record came from the cloud's archive. A
      // stage-1 meta.industry isn't one: it listed only the jobs to deliver, and would read here as "0 in use".
      jobs: meta.jobsRead || Object.keys(jobs).length ? { state: 'read', value: Object.values(jobs), at: timeOf(meta.industry?.at) } : hasScope(SCOPE.industry) ? { state: 'unread' } : { state: 'login' },
      places: blueprints?.names ?? {},
```

  and each alt (after `const lost = …`):

```ts
      // Read data wins over a lost login: it stays shown, said as the cloud's last read (lostSaid).
      const sheetAt = jobOk(entry, 'sheet');
      const bpd = ledger.blueprints;
      const altBps: Read<OwnedBlueprint[]> = bpd ? { state: 'read', value: ownedOf(bpd), at: sheetAt }
        : lost ? { state: 'lost', why: lost } : login.missing.includes(SCOPE.blueprints) ? { state: 'handOver' } : { state: 'unread' };
      const altJobs: Read<JobRecord[]> = ledger.meta.jobsRead || Object.keys(ledger.jobs).length ? { state: 'read', value: Object.values(ledger.jobs), at: sheetAt }
        : lost ? { state: 'lost', why: lost } : login.missing.includes(SCOPE.industry) ? { state: 'handOver' } : { state: 'unread' };
```

  with `blueprints: altBps, jobs: altJobs, places: bpd?.names ?? {},` in its object. The `useMemo` deps gain `jobs, blueprints`.

In `src/components/hustles/industryFinder.ts`, `useFinder(c, ix, graph)` becomes
`useFinder(c: IndustryChar, ix: Indexed, graph: Graph, opts: { own?: OwnOrder[] } = {})` (import `type OwnOrder` from
`'../../lib/researchTrack'`); inside, `const own = opts.own ?? c.own;` and every `c.own` becomes `own` (the two
`othersBook` calls and the deps of `input` and `liveInput`). Its doc comment gains: "`own`: whose open orders come off the
books: the shown character's, or every character's on Blueprints & jobs, where a row is worked out for its own character."

- [ ] **Step 7: The section**

In `src/components/hustles/Industry.tsx`:
- `SECTIONS` gains, after `build`:
  `{ key: 'blueprints', label: 'Blueprints & jobs', tip: 'What your characters hold and have running' },`
- add `const CHAR_KEY = 'jita-ledger:industry-char';` and
  `const forget = (k: string) => { try { localStorage.removeItem(k); } catch { /* just not kept */ } };`;
- the filter, after `const main = chars[0];`:

```ts
  // The All-characters filter on Blueprints & jobs (Mining's rule): picking in it lets go of Show for, which then follows the
  // filter's character (the main for All). A kept character no longer on the roster falls back to All without being forgotten.
  const [keptFilter, setKeptFilter] = useState<number | 'all'>(() => { const v = readKept(CHAR_KEY); return v && v !== 'all' && Number(v) ? Number(v) : 'all'; });
  const filter: number | 'all' = keptFilter !== 'all' && chars.some((c) => c.charId === keptFilter) ? keptFilter : 'all';
  const chooseFilter = (v: number | 'all') => { setKeptFilter(v); keep(CHAR_KEY, String(v)); setKeptShow(null); forget(SHOW_KEY); };
```

  and `shown` becomes
  `const shown = chars.find((c) => c.charId === keptShow) ?? (filter !== 'all' ? chars.find((c) => c.charId === filter) : undefined) ?? main;`
  (`keptShow` is read after the filter's line; move `useState` for it above if needed so both exist);
- inside the `PilotProvider`, after the Build line:
  `{section === 'blueprints' && <IndustryOwned chars={chars} filter={filter} onFilter={chooseFilter} shown={shown} ix={ix} graph={graph} />}`
  and import `IndustryOwned` from `'./IndustryOwned'`;
- the file's header comment: "Start, Build and Blueprints & jobs; stages 3 and 4 add Copies and Home markets".

Create `src/components/hustles/IndustryOwned.tsx`:

```tsx
import { useMemo } from 'react';
import { Factory, FlaskConical, ScrollText } from 'lucide-react';
import { fmtShort, iskBig, iskBigSigned, units } from '../../lib/format';
import { navigate, useNow } from '../../lib/hooks';
import { nameOf, type Indexed } from '../../lib/industry';
import { beforeSaid, finderSkills } from '../../lib/industryLadder';
import { blueprintKinds, charInput, charRows, fleetTotals, nextResearch, readWhy, type CharIn } from '../../lib/industryOwned';
import { buildRow } from '../../lib/industryRank';
import { ACTIVITY_SAID, isStationId, isStructureId, type JobRecord } from '../../lib/industryTrack';
import type { Graph } from '../../lib/jumps';
import { lostSaid } from '../../lib/pilot';
import { ROMAN, trainSaid } from '../../lib/skillStatus';
import { jobWaiting } from '../../lib/todo';
import { Points } from '../Facts';
import { Seg, Th, Tiles } from '../ui';
import type { IndustryChar } from './industryChars';
import { useFinder, useStationSaid } from './industryFinder';

const DAY = 86_400_000;

/**
 * Blueprints & jobs (docs/notes/industry.md, stage 2): what each character holds and has running. Your characters (slots,
 * jobs ready, blueprints, the skills for the next rung), the filter's tiles, every blueprint kind with what it builds at
 * the default site (worked out at its own character's skills and fees, under All too), and every job. Reads each alt's
 * pulled copy through `chars`, writes nothing.
 */
export function IndustryOwned({ chars, filter, onFilter, shown, ix, graph }: {
  chars: IndustryChar[]; filter: number | 'all'; onFilter: (v: number | 'all') => void; shown: IndustryChar; ix: Indexed; graph: Graph;
}) {
  const now = useNow(60_000);
  const picked = filter === 'all' ? chars : chars.filter((c) => c.charId === filter);
  const ins: CharIn[] = useMemo(() => chars.map((c) => ({
    charId: c.charId, name: c.name, isMain: c.isMain, clone: c.clone, skills: finderSkills(c.pilot.skills, c.clone),
    sp: c.pilot.skillSp, attrs: c.pilot.attributes, jobs: c.jobs, blueprints: c.blueprints, lost: c.pilot.lost,
  })), [chars]);
  const rows = useMemo(() => charRows(ix, ins, now), [ix, ins, now]);
  const shownRows = rows.filter((r) => picked.some((c) => c.charId === r.charId));
  // The table's totals are every character's; the tiles follow the filter.
  const fleetAll = fleetTotals(rows), fleet = fleetTotals(shownRows);
  // Every character's open orders come off the books, so a row worked out for one isn't selling into another's bid.
  const own = useMemo(() => chars.flatMap((c) => c.own), [chars]);
  // The finder's inputs from a character whose skills and fee are read: the shown one when they are, else the first that has
  // them (pre-flight M11). Each row is then worked out at its own character's (charInput); one whose character's skills
  // aren't read says so on the row.
  const readOk = (c: IndustryChar) => !!finderSkills(c.pilot.skills, c.clone) && c.feeKnown;
  const base = (readOk(shown) ? shown : chars.find(readOk)) ?? shown;
  const f = useFinder(base, ix, graph, { own });
  const kinds = useMemo(() => blueprintKinds(picked.flatMap((c) => (c.blueprints.state === 'read' ? [{ charId: c.charId, name: c.name, owned: c.blueprints.value }] : []))), [picked]);
  const jobs = useMemo(() => picked.flatMap((c) => (c.jobs.state === 'read' ? c.jobs.value.map((j) => ({ c, j })) : [])), [picked]);
  const stationIds = useMemo(() => [...new Set([...kinds.flatMap((k) => k.where.map((w) => w[0])), ...jobs.map((x) => x.j.stationId)].filter(isStationId))], [kinds, jobs]);
  const station = useStationSaid(stationIds, ix, graph);
  const whose = (c: IndustryChar) => (c.isMain ? 'your' : `${c.name}’s`);
  /** A place by its name: a station by ESI's, a container, ship or structure by the doc's (`''`: it has none, or can't be seen). */
  const placeSaid = (c: IndustryChar, id: number): string => {
    if (isStationId(id)) return station(id);
    const n = c.places[String(id)];
    if (n) return n;
    if (isStructureId(id)) return n === '' ? `a structure ${whose(c)} login can’t see` : 'a structure (not named yet)';
    return n === '' ? 'a container or ship you haven’t named' : 'a container or ship (not named yet)';
  };
  const charOf = (id: number) => chars.find((c) => c.charId === id)!;
  const many = chars.length > 1;
  const all = filter === 'all';

  const running = jobs.filter(({ j }) => j.status === 'active' || j.status === 'paused' || j.status === 'ready').sort((a, b) => Date.parse(a.j.end) - Date.parse(b.j.end));
  const done = jobs.filter(({ j }) => (j.status === 'delivered' || j.status === 'cancelled' || j.status === 'reverted') && now - Date.parse(j.completed ?? j.end) <= 30 * DAY)
    .sort((a, b) => Date.parse(b.j.completed ?? b.j.end) - Date.parse(a.j.completed ?? a.j.end));
  const product = (j: JobRecord) => nameOf(ix, j.productTypeId ?? j.blueprintTypeId);
  const slotSaid = (s: { used: number | null; of: number } | null) => (s ? (s.used != null ? `${units(s.used)} of ${units(s.of)} in use` : `${units(s.of)}, in use not read`) : '–');

  return (
    <section className="col" style={{ gap: 14 }} aria-label="Blueprints & jobs" data-industry="owned">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>What your characters hold and have running.</p>
        <Points compact items={[
          { kind: 'info', icon: ScrollText, lead: 'Blueprints', text: 'as each character holds them, with what each builds at your build site.' },
          { kind: 'info', icon: Factory, lead: 'Slots in use', text: 'count jobs running and ones finished but not delivered: a finished job holds its slot until delivered.' },
          { kind: 'info', icon: FlaskConical, lead: 'Read', text: 'yours with each sync and hourly by the cloud; an alt’s hourly by the cloud.' },
        ]} />
      </div>
      {many && (
        <div data-industry="char-filter">
          <Seg<number | 'all'> size="sm" label="Characters" value={filter} onChange={onFilter}
            options={[{ v: 'all', label: 'All', tip: 'Every character’s blueprints and jobs' }, ...chars.map((c) => ({ v: c.charId, label: c.name, tip: `${c.name}’s blueprints and jobs; Show for follows` }))]} />
        </div>
      )}

      <span className="lbl">Your characters</span>
      <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
        <table className="tbl compact rd-table ind-chars" data-industry="chars">
          <thead><tr>
            <Th left>Character</Th>
            <Th className="rd-wide" tip={'Factory slots in use of the slots its skills give.\n\n• In use: jobs running, and ones finished but not delivered: a finished job holds its slot until it’s delivered.\n• Slots: 1, plus Mass Production and Advanced Mass Production.'}>Factory slots</Th>
            <Th className="rd-wide" tip="Science slots (research, copying, invention) in use of the slots Laboratory Operation and Advanced Laboratory Operation give.">Science slots</Th>
            <Th className="rd-wide">Jobs ready</Th>
            <Th className="rd-wide">Originals</Th>
            <Th className="rd-wide">Copies</Th>
            <Th left className="rd-wide" tip="The first rung of Start’s ladder whose skills it lacks, and the training time to it at its attributes.">Next rung</Th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const nothing = r.factory == null && r.ready == null && r.originals == null;
              const next = r.next === 'top' ? 'Every rung’s skills trained' : r.next == null ? '–'
                : `${r.next.title}: ${r.next.lacking.map((l) => `${l.name} ${ROMAN[l.level]}${l.omega ? ' (needs Omega)' : ''}`).join(', ')}${r.next.days != null ? ` · ${trainSaid(r.next.days * DAY)}` : ''}`;
              return (
                <tr key={r.charId} data-char={r.charId}>
                  <td className="l rd-main">
                    <span className="nm">{r.name}</span>
                    {r.why && <span className="sub">{r.why}</span>}
                    {!nothing && <span className="rd-phone"><span>Factory: {slotSaid(r.factory)}</span><span>Science: {slotSaid(r.science)}</span><span>Ready: {r.ready ?? '–'} · Originals: {r.originals ?? '–'} · Copies: {r.copies ?? '–'}</span><span>{next}</span></span>}
                  </td>
                  {nothing ? <td className="l rd-wide note small" colSpan={6}>{r.why}</td> : (<>
                    <td className="rd-wide">{slotSaid(r.factory)}</td>
                    <td className="rd-wide">{slotSaid(r.science)}</td>
                    <td className="rd-wide">{r.ready ?? '–'}</td>
                    <td className="rd-wide">{r.originals ?? '–'}</td>
                    <td className="rd-wide">{r.copies ?? '–'}</td>
                    <td className="l rd-wide">{next}</td>
                  </>)}
                </tr>
              );
            })}
            {many && (
              <tr className="ind-total" data-char="all">
                <td className="l rd-main"><span className="nm">All characters</span><span className="sub">{`Jobs read for ${fleetAll.jobsRead} of ${fleetAll.of}, blueprints for ${fleetAll.bpsRead} of ${fleetAll.of}`}</span></td>
                <td className="rd-wide">{fleetAll.factory ? `${units(fleetAll.factory.used)} of ${units(fleetAll.factory.of)} in use` : '–'}</td>
                <td className="rd-wide">{fleetAll.science ? `${units(fleetAll.science.used)} of ${units(fleetAll.science.of)} in use` : '–'}</td>
                <td className="rd-wide">{fleetAll.ready ?? '–'}</td>
                <td className="rd-wide">{fleetAll.originals ?? '–'}</td>
                <td className="rd-wide">{fleetAll.copies ?? '–'}</td>
                <td className="rd-wide" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div data-industry="owned-tiles">
        <Tiles min={170} items={[
          { l: 'Originals', v: fleet.originals != null ? units(fleet.originals) : '–', n: fleet.bpsRead < fleet.of ? `${fleet.bpsRead} of ${fleet.of} read` : all && many ? 'every character' : undefined },
          { l: 'Copies', v: fleet.copies != null ? units(fleet.copies) : '–' },
          { l: 'Factory slots', v: fleet.factory ? `${units(fleet.factory.used)} / ${units(fleet.factory.of)}` : '–', n: 'in use of slots' },
          { l: 'Science slots', v: fleet.science ? `${units(fleet.science.used)} / ${units(fleet.science.of)}` : '–', n: 'in use of slots' },
          { l: 'Jobs ready', v: fleet.ready != null ? units(fleet.ready) : '–', n: fleet.jobsRead < fleet.of ? `${fleet.jobsRead} of ${fleet.of} read` : 'to deliver in the Industry window' },
        ]} />
      </div>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="lbl">Blueprints</span>
      </div>
      {f.waiting && <p className="note small" style={{ margin: 0 }} data-industry="owned-wait">{f.waiting.text}</p>}
      {kinds.length ? (
        <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
          <table className="tbl compact rd-table ind-bps" data-industry="bp-list">
            <thead><tr>
              <Th left>Blueprint</Th><Th className="rd-wide">Held</Th><Th left className="rd-wide">Where</Th>
              <Th className="rd-wide" tip={`What it makes a day in one factory slot at ${f.site?.name ?? 'your build site'}, at its own ME, TE and runs, at its own character’s skills and fees.`}>Builds a day</Th>
              <Th left className="rd-wide">Next research</Th>
            </tr></thead>
            <tbody>
              {kinds.map((k) => {
                const c = charOf(k.charId);
                const bp = ix.bp.get(k.typeId);
                const sk = finderSkills(c.pilot.skills, c.clone);
                const inp = f.input ? charInput(f.input, { skills: sk, clone: c.clone, broker: c.broker, tax: c.tax, mines: c.mines }) : null;
                const row = bp && bp[2] && inp ? buildRow({ ...inp, bp, me: k.me, te: k.te, copyRuns: k.copy ? k.runs : null, held: true }) : null;
                const builds = !bp || !bp[2] ? 'builds nothing the finder knows' : !f.input ? '–' : !sk ? `–: ${whose(c)} skills aren’t read` : row?.day ? `${iskBigSigned(row.day.profit)}${beforeSaid([row], f.hub?.short).length ? `, before ${beforeSaid([row], f.hub?.short).join(' and ')}` : ''}` : '–: not priced at this site';
                const step = bp ? nextResearch({ ix, bp, me: k.me, te: k.te, copy: k.copy, skills: sk ?? {}, clone: c.clone, lab: f.lab?.site ?? null, adjusted: f.input?.adjusted ?? null }) : 'none';
                const stepSaid = step === 'copy' ? 'a copy can’t be researched' : step === 'done' ? 'fully researched' : step === 'none' ? '–'
                  : `${step.what.toUpperCase()} ${step.from} → ${step.to}: ${trainSaid(step.seconds * 1000)}${step.cost != null ? ` and ${iskBig(step.cost)}` : ''} at ${f.lab?.at ?? 'an NPC station with a Laboratory'}${sk ? '' : ' (skills not read: at none)'}`;
                const kind = k.copy ? `Copy · ${units(k.runs ?? 0)} run${k.runs === 1 ? '' : 's'} · ME ${k.me} / TE ${k.te}` : k.unused ? 'Original, unused' : `Original · ME ${k.me} / TE ${k.te}`;
                const where = k.where.map(([id, n]) => `${placeSaid(c, id)}${k.where.length > 1 ? ` (${units(n)})` : ''}`).join(', ');
                return (
                  <tr key={k.key} data-bp-kind={k.typeId}>
                    <td className="l rd-main">
                      <span className="nm">{nameOf(ix, k.typeId)}</span>
                      <span className="sub">{kind}{all && many ? ` · ${k.name}` : ''}</span>
                      {/* Each kind to the Blueprints page, which prices it (spec: "Price for selling"). That page reads your own
                          blueprints only, so an alt's kinds have no link: its tip says so. */}
                      {c.isMain
                        ? <button type="button" className="link-btn" data-industry="price-for-selling" onClick={() => navigate(`blueprints?type=${k.typeId}`)}>Price for selling</button>
                        : <span className="sub" data-tip={`The Blueprints page prices your own blueprints; ${c.name}’s are read by the cloud and aren’t priced there.`}>Price for selling: the Blueprints page prices yours only</span>}
                      <span className="rd-phone"><span>{units(k.count)} held · {where}</span><span>Builds: {builds}</span><span>{stepSaid}</span></span>
                    </td>
                    <td className="rd-wide">{units(k.count)}</td>
                    <td className="l rd-wide">{where}</td>
                    <td className="rd-wide">{builds}</td>
                    <td className="l rd-wide">{stepSaid}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="note small" style={{ margin: 0 }} data-industry="bp-none">
          {picked.every((c) => c.blueprints.state === 'read') ? (all && many ? 'None of your characters holds a blueprint.' : `${shown.isMain ? 'You hold' : `${picked[0]?.name} holds`} no blueprints.`)
            : picked.map((c) => readWhy(c, c.blueprints, 'blueprints') ?? '').filter(Boolean).join(' ')}
        </p>
      )}

      <span className="lbl">Jobs running and ready</span>
      {running.length ? (
        <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
          <table className="tbl compact rd-table ind-jobs" data-industry="jobs-running">
            <thead><tr><Th left>Job</Th><Th className="rd-wide">Runs</Th><Th left className="rd-wide">Where</Th><Th className="rd-wide">Time left</Th></tr></thead>
            <tbody>
              {running.map(({ c, j }) => {
                const left = jobWaiting(j, now) ? 'Ready to deliver' : j.status === 'paused' ? 'Paused (the facility is offline)' : trainSaid(Date.parse(j.end) - now);
                return (
                  <tr key={`${c.charId}:${j.jobId}`} data-job={j.jobId}>
                    <td className="l rd-main"><span className="nm">{ACTIVITY_SAID[j.activity] ?? 'Job'}: {product(j)}</span>{all && many && <span className="sub">{c.name}</span>}
                      <span className="rd-phone"><span>{units(j.runs)} run{j.runs === 1 ? '' : 's'} · {placeSaid(c, j.stationId)}</span><span>{left}</span></span></td>
                    <td className="rd-wide">{units(j.runs)}</td>
                    <td className="l rd-wide">{placeSaid(c, j.stationId)}</td>
                    <td className="rd-wide">{left}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="note small" style={{ margin: 0 }} data-industry="jobs-none">{picked.every((c) => c.jobs.state === 'read') ? 'Nothing running or waiting to be delivered.' : picked.map((c) => readWhy(c, c.jobs, 'jobs') ?? '').filter(Boolean).join(' ')}</p>}

      {done.length > 0 && (<>
        <span className="lbl">Finished in the last 30 days</span>
        <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
          <table className="tbl compact rd-table ind-jobs" data-industry="jobs-done">
            <thead><tr><Th left>Job</Th><Th className="rd-wide">Runs</Th><Th left className="rd-wide">Where</Th><Th className="rd-wide">Finished</Th><Th className="rd-wide" tip="What EVE charged for the job: its installation fee and the facility tax (ESI's own figure).">What it cost</Th></tr></thead>
            <tbody>
              {done.map(({ c, j }) => (
                <tr key={`${c.charId}:${j.jobId}`} data-job={j.jobId}>
                  <td className="l rd-main"><span className="nm">{ACTIVITY_SAID[j.activity] ?? 'Job'}: {product(j)}</span><span className="sub">{j.status === 'delivered' ? 'Delivered' : j.status === 'cancelled' ? 'Cancelled' : 'Reverted'}{all && many ? ` · ${c.name}` : ''}</span>
                    <span className="rd-phone"><span>{units(j.runs)} run{j.runs === 1 ? '' : 's'} · {placeSaid(c, j.stationId)}</span><span>{fmtShort(j.completed ?? j.end)} · cost {j.cost != null ? iskBig(j.cost) : '–'}</span></span></td>
                  <td className="rd-wide">{units(j.runs)}</td>
                  <td className="l rd-wide">{placeSaid(c, j.stationId)}</td>
                  <td className="rd-wide">{fmtShort(j.completed ?? j.end)}</td>
                  <td className="rd-wide" data-cost={j.jobId}>{j.cost != null ? iskBig(j.cost) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
      {picked.map((c) => (c.jobs.state === 'read' && c.pilot.lost ? <p key={c.charId} className="note small" style={{ margin: 0 }}>{c.name}: as the cloud last read it. {lostSaid(c)}</p> : null))}
    </section>
  );
}
```

In `src/styles.css`, beside the `.ind-sites` rules: `.ind-chars td.rd-main, .ind-bps td.rd-main, .ind-jobs td.rd-main { min-width: 220px; }`
and `.ind-total td { border-top: 1px solid var(--line-3); }` (the phone block already folds `.rd-table`).

- [ ] **Step 8: The notes**

- `.claude/rules/industry.md`: add `industryOwned` to the `src/lib/{…}` line and `IndustryOwned.tsx` to the hustles line.
- `docs/notes/industry.md`, **Stage 2**: **Blueprints & jobs** (the section's parts and words; a character's read states
  and that read data wins over a lost login, said with `lostSaid`; slots in use counting ready jobs (correction 13); a
  blueprint row worked out at its own character's skills and fees under All, with every character's open orders off the
  books (`useFinder`'s `own`); a held copy never invented again (`held`, correction 12); where a blueprint sits, named
  from the doc (correction 4) and stations by ESI; the next research step at the lab; the filter's rule (Mining's)).
- `docs/notes/characters.md`: in "What keeps an alt's rows out of the ledger", the Industry tab's sentence gains "and,
  since stage 2, each alt's blueprints and jobs (Blueprints & jobs)".
- `docs/notes/limits.md`: add "**Slots in use count finished jobs not yet delivered**: players report a finished job holds
  its slot until it's delivered (EVE University's "Industry" page doesn't say); if the game frees it sooner, in use reads
  high by the ready jobs until they're delivered. **An alt's blueprints and jobs are as of the cloud's last hourly read**, and where a blueprint
  sits is named once per place (renaming a container in game shows on the next new place only)."

- [ ] **Step 9: The page case**

In `scripts/pages.mjs`, above `// --- the end of the industry case`, add:

```js
    // --- Task 10A: Blueprints & jobs. The main holds an original and a copy and runs jobs; Builder Alt was read; Fresh Alt
    // wasn't; Lost Alt was refused with nothing read; Stale Alt was refused after a read.
    {
      const STALE = 900094;
      const j = (jobId, activity, status, start, end, over = {}) => ({ jobId, activity, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 10, licensedRuns: 40, successfulRuns: null, probability: null,
        cost: 1234567, facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: iso(start), end: iso(end), completed: null, status, perRun: 1, seenAt: iso(start + 300_000), ...over });
      const mainJobs = { 9101: j(9101, 1, 'active', now - 7200_000, now + 5 * 3600_000), 9102: j(9102, 1, 'ready', now - 9 * 3600_000, now - 3600_000),
        9103: j(9103, 1, 'delivered', now - 2 * 86400_000, now - 86400_000, { completed: iso(now - 86400_000 + 600_000), cost: 17213916 }) };
      const mainBps = { list: [[7001, 25895, 60003760, 'Hangar', -1, -1, 10, 20], [7002, 25895, 1030000001, 'Hangar', -2, 40, 10, 20]], names: { 1030000001: 'Blueprints' } };
      const builderJobs = { 9201: { ...j(9201, 5, 'active', now - 3600_000, now + 3600_000), blueprintId: 8001 } };
      // Logins handed over with the blueprints and jobs permissions (the plain entries' lack them, which reads "hand it over again").
      const IND_SCOPES = [...altStore.roster.list[0].scopes, 'esi-characters.read_blueprints.v1', 'esi-industry.read_character_jobs.v1'];
      const altStore2 = {
        ...altStore,
        roster: { at: now - 60_000, list: [...altStore.roster.list.map((e) => (e.charId === LOST ? e : { ...e, scopes: IND_SCOPES })), entry(STALE, 'Stale Alt', { scopes: IND_SCOPES, refusedAt: now - 3600_000, refused: 'invalid_grant' })] },
        [`alt:${BUILDER}`]: { ...altStore[`alt:${BUILDER}`], records: { jobs: builderJobs }, docs: { ...altStore[`alt:${BUILDER}`].docs, meta: { ...altStore[`alt:${BUILDER}`].docs.meta, jobsRead: true }, blueprints: { list: [[8001, 25895, 60003760, 'Hangar', -1, -1, 4, 0]] } } },
        [`alt:${STALE}`]: { rev: 3, addedAt: now - 5 * 86400_000, records: {}, docs: { skills: { 3380: 2 }, meta: { attributes: ATTRS, jobsRead: true }, blueprints: { list: [[8101, 25895, 60003760, 'Hangar', -1, -1, 0, 0]] } } },
      };
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, jobs: mainJobs, blueprints: mainBps, meta: { ...ledger.meta, blueprintsAt: iso(now - 600_000), jobsRead: true, industry: { at: iso(now - 600_000), jobs: [], places: {} } }, industry: DOC, cloud: CLOUD_STATE },
        { alts: altStore2, cache: { prospects: SCAN } });
      await page.goto(`${BASE}#hustles/industry/blueprints`);
      await page.waitForSelector('[data-industry="owned"]', { timeout: 30_000 }).catch(() => problems.push('Blueprints & jobs never drew'));
      await page.waitForTimeout(1500);
      const row = (id) => text(`[data-industry="chars"] [data-char="${id}"]`);
      const mainRow = await row(ownerAuth().characterId);
      if (!mainRow.includes('2 of 5 in use') || !mainRow.includes('0 of 4 in use')) problems.push(`the main’s slots in use aren’t said: “${mainRow}”`);
      if (!(await row(BUILDER)).includes('1 of 2 in use')) problems.push(`Builder Alt’s copy job isn’t a science slot in use: “${await row(BUILDER)}”`);
      if (!(await row(FRESH)).includes('Not read yet: Fresh Alt’s industry jobs and blueprints come with the cloud’s next hourly read.') || /\b0 of\b/.test(await row(FRESH))) problems.push(`Fresh Alt, not read, isn’t said as such (or shows zeros): “${await row(FRESH)}”`);
      if (!(await row(LOST)).includes('EVE refused Lost Alt’s login; hand it over again on the Characters page.')) problems.push(`Lost Alt’s refused login isn’t said: “${await row(LOST)}”`);
      if (!(await row(STALE)).includes('As the cloud last read it. EVE refused Stale Alt’s login')) problems.push(`Stale Alt’s read isn’t said as the cloud’s last: “${await row(STALE)}”`);
      if (!(await text('[data-industry="chars"] [data-char="all"]')).includes('Jobs read for 3 of 5, blueprints for 3 of 5')) problems.push(`the totals don’t say how many were read: “${await text('[data-industry="chars"] [data-char="all"]')}”`);
      const bps = await text('[data-industry="bp-list"]');
      if (!bps.includes('Blueprints') || !bps.includes('Copy · 40 runs · ME 10 / TE 20')) problems.push(`the copy in the container named Blueprints isn’t listed: “${bps.slice(0, 300)}”`);
      if (!bps.includes('ME 4 → 5:')) problems.push(`Builder Alt’s ME 4 original doesn’t give its next research step: “${bps.slice(0, 300)}”`);
      if (!(await text('[data-industry="jobs-running"]')).includes('Ready to deliver')) problems.push('the ready job doesn’t say so');
      if (!(await text('[data-industry="jobs-done"]')).includes('17.21 M')) problems.push('the finished job doesn’t say what EVE charged');
      if ((await page.locator('[data-industry="bp-list"] [data-industry="price-for-selling"]').count()) !== 2) problems.push('the main’s two blueprint kinds don’t each link to the Blueprints page to price them');
      // The filter: Builder Alt alone, and Show for follows.
      await page.locator('[data-industry="char-filter"] button', { hasText: 'Builder Alt' }).click(); await page.waitForTimeout(600);
      const tilesB = await tiles('[data-industry="owned-tiles"]');
      if (tilesB.Originals?.[0] !== '1' || tilesB['Science slots']?.[0] !== '1 / 2') problems.push(`filtered to Builder Alt, the tiles aren’t its own: ${JSON.stringify(tilesB)}`);
      if (!(await page.locator('[aria-label="Show for"] button[aria-pressed="true"]', { hasText: 'Builder Alt' }).count())) problems.push('picking Builder Alt in the filter doesn’t move Show for');
      await page.locator('[data-industry="char-filter"] button', { hasText: 'All' }).click(); await page.waitForTimeout(400);
      // Show for an alt whose skills aren't read: under All, the others' rows are still worked out (pre-flight M11).
      await showFor('Lost Alt');
      if ((await text('[data-industry="owned-wait"]')).includes('skills aren’t read')) problems.push('with Show for on an alt not read, every blueprint row waits on its skills');
      await page.locator('[data-industry="char-filter"] button', { hasText: 'All' }).click(); await page.waitForTimeout(400);
      const fit = await sideways(page, '[data-industry="bp-list"]');
      if (!PHONE && fit && fit.over > 0) problems.push(`the blueprints table scrolls sideways at 1,440 (${fit.over} px)`);
      if (SHOTS) { await page.locator('[data-industry="owned"]').scrollIntoViewIfNeeded().catch(() => undefined); await page.screenshot({ path: `${SHOTS}-industry-owned.png`, fullPage: true }); }
      // A ledger from before stage 2: meta.industry lists a running job, but no stage-2 read has happened (pre-flight M1).
      // Its jobs read as not read, never "0 of 5 in use" or "Nothing running". (The stand-in login holds no permission, so
      // "not read" is said as "log in again"; with the permission it would be "Not read yet: … the next sync".)
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, blueprints: mainBps, meta: { ...ledger.meta, blueprintsAt: iso(now - 600_000), industry: { at: iso(now - 600_000), places: {},
        jobs: [{ jobId: 9101, activity: 1, blueprintTypeId: 25895, productTypeId: 25894, runs: 10, end: iso(now + 5 * 3600_000), status: 'active', stationId: 60003760 }] } }, industry: DOC, cloud: CLOUD_STATE },
        { alts: altStore2, cache: { prospects: SCAN } });
      await page.goto(`${BASE}#hustles/industry/blueprints`);
      await page.waitForSelector('[data-industry="chars"]', { timeout: 30_000 }).catch(() => problems.push('Blueprints & jobs never drew on a stage-1 ledger'));
      const old = await row(ownerAuth().characterId);
      if (!old.includes('Log in again: this login wasn’t given EVE’s permission to read your industry jobs.') || old.includes('0 of 5 in use') || old.includes('in use not read') === false) problems.push(`a stage-1 meta.industry reads as a jobs read: “${old}”`);
    }
```

Planted, each failing this block, then undone: `industryChars` back to `meta.industry ||` (the stage-1 ledger reads "0 of 5
in use"); `useFinder(shown, …)` in IndustryOwned (Show for Lost Alt leaves every row waiting); the per-row link dropped.

(`DOC` and `SCAN` are the finder block's; this block sits after them. `Seg` marks its pick with `aria-pressed`. Fix a figure only when the rule drawing it is right: the main's 5 and 4 slots are
its Mass Production IV and Laboratory Operation III; its jobs 9101 running and 9102 ready make 2 factory slots in use.)

- [ ] **Step 10: A look in a browser**

Run `SHOTS=.playwright-mcp/industry2/10a LEDGER=industry npm run check-pages` and `… npm run check-phone`, open the
`*-industry-owned.png` at both widths: no table past the edge, the not-read rows one sentence across, no "0" for anything
not read.

- [ ] **Step 11: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass; `scripts/income-golden.json` unchanged.

- [ ] **Step 12: Commit**

```bash
git add src/lib/industryOwned.ts src/lib/industryTrack.ts src/lib/industryRank.ts src/lib/pilot.ts src/components/hustles/researchChars.ts src/components/hustles/industryChars.ts src/components/hustles/industryFinder.ts src/components/hustles/Industry.tsx src/components/hustles/IndustryOwned.tsx src/styles.css scripts/check.mjs scripts/pages.mjs .claude/rules/industry.md docs/notes/industry.md docs/notes/characters.md docs/notes/limits.md
git commit -m "$(cat <<'EOF'
Industry stage 2: Blueprints & jobs, every character's slots, blueprints and jobs

The reads landed but nothing showed them. The tab gains Blueprints & jobs: Your characters (slots in use of the slots their
skills give, jobs ready, originals and copies, the skills for the next rung with their training time), tiles for the
filter's characters, every blueprint kind with what it builds a day at the default site (worked out at its own
character's skills and fees, every character's orders off the books) and its next research step, and every job running,
ready and finished. An alt not read says so across its row, never zeros; one refused after a read keeps what was read and
says it's the cloud's last read (lostSaid, moved to pilot.ts for both tabs). A Tech II copy you hold is built as it is:
buildRow costed invention again for every Tech II blueprint.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
)"
```

---
### Task 10B: Start reads what's held and run; the Tech II tile's levels; the Blueprints page on the document

**Files:**
- Modify: `src/lib/industryOwned.ts` (`readsWhy`, `rungDone`; `charRows` uses `readsWhy`),
  `src/components/hustles/IndustryStart.tsx`, `src/components/hustles/IndustryDetail.tsx` (the Tech II chance tile),
  `src/components/Blueprints.tsx`, `scripts/check.mjs`, `scripts/pages.mjs`, `docs/notes/industry.md`

**Interfaces:**
- Consumes: `IndustryChar.blueprints`, `.jobs` (Task 10A); `slotsUsed` (Task 10A); `readBlueprintsNow` (Task 9A);
  `productKind` (industryRank.ts); `ROMAN` (skillStatus.ts).
- Produces:
  - `src/lib/industryOwned.ts`: `readsWhy(c, jobs, blueprints): string | null`,
    `rungDone(ix, key, reads, now): string | null` (`reads: { jobs: JobRecord[] | null; blueprints: OwnedBlueprint[] | null }`),
    `RUNG_DONE_DAYS` (90).
  - Start's `data-industry="here"` sentence names what the reads show, or why they aren't; each rung's
    `data-rung-done` line; the slot tiles' "N in use".
  - The Blueprints page reads `d.blueprints` with `meta.blueprintsAt`; its button runs `readBlueprintsNow` and writes the doc.

Corrections owned here: 14 (reads annotate the ladder; skills still decide "You're here"). Carried items 2 and 3 of
stage 1's ledger: the Tech II tile's levels in Roman numerals with no repeat, and "You're here" / slots in use from the reads.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 10A's section:

```js
console.log('\n--- Industry stage 2: Start reads what\'s held and run (industryOwned.ts, Task 10B) ---');
{
  const O = await import('../src/lib/industryOwned.ts');
  const T = await import('../src/lib/industryTrack.ts');
  const I = await import('../src/lib/industry.ts');
  const fsB = await import('node:fs');
  const ix = I.indexBundle(JSON.parse(fsB.readFileSync(new URL('../src/data/industry.json', import.meta.url))));
  const NOW6 = Date.parse('2026-10-11T12:00:00Z');
  const job = (jobId, activity, status, start, over = {}) => ({ jobId, activity, blueprintId: 1, blueprintTypeId: 25895, productTypeId: 25894, runs: 1, licensedRuns: null, successfulRuns: null, probability: null,
    cost: 1, facilityId: 1, stationId: 1, outputId: 1, start, end: start, completed: null, status, perRun: 1, seenAt: start, ...over });
  const jobs = [job(1, 1, 'delivered', '2026-10-01T00:00:00Z'), job(2, 1, 'active', '2026-10-11T00:00:00Z'), job(3, 1, 'cancelled', '2026-10-05T00:00:00Z'), job(4, 1, 'delivered', '2026-06-01T00:00:00Z'),
    job(5, 4, 'delivered', '2026-10-02T00:00:00Z'), job(6, 5, 'active', '2026-10-10T00:00:00Z'), job(7, 8, 'ready', '2026-10-09T00:00:00Z'), job(8, 1, 'active', '2026-10-10T00:00:00Z', { productTypeId: 23757 })];
  const owned = T.ownedOf({ list: [[10, 25895, 1, 'Hangar', -1, -1, 10, 20], [11, 25895, 1, 'Hangar', -1, -1, 0, 0], [12, 25895, 1, 'Hangar', -2, 40, 10, 20]] });
  const r = { jobs, blueprints: owned };
  // Jobs 1 and 2 count; 3 was cancelled, 4 is from June, 8 built a capital (rung 7's).
  eq('  rung 1: manufacturing jobs in the last 90 days (cancelled, older and capital ones not counted)', O.rungDone(ix, 'npc', r, NOW6), '2 manufacturing jobs in the last 90 days');
  eq('  rung 2: research jobs and originals researched', O.rungDone(ix, 'research', r, NOW6), '1 research job in the last 90 days; 1 original researched');
  eq('  rung 4: copy jobs and copies held; rung 6: invention jobs', [O.rungDone(ix, 'copy', r, NOW6), O.rungDone(ix, 't2', r, NOW6)], ['1 copy job in the last 90 days; 1 copy held', '1 invention job in the last 90 days']);
  eq('  rung 7: a capital built (the Archon, 23757)', O.rungDone(ix, 'capital', r, NOW6), '1 capital in the last 90 days');
  eq('  nothing read says nothing; More slots and Build at home have no reads of their own', [O.rungDone(ix, 'npc', { jobs: null, blueprints: null }, NOW6), O.rungDone(ix, 'slots', r, NOW6), O.rungDone(ix, 'home', r, NOW6)], [null, null, null]);
  eq('  readsWhy: both alike, said once', [O.readsWhy({ isMain: true, name: 'You' }, { state: 'login' }, { state: 'login' }), O.readsWhy({ isMain: false, name: 'X' }, { state: 'unread' }, { state: 'unread' }), O.readsWhy({ isMain: true, name: 'You' }, { state: 'read', value: [], at: 1 }, { state: 'read', value: [], at: 1 })],
    ['Log in again: this login wasn’t given EVE’s permission to read your industry jobs and blueprints.', 'Not read yet: X’s industry jobs and blueprints come with the cloud’s next hourly read.', null]);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 10B"`
Expected: `rungDone` and `readsWhy` not functions.

- [ ] **Step 3: `readsWhy` and `rungDone`**

Append to `src/lib/industryOwned.ts` (and import `productKind`, a value, from `'./industryRank'` in an import of its own
beside the existing `import type { LabSite } from './industryRank'`, which a value can't join; and add
`type RungKey` from `'./industryLadder'`):

```ts
/** Why a character's jobs and blueprints aren't shown, in one sentence where both are alike; null when both are read. */
export function readsWhy(c: { isMain: boolean; name: string }, jobs: Read<unknown>, bps: Read<unknown>): string | null {
  const jw = readWhy(c, jobs, 'jobs'), bw = readWhy(c, bps, 'blueprints');
  if (!jw && !bw) return null;
  if (jw && bw && jobs.state === bps.state) {
    if (jobs.state === 'unread') return c.isMain ? 'Not read yet: your industry jobs and blueprints come with the next sync.' : `Not read yet: ${c.name}’s industry jobs and blueprints come with the cloud’s next hourly read.`;
    if (jobs.state === 'login') return 'Log in again: this login wasn’t given EVE’s permission to read your industry jobs and blueprints.';
    if (jobs.state === 'handOver') return `Hand the cloud ${c.name}’s login again: it was handed over without the permission to read industry jobs and blueprints.`;
    return jw;
  }
  return [jw, bw].filter(Boolean).join(' ');
}

/** How far back a rung's jobs are counted: ESI's own 90 days of jobs, so the figure doesn't grow with the records kept. */
export const RUNG_DONE_DAYS = 90;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/**
 * What the reads show of a rung (correction 14: they annotate it; skills still decide where you stand): jobs of its activity
 * in the last 90 days (cancelled and reverted ones aren't counted), and for research and copying what's held. Null when
 * nothing is read or nothing shows; More slots (Start's tiles say slots in use) and Build at home (a site) have none.
 */
export function rungDone(ix: Indexed, key: RungKey, r: { jobs: readonly JobRecord[] | null; blueprints: readonly OwnedBlueprint[] | null }, now: number): string | null {
  const recent = (r.jobs ?? []).filter((j) => j.status !== 'cancelled' && j.status !== 'reverted' && now - Date.parse(j.start) <= RUNG_DONE_DAYS * 86_400_000);
  const n = (acts: number[], also: (j: JobRecord) => boolean = () => true) => recent.filter((j) => acts.includes(j.activity) && also(j)).length;
  const since = 'in the last 90 days';
  const parts: string[] = [];
  const jobsSaid = (count: number, what: string) => { if (r.jobs && count) parts.push(`${plural(count, `${what} job`, `${what} jobs`)} ${since}`); };
  if (key === 'npc') jobsSaid(n([1], (j) => productKind(ix, j.productTypeId ?? 0) !== 'capital'), 'manufacturing');
  else if (key === 'research') {
    jobsSaid(n([3, 4]), 'research');
    const researched = (r.blueprints ?? []).filter((b) => !b.copy && (b.me > 0 || b.te > 0)).reduce((s, b) => s + b.count, 0);
    if (r.blueprints && researched) parts.push(plural(researched, 'original researched', 'originals researched'));
  } else if (key === 'copy') {
    jobsSaid(n([5]), 'copy');
    const copies = (r.blueprints ?? []).filter((b) => b.copy).reduce((s, b) => s + b.count, 0);
    if (r.blueprints && copies) parts.push(plural(copies, 'copy held', 'copies held'));
  } else if (key === 't2') jobsSaid(n([8]), 'invention');
  else if (key === 'capital') { const c = n([1], (j) => productKind(ix, j.productTypeId ?? 0) === 'capital'); if (r.jobs && c) parts.push(`${plural(c, 'capital', 'capitals')} ${since}`); }
  return parts.length ? parts.join('; ') : null;
}
```

In `charRows`, the nothing-read branch (`c.jobs.state === 'unread' && … ? both(c) : jobsWhy === bpsWhy ? …`) becomes
`: readsWhy(c, c.jobs, c.blueprints)`, and `both` is deleted (its words now live in `readsWhy`; Task 10A's tests pin them).

- [ ] **Step 4: Run them to see them pass, then plant each rule wrong**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 10A\|Task 10B"`
Expected: no `FAIL` in either.

Plant, run, see it fail, undo:
- `rungDone`: count cancelled jobs (drop the `status` clauses): "rung 1 … cancelled, older and capital ones not counted" fails.
- `rungDone`: `RUNG_DONE_DAYS = 365`: the same test fails (job 4, June).
- `rungDone`: count capitals on rung 1 (drop its `!== 'capital'`): the same test fails (3).
- `readsWhy`: drop the `jobs.state === bps.state` branch: "both alike, said once" fails.

- [ ] **Step 5: Start**

In `src/components/hustles/IndustryStart.tsx`:
- imports: `readsWhy, rungDone, RUNG_DONE_DAYS` from `'../../lib/industryOwned'`; `slotsUsed` from `'../../lib/industryTrack'`;
  `ROMAN` from `'../../lib/skillStatus'` (and delete the local `const ROMAN = …`); `useNow` from `'../../lib/hooks'`.
- after `const s = …`:

```ts
  const now = useNow(60_000);
  // What the reads show (correction 14: they annotate; skills still decide where you stand).
  const jobs = c.jobs.state === 'read' ? c.jobs.value : null, bps = c.blueprints.state === 'read' ? c.blueprints.value : null;
  const used = jobs ? slotsUsed(jobs, now) : null;
  const reads = { jobs, blueprints: bps };
  const held = bps ? { o: bps.filter((b) => !b.copy).reduce((n, b) => n + b.count, 0), c: bps.filter((b) => b.copy).reduce((n, b) => n + b.count, 0) } : null;
  const ran = jobs ? jobs.filter((j) => j.status !== 'cancelled' && j.status !== 'reverted' && now - Date.parse(j.start) <= RUNG_DONE_DAYS * 86_400_000).length : null;
  const who = c.isMain ? 'You' : c.name;
  const readsSaid = readsWhy(c, c.jobs, c.blueprints)
    ?? `${who} hold${c.isMain ? '' : 's'} ${units(held!.o)} original${held!.o === 1 ? '' : 's'} and ${units(held!.c)} cop${held!.c === 1 ? 'y' : 'ies'}, and ran ${units(ran!)} job${ran === 1 ? '' : 's'} in the last 90 days.`;
```

  (`readsWhy` is null only when both are read, so `held` and `ran` are set there.)
- `hereSaid`'s third case becomes
  `` : `You’re on rung ${lad.here + 1}, ${lad.rungs[lad.here].rung.title}, by ${whose} skills and the sites you’ve added. ${readsSaid}${noClone}`; ``
  and its first case keeps `${why}` and adds ` ${readsSaid}` only when `readsWhy` is null (what's held is still worth
  saying with skills unread).
- the Factory slots tile's `n` becomes
  `s ? `${used ? `${units(used.factory)} in use (running, or finished and not delivered) · ` : ''}one job each; ${MAX_SLOTS} at most: 1, plus Mass Production and Advanced Mass Production` : why`,
  and the Science slots tile's the same with `used.science`; both tips gain the bullet
  `\n• In use: jobs running, and ones finished but not delivered: a finished job holds its slot until it’s delivered.`
- in each rung, after the `count` line:

```tsx
                  {(() => { const done = rungDone(ix, r.key, reads, now); return done ? <p className="note small" style={{ margin: 0 }} data-rung-done={r.key}>{c.isMain ? 'Your' : `${c.name}’s`} reads show {done}.</p> : null; })()}
```

- [ ] **Step 6: The Tech II chance tile**

In `src/components/hustles/IndustryDetail.tsx`, import `ROMAN` from `'../../lib/skillStatus'`, add above the component

```ts
/** "A", "A and B", "A, B and C". */
const andList = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
```

and the Chance tile's `n` becomes

```ts
              n: inv.chance == null ? `${c.isMain ? 'Your' : `${c.name}’s`} skills aren’t read, so the chance isn’t known` : [
                inv.needs.length ? `Needs ${andList(inv.needs.map((id) => `${name(id)} I`))} to invent; worked out at I` : null,
                // The skills it's worked out at, each once: the ones it needs are said above, at I.
                [...inv.sciences, ...(inv.encryption ? [inv.encryption] : [])].filter((x) => !inv.needs.includes(x.id)).map((x) => `${name(x.id)} ${ROMAN[x.level]}`).join(', ') || null,
                `${inv.attempts != null ? inv.attempts.toFixed(2) : '–'} attempts a copy of ${units(inv.runsPerCopy)} run${inv.runsPerCopy === 1 ? '' : 's'}, at ME ${T2_ME} / TE ${T2_TE}`,
              ].filter(Boolean).join(' · '),
```

In `scripts/pages.mjs`, the Tech II detail's expected phrase
`'Needs Hydromagnetic Physics, Nanite Engineering, Amarr Encryption Methods I to invent: at I each,'` becomes
`'Needs Hydromagnetic Physics I, Nanite Engineering I and Amarr Encryption Methods I to invent; worked out at I · 2.69 attempts'`
(the case's main has none of the three, so nothing trained follows and the attempts come next: 1 ÷ (0.34 × (1 + 2/30 +
1/40)) = 2.69), and add right after that loop:

```js
    if (/\b(Physics|Engineering|Methods) [0-5]\b/.test(inv)) problems.push('the Tech II chance tile writes a skill level in Arabic numerals');
```

- [ ] **Step 7: The Blueprints page on the document**

In `src/components/Blueprints.tsx`:
- imports: `getData, update, useData` from `'../lib/store'` (replacing the `useData` import); `readBlueprintsNow` from
  `'../lib/industryReads'`; `ownedOf` from `'../lib/industryTrack'`; `useEffect` with `useMemo, useState` from `'react'`;
  `useRoute` beside `navigate` from `'../lib/hooks'`. Drop what only the old reader used, or `npm run build` fails under
  `noUnusedLocals` (pre-flight M4): `readBlueprints` and `type RawBlueprint` from the `'../lib/blueprints'` import, the whole
  `import { esi, esiAllPages } from '../lib/esi';` line, and `structureInfo` from the `'../lib/universe'` import (keeping
  `isStation, isStructure`); `setOwned` goes with the state it belonged to.
- `const [owned, setOwned] = useState<OwnedBlueprint[] | null>(null);` becomes
  `const owned = useMemo(() => (d.blueprints ? ownedOf(d.blueprints) : null), [d.blueprints]);`
  and `places` holds stations' names only, read whenever the doc's stations change:

```ts
  // Stations by ESI's names (public); containers, ships and structures by the doc's (read with the login that holds them).
  const stationKey = [...new Set((owned ?? []).map((b) => b.locationId).filter(isStation))].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!stationKey) return;
    let alive = true;
    resolveNames(stationKey.split(',').map(Number)).then((n) => { if (alive) setPlaces(new Map(Object.entries(n).map(([id, v]) => [Number(id), v]))); }).catch(() => undefined);
    return () => { alive = false; };
  }, [stationKey]);
  const placeOf = (id: number) => places.get(id) || d.blueprints?.names?.[String(id)] || (isStation(id) || isStructure(id) ? 'A station' : 'A container');
```

- `read` becomes (one reader: the sync's, so the page and the tab read the same doc):

```ts
  // A fresh read into the `blueprints` doc (industryReads.ts, the sync's own reader), with its time: the Industry tab reads it too.
  const read = async () => {
    const a = getAuth();
    if (!a) return;
    setBusy('Reading your blueprints…');
    try {
      const doc = await readBlueprintsNow(a.characterId, getData().blueprints, { assets: hasScope(SCOPE.assets), structures: hasScope(SCOPE.structures) });
      const at = new Date().toISOString();
      update((x) => ({ blueprints: doc, meta: { ...x.meta, blueprintsAt: at } }));
      setMarket(null); setBooks(new Map());
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally { setBusy(null); }
  };
```

- in `rows`, `places.get(b.locationId) ?? (…)` becomes `placeOf(b.locationId)` (and `places` stays in the memo's deps
  with `d.blueprints`).
- **One kind, from the Industry tab's "Price for selling"** (the spec's link from each kind): `blueprints?type=<typeId>`
  shows that blueprint alone, with a line to show every one:

```ts
  // Arriving from the Industry tab's "Price for selling" (`blueprints?type=TYPE`): that blueprint's kinds alone.
  const onlyType = Number(useRoute().query.get('type')) || null;
```

  `shown`'s filter gains `(onlyType == null || r.kind.typeId === onlyType) &&`, and above the table:

```tsx
      {onlyType != null && (
        <p className="note small" style={{ margin: 0 }} data-bp-only={onlyType}>
          Showing {name(onlyType)} alone, from the Industry tab. <button type="button" className="link-btn" onClick={() => navigate('blueprints')}>Show every blueprint</button>
        </p>
      )}
```
- the Panel's `sub`: when `owned`, append `` ` · read ${ago(d.meta.blueprintsAt, now)}` `` (the stored read's time; the
  sync refreshes it); the Empty text stays "Press “Read my blueprints”…" for a doc not read yet.

- [ ] **Step 8: The page cases**

In `scripts/pages.mjs`:
- the ladder block's expected "here" sentence
  `'You’re on rung 2, Research ME first, by your skills and the sites you’ve added. Your blueprints and jobs aren’t read here yet.'`
  becomes
  `'You’re on rung 2, Research ME first, by your skills and the sites you’ve added. Log in again: this login wasn’t given EVE’s permission to read your industry jobs and blueprints.'`
  (the stand-in login carries no permissions);
- hoist Task 10A's `j`, `mainJobs` and `mainBps` out of its block to just above it (case scope), and add, above
  `// --- the end of the industry case`:

```js
    // --- Task 10B: Start with the main's reads: slots in use, what it holds and ran, each rung's reads.
    {
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, jobs: mainJobs, blueprints: mainBps, meta: { ...ledger.meta, blueprintsAt: iso(now - 600_000), jobsRead: true, industry: { at: iso(now - 600_000), jobs: [], places: {} } }, industry: DOC, cloud: CLOUD_STATE },
        { alts: altStore, cache: { prospects: SCAN } });
      await page.goto(`${BASE}#hustles/industry/start`);
      await page.reload();
      await page.waitForSelector('[data-industry="ladder"]', { timeout: 20_000 }).catch(() => problems.push('the ladder never drew with reads'));
      const here = await text('[data-industry="here"]');
      if (!here.includes('You hold 1 original and 1 copy, and ran 3 jobs in the last 90 days.')) problems.push(`Start doesn’t say what the main holds and ran: “${here}”`);
      const t = await tiles('[data-industry="where"]');
      if (!t['Factory slots']?.[1]?.startsWith('2 in use')) problems.push(`the factory slots tile doesn’t say 2 in use: ${JSON.stringify(t['Factory slots'])}`);
      if (!(await text('[data-rung-done="npc"]')).includes('Your reads show 3 manufacturing jobs in the last 90 days.')) problems.push('rung 1 doesn’t say what the reads show');
      if (!(await text('[data-rung-done="research"]')).includes('1 original researched')) problems.push('rung 2 doesn’t count the researched original');
    }
    // --- Task 10B: the Blueprints page reads the doc, with its time; no read happens by itself.
    {
      let asked = 0;
      const BP_PATH = `/characters/${ownerAuth().characterId}/blueprints/`;
      ESI[BP_PATH] = (url, req, json) => (asked++, json([]));
      await page.goto(`${BASE}#blueprints`);
      await page.waitForSelector('.page', { timeout: 20_000 });
      await page.waitForTimeout(1200);
      const bp = await text('.page');
      if (!bp.includes('2 blueprints in 2 kinds') || !/read \d+ min ago/.test(bp)) problems.push(`the Blueprints page doesn’t show the stored read with its time: “${bp.slice(0, 300)}”`);
      if (!(await page.locator('table td', { hasText: 'Blueprints' }).count())) problems.push('the Blueprints page doesn’t name the container from the doc');
      if (asked) problems.push('the Blueprints page read ESI by itself');
      // From the Industry tab's "Price for selling": one blueprint alone, and the way back to all of them.
      await page.goto(`${BASE}#blueprints?type=25895`);
      await page.waitForSelector('[data-bp-only="25895"]', { timeout: 10_000 }).catch(() => problems.push('the Blueprints page doesn’t take a blueprint from the Industry tab'));
      if (!(await text('[data-bp-only="25895"]')).includes('Show every blueprint')) problems.push('showing one blueprint, the Blueprints page has no way back to all');
      delete ESI[BP_PATH];
    }
```

("2 blueprints in 2 kinds" is the page's own `sub` wording for the original and the copy.)

- [ ] **Step 9: A look in a browser**

`SHOTS=.playwright-mcp/industry2/10b LEDGER=industry npm run check-pages` and `… npm run check-phone`: Start with reads (the
rung lines, the tiles' notes at 390 px), the Tech II detail's Chance tile, the Blueprints page.

- [ ] **Step 10: The notes**

`docs/notes/industry.md`, **Stage 2**: **Start reads what's held and run** (correction 14: annotate, not move; the 90 days;
the slot tiles), **the Tech II tile** (Roman numerals, each skill once: carried item 2 of stage 1), **the Blueprints page
on the document** (one reader, `readBlueprintsNow`; the page shows the stored read with its time and reads only on its
button; the tab and the page read the same doc). Strike stage 1's "Where you stand is by skills alone (… until stage 2)"
sentence in the ladder bullet and say what stage 2 changed instead.

- [ ] **Step 11: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass; `scripts/income-golden.json` unchanged.

- [ ] **Step 12: Commit**

```bash
git add src/lib/industryOwned.ts src/components/hustles/IndustryStart.tsx src/components/hustles/IndustryDetail.tsx src/components/Blueprints.tsx scripts/check.mjs scripts/pages.mjs docs/notes/industry.md
git commit -m "$(cat <<'EOF'
Industry stage 2: Start says what each character holds and ran; the Blueprints page reads the shared doc

Start said "your blueprints and jobs aren't read here yet" because nothing read them. Now each rung says what the reads show
(manufacturing, research, copy and invention jobs in the last 90 days, originals researched, copies held), the slot tiles
say how many are in use, and where you stand names what's held and run. Skills still decide "You're here": a character
with the skills who never ran a job isn't moved down.

The Tech II chance tile wrote levels as "Hydromagnetic Physics 1" and repeated the skills after "at I each"; it now says
"Needs Hydromagnetic Physics I, Nanite Engineering I and Amarr Encryption Methods I to invent; worked out at I".

The Blueprints page read into its own state and kept nothing; it now shows the stored blueprints doc with its time, and
its button reads afresh with the sync's own reader, so the page and the tab never disagree.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
)"
```

---
### Task 11: The job check and the measured facility tax (**Use this**)

**Files:**
- Modify: `src/lib/industryTrack.ts` (`JobPlace`, `jobPlace`, `CHECK_TOLERANCE`, `MAX_FACILITY_TAX`, `jobCostFor`,
  `jobCheck`, `measuredTax`), `src/lib/industryOwned.ts` (`measuredBySite`), `src/components/hustles/IndustryOwned.tsx`
  (the finished jobs' Checked column), `src/components/hustles/IndustrySites.tsx` (the measured tax with **Use this**),
  `src/components/hustles/IndustryBuild.tsx` and `Industry.tsx` (`chars` passed down), `scripts/check.mjs`,
  `scripts/pages.mjs`, `docs/notes/industry.md`, `docs/notes/limits.md`

**Interfaces:**
- Consumes: `JobRecord`, `checkable`, `ACTIVITY_OF`, `ACTIVITY_SAID`, `isStationId` (Task 9A); `manufacturingCost`,
  `copyCost`, `researchCost`, `inventionCost`, `structureBonus`, `rigFor`, `secBand`, `NPC_FACILITY_TAX`, `SCC_COPY`,
  `SCC_RESEARCH`, `type JobCost`, `type SiteKind`, `type SecBand`, `type Clone`, `type Indexed` (industry.ts);
  `type IndustrySite` (prefs.ts, a type import); `type Read` (Task 10A).
- Produces:
  - `src/lib/industryTrack.ts`: `type JobPlace = { kind: SiteKind; rigs: readonly number[]; band: SecBand; tax: number | null; siteId: string | null }`,
    `jobPlace(job, sites, bandOf)`, `CHECK_TOLERANCE` (0.01), `MAX_FACILITY_TAX` (0.1), `jobCostFor(ix, job, place, clone)`,
    `type JobCheck`, `jobCheck(ix, job, place, clone)`, `measuredTax(ix, job, place, clone)`.
  - `src/lib/industryOwned.ts`: `type Measured = { tax: number; at: string; who: string; isMain: boolean; jobId: number }`,
    `measuredBySite(ix, sites, chars, bandOf): Record<string, Measured | null>` (`chars: { name; isMain; clone; jobs: Read<JobRecord[]> }[]`).
  - `IndustryBuild` and `IndustrySites` take `chars: IndustryChar[]`; hooks `data-industry="check"`, `"use-measured"`.

What the spec settles here and what it leaves to the first real job: the check and the measure are built and tested on
EVE Ref's own figures; **the SCC bases of research and copying are not changed by this task**. Each NPC-station research or
copy job checked shows the SCC share EVE charged over the app's base (`sccShare`); the note says how to read it and that
the constants change only in a later commit that cites the job (spec: "recorded in the notes and then fixed in the
constants, not learned at run time").

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 10B's section:

```js
console.log('\n--- Industry stage 2: the job check and the measured tax (industryTrack.ts, Task 11) ---');
{
  const T = await import('../src/lib/industryTrack.ts');
  const O = await import('../src/lib/industryOwned.ts');
  const I = await import('../src/lib/industry.ts');
  const fsC = await import('node:fs');
  const ix = I.indexBundle(JSON.parse(fsC.readFileSync(new URL('../src/data/industry.json', import.meta.url))));
  const EIV_RUN = 157590413.44605502 / 65;
  // EVE Ref's worked job (scripts/fixtures/industry-everef.json t1): 65 runs of the pump, ME 10, in an Azbel at UALX-3 with
  // the L-Set Equipment rig, null-sec, index 6.17%, tax 1%: 17,213,916 ISK.
  const azbel = { kind: 'azbel', rigs: [37170], band: 'null', tax: 0.01, siteId: 'st:1046664001931' };
  const job = (over = {}) => ({ jobId: 701, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 65, licensedRuns: 40, successfulRuns: null, probability: null,
    cost: 17213916, facilityId: 1046664001931, stationId: 1046664001931, outputId: 1046664001931, start: '2026-10-11T10:00:00Z', end: '2026-10-12T04:00:00Z', completed: '2026-10-12T05:00:00Z',
    status: 'delivered', perRun: 1, seenAt: '2026-10-11T10:20:00Z', first: { me: 10, te: 20, systemId: 30004807, index: 0.0617, eiv: EIV_RUN }, ...over });
  const c = T.jobCheck(ix, job(), azbel, 'omega');
  eq('  EVE Ref\'s job: the app works out 17,213,916, what EVE charged; nothing said', [c.state, Math.round(c.app), c.charged, c.differs], ['checked', 17213916, 17213916, false]);
  eq('  a cost more than 1% off is said', T.jobCheck(ix, job({ cost: 17_500_000 }), azbel, 'omega').differs, true);
  const why = (j, p = azbel, clone = 'omega') => { const r = T.jobCheck(ix, j, p, clone); return r.state === 'unchecked' ? r.why : null; };
  eq('  what can\'t be checked says why', [
    why(job({ first: undefined })), why(job({ seenAt: '2026-10-11T13:10:00Z' })), why(job(), null), why(job(), { ...azbel, tax: null }), why(job(), azbel, 'unknown'), why(job({ activity: 9 })), why(job({ cost: null })),
  ], [
    'first seen after it ended: its index and EIV weren’t kept', 'first seen 3 h 10 min after it started: the index and prices may have moved since it was installed',
    'it ran at a structure that isn’t one of your build sites, so its bonuses aren’t known', 'the facility tax there isn’t typed (what the job measures is offered on the site)',
    'the clone state isn’t read, so the Alpha tax may be in it', 'Reaction isn’t modelled', 'ESI gives no cost for it',
  ]);
  eq('  the tax it measures: 1.00%, from manufacturing at your structure site, clone known', T.measuredTax(ix, job(), { ...azbel, tax: null }, 'omega'), { tax: 0.01 });
  const mwhy = (j, p = azbel, clone = 'omega') => T.measuredTax(ix, j, p, clone).why ?? null;
  eq('  where it can\'t measure, it says why and gives no figure', [mwhy(job({ activity: 5 })), mwhy(job(), { ...azbel, kind: 'npc', siteId: null }), mwhy(job(), azbel, 'unknown'), mwhy(job({ seenAt: '2026-10-11T13:10:00Z' })), mwhy(job({ cost: 54_090_000 }))], [
    'only a manufacturing job measures the facility tax', 'only a job at one of your structure sites measures its tax', 'the clone state isn’t read, so the Alpha tax may be in its cost',
    'first seen 3 h 10 min after it started: the index and prices may have moved since it was installed', 'what it measures, 24.4%, is more than a structure can charge (10%): its index or prices moved since',
  ]);
  // An ME research job in an NPC station (0.25% tax known): what EVE charged over the app's base, besides the index and the
  // tax, is its SCC share, the reading the spec says a real job settles. Charged exactly as the app works it out, it reads 2%.
  const npc = { kind: 'npc', rigs: [], band: 'high', tax: 0.0025, siteId: null };
  const res = job({ activity: 4, runs: 1, facilityId: 60003760, stationId: 60003760, first: { me: 4, te: 0, systemId: 30000142, index: 0.0014, eiv: EIV_RUN } });
  const appRes = I.researchCost(EIV_RUN, 4, 5, { index: 0.0014, structure: 1, rig: 1, tax: 0.0025, clone: 'omega' }).total;
  const rc = T.jobCheck(ix, { ...res, cost: appRes }, npc, 'omega');
  eq('  an NPC-station research job says the SCC share EVE charged', [rc.state, +rc.sccShare.toFixed(6)], ['checked', 0.02]);
  eq('  where a job ran: an NPC station by its own 0.25%; one of your structure sites by its kind, rigs and tax; any other structure: not known', [
    T.jobPlace(res, [], () => 'high'), T.jobPlace(job(), [{ id: 'st:1046664001931', name: 'x', systemId: 30004807, kind: 'azbel', structureId: 1046664001931, rigs: [37170], tax: null }], () => 'null'), T.jobPlace(job(), [], () => 'null'),
  ], [{ kind: 'npc', rigs: [], band: 'high', tax: 0.0025, siteId: null }, { kind: 'azbel', rigs: [37170], band: 'null', tax: null, siteId: 'st:1046664001931' }, null]);
  const sites = [{ id: 'st:1046664001931', name: 'x', systemId: 30004807, kind: 'azbel', structureId: 1046664001931, rigs: [37170], tax: null }];
  const m = O.measuredBySite(ix, sites, [{ name: 'You', isMain: true, clone: 'omega', jobs: { state: 'read', value: [job(), job({ jobId: 702, start: '2026-10-01T10:00:00Z', seenAt: '2026-10-01T10:20:00Z', cost: 17_300_000 })], at: 1 } }], () => 'null');
  eq('  per site, the newest job that measures, and whose', m['st:1046664001931'], { tax: 0.01, at: '2026-10-11T10:00:00Z', who: 'You', isMain: true, jobId: 701 });
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 11"`
Expected: `jobCheck`, `measuredTax`, `jobPlace`, `measuredBySite` not functions.

- [ ] **Step 3: The rules**

Add to `src/lib/industryTrack.ts`'s imports from `'./industry'`: `copyCost, inventionCost, manufacturingCost, NPC_FACILITY_TAX,
researchCost, rigFor, structureBonus, type Clone, type Indexed, type JobCost, type SecBand, type SiteKind`; and
`import type { IndustrySite } from './prefs';`. Append:

```ts
// --- What EVE charged, against what the app works out (spec, "The job check, and what it measures") -------------------

/** Where a job ran, as the app knows it: an NPC station (its 0.25% tax, no bonus), or one of your sites (its kind, rigs, band and typed tax). */
export type JobPlace = { kind: SiteKind; rigs: readonly number[]; band: SecBand; tax: number | null; siteId: string | null };
/** A cost more than this share off what EVE charged is said. */
export const CHECK_TOLERANCE = 0.01;
/** The most a structure's owner can charge (EVE University, "Tax"): a measure over it means the inputs moved. */
export const MAX_FACILITY_TAX = 0.1;

/** Where a job ran: an NPC station by its own facility tax; a structure only when it's one of your sites; else null (its bonuses aren't known). */
export function jobPlace(job: JobRecord, sites: readonly IndustrySite[], bandOf: (site: IndustrySite) => SecBand): JobPlace | null {
  if (isStationId(job.facilityId)) return { kind: 'npc', rigs: [], band: 'high', tax: NPC_FACILITY_TAX, siteId: sites.find((s) => s.stationId === job.facilityId)?.id ?? null };
  const site = sites.find((s) => s.structureId === job.facilityId);
  return site ? { kind: site.kind, rigs: site.rigs, band: bandOf(site), tax: site.tax, siteId: site.id } : null;
}

const late = (job: JobRecord): string => {
  const min = Math.round((Date.parse(job.seenAt) - Date.parse(job.start)) / 60_000);
  return `first seen ${min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`} after it started: the index and prices may have moved since it was installed`;
};

/**
 * (Named `jobCostFor`, not `jobCostOf`: that is industry.ts's rule on a base, which the cost functions below use.)
 * The cost the app works out for a job from what was kept at its first sight (the index and the EIV a run, its blueprint's
 * ME and TE for research) and where it ran: the rules of industry.ts, as the finder charges them. A reason instead when it
 * can't: not modelled, seen after it ended or too late, an input not kept, a structure that isn't your site.
 */
export function jobCostFor(ix: Indexed, job: JobRecord, place: JobPlace | null, clone: Clone): { cost: JobCost } | { why: string } {
  const act = ACTIVITY_OF[job.activity];
  if (!act) return { why: `${ACTIVITY_SAID[job.activity] ?? 'This activity'} isn’t modelled` };
  const f = job.first;
  if (!f) return { why: 'first seen after it ended: its index and EIV weren’t kept' };
  if (!checkable(job)) return { why: late(job) };
  if (f.index == null) return { why: 'the system’s index wasn’t read when it was seen' };
  if (f.eiv == null) return { why: 'its estimated item value wasn’t known when it was seen (an adjusted price was missing)' };
  if (!place) return { why: 'it ran at a structure that isn’t one of your build sites, so its bonuses aren’t known' };
  const sb = structureBonus(ix, place.kind);
  const rig = rigFor(ix, place.rigs, place.kind, place.band, act === 'manufacturing' ? job.productTypeId : null, act);
  const at = { index: f.index, structure: sb.cost, rig: rig.cost, tax: place.tax, clone };
  if (act === 'manufacturing') return { cost: manufacturingCost(f.eiv, job.runs, at) };
  if (act === 'copying') return { cost: copyCost(f.eiv, job.licensedRuns ?? 1, job.runs, at) };
  if (act === 'invention') return { cost: inventionCost(f.eiv, job.runs, at) };
  // Research: levels from the blueprint's own as kept at first sight (a TE level is 2%), a job's runs being levels.
  const from = act === 'researchMaterial' ? f.me : f.te == null ? null : Math.floor(f.te / 2);
  if (from == null) return { why: `its ${act === 'researchMaterial' ? 'ME' : 'TE'} wasn’t read when it was seen` };
  return { cost: researchCost(f.eiv, from, Math.min(10, from + job.runs), at) };
}

export type JobCheck =
  | { state: 'unchecked'; why: string }
  /** `sccShare`: at an NPC station, for research and copying, what EVE charged over the app's base besides the index part and the tax: the SCC reading a real job settles. */
  | { state: 'checked'; app: number; charged: number; parts: JobCost; differs: boolean; sccShare?: number };

/** A finished or running job's cost as EVE charged it (ESI's `cost`) against the app's; said when more than 1% apart. */
export function jobCheck(ix: Indexed, job: JobRecord, place: JobPlace | null, clone: Clone): JobCheck {
  if (job.cost == null) return { state: 'unchecked', why: 'ESI gives no cost for it' };
  const r = jobCostFor(ix, job, place, clone);
  if ('why' in r) return { state: 'unchecked', why: r.why };
  if (r.cost.tax == null) return { state: 'unchecked', why: 'the facility tax there isn’t typed (what the job measures is offered on the site)' };
  if (r.cost.alpha == null) return { state: 'unchecked', why: 'the clone state isn’t read, so the Alpha tax may be in it' };
  const app = r.cost.total, charged = job.cost;
  const act = ACTIVITY_OF[job.activity];
  const scc = place?.kind === 'npc' && (act === 'copying' || act === 'researchMaterial' || act === 'researchTime') && r.cost.base > 0
    ? (charged - (r.cost.index + r.cost.bonus + (r.cost.tax ?? 0) + (r.cost.alpha ?? 0))) / r.cost.base : null;
  return { state: 'checked', app, charged, parts: r.cost, differs: Math.abs(app - charged) > CHECK_TOLERANCE * Math.max(charged, 1), ...(scc != null ? { sccShare: scc } : {}) };
}

/**
 * The facility tax a manufacturing job at one of your structure sites paid (spec): (ESI's cost − the base × (index ×
 * bonuses + SCC + Alpha tax)) ÷ the base, to 0.01%. Only offered, with Use this, never written by itself. A reason instead
 * where it can't measure: another activity, an NPC station or a structure that isn't your site, the clone state not read
 * (the Alpha tax may be in the cost), seen too late, or a figure no structure can charge.
 */
export function measuredTax(ix: Indexed, job: JobRecord, place: JobPlace | null, clone: Clone): { tax: number; why?: undefined } | { why: string; tax?: undefined } {
  if (job.activity !== 1) return { why: 'only a manufacturing job measures the facility tax' };
  if (!place || place.kind === 'npc' || !place.siteId) return { why: 'only a job at one of your structure sites measures its tax' };
  if (clone === 'unknown') return { why: 'the clone state isn’t read, so the Alpha tax may be in its cost' };
  if (job.cost == null) return { why: 'ESI gives no cost for it' };
  const r = jobCostFor(ix, job, { ...place, tax: 0 }, clone);
  if ('why' in r) return { why: r.why };
  const tax = (job.cost - (r.cost.index + r.cost.bonus + r.cost.scc + (r.cost.alpha ?? 0))) / r.cost.base;
  if (!Number.isFinite(tax) || tax < -0.0005) return { why: 'what it measures is under nothing: its index or prices moved since' };
  if (tax > MAX_FACILITY_TAX + 0.0005) return { why: `what it measures, ${(tax * 100).toFixed(1)}%, is more than a structure can charge (10%): its index or prices moved since` };
  return { tax: Math.max(0, Math.round(tax * 10_000) / 10_000) };
}
```

Append to `src/lib/industryOwned.ts` (imports `jobPlace, measuredTax` from `'./industryTrack'`, `type SecBand` from
`'./industry'`, `type IndustrySite` from `'./prefs'`):

```ts
/** A facility tax a job measured at one of your sites: the tax, when the job started, whose job. */
export type Measured = { tax: number; at: string; who: string; isMain: boolean; jobId: number };
/** Per structure site, the newest manufacturing job of any character there that measures its tax (measuredTax); null when none does. */
export function measuredBySite(ix: Indexed, sites: readonly IndustrySite[], chars: readonly { name: string; isMain: boolean; clone: Clone; jobs: Read<JobRecord[]> }[], bandOf: (s: IndustrySite) => SecBand): Record<string, Measured | null> {
  const out: Record<string, Measured | null> = {};
  for (const s of sites) {
    if (s.kind === 'npc' || s.structureId == null) continue;
    const cands = chars.flatMap((c) => (c.jobs.state === 'read' ? c.jobs.value.filter((j) => j.facilityId === s.structureId).map((j) => ({ c, j })) : []))
      .sort((a, b) => Date.parse(b.j.start) - Date.parse(a.j.start));
    out[s.id] = null;
    for (const { c, j } of cands) {
      const m = measuredTax(ix, j, jobPlace(j, sites, bandOf), c.clone);
      if (m.tax != null) { out[s.id] = { tax: m.tax, at: j.start, who: c.name, isMain: c.isMain, jobId: j.jobId }; break; }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run them to see them pass, then plant each rule wrong**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 11"`
Expected: no `FAIL`.

Plant, run, see it fail, undo:
- `jobCostFor`: drop `if (!checkable(job))`: "what can't be checked says why" fails (the late job).
- `jobCostFor`: `const sb = { material: 1, time: 1, cost: 1 };` (no Azbel bonus): "EVE Ref's job … 17,213,916" fails.
- `measuredTax`: accept an unknown clone (drop its line): "where it can't measure …" fails.
- `measuredTax`: drop `r.cost.scc` from the subtraction: "the tax it measures: 1.00%" fails (5%).
- `jobCheck`: `sccShare` without `(r.cost.tax ?? 0)`: "an NPC-station research job says the SCC share" fails.
- `measuredBySite`: oldest first: "per site, the newest job that measures" fails (702 measures more).

- [ ] **Step 5: In the tab**

`src/components/hustles/Industry.tsx`: `<IndustryBuild … chars={chars} />`.
`src/components/hustles/IndustryBuild.tsx`: props gain `chars: IndustryChar[]`; `<IndustrySites … chars={chars} />`.

`src/components/hustles/IndustrySites.tsx`: props gain `chars: IndustryChar[]`; import `measuredBySite` from
`'../../lib/industryOwned'`, `secBand` from `'../../lib/industry'`, `fmtShort` from `'../../lib/format'`; after `sysName`:

```ts
  // What a job of yours (any character's) measured there (industryOwned.ts measuredBySite): offered, never applied by itself.
  const bandOf = (s: IndustrySite) => secBand(graph[s.systemId]?.[0]);
  const measured = useMemo(() => measuredBySite(ix, doc.sites, chars, bandOf), [ix, doc.sites, chars, graph]); // eslint-disable-line react-hooks/exhaustive-deps
```

and in the structure branch of the tax cell, under the `NumChip`:

```tsx
                          {(() => {
                            const m = measured[s.id];
                            if (!m) return null;
                            const agrees = s.tax != null && Math.abs(s.tax - m.tax) < 0.00005;
                            return agrees ? <span className="sub" data-industry="measured-agrees">{m.isMain ? 'Your' : `${m.who}’s`} job of {fmtShort(m.at)} there paid the same.</span>
                              : (
                                <span className="sub" data-industry="use-measured">
                                  {m.isMain ? 'Your' : `${m.who}’s`} job of {fmtShort(m.at)} there paid {pct(m.tax)}:{' '}
                                  <button type="button" className="link-btn" onClick={() => change(s.id, { tax: m.tax })}>Use this</button>
                                </span>
                              );
                          })()}
```

And the tax tip for a site with
nothing measured gains "or run a job there and the app measures it": the not-typed `tip` becomes
`'Not typed: the finder ranks before it and says what each 1% costs a day. Type it from the Industry window, or run a manufacturing job there and the app measures it.'`
(the spec's "–: type it from the Industry window, or run a job there and the app measures it").

`src/components/hustles/IndustryOwned.tsx`: import `jobCheck, jobPlace` from `'../../lib/industryTrack'`, `secBand` from
`'../../lib/industry'`, `pct` from `'../../lib/format'`, `useIndustryDoc` from `'./industryMarket'`; inside, 
`const [doc] = useIndustryDoc(); const bandOf = (s: IndustrySite) => secBand(graph[s.systemId]?.[0]);` (import
`type IndustrySite` from `'../../lib/prefs'`); the finished jobs' table gains a last column
`<Th left className="rd-wide" tip={'The app’s cost for the job, worked out from what was kept when it was first seen running, against what EVE charged.\n\n• Only a job first seen within 90 minutes of its start: the index and prices move hourly.\n• At one of your build sites or an NPC station: elsewhere its bonuses aren’t known.'}>Checked</Th>`
and each row a cell:

```tsx
                  {(() => {
                    const k = jobCheck(ix, j, jobPlace(j, doc.sites, bandOf), c.clone);
                    const scc = k.state === 'checked' && k.sccShare != null ? ` · the SCC here came to ${pct(k.sccShare)} of the job’s base` : '';
                    const said = k.state === 'unchecked' ? `Not checked: ${k.why}` : k.differs ? `The app worked out ${iskBig(k.app)}; EVE charged ${iskBig(k.charged)}` : `Matches what EVE charged${scc}`;
                    return <td className="l rd-wide" data-industry="check" data-off={k.state === 'checked' && k.differs ? '1' : undefined}
                      data-tip={k.state === 'checked' ? `Index ${iskBig(k.parts.index)}, bonuses ${iskBig(k.parts.bonus)}, facility tax ${iskBig(k.parts.tax)}, SCC ${iskBig(k.parts.scc)}, Alpha tax ${iskBig(k.parts.alpha)}: ${iskBig(k.app)}.${scc}` : undefined}>{said}</td>;
                  })()}
```

and its `rd-phone` line gains `<span>{said}</span>` (compute `said` once above the `<tr>` so both use it).

- [ ] **Step 6: The page case**

In `scripts/pages.mjs`, above `// --- the end of the industry case`:

```js
    // --- Task 11: a job at your structure site measures its tax (Use this); an NPC-station job more than 1% off is said.
    {
      const EIV_RUN = 157590413.44605502 / 65;
      const SITE = { id: 'st:1046664001931', name: 'UALX-3 - 1st Byzantigoon', systemId: 30004807, kind: 'azbel', structureId: 1046664001931, rigs: [37170], tax: null };
      const DOC11 = { ...DOC, sites: [...DOC.sites, SITE] };
      const at = (t) => iso(t);
      const done = (jobId, over) => ({ jobId, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 65, licensedRuns: 40, successfulRuns: null, probability: null, cost: 17213916,
        facilityId: 1046664001931, stationId: 1046664001931, outputId: 1046664001931, start: at(now - 2 * 86400_000), end: at(now - 86400_000), completed: at(now - 86400_000 + 600_000), status: 'delivered', perRun: 1,
        seenAt: at(now - 2 * 86400_000 + 1200_000), first: { me: 10, te: 20, systemId: 30004807, index: 0.0617, eiv: EIV_RUN }, ...over });
      const jobs11 = { 9301: done(9301, {}), 9302: done(9302, { facilityId: 60001483, stationId: 60001483, outputId: 60001483, runs: 1, cost: 1_250_000, first: { me: 10, te: 20, systemId: 30000119, index: 0.05, eiv: EIV_RUN } }),
        9303: done(9303, { facilityId: 60001483, stationId: 60001483, outputId: 60001483, seenAt: at(now - 2 * 86400_000 + 3 * 3600_000) }) };
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, jobs: jobs11, meta: { ...ledger.meta, jobsRead: true, industry: { at: iso(now - 600_000), jobs: [], places: {} } }, industry: DOC11, cloud: CLOUD_STATE }, { alts: altStore, cache: { prospects: SCAN } });
      await page.goto(`${BASE}#hustles/industry/blueprints`);
      await page.waitForSelector('[data-industry="jobs-done"]', { timeout: 30_000 }).catch(() => problems.push('the finished jobs never drew'));
      const check = async (id) => text(`[data-industry="jobs-done"] [data-job="${id}"] [data-industry="check"]`);
      if (!(await check(9301)).includes('Not checked: the facility tax there isn’t typed')) problems.push(`the job at the untyped structure isn’t said as unchecked for its tax: “${await check(9301)}”`);
      if (!/The app worked out .+; EVE charged 1\.25 M/.test(await check(9302))) problems.push(`the NPC-station job 1% off isn’t said: “${await check(9302)}”`);
      if (!(await check(9303)).includes('Not checked: first seen 3 h after it started')) problems.push(`the job seen late isn’t said as such: “${await check(9303)}”`);
      await page.goto(`${BASE}#hustles/industry/build`);
      await page.waitForSelector('[data-industry="build"]', { timeout: 20_000 });
      if (!(await page.locator('[data-industry="sites"]').isVisible().catch(() => false))) await page.locator('button.panel-toggle', { hasText: 'Where you build' }).click();
      await page.waitForSelector('[data-industry="use-measured"]', { timeout: 15_000 }).catch(async () => problems.push(`the measured tax isn’t offered: “${(await text('[data-industry="site-list"]')).slice(0, 300)}”`));
      if (!(await text('[data-industry="use-measured"]')).includes('job of') || !(await text('[data-industry="use-measured"]')).includes('there paid 1.00%')) problems.push(`the measured tax doesn’t say whose job and what it paid: “${await text('[data-industry="use-measured"]')}”`);
      const stored = () => page.evaluate(() => new Promise((res) => { const q = indexedDB.open('jita-ledger'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('industry'); g.onsuccess = () => res(g.result); }; }));
      if ((await stored()).sites.find((s) => s.id === 'st:1046664001931').tax != null) problems.push('the measured tax was written without Use this');
      await page.locator('[data-industry="use-measured"] button', { hasText: 'Use this' }).click(); await page.waitForTimeout(800);
      if ((await stored()).sites.find((s) => s.id === 'st:1046664001931').tax !== 0.01) problems.push('Use this didn’t set the site’s tax to 1.00%');
      if (!(await page.locator('[data-industry="measured-agrees"]').count())) problems.push('after Use this, the site doesn’t say the job agrees');
    }
```

(The NPC station 60001483 is DOC's own site, in system 30000119. If the case's NPC row block replaced `ESI['/industry/systems/']`,
nothing here depends on it: the checks read only what the jobs kept.)

- [ ] **Step 7: A look in a browser**

`SHOTS=.playwright-mcp/industry2/11 LEDGER=industry npm run check-pages` and `… check-phone`: the finished jobs' Checked
column at both widths (at 390 px it folds into the job's cell), the sites panel's Use this.

- [ ] **Step 8: The notes**

- `docs/notes/industry.md`, **Stage 2**: **The job check** (what's compared, 1%, every reason it can't, the parts in its
  tip); **The measured facility tax** (the formula, manufacturing at your structure site, clone known, 0.01%, at most 10%,
  offered with Use this and never written by itself, any character's newest job); **Settling the SCC bases** ("Each
  research or copy job checked at an NPC station shows `sccShare`. ME research's reading is SCC_RESEARCH (2%) on the app's
  base (2% of the EIV × the level steps ÷ 105, no rank); copying's SCC_COPY (4%) on 2% of the EIV × runs × copies. When the
  first real job's share isn't the constant to within rounding (the index's four decimals), the reading is wrong: say which
  (rank in the research base would scale the share by the blueprint's rank; no SCC on copying reads 0) and change the
  constant in a commit citing the job. Until then the constants stand.").
- `docs/notes/limits.md`: "**A job's check and its measured tax need it first seen running within 90 minutes of its
  start**: a job installed and finished between reads can't be checked. Its EIV is at that hour's adjusted prices and its
  index ESI's four decimals (a few hundred ISK on a big job). A measured tax holds until the owner changes it, and is only
  offered."

- [ ] **Step 9: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass; `scripts/income-golden.json` unchanged.

- [ ] **Step 10: Commit**

```bash
git add src/lib/industryTrack.ts src/lib/industryOwned.ts src/components/hustles/IndustryOwned.tsx src/components/hustles/IndustrySites.tsx src/components/hustles/IndustryBuild.tsx src/components/hustles/Industry.tsx scripts/check.mjs scripts/pages.mjs docs/notes/industry.md docs/notes/limits.md
git commit -m "$(cat <<'EOF'
Industry stage 2: each job checked against what EVE charged; a structure's tax measured, offered with Use this

A structure's facility tax isn't in ESI, so the finder ranked the user's home before it, and nothing ever said whether the
app's job costs matched the game's. A finished job first seen running within 90 minutes of its start, at an NPC station or
one of your sites, is now checked against ESI's cost (said when more than 1% off, with the parts), and a manufacturing job
at a structure site measures its tax: EVE Ref's own job comes out at 1.00%, as typed in its inputs. The measure is offered
with Use this beside the site's tax, never written by itself, and a job it can't measure from says why.

Research and copy jobs at NPC stations show the SCC share EVE charged; the constants stay EVE Ref's reading until a real job
settles them (the note says how).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
)"
```

---
### Task 12A: To do: an alt's jobs to deliver

**Files:**
- Modify: `src/lib/todo.ts` (`altIndustryItem`, `judgeAltIndustry`), `src/components/Todo.tsx`, `scripts/check.mjs`,
  `scripts/pages.mjs`, `docs/notes/orders-alerts.md`, `docs/notes/industry.md`

**Interfaces:**
- Consumes: `JobRecord`, `ACTIVITY_SAID` (Task 9A); `jobWaiting`, `judgeIndustry`, `type Entry`, `type TodoItem` (todo.ts);
  `useAltCopies`, `useAltRoster`, `useRosterAt`, `useRosterLive` (already in Todo.tsx); `jobOk` (roster.ts).
- Produces: `altIndustryItem(x): TodoItem` (key `industry:<char>:<place>`, version the job IDs, kind `industry`, source
  `industry`); `judgeAltIndustry(e, c): string | null | false`.

The main's item is untouched: `industry:<place>`, from `meta.industry`, seen at `meta.industry.at` (so no remembered item
reopens). An alt's is seen at its `sheet` job's `lastOk` and judged only on a roster read of this session, never on the
main's `meta.industry` (spec, To do; the dispatch at Todo.tsx's `seenAt` and `judge`).

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 11's section:

```js
console.log('\n--- Industry stage 2: To do, an alt\'s jobs to deliver (todo.ts, Task 12A) ---');
{
  const D = await import('../src/lib/todo.ts');
  const it = D.altIndustryItem({ charId: 900091, who: 'Builder Alt', place: 60003760, placeName: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    jobs: [{ jobId: 12, activity: 5, what: 'Large Trimark Armor Pump I Blueprint', runs: 1 }, { jobId: 11, activity: 1, what: 'Large Trimark Armor Pump I', runs: 65 }] });
  eq('  one item per alt and facility, keyed by both; the job IDs its version', [it.key, it.ver, it.kind, it.source], ['industry:900091:60003760', '11.12', 'industry', 'industry']);
  eq('    said with whose they are', it.title, 'Builder Alt · 2 industry jobs ready at Jita IV - Moon 4 - Caldari Navy Assembly Plant');
  const e = { item: it, seenAt: 1000, lastAt: 1000 };
  eq('  judged only on a roster read of this session newer than the one that showed it', [
    D.judgeAltIndustry(e, { live: false, readAt: 2000, gone: false, waiting: new Set() }),
    D.judgeAltIndustry(e, { live: true, readAt: 1000, gone: false, waiting: new Set() }),
    D.judgeAltIndustry(e, { live: true, readAt: 2000, gone: false, waiting: new Set([12]) }),
    D.judgeAltIndustry(e, { live: true, readAt: 2000, gone: false, waiting: new Set() }),
  ], [null, null, null, 'All delivered.']);
  eq('  an alt gone from a live roster just goes', D.judgeAltIndustry(e, { live: true, readAt: 500, gone: true, waiting: new Set() }), false);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 12A"`
Expected: `altIndustryItem` not a function.

- [ ] **Step 3: The item and its judge**

In `src/lib/todo.ts`, import `ACTIVITY_SAID` from `'./industryTrack'` and add after `judgeIndustry`:

```ts
/**
 * An alt's industry jobs finished and waiting to be delivered (its `jobs` records, read by the cloud's sheet): one item per
 * alt and facility. Keyed `industry:<char>:<place>`, so the main's `industry:<place>` items never reopen; its version is the
 * job IDs, as the main's.
 */
export function altIndustryItem(x: { charId: number; who: string; place: number; placeName: string | null; jobs: { jobId: number; activity: number; what: string; runs: number }[] }): TodoItem {
  const what = x.jobs.map((j) => `${ACTIVITY_SAID[j.activity] ?? 'Job'}: ${j.what}${j.runs > 1 ? ` ×${units(j.runs)}` : ''}`);
  return {
    key: `industry:${x.charId}:${x.place}`, ver: x.jobs.map((j) => j.jobId).sort((a, b) => a - b).join('.'), kind: 'industry', source: 'industry', stake: 0,
    title: `${x.who} · ${units(x.jobs.length)} industry job${x.jobs.length === 1 ? '' : 's'} ready at ${x.placeName ?? 'a facility'}`,
    detail: `${what.slice(0, 4).join(' · ')}${what.length > 4 ? ` and ${units(what.length - 4)} more` : ''}. ${x.who} delivers them in the Industry window (Jobs, Deliver).`,
    action: { label: 'Blueprints & jobs', route: 'hustles/industry/blueprints' },
  };
}

/**
 * An alt's jobs-to-deliver item that has gone: judged only on a roster read of this session (the cloud reads the alt
 * hourly; a roster from disk may be older than what showed it) whose sheet read is newer than the one that showed it.
 * An alt gone from a live roster just goes.
 */
export function judgeAltIndustry(e: Entry, c: { live: boolean; readAt: number | null; gone: boolean; waiting: ReadonlySet<number> }): string | null | false {
  if (c.live && c.gone) return false;
  if (!c.live) return null;
  return judgeIndustry(e, { readAt: c.readAt, waiting: c.waiting });
}
```

- [ ] **Step 4: Run them to see them pass, then plant each rule wrong**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 12A"`
Expected: no `FAIL`.
Plant, run, see it fail, undo: drop `if (!c.live) return null;` ("judged only on a roster read of this session" fails); key
it `industry:${x.place}` (the key test fails).

- [ ] **Step 5: In To do**

In `src/components/Todo.tsx`:
- import `altIndustryItem, judgeAltIndustry` from `'../lib/todo'`; `type JobRecord` from `'../lib/industryTrack'`.
- station names for an alt's facilities, beside `systemNames`:

```ts
  // An alt's facilities: stations by ESI's names (one request for all), structures by the alt's blueprints doc when it names them.
  const altJobs = useMemo(() => roster.map((a) => ({ a, jobs: Object.values((copies[a.charId]?.records.jobs ?? {}) as Record<string, JobRecord>) })), [roster, copies]);
  const altStations = [...new Set(altJobs.flatMap((x) => x.jobs.map((j) => j.stationId)).filter((id) => id >= 60_000_000 && id < 64_000_000))].sort((a, b) => a - b).join(',');
  const [stationNames, setStationNames] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!altStations) return;
    let alive = true;
    resolveNames(altStations.split(',').map(Number)).then((n) => { if (alive) setStationNames(n); }).catch(() => undefined);
    return () => { alive = false; };
  }, [altStations]);
```

- in the items build, after the main's industry loop:

```ts
    // An alt's jobs finished and waiting, one item per alt and facility (its records as the cloud's sheet last read them).
    for (const { a, jobs } of altJobs) {
      const byAltPlace = new Map<number, JobRecord[]>();
      for (const j of jobs) if (jobWaiting(j, now)) byAltPlace.set(j.stationId, [...(byAltPlace.get(j.stationId) ?? []), j]);
      const names = ((copies[a.charId]?.docs.blueprints as { names?: Record<string, string> } | undefined)?.names) ?? {};
      for (const [place, js] of byAltPlace) {
        out.push(altIndustryItem({
          charId: a.charId, who: a.name ?? `Character ${a.charId}`, place, placeName: stationNames[place] ?? (names[String(place)] || null),
          jobs: js.map((j) => ({ jobId: j.jobId, activity: j.activity, what: name(j.productTypeId ?? j.blueprintTypeId), runs: j.runs })),
        }));
      }
    }
```

  and the `useMemo`'s deps gain `altJobs, stationNames`; `useEnsureNames` gains each alt job's product.
- in the `seenAt` function, the `industry` source reads the alt's sheet for an alt's key:

```ts
    // An alt's jobs item (industry:<char>:<place>) is seen on its sheet read; the main's on its own jobs read.
    const industrySeen = (x: TodoItem) => { const p = x.key.split(':'); if (p.length === 3) { const a = roster.find((z) => String(z.charId) === p[1]); return a ? jobOk(a, 'sheet') : null; } return industryAt; };
```

  with `x.source === 'industry' ? industrySeen(x) ?? t :` in place of `x.source === 'industry' ? industryAt ?? t :`.
- in `judge`, `case 'industry':` becomes

```ts
        case 'industry': {
          const p = x.key.split(':');
          if (p.length === 3) {
            const a = roster.find((z) => String(z.charId) === p[1]);
            const waiting = new Set(Object.values((copies[Number(p[1])]?.records.jobs ?? {}) as Record<string, JobRecord>).filter((j) => jobWaiting(j, t)).map((j) => j.jobId));
            return judgeAltIndustry(e, { live: rosterLive, readAt: a ? jobOk(a, 'sheet') : null, gone: !a, waiting });
          }
          return judgeIndustry(e, { readAt: industryAt, waiting: new Set((d.meta.industry?.jobs ?? []).filter((j) => jobWaiting(j, t)).map((j) => j.jobId)) });
        }
```

- [ ] **Step 6: The page case**

In `scripts/pages.mjs`, above `// --- the end of the industry case`:

```js
    // --- Task 12A: To do lists an alt's jobs to deliver, with whose they are.
    {
      const ready = { jobId: 9401, activity: 1, blueprintId: 8001, blueprintTypeId: 25895, productTypeId: 25894, runs: 65, licensedRuns: null, successfulRuns: null, probability: null, cost: 1e6,
        facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: iso(now - 86400_000), end: iso(now - 3600_000), completed: null, status: 'ready', perRun: 1, seenAt: iso(now - 86400_000 + 600_000) };
      const alts12 = { ...altStore, [`alt:${BUILDER}`]: { ...altStore[`alt:${BUILDER}`], records: { jobs: { 9401: ready } }, docs: { ...altStore[`alt:${BUILDER}`].docs, meta: { ...altStore[`alt:${BUILDER}`].docs.meta, jobsRead: true } } } };
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, industry: DOC, cloud: CLOUD_STATE }, { alts: alts12 });
      await page.goto(`${BASE}#todo`);
      await page.waitForSelector('.tn-item', { timeout: 20_000 }).catch(() => problems.push('To do drew no item'));
      await page.waitForTimeout(800);
      const item = await text('.tn-item:has-text("Builder Alt")');
      if (!item.includes('Builder Alt · 1 industry job ready at Station 60003760') || !item.includes('Builder Alt delivers them in the Industry window')) problems.push(`To do doesn’t list Builder Alt’s job to deliver: “${item.slice(0, 200)}”`);
    }
```

(The case's `/universe/names/` stub names a station "Station <id>".)

- [ ] **Step 7: The notes**

- `docs/notes/orders-alerts.md`: after "**Industry jobs waiting to be delivered go on To do**", add "**An alt's too** (Industry
  stage 2, `altIndustryItem`, `judgeAltIndustry`): one item per alt and facility, keyed `industry:<char>:<place>` so the
  main's items never reopen, seen at the alt's `sheet` read and ticked off only by a newer one on a roster read of this
  session; an alt gone from a live roster just goes. Built from its `jobs` records, which the cloud reads hourly."
- `docs/notes/industry.md`, **Stage 2**: one line pointing there.

- [ ] **Step 8: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass; `scripts/income-golden.json` unchanged. A look: `SHOTS=.playwright-mcp/industry2/12a LEDGER=industry npm run check-pages`
and open To do's screenshot if the case takes one (add `if (SHOTS) await page.screenshot({ path: `${SHOTS}-industry-todo-alt.png` });` to the block).

- [ ] **Step 9: Commit**

```bash
git add src/lib/todo.ts src/components/Todo.tsx scripts/check.mjs scripts/pages.mjs docs/notes/orders-alerts.md docs/notes/industry.md
git commit -m "$(cat <<'EOF'
Industry stage 2: To do lists an alt's industry jobs waiting to be delivered

To do read only the main's jobs, so an alt's finished jobs sat in the Industry window unmentioned. Each alt's records (the
cloud's hourly read) now give one item per facility, keyed by the alt, so the main's items never reopen. It's seen at the
alt's sheet read and ticked off only by a newer one on a roster read of this session, never by the main's jobs read:
absent from an old copy is not delivered.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
)"
```

---

### Task 12B: To do: List what you built

**Files:**
- Modify: `src/lib/industryTrack.ts` (`builtItems`), `src/lib/todo.ts` (`'built'` kind, `'stock'` source, `builtItem`,
  `judgeBuilt`, `HOLDS_UNTIL_CHANGED`), `src/components/planListing.ts` (`useItemReads` exported, `useBuiltPrices`),
  `src/components/Todo.tsx`, `scripts/check.mjs`, `scripts/pages.mjs`, `docs/notes/orders-alerts.md`,
  `docs/notes/industry.md`

**Interfaces:**
- Consumes: `JobRecord`, `jobUnits` (Task 9A); `listingPrice` (fills.ts); `listMarket` (plans.ts); `hubOf`, `homeQuote`
  (homeMarket.ts); `useHomePrices` (industryMarket.ts); `useShipTypes` (common.tsx); `tickDown` (tick.ts); `JITA_44`.
- Produces:
  - `src/lib/industryTrack.ts`: `type BuiltItem = { charId: number; typeId: number; place: number; jobIds: number[]; newest: number; units: number; held: number }`,
    `builtItems(jobs, byLocation, charId): BuiltItem[]`.
  - `src/lib/todo.ts`: `TodoKind` gains `'built'`, `Source` gains `'stock'`; `builtWhere(o)`, `builtItem(x, o)`, `judgeBuilt(e, c)`;
    `'built'` in `HOLDS_UNTIL_CHANGED`, `MINUTES` and `KIND_LABEL` ("List what you built").
  - `src/components/planListing.ts`: `useItemReads` exported; `useBuiltPrices(types, yours): Record<number, { price: number | null; read: boolean }>` (`yours`: every
    character's open order IDs, taken off the book; pre-flight M8).

**Correction 18 (this task's).** The spec versions the item by "the delivered job IDs". The item is built from the newest
jobs whose units the place still holds, so listing part of an older batch would drop that job from the set and change the
version, reopening a hand tick the user meant to hold ("not too tight"). The version is **the newest delivered job's ID**:
it changes only with another delivery, which is when the spec says a hand tick should reopen. The set of jobs and their
units stay in the item (its `amount`, and the words), and the judge is as the spec says.

And correction 15: where it's listed follows where it sits (see the head of this plan).

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 12A's section:

```js
console.log('\n--- Industry stage 2: To do, List what you built (Task 12B) ---');
{
  const T = await import('../src/lib/industryTrack.ts');
  const D = await import('../src/lib/todo.ts');
  const job = (jobId, completed, runs = 50, over = {}) => ({ jobId, activity: 1, blueprintId: 1, blueprintTypeId: 25895, productTypeId: 25894, runs, licensedRuns: null, successfulRuns: null, probability: null,
    cost: 1, facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: completed, end: completed, completed, status: 'delivered', perRun: 1, seenAt: completed, ...over });
  const jobs = [job(1, '2026-10-01T00:00:00Z'), job(2, '2026-10-05T00:00:00Z'), job(3, '2026-10-06T00:00:00Z', 50, { status: 'ready' }), job(4, '2026-10-02T00:00:00Z', 10, { activity: 5 })];
  const at = (n) => ({ 60003760: { 25894: n } });
  eq('  the newest delivered jobs whose units the place still holds: 100 held, both jobs', T.builtItems(jobs, at(100), 7),
    [{ charId: 7, typeId: 25894, place: 60003760, jobIds: [1, 2], newest: 2, units: 100, held: 100 }]);
  eq('    60 held: the newest job only', T.builtItems(jobs, at(60), 7).map((x) => [x.jobIds, x.newest, x.units]), [[[2], 2, 50]]);
  eq('    10 held (50 built, 40 listed): nothing to list', T.builtItems(jobs, at(10), 7), []);
  eq('    nothing read of the hangar: nothing', T.builtItems(jobs, undefined, 7), []);
  const it = D.builtItem({ charId: 7, who: null, typeId: 25894, place: 60003760, placeName: 'Jita IV - Moon 4', jobIds: [1, 2], newest: 2, units: 100, held: 100 },
    { name: 'Large Trimark Armor Pump I', where: 'jita', price: 7_040_000, read: true, hubName: null, isMain: true });
  eq('  keyed by character, product and place; versioned by the newest delivered job (another delivery reopens it)', [it.key, it.ver, it.kind, it.source, it.amount], ['built:7:25894:60003760', '2', 'built', 'stock', 100]);
  eq('    said with the price to list at, copied on opening', [it.title, it.action.copy, it.stake], ['List 100 Large Trimark Armor Pump I you built, at Jita IV - Moon 4', 7_040_000, 704_000_000]);
  eq('  a hand tick holds until another delivery', D.HOLDS_UNTIL_CHANGED.has('built'), true);
  // Through `remember`, as To do folds each build in: a tick on the same version holds past SESSION_MS (listing part of the
  // batch rebuilds the item with the same newest job), and another delivery's version reopens it.
  const T0b = Date.parse('2026-10-11T12:00:00Z');
  const m0 = D.remember({}, [it], () => 1000, () => null, T0b);
  const ticked = { ...m0, [it.key]: { ...m0[it.key], ticked: { ver: it.ver, at: T0b } } };
  const later = T0b + D.SESSION_MS + 3600_000;
  const listedSome = D.builtItem({ charId: 7, who: null, typeId: 25894, place: 60003760, placeName: 'Jita IV - Moon 4', jobIds: [2], newest: 2, units: 50, held: 60 },
    { name: 'Large Trimark Armor Pump I', where: 'jita', price: 7_000_000, read: true, hubName: null, isMain: true });
  const delivered = { ...listedSome, ver: '5' };
  eq('    through remember: still ticked a day on with the same newest job; reopened by another delivery',
    [!!D.remember(ticked, [listedSome], () => 2000, () => null, later)[it.key].ticked, !!D.remember(ticked, [delivered], () => 2000, () => null, later)[it.key].ticked], [true, false]);
  const e = { item: it, seenAt: 1000, lastAt: 1000 };
  eq('  judged on a stock read newer than the one it was built on: fewer held than built is listed, sold or moved', [
    D.judgeBuilt(e, { readAt: 1000, held: 10 }), D.judgeBuilt(e, { readAt: 2000, held: 10 }), D.judgeBuilt(e, { readAt: 2000, held: 100 }), D.judgeBuilt(e, { readAt: null, held: null }),
  ], [null, 'Listed, sold or moved: 10 left.', null, null]);
  eq('  an alt gone from a live roster just goes', D.judgeBuilt(e, { readAt: 2000, held: 0, gone: true }), false);
  eq('  where it lists: in Jita 4-4 Jita; at the hub or in its system the hub; a ship elsewhere never Jita while that\'s on', [
    D.builtWhere({ place: 60003760, placeSystem: 30000142, hub: null, sell: 'jita', ship: false, noShipsToJita: true }),
    D.builtWhere({ place: 1046664001931, placeSystem: 30004807, hub: { id: 1046664001931, systemId: 30004807 }, sell: 'jita', ship: false, noShipsToJita: true }),
    D.builtWhere({ place: 1047000000000, placeSystem: 30004807, hub: { id: 1046664001931, systemId: 30004807 }, sell: 'jita', ship: false, noShipsToJita: true }),
    D.builtWhere({ place: 60001483, placeSystem: 30000119, hub: { id: 1046664001931, systemId: 30004807 }, sell: 'jita', ship: true, noShipsToJita: true }),
    D.builtWhere({ place: 60001483, placeSystem: 30000119, hub: null, sell: 'jita', ship: true, noShipsToJita: true }),
    D.builtWhere({ place: 60001483, placeSystem: 30000119, hub: null, sell: 'jita', ship: false, noShipsToJita: true }),
  ], ['jita', 'home', 'home', 'home', null, 'jita']);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 12B"`
Expected: `builtItems`, `builtItem`, `judgeBuilt`, `builtWhere` not functions.

- [ ] **Step 3: The rules**

Append to `src/lib/industryTrack.ts`:

```ts
/** What a character built that sits loose where it landed, to list: its delivered jobs' products, by product and place. */
export type BuiltItem = { charId: number; typeId: number; place: number; jobIds: number[]; newest: number; units: number; held: number };
/**
 * List what you built (spec, To do): per product and place, the newest delivered manufacturing jobs whose units the place's
 * loose hangar stock (`byLocation`) still holds together, newest first. Once fewer are held than the newest job made, there's
 * nothing to list there (its judge says so on a newer stock read). Nothing read of the hangar: nothing.
 */
export function builtItems(jobs: readonly JobRecord[], byLocation: Record<number, Record<number, number>> | undefined, charId: number): BuiltItem[] {
  if (!byLocation) return [];
  const groups = new Map<string, JobRecord[]>();
  for (const j of jobs) {
    if (j.activity !== 1 || j.status !== 'delivered' || j.productTypeId == null || jobUnits(j) == null) continue;
    const k = `${j.productTypeId}|${j.outputId}`;
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }
  const out: BuiltItem[] = [];
  for (const [k, js] of groups) {
    const [typeId, place] = k.split('|').map(Number);
    const held = byLocation[place]?.[typeId] ?? 0;
    const newest = [...js].sort((a, b) => Date.parse(b.completed ?? b.end) - Date.parse(a.completed ?? a.end) || b.jobId - a.jobId);
    const take: JobRecord[] = [];
    let units = 0;
    for (const j of newest) { const u = jobUnits(j)!; if (units + u > held) break; take.push(j); units += u; }
    if (take.length) out.push({ charId, typeId, place, jobIds: take.map((j) => j.jobId).sort((a, b) => a - b), newest: take[0].jobId, units, held });
  }
  return out.sort((a, b) => a.typeId - b.typeId || a.place - b.place);
}
```

In `src/lib/todo.ts`:
- `TodoKind` gains `| 'built'`; `Source` gains `| 'stock'`;
- `HOLDS_UNTIL_CHANGED` becomes `new Set<TodoKind>(['cashIn', 'built'])`, its comment adding "a built item's version is
  its newest delivered job, so 'not now' holds until another delivery";
- `MINUTES` gains `built: 2`; `KIND_LABEL` gains `built: 'List what you built'`;
- add after `judgeAltIndustry`:

```ts
/**
 * Where what you built is listed (correction 15 of the stage-2 plan): where it sits decides. In Jita 4-4, Jita; at your home
 * hub's structure or in its system, the hub; anywhere else the Industry tab's choice, except that a ship never goes to Jita
 * while "never haul ships to Jita" is on (the user's words). Null: nowhere it may be listed (a ship with no hub picked).
 * `placeSystem` is known for Jita 4-4 and for a place that is one of your build sites (To do reads it from the industry doc),
 * so "in the hub's system" holds for your own structure there; any other place is judged by the choice.
 */
export function builtWhere(o: { place: number; placeSystem: number | null; hub: { id: number; systemId: number } | null; sell: 'jita' | 'home' | 'best'; ship: boolean; noShipsToJita: boolean }): 'jita' | 'home' | null {
  if (o.place === JITA_STATION) return 'jita';
  if (o.hub && (o.place === o.hub.id || o.placeSystem === o.hub.systemId)) return 'home';
  if (o.ship && o.noShipsToJita) return o.hub ? 'home' : null;
  return o.sell === 'home' && o.hub ? 'home' : 'jita';
}
const JITA_STATION = 60003760;

/** List what you built: one item per character, product and place, its version the newest delivered job's ID. */
export function builtItem(x: BuiltItem & { who: string | null; placeName: string | null }, o: { name: string; where: 'jita' | 'home' | null; price: number | null; read: boolean; hubName: string | null; isMain: boolean }): TodoItem {
  const at = o.where === 'home' ? `at ${o.hubName ?? 'your home hub'}` : 'in Jita';
  const priceSaid = o.where == null ? 'It’s a ship and “never haul ships to Jita” is on, with no home hub picked: pick one on the Industry tab.'
    : o.price != null ? `List ${at} at ${isk(o.price)}${o.where === 'jita' ? ' (others’ cheapest listing less a tick, where trading reaches)' : ' (the hub’s cheapest listing less a tick, Goonmetrics)'}; opening it copies the price.`
      : !o.read ? (o.where === 'jita' ? 'Reading its Jita book.' : 'Reading the home hub’s prices.') : `No price to list ${at}: nobody lists it there.`;
  return {
    key: `built:${x.charId}:${x.typeId}:${x.place}`, ver: String(x.newest), kind: 'built', source: 'stock', typeId: x.typeId, amount: x.units,
    stake: o.price != null ? o.price * x.units : 0,
    title: `${x.who ? `${x.who} · ` : ''}List ${units(x.units)} ${o.name} you built, at ${x.placeName ?? 'where it landed'}`,
    detail: `${units(x.jobIds.length)} job${x.jobIds.length === 1 ? '' : 's'} delivered there made them, and ${units(x.held)} sit loose in that hangar. ${priceSaid}`,
    action: o.isMain && o.where && o.price != null ? { label: 'Open in game', typeId: x.typeId, copy: o.price } : { label: 'Blueprints & jobs', route: 'hustles/industry/blueprints' },
  };
}

/**
 * A built item that has gone: on a stock read newer than the one it was built on, fewer held than it was listed for
 * (`amount`) is listed, sold or moved. Anything else isn't known yet. An alt gone from a live roster just goes.
 */
export function judgeBuilt(e: Entry, c: { readAt: number | null; held: number | null; gone?: boolean }): string | null | false {
  if (c.gone) return false;
  if (c.readAt == null || c.readAt <= e.seenAt || c.held == null) return null;
  return c.held < (e.item.amount ?? 0) ? `Listed, sold or moved: ${units(c.held)} left.` : null;
}
```

(import `type BuiltItem` from `'./industryTrack'`; `isk` and `units` are already imported.)

- [ ] **Step 4: Run them to see them pass, then plant each rule wrong**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 12B"`
Expected: no `FAIL`.

Plant, run, see it fail, undo:
- `builtItems`: oldest first: "60 held: the newest job only" fails.
- `builtItems`: count `ready` jobs: "100 held, both jobs" fails (3 joins).
- `builtItem`: `ver: x.jobIds.join('.')`: "versioned by the newest delivered job" fails.
- `HOLDS_UNTIL_CHANGED` without `'built'`: "a hand tick holds until another delivery" fails.
- `judgeBuilt`: `c.readAt < e.seenAt`: "judged on a stock read newer" fails (1000 = 1000 judged).
- `builtWhere`: drop the ship rule: "a ship elsewhere never Jita" fails.

- [ ] **Step 5: Prices, and the items in To do**

In `src/components/planListing.ts`: `function useItemReads` becomes `export function useItemReads`; import `listingPrice`
from `'../lib/fills'`; add at the end:

```ts
/**
 * What you built, priced as a listing in Jita (To do's List what you built): `listingPrice` on others' live book with the
 * fortnight's highs, the plan list step's own reads (useItemReads: every five minutes while shown). `yours`: every
 * character's open order IDs, taken off the book. `read` is false until the first read of the visit; a book that couldn't
 * be read prices nothing.
 */
export function useBuiltPrices(types: readonly number[], yours: readonly number[]): Record<number, { price: number | null; read: boolean }> {
  const key = [...new Set(types)].sort((a, b) => a - b).join(',');
  const reads = useItemReads(key, true);
  // Every character's open orders come off the book (pre-flight M8): an alt's built item isn't priced one tick under its own listing.
  const yoursKey = [...yours].sort((a, b) => a - b).join(',');
  return useMemo(() => {
    const out: Record<number, { price: number | null; read: boolean }> = {};
    for (const t of key ? key.split(',').map(Number) : []) {
      const x = reads[t];
      if (!x) { out[t] = { price: null, read: false }; continue; }
      const highs = x.hist?.length ? recentRange(x.hist, FILL_WINDOW, Date.now(), watchedDays(t)).highs : null;
      const m = x.book ? listMarket(x.book, yours, highs) : null;
      out[t] = { price: m ? listingPrice(m.bestSell, m.bestBuy, m.highs) : null, read: true };
    }
    return out;
  }, [key, reads, yoursKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
```

In `src/components/Todo.tsx`:
- imports: `builtItem, builtWhere, judgeBuilt` from `'../lib/todo'`; `builtItems` from `'../lib/industryTrack'`;
  `useBuiltPrices` from `'./planListing'`; `hubOf, homeQuote` from `'../lib/homeMarket'`; `useHomePrices` from
  `'./hustles/industryMarket'`; `useShipTypes` from `'./common'`; `tickDown` from `'../lib/tick'`; `type Stock` from `'../lib/types'`.
- **above Task 12A's `altJobs` and `altStations`** (which now read `builtAll`, so it must be declared first: pre-flight M5):

```ts
  // What every character built that sits loose where it landed (industryTrack.ts builtItems): the main's from its sync's
  // hangar read, each alt's from the cloud's. Priced where it sits (builtWhere): Jita's live book, or the home hub's prices.
  // (Named apart from the judge's own `mainId`, the same character, which that effect declares for itself.)
  const builtMain = getAuth()?.characterId ?? 0;
  const builtAll = useMemo(() => [
    ...builtItems(Object.values(d.jobs), d.stock?.byLocation, builtMain).map((b) => ({ b, who: null as string | null })),
    ...roster.flatMap((a) => builtItems(Object.values((copies[a.charId]?.records.jobs ?? {}) as Record<string, JobRecord>), (copies[a.charId]?.docs.stock as Stock | undefined)?.byLocation, a.charId)
      .map((b) => ({ b, who: a.name ?? `Character ${a.charId}` }))),
  ], [d.jobs, d.stock, builtMain, roster, copies]);
  const ships = useShipTypes(builtAll.map((x) => x.b.typeId));
  const hub = hubOf(d.industry.hub);
  const home = useHomePrices(builtAll.length ? hub?.id ?? null : null);
  const placeSystem = (place: number) => d.industry.sites.find((s) => s.structureId === place || s.stationId === place)?.systemId ?? (place === 60003760 ? 30000142 : null);
  const whereOf = (b: { typeId: number; place: number }) => builtWhere({ place: b.place, placeSystem: placeSystem(b.place), hub, sell: d.industry.sell, ship: ships.has(b.typeId), noShipsToJita: d.industry.noShipsToJita });
  // Every character's open orders, off the books the prices are read on (pre-flight M8).
  const allOrderIds = useMemo(() => [...Object.values(d.orders), ...roster.flatMap((a) => Object.values((copies[a.charId]?.records.orders ?? {}) as Record<string, { orderId: number }>))].map((o) => o.orderId), [d.orders, roster, copies]);
  const builtJita = useBuiltPrices(builtAll.filter((x) => whereOf(x.b) === 'jita').map((x) => x.b.typeId), allOrderIds);
```

  and To do's `useEnsureNames` (`Todo.tsx:141`) gains the built products, or a first build reads "Item #25894"
  (pre-flight I3: `useTypeName` names from `d.names`, and a delivered job is in no list it already ensures):
  `useEnsureNames([...(d.meta.industry?.jobs ?? []).map(…), ...d.plans.flatMap(…), ...altJobs.flatMap((x) => x.jobs.map((j) => j.productTypeId ?? j.blueprintTypeId)), ...builtAll.map((x) => x.b.typeId)])`
  (that call moves below `builtAll` and `altJobs`).

- in the items build:

```ts
    for (const { b, who } of builtAll) {
      const where = whereOf(b);
      const hq = where === 'home' && home.status === 'ok' ? homeQuote(home.prices[b.typeId]) : null;
      const priced = where === 'jita' ? builtJita[b.typeId] ?? { price: null, read: false }
        : where === 'home' ? { price: hq?.sell != null ? tickDown(hq.sell) : null, read: home.status !== 'loading' } : { price: null, read: true };
      const placeName = b.place === 60003760 ? 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' : stationNames[b.place] ?? d.industry.sites.find((s) => s.structureId === b.place || s.stationId === b.place)?.name ?? null;
      out.push(builtItem({ ...b, who, placeName }, { name: name(b.typeId), where, price: priced.price, read: priced.read, hubName: hub?.short ?? null, isMain: who == null }));
    }
```

  with the deps gaining `builtAll, builtJita, home, ships, stationNames`. Task 12A's `altStations` gains the built places
  that are stations, so they're named: `[...altJobs.flatMap(…), ...builtAll.map((x) => x.b.place)]` (declared after
  `builtAll`, above).
- `seenAt`: `x.source === 'stock' ? builtSeen(x) ?? t :` with

```ts
    // A built item is seen on the hangar read it was built from: the main's sync's, an alt's the cloud's archive (which reads its assets).
    const builtSeen = (x: TodoItem) => { const ch = Number(x.key.split(':')[1]); if (ch === builtMain) return hangarAt; const a = roster.find((z) => z.charId === ch); return a ? jobOk(a, 'archive') : null; };
```

- `judge`: add

```ts
        case 'built': {
          const [, ch, ty, pl] = x.key.split(':').map(Number) as [number, number, number, number];
          const isMain = ch === builtMain;
          const a = roster.find((z) => z.charId === ch);
          const stock = isMain ? d.stock : (copies[ch]?.docs.stock as Stock | undefined);
          return judgeBuilt(e, { readAt: isMain ? hangarAt : a && rosterLive ? jobOk(a, 'archive') : null, held: stock?.byLocation ? stock.byLocation[pl]?.[ty] ?? 0 : null, gone: !isMain && rosterLive && !a });
        }
```

- `LOOK` gains `built: { Icon: Package, c: 'var(--acc)' }` (import `Package` from `lucide-react`), and the "checking"
  words for the `stock` source: `x.source === 'stock' ? 'Waiting for the next read of what you hold.'`.
- the hand-tick words (`heldSaid`): `k === 'built' ? 'Tick it yourself. It comes back when another job is delivered there.'`.

- [ ] **Step 6: The page case**

In `scripts/pages.mjs`, above `// --- the end of the industry case`:

```js
    // --- Task 12B: To do lists what the main built that sits in Jita 4-4's hangar, priced on Jita's book.
    {
      const built = { jobId: 9501, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 10, licensedRuns: null, successfulRuns: null, probability: null, cost: 1e6,
        facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: iso(now - 2 * 86400_000), end: iso(now - 86400_000), completed: iso(now - 86400_000), status: 'delivered', perRun: 1, seenAt: iso(now - 2 * 86400_000 + 600_000) };
      await page.goto(SEED_PAGE);
      // The pump is named by ESI here, not seeded: a first build is a type the ledger has never named, so this pins To do's
      // useEnsureNames for built types (pre-flight I3). The case's names stub calls everything else a station.
      const prevNames = ESI['/universe/names/'];
      ESI['/universe/names/'] = (url, req, json) => json(JSON.parse(req.postData() ?? '[]').map((id) => (id === 25894 ? { id, name: 'Large Trimark Armor Pump I', category: 'inventory_type' } : { id, name: `Station ${id}`, category: 'station' })));
      await seed({ ...ledger, jobs: { 9501: built }, stock: { at: iso(now - 600_000), jita: { 25894: 10 }, total: { 25894: 10 }, byLocation: { 60003760: { 25894: 10 } } }, industry: DOC, cloud: CLOUD_STATE }, { alts: altStore });
      await page.goto(`${BASE}#todo`);
      await page.waitForSelector('.tn-item', { timeout: 20_000 }).catch(() => problems.push('To do drew no item'));
      // Wait on the condition (the name lands from ESI, the price from the book), not a clock.
      await page.waitForFunction(() => [...document.querySelectorAll('.tn-item')].some((e) => /Large Trimark Armor Pump I you built[\s\S]*List in Jita at/.test(e.textContent ?? '')), null, { timeout: 20_000 }).catch(() => undefined);
      const item = await text('.tn-item:has-text("you built")');
      // Priced on the case's own Jita book for the pump (ITEMS, the finder's stand-in); no history is served, so at the front.
      if (!item.includes('List 10 Large Trimark Armor Pump I you built, at Jita IV - Moon 4') || !/List in Jita at [\d,.]+/.test(item) || !item.includes('opening it copies the price')) problems.push(`To do doesn’t list the pumps built, named and priced in Jita: “${item.slice(0, 300)}”`);
      ESI['/universe/names/'] = prevNames;
    }
```

(The case already answers `/markets/10000002/orders/` for the pump from `ITEMS`; with no history served, `listingPrice` is
one tick under its cheapest listing.) Planted, then undone: To do's `useEnsureNames` without the built types: the title reads
"Item #25894" and this fails.

- [ ] **Step 7: The notes**

- `docs/notes/orders-alerts.md`: "**What you built goes on To do** (kind `built`, source `stock`, Needs action;
  `builtItems`, `builtItem`, `builtWhere`, `judgeBuilt`): one item per character, product and place, while the place's loose
  hangar holds at least the newest delivered jobs' units; versioned by the newest delivered job (correction 18: a hand tick
  holds until another delivery, listing part of a batch doesn't reopen it); judged on a newer stock read (the main's
  sync's, an alt's archive), fewer held saying 'Listed, sold or moved: N left'. Priced where it sits (correction 15).
  Not mailed."
- `docs/notes/industry.md`, **Stage 2**: one line pointing there, and corrections 15 and 18.

- [ ] **Step 8: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass; `scripts/income-golden.json` unchanged. A look at To do at both widths (`SHOTS=… LEDGER=industry`).

- [ ] **Step 9: Commit**

```bash
git add src/lib/industryTrack.ts src/lib/todo.ts src/components/planListing.ts src/components/Todo.tsx scripts/check.mjs scripts/pages.mjs docs/notes/orders-alerts.md docs/notes/industry.md
git commit -m "$(cat <<'EOF'
Industry stage 2: To do lists what you built, priced where it sits

A delivered job's products sat in the hangar with nothing saying to list them. To do now lists them, one item per
character, product and place, while the hangar holds the newest delivered jobs' units, with the price to list at copied on
opening: Jita's listing price in Jita 4-4, the home hub's at home, a ship never sent to Jita while that switch is on.

The spec versioned the item by every delivered job's ID; listing part of an older batch would then drop that job and
reopen a hand tick. It's versioned by the newest delivered job, so "not now" holds until another delivery. Once fewer are
held, a newer hangar read ticks it off: "Listed, sold or moved: 10 left."

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
)"
```

---
### Task 13: Built and sold: the Industry activity in Results, All income and each character's Earned

**Files:**
- Modify: `src/lib/industryTrack.ts` (`JOB_FEE_REFS`, `builtClaims`, `type MatsOf`, `builtAndSold`), `src/lib/types.ts`
  (`Activity` gains `'Industry'`; `Position.claimed`), `src/lib/prefs.ts` (`ACTIVITIES`), `src/lib/positions.ts`
  (`computePosition` takes claimed units off), `src/lib/everyItem.ts` (`claimsOf`; the claims in `everyItemCalcs` and its
  memo key), `src/lib/results.ts` (`AttributionInput.claims` in `attribute` and `otherSales`), `src/lib/income.ts`
  (`ACTIVITY_WHAT.Industry`, `WITHOUT_SETS`, `activityEvents`' Industry events and notes), `src/components/activityEvents.ts`
  (`ACTIVITY_COLOR.Industry`; Industry's inputs loaded only when needed), `src/components/Results.tsx` (Industry's note
  under its row; memo deps), `src/components/Wallet.tsx` and `src/components/Omega.tsx` (memo deps), `scripts/check.mjs`,
  `src/lib/wallet.ts` (`industry_security_tax` filed as Industry), `src/components/charIncome.ts` and
  `src/components/Characters.tsx` (Earned's words while Industry's inputs load or after they fail),
  `scripts/pages.mjs`, `scripts/income-golden.json` (re-recorded, the one task allowed to), `docs/notes/industry.md`,
  `docs/notes/positions-results.md`, `docs/notes/limits.md`

**Interfaces:**
- Consumes: `JobRecord`, `jobUnits` (Task 9A); `materialsFor`, `structureBonus`, `rigFor`, `secBand`, `type Indexed`
  (industry.ts); `loadIndustry` (components/hustles/industryBundle.ts); `system` (universe.ts); `countedIn` (positions.ts).
- Produces:
  - `src/lib/industryTrack.ts`: `JOB_FEE_REFS`, `builtClaims(jobs, txs, skip): Map<string, number>`,
    `type MatsOf = (job: JobRecord) => { mats: [number, number][]; atSite: boolean } | null`, `type BuiltResult`,
    `builtAndSold(o): BuiltResult`.
  - `src/lib/everyItem.ts`: `claimsOf(d): Map<string, number>`; `everything(typeId, excluded, claimed?)`.
  - `Position.claimed?: Record<string, number>`; `AttributionInput.claims?: ReadonlyMap<string, number>`.
  - `src/lib/income.ts`: `type BuiltInputs = { state: 'none' | 'loading' | 'ready' | 'failed'; mats: MatsOf | null }`;
    `activityEvents(d, sets, failed, lossActs, posCalc, mine?, built?)`; `Acts.industry: IndustryActs | null`
    (`{ state: 'loading' | 'failed' | 'ready'; unknownJobs: number; unbought: { typeId: number; units: number }[]; offSite: number }`,
    null with no jobs); `industrySaid(industry, name): { figure: string | null; note: string | null }`.
  - `useActivityEvents` returns `industry`, `industryRetry` and `waiting` (the words for what it's still reading); `ready`
    waits for Industry's inputs only while they load, and only for a ledger that needs them (pre-flight I4, M12).

Corrections owned here: 9 (claims derived from the ledger; `Position.claimed`), 10 (the bundle loads beyond the tab only
when a job needs it), 11 (what Industry counts).

**`scripts/income-golden.json`.** Results' "By activity" lists every activity, so it gains a line "Industry – Hours a week
on industry –" (the recorded ledgers hold no jobs: no figure moves). Re-record it once, in this task, after the checks
pass, and say so in the commit. The Wallet's rows (`incomeRows` drops rows under 1 ISK) don't change.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 12B's section:

```js
console.log('\n--- Industry stage 2: built and sold (Task 13) ---');
{
  const T = await import('../src/lib/industryTrack.ts');
  const P = await import('../src/lib/positions.ts');
  const EV = await import('../src/lib/everyItem.ts');
  const R = await import('../src/lib/results.ts');
  const N = await import('../src/lib/income.ts');
  const { emptyData } = await import('../src/lib/emptyData.ts');
  const { itemResult, isTrade } = await import('../src/lib/longRange.ts');
  const PUMP = 25894;
  const job = (jobId, completed, runs, over = {}) => ({ jobId, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: PUMP, runs, licensedRuns: null, successfulRuns: null, probability: null,
    cost: 50_000, facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: completed, end: completed, completed, status: 'delivered', perRun: 1, seenAt: completed,
    first: { me: 10, te: 20, systemId: 30000142, index: 0.05, eiv: 2e6 }, ...over });
  const tx = (id, date, isBuy, qty, unitPrice, typeId = PUMP) => ({ id, date, typeId, qty, unitPrice, isBuy, locationId: 60003760, clientId: 1, source: 'esi' });

  // The claim order: built 10 (delivered 5 Oct); a sale on 1 Oct is before any was built; 8 on the 6th are built; of 4 on
  // the 7th, 2 are built and 2 bought; a sale a position counts, and one marked Personal, stay out.
  const jobs = [job(1, '2026-10-05T00:00:00Z', 10)];
  const sales = [tx('s1', '2026-10-01T00:00:00Z', false, 5, 7e6), tx('s2', '2026-10-06T00:00:00Z', false, 8, 7e6), tx('s3', '2026-10-07T00:00:00Z', false, 4, 7e6),
    tx('s4', '2026-10-06T01:00:00Z', false, 3, 7e6), tx('s5', '2026-10-06T02:00:00Z', false, 1, 7e6)];
  const claims = T.builtClaims(jobs, sales, (id) => id === 's4' || id === 's5');
  eq('  Industry claims only units built by the sale\'s time, oldest sales first, a sale split; a position\'s or a Personal sale never', [...claims], [['s2', 8], ['s3', 2]]);
  eq('    a job not delivered, or with no units a run, claims nothing', [...T.builtClaims([job(2, '2026-10-05T00:00:00Z', 10, { status: 'ready' }), job(3, '2026-10-05T00:00:00Z', 10, { perRun: null })], sales, () => false)], []);

  // An item both built and bought: 10 bought on 1 Oct at 5 M, 10 built (delivered 2 Oct), 15 sold on 3 Oct at 7 M. Industry
  // claims 10; trading keeps its bought part: 5 sold against what it bought.
  const d = { ...emptyData(), txs: Object.fromEntries([tx('b1', '2026-10-01T00:00:00Z', true, 10, 5e6), tx('x1', '2026-10-03T00:00:00Z', false, 15, 7e6)].map((t) => [t.id, t])), jobs: { 1: job(1, '2026-10-02T00:00:00Z', 10) } };
  eq('  claims from the ledger (claimsOf): 10 of the 15', [...EV.claimsOf(d)], [['x1', 10]]);
  const all = (claimed) => ({ id: `all:${PUMP}`, typeId: PUMP, openedAt: '2003-05-06T00:00:00Z', status: 'open', jitaOnly: false, excluded: [], included: [], ...(claimed ? { claimed } : {}) });
  const withClaim = P.computePosition(all({ x1: 10 }), d, d.settings);
  const fiveSold = P.computePosition(all(), { ...d, txs: { ...d.txs, x1: { ...d.txs.x1, qty: 5 } } }, d.settings);
  eq('  a split sale: the position sees 5 sold, at that part of its tax, exactly as a sale of 5', [withClaim.sold, Math.round(withClaim.realized), withClaim.oversold], [5, Math.round(fiveSold.realized), 0]);
  const calc = EV.everyItemCalcs(d).find((c) => c.typeId === PUMP);
  const r = itemResult(calc, 0, Date.parse('2026-10-10T00:00:00Z'));
  eq('  "Trading, every item" keeps the bought part\'s profit: 5 sold, covered, still a trade', [r.sold, r.covered, isTrade(r), r.profit > 0], [5, 5, true, true]);
  const inp = { txs: Object.values(d.txs), journal: [], tracked: new Set(), realized: [], losses: [], sets: { filaments: new Set(), abyssLoot: new Set(), pi: new Set(), lpGoods: new Set() }, salesTax: 0.036, claims: EV.claimsOf(d) };
  eq('  otherSales sees only what\'s left of a claimed sale', R.otherSales(inp, new Set()).map((x) => Math.round(x.isk)), [Math.round(5 * 7e6 * (1 - 0.036))]);

  // Built and sold: the sale's claimed part after tax, every job's fee (the journal's naming it, else ESI's cost), and each
  // manufacturing job's materials at the purchases before it, newest first, each unit once; what was never bought, said.
  const buys = [tx('m1', '2026-09-30T00:00:00Z', true, 600, 4, 34), tx('m2', '2026-10-01T12:00:00Z', true, 500, 5, 34)];
  const jobsB = [job(1, '2026-10-02T00:00:00Z', 10, { start: '2026-10-02T00:00:00Z' }), job(2, '2026-10-04T00:00:00Z', 10, { start: '2026-10-04T00:00:00Z', cost: 60_000 }), job(3, '2026-10-04T00:00:00Z', 10, { start: '2026-10-04T00:00:00Z', first: undefined })];
  const journal = [{ date: '2026-10-02T00:00:01Z', refType: 'industry_job_tax', amount: -40_000, contextId: 1, contextIdType: 'industry_job_id' },
    { date: '2026-10-02T00:00:01Z', refType: 'industry_security_tax', amount: -5_000, contextId: 1, contextIdType: 'industry_job_id' },
    { date: '2026-10-02T00:00:02Z', refType: 'reprocessing_tax', amount: -9, contextId: 1, contextIdType: 'industry_job_id' }];
  const mats = (j) => (j.first ? { mats: [[34, 500]], atSite: true } : null);
  const b = T.builtAndSold({ jobs: jobsB, txs: [...buys, tx('x1', '2026-10-05T00:00:00Z', false, 15, 7e6)], journal, claims: new Map([['x1', 10]]), taxByTx: new Map([['x1', 15 * 7e6 * 0.036]]), salesTax: 0.036, personal: new Set(), mats });
  const sum = (from, to) => Math.round(b.events.filter((e) => e.t >= Date.parse(from) && e.t < Date.parse(to)).reduce((s, e) => s + e.isk, 0));
  eq('  job 1 (2 Oct): its fees from the journal (the job tax and the SCC\'s industry_security_tax), not reprocessing; 500 Tritanium at the newest purchases before it (500 at 5)',
    sum('2026-10-02T00:00:00Z', '2026-10-03T00:00:00Z'), -40_000 - 5_000 - 2_500);
  eq('  jobs 2 and 3 (4 Oct): ESI\'s cost for each; 500 more at what\'s left (600 at 4); job 3\'s materials not known', sum('2026-10-04T00:00:00Z', '2026-10-05T00:00:00Z'), -60_000 - 50_000 - 2_000);
  eq('  the sale (5 Oct): 10 of 15 claimed, after that part of its tax', sum('2026-10-05T00:00:00Z', '2026-10-06T00:00:00Z'), Math.round(10 * 7e6 * (1 - 0.036)));
  eq('  said apart: one job\'s materials not known; nothing unbought yet', [b.unknown, b.unbought], [[3], []]);
  const short = T.builtAndSold({ jobs: [job(4, '2026-10-02T00:00:00Z', 10, { start: '2026-10-02T00:00:00Z' })], txs: [buys[0]], journal: [], claims: new Map(), taxByTx: new Map(), salesTax: 0.036, personal: new Set(), mats: () => ({ mats: [[34, 800]], atSite: true }) });
  eq('  units never bought before the job are said apart, never costed at 0', [short.unbought, Math.round(short.events.reduce((s, e) => s + e.isk, 0))], [[{ jobId: 4, typeId: 34, units: 200 }], -50_000 - 2_400]);
  // A purchase a freelance job of yours counts (attribute's `freelance`) is that job's, not a job's material too (pre-flight M9).
  const fl = T.builtAndSold({ jobs: [job(5, '2026-10-02T00:00:00Z', 10, { start: '2026-10-02T00:00:00Z' })], txs: buys, journal: [], claims: new Map(), taxByTx: new Map(), salesTax: 0.036, personal: new Set(),
    freelance: (x) => x.id === 'm2', mats: () => ({ mats: [[34, 500]], atSite: true }) });
  eq('  a purchase a freelance job counts isn\'t costed as a material: 500 at 4 (m1), not at 5 (m2)', Math.round(fl.events.reduce((s, e) => s + e.isk, 0)), -50_000 - 2_000);

  // In All income: an Industry row, and "Sold, never bought" without the claimed units.
  const sets = { filaments: new Set(), abyssLoot: new Set(), pi: new Set(), lpGoods: new Set() };
  const acts = N.activityEvents(d, sets, false, {}, [], undefined, { state: 'ready', mats: () => ({ mats: [], atSite: true }) });
  const rows = N.incomeRows(EV.everyItemCalcs(d), acts, Date.parse('2026-09-01T00:00:00Z'), Date.parse('2026-10-10T00:00:00Z')).rows;
  eq('  All income: Industry counted, trading kept, nothing "Sold, never bought"', [rows.some((x) => x.key === 'Industry' && x.isk > 0), rows.some((x) => x.key === 'trading' && x.isk > 0), rows.some((x) => x.key === 'loot')], [true, true, false]);
  eq('  Industry needs no item groups (ESI\'s groups failing still counts it)', N.activityEvents(d, null, true, {}, [], undefined, { state: 'ready', mats: () => ({ mats: [], atSite: true }) }).events.some((e) => e.activity === 'Industry'), true);
  // While the blueprints load, or if they couldn't be, Industry has no figure at all: never claimed sales with no materials
  // under "no ME recorded" (pre-flight I4). It says which.
  const loading = N.activityEvents(d, sets, false, {}, [], undefined, { state: 'loading', mats: null });
  const refused = N.activityEvents(d, sets, false, {}, [], undefined, { state: 'failed', mats: null });
  eq('  while the blueprints load: no Industry figure, and it\'s working out; refused: none, said', [loading.events.some((e) => e.activity === 'Industry'), loading.industry.state, refused.events.some((e) => e.activity === 'Industry'), refused.industry.state],
    [false, 'loading', false, 'failed']);
  const nm = (id) => `Type ${id}`;
  eq('  the words for each', [N.industrySaid(loading.industry, nm), N.industrySaid(refused.industry, nm), N.industrySaid(null, nm), N.industrySaid(acts.industry, nm)], [
    { figure: 'Working out…', note: 'Reading the blueprints, to cost what you built…' },
    { figure: '–', note: 'The blueprints couldn’t be loaded, so what you built isn’t counted here or in the total.' },
    { figure: null, note: null }, { figure: null, note: null },
  ]);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check 2>&1 | grep -B1 -A3 "Task 13"`
Expected: `builtClaims` not a function, `claimsOf` not exported, the position selling 15.

- [ ] **Step 3: The claims and built-and-sold**

Append to `src/lib/industryTrack.ts`:

```ts
// --- Built and sold (spec, stage 2's last task) ------------------------------------------------------------------------

/** A job's fees in the journal (wallet.ts's Industry costs), by the job its context names. Never `reprocessing_tax`: not a job's. */
// ESI's industry ref types at 2026-08-18 (`.playwright-mcp/research/industry-stage2/openapi-2026-08-18.json`, the journal's
// `ref_type` enum): every one but `reprocessing_tax`. `industry_security_tax` may be how a job's SCC is written (pre-flight M7).
export const JOB_FEE_REFS: ReadonlySet<string> = new Set(['industry_job_tax', 'industry_security_tax', 'manufacturing', 'researching_material_productivity', 'researching_technology', 'researching_time_productivity', 'copying', 'reaction', 'reverse_engineering']);

type SaleLike = { id: string; typeId: number; date: string; isBuy: boolean; qty: number };
/**
 * Industry's claims on a character's sales (spec, "One claim order"): per product, its sales oldest first (not those `skip`
 * says: a position counts them, or they're marked Personal) take units from what its delivered manufacturing jobs had made
 * by the sale's time, built units before any bought ones. A sale before the first delivery claims nothing. Trade ID → units
 * (a sale can be split).
 */
export function builtClaims(jobs: readonly JobRecord[], txs: readonly SaleLike[], skip: (txId: string) => boolean): Map<string, number> {
  const made = new Map<number, { t: number; units: number }[]>();
  for (const j of jobs) {
    if (j.activity !== 1 || j.status !== 'delivered' || j.productTypeId == null) continue;
    const u = jobUnits(j);
    if (u == null) continue;
    made.set(j.productTypeId, [...(made.get(j.productTypeId) ?? []), { t: Date.parse(j.completed ?? j.end), units: u }]);
  }
  const out = new Map<string, number>();
  for (const [typeId, batches] of made) {
    batches.sort((a, b) => a.t - b.t);
    const sales = txs.filter((t) => !t.isBuy && t.typeId === typeId && !skip(t.id)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id));
    let pool = 0, next = 0;
    for (const s of sales) {
      const at = Date.parse(s.date);
      while (next < batches.length && batches[next].t <= at) pool += batches[next++].units;
      const take = Math.min(pool, s.qty);
      if (take > 0) { out.set(s.id, take); pool -= take; }
    }
  }
  return out;
}

/** A job's materials (the bundle's at its recorded ME, with its site's bonuses when it ran at one of your sites: `atSite`); null when not known. */
export type MatsOf = (job: JobRecord) => { mats: [number, number][]; atSite: boolean } | null;
export type BuiltResult = {
  events: { t: number; isk: number }[];
  /** Units of a material a job used that weren't bought before it (mined, looted, from before): not costed. */
  unbought: { jobId: number; typeId: number; units: number }[];
  /** Manufacturing jobs whose materials aren't known (no ME recorded, or a blueprint the bundle lacks). */
  unknown: number[];
  /** Manufacturing jobs costed without some bonus: at a structure that isn't one of your sites, or one whose rigs couldn't be applied (its system's security not read). */
  offSite: number[];
};

/**
 * What a character's industry made, as ISK movements (correction 11): each claimed sale's part after its tax, at its time;
 * every job's fee at its start (the journal's entries naming it by `industry_job_id`, else ESI's cost on the job); each
 * manufacturing job's materials at its start, costed at its own purchases before the job, newest first, each unit once
 * across jobs (the Freelance rule). Cancelled and reverted jobs' materials aren't charged. What isn't known is said apart.
 */
export function builtAndSold(o: {
  jobs: readonly JobRecord[];
  txs: readonly (SaleLike & { unitPrice: number })[];
  journal: readonly { date: string; refType: string; amount: number; contextId?: number; contextIdType?: string }[];
  claims: ReadonlyMap<string, number>; taxByTx: ReadonlyMap<string, number>; salesTax: number;
  personal: ReadonlySet<string>; mats: MatsOf | null;
  /** A trade a freelance job of yours counts (income.ts's `freelance`): never a job's material too (pre-flight M9). */
  freelance?: (tx: { id: string; typeId: number; date: string }) => boolean;
}): BuiltResult {
  const events: BuiltResult['events'] = [];
  for (const t of o.txs) {
    const c = o.claims.get(t.id);
    if (!c || t.isBuy) continue;
    const gross = t.qty * t.unitPrice;
    events.push({ t: Date.parse(t.date), isk: (gross - (o.taxByTx.get(t.id) ?? gross * o.salesTax)) * (c / t.qty) });
  }
  const fees = new Map<number, { t: number; isk: number }[]>();
  for (const e of o.journal) {
    if (e.contextIdType !== 'industry_job_id' || e.contextId == null || !JOB_FEE_REFS.has(e.refType)) continue;
    fees.set(e.contextId, [...(fees.get(e.contextId) ?? []), { t: Date.parse(e.date), isk: e.amount }]);
  }
  const unbought: BuiltResult['unbought'] = [], unknown: number[] = [], offSite: number[] = [];
  // Purchases by material, newest first, with what's left of each.
  const left = new Map<string, number>();
  const buysOf = new Map<number, (SaleLike & { unitPrice: number })[]>();
  for (const t of o.txs) if (t.isBuy && !o.personal.has(t.id) && !o.freelance?.(t)) buysOf.set(t.typeId, [...(buysOf.get(t.typeId) ?? []), t]);
  for (const list of buysOf.values()) list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || b.id.localeCompare(a.id));
  for (const j of [...o.jobs].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.jobId - b.jobId)) {
    const at = Date.parse(j.start);
    const named = fees.get(j.jobId);
    if (named) events.push(...named);
    else if (j.cost != null) events.push({ t: at, isk: -j.cost });
    if (j.activity !== 1 || j.status === 'cancelled' || j.status === 'reverted') continue;
    const m = o.mats ? o.mats(j) : null;
    if (!m) { unknown.push(j.jobId); continue; }
    if (!m.atSite) offSite.push(j.jobId);
    let cost = 0;
    for (const [type, need] of m.mats) {
      let want = need;
      for (const b of buysOf.get(type) ?? []) {
        if (want <= 0) break;
        if (Date.parse(b.date) > at) continue;
        const have = left.get(b.id) ?? b.qty;
        const take = Math.min(have, want);
        if (take <= 0) continue;
        left.set(b.id, have - take); want -= take; cost += take * b.unitPrice;
      }
      if (want > 0) unbought.push({ jobId: j.jobId, typeId: type, units: want });
    }
    if (cost) events.push({ t: at, isk: -cost });
  }
  return { events, unbought, unknown, offSite };
}
```

In `src/lib/types.ts`: `Activity` becomes `… | 'Freelance' | 'Industry' | 'Rewards'`; `Position` gains

```ts
  /**
   * Only on Results' every-item positions (`everything` in everyItem.ts), never stored: units of a sale Industry claims
   * (built and sold, industryTrack.ts builtClaims), by trade ID. Those units come off the sale with that part of its tax.
   */
  claimed?: Record<string, number>;
```

In `src/lib/wallet.ts` (line 115's list of Industry costs), add `'industry_security_tax'`: ESI lists it among the industry
ref types, and the Wallet filed it under Other spending (the recorded ledgers hold none, so the income recording doesn't move).

In `src/lib/prefs.ts`: `ACTIVITIES` becomes `['Trading', 'Loyalty', 'Planets', 'Hauling', 'Abyssal', 'Combat', 'Freelance', 'Industry', 'Rewards']`.

- [ ] **Step 4: Positions, every item, Results' rules**

In `src/lib/positions.ts`, `computePosition`: declare `let claimedUnits = 0;` beside `manualFees`, and in the trades loop,
right after `if (m === 'excluded') continue;`:

```ts
    // Units Industry claims (Results' every-item positions only, `pos.claimed`): off this sale with that part of its tax.
    const off = !tx.isBuy && pos.claimed ? Math.min(tx.qty, pos.claimed[tx.id] ?? 0) : 0;
    if (off) claimedUnits += off;
    if (off >= tx.qty) continue;
    const qty = tx.qty - off, part = qty / tx.qty;
    if (off) fee *= part;
```

then `counted.push(tx);` and the sell event use `qty` (`qty: qty` in the `events.push({ … kind: tx.isBuy ? 'buy' : 'sell', qty, … })`)
— `fee` is already scaled. And the fee spreading:

```ts
  // Claimed units carry their share of the sell orders' broker fees out with them: Industry counts its sales after tax, and
  // trading isn't charged the listing fee of what it didn't sell (a stated limit: that fee is in neither).
  const sellFeeUnit = countedSells + claimedUnits > 0 ? sellFeePool / (countedSells + claimedUnits) : 0;
  …
  if (!countedSells && !claimedUnits && sellFeePool > 0) events.push(…);
```

(the two existing lines changed). A position without `claimed` is untouched: `off` is 0 everywhere.

In `src/lib/everyItem.ts`:

```ts
import { builtClaims } from './industryTrack';
import { computePosition, countedIn } from './positions';

/** A position that follows every trade of an item, whenever it was, less the ones you tagged Personal, and the units Industry claims. */
export const everything = (typeId: number, excluded: string[], claimed?: Record<string, number>) => ({ id: `all:${typeId}`, typeId, openedAt: '2003-05-06T00:00:00Z', status: 'open' as const, jitaOnly: false, excluded, included: [], ...(claimed ? { claimed } : {}) });

const NO_CLAIMS = new Map<string, number>();
const claimMemo = new WeakMap<object, { key: unknown[]; claims: Map<string, number> }>();
/**
 * Industry's claims on this ledger's sales (industryTrack.ts builtClaims): its jobs against its sales no position counts and
 * not marked Personal. Kept while the jobs, trades, positions and Personal marks are the same objects; none without jobs.
 */
export function claimsOf(d: Data): Map<string, number> {
  const jobs = d.jobs ?? {};
  if (!Object.keys(jobs).length) return NO_CLAIMS;
  const key = [d.txs, d.positions, d.ignored];
  const hit = claimMemo.get(jobs);
  if (hit && hit.key.every((k, i) => k === key[i])) return hit.claims;
  const txs = Object.values(d.txs).filter((t) => t.source === 'esi');
  const tracked = new Set(txs.filter((t) => d.positions.some((p) => countedIn(p, t))).map((t) => t.id));
  const personal = new Set(d.ignored);
  const claims = builtClaims(Object.values(jobs), txs, (id) => tracked.has(id) || personal.has(id));
  claimMemo.set(jobs, { key, claims });
  return claims;
}
```

`everyItemCalcs`' `key` gains `d.jobs, d.positions`; in `computeEveryItem`, before the `return types.map`:

```ts
  // Units Industry claims come off their sales, so an item both built and bought keeps its bought part in trading.
  const claims = claimsOf(d);
  const claimedOf = (typeId: number): Record<string, number> | undefined => {
    const out: Record<string, number> = {};
    for (const [id, n] of claims) if (d.txs[id]?.typeId === typeId) out[id] = n;
    return Object.keys(out).length ? out : undefined;
  };
```

and `everything(typeId, personal.get(typeId) ?? [])` becomes `everything(typeId, personal.get(typeId) ?? [], claimedOf(typeId))`.

In `src/lib/results.ts`, `AttributionInput` gains
`/** Units of sales Industry claims (built and sold), by trade ID: only what's left of each counts here. */ claims?: ReadonlyMap<string, number>;`;
in `attribute`'s trade loop, after `if (inp.tracked.has(tx.id)) continue;`:

```ts
    const off = tx.isBuy ? 0 : Math.min(tx.qty, inp.claims?.get(tx.id) ?? 0);
    if (off >= tx.qty) continue;
```

and its `net` for a sale becomes `(gross - (taxByTx.get(tx.id) ?? gross * inp.salesTax)) * ((tx.qty - off) / tx.qty)`;
in `otherSales`, the same two lines after its `if (abyssLoot.has(…)) continue;` and its pushed `isk` scaled the same way.

- [ ] **Step 5: The Industry activity**

In `src/lib/income.ts`:
- imports: `claimsOf` from `'./everyItem'`; `builtAndSold, type MatsOf` from `'./industryTrack'`;
- `ACTIVITY_WHAT` gains
  `Industry: 'What you built and sold, after sales tax, less every job’s fees and the materials your manufacturing jobs used (at your own purchases before each job; materials you never bought aren’t costed, and said)',`;
- `WITHOUT_SETS` gains `'Industry'`;
- `Acts` gains
  `/** Industry's state and what it couldn't cost, said under its row; null with no jobs. */ industry: IndustryActs | null;` with

```ts
/**
 * Industry's inputs (useActivityEvents' useBuiltInputs): `none` when no job needs the bundle (no manufacturing job's ME was
 * recorded), `loading` while it and the sites' security load, `ready`, or `failed`.
 */
export type BuiltInputs = { state: 'none' | 'loading' | 'ready' | 'failed'; mats: MatsOf | null };
/** What Industry is: being worked out, not countable (the bundle refused), or counted, with what it couldn't cost. */
export type IndustryActs = { state: 'loading' | 'failed' | 'ready'; unknownJobs: number; unbought: { typeId: number; units: number }[]; offSite: number };

/**
 * Industry's figure and note as the pages say them (Results' row, the Wallet's All income, a Characters card): while its
 * inputs load, "Working out…" and what's being read; refused, "–" and that it isn't counted; counted, the figure itself
 * (`figure` null) and what it couldn't cost, if anything. Never a figure of claimed sales without materials under a false
 * reason (pre-flight I4).
 */
export function industrySaid(ind: IndustryActs | null, name: (typeId: number) => string): { figure: string | null; note: string | null } {
  if (!ind) return { figure: null, note: null };
  if (ind.state === 'loading') return { figure: 'Working out…', note: 'Reading the blueprints, to cost what you built…' };
  if (ind.state === 'failed') return { figure: '–', note: 'The blueprints couldn’t be loaded, so what you built isn’t counted here or in the total.' };
  const parts = [
    ind.unknownJobs ? `${ind.unknownJobs} manufacturing job${ind.unknownJobs === 1 ? '’s' : 's’'} materials aren’t known (no ME recorded when first seen, or a blueprint the bundle lacks)` : null,
    ind.unbought.length ? `materials you never bought before the job aren’t costed: ${ind.unbought.slice(0, 3).map((u) => `${u.units.toLocaleString('en-US')} ${name(u.typeId)}`).join(', ')}${ind.unbought.length > 3 ? ` and ${ind.unbought.length - 3} more` : ''}` : null,
    ind.offSite ? `${ind.offSite} ran at a structure that isn’t one of your build sites, or whose system’s security couldn’t be read: no bonuses applied where not known` : null,
  ].filter(Boolean);
  return { figure: null, note: parts.length ? `${parts.join('; ')}.` : null };
}
```

- `activityEvents` gains a last parameter `built?: BuiltInputs | null`, and (named `industryJobs`: `jobs` is already the
  freelance jobs there):

```ts
  const claims = claimsOf(d);
  const inp = { …as now…, claims };
  // Industry (built and sold): its own rules, needing no item groups. Its materials need the bundle (`built.mats`, loaded by
  // useActivityEvents only for a ledger with a manufacturing job whose ME was recorded). While it loads, or if it couldn't
  // be, there's no Industry figure at all, and it says which (industrySaid): never claimed sales with no materials.
  const industryJobs = Object.values(d.jobs ?? {});
  const bstate = built?.state ?? 'none';
  const ind = industryJobs.length && (bstate === 'ready' || bstate === 'none')
    ? builtAndSold({ jobs: industryJobs, txs, journal: inp.journal, claims, taxByTx: taxesOf(inp.journal), salesTax: inp.salesTax, personal, freelance, mats: built?.mats ?? null }) : null;
  const industryEvents = (ind?.events ?? []).map((e) => ({ t: e.t, activity: 'Industry' as const, isk: e.isk }));
  const industry: IndustryActs | null = !industryJobs.length ? null
    : !ind ? { state: bstate === 'failed' ? 'failed' : 'loading', unknownJobs: 0, unbought: [], offSite: 0 }
      : {
        state: 'ready', unknownJobs: ind.unknown.length, offSite: ind.offSite.length,
        unbought: [...ind.unbought.reduce((m, u) => m.set(u.typeId, (m.get(u.typeId) ?? 0) + u.units), new Map<number, number>())].map(([typeId, units]) => ({ typeId, units })),
      };
```

  where `taxesOf` is `results.ts`' `taxesByTx`: in results.ts `function taxesByTx` becomes `export function taxesByTx`, and
  income.ts imports it as `import { attribute, otherSales, taxesByTx as taxesOf, type DayEvent, type TypeSets } from './results';`.
  The returns become
  `return { events: [...attribute(inp), ...industryEvents].filter((e) => WITHOUT_SETS.has(e.activity)), others: [], typeSets: null, industry };`
  (Industry passes the filter because it's in `WITHOUT_SETS`)
  and `return { events: [...attribute(inp), ...industryEvents], others: otherSales(inp, personal), typeSets: inp.sets, industry };`
  (and the `!have` early return gains `industry: null`).

In `src/components/activityEvents.ts`:
- `ACTIVITY_COLOR` gains `Industry: '#5fd0c0'`;
- add, above `useActivityEvents`:

```ts
/**
 * Industry's materials for a ledger (correction 10 of the stage-2 plan): the bundle (its own chunk, loadIndustry) is loaded
 * only when the ledger holds a manufacturing job with a recorded ME, and a structure site's security (`system`, one public
 * read) only when it has rigs. `ready` is false while either is loading for a ledger that needs it; otherwise true at once.
 * The sites are the main's `industry` doc (yours, whichever character ran the job).
 */
function useBuiltInputs(d: Data, sites: readonly IndustrySite[]): BuiltInputs & { retry: () => void } {
  const needs = useMemo(() => Object.values(d.jobs ?? {}).some((j) => j.activity === 1 && j.first?.me != null && j.status !== 'cancelled' && j.status !== 'reverted'), [d.jobs]);
  const rigged = useMemo(() => sites.filter((s) => s.kind !== 'npc' && s.rigs.length).map((s) => s.systemId).sort((a, b) => a - b).join(','), [sites]);
  const [ix, setIx] = useState<Indexed | 'failed' | null>(null);
  const [bands, setBands] = useState<Record<number, SecBand> | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!needs) return;
    let alive = true;
    loadIndustry().then((x) => { if (alive) setIx(x); }, () => { if (alive) setIx('failed'); });
    return () => { alive = false; };
  }, [needs, tries]);
  useEffect(() => {
    if (!needs) return;
    let alive = true;
    Promise.all((rigged ? rigged.split(',').map(Number) : []).map((id) => system(id).then((s) => [id, secBand(s.security)] as const).catch(() => [id, 'unknown' as SecBand] as const)))
      .then((r) => { if (alive) setBands(Object.fromEntries(r)); });
    return () => { alive = false; };
  }, [needs, rigged]);
  const mats = useMemo((): MatsOf | null => {
    if (!needs || !ix || ix === 'failed' || !bands) return null;
    return (j) => {
      const bp = ix.bp.get(j.blueprintTypeId), m = bp?.[2];
      const me = j.first?.me;
      if (!m || me == null) return null;
      const site = sites.find((s) => (s.kind === 'npc' ? s.stationId === j.facilityId : s.structureId === j.facilityId));
      const npc = isStationId(j.facilityId);
      const kind = site?.kind ?? 'npc';
      const sb = site ? structureBonus(ix, kind).material : 1;
      const rig = site ? rigFor(ix, site.rigs, kind, bands[site.systemId] ?? 'unknown', j.productTypeId, 'manufacturing').material : 1;
      // A structure site with rigs whose system's security couldn't be read takes no rig bonus (rigFor's 'unknown'): said
      // with the jobs not at a site, never left out unsaid.
      const rigsUnknown = !!site && site.kind !== 'npc' && site.rigs.length > 0 && (bands[site.systemId] ?? 'unknown') === 'unknown';
      // An NPC station has no material bonus, so a job at any NPC station is known; a structure only when it's your site
      // and its rigs could be applied.
      return { mats: materialsFor(m[1], j.runs, me, sb, rig), atSite: npc || (!!site && !rigsUnknown) };
    };
  }, [needs, ix, bands, sites]);
  const state: BuiltInputs['state'] = !needs ? 'none' : ix === 'failed' ? 'failed' : ix && bands ? 'ready' : 'loading';
  // loadIndustry lets go of a failed load (industryBundle.ts), so asking again reads it afresh.
  return { state, mats, retry: () => { setIx(null); setTries((n) => n + 1); } };
}
```

  (imports: `useEffect, useMemo, useState` from react; `loadIndustry` from `'./hustles/industryBundle'`; `materialsFor,
  rigFor, secBand, structureBonus, type Indexed, type SecBand` from `'../lib/industry'`; `isStationId, type MatsOf` from
  `'../lib/industryTrack'`; `type BuiltInputs` beside `activityEvents` from `'../lib/income'`; `type IndustrySite` from
  `'../lib/prefs'`; `system` from `'../lib/universe'`.) An NPC station
  has no material bonus, so a job at any NPC station is "at site" with none.
- in `useActivityEvents`: `const built = useBuiltInputs(d, live.industry.sites);`; `activityEvents(…, own,
  { state: built.state, mats: built.mats })` with `built.state, built.mats` and `d.jobs` in the `acts` deps; and

```ts
  // Ready once the item groups are in (or failed) and Industry's inputs aren't still loading for a ledger that needs them.
  const ready = (!!sets || failed) && built.state !== 'loading';
  // What it's still reading, said where the figures would be (the Wallet, a Characters card): pre-flight M12.
  const waiting = !(sets || failed) ? 'Reading which items belong to which activity…' : built.state === 'loading' ? 'Reading the blueprints, to cost what you built…' : null;
```

  and the returned memo becomes `({ ...acts, failed, posCalc, lossActs, ready, waiting, industryRetry: built.retry })` (its
  deps gaining `waiting, built.retry`).

In `src/components/Results.tsx`: the `itemCalcs` memo deps gain `d.jobs, d.positions`; the `useActivityEvents()` call
destructures `industry, industryRetry` too, and above the return:

```ts
  // Industry's figure and note as industrySaid says them: "Working out…" while the blueprints load, "–" and why if they
  // couldn't be (with Try again), else the figure and what it couldn't cost (pre-flight I4).
  const ind = industrySaid(industry, name);
```

(`name` from `useTypeName()`; import `industrySaid` from `'../lib/income'`). In the "By activity" row, the figure cell for
Industry shows `ind.figure ?? (tot[k] ? iskBigSigned(tot[k]) : '–')` and carries `data-industry="results-industry"`;
after the row, as Trading has its own sub-row:

```tsx
                    {a === 'Industry' && ind.note && (
                      <tr><td className="l note small" colSpan={4} data-industry="results-note">{ind.note}
                        {industry?.state === 'failed' && <> <button type="button" className="link-btn" onClick={industryRetry}>Try again</button></>}</td></tr>
                    )}
```

and the "Made in" tile's note says what the total leaves out meanwhile:
`n: industry && industry.state !== 'ready' ? (industry.state === 'loading' ? 'After every fee and tax; what you built is still being worked out' : 'After every fee and tax; what you built isn’t counted (the blueprints couldn’t be loaded)') : 'After every fee and tax'`.

In `src/components/Wallet.tsx`'s `AllIncome`: `{!acts.ready ? <p className="note">Reading which items belong to which
activity…</p>` becomes `{!acts.ready ? <p className="note" data-industry="wallet-waiting">{acts.waiting ?? 'Reading…'}</p>`;
the closing note gains, after the item-groups sentence,
`{acts.industry?.state === 'failed' ? <> What you built isn’t counted: the blueprints couldn’t be loaded. <button type="button" className="link-btn" onClick={acts.industryRetry}>Try again</button></> : null}`
(its text becomes a fragment for it); and the Industry row, when there is one, carries `industrySaid(acts.industry,
name).note` in its tip.

In `src/components/charIncome.ts`, `useCharIncome` returns `waiting: acts.waiting, industry: acts.industry` too. In
`src/components/Characters.tsx`'s `earnedTile`, `n: 'Reading which items belong to which activity…'` becomes
`n: inc.waiting ?? 'Reading…'`, and a ready card whose `inc.industry?.state === 'failed'` has
`n: `In the last ${period}, without what was built`` with its tip adding the line "What it built isn't counted: the
blueprints couldn't be loaded".

In `src/components/Wallet.tsx` (`calcs`) and `src/components/Omega.tsx` (`calcs`): the `everyItemCalcs` memo deps gain
`d.jobs, d.positions`.

- [ ] **Step 6: Run the tests to see them pass, then plant each rule wrong**

Run: `npm run check 2>&1 | tail -30`
Expected: no `FAIL` (every earlier section too: a position without `claimed` is unchanged).

Plant, run, see it fail, undo:
- `builtClaims`: claim at every sale regardless of time (move the `while` above the loop to add every batch): "Industry claims
  only units built by the sale's time" fails (s1 claimed).
- `computePosition`: drop `if (off) fee *= part;`: "a split sale … exactly as a sale of 5" fails.
- `everyItemCalcs`: drop `claimedOf(typeId)`: "Trading, every item keeps the bought part's profit" fails (15 sold).
- `otherSales`: drop its scaling: "otherSales sees only what's left" fails.
- `builtAndSold`: count `reprocessing_tax` (drop the `JOB_FEE_REFS` check): "job 1 … not reprocessing" fails.
- `builtAndSold`: oldest purchases first: "500 Tritanium at the newest purchases before it" fails.
- `builtAndSold`: a missing unit costed at 0 silently (drop the `unbought.push`): "units never bought … said apart" fails.
- `WITHOUT_SETS` without `'Industry'`: "Industry needs no item groups" fails.
- `activityEvents`: compute `builtAndSold` whatever `built.state` (drop the state condition): "while the blueprints load: no
  Industry figure" fails, and the page case's refused bundle shows a figure.
- `JOB_FEE_REFS` without `'industry_security_tax'`: "job 1 … its fees from the journal (the job tax and the SCC's …)" fails.
- `builtAndSold`: drop `&& !o.freelance?.(t)`: "a purchase a freelance job counts isn't costed as a material" fails.

- [ ] **Step 7: The page case, and the recorded income**

In `scripts/pages.mjs`, above `// --- the end of the industry case`:

```js
    // --- Task 13: Results counts what was built and sold as Industry, and says what it couldn't cost.
    {
      const built = { jobId: 9601, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 10, licensedRuns: null, successfulRuns: null, probability: null, cost: 300_000,
        facilityId: 60001483, stationId: 60001483, outputId: 60001483, start: iso(now - 3 * 86400_000), end: iso(now - 2 * 86400_000), completed: iso(now - 2 * 86400_000), status: 'delivered', perRun: 1,
        seenAt: iso(now - 3 * 86400_000 + 600_000), first: { me: 10, te: 20, systemId: 30000119, index: 0.05, eiv: 2e6 } };
      const sale = { id: '77001', date: iso(now - 86400_000), typeId: 25894, qty: 10, unitPrice: 7_000_000, isBuy: false, locationId: 60003760, clientId: 1, source: 'esi' };
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, jobs: { 9601: built }, txs: { 77001: sale }, industry: DOC, cloud: CLOUD_STATE }, { alts: altStore });
      // The bundle refused first (pre-flight I4): Results says what you built isn't counted, with no Industry figure.
      // Routing turns Playwright's cache off, and each load is a new document, so the chunk is asked for afresh.
      await page.route('**/src/data/industry.json*', (route) => route.abort());
      await page.goto(`${BASE}#results`);
      await page.reload();
      await page.waitForSelector('[data-industry="results-note"]', { timeout: 20_000 }).catch(() => problems.push('Results never said the blueprints couldn’t be loaded'));
      if (!(await text('[data-industry="results-note"]')).includes('The blueprints couldn’t be loaded, so what you built isn’t counted here or in the total.')) problems.push(`with the blueprints refused, Results doesn’t say so: “${await text('[data-industry="results-note"]')}”`);
      if ((await text('[data-industry="results-industry"]')).trim() !== '–') problems.push(`with the blueprints refused, Results still shows an Industry figure: “${await text('[data-industry="results-industry"]')}”`);
      await page.unroute('**/src/data/industry.json*');
      await page.reload();
      await page.waitForFunction(() => /\+[\d.,]+ [MBk]/.test(document.querySelector('[data-industry="results-industry"]')?.textContent ?? ''), null, { timeout: 20_000 })
        .catch(() => problems.push('Results never counted Industry once the blueprints loaded'));
      const res = await text('.page');
      if (!/\+[\d.,]+ [MBk]/.test(await text('[data-industry="results-industry"]'))) problems.push(`Results doesn’t count the pumps built and sold as Industry: “${res.slice(0, 400)}”`);
      if (!(await text('[data-industry="results-note"]')).includes('materials you never bought before the job aren’t costed')) problems.push('Results doesn’t say the pump’s materials, never bought, aren’t costed');
    }
```

(Results reads ESI's item groups, which this case refuses: Industry still counts, needing none. The materials load the bundle:
the Large Trimark Armor Pump I Blueprint is in it.)

Then: `npm run check-income` fails on `results` only, with the new line `Industry – Hours a week on industry –`. Confirm that is
the only difference (`git diff` after recording), then run `RECORD=1 npm run check-income` once and `npm run check-income`
again (passes).

- [ ] **Step 8: A look in a browser**

`SHOTS=.playwright-mcp/industry2/13 LEDGER=industry npm run check-pages` (add `if (SHOTS) await page.screenshot({ path: `${SHOTS}-industry-results.png`, fullPage: true });`
to the block) and `npm run check-phone`: Results' By activity with the Industry row and its note at both widths; the Wallet's
All income for the large ledger unchanged (no Industry row: nothing built there).

- [ ] **Step 9: The notes**

- `docs/notes/positions-results.md`: a bullet **Built and sold is Industry's, claimed first** (the claim order; that a
  claimed sale's units come off Results' every-item position, its tax pro rata and its listing fee carried out with them;
  `otherSales` and "Sold, never bought" see what's left; built types are never in the activity sets, and why (an item both
  built and bought would leave trading whole); what Industry counts (correction 11), its job fees by every industry ref
  type ESI lists but `reprocessing_tax` (`industry_security_tax` too), and never a purchase a freelance job counts; while
  the blueprints load Results, the Wallet and the Characters cards say "Working out…" and what's being read, and if they
  couldn't be loaded that what was built isn't counted, with Try again (`industrySaid`): never claimed sales with no
  materials; its note under Results' row; the income recording's one new line and why).
- `docs/notes/limits.md`: "**Built and sold costs each job's materials at the blueprint's ME as first seen running**, with
  your site's bonuses where it ran at one (an NPC station has none; another structure's aren't known and aren't applied,
  nor a site's rigs when its system's security couldn't be read, each said), at your purchases before the job, newest first; materials you never bought aren't costed, and are said. A sale
  split between built and bought units is claimed for the built ones first, and a built unit used or moved rather than sold
  can still claim a later sale of bought stock. Invention's datacores and copies aren't charged, nor built units' share of
  their sell orders' broker fees (in neither Industry nor trading). Each character's own: a unit built by one and sold by
  another isn't claimed."
- `docs/notes/industry.md`, **Stage 2**: **Built and sold** pointing to positions-results.md, with corrections 9 to 11, and
  the bundle loading beyond the tab only for a ledger that needs it.

- [ ] **Step 10: The checks**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`
Expected: all pass, with `scripts/income-golden.json` re-recorded once (Step 7) and its diff the one Industry line.

- [ ] **Step 11: Commit**

```bash
git add src/lib/industryTrack.ts src/lib/types.ts src/lib/prefs.ts src/lib/positions.ts src/lib/everyItem.ts src/lib/results.ts src/lib/income.ts src/lib/wallet.ts src/components/activityEvents.ts src/components/Results.tsx src/components/Wallet.tsx src/components/Omega.tsx src/components/charIncome.ts src/components/Characters.tsx scripts/check.mjs scripts/pages.mjs scripts/income-golden.json docs/notes/industry.md docs/notes/positions-results.md docs/notes/limits.md
git commit -m "$(cat <<'EOF'
Industry stage 2: built and sold counts as Industry, not as "Sold, never bought"

A product you built and sold read on the Wallet and in All income as "Sold, never bought" at its whole sale value, while the
materials bought for it counted nowhere, so All income overstated industry by every material bought. Industry is now an
activity of its own: claimed sales after tax (only units its delivered jobs had made by the sale's time, built units
first, a sale split where it holds both), less every job's fee (the journal's entries naming the job, else ESI's cost) and
each manufacturing job's materials at the character's purchases before it; what it can't cost is said under its row.

Built types stay out of the activity sets, which take a whole item: an item both built and bought would have left trading
entirely. The claims come off Results' every-item positions and the other sales instead, so its bought part keeps its
profit in "Trading, every item" (tested). Results lists every activity, so the income recording gains one line,
"Industry – Hours a week on industry –", and was re-recorded for it; no figure moved (the recorded ledgers hold no jobs).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
)"
```

---

## After Task 13: shipping stage 2

Each task is ship-safe alone, so each may go out as it's done (CLAUDE.md: a branch, `--ff-only` merge to `main`, delete
the branch both sides, `npm run deployed` until it says "Shipped." before the next change). These are the controller's,
after shipping (implementers never touch D1 or ESI with a login); each finding goes in `docs/notes/industry.md` with its
evidence, as the notes always do.

- [ ] **The first job sighted has `first.me`** (correction 20): `SELECT data FROM records WHERE kind = 'jobs'` (read-only)
  for a job first seen running; record in the note whether ESI's blueprints read listed its blueprint while the job ran
  (the fresh read gave it) or the held doc stood in, so the fallback's need is known.
- [ ] **The first real reads of the two routes**, by the browser (2026-08-18) and by the Worker (2025-08-26): the main's
  sync log lists `blueprints` and `industry`; `npx wrangler tail jita-ledger-cloud` shows no `industry jobs read failed`
  after the next `:07` archive; `SELECT char_id, COUNT(*) FROM records WHERE kind = 'jobs' GROUP BY char_id` has the main's
  and each alt's (an alt's after the next `:37`), and `SELECT key FROM docs WHERE key = 'blueprints'` an alt's doc. Any
  field the readers expected and didn't get (`output_location_id`, `cost`, `completed_date`) goes in the note.
- [ ] **The first job checked** (spec, "After shipping"): the main's ME research job on a Scourge Rocket Blueprint, or the
  next one first seen running within 90 minutes of its start. Its Checked cell on Blueprints & jobs, and for a research or
  copy job at an NPC station its `sccShare` (the tip): if it isn't the constant, the reading is wrong (Task 11's note says
  how to tell which), and a separate commit changes `SCC_RESEARCH` or `SCC_COPY` citing the job.
- [ ] **The first industry journal entries**: which ref types a job writes and whether `context_id_type` is
  `industry_job_id` (`SELECT data FROM records WHERE kind = 'journal' AND data LIKE '%industry%'`, read-only), and whether
  a job's SCC comes as `industry_security_tax` (counted in `JOB_FEE_REFS`). If jobs' fees don't name the job, Industry falls
  back to ESI's cost on each job, as built; if the named entries don't sum to ESI's `cost`, say by how much in the note.
- [ ] **Slots in use against the game** (the controller's ruling on risk 5: ready jobs count, the tip says so, checked in
  game after shipping): the Industry window's "Jobs: N / M" beside the section's figure for the main; if a ready job doesn't
  hold its slot in game, `slotsUsed` stops counting it and limits.md loses that line.
