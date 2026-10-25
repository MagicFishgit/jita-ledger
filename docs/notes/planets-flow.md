# Planets in four steps: product, who and how, system, plan

Decisions worth not undoing. The Planets tab walked as four steps (`Planets.tsx`, `PlanetsSetup.tsx`, `src/lib/piFlow.ts`, `src/lib/piChar.ts`;
Find's two phases in `piFinder.ts`). The user (25 October 2026): "I think my first screen should be to pick a product and then it takes me to the
second screen to select the setup type I would like and letting me choose which characters I am going to include for this and then take me
to the system finder and after I have selected that show me the planner so I can build it", and "I also don't mind waiting while it is scanning
and calculating as long as when you click "next" to go to the next step you UI telling you it's busy working with progress." Find ranked every
system for one character, so on their rates almost every Tenerifis system tied at 113.24, 109.91 or 108.00 a day and went by jumps (DT-PXH
first, 7M4C-F about 18th), where a team's best is the systems with two or more planets of the scarce P0 (`factory-main/systems.md`).

- **The steps** (`SECTIONS`): **1 Product** (the Chart, `chart`), **2 Who and how** (`setup`), **3 System** (Find, `find`), **4 Plan** (`plan`), then
  Colonies apart, numbered in the section switch. The addresses and the kept section stay, so every deep link lands where it did, and the
  shortcuts stay: the Chart's Plan it (straight to step 4) and Find the best system, Find's Plan it here, Plan's Every product. Each step has Back
  and Next (`StepNav`, top, and at the bottom of steps 1 to 3), Next named for where it goes ("Next: plan it at 5-NZNW") and disabled with its
  reason, beside it and in its tip, until the step is complete (`goodWhy`, `setupWhy`, `systemWhy`): no good picked (or a P0), nobody ticked or the
  factory character not among those ticked, no system picked. Step 1's good is the Chart's own pick, else the good Plan is held to; its Next holds
  Plan to it, and Back from step 3 holds Plan to Find's good, so a `find?good=` link's good reaches step 2 (fix round 1). The tab's shell imports nothing of the planner but types (planets.md's chunk rule): the step rules are piFlow.ts's, which imports
  only `piChar.ts` (`PlanChar`, `planCharOf`, `charWhy`, moved out of piPlan.ts word for word, which re-exports them). Side hustles' chunk went
  from 498 KB (150 KB gzipped) to 505 KB (152 KB).
- **Step 2, Who and how** (`PlanetsSetup.tsx`, its own chunk): every character by account (`byAccount`), each with its planets, Command Center
  Upgrades level and clone state; one that can't do planetary industry (an Alpha, skills not read) listed, unticked and untickable, with why.
  Every one that can is ticked by default: the browser keeps who was **unticked** (`FlowChoice.unticked`, `jita-ledger:planets-flow`), so a
  character added later is ticked. **The factory character is Show for, and always ticked** (`flowChars`' `factory`; fix round 1): its box is
  checked and disabled, "the factory character", so steps 3 and 4 never plan with it left out however they're reached (Show for picked
  elsewhere, then the switch); the select lists those ticked, choosing it sets Show for, and a Show for that can't do planetary industry says
  so and Next waits. **The setup type**: the best for this team (default) or one kind pinned,
  with canMake's reasons on every planet type for the rest (`kindOptions` in piFinder.ts; a factory character needs two ticked); bought stays out
  of the choice and of Find, and Plan still shows it under "Or buy the inputs instead". A kept type that can't make the good gives way to the best
  for this team, said, and comes back with a good it can (`kindFor`). **Skills**: as they are, or everyone at Interplanetary Consolidation V and
  Command Center Upgrades V (`atV`: six planets and V for each character ticked; rates never touched), said on step 2, step 3's head (`find-whatif`),
  step 4's head (`plan-flow`) and every opened row's glance (`glance-whatif`). Its switch reads "Everyone at V", the skills in its tip and the line
  under it: the full words stuck out 339 px past a phone's edge and failed the deploy's check-phone (25 October 2026).
- **The choices are Plan's too, and the Chart's** (`usePlanning`'s `flow`, `flowTeam`): the planner plans for the factory character with the others
  ticked (`others`), at V with the what-if; Alphas and characters not read stay among the others as they are, so the chain and the team still say
  an Alpha could make one up once Omega. So the repeat line, the chain and the factory character count only those ticked, and one left out is said
  (`plan-flow`, `repeat-unticked`). Check my setup still reads every character doing planetary industry (what's built is checked whoever built
  it). **A kept plan is worked out with every character at their skills as they are, never the what-if** (fix round 1): its colonies stay with
  the characters it was kept for, a plan kept now rests on those skills, and with the what-if on its block says "Kept plans are worked out at
  your skills as they are, not the what-if" (`kept-whatif`) and no newer layout is offered (today's ranking is at V, the plan isn't). Keyed by
  value (`useStable`), so changing nothing works nothing out again.
- **What a setup makes across the characters ticked** (`teamFigure` in piFinder.ts): a factory character's and a chain's figure in all; a
  one-character setup's held good repeated on each character it suits (`repeat.n`, the repeat line's characters), with the repeat line's ISK.
  `bestForTeam`: the most of it to a hundredth, ties to the planner's order, bought never. Step 4 opens the pinned kind's row, or the best for the
  characters ticked, **tagged** ("Best for the 2 characters ticked", "Pinned on step 2"); the rank beside each row stays per character, as
  ranked before. On the page case's 5-NZNW (Owner and Planet Alt at III) the team opens at rank 2: the feed ranks first per character but suits
  only Owner.
