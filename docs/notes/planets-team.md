# Planets: a factory character

Decisions worth not undoing. Plan's sixth setup kind, `team`, "A factory character" (`src/lib/piTeam.ts`; its lines in
`PlanetsTeam.tsx`, its board in planetBoard.ts and PlanetBoard.tsx): the character shown makes a P2 or P3 on factory planets of its own,
fed by every character doing planetary industry. The user (25 October 2026): "What if I used my main as a factory only character … and
then have all my alts now and in the future produce materials which I then contract to my main and dump them into factory planets", and
of the page: "No need to show all build types fully extended at once. They can be collapsed and then I can pick the ones that can
actually work and extend them to see more detail." The research (`.playwright-mcp/planets-build/factory-main/report.md` and `systems.md`,
gitignored; its solver `team2.mjs`, a branch and bound over `lp.ts`) found pooling every character's feeders into one character's factory
planets makes about 10% more than each repeating its own fed factory, and a factory-only main loses (it gives up its own feeders). The
brief is `.superpowers/sdd/2026-10-17-planets/team-dispatch.md`. The rest of Plan is in planets.md, planets-planner.md and
planets-searches.md, the board in planets-board.md, a kept plan in planets-kept.md.

- **When it's offered** (`planTeamSteps`): under Plan it alone, held to a P2 or P3 (`NO_ONLY`, "A factory character plans one good: hold
  Plan to a P2 or a P3 (Plan it, on the Chart)"; a P4, "its factory planets make P2 and P3 only (a P4 is the chain’s)", `SELLS.team`),
  with two characters or more doing planetary industry, counted as the repeat line counts them (skills read, not Alpha; a clone not read
  planned as Omega), else `teamTooFew` ("A factory character needs two characters doing planetary industry: one here does"). The Chart's
  "can make" says it with `TEAM_WHEN`.
- **Who does what**: the factory character is the one shown. Its factory planets are Advanced factories at its level beside one launchpad
  (`sitesOf`, `maxFactories` on the planet's own radius), on any planet whose type runs the good's and its P2s' schematics, as few as hold
  the run; P2 made on one may feed the good on another. Every character, the factory character's other planets too, feeds from the
  planner's single-planet plans at its own level and planets (`optionsAt`: `plansFor`'s P0 → P1, and for a P3 the P0 → P2 of a P2 it
  takes, F9's ways at that level on the rates Plan uses, each planet's own first), one colony a planet a character, a plan matched or beaten
  on every good and on ISK by another on its planet dropped. Characters alike in level and planets are one group to the search
  (`groupsOf`), its colonies dealt to them planet by planet in roster order (`realised`).
