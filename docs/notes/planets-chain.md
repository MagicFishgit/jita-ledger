# Planets: a colony's chain

Decisions worth not undoing. A real colony's chain, worked out from its kept document (`colonyChain.ts`, pure): which pin feeds
which, what it makes a day with every output valued, what's wrong at its root, and how it compares with the planner's best for
that planet (`versusBest`). Split from planets-colonies.md on 19 October 2026 (Task 15b's fix round, the notes budget: Planets.tsx
loaded 139,263 of 140,000), which keeps the `colonies` document, the cloud's reads and the Colonies section; the planner is in
planets-planner.md.

- **A colony's real chain** (Task 15 and its fix rounds, `colonyChain`, `versusBest` in `colonyChain.ts`, pure; Task 16 draws it).
  From a kept colony and the planet's customs tax (`customsRate`'s, passed in: the document carries no security or skills):
  - **Pins**: an extractor and a factory by their shape; storage, a launchpad, a command centre and a factory with no schematic by
    ESI's type ID (`PIN_TYPES`, CCP's static data build 3569502: the bundle holds capacities, not IDs).
  - **Rates**: each extractor's whole programme on the reading `checked` names (`PI_READING` by default), the other beside it while
    unchecked; a programme that gives none (no quantity a cycle) is null with why, and then nothing is worked out, never at 0.
  - **The routes, pin by pin** (Ruling T15-3). Each factory input is decided from the routes first: it reaches (routed from a pin
    that makes it, or from storage or a launchpad such a pin routes it into), it's imported, or it doesn't (`starving` at that
    factory, which makes nothing; one flag a factory for each reason, naming its inputs). Then, a tier at a time, what a pin makes
    goes to the factories routed straight from it, up to what they take at full rate, then into the storage or launchpads it's
    routed to; a storage or launchpad supplies only what's routed into it (its contents are stock, never a rate), and what's left
    there is exported. A factory runs at its least share (fewer cycles when short); what it drew beyond its use goes back to
    storage. The first version pooled each good across the colony, so Basics drawing from a storage nothing filled read as fed.
    **The command centre is storage here** (Ruling T15-6): a route into or out of it is followed, which the first fix round's
    didn't (an extractor routed into it read as starving its Basics). A factory drawing from a holder that nothing on the planet
    routes a good into, the good also made here, "runs only on what you bring in": the chain counts it as making none ("and isn't
    counted here", T15-7), but "so it makes none" was false for a factory the user tops up. **A P0 is never brought in** (T15-7): from
    a holder nothing fills, an idle extractor on the planet says it ("with it, the Bacteria factories make nothing"), else "so it
    makes none"; a fresh extractor with no product read 288,000 Microorganisms a day imported.
  - **Imports** (Ruling T15-2): an input nothing on the planet makes, routed in from storage or a launchpad, is brought in (a
    factory planet fed from its launchpad): never starving, worked out as kept stocked (`imports`), and the planet's ISK a day is
    null, "Its … come from off the planet, and their cost isn't known here", never 0. The first version read such a planet as
    "starving, makes nothing" at 0 ISK.
  - **Valuing**: what's left of each good is an output (the surplus P1 and P0 included), shipped only while a unit pays (Ruling
    T15-5, the planner's `keptWhy`; a P0 with no price stays too), sold and taxed as the planner does (`taxRows`; I1). Every real
    colony's P0 left over nets −0.17 to −1.33 ISK a unit through Brave Freight, and was counted sold at a loss. A good that can't leave sells none, "isn't shipped", counted in `unshipped`, never as unpriced. ISK a day is 0
    with no why when nothing it makes leaves: Task 16 says so in words, never "0 ISK".
  - **Flags, only at the root** (Ruling T15-3): `starving` under `STARVING_BELOW` (95%) of what an input's factories take (a Basic
    losing about 2 of its 48 cycles a day; a programme's rate is its average, which falls across it), its percent floored, never
    "100%", on the lower reading saying when the higher gives enough, its words naming the factories after it that it holds back;
    never a shortfall a flag before it explains (an extractor with no programme, for its P0 or, with no product set, only the goods
    its routes carry; a maker routed nowhere; makers short of their own inputs). The first version flagged 11,950 into 12,000 and
    the good after it, "100% of the time"; the first fix round let an extractor with no product set explain every P0, hiding
    another's real shortfall. `buildingUp` for an extractor's or a running factory's product routed nowhere (a factory that
    doesn't run makes nothing to build up, and explains nothing after it), or more than the factories it's routed to take with no
    storage route, said as the route alone;
    `storageFull` at 95% of capacity, as of the colony's last update in game; `expired` and `endingSoon` as the colony panel judges
    them (`ENDING_SOON_HOURS`), the figures staying at the programme's rate; `idle` for a factory with no schematic or an extractor
    with no programme.
  - **`versusBest`** sets the planet's ISK a day against the better of `planSingle`'s P0 → P1 and P0 → P2 for that planet alone, at
    the same rates and the colony's own level (the caller plans with `ccLevel` the chain's `level`): what it pays more and on what
    ("the best P2 it can make alone here, Mechanical Parts, pays 480,000 ISK more a day"), a rate the planner only assumes said as
    that, nothing within a cent or above. **A best that doesn't fit at the colony's own level is no better**: nothing said, never a
    suggestion to train (Ruling T15-1; the fit's CPU and powergrid against that level's budget), and so is one whose fit isn't
    checked (the planet's size not known). On the formula's reading the first version told every real colony the planner's own
    layout paid more: sized to the higher rate, it didn't fit at their level. An output unpriced on either side, or no valued ISK on either, gives no gain, with why: never a gain against 0.
    A P0 left over with no price isn't one: nothing on both sides, said.
    **The best is planned beside the colony's own storage and launchpads** (Ruling T15b-1, the user's own; `PlanInput.reserve`, built by
    `reserveFor(k)` for versusBest's planet only: Plan passes none, one launchpad and no storage). The fit model has no storage, so
    after F9 the best won on every real colony by putting a third Basic in the storage facility's room (5B+2A against 4B+2A with
    storage), and the user: "there is no point to it … i would just be overproducing one of the p1's"; they route the P0 into
    storage, the factories draw from it, and rely on it through a programme's decay. With it kept, a colony laid out as theirs is its
    own best. **For the colony's own products the words say what differs** (`differsSaid`): another mix of factories ("3 Basics on
    Precious Metals where you run 2"), or factories it has that make less than they can ("your 2 Advanced on Nanites make 120 a day
    where they can make 240 (a flag above says why)", as on 5-NZNW III), never a bare "pays more".

## Limits

Moved here from planets-colonies.md with the chain: state these rather than letting them be discovered.

- **A colony's chain is a model of its routes, not the game's router**: it follows each good pin by pin, but where the game's
  order isn't known it's chosen: a pin's product goes first to the factories routed straight from it, splits evenly over the
  storage it's routed to, and a storage's is shared among the factories routed from it by what each takes at full rate. Route
  quantities and factories' own buffers aren't read, storage routed into storage isn't followed, and a factory whose output goes
  nowhere is counted as running. The command centre is taken as storage (the game's own handling of a route through it isn't in
  these notes), and isn't judged full: its capacity isn't in the planets bundle.
- **What reaches storage, a launchpad or the command centre is counted as exported and sold** while it pays to ship (a good left in
  the command centre at the export rate, though a launch from it pays 1.5×): nothing leaves until it goes through the customs office
  (from storage, a transfer to a launchpad first), so the chain's ISK a day is what the colony makes for market, not what has
  sold; a P0 surplus left in storage is counted with it.
