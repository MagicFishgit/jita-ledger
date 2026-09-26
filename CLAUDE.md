# Jita Ledger

A station-trading tool for EVE Online's Jita 4-4. No server: React + TypeScript + Vite, all state in
IndexedDB, talking straight to ESI and EVE SSO. Deployed to GitHub Pages on every push to `main`.

Pages: Calculator, Prospects (find items), Watchlist, Positions, Orders (which of mine are beaten),
Inbox, Loyalty (spending LP), Side hustles (Abyssal / Hauling / Planets / Injectors), Omega, Settings.

## Working here

```
npm run check    # pure-logic tests, fast, no network
npm run build    # tsc --noEmit && vite build
npm run dev      # http://localhost:5173/jita-ledger/
node scripts/scan-live.mjs   # end-to-end funnel against real ESI
```

**Verify before claiming.** `npm run check` and `npm run build` for every change, plus a browser
check for anything with UI. Several bugs in this repo shipped past a green typecheck and were only
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

That split is deliberate and worth keeping: **pure rules in `prospects.ts` / `relist.ts` / `tick.ts` /
`schedule.ts`, I/O in `scan.ts` / `market.ts` / `sync.ts`.**

### Browser checks

Playwright. Seed IndexedDB directly (`jita-ledger` db, `kv` store, keys match `Data` in `store.ts`)
to set up cases. Note `browser_navigate` to a URL differing only by `#hash` does **not** reload — call
`location.reload()` when you need `initStore()` to re-run.

Orders is behind an auth gate. Testing it means temporarily editing `{!auth ? (` to `{false && !auth ? (`.
**Always revert and grep to confirm** before committing — this was clobbered once by restoring a stale
backup, losing unrelated work.

## EVE facts that cost real research

Don't re-derive or contradict these without new evidence.

- **Order prices carry at most 4 significant figures**, floored at 0.01 ISK (CCP's Broker Relations
  change, March 2020). The smallest change is `max(0.01, 10^(floor(log10 p) - 3))`, so it *grows with
  the price* — 0.01 on a 50 ISK item, 1,000 on a million-ISK one. It is **asymmetric at a decade
  boundary**: one step below 1,000,000 is 999,900, one above is 1,001,000. `tick.ts` implements this;
  derive the step from the magnitude of the *answer*, not the starting price.
- **ESI cache windows** (server-side, unbeatable): wallet transactions and journal **1 hour**,
  character orders **20 min**, wallet balance 2 min, market orders 5 min, market history ~daily.
  `esi()` reads the `Expires` header and takes `Expires - Date` as the TTL so a skewed browser clock
  can't break scheduling.
- **ESI cannot place, change or cancel a market order.** 34 write operations in the whole API, none
  touching orders. Automating the client is input automation: 30-day ban, then permanent. The only
  market write is `POST /ui/openwindow/marketdetails`, which opens a window and nothing more.
- **A web page can't focus another application**, so "open in game" can't raise the client.
- **`publicData` grants nothing** — zero ESI endpoints require it; it isn't even an ESI scope.
- **Order book pages are shuffled with respect to type**, so sampling N random pages is an unbiased
  sample of the market. This is what makes Prospects affordable.
- **Order count ≠ trade activity.** The most-listed items are often loot and faction gear that barely
  trade. Sampling can only nominate candidates; history has to be the gate.
- **A sell order holds its own goods**, so real stock is the Jita hangar **plus** everything committed
  to open sell orders. Counting only the hangar reports a phantom shortfall on anything being sold.
- **Assets inside containers or ships are reported against the container**, not a station, so they
  can't be attributed to Jita. Counted and reported separately rather than folded in.
- **PLEX trades on one global market** (region 19000001), not in a station — it's the exception to
  every "is this at Jita 4-4" check. See `tradedAtJita`.
- **ESI history omits days with no trades**, so a gap *is* a zero-volume day, not missing data.
- **Loyalty store offers are public**: `/loyalty/stores/{corp}/offers/` needs no scope or login. Only
  the *balances* need one (`esi-characters.read_loyalty.v1`, 1h cache). Caldari Navy is corp 1000035.
  Its store is 310 offers over 303 output items and 92 required items; 377 of those 395 types have a
  figure in `/markets/prices/`.
