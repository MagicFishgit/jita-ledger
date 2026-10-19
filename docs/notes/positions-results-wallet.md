# Positions, fees and results: Results, the Wallet and income

Split from positions-results.md on 19 October 2026. Decisions worth not undoing. What Results, the Wallet, Omega and
goals count: the long run, attribution, asset safety, refunds, multibuys, standings and the skill queue, all income
against play, rewards, HyperNet, what you built and copied, transfers, net worth.

- **"What your standings are worth" prices your real trading at other standings** (`lib/standings.ts`, Rates & fees).
  Every broker charge is the broker rate × an order's value (a price change × (1 − the Advanced Broker Relations
  discount)), so each fee ÷ the rate paid that day is the trading behind it, and that total × any rate is what the
  same trading costs there. It takes **every** broker fee the ledger holds, not a window: the user asked for all of
  it as it builds up. The rate paid each day is **measured**, the median of fee ÷ order value over that day's
  placements matched to their orders (`measuredRates`, at least 3, skipping 100 ISK minimums), because the kept
  `rateHistory` starts with setup noise: the user's read 2.23% until their first sync at 18:51 on 24 September,
  while their placements that day paid 1.331%; on 25–27 September they paid 1.328%, 1.306%, 1.298% as standings rose.
  Trusting each match's order value instead was tried: most of the ISK (58.8 of 80.2 M) is in unmatched fees and a
  few matches are wrong (implied rates of 7% and infinity), so one rate per day is sturdier. The chart's axis starts
  at zero; the "you" dot shows only once standings are known (synced, or typed), never at an unsynced 0 and 0.
- **Results reads the long run** (`lib/longRange.ts`). Periods run to a year and All; past 90 days the bars are
  weeks, past two years months (`unitFor`), and every average divides by the days the ledger actually covers, since
  a year's per-day from 24 days of data understated it fifteenfold. "Every item you traded" works a position out for
  every item (`computePosition` over all its trades, so fees and tax are matched as on Positions) and reports what
  sold in the period with its return, its average sale and how long stock was held (first in, first out). Trades
  tagged Personal are excluded, and an item whose every trade is Personal is left out whole: 31 such items (an
  Apocalypse and fittings bought to fly, 2.01 M for the hull alone) otherwise showed as 4.8 M of "orders that sold
  nothing", their fills excluded and their fees orphaned. Orders that sold nothing are said apart (the scoop's −3.18 M), because their fees over the
  cost of what did sell made "−1151.5%". Items sold with no recorded buy (loot, store and planetary goods) are
  counted by their activity, not here. "What kind of trading pays" groups the sold items by ESI category (looked up
  once per item and kept), price per unit and time held. On the user's ledger it agrees with the positions-based
  Trading line (−3.08 M both), as it should while all their trading sits in positions. The same total shows in
  "By activity" as **Every item traded**, a row under Trading and never added to the total: the user asked for
  a second line rather than a change to what Trading counts, which stays tracked positions only. `computePosition` now reads
  trades from an index by item kept per `d.txs` version (`tradesFor`): identical on all 376 positions checked,
  6× faster, and it no longer grows with items × trades.
- **Results attributes each ISK movement by one stated rule** (`attribute` in `results.ts`): positions' realized
  profit, filaments against abyssal loot, PI goods less customs, LP-store goods less the store's ISK, courier
  rewards, bounties; ships lost charged to the activity they died in. A trade a position counts is always
  trading, and an item in no set is left out rather than guessed at.
