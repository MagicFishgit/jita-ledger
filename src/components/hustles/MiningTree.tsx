import { CARGO_FIVE, holdsFor } from '../../lib/cargo';
import { units } from '../../lib/format';
import { useData } from '../../lib/store';
import { EDGES, HULLS, LANE_SAID, type HullNode } from '../../lib/miningTree';
import { ShipTree } from '../ShipTree';

/**
 * The mining tree (ShipTree with the mining hulls): each hull's ore hold and your own measured pace in it, and its mastery
 * tiers under it (`MasteryTiers`, passed in).
 */
export function MiningTree({ here, paceOf, children }: {
  /** The hull you're in (ESI), or the one you mined most in lately. */
  here: number | null;
  /** Your measured m³ a minute in a hull, from sessions, with how many. */
  paceOf: (hull: number) => { m3PerMin: number; sessions: number } | null;
  /** What opens under a hull's details: its mastery tiers, given the hull's Jita price. */
  children: (hull: HullNode, price: number | null) => React.ReactNode;
}) {
  const d = useData();
  return (
    <ShipTree label="Mining ships" nodes={HULLS} edges={EDGES} lanes={LANE_SAID} cols={7} rows={5} here={here}
      nodeTip={(h) => { const p = paceOf(h.id); return p ? `Your pace in it: ${units(Math.round(p.m3PerMin))} m³ a minute.` : null; }}
      facts={(h, stats, dg) => {
        const p = paceOf(h.id);
        // The ore hold at your skills: Mining Barge and Exhumers grow the Retriever's and Mackinaw's (lib/cargo.ts).
        const hold = dg ? holdsFor(dg, [], d.skills ?? {}).ore ?? 0 : stats?.oreHold ?? 0;
        const holdV = dg ? holdsFor(dg, [], CARGO_FIVE).ore ?? 0 : hold;
        return [
          ...(hold > 0 ? [['Ore hold', `${units(Math.round(hold))} m³ at your skills${holdV > hold + 0.5 ? `, ${units(Math.round(holdV))} at V` : ''}`] as [string, string]] : []),
          ['Your pace in it', p ? `${units(Math.round(p.m3PerMin))} m³/min over ${units(p.sessions)} session${p.sessions === 1 ? '' : 's'}` : 'Not mined in it yet'],
        ];
      }}>
      {children}
    </ShipTree>
  );
}
