import { useEffect, useMemo, useState } from 'react';
import { ClipboardCopy, Factory, FlaskConical, Radar, Recycle } from 'lucide-react';
import { multibuy } from '../lib/combat';
import { esi } from '../lib/esi';
import { rates } from '../lib/fees';
import { isk, iskBig, pct, units } from '../lib/format';
import { adjustedPricesShared, jitaOrders } from '../lib/market';
import {
  IMPLANTS, METALLURGY, outputWorth, REPROCESSING, REPROCESSING_EFFICIENCY, reprocessOutput, SCRAPMETAL_PROCESSING, scanUnderValue, stationTax, yieldByLevel, yieldOf,
  type Implant, type Materials, type ScanHit, type Site,
  siteFromStructure,
} from '../lib/reprocess';
import { loadCache } from '../lib/scan';
import { getAuth, hasScope } from '../lib/auth';
import { SCOPE } from '../lib/config';
import { structureInfo, system } from '../lib/universe';
import { useData } from '../lib/store';
import { useNow } from '../lib/hooks';
import { skillStatus, trainSaid } from '../lib/skillStatus';
import { ROMAN, SkillStrip } from './SkillStrip';
import { toast } from '../lib/toast';
import { ItemSearch, useEnsureNames, useTypeName } from './common';
import { Empty, Guide, Notice, PageHead, Panel, Seg, Tiles } from './ui';
import { ScanFreshness } from './ScanFreshness';

type Bundle = { build: number; released: string | null; types: Record<string, Materials> };
type Place = { kind: 'station' } | { kind: 'structure'; structure: 'athanor' | 'tatara' | 'other'; rig: 'none' | 't1' | 't2'; sec: 'high' | 'low' | 'null'; taxPct: number; name?: string };
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
  // An item picked from the scanner, for the item check.
  const [picked, setPicked] = useState<{ id: number; name: string; qty: number; n: number } | null>(null);

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
  // The skill Veldspar names for itself (Simple Ore Processing), from the bundled data.
  const SIMPLE_ORE = veldspar?.[2] ?? 60377;

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
                {hasScope(SCOPE.search) && <FindStructure onPick={(p) => setPlace({ ...place, ...p })} picked={place.name} />}
                <Seg label="Structure" size="sm" value={place.structure} onChange={(v) => setPlace({ ...place, structure: v, name: undefined })}
                  options={[{ v: 'tatara', label: 'Tatara', tip: '+5.5% on ore' }, { v: 'athanor', label: 'Athanor', tip: '+2% on ore' }, { v: 'other', label: 'Other' }]} />
                <Seg label="Reprocessing rig" size="sm" value={place.rig} onChange={(v) => setPlace({ ...place, rig: v })}
                  options={[{ v: 'none', label: 'No rig' }, { v: 't1', label: 'T1 rig' }, { v: 't2', label: 'T2 rig' }]} />
                <Seg label="Security" size="sm" value={place.sec} onChange={(v) => setPlace({ ...place, sec: v, name: undefined })}
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
              { l: 'Ore (Veldspar here)', v: oreYield != null ? pct(oreYield, 1) : '…', n: `Reprocessing ${lv(REPROCESSING)} · Efficiency ${lv(REPROCESSING_EFFICIENCY)} · Simple Ore ${lv(SIMPLE_ORE)}`,
                tip: 'Ore gets base × (1 + 3% Reprocessing) × (1 + 2% Reprocessing Efficiency) × (1 + 2% its own processing skill) × (1 + implant). A structure with a reprocessing rig adds to the base, more in low and null-sec.' },
            ]} />
            {lv(SCRAPMETAL_PROCESSING) === 0 && <p className="note small" style={{ margin: 0 }}>Scrapmetal Processing needs Reprocessing Efficiency V (you have {lv(REPROCESSING_EFFICIENCY)}) and Metallurgy V (you have {lv(METALLURGY)}).</p>}
            <SkillStrip lines={[
              { name: 'Scrapmetal Processing', id: SCRAPMETAL_PROCESSING, what: 'Modules, charges and ships: +2% a level, anywhere.',
                next: (l) => `${pct(modYield, 1)} → ${pct(yieldOf([1, []], { ...skills, [SCRAPMETAL_PROCESSING]: l }, site, implant), 1)}` },
              { name: 'Reprocessing', id: REPROCESSING, what: 'Ore: +3% a level.',
                next: (l) => (veldspar && oreYield != null ? `Veldspar ${pct(oreYield, 1)} → ${pct(yieldOf(veldspar, { ...skills, [REPROCESSING]: l }, site, implant), 1)}` : null) },
              { name: 'Reprocessing Efficiency', id: REPROCESSING_EFFICIENCY, what: 'Ore: +2% a level. V is needed for Scrapmetal Processing.',
                next: (l) => (veldspar && oreYield != null ? `Veldspar ${pct(oreYield, 1)} → ${pct(yieldOf(veldspar, { ...skills, [REPROCESSING_EFFICIENCY]: l }, site, implant), 1)}` : null) },
              { name: 'Simple Ore Processing', id: SIMPLE_ORE, what: 'The ores that name it, Veldspar among them: +2% a level. Each ore family has its own.',
                next: (l) => (veldspar && oreYield != null ? `Veldspar ${pct(oreYield, 1)} → ${pct(yieldOf(veldspar, { ...skills, [SIMPLE_ORE]: l }, site, implant), 1)}` : null) },
              ...(lv(SCRAPMETAL_PROCESSING) === 0 ? [{ name: 'Metallurgy', id: METALLURGY, what: 'V is needed for Scrapmetal Processing.' }] : []),
            ]} />
          </div>
        </Panel>
        <ItemCheck bundle={bundle} site={site} implant={implant} skills={skills} salesTax={r.t} name={name} picked={picked} />
      </div>

      <Scanner bundle={bundle} site={site} implant={implant} skills={skills} salesTax={r.t} name={name} onPick={setPicked} />

      <Guide title="How to use Reprocessing" intro="Find what's worth buying to break down, and where to break it down."
        steps={[
          { icon: Factory, title: 'Set where you refine', body: 'Jita 4-4 at your standing, or a structure: its type, rig, security and the tax its owner charges.' },
          { icon: FlaskConical, title: 'Check an item', body: 'How many, and what buying them from the listings costs; what comes out at your skills, and what it fetches in the bids after tax.' },
          { icon: Recycle, title: 'Train where it pays', body: 'The table shows the profit at each level of the skill that moves the item: Scrapmetal Processing for modules, the ore’s own skill for ore.' },
        ]} />
    </div>
  );
}

