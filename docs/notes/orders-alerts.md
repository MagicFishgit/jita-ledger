# Orders, To do and alerts

Decisions worth not undoing. What the app tells you to do about your orders and colonies, and how it reaches you: the To do list, browser notifications and in-game mail.

- **"Clears in" is checked against what happened** (`trackRecord`, `predictions`). Every five-minute round the
  cloud judges each ledger's orders once (for this and the alerts) and keeps each beaten order's prediction
  once per order and price (`predictionOutcome` in `lib/track.ts`). The order reaching the front, or its
  record showing it sold out, resolves it; a new price, or a record closed with stock left, voids it; after 14
  days it is late. An order gone from the book while its record still says open stays undecided: a sell-out
  leaves the book within five minutes but its record only says so after the next orders refresh, and the first
  version voided every one of those, which would have counted each success as a void. Orders' Clears-in tip quotes it from 5 checked predictions up: "N of M
  reached the front within twice the time it said" (`/v1/track`, 30 days). Results' item table counts relists
  in the period and their whole fees; Made holds only the share for units that sold.
- **Three more claims are checked the same way** (migration 0009, `lib/track.ts` pure, summaries on `/v1/track`,
  each shown only from `TRACK_MIN` (5) checked, with no "collecting data" wording before). The user asked for the
  guesses to be tested against what happened, like Clears in:
  - **Place and leave** (`leave_track`): each left order's pace at its price, from the planner's own model (its
    side's pace × `competitionShare` × reach/14), recorded in the five-minute round with what was left; closed at a
    new price, when it stops being left alone, when its record closes, or after 14 days (`leaveOutcome`; under a
    day is void, since the model is daily). Quoted as filled against expected on Orders' "Leaving it" tip and under
    the planner's Place-and-leave note. On 28 September 2026 the user had no left orders, so it starts empty.
  - **The Sniper** (`snipe_seen` gains `resale`, `clean`, `doubts`, `units`, written at first sight only): once a
    day after 12:00 UTC (`dailyChecks` in `worker/src/checks.ts`, from the hourly job) each listing shown a day or
    more ago is settled from its item's history: reached if a day's high after the sighting got to the relist price
    within 7 days (`snipeOutcome`). The Sniper page's "Checked against what traded after" sets clean listings against
    doubted ones and each doubt, which is the test of whether the doubts are right. Sightings before this change
    carry no relist price and aren't checked.
  - **Share** (`share_track`): the same `measureShare` as Settings' button, once a day per ledger from the cloud's
    copy of its trades, beside the setting then. Settings shows the latest reading until you measure by hand, and
    Prospects and the planner say so (`ShareCheck`) when the setting is over twice what it suggests, since every size
    there is linear in it. Its first production run (13:07 UTC, 28 September 2026) measured the user's trades at
    6.0% on buys (34 item-days) and 15.8% on sells (86), 7.5% suggested against their 6%, so nothing shows for them.
- **The cloud mails you when one of its jobs fails twice in a row** (`lib/watchdog.ts` pure, `worker/src/watchdog.ts`,
  alert kind `watchdog`, "Cloud job failing", on and mailed by default). Its jobs (copying the ledger, reading
  orders, alert checks, mail tidying, planets, the full scan, the Sniper, the daily checks) fail quietly while nobody
  looks at Settings. `noteJob` keeps each job's failures in a row (`fails`, `failing_since`, migration 0010), cleared by
  a success; failures in EVE's daily downtime (10:55–11:30 UTC) don't count, since ESI fails for everyone then and
  the Sniper, running every five minutes, would otherwise mail every day. The five-minute round checks each ledger's
  jobs and the shared ones (char 0) and mails at the second failure, then again each day it keeps failing (`warned`).
  The mail says what failed, since when, the error, what has stopped meanwhile, and what to do: nothing when it
  retries on its own, or hand the cloud your login again when the error says the login no longer works
  (`loginError`). Tested locally: the orders job counted 1 then 2 (it retries once its last try is 20 minutes old,
  so a lost login shows within about 40 minutes), and a Sniper success cleared a seeded streak. The mail can only be
  sent in production. It can't report the mail itself failing, or a cron that stops firing.
  **A login EVE refuses is one mail, and the app says so everywhere** (migration 0012, `keys.refused_at`/`refused`/
  `refused_warned`; `loginLostFinding`, `errorPredatesLogin`, `scopesMissing` in `lib/watchdog.ts`). On 29 September 2026
  the user logged in to the app again to accept new permissions; the cloud's login stopped ("Character grant
  missing/expired") and three mails came over two hours, one per job as each failed twice (alert checks 11:35, orders
  12:06, ledger copy 13:11). They then handed the login over again, and Settings still showed the old error in red: the
  ledger copy only runs at :07, and Settings had no button for it anyway (only Stop, then keep watch again). Now
  `useLogin` marks a login refused on a 400/401 from EVE's token endpoint (a refresh that works, or the login handed
  over, clears it), and its error names whose login it is. The watchdog sends one "Cloud lost your login" mail once
  the refusal has lasted 10 minutes outside downtime, then daily, and drops the per-job mails a refusal explains. The
  sender's login refused can't be mailed (it would send the mail), so that one shows only in the app. Settings shows a
  refused login in red with **Hand the cloud your login again** (the sender's too); an error from before the login last
  worked is said as old ("the last run was before that"); and when this browser's login has permissions the cloud's
  lacks, it says the cloud's is about to stop, since the cloud only finds out when its cached access token runs out.
  Handing the main login over runs the ledger copy at once, which proves it and clears the orders job too. To do lists
  a refused login (kind `cloudLogin`, source `cloud`), ticked off on a newer read of the cloud's status. An alt's refused or
  missing login is one such item each (`cloudLogin:alt:<id>`, source `roster`): seen at the roster's read, ticked off only by
  a later roster read of this session that shows it working or no longer lists the alt, never by a roster from disk.
- **Every device shows the same mail picture** (Settings → Alerts). The user logged in on a phone and found the
  panel asking them to log in a sending character, and "Alerts in the last 24 h" at 0, while the cloud was mailing
  all day: the panel read only that browser's own sender login and its own alert log (`alertLog` stays local). Now,
  while the cloud holds both logins, "Sent from" names the cloud's sender ("Nothing to log in here, on this device or
  any other") and its test mail goes through the cloud; the card and "Recent alerts" add what the cloud mailed
  (`GET /v1/alerts/log`, a week of `alert_log`, one row per alert at its latest mailing, marked "Mail"), and say how
  many came from each. Each device still keeps its own list of the notifications it showed.
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
- **Suspicious-market warnings are judged without your own orders** (`withoutOwn` in prospects.ts, applied in watch.ts). The
  user's Small Ghoul Compact Energy Nosferatu bid, 4,438 left at 2,229 at the front of a ~230-a-day market, was called "a
  wall. Don't queue behind it" on To do (30 September 2026): it was their own order. Your Jita 4-4 orders come off their
  price's level before the wall and escrow-bait checks, so your big order is no wall to you and your high bid no bait.
- **Suspicious-market warnings cover what you put ISK into**: open positions, open buy orders and the watchlist
  (`trackedTypes` in `signals.ts`), not items you only sell. The user's 118 loot items on sell orders filled To do
  with walls and spikes they didn't care about. A spike or escrow bait traps a buyer, and the queue ahead of a
  sell order is already weighed on Orders. The alerts use the same set.
- **Alert mail comes from the cloud once it holds a sender** (`worker/src/alerts.ts`). It judges each open Jita order
  with `judgeOrder` on the book the watch just read (never one over 15 minutes old: a stalled watch skips, it doesn't
  guess), history cached in D1 until ESI's `Expires`, the cloud's flow, the user's cost basis (the `costs` doc: the
  browser pushes `costBasis` every 10 minutes when it changes, since working positions out needs every trade and fee;
  only the cloud reads it) and the last 3 days' buys for `fillingNow`. Colonies are read hourly. It honours the synced
  alert settings (on, mail, kinds, minimum ISK, quiet hours, interval) through `shouldAlert`, sends one mail per round
  from the second character, and tidies old alert mail on `tidyEvery`. **A mail is remembered by the order and your
  price on it** (`mailKey`), not by the advice: every undercut changes the advised price, and with nobody reading,
  one order left alone would be mailed about every round. Move it and get beaten again and you hear again; otherwise
  after "Remind me again after" (`repeatH`: 1, 2, 4, 6, 12 or 24 h, default 4; it was a fixed six). **So the cloud mails less often than an open app notifies**: the app's key carries the advised
  price (`move:ID:newPrice`, `clear:ID:best`), so every fresh undercut is a new notification. The user asked on 27
  September 2026 why mail had "stopped" while notifications kept coming; a replay of the round on their live data
  showed 48 of 52 findings under their 5 M minimum (which the app applies too) and the other 4 held as mailed at
  that price within six hours. Offered the app's rule, they kept this one: it is anti-spam, and mail picks up
  again once they stop updating orders by hand. They found six hours too long, so it became the setting. While the cloud holds both logins (`cloudSendsMail`, from `/v1/status`, kept across reloads and
  re-read every 10 minutes) the browser neither mails nor tidies, so nothing arrives twice. Squeeze and
  suspicious-market alerts stay with an open app: they need signals the cloud doesn't keep.
