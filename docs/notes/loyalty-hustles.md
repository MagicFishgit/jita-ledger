# Loyalty and side hustles

Decisions worth not undoing. Loyalty points, Abyssal runs, hauling contracts, planetary industry, skills and combat.

- **Loyalty ranks per point, not per ISK**, because points are the scarce thing. An offer's output is
  valued as *listed and waited* (one tick under `marketBest`, less broker fee and tax) with *sold into
  the standing bids* (less tax only) shown beside it; required items are costed at what buying them
  would actually cost, and an offer whose output can't be priced is dropped rather than guessed.
- **Loyalty caps runs by what the market will take**, not by what the points afford (`planFor`).
  Affording 666 runs of an implant that trades five a day is not a plan. `spendPlan` then works down
  the whole store — best rate until its market is full, then the next — which is the real answer to
  "what do I do with 250,000 points". It uses only offers priced against the live book *with* a
  trading history; a plan built on a global average and an unknown pace spends everything on whatever
  looks best on paper.
- **The Loyalty table isn't capped out of sight.** It showed the top 60 of ~200 profitable offers, which hid
  every attribute implant in the Caldari Navy store (420–500 ISK a point, ranked 101st–181st) and made them
  look filtered out. It now has a name search and "Show all", and prices them live in the background pass.
- **"All on one item"** (`lazyPicks`) answers "spend all my points on one thing, list it, leave it": every
  purchase the points cover, ranked by what that makes (points × ISK a point), kept reasonable by how long
  the whole pile takes to sell at your share of the *buyers taking listings* (not total volume): within 14
  days first, slower ones filling in flagged past 30, nothing past 90. Offers under half the store's typical
  rate are left out. Ranking one purchase by ISK a point, the first attempt, filled it with 375-point items
  making under 1.2 M.
- **An offer's cost is said the way the store charges it** (`HandIn`, `SpendPlan`, `AllOnOne` in Loyalty.tsx): points,
  the store's own ISK, and the items to hand in, named behind a tip with how many you hold in Jita and what they cost
  to buy; then what the pile sells for after fees, and what you keep. First written as one sentence per pick, which
  the user found too much to read, so the offers table now runs full width at the top and the two sit below it: the
  spend plan as a short table (buy, points, to the store, hand in, you keep), "All on one item" as cards led by what
  you keep, with one bar splitting the sale into yours, the store's ISK and the items handed in. "All on one item" and the spend plan used to say "LP + 115.59 M ISK
  → 128.55 M": the store's 105 M and 175,000 Scourge Heavy Assault Missiles' 10.59 M lumped into one ISK figure, and a
  profit shown where the user compared it with the game's sale total (231.8 M). The sums were right; the words weren't.
- **Loyalty speaks of buying an offer, never "runs"**, which read like an industry job to the user: "buy it 83
  times", "each purchase", "times to buy". The code keeps `runs` as the field name.
- **Liquidity notes are judged on one purchase, never on the plan.** A capped plan fills the horizon by
  construction, so its length says nothing about the item.
- **Abyssal returns come from the wallet, not from a drop table.** Filaments bought and abyssal loot
  sold are both already in `txs`, so ISK-per-run is measured. It is pooled across tiers on purpose:
  loot carries no record of the run it fell from, so a per-tier split would be a lie. `concentration`
  reports how much of the mix is one filament, which is what makes the pooled figure trustworthy.
- **Courier contracts are judged at render, not at fetch.** `judgeCourier` runs in a `useMemo` over
  the current limits, so changing your hauler re-reads the list instead of needing a rescan. Fetching
  and judging were fused once and the ship dropdown silently did nothing.
- **A contract is only "safe" if both ends resolve, both are high-sec, and a secure route exists.**
  All three, and an endpoint we couldn't resolve deliberately suppresses the `noSafeRoute` flag ---
  claiming there's no route to a place we couldn't identify is a second, wrong story.
- **PI separates what is known from what is assumed.** Planet locations are exact; income is
  arithmetic on the extraction rate *you* read off the client. Never present the second as the first.
- **The whole skill map is synced, not just the seven trade skills.** `Data.skills` holds every
  trained level, because the hustle pages ask about hauling, tanking and planet skills and the
  skills response already contains all of them.
- **Interplanetary Consolidation fills in the PI planet count** (one, plus one per level) until the
  user types over it. A skill that exactly determines a field should populate that field.
- **Abyssal loot is recognised by market group *and* by name**, and any type you have traded that
  this browser cannot name gets resolved first. Without that step a mutaplasmid sale was silently
  dropped from the return figures --- caught only by seeding a transaction and counting the items.
- **A racial line is a choice, not a checklist.** Hauler, freighter and cruiser skills come in four
  races and any one does the job, so a requirement can be a `Need` with `anyOf`: the check takes the
  race you are furthest along in, and the panel lists every race you have started. Part-trained lines
  do not sum — three at II is not one at IV. Never name one race as the requirement; the app already
  reads every skill, so asking which race someone flies is asking for what it can see. The same
  `anyOf` drives the cargo bonus, which uses the best trained racial Freighter level.
- **ORE's freighter is not a freighter for this purpose.** The Bowhead's 1,600,000 m³ bay takes
  assembled ships only and its cargo hold is 4,000 m³, smaller than a Badger's. The Orca is the ORE
  ship that belongs in a hauling list: 30,000 hold plus a 40,000 fleet hangar, flown on Industrial
  Command Ships rather than a racial line.
- **PI factories are per colony and are not fed continuously.** One planet cannot supply another, and
  a factory receiving less than 6,000 an hour does not stop working — it runs fewer cycles. So show
  how many are needed to keep up (rounded up) and how busy they will be, never how many the
  extraction can "afford".
- **The Planets page is a walkthrough whose instructions follow its own verdict.** Pick a product
  (all 15 priced live and ranked per 1,000 units of extraction), find planets, see the return, build
  it. Told to sell raw, the build guide drops the factories and draws extractor straight to
  launchpad. Refining currently ranges 0.76×–1.57× across the products, so the answer genuinely
  differs per product and moves with the market.
- **The gank systems are Uedama and Sivala.** Niarja used to be the other, but ESI gives it −1.0: it has been
  Pochven since 2020, so no secure route can pass through it. The secure Jita–Amarr route runs Uedama → Sivala.
- **A killmail that couldn't be fully priced is left unpriced and retried**, never stored with the missing
  items at zero: its value is kept for good. ESI's 400 for an untradable type (a capsule) is a real "no
  price"; any other failure is a retry.
- **Killmails are priced once, from market history on the day, and never re-priced.** A loss in March cost
  March's prices. Refits use today's Jita book because that is what you'd pay now; the two are shown side by side.
- **The Wallet prices loyalty points itself** (`lib/lpStore.ts`, shared with the Loyalty page): the same
  rough-rank-then-price-the-top-40 pass, run in the background when a store has no usable rate or it is over
  12 hours old, valued at what the spend plan would make and only for as many points as the markets take.
  Waiting for someone to open the Loyalty page left points at "0.00 ISK" in net worth; an unpriced balance
  now says "Pricing…" or "Not priced yet", never a zero.