function ItemCheck({ bundle, site, implant, skills, salesTax, name, picked }: { bundle: Bundle | null; site: Site; implant: Implant; skills: Record<number, number>; salesTax: number; name: (id: number) => string; picked: { id: number; name: string; qty: number; n: number } | null }) {
  const [item, setItem] = useState<{ id: number; name: string } | null>(null);
  const [qtyText, setQtyText] = useState('1');
  useEffect(() => { if (picked) { setItem({ id: picked.id, name: picked.name }); setQtyText(String(Math.max(1, picked.qty))); } }, [picked?.n]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Where the skill that moves this item stands in your training, for the by-level table.
  const d = useData();
  const now = useNow(60_000);
  const moving = skillStatus(calc?.skill ?? null, calc ? skills[calc.skill] ?? 0 : 0, d.meta.skillQueue, now);

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
                    <tr key={i} className={i === moving.have ? 'open' : undefined}>
                      <td className="l">{ROMAN[i]}{i === moving.have ? ' (yours)' : moving.training?.level === i ? ` (training, ${trainSaid(moving.training.finish - now)} left)` : moving.queued.some((q) => q.level === i) ? ' (queued)' : ''}</td><td>{pct(l.y, 1)}</td><td>{iskBig(Math.round(l.net))}</td>
                      <td style={{ color: l.profit >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBig(Math.round(l.profit))}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {(() => {
                // Whole batches only: what's left under a batch doesn't reprocess. Multibuy buys from the cheapest
                // sellers in the system you're in, which is what "Buying them" priced.
                const buy = Math.floor((qty - calc.short) / m[0]) * m[0];
                return (
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" className="btn" disabled={buy <= 0} onClick={() => void copyMultibuy(multibuy([{ name: item.name, qty: buy }]), 1)}>
                      <ClipboardCopy aria-hidden="true" />Copy {units(buy)} for Multibuy
                    </button>
                    <span className="note small" style={{ margin: 0 }}>In Jita: the Multibuy window, Import from clipboard, then Buy. It buys from the cheapest sellers in your system, as priced here.</span>
                  </div>
                );
              })()}
              {calc.worth.unpriced.length > 0 && <p className="note small" style={{ margin: 0 }}>No Jita bid for {calc.worth.unpriced.map(name).join(', ')}: counted as nothing.</p>}
              <p className="note small" style={{ margin: 0 }}>Each material is rounded down per batch, the careful reading. The tax is charged on CCP’s adjusted price, which can differ from Jita’s. The book moves: check the prices in game before buying in bulk.</p>
            </>
          )}
      </div>
    </Panel>
  );
}