- **Asset safety is tracked, not guessed** (`assetSafety.ts`, `countStock`'s `safety`, `AssetSafety.tsx`,
  `worker/src/safety.ts`, migration 0011). The user had a wrap waiting for delivery to low-sec and asked to see it
  with a ticking timer, and whether the app copes with things arriving out of nowhere. It does: the wrap's contents
  were always in `total` (net worth), so delivery moves value rather than creating it; they're now their own "In asset
  safety" line instead of "Inside ships and containers", and unpacking's fee is "Asset safety fee" in the Wallet
  instead of Other. The Wallet shows each wrap, what's in it at CCP's estimate, and what unpacking costs (15%, or 0.5%
  by hand in the system). The countdown can't come from ESI: it's the client's, typed once ("14d 7h 24m 32s", kept
  as an absolute time in the synced `safetyTimes` doc), or, for a wrap the cloud saw go in, 20 days from then. Only the
  cloud can date one, since it reads the assets hourly: `safety_seen` registers each wrap once, with a row marking the
  last read, so a wrap appearing within 150 minutes of it went in since (`startKnown`); one there on the first read
  can't be dated. Both writers of the stock record carry what was learned forward (`mergeSafety`). The cloud mails once
  per wrap when it registers it (kind `safety`, "Asset safety registered"): the game already says when things go into
  asset safety and when they're delivered, so the user asked for the mail to say the app has picked it up instead.
  The list is **as packed**, since the user asked to open the station containers in it: each wrap keeps its ships and
  containers (`holders`, at any depth, a can in a ship's cargo inside the ship) beside the flat count by type that the
  fees and the mail use, and each opens to what's in it, worth counted with its contents. Their names come from
  `/assets/names` in a call of their own, so a refusal can't lose the wrap's name too; ESI's "None" is no name.
  The first version showed the user's "Equipment" container as "0 inside": it held only blueprint copies, which every
  count leaves out (a copy shares its original's price). So `contents` lists what lies in each thing with copies
  marked (shown, "· copy", worth nothing, and counted apart in the note under the list), and a ship's things under
  where they sit, as the game lists them (`bayOf`: Fitted, Cargo hold, Drone bay…). The user also asked about a Sigil
  showing nothing: ESI sends it packaged, and a packaged ship holds nothing.
  **EVE's own notification now dates the wrap** (`parseSafetyNotice`, `withNotices`, the optional notifications
  permission): the research found `StructureItemsMovedToSafety` carries the dates, the structure's name and the
  destination. The browser's sync reads notifications while a wrap waits and pairs each still-live notice with a wrap
  (one each in the order they went in when the counts match, else by the cloud having seen the wrap appear within
  three hours); the wrap keeps it (`notice`, carried by `mergeSafety` in both writers) and takes the structure's name,
  and its dates win over a typed countdown ("From EVE’s notification when it went in"), with the destination named.
- **A fee a GM refunded counts as nothing, everywhere** (`refunds.ts`: `refundPairs`, `nettedJournal`). The user's
  fat-fingered Sniper listing (19,489 Caldari Navy Uranium Charge S placed at 1,893,000 instead of 1,893) paid a
  467,749,600.65 ISK placing fee on 28 September 2026; CCP support refunded exactly that the same evening as a
  `gm_cash_transfer` from Caldari Navy, "Ticket #2734940". Counted as they came, the fee stayed on the snipe, in Results
  and in what standings are worth (~36 billion ISK of phantom trading), and the refund was "Other income". Now a GM
  transfer for exactly a fee's amount, from the party it was paid to, within 30 days, pairs with the latest such fee;
  in the view figures use, both read zero. The fee keeps its original amount (`refunded`) so fee matching still tells
  a placing fee from a change and doesn't estimate one in its place. The stored journal is untouched; the Wallet says
  what was left out. Checked on the user's ledger: the order's placing fee reads 0 (467,749,601 before), Other income
  +4.45 M, Fees & tax −208.66 M. While there, a raise's expected fee gained the broker fee on the increase
  (`matchFees`): the Ghoul's raise paid 333 k against ~254 k for its plain changes, and without it a big raise was
  matched to a smaller fee in the same second.
- **Purchases made in one go are one row in "Trades no position tracks"** (`multibuys`, `fittedShips`, `autoTag`'s
  `fitted` in `wallet.ts`; `useShipTypes`). The user bought a fitted Jackdaw through the Multibuy window (29 September
  2026, 18 purchases, 135,358,716.45 ISK to the cent) and asked whether the app handled it properly and completely. It
  did (each purchase read as bought from a listing, none as a snipe, nothing on Orders or To do, net worth with the ship
  and fitting inside it), except the Wallet: 18 rows, two clicks each to mark Personal, and until then 135 M of "Other
  purchases" and nothing in the runway. Now buys each within `MULTIBUY_GAP_MS` (2 s) of the last, at least 3 of 2+
  items, are one row that opens to its purchases, with one tag for all; two of the user's seven multibuys straddled a
  second, so it isn't "the same second". One with a ship in it (ESI category 6, looked up once and kept) is guessed
  Personal, "a fit to fly, most likely", which the Wallet's flows and runway count at once. **A guess counts only in the
  Wallet**, as the loot guess always has: Results, the cost of stock (`heldCost`) and the snipe finder read only what you
  marked, so the row offers **Confirm**, which marks every purchase in it. On the user's ledger: 5 multibuys, two with a
  ship (the Jackdaw, and 20 purchases for 321 M on 24 September).
- **Rates & fees says what the skill queue is about to do** (`lib/skillQueue.ts`, scope `esi-skills.read_skillqueue.v1`,
  registered 29 September 2026). The sync keeps the queue in order (`meta.skillQueue`); each trade skill in it that
  raises a level you have is shown with what it changes when it finishes, worked out from skills and standings (not
  typed-in fees, which say so): sales tax for Accounting, broker fee for Broker Relations, the price-change discount
  for Advanced Broker Relations, order slots for Trade, Retail, Wholesale and Tycoon. Levels queued one after another
  build on each other. The app already followed a finished level on the next sync; this is the preview.
- **The PLEX reading is shared** (`usePlexPrice` in `components/plexPrice.ts`, 19 October 2026): Omega's page and Planets' Plan both
  use it. It reads the Global PLEX Market's lowest sell into `meta.plex` on mount when over 30 minutes old (as Omega always did,
  but now Plan keeps it fresh too), and a month of Omega is `monthOfOmega(plexPerMonth, plexPriceOf(typed, read))` in
  `lib/iskPeriods.ts`, one function for both.
