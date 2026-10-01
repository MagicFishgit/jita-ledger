# Plans that hold their margin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Capital planner stops pricing trades from days the market has left behind and counts the raises a busy
market will cost; and Orders, To do and the cloud's mail never tell you to raise a buy (or cut a sell) into a loss, saying
plainly, where it's easy to see, to keep it at a price that still pays — knowing the plan the order belongs to.

**Architecture:** Pure rules in `src/lib/` (fills, prospects, evaluate, planner, plans, relist), shared by the browser and
the Worker; the components and the Worker's alert round pass in the plan an order belongs to.

**Tech Stack:** React + TypeScript + Vite; Cloudflare Worker + D1; tests in `scripts/check.mjs` and
`scripts/check-worker.mjs`, pages in `scripts/pages.mjs`.

**Spec:** the user's review of their first plan and their request, 1 October 2026.

The plan (`30 Sept · 991.64 M ISK in 4 items`, 7-day horizon, front-of-book pricing, made 00:41 UTC 30 September):
Vigilance Resonance Key 16 at 24.96 M → 35.99 M; Praxis 1 at 206.3 M → 226 M; Caldari Navy Missile Guidance Computer 1
at 270.7 M → 359.9 M; Clone Soldier Transporter Tag 4 at 28.82 M → 33.43 M. What happened (D1, ESI, the cloud's watch):

- **Praxis lost 1.02 M.** Orders told the user to raise the bid three times (206.3 → 206.7 → 207.1 → 208.4 M; change fees
  521,891 + 522,892 + 537,395 on top of the 2,579,448 placing fee); it filled at 208.4 M on 1 October 00:42 and sold at
  221.8 M at 12:52 (2,773,251 broker, 7,485,750 tax). The plan expected +6.7 M (3.2%). The best ask at the third raise
  (22:49 UTC 30 September) was about 224.9 M; by the sale it was 222 M. Praxis sees 25–36 new bids and 51–112 new
  listings a day against 7–19 sold into bids and 25–45 bought from listings (the cloud's flow, 28 September–1 October).
- **Vigilance Resonance Key was priced from a spike.** About 21 M before 18 September, 28 M, then 40–45 M on 24–27
  September. At 00:00 30 September the best ask was 1 unit at 36.00 M; by 15:00 1 October it was 29.93 M (90–136 new
  listings a day). The plan's 35.99 M passed the 14-day reach test because of the spike days; `lastMove` (+28% that
  morning) was under its 50%. 40% of the plan's ISK went into it. A duplicate buy order placed at 00:36 (15 at 24.95 M,
  before the plan started at 00:41) was cancelled for a fresh one of 16, losing its 4,679,391 placing fee: the plan's
  checklist only counts orders placed after the plan started.
- **The Missile Guidance Computer's bid is from an older regime.** Lows at or under 270.7 M on 6 of 14 days (mid-September,
  when it traded 260–310 M); since 25 September it has traded at 359–375 M on 5 of 6 days, and the cloud saw nothing sold
  into bids in ~41 hours.

The user, verbatim: "Yes do those fixes but also with the praxis specifically the orders page told me to relist. It needs
to be aware of plans and clearly state, easy to see that you should not move it so you don't make a loss and keep it at a
profitable price. If you can think of any other hardenings we can make then that would be good too, just not too tight so
i don't get suggestions." "Those fixes" were offered as: "Require each price to have been reached in the last few days
too, not just somewhere in the 14" and "Make an item that's busy relisting show a margin that covers a couple of raises."

## Global Constraints

- **Not too tight** (the user's words): every new rule must still let the planner fill a plan and Orders still suggest
  moves on ordinary markets. Each task proves it against real data: the cloud's current scan for the planner (how many
  items each rule removes or reprices), the user's open orders for Orders (how many verdicts change, each named).
- Thresholds are named constants stated in the copy (app-conventions); no invented figure.
- Shared rules stay loadable by the Worker and by Node's type stripping: no `./config`, `./store`, React or DOM; no enums or
  parameter properties (gotchas.md).
- The Worker may be a version behind the site and the reverse: a field the other side doesn't send yet is absent, never an
  error.
