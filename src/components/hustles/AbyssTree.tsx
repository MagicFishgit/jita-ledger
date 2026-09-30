import { useState, type ReactNode } from 'react';
import { TIERS } from '../../lib/abyssal';
import { ABYSS_EDGES, ABYSS_LANES, ABYSS_SHIPS, ABYSS_TIERS, type AbyssNode } from '../../lib/abyssShips';
import { TRACKER_WEATHER, type TrackerCell } from '../../lib/abyssTracker';
import { isAbyssalSystem, netLoss } from '../../lib/combat';
import { iskBig, units } from '../../lib/format';
import { useData } from '../../lib/store';
import { ShipTree } from '../ShipTree';
import { Seg } from '../ui';
import { TrackerFitView, type FitRef, type TrackerState } from './AbyssTracker';

/**
 * The Abyssal tree (ShipTree with lib/abyssShips.ts): the ships that run the Abyss, by the tier each is first run at and
 * the line it belongs to, with the ones among Abyss Tracker's most-run fits at the tier and weather picked on the grid
 * marked. Each opens to where it's most run, your own losses in it, and its fits as a ladder (Just in, Solid, Max), each
 * read whole from Abyss Tracker with what it measured at the picked tier and weather.
 */

const ON_TREE = new Set(ABYSS_SHIPS.map((s) => s.id));

/** Where a hull is among the most-run fits: each cell its fits are on, with their runs there. */
function hullCells(cells: TrackerCell[], hull: number) {
  return cells.map((c) => ({ tier: c.tier, weather: c.weather, runs: c.fits.filter((f) => f.shipId === hull).reduce((t, f) => t + f.runs, 0) }))
    .filter((x) => x.runs > 0);
}

/** "Dark T3–T6 · Electrical T4": by weather, most runs first, tiers as ranges. */
function cellsSaid(xs: { tier: number; weather: number; runs: number }[]): string {
  const by = new Map<number, { tiers: number[]; runs: number }>();
  for (const x of xs) {
    const w = by.get(x.weather) ?? { tiers: [], runs: 0 };
    w.tiers.push(x.tier); w.runs += x.runs;
    by.set(x.weather, w);
  }
  const ranges = (ts: number[]) => {
    const s = [...ts].sort((a, b) => a - b), out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      let j = i;
      while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
      out.push(j > i ? `T${s[i]}–T${s[j]}` : `T${s[i]}`);
      i = j;
    }
    return out.join(', ');
  };
  return [...by.entries()].sort((a, b) => b[1].runs - a[1].runs).map(([w, x]) => `${TRACKER_WEATHER[w]} ${ranges(x.tiers)}`).join(' · ');
}

export function AbyssTree({ here, tracker, tier, weather }: {
  /** The ship you're in, when it's one of these. */
  here: number | null;
  tracker: TrackerState;
  /** The cell picked on the grid, in Abyss Tracker's numbering (tier 0–6, weather 0–4). */
  tier: number; weather: number;
}) {
  const d = useData();
  const cells = tracker.status === 'ok' ? tracker.cells : [];
  const cell = cells.find((c) => c.tier === tier && c.weather === weather) ?? null;
  const picked = cell ? new Set(cell.fits.map((f) => f.shipId).filter((id) => ON_TREE.has(id))) : null;
  const cellSaid = `T${tier} ${TIERS[tier]} ${TRACKER_WEATHER[weather]}`;
  // Your own ships lost in a pocket, all time, by hull.
  const lost = Object.values(d.killmails).filter((k) => k.kind === 'loss' && isAbyssalSystem(k.systemId));
  return (
    <ShipTree label="Abyssal ships" nodes={ABYSS_SHIPS} edges={ABYSS_EDGES} lanes={ABYSS_LANES} cols={7} rows={9} here={here}
      picked={picked} pickedSaid={`Among the most run at ${cellSaid}`}
      nodeTip={(h) => { const xs = hullCells(cells, h.id); return xs.length ? `On Abyss Tracker’s most-run lists: ${cellsSaid(xs)}.` : null; }}
      facts={(h) => {
        const xs = hullCells(cells, h.id);
        const mine = lost.filter((k) => k.victim.shipTypeId === h.id);
        const out: [string, ReactNode][] = [];
        if (tracker.status === 'ok' && cells.length) {
          out.push(['Among the most run', xs.length
            ? `${cellsSaid(xs)} (${units(xs.reduce((t, x) => t + x.runs, 0))} runs logged on its fits there)`
            : 'On none of Abyss Tracker’s most-run lists']);
        }
        out.push(['Your losses in it', mine.length ? `${units(mine.length)} in the Abyss, ${iskBig(mine.reduce((t, k) => t + netLoss(k), 0))} net of insurance (your killmails)` : 'None in the Abyss']);
        return out;
      }}>
      {(h) => <AbyssFits hull={h} cells={cells} tier={tier} weather={weather} />}
    </ShipTree>
  );
}

function AbyssFits({ hull, cells, tier, weather }: { hull: AbyssNode; cells: TrackerCell[]; tier: number; weather: number }) {
  const ladder = ABYSS_TIERS[hull.id] ?? [];
  const [i, setI] = useState(0);
  const k = Math.min(i, ladder.length - 1);
  const t = ladder[k];
  if (!t) return null;
  // Abyss Tracker's own figures for the fit when a cell lists it: its runs only when that cell is the one picked.
  const inPicked = cells.find((c) => c.tier === tier && c.weather === weather)?.fits.find((f) => f.id === t.id);
  const anywhere = inPicked ?? cells.flatMap((c) => c.fits).find((f) => f.id === t.id);
  const ref: FitRef = anywhere ? { ...anywhere, runs: inPicked ? anywhere.runs : undefined } : { id: t.id, name: t.name, shipId: hull.id, shipName: hull.name };
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="lbl">Fits</span>
        <Seg size="sm" label="Fit" value={k} onChange={setI} options={ladder.map((x, n) => ({ v: n, label: x.label, tip: x.name }))} />
      </div>
      <p className="note small" style={{ margin: 0 }}>
        Just in is the cheapest, easiest fit the logged runs show working; Solid is the step up; Max the most it takes. Each is a
        fit players log their runs with on Abyss Tracker, taken from its most-run lists; the figures are for the tier and
        weather picked on the grid.
      </p>
      <TrackerFitView key={t.id} fit={ref} tier={tier} weather={weather} />
    </div>
  );
}
