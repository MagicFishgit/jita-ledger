# EVE facts: planetary industry

What ESI and CCP's static data say and don't about planets, colonies and their goods. Split from eve-facts.md on 1 October
2026 (which market groups hold planetary goods stays there: the income rules read it). Brought up to date by the Planets
upgrade's research (17 October 2026, `.playwright-mcp/research/planets/mechanics.md`, which marks each fact exact, CCP-said,
reported or inferred); how the app uses them is in planets.md.

Don't re-derive or contradict these without new evidence.

- **A planet's type is a type ID**: `/universe/planets/{id}` gives `type_id` (2016 is `Planet (Barren)`), the colony routes a
  lowercase `planet_type` ("barren", "gas"). Shattered planets (713 in New Eden) and Scorched Barren have no planetary industry.
  ESI's planet route has no radius: radii are in the static data (`mapPlanets.jsonl`). Richness — the thing that decides what a
  PI planet actually yields — exists only in the client, not in ESI or the static data.
- **Lower security means richer PI planets, and that holds *inside* high-sec**: a 0.5 extracts more
  than a 1.0. A PI system list must therefore not default to sorting by security descending, which is
  the instinct everywhere else here and is exactly backwards. The size of the difference is not in
  ESI, so don't put a number on it.
- **Every recipe is in CCP's static data, not ESI** (exact). `planetSchematics.jsonl` has all 68 schematics with each input's
  quantity, the output's, the cycle and the pins that run it; ESI's `/universe/schematics/{id}/` gives only a name and a cycle
  time (65: `{"cycle_time":3600,"schematic_name":"Superconductors"}`). So the recipes are bundled, never typed from memory.
  - **P0 → P1** (15), Basic Industry Facility: 3,000 → 20 every 30 minutes, so one gets through 6,000 an hour for 40 out: 150 P0
    a P1. This was once written as 14, which flattered refining roughly tenfold and told people to build factories for a 1.08×
    gain while showing them 11.6×. Naming recipes from memory is how the 14 got in.
  - **P1 → P2** (24), Advanced: 40 each of **two different** P1s for 5 P2, hourly: 16 in per 1 out. **P2 → P3** (21), Advanced:
    10 + 10 (or + 10) for 3, hourly. **P3 → P4** (8), High-Tech Production Plant, which only Barren and Temperate planets have:
    6 + 6 P3 and 40 of a P1 (three recipes: Bacteria, Water, Reactive Metals) or 6 + 6 + 6 P3 (five), for 1, hourly.
  - Three P2s can't be made from one planet's P0s: Microfiber Shielding, Polyaramids and Silicate Glass.
- **CCP's names**: P1 is *Processed* (market group 1334), P2 *Refined* (1335), P3 *Specialized*, P4 *Advanced* (eve-facts: groups
  1333–1337). This note once called P1 "refined" and P2 "processed", the reverse; say P1 and P2. CCP spells it
  **Microorganisms** (2073), not "Micro Organisms".
