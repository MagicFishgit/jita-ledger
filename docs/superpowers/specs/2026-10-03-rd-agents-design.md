# R&D agents: a Research tab under Side hustles — design

Written 3 October 2026 with the user. The research behind it (every figure's source and date, and where sources
disagree) is `.playwright-mcp/research/rd-agents/draft.md` (gitignored); this spec carries the facts it rests on.

## What the user asked for, and what they chose

"There is a mechanic in eve online where you can set up research agents that generate research points over time and
this is great to just have going passively and forget about and cache in later. I have never done this so I would like
this page teach you about them and help you get them going and of course track them." (2 October 2026)

Settled with them on 2–3 October 2026:

- **Both characters**: the main (trading, in Jita) and the alt (FannySchmeller, on its own account, read only by the cloud).
  Each can run its own agents; the page shows each and a total.
- **The permission**: `esi-characters.read_agents_research.v1`. The user has registered it on the application at
  developers.eveonline.com ("i have added the permission just now and relogged"). The app doesn't ask for it yet: it goes
  in as an optional permission, switched on in Settings, after which the user logs in again and hands the cloud the main's
  and the alt's logins again (a changed set of permissions stops a character's earlier logins: eve-facts.md).
- **Cashing in**: a To do item once a character's datacores waiting are worth more than an amount they set, with a switch
  to turn it off; and "the wallet can have its own neat card to show you as well".
- **Daily missions**: set-and-forget first. The page explains the agents' daily missions in one short part, with what
  they'd add, and says when one is waiting where EVE tells it; it doesn't guide or track them.
- **Approach A**: one Research tab built in two stages. Stage 1 (getting started) is useful now; stage 2 (tracking) is
  built and tested on stand-in data, then checked against the user's first real reads the day an agent runs.
- "write it up then review it and fix any issues and then complete it": the spec is reviewed and the work done without
  stopping for further approval.

## The facts it rests on (from the research; don't re-derive them)

- **The mechanic hasn't changed since Inferno (May 2012).** You start research in person at the agent (docked in its
  station), choosing one of its fields; research points (RP) accrue every day, logged in or not, with no cap anyone
  reports, until you cancel. RP are spent only with that agent, on that field's datacore, in person ("Buy Datacores").
  **Cancelling loses every RP held with that agent** (CCP support, 2024).
- **RP a day = (1 + (20 + 5 × Negotiation + agent standing) / 100) × (field skill + agent level)²** (EVE University;
  checked on three characters by a player, 2023). Agent standing is the *effective* standing with the agent itself.
  Level 4, field IV, Negotiation IV, no agent standing: 89.6; field V, Negotiation V, agent standing 10: 125.55.
- **One agent, plus one per level of Research Project Management** (six at V). Science V is required (Omega only); each
  field skill needs Science V and one of Mechanics V, CPU Management V or Power Grid Management V (static data).
- **A datacore costs 10,000 ISK plus RP.** 100 RP is the best-supported figure (CCP's 2012 dev blog, the static data,
  EVE University); CCP's support article (edited 2024) says 50, 100 or 150 by field. The app assumes 100, says so, and
  learns the real cost from the first purchase.
- **Agent access**: an R&D agent of level 1/2/3/4 needs effective standing −2 / 1 / 3 / 5 with its corporation, *or* that
  with its faction and the corporation no more than 2 below it. Effective = raw + (10 − raw) × 4% × Connections for
  friendly standings; **no standing stays no standing** (Connections lifts nothing until a first change).
- **Agents**: ESI has no agent route; the static data (`npcCharacters.jsonl`, agent type 4 = ResearchAgent, never the R&D
  division, which also holds event-mission and epic-arc agents) has 244, with level, corporation, station and fields.
  Two listed fields make no datacore (Astronautic Engineering, Hypernet Science) and are never offered. Datacore for a
  field: the datacore whose required skill (dogma 182) is that field.
- **What it pays** (2 October 2026): 15 of the 17 datacores sit at 80–93 k ISK at the Jita bid, so a fully trained level
  4 agent makes about 91–100 k ISK a day after sales tax and the fee; six, about 18 M a month (about 36 M with every daily
  mission). Mechanical Engineering (25 k, halved in a year) and Minmatar Starship Engineering (52 k, falling) pay least.
- **For the main**: about 8.5 days of training to a first agent (Science V, a field to IV); Lai Dai's six level 4 agents
  all research Electronic Engineering, Graviton Physics and Caldari Starship Engineering, five within 7 jumps of Jita.
  Caldari State is 3.63 raw (4.65 effective at Connections IV), short of 5.0; Lai Dai is probably at no standing. Lai Dai's
  level 2 agents open now. **The alt** has no social skills and its standings aren't read today.
