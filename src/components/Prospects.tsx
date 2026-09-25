import { useCallback, useEffect, useMemo, useState } from 'react';
import { ago, isk, iskBig, iskSigned, pct, plainNum, units } from '../lib/format';
import { resolveNames } from '../lib/market';
import { absorbable, DEFAULT_FILTERS, FIRST_DIR, passesGate, sortProspects, type Sort, type SortKey } from '../lib/prospects';
import { clearScan, coverage, loadCache, rankProspects, runScan, stopScan, useScanState, type ScanCache } from '../lib/scan';
import { update, useData } from '../lib/store';
import { addToWatchlist, startPosition } from '../lib/actions';
import { navigate, useNow } from '../lib/hooks';
import type { Prospect, ProspectFilters, ProspectWarning } from '../lib/types';
import { useTypeName } from './common';
import { Sparkline } from './Sparkline';

const WARNING: Record<ProspectWarning, { short: string; why: string }> = {
  thin: { short: 'Thin', why: 'Fewer than five orders on one side. The spread is wide because almost nobody is standing there, and it can vanish the moment one person moves.' },
  fluke: { short: 'Fluke', why: 'Today’s gap is much wider than this item usually trades in a day. Expect it to close before your order fills.' },
  falling: { short: 'Falling', why: 'The 30-day average price is more than 10% below the 90-day. You would be buying into a slide.' },
  crowded: { short: 'Crowded', why: 'Hundreds of listings against very few trades. You would be joining a queue, not a market.' },
};

/** The filters that are typed into. demoteFlagged is a tick box, so it is not one of these. */
type NumberFilter = Exclude<keyof ProspectFilters, 'demoteFlagged'>;

/** The sortable columns, in table order. Actions is not one of them. */
/** How long the money is in, in a unit that reads naturally. */
function flip(days: number): string {
  if (!Number.isFinite(days)) return '–';
  if (days < 1 / 24) return '< 1 h';
  if (days < 1) return `${Math.round(days * 24)} h`;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}

const COLUMNS: [SortKey, string][] = [
  ['name', 'Item'], ['roi', 'Return'], ['canTake', 'Can take'], ['flip', 'Flips in'],
  ['net', 'Profit per unit'], ['trades', 'Trades a day'], ['days', 'Days traded'],
  ['volume', 'Volume, 30 days'], ['iskPerDay', 'ISK per day'], ['capital', 'ISK tied up'],
  ['flags', 'Flags'],
];

const FILTER_FIELDS: { key: NumberFilter; label: string; hint: string }[] = [
  { key: 'budget', label: 'ISK I want to put into one item', hint: 'Only items that can absorb this are shown' },
  { key: 'horizonDays', label: 'And be out within (days)', hint: 'How long you’ll leave the money in it' },
  { key: 'minTrades', label: 'Trades a day, at least', hint: 'Median over the last 30 days' },
  { key: 'minDays', label: 'Days traded out of 30, at least', hint: 'Days with any trade at all' },
  { key: 'minRoi', label: 'Return, at least (%)', hint: 'Net of your broker fee and sales tax' },
];

