import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Clock, Trophy } from 'lucide-react';
import { rates } from '../lib/fees';
import { fmtShort, iskBig, iskBigSigned, pct } from '../lib/format';
import { useNow } from '../lib/hooks';
import { computePosition, countedIn } from '../lib/positions';
import { attribute, byDay, perHour, totals, type DayEvent, type TypeSets } from '../lib/results';
import { loadTypeSets } from '../lib/attribution';
import { classify } from '../lib/killmails';
import { netLoss, type CombatActivity } from '../lib/combat';
import { update, useData } from '../lib/store';
import { ACTIVITIES } from '../lib/prefs';
import type { Activity } from '../lib/types';
import { useEnsureNames, useTypeName } from './common';
import { flip } from './Prospects';
import { Guide, NumChip, PageHead, Panel, Seg, Tiles } from './ui';

const DAY = 86400_000;
type Days = 7 | 30 | 90;
const COLOR: Record<Activity, string> = {
  Trading: 'var(--acc)', Loyalty: '#a98bff', Planets: '#6ee7a8', Hauling: 'var(--acc2)', Abyssal: '#ff8d9a', Combat: '#7aa6ff',
};
const WHAT: Record<Activity, string> = {
  Trading: 'Realized profit from your positions',
  Loyalty: 'Loyalty-store goods sold, less the ISK the store took',
  Planets: 'Planetary goods sold, less customs tax',
  Hauling: 'Courier rewards, less haulers lost',
  Abyssal: 'Abyssal loot sold, less filaments bought and ships lost',
  Combat: 'Bounties and missions, less ships lost',
};
const LOSS_ACTIVITY: Record<CombatActivity, Activity> = { Abyssal: 'Abyssal', Hauling: 'Hauling', PvP: 'Combat', PvE: 'Combat' };

