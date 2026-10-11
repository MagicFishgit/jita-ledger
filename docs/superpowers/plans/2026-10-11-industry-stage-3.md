# Industry, stage 3: copies to sell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cloud counts what blueprint copies sell for in The Forge every six hours (EVE Ref's public-contract snapshot,
compared with the set it kept last time), a Copies section on the Industry tab ranks the copies worth making for one lab
slot at the shown character's skills and site, and "Your copy business" shows the character's copy jobs, copies held and
the main's own copy contracts; sold copies count in the Industry activity, and an expired copy contract goes on To do.

**Architecture:** Pure rules in `src/lib/copyMarket.ts` (the Worker imports it: the compact copy set, what vanished before
expiry, the summary), `src/lib/copyFinder.ts` (browser only: a kind's row for one lab slot, what a real copy job says about
the copy cost's readings) and `src/lib/copyContracts.ts` (browser only: the `copyContracts` document, its states, copy sales
for the Industry activity). The Worker's round (`worker/src/copies.ts`) runs on the `37` cron after Goonmetrics, keeps the
set in `copy_set` parts and what sold in `copy_sold`, and precomputes the summary `GET /v1/copies` serves. The main's sync
reads its own copy contracts' items (with `raw_quantity`) and each public one's kinds once from ESI's public contract items,
and keeps them in a new synced document through `refusedDoc`. EVE Ref's snapshot is read as it decompresses (the Blueprints route
shares the reader), so a round holds a few tens of MB, never the 39 MB of CSV whole.

**Tech Stack:** React 18 + TypeScript + Vite; Cloudflare Worker + D1; ESI (`X-Compatibility-Date: 2026-08-18` from the
browser); EVE Ref's public contracts (`data.everef.net/public-contracts`, tar.bz2, unpacked by `worker/src/vendor/bunzip.ts`);
Node's type stripping for pure tests (`scripts/check.mjs`), the in-memory D1 stand-in for the Worker
(`scripts/check-worker.mjs`), Playwright for pages (`scripts/pages.mjs`) and the income recording (`scripts/income.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-10-industry-design.md`. Read it whole first, Revisions 1 and 2 included. This plan
builds its build-order tasks 14 and 15 (stage 3). Stages 1 and 2 are in `docs/notes/industry.md` and the stage-2 plan
(`docs/superpowers/plans/2026-10-10-industry-stage-2.md`); where this plan names their code, the code on `industry-2` (stage
2 merged) is what it means. Where the spec's names or shapes differ from the code, the code wins (listed below).

**Task layout.** The spec's two stage-3 tasks, split where a reviewer could reject one half and approve the other: **14A**
(the cloud counts copies sold: migration, `copyMarket.ts`, `worker/src/copies.ts`, `/v1/copies`), **14B** (the Copies
section and its finder, with what a real copy job says about the copy cost); **15A** (your copy contracts read and kept,
and Your copy business), **15B** (copy sales in the Industry activity), **15C** (To do: a copy contract that expired). The
spec's numbering is kept.

**The evidence this plan measured** (11 October 2026; `.playwright-mcp/research/industry-stage3/`, gitignored: `measure.txt`,
the public ESI answers, three EVE Ref snapshots unpacked; scripts beside it in `.playwright-mcp/research/industry-stage3-scripts/`,
run with `node --import ./scripts/register.mjs`, which loads the app's own `bpContracts.ts`):

- EVE Ref's latest snapshot is 6.57 MB (`cache-control: public, max-age=120`, an ETag); a history day's index lists one every
  30 minutes. The Forge's blueprint-only contracts: 15,124 / 15,151 / 15,235 at 00:00 / 06:00 / 12:00 UTC; the single-kind
  copy contracts among them 11,421 / 11,402 / 11,432 over 2,799 to 2,832 kinds; as compact JSON 1.02 to 1.03 MB (257 KB
  gzipped). Parsing one snapshot with `blueprintContracts`: 0.89 to 0.95 s in Node. Contracts of copies hold up to 500 items.
- Memory, reading the 12:00 snapshot in Node (heap plus ArrayBuffers, sampled each MB decoded): the whole files kept, then
  parsed, peaked at 113 MB above the process's own; read as it decompresses (correction 19), 31.1 MB, with the same 15,235
  contracts and 46,204 items, and every copy's seller (49,531) noted besides.
- **Six-hourly reads count far more than the research's multi-day ones**: 327 contracts vanished before expiry from 00:00 to
  06:00 and 430 from 06:00 to 12:00 (149 and 200 sellers), against 2,683 over 2 to 6 October and 2,077 over 6 to 9 October by
  the research's method: a contract listed and sold between two reads is never seen. Of the 327, none came back by the same
  seller at 12:00 (a delayed relist), 39 came back under another seller (bought and relisted: sales).
- ESI's public contract items (`/contracts/public/items/{id}/`, no login): `is_blueprint_copy`, `material_efficiency`,
  `time_efficiency`, `runs`, `item_id`, `quantity`, `is_included`, `record_id`, `type_id`; `cache-control: public`, an hour;
  an unknown contract answers 404 `{"error":"Contract not found"}`; a contract just expired still answered 200 from the cache
  (its spec documents 204 "Contract expired or recently accepted"). ESI's character contracts carry a required `availability`
  (`public`, `personal`, `corporation`, `alliance`) the app drops today, and their items a `raw_quantity` (−2 a copy).
- The journal's ref types (OpenAPI at 2026-08-18) include `copying` (a copy job's fee, already in `JOB_FEE_REFS`),
  `contract_price`, `contract_brokers_fee` and `contract_sales_tax`; context `contract_id` exists. None of a copy contract's
  entries has been seen in the user's journal.

## Where this plan corrects the spec

Each is said again in the task that owns it, and goes in `docs/notes/industry.md`.

1. **Copy sales add the contract's price; the copy jobs' fees are already charged** (Task 15B). Stage 2's `builtAndSold`
   charges every job's fee at its start (correction 11; `JOB_FEE_REFS` holds `copying`), so the spec's "the contract's price
   less the copy jobs' fees for those runs" would charge them twice. A sold copy contract adds its price (the journal's
   `contract_price` naming it, else the contract's own price) times the share of its copies your delivered copy jobs made;
   and the contract fees the journal names for any copy contract of a blueprint you'd copied before listing it count in full at
   their time, sold or not (a listing fee is paid either way). Copies are claimed against your delivered copy jobs to tell copies
   you made from copies bought or given (Brave's free copies): only claimed copies count.
2. **`copy_sold` takes about 1,500 rows a day, not about 320** (Task 14A): measured above. With the prune after eight days,
   and each insert and prune written twice with the `copy_sold_at` index, about 6,000 row writes a day, 180,000 a month,
   under 0.4% of the plan's 50 M. The finder's pace is the six-hour counts, which is
   the design's point; the research's weekly tables understated sales about three to five times.
3. **The kept set is split into rows from the start** (Task 14A, `COPY_PART` 3,000 contracts, about 280 KB a row), not
   "split by type range if it nears 1.5 MB": it is 1.02 to 1.03 MB now, and one row would fail outright the day the market
   doubles. Split by contract ID order: nothing reads it by type.
4. **The round's state lives in `scan_meta`** (key `copies`: when it last tried and read, its error, and each comparison's
   span), as `checks.ts` keeps its own, and the summary under key `copySummary`, worked out once a round: so `copy_set` is
   only the set, and `GET /v1/copies` never parses a megabyte. The spec's `copy_set (at, data)` becomes `(part, at, data)`.
   What sold, the set, the summary and the state are written in one batch (one D1 transaction), so a failed write never leaves
   a comparison's span out of `reads` with its sales in.
5. **A reprice is told by every copy in The Forge's item exchanges of the newer snapshot**, not only the kept copy set: a seller
   moving a copy into a bundle repriced it, he didn't sell it. `blueprintContracts` drops a bundle holding anything that isn't
   a blueprint, so the snapshot reader notes every copy's seller as it streams, those bundles included (`copyIssuers`; 7,656 of
   49,531 copies on 11 October at 12:00 sat in contracts the comparables leave out); without the reader's map (the tests'
   snapshots), `itemIssuers` over the blueprint contracts.
6. **Your own contracts are left out of what sold and the asks** (every character whose login the cloud holds, and every alt
   on a roster, removed ones too), as the Blueprints route leaves the caller's out.
