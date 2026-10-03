# Research (R&D agents)

Decisions worth not undoing. The Research tab under Side hustles: R&D agents, which turn a field skill into research
points (RP) every day that buy that field's datacores. The user (2 October 2026): "great to just have going passively and
forget about and cache in later. I have never done this so I would like this page teach you about them and help you get
them going and of course track them." The spec is `docs/superpowers/specs/2026-10-03-rd-agents-design.md`; the research
behind it, with every figure's source and where sources disagree, is `.playwright-mcp/research/rd-agents/draft.md`
(gitignored). Stage 1 (getting started) shipped first; stage 2 (tracking agents that run) builds on it.

- **The mechanic, as the app models it** (`lib/research.ts`, pure, the Worker imports it too). Unchanged since Inferno
  (May 2012). RP a day = (1 + (20 + 5 × Negotiation + effective standing with the agent itself) / 100) × (field skill +
  agent level)², EVE University's formula, checked by a player on three characters (2023): 89.6, 119.07 and 125.55 for
  the research's three level 4 rows, tested. A datacore is `RP_PER_DATACORE` (100, **assumed**: CCP's 2012 dev blog and
  the static data; CCP's support page, edited 2024, says 50, 100 or 150 by field) plus `DATACORE_FEE` (10,000 ISK),
  bought from the agent in person. Points accrue logged in or not with no cap anyone reports; **cancelling loses every
  point held with that agent** (CCP support). RP now is CCP's own formula from ESI's spec (remainder + points a day ×
  days since the start). One agent, plus one a level of Research Project Management (six at V).
- **Access** (`agentAccess`, `ACCESS` −2 / 1 / 3 / 5, `CORP_BELOW_FACTION` 2): an R&D agent takes its corporation's
  effective standing at its level's figure, or its faction's with the corporation no more than 2 under (EVE University).
  Ordinary agents (`helperAccess` in researchStart.ts) take the agent's, corporation's or faction's, whichever is
  highest, and a corporation at −2 or under shuts all but level 1. Effective standing is raw + (10 − raw) × 4% ×
  Connections (Diplomacy for a negative one); **no standing stays none**, whatever the skills, and counts as 0 for
  access. The main on 3 October 2026: Caldari State 3.63 raw, 4.65 at Connections IV; Lai Dai at no standing; so Lai
  Dai's level 2 agents open and level 3 wants Lai Dai 1.00.
- **The field an agent asks for is taken as its own level** (EVE University's example; a 2023 player report got 20 RP a
  day with the field injected at 0, which disagrees). `rankAgents` works RP out with the field at least at the agent's
  level, so a figure "at your skills" with the field untrained is what it would be once trained that far; the tile says
  "once Electronic Engineering reaches II" then.
- **The agents bundle** (`src/data/researchAgents.json`, its own chunk, from `scripts/research-agents.mjs`): CCP's static
  data, build 3569502. ESI has no agent route. Agents are picked by agent type 4 (ResearchAgent), never by the R&D
  division, which also holds event-mission and epic-arc agents: 244, by level 78 / 81 / 53 / 32. Two listed fields make
  no datacore (Astronautic Engineering, Hypernet Science) and are dropped. `helpers`: the 447 security and distribution
  agents (levels 1 to 4) of the 13 corporations with R&D agents. `names`: those corporations' and their 7 factions'
  names (added 3 October 2026, so the tab asks ESI for none). `SDE_ZIP=<zip> node scripts/research-agents.mjs` rebuilds
  from a build already downloaded without fetching; rerun on 3569502 it changed only by adding `names`.
- **`rankAgents`' "open" is standings alone; the page applies the skills** (`skillGaps` in researchStart.ts): Science V,
  the field's own prerequisite at V (Mechanics, CPU or Power Grid Management, `FIELDS`), the field at the agent's level.
  "Open" never reads as "start it now": step 3 says "Open; train Science V, Electronic Engineering II", or "Needs <corp>
  …" for a closed one. `skillGaps` is null while skills aren't read, so "nothing lacking" and "not known" stay apart.
- **What step 3 lists** (`listedAgents`): open now, and one level past what each agent's corporation opens ("nearly").
  Further would bury the table in other empires' level 3s. **Sorted by pay, then nearest** (`byPayThenNear`): open first,
  priced first, ISK a day, RP a day, then high-sec jumps from Jita (off a high-sec route last). `rankAgents` breaks ties
  by agent ID, which put Orulen Arala (37 jumps) above Shitsu Ashoma (8) at the same pay.
- **The pick** (`pickDefault`, kept in `jita-ledger:research-pick` as `agent:field`): the best of that order among open
  agents on a high-sec route (off it only when nothing else is open). A kept pick holds only while the character shown
  can reach it or nearly (it's in step 3's list); otherwise that character's default, without forgetting the kept one.
  For the main with Electronic Engineering at IV it's Shitsu Ashoma (Lai Dai, level 2, Friggi, 8 jumps), 50.4 RP a day.