export function Results() {
  const d = useData();
  const now = useNow(60_000);
  const name = useTypeName();
  const [days, setDaysS] = useState<Days>(() => { try { const v = Number(localStorage.getItem('jita-ledger:results-days')); return (v === 7 || v === 30 || v === 90 ? v : 30) as Days; } catch { return 30; } });
  const setDays = (v: Days) => { setDaysS(v); try { localStorage.setItem('jita-ledger:results-days', String(v)); } catch { /* private window */ } };
  const since = now - days * DAY;

  const corps = (d.meta.lpBalances ?? []).map((b) => b.corporationId);
  const [sets, setSets] = useState<TypeSets | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadTypeSets(corps).then((s) => { if (alive) setSets(s); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [corps.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutaplasmids have no market group of their own, so they need names before they can be recognised.
  const traded = useMemo(() => [...new Set(Object.values(d.txs).map((t) => t.typeId))], [d.txs]);
  useEnsureNames(traded);

  const [lossActs, setLossActs] = useState<Record<number, CombatActivity>>({});
  const lossKey = Object.values(d.killmails).filter((k) => k.kind === 'loss').map((k) => k.id).join(',');
  useEffect(() => {
    let alive = true;
    classify(Object.values(d.killmails).filter((k) => k.kind === 'loss')).then((m) => { if (alive) setLossActs(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, [lossKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const posCalc = useMemo(() => d.positions.map((p) => ({ p, c: computePosition(p, d, d.settings) })), [d.positions, d.txs, d.journal, d.settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const events = useMemo<DayEvent[]>(() => {
    if (!sets) return [];
    const txs = Object.values(d.txs).filter((t) => t.source === 'esi');
    const tracked = new Set(txs.filter((t) => d.positions.some((p) => countedIn(p, t))).map((t) => t.id));
    const abyssLoot = new Set(sets.abyssLoot);
    for (const [id, n] of Object.entries(d.names)) if (/Mutaplasmid$/.test(n)) abyssLoot.add(Number(id));
    const realized: { t: number; isk: number }[] = [];
    for (const { c } of posCalc) {
      let prev = 0;
      for (const s of c.series) { if (s.realized !== prev) realized.push({ t: s.t, isk: s.realized - prev }); prev = s.realized; }
    }
    const losses = Object.values(d.killmails)
      .filter((k) => k.kind === 'loss' && k.value && lossActs[k.id])
      .map((k) => ({ t: Date.parse(k.time), activity: LOSS_ACTIVITY[lossActs[k.id]], isk: netLoss(k) }));
    return attribute({ txs, journal: Object.values(d.journal), tracked, realized, losses, sets: { ...sets, abyssLoot }, salesTax: rates(d.settings).t });
  }, [sets, d.txs, d.journal, d.positions, d.names, d.killmails, lossActs, posCalc, d.settings]);

  const acts = ACTIVITIES;
  const series = byDay(events, days, now, acts);
  const tot = totals(series, acts.length);
  const grand = tot.reduce((a, b) => a + b, 0);
  const hours = d.prefs.hours;
  const ph = acts.map((a, k) => perHour(tot[k], hours[a], days));
  const hoursKnown = acts.filter((a) => (hours[a] ?? 0) > 0);
  const knownTotal = acts.reduce((t, a, k) => t + ((hours[a] ?? 0) > 0 ? tot[k] : 0), 0);
  const knownHours = hoursKnown.reduce((t, a) => t + (hours[a] ?? 0) * (days / 7), 0);
  const overallPh = knownHours > 0 ? knownTotal / knownHours : null;
  const tradingK = acts.indexOf('Trading');
  // What is tied up in trading now: stock at cost and ISK held for buy orders.
  const capital = posCalc.filter((x) => x.p.status === 'open').reduce((t, x) => t + x.c.costOfStock, 0)
    + Object.values(d.orders).filter((o) => o.state === 'open' && o.isBuy).reduce((t, o) => t + (o.escrow ?? o.price * o.volumeRemain), 0);

  // Chart: bars per day, gains stacked up from zero and losses down.
  const dayPos = series.map((s) => s.values.reduce((t, v) => t + Math.max(0, v), 0));
  const dayNeg = series.map((s) => s.values.reduce((t, v) => t + Math.min(0, v), 0));
  const top = Math.max(1, ...dayPos), bottom = Math.min(0, ...dayNeg);
  const span = top - bottom;
  const Y = (v: number) => 190 - ((v - bottom) / span) * 180;
  const bw = (600 / days) * 0.72;

  // Best and worst, from positions' profit in the window and the ships lost in it.
  const posRows = posCalc.map(({ p, c }) => {
    const inWin = c.series.filter((s) => s.t >= since);
    const prior = c.series.filter((s) => s.t < since);
    const before = prior.length ? prior[prior.length - 1].realized : 0;
    const v = (inWin.length ? inWin[inWin.length - 1].realized : before) - before;
    const spanDays = c.firstT != null ? ((p.closedAt ? Date.parse(p.closedAt) : now) - c.firstT) / DAY : null;
    return { n: name(p.typeId), v, d: `${c.roi != null ? `${pct(c.roi, 1)} return` : 'No return yet'}, ${p.status === 'open' ? 'still open' : spanDays != null ? flip(spanDays) : 'closed'}` };
  }).filter((x) => x.v !== 0);
  const lossRows = Object.values(d.killmails).filter((k) => k.kind === 'loss' && k.value && Date.parse(k.time) >= since)
    .map((k) => ({ n: `${k.victim.shipTypeId ? name(k.victim.shipTypeId) : 'A ship'} lost`, v: -netLoss(k), d: `${lossActs[k.id] ?? 'Combat'}, ${fmtShort(k.time)} — after insurance` }));
  const best = posRows.filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
  const worst = [...posRows, ...lossRows].filter((x) => x.v < 0).sort((a, b) => a.v - b.v).slice(0, 3);

  const byOverall = acts.map((a, k) => ({ a, v: tot[k] })).filter((x) => x.v !== 0).sort((a, b) => b.v - a.v);
  const byHour = acts.map((a, k) => ({ a, v: ph[k] })).filter((x): x is { a: Activity; v: number } => x.v != null).sort((a, b) => b.v - a.v);
  const verdict = !byOverall.length
    ? 'Nothing earned or spent in this window by any rule here yet.'
    : byHour.length >= 2
      ? `${byHour[0].a} pays most per hour of your time${byOverall[0].a !== byHour[0].a ? `, but ${byOverall[0].a.toLowerCase()} pays most overall` : ', and most overall too'}.`
      : `${byOverall[0].a} made the most. Put in the hours a week you spend on each activity to see what each pays for your time.`;

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
        actions={<Seg label="Period" value={days} onChange={setDays} options={([7, 30, 90] as Days[]).map((v) => ({ v, label: `${v} days` }))} />}
      />
      {failed && <p className="note" style={{ color: 'var(--acc2)' }}>Couldn’t read the item groups from ESI, so only trading, hauling and bounties are counted. It tries again next visit.</p>}
      <Tiles min={190} items={[
        { l: `Made in ${days} days`, v: iskBigSigned(grand), n: 'After every fee and tax', c: grand >= 0 ? 'var(--pos)' : 'var(--neg)' },
        { l: 'Per day', v: iskBigSigned(grand / days), n: 'Averaged across the period' },
        { l: 'Per hour of your time', v: overallPh != null ? iskBigSigned(overallPh) : '–', n: overallPh != null ? `Across the ${hoursKnown.length} activit${hoursKnown.length === 1 ? 'y' : 'ies'} you gave hours for` : 'Put your hours in below', c: 'var(--acc)' },
        { l: 'Return / day on capital', v: capital > 0 ? pct(tot[tradingK] / days / capital, 2) : '–', n: 'Trading profit ÷ ISK tied up in it now', c: 'var(--acc)' },
      ]} />
      <div className="g-440">
        <Panel title="Profit per day" sub={
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
                const x = (i * 600) / days + (600 / days - bw) / 2;
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
              <span key={i} className="hit" style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i / days) * 100}%`, width: `${100 / days}%` }}
                data-tip-title={fmtShort(s.day)}
                data-tip={s.values.some((v) => v) ? acts.map((a, k) => (s.values[k] ? `${a} ${iskBigSigned(s.values[k])}` : null)).filter(Boolean).join(' · ') : 'Nothing that day'} />
            ))}
            <span className="ax" style={{ left: 8, top: 6 }}>{iskBig(top)}</span>
            {bottom < 0 && <span className="ax" style={{ left: 8, bottom: 20 }}>{iskBig(bottom)}</span>}
            <span className="ax f" style={{ left: 8, bottom: 4 }}>{fmtShort(series[0]?.day ?? since)}</span>
            <span className="ax f" style={{ right: 8, bottom: 4 }}>today</span>
          </div>
          <p className="note small">Hover a day for what each activity made. Days below the line lost money — usually filaments bought before the loot was sold.</p>
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
                  <tr key={a}>
                    <td className="l" data-tip={WHAT[a]} data-tip-title={a}><span className="row tight" style={{ fontSize: 13.5, color: 'var(--ink)', fontFamily: 'var(--f-body)' }}><span style={{ width: 9, height: 9, background: COLOR[a] }} />{a}</span></td>
                    <td className="l" style={{ width: '45%' }}>
                      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
                        <span className="track" style={{ flex: 1 }}><span className="fill" style={{ width: `${(Math.max(0, tot[k]) / Math.max(1, ...tot)) * 100}%`, background: COLOR[a] }} /></span>
                        <span style={{ fontSize: 12, color: tot[k] < 0 ? 'var(--neg-t)' : 'var(--figure)' }}>{tot[k] ? iskBigSigned(tot[k]) : '–'}</span>
                      </span>
                    </td>
                    <td><NumChip label={`Hours a week on ${a.toLowerCase()}`} hideLabel value={hours[a] ?? null} onChange={(v) => setHours(a, v)} width={56} decimals={1} placeholder="–" /></td>
                    <td style={{ color: ph[k] != null && overallPh != null && ph[k]! > overallPh ? 'var(--pos)' : 'var(--figure)' }}>{ph[k] == null ? '–' : iskBigSigned(ph[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ color: 'var(--sec)' }}>{verdict}</p>
          <p className="note small">Each activity is counted by one rule — hover its name to see it. A trade a position counts is always trading; anything else goes to the activity its item belongs to, and items that belong to none are left out rather than guessed at.</p>
        </Panel>
      </div>
      <div className="g-440" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))' }}>
        <Panel title="Best">
          {!best.length ? <p className="note">No position made a profit in this window.</p> : best.map((b) => (
            <div key={b.n} className="lrow"><span><span className="lt">{b.n}</span><span className="ls">{b.d}</span></span><span className="lv" style={{ color: 'var(--pos)' }}>{iskBigSigned(b.v)}</span></div>
          ))}
        </Panel>
        <Panel title="Worst">
          {!worst.length ? <p className="note">Nothing lost money in this window.</p> : worst.map((b) => (
            <div key={b.n + b.d} className="lrow"><span><span className="lt">{b.n}</span><span className="ls">{b.d}</span></span><span className="lv" style={{ color: 'var(--neg)' }}>{iskBigSigned(b.v)}</span></div>
          ))}
        </Panel>
      </div>
      <Guide
        title="How to use Results"
        intro="Everything you made, split by activity, so you can see where your time is best spent."
        steps={[
          { icon: CalendarRange, title: 'Pick a period', body: '7 days shows this week’s form, 90 days shows what really works — as far back as this browser has kept your wallet.' },
          { icon: Clock, title: 'Look at per hour of your time', body: 'An activity that pays well but needs you at the keyboard may be worth less than one that runs while you’re away. Put in your hours a week; nothing is assumed until you do.' },
          { icon: Trophy, title: 'Learn from best and worst', body: 'Repeat what made the best list. Read why the worst lost before trying that kind of trade again.' },
        ]}
      />
    </div>
  );
}