/** Puts a Multibuy list on the clipboard ("Name xN" per line, as the game's own Multibuy export writes it). */
async function copyMultibuy(block: string, lines: number): Promise<void> {
  if (!block) return;
  try { await navigator.clipboard.writeText(block); toast(`Copied ${units(lines)} line${lines === 1 ? '' : 's'} for Multibuy: Import from clipboard in the Multibuy window.`); }
  catch { toast('Your browser wouldn’t let the page copy.', 'err'); }
}

/**
 * Find the structure you refine at by name (esi-search.search_structures.v1): ESI searches the structures you can see,
 * and each found one's type and system say whether it's an Athanor or a Tatara and its security band (siteFromStructure).
 * Its rig and tax aren't in ESI, so they stay yours to set.
 */
function FindStructure({ onPick, picked }: { onPick: (p: { structure: 'athanor' | 'tatara' | 'other'; sec: 'high' | 'low' | 'null'; name: string }) => void; picked?: string }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: number; name: string; system: string; security: number | null; typeId?: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const find = async () => {
    const a = getAuth();
    if (!a || q.trim().length < 3) { toast('Type at least three letters of its name.', 'warn'); return; }
    setBusy(true);
    try {
      const { data } = await esi<{ structure?: number[] }>(`/characters/${a.characterId}/search/`, { auth: true, query: { categories: 'structure', search: q.trim(), strict: 'false' } });
      const out: { id: number; name: string; system: string; security: number | null; typeId?: number }[] = [];
      for (const id of (data.structure ?? []).slice(0, 15)) {
        const s = await structureInfo(id);
        if (s.status !== 'found') continue;
        const sys = await system(s.systemId).catch(() => null);
        out.push({ id, name: s.name, system: sys?.name ?? '', security: sys?.security ?? null, typeId: s.typeId });
      }
      setFound(out);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
    finally { setBusy(false); }
  };
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="num" placeholder="Find it by name" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void find(); }} style={{ width: 220, maxWidth: '100%' }} aria-label="Find a structure by name" />
        <button type="button" className="btn sm" disabled={busy} onClick={() => void find()}>{busy ? 'Searching…' : 'Find'}</button>
        {picked && <span className="note small" style={{ margin: 0 }}>At {picked}</span>}
      </div>
      {found && (found.length ? (
        <div className="col" style={{ gap: 2 }}>
          {found.map((f) => {
            const s = siteFromStructure(f.typeId, f.security);
            return (
              <button key={f.id} type="button" className="link-btn" style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                onClick={() => { onPick({ ...s, name: f.name }); setFound(null); setQ(''); }}>
                {f.name} <span className="faint">· {f.system}{f.security != null ? ` ${f.security.toFixed(1)}` : ''} · {s.structure === 'other' ? 'not a refinery' : s.structure === 'tatara' ? 'Tatara' : 'Athanor'}</span>
              </button>
            );
          })}
        </div>
      ) : <p className="note small" style={{ margin: 0 }}>No structure you can see by that name.</p>)}
    </div>
  );
}

/**
 * Items listed under what their output fetches (lib/reprocess.ts scanUnderValue), from the books the cloud's daily full
 * scan left in this browser: every one of the 7,760 items that reprocess, at your yield here and at the best the skill
 * that moves it gives. Leads, not orders: the books are up to a day old.
 */
