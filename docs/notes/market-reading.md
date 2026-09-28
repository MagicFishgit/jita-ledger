# Reading the market

Decisions worth not undoing. How the app judges a book, a price and a pace: where trading reaches, who buys and who sells, when an order is worth moving. Most of it was measured on the user's own orders before it was built.

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
- **"Sell to bids" is a verdict on measured evidence only** (`sellIntoBid`, verdict `bid`). Many module markets
  are sellers selling into big standing bids while buyers rarely take listings, so loot listed there waits for
  months. After at least `BID_WATCH_H` (a week, 168) hours watched, if at the pace buyers took listings (one more sale than
  seen, so a quiet week reads "at most one a week") the stock ahead plus yours takes over `LISTING_DAYS` (30, the
  same as Prospects' "locks ISK for weeks"), the order says what the bids pay now after tax against what your
  price would fetch. Never when your listing has sold since its price was set, never below what the stock cost,
  never from history's guess. It replaces a move on that order (moving down a tick where listings don't sell only
  burns a fee), goes on To do as "Sell into bids", and is not mailed: the user doesn't want loot mail. **The
  minimum was 24 hours until 28 September 2026.** The user followed it on two items and agreed with it, but asked
  what happens to an item that sells in bulk a couple of times a week: a day between bursts reads it as dead, and
  the one-more-sale cushion is far too small to make up a missed burst. The watching itself already ran up to 14
  days, re-judged every five minutes; only the floor was short. Waiting costs little (the verdict only speaks when
  selling looks over 30 days away), a wrong sale into bids can't be undone, and a week catches the weekend, so a
  week it is; the user will say if it should go back. Whether a day's read gets reversed by the week's hasn't been
  measured: the cloud's hourly watching (`flow_hod`) only began on 27 September, so test it once there is a week.
- **"Busy relisting" informs; it never hides or ranks** (`relistPace`, `BusyRelisting`). After `RELIST_MIN_H` (6)
  hours watched, a side whose best price improved (someone undercut or outbid the front) every `BUSY_RELIST_MIN`
  (30) minutes or more often gets a tag under the item's name on Orders and Prospects and a note in the
  Calculator, with the rate and "price patiently, or expect to relist". The user asked for exactly this: bots are
  everywhere, and a good trade shouldn't vanish because of them. Reads are five minutes apart, so "every 5 min"
  is the floor. The Clears-in tip quotes the same rate instead of the old units-listed-at-the-front figure.
- **An item's rhythm is said only after a week of watching** (`rhythm.ts`). Busy hours: the 4-hour window (UTC)
  carrying at least 1.5× its even share of one side's trade, judged per hour watched, after 7 days and 30 units;
  said in EVE time and the viewer's own ("Buyers take listings most between 18:00 and 22:00 EVE time (20:00–00:00
  yours)") in the Calculator and the Clears-in tip. Spread now against the median of the same hour on 7+ earlier
  days, under the Calculator's hourly chart. Nothing shows before then; there's no "collecting data" wording.
- **"Clears in" is paced by what the Jita book was seen doing, not only by a guess from history** (`lib/flow.ts`,
  `sidePace` in `orderCheck.ts`). A six-hour study of the user's 71 beaten orders (27 September 2026, 03:44–09:44
  EVE time, 79 reads of each book ~5 minutes apart) found:
  - the queue mechanics right: every unit sold at Jita came off the orders ahead of theirs;
  - Jita's whole trade near the Forge's typical pace (median 0.82 of the 14-day median day, 0.6 of the 7-day
    average);
  - the buyer/seller split badly off: a median 0.33 from what the books showed, often "nearly all buyers" on
    items where sellers dumping into bids did nearly all the trading (5245: guessed 1.00, saw 0.3 bought from
    listings an hour against 26 sold into bids);
  - only 4 of the 22 orders predicted to reach the front in that window did.
  So every check compares each book with the previous read of it (`bookFills`: shrunken orders are sales on
  their side, a vanished order only if it was the best on its side), timed by ESI's own `Expires` (`stamp`)
  so the same snapshot read twice adds nothing, and gaps over 30 minutes or partial reads are skipped. Kept 14
  days per item and day in the cache store (`flow`). The pace blends that with the history guess as if the
  guess were 24 hours of watching (`PRIOR_HOURS`), and the guess is a typical day (`paceDay`) split by the
  book where it can tell (`tradingSplit`). Orders shows "N h watched", "from the book" or "from history" under
  the figure. No re-weighting of history alone helped (every variant was off by 5–20× per item).
- **One buyer/seller split, everywhere** (`tradingSplit` in `split.ts`): what the app has watched each side of the
  Jita book do (`flowStore`, fed by *any* repeated read of a book in `readBook`, so the Calculator, watchlist
  signals, Loyalty pricing and order checks all add to it), then what the book's live orders have already sold
  (`BookSold` on every book read, `bookCanTell`), then history's guess, then even. The watching is weighted as if
  the prior were one typical day. Orders, Prospects, the Calculator, Loyalty, Hub arbitrage (from the hub's own
  book), the Watchlist and Positions (through `snapshot`) use it, and the tips say which source spoke. Selling
  times are judged on `paceDay`: the 14-day median day, or the 14-day calendar average when the item trades on
  fewer than half its days (its median is 0, but it does sell). Checked on the user's 100 orders before shipping:
  8 went from "leave it" to "move it", all module markets of the dumping kind above, where the queue ahead is
  days, not hours; the morning watch agreed with the book for the four busy enough to score.
