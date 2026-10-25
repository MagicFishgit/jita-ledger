# Planets: the planner

Decisions worth not undoing. How Plan ranks a system's setups (`src/lib/piPlan.ts`); the prices it sells and buys at, the bought
setup's exact sizing (`lp.ts`) and the upkeep are in `planets-market.md`, the feed, the chain and the searches in
`planets-searches.md`. The data, the `planets` document and the page are in `planets.md`, the colonies in
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
  median); a line whose heads aren't known (no rate, or 0: the colony didn't say) sits on the median of your learned rates' heads
  (Ruling T15b-5, `assumedHeads`, `PlanInput.heads`: "at 5 heads, the median of your extractors' learned rates"), **capped at the
  most heads that leave room for its rates' layout** where the plan must fit (Ruling T15b-8, `capHeads`: "at 7 heads: your
  extractors' median is 10, and no more fit beside its factories"); when even one head a line leaves none, and with nothing
  learned, the most that fit, said ("at the most heads that fit beside its factories", Ruling T8-1). **A line on another P0's
  learned rate or a typed one whose known heads leave no room for the least layout** (a Basic a line, an Advanced for P0 → P2) is
  set aside as unknown (Ruling T15b-12, `setAsideBorrowed`; one at a time, the most heads first, only while their heads are the
  cause, the review of Task 15c): the assumed 12,000 an hour on the capped median, said ("another P0's
  rate is at 10 heads, more than fit here, so …"), never scaled and never ranked unbuildable for it; a line on its own learned
  rate keeps its heads (its colony had them). A rate from programmes of another length says "rates from N-day
  programs". Every output is valued, a surplus P1 too; a price nobody reads leaves it unvalued and counted (`unvalued`), never 0.
- **What doesn't fit is judged a planet at a time** (Ruling T11-2). `Role.lacks` comes from that planet's own fit (`fitted`,
  `levelFor`), never the character's union: a Barren at 10 heads that fits at no level beside a Lava that fits at V read "train
  Command Center Upgrades V" for both. A layout that doesn't fit is still ranked and said (the spec).
- **P0 → P1 and P0 → P2: greedy, then a pick taken first gives way** (Ruling T8-2). Greedy by marginal value (what a pick adds to
  what's already sold, less its tax), then `improve`: re-pick a chosen planet, swap in an unused one, and re-pick a planet sharing
  a good jointly, until nothing gains (`MAX_MOVES` 50). The greedy alone read 2,605,440 on the review's case where 4,525,440 was
  there (Test Cultures capped at 240 a day on Temperate). Measured 3–6 ms (P0 → P2) and 32 ms (P0 → P1) on 12 planets. With F9's
  candidates the searches compare by `scoreOf` (assess's figure alone) and pair planets only on goods offered: 5–7 and 25–27 ms
  warm on 5-NZNW at the real rates (Task 15b; 3 and 31–35 before it, 61 and 124 with F9's candidates and no `scoreOf`). No gate
  exercised this search until Task 15b's fix round set it against a brute force on F9's candidate sets (`single-brute.mjs`: Task 8's
  12-planet shape at 15,000–20,000 an hour and 5 heads, CCU IV, random prices and caps, P0 at a loss or unpriced; every set of 2 and
  3 of the 12 planets and of 4 of the first 6, P0 → P1 and P0 → P2, seeds 1–8 × 5): 240 of 240 equal.
- **A factory character** (the sixth kind, `team`, Plan it only): one character's factory planets fed by every PI character, in planets-team.md.
- **A plan kept** (planner fix 2) is shown worked out on today's inputs, its planets never moving, with today's ranking folded under it and a
  newer layout offered only past 5% more of the good; Plan it's rows are the live pass's alone: planets-kept.md.
- **The ranking** (`rankSetups`): ISK a day rounded to the cent, then less upkeep (a chain's per character), then the order run,
  so it's transitive. P0 → P2 always shows. Plan it (planner fix 1): the held good's units a day first, to a hundredth (a chain's per
  character), then as above; bought is drawn apart, below.
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
  14.78 M, 57.08 M under it. The whole planner 148–240 ms with one character doing PI (task-11-rereview-4.md). Since F9 (read off
  the page on 19 October 2026, the same with and without the median heads of T15b-5): P0 → P2 16.94 M (14.82 M with the colony at 5
  heads an extractor), feed 15.02 M, P0 → P1 13.72 M, bought 71.86 M. Those figures hid that, at the seeded colony's median of 10
  heads uncapped, every unrated planet fit at no level (T15b-8): the page case now asserts none does, and the planner-in-steps check
  that every planet of P0 → P1, P0 → P2 and the feed fits. T15b-12 moved them at 10 heads (P0 → P1 12.16 M, P0 → P2 13.97 M, feed
  14.32 M): Barren planets borrowing the 10-head rate had been ranked on a layout that fit at no level; at 5 heads unchanged.
  Setting aside one borrowed line at a time (Task 15c's fix round) left the other's 16,617 an hour: P0 → P1 12.70 M, feed 14.44 M.
- **Moved to notes of their own on 19 October 2026** (Task 15c; the notes budget: Planets.tsx loaded 138,720 of 140,000): what a
  good is valued and bought at, the bought setup's exact sizing and the upkeep are in `planets-market.md`; the feed, the chain and the
  searches' budget and steps in `planets-searches.md`.

## Limits

Moved here from limits.md on 19 October 2026: state these rather than letting them be discovered.

- **Plan it's rows wait for the slowest live read**, and a kept plan's factories cap what it makes (planets-kept.md).
- **A line whose heads aren't known** (no rate, or every extractor of that type and P0 said none) sits on the median of your
  learned rates' heads (Ruling T15b-5), **capped at the most that leave room for its rates' layout** (Ruling T15b-8): a learned rate
  is credited whole to them, and an assumed 12,000 an hour is two Basics' worth set on a head count your own extractors run, or the
  most under it that fit beside those Basics; what that planet gives at that count isn't known. T15b-5 put the median first: at a
  median of 10, 20 heads beside a launchpad left room for no layout on any of 5-NZNW's planets at CCU IV, so every unrated planet
  fit at no level, while its figures stayed the same (the round claimed every layout fitted beside 20 heads; it didn't). Capped,
  the rates' layout comes first and the heads give way, said: beside a colony's storage, an unrated Base Metals line runs on 3 heads
  under a median of 5, beside 3 + 2 Basics and 2 Advanced. **When even one head a line leaves no room for it, and with nothing
  learned,** one head a line is reserved while F9 sizes the factories, and `fitted` fills in the most heads that fit after, said on
  the line ("at the most heads that fit beside its factories"; before Task 15c a line with no rate didn't say it). **A rate learned
  for that P0 keeps its heads** where they leave no room (said with what it lacks); another P0's or a typed one is set aside then
  (T15b-12), ranked on an assumed rate, not the borrowed one's yield.