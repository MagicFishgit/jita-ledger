# Jita Ledger

A station-trading tool for EVE Online's Jita 4-4. No server: React + TypeScript + Vite, all state in
IndexedDB, talking straight to ESI and EVE SSO. Deployed to GitHub Pages on every push to `main`.

Pages: Wallet (home), Tonight's run, Calculator, Prospects (find items), Watchlist, Capital planner, Hub
arbitrage, Positions, Orders (which of mine are beaten), Results, Loyalty (spending LP), Side hustles
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
npm run build    # tsc --noEmit && vite build
npm run dev      # http://localhost:5173/jita-ledger/
npm run scan-live   # end-to-end funnel against real ESI (needs the resolver hook, so not bare node)
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
Plain constants (Jita's IDs, skill names, Alpha caps, Caldari Navy, PLEX) live in `constants.ts`, which
`config.ts` re-exports; a pure module imports them from `./constants` so it stays testable.

That split is deliberate and worth keeping: **pure rules in `prospects.ts` / `relist.ts` / `tick.ts` /
`schedule.ts` (and the redesign's `split` / `planner` / `arbitrage` / `wallet` / `combat` / `results` /
`tonight` / `training` / `signals` / `alerts`), I/O in `scan.ts` / `market.ts` / `sync.ts` (and
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
- **ESI's daily `highest` and `lowest` are trimmed, not the true extremes.** Checked against the user's own
  wallet in September 2026: of 182 days they sold something in Jita, 86 had a sale *above* the reported high
  (60 of them by 5% or more; one ammo sale at 53.98 against a reported high of 40.66), and 6 of 41 buy-days
  had a buy below the reported low. The trades left out were typically about 2% of that day's volume, once
  25%. CCP documents none of this. So a day's low is where the *bulk* of the day's trading got down to:
  "the low stayed above your bid" means most trading stayed above it, never "nothing sold lower". Say it that
  way in copy. The history is also region-wide (all of The Forge), not Jita alone.
- **ESI's `average` may be the client's median price, not a true average** (an unanswered forum observation,
  not checked here). Nothing is built on the difference; it is a limit, not a fact.
- **NPC market orders run for 365 days; a player's run for 90 at most.** So an item NPCs sell shows itself in
  the book (`duration`), with no list to keep. Raven Blueprint: NPC-sold at a fixed 1.135 B, flat on 23 of 25
  days, its bids a lowball 0.02 ISK.
- **Loyalty store offers are public**: `/loyalty/stores/{corp}/offers/` needs no scope or login. Only
  the *balances* need one (`esi-characters.read_loyalty.v1`, 1h cache). Caldari Navy is corp 1000035.
  Its store is 310 offers over 303 output items and 92 required items; 377 of those 395 types have a
  figure in `/markets/prices/`.
- **`/markets/prices/` gives a rough price for every type in the game in one unauthenticated
  request.** A global average, not a Jita quote — good enough to decide what is worth pricing
  properly, never good enough to act on.
- **ESI has no loot tables of any kind.** Nothing says what an abyssal filament drops. Any "expected
  reward" would be invented. Don't. Abyssal returns come from the wallet instead.
- **`/route/` is one of the few endpoints still under a version prefix** (`/v1/route/...`), not the
  compatibility-date root — the unversioned path 404s. `flag=secure` routes high-sec only, and a 404
  from it means *no such route exists*, which is an answer rather than a failure.
- **A player structure is only described to a login with `esi-universe.read_structures.v1`, and only if
  you're on its access list.** `/universe/structures/{id}/` says so in ESI's own spec: otherwise it returns
  "Forbidden" (403) for all inputs. NPC stations (`60000000`–`64000000`) always resolve. The refusal is the
  best hauling-scam signal there is — but only when the scope was granted. Until September 2026 the app never
  requested it, so every structure failed and Hauling called every structure contract "the classic scam".
  `structureInfo` now separates *unchecked* (no scope: nothing asked, nothing claimed) from *refused*.
- **Location IDs tell you what they are by range**: NPC stations 60–64 million, solar systems 30–33 million
  (items in space), player structures from 1,000,000,000,000 up. `isStation` / `isSystem` / `isStructure`.
- **Broker fees and sales tax carry no context at all; they're matched by the second.** Checked on a
  real journal: 588 `brokers_fee` and 2,473 `transaction_tax` entries, not one with a `context_id`. But
  385 of the broker fees fell in exactly the second of one of the character's orders' `issued` time,
  because placing an order — and changing its price, which moves `issued` to that moment — charges the fee
  then. So `feeMatch.ts` matches a fee to an order version by second (amount breaks ties), and a tax to a
  sale by second and size. Orders keep every version seen (`Order.seen`, merged in sync), so a new price
  is a price change whose fee can be found. Two changes between syncs show as one, and changes before
  order history was kept can't be attributed. Unmatched fees are estimated from rates and say so.
- **A price-change fee is split like the placing fee**: over the units left on the order when it was
  charged, so units that fill afterwards carry it and the rest is prepaid. Charging it at once put a
  position that moved a 2,000-unit listing after selling 5 at −139%.
- **The client can be given a destination, not an info window for a structure.** `POST /ui/autopilot/waypoint/`
  (`esi-ui.write_waypoint.v1`) takes a solar system, station *or* structure ID and plots the route.
  `/ui/openwindow/information` only opens characters, corporations and alliances.
- **A mail a character sends itself doesn't reach the client until it logs in again.** Checked on the user's
  character in September 2026: ESI accepted the mail (201, an ID), and `/mail/{id}` and `/mail/labels/`
  showed it in the Inbox (labels 1 and 2, Inbox unread 1). But the client's Inbox, open the whole time,
  never listed it, and it appeared only after logging off to character select and back. So alert mail comes
  from a second character. Sent that way through ESI it arrived in the open client near instantly, with the
  new-mail notice, as ordinary incoming mail.
- **EVE mail through ESI** (`esi-mail.*`): POST `/characters/{id}/mail/` takes `{recipients:[{recipient_id,
  recipient_type:'character'}], subject, body, approved_cost}` and answers 201 with the new mail's ID. Body at
  most 10,000 characters, subject 1,000. The body is the client's small HTML: `<br>`, `<b>`, `<font size color>`
  with ARGB colours (`#ffRRGGBB`), and `<a href>` — `showinfo:{typeId}` opens an item, and a web link makes the
  client ask first. **What it draws was settled by a sample mail to the user's character:** sizes 10–32 all
  differ; `<b>`, `<i>`, `<u>` work; every colour works; `showinfo:` links open items, systems
  (`showinfo:5//{systemId}`), stations (`showinfo:{stationTypeId}//{stationId}`) and planets
  (`showinfo:{planetTypeId}//{planetId}`) without leaving the game; → · • ✓ ★ ± render; runs of spaces are
  kept. `&nbsp;` shows literally, `<hr>` draws nothing, a monospace `face` is ignored, a link's colour
  can't be changed (links are always gold), and × has no glyph. So no tables and no rules. GET gives the 50 newest headers (`from`, `subject`, `timestamp`, `is_read`, `labels`),
  older ones via `last_mail_id`. DELETE `/mail/{id}/` answers 204, and 404 once it is already gone.
- **Public contracts are public**: `/contracts/public/{region}/` needs no scope. The Forge runs to
  ~35 pages of 1,000, of which only ~120 are couriers.
- **Market groups are the honest way to get a set of types.** Filaments are groups 2457–2461, abyssal
  loot materials 2479. Walking the whole tree is not an option: there are 2,114 groups and
  `/markets/groups/{id}/` gives no child list, so fetch named groups only.
- **Skill names are not stable.** The industrial ship skills are *Caldari Hauler*, not *Caldari
  Industrial* — CCP renamed them. Skill needs are declared by name and resolved at runtime for that
  reason: a stale hardcoded ID checks the wrong thing silently, while a name that stops resolving
  shows as unknown.
- **`/characters/{id}/skills/` carries `total_sp`.** Summing levels cannot give it — the points a
  level costs depend on each skill's rank, which that response doesn't include.
- **An injector gives fewer points the more the buyer already has** (500k under 5M SP, then 400k,
  300k, 150k), and you cannot extract below 5M SP at all. That is why injector prices don't track
  the raw point count.
- **Planet types come from `/universe/planets/{id}` → `type_id` → `Planet (Barren)`.** Richness — the
  thing that decides what a PI planet actually yields — exists only in the client, not in ESI.
- **Lower security means richer PI planets, and that holds *inside* high-sec**: a 0.5 extracts more
  than a 1.0. A PI system list must therefore not default to sorting by security descending, which is
  the instinct everywhere else here and is exactly backwards. The size of the difference is not in
  ESI, so don't put a number on it.
- **150 units of raw make one refined unit.** A Basic Industry Facility takes 3,000 per 30-minute
  cycle and returns 20, so one gets through 6,000 an hour for 40 out. This was once written as 14,
  which flattered refining roughly tenfold and told people to build factories for a 1.08× gain while
  showing them 11.6×. ESI does not serve schematic inputs — only names and cycle times — but the
  30-minute cycle **is** confirmed there: exactly 15 schematics carry an 1,800-second cycle and they
  are exactly the 15 refined products. An Advanced facility is 40 each of **two different** refined
  goods for 5 processed, hourly: 16 in per 1 out.
- **Which refined pair makes which processed good is not in ESI and is not guessed at.** The factory
  lists them in the client. Naming recipes from memory is how the 14 got in.
- **A PI extraction programme has an end date and then simply stops** (`expiry_time` on the extractor
  pin). The colony looks normal, factories drain what is left, and it earns nothing until the heads
  are reset — the commonest way PI money is lost, and a field nothing was reading.
- **Colony pins are classified by shape, not by type ID**: `extractor_details` makes it an extractor,
  `factory_details` a factory, anything else that holds things is storage. No list to go stale.
- **`qty_per_cycle` is not a flat rate.** Real extraction decays across a programme, so the per-hour
  figure derived from it is the top of the range. Say so rather than presenting it as steady.
- **`/universe/ids/` will not resolve Amarr's trade station by name** ("Amarr VIII (Oris) - Emperor Family
  Academy" comes back missing while Dodixie, Rens and Hek resolve), so `HUBS` holds station IDs, each checked
  against `/universe/stations/{id}/`: Amarr 60008494, Dodixie 60011866, Rens 60004588, Hek 60005686. NPC
  station IDs don't change; this is not the skill-name situation.
- **`/universe/names/` rejects the whole batch if one ID is bad.** `useEnsureNames` falls back to one
  `/universe/types/{id}/` per type when that happens, or the batch stays "Item #…" for good.
- **Planetary goods are market groups 1333–1337** (Raw, Processed, Refined, Specialized, Advanced: 15, 15,
  24, 21 and 8 types, checked against ESI). 1332 is the parent and lists no types itself.
- **A blueprint copy shares its type ID with the original**, so any price for it is the original's: one
  battleship BPC reads as billions. `is_blueprint_copy` assets are left out of every stock count; copies
  can't be sold on the market anyway.
- **Some busy items really do trade in a 0.1–1% daily range.** Hammerhead II's ESI history shows
  (high − low) / average of 0.13% to 1.3% on most days. A squeeze warning on such an item is correct, not a bug.
- **A market_transaction journal entry's `context_id` is the transaction ID**, which is how the Wallet names
  the item behind a balance jump. Buy orders are escrowed when placed (`market_escrow`), so money in and out is
  read from transactions for trades and the two market ref_types are left out of the categories — counting both
  doubles every purchase.
- **Hauler capacities are read from ESI, not remembered.** A Charon holds **465,000** m³, not the
  1,100,000 once written here — that was an expanded fit passed off as the hull, and it would send
  someone to a contract they cannot pick up. For hulls with a fleet hangar the usable figure is cargo
  **plus** hangar, since a courier package travels in either; that is why a Deep Space Transport with
  a 3,900 m³ hold is the standard ship for 50,000 m³ contracts.
- **Only two cargo bonuses are applied, because only they name the stat they move.**
  `freighterBonusC1`/`C2` on a freighter (both 5, tied to the racial Freighter skill and Advanced
  Spaceship Command, compounding — a Charon at both V holds 726,563 m³) and
  `industrialCommandBonusShipCargoCapacity` on the Orca. Other classes carry bonus attributes whose
  target stat the data does not state; nothing is assumed for those.

## Decisions worth not undoing

- **`syncCharacter` merges against live state** via a functional `update()`. It used to snapshot the
  store, spend 10-30s on the network, then write the snapshot back — silently destroying anything done
  meanwhile. Never reintroduce a snapshot write.
- **Confirmations use the platform `<dialog>`** (`lib/confirm.ts` + `ConfirmDialog.tsx`), not a
  library: focus trap, Escape and backdrop come free, and it's drawn in the app's own tokens.
  Destructive questions focus Cancel. No native `confirm()` anywhere.
- **Your own order's price is read from the live book**, not the 20-minute-cached store, so a relist
  made in game shows up at once.
- **Whether trading reaches a bid is judged by counting days, not read off the top of the book**
  (`lib/fills.ts`). A wide gap between best bid and best ask looked like margin on items whose sellers list
  and wait: the user bid on a Syndicate Gas Cloud Scoop Prospects had suggested and it never filled. Over the
  last 14 days, the bulk of its trading reached a bid one step over the best (101.7 M) on 1 day and the user's
  99.79 M on none, while sellers took 103–110 M. Hammerhead II (0 of 14 at its 711.7 k top bid, all trading
  near 800 k), Mobile Tractor Unit and Caldari Navy Ballistic Control System looked the same; Machariel (12),
  Gist X-Type boosters (11) and High-grade Snake Alphas (9) didn't. It is not a category: the data decides.
  The rules, all from `lows14` / `recentRange`:
  - reached on fewer than `FILL_RARE` (4) of 14 days, a bid is below where the item trades;
  - the realistic bid is `reachedBid`, the 7th-lowest daily low (reached on half the days);
  - Prospects prices buying there (`bidToPlace`), flags `unreached`, and an item whose realistic bid leaves
    no margin drops out. On live data (1.5% broker, 3.38% tax): the scoop went 7.8% → 4.5% and stayed,
    Hammerhead II 5.2% → −6.3% and went;
  - a buy order below where trading reaches is told to move *there* (not one tick over the best bid, which
    for the scoop was reached on 1 day of 14), or, if selling on from there misses `settings.target`, gets the
    `dry` verdict: **Cancel it**. It raises a "move" alert (it replaces a move recommendation) and a Tonight
    item, its mail says "RECOMMENDED: cancel this buy order", and it earns nothing per slot;
  - the Calculator's price notes use the same count, since one day's extreme said "inside what sellers
    accepted" about a bid the rest of the fortnight never reached;
  - **your own fills overrule the count** (`fillingNow`): a buy that has shrunk since its price was set, or an
    item you bought at or below the bid in the same station in the last 3 days, is reached, whatever history
    says. History lags a day or two and an order repriced since isn't in it at all: the user's Datacore -
    Rocket Science buy at 83,230 was told to cancel ("reached on 2 of 14 days") with 4,133 of 10,000 already
    filled. Consumers read `Relist.unreached`, which carries the override, never `reach` directly.
- **A one-sided day says nothing about who traded** (`buyerShare`). A day whose trading sat only in the upper
  half of the week around it (or only the lower) is skipped, like a flat day; the median comes from two-sided
  days, and needs `MIN_TWO_SIDED` (7) of them or every day is read as before. Reading such a day by where its
  average sat inside its own narrow range counted the scoop's 107.8–109.1 M day as mostly sellers dumping.
  Measured on live history: the scoop's seller-side estimate fell 42 → 26 a day, Tritanium's stayed in the
  billions, Machariel's didn't move; Mobile Tractor Unit had only 5 two-sided days and falls back. Assigning
  one-sided days 100/0 instead was tried and wrong: it put Tritanium's sellers at zero.
- **Items NPCs sell are kept out of Prospects** (`npcSell` on the book, from `NPC_DURATION`) and flagged in the
  Calculator: a bid won't fill below an unlimited NPC price, and there's nothing cheaper to buy and resell.
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
- **A broker fee belongs to its order's units, not to the moment it was paid** (`computePosition`). A
  buy order's fee goes into the stock's cost; a sell order's fee is charged per unit as units sell; the
  share for units still waiting on an open order is `prepaidFees`, shown beside the profit rather than in
  it; a closed order's unfilled share is spent. Charging fees when paid made a PL-0 Scoped Cargo Scanner
  position that had sold 5 of 2,039 read −1.05 M and "−2325% return", when those 5 had made money: the
  listing fee for all 2,039 had been charged against them. A test checks cash + stock at cost + prepaid
  fees = realized.
- **"Is that cheap listing a token?" also asks how much the item trades in a day.** Share of the book
  alone was fooled on PL-0: one 9,909-unit order at 45,000 made 161 real units at 30,040 look like 1% of
  the side, so the app suggested 34,770. Stock worth at least a quarter of a typical day's trading is real
  supply (`OUTLIER_OF_DAY`), in `marketBest` and in relist advice. "Typical" is the 14-day median
  (`typicalDailyVolume`): your own big buying day can make the average several times the norm.
- **`marketBest` applies the same idea wherever a best price becomes a price you'd act on**: the
  suggested sell price and "stock if sold now" on a position, and the Calculator's prefill. Prospects
  and the Watchlist deliberately don't use it — an outlier only ever *narrows* an apparent spread
  there, so it hides an opportunity rather than inventing a bad trade, and that is the safe direction.
- **Prospects sizes a position by what an item can absorb** (`units/day × share × price × horizon`),
  not by one day's volume. The budget is a target, not a cap.
- **Busy markets is a separate view, not a looser filter** (`filters.busy`). It shows up to `BUSY_SHOWN` (100)
  items by ISK traded a day (`tradedPerDay`: median day's units × 30-day average price), each at its real
  return (`evaluate(..., anyReturn)`): a loss is shown in red, not hidden, and "Return ≥ %" doesn't apply.
  Every scan prices the busiest markets as well as the best-margin ones (60 on a quick scan, 100 on a deep),
  skipping any where one unit costs more than ISK per item. The view walks down the list until it has enough
  it can show: stopping at the first 40 showed 26. It prices at the **top of the book**, not `bidToPlace`'s
  realistic bid: on a market trading 890,000 nanites a day, the ~2% share of trades ESI trims from its daily
  low is still thousands of units, some of them dumps into bids, so a patient top bid does fill there. The
  `unreached` flag still shows. At the user's rates (1.3% broker, 3.375% tax) and 1 B per item, 45 of the 100
  busiest were profitable; nanites made 0.69%.
- **Share of the market can be measured** (`lib/share.ts`, "Measure my share" in Settings). Your Jita trades
  over 30 days, per item-day, against that day's volume on your side; the median of each side, halfway
  between them, over the 1.5× a quiet market gets, to the half percent. Needs `MIN_SHARE_DAYS` (10) item-days
  and drops a side with under `MIN_SIDE_DAYS` (3): one day of buying suggested 66.5%. Only days you traded
  count, so it reads high, and says so. The user had 50% set; their wallet measured 1.2% on buys, 5.8% on sells.
- **Settings are one row each: name and hint, then a short number box with its unit** (`SetRow`). The old
  full-width fields put the number at the far end of the page from its label.
- **The horizon is a choice of 3, 7, 14 or 30 days, or Any** (`HORIZONS`; Any is stored as `null`, since the
  filters live in localStorage JSON where Infinity doesn't survive). It is a gate and a size cap, never a
  ranking input: ranking is return per day either way. Any leaves nothing out for being slow and flags a
  position that takes over `SLOW_DAYS` (30) to flip as "Locks ISK for weeks"; "Can take" says "no limit".
  An empty box meaning "unlimited" was considered and rejected: it would quietly bring back the locked-ISK
  trap the reach work was built against. A saved typed-in horizon snaps to the nearest choice.
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
- **A racial line is a choice, not a checklist.** Hauler, freighter and cruiser skills come in four
  races and any one does the job, so a requirement can be a `Need` with `anyOf`: the check takes the
  race you are furthest along in, and the panel lists every race you have started. Part-trained lines
  do not sum — three at II is not one at IV. Never name one race as the requirement; the app already
  reads every skill, so asking which race someone flies is asking for what it can see. The same
  `anyOf` drives the cargo bonus, which uses the best trained racial Freighter level.
- **ORE's freighter is not a freighter for this purpose.** The Bowhead's 1,600,000 m³ bay takes
  assembled ships only and its cargo hold is 4,000 m³, smaller than a Badger's. The Orca is the ORE
  ship that belongs in a hauling list: 30,000 hold plus a 40,000 fleet hangar, flown on Industrial
  Command Ships rather than a racial line.
- **PI factories are per colony and are not fed continuously.** One planet cannot supply another, and
  a factory receiving less than 6,000 an hour does not stop working — it runs fewer cycles. So show
  how many are needed to keep up (rounded up) and how busy they will be, never how many the
  extraction can "afford".
- **The Planets page is a walkthrough whose instructions follow its own verdict.** Pick a product
  (all 15 priced live and ranked per 1,000 units of extraction), find planets, see the return, build
  it. Told to sell raw, the build guide drops the factories and draws extractor straight to
  launchpad. Refining currently ranges 0.76×–1.57× across the products, so the answer genuinely
  differs per product and moves with the market.
- **Every figure the redesign added is read, derived, or asked for — never invented.** The buy/sell split comes
  from where each day's average sits between its low and high; training time from dogma and attributes; the
  PushX cost, delivery days, hours spent per activity, Omega pack prices (only the 1-month 500 PLEX is assumed)
  and gank lines are the user's to enter, and a blank one shows as "–" rather than a stand-in. The rule
  thresholds that remain (competition pivot 60 orders, share clamped 0.3–1.5×, a wall being the *best* price
  holding over 50% of its side *and* over 3 days of volume, escrow 10% over the 30-day high, spike 5× volume
  and 10% price, relist fee charged on half the order) are named constants stated in the copy. The wall rule
  was first "any level over 50%", which flagged ordinary markets and then re-alerted every six hours; a big
  order deeper in the book, or one the market clears in a day, is not a wall.
- **Daily volume divides by calendar days, not by history rows** (`recentAverages`). Dividing by rows present
  spread a thin item's last seven trading days — maybe two months of them — over one week and overstated its
  pace many times over, which sized arbitrage lots and relist advice off a market that wasn't there.
- **The gank systems are Uedama and Sivala.** Niarja used to be the other, but ESI gives it −1.0: it has been
  Pochven since 2020, so no secure route can pass through it. The secure Jita–Amarr route runs Uedama → Sivala.
- **A killmail that couldn't be fully priced is left unpriced and retried**, never stored with the missing
  items at zero: its value is kept for good. ESI's 400 for an untradable type (a capsule) is a real "no
  price"; any other failure is a retry.
- **Scopes are looked up by name** (`SCOPE.wallet`), never by position in `SCOPES`.
- **Pages that need the same live answer share one store**: `orderCheck` (your orders against the book),
  `watch` (squeeze and scam signals), `colonyStore` and the killmail pricer. Orders, Tonight's run and the
  alerts all read `orderCheck` rather than fetching the same books three times.
- **Killmails are priced once, from market history on the day, and never re-priced.** A loss in March cost
  March's prices. Refits use today's Jita book because that is what you'd pay now; the two are shown side by side.
- **Results attributes each ISK movement by one stated rule** (`attribute` in `results.ts`): positions' realized
  profit, filaments against abyssal loot, PI goods less customs, LP-store goods less the store's ISK, courier
  rewards, bounties; ships lost charged to the activity they died in. A trade a position counts is always
  trading, and an item in no set is left out rather than guessed at.
- **Net worth keeps one snapshot a day in this browser** (`Data.netWorth`), written by the Wallet page. ESI has no
  net-worth history, so the trend starts the first day the page is opened and says so.
- **Alerts run only while a tab is open.** A web page can't watch anything once it is closed; Settings says so.
  They reuse the pages' checks, respect quiet hours and don't repeat a finding within six hours.
- **Goals are five kinds, each measured from something the app reads** (`lib/goals.ts`): afford N of an item
  at the live price (units bought on the market since the goal was set come off what's left, so buying PLEX
  in small lots counts), hold N of an item (hangars plus sell orders), save ISK (wallet, wallet + orders, or
  net worth), earn over a period (positions' realized profit or net cash flow), train a skill. Any can carry a
  deadline, which turns the ETA into "needs X a day, going at Y". A reached goal is stamped once and stays
  reached. Old `{ kind: 'wallet' | 'nw' }` goals are read as ISK goals.
- **ESI has no PLEX vault endpoint** — none of its paths mention PLEX or a vault. A PLEX "hold" goal starts
  from the count you give it and follows your market trades; PLEX from the store isn't visible.
- **The Wallet prices loyalty points itself** (`lib/lpStore.ts`, shared with the Loyalty page): the same
  rough-rank-then-price-the-top-40 pass, run in the background when a store has no usable rate or it is over
  12 hours old, valued at what the spend plan would make and only for as many points as the markets take.
  Waiting for someone to open the Loyalty page left points at "0.00 ISK" in net worth; an unpriced balance
  now says "Pricing…" or "Not priced yet", never a zero.
- **System notifications can't take the app's CSS** — the OS draws them. The app sets their icon (the hex
  mark, drawn to PNG) and an `image` (the alert as a card in the theme's colours, 2:1), which Chrome shows on
  Windows and Android and macOS ignores (`lib/notifyArt.ts`). They only fire while the tab is hidden, which is
  why Settings has a delayed test.
- **An alert mail says what to do before it says why.** Each alert opens with a **RECOMMENDED:** line (move
  your sell order down to X; leave it where it is; reset the extractor heads before a time), then the facts
  the check already had: yours against the best and by how much, what moving costs split into the lower
  price and the fee, what's at stake, the queue ahead and how long it takes to clear, or for PI the system
  (an in-game link), planet, product and end time. The subject leads with the same advice, since the inbox
  list and the new-mail notice show nothing else. The test mail is built from one of your real orders
  against the live book, so it shows exactly what an alert about it would say. The client's default mail text
  is small, so the whole body sits in `<font size="16">`, with titles at 20 and the brand at 26 (`SIZE` in
  `alerts.ts`); an inner size overrides the outer one.
- **Alerts can go by EVE mail, opt-in, always *to* the trading character and *from* a second one** (`lib/mailAlerts.ts`,
  builder `alertMail` in `alerts.ts`). The sender is a second login slot in `auth.ts` (`jita-ledger:mailer`,
  `loginMailer`, `getMailerToken`), asking only for send and organize mail. `handleCallback` tells the two
  logins apart by the `purpose` stored with the PKCE verifier, and refuses (and revokes) a sender login that
  comes back as the trading character. Logging either one out leaves the other. Without a sender, mail goes
  to yourself and Settings says it will only show after a relog. `esi()` takes a `token` to call as the
  sender. A mail has one ID for sender and recipient, so cleanup deletes the recipient's copy with the
  main login and then, best effort, the sender's Sent copy with the sender's. A browser notification is held back while a borderless game is in front, and a web page can't
  put anything inside the client, but a mail arrives there with the client's own blink. One mail per check
  holding everything raised, never one per alert. By default only `move` and `pi` are mailed, the two you can
  act on from inside the game. EVE mail has no link that opens a market window (`showinfo:` opens only the
  info window), so an item's *name* links to `#orders?market=ID`. It was first a `showinfo:` link with a
  separate market link beneath; the user asked for one link on the name, since the market is where an alert
  sends you. The client asks before following it, the browser opens the app, and `lib/marketLink.ts` calls
  `openMarketWindow` once, having first taken `market` off the address with `replaceState` so a reload
  can't repeat it. Nothing opens a market window unless someone clicked. ESI answers 204 whether or not
  the game is running, so the toast says the client was *asked*. Old alert mails are deleted after a chosen time (30 min to a week, or
  kept), read or not, on a cadence of a sixth of that time between 5 and 60 minutes (`tidyEvery`). Only mails
  **from you or your sender, with a subject starting `Jita Ledger:`** are ever touched (`isStaleAlertMail`); without
  the read scope, only the mail IDs this browser recorded sending. Cleanup runs even with alerts off, and
  stamps its time on failure too, so a lasting error retries at that cadence rather than every 15 s tick.
- **Only one tab runs the alert checks**, elected with a Web Lock (`ALERTS_LOCK` in `alertsRunner.ts`).
  Every tab asks for it, the holder checks, the rest queue and one takes over when the holder closes. Two
  tabs used to raise and mail every finding twice, and each click on a mail's market link opens a new tab.
  The grant can arrive after React's development double-run has already cleaned the effect up, so the
  callback checks a per-call `stopped` flag and resolves at once. A tab opened from a market link closes
  itself when another tab holds the lock: Chromium allows `window.close()` on a tab with one history entry,
  which is what an OS-opened link is (Playwright's `newPage` starts at `about:blank` and has two, so test it
  with CDP `Target.createTarget`). If the browser refuses, the tab says it can be closed.
- **A tooltip longer than a sentence or two is laid out, not written as a paragraph** (`lib/tipText.ts`,
  drawn by `TipLayer`). Tips stay plain strings, and the structure lives in the text: a blank line starts a
  paragraph, a line starting "• " is a bullet, and a paragraph starting "For example:" becomes a boxed
  example. Anything over 200 characters, or with a line break, gets a 400 px box instead of 300, and a tall
  tip flips to whichever side of its target has room. Write a long tip as a lead line saying what the thing
  *is*, then bullets for how it's worked out, then the example. The user found the one-paragraph versions a
  wall of text. Explanations that also show inline (flag `why`s) use paragraph breaks only, since a bullet
  would read oddly there.
- **ISK amounts don't carry a useless ".00".** `isk()` keeps cents under 100,000 only when there are cents
  (5.50 ISK, but 5,000 ISK), and `iskBig()` drops trailing zeros (14 M, 14.5 M, 14.81 M). CSV exports keep
  full precision on purpose.
- **No chart library.** Charts are inline SVG in the theme tokens (`charts.tsx`); recharts was removed.
- **Diagrams are authored as inline SVG, not fetched.** A hosted image means someone else's server on
  every load, a licence to honour and a broken box the day it moves. Inline SVG inherits the theme
  tokens, stays sharp at any size and costs no request.

## Gotchas that have bitten

- **`\uXXXX` in JSX *text* is not an escape** and renders literally. Only inside JS string literals. The same
  goes for `\n` in a quoted JSX attribute (`tip="a\nb"` shows a backslash): a structured tip needs `tip={'…'}`.
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

- **Python `str.replace` no-ops silently when the anchor has drifted.** No error, the file is
  written unchanged, the commit lands and the doc is quietly wrong. Five commits' worth of EVE facts
  went missing exactly this way — one anchor in this file moved and everything chaining off it
  cascaded — and it was caught only by grepping for the phrases afterwards. Use the Edit tool, or
  `assert anchor in s` before every replace, and grep for what you added once it is written.
- **A global CSS rule on a shared class reaches pages you aren't looking at.** `.chip` becoming
  `inline-flex`, `.kv .v` gaining `nowrap` and `.empty svg` (which enlarged every icon inside an empty state's
  button until narrowed to `.empty > svg`) all changed pages other than the one being built. Re-shoot the
  Calculator, Prospects and a settings tab after touching `styles.css`.
- **Never key a React list by a display label.** Every unnamed structure on the Wallet was labelled "A player
  structure", the rows shared that key, and React reused the wrong row on re-render: a stale "Pricing…" and
  a list that looked unsorted. Key by the ID the row stands for.
- **Test with an empty store and a sparse one, not only a rich seed.** The Wallet crashed the whole app on
  a ledger with trades but no journal (the state of anyone whose early syncs predate the full journal):
  the oldest entry was `Infinity` and formatting it threw. A rich synthetic ledger never shows that. Pages
  now render inside `PageBoundary`, so a failing page shows its error inside the shell instead of a blank app.
- **`browser_navigate` to the same URL with another `#hash` keeps the old document**, including modules an
  HMR update failed to replace — a page can run stale code while the file on disk is right. `location.reload()`
  after edits, and import the app's own module instance (its `?t=` URL from `performance`), not the bare path.
- **`SCOPE_INFO` in `config.ts` is the single answer to "what do I need to enable".** Settings lists
  every scope, its exact ESI name, what it unlocks and what breaks without it, logged in or not ---
  a scope registered on the application but granted before it was added is simply absent, with no
  error anywhere. Add a scope to `SCOPES` and add its entry here in the same commit.

## Known bugs, unfixed

Found by an adversarial review and verified real.

- Overlapping positions on the same item **double-count** the all-positions totals (and so the Wallet's
  trading profit and Results' trading line).
- Sells with no matching buys are costed at their own sell price, reporting exactly zero profit.
- Broker fees are dropped for orders issued before a position's start date, though their fills count.

Fixed with the redesign: `clearAll` bumps a generation that an in-flight sync checks before writing;
importing a backup confirms and says what it replaces; "stock if sold now" re-reads the market every five
minutes; the journal index is cached per journal version instead of rebuilt per position.

That review's verification pass was cut short, so this list is what survived, not a full audit.

## Honest limits in the model

State these rather than letting them be discovered:

- Everything in Prospects scales off `settings.share` (% of daily volume you capture, default 10).
  It's a guess, and absorption is linear in it.
- No market-impact modelling. At billion-ISK positions your own orders move the price against you.
- Jita 4-4 only. Orders elsewhere can't be judged and are counted out with a reason.
- **Pricing a buy where trading reaches is conservative.** Because ESI trims each day's low, an item whose
  dumps into bids live entirely in that trimmed tail looks unreached and can drop out of Prospects. Nobody can
  build a position on that tail, but a small, patient order might still fill there.
- The reach count uses The Forge's history, not Jita's alone, and only buy orders are judged by it.
- A scan treats cached stats without `lows14`, and books without `npcSell`, as stale, and fetches history for
  any item it prices whose stats lack the lows. The liquidity pass refreshes the *most-listed* items and the
  pricing pass takes the *best-margin* ones, which are mostly different: before the second fix only 5 of 42
  priced items had lows. Items a scan doesn't reach keep their old record, priced one step over the best bid
  and unflagged, until one does.
- Loyalty prices only the best 40 offers against the live book; the rest of the table sits on a global
  average and is marked "rough price". Widening that is just more requests, not new logic.
- Abyssal ISK-per-run only counts loot that has been **sold**. A good week looks flat until you list
  the hangar, and filaments you looted rather than bought aren't counted as runs at all.
- Hauling reads The Forge only. Contracts starting elsewhere are invisible, which is the right
  default for someone sitting in Jita and the wrong one for a dedicated hauler.
- A PI region scan is one request per planet (~610 for The Forge). Cached permanently since planet
  types never change, but the first run on a region takes a minute.
- **PI does not model powergrid or CPU.** Command Center Upgrades governs how many extractor heads
  and factories physically fit; "1 factory per planet" does not check that you can fit it. The
  per-structure costs and per-level budgets are not in ESI.
- Alert mails were seen in game, sent from a second character: the ARGB `<font>` colours, `<b>` and the links
  render as intended, and the market link opens the market window through the app (the client's external-link prompt can be told never to ask again). The cost is
  focus: the OS brings the browser forward to open the link, and on a single monitor the game drops behind
  it. A page can't hand focus back to another application, so the user tabs back in.
- Deep Space Transports, Blockade Runners, Industrials and Jump Freighters get **no** skill cargo
  bonus, because their bonus attributes do not say which stat they modify. Their presets are bare
  hulls and the figure stays editable.
- The colony panel's rendering of live data is **unverified**: it needs the planets scope and a
  character with planets. Its logic is unit-tested; the screen has never been seen with real data.
- **The buy/sell split is a heuristic.** Where a day's average sits between its low and high says roughly how
  much traded at the ask, not exactly. It is shown as an estimate and falls back to 50/50 without history.
- **Net worth values assets at CCP's rough global average**, which flatters anything hard to sell, and its
  trend exists only from the first day the Wallet page was opened in this browser.
- **Results leaves out any trade whose item belongs to no activity set**, and counts LP-store goods as loyalty
  income only for the stores you currently hold points with.
- **Hub arbitrage reads selling speed from the hub's whole region**, which is mostly but not only the hub.
  It prices about 40 candidates (the busiest from the last scan, plus positions and watchlist) — not the market.
- **Combat's "Does PvP pay?" is a ceiling**: everything that dropped from your kills, whether or not you looted
  it, against what PvP cost you.
- **The Wallet's unusual-activity check is a prompt, not a detector**: new donors, large donations out, and big
  contracts at hours with under 2% of your journal activity.
