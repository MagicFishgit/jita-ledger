/**
 * The Abyssal tree: the ships that run Abyssal Deadspace, where they sit and what leads to what, and each one's fits as
 * progression tiers. From research done on 30 September 2026 into what players run and log (Abyss Tracker's most-run
 * fits for every tier and weather, 201 of them, with their measured runs and losses; zKillboard's abyssal deaths; EVE
 * University's and Wiki Circa Kismeteer's guides). Columns are the tier a ship is first run at (T0 to T6), rows its line:
 * three frigate lines (frigates run three to a pocket, for three filaments' loot) and the Deacon that keeps a trio alive,
 * the destroyers (two to a pocket), and the cruisers: a Gila trunk, then a row for each weather's specialists. The
 * fits are Abyss Tracker's, by its fit ID: the page reads each one whole, with its measured runs, survival and ISK an
 * hour, through the cloud (lib/abyssTracker.ts). Each ship's bonuses, points and research figures were written by hand
 * from the research's notes (30 September 2026) to be read at a glance: edit them here, don't regenerate over them. Pure.
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
    bonuses: ['10% less laser capacitor use a level', '4% armour resists a level'],
    points: [
      { kind: 'good', lead: 'Electrical', text: 'Its EM penalty lands on the Punisher’s best armour resist, and double cap regen feeds two small repairers.' },
      { kind: 'good', lead: 'Firestorm', text: 'The thermal penalty hits a weaker resist; the Solid fit covers it with a multispectrum membrane.' },
      { kind: 'good', lead: 'Tranquil', text: 'Shrugs off the Devoted Hunter that T0 pockets send.' },
      { kind: 'avoid', lead: 'Dark', text: 'Lasers are turrets, and Dark shortens turret range.' },
    ] },
  { id: 593, name: 'Tristan', col: 0, row: 2, lane: 'drone', role: 'Frigate. Used for T0 Electrical and Dark.',
    bonuses: ['10% drone hit points and tracking a level'],
    points: [
      { kind: 'good', lead: 'Dark', text: 'The drones do the damage, so Dark’s turret penalty matters less than for a gunboat (it shortens drone guns too).' },
      { kind: 'hole', lead: 'EM', text: 'A shield Tristan has none; in Electrical its fit covers it with a Multispectrum Shield Hardener and fights at range.' },
      { kind: 'info', lead: 'Just in', text: 'Step 1 of an Alpha-to-Omega track published on Abyss Tracker.' },
    ],
    stats: [
      { value: '3%', label: 'of its T0 Electrical runs logged lost (18 of 588)', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
    ] },
  { id: 602, name: 'Kestrel', col: 0, row: 1, lane: 'missile', role: 'Frigate. Used for T0 Dark.',
    bonuses: ['5% missile damage a level', '10% missile velocity a level'],
    points: [
      { kind: 'good', lead: 'Dark', text: 'Missiles ignore Dark’s turret-range penalty and gain its +50% velocity: the T0 Dark boat.' },
      { kind: 'hole', lead: 'EM', text: 'Shield-tanked with the usual 0% EM; Dark has no resist penalty to make it worse.' },
      { kind: 'warn', lead: 'Tranquil only', text: 'Its “Alpha Friendly” fit, flown into T1 Dark, lost 15 of 93 logged runs (16%).' },
      { kind: 'info', lead: 'EVE University', text: 'Its own T0 Kestrel is a Dark one too: 82 DPS, 4.4 M, 800k skill points.' },
    ] },
  { id: 32876, name: 'Corax', col: 1, row: 3, lane: 'destroyer', role: 'Destroyer. Used for T0 Exotic, Dark, Gamma (two per pocket; runs are per 2-filament pocket).',
    bonuses: ['5% kinetic light missile damage a level'],
    points: [
      { kind: 'good', lead: 'Exotic', text: 'Its kinetic bonus lines up with Exotic’s kinetic resist penalty on the enemies.' },
      { kind: 'good', lead: 'Dark', text: 'A missile boat, so Dark’s turret-range penalty doesn’t touch it.' },
      { kind: 'info', lead: 'Two a pocket', text: 'A destroyer pocket pays about 2× a cruiser’s loot; frigates get 3×, so EVE University calls them the better T0 earner.' },
    ],
    stats: [
      { value: '1.4–1.6 M', label: 'median loot, a T0 destroyer pocket', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
    ] },
  { id: 16240, name: 'Catalyst', col: 0, row: 3, lane: 'destroyer', role: 'Destroyer. Used for T0 Firestorm.',
    points: [
      { kind: 'good', lead: 'Firestorm', text: 'The only destroyer on a T0 most-run list: 207 runs, none logged lost.' },
      { kind: 'quote', lead: '“T0 Abyss Mk.5 HighCap Meta4”', text: 'This ship fares best in Firestorm, and may survive in Exotic.' },
      { kind: 'tip', lead: 'Training', text: 'About 18 hours on a fresh character, by its fit’s note.' },
    ] },
  { id: 17703, name: 'Imperial Navy Slicer', col: 1, row: 0, lane: 'laser', role: 'Frigate. Used for T0 Electrical/Firestorm, T1 Electrical.',
    bonuses: ['25% small energy turret damage a level', '10% optimal range a level'],
    points: [
      { kind: 'good', lead: 'Electrical', text: 'A laser sniper, and Electrical’s double cap regen keeps its lasers firing.' },
      { kind: 'good', lead: 'Firestorm', text: 'The other weather its most-run fits are flown in.' },
      { kind: 'tip', lead: 'Alpha', text: 'Flyable on an Alpha clone.' },
    ],
    stats: [
      { value: '628', label: 'runs on its two most-run fits, none logged lost', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
    ] },
  { id: 17619, name: 'Caldari Navy Hookbill', col: 1, row: 1, lane: 'missile', role: 'Frigate. Used for T0 Exotic/Dark, T1 Dark.',
    bonuses: ['25% kinetic light missile and rocket damage a level', '20% other missile damage a level'],
    points: [
      { kind: 'good', lead: 'Exotic', text: 'Its kinetic bonus lines up with Exotic’s kinetic penalty.' },
      { kind: 'good', lead: 'Dark', text: 'Missiles, so Dark’s turret penalty doesn’t touch it.' },
      { kind: 'tip', lead: 'Alpha', text: 'The cheapest strong missile frigate, Alpha-flyable: EVE University’s T1 pick for low skill points, with the Worm.' },
      { kind: 'info', lead: 'Solid', text: 'An Abyssal Lurkers Alpha T1 Dark rocket fit: 850 T1 Dark runs, 15 logged lost.' },
      { kind: 'info', lead: 'Just in', text: 'The newest fit on the tree (June 2026).' },
    ] },
  { id: 17930, name: 'Worm', col: 1, row: 2, lane: 'drone', role: 'Frigate. Used for T0–T1 Exotic, T1 Electrical/Gamma; T2 Exotic at a cost.',
    bonuses: ['10% kinetic and thermal missile damage a level', '4% shield resists a level', '+300% light drone damage and hit points'],
    points: [
      { kind: 'good', lead: 'Exotic', text: 'Kinetic missiles meet Exotic’s kinetic penalty: T1 Exotic is its home.' },
      { kind: 'hole', lead: 'EM', text: 'The shield has none; every fit carries an EM Shield Reinforcer.' },
      { kind: 'info', lead: 'Just in', text: 'Step 3 of an Alpha-to-Omega track published on Abyss Tracker: 31 of 740 T1 Electrical runs logged lost (4%).' },
      { kind: 'warn', lead: 'Max', text: 'Its own author says it’s only safe in T1: 25 of its 325 T2 Exotic runs were logged lost (8%).' },
      { kind: 'info', lead: 'Trios', text: 'Wiki Circa Kismeteer: Worms “can do SOME” T5 trios.' },
    ],
    stats: [
      { value: '4,202', label: 'T1 Exotic runs on its most-run fits', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
    ] },
  { id: 11393, name: 'Retribution', col: 2, row: 0, lane: 'laser', role: 'Assault Frigate. Used for T1–T2 Electrical solo; T4–T6 Firestorm (and Electrical) in a trio with a Deacon.',
    bonuses: ['5% laser rate of fire and damage a level', '10% optimal range a level', 'Lasers use less capacitor'],
    points: [
      { kind: 'good', lead: 'Firestorm', text: 'At T4–T6 in a trio: two Retributions and a Deacon.' },
      { kind: 'good', lead: 'Electrical', text: 'The EM penalty hits a 50% resist, and double cap feeds lasers and repairers. Solo at T1–T2.' },
      { kind: 'hole', lead: 'Thermal', text: 'Its weakest armour resist and the one Firestorm penalises: those fits stack thermal hardeners, coatings and rigs.' },
      { kind: 'avoid', lead: 'Dark', text: 'Lasers are turrets.' },
      { kind: 'quote', lead: '“Tank T5/T6”', text: 'Can do T5 with nearly 100% success rate. T6 have a guaranteed death scenario: 3x Deepwatcher rooms and possible bad Leshak rooms with too many neuts/Damps.' },
    ],
    stats: [
      { value: '363', label: 'lost in 9 days, the most of any hull', source: 'zKillboard, ships lost in the Abyss, 21–29 September 2026' },
      { value: '21', label: 'trios of two Retributions and a Deacon lost together', source: 'zKillboard, ships lost in the Abyss, 21–29 September 2026' },
      { value: '157 of 363', label: 'losses carried a thermal coating', source: 'zKillboard, ships lost in the Abyss, 21–29 September 2026' },
    ] },
  { id: 37457, name: 'Deacon', col: 4, row: 1, lane: 'logi', role: 'Logistics Frigate. Used for the third ship of a Retribution trio, T4–T6 Firestorm/Electrical.',
    bonuses: ['10% remote armour repair amount a level', '5% repair duration and capacitor a level', '7.5% armour hit points a level', '+600% remote repair falloff'],
    points: [
      { kind: 'info', lead: 'The trio', text: 'The third ship beside two Retributions, T4–T6 Firestorm and Electrical.' },
      { kind: 'info', lead: 'Not on the lists', text: 'A pocket’s run is logged under one pilot’s ship, so no most-run list shows it; its own fits are few (28) and lightly run.' },
    ],
    stats: [
      { value: '114', label: 'lost in 9 days, nearly always beside Retributions', source: 'zKillboard, ships lost in the Abyss, 21–29 September 2026' },
    ] },
  { id: 11379, name: 'Hawk', col: 2, row: 1, lane: 'missile', role: 'Assault Frigate. Used for Dark at every tier T1–T6 (trio or one pilot in a 3-filament pocket); T1–T2 Exotic.',
    bonuses: ['7.5% shield booster amount a level'],
    points: [
      { kind: 'good', lead: 'Dark', text: 'Missiles ignore Dark’s turret penalty and gain its +50% velocity, while the enemies’ turrets miss: it owns Dark frigate pockets.' },
      { kind: 'hole', lead: 'EM', text: 'The shield has none: every fit carries a Small EM Shield Reinforcer II (217 of its 315 losses did).' },
      { kind: 'warn', lead: 'Deaths', text: 'The highest logged death rates of any main hull: “T6 Dark AB RR” lost 68 of 411 runs, “Throwaway” 75 of 1,193 at T5.' },
      { kind: 'quote', lead: '“Throwaway”', text: 'Do T5s if you want to keep your sanity, T6s if you are a pure tryhard.' },
      { kind: 'tip', lead: 'Boosters', text: 'The Max fits count their boosters (Blue Pill, Crash, Pyrolancea) as part of the fit.' },
    ],
    stats: [
      { value: '315', label: 'lost in 9 days, 2nd of any hull', source: 'zKillboard, ships lost in the Abyss, 21–29 September 2026' },
    ] },
  { id: 11365, name: 'Vengeance', col: 5, row: 0, lane: 'laser', role: 'Assault Frigate. Used for Dark trios (T5–T6), T0–T1 blitzing.',
    bonuses: ['4% armour resists a level'],
    points: [
      { kind: 'good', lead: 'Dark', text: 'Flown in Dark trios at T5–T6, and to blitz T0–T1.' },
      { kind: 'hole', lead: 'Thermal', text: 'Armour like the Retribution’s: thermal is the weak resist.' },
      { kind: 'info', lead: 'Not on the lists', text: 'A pocket’s run is logged under one pilot’s ship; its own fits are few (31) and lightly run.' },
      { kind: 'warn', lead: '“T5D cheap”', text: 'Logged 13 losses in 100 Dark runs.' },
    ],
    stats: [
      { value: '104', label: 'lost in 9 days (11 as trios, 15 as pairs)', source: 'zKillboard, ships lost in the Abyss, 21–29 September 2026' },
    ] },
  { id: 52250, name: 'Nergal', col: 5, row: 2, lane: 'drone', role: 'Assault Frigate. Used for T5–T6 Firestorm (and T1 Firestorm).',
    bonuses: ['4% armour resists a level'],
    points: [
      { kind: 'good', lead: 'Firestorm', text: 'Its thermal resist is high, so the thermal penalty hurts it least of any small hull (the research’s reading).' },
      { kind: 'info', lead: 'Weapon', text: 'A Light Entropic Disintegrator: thermal and explosive damage that ramps up on one target.' },
    ],
    stats: [
      { value: '825', label: 'T6 Firestorm runs on “Tank T6”, none logged lost', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
      { value: '342 M', label: 'average loot a pocket there', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
    ] },
  { id: 34828, name: 'Jackdaw', col: 4, row: 3, lane: 'destroyer', role: 'Tactical Destroyer. Used for T4–T5 Dark, as a duo (2 destroyers, 2 filaments).',
    bonuses: ['Defense mode: +33.3% shield resists'],
    points: [
      { kind: 'good', lead: 'Dark', text: 'Light missiles, and the one destroyer with real high-tier numbers.' },
      { kind: 'hole', lead: 'EM', text: 'The shield has none; its fits cover it with EM rigs.' },
      { kind: 'info', lead: 'Two a pocket', text: 'Flown as a duo: two destroyers on two filaments.' },
      { kind: 'warn', lead: 'Destroyers', text: 'Wiki Circa Kismeteer calls destroyer pockets “so uncertain” that it no longer suggests them.' },
    ],
    stats: [
      { value: '1,424', label: 'T4 Dark runs on its most-run fits (414 at T5)', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
      { value: '36', label: 'lost in 9 days, median 379 M', source: 'zKillboard, ships lost in the Abyss, 21–29 September 2026' },
    ] },
  { id: 17715, name: 'Gila', col: 3, row: 4, lane: 'cruiser', role: 'Cruiser. Used for T2–T6 Exotic, Electrical, Gamma; T3–T5 Firestorm; almost never Dark.',
    bonuses: ['10% kinetic and thermal missile damage a level', '4% shield resists a level', '+500% medium drone damage', '+250% drone hit points'],
    points: [
      { kind: 'good', lead: 'Exotic', text: 'Kinetic missiles and drones meet Exotic’s kinetic penalty.' },
      { kind: 'good', lead: 'Gamma', text: 'Gamma’s +50% shield hit points make passive-regen fits work.' },
      { kind: 'good', lead: 'Electrical', text: 'Double capacitor regeneration runs an active shield booster.' },
      { kind: 'avoid', lead: 'Dark', text: 'Its drones lose range.' },
      { kind: 'hole', lead: 'EM', text: 'The shield has none: nearly every fit carries an EM Shield Reinforcer and a Multispectrum Shield Hardener.' },
      { kind: 'quote', lead: '“Povertila”', text: 'Runs T4 exotic, electrical, and gamma with no drugs or implants. Runs T5 exotic with Standard Blue Pill and Hardshell II.' },
      { kind: 'info', lead: 'Just in', text: 'The ePLEX-T4 fit is step 5 of an Alpha-to-Omega track published on Abyss Tracker.' },
    ],
    stats: [
      { value: '30.4%', label: 'of the most popular hulls', source: 'Abyss Tracker’s front page, 30 September 2026' },
      { value: '65,577', label: 'runs on its 72 most-run fits', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
      { value: '18,895', label: 'runs on the Povertila, the most-run fit', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
      { value: '221', label: 'lost in 9 days, 3rd of any hull (median 527 M)', source: 'zKillboard, ships lost in the Abyss, 21–29 September 2026' },
    ] },
  { id: 11993, name: 'Cerberus', col: 4, row: 5, lane: 'dark', role: 'Heavy Assault Cruiser. Used for T4–T6 Dark; T5 Exotic.',
    bonuses: ['Missile rate of fire (heavy assault, heavy, rapid light)', '7.5% shield booster amount a level'],
    points: [
      { kind: 'good', lead: 'Dark', text: 'The cruiser for Dark, as the Hawk is the frigate: missiles don’t mind it.' },
      { kind: 'hole', lead: 'EM', text: 'The shield has none: 13 of its 20 losses carried an EM Shield Reinforcer II.' },
      { kind: 'warn', lead: 'Unreadable', text: 'The most-run T6 Dark fit (“T6 Dark”, 1,022 runs) couldn’t be read: Abyss Tracker answered “Failed to get fit”.' },
      { kind: 'quote', lead: '“#1 T4 Dark Double web”', text: 'after 300 runs… I really like the Cerberus in T4 Darks… Although a T4 dark Muninn may be more optimised' },
    ] },
  { id: 12019, name: 'Sacrilege', col: 3, row: 5, lane: 'dark', role: 'Heavy Assault Cruiser. Used for T3–T4 Dark.',
    bonuses: ['5% armour resists a level'],
    points: [
      { kind: 'good', lead: 'Dark', text: 'T3–T4 Dark only, in the data.' },
      { kind: 'hole', lead: 'Thermal', text: 'Its weak armour resist; Dark brings no resist penalty.' },
    ],
    stats: [
      { value: '1,153', label: 'Dark runs on its most-run fits', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
    ] },
  { id: 54732, name: 'Stormbringer', col: 4, row: 6, lane: 'electrical', role: 'Cruiser. Used for T4–T6 Electrical.',
    bonuses: ['6% shield resists a level'],
    points: [
      { kind: 'good', lead: 'Electrical', text: 'Its mostly-EM Vorton damage gains from Electrical’s EM penalty, and double cap feeds its booster (the research’s reading).' },
      { kind: 'info', lead: 'Weapon', text: 'Vorton projectors: arcing EM and kinetic damage that chains between targets in range.' },
      { kind: 'tip', lead: 'Speed', text: 'The fastest median runs in the high tiers: 9:00 to 11:43.' },
      { kind: 'warn', lead: 'Cost', text: 'Its fits cost 1.9–3.7 B.' },
    ] },
  { id: 52252, name: 'Ikitursa', col: 4, row: 7, lane: 'fire', role: 'Heavy Assault Cruiser. Used for T3–T5 Firestorm.',
    points: [
      { kind: 'good', lead: 'Firestorm', text: 'Like the Nergal, a hull with a high thermal resist for the thermal-penalty weather.' },
      { kind: 'info', lead: 'Weapon', text: 'A Heavy Entropic Disintegrator.' },
      { kind: 'warn', lead: 'T6', text: 'On no T6 most-run list: T6 Firestorm logged 13 runs, 1 lost.' },
    ],
    stats: [
      { value: '1,039', label: 'T5 Firestorm runs on “Ikitursa T5 Fire 1.1”, none logged lost', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
    ] },
  { id: 11999, name: 'Vagabond', col: 4, row: 8, lane: 'gamma', role: 'Heavy Assault Cruiser. Used for T4 and T6 Gamma.',
    bonuses: ['7.5% shield booster amount a level'],
    points: [
      { kind: 'good', lead: 'Gamma', text: 'Run at T4 and T6; its losses carry an Explosive Shield Reinforcer for Gamma’s explosive penalty.' },
      { kind: 'warn', lead: '“!WTF P2”', text: 'T6 Gamma’s most-run fit (2,960 runs, none logged lost, 331 M) is a streamer’s challenge fit: read the zero with that in mind.' },
      { kind: 'quote', lead: '“!WTF P2”', text: 'You will die in that ship, Trust me… This paper thin buffer will break before you even notice. I do not recommand using this fit.' },
    ] },
  { id: 12005, name: 'Ishtar', col: 5, row: 8, lane: 'gamma', role: 'Heavy Assault Cruiser. Used for T5–T6 Gamma.',
    bonuses: ['Heavy and sentry drone bonuses'],
    points: [
      { kind: 'good', lead: 'Gamma', text: 'T5–T6, shield-tanked with an X-Large booster.' },
      { kind: 'warn', lead: 'Cost', text: 'The priciest fits on the tree: 4.1 B, and 17.9 B for the T6 one with a full High-grade Crystal set.' },
      { kind: 'quote', lead: '“T5 Gamma”', text: 'Mid-grade crystals Alpha > Epsilon mandatory.' },
    ],
    stats: [
      { value: '612 M', label: 'an hour, measured in T6 Gamma', source: 'Abyss Tracker, runs its users logged, read 30 September 2026' },
      { value: '35', label: 'lost in 9 days, median 355 M', source: 'zKillboard, ships lost in the Abyss, 21–29 September 2026' },
    ] },
  { id: 621, name: 'Caracal', col: 1, row: 4, lane: 'cruiser', role: 'Cruiser. Used for T1–T2 Gamma.',
    points: [
      { kind: 'good', lead: 'Gamma', text: 'The cheap Tech I cruiser on a T1 Gamma most-run list: 7 of 181 runs logged lost.' },
      { kind: 'info', lead: 'Earnings', text: 'EVE University: a Tech I cruiser earns about what a T0 frigate does.' },
    ] },
  { id: 17843, name: 'Vexor Navy Issue', col: 2, row: 8, lane: 'gamma', role: 'Cruiser. Used for T2 Gamma and Firestorm.',
    points: [
      { kind: 'info', lead: 'Instead of a Gila', text: 'The drone and hybrid navy cruiser, the T2 alternative to the Gila.' },
      { kind: 'good', lead: 'Gamma', text: 'A single-purpose T2 Gamma fit.' },
      { kind: 'good', lead: 'Firestorm', text: 'A single-purpose T2 Firestorm fit, with blasters.' },
      { kind: 'quote', lead: 'Both fits', text: 'for T4+ use Ishtar instead' },
    ] },
  { id: 12023, name: 'Deimos', col: 3, row: 7, lane: 'fire', role: 'Heavy Assault Cruiser. Used for T3 Exotic.',
    points: [
      { kind: 'good', lead: 'Exotic', text: 'A 328 M “facetank” for T3 Exotic: 245 runs, none logged lost.' },
      { kind: 'info', lead: 'Resists', text: 'Its fit’s kinetic resists (85% shield, 84% armour) cover Exotic’s kinetic penalty.' },
    ] },
  { id: 17709, name: 'Omen Navy Issue', col: 2, row: 6, lane: 'electrical', role: 'Cruiser. Used for T2 Electrical.',
    points: [
      { kind: 'good', lead: 'Electrical', text: '115 T2 Electrical runs.' },
      { kind: 'warn', lead: 'T3', text: 'Its 2 T3 runs were both logged lost.' },
    ] },
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
