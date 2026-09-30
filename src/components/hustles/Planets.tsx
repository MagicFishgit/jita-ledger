import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, ExternalLink, Factory, Globe, Landmark, ListOrdered, Lock, MapPin, Package, Pickaxe, Scale, Search } from 'lucide-react';
import {
  ADVANCED_FACTORY, BASIC_FACTORY, estimate, exportTax, HIGHSEC, HIGHSEC_NPC_TAX, inBand, MADE_PER_HOUR,
  P0_PER_P1, P0_TO_P1, P1_PER_P2, P1_TO_P0, PI_BASE, PI_LINKS, PLANET_RESOURCES, PLANET_SORTS, PLANET_TYPES,
  rankProducts, RAW_PER_HOUR, refineVerdict, SECURITY_NOTE, setupSteps, sortSystems,
  type Band, type PiPlanet, type PlanetSort, type PlanetType, type ProductPick,
} from '../../lib/pi';
import { rates } from '../../lib/fees';
import { iskBig, isk, pct, units } from '../../lib/format';
import { jitaBook, resolveIds } from '../../lib/market';
import { marketBest } from '../../lib/relist';
import { JITA_SYSTEM, NEAR_JITA, scanPlanets, secureJumps } from '../../lib/universe';
import { update, useData } from '../../lib/store';
import { toast } from '../../lib/toast';
import { PI_SKILLS } from '../../lib/skills';
import { cssVars, NumChip, Seg, Th, Tip } from '../ui';
import { Points } from '../Facts';
import { SkillPanel, useSkillIds } from './SkillPanel';
import { Colonies } from './Colonies';
import { ColonyDiagram } from './PiDiagram';

const ALL_P1 = Object.keys(P1_TO_P0).sort();

function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <section className="step-card" aria-label={`Step ${n}: ${title}`}>
      <span className="hexn" aria-hidden="true">{done ? '✓' : n}</span>
      <div className="st">{title}</div>
      {children}
    </section>
  );
}

function Locked({ children }: { children: ReactNode }) {
  return <div className="locked"><Lock aria-hidden="true" />{children}</div>;
}

type SysRow = { name: string; security: number; systemId: number; types: Map<PlanetType, number>; jumps?: number | null };

