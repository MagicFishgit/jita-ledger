---
paths:
  - "src/lib/piTeam.ts"
  - "src/components/hustles/PlanetsTeam.tsx"
---

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

The rest of Plan is in `docs/notes/planets.md`, `docs/notes/planets-planner.md` and `docs/notes/planets-searches.md`, the board in
`docs/notes/planets-board.md`.

- **When it's offered** (`planTeamSteps`): under Plan it alone, held to a P2 or P3 (`NO_ONLY`, "A factory character plans one good: hold
  Plan to a P2 or a P3 (Plan it, on the Chart)"; a P4, "its factory planets make P2 and P3 only (a P4 is the chain’s)", `SELLS.team`),
  with two characters or more doing planetary industry, counted as the repeat line counts them (skills read, not Alpha; a clone not read
  planned as Omega), else `teamTooFew` ("A factory character needs two characters doing planetary industry: one here does"). The Chart's
  "can make" says it with `TEAM_WHEN`.
- **Who does what**: the factory character is the one shown. Its factory planets are Advanced factories at its level beside one launchpad
  (`sitesOf`, `maxFactories` on the planet's own radius), on any planet whose type runs the good's and its P2s' schematics and holds a
  whole set, as few as hold the run. Every character, the factory character's other planets too, feeds from the planner's single-planet
  P0 → P1 plans at its own level and planets (`optionsAt`: `plansFor`'s, F9's ways at that level on the rates Plan uses, each planet's own
  first), one colony a planet a character, a plan matched or beaten on every good and on ISK by another on its planet dropped. Characters
  alike in level and planets are one group to the search (`groupsOf`), its colonies dealt to them planet by planet in roster order
  (`realised`).
- **Feeders make P1 only, and every factory planet is whole sets of its own** (Rulings F26 and F27, 27 October 2026; team-p1-dispatch.md).
  The user, having built the first plan: "for the factory character setup i don't want p2 on the p1 factory planets and the total
  factories it wants me to build on the factory planets are crazy and wouldn't balanance out", and of their own build, "this is what I
  consider a good setup". F22 had let a feeder make a P2 beside its P1 and dealt the factories over the factory planets in proportion,
  carrying P2 between them, so a factory planet's counts read off balance (say 8 Oxides, 5 Biocells, 7 Superconductors and 3 of the good)
  and the plan asked for Advanced on feeders they don't build. Now `optionsAt` offers no plan with an Advanced; a set is one factory of the
  good and, for each P2, the Advanced that make what it takes (`recipeOf`'s `set`, rounded up: a P3 takes 10 of each P2 an hour, an Advanced
  makes 5, so two a P2, Gel-Matrix Biopaste's set 7; a P2 good's, one Advanced); each factory planet holds `floor(holds ÷ set)` sets
  (`setsIn`), filled in turn with as many as the run takes, the last running fewer cycles, nothing carried between them. The programme and
  every comparison use the sets' capacity planet by planet: two factory planets of 25 Advanced at V hold 3 sets each, 6, not the 7 their 50
  together would (check.mjs: 432 a day, not 504). So the factory count is no longer a variable: the programme loses its factory variables,
  the branch and bound branches on colonies alone, and the rate is `min(sets × the set's day, what the P1 allow)`, with no step to step down.
  A card and Build it say the counts as the user builds them ("6 Oxides, 6 Biocells, 6 Superconductors, 3 Gel-Matrix Biopaste: 21 of the 22
  Advanced it holds", `factoryCounts`). A plan kept before reads the whole sets its kept counts make (`keptSets`), and a feeder of it that
  made a P2 still says "As well"; nothing new draws it.
- **The order it judges in** (`TeamKey`, `weighted`): the good a day across the team, then the fewest factory planets, then the fewest
  colonies, then ISK (each plan's ships at their first unit's net after its export tax). One figure for the programme and every comparison:
  R − 0.001 × factory planets (`W_SITE`, so a hundredth of a unit outweighs the six the factory character could take) − a colony's weight
  × colonies + an ISK weight × ISK, the last two each problem's own (`weightsOf`): every colony the team could run under half a factory
  planet (0.00001 each up to 50), the team's most ISK under half a colony. A fixed trillionth an ISK didn't hold (the review, 25 October
  2026): 30 colonies of a million ISK a day weighed three colonies, so a colony more with more ISK could come first; check.mjs has that case,
  and the old weight planted fails it. The good is valued as Plan it values it (`heldInput`: its first unit's net, no cap).
- **The rate** (`teamRate`): the most of the good a day the factory planets' whole sets make from what's shipped, `min(A × xDay, what the
  P1 allow)` with `A` the sets (Ruling F27); a P2 shipped in (only a plan kept before F26 ships any) first, the rest made from P1. The
  annealing's figure adds a share of the P1s' limits on average (`spreadRate`), so a move toward the next P1 short counts.
- **The search** (`searchTeam`, a step at a time; `TEAM_BUDGET` 3,000,000, a programme `LP_COST` 400):
  1. the linear programme over colonies, factories and factory planets (`lpOf`) bounds the good a day (`boundR`, factory planets free) and
     names each count's likeliest sets of factory planets;
  2. the sets searched: every set while there are at most `ALL_SETS` (120), else each count's likeliest, their neighbours and the best's,
     each with its own bound;
  3. simulated annealing within the `REFINE_SETS` (6) sets of highest bound and each count's highest (`ANNEAL_STEPS` 100,000 a run, seeded,
     so the same inputs give the same answer), then the `AGAIN_SETS` (3) that came out best `AGAIN_RUNS` (5) times more, each answer
     polished (steepest ascent on each P1's limit, then a two-for-one trim of colonies that add nothing);
  4. a branch and bound on each set, the highest bound first, on the colonies, sharing `TEAM_NODES` (1,500), the factory planets fixed.
  `done` when the bound is reached or every arrangement ruled out; `cut` when one not ruled out could make more than half a hundredth more
  (`UNITS_SLACK`), said as "the best of the arrangements tried" with "no arrangement here makes more than X a day (the linear programme’s
  bound)". Why not the reference's way: `team2.mjs` takes 3–5 minutes a system (40,000 nodes for each count of factory planets, then a local
  search); local search, kicks and dives alone stalled 1–2% under it (7M4C-F's 777 for five characters), annealing within a set reached it.
- **The setup** (`teamSetup`): each factory planet its whole sets, filled in turn (Ruling F27), each making its own sets' share of the good
  from its own P2; every P1 drawn from the feeders fill-first (the lowest customs rate, the planet listed first, roster order), as the feed
  draws; what's left offered to market where a unit pays to ship (Ruling T15-5) and sold once. Customs: export at each feeder on all it
  ships, import at half on each factory planet, export there of the good.
- **Its figures** (`TeamFigures`, drawn by `TeamLines`):
  - each character's part: its colonies, what it hands over a day (in the good's worth, the goods and m³) and what it must train to fit
    its planets as planned; the m³ a day the others hand the factory character ("in contracts docked");
  - each factory planet's load in sets ("5-NZNW XI: 2 of the 3 whole sets it holds (4 Oxides, 4 Biocells, 4 Superconductors, 2 Gel-Matrix
    Biopaste: 14 of the 22 Advanced it holds), 144 Gel-Matrix Biopaste a day, 67% of what its sets make") and the days its launchpad holds of
    its intake;
  - the fill count (`fillOf`, `fillProblem`): the factory planet holding the most whole sets, fed by the fewest P0 → P1 colonies at the level
    most feeding characters are at, held to what its sets make, a search of its own (`FILL_BUDGET` 300,000, up to `FILL_CHARS` 12 colonies a
    planet); then "Convert another planet when these run full: at about N more feeder planets" (what the sets could make past what they
    make, over what one feeder adds to a full one), the user's own plan of converting the main's planets one at a time as alts join;
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
  and Check my setup on every card, for the card's own character, as a chain's. A factory planet's card and Build it lead with its counts.
