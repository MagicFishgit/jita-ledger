# Task 10 report: prices for every planetary good

## Built
- `src/lib/piPlan.ts`: exported pure `soldOf(perDay, {jita, home}, sell, share)`. Per place it calls `slotDay`; under 'best' the
  place whose first unit nets more is filled to its cap, the other takes the rest only where its unit pays. `Sold.jitaUnits` is
  always set (units sold at Jita, 0 when none). Neither prices: `isk: null`, `why` = the sales' own reasons. The local `soldOf` map in
  `valueBought` is renamed `soldBy`. `planChain`'s doc now says the budget is spent in rounds.
- `src/components/hustles/planetsMarket.ts`: `usePlanetMarket(c, ix, { live })` returning `{ sell, buy, unit, ready, said }`.
- `scripts/check.mjs`: new "prices for the planner" block; the stale "Spent best-first" comment reworded.

## Decisions / deviations
- Third argument `opts.live` (types the planner names) because the brief's two-argument signature can't know which goods to read
  live. Morning scan prices everything; `useLiveBooks`/`useHomeHistory` only read the named types.
- Each good's two `Sale`s are worked out once per good with `makes = 1e9`, so the week's freight volume is the market's pace at your
  share and the minimum (inside `sellAt`'s `legCost`) is spread over it, independent of the amount asked. soldOf stays pure.
- Home sale leg is 'here' (the haul planet to hub is the planner's upkeep, per spec); Jita leg is `legFor` on the hub's system.
- Buy: Jita ask + freight in on the same route (minimum spread over a week of the market's pace at your share, so cost per unit is
  constant), or the hub's best sell; cheaper under 'best', the chosen place otherwise. The hub price is its best sell, not walked up
  levels (brief).
- No hub / hub unknown here / no route: that side is `isk: null` with Industry's words (`homeSaid` for a hub the cloud list doesn't
  give, else "no home hub picked: pick one on the Industry tab"; "no freight route to Jita" from `sellAt`; `NO_ROUTE_WHY` for buying).
  With no hub both Jita and home are unpriced (as resolved).
- Known edge: under 'best' places are ordered by first-unit net; a second place whose first unit beats the first place's later
  side (list vs bids) could make the per-unit net non-monotone. Not seen in practice; flagged.

## Checks
- `npm run check`: all passed. `npm run build`: passes.
- Planted: `jitaUnits: 0` made 2 new assertions fail ("a sale split ... sends the Jita part", "Jita alone"); the per-call sale
  (planted inside the test) makes the monotone check read false, asserted.
- `PORT=5288 npm run check-pages`: all 145 page loads passed. `PORT=5289 npm run check-income`: figures as recorded, unchanged.

## Fix round 1
- **C1** `soldOf` under 'best' now orders the single-side copies of both places' sales by net and fills them in that order (one
  `slotDay` per side; the first side always, the rest only where a unit pays). New tests: import market (home list 10,000 / bids
  6,000, Jita list 9,000 / bids 7,000) non-increasing over 1..300 units, no amount worth more than its units at the first unit's
  net, 55 units = 500,000. Planted (old place-by-place code restored): "never rises" and "55 units" fail (got 350,000); a copy of
  the old order inside the test also reads non-monotone.
- **I1** `said` branches on the leg: a route names it; none says no route is picked and nothing is priced at Jita.
- **I2** Jita pace 0 with a freight route: Jita unpriced ("nothing traded in Jita in the last 14 days…") for selling and buying;
  pace null: buying with a route uses the sale's reason (selling already unpriced by `sellAt`).
- **I3** `waiting` first checks `c.feeKnown`, in Industry's "skills aren't read yet" words.
- **I4** the memos use `Date.now()` inside, not `useNow`; `now` only feeds `said`. `sell`/`buy`/`unit` keep identity until inputs change.
- **m1** no-hub `said` is a closed sentence that also says Jita is unpriced; the broker-fee sentence only when home is used.
- **m2** `ready` waits while the hub list loads for a hub picked. **m3** `said` names Jita's source (morning books / live for the
  named goods). **m4** hub buying walks the structure's levels for a week's need (`fillCost`), or Goonmetrics' best sell only where
  weekly movement >= `HOME_DEPTH` x the need; thinner falls to Jita. Test: `fillCost` per-unit cost never falls with the amount.
- **m5** the hook returns `freight` (the hub to Jita route's terms, or null).
- Checks: `npm run check` all passed; `npm run build` passes; check-pages and check-income check-pages: all 145 page loads passed; check-income: figures as recorded.
