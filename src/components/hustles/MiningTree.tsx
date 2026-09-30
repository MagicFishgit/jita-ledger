import { units } from '../../lib/format';
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
  return (
    <ShipTree label="Mining ships" nodes={HULLS} edges={EDGES} lanes={LANE_SAID} cols={7} rows={5} here={here}
      nodeTip={(h) => { const p = paceOf(h.id); return p ? `Your pace in it: ${units(Math.round(p.m3PerMin))} m³ a minute.` : null; }}
      facts={(h, stats) => {
        const p = paceOf(h.id);
        return [
          ...(stats ? [['Ore hold', `${units(stats.oreHold)} m³`] as [string, string]] : []),
          ['Your pace in it', p ? `${units(Math.round(p.m3PerMin))} m³/min over ${units(p.sessions)} session${p.sessions === 1 ? '' : 's'}` : 'Not mined in it yet'],
        ];
      }}>
      {children}
    </ShipTree>
  );
}
