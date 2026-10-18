# Positions, fees and results: Check my hangar

Split from positions-results.md on 19 October 2026. Decisions worth not undoing. Check my hangar: which of what you hold
a position could count, where you pick to look, and how ESI's copies of different ages are said.

- **"Check my hangar" says which of what you hold a position could count** (`lib/hangarCheck.ts` pure and tested,
  `HangarCheck.tsx`, a button in Positions' head beside Check for new trades; 3 October 2026). The user came back from
  exploration with loot in a Jita 4-4 container named "Lewds", some of it items their plan had buy orders on, and asked
  whether selling it affects the plan. It does: a position counts every Jita sale of its item after it opened (`matchTx`)
  and EVE's trades don't say which stack a unit came from, so a loot sale is taken from the position's own units at their
  cost; sold after the plan's buy filled, the plan reads them as sold and its list step asks to list too few, and a loot
  sell order counts as the plan's stock listed (`listedSince`). **Marking the trade Personal on the Wallet doesn't keep it
  out of a position**: `computePosition` never reads `d.ignored`; only the position page's per-trade Exclude does. Their
  words: "create a button to click in positions that checks my jita inventory and then gives me a list of items that is
  there that could affect orders. this could be a modal that opens up", then, on the design, "rather let the button have
  me choose where to look".
  - **On open it reads your assets afresh** (`fresh`, nothing saved or synced) and the names you gave the things holding
    things, a thousand a call in calls of their own (ESI's "None" is no name), and says when ESI's copy was taken (its
    expiry less the hour ESI holds assets), with Read again. Without the assets permission it says a new login asks for it.
  - **You pick where to look**: every place you hold things, Jita 4-4 first (always there, with its hangar, to fall back
    on), then by units held; under each its hangar, any other bay of the station's own with something in it (deliveries),
    every container and ship holding something as a path ("Battle Chicken › Equipment", one you didn't name by its type),
    and the whole place. Stations by ESI's names, structures by `structureInfo`, as the Wallet's "Where your wealth sits".
    Asset safety wraps and all in them are left out (they have their own panel). The pick is kept per browser
    (`jita-ledger:hangar-pick`), falling back to Jita 4-4's hangar once that container or place is gone.
  - **Held** is packaged, sellable units at any depth: not a blueprint copy, not anything fitted (`bayOf` "Fitted", loaded
    charges too), not an assembled item (`is_singleton`: a ship in use, a container, an unpacked module), not a wrap's.
    A ship's cargo, drone bay and other bays count and are named ("Battle Chicken › Drone bay").
  - **Each item a position counts** (any open position of the type; two open of one item have their stock **summed**, each
    trade being one's by `ownerAt`: taking the earliest's alone read 20 of 30 held as not theirs, the review of 3 October
    2026; Open the position opens the earliest, the one `ownerAt` gives new sales to, and says so when there are two):
    where its units lie in the pick, what the positions count as their own stock (with a plan holding it,
    `planTargets`, matched to whichever position its item names, the plan named and its view's stock beside,
    `planPosition`; nothing beside a stock of 0 the plan counts whole, where "0 / all the plan's" read as if something
    were), your open sell orders' units and what your buys still buy, and **Not the position's**: units held where the
    position counts (Jita 4-4's whole station, every spot, this read) plus those listed, less the **whole position's**
    stock, never below 0, said "of the 22 you hold in Jita 4-4" so a pick of one container isn't misread. **A position with
    Only Jita 4-4 trades off** counts sales and orders anywhere, so its held units are every station's in the same read
    (same exclusions) and its listed and buying all your open orders of the item ("of the 30 you hold anywhere"). Rows with
    such units first, under "10 of Datacore - Rocket Science aren't the position's. Selling those units counts against the
    position (and the plan): sell them and Exclude each sale on the position's page, or keep them apart until the position
    closes" ("Some of it isn't the position's." while the item's name hasn't loaded, never "Item #20420" in a sentence).
    **The lead speaks only of rows a sale where you're looking would count**: outside Jita 4-4 a Jita-only position's row
    sits under "Sold here they don't count", and a lead telling you to Exclude sales beside that read as the opposite (the
    review; it was offered to say "in Jita 4-4" instead, and dropping it there was the cleaner ruling). **Against the
    whole position, not the plan's view** (a ruling against the brief's formula, 3 October 2026): on Rocket Science's
    shared position (2,628 held before the plan, all listed; the plan's view 0) with 10 loot in Lewds, the view's stock
    would say 2,638 aren't the position's and tell the user to Exclude sales of the position's own earlier stock, which
    would leave its stock above zero for good; the view already sells those first (`heldSold`). Against the whole it's 10,
    the units a sale would wrongly take, from the position and, once the earlier stock is gone, from the plan.
  - **ESI's copies are of different ages, and a count that may be off for it says so** (`Copies`, `copiesOf`, `Stale`,
    `fills`/`atLeast`, `leadRows`, `leadSaid`, `doubtSaid`, `softSaid` in hangarCheck.ts; the reviews of 3 October 2026).
    Held comes from this read of your assets (up to an hour old), the position's stock from the trades the last sync read
    (ESI holds them an hour), listed from your orders (20 minutes). A bid filling between the trades' copy and the
    hangar's puts units in the hangar the position doesn't have yet; a sell order placed after the hangar's copy is in the
    copy and on the order; both happen in the user's own case (a plan's bids filling), read as not the position's, and the
    lead would then have had them Exclude real sales, which corrupts the position. The copies' times: the assets' from the
    read's expiry less an hour, the trades' from `meta.expiries.transactions` (or `tradesFreshAt`) less an hour or the
    newest trade held if later, the orders' from `meta.expiries.orders` less 20 minutes.
    - **Copies within `SAME_READ_MS` (5 minutes) of each other are one moment.** Both readers take all three seconds apart,
      the hangar's last (the sync: trades, orders, assets; the cloud's archive: orders, trades, assets). The first fix also
      flagged a bid still open when the orders were read before the hangar's copy: in one read pass that is every item with
      an open bid, the moment the user opens the app after exploring, and Check for new trades couldn't clear it, since a
      sync gets ESI's same trades copy until its hour is up (the re-review's run, `scratchpad/stale.mjs`: a bid of 200, 100
      recorded, 10 loot; all three passes read 10 rightly and flagged it, no lead). That clause is gone.
    - **A bid's fills the trades don't show yet are said apart, and the row stays in the lead** (`fills`, `atLeast`): only
      with the hangar's copy more than 5 minutes newer than the trades', each bid's fills not matched to a trade (at its own
      prices since it was placed, then, for one that bought at once, at listing prices under its own within a minute of
      placing it; one placed before the trades begin held to its fills since the app first saw it), less what a version of
      it first seen after the hangar's copy shows it filled since (those can't be in the copy). The count less them is what's
      certain: "At least 8 of Datacore - Rocket Science aren't the position's; up to 2 more may be your bid's fills since your
      trades were read, 8 Oct, 11:59 ET". One whose every unit may be fills leaves the lead and says so ("All 188 may be…").
    - **listed** (an open sell order first placed, `seen[0]`, after the hangar's copy), **sold** (a sale the trades show
      after the hangar's copy not at a price of a sell order placed before it, into a bid) and **soldSinceOrders** (with the
      orders' time known, a sale after the orders were read at a price of one of your sell orders, which their copy still
      lists) take a row out of the lead: it isn't lit, and its cell and a line say why against the copy that's behind and
      what clears it (`doubtSaid`, `untilSaid`). The first two: "May include units listed since ESI's copy of your hangar,
      …", cleared by reading again once ESI lets go of that copy. The third: "May include units sold since your orders were
      read, …", cleared by ESI's next copy of your orders (20 minutes after the last) and a sync, with Check for new trades
      offered once it's due. It was first a kind of sold, dated to the hangar's copy and told to wait for it, up to an hour
      away (the third review's probe: orders 13:00, trades 13:07, hangar 13:07:20, 5 sold from a listing at 13:03).
    - **What no copy can show** is a soft line on the lead, only past the same 5 minutes (a trades' copy newer than the
      hangar's errs safe and says nothing): "Bought any from a listing, or did a bid of yours fill, since your trades were
      read at …? Those read as not the position's until ESI's next copy of your trades, due …: Check for new trades won't
      bring them in before then." The button is offered only once that copy is due (`tradesDueAt`); before then a sync
      reads the same one. No hangar time, nothing is said. Each clause was planted wrong and failed `npm run check`.
  - Below, items held there with an open Jita 4-4 order of yours and no open position ("selling them doesn't touch a
    position"); orders elsewhere aren't in that list. A place outside Jita 4-4 says a Jita-only position doesn't count
    sales there, and brought to Jita they do; an item a position counts anywhere is said apart. Nothing a position counts
    or a Jita 4-4 order covers is said plainly ("Nothing in Lewds is an item a position counts or one of your Jita 4-4
    orders covers": "one of your orders" was false beside an Amarr order on an item held in Amarr). Orders not read leave
    the listing and the count "–", never 0.
  - **Here, not beside List your stock** as the brief had it: List your stock hides itself when nothing bought sits loose in
    the hangar, which is exactly a hangar of loot.
  - The page check (its own `hangar` case, both widths, the dialog open): Lewds holding 10 of the plan's datacore beside
    12 in the hangar (10 not the position's, of 22), a blueprint copy of a position's item, Tritanium nothing covers and
    drones on a sell order; a ship with a fitted Damage Control II beside a position's 2 loose (2 held, none not its);
    Amarr; the pick kept on opening again; a column's tooltip shown inside the dialog. Counting the fitted one, and
    drawing the tooltip at the root (gotchas.md), each failed it. Since the review: the sync read trades and orders after
    the hangar's copy, and one Damage Control II was listed after it (1 not the position's, flagged listed, out of the
    lead, no Check for new trades); Amarr draws no lead; opened again, ESI refuses the names (the read still shows, Lewds
    goes by its type, the pick by item ID kept) and the hangar's copy is 10 seconds old, about 6 minutes newer than the
    trades, the plan's bid having filled 2 more than they show (the lead "At least 8 of Datacore - Rocket Science aren't the
    position's; up to 2 more may be your bid's fills…", the cell "at least 8", the soft line with ESI's next copy of the
    trades not due, no Check for new trades); then the assets read fails (said, the last read kept). Phase one asserts no
    soft line (the trades read after the hangar's copy). The plain loads open the dialog with the stand-in login, which has
    no assets permission, and assert it says to log in again. Not passing `copies`, not drawing the doubt, the soft line or
    "at least" each failed it.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Check my hangar reads ESI's copy of your assets, up to an hour old**: ESI holds them an hour, so loot just moved or
  sold may not show yet; the dialog says when the copy was taken.
- **Its "Not the position's" is a count, not which units**: units of an item are alike, and EVE's trades don't say which
  stack a sale came from, so it says how many held where the position counts (and listed) are beyond the position's own
  stock, never which ones. Where it counts is Jita 4-4's whole station, or every station for a position with Only Jita 4-4
  trades off.
- **It sets three of ESI's copies against each other, of different ages** (your hangar's, up to an hour old; your trades'
  as last synced, held an hour; your orders', 20 minutes): a bid filling, a listing placed or a sale between them reads as
  units that aren't the position's. Where the app can see it (positions-results-hangar.md lists when), a bid's fills are said
  as "up to N more" beside what's certain, and a listing or a sale takes the row out of the lead. **A purchase straight
  from a listing, with no order behind it, or a bid's fill the orders' copy doesn't show yet, between your trades' copy
  and the hangar's, can't be seen**: it reads as not the position's until ESI's next copy of your trades (an hour after the
  last), and Check for new trades can't bring it in before then. The dialog says so in a line on the lead, only when the
  hangar's copy is more than 5 minutes newer than your trades': copies within 5 minutes are taken as one read pass, so a
  fill in those minutes goes unsaid. And a sale into a bid at exactly one of your listings' prices is taken to be from the
  listing.