- **Undercuts are shown, not modelled.** In the study 46 of 71 beaten orders were undercut again within six
  hours, and on busy items new stock arrived at the front ~1.9× as fast as the queue drained, so a queue is not
  fixed. But the undercut rate read from one book (units ahead placed after your last change, over the time
  since) predicted the next six hours poorly (median log error 1.49), and subtracting it would flip verdicts to
  "move" wholesale on thin evidence. The watched rate of new stock at the front is in the Clears-in tip instead.
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
  beats what `settings.target` comes to a day, hold. This is what stops it advising a 31% price cut to get
  in front of a thin skim of cheap stock that clears in 20 hours anyway. A relist fee is fixed, so buying
  back a few minutes with one can never pay; patience settings cannot override this check.
  **The target is per trade** (Settings says so: "what you want each trade to make"), so it's spread over the
  days this order's stock takes to sell (`yourHours`, at least one day) before the comparison. It was once
  compared as if it were 5% a day, which made every hour on a week-long sale look five times dearer: the
  user's Upgraded Explosive Coating I, 36 units taking six days with one unit ahead, was told to move for
  ~1,200 ISK to save four hours. With the floor, a stock that sells within a day is judged exactly as before.
- **And it ignores prices that aren't the market.** `weightedLevel` is the volume-weighted median of
  your side of the book, so one unit fat-fingered at two thirds the going rate moves it by nothing.
  A move landing >10% past that level, *and* chasing under 2% of the side's volume, is a mistake or a
  token dump rather than a repricing. **Both conditions matter**: distance alone wrongly condemned 217
  units of genuinely cheap supply as a "mistake"; quantity is what separates a fat finger from a
  cheap seller. This needs only the live book, so it is the one guard that still works for an item
  with no trading history — which is exactly when the other two cannot fire.
- **"Is that cheap listing a token?" also asks how much the item trades in a day.** Share of the book
  alone was fooled on PL-0: one 9,909-unit order at 45,000 made 161 real units at 30,040 look like 1% of
  the side, so the app suggested 34,770. Stock worth at least a quarter of a typical day's trading is real
  supply (`OUTLIER_OF_DAY`), in `marketBest` and in relist advice. "Typical" is the 14-day median
  (`typicalDailyVolume`): your own big buying day can make the average several times the norm.
- **`marketBest` applies the same idea wherever a best price becomes a price you'd act on**: the
  suggested sell price and "stock if sold now" on a position, and the Calculator's prefill. Prospects
  and the Watchlist deliberately don't use it — an outlier only ever *narrows* an apparent spread
  there, so it hides an opportunity rather than inventing a bad trade, and that is the safe direction.
- **The sell side is judged like the buy side** (`askToPlace`, flag `unreachedSell`, "Sells not reached"). An ask
  one step under the best that the bulk of trading reached on fewer than `FILL_RARE` of 14 days is lowered to the
  7th-highest daily high, and an item left with no margin drops out; Busy markets still prices at the top. Stats
  keep `highs14` for it. It was a stated limit ("only buy orders are judged") until the Capital planner's top
  pick turned out to be True Sansha EM Armor Hardener at "59% a flip".
- **Every sell order on Orders is judged against the highs too**, not only ones you're leaving (`adviseRelist`,
  since 28 September 2026). Before, an ordinary sell was judged on the queue alone, so a listing on a market whose
  whole sell side sits above where anything trades was told to undercut the front. The user's Compact Layered
  Energized Membrane (one unit at 3,899,000): a buyer arrived at 100,000 on 26 September (2,874 traded that day,
  against a median 158, where the old bids paid 55,000), the sell side emptied, and loot sellers then listed against
  nothing, from 4,998,000 down to 720,000; in a day of the cloud's watching 205 units were sold into the 100,000 bid
  and 4 bought from listings, all at 100,100. So a sell is `unreached` when even the front (one step under the best
  ask, or your price when you are the best) was reached on fewer than `FILL_RARE` of 14 days; then it moves to where
  trading reached on 7 (`reachedAsk`), which is in front of everyone. Behind a front that is reached, the queue
  decides as before, and an item traded on too few days to say keeps its queue advice. **Never under the best bid**
  (`overBid`): the membrane's 7th-highest high was the old 55,310, under today's 100,000 bid, and a listing there
  would only sell into it, so the move is one step over the bid (100,100, the price that did sell). This applies to
  sells you're leaving too. Its `loss` check is on the price it moves to. More sells can now raise a "move" alert,
  including ones already at the front; the alert minimum still applies.
- **"Price just moved" keeps a spread across two price levels out of the planner** (`lastMove`, `MOVED` 0.5, flag
  `moved`). True Sansha traded around 3.6 M for weeks, then days spanning 3 M to 9 M, then a day at 7.0–7.55 M:
  both its bid (where it had traded) and its ask (where it had jumped to) counted as reached on those wide days.
  The latest day's average more than 50% from the median of the days before it is a move, not a wobble; Prospects
  flags it and the planner and opportunity mail leave it out. Scans refresh stats that lack `highs14` or
  `lastMove`, and the planner says "Scan again before investing" while any of its items predate them.
- **Daily volume divides by calendar days, not by history rows** (`recentAverages`). Dividing by rows present
  spread a thin item's last seven trading days — maybe two months of them — over one week and overstated its
  pace many times over, which sized arbitrage lots and relist advice off a market that wasn't there.
