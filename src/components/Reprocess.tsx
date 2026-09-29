import { useEffect, useMemo, useState } from 'react';
import { Factory, FlaskConical, Recycle } from 'lucide-react';
import { esi } from '../lib/esi';
import { rates } from '../lib/fees';
import { isk, iskBig, pct, units } from '../lib/format';
import { adjustedPricesShared, jitaOrders } from '../lib/market';
import {
  IMPLANTS, METALLURGY, outputWorth, REPROCESSING, REPROCESSING_EFFICIENCY, reprocessOutput, SCRAPMETAL_PROCESSING, stationTax, yieldByLevel, yieldOf,
  type Implant, type Materials, type Site,
} from '../lib/reprocess';
import { useData } from '../lib/store';
import { toast } from '../lib/toast';
import { ItemSearch, useEnsureNames, useTypeName } from './common';
import { Empty, Guide, Notice, PageHead, Panel, Seg, Tiles } from './ui';

type Bundle = { build: number; released: string | null; types: Record<string, Materials> };
type Place = { kind: 'station' } | { kind: 'structure'; structure: 'athanor' | 'tatara' | 'other'; rig: 'none' | 't1' | 't2'; sec: 'high' | 'low' | 'null'; taxPct: number };
const PLACE_KEY = 'jita-ledger:reprocess-place';
const IMPLANT_KEY = 'jita-ledger:reprocess-implant';
const JITA_44 = 60003760;
const read = <T,>(k: string, fallback: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const keep = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* this visit only */ } };

/**
 * Reprocessing (lib/reprocess.ts): what an item breaks down into where you refine it, at your skills, what the output
 * fetches in the Jita bids after tax, and what that makes against buying the item. The user asked for it with profit by
 * skill level and by where you refine, ore included; it came out of the ZW-4100 trading at its minerals' value.
 */
