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
- **A book with an empty side can't say who trades** (`bookCanTell`). A filled-up order leaves the book with its fills,
  so a side with no orders reads as having sold nothing. The Experimental ZW-4100 Torpedo Launcher (29 September
  2026): its one Jita bid, which had taken three quarters of the trading, filled and went; the book read 100% buyers,
  the cloud had watched 26%, and the Calculator's blend (77.8%) put ~380 buyers a day on listings the watch saw taken
  ~49 a day ("Round trip takes 2 h"). Of 358 books the book is trusted on with 30+ units watched, it was the only one
  with an empty side, 0.74 off where the rest were a median 0.14. Such a book is now set aside like one of single units;
  the launcher reads ~50% (history's guess, 0.60, blended with the watch). History's guess is still poor on markets
  that sell into bids, so the watching has to build up before the pace is right.
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
- **And it ignores prices that aren't the market.** A move landing >10% past where the item sits, *and* chasing under
  2% of the side's volume, is a mistake or a token dump rather than a repricing. **Both conditions matter**: distance
  alone wrongly condemned 217 units of genuinely cheap supply as a "mistake"; quantity is what separates a fat finger
  from a cheap seller. Where it sits is where it has traded when history can say (`tradedLevel`: halfway between the
  fortnight's median low and median high, `FILL_RARE` days each), else the side's volume-weighted median
  (`weightedLevel`), so one unit fat-fingered at two thirds the going rate moves it by nothing; without history it is
  the one guard that still works. Until 1 October 2026 it was always the book, and floods nobody trades with dragged it:
  the Vigilance Resonance Key's 8 bids ahead read "126199999900% above where the rest of the book sits (0.02)" (100,000
  bids at 0.02 ISK), a Dual Modulated Light Energy Beam I sell's 3 units ahead "72% below (599,100)" when the fortnight
  traded ~121–165 k (now 144,000), a Small Ghoul's 57 "23% below (10,450)". The Afocal's token below is still caught,
  an escrow-bait bid reads "over 100 times where it has traded", and the gap is a share under double, else a multiple.
  A book's bids are weighed by ISK (`weightedLevel(…, 'isk')`, here and in `marketBest`): of the user's 42 books that
  evening, 10 had a centre by units under a thousandth of the best bid, and `marketBest` answered 0.01–0.02 on 4 of them
  (none since). The cost: an escrow-bait bid can be `marketBest`'s market.
- **Already one step over the best bid, there's nowhere to move** (`adviseRelist`: `moves` needs a new price, and the
  sell-unreached branch waits). The user's Motley Compound (29 September 2026): 27 at 4,001 over a 4,000 bid, where
  every day's trading sat at the bid, was told to "Move it" to 4,001; Sheen Compound likewise at 2,101. The rule moves an
  unreached sell to where trading reaches, or one step over the best bid when that's lower, which is where these
  already were. Now it waits and says so ("as low as a listing goes without selling into it: buyers here mostly sell
  into the bids…; if you want it gone, sell into that bid now for about the same"), and Orders shows no Move to. 6 of the
  user's 84 Jita sells. Lustering Alloy, told to go from 13,970 to 7,501, was right: 13 of 14 days traded at the bid.
- **A move aims at the real front, not a token in front of it** (`realFront` in `adviseRelist`, from `marketBest`). The
  guard against chasing a mistake weighed every unit ahead together, so a token passed as real supply whenever real
  stock sat behind it, and the move was aimed at the token. The user's Small Focused Afocal Laser I (29 September 2026):
  16 at 21,950 told to "Move it" to 5,002 (−77%) because one unit had been listed 20 minutes earlier at 5,003, a tick
  over the 5,002 bid, in front of 432 at 21,930; the bulk of trading had got up to ~21,950 on 6 of the 14 days. Now the
  move is to one step under the real front (21,920), and with only tokens ahead the old guard answers ("someone's
  mistake or a token dump"). The token's units still count as ahead in "Clears in". On the user's 86 open Jita orders
  12 changed target, all towards the real front: an 11.39 M sell had been told to go to 8.6 M, one at 3,787 to 221.
- **"Is that cheap listing a token?" also asks how much the item trades in a day.** Share of the book
  alone was fooled on PL-0: one 9,909-unit order at 45,000 made 161 real units at 30,040 look like 1% of
  the side, so the app suggested 34,770. Stock worth at least a quarter of a typical day's trading is real
  supply (`OUTLIER_OF_DAY`), in `marketBest` and in relist advice. "Typical" is the 14-day median
  (`typicalDailyVolume`): your own big buying day can make the average several times the norm.
- **`marketBest` applies the same idea wherever a best price becomes a price you'd act on**: the
  suggested sell price and "stock if sold now" on a position, and the Calculator's prefill. Prospects
  and the Watchlist deliberately don't use it — an outlier only ever *narrows* an apparent spread
  there, so it hides an opportunity rather than inventing a bad trade, and that is the safe direction.
- **A buy is never raised into a loss, and knows its plan** (`planTargets` in plans.ts; the guard, `paidPerUnit`,
  `PLAN_KEEP` and `overResale` in relist.ts). Orders had the user raise their plan's Praxis bid three times (30
  September 2026: 206.3 → 206.7 → 207.1 → 208.4 M); the plan expected 3.2%, the third raise left 0.9%, and the trade lost
  1.02 M. The old check (`badBuy`) set the new bid against the best ask after the sell side's fees alone. Now a raise,
  including an unreached buy's move, is judged selling on at the lower of the plan's price and where a listing sells now
  (`listingPrice` on others' orders), costing the new bid with its broker fee (which covers every increase), each change
  already paid (k × each later kept version's price, per unit left, from `seen`, so the Worker says the same) and this
  one. A plan's buy must keep the lower of half what the plan expected and your target, never under break-even; any
  other, break even. Under it: `loss` with `keep` ("Keep it at 207,100,000"), naming the floor. Praxis's second raise
  left 2.1% and stood. The cap at the target is the ruling: the Key, priced from a spike to make 36%, was refused a raise
  leaving 7.6%; it moves now. An item's plan is the newest one holding it whose position is still open; a closed,
  deleted or retargeted position is no plan. A plan's sell keeps the cost guard and names the plan's price when a move
  goes under it. A buy whose own price, fees included, costs more than its resale gets back is tagged "Pays more than it
  resells for: breaks even at X" (`overResale`; 0 of the user's 4 buys on 1 October, so no To do item). On their 35
  open orders that evening the cap left no Keep it.
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
  would only sell into it, so the move is one step over the bid (100,100, the price that did sell). Said the way the user
  read it once they asked for plainer words: "Nobody buys at your price or even at the front, 719,900 (reached on 0
  of the last 14 days). Where it used to trade, 55,310, is below today's best bid of 100,000, so list one step above
  it at 100,100, or sell into that bid now for about the same" (a tick gained, ~0.26% paid to move: the bid is never
  worse by more than that, and it's now). The sell-into clause names only someone else's bid, and says how many of
  yours it takes when it can't take all; To do and the mail use the same sentence. This applies to
  sells you're leaving too. Its `loss` check is on the price it moves to. More sells can now raise a "move" alert,
  including ones already at the front; the alert minimum still applies.
- **Stock no open position covers still has a cost** (`heldCost`, used by `costBasis` in orderCheck.ts). The guards
  against selling at a loss (a move under cost is "Not worth it", selling into bids never under cost) read `avgCost`,
  which came from open positions only; the Sniper's buys are followed on its page, never as positions, so a sniped item
  had none. The user asked that a sniped item never be moved to a loss. Now an item with no open position is costed
  at its latest buys, newest first, until they cover what's held (Jita hangar plus listed): a listing buy at its price,
  a buy-order fill plus the broker fee, Personal trades left out; loot, with no buys, has no cost. The cloud reads the
  same through the pushed `costs` doc. On the user's 102 sell orders (28 September 2026) only 2 had a cost before; 7
  more got one, all bought from listings, and two went from "Leave it" to "Not worth it": Warrior I Blueprint (bought
  at 999,900, the front a move to 999,800) and Frigoris Restrained Ice Harvester Upgrade (~8.6 M, move to 8,499,000).
  The guard is "not under cost after fees", not a profit target.
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
- **Your other orders on an item are set apart when one is judged** (`judgeOrder`'s `yours`, `MarketContext.yours`).
  The user asked whether to list stock in batches while its buy order is still filling (yes: the times overlap
  instead of adding up, and Positions costs each sale at the average held then, fees per order). But every order
  was judged against the whole book: a cheaper batch of yours read as a rival, so the other was told to undercut
  your own listing for a relist fee, and "Sell to bids" walked every bid, your own buy order included, which is
  trading with yourself. Now your others aren't rivals, best prices or bids to sell into; a cheaper listing of yours
  still counts towards how long this one takes to sell (`yourHours`), and a sell is never moved under your own bid
  either. Orders and the cloud's alert round both pass the IDs of your open orders.
- **"Too big to keep moving" warns when a price change costs more than it wins** (`tooBigToMove`, `Relist.tooBig`,
  tag on Orders). A price change is charged on everything left on the order (`k` = broker fee × (1 − the ABR
  discount), 0.26% at the user's skills, measured at 0.258–0.262% on their journal), but wins only what fills before
  the front is beaten again. The user's Small Ghoul Compact Energy Nosferatu buy, 50,000 units placed early on "to
  let the overly large order sit there and buy up over time": ~250,000 ISK a change on ~49,000 units left (a raise
  also pays on the increase: 1,882 → 2,012 cost 333 k), ~42 units won a change on its record (416 over 10), 1.21 M
  to place, about 6 M in fees for 937 units, 215 days to fill the rest at ~230 a day, ~100 M ISK in escrow. What a
  change wins comes from the order's own recorded changes when it has 3 or more (`OWN_CHANGES_MIN`), else the most it
  can win: everything reaching your side until someone else beats the front (your own moves while watched taken out).
  It says so once a change costs half of that (`FEE_EATS`), and suggests a size whose change costs a tenth
  (`FEE_TARGET`): ~4,500 units for the Ghoul. Nothing without a positive margin, or when nobody else beat the front.
  Weakest slots' ISK a day doesn't subtract price-change fees. It first fired on 3-unit loot the market barely feeds (Blood Raider
  Limited Ballistic Control: a change "won" 0.0045 of a unit at 0.0039 a day), where no size is the problem, so it now
  needs a change to win at least one unit and the suggested size to at least halve the order; the suggestion is never
  below what one change wins (on a thin margin, Rocket Science's, 10% is out of reach at any size). On the user's 105
  open orders it went from 6 to 4, all real: the Ghoul, Rocket Science (~1.07 M a change for ~410 k won), PL-0 Scoped
  Cargo Scanner (~160 k for ~8 units), Iridium Charge M (~198 k for ~220 k).
- **A sell is never "leave it" at a price trading doesn't reach** (the override after the queue verdict in
  `adviseRelist`). When the front is reached but your price isn't (fewer than `FILL_RARE` of 14 days, not filling),
  and the queue says wait or loss, it moves to the highest price the bulk of trading got up to on `FILL_RARE` days
  (`reachedAsk(highs, FILL_RARE)`): still reached, cheaper than chasing the front, marked `unreached`, so the Clears-in
  column says "rarely reached". The user's Blood Raider Limited Ballistic Control: 3 at 172,700 read "Leave it" with
  "2570 days" and "Too big to keep moving". The wait came from weighing a 21% cut to the front (107 k) against the
  target spread over 771 days: two figures near nothing, since the model's pace was 0.0039 a day. That market sells
  in bursts: most days ~15 dumped into 62,000 bids, then now and then someone sweeps the listings (338 units up to
  149,900 on 13 September, 365 up to 170,500 on the 20th); `buyerShare` sets such one-sided days aside, so the pace
  can't see them, but the highs do: 170,400 was reached on 4 days, 172,700 on none. Now it says "Nobody buys at your
  price (reached on 0 of the last 14 days), but the bulk of trading got up to 170,400 on 4 of them, so list there
  rather than chase the front at 137,200" (just "so list there" when that's within 1% of the front). Run over all
  105 open orders against the cloud's own inputs before shipping: 95 unchanged, 9 loot sells from "Leave it" to a move
  (Festival Launcher 9,979 → 2,005, reached on 9 days; Experimental SV-2000 64,820 → 10,490), all under the 5 M mail
  minimum. Prices under 1,000 now keep their cents in these sentences (`priceText`).
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
- **A buy that feeds a long queue says so on Orders** (`feedingQueue`, `feedsQueueSaid` in relist.ts; `perDaySaid`, `queueDaysSaid` in
  split.ts, which Prospects' Long queue tip uses too, so a pace under one a day reads 0.3, never 0; `paceFrom` in flow.ts;
  the "Feeds a long queue" tag). The user, 2 October 2026: "its strange that my arbalest rapid missle launchers are taking
  so long to sell", then approved "the warning for what happened to the missles". Their buy order kept adding stock
  behind a queue that takes weeks. For an open Jita buy: others' listings up to the queue's ceiling on the whole live
  book (yours left out) + your listings + your Jita hangar + what the order still buys, against buyers taking listings a
  day (`sidePace`'s sell side), tagged past `LONG_QUEUE_DAYS`; a pace measured at zero is a queue that never clears, an
  unknown one says nothing. The tip says to cancel it, or cancel and place a smaller one (a new order with its own fee:
  EVE can't shrink one), and to list what you hold first. On the user's 3 open buys (13:02 UTC): the Arbalest tagged at
  ~27 days (3,294 others' listings to 62,910, 1,808 listed and 737 in the hangar, 2,350 to buy, 306 a day watched over
  118 h); the Caldari Navy Missile Guidance Computer (2.1 days) and a Clone Soldier Transporter Tag (4.4) not. Not in
  mail. **On To do since the user approved it** (2 October 2026, "yes i approve all 3 choices"; `feedsQueueItem`,
  `judgeFeedsQueue` in todo.ts, kind `feedsQueue`, under Needs action): one item per tagged buy, keyed by the order
  (`feeds:<id>`), in the tip's own words (`feedsQueueLead` and `FEEDS_QUEUE_DO`, which the tip is built from), opening
  the item in game with no price copied, at stake what the order still has to spend. Its version is the order's price
  alone: never the queue's days, which move with every read of the pace, nor what it still buys, since a buy filling all
  day would reopen a hand tick at every fill (first built that way, changed before shipping). It ticks off like an order item: the order closing, or a newer check that read the book and no longer tags it,
  which can't tell a shorter queue from a pace it can no longer read and says only "The latest check of its book no
  longer has what it buys feeding a long queue." On the user's 3 open buys again (15:20 UTC): only the Arbalest, 8,067
  units, about 27 days at 304 a day watched over 121 h, 2,247 still to buy (55.8 M at stake).
