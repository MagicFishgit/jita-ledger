# Industry

Decisions worth not undoing. The Industry side hustle (Side hustles → Industry): what to build, where, and what it pays;
the static-data bundle it rests on; the rules for jobs, research, copying and invention; build sites; the finder; home
prices from Goonmetrics; the ladder. The spec is `docs/superpowers/specs/2026-10-10-industry-design.md`; the research
behind it `.playwright-mcp/research/bpo/report.md` (gitignored). Stage 1 (what to build and how to start) is built by
`docs/superpowers/plans/2026-10-10-industry-stage-1.md`.

- **The bundle comes from CCP's static data, not ESI** (`scripts/industry-bundle.mjs`, build 3569502, 2 October 2026;
  `SDE_ZIP=<zip>` reuses a download). ESI serves no blueprints, rigs, structure bonuses or station services. Three files:
  `src/data/industry.json` (the tab's chunk: 2,693 blueprints, 5,670 types in 602 named groups, 106 rigs, 2,305 stations,
  57 skills; 1,056 KB, 145 KB gzipped, against a budget of 1.2 MB and 160 KB), `industryEiv.json` (every published blueprint's ME 0
  materials, 4,039, for stage 2's first-sight EIV: nothing reads it in stage 1), and `industryTypes.json` (the cloud's watch
  set, 1,858 types, and the 1,673 blueprints whose NPC sellers the scan keeps).
- **Which blueprints**: every published blueprint on the market whose product is on the market (1,741), and every one
  they invent (1,020 Tech II). 68 are both (the old Tech II originals: Helios, Crow, Raptor…): they're Tech II here,
  costed through invention, since NPCs never sold them and an original you'd buy would be a fiction.
- **A rig's value is its own dogma, not its modifier source's attribute.** `industryModifierSources` names, per rig, the
  activity, the kind and the filter it helps, with a `dogmaAttributeID` (2538, 2539…) that names the structure attribute
  it moves and isn't on the rig at all (690 such attributes missing, checked). The rig carries 2594 (material: Tech I −2.0,
  Tech II −2.4), 2593 (time: −20, −24) and 2595 (cost: the copy and research rigs' −10, −12), times 2355 / 2356 / 2357
  (1.0 high-sec, 1.9 low, 2.1 null and wormholes). Kept: Tech I and Tech II engineering rigs (metaGroup 54, 53) with their
  size (dogma 1547: 2 M-Set, 3 L-Set, 4 XL-Set), 106 of the 220 sources. Thukker and faction rigs (52) and the faction
  citadels are left out. The copying, invention and research rigs carry no filter: they help every blueprint.
- **A skill's bonus is read from its dogma** (`skills`: rank, attributes, and the one bonus attribute it carries): Industry
  440 (−4% time a level), Advanced Industry 1961 (−3%), a science or advanced construction skill's 1982 (−1% manufacturing
  time a level, on what requires it: how EVE Ref's Tech II time comes out), Science 452 (−5% copy time), Research 453
  (−5% TE research time), Metallurgy 468 (−5% ME research time), Mass Production and Laboratory Operation 450 / 471 (+1
  slot).
- **Station services from `stationOperations`**: 2,259 NPC stations have a Factory and only 510 a Laboratory, so a quiet
  station to build in is often not one to research in.
