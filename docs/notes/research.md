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
- **The permission** (`SCOPE.agentsResearch`, `esi-characters.read_agents_research.v1`, 3 October 2026), registered by
  the user on the application first, then put in `SCOPE` (not `OPTIONAL_SCOPE`: an optional one is switched on per
  browser, and a phone that never switched it on would log the main in with a smaller set). So **every login asks for
  it from now on**, and since a login with a different set of permissions stops the character's earlier ones
  (eve-facts.md), the user's next login to the app stops the cloud's login for the main, and the alt's login, handed over
  before, lacks it: **both need handing to the cloud again once the user relogs**. Nothing new says so: Settings'
  `scopesMissing` (the cloud's set against this browser's) and the Characters page's `loginState(...).missing` already
  do. Until then the main's step 4 says "Log in again to read your research", an alt's "Hand the cloud X's login again".
  Its purpose is in `SCOPE_INFO` (gotchas.md: Settings' list is the single answer).
- **The research reads** (`toResearch` in research.ts, tested). `GET /characters/{id}/agents_research/` gives each
  agent's `agent_id`, `skill_type_id`, `started_at`, `points_per_day` and `remainder_points` (all required), held an hour.
  **Its shape is ESI's OpenAPI spec at the app's compatibility date, 2026-08-18** (`.playwright-mcp/research/rd-agents/
  openapi.json`), not a probe: the route needs the permission, which no login had yet (gotchas.md says to probe first;
  the first real read is the check). Kept as `meta.research.agents` in the app's names, sorted by agent then field, each
  row in one key order, the start as ESI wrote it and the remainder with its sign (a purchase may take it below zero,
  unseen). **Absent is not read** (or the permission missing, said as such), **an empty list is read** ("No agents
  running"), and a failed read leaves what's held, never an empty list.
  - The main: the browser's sync, whenever the permission is held, with `at` (when read).
  - An alt: the cloud's hourly sheet (`worker/src/sheet.ts`), only when its login holds the permission, with **no `at`**:
    the sheet pushes the alt's meta doc whenever its string changes (`settled` blanks only `walletAt`), so a read time
    would be a revision every hour; its read time is the `sheet` job's `lastOk`, as standings'. A login without it isn't
    asked. `scripts/check-worker.mjs`: filed under the alt with the main's rows untouched, the same answer in another
    order pushes nothing, a failed first read leaves it absent, a failed later one as it was, an empty answer goes up as
    `[]`, a login without the permission gets none. Seen failing with an `at` planted (7 failures, standings' and the
    sheet's own "nothing new pushes nothing" among them) and with the sort removed.
- **The mission offered** (`researchMissionAt` in research.ts, `meta.researchMissionAt`, the main's only). The sync reads
  notifications while a wrap waits (as before) **or an agent runs** (this sync's research read, else what's held), and
  keeps the newest `ResearchMissionAvailableMsg`'s timestamp, against what the store holds at the write, so a read that no
  longer lists it (or another device's newer one) never moves it back. Only the time: the notification's text hasn't been
  seen. The route's rate group (`char-notification`) allows 15 requests a quarter hour, shared by every open browser, and
  ESI holds it 10 minutes, so a sync every ~20 minutes costs little. Asset-safety notices are parsed only while a wrap
  waits, as before. The alt's notifications aren't read.
- **Step 4 ticks itself off** (`startTick` in ResearchSteps.tsx, `researchWhy` in researchChars.ts): once the shown
  character's read shows the pick's agent running, whatever field it shows ("The app's read of your research at … shows
  Shitsu Ashoma researching Electronic Engineering since …"), and the "isn't ready yet" notice goes. Otherwise it says when
  it will, or why it can't: not read yet, log in again, hand the login over again, or the login refused or not held.
  `researchChars.ts` gives each character a `research` state shaped as `standings` (read / unread / login / handOver /
  lost), which the cards read too.
- **Tracking: a card per running agent** (`lib/researchTrack.ts`, pure and tested; `hustles/ResearchCards.tsx`; stage 2).
  The rules live in a file of their own, not research.ts: they need the social skills' IDs (`SKILL`, researchStart.ts,
  which imports research.ts, so research.ts importing it back would be a cycle), and research.ts is the Worker's.
  - **Once any character's read shows an agent running, the cards lead and the walkthrough folds below them** ("Getting
    started", shut until opened, kept per browser in `jita-ledger:research-walk`), with Show for in its head, since it
    drives the walkthrough only. Before then, "Your agents" is one line per character saying where its research stands
    (`researchWhy`: not read yet, log in again, hand the login over again, refused), or "No agents running" once read.
    The market reads moved up from the walkthrough into the tab, so the cards are priced while it's folded; the
    skillbooks are read only while it shows.
  - **A card** (`agentCard`): the field and its datacore, the agent with its level and corporation, its station, system,
    security and high-sec jumps from Jita (an agent the bundle lacks is "Agent #id"); tiles for RP a day, RP held now (CCP's
    formula, ticking every 5 s), datacores you can buy (whole, at 100 RP, with the caveat), worth now and the next datacore
    in; and where the field's latest day sits in its year (`yearPercentile`: The Forge's daily averages over 365 days,
    like with like, needing 30 days traded and one in the last 30; "as low as any day of its year" rather than "higher
    than 0%"). Set destination on the main's cards only: an alt's points are spent by the alt, in person.
  - **RP a day is ESI's** (what accrues), with the formula's beside it, in amber, when they differ: "The formula says 35.0:
    open the agent to update it". `RATE_TOLERANCE` is read as **either** clause: more than 2 RP, or more than 2% of the
    formula's, so about 1 RP on a level 2 agent and 2 on a level 4 (a Negotiation level at a level 2 agent is 1.8 RP, 3.6%,
    which the other reading, past both, would miss). The formula is null, never a match, when skills or standings aren't
    read or the agent isn't in the bundle, and then nothing is said beside it (the tip says why).
  - **Worth now walks everyone else's bids**: every character's open Jita 4-4 orders come off the book first
    (`othersSide` in researchTrack.ts, over prospects.ts' `withoutOwn`; `ResearchChar.own`), since selling into your own
    bid, or another character's, is no sale (market-reading.md: "Sell to bids" walks others' bids only; the main has bid
    on Datacore - Rocket Science before). Anything else that values datacores (To do's cash-in, the Wallet's card) passes
    its bids through `othersSide` before `agentCard`, and the same listing price, or its worth won't match the card's.
  - **Listed against the bids, like with like** (`Sale` in researchTrack.ts; the review of 3 October 2026). The first
    version printed "Listed: about X" under every worth, which read *under* the worth beside a tip calling listing more:
    it priced all the datacores at one ask after the broker fee, against bids walked for only the units they take, and
    in the page check's stub book all three cards showed it (448,641 against 454,485 ISK). Now the bids' figure is the
    worth, and a listing (`listedWorth`: `listingPrice` on others' listings and the fortnight's highs, after sales tax,
    the broker fee with its 100 ISK minimum and the fee each) is said beside it only when listing them all pays more ("or
    about X listed, if you wait for a buyer"), else "they pay at least as much as listing". Units the bids don't take are
    valued listed, in the worth, and said ("The bids take 4 of 6 now (…); the other 2 valued listed, about …"); with no bid
    over the fee, all of them, and listing is said as the way out. Nothing to list at, or a listing that doesn't cover
    the fees, is said as that, never "Listed: –". No whole datacore yet is a known "Nothing yet"; a book still read
    "Pricing…", one that couldn't be "–" with Try again. ISK a day is ESI's rate at the top bid's net.
  - **The datacores' books are read again every five minutes while the tab is in view**, and on coming back into view
    (`useResearchMarket`'s `reread`, as the plan's list step does), since RP held ticks while the prices would otherwise
    be the visit's first read; a re-read that fails keeps the last good book. So the copy says "Jita's best bid now".
  - **A start that can't be read** (`toResearch` leaves such rows out, but a stored copy could carry one) makes the
    points held, the datacores, the worth and the next datacore unknown ("–", said), never NaN; the totals then sum no
    datacores or worth and say how many agents' points can't be worked out. Read times that can't be read are none.
  - **The totals** (`researchTotals`) count only characters whose research was read and say how many: "3 agents: yours, 1
    of 4 alts read". Worth and the month are never a part-sum: any agent's datacores unpriced leaves them "–" with how
    many and why (the six-agents tile's lesson): a book that couldn't be read (with Try again), one read with no price in
    it (no bid over the fee, and for the worth no listing either; nothing to retry), or points that can't be worked out.
  - **The mission offered** is a line under the main's name, "A research mission was offered 3 h ago", never on a card and
    never "waiting" (only the notification's time is known). Under the totals, "When to cash in" (points don't expire;
    before cancelling; when passing; when the price is high against its year) and "Daily missions" (one about a day after
    the last; doing every one about doubles what agents make; declining doesn't cost standing, CCP 2024, and the agent's
    "research halted" mail is wrong), from the research's sources.
  - **On a phone** each tile in a card is a line, its label and figure side by side and its note under them, so a card
    isn't five tall tiles stacked.
- **Checked in a browser** (`.playwright-mcp/rd-agents-build/sync-research.mjs`, ESI stubbed, against the dev server):
  two agents read sorted with `at`; notifications read once and the newest mission kept; a newer one held not moved back;
  the research read failing leaves none (and asks no notifications) or what was held; no agents, no notifications; the
  notifications failing, the sync still fine; a login without the permission asks nothing.
- **Phone**: each table keeps its first column and folds the rest under it (`.rd-table`, `.rd-phone`), the pick buttons
  beside, and each step's hexagon sits beside its title (`.rd-step`), so nothing scrolls sideways at 390. The Side
  hustles tabs' grid min went from 220 to 172 px so the six sit in one row at 1440.
- **The page check** (`scripts/pages.mjs`, a case of its own, never the shared large ledger, which check-income
  records): the main with Caldari State 3.63 and Electronic Engineering IV, ESI answering the datacores' books (the
  research's bids of 2 October 2026) and histories: the pick, 50.4 RP a day (51.1 since the fix wave below seeded a 0.50
  standing with Shitsu Ashoma itself), Lai Dai at 4.65 / "no standing" / level 2 /
  level 3 at 1.00, and Mechanical Engineering's book refused (the six-agents tile says 1 couldn't be read, no month);
  then an alt with no standings read ("Not read yet", "Open if …", "the best level 1 agent", no "no standing", no "Open
  now"), an Alpha alt ("Needs Omega"), and an alt whose login EVE refused ("hand it over again"). Both widths. The plain
  loads draw the walkthrough with every read refused and assert the main's "Log in again" (the stand-in login has no
  standings permission), "Clone state not read" and no "Needs Omega", and that all 17 datacores couldn't be read. Since
  the research read (Task 4 of the plan): the main's meta carries Shitsu Ashoma running, so step 4 must show ✓ and what
  the read shows (seen failing with the match planted wrong); the plain loads' main "Log in again to read your research".
  Since the cards (Task 5): the main runs two agents (Shitsu Ashoma, six datacores; Okila Tsurvalen at ESI's 33.75 where
  the formula says 35) and a mission was offered 3 h ago; Agent Alt runs Itirikko Innishi in Mechanical Engineering, whose
  book is refused (its worth "–", why, and the totals unsummed); Research Alt holds the permission with nothing read ("Not
  read yet"); Alpha Alt's login lacks it ("Hand the cloud Alpha Alt's login again"); Lost Alt's was refused. The check
  asserts the cards' tiles, "3 agents: yours, 1 of 4 alts read" (2 of 5 since Stale Alt, below), 8 datacores waiting, the mission line and no "waiting",
  Electronic Engineering's bids holding 4 of Shitsu's 6 (the other 2 valued listed), Graviton Physics' best bid under the
  fee (Okila's one valued listed, "listing is the way out"; the month says it has no bid over the fee, with no retry for
  it), no "Listed: –" and no NaN,
  no "No agents running" for research not read, and the walkthrough folded; then opens it for the walkthrough's own
  assertions. The brief's "1 of 2 alts" was its smallest case; the walkthrough's alts make it 4. `researchTotals` counting
  an unread character and `differs` needing both clauses were each planted and failed `npm run check`.

- **Cash in on To do** (the user's choice, 3 October 2026; `cashInItem`, `judgeCashIn` in todo.ts, kind `cashIn`, source
  `research`, Needs action; `prefs.researchCashIn`). An amount box and a switch under "When to cash in" on the tab
  (`CashInControl` in ResearchCards.tsx; Research.tsx writes the prefs, so the cards file still reads no store). Kept in the
  synced prefs and sanitized: absent is off with no amount, the amount whole ISK over 0 or none, on only with a plain true
  and an amount, and switching off keeps the amount. When on, **one item per agent** whose datacores waiting are worth
  more than the amount, keyed `cashIn:<character>:<agent>`, versioned by the whole datacores waiting, built only once
  that field's bid is read and the agents bundle has named the agent: "Cash in at Shitsu Ashoma, Friggi: 6 datacores, worth
  452,537 ISK" (the system named by ESI's `/universe/names`, one request for every running agent's), an alt's named first
  ("Agent Alt · Cash in at …", so two characters at one agent read apart). **A hand tick holds until another datacore
  comes in** (`HOLDS_UNTIL_CHANGED` in todo.ts, checked in `remember`): first shipped, it came back after To do's 12 hours
  like any chore's while the words said otherwise (the final review). Not by adding it to `WARNINGS`, which also decides
  `needs()` and would have moved it to For information. The item keeps the amount it was listed against
  (`TodoItem.amount`). The main's
  button sets the destination to the agent's station (when the login can) and opens the tab; an alt's opens the tab, since
  the alt spends its points in person. Not mailed.
  - **Judged** (orders-alerts.md: absent is not done): bought ("Fewer datacores waiting (N fewer): bought, most likely",
    fewer whole datacores than when listed, said as the inference it is: cancelling and starting again with the same agent
    between ESI's hourly reads looks the same; it said "Bought: N datacores" until the final review) or stopped ("Research stopped", the agent gone from the read) only on a research read newer than the one that
    listed it (the item's `seenAt` is that read: the main's `meta.research.at`, an alt's `sheet` `lastOk`), and an alt's
    only on a roster read of this session (`rosterLive`, as `judgeAltLogin`); an alt gone from a live roster just goes. The
    setting switched off, or raised past the amount it was listed against, unticks it at once (your own act: an item
    sitting "being checked" for an hour after switching it off would be wrong). As many datacores as listed or more, worth
    no more than the amount: the price fell, unticked, never bought; that needs no newer research read, since points only
    grow between reads. Anything not known (the book, the bundle or the read not in yet) is still being checked. Planted
    wrong, `>=` for a newer read and the alt's live gate removed each failed `npm run check`.
  - **The same worth as the card**: the pricing and the cards moved out of ResearchCards.tsx into `researchWorth.ts`
    (`pricedOf`, `blocksOf`, `totalsOf`, `whyNot`), which the tab, To do and the Wallet share, and the totals view into
    `ResearchTotals.tsx`; the bundle loader into `researchBundle.ts`. To do and the Wallet read only the running fields'
    books and histories (`useRunningResearch`, re-reading the books every five minutes while in view), and read nothing
    with nothing running; To do reads nothing with the reminder off. To do loads the agents bundle (83 KB) once an agent
    runs, for its words; the Wallet never does (`needBundle: false`: its totals use ESI's rates and the datacores' worth,
    no agent's name or level), checked in the page case by opening the Wallet first and seeing no request for it. Cards come from
    the read alone (no bundle needed), so a reload before the bundle lands never makes an agent look gone to the judge.
    In the page check To do's item and the tab's card both say 452,537 ISK for Shitsu Ashoma's six.
- **The Wallet's research card** ("R&D agents", `ResearchAgents` in Wallet.tsx), shown once any character's read shows an
  agent running, in the empty state too (as asset safety is): yours (RP a day, datacores waiting, worth now, a month at
  today's prices) outside `data-alts`; across characters inside it, and the whole card inside it when only an alt runs one
  (the income check leaves `data-alts` out; it differs with alts by design). "Waiting datacores aren't in net worth":
  research points aren't an asset ESI counts, and they buy only each agent's own datacores, in person. A link to the tab.
- **The fee** (`datacore_fee` in `categoryOf`): a Wallet line of its own, "Datacores from agents", a business cost, its
  entries "Datacore fees"; not a running cost. It fell to "Other spending" before. None is in the user's journal yet (3
  October 2026), nor in the recorded ledgers, so `npm run check-income` passed unchanged. All income doesn't net the fee
  against datacore sales (limits.md).
- **The setting lives in the synced prefs, and an older build's save can drop it** (`sanitizePrefs` keeps only the fields
  it knows, as with every late pref): a device on a version from before it that saves its prefs writes them without
  `researchCashIn`, and the reminder then reads off until set again. Browsers reload to a new version within minutes
  (app-conventions.md), so it lasts only that long.
- **An alt whose login was refused after a read** (the final review): read data wins over `lost` in `useResearchChars`, so
  its standings and research still show, and the words said "As the cloud read it …; it reads X hourly". Now `lostSaid`
  (researchChars.ts) says what was read is as of the cloud's last read and "EVE refused X's login; hand it over again on the
  Characters page" (or that the cloud holds no login), on its card head, its "No agents running" line, its standings in
  step 2 and step 4 ("nothing more is read until the login is handed over"). The page case's Stale Alt (refused, standings
  and an empty research read) asserts it, and dropping the card head's branch reproduced the bug and failed it.
- **Step 1's Connections line gives the RP its next level adds at the pick's agent** (`connectionsRp` in researchStart.ts,
  tested), only where the character has a standing with that agent itself (the spec; no standing stays none, and a
  negative one is Diplomacy's): (10 − raw) × 4% a level of the formula's standing term. The page case seeds 0.50 with
  Shitsu Ashoma: "+0.14 RP a day at Shitsu Ashoma" at Connections V.
- **The page check's research case** also turns the reminder on at 300,000 ISK and seeds a bounty and a 60,000 ISK
  datacore fee: To do lists Shitsu Ashoma's six (and nothing for Okila Tsurvalen's one, under the amount, or Itirikko
  Innishi's, its book refused) under Needs action; the Wallet's card says 84.2 RP a day and 7 datacores for the main, with
  no month (Graviton Physics has no bid over the fee), and 8 across characters with the worth unsummed, inside
  `data-alts`; money out has "Datacores from agents". Both widths. Since the final review's fix wave: the totals read "2
  of 5 alts" with Stale Alt (refused after a read, an empty research list), whose words the case asserts, and the Wallet is
  opened before the tab to prove it asks for no agents bundle.

## Open questions (in order of how much they change the page)

1. **RP per datacore: 100, or 50/100/150 by field?** Settle on the first purchase (the journal's `datacore_fee` gives the
   count; the RP held drops by the cost).
2. **The field level an agent asks for**: its own level (assumed) or less.
3. **Can two agents research one field at once?** The pick step allows it and says it isn't confirmed.
4. **What `agents_research` shows after a purchase or a rate refresh** (the first real reads). Cancelling and starting
   again with the same agent between ESI's hourly reads would also read as fewer datacores waiting, which is why To do says
   "bought, most likely"; a purchase that leaves `started_at` alone and lowers `remainder_points` would tell them apart.
5. **What `ResearchMissionAvailableMsg` carries**, and how long ESI keeps it. The app keeps only its time until then.
6. **Lai Dai's standing for both characters**: the first whole `/standings` read (the main's sync; the alt's hourly read
   after the Worker deploys).

- **An alt's broker fee comes from its read standings** (`altFees.ts`, 10 October 2026; `researchChars.ts`). `altLedger`
  carries standing 0 with Caldari State and Caldari Navy, and the tab took an alt's fee from it, so an alt with standings was
  valued as paying the fee of one with none (2.10% at Broker Relations III, where 1.98% is paid). A listing's worth on a
  card, and anything else priced after the fee, now uses `ratesAtStandings`; with none read the settings' own. The page
  check's `researchfee` case (Fee Alt: 6 datacores, 4 into the bids and 2 valued listed) reads 471,608 ISK at the right
  fee and 471,382 at the zeros.
