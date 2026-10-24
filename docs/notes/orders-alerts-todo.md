# Orders, To do and alerts: To do

Split from orders-alerts.md on 19 October 2026. Decisions worth not undoing. How To do lists, judges and ticks off each
kind of item, and the kinds it holds: orders, industry jobs, what you built, R&D agents, copy contracts, couriers and
plans.

- **To do ticks itself off** (`lib/todo.ts`). The user plays without looking at it, and a list still
  demanding things already done is worse than none. Every finding has a stable `key` (what it's about:
  `order:ID`, `pi:pin`, `squeeze:position`, `scam:type:flag`, `backup`) and a `ver` (its state: the suggested
  price, the expiry). The session remembers each one; when a build no longer produces it, a per-kind judge
  reads the current data and moves it to Done with what changed ("You moved it to 799,300 ISK, and it's at the
  front", "The heads were reset: it runs until …", "You exported a backup"). **Absent is not done**: before the
  orders are checked every order is absent, so a judge answers only from a read that can tell (an order check,
  colony read or signal read *newer than the one that showed it*, which for an order must also have read that
  item's book; or the ledger, which is always current: a sync saying the order closed, a position closed, a
  backup exported), and otherwise the item stays listed as being checked. "Newer" also keeps a second tab with
  an older check from judging what the first tab saw since; the tabs share the session through `storage` events. While the page is open it re-checks
  the orders when ESI's book expires (not more than every 2 minutes), colonies every 10 minutes while a PI item
  waits, and at once when the tab becomes visible again. A tick by hand holds for the same `ver` only: a chore
  for 12 hours, a warning (scam, squeeze) until it changes, so a new undercut reopens a skipped move. Done items
  stay listed 12 hours. The book cache in `market.ts` lets go at ESI's Expires rather than 5 minutes after our
  read, which had put a relist up to 10 minutes behind. A judge can also answer `false`: the item goes unticked,
  neither open nor done. That is what a suspicious-market warning does when its item leaves the set it covers.
- **To do can be sifted** (`needs`, `inFilter`, `tickAll` in `lib/todo.ts`; the filter per browser in
  `jita-ledger:todo-filter`). The user: "Some of the stuff is just informational but some like moving orders requires an
  actual action. I would like to be able to sift through for example just ones that require actions and then go look at
  the others... or press a mark all as done". All / Needs action / For information, with counts: warnings (a suspicious
  market, a squeeze) are information, everything else is something to do. "Mark all as done" ticks what's shown as each
  box would (a chore comes back after 12 hours if it still needs doing, a warning when it changes), leaving items being
  re-checked alone; ticked ones can be unticked from Done.
