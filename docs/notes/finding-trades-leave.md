# Finding trades: Place and leave

Split from finding-trades.md on 19 October 2026. Decisions worth not undoing. Place and leave: priced behind the front
on the fortnight, Market moved, the round trips a plan expects, the run-up bar, and the orders you're leaving alone.

- **"Place and leave" prices a plan behind the front on purpose** (`ProspectFilters.patient`, the planner's Pricing
  choice). The user's longer-term strategy is large orders in many items that fill over weeks, without the 0.01 war.
  Both sides are priced where the bulk of trading reached on half the last 14 days (`reachedBid` / `reachedAsk`, the
  same as a position's "List patiently"), **wherever the front is**: not capped at one tick over the best bid, since
  on the scoop and Hammerhead II the front bid sat below where trading reached and was the one that never filled.
  Each side's pace is scaled by the share of days trading reached its price (`throughput(..., reach)`), which is
  rough and says so; since 9 October 2026 what a plan expects is scaled by how often each item's prices came round within
  the horizon (below). Items without the days to say where trading reaches are left out, never priced at the front.
  The mix now shows Buy at and Sell at.
- **"Market moved" says when today's book has left Place and leave's prices** (`marketMoved`, `marketMovedSaid` and
  `MARKET_MOVED` 0.05 in prospects.ts; flag `marketMoved`, on Place and leave only; `MOVED_FLAG` in planner.ts). Place and leave
  prices both sides on the fortnight wherever the book is (the recent window was left off it on purpose). The user's
  second plan (2 October 2026, 15:36 UTC) showed what that costs once the market has moved: within the hour a third of
  it sat where the market wasn't. Fallen: bids far over today's best bid, or at the cheapest listing, which buys at once
  (Raging Dark Filament at 1.711 M against 1.44 M; Imperial Navy Infiltrator's 1.658 M over a 1.608 M listing), with
  sales over today's listings; spread gone (Gravid Modulated Strip Miner Mutaplasmid to sell at 13.8 M, listed at 11.31
  M); risen: bids 8-17% under today's best (Compressed Fullerite-C84 at 7,639 against 9,250; ~122 M in escrow on six).
  Now, on the book the planner is given (the scan's, live for the items the cloud watches), an item is flagged when the
  patient bid is more than 5% under or over today's best bid or at or over the cheapest listing, or the sale more than 5%
  over the cheapest listing. Its tip says which side moved, by how much and against what. (It was a flag, not an
  exclusion, which Leave out flagged items dropped, until 9 October 2026: below.) **It flags close to half**: on the cloud's 2 October scan at the user's settings,
  80 of 176 Place-and-leave candidates at 12 hours (45%: 37 sales over, 31 bids under, 25 over, 4 buying at once) and 421
  of 894 at 7 days (47%), the same with or without the watched books laid over the scan's. With the switch on, the
  12-hour pool goes from 109 to 69 and its mix from 144.5 M a day to 130.4 M; the 7-day from 100.3 M to 55.3 M, 4 of its
  6 items moved. On the live books at 17:00 UTC (the user's own orders taken out), 11 of the plan's 33 items flag on its
  own prices, and 8 of the 28 the planner still prices: every one listed above but Raging Gamma Filament, whose book
  moved again (`.playwright-mcp/plan-fixes/`).
- **Place and leave leaves Market moved out by default** (`MOVED_FLAG`, `plannerPool`'s `keepMoved`, `moved` and `movedOut`
  in planner.ts; "Keep items whose market moved" on the planner, shown with Place and leave, off by default, kept per
  browser; the user chose it from the plans review, 9 October 2026). The review: the 11 items the flag carried on the 2
  October plan, already flagged on the 11:25 scan before the plan started, settled −6.0% per ISK at the 9 October bids
  against −2.5% for the other 22; leaving them out would have saved about 6.9 M (3.7 M at listing prices). The flag acted
  only with Leave out flagged items on, which was off. Now it's left out whatever that switch says, and the mix says how
  many ("1 left out because its market moved"); the switch brings them back with their flag. **Its own rule, not one of
  `SWITCH_EXCLUDES`**, so each switch decides its own flags and none is counted twice: a moved item left out is counted
  under Market moved alone, and Leave out flagged items, on, takes a kept moved item out only for another flag. An empty
  or short mix names what each rule left out, with Keep them / Switch it off. At the front nothing changes: only Place and
  leave carries the flag. **Measured on the 2 October plan's start** (`.playwright-mcp/plan-review-fixes/
  measure-moved-default.mjs` and `.json`: the 11:25 scan, the flow read at 13:34, the user's settings and filters of that
  day, 1 B, 25% cap, 12 hours, as of the plan's start; slots don't bind at 66 or 200): 80 of 175 candidates carry it (81 of
  176 with the watched books of 16:55 laid over), and the default leaves out the same 11 plan items, by either book: Gravid
  Modulated Strip Miner Mutaplasmid (sale 13% over the cheapest listing), Gravid Ballistic Control System Mutaplasmid,
  Experimental Hyperspatial Accelerator, Entropic Radiation Sink II, AG-Composite Molecular Condenser, Compressed
  Fullerite-C84, Vigor Compact Micro Auxiliary Power Core and Chaotic Exotic Filament (bids 6–17% under today's best),
  Proximity-5 'Extraction' Filament and Raging Dark Filament (bids 14–19% over it, sales over the cheapest listing),
  Imperial Navy Infiltrator (bought at once). The mix's expected ISK a day falls from 171.18 M (30 items) to 129.32 M (26),
  168.08 M to 131.49 M with the watched books: a moved item looks best on paper, the fortnight's spread against a book that
  has left it. What comes in instead isn't proven better: Republic Fleet Commander Insignia II and Compressed Veldspar
  II-Grade, among the 7 added, are bids the market rose away from within the week (the review), and the expected figures
  are the planner's own pace, which the same review found far too high for Place and leave.
- **Place and leave expects what history says of each item's round trips within the horizon** (`roundTripCounts`,
  `roundTripRate`, `roundTripSaid`, `ROUND_TRIP_DAYS` 1/3/7/14/30, `ROUND_TRIP_STARTS` 60, `ROUND_TRIP_MIN` 20 in
  prospects.ts; `roundTrip` and `roundTripOf` on the stats; `Prospect.roundTrip`; `mixRoundTrips`, `mixRoundTripsSaid` and
  `plannerPool`'s `unmeasured`, `tripFew`, `noTrip` in planner.ts; the user chose it from the plans review, 9 October 2026).
  The 2 October plan (12-hour horizon; the user remembered it as 7 days) expected +67.6 M within 12 hours: the planner took
  each side as reached on half the days. The review re-ran Place and leave's own pricing on each of its 33 items' 60 days
  before the plan (`.playwright-mcp/research/plans-review/backtest.mjs`): its prices round-tripped (the bid reached by a
  day's low, then the sale by a day's high, that day or later) within a day on a median 7% of start days, 3 days 21%, 7
  days 39%; the cloud's leave_track had 24 of 30 plan bids followed a day or more fill nothing. Now:
  - **`statsFrom` counts them** from the history it already has: on each of the last 60 start days to the stats' 14 days'
    end, the bid and sale Place and leave would have priced that morning (`reachedBid` / `reachedAsk` of the 14 days before,
    ending where `recentRange` ends them, two days back when only that one traded), and whether they came round within 1, 3,
    7, 14 and 30 days; a start day counts for a horizon only once the whole horizon has happened, and one whose fortnight
    can't price both sides isn't counted. Two arrays of whole numbers aligned with `ROUND_TRIP_DAYS`, trips and start days
    counted. It matches backtest.mjs start day for start day (the 33 items, three horizons; tested on five of them,
    `scripts/fixtures/round-trips.json`, and on a market that skips days against the backtest done the plain way, which
    fails with the two-days-back ending planted away). The cloud's daily scan and the browser's scans both get it through
    `statsFrom`; a browser scan re-reads the history of stats without it (`statsCurrent`).
  - **A horizon of a day or less is the same day**: history is daily, so 4 h, 12 h and a day count a day that reached both
    prices (said so in the row's tip and the start dialog). A horizon between two counts is credited with the shorter.
  - **The expectation is scaled, never the margin**: a Place-and-leave prospect's return a day and ISK a day, and each mix
    row's ISK a day, are times its rate; `roi`, `net`, the size and Turns in stay what one round trip makes and takes, so
    "Return ≥ %" stays per trip and a plan's floor (`planTargets.expected`, Keep it) doesn't move. At the front: unchanged.
  - **Not known is never 0% or 100%**: stats from before the count (`unmeasured`) are left out and "Scan again before
    investing" says so; fewer than `ROUND_TRIP_MIN` start days priced (`tripFew`), and a measured 0 within the horizon
    (`noTrip`, which a 0 return would otherwise have dropped unsaid), are left out and counted in the mix's line, and an
    empty mix names them. Until the first cloud scan after a deploy, Place and leave's mix is empty and says why.
  - **Said**: a Round trip column ("45% of days", headed "Round trip / within 3 days" rather than repeating it in each row; the tip "Round trip within 3 days on 45% of past days: 26 of
    the 58 days that could be counted" and how it's counted: only start days whose whole horizon has passed count, so the base is under 60 and "of past days" is said, not "of the last 60"); the line over the mix ("About 3 of these 27 round-trip within 12 h, history
    says: 12% of past days, weighted by the ISK in each (5% to 22% an item)", with the profit expected against the
    profit if every one came round); the Expected ISK a day tile; the start dialog's lead.
  - **The plan's horizon wherever the plan is named** (`planHorizonSaid`, `planLabel` in plans.ts: "a 12-hour plan", nothing
    for a horizon not kept, which `sanitizePlans` reads as 0): the start dialog's lead ("2 items, 257 M ISK in buy orders, a
    3-day plan (Place and leave)"), the checklist's title, the Plans panel ("Place and leave, a 12-hour plan"; it read "0 h
    horizon" for a plan without one), its list part, To do's place, list and close items ("Part of 2 Oct · 999.16 M ISK in
    33 items, a 12-hour plan."), the position page's "The plan sells at", Orders' plan chip and the hangar check's plan tip
    (the chip itself keeps the name alone).
  - **Measured** (`.playwright-mcp/plan-review-fixes/measure-round-trips.mjs` and `.json`/`.txt`: the cloud's 2 October scan,
    each candidate's Forge history from ESI cut to before 2 October, the user's settings and filters, 1 B, 25% cap, 66
    slots). The 2 October plan's own 33 items and units: expected +67.58 M before, +5.77 M within 12 hours after (+14.81 M
    within 3 days, +25.80 M within 7). Like for like, the 7-day +25.80 M against the +4.67 M it realized by 9 October, a
    week on: still about five times over, though nearer than +67.58 M in 12 hours. The planner's mix at the plan's start, 12 hours:
    26 items and 129.32 M a day before, 27 and 14.19 M a day after (+6.45 M expected within 12 hours against +56.51 M if
    all came round; 22 candidates never came round the same day in 60 days, 1 too little history; 18 of the plan's items
    in it, 20 before); 3 days: 33 items, 58.38 M a day → 22, 15.18 M; 7 days: 5 items by ISK a day, 54.44 M → 28 by return,
    14.47 M. History still overstates the week after the plan: its rates summed to 2.7 of the 33 within 12 hours, 7.0 within
    3 days and 12.0 within 7, against 0, 0 and 2 that came round by the count's own rule (a day's low at or under the plan's
    bid, then a high at or over its sale, by ESI's days from placing); the review's 6 within 7 days are the round trips the
    user traded (one at a loss), which also counts sales under the plan's price. The markets moved away from the
    fortnight's prices. Cost: 57 µs an item on top of statsFrom's ~830
    (1,721 histories of up to 396 days), 0.8 s over the scan's 13,434 items; 58 bytes an item stored, 0.78 MB on the
    scan's 17.2 MB of stats and books (4.5%).
- **Orders you're leaving aren't told to get back in front** (`Data.leave`, a synced doc of type IDs; `leave` in
  `adviseRelist` / `judgeOrder`). Without this the first patient order would have been told to move by Orders, To do
  and the cloud's mail within the hour. A left order behind the front is `wait` with "You're leaving this one", raises
  no "beaten but clearing" alert, and shows no Move to / Costs you. What still speaks is trading no longer reaching
  its price: a buy is moved to `reachedBid` (still behind the front, unlike an ordinary buy, which goes to the front
  when that is above where trading reaches) or told to cancel; a **sell you're leaving** gets the same test against
  the highs (`askReachDays`, moved to `reachedAsk`, or `loss` when that sells under cost), which other sells don't.
  `fillingNow` now reads sells too (a listing that shrank at its price, or your own sale at or above it). Set from
  the planner for a whole plan in one click, or per item on Orders ("Leave alone" / "Leaving it"). From three days of
  trading since an order was first placed it's judged on those days too, since the last 14 hold days before it existed:
  reached on none of them, it's told to move, cancel or keep it (the 8 October rule), a move or a cancel on To do too
  (market-reading-relist.md, "A left order is judged on the days since it was placed"; orders-alerts-todo.md).
- **A plan's Leave alone covers its own orders, and ends with the position** (`isLeft`, `leaveForPlan`, `planLeaveSince`,
  `leaveByHand`, `stopLeaving`, `leaveAfterClose`, `leaveAfterDelete`, `releaseOrphans` in plans.ts; the synced `leaveFrom` doc, type ID to time, beside `leave`, which stays a
  plain list since older browsers and a Worker a version behind read it; the plans review, 9 October 2026). `leave` was by
  item, so starting the 2 October Place-and-leave plan left the 30 September at-the-front plan's Clone Soldier Transporter
  Tag bid too (placed 00:43 on 30 September, raised three times): it read "You're leaving this one" from then on, and after
  its position closed on 3 October nothing judged it as a plan's, with 116.9 M in escrow on 9 October. Now:
  - **Starting a Place-and-leave plan** puts each item in `leave` with `leaveFrom` the plan's start; such an item's orders
    are left only when first placed (`seen[0]`, never `issued`, which a price change moves: that bid's last raise was after
    the plan) at or after it less the checklist's two minutes (`SLACK_MS`). For an item whose position the plan counts
    whole (`planCountsWhole`: opened within the day before with nothing traded), the time is that position's opening
    (`planLeaveSince`), the window in which the checklist counts a bid as placed for the plan: the 30 September plan's
    Key (position 00:35:02, bid 00:36:15, plan 00:41:37) would otherwise have had its bid unleft. An item already left by
    hand stays left whole; one an earlier plan left keeps the earlier time while it's still in `leave`, so that plan's
    orders stay left too; a time for an item no longer in `leave` (an older tab's Leaving it dropped `leave` alone, or two
    devices' writes crossed) is stale and gives way.
  - **By hand** (Orders' Leave alone, the planner's "Leave these orders alone") is the whole item, as before: its time goes.
    Leaving it / Stop leaving them drop both. An order a plan doesn't cover says so in its tip ("This one was placed before
    it, so it gets the usual advice"), and Leave alone on it leaves every order of the item.
  - **Closing or deleting a position** takes its item out of both, unless another open position of it is a Place-and-leave
    plan's (a patient plan with an item following it), and the toast says when orders of yours were being left. Deleting
    one already closed doesn't (it let go at its close; again would drop an item left by hand since). Reopening doesn't put
    it back.
  - No `leaveFrom` doc, or no time for an item, is the old rule: every order of a left item. The browser, the order check
    and the cloud's alert round all ask `isLeft`; a Worker a version behind refuses a push carrying the new document, so the
    browser sends the rest without it (`refusedDoc`, cloud.md).
  - **Measured on the review's export** (`.playwright-mcp/research/plans-review/leave-per-plan.mjs`, replaying the 2 October
    start, the CNMGC left by hand on 3 October and every close since, judged on ESI's books of 9 October): of 60 open Jita
    orders, left 24 → 22. The Clone Soldier bid (by both rules) now reads "71 ahead of you, about 43 h of waiting", move to
    29,720,000, where it read "You're leaving this one"; and Datacore - Rocket Science's 2,628 listed at 94,420 on 1
    October, the earlier trading's on the position the plan took over, gets the usual advice (move to 90,890). The plan's
    own 12 bids and 9 listings stay left, as does the CNMGC left by hand.
  - **Once, for a ledger from before `leaveFrom`** (`releaseOrphans`, `releaseOrphanLeave` in store.ts; the coordinator's
    ruling, so the review's own orphan is released): when the stored ledger had no `leaveFrom` doc, every item left with no
    time that a Place-and-leave plan names gets the close rule (let go unless an open position of it is a patient plan's).
    It never touches an item no patient plan names (loot or the CNMGC left by hand) and makes up no time for one it keeps.
    It runs after the cloud sync's first pull of the visit, so it acts on the cloud's `leave` rather than a copy kept from
    before another device changed it, and pushes `leave`; with the sync off, at once. Done is the `leaveFrom` doc written,
    empty or as it was, which stays in the browser (a change only to it isn't pushed). On the review's export: 13 of 34 types
    let go, none with an open position; of the open orders only the Clone Soldier bid stops being left (24 → 23), its 116.9
    M escrow judged again (`release-orphans.mjs`). Rocket Science's 1 October listing stays left: no time is backfilled.
    It stands down when the cloud's first pull of the visit brings a `leaveFrom` doc (`standDownOrphanCleanup` in store.ts;
    the final review, 10 October 2026): a plan started since this version wrote one, so that ledger is past the move. Before
    that a new browser, "Delete all data" and a save that never landed each had no `leaveFrom` on disk and ran it again. Logging
    out in a session whose first sync never succeeded no longer runs it either (it acted on the local copy before any pull);
    it runs after the first pull on the next login.
    **Residual risk**: what still re-arms it is a ledger the cloud holds no `leaveFrom` for (sync off, or no plan started
    since), where a plan item left by hand again after its position closed is let go again at the next load with none on
    disk; and a browser whose stored cloud revision is past the revision the doc was written at doesn't see it in an
    incremental pull. A browser whose pull fails waits rather than act on its own copy. The page check (`plan #orders
    (leave from before leaveFrom)`) loads such a ledger with the cloud stubbed: Clone Soldier let go after the pull, `leave`
    pushed, `leaveFrom` not; loaded again with it left by hand, nothing changes.
- **Place and leave holds a run-up to 30%** (`RUN_UP_PATIENT`, `runUpBar`; the front keeps `RUN_UP` 0.5). The user: "yes we
  can make it stricter". The Vigilance Resonance Key was +40% on the 1 October scan (31.8 M over the last 3 days against a
  month median of 23.2 M) and Place and leave priced its sell at 36.82 M from the spike's days behind 109 listed at ~9 a
  day. On the 2 October scan the bar takes 31 of 927 placed-and-left candidates (3.3%) and no mix row at 7 days, 2 of 35
  (48 M) at 3; the Key itself was back to +26% and in. The run-up's tip names the bar that applied.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Leaving Market moved out of Place and leave lowers the planner's expected ISK a day** (171 M to 129 M on the 2 October
  plan's start): a moved item looks best on paper. What replaces it is the next best on the same model, whose pace for Place
  and leave the plans review found far too high; that the replacements do better isn't shown, only that the moved ones did
  worse.
- **Importing a backup from before `leaveFrom` restores its `leave` with `leaveFrom` empty and doesn't run the cleanup**
  (finding-trades-leave.md), so plan items whose positions have since closed are left whole again until Leaving it is clicked on
  Orders.
- **Place and leave's round-trip rate is history's, daily and region-wide** (finding-trades-leave.md). A day that reached both
  prices says the bulk of trading got there, not that your order, queued among others at your share, filled and sold; a
  horizon under a day counts the same day, the nearest daily history can say; the 60 start days overlap, so a rate is
  less sure than its count suggests, and the 30-day count rests on at most 31. On the 2 October plan the rates summed to 12
  of its 33 items within 7 days, against 2 by the count's own rule (ESI's days, the bid then the sale) and 6 round trips the
  user traded, some under the plan's price; its expected profit within 7 days, +25.8 M, against +4.67 M realized a week on: a market that moves
  away from the fortnight's prices (the review's adverse selection) comes round less than its past did. Only the
  expectation is scaled: each item is still sized by what its market takes at reach/14 a side.
- **At the front, the planner's expectation is unchanged** (9 October 2026): it prices one step inside today's book and
  relists to stay there, so the round trips of Place and leave's fortnight prices don't describe it, and its pace still
  assumes every order keeps filling at your share.
- **Until the first cloud scan after the round trips shipped, Place and leave's mix is empty**: stats from before the count
  are left out ("Scan again before investing"), never stood in as 0% or 100%. A deep scan in the browser fills in the
  items it reads.
- **A Place-and-leave plan leaves only orders placed since it started** (less two minutes), or since its item's position
  opened when that was within the day before with nothing traded (finding-trades-leave.md): a bid placed for it in the hour before
  the plan on a position open longer, which the checklist counts as placed, gets the usual advice until Leave alone is
  clicked on Orders, and an order of another plan's placed after it is left with it. Telling them apart would need each
  order tied to its plan.
