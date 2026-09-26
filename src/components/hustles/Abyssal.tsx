import { useCallback, useMemo, useState } from 'react';
import {
  ABYSSAL_LINKS, byTier, iskPerHour, parseFilament, RUN_MINUTES, runsFrom, TIERS, WEATHERS,
  type Filament, type Weather,
} from '../../lib/abyssal';
import { rates } from '../../lib/fees';
import { iskBig, isk, pct, plainNum, units } from '../../lib/format';
import {
  ABYSSAL_MATERIALS_GROUP, FILAMENT_GROUPS, groupTypes, jitaBook, marketHistory,
  recentAverages, resolveNames,
} from '../../lib/market';
import { marketBest } from '../../lib/relist';
import { tickDown } from '../../lib/tick';
import { update, useData } from '../../lib/store';
import { Explain, OpenInGame } from '../common';
import { SkillPanel } from './SkillPanel';
import { ABYSSAL_SKILLS } from '../../lib/skills';

type Quote = { f: Filament; cost: number | null; flipNet: number | null; perDay: number | null };

const WINDOW_DAYS = 30;

export function Abyssal() {
  const d = useData();
  const r = rates(d.settings);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [lootTypes, setLootTypes] = useState<Set<number>>(new Set());
  const [weather, setWeather] = useState<Weather | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy('Reading the filament market…'); setErr(null);
    try {
      const [filIds, matIds] = await Promise.all([groupTypes(FILAMENT_GROUPS), groupTypes([ABYSSAL_MATERIALS_GROUP])]);
      const names = await resolveNames(filIds.concat(matIds));
      update((x) => ({ names: { ...x.names, ...names } }));

      // The filament groups also hold expired event filaments and warp matrix filaments. Only a
      // `<Tier> <Weather> Filament` is a run.
      const filaments = filIds
        .map((id) => parseFilament(id, names[id] ?? ''))
        .filter((f): f is Filament => !!f)
        .sort(byTier);

      // Mutaplasmids are the other half of abyssal income and live in a tree of their own, so they
      // are recognised by name rather than by fetching two thousand market groups to find them.
      //
      // That only works if we know the names, and a mutaplasmid you sold may never have been named
      // in this browser --- which silently dropped the sale from the figures below. So anything you
      // have traded and we cannot name gets resolved here first.
      const traded = [...new Set(Object.values(d.txs).map((t) => t.typeId))];
      const unnamed = traded.filter((id) => !d.names[id] && !names[id]);
      const extra = unnamed.length ? await resolveNames(unnamed).catch(() => ({})) : {};
      if (Object.keys(extra).length) update((x) => ({ names: { ...x.names, ...extra } }));

      const loot = new Set<number>(matIds);
      const sources: Record<number, string>[] = [d.names, names, extra];
      for (const src of sources) {
        for (const [id, n] of Object.entries(src)) if (/Mutaplasmid$/.test(n)) loot.add(Number(id));
      }
      setLootTypes(loot);

      const out: Quote[] = [];
      let i = 0, done = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (i < filaments.length) {
          const f = filaments[i++];
          let cost: number | null = null, flipNet: number | null = null, perDay: number | null = null;
          try {
            const book = await jitaBook(f.typeId);
            const sell = marketBest(book.topSells, false);
            const buy = marketBest(book.topBuys, true);
            cost = sell;
            // Flipping it: list one tick under the going ask, less both charges.
            if (sell != null) {
              const ask = tickDown(sell);
              flipNet = (Number.isFinite(ask) ? ask : sell) * (1 - r.f - r.t);
            } else if (buy != null) flipNet = buy * (1 - r.t);
          } catch { /* left unpriced */ }
          try { perDay = recentAverages(await marketHistory(f.typeId), 7).avgVol; } catch { /* no history */ }
          out.push({ f, cost, flipNet, perDay });
          setBusy(`Pricing ${++done} of ${filaments.length} filaments…`);
        }
      }));
      setQuotes(out.sort((a, b) => byTier(a.f, b.f)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [r.f, r.t, d.names, d.txs]);

  const filamentMap = useMemo(() => {
    const m = new Map<number, Filament>();
    for (const q of quotes ?? []) m.set(q.f.typeId, q.f);
    return m;
  }, [quotes]);

  const stats = useMemo(() => {
    const since = Date.now() - WINDOW_DAYS * 86400_000;
    return runsFrom(Object.values(d.txs), filamentMap, lootTypes, since, r.t);
  }, [d.txs, filamentMap, lootTypes, r.t]);

  const shown = (quotes ?? []).filter((q) => weather === 'all' || q.f.weather === weather);
  // Filaments already in the hangar, from the assets sync. Runs you can start without buying anything.
  const held = (quotes ?? [])
    .map((q) => ({ f: q.f, n: d.stock?.total?.[q.f.typeId] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const minutes = stats.topFilament ? RUN_MINUTES[stats.topFilament.tier] : 18;
  const perHour = stats.perRun != null ? iskPerHour(stats.perRun, minutes) : null;

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <p className="small muted" style={{ margin: 0, maxWidth: '62ch' }}>
          No API will tell you what a filament drops — ESI has no loot tables at all, so any
          “expected reward” here would be a number someone made up. What can be known is what every
          filament costs, and what <strong>your</strong> runs have actually paid, which your wallet
          already records.
        </p>
        <button className="btn btn-primary" disabled={!!busy} onClick={load}>
          {busy ? busy : quotes ? 'Check again' : 'Price the filaments'}
        </button>
      </div>

      {err && <p className="notice err" role="alert">{err}</p>}

      {quotes && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>
            What your runs have paid
            <Explain term="What your runs have paid">
              Filaments you bought and abyssal loot you sold, both from your synced wallet, over the
              last {WINDOW_DAYS} days. Loot carries no record of which run it fell from, so this is
              pooled across every tier you ran — the mix below says how much that matters. Loot still
              sitting unsold in your hangar counts for nothing here, so a good week can look flat
              until you sell it.
            </Explain>
          </h2>
          {stats.runs === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              No filament purchases in your last {WINDOW_DAYS} days of transactions. Buy filaments on
              the market rather than looting them and this fills in on its own — nothing to log.
            </p>
          ) : (
            <>
              <dl className="figures" style={{ marginTop: 10 }}>
                <div className="stat"><dt>Runs</dt><dd>{units(stats.runs)}<small>Filaments bought in {WINDOW_DAYS} days</small></dd></div>
                <div className="stat"><dt>Spent on filaments</dt><dd>{iskBig(stats.spentOnFilaments)}<small>{isk(stats.spentOnFilaments / stats.runs)} a run</small></dd></div>
                <div className="stat"><dt>Loot sold</dt><dd className="pos">{iskBig(stats.lootSold)}<small>{units(stats.lootItems)} items, after sales tax</small></dd></div>
                <div className="stat"><dt>Profit</dt><dd className={stats.profit >= 0 ? 'pos' : 'neg'}>{iskBig(stats.profit)}<small>Loot sold less filaments bought</small></dd></div>
                <div className="stat">
                  <dt>Per run</dt>
                  <dd className={(stats.perRun ?? 0) >= 0 ? 'pos' : 'neg'}>
                    {stats.perRun == null ? '–' : iskBig(stats.perRun)}
                    <small>What one filament turned into</small>
                  </dd>
                </div>
                <div className="stat">
                  <dt>
                    Per hour
                    <Explain term="Per hour">
                      Your measured return per run at the usual pace for that tier, so it can be set
                      beside hauling and PI on the same footing. A pocket is three rooms on a
                      twenty-minute timer each, so the ceiling is the game's, not an estimate — what
                      varies is how fast you clear.
                    </Explain>
                  </dt>
                  <dd className={(perHour ?? 0) >= 0 ? 'pos' : 'neg'}>
                    {perHour == null ? '–' : iskBig(perHour)}
                    <small>At about {minutes} min a run</small>
                  </dd>
                </div>
                <div className="stat">
                  <dt>Mostly</dt>
                  <dd>
                    {stats.topFilament ? `${stats.topFilament.tier} ${stats.topFilament.weather}` : '–'}
                    <small>{pct(stats.concentration, 0)} of your runs</small>
                  </dd>
                </div>
              </dl>
              <p className="small muted" style={{ margin: '12px 0 0' }}>
                {stats.concentration >= 0.8
                  ? `Four runs in five were ${stats.topFilament?.tier} ${stats.topFilament?.weather}, so treat the per-run figure as that filament's.`
                  : 'Your runs are spread across several filaments, so the per-run figure is an average of all of them rather than any one.'}
              </p>
            </>
          )}
        </div>
      )}

      {quotes && held.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>Filaments you already have</h2>
          <p className="small muted" style={{ margin: '0 0 10px' }}>
            From your synced assets — runs you can start without buying anything. Worth{' '}
            <strong>{iskBig(held.reduce((t, x) => t + x.n * ((quotes.find((q) => q.f.typeId === x.f.typeId)?.flipNet) ?? 0), 0))}</strong>{' '}
            if you sold them instead.
          </p>
          <p style={{ margin: 0 }}>
            {held.map((x) => (
              <span key={x.f.typeId} className="flag" title={`${x.n} in your hangars`}>
                {x.n}× {x.f.tier} {x.f.weather}
              </span>
            ))}
          </p>
        </div>
      )}

      {!quotes ? (
        <p className="empty">
          Nothing priced yet. This reads the five filament market groups, prices every tier against the
          live Jita book, and then works out what your own runs have returned from transactions already
          synced. A few seconds.
        </p>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12, gap: 10, alignItems: 'center' }}>
            <div className="seg-control" role="group" aria-label="Which weather to show">
              <button type="button" aria-pressed={weather === 'all'} onClick={() => setWeather('all')}>All</button>
              {WEATHERS.map((w) => (
                <button key={w} type="button" aria-pressed={weather === w} onClick={() => setWeather(w)}>{w}</button>
              ))}
            </div>
            <span className="small muted">Ordered easiest first. The ladder is {TIERS.join(' → ')}.</span>
          </div>

          <div className="table-wrap">
            <table className="data wide">
              <thead>
                <tr>
                  <th scope="col">Filament</th>
                  <th scope="col">Tier</th>
                  <th scope="col">
                    Costs
                    <Explain term="Costs">What one filament costs to buy outright at Jita right now, ignoring any single mispriced listing.</Explain>
                  </th>
                  <th scope="col">
                    A run must beat
                    <Explain term="A run must beat">What you would net by listing the filament instead of running it, after your broker fee and sales tax. Your loot has to sell for more than this or the run was not worth doing — and that holds for a filament you looted too, because selling it was still the alternative.</Explain>
                  </th>
                  <th scope="col">
                    Cost of flipping
                    <Explain term="Cost of flipping">The gap between buying one and selling it straight back: the spread plus both charges. Small on the busy tiers, wide on the thin ones.</Explain>
                  </th>
                  <th scope="col">
                    Traded a day
                    <Explain term="Traded a day">How many of this filament change hands at Jita on an average day. A thin one is awkward to buy in quantity and awkward to flip.</Explain>
                  </th>
                  <th scope="col"><span className="opt">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((q) => (
                  <tr key={q.f.typeId}>
                    <td className="name">{q.f.name}</td>
                    <td>{q.f.tier}<small className="sub">{q.f.weather}</small></td>
                    <td>{q.cost == null ? <span className="muted">–</span> : isk(q.cost)}</td>
                    <td className={q.flipNet != null ? 'pos' : undefined}>
                      {q.flipNet == null ? <span className="muted">–</span> : isk(q.flipNet)}
                    </td>
                    <td className="neg">
                      {q.cost != null && q.flipNet != null ? isk(q.cost - q.flipNet) : <span className="muted">–</span>}
                    </td>
                    <td>{q.perDay == null ? <span className="muted">–</span> : plainNum(Math.round(q.perDay))}</td>
                    <td><OpenInGame typeId={q.f.typeId} name={q.f.name} label="In game" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SkillPanel
        title="Skills this wants"
        needs={ABYSSAL_SKILLS}
        note="Hull and weapon skills depend on what you fly, so they are not listed here — these are the support skills every abyssal fit leans on whatever the hull. Tiers above Raging punish a thin tank far more than they reward a fat gun."
      />

      <h2 style={{ fontSize: '1.05rem', margin: '26px 0 8px' }}>Worth having open</h2>
      <ul className="links">
        {ABYSSAL_LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noopener noreferrer">{l.title}</a>
            <span className="muted small"> — {l.what}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
