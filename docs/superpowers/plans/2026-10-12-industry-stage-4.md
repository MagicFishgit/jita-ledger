# Industry, stage 4: home markets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A home hub's prices come from the structure's own market once a character of yours can use it: the cloud reads each
hub hourly with the character you pick (the reader), the finder and To do say which price speaks (the structure's own read
under two hours old, else Goonmetrics', else none), the hub's broker fee is measured from your own orders there and offered
with **Use this**, and a Home markets section on the Industry tab shows every hub in every state; the new permission is asked
of every login, and the app says plainly what logging in again stops.

**Architecture:** One new permission in `SCOPE` (Task 16). The cloud gets a structure search run with an alt's own login (17A),
which `FindStructure` uses for any character but the main (17B). The fold the daily scan uses moves to `src/lib/bookFold.ts`
and gains a structure fold for the watch set's types; `worker/src/homeMarkets.ts` reads every hub hourly, last on the `37`
cron with its own deadline, keeps one `home_books` row a structure (the last good read, and the last try with why), and serves
the hub list (`home_markets` rows over Goonmetrics' two defaults) and each hub's book (18A). The browser merges the cloud's hub
list with Goonmetrics' two, decides which price speaks (`homeSpeaks`, pure), and threads the source through the finder, its
detail and To do's List what you built (18B); a Home markets section shows and changes it all (18C); a pure `hubFeeRate`
measures the broker fee (18D); Goonmetrics' round starts where the last stopped (18E).

**Tech Stack:** React 18 + TypeScript + Vite; Cloudflare Worker + D1; ESI (`X-Compatibility-Date: 2026-08-18` from the browser,
`2025-08-26` from the Worker: the routes used here answer the same shapes at both, step "The evidence"); Node's type stripping
for pure tests (`scripts/check.mjs`), the in-memory D1 stand-in for the Worker (`scripts/check-worker.mjs`, `scripts/d1.mjs`),
Playwright for pages (`scripts/pages.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-10-industry-design.md`. Read it whole first, Revisions 1 and 2 included. This plan
builds its build-order tasks 16 to 18 (stage 4). Stages 1 to 3 are in `docs/notes/industry.md` and the stage-1 to stage-3 plans
(`docs/superpowers/plans/2026-10-10-industry-stage-1.md`, `…-stage-2.md`, `2026-10-11-industry-stage-3.md`); where this plan
names their code, the code on `industry-4` (cut from `main` at 5b52814) is what it means. Where the spec's names or shapes
differ from the code, the code wins (listed below).

**Task layout.** The spec's three stage-4 tasks, split where a reviewer could reject one part and approve the other: **16** (the
permission, and what logging in again stops, said before it does); **17A** (the cloud's structure search, run with an alt's own
login) and **17B** (`FindStructure` as any character); **18A** (the cloud reads each home market hourly: migration, the fold moved,
the round, the routes), **18B** (the hub list and which price speaks, through the finder, its detail and To do), **18C** (the Home
markets section), **18D** (the hub's broker fee measured, with Use this) and **18E** (Goonmetrics' round starts where the last
stopped). The spec's numbering is kept.

**The evidence this plan read** (12 October 2026; `.playwright-mcp/industry/stage4-research/`, gitignored: the OpenAPI extracts at
both dates, the public answers and their headers; ESI's OpenAPI at both dates from `.playwright-mcp/research/industry-stage2/`).
Every call public, with `User-Agent: jita-ledger (research)` and `X-Compatibility-Date: 2026-08-18`; none with a login.

- **`GET /markets/structures/{structure_id}/`** (OpenAPI 2026-08-18 and 2025-08-26, the Worker's date: the extracts are the same
  but for the date): every order in the structure, **no type filter**, paged by `page` (from 1) with `X-Pages`; each order
  `order_id`, `type_id`, `location_id`, `volume_total`, `volume_remain`, `min_volume`, `price`, `is_buy_order`, `duration`,
  `issued`, `range` (all required); `x-cache-age` 300 s; security `esi-markets.structure_markets.v1`; **no `x-rate-limit` group
  named** (`/markets/{region}/orders` names `market-order`, 12,000 tokens a quarter hour, 2 a page: if that group applies here,
  300 pages an hour is 600 tokens); the refusal for a character off the structure's access list **isn't described** (only the
  `default` error schema, `{ error }`). Without a login, for 1st Byzantigoon: `401 {"error":"Unauthorized - No token provided"}`.
- **`GET /universe/structures/{id}/`** (`esi-universe.read_structures.v1`, an hour): `name`, `owner_id`, `solar_system_id`,
  `type_id`; the same 401 without a login. **`GET /characters/{id}/search/`** (`esi-search.search_structures.v1`, an hour):
  `categories` (`structure`), `search`, `strict`; answers `{ structure: number[] }`. Both the same at both dates.
- **A system's region, publicly**: `/universe/systems/30004807/` (UALX-3) → `constellation_id` 20000703, `security_status`
  −0.1868; `/universe/constellations/20000703/` → `region_id` 10000061 (Tenerifis). `cache-control: public`.
- **The code** (as of 5b52814):
  - `loginAltForCloud` asks `[...SCOPES, ...askedScopes()]` (auth.ts), so an alt handed over again gains the new permission;
    `MAILER_SCOPES` is send and organize mail only, so the sender's login is untouched;
  - `keepHandedOver` stores the login's `scopes`, so `altsStatus` and the Characters page's `loginState(...).missing` say
    "1 permission missing" for an alt handed over before;
  - Settings' `scopesMissing(auth.scopes, watcher.scopeNames)` speaks only once this browser holds a permission the cloud's main
    login lacks, that is after the relog;
  - Settings → Account says "N of M not granted. Each must be ticked on your application at developers.eveonline.com first, then
    log out and in again here." (`Settings.tsx:277`), nothing about the cloud;
  - To do's `cloudLogin` items say "Hand the cloud your login again" once EVE has refused it (`Todo.tsx:448–473`).
  - `homePrices()` throws `BadRequest` for a hub not in `HOME_HUBS`; `sanitizeIndustry` keeps `hub` as any integer ≥ 10¹² and
    `hubFees` keyed by any 13-digit ID, so a hub you add survives an older build's save.
  - `HOME_HUBS`, `hubOf` and `HomeHub` (with `systemId` and `region`) are read by `industryFinder.ts` (the hub, its legs,
    `useHomeHistory`), `IndustryBuild.tsx` (the Home hub select) and `Todo.tsx` (`builtWhere`, `builtPlaceSystem`).
  - `matchFees` calls a fee a placement only when it is at least 75% of the **Jita** broker rate × the order (`PLACEMENT_SHARE`),
    so a structure fee under that reads as a price change; `measuredRates` keeps only placements, by day, three a day.
  - `foldPage` (scan.ts) feeds `foldNpc` and `foldBpo` (industryNpc.ts, the Worker's) beside `fold`.
  - `IndustryCopies.tsx` reads no home price (copies sell on contracts); the ladder (`IndustryStart.tsx`) reads the finder's rows.
- **The `37` chain's time** (`worker/src/index.ts`): the alts' full read (about 10 s an alt, characters-cloud.md: FannySchmeller's
  first), then Goonmetrics (59 calls × 1.5 s and a call's time a hub, about 3 minutes for both when due, which is one hour in six;
  no call started past 10 minutes from the cron's time), then the copy round (about 3 s; nothing started past 12 minutes, its fetch
  given up after 90 s). On an ordinary hour the structure reads start about a minute in, on a six-hourly one about 4 minutes in,
  and on the worst hour (Goonmetrics cut at 10, a copy fetch hanging 90 s) at about 13½. A Keepstar's market is tens of pages at
  under a second each: three hubs fit in a few minutes. The invocation stops at 15 minutes and has 120 s of CPU (hourly cron).

## Where this plan corrects the spec

Each is said again in the task that owns it, and goes in `docs/notes/industry.md`.

1. **Logging in again stops the main's other logins, never an alt's** (Task 16). EVE's rule is per character (eve-facts.md: the
   mail character kept its login through the main's relog). The spec's "the user's next login stops the cloud's main login and
   the alt's" holds for the cloud's main login and the main's login on any other device (the phone); each alt's login keeps
   working and lacks the new permission until handed over again, which the Characters page already says ("1 permission missing").
2. **The first notice is Settings → Account, and it now says what logging in again stops** (Task 16, `grantSaid`). The spec
   relied on `scopesMissing` and `loginState(...).missing`, which speak only after the relog (the first) or of the alts' logins
   (the second); before the relog nothing said the cloud's login would stop. The user asked for care with logins.
3. **Goonmetrics' two hubs are read with the main by default, with no row in D1** (Task 18A). A `home_markets` row records every
   choice you make: another reader, a hub you added, a default you stopped reading (`removed_at`). So which hubs the cloud reads,
   and with whose login, is the defaults (`HOME_HUBS`, code) and D1 for every change; no synced document holds them.
4. **`home_markets` keeps `system_id` and `region_id`, and `home_books` keeps `tried`, `reader`, `pages` and `types`** (Task
   18A). The finder's freight legs and the home region's history need a hub's system and region (`HOME_HUBS` carried them as
   constants); a hub you add has them read publicly when added. A book row keeps its last good read apart from its last try
   (when, whose, why it failed), as `home_prices` does with `tried`.
5. **A read cut short, or with a page failed, is never stored** (Task 18A). ESI's market pages are shuffled with respect to type
   (eve-market.md), so a fold over part of the pages gives a wrong best price for every type, not a few missing ones (unlike a
   Goonmetrics batch, whose types it names). The last good read stands, and the try is stamped with why ("cut short at page 31 of
   80 by the cloud's time limit"). A market over 300 pages isn't read at all, said.
6. **The fold moves in part** (Task 18A). `fold`, `Agg`, `plainBook`, `RawOrder` and `LEVELS` move to `src/lib/bookFold.ts`
   with `foldStructurePage` and `structureSummary`; `foldPage` stays in `worker/src/scan.ts`, since it feeds the Worker's own NPC
   and blueprint-seller folds (`foldNpc`, `foldBpo`). A structure's fold keeps no queue count (`deep`).
7. **Structure reads run last on the `37` chain, every hub every hour, with a deadline of their own, least recently read first,
   and are not a watched job** (Task 18A). Last, because a missed Goonmetrics or copy round slips six hours and a missed structure
   read one, which the two-hour rule tolerates; no page is asked for past 14 minutes from the cron's time; a hub cut short keeps its
   old read and so goes first the next hour. Not a watched job: a hub refused until the user is accepted would mail every day
   (the user's "not too tight so i don't get suggestions"), and the section says each hub's state. A refused hub is asked again
   hourly (one 403 an hour, against ESI's error limit), so the day a character is accepted its read starts within the hour.
8. **A whole structure read without a type says "none listed there"** (Task 18B). It read every order, so a type absent from it
   has none, which is known; Goonmetrics' missing type stays "no price at X" (not known).
9. **Buying a material at a hub priced by its own market**: when its best five levels hold a week's need, priced at what that
   need costs bought up them (Task 18B). A structure read has no weekly movement, so Goonmetrics' depth rule (`HOME_DEPTH`: the
   hub moves ten times the week's need) would make nothing pickable there; Goonmetrics' rule stays for Goonmetrics' prices.
10. **The finder reads the home region's history for rows priced at the hub with no pace, not only rows already sold there**
    (Task 18B). A hub Goonmetrics doesn't track (Mothership Bellicose) has no weekly movement, so no row ever had a pace there to be
    ranked, and its history was never read.
11. **The structure read's sold counts split home pace as the Jita book's do** (Task 18B, spec B10): `tradingSplit({ history,
    book })`, the book first when it can tell (`bookCanTell`); before the history is read, Goonmetrics' weekly movement ÷ 7, split by
    the book where it can tell, else even. The detail says which.
12. **The hub's broker fee is measured by its own second-match, not `measuredRates` over `matchFees`** (Task 18D). `matchFees`
    tells a placement from a price change at 75% of the Jita rate, so a hub fee under about 1.2% at the user's skills would read as
    a change and never be measured; and `measuredRates` wants three placements a day. A placement counts when it is the only order
    version of the character's in its second, its fee all of that second's `brokers_fee` entries, over 100 ISK (the minimum says
    nothing of the rate); the measure is the median of the newest five, said with how many and when, offered with **Use this**.
13. **Routes beside `POST /v1/home/read`**: `GET`, `POST` and `DELETE /v1/home/markets` (the hubs and their states; add one or set
    its reader; stop reading or remove one) and `GET /v1/home/book?hub=` (a hub's last good read); `POST /v1/structures/search`
    answers `{ found }` in `FindStructure`'s own shape (Tasks 17A, 18A).
14. **The Worker reads at `X-Compatibility-Date: 2025-08-26`**, not the app's 2026-08-18: the three routes are the same at both
    (the extracts above), so nothing changes.
15. **No copies' home asks exist** (`IndustryCopies.tsx` reads no home price: Brave gives copies free, the research's finding),
    and the ladder reads the finder's rows: neither changes but through the finder.
16. **Goonmetrics' round starts where the last stopped, and a type no round has reached says "not read at X yet"** (Task 18E,
    the limit stage 1 left for stage 4). Kept in `scan_meta` (`goonmetrics`), no migration.
17. **`FoundStructure` moves to `src/lib/industrySites.ts`** (Task 17B), so `cloud.ts` can type the cloud's search without
    importing a component; `FindStructure.tsx` re-exports it.

## Global Constraints

Every task's requirements include these. The quoted lines are the user's or the brief's, verbatim.

- Never call ESI with a login. Public ESI at build time, if a task needs it, with `User-Agent: jita-ledger (research)` and
  `X-Compatibility-Date: 2026-08-18`, into `.playwright-mcp/industry/stage4-research/`.
- D1 remote: SELECT only. Implementers don't touch D1 at all (remote or local); the tests run on the stand-in.
- Never deploy by hand. Never run `wrangler … --remote`.
- Never add an alt to `OWNER_CHARS`.
- Don't re-record `scripts/income-golden.json` unless by design: no task here changes an income figure or word, so
  `npm run check-income` passes with it byte-identical in every task.
- "be carefull with the logging in changes": the sender's login, `handleCallback`'s purposes and `keepHandedOver` are not
  touched; the only login change is one permission added to `SCOPE`, and the words around it.
- "not too tight so i don't get suggestions": no To do item, mail or watched job for a home market; a refused read is said on the
  tab only.
- "i don't ever plan to haul ships to jita": `noShipsToJita` keeps deciding where ships sell; a hub you add is a place they may
  sell, never a reason to send one to Jita.
- Goonmetrics: cloud only, User-Agent exactly `jita-ledger (hobby tool)`, a hub every six hours, 1.5 s apart, ≤50 types a call,
  `GOONMETRICS_ON`. Task 18E changes where a round starts, nothing of this.
- The Worker's `src/lib` imports (`bookFold.ts`, `homeMarket.ts` and what they import) stay free of `./config`, `./store`, React
  and the DOM, even for a type.
- No enums, namespaces or constructor parameter properties anywhere the Worker or `npm run check` loads (Node's type stripping).
- Not known is never 0: every state says what it is, never a price, a pace or a fee of 0 for one not read.
- Copy in the app's plain voice (app-conventions.md): a section is a lead line and three or four points; a long tip is a lead
  line, bullets, then an example; plain words; no figure invented; `’` in copy, never `’` in JSX text.
- The site and the Worker deploy in either order: migration `0021_home_markets.sql` only adds; a route new to the Worker 404s on
  an old one and the tab says "a version behind"; an older browser ignores the new answers.
- Nothing of an alt's is written into the main's ledger, nor any alt's into another's. The structure reads write only
  `home_books` (keyed by structure) and `home_markets` (keyed by ledger); the alt-store tripwire in `scripts/check.mjs` is
  unchanged (no new file reads the alt store: `IndustryHome.tsx` gets its characters from `Industry.tsx`).
- Stand-in data lives in the `industry` case of `scripts/pages.mjs` (each block above `// --- the end of the industry case`),
  never in `scripts/ledgers.mjs`.
- Every task ends with: `npm run check`, `npm run build`, `npm run check-pages` (`LEDGER=industry` while iterating, the full run
  before committing), `npm run check-phone` for UI, `npm run check-income`, a look at screenshots of what changed at 1,440 and 390
  px (`SHOTS=.playwright-mcp/industry4/<task> npm run check-pages`, then open the PNGs), the notes the task names, and a commit
  whose message says what was wrong or missing, why, and the evidence, ending with `Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf`.
- Each test is shown failing with its rule planted wrong (the step names the plant), then passing.

## Review Focus

1. **A read cut short, or with a page failed.** Half a book stored would price every type wrong. Expected: the last good read
   stands (its `at`, `data` and `pages` untouched), the try is stamped with why, and the next hour reads that hub first. Pinned in
   Task 18A step 2 (check-worker: the deadline passing after page 1 of 2, page 2 answering 500, 301 pages), plant "store the fold
   anyway".
2. **A reader whose access is lost after reads worked.** Expected: "EVE refused your read of UALX-3: it isn't on its access list
   (first refused 2 h ago). Goonmetrics' prices stand in." with the last good read's age; past two hours the finder prices UALX-3 on
   Goonmetrics, and Bellicose on nothing, each said. Pinned in Task 18A step 2 (`refusedAt` kept from the first refusal by the same
   reader, cleared by a read) and Task 18B step 1 (`ownMarketSaid`'s every state).
3. **The two-hour boundary.** A structure read 2 h 01 old must not speak; Goonmetrics' five-hour-old read does, and the line says
   why its own market isn't used. Pinned in Task 18B step 1 (`homeSpeaks` at 1 h 59 and 2 h 01) and step 9 (the page check).
4. **A reader whose login can't read.** No permission, refused by EVE, none kept, or taken off the roster: no ESI call, said in
   its own words with where to fix it, and never read silently with the main instead. Pinned in Task 18A step 2 (no call is made;
   `login` says which) and Task 18B step 1.
5. **Logging in again in the wrong order.** Handing the cloud the main's login before logging in here stops this browser's own
   login, and the phone's stops either way. Expected: Settings → Account says the order before it happens ("Log in again here …
   then hand the cloud your login again"), the Home markets line for the main's missing permission says the same, and the existing
   `stoppedBy` notice still covers a hand-over made first. Pinned in Task 16 step 1 (`grantSaid`) and step 5 (the page check).

## Files

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/config.ts` | `SCOPE.structureMarkets`, its `SCOPE_INFO` | 16 |
| `src/lib/watchdog.ts`, `src/components/Settings.tsx` | `grantSaid`: what logging in again stops, said on the Account tab | 16 |
| `worker/src/structures.ts` (new), `worker/src/index.ts` | `searchStructures`, `POST /v1/structures/search` | 17A |
| `src/lib/industrySites.ts`, `src/components/FindStructure.tsx`, `src/lib/cloud.ts`, `src/components/hustles/IndustrySites.tsx`, `IndustryBuild.tsx` | `FoundStructure` moved; `FindStructure as`; `cloudStructureSearch`; a site found as the shown character | 17B |
| `worker/migrations/0021_home_markets.sql` (new) | `home_markets`, `home_books` | 18A |
| `src/lib/bookFold.ts` (new), `worker/src/scan.ts` | The fold, moved; `foldStructurePage`, `structureSummary` | 18A |
| `src/lib/homeMarket.ts` | `HubState`, `HubLogin`, `HomeBookAnswer` (18A); `HomeHub` for any hub, `hubsFrom`, `hubShort`, `homeSpeaks`, `structureQuote`, `fillCost`, `bookHoldMs`, `ownMarketSaid` (18B); `hubFeeRate` (18D) | 18A, 18B, 18D |
| `worker/src/homeMarkets.ts` (new), `worker/src/index.ts`, `worker/wrangler.toml` (comment) | The hourly round, the routes | 18A |
| `src/lib/industryRank.ts` | `HomeQuote`'s source, sold counts and levels; buying and selling at a hub priced by its own market | 18B |
| `src/lib/cloud.ts`, `src/components/hustles/industryMarket.ts` | `cloudHomeMarkets`, `cloudHomeBook` (18B), `cloudSetHomeMarket`, `cloudDropHomeMarket`, `cloudReadHome` (18C); `useHomeMarkets`, `useHomeHubs`, `useHomeBook`, `useHomeQuotes`, `refreshHomeMarkets` | 18B, 18C |
| `src/components/hustles/industryFinder.ts`, `IndustryBuild.tsx`, `IndustryDetail.tsx` | The hub from the merged list; which price speaks, said | 18B |
| `src/lib/todo.ts`, `src/components/Todo.tsx` | List what you built at a hub you added, priced by the source that speaks | 18B |
| `src/components/hustles/IndustryHome.tsx` (new), `Industry.tsx` | The Home markets section | 18C |
| `src/components/hustles/industryChars.ts`, `IndustryHome.tsx`, `IndustryBuild.tsx` | Each character's orders and journal; the measured fee, Use this | 18D |
| `worker/src/goonmetrics.ts`, `src/lib/homeMarket.ts`, `industryMarket.ts`, `industryFinder.ts` | Where a round starts; types not reached yet | 18E |
| `scripts/check.mjs`, `scripts/check-worker.mjs`, `scripts/pages.mjs` | Tests | every task |
| `docs/notes/industry.md`, `limits.md`, `eve-facts.md`, `cloud.md`, `characters-cloud.md`, `finding-trades.md`, `CLAUDE.md` | Notes | every task |

`.claude/rules/industry.md`'s `paths:` gains each new file in the task that creates it (`src/lib/bookFold.ts`,
`worker/src/{homeMarkets,structures}.ts`, `worker/migrations/0021_home_markets.sql`, `IndustryHome.tsx`). A frontmatter that
doesn't parse loads like an import: keep it valid YAML, and run `head -12 .claude/rules/industry.md` after editing.

`docs/notes/industry.md` gains a `## Stage 4: home markets` section in Task 16, and each later task adds its bullets to it.

---
### Task 16: The structure markets permission, and what logging in again stops

**Files:**
- Modify: `src/lib/config.ts` (`SCOPE.structureMarkets`, its `SCOPE_INFO` entry), `src/lib/watchdog.ts` (`grantSaid`),
  `src/components/Settings.tsx` (the Account tab's permissions line), `scripts/check.mjs`, `scripts/pages.mjs`,
  `docs/notes/industry.md`, `docs/notes/eve-facts.md`, `docs/notes/research.md` (one line in the permission bullet)

**Interfaces:**
- Consumes: `SCOPES`, `SCOPE_INFO` (config.ts); `scopesMissing` (watchdog.ts, unchanged).
- Produces: `SCOPE.structureMarkets` = `'esi-markets.structure_markets.v1'`; `grantSaid(missing: number, total: number): string`
  in `src/lib/watchdog.ts`. Task 18A's Worker spells the same string as `SCOPE_STRUCTURE_MARKETS` (the Worker can't import
  config.ts); this task's tripwire test reads both.

**Why.** The spec puts the permission in `SCOPE`, not `OPTIONAL_SCOPE` (research.md says why for R&D agents: an optional one is
switched on per browser, so a phone that never switched it on logs the main in with a smaller set, which stops the other logins).
The user registered it on the application on 9 October 2026. Once shipped, nothing changes until the user logs in again; that
login, with a different set, stops the main's other logins: the cloud's main login and the phone's (correction 1; an alt's
login is another character's and keeps working, lacking the permission until handed over again). What tells the user today:
Settings → Account's line "1 of 29 not granted. Each must be ticked … then log out and in again here.", which says nothing of the
cloud; `scopesMissing` speaks only after the relog; the alts' cards say "1 permission missing"; the main's cloud login, once EVE
refuses it, goes on To do (`cloudLogin`) and is mailed by the watchdog after ten minutes. So the Account line says it, before
the relog (correction 2), in the order that keeps every login alive: log in here, then hand the cloud the main's login, then log
in on any other device; alts on Characters when wanted. Handing the cloud a login first would stop this browser's own (EVE stops
the earlier logins with another set), which `stoppedBy` already says; the words steer away from it.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, before the final `console.log(failed ? …)`:

```js
console.log('\n--- Industry stage 4: the structure markets permission (Task 16) ---');
{
  const fsP = await import('node:fs');
  const cfg = fsP.readFileSync(new URL('../src/lib/config.ts', import.meta.url), 'utf8');
  const at = cfg.indexOf('export const SCOPE = {');
  const asked = [...cfg.slice(at, cfg.indexOf('} as const;', at)).matchAll(/:\s*'(esi-[a-z_.]+\.v\d)'/g)].map((m) => m[1]);
  const info = [...cfg.slice(cfg.indexOf('export const SCOPE_INFO')).matchAll(/^ {2}'(esi-[a-z_.]+\.v\d)': \{/gm)].map((m) => m[1]);
  // gotchas.md: SCOPE_INFO is the single answer to "what do I need to enable"; a scope added without its entry shows as its raw name.
  eq('every permission asked for has its SCOPE_INFO entry, and every entry is one asked for', [asked.filter((s) => !info.includes(s)), info.filter((s) => !asked.includes(s))], [[], []]);
  eq('  structure markets is asked of every login (SCOPE), never switched on per browser (OPTIONAL_SCOPE stays empty)',
    [asked.includes('esi-markets.structure_markets.v1'), /export const OPTIONAL_SCOPE = \{\s*\} as const;/.test(cfg)], [true, true]);
  const W = await import('../src/lib/watchdog.ts');
  eq('  the Account tab, everything granted', W.grantSaid(0, 29), 'All granted. Everything in the app has what it needs.');
  const one = W.grantSaid(1, 29);
  for (const s of ['1 of 29 not granted.', 'Log in again here to grant it', 'That stops your character’s other logins:', 'then hand the cloud your login again (Settings → Your data)',
    'and log in again on any other device', 'Your alts’ logins keep working; hand each over again on Characters for what needs it.']) has('    one missing: says what logging in again stops, and in what order', one, s);
  has('    two missing: "them"', W.grantSaid(2, 29), 'Log in again here to grant them');
  eq('    never "log out and in again" alone: the old words said nothing of the cloud', /log out and in again here\.$/.test(one), false);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check`
Expected: FAIL `every permission asked for has its SCOPE_INFO entry…` passes already, `structure markets is asked of every login`
fails (`[false, true]`), and `W.grantSaid is not a function`.

- [ ] **Step 3: The permission**

In `src/lib/config.ts`, the last entry of `SCOPE` becomes:

```ts
  agentsResearch: 'esi-characters.read_agents_research.v1', // your R&D agents: which, the field, points a day and points held
  structureMarkets: 'esi-markets.structure_markets.v1', // a structure's own market, read hourly by the cloud for Industry's home prices
} as const;
```

and `SCOPE_INFO` gains, after the R&D agents' entry:

```ts
  'esi-markets.structure_markets.v1': {
    label: 'Structure markets',
    unlocks: 'Home prices from a structure’s own market, for Side hustles → Industry: the cloud reads each home hub hourly with the character you pick, once EVE lets that character use the market.',
    without: 'Home prices come from Goonmetrics alone, and only for the hubs it tracks.',
  },
```

- [ ] **Step 4: The Account tab says what logging in again stops**

Add to `src/lib/watchdog.ts`, after `scopesMissing`:

```ts
/**
 * What Settings → Account says of the permissions this browser's login holds (Industry stage 4, 12 October 2026). A permission
 * added to SCOPE since the last login is missing until the next one, and that login, with a different set of permissions, stops
 * the character's other logins at EVE's own page (eve-facts.md): the cloud's and any other device's. An alt is another character,
 * so its login keeps working without the new permission until handed over again. Said before the relog, since nothing else says
 * it then: `scopesMissing` speaks only once this browser holds the new set, and an alt's card only of what its own login lacks. The
 * order keeps every login alive: here first, then the cloud (the same set, so both live), then other devices.
 */
export function grantSaid(missing: number, total: number): string {
  if (!missing) return 'All granted. Everything in the app has what it needs.';
  const it = missing === 1 ? 'it' : 'them';
  return `${missing} of ${total} not granted. Log in again here to grant ${it} (each must be ticked on your application at developers.eveonline.com first). `
    + 'That stops your character’s other logins: then hand the cloud your login again (Settings → Your data), and log in again on any other device. '
    + `Your alts’ logins keep working; hand each over again on Characters for what needs ${it}.`;
}
```

In `src/components/Settings.tsx`, add `grantSaid` to the import from `'../lib/watchdog'` (`import { errorPredatesLogin, grantSaid,
scopesMissing } from '../lib/watchdog';`), and in `Account()` replace the two branches after the not-logged-in one:

```tsx
              {!granted.length
                ? 'Tick each of these on your application at developers.eveonline.com. Each one is read-only.'
                : grantSaid(missing.length, SCOPES.length)}
```

- [ ] **Step 5: The page check**

In `scripts/pages.mjs`, inside the industry case above `// --- the end of the industry case`:

```js
    // --- Task 16: a login from before the structure markets permission. Settings → Account says what logging in again stops,
    // in the order that keeps every login alive, before anything is stopped (correction 2).
    {
      const cfg = fs.readFileSync(new URL('../src/lib/config.ts', import.meta.url), 'utf8');
      const at = cfg.indexOf('export const SCOPE = {');
      const asked = [...cfg.slice(at, cfg.indexOf('} as const;', at)).matchAll(/:\s*'(esi-[a-z_.]+\.v\d)'/g)].map((m) => m[1]);
      const before = asked.filter((s) => s !== 'esi-markets.structure_markets.v1');
      await page.goto(SEED_PAGE);
      await seed(ledger, { alts: altStore });
      await page.evaluate((sc) => { const a = JSON.parse(localStorage.getItem('jita-ledger:auth')); localStorage.setItem('jita-ledger:auth', JSON.stringify({ ...a, scopes: sc })); }, before);
      await page.goto(`${BASE}#settings/account`);
      await page.reload();
      await page.waitForSelector('text=Permissions', { timeout: 20_000 }).catch(() => problems.push('Settings → Account never drew'));
      await page.waitForTimeout(600);
      const acct = await text();
      for (const s of [`1 of ${asked.length} not granted.`, 'Log in again here to grant it', 'That stops your character’s other logins', 'Your alts’ logins keep working', 'Structure markets'])
        if (!acct.includes(s)) problems.push(`Settings → Account, with a login from before structure markets, doesn’t say “${s}”`);
      if (acct.includes('then log out and in again here.')) problems.push('Settings → Account still says only “log out and in again here”');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}-industry-permission.png` });
    }
```

- [ ] **Step 6: Run everything; plant each rule wrong**

Run: `npm run check && npm run build && LEDGER=industry npm run check-pages`
Expected: all green. Then plant each and see it fail, putting it back after: drop the `SCOPE_INFO` entry (the completeness test
names it); move the permission into `OPTIONAL_SCOPE` (the second test); return the old sentence from `grantSaid` (step 1's words and
the page check both fail).

- [ ] **Step 7: Notes**

- `docs/notes/industry.md`, a new `## Stage 4: home markets` section (spec, plan `docs/superpowers/plans/2026-10-12-industry-stage-4.md`)
  with its first bullet: **The permission** (`SCOPE.structureMarkets`, 12 October 2026): asked of every login, registered by the
  user on 9 October; the user's next login stops the cloud's main login and the main's login on any other device, never an alt's
  (corrections 1 and 2); Settings → Account says so before the relog (`grantSaid`), in the order here, the cloud, other devices,
  alts on Characters when wanted; the sender's login (`MAILER_SCOPES`) is untouched; an alt handed over again gains it
  (`loginAltForCloud` asks `SCOPES`).
- `docs/notes/eve-facts.md`, in the bullet "That rule is per character": add "The structure markets permission (12 October 2026)
  goes the same way: the user's next login stops the cloud's main login and the phone's; the alts' logins keep working without it."
- `docs/notes/research.md`, the permission bullet: add "Structure markets went in `SCOPE` the same way (Industry stage 4); Settings
  → Account now says what the relog stops before it happens (`grantSaid`)."

- [ ] **Step 8: The five checks, a look, and commit**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`. Look at
`SHOTS=.playwright-mcp/industry4/16 LEDGER=industry npm run check-pages` (the permission screenshot, at both widths). Then:

```bash
git add src/lib/config.ts src/lib/watchdog.ts src/components/Settings.tsx scripts/check.mjs scripts/pages.mjs docs/notes/industry.md docs/notes/eve-facts.md docs/notes/research.md
git commit -m "Industry stage 4: structure markets is asked of every login, and Settings says what logging in again stops

Reading a structure's own market needs esi-markets.structure_markets.v1, which the user registered on the application on 9
October. It goes in SCOPE, not OPTIONAL_SCOPE (an optional one is switched on per browser, and a phone that never switched it
on would log the main in with a smaller set). Once shipped, the user's next login asks for it, and a login with a different set
stops the character's other logins: the cloud's main login and the phone's. An alt is another character, so its login keeps
working, lacking the permission until handed over again, which the Characters page already says.

Nothing said that before the relog: Settings' scopesMissing speaks only once this browser holds the new set, and the Account
tab's line, the first thing that shows the permission missing, said only 'log out and in again here'. grantSaid now says what
that stops and the order that keeps every login alive: here, then the cloud, then other devices, alts on Characters. The user
asked for care with logins. The sender's login and handleCallback are untouched.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf"
```

---
### Task 17A: The cloud searches structures as an alt, with the alt's own login

**Files:**
- Create: `worker/src/structures.ts`
- Modify: `worker/src/index.ts` (the route), `scripts/check-worker.mjs`, `.claude/rules/industry.md`, `docs/notes/industry.md`,
  `docs/notes/characters-cloud.md`, `CLAUDE.md` (nothing in the Worker's imports list changes: structures.ts imports no `src/lib`)

**Interfaces:**
- Consumes: `onRoster` (alts.ts); `altReader`, `ledgerReader`, `readerLogin`, `esiGet`, `EveError` (eve.ts); `SCOPE_STRUCTURES`
  (industryJobs.ts); `BadRequest` (sync.ts).
- Produces: `worker/src/structures.ts`: `SCOPE_SEARCH`, `MAX_FOUND` (15), `type FoundStructure = { id: number; name: string;
  systemId: number; system: string; security: number | null; typeId?: number }` (the browser's own shape), `searchStructures(env,
  ledger, char, q): Promise<{ found: FoundStructure[] }>`; `POST /v1/structures/search` with `{ char, q }` → `{ found }`.

**Why.** ESI searches the structures a character can see only with that character's own login, and the browser never holds an
alt's (characters.md). Spec B9: "a cloud search for alts". The search runs as the character asked for, with its login: the
ledger's own, or an alt on its roster; anything else is refused before EVE is asked. It writes nothing: what it found goes back to
the browser, which adds the one picked as a build site (17B) or a home market (18C). A structure the character can't read is left
out, as the browser's `structureInfo` leaves it out; a system is read publicly, once for all the structures in it.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check-worker.mjs`, before the final `console.log(failed ? …)`:

```js
console.log('\n--- the cloud searches structures as an alt, with the alt\'s own login (Task 17A) ---');
{
  const { searchStructures } = await import('../worker/src/structures.ts');
  const SEARCH = 'esi-search.search_structures.v1', READ = 'esi-universe.read_structures.v1';
  const setup = async (altScopes = [...SCOPES, SEARCH, READ]) => {
    const db = d1();
    await keepKey(db, MAIN, 'main', MAIN, 'Main', [...SCOPES, SEARCH, READ]);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', altScopes);
    db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', ALT, MAIN, 'Miner Two', Date.now());
    return { db, env: testEnv(db) };
  };
  const BELL = 1049999999999, BYZ = 1046664001931, HIDDEN = 1048888888888;
  // Whose login a call carried: the character in its access token's `sub`, or null for a public read.
  const whoAsked = (init) => { const t = (init.headers?.Authorization ?? '').replace('Bearer ', ''); return t ? JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()).sub : null; };
  const routes = (seen) => [
    [`/characters/${ALT}/search/`, (url, init) => { seen.push(['search', whoAsked(init), url.searchParams.get('categories'), url.searchParams.get('search'), url.searchParams.get('strict')]); return { structure: [BELL, HIDDEN, BYZ] }; }],
    [`/universe/structures/${BELL}/`, (url, init) => { seen.push(['structure', whoAsked(init)]); return { name: 'UALX-3 - Mothership Bellicose', owner_id: 98000001, solar_system_id: 30004807, type_id: 35834 }; }],
    [`/universe/structures/${BYZ}/`, (url, init) => { seen.push(['structure', whoAsked(init)]); return { name: 'UALX-3 - 1st Byzantigoon', owner_id: 98000002, solar_system_id: 30004807, type_id: 35834 }; }],
    [`/universe/structures/${HIDDEN}/`, () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })],
    ['/universe/systems/30004807/', (url, init) => { seen.push(['system', whoAsked(init)]); return { name: 'UALX-3', security_status: -0.18676190078258514, constellation_id: 20000703 }; }],
  ];
  {
    const { db, env } = await setup();
    const before = counts(db), seen = [];
    const f = stubFetch(routes(seen));
    const r = await searchStructures(env, MAIN, ALT, ' Bell ');
    f.restore();
    eq('  found as the alt: what it can read, in ESI\'s order; one it can\'t read left out', r.found, [
      { id: BELL, name: 'UALX-3 - Mothership Bellicose', systemId: 30004807, system: 'UALX-3', security: -0.18676190078258514, typeId: 35834 },
      { id: BYZ, name: 'UALX-3 - 1st Byzantigoon', systemId: 30004807, system: 'UALX-3', security: -0.18676190078258514, typeId: 35834 }]);
    eq('    the search and each structure with the alt\'s own login; the system read publicly, once', seen, [
      ['search', `CHARACTER:EVE:${ALT}`, 'structure', 'Bell', 'false'], ['structure', `CHARACTER:EVE:${ALT}`], ['system', null], ['structure', `CHARACTER:EVE:${ALT}`]]);
    eq('    nothing written under anyone', counts(db), before);
  }
  {
    const { env } = await setup();
    const f = stubFetch(routes([]));
    await rejects('  a character not on the roster is refused before EVE is asked', () => searchStructures(env, MAIN, 900555, 'Bellicose'), /isn’t one of yours/);
    await rejects('  fewer than three letters', () => searchStructures(env, MAIN, ALT, 'Be'), /three letters/);
    eq('    neither asked EVE anything', f.calls.length, 0);
    f.restore();
  }
  {
    const { env } = await setup(SCOPES);
    const f = stubFetch(routes([]));
    await rejects('  an alt\'s login handed over without the search permission: said, with where to fix it', () => searchStructures(env, MAIN, ALT, 'Bellicose'), /Miner Two’s login was handed over without EVE’s permission to search structures: hand it over again on Characters/);
    eq('    and EVE wasn\'t asked', f.calls.length, 0);
    f.restore();
  }
  {
    const { db, env } = await setup();
    db.run(`DELETE FROM keys WHERE purpose = 'alt:${ALT}'`);
    await rejects('  an alt with no login kept: said', () => searchStructures(env, MAIN, ALT, 'Bellicose'), /holds no login for Miner Two/);
  }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check`
Expected: FAIL, `Cannot find module '…/worker/src/structures.ts'` (and the "every Worker module loads" list doesn't have it yet).

- [ ] **Step 3: The search**

Create `worker/src/structures.ts`:

```ts
/**
 * The cloud's structure search, for a character whose login the browser doesn't hold (docs/notes/industry.md, stage 4; spec B9).
 * ESI searches the structures a character can see only with that character's own login, and an alt's is kept by the cloud alone
 * (docs/notes/characters.md). Run as the character asked for: the ledger's own, or an alt on its roster; anything else is refused
 * before EVE is asked. Read-only, and nothing is written: what it finds goes back to the browser, which adds the one picked as a
 * build site or a home market. A structure the character can't read is left out, as the browser's `structureInfo` leaves it out.
 */
import { onRoster } from './alts';
import { altReader, EveError, esiGet, ledgerReader, readerLogin } from './eve';
import { SCOPE_STRUCTURES } from './industryJobs';
import { BadRequest } from './sync';

export const SCOPE_SEARCH = 'esi-search.search_structures.v1';
/** As the browser's FindStructure: the first fifteen found. */
export const MAX_FOUND = 15;

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };
/** The browser's FindStructure shape (src/lib/industrySites.ts), so either search fills the same list. */
export type FoundStructure = { id: number; name: string; systemId: number; system: string; security: number | null; typeId?: number };

export async function searchStructures(env: Env, ledger: number, char: number, q: string): Promise<{ found: FoundStructure[] }> {
  const query = (q ?? '').trim();
  if (query.length < 3) throw new BadRequest('Type at least three letters of its name.');
  if (char !== ledger && !(await onRoster(env.DB, ledger, char))) throw new BadRequest('That character isn’t one of yours.');
  const main = char === ledger;
  const where = main ? 'under Settings → Your data' : 'on Characters';
  const named = main ? 'you' : (await env.DB.prepare('SELECT name FROM alts WHERE char_id = ?1').bind(char).first<{ name: string | null }>())?.name ?? 'that character';
  const login = await readerLogin(env, main ? ledgerReader(ledger) : altReader(ledger, char));
  if (!login) throw new BadRequest(`The cloud holds no login for ${named}: hand it over ${where} first.`);
  const lacks = [SCOPE_SEARCH, SCOPE_STRUCTURES].find((s) => !login.scopes.includes(s));
  if (lacks) throw new BadRequest(`${main ? 'Your' : `${login.name}’s`} login was handed over without EVE’s permission to ${lacks === SCOPE_SEARCH ? 'search structures' : 'read structures'}: hand it over again ${where}.`);
  const { data } = await esiGet<{ structure?: number[] }>(`/characters/${char}/search/`, { token: login.access, query: { categories: 'structure', search: query, strict: 'false' } });
  const systems = new Map<number, { name: string; security: number } | null>();
  const found: FoundStructure[] = [];
  for (const id of (data.structure ?? []).slice(0, MAX_FOUND)) {
    let s: { name: string; solar_system_id: number; type_id?: number };
    try { s = (await esiGet<typeof s>(`/universe/structures/${id}/`, { token: login.access })).data; }
    catch (e) { if (e instanceof EveError && (e.status === 403 || e.status === 404)) continue; throw e; }
    if (!systems.has(s.solar_system_id)) {
      // A system is public: read without the login, once for all the structures in it.
      systems.set(s.solar_system_id, await esiGet<{ name: string; security_status: number }>(`/universe/systems/${s.solar_system_id}/`)
        .then((r) => ({ name: r.data.name, security: r.data.security_status }), () => null));
    }
    const sys = systems.get(s.solar_system_id) ?? null;
    found.push({ id, name: s.name, systemId: s.solar_system_id, system: sys?.name ?? '', security: sys?.security ?? null, ...(s.type_id != null ? { typeId: s.type_id } : {}) });
  }
  return { found };
}
```

In `worker/src/index.ts`, import it (`import { searchStructures } from './structures';`) and add the route after the
`/v1/home/prices` one:

```ts
      // A structure search as one of your characters, with its own login (structures.ts): the browser holds no alt's login.
      if (url.pathname === '/v1/structures/search' && request.method === 'POST') {
        const body = (await request.json()) as { char?: unknown; q?: unknown };
        const char = Number(body.char);
        if (!Number.isInteger(char) || char <= 0) throw new BadRequest('Say which character searches');
        return json(await searchStructures(env, who.charId, char, String(body.q ?? '')), 200, c);
      }
```

- [ ] **Step 4: Run the tests, see them pass; plant each rule wrong**

Run: `npm run check`. Expected: `all passed` twice (the "every Worker module loads" list now includes `structures.ts`). Plant and
see each fail, putting it back after: drop the `onRoster` check (the not-on-roster test then reaches EVE); search with
`ledgerReader(ledger)` for every character (the `seen` test names the main); skip the scope check (the permission test asks EVE);
drop the `systems` map (the system is read twice).

- [ ] **Step 5: Notes and commit**

- `docs/notes/industry.md`, stage 4: **The cloud's structure search** (`POST /v1/structures/search`, `worker/src/structures.ts`):
  run as the main or an alt on its roster with that character's own login, refused before EVE is asked otherwise or without the
  search and structure permissions (said, with where to hand the login over); writes nothing; a structure the character can't read
  is left out; systems read publicly.
- `docs/notes/characters-cloud.md`, after "What isn't done for an alt": "**An alt's login now also serves two requests of the
  owner's** (Industry stage 4): a structure search when a site or home market is added as that alt (`POST /v1/structures/search`),
  and the hourly read of a home market the alt is the reader of (`home_books`, keyed by structure, never under the alt or the
  main)."
- `.claude/rules/industry.md` `paths:`: `"worker/src/{industryNpc,goonmetrics,industryJobs,copies,structures}.ts"`.

Run the five checks, then:

```bash
git add worker/src/structures.ts worker/src/index.ts scripts/check-worker.mjs .claude/rules/industry.md docs/notes/industry.md docs/notes/characters-cloud.md
git commit -m "Industry stage 4: the cloud searches structures as an alt, with the alt's own login

ESI searches the structures a character can see only with that character's own login, and the browser never holds an alt's,
so adding a build site or a home market as an alt (spec B9) needs the cloud to search. POST /v1/structures/search runs as the
main or an alt on its roster, refuses anyone else and a login without the search and structure permissions before asking EVE
(saying where to hand it over), leaves out a structure the character can't read as the browser's structureInfo does, reads each
system once and publicly, and writes nothing. Tested on the stand-in: the search and each structure carry the alt's token, the
system none, and no table changes under the main or the alt.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf"
```

---
### Task 17B: FindStructure searches as any character

**Files:**
- Modify: `src/lib/industrySites.ts` (`FoundStructure` moves here), `src/components/FindStructure.tsx` (`as`, the cloud's search),
  `src/lib/cloud.ts` (`cloudStructureSearch`), `src/components/hustles/IndustrySites.tsx` (search as the shown character; the
  `mainName` prop goes), `src/components/hustles/IndustryBuild.tsx` (stops passing `mainName` to IndustrySites), `scripts/pages.mjs`,
  `docs/notes/industry.md`

**Interfaces:**
- Consumes: `POST /v1/structures/search` (17A).
- Produces: `type FoundStructure` exported from `src/lib/industrySites.ts` (and re-exported by `FindStructure.tsx`, so existing
  imports keep working); `type Searcher = { charId: number; name: string; isMain: boolean }`; `FindStructure`'s new optional prop
  `as?: Searcher`; `cloudStructureSearch(char: number, q: string): Promise<{ found: FoundStructure[] }>` in `src/lib/cloud.ts`.
  Task 18C passes `as` from its own "Search as" choice.

**Why.** The Build tab's "A structure by name" searched as the browser's login even under an alt, and said so ("Grim Alt's own
aren't searched here"). Now it searches as the shown character: the main from this browser, an alt through the cloud. Every state
of the cloud's answer is said: switched off in this browser, a version behind (404), the Worker's own words for a login it can't use.

- [ ] **Step 1: The type moves to the lib**

In `src/lib/industrySites.ts`, above `structureSite`:

```ts
/** A structure found by name (FindStructure, or the cloud's search as an alt): its ID, name, system, security and type. */
export type FoundStructure = { id: number; name: string; systemId: number; system: string; security: number | null; typeId?: number };
```

In `src/lib/cloud.ts`, import it (`import type { FoundStructure } from './industrySites';`) and add after `cloudCopies`:

```ts
/**
 * A structure search run by the cloud as one of your characters, with that character's own login (`POST /v1/structures/search`):
 * for an alt, whose login the browser never holds. A Worker a version behind answers 404 (the error's `status`); the Worker's own
 * words say a login it can't use (none kept, or handed over without the permission).
 */
export const cloudStructureSearch = (char: number, q: string) => call<{ found: FoundStructure[] }>('/v1/structures/search', { method: 'POST', body: JSON.stringify({ char, q }) });
```

- [ ] **Step 2: FindStructure as any character**

Replace `src/components/FindStructure.tsx` with:

```tsx
import { useState } from 'react';
import { getAuth } from '../lib/auth';
import { cloudEnabled, cloudStructureSearch } from '../lib/cloud';
import { esi } from '../lib/esi';
import { MINUS } from '../lib/format';
import type { FoundStructure } from '../lib/industrySites';
import { toast } from '../lib/toast';
import { structureInfo, system } from '../lib/universe';

export type { FoundStructure };
/** Who searches: the main with this browser's login; any other character through the cloud, with its own login there. */
export type Searcher = { charId: number; name: string; isMain: boolean };

/**
 * Find a structure by name (esi-search.search_structures.v1): ESI searches the structures a character can see, and each one found
 * is read for its name, type and system (esi-universe.read_structures.v1). Shared by Reprocessing (a refinery) and the Industry tab
 * (a build site, a home market): each page says what a structure is to it (`describe`). The main searches with this browser's
 * login; an alt (`as`) through the cloud (`POST /v1/structures/search`), since the browser never holds an alt's login.
 */
export function FindStructure({ onPick, picked, describe, label = 'Find a structure by name', as }: {
  onPick: (f: FoundStructure) => void; picked?: string; describe: (f: FoundStructure) => string; label?: string; as?: Searcher;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundStructure[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const viaCloud = !!as && !as.isMain;
  const find = async () => {
    if (q.trim().length < 3) { toast('Type at least three letters of its name.', 'warn'); return; }
    setWhy(null);
    if (viaCloud) {
      if (!cloudEnabled()) { setFound(null); setWhy(`Searching as ${as!.name} goes through the cloud, which isn’t on in this browser (Settings → Your data).`); return; }
      setBusy(true);
      try { setFound((await cloudStructureSearch(as!.charId, q.trim())).found); }
      catch (e) { setFound(null); setWhy((e as { status?: number }).status === 404 ? `The cloud is a version behind: searching as ${as!.name} comes once it’s updated.` : e instanceof Error ? e.message : String(e)); }
      finally { setBusy(false); }
      return;
    }
    const a = getAuth();
    if (!a) { toast('Log in first.', 'warn'); return; }
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
      {why && <p className="note small" style={{ margin: 0 }} data-industry="find-why">{why}</p>}
      {found && (found.length ? (
        <div className="col" style={{ gap: 2 }}>
          {found.map((f) => (
            <button key={f.id} type="button" className="link-btn" style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={() => { onPick(f); setFound(null); setQ(''); }}>
              {f.name} <span className="faint">· {f.system}{f.security != null ? ` ${f.security < 0 ? MINUS : ''}${Math.abs(f.security).toFixed(1)}` : ''} · {describe(f)}</span>
            </button>
          ))}
        </div>
      ) : <p className="note small" style={{ margin: 0 }}>No structure {viaCloud ? `${as!.name} can` : 'you can'} see by that name.</p>)}
    </div>
  );
}
```

(The old `if (!a || q.trim().length < 3)` message is split: the letters first, then the login. Reprocessing passes no `as`: it
searches as the main, as before.)

- [ ] **Step 3: Where you build searches as the shown character**

In `src/components/hustles/IndustrySites.tsx`, drop `mainName` from the props (`export function IndustrySites({ c, ix, graph, chars }:
{ c: IndustryChar; ix: Indexed; graph: Graph; chars: IndustryChar[] })`) and replace the `adding === 'name'` block:

```tsx
          {adding === 'name' && (!c.isMain || (hasScope(SCOPE.search) && hasScope(SCOPE.structures)) ? (
            <div className="col" style={{ gap: 6 }}>
              <FindStructure label="Find a structure to build in by name" as={c} onPick={(f) => add(structureSite(f))}
                describe={(f) => { const k = kindOfType(f.typeId); return k === 'other' ? 'no manufacturing bonus the app knows' : KIND_SAID[k]; }} />
              <p className="note small" style={{ margin: 0 }} data-industry="search-as">{c.isMain ? 'Searches as you: the structures EVE lets you see.'
                : `Searches as ${c.name}, through the cloud with ${c.name}’s own login: the structures EVE lets ${c.name} see.`}</p>
            </div>
          ) : <p className="note small" style={{ margin: 0 }}>Log in again: finding a structure by name needs EVE’s permission to search structures.</p>)}
```

In `src/components/hustles/IndustryBuild.tsx`, the call becomes `<IndustrySites c={c} ix={ix} graph={graph} chars={chars} />`
(`mainName` is still IndustryBuild's own prop: IndustryDetail uses it).

- [ ] **Step 4: The page check**

In `scripts/pages.mjs`, inside the industry case above `// --- the end of the industry case`:

```js
    // --- Task 17B: a structure found by name as an alt goes through the cloud, as that alt; the cloud a version behind is said.
    {
      let searched = null, answer = { found: [{ id: 1049999999999, name: 'UALX-3 - Mothership Bellicose', systemId: 30004807, system: 'UALX-3', security: -0.1868, typeId: 35826 }] };
      CLOUD['/v1/structures/search'] = (url, req, json) => { searched = JSON.parse(req.postData() ?? '{}'); return answer === 404 ? json({ error: 'Not found' }, 404) : json(answer); };
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, industry: DOC, cloud: CLOUD_STATE }, { alts: altStore, cache: { prospects: SCAN } });
      await page.goto(`${BASE}#hustles/industry/build`);
      await page.reload();
      await page.waitForSelector('[data-industry="build"]', { timeout: 20_000 }).catch(() => problems.push('Build never drew (17B)'));
      await showFor('Builder Alt');
      if (!(await page.locator('[data-industry="sites"]').isVisible().catch(() => false))) await page.locator('button.panel-toggle', { hasText: 'Where you build' }).click().catch(() => undefined);
      await page.locator('[aria-label="Add a site"] button', { hasText: 'A structure by name' }).click().catch((e) => problems.push(`couldn’t pick “A structure by name”: ${e.message.split('\n')[0]}`));
      const asText = await text('[data-industry="search-as"]');
      if (!asText.includes('Searches as Builder Alt, through the cloud with Builder Alt’s own login')) problems.push(`under Builder Alt, the search doesn’t say it searches as the alt: “${asText}”`);
      await page.locator('input[aria-label="Find a structure to build in by name"]').fill('Bellicose');
      await page.locator('[data-industry="add-site"] button', { hasText: 'Find' }).click();
      await page.waitForTimeout(800);
      if (searched?.char !== 900091 || searched?.q !== 'Bellicose') problems.push(`the cloud wasn’t asked to search as Builder Alt: ${JSON.stringify(searched)}`);
      if (!(await text('[data-industry="add-site"]')).includes('UALX-3 - Mothership Bellicose')) problems.push('what the cloud found as Builder Alt isn’t listed');
      answer = 404;
      await page.locator('[data-industry="add-site"] button', { hasText: 'Find' }).click();
      await page.waitForTimeout(800);
      if (!(await text('[data-industry="find-why"]')).includes('The cloud is a version behind: searching as Builder Alt comes once it’s updated.')) problems.push('a cloud without the search route isn’t said as a version behind');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}-industry-search-as-alt.png` });
      await showFor('Owner');
    }
```

(Builder Alt is `BUILDER`, 900091, in the case's roster. If "Where you build" is shut by the kept view, the step opens it; the
selectors follow the Task 4B block that adds a site by name.)

- [ ] **Step 5: Run everything; plant; notes; commit**

Run: `npm run check && npm run build && LEDGER=industry npm run check-pages`, then plant and see it fail: make `viaCloud` always false
(the page check's `searched` stays null). Notes: `docs/notes/industry.md`, stage 4: **FindStructure as any character** (`as`; the
main with this browser's login, an alt through the cloud; switched off, a version behind and the Worker's words each said; Where
you build searches as the shown character; Reprocessing as the main). Run the five checks, look at the screenshot at both widths, then:

```bash
git add src/lib/industrySites.ts src/lib/cloud.ts src/components/FindStructure.tsx src/components/hustles/IndustrySites.tsx src/components/hustles/IndustryBuild.tsx scripts/pages.mjs docs/notes/industry.md
git commit -m "Industry stage 4: a structure is found as the shown character, an alt through the cloud

Where you build searched as the browser's login whatever character was shown, and said that an alt's own structures weren't
searched. FindStructure now takes the searcher: the main with this browser's login, as before; an alt through the cloud's
search, which runs with the alt's own login. The cloud switched off in this browser, a Worker a version behind (404) and the
Worker's own words for a login it can't use are each said. FoundStructure moves to industrySites.ts so cloud.ts can type the
answer without importing a component. Reprocessing keeps searching as the main.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf"
```

---
### Task 18A: The cloud reads each home market hourly, with its reader's login

**Files:**
- Create: `worker/migrations/0021_home_markets.sql`, `src/lib/bookFold.ts`, `worker/src/homeMarkets.ts`
- Modify: `worker/src/scan.ts` (the fold imported from `bookFold.ts`), `src/lib/homeMarket.ts` (the shared answer types),
  `worker/src/index.ts` (the `37` chain, five routes), `worker/wrangler.toml` (its triggers comment), `scripts/check.mjs`,
  `scripts/check-worker.mjs`, `.claude/rules/industry.md`, `docs/notes/industry.md`, `docs/notes/limits.md`,
  `docs/notes/eve-facts.md`, `docs/notes/cloud.md`, `docs/notes/finding-trades.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `INDUSTRY.watch` (`src/data/industryTypes.json`); `HOME_HUBS` (`src/lib/homeMarket.ts`); `onRoster` (alts.ts);
  `altPurpose`, `altReader`, `ledgerReader`, `readerLogin`, `esiGet`, `EveError`, `HEADERS` (eve.ts); `BadRequest` (sync.ts).
- Produces (later tasks rely on these exact names):
  - `src/lib/bookFold.ts`: `type RawOrder`, `LEVELS` (7), `type Agg`, `fold(aggs, o, deep = true)`, `plainBook(a, at): Book`,
    `HOME_LEVELS` (5), `type StructureRow = [buys: [number, number][], sells: [number, number][], buyOrders: number, sellOrders:
    number, sold: [sell: number, buy: number, singleSell: number, singleBuy: number]]`, `foldStructurePage(aggs, orders, want)`,
    `structureSummary(aggs): Record<number, StructureRow>`.
  - `src/lib/homeMarket.ts`: `type HubLogin = 'ok' | 'permission' | 'refused' | 'none' | 'notYours'`, `type HubBook`, `type
    HubState`, `type HomeBookAnswer = { hub: number; at: string; rows: Record<string, StructureRow> } | null`.
  - `worker/src/homeMarkets.ts`: `SCOPE_STRUCTURE_MARKETS`, `BOOK_DUE_MS` (50 min), `BOOKS_BUDGET_MS` (14 min), `MAX_PAGES` (300),
    `MAX_ADDED` (10), `type Hub`, `hubsOf(db, ledger)`, `type BookRead`, `readHomeBook(env, ledger, hub, o?)`,
    `refreshHomeBooks(env, now?, o?)`, `homeMarketsFor(db, ledger)`, `homeBookFor(db, ledger, hub)`, `setHomeMarket(db, ledger, body,
    now?)`, `dropHomeMarket(db, ledger, hub, now?)`, `readHomeNow(env, ledger, hub)`.
  - Routes: `GET /v1/home/markets` → `{ hubs: HubState[] }`; `POST /v1/home/markets` `{ hub, reader, name?, systemId? }` → `{ ok:
    true }`; `DELETE /v1/home/markets?hub=` → `{ ok: true }`; `GET /v1/home/book?hub=` → `HomeBookAnswer`; `POST /v1/home/read?hub=`
    → `HubState`.

**Why the shapes.** A hub is a structure with a name and a reader (spec): Goonmetrics' two read with the main unless you say
otherwise (correction 3), and any you add. `home_markets` holds every choice (keyed by ledger and structure, with the system and
region the finder needs: correction 4); `home_books` holds one row a structure: the last good read (`at`, `data`, `pages`,
`types`) apart from the last try (`tried`, `reader`, `error`, `refused_at`). A read folds page by page, keeping only the watch
set's types (2,916), five levels a side, order counts and what the live orders sold: about 150 bytes a type, well under D1's 2 MB
a row. A read cut short, or with a page failed, is never stored (correction 5). `refused_at` is when this reader was first refused
in a row; a read clears it; another failure keeps it (a 500 says nothing of access); another reader starts it afresh.

**When it reads** (correction 7). Last on the `37` chain, after the copy round: every hub whose last try is 50 minutes old, least
recently read first (by `at`, so a hub cut short goes first next hour), no page asked for past 14 minutes from the cron's time. A
reader whose login can't read (no permission, refused, none kept, not one of yours) is skipped before EVE is asked and not stamped:
the list says why from the keys (`login`). Not a watched job. A refused hub is asked again hourly. `POST /v1/home/read` reads one at
once (after adding, or Read it now), with no deadline (a request has no wall limit).

- [ ] **Step 1: The migration**

Create `worker/migrations/0021_home_markets.sql`:

```sql
-- Home markets for the Industry tab (worker/src/homeMarkets.ts, docs/notes/industry.md, stage 4). A structure's own market, read
-- hourly by the cloud with the login of the character you pick (its reader), for the watch set's types only.
-- home_markets: every choice you make, keyed by ledger and structure. Goonmetrics' two hubs are read with the main without a row;
-- a row gives one of them another reader or switches it off (removed_at), or adds a hub, with the system and region the finder
-- needs (read publicly when it was added).
-- home_books: one row a structure: its last good read (at, data, pages, types; at 0 = never read) apart from its last try (tried,
-- reader, error), and since when that reader has been refused by the structure's access list (refused_at). A read cut short is never
-- stored. Only adds tables: old code runs on it as before.
CREATE TABLE IF NOT EXISTS home_markets (
  ledger INTEGER NOT NULL,
  structure_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  system_id INTEGER NOT NULL,
  region_id INTEGER NOT NULL,
  reader INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  removed_at INTEGER,
  PRIMARY KEY (ledger, structure_id)
);
CREATE TABLE IF NOT EXISTS home_books (
  structure_id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  pages INTEGER,
  types INTEGER NOT NULL DEFAULT 0,
  tried INTEGER NOT NULL DEFAULT 0,
  reader INTEGER,
  error TEXT,
  refused_at INTEGER
);
```

- [ ] **Step 2: Write the failing tests**

Add to `scripts/check.mjs`, before the final `console.log(failed ? …)`:

```js
console.log('\n--- Industry stage 4: the fold the scan and a structure\'s read share (bookFold.ts, Task 18A) ---');
{
  const F = await import('../src/lib/bookFold.ts');
  const o = (id, type, buy, price, remain, total = remain, duration = 90, loc = 60003760) => ({ order_id: id, type_id: type, location_id: loc, is_buy_order: buy, price, volume_remain: remain, volume_total: total, duration });
  const aggs = new Map();
  for (const x of [o(1, 34, false, 5.1, 1000, 1500), o(2, 34, false, 5.0, 200), o(3, 34, true, 4.5, 800, 1000), o(4, 34, false, 5.2, 10, 10, 365)]) F.fold(aggs, x);
  const a = aggs.get(34);
  eq('the fold, moved: levels best first, order counts, what the live orders sold, NPCs in the book', F.plainBook(a, 't'), {
    at: 't', bestBuy: 4.5, bestSell: 5, buyOrders: 1, sellOrders: 3, topBuys: [{ price: 4.5, volume: 800 }], topSells: [{ price: 5, volume: 200 }, { price: 5.1, volume: 1000 }, { price: 5.2, volume: 10 }],
    npcSell: true, sold: { sell: 500, buy: 200, single: { sell: 0, buy: 0 }, orders: { sell: 3, buy: 1 } } });
  eq('  the scan\'s queue count: every sell price within twice the best ask', [...a.deep.entries()].sort((x, y) => x[0] - y[0]), [[5, 200], [5.1, 1000], [5.2, 10]]);
  const BELL = 1049999999999;
  const s = new Map();
  F.foldStructurePage(s, [o(1, 34, false, 5.1, 1000, 1500, 90, BELL), o(2, 44992, false, 5e6, 3, 3, 90, BELL), o(3, 35, true, 11, 1, 1, 90, BELL)], new Set([34, 35]));
  eq('a structure\'s page: the watched types only, and no queue count kept', [[...s.keys()].sort((x, y) => x - y), s.get(34).deep.size], [[34, 35], 0]);
  const deepBook = new Map();
  for (let i = 0; i < 7; i++) F.fold(deepBook, o(10 + i, 34, false, 5 + i, 10 + i), false);
  eq('  its summary: five levels a side as [price, units], order counts, and sold [sell, buy, single sell, single buy]', F.structureSummary(new Map([...s, [36, deepBook.get(34)]])), {
    34: [[], [[5.1, 1000]], 0, 1, [500, 0, 0, 0]], 35: [[[11, 1]], [], 1, 0, [0, 0, 0, 1]], 36: [[], [[5, 10], [6, 11], [7, 12], [8, 13], [9, 14]], 0, 7, [0, 0, 0, 0]] });
  eq('  five levels', F.HOME_LEVELS, 5);
}
```

Add to `scripts/check-worker.mjs`, before the final `console.log(failed ? …)`:

```js
console.log('\n--- home markets: a structure\'s own market, read hourly by the cloud with its reader\'s login (Task 18A) ---');
{
  const H = await import('../worker/src/homeMarkets.ts');
  const UALX = 1046664001931, CJ = 1049588174021, BELL = 1049999999999;
  const MARKETS = 'esi-markets.structure_markets.v1';
  const NOW = Date.parse('2026-10-12T13:38:00Z'), HOUR = 3_600_000;
  const want = new Set([34, 35, 25894]);
  const o = (id, type, buy, price, remain, total = remain) => ({ order_id: id, type_id: type, location_id: BELL, is_buy_order: buy, price, volume_remain: remain, volume_total: total, min_volume: 1, duration: 90, issued: '2026-10-12T10:00:00Z', range: 'station' });
  const reply = (body, status = 200, pages = 1) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Pages': String(pages) } });
  const pagesOf = (list) => (url) => reply(list[Number(url.searchParams.get('page') ?? 1) - 1] ?? [], 200, list.length);
  const whoAsked = (init) => { const t = (init.headers?.Authorization ?? '').replace('Bearer ', ''); return t ? JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()).sub : null; };
  const PAGE1 = [o(1, 34, false, 5.1, 1000, 1500), o(2, 34, false, 5.0, 200), o(3, 34, true, 4.5, 800, 1000), o(4, 44992, false, 5e6, 3)];
  const PAGE2 = [o(5, 25894, false, 7.2e6, 4, 6), o(6, 34, false, 5.0, 300), o(7, 35, true, 11, 1, 1)];
  const setup = async ({ mainScopes = [...SCOPES, MARKETS], altScopes = [...SCOPES, MARKETS] } = {}) => {
    const db = d1();
    await keepKey(db, MAIN, 'main', MAIN, 'Main', mainScopes);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', altScopes);
    db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', ALT, MAIN, 'Miner Two', Date.now());
    return { db, env: testEnv(db) };
  };
  const book = (db, id) => db.rows('SELECT at, tried, reader, error, refused_at AS refusedAt, pages, types FROM home_books WHERE structure_id = ?', id)[0] ?? null;
  const addBell = async (db, reader = ALT) => {
    const f = stubFetch([
      ['/universe/systems/30004807/', (url, init) => (init.headers?.Authorization ? reply({ error: 'a public read sent a login' }, 400) : { name: 'UALX-3', constellation_id: 20000703 })],
      ['/universe/constellations/20000703/', { region_id: 10000061 }],
    ]);
    try { await H.setHomeMarket(db, MAIN, { hub: BELL, name: 'UALX-3 - Mothership Bellicose', systemId: 30004807, reader }, NOW); } finally { f.restore(); }
  };
  const round = async (env, routes, now = NOW, opts = {}) => { const f = stubFetch(routes); try { return { r: await H.refreshHomeBooks(env, now, { want, ...opts }), calls: f.calls }; } finally { f.restore(); } };
  const refused = () => reply({ error: 'Market access denied' }, 403);

  // The defaults, a hub added, and a round reading all three.
  {
    const { db, env } = await setup();
    eq('  the defaults: Goonmetrics\' two, read with the main, with no row in D1', (await H.hubsOf(db, MAIN)).map((h) => [h.id, h.reader, h.kept, h.off]), [[UALX, MAIN, 'default', false], [CJ, MAIN, 'default', false]]);
    await addBell(db);
    eq('  a hub added: its system and region (read publicly), and its reader', db.rows('SELECT ledger, structure_id AS id, name, system_id AS sys, region_id AS reg, reader, removed_at AS gone FROM home_markets'),
      [{ ledger: MAIN, id: BELL, name: 'UALX-3 - Mothership Bellicose', sys: 30004807, reg: 10000061, reader: ALT, gone: null }]);
    const before = counts(db), seen = [];
    const { r } = await round(env, [
      [`/markets/structures/${UALX}/`, (url, init) => { seen.push(['ualx', whoAsked(init)]); return refused(); }],
      [`/markets/structures/${CJ}/`, (url, init) => { seen.push(['cj', whoAsked(init)]); return refused(); }],
      [`/markets/structures/${BELL}/`, (url, init) => { seen.push(['bell', whoAsked(init), url.searchParams.get('page')]); return pagesOf([PAGE1, PAGE2])(url); }],
    ]);
    eq('  one round reads every hub: Goonmetrics\' two refused, Bellicose read with the alt\'s own login, page by page', [r.done, seen.sort((x, y) => String(x).localeCompare(String(y)))],
      [{ [UALX]: 'refused', [CJ]: 'refused', [BELL]: 'read' }, [['bell', `CHARACTER:EVE:${ALT}`, '1'], ['bell', `CHARACTER:EVE:${ALT}`, '2'], ['cj', `CHARACTER:EVE:${MAIN}`], ['ualx', `CHARACTER:EVE:${MAIN}`]]]);
    eq('    nothing written under the main or the alt: a market is nobody\'s records', counts(db), before);
    eq('    the read kept: its time, two pages, the watched types only (PLEX left out)', book(db, BELL), { at: NOW, tried: NOW, reader: ALT, error: null, refusedAt: null, pages: 2, types: 3 });
    const got = await H.homeBookFor(db, MAIN, BELL);
    eq('    each type\'s best levels, its order counts and what its live orders sold', [got.at, got.rows[34], got.rows[25894], got.rows[35]], [new Date(NOW).toISOString(),
      [[[4.5, 800]], [[5, 500], [5.1, 1000]], 1, 3, [500, 200, 0, 0]], [[], [[7200000, 4]], 0, 1, [2, 0, 0, 0]], [[[11, 1]], [], 1, 0, [0, 0, 0, 1]]]);
    eq('    a refusal kept: when, by whom, why, and nothing read', book(db, UALX), { at: 0, tried: NOW, reader: MAIN, error: 'ESI 403: Market access denied', refusedAt: NOW, pages: null, types: 0 });
    eq('    a hub never read: no book', await H.homeBookFor(db, MAIN, UALX), null);
    const list = (await H.homeMarketsFor(db, MAIN)).hubs;
    eq('  GET /v1/home/markets: each hub, its reader and login, its own reads', list.map((h) => [h.id, h.kept, h.off, h.reader, h.readerName, h.readerIsMain, h.login, h.book?.refusedAt ?? null, h.book?.types ?? null]), [
      [UALX, 'default', false, MAIN, 'Main', true, 'ok', new Date(NOW).toISOString(), 0], [CJ, 'default', false, MAIN, 'Main', true, 'ok', new Date(NOW).toISOString(), 0],
      [BELL, 'added', false, ALT, 'Miner Two', false, 'ok', null, 3]]);
    // Within the hour nothing is asked again; an hour on, every hub again, least recently read first: by its last good read, not its
    // last try (the two refused were tried ten minutes after Bellicose was read, so by the try Bellicose would go first).
    eq('  40 minutes on: nothing asked', (await round(env, [], NOW + 40 * 60_000)).calls.length, 0);
    db.run('UPDATE home_books SET tried = ? WHERE structure_id IN (?, ?)', NOW + 10 * 60_000, UALX, CJ);
    const order = [];
    const again = await round(env, [
      [`/markets/structures/${UALX}/`, () => { order.push(UALX); return refused(); }], [`/markets/structures/${CJ}/`, () => { order.push(CJ); return refused(); }],
      [`/markets/structures/${BELL}/`, (url) => { order.push(BELL); return pagesOf([PAGE1, PAGE2])(url); }],
    ], NOW + HOUR + 10 * 60_000);
    eq('  an hour on: the hubs never read first, the one read last', [order.filter((x, i) => order.indexOf(x) === i), again.r.done[BELL]], [[UALX, CJ, BELL], 'read']);
    eq('    a hub refused again keeps when it was first refused', book(db, UALX).refusedAt, NOW);
    // Accepted at last: a read clears the refusal.
    await round(env, [[`/markets/structures/${UALX}/`, pagesOf([PAGE1])], [`/markets/structures/${CJ}/`, refused], [`/markets/structures/${BELL}/`, pagesOf([PAGE1, PAGE2])]], NOW + 3 * HOUR);
    eq('    a read clears the refusal', [book(db, UALX).refusedAt, book(db, UALX).error, book(db, UALX).at], [null, null, NOW + 3 * HOUR]);
  }

  // A read cut short, a page failing, a market too big: the last good read stands (Review Focus 1).
  {
    const { db, env } = await setup();
    await addBell(db);
    // Bellicose alone, so the deadline below falls inside its read and not in another hub's.
    await H.dropHomeMarket(db, MAIN, UALX, NOW);
    await H.dropHomeMarket(db, MAIN, CJ, NOW);
    await round(env, [[`/markets/structures/${BELL}/`, pagesOf([PAGE1, PAGE2])], [/markets\/structures/, refused]]);
    const good = db.rows('SELECT data FROM home_books WHERE structure_id = ?', BELL)[0].data;
    const slow = (list) => async (url) => { await new Promise((res) => setTimeout(res, 80)); return pagesOf(list)(url); };
    const cut = await round(env, [[`/markets/structures/${BELL}/`, slow([PAGE2, PAGE1])], [/markets\/structures/, refused]], NOW + HOUR, { deadline: Date.now() + 40 });
    eq('  the deadline passing after page 1 of 2: nothing stored, the try stamped with why', [cut.r.done[BELL], book(db, BELL), db.rows('SELECT data FROM home_books WHERE structure_id = ?', BELL)[0].data === good],
      ['cut', { at: NOW, tried: NOW + HOUR, reader: ALT, error: 'Cut short at page 2 of 2 by the cloud’s time limit', refusedAt: null, pages: 2, types: 3 }, true]);
    const failing = await round(env, [[`/markets/structures/${BELL}/`, (url) => (url.searchParams.get('page') === '2' ? reply({ error: 'boom' }, 500) : pagesOf([PAGE2, PAGE1])(url))], [/markets\/structures/, refused]], NOW + 2 * HOUR);
    eq('  page 2 answering 500: nothing stored, said', [failing.r.done[BELL], book(db, BELL).error, book(db, BELL).at, db.rows('SELECT data FROM home_books WHERE structure_id = ?', BELL)[0].data === good], ['failed', 'Page 2 of 2 failed (ESI 500: boom)', NOW, true]);
    const big = await round(env, [[`/markets/structures/${BELL}/`, () => reply([], 200, 301)], [/markets\/structures/, refused]], NOW + 3 * HOUR);
    eq('  a market over 300 pages: not read at all, said', [big.r.done[BELL], book(db, BELL).error, big.calls.filter((c) => c.path === `/markets/structures/${BELL}/`).length], ['failed', 'Its market runs to 301 pages, more than the 300 the cloud reads in one go', 1]);
    eq('    and its last good read still serves', (await H.homeBookFor(db, MAIN, BELL)).at, new Date(NOW).toISOString());
  }

  // A reader whose login can't read: no call to EVE, said from the keys (Review Focus 4).
  {
    const { db, env } = await setup({ altScopes: SCOPES });
    await addBell(db);
    const r = await round(env, [[/markets\/structures/, refused]]);
    eq('  the alt\'s login without the permission: skipped, EVE not asked for it', [r.r.done[BELL], r.calls.some((c) => c.path === `/markets/structures/${BELL}/`), book(db, BELL)], ['skipped', false, null]);
    eq('    and the list says why', (await H.homeMarketsFor(db, MAIN)).hubs.find((h) => h.id === BELL).login, 'permission');
    db.run('UPDATE keys SET scopes = ?, refused_at = ?, refused = ? WHERE purpose = ?', [...SCOPES, MARKETS].join(' '), NOW, 'invalid_grant', `alt:${ALT}`);
    eq('  a login EVE refused: skipped, said', [(await round(env, [[/markets\/structures/, refused]], NOW + HOUR)).r.done[BELL], (await H.homeMarketsFor(db, MAIN)).hubs.find((h) => h.id === BELL).login], ['skipped', 'refused']);
    db.run('UPDATE alts SET removed_at = ? WHERE char_id = ?', NOW, ALT);
    eq('  a reader taken off the roster: skipped, never read with the main instead, said', [(await round(env, [[/markets\/structures/, refused]], NOW + 2 * HOUR)).calls.some((c) => c.path === `/markets/structures/${BELL}/`), (await H.homeMarketsFor(db, MAIN)).hubs.find((h) => h.id === BELL).login], [false, 'notYours']);
    db.run(`DELETE FROM keys WHERE purpose = 'main'`);
    eq('  no main login kept: no ledger to read for, nothing asked', (await round(env, [], NOW + 3 * HOUR)).calls.length, 0);
  }

  // Choices: a default switched off and on, a reader that isn't yours, a hub without its place, the cap.
  {
    const { db, env } = await setup();
    await H.dropHomeMarket(db, MAIN, UALX, NOW);
    eq('  a default switched off: kept as a row with removed_at, listed off, not read', [(await H.hubsOf(db, MAIN)).find((h) => h.id === UALX).off, (await round(env, [[/markets\/structures/, refused]])).calls.some((c) => c.path === `/markets/structures/${UALX}/`)], [true, false]);
    await H.setHomeMarket(db, MAIN, { hub: UALX, reader: ALT }, NOW);
    eq('    and on again, with the alt reading it: no public read needed for a default\'s place', (await H.hubsOf(db, MAIN)).find((h) => h.id === UALX), { id: UALX, name: 'UALX-3 - 1st Byzantigoon', systemId: 30004807, regionId: 10000061, reader: ALT, kept: 'default', off: false });
    await rejects('  a reader that isn\'t one of yours', () => H.setHomeMarket(db, MAIN, { hub: CJ, reader: 900555 }, NOW), /isn’t one of yours/);
    await rejects('  a new hub without its name and system', () => H.setHomeMarket(db, MAIN, { hub: 1047777777777, reader: MAIN }, NOW), /needs its name and system/);
    await rejects('  a book of a hub that isn\'t yours', () => H.homeBookFor(db, MAIN, 1047777777777), /Not one of your home markets/);
    await rejects('  removing a hub you never added', () => H.dropHomeMarket(db, MAIN, 1047777777777, NOW), /Not one of your home markets/);
    for (let i = 0; i < H.MAX_ADDED; i++) db.run('INSERT INTO home_markets (ledger, structure_id, name, system_id, region_id, reader, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)', MAIN, 1047000000000 + i, `Hub ${i}`, 30004807, 10000061, MAIN, NOW);
    await rejects('  ten added is the most', () => H.setHomeMarket(db, MAIN, { hub: 1047999999999, name: 'One more', systemId: 30004807, reader: MAIN }, NOW), /10 home markets is the most/);
  }

  // Read it now: one hub at once, with its reader, and its state back.
  {
    const { db, env } = await setup();
    await addBell(db, MAIN);
    const f = stubFetch([[`/markets/structures/${BELL}/`, pagesOf([PAGE1])]]);
    const st = await H.readHomeNow(env, MAIN, BELL);
    f.restore();
    // With the real watch set (no `want`): page 1 holds Tritanium, which it watches, and PLEX, which it doesn't.
    eq('  POST /v1/home/read: read at once with its reader, its state back', [st.id, st.login, st.book.types, st.book.error], [BELL, 'ok', 1, null]);
  }
}
```

- [ ] **Step 3: Run them to see them fail**

Run: `npm run check`
Expected: FAIL, `Cannot find module '…/src/lib/bookFold.ts'`, and the Worker's `Cannot find module '…/worker/src/homeMarkets.ts'`.

- [ ] **Step 4: The fold moves to the lib**

Create `src/lib/bookFold.ts` with the code that leaves `worker/src/scan.ts` (unchanged but for `fold`'s `deep` flag and the
structure's own two functions):

```ts
/**
 * A market's orders folded into per-item book summaries as pages are read, never the orders whole (docs/notes/industry.md,
 * stage 4). The cloud's daily scan folds all of The Forge's book this way (worker/src/scan.ts, which keeps its own NPC and
 * blueprint-seller folds beside it), and its hourly read of a structure's market folds that structure's
 * (worker/src/homeMarkets.ts). Pure, and the Worker imports it: nothing here may import ./config, the store, React or the DOM.
 */
import type { Book } from './evaluate';
import { NPC_DURATION } from './constants';
import { SELLS_COUNTED_TO } from './prospects';
import type { BookSold } from './split';
import type { BookLevel } from './types';

export type RawOrder = { order_id: number; type_id: number; location_id: number; is_buy_order: boolean; price: number; volume_remain: number; volume_total: number; duration: number;
  issued?: string; min_volume?: number; range?: string };
/** Price levels kept per side, as the app's book summary keeps them. */
export const LEVELS = 7;
/**
 * One item's book as the pages are read. `deep` is every sell price within SELLS_COUNTED_TO times the best ask (price → units),
 * for the scan's count of the whole queue (`sellsTo`): the seven levels alone held 2,781 of the Arbalest's 5,170 units up to where
 * trading reached on 2 October 2026. A structure's read keeps none.
 */
export type Agg = { buys: BookLevel[]; sells: BookLevel[]; buyOrders: number; sellOrders: number; sold: Required<BookSold>; npcSell: boolean; deep: Map<number, number> };

/** Adds an order to the best LEVELS levels on its side. A level dropped is worse than every level kept, and so is anything at its price later. */
function addLevel(levels: BookLevel[], price: number, volume: number, isBuy: boolean) {
  const at = levels.find((l) => l.price === price);
  if (at) { at.volume += volume; return; }
  const better = (a: number, b: number) => (isBuy ? a > b : a < b);
  if (levels.length >= LEVELS && !better(price, levels[levels.length - 1].price)) return;
  levels.push({ price, volume });
  levels.sort((a, b) => (isBuy ? b.price - a.price : a.price - b.price));
  if (levels.length > LEVELS) levels.pop();
}

/**
 * Keeps a sell price for the whole-queue count, if it's within SELLS_COUNTED_TO times the best ask. The best only falls as pages
 * come in, so a price dropped was over that bound then and is over it at the end: what's kept at the end is every listing up to
 * SELLS_COUNTED_TO times the final best ask, whatever order the pages came in.
 */
function addDeep(a: Agg, price: number, volume: number, wasBest: number | undefined) {
  const best = a.sells[0].price;
  if (price > SELLS_COUNTED_TO * best) return;
  a.deep.set(price, (a.deep.get(price) ?? 0) + volume);
  // A new best ask: let go of what's now past the bound.
  if (wasBest != null && best < wasBest) for (const p of a.deep.keys()) if (p > SELLS_COUNTED_TO * best) a.deep.delete(p);
}

/** One order into its item's summary. `deep`: keep the sell prices for the scan's queue count (a structure's read doesn't). */
export function fold(aggs: Map<number, Agg>, o: RawOrder, deep = true) {
  let a = aggs.get(o.type_id);
  if (!a) {
    a = { buys: [], sells: [], buyOrders: 0, sellOrders: 0, sold: { sell: 0, buy: 0, single: { sell: 0, buy: 0 }, orders: { sell: 0, buy: 0 } }, npcSell: false, deep: new Map() };
    aggs.set(o.type_id, a);
  }
  const side = o.is_buy_order ? 'buy' : 'sell';
  if (o.is_buy_order) a.buyOrders++; else a.sellOrders++;
  const wasBest = a.sells[0]?.price;
  addLevel(o.is_buy_order ? a.buys : a.sells, o.price, o.volume_remain, o.is_buy_order);
  if (deep && !o.is_buy_order) addDeep(a, o.price, o.volume_remain, wasBest);
  // What the live orders have already sold, as `soldFrom` counts it, one order at a time.
  const total = o.volume_total ?? o.volume_remain;
  a.sold[side] += Math.max(0, total - o.volume_remain);
  a.sold.orders[side]++;
  if (total === 1) a.sold.single[side]++;
  if (!o.is_buy_order && (o.duration ?? 0) >= NPC_DURATION) a.npcSell = true;
}

/** The summary without the scan's notes: the seven levels a side, order counts, what the live orders sold, NPCs in the book. */
export function plainBook(a: Agg, at: string): Book {
  return {
    at, bestBuy: a.buys[0]?.price ?? null, bestSell: a.sells[0]?.price ?? null,
    buyOrders: a.buyOrders, sellOrders: a.sellOrders, topBuys: a.buys, topSells: a.sells, npcSell: a.npcSell, sold: a.sold,
  };
}

/** Levels a side a structure's read keeps for each type: enough to buy a week's need up them (industryRank's sourceMaterial). */
export const HOME_LEVELS = 5;
/** One type in a structure's market as the hourly read keeps it: the best levels a side, order counts, what the live orders sold. */
export type StructureRow = [buys: [number, number][], sells: [number, number][], buyOrders: number, sellOrders: number, sold: [sell: number, buy: number, singleSell: number, singleBuy: number]];

/** A page of a structure's market: every order of a watched type (a structure's market holds only its own orders). */
export function foldStructurePage(aggs: Map<number, Agg>, orders: readonly RawOrder[], want: ReadonlySet<number>) {
  for (const o of orders) if (want.has(o.type_id)) fold(aggs, o, false);
}

/** What a structure's read keeps: each type's best HOME_LEVELS levels a side as [price, units], order counts and sold counts. */
export function structureSummary(aggs: ReadonlyMap<number, Agg>): Record<number, StructureRow> {
  const out: Record<number, StructureRow> = {};
  const lv = (x: BookLevel[]) => x.slice(0, HOME_LEVELS).map((l): [number, number] => [l.price, l.volume]);
  for (const [t, a] of aggs) out[t] = [lv(a.buys), lv(a.sells), a.buyOrders, a.sellOrders, [a.sold.sell, a.sold.buy, a.sold.single.sell, a.sold.single.buy]];
  return out;
}
```

In `worker/src/scan.ts`: delete `RawOrder`, `LEVELS`, `Agg`, `addLevel`, `addDeep`, `fold` and `plainBook` with their comments
(all now in bookFold.ts; `summaryOf`, `foldNpc`, `foldPage`, `watchedHighs`, `page` and the rest stay). What's left reads
`NPC_DURATION` (in `foldNpc`), `LEVELS` and `plainBook` (in `summaryOf` and `fullScan`), `fold` (in `foldPage` and the PLEX read)
and the two types, and no longer reads `SELLS_COUNTED_TO`, `BookSold` or `BookLevel`. Its imports from `src/lib` become:

```ts
import type { Book } from '../../src/lib/evaluate';
import { withWatchedHighs, type WatchedExtremes } from '../../src/lib/fills';
import { queueCeiling, sellsToOf, statsFrom } from '../../src/lib/prospects';
import { tickDown, tickUp } from '../../src/lib/tick';
import type { ProspectStats } from '../../src/lib/types';
import { fold, LEVELS, plainBook, type Agg, type RawOrder } from '../../src/lib/bookFold';
// snipe.ts imports RawOrder from here: the fold's types stay reachable where they were.
export type { Agg, RawOrder };
```

(`NPC_DURATION`'s import from `constants` stays.)

- [ ] **Step 5: The shared answer types**

Add to `src/lib/homeMarket.ts` (change its first import to `import type { HomeQuote } from './industryRank';` plus
`import type { StructureRow } from './bookFold';`):

```ts
/** Whether a reader's login, as the cloud keeps it, can read a structure's market: worked out from the cloud's keys, never by asking EVE. */
export type HubLogin = 'ok' | 'permission' | 'refused' | 'none' | 'notYours';
/** A hub's own market as the cloud last read it: the last good read (`at`, null before one) and the last try (when, whose, why it failed). */
export type HubBook = { at: string | null; tried: string; error: string | null; refusedAt: string | null; pages: number | null; types: number; reader: number | null; readerName: string | null };
/**
 * A home market as `GET /v1/home/markets` gives it (worker/src/homeMarkets.ts): Goonmetrics' two (`default`, read with the main
 * unless you chose otherwise, `off` when you stopped reading one) and those you added; its reader, whether that login can read it,
 * and its own reads (null before the first try).
 */
export type HubState = {
  id: number; name: string; systemId: number; regionId: number; kept: 'default' | 'added'; off: boolean;
  reader: number; readerName: string | null; readerIsMain: boolean; login: HubLogin; book: HubBook | null;
};
/** `GET /v1/home/book?hub=`: a hub's last good read of its own market, or null before one. */
export type HomeBookAnswer = { hub: number; at: string; rows: Record<string, StructureRow> } | null;
```

- [ ] **Step 6: The Worker's reads and routes**

Create `worker/src/homeMarkets.ts`:

```ts
/**
 * Home markets for the Industry tab (docs/notes/industry.md, stage 4): a structure's own market, read hourly by the cloud with the
 * login of the character you pick (the hub's reader), for the watch set's types only. Goonmetrics' two hubs are read with the main
 * unless you chose otherwise (home_markets holds every choice); any hub you add needs a reader. One home_books row a structure:
 * the last good read apart from the last try. A read cut short, or with a page failed, is never stored: a structure's pages are
 * shuffled by type, so part of them would price every type wrong. Last on the `37` cron with a deadline of its own; not a watched
 * job (a hub refused until the user is accepted would mail daily, and the tab says each hub's state).
 */
import INDUSTRY from '../../src/data/industryTypes.json' with { type: 'json' };
import { foldStructurePage, structureSummary, type Agg, type RawOrder, type StructureRow } from '../../src/lib/bookFold';
import { HOME_HUBS, type HomeBookAnswer, type HubLogin, type HubState } from '../../src/lib/homeMarket';
import { onRoster } from './alts';
import { altPurpose, altReader, EveError, esiGet, HEADERS, ledgerReader, readerLogin, type Reader } from './eve';
import { BadRequest } from './sync';

export const SCOPE_STRUCTURE_MARKETS = 'esi-markets.structure_markets.v1';
/** A hub is read again once its last try is this old: hourly, on a cron at :37, with the alts' read ahead of it varying. */
export const BOOK_DUE_MS = 50 * 60_000;
/** No page is asked for past this from the cron's time: the invocation stops at 15 minutes. */
export const BOOKS_BUDGET_MS = 14 * 60_000;
/** A market over this many pages isn't read at all: part of one is never stored. */
export const MAX_PAGES = 300;
/** Hubs added a ledger, besides Goonmetrics' two: each is a read an hour. */
export const MAX_ADDED = 10;
const PAGE_TIMEOUT_MS = 20_000;
const ESI = 'https://esi.evetech.net';
const WATCH: ReadonlySet<number> = new Set((INDUSTRY as { watch: number[] }).watch);

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };
export type Hub = { id: number; name: string; systemId: number; regionId: number; reader: number; kept: 'default' | 'added'; off: boolean };
const iso = (t: number) => new Date(t).toISOString();
const isStructure = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1e12;

/** A ledger's hubs: Goonmetrics' two (read with the main unless a row says otherwise), then every hub added and not removed. */
export async function hubsOf(db: D1Database, ledger: number): Promise<Hub[]> {
  const rows = (await db.prepare('SELECT structure_id AS id, name, system_id AS systemId, region_id AS regionId, reader, removed_at AS removedAt FROM home_markets WHERE ledger = ?1 ORDER BY added_at, structure_id')
    .bind(ledger).all<{ id: number; name: string; systemId: number; regionId: number; reader: number; removedAt: number | null }>()).results;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return [
    ...HOME_HUBS.map((h): Hub => { const r = byId.get(h.id); return { id: h.id, name: h.name, systemId: h.systemId, regionId: h.region, reader: r?.reader ?? ledger, kept: 'default', off: r?.removedAt != null }; }),
    ...rows.filter((r) => r.removedAt == null && !HOME_HUBS.some((h) => h.id === r.id))
      .map((r): Hub => ({ id: r.id, name: r.name, systemId: r.systemId, regionId: r.regionId, reader: r.reader, kept: 'added', off: false })),
  ];
}

/** Whether a reader's login can read a structure's market, from what the cloud keeps: one of yours, a login kept, not refused, the permission held. */
async function loginOf(db: D1Database, ledger: number, reader: number): Promise<HubLogin> {
  if (reader !== ledger && !(await onRoster(db, ledger, reader))) return 'notYours';
  const k = await db.prepare('SELECT scopes, refused_at AS refusedAt FROM keys WHERE char_id = ?1 AND purpose = ?2')
    .bind(ledger, reader === ledger ? 'main' : altPurpose(reader)).first<{ scopes: string; refusedAt: number | null }>();
  if (!k) return 'none';
  if (k.refusedAt != null) return 'refused';
  return k.scopes.split(' ').includes(SCOPE_STRUCTURE_MARKETS) ? 'ok' : 'permission';
}

/** One page of a structure's market with the reader's token; a 502 to 504 is tried twice more, as esiGet does. */
async function page(structure: number, p: number, token: string): Promise<{ orders: RawOrder[]; pages: number }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${ESI}/markets/structures/${structure}/?page=${p}`, { headers: { ...HEADERS, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    if (res.ok) return { orders: (await res.json()) as RawOrder[], pages: Number(res.headers.get('X-Pages') ?? 1) || 1 };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if ([502, 503, 504].includes(res.status) && attempt < 2) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    throw new EveError(res.status, `ESI ${res.status}${body.error ? `: ${body.error}` : ''}`);
  }
}

export type BookRead = { done: 'read'; pages: number; types: number } | { done: 'refused' | 'failed' | 'cut'; error: string } | { done: 'skipped'; login: HubLogin } | { done: 'later' };

/**
 * Reads one hub's market with its reader's login. A login that can't read it is skipped before EVE is asked (the list says why from
 * the keys); a 403 is the structure refusing this reader (not on its access list), dated from the first refusal in a row by the
 * same reader; anything else that stops the read is stamped with why, and the last good read stands. `want` is for the tests.
 */
export async function readHomeBook(env: Env, ledger: number, hub: { id: number; reader: number }, o: { now?: number; deadline?: number; want?: ReadonlySet<number> } = {}): Promise<BookRead> {
  const db = env.DB, now = o.now ?? Date.now(), deadline = o.deadline ?? Infinity, want = o.want ?? WATCH;
  const login = await loginOf(db, ledger, hub.reader);
  if (login !== 'ok') return { done: 'skipped', login };
  if (Date.now() > deadline) return { done: 'later' };
  const who: Reader = hub.reader === ledger ? ledgerReader(ledger) : altReader(ledger, hub.reader);
  let token: string;
  try {
    const l = await readerLogin(env, who);
    if (!l) return { done: 'skipped', login: 'none' };
    token = l.access;
  } catch (e) {
    // useLogin has marked the login refused (keys.refused_at): the list says so from there.
    if (e instanceof EveError && (e.status === 400 || e.status === 401)) return { done: 'skipped', login: 'refused' };
    throw e;
  }
  // A try that stored nothing: its time, its reader and why. `refused` dates a run of refusals by one reader from its first; a
  // failure of another kind says nothing of access and keeps it; another reader starts afresh.
  const stamp = async (error: string, refused: boolean) => {
    await db.prepare(`INSERT INTO home_books (structure_id, tried, reader, error, refused_at) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(structure_id) DO UPDATE SET tried = excluded.tried, error = excluded.error,
        refused_at = CASE WHEN home_books.reader IS NOT excluded.reader THEN excluded.refused_at
          WHEN excluded.refused_at IS NULL THEN home_books.refused_at ELSE COALESCE(home_books.refused_at, excluded.refused_at) END,
        reader = excluded.reader`).bind(hub.id, now, hub.reader, error, refused ? now : null).run();
  };
  const aggs = new Map<number, Agg>();
  let p = 1, pages = 1;
  try {
    const first = await page(hub.id, 1, token);
    pages = first.pages;
    if (pages > MAX_PAGES) {
      const error = `Its market runs to ${pages} pages, more than the ${MAX_PAGES} the cloud reads in one go`;
      await stamp(error, false);
      return { done: 'failed', error };
    }
    foldStructurePage(aggs, first.orders, want);
    for (p = 2; p <= pages; p++) {
      if (Date.now() > deadline) {
        const error = `Cut short at page ${p} of ${pages} by the cloud’s time limit`;
        await stamp(error, false);
        return { done: 'cut', error };
      }
      foldStructurePage(aggs, (await page(hub.id, p, token)).orders, want);
    }
  } catch (e) {
    const said = e instanceof Error ? e.message : String(e);
    if (e instanceof EveError && e.status === 403) { await stamp(said, true); return { done: 'refused', error: said }; }
    const error = p > 1 ? `Page ${p} of ${pages} failed (${said})` : said;
    await stamp(error, false);
    return { done: 'failed', error };
  }
  const data = structureSummary(aggs), types = Object.keys(data).length;
  await db.prepare(`INSERT INTO home_books (structure_id, at, data, pages, types, tried, reader, error, refused_at) VALUES (?1, ?2, ?3, ?4, ?5, ?2, ?6, NULL, NULL)
    ON CONFLICT(structure_id) DO UPDATE SET at = excluded.at, data = excluded.data, pages = excluded.pages, types = excluded.types, tried = excluded.tried,
      reader = excluded.reader, error = NULL, refused_at = NULL`).bind(hub.id, now, JSON.stringify(data), pages, types, hub.reader).run();
  return { done: 'read', pages, types };
}

/**
 * The hourly round, last on the `37` cron: every hub of every ledger whose last try is BOOK_DUE_MS old, each structure once, least
 * recently read first (by its last good read, so one cut short goes first next time and one long market can't keep another
 * unread). No page past `deadline`.
 */
export async function refreshHomeBooks(env: Env, now = Date.now(), o: { deadline?: number; want?: ReadonlySet<number> } = {}): Promise<{ hubs: number; done: Record<string, BookRead['done']> }> {
  const db = env.DB;
  const ledgers = (await db.prepare(`SELECT char_id AS id FROM keys WHERE purpose = 'main'`).all<{ id: number }>()).results.map((r) => r.id);
  const books = new Map((await db.prepare('SELECT structure_id AS id, at, tried FROM home_books').all<{ id: number; at: number; tried: number }>()).results.map((r) => [r.id, r]));
  const due: { ledger: number; hub: Hub }[] = [];
  const seen = new Set<number>();
  for (const ledger of ledgers) {
    for (const hub of await hubsOf(db, ledger)) {
      if (hub.off || seen.has(hub.id) || now - (books.get(hub.id)?.tried ?? 0) < BOOK_DUE_MS) continue;
      seen.add(hub.id);
      due.push({ ledger, hub });
    }
  }
  due.sort((a, b) => (books.get(a.hub.id)?.at ?? 0) - (books.get(b.hub.id)?.at ?? 0) || a.hub.id - b.hub.id);
  const done: Record<string, BookRead['done']> = {};
  for (const { ledger, hub } of due) {
    try { done[hub.id] = (await readHomeBook(env, ledger, hub, { now, deadline: o.deadline, want: o.want })).done; }
    catch (e) { done[hub.id] = 'failed'; console.error('home book failed', hub.id, e); }
  }
  return { hubs: due.length, done };
}

/** `GET /v1/home/markets`: the ledger's hubs, each with its reader, whether that login can read it, and its own reads. */
export async function homeMarketsFor(db: D1Database, ledger: number): Promise<{ hubs: HubState[] }> {
  const hubs = await hubsOf(db, ledger);
  type Row = { id: number; at: number; tried: number; error: string | null; refusedAt: number | null; pages: number | null; types: number; reader: number | null };
  const books = new Map((await db.prepare('SELECT structure_id AS id, at, tried, error, refused_at AS refusedAt, pages, types, reader FROM home_books').all<Row>()).results.map((r) => [r.id, r]));
  const names = new Map<number, string | null>();
  const nameOf = async (char: number): Promise<string | null> => {
    if (!names.has(char)) {
      const r = char === ledger
        ? await db.prepare(`SELECT token_char_name AS name FROM keys WHERE char_id = ?1 AND purpose = 'main'`).bind(ledger).first<{ name: string | null }>()
        : await db.prepare('SELECT name FROM alts WHERE char_id = ?1 AND ledger = ?2').bind(char, ledger).first<{ name: string | null }>();
      names.set(char, r?.name ?? null);
    }
    return names.get(char) ?? null;
  };
  const out: HubState[] = [];
  for (const h of hubs) {
    const b = books.get(h.id);
    out.push({
      id: h.id, name: h.name, systemId: h.systemId, regionId: h.regionId, kept: h.kept, off: h.off,
      reader: h.reader, readerName: await nameOf(h.reader), readerIsMain: h.reader === ledger, login: await loginOf(db, ledger, h.reader),
      book: b ? {
        at: b.at > 0 ? iso(b.at) : null, tried: iso(b.tried), error: b.error, refusedAt: b.refusedAt != null ? iso(b.refusedAt) : null,
        pages: b.pages, types: b.types, reader: b.reader, readerName: b.reader != null ? await nameOf(b.reader) : null,
      } : null,
    });
  }
  return { hubs: out };
}

/** `GET /v1/home/book?hub=`: a hub's last good read of its own market, or null before one. Only a hub of the caller's. */
export async function homeBookFor(db: D1Database, ledger: number, hub: number): Promise<HomeBookAnswer> {
  if (!(await hubsOf(db, ledger)).some((h) => h.id === hub)) throw new BadRequest('Not one of your home markets');
  const r = await db.prepare('SELECT at, data FROM home_books WHERE structure_id = ?1').bind(hub).first<{ at: number; data: string }>();
  return r && r.at > 0 ? { hub, at: iso(r.at), rows: JSON.parse(r.data) as Record<string, StructureRow> } : null;
}

/** A system's region, read publicly (no login): a hub added needs it for the home region's history. */
async function regionOf(systemId: number): Promise<number> {
  const sys = (await esiGet<{ constellation_id: number }>(`/universe/systems/${systemId}/`)).data;
  return (await esiGet<{ region_id: number }>(`/universe/constellations/${sys.constellation_id}/`)).data.region_id;
}

/**
 * `POST /v1/home/markets`: read a hub with this reader, adding it when it's new (its name and system from the structure found, its
 * region read publicly) or switching a default back on. The reader is the ledger's own character or an alt on its roster.
 */
export async function setHomeMarket(db: D1Database, ledger: number, body: { hub?: unknown; reader?: unknown; name?: unknown; systemId?: unknown }, now = Date.now()): Promise<{ ok: true }> {
  const hub = Number(body.hub), reader = Number(body.reader);
  if (!isStructure(hub)) throw new BadRequest('Say which structure: its ID');
  if (!Number.isInteger(reader) || (reader !== ledger && !(await onRoster(db, ledger, reader)))) throw new BadRequest('That character isn’t one of yours');
  const known = HOME_HUBS.find((h) => h.id === hub);
  const row = await db.prepare('SELECT name, system_id AS systemId, region_id AS regionId FROM home_markets WHERE ledger = ?1 AND structure_id = ?2')
    .bind(ledger, hub).first<{ name: string; systemId: number; regionId: number }>();
  let name: string, systemId: number, regionId: number;
  if (known) ({ name, systemId, regionId } = { name: known.name, systemId: known.systemId, regionId: known.region });
  else if (row) ({ name, systemId, regionId } = row);
  else {
    name = typeof body.name === 'string' && body.name.trim() && body.name.length <= 120 ? body.name.trim() : '';
    systemId = Number(body.systemId);
    if (!name || !Number.isInteger(systemId) || systemId < 30_000_000 || systemId >= 33_000_000) throw new BadRequest('A new home market needs its name and system');
    const added = (await db.prepare('SELECT structure_id AS id FROM home_markets WHERE ledger = ?1 AND removed_at IS NULL').bind(ledger).all<{ id: number }>()).results
      .filter((r) => !HOME_HUBS.some((h) => h.id === r.id)).length;
    if (added >= MAX_ADDED) throw new BadRequest(`${MAX_ADDED} home markets is the most the cloud reads, besides Goonmetrics’ two: remove one to add another`);
    regionId = await regionOf(systemId);
  }
  await db.prepare(`INSERT INTO home_markets (ledger, structure_id, name, system_id, region_id, reader, added_at, removed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)
    ON CONFLICT(ledger, structure_id) DO UPDATE SET reader = excluded.reader, removed_at = NULL`).bind(ledger, hub, name, systemId, regionId, reader, now).run();
  return { ok: true };
}

/** `DELETE /v1/home/markets?hub=`: stop reading a default (a row kept with removed_at), or take an added hub off the list. */
export async function dropHomeMarket(db: D1Database, ledger: number, hub: number, now = Date.now()): Promise<{ ok: true }> {
  const known = HOME_HUBS.find((h) => h.id === hub);
  if (known) {
    await db.prepare(`INSERT INTO home_markets (ledger, structure_id, name, system_id, region_id, reader, added_at, removed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?1, ?6, ?6)
      ON CONFLICT(ledger, structure_id) DO UPDATE SET removed_at = excluded.removed_at`).bind(ledger, hub, known.name, known.systemId, known.region, now).run();
    return { ok: true };
  }
  const r = await db.prepare('UPDATE home_markets SET removed_at = ?3 WHERE ledger = ?1 AND structure_id = ?2 AND removed_at IS NULL').bind(ledger, hub, now).run();
  if (!r.meta.changes) throw new BadRequest('Not one of your home markets');
  return { ok: true };
}

/** `POST /v1/home/read?hub=`: one hub read at once with its reader (after adding it, or Read it now), and its state back. */
export async function readHomeNow(env: Env, ledger: number, hub: number): Promise<HubState> {
  const h = (await hubsOf(env.DB, ledger)).find((x) => x.id === hub);
  if (!h || h.off) throw new BadRequest('Not one of the home markets the cloud reads');
  await readHomeBook(env, ledger, h);
  return (await homeMarketsFor(env.DB, ledger)).hubs.find((x) => x.id === hub)!;
}
```

In `worker/src/index.ts`, import it:

```ts
import { BOOKS_BUDGET_MS, dropHomeMarket, homeBookFor, homeMarketsFor, readHomeNow, refreshHomeBooks, setHomeMarket } from './homeMarkets';
```

append to the `37` chain, after the copies' `.finally`:

```ts
        // Then each home market's own read (homeMarkets.ts), every hub hourly with its reader's login: last, since a missed
        // Goonmetrics or copy round slips six hours and a missed structure read one; no page asked for past 14 minutes. Not a
        // watched job: a hub refused until the user is accepted would mail every day, and the tab says each hub's state.
        .finally(async () => {
          try { console.log('home books', JSON.stringify(await refreshHomeBooks(env, Date.now(), { deadline: event.scheduledTime + BOOKS_BUDGET_MS }))); } catch (e) { console.error('home books failed', e); }
        })
```

and the routes, after `/v1/home/prices`:

```ts
      // Home markets (homeMarkets.ts): the hubs and their states; add one or set its reader; stop reading or remove one; a hub's
      // last good read; read one now. New paths: a Worker a version behind answers 404, which the tab says.
      if (url.pathname === '/v1/home/markets' && request.method === 'GET') return json(await homeMarketsFor(env.DB, who.charId), 200, c);
      if (url.pathname === '/v1/home/markets' && request.method === 'POST') return json(await setHomeMarket(env.DB, who.charId, (await request.json()) as Record<string, unknown>), 200, c);
      if (url.pathname === '/v1/home/markets' && request.method === 'DELETE') return json(await dropHomeMarket(env.DB, who.charId, Number(url.searchParams.get('hub'))), 200, c);
      if (url.pathname === '/v1/home/book' && request.method === 'GET') return json(await homeBookFor(env.DB, who.charId, Number(url.searchParams.get('hub'))), 200, c);
      if (url.pathname === '/v1/home/read' && request.method === 'POST') return json(await readHomeNow(env, who.charId, Number(url.searchParams.get('hub'))), 200, c);
```

In `worker/wrangler.toml`, the triggers comment: "…the alts' full reads hourly at 37 past (then Goonmetrics, the copy market and
each home market's own read, in that order; a cron of their own: …)".

- [ ] **Step 7: Run the tests, see them pass; plant each rule wrong**

Run: `npm run check`. Expected: `all passed` twice; the "every Worker module loads" list includes `homeMarkets.ts`; the full
scan's tests (`--- the full scan notes NPC sellers…`, `--- the full scan reads the Industry tab's watch set…`) pass unchanged,
which is the evidence the fold moved without changing. Plant each and see it fail, putting it back after:
- store the fold anyway when the deadline passes (`structureSummary` written before `return { done: 'cut' }`): the cut test's
  `data === good` and `at` fail (Review Focus 1);
- read every hub with `ledgerReader(ledger)`: the round's `seen` names the main for Bellicose;
- drop the `login !== 'ok'` skip: the permission test asks EVE;
- clear `refused_at` on every try: "keeps when it was first refused" fails;
- sort by `tried` instead of `at`: "the hubs never read first" fails;
- `fold` with `deep` always on: the structure page test's `deep.size` is 1;
- skip the `onRoster` check in `setHomeMarket`: "a reader that isn't one of yours" fails.

- [ ] **Step 8: Notes**

- `docs/notes/industry.md`, stage 4: **The cloud reads each home market** (migration 0021, `worker/src/homeMarkets.ts`,
  `src/lib/bookFold.ts`): corrections 3 to 7 and 13 in the note's words; the ESI facts above (no rate group named, 300 s cache, the
  refusal's shape not in the spec: the first real one is recorded here); the arithmetic of the `37` chain (step "The evidence");
  D1's cost (one `home_books` write a hub an hour, about 2,200 a month for three hubs; `home_markets` only on a choice); "After
  shipping: record the first real refusal (its status and `error`), the first real read's page count, types and row size, and how
  long a page takes".
- `docs/notes/limits.md`: **A home market's own read is the watch set's types, hourly, from one read each time**: what its live
  orders have sold is since each was placed, not a pace, and nothing is watched between reads; its pace is the home region's
  history. **A read cut short, or with a page failed, keeps the last good read**, and a market over 300 pages isn't read. **It
  speaks only while under two hours old**: past that Goonmetrics' prices (hours old) speak for the hubs it tracks, and nothing for
  the others (Task 18B says so on the tab).
- `docs/notes/eve-facts.md`: a bullet for `/markets/structures/{id}/` (the shape, paging, 300 s, no rate group named, the
  permission and a character on the market's access list; the refusal's shape unseen until the first real one; 401 without a login).
- `docs/notes/cloud.md`: a bullet: **The cloud reads home markets with logins handed to it** (homeMarkets.ts): a reader's login,
  the main's or an alt's, reads a structure's market hourly; nothing is filed under any character (`home_books` is the structure's).
- `docs/notes/finding-trades.md`, the full-scan bullet: "the fold lives in `src/lib/bookFold.ts` since Industry stage 4, shared with
  a structure's read; `foldPage` stays in scan.ts".
- `CLAUDE.md`: the Timers paragraph: "…hourly at :37 every alt's full read (`altsHourly`), then Goonmetrics and then the copy market
  (`refreshCopies`) when six hours old, then each home market's own read (`refreshHomeBooks`, every hub hourly, no page past 14
  minutes)"; the Worker's imports list gains `bookFold` (the fold the scan and a structure's read share) and `homeMarket` reads
  "(values, and the home markets' answer types)".
- `.claude/rules/industry.md` `paths:`: `"src/lib/{industry,…,copyContracts,bookFold}.ts"`,
  `"worker/src/{industryNpc,goonmetrics,industryJobs,copies,structures,homeMarkets}.ts"`,
  `"worker/migrations/{0018_industry_npc,0019_home_prices,0020_copies,0021_home_markets}.sql"`.

- [ ] **Step 9: The five checks, and commit**

Run: `npm run check && npm run build && LEDGER=industry npm run check-pages && npm run check-pages && npm run check-income`.
Expected: all green (no page reads the new routes yet). Then:

```bash
git add worker/migrations/0021_home_markets.sql src/lib/bookFold.ts src/lib/homeMarket.ts worker/src/homeMarkets.ts worker/src/scan.ts worker/src/index.ts worker/wrangler.toml scripts/check.mjs scripts/check-worker.mjs .claude/rules/industry.md docs/notes/industry.md docs/notes/limits.md docs/notes/eve-facts.md docs/notes/cloud.md docs/notes/finding-trades.md CLAUDE.md
git commit -m "Industry stage 4: the cloud reads each home market hourly, with its reader's login

Home prices came from Goonmetrics alone, hours old and fed by its members' uploads. Now the cloud reads each hub's own market
(/markets/structures/{id}) every hour with the login of the character you pick: Goonmetrics' two hubs with the main unless you
choose otherwise, and any hub you add (home_markets, migration 0021, with the system and region the finder needs). The fold the
daily scan uses moved to src/lib/bookFold.ts and keeps the watch set's types only: five levels a side, order counts and what the
live orders sold, one home_books row a structure, the last good read apart from the last try.

A read cut short or with a page failed is never stored: ESI's market pages are shuffled by type, so part of them would price every
type wrong. The reads run last on the 37 chain (a missed Goonmetrics or copy round slips six hours, a missed structure read one),
every hub hourly, least recently read first, no page past 14 minutes. A reader whose login can't read is skipped before EVE is
asked and said from the keys; a 403 is kept as refused since its first, asked again hourly so a character accepted into Brave
starts reading within the hour. Not a watched job: a refused hub would mail every day. Tested on the stand-in: an alt reader's
token on every page, nothing filed under the main or the alt, the cut, a failing page and a 301-page market leaving the last good
read as it was.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf"
```

---
### Task 18B: The hub list, and which price speaks at home

**Files:**
- Modify: `src/lib/homeMarket.ts` (`HomeHub` for any hub, `hubShort`, `hubsFrom`, `STRUCTURE_FRESH_MS`, `homeSpeaks`,
  `structureQuote`, `bookHoldMs`, `ownMarketSaid`), `src/lib/industryRank.ts` (`HomeQuote`'s source, sold counts and levels;
  `fillCost`; buying and selling at a hub priced by its own market), `src/lib/cloud.ts` (`cloudHomeMarkets`, `cloudHomeBook`),
  `src/components/hustles/industryMarket.ts` (`useHomeMarkets`, `useHomeHubs`, `useHomeBook`, `useHomeQuotes`,
  `refreshHomeMarkets`), `src/components/hustles/industryFinder.ts` (the hub from the merged list; `homeSaid`; `homeFromSaid`;
  `homePaceSaid`; the home histories read), `src/components/hustles/IndustryBuild.tsx`, `src/components/hustles/IndustryDetail.tsx`,
  `src/lib/todo.ts` (`builtItem`'s `hub` place and `homeFrom`), `src/components/Todo.tsx`, `scripts/check.mjs`, `scripts/pages.mjs`,
  `docs/notes/industry.md`, `docs/notes/limits.md`, `docs/notes/orders-alerts.md`

**Interfaces:**
- Consumes: `HubState`, `HomeBookAnswer` (18A, homeMarket.ts); `StructureRow` (bookFold.ts); `GET /v1/home/markets`,
  `GET /v1/home/book?hub=` (18A).
- Produces (18C, 18D, 18E rely on these):
  - `src/lib/homeMarket.ts`: `type HomeHub = { id; name; short; systemId; region; regionName?; goonmetrics: boolean }` (`HOME_HUBS`
    typed with it), `hubShort(name)`, `hubsFrom(list: readonly HubState[] | null): HomeHub[]`, `STRUCTURE_FRESH_MS` (2 h), `type
    HomeSpeaks = { source: 'structure' | 'goonmetrics'; at: string } | null`, `homeSpeaks(book, gm, now)`, `structureQuote(row, at,
    weekly)`, `bookHoldMs(at, now)`, `ownMarketSaid(h: HubState, now, gm: boolean): string`.
  - `src/lib/industryRank.ts`: `HomeQuote` gains `source?`, `sold?`, `sells?`; `fillCost(levels, units): number | null`.
  - `src/components/hustles/industryMarket.ts`: `type MarketsState`, `useHomeMarkets(on = true)`, `useHomeHubs(on = true): { hubs:
    HomeHub[]; markets: MarketsState }`, `type BookState`, `useHomeBook(hub)`, `type HomeSource = { gm: HomeState | { status:
    'untracked' }; book: BookState; hub: HubState | null; speaks: HomeSpeaks; quote: (type: number) => HomeQuote | null; read:
    boolean }`, `useHomeQuotes(hub: HomeHub | null): HomeSource`, `refreshHomeMarkets()`.
  - `src/components/hustles/industryFinder.ts`: `Finder` gains `hubs: HomeHub[]`, `home: HomeSource` (was `HomeState`),
    `hubMissing: MarketsState | null`; `homeSaid(f, now, ago)` takes `Pick<Finder, 'hub' | 'home' | 'hubMissing'>`;
    `homeFromSaid(home: HomeSource): string`; `homePaceSaid(s: Sale, hubName: string): string`.
  - `src/lib/todo.ts`: `builtItem`'s `where` gains `'hub'` (the hub picked isn't known yet) and its options gain `homeFrom?: string |
    null`.

**Why.** The spec: "Which price speaks: the structure's own read, when one is under two hours old; else Goonmetrics', labelled with
its time; else none. The finder, the detail and the ladder say which." Every reader of home prices, as the code is:
- **the finder** (`useFinder`: the hub, its legs, `market().home`, the home histories), **its rows and count line**
  (IndustryBuild: "sold at UALX-3, Goonmetrics' prices"), **its detail** (the sale's line, the weekly movement, Goonmetrics'
  per-type age), **the ladder** (IndustryStart reads the finder's rows: no change of its own), and **To do's List what you built**
  (`builtWhere`, `builtPlaceSystem`, the price and its words). **The copies' section reads no home price** (correction 15).
- The hub list becomes Goonmetrics' two plus those the cloud lists (correction 4): `HOME_HUBS` stays Goonmetrics' alone (the
  Worker's Goonmetrics round and `homePrices` read it), and `hubsFrom` merges.
- At a hub priced by its own read: a whole read without a type is "none listed there" (correction 8); buying a material walks its
  best five levels for a week's need (correction 9); selling paces by the home region's history, or Goonmetrics' weekly movement ÷ 7
  before it, split by what its live orders sold where the book can tell (correction 11); the finder reads the home history for rows
  priced there with no pace (correction 10), or nothing would ever be ranked at a hub Goonmetrics doesn't track.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, before the final `console.log(failed ? …)`:

```js
console.log('\n--- Industry stage 4: the hub list and which price speaks at home (homeMarket.ts, industryRank.ts, Task 18B) ---');
{
  const HM = await import('../src/lib/homeMarket.ts');
  const K = await import('../src/lib/industryRank.ts');
  const D = await import('../src/lib/todo.ts');
  const T = Date.parse('2026-10-12T14:00:00Z');
  const at = (min) => new Date(T - min * 60_000).toISOString();
  const OWNER = 95210486, BUILDER = 900091, BELL = 1049999999999;
  const hub = (o) => ({ id: BELL, name: 'UALX-3 - Mothership Bellicose', systemId: 30004807, regionId: 10000061, kept: 'added', off: false, reader: OWNER, readerName: 'Owner', readerIsMain: true, login: 'ok', book: null, ...o });
  const bk = (o) => ({ at: null, tried: at(5), error: null, refusedAt: null, pages: null, types: 0, reader: OWNER, readerName: 'Owner', ...o });

  eq('the hubs the tab knows: Goonmetrics\' two always, then those added and not removed, each named after its system\'s prefix',
    HM.hubsFrom([hub({}), hub({ id: 1046664001931, kept: 'default', name: 'UALX-3 - 1st Byzantigoon' }), hub({ id: 1047000000001, off: true })]).map((h) => [h.id, h.short, h.goonmetrics, h.systemId, h.region]),
    [[1046664001931, 'UALX-3', true, 30004807, 10000061], [1049588174021, 'C-J6MT', true, 30000772, 10000009], [BELL, 'Mothership Bellicose', false, 30004807, 10000061]]);
  eq('  with no list (the cloud off, a version behind, failing): Goonmetrics\' two', HM.hubsFrom(null).map((h) => h.short), ['UALX-3', 'C-J6MT']);
  eq('  a name with no system prefix is said whole', HM.hubShort('Brave Market'), 'Brave Market');

  // Review Focus 3: the two-hour boundary.
  eq('the structure\'s own read speaks while under two hours old, else Goonmetrics\', else none', [HM.homeSpeaks({ at: at(119) }, { at: at(300) }, T), HM.homeSpeaks({ at: at(121) }, { at: at(300) }, T), HM.homeSpeaks({ at: at(121) }, null, T), HM.homeSpeaks(null, null, T)],
    [{ source: 'structure', at: at(119) }, { source: 'goonmetrics', at: at(300) }, null, null]);
  const row = [[[6_900_000, 30]], [[7_200_000, 20], [7_350_000, 40]], 3, 5, [60, 20, 0, 0]];
  eq('a type in the structure\'s read: best sell and buy, its sell levels and what its orders sold; Goonmetrics\' weekly movement where it has one', HM.structureQuote(row, at(30), 5887), {
    sell: 7_200_000, buy: 6_900_000, weekly: 5887, at: at(30), source: 'structure', sells: [{ price: 7_200_000, volume: 20 }, { price: 7_350_000, volume: 40 }],
    sold: { sell: 60, buy: 20, single: { sell: 0, buy: 0 }, orders: { sell: 5, buy: 3 } } });
  eq('  a type the whole read doesn\'t have: none listed, which is known (correction 8)', HM.structureQuote(undefined, at(30), null), { sell: null, buy: null, weekly: null, at: at(30), source: 'structure', sells: [] });
  eq('  a hub\'s read is held until the next hourly read could land, 5 to 15 minutes', [HM.bookHoldMs(at(30), T), HM.bookHoldMs(at(65), T), HM.bookHoldMs(null, T)], [15 * 60_000, 5 * 60_000, 15 * 60_000]);

  // Review Focus 2 and 4: every state of a hub's own market, in its words.
  const said = (o, gm = false) => HM.ownMarketSaid(hub(o), T, gm);
  const alt = { reader: BUILDER, readerName: 'Builder Alt', readerIsMain: false };
  eq('every state of a hub\'s own market', [
    said({ book: bk({ at: at(40), pages: 3, types: 812 }) }),
    said({}),
    said({ book: bk({ refusedAt: at(120) }) }, true),
    said({ book: bk({ refusedAt: at(120), at: at(300) }) }),
    said({ book: bk({ error: 'Cut short at page 31 of 80 by the cloud’s time limit', at: at(190) }) }),
    said({ book: bk({ error: 'ESI 404: Structure not found' }) }),
    said({ login: 'permission' }),
    said({ login: 'permission', ...alt }),
    said({ login: 'refused', ...alt }),
    said({ login: 'none' }),
    said({ login: 'notYours', ...alt }),
    said({ ...alt, book: bk({ at: at(90), types: 5 }) }),
    said({ off: true, kept: 'default', name: 'UALX-3 - 1st Byzantigoon' }, true),
  ], [
    'Its own market was read 40 min ago with your login: 812 of the watched items listed there (3 pages).',
    'Its own market isn’t read yet: the cloud reads it hourly with your login.',
    'EVE refused your read of Mothership Bellicose: it isn’t on its access list (first refused 2 h ago). Goonmetrics’ prices stand in.',
    'EVE refused your read of Mothership Bellicose: it isn’t on its access list (first refused 2 h ago). Nothing stands in: Goonmetrics doesn’t track it. The last good read was 5 h ago.',
    'Its own market’s last read, 5 min ago, failed (cut short at page 31 of 80 by the cloud’s time limit). The last good read was 3 h ago.',
    'Its own market’s last read, 5 min ago, failed (ESI 404: Structure not found). Nothing has been read yet.',
    'Reading its own market needs EVE’s permission for structure markets: log in again here, then hand the cloud your login (Settings → Your data).',
    'Reading its own market needs EVE’s permission for structure markets: hand the cloud Builder Alt’s login again on Characters.',
    'EVE refused the cloud’s login for Builder Alt, which reads its own market: hand it over again on Characters.',
    'Its own market is read with your login, which the cloud doesn’t hold: hand it yours under Settings → Your data.',
    'Its own market’s reader, Builder Alt, isn’t one of your characters any more: pick another.',
    'Its own market isn’t read yet: the cloud reads it hourly with Builder Alt’s login. The last good read was 2 h ago, with Owner’s login.',
    'Its own market isn’t read with a character: Goonmetrics’ prices only.',
  ]);

  // Buying at a hub priced by its own read (correction 9).
  const st = (sells) => ({ sell: sells[0]?.price ?? null, buy: 80, weekly: null, at: at(30), source: 'structure', sells });
  const src = (o) => K.sourceMaterial({ type: 34, weekNeed: 500, volume: 0.01, mineable: false, mines: false, jita: { ask: 100, bid: 95, patient: 96 }, jitaLeg: { kind: 'carry', jumps: 4 }, home: null, homeLeg: { kind: 'here' }, hubName: 'Mothership Bellicose', ...o });
  eq('a week\'s need bought up the levels: the cost of each unit where it lies', [K.fillCost([{ price: 10, volume: 5 }, { price: 12, volume: 10 }], 10), K.fillCost([{ price: 10, volume: 5 }], 6), K.fillCost([], 0)], [11, null, null]);
  const deep = src({ home: st([{ price: 88, volume: 300 }, { price: 92, volume: 400 }]) });
  eq('  a material at a hub priced by its own read: its levels hold a week\'s need, so it\'s bought up them, no weekly movement needed',
    [deep.pick, deep.price, deep.options.find((x) => x.source === 'home')], ['home', (300 * 88 + 200 * 92) / 500, { source: 'home', price: (300 * 88 + 200 * 92) / 500, why: 'Mothership Bellicose’s listings: a week’s need bought up its best prices', pickable: true }]);
  const thin = src({ home: st([{ price: 88, volume: 300 }]) });
  eq('    too few listed for a week\'s need: said with how many, Jita picked', [thin.pick, thin.options.find((x) => x.source === 'home').why], ['jita', 'too thin to buy a week’s need at Mothership Bellicose: 300 listed at its best prices']);
  eq('    none listed there: said as at Goonmetrics\' hubs', src({ home: st([]) }).options.find((x) => x.source === 'home').why, 'none listed at Mothership Bellicose');
  eq('    Goonmetrics\' prices keep Goonmetrics\' rule (ten times a week\'s need moved)', src({ home: { sell: 90, buy: 80, weekly: 4999, at: at(30) } }).options.find((x) => x.source === 'home').why, 'too thin to buy a week’s need at Mothership Bellicose');

  // Selling at a hub priced by its own read (corrections 8 and 11).
  const sq = (sold, weekly = null) => ({ sell: 105, buy: 95, weekly, at: at(30), source: 'structure', sells: [{ price: 105, volume: 50 }], sold });
  const sell = (home, hist = null) => K.sellAt('home', { jita: null, stats: null, home, homeHist: hist }, { broker: null, tax: 0.03375, leg: { kind: 'here' }, volume: 1, makes: 50, share: 10, now: T, hubName: 'UALX-3' });
  const told = { sell: 300, buy: 100, single: { sell: 0, buy: 0 }, orders: { sell: 10, buy: 4 } };
  eq('selling at a hub priced by its own read, before the history: Goonmetrics\' weekly ÷ 7, split by what its orders sold', [sell(sq(told, 7000)).pace, sell(sq(told, 7000)).split, sell(sq(told, 7000)).splitFrom, sell(sq(told, 7000)).paceFrom], [1000, 0.75, 'book', 'goonmetrics']);
  const day = (i, avg) => ({ date: new Date(T - (i + 1) * 86400_000).toISOString().slice(0, 10), average: avg, highest: 110, lowest: 90, volume: 1000, order_count: 50 });
  const dumps = Array.from({ length: 30 }, (_, i) => day(i, 92)).reverse();
  eq('  with the home history: its pace, the book still first for the split', [sell(sq(told), dumps).pace, sell(sq(told), dumps).splitFrom, sell(sq(told), dumps).listPace], [1000, 'book', 750]);
  eq('  a book that sold too little to say: history\'s guess, as before', sell(sq({ sell: 5, buy: 2, single: { sell: 0, buy: 0 }, orders: { sell: 10, buy: 4 } }), dumps).splitFrom, 'history');
  eq('  no weekly movement and no history (a hub Goonmetrics doesn\'t track): no pace, said, never 0', [sell(sq(told)).pace, sell(sq(told)).why], [null, 'Nothing says how fast it sells at UALX-3']);
  eq('  a type the whole read doesn\'t have: none listed there, before any word of pace', sell({ sell: null, buy: null, weekly: null, at: at(30), source: 'structure', sells: [] }).why, 'none listed at UALX-3');

  // To do: a built item at a hub priced by its own market, and one whose hub isn't known yet.
  const bx = { charId: 7, who: null, typeId: 25894, place: BELL, placeName: 'UALX-3 - Mothership Bellicose', jobIds: [3], newest: 3, units: 10, held: 10, stationId: BELL };
  const own = D.builtItem(bx, { name: 'Pump', where: 'home', market: { kind: 'priced', price: 7_099_000 }, hubName: 'Mothership Bellicose', isMain: true, homeFrom: 'its own market' });
  has('List what you built at a hub priced by its own market says so', own.detail, '(the hub’s cheapest listing less a tick, its own market)');
  has('  Goonmetrics\' as before when it speaks', D.builtItem(bx, { name: 'Pump', where: 'home', market: { kind: 'priced', price: 7_099_000 }, hubName: 'UALX-3', isMain: true }).detail, '(the hub’s cheapest listing less a tick, Goonmetrics)');
  const pend = D.builtItem(bx, { name: 'Pump', where: 'hub', market: { kind: 'reading' }, hubName: null, isMain: true });
  eq('  the home hub picked not known yet (the cloud\'s list still being read): said, nothing copied', [pend.detail.includes('Reading your home hub from the cloud.'), pend.action.copy ?? null], [true, null]);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check`
Expected: FAIL, `HM.hubsFrom is not a function` (and the others in turn).

- [ ] **Step 3: The pure rules**

In `src/lib/homeMarket.ts`: the imports become

```ts
import type { StructureRow } from './bookFold';
import { ago, units } from './format';
import type { HomeQuote } from './industryRank';
```

`HOME_HUBS` and its type become (the values unchanged, `goonmetrics: true` added):

```ts
/** A home hub as the tab reads it: Goonmetrics' two, and any the cloud reads that you added. `short` names it beside the others. */
export type HomeHub = { id: number; name: string; short: string; systemId: number; region: number; regionName?: string; goonmetrics: boolean };
/** The hubs Goonmetrics tracks that the tab reads (its importing page, 9 October 2026). 1DQ1-A is left out: the research found almost nothing listed there. */
export const HOME_HUBS: readonly HomeHub[] = [
  // The Imperium's market at UALX-3 (the user, 10 October 2026: "1st Byzantigoon is probably the goons and therefor the imperium alliances market").
  { id: 1046664001931, name: 'UALX-3 - 1st Byzantigoon', short: 'UALX-3', systemId: 30004807, region: 10000061, regionName: 'Tenerifis', goonmetrics: true },
  // Goonswarm's staging.
  { id: 1049588174021, name: 'C-J6MT - Ceci n’est pas une keeptar', short: 'C-J6MT', systemId: 30000772, region: 10000009, regionName: 'Insmother', goonmetrics: true },
];
```

and add, after `homeQuote`:

```ts
/** A structure's name beside the others: what follows its system's (UALX-3 - Mothership Bellicose is Mothership Bellicose). */
export const hubShort = (name: string): string => { const i = name.indexOf(' - '); const s = i > 0 ? name.slice(i + 3).trim() : ''; return s || name; };

/** Every hub the tab knows: Goonmetrics' two always (the cloud off, a version behind or failing too), then those you added that the cloud lists. */
export function hubsFrom(list: readonly HubState[] | null): HomeHub[] {
  return [...HOME_HUBS, ...(list ?? []).filter((h) => h.kept === 'added' && !h.off && !HOME_HUBS.some((g) => g.id === h.id))
    .map((h): HomeHub => ({ id: h.id, name: h.name, short: hubShort(h.name), systemId: h.systemId, region: h.regionId, goonmetrics: false }))];
}

/** A structure's own read speaks while under this old (the spec): it's read hourly, so one read missed still speaks. */
export const STRUCTURE_FRESH_MS = 2 * 3600_000;
export type HomeSpeaks = { source: 'structure' | 'goonmetrics'; at: string } | null;
/** Which price speaks at a hub: its own market's read while under two hours old, else Goonmetrics' (whatever its age, said), else none. */
export function homeSpeaks(book: { at: string } | null, gm: { at: string } | null, now: number): HomeSpeaks {
  if (book && now - Date.parse(book.at) < STRUCTURE_FRESH_MS) return { source: 'structure', at: book.at };
  return gm ? { source: 'goonmetrics', at: gm.at } : null;
}

/**
 * A type's quote from a structure's own read: its best sell and buy, its best sell levels (to buy a week's need up them) and what
 * its live orders sold (the split). The read held every order, so a type it lacks has none listed there, which is known (correction
 * 8). Weekly movement isn't in a structure's read: a Goonmetrics hub's figure is carried, labelled where it's said.
 */
export function structureQuote(row: StructureRow | undefined, at: string, weekly: number | null): HomeQuote {
  return {
    sell: row?.[1][0]?.[0] ?? null, buy: row?.[0][0]?.[0] ?? null, weekly, at, source: 'structure',
    sells: (row?.[1] ?? []).map(([price, volume]) => ({ price, volume })),
    ...(row ? { sold: { sell: row[4][0], buy: row[4][1], single: { sell: row[4][2], buy: row[4][3] }, orders: { sell: row[3], buy: row[2] } } } : {}),
  };
}

/** How long the browser keeps a hub's own read: until the next hourly read could land (its `at` + an hour + a margin), 5 to 15 minutes. */
export function bookHoldMs(at: string | null, now: number): number {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return HOME_HOLD_MAX_MS;
  return Math.max(HOME_HOLD_MIN_MS, Math.min(HOME_HOLD_MAX_MS, t + 3600_000 + HOME_HOLD_MARGIN_MS - now));
}

/**
 * A hub's own market as a sentence, every state in its own words (spec, "Every state"): a reader whose login can't read it (no
 * permission, refused, none kept, not one of yours any more: each with where to fix it), not read yet, refused by the structure's
 * access list (and what stands in), failing, or read (by whom, when). `gm`: Goonmetrics tracks the hub, so its prices stand in. A try
 * by an earlier reader says nothing of this one's: only its last good read is said.
 */
export function ownMarketSaid(h: HubState, now: number, gm: boolean): string {
  const who = h.readerIsMain ? 'you' : h.readerName ?? `Character ${h.reader}`;
  const login = h.readerIsMain ? 'your login' : `${who}’s login`;
  if (h.off) return `Its own market isn’t read with a character: ${gm ? 'Goonmetrics’ prices only' : 'nothing prices it'}.`;
  if (h.login === 'notYours') return `Its own market’s reader, ${who}, isn’t one of your characters any more: pick another.`;
  if (h.login === 'none') return h.readerIsMain ? 'Its own market is read with your login, which the cloud doesn’t hold: hand it yours under Settings → Your data.'
    : `Its own market is read with ${who}’s login, which the cloud doesn’t hold: hand it over on Characters.`;
  if (h.login === 'refused') return h.readerIsMain ? 'EVE refused the cloud’s login for you, which reads its own market: hand it over again under Settings → Your data.'
    : `EVE refused the cloud’s login for ${who}, which reads its own market: hand it over again on Characters.`;
  if (h.login === 'permission') return `Reading its own market needs EVE’s permission for structure markets: ${h.readerIsMain
    ? 'log in again here, then hand the cloud your login (Settings → Your data)' : `hand the cloud ${who}’s login again on Characters`}.`;
  const b = h.book && h.book.reader === h.reader ? h.book : null;
  const last = h.book?.at ? ` The last good read was ${ago(h.book.at, now)}${h.book.reader !== h.reader && h.book.readerName ? `, with ${h.book.readerName}’s login` : ''}.` : '';
  if (!b) return `Its own market isn’t read yet: the cloud reads it hourly with ${login}.${last}`;
  if (b.refusedAt) return `EVE refused ${h.readerIsMain ? 'your' : `${who}’s`} read of ${hubShort(h.name)}: it isn’t on its access list (first refused ${ago(b.refusedAt, now)}). ${gm ? 'Goonmetrics’ prices stand in.' : 'Nothing stands in: Goonmetrics doesn’t track it.'}${last}`;
  // The Worker's words start a sentence: lower-cased inside this one, unless they start with an acronym (ESI).
  const why = /^[A-Z]{2}/.test(b.error ?? '') ? b.error : `${(b.error ?? '').charAt(0).toLowerCase()}${(b.error ?? '').slice(1)}`;
  if (b.error) return `Its own market’s last read, ${ago(b.tried, now)}, failed (${why}).${b.at ? last : ' Nothing has been read yet.'}`;
  return `Its own market was read ${ago(b.at!, now)} with ${login}: ${units(b.types)} of the watched items listed there${b.pages ? ` (${units(b.pages)} page${b.pages === 1 ? '' : 's'})` : ''}.`;
}
```

In `src/lib/industryRank.ts`: add `import { units } from './format';`; `HomeQuote` becomes

```ts
/**
 * A home hub's prices: best sell and buy, weekly movement, and when; null where not known. `source`: Goonmetrics' (absent on its
 * quotes) or the structure's own read (stage 4), which adds what its live orders sold (`sold`, the split) and its best sell levels
 * (`sells`, to buy a week's need up them: correction 9). A structure's read has no weekly movement of its own: a Goonmetrics hub's
 * figure rides along.
 */
export type HomeQuote = { sell: number | null; buy: number | null; weekly: number | null; at: string; source?: 'structure' | 'goonmetrics'; sold?: BookSold; sells?: BookLevel[] };
```

add after `sourceMaterial`'s type block (before the function):

```ts
/** What `units` cost each, bought up `levels` from the best; null when they hold fewer, or none are wanted. */
export function fillCost(levels: readonly BookLevel[], units: number): number | null {
  if (!(units > 0)) return null;
  let left = units, cost = 0;
  for (const l of levels) {
    const take = Math.min(left, l.volume);
    cost += take * l.price; left -= take;
    if (left <= 1e-9) return cost / units;
  }
  return null;
}
```

(the parameter `units` shadows the import inside `fillCost` only, which reads no formatting); in `sourceMaterial`, the home branch
becomes:

```ts
  if (o.home && o.homeLeg && o.hubName) {
    const at = o.hubName, sell = o.home.sell;
    if (o.home.source === 'structure') {
      // Its own read: what a week's need costs bought up its best levels (correction 9); it has no weekly movement to judge depth by.
      const levels = o.home.sells ?? [];
      const avg = fillCost(levels, o.weekNeed);
      const f = avg != null ? legCost(o.homeLeg, o.volume, avg, o.weekNeed) : null;
      options.push(sell == null ? { source: 'home', price: null, why: `none listed at ${at}`, pickable: false }
        : avg == null ? { source: 'home', price: sell, why: `too thin to buy a week’s need at ${at}: ${units(levels.reduce((s, l) => s + l.volume, 0))} listed at its best prices`, pickable: false }
          : f == null ? { source: 'home', price: null, why: `no freight route from ${at}`, pickable: false }
            : { source: 'home', price: avg + f, why: `${at}’s listings: a week’s need bought up its best prices`, pickable: true });
    } else {
      const weekly = o.home.weekly;
      const f = sell != null ? legCost(o.homeLeg, o.volume, sell, o.weekNeed) : null;
      options.push(sell == null ? { source: 'home', price: null, why: `none listed at ${at}`, pickable: false }
        : weekly == null ? { source: 'home', price: sell, why: `${at}’s weekly movement isn’t known, so its depth can’t be judged`, pickable: false }
          : weekly < HOME_DEPTH * o.weekNeed ? { source: 'home', price: sell, why: `too thin to buy a week’s need at ${at}`, pickable: false }
            : f == null ? { source: 'home', price: null, why: `no freight route from ${at}`, pickable: false }
              : { source: 'home', price: sell + f, why: `${at}’s best sell`, pickable: true });
    }
  }
```

and in `sellAt`, the home branch becomes:

```ts
  } else {
    const h = m.home;
    if (!h) return { ...base, why: m.homeRead ? `No price at ${o.hubName ?? 'home'}` : `Not read at ${o.hubName ?? 'home'} yet` };
    // A whole read of the structure's own market without the type: none listed there, known, before any word of pace (correction 8).
    if (h.source === 'structure' && h.sell == null && h.buy == null) return { ...base, why: `none listed at ${o.hubName ?? 'home'}` };
    const hist = m.homeHist && m.homeHist.length ? m.homeHist : null;
    list = listingPrice(h.sell, h.buy, hist ? recentRange(hist, 14, o.now).highs : null);
    bid = h.buy;
    // What the structure's live orders sold says who trades there, first when it can (B10, correction 11), as the Jita book does.
    if (hist) {
      pace = paceDay(hist, o.now);
      const s = tradingSplit({ history: buyerShare(hist.slice(-30)), book: h.sold ?? null });
      split = s.share; splitFrom = s.from; paceFrom = 'history';
    } else {
      pace = h.weekly != null ? h.weekly / 7 : null;
      const s = h.sold ? tradingSplit({ book: h.sold }) : null;
      split = s?.from === 'book' ? s.share : EVEN_SPLIT; splitFrom = s?.from === 'book' ? 'book' : 'goonmetrics'; paceFrom = pace != null ? 'goonmetrics' : null;
    }
  }
```

- [ ] **Step 4: Run the pure tests, see them pass; plant each rule wrong**

Run: `npm run check`. Expected: `all passed` twice (the stage-1 sourcing and selling tests, which pass Goonmetrics' quotes with no
`source`, unchanged). Plant and see each fail, putting it back after: `homeSpeaks` with `<=` 3 hours (the 2 h 01 case speaks);
`structureQuote` leaving `sold` out (the split reads even); the structure branch using Goonmetrics' depth rule (the deep material
isn't picked); drop the early "none listed" in `sellAt` (the absent type says "Nothing says how fast"); `ownMarketSaid` without the
`book.reader === h.reader` check (the reader changed reads as refused-or-read by the new one).

- [ ] **Step 5: The browser reads the hub list and each hub's own read**

In `src/lib/cloud.ts`, import `type { HomeBookAnswer, HubState } from './homeMarket';` beside `HomeRow`, and add after
`cloudHomePrices`:

```ts
/** The home markets the cloud reads for this ledger (homeMarkets.ts): Goonmetrics' two and any you added, each with its reader and its own reads. A Worker a version behind answers 404. */
export const cloudHomeMarkets = () => call<{ hubs: HubState[] }>('/v1/home/markets');
/** A hub's last good read of its own market, null before one. A Worker a version behind answers 404. */
export const cloudHomeBook = (hub: number) => call<HomeBookAnswer>(`/v1/home/book?hub=${hub}`);
```

In `src/components/hustles/industryMarket.ts`: add `useSyncExternalStore` to the React import; import `cloudHomeBook`,
`cloudHomeMarkets` from `'../../lib/cloud'`; extend the homeMarket import to `{ bookHoldMs, HOME_HOLD_MAX_MS, homeHoldMs, homeQuote,
homeSpeaks, hubsFrom, structureQuote, type HomeHub, type HomeRow, type HomeSpeaks, type HubState }`; import `type { StructureRow }
from '../../lib/bookFold'`, `type { HomeQuote } from '../../lib/industryRank'` and `useNow` from `'../../lib/hooks'`; and add after
`useHomePrices`:

```ts
/**
 * Bumped after a change to the home markets (a reader set, a hub added or removed, a read now: Task 18C), so every hook reading them
 * asks again. Subscribed at module level (gotchas.md: an inline subscribe is a new function every render).
 */
let homeVer = 0;
const homeListeners = new Set<() => void>();
const subscribeHome = (cb: () => void) => { homeListeners.add(cb); return () => { homeListeners.delete(cb); }; };
const homeVerNow = () => homeVer;
const useHomeVer = () => useSyncExternalStore(subscribeHome, homeVerNow);

/**
 * The home markets the cloud reads (`GET /v1/home/markets`): `off` with the cloud copy off in this browser (or not asked for), `behind`
 * for a Worker without the route (404), `failed` otherwise, else the list. Held 15 minutes, shared while in flight, and read again
 * after any change made here (`refreshHomeMarkets`), on another login and on "Delete all data".
 */
export type MarketsState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string } | { status: 'ok'; list: HubState[] };
const OFF_MARKETS: MarketsState = { status: 'off' };
let marketsHeld: { until: number; read: ReturnType<typeof cloudHomeMarkets> } | null = null;
const marketsRead = () => {
  if (marketsHeld && Date.now() < marketsHeld.until) return marketsHeld.read;
  const read = cloudHomeMarkets();
  const held = { until: Infinity, read };
  marketsHeld = held;
  read.then(() => { held.until = Date.now() + HOME_HOLD_MAX_MS; }, () => { if (marketsHeld === held) marketsHeld = null; });
  return read;
};
/** A hub's own read, held until the next hourly read could land (bookHoldMs), per hub. */
const bookHeld = new Map<number, { until: number; read: ReturnType<typeof cloudHomeBook> }>();
const bookRead = (hub: number) => {
  const h = bookHeld.get(hub);
  if (h && Date.now() < h.until) return h.read;
  const read = cloudHomeBook(hub);
  const held = { until: Infinity, read };
  bookHeld.set(hub, held);
  read.then((r) => { held.until = Date.now() + bookHoldMs(r?.at ?? null, Date.now()); }, () => { if (bookHeld.get(hub) === held) bookHeld.delete(hub); });
  return read;
};
const resetHomeMarkets = () => { marketsHeld = null; bookHeld.clear(); };
let marketsChar: number | null | undefined;
onAuthChange(() => { const id = getAuth()?.characterId ?? null; if (marketsChar !== undefined && marketsChar !== id) resetHomeMarkets(); marketsChar = id; });
onClearAll(resetHomeMarkets);
/** After a change to the home markets: everything held is let go and every hook reads again. */
export function refreshHomeMarkets(): void {
  resetHomeMarkets();
  homeVer++;
  for (const l of homeListeners) l();
}

export function useHomeMarkets(on = true): MarketsState {
  const cloud = useCloud();
  const ver = useHomeVer();
  const [st, setSt] = useState<MarketsState>({ status: 'loading' });
  useEffect(() => {
    if (!on) return;
    if (!cloudEnabled()) { resetHomeMarkets(); setSt(OFF_MARKETS); return; }
    if (!cloud.started) { setSt({ status: 'loading' }); return; }
    let alive = true;
    marketsRead().then((r) => { if (alive) setSt({ status: 'ok', list: r.hubs }); },
      (e) => { if (alive) setSt((e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [on, cloud.started, ver]);
  return on ? st : OFF_MARKETS;
}

/** Every hub the tab knows: Goonmetrics' two always, and those the cloud lists once read. `on`: ask the cloud (only when a hub not Goonmetrics' may be wanted). */
export function useHomeHubs(on = true): { hubs: HomeHub[]; markets: MarketsState } {
  const markets = useHomeMarkets(on);
  const list = markets.status === 'ok' ? markets.list : null;
  return { hubs: useMemo(() => hubsFrom(list), [list]), markets };
}

/** A hub's last good read of its own market: `none` before one, `behind` for a Worker without the route, as useHomePrices. */
export type BookState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string } | { status: 'none' } | { status: 'ok'; at: string; rows: Record<string, StructureRow> };
const LOADING_BOOK: BookState = { status: 'loading' };
export function useHomeBook(hub: number | null): BookState {
  const cloud = useCloud();
  const ver = useHomeVer();
  // Kept with the hub it was read for, so a hub just picked never shows the last one's read for a render.
  const [got, setGot] = useState<{ hub: number | null; st: BookState }>({ hub: null, st: LOADING_BOOK });
  useEffect(() => {
    if (hub == null) return;
    if (!cloudEnabled()) { bookHeld.clear(); setGot({ hub, st: { status: 'off' } }); return; }
    if (!cloud.started) { setGot({ hub, st: LOADING_BOOK }); return; }
    let alive = true;
    setGot((g) => (g.hub === hub ? g : { hub, st: LOADING_BOOK }));
    bookRead(hub).then((r) => { if (alive) setGot({ hub, st: r ? { status: 'ok', at: r.at, rows: r.rows } : { status: 'none' } }); },
      (e) => { if (alive) setGot({ hub, st: (e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e) } }); });
    return () => { alive = false; };
  }, [hub, cloud.started, ver]);
  return got.hub === hub ? got.st : LOADING_BOOK;
}

/**
 * What prices a hub (spec: "Which price speaks"): its own market's read while under two hours old, else Goonmetrics' (a hub it
 * tracks), else none; `quote` gives each type's price from whichever speaks, `read` whether anything does (a type missing from it then
 * has no price there, rather than being unread). `hub` is the hub's state on the cloud's list, for what its own market's read says.
 * The quotes are worked out again only when the source or its time changes, not each minute.
 */
export type HomeSource = { gm: HomeState | { status: 'untracked' }; book: BookState; hub: HubState | null; speaks: HomeSpeaks; quote: (type: number) => HomeQuote | null; read: boolean };
const UNTRACKED = { status: 'untracked' } as const;
export function useHomeQuotes(hub: HomeHub | null): HomeSource {
  const gmRead = useHomePrices(hub?.goonmetrics ? hub.id : null);
  const book = useHomeBook(hub?.id ?? null);
  const markets = useHomeMarkets(!!hub);
  const now = useNow(60_000);
  const gm: HomeSource['gm'] = hub && !hub.goonmetrics ? UNTRACKED : gmRead;
  const speaks = homeSpeaks(book.status === 'ok' ? book : null, gm.status === 'ok' ? gm : null, now);
  const key = speaks ? `${speaks.source}:${speaks.at}` : '';
  const state = hub && markets.status === 'ok' ? markets.list.find((x) => x.id === hub.id) ?? null : null;
  return useMemo((): HomeSource => {
    const quote = (t: number): HomeQuote | null => (speaks?.source === 'structure' && book.status === 'ok'
      ? structureQuote(book.rows[t], book.at, gm.status === 'ok' ? gm.prices[t]?.[1] ?? null : null)
      : speaks?.source === 'goonmetrics' && gm.status === 'ok' ? homeQuote(gm.prices[t]) : null);
    return { gm, book, hub: state, speaks, quote, read: speaks != null };
  }, [gm, book, state, key]); // eslint-disable-line react-hooks/exhaustive-deps
}
```

(`useHomePrices(null)` returns its first state, which is stable, so `gm` holds still for a hub Goonmetrics doesn't track.)

- [ ] **Step 6: The finder: the hub from the list, the source said, the home histories read**

In `src/components/hustles/industryFinder.ts`: import `ownMarketSaid` and `hubOf` (kept) from `'../../lib/homeMarket'` (drop
`homeQuote`, now used by `useHomeQuotes`); import `useHomeHubs`, `useHomeQuotes`, `type HomeSource`, `type MarketsState` from
`'./industryMarket'` (drop `useHomePrices` and `type HomeState` there); import `type Sale` from `'../../lib/industryRank'` and
`SPLIT_SAID, type SplitFrom` from `'../../lib/split'`. Then:

- `Finder`'s last field becomes:

```ts
  /** The home hub picked (Goonmetrics' or one the cloud reads), every hub the tab knows, what prices the hub, and the cloud's list's state while the hub picked isn't known. */
  hub: HomeHub | null; hubs: HomeHub[]; home: HomeSource; hubMissing: MarketsState | null;
```

- in `useFinder`, replace `const hub = hubOf(doc.hub); const home = useHomePrices(hub?.id ?? null); const prices = …;` with:

```ts
  // Goonmetrics' two are always known; a hub you added comes from the cloud's list, asked for only when such a hub is picked.
  const { hubs, markets } = useHomeHubs(doc.hub != null && !hubOf(doc.hub));
  const hub = hubs.find((h) => h.id === doc.hub) ?? null;
  const hubMissing = doc.hub != null && !hub ? markets : null;
  const home = useHomeQuotes(hub);
```

- in `input`'s `market`: `home: home.quote(t), homeRead: home.read` (for `home: prices ? homeQuote(prices[t]) : null, homeRead:
  !!prices`), and in its dependencies `home` for `prices`;
- `homeTypes` becomes:

```ts
  // The home region's history for the top rows sold at home, and for rows priced there with no pace yet: a hub Goonmetrics doesn't
  // track has no weekly movement, so nothing there had a pace to be ranked by until its history was read (correction 10).
  const homeTypes = useMemo(() => {
    if (!hub) return [];
    const sold = first.filter((r) => r.day && r.sale?.place === 'home');
    const fee = doc.hubFees[hub.id] ?? 0;
    const unpaced = first.filter((r) => !r.day && r.costUnit != null)
      .map((r) => ({ r, m: Math.max(-Infinity, ...r.sales.filter((s) => s.place === 'home' && s.paceFrom == null && (s.list ?? s.bid) != null).map((s) => (s.list ?? s.bid)! * (1 - fee) - r.costUnit!)) }))
      .filter((x) => x.m > 0).sort((a, b) => b.m - a.m).map((x) => x.r);
    return [...sold, ...unpaced].slice(0, LIVE_ROWS).map((r) => r.product);
  }, [first, hub, doc.hubFees]);
```

- the return gains `hubs, hubMissing` (`return { site, facts, lab, waiting, rows, live, input: liveInput, npc, bpo, scan, hub, hubs,
  home, hubMissing };`);
- `homeSaid` is replaced with:

```ts
/**
 * What prices the home hub, as a sentence beside the choices (`now` ticks so "read 2 h ago" moves): its own market's fresh read; else
 * Goonmetrics' with its time and, after it, what its own market's read says (correction 7, Review Focus 2 and 3); a hub Goonmetrics
 * doesn't track with no fresh read prices nothing, said; a hub picked that the cloud's list hasn't given yet says why.
 */
export function homeSaid(f: Pick<Finder, 'hub' | 'home' | 'hubMissing'>, now: number, ago: (iso: string, now: number) => string): string | null {
  const h = f.hub, st = f.home;
  if (!h) {
    const m = f.hubMissing;
    if (!m) return null;
    return m.status === 'loading' ? 'Reading your home markets from the cloud…'
      : m.status === 'off' ? 'Your home hub is one the cloud reads, which isn’t on in this browser (Settings → Your data).'
        : m.status === 'behind' ? 'The cloud is a version behind: your home hub comes once it’s updated.'
          : m.status === 'failed' ? `Couldn’t read your home markets from the cloud: ${m.error}.`
            : 'Your home hub isn’t one the cloud reads any more: pick another, or add it again under Home markets.';
  }
  if (st.speaks?.source === 'structure') return `${h.short}’s prices: its own market, read ${ago(st.speaks.at, now)}.`;
  const own = st.hub && !st.hub.off ? ` ${ownMarketSaid(st.hub, now, h.goonmetrics)}` : '';
  if (!h.goonmetrics) {
    const b = st.book;
    if (b.status === 'off') return `${h.short}’s prices come from the cloud, which isn’t on in this browser (Settings → Your data).`;
    if (b.status === 'loading') return `Reading ${h.short}’s own market from the cloud…`;
    if (b.status === 'behind') return `The cloud is a version behind: ${h.short}’s own market comes once it’s updated.`;
    if (b.status === 'failed') return `Couldn’t read ${h.short}’s own market from the cloud: ${b.error}.`;
    return `${h.short} isn’t priced: Goonmetrics doesn’t track it, and its own market has no read under two hours old.${own}`;
  }
  const gm = st.gm;
  if (gm.status === 'off') return 'Home prices come from the cloud, which isn’t on in this browser (Settings → Your data).';
  if (gm.status === 'loading') return `Reading ${h.short}’s prices from the cloud…`;
  if (gm.status === 'behind') return 'The cloud is a version behind: home prices come once it’s updated.';
  if (gm.status === 'failed') return `Couldn’t read ${h.short}’s prices from the cloud: ${gm.error}.${own}`;
  if (gm.status === 'switched') return `Goonmetrics isn’t read: the cloud has it switched off.${own}`;
  if (gm.status === 'none') return `Not read yet: the cloud reads ${h.short}’s prices from Goonmetrics every six hours.${own}`;
  if (gm.status !== 'ok') return null;
  const old = now - Date.parse(gm.at) > HOME_STALE_MS;
  return `${h.short}’s prices: Goonmetrics, read ${ago(gm.at, now)}${old ? ': older than a day' : ''}.${own}`;
}

/** Where a home sale's prices come from, for a row and the count line. */
export const homeFromSaid = (home: HomeSource): string => (home.speaks?.source === 'structure' ? 'its own market' : 'Goonmetrics’ prices');

/** How a home sale's pace and split were worked out, for the detail: Goonmetrics' weekly movement or the region's history, split by the hub's own book where it could tell. */
export function homePaceSaid(s: Sale, hubName: string): string {
  const book = `what the orders in ${hubName}’s market have sold`;
  if (s.paceFrom === 'goonmetrics') return s.splitFrom === 'book' ? `Goonmetrics’ weekly movement ÷ 7, split by ${book}, until the home history is read` : 'Goonmetrics’ weekly movement ÷ 7, at an even split, until the home history is read';
  return s.splitFrom === 'book' ? `the home region’s history, split by ${book}` : SPLIT_SAID[s.splitFrom as SplitFrom];
}
```

(If `HomeState` or `useHomePrices` no longer has a reader in this file, drop them from its imports: `npm run build` fails on an
unused import.)

- [ ] **Step 7: The Build section and the detail say which source**

In `src/components/hustles/IndustryBuild.tsx`: drop the `HOME_HUBS` import; import `homeFromSaid` from `'./industryFinder'`; the
Home hub select becomes

```tsx
        <label className="chip h34"><span className="cl">Home hub</span>
          <select value={doc.hub ?? ''} onChange={(e) => setDoc({ hub: e.target.value ? Number(e.target.value) : null })} aria-label="Home hub">
            <option value="">None</option>
            {f.hubs.map((h) => <option key={h.id} value={h.id}>{h.short}</option>)}
            {doc.hub != null && !f.hub && <option value={doc.hub}>{f.hubMissing?.status === 'loading' ? 'Reading…' : 'Not listed'}</option>}
          </select>
        </label>
```

the count line's `; a sale at ${f.hub.short} on Goonmetrics’ prices` becomes `` `; a sale at ${f.hub.short} on ${homeFromSaid(f.home)}` ``,
and the row's `book` for a home sale `` `sold at ${f.hub?.short}, ${homeFromSaid(f.home)}` ``.

In `src/components/hustles/IndustryDetail.tsx`: import `ago` from `'../../lib/format'`, `useNow` from `'../../lib/hooks'`, `type
HomeQuote` from `'../../lib/industryRank'` and `homePaceSaid` from `'./industryFinder'`; `const now = useNow(60_000);` at the top of the component; the staleness of Goonmetrics'
per-type figure applies only when Goonmetrics speaks:

```ts
  const homeAt = finder.home.speaks?.source === 'goonmetrics' ? Date.parse(finder.home.speaks.at) : NaN, typeAt = Date.parse(input.market(row.product).home?.at ?? '');
```

and the sale's note (`n:` of `The sale at …`) becomes:

```ts
          n: s.why ?? `nets ${iskBig(s.listNet)} listed${s.brokerKnown ? '' : ' (before the broker fee: not typed)'}, ${iskBig(s.bidNet)} into the best bid · ${units(s.pace)} a day, ${pct(s.split, 0)} buyers taking listings (${s.place === 'home' ? homePaceSaid(s, input.hubName ?? 'home') : SPLIT_SAID[s.splitFrom as Exclude<typeof s.splitFrom, 'goonmetrics'>]})${s.place === 'home' ? homeTail(input.market(row.product).home) : ''}${s.freight ? ` · freight ${isk(s.freight)} a unit` : ''}`,
```

with, before the return:

```ts
  // Where a home sale's figures came from: the hub's own market (and Goonmetrics' weekly movement where it has one), or Goonmetrics.
  const homeTail = (q: HomeQuote | null | undefined) => (q?.source === 'structure'
    ? ` · ${input.hubName}’s own market, read ${ago(q.at, now)}${q.weekly != null ? ` · Goonmetrics: ${units(q.weekly)} a week` : ''}`
    : ` · Goonmetrics: ${q?.weekly != null ? units(q.weekly) : '–'} a week${staleFigure}`);
```

- [ ] **Step 8: To do lists what you built at any home hub**

In `src/lib/todo.ts`, `builtItem`'s options and words:

```ts
export function builtItem(x: BuiltItem & { who: string | null; placeName: string | null }, o: { name: string; where: 'jita' | 'home' | 'checking' | 'hub' | null; market: BuiltMarket; hubName: string | null; isMain: boolean; age?: string | null; shipFailed?: boolean; lost?: string | null; homeFrom?: string | null }): TodoItem {
  const at = o.where === 'home' ? `at ${o.hubName ?? 'your home hub'}` : 'in Jita';
  const copies = o.isMain ? '; opening it copies the price.' : '.';
  const priceSaid = o.where === 'hub' ? 'Reading your home hub from the cloud.'
    : o.where === 'checking' ? (o.shipFailed ? 'Couldn’t read whether it’s a ship, so it isn’t priced.' : 'Checking whether it’s a ship.')
      : o.where == null ? 'It’s a ship and “never haul ships to Jita” is on, with no home hub picked: pick one on the Industry tab.'
        : o.market.kind === 'priced' ? `List ${at} at ${isk(o.market.price)}${o.where === 'jita' ? ' (others’ cheapest listing less a tick, where trading reaches)' : ` (the hub’s cheapest listing less a tick, ${o.homeFrom ?? 'Goonmetrics'})`}${copies}${o.age ? ` ${o.age}` : ''}`
          : o.market.kind === 'reading' ? (o.where === 'jita' ? 'Reading its Jita book.' : 'Reading the home hub’s prices.')
            : o.market.kind === 'none' ? `No price to list ${at}: nobody lists it there.` : o.market.said;
```

(the rest of `builtItem` unchanged: `price` is copied only for `jita` or `home`, so `hub` copies nothing).

In `src/components/Todo.tsx`: replace the imports of `useHomePrices` (`'./hustles/industryMarket'`) and of `HOME_HUBS, hubOf, homeQuote,
type HomeHub` (`'../lib/homeMarket'`) with `import { useHomeHubs, useHomeQuotes } from './hustles/industryMarket';` and `import { hubOf }
from '../lib/homeMarket';`, and `homeSaid` stays imported from `'./hustles/industryFinder'`. Then:

```ts
  // Goonmetrics' two hubs are always known; one you added comes from the cloud's list, asked for only when such a hub is picked.
  const { hubs, markets: homeMarkets } = useHomeHubs(d.industry.hub != null && !hubOf(d.industry.hub));
  const hub = hubs.find((h) => h.id === d.industry.hub) ?? null;
  const hubPending = d.industry.hub != null && !hub && homeMarkets.status === 'loading';
  const placeSystem = (b: BuiltItem) => builtPlaceSystem(b, d.industry.sites.find((s) => s.structureId === b.place || s.stationId === b.place)?.systemId ?? null, hubs);
  // Where it lists. Whether it's a ship only matters where the answer differs; until the type is read that's 'checking', never
  // "not a ship" (a ship built at home must not be priced, or copied, at Jita); a hub picked that the cloud hasn't listed yet, 'hub'.
  const whereOf = (b: BuiltItem): 'jita' | 'home' | 'checking' | 'hub' | null => {
    if (hubPending) return 'hub';
    const at = (ship: boolean) => builtWhere({ place: b.place, placeSystem: placeSystem(b), hub, sell: d.industry.sell, ship, noShipsToJita: d.industry.noShipsToJita });
    if (shipKinds.known.has(b.typeId)) return at(shipKinds.ships.has(b.typeId));
    return at(true) === at(false) ? at(false) : 'checking';
  };
  const builtWhereAll = builtAll.map((x) => whereOf(x.b));
  // The hub's prices are read only when something built lists there.
  const homeQ = useHomeQuotes(builtWhereAll.includes('home') ? hub : null);
```

and in the loop over `builtAll`, the `home` branch and the names:

```ts
      } else if (where === 'home') {
        const said = homeSaid({ hub, home: homeQ, hubMissing: null }, now, ago);
        if (!homeQ.speaks) market = homeQ.gm.status === 'loading' || homeQ.book.status === 'loading' ? { kind: 'reading' } : { kind: 'unknown', said: said ?? 'Home prices aren’t read.' };
        else {
          // A structure's own read always quotes (a type it lacks is none listed there); Goonmetrics' may have no row for it.
          const q = homeQ.quote(b.typeId);
          market = !q ? { kind: 'unknown', said: `Goonmetrics has no price for it at ${hub!.short}.` } : q.sell != null ? { kind: 'priced', price: tickDown(q.sell) } : { kind: 'none' };
          age = said;
        }
      } else market = { kind: 'none' };
```

`const hubName = hubOf(b.place)?.name;` becomes `const hubName = hubs.find((h) => h.id === b.place)?.name;`, and the `builtItem`
call passes `homeFrom: homeQ.speaks?.source === 'structure' ? 'its own market' : 'Goonmetrics'` beside `hubName: hub?.short ?? null`.
`HomeHub` and `HOME_HUBS` no longer have a reader in Todo.tsx (`builtPlaceSystem` takes `hubs`).

- [ ] **Step 9: The page check**

In `scripts/pages.mjs`, inside the industry case above `// --- the end of the industry case`:

```js
    // --- Task 18B: which price speaks at home. UALX-3's own market read 40 minutes ago speaks over Goonmetrics' five-hour-old read;
    // at 2 h 01 Goonmetrics speaks and the line says when its own market was read; Mothership Bellicose, which Goonmetrics doesn't
    // track, is priced by its own fresh read (its pace from the home history, read for a row with no pace), and says it isn't priced
    // past two hours; the cloud's list a version behind with Bellicose picked is said; To do lists a pump built there at its price.
    const BELL = 1049999999999, OWNER = ownerAuth().characterId;
    const hubSt = (id, name, kept, extra = {}) => ({ id, name, systemId: 30004807, regionId: 10000061, kept, off: false, reader: OWNER, readerName: 'Owner', readerIsMain: true, login: 'ok', book: null, ...extra });
    const bookSt = (agoMin, extra = {}) => ({ at: iso(now - agoMin * 60_000), tried: iso(now - agoMin * 60_000), error: null, refusedAt: null, pages: 3, types: 1, reader: OWNER, readerName: 'Owner', ...extra });
    const bookRow = (sell, buy) => [[[buy, 30]], [[sell, 20], [Math.round(sell * 1.02), 40]], 3, 5, [60, 20, 0, 0]];
    let marketsAnswer = { hubs: [] }, booksAnswer = {};
    CLOUD['/v1/home/markets'] = (url, req, json) => (marketsAnswer === 404 ? json({ error: 'Not found' }, 404) : json(marketsAnswer));
    CLOUD['/v1/home/book'] = (url, req, json) => { const b = booksAnswer[Number(url.searchParams.get('hub'))]; return b === 404 ? json({ error: 'Not found' }, 404) : json(b ?? null); };
    {
      homeHistory = true;
      homeAnswer = (hub) => (hub === UALX_HUB ? { hub, source: 'goonmetrics', at: iso(now - 5 * 3600_000), prices: { [PUMP]: [iso(now - 5 * 3600_000), 7 * 841, 7_000_000, 40, 7_500_000, 50] } } : { hub, source: 'goonmetrics', at: iso(now - 26 * 3600_000), prices: {} });
      const homeAt = async (hub) => {
        await page.goto(SEED_PAGE);
        await seed({ ...ledger, industry: { ...DOC, site: 'home:30004807', hub, sell: 'home', hubFees: { [hub]: 0.01 } }, cloud: CLOUD_STATE }, { alts: altStore, cache: { prospects: SCAN } });
        await page.goto(`${BASE}#hustles/industry/build`);
        await page.reload();
        await page.waitForSelector('[data-industry="home-said"]', { timeout: 30_000 }).catch(() => problems.push(`Build never said what prices hub ${hub}`));
        await page.waitForTimeout(2500);
        return text('[data-industry="home-said"]');
      };
      booksAnswer = { [UALX_HUB]: { hub: UALX_HUB, at: iso(now - 40 * 60_000), rows: { [PUMP]: bookRow(7_200_000, 6_900_000) } } };
      marketsAnswer = { hubs: [hubSt(UALX_HUB, 'UALX-3 - 1st Byzantigoon', 'default', { book: bookSt(40) }), hubSt(1049588174021, 'C-J6MT - Ceci n’est pas une keeptar', 'default')] };
      let said = await homeAt(UALX_HUB);
      if (!said.includes('UALX-3’s prices: its own market, read 40 min ago.')) problems.push(`UALX-3’s own read 40 minutes old doesn’t speak: “${said}”`);
      if (!(await text('[data-bp="25895"]')).includes('sold at UALX-3, its own market')) problems.push('the pump sold at UALX-3 isn’t said to be on its own market');
      if (!(await pumpOpen()).includes('UALX-3’s own market, read 40 min ago · Goonmetrics: 5,887 a week')) problems.push('the pump’s detail doesn’t say its sale is on UALX-3’s own market, with Goonmetrics’ weekly movement beside it');
      // 2 h 01: Goonmetrics speaks, and its own market's read is said after it (Review Focus 3).
      booksAnswer[UALX_HUB] = { ...booksAnswer[UALX_HUB], at: iso(now - 121 * 60_000) };
      marketsAnswer.hubs[0].book = bookSt(121);
      said = await homeAt(UALX_HUB);
      if (!said.includes('UALX-3’s prices: Goonmetrics, read 5 h ago.') || !said.includes('Its own market was read 2 h ago with your login')) problems.push(`past two hours, UALX-3 isn’t priced by Goonmetrics with its own read said: “${said}”`);
      if (!(await text('[data-bp="25895"]')).includes('sold at UALX-3, Goonmetrics’ prices')) problems.push('past two hours, the pump isn’t said to be on Goonmetrics’ prices');
      // Mothership Bellicose: in the select; priced by its own fresh read, paced by the home history (correction 10); stale, unpriced.
      marketsAnswer.hubs.push(hubSt(BELL, 'UALX-3 - Mothership Bellicose', 'added', { book: bookSt(30) }));
      booksAnswer[BELL] = { hub: BELL, at: iso(now - 30 * 60_000), rows: { [PUMP]: bookRow(7_100_000, 6_800_000) } };
      said = await homeAt(BELL);
      if (!(await page.locator('select[aria-label="Home hub"] option', { hasText: 'Mothership Bellicose' }).count())) problems.push('Mothership Bellicose isn’t in the Home hub select');
      if (!said.includes('Mothership Bellicose’s prices: its own market, read 30 min ago.')) problems.push(`Bellicose’s fresh read doesn’t price it: “${said}”`);
      await page.waitForSelector('[data-bp="25895"]', { timeout: 20_000 }).catch(() => problems.push('the pump was never priced at Bellicose (its home history read for a row with no pace)'));
      if (!(await text('[data-bp="25895"]')).includes('sold at Mothership Bellicose, its own market')) problems.push('the pump isn’t sold at Bellicose on its own market');
      if (/Goonmetrics has no price|Goonmetrics: /.test(await text('[data-industry="home-said"]'))) problems.push('Bellicose, which Goonmetrics doesn’t track, is said in Goonmetrics’ words');
      booksAnswer[BELL] = { ...booksAnswer[BELL], at: iso(now - 180 * 60_000) };
      marketsAnswer.hubs[2].book = bookSt(180);
      said = await homeAt(BELL);
      if (!said.includes('Mothership Bellicose isn’t priced: Goonmetrics doesn’t track it, and its own market has no read under two hours old.')) problems.push(`Bellicose with a stale read isn’t said as unpriced: “${said}”`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}-industry-home-speaks.png` });
      // The cloud's list a version behind, Bellicose picked: said, and the pump sells in Jita meanwhile (no hub known).
      const keptMarkets = marketsAnswer;
      marketsAnswer = 404;
      said = await homeAt(BELL);
      if (!said.includes('The cloud is a version behind: your home hub comes once it’s updated.')) problems.push(`Bellicose picked with the cloud a version behind isn’t said: “${said}”`);
      marketsAnswer = keptMarkets;
      // To do: a pump built and sitting at Bellicose lists there at its own market's price less a tick.
      booksAnswer[BELL] = { ...booksAnswer[BELL], at: iso(now - 30 * 60_000) };
      marketsAnswer.hubs[2].book = bookSt(30);
      const bellJob = { jobId: 9601, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 10, licensedRuns: null, successfulRuns: null, probability: null, cost: 1e6,
        facilityId: BELL, stationId: BELL, outputId: BELL, start: iso(now - 2 * 86400_000), end: iso(now - 86400_000), completed: iso(now - 86400_000), status: 'delivered', perRun: 1, seenAt: iso(now - 2 * 86400_000 + 600_000) };
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, jobs: { 9601: bellJob }, stock: { at: iso(now - 600_000), jita: {}, total: { 25894: 10 }, byLocation: { [BELL]: { 25894: 10 } } }, industry: { ...DOC, hub: BELL }, cloud: CLOUD_STATE }, { alts: altStore });
      await page.goto(`${BASE}#todo`);
      await page.waitForFunction(() => /List at Mothership Bellicose at/.test(document.body.textContent ?? ''), null, { timeout: 20_000 }).catch(() => undefined);
      const bellItem = await text('.tn-item:has-text("you built")');
      if (!bellItem.includes('List at Mothership Bellicose at 7,099,000 ISK (the hub’s cheapest listing less a tick, its own market)')) problems.push(`To do doesn’t list the pumps built at Bellicose at its own market’s price: “${bellItem.slice(0, 400)}”`);
      if (SHOTS) { await page.waitForTimeout(900); await page.screenshot({ path: `${SHOTS}-industry-todo-built-bellicose.png` }); }
    }
```

(`homeHistory`, `homeAnswer`, `pumpOpen`, `UALX_HUB` and `PUMP` are the Task 6 block's, in the case's scope. The pump's Bellicose
row needs its history: the Task 6 block's `/markets/10000061/history/` stub serves the pump's 30 days once `homeHistory` is true.
`BELL`, `OWNER`, `hubSt`, `bookSt`, `bookRow`, `marketsAnswer` and `booksAnswer` are declared in the case's scope so 18C and 18D reuse
them.)

- [ ] **Step 10: Run everything; plant; notes; commit**

Run: `npm run check && npm run build && LEDGER=industry npm run check-pages`. Then plant and see the page check fail: `homeSpeaks`
returning Goonmetrics always (the 40-minute read doesn't speak); `homeTypes` without `unpaced` (the pump is never priced at Bellicose);
`whereOf` without `hubPending` and a list read held (nothing breaks: say so in the commit, the pure test pins `hub`); To do's
`homeFrom` left out (the Bellicose item says Goonmetrics). Notes:
- `docs/notes/industry.md`, stage 4: **Which price speaks** (`homeSpeaks`, `useHomeQuotes`): the rule, every reader of home prices and
  what each now says (corrections 8 to 11 and 15), the hub list (`hubsFrom`: Goonmetrics' two always), `hubShort`, the browser's holds
  (the list 15 minutes, a hub's read until the next hourly could land).
- `docs/notes/limits.md`: **Buying at a hub priced by its own read walks its best five levels for a week's need**: deeper stock isn't
  seen, so a material whose week's need sits past five levels reads too thin there, said with how many are listed.
- `docs/notes/orders-alerts.md`, the List what you built bullet: "a hub you added is listed at its own market's price, said; while
  the cloud's list of hubs is being read the item says so and copies nothing".

Run the five checks, look at the two screenshots at both widths, then:

```bash
git add src/lib/homeMarket.ts src/lib/industryRank.ts src/lib/cloud.ts src/components/hustles/industryMarket.ts src/components/hustles/industryFinder.ts src/components/hustles/IndustryBuild.tsx src/components/hustles/IndustryDetail.tsx src/lib/todo.ts src/components/Todo.tsx scripts/check.mjs scripts/pages.mjs docs/notes/industry.md docs/notes/limits.md docs/notes/orders-alerts.md
git commit -m "Industry stage 4: a hub's own market speaks while under two hours old, else Goonmetrics', and every reader says which

The cloud now reads each home market's own book hourly. Which price speaks: that read while under two hours old, else
Goonmetrics' (with its time, and what the hub's own read says after it), else none. The finder, its rows, count line and detail,
and To do's List what you built say which. The hub list is Goonmetrics' two plus any the cloud lists, so a hub you add can be
picked; its system and region come from the cloud.

At a hub priced by its own read: a whole read without a type is none listed there, which is known, unlike Goonmetrics' missing
type; a material is bought up its best five levels for a week's need, since a structure read has no weekly movement for
Goonmetrics' depth rule; the split comes from what its live orders sold, the book first as in Jita (spec B10); and the finder
reads the home history for rows priced there with no pace, or nothing at a hub Goonmetrics doesn't track would ever be ranked.
Tested at the two-hour boundary (1 h 59 speaks, 2 h 01 doesn't) and on every state of a hub's own market in words.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf"
```

---
### Task 18C: The Home markets section

**Files:**
- Create: `src/components/hustles/IndustryHome.tsx`
- Modify: `src/components/hustles/Industry.tsx` (the fifth section), `src/lib/cloud.ts` (`cloudSetHomeMarket`,
  `cloudDropHomeMarket`, `cloudReadHome`), `src/styles.css` (`.ind-home`, beside `.ind-sites`), `scripts/pages.mjs`,
  `.claude/rules/industry.md`, `docs/notes/industry.md`

**Interfaces:**
- Consumes: `useHomeMarkets`, `useHomeBook`, `useHomePrices`, `refreshHomeMarkets`, `useIndustryDoc`, `type MarketsState`
  (industryMarket.ts, 18B); `HOME_HUBS`, `HOME_STALE_MS`, `homeSpeaks`, `hubShort`, `ownMarketSaid`, `type HubState` (homeMarket.ts);
  `FindStructure` with `as` (17B); `secText` (industrySites.ts); the routes of 18A.
- Produces: `IndustryHome({ c, chars, graph })`; `SECTIONS` gains `{ key: 'home', … }` (address `hustles/industry/home`);
  `cloudSetHomeMarket(b: { hub: number; reader: number; name?: string; systemId?: number })`, `cloudDropHomeMarket(hub)`,
  `cloudReadHome(hub)` in `src/lib/cloud.ts`. Task 18D adds the measured fee under each row's Broker fee.

**Why.** The spec's section: lead "Prices at home, from Goonmetrics until a character of yours can read the market itself."; the
list starts with Goonmetrics' two; a character who can see a structure adds one with `FindStructure` as that character (the main in
the browser, an alt through the cloud); Mothership Bellicose is named as the one to add once a character has docking access; each
hub's reader is any character, the main by default; and every state is said (no permission, refused, not read yet, read with its
time, failing with the last good read's time). Each row also lets you make the hub the finder's home hub, so the section is the one
place a hub you added is picked from as well as Build's select. Nothing here writes a synced document but `industry`'s `hub` and
`hubFees` (both kept by an older build's sanitizer: any 13-digit ID); which hubs the cloud reads, and with whose login, go to D1
through the cloud's routes.

- [ ] **Step 1: The cloud's three writes**

In `src/lib/cloud.ts`, after `cloudHomeBook`:

```ts
/** Read a hub with this reader (`POST /v1/home/markets`), adding it when it's new (its name and system from the structure found), or switching a default back on. */
export const cloudSetHomeMarket = (b: { hub: number; reader: number; name?: string; systemId?: number }) => call<{ ok: true }>('/v1/home/markets', { method: 'POST', body: JSON.stringify(b) });
/** Stop reading a default hub, or take one you added off the list (`DELETE /v1/home/markets`). */
export const cloudDropHomeMarket = (hub: number) => call<{ ok: true }>(`/v1/home/markets?hub=${hub}`, { method: 'DELETE' });
/** Read one hub's own market now, with its reader (`POST /v1/home/read`), and its state back. */
export const cloudReadHome = (hub: number) => call<HubState>(`/v1/home/read?hub=${hub}`, { method: 'POST' });
```

- [ ] **Step 2: The section**

Create `src/components/hustles/IndustryHome.tsx`:

```tsx
import { useState } from 'react';
import { Building2, Store } from 'lucide-react';
import { hasScope } from '../../lib/auth';
import { cloudDropHomeMarket, cloudReadHome, cloudSetHomeMarket } from '../../lib/cloud';
import { SCOPE } from '../../lib/config';
import { ago, pct } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { HOME_HUBS, HOME_STALE_MS, homeSpeaks, hubShort, ownMarketSaid, type HubState } from '../../lib/homeMarket';
import { secText } from '../../lib/industrySites';
import type { Graph } from '../../lib/jumps';
import { toast } from '../../lib/toast';
import { Points } from '../Facts';
import { FindStructure } from '../FindStructure';
import { NumChip, Seg, Th } from '../ui';
import type { IndustryChar } from './industryChars';
import { refreshHomeMarkets, useHomeBook, useHomeMarkets, useHomePrices, useIndustryDoc, type MarketsState } from './industryMarket';

/** A row: Goonmetrics' two always, then the hubs you added, as the cloud lists them. */
type HubRow = { id: number; name: string; systemId: number; gm: boolean; state: HubState | null };

/** Why the cloud's list isn't here, as a sentence; null once it is. Goonmetrics' two are listed either way. */
function listWhy(m: MarketsState): string | null {
  return m.status === 'off' ? 'Home markets are read by the cloud, which isn’t on in this browser (Settings → Your data): Goonmetrics’ prices are all there is here.'
    : m.status === 'loading' ? 'Reading your home markets from the cloud…'
      : m.status === 'behind' ? 'The cloud is a version behind: reading a market with your characters comes once it’s updated. Goonmetrics’ prices stand in.'
        : m.status === 'failed' ? `Couldn’t read your home markets from the cloud: ${m.error}.`
          : null;
}

/**
 * Home markets (docs/notes/industry.md, stage 4): every hub the tab prices at home, in every state. Goonmetrics' two are always
 * listed and read with the main unless you choose otherwise; a hub you add is found by a character who can see it, who reads it.
 * Each row says what prices it now, what its own market's read says and its broker fee, and lets you pick its reader, read it now,
 * stop reading it (a default) or remove it (one you added), and make it the finder's home hub. The characters come from
 * Industry.tsx (`chars`): this file reads no alt store, and writes only through the cloud's routes and the synced `industry` doc.
 */
export function IndustryHome({ c, chars, graph }: { c: IndustryChar; chars: IndustryChar[]; graph: Graph }) {
  const now = useNow(60_000);
  const markets = useHomeMarkets();
  const [doc, setDoc] = useIndustryDoc();
  const [busy, setBusy] = useState(false);
  const [searchAs, setSearchAs] = useState<number>(c.charId);
  const list = markets.status === 'ok' ? markets.list : null;
  const rows: HubRow[] = [
    ...HOME_HUBS.map((h) => ({ id: h.id, name: h.name, systemId: h.systemId, gm: true, state: list?.find((x) => x.id === h.id) ?? null })),
    ...(list ?? []).filter((x) => x.kept === 'added' && !x.off).map((x) => ({ id: x.id, name: x.name, systemId: x.systemId, gm: false, state: x })),
  ];
  const act = async (job: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try { await job(); if (done) toast(done, 'info'); }
    catch (e) { toast((e as { status?: number }).status === 404 ? 'The cloud is a version behind: home markets come once it’s updated.' : e instanceof Error ? e.message : String(e), 'err'); }
    finally { refreshHomeMarkets(); setBusy(false); }
  };
  const searcher = chars.find((x) => x.charId === searchAs) ?? c;
  const listSaid = listWhy(markets);
  const bellicose = rows.some((r) => /Bellicose/i.test(r.name));
  const canSearch = !searcher.isMain || (hasScope(SCOPE.search) && hasScope(SCOPE.structures));
  return (
    <section className="col" style={{ gap: 16 }} aria-label="Home markets" data-industry="home">
      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0 }}>Prices at home, from Goonmetrics until a character of yours can read the market itself.</p>
        <Points compact items={[
          { kind: 'info', icon: Store, lead: 'Goonmetrics', text: 'reads UALX-3’s 1st Byzantigoon and C-J6MT every six hours, from its members’ uploads.' },
          { kind: 'good', icon: Building2, lead: 'A market’s own read', text: 'is the cloud reading it every hour with the character you pick, once EVE lets that character use it; it prices the hub while under two hours old.' },
          { kind: 'warn', lead: 'Not in ESI', text: 'a structure’s broker fee: type it, or place an order there and the app measures it.' },
        ]} />
      </div>
      {listSaid && <p className="note small" style={{ margin: 0 }} data-industry="home-list-said">{listSaid}</p>}
      <div className="tbl-scroll" style={{ border: '1px solid var(--line-3)' }}>
        <table className="tbl compact rd-table ind-home" data-industry="home-list">
          <thead>
            <tr>
              <Th left>Hub</Th>
              <Th left className="rd-wide" tip={'What prices the hub now.\n\n• Its own market’s read, while under two hours old.\n• Else Goonmetrics’, with how old it is.\n• Else nothing, said.'}>Prices now</Th>
              <Th left className="rd-wide" tip="The cloud reads the hub’s own market every hour with this character’s login, for the items the Industry tab watches.">Its own market</Th>
              <Th className="rd-wide" tip="Set by the structure’s owner and not in ESI: typed by you, or measured from your own orders there.">Broker fee</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <HubLine key={r.id} r={r} chars={chars} graph={graph} now={now} busy={busy} act={act} listOk={!!list} isHome={doc.hub === r.id}
                fee={doc.hubFees[r.id] ?? null} setFee={(n) => { const next = { ...doc.hubFees }; if (n == null) delete next[r.id]; else next[r.id] = n; setDoc({ hubFees: next }); }}
                makeHome={() => setDoc({ hub: r.id })} onRemoved={() => { if (doc.hub === r.id) setDoc({ hub: null }); }} />
            ))}
          </tbody>
        </table>
      </div>
      {!bellicose && <p className="note small" style={{ margin: 0 }} data-industry="bellicose">Brave’s market at UALX-3, Mothership Bellicose: add it once one of your characters can see it.</p>}
      {list && (
        <div className="col" style={{ gap: 8 }} data-industry="home-add">
          <div className="lbl">Add a market</div>
          {chars.length > 1 && <Seg size="sm" label="Search as" value={searcher.charId} onChange={setSearchAs} options={chars.map((x) => ({ v: x.charId, label: x.name }))} />}
          {canSearch ? (
            <FindStructure label="Find a market structure by name" as={searcher}
              describe={(f) => (rows.some((r) => r.id === f.id) ? 'already listed' : `read with ${searcher.isMain ? 'your' : `${searcher.name}’s`} login`)}
              onPick={(f) => {
                if (rows.some((r) => r.id === f.id)) return;
                void act(async () => { await cloudSetHomeMarket({ hub: f.id, name: f.name, systemId: f.systemId, reader: searcher.charId }); await cloudReadHome(f.id); },
                  `Added ${hubShort(f.name)}; the cloud has read it as ${searcher.isMain ? 'you' : searcher.name}.`);
              }} />
          ) : <p className="note small" style={{ margin: 0 }}>Log in again: finding a structure by name needs EVE’s permission to search structures.</p>}
          <p className="note small" style={{ margin: 0 }} data-industry="home-search-as">{searcher.isMain ? 'Searches as you: the structures EVE lets you see.' : `Searches as ${searcher.name}, through the cloud with ${searcher.name}’s own login.`} Whoever finds it reads it; change that on its row.</p>
        </div>
      )}
    </section>
  );
}

/** One hub's row: what prices it now (its own read, Goonmetrics', or nothing), its own market in words, its reader, its broker fee. */
function HubLine({ r, chars, graph, now, busy, act, listOk, isHome, fee, setFee, makeHome, onRemoved }: {
  r: HubRow; chars: IndustryChar[]; graph: Graph; now: number; busy: boolean; act: (job: () => Promise<unknown>, done?: string) => Promise<void>; listOk: boolean;
  isHome: boolean; fee: number | null; setFee: (n: number | null) => void; makeHome: () => void; onRemoved: () => void;
}) {
  const gm = useHomePrices(r.gm ? r.id : null);
  const book = useHomeBook(listOk ? r.id : null);
  const speaks = homeSpeaks(book.status === 'ok' ? book : null, r.gm && gm.status === 'ok' ? gm : null, now);
  const short = HOME_HUBS.find((h) => h.id === r.id)?.short ?? hubShort(r.name);
  const sys = graph[r.systemId];
  const where = sys ? `${sys[1]} ${secText(sys[0])}` : '';
  const prices = speaks?.source === 'structure' ? `Its own market, read ${ago(speaks.at, now)}`
    : speaks ? `Goonmetrics, read ${ago(speaks.at, now)}${now - Date.parse(speaks.at) > HOME_STALE_MS ? ': older than a day' : ''}`
      : !r.gm ? 'Nothing: Goonmetrics doesn’t track it, and its own market has no read under two hours old'
        : gm.status === 'loading' ? 'Reading Goonmetrics’ prices…'
          : gm.status === 'none' ? 'Not read yet: Goonmetrics every six hours'
            : gm.status === 'switched' ? 'Nothing: the cloud has Goonmetrics switched off'
              : gm.status === 'behind' ? 'The cloud is a version behind'
                : gm.status === 'off' ? 'The cloud isn’t on in this browser'
                  : gm.status === 'failed' ? `Couldn’t read Goonmetrics’ prices: ${gm.error}` : '–';
  const own = r.state ? ownMarketSaid(r.state, now, r.gm) : listOk ? '–' : 'Not known here: see above.';
  const reader = r.state ? (r.state.off ? 0 : r.state.reader) : chars[0].charId;
  const canRead = !!r.state && !r.state.off && r.state.login === 'ok';
  return (
    <tr data-hub={r.id}>
      <td className="l rd-main">
        <span className="nm">{r.name}</span>
        <span className="sub">{where}{r.gm ? ' · Goonmetrics tracks it' : ' · added by you'}</span>
        <span className="ind-acts">
          {isHome ? <span className="ind-default">Home hub</span> : <button type="button" className="link-btn" onClick={makeHome}>Make it the home hub</button>}
          {listOk && (
            <select className="ind-sel" aria-label={`Who reads ${short}’s market`} value={reader} disabled={busy}
              onChange={(e) => {
                const v = Number(e.target.value);
                void act(v === 0 ? () => cloudDropHomeMarket(r.id) : async () => { await cloudSetHomeMarket({ hub: r.id, reader: v }); await cloudReadHome(r.id); });
              }}>
              {r.gm && <option value={0}>Nobody: Goonmetrics only</option>}
              {chars.map((x) => <option key={x.charId} value={x.charId}>{x.isMain ? `${x.name} (you)` : x.name}</option>)}
            </select>
          )}
          {canRead && <button type="button" className="link-btn" disabled={busy} onClick={() => void act(() => cloudReadHome(r.id), `Read ${short}’s market now.`)}>Read it now</button>}
          {!r.gm && listOk && <button type="button" className="link-btn" disabled={busy} onClick={() => void act(async () => { await cloudDropHomeMarket(r.id); onRemoved(); })}>Remove</button>}
        </span>
        <span className="rd-phone"><span>Prices now: {prices}</span><span>{own}</span><span>Broker fee: {fee != null ? pct(fee) : '–'}</span></span>
      </td>
      <td className="l rd-wide" data-industry="hub-prices">{prices}</td>
      <td className="l rd-wide" data-industry="hub-own">{own}</td>
      <td className="rd-wide" data-industry="hub-fee">
        <NumChip label={`Broker fee at ${short}`} hideLabel percent width={56} value={fee != null ? +(fee * 100).toFixed(4) : null} placeholder="–"
          onChange={(n) => setFee(n == null ? null : n / 100)}
          tip={fee == null ? 'Not typed: the finder ranks before it and says what each 1% costs a day. Type it from the market window in game, or place an order there and the app measures it.' : 'Typed by you.'} />
      </td>
    </tr>
  );
}
```

In `src/styles.css`, after the `.ind-sites` rules (not in the phone block: these are base rules):

```css
/* Home markets (IndustryHome.tsx): its cells wrap, as Where you build's do. */
.ind-home td { white-space: normal; vertical-align: top; }
.ind-home td.rd-main { min-width: 220px; }
.ind-home td .sub { display: block; white-space: normal; }
```

- [ ] **Step 3: The fifth section**

In `src/components/hustles/Industry.tsx`: import `IndustryHome` from `'./IndustryHome'`; `SECTIONS` gains

```ts
  { key: 'home', label: 'Home markets', tip: 'Prices at your home hubs: Goonmetrics, or a character’s own read of the market' },
```

after `copies`; and the sections render `{section === 'home' && <IndustryHome key={shown.charId} c={shown} chars={chars} graph={graph} />}`.
The comment above `SECTION_KEY` loses "stage 4 adds Home markets".

- [ ] **Step 4: The page check**

In `scripts/pages.mjs`, inside the industry case above `// --- the end of the industry case` (after Task 18B's block, whose
`BELL`, `OWNER`, `hubSt`, `bookSt`, `marketsAnswer` and `booksAnswer` it reuses):

