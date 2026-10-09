# Plan review fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what the review of the user's two Capital planner plans found: left orders judged on the wrong days, Place and leave placing into markets that had moved, a pace the market never kept, and one plan's Leave alone covering other orders.

**Architecture:** Pure rules in `src/lib` (relist.ts, fills.ts, plans.ts, planner.ts, prospects.ts, todo.ts), shared with the Worker where they already are; the browser's pages (Orders, PlanStart, Planner, To do) show the results; the cloud's alert round runs the same `judgeOrder`. One synced document is added (task 1) under the cloud's compatibility rules: old browsers and a Worker a version behind must keep working.

**Tech Stack:** React + TypeScript + Vite; Cloudflare Worker + D1; Node type-stripping tests (`scripts/check.mjs`), Playwright page checks (`scripts/pages.mjs`).

**Spec:** the user's choice of the plans review's proposals (9 October 2026), from `.playwright-mcp/research/plans-review/report.md` (sections "Wrong in the app" and "Proposals"). The user's words: "investigate how my plans went. I have followed the advice mostly on what todo's told me. it asked me to cancel a few buy orders and close positions and the general performance was bad." They then chose all four: "Judge leave-alone orders since placed", "Market moved on for Place and leave", "Honest pace and horizon", "Leave alone per plan, and orphans".

## Global Constraints

- Every figure is read, derived or asked for, never invented (app-conventions.md); a figure not known reads "–" with why, never 0.
- Plain words in the copy, tips laid out (lead line, bullets); Orders fits at 1440 px, every page at 390 px.
- `src/lib` modules the Worker imports stay free of `./config`, `./store`, React and the DOM; no enums or parameter properties.
- A new synced document is added to the cloud sync's document list and sanitized like the others; a browser or Worker that doesn't know it behaves as before (cloud.md: "the site must tolerate the Worker being a version behind").
- To do ticks itself off only from a read newer than the one that showed an item (orders-alerts.md: absent is not done).
- Each task: failing tests first, all five checks (`npm run check`, `npm run build`, `npm run check-pages`, `npm run check-phone`, `npm run check-income` without re-recording), a browser look for anything visible, notes in the same commit with the user's case and the evidence.
- Measure each change on the user's real data before it ships, read only: the plans review's exported data and scripts in `.playwright-mcp/research/plans-review/` (`load.mjs` builds a `Data` from `data/`; `market/` has ESI books and history to 8 October). Report what each change would have said on the two plans.

## Review Focus

1. An order placed today or yesterday: "since placed" has too few days to judge; it must say nothing new rather than "not reached on 0 of 0 days".
2. A left order repriced since placing: count from its first version (`seen[0]`), not `issued` (a price change moves `issued`).
3. Old browsers and a Worker a version behind: the new leave document missing must read as today's behaviour.
4. Items whose stats predate the round-trip figure: the planner must say "not measured" (or ask for a scan), never treat it as 0% or 100%.
5. A plan item flagged Market moved at placement: the checklist must not keep asking to place it at the old price without saying so.

---

### Task 1: Leave alone belongs to a plan's own orders, and ends with the position

**Files:** src/lib/store.ts (`Data`), src/lib/cloudSync.ts (the documents list), src/lib/prefs.ts or wherever docs are sanitized, src/lib/orderCheck.ts (~193), worker/src/alerts.ts (~131, `leave.has(o.typeId)`), src/components/PlanStart.tsx (~64), src/components/Orders.tsx (~148, ~439), src/lib/positions.ts or the close/delete actions, scripts/check.mjs, scripts/pages.mjs, docs/notes/finding-trades.md ("Orders you're leaving…").

**What's wrong (the review):** `leave` is a synced list of type IDs. Starting the 2 October Place-and-leave plan put its items in it, and the 30 September plan's at-the-front Clone Soldier Transporter Tag bid (same item) was treated as left from four minutes later; when its position closed on 3 October nothing judged it, and it held 116.9 M in escrow since 30 September, raised three times, never filled.

