import { useMemo, useState } from 'react';
import { ExternalLink, Truck } from 'lucide-react';
import { CARGO_FIVE, generalSpace, HOLD_SAID, holdsFor, structureFor, type HoldKey, type Holds } from '../../lib/cargo';
import type { HullClass } from '../../lib/courier';
import { iskBig, units } from '../../lib/format';
import { HAUL_FITS } from '../../lib/haulFits';
import type { HaulNode } from '../../lib/haulTree';
import type { TypeDogma } from '../../lib/miningYield';
import { useData } from '../../lib/store';
import { fitCosts, FitActions, FitGrid, FitSkills, useFitData } from '../FitParts';
import { Seg } from '../ui';
import { CLASS_OF_GROUP } from './HaulingTree';

/**
 * A hauling hull's fits (lib/haulFits.ts), picked by what they're for: each one's holds worked out from ESI's dogma with
 * its expanders, rigs and bulkheads at your skills (lib/cargo.ts), EVE Workbench's EHP for it, and what EVE University's
 * rule of thumb lets it carry (cargo plus fitted modules under about 3,000 ISK per EHP, "Hauling", revised 16 July 2026).
 */

const RULE_ISK_PER_EHP = 3000;
const holdsSaid = (h: Holds) => (Object.entries(h) as [HoldKey, number][]).filter(([, v]) => v > 0).map(([k, v]) => `${HOLD_SAID[k].replace(/ hold$/, '')} ${units(Math.round(v))} m³`).join(' · ');

export function HaulFits({ hull, price, dogma, onUse }: {
  hull: HaulNode; price: number | null; dogma: TypeDogma | null;
  onUse: (m3: number, cls: HullClass | null, name: string) => void;
}) {
  const fits = HAUL_FITS[hull.id] ?? [];
  const [i, setI] = useState(0);
  const fit = fits[Math.min(i, fits.length - 1)];
  if (!fit) return <p className="note small" style={{ margin: 0 }}>No public fit for this hull worth showing: EVE Workbench has almost none.</p>;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="lbl">Fits</span>
        <Seg size="sm" label="Fit" value={Math.min(i, fits.length - 1)} onChange={setI} options={fits.map((f, k) => ({ v: k, label: f.purpose }))} />
      </div>
      <HaulFitView key={`${hull.id}:${i}`} hull={hull} fit={fit} price={price} dogma={dogma} onUse={onUse} />
    </div>
  );
}

function HaulFitView({ hull, fit, price, dogma, onUse }: {
  hull: HaulNode; fit: (typeof HAUL_FITS)[number][number]; price: number | null; dogma: TypeDogma | null;
  onUse: (m3: number, cls: HullClass | null, name: string) => void;
}) {
  const d = useData();
  const data = useFitData(hull.id, fit, null);
  const { total, fitCost } = fitCosts(fit, null, data, price);
  // Every fitted module and rig's dogma, one entry a unit, for the cargo engine.
  const modules = useMemo(() => (data ? [...fit.high, ...fit.mid, ...fit.low, ...fit.rigs]
    .flatMap((x) => Array.from({ length: x.qty ?? 1 }, () => data.dogma[data.ids[x.name]])).filter(Boolean) : []), [data, fit]);
  const mine = dogma && data ? holdsFor(dogma, modules, d.skills ?? {}) : null;
  const top = dogma && data ? holdsFor(dogma, modules, CARGO_FIVE) : null;
  const space = mine ? generalSpace(mine) : null;
  const rule = fit.ehpK != null ? fit.ehpK * 1000 * RULE_ISK_PER_EHP : null;
  const modulesValue = fitCost;
  return (
    <section className="col" style={{ gap: 12 }}>
      <p className="note small" style={{ margin: 0 }}>{fit.what}</p>
      <div className="kv-mini" style={{ maxWidth: 640 }}>
        <span>Holds at your skills</span><b>{mine ? holdsSaid(mine) : '…'}</b>
        {mine && top && holdsSaid(top) !== holdsSaid(mine) && <><span>With every skill at V</span><b>{holdsSaid(top)}</b></>}
        {space != null && <><span>A courier package can use</span><b>{units(Math.round(space))} m³</b></>}
        {dogma && data && <><span>Structure</span><b>{units(Math.round(structureFor(dogma, modules)))} hit points, before skills</b></>}
        <span data-tip="EVE Workbench’s own figure, at its own skill and implant assumptions (the API doesn’t say which).">EHP</span>
        <b>{fit.ehpK != null ? `${units(Math.round(fit.ehpK * 1000))} (EVE Workbench)` : 'Not worked out by EVE Workbench (an older fit)'}</b>
        {rule != null && <><span data-tip="EVE University, “Hauling” (revised 16 July 2026): keep the cargo plus the fitted modules (not the rigs) under about 3,000 ISK per EHP; 4–6 M per 1k EHP if you know your route and don’t autopilot. A guide, not a guarantee: zKillboard shows empty freighters ganked in Uedama.">Carry under about</span>
          <b>{iskBig(Math.max(0, rule - (modulesValue ?? 0)))} of cargo, by EVE University’s rule of thumb</b></>}
        <span>Costs</span><b>{total != null ? `${iskBig(total)} (hull ${iskBig(price!)}, fit ${iskBig(fitCost!)})` : data ? '–' : '…'}</b>
      </div>
      {space != null && space > 0 && (
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn sm" onClick={() => onUse(Math.round(space), dogma ? CLASS_OF_GROUP[dogma.group] ?? null : null, `${hull.name} (${fit.purpose})`)}><Truck aria-hidden="true" /> Use this fit for the contracts above</button>
        </div>
      )}
      <FitGrid fit={fit} crystal={null} data={data} />
      <FitActions hullId={hull.id} hullName={hull.name} label={`Jita Ledger ${fit.purpose}`.slice(0, 40)} fit={fit} crystal={null} data={data} total={total} />
      <FitSkills data={data} />
      <p className="note small" style={{ margin: 0, color: 'var(--faint)' }}>
        Fit: <a href={fit.url} target="_blank" rel="noopener noreferrer">{fit.source} <ExternalLink aria-hidden="true" style={{ width: 11, height: 11, verticalAlign: '-1px' }} /></a>; game version “{fit.version}”. Holds are the app’s, from ESI’s figures for the hull and these modules.
      </p>
    </section>
  );
}
