# R&D agents: a Research tab under Side hustles — design

Written 3 October 2026 with the user; revised the same day after a review against the code (its findings are folded in;
two pieces were cut, below). The research behind it (every figure's source and date, and where sources disagree) is
`.playwright-mcp/research/rd-agents/draft.md` (gitignored); this spec carries the facts it rests on.

## What the user asked for, and what they chose

"There is a mechanic in eve online where you can set up research agents that generate research points over time and
this is great to just have going passively and forget about and cache in later. I have never done this so I would like
this page teach you about them and help you get them going and of course track them." (2 October 2026)

Settled with them on 2–3 October 2026:

- **Both characters**: the main (trading, in Jita) and the alt (FannySchmeller, on its own account, read only by the cloud).
  Each can run its own agents; the page shows each and a total.
- **The permission**: `esi-characters.read_agents_research.v1`. The user has registered it on the application at
  developers.eveonline.com ("i have added the permission just now and relogged"). The app doesn't ask for it yet.
- **Cashing in**: a To do item once an agent's datacores waiting are worth more than an amount they set, with a switch to
  turn it off; and "the wallet can have its own neat card to show you as well".
- **Daily missions**: set-and-forget first. One short explainer says what the agents' daily missions are and what they'd
  add; the tab says when EVE last offered one. Nothing guides or tracks them.
- **Approach A**: one Research tab in two stages. Stage 1 (getting started) is useful now; stage 2 (tracking) is built and
  tested on stand-in data, then checked against the user's first real reads the day an agent runs.
- "write it up then review it and fix any issues and then complete it": the spec is reviewed and the work done without
  stopping for further approval.

**Changed from what the user was told, by the review** (to say when it ships): the permission goes in the app's regular
list (`SCOPE`), not an optional one. Registered permissions go there (commit 8047f8c did the same for notifications and
blueprints), and an optional one is switched on per browser: a phone that never switched it on would log the main in
with a smaller set and stop the PC's and the cloud's logins (eve-facts.md). Either way the user logs in again once and
hands the cloud the main's and the alt's logins again, as Settings and Characters already prompt.

**Cut by the review** (not asked for, and wrong as first written): a Research income activity in Results (its "up to the
count" rule double-counted datacores the user trades, Rocket Science among them, against "Every item traded" and "Sold,
never bought"); and an automatic learner of the RP cost per datacore (it needs two reads compared at one instant and a
fee whose amount has never been seen). Instead: datacore sales stay where they are, the fee is a Wallet line of its own,
and the cost is 100, assumed and said so, until the first real purchase is logged in the notes.

## The facts it rests on (from the research; don't re-derive them)

- **The mechanic hasn't changed since Inferno (May 2012).** You start research in person at the agent (docked in its
  station), choosing one of its fields; research points (RP) accrue every day, logged in or not, with no cap anyone
  reports, until you cancel. RP are spent only with that agent, on that field's datacore, in person ("Buy Datacores").
  **Cancelling loses every RP held with that agent** (CCP support, 2024).
- **RP a day = (1 + (20 + 5 × Negotiation + agent standing) / 100) × (field skill + agent level)²** (EVE University;
  within a couple of RP on three characters, a player, 2023). Agent standing is the *effective* standing with the agent
  itself. Level 4, field IV, Negotiation IV, no agent standing: 89.6; field V, Negotiation V, agent standing ~2: 119.1;
  field V, Negotiation V, agent standing 10: 125.55.
- **One agent, plus one per level of Research Project Management** (six at V; it needs Laboratory Operation V and Research
  V). Science V is required, Omega only. Each field skill needs Science V and **its own** one of Mechanics V (the four
  starship engineerings, Mechanical, Molecular, Rocket Science), CPU Management V (Electromagnetic Physics, Electronic and
  Nanite Engineering) or Power Grid Management V (the other physics).
- **A datacore costs 10,000 ISK plus RP.** 100 RP is the best-supported figure (CCP's 2012 dev blog, the static data,
  EVE University); CCP's support article (edited 2024) says 50, 100 or 150 by field. The app uses 100 and says so.
- **Agent access**: an R&D agent of level 1/2/3/4 needs effective standing −2 / 1 / 3 / 5 with its corporation, *or* that
  with its faction and the corporation no more than 2 below it. Effective = raw + (10 − raw) × 4% × Connections for
  friendly standings (Diplomacy likewise for negative ones); **no standing stays no standing** (skills lift nothing until a
  first change). Other agents accept faction standing alone.
