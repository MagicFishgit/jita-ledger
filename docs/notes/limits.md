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
- **A left order's days since it was placed count the day it was placed whole**: trading that morning, before the order
  existed, counts as reaching it (which errs towards saying nothing), and ESI's history runs a day behind, so an order
  placed on the 3rd is first judged on the 6th (the 5th when the app or the cloud watched that day). Fewer than 3 days with
  trading since says nothing new. A price change doesn't restart the count (the first version's time), and the price a
  move goes to was reached on at least one of those days (a sell's is the highest since, a buy's no lower than the lowest
  since), so once moved there it reads as reached until those days leave the 14, when the usual count takes over: the
  CNMGC moved to 345,150,000 on 6 October would have sat there unsold and unflagged until about the 17th.
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
  again. A new bid counts as placing it. An expired bid with nothing bought is asked for again (finding-trades.md).
- **The high bid's own switch rides the synced alerts document, and an older build's save drops it** (`sanitizeAlerts`
  keeps only the kinds it knows, as with every late field; orders-alerts.md): a device on a version from before it that
  saves its alerts writes them without `highBid`, and the cloud then takes Mistake listing's values for it again, so high
  bids for what you hold are mailed again (once per item per "Remind me again after") until the switch is set again from a
  current version. Browsers reload to a new version within minutes.
- **A plan bid's re-check against today's book happens only where the checklist or To do is open** (finding-trades.md):
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
- **Leaving Market moved out of Place and leave lowers the planner's expected ISK a day** (171 M to 129 M on the 2 October
  plan's start): a moved item looks best on paper. What replaces it is the next best on the same model, whose pace for Place
  and leave the plans review found far too high; that the replacements do better isn't shown, only that the moved ones did
  worse.
- **Importing a backup from before `leaveFrom` restores its `leave` with `leaveFrom` empty and doesn't run the cleanup**
  (finding-trades.md), so plan items whose positions have since closed are left whole again until Leaving it is clicked on
  Orders.
- **Place and leave's round-trip rate is history's, daily and region-wide** (finding-trades.md). A day that reached both
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
- **The token guard's history lags a market that moved over 10% within the fortnight**: falling, a real undercutter can
  read as a token. The share and day's-volume guards catch most (the Key's sell: 26 ahead against its pace).
- **A Place-and-leave plan leaves only orders placed since it started** (less two minutes), or since its item's position
  opened when that was within the day before with nothing traded (finding-trades.md): a bid placed for it in the hour before
  the plan on a position open longer, which the checklist counts as placed, gets the usual advice until Leave alone is
  clicked on Orders, and an order of another plan's placed after it is left with it. Telling them apart would need each
  order tied to its plan.
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
- **Selling at the industry share of each side's pace is a guess** (10% unless typed), and profit a day is linear in it. No
  competition, undercutting or relist fees are modelled. **Materials are bought at today's asks**; a patient bid is shown,
  not assumed. **Mined materials cost what they'd sell for**, never nothing, and are counted only for a builder with mining
  records in the last 30 days.
- **A structure's facility tax and rigs are typed until measured** (stage 2 measures the tax); until then profit is ranked
  before the tax, said. **NPC BPO places outside The Forge are read when a row is opened**; the list's price elsewhere is
  CCP's base price.
- **Home prices are Goonmetrics'**, a Goonswarm tool fed partly by its members' client uploads, read every six hours: a
  hub's best sell can be hours old, and its weekly movement is the only pace until the home region's history is read (and
  that history is the whole region's, not the hub's). The hub's broker fee is typed, not known.
- **A Goonmetrics read cut short reads the types it never reached as having no price there.** A hub's row holds only the
  types that came back; one stopped by three failures in a row, or by the round's time, is kept and stamped (partial), and a
  type in a batch it never reached reads "no price at UALX-3" rather than "not read" until a later round reads it. Rounds
  start from the first batch, so a hub cut at the same point each time (a rate limit no read has met yet) never reaches its
  last batches. Rotating where a round starts would cover them over a few rounds (left for stage 4, which reads home books).