- **`/markets/prices/` gives a rough price for every type in the game in one unauthenticated
  request.** A global average, not a Jita quote — good enough to decide what is worth pricing
  properly, never good enough to act on.

## Decisions worth not undoing

- **`syncCharacter` merges against live state** via a functional `update()`. It used to snapshot the
  store, spend 10-30s on the network, then write the snapshot back — silently destroying anything done
  meanwhile. Never reintroduce a snapshot write.
- **Confirmations use the platform `<dialog>`** (`lib/confirm.ts` + `ConfirmDialog.tsx`), not a
  library: focus trap, Escape and backdrop come free, and it's drawn in the app's own tokens.
  Destructive questions focus Cancel. No native `confirm()` anywhere.
- **Your own order's price is read from the live book**, not the 20-minute-cached store, so a relist
  made in game shows up at once.
- **Relist advice weighs depth ahead against daily volume**, not just "am I beaten". A shallow queue on
  a fast item clears in minutes; patience is a user setting (`settings.waitHours`).
- **It also weighs what the move costs against the waiting it saves.** `waitingPaysDaily =
  (cost / orderValue) / (hoursToFront / 24)` — the daily return of leaving the order alone. When that
  beats `settings.target`, hold. This is what stops it advising a 31% price cut to get in front of a
  thin skim of cheap stock that clears in 20 hours anyway. A relist fee is fixed, so buying back a few
  minutes with one can never pay; patience settings cannot override this check.
- **And it ignores prices that aren't the market.** `weightedLevel` is the volume-weighted median of
  your side of the book, so one unit fat-fingered at two thirds the going rate moves it by nothing.
  A move landing >10% past that level, *and* chasing under 2% of the side's volume, is a mistake or a
  token dump rather than a repricing. **Both conditions matter**: distance alone wrongly condemned 217
  units of genuinely cheap supply as a "mistake"; quantity is what separates a fat finger from a
  cheap seller. This needs only the live book, so it is the one guard that still works for an item
  with no trading history — which is exactly when the other two cannot fire.
- **`marketBest` applies the same idea wherever a best price becomes a price you'd act on**: the
  suggested sell price and "stock if sold now" on a position, and the Calculator's prefill. Prospects
  and the Watchlist deliberately don't use it — an outlier only ever *narrows* an apparent spread
  there, so it hides an opportunity rather than inventing a bad trade, and that is the safe direction.
- **Prospects sizes a position by what an item can absorb** (`units/day × share × price × horizon`),
  not by one day's volume. The budget is a target, not a cap.
- **Pages run full width** via `--page-max`, so wide tables don't need a scrollbar. Prose keeps its own
  measure.
- **Loyalty ranks per point, not per ISK**, because points are the scarce thing. An offer's output is
  valued as *listed and waited* (one tick under `marketBest`, less broker fee and tax) with *sold into
  the standing bids* (less tax only) shown beside it; required items are costed at what buying them
  would actually cost, and an offer whose output can't be priced is dropped rather than guessed.
- **Loyalty caps runs by what the market will take**, not by what the points afford (`planFor`).
  Affording 666 runs of an implant that trades five a day is not a plan. `spendPlan` then works down
  the whole store — best rate until its market is full, then the next — which is the real answer to
  "what do I do with 250,000 points". It uses only offers priced against the live book *with* a
  trading history; a plan built on a global average and an unknown pace spends everything on whatever
  looks best on paper.
- **Liquidity notes are judged on one run, never on the plan.** A capped plan fills the horizon by
  construction, so its length says nothing about the item.
- **Abyssal returns come from the wallet, not from a drop table.** Filaments bought and abyssal loot
  sold are both already in `txs`, so ISK-per-run is measured. It is pooled across tiers on purpose:
  loot carries no record of the run it fell from, so a per-tier split would be a lie. `concentration`
  reports how much of the mix is one filament, which is what makes the pooled figure trustworthy.
- **Courier contracts are judged at render, not at fetch.** `judgeCourier` runs in a `useMemo` over
  the current limits, so changing your hauler re-reads the list instead of needing a rescan. Fetching
  and judging were fused once and the ship dropdown silently did nothing.
