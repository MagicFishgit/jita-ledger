# EVE facts: ships, fits, mining, hauling and the Abyss

What ESI's dogma and the research said about hulls, holds, fits, mining yields and abyssal runs. Split from eve-facts.md on
1 October 2026.

Don't re-derive or contradict these without new evidence.

- **ESI has no loot tables of any kind.** Nothing says what an abyssal filament drops. Any "expected
  reward" would be invented. Don't. Abyssal returns come from the wallet instead.
- **Public contracts are public**: `/contracts/public/{region}/` needs no scope. The Forge runs to
  ~35 pages of 1,000, of which only ~120 are couriers.
- **Mining yields follow from dogma, and ESI serves all of it** (read 29 September 2026, `lib/miningYield.ts`). A laser's
  amount (77) and cycle (73); since Catalyst (18 November 2025) cycles are four times shorter (lasers 15 s, strip miners
  45 s) and amounts a quarter, so m³ a minute didn't change. Hull bonuses are effects, and **an attribute without its
  effect does nothing**: the Prospect carries the Venture's `miningAmountMultiplier` (207) = 2 but not effect 5058 that
  applies it (EVE Workbench's figures agree). Per-level bonuses scale by the skill the effect names (Mining Frigate,
  Expedition Frigates, Mining Destroyer, Mining Barge, Exhumers), role bonuses don't. Mining and Astrogeology +5% a level
  each and every Mining Laser Upgrade and yield implant (434) multiply, with no stacking penalty (ESI marks 434
  stackable). A crystal multiplies the amount before everything else (782, operator preMul) and the cycle (3161), and
  **adds** its residue points (3160, 3159, operator modAdd): Modulated Strip Miner II's 34% becomes 37.6% with Type A II,
  64% with B II, 93% at 29× the volume with C II. Survey chipsets, the Mining Precision (+10% crit chance a level) and
  Mining Exploitation (+5% crit size a level) skills are post-percent: a chipset's "−20% residue" is 34% × 0.8, not 14%.
  A crit adds the cycle's yield again twice over (5969 = 2) at a 1% chance (5967), raised half again on the Consortium
  Issues. Residue is ore the rock loses, not yours. Ice harvesters take one 1,000 m³ block a cycle; only the cycle moves
  (780: Ice Harvesting, upgrades, the ice rig, the Yeti implant, the hull), and Mining Laser Upgrades don't apply to ice,
  which needs Ice Harvesting rather than Mining. Crystals are named by family ("Simple Asteroid Mining Crystal Type B II",
  "Rare Moon Mining Crystal Type A I"); the old per-ore crystals are unpublished.
- **Hauler capacities are read from ESI, not remembered.** A Charon holds **465,000** m³, not the
  1,100,000 once written here — that was an expanded fit passed off as the hull, and it would send
  someone to a contract they cannot pick up. For hulls with a fleet hangar the usable figure is cargo
  **plus** hangar, since a courier package travels in either; that is why a Deep Space Transport with
  a 3,900 m³ hold is the standard ship for 50,000 m³ contracts.
- **Every hold bonus is read by the effect that applies it, and each moves one hold** (`lib/cargo.ts`, `CARGO_RULES`: effect,
  its bonus attribute, the hold it grows, the skill it follows per CCP's static data's traits; checked 30 September 2026). What
  was written here before was wrong on both counts: **a freighter's only cargo bonus is its racial Freighter skill's**, +5% a
  level, so a Charon at Caldari Freighter V holds **581,250** m³, not 726,563 (that compounded `freighterBonusC1`, which moves
  velocity, and Advanced Spaceship Command, which moves agility); and the other classes' bonuses do say what they move, once
  read by effect. **The Orca's Industrial Command Ships bonus grows its cargo hold and ore hold, never its 40,000 m³ fleet
  hangar** (a package can use 77,500 m³ at V). **Transport Ships grows a Deep Space Transport's fleet hangar**, not its cargo
  (a Bustard's 50,000 to 62,500). Expanded Cargoholds (×1.275 for a II), cargo rigs (+15% for a I) and Reinforced Bulkheads
  reach the cargo hold only, without a stacking penalty; a Transverse Bulkhead rig's −10% cargo drawback shrinks 10% a level
  with its rigging skill (−5% at Armor Rigging V). Specialised holds (ore, planetary, mineral, infrastructure…) take only
  their own goods and no expanders.
- **ESI renamed group 28 from "Industrial" to "Hauler"** (seen 30 September 2026), the way the skills became *Caldari
  Hauler*. `hullClassOf` and Combat's `HAULER_GROUPS` take both names; a check on the group *name* would have lost every
  Tech I industrial.
- **Abyss Tracker (abysstracker.com, built by the EVE Workbench team) has a public API with no CORS header**
  (`webapi.abysstracker.com`, read 30 September 2026; `abyss.eve-nt.uk` is the same app on IPv6 only). Its enums: tiers 0
  Tranquil to 6 Cataclysmic; weathers **0 Electrical, 1 Dark, 2 Exotic, 3 Firestorm, 4 Gamma**. `/Overview/GetOverviewData?
  tier=&weather=` gives a cell's run count, median loot per pocket by hull size with a band, drop rates and its most-run fits
  (`totalEhp` in **thousands**); `/Fit/GetEftById?id=&type=eft` a fit's EFT; `/Fit/GetPerformanceById` and
  `/Fit/GetTierTypeStats?fitId=` its runs, survival and ISK per cell. Fit pages are `abysstracker.com/fit/{id}`, a cell's
  `info-page/{tier}/{weather}`; per-ship pages don't exist ("Not implemented yet!" in its code). **A pocket's run is logged
  under one pilot's hull**, so a trio's Deacon and Vengeance never reach a most-run list though zKillboard has them as the
  4th and 5th most-lost abyssal hulls (21–29 September 2026). **Its logged losses are far too low**: the Gila's top fits log
  0.7% lost, while zKillboard shows about 25 Gilas lost in the Abyss a day. Compare fits with them; never price risk.
- **A filament's in-game description is stale; its dogma isn't.** Weather is attribute 2760 and tier 2761 on the filament.
  The descriptions still say Tranquil can't be opened in 1.0 or 0.9 and "Tech I or Tech II Cruiser" only; since patch 23.02
  (May–June 2026) Tranquil opens anywhere in high-sec, and a pocket takes one cruiser, two destroyers on two filaments or three
  frigates on three (EVE University, CCP's patch notes). The main loot can scales with filaments used (about 3× for frigates,
  2× for destroyers); the side cans don't. The weathers' strengths aren't in ESI or the static data (the wiki: penalties
  30/50% at T0–T3, 50/70% at T4–T6, bonus +50%), so the app quotes them as the wiki's (`WEATHER_STRENGTH`).