```js
    // --- Task 18C: the Home markets section, every hub in every state; picking a reader, stopping a default, adding Bellicose as
    // an alt and removing it go to the cloud's routes; the cloud's list a version behind is said, Goonmetrics' two still listed.
    {
      const SEC = '[data-industry="home"]';
      const posted = [];
      const listStub = CLOUD['/v1/home/markets'];
      CLOUD['/v1/home/markets'] = (url, req, json) => {
        if (req.method() === 'POST') { posted.push(['set', JSON.parse(req.postData() ?? '{}')]); return json({ ok: true }); }
        if (req.method() === 'DELETE') { posted.push(['drop', Number(url.searchParams.get('hub'))]); return json({ ok: true }); }
        return listStub(url, req, json);
      };
      CLOUD['/v1/home/read'] = (url, req, json) => { const hub = Number(url.searchParams.get('hub')); posted.push(['read', hub]); return json((marketsAnswer.hubs ?? []).find((x) => x.id === hub) ?? {}); };
      CLOUD['/v1/structures/search'] = (url, req, json) => json({ found: [{ id: BELL, name: 'UALX-3 - Mothership Bellicose', systemId: 30004807, system: 'UALX-3', security: -0.1868, typeId: 35834 }] });
      const section = async () => {
        await page.goto(SEED_PAGE);
        await seed({ ...ledger, industry: { ...DOC, hub: UALX_HUB }, cloud: CLOUD_STATE }, { alts: altStore });
        await page.goto(`${BASE}#hustles/industry/home`);
        await page.reload();
        await page.waitForSelector(`${SEC} [data-hub="${UALX_HUB}"]`, { timeout: 30_000 }).catch(() => problems.push('Home markets never drew its hubs'));
        await page.waitForTimeout(1500);
      };
      const rowText = (id) => text(`${SEC} [data-hub="${id}"]`);
      // UALX-3 refused by its access list for two hours (Goonmetrics stands in); C-J6MT read by Builder Alt, whose login lacks the permission.
      booksAnswer = {};
      marketsAnswer = { hubs: [
        hubSt(UALX_HUB, 'UALX-3 - 1st Byzantigoon', 'default', { book: bookSt(5, { at: null, refusedAt: iso(now - 2 * 3600_000), error: 'ESI 403: Market access denied', pages: null, types: 0 }) }),
        hubSt(1049588174021, 'C-J6MT - Ceci n’est pas une keeptar', 'default', { reader: 900091, readerName: 'Builder Alt', readerIsMain: false, login: 'permission' }),
      ] };
      await section();
      const ualx = await rowText(UALX_HUB), cj = await rowText(1049588174021);
      for (const s of ['Home hub', 'Goonmetrics, read 5 h ago', 'EVE refused your read of 1st Byzantigoon: it isn’t on its access list (first refused 2 h ago). Goonmetrics’ prices stand in.'])
        if (!ualx.includes(s)) problems.push(`UALX-3’s row doesn’t say “${s}”: “${ualx.slice(0, 400)}”`);
      for (const s of ['Goonmetrics, read 1 day ago: older than a day', 'Reading its own market needs EVE’s permission for structure markets: hand the cloud Builder Alt’s login again on Characters.'])
        if (!cj.includes(s)) problems.push(`C-J6MT’s row doesn’t say “${s}”: “${cj.slice(0, 400)}”`);
      if (!(await text('[data-industry="bellicose"]')).includes('Brave’s market at UALX-3, Mothership Bellicose: add it once one of your characters can see it.')) problems.push('the section doesn’t name Mothership Bellicose as the one to add');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}-industry-home-markets.png` });
      // C-J6MT read by you instead: set, then read at once; then Nobody: stopped.
      await page.locator('select[aria-label="Who reads C-J6MT’s market"]').selectOption({ label: 'Owner (you)' });
      await page.waitForTimeout(800);
      await page.locator('select[aria-label="Who reads C-J6MT’s market"]').selectOption({ label: 'Nobody: Goonmetrics only' });
      await page.waitForTimeout(800);
      const wanted = JSON.stringify([['set', { hub: 1049588174021, reader: OWNER }], ['read', 1049588174021], ['drop', 1049588174021]]);
      if (JSON.stringify(posted.splice(0)) !== wanted) problems.push(`picking C-J6MT’s reader and then nobody didn’t go to the cloud as asked: ${wanted}`);
      // Bellicose found as Builder Alt and added: set with its name, system and reader, then read.
      await page.locator(`${SEC} [aria-label="Search as"] button`, { hasText: 'Builder Alt' }).click();
      await page.locator('input[aria-label="Find a market structure by name"]').fill('Bellicose');
      await page.locator('[data-industry="home-add"] button', { hasText: 'Find' }).click();
      await page.waitForTimeout(800);
      marketsAnswer.hubs.push(hubSt(BELL, 'UALX-3 - Mothership Bellicose', 'added', { reader: 900091, readerName: 'Builder Alt', readerIsMain: false, book: bookSt(1, { reader: 900091, readerName: 'Builder Alt', types: 812, pages: 3 }) }));
      await page.locator('[data-industry="home-add"] button', { hasText: 'UALX-3 - Mothership Bellicose' }).click();
      await page.waitForTimeout(1200);
      const addWanted = JSON.stringify([['set', { hub: BELL, name: 'UALX-3 - Mothership Bellicose', systemId: 30004807, reader: 900091 }], ['read', BELL]]);
      if (JSON.stringify(posted.splice(0)) !== addWanted) problems.push(`adding Bellicose as Builder Alt didn’t go to the cloud as asked: ${addWanted}`);
      const bell = await rowText(BELL);
      if (!bell.includes('Its own market was read 1 min ago with Builder Alt’s login: 812 of the watched items listed there (3 pages).')) problems.push(`Bellicose’s row doesn’t say it was read by Builder Alt: “${bell.slice(0, 400)}”`);
      if (await page.locator('[data-industry="bellicose"]').count()) problems.push('Bellicose added, and the section still names it as one to add');
      // Its read cut short three hours after its last good one: said, and nothing prices it.
      marketsAnswer.hubs[2].book = bookSt(5, { at: iso(now - 3 * 3600_000), error: 'Cut short at page 31 of 80 by the cloud’s time limit', reader: 900091, readerName: 'Builder Alt' });
      booksAnswer[BELL] = { hub: BELL, at: iso(now - 3 * 3600_000), rows: {} };
      await section();
      const cut = await rowText(BELL);
      for (const s of ['Its own market’s last read, 5 min ago, failed (cut short at page 31 of 80 by the cloud’s time limit). The last good read was 3 h ago.', 'Nothing: Goonmetrics doesn’t track it'])
        if (!cut.includes(s)) problems.push(`Bellicose cut short doesn’t say “${s}”: “${cut.slice(0, 400)}”`);
      // Removed: the cloud asked, and it stops being the home hub if it was.
      await page.locator(`${SEC} [data-hub="${BELL}"] button`, { hasText: 'Remove' }).click();
      await page.waitForTimeout(800);
      if (JSON.stringify(posted.splice(0)) !== JSON.stringify([['drop', BELL]])) problems.push('removing Bellicose didn’t ask the cloud');
      // The cloud's list a version behind: said, Goonmetrics' two still listed with their prices.
      const kept = marketsAnswer;
      marketsAnswer = 404;
      await section();
      if (!(await text('[data-industry="home-list-said"]')).includes('The cloud is a version behind: reading a market with your characters comes once it’s updated. Goonmetrics’ prices stand in.')) problems.push('a cloud without the home markets route isn’t said as a version behind');
      if (!(await rowText(UALX_HUB)).includes('Goonmetrics, read 5 h ago')) problems.push('with the cloud a version behind, UALX-3 isn’t priced by Goonmetrics');
      marketsAnswer = kept;
    }
```

