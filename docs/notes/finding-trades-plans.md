# Finding trades: a plan started

Split from finding-trades.md on 19 October 2026. Decisions worth not undoing. What "Start this plan" makes and what
follows: the positions, the placing checklist and what it counts, items cancelled, closed or skipped, the re-check
against today's book, and the list step for what the plan bought.

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
    October 2026) found that a bid placed, cancelled, and then a plan started with the item never asked for it (finding-trades-plans.md).
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
    The hangar cap has a cost (finding-trades-plans.md): a hangar read from before a fill reads the item as none, so a filled buy reaches
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
    far under can say the market moved down (finding-trades-plans.md). The position page's "The plan sells at" reads the same book and
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

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **The plan list step's "market moved down" reads others' cheapest listing as it is**, so one unit listed far under real
  stock says the market fell and puts the "over today's cheapest listing" caveat on the profit. The app's token guard
  (`marketBest`, Orders' real front) was tried and couldn't be used: on Federation Navy Fleet Captain Insignia I's book it
  read 919,000 where 379 real units sat from 801,200 (known-bugs.md), hiding the very case the check exists for. The figure
  is said, so a token shows as what it is.
- **A plan bid cancelled with nothing bought takes its item off the plan, and when it was cancelled can't be told**: ESI
  doesn't say. So the bids that count are those placed since the plan started (less two minutes' slack), or since the
  item's position opened when that was within the day before the plan; a bid placed after such a position opened and
  cancelled before the plan started still reads as cancelled for the plan, and the checklist doesn't ask for it. Not the
  hour before the plan that placing falls back to: there a bid placed and cancelled before the plan would drop the item
  for good (the review, 8 October 2026), so a bid placed in that hour and cancelled after the plan started is asked for
  again. A new bid counts as placing it. An expired bid with nothing bought is asked for again (finding-trades-plans.md).
- **A plan bid's re-check against today's book happens only where the checklist or To do is open** (finding-trades-plans.md):
  the cloud doesn't read plan bids not yet placed, so nothing mails "the market moved" for one, and a bid placed straight
  from the game without opening either is placed at the plan's price unchecked. **A skipped item placed again by a bid that bought at once reads as no plan's** on Orders, To do, the list step, the hangar
  check, the position page and the cloud's round (`planTargets` calls `planPlacement` without trades) until the order arrives
  from ESI's order history, up to about an hour; the checklist counts it at once. **A skip is kept in the synced plans doc,
  and an older build's save drops it** (`sanitizePlans` keeps only the fields it knows, as with every late field): a device
  on a version from before it that saves its plans writes them without `skipped`, and the item is asked for again until
  skipped again; browsers reload to a new version within minutes. **Skip it leaves the position open**: To do offers to
  close one the plan opened while nothing is in it, never one it took over (that one stays open, empty of the plan's part).
  **A bid placed after a skip is the plan's again for its prices but not left alone**, until Place it after all: Leave
  alone is given back only by that button, and an item left by hand isn't let go by a skip at all.
- **A plan's filled buy can take up to about an hour to reach "Bought: list it"** (the list step, finding-trades-plans.md):
  its trade arrives when ESI's copy of your trades turns over (held an hour), and the stock to list is held to what the
  Jita hangar held at its last read, also an hour's copy, so a hangar read from before the fill reads it as none until the
  next. The cap is what stops a listing that sold coming back as stock to list; the cost is that wait.
