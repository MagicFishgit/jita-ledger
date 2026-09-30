# Jita Ledger

A station-trading tool for EVE Online's Jita 4-4. React + TypeScript + Vite, state in IndexedDB with a cloud copy
in a Cloudflare Worker's D1 database (`worker/`), talking straight to ESI and EVE SSO. The site deploys to GitHub
Pages on every push to `main`; the Worker deploys from GitHub Actions too, when `worker/` or `src/lib/` changes.

Pages: Wallet (home), To do (was Tonight's run; `#tonight` still lands there), Calculator, Prospects (find items), Watchlist, Capital planner, Hub
arbitrage, Sniper (mistake listings), Positions, Orders (which of mine are beaten), Results, Loyalty (spending LP), Side hustles
(Abyssal / Hauling / Planets / Mining / Freelance), Combat, Characters (the alts the cloud reads), Omega, Settings (tabbed: `settings/<tab>`). Inbox is gone:
its job is the Wallet's "Trades no position tracks" table, and `#inbox` redirects to the Wallet.
Planets is a four-step walkthrough and also reads your real colonies when the planets scope is granted.

The look is the HUD redesign in `docs/Jita Ledger space console redesign/` (untracked, not committed):
`Jita Ledger HUD.dc.html` is the source of truth for layout and copy, but **every number in it was invented
by the design tool** — never copy a figure from it. Shared pieces live in `components/ui.tsx` (panels, tiles,
Seg, Check, NumChip, Guide…), `components/charts.tsx` (inline SVG charts) and `components/shell/`.

## Working here

```
npm run check    # pure-logic tests, then the Worker's own code on an in-memory D1 stand-in; fast, no network
npm run check-pages   # every page with an empty, a small and a large ledger, headless (LEDGER=, PAGE= to narrow)
npm run check-phone   # the same at 390 px, failing anything past the screen's edge (SHOTS=dir saves screenshots)
npm run build    # tsc --noEmit && vite build
npm run dev      # http://localhost:5173/jita-ledger/
npm run scan-live   # end-to-end funnel against real ESI (needs the resolver hook, so not bare node)
```

**Verify before claiming.** `npm run check` and `npm run build` for every change, `npm run check-pages` for any
change to a page (the deploy runs it too, and a failing page stops the deploy), plus a browser check for anything
with UI. Several bugs in this repo shipped past a green typecheck and were only
caught by looking — a frozen countdown, `’` rendered literally, a table overflowing its container.

**Work on a branch**, then `--ff-only` merge to `main`, delete the branch both sides, watch the
Actions run, and confirm the change is in the deployed bundle (`curl` the JS and grep for a string
you added; the app's entry file is `assets/main-*.js`, pages are separate files, and `version.json` names the live
build). Minification renames identifiers, so grep for *copy*, not variable names.

**`npm run deployed` after every push, and don't start the next change until it says "Shipped."** It waits for the
Actions runs of HEAD (or a commit given: `npm run deployed -- abc1234`), prints the failing log of any that failed,
passes a cancelled run only when a newer run of the same workflow succeeded with it (the Pages workflow cancels an
older run when a newer push arrives, and builds `main`, so that's normal), and checks the live `version.json` names
the commit or a newer one that includes it. The user asked for this on 28 September 2026 after seeing a cancelled run,
so nothing is assumed shipped.

Commit messages explain the reasoning, not just the change: what was wrong, why that was wrong, what
the evidence was. Long is fine.

### Testing pure logic

`scripts/check.mjs` runs modules directly through Node's type stripping.
`scripts/resolve-ts.mjs` resolves the app's extensionless imports (`./tick`), which Node otherwise
can't load. Modules importing `./config` still can't be tested this way — it reads `import.meta.env`.
Plain constants (Jita's IDs, skill names, Alpha caps, Caldari Navy, PLEX) live in `constants.ts`, which
`config.ts` re-exports; a pure module imports them from `./constants` so it stays testable.

That split is deliberate and worth keeping: **pure rules in `prospects.ts` / `relist.ts` / `tick.ts` /
`schedule.ts` (and the redesign's `split` / `planner` / `arbitrage` / `wallet` / `combat` / `results` /
`todo` / `training` / `signals` / `alerts`), I/O in `scan.ts` / `market.ts` / `sync.ts` (and
`orderCheck` / `watch` / `colonyStore` / `killmails` / `attribution` / `alertsRunner`).**

### Browser checks

Playwright. Seed IndexedDB directly (`jita-ledger` db, `kv` store, keys match `Data` in `store.ts`)
to set up cases. **Without a login the app shows only its landing page** (it's the owner's alone, see app-conventions),
so also put a stand-in login for the owner in `localStorage['jita-ledger:auth']`: `{ accessToken, refreshToken,
expiresAt, characterId: 95210486, characterName, scopes: [] }` (`scripts/pages.mjs` does). Running the app against a
local Worker with `VITE_CLOUD_DEV_TOKEN` counts as the owner. Note `browser_navigate` to a URL differing only by `#hash` does **not** reload — call
`location.reload()` when you need `initStore()` to re-run.

Orders is behind an auth gate. Testing it means temporarily editing `{!auth ? (` to `{false && !auth ? (`.
**Always revert and grep to confirm** before committing — this was clobbered once by restoring a stale
backup, losing unrelated work.

The page scrolls inside `.content`, not the document, so a `fullPage` screenshot shows only the viewport:
set `document.querySelector('.content').scrollTop` and shoot again, or resize the viewport tall. Page changes
animate, so wait a second before a screenshot or it catches the warp mid-flight. For a data-heavy check, build
a synthetic ledger (journal *with balances assigned in date order*, txs, orders, stock, killmails), serve it
from `.playwright-mcp/` (Vite serves it; the folder is gitignored), `put` it into the `kv` store and reload —
and back up the real store first and restore it after (`clear()` then `put`, or seeded-only keys linger).

### The cloud (`worker/`)

The app stays a static site on GitHub Pages; a Cloudflare Worker (`jita-ledger-cloud`, account
`rudivisagiex@gmail.com`, `https://jita-ledger-cloud.jitaledger.workers.dev`) holds the ledger in a D1 database
(`jita-ledger`, id `39bbd652-…`), so no browser holds the only copy.

```
npm run worker:deploy            # wrangler deploy by hand (Wrangler is logged in on this machine via OAuth)
npx wrangler d1 migrations apply jita-ledger --remote   # schema changes: add worker/migrations/000N_*.sql
npx wrangler tail jita-ledger-cloud                      # live logs
```

`npm run build` type-checks the Worker too (`tsc -p worker`). **The Worker deploys itself**
(`.github/workflows/deploy-worker.yml`) on a push to `main` that touches `worker/`, `src/lib/`, the package files or
the workflow: the logic tests, the Worker's types, a wait while a full-market scan is running (a deploy cuts a run
off), every pending migration, then `wrangler deploy`. It uses the `CLOUDFLARE_API_TOKEN` repository secret (Workers
Scripts: Edit and D1: Edit, made by the user on 28 September 2026) and the `account_id` in `wrangler.toml`. The site
and the Worker deploy separately and in either order, so **a migration only adds** (old code must run on the new
schema) **and the site must tolerate the Worker it's talking to being a version behind** (a field it doesn't have yet
is null, never an error). `npm run worker:deploy` still works by hand from this machine.

**The Worker runs the app's own rules**, imported straight from `src/lib`: `esiRecords`, `flow`, `split`, `relist`,
`fills`, `fees`, `prefs`, `prospects`, `evaluate`, `alerts`, `colony`, `tick`, `format`, `constants`, `types`, `snipe`,
`track`, `share`, `watchdog`, `roster`, `alphaCaps`, `mining`, `abyssTracker` (with `abyssal` for a type). These must stay
free of `./config`, `./store`, React and the DOM, even for a type import: `tsc -p worker` pulls in whatever they
import. That is why `OrderLite` lives in `flow.ts`, `SkillKey` comes from `constants`, and `soldFrom`, `sidePaceOf`,
`judgeOrder`, `orderFindings` and `piFindings` were moved out of the I/O modules.

**Timers** (`[triggers]` in `wrangler.toml`): every five minutes `fiveMinutes` in `index.ts` refreshes each
ledger's open orders when ESI's 20-minute copy has turned over, reads every watched book (`watchMarkets`), then
runs each ledger's alert round, then each alt's mining, in that order in one chain; hourly at :07 the archive, then
once a day after 12:00 UTC the daily checks (`checks.ts`: the Sniper's listings settled, each ledger's share measured); hourly at :37 every alt's full read (`altsHourly`). **A newly added cron took
26 minutes to fire** (registered 16:04:29, first run 16:30 on 27 September 2026; Cloudflare says up to 15) while
the existing hourly one kept running. A cron more frequent than hourly gets 30 s of CPU whatever `cpu_ms`
says (that applies to requests and the hourly one); the round uses about 0.2 s for ~130 items. The plan includes
50 M D1 row writes a month; ~130 watched items write about 3 M, 400 about 10 M. Don't debug a new trigger before half an hour has passed;
`workersInvocationsScheduled` in Cloudflare's GraphQL analytics lists every scheduled run.

**Testing end to end without an EVE login:** `npm run worker:dev` runs the Worker locally on :8787 with a local
D1 (`npx wrangler d1 migrations apply jita-ledger --local` first) and `DEV_AUTH_CHAR`, which makes the token
`dev-token` stand for character 90000001 — honoured only for requests addressed to localhost, never set in
`wrangler.toml`. Run the app with `VITE_CLOUD_URL=http://localhost:8787 VITE_CLOUD_DEV_TOKEN=dev-token npm run dev`
and the Playwright browser syncs with it. Seeding a big ledger through `update(..., { origin: 'cloud' })` keeps
it from being pushed.
To test against the real ledger, export it (`npx wrangler d1 export jita-ledger --remote --table records
--no-schema --output …`, same for `docs`), run it into the local D1 with `--file`, and start `wrangler dev` with
`--var DEV_AUTH_CHAR:<the character's ID> --test-scheduled`: `curl "localhost:8787/__scheduled?cron=*/5+*+*+*+*"`
runs a five-minute round, and `GET /v1/alerts/preview` shows every order's verdict and what would be mailed,
sending nothing. The local D1 holds no EVE logins, so mail itself can only be tested in production (Settings →
Your data → Send a test mail).

## Notes by topic

Everything learned the hard way lives in `docs/notes/`, one file per topic. Read the one for the area you are changing
before you change it, and add to it when you learn something: what was wrong, the evidence, and what to do instead.

**Only five of them are in context when a session starts.** Instruction files loaded at the start share a budget of
150,000 characters; on 30 September 2026 this file and all eleven notes, every one imported here, came to 206,800 and
Claude Code warned. The notes only grow, so nothing was cut from them. What changed is when each is loaded.

Loaded when you read a file it covers (`.claude/rules/<topic>.md`: a `paths:` list and an import of the note). A
session that hasn't read such a file doesn't have the note, so **Read it yourself before designing, researching or
answering in its area**:

- `eve-facts.md` (anything under `src/`, `worker/` or `scripts/`): EVE and ESI facts that cost real research. Don't
  re-derive or contradict these without new evidence.
- `market-reading.md`: how books, prices and paces are judged (reach, the buyer/seller split, Clears in, relist advice).
- `finding-trades.md`: Prospects, the Capital planner, the full-market scan, the Sniper, Place and leave.
- `orders-alerts.md`: To do, browser notifications, in-game mail.
- `positions-results.md`: positions, fees, Results, the Wallet, goals, standings.
- `loyalty-hustles.md`: Loyalty, Abyssal, Hauling, Planets, Mining, Freelance, Reprocessing, skills, Combat.
- `characters.md`: alts, and how they are kept apart from the main (whose login, whose data; the roster).

Always loaded, imported below, because they apply to any change:

- `cloud.md`: the cloud copy of the ledger and what the cloud does with its logins.
- `app-conventions.md`: wording, layout, tooltips, numbers and charts.
- `gotchas.md`: traps in the code and tools that have cost time.
- `known-bugs.md`: verified bugs not yet fixed.
- `limits.md`: honest limits of the model, to state rather than let be discovered.

Keeping it that way: a new source file goes in its topic's `paths:`; a new note gets a rule of its own rather than an
import here; and a rule's frontmatter has to stay valid YAML, since one that doesn't parse is loaded at the start like
an import. `/context` lists what a session has loaded.

@docs/notes/cloud.md
@docs/notes/app-conventions.md
@docs/notes/gotchas.md
@docs/notes/known-bugs.md
@docs/notes/limits.md
