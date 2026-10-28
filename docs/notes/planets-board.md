---
paths:
  - "src/lib/{setupCheck,planetBoard}.ts"
  - "src/components/hustles/PlanetBoard.tsx"
---

# Planets: the plan board and Check my setup

Decisions worth not undoing. How Plan draws a setup (a row until opened, then the plan at a glance and a card a planet), each planet's
Build it list, and Check my setup, which sets the colony a character built against the plan. The user (24 October 2026): "the planner
itself suffers from information overload. if we can use better ui to help you understand what to do on which planet etc that would be
great", then "a button i could press per planet to have it check if i have done the setup right. just be sure it doesn't moan if i was
able to fit 3 factories if it recommends 2 for example because that is better". Nothing here works a setup out: piPlan.ts is untouched,
the board draws its roles. The ranking is in planets-planner.md, a kept plan in planets-kept.md, a colony's chain in planets-chain.md.

The ranking is in `docs/notes/planets-planner.md`, a kept plan in `docs/notes/planets-kept.md`, a colony's chain in
`docs/notes/planets-chain.md`: Read them before changing what the board draws from or what the check reads.

- **A setup is a row until it's opened** (`SetupRow` in PlanetsPlan.tsx, its head's `data-planets="open"`): its kind, its figure (units
  a day under Plan it, else ISK a day), the planets it uses and its tags, each tag's sentence in its tip (May be short, Doesn't fit, No
  rate yet, Valued at Jita's, N not valued); "before the customs tax" stays beside the figure, with its sentence in the tip, and a
  blocked setup's reason stays in view. **Only the best opens by itself** (P0 → P2 did too: two open was the overload); a fold set by hand
  holds for its place, as before (m3). A kept plan opens by itself, the newer layout and today's ranking stay folded (planets-kept.md).
- **Nothing folds on a refresh** (team-p1, 27 October 2026; the user, building from a kept plan: "at some point there is some background refresh
  that goes on and even though i have kept the plan at that point it would collapse anything i had open"). The cause: every ten minutes the
  cloud's live books are merged into the scan held here (`mergeLiveBooks`, which bumps the scan's save count); `useScanCache` read it again
  under the new key and went back to `loading` meanwhile (`useShared`), so the morning's prices weren't ready for a moment and Plan drew
  "Reading the market scan held in this browser…" in place of `Setups`: every row, kept plan, feeder group, card, Build it and details
  unmounted and came back as each opens by itself. Reproduced in the page check before the fix: the colony pull left everything open, the
  scan's merge folded all of it (the kept plan's group, Build it and details, today's ranking and the feed in it). Fixed at the root and in two guards: `useShared` keeps a value it holds while it reads again; `usePlanned` keeps the
  last ranking while its input is away for a moment (marked as being worked out again); and Plan keeps `Setups` drawn once it has rows,
  the waiting line beside them. A re-rank that makes another row the best still opens it and folds the last (m3), as ruled; a kept plan's
  row stays open, and what's opened inside a row stays while the row does. (A rule freezing every fold once one was touched was tried and
  dropped: it broke m3's own check.) The page check
  keeps the team plan, opens its row, a feeder group, a factory planet's Build it and its details, and today's ranking with the feed opened
  by hand, then pulls a colony whose rate moved, merges the cloud's live books into the scan, asks for the hub's own read again and writes
  `meta`, each judged on its own: everything stays open. Planted back (the three changes undone), it failed on the scan's merge.
- **The plan at a glance** (`Glance`): tiles, the good's units a day first under Plan it, ISK a day, a week, a month, the share of a
  month of Omega, planets used ("5 of 5"), resets ("Every 3 days", `resetsTile`, which left the upkeep tiles). Each keeps its words as
  the tile's note or tip; a chain's "in all" sits in the day's note (`data-planets="chain-all"`). Then the kept plan's notes, the repeat
  line and what to train, in view.