**Rulings:**
- Keep `leave: number[]` as it is (old browsers and an older Worker read it). Add a synced document `leaveFrom: Record<typeId, ISO time>`: when present for a type, an order of that type counts as left only if it was first placed (`seen[0]?.issued ?? issued`) at or after that time less the plan checklist's slack (`SLACK_MS`). Starting a Place-and-leave plan sets `leaveFrom[type]` to the plan's start for each item (not earlier than an existing value's for an item already left by hand? Rule: a plan's start, unless the item was already in `leave` without a `leaveFrom`, in which case leave it as it was: the user left the item by hand). Orders' "Leave alone" button sets the type with no `leaveFrom` (the whole item, as today) and removes any `leaveFrom` for it; "Leaving it" (undo) removes both.
- One function decides it (e.g. `isLeft(order, d.leave, d.leaveFrom)` in a pure module the Worker can import), used by orderCheck, Orders and the Worker's round. The Worker reads the new doc when present.
- When a position closes or is deleted, its type leaves `leave` (and `leaveFrom`) unless another open position of the type belongs to an open Place-and-leave plan. Say so where the close happens? Only if natural; at least note it.
- Tests: an order placed before the plan's start isn't left; one placed after is; Orders' button still leaves every order of the item; closing the position clears it; no `leaveFrom` doc = today's behaviour; the Worker's round honours it (scripts/check-worker.mjs).
- Measure: on the review's data, which open orders change from left to not left (the Clone Soldier bid should; the 2 October plan's own bids shouldn't).

### Task 2: Judge left orders on the days since they were placed

**Files:** src/lib/fills.ts (a since-placed reach count), src/lib/relist.ts (`adviseRelist`'s left branches: buy and sell), src/lib/todo.ts + src/components/Todo.tsx (a To do item), src/lib/plans.ts (`planListPrice` / `planListSaid`: the list step's "moved" check), worker/src/alerts.ts (what's mailed), scripts/check.mjs, scripts/pages.mjs, docs/notes/market-reading.md, finding-trades.md, orders-alerts.md, limits.md.

**What's wrong (the review):** a left order is judged on the last 14 days of lows/highs, which include days before it existed: a bid placed at the fortnight's median keeps reading "reached on 5 of 14" for up to two weeks after the market left it. 633 M sat in 13 such bids; the CNMGC's sell at 359.9 M ("6 of 14") was never reached after listing while trading got up to 337.5–345.5 M (a sale there: +31 to +39 M; today −44.7 M at the bid). And the list step's "moved" check compares the plan's price with the fortnight's highs, not today's book: Federation Navy Fleet Captain Insignia I reads "not moved, +6.1% at 920,100" while today's cheapest listing, 801,200, is under its 826,978 cost.

**Rulings:**
- For a left order, reach is counted only over whole history days on or after the day it was first placed (`seen[0]`), with today folded in from watched fills as now (`recentRange`, `withWatchedLows`; align by `lowsEnd`). Under `LEFT_MIN_DAYS` (3) such days, judge it as today (nothing new is said).
- From 3 days: a left **buy** reached on none of them is unreached. Its advice is the plan guard's three-way rule (market-reading.md, 8 October): Move it to where trading reaches now if that clears the plan's floor (or, with no plan, your target), Keep it / Cancel it otherwise, and the why says "Not reached on any of the N days since you placed it; today's best bid is X% over". A left **sell** reached on none is moved to the highest price trading got up to since it was listed (`reachedAsk` over those days), never under cost (`loss` then) and never under the best bid (`overBid`), said the same way.
- To do gets an item for these ("Not reached since you placed it", Needs action), keyed by the order, versioned by the order's price (as feedsQueue): opening it copies the suggested price; it ticks off on a newer check that no longer says so, or the order closing. The cloud mails it like other moves/cancels (it's a `move`/`dry` verdict) only when it clears the alert minimum.
- The list step: compare the plan's sale price with today's cheapest listing from others as well as with the fortnight; when today's cheapest listing is more than `MARKET_MOVED` under the plan's price, say the market has moved down with today's figure and what the plan's units make there (never "not moved"), and never show a profit at a price above today's cheapest listing without saying so.
- Measure: replay on the review's data (`replay.mjs` shows how): which of the 13 open bids and the 8 held items' sells change verdict, and what the CNMGC would have been told on 4–6 October.

### Task 3: Market moved leaves Place and leave items out by default, and the checklist re-checks at placing