- **Buying at a hub priced by its own read walks its best five levels for a week's need** (`HOME_LEVELS`): deeper stock isn't seen, so a
  material whose week's need sits past five levels reads too thin there, said with how many are listed. Goonmetrics' hubs keep its depth rule.
- **A hub's own read is hourly, so an order you placed since it is still in the book until the next read** (your own orders of that item come off its levels by exact price, if issued by the time of the read; one placed or repriced after it is left alone, whatever its price, and priced as a rival until then). **At a hub with no weekly movement the top rows' materials are priced on this morning's Jita asks**: the live Jita books are read for rows that already have a pace, and nothing there has one until the home history is read.
- **On a thin home market a high profit a day rests on a few sales.** Goonmetrics' weekly movement, the only pace until the home
  region's history is read, is a handful of trades there, so a row selling one unit every couple of weeks at a large margin
  (the first look at the real UALX-3 row ranked such items first) is ranked honestly by the share rule but is the least sure
  figure on the page; under one sale a day the finder says the time between sales rather than a fraction.
- **Tech II's invention cost is EVE Ref's formula checked on a one-run rig copy.** For a ten-run module copy the job is
  taken, as the spec reads it, on one run's EIV an attempt; that case hasn't been checked against a real job. Decryptors
  and reactions aren't modelled, and each Tech II row assumes one lab slot inventing for its one factory slot.
- **A Tech II row is one job a day**, as every row is (a job is a day of runs): a one-run copy builds one hull a day though a
  factory slot could take two or three if jobs were installed more often, so Tech II rows read below what a factory slot
  and a lab slot can make then. The detail says so where it binds ("One job a day").
- **Slots in use count finished jobs not yet delivered**: players report a finished job holds its slot until it's delivered
  (EVE University's "Industry" page doesn't say); if the game frees it sooner, in use reads high by the ready jobs until they're
  delivered. **An alt's blueprints and jobs are as of the cloud's last hourly read**, and where a blueprint sits is named once per
  place (renaming a container in game shows on the next new place only).
- **A job's check and its measured tax need it first seen running within 90 minutes of its start**: a job installed and finished
  between reads can't be checked. Its EIV is at that hour's adjusted prices and its index ESI's four decimals (a few hundred ISK on a
  big job). A measured tax holds until the owner changes it, and is only offered. **They use the character's clone state now, not at install**: one that was Alpha when the job started and is Omega now reads 0.25% off (the Alpha tax is missing from the app's side, or the measured tax comes out that much under).
