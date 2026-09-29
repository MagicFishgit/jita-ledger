# Positions, fees and results

Decisions worth not undoing. How a position, a fee and a period's results are worked out, and what the Wallet, goals and standings pages count.

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
- **"What your standings are worth" prices your real trading at other standings** (`lib/standings.ts`, Rates & fees).
  Every broker charge is the broker rate × an order's value (a price change × (1 − the Advanced Broker Relations
  discount)), so each fee ÷ the rate paid that day is the trading behind it, and that total × any rate is what the
  same trading costs there. It takes **every** broker fee the ledger holds, not a window: the user asked for all of
  it as it builds up. The rate paid each day is **measured**, the median of fee ÷ order value over that day's
  placements matched to their orders (`measuredRates`, at least 3, skipping 100 ISK minimums), because the kept
  `rateHistory` starts with setup noise: the user's read 2.23% until their first sync at 18:51 on 24 September,
  while their placements that day paid 1.331%; on 25–27 September they paid 1.328%, 1.306%, 1.298% as standings rose.
  Trusting each match's order value instead was tried: most of the ISK (58.8 of 80.2 M) is in unmatched fees and a
  few matches are wrong (implied rates of 7% and infinity), so one rate per day is sturdier. The chart's axis starts
  at zero; the "you" dot shows only once standings are known (synced, or typed), never at an unsynced 0 and 0.
- **Results reads the long run** (`lib/longRange.ts`). Periods run to a year and All; past 90 days the bars are
  weeks, past two years months (`unitFor`), and every average divides by the days the ledger actually covers, since
  a year's per-day from 24 days of data understated it fifteenfold. "Every item you traded" works a position out for
  every item (`computePosition` over all its trades, so fees and tax are matched as on Positions) and reports what
  sold in the period with its return, its average sale and how long stock was held (first in, first out). Trades
  tagged Personal are excluded, and an item whose every trade is Personal is left out whole: 31 such items (an
  Apocalypse and fittings bought to fly, 2.01 M for the hull alone) otherwise showed as 4.8 M of "orders that sold
  nothing", their fills excluded and their fees orphaned. Orders that sold nothing are said apart (the scoop's −3.18 M), because their fees over the
  cost of what did sell made "−1151.5%". Items sold with no recorded buy (loot, store and planetary goods) are
  counted by their activity, not here. "What kind of trading pays" groups the sold items by ESI category (looked up
  once per item and kept), price per unit and time held. On the user's ledger it agrees with the positions-based
  Trading line (−3.08 M both), as it should while all their trading sits in positions. The same total shows in
  "By activity" as **Every item traded**, a row under Trading and never added to the total: the user asked for
  a second line rather than a change to what Trading counts, which stays tracked positions only. `computePosition` now reads
  trades from an index by item kept per `d.txs` version (`tradesFor`): identical on all 376 positions checked,
  6× faster, and it no longer grows with items × trades.
- **Results attributes each ISK movement by one stated rule** (`attribute` in `results.ts`): positions' realized
  profit, filaments against abyssal loot, PI goods less customs, LP-store goods less the store's ISK, courier
  rewards, bounties; ships lost charged to the activity they died in. A trade a position counts is always
  trading, and an item in no set is left out rather than guessed at.
