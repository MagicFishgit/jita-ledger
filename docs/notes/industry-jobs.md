# Industry: blueprints and jobs

Split from industry.md on 19 October 2026: stage 2 whole. Decisions worth not undoing. Jobs and blueprints as the app
keeps them, first sight, the cloud's reads, Blueprints & jobs, the job check and the measured facility tax, and what you
built and sold.

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
  - **Slots in use count ready jobs** (correction 13): a finished job is said to hold its slot until delivered (industry-jobs.md).
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
- **To do lists an alt's jobs to deliver** (Task 12A): `industry:<char>:<place>`, seen at the alt's `sheet` read and judged only on a roster read of this session; the rule is in orders-alerts-todo.md.
- **To do lists what you built** (Task 12B): `built:<char>:<product>:<place>`, the rule and its version in orders-alerts-todo.md. Two corrections to the spec. **Correction 15, where it's listed follows where it sits** (`builtWhere`): in Jita 4-4 on Jita's live book (`listingPrice`, every character's open orders taken off it), at the home hub's structure or in its system on the hub's Goonmetrics sell less a tick, anywhere else by the `industry` doc's `sell` choice, and a ship never goes to Jita while "never haul ships to Jita" is on (with no hub picked it says so and prices nothing). Running the finder inside To do would load the bundle, the map and every book. **Correction 18, versioned by the newest delivered job's ID**, not every delivered job's: the item is built from the newest jobs whose units the place still holds, so listing part of an older batch would drop that job, change the version and reopen a hand tick the user meant to hold. Another delivery changes it, which is when a hand tick should reopen. The place is named as an alt's jobs' facilities are (`jobPlaceSaid`, one `/universe/names` call for both).
- **Built and sold is the Industry activity** (Task 13, 11 October 2026: `builtClaims`, `builtAndSold`, `JOB_FEE_REFS` here; the
  claim order, what it counts and every state's words are in positions-results-wallet.md, its limits in industry-jobs.md). Three corrections to
  the spec: **9**, the claims are derived from the ledger (`claimsOf(d)`: jobs, trades, positions, Personal marks), not passed by
  each caller, and a split sale rides `Position.claimed` on Results' every-item positions; **10**, the bundle loads beyond this
  tab, on Results, the Wallet and the Characters page, only for a ledger holding a manufacturing job whose ME was recorded (not
  cancelled), and a site's system security (one public read) only for a site with rigs (`useBuiltInputs`): every other ledger,
  and the income recording's, never asks for it, so stage 1's "loaded by the tab only" holds for them; **11**, what Industry
  counts (claimed sales after tax, every job's fee, manufacturing materials at your own purchases before each job; invention's
  datacores and copies not charged). Where a job ran is Task 11's `jobPlace`: an NPC station has no material bonus, a structure
  only when it is one of your sites with a structure ID, so a home typed in costs its jobs without its bonuses, said (industry-jobs.md).
  A failed load can't be retried in place (gotchas.md): its button reloads the app, and so does this tab's own "Reload to try
  again" for the bundle and the map (it asked again in place, which did nothing). **A typed home is offered the structure its
  jobs ran at** (the review's ruling, 11 October 2026; positions-results-wallet.md): never matched by a guess inside `jobPlace`, which
  the job check, the measured tax and Use this rest on; the sites table offers each structure in the home's system where jobs ran
  and matches no site, and Use it sets the home's structure ID.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Slots in use count finished jobs not yet delivered**: players report a finished job holds its slot until it's delivered
  (EVE University's "Industry" page doesn't say); if the game frees it sooner, in use reads high by the ready jobs until they're
  delivered. **An alt's blueprints and jobs are as of the cloud's last hourly read**, and where a blueprint sits is named once per
  place (renaming a container in game shows on the next new place only).
- **A job's check and its measured tax need it first seen running within 90 minutes of its start**: a job installed and finished
  between reads can't be checked. Its EIV is at that hour's adjusted prices and its index ESI's four decimals (a few hundred ISK on a
  big job). A measured tax holds until the owner changes it, and is only offered. **They use the character's clone state now, not at install**: one that was Alpha when the job started and is Omega now reads 0.25% off (the Alpha tax is missing from the app's side, or the measured tax comes out that much under).
- **List what you built can lag and can come back** (To do, industry-jobs.md). Its units come from the hangar copy ESI holds for an hour, so an item can stay up to about an hour after you've listed; units are alike, so an old job's item can come back if you later buy the same product at that place (stated, not bounded); and products delivered into a container never list (nested units aren't loose stock) until the first real delivery says how they land. A ship is "checking" until its kind is read and is never priced at Jita from a home hub while "never haul ships to Jita" is on. "Either" lists at Jita here.
- **Built and sold costs each job's materials at the blueprint's ME as first seen running**, with your site's bonuses where it
  ran at one (an NPC station has none; another structure's aren't known and aren't applied, nor a site of kind Other's, nor a
  site's rigs when its system's security couldn't be read, each said), at what you still held from your purchases at the job's
  start, newest first (a purchase sold again before the job isn't held, so trading and Industry never both cost it); materials
  you never bought, or bought and sold again, aren't costed, and are said. **But a material still held at the job and sold
  later, along with units you didn't buy, is still costed in both**: Results' every-item lots don't know a job used units, so
  they cost the later sale against the purchases the job took. **Materials bought inside a tracked position stay in its stock**
  after a job uses them (no income counted twice: a position realizes only on sales). **A buy order's broker fee on a material
  counts nowhere** (Industry costs materials at their price; trading carries the fee in stock never sold), beside built units'
  share of their sell orders' broker fees (in neither Industry nor trading). Invention's datacores and copies aren't charged. A
  job with no cost from ESI and no journal entry naming it is charged no fee, and said. **A home you typed in (no structure ID)
  matches no job**, as for the job check: its jobs are costed with no structure or rig bonus, so their materials read up to its
  material bonus dear (said as "a structure that isn't one of your build sites"), until it has the structure's ID: found by name,
  or chosen from the structures in its system your jobs ran at (the sites table offers them; never set by itself). A sale split
  between built and bought units is claimed for the built ones first, and a built unit used or moved rather than sold can still
  claim a later sale of bought stock. Each character's own: a unit built by one and sold by another isn't claimed. **A position
  opened on a product you build reads the built units' sales as sold beyond what it bought, left out of its profit and, since a
  sale a position counts is never claimed, out of Industry's too**: open positions only for what you buy (the Wallet offers none
  on a sale Industry counts). The Wallet's "Trades no position tracks" says a built sale's why ("Built by you: Industry counts
  it"), but its tag and the cash flow's "Loot & other sales" stay as `autoTag` reads it.
