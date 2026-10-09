# Honest limits in the model

State these rather than letting them be discovered.

State these rather than letting them be discovered:

- Everything in Prospects scales off `settings.share` (% of daily volume you capture, default 10).
  It's a guess, and absorption is linear in it.
- No market-impact modelling. At billion-ISK positions your own orders move the price against you.
- Jita 4-4 only. Orders elsewhere can't be judged and are counted out with a reason.
- **Pricing a buy where trading reaches is conservative.** Because ESI trims each day's low, an item whose
  dumps into bids live entirely in that trimmed tail looks unreached and can drop out of Prospects. Nobody can
  build a position on that tail, but a small, patient order might still fill there.
- The reach count uses The Forge's history, not Jita's alone (plus the exact Jita fills the cloud watched).
- A scan treats cached stats without `lows14`, and books without `npcSell`, as stale, and fetches history for
  any item it prices whose stats lack the lows. The liquidity pass refreshes the *most-listed* items and the
  pricing pass takes the *best-margin* ones, which are mostly different: before the second fix only 5 of 42
  priced items had lows. Items a scan doesn't reach keep their old record, priced one step over the best bid
  and unflagged, until one does.
- Loyalty prices the best 40 offers against the live book first, then every other offer that looks
  profitable on the rough prices in a background pass (`priceRest`, about half a minute for Caldari Navy's
  store). Loss-makers on the rough price stay rough.
- Abyssal ISK-per-run only counts loot that has been **sold**. A good week looks flat until you list
  the hangar, and filaments you looted rather than bought aren't counted as runs at all.
- Hauling reads The Forge only. Contracts starting elsewhere are invisible, which is the right
  default for someone sitting in Jita and the wrong one for a dedicated hauler.
- A PI region scan is one request per planet (~610 for The Forge). Cached permanently since planet
  types never change, but the first run on a region takes a minute.
- **PI does not model powergrid or CPU.** Command Center Upgrades governs how many extractor heads
  and factories physically fit; "1 factory per planet" does not check that you can fit it. The
  per-structure costs and per-level budgets are not in ESI.
