# Finding trades

Decisions worth not undoing. Prospects, the Capital planner, the cloud's full-market scan, the Sniper and Place and leave: how candidates are found, sized and priced.

Split on 19 October 2026 to keep each file's notes under the instruction budget (CLAUDE.md, "Notes by topic"): this note
keeps Prospects and the scan; the Capital planner's mix is in finding-trades-planner.md, Place and leave in
finding-trades-leave.md, a plan once started (the checklist, the list step) in finding-trades-plans.md, and the Sniper,
Multibuy and blueprint contracts in finding-trades-sniper.md.

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
- **Pages that work from the Prospects scan say how old it is** (`ScanFreshness`, rule `scanFreshness`): the
  Capital planner, Hub arbitrage and Reprocessing's scanner. Nothing else refreshes that data,
  and the user worried about acting on an old scan. The scan records when a quick and a deep scan last *ran
  to the end* (`cache.runs`; a stopped scan doesn't count). Under 6 hours is a quiet line; over 6 an amber
  warning; over a day a red one; each with when a deep scan last finished, flagged if never or over a week,
  and a link to Prospects. Scans from before finishing times were kept are judged by the newest price in the
  cache. A deep scan that finishes says so, as a system notification too when browser notifications are on,
  since it's left running. A cloud full-market scan (`runs.cloud`) is fresh for `CLOUD_FRESH_HOURS` (30): it
  runs daily and the watch keeps the best candidates' prices live, so a 6-hour warning would fire every afternoon.
- **The cloud reads the whole market once a day** (`worker/src/scan.ts`, `hist.ts`, `scanTimes.ts`; the fold lives in `src/lib/bookFold.ts` since Industry stage 4, shared with a structure's read; `foldPage` stays in scan.ts). The user
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
- **The scan also reads the Industry tab's watch set** (10 October 2026, docs/notes/industry.md): every Tech I product and
  its materials with a Jita book, whatever the gate, marked `watchOnly` on their stats so no trade finder here sees them
  (`judgeProspect`, the Sniper's finders, `scanBusiest`, the opportunity mail). And it keeps NPCs' sellers of every Tech I
  blueprint, with their stations, in `industry_npc`: `foldNpc`'s one lowest price an item says nothing about where.
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
  removing 7, median −1.05%. An unwatched item carries none (finding-trades.md); its tip and the planner's Guide say so.
- **Measured on the cloud's 1 October scan** (13,465 items, the user's rates, the planner's defaults): 957 → 779
  candidates at the front (−18.6%: the recent window −145 and 148 repriced, run-up −36, reserve −7, 7 newly admitted);
  Place and leave 942 → 923 (the run-up); the 25%-cap mix 95.47 M → 77.70 M ISK a day. The planner also follows the
  watched-flow record now (`useFlow`): a plan opened before any page had read it was worked out without the watch.
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
- **The horizon is a choice of 4 h, 12 h, 1, 3, 7, 14 or 30 days, or Any** (`HORIZONS`; Any is stored as `null`, since the
  filters live in localStorage JSON where Infinity doesn't survive). It is a gate and a size cap, never a
  ranking input: ranking is return per day either way. Any leaves nothing out for being slow and flags a
  position that takes over `SLOW_DAYS` (30) to flip as "Locks ISK for weeks"; "Can take" says "no limit".
  An empty box meaning "unlimited" was considered and rejected: it would quietly bring back the locked-ISK
  trap the reach work was built against. A saved typed-in horizon snaps to the nearest choice *by ratio*.
  The hour choices are for fast flips and say their limit: speeds come from daily volume, so they find items
  busy enough to flip that fast on an average day, not a promise of a fill inside 4 hours.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- A scan treats cached stats without `lows14`, and books without `npcSell`, as stale, and fetches history for
  any item it prices whose stats lack the lows. The liquidity pass refreshes the *most-listed* items and the
  pricing pass takes the *best-margin* ones, which are mostly different: before the second fix only 5 of 42
  priced items had lows. Items a scan doesn't reach keep their old record, priced one step over the best bid
  and unflagged, until one does.
- **The full-market scan's prices are the morning's** for everything outside the watch: the cloud re-reads the
  best 150 candidates every five minutes, and every other item's book is as it was at 11:25 EVE until the next day.
  An item whose spread was under 4% that morning and widened since isn't checked until then either.
- **Hub arbitrage reads selling speed from the hub's whole region**, which is mostly but not only the hub.
  It prices about 40 candidates (the busiest from the last scan, plus positions and watchlist) — not the market.
- **An item whose book wasn't watched for a day carries no raises in the planner**, which flatters its return by about
  1% against a watched one.
- **Long queue's count is the cloud's morning read**, carried onto live books for up to a day: a queue that has thinned
  since reads long until the next scan, and the browser's ceiling (its own watching) can sit above the scan's ("at least").
