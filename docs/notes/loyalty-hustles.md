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
- **Skills show where a page uses them, with the queue** (`lib/skillStatus.ts` pure, `SkillStrip.tsx`: `SkillStrip`,
  `SkillPips`, `TradeSkillsLine`, `useTrainTimes`; the queue as synced since 29 September 2026 keeps each entry's start
  and skill points). The user asked for "your current skills under anything that can use skills", with subtle
  animations. Each skill shows five pips (trained filled, the level in training filling at its real progress through
  the level, queued ones dashed), what the next level does on that page from the page's own formula, and where it
  stands: "Training IV: 2 d 4 h left", "Queued: IV, done 2 Oct", "Not queued: IV takes 1 d 12 h" (points already in it,
  at your attributes). A skill not in ESI's list was never injected (ESI lists injected ones at level 0: 39 of the
  user's 210 skills), and one whose prerequisites you lack says so ("Needs Wholesale V and Marketing IV first", dogma
  182–184 with levels 277–279, `skillDogma`'s `req`) rather than a time it can't train in. Queues synced before the start
  was kept train their first unfinished entry, begun when the one before it finished. Where: Reprocessing (Scrapmetal,
  Reprocessing, Efficiency, Simple Ore, Metallurgy until Scrapmetal is trained; its by-level table marks the level in
  training), the hustle panels (time to the level the page wants), Settings → Skills & slots (the boxes and Train next),
  Orders and List loot (one line: the next trade skill the queue finishes and what it changes, or the best payback),
  Blueprints (Contracting: one contract and four more a level, 21 at V, from ESI's own description, against how many you
  have out). The pips fill once as they appear and the training one breathes; Off motion and reduced motion still both.
  The range skills (Marketing, Procurement, Daytrading, Visibility) aren't weighed: they matter only away from the
  order's station. Combat's "can you fly this fit" was offered and declined ("at this point we are rebuilding the game").
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
- **A lost fit can be saved in game, and saved fits are priced** (`fittingFromLoss`, `fitSlot` in combat.ts; scopes
  `esi-fittings.write_fittings.v1` and `read_fittings.v1`, registered 29 September 2026). A killmail's inventory flags
  are numbers (11–18 low, 19–26 mid, 27–34 high, 92–94 rigs, 125–128 subsystems, 87 drones, 5 cargo), the fittings API
  takes names (LoSlot0…, only RigSlot0–2 and SubSystemSlot0–3). A charge loaded in a gun shares the gun's flag and a
  fitting holds one module a slot, so charges (category 8, from ESI's type) go to the cargo. "Save this fit in game" only
  ever adds a fitting ("Jackdaw (lost 2026-09-27)"), for the fitting window's Buy All. Saved fittings are priced on a
  button at the cheapest Jita listing that's the market (`marketBest`), each with a Multibuy list.
- **Who killed you, without listing a whole fleet** (`finalBlow`, `fleetShips` in combat.ts). The user asked for "the ship
  and fit of the pilot who killed you", careful that "a fleet gank can go up to thousands of people". A killmail records
  each attacker's ship and the weapon they used, never their fit, so the page says so and links zKillboard: the kill
  (`zkillboard.com/kill/{id}/`) and each pilot (`/character/{id}/`), whose own losses show how they fit their ships. A
  loss's row says what landed the final blow and how many were on the kill; the detail counts the ships (at most six
  kinds, the rest summed) above the 12 who did most damage, and always lists the final blow, first when it isn't among
  them: in a 40-pilot test gank it had done 2%. The cloud held no killmails for the user on 29 September 2026, so this
  was checked on a synthetic one.
- **Killmails are priced once, from market history on the day, and never re-priced.** A loss in March cost
  March's prices. Refits use today's Jita book because that is what you'd pay now; the two are shown side by side.
- **The Wallet prices loyalty points itself** (`lib/lpStore.ts`, shared with the Loyalty page): the same
  rough-rank-then-price-the-top-40 pass, run in the background when a store has no usable rate or it is over
  12 hours old, valued at what the spend plan would make and only for as many points as the markets take.
  Waiting for someone to open the Loyalty page left points at "0.00 ISK" in net worth; an unpriced balance
  now says "Pricing…" or "Not priced yet", never a zero.
