# Planets: the system finder

Decisions worth not undoing. Find (`hustles/planets/find?good=<id>&region=<id>`): every system of a region planned for one good, so
the place to build it can be picked. The user (24 October 2026): "If we are able to determine the resource levels of the planets then
something like a feature to find which system to build in for the chosen good would be the best in a given region." The research
(`.playwright-mcp/research/planet-richness/report.md`) found a planet's richness in no API or static data (eve-planets.md); the user
chose this finder on what is certain, plus each planet's own learned rate where they have colonies ("option 2"), and no typed scan
ratings ("not option 3"). The rest of Planets is in planets.md, the planner in planets-planner.md and planets-searches.md.

- **Its data is the bundle's, never ESI's** (`scripts/planets-bundle.mjs`, build 3569502). `planetRadii.json` carries each planet's type as
  its value's last digit (radius in km × 10 + an index into `PI_TYPE_IDS`, the same list in the script and `piBundle.ts`; `decodeRadii`
  gives `[id, km, type ID]`, so `new Map` of it is still ID to radius, and `radiusMap` says so for TypeScript). Of the encodings tried, the
  smallest gzipped: 675,274 B raw and 229,058 gzipped before; 742,967 and 254,827 after (a third number a planet 259,362 gzipped, the type ID
  270,362, the radius × 8 261,061, the ID × 8 259,980, a type string a system 264,782). `planetRegions.json` (its own chunk, the finder's
  alone: 62,789 B, 12,221 gzipped) lists the 100 regions with PI planets and their 7,983 systems, delta-encoded, and for a region with a
  system no stargate reaches (the 31 wormhole regions and the three closed Jove regions, UUA-F4 mixed) every system's name and security,
  which `universeGraph.json` lacks; the stargate regions alone are 19 KB, 1.8 KB gzipped. `planets.json` came out byte-identical. A
  planet's name isn't in the static data, and the sort's order isn't the game's numbering (420 planets' `celestialIndex` differs), so the
  finder names none (Plan it here reads them from ESI as Plan does). The stargate map's securities are to 3 decimals: none of the 8,490
  systems crosses a band on that (checked 24 October 2026).
