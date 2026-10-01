import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownWideNarrow, ChevronRight, Flag as FlagIcon, Radar, RefreshCw, SatelliteDish, ScanSearch, ShieldAlert,
  SlidersHorizontal, Square, Telescope,
} from 'lucide-react';
import { ago, isk, iskBig, iskSigned, pct, plainNum, units } from '../lib/format';
import { resolveNames } from '../lib/market';
import { absorbable, BUSY_SHOWN, DEFAULT_FILTERS, FIRST_DIR, horizonSaid, horizonShort, HORIZONS, passesGate, RUN_UP, RUN_UP_BEFORE, RUN_UP_DAYS, SLOW_DAYS, snapHorizon, sortProspects, type Sort, type SortKey } from '../lib/prospects';
import { FILL_RARE, FILL_WINDOW, RECENT_DAYS, RECENT_TYPICAL } from '../lib/fills';
import { clearScan, coverage, loadCache, rankProspects, runScan, stopScan, useScanState, type ScanCache } from '../lib/scan';
import { COMPETITION_PIVOT, SPLIT_SAID } from '../lib/split';
import { useFlow } from '../lib/flowStore';
import { update, useData } from '../lib/store';
import { addToWatchlist, startPosition } from '../lib/actions';
import { navigate, useNow } from '../lib/hooks';
import { confirmAsk } from '../lib/confirm';
import { toast } from '../lib/toast';
import type { Prospect, ProspectFilters, ProspectWarning } from '../lib/types';
import { BusyRelisting, OpenInGame, useTypeName } from './common';
import { Busy, Check, Chip, Empty, Expander, Flag, Guide, ItemIcon, PageHead, Seg, SortTh, Sparkline } from './ui';
import { ShareCheck } from './ShareCheck';

export const WARNING: Record<ProspectWarning, { short: string; why: string }> = {
  wall: { short: 'Wall', why: 'The best price on one side holds more than half the visible stock, and more than three days of what the item trades.\n\nWalls are often placed to make a spread look stable, then pulled once traders pile in behind them.' },
  escrow: { short: 'Escrow bait', why: 'A buy order well above anything paid for this all month.\n\nThe classic margin-trading scam: the buyer holds only a sliver of that ISK, and the order vanishes the moment you haul stock in to fill it.' },
  spike: { short: 'Spike', why: 'One recent day traded more than five times the usual volume at an unusual price. Someone may be moving the price to lure traders in.' },
  thin: { short: 'Thin', why: 'Fewer than five orders on one side. The spread is wide because almost nobody is standing there, and it can vanish the moment one person moves.' },
  fluke: { short: 'Fluke', why: 'Today’s gap is much wider than this item usually trades in a day. Expect it to close before your order fills.' },
  falling: { short: 'Falling', why: 'The 30-day average price is more than 10% below the 90-day. You would be buying into a slide.' },
  crowded: { short: 'Crowded', why: 'Hundreds of listings against very few trades. You would be joining a queue, not a market.' },
  slow: { short: 'Locks ISK for weeks', why: `At your share of the trade, this position takes more than ${SLOW_DAYS} days to buy in and sell out.\n\nFine if you meant to hold it that long, but the ISK is tied up the whole time and the market can move against you meanwhile.` },
  moved: { short: 'Price just moved', why: 'The latest day traded more than 50% away from the two weeks before it. The spread straddles the old price and the new one: a bid where it used to trade won’t fill if the new level holds, and an ask at the new level won’t sell if it falls back.\n\nWait a few days for the market to settle before trading it. The Capital planner leaves these out.' },
  runUp: { short: 'Ran up lately', why: `The last ${RUN_UP_DAYS} days averaged more than ${pct(RUN_UP, 0)} over the median day of the ${RUN_UP_BEFORE} before them: the price has run up.\n\nA spread priced off the climb is gone when it falls back, and an ask looks reached only because of the climb’s days. “Price just moved” looks at the latest day alone; this looks at the last few.\n\nWait for it to settle before trading it. The Capital planner leaves these out.` },
  unreachedSell: { short: 'Sells not reached', why: `The bulk of trading hasn’t been getting up to the best ask: on fewer than ${FILL_RARE} of the last ${FILL_WINDOW} days did the day’s trading reach it.\n\nBuyers here haven’t been paying that much, often because the price has just jumped. The prices shown assume you list where trading did reach, on half of the last ${FILL_WINDOW} days and ${RECENT_TYPICAL} of the last ${RECENT_DAYS} (in Busy markets, the top of the book instead), so the margin is what trading supports, not what the best ask promises.` },
  unreached: { short: 'Bids not reached', why: `The bulk of trading hasn’t been getting down to the best bid: on fewer than ${FILL_RARE} of the last ${FILL_WINDOW} days did the day’s trading reach it.\n\nSellers here list and wait rather than sell into buy orders, so a bid at the top can sit for weeks with your ISK held in it. The prices shown assume you bid where trading did reach, on half of the last ${FILL_WINDOW} days and ${RECENT_TYPICAL} of the last ${RECENT_DAYS} (in Busy markets, the top of the book instead).\n\nESI’s daily low leaves out a small share of trades, so some units still sell lower: on a very busy market that can be thousands a day, which is why Busy markets prices at the top.` },
};

