import { useEffect, useState, type ReactNode } from 'react';
import { Truck } from 'lucide-react';
import { bareEhp, CARGO_FIVE, generalSpace, holdsFor, holdsSaid } from '../../lib/cargo';
import type { HullClass } from '../../lib/courier';
import { units } from '../../lib/format';
import { GANK_BY_CLASS, GANK_SOURCE, HAUL_EDGES, HAUL_HULLS, HAUL_LANES, HAUL_LOSSES, type HaulNode } from '../../lib/haulTree';
import type { TypeDogma } from '../../lib/miningYield';
import { useData } from '../../lib/store';
import { typeDogma } from '../../lib/universe';
import { ShipTree } from '../ShipTree';

/**
 * The hauling tree (ShipTree with every hull that hauls): each hull's holds at your skills (lib/cargo.ts, from ESI's
 * dogma), what a courier package can use, its bare-hull EHP, and zKillboard's record of it in high-sec. A hull can be
 * handed to the contract finder above ("Use for contracts"), and its fits open under it (`children`).
 */

/** ESI's hauling groups and the finder's hull classes, which its gank lines are kept by. */
export const CLASS_OF_GROUP: Record<number, HullClass> = { 28: 'Industrial', 1202: 'Blockade Runner', 380: 'Deep Space Transport', 941: 'Orca', 513: 'Freighter', 902: 'Jump Freighter' };


export function HaulingTree({ here, onUse, children }: {
  here: number | null;
  /** Hand a hull to the contract finder: the m³ a courier package can use, and its class for gank lines. */
  onUse: (m3: number, cls: HullClass | null, name: string) => void;
  children?: (hull: HaulNode, price: number | null, dogma: TypeDogma | null) => ReactNode;
}) {
  const d = useData();
  const [dogma, setDogma] = useState<Record<number, TypeDogma>>({});
  useEffect(() => {
    let alive = true;
    Promise.all(HAUL_HULLS.map((h) => typeDogma(h.id).catch(() => null))).then((xs) => {
      if (alive) setDogma(Object.fromEntries(xs.filter((x): x is TypeDogma => !!x).map((x) => [x.id, x])));
    });
    return () => { alive = false; };
  }, []);
  const skills = d.skills ?? {};
  return (
    <ShipTree label="Hauling ships" nodes={HAUL_HULLS} edges={HAUL_EDGES} lanes={HAUL_LANES} cols={6} rows={7} here={here} resists
      nodeTip={(h) => { const dg = dogma[h.id]; return dg ? `Couriers can use ${units(Math.round(generalSpace(holdsFor(dg, [], skills))))} m³ at your skills.` : null; }}
      pointsOf={(h) => { const dg = dogma[h.id]; return (dg && GANK_BY_CLASS[dg.group]?.points) || []; }}
      statsOf={(h) => {
        // zKillboard's record of the hull, and of its kind when ganked: research figures, with their source.
        const loss = HAUL_LOSSES[h.id], dg = dogma[h.id], gank = dg ? GANK_BY_CLASS[dg.group] : undefined;
        return [
          ...(loss ? [{ value: units(loss.lost), label: 'lost in high-sec, July to September', source: GANK_SOURCE }, { value: units(loss.ganked), label: 'of them ganked', source: `${GANK_SOURCE}: a pilot on the mail was killed by CONCORD there soon after` }] : []),
          ...(gank ? [{ value: String(gank.attackers), label: 'attackers on a gank of its kind (median)', source: GANK_SOURCE }, { value: gank.cargo, label: 'carried by the ganked (median)', source: GANK_SOURCE }] : []),
        ];
      }}
      facts={(h) => {
        const dg = dogma[h.id];
        if (!dg) return [['Holds', 'Reading…']];
        const mine = holdsFor(dg, [], skills), top = holdsFor(dg, [], CARGO_FIVE);
        const out: [string, ReactNode][] = [
          ['Holds at your skills', holdsSaid(mine)],
          ...(holdsSaid(top) !== holdsSaid(mine) ? [['With every skill at V', holdsSaid(top)] as [string, ReactNode]] : []),
          ['A courier package can use', `${units(Math.round(generalSpace(mine)))} m³ (cargo${mine.fleet ? ' and fleet hangar' : ''}), before expanders and rigs`],
          ['Bare hull', `${units(Math.round(bareEhp(dg)))} EHP against even damage, no skills or modules`],
        ];
        return out;
      }}>
      {(h, price) => {
        const dg = dogma[h.id] ?? null;
        const space = dg ? generalSpace(holdsFor(dg, [], skills)) : 0;
        return (
          <div className="col" style={{ gap: 12 }}>
            {dg && space > 0 && (
              <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn sm" onClick={() => onUse(Math.round(space), CLASS_OF_GROUP[dg.group] ?? null, h.name)}><Truck aria-hidden="true" /> Use for the contracts above</button>
                <span className="note small" style={{ margin: 0 }}>{units(Math.round(space))} m³ at your skills, the bare hull; a fit below says what its expanders make of it.</span>
              </div>
            )}
            {children?.(h, price, dg)}
          </div>
        );
      }}
    </ShipTree>
  );
}
