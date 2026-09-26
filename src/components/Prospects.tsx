import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownWideNarrow, ChevronRight, Flag as FlagIcon, Radar, RefreshCw, SatelliteDish, ScanSearch, ShieldAlert,
  SlidersHorizontal, Square, Telescope,
} from 'lucide-react';
import { ago, isk, iskBig, iskSigned, pct, plainNum, units } from '../lib/format';
import { resolveNames } from '../lib/market';
import { absorbable, DEFAULT_FILTERS, FIRST_DIR, passesGate, sortProspects, type Sort, type SortKey } from '../lib/prospects';
import { clearScan, coverage, loadCache, rankProspects, runScan, stopScan, useScanState, type ScanCache } from '../lib/scan';
import { COMPETITION_PIVOT } from '../lib/split';
import { update, useData } from '../lib/store';
import { addToWatchlist, startPosition } from '../lib/actions';
import { navigate, useNow } from '../lib/hooks';
import { confirmAsk } from '../lib/confirm';
import { toast } from '../lib/toast';
import type { Prospect, ProspectFilters, ProspectWarning } from '../lib/types';
import { OpenInGame, useTypeName } from './common';
import { Busy, Check, Chip, Empty, Expander, Flag, Guide, ItemIcon, PageHead, SortTh, Sparkline } from './ui';

export const WARNING: Record<ProspectWarning, { short: string; why: string }> = {
  wall: { short: 'Wall', why: 'The best price on one side holds more than half the visible stock, and more than three days of what the item trades. Walls are often placed to make a spread look stable, then pulled once traders pile in behind them.' },
  escrow: { short: 'Escrow bait', why: 'A buy order well above anything paid for this all month. The classic margin-trading scam: the buyer has only a sliver of that ISK, and the order vanishes the moment you haul stock in to fill it.' },
  spike: { short: 'Spike', why: 'One recent day traded more than five times the usual volume at an unusual price. Someone may be moving the price to lure traders in.' },
  thin: { short: 'Thin', why: 'Fewer than five orders on one side. The spread is wide because almost nobody is standing there, and it can vanish the moment one person moves.' },
  fluke: { short: 'Fluke', why: 'Today’s gap is much wider than this item usually trades in a day. Expect it to close before your order fills.' },
  falling: { short: 'Falling', why: 'The 30-day average price is more than 10% below the 90-day. You would be buying into a slide.' },
  crowded: { short: 'Crowded', why: 'Hundreds of listings against very few trades. You would be joining a queue, not a market.' },
};

/** How long the money is in, in a unit that reads naturally. */
export function flip(days: number): string {
  if (!Number.isFinite(days)) return '–';
  if (days < 1 / 24) return '< 1 h';
  if (days < 1) return `${Math.round(days * 24)} h`;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}

const COLUMNS: [SortKey, string, string?][] = [
  ['roi', 'Return'],
  ['roiDay', 'Return / day', 'Return divided by the days your ISK is tied up. The default sort — it rewards items that turn round fast.'],
  ['canTake', 'Can take', 'ISK this item can absorb inside your horizon at your share of the side that fills slower.'],
  ['flip', 'Flips in'], ['net', 'Profit / unit'], ['trades', 'Trades a day'], ['days', 'Days traded'],
  ['volume', 'Volume, 30 d'], ['iskPerDay', 'ISK per day'], ['capital', 'ISK tied up'], ['flags', 'Flags'],
];

type NumberFilter = 'budget' | 'horizonDays' | 'minTrades' | 'minDays' | 'minRoi';
const FILTER_FIELDS: { key: NumberFilter; label: string; hint: string }[] = [
  { key: 'budget', label: 'ISK per item', hint: 'The ISK you want to put into one item. Only items that can absorb this are shown.' },
  { key: 'horizonDays', label: 'Out within, days', hint: 'How long you’ll leave the money in it.' },
  { key: 'minTrades', label: 'Trades / day ≥', hint: 'Median trades a day over the last 30 days.' },
  { key: 'minDays', label: 'Days traded ≥', hint: 'Days out of 30 with any trade at all.' },
  { key: 'minRoi', label: 'Return ≥ %', hint: 'Net of your broker fee and sales tax.' },
];

const PREFS_KEY = 'jita-ledger:prospects';
function loadPrefs(wallet: number | undefined): { f: ProspectFilters; sort: Sort } {
  const base = { ...DEFAULT_FILTERS, demoteFlagged: true, budget: wallet && wallet > 1e6 ? Math.round(wallet) : DEFAULT_FILTERS.budget };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (p?.f) return { f: { ...base, ...p.f, partial: false }, sort: p.sort?.key ? p.sort : { key: 'roiDay', dir: 'desc' } };
  } catch { /* private window */ }
  return { f: base, sort: { key: 'roiDay', dir: 'desc' } };
}

