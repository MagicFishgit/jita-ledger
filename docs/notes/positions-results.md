# Positions, fees and results

Decisions worth not undoing. How a position, a fee and a period's results are worked out, and what the Wallet, goals and standings pages count.

Split on 19 October 2026 to keep each file's notes under the instruction budget (CLAUDE.md, "Notes by topic"): this note
keeps positions and their fees; Check my hangar is in positions-results-hangar.md, and Results, the Wallet, income,
asset safety, standings, Omega and goals in positions-results-wallet.md.

- **Close keeps a position's result; Delete erases it.** Closing stops counting from that moment and keeps the
  profit or loss, fees included, in Results and trading profit; deleting drops the position, so its result leaves
  the books and its ESI trades become untracked (the Wallet's "Trades no position tracks"). The user deleted a
  Syndicate Gas Cloud Scoop position they had backed out of (a buy for 2 at 99.79 M, cancelled unfilled), which
  quietly took its fees off Results. So: `finishedPosition` flags any open position with nothing in stock and no
  order open on the item as `soldOut` or `backedOut` (not only sold-out ones, as before), on the To do list, the
  Positions list ("Finished") and the position's own page; Delete says what it takes off the books and offers
  **Close instead** (`chooseAsk`'s `alt`); Close warns first when stock or open orders remain, since later sales
  won't count. Delete is for mistakes: the wrong item, a duplicate.
- **A position says where to list and wait, not only what selling now would do** (`PositionDetail`: "List
  patiently" and "List safely"). The user's question: I bought this, the market is down on what I paid, so what
  price will it come back to if I just leave it listed? Patiently is the price the bulk of trading got up to on
  half of the last 14 days (`reachedAsk`, the 7th-highest high, with watched Jita sales folded in); safely, on
  most of them (`FILL_MOST`, 11). Each shows the profit if all the stock sells there, the margin on what an open
  buy order is still filling (the resale to plan a slow, deliberate buy at, shown even before anything fills),
  how many days trading got there, and a rough time at your share of buyers scaled by those days. On the user's
  Rocket Science, down to 85 k against an 87,860 break-even: patiently 97,650, safely 92,200. "Average sell
  price" became "Your average sale": it's your own sales, and it read like a market price. The cheapest seller to
  undercut is judged on the whole book from others, like the chart: on the snapshot's five levels the token rule
  called 727 units at 92,440 the market, which the whole book (19,000 a day trades) showed to be a skim. The
  undercut's selling time is scaled by how often trading reached its price, like the patient ones: the Arbalest's
  cheapest listing, 62,920 (a two-level market: bids filled near 24,600 daily, listings taken at 63–71 k on 4
  days of 14), claimed 75 days, faster than a price reached on 7; it's about 310. "Sell to buyers right now" walks
  others' bids only: the top bid was the user's own 3,910-unit buy order.
- **A broker fee belongs to its order's units, not to the moment it was paid** (`computePosition`). A
  buy order's fee goes into the stock's cost; a sell order's fee is charged per unit as units sell; the
  share for units still waiting on an open order is `prepaidFees`, shown beside the profit rather than in
  it; a closed order's unfilled share is spent. Charging fees when paid made a PL-0 Scoped Cargo Scanner
  position that had sold 5 of 2,039 read −1.05 M and "−2325% return", when those 5 had made money: the
  listing fee for all 2,039 had been charged against them. A test checks cash + stock at cost + prepaid
  fees = realized (less `oversoldNet`, below).
- **Each trade and each fee belongs to one position: the one trading the item at that moment** (`ownerAt` in
  `positions.ts`). Positions of one item whose days overlap used to both count the shared trades and fees, doubling
  the all-positions totals, the Wallet's trading profit and Results' Trading line; the likeliest way in was closing
  a position and starting another "from today" (00:00, the default) the same day. A trade two would count is the
  one's that added it by hand, else the earlier-opened one's; the other lists it as "No, another position counts it".
  A fee goes by when it was charged (the placement's time from the fee match, never `issued`, which a price change
  moves: an order placed before the start and repriced inside it counted its whole placing fee). A fee charged before
  any position, on an order still open or whose fills the position counts, is the next position's, less the share
  for units that filled before its start (its side's trades at one of its prices in between). Fees on orders placed
  before the start used to be dropped though their fills counted. The user's own case: a sell order placed 90 s
  before their 5141 position started, its fills excluded by hand, so it stays out. Only the ledger's own positions
  share things out: Results' every-trade walk (`all:` positions) still sees everything. New starts, moved starts
  and reopening can't create an overlap (`startAfter`, `laterPosition`), and say so when they move a date.
- **Units sold beyond what a position bought are left out of its profit, not given a cost** (`oversold`,
  `oversoldValue`, `oversoldNet`). With no buy at all they were costed at their own sale price, so they read as
  exactly nothing; after some buys, at the last average, a guess. Their revenue, tax and fee share are now said apart
  on the position ("left out of the profit rather than guessed at"). On the user's ledger (28 September 2026) this
  moved nothing on their five positions and took 104,465 ISK off Results' every-item Trading line, from three items
  where more sold than was ever bought (one sold 2 of 4 units with no recorded buy, 676,200 ISK of sales).
- **A plan counts a position it took over from its own start, and the stock held then isn't its** (`planView` and
  `sharesPosition` in plans.ts, `planPosition` in positions.ts, the never-stored `view` on a position; the Plans panel, and
  Positions with a plan shown). Starting a plan takes the position an item already has open (one position per item stays
  the rule), and the user's second plan (2 October 2026, 999 M in 33 items, Place and leave) showed Datacore - Rocket
  Science's sales since 24 September (9,372 for 876 M) as the plan's, with its bid of 188 placed and nothing of it filled:
  both summed `computePosition` over the whole position. Now a plan sees a view of it: opened at the plan's start, with
  trades counted by hand (`included`, and ones typed in) only from then. The units the position held just before the plan
  (its stock then, 2,628 there) are the earlier trading's, since the user wants each plan "its own contained thing": sales
  since take them first, and that part of each sale, revenue and tax, is none of the plan's; only what sells beyond them
  counts, against the plan's own buys, and beyond those too is left out of its profit as usual (`oversold`), never costed.
  A sell order placed before the plan lists that stock, so its fees aren't the plan's; a buy placed before it and still
  working shares its placing fee as at any position's start. Tested on the case's figures: after a 2,000-unit sale nothing
  of the plan's has sold; 1,000 more are 628 of the earlier stock and 372 the plan's, 188 against what it bought and 184
  left out; the whole position doesn't move (12,188 bought, 12,372 sold). The row says "Shared since 24 Sep: counted from
  the plan's start", its tip what it held and how much of that has sold; its status (Finished or not) stays the whole
  position's, and the unfiltered list, the tiles, Results and the Wallet read whole positions. The start dialog names the
  items that already have a position and since when, and says the plan counts them from now. **A position opened for the
  plan counts whole** (`planCountsWhole`): within the day before it (`POSITION_BEFORE_MS`, the window in which the
  checklist counts a bid on it as placed for the plan) with nothing traded before the plan. Counted as a view it lost a
  fee, since fees exist without trades: the 30 September plan's Vigilance Resonance Key (position 00:35:02, its bid of 15
  placed 00:36:15 and cancelled unfilled after the plan at 00:41:37) read 12.07 M of broker fees against the whole
  position's 16.75 M, the bid's 4,679,391 ISK gone, untagged and dated from the plan (the review, 2 October 2026). Any
  other position open before the plan is a view and tagged, traded or not: Clone Soldier Transporter Tag's, opened by the
  30 September plan, is one under the 2 October plan, with nothing filled but its earlier bid's fees paid.
- **A plan's position says what the plan sells at** ("The plan sells at", `PositionDetail`, from `planTargets`), beside List
  patiently and List safely, while the position belongs to an open plan: the plan's `sellAt`, what the plan's own units
  make if they sell there after fees (and what an open buy is still filling), whether the plan places and leaves or follows
  the front, and its name. Drawn without history too (List patiently isn't), and before anything fills. Under break-even it
  says so, and for Place and leave that the plan's list step lists at break-even instead (finding-trades-plans.md, "the
  checklist's second part"). **The plan's units at their own cost** (`planListRow`, the same as the list step): the review
  (2 October 2026) found the page working break-even out on the whole position's average, which on a shared position
  holds the earlier stock: Rocket Science's plan of 188 at 85,540 breaks even at 90,810, the whole position's average at
  84,990, and the checklist and the page would have named different figures.
  The user's Imperial Navy Infiltrator (2 October 2026): the plan at 1,836,000 makes +7.5%, List patiently the same
  1,836,000, List safely 1,666,000 under its 1,708,000 break-even; before, nothing on the page tied any of them to the plan.
- **"List your stock in one paste" lists what you bought through the Sell window** (`ListStock.tsx` on Positions,
  `judgeStock` in lootList.ts, `hangarCosts` in orderCheck.ts, `readLootMarket`). The user agreed to the research's
  first idea: List loot's paste for "stock from filled positions, planner plans and snipes". The hangar is unlisted
  stock by definition (a sell order holds its own goods), and stock with a cost (an open position's average, else your
  latest buys, `heldCost`, Personal left out) is stock you bought; loot, never bought, stays List loot's. Each item is
  priced as Orders prices a new listing (`listingPrice`) and never under break-even: one that sells under what it
  cost now is unticked, flagged, and priced at break-even if ticked. Break-even covers the broker fee's 100 ISK
  minimum, or a small order read "−39.66 ISK" at it. A mix of bought and looted units says "bought 1 of 3" and is
  costed at the bought ones'. Ships, and containers and the like in use, are left out, as on List loot. Linked from
  the Sniper's "Your snipes" and the Capital planner (`positions?list=stock`). On the user's hangar (29 September
  2026): 11 bought items, 3 of them ships; 4 ticked for 21.75 M over cost (the sniped Uranium Charge S +21.33 M), and
  the Jackdaw fit's spare scripts unticked, since they now sell under what they cost.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **A plan's view of a position it shares is split by time, not by order** (positions-results). A bid placed before the
  plan that fills after it counts as the plan's buying, and an older plan sharing a position with a newer one counts the
  newer one's trading too: Clone Soldier Transporter Tag's position is the 30 September plan's, with its 4-unit bid still
  open, and the 2 October plan's. Telling them apart would need each fill matched to its order, which ESI's trades don't say.