- **Where it's reached**: step 3 of the four (planets-flow.md): step 2's Next and step 4's Back open it in the region of Plan's system (the
  regions' chunk read on the click). The **Find the best system** buttons beside Plan's system chooser and the Chart's Plan it went on 25
  October 2026: they skipped step 2. The region otherwise is the address's, else the one kept per browser (`jita-ledger:planets-find-region`), else Plan's system's,
  else the home hub's. The good is the address's, else the one Plan is held to; the address's `good` holds Plan only on Plan, so the
  finder's choice never moves Plan until **Plan it here**, which sets Plan's system and holds it to the good.
- **What it runs** (`piFinder.ts`, pure): each system whose planets supply every P0 the good needs (`splitByP0` over `missingFor`; the
  rest counted with the P0 most lack, "11 lack Suspended Plasma, the commonest"), planned as Plan it plans one character: P0 → P1 for a
  P1, P0 → P2 and the feed for a P2, the feed for a P3 (`finderKinds`), held to the good (units first), `others: []`, the best by
  `rankSetups`. Not the chain (it spans characters, and is how a P4 is made: a P4 says so and runs nothing) nor bought (it uses none of
  the system's planets). Prices are Plan's morning pass (`usePlanetMarket` with no live reads): the lead figure is the good a day, ISK
  beside it for information. The good unpriced (no home hub, say) or a character that can't plan is said once, and nothing is run.
- **Since the four steps it runs across the characters ticked on step 2, in two phases** (planets-flow.md, 25 October 2026): the kinds that can make
  the good (`kindOptions`: the feed's and P0 → P2's as above, a factory character with two ticked, the chain for a P3 or a P4, which Find now
  runs), or the one pinned; each system planned for the factory character with the others ticked (`others`, no longer `[]`), ranked by the good
  a day across them (`teamFigure`: a one-character setup on each it suits, a team's or a chain's in all); every system screened, then those that
  could enter the top ten worked out in full (`flowSteps`). The rest of this bullet is the one-character case, as it ran before.
- **Rates and customs are each system's own** (`finderRateOf`, `finderTaxOf`): rates typed for that system over the learned ones by
  planet type, a planet's own first where a colony taught it (`rateFor`'s planet argument); customs at the system's own security and
  prefs (Brave's rates in null-sec, said once: "Brave's rates assumed in sovereign null-sec; a system that isn't Brave's may charge
  otherwise"; none assumed in high-sec, low-sec or wormholes, so those rows are "before customs", said with each 1%'s cost).
- **Sliced as Plan is** (`finderSteps` yields between the planner's own steps; the page runs 8 ms slices after 350 ms still): "Worked out
  23 of 62 systems…", the list growing, drawn at most every 150 ms (`DRAW_MS`), each row drawn once (`memo`, its rank a CSS counter, so
  rows landing above don't redraw it); for the same region, good and character, the last finished list stands while it's worked out again
  ("Working them out again: …"). Ranked by the good a day to a hundredth, then the fewest jumps from the home hub's system (`jumpsFrom`, any
  route; "–" with none), then name; a system that couldn't be worked out is listed under the table with its reason, never ranked at 0; one
  that makes the good but isn't valued ranks by its units, its ISK "–" with why.
- **A row says when its figure rests on a borrowed rate** (fix round 1, the review's Important 1; `rowOf`'s `borrowed`): "on a borrowed
  rate" under the good a day, its tip each line's planet type, P0 and whose rate it took (another type's, another P0's, or an assumed
  12,000), and a count line over the table. Only lines of the good's own P0s that it draws on count (not a P0 → P1 planet's other line,
  nor a feeder's `extra`): counting every line flagged every Storm system of the synthetic region on its Base Metals line.
- **Measured** (this machine, 24 October 2026, the user's real learned rates from their kept colonies, 5 planets at CCU IV, a 38-hour
  program; `.playwright-mcp/system-finder/real-rank.mjs`): Tenerifis for Gel-Matrix Biopaste, 62 of 81 systems planned in 300 ms cold
  and 222 warm (3.6 ms a system, the longest step 16 ms cold), Domain's 136 in 553 ms, A-R00002's 125 in 495, Coolant (P0 → P2 and the
  feed) in Domain's 185 in 805; none cut, so no finder budget was needed (`SEARCH_BUDGET` as Plan). In the page case's browser (dev build)
  Tenerifis takes about 1.0 s after the 350 ms wait, Domain about 1.9 s, with no long task during the run (one of 50–150 ms as the
  section's chunk first loads).
- **What it ranks first on the user's rates** (Tenerifis, Gel-Matrix Biopaste, jumps from UALX-3): DT-PXH (1 jump), 113.24 a day from a fed
  factory on 5 of its 9 planets; 6-IAFR, BW-WJ2, ZD1-Z2 after it at the same figure; every system makes 113.24, 109.91 or 108.00 by its
  planet types. 5-NZNW, where their colonies are, ranks 40th at 109.91 (108.00 without its planets' own readings, which raise it): DT-PXH's
  Storm planet extracts Suspended Plasma and Noble Gas, both needed, at the rates learned on Lava and Gas, where 5-NZNW's Lava line pairs
  Suspended Plasma with a P0 the factory doesn't use (Limits).
- **Tests**: check.mjs pins the bundle (5-NZNW's 12 planets carry ESI's type IDs, 5-NZNW and UALX-3 in Tenerifis, a wormhole region's
  names) and a synthetic region (a system lacking Suspended Plasma left out with it, the rest by units then jumps, a colony's planet at
  its own rate, customs by security, a typed low-sec rate), each planted wrong once and failing. The planets page case opens Find from
  Plan held to Gel-Matrix Biopaste at 5-NZNW: Tenerifis, the progress line clearing, 5-NZNW listed with its colony, the rows in order, no
  system or planet read from ESI (reads Plan started can land after the switch: a full run once counted 6 ESI reads during Find), no NaN
  or 0 for not known, the table not scrolling at 1440, Plan it here, and the Chart's button.

## Limits

State these rather than letting them be discovered.

- **A planet's richness isn't in the game's data**, so a system is planned on your learned rates by planet type and your own planets'
  readings where you have colonies: what it would give at your rates, never what its planets hold. **A planet type you've no colony on
  is planned on the same P0's rate learned on another type** (else another P0's, else 12,000 an hour assumed), as Plan plans it: a Storm
  planet at Lava's Suspended Plasma rate, which is why systems with one rank over 5-NZNW for Gel-Matrix Biopaste on the user's rates (each
  such row says "on a borrowed rate"). A
  planet you've measured as poor ranks under one nobody has measured, planned at your type's average. Systems alike in planet types tie,
  and the nearer goes first.
- **Not bought** (it uses none of the system's planets), and since the four steps every other kind, across the characters ticked (planets-flow.md).
  Prices are this morning's Jita books and the hub's last read, with no live read; the ISK is for information.
- **Brave's customs rates are assumed in every null-sec system outside wormhole space**, NPC null-sec too, unless marked not Brave's on
  Plan; **who owns each customs office or skyhook isn't known**, nor the sovereignty or your standings there: none is checked.
- **Jumps are any route by stargate from the home hub's system**, gate camps and danger unweighed; a wormhole or closed region has none.