- **The order it judges in** (`TeamKey`, `weighted`): the good a day across the team, then the fewest factory planets, then the fewest
  colonies, then ISK (each plan's ships at their first unit's net after its export tax). One figure for the programme and every comparison:
  R − 0.001 × factory planets (`W_SITE`, so a hundredth of a unit outweighs the six the factory character could take) − a colony's weight
  × colonies + an ISK weight × ISK, the last two each problem's own (`weightsOf`): every colony the team could run under half a factory
  planet (0.00001 each up to 50), the team's most ISK under half a colony. A fixed trillionth an ISK didn't hold (the review, 25 October
  2026): 30 colonies of a million ISK a day weighed three colonies, so a colony more with more ISK could come first; check.mjs has that case,
  and the old weight planted fails it. The good is valued as Plan it values it (`heldInput`: its first unit's net, no cap).
- **The rate** (`teamRate`): the most of the good a day whole factories make from what's shipped, each P2 the good takes shipped in first,
  the rest made from P1, each kind of factory rounded up within what the factory planets hold; stepped down from the smooth rate
  (`smoothRate`, fractional factories) by the factories' breakpoints, so a P1 in plenty can't send it looking from a huge figure.
- **The search** (`searchTeam`, a step at a time; `TEAM_BUDGET` 3,000,000, a programme `LP_COST` 400):
  1. the linear programme over colonies, factories and factory planets (`lpOf`) bounds the good a day (`boundR`, factory planets free) and
     names each count's likeliest sets of factory planets;
  2. the sets searched: every set while there are at most `ALL_SETS` (120), else each count's likeliest, their neighbours and the best's,
     each with its own bound;
  3. simulated annealing within the `REFINE_SETS` (6) sets of highest bound and each count's highest (`ANNEAL_STEPS` 100,000 a run, seeded,
     so the same inputs give the same answer), then the `AGAIN_SETS` (3) that came out best `AGAIN_RUNS` (5) times more, each answer
     polished (steepest ascent on the smooth rate and each P1's limit, then a two-for-one trim of colonies that add nothing);
  4. a branch and bound on each set, the highest bound first, factories branched before colonies, sharing `TEAM_NODES` (1,500). A branch
     fixes factory planets: with them free in the programme an up-branch on a factory count read infeasible.
  `done` when the bound is reached or every arrangement ruled out; `cut` when one not ruled out could make more than half a hundredth more
  (`UNITS_SLACK`), said as "the best of the arrangements tried" with "no arrangement here makes more than X a day (the linear programme’s
  bound)". Why not the reference's way: `team2.mjs` takes 3–5 minutes a system (40,000 nodes for each count of factory planets, then a local
  search); local search, kicks and dives alone stalled 1–2% under it (7M4C-F's 777 for five characters), annealing within a set reached it.
- **The setup** (`teamSetup`): the good's factories dealt over the factory planets by what each holds (`dealt`, the largest remainders),
  P2 a factory planet makes past its own need carried to one short of it; every P1 drawn from the feeders fill-first (the lowest customs
  rate, the planet listed first, roster order), as the feed draws; what's left offered to market where a unit pays to ship (Ruling T15-5)
  and sold once. Customs: export at each feeder on all it ships, import at half on each factory planet, export there of the good and of P2
  carried between them.
- **Its figures** (`TeamFigures`, drawn by `TeamLines`):
  - each character's part: its colonies, what it hands over a day (in the good's worth, the goods and m³) and what it must train to fit
    its planets as planned; the m³ a day the others hand the factory character ("in contracts docked");
  - each factory planet's load ("runs at 82% of what fits: 18 of the 22 Advanced it holds") and the days its launchpad holds of its intake;
  - the fill count (`fillOf`, `fillProblem`): the factory planet holding most, fed by the fewest P0 → P1 colonies at the level most
    feeding characters are at, held to what it makes from P1 alone, a search of its own (`FILL_BUDGET` 300,000, up to `FILL_CHARS` 12
    colonies a planet); then "Convert another planet when these run full: at about N more feeder planets" (the factories spare over what
    one feeder takes of a full one's), the user's own plan of converting the main's planets one at a time as alts join;
  - against each repeating its own fed factory (the feed row's repeat line, units held to no market on both sides): "+34 a day, 10% more
    than each of you repeating your own fed factory"; where the feed suits only some of the team, "+X a day against the fed factory
    repeated on the one of your 2 characters it suits (… a day); this counts both, each at its own level and planets".
- **The page**: a row like every kind's, folded until opened (only the best opens by itself, planets-board.md; the page case checks it
  with the team's row among them). Its head says the good a day "in all" and ISK "in all at today’s price"; the glance the good a day across
  the team, ISK a day, a week and a month in all, the share against the months of Omega of its accounts (`accountCount`, a character whose
  account isn't set its own), planets used ("8 of 10 planets across 2 characters"), resets a character. Its board is `layout: 'team'`
  (planets-board.md): the factory planets stacked on the right (`data-board="factories"`), the feeders on the left a group a character,
  the factory character's first, each folded to one line until opened ("Willi Wakkerr (Account 2) · 5 planets", then what it sends, "Plasmoids
  3,236, Water 4,900 a day"), a line from each group to the factory column labelled with its m³ and the good a day it's worth (`group-edge:`). Build it
  and Check my setup on every card, for the card's own character, as a chain's. A feeder making a P2 says so on its card ("As well: Ships Biocells
  240 as well as its P1"), and Build it routes it "as well as its P1".
- **Keep this plan** keeps it as a chain (each colony with its character; `layoutKey` with the character; `MAX_KEPT_PLANETS` 120, 40
  before, for a team's colonies). `keptTeam` works it out on today's inputs, the kept factories its cap (`fixed`); shown for a character
  that isn't its factory character it says "This plan’s factory planets are another character’s: show it for X". A newer layout is offered
  as for every kind (planets-kept.md).
- **Measured on the user's real rates** (`.playwright-mcp/planets-team/compare.txt` and `timing.txt`, gitignored: Gel-Matrix Biopaste,
  CCU IV, 5 planets a character, the main at 5 or 6, against `team2.mjs`'s figures in each system's `team2-sys-<system>.json`):
  - where the research proved its answer (one Suspended Plasma planet: 5-NZNW, 6-IAFR, BW-WJ2), every figure the bound, not cut: 5-NZNW
    364.1 a day for three characters on 2 factory planets, 485.4 for four, 728.1 for six; one factory planet full at 216 a day on 8 P1
    feeders, the research's;
  - elsewhere (8 systems, the research's best found, not proven), 63 of 64 cases equal or above it (up to 7%): 7M4C-F 453.0, 623.1, 782.7
    and 963.7 for three to six with the main at 5 (the research's 453.0, 612.0, 777.0, 947.1), 7 feeders filling a factory planet there.
    DT-PXH with the main at 6 and six characters reads 947.1 against its 955.0 (−0.8%): the research's arrangement reads 954.96 in this
    model, so it's the search's miss, not a different model; a bigger budget doesn't find it (12 M and 30 M: 947.1), more annealing does
    (`AGAIN_RUNS` 20, 4.3 s; `REFINE_SETS` 20, 2.5 s) and `REFINE_SETS` 8, 10, 12 or 16 doesn't (946.5–947.1): the draws, not a rule;
  - time through the planner (this machine): 1.5–2.0 s a run for 3, 4, 6 and 10 characters in 5-NZNW, DT-PXH and 7M4C-F (10 of mixed IV
    and V: 5-NZNW 1213.5 at the bound, DT-PXH 1755.0 and 7M4C-F 1860.9 cut), about 10,500 steps, the longest 12–15 ms (the first programme,
    cold), the rest under 7 ms. Plan it works it out twice, on the morning's books and then the live ones.
- **check.mjs** (synthetic rates and the page case's fixture only): `teamRate` against a bisection on its rule (400 random shipments); the
  search against an exhaustive one on 24 small random teams (2–3 characters, 3–4 planets, factory planets of 4–22 Advanced), every one
  finished and equal (the good a day, factory planets, colonies, ISK), and the branch and bound alone the same; units first, then the
  fewest factory planets; the fill count against every count; through the planner on 5-NZNW's fixture its reasons, a colony a planet a
  character, the factory planets the shown character's, customs summed role by role, the parts, the fill (216 a day on 21 of 22 Advanced,
  11 feeders) and a kept plan worked out again; and a colony against 30 M ISK a day of another, equal in units and factory planets. Planted wrong, each failed: the factory planets' weight's sign, imports at the full rate, one
  character planned, a group past its planets, a P4 allowed, colonies unweighted, the fill on P2 feeders or on the smallest planet. Not
  branching on factories first didn't (the annealing finds those cases anyway). The recorded steps fixture (`planets-steps.json`) is
  compared for the five kinds it was recorded with; the team kind postdates it.
- **The chunk**: Plan's chunk holds piTeam (251 KB, 89 KB gzipped). Planets.tsx took `regionOf` from piFinder, which imports piPlan, so
  since Find the whole planner rode in the Side hustles chunk every tab loads (main: 586 KB, 182 KB gzipped); `regionOf` is piBundle's now
  (piFinder re-exports it), and Side hustles is 498 KB (150 KB).

## Limits

State these rather than letting them be discovered.

- **Depletion is shared between characters by area** (CCP Omen, Incursion 1.1.0, 28 January 2011: "The only way two players affect each
  other is indirectly via the depletion layer"; forum reports of alts on one hot spot depleting each other), yet each character's colony
  is planned at the planet's rate as if alone, and the team packs the best planets (5-NZNW's one Suspended Plasma planet, a colony a
  character). The user's one snapshot showed no visible loss with three characters on II and VII; a fourth there is untested.
- **Never two extractors on one P0 on a planet**: heads on the same hot spot deplete it faster (the same 2011 note), and the research's
  two-Suspended-Plasma colony only "found more" by assuming the second extractor yields like the first.
- **A search cut short is the best of what was tried**, 2–4% under the programme's bound where a system has more than one planet of the
  scarcest P0; seeded, so the same inputs give the same answer, but a small change of inputs can land about 1% apart (DT-PXH six: 947.1
  where 955.0 exists). The fewest colonies and the ISK are proven only when `done`; units first holds within the weights' slack.
- **A P2 good's feeders make only P1**: a planet making the good itself as a P0 → P2 colony isn't among the plans, so a P2 is made on the
  factory planets alone.
- **The fill count is one level's, on P0 → P1 feeders alone**; a feeder making a P2 beside its P1 saves factories, so a factory planet can
  make more than it says. The convert line rests on it.
- **Hauling between characters isn't costed**: the user hands goods over by contract in one system (a Squall); its m³ is said.
- **Within a group of characters alike in level and planets**, which character runs which colony is roster order: any deal of them is
  as good.
- **Find stays one character's** (planets-finder.md): a system is ranked for the character shown, never a team; a team mode for Find can
  follow.
- **The feed's search keeps one layout per pair of P0s** (`fedCtx`, planets-searches.md), which the research found costs 114.4 against
  121.4 at 6 planets: known and left alone. The team's feeders take every layout F9 gives.
- **A kept team plan rides the `planets` doc**, which an older build's save drops (planets-kept.md).
