import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuth, hasScope } from '../lib/auth';
import { CALDARI_NAVY } from '../lib/config';
import { rates } from '../lib/fees';
import { isk, iskBig, plainNum, units } from '../lib/format';
import { navigate } from '../lib/hooks';
import { jitaBook, loyaltyOffers, loyaltyPoints, marketHistory, recentAverages, resolveNames, roughPrices } from '../lib/market';
import {
  byIskPerLp, daysToClear, instantPrice, notesFor, patientPrice, planFor, spendPlan, valueOffer,
  type LpNote, type LpOffer, type LpPlan, type LpValue, type Quote, type UnitPrice,
} from '../lib/loyalty';
import { median } from '../lib/prospects';
import { marketBest } from '../lib/relist';
import { update, useData } from '../lib/store';
import { Explain, OpenInGame, useTypeName } from './common';

const LOYALTY_SCOPE = 'esi-characters.read_loyalty.v1';
/** How many of the best-looking offers get real Jita prices rather than a global average. */
const PRICE_TOP = 40;
/** Rows shown. Past this the rate is poor enough that the rest is noise. */
const SHOW = 60;

const TIPS: Record<string, string> = {
  'ISK per LP': 'What each loyalty point is worth if you take this offer: the profit divided by the points it costs. Points are the scarce thing, not ISK, so this is what ranks the list — a small offer at a better rate beats a huge one at a worse rate.',
  'Sell now': 'The same rate if you dump the goods into the standing buy orders the moment you get them instead of listing and waiting. No broker fee that way, but you take the lower price.',
  'You pay': 'The loyalty points, the store’s own ISK price, and the cost of buying any items the offer demands before it will trade with you. That last part is easy to forget and can swallow most of the profit.',
  'You get': 'What the offer hands over, and what selling it would really net you after your broker fee and sales tax.',
  Profit: 'What is left once everything you paid is taken off what you got. A negative figure means the goods are worth less than the offer costs, which is true of a great many offers.',
  'Trades a day': 'How many of these change hands at Jita on an average day, and how long one run of the offer would take to sell at your share of that. A superb rate on something that trades twice a month is not a way to turn points into ISK.',
  Runs: 'How many times to take this offer, and what that lot is worth. Your points may afford more than the market will take \u2014 listing 600 of something that trades five a day only means competing with yourself \u2014 so this is capped by what can actually be sold inside the time you allowed.',
};

const NOTE: Record<LpNote, { short: string; why: string; bad?: boolean }> = {
  loss: { short: 'Loses money', why: 'The goods are worth less than the offer costs. Taking it would turn loyalty points into a loss.', bad: true },
  topRate: { short: 'Best rate', why: 'Well above the typical rate in this store — half again or better. This is where the points are worth spending.' },
  poorRate: { short: 'Poor rate', why: 'Under half the typical rate in this store. It profits, but the same points do far better further up this list.' },
  fast: { short: 'Sells fast', why: 'One run of this sells within a day at your usual share of the trade, so the ISK comes back quickly and you can go round again.' },
  slow: { short: 'Slow to sell', why: 'More than a week to shift a single run at your usual share of the trade. Fine once; not something to repeat.', bad: true },
  illiquid: { short: 'Barely trades', why: 'No recent trading history to judge by. The price may be real, but there may be nobody to sell to.', bad: true },
  needsItems: { short: 'Buy items first', why: 'A quarter or more of what you get back goes on the items the store demands before it will trade. You have to front that ISK, and those prices can move against you.' },
  capped: { short: 'Market-limited', why: 'Your points afford more runs of this than the market will take in the time you allowed. The runs and total shown are what can actually be sold; the rest of your points are better spent on something else.' },
  capitalHeavy: { short: 'Ties up ISK', why: 'Most of what you get back is money you had to put in first. The profit is real, but your ISK is committed until the goods sell, and a fall in the price eats the margin quickly.' },
  unpriced: { short: 'Cost incomplete', why: 'Something this offer demands could not be priced, so what you pay is understated and the profit shown is too high.', bad: true },
  rough: { short: 'Rough price', why: 'Valued on a global average rather than the live Jita book, because only the best offers get priced properly. Treat it as an indication.' },
  patienceMatters: { short: 'Worth listing', why: 'Selling into the standing buy orders gets less than half what listing does. This one wants an order and some patience, not a quick dump.' },
};