- [ ] **Step 5: Run everything; plant; notes; commit**

Run: `npm run check && npm run build && LEDGER=industry npm run check-pages && LEDGER=industry npm run check-phone`. Plant and see the
page check fail: drop the `r.state.off ? 0` (Nobody reads as you); make Remove skip `cloudDropHomeMarket`; make `listWhy` return null
for `behind`. Look at the section at 1,440 and 390 (`SHOTS=.playwright-mcp/industry4/18C LEDGER=industry npm run check-pages`): the
five sections' switch in one row at 1,440 and none alone at 390, the rows folded at 390.

Notes: `docs/notes/industry.md`, stage 4: **The Home markets section** (`IndustryHome.tsx`, `hustles/industry/home`): what each row
says and does; a hub's reader picked per row, Goonmetrics' two "Nobody: Goonmetrics only" to stop; adding as any character (the
main here, an alt through the cloud); Bellicose named until added; the cloud off, loading, a version behind and failing each said with
Goonmetrics' two still listed. `.claude/rules/industry.md` `paths:` gains `IndustryHome.tsx` in the components list.

Run the five checks, then:

```bash
git add src/components/hustles/IndustryHome.tsx src/components/hustles/Industry.tsx src/lib/cloud.ts src/styles.css scripts/pages.mjs .claude/rules/industry.md docs/notes/industry.md
git commit -m "Industry stage 4: the Home markets section, every hub in every state

The spec's fifth section: prices at home, from Goonmetrics until a character of yours can read the market itself. Goonmetrics'
two hubs are always listed, read with the main unless you pick another reader or Nobody; a hub you add is found by name as any
character (the main here, an alt through the cloud) and read by whoever found it. Each row says what prices it now (its own
read under two hours old, Goonmetrics' with its age, or nothing), its own market in its own words (no permission and where to
fix it, refused by the access list and what stands in, not read yet, read and by whom, failing with the last good read), and its
broker fee; and lets you read it now, make it the home hub, or remove it. Mothership Bellicose is named as the one to add until it
is. Which hubs the cloud reads and with whose login go to D1 through the cloud's routes; only the home hub and typed fees ride
the industry doc, which an older build's sanitizer keeps.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf"
```

