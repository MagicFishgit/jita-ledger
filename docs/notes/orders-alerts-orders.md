---
paths:
  - "src/lib/todo.ts"
  - "src/components/{Orders,Todo}.tsx"
  - "worker/src/alerts.ts"
---

# Orders, To do and alerts: the Orders page

Split from orders-alerts.md on 19 October 2026. Decisions worth not undoing. What the Orders page says and does beside
each verdict: Keep it, the price copied when an item opens in game, a sell priced under cost, and the panel taken off.

- **"Keep it" is said where it's easy to see** (Orders.tsx, todo.ts, `judgeAll` in worker/src/alerts.ts; the guard is in
  market-reading-relist). The user: Orders "told me to relist. It needs to be aware of plans and clearly state, easy to see
  that you should not move it" (1 October 2026). On Orders a refused raise reads **Keep it** with a hand, in a warning's
  amber (`--acc2`, as Move it: told apart by the label, the icon, the row not lit and the reason in full under it; red
  means Not worth it), with no Move to, no cost and nothing copied. It has its own tile and a count beside "worth
  moving", either of which, pressed, shows only those rows (it flashed them until 2 October 2026: app-conventions, a count
  tile filters the table it counts); it sorts after Move it and Cancel it, before Leave it and In front. A
  plan's orders carry a Plan chip (the plan's name, prices, expected return and floor in its tip); the Guide's "Move the
  amber ones" is "Move the ones marked Move it" and "Keep the ones marked Keep it". To do adds no item for it: a move
  that becomes Keep it ticks off in the guard's words on a newer check that read the book, and an item a newer check no
  longer lists copies no price when opened. The cloud's round reads the `plans` doc (sanitized) and, only when there are
  plans, the positions records, a row that doesn't parse skipped; no doc, or one it can't read, is no plan. A refused
  raise is never mailed as a move, and a guarded buy that was "beaten but clearing" loses that mail.
- **Weakest slots is gone from Orders** (3 October 2026). The user: "we can remove the weakest slots, i don't think it is
  usefull". It was a panel over the table naming the three orders earning least per slot, each beside an item from the
  last Prospects scan that would earn more ("Check it in the calculator"), with the scan's age; re-ranking the scan for it
  ran on every visit to Orders. The Per slot column stays (sortable, its tip saying the lowest are the first to swap), and
  the Guide's "Mind what each slot earns" and List loot's slot notes point at it. Don't bring the panel back unasked.
- **Opening an item in game from Orders or To do copies the price to move to** (`copyPrice`, `CopyPrice` and the
  `copy` prop of `NameInGame` / `OpenInGame` in `common.tsx`; To do's `action.copy`). The user asked for it, with a
  copy icon beside the price "like we have in sniping": the Sniper's copy button exists because a relist typed by hand
  went in at 1,893,000 instead of 1,893. The copy happens before the market window is asked for, while the click still
  counts (browsers only let a page copy in answer to one), in the game's price-box form (`plainPrice`: 100100, cents
  only when there are cents). It says "Suggested price copied: 100100" in a toast that lives 2.5 s whatever the
  toast setting (a toast can carry its own `lifeMs`): the user asked for "a quick notification pop"; opening itself
  still says nothing. A clipboard is the device's
  own: from the phone (the user's usual remote for this) the price lands on the phone, not the PC, unless the two
  share a clipboard.
- **A sell priced under what it cost says so, whatever else it's told** (`underCost` in relist.ts, the "Priced under
  cost: breaks even at X" tag on Orders, To do kind `underCost`). The user: "if I happen to price an item that would
  lose money compared to what I buy it at it should clearly highlight and tell me that that is what I am doing and
  consider correcting the price." Moves were already guarded against selling under cost, but an order's own price
  wasn't: one at the front, or told to leave it, could lose on every sale with nothing said (a price typed a digit
  short is exactly that). When its price after the broker fee and sales tax is under the cost (positions, or
  `heldCost`), Orders tags it red with the loss per unit and in all, and the least price that breaks even; To do lists
  it to correct, and opening it in game copies the break-even price (a "Not worth it" move is never copied). It ticks
  off like an order item, on a newer check of the book. Not mailed yet.