- **Asset safety is tracked, not guessed** (`assetSafety.ts`, `countStock`'s `safety`, `AssetSafety.tsx`,
  `worker/src/safety.ts`, migration 0011). The user had a wrap waiting for delivery to low-sec and asked to see it
  with a ticking timer, and whether the app copes with things arriving out of nowhere. It does: the wrap's contents
  were always in `total` (net worth), so delivery moves value rather than creating it; they're now their own "In asset
  safety" line instead of "Inside ships and containers", and unpacking's fee is "Asset safety fee" in the Wallet
  instead of Other. The Wallet shows each wrap, what's in it at CCP's estimate, and what unpacking costs (15%, or 0.5%
  by hand in the system). The countdown can't come from ESI: it's the client's, typed once ("14d 7h 24m 32s", kept
  as an absolute time in the synced `safetyTimes` doc), or, for a wrap the cloud saw go in, 20 days from then. Only the
  cloud can date one, since it reads the assets hourly: `safety_seen` registers each wrap once, with a row marking the
  last read, so a wrap appearing within 150 minutes of it went in since (`startKnown`); one there on the first read
  can't be dated. Both writers of the stock record carry what was learned forward (`mergeSafety`). The cloud mails once
  per wrap when it registers it (kind `safety`, "Asset safety registered"): the game already says when things go into
  asset safety and when they're delivered, so the user asked for the mail to say the app has picked it up instead.
  The list is **as packed**, since the user asked to open the station containers in it: each wrap keeps its ships and
  containers (`holders`, at any depth, a can in a ship's cargo inside the ship) beside the flat count by type that the
  fees and the mail use, and each opens to what's in it, worth counted with its contents. Their names come from
  `/assets/names` in a call of their own, so a refusal can't lose the wrap's name too; ESI's "None" is no name.
  The first version showed the user's "Equipment" container as "0 inside": it held only blueprint copies, which every
  count leaves out (a copy shares its original's price). So `contents` lists what lies in each thing with copies
  marked (shown, "· copy", worth nothing, and counted apart in the note under the list), and a ship's things under
  where they sit, as the game lists them (`bayOf`: Fitted, Cargo hold, Drone bay…). The user also asked about a Sigil
  showing nothing: ESI sends it packaged, and a packaged ship holds nothing.
  **EVE's own notification now dates the wrap** (`parseSafetyNotice`, `withNotices`, the optional notifications
  permission): the research found `StructureItemsMovedToSafety` carries the dates, the structure's name and the
  destination. The browser's sync reads notifications while a wrap waits and pairs each still-live notice with a wrap
  (one each in the order they went in when the counts match, else by the cloud having seen the wrap appear within
  three hours); the wrap keeps it (`notice`, carried by `mergeSafety` in both writers) and takes the structure's name,
  and its dates win over a typed countdown ("From EVE’s notification when it went in"), with the destination named.
- **A fee a GM refunded counts as nothing, everywhere** (`refunds.ts`: `refundPairs`, `nettedJournal`). The user's
  fat-fingered Sniper listing (19,489 Caldari Navy Uranium Charge S placed at 1,893,000 instead of 1,893) paid a
  467,749,600.65 ISK placing fee on 28 September 2026; CCP support refunded exactly that the same evening as a
  `gm_cash_transfer` from Caldari Navy, "Ticket #2734940". Counted as they came, the fee stayed on the snipe, in Results
  and in what standings are worth (~36 billion ISK of phantom trading), and the refund was "Other income". Now a GM
  transfer for exactly a fee's amount, from the party it was paid to, within 30 days, pairs with the latest such fee;
  in the view figures use, both read zero. The fee keeps its original amount (`refunded`) so fee matching still tells
  a placing fee from a change and doesn't estimate one in its place. The stored journal is untouched; the Wallet says
  what was left out. Checked on the user's ledger: the order's placing fee reads 0 (467,749,601 before), Other income
  +4.45 M, Fees & tax −208.66 M. While there, a raise's expected fee gained the broker fee on the increase
  (`matchFees`): the Ghoul's raise paid 333 k against ~254 k for its plain changes, and without it a big raise was
  matched to a smaller fee in the same second.
- **Purchases made in one go are one row in "Trades no position tracks"** (`multibuys`, `fittedShips`, `autoTag`'s
  `fitted` in `wallet.ts`; `useShipTypes`). The user bought a fitted Jackdaw through the Multibuy window (29 September
  2026, 18 purchases, 135,358,716.45 ISK to the cent) and asked whether the app handled it properly and completely. It
  did (each purchase read as bought from a listing, none as a snipe, nothing on Orders or To do, net worth with the ship
  and fitting inside it), except the Wallet: 18 rows, two clicks each to mark Personal, and until then 135 M of "Other
  purchases" and nothing in the runway. Now buys each within `MULTIBUY_GAP_MS` (2 s) of the last, at least 3 of 2+
  items, are one row that opens to its purchases, with one tag for all; two of the user's seven multibuys straddled a
  second, so it isn't "the same second". One with a ship in it (ESI category 6, looked up once and kept) is guessed
  Personal, "a fit to fly, most likely", which the Wallet's flows and runway count at once. **A guess counts only in the
  Wallet**, as the loot guess always has: Results, the cost of stock (`heldCost`) and the snipe finder read only what you
  marked, so the row offers **Confirm**, which marks every purchase in it. On the user's ledger: 5 multibuys, two with a
  ship (the Jackdaw, and 20 purchases for 321 M on 24 September).
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
- **Rates & fees says what the skill queue is about to do** (`lib/skillQueue.ts`, scope `esi-skills.read_skillqueue.v1`,
  registered 29 September 2026). The sync keeps the queue in order (`meta.skillQueue`); each trade skill in it that
  raises a level you have is shown with what it changes when it finishes, worked out from skills and standings (not
  typed-in fees, which say so): sales tax for Accounting, broker fee for Broker Relations, the price-change discount
  for Advanced Broker Relations, order slots for Trade, Retail, Wholesale and Tycoon. Levels queued one after another
  build on each other. The app already followed a finished level on the next sync; this is the preview.
- **Omega's "Could trading pay for it?" counts every item, as Results' "Every item traded" does** (`everyItemCalcs` in
  `components/everyItem.ts`, shared with Results). It counted realized profit on tracked positions only: 17.77 M of the
  user's last 30 days (29 September 2026), which they took for a stale or broken figure, against 92.13 M over the 30
  items they bought and sold. A month of Omega (500 PLEX at 4.91 M) is 2.46 B, so it covered about 4%, which is true. The
  Alpha savings estimate reads every Jita sale and order the same way. Freelance and the rest aren't trading: the card
  says Results has them. The 3-month pack's box said "PLEX for 3 months" with a placeholder cut to "from the"; it's now
  "3-month pack, in PLEX" with "whole pack", and the line above says where the store shows it. The skill payback table
  shows the queue ("Queued: V, done 23 Oct") and missing prerequisites (Tycoon "Needs Wholesale V and Marketing IV
  first", not "0.0 days").
- **Net worth keeps one snapshot a day in this browser** (`Data.netWorth`), written by the Wallet page. ESI has no
  net-worth history, so the trend starts the first day the page is opened and says so.
- **Goals are five kinds, each measured from something the app reads** (`lib/goals.ts`): afford N of an item
  at the live price (units bought on the market since the goal was set come off what's left, so buying PLEX
  in small lots counts), hold N of an item (hangars plus sell orders), save ISK (wallet, wallet + orders, or
  net worth), earn over a period (positions' realized profit or net cash flow), train a skill. Any can carry a
  deadline, which turns the ETA into "needs X a day, going at Y". A reached goal is stamped once and stays
  reached. Old `{ kind: 'wallet' | 'nw' }` goals are read as ISK goals.
- **ESI has no PLEX vault endpoint** — none of its paths mention PLEX or a vault. A PLEX "hold" goal starts
  from the count you give it and follows your market trades; PLEX from the store isn't visible.
