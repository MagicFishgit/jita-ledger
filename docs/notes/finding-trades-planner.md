---
paths:
  - "src/lib/planner.ts"
  - "src/components/Planner.tsx"
---

# Finding trades: the Capital planner's mix

Split from finding-trades.md on 19 October 2026. Decisions worth not undoing. How the Capital planner builds its mix
from Prospects: its filters, the slots and ISK it starts from, what you already have working, and the flags it leaves
out. Place and leave's pricing is in finding-trades-leave.md, a plan once started in finding-trades-plans.md.

- **The Capital planner ranks with `plannerFilters`**: your Prospects filters, but never Busy markets, and
  always its own ISK and horizon with partial fills. It used to copy the saved Prospects filters wholesale,
  so with Busy markets left on it built from the busy list (top-of-book prices, "Return ≥ %" ignored): on the
  test browser at the user's rates that deployed 1,994 M into 5 items for 43.9 M a day, against 247 M into 10
  for 19.2 M on the normal list. The mix now shows the flags that don't exclude an item, marks items you
  already have orders or a position on, and offers the Prospects horizon choices (without "any").
- **When order slots run out before the ISK, the planner fills by ISK a day** (`allocate`, `Plan.ranked`/`other`). It
  filled best return per day first, which is right while slots are spare, but with few free slots a small market paying
  4% a day on the 20 M it can take earns less than a big one at 2% on 150 M, and most of the ISK sat idle. The user asked
  that it "fill the given slots" intelligently (29 September 2026). Now, when the slots run out first, the mix is also
  filled by what each item makes a day, and whichever earns more a day is kept; the page says which and what the other
  would have made. Test: 1 B, 10 slots, six small and six big markets: 750 M in the five big ones for 5 M a day, where
  best return first put 100 M in the small ones for 1.33 M.
- **The planner sizes each item after what you already have working in it** (`workingUnits`, `PlanInput.working`,
  `Allocation.takes`/`working` and `Plan.filled` in planner.ts). It sized each item by what its market takes in the horizon
  (`absorbs`) and only marked items you already trade ("Already trading … on top of that"), so a second plan on an item
  the first already bids on was sized as if the market were empty; the user approved sizing after it (2 October 2026).
  Working, in units: your open Jita 4-4 orders' units left, buys and sells, plus the Jita hangar (`d.stock.jita`; one not
  read yet counts as nothing, and the mix says so), all of it using the same flip capacity. `allocationFor` takes
  `absorbs − working × buy` before the cap and the ISK left, and an item with nothing left gets no row. The "Already
  trading" tip says what you have and "this plan takes what's left: N of the M units the market takes in your horizon";
  the mix line counts the items left out because your orders and stock already fill them. Measured on the user's 77 open
  orders and hangar at 17:00 UTC, a fresh 1 B plan on the cloud's 2 October scan with 52 free slots: Place and leave at 12
  hours went from 26 items, 741 M and 139.6 M a day (as if every market were empty) to 18 items, 722 M and 101.7 M a day,
  28 left out as already filled (mostly the second plan's own items, their bids open), 2 shrunk and 10 others brought in;
  at 7 days nothing moved (a week of each market takes far more than the cap per item); at the front at 7 days one item
  dropped for another, 53.4 M a day either way (`.playwright-mcp/plan-fixes/measure-working.json`).
- **"Leave out flagged items" in the planner** (`plannerPool`, `SWITCH_EXCLUDES` in planner.ts; kept per browser, off by
  default). The user: "The capital planner should have a toggle to not include items with warning like these". On, it
  leaves out Falling, Bids not reached, Sells not reached, Crowded, Thin, Slow and Long queue, and says how many by flag
  (Market moved was among them until 9 October 2026, when Place and leave began leaving it out by default with a switch
  of its own);
  when every item is flagged, or nothing fits with it on, it says the switch is why. **Raises kept back never counts**: a
  cost already in the margin, on ~91 of 94 watched markets. On the 2 October scan (2,042 M, 75 free slots, 25% cap, 7
  days): on, it leaves out 532 of 791 front candidates (falling 230, sells not reached 202, bids not reached 169, thin
  134, long queue 74 on seven levels), and the mix still fills, 93 M a day against 95 M off. Off, the mix is unchanged.
- **The planner's "Scan again" banner doesn't say a quick scan is enough**: a quick scan re-reads a sample, and after one
  1,675 items stayed out of date. The cloud's daily full scan refreshes them all, or a deep scan.
- **The Capital planner starts from what you have now** (`walletIsk`, free slots from your open orders). It used to
  default to half the wallet and then keep whatever was first typed, for good: the user found 486 M against a
  972 M wallet. ISK (the wallet, rounded down to the million: escrow has already left it) and free slots are read
  on each visit; a typed figure holds for the tab (`sessionStorage`), with a link back. The horizon and the cap per
  item are still kept. A notice says when free slots allow fewer than three items, since that, not ISK, is often
  the limit (the user's 129 slots held 126 orders, 123 of them sells).
