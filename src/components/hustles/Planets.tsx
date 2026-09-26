import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  estimate, HIGHSEC_TAX_NOTE, inBand, P0_PER_P1, P0_TO_P1, PI_LINKS, planetsFor,
  PLANET_RESOURCES, PLANET_SORTS, PLANET_TYPES, SECURITY_NOTE, sortSystems,
  type Band, type PiPlanet, type PlanetSort, type PlanetType,
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

const P1S = [...new Set(Object.values(P0_TO_P1))].sort();

export function Planets() {
  const d = useData();
  const r = rates(d.settings);
  const [band, setBand] = useState<Band>('high');
  const [region, setRegion] = useState(NEAR_JITA[0].id);
  const [product, setProduct] = useState<string>('Plasmoids');
  const [planets, setPlanets] = useState<PiPlanet[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rate, setRate] = useState(1000);
  const [count, setCount] = useState(4);
  const [countTouched, setCountTouched] = useState(false);
  const [jumps, setJumps] = useState<Record<number, number | null>>({});
  const [prices, setPrices] = useState<{ p0: number | null; p1: number | null } | null>(null);
  const [order, setOrder] = useState<PlanetSort>('yield');

  // Interplanetary Consolidation is exactly "one planet, plus one per level", so the field starts at
  // what you can actually run rather than at a number pulled from the air. Typing over it wins.
  const consolidation = d.skills?.[2495];
  const canRun = consolidation == null ? null : 1 + consolidation;
  useEffect(() => { if (!countTouched && canRun != null) setCount(canRun); }, [canRun, countTouched]);

  const p0 = useMemo(() => Object.entries(P0_TO_P1).find(([, v]) => v === product)?.[0] ?? '', [product]);
  const wanted = useMemo(() => planetsFor(product), [product]);

  const scan = useCallback(async () => {
    setBusy(true); setErr(null); setProgress({ done: 0, total: 0 });
    try {
      const found = await scanPlanets(region, (sec) => inBand(sec, band), (done, total) => setProgress({ done, total }));
      setPlanets(found);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false); setProgress(null);
    }
  }, [region, band]);

  const price = useCallback(async () => {
    setErr(null);
    try {
      const ids = await resolveIds([p0, product]);
      const found = ids.inventory_types ?? [];
      const idOf = (n: string) => found.find((x) => x.name === n)?.id;
      const quote = async (n: string) => {
        const id = idOf(n);
        if (!id) return null;
        const book = await jitaBook(id);
        return marketBest(book.topBuys, true) ?? marketBest(book.topSells, false);
      };
      const [a, b] = await Promise.all([quote(p0), quote(product)]);
      setPrices({ p0: a, p1: b });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [p0, product]);

  const est = estimate(rate, count, prices?.p0 ?? null, prices?.p1 ?? null, r.t, r.f);
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

  // Ordered only once the jumps are in, so "closest to Jita" doesn't jump about as they arrive.
  const ordered = useMemo(
    () => sortSystems(bySystem.map((e) => ({ ...e, jumps: jumps[e.systemId] })), order),
    [bySystem, jumps, order],
  );

  // How far each candidate is from home. You have to haul the output to Jita to sell it, and a
  // 0.9 system twelve jumps out is a worse place to put a command centre than a 0.6 next door.
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

  return (
    <>
      <p className="small muted" style={{ margin: '0 0 18px', maxWidth: '68ch' }}>
        The passive one. Two halves with very different standing: <strong>where the planets are</strong>
        is exact — ESI names every planet’s type and every system’s security — but <strong>what one
        yields</strong> is not, because extraction rate depends on richness that exists only in the
        client. So the income below is your own number run through live Jita prices, not a forecast.
        Read the rate off the extractor when you place it and type it in.
      </p>

      {err && <p className="notice err" role="alert">{err}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 14 }}>
          <div className="seg-control" role="group" aria-label="Security band">
            <button type="button" aria-pressed={band === 'high'} onClick={() => setBand('high')}>High-sec</button>
            <button type="button" aria-pressed={band === 'low'} onClick={() => setBand('low')}>Low-sec</button>
          </div>
          <span className="small muted">
            {band === 'high'
              ? 'Safe to set up and safe to collect from. Pays less, and the reason is the tax below.'
              : 'Better yields and a far cheaper customs office, at the cost of having to watch local.'}
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
          <div className="field">
            <label htmlFor="pi-product">What you want to make</label>
            <select id="pi-product" value={product} onChange={(e) => { setProduct(e.target.value); setPrices(null); }}>
              {P1S.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="hint">Refined from {p0 || '—'}, found on {wanted.join(', ') || '—'} planets</span>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" disabled={busy} onClick={scan}>
            {busy ? 'Scanning…' : planets ? 'Scan again' : 'Find planets'}
          </button>
          <button className="btn" onClick={price}>Price {product}</button>
        </div>
        {progress && progress.total > 0 && (
          <p className="notice" role="status" style={{ marginTop: 12 }}>
            <span className="spinner" aria-hidden="true" />
            Reading the region — {units(progress.done)} of {units(progress.total)}. Planet types are kept
            for good, so this is a one-off per region.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>
          What it would bring in
          <Explain term="What it would bring in">
            Arithmetic on your own extraction rate, not a prediction. The client shows units per hour
            when you place an extractor — put that here. Customs office tax is not included and is the
            big difference between high-sec and everywhere else.
          </Explain>
        </h2>
        <div className="fields" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="pi-rate">Units an hour, per planet</label>
            <input
              id="pi-rate" type="text" inputMode="decimal" value={plainNum(rate)}
              onChange={(e) => { const n = parseFloat(e.target.value.replace(/[^0-9.]/g, '')); setRate(Number.isFinite(n) ? n : 0); }}
            />
            <span className="hint">What the extractor says when you place it</span>
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
        {!prices ? (
          <p className="small muted" style={{ margin: '12px 0 0' }}>
            Press <strong>Price {product}</strong> above to value it against the live Jita book.
          </p>
        ) : (
          <dl className="figures" style={{ marginTop: 14 }}>
            <div className="stat"><dt>Raw {p0}</dt><dd>{units(Math.round(est.p0PerDay))}/day<small>{prices.p0 ? `${isk(prices.p0)} each` : 'not priced'}</small></dd></div>
            <div className="stat"><dt>Sold raw</dt><dd className="pos">{iskBig(est.p0Value)}<small>A day, after fees</small></dd></div>
            <div className="stat"><dt>Refined to {product}</dt><dd>{units(Math.round(est.p1PerDay))}/day<small>{P0_PER_P1} raw makes one</small></dd></div>
            <div className="stat"><dt>Sold as {product}</dt><dd className="pos">{iskBig(est.p1Value)}<small>A day, after fees</small></dd></div>
            <div className="stat"><dt>Worth refining?</dt><dd className={est.uplift >= 1 ? 'pos' : 'neg'}>{est.uplift > 0 ? `${est.uplift.toFixed(2)}×` : '–'}<small>{est.uplift >= 1 ? 'Refining beats selling raw' : 'Selling raw beats refining'}</small></dd></div>
            <div className="stat"><dt>A week</dt><dd className="pos">{iskBig(Math.max(est.p0Value, est.p1Value) * 7)}<small>Whichever way pays better</small></dd></div>
          </dl>
        )}
        <p className="small muted" style={{ margin: '14px 0 0' }}>{HIGHSEC_TAX_NOTE}</p>
      </div>

      {planets && (
        <>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 8px' }}>
            Where to put them
          </h2>
          <p className="small muted" style={{ margin: '0 0 14px' }}>
            {units(matching.length)} planets across {units(bySystem.length)} systems in{' '}
            {NEAR_JITA.find((x) => x.id === region)?.name} can extract {p0} for {product}, out of{' '}
            {units(planets.length)} scanned in the {band === 'high' ? 'high-sec' : 'low-sec'} part of the
            region. ESI does not publish how rich any individual planet is, so this says where to look,
            not which one to pick — the client shows richness the moment you warp to it.
          </p>
          <p className="notice" style={{ margin: '0 0 14px' }}>{SECURITY_NOTE}</p>
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
              No {wanted.join(' or ')} planets in the {band === 'high' ? 'high-sec' : 'low-sec'} part of
              this region. Try another region, or another product.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">System</th>
                    <th scope="col">
                      Security
                      <Explain term="Security">{SECURITY_NOTE}</Explain>
                    </th>
                    <th scope="col">
                      From Jita
                      <Explain term="From Jita">
                        Jumps on a high-sec-only route. You have to carry the output home to sell it,
                        so a rich planet fifteen jumps away is worse than a fair one next door.
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
                            : j === null ? <span className="neg" title="No high-sec route from Jita">not in high-sec</span>
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

      <SkillPanel
        title="Skills this wants"
        needs={PI_SKILLS}
        note="Interplanetary Consolidation is the one that pays for itself fastest: every level is another whole planet, and the income above scales straight off the planet count."
      />

      <h2 style={{ fontSize: '1.05rem', margin: '26px 0 8px' }}>What each planet type can extract</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th scope="col">Planet</th><th scope="col">Raw resources</th></tr></thead>
          <tbody>
            {PLANET_TYPES.map((t) => (
              <tr key={t}>
                <td className="name">{t}</td>
                <td style={{ whiteSpace: 'normal' }}>
                  {PLANET_RESOURCES[t].map((res) => `${res} → ${P0_TO_P1[res]}`).join(' · ')}
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
    </>
  );
}