export function Prospects() {
  const d = useData();
  const nameOf = useTypeName();
  const scan = useScanState();
  const now = useNow(30_000);
  const [cache, setCache] = useState<ScanCache | null>(null);
  const [init] = useState(() => loadPrefs(d.meta.walletBalance));
  const [f, setF] = useState<ProspectFilters>(init.f);
  const [sort, setSort] = useState<Sort>(init.sort);
  const [text, setText] = useState<Record<NumberFilter, string>>(() => ({
    budget: Math.round(init.f.budget).toLocaleString('en-US'), horizonDays: plainNum(init.f.horizonDays),
    minTrades: plainNum(init.f.minTrades), minDays: plainNum(init.f.minDays), minRoi: plainNum(init.f.minRoi * 100),
  }));
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ f, sort })); } catch { /* private window */ } }, [f, sort]);

  // Clicking a new column opens it at its interesting end; clicking the current one flips it.
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: FIRST_DIR[key] }));

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

  const setField = (k: NumberFilter) => (v: string) => {
    setText((t) => ({ ...t, [k]: v }));
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    setF((x) => ({ ...x, [k]: Number.isFinite(n) ? (k === 'minRoi' ? n / 100 : n) : 0 }));
  };

  const scanMsg = scan.phase === 'sampling' ? 'Sampling the Jita order book' : scan.phase === 'liquidity' ? 'Checking how often each candidate really trades' : 'Pricing the steady ones against the live book';

  return (
    <div className="page" style={{ minHeight: 600 }}>
      <PageHead
        kicker="02 · Market survey" title="Prospects" wide
        lede="Items worth station trading at Jita 4-4, found by sampling the order book, then checking how often each one really changes hands. A wide spread on something that sells once a month isn’t a trade you can repeat."
        actions={busy ? (
          <button type="button" className="btn danger tall" onClick={stopScan}><Square aria-hidden="true" />{scan.depth === 'deep' ? 'Stop deep scan' : 'Stop scan'}</button>
        ) : (
          <>
            <button type="button" className="btn primary tall" onClick={() => runScan(d.settings, f, 'quick')}><Radar aria-hidden="true" />Quick scan</button>
            <button type="button" className="btn tall" onClick={() => runScan(d.settings, f, 'deep')} data-tip-title="Deep scan" data-tip="Samples three times as much of the order book and works through every candidate it finds. Takes a while — leave it running."><ScanSearch aria-hidden="true" />Deep scan</button>
          </>
        )}
      />

      <div className="chipbar" data-rv="">
        <span className="chipbar-title"><SlidersHorizontal aria-hidden="true" />Filters</span>
        {FILTER_FIELDS.map(({ key, label, hint }) => (
          <Chip key={key} id={`p-${key}`} h34 label={label} tip={hint} value={text[key]} onChange={setField(key)}
            onBlur={() => key === 'budget' && setText((t) => ({ ...t, budget: Math.round(f.budget).toLocaleString('en-US') }))} />
        ))}
        <Check checked={f.demoteFlagged} onChange={(v) => setF((x) => ({ ...x, demoteFlagged: v }))} tip="Push flagged items down the list — the more flags, the further down">Push flagged down</Check>
      </div>

      {busy ? (
        <Busy title={`${scanMsg}…`} done={scan.done} total={scan.total} left={left}
          sub={<>Results appear as they are found and are kept, so stopping early costs you nothing.{scan.failed > 0 && ` ${units(scan.failed)} couldn’t be read.`}</>} />
      ) : cov.checked > 0 ? (
        <div className="row wide" data-rv="" style={{ fontSize: 12.5, color: 'var(--label)' }}>
          <SatelliteDish aria-hidden="true" style={{ width: 15, height: 15, color: 'var(--acc)' }} />
          <span style={{ textWrap: 'pretty', flex: '1 1 400px' }}>
            Checked {units(cov.checked)} of about {units(cov.candidates)} candidates, {units(cov.priced)} priced against the live book.
            {cov.pricedAt && <> Prices from <strong style={{ color: 'var(--body)' }}>{ago(cov.pricedAt, now)}</strong>; a scan refreshes any over an hour old.</>}
            {cov.priced === 0 ? ' A quick scan will price the best of them — it keeps the trading history already gathered.' : cov.checked < cov.candidates ? ' Scan again to widen the net.' : ''}
          </span>
          <button type="button" className="link-btn danger" onClick={async () => {
            if (!(await confirmAsk({ title: 'Clear these results?', body: 'Deletes only what the scan found. Your trades, positions and settings are untouched.', confirm: 'Clear results', danger: true }))) return;
            await clearScan(); await reload(); setOpen(null); toast('Scan results cleared.', 'info');
          }}>Clear these results</button>
          <span className="spacer lbl" style={{ fontSize: 11, color: 'var(--dim)' }}>{units(rows.length)} match</span>
        </div>
      ) : null}
      {scan.error && <div className="notice err" role="alert">{scan.error}</div>}

      <section className="panel flush" data-rv="" style={{ flex: 1, minHeight: 280 }}>
        {!cov.checked && !busy ? (
          <Empty icon={Telescope} action={<button type="button" className="btn primary" onClick={() => runScan(d.settings, f, 'quick')}><Radar aria-hidden="true" />Run a quick scan</button>}>
            Nothing scanned yet. A quick scan samples 20 pages of the Jita order book, checks the trading history of the busiest few
            hundred items, and prices the ones that trade steadily — about a minute and a half. A deep scan samples three times as much
            and works through every candidate it finds. Either way, results appear as they are found and are kept.
          </Empty>
        ) : !rows.length ? (
          busy ? <Empty icon={Radar}>Scanning. Anything that clears your filters appears here as soon as it is priced.</Empty> : (
            <Empty icon={Telescope}>
              {biggest > 0 && biggest < f.budget
                ? `Nothing scanned so far can absorb ${iskBig(f.budget)} within ${plainNum(f.horizonDays)} day${f.horizonDays === 1 ? '' : 's'}. The busiest market found so far could take about ${iskBig(biggest)} in that time. Put in less, allow longer, or run a deep scan.`
                : biggest >= f.budget
                  ? `Some scanned items are busy enough to absorb ${iskBig(f.budget)}, but none of the ${units(cov.priced)} priced against the live book so far do. Scan again to price more of them, or loosen the other filters.`
                  : 'Nothing scanned so far clears these filters. Loosen the return or the trades a day, allow a longer horizon, or scan again to check more of the market.'}
            </Empty>
          )
        ) : (
          <div className="tbl-scroll">
            <table className="tbl" style={{ minWidth: 1420 }}>
              <thead>
                <tr>
                  <SortTh k="name" label="Item" sort={sort} onSort={sortBy} left />
                  {COLUMNS.map(([key, label, tip]) => <SortTh key={key} k={key} label={label} sort={sort} onSort={sortBy} tip={tip} />)}
                  <th scope="col" style={{ color: 'var(--faint-2)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <Row key={p.typeId} p={p} name={nameOf(p.typeId)} open={open === p.typeId} baseShare={d.settings.share}
                    onToggle={() => setOpen(open === p.typeId ? null : p.typeId)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Guide
        title="How to use Prospects"
        intro="Prospects finds items worth trading by sampling the Jita order book and checking how often each really changes hands. It’s a shortlist to investigate, not a buy list."
        steps={[
          { icon: Radar, title: 'Scan first', body: 'A quick scan skims the busiest markets in about a minute and a half. A deep scan samples three times as much — run it when you have time and leave it going.' },
          { icon: SlidersHorizontal, title: 'Set filters to your wallet', body: 'ISK per item and horizon are the key two: only items whose turnover can absorb that much in that time are shown. Bigger budgets mean fewer, busier markets.' },
          { icon: ArrowDownWideNarrow, title: 'Sort by return per day', body: 'That’s the default for a reason — it rewards items that turn round quickly, which is what compounds.' },
          { icon: FlagIcon, title: 'Read the flags', body: 'Thin, Fluke, Falling, Crowded, Wall, Spike and Escrow bait each have a reason on hover. Flagged items are pushed down the list by default.' },
          { icon: ChevronRight, title: 'Open a row before trading', body: 'The detail shows competition, your modelled share and who’s trading. Then check it in the Calculator.' },
        ]}
        habits={[
          { icon: RefreshCw, title: 'Prices age', body: 'The line under the filters says how old prices are. Rescan if they’re over an hour old.' },
          { icon: ShieldAlert, title: 'A great margin with a flag is a warning', body: 'Wide spreads on flagged items are usually why they’re flagged.', color: 'var(--neg-l)' },
        ]}
      />
    </div>
  );
}

function Row({ p, name, open, onToggle, baseShare }: { p: Prospect; name: string; open: boolean; onToggle: () => void; baseShare: number }) {
  const s = p.stats;
  const base = baseShare / 100;
  const det: { l: string; v: string; n: string; c?: string }[] = [
    { l: 'Your prices', v: `${isk(p.buy)} buy · ${isk(p.sell)} sell`, n: `One legal step inside ${isk(p.bestBuy)} / ${isk(p.bestSell)}` },
    { l: 'Spread', v: pct(p.spreadPct, 1), n: `Usually ${pct(s.dailyRange, 1)} in a day` },
    { l: 'Competition', v: `${units(p.buyOrders)} buy, ${units(p.sellOrders)} sell`, n: `${units(p.topSellVol)} units at the best sell` },
    { l: 'Steadiness', v: pct(s.spikiness, 0), n: 'Share of the month’s volume on its busiest day' },
    { l: 'Price trend', v: pct(s.trend, 1), n: '30-day average against the 90-day', c: s.trend >= 0 ? 'var(--pos)' : 'var(--neg)' },
    {
      l: 'Your share', v: pct(p.share, 1), c: p.share < base ? 'var(--acc2)' : 'var(--pos)',
      n: `${plainNum(baseShare)}% base, ${p.share < base ? 'cut' : p.share > base ? 'raised' : 'kept'} for ${units(p.sellOrders)} competing sellers (${COMPETITION_PIVOT} is even)`,
    },
    { l: 'Who’s trading', v: `${pct(p.buyerShare, 0)} buyers`, n: 'Share of volume that is buyers taking sell orders — your sells only fill from these. Estimated from each day’s range.' },
    { l: 'Position modelled', v: `${units(p.qty)} units`, n: `Flips in ${flip(p.daysToFlip)} at the slower side’s pace` },
  ];
  return (
    <>
      <tr className={'hover' + (open ? ' open' : '')}>
        <td className="l">
          <Expander open={open} onToggle={onToggle} label={`${name}: ${open ? 'hide' : 'show'} details`}>
            <ItemIcon id={p.typeId} />
            <span className="name ellipsis" style={{ maxWidth: 300 }}>{name}</span>
          </Expander>
        </td>
        <td className="pos">{pct(p.roi, 1)}</td>
        <td style={{ color: 'var(--acc)' }}>{pct(p.roiPerDay, 2)}</td>
        <td data-tip={`${units(Math.round(s.unitsPerDay))} units trade here a day`}>{iskBig(p.canTake)}</td>
        <td>{flip(p.daysToFlip)}</td>
        <td className="pos">{iskSigned(p.net)}</td>
        <td>{units(Math.round(s.tradesPerDay))}</td>
        <td style={{ color: 'var(--dim)' }}>{s.daysTraded} of 30</td>
        <td style={{ width: 110 }}><Sparkline values={s.spark} label={`Daily volume over 30 days, ${s.daysTraded} days with trades`} /></td>
        <td className="pos">{iskBig(p.iskPerDay)}</td>
        <td>{iskBig(p.capital)}</td>
        <td>
          {p.warnings.length
            ? <span className="flags">{p.warnings.map((w) => <Flag key={w} why={WARNING[w].why} title={WARNING[w].short}>{WARNING[w].short}</Flag>)}</span>
            : <span style={{ color: 'var(--ghost)' }}>–</span>}
        </td>
        <td>
          <span className="acts">
            <button type="button" className="link-btn" onClick={() => navigate(`calculator?type=${p.typeId}`)} aria-label={`Open ${name} in the calculator`}>Calc</button>
            <button type="button" className="link-btn" onClick={() => { const a = addToWatchlist(p.typeId); toast(a ? `Added ${name} to your watchlist.` : `${name} is already on your watchlist.`, a ? 'ok' : 'warn'); }}>Watch</button>
            <button type="button" className="link-btn" onClick={() => navigate(`positions/${startPosition(p.typeId).id}`)} aria-label={`Start trading ${name}`}>Trade</button>
            <OpenInGame typeId={p.typeId} name={name} variant="dim" />
          </span>
        </td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={COLUMNS.length + 2}>
            <div className="unfold">
              <div className="dgrid">
                {det.map((x) => (
                  <div key={x.l} className="dcard">
                    <div className="lbl">{x.l}</div>
                    <div className="dv" style={x.c ? { color: x.c } : undefined}>{x.v}</div>
                    <div className="dn">{x.n}</div>
                  </div>
                ))}
              </div>
              {p.warnings.map((w) => <p key={w} style={{ margin: '8px 0 0', fontSize: 12.5, color: '#9fb3c5' }}><b className="warn">{WARNING[w].short}.</b> {WARNING[w].why}</p>)}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
