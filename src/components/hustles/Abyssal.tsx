import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Tornado } from 'lucide-react';
import {
  ABYSSAL_LINKS, byTier, iskPerHour, parseFilament, RUN_MINUTES, runsFrom, TIERS, WEATHERS,
  type Filament, type Weather,
} from '../../lib/abyssal';
import { rates } from '../../lib/fees';
import { iskBig, isk, pct, units } from '../../lib/format';
import { ABYSSAL_MATERIALS_GROUP, FILAMENT_GROUPS, groupTypes, jitaBook, marketHistory, recentAverages, resolveNames } from '../../lib/market';
import { marketBest } from '../../lib/relist';
import { tickDown } from '../../lib/tick';
import { isAbyssalSystem, netLoss } from '../../lib/combat';
import { update, useData } from '../../lib/store';
import { toast } from '../../lib/toast';
import { OpenInGame, useTypeName } from '../common';
import { cssVars, Seg, Th, Tip } from '../ui';
import { SkillPanel } from './SkillPanel';
import { AbyssCell, AbyssMatrix, type Cell } from './AbyssMatrix';
import { TrackerFitView, TrackerPanel, trackerCellOf, useTracker } from './AbyssTracker';
import { AbyssTree } from './AbyssTree';
import { useRightNow } from './rightNow';
import { ABYSS_SHIPS } from '../../lib/abyssShips';
import { trackerWeather, type TrackerFit } from '../../lib/abyssTracker';
import { ABYSSAL_SKILLS } from '../../lib/skills';

type Quote = { f: Filament; cost: number | null; flipNet: number | null; perDay: number | null };
const WINDOW_DAYS = 30;
const DAY = 86400_000;
const CELL_KEY = 'jita-ledger:abyss-cell';
const readCell = (): Cell | null => {
  try { const c = JSON.parse(localStorage.getItem(CELL_KEY) ?? 'null'); return c && TIERS.includes(c.tier) && WEATHERS.includes(c.weather) ? c : null; } catch { return null; }
};
const saveCell = (c: Cell) => { try { localStorage.setItem(CELL_KEY, JSON.stringify(c)); } catch { /* the pick just isn't kept */ } };