- **ESI**: `GET /characters/{id}/agents_research/` (that scope; cached an hour) gives each agent's `agent_id`,
  `skill_type_id`, `started_at`, `points_per_day`, `remainder_points`; CCP's spec: RP now = `remainder_points` +
  `points_per_day` × days since `started_at`. `GET /characters/{id}/standings/` (scope already held) gives every agent,
  corporation and faction standing, raw. Notification `ResearchMissionAvailableMsg` (scope held) says a mission waits.
  Journal ref type `datacore_fee` records a purchase (10,000 × the count).

## Stage 1: getting started

**The Research tab** (`hustles/research`, sixth tab of Side hustles: "Research", "Agents that make datacores while you
trade"). Before anything runs it's a walkthrough; it stays reachable once agents run. A "Show for" picker (the main, or an
alt), as Mining's Scaling up has, sets whose skills, standings and agents the steps use.

Led by one line and three or four points (app-conventions: facts at a glance): what it is; what it pays, as tiles (a level
4 agent-day at today's best field, six agents a month, days of training to a first agent for the character shown); that
nothing needs doing once it runs; that cancelling loses the points.

Four steps (`.ladder`, as Planets):

1. **Train.** A skill strip (the existing `SkillStrip` with pips, queue and times at the character's attributes): Science
   V; the chosen field's prerequisite (Mechanics, CPU Management or Power Grid Management V); the field to the level the
   agent picked needs (taken as the agent's level, said as an assumption); then Laboratory Operation V, Research V and
   Research Project Management (one more agent a level); Negotiation and Connections with what their next level adds in
   RP a day from the formula. Each book's Jita price where it isn't owned. An Alpha character is told it needs Omega.
2. **Reach the agents.** Per corporation that has R&D agents the character could use, nearest first (Lai Dai first for a
   Caldari in Jita): the character's effective faction and corporation standing (raw from ESI plus Connections; "no
   standing" said as such), which agent levels that opens, and what's missing, with the corporation's own agents that
   raise it (its level 3 security and level 4 distribution agents, from the same static data) named with system and
   jumps. Level 2 agents offered as the start that's open now when level 4 isn't.
3. **Pick agents and a field.** A table of agents the character can reach or nearly can: level, corporation, system,
   security and jumps from Jita (the bundled stargate map), its fields, the RP a day this character would get there (the
   formula at its skills and standing), and that field's datacore at today's Jita bid after sales tax and the fee, ranked
   by ISK a day. A field picker with each field's price, its year (trend), daily volume, its skillbook's price and how many
   reachable agents research it. Set destination per agent (`ui.write_waypoint`, held). Fields with no datacore never
   offered.
4. **Start.** What to do at the agent, in order: travel, dock, Start Research, choose the field; and that the agent's daily
   mission can be declined. Ticks itself off once the tracking read shows that agent running (stage 2), never before.

**Data**:

- `src/data/researchAgents.json`, built by `scripts/research-agents.mjs` from CCP's static data (as `type-materials.mjs`
  builds `typeMaterials.json`): the 244 research agents (agent type 4) with ID, name, level, corporation, faction,
  station, system and fields; the field → datacore map; the standings-raising agents of the corporations that have R&D
  agents (their level 3 security and level 4 distribution agents, with station and system). Its own chunk, loaded only by
  the tab.
- **Standings, whole**: the browser's sync keeps every standing it reads (`/standings/` already returns them all; the app
  keeps only Caldari State and Caldari Navy today), synced with the ledger. For the alt, the cloud's hourly alt read
  (`altsHourly`, worker/src/alts.ts) reads its standings too, filed under the alt's ID like everything it reads
  (characters-cloud.md: a reader is told whose login it uses and whose data it writes); the browser pulls them into the
  alt's read-only copy.
- **Datacore prices**: the 17 datacores' Jita books and histories, read as other pages read theirs (`market.ts`), shared
  in flight.

**Pure rules** (`src/lib/research.ts`, Worker-safe, tested in `npm run check`): `rpPerDay`, `effectiveStanding`,
`agentAccess` (with the corporation − 2 rule and "no standing"), `datacoreValue` (bid after tax less the fee, per datacore
and per day), `rankAgents`, the training plan over the existing skill helpers.

## Stage 2: tracking

**The permission**: `esi-characters.read_agents_research.v1` in `OPTIONAL_SCOPE` with its `SCOPE_INFO` entry (what it
unlocks, what's missing without it), switched on in Settings; the main's and the alt's logins ask for it once switched on
(`askedScopes`), and Settings and Characters already say when the cloud's logins need handing over again.

**Reads**:

- The main: the browser's sync reads `agents_research` (hourly, ESI's cache) into a synced document of the ledger.
- The alt: the cloud's hourly alt read adds `agents_research`, filed under the alt's ID, pulled into its copy.
- Notifications: the browser's sync already reads them while an asset-safety wrap waits; it also reads them while the main
  has an agent running, for `ResearchMissionAvailableMsg` (the main only; the cloud doesn't read the alt's).

**A card per running agent** (on the tab, and the main way in once agents run): the field, the agent with its level,
station, system and jumps; tiles for **RP a day** (ESI's, and the formula's beside it when they differ: "open the agent to
update it", since the client keeps the old rate until the agent is reopened), **RP held now** (CCP's formula, ticking with
`useNow`), **datacores you can buy** (whole datacores at the cost per datacore, labelled with where that cost came from),
**worth now** (at the bid after tax and the fee; listed beside it), and **the next datacore in** (hours or days). A
mission waiting shows on the main's card when its notification says so; one short explainer on the tab says what the
missions are and what they'd add. Cards for each character, then a total row: RP a day, datacores waiting, worth now, ISK
a month at today's prices. **When to cash in** stays plain: points don't expire; cash in before cancelling, when passing,
or when the field's price is high against its year.

**The cost per datacore is learned**: after a purchase (a `datacore_fee` in the journal, 10,000 × N) the read after it shows
the RP held fall; RP fallen ÷ N is the cost, kept per field, and the cards say "from your purchase on <date>" instead of
"100, assumed (CCP 2012)". Until then 100.

**Cash-in on To do** (the user's choice): a setting on the tab, `researchCashIn` in the synced settings: on or off, and an
amount (ISK). Off until an amount is set; switching it off keeps the amount. When on, one item per agent whose datacores
waiting are worth more than the amount: "Cash in at <agent>, <system>: N datacores, worth X". Needs action; keyed per
character and agent; versioned by the whole datacores at the time (so it doesn't reopen as RP tick up within a datacore).
It ticks off only on a newer research read showing the worth under the amount (bought), or the agent gone from the read
(cancelled) — never on absence alone (orders-alerts.md). Not mailed.

**The Wallet's research card**: RP a day across characters, datacores waiting and their worth now, ISK a month at today's
prices, with a link to the tab; shown once any agent runs. Waiting datacores are not added to net worth (RP aren't an
asset ESI counts); the card says so.

**Income**: the journal's `datacore_fee` is a Wallet category of its own ("Datacores from agents", a cost). In Results
and All income, a **Research** activity: sales of datacores of the fields the character's agents research, made after its
first `datacore_fee`, up to the number of datacores bought from agents (the fees ÷ 10,000), less those fees; the rest stays
where it is today ("never bought" sales). The user's journal has no `datacore_fee` yet, so no recorded figure moves.

## What it won't do

Mail; guide or track daily missions beyond the explainer and the waiting flag; read the alt's notifications; add RP to net
worth; place, start or cancel anything (ESI can't).

## Honest limits (to state)

- RP per datacore is assumed 100 until the first purchase settles it.
- The field level an agent requires is taken as the agent's level (EVE University's example; a 2023 player report
  disagrees).
- Whether two agents may research the same field at once isn't confirmed; the pick step allows it and says so.
- ESI's rate lags a skill or standing change until the agent is reopened; the card computes the rate it should be.
- The alt's standings and research are as of the cloud's last hourly read.
- A Research activity can only tell datacores bought from agents by count, not by unit: datacores from FW stores or loot of
  the same fields sold after a purchase are counted as research up to that count.

## Testing

- Pure: `rpPerDay` on the research's three rows (89.6, 119.1, 125.55); `effectiveStanding` (3.63 at Connections IV →
  4.65; no standing stays none); `agentAccess` for Lai Dai level 2/3/4 at the main's standings and at the faction route's
  thresholds; RP now on CCP's formula; the learned cost from a fee and a drop; the cash-in item's version and its
  tick-off (bought, cancelled, absent → still checking); the Research activity's count rule.
- Worker: the alt's standings and research read, filed under the alt's ID, the main's rows untouched
  (`scripts/check-worker.mjs`).
- Pages: the tab at the empty, small and large ledgers, and with stand-in reads (agents running for both characters, a
  mission waiting, a datacore fee) at both widths; the Wallet card; the To do item.
- After shipping: the first real reads, the day an agent runs, checked against the formula and recorded in the notes
  (what `remainder_points` and `started_at` do after a purchase or a rate refresh; the notification's text).

## Notes

A new note, `docs/notes/research.md`, with a rule file `.claude/rules/research.md` naming the new files in its `paths:`
(CLAUDE.md: a new note gets a rule of its own). The scope goes in eve-facts' list of what each permission does only via
`SCOPE_INFO` (gotchas.md: Settings' list is the single answer).
