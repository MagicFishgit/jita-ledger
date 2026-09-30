/**
 * Every hauling hull's fits, from research done on 30 September 2026: EVE Workbench's ten most-voted and five newest
 * public fits per hull (379 read), picked by purpose (the real choice for a hauler: cargo, speed or tank), each with its
 * upload date, the game version its author picked, its votes and EVE Workbench's own EHP (in thousands; null where
 * EVE Workbench never worked one out, older fits). Freighters, jump freighters and the Orca have almost no public
 * fits, so theirs are the few there are, set against what zKillboard's ganked freighters carried (see haulTree.ts) and
 * EVE University's advice. Every name resolved in ESI. Cargo is never written here: the cargo engine (cargo.ts) works it
 * out from ESI's dogma at your skills. Generated from the research's notes; pure.
 */

import type { Tier } from './fits';

export type HaulFit = Tier & {
  /** What it's for, as the research labelled it: Max cargo, Slippery, Tank… */
  purpose: string;
  /** EVE Workbench's EHP in thousands, at its own skill assumptions; null when it has none. */
  ehpK: number | null;
  url: string; uploaded: string; version: string; votes: number;
};

export const HAUL_FITS: Record<number, HaulFit[]> = {
  // Tayra (58 public fits on EVE Workbench)
  649: [
    {
      key: 'solid', purpose: 'Just in (alpha, T1 modules)', what: 'All-T1 shield buffer with 3 cargo expanders; flyable on day one.',
      high: [], mid: [{ name: 'Medium Shield Extender I', qty: 3 }, { name: 'Multispectrum Shield Hardener I', qty: 2 }], low: [{ name: 'Expanded Cargohold I', qty: 3 }, { name: 'Damage Control I' }], rigs: [{ name: 'Medium EM Shield Reinforcer I', qty: 2 }, { name: 'Medium Thermal Shield Reinforcer I' }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/90e2905f-436c-45da-0ba5-08d959aa90b4', uploaded: '2021-08-16', version: 'Update 19.07 (August 10th, 2021)', votes: 3,
      source: 'EVE Workbench, “T1 Alpha High-Sec Hauler”, uploaded 2021-08-16 (before 2025), +3 votes',
    },
    {
      key: 'solid', purpose: 'Max cargo', what: 'Four Expanded Cargohold II and three cargo rigs; low-value bulk only.',
      high: [], mid: [{ name: '5MN Microwarpdrive II' }, { name: 'Multispectrum Shield Hardener II' }, { name: 'Medium Shield Extender II', qty: 3 }], low: [{ name: 'Expanded Cargohold II', qty: 4 }], rigs: [{ name: 'Medium Cargohold Optimization I' }, { name: 'Medium Cargohold Optimization II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/a9ce38c4-9ffc-4557-9ec1-08d8ffd535de', uploaded: '2021-04-17', version: '- Unknown -', votes: 3,
      source: 'EVE Workbench, “Tayra 33m3”, uploaded 2021-04-17 (before 2025), +3 votes',
    },
    {
      key: 'solid', purpose: 'Slippery', what: 'No expanders: cloak + MWD, inertial stabilizers and warp rigs; small valuable loads.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: '5MN Cold-Gas Enduring Microwarpdrive' }, { name: 'Medium Shield Extender I', qty: 2 }, { name: 'Multispectrum Shield Hardener I', qty: 2 }], low: [{ name: 'Inertial Stabilizers II', qty: 3 }], rigs: [{ name: 'Medium Low Friction Nozzle Joints I' }, { name: 'Medium Hyperspatial Velocity Optimizer I', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 10.4, url: 'https://eveworkbench.com/fit/27b218cd-249e-4971-a8e1-877d380b09f7', uploaded: '2025-06-01', version: 'Legion (May 27th, 2025)', votes: 0,
      source: 'EVE Workbench, “Fast/Tanky - Tayra”, uploaded 2025-06-01, +0 votes',
    },
  ],
  // Iteron Mark V (37 public fits on EVE Workbench)
  657: [
    {
      key: 'solid', purpose: 'Max cargo', what: 'Five Expanded Cargohold II and three cargo rigs, almost no tank.',
      high: [], mid: [{ name: '10MN Monopropellant Enduring Afterburner' }], low: [{ name: 'Expanded Cargohold II', qty: 5 }], rigs: [{ name: 'Medium Cargohold Optimization I', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: 2.5, url: 'https://eveworkbench.com/fit/73316d3e-a3df-47a8-86f7-4c48af8f85d2', uploaded: '2025-08-20', version: 'Legion (May 27th, 2025)', votes: 0,
      source: 'EVE Workbench, “Iteron Mark V Max With Rigs Optimize”, uploaded 2025-08-20, +0 votes',
    },
    {
      key: 'solid', purpose: 'Max cargo with a buffer', what: 'Same holds, navy shield extenders and a hardener.',
      high: [], mid: [{ name: 'Caldari Navy Medium Shield Extender', qty: 3 }, { name: 'Multispectrum Shield Hardener II' }], low: [{ name: 'Expanded Cargohold II', qty: 5 }], rigs: [{ name: 'Medium Cargohold Optimization II', qty: 2 }, { name: 'Medium Cargohold Optimization I' }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/79c9d8d1-abfc-4497-b996-08d9a8f923b1', uploaded: '2021-12-04', version: 'Update 19.10 (November 9th, 2021)', votes: 3,
      source: 'EVE Workbench, “Big Cargo Iteron”, uploaded 2021-12-04 (before 2025), +3 votes',
    },
    {
      key: 'solid', purpose: 'Tank', what: 'Damage Control II and four Reinforced Bulkheads II.',
      high: [], mid: [{ name: 'Large Shield Extender II', qty: 2 }, { name: 'Multispectrum Shield Hardener II' }], low: [{ name: 'Damage Control II' }, { name: 'Reinforced Bulkheads II', qty: 4 }], rigs: [{ name: 'Medium Core Defense Field Extender I', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: 34.3, url: 'https://eveworkbench.com/fit/38171c5c-6e32-422d-9d6d-19b5e46f7bea', uploaded: '2025-09-20', version: 'Legion (September 9th, 2025)', votes: 0,
      source: 'EVE Workbench, “Tanky Null-Sec Mule”, uploaded 2025-09-20, +0 votes',
    },
  ],
  // Mammoth (17 public fits on EVE Workbench)
  652: [
    {
      key: 'solid', purpose: 'Max cargo, shield buffer', what: 'Five Expanded Cargohold II, cloak, shield extenders.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: 'EM Shield Amplifier II' }, { name: 'Medium Shield Extender II', qty: 3 }], low: [{ name: 'Expanded Cargohold II', qty: 5 }], rigs: [{ name: 'Medium Cargohold Optimization I', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/837f1f87-b6d0-40cf-b074-08d7d8b410e5', uploaded: '2020-04-04', version: 'Broker Relations', votes: 4,
      source: 'EVE Workbench, “Hauler - Max Cargo w Shield Buffer”, uploaded 2020-04-04 (before 2025), +4 votes',
    },
    {
      key: 'solid', purpose: 'Balanced', what: 'Three expanders with Damage Control and hardeners.',
      high: [{ name: 'Interdiction Nullifier I' }], mid: [{ name: 'Enduring Multispectrum Shield Hardener', qty: 2 }, { name: 'Compact EM Shield Amplifier' }, { name: 'Medium F-S9 Regolith Compact Shield Extender' }], low: [{ name: 'Damage Control II' }, { name: 'Expanded Cargohold II', qty: 3 }, { name: 'Inertial Stabilizers II' }], rigs: [{ name: 'Medium Core Defense Field Extender I' }, { name: 'Medium EM Shield Reinforcer I' }, { name: 'Medium Thermal Shield Reinforcer I' }], drones: [], cargo: [],
      train: [], ehpK: 10.4, url: 'https://eveworkbench.com/fit/d976bc4c-6f14-4c8e-87fe-4edaaba3af71', uploaded: '2026-01-22', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Forgetful”, uploaded 2026-01-22, +0 votes',
    },
  ],
  // Bestower (19 public fits on EVE Workbench)
  1944: [
    {
      key: 'solid', purpose: 'Max cargo + cloak trick', what: 'Six Expanded Cargohold II, cloak + afterburner: the biggest T1 hold on the list.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: '10MN Afterburner II' }, { name: 'Medium Shield Extender II', qty: 2 }], low: [{ name: 'Expanded Cargohold II', qty: 6 }], rigs: [{ name: 'Medium Cargohold Optimization I' }, { name: 'Medium Cargohold Optimization II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/ab07dcda-c8f2-47a7-ca2f-08dd59a98393', uploaded: '2025-03-06', version: 'Revenant - November 12th, 2024 (22.02)', votes: 2,
      source: 'EVE Workbench, “42684m3, 6.2k ehp, 8ms align w/ AB”, uploaded 2025-03-06, +2 votes',
    },
    {
      key: 'solid', purpose: 'Balanced', what: 'Four expanders and two stabilizers.',
      high: [{ name: 'Small Gremlin Compact Energy Neutralizer' }], mid: [{ name: 'Multispectrum Shield Hardener I' }, { name: 'Medium F-S9 Regolith Compact Shield Extender', qty: 2 }], low: [{ name: 'Inertial Stabilizers II', qty: 2 }, { name: 'Expanded Cargohold II', qty: 4 }], rigs: [{ name: 'Medium Cargohold Optimization I', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: 7.1, url: 'https://eveworkbench.com/fit/154797cc-8f6e-4fd3-8e73-8984ecd141b0', uploaded: '2025-12-03', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “20k Cargo <10sec align”, uploaded 2025-12-03, +0 votes',
    },
    {
      key: 'solid', purpose: 'Tank', what: 'Armor plate and membrane with three expanders.',
      high: [], mid: [{ name: 'Medium Shield Extender II', qty: 2 }, { name: '5MN Quad LiF Restrained Microwarpdrive' }], low: [{ name: 'Expanded Cargohold II', qty: 3 }, { name: 'Damage Control II' }, { name: '400mm Steel Plates II' }, { name: 'Layered Energized Membrane II' }], rigs: [{ name: 'Medium Kinetic Armor Reinforcer I' }, { name: 'Medium Explosive Armor Reinforcer I' }, { name: 'Medium Thermal Armor Reinforcer I' }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/8a53618f-db64-4652-14eb-08d8ce8f079d', uploaded: '2021-02-17', version: 'Update 19.01 (February 9th, 2021)', votes: 1,
      source: 'EVE Workbench, “13k EHP | 10k Cargo”, uploaded 2021-02-17 (before 2025), +1 vote',
    },
  ],
  // Badger (83 public fits on EVE Workbench)
  648: [
    {
      key: 'solid', purpose: 'Just in', what: 'T1/compact modules, 3M ISK.',
      high: [], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Kinetic Shield Amplifier I' }, { name: 'EM Shield Amplifier I' }, { name: 'Explosive Shield Amplifier I' }, { name: 'Medium Shield Extender I', qty: 2 }], low: [{ name: 'Expanded Cargohold I', qty: 3 }, { name: 'Damage Control I' }], rigs: [{ name: 'Medium Cargohold Optimization I', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/a397ef90-6a2b-48cc-39c8-08dacd9da65a', uploaded: '2022-12-25', version: '20.11 (December 13th, 2022)', votes: 5,
      source: 'EVE Workbench, “Badger CRG-1.10”, uploaded 2022-12-25 (before 2025), +5 votes',
    },
    {
      key: 'solid', purpose: 'Cloak + MWD', what: 'Cloak trick with three expanders and three cargo rigs.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Medium Shield Extender II', qty: 3 }, { name: '50MN Cold-Gas Enduring Microwarpdrive' }], low: [{ name: 'Expanded Cargohold II', qty: 3 }, { name: 'Damage Control II' }], rigs: [{ name: 'Medium Cargohold Optimization I', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/ee41200a-0079-4d7d-475d-08d715ee4468', uploaded: '2019-08-15', version: 'Invasion', votes: 6,
      source: 'EVE Workbench, “Cloak/MWD”, uploaded 2019-08-15 (before 2025), +6 votes',
    },
    {
      key: 'solid', purpose: 'Tank', what: 'Two Reinforced Bulkheads II, Damage Control II, shield buffer.',
      high: [], mid: [{ name: 'Multispectrum Shield Hardener II' }, { name: 'EM Shield Amplifier II' }, { name: 'Large Shield Extender II' }, { name: 'Medium Shield Extender II', qty: 3 }], low: [{ name: 'Reinforced Bulkheads II', qty: 2 }, { name: 'Damage Control II' }, { name: 'Inertial Stabilizers II' }], rigs: [{ name: 'Medium Core Defense Field Extender I' }, { name: 'Medium EM Shield Reinforcer I' }, { name: 'Medium Thermal Shield Reinforcer I' }], drones: [], cargo: [],
      train: [], ehpK: 44.4, url: 'https://eveworkbench.com/fit/f05e4cb8-c0a2-4dad-afef-ccb7a2c5a8b5', uploaded: '2026-05-29', version: 'Catalyst (March 18th, 2026)', votes: 0,
      source: 'EVE Workbench, “Tech II - Shield Tanked”, uploaded 2026-05-29, +0 votes',
    },
  ],
  // Nereus (53 public fits on EVE Workbench)
  650: [
    {
      key: 'solid', purpose: 'Fast courier', what: 'Cloak + MWD, inertial stabilizers, two expanders, warp rigs.',
      high: [{ name: 'Prototype Cloaking Device I' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Multispectrum Shield Hardener I' }, { name: 'Medium Shield Extender I', qty: 3 }], low: [{ name: 'Inertial Stabilizers I', qty: 3 }, { name: 'Expanded Cargohold II', qty: 2 }], rigs: [{ name: 'Medium Hyperspatial Velocity Optimizer I', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/e96d73e0-d1ce-4f6f-08d3-08d895cf8827', uploaded: '2020-12-03', version: 'Update 18.11 (November 19th, 2020)', votes: 5,
      source: 'EVE Workbench, “HS Fast Courier”, uploaded 2020-12-03 (before 2025), +5 votes',
    },
    {
      key: 'solid', purpose: 'Tank', what: 'Two Large Shield Extender II and hardeners.',
      high: [], mid: [{ name: 'Large Shield Extender II', qty: 2 }, { name: 'EM Shield Hardener II' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }], low: [{ name: 'Damage Control II' }, { name: 'Power Diagnostic System II', qty: 2 }, { name: '\'Halcyon\' Core Equalizer I' }, { name: 'Inertial Stabilizers II' }], rigs: [{ name: 'Medium Core Defense Field Extender I', qty: 2 }, { name: 'Medium Thermal Shield Reinforcer II' }], drones: [], cargo: [],
      train: [], ehpK: 56.8, url: 'https://eveworkbench.com/fit/ddaf33d1-776a-461e-9bc5-665a9068506d', uploaded: '2026-05-20', version: 'Catalyst (March 18th, 2026)', votes: 0,
      source: 'EVE Workbench, “Budget HiSec HiValue Hauler”, uploaded 2026-05-20, +0 votes',
    },
    {
      key: 'solid', purpose: 'Alpha', what: 'Alpha-flyable tank and agility.',
      high: [], mid: [{ name: 'Multispectrum Shield Hardener II' }, { name: 'Large Azeotropic Restrained Shield Extender', qty: 2 }, { name: 'EM Shield Amplifier II' }, { name: 'Medium Azeotropic Restrained Shield Extender' }], low: [{ name: 'Damage Control II' }, { name: '\'Halcyon\' Core Equalizer I' }, { name: 'Type-D Restrained Inertial Stabilizers', qty: 3 }], rigs: [{ name: 'Medium Hyperspatial Velocity Optimizer I', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: 31.6, url: 'https://eveworkbench.com/fit/91d2ca44-ab31-46cd-baf2-7aefe942c26d', uploaded: '2026-03-10', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Loru\'s Alpha EZ Hauler”, uploaded 2026-03-10, +0 votes',
    },
  ],
  // Wreathe (47 public fits on EVE Workbench)
  653: [
    {
      key: 'solid', purpose: 'Cloak + MWD cargo', what: 'Four expanders, cloak trick, refit set in cargo.',
      high: [{ name: 'Improved Cloaking Device II' }, { name: 'Compact Interdiction Nullifier' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Large F-S9 Regolith Compact Shield Extender' }, { name: 'EM Shield Amplifier II', qty: 2 }, { name: 'Thermal Shield Amplifier II' }], low: [{ name: 'Damage Control II' }, { name: 'Expanded Cargohold II', qty: 4 }], rigs: [{ name: 'Medium Cargohold Optimization I', qty: 3 }], drones: [], cargo: [{ name: 'Inertial Stabilizers II', qty: 3 }, { name: 'Multispectrum Energized Membrane II', qty: 2 }, { name: '\'Halcyon\' Core Equalizer I' }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/20b36ffb-f28e-4d8a-2595-08d9464eb95e', uploaded: '2021-07-22', version: 'Update 19.06 (July 13th, 2021)', votes: 4,
      source: 'EVE Workbench, “Omega Wreathe”, uploaded 2021-07-22 (before 2025), +4 votes',
    },
    {
      key: 'solid', purpose: 'Agile', what: 'Three expanders, two stabilizers, agility and warp rigs.',
      high: [], mid: [{ name: 'Large Azeotropic Restrained Shield Extender' }, { name: 'Medium Azeotropic Restrained Shield Extender' }, { name: 'Compact EM Shield Amplifier' }, { name: 'Compact Thermal Shield Amplifier' }], low: [{ name: 'Expanded Cargohold II', qty: 3 }, { name: 'Inertial Stabilizers II', qty: 2 }], rigs: [{ name: 'Medium Polycarbon Engine Housing I' }, { name: 'Medium Hyperspatial Velocity Optimizer I' }, { name: 'Medium Cargohold Optimization I' }], drones: [], cargo: [{ name: 'Inertial Stabilizers II', qty: 2 }, { name: 'Expanded Cargohold II' }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/8c350ace-ce42-4fd7-e778-08da9326a533', uploaded: '2022-09-30', version: 'Update 20.08 (September 13th, 2022)', votes: 3,
      source: 'EVE Workbench, “♥ Wreathe, Agile General Purpose HS, LS”, uploaded 2022-09-30 (before 2025), +3 votes',
    },
    {
      key: 'solid', purpose: 'Tanky cloak', what: 'Cloak + MWD with a shield tank.',
      high: [{ name: 'Improved Cloaking Device II' }, { name: 'Interdiction Nullifier I' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Enduring Multispectrum Shield Hardener' }, { name: 'Large Shield Extender II' }, { name: 'EM Shield Amplifier II' }, { name: 'Thermal Shield Amplifier II' }], low: [{ name: '\'Halcyon\' Core Equalizer I' }, { name: 'Damage Control II' }, { name: 'Inertial Stabilizers II', qty: 2 }, { name: 'Mark I Compact Power Diagnostic System' }], rigs: [{ name: 'Medium Ancillary Current Router I' }, { name: 'Medium Core Defense Field Extender I' }, { name: 'Medium EM Shield Reinforcer I' }], drones: [], cargo: [],
      train: [], ehpK: 26.7, url: 'https://eveworkbench.com/fit/9c9fa230-a052-40bb-9ee4-4483b1240942', uploaded: '2026-04-10', version: 'Catalyst (March 18th, 2026)', votes: 0,
      source: 'EVE Workbench, “*USS - SAME DAY SHIPPING TEST2”, uploaded 2026-04-10, +0 votes',
    },
  ],
  // Sigil (35 public fits on EVE Workbench)
  19744: [
    {
      key: 'solid', purpose: 'Alpha fast', what: 'Three expanders, stabilizer, Damage Control.',
      high: [], mid: [{ name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Large Shield Extender II' }, { name: '50MN Quad LiF Restrained Microwarpdrive' }], low: [{ name: 'Expanded Cargohold II', qty: 3 }, { name: 'Inertial Stabilizers II' }, { name: 'Damage Control II' }, { name: '\'Halcyon\' Core Equalizer I' }], rigs: [{ name: 'Medium Cargohold Optimization I', qty: 2 }, { name: 'Medium Core Defense Field Extender I' }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/07839fd7-1193-4a39-fec5-08dd38c883ca', uploaded: '2025-01-20', version: '- Unknown -', votes: 2,
      source: 'EVE Workbench, “Amarr Alpha Fast Transport”, uploaded 2025-01-20, +2 votes',
    },
    {
      key: 'solid', purpose: 'Alpha cargo + tank', what: 'Four expanders, Damage Control and a plate.',
      high: [], mid: [{ name: 'Large Shield Extender I', qty: 2 }], low: [{ name: 'Damage Control I' }, { name: 'Expanded Cargohold II', qty: 4 }, { name: '400mm Rolled Tungsten Compact Plates' }], rigs: [{ name: 'Medium Cargohold Optimization I', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: 16.1, url: 'https://eveworkbench.com/fit/2d4343aa-aa07-4e3a-b23a-a99fe001fbb3', uploaded: '2026-04-24', version: 'Catalyst (March 18th, 2026)', votes: 0,
      source: 'EVE Workbench, “[Rois] Alpha Sigil”, uploaded 2026-04-24, +0 votes',
    },
  ],
  // Epithal (36 public fits on EVE Workbench)
  655: [
    {
      key: 'solid', purpose: 'Tank', what: 'Bulkheads and Damage Control, bulkhead rigs.',
      high: [{ name: 'Prototype Cloaking Device I' }, { name: 'Compact Interdiction Nullifier' }], mid: [{ name: '10MN Monopropellant Enduring Afterburner' }, { name: 'Multispectrum Shield Hardener II' }, { name: 'Medium Azeotropic Restrained Shield Extender', qty: 2 }], low: [{ name: 'Warp Core Stabilizer II' }, { name: 'Damage Control II' }, { name: 'Reinforced Bulkheads II', qty: 2 }], rigs: [{ name: 'Medium Transverse Bulkhead I', qty: 3 }], drones: [], cargo: [{ name: 'Rash Compact Burst Jammer' }],
      train: [], ehpK: 17, url: 'https://eveworkbench.com/fit/09f966c9-591b-4d5b-a631-d88db919089c', uploaded: '2025-07-03', version: 'Legion (May 27th, 2025)', votes: 2,
      source: 'EVE Workbench, “Danger - Pi Hauler”, uploaded 2025-07-03, +2 votes',
    },
    {
      key: 'solid', purpose: 'Slippery', what: 'Cloak, stabilizers, warp rigs.',
      high: [{ name: 'Prototype Cloaking Device I' }], mid: [{ name: 'Compact Thermal Shield Amplifier' }, { name: 'Compact EM Shield Amplifier', qty: 2 }, { name: 'Large F-S9 Regolith Compact Shield Extender' }], low: [{ name: 'Warp Core Stabilizer I' }, { name: 'Damage Control II' }, { name: 'Inertial Stabilizers II', qty: 2 }], rigs: [{ name: 'Medium Hyperspatial Velocity Optimizer I', qty: 2 }, { name: 'Medium Low Friction Nozzle Joints I' }], drones: [], cargo: [],
      train: [], ehpK: 13, url: 'https://eveworkbench.com/fit/cd5676eb-5f5b-40b1-7554-08decdc06818', uploaded: '2026-06-19', version: 'Cradle of War (June 9th, 2026)', votes: 2,
      source: 'EVE Workbench, “PI Runner HS”, uploaded 2026-06-19, +2 votes',
    },
    {
      key: 'solid', purpose: 'Fast', what: 'Cloak + afterburner, stabilizers, nanofiber.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: 'Medium Shield Extender II', qty: 2 }, { name: '10MN Y-S8 Compact Afterburner' }, { name: 'Enduring Multispectrum Shield Hardener' }], low: [{ name: 'Inertial Stabilizers II', qty: 2 }, { name: 'Nanofiber Internal Structure II' }, { name: 'Warp Core Stabilizer I' }], rigs: [{ name: 'Medium Hyperspatial Velocity Optimizer I', qty: 2 }, { name: 'Medium Core Defense Field Extender I' }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/951e969a-c052-4537-6181-08debd31d056', uploaded: '2026-05-31', version: 'Catalyst (March 18th, 2026)', votes: 0,
      source: 'EVE Workbench, “Epithal (Omega)”, uploaded 2026-05-31, +0 votes',
    },
  ],
  // Miasmos (50 public fits on EVE Workbench)
  656: [
    {
      key: 'solid', purpose: 'Fast warp', what: 'Four Inertial Stabilizers II, warp rigs.',
      high: [], mid: [{ name: '5MN Y-T8 Compact Microwarpdrive' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Large Shield Extender II' }], low: [{ name: 'Inertial Stabilizers II', qty: 4 }], rigs: [{ name: 'Medium Hyperspatial Velocity Optimizer I', qty: 2 }, { name: 'Medium Polycarbon Engine Housing I' }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/f2fd4d6f-68d3-43e3-a58d-08d6ca77f9c6', uploaded: '2019-04-28', version: 'Onslaught', votes: 8,
      source: 'EVE Workbench, “Cheap Quick Align Fast Warp”, uploaded 2019-04-28 (before 2025), +8 votes',
    },
    {
      key: 'solid', purpose: 'Tank + cloak', what: 'Shield tank, stabilizers, WCS.',
      high: [{ name: 'Prototype Cloaking Device I' }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Multispectrum Shield Hardener II' }, { name: 'Medium Shield Extender II' }, { name: 'EM Shield Hardener II' }], low: [{ name: 'Inertial Stabilizers II' }, { name: 'Type-D Restrained Inertial Stabilizers' }, { name: 'Damage Control II' }, { name: 'Warp Core Stabilizer II' }], rigs: [{ name: 'Medium Low Friction Nozzle Joints I', qty: 2 }, { name: 'Medium Core Defense Field Extender I' }], drones: [], cargo: [],
      train: [], ehpK: 21.6, url: 'https://eveworkbench.com/fit/1044d1c4-33da-4f21-aa37-5c0aa436a524', uploaded: '2026-07-06', version: 'Cradle of War (June 9th, 2026)', votes: 0,
      source: 'EVE Workbench, “Loru\'s HS - Ore Hauler”, uploaded 2026-07-06, +0 votes',
    },
    {
      key: 'solid', purpose: 'Fast align', what: 'Four stabilizers.',
      high: [], mid: [{ name: 'Large Shield Extender II' }, { name: 'Multispectrum Shield Hardener II' }], low: [{ name: 'Inertial Stabilizers II', qty: 4 }], rigs: [{ name: 'Medium Polycarbon Engine Housing I' }, { name: 'Medium Hyperspatial Velocity Optimizer I', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 11.2, url: 'https://eveworkbench.com/fit/5e1350ff-4ad1-42ea-9b32-e66d2882c764', uploaded: '2025-09-26', version: 'Legion (September 9th, 2025)', votes: 2,
      source: 'EVE Workbench, “Miasmos Ore Transport Fast Align + Warp Speed”, uploaded 2025-09-26, +2 votes',
    },
  ],
  // Kryos (13 public fits on EVE Workbench)
  654: [
    {
      key: 'solid', purpose: 'Slippery', what: 'Cloak + MWD, stabilizers, warp rig.',
      high: [{ name: 'Prototype Cloaking Device I' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Multispectrum Shield Hardener I', qty: 2 }, { name: 'Medium Shield Extender I' }], low: [{ name: 'Inertial Stabilizers I', qty: 3 }, { name: 'Warp Core Stabilizer I' }], rigs: [{ name: 'Medium Ancillary Current Router I', qty: 2 }, { name: 'Medium Hyperspatial Velocity Optimizer I' }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/dd19bd5c-499f-4f8a-08ce-08d895cf8827', uploaded: '2020-12-03', version: 'Update 18.11 (November 19th, 2020)', votes: 5,
      source: 'EVE Workbench, “HS Mineral Hauler”, uploaded 2020-12-03 (before 2025), +5 votes',
    },
    {
      key: 'solid', purpose: 'Antigank', what: 'Shield buffer, Damage Control, three stabilizers.',
      high: [], mid: [{ name: 'Large Shield Extender II' }, { name: 'EM Shield Hardener II' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }], low: [{ name: 'Damage Control II' }, { name: 'Inertial Stabilizers II', qty: 3 }], rigs: [{ name: 'Medium Core Defense Field Extender I', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: 28.1, url: 'https://eveworkbench.com/fit/aac56d7e-4d29-45cd-9cb1-e5259b2859f4', uploaded: '2026-02-06', version: 'Catalyst (November 18th, 2025)', votes: 1,
      source: 'EVE Workbench, “Kryos, HS Mineral Hauling Antigank”, uploaded 2026-02-06, +1 vote',
    },
    {
      key: 'solid', purpose: 'Balanced', what: 'Cloak, shield tank, stabilizers.',
      high: [{ name: 'Prototype Cloaking Device I' }], mid: [{ name: 'Large F-S9 Regolith Compact Shield Extender' }, { name: 'Multispectrum Shield Hardener II' }, { name: 'Medium Shield Extender II' }, { name: 'EM Shield Hardener II' }], low: [{ name: 'Inertial Stabilizers II', qty: 3 }, { name: 'Warp Core Stabilizer II' }], rigs: [{ name: 'Medium Low Friction Nozzle Joints I' }, { name: 'Medium Core Defense Field Extender I', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 18.8, url: 'https://eveworkbench.com/fit/b968e5fc-ca5a-4d13-beed-d95ee08b8da5', uploaded: '2026-07-06', version: 'Cradle of War (June 9th, 2026)', votes: 1,
      source: 'EVE Workbench, “Loru\'s HS Mineral Hauler”, uploaded 2026-07-06, +1 vote',
    },
  ],
  // Hoarder (8 public fits on EVE Workbench)
  651: [
    {
      key: 'solid', purpose: 'Alpha tank', what: 'Shield buffer, Damage Control.',
      high: [], mid: [{ name: 'Large F-S9 Regolith Compact Shield Extender', qty: 2 }, { name: 'EM Shield Amplifier II' }, { name: 'Thermal Shield Amplifier II' }], low: [{ name: 'Damage Control II' }, { name: 'Power Diagnostic System II' }, { name: '\'Halcyon\' Core Equalizer I' }], rigs: [{ name: 'Medium Core Defense Field Extender I', qty: 2 }, { name: 'Medium EM Shield Reinforcer I' }], drones: [], cargo: [{ name: 'Inertial Stabilizers II', qty: 3 }, { name: 'Power Diagnostic System II' }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/f2dbcf47-d2c5-4190-2789-08d9464eb95e', uploaded: '2021-07-22', version: 'Update 19.06 (July 13th, 2021)', votes: 3,
      source: 'EVE Workbench, “Alpha Hoarder”, uploaded 2021-07-22 (before 2025), +3 votes',
    },
    {
      key: 'solid', purpose: 'Omega cloak trick', what: 'Cloak + MWD, nullifier.',
      high: [{ name: 'Improved Cloaking Device II' }, { name: 'Compact Interdiction Nullifier' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Large F-S9 Regolith Compact Shield Extender' }, { name: 'EM Shield Amplifier II' }, { name: 'Thermal Shield Amplifier II' }], low: [{ name: 'Damage Control II' }, { name: 'Power Diagnostic System II' }, { name: '\'Halcyon\' Core Equalizer I' }], rigs: [{ name: 'Medium Ancillary Current Router I' }, { name: 'Medium EM Shield Reinforcer I' }, { name: 'Medium Core Defense Field Extender I' }], drones: [], cargo: [{ name: 'Power Diagnostic System II' }, { name: 'Inertial Stabilizers II', qty: 2 }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/3aa3409d-4f6d-4f3a-278b-08d9464eb95e', uploaded: '2021-07-22', version: 'Update 19.06 (July 13th, 2021)', votes: 1,
      source: 'EVE Workbench, “Omega Hoarder”, uploaded 2021-07-22 (before 2025), +1 vote',
    },
    {
      key: 'solid', purpose: 'Alpha', what: 'Hardener, extenders, stabilizer.',
      high: [], mid: [{ name: 'Multispectrum Shield Hardener II' }, { name: 'Medium Shield Extender II', qty: 2 }, { name: '50MN Quad LiF Restrained Microwarpdrive' }], low: [{ name: 'Inertial Stabilizers II' }, { name: 'Damage Control II' }, { name: '\'Halcyon\' Core Equalizer I' }], rigs: [{ name: 'Medium Low Friction Nozzle Joints I', qty: 2 }, { name: 'Medium Core Defense Field Extender I' }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/66a19c33-fe0f-4a4f-fe53-08dd38c883ca', uploaded: '2025-01-20', version: '- Unknown -', votes: 0,
      source: 'EVE Workbench, “Minmatar Alpha Ammo & Gas Hauler”, uploaded 2025-01-20, +0 votes',
    },
  ],
  // Squall (21 public fits on EVE Workbench)
  81008: [
    {
      key: 'solid', purpose: 'Slippery', what: 'Cloak, two Large Shield Extender II, stabilizers, WCS.',
      high: [{ name: 'Prototype Cloaking Device I' }], mid: [{ name: 'Large Shield Extender II', qty: 2 }, { name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Medium Shield Extender II' }], low: [{ name: 'Inertial Stabilizers II', qty: 2 }, { name: 'Warp Core Stabilizer II' }], rigs: [{ name: 'Medium Low Friction Nozzle Joints I' }, { name: 'Medium Core Defense Field Extender I', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 46.3, url: 'https://eveworkbench.com/fit/07417e83-665a-4f52-9ff2-75dd67551510', uploaded: '2025-09-17', version: 'Legion (September 9th, 2025)', votes: 7,
      source: 'EVE Workbench, “HS - Slip Haul”, uploaded 2025-09-17, +7 votes',
    },
    {
      key: 'solid', purpose: 'Tank', what: 'Shield buffer, Damage Control, nullifier, missiles.',
      high: [{ name: 'Rapid Light Missile Launcher II', qty: 2 }, { name: 'Prototype Cloaking Device I' }, { name: 'Interdiction Nullifier II' }], mid: [{ name: 'Large Shield Extender II', qty: 2 }, { name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Medium Shield Extender II' }], low: [{ name: 'Power Diagnostic System II' }, { name: 'Damage Control II' }, { name: 'Warp Core Stabilizer II' }], rigs: [{ name: 'Medium Core Defense Field Extender II' }, { name: 'Medium Low Friction Nozzle Joints I', qty: 2 }], drones: [], cargo: [{ name: 'Inferno Fury Light Missile', qty: 40 }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/159db39c-5098-49c9-0716-08dc931eb58b', uploaded: '2024-06-23', version: 'Equinox - June 11th, 2024 (22.01)', votes: 2,
      source: 'EVE Workbench, “Tanky Hauler (Loru\'s Fit)”, uploaded 2024-06-23 (before 2025), +2 votes',
    },
    {
      key: 'solid', purpose: 'Cloak + MWD', what: 'Cloak trick with a burst jammer and missiles.',
      high: [{ name: 'Rapid Light Missile Launcher II', qty: 3 }, { name: 'Improved Cloaking Device II' }], mid: [{ name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Large Shield Extender II' }, { name: '50MN Quad LiF Restrained Microwarpdrive' }, { name: 'Burst Jammer II' }], low: [{ name: 'Warp Core Stabilizer II' }, { name: 'Damage Control II' }, { name: 'Nanofiber Internal Structure II' }], rigs: [{ name: 'Medium Polycarbon Engine Housing II' }, { name: 'Medium Core Defense Field Extender I', qty: 2 }], drones: [], cargo: [{ name: 'Inferno Fury Light Missile', qty: 560 }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/7d50af6e-2a46-44cb-5c49-08dc88a8de0f', uploaded: '2024-06-13', version: 'Equinox - June 11th, 2024 (22.01)', votes: 3,
      source: 'EVE Workbench, “PI Hauler Hisec/Lowsec Cloak”, uploaded 2024-06-13 (before 2025), +3 votes',
    },
  ],
  // Crane (30 public fits on EVE Workbench)
  12729: [
    {
      key: 'solid', purpose: 'Cargo + align', what: 'One expander, one stabilizer, cargo and agility rigs.',
      high: [{ name: 'Covert Ops Cloaking Device II' }, { name: 'Interdiction Nullifier II' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }], low: [{ name: 'Inertial Stabilizers II' }, { name: 'Expanded Cargohold II' }], rigs: [{ name: 'Medium Low Friction Nozzle Joints II' }, { name: 'Medium Cargohold Optimization II' }], drones: [], cargo: [],
      train: [], ehpK: 10.3, url: 'https://eveworkbench.com/fit/c36d3b86-a356-4fc5-8a17-d2b420655229', uploaded: '2026-07-10', version: 'Cradle of War (June 9th, 2026)', votes: 0,
      source: 'EVE Workbench, “Max Cargo & Fast Align”, uploaded 2026-07-10, +0 votes',
    },
    {
      key: 'solid', purpose: 'Balanced', what: 'Nullifier, afterburner, shield, stabilizer + WCS, cargo rigs.',
      high: [{ name: 'Covert Ops Cloaking Device II' }, { name: 'Interdiction Nullifier II' }], mid: [{ name: 'Pithum C-Type EM Shield Amplifier' }, { name: '10MN Afterburner II' }, { name: 'Republic Fleet Medium Shield Extender' }, { name: 'Multispectrum Shield Hardener II' }], low: [{ name: 'Inertial Stabilizers II' }, { name: 'Warp Core Stabilizer II' }], rigs: [{ name: 'Medium Cargohold Optimization II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 21.9, url: 'https://eveworkbench.com/fit/fae89cce-2683-4535-85b2-fd3b521b5b82', uploaded: '2025-06-18', version: 'Legion (May 27th, 2025)', votes: 1,
      source: 'EVE Workbench, “All-Space BR”, uploaded 2025-06-18, +1 vote',
    },
    {
      key: 'solid', purpose: 'Tank', what: 'Large Shield Extender II, Damage Control II, WCS.',
      high: [{ name: 'Compact Interdiction Nullifier' }, { name: 'Covert Ops Cloaking Device II' }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Multispectrum Shield Hardener II' }, { name: 'Medium Shield Extender II' }, { name: 'EM Shield Amplifier II' }], low: [{ name: 'Damage Control II' }, { name: 'Warp Core Stabilizer II' }], rigs: [{ name: 'Medium Low Friction Nozzle Joints II', qty: 2 }], drones: [], cargo: [{ name: 'Glorification-1 \'Devana\' Filament' }, { name: 'Proximity-5 \'Extraction\' Filament' }, { name: 'Internal-5 \'Pochven\' Filament', qty: 2 }],
      train: [], ehpK: 39.5, url: 'https://eveworkbench.com/fit/1f2541ef-c2eb-46e3-8e78-35acd5f29109', uploaded: '2026-01-02', version: 'Catalyst (November 18th, 2025)', votes: 1,
      source: 'EVE Workbench, “Loru\'s Danger - Util Hauler”, uploaded 2026-01-02, +1 vote',
    },
  ],
  // Viator (37 public fits on EVE Workbench)
  12743: [
    {
      key: 'solid', purpose: 'Cargo', what: 'Three Expanded Cargohold II and two cargo rigs.',
      high: [{ name: 'Covert Ops Cloaking Device II' }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }], low: [{ name: 'Expanded Cargohold II', qty: 3 }], rigs: [{ name: 'Medium Cargohold Optimization II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 24.5, url: 'https://eveworkbench.com/fit/61f170c7-4f13-41a4-8665-e66cfbadf8ce', uploaded: '2025-09-27', version: 'Legion (September 9th, 2025)', votes: 0,
      source: 'EVE Workbench, “Cargo Viator”, uploaded 2025-09-27, +0 votes',
    },
    {
      key: 'solid', purpose: 'Speed', what: 'Three Inertial Stabilizers II and two warp rigs.',
      high: [{ name: 'Covert Ops Cloaking Device II' }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }], low: [{ name: 'Inertial Stabilizers II', qty: 3 }], rigs: [{ name: 'Medium Hyperspatial Velocity Optimizer II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 27.7, url: 'https://eveworkbench.com/fit/4aabd755-2920-45db-8bfe-be25e65e2c45', uploaded: '2025-09-27', version: 'Legion (September 9th, 2025)', votes: 0,
      source: 'EVE Workbench, “Speed Viator”, uploaded 2025-09-27, +0 votes',
    },
    {
      key: 'solid', purpose: 'Tank / util', what: 'Nullifier, Damage Control, WCS.',
      high: [{ name: 'Covert Ops Cloaking Device II' }, { name: 'Interdiction Nullifier II' }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Medium Shield Extender II' }, { name: 'Multispectrum Shield Hardener II' }], low: [{ name: 'Damage Control II' }, { name: 'Type-D Restrained Inertial Stabilizers' }, { name: 'Warp Core Stabilizer II' }], rigs: [{ name: 'Medium Polycarbon Engine Housing I' }, { name: 'Medium Hyperspatial Velocity Optimizer II' }], drones: [], cargo: [],
      train: [], ehpK: 32.8, url: 'https://eveworkbench.com/fit/306c4eeb-b9cd-453a-9701-9dd15f6f4a50', uploaded: '2025-07-31', version: 'Legion (May 27th, 2025)', votes: 3,
      source: 'EVE Workbench, “Danger - Util Hauler”, uploaded 2025-07-31, +3 votes',
    },
  ],
  // Prowler (25 public fits on EVE Workbench)
  12735: [
    {
      key: 'solid', purpose: 'Cargo', what: 'Three expanders, two cargo rigs.',
      high: [{ name: 'Covert Ops Cloaking Device II' }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }], low: [{ name: 'Expanded Cargohold II', qty: 3 }], rigs: [{ name: 'Medium Cargohold Optimization II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 28.9, url: 'https://eveworkbench.com/fit/df49132c-4edb-440c-889b-4ae4cf4f45ce', uploaded: '2025-09-27', version: 'Legion (September 9th, 2025)', votes: 0,
      source: 'EVE Workbench, “Cargo Prowler”, uploaded 2025-09-27, +0 votes',
    },
    {
      key: 'solid', purpose: 'Speed', what: 'Three stabilizers, two warp rigs.',
      high: [{ name: 'Covert Ops Cloaking Device II' }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }], low: [{ name: 'Inertial Stabilizers II', qty: 3 }], rigs: [{ name: 'Medium Hyperspatial Velocity Optimizer II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 31, url: 'https://eveworkbench.com/fit/71ff3dea-1d0c-4665-a217-ac49dcfd901f', uploaded: '2025-09-27', version: 'Legion (September 9th, 2025)', votes: 0,
      source: 'EVE Workbench, “speed prowler”, uploaded 2025-09-27, +0 votes',
    },
    {
      key: 'solid', purpose: 'Balanced', what: 'Nullifier, afterburner, WCS, stabilizers.',
      high: [{ name: 'Covert Ops Cloaking Device II' }, { name: 'Interdiction Nullifier II' }], mid: [{ name: '10MN Afterburner II' }, { name: 'Republic Fleet Medium Shield Extender' }, { name: 'Multispectrum Shield Hardener II' }], low: [{ name: 'Warp Core Stabilizer II' }, { name: 'Inertial Stabilizers II', qty: 2 }], rigs: [{ name: 'Medium Hyperspatial Velocity Optimizer II' }, { name: 'Medium Cargohold Optimization II' }], drones: [], cargo: [],
      train: [], ehpK: 18, url: 'https://eveworkbench.com/fit/038323db-0b6c-4c50-a1b6-a49755bcff96', uploaded: '2025-06-18', version: 'Legion (May 27th, 2025)', votes: 0,
      source: 'EVE Workbench, “All-Space Fed-Ex BR”, uploaded 2025-06-18, +0 votes',
    },
  ],
  // Prorator (9 public fits on EVE Workbench)
  12733: [
    {
      key: 'solid', purpose: 'Cargo', what: 'Four expanders, two cargo rigs.',
      high: [{ name: 'Covert Ops Cloaking Device II' }], mid: [{ name: 'Multispectrum Shield Hardener II' }, { name: 'Large Shield Extender II' }], low: [{ name: 'Expanded Cargohold II', qty: 4 }], rigs: [{ name: 'Medium Cargohold Optimization II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 17.9, url: 'https://eveworkbench.com/fit/5b24d061-fdc0-4345-86ca-19f0490b7165', uploaded: '2025-09-27', version: 'Legion (September 9th, 2025)', votes: 0,
      source: 'EVE Workbench, “Cargo Prorator”, uploaded 2025-09-27, +0 votes',
    },
    {
      key: 'solid', purpose: 'Speed', what: 'Four stabilizers, two warp rigs.',
      high: [{ name: 'Covert Ops Cloaking Device II' }], mid: [{ name: 'Small F-S9 Regolith Compact Shield Extender' }, { name: 'Large Shield Extender II' }], low: [{ name: 'Inertial Stabilizers II', qty: 4 }], rigs: [{ name: 'Medium Hyperspatial Velocity Optimizer II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 18.4, url: 'https://eveworkbench.com/fit/2643cc42-068b-4a24-91f3-de813420032b', uploaded: '2025-09-27', version: 'Legion (September 9th, 2025)', votes: 0,
      source: 'EVE Workbench, “Speed prorator”, uploaded 2025-09-27, +0 votes',
    },
  ],
  // Deluge (14 public fits on EVE Workbench)
  81046: [
    {
      key: 'solid', purpose: 'Cargo', what: 'Two expanders, two cargo rigs, light missiles.',
      high: [{ name: 'Covert Ops Cloaking Device II' }, { name: 'Rapid Light Missile Launcher II', qty: 3 }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Medium Shield Extender II' }], low: [{ name: 'Expanded Cargohold II', qty: 2 }], rigs: [{ name: 'Medium Cargohold Optimization II', qty: 2 }], drones: [], cargo: [{ name: 'Mjolnir Fury Light Missile', qty: 60 }],
      train: [], ehpK: 43, url: 'https://eveworkbench.com/fit/b38a52a4-0da6-4abf-8a84-490cbed42dca', uploaded: '2025-09-27', version: 'Legion (September 9th, 2025)', votes: 0,
      source: 'EVE Workbench, “Cargo Deluge”, uploaded 2025-09-27, +0 votes',
    },
    {
      key: 'solid', purpose: 'Tank', what: 'Shield buffer, Damage Control, WCS, nullifier.',
      high: [{ name: 'Covert Ops Cloaking Device II' }, { name: 'Rapid Light Missile Launcher II', qty: 2 }, { name: 'Interdiction Nullifier II' }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Medium Shield Extender II' }], low: [{ name: 'Damage Control II' }, { name: 'Warp Core Stabilizer II' }], rigs: [{ name: 'Medium Core Defense Field Extender II', qty: 2 }], drones: [], cargo: [{ name: 'Inferno Fury Light Missile', qty: 40 }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/6af35804-19d0-42fb-071f-08dc931eb58b', uploaded: '2024-06-23', version: 'Equinox - June 11th, 2024 (22.01)', votes: 6,
      source: 'EVE Workbench, “Tanky Hauler (Loru\'s Fit)”, uploaded 2024-06-23 (before 2025), +6 votes',
    },
    {
      key: 'solid', purpose: 'Slippery', what: 'Stabilizer, WCS, agility rigs.',
      high: [{ name: 'Covert Ops Cloaking Device II' }, { name: 'Interdiction Nullifier II' }, { name: 'Core Probe Launcher I' }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Multispectrum Shield Hardener II' }, { name: 'Large F-S9 Regolith Compact Shield Extender' }, { name: 'EM Shield Hardener II' }], low: [{ name: 'Inertial Stabilizers II' }, { name: 'Warp Core Stabilizer II' }], rigs: [{ name: 'Medium Low Friction Nozzle Joints I' }, { name: 'Medium Low Friction Nozzle Joints II' }], drones: [], cargo: [{ name: 'Core Scanner Probe I', qty: 16 }],
      train: [], ehpK: 48, url: 'https://eveworkbench.com/fit/5bf8cef0-277f-472b-a322-0d1789d9deee', uploaded: '2025-09-15', version: 'Legion (September 9th, 2025)', votes: 3,
      source: 'EVE Workbench, “Danger - Slip Hauler”, uploaded 2025-09-15, +3 votes',
    },
  ],
  // Bustard (35 public fits on EVE Workbench)
  12731: [
    {
      key: 'solid', purpose: 'Budget tank', what: 'Cloak + MWD, shield hardeners, Damage Control II (118.39k EHP, 224M).',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: 'EM Shield Hardener II', qty: 2 }, { name: 'Multispectrum Shield Hardener II' }, { name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Compact Explosive Shield Hardener' }, { name: 'Large F-S9 Regolith Compact Shield Extender' }], low: [{ name: 'Damage Control II' }, { name: 'Power Diagnostic System II' }, { name: 'Mark I Compact Power Diagnostic System' }], rigs: [{ name: 'Medium Core Defense Field Extender II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 118.4, url: 'https://eveworkbench.com/fit/d7bf457f-416e-47d5-a7d5-e1c18822dff0', uploaded: '2026-01-02', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Video Budget Bustard”, uploaded 2026-01-02, +0 votes',
    },
    {
      key: 'solid', purpose: 'Tank + nullifier (2026)', what: 'Adds nullifier, stabilizer and WCS.',
      high: [{ name: 'Improved Cloaking Device II' }, { name: 'Compact Interdiction Nullifier' }], mid: [{ name: 'Caldari Navy Medium Shield Extender', qty: 2 }, { name: 'Multispectrum Shield Hardener II' }, { name: 'Compact Multispectrum Shield Hardener' }, { name: 'Dread Guristas EM Shield Hardener' }, { name: '50MN Y-T8 Compact Microwarpdrive' }], low: [{ name: 'Damage Control II' }, { name: 'Inertial Stabilizers II' }, { name: 'Warp Core Stabilizer II' }], rigs: [{ name: 'Medium Core Defense Field Extender II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 109.4, url: 'https://eveworkbench.com/fit/3d53972b-6914-49fa-b213-e1e02d198777', uploaded: '2026-08-19', version: 'Cradle of War (June 9th, 2026)', votes: 0,
      source: 'EVE Workbench, “Brick 1.0”, uploaded 2026-08-19, +0 votes',
    },
    {
      key: 'solid', purpose: 'Premium tank', what: 'Faction hardeners (138.86k EHP, 660M).',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: 'Pith B-Type EM Shield Hardener', qty: 2 }, { name: 'Multispectrum Shield Hardener II' }, { name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Gist X-Type Explosive Shield Hardener' }, { name: 'Caldari Navy Large Shield Extender' }], low: [{ name: 'Shadow Serpentis Damage Control' }, { name: 'Power Diagnostic System II', qty: 2 }], rigs: [{ name: 'Medium Core Defense Field Extender II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 138.9, url: 'https://eveworkbench.com/fit/47c33712-3965-471f-a6c0-cecc2ad6ea20', uploaded: '2026-01-02', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Video Premium Bustard”, uploaded 2026-01-02, +0 votes',
    },
  ],
  // Occator (46 public fits on EVE Workbench)
  12745: [
    {
      key: 'solid', purpose: 'Tank, cloak trick (2026)', what: 'Armor hardeners and plate, Damage Control II.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Compact Multispectrum Shield Hardener' }, { name: 'EM Shield Amplifier II' }], low: [{ name: 'Damage Control II' }, { name: '800mm Rolled Tungsten Compact Plates' }, { name: 'Shadow Serpentis Explosive Armor Hardener', qty: 2 }, { name: 'Federation Navy EM Armor Hardener' }, { name: 'Shadow Serpentis Thermal Armor Hardener' }], rigs: [{ name: 'Medium Trimark Armor Pump II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 112.6, url: 'https://eveworkbench.com/fit/2783c2f8-3699-4e24-87cf-6d9bd84981cf', uploaded: '2026-07-05', version: 'Cradle of War (June 9th, 2026)', votes: 0,
      source: 'EVE Workbench, “High Sec MWD/CLOAK”, uploaded 2026-07-05, +0 votes',
    },
    {
      key: 'solid', purpose: 'Util', what: 'MJD, afterburner, nullifier.',
      high: [{ name: 'Compact Interdiction Nullifier' }, { name: 'Prototype Cloaking Device I' }], mid: [{ name: '10MN Y-S8 Compact Afterburner' }, { name: 'Medium Micro Jump Drive' }, { name: 'Medium Compact Pb-Acid Cap Battery' }], low: [{ name: 'EM Armor Hardener II' }, { name: '400mm Steel Plates II' }, { name: 'Explosive Armor Hardener II' }, { name: 'Damage Control II' }, { name: '\'Halcyon\' Core Equalizer I' }, { name: 'Shadow Serpentis Multispectrum Energized Membrane' }], rigs: [{ name: 'Medium Trimark Armor Pump II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 86.4, url: 'https://eveworkbench.com/fit/bcbfca4e-808c-43b3-a9c5-5fe4082cffcd', uploaded: '2025-09-15', version: 'Legion (September 9th, 2025)', votes: 3,
      source: 'EVE Workbench, “Danger - Util Hauler”, uploaded 2025-09-15, +3 votes',
    },
    {
      key: 'solid', purpose: 'Premium tank', what: 'Faction/deadspace hardeners.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Compact Multispectrum Shield Hardener' }, { name: 'EM Shield Amplifier II' }], low: [{ name: 'Syndicate 800mm Steel Plates' }, { name: 'Corpus B-Type EM Armor Hardener' }, { name: 'Core C-Type Explosive Armor Hardener', qty: 2 }, { name: 'Core C-Type Thermal Armor Hardener' }, { name: 'Damage Control II' }], rigs: [{ name: 'Medium Trimark Armor Pump II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 125.8, url: 'https://eveworkbench.com/fit/867132f3-2eda-450d-9fc1-4acd94889a87', uploaded: '2026-01-02', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Video Premium Occator hull”, uploaded 2026-01-02, +0 votes',
    },
  ],
  // Impel (19 public fits on EVE Workbench)
  12753: [
    {
      key: 'solid', purpose: 'Budget tank', what: 'T2 hardeners and plate.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Small Capacitor Booster II' }], low: [{ name: 'Thermal Armor Hardener II', qty: 2 }, { name: '400mm Steel Plates II' }, { name: 'EM Armor Hardener II' }, { name: 'Prototype Compact Explosive Armor Hardener I' }, { name: 'Prototype Compact Kinetic Armor Hardener I', qty: 2 }], rigs: [{ name: 'Medium Trimark Armor Pump II', qty: 2 }], drones: [], cargo: [{ name: 'Navy Cap Booster 400' }],
      train: [], ehpK: 99.8, url: 'https://eveworkbench.com/fit/d9cb09eb-91bf-44b5-a3e3-e7948b4d492e', uploaded: '2026-01-02', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Video Budget Impel”, uploaded 2026-01-02, +0 votes',
    },
    {
      key: 'solid', purpose: 'Premium tank', what: 'C-type hardeners.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Small Capacitor Booster II' }], low: [{ name: 'Core C-Type Thermal Armor Hardener', qty: 2 }, { name: '800mm Steel Plates II' }, { name: 'Core C-Type EM Armor Hardener' }, { name: 'Corpus C-Type Explosive Armor Hardener' }, { name: 'Core C-Type Kinetic Armor Hardener', qty: 2 }], rigs: [{ name: 'Medium Trimark Armor Pump II', qty: 2 }], drones: [], cargo: [{ name: 'Navy Cap Booster 400' }],
      train: [], ehpK: 129, url: 'https://eveworkbench.com/fit/fd7ad19c-d395-4c0a-9b04-e45f3c2282f2', uploaded: '2026-01-02', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Video Premium Impel”, uploaded 2026-01-02, +0 votes',
    },
    {
      key: 'solid', purpose: 'Brick', what: 'X-type hardeners, navy plate (166.1k EHP, 1.28B).',
      high: [{ name: 'Improved Cloaking Device II' }, { name: 'Interdiction Nullifier II' }], mid: [{ name: '10MN Afterburner II' }, { name: '\'Seed\' Micro Capacitor Booster I' }], low: [{ name: 'Corpus X-Type Thermal Armor Hardener', qty: 2 }, { name: 'Imperial Navy 800mm Steel Plates' }, { name: 'Corpus X-Type EM Armor Hardener', qty: 2 }, { name: 'Corpus X-Type Explosive Armor Hardener' }, { name: 'Corpus X-Type Kinetic Armor Hardener' }], rigs: [{ name: 'Medium Trimark Armor Pump II', qty: 2 }], drones: [], cargo: [{ name: 'Nanite Repair Paste', qty: 96 }, { name: 'Cap Booster 200', qty: 23 }],
      train: [], ehpK: 166.1, url: 'https://eveworkbench.com/fit/454b0d86-ae96-44c1-9b82-10b1db6005f5', uploaded: '2026-04-04', version: 'Catalyst (March 18th, 2026)', votes: 0,
      source: 'EVE Workbench, “The Brick”, uploaded 2026-04-04, +0 votes',
    },
  ],
  // Mastodon (20 public fits on EVE Workbench)
  12747: [
    {
      key: 'solid', purpose: 'Tank (2026)', what: 'Shield buffer, Damage Control II, stabilizers.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: 'Large Shield Extender II' }, { name: 'Medium Shield Extender II' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: '50MN Y-T8 Compact Microwarpdrive' }], low: [{ name: 'Damage Control II' }, { name: 'Power Diagnostic System II' }, { name: 'Inertial Stabilizers II', qty: 2 }], rigs: [{ name: 'Medium Core Defense Field Extender II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 115.7, url: 'https://eveworkbench.com/fit/c1e2028c-6498-40c0-9aa1-dfab5f3c9775', uploaded: '2026-06-22', version: 'Cradle of War (June 9th, 2026)', votes: 0,
      source: 'EVE Workbench, “Mastodon, HS Ops”, uploaded 2026-06-22, +0 votes',
    },
    {
      key: 'solid', purpose: 'Budget', what: 'Mixed shield and armor hardeners.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Compact Kinetic Shield Hardener' }, { name: 'Large F-S9 Regolith Compact Shield Extender' }], low: [{ name: 'IFFA Compact Damage Control' }, { name: 'Prototype Compact Kinetic Armor Hardener I' }, { name: 'Prototype Compact Explosive Armor Hardener I', qty: 2 }], rigs: [{ name: 'Medium Core Defense Field Extender II', qty: 2 }], drones: [], cargo: [{ name: 'Sisters Core Scanner Probe', qty: 16 }],
      train: [], ehpK: 106.3, url: 'https://eveworkbench.com/fit/2dffb68f-75a8-4b50-a1aa-a2bf94825ad9', uploaded: '2026-01-02', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Video Budget Mastodon”, uploaded 2026-01-02, +0 votes',
    },
  ],
  // Torrent (14 public fits on EVE Workbench)
  81047: [
    {
      key: 'solid', purpose: 'Budget tank', what: 'Cloak + MWD, shield hardeners.',
      high: [{ name: 'Improved Cloaking Device II' }], mid: [{ name: '50MN Y-T8 Compact Microwarpdrive' }, { name: 'Large Shield Extender II' }, { name: 'Thermal Shield Hardener II' }, { name: 'EM Shield Hardener II', qty: 2 }, { name: 'Kinetic Shield Hardener II' }], low: [{ name: 'Damage Control II' }, { name: 'Mark I Compact Power Diagnostic System', qty: 2 }], rigs: [{ name: 'Medium Core Defense Field Extender II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 142.5, url: 'https://eveworkbench.com/fit/73b638ce-e1d6-4b02-9e77-be81b9d0252c', uploaded: '2026-01-02', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Video Budget Torrent”, uploaded 2026-01-02, +0 votes',
    },
    {
      key: 'solid', purpose: 'Huge tank', what: 'Three Large F-S9 extenders, hardeners.',
      high: [{ name: 'Small Knave Scoped Energy Nosferatu' }, { name: 'Prototype Cloaking Device I' }], mid: [{ name: '10MN Y-S8 Compact Afterburner' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Large F-S9 Regolith Compact Shield Extender', qty: 3 }], low: [{ name: 'Power Diagnostic System II', qty: 2 }, { name: 'Damage Control II' }], rigs: [{ name: 'Medium Core Defense Field Extender II', qty: 2 }], drones: [], cargo: [],
      train: [], ehpK: 182.8, url: 'https://eveworkbench.com/fit/b131da45-0704-44ca-8365-809504ce68b4', uploaded: '2026-01-07', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Loru\'s HUGE Tank PI Hauler”, uploaded 2026-01-07, +0 votes',
    },
  ],
  // Orca (223 public fits on EVE Workbench)
  28606: [
    {
      key: 'solid', purpose: 'Max tank (EVE Uni standard, closest EWB fit)', what: 'Damage Control II + Reinforced Bulkheads II, three Large Transverse Bulkhead II, shield hardeners; boosts.',
      high: [{ name: 'Shield Command Burst II', qty: 2 }, { name: 'Large Murky Compact Remote Shield Booster', qty: 2 }, { name: 'Mining Foreman Burst II' }, { name: 'Medium S95a Scoped Remote Shield Booster' }], mid: [{ name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Gist X-Type EM Shield Hardener' }, { name: 'Gist X-Type Kinetic Shield Hardener' }, { name: 'Gist X-Type Thermal Shield Hardener' }], low: [{ name: 'Damage Control II' }, { name: 'Reinforced Bulkheads II' }], rigs: [{ name: 'Large Transverse Bulkhead II', qty: 3 }], drones: [], cargo: [{ name: 'Shield Extension Charge', qty: 300 }, { name: 'Mining Laser Optimization Charge', qty: 300 }, { name: 'Shield Harmonizing Charge', qty: 300 }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/2b7656b4-05c1-4429-39cf-08d875e25b53', uploaded: '2020-10-23', version: 'Update 18.10 (October 13th, 2020)', votes: 5,
      source: 'EVE Workbench, “Fleet Orca **UPDATED**”, uploaded 2020-10-23 (before 2025), +5 votes',
    },
    {
      key: 'solid', purpose: 'Tank + industrial core (2026)', what: 'Boosting fit, 492.06k EHP.',
      high: [{ name: 'Mining Foreman Burst II', qty: 3 }, { name: 'Shield Command Burst II' }, { name: 'Large Industrial Core II' }, { name: 'Large Asteroid Ore Compressor I' }], mid: [{ name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'EM Shield Hardener II' }, { name: 'Pith A-Type Kinetic Shield Hardener' }, { name: 'Gist X-Type Thermal Shield Hardener' }], low: [{ name: 'Damage Control II' }, { name: 'Reinforced Bulkheads II' }], rigs: [{ name: 'Large Core Defense Field Extender II', qty: 2 }, { name: 'Large Command Processor I' }], drones: [], cargo: [{ name: 'Shield Extension Charge', qty: 3300 }, { name: 'Mining Laser Field Enhancement Charge', qty: 3300 }, { name: 'Mining Laser Optimization Charge', qty: 3300 }, { name: 'Mining Laser Efficiency Charge', qty: 3300 }],
      train: [], ehpK: 492.1, url: 'https://eveworkbench.com/fit/18e43a78-175e-4db4-a92c-bc7931606ac7', uploaded: '2026-09-20', version: 'Cradle of War (June 9th, 2026)', votes: 0,
      source: 'EVE Workbench, “The Highsec Support Tank”, uploaded 2026-09-20, +0 votes',
    },
  ],
  // Charon (6 public fits on EVE Workbench)
  20185: [
    {
      key: 'solid', purpose: 'Max cargo', what: 'Three Expanded Cargohold II.',
      high: [], mid: [], low: [{ name: 'Expanded Cargohold II', qty: 3 }], rigs: [], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/be7fd48d-e12a-438a-5765-08d7d5b6e2f0', uploaded: '2020-04-02', version: 'Broker Relations', votes: 0,
      source: 'EVE Workbench, “<Pig-Army> Movey Boi”, uploaded 2020-04-02 (before 2025), +0 votes',
    },
    {
      key: 'solid', purpose: 'Agile', what: 'Two Inertial Stabilizers II + one Reinforced Bulkheads II.',
      high: [], mid: [], low: [{ name: 'Inertial Stabilizers II', qty: 2 }, { name: 'Reinforced Bulkheads II' }], rigs: [], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/cda15c88-125c-459a-f554-08dbff3b0bfe', uploaded: '2023-12-19', version: 'Havoc - November 14th, 2023', votes: 0,
      source: 'EVE Workbench, “Thicc Cargo, Charon, Hauling”, uploaded 2023-12-19 (before 2025), +0 votes',
    },
    {
      key: 'solid', purpose: 'Max tank', what: 'Three Reinforced Bulkheads II.',
      high: [], mid: [], low: [{ name: 'Reinforced Bulkheads II', qty: 3 }], rigs: [], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/7b3b59d9-8277-4eb7-2001-08d7fd9b40f2', uploaded: '2020-05-21', version: 'Surgical Strike (April 15th, 2020)', votes: 1,
      source: 'EVE Workbench, “Charon Cargo”, uploaded 2020-05-21 (before 2025), +1 vote',
    },
  ],
  // Obelisk (12 public fits on EVE Workbench)
  20187: [
    {
      key: 'solid', purpose: 'Max cargo', what: 'Three Expanded Cargohold II.',
      high: [], mid: [], low: [{ name: 'Expanded Cargohold II', qty: 3 }], rigs: [], drones: [], cargo: [],
      train: [], ehpK: 230.3, url: 'https://eveworkbench.com/fit/30fca230-1be6-4ce1-b1f5-49b49388708c', uploaded: '2026-06-15', version: 'Cradle of War (June 9th, 2026)', votes: 0,
      source: 'EVE Workbench, “Cargo Obelisk”, uploaded 2026-06-15, +0 votes',
    },
    {
      key: 'solid', purpose: 'Max tank', what: 'Three Reinforced Bulkheads II.',
      high: [], mid: [], low: [{ name: 'Reinforced Bulkheads II', qty: 3 }], rigs: [], drones: [], cargo: [],
      train: [], ehpK: 598.8, url: 'https://eveworkbench.com/fit/2adff7b4-5b7d-4f92-933d-e7b209159558', uploaded: '2026-09-06', version: 'Cradle of War (June 9th, 2026)', votes: 0,
      source: 'EVE Workbench, “KO PvE/PvP Obelisk”, uploaded 2026-09-06, +0 votes',
    },
  ],
  // Providence (1 public fits on EVE Workbench)
  20183: [
    {
      key: 'solid', purpose: 'Max tank', what: 'Three Reinforced Bulkheads II.',
      high: [], mid: [], low: [{ name: 'Reinforced Bulkheads II', qty: 3 }], rigs: [], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/50a96d11-6700-4958-0308-08dbaba5276e', uploaded: '2023-09-05', version: '- Unknown -', votes: 0,
      source: 'EVE Workbench, “Providence refit”, uploaded 2023-09-05 (before 2025), +0 votes',
    },
  ],
  // Fenrir (2 public fits on EVE Workbench)
  20189: [
    {
      key: 'solid', purpose: 'Agile', what: 'Three Shadow Serpentis Inertial Stabilizers.',
      high: [], mid: [], low: [{ name: 'Shadow Serpentis Inertial Stabilizers', qty: 3 }], rigs: [], drones: [], cargo: [{ name: 'Type-D Restrained Expanded Cargo' }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/3143d534-a1ea-4a13-b073-08d7e7c91bab', uploaded: '2020-04-26', version: 'Surgical Strike (April 15th, 2020)', votes: 1,
      source: 'EVE Workbench, “Reduced Alignment”, uploaded 2020-04-26 (before 2025), +1 vote',
    },
    {
      key: 'solid', purpose: 'Agile, refits carried', what: 'Three Inertial Stabilizers II, with expanders and bulkheads in the hold.',
      high: [], mid: [], low: [{ name: 'Inertial Stabilizers II', qty: 3 }], rigs: [], drones: [], cargo: [{ name: 'Expanded Cargohold II', qty: 3 }, { name: 'Reinforced Bulkheads II', qty: 3 }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/e988318b-35c4-4d4d-7660-08dcc15f0bdf', uploaded: '2024-09-03', version: 'Equinox - June 11th, 2024 (22.01)', votes: 0,
      source: 'EVE Workbench, “Fenrir - Ausrichtezeit (+Imps)”, uploaded 2024-09-03 (before 2025), +0 votes',
    },
  ],
  // Bowhead (17 public fits on EVE Workbench)
  34328: [
    {
      key: 'solid', purpose: 'MWD trick, tank', what: '500MN MWD, Damage Control II + two Reinforced Bulkheads II, three Capital Transverse Bulkhead II.',
      high: [], mid: [{ name: 'Gistum C-Type Multispectrum Shield Hardener', qty: 2 }, { name: '500MN Y-T8 Compact Microwarpdrive' }], low: [{ name: 'Reinforced Bulkheads II', qty: 2 }, { name: 'Damage Control II' }], rigs: [{ name: 'Capital Transverse Bulkhead II', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/06acfa11-15e7-4f5a-5904-08d6b04568c0', uploaded: '2019-03-27', version: 'Onslaught', votes: 14,
      source: 'EVE Workbench, “Transport 10 sec. align Microwarp trick”, uploaded 2019-03-27 (before 2025), +14 votes',
    },
    {
      key: 'solid', purpose: 'Same idea, 2025', what: 'ORE Reinforced Bulkheads.',
      high: [], mid: [{ name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: '500MN Y-T8 Compact Microwarpdrive' }], low: [{ name: 'Damage Control II' }, { name: 'ORE Reinforced Bulkheads', qty: 2 }], rigs: [{ name: 'Capital Transverse Bulkhead II', qty: 3 }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/4aa6b02a-8aa5-4a73-bf4e-08dd7d176e57', uploaded: '2025-04-18', version: '- Unknown -', votes: 0,
      source: 'EVE Workbench, “A45G Art Hauler”, uploaded 2025-04-18, +0 votes',
    },
    {
      key: 'solid', purpose: 'Afterburner align', what: '100MN afterburner, stabilizers.',
      high: [], mid: [{ name: 'Core X-Type 100MN Afterburner' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }], low: [{ name: 'Shadow Serpentis Inertial Stabilizers', qty: 2 }, { name: 'Damage Control II' }], rigs: [{ name: 'Capital Transverse Bulkhead I', qty: 2 }, { name: 'Capital Hyperspatial Velocity Optimizer I' }], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/3351ed0f-60b4-46db-e20a-08d9300da4e5', uploaded: '2021-06-20', version: 'Update 19.05 (June 8th, 2021)', votes: 2,
      source: 'EVE Workbench, “Bowhead - 7.5 Sec Align/Warp (Afterburner Lvl. 5)”, uploaded 2021-06-20 (before 2025), +2 votes',
    },
  ],
  // Avalanche (8 public fits on EVE Workbench)
  81040: [
    {
      key: 'solid', purpose: 'Travel, cargo', what: 'Three Expanded Cargohold II.',
      high: [{ name: 'Rapid Heavy Missile Launcher II', qty: 6 }], mid: [{ name: 'Capital Flex Shield Hardener II' }, { name: 'Multispectrum Shield Hardener II', qty: 2 }], low: [{ name: 'Expanded Cargohold II', qty: 3 }], rigs: [], drones: [], cargo: [{ name: 'Shield Thermal Resistance Script', qty: 400 }, { name: 'Legion Inferno Auto-Targeting Heavy Missile', qty: 3850 }],
      train: [], ehpK: 283.5, url: 'https://eveworkbench.com/fit/33d12b0c-ab90-4c33-ab13-6a5e8ab5ca1d', uploaded: '2025-05-28', version: 'Legion (May 27th, 2025)', votes: 0,
      source: 'EVE Workbench, “Avalanche Travel Fit”, uploaded 2025-05-28, +0 votes',
    },
    {
      key: 'solid', purpose: 'Tank (PI hauling)', what: 'Damage Control II + two Reinforced Bulkheads II, flex hardener.',
      high: [{ name: 'Rapid Heavy Missile Launcher II', qty: 6 }], mid: [{ name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Capital Flex Shield Hardener II' }], low: [{ name: 'Damage Control II' }, { name: 'Reinforced Bulkheads II', qty: 2 }], rigs: [], drones: [], cargo: [{ name: 'Shield EM Resistance Script', qty: 21 }, { name: 'Shield Thermal Resistance Script', qty: 10 }, { name: 'Shield Kinetic Resistance Script', qty: 10 }, { name: 'Shield Explosive Resistance Script', qty: 10 }, { name: 'Legion Inferno Auto-Targeting Heavy Missile', qty: 1150 }],
      train: [], ehpK: 624, url: 'https://eveworkbench.com/fit/d5591adf-26ae-46f9-aeeb-81f7166f2922', uploaded: '2026-04-10', version: 'Catalyst (March 18th, 2026)', votes: 0,
      source: 'EVE Workbench, “Loru\'s Max PI Hauler”, uploaded 2026-04-10, +0 votes',
    },
    {
      key: 'solid', purpose: 'Top voted', what: 'Cruise missiles, Damage Control, bulkhead.',
      high: [{ name: 'Cruise Missile Launcher II', qty: 6 }], mid: [{ name: 'Multispectrum Shield Hardener II', qty: 2 }, { name: 'Capital Flex Shield Hardener II' }], low: [{ name: 'Damage Control II' }, { name: 'Reinforced Bulkheads II' }, { name: 'Ballistic Control System II' }], rigs: [], drones: [], cargo: [{ name: 'Shield EM Resistance Script' }, { name: 'Shield Thermal Resistance Script' }, { name: 'Shield Kinetic Resistance Script' }, { name: 'Shield Explosive Resistance Script' }, { name: 'Legion Inferno Auto-Targeting Cruise Missile', qty: 162 }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/e0bdb117-7b24-485c-071c-08dc931eb58b', uploaded: '2024-06-23', version: 'Equinox - June 11th, 2024 (22.01)', votes: 2,
      source: 'EVE Workbench, “Lorulanche (Loru\'s Fit)”, uploaded 2024-06-23 (before 2025), +2 votes',
    },
  ],
  // Rhea (5 public fits on EVE Workbench)
  28844: [
    {
      key: 'solid', purpose: 'Tank', what: 'Three Reinforced Bulkheads II.',
      high: [], mid: [], low: [{ name: 'Reinforced Bulkheads II', qty: 3 }], rigs: [], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/e41589cb-c459-4a04-0ceb-08de2ada5af0', uploaded: '2025-11-29', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Rhea”, uploaded 2025-11-29, +0 votes',
    },
    {
      key: 'solid', purpose: 'Cargo', what: 'Three ORE Expanded Cargohold.',
      high: [], mid: [], low: [{ name: 'ORE Expanded Cargohold', qty: 3 }], rigs: [], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/00313040-46b9-4dcf-0ce9-08de2ada5af0', uploaded: '2025-11-29', version: 'Catalyst (November 18th, 2025)', votes: 0,
      source: 'EVE Workbench, “Rhea”, uploaded 2025-11-29, +0 votes',
    },
  ],
  // Anshar (3 public fits on EVE Workbench)
  28848: [
    {
      key: 'solid', purpose: 'Tank', what: 'Three Synthetic Hull Conversion Reinforced Bulkheads.',
      high: [], mid: [], low: [{ name: 'Synthetic Hull Conversion Reinforced Bulkheads', qty: 3 }], rigs: [], drones: [], cargo: [],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/64add4f4-eaaa-421d-d0c5-08dceacf1def', uploaded: '2024-10-19', version: 'Equinox - June 11th, 2024 (22.01)', votes: 0,
      source: 'EVE Workbench, “Anshar bricktank fit”, uploaded 2024-10-19 (before 2025), +0 votes',
    },
  ],
  // Nomad (2 public fits on EVE Workbench)
  28846: [
    {
      key: 'solid', purpose: 'Jump (fuel), refits carried', what: 'Three Experimental Jump Drive Economizer; expanders and stabilizers in the hold.',
      high: [], mid: [], low: [{ name: 'Experimental Jump Drive Economizer', qty: 3 }], rigs: [], drones: [], cargo: [{ name: 'ORE Expanded Cargohold', qty: 3 }, { name: 'Shadow Serpentis Inertial Stabilizers', qty: 3 }],
      train: [], ehpK: null, url: 'https://eveworkbench.com/fit/835086a0-b81b-48b1-f85c-08d6a95f7e76', uploaded: '2019-03-15', version: 'Onslaught', votes: 0,
      source: 'EVE Workbench, “Economy Align Cargo JF”, uploaded 2019-03-15 (before 2025), +0 votes',
    },
  ],
};