- **List what you built can lag and can come back** (To do, industry.md). Its units come from the hangar copy ESI holds for an hour, so an item can stay up to about an hour after you've listed; units are alike, so an old job's item can come back if you later buy the same product at that place (stated, not bounded); and products delivered into a container never list (nested units aren't loose stock) until the first real delivery says how they land. A ship is "checking" until its kind is read and is never priced at Jita from a home hub while "never haul ships to Jita" is on. "Either" lists at Jita here.
- **Built and sold costs each job's materials at the blueprint's ME as first seen running**, with your site's bonuses where it
  ran at one (an NPC station has none; another structure's aren't known and aren't applied, nor a site of kind Other's, nor a
  site's rigs when its system's security couldn't be read, each said), at what you still held from your purchases at the job's
  start, newest first (a purchase sold again before the job isn't held, so trading and Industry never both cost it); materials
  you never bought, or bought and sold again, aren't costed, and are said. **But a material still held at the job and sold
  later, along with units you didn't buy, is still costed in both**: Results' every-item lots don't know a job used units, so
  they cost the later sale against the purchases the job took. **Materials bought inside a tracked position stay in its stock**
  after a job uses them (no income counted twice: a position realizes only on sales). **A buy order's broker fee on a material
  counts nowhere** (Industry costs materials at their price; trading carries the fee in stock never sold), beside built units'
  share of their sell orders' broker fees (in neither Industry nor trading). Invention's datacores and copies aren't charged. A
  job with no cost from ESI and no journal entry naming it is charged no fee, and said. **A home you typed in (no structure ID)
  matches no job**, as for the job check: its jobs are costed with no structure or rig bonus, so their materials read up to its
  material bonus dear (said as "a structure that isn't one of your build sites"), until it has the structure's ID: found by name,
  or chosen from the structures in its system your jobs ran at (the sites table offers them; never set by itself). A sale split
  between built and bought units is claimed for the built ones first, and a built unit used or moved rather than sold can still
  claim a later sale of bought stock. Each character's own: a unit built by one and sold by another isn't claimed. **A position
  opened on a product you build reads the built units' sales as sold beyond what it bought, left out of its profit and, since a
  sale a position counts is never claimed, out of Industry's too**: open positions only for what you buy (the Wallet offers none
  on a sale Industry counts). The Wallet's "Trades no position tracks" says a built sale's why ("Built by you: Industry counts
  it"), but its tag and the cash flow's "Loot & other sales" stay as `autoTag` reads it.
- **Copies "sold" are contracts that vanished before expiry** (the cloud's copy round, industry.md stage 3): a seller cancelling
  looks the same, and so does a copy taken back and relisted only after the next read (none of the 327 that vanished from 00:00
  to 06:00 on 11 October came back by the same seller at 12:00). **Read every six hours, so a copy listed and sold within a
  read's span is missed** (the Sold column says so; the summary gives the longest span). **A contract missing from one snapshot**
  (EVE Ref's scraper missed a page) counts as sold until the next whole snapshot shows it again, then is taken out, so a figure
  can drop by it six hours later; a snapshot under half the kept set is refused instead, and the read after it spans twelve hours.
  **Six such snapshots in a row and the newest is kept without counting a sale**: the hours since the old set count no sales but
  sit inside the summary's days, so a kind's pace reads low by that share until they leave the week (the route's `note` says when
  it happened). Public contracts of The Forge only: Brave's corporation and alliance contracts aren't visible.
- **A copy's ISK a day leaves out contract fees and competition**, and **its pace is your share of what sold, counted from vanishings**
  (a contract listed and sold between two six-hourly reads is never seen, so the count is low; a vanished contract may have been
  cancelled). Payback leaves the research's days out (the row says them, and flags research past 30 days).
- **The copy cost rests on two readings not yet checked**: copying's SCC (EVE Ref's 4%) and a cost rig multiplying the structure's
  bonus. The Copies section says so in the cost's tip until a copy or research job of yours settles each.
- **A copy sale is claimed by blueprint and count, not by kind** (ruling 2): a contract's copies are taken from your delivered copy jobs of that blueprint, oldest first,
  whatever runs each copy carried; a split contract is counted pro rata of its copies, not their runs. **Copies your own jobs used up (to build or invent) still count as
  made** for a later sale's claim: the app can't see a copy consumed. **Claims run in the order contracts were listed**, so a contract listed early and sold late can take
  copies a later one had claimed, moving an earlier period's figure when it sells. **Contract fees count only where the journal names the contract** (unseen so far), and
  none for a copy contract of a blueprint you hadn't copied before listing it. An outstanding contract that left ESI's list is neither a sale nor a claim on your copies; its listing fee still counts.
- **A home market's own read is the watch set's types, hourly, from one read each time**: what its live orders have sold is since each was
  placed, not a pace, and nothing is watched between reads; its pace is the home region's history. **A read cut short, or with a page failed, keeps
  the last good read**, and a market over 300 pages isn't read. **It speaks only while under two hours old**: past that Goonmetrics' prices (hours
  old) speak for the hubs it tracks, and nothing for the others (Task 18B says so on the tab).