**Files:** src/lib/planner.ts (`plannerPool`, `SWITCH_EXCLUDES`), src/lib/prospects.ts (`marketMoved`, `MARKET_MOVED`), src/components/Planner.tsx, src/lib/plans.ts + src/components/PlanStart.tsx (the checklist), src/lib/todo.ts / Todo.tsx (`placeBuy`), scripts/check.mjs, scripts/pages.mjs, docs/notes/finding-trades.md.

**What's wrong (the review):** on the 2 October plan, the 11 items Market moved flags (already flagged on the 11:25 scan, before the plan started) settled −6.0% per ISK at today's bids against −2.5% for the rest: leaving them out would have saved about 6.9 M (3.7 M at listing prices). The flag only acts when "Leave out flagged items" (off by default) is switched on. And the checklist asks to place each bid at the plan's price however far the live book has moved since.

**Rulings:**
- Place and leave leaves out Market-moved items by default, whatever "Leave out flagged items" is set to, and the mix says how many it left out for it. A switch "Keep items whose market moved", off by default and kept per browser, beside "Leave out flagged items", brings them back. At the front is unchanged.
- The checklist re-checks each unplaced item against its live Jita book when shown (the books `usePlanListing` already reads for the list step, or the same reader): if the plan's bid is now more than `MARKET_MOVED` under today's best bid, at or over today's cheapest listing, or the plan's sale more than `MARKET_MOVED` over today's cheapest listing, the row says so with the figures and offers "Skip it" (marks the item dropped as `skipped`, which `planItemState` reads like `cancelled`), and its To do `placeBuy` item says the same and offers the same. Not moved: as today.
- Measure: on the 2 October plan's start (the review's `flags2.mjs` and `planner-queue/scan-2oct/`), which items the default leaves out and the mix's ISK a day before and after.

### Task 4: Honest pace: a plan's expectation from each item's own round trips, and its horizon shown

**Files:** src/lib/prospects.ts (`statsFrom`: a new stats field), src/lib/types.ts (`ProspectStats`), src/lib/planner.ts and src/lib/evaluate.ts (Place and leave's expected fills and return), src/components/Planner.tsx, PlanStart.tsx, Todo.tsx (horizon shown), worker/src/scan.ts if the stored scan needs the field passed through, scripts/check.mjs, scripts/pages.mjs, docs/notes/finding-trades.md, limits.md.

**What's wrong (the review):** the 2 October plan (12-hour horizon, which the user remembered as 7 days) expected +67.6 M within 12 hours; the planner treats each side as reached on half the days. Place and leave's own pricing re-run day by day on each item's 60 days before the plan completed a round trip (bid reached, then the sale reached) within 1 day on a median 7% of start days, 3 days 21%, 7 days 39%; in fact 6 of 33 items round-tripped within 7 days. leave_track: 24 of 30 plan bids followed a day or more filled nothing; the median filled/expected was 0, the best 0.25.

**Rulings:**
- `statsFrom` computes, from the item's history (it already has every row), Place and leave's round-trip rate for each of the planner's horizons (`HORIZONS`): over the last 60 start days, the share where the bid priced as Place and leave prices it on that day (`reachedBid`/`reachedAsk` on the 14 days before it) was reached and then the sale reached within the horizon (a sub-day horizon counts the same day only when both were reached that day, and says that's the best history can do, since history is daily). Stored compactly on the stats (e.g. `roundTrip: number[]` aligned with `HORIZONS`, plus the start days counted). The cloud's daily scan and the browser's own scans both get it through `statsFrom`. The review's `backtest.mjs` is the reference implementation; match it.
- Place and leave's expected return and ISK a day are scaled by that rate (expected profit × rate within the horizon), and each mix row shows it ("Round trip within 12 h on 7% of past days"); the mix line and the plan's start dialog say what share of the items history says round-trips within the horizon. Stats without the field: the planner says "Scan again before investing" as it does for older stats (finding-trades.md), never a 0% or 100% stand-in. At the front: unchanged in this task (it was priced differently; say so in limits.md).
- The horizon shows on the plan everywhere it's named: the checklist row (already "12 h horizon"), the Plans panel, To do's plan items ("Part of 2 Oct · …, a 12-hour plan"), and the start dialog's lead.
- Measure: on the 2 October scan (`planner-queue/scan-2oct/`), the plan's expected return before and after, and the round-trip rates of its 33 items against what happened (6 of 33 within 7 days).