---
### Task 18D: The hub's broker fee, measured from your orders there

**Files:**
- Modify: `src/lib/homeMarket.ts` (`hubFeeRate`, `HUB_FEE_ORDERS`, `type HubFee`), `src/components/hustles/industryChars.ts` (each
  character's orders and journal), `src/components/hustles/IndustryHome.tsx` (`HubFeeLine`, under each row's fee),
  `src/components/hustles/IndustryBuild.tsx` (the same line under the home hub's words), `scripts/check.mjs`, `scripts/pages.mjs`,
  `docs/notes/industry.md`, `docs/notes/limits.md`

**Interfaces:**
- Consumes: `Order`, `JournalEntry` (types.ts); `taxesDiffer` (industryTrack.ts: the measured facility tax's band, ±0.05%);
  `IndustryChar` (industryChars.ts).
- Produces: `hubFeeRate(hub: number, orders: readonly Order[], journal: Readonly<Record<string, JournalEntry>>): HubFee | null`,
  `type HubFee = { rate: number; orders: number; newest: string; low: number; high: number }`, `HUB_FEE_ORDERS` (5);
  `IndustryChar` gains `orders: Order[]` (every order, any station) and `journal: Record<string, JournalEntry>`; `HubFeeLine({ hub,
  chars, typed, onUse })` exported from `IndustryHome.tsx`.

**Why.** The spec: "The broker fee there is typed per hub, else measured from the reader's own orders there once it places some …
offered with Use this as the facility tax is." Correction 12: `matchFees` calls a fee a placement only at 75% of the Jita rate × the
order, so a hub fee under that (1.2% would be, at the main's 1.55%) reads as a price change, and `measuredRates` wants three
placements a day. So `hubFeeRate` matches by the second itself: a placement counts when its order's first version seen is the only
version of any of the character's orders in its second, its fee is every `brokers_fee` entry of that second, over the 100 ISK
minimum. The median of the newest five, so a reprice the app first saw as an order can't decide it. Measured from any character's
orders (the main's from its sync, an alt's from the cloud's hourly read of it): a structure's fee is its owner's, the same for all.
Offered with **Use this**, never applied by itself, and "about the same" within the facility tax's ±0.05% band.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check.mjs`, before the final `console.log(failed ? …)`:

```js
console.log('\n--- Industry stage 4: a hub\'s broker fee measured from your orders there (hubFeeRate, Task 18D) ---');
{
  const HM = await import('../src/lib/homeMarket.ts');
  const BELL = 1049999999999, JITA = 60003760;
  const ord = (id, loc, issued, price, total, seen) => ({ orderId: id, typeId: 34, isBuy: false, price, volumeTotal: total, volumeRemain: total, issued, state: 'open', locationId: loc, ...(seen ? { seen } : {}) });
  const fee = (id, date, amount) => [id, { id, date, refType: 'brokers_fee', amount }];
  const J = (...xs) => Object.fromEntries(xs);
  // 100 units at 10,000 ISK placed at Bellicose: a 1.2% fee is 12,000 ISK.
  eq('one order placed at the hub, alone in its second: its fee over its value', HM.hubFeeRate(BELL, [ord(1, BELL, '2026-10-09T10:00:00Z', 10_000, 100)], J(fee('a', '2026-10-09T10:00:00Z', -12_000))),
    { rate: 0.012, orders: 1, newest: '2026-10-09T10:00:00Z', low: 0.012, high: 0.012 });
  eq('  every broker fee entry of that second is its fee (an owner\'s part and any other alike)', HM.hubFeeRate(BELL, [ord(1, BELL, '2026-10-09T10:00:00Z', 10_000, 100)], J(fee('a', '2026-10-09T10:00:00.000Z', -7_000), fee('b', '2026-10-09T10:00:00Z', -5_000)))?.rate, 0.012);
  eq('  another order of yours in the same second, anywhere: can\'t be told apart, not counted', HM.hubFeeRate(BELL, [ord(1, BELL, '2026-10-09T10:00:00Z', 10_000, 100), ord(2, JITA, '2026-10-09T10:00:00Z', 50, 1000)], J(fee('a', '2026-10-09T10:00:00Z', -12_650))), null);
  eq('  the 100 ISK minimum says nothing of the rate', HM.hubFeeRate(BELL, [ord(1, BELL, '2026-10-09T10:00:00Z', 10, 10)], J(fee('a', '2026-10-09T10:00:00Z', -100))), null);
  eq('  an order elsewhere is no measure of this hub', HM.hubFeeRate(BELL, [ord(1, JITA, '2026-10-09T10:00:00Z', 10_000, 100)], J(fee('a', '2026-10-09T10:00:00Z', -1_300))), null);
  eq('  a fee far under 75% of Jita\'s rate still counts (matchFees would call it a price change)', HM.hubFeeRate(BELL, [ord(1, BELL, '2026-10-09T10:00:00Z', 10_000, 100)], J(fee('a', '2026-10-09T10:00:00Z', -5_000)))?.rate, 0.005);
  const six = [1, 2, 3, 4, 5, 6].map((i) => ord(i, BELL, `2026-10-0${i}T10:00:00Z`, 10_000, 100));
  const sixFees = J(...[1, 2, 3, 4, 5, 6].map((i) => fee(`f${i}`, `2026-10-0${i}T10:00:00Z`, i === 6 ? -3_000 : i === 1 ? -50_000 : -12_000)));
  eq('  the median of the newest five, with how many, the newest and their spread: one wrong match can\'t decide it', HM.hubFeeRate(BELL, six, sixFees),
    { rate: 0.012, orders: 5, newest: '2026-10-06T10:00:00Z', low: 0.003, high: 0.012 });
  eq('  an order whose price changed: its first version is the placement', HM.hubFeeRate(BELL, [ord(1, BELL, '2026-10-09T12:00:00Z', 9_000, 100, [{ issued: '2026-10-09T10:00:00Z', price: 10_000, remain: 100 }, { issued: '2026-10-09T12:00:00Z', price: 9_000, remain: 80 }])],
    J(fee('a', '2026-10-09T10:00:00Z', -12_000), fee('b', '2026-10-09T12:00:00Z', -600)))?.rate, 0.012);
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check`. Expected: FAIL, `HM.hubFeeRate is not a function`.

- [ ] **Step 3: The rule**

In `src/lib/homeMarket.ts`, import `type { JournalEntry, Order } from './types';` and add:

```ts
/** A hub's broker fee as your orders there paid it: the median of the newest placements measured, how many, the newest's time, the lowest and highest. */
export type HubFee = { rate: number; orders: number; newest: string; low: number; high: number };
/** The newest placements a hub's fee is measured over. */
export const HUB_FEE_ORDERS = 5;

/**
 * The broker fee a hub charged, from one character's orders placed there and its journal (Industry stage 4, correction 12). A fee
 * carries no order (eve-facts.md): it is matched by the second. A placement counts when its order's first version seen is the only
 * version of any of this character's orders in that second, its fee is every `brokers_fee` entry of the second (an owner's part and
 * any other alike), and that fee is over the 100 ISK minimum, which says nothing of the rate. Not `matchFees`: it tells a placement
 * from a price change at 75% of the Jita rate, so a hub fee under that would read as a change and never be measured. The median of
 * the newest HUB_FEE_ORDERS, so a price change the app first saw as the order can't decide it. Null when none counts.
 */
export function hubFeeRate(hub: number, orders: readonly Order[], journal: Readonly<Record<string, JournalEntry>>): HubFee | null {
  const second = (iso: string) => iso.slice(0, 19);
  const first = (o: Order) => o.seen?.[0] ?? { issued: o.issued, price: o.price, remain: o.volumeRemain };
  const busy = new Map<string, number>();
  for (const o of orders) for (const v of o.seen?.length ? o.seen : [first(o)]) busy.set(second(v.issued), (busy.get(second(v.issued)) ?? 0) + 1);
  const fees = new Map<string, number>();
  for (const e of Object.values(journal)) if (e.refType === 'brokers_fee' && e.amount < 0) fees.set(second(e.date), (fees.get(second(e.date)) ?? 0) - e.amount);
  const got: { rate: number; at: string }[] = [];
  for (const o of orders) {
    if (o.locationId !== hub) continue;
    const v = first(o), s = second(v.issued), fee = fees.get(s), value = v.price * o.volumeTotal;
    if (busy.get(s) !== 1 || fee == null || fee <= 100.5 || !(value > 0)) continue;
    got.push({ rate: fee / value, at: v.issued });
  }
  if (!got.length) return null;
  const recent = got.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, HUB_FEE_ORDERS);
  const rates = recent.map((x) => x.rate).sort((a, b) => a - b);
  const n = rates.length;
  return { rate: n % 2 ? rates[(n - 1) / 2] : (rates[n / 2 - 1] + rates[n / 2]) / 2, orders: n, newest: recent[0].at, low: rates[0], high: rates[n - 1] };
}
```

- [ ] **Step 4: Run the tests, see them pass; plant each rule wrong**

Run: `npm run check`. Expected: `all passed` twice. Plant and see each fail, putting it back after: drop `busy.get(s) !== 1` (the
same-second test reads 0.01265); take each order's last version (the price-change test reads 600 ÷ 900,000); the mean for the median
(the six reads 0.0102 with the wrong match in); drop `fee <= 100.5` (the minimum test reads 0.1).

- [ ] **Step 5: Each character's orders and journal, and the line**

In `src/components/hustles/industryChars.ts`: import `type { JournalEntry, Order, Tx } from '../../lib/types'` (for `type { Tx }`);
`IndustryChar` gains

```ts
  /** Every order it holds, any station, and its journal: a home hub's broker fee is measured from its own orders there (hubFeeRate). The main's from its sync, an alt's from the cloud's hourly read. */
  orders: Order[]; journal: Record<string, JournalEntry>;
```

the main gets `orders: Object.values(orders), journal`, each alt `orders: Object.values(ledger.orders), journal: ledger.journal`,
and `journal` joins the destructuring of `useData()` and the `useMemo`'s dependencies.

In `src/components/hustles/IndustryHome.tsx`: import `useMemo`, `fmtShort` (format.ts), `hubFeeRate, type HubFee` (homeMarket.ts) and
`taxesDiffer` (`'../../lib/industryTrack'`), and add:

```tsx
/**
 * What your orders at a hub paid as broker fee (hubFeeRate), the newest of any character's: offered with Use this, never applied by
 * itself (the measured facility tax's pattern); "about the same" within ±0.05% of the fee typed.
 */
export function HubFeeLine({ hub, chars, typed, onUse }: { hub: number; chars: IndustryChar[]; typed: number | null; onUse: (rate: number) => void }) {
  const m = useMemo(() => chars.map((x) => ({ c: x, f: hubFeeRate(hub, x.orders, x.journal) })).filter((x): x is { c: IndustryChar; f: HubFee } => !!x.f)
    .sort((a, b) => Date.parse(b.f.newest) - Date.parse(a.f.newest))[0] ?? null, [hub, chars]);
  if (!m) return null;
  const whose = m.c.isMain ? 'Your' : `${m.c.name}’s`;
  const what = m.f.orders === 1 ? `order there of ${fmtShort(m.f.newest)} paid` : `${m.f.orders} orders there (the newest of ${fmtShort(m.f.newest)}) paid`;
  const spread = taxesDiffer(m.f.low, m.f.high) ? ` (${pct(m.f.low)} to ${pct(m.f.high)})` : '';
  if (typed != null && !taxesDiffer(typed, m.f.rate)) return <span className="sub" data-industry="hub-fee-agrees">{whose} {what} about the same ({pct(m.f.rate)}).</span>;
  return (
    <span className="sub" data-industry="hub-fee-measured">
      {whose} {what} {pct(m.f.rate)}{spread}:{' '}
      <button type="button" className="link-btn" onClick={() => onUse(Math.round(m.f.rate * 1e6) / 1e6)}>Use this</button>
    </span>
  );
}
```

In `HubLine`, under the `NumChip` in the Broker fee cell, `<HubFeeLine hub={r.id} chars={chars} typed={fee} onUse={(n) => setFee(n)} />`,
and in the phone fold, after the broker fee's span, the same line again (`rd-phone` spans can hold it).

In `src/components/hustles/IndustryBuild.tsx`: import `HubFeeLine` from `'./IndustryHome'`; under the `home-said` paragraph:

```tsx
      {f.hub && <p className="note small" style={{ margin: 0 }} data-industry="build-hub-fee"><HubFeeLine hub={f.hub.id} chars={chars} typed={doc.hubFees[f.hub.id] ?? null}
        onUse={(n) => setDoc({ hubFees: { ...doc.hubFees, [f.hub!.id]: n } })} /></p>}
```

(an empty `<p>` when nothing is measured: render it only when `HubFeeLine` has something to say by moving the `<p>` inside
`HubFeeLine` for this caller, or accept the empty paragraph, which draws nothing; the page check doesn't look for it absent.)

- [ ] **Step 6: The page check**

In `scripts/pages.mjs`, inside the industry case above `// --- the end of the industry case` (after Task 18C's block):

```js
    // --- Task 18D: the main placed an order at Bellicose three days ago and paid 12,000 ISK on 1,000,000 ISK: 1.20% is offered with
    // Use this, which sets the hub's fee in the synced doc; then the row says it agrees. Build says the same under its home hub.
    {
      const placed = iso(now - 3 * 86400_000), day = new Date(now - 3 * 86400_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      marketsAnswer = { hubs: [hubSt(UALX_HUB, 'UALX-3 - 1st Byzantigoon', 'default'), hubSt(1049588174021, 'C-J6MT - Ceci n’est pas une keeptar', 'default'), hubSt(BELL, 'UALX-3 - Mothership Bellicose', 'added', { book: bookSt(30) })] };
      const withOrder = { ...ledger, orders: { 701: { orderId: 701, typeId: 34, isBuy: false, price: 10_000, volumeTotal: 100, volumeRemain: 100, issued: placed, state: 'open', locationId: BELL } },
        journal: { 'f-701': { id: 'f-701', date: placed, refType: 'brokers_fee', amount: -12_000 } } };
      const storedFees = () => page.evaluate(() => new Promise((res) => { const q = indexedDB.open('jita-ledger'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('industry'); g.onsuccess = () => res(g.result?.hubFees ?? {}); }; }));
      await page.goto(SEED_PAGE);
      await seed({ ...withOrder, industry: { ...DOC, hub: BELL }, cloud: CLOUD_STATE }, { alts: altStore });
      await page.goto(`${BASE}#hustles/industry/home`);
      await page.reload();
      await page.waitForSelector(`[data-hub="${BELL}"] [data-industry="hub-fee-measured"]`, { timeout: 30_000 }).catch(() => problems.push('Bellicose’s row never offered the fee its order paid'));
      const offer = await text(`[data-hub="${BELL}"] [data-industry="hub-fee-measured"]`);
      if (!offer.includes(`Your order there of ${day} paid 1.20%: Use this`)) problems.push(`the measured fee isn’t offered in its words: “${offer}”`);
      await page.locator(`[data-hub="${BELL}"] [data-industry="hub-fee-measured"] button`, { hasText: 'Use this' }).first().click();
      for (let i = 0; i < 100 && (await storedFees())[BELL] !== 0.012; i++) await page.waitForTimeout(100);
      if ((await storedFees())[BELL] !== 0.012) problems.push('Use this didn’t set Bellicose’s broker fee to 1.20% in the industry doc');
      if (!(await text(`[data-hub="${BELL}"]`)).includes(`Your order there of ${day} paid about the same (1.20%).`)) problems.push('after Use this, Bellicose’s row doesn’t say the order agrees');
      await page.goto(`${BASE}#hustles/industry/build`);
      await page.waitForSelector('[data-industry="build-hub-fee"]', { timeout: 20_000 }).catch(() => problems.push('Build doesn’t say what the home hub’s fee was measured at'));
      if (!(await text('[data-industry="build-hub-fee"]')).includes('paid about the same (1.20%)')) problems.push('Build’s home hub line doesn’t carry the measured fee');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}-industry-hub-fee.png` });
    }
```

- [ ] **Step 7: Run everything; notes; commit**

Run: `npm run check && npm run build && LEDGER=industry npm run check-pages`. Plant: make `HubFeeLine` apply the fee by itself (call
`onUse` on render): the page check's offer is never seen. Notes:
- `docs/notes/industry.md`, stage 4: **The hub's broker fee, measured** (`hubFeeRate`, `HubFeeLine`): correction 12 in the note's
  words; any character's orders; Use this; "After shipping: record the first real order placed at a home hub: how many journal entries
  its fee wrote, their ref types and amounts, and whether the measure matched the fee the market window showed."
- `docs/notes/limits.md`: **A hub's measured broker fee is matched by the second**: an order placed in the same second as another of
  the character's is left out, and the first version the app saw is taken as the placement (a price change before the app's first read
  would read as the fee; the median of five keeps one such from deciding it). It holds until the owner changes the fee, and is only
  offered.

Run the five checks, then:

```bash
git add src/lib/homeMarket.ts src/components/hustles/industryChars.ts src/components/hustles/IndustryHome.tsx src/components/hustles/IndustryBuild.tsx scripts/check.mjs scripts/pages.mjs docs/notes/industry.md docs/notes/limits.md
git commit -m "Industry stage 4: a home hub's broker fee is measured from your orders there, and offered with Use this

A structure's broker fee is its owner's and isn't in ESI, so the finder ranked before it until you typed it. Your own orders there
say what it is: hubFeeRate matches each placement's fee by the second, as the app matches every fee (they carry no order), counting
only a second in which one order version of the character's was placed, summing every broker fee entry of that second and leaving
out the 100 ISK minimum. Not matchFees' placements: it tells a placement from a price change at 75% of the Jita rate, so a hub fee
under about 1.2% would never be measured. The median of the newest five, from any character's orders (the main's sync, an alt's
hourly read), offered on Home markets and Build with Use this, never applied by itself, and said to agree within 0.05%.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf"
```

---
### Task 18E: Goonmetrics' round starts where the last stopped

**Files:**
- Modify: `worker/src/goonmetrics.ts` (where a hub's round starts; the types no round has reached; the route's `unread`),
  `src/lib/cloud.ts` (`cloudHomePrices`' answer type), `src/components/hustles/industryMarket.ts` (`HomeState`'s `unread`,
  `HomeSource.unread`), `src/components/hustles/industryFinder.ts` (`homeRead` per type), `src/components/hustles/IndustryBuild.tsx`
  (the count line's "no Jita book" rows at a hub), `scripts/check-worker.mjs`,
  `scripts/pages.mjs`, `docs/notes/industry.md`, `docs/notes/limits.md`

**Interfaces:**
- Consumes: `refreshHomePrices`, `homePrices` (goonmetrics.ts, stage 1); `useHomePrices`, `useHomeQuotes` (18B).
- Produces: `scan_meta` key `goonmetrics`: `{ next: Record<hub, number>; unread: Record<hub, number[]> }`; `GET /v1/home/prices`
  answers `unread?: number[]` (absent when none); `HomeState`'s `ok` gains `unread: ReadonlySet<number>`; `HomeSource` gains
  `unread: ReadonlySet<number>`.

**Why.** limits.md, left for this stage: "Rounds start from the first batch, so a hub cut at the same point each time (a rate limit
no read has met yet) never reaches its last batches", and "a type in a batch it never reached reads 'no price at UALX-3' rather than
'not read'". Now a hub's round starts at the batch after the last one tried (kept in `scan_meta`, no migration), so a host that always
cuts the round after the same number of calls covers every batch over a few rounds; and the types no round has reached since are
kept and served, so the finder says "not read at UALX-3 yet" for them. Nothing else of the round changes: the same calls, pauses,
User-Agent (`jita-ledger (hobby tool)`), six-hour cadence and `GOONMETRICS_ON`; the stage-1 tests (13 calls, 4 rounds a day against a
host that answers 10) still hold.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/check-worker.mjs`, before the final `console.log(failed ? …)`:

```js
console.log('\n--- Goonmetrics\' round starts where the last stopped, and says which types no round has reached (Task 18E) ---');
{
  const { refreshHomePrices, homePrices, REFRESH_MS } = await import('../worker/src/goonmetrics.ts');
  const NOW = Date.parse('2026-10-12T12:37:00Z'), CJ = 1049588174021;
  const xmlFor = (ids) => `<goonmetrics method="price_data" version="1.0"><price_data>${ids.map((id) => `<type id="${id}"><updated>2026-10-12T12:00:00Z</updated><all><weekly_movement>700</weekly_movement></all><buy><max>9.5</max><listed>100</listed></buy><sell><min>10</min><listed>200</listed></sell></type>`).join('')}</price_data></goonmetrics>`;
  const types = Array.from({ length: 400 }, (_, i) => 1000 + i);
  // A host that answers ten calls a round and then refuses every one (a rate limit no read has met yet).
  const round = async (db, now) => {
    const real = globalThis.fetch, asked = [];
    let n = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      asked.push([Number(url.searchParams.get('station_id')), Number(url.searchParams.get('type_id').split(',')[0])]);
      return ++n > 10 ? new Response('busy', { status: 429 }) : new Response(xmlFor(url.searchParams.get('type_id').split(',').map(Number)), { status: 200 });
    };
    try { return { r: await refreshHomePrices(db, now, types, async () => undefined, true), asked }; } finally { globalThis.fetch = real; }
  };
  const db = d1();
  const first = await round(db, NOW);
  eq('  the first round as before: UALX-3 whole, C-J6MT\'s first two batches, stopped', [first.asked.length, first.r.done, Object.keys((await homePrices(db, CJ)).prices).length], [13, { 'UALX-3': 'read', 'C-J6MT': 'partial' }, 100]);
  eq('    and the types no round has reached are said: C-J6MT\'s six batches not read', (await homePrices(db, CJ)).unread?.length, 300);
  const second = await round(db, NOW + REFRESH_MS);
  eq('  six hours on, C-J6MT starts at the batch after the last one tried (the 6th), not the first', second.asked.filter(([hub]) => hub === CJ)[0], [CJ, 1250]);
  for (let k = 2; k <= 4; k++) await round(db, NOW + k * REFRESH_MS);
  const cj = await homePrices(db, CJ);
  eq('  after five rounds every batch has been read once, and nothing is left unread', [Object.keys(cj.prices).length, cj.unread ?? []], [400, []]);
  // A hub read before this change: nothing kept of where it stopped, so it starts from the first batch and takes its row as read.
  const dbOld = d1();
  dbOld.run("INSERT INTO home_prices (hub, source, at, data, tried) VALUES (?, 'goonmetrics', ?, '{}', ?)", CJ, NOW - REFRESH_MS, NOW - REFRESH_MS);
  const old = await round(dbOld, NOW);
  eq('  a hub read before: from the first batch, its earlier types not said unread', [old.asked.filter(([hub]) => hub === CJ)[0], ((await homePrices(dbOld, CJ)).unread ?? []).length], [[CJ, 1000], 0]);
}
```

(In the first round UALX-3 takes calls 1 to 8 and C-J6MT batches 1 and 2 calls 9 and 10, then three refusals end the round, so
C-J6MT's next round starts at its sixth batch, types 1250 to 1299. Rounds 2 to 5 read batches 6–7, 3–4, 8–1 and 5–6: every batch.)

In `scripts/pages.mjs`, inside the industry case above `// --- the end of the industry case`:

```js
    // --- Task 18E: Goonmetrics' read of UALX-3 not yet reaching every type: those types are "not read at UALX-3 yet", never "no price".
    {
      const watch = JSON.parse(fs.readFileSync(new URL('../src/data/industryTypes.json', import.meta.url), 'utf8')).watch;
      marketsAnswer = { hubs: [] };
      booksAnswer = {};
      homeAnswer = (hub) => ({ hub, source: 'goonmetrics', at: iso(now - 2 * 3600_000), prices: { [PUMP]: [iso(now - 2 * 3600_000), 7 * 841, 7_000_000, 40, 7_500_000, 50] }, unread: watch.filter((t) => t !== PUMP) });
      await page.goto(SEED_PAGE);
      await seed({ ...ledger, industry: { ...DOC, site: 'home:30004807', hub: UALX_HUB, sell: 'home', hubFees: { [UALX_HUB]: 0.01 } }, cloud: CLOUD_STATE }, { alts: altStore, cache: { prospects: SCAN } });
      await finder();
      const said = await text('[data-industry="finder-count"]');
      // Every type but the pump unread: rows sold there say "not read at UALX-3 yet", rows with no Jita book "aren’t read at UALX-3 yet".
      if (!/read at UALX-3 yet/.test(said) || /no price at UALX-3/.test(said)) problems.push(`types Goonmetrics' rounds haven't reached aren't said as not read yet: “${said.slice(0, 400)}”`);
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run check`. Expected: FAIL, `the types no round has reached are said` (`undefined`), and the second round starts at
`[CJ, 1000]`.

- [ ] **Step 3: Where a round starts, and what it hasn't reached**

In `worker/src/goonmetrics.ts`, add above `refreshHomePrices`:

```ts
/**
 * Where each hub's next round starts, and the types no round has reached since (scan_meta 'goonmetrics'; Industry stage 4, correction
 * 16). A round that starts from the first batch every time and is always cut at the same call (a rate limit) never reaches its last
 * batches; starting after the last batch tried covers them over a few rounds. A hub read before this was kept takes its row as read.
 */
type RoundState = { next: Record<string, number>; unread: Record<string, number[]> };
async function roundState(db: D1Database): Promise<RoundState> {
  try {
    const r = await db.prepare(`SELECT data FROM scan_meta WHERE key = 'goonmetrics'`).first<{ data: string }>();
    const s = r ? (JSON.parse(r.data) as Partial<RoundState>) : {};
    return { next: s.next ?? {}, unread: s.unread ?? {} };
  } catch { return { next: {}, unread: {} }; }
}
```

and in `refreshHomePrices`:
- after reading `rows`, `const state = await roundState(db); const wanted = new Set(types);`, and `save` uses this `wanted` in place of
  its own `const wanted = new Set(types)`;
- a helper beside `save`:

```ts
  // Where the hub's next round starts (after the last batch tried, or where this one started when it tried them all), and which of
  // its types no round has reached since: the old list (all of them for a hub never read, none for one read before this was kept),
  // less every batch that came back.
  const settle = (hub: number, old: unknown, start: number, tried: number, n: number, came: number[], batches: number[][]) => {
    state.next[hub] = tried >= n ? start : (start + tried) % n;
    const back = new Set(came.flatMap((k) => batches[k]));
    state.unread[hub] = (state.unread[hub] ?? (old ? [] : types)).filter((t) => wanted.has(t) && !back.has(t));
  };
  // Kept, or said in the log: a write that throws (even in `prepare`, as the stage-1 test's broken D1 does) never stops the round.
  const keepState = async () => {
    try { await db.prepare('INSERT INTO scan_meta (key, data) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET data = excluded.data').bind('goonmetrics', JSON.stringify(state)).run(); }
    catch (e) { console.error('goonmetrics: could not keep where the round stopped', e); }
  };
```

- inside the hub loop, the batch loop `for (let i = 0; i < types.length; i += PER_CALL) { … }` is replaced with this (the hub's `got`,
  `ok` and `cut`, declared just above it, stay as they are), and the hub's closing `await save(…)` gains the `settle` after it:

```ts
    const batches: number[][] = [];
    for (let i = 0; i < types.length; i += PER_CALL) batches.push(types.slice(i, i + PER_CALL));
    const n = batches.length, start = (state.next[hub.id] ?? 0) % Math.max(1, n);
    const came: number[] = [];
    let tried = 0;
    for (let j = 0; j < n; j++) {
      const k = (start + j) % n, ask = batches[k];
      if (Date.now() > deadline) { cut = true; break; }
      if (calls++) await pause(PAUSE_MS);
      tried++;
      try {
        const res = await fetch(`${API}?station_id=${hub.id}&type_id=${ask.join(',')}`, { headers: HEADERS, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
        if (!res.ok) { await res.body?.cancel(); throw new Error(`Goonmetrics answered ${res.status} for ${hub.short}`); }
        const body = await res.text();
        const parsed = body.includes('<price_data') ? parseGoonmetrics(body) : {};
        if (!ask.some((t) => parsed[t])) throw new Error(`Goonmetrics answered something other than prices for ${hub.short}`);
        Object.assign(got, parsed);
        came.push(k);
        inARow = 0;
      } catch (e) {
        ok = false;
        error ??= e instanceof Error ? e.message : String(e);
        if (++inARow >= 3) {
          if (Object.keys(got).length) await save(hub, old, got, 'partial'); else done[hub.short] = 'failed';
          settle(hub.id, old, start, tried, n, came, batches);
          await keepState();
          return { done, error, stopped: true };
        }
      }
    }
    await save(hub, old, got, ok && !cut ? 'read' : 'partial');
    settle(hub.id, old, start, tried, n, came, batches);
```

- after the hub loop, before `return { done, error, stopped: false }`: `await keepState();`.

`homePrices` reads the state too and answers the hub's unread types when there are any:

```ts
  const r = await db.prepare('SELECT hub, source, at, data FROM home_prices WHERE hub = ?1').bind(hub).first<{ hub: number; source: string; at: number; data: string }>();
  if (!r || r.at <= 0) return null;
  const unread = (await roundState(db)).unread[hub] ?? [];
  return { hub: r.hub, source: r.source, at: new Date(r.at).toISOString(), prices: JSON.parse(r.data), ...(unread.length ? { unread } : {}) };
```

(its return type gains `unread?: number[]`).

- [ ] **Step 4: The browser says which types aren't read yet**

- `src/lib/cloud.ts`: `cloudHomePrices`' answer type gains `unread?: number[]` beside `prices`.
- `src/components/hustles/industryMarket.ts`: `HomeState`'s `ok` member gains `unread: ReadonlySet<number>`; `useHomePrices` sets it
  (`{ status: 'ok', at: r.at, prices: r.prices, unread: new Set(r.unread ?? []) }`); `HomeSource` gains `unread: ReadonlySet<number>`,
  and `useHomeQuotes` returns `unread: speaks?.source === 'goonmetrics' && gm.status === 'ok' ? gm.unread : NO_TYPES` (with `const
  NO_TYPES: ReadonlySet<number> = new Set();` at module level).
- `src/components/hustles/industryFinder.ts`: in `input`'s `market`, `homeRead: home.read && !home.unread.has(t)`.
- `src/components/hustles/IndustryBuild.tsx`, the count line's reasons: a row with no Jita book at a hub whose prices don't have its type
  read (not read at all, or a type no round has reached) says so, not "no price there", which stays for a type read and absent:

```ts
      // No Jita book and nothing read for it at the hub (the hub's prices not in, or a type no Goonmetrics round has reached yet): said as
      // not read, never "no price there", which is for a type read and absent.
      const homeUnread = r.missing === 'noBook' && !!f.hub && doc.sell !== 'jita' && !(f.home.read && !f.home.unread.has(r.product));
      const key = own ? `noSale:${own}` : invWhy ? `noInvention:${invWhy}` : homeUnread ? 'noBook:unread' : r.missing;
      const e = n.get(key) ?? { n: 0, said: own ? () => `can’t be sold: ${own}` : invWhy ? () => `Tech II can’t be costed: ${invWhy}`
        : r.missing === 'noBook' && f.hub && doc.sell !== 'jita' ? (one) => `${one ? 'has' : 'have'} no Jita book this morning and ${homeUnread ? `${one ? 'isn’t' : 'aren’t'} read at ${f.hub!.short} yet` : `no price at ${f.hub!.short}`}` : MISSING_SAID[r.missing] };
```

  (the `why` memo's dependencies gain `f.home`). The stage-1 page check ("after UALX-3's read, a type with no price there isn't said as
  not read yet") still holds: its read has no unread types.

- [ ] **Step 5: Run everything; plant; notes; commit**

Run: `npm run check && npm run build && LEDGER=industry npm run check-pages`. Plant and see each fail: start every round at 0 (the
second round asks `[CJ, 1000]`, and five rounds leave 50 types out); drop `settle`'s `back` (nothing ever leaves the unread list);
`homeRead: home.read` (the page check says "no price at UALX-3"). Notes:
- `docs/notes/industry.md`, stage 4: **Goonmetrics' round starts where the last stopped** (correction 16, `scan_meta` 'goonmetrics');
  the evidence (a host answering ten calls a round covers C-J6MT's eight batches in five rounds); the finder says "not read at X yet"
  for types no round has reached.
- `docs/notes/limits.md`: the bullet **A Goonmetrics read cut short reads the types it never reached as having no price there**
  becomes: "**A Goonmetrics round cut short starts the next where it stopped** (Industry stage 4), and the types no round has reached
  since say 'not read at UALX-3 yet'; a type read once keeps that read until a round reaches its batch again, however old (each type
  carries Goonmetrics' own `updated`, which the detail says when it's over a day before the read)."

Run the five checks, then:

```bash
git add worker/src/goonmetrics.ts src/lib/cloud.ts src/components/hustles/industryMarket.ts src/components/hustles/industryFinder.ts src/components/hustles/IndustryBuild.tsx scripts/check-worker.mjs scripts/pages.mjs docs/notes/industry.md docs/notes/limits.md
git commit -m "Industry stage 4: Goonmetrics' round starts where the last stopped, and says which types it hasn't reached

Stage 1 left this for stage 4 (limits.md): every round started from the first batch, so a hub cut at the same call each time (a
rate limit no read has met yet) would never reach its last batches, and a type in a batch it never reached read as having no price
there. A hub's round now starts after the last batch tried, kept in scan_meta (no migration), and the types no round has reached
since are kept and served with the hub's prices, so the finder says 'not read at UALX-3 yet' for them. Against a host that answers
ten calls a round, C-J6MT's eight batches are all read in five rounds; the stage-1 round's calls, pauses, User-Agent and six-hour
cadence are unchanged, and its tests pass as they were.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf"
```

---

## After the last task

- `npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income`, all green, and a look at
  the Home markets section, Build at a hub you added and To do's built item at 1,440 and 390.
- The controller's whole-branch review, then the merge and `npm run deployed` as CLAUDE.md says. The deploy of the Worker applies
  migration 0021; the first `37` round after it reads Goonmetrics' two with the main's cloud login, which **lacks the permission
  until the user logs in again and hands it over** (Task 16): until then the section says so for both hubs ("Reading its own market
  needs EVE's permission for structure markets: log in again here, then hand the cloud your login"), and Goonmetrics' prices stand
  in. Once handed over, both are refused hourly (the user isn't in the Imperium) until a character is accepted.
- Tell the user, in the hand-off, in this order: log in again on the PC (Settings → Account); hand the cloud the main's login
  (Settings → Your data) soon after, since the watchdog mails "Cloud lost your login" once EVE's refusal of the old one has lasted
  ten minutes (the cloud notices when its cached access token runs out, up to twenty minutes after the relog), and To do lists it
  until then; log in again on the phone; hand over each alt on Characters when it should read a market or search structures. The
  sender's login needs nothing.
- After shipping, in `docs/notes/industry.md`: the first real refusal's status and `error`, the first real structure read's page
  count, types kept and row size, how long a page takes, and the first home-hub order's broker fee entries (Task 18D's note).
