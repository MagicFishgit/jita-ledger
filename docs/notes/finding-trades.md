# Finding trades

Decisions worth not undoing. Prospects, the Capital planner, the cloud's full-market scan, the Sniper and Place and leave: how candidates are found, sized and priced.

- **The cloud watches what you'd buy, not only what you hold** (`pushWatch` in `cloud.ts`, the `watch` doc). The
  browser sends the top 150 of its last Prospects scan ranked by your saved filters, filled from the Busy markets
  view when the filters pass fewer (a strict filter set passed none on the test browser), plus the items the
  loyalty spend plans sell (`lpRate[corp].types`). Sent only when the list changes, with the filters, for the
  cloud's opportunity mail. The browser fetches the cloud's flow for those too, so Prospects ranks candidates on
  measured buyer/seller flow (it reads `watchedFlow` at rank time) before any ISK goes in.
- **"Trade worth a look" is mailed by the cloud when a watched item newly clears your Prospects filters**
  (`opportunities` in `worker/src/alerts.ts`, alert kind `opportunity`, on and mailed by default). The item is
  judged exactly as Prospects judges it: `evaluate` moved to `lib/evaluate.ts` (`judgeProspect`, with the
  watched data passed in) so the Worker can run it, with the filters from the `watch` doc, on the book the watch
  just read, and each item's Jita order count standing in for the scan's order estimate. Only items with no
  warning flag, watched at least 6 h and not already held; `opp_seen` remembers which qualify, so an item is
  mailed when it opens up, not every round it stays, and again after it closes and reopens. At most 3 a mail,
  the name linking to the Calculator. `/v1/alerts/preview` reports the stages (candidates, with book, history,
  6 h watched, filters, priced, clean): on relaxed filters and stand-in watching, 64 candidates gave 13 priced
  and 6 clean.
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
- **The Capital planner ranks with `plannerFilters`**: your Prospects filters, but never Busy markets, and
  always its own ISK and horizon with partial fills. It used to copy the saved Prospects filters wholesale,
  so with Busy markets left on it built from the busy list (top-of-book prices, "Return ≥ %" ignored): on the
  test browser at the user's rates that deployed 1,994 M into 5 items for 43.9 M a day, against 247 M into 10
  for 19.2 M on the normal list. The mix now shows the flags that don't exclude an item, marks items you
  already have orders or a position on, and offers the Prospects horizon choices (without "any").