/**
 * A flag's reason for one item: the run-up with its two figures, and "not reached lately" when the fortnight reached
 * the front but the last few days didn't. Otherwise the flag's own reason.
 */
export function warningWhy(w: ProspectWarning, p: Pick<Prospect, 'stats' | 'bidReach' | 'bidRecent' | 'bidWindow' | 'askReach' | 'askRecent' | 'askWindow'>): string {
  const s = p.stats;
  if (w === 'runUp' && s.runUp != null && s.runUpBase != null && s.runUpBase > 0) {
    return `The last ${RUN_UP_DAYS} days averaged ${iskBig(s.runUpBase * (1 + s.runUp))}, ${pct(s.runUp, 0)} over the median day of the ${RUN_UP_BEFORE} before them, ${iskBig(s.runUpBase)}: the price has run up.\n\n${WARNING.runUp.why.split('\n\n').slice(1).join('\n\n')}`;
  }
  if (w === 'unreached' && p.bidWindow === 'recent') {
    return `The bulk of trading got down to the best bid on ${p.bidReach} of the last ${FILL_WINDOW} days, but on ${p.bidRecent ? `only ${p.bidRecent}` : 'none'} of the last ${RECENT_DAYS}: not lately.\n\nThe price has moved up since those days, so a bid at the top would sit. The prices shown assume you bid where trading did reach on both, half of the last ${FILL_WINDOW} days and ${RECENT_TYPICAL} of the last ${RECENT_DAYS} (in Busy markets, the top of the book instead).`;
  }
  if (w === 'unreachedSell' && p.askWindow === 'recent') {
    return `The bulk of trading got up to the best ask on ${p.askReach ?? 0} of the last ${FILL_WINDOW} days, but on ${p.askRecent ? `only ${p.askRecent}` : 'none'} of the last ${RECENT_DAYS}: not lately.\n\nBuyers have stopped paying that much, often as a climb falls back. The prices shown assume you list where trading did get up to on both, half of the last ${FILL_WINDOW} days and ${RECENT_TYPICAL} of the last ${RECENT_DAYS} (in Busy markets, the top of the book instead).`;
  }
  return WARNING[w].why;
}

/**
 * The raises kept back on an item (evaluate.ts, RAISES_RESERVED): how many, where, and what they take off the return.
 * `said` is the tip's lead, "2 raises a side kept back: −0.98%". Null without any.
 */
export function raisesKept(p: Pick<Prospect, 'raiseReserve' | 'qty' | 'capital'>): { said: string; count: string; cut: string } | null {
  const r = p.raiseReserve;
  if (!r || !(r.buy > 0 || r.sell > 0)) return null;
  const cut = pct(-(r.isk * p.qty) / Math.max(p.capital, 1), 2);
  const n = Math.max(r.buy, r.sell);
  const count = `${n} raise${n === 1 ? '' : 's'} ${r.buy > 0 && r.sell > 0 ? 'a side' : r.buy > 0 ? 'on the buy side' : 'on the sell side'}`;
  return { said: `${count} kept back: ${cut}`, count, cut };
}

