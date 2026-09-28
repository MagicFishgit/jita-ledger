# Jita Ledger

A station-trading tool for EVE Online's Jita 4-4. React + TypeScript + Vite, state in IndexedDB with a cloud copy
in a Cloudflare Worker's D1 database (`worker/`), talking straight to ESI and EVE SSO. The site deploys to GitHub
Pages on every push to `main`; the Worker deploys by hand (`npm run worker:deploy`).

Pages: Wallet (home), To do (was Tonight's run; `#tonight` still lands there), Calculator, Prospects (find items), Watchlist, Capital planner, Hub
arbitrage, Sniper (mistake listings), Positions, Orders (which of mine are beaten), Results, Loyalty (spending LP), Side hustles
(Abyssal / Hauling / Planets / Injectors), Combat, Omega, Settings (tabbed: `settings/<tab>`). Inbox is gone:
its job is the Wallet's "Trades no position tracks" table, and `#inbox` redirects to the Wallet.
Planets is a four-step walkthrough and also reads your real colonies when the planets scope is granted.

The look is the HUD redesign in `docs/Jita Ledger space console redesign/` (untracked, not committed):
`Jita Ledger HUD.dc.html` is the source of truth for layout and copy, but **every number in it was invented
by the design tool** — never copy a figure from it. Shared pieces live in `components/ui.tsx` (panels, tiles,
Seg, Check, NumChip, Guide…), `components/charts.tsx` (inline SVG charts) and `components/shell/`.

## Working here

```
npm run check    # pure-logic tests, fast, no network
npm run check-pages   # every page with an empty, a small and a large ledger, headless (LEDGER=, PAGE= to narrow)
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
you added). Minification renames identifiers, so grep for *copy*, not variable names.

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
to set up cases. Note `browser_navigate` to a URL differing only by `#hash` does **not** reload — call
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
npm run worker:deploy            # wrangler deploy (Wrangler is logged in on this machine via OAuth)
npx wrangler d1 migrations apply jita-ledger --remote   # schema changes: add worker/migrations/000N_*.sql
npx wrangler tail jita-ledger-cloud                      # live logs
```

`npm run build` type-checks the Worker too (`tsc -p worker`). Deploys of the Worker are by hand for now; the
Pages workflow doesn't touch it. Apply a migration before deploying code that needs it.

**The Worker runs the app's own rules**, imported straight from `src/lib`: `esiRecords`, `flow`, `split`, `relist`,
`fills`, `fees`, `prefs`, `prospects`, `evaluate`, `alerts`, `colony`, `tick`, `format`, `constants`, `types`, `snipe`,
`track`, `share`, `watchdog`. These must stay
free of `./config`, `./store`, React and the DOM, even for a type import: `tsc -p worker` pulls in whatever they
import. That is why `OrderLite` lives in `flow.ts`, `SkillKey` comes from `constants`, and `soldFrom`, `sidePaceOf`,
`judgeOrder`, `orderFindings` and `piFindings` were moved out of the I/O modules.

**Timers** (`[triggers]` in `wrangler.toml`): every five minutes `fiveMinutes` in `index.ts` refreshes each
ledger's open orders when ESI's 20-minute copy has turned over, reads every watched book (`watchMarkets`), then
runs each ledger's alert round, in that order in one chain; hourly at :07 the archive, then once a day after 12:00
UTC the daily checks (`checks.ts`: the Sniper's listings settled, each ledger's share measured). **A newly added cron took
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

Everything learned the hard way lives in `docs/notes/`, one file per topic, each imported below so it is read with
this file. Read the one for the area you are changing before you change it, and add to it when you learn something:
what was wrong, the evidence, and what to do instead.

- `eve-facts.md`: EVE and ESI facts that cost real research. Don't re-derive or contradict these without new evidence.
- `market-reading.md`: how books, prices and paces are judged (reach, the buyer/seller split, Clears in, relist advice).
- `finding-trades.md`: Prospects, the Capital planner, the full-market scan, the Sniper, Place and leave.
- `orders-alerts.md`: To do, browser notifications, in-game mail.
- `positions-results.md`: positions, fees, Results, the Wallet, goals, standings.
- `cloud.md`: the cloud copy of the ledger and what the cloud does with its logins.
- `loyalty-hustles.md`: Loyalty, Abyssal, Hauling, Planets, skills, Combat.
- `app-conventions.md`: wording, layout, tooltips, numbers and charts.
- `gotchas.md`: traps in the code and tools that have cost time.
- `known-bugs.md`: verified bugs not yet fixed.
- `limits.md`: honest limits of the model, to state rather than let be discovered.

@docs/notes/eve-facts.md
@docs/notes/market-reading.md
@docs/notes/finding-trades.md
@docs/notes/orders-alerts.md
@docs/notes/positions-results.md
@docs/notes/cloud.md
@docs/notes/loyalty-hustles.md
@docs/notes/app-conventions.md
@docs/notes/gotchas.md
@docs/notes/known-bugs.md
@docs/notes/limits.md
