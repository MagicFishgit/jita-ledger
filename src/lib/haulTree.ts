/**
 * The hauling tree: every ship that hauls, where it sits and what leads to what, for the flowchart on Hauling. Each race
 * has the same ladder (ESI's groups, checked 30 September 2026): a small and a big Tech I industrial, then the two Tech II
 * transports (a Blockade Runner that cloaks and can't be cargo-scanned, a Deep Space Transport with a 50,000 m³ fleet
 * hangar and a tank), then a Freighter and a Jump Freighter. Beside them the specialists (one big hold for one kind of
 * goods), the Upwell line (an infrastructure hold for colony resources) and ORE's (the Porpoise and Orca haul as well as
 * boost; the Bowhead carries assembled ships). Holds and skills are read from ESI at run time, never written here. Pure.
 */

import type { Point, TreeNode } from './shipTree';

export type HaulLane = 'amarr' | 'caldari' | 'gallente' | 'minmatar' | 'special' | 'upwell' | 'ore';
export type HaulNode = TreeNode & { name: string; lane: HaulLane };

export const HAUL_LANES: Record<HaulLane, string> = {
  amarr: 'Amarr', caldari: 'Caldari', gallente: 'Gallente', minmatar: 'Minmatar',
  special: 'One kind of goods', upwell: 'Upwell', ore: 'ORE',
};

const ladder = (lane: HaulLane, row: number, ids: [number, string][], roles: string[]): HaulNode[] =>
  ids.map(([id, name], col) => ({ id, name, col, row, lane, role: roles[col] }));

const ROLES = [
  'The small Tech I industrial: cheap and quick to train, a small hold.',
  'The big Tech I industrial: the most cargo before Tech II, and a gank target when full.',
  'Blockade Runner: cloaks and warps cloaked, and no one can scan its cargo. Small hold; the safe way to move valuables.',
  'Deep Space Transport: a 50,000 m³ fleet hangar and a real tank. The courier ship for big, cheap loads.',
  'Freighter: hundreds of thousands of m³. Slow, and ganked in fleets when what it carries is worth it.',
  'Jump Freighter: a freighter that jumps between systems. The null-sec and low-sec lifeline, too dear for high-sec runs.',
];

export const HAUL_HULLS: HaulNode[] = [
  ...ladder('amarr', 0, [[19744, 'Sigil'], [1944, 'Bestower'], [12733, 'Prorator'], [12753, 'Impel'], [20183, 'Providence'], [28850, 'Ark']], ROLES),
  ...ladder('caldari', 1, [[648, 'Badger'], [649, 'Tayra'], [12729, 'Crane'], [12731, 'Bustard'], [20185, 'Charon'], [28844, 'Rhea']], ROLES),
  ...ladder('gallente', 2, [[650, 'Nereus'], [657, 'Iteron Mark V'], [12743, 'Viator'], [12745, 'Occator'], [20187, 'Obelisk'], [28848, 'Anshar']], ROLES),
  ...ladder('minmatar', 3, [[653, 'Wreathe'], [652, 'Mammoth'], [12735, 'Prowler'], [12747, 'Mastodon'], [20189, 'Fenrir'], [28846, 'Nomad']], ROLES),
  { id: 655, name: 'Epithal', col: 0, row: 4, lane: 'special', role: 'A 45,000 m³ hold for planetary goods only: the PI hauler.' },
  { id: 656, name: 'Miasmos', col: 1, row: 4, lane: 'special', role: 'A 42,000 m³ ore hold: hauls ore from a mining fleet.' },
  { id: 654, name: 'Kryos', col: 2, row: 4, lane: 'special', role: 'A 50,000 m³ mineral hold and 30,000 m³ ice hold.' },
  { id: 651, name: 'Hoarder', col: 3, row: 4, lane: 'special', role: 'A 41,000 m³ ammo hold and 30,000 m³ gas hold.' },
  { id: 2863, name: 'Primae', col: 4, row: 4, lane: 'special', role: 'ORE’s small multi-hold for planetary work: command center, PI, gas and ice holds.' },
  { id: 81008, name: 'Squall', col: 1, row: 5, lane: 'upwell', role: 'Upwell’s industrial: a 45,000 m³ infrastructure hold for colony resources.' },
  { id: 81046, name: 'Deluge', col: 2, row: 5, lane: 'upwell', role: 'Upwell’s Blockade Runner: can’t be cargo-scanned, with a 30,000 m³ infrastructure hold.' },
  { id: 81047, name: 'Torrent', col: 3, row: 5, lane: 'upwell', role: 'Upwell’s Deep Space Transport: a 30,000 m³ fleet hangar and a 60,000 m³ infrastructure hold.' },
  { id: 81040, name: 'Avalanche', col: 4, row: 5, lane: 'upwell', role: 'Upwell’s freighter: 205,000 m³ of cargo and a 2,000,000 m³ infrastructure hold.' },
  { id: 42244, name: 'Porpoise', col: 3, row: 6, lane: 'ore', role: 'Boosts and compresses for a mining fleet; a 50,000 m³ ore hold.' },
  { id: 28606, name: 'Orca', col: 4, row: 6, lane: 'ore', role: 'Hauls as well as boosts: 30,000 m³ of cargo, a 40,000 m³ fleet hangar and a 150,000 m³ ore hold.' },
  { id: 34328, name: 'Bowhead', col: 5, row: 6, lane: 'ore', role: 'Carries assembled ships: a 1,600,000 m³ ship maintenance bay. Its cargo hold is only 4,000 m³.' },
];

