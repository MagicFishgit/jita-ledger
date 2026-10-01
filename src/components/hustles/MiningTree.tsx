import { CARGO_FIVE, holdsFor } from '../../lib/cargo';
import { units } from '../../lib/format';
import { EDGES, HULLS, LANE_SAID, type HullNode } from '../../lib/miningTree';
import { ShipTree } from '../ShipTree';
import { skillsUnread, whose, whoseStart } from '../../lib/pilot';
import { usePilot } from '../pilot';

/**
 * The mining tree (ShipTree with the mining hulls): each hull's ore hold and the pilot's own measured pace in it, and its
 * mastery tiers under it (`MasteryTiers`, passed in). Said for whoever it's shown for: yours, or an alt's by name.
 */
export function MiningTree({ here, paceOf, children }: {
  /** The hull the pilot is in (yours from ESI, an alt's at the cloud's last read), or the one it mined most in lately. */
  here: number | null;
  /** The pilot's measured m³ a minute in a hull, from its sessions, with how many. */
  paceOf: (hull: number) => { m3PerMin: number; sessions: number } | null;
  /** What opens under a hull's details: its mastery tiers, given the hull's Jita price. */
  children: (hull: HullNode, price: number | null) => React.ReactNode;
}) {
  const pilot = usePilot();
  const unread = skillsUnread(pilot);
  return (
    <ShipTree label="Mining ships" nodes={HULLS} edges={EDGES} lanes={LANE_SAID} cols={7} rows={5} here={here}
      nodeTip={(h) => { const p = paceOf(h.id); return p ? `${whoseStart(pilot)} pace in it: ${units(Math.round(p.m3PerMin))} m³ a minute.` : null; }}
      facts={(h, stats, dg) => {
        const p = paceOf(h.id);
        // The ore hold at the pilot's skills: Mining Barge and Exhumers grow the Retriever's and Mackinaw's (lib/cargo.ts).
        // An alt whose skills aren't read has only the figure at V: worked out at none, it would read as its own.
        const hold = dg ? holdsFor(dg, [], pilot.skills ?? {}).ore ?? 0 : stats?.oreHold ?? 0;
        const holdV = dg ? holdsFor(dg, [], CARGO_FIVE).ore ?? 0 : hold;
        const holdSaid = unread ? `${units(Math.round(holdV))} m³ with every skill at V`
          : `${units(Math.round(hold))} m³ at ${whose(pilot)} skills${holdV > hold + 0.5 ? `, ${units(Math.round(holdV))} at V` : ''}`;
        return [
          ...(holdV > 0 ? [['Ore hold', holdSaid] as [string, string]] : []),
          [`${whoseStart(pilot)} pace in it`, p ? `${units(Math.round(p.m3PerMin))} m³/min over ${units(p.sessions)} session${p.sessions === 1 ? '' : 's'}` : 'Not mined in it yet'],
        ];
      }}>
      {children}
    </ShipTree>
  );
}