- **Find across the team, in two phases** (`flowSteps`): each system planned for the factory character with the others ticked, ranked by the
  good a day across them (`rowOf`'s `team`), then jumps, then name as before.
  1. **Screen**: every cheap kind worked out in full (P0 → P1, P0 → P2, the feed, the chain: a few milliseconds each, a P4's chain more), and a
     factory character's **bound**: `teamBoundSteps` builds `planTeamSteps`' own problem (a shared preamble, `teamPrepSteps`, the search
     untouched) and solves `searchTeam`'s first programme alone (`rootBound`, its `boundR`). A system whose bound is no more than its cheap
     figure is exact at once.
  2. **Work out** the rest by bound, the highest first (then the nearer, then by name), each with the factory character's search in full,
     until each one left has a bound under the tenth best found, to a hundredth (`FLOW_TOP`): ties are worked out, so the top ten are exact
     wherever the searches finish. The rest are listed apart, "could make up to X a day: not worked out, ten do better" (`find-screened:`),
     never with the bound as a figure. One input a system, so phase 2 reuses phase 1's plans (`plansFor`'s memo).
  The progress is always said (`find-progress`: "Screening 62 systems: 23 of 62…", then "Working out the best: 4 of 12 (7M4C-F)…", the count of
  systems still able to enter, with a bar that a factory character's search moves within its system, `TeamMeter`), the list growing as rows
  land, and a line when done (`find-done`: "Done: 62 systems screened, 21 worked out in full in 31 s"). Picking a row picks the system (lit, and
  Next names it); "Plan it here" picks it and goes straight on; Plan's system chooser sits on step 3 too ("Pick it"), so a P4 or a region not
  worth scanning can go on by name. Find runs a P4 now (the chain is its kind).
- **Step 4's progress** (`progressSaid` in PlanetsPlan.tsx, `heldProgress` in planetsPlanning.ts; `ReadCount` from `useLiveRead` and
  `useHomeHistoryRead`, kept only when asked: Plan held to a good, never the Chart or Industry's finder, which would draw again for each read): one bar over Plan it's three passes (the morning's that
  names the goods to read, the reads, the live pass), "Working out which goods to price live…: 3 of 6", "Reading Jita's books: 9 of 14 and
  UALX-3's region's trading history: 3 of 14…", "Working out the setups: 5 of 6 (a factory character, 40% of its search)…". A factory character's
  search reports through `planSteps`' optional meter (its budget, read only; it can end before the budget does).
- **Measured on the user's real rates** (`.playwright-mcp/planets-flow/real-flow.mjs`, private; the three PI characters at five planets and
  Command Center Upgrades IV, the main the factory character, the best for this team, Tenerifis, Gel-Matrix Biopaste, this machine):
  - as they are: 62 screened in 0.5 s, 21 worked out in 31 s; nine systems tie at 452.95 a day (a factory character, two factory planets, every
    search cut), by jumps RH0-EG, ZD1-Z2, D-9UEV, EQWO-Y, XUDX-A, Y-EQ0C, 7M4C-F, F-ZBO0, T6GY-Y, then B-6STA; DT-PXH and three more at 439.65;
    5-NZNW, 6-IAFR and BW-WJ2 (one Suspended Plasma planet) screened at no more than 364.06 and not worked out. The research's 453.0 for 7M4C-F,
    Y-EQ0C, F-ZBO0 and D-9UEV, the same.
  - at V: 62 screened in 0.6 s, 21 worked out in 26 s; ZD1-Z2, D-9UEV, EQWO-Y, XUDX-A, Y-EQ0C, 7M4C-F, T6GY-Y and B-6STA at 606.76 a day on one
    factory planet each; the one-Suspended-Plasma systems exact at 364.06 (the bound is the repeated feed there), ranked 22nd to 33rd.
- **Tests**: check.mjs pins the steps' rules, the what-if (six planets and V for each ticked, the rates its lines run on unchanged), an unticked
  character out of the repeat line, the chain and the team, and the two phases against every system worked out in full on a synthetic region
  (six systems of one to three Suspended Plasma planets, tops of 1, 2 and 4: equal rows wherever no search was cut, no bound under its figure,
  none unworked that could have entered), at least one comparison run with nothing cut, a run pinned to a factory character, and the default top
  ten leaving two systems unworked without a search; each rule planted wrong failed it. The page case walks the four steps in a synthetic region of three
  real systems (the regions' chunk answered with one more): Next disabled with its reason, the busy states with their counts seen, ZD1-Z2 (two
  Suspended Plasma planets) over BW-WJ2 and 5-NZNW for Owner and Team Alt, the what-if said, an Alpha untickable, the factory character's box
  checked and fixed, an Alpha as Show for holding Next, Back from a `find?good=` link keeping the good, nothing sideways at 1440.

## Limits

- **Systems tie**: on the user's rates nine Tenerifis systems make 452.95 a day for three characters, each search cut, and jumps decide; a
  planet's richness isn't known (planets-finder.md), so the systems differ in the model only by their planet types.
- **The top ten are exact only where the searches finish**: a factory character's search cut short is the best tried (piTeam.ts), so a
  system worked out can read under what it could make, and one screened out had its bound, not its best, under the tenth.
- **Phase 2 takes a second or two a system**: about 30 s for Tenerifis with three characters, longer with more; changing a choice starts it
  again (the last list stands meanwhile).
- **The what-if is skills alone**: each character at six planets and Command Center Upgrades V, its learned rates as they are (never scaled by
  heads), its clone state as read.
- **Step 4's rank is per character, as before**: the row opened is the best across the characters ticked, which can sit below a row that
  makes more per character.