- **A contract is only "safe" if both ends resolve, both are high-sec, and a secure route exists.**
  All three, and an endpoint we couldn't resolve deliberately suppresses the `noSafeRoute` flag ---
  claiming there's no route to a place we couldn't identify is a second, wrong story.
- **PI separates what is known from what is assumed.** Planet locations are exact; income is
  arithmetic on the extraction rate *you* read off the client. Never present the second as the first.
- **The whole skill map is synced, not just the seven trade skills.** `Data.skills` holds every
  trained level, because the hustle pages ask about hauling, tanking and planet skills and the
  skills response already contains all of them.
- **Interplanetary Consolidation fills in the PI planet count** (one, plus one per level) until the
  user types over it. A skill that exactly determines a field should populate that field.
- **Abyssal loot is recognised by market group *and* by name**, and any type you have traded that
  this browser cannot name gets resolved first. Without that step a mutaplasmid sale was silently
  dropped from the return figures --- caught only by seeding a transaction and counting the items.

## Gotchas that have bitten

- **`\uXXXX` in JSX *text* is not an escape** and renders literally. Only inside JS string literals.
- **`.data td` sets `white-space: nowrap`**, which children inherit — anything wrapping inside a table
  cell needs `white-space: normal` or it blows out the table width.
- **Relative times are computed at render and nothing ticks on its own.** Use `useNow()` and pass it to
  `ago()` / `until()`, or the display freezes on whatever it first said.
- **Grid items default to `min-width: auto`**, so text won't wrap and overflows its track. `min-width: 0`.
- Tooltips must be positioned out of the flow; one that pushes rows down is worse than none.
- **`fetch()` defaults to the browser's HTTP cache**, and ESI market data is `cache-control: public`
  with an Expires minutes out — so a repeat read is answered in ~3ms without a request being made.
  Measured: 612ms, then 3ms, then 358ms with `cache: 'no-cache'`. Pass `fresh: true` to `esi()` when
  someone has explicitly asked to re-check, or the button does nothing and looks broken.

- **`SCOPE_INFO` in `config.ts` is the single answer to "what do I need to enable".** Settings lists
  every scope, its exact ESI name, what it unlocks and what breaks without it, logged in or not ---
  a scope registered on the application but granted before it was added is simply absent, with no
  error anywhere. Add a scope to `SCOPES` and add its entry here in the same commit.

## Known bugs, unfixed

Found by an adversarial review and verified real; none are fixed yet.

- Overlapping positions on the same item **double-count** the all-positions totals.
- Sells with no matching buys are costed at their own sell price, reporting exactly zero profit.
- `clearAll` doesn't abort an in-flight sync, which then rewrites the data just wiped.
- `importAll` replaces trades and positions wholesale with no confirmation.
- Broker fees are dropped for orders issued before a position's start date, though their fills count.
- "Stock if sold now" freezes its market price at mount while labelling it today's.
- `computePosition` rebuilds the whole journal index once per position — worth fixing before the
  journal gets large.

That review's verification pass was cut short, so this list is what survived, not a full audit.

## Honest limits in the model

State these rather than letting them be discovered:

- Everything in Prospects scales off `settings.share` (% of daily volume you capture, default 10).
  It's a guess, and absorption is linear in it.
- No market-impact modelling. At billion-ISK positions your own orders move the price against you.
- Jita 4-4 only. Orders elsewhere can't be judged and are counted out with a reason.
- Loyalty prices only the best 40 offers against the live book; the rest of the table sits on a global
  average and is marked "rough price". Widening that is just more requests, not new logic.
- Abyssal ISK-per-run only counts loot that has been **sold**. A good week looks flat until you list
  the hangar, and filaments you looted rather than bought aren't counted as runs at all.
- Hauling reads The Forge only. Contracts starting elsewhere are invisible, which is the right
  default for someone sitting in Jita and the wrong one for a dedicated hauler.
- A PI region scan is one request per planet (~610 for The Forge). Cached permanently since planet
  types never change, but the first run on a region takes a minute.