function Scanner({ bundle, site, implant, skills, salesTax, name, onPick }: {
  bundle: Bundle | null; site: Site; implant: Implant; skills: Record<number, number>; salesTax: number; name: (id: number) => string;
  onPick: (p: { id: number; name: string; qty: number; n: number }) => void;
}) {
  const [hits, setHits] = useState<ScanHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [books, setBooks] = useState(0);
  useEnsureNames((hits ?? []).slice(0, 60).map((h) => h.typeId));
  const run = async () => {
    if (!bundle) return;
    setBusy(true);
    try {
      const [cache, adj] = await Promise.all([loadCache(), adjustedPricesShared().catch(() => ({} as Record<number, number>))]);
      setBooks(Object.keys(cache.books).length);
      setHits(scanUnderValue(bundle.types, cache.books, skills, site, implant, salesTax, (id) => adj[id], 100_000));
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); }
    finally { setBusy(false); }
  };
  return (
    <Panel title="Listed under what it breaks down into" sub="Every item that reprocesses, against the Jita books from your last full scan">
      <div className="col" style={{ gap: 10 }}>
        <ScanFreshness what="these finds" compact />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn primary" disabled={busy || !bundle} onClick={() => void run()}><Radar aria-hidden="true" />{busy ? 'Scanning…' : hits ? 'Scan again' : 'Scan the market'}</button>
          {hits && hits.some((h) => h.profit > 0 && h.units > 0) && (
            <button type="button" className="btn" data-tip="Every find that pays at your yield here, each with the units listed under its value, as Multibuy imports them. Check them against the live book first: the scan is up to a day old."
              onClick={() => { const pay = hits.filter((h) => h.profit > 0 && h.units > 0); void copyMultibuy(multibuy(pay.map((h) => ({ name: name(h.typeId), qty: h.units }))), pay.length); }}>
              <ClipboardCopy aria-hidden="true" />Copy the ones that pay for Multibuy
            </button>
          )}
          {hits && <span className="note small" style={{ margin: 0 }}>{units(books)} books read; {units(hits.filter((h) => h.profit > 0).length)} pay at your yield here, {units(hits.filter((h) => h.profit <= 0).length)} more only at a better one. 100,000 ISK or more each.</span>}
        </div>
        {hits && (hits.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl compact" style={{ minWidth: 720 }}>
              <thead><tr>
                <th scope="col" className="l">Item</th><th scope="col">Cheapest listing</th>
                <th scope="col" data-tip="What one unit's output fetches in the Jita bids after sales tax, less the reprocessing tax, at your yield here">A unit breaks into</th>
                <th scope="col">Listed under it</th><th scope="col">Makes now</th>
                <th scope="col" data-tip="If the skill that moves it (Scrapmetal Processing, or the ore's own) were at V">At the best yield</th>
              </tr></thead>
              <tbody>{hits.slice(0, 60).map((h) => (
                <tr key={h.typeId} className="hover">
                  <td className="l"><button type="button" className="name-btn" data-tip="Check it above, with the units listed under its value"
                    onClick={() => onPick({ id: h.typeId, name: name(h.typeId), qty: h.units || 1, n: Date.now() })}>{name(h.typeId)}</button></td>
                  <td>{isk(h.ask)}</td><td>{isk(Math.round(h.value))}</td><td>{units(h.units)}</td>
                  <td style={{ color: h.profit > 0 ? 'var(--pos)' : 'var(--cell)' }}>{h.profit > 0 ? iskBig(Math.round(h.profit)) : '–'}</td>
                  <td style={{ color: 'var(--acc2)' }}>{iskBig(Math.round(h.profitBest))}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="note">Nothing is listed under what it breaks down into, by 100,000 ISK or more, in this scan.</p>)}
        <p className="note small" style={{ margin: 0 }}>Leads, not orders: the books are from the last full scan (up to a day old) and those listings may be gone. Check an item above against the live book before buying. The minerals are priced at the Jita bids in the same scan.</p>
      </div>
    </Panel>
  );
}