export function Prospects() {
  const d = useData();
  const nameOf = useTypeName();
  const scan = useScanState();
  const [cache, setCache] = useState<ScanCache | null>(null);
  const [f, setF] = useState<ProspectFilters>(() => ({
    ...DEFAULT_FILTERS,
    budget: d.meta.walletBalance && d.meta.walletBalance > 1e6 ? Math.round(d.meta.walletBalance) : DEFAULT_FILTERS.budget,
  }));
  const [open, setOpen] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>({ key: 'roi', dir: 'desc' });
  const now = useNow();
  // Clicking a new column opens it at its interesting end; clicking the current one flips it.
  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: FIRST_DIR[key] }));
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => setCache(await loadCache()), []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (scan.phase === 'done') reload(); }, [scan.phase, reload]);
  // A deep run writes away every so often; pick those up so the table fills while it works.
  useEffect(() => { if (scan.saved > 0) reload(); }, [scan.saved, reload]);

  const ranked = useMemo(() => (cache ? rankProspects(cache, d.settings, f) : []), [cache, d.settings, f]);
  const rows = useMemo(
    () => sortProspects(ranked, sort, nameOf, f.demoteFlagged),
    // nameOf closes over d.names, which is what actually changes the name ordering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ranked, sort, f.demoteFlagged, d.names],
  );
  const cov = cache ? coverage(cache) : { candidates: 0, checked: 0, priced: 0, pricedAt: null };
  // The most any scanned item could swallow, so a nil return can say why rather than just "none".
  const biggest = useMemo(() => {
    if (!cache) return 0;
    let best = 0;
    for (const st of Object.values(cache.stats)) {
      if (!passesGate(st, f)) continue;
      best = Math.max(best, absorbable(st, d.settings.share, f.horizonDays));
    }
    return best;
  }, [cache, f, d.settings.share]);

  // Names for anything the scan turned up that this browser hasn't seen before.
  useEffect(() => {
    const missing = rows.map((r) => r.typeId).filter((id) => !d.names[id]).slice(0, 500);
    if (!missing.length) return;
    let live = true;
    resolveNames(missing)
      .then((names) => { if (live && Object.keys(names).length) update((x) => ({ names: { ...x.names, ...names } })); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [rows, d.names]);

  const busy = scan.phase === 'sampling' || scan.phase === 'liquidity' || scan.phase === 'pricing';
  // Worked out from the rate so far, and only once there is enough of it to mean anything.
  const left = (() => {
    if (!busy || scan.done < 20 || !scan.startedAt) return null;
    const per = (Date.now() - scan.startedAt) / scan.done;
    const secs = ((scan.total - scan.done) * per) / 1000;
    if (secs < 90) return `${Math.max(1, Math.round(secs))} sec`;
    if (secs < 5400) return `${Math.round(secs / 60)} min`;
    return `${(secs / 3600).toFixed(1)} h`;
  })();
  const set = (k: NumberFilter) => (v: string) => {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    setF((x) => ({ ...x, [k]: Number.isFinite(n) ? (k === 'minRoi' ? n / 100 : n) : 0 }));
  };
  const valueOf = (k: NumberFilter) => (k === 'minRoi' ? plainNum(f.minRoi * 100) : String(f[k]));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Prospects</h1>
          <p>
            Items worth station trading at Jita 4-4, found by sampling the order book, then checking how often each one
            really changes hands. Anything that doesn’t trade on most days is left out, however good the margin looks —
            a wide spread on something that sells once a month isn’t a trade you can repeat.
          </p>
        </div>
        <div className="row">
          {busy ? (
            <button className="btn" onClick={stopScan}>Stop {scan.depth === 'deep' ? 'deep scan' : 'scan'}</button>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => runScan(d.settings, f, 'quick')}>Quick scan</button>
              <button
                className="btn" onClick={() => runScan(d.settings, f, 'deep')}
                title="Samples three times as much of the order book and works through every candidate it finds. Takes a while — leave it running."
              >
                Deep scan
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="fields">
          {FILTER_FIELDS.map(({ key, label, hint }) => (
            <div className="field" key={key}>
              <label htmlFor={`p-${key}`}>{label}</label>
              <input id={`p-${key}`} type="text" inputMode="decimal" value={valueOf(key)} onChange={(e) => set(key)(e.target.value)} />
              <span className="hint">{hint}</span>
            </div>
          ))}
        </div>
        <label className="check" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={f.demoteFlagged} onChange={(e) => setF((x) => ({ ...x, demoteFlagged: e.target.checked }))} />
          <span>Push flagged items down the list, the more flags the further down</span>
        </label>
      </div>

      {busy && (
        <p className="notice" role="status">
          <span className="spinner" aria-hidden="true" />
          {scan.message}
          {scan.total > 0 && <> <strong>{units(scan.done)}</strong> of {units(scan.total)}.</>}
          {left && <> About {left} left.</>}
          {scan.failed > 0 && <span className="muted small"> {units(scan.failed)} couldn’t be read.</span>}
          {scan.depth === 'deep' && <span className="muted small"> You can leave this running, or stop and keep what it has found.</span>}
        </p>
      )}
      {scan.error && <p className="notice err" role="alert">{scan.error}</p>}
      {msg && <p className="notice" role="status">{msg}</p>}

      {!busy && cov.checked > 0 && (
        <p className="small muted" style={{ margin: '0 0 14px' }}>
          Checked {units(cov.checked)} of about {units(cov.candidates)} candidates, {units(cov.priced)} priced against the live book.
          {cov.pricedAt && <> Prices from <strong>{ago(cov.pricedAt, now)}</strong>; a scan refreshes any over an hour old.</>}
          {cov.priced === 0
            ? ' A quick scan will price the best of them — it keeps the trading history already gathered, so it only takes a moment.'
            : cov.checked < cov.candidates && ' Scan again to widen the net.'}
          {' '}
          <button
            className="link-btn danger" onClick={async () => { await clearScan(); await reload(); setOpen(null); }}
            title="Deletes only what the scan found. Your trades, positions and settings are untouched."
          >Clear these results</button>
        </p>
      )}

      {busy && !rows.length ? null
        : !cov.checked ? (
        <p className="empty">
          Nothing scanned yet. A <strong>quick scan</strong> samples 20 pages of the Jita order book, checks the trading
          history of the busiest few hundred items, and prices the ones that trade steadily — about a minute and a half.
          A <strong>deep scan</strong> samples three times as much and works through every candidate it finds, which
          takes considerably longer but leaves nothing to come back for. Either way, results appear as they are found and
          are kept, so stopping early costs you nothing.
        </p>
      ) : !rows.length ? (
        <p className="empty">
          {biggest > 0 && biggest < f.budget ? (
            <>
              Nothing scanned so far can absorb {iskBig(f.budget)} within {plainNum(f.horizonDays)} day
              {f.horizonDays === 1 ? '' : 's'}. The busiest market found so far could take about{' '}
              <strong>{iskBig(biggest)}</strong> in that time. Put in less, allow longer, or run a deep scan — the
              markets that swallow billions are the busiest ones, and a quick scan only skims the top of the book.
            </>
          ) : biggest >= f.budget ? (
            <>
              Some scanned items are busy enough to absorb {iskBig(f.budget)}, but none of the{' '}
              {units(cov.priced)} priced against the live book so far do — pricing only covers the best of what has
              been checked. Scan again to price more of them, or loosen the other filters.
            </>
          ) : (
            <>Nothing scanned so far clears these filters. Loosen the return or the trades a day, allow a longer
              horizon, or scan again to check more of the market.</>
          )}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data wide">
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th
                    key={key} scope="col"
                    aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button" className={'sort' + (sort.key === key ? ' on' : '')} onClick={() => sortBy(key)}
                      title={`Sort by ${label}`}
                    >
                      {label}<span className="arrow" aria-hidden="true">{sort.key === key ? (sort.dir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}</span>
                    </button>
                  </th>
                ))}
                <th scope="col"><span className="opt">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => <Row key={p.typeId} p={p} name={nameOf(p.typeId)} open={open === p.typeId}
                onToggle={() => setOpen(open === p.typeId ? null : p.typeId)} onMsg={setMsg} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ p, name, open, onToggle, onMsg }: { p: Prospect; name: string; open: boolean; onToggle: () => void; onMsg: (s: string) => void }) {
  const s = p.stats;
  return (
    <>
      <tr>
        <td className="name">
          <button className="link-btn" aria-expanded={open} onClick={onToggle}>{name}</button>
        </td>
        <td className="pos">{pct(p.roi, 1)}</td>
        <td title={`${plainNum(Math.round(s.unitsPerDay))} units trade here a day`}>{iskBig(p.canTake)}</td>
        <td>{flip(p.daysToFlip)}</td>
        <td className="pos">{iskSigned(p.net)}</td>
        <td>{plainNum(Math.round(s.tradesPerDay))}</td>
        <td>{s.daysTraded} of 30</td>
        <td><Sparkline values={s.spark} label={`Daily volume over 30 days, ${s.daysTraded} days with trades`} /></td>
        <td className="pos">{iskBig(p.iskPerDay)}</td>
        <td>{iskBig(p.capital)}</td>
        <td>
          {p.warnings.length
            ? p.warnings.map((w) => <span key={w} className="flag" title={WARNING[w].why}>{WARNING[w].short}</span>)
            : <span className="muted">–</span>}
        </td>
        <td>
          <button className="link-btn" onClick={() => navigate(`calculator?type=${p.typeId}`)} aria-label={`Open ${name} in the calculator`}>Calculator</button>
          <button className="link-btn" onClick={() => onMsg(addToWatchlist(p.typeId) ? `Added ${name} to your watchlist.` : `${name} is already on your watchlist.`)}>Watch</button>
          <button className="link-btn" onClick={() => navigate(`positions/${startPosition(p.typeId).id}`)} aria-label={`Start trading ${name}`}>Trade</button>
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={10}>
            <dl className="figures">
              <div className="stat"><dt>Your prices</dt><dd>{isk(p.buy)} buy, {isk(p.sell)} sell<small>One legal step inside {isk(p.bestBuy)} / {isk(p.bestSell)}</small></dd></div>
              <div className="stat"><dt>Spread</dt><dd>{pct(p.spreadPct, 1)}<small>Usually {pct(s.dailyRange, 1)} in a day</small></dd></div>
              <div className="stat"><dt>Competition</dt><dd>{units(p.buyOrders)} buy, {units(p.sellOrders)} sell<small>{units(p.topSellVol)} units at the best sell</small></dd></div>
              <div className="stat"><dt>Steadiness</dt><dd>{pct(s.spikiness, 0)}<small>Share of the month’s volume on its busiest day</small></dd></div>
              <div className="stat"><dt>Price trend</dt><dd className={s.trend >= 0 ? 'pos' : 'neg'}>{pct(s.trend, 1)}<small>30-day average against the 90-day</small></dd></div>
              <div className="stat"><dt>Position modelled</dt><dd>{units(p.qty)} units<small>Of {units(Math.round(s.unitsPerDay))} traded a day</small></dd></div>
            </dl>
            {p.warnings.map((w) => <p key={w} className="small muted" style={{ margin: '6px 0 0' }}><strong className="warn">{WARNING[w].short}.</strong> {WARNING[w].why}</p>)}
          </td>
        </tr>
      )}
    </>
  );
}