type Row = { v: LpValue; instant: LpValue | null; notes: LpNote[]; plan: LpPlan; live: boolean; perDay: number | null; runDays: number };
type SortKey = 'name' | 'rate' | 'instant' | 'outlay' | 'revenue' | 'profit' | 'days' | 'total';

const COLUMNS: [SortKey, string][] = [
  ['name', 'Item'], ['rate', 'ISK per LP'], ['instant', 'Sell now'], ['outlay', 'You pay'],
  ['revenue', 'You get'], ['profit', 'Profit'], ['days', 'Trades a day'], ['total', 'Runs'],
];
/** Which end of a column is the interesting one when you first click it. */
const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = {
  name: 'asc', rate: 'desc', instant: 'desc', outlay: 'asc',
  revenue: 'desc', profit: 'desc', days: 'asc', total: 'desc',
};

/** How long the selling takes, in a unit that reads naturally. */
function clears(days: number): string | null {
  if (!Number.isFinite(days)) return null;
  if (days < 1 / 24) return '< 1 h';
  if (days < 1) return `${Math.round(days * 24)} h`;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}

export function Loyalty() {
  const d = useData();
  const nameOf = useTypeName();
  const auth = getAuth();
  const [balances, setBalances] = useState<{ corporationId: number; points: number }[] | null>(null);
  const [corp, setCorp] = useState<number>(CALDARI_NAVY);
  const [manualLp, setManualLp] = useState('');
  const [offers, setOffers] = useState<LpOffer[] | null>(null);
  const [quotes, setQuotes] = useState<Record<number, Quote>>({});
  const [live, setLive] = useState<Set<number>>(new Set());
  const [vol, setVol] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [hideLosses, setHideLosses] = useState(true);
  const [horizon, setHorizon] = useState(7);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'rate', dir: 'desc' });
  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: FIRST_DIR[key] }));

  const r = rates(d.settings);
  const canRead = hasScope(LOYALTY_SCOPE);

  // Loyalty balances, when the character will tell us.
  useEffect(() => {
    if (!auth || !canRead) return;
    let alive = true;
    loyaltyPoints(auth.characterId)
      .then(async (b) => {
        if (!alive || !b.length) return;
        setBalances(b);
        if (!b.some((x) => x.corporationId === CALDARI_NAVY)) setCorp(b[0].corporationId);
        const missing = b.map((x) => x.corporationId).filter((id) => !d.names[id]);
        if (!missing.length) return;
        const n = await resolveNames(missing).catch(() => ({}));
        if (alive && Object.keys(n).length) update((x) => ({ names: { ...x.names, ...n } }));
      })
      .catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.characterId, canRead]);

  const held = balances?.find((b) => b.corporationId === corp)?.points ?? 0;
  const lp = held || Math.max(0, parseFloat(manualLp.replace(/[^0-9.]/g, '')) || 0);

  // Names for everything on show. The Jita pass only names what it prices, and the rest of the
  // table would otherwise read as a column of type IDs.
  useEffect(() => {
    if (!offers) return;
    const missing = [...new Set(offers.map((o) => o.typeId))].filter((id) => !d.names[id]).slice(0, 500);
    if (!missing.length) return;
    let alive = true;
    resolveNames(missing)
      .then((n) => { if (alive && Object.keys(n).length) update((x) => ({ names: { ...x.names, ...n } })); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [offers, d.names]);

  const load = useCallback(async () => {
    setBusy('Reading the store…'); setErr(null); setOpen(null);
    try {
      const [o, rough] = await Promise.all([loyaltyOffers(corp), roughPrices()]);
      // The global average stands in for both sides of the book until the Jita pass replaces it.
      const q: Record<number, Quote> = {};
      for (const [id, p] of Object.entries(rough)) q[Number(id)] = { bestSell: p, bestBuy: p };
      setOffers(o); setQuotes(q); setLive(new Set()); setVol({});

      // Rank on the rough figures first and price only the best of them properly: 300-odd offers
      // would otherwise mean 400 book lookups before anything could be shown at all.
      const shortlist = o
        .map((x) => valueOffer(x, (id) => (q[id] ? patientPrice(q[id], r.f, r.t) : null), lp))
        .filter((x): x is LpValue => !!x)
        .sort(byIskPerLp)
        .slice(0, PRICE_TOP);
      const byOffer = new Map(o.map((x) => [x.offerId, x]));
      const ids = [...new Set(shortlist.flatMap((s) => [
        s.typeId, ...(byOffer.get(s.offerId)?.requiredItems.map((x) => x.typeId) ?? []),
      ]))];

      const gotQ: Record<number, Quote> = {};
      const gotV: Record<number, number | null> = {};
      const priced = new Set<number>();
      let next = 0, done = 0;
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
        while (next < ids.length) {
          const id = ids[next++];
          try {
            const book = await jitaBook(id);
            // marketBest, not the raw best: one mispriced listing must not set the valuation.
            gotQ[id] = { bestSell: marketBest(book.topSells, false), bestBuy: marketBest(book.topBuys, true) };
            priced.add(id);
          } catch { /* the rough price stands */ }
          try { gotV[id] = recentAverages(await marketHistory(id), 7).avgVol; } catch { gotV[id] = null; }
          setBusy(`Pricing ${++done} of ${ids.length} against Jita…`);
        }
      }));
      setQuotes((cur) => ({ ...cur, ...gotQ }));
      setLive(priced);
      setVol(gotV);

      const missing = ids.filter((id) => !d.names[id]);
      if (missing.length) {
        const n = await resolveNames(missing).catch(() => ({}));
        if (Object.keys(n).length) update((x) => ({ names: { ...x.names, ...n } }));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corp, lp, r.f, r.t]);

  const all = useMemo<Row[]>(() => {
    if (!offers) return [];
    const patient = (id: number) => (quotes[id] ? patientPrice(quotes[id], r.f, r.t) : null);
    const instant = (id: number): UnitPrice | null => (quotes[id] ? instantPrice(quotes[id], r.t) : null);
    const valued = offers
      .map((o) => ({ o, v: valueOffer(o, patient, lp) }))
      .filter((x): x is { o: LpOffer; v: LpValue } => !!x.v);
    const medianRate = median(valued.filter((x) => x.v.profit > 0).map((x) => x.v.iskPerLp));
    return valued.map(({ o, v }) => {
      const inst = valueOffer(o, instant, lp);
      const isLive = live.has(v.typeId);
      const perDay = vol[v.typeId] ?? null;
      const plan = planFor(v, perDay, horizon, d.settings.share);
      const runDays = daysToClear(v.quantity, perDay, d.settings.share);
      return {
        v, instant: inst, live: isLive, plan, perDay, runDays,
        notes: notesFor(v, { medianRate, plan, runDays, live: isLive, instantPerLp: inst?.iskPerLp ?? null }),
      };
    });
  }, [offers, quotes, live, vol, lp, r.f, r.t, horizon, d.settings.share]);

  const rows = useMemo(() => {
    const keep = hideLosses ? all.filter((x) => x.v.profit > 0) : all;
    const val = (x: Row): number => {
      switch (sort.key) {
        case 'rate': return x.v.iskPerLp;
        case 'instant': return x.instant?.iskPerLp ?? -Infinity;
        case 'outlay': return x.v.outlay;
        case 'revenue': return x.v.revenue;
        case 'profit': return x.v.profit;
        case 'days': return x.runDays;
        case 'total': return x.plan.profit;
        default: return 0;
      }
    };
    const sorted = [...keep].sort((a, b) =>
      sort.key === 'name'
        ? nameOf(a.v.typeId).localeCompare(nameOf(b.v.typeId))
        : val(a) - val(b) || nameOf(a.v.typeId).localeCompare(nameOf(b.v.typeId)));
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
    // nameOf closes over d.names, which is what changes the name ordering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, sort, hideLosses, d.names]);

  const profitable = all.filter((x) => x.v.profit > 0).length;
  const best = [...all].sort((a, b) => byIskPerLp(a.v, b.v)).find((x) => x.v.profit > 0);
  // What to do with the whole pile: best rate first, until the market or the points run out.
  // Only offers priced against the live book with a trading history to cap them: a plan built on a
  // global average and an unknown pace would spend every point on whatever looked best on paper.
  const spend = useMemo(
    () => (lp > 0
      ? spendPlan(
        all.filter((x) => x.live && x.plan.absorbable != null)
          .map((x) => ({ v: x.v, unitsAllowed: (x.plan.absorbable ?? 0) * x.v.quantity })),
        lp,
      )
      : []),
    [all, lp],
  );
  const spendTotal = spend.reduce((t, p) => t + p.profit, 0);
  const spentLp = spend.reduce((t, p) => t + p.lpSpent, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Loyalty</h1>
          <p>
            What your loyalty points are worth in ISK, and which offer to spend them on. Every offer is costed in
            full — the points, the store’s own ISK price, and buying whatever items it demands first — against what
            the goods would really net you at Jita after your broker fee and sales tax. Offers are ranked per point,
            because points are the scarce thing, not ISK.
          </p>
        </div>
        <div className="row">
          <button className="btn btn-primary" disabled={!!busy} onClick={load}>
            {busy ? busy : offers ? 'Check again' : 'Look up the store'}
          </button>
        </div>
      </div>

      {err && <p className="notice err" role="alert">{err}</p>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="fields">
          <div className="field">
            <label htmlFor="lp-corp">Loyalty store</label>
            <select id="lp-corp" value={corp} onChange={(e) => setCorp(Number(e.target.value))}>
              {!balances?.some((b) => b.corporationId === CALDARI_NAVY) && <option value={CALDARI_NAVY}>Caldari Navy</option>}
              {balances?.map((b) => (
                <option key={b.corporationId} value={b.corporationId}>
                  {d.names[b.corporationId] ?? `Corporation #${b.corporationId}`} — {units(b.points)} LP
                </option>
              ))}
            </select>
            <span className="hint">
              {canRead
                ? balances?.length ? 'Every corporation you hold points with' : 'Caldari Navy is the Jita trader’s store'
                : 'Log in with the loyalty scope to list yours'}
            </span>
          </div>
          <div className="field">
            <label htmlFor="lp-have">Points to spend</label>
            <input
              id="lp-have" type="text" inputMode="numeric"
              value={held ? units(held) : manualLp} disabled={held > 0}
              placeholder="e.g. 250000" onChange={(e) => setManualLp(e.target.value)}
            />
            <span className="hint">{held > 0 ? 'Your balance with this corporation' : 'Type a figure to see what it would be worth'}</span>
          </div>
          <div className="field">
            <label htmlFor="lp-horizon">And sell it all within (days)</label>
            <input
              id="lp-horizon" type="text" inputMode="decimal" value={plainNum(horizon)}
              onChange={(e) => { const n = parseFloat(e.target.value.replace(/[^0-9.]/g, '')); setHorizon(Number.isFinite(n) && n > 0 ? n : 1); }}
            />
            <span className="hint">Caps the runs at what the market will take, at {plainNum(d.settings.share)}% of its daily trade</span>
          </div>
        </div>
        <label className="check" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={hideLosses} onChange={(e) => setHideLosses(e.target.checked)} />
          <span>Hide offers that lose money — most of a store’s offers do</span>
        </label>
      </div>

      {!canRead && (
        <p className="notice warn">
          Add <code>esi-characters.read_loyalty.v1</code> to your application on developers.eveonline.com and log in
          again to have your point balances read for you. The store itself is public, so everything else here works
          without it — type a figure in and it will do the sums.
        </p>
      )}

      {busy && <p className="notice" role="status"><span className="spinner" aria-hidden="true" />{busy}</p>}

      {!offers ? (
        <p className="empty">
          Nothing looked up yet. Pick a store and press <strong>Look up the store</strong>. Every offer is ranked at
          once on a rough global price, then the best {PRICE_TOP} are priced properly against the live Jita book — a
          few seconds in all. Caldari Navy is the store a Jita trader usually has points with.
        </p>
      ) : (
        <>
          <p className="small muted" style={{ margin: '0 0 14px' }}>
            {units(all.length)} offers valued, <strong>{units(profitable)}</strong> of them worth taking
            {lp > 0 && <> with {units(lp)} points</>}.
            {live.size > 0
              ? ` The top ${PRICE_TOP} are priced against the live Jita book; the rest sit on a global average and are marked rough.`
              : ' All on a global average so far.'}
            {best && <> Best rate: <strong>{plainNum(Math.round(best.v.iskPerLp))} ISK per point</strong> on {nameOf(best.v.typeId)}.</>}
          </p>

          {spend.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>
                Spend it like this
                <Explain term="Spend it like this">
                  The best rate first, taken as many times as the market will absorb within the days you allowed, then
                  the next best, until the points run out. Spending everything on the single best offer would mean
                  listing more of one item than there are buyers for, which is why the list runs down several. Only
                  offers priced against the live Jita book with a trading history to judge the pace by are used.
                </Explain>
              </h2>
              <p className="small muted" style={{ margin: '0 0 12px' }}>
                {units(spentLp)} of {units(lp)} points across {spend.length} offer{spend.length === 1 ? '' : 's'} turns
                into about <strong className="pos">{iskBig(spendTotal)}</strong> of profit
                {spentLp > 0 && <> — {plainNum(Math.round(spendTotal / spentLp))} ISK a point overall</>}, selling over
                the next {plainNum(horizon)} day{horizon === 1 ? '' : 's'}.
                {spentLp < lp * 0.95 && <> The remaining {units(lp - spentLp)} points have nowhere worth going at these prices.</>}
              </p>
              <ol className="plan">
                {spend.slice(0, 8).map((pick) => (
                  <li key={pick.offerId}>
                    <strong>{units(pick.runs)}×</strong> {nameOf(pick.typeId)}
                    <span className="muted small"> — {units(pick.lpSpent)} LP for {iskBig(pick.profit)}</span>
                    <OpenInGame typeId={pick.typeId} name={nameOf(pick.typeId)} label="In game" />
                  </li>
                ))}
              </ol>
              {spend.length > 8 && <p className="small muted" style={{ margin: '8px 0 0' }}>And {spend.length - 8} smaller ones below.</p>}
            </div>
          )}

          {!rows.length ? (
            <p className="empty">
              Nothing in this store is worth taking at current Jita prices — the goods sell for less than the offers
              cost. That does happen; try another store, or untick the box above to see the numbers anyway.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data wide">
                <thead>
                  <tr>
                    {COLUMNS.map(([key, label]) => (
                      <th key={key} scope="col" aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button
                          type="button" className={'sort' + (sort.key === key ? ' on' : '')}
                          onClick={() => sortBy(key)} title={`Sort by ${label}`}
                        >
                          {label}<span className="arrow" aria-hidden="true">{sort.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                        {TIPS[label] && <Explain term={label}>{TIPS[label]}</Explain>}
                      </th>
                    ))}
                    <th scope="col">Why</th>
                    <th scope="col"><span className="opt">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, SHOW).map((row) => (
                    <OfferRow
                      key={row.v.offerId} row={row} name={nameOf(row.v.typeId)}
                      open={open === row.v.offerId}
                      onToggle={() => setOpen(open === row.v.offerId ? null : row.v.offerId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > SHOW && (
            <p className="small muted" style={{ marginTop: 12 }}>
              Showing {SHOW} of {units(rows.length)}. Sort by a different column to see the rest.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function OfferRow({ row, name, open, onToggle }: { row: Row; name: string; open: boolean; onToggle: () => void }) {
  const { v, instant, notes, plan, perDay, runDays } = row;
  const perUnit = v.revenue / v.quantity;
  return (
    <>
      <tr>
        <td className="name">
          <button className="link-btn" aria-expanded={open} onClick={onToggle}>{name}</button>
          {v.quantity > 1 && <small className="sub">{units(v.quantity)} per run</small>}
        </td>
        <td className={v.iskPerLp > 0 ? 'pos' : 'neg'}>{plainNum(Math.round(v.iskPerLp))}</td>
        <td className={!instant ? 'muted' : instant.iskPerLp > 0 ? '' : 'neg'}>
          {instant ? plainNum(Math.round(instant.iskPerLp)) : '–'}
        </td>
        <td>
          {units(v.lpCost)} LP
          <small className="sub">
            {v.outlay > 0 ? iskBig(v.outlay) : 'no ISK'}
            {v.itemsCost > 0 && `, ${iskBig(v.itemsCost)} of it items`}
          </small>
        </td>
        <td>
          {iskBig(v.revenue)}
          {v.quantity > 1 && <small className="sub">{isk(perUnit)} each, net</small>}
        </td>
        <td className={v.profit >= 0 ? 'pos' : 'neg'}>{iskBig(v.profit)}</td>
        <td>
          {perDay != null && perDay > 0
            ? <>{plainNum(Math.round(perDay))}<small className="sub">a run in {clears(runDays) ?? '?'}</small></>
            : <span className="muted" title="No trades recorded in the last week">–</span>}
        </td>
        <td>
          {plan.runs > 0
            ? <>{units(plan.runs)}<small className="sub">{iskBig(plan.profit)} in all</small></>
            : <span className="muted" title={v.runs > 0 ? 'The market will not take even one run inside the time you allowed' : 'Not enough points for one run'}>–</span>}
        </td>
        <td>
          {notes.length
            ? notes.map((n) => <span key={n} className="flag" title={NOTE[n].why}>{NOTE[n].short}</span>)
            : <span className="muted">–</span>}
        </td>
        <td>
          <button className="link-btn" onClick={() => navigate(`calculator?type=${v.typeId}`)} aria-label={`Open ${name} in the calculator`}>Calculator</button>
          <OpenInGame typeId={v.typeId} name={name} label="In game" />
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={10}>
            <dl className="figures">
              <div className="stat"><dt>One run</dt><dd>{units(v.lpCost)} LP{v.iskCost > 0 && <> + {iskBig(v.iskCost)}</>}<small>Gives {units(v.quantity)} × {name}</small></dd></div>
              <div className="stat"><dt>Items to buy first</dt><dd>{v.itemsCost > 0 ? iskBig(v.itemsCost) : 'None'}<small>{v.itemsCost > 0 ? 'At the cheapest Jita listings' : 'This offer wants points and ISK only'}</small></dd></div>
              <div className="stat"><dt>Listed and waited</dt><dd className="pos">{iskBig(v.revenue)}<small>{v.quantity > 1 ? `${isk(perUnit)} each after fees` : 'After your broker fee and sales tax'}</small></dd></div>
              <div className="stat"><dt>Sold now instead</dt><dd>{instant ? iskBig(instant.revenue) : 'Nothing bidding'}<small>{instant ? `${plainNum(Math.round(instant.iskPerLp))} ISK per point` : 'No buy orders to sell into'}</small></dd></div>
              <div className="stat"><dt>Per point</dt><dd className={v.iskPerLp > 0 ? 'pos' : 'neg'}>{plainNum(Math.round(v.iskPerLp))} ISK<small>{iskBig(v.profit)} profit ÷ {units(v.lpCost)} LP</small></dd></div>
              <div className="stat">
                <dt>What to actually do</dt>
                <dd className={plan.runs > 0 ? 'pos' : undefined}>
                  {plan.runs > 0 ? iskBig(plan.profit) : v.runs > 0 ? 'Not this one' : 'Not enough points'}
                  <small>
                    {plan.runs > 0
                      ? `${units(plan.runs)} runs, ${units(plan.units)} units to sell over ${clears(plan.days) ?? 'an unknown time'}`
                      : v.runs > 0 ? 'The market will not take a run of it in the time allowed' : `${units(v.lpCost)} LP needed for one run`}
                  </small>
                </dd>
              </div>
              <div className="stat">
                <dt>What limits it</dt>
                <dd>
                  {plan.limitedBy === 'market' ? 'The market' : plan.limitedBy === 'points' ? 'Your points' : 'Not known'}
                  <small>
                    {plan.limitedBy === 'market'
                      ? `Points afford ${units(plan.affordable)} runs; the market takes ${units(plan.absorbable ?? 0)} in the time allowed`
                      : plan.limitedBy === 'points'
                        ? `${units(plan.affordable)} runs affordable, and the market would take ${units(plan.absorbable ?? 0)}`
                        : 'No recent trading history, so there is nothing to judge the pace by'}
                  </small>
                </dd>
              </div>
            </dl>
            {notes.map((n) => (
              <p key={n} className="small muted" style={{ margin: '6px 0 0' }}>
                <strong className={NOTE[n].bad ? 'warn' : undefined}>{NOTE[n].short}.</strong> {NOTE[n].why}
              </p>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}