- **Agents**: ESI has no agent route; the static data (`npcCharacters.jsonl`, agent type 4 = ResearchAgent; never the R&D
  division, which also holds event-mission and epic-arc agents) has 244, with level, corporation, station and fields. Two
  listed fields make no datacore (Astronautic Engineering, Hypernet Science) and are never offered. Datacore for a field:
  the datacore whose required skill (dogma 182) is that field; names don't map one-to-one ("Amarr Starship Engineering"
  → "Datacore - Amarrian Starship Engineering").
- **What it pays** (2 October 2026): most datacores sit at 80–93 k ISK at the Jita bid, so a fully trained level 4 agent
  makes about 85–100 k ISK a day after sales tax and the fee; six, about 16–18 M a month (about twice with every daily
  mission). Mechanical Engineering (25 k, halved in a year) and Minmatar Starship Engineering (52 k, falling) pay least.
- **For the main**: about 8.5 days of training to a first agent (Science V, a field to IV); Lai Dai's six level 4 agents
  all research Electronic Engineering, Graviton Physics and Caldari Starship Engineering, five within 7 jumps of Jita.
  Caldari State is 3.63 raw (4.65 effective at Connections IV), short of 5.0; Lai Dai is probably at no standing. Lai Dai's
  level 2 agents open now (level 3 too once Lai Dai reaches 1.0). **The alt** has no social skills and no standings read
  yet: level 1 agents (−2.00) are what's open to it.
- **ESI**: `GET /characters/{id}/agents_research/` (that scope; cached an hour) gives each agent's `agent_id`,
  `skill_type_id`, `started_at`, `points_per_day`, `remainder_points`; CCP's spec: RP now = `remainder_points` +
  `points_per_day` × days since `started_at`. What a purchase or a rate refresh does to those two fields hasn't been seen.
  `GET /characters/{id}/standings/` (scope held) gives every agent, corporation and faction standing, raw, with
  `from_type`. Notification `ResearchMissionAvailableMsg` (scope held) says a mission was offered; its text hasn't been
  seen. Journal ref type `datacore_fee` records a purchase: expected 10,000 × the count, unseen.

## Stage 1: getting started

