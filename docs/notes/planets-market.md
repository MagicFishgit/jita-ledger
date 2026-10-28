---
paths:
  - "src/lib/{piPlan,lp,colonyChain}.ts"
  - "src/components/hustles/{planetsMarket.ts,PlanetsPlan.tsx,PlanetsChart.tsx}"
---

# Planets: what Plan sells and buys at

Decisions worth not undoing. The prices the planner values goods at and buys inputs at (`planetsMarket.ts`, `soldOf`, `boughtOf`,
`soldAtHome`, `boughtAtHome` in `piPlan.ts`), what an unvalued good counts, the bought setup's exact sizing on those curves
(`planBought`, `lp.ts`) and the upkeep. Moved from planets-planner.md on 19 October 2026, every fact kept (Task 15c; the notes
budget: Planets.tsx loaded 138,720 of 140,000); how Plan ranks the rest is there, the feed, the chain and the searches in
planets-searches.md. Each ruling's number is the ledger's (`.superpowers/sdd/2026-10-17-planets/progress.md`).

How Plan ranks the rest is in `docs/notes/planets-planner.md`, the feed, the chain and the searches in
`docs/notes/planets-searches.md`: Read them before changing what a setup counts.

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
  - **Sell at Jita with no freight route is Jita's own prices, before freight** (24 October 2026, `jitaHere` in planetsMarket.ts;
    the user: "i dont care about a freight route being set. when I click on Jita I just want to see the sell prices in Jita so I can
    compare them vs my corp hub"). It said "nothing is priced at Jita" (T10-3's reach through the hub's route). Now Jita's figure
    before the haul (as F11's fallback with no route), said once ("before freight: no freight route … is picked"); buying at Jita still
    needs the route, and so does Either (hub against Jita before the haul would favour Jita by its cost). No hub picked: still nothing.
  - **Plan it holds the good to no market** (planner fix 1, `uncappedSell`): its every unit is valued at its first unit's net (its side,
    places and Jita fallback as `sell` gives them), so nothing caps the factory's run or says how fast it sells ("the selling is my
    problem"); every other good keeps `soldOf` at your share. Not priced at a sliver, or nothing selling at your share: not priced.
  - **Sell at the hub: a good it doesn't price is valued at Jita's, warned** (Ruling F11, the user's own: "just pull the jita figure
    instead and warn, that way i can put it up for that price locally or store it for shipping to jita"; `soldAtHome`, once in
    `usePlanetMarket`'s `sell` and `unit`): on the route, what it nets shipped; with none, Jita's own before freight. Per good and
    wholly (`Sell`'s contract holds); neither prices, unvalued with both reasons (I1). Marked `fallback`, which keeps the hub's own
    reason (`hubWhy`), and each output's words lead with it: "No price at UALX-3: valued at Jita's: … after freight (Jita lists it at
    …)", but "Nothing says how fast it sells at UALX-3: …" for a good it lists whose pace isn't known (every listed good at a hub
    Goonmetrics doesn't track), "Not read at UALX-3 yet: …" (the review of Task 15c: a blanket "no price" was false there); the
    setup ("Valued at Jita's for want of a UALX-3 figure: … (each line says why)") and versusBest name the goods. Before, all
    unvalued.
- **Buying** (Rulings T11-3, T11-7). Jita: others' listings walked up the book for a week's need (the morning scan's seven levels,
  the live book's for the goods the ranking names), each level with its own freight in, **held to your industry share of the
  good's day in The Forge**; past that, unpriced with what Jita supplies. Nothing capped it before: 5-NZNW's top setup read
  133.64 M ISK a day buying 75% of High-Tech Transmitters' Forge day at one ask; held, 70.09 M. The hub: its own read's levels
  spread over a week, or Goonmetrics' best sell up to a tenth of its weekly movement. Under Either an input is bought across both
  places **cheapest first, each to its own max**, as `soldOf` sells: when the whole amount went to the cheaper place that could
  take it, every unit past its max moved to the dearer place, the cost wasn't convex and the sizing missed (36,355,440 against
  37,044,880). The `Buy` contract: a unit's
  marginal cost never falls.
  - **Sell at the hub: an input it doesn't sell is bought at Jita, warned** (Ruling F11b, buying following F11; `boughtAtHome`,
    once in `usePlanetMarket`'s `buy`): wholly at Jita's asks with the freight in on the route, as Either buys at Jita, so a good
    is bought at one place and `Buy`'s contract holds (tested); marked `fallback`, the input's line saying "with the freight in
    (<the hub's own reason>)" and the setup naming them once ("Bought at Jita, with the freight in, for want of UALX-3: … (each
    line says why)"). With no route, unpriced with both reasons: buying needs the freight in. Before, such an input was unpriced: with Sell at
    UALX-3 the page case's bought read 2.78 M ISK a day and fell from first, now 25.14 M and first (the others don't buy, and under
    Either it stays 71.86 M), so the page check's re-rank now takes the freight route away instead. Task 11's planner-vs-brute on
    bought, buying so: 400 of 400 equal, both paths taken.
- **Upkeep**, beside the ISK (Ruling T11-4): resets a week (colonies × 168 ÷ the programme hours); restocks counting what comes in
  and what's made, since the launchpad (10,000 m³) holds both (the reviewer's count was about 102 a week where inputs alone read
  57.5); the m³ out and the m³ in, how much from Jita; freight contracts each way, "at least 1" once a week's m³ is over what a
  contract's minimum pays for (5 M at 900 ISK a m³ is about 5,556 m³), else time between (small outputs batch up).

## Limits

Moved here from planets-planner.md with the rules above: state these rather than letting them be discovered.

- **The export rule judges a good's first unit**: a later side `soldOf` takes at a unit over nothing
  before the tax, so one netting under its tax sells at a small loss (never seen).
- **A good valued at Jita's because the hub has no price isn't a sale at the hub** (F11): what it nets shipped to Jita (or Jita's
  own before freight), a figure to list it at home by or to ship it later; no hub buyer is known to take it.
- **Planets compares setups within one system**, prices nothing until a home hub is picked on the Industry tab (Jita is priced
  through the hub's freight route, so even a high-sec system planned with no hub gets no prices), and at a thin home market a
  price moves with a few trades.
- **A bought setup runs each planet to its last unit that pays** after the other planets' share, all sized together exactly
  (a linear programme over the planets' amounts, the sale steps and the buy steps): a sale or a book that steps down sizes it
  under what sells, on purpose. Buying at Jita is held to your industry share of the good's day in The Forge, walked up the
  book (seven levels, the morning scan's or the live one) for a week's need; at a hub, its own read's levels spread over a
  week, or a tenth of Goonmetrics' weekly movement. A deeper book isn't seen.
- **Under Plan it a good priced but with no measured pace is still "not priced"** (planner fix 1's round 1): the held good is valued at
  its first unit's net from `sell`, and `soldOf` at a pace of 0 sells nothing, so no net comes back; valuing it at its listed net with no
  pace would need the listing's price passed through `Sold`.
- **An input bought at Jita for want of the hub** (F11b) is priced on Jita's asks and the freight in, as at Either;
  whether a hub seller appears later isn't known until it lists, and with no freight route it isn't bought at all.
