# Planets: the planner

Decisions worth not undoing. How Plan ranks a system's setups (`src/lib/piPlan.ts`, `src/lib/lp.ts`) and the prices it sells and
buys at (`planetsMarket.ts`). The data, the `planets` document and the page are in `planets.md`, the colonies in
`planets-colonies.md`. Each ruling's number is the ledger's
(`.superpowers/sdd/2026-10-17-planets/progress.md`); the evidence is in that folder's task reports and reviews, the probes in
`.playwright-mcp/planets-build/` (gitignored).

- **What every setup counts.** Rates come from the schematics, never typed: a Basic takes 6,000 P0 an hour for 40 P1, an Advanced
  40 of each of two P1s for 5 P2, a P3 20 or 30 P2s for 3, a P4 on a High-Tech plant (Barren and Temperate only). Extraction is the
  rate's `perHour`, CCP's formula since the in-game check (planets.md; the lower reading before it, `iskDayHigh` the same arrangement
  on the higher, null now). A layout is
  sized to the rate (Basics `ceil(P0 an hour ÷ 6,000)`, Advanced `ceil(the lesser P1 ÷ 40)`), not picked from fixed 2 + 4 or
  3 + 6: a factory short of input runs fewer cycles rather than stopping, so a layout counts the factories that keep up,
  rounded up, and how busy they are (`runs`), **as far as it fits at the character's own level** (Ruling F9, Task 15b, `fittedPlans`).
  Past that, each way of running fewer that fits with room for no more (a Basic a line at least, never an idle Advanced) is a
  candidate the search values, the P0 its Basics can't take an output, said on the planet's line ("5 Basics and 2 Advanced fit at
  Command Center Upgrades IV: the Basics take 30,000 of the 35,293 P0 an hour; the rest builds up"). A layout fitting only higher is
  never ranked in its place; when the least layout of its kind doesn't fit (a Basic a line, and an Advanced for P0 → P2) the rates'
  layout stays, said with what it lacks. Heads stay the rate's. At the real rates (16,000–20,000 an extractor) every 5-NZNW planet's layout wanted 7–10 factories beside 10 heads,
  where 6 fit at IV, and read "train V" or fit at no level. With no rate, two Basics' worth, 12,000 P0 an hour an extractor, said as "if
  your extractors deliver 12,000 P0 an hour each" and listed in `before`, never claimed. Heads are the rate's (`ceil` of its
  median); 0 heads means the colony didn't say and the layout takes the most that fit, said (Ruling T8-1). A rate from programmes of another length says "rates from N-day
  programs". Every output is valued, a surplus P1 too; a price nobody reads leaves it unvalued and counted (`unvalued`), never 0.
- **An unvalued good is neither credited nor taxed** (the final review's I1; `assess`, `valueFed`). It is still shipped (nothing says
  how much would build up), but its export tax goes with its sale: with no hub picked, P0 → P1 and P0 → P2 ranked first on a loss
  made of customs alone (−173,363 and −195,034 ISK a day on the page case), and a setup with one unpriced output read under what its
  valued ones make. What a feeder ships to the factory is taxed as ever, what it ships to market unpriced isn't. A setup none of
  whose outputs is valued is blocked with their own reason ("No home hub picked: pick one on the Industry tab"); feed and chain
  search only products priced, so there it is a guard. The bounds already counted such a good at nothing (a first unit's net,
  floored at 0), so they stay sound: brute force agreed after the change (256 feed and chain systems, 0 differ; planner against
  brute force on bought, 0 of 400).
