import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ADVANCED_FACTORY, BASIC_FACTORY, estimate, HIGHSEC_TAX_NOTE, inBand, MADE_PER_HOUR,
  P0_PER_P1, P0_TO_P1, P1_PER_P2, P1_TO_P0, PI_LINKS, PLANET_RESOURCES, PLANET_SORTS,
  PLANET_TYPES, rankProducts, RAW_PER_HOUR, refineVerdict, SECURITY_NOTE, setupSteps, sortSystems,
  type Band, type PiPlanet, type PlanetSort, type PlanetType, type ProductPick,
} from '../../lib/pi';
import { rates } from '../../lib/fees';
import { iskBig, isk, plainNum, units } from '../../lib/format';
import { jitaBook, resolveIds } from '../../lib/market';
import { marketBest } from '../../lib/relist';
import { JITA_SYSTEM, NEAR_JITA, scanPlanets, secureJumps } from '../../lib/universe';
import { useData } from '../../lib/store';
import { Explain } from '../common';
import { SkillPanel } from './SkillPanel';
import { PI_SKILLS } from '../../lib/skills';
import { Colonies } from './Colonies';
import { ChainDiagram, ColonyDiagram } from './PiDiagram';

const ALL_P1 = Object.keys(P1_TO_P0).sort();

function Step({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <section className={'pi-step' + (done ? ' done' : '')} aria-label={`Step ${n}: ${title}`}>
      <h2><span className="pi-num" aria-hidden="true">{done ? '✓' : n}</span>{title}</h2>
      {children}
    </section>
  );
}

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
  const [err, setErr] = useState<string | null>(null);
  const [rate, setRate] = useState(1000);
  const [count, setCount] = useState(4);
  const [countTouched, setCountTouched] = useState(false);
  const [jumps, setJumps] = useState<Record<number, number | null>>({});
  const [order, setOrder] = useState<PlanetSort>('yield');

  // Interplanetary Consolidation is exactly "one planet, plus one per level", so the field starts at
  // what you can actually run. Typing over it wins.
  const consolidation = d.skills?.[2495];
  const canRun = consolidation == null ? null : 1 + consolidation;
  useEffect(() => { if (!countTouched && canRun != null) setCount(canRun); }, [canRun, countTouched]);

  /** Every refined product and its raw input, priced against the live book in one pass. */
  const priceAll = useCallback(async () => {
    setPricing(true); setErr(null);
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
      setErr(e instanceof Error ? e.message : String(e));
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
    setBusy(true); setErr(null); setProgress({ done: 0, total: 0 });
    try {
      setPlanets(await scanPlanets(region, (sec) => inBand(sec, band), (done, total) => setProgress({ done, total })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false); setProgress(null);
    }
  }, [region, band]);

  const matching = (planets ?? []).filter((p) => wanted.includes(p.type));
  const bySystem = useMemo(() => {
    const m = new Map<string, { name: string; security: number; systemId: number; types: Map<PlanetType, number> }>();
    for (const p of matching) {
      const e = m.get(p.systemName) ?? { name: p.systemName, security: p.security, systemId: p.systemId, types: new Map() };
      e.types.set(p.type, (e.types.get(p.type) ?? 0) + 1);
      m.set(p.systemName, e);
    }
    return [...m.values()];
  }, [matching]);

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

  const ordered = useMemo(
    () => sortSystems(bySystem.map((e) => ({ ...e, jumps: jumps[e.systemId] })), order),
    [bySystem, jumps, order],
  );

  const est = estimate(rate, count, chosen?.p0Price ?? null, chosen?.p1Price ?? null, r.t, r.f);
  const steps = useMemo(() => (product ? setupSteps(product, refine) : []), [product, refine]);

  return (
    <>
      <Colonies />

      <p className="small muted" style={{ margin: '0 0 18px', maxWidth: '68ch' }}>
        Planets earn while you do nothing else, which is what makes them the right companion to a wall
        of market orders. Work down the steps: what to make, where to make it, what it comes to, and
        how to build it.
      </p>

      {err && <p className="notice err" role="alert">{err}</p>}

      <Step n={1} title="Pick what to make" done={!!product}>
        <p className="small muted" style={{ margin: '0 0 12px' }}>
          Every refined product costs the same {P0_PER_P1} units of raw material, so the best one to make
          is the one worth most once refined — but the raw sells too, and for several products that is
          the better trade. Ranked on what a thousand units of extraction turns into, net of your fees.
        </p>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn btn-primary" disabled={pricing} onClick={priceAll}>
            {pricing ? 'Pricing all 15…' : picks ? 'Price again' : 'Find the best product'}
          </button>
          {picks && product && (
            <span className="small muted" style={{ alignSelf: 'center' }}>
              Making <strong>{product}</strong> from <strong>{p0}</strong>
            </span>
          )}
        </div>

        {!picks ? (
          <p className="empty" style={{ margin: 0 }}>
            Nothing priced yet. This reads the live Jita book for all 15 refined products and all 15 raw
            materials, ranks them, and picks the best for you. A few seconds.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Make</th>
                  <th scope="col">From</th>
                  <th scope="col">
                    Per 1,000 raw
                    <Explain term="Per 1,000 raw">
                      What a thousand units of extraction is worth once refined and sold, net of your broker
                      fee and sales tax. Every product costs the same {P0_PER_P1} raw units each, so this is
                      the fair way to set them side by side.
                    </Explain>
                  </th>
                  <th scope="col">Or sold raw</th>
                  <th scope="col">
                    Refining gains
                    <Explain term="Refining gains">
                      Refined value divided by raw value. Below 1 the factories lose you money and the raw
                      should go straight out of the launchpad.
                    </Explain>
                  </th>
                  <th scope="col">Planets</th>
                  <th scope="col"><span className="opt">Pick</span></th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => {
                  const v = refineVerdict(p.uplift);
                  return (
                    <tr key={p.p1} className={p.p1 === product ? 'picked' : ''}>
                      <td className="name">{p.p1}<small className="sub">{p.p1Price ? isk(p.p1Price) : 'not priced'}</small></td>
                      <td>{p.p0}<small className="sub">{p.p0Price ? isk(p.p0Price) : 'not priced'}</small></td>
                      <td className="pos">{iskBig(p.refinedPer1000Raw)}</td>
                      <td>{iskBig(p.rawPer1000Raw)}</td>
                      <td className={v.worth ? 'pos' : 'neg'}>
                        {p.uplift > 0 ? `${p.uplift.toFixed(2)}×` : '–'}
                        <small className="sub">{v.short}</small>
                      </td>
                      <td style={{ whiteSpace: 'normal' }}>
                        {p.planets.map((t) => <span key={t} className="flag">{t}</span>)}
                      </td>
                      <td>
                        <button
                          className={'btn btn-small' + (p.p1 === product ? ' btn-primary' : '')}
                          onClick={() => setProduct(p.p1)}
                        >
                          {p.p1 === product ? 'Chosen' : 'Choose'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Step>

      <Step n={2} title="Find planets that can extract it" done={!!planets && matching.length > 0}>
        {!product ? (
          <p className="small muted" style={{ margin: 0 }}>Pick a product first and this will know what to look for.</p>
        ) : (
          <>
            <p className="small muted" style={{ margin: '0 0 12px' }}>
              {product} is refined from <strong>{p0}</strong>, which comes off <strong>{wanted.join(', ')}</strong> planets.
            </p>
            <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <div className="seg-control" role="group" aria-label="Security band">
                <button type="button" aria-pressed={band === 'high'} onClick={() => setBand('high')}>High-sec</button>
                <button type="button" aria-pressed={band === 'low'} onClick={() => setBand('low')}>Low-sec</button>
              </div>
              <span className="small muted">
                {band === 'high'
                  ? 'Safe to set up and safe to collect from. Pays less, and the tax is why.'
                  : 'Richer planets and a far cheaper customs office, at the cost of watching local.'}
              </span>
            </div>
            <div className="fields">
              <div className="field">
                <label htmlFor="pi-region">Region to search</label>
                <select id="pi-region" value={region} onChange={(e) => setRegion(Number(e.target.value))}>
                  {NEAR_JITA.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <span className="hint">Planet types never change, so a region is scanned once and kept</span>
              </div>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" disabled={busy} onClick={scan}>
                {busy ? 'Scanning…' : planets ? 'Scan again' : 'Find planets'}
              </button>
            </div>
            {progress && progress.total > 0 && (
              <p className="notice" role="status" style={{ marginTop: 12 }}>
                <span className="spinner" aria-hidden="true" />
                Reading the region — {units(progress.done)} of {units(progress.total)}. Kept for good, so
                this is a one-off per region.
              </p>
            )}

            {planets && (
              <>
                <p className="small muted" style={{ margin: '14px 0 10px' }}>
                  {units(matching.length)} planets across {units(bySystem.length)} systems can extract {p0}, out
                  of {units(planets.length)} scanned in the {band === 'high' ? 'high-sec' : 'low-sec'} part of{' '}
                  {NEAR_JITA.find((x) => x.id === region)?.name}.
                </p>
                <p className="notice" style={{ margin: '0 0 12px' }}>{SECURITY_NOTE}</p>
                <div className="row" style={{ gap: 10, alignItems: 'center', margin: '0 0 12px' }}>
                  <div className="seg-control" role="group" aria-label="How to order the systems">
                    {PLANET_SORTS.map((o) => (
                      <button key={o.key} type="button" aria-pressed={order === o.key} title={o.hint} onClick={() => setOrder(o.key)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <span className="small muted">{PLANET_SORTS.find((o) => o.key === order)?.hint}</span>
                </div>
                {!bySystem.length ? (
                  <p className="empty">
                    No {wanted.join(' or ')} planets in the {band === 'high' ? 'high-sec' : 'low-sec'} part of this
                    region. Try another region, or a product from a commoner planet type.
                  </p>
                ) : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th scope="col">System</th>
                          <th scope="col">Security<Explain term="Security">{SECURITY_NOTE}</Explain></th>
                          <th scope="col">
                            From Jita
                            <Explain term="From Jita">
                              Jumps on a high-sec-only route. The output has to come home to be sold, so a rich
                              planet fifteen jumps out is worse than a fair one next door.
                            </Explain>
                          </th>
                          <th scope="col">Planets you could use</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordered.slice(0, 60).map((e) => {
                          const j = e.jumps;
                          return (
                            <tr key={e.name}>
                              <td className="name">{e.name}</td>
                              <td className={e.security <= 0.6 ? 'pos' : ''} title={e.security <= 0.6 ? 'Lower security, so richer planets' : undefined}>
                                {e.security.toFixed(1)}
                              </td>
                              <td className={j != null && j <= 10 ? 'pos' : undefined}>
                                {j === undefined ? <span className="muted">…</span>
                                  : j === null ? <span className="neg">not in high-sec</span>
                                    : `${j} jumps`}
                              </td>
                              <td>{[...e.types.entries()].map(([t, n]) => `${n}× ${t}`).join(', ')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Step>

      <Step n={3} title="See what it would bring in" done={!!chosen}>
        {!chosen ? (
          <p className="small muted" style={{ margin: 0 }}>Pick a product first.</p>
        ) : (
          <>
            <div className="fields">
              <div className="field">
                <label htmlFor="pi-rate">Units an hour, per planet</label>
                <input
                  id="pi-rate" type="text" inputMode="decimal" value={plainNum(rate)}
                  onChange={(e) => { const n = parseFloat(e.target.value.replace(/[^0-9.]/g, '')); setRate(Number.isFinite(n) ? n : 0); }}
                />
                <span className="hint">What the extractor tells you as you drag its heads out</span>
              </div>
              <div className="field">
                <label htmlFor="pi-count">Planets</label>
                <input
                  id="pi-count" type="text" inputMode="numeric" value={plainNum(count)}
                  onChange={(e) => { setCountTouched(true); const n = parseFloat(e.target.value.replace(/[^0-9.]/g, '')); setCount(Number.isFinite(n) ? n : 0); }}
                />
                <span className="hint">
                  {canRun != null
                    ? `Your Interplanetary Consolidation ${consolidation} lets you run ${canRun}`
                    : 'One, plus one per level of Interplanetary Consolidation'}
                </span>
              </div>
            </div>

            <ChainDiagram raw={p0} product={product!} />

            <dl className="figures" style={{ marginTop: 6 }}>
              <div className="stat">
                <dt>Sold raw</dt>
                <dd className={!refine ? 'pos' : undefined}>{iskBig(est.rawValue)}<small>{units(Math.round(est.rawPerDay))} {p0} a day</small></dd>
              </div>
              <div className="stat">
                <dt>Refined first</dt>
                <dd className={refine ? 'pos' : undefined}>{iskBig(est.madeValue)}<small>{units(Math.round(est.madePerDay))} {product} a day</small></dd>
              </div>
              <div className="stat">
                <dt>Which is better</dt>
                <dd className={refine ? 'pos' : 'neg'}>
                  {verdict.short}
                  <small>{est.uplift > 0 ? `${est.uplift.toFixed(2)}× the raw value` : 'not priced'}</small>
                </dd>
              </div>
              <div className="stat">
                <dt>
                  Factories to build
                  <Explain term="Factories to build">
                    Per planet, not across them: each colony is its own island and cannot feed another.
                    One Basic Industry Facility gets through {RAW_PER_HOUR.toLocaleString()} raw units an
                    hour and returns {MADE_PER_HOUR}. A factory fed more slowly than that does not stop
                    working — it just runs fewer cycles — so this is how many you need to keep up, and
                    how busy they will be.
                  </Explain>
                </dt>
                <dd>
                  {refine ? `${units(est.factories)} per planet` : '—'}
                  <small>
                    {refine
                      ? est.factories === 0
                        ? 'Nothing extracted yet'
                        : `Busy ${Math.round(est.utilisation * 100)}% of the time at ${units(Math.round(rate))}/hour`
                      : 'None — sell it raw'}
                  </small>
                </dd>
              </div>
              <div className="stat">
                <dt>A week</dt>
                <dd className="pos">{iskBig(Math.max(est.rawValue, est.madeValue) * 7)}<small>Whichever way pays better</small></dd>
              </div>
              <div className="stat">
                <dt>A month</dt>
                <dd className="pos">{iskBig(Math.max(est.rawValue, est.madeValue) * 30)}<small>Before the customs office takes its cut</small></dd>
              </div>
            </dl>
            <p className="small muted" style={{ margin: '12px 0 0' }}>{HIGHSEC_TAX_NOTE}</p>
          </>
        )}
      </Step>

      <Step n={4} title="Build it">
        {!product ? (
          <p className="small muted" style={{ margin: 0 }}>Pick a product and this becomes instructions for that product.</p>
        ) : (
          <>
            <p className="small muted" style={{ margin: '0 0 6px' }}>
              {refine
                ? <>Refining {p0} into {product} pays {est.uplift > 0 ? `${est.uplift.toFixed(2)}×` : 'more'}, so this
                  layout includes factories. Build it in this order — the survey comes before anything is placed.</>
                : <>{p0} is worth more sold as it comes out than refined into {product}, so this layout has no
                  factories at all: extractor straight to launchpad. Simpler to build, cheaper in powergrid,
                  and it pays better today.</>}
            </p>

            <ColonyDiagram raw={p0} product={product} refine={refine} />

            <ol className="pi-steps">
              {steps.map((s) => (
                <li key={s.title}>
                  <strong>{s.title}</strong>
                  <p>{s.body}</p>
                  {s.tip && <p className="pi-tip">{s.tip}</p>}
                </li>
              ))}
            </ol>

            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Going one step further</h3>
              <p className="small muted" style={{ margin: 0 }}>
                An Advanced Industry Facility turns <strong>{ADVANCED_FACTORY.eachPerCycle} units each of two
                different</strong> refined goods into {ADVANCED_FACTORY.madePerCycle} of a processed one every
                hour — {P1_PER_P2} refined units per processed unit. The catch is the word
                “different”: one planet extracts one raw material, so a processed chain means a second
                planet or hauling the other input in. Which pairs make what is listed in the factory itself
                when you place it, and this page does not guess at recipes it cannot read from the game.
                {chosen?.p1Price != null && (
                  <> As a yardstick, {P1_PER_P2} × {product} is {iskBig(P1_PER_P2 * chosen.p1Price)} of input,
                  so a processed good has to beat that before the extra factories and the second planet are
                  worth the trouble.</>
                )}
              </p>
            </div>
          </>
        )}
      </Step>

      <SkillPanel
        title="Skills this wants"
        needs={PI_SKILLS}
        note="Interplanetary Consolidation is the one that pays for itself fastest: every level is another whole planet, and everything above scales straight off the planet count."
      />

      <h2 style={{ fontSize: '1.05rem', margin: '26px 0 8px' }}>What each planet type can extract</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th scope="col">Planet</th><th scope="col">Raw resources, and what each refines into</th></tr></thead>
          <tbody>
            {PLANET_TYPES.map((t) => (
              <tr key={t} className={wanted.includes(t) ? 'picked' : ''}>
                <td className="name">{t}</td>
                <td style={{ whiteSpace: 'normal' }}>
                  {PLANET_RESOURCES[t].map((res) => (
                    <span key={res} className={'flag' + (res === p0 ? ' v-move' : '')}>{res} → {P0_TO_P1[res]}</span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: '1.05rem', margin: '26px 0 8px' }}>Worth reading first</h2>
      <ul className="links">
        {PI_LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noopener noreferrer">{l.title}</a>
            <span className="muted small"> — {l.what}</span>
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ marginTop: 10 }}>
        The factory ratios here ({BASIC_FACTORY.rawPerCycle.toLocaleString()} raw →{' '}
        {BASIC_FACTORY.madePerCycle} refined every {BASIC_FACTORY.cycleMinutes} minutes) are fixed game
        values rather than anything ESI serves. The {BASIC_FACTORY.cycleMinutes}-minute cycle is confirmed
        from ESI’s own schematic data.
      </p>
    </>
  );
}
