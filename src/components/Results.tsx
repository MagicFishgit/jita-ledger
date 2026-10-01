import { Fragment, useEffect, useMemo, useState } from 'react';
import { CalendarRange, Clock, History, Layers, Trophy } from 'lucide-react';
import { fmtDate, fmtShort, iskBig, iskBigSigned, pct, units } from '../lib/format';
import { useNow } from '../lib/hooks';
import { byBucket, perHour, totals } from '../lib/results';
import { everyItemCalcs } from '../lib/everyItem';
import { bandOf, bucketStarts, groupResults, HELD_BANDS, inBandOrder, isTrade, isUnbought, itemResult, PRICE_BANDS, profitByBucket, unitFor, type BucketUnit, type Group, type ItemCalc, type ItemResult } from '../lib/longRange';
import { itemCategory } from '../lib/universe';
import { netLoss } from '../lib/combat';
import { update, useData } from '../lib/store';
import { ACTIVITIES } from '../lib/prefs';
import type { Activity } from '../lib/types';
import { useTypeName } from './common';
import { flip } from './Prospects';
import { Guide, NumChip, PageHead, Panel, Seg, Tiles } from './ui';
import { Figures, Points } from './Facts';
import { ACTIVITY_COLOR, useActivityEvents } from './activityEvents';
import { ACTIVITY_WHAT } from '../lib/income';

const DAY = 86400_000;
/** 0 is everything the ledger holds. */
type Days = 7 | 30 | 90 | 365 | 0;
const PERIODS: { v: Days; label: string }[] = [{ v: 7, label: '7 days' }, { v: 30, label: '30 days' }, { v: 90, label: '90 days' }, { v: 365, label: '1 year' }, { v: 0, label: 'All' }];
const dayStart = (t: number) => Date.parse(new Date(t).toISOString().slice(0, 10) + 'T00:00:00Z');
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const bucketSaid = (t: number, unit: BucketUnit) => (unit === 'day' ? fmtShort(t) : unit === 'week' ? `Week of ${fmtShort(t)}` : monthFmt.format(new Date(t)));
/**
 * A position over every trade ever made in an item, for the item-by-item view. Trades tagged Personal on the
 * Wallet are left out, as they are there: selling your own things, or buying for yourself, isn't trading.
 */
const COLOR = ACTIVITY_COLOR;
const WHAT = ACTIVITY_WHAT;

