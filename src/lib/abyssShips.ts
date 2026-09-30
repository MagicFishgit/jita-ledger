/**
 * The Abyssal tree: the ships that run Abyssal Deadspace, where they sit and what leads to what, and each one's fits as
 * progression tiers. From research done on 30 September 2026 into what players run and log (Abyss Tracker's most-run
 * fits for every tier and weather, 201 of them, with their measured runs and losses; zKillboard's abyssal deaths; EVE
 * University's and Wiki Circa Kismeteer's guides). Columns are the tier a ship is first run at (T0 to T6), rows its line:
 * three frigate lines (frigates run three to a pocket, for three filaments' loot) and the Deacon that keeps a trio alive,
 * the destroyers (two to a pocket), and the cruisers: a Gila trunk, then a row for each weather's specialists. The
 * fits are Abyss Tracker's, by its fit ID: the page reads each one whole, with its measured runs, survival and ISK an
 * hour, through the cloud (lib/abyssTracker.ts). Generated from the research's notes; pure.
 */

import type { TierKey } from './fits';
import type { TreeNode } from './shipTree';

export type AbyssLane = 'laser' | 'missile' | 'logi' | 'drone' | 'destroyer' | 'cruiser' | 'dark' | 'electrical' | 'gamma' | 'fire';
export type AbyssNode = TreeNode & { name: string; lane: AbyssLane };

export const ABYSS_LANES: Record<AbyssLane, string> = {
  laser: 'Frigates: Amarr, lasers and armour', missile: 'Frigates: missiles', logi: 'A trio’s logistics',
  drone: 'Frigates: Gallente, Guristas, Triglavian', destroyer: 'Destroyers, two a pocket', cruiser: 'Cruisers: the Gila, most weathers',
  dark: 'Cruisers for Dark', electrical: 'Cruisers for Electrical', fire: 'Cruisers for Exotic and Firestorm', gamma: 'Cruisers for Gamma',
};