- **Freelance is a side hustle: jobs paying more for an item than Jita sells it for** (`lib/freelance.ts` pure,
  `hustles/Freelance.tsx`). The research found a Game Masters job paying 1,000,000 ISK a Dairy Products (~11,000 in Jita,
  10 per player, until 5 October 2026), and the user put it under Side hustles. ESI (29 September 2026): GET
  `/freelance-jobs` newest first, `limit` up to 100, paged back with the `before` cursor (491 open, 381 "DeliverItem");
  GET `/freelance-jobs/{id}` for what's wanted (`item_type` or `item_group`), where (`station` or `structure`), the reward
  per unit, the pool left, what's still wanted, and a per-player cap (38 of 381 set one). The route answers
  `cache-control: max-age=0, must-revalidate`, one of CCP's event-cleared routes. Each job is priced by buying the
  cheapest live Jita listings while a unit costs less than the reward, up to your cap and what it still wants; a group
  job takes whichever of its items makes most. The last full scan only says which items have no Jita sellers, to skip
  them. Each delivery point is looked up as Hauling does (`endpoint`, a high-sec route from Jita), flagged when it's a
  structure ESI won't describe or wasn't asked about, below high-sec, with no high-sec route, through Uedama/Sivala, or
  ending within a day. The first run: 491 jobs, 348 wanting an item, 68 paying more than Jita, the best Scordite
  buybacks (~40–200 M, tens of millions of units). A job has to be accepted in game first (Opportunities → Freelance
  Jobs); ESI has no window for it, so the row copies the job's name to search for, and sets the destination.
  **Your jobs** (scope `esi-characters.read_freelance_jobs.v1`, registered 29 September 2026): the tab reads
  `/characters/{id}/freelance-jobs` and each job's `/participation` (`contributed`, `Committed`/`Kicked`/`Resigned`) when
  it opens, and lists them with what's left of your cap and what you've earned (`myShare`). In the finder a job you're
  in says so, and a capped one counts only what's left of your share.
  **Second version, after the user's Scordite job** (29 September 2026: 38,132,412 Compressed Scordite 0-Grade bought at
  11.76–11.79, delivered 3–4 jumps out for 17 each, 576.94 M in rewards so far, ~170 M profit on what's delivered):
  - **What's been done shows in ISK** (`jobLedgers`, `freelanceStore.ts`, `meta.freelance`): each reward's journal
    reason names its job (`project_id=<id>`), and trades of the items a joined job takes, after it began, not in a
    position or tagged Personal, are its spend. The tab's "Your jobs" shows rewards, spent, profit on what's delivered
    (at average cost) and what's bought and not yet delivered. The Wallet has "Freelance rewards" (they were Other
    income) and "Bought for freelance jobs" (they were Other purchases); Results has a Freelance activity (rewards less
    everything bought, stock included, so it reads lower than the tab's profit until the stock is delivered).
  - **A group job buys every item under the reward** (`bestDeliver`): it first took only the one item that made most.
    The price shown is the range paid (11.76–11.79), since "costs 11.79" was read as one price when it was the average.
  - **Where you can accept it**: the game lists a job only within 5 jumps of a system it's broadcast in
    (`broadcast_locations`); the finder splits jobs you can accept from Jita from ones you'd accept elsewhere, naming
    the nearest broadcast system (`whereToAccept`). You still buy in Jita.
  - **The nearest office** (`bestOffice`): the tab took the first listed (Sankkasen, 5 jumps) when the job also took
    deliveries 3–4 jumps out.
  - **Filters on by default**, as the user asked: high-sec all the way (no low or null at the end or on the route),
    avoid Uedama and Sivala (only when the high-sec route can't go round; one that can says the extra jumps), only
    offices you can dock at. Each says how many it hides. Most out-of-range jobs they checked went to null-sec.
  - **Distances come from CCP's stargate map**, bundled (`src/data/universeGraph.json`, 5,268 systems with gates, 281 KB,
    its own chunk; `scripts/universe-graph.mjs`), walked by `jumps.ts`: any route, high-sec only, and high-sec avoiding
    the gank systems, all from Jita at once, instead of one ESI route call per office and broadcast system.
  The m³ was questioned: CCP's data and ESI both give 0.0015 m³ a unit of Compressed Scordite 0-Grade (0.15 raw, 0.19
  the old Batch Compressed), so 38.13 M units are 57,199 m³ on the game's own figures.