export function Results() {
  const d = useData();
  const now = useNow(60_000);
  const name = useTypeName();
  const [days, setDaysS] = useState<Days>(() => {
    try { const raw = localStorage.getItem('jita-ledger:results-days'); const v = Number(raw); return (raw != null && PERIODS.some((p) => p.v === v) ? v : 30) as Days; } catch { return 30; }
  });
  const setDays = (v: Days) => { setDaysS(v); try { localStorage.setItem('jita-ledger:results-days', String(v)); } catch { /* private window */ } };
  // "All" runs from the first thing the ledger holds.
  const firstAt = useMemo(() => {
    let t = Infinity;
    for (const x of Object.values(d.txs)) t = Math.min(t, Date.parse(x.date));
    for (const x of Object.values(d.journal)) t = Math.min(t, Date.parse(x.date));
    return Number.isFinite(t) ? t : null;
  }, [d.txs, d.journal]);
  const firstTrade = useMemo(() => {
    let t = Infinity;
    for (const x of Object.values(d.txs)) if (x.source === 'esi') t = Math.min(t, Date.parse(x.date));
    return Number.isFinite(t) ? t : null;
  }, [d.txs]);
  const ledgerDays = firstAt != null ? Math.max(1, Math.round((dayStart(now) - dayStart(firstAt)) / DAY) + 1) : null;
  const span = days || (ledgerDays ?? 1);
  // Averages divide by the days there is a ledger for: a year's figure from 24 days of data isn't a year's pace.
  const covered = ledgerDays != null ? Math.min(span, ledgerDays) : span;
  const unit = unitFor(span);
  // Up to 90 days, a period is whole days ending today, as the bars are; longer ones run from this moment back.
  const since = unit === 'day' ? dayStart(now) - (span - 1) * DAY : now - span * DAY;
  const periodSaid = days === 0 ? (firstAt != null ? `since ${fmtShort(firstAt)}` : 'so far') : days === 365 ? 'a year' : `${days} days`;

  // Every ISK movement attributed to an activity, as the Wallet's "All income against play" counts it too. The hook
  // takes the logged-in character and the ledger's `chars` as your characters, so a courier reward one of them paid
  // another isn't Hauling.
  const { events, failed, posCalc, lossActs } = useActivityEvents();

  const acts = ACTIVITIES;
  const starts = bucketStarts(since, now, unit);
  const series = byBucket(events, starts, since, now, acts);
  const bars = series.length;
  const tot = totals(series, acts.length);
  const grand = tot.reduce((a, b) => a + b, 0);
  const hours = d.prefs.hours;
  const ph = acts.map((a, k) => perHour(tot[k], hours[a], covered));
  const hoursKnown = acts.filter((a) => (hours[a] ?? 0) > 0);
  const knownTotal = acts.reduce((t, a, k) => t + ((hours[a] ?? 0) > 0 ? tot[k] : 0), 0);
  const knownHours = hoursKnown.reduce((t, a) => t + (hours[a] ?? 0) * (covered / 7), 0);
  const overallPh = knownHours > 0 ? knownTotal / knownHours : null;
  const tradingK = acts.indexOf('Trading');
  // What is tied up in trading now: stock at cost and ISK held for buy orders.
  const capital = posCalc.filter((x) => x.p.status === 'open').reduce((t, x) => t + x.c.costOfStock, 0)
    + Object.values(d.orders).filter((o) => o.state === 'open' && o.isBuy).reduce((t, o) => t + (o.escrow ?? o.price * o.volumeRemain), 0);

  // Chart: bars per day, gains stacked up from zero and losses down.
  const dayPos = series.map((s) => s.values.reduce((t, v) => t + Math.max(0, v), 0));
  const dayNeg = series.map((s) => s.values.reduce((t, v) => t + Math.min(0, v), 0));
  const top = Math.max(1, ...dayPos), bottom = Math.min(0, ...dayNeg);
  const range = top - bottom;
  const Y = (v: number) => 190 - ((v - bottom) / range) * 180;
  const bw = (600 / bars) * 0.72;

  // Best and worst, from positions' profit in the window and the ships lost in it.
  const posRows = posCalc.map(({ p, c }) => {
    const inWin = c.series.filter((s) => s.t >= since);
    const prior = c.series.filter((s) => s.t < since);
    const before = prior.length ? prior[prior.length - 1].realized : 0;
    const v = (inWin.length ? inWin[inWin.length - 1].realized : before) - before;
    const spanDays = c.firstT != null ? ((p.closedAt ? Date.parse(p.closedAt) : now) - c.firstT) / DAY : null;
    return { id: p.id, n: name(p.typeId), v, d: `${c.roi != null ? `${pct(c.roi, 1)} return` : 'No return yet'}, ${p.status === 'open' ? 'still open' : spanDays != null ? flip(spanDays) : 'closed'}` };
  }).filter((x) => x.v !== 0);
  const lossRows = Object.values(d.killmails).filter((k) => k.kind === 'loss' && k.value && Date.parse(k.time) >= since)
    .map((k) => ({ id: `loss:${k.id}`, n: `${k.victim.shipTypeId ? name(k.victim.shipTypeId) : 'A ship'} lost`, v: -netLoss(k), d: `${lossActs[k.id] ?? 'Combat'}, ${fmtShort(k.time)} — after insurance` }));
  const best = posRows.filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
  const worst = [...posRows, ...lossRows].filter((x) => x.v < 0).sort((a, b) => a.v - b.v).slice(0, 3);

  const byOverall = acts.map((a, k) => ({ a, v: tot[k] })).filter((x) => x.v !== 0).sort((a, b) => b.v - a.v);
  const byHour = acts.map((a, k) => ({ a, v: ph[k] })).filter((x): x is { a: Activity; v: number } => x.v != null).sort((a, b) => b.v - a.v);
  const verdict = !byOverall.length
    ? 'Nothing earned or spent in this window by any rule here yet.'
    : byHour.length >= 2
      ? `${byHour[0].a} pays most per hour of your time${byOverall[0].a !== byHour[0].a ? `, but ${byOverall[0].a.toLowerCase()} pays most overall` : ', and most overall too'}.`
      : `${byOverall[0].a} made the most. Put in the hours a week you spend on each activity to see what each pays for your time.`;

  // Every item ever bought and sold again, by the Positions rule, whether or not a position tracks it.
  const itemCalcs = useMemo<ItemCalc[]>(() => everyItemCalcs(d), [d.txs, d.journal, d.orders, d.settings, d.meta.rateHistory, d.ignored]); // eslint-disable-line react-hooks/exhaustive-deps
  const itemRows = useMemo(() => itemCalcs.map((c) => itemResult(c, since - 1, now)), [itemCalcs, since, now]);
  const tradeRows = itemRows.filter(isTrade);
  const unbought = itemRows.filter(isUnbought);
  const tradeSet = new Set(tradeRows.map((r) => r.typeId));
  const tradeProfit = tradeRows.reduce((t, r) => t + r.profit, 0);
  // The By activity row beside Trading: the same bar scale, and per hour on the trading hours.
  const barMax = Math.max(1, ...tot, tradeProfit);
  const allTradingPh = perHour(tradeProfit, hours.Trading, covered);
  // Items that sold are what the table and the kinds compare; orders that sold nothing are said apart, since
  // their fees against the cost of what did sell make a nonsense percentage.
  const soldRows = tradeRows.filter((r) => r.sold > 0);
  const feeRows = tradeRows.filter((r) => r.sold === 0).sort((a, b) => a.profit - b.profit);
  const soldProfit = soldRows.reduce((t, r) => t + r.profit, 0);
  const soldCost = soldRows.reduce((t, r) => t + r.cost, 0);
  const feeTotal = feeRows.reduce((t, r) => t + r.profit, 0);
  const tradeBars = profitByBucket(itemCalcs.filter((c) => tradeSet.has(c.typeId)), starts.map((t, i) => (i === 0 ? Math.max(t, since) : t)), now);
  const tbTop = Math.max(0, ...tradeBars), tbBottom = Math.min(0, ...tradeBars);
  const TY = (v: number) => 95 - ((v - tbBottom) / Math.max(1, tbTop - tbBottom)) * 88;
  const [itemOrder, setItemOrder] = useState<'best' | 'worst'>('best');
  const [allItems, setAllItems] = useState(false);
  const shownItems = [...soldRows].sort((a, b) => (itemOrder === 'best' ? b.profit - a.profit : a.profit - b.profit)).slice(0, allItems ? undefined : 12);

  // What kind of item: ESI's category (Module, Charge, Ship…), looked up once per item and kept for good.
  const [cats, setCats] = useState<Record<number, string>>({});
  const tradeKey = [...tradeSet].sort((a, b) => a - b).join(',');
  useEffect(() => {
    let alive = true;
    const todo = [...tradeSet].filter((id) => !cats[id]);
    if (!todo.length) return;
    const found: Record<number, string> = {};
    let i = 0;
    const flush = () => { if (alive && Object.keys(found).length) setCats((c) => ({ ...c, ...found })); };
    Promise.all(Array.from({ length: Math.min(6, todo.length) }, async () => {
      while (i < todo.length) {
        const id = todo[i++];
        try { found[id] = await itemCategory(id); } catch { /* sorted another time */ }
        if (i % 25 === 0) flush();
      }
    })).then(flush);
    return () => { alive = false; };
  }, [tradeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorting = soldRows.filter((r) => !cats[r.typeId]).length;
  const byKind: { title: string; tip: string; groups: Group[] }[] = [
    { title: 'Kind of item', tip: 'ESI’s category for each item: Module, Charge, Ship, Implant and so on.', groups: groupResults(soldRows, (r) => cats[r.typeId] ?? null) },
    { title: 'Price per unit', tip: 'The average price each item sold for in the period.', groups: inBandOrder(groupResults(soldRows, (r) => bandOf(PRICE_BANDS, r.avgSell)), PRICE_BANDS) },
    { title: 'Time held', tip: 'How long, on average, stock sat between buying and selling, oldest units sold first.', groups: inBandOrder(groupResults(soldRows, (r) => bandOf(HELD_BANDS, r.heldDays)), HELD_BANDS) },
  ];
  const kindVerdict = (() => {
    const lead = byKind.map((k) => [...k.groups].sort((a, b) => b.profit - a.profit)[0]).filter((g): g is Group => !!g && g.profit > 0);
    if (!soldRows.length) return null;
    if (lead.length < 3) return soldProfit > 0 ? null : 'What sold in this period didn’t make money.';
    const low = (k: string) => k.charAt(0).toLowerCase() + k.slice(1);
    return `The biggest earners: the ${lead[0].key} category (${iskBigSigned(lead[0].profit)}), items selling for ${low(lead[1].key)} each (${iskBigSigned(lead[1].profit)}), and stock held ${low(lead[2].key)} (${iskBigSigned(lead[2].profit)}).`;
  })();

  const setHours = (a: Activity, v: number | null) => update((x) => {
    const h = { ...x.prefs.hours };
    if (v == null || !(v > 0)) delete h[a]; else h[a] = v;
    return { prefs: { ...x.prefs, hours: h } };
  });

  return (
    <div className="page">
      <PageHead
        kicker="07 · What actually pays" title="Results" wide
        lede="Everything you made, split by activity — and what each paid per hour of your time, so you know where your evenings are best spent."
        actions={<Seg label="Period" value={days} onChange={setDays} options={PERIODS} />}
      />
      {failed && <p className="note" style={{ color: 'var(--acc2)' }}>Couldn’t read the item groups from ESI, so only trading, hauling, freelance and bounties are counted. It tries again next visit.</p>}
      <Tiles min={190} items={[
        { l: days === 0 ? `Made ${periodSaid}` : `Made in ${periodSaid}`, v: iskBigSigned(grand), n: 'After every fee and tax', c: grand >= 0 ? 'var(--pos)' : 'var(--neg)' },
        { l: 'Per day', v: iskBigSigned(grand / covered), n: covered < span ? `Averaged over the ${covered} day${covered === 1 ? '' : 's'} your ledger covers` : 'Averaged across the period' },
        { l: 'Per hour of your time', v: overallPh != null ? iskBigSigned(overallPh) : '–', n: overallPh != null ? `Across the ${hoursKnown.length} activit${hoursKnown.length === 1 ? 'y' : 'ies'} you gave hours for` : 'Put your hours in below', c: 'var(--acc)' },
        { l: 'Return / day on capital', v: capital > 0 ? pct(tot[tradingK] / covered / capital, 2) : '–', n: 'Trading profit ÷ ISK tied up in it now', c: 'var(--acc)' },
      ]} />
      <div className="g-440">
        <Panel title={`Profit per ${unit}`} sub={
          <span className="row" style={{ gap: 12 }}>
            {acts.map((a) => <span key={a} className="row tight" style={{ fontSize: 12, color: 'var(--sec)' }}><span style={{ width: 9, height: 9, background: COLOR[a] }} />{a}</span>)}
          </span>
        }>
          <div className="chart-box" style={{ height: 260 }}>
            <svg className="plot" viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 65H600M0 110H600M0 155H600" stroke="rgba(130,185,225,.07)" vectorEffect="non-scaling-stroke" fill="none" />
              {bottom < 0 && <path d={`M0 ${Y(0)}H600`} stroke="rgba(130,185,225,.3)" vectorEffect="non-scaling-stroke" />}
              {series.map((s, i) => {
                let up = 0, down = 0;
                const x = (i * 600) / bars + (600 / bars - bw) / 2;
                return acts.map((a, k) => {
                  const v = s.values[k];
                  if (!v) return null;
                  const from = v > 0 ? up : down;
                  const to = from + v;
                  if (v > 0) up = to; else down = to;
                  const y1 = Y(Math.max(from, to)), y2 = Y(Math.min(from, to));
                  return <rect key={`${i}-${a}`} x={x} y={y1} width={bw} height={Math.max(0.5, y2 - y1)} fill={COLOR[a]} opacity={0.85} />;
                });
              })}
            </svg>
            {series.map((s, i) => (
              <span key={i} className="hit" style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i / bars) * 100}%`, width: `${100 / bars}%` }}
                data-tip-title={bucketSaid(s.day, unit)}
                data-tip={s.values.some((v) => v) ? acts.map((a, k) => (s.values[k] ? `${a} ${iskBigSigned(s.values[k])}` : null)).filter(Boolean).join(' · ') : `Nothing that ${unit}`} />
            ))}
            <span className="ax" style={{ left: 8, top: 6 }}>{iskBig(top)}</span>
            {bottom < 0 && <span className="ax" style={{ left: 8, bottom: 20 }}>{iskBig(bottom)}</span>}
            <span className="ax f" style={{ left: 8, bottom: 4 }}>{fmtShort(series[0]?.day ?? since)}</span>
            <span className="ax f" style={{ right: 8, bottom: 4 }}>today</span>
          </div>
          <p className="note small">Hover a {unit} for what each activity made. Bars below the line lost money — usually filaments bought before the loot was sold.</p>
        </Panel>
        <Panel title="By activity">
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl compact" style={{ minWidth: 520 }}>
              <thead><tr>
                <th scope="col" className="l">Activity</th><th scope="col" className="l">Made</th>
                <th scope="col" data-tip="Hours a week you spend on it. Blank means unknown, and per hour stays blank with it.">Hours / week</th>
                <th scope="col">Per hour</th>
              </tr></thead>
              <tbody>
                {acts.map((a, k) => (
                  <Fragment key={a}>
                    <tr>
                      <td className="l" data-tip={WHAT[a]} data-tip-title={a}><span className="row tight" style={{ fontSize: 13.5, color: 'var(--ink)', fontFamily: 'var(--f-body)' }}><span style={{ width: 9, height: 9, background: COLOR[a] }} />{a}</span></td>
                      <td className="l" style={{ width: '45%' }}>
                        <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                          <span className="track" style={{ flex: 1 }}><span className="fill" style={{ width: `${(Math.max(0, tot[k]) / barMax) * 100}%`, background: COLOR[a] }} /></span>
                          <span style={{ fontSize: 12, color: tot[k] < 0 ? 'var(--neg-t)' : 'var(--figure)' }}>{tot[k] ? iskBigSigned(tot[k]) : '–'}</span>
                        </span>
                      </td>
                      <td><NumChip label={`Hours a week on ${a.toLowerCase()}`} hideLabel value={hours[a] ?? null} onChange={(v) => setHours(a, v)} width={56} decimals={1} placeholder="–" /></td>
                      <td style={{ color: ph[k] != null && overallPh != null && ph[k]! > overallPh ? 'var(--pos)' : 'var(--figure)' }}>{ph[k] == null ? '–' : iskBigSigned(ph[k])}</td>
                    </tr>
                    {a === 'Trading' && (
                      <tr>
                        <td className="l" data-tip-title="Every item traded" data-tip={'Every trade in an item you bought, tracked by a position or not, worked out by the same rules as Positions.\n\n• Trades you tagged Personal are left out, as on the Wallet.\n• Shown beside Trading, not added to the total: tracked trades are already counted there.\n• "Every item you traded" below lists them one by one.'}>
                          <span className="row tight" style={{ fontSize: 13, color: 'var(--sec)', fontFamily: 'var(--f-body)', paddingLeft: 12, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                            <span style={{ width: 9, height: 9, border: `1px solid ${COLOR.Trading}` }} />Every item traded
                          </span>
                        </td>
                        <td className="l" style={{ width: '45%' }}>
                          <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                            <span className="track" style={{ flex: 1 }}><span className="fill" style={{ width: `${(Math.max(0, tradeProfit) / barMax) * 100}%`, background: `color-mix(in oklab,${COLOR.Trading} 45%,transparent)` }} /></span>
                            <span style={{ fontSize: 12, color: tradeProfit < 0 ? 'var(--neg-t)' : 'var(--figure)' }}>{tradeProfit ? iskBigSigned(tradeProfit) : '–'}</span>
                          </span>
                        </td>
                        <td style={{ color: 'var(--sec)', fontSize: 12 }} data-tip="Uses your hours a week on trading.">as above</td>
                        <td style={{ color: 'var(--figure)' }}>{allTradingPh == null ? '–' : iskBigSigned(allTradingPh)}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ color: 'var(--sec)' }}>{verdict}</p>
          <Points compact items={[
            { kind: 'info', lead: 'One rule each', text: 'hover an activity’s name to see it.' },
            { kind: 'info', lead: 'Trading', text: 'is any trade a position counts; anything else goes to its item’s activity, and an item in none is left out, not guessed.' },
            { kind: 'info', lead: 'Every item traded', text: 'counts your trades with or without a position: shown beside Trading, not added to the total.' },
          ]} />
        </Panel>
      </div>
      <div className="g-440" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))' }}>
        <Panel title="Best">
          {!best.length ? <p className="note">No position made a profit in this window.</p> : best.map((b) => (
            <div key={b.id} className="lrow"><span><span className="lt">{b.n}</span><span className="ls">{b.d}</span></span><span className="lv" style={{ color: 'var(--pos)' }}>{iskBigSigned(b.v)}</span></div>
          ))}
        </Panel>
        <Panel title="Worst">
          {!worst.length ? <p className="note">Nothing lost money in this window.</p> : worst.map((b) => (
            <div key={b.id} className="lrow"><span><span className="lt">{b.n}</span><span className="ls">{b.d}</span></span><span className="lv" style={{ color: 'var(--neg)' }}>{iskBigSigned(b.v)}</span></div>
          ))}
        </Panel>
      </div>
      <Panel title="Every item you traded" sub={soldRows.length > 1 ? <Seg size="sm" label="Order" value={itemOrder} onChange={setItemOrder} options={[{ v: 'best', label: 'Best first' }, { v: 'worst', label: 'Worst first' }]} /> : undefined}>
        {soldRows.length || feeRows.length ? (
          <Figures items={[
            ...(soldRows.length ? [
              { key: 'sold', value: units(soldRows.length), label: `item${soldRows.length === 1 ? '' : 's'} you bought sold ${days === 0 ? periodSaid : `in ${periodSaid}`}` },
              { key: 'made', value: <span style={{ color: soldProfit >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBigSigned(soldProfit)}</span>, label: `made on them${soldCost > 0 ? `, ${pct(soldProfit / soldCost, 1)} on what they cost` : ''}` },
            ] : []),
            ...(feeRows.length ? [{ key: 'fees', value: units(feeRows.length), label: `more had orders that sold nothing: ${iskBig(-feeTotal)} in fees` }] : []),
            ...(soldRows.length && feeRows.length ? [{ key: 'all', value: <span style={{ color: tradeProfit >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{iskBigSigned(tradeProfit)}</span>, label: 'trading all told' }] : []),
          ]} />
        ) : <p className="note" style={{ margin: 0 }}>Nothing you bought sold in this period.</p>}
        <Points compact items={[
          { kind: 'info', lead: 'Every trade', text: 'counts, with or without a position, except those you tagged Personal.' },
          ...(firstTrade != null && firstTrade > since ? [{ kind: 'info' as const, icon: History, lead: 'Back to', text: `${fmtDate(firstTrade)}: longer periods fill in as the cloud archives past ESI’s 30 days.` }] : []),
        ]} />
        {tradeRows.length > 0 && bars > 1 && (
          <div className="chart-box" style={{ height: 120 }}>
            <svg className="plot" viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true">
              {tbBottom < 0 && <path d={`M0 ${TY(0)}H600`} stroke="rgba(130,185,225,.3)" vectorEffect="non-scaling-stroke" />}
              {tradeBars.map((v, i) => {
                if (!v) return null;
                const y1 = TY(Math.max(0, v)), y2 = TY(Math.min(0, v));
                return <rect key={i} x={(i * 600) / bars + (600 / bars - bw) / 2} y={y1} width={bw} height={Math.max(0.5, y2 - y1)} fill={v > 0 ? 'var(--acc)' : 'var(--neg)'} opacity={0.85} />;
              })}
            </svg>
            {tradeBars.map((v, i) => (
              <span key={i} className="hit" style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i / bars) * 100}%`, width: `${100 / bars}%` }}
                data-tip-title={bucketSaid(starts[i], unit)} data-tip={v ? `Trading ${iskBigSigned(v)}` : 'Nothing sold'} />
            ))}
            {tbTop > 0 && <span className="ax" style={{ left: 8, top: 4 }}>{iskBig(tbTop)}</span>}
            {tbBottom < 0 && <span className="ax" style={{ left: 8, bottom: 16 }}>{iskBig(tbBottom)}</span>}
            <span className="ax f" style={{ left: 8, bottom: 2 }}>{bucketSaid(starts[0], unit)}</span>
          </div>
        )}
        {soldRows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl compact" style={{ minWidth: 640 }}>
              <thead><tr>
                <th scope="col" className="l">Item</th>
                <th scope="col" data-tip="Realized in the period after every fee and tax, as the Positions page works it out.">Made</th>
                <th scope="col" data-tip="Profit ÷ what the units sold had cost.">Return</th>
                <th scope="col">Sold</th>
                <th scope="col" data-tip="Average price per unit sold in the period.">Avg sale</th>
                <th scope="col" data-tip="Average time from buying a unit to selling it, oldest units first.">Held</th>
                <th scope="col" data-tip="Times you changed an order’s price in the period, and the fees those changes cost. Like the listing fee, each is spread over the order’s units: Made counts only the share for units that have sold, and the rest waits on the ones still listed.">Relists</th>
              </tr></thead>
              <tbody>
                {shownItems.map((r: ItemResult) => (
                  <tr key={r.typeId}>
                    <td className="l" style={{ whiteSpace: 'normal', fontFamily: 'var(--f-body)', fontSize: 13.5, color: 'var(--ink)' }}>{name(r.typeId)}{cats[r.typeId] ? <span style={{ color: 'var(--sec)', fontSize: 12 }}> · {cats[r.typeId]}</span> : null}</td>
                    <td style={{ color: r.profit < 0 ? 'var(--neg-t)' : r.profit > 0 ? 'var(--pos)' : 'var(--figure)' }}>{iskBigSigned(r.profit)}</td>
                    <td>{r.cost > 0 ? pct(r.profit / r.cost, 1) : '–'}</td>
                    <td>{r.sold ? units(r.sold) : '–'}</td>
                    <td>{r.avgSell != null ? iskBig(r.avgSell) : '–'}</td>
                    <td>{r.heldDays != null ? flip(r.heldDays) : '–'}</td>
                    <td>{r.relists ? <>{units(r.relists)}<span className="sub">{iskBig(r.relistFees)}</span></> : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {soldRows.length > 12 && (
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAllItems((v) => !v)}>{allItems ? 'Show the first 12' : `Show all ${units(soldRows.length)}`}</button>
        )}
        {feeRows.length > 0 && (
          <p className="note small" style={{ margin: 0 }} data-tip="A buy order that was cancelled or expired before filling, or a listing that sold nothing, still paid its broker fee and any price-change fees. Worked out as on the Positions page.">
            Sold nothing, cost fees: {feeRows.slice(0, 5).map((r) => `${name(r.typeId)} ${iskBigSigned(r.profit)}`).join(' · ')}{feeRows.length > 5 ? ` · and ${units(feeRows.length - 5)} more` : ''}.
          </p>
        )}
        {unbought.length > 0 && (
          <p className="note small" style={{ margin: 0 }}>
            {units(unbought.length)} item{unbought.length === 1 ? ' was' : 's were'} sold with no recorded buy behind most of it ({iskBig(unbought.reduce((t, r) => t + r.revenue, 0))} in sales): loot, loyalty-store and planetary goods, gifts. Those are counted by their activity above, not here.
          </p>
        )}
      </Panel>
      {soldRows.length > 0 && (
        <Panel title="What kind of trading pays" sub={sorting ? <span style={{ fontSize: 12, color: 'var(--sec)' }}>Sorting {units(sorting)} item{sorting === 1 ? '' : 's'} into kinds…</span> : undefined}>
          {kindVerdict && <p className="note" style={{ margin: 0, color: 'var(--sec)' }}>{kindVerdict}</p>}
          <div className="g-440" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))' }}>
            {byKind.map((k) => {
              const mx = Math.max(1, ...k.groups.map((g) => Math.abs(g.profit)));
              return (
                <div key={k.title} style={{ minWidth: 0 }}>
                  <div className="lbl" data-tip={k.tip} style={{ marginBottom: 6 }}>{k.title}</div>
                  {!k.groups.length ? <p className="note small">Working it out…</p> : (
                    <div style={{ overflowX: 'auto' }}>
                    <table className="tbl compact">
                      <thead><tr><th scope="col" className="l">{k.title === 'Kind of item' ? 'Kind' : k.title === 'Price per unit' ? 'Price' : 'Held'}</th><th scope="col" className="l">Made</th><th scope="col">Return</th><th scope="col">Items</th></tr></thead>
                      <tbody>
                        {k.groups.map((g) => (
                          <tr key={g.key}>
                            <td className="l">{g.key}</td>
                            <td className="l" style={{ width: '45%' }}>
                              <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                                <span className="track" style={{ flex: 1 }}><span className="fill" style={{ width: `${(Math.abs(g.profit) / mx) * 100}%`, background: g.profit < 0 ? 'var(--neg)' : 'var(--acc)' }} /></span>
                                <span style={{ fontSize: 12, color: g.profit < 0 ? 'var(--neg-t)' : 'var(--figure)' }}>{iskBigSigned(g.profit)}</span>
                              </span>
                            </td>
                            <td>{g.cost > 0 ? pct(g.profit / g.cost, 1) : '–'}</td>
                            <td>{units(g.items)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="note small" style={{ margin: 0 }}>The items that sold, grouped three ways. Return is profit on what the stock cost, so a kind with small profits on cheap stock can still be the better use of ISK.</p>
        </Panel>
      )}
      <Guide
        title="How to use Results"
        intro="Everything you made, split by activity, so you can see where your time is best spent."
        steps={[
          { icon: CalendarRange, title: 'Pick a period', body: '7 days shows this week’s form; a year or All shows what really works, as far back as your ledger goes. The cloud keeps it past ESI’s 30 days, so the long views fill in as you play.' },
          { icon: Clock, title: 'Look at per hour of your time', body: 'An activity that pays well but needs you at the keyboard may be worth less than one that runs while you’re away. Put in your hours a week; nothing is assumed until you do.' },
          { icon: Trophy, title: 'Learn from best and worst', body: 'Repeat what made the best list. Read why the worst lost before trying that kind of trade again.' },
          { icon: Layers, title: 'See what kind of trading pays', body: 'Every item you bought and sold again, grouped by kind, price and how long you held it. Over months it shows whether cheap fast flips or slow expensive ones earn you more.' },
        ]}
      />
    </div>
  );
}