export const ABYSS_SHIPS: AbyssNode[] = [
  { id: 597, name: 'Punisher', col: 0, row: 0, lane: 'laser', role: 'Frigate. Used for T0 Electrical and Firestorm.',
    note: 'Armor, lasers, cap-light turrets (10%/level less laser activation cost) and 4%/level armor resists: the Amarr frigate that shrugs off T0\'s Devoted Hunter. Base armor EM 50/Th 35/Kin 25/Exp 20: the EM penalty of Electrical lands on its best resist, and Electrical\'s double cap regen feeds two small repairers; Firestorm\'s thermal penalty hits a 35% thermal, covered by a multispectrum membrane in the Solid fit. Not for Dark (turret range penalty). EVE University\'s own T0 Punisher (auth fit 303, tracker fit ID 16624, 112 DPS, 65 EHP/s, 3 M, 500k SP) was not readable (auth.eveuniversity.org/fittings answers with its login page, checked 30 Sep 2026); its skill plan is on https://wiki.eveuniversity.org/Abyssal_Community_Fits. Next step there: the Retribution.' },
  { id: 593, name: 'Tristan', col: 0, row: 2, lane: 'drone', role: 'Frigate. Used for T0 Electrical and Dark.',
    note: 'A drone frigate (10%/level drone HP and tracking): the drones do the work, so Dark\'s turret penalty matters less than for a gunboat, though uniwiki warns Dark shortens drone turrets too. The Just-in fit is step 1 of an Alpha-to-Omega track published on Abyss Tracker (its note says so); EVE University\'s Community Fits page links an \'A2O Day0 Tristan (Step I)\' at tracker fit 2996, probably the same line, not checked. The uniwiki page for the track is gone (wckg.net links a Wayback copy). Shield-tanked Tristans carry the frigate\'s 0% shield EM hole into Electrical: the fit covers it with a Multispectrum Shield Hardener I and flies at range. 18 of its 588 T0 Electrical runs were logged as losses (3%); among the T0 fits here only the Kestrel \'Alpha Friendly\' is higher (15 of 227 in T0 Dark, 7%).' },
  { id: 602, name: 'Kestrel', col: 0, row: 1, lane: 'missile', role: 'Frigate. Used for T0 Dark.',
    note: 'Light missiles/rockets with 5%/level damage and 10%/level missile velocity: missiles ignore Dark\'s turret-range penalty and enjoy its +50% velocity, so the Kestrel is the Dark T0 boat (EVE University\'s T0 Kestrel is also Dark: 82 DPS, 4.4 M, 800k SP). Shield tank with the usual 0% EM hole; Dark has no resist penalty. The \'Alpha Friendly\' fit was flown into T1 Dark too, where 15 of 93 runs were logged as losses (16%): a T0 fit.' },
  { id: 32876, name: 'Corax', col: 1, row: 3, lane: 'destroyer', role: 'Destroyer. Used for T0 Exotic, Dark, Gamma (two per pocket; runs are per 2-filament pocket).',
    note: 'Caldari destroyer with 5%/level kinetic light-missile damage, so it lines up with Exotic\'s kinetic resist penalty on the NPCs; Dark suits any missile boat. Destroyer pockets pay 2× a cruiser\'s loot but the uniwiki FAQ calls frigates the better T0 earner (3×). Tracker medians for a destroyer pocket at T0: 1.4–1.6 M.' },
  { id: 16240, name: 'Catalyst', col: 0, row: 3, lane: 'destroyer', role: 'Destroyer. Used for T0 Firestorm.',
    note: 'Blaster destroyer; the only destroyer fit in a T0 top list (Firestorm, 207 runs, 0 logged losses). Its author: \'This ship fares best in Firestorm, and may survive in Exotic\' and needs about 18 h of training on a fresh character.' },
  { id: 17703, name: 'Imperial Navy Slicer', col: 1, row: 0, lane: 'laser', role: 'Frigate. Used for T0 Electrical/Firestorm, T1 Electrical.',
    note: '25%/level small energy turret damage and 10%/level optimal: a laser sniper frigate for Electrical (double cap regen) and Firestorm. Alpha-flyable. 628 runs on its two top fits, 0 logged losses.' },
  { id: 17619, name: 'Caldari Navy Hookbill', col: 1, row: 1, lane: 'missile', role: 'Frigate. Used for T0 Exotic/Dark, T1 Dark.',
    note: '25%/level kinetic and 20%/level other light missile/rocket damage: the cheapest strong missile frigate, Alpha-flyable, the uniwiki FAQ\'s T1 pick for Alpha/low SP with the Worm. Exotic suits its kinetic bonus; Dark suits missiles. The Solid fit is an Abyssal Lurkers Alpha T1 Dark rocket fit: 850 T1 Dark runs, 15 logged losses. The newest fit in this list (Book Nook, June 2026, \'Cradle of War\').' },
  { id: 17930, name: 'Worm', col: 1, row: 2, lane: 'drone', role: 'Frigate. Used for T0–T1 Exotic, T1 Electrical/Gamma; T2 Exotic at a cost.',
    note: 'Gila\'s little sister: 10%/level kinetic+thermal missile damage, 4%/level shield resists, +300% light drone damage/HP. Kinetic missiles plus Exotic\'s kinetic penalty make T1 Exotic its home (4,202 top-fit runs). Shield EM hole (base 0%) is covered with an EM Shield Reinforcer in every fit. The Just-in fit is step 3 of an Alpha-to-Omega track published on Abyss Tracker (T1 Electrical: 31 of 740 runs logged lost, 4%). The Max fit\'s own author says it is only safe in T1; its T2 Exotic runs: 25 of 325 lost (8%). wckg: worms \'can do SOME\' T5 trios.' },
  { id: 11393, name: 'Retribution', col: 2, row: 0, lane: 'laser', role: 'Assault Frigate. Used for T1–T2 Electrical solo; T4–T6 Firestorm (and Electrical) in a trio with a Deacon.',
    note: 'Laser AF (5%/level RoF and damage, 10%/level optimal, cap cost cut). T2 armor resists EM 50/Th 35/Kin 62/Exp 80: thermal is the hole, which is exactly what Firestorm penalises, so the Firestorm fits stack thermal hardeners/coatings and Thermal Armor Reinforcer rigs (the zKill losses show the same: Coreli A-Type Thermal Coating 157, Small Thermal Armor Reinforcer II 123 of 363). Electrical\'s EM penalty hits a 50% EM and doubles cap for lasers and reps. Lasers are turrets, so never Dark. The trio: 2 Retributions + 1 Deacon (zKill: 21 such trios and 41 Deacon+Retribution pairs died together in nine days; the T6 Electrical Deacon fit\'s note: \'Requires two Retributions fits and a Deacon fit like this\'). The Max \'Tank T5/T6\' author: \'Can do T5 with nearly 100% success rate. T6 have a guaranteed death scenario: 3x Deepwatcher rooms and possible bad Leshak rooms with too many neuts/Damps.\' The most-died hull in the Abyss in the zKill window (363).' },
  { id: 37457, name: 'Deacon', col: 4, row: 1, lane: 'logi', role: 'Logistics Frigate. Used for the third ship of a Retribution trio, T4–T6 Firestorm/Electrical.',
    note: 'Remote armor repair frigate (10%/level RAR amount, 5%/level duration/cap, 7.5%/level armor HP, +600% RAR falloff). No tracker top list shows it because a run is recorded under one pilot\'s hull, but zKill shows it in 114 deaths in nine days, almost always beside Retributions. Its fits on the tracker are few (28 in all) and lightly run (55 and 21 runs).' },
  { id: 11379, name: 'Hawk', col: 2, row: 1, lane: 'missile', role: 'Assault Frigate. Used for Dark at every tier T1–T6 (trio or one pilot in a 3-filament pocket); T1–T2 Exotic.',
    note: 'Missile AF with a 7.5%/level shield-booster bonus. Missiles are untouched by Dark\'s turret penalty and gain from its +50% velocity, and the NPCs\' turrets miss from their shortened range: the Hawk owns Dark frigate pockets. T2 shield resists EM 0/Th 80/Kin 70/Exp 50: the EM hole gets a Small EM Shield Reinforcer II in every fit (and in 217 of 315 zKill losses); Dark has no resist penalty to make it worse. The highest logged death rates of any main hull: \'T6 Dark AB RR\' 68 of 411, \'Throwaway\' 75 of 1,193 at T5 (6%); its author: \'Do T5s if you want to keep your sanity, T6s if you are a pure tryhard.\' Boosters in the Max-tier fits (Blue Pill, Crash, Pyrolancea) are part of the fit. 2nd most-died hull on zKill (315).' },
  { id: 11365, name: 'Vengeance', col: 5, row: 0, lane: 'laser', role: 'Assault Frigate. Used for Dark trios (T5–T6), T0–T1 blitzing.',
    note: 'The Amarr missile AF (armor, 4%/level armor resists, cap regen). Invisible on the tracker\'s top lists but 104 deaths on zKill in nine days, 11 of them as Vengeance trios and 15 as pairs. The tracker\'s own Vengeance fits are few (31) and lightly run; \'T5D cheap\' (Dark) logged 13 losses in 100 runs. Armor profile as the Retribution (thermal hole).' },
  { id: 52250, name: 'Nergal', col: 5, row: 2, lane: 'drone', role: 'Assault Frigate. Used for T5–T6 Firestorm (and T1 Firestorm).',
    note: 'Light Entropic Disintegrator frigate (ramping thermal/explosive damage), armor EM 50/Th 75/Kin 25/Exp 65 plus 4%/level: its thermal resist is high, so Firestorm\'s thermal penalty hurts it least of any small hull, and the penalty raises its own thermal damage on the NPCs (my reading of the resist and weather data, not a quoted source). \'Tank T6\': 825 T6 Firestorm runs, 0 logged losses, 342 M average per pocket. Hull 318 M (ESI average).' },
  { id: 34828, name: 'Jackdaw', col: 4, row: 3, lane: 'destroyer', role: 'Tactical Destroyer. Used for T4–T5 Dark, as a duo (2 destroyers, 2 filaments).',
    note: 'The one destroyer with real high-tier numbers: 1,424 T4 Dark and 414 T5 Dark runs on its top fits. Light missiles (Dark), Defense mode\'s +33.3% shield resists, and the EM hole (base 0%) covered by EM rigs. wckg says destroyer pockets are \'so uncertain\' that it no longer suggests them. zKill: 36 Jackdaws died in nine days (4 as pairs), median loss 379 M.' },
  { id: 17715, name: 'Gila', col: 3, row: 4, lane: 'cruiser', role: 'Cruiser. Used for T2–T6 Exotic, Electrical, Gamma; T3–T5 Firestorm; almost never Dark.',
    note: 'The trunk of the cruiser line: 10%/level kinetic and thermal missile damage, 4%/level shield resists, +500% medium drone damage (+250% HP). 30.4% of the tracker\'s front-page \'most popular hulls\', 72 of the 201 top-list fits and 65,577 runs on them. Kinetic missiles and drones line up with Exotic\'s kinetic penalty; Gamma\'s +50% shield HP makes passive-regen fits work; Electrical\'s double cap runs an active booster. Its shield EM hole (base 0%) is why nearly every fit carries an EM Shield Reinforcer and a Multispectrum Shield Hardener (zKill: 137 of 221 losses carried the hardener). Dark is avoided (drone range). The Povertila is the most-run fit in the tracker: 18,895 runs; its note: \'Runs T4 exotic, electrical, and gamma with no drugs or implants. Runs T5 exotic with Standard Blue Pill and Hardshell II.\' The ePLEX-T4 fit is step 5 of an Alpha-to-Omega track published on Abyss Tracker. 3rd most-died hull on zKill (221, median loss 527 M).' },
  { id: 11993, name: 'Cerberus', col: 4, row: 5, lane: 'dark', role: 'Heavy Assault Cruiser. Used for T4–T6 Dark; T5 Exotic.',
    note: 'Missile HAC (HAM/HM/RLML rate of fire, 7.5%/level shield booster): the cruiser for Dark, as the Hawk is the frigate. Shield EM 0/Th 80/Kin 70/Exp 50: EM Shield Reinforcer II on 13 of 20 zKill losses. The most-run T6 Dark top fit (\'T6 Dark\', 1,022 runs) could not be read: the tracker answered \'Failed to get fit\' (probably private). \'Double web\' author: \'after 300 runs… I really like the Cerberus in T4 Darks… Although a T4 dark Muninn may be more optimised\'.' },
  { id: 12019, name: 'Sacrilege', col: 3, row: 5, lane: 'dark', role: 'Heavy Assault Cruiser. Used for T3–T4 Dark.',
    note: 'Armor missile HAC (5%/level armor resists). Armor EM 50/Th 35/Kin 62/Exp 80 (thermal hole; Dark has none). Dark T3–T4 only in the data (1,153 runs).' },
  { id: 54732, name: 'Stormbringer', col: 4, row: 6, lane: 'electrical', role: 'Cruiser. Used for T4–T6 Electrical.',
    note: 'Vorton Projector cruiser: EM/kinetic arcing damage that chains between targets within range; 6%/level shield resists on shield EM 20/Th 20/Kin 50/Exp 50. It owns the EM-penalty weather: Vorton charges deal EM and kinetic, EM the larger part (SDE: ElectroPunch Ultra M 402 EM / 379 kin, GalvaSurge Condenser Pack M 500 / 151), so Electrical\'s EM penalty on the NPCs raises its damage, and the double cap regen feeds its shield booster (my reading of the charge data and the weather table, not a quoted source). Fits cost 1.9–3.7 B; hull 579 M (ESI average). The fastest median runs in the high tiers (9:00–11:43).' },
  { id: 52252, name: 'Ikitursa', col: 4, row: 7, lane: 'fire', role: 'Heavy Assault Cruiser. Used for T3–T5 Firestorm.',
    note: 'Heavy Entropic Disintegrator HAC; armor EM 50/Th 75/Kin 25/Exp 65: like the Nergal, a thermal-resistant hull for the thermal-penalty weather. \'Ikitursa T5 Fire 1.1\': 1,039 T5 Firestorm runs, 0 logged losses. Nobody has it on a T6 top list (T6 Firestorm: 13 runs, 1 lost).' },
  { id: 11999, name: 'Vagabond', col: 4, row: 8, lane: 'gamma', role: 'Heavy Assault Cruiser. Used for T4 and T6 Gamma.',
    note: 'Autocannon HAC with a 7.5%/level shield-booster bonus; shield EM 75/Th 60/Kin 40/Exp 50, so Gamma\'s explosive penalty lands on a 50% resist (Explosive Shield Reinforcer in its losses). The surprise of the data: T6 Gamma\'s most-run fit is a Vagabond (\'!WTF P2\', 2,960 runs, 0 logged losses, 331 M) whose author writes \'You will die in that ship, Trust me… This paper thin buffer will break before you even notice. I do not recommand using this fit.\' A streamer\'s challenge fit; read the zero with that in mind.' },
  { id: 12005, name: 'Ishtar', col: 5, row: 8, lane: 'gamma', role: 'Heavy Assault Cruiser. Used for T5–T6 Gamma.',
    note: 'Drone HAC (heavy and sentry drone bonuses). Shield-tanked with an X-Large booster in Gamma: shield EM 0/Th 60/Kin 85/Exp 50 (Gamma hits the 50% explosive). The priciest fits in this list: 4.1 B and 17.9 B (the T6 one with a full High-grade Crystal implant set); 612 M/h measured in T6 Gamma. The T5 fit\'s author: \'Mid-grade crystals Alpha > Epsilon mandatory.\' zKill: 35 died in nine days, median 355 M.' },
  { id: 621, name: 'Caracal', col: 1, row: 4, lane: 'cruiser', role: 'Cruiser. Used for T1–T2 Gamma.',
    note: 'The cheap T1 cruiser option on a T1 Gamma top list; 7 of 181 runs logged lost. The uniwiki FAQ: a T1 cruiser earns about what a T0 frigate does.' },
  { id: 17843, name: 'Vexor Navy Issue', col: 2, row: 8, lane: 'gamma', role: 'Cruiser. Used for T2 Gamma and Firestorm.',
    note: 'Drone/hybrid navy cruiser, the T2 cruiser alternative to the Gila. Author of both: single-purpose fits (\'for T4+ use Ishtar instead\').' },
  { id: 12023, name: 'Deimos', col: 3, row: 7, lane: 'fire', role: 'Heavy Assault Cruiser. Used for T3 Exotic.',
    note: 'Blaster armor HAC: a 328 M \'facetank\' for T3 Exotic (245 runs, 0 lost); shield/armor kinetic resist 85/84 covers Exotic\'s kinetic penalty.' },
  { id: 17709, name: 'Omen Navy Issue', col: 2, row: 6, lane: 'electrical', role: 'Cruiser. Used for T2 Electrical.',
    note: 'Laser navy cruiser; 115 T2 Electrical runs. Its 2 T3 runs were both logged lost.' },
];

