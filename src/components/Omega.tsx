import { useEffect, useMemo, useState } from 'react';
import { effectiveSkills, omegaRates, orderSlots, rates, sanitizeSettings, type Rates, type Settings as S } from '../lib/fees';
import { ago, iskBig, iskBigSigned, pct, share, units } from '../lib/format';
import { computePosition, countedIn, realizedBetween } from '../lib/positions';
import { jitaBook } from '../lib/market';
import { update, useData } from '../lib/store';
import { useAuth } from '../lib/hooks';
import { JITA_44, PLEX_TYPE } from '../lib/config';
import { LevelBoxes, Stat } from './common';
import { CloneSwitch, NumField } from './Settings';

const DAY = 86400_000;

export function Omega() {
  const d = useData();
  const auth = useAuth();
  const s = d.settings;
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<S>) => update((x) => ({ settings: sanitizeSettings({ ...x.settings, ...patch }) }));

  async function fetchPlex() {
    setLoading(true); setErr(null);
    try {
      const b = await jitaBook(PLEX_TYPE, true);
      update((x) => ({ meta: { ...x.meta, plex: { price: b.bestSell, buy: b.bestBuy, at: new Date().toISOString() } } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const at = d.meta.plex?.at ? Date.parse(d.meta.plex.at) : 0;
    if (Date.now() - at > 30 * 60_000) fetchPlex();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const plexPrice = s.plexPrice > 0 ? s.plexPrice : d.meta.plex?.price ?? null;
  const monthCost = plexPrice ? plexPrice * s.plexPerMonth : null;
  const wallet = d.meta.walletBalance ?? null;
  const months = monthCost && wallet != null ? wallet / monthCost : null;
  const alpha = s.clone === 'alpha';

  const plan = { acc: s.planAcc, br: s.planBr, abr: s.planAbr };
  const rNow = rates(s);
  const rPlan = omegaRates(s, plan);

  // The last 30 days of trading, across all positions.
  const pace = useMemo(() => {
    const now = Date.now(), from = now - 30 * DAY;
    let realized = 0, stockAtCost = 0;
    const sells = new Map<string, number>();
    for (const p of d.positions) {
      const c = computePosition(p, d, s);
      realized += realizedBetween(c.series, from, now);
      stockAtCost += c.costOfStock;
      for (const row of c.rows) {
        if (row.match === 'excluded' || row.tx.isBuy) continue;
        if (Date.parse(row.tx.date) >= from) sells.set(row.tx.id, row.tx.qty * row.tx.unitPrice);
      }
    }
    const types = new Set(d.positions.map((p) => p.typeId));
    let orderValue = 0, escrow = 0;
    for (const o of Object.values(d.orders)) {
      if (o.state === 'open' && o.isBuy) escrow += o.price * o.volumeRemain;
      if (!types.has(o.typeId) || o.locationId !== JITA_44 || Date.parse(o.issued) < from) continue;
      if (d.positions.some((p) => p.typeId === o.typeId && Date.parse(o.issued) >= Date.parse(p.openedAt))) orderValue += o.price * o.volumeTotal;
    }
    const sellValue = [...sells.values()].reduce((a, b) => a + b, 0);
    return { realized, stockAtCost, sellValue, orderValue, escrow };
  }, [d, s]);

  const savings = pace.sellValue * Math.max(0, rNow.t - rPlan.t) + pace.orderValue * Math.max(0, rNow.f - rPlan.f);
  const asOmega = pace.realized + savings;
  const hasTrades = d.positions.some((p) => Object.values(d.txs).some((t) => countedIn(p, t)));

  const alphaS = { ...s, clone: 'alpha' as const, override: false };
  const omegaS = { ...s, clone: 'omega' as const, override: false };
  const cols: { label: string; r: Rates; slots: number; now: boolean }[] = [
    { label: 'Alpha', r: rates(alphaS), slots: orderSlots(effectiveSkills(alphaS)), now: alpha },
    { label: 'Omega, skills you’ve trained', r: rates(omegaS), slots: orderSlots(effectiveSkills(omegaS)), now: !alpha },
    { label: 'Omega, your plan', r: rPlan, slots: orderSlots(effectiveSkills(omegaS)), now: false },
  ];
  const flip = 100e6;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{alpha ? 'Road to Omega' : 'Staying Omega'}</h1>
          <p>
            What a month of Omega costs in PLEX, how far your wallet gets you, and whether your trading could pay for it.
            As Alpha you can’t use Accounting or Advanced Broker Relations, and Broker Relations stops at level II, so your fees are higher.
          </p>
        </div>
        <div>
          <span className="label">You are</span>
          <CloneSwitch value={s.clone} onChange={(v) => set({ clone: v })} />
        </div>
      </div>

      {err && <p className="notice err" role="alert">Couldn’t load the PLEX price: {err}</p>}

      <section className="card" aria-label="Wallet">
        {months != null ? (
          <>
            <p className={'hl-value ' + (months >= 1 ? 'pos' : '')}>
              {months >= 1 ? `${months.toFixed(1)} months` : pct(months, 0)}
            </p>
            <p className="hl-sub">{months >= 1 ? 'of Omega your wallet could buy' : 'of a month of Omega is in your wallet'}</p>
            <div className={'progress' + (months >= 1 ? ' over' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, months) * 100)} aria-label="Wallet towards a month of Omega">
              <span style={{ width: `${Math.min(100, months * 100)}%` }} />
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              {iskBig(wallet)} in your wallet ({ago(d.meta.walletAt)}), {iskBig(monthCost)} for {units(s.plexPerMonth)} PLEX.
            </p>
          </>
        ) : (
          <>
            <p className="hl-value">{monthCost ? iskBig(monthCost) : '–'}</p>
            <p className="hl-sub">for a month of Omega ({units(s.plexPerMonth)} PLEX)</p>
            <p className="small muted">{auth ? 'Sync to read your wallet balance.' : 'Log in and sync to compare this with your wallet.'}</p>
          </>
        )}
        <dl className="stats" style={{ marginTop: 16 }}>
          <Stat
            label="PLEX price"
            value={plexPrice ? iskBig(plexPrice) : '–'}
            note={s.plexPrice > 0 ? 'Your price' : d.meta.plex ? `Lowest sell on the PLEX market, ${ago(d.meta.plex.at)}` : 'Loading…'}
          />
          <Stat label="A month of Omega" value={iskBig(monthCost)} note={`${units(s.plexPerMonth)} PLEX for 30 days`} />
          <Stat label="Tied up in trading" value={iskBig(pace.escrow + pace.stockAtCost)} note="Buy order escrow plus stock at cost" />
        </dl>
        <div className="fields" style={{ marginTop: 14 }}>
          <NumField id="o-plex-n" label="PLEX for 30 days of Omega" value={s.plexPerMonth} hint="500 in the in-game store, less during sales." onChange={(n) => set({ plexPerMonth: n })} />
          <NumField id="o-plex-p" label="PLEX price override, ISK" value={s.plexPrice} hint="Leave at 0 to use the market price." onChange={(n) => set({ plexPrice: n })} />
        </div>
        <button className="btn btn-small" style={{ marginTop: 12 }} disabled={loading} onClick={fetchPlex}>{loading ? 'Refreshing…' : 'Refresh PLEX price'}</button>
      </section>

      <section style={{ marginTop: 28 }} aria-label="Trading pace">
        <h2 className="section">Could trading pay for it?</h2>
        {!hasTrades ? (
          <p className="empty">Once your positions have some sales, this shows your last 30 days of profit against the cost of Omega.</p>
        ) : (
          <>
            <dl className="stats">
              <Stat label="Realized profit, last 30 days" value={iskBigSigned(pace.realized)} cls={pace.realized >= 0 ? 'pos' : 'neg'}
                note={monthCost && pace.realized > 0 ? `${share(pace.realized / monthCost)} of a month of Omega` : undefined} />
              {alpha && (
                <Stat label="Fees Omega would have saved" value={iskBig(savings)}
                  note={`Same trades at your plan’s rates, from ${iskBig(pace.sellValue)} of sales and ${iskBig(pace.orderValue)} of orders`} />
              )}
              {alpha && (
                <Stat label="The same 30 days as Omega" value={iskBigSigned(asOmega)} cls={asOmega >= 0 ? 'pos' : 'neg'}
                  note={monthCost && asOmega > 0 ? `${share(asOmega / monthCost)} of a month of Omega` : undefined} />
              )}
            </dl>
            {monthCost && (
              <p className="notice" style={{ marginTop: 16 }}>
                {alpha
                  ? asOmega >= monthCost
                    ? `At your last 30 days’ pace, trading as Omega would cover the subscription and leave about ${iskBig(asOmega - monthCost)} a month.`
                    : asOmega > 0
                      ? `At your last 30 days’ pace, trading as Omega would cover ${share(asOmega / monthCost)} of the subscription.`
                      : 'Your last 30 days of trading didn’t make a profit yet, even at Omega rates.'
                  : pace.realized >= monthCost
                    ? `Your last 30 days of trading covered Omega with about ${iskBig(pace.realized - monthCost)} to spare.`
                    : pace.realized > 0
                      ? `Your last 30 days of trading covered ${share(pace.realized / monthCost)} of a month of Omega.`
                      : 'Your last 30 days of trading didn’t make a profit yet.'}
                {' '}That’s a look back, not a forecast. Price-change fees aren’t in the savings estimate.
              </p>
            )}
          </>
        )}
      </section>

      <section style={{ marginTop: 28 }} aria-label="Alpha and Omega compared">
        <h2 className="section">Alpha and Omega compared</h2>
        <p className="small muted" style={{ marginTop: -6 }}>
          Uses your standings and base sales tax. Skills you train as Omega take time, so set the plan to what you expect to have.
        </p>
        <div className="table-wrap">
          <table className="data compare">
            <thead>
              <tr><th scope="col" /> {cols.map((c) => <th key={c.label} scope="col">{c.label}{c.now ? ' (you now)' : ''}</th>)}</tr>
            </thead>
            <tbody>
              <tr><th scope="row">Broker fee</th>{cols.map((c) => <td key={c.label} className={c.now ? 'now' : ''}>{pct(c.r.f)}</td>)}</tr>
              <tr><th scope="row">Sales tax</th>{cols.map((c) => <td key={c.label} className={c.now ? 'now' : ''}>{pct(c.r.t)}</td>)}</tr>
              <tr><th scope="row">Changing a price</th>{cols.map((c) => <td key={c.label} className={c.now ? 'now' : ''}>{pct(c.r.k)}</td>)}</tr>
              <tr><th scope="row">Break-even spread</th>{cols.map((c) => <td key={c.label} className={c.now ? 'now' : ''}>{pct(c.r.be, 1)}</td>)}</tr>
              <tr><th scope="row">Fees on a 100 M ISK flip</th>{cols.map((c) => <td key={c.label} className={c.now ? 'now' : ''}>{iskBig(flip * (2 * c.r.f + c.r.t))}</td>)}</tr>
              <tr><th scope="row">Order slots</th>{cols.map((c) => <td key={c.label} className={c.now ? 'now' : ''}>{units(c.slots)}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <div className="card" style={{ marginTop: 16, maxWidth: 560 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Your Omega skill plan</h3>
          <LevelBoxes label="Accounting" value={s.planAcc} onChange={(n) => set({ planAcc: n })} />
          <LevelBoxes label="Broker Relations" value={s.planBr} onChange={(n) => set({ planBr: n })} />
          <LevelBoxes label="Advanced Broker Relations" value={s.planAbr} onChange={(n) => set({ planAbr: n })} />
        </div>
      </section>
    </div>
  );
}