- **"Keep it" is said where it's easy to see** (Orders.tsx, todo.ts, `judgeAll` in worker/src/alerts.ts; the guard is in
  market-reading). The user: Orders "told me to relist. It needs to be aware of plans and clearly state, easy to see
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
- **A left order the market has left since it was placed goes on To do** (kind `notReached`, "Not reached since you placed
  it", Needs action, source `orders`, `notReachedItem` in todo.ts; the rule is in market-reading.md; the plans review, 9
  October 2026). One item per order, whatever it's told, since the point is to see what sits where the market isn't: keyed
  `order:<id>` so it stands in place of that order's move or cancel item, never beside it, and versioned by the order's
  price as a long queue's is: where trading reaches now moves with each day's history and doesn't reopen a hand tick, a
  reprice does. A chore, so a hand tick comes back after 12 hours while it still says so. Opening a move copies its price
  and says what it costs; a cancel says what it frees; a Keep it, or a listing whose move would sell under cost, is said in
  the verdict's own words with nothing copied, and no cancel is added to a Keep it (the 8 October rule). Judged as any order
  item (`judgeOrder`): ticked off by a newer check that read its book and no longer says so ("You moved it to 104 ISK.
  You're leaving this one: …", or a Keep it's own words once reached since), or the order closing. On the review's data: 11
  bids (465.3 M of escrow: 2 to move, 3 to cancel, 6 Keep it holding 304.7 M) and 6 listings (3 to move, 3 not worth moving).
  The cloud mails only a Move it or Cancel it, as any (a `move` finding; the alert minimum applies), in the same words.