/** Paths: along each race's ladder, and the Upwell and ORE lines. */
export const HAUL_EDGES: [number, number][] = [
  ...(['amarr', 'caldari', 'gallente', 'minmatar', 'upwell', 'ore'] as HaulLane[]).flatMap((lane) => {
    const row = HAUL_HULLS.filter((h) => h.lane === lane && h.id !== 34328).sort((a, b) => a.col - b.col);
    // Left to right along each ladder. The two Tech II transports are alternatives rather than steps (both need the big
    // industrial's skill and Transport Ships), which each node's role says; a path around one would cross the other.
    return row.slice(1).map((h, i): [number, number] => [row[i].id, h.id]);
  }),
];

/**
 * zKillboard's record of each hull in high-sec, 1 July to 29 September 2026 (91 days): losses, and how many of those it
 * labels ganked (a pilot on the mail was killed by CONCORD there shortly after). There's no denominator: nobody records
 * the haulers that got through, so it says where and how often each kind dies, not a chance of dying.
 */
export const HAUL_LOSSES: Record<number, { lost: number; ganked: number }> = {
  20185: { lost: 268, ganked: 142 }, 20187: { lost: 217, ganked: 120 }, 20183: { lost: 136, ganked: 75 }, 20189: { lost: 96, ganked: 55 },
  81040: { lost: 47, ganked: 31 }, 34328: { lost: 38, ganked: 23 }, 28844: { lost: 42, ganked: 10 }, 28846: { lost: 14, ganked: 3 },
  28848: { lost: 14, ganked: 3 }, 28850: { lost: 12, ganked: 3 }, 12745: { lost: 312, ganked: 86 }, 12731: { lost: 241, ganked: 58 },
  12753: { lost: 101, ganked: 25 }, 12747: { lost: 93, ganked: 28 }, 81047: { lost: 48, ganked: 12 }, 12743: { lost: 401, ganked: 196 },
  12729: { lost: 311, ganked: 142 }, 12735: { lost: 172, ganked: 77 }, 12733: { lost: 130, ganked: 63 }, 81046: { lost: 70, ganked: 20 },
  28606: { lost: 142, ganked: 36 }, 42244: { lost: 128, ganked: 52 }, 649: { lost: 596, ganked: 134 }, 648: { lost: 483, ganked: 62 },
  657: { lost: 436, ganked: 99 }, 656: { lost: 235, ganked: 61 }, 655: { lost: 212, ganked: 46 }, 650: { lost: 200, ganked: 35 },
  1944: { lost: 181, ganked: 45 }, 652: { lost: 167, ganked: 42 }, 19744: { lost: 155, ganked: 11 }, 653: { lost: 149, ganked: 15 },
  81008: { lost: 124, ganked: 11 }, 654: { lost: 105, ganked: 15 }, 651: { lost: 69, ganked: 13 },
};

/** Where the figures below come from. */
export const GANK_SOURCE = 'zKillboard, high-sec losses 1 July to 29 September 2026';

/**
 * What the ganked of each class carried and how many came for them (zKillboard, same 91 days): the median, and where and
 * how it happens, a point each.
 */
export const GANK_BY_CLASS: Record<number, { attackers: number; cargo: string; points: Point[] }> = {
  28: { attackers: 1, cargo: '506 M', points: [
    { kind: 'warn', lead: 'Where', text: 'Jita 4-4’s undock above all, then Josekorn, Sivala and Uedama.' },
    { kind: 'info', lead: 'At Jita', text: 'One Tornado each, for a median 672 M of cargo.' },
  ] },
  1202: { attackers: 1, cargo: '29 M', points: [
    { kind: 'warn', lead: 'Where', text: 'Jita 4-4’s undock: 393 of them.' },
    { kind: 'info', lead: 'Shot blind', text: 'It can’t be cargo-scanned, so gankers guess: 43% of those ganked carried under 10 M.' },
  ] },
  380: { attackers: 7, cargo: '1.81 B', points: [
    { kind: 'warn', lead: 'Where', text: 'Juunigaishi, Sivala, Uedama and Deltole.' },
    { kind: 'info', lead: 'Wars', text: 'In The Forge a DST was twelve times as likely to die to a war as to a gank.' },
  ] },
  941: { attackers: 7.5, cargo: '36 M', points: [
    { kind: 'warn', lead: 'Where', text: 'Uedama and the mining belts: mostly killed mining, not hauling.' },
  ] },
  513: { attackers: 46, cargo: '1.50 B', points: [
    { kind: 'warn', lead: 'Where', text: 'Uedama above all (359 of 446), then Jita’s gates: Perimeter, Sobaseki, New Caldari.' },
    { kind: 'warn', lead: 'Empty', text: '70 carried under 10 M, 65 of them in Uedama: an empty freighter isn’t safe there.' },
  ] },
  902: { attackers: 53, cargo: '236 M', points: [
    { kind: 'warn', lead: 'Where', text: 'Uedama, Jita and Sivala.' },
  ] },
};
