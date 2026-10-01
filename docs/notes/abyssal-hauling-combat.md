# Abyssal, Hauling and Combat

Decisions worth not undoing. Abyssal runs, hauling contracts and hulls, ships lost and their fits. Split from
loyalty-hustles.md on 1 October 2026; the dogma and research behind them are in eve-ships.md.

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
    50 are unpublished NPC and weather types. What it found is in eve-ships.md (frigate pockets out-earn cruisers, the
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
  A hull opens to its holds at your skills and at V (worked out from ESI's dogma: see eve-ships.md), what a courier package
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