- **A left order the market has left since it was placed goes on To do** (kind `notReached`, "Not reached since you placed
  it", Needs action, source `orders`, `notReachedItem` in todo.ts; the rule is in market-reading-relist.md; the plans review, 9
  October 2026). One item per order told to move or cancel, keyed `order:<id>` so it stands in place of that order's move
  or cancel item, never beside it, and versioned by the order's price as a long queue's is: where trading reaches now moves
  with each day's history and doesn't reopen a hand tick, a reprice does. Opening a move copies its price and says what it
  costs; a cancel says what it frees. Judged as any order item (`judgeOrder`): ticked off by a newer check that read its
  book and no longer says so ("You moved it to 104 ISK. You're leaving this one: …"), or the order closing. **No item for
  Keep it or a listing whose move would sell under cost** (the coordinator's ruling, 9 October 2026, reversing a first
  version that listed them): there's nothing to do, To do adds no item for Keep it ("Keep it" above), and the user ruled
  out nagging ("not too tight"); a chore with nothing to do would sit under Needs action and come back every 12 hours.
  Orders says both, the lead under the verdict and "0 of N days since placed" (a listing's "since listed") in Clears in. On
  the review's data: 5 bids on To do (160.6 M of escrow: 2 to move, 3 to cancel) and 3 listings to move; the 6 Keep it
  bids (304.7 M) and 3 listings not worth moving only on Orders. The cloud mails the same moves and cancels (a `move`
  finding; the alert minimum applies), in the same words.
- **Industry jobs waiting to be delivered go on To do** (kind `industry`, source `industry`, `judgeIndustry`, scope
  `esi-industry.read_character_jobs.v1`, registered 29 September 2026). The sync keeps the jobs not yet delivered with
  when they were read and their facilities' names (`meta.industry`); a job is waiting when it's `ready` or `active` past
  its end (`jobWaiting`), and they're listed one item per facility, the job IDs in its `ver`. It ticks off only on a
  newer read with none of them waiting ("All delivered."), like every other item: absent is not done.
- **An alt's too** (Industry stage 2, `altIndustryItem`, `judgeAltIndustry`): one item per alt and facility, keyed
  `industry:<char>:<place>` so the main's items never reopen, seen at the alt's `sheet` read and ticked off only by a newer
  one on a roster read of this session (and only while its pulled copy is held: no copy is not a copy with nothing waiting);
  an alt gone from a live roster just goes. Built from its `jobs` records, which the cloud reads hourly, so it's as of that
  read; a refused alt's last-read jobs still list. Its place is `jobPlaceSaid`'s (a station by ESI's name, a structure by the
  alt's blueprints doc or the system it was first seen in), never a container.
- **An alt's expiring extractors go on To do** (Planets Task 17, 24 October 2026; kind `piExpired` / `piEnding`, source `roster`, `altPiItem`,
  `judgeAltPi` in todo.ts). Built in Todo.tsx from each alt's pulled `colonies` doc (the cloud's hourly sheet keeps it, only with the planets
  permission), through `colonyOfKept` and the main's rule (a programme ending within a day, or ended; idle ones skipped), keyed `pi:<char>:<pin>`
  so the main's `pi:<pin>` never reopens, versioned `<expiry>:ended|ending`, titled `<who> · <system> · <product>` with the Colonies section as
  its button. **Stake 0**, as an alt's industry items: To do has no price source for an alt's goods. A refused or lost login says the item is as
  the cloud last read it (`lostSaid`). Judged as `judgeAltIndustry` is: only on a roster read of this session (`rosterLive`, and only with the
  alt's copy loaded and its doc readable: a copy not loaded is not a colony without the extractor), whose `sheet` read is newer than the one
  that showed it (the item is seen on that read, `industrySeen`); the heads reset or the extractor gone ticks it off; an alt gone from a live
  roster just goes. **The main's colony re-read ignores them** (`piWaiting` counts only `source: 'colonies'` items), so an alt's item alone
  doesn't have the main's colonies read every `COLONY_TTL`. Not mailed: mail stays the main's alone. System and product names come from
  ESI's names (one call for both); until they land the item says the planet and "Item #…".
- **What you built goes on To do** (kind `built`, source `stock`, Needs action; `builtItems`, `builtItem`, `builtWhere`, `judgeBuilt`): one item per character, product and place, while the place's loose hangar holds at least the newest delivered jobs' units; versioned by the newest delivered job (correction 18: a hand tick holds until another delivery, listing part of a batch doesn't reopen it, `HOLDS_UNTIL_CHANGED`); judged on a newer stock read (the main's sync's, an alt's archive), fewer held saying "Listed, sold or moved: N left"; an alt gone from a live roster just goes. Priced where it sits (correction 15); a hub you added is listed at its own market's price, said; a hub picked that isn't known here (the cloud's list loading, the cloud off in this browser, failing, or no longer listing it) says why in that state's words, copies nothing, never prices the item in Jita and never says no hub is picked (`hubWhy`); not known is said as what it is (a Jita book that couldn't be read, the home prices' own states, a Goonmetrics row with no price), "nobody lists it there" only for a book read with no other listing or an empty sell side; only the main's item copies a price, an alt's opens Blueprints & jobs and says when its login is refused; a home you typed in is recognised by the system its job was first seen in (`builtPlaceSystem`); a ship's kind unknown is "checking". Not mailed.
- **R&D agents past an amount go on To do** (kind `cashIn`, source `research`, `judgeCashIn`; the rules are in research.md):
  one item per agent once its datacores waiting are worth more than the amount set on the Research tab, keyed by
  character and agent, versioned by the whole datacores. Bought (said "most likely") or stopped only on a newer research
  read (an alt's only on a roster read of this session); a price fall, or the setting switched off or raised, unticks it.
  A hand tick holds until another datacore comes in (`HOLDS_UNTIL_CHANGED`, not WARNINGS, which would make it For
  information), not the 12 hours of other chores. Not mailed.
- **A copy contract of yours that expired goes on To do** (kind `copyContract`, "Copy contract expired", source `contracts`, Needs action,
  `copyContractItem`, `judgeCopyContract`, `copiesWhat`; Industry stage 3, Task 15C). One item per contract that is outstanding past
  its expiry and still in ESI's list (`copyState` 'expired'), keyed `copies:<contract>`, version `1`, stake its price. ESI has no expired
  status and the copies stay in the contract until you delete it in game, which returns them to where it was made (the station is named
  from `meta.contracts.places`). It ends only on a contracts read newer than the one that listed it (a read at the same moment is no
  newer): deleted, no longer outstanding (ESI's status), or no longer listed by ESI (it lists contracts only 30 days back, so if you
  didn't delete it its copies are still in it; correction 13). The button opens the contract in game when the login can, else the Copies
  section. Its title names the blueprints from `d.names`, or says "2 copies" while a name is unread, never "Item #…". A hand tick is a
  chore's (12 hours). Not mailed.
- **Couriers you've accepted go on To do** (kind `courier`, source `contracts`, `judgeCourierJob`, `lib/contracts.ts`, scope
  `esi-contracts.read_character_contracts.v1`, registered 29 September 2026): due at accepted + days to complete, with the
  reward, the collateral at stake (its ISK, for ordering) and the volume; "Overdue" past it. Ticked off on a newer read of
  your contracts: "Delivered.", or "It failed: the collateral went to the issuer." The same read keeps the items of item
  exchanges you sold or bought (read once each; the newest 500 kept, and every contract still in ESI's list), and the Wallet's contract entries (which carry the
  contract as `context_id`) say what they held ("2× Rattlesnake Blueprint") instead of "Contract price".
- **To do's Sell into bids items are judged like order items.** The dispatch listed move and cancel but not bid, so
  a bid item fell to the default judge and was ticked "It no longer needs doing" the moment it went missing, before
  the orders had even been checked. So are "Feeds a long queue" items (kind `feedsQueue`, 2 October 2026; the rule and
  its version are in market-reading-relist.md): a judge of their own in the dispatch, never the default.
- **A plan item you cancelled or closed isn't asked to be placed again** (8 October 2026; the rule is in finding-trades-plans.md).
  No "Place a buy order" item for a bid cancelled with nothing bought or an item whose position is closed or deleted; one
  already listed is done at once (the ledger is always current): "You cancelled the bid, so the plan doesn't place it
  again.", "You closed its position, so the plan doesn't place it." or "You deleted its position, …". **A cancel item that
  becomes a move is the move**: both are keyed by the order (`order:ID`), so the new build replaces the remembered item,
  its hand tick cleared, never ticked off as done (tested). A plan bid's cancel item says its why, which names the plan's
  floor (market-reading-relist.md); others keep "leaves too little margin".
- **A plan bid the market has moved from says so on To do, with Skip it** (`placeBuyItem`'s `moved`, `TodoItem.skip`; the
  rule is in finding-trades-plans.md, 9 October 2026). Its "Place a buy order" item, read against the live Jita book every five
  minutes while To do is in view, leads its detail with "The market has moved since the plan priced it" and a line a side
  with today's figures, and has **Skip it** under the detail beside the usual Open (which still copies the plan's bid, to
  place it anyway). Skip it marks the plan's item skipped, as the checklist's button does; the item is then done, "You
  skipped it: the market had moved from the plan's prices." Its version stays `'1'`, so a hand tick isn't reopened each
  time a read crosses the 5% line. Not mailed. A book that couldn't be read is said ("Its Jita book couldn't be read, so it
  isn't checked against today's market."). After a skip, To do offers **Close position** for the item's empty position when
  the plan opened it (kind `close`, version `skipped`, `skippedEmptyItem`), as it does a position backed out of after a
  cancelled bid; put back on the plan, that item is done ("You put it back on the plan: place its bid from the checklist.").

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **"Feeds a long queue" counts your own listings at any price**, and tags a buy not meant for resale alike (ore bought for
  a freelance job; ore markets clear fast, so unlikely). **Its To do item ticks off when a check no longer tags it**,
  which a pace the check can no longer read does too: the words say what Orders now shows, not that the queue is short.
- **To do's "Fewer datacores waiting: bought, most likely" is an inference**: cancelling and starting again with the same
  agent between ESI's hourly reads reads the same.
- **List what you built can lag and can come back** (To do, industry-jobs.md). Its units come from the hangar copy ESI holds for an hour, so an item can stay up to about an hour after you've listed; units are alike, so an old job's item can come back if you later buy the same product at that place (stated, not bounded); and products delivered into a container never list (nested units aren't loose stock) until the first real delivery says how they land. A ship is "checking" until its kind is read and is never priced at Jita from a home hub while "never haul ships to Jita" is on. "Either" lists at Jita here.