- Alert mails were seen in game, sent from a second character: the ARGB `<font>` colours, `<b>` and the links
  render as intended, and the market link opens the market window through the app (the client's external-link prompt can be told never to ask again). The cost is
  focus: the OS brings the browser forward to open the link, and on a single monitor the game drops behind
  it. A page can't hand focus back to another application, so the user tabs back in.
- Deep Space Transports, Blockade Runners, Industrials and Jump Freighters get **no** skill cargo
  bonus, because their bonus attributes do not say which stat they modify. Their presets are bare
  hulls and the figure stays editable.
- The colony panel's rendering of live data is **unverified**: it needs the planets scope and a
  character with planets. Its logic is unit-tested; the screen has never been seen with real data.
- **The buy/sell split is an estimate.** The book's reading was a median 0.17 from what traded in the next hour
  or so (history's guess 0.26), tested on items trading 20+ units in that time; thin items weren't in the test,
  and a side of single-unit orders can't be read at all. The book reflects its orders' whole lives (a bid can be
  weeks old) while a watch reflects the hours the app is open. Books cached before `sold` was kept fall back to
  history until the next scan.
- **"Clears in" assumes nobody undercuts you meanwhile**, and in practice most beaten orders get undercut again
  within hours. It also needs a day or so of the app watching an item before the measured split outweighs the
  guess, and it measures during the hours the app is open, which is the right bias for someone deciding now.
- **Orders' "After a move" is six days of one trader's moves** (27 September to 3 October 2026, 415 with a known rate,
  mostly loot and module sells; market-reading). Its bands are typical figures, not a forecast; the moves beaten within
  10 minutes are left out, so a real move can be beaten sooner, and a move changed again before it was beaten counts as
  not yet beaten. The rate reads only whole days before today, so an item first watched today says nothing until
  tomorrow, and undercuts are counted by UTC day, five minutes apart, so a brief spell at the front can be missed. The
  bands were cut on the cloud's all-day watching; with the cloud off, the rate comes from the hours this browser was open,
  a different sample (as for Clears in).
- **Net worth values assets at CCP's rough global average**, which flatters anything hard to sell, and its
  trend exists only from the first day the Wallet page was opened in this browser.
- **"Every item you traded" can't separate Personal sales from trading within one item.** Where an item has both,
  the Personal trades are left out, but a sell order that filled them still has its fee charged to the trading as
  spent: fees match orders by the second, and a trade doesn't say which order filled it.
- **Results leaves out any trade whose item belongs to no activity set**, and counts LP-store goods as loyalty
  income only for the stores you currently hold points with.
- **The full-market scan's prices are the morning's** for everything outside the watch: the cloud re-reads the
  best 150 candidates every five minutes, and every other item's book is as it was at 11:25 EVE until the next day.
  An item whose spread was under 4% that morning and widened since isn't checked until then either.
- **Hub arbitrage reads selling speed from the hub's whole region**, which is mostly but not only the hub.
  It prices about 40 candidates (the busiest from the last scan, plus positions and watchlist) — not the market.
- **Combat's "Does PvP pay?" is a ceiling**: everything that dropped from your kills, whether or not you looted
  it, against what PvP cost you.
- **A mining fit's yield "at your skills" on a hull you can't fly yet** counts your yield skills and none of the hull's
  own (a Hulk at Mining I reads 1,185 m³ a minute, 3,177 at all V). It's what the fit would do the day you could undock
  in it with nothing else trained, and payback over what you mine now is measured against that. Boosts, drones and heat
  are in no yield figure; the Porpoise, Orca and Rorqual mine only with drones and say so.
- **The Wallet's unusual-activity check is a prompt, not a detector**: new donors, large donations out, and big
  contracts at hours with under 2% of your journal activity.
- **Abyss Tracker is what its users log**: it leans to dedicated runners, its losses are far under what zKillboard shows,
  a trio's run is logged under one hull, and its DPS, EHP and cost come from its own engine at all V. A ship's "most run"
  totals add up only its fits on the most-run lists, not every run in it. Where a ship sits on the Abyssal tree and which
  cells it suits come from what players run there, not from a simulation of the fit against the pocket.
- **No fit on the Abyssal or Hauling trees has been checked in a fitting tool against today's game.** Items that stopped
  existing would fail to price or save; ones whose stats changed wouldn't show it. Abyss Tracker's fits migrated from the
  old tracker all say they were uploaded on 29 March 2024; their real age is older. A hauling fit's EHP is EVE Workbench's,
  at skills it doesn't state.
- **The income recording compares figures as the pages show them** ("−41.48 B ISK"), so a drift under about half a
  percent of a row wouldn't show there; the exact sums are pinned by the hand-worked tests in `scripts/check.mjs`.
- **An alt's Earned leaves out ships it lost and what it bought for freelance jobs**, since the cloud reads neither for
  an alt, and it's as of the cloud's last read of it. Its card's tip says so.
- **A courier contract between two of your characters isn't a transfer**: the hauler's reward names the Secure Commerce
  Commission (eve-facts), so it's Hauling income, which the Characters page's Earned for all characters counts, and the
  issuer's side is a running cost ("Couriers & contract fees") unless it names both characters (not yet seen).
- **Contract and direct-trade transfers between your characters rest on the both-parties rule alone**: no real
  `contract_price` or `player_trading` entry between two characters has been seen.
- **A character taken off the roster stays yours for good** (`chars` keeps it, so past transfers stay transfers). One
  sold to another player keeps reading as yours: their ISK to you is "Between your characters", not money in, and the
  unusual-activity list never calls them a new donor.
- **Where an ore is found rests on one wiki page that asks for a post-Catalyst update**, with no second source for its
  belt tables. A place lumps region quarters and null-sec security classes together (a row's words say which), and the
  companion ores of sov deposits aren't all placed.
- **Best ore's ISK a m³ is the top bid**, not what a hold of it fetches through the book, and its ISK an hour leaves out
  boosts, drones, travel and selling time.
- **A plan's buy is judged at today's fees and its plan's sale price.** `expected` uses today's rates, not the planner's
  then; the plan's price caps the resale even after the market rose past it; fees already paid on an order count against
  a raise; the guard doesn't look at whether the bid is visibly filling (the Key filled 16 → 9 → 7 and could still read
  Keep it). An unreached plan bid moves when the same guard clears the plan's floor (since 8 October 2026), and cancels or
  keeps as before otherwise, so it turns Cancel it into Move it only for a plan expecting under twice your target; above
  that the floor is your target and the plan's price, where lower than the market's, makes the move's figure lower.
  Orders' check of it was one snapshot of the user's orders with 4 buys (1 October 2026): the Praxis replay and the Key
  are the evidence; the unreached rule's, 16 open plan buys on 8 October with no cloud flow (market-reading.md).
- **A plan bid cancelled with nothing bought takes its item off the plan, and when it was cancelled can't be told**: ESI
  doesn't say. So the bids that count are those placed since the plan started (less two minutes' slack), or since the
  item's position opened when that was within the day before the plan; a bid placed after such a position opened and
  cancelled before the plan started still reads as cancelled for the plan, and the checklist doesn't ask for it. Not the
  hour before the plan that placing falls back to: there a bid placed and cancelled before the plan would drop the item
  for good (the review, 8 October 2026), so a bid placed in that hour and cancelled after the plan started is asked for
  again. A new bid counts as placing it. An expired bid with nothing bought is asked for again (finding-trades.md).
- **The token guard's history lags a market that moved over 10% within the fortnight**: falling, a real undercutter can
  read as a token. The share and day's-volume guards catch most (the Key's sell: 26 ahead against its pace).