- **Industry jobs waiting to be delivered go on To do** (kind `industry`, source `industry`, `judgeIndustry`, scope
  `esi-industry.read_character_jobs.v1`, registered 29 September 2026). The sync keeps the jobs not yet delivered with
  when they were read and their facilities' names (`meta.industry`); a job is waiting when it's `ready` or `active` past
  its end (`jobWaiting`), and they're listed one item per facility, the job IDs in its `ver`. It ticks off only on a
  newer read with none of them waiting ("All delivered."), like every other item: absent is not done.
- **R&D agents past an amount go on To do** (kind `cashIn`, source `research`, `judgeCashIn`; the rules are in research.md):
  one item per agent once its datacores waiting are worth more than the amount set on the Research tab, keyed by
  character and agent, versioned by the whole datacores. Bought (said "most likely") or stopped only on a newer research
  read (an alt's only on a roster read of this session); a price fall, or the setting switched off or raised, unticks it.
  A hand tick holds until another datacore comes in (`HOLDS_UNTIL_CHANGED`, not WARNINGS, which would make it For
  information), not the 12 hours of other chores. Not mailed.
- **Couriers you've accepted go on To do** (kind `courier`, source `contracts`, `judgeCourierJob`, `lib/contracts.ts`, scope
  `esi-contracts.read_character_contracts.v1`, registered 29 September 2026): due at accepted + days to complete, with the
  reward, the collateral at stake (its ISK, for ordering) and the volume; "Overdue" past it. Ticked off on a newer read of
  your contracts: "Delivered.", or "It failed: the collateral went to the issuer." The same read keeps the items of item
  exchanges you sold or bought (read once each, the newest 500 kept), and the Wallet's contract entries (which carry the
  contract as `context_id`) say what they held ("2× Rattlesnake Blueprint") instead of "Contract price".
- **To do's Sell into bids items are judged like order items.** The dispatch listed move and cancel but not bid, so
  a bid item fell to the default judge and was ticked "It no longer needs doing" the moment it went missing, before
  the orders had even been checked. So are "Feeds a long queue" items (kind `feedsQueue`, 2 October 2026; the rule and
  its version are in market-reading.md): a judge of their own in the dispatch, never the default.
- **A plan item you cancelled or closed isn't asked to be placed again** (8 October 2026; the rule is in finding-trades.md).
  No "Place a buy order" item for a bid cancelled with nothing bought or an item whose position is closed or deleted; one
  already listed is done at once (the ledger is always current): "You cancelled the bid, so the plan doesn't place it
  again.", "You closed its position, so the plan doesn't place it." or "You deleted its position, …". **A cancel item that
  becomes a move is the move**: both are keyed by the order (`order:ID`), so the new build replaces the remembered item,
  its hand tick cleared, never ticked off as done (tested). A plan bid's cancel item says its why, which names the plan's
  floor (market-reading.md); others keep "leaves too little margin".
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
- **Pages that need the same live answer share one store**: `orderCheck` (your orders against the book),
  `watch` (squeeze and scam signals), `colonyStore` and the killmail pricer. Orders, To do and the
  alerts all read `orderCheck` rather than fetching the same books three times.