- **The board** (`PlanetBoard.tsx`; `boardOf`, `planetBoard.ts`): a card a planet (`data-planets="role:<id>"`), its type's icon, its
  name, its type and "factory planet", its owner when the setup spans characters, and a badge, Extracts or Factory. An extraction line is
  drawn P0 → heads → Basics → P1 a day, a factory step as its inputs → count → product a day; a factory planet's intake is "In" (from
  other planets) or "Bought". "Sold" is said only where it isn't the card's last line already (a feeder's goods to market, a P1 left
  over). A fed setup (feed, chain) is feeders on the left (a chain's by character) and the factory on the right, joined by lines drawn
  once the cards are laid out (measured; again when a card changes size), each labelled with every good it ships there a day
  (`data-planets="edge:<planet>:<good>"`). One-planet setups are a row of cards. On a phone the board scrolls in its own box.
  - **Badges on the line they're about**: Extra (amber) and Tops up (blue), their words in the tip; Set aside; No rate yet; "67% a head"
    where the planet's own rate is well under its type's (`poorShare`, planet rates); on the card, "Doesn't fit at your level" (red) with
    what to train. Each line's ⓘ and heads chip carry its rate in words (`rateSaid`: "learned on this planet: about 67% a head of your
    other Gas planets").
  - **A factory character's board** (`layout: 'team'`, planets-team.md): its factory planets stacked on the right, its feeders a group a
    character, each folded to one line (who, its account, its planets and what it sends a day) until opened, a line from each group to
    the factory column with its m³ and the good a day it's worth. Its feeders make P1 only since Ruling F26, so "As well" is drawn only for a
    plan kept before it. **A factory planet's card says its counts** as the user builds them (`factoryCounts`, `data-planets="factory-counts"`:
    "6 Oxides, 6 Biocells, 6 Superconductors, 3 Gel-Matrix Biopaste: 21 of the 22 Advanced it holds", the P2s first, the holds at the card's
    character's level beside a launchpad), and so does its Build it, first (`build-counts`), for any factory planet of Advanced alone.
  - **Heads to reach the Basics' need** (`headsNeeded`, `headsNeedSaid`; the user, 25 October 2026: "the extra level will help me install
    more heads so i can be sure to hit the 18k average extraction needed to run the 3 basic factories"), on every board: where a line's
    rate is short of what its Basics take, its ⓘ and its Build it step say the heads that fit for it at the card's own character's level
    beside the planet's factories (`maxHeads`, the planet's own radius, the other lines at their heads, at most ten) and the yield a head
    needed there against the yield a head the rate was learned at ("3 Basics take 18,000 an hour: at 7 heads that’s 2,572 a head; this
    line was learned at 2,300 a head (5 heads)"), never as a promise: heads overlap and the planet depletes, and a rate is never scaled by
    heads (planets.md). A line's Basics are the ones on the P1 its P0 makes. check.mjs: beside 6 Basics and a launchpad, 11 heads fit at
    CCU IV and 14 at V on the bundle's median Barren (3,750 km) and Lava (3,360), 10 and 14 on Gas (26,370).
  - **A fed board's columns** (the feed, the chain, a factory character; the user, 25 October 2026, on a 2000 px screen: "i feel like we are
    wasting space here and we can better design this so the charts on the right have more space to breathe"): the feeder column takes what
    its cards and group lines need, up to 680 px (`fit-content`), a 168 px gutter holds the wires' labels, and the factory column takes the
    rest, 500 px at least, so its intake rows and steps sit two goods to a line. Before, the feeders took a fixed share (1,112 px at 2000,
    the factory column 380 at both widths) and a factory character's labels sat over the factory cards. Labels are centred across the gutter,
    a factory character's at least 44 px apart; "As well: ships Biocells 240 a day as well as its P1" is one line (it drew as a full-width
    bar on three). The page check measures both boards at 1440 and 2000: no label over a card or a group's line, every wire from the feeders'
    edge to the factory column, nothing sideways, the factory column 460 px or more, and wider at 2000.
  - **Fix round 1**: **a feeder card is as wide as what it holds** (`width: fit-content`, 360 px up to the column), its badge and buttons at its
    lines' edge, since a group's line of five or eight goods sets the column at its 680 px cap and every card took it (110 to 140 px past their
    lines in the page case at 2000 px, about 230 on the user's board); a group's line keeps the column's width, and a feed's wire starts at its
    own card's edge. **A feed's and a chain's labels are spaced as a team's** (at least 44 px, more for a label of several goods), and the check
    finds no label over another. **"As well" is drawn only when a feeder ships its P2 beside some of its P1**: 5-NZNW III in the page case makes
    Biocells from 1,920 of each P1, all its 2 Advanced take (2 × 40 an hour), so it ships the Biocells alone and draws none, which is right;
    DT-PXH with three characters draws two ("As well: ships Biocells 120 a day as well as its P1", one line, nowrap), which the page check
    asserts, and the old markup planted failed it (two lines of 97 px).
- **The fine print folds under "What it makes, and the details"**: the setup's notes (cut, before the tax, no rate, Valued at Jita's,
  unvalued, doesn't fit), what it makes, valued, what it buys, the upkeep tiles, the planets not used, "How to build it", and each card's
  words (`RoleWords`: the old planet line's Extracts, Takes in, Makes, Ships, Customs and the planner's notes, whole). The page check reads
  them, so they move, never cut: its `openRow` / `openAll` open a row and its details first.
- **Build it** (`buildSteps`): the command centre at the level the layout needs (the lowest that fits on the planet's own size,
  `levelNeeded`, Plan's layout of one launchpad and no storage; never above the character's own when the planner says it fits there; "isn't
  worked out" with no size), each extractor with its heads on its P0 and the programme, each factory on its schematic, the launchpad, then
  the routes from the ground up (each P0 to its Basics, each tier's goods to the launchpad and from it to the next tier's factories).
  **Ticks are kept per browser** (`jita-ledger:planets-build`, by `cardKey`: system, good or "all", the setup's kind, planet and
  character; the newest 300) under the planet's layout (`roleSig`: its P0s, heads and factory counts). The kind is in the key, a kept
  plan's its own (`kept-feed`), so ticking one setup's card never ticks, nor opens a check on, the same planet's card in another (the
  review's Important 2). A tick kept under another layout is deleted when seen (`dropStale`), so switching back brings none back.
- **Check my setup** (a button on every card, the kept plan's too). **Whose**: a chain's card its own character; any other, every
  character doing planetary industry, the role's own, and any with a colony there ("Nothing built on this planet yet" when none).
  **Read fresh**: the main through `readColonies(0, true)` (`fresh` asks ESI past the browser's copy, gotchas.md; ESI's own holds about
  10 minutes; a read already running is waited out, and "Read just now" only when a new read came back, `mainReadWhy`); an alt through
  `cloudAltRead` and `refreshAlts`, passed down from Planets.tsx (the tab's one importer of the alt store; `getAlts` was added there) and
  waited for 90 s (`ALT_READ_BOUND_MS`); a 404 is a Worker a version behind. `refreshAlts` keeps a failed roster read to itself, so an
  alt counts as read only when its copy was pulled after the cloud's read (`altPulledWhy`: the roster read again since, live, no error,
  the copy at the roster's revision); else "The cloud read it, but this browser couldn't fetch it yet: …", judged on the last kept colony. Not readable (the main's login without the planets permission, the cloud off, an alt handed over without it or refused) is said
  in Colonies' words (`coloniesWhy`, `lostSaid`) and checked against the colony as last kept. Said "as EVE last saved it" (its
  `lastUpdate`). The result is worked out live from the kept documents and the plan as it stands, shown until a reload.
- **What it judges** (`setupCheck.ts`, pure, tested): the outcome, never the counts.
  - **What the plan needs** (`needsOf`): a feeder's goods for the factory planet, at all it sends on of each (a line that tops up the
    factory with the last 54 a day of 1,920 is needed at 1,920, never "more than the plan's 54"); a one-planet setup's top tier that it
    ships, less a line marked Extra. A factory planet: its inputs reach its factories (made there, brought in, or drawn with no route flag naming them),
    its product made and sent on; its steps only when the product falls short (otherwise a different arrangement that works). **A factory's
    card judges its own routes and products alone**, with what it takes in kept stocked: it reads "Routes set" (said why in an info line)
    until every feeder's card has been checked for that character with nothing to fix, then "All set"; a bought factory, with no feeders,
    always "Routes set". A role with nothing to check reads "Nothing here to check", never "All set".
  - **Sends on** is `Chain.exported` (planets-chain.md): what reaches storage or a launchpad a day.
  - Under `SHORT_UNDER` (90%) of the plan's amount is short; from `MORE_OVER` (5%) over is a plus, said once, "3 Basic where the plan has
    2" only as its reason. Faults: not made ("Makes Precious Metals where the plan has Electrolytes" when another of its tier is made
    instead, the user's mistake of 23 October, with the chain's root cause beside it when it names one), made and sent none, short (with fewer factories or heads than planned beside it), an input
    whose route is missing (Messenger from God's P3 factory), a programme ended. Ending soon (its last quarter, at most a day) and storage near full are "to see
    to", programmes alike said together. A good downstream of a fault "makes none until what's above reaches them".
  - **The chain's flags are reasons for a fault only**: a planet's own 73–93% starving behind a plan met isn't said (the user's real Gas
    planets), nor an idle pin unrelated to what the plan needs. ESI's quantity not sent: "Can't tell yet". A planet poor a head: said,
    never a fault.
  - The chain is built with the plan's prices for its words; nothing it judges depends on them.
- **On the user's real colonies** (24 October, private, read only, `.playwright-mcp/plan-board/real-probe.mjs`), against a plan shaped
  as theirs (2 Basics a line, the factory at 5-NZNW I): every feeder all set with a plus ("3 Basic where the plan has 2"), the programmes
  ending in 24 h to see to; Messenger from God's factory "Doesn't make Gel-Matrix Biopaste" with the chain's "Nothing routes Oxides,
  Biocells and Superconductors into an Advanced factory making Gel-Matrix Biopaste".
- **The page check** (pages.mjs, the plan board block): Plan it on Gel-Matrix Biopaste: the feed open by itself and the rest folded, a
  card a planet with its badge, the lines' goods the factory's own "Takes in", one line a feeder, the glance's units, planets and resets;
  Build it's steps, a tick kept, cleared under another layout and kept through a reload; kept, then Check my setup on a feeder read fresh
  through stubbed ESI: as planned "All set", 3 Basics no fault, another P1 that fault in those words, Hand Alt (no planets permission)
  said. check.mjs pins the rules, each planted wrong once and failing.

## Limits

- **Check my setup is the colony's chain against the plan's amounts**: colonyChain's own model of the routes (planets-chain.md), and a
  factory planet's inputs taken as kept stocked, so its product is what it "can make kept stocked", not what its feeders haul to it.
- **It is the colony as EVE last saved it** (after Submit in game), which ESI holds about 10 minutes; an alt's is the cloud's read and the
  pull after it, given 90 seconds.
- **Build it is one way to place and route a layout** (through the launchpad, one launchpad and no storage, as Plan fits it); its level
  is the fit model's (minimum-length links), so the game can ask for more. Ticks live in this browser only.