- **A Place-and-leave plan leaves only orders placed since it started** (less two minutes; finding-trades.md): a bid placed
  for it earlier, which the checklist counts as placed, gets the usual advice until Leave alone is clicked on Orders, and
  an order of another plan's placed after it is left with it. Telling them apart would need each order tied to its plan.
- **A plan's view of a position it shares is split by time, not by order** (positions-results). A bid placed before the
  plan that fills after it counts as the plan's buying, and an older plan sharing a position with a newer one counts the
  newer one's trading too: Clone Soldier Transporter Tag's position is the 30 September plan's, with its 4-unit bid still
  open, and the 2 October plan's. Telling them apart would need each fill matched to its order, which ESI's trades don't say.
- **An item whose book wasn't watched for a day carries no raises in the planner**, which flatters its return by about
  1% against a watched one.
- **A freelance reward's tax, worked out without the journal's own, uses its corporation's rate now** (ESI keeps no past
  rate): one whose rate changed reads "not recorded" (loyalty-hustles).
- **Long queue's count is the cloud's morning read**, carried onto live books for up to a day: a queue that has thinned
  since reads long until the next scan, and the browser's ceiling (its own watching) can sit above the scan's ("at least").
- **"Feeds a long queue" counts your own listings at any price**, and tags a buy not meant for resale alike (ore bought for
  a freelance job; ore markets clear fast, so unlikely). **Its To do item ticks off when a check no longer tags it**,
  which a pace the check can no longer read does too: the words say what Orders now shows, not that the queue is short.
- **A Sniper "Copy all" with a ship in it is guessed Personal on the Wallet** ("a fit to fly", the multibuy rule); Results
  and Your snipes read only what you mark.
- **A plan's filled buy can take up to about an hour to reach "Bought: list it"** (the list step, finding-trades.md):
  its trade arrives when ESI's copy of your trades turns over (held an hour), and the stock to list is held to what the
  Jita hangar held at its last read, also an hour's copy, so a hangar read from before the fill reads it as none until the
  next. The cap is what stops a listing that sold coming back as stock to list; the cost is that wait.
- **R&D agents: a datacore is taken as 100 research points** until a real purchase is logged (CCP's 2012 dev blog and the
  static data; CCP's support page, edited 2024, says 50, 100 or 150 by field), so datacores waiting, their worth and To
  do's cash-in can be off by half or half again for a field that costs otherwise (research.md).
- **The field level an agent asks for is taken as the agent's own level** (EVE University's example; a 2023 player report
  disagrees), so "once Electronic Engineering reaches II" may ask for more training than the agent does.
- **Whether two agents may research one field at once isn't confirmed**: the Research tab's pick step allows it and says so.
- **ESI's points a day lag a skill or standing gained** until the agent is reopened in game; the card works out the rate it
  should be and says so when the two differ past 2 RP or 2%.
- **An alt's standings and research are as of the cloud's last hourly read**, and stop at it while its login is refused or
  not held (the page says which).
- **All income doesn't net the 10,000 ISK datacore fee against datacore sales**: the fee is its own Wallet line,
  "Datacores from agents", and the datacores sell as "Sold, never bought" (or as trading when you also bought some).
- **To do's "Fewer datacores waiting: bought, most likely" is an inference**: cancelling and starting again with the same
  agent between ESI's hourly reads reads the same.
- **Check my hangar reads ESI's copy of your assets, up to an hour old**: ESI holds them an hour, so loot just moved or
  sold may not show yet; the dialog says when the copy was taken.
- **Its "Not the position's" is a count, not which units**: units of an item are alike, and EVE's trades don't say which
  stack a sale came from, so it says how many held where the position counts (and listed) are beyond the position's own
  stock, never which ones. Where it counts is Jita 4-4's whole station, or every station for a position with Only Jita 4-4
  trades off.
- **It sets three of ESI's copies against each other, of different ages** (your hangar's, up to an hour old; your trades'
  as last synced, held an hour; your orders', 20 minutes): a bid filling, a listing placed or a sale between them reads as
  units that aren't the position's. Where the app can see it (positions-results.md lists when), a bid's fills are said
  as "up to N more" beside what's certain, and a listing or a sale takes the row out of the lead. **A purchase straight
  from a listing, with no order behind it, or a bid's fill the orders' copy doesn't show yet, between your trades' copy
  and the hangar's, can't be seen**: it reads as not the position's until ESI's next copy of your trades (an hour after the
  last), and Check for new trades can't bring it in before then. The dialog says so in a line on the lead, only when the
  hangar's copy is more than 5 minutes newer than your trades': copies within 5 minutes are taken as one read pass, so a
  fill in those minutes goes unsaid. And a sale into a bid at exactly one of your listings' prices is taken to be from the
  listing.