- **The tiles** are for the pick at the shown character's skills with every skill at V beside: an agent-day; six agents a
  month (`bestAgents`: the six best-paying distinct open agents on a high-sec route, each in its best field; `sixAgents`
  says "Pricing…" until every datacore's book is read, and when any couldn't be, how many, with Try again, and no month:
  the field that failed may be the best-paying, so a sum without it would read as complete and be short; the review of 3
  October 2026 caught the first version doing exactly that); and the training to a first agent
  (`trainingPlan`, prerequisites first, from the points already in each skill), with six agents beside. Skill ranks and
  attributes are pinned from the static data in researchStart.ts, so the tile needs no ESI read: the main's first level 4
  agent (Science IV → V and a field 0 → IV at 24/24) is 8.43 days, the research's "about 8.5".
- **Every state says what it is** (`researchChars.ts`, `standingsWhy`). Standings: the main's `meta.standings` (with `at`,
  read by the sync whenever the permission is held), else "Not read yet: … next sync" with the permission, "Log in again"
  without; an alt's (no `at`; read time is its `sheet` job's `lastOk`), else "Not read yet: … the cloud's next hourly
  read", "Hand the cloud X's login again" when its login lacks the permission, or hand it over again when the login is
  refused or none is kept. While not read, the walkthrough is worked out at no standing (only level 1 opens) and **never
  says "no standing"**: the standings cells say "Not read yet" and "Open now" adds "at least". The page check asserts the
  phrase appears nowhere on an alt not read, so the copy avoids it elsewhere too ("declining it doesn't cost standing").
  Nor does it say an agent is open: a level 1 agent opens only at −2.00 or more, which isn't known, so step 3 says "Open if
  X's standing with <corp> is −2.00 or more", step 4 "it opens if …, and those aren't read yet", the pick line "the best
  level 1 agent", and the field table counts level 1 and level 2 agents rather than open and nearly; the tiles add
  "standings not read yet: level 1 agents only".
  Prices: "Pricing…" while a book is read, "–" with why when it couldn't be or no bid pays over the fee after tax.
- **Alpha is said only when known**: `settings.clone` defaults to `'alpha'`, so the main is Alpha here only when the sync
  detected it (`meta.cloneDetected`), an alt when its sheet did or it was set by hand on the Characters page; a main set
  to Omega in Settings counts as Omega (Omega isn't the default, so it was set). Otherwise "Clone state not read" sits
  where the Alpha notice would, saying R&D agents need Omega and the training times are at Omega's speed (the training
  tile says so too). The skill strips' own maths still read `pilot.alpha`, as everywhere.
- **Whose figures**: skills, standings and sales tax are the character shown (Show for, `jita-ledger:research-show`, as
  Mining's, falling back to the main when the alt is gone). Set destination is the main's always (ESI sets the
  logged-in character's), so under an alt it reads "Sets <main>'s destination".
- **Reads** (`researchMarket.ts`): the 17 datacores' Jita books first (they rank the agents), then their histories (the
  field picker's year: the last 30 days against 335–395 days back, `fieldYear`), then the skillbooks not injected (where
  cheapest in The Forge: Jita's listing or NPCs' elsewhere), four at a time. `regionHistory` is shared while in flight
  (`shareInFlight`, gotchas.md); `jitaBook` already was. Sharing hands two callers one rows array (from the cache each got
  its own copy), which is safe only while no caller changes it: checked on 3 October 2026 across every caller of it and
  of marketHistory, and every in-place sort or write in src (none touches history rows): none changes it.
- **Phone**: each table keeps its first column and folds the rest under it (`.rd-table`, `.rd-phone`), the pick buttons
  beside, and each step's hexagon sits beside its title (`.rd-step`), so nothing scrolls sideways at 390. The Side
  hustles tabs' grid min went from 220 to 172 px so the six sit in one row at 1440.
- **The page check** (`scripts/pages.mjs`, a case of its own, never the shared large ledger, which check-income
  records): the main with Caldari State 3.63 and Electronic Engineering IV, ESI answering the datacores' books (the
  research's bids of 2 October 2026) and histories: the pick, 50.4 RP a day, Lai Dai at 4.65 / "no standing" / level 2 /
  level 3 at 1.00, and Mechanical Engineering's book refused (the six-agents tile says 1 couldn't be read, no month);
  then an alt with no standings read ("Not read yet", "Open if …", "the best level 1 agent", no "no standing", no "Open
  now"), an Alpha alt ("Needs Omega"), and an alt whose login EVE refused ("hand it over again"). Both widths. The plain
  loads draw the walkthrough with every read refused and assert the main's "Log in again" (the stand-in login has no
  standings permission), "Clone state not read" and no "Needs Omega", and that all 17 datacores couldn't be read.

## Open questions (in order of how much they change the page)

1. **RP per datacore: 100, or 50/100/150 by field?** Settle on the first purchase (the journal's `datacore_fee` gives the
   count; the RP held drops by the cost).
2. **The field level an agent asks for**: its own level (assumed) or less.
3. **Can two agents research one field at once?** The pick step allows it and says it isn't confirmed.
4. **What `agents_research` shows after a purchase or a rate refresh** (the first real reads).
5. **What `ResearchMissionAvailableMsg` carries**, and how long ESI keeps it.
6. **Lai Dai's standing for both characters**: the first whole `/standings` read (the main's sync; the alt's hourly read
   after the Worker deploys).