- Copy in the app's voice (app-conventions): a verdict is one short sentence; a tag's tip is a lead line then bullets.
- Never re-record `scripts/income-golden.json` unless a task deliberately changes the Wallet's or Results' wording (none
  here should).

## Review Focus

1. A plan whose items' positions have closed, been deleted, or belong to an older plan: the order must not be judged by a
   plan it no longer belongs to.
2. A buy with no plan and no history (a new item): the resale guard must fall back to the book alone, and say nothing it
   can't support.
3. The planner on stats cached before the new fields: no flag claimed, and the page says to scan again, as it does for
   `highs14`/`lastMove`.
4. The Worker a version behind (no plan context sent) and ahead (a plans doc the site hasn't written): mail never errors.
5. The checklist with two open buy orders for one item (one before, one after the plan): counted once, the fee said once.

---

### Task 1: The planner prices from recent days, flags a run-up, and reserves a busy market's raises

**Files:**
- Modify: `src/lib/fills.ts` (recent reach), `src/lib/prospects.ts` (`bidToPlace`, `askToPlace`, `statsFrom`'s new `runUp`,
  `warningsFor`), `src/lib/types.ts` (`ProspectStats.runUp`, `ProspectWarning` gains `'runUp'`, `Prospect` gains the
  reserve), `src/lib/evaluate.ts` (`judgeProspect`), `src/lib/planner.ts` (`PLANNER_EXCLUDES` gains `'runUp'`), the
  Prospects and Planner components that list warnings and show a plan's mix, `src/lib/scan.ts` (refresh stats lacking
  `runUp`, as it does for `lastMove`)
- Test: `scripts/check.mjs`

**Interfaces:**
- Produces:
  - `RECENT_DAYS = 5`, `RECENT_MIN = 2` in fills.ts, and a helper that counts reach over the last `RECENT_DAYS` of a
    14-day lows/highs array (the newest last, with watched extremes already merged).
  - `bidToPlace` / `askToPlace`: the front is accepted only when reached on ≥ `FILL_RARE` of 14 days **and** ≥ `RECENT_MIN`
    of the last `RECENT_DAYS`; otherwise the realistic price satisfies both: for a bid the higher of `reachedBid(lows)`
    (7 of 14) and the bid reached on 3 of the last 5 (the 3rd-lowest recent low); for an ask the lower of `reachedAsk`
    and the 3rd-highest recent high. Return a field saying which window decided it, so the flag's tip can say "not
    reached lately" rather than "not reached".
  - `ProspectStats.runUp?: number`: the last 3 days' average price over the median daily average of the 30 days before
    them, minus 1; computed only when the latest day is within 3 days (as `lastMove`). `RUN_UP = 0.5`. `warningsFor` adds
    `'runUp'` when `runUp > RUN_UP`. Upward only: a fall is caught by the ask's recent reach.
  - `Prospect.raiseReserve?: { buy: number; sell: number; isk: number }`: price changes reserved per side and their cost per
    unit. `RAISES_RESERVED = 2` on a side when the cloud's or the app's watch of the item (`watched.flow`, at least
    `RESERVE_WATCH_H = 24` hours) shows at least as many units newly placed at or beyond the front on that side as filled
    on it (`newBuy ≥ buy` for bids, `newSell ≥ sell` for asks): you'd typically be beaten before you fill. Each change
    costs the change fee (`rates(settings).k`, broker × (1 − the ABR discount)) on the order's value. The reserve comes off
    the margin before `minRoi` and the ranking.
- Consumes: `FILL_RARE`, `FILL_WINDOW`, `reachedBid`, `reachedAsk`, `bidReachDays`, `askReachDays`, `withWatchedLows`/`Highs`,
  `rates`, `FlowDay`.