export function Abyssal() {
  const d = useData();
  const nameOf = useTypeName();
  const r = rates(d.settings);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [lootTypes, setLootTypes] = useState<Set<number>>(new Set());
  const [weather, setWeather] = useState<Weather | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy('Reading the filament market…');
    try {
      const [filIds, matIds] = await Promise.all([groupTypes(FILAMENT_GROUPS), groupTypes([ABYSSAL_MATERIALS_GROUP])]);
      const names = await resolveNames(filIds.concat(matIds));
      update((x) => ({ names: { ...x.names, ...names } }));
      // The filament groups also hold expired event filaments and warp matrix filaments. Only a
      // `<Tier> <Weather> Filament` is a run.
      const filaments = filIds.map((id) => parseFilament(id, names[id] ?? '')).filter((f): f is Filament => !!f).sort(byTier);
      // Mutaplasmids are the other half of abyssal income and live in a tree of their own, so they
      // are recognised by name. Anything you have traded that this browser cannot name gets resolved
      // first, or a mutaplasmid sale drops silently out of the figures below.
      const traded = [...new Set(Object.values(d.txs).map((t) => t.typeId))];
      const unnamed = traded.filter((id) => !d.names[id] && !names[id]);
      const extra = unnamed.length ? await resolveNames(unnamed).catch(() => ({})) : {};
      if (Object.keys(extra).length) update((x) => ({ names: { ...x.names, ...extra } }));
      const loot = new Set<number>(matIds);
      for (const src of [d.names, names, extra] as Record<number, string>[]) {
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
            if (sell != null) { const ask = tickDown(sell); flipNet = (Number.isFinite(ask) ? ask : sell) * (1 - r.f - r.t); }
            else if (buy != null) flipNet = buy * (1 - r.t);
          } catch { /* left unpriced */ }
          try { perDay = recentAverages(await marketHistory(f.typeId), 7).avgVol; } catch { /* no history */ }
          out.push({ f, cost, flipNet, perDay });
          setBusy(`Pricing ${++done} of ${filaments.length} filaments…`);
        }
      }));
      setQuotes(out.sort((a, b) => byTier(a.f, b.f)));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(null);
    }
  }, [r.f, r.t, d.names, d.txs]);

  // Prices on opening: the grid is the page. The button re-reads them.
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const filamentMap = useMemo(() => new Map((quotes ?? []).map((q) => [q.f.typeId, q.f])), [quotes]);
  // Every filament you've bought, all time: the runs you've started, per cell.
  const runsAll = useMemo(() => Object.fromEntries(runsFrom(Object.values(d.txs), filamentMap, new Set(), 0, r.t).byFilament.map((x) => [x.f.typeId, x.runs])), [d.txs, filamentMap, r.t]);
  const stats = useMemo(() => runsFrom(Object.values(d.txs), filamentMap, lootTypes, Date.now() - WINDOW_DAYS * DAY, r.t), [d.txs, filamentMap, lootTypes, r.t]);
  // Ships lost inside a pocket are part of what running them costs.
  const lost = useMemo(() => Object.values(d.killmails).filter((k) => k.kind === 'loss' && isAbyssalSystem(k.systemId) && Date.parse(k.time) >= Date.now() - WINDOW_DAYS * DAY), [d.killmails]);
  const lostIsk = lost.reduce((t, k) => t + netLoss(k), 0);

  const shown = (quotes ?? []).filter((q) => weather === 'all' || q.f.weather === weather);
  const held = (quotes ?? []).map((q) => ({ q, n: d.stock?.total?.[q.f.typeId] ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const minutes = stats.topFilament ? RUN_MINUTES[stats.topFilament.tier] : 18;
  const perHour = stats.perRun != null ? iskPerHour(stats.perRun, minutes) : null;
  const sign = (x: number | null) => ((x ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)');
  // The cell picked on the grid: yours to choose (kept in this browser), else the filament you run most.
  const [picked, setPicked] = useState<Cell | null>(readCell);
  const cell: Cell | null = picked ?? (stats.topFilament ? { tier: stats.topFilament.tier, weather: stats.topFilament.weather } : quotes ? { tier: 'Tranquil', weather: 'Dark' } : null);
  const pick = (c: Cell) => { setPicked(c); saveCell(c); };
  const cellQuote = cell ? (quotes ?? []).find((q) => q.f.tier === cell.tier && q.f.weather === cell.weather) ?? null : null;
  // Abyss Tracker, through the cloud: every cell's summary, and the fit opened from the picked one.
  const tracker = useTracker();
  const tIdx = (c: Cell) => TIERS.indexOf(c.tier);
  const trackerCell = (c: Cell) => trackerCellOf(tracker, tIdx(c), trackerWeather(c.weather));
  // The ship you're in, when it's one that runs the Abyss.
  const live = useRightNow();
  const here = live?.ship != null && ABYSS_SHIPS.some((s) => s.id === live.ship) ? live.ship : null;
  const [trackerFit, setTrackerFit] = useState<TrackerFit | null>(null);
  useEffect(() => { setTrackerFit(null); }, [cell?.tier, cell?.weather]);

  return (
    <>
      <div className="intro-row">
        <p>No API will tell you what a filament drops — ESI has no loot tables at all, so any “expected reward” here would be a number someone made up. What can be known is what every filament costs, and what <b>your</b> runs have actually paid, which your wallet already records.</p>
        <button type="button" className="btn primary tall" disabled={!!busy} onClick={load}><Tornado aria-hidden="true" />{quotes ? 'Check again' : 'Price the filaments'}</button>
      </div>
      {busy && <div className="busy-row" role="status"><span className="spinner keep-motion" /><span className="bt">{busy}</span></div>}

      {!quotes ? (
        !busy && <div className="dashed-empty"><p>Nothing priced yet. This reads the five filament market groups, prices every tier against the live Jita book, and then works out what your own runs have returned from transactions already synced. A few seconds.</p></div>
      ) : (
        <>
          <div className="g-300" style={{ gap: 14, animation: 'rise .4s ease-out' }}>
            <div className="sub-box" style={{ gridColumn: held.length ? undefined : '1 / -1' }}>
              <div className="panel-title">
                What your runs have paid
                <Tip title="What your runs have paid" text={`What your abyssal runs have actually paid over the last ${WINDOW_DAYS} days:\n\n• filaments you bought, against abyssal loot you sold, from your synced wallet;\n• ships lost, from your killmails, priced on the day.\n\nWhat it can’t see: loot doesn’t record which run it came from, so every tier is pooled; and loot you haven’t sold counts for nothing, so a good week can look flat until you sell it.`} />
              </div>
              {stats.runs === 0 ? (
                <p className="note" style={{ marginTop: 8 }}>No filament purchases in your last {WINDOW_DAYS} days of transactions. Buy filaments on the market rather than looting them and this fills in on its own — nothing to log.</p>
              ) : (
                <>
                  <div className="mini-tiles" style={{ marginTop: 10 }}>
                    {[
                      { l: 'Runs', v: units(stats.runs), n: `Filaments bought in ${WINDOW_DAYS} days` },
                      { l: 'Spent on filaments', v: iskBig(stats.spentOnFilaments), n: `${isk(stats.spentOnFilaments / stats.runs)} a run` },
                      { l: 'Loot sold', v: iskBig(stats.lootSold), n: `${units(stats.lootItems)} items, after sales tax`, c: 'var(--pos)' },
                      { l: 'Profit', v: iskBig(stats.profit), n: 'Loot sold less filaments bought', c: sign(stats.profit) },
                      { l: 'Per run', v: stats.perRun == null ? '–' : iskBig(stats.perRun), n: 'What one filament turned into', c: sign(stats.perRun) },
                      { l: 'Per hour', v: perHour == null ? '–' : iskBig(perHour), n: `At about ${minutes} min a run`, c: sign(perHour), tip: 'Your measured return per run, at the usual pace for that tier, so it can be set beside hauling and PI.\n\n• A pocket is three rooms on a 20-minute timer each, so the game sets the ceiling.\n• What varies is how fast you clear.' },
                      { l: 'Mostly', v: stats.topFilament ? `${stats.topFilament.tier} ${stats.topFilament.weather}` : '–', n: `${pct(stats.concentration, 0)} of your runs` },
                      { l: 'Ships lost', v: lost.length ? `−${iskBig(lostIsk)}` : 'None', n: lost.length ? `${lost.map((k) => nameOf(k.victim.shipTypeId ?? 0)).join(', ')}, net of insurance — from your killmails` : `No abyssal losses in ${WINDOW_DAYS} days`, c: lost.length ? 'var(--neg)' : undefined },
                    ].map((t) => (
                      <div key={t.l} className="mini-tile" style={cssVars({ '--c': t.c })}>
                        <div className="tile-l">{t.l}{t.tip && <Tip text={t.tip} title={t.l} />}</div>
                        <div className="tile-v">{t.v}</div>
                        <div className="tile-n">{t.n}</div>
                      </div>
                    ))}
                  </div>
                  <p className="note small" style={{ marginTop: 10 }}>
                    {stats.concentration >= 0.8
                      ? `Four runs in five were ${stats.topFilament?.tier} ${stats.topFilament?.weather}, so treat the per-run figure as that filament’s.`
                      : 'Your runs are spread across several filaments, so the per-run figure is an average of all of them rather than any one.'}
                  </p>
                </>
              )}
            </div>
            {held.length > 0 && (
              <div className="sub-box">
                <div className="panel-title">Filaments you already have</div>
                <p className="note small" style={{ margin: '6px 0 10px' }}>
                  From your synced assets — runs you can start without buying anything. Worth <b style={{ color: 'var(--figure)' }}>{iskBig(held.reduce((t, x) => t + x.n * (x.q.flipNet ?? 0), 0))}</b> if you sold them instead.
                </p>
                <div className="row tight">
                  {held.map((x) => (
                    <span key={x.q.f.typeId} style={{ padding: '4px 9px', fontSize: 12.5, border: '1px solid color-mix(in oklab,var(--acc) 40%,transparent)', background: 'color-mix(in oklab,var(--acc) 8%,transparent)' }}>
                      <b className="mono" style={{ color: 'var(--acc)', fontWeight: 500 }}>{x.n}×</b> {x.q.f.tier} {x.q.f.weather}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="col" style={{ gap: 12 }}>
            <div className="panel-title">Tier and weather</div>
            <p className="note small" style={{ margin: 0 }}>Every filament by how hard it is and what its weather does, with what it costs at Jita and how many you’ve run. Pick one to see what the game says about it and what runs it.</p>
            <AbyssMatrix quotes={quotes} runs={runsAll} cell={cell} onCell={pick}
              cellNote={(c) => { const t = trackerCell(c); return t?.cruiser ? `cruiser ${iskBig(t.cruiser.median)}` : null; }} />
            {cellQuote && cell && (
              <AbyssCell q={cellQuote} runs={runsAll[cellQuote.f.typeId] ?? 0}>
                <TrackerPanel tracker={tracker} tier={tIdx(cell)} weather={trackerWeather(cell.weather)} fitId={trackerFit?.id ?? null} onPickFit={setTrackerFit} />
                {trackerFit && <TrackerFitView fit={trackerFit} tier={tIdx(cell)} weather={trackerWeather(cell.weather)} />}
              </AbyssCell>
            )}
          </div>

          {cell && (
            <div className="col" style={{ gap: 12 }}>
              <div className="panel-title">Ships and fits, and what comes next</div>
              <p className="note small" style={{ margin: 0 }}>
                The ships that run the Abyss, left to right by the tier each is first run at: frigates three to a pocket (three
                filaments’ loot), destroyers two, then the cruisers, the Gila and each weather’s specialists.
                {' '}The ones marked with a crosshair are among the most run at {cell.tier} {cell.weather}, the cell picked above.
                {here != null ? ' The ship you’re in glows; the paths out of it are your next steps.' : ''} Click a ship for its fits.
              </p>
              <AbyssTree here={here} tracker={tracker} tier={tIdx(cell)} weather={trackerWeather(cell.weather)} />
            </div>
          )}

          <div className="row wide">
            <Seg label="Which weather to show" value={weather} onChange={setWeather} size="md" options={[{ v: 'all' as const, label: 'All' }, ...WEATHERS.map((w) => ({ v: w, label: w }))]} />
            <span className="note small">Ordered easiest first. The ladder is {TIERS.join(' → ')}.</span>
          </div>
          <div className="tbl-scroll" style={{ maxHeight: 420, border: '1px solid var(--line-3)' }}>
            <table className="tbl compact" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <Th left>Filament</Th><Th left>Tier</Th>
                  <Th tip="What one filament costs to buy outright at Jita right now, ignoring any single mispriced listing.">Costs</Th>
                  <Th tip={'What you’d net by selling the filament instead of running it, after broker fee and sales tax.\n\n• Your loot has to sell for more than this, or the run wasn’t worth doing.\n• That holds for a filament you looted too: selling it was still the alternative.'}>A run must beat</Th>
                  <Th tip="The gap between buying one and selling it straight back: the spread plus both charges. Small on the busy tiers, wide on the thin ones.">Cost of flipping</Th>
                  <Th tip="How many of this filament change hands at Jita on an average day. A thin one is awkward to buy in quantity and awkward to flip.">Traded a day</Th>
                  <th scope="col" style={{ color: 'var(--faint-2)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((q) => (
                  <tr key={q.f.typeId} className="hover">
                    <td className="l name" style={{ fontWeight: 400 }}>{q.f.name}</td>
                    <td className="l"><span style={{ display: 'flex', flexDirection: 'column' }}><span className="lbl" style={{ color: 'var(--acc)', fontSize: 12.5, letterSpacing: 0, textTransform: 'none' }}>{q.f.tier}</span><span className="sub">{q.f.weather}</span></span></td>
                    <td>{q.cost == null ? <span className="faint">–</span> : isk(q.cost)}</td>
                    <td className="pos">{q.flipNet == null ? <span className="faint">–</span> : isk(q.flipNet)}</td>
                    <td style={{ color: 'var(--neg-l)' }}>{q.cost != null && q.flipNet != null ? isk(q.cost - q.flipNet) : <span className="faint">–</span>}</td>
                    <td>{q.perDay == null ? <span className="faint">–</span> : units(Math.round(q.perDay))}</td>
                    <td><OpenInGame typeId={q.f.typeId} name={q.f.name} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SkillPanel title="Skills this wants" needs={ABYSSAL_SKILLS}
        note="Hull and weapon skills depend on what you fly, so they are not listed here — these are the support skills every abyssal fit leans on whatever the hull. Tiers above Raging punish a thin tank far more than they reward a fat gun." />

      <div>
        <div className="panel-title" style={{ marginBottom: 8 }}>Worth having open</div>
        <div className="col" style={{ gap: 8 }}>
          {ABYSSAL_LINKS.map((l) => (
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