- **Only bought is sized to what pays** (the final review's sizing verdict). The others export what sells: a unit costs them nothing
  to make but its customs, so their only loss-making tail is a good whose first side nets under its export tax (`soldOf` sells the
  first side even at a loss, shown as a loss), or one taxed while unpriced, which I1 ended; at today's prices the first doesn't
  arise for anything they export (freight is 20–50% of a P1's value). Don't extend the linear programme or the last-paying-unit
  rule to P0 → P1, P0 → P2, feed or chain as sizing. **For exports it holds since Ruling T15-5** (Task 15b, `keptWhy`, shared with
  colonyChain): a planet ships a good only while its first unit (`soldOf`'s first side, after freight and fees) nets above nothing
  after the planet's export tax; the rest stays, untaxed, building up, and production isn't resized. F9's P0 left over is that
  tail: Brave Freight's 4.5 ISK a unit against Jita asks of 2.10–4.60. A P0 with no price stays too, a known nothing, not unvalued.
- **One market cap per good, and what builds up isn't taxed** (Ruling T8-3). A good's output is summed across planets and
  characters and sold once (`sell` on the total). What the market takes is exported from the lowest-tax planets first; the rest
  stays on its planet, untaxed, and is said to build up. Taxing every unit made let `iskDayHigh` read under `iskDay` (P0 → P1 on
  the review's 12-planet case: 954,240 against 913,280; now 1,161,600 both).
- **What doesn't fit is judged a planet at a time** (Ruling T11-2). `Role.lacks` comes from that planet's own fit (`fitted`,
  `levelFor`), never the character's union: a Barren at 10 heads that fits at no level beside a Lava that fits at V read "train
  Command Center Upgrades V" for both. A layout that doesn't fit is still ranked and said (the spec).
- **P0 → P1 and P0 → P2: greedy, then a pick taken first gives way** (Ruling T8-2). Greedy by marginal value (what a pick adds to
  what's already sold, less its tax), then `improve`: re-pick a chosen planet, swap in an unused one, and re-pick a planet sharing
  a good jointly, until nothing gains (`MAX_MOVES` 50). The greedy alone read 2,605,440 on the review's case where 4,525,440 was
  there (Test Cultures capped at 240 a day on Temperate). Measured 3–6 ms (P0 → P2) and 32 ms (P0 → P1) on 12 planets. With F9's
  candidates the searches compare by `scoreOf` (assess's figure alone) and pair planets only on goods offered: 5–7 and 25–27 ms
  warm on 5-NZNW at the real rates (Task 15b; 3 and 31–35 before it, 61 and 124 with F9's candidates and no `scoreOf`).
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
- **Bought** (`planBought`): each planet allowed is a factory planet of one step (a P2 or P3 on Advanced, a P4 on High-Tech), at
  `maxFactories` for the character's level with one launchpad, buying its inputs. A product whose input can't be priced isn't a
  candidate (never a cost of 0).
  - **Its planets are sized together, exactly, by a linear programme** (Ruling T11-11; `sizeGroup`, `lp.ts`). Planets linked by a
    product or an input are one programme: columns each planet's amount, each sale step that pays and each buy step; rows what
    sells ≤ what's made and what's bought = what's used; the objective sales less purchases less taxes. The steps are found from
    the `Sell` and `Buy` closures (`kinksOf`, at most 400 evaluations a curve), so the price hooks don't expose their levels.
  - **Why not sized by rules** (never go back): sizing each planet to its own last paying unit (T11-6) let two planets sharing a
    market or a book run units at a loss (37,966,080 where 40,063,680 was there); holding each in tax order and settling (T11-8,
    T11-10) stalled at kinks, about 7% of random pairs over 1% under the best (worst 96%), and the search's prune on `cur +
    topFrom` is sound only when `cur` is the set's exact best: 2 of 400 random setups came out under brute force (12.03 M against
    13.58 M, 19.54 M against 22.29 M). **Never heuristic sizing with `cur + topFrom`.** With the LP: 0 of 400 differ, an
    independent grid of 39,144 pairs and triples never above the planner's figure, the solver against vertex enumeration on 5,500
    random programmes 0 wrong, its optimum equal to `worthOf` within 7e-15.
  - The search (branch and bound over products by class, best alone first) prunes on `cur + topFrom`: the set's exact worth plus
    what the options still open make alone, as many as each class has room for. It goes on past a set the sizing zeroes a planet
    in (that set less the planet), and stops at a refused set (refusal only grows with what's bought). A held planet's line says which limit binds: its input's supply, what the market takes, its last unit paying,
    or "after the other planets' share".
  - **`lp.ts`**: a bounded-variable primal simplex on a dense tableau, maximising over 0 ≤ x ≤ hi, starting at all amounts zero
    (a row not met there throws). Dantzig's rule, Bland's after `DEGENERATE_RUN` (8) pivots that move nothing, so it can't cycle;
    tolerances relative to the problem's sizes (prices to 1e6, amounts to 1e5). 'stalled' is a pivot cap for the tests.
  - **Only an optimum is a set's exact best** (Ruling T11-12): `sizeGroup` refuses anything else as "the sizing didn’t settle"
    (`Sizing.unsettled`). The set stops the search as a refused one does (the prune on `cur + topFrom` needs the exact best), the
    setup is marked cut (the best of what was tried), and the reason never reaches `buyWhy`, since it says nothing of what can be
    bought; with nothing settled at all, "No product here could be sized exactly: the sizing didn’t settle". `PlanInput.maxPivots`
    makes it happen for the tests (at 6 pivots the "together" pair stalls and each planet alone settles). Never seen in 5,500
    programmes. A product with an input not priced at one unit isn't a candidate; with none left the row says "No product here has
    every input priced to buy" and one input's reason as an example (it said "No input is priced", which overstated it).
- **Selling** (`soldOf`, Ruling T10-1): under Either, each place's listing and bid sides are filled in order of their net, never a
  place at a time: place by place, a hub's bids ahead of Jita's listings read 350,000 for 55 units where 500,000 sells. The
  `Sell` contract the exact sizing rests on: the next unit never nets more (concave), what sells never falls, no charge a call.
  Jita is priced through the `industry` doc's freight route from the home hub (`legFor`); a Jita pace of 0 or null is unpriced
  with its reason, never a freight minimum spread over nothing (Ruling T10-2). With no hub picked nothing is priced (Ruling
  T10-3). A character whose fees aren't read is waited on, in Industry's words.
- **Buying** (Rulings T11-3, T11-7). Jita: others' listings walked up the book for a week's need (the morning scan's seven levels,
  the live book's for the goods the ranking names), each level with its own freight in, **held to your industry share of the
  good's day in The Forge**; past that, unpriced with what Jita supplies. Nothing capped it before: 5-NZNW's top setup read
  133.64 M ISK a day buying 75% of High-Tech Transmitters' Forge day at one ask; held, 70.09 M. The hub: its own read's levels
  spread over a week, or Goonmetrics' best sell up to a tenth of its weekly movement. Under Either an input is bought across both
  places **cheapest first, each to its own max**, as `soldOf` sells: when the whole amount went to the cheaper place that could
  take it, every unit past its max moved to the dearer place, the cost wasn't convex and the sizing missed (36,355,440 against
  37,044,880). The `Buy` contract: a unit's
  marginal cost never falls.
- **Upkeep**, beside the ISK (Ruling T11-4): resets a week (colonies × 168 ÷ the programme hours); restocks counting what comes in
  and what's made, since the launchpad (10,000 m³) holds both (the reviewer's count was about 102 a week where inputs alone read
  57.5); the m³ out and the m³ in, how much from Jita; freight contracts each way, "at least 1" once a week's m³ is over what a
  contract's minimum pays for (5 M at 900 ISK a m³ is about 5,556 m³), else time between (small outputs batch up).
- **The ranking** (`rankSetups`): ISK a day rounded to the cent, then less upkeep (a chain's per character), then the order run,
  so it's transitive. P0 → P2 always shows.
- **It runs again only when what it reads changes** (the final review's I2; `useStable` in hooks.ts, over `sameValue`). Its inputs
  were keyed on the character objects, which `useIndustryChars` rebuilds on every write to the ledger (meta every few minutes: the
  last visit, the balance, each sync and cloud pull), so the whole planner ran twice for nothing, a chain of two characters a
  second's stall each time, and said "for what you changed". Now the characters are keyed on their `PlanChar` (ID, name, PI
  skills, clone), the shown character's colonies on the document's contents, the prices on the fees, `own` and `hubOrders`. A
  re-rank says "Working them out again…"; the live pass "…on Jita’s books now" (the hub region's history when Jita isn't used).
  Found with it: picking no hub after one, `useHomePrices` handed back a new "loading" state each render and the planner worked
  itself out again without end. The page case writes `meta` alone on the settled plan: nothing may be worked out within a second.
- **On the page case's 5-NZNW** (seeded colony, the research's prices): bought first at 71.86 M ISK a day (one Broadcast Node
  planet at 96 a day on 5 of its 15 High-Tech plants, held by Jita's supply of High-Tech Transmitters); P0 → P2 second at
  14.78 M, 57.08 M under it. The whole planner 148–240 ms with one character doing PI (task-11-rereview-4.md).

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **A feed's or chain's extraction planet is sized on its class's largest planet** (F9): on a smaller one a factory more might fit
  (5-NZNW's Gas: 5 Basics on VII's 53,350 km, 6 on IX's 16,390). **A chain's is sized at the lowest level among its characters that
  holds it**, so a character at a higher level could run more there (T15b-2: with a second character at III, the owner's IV planets
  run 4 Basics where 6 fit). **The export rule judges a good's first unit**: a later side `soldOf` takes at a unit over nothing
  before the tax, so one netting under its tax sells at a small loss (never seen).
- **A rate whose heads aren't known** (every extractor of that type and P0 said none) reserves one head a line while F9 sizes the
  factories; `fitted` fills in the most heads that fit after, and the whole learned rate is credited to them, said only as "the
  most that fit".
- **The feed's and chain's factory planet must fit at CCU V** (T9-3), not at the character's own level: placed with someone it
  doesn't fit, it's ranked and said with what it lacks.

- **Planets compares setups within one system**, prices nothing until a home hub is picked on the Industry tab (Jita is priced
  through the hub's freight route, so even a high-sec system planned with no hub gets no prices), and at a thin home market a
  price moves with a few trades.
- **A bought setup runs each planet to its last unit that pays** after the other planets' share, all sized together exactly
  (a linear programme over the planets' amounts, the sale steps and the buy steps): a sale or a book that steps down sizes it
  under what sells, on purpose. Buying at Jita is held to your industry share of the good's day in The Forge, walked up the
  book (seven levels, the morning scan's or the live one) for a week's need; at a hub, its own read's levels spread over a
  week, or a tenth of Goonmetrics' weekly movement. A deeper book isn't seen.
- **Plan's chain can read short of what the system can do**, said as "the best of the arrangements tried" (a budget of 80,000
  arrangements): at 12,000 P0 an hour 13 of 65 random systems read over 2% short and 1 over 25%; at 25,000 it ranks under a setup
  it beats in 8 of 21; at 50,000–100,000 an hour it can find nothing within its budget and says so (5-NZNW, two characters of 5:
  a bigger budget finds 44–83 M ISK a day). A P4 one character makes alone is planned only for the character shown, so the
  main's view doesn't offer an alt's (one case: 10.83 M a character across both against 18.70 M for the alt alone).