- **A team plan kept before feeders made P1 only and factory planets ran whole sets is drawn as kept, noted, and the newer layout offered** (Ruling
  F27-1, `keptTeam`, `Setup.kept.legacy`, `newerThan`; the review of team-p1). `keptTeam` rebuilds colonies and factories from the kept layout,
  so a plan kept under F22 still drew a feeder's Advanced, the board's "As well" and factory counts off balance, running only their whole
  sets: the user keeps plans while building, so it was the likeliest first thing opened after the deploy. The user's kept plans never move by
  themselves, so it isn't altered or dropped: it carries "Kept before feeders made P1 only and factory planets ran whole sets: its feeders’
  P2 and its factory counts are as you kept them. Use the new one for today’s layout", and `newerThan` offers today's best beside it whatever
  `KEEP_MARGIN`, when it's another layout. A plan in whole sets with P1 feeders gets neither. check.mjs: off-balance counts and a P0 → P2
  feeder (planted without the mark, both failed), and a whole-sets plan with neither. `between` in `teamSetup` stays for exactly such a plan.
- **Keep this plan** keeps it as a chain (each colony with its character; `layoutKey` with the character; `MAX_KEPT_PLANETS` 120, 40
  before, for a team's colonies). `keptTeam` works it out on today's inputs, the kept factories its cap (`fixed`); shown for a character
  that isn't its factory character it says "This plan’s factory planets are another character’s: show it for X". A newer layout is offered
  as for every kind (planets-kept.md).
- **Against the user's own build** (27 October 2026; the probes and their figures are in `.playwright-mcp/planets-team-p1/` and
  `.superpowers/sdd/2026-10-17-planets/team-p1-report.md`, both gitignored, since they read the user's private colonies). Their system is
  EQWO-Y (30004835; the brief named it 7M4C-F). In this model their own build (four factory planets of 6/6/6/3, three Basics a line on every
  alt feeder) makes exactly what its four planets' whole sets take. The planner keeps their 6/6/6/3 planets and their P0 → P1 feeders, and
  plans a fifth factory planet on the main's Gas feeder, because their lines are learned well past what three Basics take and a fourth
  Basic fits where it does at CCU IV; on three Basics a line, four factory planets are all their supply fills.
- **The research's P0 → P1 checks** (`team2.mjs`'s `feed: 'p1'` runs): 5-NZNW's figures for three and four characters are the research's,
  as is one factory planet full on 8 P1 feeders there, 7 elsewhere; where the research put four characters' run on two factory planets at V
  carrying P2 between them, it takes three here (two of 25 hold 6 sets). 7M4C-F's four P1 runs equal the solver's under the same rule.
