# Planets: the feed, the chain and the searches

Decisions worth not undoing. Plan's multi-planet setups (`planFeed`, `planChain` in `piPlan.ts`) and the budget and steps their
searches run in (`searchPools`, `planSteps`; the page drives them, `planetsPlanning.ts`). Moved from planets-planner.md on 19 October
2026, every fact kept (Task 15c; the notes budget); the single-planet setups, F9 and the ranking are there, the prices and the bought
setup in planets-market.md. Each ruling's number is the ledger's (`.superpowers/sdd/2026-10-17-planets/progress.md`).

- **Feed** (`planFeed`): extraction planets make P1 (or a P2 alone) and ship to one factory planet making a P2 or P3, the three P2s
  no planet makes alone among them; export tax at each feeder, import at half and export at the factory.
  - **Every feeder must be needed** (`allNeeded`): without it the search dressed planets that only sell their own P1 up as
    feeders (a Test Cultures case read 2,649,600 where 2,620,800 is the feed's).
  - **The factory runs at the lesser of its supply and what sells** (Ruling T9-5); the feeders' other units join the surplus. Run
    at supply, a Nanites factory capped at 100 a day read 2,400,160 where 3,318,560 was there.
  - The factory is sized to what it's fed and must fit at CCU V; it goes to the first character, from the shown one, at whose
    level it fits; feeders to a character they fit at its own level before one merely with more room (Rulings T9-3, T9-6).
  - **Feeders are sized as F9 sizes a planet** (`feederFits`): on their class's largest planet, at the lowest of the characters'
    levels that holds them (the feed's one; the chain's all), so one fits with anyone at that level or above; `remake` keeps the
    counts the search valued. At the lowest level outright, one alt at CCU II threw every feeder back to the rates' layout. On an
    owner above that level its line says so ("sized for Command Center Upgrades III, the lowest among this chain's characters, so it
    fits whoever runs it": Ruling T15b-2); no feeder per level, which would multiply feeders as below.
  - **One way per feeder** (`fedCtx`): of the ways F9 gives a feeder, one for each set of P0s it feeds the factory from (one that
    fits, then the most Basics on them, the most even, its other line paying most), and one for each P2 made alone (the most P2).
    Every way a feeder of its own cut the chain's search on 3 of Task 9's 240 brute-force systems where none was cut before, one 30%
    short; one way each, none. The cost, on the user's real colonies with two characters: 15,862,624 a character against 16,025,985.
    Brute force and the search share `fedCtx`, so the gates can't see that ~1%.
- **The chain** (`planChain`): a P4, or a P3 needing more planets than one character has, across `[shown, ...others]`, only those
  whose skills are read and who aren't Alpha; a clone not read is worked out as Omega and said (Ruling T9-7).
  - **Ranked by ISK a day per character used** (the spec), so it sits in one list with one character's setups; the row shows the
    total and each character's colonies, share (by colonies) and lacks. Too few characters says how many more.
  - **A P4 one character makes alone is a one-character chain** (Ruling T9-9, revising T9-2): pool 0 holds the P4s the shown
    character covers alone, the pools of two characters and more every P4 and the P3s one character can't make. Before it, more
    planets could drop a P4 out of every setup (12 planets, 5 → 6 planets a character: 19.1 M → 7.4 M; now 20.63 M). P2 and P3 one
    character makes stay the feed's. Pool 0 is the **shown** character's alone (Ruling T9-12): an alt that could make a P4 alone
    shows it when it is the one shown.
- **The searches have a budget, and say when it binds** (Ruling T9-4). Searched to the end, a feed or chain took 2.5–72 s and up to
  1.9 GB on realistic systems, or ran out of memory (task-9-report.md, fix round 1). `SEARCH_BUDGET` 40,000 arrangements
  (feed, bought), `CHAIN_BUDGET` 80,000 (at 40,000, 18 of 65 random systems read over 2% short), valuing one costing `VALUED`
  (2) more. A finished search is exact.
  - **Spent in rounds, not by the bound alone** (Ruling T9-11, the implementer's measured deviation from T9-8): every open
    product's first dive before any second round, the highest remaining bound first within a round, then narrow departures,
    then a whole depth-first search. The bound never tightens (a product's bound fills its planets whether or not they place), so
    by the bound alone the loosest product took everything: OIILI found nothing, OLGTLLGI read 11.8 M against 16.2 M.
  - **Cut is said** (`Setup.cut`: "the best of the arrangements tried … may be well under what this system can do"); a search that
    found nothing in budget says `RAN_OUT`, never a planets, characters or size shortage (Ruling T9-10); `NO_FIT` only when
    arrangements were tried, every one failed for size alone, and the search wasn't cut. Brute force agrees where the search
    finishes (256 feed and chain systems, 0 differ); the shortfall where it doesn't is in this note's Limits.
  - **Spent in steps** (Ruling T11-13; `Steps`, `planSteps`, `planFeedSteps`, `planChainSteps`). `searchPools` is a generator that
    yields every `STEP_CHUNKS` (2) chunks of 128 arrangements, by count, never a clock, and each product's context and covering
    search is a step; the page (`usePlanned`) runs steps until 8 ms have passed, then hands the page back (a message to itself:
    nested timers clamp to 4 ms) and drops a run whose input changed between two slices. The search's state lives in the
    generator, so the answer is the same however it's driven: `planFeed`, `planChain` and `planSystem` drain the steps, and
    check.mjs holds every setup of four 5-NZNW cases as before the slicing (`scripts/fixtures/planets-steps.json`), drained and
    driven a step at a time interleaved; a step that kept a chunk of its budget back failed it (budgets 1,500 and 40,000, where the
    chain's answer moves with the budget). On 5-NZNW with two characters the chain takes 371 steps of 1–6 ms.
  - **A good's first unit is asked at a sliver** (`unitNet`, `SLIVER` 1e-6; Task 10's minor, the final review). `sold(id, 1)`'s
    average blended in the next side whenever the best side's cap at your share is under one a day (a P4's, usually), so the
    feed's and chain's bounds understated an arrangement making less than that and could prune it unseen. `slotDay` fills the best
    side first, so a sliver is exactly its net, a bound at every amount under `Sell`'s contract; 0 when unpriced or at a loss.

## Limits

Moved here from planets-planner.md with the rules above: state these rather than letting them be discovered.

- **A feed's or chain's extraction planet is sized on its class's largest planet** (F9): on a smaller one a factory more might fit
  (5-NZNW's Gas: 5 Basics on VII's 53,350 km, 6 on IX's 16,390). **A chain's is sized at the lowest level among its characters that
  holds it**, so a character at a higher level could run more there (T15b-2: with a second character at III, the owner's IV planets
  run 4 Basics where 6 fit).
- **The feed's and chain's factory planet must fit at CCU V** (T9-3), not at the character's own level: placed with someone it
  doesn't fit, it's ranked and said with what it lacks.
- **Plan's chain can read short of what the system can do**, said as "the best of the arrangements tried" (a budget of 80,000
  arrangements): at 12,000 P0 an hour 13 of 65 random systems read over 2% short and 1 over 25%; at 25,000 it ranks under a setup
  it beats in 8 of 21; at 50,000–100,000 an hour it can find nothing within its budget and says so (5-NZNW, two characters of 5:
  a bigger budget finds 44–83 M ISK a day). A P4 one character makes alone is planned only for the character shown, so the
  main's view doesn't offer an alt's (one case: 10.83 M a character across both against 18.70 M for the alt alone).
