# Orders, To do and alerts: List loot

Split from orders-alerts.md on 19 October 2026. Decisions worth not undoing. List loot: a hangar of loot priced for the
Sell window's import, what it leaves out, and why the one-paste listing isn't usable at the moment.

- **List loot and List your stock say they're not usable at the moment** (`SellWindowBanner.tsx`, full on List loot,
  compact on Positions' List your stock). The user tried the one-paste listing on 29 September 2026: the Sell window's
  import only prices items already in the window (see eve-client.md), so selecting the items in the hangar stays manual,
  which was the whole point. An app-made filter link to select them was researched and ruled out (a filter link points
  to a server-side copy). The user may ask CCP for the import to add the items it names, as Multibuy's does; the tools
  stay, with the banner ("Not usable for listing at the moment"): the user still uses List loot to sort a pile of junk
  loot into the few worth listing by hand and the rest to sell into the bids. Offered and declined for
  now: a kept "Loot" filter with "Name is not" lines for trading stock, plus a list of rows to remove per pass.
- **List loot prices a hangar of loot for the Sell window's import** (`lib/lootList.ts` pure, `Loot.tsx`, nav "List
  loot"). The user had junk loot and didn't want to "just immediate bulk sell because that sells to buy orders and you
  lose out money". Paste the hangar (list view, Ctrl+C) or the Sell window's export, or use the synced Jita hangar.
  Each item is priced where a listing sells (`listingPrice`), set against what the bids pay now after tax
  (`walkBids`), with your own orders taken out of the book; listing must beat the bids by your target and 1,000 ISK,
  and a listing over a year from selling goes to the bids. The listings that gain most per day of a slot fill the free
  order slots (slots from skills, less your open orders); the rest wait for a slot. Items with an open position, or a
  sell order of yours already on them, are left out unless included: the user wants to "confidently sell loot and
  when I want to, positions". The block copied is `name<TAB>price` per listing in the chosen decimal form; prices over
  five minutes old say to price again. First version sent a slow item to the bids: 18 Small 'Hope' Hull Reconstructor I,
  ~86 days listed but 1.29 M against 26 k in the bids, the best use of a slot per day in the lot; slow now only reads
  as slow. On the user's 28 items it listed 12, sent 11 to the bids (listing one step over their bid gets less than
  the bid after the broker fee) and held 5 for slots.
  **Ships are left out too, unless included one by one** (`HELD_WHY.ship`, category 6 from ESI's type and group,
  `typeKind`, kept for good): the user's first hangar read offered their fitted Jackdaw, a Malediction and a Nereus, and
  they asked for ships out of the tool, since "the risk of it is too high for how expensive they can get", with a
  control to override. An item whose type couldn't be read is left out the same way (`unchecked`). Things holding other
  things (a fitted ship, a container with things in it) are set aside from a hangar read entirely: the stock record
  marks them (`holding`, from assets whose `item_id` other assets sit in), since they can't be sold as they are. That
  first read also showed dozens of "Item #…" (the hangar read took names only from the ledger's cache; they now come
  from the same type lookup) and the items to select as one long comma-separated paragraph, now a wrapped list showing
  a dozen with the rest behind "and N more". Three more tiles, which the user asked for, say what everything not left
  out comes to listed where it sells, sold into the bids now, and as the plan splits it (`lootTotals`); and Clear resets
  the page.
  **Then, the same night:** the user couldn't find the control to include ships (a per-row button in the last column),
  so every kind left out has a switch in its own panel, off each time the page opens ("Include ships (4)", "Include
  snipes you still hold (1)", positions, your listings), and each row a tick box in a column beside the verdict that
  overrides its kind. **Snipes you still hold are a kind** (`snipesHeld`): the user's sniped Caldari Navy Uranium
  Charge S came up to list as loot; it's found as the Sniper page finds snipes (`instantBuys`, `groupBuys`,
  `judgeTaken` on the history the page reads anyway), less what sold since. **Assembled containers are in use** ("that
  is just wrong because I am using those"): the stock record counts assembled units (`assembled`, ESI's `is_singleton`),
  and a hangar read sets aside assembled items in `IN_USE_CATEGORIES` (containers are category 2, Celestial; also
  deployables, starbase parts, structures). A blueprint original is assembled too and isn't in those, so it stays. A
  sync from before `assembled` was kept can't say, so every container is taken to be in use. The table sorts on every
  column and keeps its header in view, like Orders (`jita-ledger:loot-sort`).