- [ ] **Step 1: Failing tests**, with the real cases (history and flow figures in the Spec):
  - The Missile Guidance Computer at plan time: its 14 daily lows ending 28 September, from ESI's history saved in
    `.playwright-mcp/plan-review/h94063.json` (read 1 October 2026): the front bid 270.7 M is reached on ≥ 4 of 14 but on
    fewer than 2 of the last 5, so `bidToPlace` raises it to where recent trading reached, and says which window decided.
  - Praxis (type 47466) lows and highs ending 28 September: unchanged (reached on both windows).
  - Vigilance Resonance Key (type 89156) daily averages 1–28 September: `runUp` over 0.5, `'runUp'` warned, excluded by
    the planner; Praxis, the Clone Soldier Transporter Tag and the Guidance Computer not.
  - A prospect with watched flow `newBuy 30, buy 12, newSell 74, sell 37` over 24+ hours carries 2 raises a side and its
    `roi` drops by 4 change fees; one with `newBuy 5, buy 12` carries none on that side; one watched 10 hours, none.
- [ ] **Step 2: Run** `npm run check`, see them fail.
- [ ] **Step 3: Implement.** Keep the patient path ("Place and leave") consistent: its half-the-days prices take the recent
  window too (the higher bid / lower ask of the two). Fetch ESI history for the test fixtures once and save them under
  `scripts/fixtures/` (small JSON), not live in the test.
- [ ] **Step 4: UI.** Prospects' flag list and the planner's mix show `runUp` ("Ran up lately": the 3-day average against the
  month's median, both figures) and a recent-reach reason on the existing unreached flags; the planner's mix shows the
  reserved raises on an item that carries them ("2 raises a side kept back: −X%") in its tip, and the planner's "Scan again
  before investing" note covers stats without `runUp`.
- [ ] **Step 5: Not too tight.** Run the planner rules over the cloud's current scan (`/v1/scan` from a local Worker with the
  real D1 export, or the stats/books in D1's `scan_items`): how many of the planner's candidates each rule removes,
  reprices or reserves, and the top 20 before and after at the user's settings (share 7.5%, broker 1.3%, tax 3.375%,
  target 5%, 1 B, 7 days, 10 slots). Record it in the report; if a rule removes more than about a fifth of what the
  planner would otherwise pick, say so and stop for a ruling rather than loosening it on your own.
- [ ] **Step 6: Checks** `npm run check`, `npm run build`, `npm run check-pages`, `npm run check-phone`,
  `npm run check-income`. Commit, push.

### Task 2: Orders, To do and the mail know the plan, and never raise into a loss

**Files:**
- Modify: `src/lib/plans.ts` (`planTargets`), `src/lib/relist.ts` (`MarketContext.plan`, `MarketContext.resale`, the buy
  guard, `overResale`), `src/lib/orderCheck.ts` and the components that build each order's context (Orders, To do),
  `src/components/Orders.tsx` (the verdict and tag), `src/lib/todo.ts` if a verdict's wording reaches it,
  `worker/src/alerts.ts` (pass the plan from D1's `plans` doc and the ledger's positions)
- Test: `scripts/check.mjs`, `scripts/check-worker.mjs`