- **check.mjs** (synthetic rates and the page case's fixture only): a set's size and the sets 20, 22 and 25 Advanced hold; `teamRate` against a
  bisection on its rule (400 random shipments and counts of sets); the search against an exhaustive one on 24 small random teams (2–3
  characters, 3–4 planets, P0 → P1 plans, factory planets of 1 to 3 sets), every one
  finished and equal (the good a day, factory planets, colonies, ISK), and the branch and bound alone the same; units first, then the
  fewest factory planets; the fill count against every count; through the planner on 5-NZNW's fixture its reasons, a colony a planet a
  character, the factory planets the shown character's, customs summed role by role, the parts, the fill (216 a day on 21 of 22 Advanced,
  11 feeders) and a kept plan worked out again; and a colony against 30 M ISK a day of another, equal in units and factory planets; two
  factory planets of 25 make 432 a day, not 504; every plan offered a feeder P0 → P1; each factory planet whole sets of its own, on the fixture
  and with three characters on several. Planted wrong, each failed: the factory planets' weight's sign, imports at the full rate, one
  character planned, a group past its planets, a P4 allowed, colonies unweighted, the fill on P2 feeders or on the smallest planet; since
  F26 and F27, a P2 feeder offered again, the P2 factories put on one planet, the sets counted over the factories together. Not
  branching on factories first didn't (the annealing finds those cases anyway). The recorded steps fixture (`planets-steps.json`) is
  compared for the five kinds it was recorded with; the team kind postdates it.
- **The four steps' synthetic region** (check.mjs, planets-flow.md) runs at 5 heads a line since F26: at 8, one Basic fit a line on its
  6,000 km planets, so every P1 feeder made 960 whatever its rate and no factory character beat the fed factory repeated; its two Lavas
  systems have four planets, so their bound stays under the tenth best.
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
  scarcest P0; seeded, so the same inputs give the same answer, but a small change of inputs can land about 1% apart (before F26, DT-PXH
  with six characters missed the research's best by 0.8%). The fewest colonies and the ISK are proven only when `done`; units first holds
  within the weights' slack.
- **Feeders make P1 only** (Ruling F26): a planet making a P2 (or a P2 good itself) as a P0 → P2 colony isn't among the plans, though in
  some systems one pays (the research: in 7M4C-F, P1-only feeders make about 15% less); the user builds P1 feeders.
- **Every factory planet is whole sets** (Ruling F27): factories past the last whole set a planet holds stay unbuilt (22 Advanced hold 3
  sets, 21 of them), and no P2 is carried to fill another planet's spare room.
- **The fill count is one level's, on P0 → P1 feeders**, and the convert line rests on it.
- **Hauling between characters isn't costed**: the user hands goods over by contract in one system (a Squall); its m³ is said.
- **Within a group of characters alike in level and planets**, which character runs which colony is roster order: any deal of them is
  as good.
- **Find runs a factory character since the four steps** (planets-flow.md): screened by `searchTeam`'s first programme (`rootBound`), worked out
  in full only for the systems that could make the top ten.
- **The feed's search keeps one layout per pair of P0s** (`fedCtx`, planets-searches.md), which the research found costs 114.4 against
  121.4 at 6 planets: known and left alone. The team's feeders take every layout F9 gives.
- **A kept team plan rides the `planets` doc**, which an older build's save drops (planets-kept.md).