- **Mining replaced Injectors** (`lib/mining.ts` pure, `hustles/Mining.tsx`, `worker/src/mining.ts`, migration 0013; the
  mining records kind; scope `esi-industry.read_character_mining.v1`). The user found the Injectors tab useless and asked
  for a Mining Ledger with a guide to scale up: a solo side income now, a multiboxed fleet later, so every mining record
  and tick carries the character that mined it. ESI's ledger is one row per day, system and ore, 30 days, cached 10
  minutes; the browser's sync and the cloud keep it as records past that. The cloud reads it every ten minutes and keeps
  what grew between reads as ticks; runs of ticks under 25 minutes apart are sessions, timed to about ten minutes either
  way (ESI's cache), with m³ a minute and ISK an hour. Each ore is valued the best of three ways after tax: its own Jita
  bid, its compressed form's bid ("Compressed " + its name resolves for plain and graded ores alike; compression keeps
  one unit for one at a hundredth of the volume), or reprocessed at your yield at Jita 4-4. In the first test run,
  Compressed Scordite fetched 18.36 against 16.43 as mined. ESI's name lookup refuses a list with a name twice ("'names'
  items are not all unique"), which is how Scordite, both mined and the ladder's fallback, first priced nothing
  compressed. The first scaling guide was a four-rung ladder on EVE University's published yields; the mining tree below
  replaced it the same day. Checked in a test browser with a seeded week of mining, stand-in cloud ticks and the user's
  real skills.