**The Research tab** (`hustles/research`, sixth tab of Side hustles: "Research", "Agents that make datacores while you
trade"). Before anything runs it's a walkthrough; once agents run, their cards come first and the walkthrough folds below.

**Show for** (as Mining's Scaling up): the main or an alt; it drives the walkthrough only (cards and totals always show
every character). Kept per browser (`jita-ledger:research-show`), falling back to the main when the character is gone.
The chosen character's skills come through the existing pilot (`usePilot`); its standings come from its `meta.standings`
(below), passed in.

**The pick**: steps 1–3 follow one pick of agent and field: by default the best-ranked agent and field the character can
reach (step 3's order), kept per browser and changed in step 3.

Led by one line and three or four points (app-conventions: facts at a glance): what it is; what it pays, as tiles at the
shown character's skills for the pick with "at all V" beside (an agent-day, six agents a month, days of training to a
first agent); that nothing needs doing once it runs; that cancelling loses the points.

Four steps (`.ladder`, as Planets):

1. **Train.** A skill strip (the existing `SkillStrip`: pips, queue and times at the character's attributes): Science V;
   the pick's field prerequisite; the field to the pick's agent level (the level an agent requires is taken as its own,
   said as an assumption); then Laboratory Operation V, Research V and Research Project Management (one more agent a
   level). Negotiation with what its next level adds in RP a day (the formula); Connections with the effective faction and
   corporation standing its next level gives and which agent levels that opens (RP only when the agent's own standing
   exists). Each book's Jita price where it isn't owned. An Alpha character is told it needs Omega; one whose clone state
   is unknown isn't called Alpha.
2. **Reach the agents.** Per corporation that has R&D agents, ordered by the character's effective standing with its
   faction, then jumps from Jita: the effective faction and corporation standing, which R&D agent levels that opens, and
   what's missing; the corporation's own security and distribution agents (levels 1–4) this character can use now, with
   system and jumps, as the way to raise it. The highest R&D level open now is offered as the start (level 2 for the
   main, level 1 for the alt, today).
3. **Pick agents and a field.** A table of agents the character can reach or nearly can: level, corporation, system,
   security and jumps from Jita (the bundled stargate map, high-sec route; an agent off it flagged), its fields, the RP a
   day this character would get there, and that field's datacore at today's Jita bid after sales tax and the fee, ranked by
   ISK a day. A field picker: each field's price, its year (trend), daily volume, its skillbook's price, and how many
   reachable agents research it (whether two agents may research one field isn't confirmed, and the step says so). Set
   destination per agent for the main; under an alt it's labelled "sets <main>'s destination" (ESI sets the logged-in
   character's).
4. **Start.** What to do at the agent, in order: travel, dock, Start Research, choose the field; that the agent's daily
   mission can be declined. Ticks itself off once the research read shows that agent running (stage 2); without the
   permission it says what to switch on for that.

**Data**:

- `src/data/researchAgents.json`, built by `scripts/research-agents.mjs` from CCP's static data (as `type-materials.mjs`
  builds `typeMaterials.json`): the 244 research agents (agent type 4) with ID, name, level, corporation, faction,
  station, system and fields; and every security and distribution agent (levels 1–4) of the corporations that have R&D
  agents, with station and system. Its own chunk: the tab imports it, and To do and the Wallet `import()` it only when an
  agent runs. An agent missing from it shows as "Agent #id".
- The 17-entry field → datacore map is a constant in `src/lib/research.ts`.
- **Standings, whole**: whenever the standings permission is held, the browser's sync reads the whole list into
  `meta.standings` (`{ at, list: { id, type: 'agent' | 'npc_corp' | 'faction', standing }[] }`, sorted by id, signs kept),
  whatever "Fill skills, standings and clone state from my character" says (that switch governs only the fee fields,
  `settings.faction` / `settings.corp`, as now). A missing entry is no standing; a missing `meta.standings` is not read
  yet. For the alt, the cloud's hourly alt read (`worker/src/sheet.ts`, under its own scope check) writes the same
  `meta.standings` with no `at` field (a read time in the doc would push a new revision every hour: `settled()` blanks only
  `walletAt`), and the alt's "read at" is its `sheet` job's `lastOk` from the roster (characters.md). The browser pulls it
  into the alt's read-only copy. Until the first hourly read after the Worker deploys, the alt's standings say "Not read
  yet", never "no standing".
- **Datacore prices**: the 17 datacores' Jita books and histories, read as other pages read theirs (`market.ts`), each read
  shared while in flight (the history cache today remembers only finished answers: share the in-flight one, gotchas.md).
  Unread: "Pricing…".

**Pure rules** (`src/lib/research.ts`: no `./config`, store, React or DOM; tested in `npm run check`): `rpPerDay`,
`effectiveStanding`, `agentAccess` (the corporation − 2 rule and no standing), `datacoreValue` (bid after tax less the
fee; a stack held is walked down the bids, `walkBids`, rather than all at the top bid), `rankAgents`, the training plan
over the existing skill helpers.

## Stage 2: tracking

**The permission**: `esi-characters.read_agents_research.v1` in `SCOPE` with its `SCOPE_INFO` entry (what it unlocks,
what's missing without it). The existing "permissions changed" flow (`scopesMissing`, Settings, Characters) asks the user
to log in again and hand the cloud the main's and the alt's logins again.

**Reads**:

- The main: the browser's sync reads `agents_research` (an hour's cache) into `meta.research` (`{ at, agents: { agentId,
  skillTypeId, startedAt, pointsPerDay, remainderPoints }[] }`, sorted by agent). Absent: not read yet (or the
  permission missing, said as such).
- The alt: `sheet.ts` reads `agents_research` only when its login holds the permission, into the alt's `meta.research`
  with no `at` field; a failed read leaves it absent, never empty. Pulled into the alt's copy.
- Notifications: the browser's sync already reads them while an asset-safety wrap waits; it also reads them while the
  main has an agent running (rate group `char-notification`, 15 tokens a quarter hour, shared by every open browser), and
  keeps the newest `ResearchMissionAvailableMsg`'s time. The tab says "A research mission was offered <time ago>" until a
  real one's text shows what it names; nothing on a card, never "waiting". The alt's aren't read.

**Every state says what it is** (nothing not known reads as zero), for the cards, To do and the Wallet card alike: field
absent → "Not read yet"; an empty list → "No agents running"; the permission missing from the login (`loginState(...)
.missing`) → "Hand the cloud this login again" (an alt) or "Log in again to read your research" (the main); an alt's
login refused or not kept (`pilot.lost`) → hand it over again; prices unread → "Pricing…".

**A card per running agent**: the field, the agent with its level, station, system and jumps; tiles for **RP a day**
(ESI's; the formula's beside it when the two differ by more than 2 RP or 2%: "open the agent to update it", since the
client keeps the old rate until the agent is reopened), **RP held now** (CCP's formula, ticking with `useNow`),
**datacores you can buy** (whole datacores at 100 RP, "assumed: CCP 2012; CCP's support page says 50–150 by field"),
**worth now** (walked down today's Jita bids after tax and the fee; listed beside it), and **the next datacore in**. Cards
for each character, then a total row: RP a day, datacores waiting, worth now, ISK a month at today's prices; for alts, only
characters whose research was read, saying how many. **When to cash in** stays plain: points don't expire; cash in before
cancelling, when passing, or when the field's price is high against its year (its percentile in the year's history). One
short explainer covers the daily missions (what they are, what they'd add, that they can be declined).

**Cash-in on To do** (the user's choice): `prefs.researchCashIn: { on: boolean; isk: number | null }` in the synced
prefs, sanitized in `sanitizePrefs`; absent is off with no amount; `on` only when `isk > 0`. Set on the tab: an amount
box and a switch (switching off keeps the amount). When on, **one item per agent** whose datacores waiting are worth more
than the amount: kind `cashIn`, source `research`, Needs action; "Cash in at <agent>, <system>: N datacores, worth X";
keyed per character and agent; versioned by the whole datacores waiting when listed. The button opens the tab (and sets
destination for the main's agents). Built only once that field's bid is read. Judged only from a read newer than the one
that listed it (the main's `meta.research.at`; for an alt its `sheet` `lastOk`, and only on a roster read of this session,
as `judgeAltLogin`): fewer whole datacores than when listed → done ("Bought: N datacores"); the agent gone from the read →
done ("Research stopped"); the worth under the amount from a price fall → unticked, neither open nor done ("the price fell
under your amount"); the setting switched off or raised → unticked. Never done on absence alone (orders-alerts.md). Not
mailed.

**The Wallet's research card**: RP a day across characters, datacores waiting and their worth now, ISK a month at today's
prices, a link to the tab; shown once any agent runs. Alt-derived figures go inside `data-alts` (check-income's isolation
check leaves those out). Waiting datacores are not added to net worth (RP aren't an asset ESI counts); the card says so.

**The fee**: the journal's `datacore_fee` gets a Wallet category of its own, "Datacores from agents" (a business cost;
today it would fall to "Other spending"). The user's journal has none yet, so no recorded figure moves.

## What it won't do

A Research income activity (datacore sales stay "Sold, never bought", whose tip already names datacores, or trading when
bought); learn the RP cost automatically; mail; guide or track daily missions beyond the explainer and the last-offered
line; read the alt's notifications; add RP to net worth; place, start or cancel anything (ESI can't).

## Honest limits (to state)

- RP per datacore is taken as 100 until a real purchase is logged (then a per-field constant, if it differs).
- The field level an agent requires is taken as the agent's level (EVE University's example; a 2023 player report
  disagrees).
- Whether two agents may research one field at once isn't confirmed; the pick step allows it and says so.
- ESI's rate lags a skill or standing change until the agent is reopened; the card computes the rate it should be.
- The alt's standings and research are as of the cloud's last hourly read.
- All income doesn't net the 10,000 ISK fee against datacore sales.

## Testing

- Pure: `rpPerDay` on the research's three rows (89.6, 119.1, 125.55); `effectiveStanding` (3.63 at Connections IV →
  4.65; no standing stays none; a negative one through Diplomacy); `agentAccess` for a corporation's level 1–4 agents at
  fixture standings (faction 4.65 with the corporation at none, at 1.0, at 3.0; faction 5.0 with the corporation at 3.0;
  the corporation at 5.0); RP now on CCP's formula; `datacoreValue` walking a book; the cash-in item's version and
  tick-off (bought, stopped, price fell, setting off, absent → still checking); `sanitizePrefs` for `researchCashIn`.
- Worker: the alt's standings and research read filed under the alt's ID, the main's rows untouched, no new revision when
  nothing changed (`scripts/check-worker.mjs`).
- Tripwire: `scripts/check.mjs`'s list of files importing the alt store gains the Research tab (and characters.md's list),
  in the commit that makes it read the alt store.
- Pages: the tab at the empty, small and large ledgers; stand-in reads in `pages.mjs` cases of their own (never the shared
  large ledger, which check-income records): agents running for both characters, a mission offered, a cash-in item; the
  Wallet card; both widths.
- After shipping: the first real reads, the day an agent runs, checked against the formula and recorded in the notes (what
  `remainder_points` and `started_at` do after a purchase or a rate refresh; the notification's text; the fee's amount).

## Notes

A new note, `docs/notes/research.md`, with a rule file `.claude/rules/research.md` naming the new files in its `paths:`
(CLAUDE.md: a new note gets a rule of its own). The permission's purpose lives in `SCOPE_INFO` (gotchas.md: Settings'
list is the single answer).