- **The browser's alerts run only while a tab is open**; a web page can't watch anything once it is closed. They
  reuse the pages' checks, respect quiet hours and don't repeat a finding within "Remind me again after" (4 h unless changed). With the app closed,
  alert *mail* comes from the cloud instead (see "Alert mail comes from the cloud"): its test mail, sent from the
  user's second character, arrived in game on 27 September 2026.
- **System notifications can't take the app's CSS** — the OS draws them. The app sets their icon (the hex
  mark, drawn to PNG) and an `image` (the alert as a card in the theme's colours, 2:1), which Chrome shows on
  Windows and Android and macOS ignores (`lib/notifyArt.ts`). They only fire while the tab is hidden, which is
  why Settings has a delayed test.
- **An alert mail says what to do before it says why.** Each alert opens with a **RECOMMENDED:** line (move
  your sell order down to X; leave it where it is; reset the extractor heads before a time), then the facts
  the check already had: yours against the best and by how much, what moving costs split into the lower
  price and the fee, what's at stake, the queue ahead and how long it takes to clear, or for PI the system
  (an in-game link), planet, product and end time. The subject leads with the same advice, since the inbox
  list and the new-mail notice show nothing else. The test mail is built from one of your real orders
  against the live book, so it shows exactly what an alert about it would say. The client's default mail text
  is small, so the whole body sits in `<font size="16">`, with titles at 20 and the brand at 26 (`SIZE` in
  `alerts.ts`); an inner size overrides the outer one.
- **Alerts can go by EVE mail, opt-in, always *to* the trading character and *from* a second one** (`lib/mailAlerts.ts`,
  builder `alertMail` in `alerts.ts`). The sender is a second login slot in `auth.ts` (`jita-ledger:mailer`,
  `loginMailer`, `getMailerToken`), asking only for send and organize mail. `handleCallback` tells the two
  logins apart by the `purpose` stored with the PKCE verifier, and refuses (and revokes) a sender login that
  comes back as the trading character. Logging either one out leaves the other. Without a sender, mail goes
  to yourself and Settings says it will only show after a relog. `esi()` takes a `token` to call as the
  sender. A mail has one ID for sender and recipient, so cleanup deletes the recipient's copy with the
  main login and then, best effort, the sender's Sent copy with the sender's. A browser notification is held back while a borderless game is in front, and a web page can't
  put anything inside the client, but a mail arrives there with the client's own blink. One mail per check
  holding everything raised, never one per alert. By default only `move` and `pi` are mailed, the two you can
  act on from inside the game. EVE mail has no link that opens a market window (`showinfo:` opens only the
  info window), so an item's *name* links to a web page that asks ESI to. It was first a `showinfo:` link with a
  separate market link beneath; the user asked for one link on the name, since the market is where an alert
  sends you. The client asks before following it and the browser opens the page. **Since 28 September 2026 that
  page is `open.html`** (`src/open.ts`, link built by `openLink`): the user found loading the whole app, with its
  animations, for one request heavy. It carries only the login and ESI code (1.9 KB plus a 13.3 KB shared chunk,
  against ~450 KB of script and the fonts), opens the market, counts 3, 2, 1 and closes; anything wrong keeps the
  tab open and says why. The link is `open.html?market=ID~Name` in one parameter, so no `&` reaches the mail's
  markup and the page needn't look the name up. Older mails' `#orders?market=ID` still work through the app
  (`lib/marketLink.ts`). Both take `market` off the address with `replaceState` so a reload can't repeat it. Nothing opens a market window unless someone clicked. ESI answers 204 whether or not
  the game is running, so the toast says the client was *asked*. Old alert mails are deleted after a chosen time (30 min to a week, or
  kept), read or not, on a cadence of a sixth of that time between 5 and 60 minutes (`tidyEvery`). Only mails
  **from you or your sender, with a subject starting `Jita Ledger:`** are ever touched (`isStaleAlertMail`); without
  the read scope, only the mail IDs this browser recorded sending. Cleanup runs even with alerts off, and
  stamps its time on failure too, so a lasting error retries at that cadence rather than every 15 s tick.
- **Only one tab runs the alert checks**, elected with a Web Lock (`ALERTS_LOCK` in `alertsRunner.ts`).
  Every tab asks for it, the holder checks, the rest queue and one takes over when the holder closes. Two
  tabs used to raise and mail every finding twice, and each click on a mail's market link opens a new tab.
  The grant can arrive after React's development double-run has already cleaned the effect up, so the
  callback checks a per-call `stopped` flag and resolves at once. A tab opened from a market link closes
  itself when another tab holds the lock: Chromium allows `window.close()` on a tab with one history entry,
  which is what an OS-opened link is (Playwright's `newPage` starts at `about:blank` and has two, so test it
  with CDP `Target.createTarget`). If the browser refuses, the tab says it can be closed.