- **Scaling up is a flowchart of every mining hull, each with three fits** (`lib/miningTree.ts`, `lib/miningYield.ts`,
  `lib/miningFits.ts`, `lib/miningMastery.ts`, all pure; `hustles/MiningTree.tsx`, `hustles/MasteryTiers.tsx`). The user
  asked for "all the other ships and paths … including the new destroyers", the three exhumers, upgrades and crystals on
  each ship, fits from popular fitting sites rather than EVE University alone, "a mastery level taking you from … just able
  to hop into one to getting the max out of it", as "an interactive animated flowchart" whose nodes open; and, when shown
  the design, that the ship you're in come from ESI with a button only as a fallback, and that crits and the other recent
  mining changes be in it. Seventeen hulls in lanes (frigates, expedition frigates, destroyers, then barges and exhumers
  by tank, hold and yield, then Porpoise, Orca, Rorqual); the Perseverance sits apart, since only a contract leads to it.
  Each node says whether you can fly it, whether your queue brings it, or how many skills it lacks; the ship you're in
  (ESI's `/ship/`, else the one your sessions mined most in) glows and the paths out of it flow. A node opens to the hull
  (Jita price, hold, slots, your measured pace in it, the skills to fly it with your queue) and Just in / Solid / Max:
  each tier's fit priced line by line, what it mines a minute at your skills and with every skill at V, crits, residue,
  cost, payback over what you mine now, the skills it asks for, and Copy fit (EFT, which the fitting window imports),
  Copy for Multibuy, Save fit in game. Crystals follow what you mine most (`mainFamily`: Simple before you've mined).
  On a phone the chart is a list and a ship opens under its row.
  **Yields are worked out from ESI's dogma, not copied** (`fitYield`): see eve-facts for the rules. It reproduces EVE
  Workbench's engine exactly where that can be checked (Hulk with two Modulated Strip Miner IIs, no crystal, three MLU
  IIs, all V: 22.33 m³/s; Covetor 16.55), and adds crits, which EVE Workbench leaves out. The user's Hulk at Solid (Type B
  II) comes to 3,177 m³ a minute at all V against EVE Workbench's 3,015; their own skills (Mining I) give 1,185.
  **The fits** came from a research pass on 29 September 2026: EVE Workbench's API (top 15 by votes and the 10 newest per
  hull, with votes and dates) against what zKillboard's last 400 losses of each hull carried, EVE University and forum
  yield threads as a cross-check. Each tier names its source. All 185 names (items, charges, crystals of every family,
  skills) resolved in ESI before shipping, and a check keeps every fit within its hull's slots. A fit from before Catalyst
  was used only where nothing newer existed, and its source says so. No tiers for the Rorqual (no fit published since Catalyst;
  its losses' commonest modules are in its note) or the Perseverance (none popular). What the research found worth
  knowing: the Pioneer mines about a third more than a Venture for ~3 M; the Outrider is a booster and escape hull, not a
  yield step; ORE Strip Miners (~189 M each) mine less than Modulated Strip Miner II with Type A II but leave no residue
  and burn no crystals, which is why the Mackinaw's no-residue alternative uses them; there is no ore-yield rig; Covetor and Hulk want a
  booster or hauler, the Skiff and Mackinaw are the solo high-sec exhumers. The research's first two requests sent a
  User-Agent naming the project and the user's contact details to ESI and zKillboard; later ones didn't, and a research
  prompt must say which User-Agent to send.
  **Any ore and grade can be picked** (`ScalingUp` in Mining.tsx; `oreBase`, `gradeLabel`, `gradeRank`, `isMinedForm` in
  miningFits.ts). The user, on seeing it priced for the ore mined most: "there should be a switch or a selector for
  different ore and grades you can set so you can compare." An Ore select lists every asteroid and moon ore by crystal
  family (47, resolved by name once; your mined ones marked; Mercoxit left out, since the fits' lasers can't mine it),
  and a Grade row its grades poorest first (0-Grade, the plain ore, II-, III-, IV-Grade; Brimful and Glistening for
  moon ore), read from the ore's inventory group: the market types named for it that aren't compressed. A moon ore's
  group holds all four ores of its rarity, hence the name check, and ESI names Scordite 0-Grade with a trailing space,
  which broke its "Compressed …" lookup until names were trimmed. The pick sets the crystals every fit loads and the ISK
  a m³ behind Worth and payback (the page's own three-way pricing, now `priceOres`); the m³ a minute doesn't change. It
  is kept in this browser, with "Back to <ore>, what you mine most". Checked against ESI: Kernite at Jita's 467.2 bid,
  less 3.375% tax, over 1.2 m³ is the 376.19 a m³ shown.
  **Mercoxit has its fits** (`mercoxitTier`, `DEEP_CORE`, `DEEP_CORE_RIG` in miningFits.ts; `MercoxitNote` in
  MasteryTiers.tsx). It was first left out of the picker, since no fit's lasers could mine it; the user asked for it for
  going back to null-sec. Picking Mercoxit (or its II/III-Grade) turns each fit that mines ore into its Mercoxit version:
  its lasers swapped for deep-core ones like for like (Modulated Strip Miner II, Strip Miner I or ORE Strip Miner to
  Modulated Deep Core Strip Miner II; Miner I/II, EP-S or ORE Miner to Modulated Deep Core Miner II), loaded with
  Mercoxit Type A crystals (A II where the fit had tech II crystals), and the Medium Deep Core Mining Optimization rig in
  place of a shield reinforcer, else a field extender, when the calibration still fits (never a processor rig, which the
  fit's CPU may need). That is how miners do it: the research's saved pulls show deep-core strip miners on 30 Procurers,
  28 Skiffs, 23 Mackinaws and 10 Retrievers of each hull's last 400 losses, Mercoxit Type A II the crystal most loaded
  (21 Procurers, 15 Mackinaws), the deep-core rig on 51 Mackinaws, and EVE Workbench's newest Skiff fit carrying two
  deep-core strip miners and 80 Mercoxit crystals in its cargo for the swap. From ESI (30 September 2026): the deep-core
  strip miner mines 80 a cycle to the Modulated Strip Miner II's 120, at the same 60 CPU and 12 powergrid (a Strip Miner
  I's 10 powergrid, an ORE Strip Miner's 50 CPU; a Modulated Deep Core Miner II 80 and 3 against EP-S 65, Miner I 60);
  it needs Mining V and Deep Core Mining II, and takes Mercoxit or ordinary crystals. There's only a Medium deep-core
  rig, 250 of a hull's 400 calibration, +16% for lasers that need Deep Core Mining (effect 5069; the yield counts it only
  on those). Mercoxit is 40 m³ a unit, and its gas-cloud chance is 5% (the ore's 522), cut a tenth a level by Deep Core
  Mining (543). The page says what the swap changed, when the lasers need more CPU or powergrid than the fit's own (the
  app doesn't fit ships, so it says to check in game), where the rig went or why it didn't fit, and the gas-cloud chance
  at your skill; Max adds Deep Core Mining V. Ice fits and boosters say they have no Mercoxit version. On the user's skills
  a Solid Procurer on Mercoxit reads 572 m³ a minute (959 at all V), with the rig in place of its EM reinforcer; a Solid
  Hulk has no room for the rig beside its processor rig.
  **ISK an hour was checked by hand** (30 September 2026, the user asked): on 39 fits over 11 hulls and five ores, every
  figure was m³ a minute × 60 × ISK a m³, and the ISK a m³ matched live Jita bids from ESI to the cent (Kernite 467.6 ×
  (1 − tax) ÷ 1.2 m³). Two tier ladders didn't climb, and were fixed:
  - **The Mackinaw's Max was its no-residue fit** (two ORE Strip Miners: 799 m³ a minute against the Solid's 1,119). Max is
    now the Solid with both yield implants and every skill at V, like the Hulk's; the ORE Strip Miner fit is a fourth
    choice, "No residue" (`key: 'alt'` with a `label`).
  - **On Mercoxit the Hulk's Solid and Max mined less than its Just in**: their Tech II processor rig takes 300 of 400
    calibration, so the deep-core rig (+16%) had no room. The swap now tries, in turn, a tank rig; the processor rig when
    the CPU fits without it; and stepping a Tech II processor rig down to Tech I (150) with a tank rig making way, each
    CPU-checked with every skill at V (`fitCpu`; see eve-facts). The Hulk's Solid and Max now take the third; the page says
    what the fit uses and has, and when your own skills leave it short.
  **A full ore hold** shows beside ISK an hour: the hold at your skills (Mining Barge and Exhumers grow the Retriever's and
  Mackinaw's, lib/cargo.ts; the tree's Ore hold says it too), worth that many m³ of the ore picked, and how long the fit
  takes to fill it.
  **Bonuses count only through their effect, for fitted items as for hulls.** A Drone Mining Augmentor carries the same
  434 (+10%) as a Mining Laser Upgrade, through a drone-only effect (623); counted by attribute it put the Retriever's
  Just in tier 10% high. Caught in review before shipping. Also found by looking: locked nodes were see-through (a lit
  path struck through "Outrider"), the chart's nodes overlapped under ~950 px (it now scrolls sideways under 1,180), and
  "gold" in the copy, since the accents change with the theme (the copy names the marks instead).
  **Across characters** (stage 3 of several characters; how alts are kept apart is in characters.md): a filter (All, or
  one character) that the tiles, the ore table and the sessions follow; "Your characters", a row each with what it mined
  in 30 days, its worth, days, sessions, ISK an hour and right now, and the fleet's total; sessions say who mined; and
  Scaling up has "Show for", its tree, tiers and skill strip at that character's skills, with its ship, pace and
  most-mined ore. The closing line promising a fleet "later" went. So did two zeros that stood for not known: "0 m³"
  for ore whose volume wasn't read, and "0 ISK" for ore not priced yet. Ticks are read once a visit, then the main's when
  its own records grow (their count and units: the ESI sync rebuilds the records object on every read) and the alts'
  when a roster revision moves; the main's used to be re-read only on an alt's revision. Ore is priced as on the
  Characters page (`useMinedWorth`, with each alt's pulled names), only ores not yet priced when a new one is named.
- **Abyssal is tier by weather, the ships that run it, and their fits** (`lib/abyssShips.ts`, `lib/abyssTracker.ts`,
  `lib/eft.ts`, all pure; `hustles/AbyssMatrix.tsx`, `AbyssTracker.tsx`, `AbyssTree.tsx`; `worker/src/abyss.ts`, migration
  0015). The user, having seen Mining's tree: "the same upgrade treatment to Abysall and Hauling… by difficulty tier and
  then weather type and then the fits that specialize for those and progression" (29 September 2026). Three layers:
  - **The grid**: tiers down, weathers across, one filament a cell, with its Jita price, how many you've run, and the
    median cruiser loot there. Picking a cell (kept per browser, else what you run most) shows what the filament does
    (its weather's effects from its description; who can go and where it opens from sourced rules, since those parts of
    the description are stale), and what Abyss Tracker's players logged there:
    runs, median loot a pocket by hull size, what drops most, and the fits most run there. A fit opens whole: its EFT read
    by the cloud and parsed (`parseEft`, `eftToTier`: lows, mids, highs by position, the rest by ESI category, a drone or
    cargo line given twice summed), priced at Jita now, Copy fit, Copy for Multibuy, Save fit in game, the skills it asks,
    and what it measured at that cell (runs, survival, ISK a run and an hour, runs to pay for itself) and where else it ran.
    Prices load on opening: the grid is the page.
  - **The tree** (25 hulls): columns are the tier a ship is first run at (T0–T6); rows are the three frigate lines
    (frigates run three to a pocket), the Deacon that keeps a Retribution trio alive, the destroyers (two to a pocket),
    the Gila trunk, then a row per weather's specialists (Dark: Sacrilege, Cerberus; Electrical: Omen Navy Issue,
    Stormbringer; Exotic and Firestorm: Deimos, Ikitursa; Gamma: Vexor Navy Issue, Vagabond, Ishtar). Within a weather's
    row the arrows are steps up in tier, not a skill path. Ships among the most run at the picked cell carry a crosshair
    (Raging Dark: Hawk, Jackdaw, Sacrilege, Cerberus). A ship opens to the cells whose most-run lists it's on ("Dark T1–T6 ·
    Exotic T1–T2"), your own abyssal losses in it, and its fits as Just in (the cheapest, easiest fit the logged runs show
    working), Solid and Max, each an Abyss Tracker fit read whole as above. The ship you're in glows (`useRightNow`, now in
    `hustles/rightNow.ts` and shared with Mining and Hauling).
  - **The research** (30 September 2026, `.playwright-mcp/research/abyssal/draft.md`): all 35 of Abyss Tracker's cells,
    201 most-run fits with their performance, 63 read module by module; zKillboard's abyssal losses for nine days; EVE
    University, Wiki Circa Kismeteer, CCP's patch notes and static data. 677 of 727 item names resolved in ESI; the other
    50 are unpublished NPC and weather types. What it found is in eve-facts (frigate pockets out-earn cruisers, the
    tracker's losses are too low, a trio is logged under one hull). T2 is the thinnest tier (skip it, the data says), and
    T6 Firestorm has no cruiser answer: frigate trios own it. T6 Gamma's most-run fit is a 331 M Vagabond whose author
    doesn't recommend it; its label says "as flown". No fit has been checked in a fitting tool against today's game.
  **The ship notes are points now** (30 September 2026): each ship's paragraph became bonuses, points by kind and research
  figures with their sources, written by hand in `abyssShips.ts`; its resists come from ESI as bars and where it's run from
  Abyss Tracker as a grid, so neither is typed into the text any more. Hauling's gank lines went the same way
  (`GANK_BY_CLASS` points, loss and gank figures as tiles). See app-conventions.
  **No pilot's name is kept or shown.** The cloud stores a cell's figures and fit summaries only (`compactCell`: no run
  lists), and fit authors' names were taken out of the ship notes; fit titles show as Abyss Tracker shows them.
- **Hauling has its tree and fits** (`lib/haulTree.ts`, `lib/haulFits.ts`, `lib/cargo.ts`, pure; `HaulingTree.tsx`,
  `HaulFits.tsx`). Every hull that hauls: each race's ladder (small and big Tech I, Blockade Runner, Deep Space Transport,
  freighter, jump freighter), the one-goods specialists and Primae, Upwell's line and ORE's (Porpoise, Orca, Bowhead).
  A hull opens to its holds at your skills and at V (worked out from ESI's dogma: see eve-facts), what a courier package
  can use, the bare hull's EHP, zKillboard's high-sec record for it (July–September 2026: losses and how many were
  ganked, with no denominator, so never a chance of dying) and how its class gets ganked (median attackers and cargo, and
  where). **Use for the contracts above** hands its space and class to the contract finder. Its fits (84 for 32 hulls,
  from EVE Workbench, by purpose) show the holds with their expanders, rigs and bulkheads, EVE Workbench's EHP, and what
  EVE University's rule of thumb lets it carry (cargo plus fitted modules under about 3,000 ISK per EHP), with the same
  copy, Multibuy and save buttons; a test keeps each within its hull's slots. **Building it found the finder's presets
  wrong**: a freighter was given Advanced Spaceship Command's bonus, the Orca's bonus was applied to its fleet hangar, a
  Deep Space Transport's fleet hangar and a jump freighter's cargo got none, and each class's preset lumped four races'
  hulls whose holds differ. They're now one real hull a class (Tayra, Crane, Bustard, Orca, Rhea, Charon) with ESI's rules.
  ESI's renaming of group 28 to "Hauler" had also quietly dropped Tech I industrials from learned gank lines and hauling
  losses.
- **Reprocessing is a page of its own** (`lib/reprocess.ts` pure, `Reprocess.tsx`, `src/data/typeMaterials.json`). The
  user asked for it after the Experimental ZW-4100 Torpedo Launcher turned out to trade at its minerals' value. ESI has
  no type materials, so they're bundled from CCP's SDE (build 3552227, 28 September 2026; `scripts/type-materials.mjs`
  rebuilds them): 7,760 market types, 470 KB, a chunk of its own that only the page loads. Yields follow EVE
  University: modules, charges and ships only ever get Scrapmetal Processing (55% at V, anywhere, so a structure only
  wins on tax); ore gets Reprocessing, Reprocessing Efficiency, its own processing skill (the ore names it, dogma 790)
  and an implant, on a base of the NPC station's own (0.5 at Jita 4-4, from ESI) or a structure's rig, security and
  Athanor/Tatara bonus. Output is whole batches, each material rounded down per batch (the careful reading; not
  confirmed which way the game rounds). Tax: 5% at 0 standing with an NPC station's owner, none from 6.67 (the user's
  7.04 with Caldari Navy: 0% at Jita 4-4), a structure's typed in; on CCP's adjusted prices. The item check buys from
  the cheapest Jita listings, sells the output into Jita's bids after sales tax, and tabulates profit by level of the
  skill that moves it. On 29 September 2026, 100 ZW-4100s at the user's untrained 50%: −108 k; +92 k at Scrapmetal V.
  The implant is chosen by hand: reading it needs a scope the app doesn't ask for (esi-clones.read_implants.v1).
  Its scanner (`scanUnderValue`) runs every item that reprocesses against the books the cloud's daily full scan left in
  the browser: what one unit's output fetches at your yield (in the scan's own Jita bids, after sales tax and the
  reprocessing tax), each listing level under that in whole batches, and the same at the best yield the moving skill
  gives. On 29 September 2026: 6,451 such items had a book; 6 made 100 k or more at the best yield, 2 at the user's
  50% (a 250mm Compressed Coil Gun I, +283 k for 29; a J5 Enduring Warp Disruptor), and Inferno Torpedoes +3.2 M only
  at Scrapmetal V: reprocessors keep most prices at mineral value. The finds are leads: clicking the Coil Gun into the
  item check, against the live book, its cheap listings had already sold (−240 k).
  **Where you refine can be found by name** (`FindStructure`, `siteFromStructure`, scope `esi-search.search_structures.v1`,
  registered 29 September 2026): ESI's character search for structures you can see, each read with
  `/universe/structures/{id}` (now keeping its `type_id`) and its system: an Athanor (35835) or Tatara (35836) sets the
  structure, 0.45 and up is high-sec, above 0 low, the rest null. Rig and tax aren't in ESI and stay the user's.
  **Multibuy copies** (the research's Multibuy idea, for Reprocessing only, as the user chose): the item check copies
  what it priced as "Name N" (whole batches only: 1,050 Plagioclase III-Grade copies as 1,000), and the scanner the
  finds that pay at your yield, each with the units listed under its value. Multibuy buys from the cheapest sellers in
  your system, which is what the check priced. **Graded ores are separate types in the SDE** (asked 29 September 2026,
  "Plagioclase III-Grade"): Plagioclase, II-, III- and IV-Grade give 175/70, 184/74, 193/77 and 201/81 Tritanium and
  Mexallon per 100, each with Compressed and Batch Compressed forms, all naming Simple Ore Processing; the bundle has all
  of them and ESI resolves the names, so nothing needed changing.
