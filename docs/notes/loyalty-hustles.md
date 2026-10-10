# Loyalty and side hustles

Decisions worth not undoing. Loyalty points, planetary industry, freelance jobs, reprocessing and skills. Mining is in
mining.md; Abyssal, Hauling and Combat in abyssal-hauling-combat.md (split on 1 October 2026).
R&D agents (the Research tab under Side hustles, datacores from research points) are in research.md.

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
- **PI factories are per colony and are not fed continuously.** One planet cannot supply another, and
  a factory receiving less than 6,000 an hour does not stop working — it runs fewer cycles. So show
  how many are needed to keep up (rounded up) and how busy they will be, never how many the
  extraction can "afford".
- **The Planets page is a walkthrough whose instructions follow its own verdict.** Pick a product
  (all 15 priced live and ranked per 1,000 units of extraction), find planets, see the return, build
  it. Told to sell raw, the build guide drops the factories and draws extractor straight to
  launchpad. Refining currently ranges 0.76×–1.57× across the products, so the answer genuinely
  differs per product and moves with the market.
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
  **Your jobs** (scope `esi-characters.read_freelance_jobs.v1`, registered 29 September 2026): `/characters/{id}/freelance-jobs`
  lists only the jobs running; each one's `/participation` gives `contributed` and `Committed`/`Kicked`/`Resigned`. In the
  finder a job you're in says so, and a capped one counts only what's left of your share.
  **Second version, after the user's Scordite job** (29 September 2026: 38,132,412 Compressed Scordite 0-Grade bought at
  11.76–11.79, delivered 3–4 jumps out for 17 each, 576.94 M in rewards so far, ~170 M profit on what's delivered):
  - **What's been done shows in ISK**: the Wallet has "Freelance rewards" (they were Other income) and "Bought for
    freelance jobs" (they were Other purchases); Results has a Freelance activity (rewards less everything bought,
    leftovers included, so it reads below the tab's profit until they're delivered). How the tab works it out is below.
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
- **Freelance after tax, and every job you did** (`jobHistory`, `readReward` in freelance.ts; `readJobHistory` in
  freelanceStore.ts; 1–2 October 2026). The user saw a lot of tax on a reward, made a corporation at 0%, and asked for the
  tab to show "the runs you did the cost and profit made", and why job purchases were "Other" in the Wallet.
  - **The finder prices after your corporation's tax** (`meta.corp`, read each sync), at render: it buys only listings
    under what a unit pays after it, and says whose ("after TEMP TAX HAVEN’s 0% tax"), or "before tax" until read. At 17 a
    unit and Scordite at 11.79: 3.34 M a million units at 11%, 5.21 M at 0%.
  - **"Every job you did"** is every job a reward names plus the joined list, merged, never replaced: the sync replaced it
    with the joined list, which holds only the jobs running, so three finished jobs' purchases became Other purchases.
    `meta.freelance` stays in each browser (cloud.md), rebuilt from the journal and ESI; a finished job's details are
    kept for good; one ESI answers 404 for is listed by its rewards' name and asked again each sync. The tab is the
    main's alone; an alt's jobs aren't read.
  - **A job's window runs from its posting to its finish** (`jobEnd`: else its expiry, whatever its state, so a job ESI
    stops describing doesn't stay open). It starts at the posting, not your joining: anything of its items bought in
    that window is the job's, here and on the Wallet and Results; a tagged trade is no job's (2 October 2026).
  - **Each delivery takes the newest purchases before it** of its items in its window, each purchase once (the four
    Scordite jobs overlapped). Evidence: the 813,258 at 21.96 (29 Sep, 12:03:02) went onto sell order 7432972978 44 s
    later, never delivered. ISK Scordite costs 1,008,181,985.41 this way, 1,016.36 M first in first out. The cost: a
    lot bought long before and kept for a delivery is costed after newer ones. Units beyond what's left came from stock
    not bought for the job (mined, contracted, looted, bought before it began): said apart, never costed. A leftover
    stays with the job paid next after it. **A sale takes the leftovers, oldest first, for the job each was left with**: a
    leftover's sell order filling during a later job doesn't eat that job's purchases (it charged a Buy Back 813,258
    of "stock you didn't buy"), and after every job it still clears it. Units sold in a job's window with nothing bought
    behind them are said apart and left out of its profit: costed at 0, 5,000,000 mined Veldspar added 35.75 M. **A job paid after your trades are read says its units aren't
    matched yet, not that you didn't buy them** (`tradesReadTo`, `purchasesPending`): EVE shows the journal sooner than the
    trades (each cached an hour), so the user's Добыча Veldspar* (2 October 2026), paid 208 M at 17:33:16 for 8,000,000
    bought from three listings at 17:26:54, read "from stock you didn't buy for it" at no cost while their trades were read
    only to 17:00:11. Trades count as read to when EVE's copy was taken (an hour before the sync said new ones can appear)
    or the newest trade held; past that the row says how far they're read and the profit "may still" lose the cost.
  - **Units and tax**: the journal's `tax` when (amount + tax) is whole units at the job's rate to the cent, else set
    aside; then the corporation ESI's history puts you in then, at its rate now, only when exact to the cent and within
    everyone's deliveries; else "not recorded". Arithmetic alone can't tell: 593,096,000 is whole at 0, 2, 11, 20%…,
    255,106,158.37 at 11, 39 and 51%. A corporation you founded is dated from `date_founded` while ESI's history is
    behind (eve-facts: it split Kernite's 11% at 19:30 from the Buy Backs' 0%); one joined has no known start, and both
    rates are tried. A total not known reads "–". While any reward lacks `tax`, each sync and each opening of the tab
    reads the corporation history and its corporations again (two or three requests); if ESI never gives `tax` on these
    rewards, that stays. The tab once left them to the sync: opened before the first sync with the code (2 October
    2026), it read "not recorded" on every job and "–" for the totals until the sync came round, and the page check,
    which seeded them as a sync would, never saw it (it now starts without them).
  - **Ore not bought, sold in a job's window, counts as Freelance** in the Wallet and Results (the trade rule is the item
    and the window), though the tab keeps it out of the job's profit; and a player corporation that changed its rate
    leaves its rewards "not recorded" (ESI keeps no past rate; the exactness check stops a wrong figure).
  - **The user's six, as their check**: profit 91,961,855.90 and 93,852,835.99 (Buy Backs, 0%), 340,610,880.10
    (Kernite), 52,117,599.80 (Mothhat), 278,582,468.32 (ISK Scordite, 813,258 left over at 17.86 M), 136,748,854.74
    (Veldspar); 3,787,583,450.13 received, 386,308,066.87 tax, 2,793,708,955.28 cost, 993,874,494.85 profit. On a phone
    the table folds to the job, its profit and figures under its name.
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
  **Where you refine can be found by name** (`FindStructure`, now `components/FindStructure.tsx`, shared with the Industry tab's build sites, 10 October 2026; `siteFromStructure`, scope `esi-search.search_structures.v1`,
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