**Interfaces:**
- Produces:
  - `planTargets(plans: TradePlan[], positions: Position[]): Record<number, { planId: string; buyAt: number; sellAt: number;
    expected: number }>`: for each item of a plan whose position is still open (status open, not deleted), the newest such
    plan's prices and its expected return at them after fees (`expected`, a fraction, from `rates`). Pure; in plans.ts.
  - `MarketContext.plan?: { buyAt; sellAt; expected }` and `MarketContext.resale?: number | null` (the realistic price to
    sell on at now: `listingPrice(bestSell, bestBuy, highs)` on others' orders only).
  - The buy guard in `adviseRelist`: before advising a move up, work out what the order returns after the move: resale
    `S = min(plan.sellAt, resale)` (the plan's when there's no resale, the resale when there's no plan), and cost per unit
    = the new price × (1 + broker) + the change fees this order has already paid per unit remaining (from `seen`: each
    price change × `k` × that version's price × remain) + this change's fee. Floor: half the plan's `expected` for a plan's
    buy (`PLAN_KEEP = 0.5`), break-even for any other buy. Under the floor, the verdict is `'loss'` with a why that says, in
    this order: don't raise; what raising to X would leave at S (and what the plan expected); keep it at the current price.
    Replaces `badBuy` (which ignored the buy's broker fee and the fees paid).
  - `Relist.overResale?: { breakEven: number; resale: number; ret: number }` on a buy whose own price already returns under
    break-even at the resale: the mirror of `underCost`. Orders tags it red, as `underCost`.
  - Sells in a plan keep the existing guard (never under cost after fees); add the plan's `sellAt` to the why when a move
    would go under it, so a plan's sell says what the plan expected.
- Consumes: `listingPrice`, `rates`, `TradePlan`, `Position`, `judgeOrder`.

- [ ] **Step 1: Failing tests.** The Praxis replay: plan buy 206.3 M / sell 226 M (expected 3.2%); `seen` with the three
  versions and the fees above; at the third raise (resale 224.9 M, a rival bid at 208.3 M) the verdict is `'loss'` and the
  why says keep it at 207.1 M; at the second (resale 225.6 M, rival 207.0 M) the move to 207.1 M still stands. A buy with no
  plan: guarded at break-even only. A buy whose price already returns under break-even: `overResale` set. A plan whose
  position closed: not applied. The Worker's alert round in `check-worker.mjs`: an order of a plan in D1 is judged with it
  (no "move" alert for the Praxis case), and with no plans doc nothing changes.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement** the rules; wire the context in orderCheck/Orders/To do and in `worker/src/alerts.ts` (read the
  `plans` doc and the positions records for the ledger; positions are records of kind `positions`).
- [ ] **Step 4: Easy to see.** On Orders, a plan's order shows which plan (a small "Plan" chip with its name in the tip). A
  `'loss'` from the guard shows as **"Keep it"** in the verdict column in the amber of a warning, never a Move to price,
  with the why in full under it. `overResale` is a red tag like "Priced under cost": "Pays more than it resells for: breaks
  even at X". To do's item for such an order (if any) says the same, and opening it in game copies nothing to raise to.
- [ ] **Step 5: Not too tight.** Run `judgeOrder` over the user's open orders as the cloud has them (`GET /v1/alerts/preview`
  on a local Worker with the real D1 export, CLAUDE.md "The cloud"): list every verdict that changes, before and after, with
  the reason. Expected: only buys whose raise would leave no profit change; record the count.
- [ ] **Step 6: Checks** (all five), a browser look at Orders with a seeded plan and the Praxis case, at 390 px too. Commit,
  push.

### Task 3: The plan's checklist counts an order you placed just before the plan

**Files:**
- Modify: `src/lib/plans.ts` (`placedOrder`, `planProgress`), `src/components/PlanStart.tsx`
- Test: `scripts/check.mjs`

**Interfaces:**
- Produces: `placedOrder` also counts an open Jita 4-4 buy order for the item placed before the plan started but after the
  item's position opened, or within `BEFORE_PLAN_MS = 60 min` of the plan when no position predates it; with how many units
  it covers. The checklist says "Already placed: 15 of 16 (before the plan)" and, when it covers fewer units than the plan,
  "EVE can't change an order's quantity: the 1 more is a new order with its own fee, or leave it at 15", never a nudge to
  replace it.
- Consumes: `TradePlan`, `PlanItem`, `Order`, positions.

- [ ] **Step 1: Failing test** with the Vigilance case: position opened 00:35:02, order 15 at 24.95 M issued 00:36:15, plan
  at 00:41:37 for 16: counted, 15 of 16. An order from the day before for the same item isn't. Two orders (one before, one
  after): counted once, the after one first.
- [ ] **Step 2: Implement, Step 3: checks (all five), commit, push.**

### Task 4: Ship

- [ ] **Step 1**: clean tree; all five checks.
- [ ] **Step 2**: merge `--ff-only`, push, delete the branch both sides, `npm run deployed` → `Shipped.`; grep the deployed
  bundle for "Keep it" and "Ran up lately".
- [ ] **Step 3**: Notes: `finding-trades.md` (the planner's recent reach, run-up and raise reserve, with the user's plan as
  the evidence and Step 5's counts), `market-reading.md` (the buy guard, plan-aware, `overResale`), `orders-alerts.md` (the
  checklist counting an earlier order; the mail plan-aware), `limits.md` if the reserve or the recent window leave a stated
  limit. In the notes' own terse dated style.