- **Pages that work from the Prospects scan say how old it is** (`ScanFreshness`, rule `scanFreshness`): the
  Capital planner, Hub arbitrage and Reprocessing's scanner. Nothing else refreshes that data,
  and the user worried about acting on an old scan. The scan records when a quick and a deep scan last *ran
  to the end* (`cache.runs`; a stopped scan doesn't count). Under 6 hours is a quiet line; over 6 an amber
  warning; over a day a red one; each with when a deep scan last finished, flagged if never or over a week,
  and a link to Prospects. Scans from before finishing times were kept are judged by the newest price in the
  cache. A deep scan that finishes says so, as a system notification too when browser notifications are on,
  since it's left running. A cloud full-market scan (`runs.cloud`) is fresh for `CLOUD_FRESH_HOURS` (30): it
  runs daily and the watch keeps the best candidates' prices live, so a 6-hour warning would fire every afternoon.
- **The cloud reads the whole market once a day** (`worker/src/scan.ts`, `hist.ts`, `scanTimes.ts`). The user
  thought Deep scan already did ("i thought deep scan checks the full market which is what I wanted it to be in the
  first place"): it samples ~15% of the order book, Quick ~5%. The Worker reads all ~405 pages of The Forge's book
  at 11:25 EVE (after ESI's 11:05 history), folds Jita's orders into per-item book summaries (7 levels a side,
  exact order counts, what live orders sold, NPC sellers), gates on a spread over 4% one tick inside the best
  (`MIN_GROSS_SPREAD`: nobody's fees are under ~4.4%), adds the 300 busiest, and checks history for all of them
  (~15,000 on 27 September 2026; 13,331 had trading history). Measured locally: 23 s for the pages, 153 s in all,
  16 MB to download (3.5 MB gzipped), Prospects renders it in under half a second. Browsers take it whole
  (`adoptCloudScan`, replacing rather than merging) when it's newer than their own scan; `/v1/scan` is streamed
  from the stored JSON so the Worker never holds it. Stored history rows are ~10 KB each and **all expire at
  11:05**, so `eachHistory` reads an expired copy only for an item whose fetch fails: loading them up front as a
  fallback would be 80–150 MB on day two, past the Worker's 128 MB. A run stops starting fetches after 11 minutes
  (`TIME_BUDGET`, under the 15-minute cron limit), saves what it has as `partial`, and the hourly check (7 past)
  carries on. `[limits] subrequests = 30000` because the default 10,000 doesn't cover it. Settings → Market scan
  shows the last run, the next, and live progress (`scan_meta` 'progress', written every 10 s; polled every 5 s
  while one runs, every minute otherwise, only while something shows it).
- **The Sniper finds mistake listings from the whole book, and doubts before it trusts** (`lib/snipe.ts` pure,
  `worker/src/snipe.ts`, cron `1-59/5`). The user buys fat-fingered listings by hand and relists them; this looks
  for them. ESI refreshes The Forge's book at about :x0:30 and :x5:30, so the sniper runs a minute after (reading a
  book ~30 s old, not the ~4.5-minute-old one the */5 round sees), skips when `Expires` says nothing changed, keeps
  each item's cheapest 30 Jita sells and best Jita bid, and judges only items whose cheap end has a gap that pays at
  the best rates (3,565 of ~15,000 on the first read) against the daily scan's stats. Resale is one step under the
  next listing, never above `reachedAsk`: thin books list far above anything that sells. **Researched on the live
  book before building** (28 September 2026, 00:26 EVE): 196 listings 5%+ under where their item trades after fees,
  61 worth 1 M+; the biggest on paper were floods, not mistakes (seven R.A.M. blueprints at exactly 296,000/382,000
  against 600k–1M history, 11–20 days of trading, days old), so `doubts` sets aside a flood (> 3 days of the item's
  trading), a price that just moved, a thin history (< 7 of 30 days), a listing priced > 24 h ago, and several sellers
  at the cheap end; doubted ones are shown, never mailed. Persistence, same night: of 31 priced within the hour, 10
  were gone 20 minutes later, 3 of the 4 worth 1 M+ were not, so five minutes is fast enough to matter; region-range
  bids elsewhere in The Forge paying more than Jita's cheapest ask: 0 of 7,516, not pursued. A Jita bid above the
  cheapest Jita ask can't persist (it matches), so the bid side is only "a bid well over where it trades, for what
  you hold in Jita" (`judgeBids`, `min_volume` honoured), and `/v1/snipes` returns bids only for the caller's items.
  The bar (default 10% and 5 M after fees, the user's choice) lives in the alert settings (`snipeMinIsk`,
  `snipeMinPct`) and drives both the page and the mail; alert kind `snipe` ("Mistake listing") is mailed by default,
  through `mailFindings`, which the alert round now shares. "Priced" is ESI's `issued`, which a price change moves.
  **Snipes you take are found in your wallet** (`lib/sniped.ts`): a purchase from a listing in Jita (the escrow
  fact above) at 5%+ under where the item had traded in the 14 days before, after your fees then; buys of one item
  within 30 minutes are one snipe; the cloud's sightings (`snipe_seen`, 30 days) mark which the Sniper found. Each
  item is followed by its **own units only** (`followSnipe`): the first sold after the snipe count as its own, sales
  beyond them show as "+N you already had", listing fees are those of sell orders placed after the snipe shared by
  units, and sales tax is what was matched to each sale. It first used `computePosition` on a virtual position, which
  follows every trade of the item: the user's C-IR Compact Guidance Disruptor read "10 of 3 sold" (7 were loot they
  already had) and those 7 were costed at the snipe's price, crediting it with their profit. So the real fees count: the user's first Sniper relist
  was fat-fingered at 1,893,000 instead of 1,893 on 19,489 units, a ~468 M broker fee on a 20 M snipe, and "Your
  snipes" shows that as it is. The Relist at price has a copy button so the price is pasted, not typed.
  **"In the end" is profit, and says what comes back** (29 September 2026). The user read "ISK put in 1.25 B" beside
  "In the end +255.56 M" as getting 255 M back ("there is no way that I am going to get that little back") and
  suspected the refunded fat-finger fee. Recomputed from their ledger outside the page, every figure matched (1.25 B,
  +291.05 M, +83.58 M, +255.56 M) and the Uranium Charge's listing fees were 595 k, not 468 M. So the tiles now say
  Paid for them, Profit so far and Profit in the end, the last with "About 1.51 B back for the 1.25 B". **Not a snipe**
  (the synced `notSnipes` doc of trade IDs, `instantBuys`' fourth argument): a purchase bought cheap but not as a snipe
  (to use, or for a job) leaves Your snipes and List loot's snipes kind, beside its name, with "It was a snipe" under
  Not snipes to put it back. Cost-of-stock still reads it as bought from a listing (orderCheck passes no list).
  **Bought in one go with other items is never a snipe** (`notSnipeIds`, the Wallet's `multibuys` rule: 3+ purchases of
  2+ items, each within 2 s of the last). The user marked five not snipes and asked whether they were fitting buys: two
  were (a 1MN Y-S8 Compact Afterburner and a Salvager I, bought with 8 other items across 23:08:04–05 on 28 September and
  now inside a ship); the others were a SKIN (activated, so never held), a guidance disruptor and some Scorch L, each
  bought alone, which no rule can tell from a snipe. On their ledger the rule also took out a Warp Core Stabilizer II
  bought with five other items (8.67 M), and nothing else: none of the 15 real snipes had another item within minutes.
  **Nor is anything now fitted to one of your ships** (`notFitted`, the stock record's `fitted`: units in a high, mid,
  low, rig, subsystem or service slot of any ship you own, charges loaded in guns included). The user's rule: "if an item
  is fit to a ship either quickly or later then it wasn't a snipe". It takes as many fitted as the snipe bought, so a
  module you already flew and then sniped more of to sell, or a few charges loaded from a big ammo snipe, don't clear it.
  Assets are read hourly by the cloud and on each sync, so a fit shows within the hour.
- **"Place and leave" prices a plan behind the front on purpose** (`ProspectFilters.patient`, the planner's Pricing
  choice). The user's longer-term strategy is large orders in many items that fill over weeks, without the 0.01 war.
  Both sides are priced where the bulk of trading reached on half the last 14 days (`reachedBid` / `reachedAsk`, the
  same as a position's "List patiently"), **wherever the front is**: not capped at one tick over the best bid, since
  on the scoop and Hammerhead II the front bid sat below where trading reached and was the one that never filled.
  Each side's pace is scaled by the share of days trading reached its price (`throughput(..., reach)`), which is
  rough and says so; since 9 October 2026 what a plan expects is scaled by how often each item's prices came round within
  the horizon (below). Items without the days to say where trading reaches are left out, never priced at the front.
  The mix now shows Buy at and Sell at.
- **"Market moved" says when today's book has left Place and leave's prices** (`marketMoved`, `marketMovedSaid` and
  `MARKET_MOVED` 0.05 in prospects.ts; flag `marketMoved`, on Place and leave only; `MOVED_FLAG` in planner.ts). Place and leave
  prices both sides on the fortnight wherever the book is (the recent window was left off it on purpose). The user's
  second plan (2 October 2026, 15:36 UTC) showed what that costs once the market has moved: within the hour a third of
  it sat where the market wasn't. Fallen: bids far over today's best bid, or at the cheapest listing, which buys at once
  (Raging Dark Filament at 1.711 M against 1.44 M; Imperial Navy Infiltrator's 1.658 M over a 1.608 M listing), with
  sales over today's listings; spread gone (Gravid Modulated Strip Miner Mutaplasmid to sell at 13.8 M, listed at 11.31
  M); risen: bids 8-17% under today's best (Compressed Fullerite-C84 at 7,639 against 9,250; ~122 M in escrow on six).
  Now, on the book the planner is given (the scan's, live for the items the cloud watches), an item is flagged when the
  patient bid is more than 5% under or over today's best bid or at or over the cheapest listing, or the sale more than 5%
  over the cheapest listing. Its tip says which side moved, by how much and against what. (It was a flag, not an
  exclusion, which Leave out flagged items dropped, until 9 October 2026: below.) **It flags close to half**: on the cloud's 2 October scan at the user's settings,
  80 of 176 Place-and-leave candidates at 12 hours (45%: 37 sales over, 31 bids under, 25 over, 4 buying at once) and 421
  of 894 at 7 days (47%), the same with or without the watched books laid over the scan's. With the switch on, the
  12-hour pool goes from 109 to 69 and its mix from 144.5 M a day to 130.4 M; the 7-day from 100.3 M to 55.3 M, 4 of its
  6 items moved. On the live books at 17:00 UTC (the user's own orders taken out), 11 of the plan's 33 items flag on its
  own prices, and 8 of the 28 the planner still prices: every one listed above but Raging Gamma Filament, whose book
  moved again (`.playwright-mcp/plan-fixes/`).
- **Place and leave leaves Market moved out by default** (`MOVED_FLAG`, `plannerPool`'s `keepMoved`, `moved` and `movedOut`
  in planner.ts; "Keep items whose market moved" on the planner, shown with Place and leave, off by default, kept per
  browser; the user chose it from the plans review, 9 October 2026). The review: the 11 items the flag carried on the 2
  October plan, already flagged on the 11:25 scan before the plan started, settled −6.0% per ISK at the 9 October bids
  against −2.5% for the other 22; leaving them out would have saved about 6.9 M (3.7 M at listing prices). The flag acted
  only with Leave out flagged items on, which was off. Now it's left out whatever that switch says, and the mix says how
  many ("1 left out because its market moved"); the switch brings them back with their flag. **Its own rule, not one of
  `SWITCH_EXCLUDES`**, so each switch decides its own flags and none is counted twice: a moved item left out is counted
  under Market moved alone, and Leave out flagged items, on, takes a kept moved item out only for another flag. An empty
  or short mix names what each rule left out, with Keep them / Switch it off. At the front nothing changes: only Place and
  leave carries the flag. **Measured on the 2 October plan's start** (`.playwright-mcp/plan-review-fixes/
  measure-moved-default.mjs` and `.json`: the 11:25 scan, the flow read at 13:34, the user's settings and filters of that
  day, 1 B, 25% cap, 12 hours, as of the plan's start; slots don't bind at 66 or 200): 80 of 175 candidates carry it (81 of
  176 with the watched books of 16:55 laid over), and the default leaves out the same 11 plan items, by either book: Gravid
  Modulated Strip Miner Mutaplasmid (sale 13% over the cheapest listing), Gravid Ballistic Control System Mutaplasmid,
  Experimental Hyperspatial Accelerator, Entropic Radiation Sink II, AG-Composite Molecular Condenser, Compressed
  Fullerite-C84, Vigor Compact Micro Auxiliary Power Core and Chaotic Exotic Filament (bids 6–17% under today's best),
  Proximity-5 'Extraction' Filament and Raging Dark Filament (bids 14–19% over it, sales over the cheapest listing),
  Imperial Navy Infiltrator (bought at once). The mix's expected ISK a day falls from 171.18 M (30 items) to 129.32 M (26),
  168.08 M to 131.49 M with the watched books: a moved item looks best on paper, the fortnight's spread against a book that
  has left it. What comes in instead isn't proven better: Republic Fleet Commander Insignia II and Compressed Veldspar
  II-Grade, among the 7 added, are bids the market rose away from within the week (the review), and the expected figures
  are the planner's own pace, which the same review found far too high for Place and leave.
- **Place and leave expects what history says of each item's round trips within the horizon** (`roundTripCounts`,
  `roundTripRate`, `roundTripSaid`, `ROUND_TRIP_DAYS` 1/3/7/14/30, `ROUND_TRIP_STARTS` 60, `ROUND_TRIP_MIN` 20 in
  prospects.ts; `roundTrip` and `roundTripOf` on the stats; `Prospect.roundTrip`; `mixRoundTrips`, `mixRoundTripsSaid` and
  `plannerPool`'s `unmeasured`, `tripFew`, `noTrip` in planner.ts; the user chose it from the plans review, 9 October 2026).
  The 2 October plan (12-hour horizon; the user remembered it as 7 days) expected +67.6 M within 12 hours: the planner took
  each side as reached on half the days. The review re-ran Place and leave's own pricing on each of its 33 items' 60 days
  before the plan (`.playwright-mcp/research/plans-review/backtest.mjs`): its prices round-tripped (the bid reached by a
  day's low, then the sale by a day's high, that day or later) within a day on a median 7% of start days, 3 days 21%, 7
  days 39%; the cloud's leave_track had 24 of 30 plan bids followed a day or more fill nothing. Now:
  - **`statsFrom` counts them** from the history it already has: on each of the last 60 start days to the stats' 14 days'
    end, the bid and sale Place and leave would have priced that morning (`reachedBid` / `reachedAsk` of the 14 days before,
    ending where `recentRange` ends them, two days back when only that one traded), and whether they came round within 1, 3,
    7, 14 and 30 days; a start day counts for a horizon only once the whole horizon has happened, and one whose fortnight
    can't price both sides isn't counted. Two arrays of whole numbers aligned with `ROUND_TRIP_DAYS`, trips and start days
    counted. It matches backtest.mjs start day for start day (the 33 items, three horizons; tested on five of them,
    `scripts/fixtures/round-trips.json`, and on a market that skips days against the backtest done the plain way, which
    fails with the two-days-back ending planted away). The cloud's daily scan and the browser's scans both get it through
    `statsFrom`; a browser scan re-reads the history of stats without it (`statsCurrent`).
  - **A horizon of a day or less is the same day**: history is daily, so 4 h, 12 h and a day count a day that reached both
    prices (said so in the row's tip and the start dialog). A horizon between two counts is credited with the shorter.
  - **The expectation is scaled, never the margin**: a Place-and-leave prospect's return a day and ISK a day, and each mix
    row's ISK a day, are times its rate; `roi`, `net`, the size and Turns in stay what one round trip makes and takes, so
    "Return ≥ %" stays per trip and a plan's floor (`planTargets.expected`, Keep it) doesn't move. At the front: unchanged.
  - **Not known is never 0% or 100%**: stats from before the count (`unmeasured`) are left out and "Scan again before
    investing" says so; fewer than `ROUND_TRIP_MIN` start days priced (`tripFew`), and a measured 0 within the horizon
    (`noTrip`, which a 0 return would otherwise have dropped unsaid), are left out and counted in the mix's line, and an
    empty mix names them. Until the first cloud scan after a deploy, Place and leave's mix is empty and says why.
  - **Said**: a Round trip column ("45% of days", within 3 days; the tip "Round trip within 3 days on 45% of past days: 26 of
    the last 58 days" and how it's counted); the line over the mix ("About 3 of these 27 round-trip within 12 h, history
    says: 12% of the last 60 days, weighted by the ISK in each (5% to 22% an item)", with the profit expected against the
    profit if every one came round); the Expected ISK a day tile; the start dialog's lead.
  - **The plan's horizon wherever the plan is named** (`planHorizonSaid`, `planLabel` in plans.ts: "a 12-hour plan", nothing
    for a horizon not kept, which `sanitizePlans` reads as 0): the start dialog's lead ("2 items, 257 M ISK in buy orders, a
    3-day plan (Place and leave)"), the checklist's title, the Plans panel ("Place and leave, a 12-hour plan"; it read "0 h
    horizon" for a plan without one), its list part, To do's place, list and close items ("Part of 2 Oct · 999.16 M ISK in
    33 items, a 12-hour plan."), the position page's "The plan sells at", Orders' plan chip and the hangar check's plan tip
    (the chip itself keeps the name alone).
  - **Measured** (`.playwright-mcp/plan-review-fixes/measure-round-trips.mjs` and `.json`/`.txt`: the cloud's 2 October scan,
    each candidate's Forge history from ESI cut to before 2 October, the user's settings and filters, 1 B, 25% cap, 66
    slots). The 2 October plan's own 33 items and units: expected +67.58 M before, +5.77 M within 12 hours after (+14.81 M
    within 3 days, +25.80 M within 7). Like for like, the 7-day +25.80 M against the +4.67 M it realized by 9 October, a
    week on: still about five times over, though nearer than +67.58 M in 12 hours. The planner's mix at the plan's start, 12 hours:
    26 items and 129.32 M a day before, 27 and 14.19 M a day after (+6.45 M expected within 12 hours against +56.51 M if
    all came round; 22 candidates never came round the same day in 60 days, 1 too little history; 18 of the plan's items
    in it, 20 before); 3 days: 33 items, 58.38 M a day → 22, 15.18 M; 7 days: 5 items by ISK a day, 54.44 M → 28 by return,
    14.47 M. History still overstates the week after the plan: its rates summed to 2.7 of the 33 within 12 hours, 7.0 within
    3 days and 12.0 within 7, against 0, 0 and 2 that came round by the count's own rule (a day's low at or under the plan's
    bid, then a high at or over its sale, by ESI's days from placing); the review's 6 within 7 days are the round trips the
    user traded (one at a loss), which also counts sales under the plan's price. The markets moved away from the
    fortnight's prices (limits.md). Cost: 57 µs an item on top of statsFrom's ~830
    (1,721 histories of up to 396 days), 0.8 s over the scan's 13,434 items; 58 bytes an item stored, 0.78 MB on the
    scan's 17.2 MB of stats and books (4.5%).
- **Orders you're leaving aren't told to get back in front** (`Data.leave`, a synced doc of type IDs; `leave` in
  `adviseRelist` / `judgeOrder`). Without this the first patient order would have been told to move by Orders, To do
  and the cloud's mail within the hour. A left order behind the front is `wait` with "You're leaving this one", raises
  no "beaten but clearing" alert, and shows no Move to / Costs you. What still speaks is trading no longer reaching
  its price: a buy is moved to `reachedBid` (still behind the front, unlike an ordinary buy, which goes to the front
  when that is above where trading reaches) or told to cancel; a **sell you're leaving** gets the same test against
  the highs (`askReachDays`, moved to `reachedAsk`, or `loss` when that sells under cost), which other sells don't.
  `fillingNow` now reads sells too (a listing that shrank at its price, or your own sale at or above it). Set from
  the planner for a whole plan in one click, or per item on Orders ("Leave alone" / "Leaving it"). From three days of
  trading since an order was first placed it's judged on those days too, since the last 14 hold days before it existed:
  reached on none of them, it's told to move, cancel or keep it (the 8 October rule), a move or a cancel on To do too
  (market-reading.md, "A left order is judged on the days since it was placed"; orders-alerts.md).
- **A plan's Leave alone covers its own orders, and ends with the position** (`isLeft`, `leaveForPlan`, `planLeaveSince`,
  `leaveByHand`, `stopLeaving`, `leaveAfterClose`, `leaveAfterDelete`, `releaseOrphans` in plans.ts; the synced `leaveFrom` doc, type ID to time, beside `leave`, which stays a
  plain list since older browsers and a Worker a version behind read it; the plans review, 9 October 2026). `leave` was by
  item, so starting the 2 October Place-and-leave plan left the 30 September at-the-front plan's Clone Soldier Transporter
  Tag bid too (placed 00:43 on 30 September, raised three times): it read "You're leaving this one" from then on, and after
  its position closed on 3 October nothing judged it as a plan's, with 116.9 M in escrow on 9 October. Now:
  - **Starting a Place-and-leave plan** puts each item in `leave` with `leaveFrom` the plan's start; such an item's orders
    are left only when first placed (`seen[0]`, never `issued`, which a price change moves: that bid's last raise was after
    the plan) at or after it less the checklist's two minutes (`SLACK_MS`). For an item whose position the plan counts
    whole (`planCountsWhole`: opened within the day before with nothing traded), the time is that position's opening
    (`planLeaveSince`), the window in which the checklist counts a bid as placed for the plan: the 30 September plan's
    Key (position 00:35:02, bid 00:36:15, plan 00:41:37) would otherwise have had its bid unleft. An item already left by
    hand stays left whole; one an earlier plan left keeps the earlier time while it's still in `leave`, so that plan's
    orders stay left too; a time for an item no longer in `leave` (an older tab's Leaving it dropped `leave` alone, or two
    devices' writes crossed) is stale and gives way.
  - **By hand** (Orders' Leave alone, the planner's "Leave these orders alone") is the whole item, as before: its time goes.
    Leaving it / Stop leaving them drop both. An order a plan doesn't cover says so in its tip ("This one was placed before
    it, so it gets the usual advice"), and Leave alone on it leaves every order of the item.
  - **Closing or deleting a position** takes its item out of both, unless another open position of it is a Place-and-leave
    plan's (a patient plan with an item following it), and the toast says when orders of yours were being left. Deleting
    one already closed doesn't (it let go at its close; again would drop an item left by hand since). Reopening doesn't put
    it back.
  - No `leaveFrom` doc, or no time for an item, is the old rule: every order of a left item. The browser, the order check
    and the cloud's alert round all ask `isLeft`; a Worker a version behind refuses a push carrying the new document, so the
    browser sends the rest without it (`refusedDoc`, cloud.md).
  - **Measured on the review's export** (`.playwright-mcp/research/plans-review/leave-per-plan.mjs`, replaying the 2 October
    start, the CNMGC left by hand on 3 October and every close since, judged on ESI's books of 9 October): of 60 open Jita
    orders, left 24 → 22. The Clone Soldier bid (by both rules) now reads "71 ahead of you, about 43 h of waiting", move to
    29,720,000, where it read "You're leaving this one"; and Datacore - Rocket Science's 2,628 listed at 94,420 on 1
    October, the earlier trading's on the position the plan took over, gets the usual advice (move to 90,890). The plan's
    own 12 bids and 9 listings stay left, as does the CNMGC left by hand.
  - **Once, for a ledger from before `leaveFrom`** (`releaseOrphans`, `releaseOrphanLeave` in store.ts; the coordinator's
    ruling, so the review's own orphan is released): when the stored ledger had no `leaveFrom` doc, every item left with no
    time that a Place-and-leave plan names gets the close rule (let go unless an open position of it is a patient plan's).
    It never touches an item no patient plan names (loot or the CNMGC left by hand) and makes up no time for one it keeps.
    It runs after the cloud sync's first pull of the visit, so it acts on the cloud's `leave` rather than a copy kept from
    before another device changed it, and pushes `leave`; with the sync off, at once. Done is the `leaveFrom` doc written,
    empty or as it was, which stays in the browser (a change only to it isn't pushed). On the review's export: 13 of 34 types
    let go, none with an open position; of the open orders only the Clone Soldier bid stops being left (24 → 23), its 116.9
    M escrow judged again (`release-orphans.mjs`). Rocket Science's 1 October listing stays left: no time is backfilled.
    **Residual risk**: each browser runs it once, at its own first load of this version (a new browser too: its empty store
    had no `leaveFrom` either), so a plan item left by hand again after its position closed is let go again by another
    browser's first load. A browser whose pull fails waits rather than act on its own copy. The page check (`plan #orders
    (leave from before leaveFrom)`) loads such a ledger with the cloud stubbed: Clone Soldier let go after the pull, `leave`
    pushed, `leaveFrom` not; loaded again with it left by hand, nothing changes.
- **When order slots run out before the ISK, the planner fills by ISK a day** (`allocate`, `Plan.ranked`/`other`). It
  filled best return per day first, which is right while slots are spare, but with few free slots a small market paying
  4% a day on the 20 M it can take earns less than a big one at 2% on 150 M, and most of the ISK sat idle. The user asked
  that it "fill the given slots" intelligently (29 September 2026). Now, when the slots run out first, the mix is also
  filled by what each item makes a day, and whichever earns more a day is kept; the page says which and what the other
  would have made. Test: 1 B, 10 slots, six small and six big markets: 750 M in the five big ones for 5 M a day, where
  best return first put 100 M in the small ones for 1.33 M.
- **The planner sizes each item after what you already have working in it** (`workingUnits`, `PlanInput.working`,
  `Allocation.takes`/`working` and `Plan.filled` in planner.ts). It sized each item by what its market takes in the horizon
  (`absorbs`) and only marked items you already trade ("Already trading … on top of that"), so a second plan on an item
  the first already bids on was sized as if the market were empty; the user approved sizing after it (2 October 2026).
  Working, in units: your open Jita 4-4 orders' units left, buys and sells, plus the Jita hangar (`d.stock.jita`; one not
  read yet counts as nothing, and the mix says so), all of it using the same flip capacity. `allocationFor` takes
  `absorbs − working × buy` before the cap and the ISK left, and an item with nothing left gets no row. The "Already
  trading" tip says what you have and "this plan takes what's left: N of the M units the market takes in your horizon";
  the mix line counts the items left out because your orders and stock already fill them. Measured on the user's 77 open
  orders and hangar at 17:00 UTC, a fresh 1 B plan on the cloud's 2 October scan with 52 free slots: Place and leave at 12
  hours went from 26 items, 741 M and 139.6 M a day (as if every market were empty) to 18 items, 722 M and 101.7 M a day,
  28 left out as already filled (mostly the second plan's own items, their bids open), 2 shrunk and 10 others brought in;
  at 7 days nothing moved (a week of each market takes far more than the cap per item); at the front at 7 days one item
  dropped for another, 53.4 M a day either way (`.playwright-mcp/plan-fixes/measure-working.json`).
- **"Start this plan" turns a mix into positions and a placing checklist** (`lib/plans.ts` pure: `newPlan`,
  `planPlacement`, `planProgress`; `PlanStart.tsx`; the synced `plans` doc; To do kind `placeBuy`). The user wanted to place
  a plan's buy orders "in one go" by import or API, since Multibuy has an import. Researched on 29 September 2026: ESI
  places no orders, and Multibuy only buys at once from listings at the ask ("multibuy only offers immediate buys", CCP),
  which would throw away the margin the plan is priced on (patient bids where trading reaches). So one click: a position
  for every item (or the one already open), grouped as one plan; "Leave alone" for a Place-and-leave plan; and a checklist
  on the planner and in To do where each item opens in game with its price copied, its quantity one more click, and ticks
  off once a buy order for it in Jita 4-4 shows in your orders (placed since the plan, or just before it: below). Positions has a
  Plans panel with each plan's bought, sold, profit and stock, and a filter to its positions; removing a plan leaves the
  positions. Checked end to end in a test browser on the cloud's real scan (13,442 items): a 998.97 M plan of 5 items,
  5 positions, the checklist, the Positions filter and To do.
- **The checklist counts an order placed just before the plan, and sums what it counts** (`planPlacement`,
  `placementNote`, `BEFORE_PLAN_MS`). The user's first plan (30 September 2026): the Vigilance Resonance Key's position
  opened 00:35:02, 15 bid at 00:36:15, the plan for 16 at 00:41:37; the item showed unticked, so they placed 16 and
  cancelled the 15, losing its 4,679,391 ISK fee. Counted: every buy since the plan, and the newest placed before it since
  the item's position opened, when that was within the day before (`POSITION_BEFORE_MS`), else within the hour; any order
  unless cancelled with nothing filled. A filled one is expired or closed, and counting only open ones put the item back
  on "Not yet" and To do within the plan's week. Units are summed and said ("16 of 16 placed (15 before the plan)"): one order's alone read "1 of 16 …
  the 15 more is a new order" after the top-up its own note advised (final review). A shortfall says EVE can't change a
  quantity, so the rest is a new order with its own fee, or leave it; never replace. A plan reusing a position opened weeks
  before gets only the hour: reaching back to the position's start would count a bid from then, filled long since.
- **The checklist counts a bid that bought at once, by its trade** (`boughtAtOnce` and `PlanTrades` in plans.ts, `atOnce`
  in `placementNote` and `judgePlaceBuy`). The user's second plan (2 October 2026): its Imperial Navy Infiltrator bid, 11 at
  1,658,000, was over the cheapest listing, so it bought 11 at 1,608,000 there and then (Raging Gamma Filament the same, 3
  at 9,007,000). An order that fills on placement is never among your open orders: ESI lists it only in your order history,
  cached an hour, expired with nothing left. The checklist and To do kept asking for it, and the user thought them broken.
  Now your Jita 4-4 buys of the item since the window's start count too, Personal ones left out, less everything the
  counted orders have filled (a bid that bought from listings paid their prices, not its own), so a trade with no order
  behind it yet counts and, once the order arrives from history, its fills explain the trade and nothing counts twice. A
  bid of yours from outside the window that fills inside it fills at its own price, so trades at its prices since it was
  placed are its, up to what it filled: Clone Soldier Transporter Tag's 4-unit bid from the 30 September plan was still
  open under the 2 October plan, and its fills would have ticked the new plan's item off. The checklist says "11 of 11
  bought at once at 1,608,000" and that the order shows only in your order history; To do "Bought at once: 11 at
  1,608,000." An uncounted bid placed inside the window (an older one before the plan: only the newest counts) filled
  only there, so its fills come off at any price, its own or the listings': two bids before a plan, the older having
  bought 5 at once, read 15 placed for 10 (the review). And a bid that bought some at once leaves the rest standing,
  which ESI shows up to 20 minutes late (`ORDERS_LAG_MS`): until its trade is that old the note says the rest may still
  be standing, never that it is a new order to place, which would invite the duplicate the checklist exists to stop.
- **A plan item you cancelled or closed isn't asked for again** (`planItemState`, `droppedNote` and `planProgress`'s
  `dropped` in plans.ts; `placeBuyItem` and `judgePlaceBuy`'s `dropped` in todo.ts; the checklist in PlanStart.tsx). The
  user (8 October 2026): "The todo told me that i needed to close orders for a position in plan that is no longer going to
  be feasably reached. I then closed them … but then later it said I should open those positions again." The 2 October
  plan's Fierce Exotic Filament (9 at 2,813,000), Experimental Hyperspatial Accelerator (1 at 11,490,000), Entropic
  Radiation Sink II (8 at 1,976,000) and Chaotic Exotic Filament (2 at 21,470,000) were told "Cancel it", cancelled with
  nothing bought and their positions closed at 10:14 UTC; a bid cancelled unfilled counted as never placed and nothing
  looked at the position, so within the plan's week To do asked for each again, at the price just judged unreachable.
  Now each item is, in this order:
  - **placed**: a counted order or a bid that bought at once, whatever its position did since (five of that plan's items
    filled, sold and were closed: they were placed, not dropped);
  - **closed**: nothing placed, its position closed or deleted (or following another item);
  - **cancelled**: nothing placed, and a Jita 4-4 buy of it was cancelled with nothing bought, placed since the plan
    started (less SLACK_MS) or since its position opened when that was within the day before the plan. Not
    `planPlacement`'s fallback hour before the plan: ESI doesn't say when an order was cancelled, and the review (8
    October 2026) found that a bid placed, cancelled, and then a plan started with the item never asked for it (limits.md).
    So the checklist names the bid ("Your bid of 9 at 2,813,000 ISK, placed 2 Oct") rather than a date. A new bid placed
    after it counts as placing it, as ever: re-placing at another price;
  - **skipped**: nothing placed, and you pressed Skip it, offered when today's book had moved from the plan's prices (the
    next bullet; 9 October 2026). Read like cancelled: closed and cancelled come first, and a bid placed for it anyway
    counts as placing it;
  - **open**: still to place. An expired bid with nothing bought isn't a choice, so it reads as nothing placed and is
    asked for again; with no position named (`positionId` null) or no positions given, nothing reads as closed.
  Closed, cancelled and skipped are **dropped**: no "Place a buy order" item; one already listed is done, "You cancelled the bid, so
  the plan doesn't place it again." / "You closed its position, so the plan doesn't place it." (deleted likewise); the
  checklist greys the row ("Bid cancelled with nothing bought: not placed again", "Position closed 8 Oct: not placed
  again") and counts them apart ("2 of 5 placed, 2 dropped", the Plans panel likewise); a plan with nothing waiting stops
  showing as being placed. The list step already treats a closed position as no plan's (`planTargets`), so a cancelled and
  closed item has no list row and no To do item of any kind. The page check's shared-position plan case carries one of
  each (Fierce cancelled with its position open, Chaotic cancelled and closed).
- **The checklist re-checks each bid against today's book before you place it** (`placeMoved`, `placeMovedSaid`,
  `skipPlanItem`, `PlanItem.skipped` in plans.ts; `usePlacingCheck`, `skipPlaceBid`, `unskipPlaceBid` in
  components/planListing.ts; `placeBuyItem`'s `moved` and `TodoItem.skip` in todo.ts; the user chose it from the plans
  review, 9 October 2026). The checklist asked for every bid at the plan's price however far the book had moved since:
  Raging Dark Filament's 1,711,000 sat 19% over a best bid of 1,440,000 within the hour of the plan, and bought into the
  fall (−13%). Now each bid still to place in a plan of the last week is read against its live Jita book, others' orders
  only (`listMarket`: your own bid on the item, another plan's, is never today's best bid), every five minutes while the
  checklist or To do is in view and on coming back into view, sharing the list step's reader (`useItemReads`, the books
  cached and shared in flight). **Moved is Market moved's own rule** (`marketMoved`): the bid more than 5% under or over
  today's best bid, at or over today's cheapest listing, or the sale more than 5% over it. The bid over today's best bid
  (the market fell, so it would pay more than buyers bid) is Raging Dark's own case, and one definition of moved serves
  the planner and the checklist. Moved, the row says "Not yet. The market has
  moved since the plan priced it" with a line a side and today's figures, and offers **Skip it** ("or place it anyway at
  the plan's price"); To do's "Place a buy order" item leads its detail with the same lines and has Skip it under it. Not
  moved, or before its book is read: as before. A book that couldn't be read: "Not yet", and that it isn't checked against
  today's market. **Skip it** keeps when and the best bid and cheapest listing it read (`skipped` in the synced `plans`
  doc, kept by `sanitizePlans`), so the greyed row says why after the book moves on ("Skipped 9 Oct: the market had moved",
  "When you skipped it, the best bid was 1,440,000 ISK and the cheapest listing 1,741,000 ISK, against the plan's bid of
  1,711,000 ISK and sale of 1,983,000 ISK. Not placed again; a new bid would count as placing it.") with **Place it after all**, which undoes
  it while the plan has other bids waiting (a plan with nothing waiting stops showing its checklist, as after a cancel).
  The item is dropped; To do's item is done, "You skipped it: the market had moved from the plan's prices." **A skip lets
  go of the item, not only the checklist row** (the coordinator's ruling on review, 9 October 2026): its position stays
  open, and first shipped that way `planTargets` still gave the item to the plan and its Leave alone stayed, so every later
  order of the item read as left alone and was guarded at the plan's old prices for as long as the position stayed open,
  the Clone Soldier kind Leave alone per plan had just fixed. Now:
  - `planTargets` (Orders, To do, the list step, the hangar check, the position page, and the cloud's alert round, which
    reads the skipped items' orders of any state to tell) holds no plan for an item while it's skipped with nothing placed
    for it; once a bid counts as placing it (`planPlacement`) it's the plan's again;
  - skipping a Place-and-leave plan's item ends its Leave alone by the close rule (`leaveAfterSkip` over
    `leaveAfterClose`, where a skipped item no longer holds the item): unless another Place-and-leave plan's open position
    holds it. Only what a plan left: an item left by hand (in `leave` with no time) stays left; an at-the-front plan left
    nothing. **Place it after all** leaves it again as starting the plan did (`leaveAfterUnskip` over `leaveForPlan`, from
    the plan's start or the position's opening when the plan counts it whole). A bid placed after a skip without Place it
    after all is the plan's again for its prices but isn't left alone: Leave alone is given back only by that button;
  - To do offers **Close position** for the skipped item's position when the plan counts it whole (opened for the plan,
    nothing traded before) and nothing has traded in it, no order of yours is open on the item and no other plan on it is
    still to place or placed (`skippedEmpty`, `skippedEmptyItem`, version `skipped`): "You skipped it on 2 Oct · …: nothing
    was bought and no order is on it." `finishedPosition` can't see it (no order was ever placed). Never for a shared
    position (Rocket Science's). Put back on the plan, it's done: "You put it back on the plan: place its bid from the
    checklist."
  - The checklist stays up for the plan's week while an item is skipped (`planProgress`' `skipped`), so Place it after all
    stays in reach after skipping the last bid waiting.
  The toast says so: "the plan won't ask for it again, and its orders aren't left alone any more. Its position stays open;
  To do offers to close it if the plan opened it and nothing's in it." A book that couldn't be read is said on To do too
  ("Its Jita book couldn't be read, so it isn't checked against today's market."). With both planner switches on, "Keep
  items whose market moved" says how many of those kept Leave out flagged items still takes for another flag (`movedIn`).
  To do's version stays `'1'`: the read moves every five
  minutes, and a hand tick reopened each time it crossed the 5% line would nag. Not mailed: the cloud doesn't read plan
  bids not yet placed. The page check's shared-position plan case serves Raging Dark Filament's book at the plan's hour,
  asserts the checklist's and To do's words, skips it from To do, sees it dropped on the checklist ("2 of 6 placed, 3
  dropped") and undoes it there; Fierce Gamma Filament's book is refused and says it wasn't checked, on the checklist
  and To do. Seeded with the plan's Leave alone on both, it asserts the stored `leave`/`leaveFrom` drop Raging Dark (only)
  on the skip and get it back from the plan's start on Place it after all, and To do's Close position for its empty
  position. The cloud's round is tested on D1 (`scripts/check-worker.mjs`): skipped with nothing placed, Praxis's bid is
  judged as any order and mailed; skipped but its bid counting as placing it, the plan's guard holds.
- **The checklist's second part lists what the plan bought** ("Bought: list it", the list step: `planListRows` and
  `planListRow` in positions.ts; `listedSince`, `unitsToList`, `listMarket`, `planListPrice`, `planListSaid` in plans.ts,
  Worker-safe; `PlanListPart` in PlanStart.tsx, on the planner and Positions' Plans panel; `usePlanListing` in
  components/planListing.ts; To do kind `planList`). The user asked how to price the sell once a plan's buy fills "so I
  don't mess up the intelligence the plan set out to accomplish", and approved it (2 October 2026): the plan's `sellAt`
  showed only in Orders' Plan chip tip, once a sell order existed.
  - **Stock to list** is what the plan bought and hasn't sold (`planPosition`'s view, so a position it took over counts
    from its start and the earlier stock sells first), no more than the whole position holds off its sell orders (units are
    alike, so the earlier stock is listed first too), and no more than the Jita hangar holds once read. A sell order counts
    from when it was placed, its first version (`seen[0]`), never `issued`: the user's Raging Dark Filament had 1 listed on
    1 October, before its position, repriced after the plan, and by `issued` it hid one of the plan's 10. Units a listing
    since the position opened has filled that no sale records yet still count as listed, or a listing that sold would read
    as stock to list again until its trade came, up to an hour later. Each item is listed under the one plan
    `planTargets` gives it: Clone Soldier Transporter Tag is in both the 30 September and 2 October plans on one position.
    The hangar cap has a cost (limits.md): a hangar read from before a fill reads the item as none, so a filled buy reaches
    the list only at the next assets read (ESI holds them an hour), and its trade has to arrive first too.
  - **The price**: Place and leave lists at the plan's own `sellAt` (list and wait), with today's List patiently beside it
    (`reachedAsk` at FILL_TYPICAL, one step over others' best bid at least, as the position page shows it); at the front,
    today's `listingPrice` on the live book (others' orders only), with the plan's price beside it; never under break-even
    (`underCost`'s: what a unit cost, the buy's fee in, after the broker fee and sales tax). More than `MARKET_MOVED` (5%)
    between today's figure and the plan's, a sentence says the market has moved and which way, and no verdict.
    **Today's cheapest listing counts as well as the fortnight** (`cheapest`, `atCheapest`, `overCheapest` in
    `planListPrice`; the plans review, 9 October 2026): Federation Navy Fleet Captain Insignia I read "+6.1%" at the plan's
    920,100, nothing moved, with List patiently at 915,200 and today's cheapest listing from others 801,200, under its
    826,978 cost. For Place and leave, today's cheapest listing more than `MARKET_MOVED` under the plan's price is the market
    moving down, said with that figure and what the plan's units make there ("sold there, they make −2.32 M ISK after fees
    (−7.6%)"), never "not moved"; and a price to list at over today's cheapest listing says so beside its profit, on the
    checklist ("if it sells over today's cheapest listing") and To do ("… if they sell at 920,100 ISK, over today's cheapest
    listing of 801,200 ISK"). At the front the price is already today's listing price, so only a break-even lift over it is
    said. "Today's cheapest listing" is others' cheapest as it is: `marketBest`'s token-guarded front was tried and read
    Fed Navy's at 919,000, skipping 379 real units from 801,200 (known-bugs.md), hiding the very case; so one unit listed
    far under can say the market moved down (limits.md). The position page's "The plan sells at" reads the same book and
    says when its profit is "at a price over today's cheapest listing". On the review's held items (`liststep-today.mjs`): 5 of 8 Place-and-leave items now say the market moved down (3
    before, by List patiently: Gravid Modulated Strip Miner, Raging Dark, the Infiltrator; now Fed Navy Insignia and
    Raging Gamma Filament, 6.5% under, too), and all 8 profits carry the caveat.
    Nothing not known reads as zero: no book, no front price ("Its Jita book couldn’t be read"); no history, no List
    patiently figure ("No history to say where trading gets up to today"). Each row copies its price, and its name opens
    the item in game with the price copied ("the price to list at" in the tip).
  - **On To do** ("List what the plan bought", Needs action): one item per plan item, keyed `planList:<plan>:<type>`. A
    Place-and-leave item is versioned by its price to list at, the plan's own, so a repriced suggestion reopens a hand tick
    and a fill doesn't. **An at-the-front item is versioned by the units to list** (`units:N`): its price is today's
    listing price, which moves with the front up to every five minutes, and as the version it reopened a hand tick at
    every undercut, the nagging the user's "not too tight" rules out (the review, 2 October 2026). Opening either copies the
    price of the latest build, so the copy is never stale. Neither version waits on the book, so an item is listed before
    its book's first read, saying so ("Reading its Jita book"). It ticks off only when the ledger that dropped it shows the
    stock listed or sold (`judgePlanList`), or when a hangar read newer than the one it was built on holds none of it ("No
    longer in your Jita hangar (read …): moved, used or listed since"): moved, used or fitted, it would never show as
    listed or sold, and stayed "being checked" for good. The item is seen on the hangar read it was built from (To do's
    `seenAt` for the kind), so the read that showed it never closes it. A plan that no longer holds the item (removed,
    its position closed, a newer plan holding it) lets it go unticked. Not mailed.
  - **The books are read for it** (`usePlanListing`), every five minutes while shown and the tab is in view, and once on
    coming back into view: Orders' check reads only items with open orders, and a filled, unlisted item has none. The
    checklist used to show only plans still being placed within their week; a plan with stock to list now shows past both.
  - **Measured on the user's plans** (20:56 UTC, D1 and ESI read-only, `.playwright-mcp/plan-list-step/`): six items to
    list, all the 2 October plan's (Place and leave), 33 units costing 135.3 M, about +9.0 M after fees at the plan's
    prices: the Infiltrator 11 at 1,836,000 (+7.5%; today's listing price 1,608,000 and List safely 1,666,000 are both
    under its 1,708,000 break-even), Clone Soldier 1 at 33.4 M (List patiently 31.49 M today, moved down 5.7%), Raging Dark
    Filament 10 at 1,983,000, Fierce Gamma Filament 4 at 2,486,000, Raging Gamma Filament 6 at 10,030,000, Proximity-5
    'Extraction' Filament 1 at 7,800,000. Five of six read today's List patiently equal to the plan's price because the plan
    was priced on the same fortnight (ESI's history then ended 1 October): it will part as ESI adds days. Rocket Science's
    2,628 on their sell order are the earlier trading's: nothing to list.
- **A price must be reached lately, not only somewhere in the fortnight** (`RECENT_DAYS` 5, `RECENT_MIN` 2,
  `RECENT_TYPICAL` 3 in fills.ts; `bidToPlace` / `askToPlace`'s `window`). That plan bid 270.7 M for a Caldari Navy
  Missile Guidance Computer reached on 5 of 14 days, all mid-September at 260–310 M; since the 25th it traded at 359–375 M
  (1 of the last 5). Praxis's 206.3 M: 4 of 14, 0 of 5; it filled after three raises and lost 1.02 M. Now the front stands
  only when reached on `FILL_RARE` of 14 and 2 of the last 5, else a bid is the higher of the 7th-lowest low and the
  3rd-lowest of the last 5 (`bidBothWindows`; asks mirrored), and the not-reached flags say "not lately" when the recent
  window decided. The Guidance Computer goes to 369.5 M, over its 359.9 M ask, and drops out; Praxis to 210.5 M, ~1.1%,
  out at 3%. Under 3 of the last 5 days traded, the window says nothing (0 of 957 candidates). Place and leave keeps the
  fortnight alone (the ruling: the window took 30% of its candidates).
- **"Ran up lately" keeps a climb out** (`runUp`, `RUN_UP` 0.5): the last 3 days' volume-weighted average against the
  median day of the 30 before, when the latest day is within 3 days; 0 when it can't be said. The Key, ~21–23 M through
  early September then 36–45 M, read +60% (36.55 M on 22.89 M) where `lastMove` read +28%; 40% of the plan's ISK went in
  at a 35.99 M target, and by 1 October its best ask was 29.93 M. The planner and the opportunity mail leave it out (36 on
  the 1 October scan). Stats from before it claim nothing and the planner says "Scan again before investing" until the
  first cloud scan after a deploy.
- **Raises are kept back where the front is beaten twice per fill** (`raisesKeptBack`, `RAISES_RESERVED` 2,
  `RESERVE_WATCH_H` 24, `RESERVE_RATIO` 2 in evaluate.ts). Praxis's book saw 25–36 new bids a day against 7–19 sold into
  bids; its three raises cost 1.58 M on a 2.58 M placing fee, and the planner had counted none. Where the watch (24 hours
  or more in the 14 days, not in a row) saw twice as many units newly placed at the front as filled on a side, 2 changes
  on that side, each k × price × the whole order, come off the margin before "Return ≥ %" and the ranking ("Raises kept
  back"). Not on Place and leave; on Busy markets too. At one-for-one it hit 93 of 94 watched candidates; at twice, 91,
  removing 7, median −1.05%. An unwatched item carries none (limits.md); its tip and the planner's Guide say so.
- **Measured on the cloud's 1 October scan** (13,465 items, the user's rates, the planner's defaults): 957 → 779
  candidates at the front (−18.6%: the recent window −145 and 148 repriced, run-up −36, reserve −7, 7 newly admitted);
  Place and leave 942 → 923 (the run-up); the 25%-cap mix 95.47 M → 77.70 M ISK a day. The planner also follows the
  watched-flow record now (`useFlow`): a plan opened before any page had read it was worked out without the watch.
- **The Sniper leaves blueprints out unless asked** (`splitBlueprints`, `BLUEPRINT_CATEGORY` in snipe.ts; `snipeBlueprints` in
  the alert settings, default off, only `true` lets them in; `worker/src/kinds.ts`, migration 0017 `type_kinds`). The user,
  2 October 2026: "i think for the sniper we should exclude blueprints, as they might be risky to try and sell". Evidence: of
  1,222 sightings since 28 September, 59 were blueprints, 41% of them floods against 9% of the rest, 11 clean; on 1 October
  at 23:27 UTC both finds clearing the user's bar were blueprints (an Epithal and a Thrasher Blueprint), and on 2 October
  at 09:46 26 of 89 listings were. A blueprint is ESI category 9, never a name (a reaction formula is one without the
  word); the cloud looks each listing's type up once (type → group → category) and keeps it, a type ESI didn't answer is
  `null` and held back until known, and a browser on a read without categories looks each up itself (`typeKind`). The mail
  splits before picking its eight, so hidden blueprints can't take their places. "Include blueprints (N)" says how many
  clear the bar and are left out. Hidden blueprints are still recorded as sightings, so the daily "checked against what
  traded after" counts them. **High bids for blueprints you hold follow the switch too** (approved by the user on 2
  October 2026 with the other two choices; they had shown, since selling into a bid is paid at once): the cloud looks up
  each kept bid's category with the listings' (`categoriesOf` on both), the mail splits them the same way, and a browser on
  a read without bid categories looks each held one up and holds it back meanwhile. The switch's count and the "clear
  your bar too, left out" line cover both, each counted apart when there are both (`blueprintsSaid`: "2 blueprint
  listings and 2 high bids for blueprints you hold"), and the held-bids panel says how many it hides, never "no bid"
  alone. Measured on the read of 15:06 UTC and the user's hangar (12 types, no blueprint): 1 held-bid row (a Jackdaw),
  none a blueprint; the reads of 1 October 23:27 and 2 October 09:46 had 0 and 1 (the same Jackdaw). So the evidence is
  the tests' (a Thrasher and a Caracal Blueprint, invented), not the user's own.
- **NPC sellers anywhere in The Forge keep an item out, and cap the Sniper's resale** (`npcAnywhere` on the scan's book,
  `foldPage` in worker/src/scan.ts; `judgeProspect`; `findListing` / `findBid`'s `npc` in snipe.ts). The user asked whether
  skill books "actually buy and sell": 470 were in the scan, none caught by the Jita-only `npcSell`, a median 291% between
  best bid and cheapest ask, while NPCs sold Command Carriers at 2,500 M in other Forge stations (12 orders of 365 days)
  against Jita's player listings at 2,800 M, and the Forge traded at exactly 2,500 M on 7 of 14 days. An item NPCs sell
  anywhere in The Forge is out of Prospects (Busy markets too), the planner and the opportunity mail, **at any price**;
  the Sniper never values a relist above it, read from its own five-minute book (no day-old scan), and says so ("NPCs
  sell at X"), and still shows a listing well under it; the Calculator notes it, red when your sell price is at or over
  it. The first rule (out only when the NPC price was at or under the resale) took 31 of 791 front candidates at 7 days
  (24 skills, 5 blueprints, 2 other), 46 of 896 placed and left, no mix row, none of the 100 Busy markets, and kept about
  half the NPC-sold items that price, mostly skill books listed in Jita a little under the NPC price with lowball bids
  and four-figure returns on paper (Gallente Hauler, 3340: sell 470,300, bid 1,236, NPC 500,000). The user found skill
  books risky and approved leaving out every one (2 October 2026, "yes i approve all 3 choices"). Measured on the same
  scan, with the 12:05 book folded as the Worker now stores it, at their settings (2,042 M, 75 slots, 25% cap), against
  the first rule: 14 more of 751 front candidates
  out at 7 days, 12 of 610 at 3, 11 of 850 placed and left at 7, 10 of 597 at 3, every one a skill book; the 7-day front
  mix lost Molecular Engineering (29 M) and High Energy Physics (23 M) and the 3-day Electromagnetic Physics (26 M), each
  refilled (92.72 → 92.73 M a day, 96.38 → 96.95); none of the 100 Busy markets or the 39 on the saved filters. Placed and
  left at 7 days, the mix went from 5 items filled by ISK a day (87.63 M) to 37 by return (88.94 M): the skill books had
  been dragging the by-return fill below the by-ISK one, and none of the 5 was removed. A skill NPCs don't sell
  (Neurotoxin Recovery) stays.
- **"Leave out flagged items" in the planner** (`plannerPool`, `SWITCH_EXCLUDES` in planner.ts; kept per browser, off by
  default). The user: "The capital planner should have a toggle to not include items with warning like these". On, it
  leaves out Falling, Bids not reached, Sells not reached, Crowded, Thin, Slow and Long queue, and says how many by flag
  (Market moved was among them until 9 October 2026, when Place and leave began leaving it out by default with a switch
  of its own);
  when every item is flagged, or nothing fits with it on, it says the switch is why. **Raises kept back never counts**: a
  cost already in the margin, on ~91 of 94 watched markets. On the 2 October scan (2,042 M, 75 free slots, 25% cap, 7
  days): on, it leaves out 532 of 791 front candidates (falling 230, sells not reached 202, bids not reached 169, thin
  134, long queue 74 on seven levels), and the mix still fills, 93 M a day against 95 M off. Off, the mix is unchanged.
- **Long queue** (`longQueue`, `LONG_QUEUE_DAYS` 14; `listedQueue`, `queueCeiling` in prospects.ts, `sellQueue` in split.ts).
  The user's 'Arbalest' Rapid Heavy Missile Launcher I (33440, 2 October 2026): ~720 a day traded in The Forge, nearly all
  sold into bids at ~24.7 k; ESI listed 16,264 in Jita from 60,280 up; the cloud watched buyers take 170–220 a day from
  listings while 1,600–8,500 a day were newly listed at the front. A 144% spread at the front sat over weeks of stock. The
  flag: units listed up to where trading reached on `FILL_RARE` of the last 14 days (counting only to your own price
  flags nothing at the front, which is one step under every listing), against buyers taking listings a day, saying where
  that pace came from (watched, the book, or history's guess, poor on markets that sell into bids). A sell priced under
  the front has nothing ahead. The cloud's scan counts the whole side (`sellsTo`, market-reading.md): 108 of 791 front
  candidates flagged at 7 days, none in the switch-off mix. The opportunity mail mails only unflagged items and reads the
  scan's count too, so it no longer mails a Long queue.
- **Place and leave holds a run-up to 30%** (`RUN_UP_PATIENT`, `runUpBar`; the front keeps `RUN_UP` 0.5). The user: "yes we
  can make it stricter". The Vigilance Resonance Key was +40% on the 1 October scan (31.8 M over the last 3 days against a
  month median of 23.2 M) and Place and leave priced its sell at 36.82 M from the spike's days behind 109 listed at ~9 a
  day. On the 2 October scan the bar takes 31 of 927 placed-and-left candidates (3.3%) and no mix row at 7 days, 2 of 35
  (48 M) at 3; the Key itself was back to +26% and in. The run-up's tip names the bar that applied.
- **The planner's "Scan again" banner doesn't say a quick scan is enough**: a quick scan re-reads a sample, and after one
  1,675 items stayed out of date. The cloud's daily full scan refreshes them all, or a deep scan.
- **Multibuy lists where buying at the ask is the point** (`copyMultibuy` in common.tsx, `multibuy` in combat.ts): each
  Freelance job copies what to buy for it (every item under the reward, per item), and Hub arbitrage copies the shipment
  when buying from sell orders now (not for a buy order, which Multibuy can't place). The Sniper too, since the user
  authorized it on 2 October 2026 ("Also I am authorizing adding multibuy to the sniper"; it had been left out because they
  wanted to be deliberately careful there): per find (the cart beside its listed units: the Actions column pushed the table
  past its width at 1,440 px) and "Copy all N" for what's shown, the cheap units only, saying the exact total at the
  listings read and how long ago, the dearest cheap price and the next listing up, so a window total over it means a
  listing has gone. Finds bought together that way are 3+ purchases of 2+ items within 2 s, the Wallet's multibuy rule,
  so `notSnipeIds` keeps a burst purchase the Sniper had shown (`sighted`: its item, a price in the sighting's range,
  within 10 minutes) as a snipe; a fitting's Buy All still isn't. Your snipes asks the cloud about sightings only for items
  bought from a listing within the window a kept sighting can still match (`SIGHTING_WINDOW_MS`: an order's 90 days, the
  sightings' 30, 10 minutes), since its route returns at most 500. Multibuy buys from the cheapest listings at once with no price limit,
  so every copy says what it came to at the listings just read, to check against the window's total before Buy. Lines
  are "Name N", the format the import's own tooltip gives ("Veldspar 4" / "4 Veldspar", the user's client, 29 September
  2026); they were "Name xN", which the tooltip doesn't list. A name still loading ("Item #123") refuses the copy rather
  than hand the game a line it can't match.
- **The Capital planner starts from what you have now** (`walletIsk`, free slots from your open orders). It used to
  default to half the wallet and then keep whatever was first typed, for good: the user found 486 M against a
  972 M wallet. ISK (the wallet, rounded down to the million: escrow has already left it) and free slots are read
  on each visit; a typed figure holds for the tab (`sessionStorage`), with a link back. The horizon and the cap per
  item are still kept. A notice says when free slots allow fewer than three items, since that, not ISK, is often
  the limit (the user's 129 slots held 126 orders, 123 of them sells).
- **The horizon is a choice of 4 h, 12 h, 1, 3, 7, 14 or 30 days, or Any** (`HORIZONS`; Any is stored as `null`, since the
  filters live in localStorage JSON where Infinity doesn't survive). It is a gate and a size cap, never a
  ranking input: ranking is return per day either way. Any leaves nothing out for being slow and flags a
  position that takes over `SLOW_DAYS` (30) to flip as "Locks ISK for weeks"; "Can take" says "no limit".
  An empty box meaning "unlimited" was considered and rejected: it would quietly bring back the locked-ISK
  trap the reach work was built against. A saved typed-in horizon snaps to the nearest choice *by ratio*.
  The hour choices are for fast flips and say their limit: speeds come from daily volume, so they find items
  busy enough to flip that fast on an average day, not a promise of a fill inside 4 hours.
- **Blueprints are priced against The Forge's blueprint contracts, on demand** (`Blueprints.tsx`, `lib/blueprints.ts`,
  `lib/bpContracts.ts`, `worker/src/blueprints.ts`, `worker/src/vendor/bunzip.ts`). The user collected blueprints in
  containers and deleted or forgot them because pricing them in game meant sifting too much data; they wanted it on a
  button, not a live scanner. ESI's contract list doesn't say what a contract holds (~20,000 item calls for The Forge),
  so the cloud fetches EVE Ref's public snapshot (every region's public contracts from ESI, items with ME/TE/runs,
  twice an hour, 6.2 MB tar.bz2; their server sends no CORS header, so the browser can't) and the one nearest three
  days ago, unpacks each with an adapted seek-bzip (MIT, Uint8Array instead of Node's Buffer) into a `TarSink` that
  keeps only the contracts and items files in buffers of exact size and stops there (the first try, one growing buffer
  for all 58 MB, peaked near 320 MB against the Worker's 128), and returns the contracts selling only blueprints that
  hold the kinds asked about, plus those that vanished before expiry (`vanishedSince`: a relist by the same seller is
  a reprice and left out). Measured: 1.2 s to unpack, 0.65 s to parse, ~7 s for both snapshots end to end; 15,190
  Forge blueprint-only contracts; 2,768 vanished in three days. Each kind you hold (item, copy or original, ME, TE,
  runs) is set against the same kind's asks (a copy's other runs scaled by runs^0.79: 10 runs asked ~6.1× one), and
  lists at what sold (two or more, never over the middle ask) or else the cheapest quarter of asks. **An unused
  original is priced by the market** (`unusedPrice`): the first check put three unused Raven Blueprints at 3.2 B each
  against researched originals, when NPCs sell them at ~1.13 B. The cheapest comparable opens in game
  (`/ui/openwindow/contract`), flagged when its title claims what its item isn't (EVE University: never trust a title).
  Blueprint pictures are `images.evetech.net/types/{id}/bp` or `/bpc`; `/icon` answers 400 for them.
