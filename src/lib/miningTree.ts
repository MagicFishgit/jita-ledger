/**
 * The mining tree: every hull that mines, where it sits and what leads to what, for the flowchart on Mining. The hulls
 * and their groups are ESI's (checked 29 September 2026): the Venture and its Consortium Issue (frigates), the Prospect
 * and Endurance (Expedition Frigates; the Endurance mines ice), the Pioneer, its Consortium Issue and the Outrider (the
 * mining destroyers; the Outrider is a Command Destroyer needing Mining Destroyer V), the Procurer, Retriever and Covetor
 * (barges), the Skiff, Mackinaw and Hulk (exhumers, each the tech II of one barge), and the Porpoise, Orca and Rorqual
 * (boosting and compression; the Rorqual only in null-sec), and the Perseverance, an ice-mining Pioneer from the Winter
 * Nexus event (December 2025), with no path into it but a contract. What each needs is read from ESI at run time
 * (`typeRequirements`), never written here. Pure.
 */

import type { TreeNode } from './shipTree';

export type Lane = 'frigate' | 'expedition' | 'destroyer' | 'tank' | 'hold' | 'yield' | 'command';

export type HullNode = TreeNode & { name: string; lane: Lane };

export const HULLS: HullNode[] = [
  { id: 32880, name: 'Venture', col: 0, row: 3, lane: 'frigate', role: 'Where everyone starts: cheap, quick to train, a small ore hold.' },
  { id: 89648, name: 'Venture Consortium Issue', col: 1, row: 0, lane: 'frigate', role: 'A better Venture: a bigger hold and an extra mid slot, at Mining Frigate III.' },
  { id: 33697, name: 'Prospect', col: 2, row: 0, lane: 'expedition', role: 'Tech II expedition frigate: covert-ops cloak, a 12,500 m³ hold, made for ore in dangerous space.' },
  { id: 37135, name: 'Endurance', col: 3, row: 0, lane: 'expedition', role: 'Tech II expedition frigate built for ice: one ice laser, a 19,000 m³ hold.', note: 'For ice, not ore.' },
  { id: 89240, name: 'Pioneer', col: 1, row: 1, lane: 'destroyer', role: 'The mining destroyer: three turrets, an 8,000 m³ hold, a big step over the Venture on little training.' },
  { id: 89647, name: 'Pioneer Consortium Issue', col: 2, row: 1, lane: 'destroyer', role: 'A better Pioneer: 10,000 m³ hold and an extra mid slot, at Mining Destroyer II.' },
  { id: 89649, name: 'Outrider', col: 3, row: 1, lane: 'destroyer', role: 'The command mining destroyer: 20,000 m³ hold and a command burst for a small fleet.', note: 'Needs Mining Destroyer V.' },
  { id: 17480, name: 'Procurer', col: 2, row: 2, lane: 'tank', role: 'The barge with the tank: survives gankers other barges don’t.' },
  { id: 17478, name: 'Retriever', col: 2, row: 3, lane: 'hold', role: 'The barge with the hold: 27,500 m³, so fewer trips to the station.' },
  { id: 17476, name: 'Covetor', col: 2, row: 4, lane: 'yield', role: 'The barge with the yield: mines most, holds least; wants a hauler or an Orca.' },
  { id: 22546, name: 'Skiff', col: 3, row: 2, lane: 'tank', role: 'Tech II Procurer: the toughest miner, the safest solo in high-sec.' },
  { id: 22548, name: 'Mackinaw', col: 3, row: 3, lane: 'hold', role: 'Tech II Retriever: a 31,500 m³ hold for long unattended runs.' },
  { id: 22544, name: 'Hulk', col: 3, row: 4, lane: 'yield', role: 'Tech II Covetor: the most m³ of any barge, and a ganker’s favourite.' },
  { id: 42244, name: 'Porpoise', col: 4, row: 3, lane: 'command', role: 'Boosts a fleet’s mining and compresses ore on the spot; 50,000 m³ hold.' },
  { id: 28606, name: 'Orca', col: 5, row: 3, lane: 'command', role: 'Bigger boosts, a 150,000 m³ ore hold and a fleet hangar: a multibox fleet’s mothership.' },
  { id: 28352, name: 'Rorqual', col: 6, row: 3, lane: 'command', role: 'The capital booster and compressor: the biggest boosts in the game.',
    note: 'Null-sec only: capitals can’t enter high-sec. No fit for it has been published since Catalyst (November 2025); its last 400 losses carried a Capital Industrial Core II, the Pulse Activated Nexus Invulnerability Core, Mining Foreman Burst IIs, a Capital Asteroid Ore Compressor and ‘Excavator’ Mining Drones most.' },
  { id: 91174, name: 'Perseverance', col: 4, row: 0, lane: 'destroyer', role: 'A Pioneer built for ice: three ice lasers, a 21,000 m³ hold, and crits on ice twice as often.',
    note: 'A limited edition from the Winter Nexus event (December 2025 to January 2026): found on contracts, not the market. No popular fit for it yet.' },
];

/** Paths: from one hull to the next worth moving to. */
export const EDGES: [number, number][] = [
  [32880, 89648], [89648, 33697], [33697, 37135],
  [32880, 89240], [89240, 89647], [89647, 89649],
  [32880, 17480], [32880, 17478], [32880, 17476],
  [17480, 22546], [17478, 22548], [17476, 22544],
  [22548, 42244], [42244, 28606], [28606, 28352],
];

export const LANE_SAID: Record<Lane, string> = {
  frigate: 'Frigates', expedition: 'Expedition frigates', destroyer: 'Mining destroyers',
  tank: 'Tank: survive', hold: 'Hold: fewer trips', yield: 'Yield: most m³', command: 'Boosts and fleets',
};

export { nodeState, type NodeState } from './shipTree';