- **CPU and powergrid are dogma**, in the static data and public `/universe/types/{id}/` alike (exact; checked on types 2524,
  2133, 2848, 2544, 2280): each command centre level's budget (attributes 48 `cpuOutput`, 11 `powerOutput`), every pin's load
  (49, 15), an extractor head's (`ecuExtractorHeadCPU` / `Power`: 110 CPU, 550 MW) and a link's base and per-km cost (type 2280).
  The old "not in ESI" was wrong. Two figures aren't in either: a link's minimum length, 0.012008578 × the planet's radius in km
  (EVE University's measurement, reported), and 10 heads an extractor (CCP, Incursion 1.1.0, 2011).
- **Volumes were halved in June 2023** (CCP's Viridian notes, 13 June 2023: "Volume of all PI commodities reduced by 50%"): P0
  0.005, P1 0.19, P2 0.75, P3 3, P4 50 m³, the static data and ESI agreeing. EVE University's worked volumes and evehelper's are
  from before.
- **Customs.** The tax base is dogma 1641 `exportTaxMultiplier` (exact): P0 5, P1 400, P2 7,200, P3 60,000, P4 1,200,000 ISK a
  unit. Export pays base × rate, import half (reported); a launch from the command centre pays 1.5× (reported). A high-sec player
  office charges its owner's rate plus a 10% NPC part, less a point a level of Customs Code Expertise (CCP-said). Every high-sec
  office started as InterBus's in 2013 and stays so until players shoot it, so high-sec is a mix, and what an InterBus office
  charges there today is unverified (its type carries `npcCustomsOfficeTaxRate` 0.17; EVE University says 17% outside high-sec).
- **In sovereign null-sec the Orbital Skyhook is the customs office** (CCP, Equinox expansion notes, 7 June 2024): one a planet,
  replacing the owner's customs office and copying its tax settings, its rate set by its owner. CCP's transition article says
  skyhooks don't need sovereignty, the expansion notes say player-owned sovereign null-sec; the notes are the released rules.
  **ESI shows no skyhook's rate**: the corporation skyhook routes are the owner's and carry no tax, `/skyhooks/raidable` lists only
  reagent skyhooks (212 on Ice and Lava planets, 17 October 2026), and nothing public gives a planet's customs rate. Raids take
  reagents; no source names PI goods as stealable. So a null-sec rate is the alliance's published one or what the game shows.
- **A PI extraction programme has an end date and then simply stops** (`expiry_time` on the extractor
  pin). The colony looks normal, factories drain what is left, and it earns nothing until the heads
  are reset — the commonest way PI money is lost, and a field nothing was reading.
- **Colony pins are classified by shape, not by type ID**: `extractor_details` makes it an extractor,
  a schematic a factory, anything else that holds things is storage. No list to go stale. **ESI sends a factory's schematic as
  the pin's own `schematic_id`**, not in `factory_details` (both are in its spec): every factory of the main's first kept
  colonies (18 October 2026, 30 pins over five planets) had `schematic_id` and `last_cycle_start` and no `factory_details`, so
  read by `factory_details` alone every real factory was storage. Both are read (`classify`, `keptPin`).
- **Extraction decays across a programme, by a published formula** (CCP's crowdsourced developer guide; eve-pi the same, reported;
  its decay 0.012 and noise 0.8 are the defaults of dogma 1683 and 1687, exact). Fed ESI's `qty_per_cycle`, `cycle_time`,
  `install_time` and `expiry_time`, it gives every cycle's output: a 1-day programme averages about 0.75 of its start rate, 3
  days 0.49, 7 days 0.31, 14 days 0.20. Cycles (EVE University): 15 minutes up to 25 h, 30 minutes to 50 h, 1 h to 100 h, 2 h to
  200 h, 4 h beyond. **`qty_per_cycle` is the formula's base for 15 minutes** (checked in game, 19 October
  2026: the main's 5-NZNW IV Noble Metals programme, 10,196 a 1-hour cycle over 73 h, read "Total: 1,473,445" and "Avg. Per
  hour: 20,184" in the extraction programme window, the formula's 1,473,446; read as the current cycle's output it would be
  744,308; planets.md). A May 2026 forum post said it was the current cycle's output: wrong. It is often null until the
  programme is submitted. So ESI's figure turned into an hour (`qty × 3600 / cycle`, which colony.ts read until then) was the
  formula's first-hour rate only on 15-minute cycles (half on 30-minute ones, a quarter on 1-hour, a sixteenth on 4-hour ones). How heads, programme length and richness make `qty_per_cycle` is the client's and undocumented: no planet's yield
  can be predicted before it is built.
- **A planet's richness is in no API or static data** (24 October 2026, `.playwright-mcp/research/planet-richness/report.md`): ESI's planets
  carry no resource levels and `planetResources.jsonl` is Equinox power, workforce and reagents. Only the in-game scan shows it.