/** The why of the raises kept back: the lead, then how it's worked out. */
export const raisesWhy = (said: string) => `${said}.\n\n• The watch of its Jita book saw at least as many units newly placed at the front as filled there, over a day or more: you’d typically be beaten before you fill, and move.\n• Each price change costs the broker fee less your Advanced Broker Relations discount, on the order’s whole value. That much is already off the return and the ranking.`;

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
  ['canTake', 'Can take', 'ISK this item can absorb inside your horizon at your share of the side that fills slower. With “Any”, there’s no limit: see “Flips in” for how long it takes.'],
  ['flip', 'Flips in'], ['net', 'Profit / unit'], ['trades', 'Trades a day'], ['days', 'Days traded'],
  ['volume', 'Volume, 30 d'], ['traded', 'Traded a day', 'ISK that changes hands here on a typical day, both sides: the median day’s units at the 30-day average price.'], ['iskPerDay', 'ISK per day'], ['capital', 'ISK tied up'], ['flags', 'Flags'],
];

type NumberFilter = 'budget' | 'minTrades' | 'minDays' | 'minRoi';
const FILTER_FIELDS: { key: NumberFilter; label: string; hint: string }[] = [
  { key: 'budget', label: 'ISK per item', hint: 'The ISK you want to put into one item. Only items that can absorb this are shown.' },
  { key: 'minTrades', label: 'Trades / day ≥', hint: 'Median trades a day over the last 30 days.' },
  { key: 'minDays', label: 'Days traded ≥', hint: 'Days out of 30 with any trade at all.' },
  { key: 'minRoi', label: 'Return ≥ %', hint: 'Net of your broker fee and sales tax.' },
];

