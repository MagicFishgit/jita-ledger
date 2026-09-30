import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { TIERS } from '../../lib/abyssal';
import { TRACKER_WEATHER, type TrackerCell, type TrackerFit, type TrackerFitDetail } from '../../lib/abyssTracker';
import { cloudAbyss, cloudAbyssFit, cloudEnabled, useCloud } from '../../lib/cloud';
import { eftToTier, parseEft } from '../../lib/eft';
import type { Tier } from '../../lib/fits';
import { ago, iskBig, pct, units } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { jitaBook, resolveIds } from '../../lib/market';
import { typeKind } from '../../lib/universe';
import { fitCosts, FitActions, FitGrid, FitSkills, useFitData } from '../FitParts';
import { ItemIcon } from '../ui';

/**
 * Abyss Tracker's figures on the Abyssal page: for the tier and weather picked, the runs players logged there, the
 * median loot a pocket by hull size, and the fits most run there, each opening to the whole fit (from its EFT) with what
 * it measured: runs, survival, ISK a run and an hour, and how many runs pay for it. Read by the cloud (browsers can't:
 * no CORS), daily for the summaries and on demand for a fit.
 */

/**
 * Abyss Tracker's figures as the page has them: the cloud copy off in this browser, still reading, a failed read (a cloud
 * a version behind answers 404), or every cell the cloud holds, which is none until its first hourly read after a deploy.
 */
export type TrackerState = { status: 'off' } | { status: 'loading' } | { status: 'failed'; error: string } | { status: 'ok'; cells: TrackerCell[] };

