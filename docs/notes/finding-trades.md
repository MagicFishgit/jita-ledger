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
  Capital planner, Hub arbitrage, and the slot-swap suggestions on Orders. Nothing else refreshes that data,
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
  rough and says so. Items without the days to say where trading reaches are left out, never priced at the front.
  The mix now shows Buy at and Sell at.
- **Orders you're leaving aren't told to get back in front** (`Data.leave`, a synced doc of type IDs; `leave` in
  `adviseRelist` / `judgeOrder`). Without this the first patient order would have been told to move by Orders, To do
  and the cloud's mail within the hour. A left order behind the front is `wait` with "You're leaving this one", raises
  no "beaten but clearing" alert, and shows no Move to / Costs you. What still speaks is trading no longer reaching
  its price: a buy is moved to `reachedBid` (still behind the front, unlike an ordinary buy, which goes to the front
  when that is above where trading reaches) or told to cancel; a **sell you're leaving** gets the same test against
  the highs (`askReachDays`, moved to `reachedAsk`, or `loss` when that sells under cost), which other sells don't.
  `fillingNow` now reads sells too (a listing that shrank at its price, or your own sale at or above it). Set from
  the planner for a whole plan in one click, or per item on Orders ("Leave alone" / "Leaving it").
- **When order slots run out before the ISK, the planner fills by ISK a day** (`allocate`, `Plan.ranked`/`other`). It
  filled best return per day first, which is right while slots are spare, but with few free slots a small market paying
  4% a day on the 20 M it can take earns less than a big one at 2% on 150 M, and most of the ISK sat idle. The user asked
  that it "fill the given slots" intelligently (29 September 2026). Now, when the slots run out first, the mix is also
  filled by what each item makes a day, and whichever earns more a day is kept; the page says which and what the other
  would have made. Test: 1 B, 10 slots, six small and six big markets: 750 M in the five big ones for 5 M a day, where
  best return first put 100 M in the small ones for 1.33 M.
- **"Start this plan" turns a mix into positions and a placing checklist** (`lib/plans.ts` pure: `newPlan`,
  `placedOrder`, `planProgress`; `PlanStart.tsx`; the synced `plans` doc; To do kind `placeBuy`). The user wanted to place
  a plan's buy orders "in one go" by import or API, since Multibuy has an import. Researched on 29 September 2026: ESI
  places no orders, and Multibuy only buys at once from listings at the ask ("multibuy only offers immediate buys", CCP),
  which would throw away the margin the plan is priced on (patient bids where trading reaches). So one click: a position
  for every item (or the one already open), grouped as one plan; "Leave alone" for a Place-and-leave plan; and a checklist
  on the planner and in To do where each item opens in game with its price copied, its quantity one more click, and ticks
  off once a buy order for it in Jita 4-4, first placed after the plan started, shows in your orders. Positions has a
  Plans panel with each plan's bought, sold, profit and stock, and a filter to its positions; removing a plan leaves the
  positions. Checked end to end in a test browser on the cloud's real scan (13,442 items): a 998.97 M plan of 5 items,
  5 positions, the checklist, the Positions filter and To do.
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