const PREFS_KEY = 'jita-ledger:prospects';
function loadPrefs(wallet: number | undefined): { f: ProspectFilters; sort: Sort } {
  const base = { ...DEFAULT_FILTERS, demoteFlagged: true, budget: wallet && wallet > 1e6 ? Math.round(wallet) : DEFAULT_FILTERS.budget };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (p?.f) return { f: { ...base, ...p.f, horizonDays: snapHorizon(p.f.horizonDays), partial: false }, sort: p.sort?.key ? p.sort : { key: 'roiDay', dir: 'desc' } };
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
    budget: Math.round(init.f.budget).toLocaleString('en-US'),
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

  // What this app has watched the Jita books do feeds each item's buyer/seller split, so a newer record re-ranks.
  const flow = useFlow();
  const ranked = useMemo(() => (cache ? rankProspects(cache, d.settings, f) : []), [cache, d.settings, f, flow]); // eslint-disable-line react-hooks/exhaustive-deps
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
      best = Math.max(best, f.horizonDays == null ? Infinity : absorbable(st, d.settings.share, f.horizonDays));
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
        lede="Items worth station trading at Jita 4-4: the cloud reads every order in The Forge each day, then checks how often each item really changes hands. A wide spread on something that sells once a month isn’t a trade you can repeat."
        actions={busy ? (
          <button type="button" className="btn danger tall" onClick={stopScan}><Square aria-hidden="true" />{scan.depth === 'deep' ? 'Stop deep scan' : 'Stop scan'}</button>
        ) : (
          <>
            <button type="button" className="btn primary tall" onClick={() => runScan(d.settings, f, 'quick')} data-tip-title="Quick scan"
              data-tip={'Checks now, from this browser, without waiting for the cloud’s daily scan.\n\n• Samples about 5% of The Forge’s order book (20 of ~400 pages): busy items show up, quiet ones can be missed.\n• Checks the history of up to 250 of what it finds and prices the best against the live book.\n\nAbout a minute and a half.'}><Radar aria-hidden="true" />Quick scan</button>
            <button type="button" className="btn tall" onClick={() => runScan(d.settings, f, 'deep')} data-tip-title="Deep scan"
              data-tip={'A bigger sample, from this browser.\n\n• Samples about 15% of the order book (60 pages) and checks every candidate it finds.\n• Still a sample: only the cloud’s daily scan reads every order.\n\nTakes a while; leave it running.'}><ScanSearch aria-hidden="true" />Deep scan</button>
          </>
        )}
      />

      <ShareCheck what="What each item can take and how long a flip lasts" />

      <div className="chipbar" data-rv="">
        <span className="chipbar-title"><SlidersHorizontal aria-hidden="true" />Filters</span>
        {FILTER_FIELDS.map(({ key, label, hint }) => (
          <Chip key={key} id={`p-${key}`} h34 label={label} tip={hint} value={text[key]} onChange={setField(key)} width={key === 'budget' ? 160 : undefined}
            onBlur={() => key === 'budget' && setText((t) => ({ ...t, budget: Math.round(f.budget).toLocaleString('en-US') }))} />
        ))}
        <Check checked={f.demoteFlagged} onChange={(v) => setF((x) => ({ ...x, demoteFlagged: v }))} tip="Push flagged items down the list — the more flags, the further down">Push flagged down</Check>
        <Check checked={!!f.busy} onChange={(v) => {
          setF((x) => ({ ...x, busy: v }));
          setSort((s) => (v ? { key: 'traded', dir: 'desc' } : s.key === 'traded' ? { key: 'roiDay', dir: 'desc' } : s));
        }} tip={`Show the ${BUSY_SHOWN} busiest markets by ISK traded a day instead, whatever they return, for dipping into a big thin-margin market on purpose.`}>Busy markets</Check>
        <div className="row" style={{ flexBasis: '100%', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="lbl" style={{ fontSize: 10.5 }} data-tip-title="Out within" tabIndex={0}
            data-tip={'How long you’re willing to have the ISK in one item, from buying in to selling out.\n\n• An item has to be able to take your ISK per item within this time, at your share of its trade, or it’s left out.\n• It doesn’t change the ranking: that’s return per day either way.\n• The hour choices are for fast flips. Speeds come from daily volume, so they find items busy enough to flip that fast on an average day; trading within a day comes in bursts.\n\n“Any” leaves nothing out for being slow, and flags positions that take more than 30 days as “Locks ISK for weeks”.'}>
            Out within
          </span>
          {/* Seg takes numbers, so "any" travels as 0 and is stored as null. */}
          <Seg size="sm" label="Out within" value={f.horizonDays ?? 0} onChange={(v) => setF((x) => ({ ...x, horizonDays: v === 0 ? null : v }))}
            options={HORIZONS.map((h) => ({ v: h ?? 0, label: h == null ? 'Any' : horizonShort(h) }))} />
          <span className="note small" style={{ flex: '1 1 260px' }}>
            {f.busy && <><b style={{ color: 'var(--acc2)' }}>Busy markets:</b> the {BUSY_SHOWN} busiest priced so far, by ISK traded a day, each at its real return. “Return ≥ %” doesn’t apply and a loss shows in red; each is sized to what it can take. </>}
            {f.horizonDays == null
              ? `Nothing is left out for being slow. Anything taking over ${SLOW_DAYS} days is flagged.`
              : `${iskBig(f.budget)} in ${horizonSaid(f.horizonDays)} needs an item where your share of the trade comes to ${iskBig(f.budget / f.horizonDays)} a day.${f.horizonDays < 1 ? ' Speeds come from daily volume, so this finds items busy enough to flip that fast on an average day; within a day, trading comes in bursts.' : ''}`}
          </span>
        </div>
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
            {' '}{cache?.runs?.cloud && (!cache.runs.deep || cache.runs.cloud > cache.runs.deep)
              ? <>From the cloud’s full-market scan <strong style={{ color: 'var(--body)' }}>{ago(cache.runs.cloud, now)}</strong>: every order in The Forge read, not sampled.</>
              : cache?.runs?.deep
                ? <>Last deep scan finished <strong style={{ color: 'var(--body)' }}>{ago(cache.runs.deep, now)}</strong>.</>
                : <span style={{ color: 'var(--acc2)' }}>No deep scan has finished yet.</span>}
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
          busy ? <Empty icon={Radar}>Scanning. Anything that clears your filters appears here as soon as it is priced.</Empty> : f.busy ? (
            <Empty icon={Telescope}>No busy markets priced yet. Every scan now prices the busiest markets as well, so run a quick scan.</Empty>
          ) : (
            <Empty icon={Telescope}>
              {biggest > 0 && biggest < f.budget
                ? `Nothing scanned so far can absorb ${iskBig(f.budget)} within ${horizonSaid(f.horizonDays ?? 0)}. The busiest market found so far could take about ${iskBig(biggest)} in that time. Put in less, allow longer, or run a deep scan.`
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
          { icon: FlagIcon, title: 'Read the flags', body: 'Thin, Fluke, Falling, Crowded, Wall, Spike, Ran up lately and Escrow bait each have a reason on hover. Flagged items are pushed down the list by default.' },
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
  const raises = raisesKept(p);
  const det: { l: string; v: string; n: string; c?: string }[] = [
    { l: 'Your prices', v: `${isk(p.buy)} buy · ${isk(p.sell)} sell`,
      n: p.buyRaised
        ? `The buy is where trading reached on half the last ${FILL_WINDOW} days and ${RECENT_TYPICAL} of the last ${RECENT_DAYS}. One step above the best bid (${isk(p.bestBuy)}) was reached on ${p.bidReach} of the ${FILL_WINDOW}${p.bidRecent != null ? ` and ${p.bidRecent} of the last ${RECENT_DAYS}` : ''}.`
        : `One legal step inside ${isk(p.bestBuy)} / ${isk(p.bestSell)}` },
    { l: 'Spread', v: pct(p.spreadPct, 1), n: `Usually ${pct(s.dailyRange, 1)} in a day` },
    { l: 'Competition', v: `${units(p.buyOrders)} buy, ${units(p.sellOrders)} sell`, n: `${units(p.topSellVol)} units at the best sell` },
    { l: 'Steadiness', v: pct(s.spikiness, 0), n: 'Share of the month’s volume on its busiest day' },
    { l: 'Price trend', v: pct(s.trend, 1), n: '30-day average against the 90-day', c: s.trend >= 0 ? 'var(--pos)' : 'var(--neg)' },
    {
      l: 'Your share', v: pct(p.share, 1), c: p.share < base ? 'var(--acc2)' : 'var(--pos)',
      n: `${plainNum(baseShare)}% base, ${p.share < base ? 'cut' : p.share > base ? 'raised' : 'kept'} for ${units(p.sellOrders)} competing sellers (${COMPETITION_PIVOT} is even)`,
    },
    { l: 'Who’s trading', v: `${pct(p.buyerShare, 0)} buyers`, n: `Share of volume that is buyers taking sell orders — your sells only fill from these. ${SPLIT_SAID[p.splitFrom ?? 'history'].charAt(0).toUpperCase() + SPLIT_SAID[p.splitFrom ?? 'history'].slice(1)}.` },
    { l: 'Position modelled', v: `${units(p.qty)} units`, n: `Flips in ${flip(p.daysToFlip)} at the slower side’s pace` },
    ...(raises ? [{ l: 'Raises kept back', v: raises.count, c: 'var(--acc2)',
      n: `${raises.cut} off the return: its Jita book sees as much stock newly placed at the front as fills there, so you’d be beaten before you fill` }] : []),
  ];
  return (
    <>
      <tr className={'hover' + (open ? ' open' : '')}>
        <td className="l">
          <Expander open={open} onToggle={onToggle} label={`${name}: ${open ? 'hide' : 'show'} details`}>
            <ItemIcon id={p.typeId} />
            <span className="name ellipsis" style={{ maxWidth: 300 }}>{name}</span>
          </Expander>
          <BusyRelisting typeId={p.typeId} />
        </td>
        <td className={p.roi >= 0 ? 'pos' : 'neg'} style={p.roi < 0 ? { color: 'var(--neg)' } : undefined}>{pct(p.roi, 1)}</td>
        <td style={{ color: p.roiPerDay >= 0 ? 'var(--acc)' : 'var(--neg)' }}>{pct(p.roiPerDay, 2)}</td>
        <td data-tip={`${units(Math.round(s.unitsPerDay))} units trade here a day`}>{Number.isFinite(p.canTake) ? iskBig(p.canTake) : <span className="faint">no limit</span>}</td>
        <td>{flip(p.daysToFlip)}</td>
        <td className={p.net >= 0 ? 'pos' : 'neg'} style={p.net < 0 ? { color: 'var(--neg)' } : undefined}>{iskSigned(p.net)}</td>
        <td>{units(Math.round(s.tradesPerDay))}</td>
        <td style={{ color: 'var(--dim)' }}>{s.daysTraded} of 30</td>
        <td style={{ width: 110 }}><Sparkline values={s.spark} label={`Daily volume over 30 days, ${s.daysTraded} days with trades`} /></td>
        <td>{iskBig(p.traded)}</td>
        <td className={p.iskPerDay >= 0 ? 'pos' : 'neg'} style={p.iskPerDay < 0 ? { color: 'var(--neg)' } : undefined}>{iskBig(p.iskPerDay)}</td>
        <td>{iskBig(p.capital)}</td>
        <td>
          {p.warnings.length
            ? <span className="flags">{p.warnings.map((w) => <Flag key={w} why={warningWhy(w, p)} title={WARNING[w].short}>{WARNING[w].short}</Flag>)}</span>
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
              {p.warnings.map((w) => <p key={w} style={{ margin: '8px 0 0', fontSize: 12.5, color: '#9fb3c5' }}><b className="warn">{WARNING[w].short}.</b> {warningWhy(w, p)}</p>)}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