- **Omega's "Could trading pay for it?" counts every item, as Results' "Every item traded" does** (`everyItemCalcs` in
  `lib/everyItem.ts`, shared with Results). It counted realized profit on tracked positions only: 17.77 M of the
  user's last 30 days (29 September 2026), which they took for a stale or broken figure, against 92.13 M over the 30
  items they bought and sold. A month of Omega (500 PLEX at 4.91 M) is 2.46 B, so it covered about 4%, which is true. The
  Alpha savings estimate reads every Jita sale and order the same way. Freelance and the rest aren't trading: the card
  says Results has them. The 3-month pack's box said "PLEX for 3 months" with a placeholder cut to "from the"; it's now
  "3-month pack, in PLEX" with "whole pack", and the line above says where the store shows it. The skill payback table
  shows the queue ("Queued: V, done 23 Oct") and missing prerequisites (Tycoon "Needs Wholesale V and Marketing IV
  first", not "0.0 days").
- **"All income against play" sits beside "Trading against play" on the Wallet** (`AllIncome` in Wallet.tsx, its sum in
  `lib/income.ts` since stage 2b of several characters, pinned by `npm run check-income`; the shared
  `useActivityEvents` in `components/activityEvents.ts`, which Results now uses too; `otherSales` in results.ts). The user:
  the trading card "only tracks trading via positions but I have other income as well" (30 September 2026). It counts
  everything you earned in the window, each thing once:
  - trading as every item bought and sold again, by its profit (Results' "Every item traded": positions, snipes, the rest);
  - each other activity by Results' rules (freelance rewards less what the jobs cost, abyssal loot less filaments and ships
    lost, bounties less ships lost, and so on);
  - what was sold but never bought (loot, salvage, ore, datacores, gifts) by what it sold for after tax: an item bought
    and resold counts by its profit, never its sale value, which the first version got wrong (it read +981 M of "other
    sales" on the user's ledger copy, snipe resales among them);
  - items an activity counts (filaments, abyssal loot, planetary and loyalty-store goods) left to that activity.
  Play is the same Personal spending as beside. On the user's ledger copy (to 27 September): never bought +973.81 M (led
  by 213.5 M of Datacore - High Energy Physics), combat +172.83 M, abyssal +1.81 M, every item −6.36 M; 366.5 M on play.
  Without ESI's item groups only trading, hauling, freelance, bounties, rewards and industry count, and both pages now say
  so (Results said it counted those, but counted nothing). Freelance's trades are a job's items in its window over every job you did, finished ones
  too, and a tagged one is no job's, as on the Wallet (2 October 2026; loyalty-hustles.md); the Wallet's row for one says
  "during a freelance job of yours that takes it".
- **Daily goals and AIR rewards are income, for every character** (`REWARDS` in wallet.ts, the Rewards activity; the user,
  1 October 2026: "air rewards and goal payouts should count as income for any character including my main"). They were
  "Other income" on the Wallet and nowhere in Results, All income or a card's Earned: in D1 that day, 16 goal payouts
  (7.12 M) and 14 AIR rewards (687,500) on the main since 24 September, one of each (445,000, 75,000) on FannySchmeller.
  Now the Wallet has a "Goals & AIR rewards" line and Results a Rewards activity, which counts without ESI's item groups
  and asks no hours (they come with whatever you play). The set is ESI's ref types for what CCP pays for playing, read
  from its spec: daily goals, the AIR career program, and the older challenges, milestones, opportunities and campaign
  objectives, four of which were "Bounties & missions" and so Combat (none in the user's journal). A corporation's tax on
  a payout (`daily_goal_payouts_tax`) is a fee on the Wallet and nets in Rewards.
- **HyperNet tickets are play** (`hypernet` in `OUT`, `HYPERNET`, `playOf`, `burnOf`, `entryText` in wallet.ts; `FlowLine`'s
  `said` in Wallet.tsx; the user's choice, 17 October 2026, from the research of 13 October in `.playwright-mcp/research/hypernet/`).
  The user won an Odysseus on the HyperNet Relay ("it is with game money and just for fun now and then") and asked whether the
  app tracks it. It didn't: the main's tickets (122 then; 255, −988.30 M ISK, by 16 October) sat in "Other spending" with no
  kind, out of play and the runway; 13 October's "Biggest cost today" read "Other spending, −290.26 M on 85 entries"; and a
  refund would have read as "Other income". Offered play, a Results activity, or only a name, they chose play:
  - `flux_ticket_sale` and `flux_ticket_repayment` are one Wallet line, "HyperNet tickets", Personal, decided before the
    in/out split, so a refund cancels tickets on it and opens as "Tickets refunded" with its own sign (a line's parts and
    entries against its way say theirs). A window holding only a refund puts the line under money in and takes it off play
    and the burn (`playOf`, `burnOf`, never below nothing).
  - "Spent on play" (Trading against play, All income against play) and the runway's burn count it. Results, All income and
    a card's Earned don't: they never read the cash-flow lines.
  - **A prize is counted only when sold**, as any item never bought: "Sold, never bought" in All income and Earned, its sale
    after tax, with no ticket cost set against it (the tickets are play). Until then it is in net worth only, at CCP's
    average price. A win writes nothing to the journal and a ship appearing with no purchase looks like loot or a gift, so
    nothing guesses.
  - An entry whose description is ESI's placeholder ("(unknown reference 143, …)") is said by its kind on the Wallet's lines.
  - Left alone: the unusual-activity check (your own purchases), `flux_payout` and `flux_tax` (a host's; none seen).
  - The page check's research case holds a 10 M ticket and a 2 M refund: "HyperNet tickets · Personal · −8 M ISK", opening to
    "Tickets bought 1× · −10 M ISK" and "Tickets refunded 1× · +2 M ISK", no placeholder, "Spent on play −8 M ISK"; planted
    without the line, it failed.
- **Built and sold is Industry's, claimed first** (Industry stage 2's last task, 11 October 2026; `builtClaims`,
  `builtAndSold` and `JOB_FEE_REFS` in industryTrack.ts, `claimsOf` in everyItem.ts, `Position.claimed`, `AttributionInput.claims`,
  `activityEvents`' `built` and `industrySaid` in income.ts, `useBuiltInputs` in components/activityEvents.ts; the rules of the
  bundle and the job are in industry.md). A product you built and sold read in All income as "Sold, never bought" at its whole
  sale value, while the materials bought for it counted nowhere, so All income overstated industry by every material bought.
  - **The claim order**: per product, its sales no position counts and not marked Personal, oldest first, take units from what the
    character's delivered manufacturing jobs had made by the sale's time (records, runs × units a run), built units first; a sale
    before the first delivery claims nothing (it stays trading or "Sold, never bought"), and one holding both is split. By trade
    ID and units, each character's own: a unit built by one and sold by another isn't claimed. Derived from the ledger
    (`claimsOf`: jobs, trades, positions, Personal marks, memoised), so every caller gets them unchanged.
  - **Built types never join the activity sets**: those take a whole item (`incomeRows` drops an item in them from "Trading,
    every item" and "Sold, never bought", `otherSales` skips its sales), which would have taken an item both built and bought out
    of trading entirely. Instead a claimed sale's units come off Results' every-item position (`Position.claimed`: the sale is
    counted for what's left, its tax pro rata, and the sell orders' broker fees are spread over the claimed units too, so
    trading isn't charged the listing fee of what it didn't sell; that fee is in neither), and `attribute` and
    `otherSales` see only what's left. So an item both built and bought keeps its bought part's profit in trading (tested:
    10 bought, 10 built, 15 sold: trading sells 5 against what it bought). `everyItemCalcs`' key, and the Results, Wallet and
    Omega memos on it, gained `claimsOf(d)` itself: the same Map while its inputs hold, one constant without jobs.
  - **What Industry counts** (correction 11): claimed sales at their time, after tax (the journal's, else the rate); every job's
    fee at its start, the journal's entries naming it by `industry_job_id` in every industry ref type ESI lists but
    `reprocessing_tax` (`industry_security_tax` included, which may be how a job's SCC is written; the Wallet files it under
    Industry costs too), else ESI's `cost` on the job (with neither, no fee is charged and "N jobs' fees aren't known" is said);
    each manufacturing job's materials at its start (not a cancelled or reverted one's), costed at **what the character still
    held from its own purchases then**, newest first: a material's purchases (not Personal, never one a freelance job counts,
    Freelance's already) and sales (not Personal, less units Industry claims) are walked in time order, sales using up purchases
    oldest first as Results' lots do, and each job takes what it uses, so a unit is costed once across jobs and never after it
    was sold. The review of Task 13 found the first version charging a purchase twice: 1,000 Tritanium bought at 4 and all sold
    at 5 (trading costed them), then a job using 500 mined, took 500 × 4 again; now that job's 500 are said unbought (tested,
    with the old rule planted). Materials never bought are named and not costed; a job with no ME recorded says its materials
    aren't known; one at a structure that isn't your site, a site of kind Other, or a rigged site whose system's security
    couldn't be read is costed without the bonuses not known, and said. It needs no item groups, so it counts when ESI's groups
    fail.
  - **A home you typed in gets its structure from its jobs, by your choice** (`homeCandidates` in industryOwned.ts, the Build
    tab's sites table). `jobPlace` matches a structure by its ID and never guesses: the job check, the measured tax and Use this
    rest on it, and UALX-3 holds other structures, so a guess could write another structure's tax into the synced doc. So a
    typed home (no structure ID) is offered each structure in its system where any character's jobs ran (by the system its job
    was first seen in) that matches no site, one line each with its job count and its name when a read named it: "Your jobs ran
    at Home Azbel in UALX-3 (2 jobs): is it your home? Use it", which sets the home's `structureId` (and name); from then every
    reader matches it by ID. The page check presses it and reads the doc.
  - **A sale Industry claims offers no position on the Wallet** ("Trades no position tracks" says "Built by you: Industry counts
    it", or how many of the sale's units, and has no Start a position; its tag and the cash flow stay as they were). A position
    opened on a product you build counts its sales, which are then never claimed, and reads the built units as sold beyond what
    it bought (`oversold`), left out of both: open positions only for what you buy.
  - **While the blueprints load, nothing is said as a figure** (pre-flight I4): the bundle loads beyond the Industry tab only
    for a ledger with a manufacturing job whose ME was recorded. Meanwhile Results' Industry reads "Working out…" with "Reading
    the blueprints, to cost what you built…" under it and the Made tile says what you built is still being worked out; the
    Wallet's All income and a Characters card say "Reading the blueprints, to cost what you built…" where the figure would be
    (`waiting`; their `ready` waits only for a ledger that needs it). If it couldn't be loaded: "–" and "The blueprints
    couldn’t be loaded, so what you built isn’t counted here or in the total", the Wallet the same, a card "In the last 7 days,
    without what was built" and left out of Earned, all characters (its count says so). Never claimed sales with no materials.
    **"Reload to try again" reloads**: Chromium keeps a failed dynamic import for the life of the document and never asks
    again (gotchas.md), so a retry in place did nothing (the page case caught it).
  - **Its note sits under Results' row** (what it couldn't cost, materials by name: the hook asks ESI for their names) and in the
    Wallet's Industry row's tip. On a phone the note keeps to the table's visible width.
  - **The income recording gained one line**: Results lists every activity, so "By activity" has "Industry – Hours a week on
    industry –" between Freelance and Rewards; re-recorded once for it, and nothing else moved (the recorded ledgers hold no
    jobs). The Wallet's rows drop under 1 ISK, so they didn't change.
  - The page check's industry case holds a pump built (10 at an NPC station, ME 10) and sold (10 at 7 M) by the main and by
    Builder Alt, the main having bought 800 Fried Interface Circuit before the job: held back, Results says it's working out and
    the Wallet and the card what they read; refused, Results says so with "–", the Wallet says so with nothing counted as "Sold,
    never bought", both cards say "without what was built" and the total counts neither; then reload, +66.01 M on Results, the
    Wallet and the main's card (10 × 7 M less 4.20%, less the job's 300,000 and the 747 circuits it used at 1,000), the circuits
    no trade of their own, +132.77 M all characters (the alt bought none), and the two salvage materials never bought named in
    the note. Planted, no purchase costed as a material read +66.76 M and failed it.
- **Copy contracts you sold are Industry's too** (Industry stage 3, Task 15B; `copySales` in copyContracts.ts, added to Industry's events in `activityEvents`; the rule is
  in industry-copies.md). A finished copy contract not accepted by one of your characters counts its price (journal `contract_price` naming it, else its own price) times the share
  of its copies your delivered copy jobs made before it was listed, claimed oldest contract first; copies no job made are said ("N copies sold on contract that no copy job
  of yours made … aren't counted"), and a contract one of your characters accepted is said as a transfer, never a sale, but it uses up its copies from your copy jobs, oldest first, as a sale claims them (counting no ISK), so a later sale can't claim them as made. The journal's contract fees for it count in full when
  you'd copied the blueprint first. The copy jobs' fees are charged once, at their start (stage 2, correction 11), never again here. A copy contract's price was in no activity
  before (`attribute` gives `contract_price` none; the Wallet's money in still files it under Contracts), so no recorded figure moved.
- **ISK moved between your own characters is neither earned nor spent** (stage 4 of several characters, 1 October 2026;
  the rule is in characters.md). The owner's 100 M to FannySchmeller on 30 September read as 100 M of play. Now play,
  the runway's burn, running costs, the day's biggest cost, the month's report, cash-flow goals and the unusual-activity
  list leave it out, and the Wallet shows it once, as "Between your characters" under money in and out (`check-income`
  proves those figures equal with and without transfers). What reads the balance still moves with it, on purpose, since
  the main's wallet did change: Wallet today, Since your last visit, the balance line, net worth and its daily point.
- **Net worth keeps one snapshot a day in this browser** (`Data.netWorth`), written by the Wallet page. ESI has no
  net-worth history, so the trend starts the first day the page is opened and says so.
- **Goals are five kinds, each measured from something the app reads** (`lib/goals.ts`): afford N of an item
  at the live price (units bought on the market since the goal was set come off what's left, so buying PLEX
  in small lots counts), hold N of an item (hangars plus sell orders), save ISK (wallet, wallet + orders, or
  net worth), earn over a period (positions' realized profit or net cash flow), train a skill. Any can carry a
  deadline, which turns the ETA into "needs X a day, going at Y". A reached goal is stamped once and stays
  reached. Old `{ kind: 'wallet' | 'nw' }` goals are read as ISK goals.
- **ESI has no PLEX vault endpoint** — none of its paths mention PLEX or a vault. A PLEX "hold" goal starts
  from the count you give it and follows your market trades; PLEX from the store isn't visible.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Net worth values assets at CCP's rough global average**, which flatters anything hard to sell, and its
  trend exists only from the first day the Wallet page was opened in this browser.
- **"Every item you traded" can't separate Personal sales from trading within one item.** Where an item has both,
  the Personal trades are left out, but a sell order that filled them still has its fee charged to the trading as
  spent: fees match orders by the second, and a trade doesn't say which order filled it.
- **Results leaves out any trade whose item belongs to no activity set**, and counts LP-store goods as loyalty
  income only for the stores you currently hold points with.
- **The Wallet's unusual-activity check is a prompt, not a detector**: new donors, large donations out, and big
  contracts at hours with under 2% of your journal activity.
- **A Sniper "Copy all" with a ship in it is guessed Personal on the Wallet** ("a fit to fly", the multibuy rule); Results
  and Your snipes read only what you mark.
- **All income doesn't net the 10,000 ISK datacore fee against datacore sales**: the fee is its own Wallet line,
  "Datacores from agents", and the datacores sell as "Sold, never bought" (or as trading when you also bought some).
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
- **HyperNet tickets are play, and a prize counts only when sold** (positions-results-wallet.md): no ticket can be tied to its offer, so
  there's no result per offer; a win leaves no ISK trace; an unsold prize sits in net worth at CCP's average price, which flatters
  a hard-to-sell ship; a refund's shape hasn't been seen (it is taken to cancel tickets on their line).