export function Reprocess() {
  const d = useData();
  const name = useTypeName();
  const r = rates(d.settings);
  const skills = d.skills ?? {};
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [stationBase, setStationBase] = useState(0.5);
  const [place, setPlaceState] = useState<Place>(() => read<Place>(PLACE_KEY, { kind: 'station' }));
  const [implant, setImplantState] = useState<Implant>(() => read<Implant>(IMPLANT_KEY, 'none'));
  const setPlace = (p: Place) => { setPlaceState(p); keep(PLACE_KEY, p); };
  const setImplant = (i: Implant) => { setImplantState(i); keep(IMPLANT_KEY, i); };

  useEffect(() => {
    let live = true;
    import('../data/typeMaterials.json').then((m) => { if (live) setBundle(m.default as unknown as Bundle); }).catch(() => toast('Couldn’t load what items reprocess into.', 'err'));
    // Jita 4-4's own yield, as ESI states it (0.5); stations elsewhere run from 0.25 to 0.5.
    esi<{ reprocessing_efficiency?: number }>(`/universe/stations/${JITA_44}/`).then(({ data }) => { if (live && data.reprocessing_efficiency) setStationBase(data.reprocessing_efficiency); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const stationTaxRate = stationTax(d.settings.corp);
  const site: Site = place.kind === 'station'
    ? { kind: 'station', base: stationBase, tax: stationTaxRate }
    : { kind: 'structure', structure: place.structure, rig: place.rig, sec: place.sec, tax: Math.max(0, place.taxPct) / 100 };
  const lv = (id: number) => skills[id] ?? 0;
  const modYield = yieldOf([1, []], skills, site, implant);
  const veldspar = bundle?.types['1230'];
  const oreYield = veldspar ? yieldOf(veldspar, skills, site, implant) : null;

  return (
    <div className="page">
      <PageHead kicker="Refining" title="Reprocessing"
        lede="What an item breaks down into where you refine it, at your skills; what the minerals fetch in the Jita bids after tax; and what that makes against buying the item. By skill level and by where you refine, ore included." />

      <div className="g-440">
        <Panel title="Where you refine" sub={place.kind === 'station' ? `Jita 4-4: ${pct(stationBase, 0)} base, ${pct(stationTaxRate, 2)} tax at your ${d.settings.corp.toFixed(2)} Caldari Navy standing` : 'A player structure: its owner sets the tax'}>
          <div className="col" style={{ gap: 10 }}>
            <Seg label="Where you refine" value={place.kind} onChange={(k) => setPlace(k === 'station' ? { kind: 'station' } : { kind: 'structure', structure: 'tatara', rig: 't1', sec: 'high', taxPct: 1 })}
              options={[{ v: 'station', label: 'Jita 4-4' }, { v: 'structure', label: 'A structure' }]} />
            {place.kind === 'structure' && (
              <>
                <Seg label="Structure" size="sm" value={place.structure} onChange={(v) => setPlace({ ...place, structure: v })}
                  options={[{ v: 'tatara', label: 'Tatara', tip: '+5.5% on ore' }, { v: 'athanor', label: 'Athanor', tip: '+2% on ore' }, { v: 'other', label: 'Other' }]} />
                <Seg label="Reprocessing rig" size="sm" value={place.rig} onChange={(v) => setPlace({ ...place, rig: v })}
                  options={[{ v: 'none', label: 'No rig' }, { v: 't1', label: 'T1 rig' }, { v: 't2', label: 'T2 rig' }]} />
                <Seg label="Security" size="sm" value={place.sec} onChange={(v) => setPlace({ ...place, sec: v })}
                  options={[{ v: 'high', label: 'High-sec' }, { v: 'low', label: 'Low-sec', tip: '×1.06 on ore, with a rig' }, { v: 'null', label: 'Null-sec', tip: '×1.12 on ore, with a rig' }]} />
                <label className="row" style={{ gap: 8, alignItems: 'center', fontSize: 13 }}>
                  Its tax
                  <input className="num" type="number" min={0} max={50} step={0.1} value={place.taxPct} onChange={(e) => setPlace({ ...place, taxPct: Number(e.target.value) || 0 })} style={{ width: 80 }} />%
                </label>
              </>
            )}
            <Seg label="Reprocessing implant (ore only)" size="sm" value={implant} onChange={setImplant}
              options={(Object.keys(IMPLANTS) as Implant[]).map((k) => ({ v: k, label: k === 'none' ? 'No implant' : k.toUpperCase().replace('RX', 'RX-') }))} />
            <Tiles min={150} items={[
              { l: 'Modules, charges, ships', v: pct(modYield, 1), n: `Scrapmetal Processing ${lv(SCRAPMETAL_PROCESSING)}: 55% at V, anywhere`,
                tip: 'Only Scrapmetal Processing moves what modules, charges and ships give: rigs, structures, security and implants don’t. It needs Reprocessing Efficiency V and Metallurgy V first.' },
              { l: 'Ore (Veldspar here)', v: oreYield != null ? pct(oreYield, 1) : '…', n: `Reprocessing ${lv(REPROCESSING)} · Efficiency ${lv(REPROCESSING_EFFICIENCY)} · Simple Ore ${lv(60377)}`,
                tip: 'Ore gets base × (1 + 3% Reprocessing) × (1 + 2% Reprocessing Efficiency) × (1 + 2% its own processing skill) × (1 + implant). A structure with a reprocessing rig adds to the base, more in low and null-sec.' },
            ]} />
            {lv(SCRAPMETAL_PROCESSING) === 0 && <p className="note small" style={{ margin: 0 }}>Scrapmetal Processing needs Reprocessing Efficiency V (you have {lv(REPROCESSING_EFFICIENCY)}) and Metallurgy V (you have {lv(METALLURGY)}).</p>}
          </div>
        </Panel>
        <ItemCheck bundle={bundle} site={site} implant={implant} skills={skills} salesTax={r.t} name={name} />
      </div>

      <Guide title="How to use Reprocessing" intro="Find what's worth buying to break down, and where to break it down."
        steps={[
          { icon: Factory, title: 'Set where you refine', body: 'Jita 4-4 at your standing, or a structure: its type, rig, security and the tax its owner charges.' },
          { icon: FlaskConical, title: 'Check an item', body: 'How many, and what buying them from the listings costs; what comes out at your skills, and what it fetches in the bids after tax.' },
          { icon: Recycle, title: 'Train where it pays', body: 'The table shows the profit at each level of the skill that moves the item: Scrapmetal Processing for modules, the ore’s own skill for ore.' },
        ]} />
    </div>
  );
}

function ItemCheck({ bundle, site, implant, skills, salesTax, name }: { bundle: Bundle | null; site: Site; implant: Implant; skills: Record<number, number>; salesTax: number; name: (id: number) => string }) {
  const [item, setItem] = useState<{ id: number; name: string } | null>(null);
  const [qtyText, setQtyText] = useState('1');
  const [asks, setAsks] = useState<{ price: number; volume: number }[] | null>(null);
  const [bids, setBids] = useState<Record<number, number | null>>({});
  const [adjusted, setAdjusted] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const m = item && bundle ? bundle.types[String(item.id)] ?? null : null;
  const outputs = m ? m[1].map(([id]) => id) : [];
  // The materials, and the skill that moves its yield, by name.
  useEnsureNames([...outputs, m?.[2] ?? SCRAPMETAL_PROCESSING]);

  useEffect(() => {
    if (!item || !m) return;
    let live = true;
    setBusy(true); setAsks(null); setBids({});
    Promise.all([
      jitaOrders(item.id).then((b) => b.orders.filter((o) => !o.isBuy).map((o) => ({ price: o.price, volume: o.volume })).sort((a, c) => a.price - c.price)),
      Promise.all(m[1].map(([id]) => jitaOrders(id).then((b) => [id, Math.max(0, ...b.orders.filter((o) => o.isBuy).map((o) => o.price)) || null] as const).catch(() => [id, null] as const))),
      adjustedPricesShared().catch(() => ({} as Record<number, number>)),
    ]).then(([a, b, adj]) => { if (!live) return; setAsks(a); setBids(Object.fromEntries(b)); setAdjusted(adj); })
      .catch((e) => toast(e instanceof Error ? e.message : String(e), 'err'))
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [item?.id, m]); // eslint-disable-line react-hooks/exhaustive-deps

  const qty = Math.max(0, Math.floor(Number(qtyText.replace(/[,\s]/g, '')) || 0));
  const calc = useMemo(() => {
    if (!m || !asks) return null;
    // Buying from the listings, cheapest first, as many as asked for.
    let left = qty, cost = 0;
    for (const a of asks) { if (left <= 0) break; const take = Math.min(left, a.volume); cost += take * a.price; left -= take; }
    const y = yieldOf(m, skills, site, implant);
    const out = reprocessOutput(m, qty, y);
    const worth = outputWorth(out, (id) => bids[id], (id) => adjusted[id], site.tax, salesTax);
    const byLevel = yieldByLevel(m, skills, site, implant);
    const levels = byLevel.levels.map((ly) => { const w = outputWorth(reprocessOutput(m, qty, ly), (id) => bids[id], (id) => adjusted[id], site.tax, salesTax); return { y: ly, net: w.net, profit: w.net - cost }; });
    return { y, out, worth, cost, short: left > 0 ? left : 0, profit: worth.net - cost, levels, skill: byLevel.skill };
  }, [m, asks, bids, adjusted, qty, skills, site.kind, site.tax, implant, JSON.stringify(site)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel title="Check an item" sub="What it breaks down into here, at your skills">
      <div className="col" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <ItemSearch onFound={setItem} keep placeholder="Item name" button="Check" />
          <label className="row" style={{ gap: 6, alignItems: 'center', fontSize: 13 }}>How many
            <input className="num" value={qtyText} onChange={(e) => setQtyText(e.target.value)} style={{ width: 110 }} inputMode="numeric" />
          </label>
        </div>
        {!item ? <Empty icon={Recycle}>Look an item up to see what it gives.</Empty>
          : !bundle ? <p className="note">Loading what items reprocess into…</p>
          : !m ? <Notice kind="warn">{item.name} doesn’t reprocess into anything.</Notice>
          : !calc ? <p className="note">{busy ? 'Reading the Jita books…' : ' '}</p>
          : (
            <>
              {m[0] > 1 && <p className="note small" style={{ margin: 0 }}>It reprocesses in batches of {units(m[0])}: {units(calc.out.batches)} batch{calc.out.batches === 1 ? '' : 'es'}{calc.out.left ? `, ${units(calc.out.left)} left over` : ''}.</p>}
              <Tiles min={170} items={[
                { l: 'Buying them', v: iskBig(calc.cost), n: calc.short ? `Only ${units(qty - calc.short)} listed in Jita` : 'From the cheapest Jita listings' },
                { l: 'What comes out fetches', v: iskBig(calc.worth.gross), n: `In the bids, after ${pct(salesTax, 2)} sales tax` },
                { l: 'Reprocessing tax', v: iskBig(Math.round(calc.worth.tax)), n: `${pct(site.tax, 2)} of CCP's adjusted price` },
                { l: 'Profit', v: iskBig(Math.round(calc.profit)), c: calc.profit >= 0 ? 'var(--pos)' : 'var(--neg)', n: `At ${pct(calc.y, 1)} yield${calc.cost > 0 ? `, ${pct(calc.profit / calc.cost, 1)} on the cost` : ''}` },
              ]} />
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl compact" style={{ minWidth: 420 }}>
                  <thead><tr><th scope="col" className="l">Comes out</th><th scope="col">Units</th><th scope="col">Best Jita bid</th><th scope="col">Fetches</th></tr></thead>
                  <tbody>{calc.worth.perMaterial.map((x) => (
                    <tr key={x.id}><td className="l">{name(x.id)}</td><td>{units(x.qty)}</td><td>{x.each != null ? isk(x.each) : '–'}</td><td>{x.each != null ? iskBig(Math.round(x.value)) : 'No bid'}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl compact" style={{ minWidth: 360 }}>
                  <thead><tr><th scope="col" className="l">{name(calc.skill)}</th><th scope="col">Yield</th><th scope="col" data-tip="What the output fetches in the bids after sales tax, less the reprocessing tax">Fetches</th><th scope="col">Profit</th></tr></thead>
                  <tbody>{calc.levels.map((l, i) => (
                    <tr key={i} className={i === (skills[calc.skill] ?? 0) ? 'open' : undefined}>
                      <td className="l">{i}{i === (skills[calc.skill] ?? 0) ? ' (yours)' : ''}</td><td>{pct(l.y, 1)}</td><td>{iskBig(Math.round(l.net))}</td>
                      <td style={{ color: l.profit >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBig(Math.round(l.profit))}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {calc.worth.unpriced.length > 0 && <p className="note small" style={{ margin: 0 }}>No Jita bid for {calc.worth.unpriced.map(name).join(', ')}: counted as nothing.</p>}
              <p className="note small" style={{ margin: 0 }}>Each material is rounded down per batch, the careful reading. The tax is charged on CCP’s adjusted price, which can differ from Jita’s. The book moves: check the prices in game before buying in bulk.</p>
            </>
          )}
      </div>
    </Panel>
  );
}
