# Reading the market: what Orders advises

Split from market-reading.md on 19 October 2026. Decisions worth not undoing. The verdict on each of your orders (move,
wait, sell into bids, keep, cancel): depth against volume, what a move costs, the real front, plans' guards, left
orders, cost basis, and the tags Orders adds.

- **Your own order's price is read from the live book**, not the 20-minute-cached store, so a relist
  made in game shows up at once.
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
  **A plan's unreached bid moves when the move clears the plan's floor, and is never told to cancel where the rule without
  the plan wouldn't** (the unreached-buy branch of `adviseRelist`, 8 October 2026). It was judged by selling on one step
  under the best ask against your target, while its raises were judged against the plan's floor: the user cancelled four
  of the 2 October plan's bids on "Cancel it", and "if it was still profitable" it "could have just been a price
  adjustment". Now, for a plan's bid moved to where trading reaches:
  - **Move it** when the guard's own figure clears the plan's floor (`guardRet`: the plan's price or where a listing sells
    now, whichever is lower, every fee and change paid): "still makes 4.2% after fees, selling on at 120.9 (where a listing
    sells now), over the plan's floor of 4.0% (half the 8.0% it expected)";
  - **Cancel it** only when it misses that floor and the rule without the plan says cancel too (one step under the best ask
    misses your target, or no day reached it reliably), naming the plan's floor ("under the plan's floor, your 5.0% target
    (it expected 20%)" when the target caps it);
  - **Keep it** otherwise, the guard's own words, as it always said. The user's ruling ("Never add a Cancel"): a first
    version made this Cancel it too, which turned Compressed Fullerite-C32 (62404, 7,221 at 18,020, reached on 3 of 14
    days; a move to 18,970 loses 0.6% at the plan's 20,070) from Keep it to Cancel it.
  A buy no plan priced is judged as before. So a plan's verdict is the old one except where a move now pays, and a move's
  figure is the honest one: Unstable Heat Sink Mutaplasmid's (49729) read "still makes 253%" at a listing far over where it
  trades, now "3.5% … selling on at 23,540,000 (the plan's price)". **It relaxes only a plan expecting under twice your
  target**: above that the floor is the target, and the guard's resale (the plan's price where lower) and fees make the
  figure lower than the old one. Measured on 8 October (13:13 UTC, `.playwright-mcp/plan-cancel/measure/`: the user's 16
  open plan buys from D1's 13:01 read, ESI's public books and history, no cloud flow, the plan's items left, and again not
  left): no verdict changed; the 4 Cancel it now name the plan's floor. The four cancelled bids replayed on the same books:
  Fierce Exotic Filament reads Move it under both rules (the market moved since 10:14), the other three Cancel it under
  both; three of the four expected 13–15%, so their floor was the 5% target. Orders, To do's cancel item and the mail
  (which now quotes the why for a plan bid's move: `OrderFacts.planned`) name the plan's floor; the cloud's round runs the
  same rule.
- **A left order is judged on the days since it was placed** (`sincePlaced`, `LEFT_MIN_DAYS` 3 in fills.ts; `notSince`,
  `sinceLead`, `notReachedSince`, `firstPlaced`, `Relist.since` in relist.ts; the plans review, 9 October 2026). A left
  order's reach was counted over the last 14 days, which hold days before it existed: the 2 October plan's Place-and-leave
  bids, priced where trading reached on half the fortnight before, read "You're leaving this one: reached on 5 of the last
  14 days" for a week while the market rose away from them. Now an order left (`isLeft`), first placed within the window
  (`seen[0]`, never `issued`, which a price change moves) and with trading on at least `LEFT_MIN_DAYS` of the days since
  (the day it was placed counted whole, today folded in when watched; the order check and the cloud's round pass
  `recentRange`'s `end`) is judged on those days too:
  - **reached on none of them**, and not visibly filling (`fillingNow`), it's unreached whatever the 14 days say. A buy goes
    to where trading reaches now, `reachedBid` over the 14 days (the price Place and leave would bid today, the target of any
    left buy), never under the lowest the days since got down to, so the move is to a price trading reached since; then the
    8 October three-way rule (above) says Move it, Keep it or Cancel it. A sell goes to the highest the days since got up
    to (`reachedAsk` at 1, the brief's ruling), never under cost (Not worth it) and never under the best bid (one step over
    it, `overBid`, with "or sell into that bid");
  - **reached on some of them**, it's judged as before on the 14 days, and its "You're leaving this one" counts the days
    since ("reached your bid on 1 of the 7 days since you placed it");
  - **fewer than 3 traded days since**, placed before the window, or no window end passed (an older caller), nothing new.
  It's said first, the same everywhere (Orders under the verdict and in Clears in, "0 of 7 days since placed", a listing's
  "since listed"; To do and the mail for a move or a cancel, orders-alerts-todo.md): "Not reached on any of the 7 days since you
  placed it; today's best bid is 8.6% over", or for a sell "since you listed it; today's cheapest listing is 11% under",
  with "(it traded on 4 of them)" when some of those days had no trading, so they don't read as days of evidence. The
  mail names what the move's price is (`Relist.since.to`): "where trading reaches now", or for the floor "a price trading
  reached since you placed it". `reach` stays the 14 days' count: leave_track's pace divides it by 14.
  **Measured** (`.playwright-mcp/research/plans-review/since-placed.mjs`, out/since-placed.txt: the review's export, ESI's
  books of 9 October and history to 8 October, no watched flow, `leave` as exported): of the 13 open bids, 11 weren't
  reached on any of the 7 days since 2 October (465.3 M in escrow): 2 Move it (Fierce Electrical Filament 1,717,000 →
  1,723,000; Unstable Ice Harvester Mutaplasmid 11,780,000 → 12,310,000), 3 Cancel it (X-Large Ancillary Shield Booster,
  Raging Exotic Filament, and Zero-Point Field Manipulator, Cancel it already), 6 Keep it (304.7 M: Republic Fleet Commander
  Insignia II, Cataclysmic Gamma Filament, AG-Composite Molecular Condenser, Compressed Veldspar II-Grade, and Compressed
  Fullerite-C32 and Unstable Heat Sink Mutaplasmid, Keep it already); the 5 moves and cancels on To do and mailed (all over
  the 5 M minimum), the Keep its on Orders only; every one read "You're leaving this one" or as before.
  Golden Mykoserocin (1 of 7) and the Clone Soldier bid (3 of 9) stay left, said on the days since. The floor (the lowest
  since) decided only AG-Composite's price (875,400 over the fortnight's 857,300). Of 11 listings, 6 weren't reached since
  listed: 3 Move it (Raging Gamma Filament 9,672,000 → 9,660,000; Gravid Ballistic Control System Mutaplasmid 11,860,000 →
  11,510,000; the CNMGC 359,900,000 → 345,150,000; on To do and mailed), 3 Not worth it (Imperial Navy Infiltrator, Raging Dark Filament and
  Gravid Modulated Strip Miner Mutaplasmid: the most trading got up to since sells under cost); the Fed Navy Insignia,
  Villard Wheel and two Rocket Science listings were placed on 8 or 9 October and say nothing new. **The CNMGC**, listed 3
  October 11:33 and left by hand: nothing new on 4 and 5 October (history a day behind: one and two days since), Move it to
  345,150,000 from 6 October (3 October's high, the day it was listed); trading got up to 319.85 M, 337.85 M and 323 M on 6
  to 8 October, so that price wouldn't have sold, nor would 339.5 M (half the days since); today's cheapest listing on the
  9th was 320.3 M. The review's "+31 to +39 M at 337.5 to 345.5 M" needed a sale on 4 or 5 October, before history could
  say (with the cloud's watching folding the day in, the 5th at the earliest).
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
  The Per slot column's ISK a day doesn't subtract price-change fees. It first fired on 3-unit loot the market barely feeds (Blood Raider
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

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **A plan's buy is judged at today's fees and its plan's sale price.** `expected` uses today's rates, not the planner's
  then; the plan's price caps the resale even after the market rose past it; fees already paid on an order count against
  a raise; the guard doesn't look at whether the bid is visibly filling (the Key filled 16 → 9 → 7 and could still read
  Keep it). An unreached plan bid moves when the same guard clears the plan's floor (since 8 October 2026), and cancels or
  keeps as before otherwise, so it turns Cancel it into Move it only for a plan expecting under twice your target; above
  that the floor is your target and the plan's price, where lower than the market's, makes the move's figure lower.
  Orders' check of it was one snapshot of the user's orders with 4 buys (1 October 2026): the Praxis replay and the Key
  are the evidence; the unreached rule's, 16 open plan buys on 8 October with no cloud flow (market-reading-relist.md).
- **A left order's days since it was placed count the day it was placed whole**: trading that morning, before the order
  existed, counts as reaching it (which errs towards saying nothing), and ESI's history runs a day behind, so an order
  placed on the 3rd is first judged on the 6th (the 5th when the app or the cloud watched that day). Fewer than 3 days with
  trading since says nothing new. A price change doesn't restart the count (the first version's time), and the price a
  move goes to was reached on at least one of those days (a sell's is the highest since, a buy's no lower than the lowest
  since), so once moved there it reads as reached until those days leave the 14, when the usual count takes over: the
  CNMGC moved to 345,150,000 on 6 October would have sat there unsold and unflagged until about the 17th.
- **The token guard's history lags a market that moved over 10% within the fortnight**: falling, a real undercutter can
  read as a token. The share and day's-volume guards catch most (the Key's sell: 26 ahead against its pace).

Moved to orders-alerts-todo.md, with To do's limits: "Feeds a long queue" counting your own listings, and its To do
item.
