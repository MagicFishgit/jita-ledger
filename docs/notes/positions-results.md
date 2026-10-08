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
  says so, and for Place and leave that the plan's list step lists at break-even instead (finding-trades.md, "the
  checklist's second part"). **The plan's units at their own cost** (`planListRow`, the same as the list step): the review
  (2 October 2026) found the page working break-even out on the whole position's average, which on a shared position
  holds the earlier stock: Rocket Science's plan of 188 at 85,540 breaks even at 90,810, the whole position's average at
  84,990, and the checklist and the page would have named different figures.
  The user's Imperial Navy Infiltrator (2 October 2026): the plan at 1,836,000 makes +7.5%, List patiently the same
  1,836,000, List safely 1,666,000 under its 1,708,000 break-even; before, nothing on the page tied any of them to the plan.
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
- **"Check my hangar" says which of what you hold a position could count** (`lib/hangarCheck.ts` pure and tested,
  `HangarCheck.tsx`, a button in Positions' head beside Check for new trades; 3 October 2026). The user came back from
  exploration with loot in a Jita 4-4 container named "Lewds", some of it items their plan had buy orders on, and asked
  whether selling it affects the plan. It does: a position counts every Jita sale of its item after it opened (`matchTx`)
  and EVE's trades don't say which stack a unit came from, so a loot sale is taken from the position's own units at their
  cost; sold after the plan's buy filled, the plan reads them as sold and its list step asks to list too few, and a loot
  sell order counts as the plan's stock listed (`listedSince`). **Marking the trade Personal on the Wallet doesn't keep it
  out of a position**: `computePosition` never reads `d.ignored`; only the position page's per-trade Exclude does. Their
  words: "create a button to click in positions that checks my jita inventory and then gives me a list of items that is
  there that could affect orders. this could be a modal that opens up", then, on the design, "rather let the button have
  me choose where to look".
  - **On open it reads your assets afresh** (`fresh`, nothing saved or synced) and the names you gave the things holding
    things, a thousand a call in calls of their own (ESI's "None" is no name), and says when ESI's copy was taken (its
    expiry less the hour ESI holds assets), with Read again. Without the assets permission it says a new login asks for it.
  - **You pick where to look**: every place you hold things, Jita 4-4 first (always there, with its hangar, to fall back
    on), then by units held; under each its hangar, any other bay of the station's own with something in it (deliveries),
    every container and ship holding something as a path ("Battle Chicken › Equipment", one you didn't name by its type),
    and the whole place. Stations by ESI's names, structures by `structureInfo`, as the Wallet's "Where your wealth sits".
    Asset safety wraps and all in them are left out (they have their own panel). The pick is kept per browser
    (`jita-ledger:hangar-pick`), falling back to Jita 4-4's hangar once that container or place is gone.
  - **Held** is packaged, sellable units at any depth: not a blueprint copy, not anything fitted (`bayOf` "Fitted", loaded
    charges too), not an assembled item (`is_singleton`: a ship in use, a container, an unpacked module), not a wrap's.
    A ship's cargo, drone bay and other bays count and are named ("Battle Chicken › Drone bay").
  - **Each item a position counts** (any open position of the type; two open of one item have their stock **summed**, each
    trade being one's by `ownerAt`: taking the earliest's alone read 20 of 30 held as not theirs, the review of 3 October
    2026; Open the position opens the earliest, the one `ownerAt` gives new sales to, and says so when there are two):
    where its units lie in the pick, what the positions count as their own stock (with a plan holding it,
    `planTargets`, matched to whichever position its item names, the plan named and its view's stock beside,
    `planPosition`; nothing beside a stock of 0 the plan counts whole, where "0 / all the plan's" read as if something
    were), your open sell orders' units and what your buys still buy, and **Not the position's**: units held where the
    position counts (Jita 4-4's whole station, every spot, this read) plus those listed, less the **whole position's**
    stock, never below 0, said "of the 22 you hold in Jita 4-4" so a pick of one container isn't misread. **A position with
    Only Jita 4-4 trades off** counts sales and orders anywhere, so its held units are every station's in the same read
    (same exclusions) and its listed and buying all your open orders of the item ("of the 30 you hold anywhere"). Rows with
    such units first, under "10 of Datacore - Rocket Science aren't the position's. Selling those units counts against the
    position (and the plan): sell them and Exclude each sale on the position's page, or keep them apart until the position
    closes" ("Some of it isn't the position's." while the item's name hasn't loaded, never "Item #20420" in a sentence).
    **The lead speaks only of rows a sale where you're looking would count**: outside Jita 4-4 a Jita-only position's row
    sits under "Sold here they don't count", and a lead telling you to Exclude sales beside that read as the opposite (the
    review; it was offered to say "in Jita 4-4" instead, and dropping it there was the cleaner ruling). **Against the
    whole position, not the plan's view** (a ruling against the brief's formula, 3 October 2026): on Rocket Science's
    shared position (2,628 held before the plan, all listed; the plan's view 0) with 10 loot in Lewds, the view's stock
    would say 2,638 aren't the position's and tell the user to Exclude sales of the position's own earlier stock, which
    would leave its stock above zero for good; the view already sells those first (`heldSold`). Against the whole it's 10,
    the units a sale would wrongly take, from the position and, once the earlier stock is gone, from the plan.
  - **ESI's copies are of different ages, and a count that may be off for it says so** (`Copies`, `copiesOf`, `Stale`,
    `fills`/`atLeast`, `leadRows`, `leadSaid`, `doubtSaid`, `softSaid` in hangarCheck.ts; the reviews of 3 October 2026).
    Held comes from this read of your assets (up to an hour old), the position's stock from the trades the last sync read
    (ESI holds them an hour), listed from your orders (20 minutes). A bid filling between the trades' copy and the
    hangar's puts units in the hangar the position doesn't have yet; a sell order placed after the hangar's copy is in the
    copy and on the order; both happen in the user's own case (a plan's bids filling), read as not the position's, and the
    lead would then have had them Exclude real sales, which corrupts the position. The copies' times: the assets' from the
    read's expiry less an hour, the trades' from `meta.expiries.transactions` (or `tradesFreshAt`) less an hour or the
    newest trade held if later, the orders' from `meta.expiries.orders` less 20 minutes.
    - **Copies within `SAME_READ_MS` (5 minutes) of each other are one moment.** Both readers take all three seconds apart,
      the hangar's last (the sync: trades, orders, assets; the cloud's archive: orders, trades, assets). The first fix also
      flagged a bid still open when the orders were read before the hangar's copy: in one read pass that is every item with
      an open bid, the moment the user opens the app after exploring, and Check for new trades couldn't clear it, since a
      sync gets ESI's same trades copy until its hour is up (the re-review's run, `scratchpad/stale.mjs`: a bid of 200, 100
      recorded, 10 loot; all three passes read 10 rightly and flagged it, no lead). That clause is gone.
    - **A bid's fills the trades don't show yet are said apart, and the row stays in the lead** (`fills`, `atLeast`): only
      with the hangar's copy more than 5 minutes newer than the trades', each bid's fills not matched to a trade (at its own
      prices since it was placed, then, for one that bought at once, at listing prices under its own within a minute of
      placing it; one placed before the trades begin held to its fills since the app first saw it), less what a version of
      it first seen after the hangar's copy shows it filled since (those can't be in the copy). The count less them is what's
      certain: "At least 8 of Datacore - Rocket Science aren't the position's; up to 2 more may be your bid's fills since your
      trades were read, 8 Oct, 11:59 ET". One whose every unit may be fills leaves the lead and says so ("All 188 may be…").
    - **listed** (an open sell order first placed, `seen[0]`, after the hangar's copy) and **sold** (a sale the trades show
      after the hangar's copy not at a price of a sell order placed before it, into a bid; or, with the orders' time known,
      one after the orders were read at a price of one of your sell orders, which their copy still lists) take a row out of
      the lead: it isn't lit, its cell says why ("May include units listed since ESI's copy of your hangar, …"), and a line
      says not to Exclude on it until ESI lets go of its copy of the hangar and it's read again.
    - **What no copy can show** is a soft line on the lead, only past the same 5 minutes (a trades' copy newer than the
      hangar's errs safe and says nothing): "Bought any from a listing, or did a bid of yours fill, since your trades were
      read at …? Those read as not the position's until ESI's next copy of your trades, due …: Check for new trades won't
      bring them in before then." The button is offered only once that copy is due (`tradesDueAt`); before then a sync
      reads the same one. No hangar time, nothing is said. Each clause was planted wrong and failed `npm run check`.
  - Below, items held there with an open Jita 4-4 order of yours and no open position ("selling them doesn't touch a
    position"); orders elsewhere aren't in that list. A place outside Jita 4-4 says a Jita-only position doesn't count
    sales there, and brought to Jita they do; an item a position counts anywhere is said apart. Nothing a position counts
    or a Jita 4-4 order covers is said plainly ("Nothing in Lewds is an item a position counts or one of your Jita 4-4
    orders covers": "one of your orders" was false beside an Amarr order on an item held in Amarr). Orders not read leave
    the listing and the count "–", never 0.
  - **Here, not beside List your stock** as the brief had it: List your stock hides itself when nothing bought sits loose in
    the hangar, which is exactly a hangar of loot.
  - The page check (its own `hangar` case, both widths, the dialog open): Lewds holding 10 of the plan's datacore beside
    12 in the hangar (10 not the position's, of 22), a blueprint copy of a position's item, Tritanium nothing covers and
    drones on a sell order; a ship with a fitted Damage Control II beside a position's 2 loose (2 held, none not its);
    Amarr; the pick kept on opening again; a column's tooltip shown inside the dialog. Counting the fitted one, and
    drawing the tooltip at the root (gotchas.md), each failed it. Since the review: the sync read trades and orders after
    the hangar's copy, and one Damage Control II was listed after it (1 not the position's, flagged listed, out of the
    lead, no Check for new trades); Amarr draws no lead; opened again, ESI refuses the names (the read still shows, Lewds
    goes by its type, the pick by item ID kept) and the hangar's copy is 10 seconds old, about 6 minutes newer than the
    trades, the plan's bid having filled 2 more than they show (the lead "At least 8 of Datacore - Rocket Science aren't the
    position's; up to 2 more may be your bid's fills…", the cell "at least 8", the soft line with ESI's next copy of the
    trades not due, no Check for new trades); then the assets read fails (said, the last read kept). Phase one asserts no
    soft line (the trades read after the hangar's copy). The plain loads open the dialog with the stand-in login, which has
    no assets permission, and assert it says to log in again. Not passing `copies`, not drawing the doubt, the soft line or
    "at least" each failed it.
- **Rates & fees says what the skill queue is about to do** (`lib/skillQueue.ts`, scope `esi-skills.read_skillqueue.v1`,
  registered 29 September 2026). The sync keeps the queue in order (`meta.skillQueue`); each trade skill in it that
  raises a level you have is shown with what it changes when it finishes, worked out from skills and standings (not
  typed-in fees, which say so): sales tax for Accounting, broker fee for Broker Relations, the price-change discount
  for Advanced Broker Relations, order slots for Trade, Retail, Wholesale and Tycoon. Levels queued one after another
  build on each other. The app already followed a finished level on the next sync; this is the preview.
- **Omega's "Could trading pay for it?" counts every item, as Results' "Every item traded" does** (`everyItemCalcs` in
  `lib/everyItem.ts`, shared with Results). It counted realized profit on tracked positions only: 17.77 M of the
  user's last 30 days (29 September 2026), which they took for a stale or broken figure, against 92.13 M over the 30
  items they bought and sold. A month of Omega (500 PLEX at 4.91 M) is 2.46 B, so it covered about 4%, which is true. The
  Alpha savings estimate reads every Jita sale and order the same way. Freelance and the rest aren't trading: the card
  says Results has them. The 3-month pack's box said "PLEX for 3 months" with a placeholder cut to "from the"; it's now
  "3-month pack, in PLEX" with "whole pack", and the line above says where the store shows it. The skill payback table
  shows the queue ("Queued: V, done 23 Oct") and missing prerequisites (Tycoon "Needs Wholesale V and Marketing IV
  first", not "0.0 days").
- **"All income against play" sits beside "Trading against play" on the Wallet** (`AllIncome` in Wallet.tsx, its sum in
  `lib/income.ts` since stage 2b of several characters, pinned by `npm run check-income`; the shared
  `useActivityEvents` in `components/activityEvents.ts`, which Results now uses too; `otherSales` in results.ts). The user:
  the trading card "only tracks trading via positions but I have other income as well" (30 September 2026). It counts
  everything you earned in the window, each thing once:
  - trading as every item bought and sold again, by its profit (Results' "Every item traded": positions, snipes, the rest);
  - each other activity by Results' rules (freelance rewards less what the jobs cost, abyssal loot less filaments and ships
    lost, bounties less ships lost, and so on);
  - what was sold but never bought (loot, salvage, ore, datacores, gifts) by what it sold for after tax: an item bought
    and resold counts by its profit, never its sale value, which the first version got wrong (it read +981 M of "other
    sales" on the user's ledger copy, snipe resales among them);
  - items an activity counts (filaments, abyssal loot, planetary and loyalty-store goods) left to that activity.
  Play is the same Personal spending as beside. On the user's ledger copy (to 27 September): never bought +973.81 M (led
  by 213.5 M of Datacore - High Energy Physics), combat +172.83 M, abyssal +1.81 M, every item −6.36 M; 366.5 M on play.
  Without ESI's item groups only trading, hauling, freelance and bounties count, and both pages now say so (Results said
  it counted those, but counted nothing). Freelance's trades are a job's items in its window over every job you did, finished ones
  too, and a tagged one is no job's, as on the Wallet (2 October 2026; loyalty-hustles.md); the Wallet's row for one says
  "during a freelance job of yours that takes it".
- **Daily goals and AIR rewards are income, for every character** (`REWARDS` in wallet.ts, the Rewards activity; the user,
  1 October 2026: "air rewards and goal payouts should count as income for any character including my main"). They were
  "Other income" on the Wallet and nowhere in Results, All income or a card's Earned: in D1 that day, 16 goal payouts
  (7.12 M) and 14 AIR rewards (687,500) on the main since 24 September, one of each (445,000, 75,000) on FannySchmeller.
  Now the Wallet has a "Goals & AIR rewards" line and Results a Rewards activity, which counts without ESI's item groups
  and asks no hours (they come with whatever you play). The set is ESI's ref types for what CCP pays for playing, read
  from its spec: daily goals, the AIR career program, and the older challenges, milestones, opportunities and campaign
  objectives, four of which were "Bounties & missions" and so Combat (none in the user's journal). A corporation's tax on
  a payout (`daily_goal_payouts_tax`) is a fee on the Wallet and nets in Rewards.
- **ISK moved between your own characters is neither earned nor spent** (stage 4 of several characters, 1 October 2026;
  the rule is in characters.md). The owner's 100 M to FannySchmeller on 30 September read as 100 M of play. Now play,
  the runway's burn, running costs, the day's biggest cost, the month's report, cash-flow goals and the unusual-activity
  list leave it out, and the Wallet shows it once, as "Between your characters" under money in and out (`check-income`
  proves those figures equal with and without transfers). What reads the balance still moves with it, on purpose, since
  the main's wallet did change: Wallet today, Since your last visit, the balance line, net worth and its daily point.
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