7. **A kind's price a run is the lower of the median sold and the median ask now**, the Blueprints page's own rule
   (`quoteBlueprint`: what sold, never over the median ask), so a kind whose asks fell under what sold isn't priced at the old
   sales (the research's doubtful Genetic Lock Preserver).
8. **The finder lists only kinds a player can make by copying**: a blueprint the bundle holds, with a copying activity, that
   isn't an invention product. The rest are counted and said ("copies of blueprints NPCs don't sell", "Tech II copies, made by
   invention"): on 11 October, 32306's 13 sales (a copy of a blueprint the bundle doesn't hold) were the most sold of the
   fixture's types.
9. **`copyRow` lives in `src/lib/copyFinder.ts`, not `copyMarket.ts`**: the Worker imports `copyMarket.ts`, and `tsc -p worker`
   type-checks what it imports; a row reads stage 2's `jobCheck` and the finder's types (stage 2's correction 7, the same
   reason). `copyMarket.ts` keeps what the Worker needs.
10. **Copy contracts are kept in a synced document of their own, `copyContracts`** (Task 15A), not in `meta.contracts`: ESI lists
    a character's contracts 30 days back and the sync replaces `meta.contracts.list` each time, so a sale would drop out of
    Results after a month; and the meta document goes up every sync, which a growing list would bloat. The document changes
    only when a copy contract does. A Worker a version behind refuses it and `refusedDoc` holds it back.
11. **`ContractItem` keeps `raw` (ESI's `raw_quantity`, null when ESI gives none) and `MyContract` keeps `availability`.**
    Items read before this stage have no `raw` key: those of item exchanges you issued are read again once while ESI still
    lists them. `itemsToRead` widens to your own outstanding item exchanges only (not every outstanding one you can see).
12. **"Expired" is ESI's `outstanding` past `date_expired`**: ESI has no expired status. An expired contract keeps its copies
    until deleted in game; they go back to the station it was made at (its `start_location_id`, named with the couriers').
13. **A contract that leaves ESI's list is stamped `gone` once** (the read that first misses it, never one still in the list whose
    items weren't read this sync), its last status kept. ESI lists a deleted contract as `deleted` within its 30 days, so leaving
    the list means the 30 days passed: To do ends the item on a newer read without it, saying "ESI lists contracts only 30 days
    back: if you didn't delete it in game, its copies are still in it" (a complete list: absence there is evidence).
14. **Kinds are read once a contract, at most 20 a sync, and never for a private one**: 200 gives the kinds; 204 or no copy in
    the answer is `gone` ("left the public list before its kinds were read"); a 404 while it's still outstanding and not past its
    expiry is tried again next sync (ESI's public list lags a new contract), `gone` once it isn't outstanding or has expired, so
    an expired contract isn't asked again every sync until deleted.
15. **The copy cost's readings are worked out from your jobs, live** (Task 14B, the brief's P5): copying's SCC (EVE Ref's 4%,
    `SCC_COPY`) by the newest copy job checked at an NPC station (`sccShare`, stage 2's Task 11), and the copy and research rigs'
    cost bonus (dogma 2595, taken as multiplying the structure's) by the newest copy or research job checked at one of your
    structure sites with such a rig and its tax typed. Until each has one, the finder's cost tip says it isn't checked yet.
    A changed constant is a later commit citing the job, as stage 2 settles the research SCC.
16. **The finder's runs a day are over at least a day of counting** (`max(1, days)`): the first reads would otherwise turn half
    a day's sales into twice a day's. Before a week, "Counting what sells: N days so far" (spec), and a comparison that spanned
    more than 6.5 hours is said as a gap in which listed-and-sold copies were missed.
17. **The tests' snapshots are three of 11 October, six hours apart, not the research's of 2, 6 and 9 October**: the cloud
    compares six-hourly reads, and only reads that close show the spec's case of a contract listed and sold between the first
    and the third (4 in the fixture's five types, missed by comparing the first with the third: 25 sales against 28). The
    research's files are kept where they were, unchanged.
18. **`copy_sold`'s `qty` is `copies`** (the spec's column name, here how many copies a contract held: the word the summary and
    the finder use), and `/v1/copies` gives the median ask beside the cheapest (a superset of the spec's "cheapest ask": the price
    rule of correction 7 needs it). The Sold column's tip always says a contract listed and sold between two reads is missed
    (spec), not only when a gap is long.
19. **The snapshot is read as it decompresses** (Task 14A, I5; the controller's ruling): `ContractSink` splits each CSV line where
    it lies and keeps only The Forge's blueprint-only item exchanges and every copy's seller, never the 39 MB of CSV whole, and
    the bzip2 decoder reuses its 3.6 MB block buffer. Measured on the 11 October 12:00 snapshot: the old reader peaked at 113 MB
    of heap and ArrayBuffers before collection (122 MB in the pre-flight's measure), near the Worker's 128 MB in an isolate the
    five-minute round and the Sniper may share; the streaming reader at 31.1 MB, the same contracts (tested equal). Its bar is
    60 MB, measured in Task 14A step 8. The Blueprints route shares it; its answer is unchanged.
20. **A contract back in a newer snapshot is taken out of `copy_sold`**: a partial EVE Ref snapshot (a page its scraper missed)
    makes every contract on it look sold; the next whole one shows it never left. Tested with one contract missing from the
    06:00 snapshot: counted (17), then taken out (28, as with whole snapshots).
21. **A round stamps its try before it reads, and its fetch gives up after 90 s** (I5): a memory kill or the wall limit is no
    throw, so without the stamp nothing would say a round was stopped, and the same round would run again every hour; after
    one, the next try waits the full six hours.

- Pure `src/lib` modules the Worker imports (`copyMarket.ts`, `bpContracts.ts`, and what they import) stay free of
  `./config`, `./store`, React and the DOM, even for a type; no enums, namespaces or constructor parameter properties
  anywhere the Worker or `npm run check` loads. `copyFinder.ts` and `copyContracts.ts` are browser-only but pure (check.mjs
  loads them): the same rules.
- The site and the Worker deploy in either order: migration `0020_copies.sql` only adds tables; `GET /v1/copies` 404s on an
  old Worker and the Copies section says the cloud is a version behind; the new `copyContracts` document goes through
  `refusedDoc`; an older browser ignores a document it doesn't know (`isDocKey`) and the extra fields on `ContractItem` and
  `MyContract`.
- Nothing of an alt's is ever written into the main's ledger. The Copies section reads each alt's pulled copy through
  `useIndustryChars` and writes nothing; contracts are read for the main only. The alt-store tripwire in `scripts/check.mjs`
  is **unchanged by this stage**: no new file reads the alt store (`IndustryCopies.tsx` gets its characters from
  `Industry.tsx`).
- Not known is never 0 or "none": every state says what it is (the cloud off, a version behind, switched off, not read yet,
  counting, failed with when it last read; a kind's figures unpriced with why). "No copies sold" only after a read that
  compared two sets.
- `scripts/income-golden.json` may be re-recorded (`RECORD=1 npm run check-income`) **only in Task 15B**, only if a figure or
  a word moves, with the commit saying why each one moved; no ledger it records holds a job or a `copyContracts` document, so
  the figures are expected not to move. Every other task's `npm run check-income` passes with it byte-identical.
- No new permission in stage 3 (contracts, blueprints and industry jobs are already in `SCOPE`), so no relog.
- To do follows the user's "not too tight so i don't get suggestions": the expired-contract item's version is `1`, and it
  ticks off only on a newer contracts read.
- Never assume ships are hauled to Jita: "building instead" is the finder's own row, which keeps the switch.
- EVE Ref is someone else's site: one snapshot every six hours from the cloud, a User-Agent naming the project only (the
  Blueprints route's `Jita Ledger (a personal EVE trading tool)`), not a watched job, `COPIES_ON` in `worker/src/copies.ts`
  to stop it. D1 row writes are counted in the task's notes: a round that read the same snapshot writes only its state.
- Implementers never deploy, never run `wrangler … --remote`, never touch D1 (remote or local), never call ESI with a login.
  Public ESI and EVE Ref at build time, if a task needs it, are called with `User-Agent: jita-ledger (research)` (and
  `X-Compatibility-Date: 2026-08-18` for ESI) and nothing identifying, into `.playwright-mcp/research/industry-stage3/`.
- The app's voice (app-conventions.md): a section is a lead line and three or four points; a long tip is a lead line,
  bullets, then an example (`tipText`); a count is a tile, and a count tile filters the table it counts; plain words; no
  figure invented; skill levels in Roman numerals.
- Stand-in data lives in the `industry` case of `scripts/pages.mjs` (each block above `// --- the end of the industry
  case`), never in `scripts/ledgers.mjs`.
- Every task ends with: `npm run check`, `npm run build`, `npm run check-pages` (`LEDGER=industry` while iterating, the full
  run before committing), `npm run check-phone` for UI, `npm run check-income`, a look at screenshots of what changed at 1,440
  and 390 px (`SHOTS=.playwright-mcp/industry3/<task> npm run check-pages`, then open the PNGs), the notes (`docs/notes/industry.md`,
  and limits.md / positions-results.md / orders-alerts.md / cloud.md / CLAUDE.md where the task says), and a commit whose
  message says what was wrong or missing, why, and the evidence, ending with `Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf`.
- Each test is shown failing with its rule planted wrong (the step names the planted line), then passing.

## Review Focus

1. **A round that can't compare, or is stopped.** The first read ever, a read of the same snapshot (EVE Ref stalled), a failed
   fetch, a snapshot older than the kept set, a kept set more than seven days old and a partial snapshot must write no lasting
   `copy_sold` row, and the Copies section must never say "no copies sold" before a read compared two sets; a round the cloud
   kills must leave a trace and not run again within the hour. Pinned in Task 14A, step 2 (check-worker: first read, same snapshot, failure, a set over a week old, a partial
   snapshot, the interrupted stamp and the six-hour wait after it) and Task 14B, step 7 (no table before a read counted).
2. **A reprice, a relist by someone else, an expiry.** A contract its seller moved into a new contract (or a bundle) isn't a
   sale; one whose copy came back under another seller is; one past its expiry isn't. Pinned in Task 14A, step 2 (the 11
   October fixture's 4 Tempest and 1 Standup reprices, its 5 Capital Turret Hardpoint relists, a bundle move, an expiry).
3. **Copies sold that you didn't make, or to yourself.** Copies you bought or were given, a contract sold to one of your own
   characters, a contract listed before the copy job that made its type was delivered: none counts in Industry, each is said.
   And a copy job's fee is charged once. Pinned in Task 15B, step 1.
4. **A copy contract whose kinds can't be read.** Private, gone before it was read, a 404 while still outstanding (tried
   again), a sale before its kinds were read: it still says what it holds by type and count, still counts in Industry when
   your jobs made its copies, and never asks the public route for a private one. Pinned in Task 15A, step 1 and step 7 (the sync
   with ESI stubbed), and Task 15B, step 6 (a sold contract whose kinds are `gone` still counts on Results).
5. **An expired copy contract that leaves ESI's list.** Past ESI's 30 days it's no longer listed: the To do item must end
   ("no longer in your contracts as ESI lists them") on a newer read, never stay "being checked" for good, and never tick off
   on a read from before the one that listed it. Pinned in Task 15C, step 1.

## Files

| File | Responsibility | Task |
| --- | --- | --- |
| `worker/migrations/0020_copies.sql` (new) | `copy_set (part, at, data)`, `copy_sold (contract_id, type_id, me, te, runs, copies, price, issuer, at)` | 14A |
| `src/lib/bpContracts.ts` | `ContractSink`: the region's blueprint contracts and every copy's seller, kept as the tar streams out | 14A |
| `worker/src/vendor/bunzip.ts` | The 3.6 MB block buffer reused across blocks | 14A |
| `src/lib/copyMarket.ts` (new) | `compactCopies`, `itemIssuers`, `copiesSold`, `soldRows`, `copySummary`; the types | 14A |
| `worker/src/blueprints.ts` | `readSnapshot(url, opts)` (streaming, 90 s timeout), `LATEST`, `EVE_REF_UA`, `READ_TIMEOUT_MS`; its own route's answer unchanged | 14A |
| `worker/src/copies.ts` (new) | `refreshCopies`, `copiesFor`, `ownCharacters`, `latestSnapshot`, `COPIES_ON` | 14A |
| `worker/src/index.ts` | The `37` chain runs copies after Goonmetrics; `GET /v1/copies` | 14A |
| `scripts/fixtures/copy-snapshots.json` (new) | Three 11 October snapshots' contracts holding five types (63,763 bytes) | 14A |
| `src/lib/copyFinder.ts` (new) | `copyRow`, `copyRows`, `heldOriginal`, `thinSaid`, `countingSaid`, `copyReadings`, `rigNearer` | 14B |
| `src/lib/cloud.ts`, `src/components/hustles/industryMarket.ts` | `cloudCopies`; `useCopyMarket` (held like the NPC row) | 14B |
| `src/components/hustles/IndustryCopies.tsx` (new), `Industry.tsx` | The Copies section (finder; Your copy business in 15A) | 14B, 15A |
| `src/lib/contracts.ts` | `ContractItem.raw`, `MyContract.availability`, `itemsToRead` widened | 15A |
| `src/lib/copyContracts.ts` (new) | The `copyContracts` doc: `copyContractsOf`, `kindsToRead`, `readKinds`, `copyState`, sanitizer; `copySales`; `copiesWhat` | 15A, 15B, 15C |
| `src/lib/sync.ts` | Your copy contracts' items and kinds, the doc written against live state | 15A |
| `src/lib/store.ts`, `src/lib/cloudSync.ts`, `src/lib/cloud.ts`, `worker/src/sync.ts` | `Data.copyContracts`, `DOC_KEYS`, the pull's sanitizer | 15A |
| `src/lib/config.ts` | `SCOPE_INFO` for contracts names the Copies section | 15A |
| `src/lib/income.ts` | Copy sales in Industry's events; `IndustryActs.copiesNotMade`; the Industry wording | 15B |
| `src/lib/todo.ts`, `src/components/Todo.tsx` | Kind `copyContract`; `action.contract` opens the contract in game | 15C |
| `scripts/check.mjs`, `scripts/check-worker.mjs`, `scripts/pages.mjs` | Tests | every task |
| `docs/notes/industry.md`, `limits.md`, `positions-results.md`, `orders-alerts.md`, `cloud.md`, `finding-trades.md`, `CLAUDE.md` | Notes | every task |

`.claude/rules/industry.md`'s `paths:` gains each new file in the task that creates it (a frontmatter that doesn't parse loads
like an import: keep it valid YAML, and run `head -20 .claude/rules/industry.md` after editing).

---
### Task 14A: The cloud counts what copies sell, every six hours

**Files:**
- Create: `worker/migrations/0020_copies.sql`, `src/lib/copyMarket.ts`, `worker/src/copies.ts`,
  `scripts/fixtures/copy-snapshots.json` (cut by an existing script, step 1), and, gitignored,
  `.playwright-mcp/research/industry-stage3-scripts/measure-memory.mjs` (step 8)
- Modify: `src/lib/bpContracts.ts` (`ContractSink`), `worker/src/vendor/bunzip.ts` (the block buffer reused),
  `worker/src/blueprints.ts` (`readSnapshot(url, opts)` filtering as it decompresses, with a 90 s timeout; `LATEST`,
  `EVE_REF_UA`, `READ_TIMEOUT_MS` exported), `worker/src/index.ts` (the `37` chain, `GET /v1/copies`), `scripts/check.mjs`, `scripts/check-worker.mjs`,
  `.claude/rules/industry.md`, `docs/notes/industry.md`, `docs/notes/limits.md`, `docs/notes/finding-trades.md` (the
  Blueprints bullet: the reader is shared), `CLAUDE.md` (Timers paragraph; the Worker's imports list gains `copyMarket`)

**Interfaces:**
- Consumes: `blueprintContracts`, `csvFields`, `untar`, `TAR_DONE`, `type BpContract` (`src/lib/bpContracts.ts`); `bunzipTo`
  (`worker/src/vendor/bunzip.ts`); `THE_FORGE` (`src/lib/constants.ts`); `BadRequest` is not needed (the route takes no input).
- Produces (later tasks rely on these exact names):
  - `src/lib/bpContracts.ts`: `class ContractSink` (`new ContractSink({ region, now?, types? })`, `writeByte(b)`, `result():
    { contracts: BpContract[]; at: string | null; copyIssuers: ReadonlyMap<number, number> }`).
  - `worker/src/blueprints.ts`: `LATEST`, `EVE_REF_UA`, `READ_TIMEOUT_MS` (90,000), `readSnapshot(url, { region, now?, types? })`.
  - `src/lib/copyMarket.ts`: `type CopyKind = { typeId; me; te; runs }`, `copyKindKey(k): string` (`"type|me|te|runs"`),
    `type CopyRow` (tuple below), `type CopyRead = [from: number, to: number, sold: number]`, `type SoldRow`,
    `type KindSold = { typeId; me; te; runs; contracts; copies; sellers; perRun }`, `type Ask = [cheapest, median, contracts,
    sellers]` (a run's price), `type CopySummary = { at: string; days: number; gapHours: number; reads: number; sold:
    KindSold[]; asks: Record<string, Ask> }`, `COPY_WINDOW_DAYS` (7), `COPY_KEEP_DAYS` (8), `compactCopies(contracts)`,
    `itemIssuers(contracts)`, `copiesSold(older, newerIds, itemIssuer, now)`, `soldRows(rows, at)`, `copySummary(o)`.
  - `worker/src/copies.ts`: `COPIES_ON`, `COPIES_REFRESH_MS`, `COPIES_SLACK_MS`, `COPIES_RETRY_MS`, `COPIES_BUDGET_MS`,
    `COPY_PART`, `INTERRUPTED`, `type Snapshot` (`copyIssuers?` from the reader), `type CopiesState`, `latestSnapshot()`,
    `ownCharacters(db)`, `refreshCopies(db, now?, o?)` (its result may carry `back`: contracts taken out of `copy_sold`),
    `copiesFor(db, on?)`.
  - `GET /v1/copies` → `{ off: true }` (switched off) | `null` (never read) | `CopySummary & { tried: string | null; error:
    string | null; stale: string | null }` (`stale`: EVE Ref's latest snapshot was still the one kept, as of that time: not an error).

**Why the shapes.** The set is every single-kind copy contract (every item a copy of one type at one ME, TE and runs, nothing
asked in return) of The Forge, as `[contract, type, ME, TE, runs a copy, copies, price, issuer, expires in seconds, item IDs]`:
the item IDs are what tells a reprice from a sale (`vanishedSince`'s rule, against the reader's `copyIssuers`: every copy in The
Forge's item exchanges, a bundle with other items included, correction 5), and nothing else of a contract is read again.
`copy_set` holds it in rows of `COPY_PART` contracts (correction 3). A round compares the kept set with EVE Ref's latest:
what was kept, is gone from the new snapshot, wasn't past its expiry at the new snapshot's time and whose items didn't come
back in a contract by the same seller vanished before expiry (sold, most likely), and goes in `copy_sold` at the new
snapshot's time (`INSERT OR IGNORE` on the contract). A contract kept in `copy_sold` that is back in the new snapshot never left:
a partial snapshot made it look sold, and it's taken out (correction 20). Each comparison's span goes in the state's `reads`,
which says how many days are counted and how long the longest stretch between two reads was. What sold, what came back, the
set, the summary and the state go in one batch, one transaction (correction 4): a round whose write fails leaves the last
round's all as it was, and the next compares again.

**When it reads.** Due when its last good read is 5½ hours old (six hours less the half-hour slack Goonmetrics allows for
the alts' read ahead of it) and its last try at least 50 minutes old, so a failed or unmoved read is tried again the next
hour, never twice an hour. Nothing starts past `COPIES_BUDGET_MS` (12 minutes) from the cron's scheduled time: Goonmetrics
may run to 10, and the invocation stops at 15. Before it reads, the round stamps its try as `INTERRUPTED`; every way it ends
writes over that, so only a round the cloud stops (memory, the wall limit: no `catch` sees those) leaves it, and after one the
next try waits the full six hours, not the hour (correction 21). The fetch gives up after 90 s. A first read only keeps the set;
a read whose snapshot isn't newer than the kept one, a failed one, and one more than seven days after the kept set compare
nothing (Review Focus 1).

- [ ] **Step 1: Cut the fixture**

The three snapshots of 11 October 2026 (00:00, 06:00, 12:00 UTC) are unpacked in `.playwright-mcp/research/industry-stage3/`
(gitignored) and the cut script is beside them; it reads them with the app's own `blueprintContracts` and keeps every Forge
contract holding the Tempest Blueprint (693), the Capital Turret Hardpoint Blueprint (21012), the Standup Missile Guidance
Enhancer I Blueprint (37045), the Large Trimark Armor Pump I Blueprint (25895) or 32306 (a copy of a blueprint the bundle
doesn't hold), as `[id, price, expires, issuer, [[typeId, copy 1/0, me, te, runs, qty, itemId]]]`.

```bash
R=.playwright-mcp/research/industry-stage3
node --import ./scripts/register.mjs .playwright-mcp/research/industry-stage3-scripts/cut-fixture.mjs scripts/fixtures/copy-snapshots.json $R/snap-2026-10-11_00-00-07 $R/snap-2026-10-11_06-00-05 $R/snap-2026-10-11_12-00-05
```

Expected: `scripts/fixtures/copy-snapshots.json 63763 [ [ '2026-10-11T00:01:04Z', 119 ], [ '2026-10-11T06:01:01Z', 111 ], [ '2026-10-11T12:01:00Z', 111 ] ]`.
If the snapshot folders are missing, re-download them (`dl/` holds the `.tar.bz2`; `python3 -I .playwright-mcp/research/bpo/extract_everef.py <tar.bz2> <new dir>`).

- [ ] **Step 2: Write the failing tests**

Add to `scripts/check.mjs`, before the final `console.log(failed ? …)`:

```js
console.log('\n--- Industry stage 3: the copy market (copyMarket.ts, Task 14A) ---');
{
  const M = await import('../src/lib/copyMarket.ts');
  const fsC = await import('node:fs');
  const FX = JSON.parse(fsC.readFileSync(new URL('./fixtures/copy-snapshots.json', import.meta.url), 'utf8'));
  const contracts = (s) => s.contracts.map(([id, price, expires, issuer, items]) => ({ id, price, issued: '', expires, stationId: 60003760, issuer, title: '',
    items: items.map(([typeId, copy, me, te, runs, qty, itemId]) => ({ typeId, copy: copy === 1, me, te, runs, qty, itemId })) }));
  const [a, b, c] = FX.snapshots.map((s) => ({ at: Date.parse(s.at), all: contracts(s) }));
  const sets = [a, b, c].map((s) => M.compactCopies(s.all));
  const byType = (rows) => rows.reduce((m, r) => ({ ...m, [r[1]]: (m[r[1]] ?? 0) + 1 }), {});
  // 11 October 2026: The Forge's contracts holding the fixture's five types, at 00:00, 06:00 and 12:00 UTC.
  eq('the single-kind copy contracts of each snapshot (of 119, 111 and 111 holding the five types)', sets.map((x) => x.length), [96, 87, 82]);
  const C = (id, items, extra = {}) => ({ id, price: 1e6, issued: '', expires: '2026-10-20T00:00:00Z', stationId: 60003760, issuer: 7, title: '', items, ...extra });
  const I = (typeId, me, te, runs, itemId, copy = true) => ({ typeId, copy, me, te, runs, qty: 1, itemId });
  eq('  not one: a bundle of two kinds, an original, a copy with no runs, a contract with no price', M.compactCopies([
    C(1, [I(693, 10, 20, 1, 11), I(693, 10, 20, 2, 12)]), C(2, [I(693, 10, 20, null, 21, false)]), C(3, [I(693, 10, 20, null, 31)]), C(4, [I(693, 10, 20, 1, 41)], { price: 0 }),
    C(5, [I(693, 10, 20, 1, 51), I(693, 10, 20, 1, 52)]),
  ]), [[5, 693, 10, 20, 1, 2, 1e6, 7, Date.parse('2026-10-20T00:00:00Z') / 1000, [51, 52]]]);

  const sold = (older, newer) => M.copiesSold(older, new Set(newer.all.map((x) => x.id)), M.itemIssuers(newer.all), newer.at);
  const ab = sold(sets[0], b), bc = sold(sets[1], c);
  eq('vanished before expiry, 00:00 to 06:00: 2 Tempest, 13 of 32306, 1 Standup', [ab.length, byType(ab)], [16, { 693: 2, 32306: 13, 37045: 1 }]);
  const gone = sets[0].filter((r) => !b.all.some((x) => x.id === r[0]));
  eq('  4 Tempest and 1 Standup contracts were repriced by their sellers (their copies back in a newer contract of theirs): not sales', [gone.length, byType(gone)], [21, { 693: 6, 32306: 13, 37045: 2 }]);
  eq('06:00 to 12:00: 12, among them 5 Capital Turret Hardpoint contracts whose copies came back under another seller (bought and relisted: sales)',
    [bc.length, byType(bc), bc.filter((r) => r[9].some((it) => M.itemIssuers(c.all).has(it))).length], [12, { 693: 1, 21012: 8, 25895: 3 }, 5]);
  // The design's point (spec, "What sold"): a contract listed after one read and sold before the next but one is seen by reads six
  // hours apart and missed by comparing the first with the third, the research's way.
  const ac = sold(sets[0], c), fresh = bc.filter((r) => !sets[0].some((x) => x[0] === r[0]));
  eq('  4 contracts listed after 00:00 and sold before 12:00: counted six-hourly, missed by comparing 00:00 with 12:00 (25 against 28)',
    [fresh.length, fresh.filter((r) => ac.some((x) => x[0] === r[0])).length, ac.length, ab.length + bc.length], [4, 0, 25, 28]);
  const T0 = Date.parse('2026-10-19T00:00:00Z');
  const k = (id, issuer, itemId, expires = '2026-10-20T00:00:00Z') => M.compactCopies([C(id, [I(693, 10, 20, 1, itemId)], { issuer, expires })])[0];
  // A bundle of two blueprints is a contract the comparables keep, so itemIssuers sees it; one with other items in it only the
  // reader's copyIssuers sees (the reader's tests below, and the Worker's).
  eq('  past its expiry at the newer snapshot\'s time: not a sale; a copy moved by its seller into a bundle of blueprints: a reprice, not a sale',
    M.copiesSold([k(1, 7, 100, '2026-10-18T23:00:00Z'), k(2, 7, 200), k(3, 7, 300)], new Set(), M.itemIssuers([C(9, [I(693, 10, 20, 1, 200), I(688, 10, 20, 1, 999)], { issuer: 7 })]), T0).map((r) => r[0]), [3]);

  const rows = [...M.soldRows(ab, b.at), ...M.soldRows(bc, c.at)];
  const sum = M.copySummary({ sold: rows, current: sets[2], reads: [[a.at, b.at, ab.length], [b.at, c.at, bc.length]], exclude: new Set(), at: c.at });
  eq('the summary: as of the newest snapshot, half a day counted over two reads, the longest six hours',
    [sum.at, Math.round(sum.days * 1000) / 1000, Math.round(sum.gapHours * 100) / 100, sum.reads], ['2026-10-11T12:01:00.000Z', 0.5, 6, 2]);
  eq('  each kind sold: contracts, copies, sellers, the median price a run', sum.sold.map((x) => [x.typeId, x.me, x.te, x.runs, x.contracts, x.copies, x.sellers, Math.round(x.perRun)]), [
    [693, 10, 20, 1, 2, 2, 1, 999999], [693, 10, 20, 10, 1, 1, 1, 659000], [21012, 10, 20, 19, 3, 3, 1, 73684], [21012, 10, 20, 40, 5, 5, 1, 162500],
    [25895, 10, 20, 40, 3, 3, 1, 112500], [32306, 0, 0, 1, 13, 49, 6, 115000000], [37045, 10, 20, 5, 1, 1, 1, 1780000]]);
  eq('  the asks now, a run: cheapest, median, contracts, sellers', [sum.asks['21012|10|20|40'], sum.asks['693|10|20|10'], sum.asks['37045|10|20|5'], sum.asks['25895|10|20|40'] ?? null],
    [[98750, 175000, 11, 3], [659000, 694000, 20, 7], [1680000, 1690000, 4, 2], null]);
  // The one seller of the five Capital Turret Hardpoint sales, and the seller of the first 10-run Tempest copy listed at 12:00 (2 of its 20 asks).
  const seller = rows.find((r) => r.typeId === 21012 && r.runs === 40).issuer;
  const lister = sets[2].find((r) => r[1] === 693 && r[2] === 10 && r[3] === 20 && r[4] === 10)[7];
  const own = M.copySummary({ sold: rows, current: sets[2], reads: [[a.at, b.at, 16], [b.at, c.at, 12]], exclude: new Set([seller, lister]), at: c.at });
  eq('  your own contracts are no one\'s market: their sales and asks left out', [own.sold.some((x) => x.typeId === 21012 && x.runs === 40), own.asks['693|10|20|10']], [false, [659000, 692000, 18, 6]]);
  eq('  a sale and a read more than seven days old are out of the window', M.copySummary({ sold: [{ ...rows[0], at: c.at - 8 * 86400_000 }], current: [], reads: [[c.at - 9 * 86400_000, c.at - 8 * 86400_000, 1]], exclude: new Set(), at: c.at }),
    { at: '2026-10-11T12:01:00.000Z', days: 0, gapHours: 0, reads: 0, sold: [], asks: {} });
  eq('  the first read: nothing compared yet, 0 days, the asks known', [M.copySummary({ sold: [], current: sets[0], reads: [], exclude: new Set(), at: a.at }).days, Object.keys(M.copySummary({ sold: [], current: sets[0], reads: [], exclude: new Set(), at: a.at }).asks).length], [0, 11]);
  eq('the kind\'s key', M.copyKindKey({ typeId: 693, me: 10, te: 20, runs: 1 }), '693|10|20|1');
}
```

And at the end of the block `--- blueprints and their contracts ---` in `scripts/check.mjs` (before its closing brace, so it uses
that block's `tar`, `contracts` and `items`; `ContractSink` and `TAR_DONE` join its import from `bpContracts.ts`), the reader
that filters as it decompresses (correction 19):

```js
  // The streaming reader (stage 3): the same contracts as blueprintContracts from whole files, holding nothing else.
  const feed = (snk, bytes) => { try { for (const x of bytes) snk.writeByte(x); return null; } catch (e) { return e; } };
  const NOW = Date.parse('2026-09-29T00:00:00Z');
  const snapBytes = tar([['meta.json', '{"scrape_end":"2026-09-29T09:30:43Z"}'], ['contracts.csv', contracts], ['contract_items.csv', items], ['dogma.csv', 'never decoded']]);
  const cs = new ContractSink({ region: 10000002, now: NOW });
  const stop = feed(cs, snapBytes);
  const streamed = cs.result();
  eq('the streaming reader keeps exactly what blueprintContracts keeps from whole files, and stops after its three files',
    [stop === TAR_DONE, { contracts: streamed.contracts, at: streamed.at }], [true, blueprintContracts(untar(snapBytes), { region: 10000002, now: NOW })]);
  eq('  every copy of the region\'s item exchanges to its seller, the mixed bundle\'s (contract 2) included; none of another region\'s',
    [...streamed.copyIssuers].sort((x, y) => x[0] - y[0]), [[100, 11], [101, 11], [102, 12]]);
  const own = new ContractSink({ region: 10000002 });
  feed(own, snapBytes);
  eq('  with no time given, expiry is judged at the snapshot\'s own time', own.result().contracts.map((x) => x.id), [1, 5]);
  const crlf = tar([['meta.json', '{}'], ['contracts.csv', contracts.replace('"10x ""Rifter"", cheap"', '"two\nlines"').replace(/\n/g, '\r\n').replace('"two\r\nlines"', '"two\nlines"')], ['contract_items.csv', items.replace(/\n/g, '\r\n')]]);
  const cr = new ContractSink({ region: 10000002, now: NOW });
  feed(cr, crlf);
  eq('  CRLF line ends, and a title with a line break inside its quotes', cr.result().contracts.map((x) => [x.id, x.title, x.items.length]), [[1, 'two\nlines', 2], [5, 'Rifter BPO', 1]]);
  eq('  items before contracts are refused, never read wrong', String(feed(new ContractSink({ region: 10000002 }), tar([['meta.json', '{}'], ['contract_items.csv', items], ['contracts.csv', contracts]]))?.message),
    'EVE Ref’s snapshot lists its contracts’ items before its contracts');
```

Add to `scripts/check-worker.mjs`, before the final `console.log(failed ? …)`:

```js
console.log('\n--- what copies sell, read every six hours by the cloud (Task 14A) ---');
{
  const { refreshCopies, copiesFor, COPY_PART } = await import('../worker/src/copies.ts');
  const FX = JSON.parse(fs.readFileSync(new URL('./fixtures/copy-snapshots.json', import.meta.url), 'utf8'));
  const snap = (i, at = FX.snapshots[i].at) => ({ at, contracts: FX.snapshots[i].contracts.map(([id, price, expires, issuer, items]) => ({ id, price, issued: '', expires, stationId: 60003760, issuer, title: '',
    items: items.map(([typeId, copy, me, te, runs, qty, itemId]) => ({ typeId, copy: copy === 1, me, te, runs, qty, itemId })) })) });
  const [A, B, C] = FX.snapshots.map((s) => Date.parse(s.at));
  const H = 3_600_000;
  const n = (db, sql) => db.rows(sql)[0].n;
  const db = d1();
  const r1 = await refreshCopies(db, A + 120_000, { read: async () => snap(0), part: 40 });
  eq('  the first read keeps the set (96 contracts in rows of 40) and counts nothing sold', [r1, db.rows('SELECT part FROM copy_set ORDER BY part').map((r) => r.part), n(db, 'SELECT COUNT(*) AS n FROM copy_sold')],
    [{ done: 'read', contracts: 96, sold: 0, parts: 3 }, [0, 1, 2], 0]);
  const s1 = await copiesFor(db);
  eq('    and says counting has begun: 0 days, no reads, the asks known', [s1.days, s1.reads, s1.sold, Object.keys(s1.asks).length, s1.error], [0, 0, [], 11, null]);
  eq('  three hours on it isn\'t due', await refreshCopies(db, A + 3 * H, { read: async () => snap(1) }), { done: 'fresh' });
  eq('  six hours on: 16 sold, the set rewritten in one row', [await refreshCopies(db, B + 120_000, { read: async () => snap(1) }), n(db, 'SELECT COUNT(*) AS n FROM copy_set')], [{ done: 'read', contracts: 87, sold: 16, parts: 1 }, 1]);
  eq('  twelve: 12 more (28 kept)', [await refreshCopies(db, C + 120_000, { read: async () => snap(2) }), n(db, 'SELECT COUNT(*) AS n FROM copy_sold')], [{ done: 'read', contracts: 82, sold: 12, parts: 1 }, 28]);
  const s3 = await copiesFor(db);
  eq('  GET /v1/copies: the summary worked out in the round, with when it last tried', [s3.at, Math.round(s3.days * 1000) / 1000, s3.reads, s3.sold.length, s3.tried, s3.error], ['2026-10-11T12:01:00.000Z', 0.5, 2, 7, new Date(C + 120_000).toISOString(), null]);
  // EVE Ref stalled: the same snapshot six hours on compares nothing, says so, and is tried again the next hour.
  const same = await refreshCopies(db, C + 6 * H, { read: async () => snap(2) });
  const afterSame = await copiesFor(db);
  eq('  the same snapshot again: nothing compared, said as nothing newer (not an error), tried again an hour later', [same, n(db, 'SELECT COUNT(*) AS n FROM copy_sold'), afterSame.error, afterSame.stale, await refreshCopies(db, C + 6.5 * H, { read: async () => snap(2) }), await refreshCopies(db, C + 7 * H, { read: async () => snap(2) })],
    [{ done: 'same' }, 28, null, '2026-10-11T12:01:00.000Z', { done: 'fresh' }, { done: 'same' }]);
  eq('  a failed read keeps the set and what sold, says why, and waits for the next hour', [await refreshCopies(db, C + 12 * H, { read: async () => { throw new Error('EVE Ref answered 503 for public-contracts-latest.v2.tar.bz2'); } }), n(db, 'SELECT COUNT(*) AS n FROM copy_set'), n(db, 'SELECT COUNT(*) AS n FROM copy_sold'), (await copiesFor(db)).error, await refreshCopies(db, C + 12.5 * H, { read: async () => snap(2) })],
    [{ done: 'failed', error: 'EVE Ref answered 503 for public-contracts-latest.v2.tar.bz2' }, 1, 28, 'EVE Ref answered 503 for public-contracts-latest.v2.tar.bz2', { done: 'fresh' }]);
  eq('  out of time before it began: nothing read, nothing stamped', [await refreshCopies(db, C + 14 * H, { read: async () => snap(2), deadline: Date.now() - 1 }), JSON.parse(db.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data).tried], [{ done: 'later' }, C + 12 * H]);
  eq('  switched off: nothing read, and the route says so', [await refreshCopies(d1(), A, { read: async () => snap(0), on: false }), await copiesFor(d1(), false)], [{ off: true }, { off: true }]);
  eq('  before its first read: nothing, not an empty summary', await copiesFor(d1()), null);
  // A kept set more than a week older than the new snapshot: compared, it would put a week of sales on one day.
  const dbOld = d1();
  await refreshCopies(dbOld, A + 120_000, { read: async () => snap(0) });
  const late = new Date(A + 8 * 86400_000).toISOString();
  eq('  a kept set over seven days old: the set replaced, nothing compared', [await refreshCopies(dbOld, A + 8 * 86400_000 + 120_000, { read: async () => snap(1, late) }), n(dbOld, 'SELECT COUNT(*) AS n FROM copy_sold'), (await copiesFor(dbOld)).reads],
    [{ done: 'read', contracts: 87, sold: 0, parts: 1 }, 0, 0]);
  // Your own characters (every login the cloud holds, every alt) are no one's market.
  const dbOwn = d1();
  const seller = FX.snapshots[1].contracts.find((x) => x[4].some((i) => i[0] === 21012 && i[4] === 40) && !FX.snapshots[2].contracts.some((y) => y[0] === x[0]))[3];
  dbOwn.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', seller, MAIN, 'Seller Alt', 1);
  for (const [i, t] of [[0, A], [1, B], [2, C]]) await refreshCopies(dbOwn, t + 120_000, { read: async () => snap(i) });
  eq('  an alt\'s sales and asks are left out of the summary (its row in copy_sold kept)', [(await copiesFor(dbOwn)).sold.some((x) => x.typeId === 21012 && x.runs === 40), n(dbOwn, `SELECT COUNT(*) AS n FROM copy_sold WHERE issuer = ${seller}`)], [false, 5]);
  // What sold is pruned after eight days; a round's own rows stay.
  const dbP = d1();
  dbP.run('INSERT INTO copy_sold (contract_id, type_id, me, te, runs, copies, price, issuer, at) VALUES (1, 693, 10, 20, 1, 1, 1, 7, ?)', A - 9 * 86400_000);
  await refreshCopies(dbP, A + 120_000, { read: async () => snap(0) });
  eq('  a sale kept over eight days is pruned', n(dbP, 'SELECT COUNT(*) AS n FROM copy_sold'), 0);
  // The default reader: EVE Ref's latest snapshot, asked once, with a User-Agent naming the project only.
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => { calls.push({ url: String(input), ua: init.headers?.['User-Agent'], timeout: init.signal instanceof AbortSignal }); return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); };
  let viaFetch;
  try { viaFetch = await refreshCopies(d1(), A); } finally { globalThis.fetch = real; }
  eq('  the default reader asks EVE Ref once, naming the project only, with a timeout; bytes that aren\'t a snapshot fail the round', [calls, viaFetch.done],
    [[{ url: 'https://data.everef.net/public-contracts/public-contracts-latest.v2.tar.bz2', ua: 'Jita Ledger (a personal EVE trading tool)', timeout: true }], 'failed']);
  eq('  a row holds 3,000 contracts', COPY_PART, 3000);
  // I5: the round stamps "interrupted" before it reads, so a round the cloud kills leaves a trace; after one, it waits six hours.
  const { INTERRUPTED } = await import('../worker/src/copies.ts');
  const dbI = d1();
  let mid = null;
  await refreshCopies(dbI, A + 120_000, { read: async () => { mid = JSON.parse(dbI.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data); return snap(0); } });
  eq('  stamped as interrupted, with the try\'s time, while the read is under way; the read\'s end writes over it',
    [mid.error, mid.tried, JSON.parse(dbI.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data).error], [INTERRUPTED, A + 120_000, null]);
  const dbK = d1();
  dbK.run("INSERT INTO scan_meta (key, data) VALUES ('copies', ?)", JSON.stringify({ tried: A, read: 0, error: INTERRUPTED, stale: null, reads: [] }));
  eq('  after a round the cloud stopped: not tried again an hour on, but six hours on', [await refreshCopies(dbK, A + H, { read: async () => snap(0) }), (await refreshCopies(dbK, A + 6 * H, { read: async () => snap(0) })).done], [{ done: 'fresh' }, 'read']);
  // A partial snapshot (a page EVE Ref's scraper missed) makes a contract look sold; the next whole one brings it back and it's taken out.
  const ids = FX.snapshots.map((s) => new Set(s.contracts.map((x) => x[0])));
  const X = FX.snapshots[0].contracts.find((x) => ids[1].has(x[0]) && ids[2].has(x[0]) && x[4].every((i) => i[1] === 1))[0];
  const partial = (i, at) => { const s = snap(i, at); return { ...s, contracts: s.contracts.filter((x) => x.id !== X) }; };
  const dbPart = d1();
  await refreshCopies(dbPart, A + 120_000, { read: async () => snap(0) });
  const r2 = await refreshCopies(dbPart, B + 120_000, { read: async () => partial(1) });
  const hadX = n(dbPart, `SELECT COUNT(*) AS n FROM copy_sold WHERE contract_id = ${X}`);
  const r3 = await refreshCopies(dbPart, C + 120_000, { read: async () => snap(2) });
  eq('  a contract missing from one snapshot and back in the next: counted, then taken out (28 sold, as with whole snapshots)',
    [r2.sold, hadX, r3.back, n(dbPart, `SELECT COUNT(*) AS n FROM copy_sold WHERE contract_id = ${X}`), n(dbPart, 'SELECT COUNT(*) AS n FROM copy_sold'), (await copiesFor(dbPart)).sold.reduce((t, k) => t + k.contracts, 0)],
    [17, 1, 1, 0, 28, 28]);
  // The reader's copyIssuers see a copy its seller moved into a bundle the comparables leave out (correction 5): a reprice, not a sale.
  const dbB = d1();
  await refreshCopies(dbB, A + 120_000, { read: async () => snap(0) });
  const tempest = FX.snapshots[0].contracts.find((x) => x[4][0][0] === 693 && !ids[1].has(x[0]));
  const at06 = snap(1), issuers = new Map();
  for (const x of at06.contracts) for (const it of x.items) if (it.itemId) issuers.set(it.itemId, x.issuer);
  for (const it of tempest[4]) issuers.set(it[6], tempest[3]);
  eq('  a Tempest contract gone at 06:00 whose copy sits in a bundle of its seller\'s: 15 sold, not 16', (await refreshCopies(dbB, B + 120_000, { read: async () => ({ ...at06, copyIssuers: issuers }) })).sold, 15);
}
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm run check`
Expected: FAIL, `Cannot find module '…/src/lib/copyMarket.ts'` (and the Worker's: `…/worker/src/copies.ts`).

- [ ] **Step 4: The migration**

Create `worker/migrations/0020_copies.sql`:

```sql
-- What blueprint copies sell for in The Forge (worker/src/copies.ts, docs/notes/industry.md, stage 3). Every six hours the
-- cloud reads EVE Ref's public-contract snapshot and keeps The Forge's single-kind copy contracts as a set, in rows of 3,000
-- contracts (`data`: [contract, type, ME, TE, runs a copy, copies, price, issuer, expires in seconds, item IDs][]; every row
-- carries the snapshot's time); each contract of the last set that vanished before expiry, not relisted by its seller, goes in
-- copy_sold at the newer snapshot's time, kept eight days. The round's own state and the summary are in scan_meta ('copies',
-- 'copySummary'). Only adds tables: old code runs on it as before.
CREATE TABLE IF NOT EXISTS copy_set (
  part INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS copy_sold (
  contract_id INTEGER PRIMARY KEY,
  type_id INTEGER NOT NULL,
  me INTEGER NOT NULL,
  te INTEGER NOT NULL,
  runs INTEGER NOT NULL,
  copies INTEGER NOT NULL,
  price REAL NOT NULL,
  issuer INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS copy_sold_at ON copy_sold (at);
```

- [ ] **Step 5: The pure rules**

In `src/lib/bpContracts.ts`, add after `TarSink` (which stays, with `blueprintContracts`, for its tests):

```ts
type SnapshotFile = 'meta' | 'contracts' | 'items' | null;
const SNAPSHOT_FILES: Record<string, SnapshotFile> = { 'meta.json': 'meta', 'contracts.csv': 'contracts', 'contract_items.csv': 'items' };
const fileOf = (name: string): SnapshotFile => SNAPSHOT_FILES[name.slice(name.lastIndexOf('/') + 1)] ?? null;
const ITEM_EXCHANGE = new TextEncoder().encode('item_exchange'), TRUE = new TextEncoder().encode('true');
const MAX_FIELDS = 40;

/**
 * The region's blueprint-only contracts, read as the bzip2 decoder writes the tar a byte at a time (stage 3, correction 19): each
 * CSV line is split into fields where it lies, a contract kept only when it is a public item exchange of the region with a price,
 * its items only while every one is a blueprint given, and every copy of the region's item exchanges, a bundle with other items
 * included, noted with its seller (`copyIssuers`: what tells a reprice from a sale, correction 5). Nothing else is held: the
 * whole contracts and items files (39 MB on 11 October 2026) peaked near the Worker's 128 MB with the rest of a round. The same
 * contracts `blueprintContracts` reads from whole files (tested equal). Expiry is judged at `now`, else the snapshot's own time.
 */
export class ContractSink {
  at: string | null = null;
  readonly copyIssuers = new Map<number, number>();
  private opts: { region: number; now?: number; types?: ReadonlySet<number> };
  private header = new Uint8Array(512);
  private hpos = 0;
  private cur: { file: SnapshotFile; size: number; pos: number; left: number } | null = null;
  private done = new Set<SnapshotFile>();
  private meta: number[] = [];
  private line = new Uint8Array(4096);
  private llen = 0;
  private quoted = false;
  private cols: Map<string, number> | null = null;
  private bounds = new Int32Array(MAX_FIELDS * 2);
  private dec = new TextDecoder();
  private kept = new Map<number, BpContract>();
  /** The region's item exchanges dropped as comparables (an item asked for, or not a blueprint): their sellers, by contract. */
  private spoiled = new Map<number, number>();
  constructor(opts: { region: number; now?: number; types?: ReadonlySet<number> }) { this.opts = opts; }

  writeByte(b: number): void {
    if (!this.cur) {
      this.header[this.hpos++] = b;
      if (this.hpos < 512) return;
      this.hpos = 0;
      let name = '';
      for (let i = 0; i < 100 && this.header[i]; i++) name += String.fromCharCode(this.header[i]);
      if (!name) throw TAR_DONE;
      let oct = '';
      for (let i = 124; i < 136 && this.header[i]; i++) oct += String.fromCharCode(this.header[i]);
      const size = parseInt(oct.trim() || '0', 8);
      const file = fileOf(name);
      // Items are kept only for contracts already kept, so they must come after them (EVE Ref's order: meta, contracts, items).
      if (file === 'items' && !this.done.has('contracts')) throw new Error('EVE Ref’s snapshot lists its contracts’ items before its contracts');
      this.cur = { file, size, pos: 0, left: Math.ceil(size / 512) * 512 };
      this.cols = null; this.llen = 0; this.quoted = false;
      if (this.cur.left === 0) this.finish();
      return;
    }
    if (this.cur.pos < this.cur.size) {
      if (this.cur.file === 'meta') this.meta.push(b);
      else if (this.cur.file) {
        if (b === 0x22) this.quoted = !this.quoted;
        if (b === 0x0a && !this.quoted) this.endLine();
        else if (b !== 0x0d || this.quoted) {
          if (this.llen === this.line.length) { const n = new Uint8Array(this.line.length * 2); n.set(this.line); this.line = n; }
          this.line[this.llen++] = b;
        }
      }
    }
    this.cur.pos++;
    if (--this.cur.left === 0) this.finish();
  }

  /** The line's fields as [start, end) pairs (outer quotes still on), in `bounds`. */
  private split(): void {
    let n = 0, start = 0, q = false;
    for (let i = 0; i <= this.llen; i++) {
      const c = i < this.llen ? this.line[i] : 0x2c;
      if (c === 0x22) q = !q;
      else if (c === 0x2c && !q) { if (n < MAX_FIELDS) { this.bounds[2 * n] = start; this.bounds[2 * n + 1] = i; } n++; start = i + 1; }
    }
  }
  private col(name: string): number { return this.cols?.get(name) ?? -1; }
  private range(k: number): [number, number] {
    let s = this.bounds[2 * k], e = this.bounds[2 * k + 1];
    if (e - s >= 2 && this.line[s] === 0x22 && this.line[e - 1] === 0x22) { s++; e--; }
    return [s, e];
  }
  private is(k: number, lit: Uint8Array): boolean {
    if (k < 0) return false;
    const [s, e] = this.range(k);
    if (e - s !== lit.length) return false;
    for (let i = 0; i < lit.length; i++) if (this.line[s + i] !== lit[i]) return false;
    return true;
  }
  private empty(k: number): boolean { if (k < 0) return true; const [s, e] = this.range(k); return e <= s; }
  /** A whole number read from the field's bytes, no string made; anything else through Number(); NaN when empty. */
  private int(k: number): number {
    if (k < 0) return NaN;
    const [s, e] = this.range(k);
    if (e <= s) return NaN;
    let v = 0, i = s;
    const neg = this.line[i] === 0x2d;
    if (neg) i++;
    for (; i < e; i++) { const c = this.line[i]; if (c < 0x30 || c > 0x39) return Number(this.str(k)); v = v * 10 + (c - 0x30); }
    return neg ? -v : v;
  }
  private str(k: number): string {
    if (k < 0) return '';
    const [s, e] = this.range(k);
    const t = this.dec.decode(this.line.subarray(s, e));
    return t.includes('""') ? t.replace(/""/g, '"') : t;
  }

  private endLine(): void {
    if (!this.llen) return;
    if (!this.cols) { this.cols = new Map(csvFields(this.dec.decode(this.line.subarray(0, this.llen))).map((c, i) => [c.trim(), i])); this.llen = 0; return; }
    this.split();
    if (this.cur!.file === 'contracts') {
      if (this.is(this.col('type'), ITEM_EXCHANGE) && this.int(this.col('region_id')) === this.opts.region && !this.is(this.col('for_corporation'), TRUE)) {
        const price = Number(this.str(this.col('price')));
        if (price > 0) {
          const id = this.int(this.col('contract_id'));
          const station = this.int(this.col('station_id')) || this.int(this.col('start_location_id'));
          this.kept.set(id, { id, price, issued: this.str(this.col('date_issued')), expires: this.str(this.col('date_expired')), stationId: station > 0 ? station : null,
            issuer: this.int(this.col('issuer_id')), title: this.str(this.col('title')), items: [] });
        }
      }
      this.llen = 0;
      return;
    }
    const id = this.int(this.col('contract_id'));
    const c = this.kept.get(id);
    const issuer = c ? c.issuer : this.spoiled.get(id);
    if (issuer != null && this.is(this.col('is_blueprint_copy'), TRUE)) { const it = this.int(this.col('item_id')); if (it > 0) this.copyIssuers.set(it, issuer); }
    if (c) {
      const me = this.col('material_efficiency');
      // A contract asking for an item, or holding anything that isn't a blueprint (no ME), is no comparable: dropped whole.
      if (!this.is(this.col('is_included'), TRUE) || this.empty(me)) { this.kept.delete(id); this.spoiled.set(id, c.issuer); }
      else {
        const runs = this.col('runs'), te = this.col('time_efficiency'), itemId = this.int(this.col('item_id'));
        c.items.push({ typeId: this.int(this.col('type_id')), copy: this.is(this.col('is_blueprint_copy'), TRUE), me: this.int(me), te: this.empty(te) ? 0 : this.int(te),
          runs: this.empty(runs) ? null : this.int(runs), qty: Math.max(1, this.int(this.col('quantity')) || 1), itemId: itemId > 0 ? itemId : null });
      }
    }
    this.llen = 0;
  }

  private finish(): void {
    const file = this.cur!.file;
    if (file === 'contracts' || file === 'items') this.endLine();
    if (file === 'meta') { try { this.at = (JSON.parse(this.dec.decode(new Uint8Array(this.meta))) as { scrape_end?: string }).scrape_end ?? null; } catch { this.at = null; } this.meta = []; }
    if (file) this.done.add(file);
    this.cur = null;
    if (this.done.has('meta') && this.done.has('contracts') && this.done.has('items')) throw TAR_DONE;
  }

  /** The contracts kept: blueprints only, not expired at `now` (else the snapshot's own time), holding one of `types` when asked; and every copy's seller. */
  result(): { contracts: BpContract[]; at: string | null; copyIssuers: ReadonlyMap<number, number> } {
    const now = this.opts.now ?? (this.at ? Date.parse(this.at) : Date.now());
    const types = this.opts.types;
    const contracts = [...this.kept.values()].filter((c) => c.items.length && Date.parse(c.expires) > now && (!types || c.items.some((i) => types.has(i.typeId))));
    return { contracts, at: this.at, copyIssuers: this.copyIssuers };
  }
}
```

In `worker/src/vendor/bunzip.ts`, line 532, reuse the block buffer (a block writes every entry it later reads; a fresh 3.6 MB
array a block was most of the garbage the measure below found), and say so in the file's header comment ("only the Buffer
allocations and copies changed, and the block buffer is reused"):

```js
  // One buffer for every block: a block writes each entry before it reads it. A fresh 3.6 MB array a block was garbage otherwise.
  var dbuf = this.dbuf = (this.dbuf && this.dbuf.length === this.dbufSize) ? this.dbuf : new Uint32Array(this.dbufSize);
```

Create `src/lib/copyMarket.ts`:

```ts
/**
 * The Forge's blueprint copies on public contracts (docs/notes/industry.md, stage 3), read every six hours by the cloud
 * (worker/src/copies.ts) from EVE Ref's snapshot: the set of single-kind copy contracts kept between reads, what vanished
 * before expiry (sold, most likely: a seller cancelling looks the same), and the summary the Copies section reads. Two
 * snapshots days apart miss a contract listed and sold between them; six hours apart they saw 327 and 430 vanish on 11
 * October 2026, where the research's multi-day reads counted about 320 a day. Pure; the Worker imports it.
 */
import type { BpContract } from './bpContracts';

/** What a buyer pays for: the blueprint, its ME and TE, and the runs on each copy. */
export type CopyKind = { typeId: number; me: number; te: number; runs: number };
export const copyKindKey = (k: CopyKind): string => `${k.typeId}|${k.me}|${k.te}|${k.runs}`;
/** One kept contract: [contract, type, ME, TE, runs a copy, copies, price, issuer, expires (seconds), its items' IDs]. */
export type CopyRow = [id: number, typeId: number, me: number, te: number, runs: number, copies: number, price: number, issuer: number, expires: number, items: number[]];
/** One comparison of two sets: from the older snapshot's time to the newer's, and how many vanished. */
export type CopyRead = [from: number, to: number, sold: number];
/** A contract that vanished before expiry, at the newer snapshot's time. */
export type SoldRow = { contractId: number; typeId: number; me: number; te: number; runs: number; copies: number; price: number; issuer: number; at: number };
export type KindSold = CopyKind & { contracts: number; copies: number; sellers: number; perRun: number };
/** The asks now for a kind, a run: the cheapest, the median, how many contracts and sellers. */
export type Ask = [cheapest: number, median: number, contracts: number, sellers: number];
export type CopySummary = {
  /** The newest snapshot's time. */
  at: string;
  /** Days counted in the window: from the first read in it (or the window's start) to the newest. */
  days: number;
  /** The longest comparison in the window, in hours: a copy listed and sold within it was missed. */
  gapHours: number;
  reads: number;
  sold: KindSold[];
  asks: Record<string, Ask>;
};

/** The window the summary counts, and how long what sold is kept (a day more, so the window is always whole). */
export const COPY_WINDOW_DAYS = 7;
export const COPY_KEEP_DAYS = 8;
const DAY = 86_400_000;
const median = (xs: readonly number[]): number => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * A snapshot's single-kind copy contracts: every item a copy of one type at one ME, TE and runs (`blueprintContracts` already
 * left out any asking for items, and anything not a blueprint), with a price and runs. Sorted by contract.
 */
export function compactCopies(contracts: readonly BpContract[]): CopyRow[] {
  const out: CopyRow[] = [];
  for (const c of contracts) {
    const i = c.items[0];
    if (!i || i.runs == null || i.runs <= 0) continue;
    if (!c.items.every((x) => x.copy && x.typeId === i.typeId && x.me === i.me && x.te === i.te && x.runs === i.runs)) continue;
    const exp = Math.floor(Date.parse(c.expires) / 1000);
    if (!Number.isFinite(exp) || !(c.price > 0)) continue;
    out.push([c.id, i.typeId, i.me, i.te, i.runs, c.items.reduce((n, x) => n + x.qty, 0), c.price, c.issuer, exp, c.items.map((x) => x.itemId).filter((x): x is number => x != null)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Every item of every contract in a snapshot, to its seller: what tells a reprice (back by the same seller) from a sale. */
export function itemIssuers(contracts: readonly BpContract[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of contracts) for (const i of c.items) if (i.itemId != null) m.set(i.itemId, c.issuer);
  return m;
}

/**
 * The kept contracts gone from the newer snapshot before their expiry (at the newer snapshot's time), none of whose items
 * came back in a contract by the same seller (`vanishedSince`'s rule, against every contract of the newer snapshot, a bundle
 * included: correction 5). Back under another seller, it was bought and relisted: a sale.
 */
export function copiesSold(older: readonly CopyRow[], newerIds: ReadonlySet<number>, itemIssuer: ReadonlyMap<number, number>, now: number): CopyRow[] {
  return older.filter((r) => !newerIds.has(r[0]) && r[8] * 1000 > now && !r[9].some((it) => itemIssuer.get(it) === r[7]));
}

export const soldRows = (rows: readonly CopyRow[], at: number): SoldRow[] =>
  rows.map((r) => ({ contractId: r[0], typeId: r[1], me: r[2], te: r[3], runs: r[4], copies: r[5], price: r[6], issuer: r[7], at }));

/**
 * What the Copies section reads, worked out once a round: each kind sold in the window (contracts, copies, sellers, the
 * median price a run), the asks now per kind, how many days are counted and the longest gap. `exclude`: your own characters,
 * whose contracts are no one's market. `at`: the newest snapshot's time, which the window ends at.
 */
export function copySummary(o: { sold: readonly SoldRow[]; current: readonly CopyRow[]; reads: readonly CopyRead[]; exclude: ReadonlySet<number>; at: number }): CopySummary {
  const start = o.at - COPY_WINDOW_DAYS * DAY;
  const reads = o.reads.filter((r) => r[1] > start).sort((a, b) => a[1] - b[1]);
  const from = reads.length ? Math.max(start, reads[0][0]) : o.at, to = reads.length ? reads[reads.length - 1][1] : o.at;
  const gapHours = reads.length ? Math.max(...reads.map((r) => (r[1] - Math.max(r[0], start)) / 3_600_000)) : 0;
  const groups = new Map<string, SoldRow[]>();
  for (const s of o.sold) {
    if (s.at <= start || o.exclude.has(s.issuer)) continue;
    const k = copyKindKey(s), g = groups.get(k);
    if (g) g.push(s); else groups.set(k, [s]);
  }
  const sold: KindSold[] = [...groups.values()].map((g) => ({
    typeId: g[0].typeId, me: g[0].me, te: g[0].te, runs: g[0].runs, contracts: g.length, copies: g.reduce((n, s) => n + s.copies, 0),
    sellers: new Set(g.map((s) => s.issuer)).size, perRun: median(g.map((s) => s.price / (s.copies * s.runs))),
  })).sort((a, b) => a.typeId - b.typeId || a.me - b.me || a.te - b.te || a.runs - b.runs);
  const ask = new Map<string, { per: number[]; sellers: Set<number> }>();
  for (const r of o.current) {
    if (o.exclude.has(r[7])) continue;
    const k = copyKindKey({ typeId: r[1], me: r[2], te: r[3], runs: r[4] });
    const a = ask.get(k) ?? { per: [], sellers: new Set<number>() };
    a.per.push(r[6] / (r[5] * r[4])); a.sellers.add(r[7]); ask.set(k, a);
  }
  const asks: Record<string, Ask> = {};
  for (const [k, a] of [...ask].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))) asks[k] = [Math.min(...a.per), median(a.per), a.per.length, a.sellers.size];
  return { at: new Date(o.at).toISOString(), days: (to - from) / DAY, gapHours, reads: reads.length, sold, asks };
}
```

- [ ] **Step 6: The Worker's round and route**

In `worker/src/blueprints.ts`, one reader for both: the Blueprints route and the copy round read EVE Ref the same way, filtering
as it decompresses (replace the `LATEST`, `UA` and `snapshot` definitions and the `WANT` list; `historyNear` passes
`EVE_REF_UA` where it passed `UA`, and its index fetch takes the same timeout):

```ts
export const LATEST = `${BASE}/public-contracts-latest.v2.tar.bz2`;
/** EVE Ref is someone else's site: the User-Agent names the project only. */
export const EVE_REF_UA = { 'User-Agent': 'Jita Ledger (a personal EVE trading tool)' };
/** A stalled EVE Ref mustn't hold the invocation to its 15-minute wall: the 6.6 MB file came in seconds on 11 October 2026. */
export const READ_TIMEOUT_MS = 90_000;

/**
 * A snapshot's contracts of a region, kept as they stream out of bzip2 (ContractSink): never the 39 MB of CSV whole. `now`
 * judges expiry (else the snapshot's own time); `types` keeps only contracts holding one of them.
 */
export async function readSnapshot(url: string, opts: { region: number; now?: number; types?: ReadonlySet<number> }): Promise<{ contracts: BpContract[]; at: string | null; copyIssuers: ReadonlyMap<number, number> }> {
  const res = await fetch(url, { headers: EVE_REF_UA, signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`EVE Ref answered ${res.status} for ${url.split('/').pop()}`);
  const sink = new ContractSink(opts);
  try { bunzipTo(new Uint8Array(await res.arrayBuffer()), sink); } catch (e) { if (e !== TAR_DONE) throw e; }
  return sink.result();
}

async function snapshot(url: string, types: ReadonlySet<number>, now: number): Promise<{ contracts: BpContract[]; at: string | null }> {
  const r = await readSnapshot(url, { region: THE_FORGE, now, types });
  return { contracts: r.contracts, at: r.at };
}
```

(Imports: `ContractSink, TAR_DONE, vanishedSince, type BpContract` from `../../src/lib/bpContracts`; `blueprintContracts` and
`TarSink` are no longer imported here. The route's answer is unchanged: the same contracts, tested equal in step 2.)

Create `worker/src/copies.ts`:

```ts
/**
 * What blueprint copies sell for in The Forge (docs/notes/industry.md, stage 3). Every six hours, after Goonmetrics on the
 * `37` cron, the cloud reads EVE Ref's latest public-contract snapshot (filtered as it decompresses: blueprints.ts
 * readSnapshot), keeps The Forge's single-kind copy contracts as a set (`copy_set`, in rows of COPY_PART), and puts each
 * contract of the set kept last time that vanished before expiry, not relisted by its seller, in `copy_sold` (kept eight
 * days). The summary the Copies section reads is worked out once a round and kept in `scan_meta` ('copySummary'), beside the
 * round's own state ('copies'), all in one batch with the set. EVE Ref is someone else's site: one 6.6 MB file every six
 * hours, a User-Agent naming the project only, a 90-second timeout, not a watched job (the section says how old its read
 * is), and COPIES_ON switches it off.
 */
import type { BpContract } from '../../src/lib/bpContracts';
import { THE_FORGE } from '../../src/lib/constants';
import { COPY_KEEP_DAYS, COPY_WINDOW_DAYS, compactCopies, copiesSold, copySummary, itemIssuers, soldRows, type CopyRead, type CopyRow, type CopySummary, type SoldRow } from '../../src/lib/copyMarket';
import { LATEST, readSnapshot } from './blueprints';

export const COPIES_ON = true;
export const COPIES_REFRESH_MS = 6 * 3_600_000;
/** The alts' read ahead of it varies, so a read is due a little early rather than an hour late (Goonmetrics' slack). */
export const COPIES_SLACK_MS = 30 * 60_000;
/** After a try that failed, the next waits for the next hourly cron. */
export const COPIES_RETRY_MS = 50 * 60_000;
/** No read starts this long after the cron's scheduled time: Goonmetrics may run to 10 minutes; the invocation stops at 15. */
export const COPIES_BUDGET_MS = 12 * 60_000;
/** Contracts a `copy_set` row holds: about 280 KB of JSON, under D1's 2 MB a row (the set was 1.02 to 1.03 MB on 11 October 2026). */
export const COPY_PART = 3000;
/** Stamped before a read: a round the cloud stops (memory, the wall limit) can't write anything after, so this stays as its trace. */
export const INTERRUPTED = 'interrupted: the cloud stopped the read before it finished';
const DAY = 86_400_000;

/** A snapshot as the round reads it; `copyIssuers`: every copy of The Forge's item exchanges to its seller (ContractSink), else worked out from `contracts`. */
export type Snapshot = { at: string | null; contracts: BpContract[]; copyIssuers?: ReadonlyMap<number, number> };
/**
 * The round's state: when it last tried and last read (the Worker's clock), the last error (INTERRUPTED until a try ends), the
 * kept snapshot's time when EVE Ref's latest was still that one at the last try (not an error: nothing new to read), and each
 * comparison's span.
 */
export type CopiesState = { tried: number; read: number; error: string | null; stale: string | null; reads: CopyRead[] };

/** The default reader: EVE Ref's latest snapshot of The Forge, expiry judged at the snapshot's own time. */
export const latestSnapshot = (): Promise<Snapshot> => readSnapshot(LATEST, { region: THE_FORGE });

async function stateOf(db: D1Database): Promise<CopiesState> {
  const r = await db.prepare(`SELECT data FROM scan_meta WHERE key = 'copies'`).first<{ data: string }>();
  const s = r ? (JSON.parse(r.data) as Partial<CopiesState>) : {};
  return { tried: s.tried ?? 0, read: s.read ?? 0, error: s.error ?? null, stale: s.stale ?? null, reads: Array.isArray(s.reads) ? s.reads : [] };
}
const putMeta = (db: D1Database, key: string, v: unknown) =>
  db.prepare('INSERT INTO scan_meta (key, data) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET data = excluded.data').bind(key, JSON.stringify(v));

/** Every character whose login the cloud holds (a ledger, its sender, its alts) and every alt on a roster, removed ones too. */
export async function ownCharacters(db: D1Database): Promise<Set<number>> {
  const rows = (await db.prepare('SELECT char_id AS id FROM keys UNION SELECT token_char_id AS id FROM keys UNION SELECT char_id AS id FROM alts').all<{ id: number }>()).results;
  return new Set(rows.map((r) => r.id));
}

/**
 * One round, when due (the plan's "When it reads"): read the latest snapshot, compare it with the kept set, and in one batch keep
 * what sold, take back what a partial snapshot made look sold, replace the set, and write the summary and the state; then prune.
 * `read`, `on`, `deadline` and `part` are for the tests and the cron.
 */
export async function refreshCopies(db: D1Database, now = Date.now(), o: { read?: () => Promise<Snapshot>; on?: boolean; deadline?: number; part?: number } = {}) {
  if (!(o.on ?? COPIES_ON)) return { off: true as const };
  const st = await stateOf(db);
  // A read the cloud stopped waits the full six hours, never the hour: the same read would likely stop again.
  const retry = st.error === INTERRUPTED ? COPIES_REFRESH_MS - COPIES_SLACK_MS : COPIES_RETRY_MS;
  if (now - st.read < COPIES_REFRESH_MS - COPIES_SLACK_MS || now - st.tried < retry) return { done: 'fresh' as const };
  if (Date.now() > (o.deadline ?? Infinity)) return { done: 'later' as const };
  // Every way this round ends writes over it; one the cloud kills leaves it (I5).
  await putMeta(db, 'copies', { ...st, tried: now, error: INTERRUPTED }).run();
  const stamp = (error: string) => putMeta(db, 'copies', { ...st, tried: now, error }).run();
  let snap: Snapshot;
  try { snap = await (o.read ?? latestSnapshot)(); } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await stamp(error);
    return { done: 'failed' as const, error };
  }
  const at = snap.at ? Date.parse(snap.at) : NaN;
  if (!Number.isFinite(at)) { await stamp('EVE Ref’s snapshot says no time'); return { done: 'failed' as const, error: 'EVE Ref’s snapshot says no time' }; }
  const parts = (await db.prepare('SELECT part, at, data FROM copy_set ORDER BY part').all<{ part: number; at: number; data: string }>()).results;
  const keptAt = parts.length ? parts[0].at : null;
  if (keptAt != null && at <= keptAt) {
    // EVE Ref hasn't written a newer snapshot: not a failure, nothing to compare, and the next hour tries again.
    await putMeta(db, 'copies', { ...st, tried: now, error: null, stale: new Date(keptAt).toISOString() }).run();
    return { done: 'same' as const };
  }
  const current = compactCopies(snap.contracts);
  const newerIds = new Set(snap.contracts.map((c) => c.id));
  let sold: CopyRow[] = [];
  const reads = st.reads.filter((r) => r[1] > now - COPY_KEEP_DAYS * DAY);
  // A first read, or a kept set more than a week older than this one, compares nothing: a week of sales on one day is no pace.
  if (keptAt != null && at - keptAt <= COPY_WINDOW_DAYS * DAY) {
    const older = parts.flatMap((p) => JSON.parse(p.data) as CopyRow[]);
    sold = copiesSold(older, newerIds, snap.copyIssuers ?? itemIssuers(snap.contracts), at);
    reads.push([keptAt, at, sold.length]);
  }
  // The window: what's kept, less any contract back in this snapshot (a partial snapshot before made it look sold: M20), plus what sold now.
  const held = (await db.prepare('SELECT contract_id AS contractId, type_id AS typeId, me, te, runs, copies, price, issuer, at FROM copy_sold WHERE at > ?1')
    .bind(at - COPY_WINDOW_DAYS * DAY).all<SoldRow>()).results;
  const heldIds = new Set(held.map((r) => r.contractId));
  const back = held.filter((r) => newerIds.has(r.contractId)).map((r) => r.contractId);
  const fresh = soldRows(sold, at).filter((r) => !heldIds.has(r.contractId));
  const summary = copySummary({ sold: [...held.filter((r) => !newerIds.has(r.contractId)), ...fresh], current, reads, exclude: await ownCharacters(db), at });
  // One batch, one transaction (M18): what sold, what came back, the set, the summary and the state land together or not at all.
  const writes: D1PreparedStatement[] = [];
  // Ten rows a statement: nine values each, under D1's 100 bound parameters.
  for (let i = 0; i < fresh.length; i += 10) {
    const chunk = fresh.slice(i, i + 10);
    writes.push(db.prepare(`INSERT OR IGNORE INTO copy_sold (contract_id, type_id, me, te, runs, copies, price, issuer, at) VALUES ${chunk.map((_, n) => `(${Array.from({ length: 9 }, (_, k) => `?${n * 9 + k + 1}`).join(', ')})`).join(', ')}`)
      .bind(...chunk.flatMap((s) => [s.contractId, s.typeId, s.me, s.te, s.runs, s.copies, s.price, s.issuer, s.at])));
  }
  for (let i = 0; i < back.length; i += 90) { const ids = back.slice(i, i + 90); writes.push(db.prepare(`DELETE FROM copy_sold WHERE contract_id IN (${ids.map((_, n) => `?${n + 1}`).join(',')})`).bind(...ids)); }
  writes.push(db.prepare('DELETE FROM copy_set'));
  const size = o.part ?? COPY_PART;
  let p = 0;
  for (let i = 0; i < current.length || p === 0; i += size, p++) writes.push(db.prepare('INSERT INTO copy_set (part, at, data) VALUES (?1, ?2, ?3)').bind(p, at, JSON.stringify(current.slice(i, i + size))));
  writes.push(putMeta(db, 'copySummary', summary), putMeta(db, 'copies', { tried: now, read: now, error: null, stale: null, reads }));
  await db.batch(writes);
  await db.prepare('DELETE FROM copy_sold WHERE at <= ?1').bind(now - COPY_KEEP_DAYS * DAY).run();
  return { done: 'read' as const, contracts: current.length, sold: sold.length, parts: p, ...(back.length ? { back: back.length } : {}) };
}

/** For `GET /v1/copies`: the last round's summary with when it last tried, its error and whether EVE Ref had nothing newer; null before the first; `off` when switched off. */
export async function copiesFor(db: D1Database, on = COPIES_ON): Promise<{ off: true } | (CopySummary & { tried: string | null; error: string | null; stale: string | null }) | null> {
  if (!on) return { off: true };
  const rows = (await db.prepare(`SELECT key, data FROM scan_meta WHERE key IN ('copies', 'copySummary')`).all<{ key: string; data: string }>()).results;
  const sum = rows.find((r) => r.key === 'copySummary');
  if (!sum) return null;
  const st = rows.find((r) => r.key === 'copies');
  const s = st ? (JSON.parse(st.data) as Partial<CopiesState>) : {};
  return { ...(JSON.parse(sum.data) as CopySummary), tried: s.tried ? new Date(s.tried).toISOString() : null, error: s.error ?? null, stale: s.stale ?? null };
}
```

In `worker/src/index.ts`: import `{ COPIES_BUDGET_MS, copiesFor, refreshCopies } from './copies'`; in the `ALTS_CRON` branch, chain a
second `.finally` after Goonmetrics' (so neither waits on the other's failure):

```ts
        // Then what copies sell (copies.ts), when six hours old: after Goonmetrics, never in its way; not a watched job.
        .finally(async () => {
          try { console.log('copies', JSON.stringify(await refreshCopies(env.DB, Date.now(), { deadline: event.scheduledTime + COPIES_BUDGET_MS }))); } catch (e) { console.error('copies failed', e); }
        }));
```

and, beside `/v1/home/prices`:

```ts
      // What copies sold for in The Forge over the last week, and the asks now (copies.ts); null before the cloud's first read.
      if (url.pathname === '/v1/copies' && request.method === 'GET') return json(await copiesFor(env.DB), 200, c);
```

- [ ] **Step 7: Run the tests, see them pass; plant each rule wrong**

Run: `npm run check`. Expected: `all passed` twice (check.mjs, then check-worker.mjs, whose "every Worker module loads" list now
includes `copies.ts`). Then plant each and see it fail, putting it back after: in `copiesSold` drop
`&& !r[9].some(…)` (the reprice test: 21, not 16); drop `r[8] * 1000 > now &&` (the expiry test); in `copySummary` drop
`|| o.exclude.has(s.issuer)` (the own-contracts test); in `refreshCopies` remove the `at - keptAt <= COPY_WINDOW_DAYS * DAY`
clause (the seven-day test then counts sales); make `same` stamp `read: now` (the try an hour on reads `fresh` where it must read
the snapshot again); remove the `INTERRUPTED` stamp before the read (the mid-read test); make `retry` always `COPIES_RETRY_MS`
(the after-a-kill test reads an hour on); drop the `back` deletion (the partial-snapshot test keeps 29); use `itemIssuers` in
place of `snap.copyIssuers ??` (the bundle test reads 16); in `ContractSink`, record a copy's seller only for kept contracts (the
mixed-bundle `copyIssuers` test loses 102); drop the items-before-contracts check (that test reads wrong instead of refusing);
in `readSnapshot`, drop the `signal` (the default reader's `timeout: true`).

- [ ] **Step 8: Measure the memory on a real snapshot (I5)**

Write `.playwright-mcp/research/industry-stage3-scripts/measure-memory.mjs` (gitignored, beside the cut script):

```js
// The copy round's memory on real EVE Ref snapshots (stage 3, I5). Heap plus ArrayBuffers, sampled every MB the decoder writes
// and after each step, above what the process held before. Usage:
//   node --expose-gc --import ./scripts/register.mjs <this> reader <snapshot.tar.bz2>
//   node --max-old-space-size=48 --disable-warning=ExperimentalWarning --import ./scripts/register.mjs <this> round <older.tar.bz2> <newer.tar.bz2>
import fs from 'node:fs';
import { bunzipTo } from '../../../worker/src/vendor/bunzip.ts';
import { ContractSink, TAR_DONE } from '../../../src/lib/bpContracts.ts';
const [mode, ...files] = process.argv.slice(2);
const mu = () => { const m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers; };
let peak = 0, n = 0;
const read = (file) => async () => {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const sink = new ContractSink({ region: 10000002 });
  try { bunzipTo(bytes, { writeByte(b) { if ((++n & 0xfffff) === 0) peak = Math.max(peak, mu()); sink.writeByte(b); } }); } catch (e) { if (e !== TAR_DONE) throw e; }
  const r = sink.result();
  peak = Math.max(peak, mu());
  return r;
};
globalThis.gc?.();
if (mode === 'reader') {
  const base = mu(), t0 = performance.now();
  const r = await read(files[0])();
  const ms = performance.now() - t0;
  globalThis.gc?.();
  console.log(`reader: ${r.contracts.length} contracts, ${r.contracts.reduce((t, c) => t + c.items.length, 0)} items, ${r.copyIssuers.size} copies' sellers; ${Math.round(ms)} ms; peak ${((peak - base) / 1e6).toFixed(1)} MB above ${(base / 1e6).toFixed(1)}; held after GC ${((mu() - base) / 1e6).toFixed(1)} MB`);
} else {
  const { d1 } = await import('../../../scripts/d1.mjs');
  const { refreshCopies } = await import('../../../worker/src/copies.ts');
  const db = d1();
  // The rounds' clocks: the snapshots' own times (00:00 and 06:00 UTC) and ten minutes, so the second is due.
  await refreshCopies(db, Date.parse('2026-10-11T00:10:00Z'), { read: read(files[0]) });
  const base = mu(); peak = 0;
  const t0 = performance.now();
  const r = await refreshCopies(db, Date.parse('2026-10-11T06:10:00Z'), { read: read(files[1]) });
  console.log(`round: ${JSON.stringify(r)}; ${Math.round(performance.now() - t0)} ms; peak ${((Math.max(peak, mu()) - base) / 1e6).toFixed(1)} MB above ${(base / 1e6).toFixed(1)}`);
}
```

Run it on the 12:00 snapshot, then the 00:00 → 06:00 round under a 48 MB old space:

```bash
D=.playwright-mcp/research/industry-stage3/dl
S=.playwright-mcp/research/industry-stage3-scripts/measure-memory.mjs
node --expose-gc --import ./scripts/register.mjs $S reader $D/public-contracts-2026-10-11_12-00-05.v2.tar.bz2
node --max-old-space-size=48 --disable-warning=ExperimentalWarning --import ./scripts/register.mjs $S round $D/public-contracts-2026-10-11_00-00-07.v2.tar.bz2 $D/public-contracts-2026-10-11_06-00-05.v2.tar.bz2
```

Expected (the plan's own run of this code, 11 October 2026, Node 24.18): **reader: 15235 contracts, 46204 items, 49531 copies'
sellers; about 2.4 s; peak 31.1 MB above the process's own (the 6.6 MB file included), held after GC 20.6 MB**; the round
`{"done":"read","contracts":11402,"sold":327,"parts":4}` in about 2.7 s, completing under the 48 MB old space. **The bar: the
reader's peak at most 60 MB, and the round completes under `--max-old-space-size=48`.** Over the bar, don't ship: find what's held
(the old reader, whole files kept, peaked at 113 MB in the same measure; without the block buffer's reuse the stream peaked at
84.5 MB). Put the two lines in the commit message and the note. (The bzip2 decoder's working arrays aren't sampled between its
writes: the measure is the app's, not a proof; the Worker's own first round, its `wrangler tail` line and `scan_meta`, is the
rest.)

- [ ] **Step 9: Notes**

- `docs/notes/industry.md`, a new `## Stage 3: copies to sell` section: the round (when it reads, what it keeps, what counts as
  sold, the measured counts above, corrections 2 to 6, 19 to 21), that a `copy_set` row is about 280 KB, under D1's 2 MB, the D1
  cost (about 375 inserts and 375 prunes a round, each written twice with the `copy_sold_at` index, and 8 rows of set and state:
  about 6,000 row writes a day, 180,000 a month, under 0.4% of the plan's 50 M), the memory measure of step 8 (both lines, and the
  old reader's 113 MB beside them), `COPIES_ON`, and that the first `37` round after a deploy only keeps the set (the section says
  counting has begun) and the next, six hours on, is the first to count.
- `CLAUDE.md`'s Timers paragraph: "…hourly at :37 every alt's full read (`altsHourly`), then Goonmetrics and then the copy
  market (`refreshCopies`) when six hours old"; the Worker's imports list gains `copyMarket`.
- `docs/notes/limits.md`: **Copies "sold" are contracts that vanished before expiry**: a seller cancelling looks the same, and so
  does a copy taken back and relisted only after the next read (none of 327 on 11 October); read every six hours, so one listed
  and sold within a read's span is missed (the Sold column says so; the summary gives the longest span); a contract missing from
  one snapshot (EVE Ref's scraper missed a page) counts as sold until the next whole snapshot shows it again, then is taken out,
  so a figure can drop by it six hours later; public contracts of The Forge only (Brave's corporation and alliance contracts
  aren't visible); contract fees aren't modelled.
- `docs/notes/finding-trades.md`, the Blueprints bullet: the snapshot reader (`readSnapshot`, `ContractSink`) is shared with the
  copy round and filters as it decompresses; the route's answer is unchanged (tested equal to `blueprintContracts`).
- `.claude/rules/industry.md` `paths:` gains `src/lib/copyMarket.ts`, `worker/src/copies.ts`, `worker/migrations/0020_copies.sql`.

- [ ] **Step 10: The five checks, and commit**

Run: `npm run check && npm run build && LEDGER=industry npm run check-pages && npm run check-pages && npm run check-income`.
Expected: all green (no page reads the route yet; the Blueprints page's own checks still pass: its route shares the new reader,
whose contracts step 2 tests equal to what `blueprintContracts` keeps). `git add` the files above and commit:

```bash
git commit -m "Industry stage 3: the cloud counts what copies sell, every six hours

The Copies finder needs what copies sell for, and two EVE Ref snapshots days apart miss every contract listed and
sold between them: on 11 October 2026 six-hourly reads saw 327 and 430 copy contracts vanish before expiry, where the
research's multi-day reads counted about 320 a day. So on the 37 cron, after Goonmetrics, the cloud keeps The Forge's
single-kind copy contracts as a set (copy_set, rows of 3,000: the set is 1.02 MB and would fail as one row the day the
market doubles) and puts each contract of the last set that vanished before expiry, not relisted by its seller (judged
against every contract of the new snapshot, a bundle too), in copy_sold for eight days. The summary is worked out once a
round, so GET /v1/copies never parses a megabyte; your own characters' contracts are left out of it. A first read, the
same snapshot, a failure or a set more than a week old compare nothing and say so. The snapshot is read as it
decompresses, keeping only The Forge's blueprint contracts and every copy's seller, never the 39 MB of CSV whole: <the two
measure lines of step 8>, against 113 MB for the old reader in the same measure. Tested on three real snapshots
(scripts/fixtures/copy-snapshots.json): 16 sold of 21 gone (5 repriced), then 12 with 5 relisted by others.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf"
```


---
### Task 14B: The Copies section: what's worth copying for one lab slot

**Files:**
- Create: `src/lib/copyFinder.ts`, `src/components/hustles/IndustryCopies.tsx`
- Modify: `src/lib/cloud.ts` (`cloudCopies`, `type CopiesAnswer`), `src/components/hustles/industryMarket.ts` (`useCopyMarket`,
  `type CopyMarketState`), `src/components/hustles/Industry.tsx` (the section), `src/styles.css` (only if a phone rule is
  needed: `.ind-copies` on the phone block at the end), `scripts/check.mjs`, `scripts/pages.mjs` (`PAGES` gains
  `hustles/industry/copies`; the plain loads; the industry case), `.claude/rules/industry.md`, `docs/notes/industry.md`,
  `docs/notes/limits.md`

**Interfaces:**
- Consumes: `type CopySummary`, `type KindSold`, `type Ask`, `copyKindKey` (Task 14A); `activityOf`, `copyCost`, `copyTime`,
  `researchCost`, `researchTime`, `eivOf`, `lacking`, `rigFor`, `structureBonus`, `DAY_S`, `SCC_COPY`, `type Clone`,
  `type Indexed`, `type JobCost` (`src/lib/industry.ts`); `jobCheck`, `jobPlace`, `ACTIVITY_OF`, `MEASURE_BAND`,
  `type JobPlace`, `type JobRecord` (`src/lib/industryTrack.ts`); `buildRow`, `type BpoWhere`, `type LabSite`,
  `type RowInput`, `bpoWhere` (`src/lib/industryRank.ts`); `type OwnedBlueprint` (`src/lib/blueprints.ts`); `useFinder`, `bpoSaid`,
  `perDayCell`, `useStationSaid` (`industryFinder.ts`); `useAdjusted`, `useIndustryDoc`, `useNpcRow` (`industryMarket.ts`);
  `homeHoldMs` (`src/lib/homeMarket.ts`: the same six-hour cadence); `finderSkills` (`industryLadder.ts`); `skillsWhy`
  (`industryChars.ts`).
- Produces:
  - `src/lib/copyFinder.ts`: `THIN_SALES` (3), `thinSaid(k)`, `heldOriginal(owned, typeId)`, `type CopyFinderRow`,
    `type CopyLeft = 'notInBundle' | 'invented' | 'noCopying'`, `type CopyRowInput`, `copyRow(o)`, `copyRows(o)`,
    `countingSaid(s)`, `gapSaid(s)`, `type CostReading`, `type CheckedJob`, `rigNearer(...)`, `copyReadings(ix, jobs)`,
    `readingsSaid(r, labCostRig, date)`.
  - `src/lib/cloud.ts`: `type CopiesAnswer`, `cloudCopies()`.
  - `industryMarket.ts`: `type CopyMarketState`, `useCopyMarket()`.
  - `IndustryCopies.tsx`: `IndustryCopies({ c, chars, ix, graph })`, its finder at `data-industry="copy-finder"`, each row
    `data-kind="<type|me|te|runs>"`; Task 15A adds Your copy business below it at `data-industry="copy-business"`.
  - The section key `copies` (`hustles/industry/copies`), label "Copies".

**What a row is** (spec, "The finder"; corrections 7, 8, 15, 16). For each kind sold in the window, at the shown character:
- skipped and counted when the bundle doesn't hold its blueprint, it's an invention product, or it has no copying or
  manufacturing activity (correction 8);
- a run's price: the lower of the median sold and the median ask now (correction 7), with which;
- a run's copy time and cost at the lab (`labFor`: the site when it can do science, else the nearest Laboratory, at its
  copying index, bonuses, tax and the character's clone), the EIV being the product's ME 0 materials at CCP's adjusted prices;
- runs a day a lab slot makes (86,400 ÷ a run's time), runs a day sold (runs sold ÷ the days counted, at least one: correction
  16), yours at the industry share, the lesser of the two, and which limits it;
- ISK a day for one lab slot: your runs a day × (the price a run − the cost a run); contract fees aren't modelled (limits.md);
- the original: one the character holds of that blueprint (its best ME, then TE) needs no purchase, and no research when its
  ME and TE are at least the kind's; otherwise NPCs' price in The Forge (`bpoWhere`, as Build's), and research from the held
  original's levels or 0/0 to the kind's at the lab, in days at the character's skills and ISK;
- payback: (the original + research) ÷ ISK a day; none when the original is held whole, or a figure isn't known;
- building instead: the finder's own profit a day for one factory slot of that blueprint at the kind's ME and TE (null until
  the finder's inputs are in);
- "1 seller: one person's prices" or "N sales this week: too few to say what it sells at" under three (spec).

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 14A's section:

```js
console.log('\n--- Industry stage 3: the copy finder (copyFinder.ts, Task 14B) ---');
{
  const F = await import('../src/lib/copyFinder.ts');
  const M = await import('../src/lib/copyMarket.ts');
  const I = await import('../src/lib/industry.ts');
  const fsF = await import('node:fs');
  const ix = I.indexBundle(JSON.parse(fsF.readFileSync(new URL('../src/data/industry.json', import.meta.url))));
  const FX = JSON.parse(fsF.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8'));
  const indices = I.parseIndices(FX.systems);
  const pump = { typeId: 25895, me: 10, te: 20, runs: 40, contracts: 3, copies: 3, sellers: 1, perRun: 112500 };
  // An NPC station in Jita's system (copying index 0.14%, its 0.25% tax), Science V and Advanced Industry II.
  const jitaLab = { kind: 'npc', rigs: [], band: 'high', tax: 0.0025, index: indices[30000142] };
  const base = { ix, kind: pump, ask: null, days: 7, skills: { 3402: 5, 3388: 2 }, clone: 'omega', lab: jitaLab, adjusted: FX.adjusted, share: 10, held: null,
    bpo: { state: 'forge', price: 9_000_000, stations: [60003760] }, build: () => 1_234_567 };
  const r = F.copyRow(base);
  // A run: 3,600 s × (1 − 25% Science V) × (1 − 6% Advanced Industry II) = 2,538 s; its job: 2% of the pump's EIV a run
  // (2,424,467.90) × (0.14% + 0.25% + SCC 4%) = 2,128.68.
  eq('the pump\'s 40-run copies: a run\'s time, runs a day a lab slot makes, sold a day and yours at 10%', [r.time, Math.round(r.labRuns * 100) / 100, Math.round(r.soldRuns * 1000) / 1000, Math.round(r.yourRuns * 1000) / 1000, r.limit],
    [2538, 34.04, 17.143, 1.714, 'market']);
  eq('  a run\'s copy job and what a lab slot makes a day', [Math.round(r.eiv), Math.round(r.cost.total * 100) / 100, r.costKnown, Math.round(r.iskDay)], [2424468, 2128.68, true, 189208]);
  eq('  research from 0/0 to 10/20 at Metallurgy and Research untrained, the original, payback, building instead, one seller',
    [Math.round(r.research.days * 100) / 100, Math.round(r.research.cost), r.bpoPrice, Math.round(r.payback * 100) / 100, r.buildDay, r.thin], [83.56, 5650996, 9000000, 77.43, 1234567, '1 seller: one person’s prices']);
  eq('    at Metallurgy IV and Research IV the research takes 66.84 days', Math.round(F.copyRow({ ...base, skills: { 3402: 5, 3388: 2, 3409: 4, 3403: 4 } }).research.days * 100) / 100, 66.84);
  eq('  an original held at ME 10 / TE 20: nothing to buy or research, no payback', ((x) => [x.research, x.bpoPrice, x.payback])(F.copyRow({ ...base, held: { me: 10, te: 20 } })), ['held', 0, null]);
  eq('  one held at ME 6 / TE 0: research from there, nothing to buy, payback on the research alone',
    ((x) => [x.research.me, x.research.te, Math.round(x.research.days * 100) / 100, Math.round(x.research.cost), x.bpoPrice, Math.round(x.payback * 100) / 100])(F.copyRow({ ...base, held: { me: 6, te: 0 } })), [[6, 10], [0, 20], 82.25, 5562699, 0, 29.4]);
  eq('  asks now under what sold: priced at the median ask', ((x) => [x.price, Math.round(x.iskDay)])(F.copyRow({ ...base, ask: [90000, 95000, 4, 2] })), [{ perRun: 95000, from: 'asks' }, 159208]);
  eq('  at a 100% share the market still limits it (17.1 sold a day against 34.0 the slot makes)', ((x) => [Math.round(x.yourRuns * 1000) / 1000, x.limit])(F.copyRow({ ...base, share: 100 })), [17.143, 'market']);
  eq('  a lab whose tax isn\'t typed, or a clone not read: the cost is ranked before it, said', [((x) => [x.costKnown, Math.round(x.cost.total * 100) / 100])(F.copyRow({ ...base, lab: { ...jitaLab, tax: null } })), F.copyRow({ ...base, clone: 'unknown' }).costKnown], [[false, 2007.46], false]);
  eq('  no Laboratory reached: no cost, no ISK a day, no research time, never 0', ((x) => [x.cost, x.iskDay, x.research.days, x.research.cost])(F.copyRow({ ...base, lab: null })), [null, null, null, null]);
  eq('  no adjusted prices: no EIV, no cost', ((x) => [x.eiv, x.cost, x.iskDay])(F.copyRow({ ...base, adjusted: null })), [null, null, null]);
  eq('  half a day counted is a day (120 runs, not 240); three days, a third', [F.copyRow({ ...base, days: 0.5 }).soldRuns, F.copyRow({ ...base, days: 3 }).soldRuns], [120, 40]);
  // An Azbel in UALX-3 (null-sec, copying index 8.72%, 1% tax) with a Standup L-Set Blueprint Copy Optimization I: time × 0.80 × 0.58, cost × 0.96 × 0.79.
  const az = F.copyRow({ ...base, lab: { kind: 'azbel', rigs: [43729], band: 'null', tax: 0.01, index: indices[30004807] } });
  eq('  at an Azbel with a copy rig in null-sec: a run in 1,177.63 s, 5,631.19 a run', [Math.round(az.time * 1000) / 1000, Math.round(az.cost.total * 100) / 100, Math.round(az.iskDay)], [1177.632, 5631.19, 183204]);
  eq('  a kind the bundle doesn\'t hold, and a Tech II copy (made by invention), are left out', [F.copyRow({ ...base, kind: { ...pump, typeId: 32306 } }), F.copyRow({ ...base, kind: { ...pump, typeId: 39581 } })], ['notInBundle', 'invented']);
  eq('  thin: one seller, or under three sales', [F.thinSaid({ contracts: 9, sellers: 1 }), F.thinSaid({ contracts: 2, sellers: 2 }), F.thinSaid({ contracts: 3, sellers: 2 })],
    ['1 seller: one person’s prices', '2 sales this week: too few to say what it sells at', null]);
  eq('the best original held of a type: highest ME, then TE; copies aren\'t originals', F.heldOriginal([
    { itemId: 1, typeId: 25895, locationId: 1, flag: 'Hangar', copy: false, count: 1, unused: false, me: 8, te: 20, runs: null },
    { itemId: 2, typeId: 25895, locationId: 1, flag: 'Hangar', copy: false, count: 1, unused: false, me: 10, te: 4, runs: null },
    { itemId: 3, typeId: 25895, locationId: 1, flag: 'Hangar', copy: true, count: 1, unused: false, me: 10, te: 20, runs: 40 },
  ], 25895), { me: 10, te: 4 });
  eq('  none held, or not read', [F.heldOriginal([], 25895), F.heldOriginal(null, 25895)], [null, null]);

  // The 11 October fixture's summary, ranked at Jita's lab: the pump first (its EIV known), the Standup priced at its asks, the
  // Capital Turret Hardpoint's 40-run copies limited by the slot; 32306 left out (the bundle doesn't hold it).
  const fsC = await import('node:fs');
  const C = JSON.parse(fsC.readFileSync(new URL('./fixtures/copy-snapshots.json', import.meta.url), 'utf8'));
  const contracts = (s) => s.contracts.map(([id, price, expires, issuer, items]) => ({ id, price, issued: '', expires, stationId: 60003760, issuer, title: '', items: items.map(([typeId, copy, me, te, runs, qty, itemId]) => ({ typeId, copy: copy === 1, me, te, runs, qty, itemId })) }));
  const [a, b, c] = C.snapshots.map((s) => ({ at: Date.parse(s.at), all: contracts(s) }));
  const sets = [a, b, c].map((s) => M.compactCopies(s.all));
  const sold = (older, newer) => M.copiesSold(older, new Set(newer.all.map((x) => x.id)), M.itemIssuers(newer.all), newer.at);
  const sum = M.copySummary({ sold: [...M.soldRows(sold(sets[0], b), b.at), ...M.soldRows(sold(sets[1], c), c.at)], current: sets[2], reads: [[a.at, b.at, 16], [b.at, c.at, 12]], exclude: new Set(), at: c.at });
  const got = F.copyRows({ ix, summary: sum, skills: { 3402: 5, 3388: 2 }, clone: 'omega', lab: jitaLab, adjusted: FX.adjusted, share: 10, heldOf: () => null, bpoOf: () => ({ state: 'unread' }), build: () => null });
  eq('the fixture\'s kinds ranked: priced first, then by type and runs; one left out', [got.rows.map((x) => `${x.kind.typeId}/${x.kind.runs}`), got.left],
    [['25895/40', '37045/5', '693/1', '693/10', '21012/19', '21012/40'], { notInBundle: 1, invented: 0, noCopying: 0 }]);
  eq('  the pump at 1,324,456 a day (12 of 120 runs sold a day), the Standup at its median ask, the hardpoint\'s 40-run copies slot-limited',
    [Math.round(got.rows[0].iskDay), got.rows[1].price.from, got.rows[5].limit], [1324456, 'asks', 'slot']);

  eq('counting: under a week says so; a stretch over 6.5 h between reads is a gap', [F.countingSaid({ days: 3.5 }), F.countingSaid({ days: 0 }), F.countingSaid({ days: 7 }), F.gapSaid({ gapHours: 13 }), F.gapSaid({ gapHours: 6 })],
    ['Counting what sells: 3.5 days so far.', 'Counting what sells: it began with the cloud’s last read; the next, six hours on, is the first to count.', null, 'The longest stretch between two reads was 13 h: copies listed and sold within it were missed.', null]);

  // What a real copy job says (correction 15): copying's SCC at an NPC station, and a copy rig's cost bonus at your Azbel.
  const T = await import('../src/lib/industryTrack.ts');
  const EIV = I.eivOf(I.activityOf(ix.bp.get(25895), 'manufacturing')[1], FX.adjusted);
  const job = (over) => ({ jobId: 1, activity: 5, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25895, runs: 2, licensedRuns: 40, successfulRuns: null, probability: null, cost: 0,
    facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: '2026-10-11T10:00:00Z', end: '2026-10-11T20:00:00Z', completed: null, status: 'active', perRun: null,
    seenAt: '2026-10-11T10:10:00Z', first: { me: 10, te: 20, systemId: 30000119, index: 0.0305, eiv: EIV, at: '2026-10-11T10:10:00Z' }, ...over });
  const npc = { kind: 'npc', rigs: [], band: 'high', tax: 0.0025, siteId: null };
  const app = I.copyCost(EIV, 40, 2, { index: 0.0305, structure: 1, rig: 1, tax: 0.0025, clone: 'omega' });
  const at = (cost, place = npc, over = {}) => [{ job: job({ cost: Math.round(cost * 100) / 100, ...over }), place, clone: 'omega', who: 'Your' }];
  eq('a copy job at an NPC station that paid the 4% SCC agrees; one that paid none differs', [F.copyReadings(ix, at(app.total)).scc.state, F.copyReadings(ix, at(app.total - app.scc)).scc.state], ['agrees', 'differs']);
  const azPlace = { kind: 'azbel', rigs: [43729], band: 'null', tax: 0.01, siteId: 'home:30004807' };
  const sb = I.structureBonus(ix, 'azbel'), rg = I.rigFor(ix, [43729], 'azbel', 'null', null, 'copying');
  const B = 0.02 * EIV * 80;
  const azAt = (cost, index = 0.0872) => at(cost, azPlace, { jobId: 2, facilityId: 1046664001931, stationId: 1046664001931, first: { me: 10, te: 20, systemId: 30004807, index, eiv: EIV, at: '2026-10-11T10:10:00Z' } });
  const mult = B * (0.0872 * sb.cost * rg.cost + 0.05), added = B * (0.0872 * (sb.cost + rg.cost - 1) + 0.05);
  eq('the rig\'s cost bonus: a job that paid the rig multiplying the structure\'s sits nearer that reading; one that paid it added, nearer that (both within 1%)',
    [F.copyReadings(ix, azAt(mult)).rig, F.copyReadings(ix, azAt(added)).rig.nearer], [{ state: 'agrees', jobId: 2, start: '2026-10-11T10:00:00Z', who: 'Your', app: F.copyReadings(ix, azAt(mult)).rig.app, charged: Math.round(mult * 100) / 100, nearer: 'multiplied' }, 'added']);
  eq('  at a 0.14% index the two readings are within the index\'s rounding: can\'t tell', F.copyReadings(ix, azAt(B * (0.0014 * sb.cost * rg.cost + 0.05), 0.0014)).rig.nearer, null);
  eq('  no cost rig, a tax not typed, a job first seen late: nothing read', [F.copyReadings(ix, at(mult, { ...azPlace, rigs: [] })).rig.state, F.copyReadings(ix, at(mult, { ...azPlace, tax: null })).rig.state,
    F.copyReadings(ix, at(app.total, npc, { first: { me: 10, te: 20, systemId: 30000119, index: 0.0305, eiv: EIV, at: '2026-10-11T12:00:00Z' } })).scc.state], ['unchecked', 'unchecked', 'unchecked']);
  eq('  the newest job decides', F.copyReadings(ix, [...at(app.total - app.scc, npc, { jobId: 5, start: '2026-10-01T10:00:00Z', seenAt: '2026-10-01T10:10:00Z', first: { me: 10, te: 20, systemId: 30000119, index: 0.0305, eiv: EIV, at: '2026-10-01T10:10:00Z' } }), ...at(app.total)]).scc.state, 'agrees');
  const date = (iso) => iso.slice(0, 10);
  eq('the cost tip says what isn\'t checked yet', F.readingsSaid({ scc: { state: 'unchecked' }, rig: { state: 'unchecked' } }, true, date), [
    'Copying’s SCC is taken as EVE Ref’s 4% of the job’s base: not yet checked against a copy job of yours (one at an NPC station, seen within 90 minutes of its start, settles it).',
    'The copy rig’s cost bonus is taken as multiplying the structure’s: not yet checked against a job of yours (a copy or research job at one of your structure sites with such a rig, its tax typed, settles it).',
  ]);
  eq('  and what a job said', F.readingsSaid(F.copyReadings(ix, [...at(app.total), ...azAt(added)]), true, date), [
    'Copying’s SCC checked: your copy job of 2026-10-11 at an NPC station paid it.',
    'The copy rig’s cost bonus: your job of 2026-10-11 paid within 1% of the app’s figure, but nearer the rig adding to the structure’s bonus than multiplying it, so the costs here with a rig may be a little high.',
  ]);
  eq('  no rig line where the lab has no cost rig', F.readingsSaid({ scc: { state: 'unchecked' }, rig: { state: 'unchecked' } }, false, date).length, 1);
  // An Astrahus has no cost bonus of its own: with its M-Set copy cost rig, adding and multiplying give the same charge (M16).
  const astra = { kind: 'astrahus', rigs: [43891], band: 'null', tax: 0.01, siteId: 'home:30004807' };
  const rgA = I.rigFor(ix, [43891], 'astrahus', 'null', null, 'copying');
  const aJob = at(B * (0.0872 * rgA.cost + 0.05), astra, { jobId: 3, facilityId: 1046664001932, stationId: 1046664001932, first: { me: 10, te: 20, systemId: 30004807, index: 0.0872, eiv: EIV, at: '2026-10-11T10:10:00Z' } });
  eq('  at a structure with no cost bonus of its own, said as the same either way, not as an index too low to tell', F.readingsSaid(F.copyReadings(ix, aJob), true, date)[1],
    'The copy rig’s cost bonus: your job of 2026-10-11 paid within 1% of the app’s figure; the structure has no cost bonus of its own, so adding the rig’s and multiplying are the same.');
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check`. Expected: FAIL, `Cannot find module '…/src/lib/copyFinder.ts'`.

- [ ] **Step 3: The finder's rules**

Create `src/lib/copyFinder.ts`:

```ts
/**
 * The Copies section's finder (docs/notes/industry.md, stage 3): each kind of copy that sold in The Forge this week, worked
 * out for one lab slot at the shown character's skills, clone and lab (the build site's, or the nearest Laboratory), and what
 * a real copy job of yours says about the copy cost's two readings that aren't checked yet. Browser only, pure: the Worker
 * imports copyMarket.ts, and this reads stage 2's job check and the finder's types (correction 9).
 */
import type { OwnedBlueprint } from './blueprints';
import { copyKindKey, type Ask, type CopySummary, type KindSold } from './copyMarket';
import { activityOf, copyCost, copyTime, DAY_S, eivOf, lacking, researchCost, researchTime, rigFor, SCC_COPY, structureBonus, type Clone, type Indexed, type JobCost } from './industry';
import type { BpoWhere, LabSite } from './industryRank';
import { ACTIVITY_OF, jobCheck, MEASURE_BAND, type JobPlace, type JobRecord } from './industryTrack';

/** Under this many sales a week, what a kind sells at is one or two buyers' prices (spec). */
export const THIN_SALES = 3;

export function thinSaid(k: Pick<KindSold, 'contracts' | 'sellers'>): string | null {
  if (k.sellers <= 1) return '1 seller: one person’s prices';
  if (k.contracts < THIN_SALES) return `${k.contracts} sale${k.contracts === 1 ? '' : 's'} this week: too few to say what it sells at`;
  return null;
}

/** The best original of a type a character holds (highest ME, then TE); null when none is held or its blueprints aren't read. */
export function heldOriginal(owned: readonly OwnedBlueprint[] | null, typeId: number): { me: number; te: number } | null {
  let best: { me: number; te: number } | null = null;
  for (const b of owned ?? []) if (!b.copy && b.typeId === typeId && (!best || b.me > best.me || (b.me === best.me && b.te > best.te))) best = { me: b.me, te: b.te };
  return best;
}

export type CopyLeft = 'notInBundle' | 'invented' | 'noCopying';
export type CopyFinderRow = {
  kind: KindSold; bp: number;
  /** A run's price: the median sold, or the median ask now when that's lower (correction 7). */
  price: { perRun: number; from: 'sold' | 'asks' };
  /** A run's copy time (s); runs a day a lab slot makes; runs a day sold (everyone); yours at the share, capped by the slot. */
  time: number; labRuns: number; soldRuns: number; yourRuns: number; limit: 'market' | 'slot';
  eiv: number | null;
  /** A run's copy job at the lab; null with no Laboratory reached, its index not read, or no EIV. */
  cost: JobCost | null;
  /** Whether that cost is whole: false while the lab's tax or the Alpha tax (clone not read) isn't known. */
  costKnown: boolean | null;
  iskDay: number | null;
  research: 'held' | { me: [from: number, to: number]; te: [from: number, to: number]; days: number | null; cost: number | null };
  /** What the original costs: 0 when held, NPCs' price in The Forge, else null. */
  bpoPrice: number | null;
  payback: number | null;
  buildDay: number | null;
  thin: string | null;
  lacking: { id: number; level: number }[];
};
export type CopyRowInput = {
  ix: Indexed; kind: KindSold; ask: Ask | null;
  /** Days counted in the window: at least one is used (correction 16). */
  days: number;
  skills: Record<number, number>; clone: Clone;
  /** Where copying and research run (labFor); null when no Laboratory can be reached. */
  lab: LabSite | null;
  adjusted: Record<number, number> | null;
  /** The industry share, in percent. */
  share: number;
  held: { me: number; te: number } | null;
  bpo: BpoWhere;
  /** The finder's profit a day for one factory slot of this blueprint at an ME and TE; null when it can't say. */
  build: (bp: number, me: number, te: number) => number | null;
};

export function copyRow(o: CopyRowInput): CopyFinderRow | CopyLeft {
  const { ix, kind: k } = o;
  const bp = ix.bp.get(k.typeId);
  if (!bp) return 'notInBundle';
  if (ix.inventedFrom.has(k.typeId)) return 'invented';
  const copy = activityOf(bp, 'copying'), mfg = activityOf(bp, 'manufacturing');
  if (!copy || !mfg) return 'noCopying';
  const lab = o.lab;
  const sb = structureBonus(ix, lab?.kind ?? 'npc');
  const rig = (a: 'copying' | 'researchMaterial' | 'researchTime') => (lab ? rigFor(ix, lab.rigs, lab.kind, lab.band, null, a) : { material: 1, time: 1, cost: 1 });
  const time = copyTime(ix, copy[0], 1, 1, o.skills, sb.time, rig('copying').time);
  const labRuns = DAY_S / time;
  const soldRuns = (k.copies * k.runs) / Math.max(1, o.days);
  const atShare = (soldRuns * o.share) / 100;
  const yourRuns = Math.min(labRuns, atShare);
  const askMedian = o.ask ? o.ask[1] : null;
  const price = askMedian != null && askMedian < k.perRun ? { perRun: askMedian, from: 'asks' as const } : { perRun: k.perRun, from: 'sold' as const };
  const eiv = o.adjusted ? eivOf(mfg[1], o.adjusted) : null;
  const cost = eiv != null && lab?.index ? copyCost(eiv, 1, 1, { index: lab.index.copying, structure: sb.cost, rig: rig('copying').cost, tax: lab.tax, clone: o.clone }) : null;
  const iskDay = cost ? yourRuns * (price.perRun - cost.total) : null;
  const held = o.held;
  let research: CopyFinderRow['research'];
  if (held && held.me >= k.me && held.te >= k.te) research = 'held';
  else {
    // From the held original's levels (a TE level is 2%), never past the kind's: copies keep the original's ME and TE.
    const meFrom = Math.min(held?.me ?? 0, k.me), teFrom = Math.min(Math.floor((held?.te ?? 0) / 2), k.te / 2);
    const rme = activityOf(bp, 'researchMaterial'), rte = activityOf(bp, 'researchTime');
    const meT = rme ? researchTime(ix, rme[0], 'me', meFrom, k.me, o.skills, sb.time, rig('researchMaterial').time) : null;
    const teT = rte ? researchTime(ix, rte[0], 'te', teFrom, k.te / 2, o.skills, sb.time, rig('researchTime').time) : null;
    const at = (a: 'researchMaterial' | 'researchTime') => (lab?.index ? { index: lab.index[a], structure: sb.cost, rig: rig(a).cost, tax: lab.tax, clone: o.clone } : null);
    const meA = at('researchMaterial'), teA = at('researchTime');
    const meC = eiv != null && meA ? researchCost(eiv, meFrom, k.me, meA).total : null;
    const teC = eiv != null && teA ? researchCost(eiv, teFrom, k.te / 2, teA).total : null;
    research = { me: [meFrom, k.me], te: [teFrom * 2, k.te], days: lab && meT != null && teT != null ? (meT + teT) / DAY_S : null, cost: meC != null && teC != null ? meC + teC : null };
  }
  const bpoPrice = held ? 0 : o.bpo.state === 'forge' ? o.bpo.price : null;
  const researchIsk = research === 'held' ? 0 : research.cost;
  const payback = research !== 'held' && bpoPrice != null && researchIsk != null && iskDay != null && iskDay > 0 ? (bpoPrice + researchIsk) / iskDay : null;
  return {
    kind: k, bp: bp[0], price, time, labRuns, soldRuns, yourRuns, limit: labRuns < atShare ? 'slot' : 'market', eiv, cost,
    costKnown: cost ? cost.tax != null && cost.alpha != null : null, iskDay, research, bpoPrice, payback,
    buildDay: o.build(bp[0], k.me, k.te), thin: thinSaid(k), lacking: lacking(copy[2], o.skills),
  };
}

/** Every kind sold, ranked by ISK a day (unpriced last, then by type and runs), and how many were left out and why. */
export function copyRows(o: Omit<CopyRowInput, 'kind' | 'ask' | 'held' | 'bpo' | 'days'> & {
  summary: CopySummary; heldOf: (typeId: number) => { me: number; te: number } | null; bpoOf: (bp: number) => BpoWhere;
}): { rows: CopyFinderRow[]; left: Record<CopyLeft, number> } {
  const rows: CopyFinderRow[] = [], left: Record<CopyLeft, number> = { notInBundle: 0, invented: 0, noCopying: 0 };
  for (const k of o.summary.sold) {
    const r = copyRow({ ...o, kind: k, days: o.summary.days, ask: o.summary.asks[copyKindKey(k)] ?? null, held: o.heldOf(k.typeId), bpo: o.bpoOf(k.typeId) });
    if (typeof r === 'string') left[r]++; else rows.push(r);
  }
  rows.sort((a, b) => (b.iskDay ?? -Infinity) - (a.iskDay ?? -Infinity) || a.kind.typeId - b.kind.typeId || a.kind.runs - b.kind.runs);
  return { rows, left };
}

/** Under a week counted, how many days so far (spec); nothing at a week. */
export function countingSaid(s: Pick<CopySummary, 'days'>): string | null {
  if (s.days >= 7) return null;
  if (s.days <= 0) return 'Counting what sells: it began with the cloud’s last read; the next, six hours on, is the first to count.';
  return `Counting what sells: ${s.days < 1 ? 'less than a day' : `${Math.round(s.days * 10) / 10} days`} so far.`;
}
/** A comparison that spanned more than 6.5 hours missed what was listed and sold within it (correction 16). */
export function gapSaid(s: Pick<CopySummary, 'gapHours'>): string | null {
  return s.gapHours > 6.5 ? `The longest stretch between two reads was ${Math.round(s.gapHours)} h: copies listed and sold within it were missed.` : null;
}

// --- What a real job says about the copy cost (correction 15) ----------------------------------------------------------

export type CostReading =
  | { state: 'unchecked' }
  | { state: 'agrees' | 'differs'; jobId: number; start: string; who: string; app: number; charged: number; nearer: 'multiplied' | 'added' | null; alike?: boolean };
/** A job with where it ran (stage 2's `jobPlace`), its character's clone and whose it is ("Your", "Builder Alt’s"). */
export type CheckedJob = { job: JobRecord; place: JobPlace | null; clone: Clone; who: string };

/**
 * Which reading of a cost rig ESI's charge sits nearer: the app's, the rig multiplying the structure's bonus on the index part,
 * or the rig added to it. Null when the two are within twice what the index's four decimals and a tax typed to 0.01% move
 * the charge: at a low index they can't be told apart.
 */
export function rigNearer(base: number, index: number, structure: number, rig: number, rest: number, charged: number): 'multiplied' | 'added' | null {
  const mult = base * index * structure * rig + rest, added = base * index * (structure + rig - 1) + rest;
  const noise = base * (0.00005 * structure * rig + 0.00005);
  if (Math.abs(mult - added) <= 2 * noise) return null;
  return Math.abs(charged - mult) <= Math.abs(charged - added) ? 'multiplied' : 'added';
}

/**
 * The newest checked job (stage 2's `jobCheck`: first seen within 90 minutes, its inputs kept, the tax and clone known) that
 * settles each reading: a copy job at an NPC station for copying's SCC (its `sccShare` against SCC_COPY, to the measure's
 * band), and a copy or research job at one of your structure sites with a rig that cuts that activity's cost.
 */
export function copyReadings(ix: Indexed, jobs: readonly CheckedJob[]): { scc: CostReading; rig: CostReading } {
  let scc: CostReading = { state: 'unchecked' }, rig: CostReading = { state: 'unchecked' };
  for (const x of [...jobs].sort((a, b) => Date.parse(b.job.start) - Date.parse(a.job.start) || b.job.jobId - a.job.jobId)) {
    const act = ACTIVITY_OF[x.job.activity];
    if ((act !== 'copying' && act !== 'researchMaterial' && act !== 'researchTime') || !x.place) continue;
    const c = jobCheck(ix, x.job, x.place, x.clone);
    if (c.state !== 'checked' || !(c.parts.base > 0)) continue;
    const head = { jobId: x.job.jobId, start: x.job.start, who: x.who, app: c.app, charged: c.charged };
    if (scc.state === 'unchecked' && act === 'copying' && x.place.kind === 'npc' && c.sccShare != null)
      scc = { state: Math.abs(c.sccShare - SCC_COPY) <= MEASURE_BAND ? 'agrees' : 'differs', ...head, nearer: null };
    if (rig.state === 'unchecked' && x.place.kind !== 'npc') {
      const r = rigFor(ix, x.place.rigs, x.place.kind, x.place.band, null, act);
      if (r.cost < 1) {
        const sb = structureBonus(ix, x.place.kind), p = c.parts;
        // A structure with no cost bonus of its own (an Astrahus, a Fortizar): adding the rig's and multiplying are the same (M16).
        rig = sb.cost === 1 ? { state: c.differs ? 'differs' : 'agrees', ...head, nearer: null, alike: true }
          : { state: c.differs ? 'differs' : 'agrees', ...head, nearer: rigNearer(p.base, p.index / p.base, sb.cost, r.cost, (p.tax ?? 0) + p.scc + (p.alpha ?? 0), c.charged) };
      }
    }
  }
  return { scc, rig };
}

/** The copy cost's tip: each reading, checked or not. The rig's line only where the lab has a rig that cuts copying's cost. */
export function readingsSaid(r: { scc: CostReading; rig: CostReading }, labCostRig: boolean, date: (iso: string) => string): string[] {
  const isk = (n: number) => Math.round(n).toLocaleString('en-US');
  const out = [r.scc.state === 'unchecked'
    ? 'Copying’s SCC is taken as EVE Ref’s 4% of the job’s base: not yet checked against a copy job of yours (one at an NPC station, seen within 90 minutes of its start, settles it).'
    : r.scc.state === 'agrees' ? `Copying’s SCC checked: ${r.scc.who.toLowerCase() === 'your' ? 'your' : r.scc.who} copy job of ${date(r.scc.start)} at an NPC station paid it.`
      : `Copying’s SCC: ${r.scc.who.toLowerCase() === 'your' ? 'your' : r.scc.who} copy job of ${date(r.scc.start)} at an NPC station paid ${isk(r.scc.charged)} ISK where the app worked out ${isk(r.scc.app)}: the copy costs here may be off.`];
  if (!labCostRig) return out;
  const g = r.rig, whose = g.state === 'unchecked' ? '' : g.who.toLowerCase() === 'your' ? 'your' : g.who;
  out.push(g.state === 'unchecked'
    ? 'The copy rig’s cost bonus is taken as multiplying the structure’s: not yet checked against a job of yours (a copy or research job at one of your structure sites with such a rig, its tax typed, settles it).'
    : g.state === 'differs' ? `The copy rig’s cost bonus: ${whose} job of ${date(g.start)} paid ${isk(g.charged)} ISK where the app worked out ${isk(g.app)}: the costs here with a rig may be off.`
      : g.nearer === 'added' ? `The copy rig’s cost bonus: ${whose} job of ${date(g.start)} paid within 1% of the app’s figure, but nearer the rig adding to the structure’s bonus than multiplying it, so the costs here with a rig may be a little high.`
        : g.nearer === 'multiplied' ? `The copy rig’s cost bonus checked: ${whose} job of ${date(g.start)} paid the app’s figure, the rig multiplying the structure’s bonus.`
          : g.alike ? `The copy rig’s cost bonus: ${whose} job of ${date(g.start)} paid within 1% of the app’s figure; the structure has no cost bonus of its own, so adding the rig’s and multiplying are the same.`
            : `The copy rig’s cost bonus: ${whose} job of ${date(g.start)} paid within 1% of the app’s figure; at that index adding and multiplying can’t be told apart.`);
  return out;
}
```

- [ ] **Step 4: Run the tests, see them pass; plant each rule wrong**

Run: `npm run check`. Expected: the new section passes. Plant and see each fail: `Math.max(1, o.days)` → `o.days` (the half-day
test reads 240); `askMedian < k.perRun` → `false` (the asks test); `research !== 'held' &&` dropped from payback (the held test
reads 0); `ix.inventedFrom.has` check removed (the Tech II test); `rigNearer`'s `2 * noise` → `0` (the 0.14% test); the `alike`
branch dropped (the Astrahus test reads "at that index"). And in the page check (step 7): the `summary.reads > 0` gate removed
(the first-read stub draws "0 kinds sold" and a table); `buildDays` computed for every row is no failure but is M10's cost: keep it
to the rows shown.

- [ ] **Step 5: The cloud's read in the browser**

In `src/lib/cloud.ts`, beside `cloudHomePrices`:

```ts
/**
 * What copies sold for in The Forge over the last week and the asks now (`GET /v1/copies`): null before the cloud's first read,
 * `off` when it has its EVE Ref reads switched off. A Worker a version behind answers 404 (the error's `status`).
 */
export type CopiesAnswer = { off: true } | (CopySummary & { tried: string | null; error: string | null; stale?: string | null }) | null;
export const cloudCopies = () => call<CopiesAnswer>('/v1/copies');
```

(with `import type { CopySummary } from './copyMarket';` at the top). In `src/components/hustles/industryMarket.ts`, after
`useHomePrices`:

```ts
/**
 * The cloud's copy market (Task 14A's summary): `off` with the cloud copy off in this browser, `switched` when the cloud has its
 * EVE Ref reads off, `none` before its first read, `behind` for a Worker without the route (404), `failed` otherwise; `ok` with
 * the summary and when the cloud last tried, and that try's error.
 */
export type CopyMarketState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string; retry: () => void }
  | { status: 'switched' } | { status: 'none' } | { status: 'ok'; summary: CopySummary; tried: string | null; error: string | null; stale: string | null };
/** Held like a hub's prices: the cloud reads every six hours, so a read is kept until the next could have landed (homeHoldMs), and dropped on another login and on "Delete all data". */
let copiesHeld: { until: number; read: ReturnType<typeof cloudCopies> } | null = null;
const resetCopies = () => { copiesHeld = null; };
let copiesChar: number | null | undefined;
onAuthChange(() => { const id = getAuth()?.characterId ?? null; if (copiesChar !== undefined && copiesChar !== id) resetCopies(); copiesChar = id; });
onClearAll(resetCopies);
const copiesRead = () => {
  if (copiesHeld && Date.now() < copiesHeld.until) return copiesHeld.read;
  const read = cloudCopies();
  const held = { until: Infinity, read };
  copiesHeld = held;
  read.then((r) => { held.until = Date.now() + homeHoldMs(r && !('off' in r) ? r.at : null, Date.now()); }, () => { if (copiesHeld === held) copiesHeld = null; });
  return read;
};
export function useCopyMarket(): CopyMarketState {
  const cloud = useCloud();
  const [st, setSt] = useState<CopyMarketState>(() => (cloudEnabled() ? { status: 'loading' } : { status: 'off' }));
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!cloudEnabled()) { resetCopies(); setSt({ status: 'off' }); return; }
    if (!cloud.started) return;
    let alive = true;
    copiesRead().then((r) => { if (alive) setSt(!r ? { status: 'none' } : 'off' in r ? { status: 'switched' } : { status: 'ok', summary: r, tried: r.tried, error: r.error, stale: r.stale ?? null }); },
      (e) => { if (alive) setSt((e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e), retry: () => { resetCopies(); setSt({ status: 'loading' }); setTries((n) => n + 1); } }); });
    return () => { alive = false; };
  }, [cloud.started, tries]);
  return st;
}
```

(`cloudCopies` joins the `../../lib/cloud` import; `type CopySummary` from `../../lib/copyMarket`.)

- [ ] **Step 6: The section**

In `src/components/hustles/Industry.tsx`, `SECTIONS` gains, after `blueprints`:

```ts
  { key: 'copies', label: 'Copies', tip: 'Copies worth making for one lab slot, and your own copy business' },
```

and the render gains `{section === 'copies' && <IndustryCopies key={shown.charId} c={shown} chars={chars} ix={ix} graph={graph} />}`
(import from `./IndustryCopies`). The header comment's "stages 3 and 4 add Copies and Home markets" becomes "stage 4 adds
Home markets".

Create `src/components/hustles/IndustryCopies.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { FlaskConical, Scale, Store } from 'lucide-react';
import { copyKindKey } from '../../lib/copyMarket';
import { copyReadings, copyRows, countingSaid, gapSaid, heldOriginal, readingsSaid, type CheckedJob, type CopyFinderRow } from '../../lib/copyFinder';
import { ago, fmtDate, iskBig, pct, units } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { nameOf, rigFor, secBand, type Indexed } from '../../lib/industry';
import { finderSkills } from '../../lib/industryLadder';
import { bpoWhere, buildRow } from '../../lib/industryRank';
import { jobPlace } from '../../lib/industryTrack';
import type { Graph } from '../../lib/jumps';
import type { IndustrySite } from '../../lib/prefs';
import { Points } from '../Facts';
import { Th } from '../ui';
import { skillsWhy, type IndustryChar } from './industryChars';
import { bpoSaid, perDayCell, useFinder, useStationSaid } from './industryFinder';
import { useAdjusted, useCopyMarket, useIndices, useIndustryDoc } from './industryMarket';

/** Rows shown before "Show more": a week's kinds run to two thousand. */
const SHOWN = 50;
const daysSaid = (d: number) => (d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${Math.round(d * 10) / 10} d`);

/**
 * Copies (docs/notes/industry.md, stage 3): which copies are worth making for one lab slot, from what the cloud counted sold
 * in The Forge this week, at the shown character's skills, clone and lab; Task 15A adds Your copy business below. Reads each
 * alt's pulled copy through `chars`, writes nothing.
 */
export function IndustryCopies({ c, chars, ix, graph }: { c: IndustryChar; chars: IndustryChar[]; ix: Indexed; graph: Graph }) {
  const now = useNow(60_000);
  const [doc] = useIndustryDoc();
  const f = useFinder(c, ix, graph);
  const market = useCopyMarket();
  const adjusted = useAdjusted();
  const indices = useIndices();
  const [more, setMore] = useState(0);
  // Each input held steady, so the minute's tick doesn't work every kind out again (a buildRow a kind, as the finder ranks).
  const skills = useMemo(() => finderSkills(c.pilot.skills, c.clone), [c.pilot.skills, c.clone]);
  const bandOf = (s: IndustrySite) => secBand(graph[s.systemId]?.[0]);
  const owned = c.blueprints.state === 'read' ? c.blueprints.value : null;
  const summary = market.status === 'ok' ? market.summary : null;
  const input = f.input;
  const npcRows = f.npc.status === 'ok' ? f.npc.rows : null;
  // A kind's blueprint is a Tech I original (copyRow leaves invention products out): NPCs' price is its own, as Build says it.
  const bpoOf = useCallback((bp: number) => bpoWhere(npcRows, bp, ix.b.types[bp]?.[4] ?? 0), [npcRows, ix]);
  const built = useMemo(() => (input ? (bp: number, me: number, te: number) => { const x = ix.bp.get(bp); return x ? buildRow({ ...input, bp: x, me, te }).day?.profit ?? null : null; } : () => null), [input, ix]);
  const got = useMemo(() => (summary && skills && adjusted.state === 'ok'
    ? copyRows({ ix, summary, skills, clone: c.clone, lab: f.lab?.site ?? null, adjusted: adjusted.value, share: doc.share, heldOf: (t) => heldOriginal(owned, t), bpoOf, build: () => null })
    : null), [summary, skills, adjusted, ix, c.clone, f.lab, doc.share, owned, bpoOf]);
  // What real copy and research jobs say about the cost (every character's, newest first): correction 15.
  const checked: CheckedJob[] = useMemo(() => chars.flatMap((x) => (x.jobs.state === 'read' ? x.jobs.value.map((job) => ({ job, place: jobPlace(job, doc.sites, bandOf), clone: x.clone, who: x.isMain ? 'Your' : `${x.name}’s` })) : [])), [chars, doc.sites]); // eslint-disable-line react-hooks/exhaustive-deps
  const readings = useMemo(() => copyReadings(ix, checked), [ix, checked]);
  const lab = f.lab?.site ?? null;
  const labCostRig = !!lab && rigFor(ix, lab.rigs, lab.kind, lab.band, null, 'copying').cost < 1;
  const costTip = readingsSaid(readings, labCostRig, fmtDate);
  const station = useStationSaid((got?.rows ?? []).slice(0, SHOWN + more).flatMap((r) => { const w = bpoOf(r.bp); return w.state === 'forge' ? [w.stations[0]] : []; }), ix, graph);
  const before = got?.rows.some((r) => r.costKnown === false) ? (lab?.tax == null ? 'before the lab’s facility tax' : 'before the Alpha tax') : null;

  const marketSaid = market.status === 'off' ? 'What copies sell is counted by the cloud, which isn’t on in this browser: switch it on in Settings, Your data.'
    : market.status === 'loading' ? 'Reading what copies sold from the cloud…'
      : market.status === 'behind' ? 'The cloud is a version behind: what copies sell comes once it’s updated.'
        : market.status === 'switched' ? 'The cloud has its reads of EVE Ref switched off, so what copies sell isn’t counted.'
          : market.status === 'none' ? 'The cloud hasn’t read the copy market yet: its first read comes on its next six-hourly round, and counting starts six hours after that.'
            : market.status === 'failed' ? `Couldn’t read what copies sold from the cloud: ${market.error}`
              : null;
  // What the rows wait for, as the finder says it (useFinder's own states): a site, the skills, the indices, the adjusted prices.
  const waiting: { text: string; retry?: () => void } | null = !f.site ? { text: 'Pick where you build first (Build, Where you build): copies are made at its Laboratory, or the nearest one.' }
    : !skills ? { text: skillsWhy(c) }
      : indices.state === 'loading' ? { text: 'Reading the industry indices…' }
        : indices.state === 'failed' ? { text: 'Couldn’t read ESI’s industry indices just now, so no copy can be costed.', retry: indices.retry }
          : adjusted.state === 'loading' ? { text: 'Reading CCP’s adjusted prices…' }
            : adjusted.state === 'failed' ? { text: 'Couldn’t read CCP’s adjusted prices just now, so no copy can be costed.', retry: adjusted.retry }
              : null;
  const rows = got?.rows ?? [];
  const shown = useMemo(() => rows.slice(0, SHOWN + more), [rows, more]);
  // Building instead, for the rows shown only (M10): a buildRow a kind for every kind sold would run on each live-book flush.
  const buildDays = useMemo(() => new Map(shown.map((r) => [copyKindKey(r.kind), built(r.bp, r.kind.me, r.kind.te)])), [shown, built]);
  const leftSaid = got ? [
    got.left.notInBundle ? `${units(got.left.notInBundle)} ${got.left.notInBundle === 1 ? 'copy' : 'copies'} of blueprints NPCs don’t sell (faction and exploration copies: nobody makes them by copying)` : null,
    got.left.invented ? `${units(got.left.invented)} Tech II ${got.left.invented === 1 ? 'copy' : 'copies'} (made by invention: Build ranks Tech II)` : null,
    got.left.noCopying ? `${units(got.left.noCopying)} whose blueprint can’t be copied` : null,
  ].filter(Boolean).join('; ') : '';

  return (
    <section className="col" style={{ gap: 16 }} aria-label="Copies" data-industry="copies">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Researched originals can make copies that sell on contract.</p>
        <Points compact items={[
          { kind: 'info', icon: FlaskConical, lead: 'Buyers pay for the research', text: 'so the copies that sell are ME 10 / TE 20.' },
          { kind: 'good', icon: Scale, lead: 'A lab slot copying', text: 'adds to building rather than replacing it.' },
          { kind: 'info', icon: Store, lead: 'Copies sell in The Forge', text: 'not at home: Brave gives its members copies free.' },
        ]} />
      </div>

      {marketSaid ? (
        <p className="note small" data-industry="copy-state" style={{ margin: 0 }}>{marketSaid}
          {market.status === 'failed' && <> <button type="button" className="link-btn" onClick={market.retry}>Try again</button></>}</p>
      ) : summary && (
        <p className="note small" data-industry="copy-state" style={{ margin: 0 }}>
          {`From EVE Ref’s snapshot of The Forge’s public contracts, ${ago(summary.at, now)}; a contract that vanished before it expired counts as sold. `}
          {[countingSaid(summary), gapSaid(summary),
            market.status === 'ok' && market.error ? `The cloud’s last try failed (${market.error}): these are from the read before it.` : null,
            market.status === 'ok' && !market.error && market.stale ? `EVE Ref’s newest snapshot is still the one of ${ago(market.stale, now)}; the cloud tries again hourly.` : null].filter(Boolean).join(' ')}
        </p>
      )}

      {/* Before a read has compared two sets the line above says counting has begun: no count, no table (I3). */}
      {summary && summary.reads > 0 && (waiting ? (
        <p className="note small" data-industry="copy-wait" style={{ margin: 0 }}>{waiting.text}
          {waiting.retry && <> <button type="button" className="link-btn" onClick={waiting.retry}>Try again</button></>}</p>
      ) : got && !rows.length ? (
        <p className="note small" data-industry="copy-none" style={{ margin: 0 }}>{`No copies of blueprints you can copy sold in what’s been counted${leftSaid ? ` (left out: ${leftSaid})` : ''}.`}</p>
      ) : got && (
        <>
          <p className="note small" data-industry="copy-count" style={{ margin: 0 }}>
            {`${units(summary.sold.length)} kinds sold ${summary.days >= 7 ? 'in the last week' : 'so far'}, ${units(rows.length)} of them made by copying${leftSaid ? `; left out: ${leftSaid}` : ''}. `}
            {`Copied at ${f.lab?.at ?? 'no Laboratory reached'}, at ${c.isMain ? 'your' : `${c.name}’s`} skills, selling ${pct(doc.share / 100, doc.share % 1 ? 1 : 0)} of what sold.`}
          </p>
          <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
            <table className="tbl compact rd-table ind-copies" data-industry="copy-finder">
              <thead><tr>
                <Th left>Copy of</Th>
                <Th className="rd-wide" tip={'Contracts of this kind that vanished before they expired this week, read every six hours.\n\n• A contract listed and sold between two reads is never seen, so this counts fewer than sold.\n• Sellers: how many different ones; one seller is one person’s prices.'}>Sold</Th>
                <Th className="rd-wide" tip={'A run’s price: the median of what sold, or the median ask now when that’s lower.\n\nFor example: a kind that sold at 1.78 M a run, now asked at 1.69 M, is priced at 1.69 M.'}>Price a run</Th>
                <Th className="rd-wide" tip={['A run’s copy job at the lab: 2% of the product’s estimated item value × (the copying index × the bonuses + the facility tax + the SCC + the Alpha tax).', ...costTip.map((l) => `• ${l}`)].join('\n\n')}>Copy cost a run</Th>
                <Th className="rd-wide" tip="Runs a day you’d sell: your share of what sold a day, or what a lab slot makes, whichever is less.">Runs a day</Th>
                <Th tip={`What one lab slot copying it makes a day: your runs a day × (the price − the copy cost). Contract fees aren’t modelled.${before ? ` Worked out ${before}, which isn’t known.` : ''}`}>{before ? `ISK a day, ${before}` : 'ISK a day, one lab slot'}</Th>
                <Th className="rd-wide" tip="The original: one you hold needs no purchase; else NPCs’ price in The Forge.">Original</Th>
                <Th className="rd-wide" tip="Research to the kind’s ME and TE at the lab, from what you hold or 0/0, at your skills.">Research</Th>
                <Th className="rd-wide" tip="Days for the original and its research to pay for themselves out of ISK a day.">Payback</Th>
                <Th className="rd-wide" tip="The finder’s profit a day for one factory slot building from this blueprint at the kind’s ME and TE: the slot you’d build with instead.">Building instead</Th>
              </tr></thead>
              <tbody>
                {shown.map((r) => <CopyRowView key={copyKindKey(r.kind)} r={r} name={nameOf(ix, r.bp)} bpo={bpoSaid(bpoOf(r.bp), f.npc, (id) => station(id))} costTip={costTip} buildDay={buildDays.get(copyKindKey(r.kind)) ?? null} />)}
              </tbody>
            </table>
          </div>
          {rows.length > shown.length && <button type="button" className="link-btn" onClick={() => setMore((m) => m + SHOWN)}>Show {units(Math.min(SHOWN, rows.length - shown.length))} more</button>}
        </>
      ))}
    </section>
  );
}

function CopyRowView({ r, name, bpo, costTip, buildDay }: { r: CopyFinderRow; name: string; bpo: { v: string; n: string }; costTip: string[]; buildDay: number | null }) {
  const k = r.kind;
  const research = r.research === 'held' ? { v: 'None', n: 'you hold the original at that ME and TE' }
    : { v: r.research.days != null ? daysSaid(r.research.days) : '–', n: `ME ${r.research.me[0]} → ${r.research.me[1]}, TE ${r.research.te[0]} → ${r.research.te[1]}${r.research.cost != null ? ` · ${iskBig(r.research.cost)}` : r.research.days == null ? ' · no Laboratory reached, or its index isn’t read' : ' · cost not known'}` };
  const costWhy = r.eiv == null ? 'CCP’s adjusted prices lack one of its materials' : 'no Laboratory reached, or its index isn’t read';
  return (
    <tr data-kind={copyKindKey(k)}>
      <td className="l rd-main">
        <span className="nm">{name}</span>
        <div className="note small">{`ME ${k.me} / TE ${k.te} · ${units(k.runs)} run${k.runs === 1 ? '' : 's'} a copy`}{r.thin && <span className="flag warn" style={{ marginLeft: 6 }}>{r.thin}</span>}</div>
        <div className="rd-phone note small">{r.iskDay != null ? `${iskBig(r.iskDay)} a day` : '–'} · {perDayCell(r.yourRuns)} runs a day · {r.payback != null ? `payback ${Math.round(r.payback)} d` : 'no payback'}</div>
      </td>
      <td className="rd-wide"><div>{units(k.contracts)}</div><div className="note small">{`${units(k.copies)} cop${k.copies === 1 ? 'y' : 'ies'} · ${units(k.sellers)} seller${k.sellers === 1 ? '' : 's'}`}</div></td>
      <td className="rd-wide"><div>{iskBig(r.price.perRun)}</div><div className="note small">{r.price.from === 'asks' ? `median ask now, under what sold (${iskBig(k.perRun)})` : 'median sold'}</div></td>
      <td className="rd-wide"><span data-industry="copy-cost" data-tip={costTip.join('\n\n')}>{r.cost ? iskBig(r.cost.total) : '–'}</span>{!r.cost && <div className="note small">{costWhy}</div>}</td>
      <td className="rd-wide"><div>{perDayCell(r.yourRuns)}</div><div className="note small">{`${r.limit === 'slot' ? 'the lab slot' : 'the market'} limits it · a slot makes ${perDayCell(r.labRuns)}`}</div></td>
      <td data-industry="copy-isk"><div>{r.iskDay != null ? iskBig(r.iskDay) : '–'}</div></td>
      <td className="rd-wide"><div>{r.bpoPrice === 0 ? 'Held' : bpo.v}</div><div className="note small">{r.bpoPrice === 0 ? 'you hold one' : bpo.n}</div></td>
      <td className="rd-wide"><div>{research.v}</div><div className="note small">{research.n}</div></td>
      <td className="rd-wide">{r.payback != null ? `${units(Math.round(r.payback))} d` : '–'}</td>
      <td className="rd-wide">{buildDay != null ? `${iskBig(buildDay)} a day` : '–'}</td>
    </tr>
  );
}
```

(`tsconfig.json` may have `noUnusedLocals`: keep the file's imports to what it uses.)

- [ ] **Step 7: The page check**

In `scripts/pages.mjs`, `PAGES` gains `'hustles/industry/copies'` after `'hustles/industry/build'`; in the plain loads (the
block that checks `hash === 'hustles/industry/build'`), add:

```js
      if (hash === 'hustles/industry/copies') {
        await page.waitForSelector('[data-industry="copies"]', { timeout: 30_000 }).catch(() => problems.push('Copies never drew'));
        if (!(await page.locator('[data-industry="copies"]', { hasText: 'Researched originals can make copies that sell on contract.' }).count())) problems.push('not drawn: the Copies section’s lead');
        // The plain loads' cloud is unreachable (VITE_CLOUD_URL is a closed port): the section says where the copy market stands
        // (reading, or couldn't read), never a zero or an empty table.
        if (!(await page.locator('[data-industry="copy-state"]').count())) problems.push('Copies doesn’t say where the copy market stands');
        if (await page.locator('[data-industry="copy-finder"]').count()) problems.push('Copies drew a finder with no copy market read');
      }
```

and in the industry case, above `// --- the end of the industry case`:

```js
    // --- Task 14B: the Copies section's finder, on the cloud's summary (stubbed), at the main's skills at the NPC site, then every
    // state of the cloud's read.
    {
      const SUM = { at: iso(now - 2 * 3600_000), days: 3.5, gapHours: 6, reads: 14, tried: iso(now - 2 * 3600_000 + 300_000), error: null,
        sold: [
          { typeId: 25895, me: 10, te: 20, runs: 40, contracts: 3, copies: 3, sellers: 1, perRun: 112500 },
          { typeId: 32306, me: 0, te: 0, runs: 1, contracts: 13, copies: 49, sellers: 6, perRun: 115e6 },
          { typeId: 37045, me: 10, te: 20, runs: 5, contracts: 4, copies: 4, sellers: 3, perRun: 1780000 },
          { typeId: 39581, me: 2, te: 4, runs: 10, contracts: 5, copies: 5, sellers: 2, perRun: 100000 },
        ],
        asks: { '37045|10|20|5': [1680000, 1690000, 4, 2] } };
      let copies = SUM;
      CLOUD['/v1/copies'] = (url, req, json) => (copies === 404 ? json({ error: 'Not found' }, 404) : json(copies));
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, industry: DOC, cloud: CLOUD_STATE }, { alts: altStore, cache: { prospects: SCAN } });
      await page.goto(`${BASE}#hustles/industry/copies`);
      await page.waitForSelector('[data-industry="copy-finder"] [data-kind="25895|10|20|40"]', { timeout: 30_000 })
        .catch(async () => problems.push(`the copy finder never priced the pump: “${(await text('[data-industry="copies"]')).slice(0, 400)}”`));
      const pumpRow = await text('[data-kind="25895|10|20|40"]');
      if (!pumpRow.includes('1 seller: one person’s prices')) problems.push(`the pump’s one seller isn’t said: “${pumpRow}”`);
      if (!/\d.* ISK/.test(await text('[data-kind="25895|10|20|40"] [data-industry="copy-isk"]'))) problems.push(`the pump row has no ISK a day: “${pumpRow}”`);
      if (!(await text('[data-kind="37045|10|20|5"]')).includes('median ask now, under what sold')) problems.push('the Standup’s price doesn’t say it’s the median ask, under what sold');
      const count = await text('[data-industry="copy-count"]');
      if (!count.includes('1 copy of blueprints NPCs don’t sell') || !count.includes('1 Tech II copy (made by invention')) problems.push(`the left-out kinds aren’t said: “${count}”`);
      if (!(await text('[data-industry="copy-state"]')).includes('Counting what sells: 3.5 days so far.')) problems.push('the days counted aren’t said');
      const tip = await page.locator('[data-industry="copy-cost"]').first().getAttribute('data-tip').catch(() => '');
      if (!tip?.includes('not yet checked against a copy job of yours')) problems.push(`the copy cost doesn’t say copying’s SCC isn’t checked yet: “${tip}”`);
      if (/\b0 ISK\b/.test(await text('[data-industry="copies"]'))) problems.push('the Copies section shows “0 ISK” for something not known');
      // The overflow is on the table's .tbl-scroll box, not the table (I1); on a phone the box may scroll, as every table's does.
      const fit = await sideways(page, '[data-industry="copies"] .tbl-scroll');
      if (!PHONE && fit && fit.over > 0) problems.push(`the copy finder scrolls sideways at 1,440 (${fit.over} px)`);
      if (SHOTS) { await page.waitForTimeout(900); await page.screenshot({ path: `${SHOTS}-industry-copies.png` }); }
      // Before any read compared two sets: the counting line alone, no count and no table (I3).
      copies = { ...SUM, days: 0, gapHours: 0, reads: 0, sold: [] };
      await page.reload();
      await page.waitForSelector('[data-industry="copy-state"]', { timeout: 20_000 }).catch(() => undefined);
      if (!(await text('[data-industry="copy-state"]')).includes('Counting what sells: it began with the cloud’s last read')) problems.push('the first read doesn’t say counting has begun');
      if (await page.locator('[data-industry="copy-finder"], [data-industry="copy-count"], [data-industry="copy-none"]').count()) problems.push('before a read counted, Copies draws a count, a table or “no copies sold”');
      if (/\b0 kinds sold/.test(await text('[data-industry="copies"]'))) problems.push('before a read counted, Copies says “0 kinds sold”');
      // Reads counted, nothing a player can copy sold: one line, never an empty table.
      copies = { ...SUM, sold: [SUM.sold[1]] };
      await page.reload();
      await page.waitForSelector('[data-industry="copy-none"]', { timeout: 20_000 }).catch(() => problems.push('with nothing copyable sold, Copies doesn’t say so in one line'));
      if (await page.locator('[data-industry="copy-finder"]').count()) problems.push('with nothing copyable sold, Copies still draws a table');
      for (const [answer, words] of [[null, 'The cloud hasn’t read the copy market yet'], [404, 'The cloud is a version behind'], [{ off: true }, 'reads of EVE Ref switched off']]) {
        copies = answer;
        await page.reload();
        await page.waitForSelector('[data-industry="copy-state"]', { timeout: 20_000 }).catch(() => undefined);
        if (!(await text('[data-industry="copy-state"]')).includes(words)) problems.push(`the copy market ${JSON.stringify(answer)} isn’t said as “${words}”: “${await text('[data-industry="copy-state"]')}”`);
      }
    }
```

(`sideways(page, sel)` is the case's own helper; on a phone the table folds (`.rd-table`), so it mustn't scroll at 390 either.
If it does at 1,440, narrow the columns as Orders did, never let it scroll.)

- [ ] **Step 8: Notes, the five checks, a look, commit**

- `docs/notes/industry.md`, Stage 3: the section and what a row is (corrections 7, 8, 9, 15, 16), and the readings' rule;
  `docs/notes/limits.md`: **A copy's ISK a day leaves out contract fees and competition**, and **its pace is the share of what
  sold, counted from vanishings**; **the copy cost rests on two readings not yet checked** (copying's SCC, EVE Ref's 4%; a cost
  rig multiplying the structure's bonus) until a job of yours settles them, which the section says.
- `.claude/rules/industry.md` `paths:` gains `src/lib/copyFinder.ts` and `src/components/hustles/IndustryCopies.tsx`.
- Run the five checks; `SHOTS=.playwright-mcp/industry3/14b npm run check-pages` and `PHONE=1 SHOTS=… npm run check-pages`,
  open `…-industry-copies.png` at both widths (no column cut off, the thin flag readable, no "0" for a missing figure).
- Commit: what the section is for, the pump's row as the evidence (`1,324,456 a day` on the 11 October fixture is the test's;
  the page case's figures are the stub's), and that the copy cost says it isn't checked until a real job is.


---
### Task 15A: Your copy contracts read and kept, and Your copy business

**Files:**
- Create: `src/lib/copyContracts.ts`
- Modify: `src/lib/contracts.ts` (`RawContract.availability`, `MyContract.availability`, `ContractItem.raw`, `itemsToRead`),
  `src/lib/sync.ts` (the contracts block; the final `update`), `src/lib/store.ts` (`Data.copyContracts`, the keys list, the
  sanitizer on load and import), `src/lib/cloudSync.ts` (`DOC_KEYS`), `src/lib/cloud.ts` (the pull's sanitizer),
  `worker/src/sync.ts` (`DOC_KEYS`), `src/lib/config.ts` (`SCOPE_INFO` for contracts), `src/components/hustles/IndustryCopies.tsx`
  (Your copy business), `scripts/check.mjs`, `scripts/check-worker.mjs`, `scripts/pages.mjs`, `.claude/rules/industry.md`,
  `docs/notes/industry.md`, `docs/notes/cloud.md`, `docs/notes/eve-facts.md`

**Interfaces:**
- Consumes: `readContracts`, `itemsToRead`, `type MyContract`, `type ContractItem` (`src/lib/contracts.ts`); `esi`
  (`src/lib/esi.ts`); `type CopySummary`, `copyKindKey` (Task 14A); `readWhy`, `blueprintKinds`, `jobPlaceSaid` (`industryOwned.ts`);
  `refusedDoc` (already handles any document); `useStationSaid` (`industryFinder.ts`).
- Produces (Tasks 15B and 15C rely on these exact names):
  - `src/lib/contracts.ts`: `RawContract.availability?: string`; `MyContract.availability: string | null`;
    `ContractItem.raw?: number | null` (ESI's `raw_quantity`; null when ESI gave none; absent on an item read before this stage).
  - `src/lib/copyContracts.ts`: `type ContractKind = [typeId, me, te, runs, count]`, `type CopyContract`,
    `type CopyContractsDoc = { list: CopyContract[] }`, `MAX_COPY_CONTRACTS` (5,000), `allCopies(items)`,
    `copyContractsOf(prev, list, items, kinds, me, readAt)`, `kindsToRead(doc, now, max?)`, `type PublicItem`, `readKinds(items)`,
    `type CopyState = 'listed' | 'expired' | 'sold' | 'deleted' | 'other'`, `copyState(c, now)`, `copiesSaid(copies, name)`,
    `sanitizeCopyContracts(v)`.
  - `Data.copyContracts?: CopyContractsDoc` (absent: not read; `{ list: [] }`: read, none).
  - `IndustryCopies.tsx`'s `CopyBusiness`, rendered outside the copy market's gate (I4), with the alt's line
    (`data-industry="copy-contracts-alt"`: an alt's contracts aren't read).

**The rules** (corrections 10 to 14). A copy contract is an item exchange you issued whose items, as your own contract items
read them, are all given and all copies (`raw` −2). The sync reads items for your outstanding item exchanges as well as the
finished ones it read before, and once more for one you issued whose items were read before `raw` was kept. Each copy
contract is kept in the document with ESI's status, price, availability, acceptor, completion and start station, its copies
by type, and its kinds: read once from ESI's public contract items while it's outstanding and public (at most 20 a sync), or
`private` (not public: never asked), or `gone` (no longer outstanding before they were read, or ESI answered with no copy).
A 404 while still outstanding is asked again next sync. One that leaves ESI's list (30 days) is stamped `gone` once with the
read's time, its last status kept, and never dropped (up to 5,000, newest kept). The document is written against live state
in the sync's final `update` (cloud.md: never a snapshot write) and only when it changed.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 14B's section:

```js
console.log('\n--- Industry stage 3: your copy contracts (copyContracts.ts, Task 15A) ---');
{
  const K = await import('../src/lib/copyContracts.ts');
  const { itemsToRead, readContracts } = await import('../src/lib/contracts.ts');
  const ME = 95210486;
  const raw = (contract_id, over = {}) => ({ contract_id, type: 'item_exchange', status: 'outstanding', issuer_id: ME, acceptor_id: 0, assignee_id: 0, price: 9e6, title: '',
    date_issued: '2026-10-01T00:00:00Z', date_expired: '2026-10-15T00:00:00Z', start_location_id: 60003760, for_corporation: false, availability: 'public', ...over });
  const list = readContracts([raw(501), raw(502, { availability: 'personal' }), raw(503, { status: 'finished', acceptor_id: 777, date_completed: '2026-10-02T00:00:00Z' }),
    raw(504), raw(505, { issuer_id: 1234 }), raw(506, { type: 'courier' })]);
  eq('ESI\'s availability is kept on a contract (null when an older list lacks it)', [list[0].availability, list[1].availability, readContracts([{ ...raw(9), availability: undefined }])[0].availability], ['public', 'personal', null]);
  const copy = (typeId, qty = 1) => ({ typeId, qty, included: true, raw: -2 });
  const items = { 501: [copy(25895, 2)], 502: [copy(25895)], 503: [copy(688)], 504: [{ typeId: 34, qty: 100, included: true, raw: null }], 505: [copy(25895)] };
  eq('items to read: your outstanding item exchanges and finished ones either side; not a courier, not someone else\'s outstanding one; once',
    itemsToRead(list, ME, {}), [501, 502, 503, 504]);
  eq('  read again once: an item exchange you issued whose items were read before raw_quantity was kept', [itemsToRead(list, ME, { ...items, 501: [{ typeId: 25895, qty: 2, included: true }] }), itemsToRead(list, ME, items)], [[501], []]);
  eq('a copy contract: every item given and a copy (raw −2)', [K.allCopies(items[501]), K.allCopies(items[504]), K.allCopies([copy(1), { ...copy(2), included: false }]), K.allCopies([]), K.allCopies(undefined)], [true, false, false, false, false]);
  const doc1 = K.copyContractsOf(undefined, list, items, {}, ME, '2026-10-02T12:00:00Z');
  eq('the document: your copy contracts only, by contract; a private one marked so (never asked); one finished before its kinds were read, gone',
    doc1.list.map((c) => [c.id, c.status, c.availability, c.copies, c.kinds ?? null, c.station, c.acceptor]),
    [[501, 'outstanding', 'public', [[25895, 2]], null, 60003760, null], [502, 'outstanding', 'personal', [[25895, 1]], 'private', 60003760, null], [503, 'finished', 'public', [[688, 1]], 'gone', 60003760, 777]]);
  eq('  kinds to read: an outstanding public one whose kinds aren\'t read', K.kindsToRead(doc1, Date.parse('2026-10-02T12:00:00Z')), [501]);
  // M8: an outstanding contract past its expiry isn't asked (a 404 there would be asked every sync until it's deleted): gone.
  const expired = K.copyContractsOf(undefined, readContracts([raw(511, { date_expired: '2026-10-01T12:00:00Z' })]), { 511: [copy(25895)] }, {}, ME, '2026-10-02T12:00:00Z');
  eq('  one past its expiry with its kinds unread: gone, never asked', [expired.list[0].kinds, K.kindsToRead(expired, Date.parse('2026-10-02T12:00:00Z')), K.kindsToRead(doc1, Date.parse('2026-10-16T00:00:00Z'))], ['gone', [], []]);
  const kinds = K.readKinds([
    { type_id: 25895, quantity: 1, is_included: true, is_blueprint_copy: true, material_efficiency: 10, time_efficiency: 20, runs: 40, item_id: 1, record_id: 1 },
    { type_id: 25895, quantity: 1, is_included: true, is_blueprint_copy: true, material_efficiency: 10, time_efficiency: 20, runs: 40, item_id: 2, record_id: 2 },
  ]);
  eq('ESI\'s public items read as kinds: [type, ME, TE, runs, copies]', kinds, [[25895, 10, 20, 40, 2]]);
  eq('  a 204 (no body) or no copy in the answer: gone', [K.readKinds(undefined), K.readKinds([{ type_id: 34, quantity: 5, is_included: true }])], ['gone', 'gone']);
  const list2 = list.map((c) => (c.id === 501 ? { ...c, status: 'finished', acceptor: 888, completed: '2026-10-03T00:00:00Z' } : c));
  const doc2 = K.copyContractsOf(doc1, list2, items, { 501: kinds }, ME, '2026-10-03T12:00:00Z');
  eq('  the next read: kinds read kept, the status followed', doc2.list.map((c) => [c.id, c.status, c.kinds]), [[501, 'finished', [[25895, 10, 20, 40, 2]]], [502, 'outstanding', 'private'], [503, 'finished', 'gone']]);
  // I6: kinds kept are never lost to a read that brings none, and the same read again is the same document (nothing to push).
  eq('  kinds kept through a read that brings none, while it\'s outstanding', K.copyContractsOf(doc2, list, items, {}, ME, '2026-10-04T12:00:00Z').list.find((c) => c.id === 501).kinds, [[25895, 10, 20, 40, 2]]);
  eq('  the read that made a document, again, gives that document', K.copyContractsOf(doc2, list2, items, {}, ME, '2026-10-04T12:00:00Z'), doc2);
  // M14: listed but its items not read this sync (past the 500 kept, waiting their turn): kept, its state followed, never gone.
  const unread = K.copyContractsOf(doc1, list2, { ...items, 501: undefined }, {}, ME, '2026-10-03T12:00:00Z').list.find((c) => c.id === 501);
  eq('  a contract still listed whose items weren\'t read this sync: kept with its copies, its status followed, not gone', [unread.status, unread.copies, unread.acceptor, unread.gone ?? null], ['finished', [[25895, 2]], 888, null]);
  const doc3 = K.copyContractsOf(doc2, list.filter((c) => c.id !== 503), items, {}, ME, '2026-11-05T12:00:00Z');
  const doc4 = K.copyContractsOf(doc3, list.filter((c) => c.id !== 503), items, {}, ME, '2026-11-06T12:00:00Z');
  eq('  past ESI\'s 30 days: kept with its last status, stamped gone once', [doc3.list.find((c) => c.id === 503), doc4.list.find((c) => c.id === 503).gone],
    [{ ...doc2.list.find((c) => c.id === 503), gone: '2026-11-05T12:00:00Z' }, '2026-11-05T12:00:00Z']);
  const now = Date.parse('2026-10-10T00:00:00Z');
  eq('a copy contract\'s state: listed, expired (outstanding past its expiry), sold, deleted, other', ['outstanding', 'outstanding', 'finished', 'deleted', 'rejected'].map((s, i) => K.copyState({ status: s, expires: i === 1 ? '2026-10-09T00:00:00Z' : '2026-10-15T00:00:00Z' }, now)),
    ['listed', 'expired', 'sold', 'deleted', 'other']);
  eq('what it holds, in words', K.copiesSaid([[25895, 2], [688, 1]], (t) => ({ 25895: 'Large Trimark Armor Pump I Blueprint', 688: 'Raven Blueprint' })[t]), '2× Large Trimark Armor Pump I Blueprint, 1× Raven Blueprint');
  eq('the sanitizer keeps a good document whole and drops a bad row', [K.sanitizeCopyContracts(doc4), K.sanitizeCopyContracts({ list: [{ id: 'x' }, ...doc4.list] }), K.sanitizeCopyContracts(null), K.sanitizeCopyContracts({ list: 3 })],
    [doc4, doc4, undefined, undefined]);
}
```

Add to `scripts/check-worker.mjs`, after "the blueprints doc goes up like any other":

```js
console.log('\n--- the copyContracts doc goes up like any other ---');
{
  const { push } = await import('../worker/src/sync.ts');
  const db = d1();
  const r = await push(db, MAIN, { records: [], docs: [{ key: 'copyContracts', d: { list: [] } }] });
  eq('  a push carrying it is taken, not refused as unknown', [r.docs, db.rows('SELECT key FROM docs WHERE char_id = ?', MAIN).map((x) => x.key)], [1, ['copyContracts']]);
}
```

(The same call the blueprints section just above makes: a document goes up as `{ key, d }`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check`. Expected: FAIL, `Cannot find module '…/src/lib/copyContracts.ts'` and the Worker's `Unknown document: copyContracts`.

- [ ] **Step 3: The contracts' new fields**

In `src/lib/contracts.ts`: `RawContract` gains `availability?: string` (ESI requires it; optional here for a list stored before);
`MyContract` gains `availability: string | null`, set in `readContracts` as `availability: c.availability ?? null`;
`ContractItem` becomes:

```ts
/** `raw`: ESI's raw_quantity (−2 a blueprint copy, −1 an original or another singleton); null when ESI gave none; absent on an item read before stage 3 of Industry. */
export type ContractItem = { typeId: number; qty: number; included: boolean; raw?: number | null };
```

and `itemsToRead`:

```ts
/**
 * Item exchanges whose items to ask ESI about: finished ones with you on one side, and your own outstanding ones (Industry's
 * copy contracts), not yet read; and, once, one you issued whose items were read before raw_quantity was kept.
 */
export function itemsToRead(list: MyContract[], me: number, known: Readonly<Record<number, ContractItem[] | undefined>>, max = 50): number[] {
  const finished = (c: MyContract) => c.status === 'finished' || c.status === 'finished_issuer' || c.status === 'finished_contractor';
  const wanted = (c: MyContract) => (finished(c) && (c.issuer === me || c.acceptor === me)) || (c.issuer === me && c.status === 'outstanding');
  const stale = (c: MyContract) => c.issuer === me && !!known[c.id]?.some((i) => i.raw === undefined);
  return list.filter((c) => c.type === 'item_exchange' && ((wanted(c) && !(c.id in known)) || stale(c))).slice(0, max).map((c) => c.id);
}
```

- [ ] **Step 4: The document's rules**

Create `src/lib/copyContracts.ts`:

```ts
/**
 * Your own copy contracts (docs/notes/industry.md, stage 3): every item exchange you issued whose items are all blueprint
 * copies, kept as a synced document of its own (correction 10): ESI lists a character's contracts only 30 days back and the
 * sync replaces meta.contracts' list each time, so a sale would drop out of Results after a month, and meta goes up every sync.
 * The main's only: the cloud reads no alt's contracts. Pure; browser only.
 */
import type { ContractItem, MyContract } from './contracts';

/** A kind of copy in one of your contracts, from ESI's public contract items: [type, ME, TE, runs a copy, copies]. */
export type ContractKind = [typeId: number, me: number, te: number, runs: number, count: number];
export type CopyContract = {
  id: number; issued: string; expires: string;
  /** ESI's status as last read (outstanding, finished, deleted…): kept when it leaves ESI's list. */
  status: string;
  price: number;
  availability: string | null;
  acceptor: number | null;
  completed: string | null;
  /** Where it was made: its copies go back there when it's deleted. */
  station: number | null;
  /** The copies given, by type: how many, from your own contract items. */
  copies: [typeId: number, count: number][];
  /** Their kinds from ESI's public items, or why not: `private` (not public), `gone` (no longer outstanding, or no copy in the answer, before they were read). Absent: not read yet. */
  kinds?: ContractKind[] | 'private' | 'gone';
  /** When a read of your contracts first didn't list it (ESI lists 30 days back). */
  gone?: string;
};
export type CopyContractsDoc = { list: CopyContract[] };
export const MAX_COPY_CONTRACTS = 5000;

/** Items that make a copy contract: at least one, every one given (nothing asked) and a copy (raw_quantity −2). */
export const allCopies = (items: readonly ContractItem[] | undefined): boolean => !!items?.length && items.every((i) => i.included && i.raw === -2);

/**
 * The document after a read of your contracts (`list`, `items` as the sync keeps them): every item exchange you issued whose
 * items are all copies, with the read's status, price, acceptor and completion; the kinds read this sync (`kinds`) where none
 * were kept; `private` for a contract that isn't public and `gone` for one no longer outstanding, neither ever asked; one no
 * longer listed stamped `gone` once with the read's time, its last status kept. Never drops one; sorted by contract.
 */
export function copyContractsOf(prev: CopyContractsDoc | undefined, list: readonly MyContract[], items: Readonly<Record<number, ContractItem[] | undefined>>,
  kinds: Readonly<Record<number, ContractKind[] | 'gone'>>, me: number, readAt: string): CopyContractsDoc {
  const now = Date.parse(readAt);
  const byId = new Map((prev?.list ?? []).map((c) => [c.id, c]));
  const listed = new Set<number>();
  for (const c of list) {
    if (c.type !== 'item_exchange' || c.issuer !== me) continue;
    const old = byId.get(c.id), its = items[c.id];
    if (!its) {
      // Listed, its items not read this sync (past the 500 kept, waiting their turn): one kept before stays, its state followed (M14).
      if (old) { const keep: CopyContract = { ...old, status: c.status, price: c.price, acceptor: c.acceptor > 0 ? c.acceptor : null, completed: c.completed }; delete keep.gone; byId.set(c.id, keep); listed.add(c.id); }
      continue;
    }
    if (!allCopies(its)) continue;
    listed.add(c.id);
    const copies = [...its.reduce((m, i) => m.set(i.typeId, (m.get(i.typeId) ?? 0) + i.qty), new Map<number, number>())].sort((a, b) => a[0] - b[0]) as [number, number][];
    const availability = c.availability ?? null;
    // Never asked: a private one, and one no longer outstanding or past its expiry (M8: a 404 there would be asked every sync).
    const k = old?.kinds ?? kinds[c.id] ?? (availability != null && availability !== 'public' ? 'private' : c.status !== 'outstanding' || Date.parse(c.expires) <= now ? 'gone' : undefined);
    byId.set(c.id, { id: c.id, issued: c.issued, expires: c.expires, status: c.status, price: c.price, availability, acceptor: c.acceptor > 0 ? c.acceptor : null,
      completed: c.completed, station: c.start, copies, ...(k ? { kinds: k } : {}) });
  }
  for (const [id, c] of byId) if (!listed.has(id) && !c.gone) byId.set(id, { ...c, gone: readAt });
  return { list: [...byId.values()].sort((a, b) => a.id - b.id).slice(-MAX_COPY_CONTRACTS) };
}

/** Your outstanding public copy contracts, not past their expiry, whose kinds aren't read yet: at most `max` a sync (correction 14). */
export const kindsToRead = (doc: CopyContractsDoc, now: number, max = 20): number[] =>
  doc.list.filter((c) => c.kinds === undefined && !c.gone && c.status === 'outstanding' && c.availability === 'public' && Date.parse(c.expires) > now).slice(0, max).map((c) => c.id);

/** ESI's public contract item (`/contracts/public/items/{id}/`, no login), as read on 11 October 2026. */
export type PublicItem = { type_id: number; quantity: number; is_included: boolean; is_blueprint_copy?: boolean; material_efficiency?: number; time_efficiency?: number; runs?: number; item_id?: number; record_id?: number };
/** A contract's copies by kind; `gone` for a 204 (no body: expired or accepted) or an answer with no copy in it. */
export function readKinds(items: readonly PublicItem[] | undefined | null): ContractKind[] | 'gone' {
  const copies = (items ?? []).filter((i) => i.is_included && i.is_blueprint_copy && (i.runs ?? 0) > 0);
  if (!copies.length) return 'gone';
  const m = new Map<string, ContractKind>();
  for (const i of copies) {
    const me = i.material_efficiency ?? 0, te = i.time_efficiency ?? 0, key = `${i.type_id}|${me}|${te}|${i.runs}`;
    const k = m.get(key);
    if (k) k[4] += i.quantity; else m.set(key, [i.type_id, me, te, i.runs!, i.quantity]);
  }
  return [...m.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
}

export type CopyState = 'listed' | 'expired' | 'sold' | 'deleted' | 'other';
/** ESI has no expired status: an outstanding contract past its expiry is expired, its copies in it until deleted (correction 12). */
export function copyState(c: Pick<CopyContract, 'status' | 'expires'>, now: number): CopyState {
  if (c.status === 'outstanding') return Date.parse(c.expires) <= now ? 'expired' : 'listed';
  if (c.status === 'finished' || c.status === 'finished_issuer' || c.status === 'finished_contractor') return 'sold';
  return c.status === 'deleted' ? 'deleted' : 'other';
}

/** What a contract holds, in words: "2× Large Trimark Armor Pump I Blueprint, 1× Raven Blueprint" (three, then "and N more"). */
export function copiesSaid(copies: readonly [number, number][], name: (typeId: number) => string, max = 3): string {
  const parts = copies.slice(0, max).map(([t, n]) => `${n.toLocaleString('en-US')}× ${name(t)}`);
  return copies.length > max ? `${parts.join(', ')} and ${copies.length - max} more` : parts.join(', ');
}

/** On disk and on a pull: a row that isn't one is dropped, the rest kept as written. */
export function sanitizeCopyContracts(v: unknown): CopyContractsDoc | undefined {
  if (!v || typeof v !== 'object' || !Array.isArray((v as { list?: unknown }).list)) return undefined;
  const list: CopyContract[] = [];
  for (const x of (v as { list: unknown[] }).list) {
    const c = (x ?? {}) as Partial<CopyContract>;
    if (!Number.isInteger(c.id) || typeof c.issued !== 'string' || typeof c.expires !== 'string' || typeof c.status !== 'string' || typeof c.price !== 'number' || !Array.isArray(c.copies)) continue;
    const copies = c.copies.filter((p): p is [number, number] => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[1] > 0);
    const kinds = c.kinds === 'private' || c.kinds === 'gone' ? c.kinds
      : Array.isArray(c.kinds) ? c.kinds.filter((k): k is ContractKind => Array.isArray(k) && k.length === 5 && k.every((n) => Number.isFinite(n))) : undefined;
    list.push({ id: c.id!, issued: c.issued, expires: c.expires, status: c.status, price: c.price, availability: typeof c.availability === 'string' ? c.availability : null,
      acceptor: Number.isInteger(c.acceptor) ? c.acceptor! : null, completed: typeof c.completed === 'string' ? c.completed : null, station: Number.isInteger(c.station) ? c.station! : null,
      copies, ...(kinds !== undefined ? { kinds } : {}), ...(typeof c.gone === 'string' ? { gone: c.gone } : {}) });
  }
  return { list: list.sort((a, b) => a.id - b.id).slice(-MAX_COPY_CONTRACTS) };
}
```

- [ ] **Step 5: The sync, the store and the Worker**

In `src/lib/sync.ts`'s contracts block: the items read keeps `raw` (`esi<{ type_id: number; quantity: number; is_included: boolean;
raw_quantity?: number }[]>`, `raw: i.raw_quantity ?? null`); after `keepIds`, read the kinds and hold the read for the final
update (`let copyRead: { list: MyContract[]; items: Record<number, ContractItem[]>; kinds: Record<number, ContractKind[] | 'gone'>; at: string } | null = null;`
declared beside `metaPatch`):

```ts
        // Your copy contracts (Industry, stage 3): each public outstanding one's kinds read once from ESI's public contract
        // items (no login; at most 20 a sync). A 404 is a contract ESI's public list doesn't show yet: asked again next sync.
        const readAt = new Date().toISOString();
        const draft = copyContractsOf(getData().copyContracts, list, items, {}, cid, readAt);
        const kinds: Record<number, ContractKind[] | 'gone'> = {};
        for (const id of kindsToRead(draft, Date.now())) {
          try { kinds[id] = readKinds((await esi<PublicItem[] | undefined>(`/contracts/public/items/${id}/`)).data); } catch { /* asked again next sync */ }
        }
        copyRead = { list, items, kinds, at: readAt };
        // Their blueprints' names, looked up with the rest (I2): To do and the section never say "Item #…".
        copyTypes = [...new Set(draft.list.flatMap((x) => x.copies.map(([t]) => t)))];
```

(`let copyTypes: number[] = [];` beside `copyRead`.) The names lookup further down takes them in: `allTypeIds` gains
`...copyTypes`, so a copy contract's blueprint is in `fetched.names` (and `d.names`) like any traded type; nothing else writes
`fetched.names`. And add each expired copy contract's station to `dests` (so `places` names where its copies go back): stations
as now, by `resolveNames`. In the final `update((cur) => …)`, after the blueprints:

```ts
      // Your copy contracts, merged onto what the store holds now (a pull may have brought another device's meanwhile): written only when they changed.
      if (copyRead) {
        const next = copyContractsOf(cur.copyContracts, copyRead.list, copyRead.items, copyRead.kinds, cid, copyRead.at);
        if (JSON.stringify(next) !== JSON.stringify(cur.copyContracts ?? null)) p.copyContracts = next;
      }
```

Imports: `copyContractsOf, kindsToRead, readKinds, type ContractKind, type PublicItem` from `./copyContracts`; `type MyContract`
from `./contracts`. In `src/lib/store.ts`: `Data` gains `/** Your copy contracts as last read (copyContracts.ts). Absent: not read yet. */ copyContracts?: CopyContractsDoc;`,
the keys list gains `'copyContracts'` after `'blueprints'`, and both places that sanitize `blueprints` sanitize it too
(`data.copyContracts = sanitizeCopyContracts(data.copyContracts);` on load; `if (p.copyContracts !== undefined) p.copyContracts =
sanitizeCopyContracts(p.copyContracts);` on import). `src/lib/cloud.ts`'s pull: the same line beside `p.blueprints`.
`src/lib/cloudSync.ts` `DOC_KEYS` and `worker/src/sync.ts` `DOC_KEYS` gain `'copyContracts'` (a Worker a version behind refuses
it and `refusedDoc` holds it back; an older browser ignores it). `src/lib/config.ts`, the contracts permission's `unlocks`, adds
"; Industry's Copies section lists the copy contracts you issued, with what each holds and whether it sold".

- [ ] **Step 6: Your copy business**

In `IndustryCopies.tsx`, after the finder's gated block and outside it, unconditionally (I4: copy jobs, copies held and your copy
contracts come from the sync and the cloud's reads of your characters, not from the copy market, so they show with the cloud
off, a version behind, before its first read or with skills unread), just before `</section>`:

```tsx
      <CopyBusiness c={c} ix={ix} graph={graph} summary={summary} />
```

and add:

```tsx
/**
 * Your copy business (spec): the shown character's copy jobs and copies held, and the main's own copy contracts with their state
 * and the cheapest ask of their kind now. An alt's contracts aren't read: said, never "none".
 */
function CopyBusiness({ c, ix, graph, summary }: { c: IndustryChar; ix: Indexed; graph: Graph; summary: CopySummary | null }) {
  const d = useData();
  const now = useNow(60_000);
  const jobs = c.jobs.state === 'read' ? c.jobs.value.filter((j) => j.activity === 5) : null;
  const doc = c.isMain ? d.copyContracts : undefined;
  // Names the bundle lacks (copies of faction or exploration blueprints) are asked of ESI, "…" while they're read (IndustryOwned's way).
  const looking = useEnsureNames([...new Set([...(jobs ?? []).map((j) => j.blueprintTypeId), ...(doc?.list ?? []).flatMap((x) => x.copies.map(([t]) => t))])].filter((t) => !ix.b.types[t]));
  const name = (t: number) => ix.b.types[t]?.[0] ?? d.names[t] ?? (looking ? '…' : `Item #${t}`);
  const running = (jobs ?? []).filter((j) => j.status === 'active' || j.status === 'paused' || j.status === 'ready').sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
  const done = (jobs ?? []).filter((j) => (j.status === 'delivered' || j.status === 'cancelled' || j.status === 'reverted') && now - Date.parse(j.completed ?? j.end) <= 30 * 86_400_000)
    .sort((a, b) => Date.parse(b.completed ?? b.end) - Date.parse(a.completed ?? a.end));
  const held = c.blueprints.state === 'read' ? blueprintKinds([{ charId: c.charId, name: c.name, owned: c.blueprints.value }]).filter((k) => k.copy) : null;
  // Stations only: /universe/names refuses a batch holding a structure's ID, and a job's structure is named by jobPlaceSaid (M11).
  const station = useStationSaid([...new Set((jobs ?? []).map((j) => j.stationId).filter(isStationId))], ix, graph);
  const place = (j: JobRecord) => jobPlaceSaid(j, { names: c.places, jobPlaces: c.jobPlaces, station, system: (id) => graph[id]?.[1] ?? null });
  const tile = useTileFilter<'listed' | 'expired' | 'sold'>('copy-contracts');
  const TILE_SAID = { listed: 'Listed', expired: 'Expired', sold: 'Sold, 30 days' } as const;
  const contracts = (doc?.list ?? []).map((x) => ({ x, st: copyState(x, now) }))
    .filter(({ x, st }) => st === 'listed' || st === 'expired' || now - Date.parse(x.completed ?? x.issued) <= 30 * 86_400_000)
    .sort((a, b) => b.x.id - a.x.id);
  const count = (s: 'listed' | 'expired' | 'sold') => contracts.filter((r) => r.st === s).length;
  const shown = tileRows(contracts, tile.on, (r, k) => r.st === k);
  const kindSaid = (x: CopyContract) => (Array.isArray(x.kinds) ? x.kinds.map((k) => `${k[4]}× ME ${k[1]} / TE ${k[2]}, ${k[3]} run${k[3] === 1 ? '' : 's'}`).join('; ')
    : x.kinds === 'private' ? 'kinds not known: a private contract isn’t public'
      : x.kinds === 'gone' ? 'kinds not known: it left the public list before they were read'
        : 'kinds are read with the next sync');
  const askSaid = (x: CopyContract) => {
    if (!Array.isArray(x.kinds) || x.kinds.length !== 1 || !summary) return null;
    const k = x.kinds[0], a = summary.asks[copyKindKey({ typeId: k[0], me: k[1], te: k[2], runs: k[3] })];
    const mine = x.price / (k[4] * k[3]);
    return a ? `${iskBig(mine)} a run; others’ cheapest ${iskBig(a[0])} (${units(a[2])} listed)${mine > a[0] ? ': undercut' : ''}` : `${iskBig(mine)} a run; nobody else lists this kind now`;
  };
  const stateSaid = (x: CopyContract, st: CopyState) => st === 'listed' ? `Listed until ${fmtDate(x.expires)}`
    : st === 'expired' ? `Expired ${fmtDate(x.expires)}: delete it in game to get the copies back`
      : st === 'sold' ? `Sold ${x.completed ? fmtDate(x.completed) : ''}`.trim()
        : st === 'deleted' ? 'Deleted' : x.status.replace(/_/g, ' ');
  // ESI lists contracts only 30 days back (M7): one that left it while outstanding may still hold its copies.
  const goneSaid = (x: CopyContract) => (!x.gone ? '' : x.status === 'outstanding' ? '. No longer in your contracts: ESI lists them only 30 days back, so if you didn’t delete it in game, its copies are still in it' : ' (past ESI’s 30 days)');

  return (
    <div className="col" style={{ gap: 10 }} data-industry="copy-business">
      <span className="lbl">Your copy business</span>
      <span className="lbl small">Copy jobs</span>
      {jobs == null ? <p className="note small" style={{ margin: 0 }}>{readWhy(c, c.jobs, 'jobs')}</p>
        : !running.length && !done.length ? <p className="note small" style={{ margin: 0 }}>No copy jobs running, or finished in the last 30 days.</p>
          : (
            <div className="tbl-scroll"><table className="tbl compact rd-table" data-industry="copy-jobs">
              <thead><tr><Th left>Blueprint</Th><Th className="rd-wide">Copies</Th><Th className="rd-wide">Where</Th><Th>State</Th><Th className="rd-wide" tip="What EVE charged for the job (ESI’s cost).">Cost</Th></tr></thead>
              <tbody>{[...running, ...done].map((j) => (
                <tr key={j.jobId}>
                  <td className="l rd-main">{name(j.blueprintTypeId)}<div className="rd-phone note small">{`${units(j.runs)} × ${j.licensedRuns != null ? units(j.licensedRuns) : '?'} runs · ${place(j)}`}</div></td>
                  <td className="rd-wide">{`${units(j.runs)} × ${j.licensedRuns != null ? units(j.licensedRuns) : '?'} runs`}</td>
                  <td className="rd-wide">{place(j)}</td>
                  <td>{jobWaiting(j, now) ? 'Ready to deliver' : j.status === 'active' || j.status === 'paused' ? `Done ${until(j.end, now) ?? 'any moment now'}` : `${j.status.charAt(0).toUpperCase()}${j.status.slice(1)} ${fmtDate(j.completed ?? j.end)}`}</td>
                  <td className="rd-wide">{j.cost != null ? iskBig(j.cost) : '–'}</td>
                </tr>))}</tbody>
            </table></div>
          )}
      <span className="lbl small">Copies held</span>
      {held == null ? <p className="note small" style={{ margin: 0 }}>{readWhy(c, c.blueprints, 'blueprints')}</p>
        : !held.length ? <p className="note small" style={{ margin: 0 }}>{c.isMain ? 'You hold' : `${c.name} holds`} no copies.</p>
          : (
            <div className="col" style={{ gap: 4 }} data-industry="copies-held">{held.map((k) => (
              <div key={k.key}>{`${units(k.count)}× ${name(k.typeId)} · ME ${k.me} / TE ${k.te} · ${k.runs != null ? `${units(k.runs)} runs` : 'runs –'}`}
                {c.isMain && <> · <button type="button" className="link-btn" onClick={() => navigate(`blueprints?type=${k.typeId}`)}>Price for selling</button></>}</div>))}</div>
          )}
      <span className="lbl small">Your copy contracts</span>
      {!c.isMain ? <p className="note small" data-industry="copy-contracts-alt" style={{ margin: 0 }}>{`${c.name}’s contracts aren’t read: the cloud reads an alt’s wallet, orders and assets, not its contracts.`}</p>
        : !doc ? <p className="note small" style={{ margin: 0 }}>{hasScope(SCOPE.contracts) ? 'Not read yet: your contracts come with the next sync.' : 'Log in again: this login wasn’t given EVE’s permission to read your contracts.'}</p>
          : !contracts.length ? <p className="note small" style={{ margin: 0 }}>No copy contracts listed, expired, or finished in the last 30 days.</p>
            : (
              <>
                <Tiles min={150} items={[
                  { l: 'Listed', v: units(count('listed')), press: tile.press('listed', count('listed')) },
                  { l: 'Expired', v: units(count('expired')), c: count('expired') ? 'var(--acc2)' : undefined, tip: 'Past their expiry: the copies stay in them until you delete the contract in game.', press: tile.press('expired', count('expired')) },
                  { l: 'Sold, 30 days', v: units(count('sold')), press: tile.press('sold', count('sold')) },
                ]} />
                {tile.on && <TileShowing shown={shown.length} of={contracts.length} what={TILE_SAID[tile.on]} onClear={() => tile.setOn(null)} />}
                <div className="tbl-scroll" id="copy-contracts"><table className="tbl compact rd-table" data-industry="copy-contracts">
                  <thead><tr><Th left>Copies</Th><Th className="rd-wide">Kinds</Th><Th>Price</Th><Th left>State</Th></tr></thead>
                  <tbody>{shown.map(({ x, st }) => (
                    <tr key={x.id} data-contract={x.id}>
                      <td className="l rd-main">{copiesSaid(x.copies, name)}<div className="rd-phone note small">{kindSaid(x)}</div></td>
                      <td className="rd-wide">{kindSaid(x)}</td>
                      <td><div>{iskBig(x.price)}</div>{askSaid(x) && <div className="note small">{askSaid(x)}</div>}</td>
                      <td className="l">{stateSaid(x, st)}{goneSaid(x)}</td>
                    </tr>))}</tbody>
                </table></div>
              </>
            )}
    </div>
  );
}
```

(Imports to add: `useData` from `../../lib/store`; `until` from `../../lib/format`; `hasScope` from `../../lib/auth`; `SCOPE` from
`../../lib/config`; `navigate` from `../../lib/hooks` (Price for selling is stage 2's button, M19); `useEnsureNames` from
`../common`; `copiesSaid, copyState, type CopyContract, type CopyState` from `../../lib/copyContracts`; `type CopySummary`
from `../../lib/copyMarket`; `blueprintKinds, jobPlaceSaid, readWhy` from `../../lib/industryOwned`; `isStationId, type JobRecord`
from `../../lib/industryTrack`; `jobWaiting` from `../../lib/todo`; `Tiles, TileShowing, useTileFilter` from `../ui` and `tileRows` from
`../../lib/tileFilter`. Read `TileShowing`'s and `tileRows`' exact signatures first (`ui.tsx:115`, `lib/tileFilter.ts`) and match
them: `tileRows(rows, on, (row, k) => boolean)`.)

- [ ] **Step 7: The page check**

In the industry case, above `// --- the end of the industry case`:

```js
    // --- Task 15A: Your copy business, from a seeded document, then the sync reading your contracts with ESI stubbed: your
    // outstanding public copy contract's kinds read once (and not again next sync), a private one's never asked, a 404 asked again.
    {
      const MAIN_ID = ownerAuth().characterId;
      const cc = (id, over) => ({ id, issued: iso(now - 5 * 86400_000), expires: iso(now + 9 * 86400_000), status: 'outstanding', price: 9e6, availability: 'public', acceptor: null, completed: null, station: 60003760, copies: [[25895, 2]], ...over });
      const copyContracts = { list: [
        cc(601, { kinds: [[25895, 10, 20, 40, 2]] }),
        cc(602, { expires: iso(now - 86400_000) }),
        cc(603, { status: 'finished', acceptor: 777, completed: iso(now - 2 * 86400_000), kinds: 'gone' }),
        cc(604, { availability: 'personal', kinds: 'private' }),
      ] };
      const copyJob = { jobId: 9701, activity: 5, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25895, runs: 2, licensedRuns: 40, successfulRuns: null, probability: null, cost: 283177.85,
        facilityId: 60001483, stationId: 60001483, outputId: 60001483, start: iso(now - 3600_000), end: iso(now + 5 * 3600_000), completed: null, status: 'active', perRun: null, seenAt: iso(now - 3000_000) };
      CLOUD['/v1/copies'] = (url, req, json) => json({ at: iso(now - 3600_000), days: 7, gapHours: 6, reads: 28, tried: iso(now - 3000_000), error: null, sold: [], asks: { '25895|10|20|40': [100000, 112500, 6, 3] } });
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, industry: DOC, cloud: CLOUD_STATE, jobs: { 9701: copyJob }, meta: { ...ledger.meta, jobsRead: true, contracts: { at: iso(now - 600_000), list: [], items: {}, places: {} } }, copyContracts }, { alts: altStore });
      await page.goto(`${BASE}#hustles/industry/copies`);
      await page.waitForSelector('[data-industry="copy-contracts"]', { timeout: 30_000 }).catch(async () => problems.push(`Your copy contracts never drew: “${(await text('[data-industry="copy-business"]')).slice(0, 400)}”`));
      const biz = await text('[data-industry="copy-business"]');
      for (const want of ['2 × 40 runs', 'Listed until', 'others’ cheapest 100,000 ISK (6 listed): undercut', 'kinds not known: a private contract isn’t public', 'kinds not known: it left the public list before they were read'])
        if (!biz.includes(want)) problems.push(`Your copy business doesn’t say “${want}”: “${biz.slice(0, 500)}”`);
      // The rows' own words, not the tiles' labels (M17): a date after each.
      const rowsText = await text('[data-industry="copy-contracts"]');
      if (!/Expired \d{1,2} [A-Z][a-z]{2} \d{4}: delete it in game to get the copies back/.test(rowsText)) problems.push(`the expired contract’s row doesn’t say when and what to do: “${rowsText.slice(0, 300)}”`);
      if (!/Sold \d{1,2} [A-Z][a-z]{2} \d{4}/.test(rowsText)) problems.push(`the sold contract’s row doesn’t say when: “${rowsText.slice(0, 300)}”`);
      await page.locator('[data-industry="copy-business"] .tile', { hasText: 'Expired' }).click().catch(() => problems.push('the Expired tile can’t be pressed'));
      if ((await page.locator('[data-industry="copy-contracts"] tbody tr').count()) !== 1) problems.push('pressing Expired doesn’t filter the table to the expired contract');
      // I4: with the cloud a version behind (no copy market at all), Your copy business still shows: it is the sync's, not the cloud's.
      CLOUD['/v1/copies'] = (url, req, json) => json({ error: 'Not found' }, 404);
      await page.reload();
      await page.waitForSelector('[data-industry="copy-contracts"]', { timeout: 20_000 }).catch(() => problems.push('with the cloud a version behind, Your copy business is gone'));
      if ((await page.locator('[data-industry="copy-contracts"] tbody tr').count()) < 4) problems.push('with the cloud a version behind, Your copy contracts doesn’t list the four contracts');
      if (!(await text('[data-industry="copy-state"]')).includes('The cloud is a version behind')) problems.push('with the cloud a version behind, Copies doesn’t say so');
      await showFor('Builder Alt');
      if (!(await text('[data-industry="copy-contracts-alt"]')).includes('Builder Alt’s contracts aren’t read')) problems.push('under an alt, Your copy contracts doesn’t say its contracts aren’t read');
      if (SHOTS) { await page.waitForTimeout(900); await page.screenshot({ path: `${SHOTS}-industry-copy-business.png` }); }

      // The sync: scopes with contracts; ESI answers for your contracts, their items and the public items.
      const asked = [];
      const C = (contract_id, over = {}) => ({ contract_id, type: 'item_exchange', status: 'outstanding', issuer_id: MAIN_ID, issuer_corporation_id: 1, acceptor_id: 0, assignee_id: 0, price: 5e6, title: '', for_corporation: false,
        availability: 'public', date_issued: iso(now - 86400_000), date_expired: iso(now + 13 * 86400_000), start_location_id: 60003760, end_location_id: 60003760, ...over });
      ESI[`/characters/${MAIN_ID}/contracts/`] = (url, req, json) => (asked.push(url.pathname), json([C(701), C(702, { availability: 'personal' }), C(703, { status: 'finished', acceptor_id: 777, date_completed: iso(now - 3600_000) }), C(704), C(705)]));
      for (const id of [701, 702, 703, 705]) ESI[`/characters/${MAIN_ID}/contracts/${id}/items/`] = (url, req, json) => (asked.push(url.pathname), json([{ record_id: 1, type_id: 25895, quantity: 1, is_singleton: true, raw_quantity: -2, is_included: true }]));
      ESI[`/characters/${MAIN_ID}/contracts/704/items/`] = (url, req, json) => (asked.push(url.pathname), json([{ record_id: 1, type_id: 34, quantity: 100, is_singleton: false, is_included: true }]));
      ESI['/contracts/public/items/701/'] = (url, req, json) => (asked.push(url.pathname), json([{ record_id: 1, item_id: 1, type_id: 25895, quantity: 1, is_included: true, is_blueprint_copy: true, material_efficiency: 10, time_efficiency: 20, runs: 40 }]));
      ESI['/contracts/public/items/705/'] = (url, req, json) => (asked.push(url.pathname), json({ error: 'Contract not found' }, 404));
      const storedCC = () => page.evaluate(() => new Promise((res) => { const q = indexedDB.open('jita-ledger'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('copyContracts'); g.onsuccess = () => res(g.result ?? null); }; }));
      // One sync started by the button, waited for on what it asks (never on a pause), then until its button is back.
      const syncOnce = async () => {
        await page.waitForSelector('.sync-btn:not([disabled])', { timeout: 30_000 }).catch(() => problems.push('the sync never went idle'));
        const n = asked.length;
        await page.locator('.sync-btn:not([disabled])').click().catch(() => undefined);
        for (let i = 0; i < 200 && !asked.slice(n).some((x) => x.endsWith('/contracts/')); i++) await page.waitForTimeout(100);
        await page.waitForSelector('.sync-btn:not([disabled])', { timeout: 30_000 }).catch(() => problems.push('the sync never finished'));
      };
      await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('jita-ledger:auth')); a.scopes = ['esi-contracts.read_character_contracts.v1']; localStorage.setItem('jita-ledger:auth', JSON.stringify(a)); });
      await page.reload();
      await page.waitForSelector('.page', { timeout: 20_000 });
      await syncOnce();
      let got = await storedCC();
      for (let i = 0; i < 40 && !got?.list?.some((x) => x.id === 701 && Array.isArray(x.kinds)); i++) { await page.waitForTimeout(250); got = await storedCC(); }
      const by = (id) => got?.list?.find((x) => x.id === id);
      if (!Array.isArray(by(701)?.kinds) || by(701).kinds[0][3] !== 40) problems.push(`701’s kinds weren’t read from ESI’s public items: ${JSON.stringify(by(701))}`);
      if (by(702)?.kinds !== 'private' || asked.includes('/contracts/public/items/702/')) problems.push('a private contract was asked of the public route, or not marked private');
      if (by(703)?.kinds !== 'gone' || asked.includes('/contracts/public/items/703/')) problems.push('a contract finished before its kinds were read was asked, or not marked gone');
      if (by(704)) problems.push('an item exchange of Tritanium was kept as a copy contract');
      if (by(705)?.kinds !== undefined) problems.push('a 404 from the public route was kept as an answer');
      asked.length = 0;
      await syncOnce();
      await page.waitForTimeout(500);
      if (asked.includes('/contracts/public/items/701/')) problems.push('701’s kinds were asked for again on the next sync');
      if (!asked.includes('/contracts/public/items/705/')) problems.push('705’s 404 wasn’t asked again on the next sync');
      for (const k of Object.keys(ESI)) if (k.includes('/contracts/')) delete ESI[k];
    }
```

(If the sync isn't started by the button in this case's setup, mirror stage 2's block above it, which reloads and waits for the
sync's own run: `idle()` then compare stored values. `showFor` and `ownerAuth` are the case's helpers.)

- [ ] **Step 8: Run everything, plant each rule wrong, notes, commit**

Run the five checks. Plant and see fail: `allCopies` without `i.included &&` (the asked-for item test); `itemsToRead`'s `stale`
removed (the re-read test); `copyContractsOf` without the `gone` stamp (the 30-days test); `old?.kinds ??` removed (the kept-kinds
and the same-read tests, I6); the `'private'` branch of `copyContractsOf`'s kinds removed (the document test: 502's kinds
unread; `kindsToRead`'s own `availability` clause can't fail any test, since nothing reaches it that isn't public, and stays as a
guard); the `!its` branch removed (the M14 test: 501 stamped gone); the expiry clauses removed (the M8 test asks the expired
contract); `<CopyBusiness>` moved inside the summary's gate (the page check's 404 case).

Notes: `docs/notes/industry.md` (the document and its rules, corrections 10 to 14, the measured public-items shapes);
`docs/notes/cloud.md` (the `copyContracts` document: changes only with a copy contract, through `refusedDoc`);
`docs/notes/eve-facts.md` (ESI's public contract items: shape, an hour's cache, 404 "Contract not found" for an unknown one, a
just-expired one still answering 200 from cache; a character's contracts carry `availability`; their items' `raw_quantity` −2 is
a copy); `.claude/rules/industry.md` `paths:` gains `src/lib/copyContracts.ts`. Commit, saying why the document is its own (a
month's sale must stay in Results) and what the page case proved (701's kinds read once, 702 never asked, 705 asked again).


---
### Task 15B: Copies you made and sold count in the Industry activity

**Files:**
- Modify: `src/lib/copyContracts.ts` (`CONTRACT_FEE_REFS`, `type CopySales`, `copySales`), `src/lib/income.ts` (Industry's events,
  `IndustryActs.copiesNotMade`, `industrySaid`, `ACTIVITY_WHAT.Industry`), `src/components/activityEvents.ts` (the memo's deps
  gain `d.copyContracts`), `scripts/check.mjs`, `scripts/pages.mjs`, `scripts/income-golden.json` (only if a figure or word
  moves: see below), `docs/notes/industry.md`, `docs/notes/positions-results.md`, `docs/notes/limits.md`

**Interfaces:**
- Consumes: `type CopyContractsDoc`, `copyState` (Task 15A); `type JobRecord` (`industryTrack.ts`); `activityEvents`'s
  `industryJobs`, `inp.journal` (netted), `mine` (`income.ts`).
- Produces: `CONTRACT_FEE_REFS` (`contract_brokers_fee`, `contract_sales_tax`), `type CopySales = { events: { t: number; isk:
  number }[]; notMade: { contractId: number; copies: number }[]; toOwn: number[] }`, `copySales(o)`; `IndustryActs.copiesNotMade?:
  number`, `IndustryActs.copiesToOwn?: number`.

**The rule** (correction 1). Industry already charges every job's fee at its start, copying included (stage 2, correction 11).
Copy sales add:
- for each copy contract that sold (finished), not to one of your own characters (`mine`; one to an alt is a transfer, counted
  nowhere and claiming nothing): its price, from the journal's `contract_price` entries naming it when there are any (their
  time), else the contract's price at its completion, times the share of its copies your delivered copy jobs made;
- a contract's copies are claimed, in the order contracts were issued, from the copies your delivered copy jobs of that
  blueprint made (`runs`, or `successfulRuns`) and had delivered before the contract was issued, each copy once; copies none
  made (bought, given, from before the records) are counted apart and said, never counted;
- the contract fees the journal names for a copy contract (`contract_brokers_fee`, `contract_sales_tax` by `contract_id`), in
  full at their time, when you'd copied one of its blueprints before you listed it: a listing fee is paid whether or not it sells.

Nothing here touches market trades, so the claims, `everyItemCalcs` and "Sold, never bought" are unchanged; a copy contract's
price was counted in no activity before (Results' `attribute` gives `contract_price` none; the Wallet's money in files it under
Contracts and still does).

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 15A's section:

```js
console.log('\n--- Industry stage 3: copies sold count in Industry (copySales, Task 15B) ---');
{
  const K = await import('../src/lib/copyContracts.ts');
  const N = await import('../src/lib/income.ts');
  const { emptyData } = await import('../src/lib/emptyData.ts');
  const ME = 95210486, ALT = 900001;
  const job = (jobId, runs, completed, typeId = 25895, status = 'delivered') => ({ jobId, activity: 5, blueprintId: 7001, blueprintTypeId: typeId, productTypeId: typeId, runs, licensedRuns: 40, successfulRuns: null, probability: null,
    cost: 283177.85, facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: '2026-09-30T00:00:00Z', end: completed, completed, status, perRun: null, seenAt: completed });
  // Two copy jobs of the pump: 3 copies delivered 1 October, 2 on 5 October.
  const jobs = [job(1, 3, '2026-10-01T00:00:00Z'), job(2, 2, '2026-10-05T00:00:00Z')];
  const cc = (id, issued, copies, status, over = {}) => ({ id, issued, expires: '2026-10-30T00:00:00Z', status, price: 0, availability: 'public', acceptor: null, completed: null, station: 60003760, copies, ...over });
  const doc = { list: [
    cc(11, '2026-10-02T00:00:00Z', [[25895, 2]], 'finished', { price: 9e6, acceptor: 500, completed: '2026-10-03T00:00:00Z' }),
    cc(12, '2026-10-04T00:00:00Z', [[25895, 3]], 'finished', { price: 12e6, acceptor: 501, completed: '2026-10-06T00:00:00Z' }),
    cc(13, '2026-10-07T00:00:00Z', [[688, 1]], 'finished', { price: 1e6, acceptor: 502, completed: '2026-10-08T00:00:00Z' }),
    cc(14, '2026-10-07T00:00:00Z', [[25895, 2]], 'finished', { price: 8e6, acceptor: ALT, completed: '2026-10-08T00:00:00Z' }),
    cc(15, '2026-10-08T00:00:00Z', [[25895, 1]], 'deleted', { price: 5e6 }),
  ] };
  const journal = [
    { date: '2026-10-03T00:10:00Z', refType: 'contract_price', amount: 9e6, contextId: 11, contextIdType: 'contract_id' },
    { date: '2026-10-02T00:00:01Z', refType: 'contract_brokers_fee', amount: -50000, contextId: 11, contextIdType: 'contract_id' },
    { date: '2026-10-07T00:00:01Z', refType: 'contract_brokers_fee', amount: -20000, contextId: 13, contextIdType: 'contract_id' },
    { date: '2026-10-08T00:00:01Z', refType: 'contract_brokers_fee', amount: -15000, contextId: 15, contextIdType: 'contract_id' },
  ];
  const r = K.copySales({ doc, jobs, journal, mine: new Set([ME, ALT]) });
  const T = (iso) => Date.parse(iso);
  eq('11: its fee and its price from the journal; 12: 1 of its 3 copies made before it was listed (the 2 Oct contract took two of the three), a third of its price; 15 deleted: its fee',
    r.events, [{ t: T('2026-10-02T00:00:01Z'), isk: -50000 }, { t: T('2026-10-03T00:10:00Z'), isk: 9e6 }, { t: T('2026-10-06T00:00:00Z'), isk: 4e6 }, { t: T('2026-10-08T00:00:01Z'), isk: -15000 }]);
  eq('  said apart: 12\'s 2 copies and 13\'s Raven (never copied: its fee isn\'t Industry\'s either); 14 went to an alt, a transfer', [r.notMade, r.toOwn], [[{ contractId: 12, copies: 2 }, { contractId: 13, copies: 1 }], [14]]);
  eq('  with no characters of yours given, 14 is a sale and takes the 5 Oct job\'s two copies', ((x) => [x.toOwn, x.events.length, x.events.find((e) => e.isk === 8e6) != null])(K.copySales({ doc, jobs, journal })), [[], 5, true]);
  eq('  a copy job not delivered (or cancelled) made nothing to sell', K.copySales({ doc: { list: [doc.list[0]] }, jobs: [job(1, 3, '2026-10-01T00:00:00Z', 25895, 'active')], journal: [], mine: new Set() }).notMade, [{ contractId: 11, copies: 2 }]);
  eq('  no document, or an empty one: nothing', [K.copySales({ doc: undefined, jobs, journal }), K.copySales({ doc: { list: [] }, jobs, journal })], [{ events: [], notMade: [], toOwn: [] }, { events: [], notMade: [], toOwn: [] }]);

  // Through the Industry activity: the copy job's fee charged once (stage 2's builtAndSold, at its start), the sale added.
  const d = { ...emptyData(), jobs: { 1: job(1, 3, '2026-10-01T00:00:00Z') }, copyContracts: { list: [doc.list[0]] },
    journal: { j1: { id: 'j1', ...journal[0] }, j2: { id: 'j2', ...journal[1] } } };
  const sets = { filaments: new Set(), abyssLoot: new Set(), pi: new Set(), lpGoods: new Set() };
  const acts = N.activityEvents(d, sets, false, {}, [], new Set([ME]), { state: 'none', mats: null });
  const ind = acts.events.filter((e) => e.activity === 'Industry');
  eq('  Industry: the sale, its contract fee and the copy job\'s fee once', Math.round(ind.reduce((s, e) => s + e.isk, 0) * 100) / 100, 9e6 - 50000 - 283177.85);
  const two = N.activityEvents({ ...d, copyContracts: { list: [doc.list[0], doc.list[2]] } }, sets, false, {}, [], new Set([ME]), { state: 'none', mats: null });
  eq('  a copy no job of yours made is said under Industry, not counted', [two.industry.copiesNotMade, N.industrySaid(two.industry, () => '').note], [1, '1 copy sold on contract that no copy job of yours made before it was listed (bought, or given) isn’t counted.']);
  // M6: a copy contract one of your own characters accepted is a transfer, said as such, never a sale.
  const toAlt = N.activityEvents({ ...d, copyContracts: { list: [{ ...doc.list[0], acceptor: ALT }] } }, sets, false, {}, [], new Set([ME, ALT]), { state: 'none', mats: null });
  eq('  a copy contract to one of your characters: no sale, said', [toAlt.events.filter((e) => e.activity === 'Industry' && e.isk > 0).length, toAlt.industry.copiesToOwn, N.industrySaid(toAlt.industry, () => '').note],
    [0, 1, '1 copy contract went to one of your own characters: a transfer, not a sale.']);
  eq('  with no jobs at all there\'s no Industry, copies or not', N.activityEvents({ ...d, jobs: {} }, sets, false, {}, [], new Set([ME]), { state: 'none', mats: null }).industry, null);
}
```

(`activityEvents` with `built` state `none` and no manufacturing job runs `builtAndSold` with `mats: null`: the copy job's fee
is charged from ESI's `cost`, no journal entry naming the job. The contract's fee entry names the contract, not a job, so
`builtAndSold` doesn't take it: only `copySales` does.)

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check`. Expected: FAIL, `K.copySales is not a function`.

- [ ] **Step 3: The rule**

Append to `src/lib/copyContracts.ts` (and `import type { JobRecord } from './industryTrack';`):

```ts
/** A copy contract's own fees in the journal, by the contract its context names. Unseen in the user's journal so far (stage 3's evidence). */
export const CONTRACT_FEE_REFS: ReadonlySet<string> = new Set(['contract_brokers_fee', 'contract_sales_tax']);
export type CopySales = {
  events: { t: number; isk: number }[];
  /** Copies sold that no delivered copy job of yours made before the contract was listed: bought, given, or from before the records. Not counted. */
  notMade: { contractId: number; copies: number }[];
  /** Copy contracts one of your own characters accepted: a transfer, not a sale. */
  toOwn: number[];
};

/**
 * Industry's copy sales (correction 1): each copy contract sold, not to one of your characters, counted at its price (the
 * journal's `contract_price` naming it, else the contract's own at its completion) times the share of its copies your
 * delivered copy jobs had made before it was listed, claimed in the order the contracts were listed, each copy once; and the
 * contract fees the journal names for a copy contract of a blueprint you'd copied before listing it. The copy jobs' own fees
 * are builtAndSold's, at each job's start: never charged here.
 */
export function copySales(o: { doc: CopyContractsDoc | undefined; jobs: readonly JobRecord[]; journal: readonly { date: string; refType: string; amount: number; contextId?: number; contextIdType?: string }[]; mine?: ReadonlySet<number> }): CopySales {
  const out: CopySales = { events: [], notMade: [], toOwn: [] };
  if (!o.doc?.list.length) return out;
  // What your delivered copy jobs made, by blueprint, oldest first: a copy job's runs are the copies it makes.
  const made = new Map<number, { t: number; left: number }[]>();
  for (const j of o.jobs) {
    if (j.activity !== 5 || j.status !== 'delivered') continue;
    const n = j.successfulRuns ?? j.runs;
    if (!(n > 0)) continue;
    const list = made.get(j.blueprintTypeId) ?? [];
    list.push({ t: Date.parse(j.completed ?? j.end), left: n });
    made.set(j.blueprintTypeId, list);
  }
  for (const l of made.values()) l.sort((a, b) => a.t - b.t);
  const named = new Map<number, { t: number; isk: number; refType: string }[]>();
  for (const e of o.journal) {
    if (e.contextIdType !== 'contract_id' || e.contextId == null || (e.refType !== 'contract_price' && !CONTRACT_FEE_REFS.has(e.refType))) continue;
    const l = named.get(e.contextId) ?? [];
    l.push({ t: Date.parse(e.date), isk: e.amount, refType: e.refType });
    named.set(e.contextId, l);
  }
  const copiedBefore = (typeId: number, t: number) => (made.get(typeId) ?? []).some((b) => b.t <= t);
  for (const c of [...o.doc.list].sort((a, b) => Date.parse(a.issued) - Date.parse(b.issued) || a.id - b.id)) {
    const issued = Date.parse(c.issued);
    const entries = named.get(c.id) ?? [];
    if (c.copies.some(([t]) => copiedBefore(t, issued))) for (const f of entries) if (CONTRACT_FEE_REFS.has(f.refType)) out.events.push({ t: f.t, isk: f.isk });
    if (copyState(c, Infinity) !== 'sold') continue;
    if (c.acceptor != null && o.mine?.has(c.acceptor)) { out.toOwn.push(c.id); continue; }
    const total = c.copies.reduce((n, [, k]) => n + k, 0);
    let claimed = 0;
    for (const [typeId, count] of c.copies) {
      let want = count;
      for (const b of made.get(typeId) ?? []) {
        if (want <= 0 || b.t > issued) break;
        const take = Math.min(b.left, want);
        b.left -= take; want -= take; claimed += take;
      }
    }
    if (claimed < total) out.notMade.push({ contractId: c.id, copies: total - claimed });
    if (!claimed) continue;
    const paid = entries.filter((e) => e.refType === 'contract_price' && e.isk > 0);
    const isk = paid.length ? paid.reduce((n, e) => n + e.isk, 0) : c.price;
    out.events.push({ t: paid.length ? paid[0].t : Date.parse(c.completed ?? c.expires), isk: (isk * claimed) / total });
  }
  return out;
}
```

In `src/lib/income.ts`: import `copySales` from `./copyContracts`; `IndustryActs` gains `copiesNotMade?: number`; in
`activityEvents`, after `const ind = …`:

```ts
  // Copies you made and sold on contract (copyContracts.ts): only with Industry's own figure, never without it.
  const copies = ind ? copySales({ doc: d.copyContracts, jobs: industryJobs, journal: inp.journal, ...(mine ? { mine } : {}) }) : null;
  const industryEvents = [...(ind?.events ?? []), ...(copies?.events ?? [])].map((e) => ({ t: e.t, activity: 'Industry' as const, isk: e.isk }));
```

(replacing the old `industryEvents` line) and the ready `IndustryActs` gains `copiesNotMade: copies ? copies.notMade.reduce((n, x) => n + x.copies, 0) : 0`
and `copiesToOwn: copies ? copies.toOwn.length : 0` (`IndustryActs` gains both, optional). In `industrySaid`'s `parts`, after
`feesUnknown`'s:

```ts
    ind.copiesNotMade ? `${ind.copiesNotMade.toLocaleString('en-US')} cop${ind.copiesNotMade === 1 ? 'y' : 'ies'} sold on contract that no copy job of yours made before it was listed (bought, or given) ${ind.copiesNotMade === 1 ? 'isn’t' : 'aren’t'} counted` : null,
    // M6: one of your own characters accepting a copy contract moves ISK between yours (characters.md): said, never a sale.
    ind.copiesToOwn ? `${ind.copiesToOwn.toLocaleString('en-US')} copy contract${ind.copiesToOwn === 1 ? '' : 's'} went to one of your own characters: a transfer, not a sale` : null,
```

`ACTIVITY_WHAT.Industry` becomes: `'What you built and sold, after sales tax, and copies your copy jobs made that sold on contract
(their price, less any contract fee the journal names for them), less every job’s fees and the materials your manufacturing jobs
used (at what you still held from your own purchases when each job started; materials you didn’t hold that way aren’t costed,
and said)'`. In `src/components/activityEvents.ts`, the `acts` memo's dependencies gain `d.copyContracts` (beside `d.jobs`): without
it a copy contract read by the sync wouldn't reach Results until something else changed.

- [ ] **Step 4: Run the tests; plant each rule wrong**

Run: `npm run check`. Plant and see fail: `b.t > issued` → `false` (12 claims all three); the `o.mine?.has` clause dropped (14 a
sale, and the to-an-alt test counts a sale); `copiedBefore` check dropped (13's fee counted); copy jobs' fees charged again in
`copySales` (the activity test's sum); the `copiesToOwn` clause dropped from `industrySaid` (the to-an-alt test's note).

- [ ] **Step 5: The income recording**

Run: `npm run check-income`. Expected: **passes unchanged**. Every recorded ledger has an Industry row ("Industry – Hours a
week on industry –": no jobs, so no figure), and no ledger it records holds a job or a `copyContracts` document, so the figure
can't move; `ACTIVITY_WHAT.Industry`, whose words change here, is the row's `data-tip` (`Results.tsx`), which the recording
(`panelRows`' `allInnerTexts`) doesn't read (M5). If it fails, read the diff: a moved figure is a bug here (fix it, never
re-record over it); a moved word is this task's, and only then `RECORD=1 npm run check-income`, the commit naming each word that
moved and why.

- [ ] **Step 6: The page check**

In the industry case, above `// --- the end of the industry case` (its own seed, so the stage-2 built-and-sold figures above
don't move):

```js
    // --- Task 15B: a copy contract sold counts in Industry on Results: its price less its listing fee and the copy job's fee; a
    // copy no job of yours made is said, not counted.
    {
      const copyJob = { jobId: 9801, activity: 5, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25895, runs: 3, licensedRuns: 40, successfulRuns: null, probability: null, cost: 283177.85,
        facilityId: 60001483, stationId: 60001483, outputId: 60001483, start: iso(now - 6 * 86400_000), end: iso(now - 5 * 86400_000), completed: iso(now - 5 * 86400_000), status: 'delivered', perRun: null, seenAt: iso(now - 6 * 86400_000) };
      const sold = (id, copies, price, over = {}) => ({ id, issued: iso(now - 4 * 86400_000), expires: iso(now + 10 * 86400_000), status: 'finished', price, availability: 'public', acceptor: 777, completed: iso(now - 3 * 86400_000), station: 60003760, copies, kinds: 'gone', ...over });
      const journal = { cj1: { id: 'cj1', date: iso(now - 3 * 86400_000), refType: 'contract_price', amount: 9e6, contextId: 9811, contextIdType: 'contract_id' },
        cj2: { id: 'cj2', date: iso(now - 4 * 86400_000), refType: 'contract_brokers_fee', amount: -50000, contextId: 9811, contextIdType: 'contract_id' } };
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, industry: DOC, cloud: CLOUD_STATE, jobs: { 9801: copyJob }, journal, copyContracts: { list: [sold(9811, [[25895, 2]], 9e6), sold(9812, [[688, 1]], 1e6)] }, meta: { ...ledger.meta, jobsRead: true } }, { alts: altStore });
      await page.goto(`${BASE}#results`);
      // 9,000,000 − 50,000 − 283,177.85 = 8,666,822.15: "+8.67 M ISK".
      await page.waitForFunction(() => /8\.67 M ISK/.test(document.querySelector('.page')?.textContent ?? ''), null, { timeout: 20_000 })
        .catch(async () => problems.push(`Results’ Industry doesn’t count the copy contract sold (+8.67 M): “${(await text()).slice(0, 500)}”`));
      if (!(await text()).includes('1 copy sold on contract that no copy job of yours made before it was listed (bought, or given) isn’t counted.')) problems.push('Results doesn’t say the Raven copy no job of yours made isn’t counted');
    }
```

(Results' By activity is on the default period: if the seeded dates fall outside it, widen with the period Seg the page has, as
the stage-2 block above does for its figures.)

- [ ] **Step 7: Notes, the five checks, commit**

- `docs/notes/positions-results.md`, the Industry activity's bullet: copy sales, their claim order, the transfer rule, the fees,
  and correction 1 (the jobs' fees are charged once, at their start).
- `docs/notes/limits.md`: **A copy sale is claimed by blueprint and count, not by kind** (ruling 2): a contract's copies are taken
  from your delivered copy jobs of that blueprint, oldest first, whatever runs each copy carried; a split contract is counted pro
  rata of its copies, not their runs. **Copies your own jobs used up (to build or invent) still count as made** for a later sale's
  claim: the app can't see a copy consumed. **Claims run in the order contracts were listed**, so a contract listed early and sold
  late can take copies a later one had claimed, moving an earlier period's figure when it sells. **Contract fees count only where
  the journal names the contract** (unseen so far), and none for a copy contract of a blueprint you hadn't copied before listing it.
- `docs/notes/industry.md`: the rule, and "After shipping: the first copy contract's journal entries (which ref types, whether
  they name the contract)".
- Run the five checks (check-income as step 5 says); commit with the reasoning (correction 1's double charge avoided, Brave's free
  copies not counted as Industry) and the evidence (the test's 12,935,000 across five contracts; the page case's +8.67 M).

---
### Task 15C: To do: a copy contract that expired

**Files:**
- Modify: `src/lib/todo.ts` (kind `copyContract`, `copyContractItem`, `judgeCopyContract`, `TodoItem.action.contract`),
  `src/lib/copyContracts.ts` (`copiesWhat`), `src/components/Todo.tsx` (build the items, their names, the judge's dispatch, the
  action, the kind's icon), `scripts/check.mjs`,
  `scripts/pages.mjs`, `docs/notes/orders-alerts.md`, `docs/notes/industry.md`

**Interfaces:**
- Consumes: `type CopyContract`, `copiesSaid`, `copyState` (Task 15A); `openContractWindow` (`src/lib/market.ts`); To do's
  `contractsAt` (the contracts read time, `meta.contracts.at`) and `canOpenInGame`.
- Produces: `TodoKind` gains `'copyContract'` (`MINUTES` 2, `KIND_LABEL` "Copy contract expired"); `TodoItem.action.contract?: number`;
  `copyContractItem(c, { what, station, now, canOpen })`, `judgeCopyContract(e, c)`; `copiesWhat(copies, names)` in copyContracts.ts.

**The rule** (spec, To do; correction 13). One item per copy contract of yours that is outstanding past its expiry and still in
ESI's list: key `copies:<contract>`, version `1`, source `contracts` (seen at the contracts read), Needs action, stake its price.
It ends only on a contracts read newer than the one that listed it: deleted ("Deleted: its copies went back to …"), no longer
outstanding (said as ESI's status), or no longer in ESI's list (ESI lists contracts only 30 days back: if you didn't delete it,
its copies are still in it; M7); never on a read from before. The button opens the contract in game when the login can ("Open
in game"), else the Copies section ("Copies"; M13). Its title names the blueprints by `d.names` (the sync looks them up, I2) and
says "2 copies" while a name is unread, never "Item #…". A hand tick is a chore's (12 hours).

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, after Task 15B's section:

```js
console.log('\n--- Industry stage 3: To do lists a copy contract that expired (Task 15C) ---');
{
  const TD = await import('../src/lib/todo.ts');
  const now = Date.parse('2026-10-10T00:00:00Z');
  const cc = (over = {}) => ({ id: 21, issued: '2026-09-25T00:00:00Z', expires: '2026-10-09T00:00:00Z', status: 'outstanding', price: 9e6, availability: 'public', acceptor: null, completed: null, station: 60003760, copies: [[25895, 2]], ...over });
  const it = TD.copyContractItem(cc(), { what: '2× Large Trimark Armor Pump I Blueprint', station: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', now, canOpen: true });
  eq('an expired copy contract: one item, its key, version 1, from the contracts read, the button opening it in game',
    [it.key, it.ver, it.kind, it.source, it.stake, it.title, it.action], ['copies:21', '1', 'copyContract', 'contracts', 9e6, 'Copy contract expired: 2× Large Trimark Armor Pump I Blueprint',
      { label: 'Open in game', contract: 21, route: 'hustles/industry/copies' }]);
  eq('  its detail says where the copies go back', it.detail, 'It expired on 9 Oct 2026. The copies stay in it until you delete the contract in game (Contracts, My contracts), which returns them to Jita IV - Moon 4 - Caldari Navy Assembly Plant.');
  eq('  a login that can\'t open windows: the button goes to the Copies section, said so (M13)', TD.copyContractItem(cc(), { what: 'x', station: null, now, canOpen: false }).action, { label: 'Copies', contract: 21, route: 'hustles/industry/copies' });
  const o = { what: 'x', station: null, now, canOpen: true };
  eq('  none while it\'s listed, once it\'s sold or deleted, or once it left ESI\'s list', [TD.copyContractItem(cc({ expires: '2026-10-12T00:00:00Z' }), o), TD.copyContractItem(cc({ status: 'finished' }), o),
    TD.copyContractItem(cc({ status: 'deleted' }), o), TD.copyContractItem(cc({ gone: '2026-10-09T12:00:00Z' }), o)], [null, null, null, null]);
  const K = await import('../src/lib/copyContracts.ts');
  eq('what it holds by name, or "2 copies" while a name is unread: never "Item #…" (I2)', [K.copiesWhat([[25895, 2]], { 25895: 'Large Trimark Armor Pump I Blueprint' }), K.copiesWhat([[25895, 2], [688, 1]], { 25895: 'Large Trimark Armor Pump I Blueprint' }), K.copiesWhat([[688, 1]], {})],
    ['2× Large Trimark Armor Pump I Blueprint', '3 copies', '1 copy']);
  const e = { item: it, seenAt: now - 3600_000, lastAt: now };
  eq('judged only on a newer contracts read: deleted, finished, no longer in ESI\'s list; a read from before says nothing', [
    TD.judgeCopyContract(e, { readAt: now, entry: cc({ status: 'deleted' }) }),
    TD.judgeCopyContract(e, { readAt: now, entry: cc({ status: 'finished' }) }),
    TD.judgeCopyContract(e, { readAt: now, entry: cc({ gone: '2026-10-10T00:00:00Z' }) }),
    TD.judgeCopyContract(e, { readAt: now - 7200_000, entry: cc({ status: 'deleted' }) }),
    TD.judgeCopyContract(e, { readAt: null, entry: cc({ status: 'deleted' }) }),
    TD.judgeCopyContract(e, { readAt: now, entry: undefined }),
    // I6: a read at the very time of the one that listed it is no newer.
    TD.judgeCopyContract(e, { readAt: e.seenAt, entry: cc({ status: 'deleted' }) }),
  ], ['Deleted: its copies went back to the station it was made at.', 'It’s no longer outstanding (finished).', 'No longer in your contracts: ESI lists them only 30 days back, so if you didn’t delete it in game, its copies are still in it.', null, null, false, null]);
  eq('the kind: a chore under Needs action', [TD.needs('copyContract'), TD.KIND_LABEL.copyContract, TD.MINUTES.copyContract, TD.HOLDS_UNTIL_CHANGED.has('copyContract')], ['act', 'Copy contract expired', 2, false]);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check`. Expected: FAIL, `TD.copyContractItem is not a function`.

- [ ] **Step 3: The item and its judge**

In `src/lib/todo.ts`: `TodoKind` gains `'copyContract'`; `MINUTES.copyContract = 2`; `KIND_LABEL.copyContract = 'Copy contract
expired'`; `TodoItem.action` gains `contract?: number` (with its doc line: "`contract`: one of your contracts to open in game");
`fmtDate` joins the `./format` import (it writes "9 Oct 2026", UTC); `import type { CopyContract } from './copyContracts';`. Add:

```ts
/**
 * A copy contract of yours that expired (spec, To do): outstanding past its expiry and still in ESI's list. Its copies sit in it
 * until you delete it in game, which returns them to where it was made. Version 1: it ticks off only on a newer contracts read.
 */
export function copyContractItem(c: CopyContract, o: { what: string; station: string | null; now: number; canOpen: boolean }): TodoItem | null {
  if (c.status !== 'outstanding' || c.gone || Date.parse(c.expires) > o.now) return null;
  return {
    key: `copies:${c.id}`, ver: '1', kind: 'copyContract', source: 'contracts', stake: c.price,
    title: `Copy contract expired: ${o.what}`,
    detail: `It expired on ${fmtDate(c.expires)}. The copies stay in it until you delete the contract in game (Contracts, My contracts), which returns them to ${o.station ?? 'the station it was made at'}.`,
    // The label as Todo's other items choose theirs: "Open in game" only when the login can open windows (M13).
    action: { label: o.canOpen ? 'Open in game' : 'Copies', contract: c.id, route: 'hustles/industry/copies' },
  };
}

/** Gone from the list: on a contracts read newer than the one that listed it, what that read shows; else still being checked. */
export function judgeCopyContract(e: Entry, c: { readAt: number | null; entry: CopyContract | undefined }): string | null | false {
  if (c.readAt == null || c.readAt <= e.seenAt) return null;
  if (!c.entry) return false;
  if (c.entry.status === 'deleted') return 'Deleted: its copies went back to the station it was made at.';
  if (c.entry.status !== 'outstanding') return `It’s no longer outstanding (${c.entry.status.replace(/_/g, ' ')}).`;
  // ESI lists a deleted contract as deleted within its 30 days: leaving the list means those passed, its copies maybe still in it (M7).
  if (c.entry.gone) return 'No longer in your contracts: ESI lists them only 30 days back, so if you didn’t delete it in game, its copies are still in it.';
  return null;
}
```

Append to `src/lib/copyContracts.ts`:

```ts
/** What a contract holds for a title: by name when every blueprint's is known, else how many copies, never "Item #…" (I2). */
export function copiesWhat(copies: readonly [number, number][], names: Readonly<Record<number, string>>): string {
  if (copies.every(([t]) => names[t])) return copiesSaid(copies, (t) => names[t]);
  const n = copies.reduce((t, [, k]) => t + k, 0);
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'copy' : 'copies'}`;
}
```

In `src/components/Todo.tsx`: the kind's icon (`copyContract: { Icon: ScrollText, c: 'var(--acc2)' }`, `ScrollText` from
lucide-react); `useEnsureNames`' list (`Todo.tsx:183`) gains `...(d.copyContracts?.list ?? []).flatMap((x) => x.copies.map(([t]) => t))`
(it asks only IDs not in `d.names`, so a doc stored before the sync named them is named on opening); after the couriers, the
items (the main's own contracts only):

```tsx
    // Copy contracts of yours that expired (copyContracts.ts): their copies sit in them until deleted in game.
    for (const c of d.copyContracts?.list ?? []) {
      const item = copyContractItem(c, { what: copiesWhat(c.copies, d.names), station: c.station != null ? d.meta.contracts?.places?.[c.station] ?? null : null, now, canOpen: canOpenInGame() });
      if (item) out.push(item);
    }
```

the judge's dispatch: `case 'copyContract': return judgeCopyContract(e, { readAt: contractsAt, entry: d.copyContracts?.list.find((x) => \`copies:${x.id}\` === e.item.key) });`,
the build memo's dependencies gain `d.copyContracts` if they list fields (they take `d` today), and in `act`, before the market
window's branch:

```tsx
    // One of your contracts: opened in game when it can be (the opening says nothing when it works), else the Copies section.
    if (x.action.contract != null && canOpenInGame()) {
      try { await openContractWindow(x.action.contract); return; } catch { /* fall through to the page */ }
    }
```

(`openContractWindow` from `../lib/market`; `copyContractItem`, `judgeCopyContract` join the `../lib/todo` import; `copiesWhat`
from `../lib/copyContracts`.)

- [ ] **Step 4: Run the tests; plant each rule wrong**

Run: `npm run check`. Plant and see fail: `c.readAt <= e.seenAt` → `<` (the read at the same time, I6); the `c.gone` clause dropped
from `copyContractItem` (the left-the-list case builds); `!c.entry` returning `null` (the gone-entry case); the label always "Open
in game" (the M13 test); `copiesWhat` naming through a missing name (the "1 copy" case reads "1× undefined"). In the page check:
the seed's `names` removed reads "Copy contract expired: 2 copies", which the `waitForFunction` rejects.

- [ ] **Step 5: The page check**

In the industry case, above `// --- the end of the industry case`:

```js
    // --- Task 15C: To do lists the expired copy contract, with where its copies go back.
    {
      const expired = { id: 9901, issued: iso(now - 20 * 86400_000), expires: iso(now - 86400_000), status: 'outstanding', price: 9e6, availability: 'public', acceptor: null, completed: null, station: 60003760, copies: [[25895, 2]], kinds: [[25895, 10, 20, 40, 2]] };
      await page.goto(SEED_PAGE);
      // The name as the sync keeps it (I2): the industry case's /universe/names stub answers every ID as a station.
      await seed({ ...ledger, industry: DOC, cloud: CLOUD_STATE, names: { 25895: 'Large Trimark Armor Pump I Blueprint' }, copyContracts: { list: [expired] }, meta: { ...ledger.meta, contracts: { at: iso(now - 600_000), list: [], items: {}, places: { 60003760: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' } } } }, { alts: altStore });
      await page.goto(`${BASE}#todo`);
      await page.waitForFunction(() => /Copy contract expired: 2× Large Trimark Armor Pump I Blueprint/.test(document.querySelector('.page')?.textContent ?? ''), null, { timeout: 20_000 })
        .catch(async () => problems.push(`To do doesn’t list the expired copy contract: “${(await text()).slice(0, 400)}”`));
      if (!(await text()).includes('which returns them to Jita IV - Moon 4 - Caldari Navy Assembly Plant')) problems.push('the expired copy contract doesn’t say where its copies go back');
      if (/Item #\d/.test(await text())) problems.push('To do says “Item #…” for a copy contract');
      if (SHOTS) { await page.waitForTimeout(900); await page.screenshot({ path: `${SHOTS}-industry-todo-copies.png` }); }
    }
```

- [ ] **Step 6: Notes, the five checks, commit**

`docs/notes/orders-alerts.md`: a bullet for the item (its key, version, source, what ends it, and that leaving ESI's 30-day list
ends it, correction 13; not mailed); `docs/notes/industry.md`: a line pointing there. Run the five checks, look at the To do
screenshot at both widths, commit.

---
## After Task 15C: shipping stage 3

The controller merges `industry-3` with `--ff-only`, deletes the branch both sides, pushes, and waits for `npm run deployed`
to say "Shipped." for both workflows (the Worker's deploy applies migration `0020_copies.sql`). Then, read-only (SELECTs from D1,
never a write), and recorded in `docs/notes/industry.md` under "The first real reads after stage 3 shipped":

1. **The first two `37` rounds**: the first keeps the set (`copy_set` rows, their sizes, `scan_meta` 'copies' with no reads), the
   second, about six hours later, puts what vanished in `copy_sold` (how many: the plan expects 300 to 450 a six-hour span) and
   writes the summary (its size: the plan expects 200 to 300 KB). Both rounds' wall time from `wrangler tail` or the logs (the
   chain must stay under the 15-minute limit with Goonmetrics before it), and `scan_meta` 'copies' never left at the
   `interrupted` error (a round the cloud stopped: memory or the wall; the step 8 measure says it shouldn't happen).
2. **The first copy job of any character, seen within 90 minutes of its start** (correction 15): at an NPC station, its
   `sccShare` against `SCC_COPY` (4%); at a structure site with a copy rig and its tax typed, which reading its cost sits nearer.
   A reading that differs is changed in a commit citing the job, as stage 2 settles the research SCC; until then the Copies
   section says each is not yet checked.
3. **The first copy contract of the main's**: its items' `raw_quantity`, its public items' answer (or 404 while ESI's public list
   lags), and its journal entries (`contract_price`, any contract fee, and whether they name the contract by `contract_id`).