/**
 * Paths: along each frigate line; from the Retribution to the Deacon and Vengeance that fly with it; from the Worm and
 * the Caracal into the Gila; and from the Gila to each weather's specialist. Within a weather's row the arrows are the
 * steps up in tier (Gamma: a Vexor Navy Issue at T2, a Vagabond at T4, an Ishtar at T5–T6), not a skill path.
 * `treeProblems` (lib/shipTree.ts) checks that none runs behind a ship it doesn't join.
 */
export const ABYSS_EDGES: [number, number][] = [
  [597, 17703], [17703, 11393], [11393, 11365], [11393, 37457],
  [602, 17619], [17619, 11379],
  [593, 17930], [17930, 17715],
  [16240, 32876], [32876, 34828],
  [621, 17715], [17715, 11993], [12019, 11993], [17715, 54732], [17709, 54732], [17709, 12019],
  [17715, 11999], [17843, 11999], [11999, 12005], [17843, 12023], [17715, 52252],
];

/** A ship's fits as tiers: Abyss Tracker's fit ID, its name there, and which tier the research put it at. */
export type AbyssTier = { key: TierKey; label: string; name: string; id: string };

export const ABYSS_TIERS: Record<number, AbyssTier[]> = {
  597: [ // Punisher
    { key: 'start', label: 'Just in', name: 'T0 Electrical Newbie Punisher', id: '829ee04f-7b6a-49ff-9463-9edeaea95ff7' },
    { key: 'solid', label: 'Solid', name: 'Punisher T0 Electrical/Firestorm', id: 'ce786e87-938b-4a1c-9b82-9b8be2c8ae60' },
  ],
  593: [ // Tristan
    { key: 'start', label: 'Just in', name: 'Uriels Uni Abyss', id: '650a4958-225a-4b6a-b9cc-387d0145907c' },
    { key: 'solid', label: 'Solid', name: 'Robotic Exotic', id: '7f709ed2-9762-40ec-98e5-76d99af3438a' },
  ],
  602: [ // Kestrel
    { key: 'start', label: 'Just in', name: 'T1 Dark Abyssal - Alpha Friendly', id: 'f8833bbe-3df3-4d50-912d-2e54ef21c71e' },
    { key: 'solid', label: 'Solid', name: 'Kestrel - T0 Dark Missile', id: '46fe4106-1683-4ade-95ae-900de36a78c4' },
  ],
  32876: [ // Corax
    { key: 'start', label: 'Just in', name: 'Day 1 Abyss DarkT0', id: 'fe5cef2e-5832-4461-ba23-f72abfe7dbbb' },
    { key: 'solid', label: 'Solid', name: 'High DPS T0 Corax Exotic', id: 'f03ea364-d25b-4947-ae2d-4de9127d3d27' },
  ],
  16240: [ // Catalyst
    { key: 'start', label: 'Just in', name: 'T0 Abyss Mk.5 HighCap Meta4', id: '1291106a-dc57-4cb5-b41f-47535b31de20' },
  ],
  17703: [ // Imperial Navy Slicer
    { key: 'start', label: 'Just in', name: 'Alpha T0 Slicer', id: 'c2cc580c-1a91-4948-9d61-77533e230855' },
    { key: 'solid', label: 'Solid', name: '*Alpha T1 (maybe T2) Electricals', id: '39f8ab49-657b-42ca-9242-995b33ac06bf' },
  ],
  17619: [ // Caldari Navy Hookbill
    { key: 'start', label: 'Just in', name: 'Book Nook T0 Exotic', id: '19cc6e96-530b-4753-8c35-8af241ae4dc1' },
    { key: 'solid', label: 'Solid', name: 'Alpha T1 Dark Rocket Hookbill', id: '19d47a5d-7d74-497e-a524-54dde7f0b3c4' },
    { key: 'max', label: 'Max', name: 'T0 Abyss Champion V2', id: '9aef23f7-3d5c-46f8-988a-01be85cbe629' },
  ],
  17930: [ // Worm
    { key: 'start', label: 'Just in', name: 'Uriels-Electrical-Worm-PLEX \'er', id: 'acf11d59-d594-488f-b655-900e9d383e1f' },
    { key: 'solid', label: 'Solid', name: '*Worm T1 Exotic', id: '96996634-5791-4f1b-baf6-339af47fb564' },
    { key: 'max', label: 'Max', name: 'Solo T2 Alpha Fit - Fund your own Omega', id: '54a8f899-4dd0-4662-ab34-65a6ceb260fa' },
  ],
  11393: [ // Retribution
    { key: 'start', label: 'Just in', name: 'T1 Electrical Blitz Pulse Retribution', id: '84be6cc7-71a3-415e-9291-1d94b4767079' },
    { key: 'solid', label: 'Solid', name: 'Den\'s T2 Electrical Retribution', id: '118fbc3d-a3a3-40bc-864a-48724be03608' },
    { key: 'max', label: 'Max', name: 'Tank T5/T6', id: '42e007b2-de65-47f8-8713-9b71cbbe00c2' },
    { key: 'max', label: 'Max, alternative', name: 'Fires w/Deacon', id: '06755581-61cb-4086-9688-523a5ce608d1' },
    { key: 'max', label: 'Max, cheap DPS', name: 'DPS T5 CHEAP Pulse', id: '2e935ff4-3079-4e73-b8f2-0033f23cfaee' },
  ],
  37457: [ // Deacon
    { key: 'solid', label: 'Solid', name: 'Fukomy Deacon, T5/T6 Fire', id: 'cedbcb44-4b9e-4e70-b508-c7150119aac6' },
    { key: 'solid', label: 'Solid, Electrical', name: 'T6 Electrical Deacon', id: '899954d3-640c-4d98-85c2-91544f6e3055' },
  ],
  11379: [ // Hawk
    { key: 'start', label: 'Just in', name: '#1 Hawk', id: 'fa69f561-eb69-4b7f-a616-561444a95142' },
    { key: 'solid', label: 'Solid (T2 Exotic)', name: 'Solo T2 Exotics', id: '36ff59f7-62c2-4609-bfdc-63883ca85917' },
    { key: 'solid', label: 'Solid', name: 'T5 Triple LML Dark Throwaway Hawk', id: '45035f02-e737-4d6c-9b43-2fa3473443d3' },
    { key: 'max', label: 'Max', name: 'T5/T6 Cheap Hawk', id: '557a8694-b6d5-46d8-a0e4-d6790744aa8c' },
  ],
  11365: [ // Vengeance
    { key: 'start', label: 'Just in', name: 'T1 Rocket Vengeance Blitzer', id: '63c7fd6d-64b8-4ffb-8d04-27505f722e00' },
    { key: 'solid', label: 'Solid', name: 'T5D cheap', id: 'db1308ac-8266-49a9-835e-42c9f866d17f' },
  ],
  52250: [ // Nergal
    { key: 'start', label: 'Just in', name: 'Stinger', id: '7a782f9e-befc-4c93-ba31-38c6bd85b1d7' },
    { key: 'max', label: 'Max', name: 'Tank T6', id: '910e58e5-4033-47fb-8d4c-9b285783a221' },
  ],
  34828: [ // Jackdaw
    { key: 'start', label: 'Just in', name: 'T2-T3 Solo, T4-T6 Duo Abyssal Dark PvE Jackdaw', id: '6b9c7698-c502-4095-a3c6-4f044926b7bf' },
    { key: 'solid', label: 'Solid', name: 'Jackdaw-寒鸦级-黑暗 加力', id: '5d4632e3-613c-4901-8ff0-9ead7486a06e' },
    { key: 'max', label: 'Max', name: 'V4 T5 Dark Duo Jackdaw', id: '3eec3650-718f-4bac-842c-bacf2a259cb5' },
  ],
  17715: [ // Gila
    { key: 'start', label: 'Just in', name: 'Uriels-ePLEX-T4', id: '5493f663-3c42-4dec-90c1-40942dd594ca' },
    { key: 'start', label: 'Just in (the classic)', name: 'Povertila', id: '557cf65f-d8f8-4f46-8205-bebc85c85539' },
    { key: 'solid', label: 'Solid (Gamma, passive)', name: 'The Passive Fit', id: '4c278fec-2f8b-484f-96db-ede36e6e96b0' },
    { key: 'solid', label: 'Solid', name: 'Uriels-ePLEX-T5', id: '4bc029f9-ce48-42b2-9729-d7894d38ffb9' },
    { key: 'max', label: 'Max (T6 Gamma)', name: 'T6 Gamma easy', id: '9c0087ee-a475-46b0-95e5-046d84979f3b' },
    { key: 'max', label: 'Max (T6 Electrical)', name: 'Abyss T6 Mid-Tier', id: '323ed2e0-a61b-47be-a505-16e8b331ceb8' },
  ],
  11993: [ // Cerberus
    { key: 'start', label: 'Just in', name: '#1 T4 Dark Double web', id: 'e2615688-80ad-4726-b1fd-22785579f41e' },
    { key: 'solid', label: 'Solid/Max', name: 'Cerberus DARK T5 2.2', id: '88cbf5c3-0eb4-470c-950d-b29e883c49c7' },
  ],
  12019: [ // Sacrilege
    { key: 'start', label: 'Just in', name: 'Agatha King Mk-5BJ', id: '145414d0-da1d-4bfa-b06b-ddfe365c1c64' },
    { key: 'solid', label: 'Solid', name: 'Agatha King 5BJ', id: 'f26c46cc-ea53-4d9b-9405-9a4491e0ae51' },
  ],
  54732: [ // Stormbringer
    { key: 'solid', label: 'Solid', name: '*Electrical Abyss', id: '9a8fa2af-0fa0-4523-9b81-102bb2119f90' },
    { key: 'solid', label: 'Solid (T4, one implant)', name: 'T4 AB Electrical, One implant Stormbringer]', id: '31260581-690e-484f-a06d-bd5ec8a2d308' },
    { key: 'max', label: 'Max', name: 'T6 MWD Electrical Stormbringer', id: '2880b41d-2551-4f6a-a3f8-f5dc7fc3d587' },
  ],
  52252: [ // Ikitursa
    { key: 'start', label: 'Just in', name: 'IKI T4 FIRESTROM', id: '1f931574-4f77-4aab-a440-7873d4403255' },
    { key: 'solid', label: 'Solid', name: '*Ikitursa T4 Fire', id: '96c3ed77-d78d-485a-ad1e-aa03f7d31dd7' },
    { key: 'max', label: 'Max', name: '*Ikitursa T5 Fire 1.1', id: '3552ee39-2a8d-4df7-8145-816fef7e882c' },
  ],
  11999: [ // Vagabond
    { key: 'start', label: 'Just in', name: '-= V =-', id: 'ef679cda-6643-432f-87f8-cbae89272990' },
    { key: 'max', label: 'Max', name: 'TC\'s T6 Cataclysmic Gamma', id: '2a092c95-799c-44e6-8444-03c23fbe1f13' },
    { key: 'max', label: 'Max (as flown, not recommended by its author)', name: '!WTF P2 THECORRUPTED T6 CATACLYSMIC GAMMA', id: 'ecc7bdf9-80f7-40ed-bb0e-32f54444e797' },
  ],
  12005: [ // Ishtar
    { key: 'solid', label: 'Solid', name: 'T5 Gamma', id: '8df7ff28-f51e-4fb9-b529-cdd4a79959ef' },
    { key: 'max', label: 'Max', name: 'T6 Gamma Ishtar', id: '0924571e-223a-4541-add9-9a941420f31a' },
  ],
  621: [ // Caracal
    { key: 'start', label: 'Just in', name: 'T2 Gamma Caracal', id: '02eac6fd-122f-4698-acea-ceb1afb4341c' },
  ],
  17843: [ // Vexor Navy Issue
    { key: 'start', label: 'Just in (Gamma)', name: 'Gamma T2', id: '6b0a461d-d66d-4fd5-a36c-87fffbeeff3d' },
    { key: 'start', label: 'Just in (Firestorm)', name: 'Fire T2 Blasters', id: '71853963-c25e-43a5-a82b-3d5964dd1730' },
  ],
  12023: [ // Deimos
    { key: 'start', label: 'Just in', name: 'Deimos T3 Exotic starter', id: 'e5e4dbc3-ba87-406f-bd7d-a5699d38e05b' },
  ],
  17709: [ // Omen Navy Issue
    { key: 'start', label: 'Just in', name: 'T3 Electrical ONI', id: 'f0bd1621-8d99-4b60-aa9a-76eee3ae9877' },
  ],
};