- **A mining fit's CPU, from ESI's dogma** (read 30 September 2026, `lib/fitCpu.ts`). CPU output is the hull's (48; a
  Hulk, Mackinaw, Skiff or Procurer 310, a Retriever 260, a Covetor 240), +5% a level of CPU Management (its 424), times
  each processor rig's 424 (Medium Processor Overclocking Unit I +7.1% for 150 calibration, II +9.6% for 300; effect 397).
  Each Mining Laser Upgrade raises the CPU of every module needing Mining (the lasers) by its 1082, 12.5% for a II (effect
  2444, one after another); Mining Upgrades cuts that penalty 5% a level (927, effect 2456) and not the upgrades' own 40 CPU,
  whatever its description suggests. So a Hulk with two deep-core strip miners, three upgrades, two Multispectrum Shield
  Hardener IIs, a survey chipset and a shield extender needs 412 tf at V: 387.5 without a processor rig, 415 with a Tech I,
  424.7 with a Tech II.
- **Two barge bonuses grow the ore hold** (ESI, 30 September 2026): Mining Barge +5% a level on the Retriever and Mackinaw
  (effect 5067, attribute 3187), Exhumers +2.5% a level on the Mackinaw (8251, 3198). A Retriever holds 34,375 m³ at V, a
  Mackinaw 44,297. No module grows an ore hold.
- **A fitting can't hold implants or boosters, and the import's handling of them isn't documented** (researched 30
  September 2026). ESI's saved-fitting item flags are the slots, `DroneBay`, `FighterBay` and `Cargo`, nothing for an
  implant; CCP's note on the clipboard import (Oceanus, 2016) says "only charges and ice products can be imported in the
  cargo"; CCP's current developer page on EFT lists hull, lows, mids, highs, rigs, subsystems, services, drones, cargo and
  says nothing of implants. Pyfa writes implants and boosters as their own sections after the drones, and Abyss Tracker's
  EFT carries them, but no source says whether the client skips such a line or refuses the paste. So Copy fit and Save fit
  leave them out and say so (the Copy fit tip, the toast), and Multibuy carries them. Pasting a fit with an implant line
  in game would settle it; it would only matter for a copy meant for pyfa.
- **Frigate pockets pay more than cruiser pockets**: Abyss Tracker's median loot a pocket is 2.0–2.9× a cruiser's at every
  tier (330 M against 121 M at T6), about the same per ship once split three ways. zKillboard can say a lost ship's tier only
  when a tier-named NPC is on the mail (270 of 1,847), and its weather never.
- **Every family's mining crystals share their figures by kind** (ESI, 1 October 2026: the final review read all 11
  families; Simple, Coherent, Variegated, Complex, Abyssal, Mercoxit and moon ones checked here). Attributes 782 / 3161 /
  3160 are Type A I 1.5 / 1.0 / 0, A II 1.8 / 1.0 / 3.6, B I 1.5 / 0.9 / 20, B II 1.8 / 0.8 / 30. So a fit mines every
  ore it can at one m³ a minute; only Mercoxit takes other lasers. Mercoxit has Type B crystals too (60309, 60311).
- **ESI graded the enriched ices.** Its Ice group (465) holds the 12 market ice types: 16262–16269, and 17975–17978,
  the old Thick Blue Ice, Pristine White Glaze, Smooth Glacial Mass and Enriched Clear Icicle, now Blue Ice, White
  Glaze, Glacial Mass and Clear Icicle IV-Grade (`/universe/ids` resolves none of the old names), each with a compressed
  form; Azure Ice (28627) and Crystalline Icicle (28628) sit in it with no market group. An ice is 1,000 m³ a unit,
  compressed 100.