/** Every tier and weather's summary, once per page. */
export function useTracker(): TrackerState {
  const cloud = useCloud();
  const [st, setSt] = useState<TrackerState>(() => (cloudEnabled() ? { status: 'loading' } : { status: 'off' }));
  useEffect(() => {
    if (!cloudEnabled()) { setSt({ status: 'off' }); return; }
    if (!cloud.started) return;
    let alive = true;
    cloudAbyss().then((cells) => { if (alive) setSt({ status: 'ok', cells: Array.isArray(cells) ? cells : [] }); })
      .catch((e) => { if (alive) setSt({ status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [cloud.started]);
  return st;
}

/** One tier and weather's summary (tracker enums), when the cloud has it. */
export const trackerCellOf = (t: TrackerState, tier: number, weather: number) =>
  (t.status === 'ok' ? t.cells.find((x) => x.tier === tier && x.weather === weather) ?? null : null);

/** What to say instead of the figures when there are none for this cell; null when there are. */
function trackerGap(t: TrackerState, cell: TrackerCell | null): string | null {
  if (t.status === 'off') return 'Abyss Tracker’s figures come through the cloud copy, which isn’t on in this browser (Settings → Your data).';
  if (t.status === 'loading') return 'Reading Abyss Tracker’s figures from the cloud…';
  if (t.status === 'failed') return `Couldn’t read Abyss Tracker’s figures from the cloud: ${t.error}. If the cloud was updated in the last hour, they come with its next hourly run.`;
  if (!cell) return 'The cloud hasn’t read this tier and weather from Abyss Tracker yet. It reads them once an hour, at 7 past, when a day old, so they’ll be here after its next run.';
  return null;
}

const HULL_SAID = { frigate: 'Frigates, a pocket of three filaments', destroyer: 'Destroyers, a pocket of two', cruiser: 'A cruiser, one filament' } as const;

export function TrackerPanel({ tracker, tier, weather, onPickFit, fitId }: { tracker: TrackerState; tier: number; weather: number; onPickFit: (f: TrackerFit | null) => void; fitId: string | null }) {
  const now = useNow(60_000);
  const cell = trackerCellOf(tracker, tier, weather);
  const gap = trackerGap(tracker, cell);
  if (gap || !cell) return <p className="note small" style={{ margin: 0 }}>{gap}</p>;
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="lbl">What players logged here (Abyss Tracker)</div>
      <div className="kv-mini" style={{ maxWidth: 640 }}>
        <span>Runs logged</span><b>{units(cell.runs)}, all time</b>
        {(['frigate', 'destroyer', 'cruiser'] as const).map((k) => cell[k] && (
          <span key={k} style={{ display: 'contents' }}>
            <span data-tip="The median loot a pocket, with Abyss Tracker’s band around it. Loot isn’t profit: the filament and any ship lost come off it.">{HULL_SAID[k]}</span>
            <b>{iskBig(cell[k]!.median)} a pocket <span className="faint">({iskBig(cell[k]!.low)}–{iskBig(cell[k]!.high)})</span></b>
          </span>
        ))}
        {cell.drops.length > 0 && <><span>Drops most often</span><b style={{ whiteSpace: 'normal' }}>{cell.drops.slice(0, 3).map((x) => `${x.name} (${Math.round(x.rate)}% of runs)`).join(', ')}</b></>}
      </div>
      {cell.fits.length > 0 && (
        <>
          <div className="lbl" style={{ marginTop: 4 }}>The fits most run here</div>
          <div className="tracker-fits">
            {cell.fits.map((f) => (
              <button key={f.id} type="button" className={'tracker-fit' + (fitId === f.id ? ' sel' : '')} aria-expanded={fitId === f.id} onClick={() => onPickFit(fitId === f.id ? null : f)}>
                <ItemIcon id={f.shipId} />
                <span className="tf-name"><b>{f.shipName}</b><span className="sub">{f.name || 'Unnamed fit'}</span></span>
                <span className="tf-num">{units(f.runs)} runs</span>
                <span className="tf-num faint">{f.dps >= 1 ? `${Math.round(f.dps)} DPS` : '– DPS'} · {f.ehpK.toFixed(1)}k EHP · {iskBig(f.cost)}</span>
                <ChevronRight className="chev" aria-hidden="true" />
              </button>
            ))}
          </div>
        </>
      )}
      <p className="note small" style={{ margin: 0, color: 'var(--faint)' }}>
        <a href={`https://abysstracker.com/info-page/${cell.tier}/${cell.weather}`} target="_blank" rel="noopener noreferrer">Abyss Tracker</a>, read by the cloud {ago(new Date(cell.at).toISOString(), now)}. Runs are logged by the players who use it, so it leans to dedicated runners and deaths go under-reported;
        frigate and destroyer figures are for the whole pocket. DPS, EHP and cost are its own, at all skills V.
      </p>
    </div>
  );
}

/** A fit to show: Abyss Tracker's summary when it came from a cell's list, or only its ID and name when a tier names it. */
export type FitRef = Pick<TrackerFit, 'id' | 'name' | 'shipId' | 'shipName'> & Partial<Omit<TrackerFit, 'id' | 'name' | 'shipId' | 'shipName'>>;

/** One Abyss Tracker fit, whole: its modules from the EFT (priced, copyable, saveable) and what it measured where it ran. */
export function TrackerFitView({ fit, tier, weather }: { fit: FitRef; tier: number; weather: number }) {
  const [detail, setDetail] = useState<TrackerFitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cats, setCats] = useState<Record<string, number> | null>(null);
  const [hullPrice, setHullPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!cloudEnabled()) return;
    let alive = true;
    setDetail(null); setError(null); setCats(null);
    cloudAbyssFit(fit.id).then((x) => { if (alive) setDetail(x); }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    jitaBook(fit.shipId).then((b) => { if (alive) setHullPrice(b.bestSell ?? null); }).catch(() => undefined);
    return () => { alive = false; };
  }, [fit.id, fit.shipId]);
  const parsed = useMemo(() => (detail ? parseEft(detail.eft) : null), [detail]);
  // What follows the rigs is sorted by its category, read from ESI.
  useEffect(() => {
    if (!parsed) return;
    let alive = true;
    (async () => {
      const names = [...new Set(parsed.rest.map((x) => x.name))];
      const ids = names.length ? await resolveIds(names).catch(() => null) : null;
      const out: Record<string, number> = {};
      await Promise.all((ids?.inventory_types ?? []).map(async (t) => { const k = await typeKind(t.id).catch(() => null); if (k) out[t.name] = k.category; }));
      if (alive) setCats(out);
    })();
    return () => { alive = false; };
  }, [parsed]);
  const tierFit: Tier | null = useMemo(() => (parsed && cats
    ? eftToTier(parsed, (n) => cats[n] ?? null, { key: 'solid', what: parsed.name, source: `Abyss Tracker, “${fit.name || 'unnamed'}”${fit.runs != null ? `, ${units(fit.runs)} runs here` : ''}` })
    : null), [parsed, cats, fit.name, fit.runs]);
  const link = <a href={`https://abysstracker.com/fit/${fit.id}`} target="_blank" rel="noopener noreferrer">on Abyss Tracker</a>;
  if (!cloudEnabled()) return <p className="note small" style={{ margin: 0 }}>The fit comes from Abyss Tracker through the cloud copy, which isn’t on in this browser (Settings → Your data). It’s {link}.</p>;
  if (error) return <p className="note small" style={{ margin: 0, color: 'var(--neg-l)' }}>Couldn’t read that fit: {error}. It’s {link}.</p>;
  if (!detail || !tierFit) return <p className="note small" style={{ margin: 0 }}>Reading the fit from Abyss Tracker…</p>;
  return <TrackerFitBody fit={fit} detail={detail} tierFit={tierFit} hullPrice={hullPrice} tier={tier} weather={weather} />;
}

function TrackerFitBody({ fit, detail, tierFit, hullPrice, tier, weather }: { fit: FitRef; detail: TrackerFitDetail; tierFit: Tier; hullPrice: number | null; tier: number; weather: number }) {
  const data = useFitData(fit.shipId, tierFit, null);
  const { total } = fitCosts(tierFit, null, data, hullPrice);
  const here = detail.perf?.cells.find((c) => c.tier === tier && c.weather === weather) ?? null;
  const cellSaid = (t: number, w: number) => `T${t} ${TIERS[t]} ${TRACKER_WEATHER[w]}`;
  return (
    <section className="abyss-fit" aria-label={fit.name}>
      <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <img src={`https://images.evetech.net/types/${fit.shipId}/render?size=64`} alt="" width={48} height={48} style={{ background: '#0b1622' }} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <span style={{ minWidth: 0, flex: 1 }}>
          {(fit.shipClass || fit.tags?.length) && <span className="lbl" style={{ display: 'block' }}>{[fit.shipClass, ...(fit.tags ?? []).slice(0, 4)].filter(Boolean).join(' · ')}</span>}
          <span style={{ fontSize: 16, color: 'var(--ink)' }}>{fit.shipName}: {fit.name || 'unnamed fit'}</span>
        </span>
        <a className="link-btn" href={`https://abysstracker.com/fit/${fit.id}`} target="_blank" rel="noopener noreferrer">On Abyss Tracker <ExternalLink aria-hidden="true" style={{ width: 12, height: 12 }} /></a>
      </div>
      <div className="kv-mini" style={{ maxWidth: 640 }}>
        {here ? <>
          <span>At {cellSaid(tier, weather)}</span><b>{units(here.runs)} runs, {pct(here.survival / 100, 1)} survived{here.failed ? ` (${units(here.failed)} lost)` : ''}</b>
          <span>Made there</span><b style={{ color: 'var(--pos)' }}>{here.medianIsk != null ? `${iskBig(here.medianIsk)} a run (median)` : `${iskBig(here.avgIsk)} a run (average)`}{here.iskPerHour != null ? `, about ${iskBig(here.iskPerHour)} an hour` : ''}</b>
          {here.breakEvenRuns != null && <><span data-tip="Abyss Tracker’s count of runs at this tier and weather whose median profit pays for the fit.">Pays for itself</span><b>{here.breakEvenRuns <= 1 ? 'in its first run' : `in about ${units(here.breakEvenRuns)} runs`}</b></>}
        </> : <><span>At {cellSaid(tier, weather)}</span><b>Not run there, in what Abyss Tracker has</b></>}
        {detail.perf?.medianRunTime && <><span>A run takes</span><b>{detail.perf.medianRunTime} (median, everywhere it ran)</b></>}
        <span>Costs</span><b>{total != null ? `${iskBig(total)} at Jita now` : data ? '–' : '…'}{fit.cost ? ` (Abyss Tracker: ${iskBig(fit.cost)})` : ''}</b>
        {fit.ehpK != null && <><span>Abyss Tracker’s figures</span><b>{(fit.dps ?? 0) >= 1 ? `${Math.round(fit.dps!)} DPS` : 'no DPS figure (its engine gave none)'}, {fit.ehpK.toFixed(1)}k EHP{fit.speed ? `, ${units(Math.round(fit.speed))} m/s` : ''}</b></>}
      </div>
      {detail.perf && detail.perf.cells.length > (here ? 1 : 0) && (
        <p className="note small" style={{ margin: 0 }}>{here ? 'Also run at' : 'Run at'}: {detail.perf.cells.filter((c) => !(c.tier === tier && c.weather === weather)).slice(0, 6).map((c) => `${cellSaid(c.tier, c.weather)} (${units(c.runs)}, ${pct(c.survival / 100, 0)} survived)`).join('; ')}.</p>
      )}
      <FitGrid fit={tierFit} crystal={null} data={data} />
      <FitActions hullId={fit.shipId} hullName={fit.shipName} label={`Abyss ${(fit.name || cellSaid(tier, weather)).slice(0, 36)}`} fit={tierFit} crystal={null} data={data} total={total} />
      <FitSkills data={data} />
      <p className="note small" style={{ margin: 0, color: 'var(--faint)' }}>Fit: {tierFit.source}; read {ago(new Date(detail.at).toISOString(), Date.now())}. The cargo is what its pilot carries (ammunition, filaments); Multibuy takes it all, so trim what you don’t need.</p>
    </section>
  );
}
