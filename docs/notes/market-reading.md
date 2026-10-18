# Reading the market

Decisions worth not undoing. How the app judges a book, a price and a pace: where trading reaches, who buys and who sells, when an order is worth moving. Most of it was measured on the user's own orders before it was built.

Split on 19 October 2026 to keep each file's notes under the instruction budget (CLAUDE.md, "Notes by topic"): this note
keeps where trading reaches and the price a listing goes at; who trades and how fast (the split, Clears in, after a
move) is in market-reading-flow.md, and what Orders advises for your own orders in market-reading-relist.md.

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
    `dry` verdict: **Cancel it**. It raises a "move" alert (it replaces a move recommendation) and a To do
    item, its mail says "RECOMMENDED: cancel this buy order", and it earns nothing per slot;
  - the Calculator's price notes use the same count, since one day's extreme said "inside what sellers
    accepted" about a bid the rest of the fortnight never reached;
  - **your own fills overrule the count** (`fillingNow`): a buy that has shrunk since its price was set, or an
    item you bought at or below the bid in the same station in the last 3 days, is reached, whatever history
    says. History lags a day or two and an order repriced since isn't in it at all: the user's Datacore -
    Rocket Science buy at 83,230 was told to cancel ("reached on 2 of 14 days") with 4,133 of 10,000 already
    filled. Consumers read `Relist.unreached`, which carries the override, never `reach` directly.
- **The app's own watching adds reach evidence, never removes it** (`recentRange(..., watched)`, `withWatchedLows`).
  A day's low is the lower of ESI's trimmed one and the exact lowest price a Jita buy order visibly *shrank* at
  while watched (a vanished order may have been cancelled, so it doesn't count); the window runs up to today when
  today or yesterday was watched. A seller selling into bids hits the best one, so a fill at a price means the
  top of the book was there. Orders, the Calculator, the cloud's alert checks and Prospects (at rank time, over
  the scan's own days via `lowsEnd`) all use it.
- **Items NPCs sell are kept out of Prospects** (`npcSell` on the book, from `NPC_DURATION`) and flagged in the
  Calculator: a bid won't fill below an unlimited NPC price, and there's nothing cheaper to buy and resell.
- **The sell side is judged like the buy side** (`askToPlace`, flag `unreachedSell`, "Sells not reached"). An ask
  one step under the best that the bulk of trading reached on fewer than `FILL_RARE` of 14 days is lowered to the
  7th-highest daily high, and an item left with no margin drops out; Busy markets still prices at the top. Stats
  keep `highs14` for it. It was a stated limit ("only buy orders are judged") until the Capital planner's top
  pick turned out to be True Sansha EM Armor Hardener at "59% a flip".
- **Every feature that prices a new listing uses `listingPrice` (fills.ts)**, the same rule as Orders: one step under
  the cheapest listing when trading got up there on `FILL_RARE` of 14 days, else where it got up to on half of them,
  never under one step over the best bid. The user asked, after the Orders refinements, whether the other features
  needed them. Loyalty valued every offer's output at one step under the cheapest listing (`patientPrice`), and Hub
  arbitrage listed at one step under the hub's (`priceHub`): on a sell side nothing trades near, like the membrane's
  720,000–5,000,000 against trading at 100,100, both would have counted a price about seven times too high. Loyalty's
  quotes now carry the highs its live pass already read for pace; arbitrage reads the hub region's. The position page's
  "List patiently" / "List safely" (`reachedAsk`) are floored one step over the best bid too, saying so. The Sniper
  never resold above `reachedAsk`, so a listing Orders suggests can't be a snipe; it now also leaves out your own orders
  (`notYours`), page and mail, so your cheap listing isn't offered to you and your own bid isn't one to sell into.
  The Calculator's prefilled sell price is still one step under the cheapest listing: it's a what-if you edit, and its
  notes already count how often trading reached a price.
- **"Price just moved" keeps a spread across two price levels out of the planner** (`lastMove`, `MOVED` 0.5, flag
  `moved`). True Sansha traded around 3.6 M for weeks, then days spanning 3 M to 9 M, then a day at 7.0–7.55 M:
  both its bid (where it had traded) and its ask (where it had jumped to) counted as reached on those wide days.
  The latest day's average more than 50% from the median of the days before it is a move, not a wobble; Prospects
  flags it and the planner and opportunity mail leave it out. Scans refresh stats that lack `highs14` or
  `lastMove`, and the planner says "Scan again before investing" while any of its items predate them.
- **Daily volume divides by calendar days, not by history rows** (`recentAverages`). Dividing by rows present
  spread a thin item's last seven trading days — maybe two months of them — over one week and overstated its
  pace many times over, which sized arbitrage lots and relist advice off a market that wasn't there.
- **The cloud's daily scan counts the whole sell side up to where trading reaches** (`sellsTo` on the book, `Agg.deep` and
  `summaryOf` in worker/src/scan.ts, `SELLS_COUNTED_TO` 2; `listedQueue`'s `sellsTo`; `overScan` in evaluate.ts). The book
  summary keeps seven prices a side, and on 2 October 2026 the 'Arbalest' launcher's seven held 2,781 units (11 days of
  buyers) where the side up to 62,910, where trading reached on 4 of 14 days, held 5,170 (20 days): 26–36 candidates
  went unflagged. The fold keeps each item's Jita listings within twice its best ask (the best only falls, so what it
  keeps is every listing up to twice the final best, in any page order), and the history callback counts them to the
  queue's ceiling, the same `queueCeiling` the browser uses with the watched highs folded in (without them the
  Arbalest's ceiling read 60,950, not 62,910). Stored as `{ price, units }`, the price being where it counted to, so a
  count cut at twice the best says "at least". Measured on a real read of The Forge's 405 pages: the fold 31 MB, the
  count's share 9.1 MB of the Worker's 128 (192,167 of Jita's 223,245 sell prices kept); the stored scan +0.63%; "at
  least" counts on the front's candidates 348 → 11; Long queue 74 → 108. The five-minute watch's live books keep the
  morning's count and NPC price (`overScan`), and the opportunity mail reads both from `scan_items`; where the live
  seven levels show more, they win, as "at least". A throw
  while summarising falls back to the plain book, so the day's scan can't be lost to it. The count includes your own
  listings (the scan doesn't know whose they are).

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Pricing a buy where trading reaches is conservative.** Because ESI trims each day's low, an item whose
  dumps into bids live entirely in that trimmed tail looks unreached and can drop out of Prospects. Nobody can
  build a position on that tail, but a small, patient order might still fill there.
- The reach count uses The Forge's history, not Jita's alone (plus the exact Jita fills the cloud watched).