export function Planets() {
  const d = useData();
  const r = rates(d.settings);
  const [band, setBand] = useState<Band>('high');
  const [region, setRegion] = useState(NEAR_JITA[0].id);
  const [product, setProduct] = useState<string | null>(null);
  const [picks, setPicks] = useState<ProductPick[] | null>(null);
  const [pricing, setPricing] = useState(false);
  const [planets, setPlanets] = useState<PiPlanet[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState<number | null>(1000);
  const [count, setCount] = useState<number | null>(4);
  const [countTouched, setCountTouched] = useState(false);
  const [jumps, setJumps] = useState<Record<number, number | null>>({});
  const [order, setOrder] = useState<PlanetSort>('yield');
  const [chosenSys, setChosenSys] = useState<number | null>(null);

  // Interplanetary Consolidation is exactly "one planet, plus one per level", so the field starts at
  // what you can actually run. Resolved by name, like every other skill here. Typing over it wins.
  const ids = useSkillIds(['Interplanetary Consolidation']);
  const consolidation = ids['Interplanetary Consolidation'] ? d.skills?.[ids['Interplanetary Consolidation']] : undefined;
  const canRun = consolidation == null ? null : 1 + consolidation;
  useEffect(() => { if (!countTouched && canRun != null) setCount(canRun); }, [canRun, countTouched]);

  /** Every refined product and its raw input, priced against the live book in one pass. */
  const priceAll = useCallback(async () => {
    setPricing(true);
    try {
      const names = [...new Set([...ALL_P1, ...Object.keys(P0_TO_P1)])];
      const found = (await resolveIds(names)).inventory_types ?? [];
      const idOf = new Map(found.map((t) => [t.name, t.id]));
      const price = new Map<string, number>();
      await Promise.all(names.map(async (n) => {
        const id = idOf.get(n);
        if (!id) return;
        try {
          const book = await jitaBook(id);
          const p = marketBest(book.topBuys, true) ?? marketBest(book.topSells, false);
          if (p != null) price.set(n, p);
        } catch { /* left unpriced */ }
      }));
      const ranked = rankProducts((n) => price.get(n) ?? null, r.t, r.f);
      setPicks(ranked);
      setProduct((cur) => cur ?? ranked[0]?.p1 ?? null);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setPricing(false);
    }
  }, [r.t, r.f]);

  const chosen = picks?.find((p) => p.p1 === product) ?? null;
  const p0 = product ? P1_TO_P0[product] : '';
  const wanted = useMemo(() => chosen?.planets ?? [], [chosen]);
  const verdict = refineVerdict(chosen?.uplift ?? 0);
  const refine = verdict.worth;

  const scan = useCallback(async () => {
    setBusy(true); setProgress({ done: 0, total: 0 }); setChosenSys(null);
    try {
      setPlanets(await scanPlanets(region, (sec) => inBand(sec, band), (done, total) => setProgress({ done, total })));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(false); setProgress(null);
    }
  }, [region, band]);

  const bySystem = useMemo(() => {
    const m = new Map<number, SysRow>();
    for (const p of (planets ?? []).filter((x) => wanted.includes(x.type))) {
      const e = m.get(p.systemId) ?? { name: p.systemName, security: p.security, systemId: p.systemId, types: new Map() };
      e.types.set(p.type, (e.types.get(p.type) ?? 0) + 1);
      m.set(p.systemId, e);
    }
    return [...m.values()];
  }, [planets, wanted]);

  // How far each candidate is from home: the output has to be carried to Jita to be sold.
  useEffect(() => {
    const need = bySystem.map((e) => e.systemId).filter((id) => !(id in jumps)).slice(0, 40);
    if (!need.length) return;
    let alive = true;
    (async () => {
      for (const id of need) {
        const j = await secureJumps(JITA_SYSTEM, id).catch(() => null);
        if (!alive) return;
        setJumps((cur) => ({ ...cur, [id]: j }));
      }
    })();
    return () => { alive = false; };
  }, [bySystem, jumps]);

  const ordered = useMemo(() => sortSystems(bySystem.map((e) => ({ ...e, jumps: jumps[e.systemId] })), order), [bySystem, jumps, order]);
  const sys = ordered.find((x) => x.systemId === chosenSys) ?? null;
  const matchingCount = bySystem.reduce((t, e) => t + [...e.types.values()].reduce((a, b) => a + b, 0), 0);

  const est = estimate(rate ?? 0, count ?? 0, chosen?.p0Price ?? null, chosen?.p1Price ?? null, r.t, r.f);
  const steps = useMemo(() => (product ? setupSteps(product, refine) : []), [product, refine]);

  // Customs office tax, once a system says which kind of office you will be exporting through.
  // High-sec offices carry the NPC tax at least; a low-sec office charges what its owner set.
  const highsec = sys ? sys.security >= HIGHSEC : band === 'high';
  const taxRate = d.prefs.piTax ?? (highsec ? HIGHSEC_NPC_TAX : null);
  const monthlyTax = taxRate == null ? null : refine
    ? exportTax(est.madePerDay * 30, PI_BASE.refined, taxRate)
    : exportTax(est.rawPerDay * 30, PI_BASE.raw, taxRate);
  const best = Math.max(est.rawValue, est.madeValue);
  const fit = sys ? [...sys.types.values()].reduce((a, b) => a + b, 0) : 0;
  const colonies = count ?? 0;

  return (
    <>
      <Colonies />

      <div className="col" style={{ gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--body-2)', maxWidth: '72ch' }}>Planets earn while you do nothing else: the right companion to a wall of market orders. Work down the steps:</p>
        <div className="ladder" aria-label="The steps">
          {['1 What to make', '2 Where to make it', '3 What it comes to', '4 How to build it'].map((x, i) => (
            <span key={x} className="step">{i > 0 && <ArrowRight aria-hidden="true" />}<span>{x}</span></span>
          ))}
        </div>
      </div>

      <Step n={1} title="Pick what to make" done={!!product}>
        <div style={{ margin: '0 0 12px' }}>
          <Points compact items={[
            { kind: 'info', icon: Scale, lead: 'Same cost', text: `every refined product takes ${P0_PER_P1} units of raw a unit.` },
            { kind: 'tip', lead: 'The best', text: 'is the one worth most once refined, unless the raw sells for more: for several products it does.' },
            { kind: 'info', icon: ListOrdered, lead: 'Ranked', text: 'on what 1,000 units of extraction turn into, net of your fees.' },
          ]} />
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <button type="button" className="btn primary tall" disabled={pricing} onClick={priceAll}><Search aria-hidden="true" />{pricing ? 'Pricing all 15…' : picks ? 'Price again' : 'Find the best product'}</button>
          {picks && product && <span style={{ fontSize: 13, color: '#9fb3c5' }}>Making <b style={{ color: 'var(--ink)' }}>{product}</b> from <b style={{ color: 'var(--ink)' }}>{p0}</b></span>}
        </div>
        {!picks ? (
          <div className="dashed-empty"><p>Nothing priced yet. This reads the live Jita book for all 15 refined products and all 15 raw materials, ranks them, and picks the best for you. A few seconds.</p></div>
        ) : (
          <div className="tbl-scroll" style={{ maxHeight: 380, border: '1px solid var(--line-3)' }}>
            <table className="tbl compact" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <Th left>Make</Th><Th left>From</Th>
                  <Th tip={`What 1,000 units of extraction is worth once refined and sold, after broker fee and sales tax.\n\n• Every product takes the same ${P0_PER_P1} raw units each, so this is the fair way to compare them.`}>Per 1,000 raw</Th>
                  <Th>Or sold raw</Th>
                  <Th tip="Refined value divided by raw value. Below 1 the factories lose you money and the raw should go straight out of the launchpad.">Refining gains</Th>
                  <Th left>Planets</Th><th scope="col" style={{ color: 'var(--faint-2)' }}>Pick</th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => {
                  const v = refineVerdict(p.uplift);
                  const on = p.p1 === product;
                  return (
                    <tr key={p.p1} className={on ? 'chosen' : 'hover'}>
                      <td className="l"><span className="name" style={{ display: 'block', fontWeight: 400 }}>{p.p1}</span><span className="sub mono">{p.p1Price ? isk(p.p1Price) : 'not priced'}</span></td>
                      <td className="l"><span className="txt" style={{ display: 'block', color: 'var(--cell)', fontSize: 13 }}>{p.p0}</span><span className="sub mono">{p.p0Price ? isk(p.p0Price) : 'not priced'}</span></td>
                      <td className="pos">{iskBig(p.refinedPer1000Raw)}</td>
                      <td>{iskBig(p.rawPer1000Raw)}</td>
                      <td><span style={{ color: v.worth ? 'var(--pos)' : 'var(--neg)' }}>{p.uplift > 0 ? `${p.uplift.toFixed(2)}×` : '–'}</span><span className="sub">{v.short}</span></td>
                      <td className="l"><span className="row tight">{p.planets.map((t) => <span key={t} className="pill-tag">{t}</span>)}</span></td>
                      <td><button type="button" className="pick-btn" aria-pressed={on} onClick={() => setProduct(p.p1)}>{on ? 'Chosen' : 'Choose'}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Step>

      <Step n={2} title="Find planets that can extract it" done={!!planets && bySystem.length > 0}>
        {!product ? <Locked>Pick a product first and this will know what to look for.</Locked> : (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--label)' }}>{product} is refined from <b style={{ color: 'var(--figure)' }}>{p0}</b>, which comes off <b style={{ color: 'var(--figure)' }}>{wanted.join(', ')}</b> planets.</p>
            <div className="row wide" style={{ marginBottom: 12 }}>
              <Seg label="Security band" value={band} onChange={(b) => { setBand(b); setChosenSys(null); }} size="md" options={[{ v: 'high' as Band, label: 'High-sec' }, { v: 'low' as Band, label: 'Low-sec' }]} />
              <span className="note small">{band === 'high' ? 'Safe to set up and safe to collect from. Pays less, and the tax is why.' : 'Richer planets and often a cheaper customs office, at the cost of watching local.'}</span>
            </div>
            <div className="field" style={{ gap: 5 }}>
              <label htmlFor="pi-region">Region to search</label>
              <div className="row wide">
                <select id="pi-region" value={region} onChange={(e) => setRegion(Number(e.target.value))} style={{ width: 260 }}>
                  {NEAR_JITA.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button type="button" className="btn primary tall" disabled={busy} onClick={scan}><Globe aria-hidden="true" />{busy ? 'Scanning…' : planets ? 'Scan again' : 'Find planets'}</button>
                <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>Planet types never change, so a region is scanned once and kept</span>
              </div>
            </div>
            {progress && progress.total > 0 && (
              <div className="busy" style={{ marginTop: 12, padding: '10px 14px' }}>
                <div className="grow">
                  <div className="row" style={{ justifyContent: 'space-between' }}><span className="busy-t" style={{ fontSize: 12 }}>Reading the region</span><span className="busy-n"><b>{units(progress.done)}</b> of {units(progress.total)}</span></div>
                  <div className="busy-bar"><div style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                </div>
              </div>
            )}
            {planets && (
              <div className="col" style={{ gap: 10, marginTop: 12, animation: 'rise .35s' }}>
                <p style={{ fontSize: 12.5, color: 'var(--label)' }}>
                  {units(matchingCount)} planets across {units(bySystem.length)} systems can extract {p0}, in the {band === 'high' ? 'high-sec' : 'low-sec'} part of {NEAR_JITA.find((x) => x.id === region)?.name}. Choose one to cost it in step 3.
                </p>
                <div className="row wide">
                  <Seg label="How to order the systems" value={order} onChange={setOrder} size="md" options={PLANET_SORTS.map((o) => ({ v: o.key, label: o.label, tip: o.hint }))} />
                  <span className="note small">{PLANET_SORTS.find((o) => o.key === order)?.hint}</span>
                </div>
                {!bySystem.length ? (
                  <div className="dashed-empty"><p>No {wanted.join(' or ')} planets in the {band === 'high' ? 'high-sec' : 'low-sec'} part of this region. Try another region, or a product from a commoner planet type.</p></div>
                ) : (
                  <div className="tbl-scroll" style={{ maxHeight: 300, border: '1px solid var(--line-3)' }}>
                    <table className="tbl compact">
                      <thead>
                        <tr>
                          <Th left>System</Th><Th tip={SECURITY_NOTE}>Security</Th>
                          <Th tip="Jumps on a high-sec-only route. The output has to come home to be sold, so a rich planet fifteen jumps out is worse than a fair one next door.">From Jita</Th>
                          <Th left>Planets you could use</Th><th scope="col" style={{ color: 'var(--faint-2)' }}>Pick</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordered.slice(0, 80).map((e) => {
                          const on = chosenSys === e.systemId;
                          return (
                            <tr key={e.systemId} className={on ? 'chosen click' : 'click'} onClick={() => setChosenSys(on ? null : e.systemId)}>
                              <td className="l name" style={{ fontWeight: 400 }}>{e.name}</td>
                              <td style={{ color: e.security <= 0.6 ? 'var(--pos)' : 'var(--cell)' }} data-tip={e.security <= 0.6 ? 'Lower security, so richer planets' : undefined}>{e.security.toFixed(1)}</td>
                              <td style={{ color: e.jumps == null ? (e.jumps === null ? 'var(--neg)' : 'var(--faint)') : e.jumps <= 10 ? 'var(--pos)' : 'var(--cell)' }}>
                                {e.jumps === undefined ? '…' : e.jumps === null ? 'not in high-sec' : `${e.jumps} jumps`}
                              </td>
                              <td className="l txt" style={{ color: 'var(--cell)', fontSize: 13 }}>{[...e.types.entries()].map(([t, n]) => `${n}× ${t}`).join(', ')}</td>
                              <td><button type="button" className="pick-btn" aria-pressed={on} onClick={(ev) => { ev.stopPropagation(); setChosenSys(on ? null : e.systemId); }}>{on ? 'Chosen' : 'Choose'}</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Step>

      <Step n={3} title="See what it would bring in" done={!!chosen}>
        {!chosen ? <Locked>Pick a product first.</Locked> : (
          <>
            <div className="row" style={{ marginBottom: 14 }}>
              <NumChip id="pi-rate" label="Units / hour / planet" width={80} decimals={0} value={rate} onChange={setRate} tip="What the extractor tells you as you drag its heads out" />
              <NumChip id="pi-count" label="Planets" width={48} decimals={0} value={count} onChange={(n) => { setCountTouched(true); setCount(n); }}
                tip={canRun != null ? `Your Interplanetary Consolidation ${consolidation} lets you run ${canRun}` : 'One, plus one per level of Interplanetary Consolidation'} />
            </div>
            <div className="chain" style={{ marginBottom: 14 }} aria-label={refine ? `Extractor pulling ${p0}, then a factory making ${product}, then a launchpad` : `Extractor pulling ${p0} straight to a launchpad`}>
              {(refine
                ? [[Pickaxe, 'Extractor', p0], [Factory, 'Basic Industry Facility', `${BASIC_FACTORY.rawPerCycle.toLocaleString()} → ${BASIC_FACTORY.madePerCycle} every ${BASIC_FACTORY.cycleMinutes} min`], [Package, 'Launchpad', product!]]
                : [[Pickaxe, 'Extractor', p0], [Package, 'Launchpad', `${p0}, sold raw`]]
              ).map(([Icon, l, v], i, arr) => (
                <div key={l as string} style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="chain-node" style={{ background: 'color-mix(in oklab,var(--acc) 8%,rgba(2,7,12,.7))', borderColor: 'color-mix(in oklab,var(--acc) 40%,transparent)', clipPath: 'var(--cut-10)' }}>
                    {(() => { const I = Icon as typeof Pickaxe; return <I aria-hidden="true" />; })()}
                    <span><span className="lbl" style={{ display: 'block' }}>{l as string}</span><span style={{ display: 'block', fontSize: 13, color: 'var(--ink)' }}>{v as string}</span></span>
                  </div>
                  {i < arr.length - 1 && <div aria-hidden="true" style={{ width: 34, height: 2, background: 'linear-gradient(90deg,var(--acc),transparent)', backgroundSize: '200% 100%', animation: 'shimmer 1.2s linear infinite' }} />}
                </div>
              ))}
            </div>
            <div className="mini-tiles">
              {[
                { l: 'Sold raw', v: iskBig(est.rawValue), n: `${units(Math.round(est.rawPerDay))} ${p0} a day`, c: !refine ? 'var(--pos)' : undefined },
                { l: 'Refined first', v: iskBig(est.madeValue), n: `${units(Math.round(est.madePerDay))} ${product} a day`, c: refine ? 'var(--pos)' : undefined },
                { l: 'Which is better', v: verdict.short, n: est.uplift > 0 ? `${est.uplift.toFixed(2)}× the raw value` : 'not priced', c: refine ? 'var(--pos)' : 'var(--neg)' },
                {
                  l: 'Factories to build', v: refine ? `${units(est.factories)} per planet` : '—', c: undefined,
                  n: refine ? (est.factories === 0 ? 'Nothing extracted yet' : `Busy ${Math.round(est.utilisation * 100)}% of the time at ${units(Math.round(rate ?? 0))}/hour`) : 'None — sell it raw',
                  tip: `How many factories to build, per planet.\n\n• Each colony is its own island and can’t feed another.\n• One Basic Industry Facility gets through ${RAW_PER_HOUR.toLocaleString()} raw units an hour and returns ${MADE_PER_HOUR}.\n• A factory fed more slowly doesn’t stop, it runs fewer cycles. So this is how many you need to keep up, and how busy they’ll be.`,
                },
                { l: 'A week', v: iskBig(best * 7), n: 'Whichever way pays better, before customs tax', c: 'var(--pos)' },
                { l: 'A month', v: iskBig(best * 30), n: 'Before the customs office takes its cut', c: 'var(--pos)' },
              ].map((t) => (
                <div key={t.l} className="mini-tile" style={cssVars({ '--c': t.c })}>
                  <div className="tile-l">{t.l}{t.tip && <Tip text={t.tip} title={t.l} />}</div><div className="tile-v">{t.v}</div><div className="tile-n">{t.n}</div>
                </div>
              ))}
            </div>
            {sys ? (
              <div style={{ marginTop: 14, padding: '12px 14px', background: 'color-mix(in oklab,var(--acc) 6%,rgba(2,7,12,.6))', border: '1px solid color-mix(in oklab,var(--acc) 30%,transparent)', animation: 'rise .3s' }}>
                <div className="row tight" style={{ fontFamily: 'var(--f-head)', fontSize: 12, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--acc)', marginBottom: 10 }}>
                  <MapPin aria-hidden="true" style={{ width: 14, height: 14 }} />In {sys.name}
                </div>
                <div className="mini-tiles">
                  {[
                    {
                      l: 'Customs office tax', c: taxRate == null ? 'var(--acc2)' : taxRate > 0.05 ? 'var(--acc2)' : 'var(--pos)',
                      v: taxRate == null ? 'Rate needed' : `${pct(taxRate, 0)} · ${iskBig(monthlyTax ?? 0)}/mo`,
                      n: taxRate == null ? 'A low-sec office charges whatever its owner set. Type it below and this fills in.'
                        : `Charged on fixed base values — ${PI_BASE.raw} ISK a raw unit, ${PI_BASE.refined} ISK a refined one — not on Jita prices.${d.prefs.piTax == null ? ' The high-sec NPC rate; change it below if your office adds more.' : ''}`,
                    },
                    {
                      l: 'Trip home', c: sys.jumps == null ? 'var(--neg)' : sys.jumps <= 6 ? 'var(--pos)' : 'var(--acc2)',
                      v: sys.jumps == null ? 'Leaves high-sec' : `${sys.jumps * 2} jumps a week`,
                      n: sys.jumps == null ? 'No high-sec route to Jita — haul it yourself, carefully'
                        : `One collection run a week, there and back. At your ${iskBig(d.prefs.perJump)} per jump from Hauling, that’s ${iskBig(sys.jumps * 2 * d.prefs.perJump)} of your time`,
                    },
                    {
                      l: 'Colonies that fit here', c: fit >= colonies ? 'var(--pos)' : 'var(--acc2)', v: `${Math.min(fit, colonies)} of ${colonies}`,
                      n: fit >= colonies ? 'All your colonies in one system — one stop to collect' : `${colonies - fit} more need another system, so collection becomes a route`,
                    },
                    { l: 'After tax, a month', c: 'var(--pos)', v: monthlyTax == null ? '–' : iskBig(best * 30 - monthlyTax), n: 'Whichever way pays better, less the customs office' },
                  ].map((t) => (
                    <div key={t.l} className="mini-tile" style={cssVars({ '--c': t.c })}>
                      <div className="tile-l">{t.l}</div><div className="tile-v">{t.v}</div><div className="tile-n" style={{ textWrap: 'pretty' }}>{t.n}</div>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <NumChip id="pi-tax" label="Office tax rate" percent width={60} decimals={2} placeholder={highsec ? String(HIGHSEC_NPC_TAX * 100) : 'owner’s'}
                    value={d.prefs.piTax == null ? null : d.prefs.piTax * 100}
                    onChange={(n) => update((x) => ({ prefs: { ...x.prefs, piTax: n == null ? null : Math.min(100, Math.max(0, n)) / 100 } }))} />
                  <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>The rate shown on the customs office when you right-click it in space. Leave it empty for the high-sec NPC rate.</span>
                </div>
              </div>
            ) : (
              <p className="row tight" style={{ margin: '12px 0 0', fontSize: 12.5, color: '#9fb3c5' }}><ArrowRight aria-hidden="true" style={{ width: 14, height: 14, color: 'var(--acc)' }} />Choose a system in step 2 to add its customs tax, the trip home and how many colonies fit.</p>
            )}
            <div style={{ marginTop: 12 }}>
              <Points compact items={[
                { kind: 'info', icon: Landmark, lead: 'Customs', text: 'tax what leaves a planet on a fixed base value per product, not its market price.' },
                { kind: 'tip', lead: 'So', text: 'cheap raw costs almost nothing to export; refined goods cost more.' },
                { kind: 'warn', lead: 'High-sec', text: 'NPC customs take a much bigger cut than player-owned ones in low and null: that, more than extraction, is why planets pay less here.' },
              ]} />
            </div>
          </>
        )}
      </Step>

      <Step n={4} title="Build it">
        {!product ? <Locked>Pick a product and this becomes instructions for that product.</Locked> : (
          <>
            <div style={{ margin: '0 0 12px' }}>
              <Points compact items={refine ? [
                { kind: 'good', icon: Factory, lead: 'Refine', text: `${p0} into ${product} pays ${est.uplift > 0 ? `${est.uplift.toFixed(2)}×` : 'more'}, so this layout has factories.` },
                { kind: 'info', icon: ListOrdered, lead: 'In order', text: 'build it as numbered below: the survey comes before anything is placed.' },
              ] : [
                { kind: 'good', icon: Package, lead: 'Sell it raw', text: `${p0} is worth more as it comes out than refined into ${product}.` },
                { kind: 'info', lead: 'No factories', text: 'extractor straight to launchpad: simpler, cheaper in powergrid, and it pays better today.' },
              ]} />
            </div>
            <ColonyDiagram raw={p0} product={product} refine={refine} />
            <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
              {steps.map((s, i) => (
                <li key={s.title} style={{ padding: '12px 14px', background: 'rgba(2,7,12,.55)', border: '1px solid var(--line-3)', borderTop: '2px solid var(--acc)' }}>
                  <div className="row tight" style={{ flexWrap: 'nowrap', alignItems: 'baseline' }}><span className="mono" style={{ fontSize: 12, color: 'var(--acc)' }}>{String(i + 1).padStart(2, '0')}</span><b style={{ fontSize: 13, color: 'var(--ink)' }}>{s.title}</b></div>
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#9fb3c5', textWrap: 'pretty' }}>{s.body}</p>
                  {s.tip && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--acc2)', textWrap: 'pretty' }}>{s.tip}</p>}
                </li>
              ))}
            </ol>
            <div style={{ marginTop: 12, padding: '12px 14px', background: 'color-mix(in oklab,var(--acc2) 6%,rgba(2,7,12,.6))', border: '1px solid color-mix(in oklab,var(--acc2) 30%,transparent)' }}>
              <div className="panel-title" style={{ color: 'var(--acc2)' }}>Going one step further</div>
              <div style={{ marginTop: 8 }}>
                <Points compact items={[
                  { kind: 'info', icon: Factory, lead: 'Advanced facility', text: `${ADVANCED_FACTORY.eachPerCycle} each of two refined goods → ${ADVANCED_FACTORY.madePerCycle} processed, every hour: ${P1_PER_P2} refined a unit.` },
                  { kind: 'warn', icon: Globe, lead: 'Two inputs', text: 'one planet extracts one raw material, so a processed chain needs a second planet or hauling one input in.' },
                  { kind: 'info', lead: 'Recipes', text: 'which pairs make what is listed in the factory itself; the page doesn’t guess.' },
                  ...(chosen?.p1Price != null ? [{ kind: 'tip' as const, lead: 'Yardstick', text: `${P1_PER_P2} × ${product} is ${iskBig(P1_PER_P2 * chosen.p1Price)} of input: a processed good has to beat that.` }] : []),
                ]} />
              </div>
            </div>
          </>
        )}
      </Step>

      <SkillPanel title="Skills this wants" needs={PI_SKILLS}
        note="Interplanetary Consolidation is the one that pays for itself fastest: every level is another whole planet, and everything above scales straight off the planet count." />

      <div>
        <div className="panel-title" style={{ marginBottom: 8 }}>What each planet type can extract</div>
        <div style={{ border: '1px solid var(--line-3)' }}>
          {PLANET_TYPES.map((t) => (
            <div key={t} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12, padding: '8px 12px', alignItems: 'center', borderBottom: '1px solid var(--line-soft)', background: wanted.includes(t) ? 'color-mix(in oklab,var(--acc) 8%,transparent)' : 'transparent' }}>
              <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{t}</span>
              <span className="row tight">
                {PLANET_RESOURCES[t].map((res) => (
                  <span key={res} style={{ padding: '2px 7px', fontSize: 11.5, color: res === p0 ? 'var(--acc2)' : 'var(--sec)', border: `1px solid ${res === p0 ? 'color-mix(in oklab,var(--acc2) 50%,transparent)' : 'var(--line-strong)'}` }}>{res} → {P0_TO_P1[res]}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <Points compact items={[
            { kind: 'info', icon: Factory, lead: 'A factory', text: `${BASIC_FACTORY.rawPerCycle.toLocaleString()} raw → ${BASIC_FACTORY.madePerCycle} refined every ${BASIC_FACTORY.cycleMinutes} minutes: a fixed game value, its cycle confirmed in ESI’s schematics.` },
            { kind: 'info', icon: Landmark, lead: 'Customs base values', text: 'fixed game values, not served by ESI.' },
            { kind: 'warn', lead: 'Rich ground', text: 'isn’t in ESI at all, so nothing here puts a number on it.' },
          ]} />
        </div>
      </div>

      <div>
        <div className="panel-title" style={{ marginBottom: 8 }}>Worth reading first</div>
        <div className="col" style={{ gap: 8 }}>
          {PI_LINKS.map((l) => (
            <div key={l.href} style={{ fontSize: 13 }}>
              <a href={l.href} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{l.title}<ExternalLink aria-hidden="true" style={{ width: 12, height: 12 }} /></a>
              <span className="note"> — {l.what}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

