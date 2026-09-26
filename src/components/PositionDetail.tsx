import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, GitPullRequestArrow, Inbox, PartyPopper, PenLine, RefreshCw, Trash2 } from 'lucide-react';
import { computePosition, vsMarket, type PositionCalc } from '../lib/positions';
import { priceUp, tickDown } from '../lib/tick';
import { marketBest, walkBids } from '../lib/relist';
import { confirmAsk } from '../lib/confirm';
import { breakEvenSell, rates } from '../lib/fees';
import { isk, iskBig, iskBigSigned, parseISK, pct, rid, units } from '../lib/format';
import { jitaOrders, marketHistory, snapshot, type OrderLite } from '../lib/market';
import { update, useData } from '../lib/store';
import { patchPosition } from '../lib/actions';
import { navigate } from '../lib/hooks';
import { nearMisses } from '../lib/signals';
import { competitionShare, EVEN_SPLIT, sideVolume } from '../lib/split';
import { JITA_44 } from '../lib/constants';
import { toast } from '../lib/toast';
import type { HistRow, MarketSnap, Position, Tx } from '../lib/types';
import { OpenInGame, useTypeName } from './common';
import { flip } from './Prospects';
import { Check, cssVars, Seg, Th } from './ui';

const DAY = 86400_000;
const fmtD = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '.');
const fmtDT = (iso: string) => iso.slice(0, 16).replace('T', ' ').replace(/-/g, '.');

export function PositionDetail({ id }: { id: string }) {
  const d = useData();
  const nameOf = useTypeName();
  const pos = d.positions.find((p) => p.id === id);
  const [hist, setHist] = useState<HistRow[]>([]);
  const [snap, setSnap] = useState<MarketSnap | null>(null);
  const [bids, setBids] = useState<OrderLite[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const typeId = pos?.typeId;
  const readMarket = async (force: boolean) => {
    if (!typeId) return;
    setRefreshing(true);
    try {
      const [s, o] = await Promise.all([snapshot(typeId, force), jitaOrders(typeId, force)]);
      setSnap(s);
      setBids(o.orders.filter((x) => x.isBuy));
    } catch { /* the figures that need it say so */ } finally { setRefreshing(false); }
  };
  useEffect(() => {
    if (!typeId) return;
    marketHistory(typeId).then(setHist).catch(() => undefined);
    readMarket(false);
    // "Today's" price has to keep being today's: ESI's book refreshes every five minutes, so re-read it.
    const t = setInterval(() => readMarket(false), 5 * 60_000);
    return () => clearInterval(t);
  }, [typeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = useMemo(
    () => (pos ? computePosition(pos, d, d.settings) : null),
    [pos, d.txs, d.journal, d.orders, d.settings], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!pos || !c) {
    return (
      <div className="page">
        <div className="empty"><Inbox aria-hidden="true" /><p>This position doesn’t exist any more.</p><button type="button" className="btn" onClick={() => navigate('positions')}>Back to positions</button></div>
      </div>
    );
  }
  const name = nameOf(pos.typeId);
  const r = rates(d.settings);
  const keep = 1 - r.f - r.t;
  const finished = pos.status === 'closed';
  const allSold = pos.status === 'open' && c.bought > 0 && c.stock === 0;
  const near = nearMisses(pos, Object.values(d.txs), d.positions, new Set(d.nearDone), JITA_44);

  // What your trades imply you hold, against what you actually hold. A sell order keeps the goods
  // itself, so real stock is the hangar plus whatever is still committed to open sell orders.
  const held = d.stock?.jita[pos.typeId] ?? null;
  const committed = Object.values(d.orders).filter((o) => o.typeId === pos.typeId && !o.isBuy && o.state === 'open').reduce((n, o) => n + o.volumeRemain, 0);
  const actual = held === null ? null : held + committed;
  const drift = actual === null ? null : actual - c.stock;
  // What the market will really pay, ignoring a token quantity someone has mispriced.
  const realBest = snap ? marketBest(snap.topSells, false) : null;
  const mispriced = realBest != null && snap?.bestSell != null && realBest !== snap.bestSell;
  const bookTime = snap ? new Date(snap.fetchedAt).toISOString().slice(11, 16) : null;

  type Stat = { l: string; v: string; n?: string; c?: string };
  const stats: Stat[] = [
    { l: 'Bought', v: `${units(c.bought)} units`, n: iskBig(c.boughtValue) },
    { l: 'Average buy price', v: isk(c.avgBuy), n: vsNote(vsMarket(c.buys, hist)) },
    { l: 'Sold', v: `${units(c.sold)} units`, n: iskBig(c.soldValue) },
    { l: 'Average sell price', v: isk(c.avgSell), n: vsNote(vsMarket(c.sells, hist)) },
    { l: 'In stock', v: `${units(c.stock)} units`, n: c.stock > 0 ? `${iskBig(c.costOfStock)} at cost` : 'Nothing left to sell' },
  ];
  if (actual !== null) {
    stats.push({
      l: 'Actually held', v: `${units(actual)} units`, c: drift !== 0 ? 'var(--acc2)' : undefined,
      n: drift === 0 ? 'Matches what your trades imply'
        : `${units(Math.abs(drift as number))} ${(drift as number) > 0 ? 'more' : 'fewer'} than your trades imply${committed > 0 ? `; ${units(committed)} sitting in sell orders` : ''}`,
    });
  }
  stats.push({
    l: 'Broker fees', v: iskBig(c.brokerFees),
    n: c.brokerEstimatedOrders ? `${units(c.brokerEstimatedOrders)} of ${units(c.brokerActualOrders + c.brokerEstimatedOrders)} orders estimated` : c.brokerActualOrders ? 'From your wallet journal' : 'No orders found yet',
  });
  stats.push({ l: 'Sales tax', v: iskBig(c.salesTax), n: c.taxEstimated ? `${units(c.taxEstimated)} of ${units(c.taxActual + c.taxEstimated)} sales estimated` : c.taxActual ? 'From your wallet journal' : undefined });
  if (c.manualFees > 0) stats.push({ l: 'Fees on manual entries', v: iskBig(c.manualFees) });
  if (c.priceChanges != null) stats.push({ l: 'Price changes', v: units(c.priceChanges), n: 'Counted from broker fee entries' });

  if (c.stock > 0 && c.avgCost != null && keep > 0) {
    const be = priceUp(breakEvenSell(c.avgCost, r, 0));
    const be2 = priceUp(breakEvenSell(c.avgCost, r, 2));
    stats.push({ l: 'Break-even sell price', v: isk(be), n: `Covers the ${isk(c.avgCost)} a unit cost you, listed once` });
    stats.push({ l: 'Break-even with 2 price changes', v: isk(be2), n: 'If you get undercut twice before it all sells — the usual case on a busy item. Each change is charged on the half assumed left.', c: 'var(--acc2)' });
    const sug = realBest != null ? tickDown(realBest) : NaN;
    if (Number.isFinite(sug)) {
      const ok = sug * keep >= c.avgCost;
      const profit = (sug * keep - c.avgCost) * c.stock;
      stats.push({
        l: 'Suggested sell price', v: isk(sug), c: ok ? 'var(--pos)' : 'var(--neg)',
        n: ok ? `One step under the cheapest ${mispriced ? 'genuine listing' : 'seller'}. Clears ${iskBigSigned(profit)} on your ${units(c.stock)} units`
          : `One step under the cheapest ${mispriced ? 'genuine listing' : 'seller'}, below your break-even — you’d lose ${iskBig(Math.abs(profit))}`,
      });
    }
    if (realBest != null && snap) {
      const unreal = c.stock * realBest * keep - c.costOfStock;
      const fills = snap.avgVol7 ? sideVolume(snap.avgVol7, snap.buyerShare ?? EVEN_SPLIT, false) * competitionShare(d.settings.share, snap.sellOrders) : 0;
      stats.push({
        l: 'Listed at today’s lowest sell', v: iskBigSigned(unreal), c: unreal >= 0 ? 'var(--pos)' : 'var(--neg)',
        n: `At ${isk(realBest)} after fees${mispriced ? `, skipping a token listing at ${isk(snap.bestSell)}` : ''} (book from ${bookTime} EVE)${fills > 0 ? ` — takes about ${flip(c.stock / fills)} at your share of buyers` : ''}`,
      });
    }
    if (bids) {
      const w = walkBids(c.stock, bids, r.t);
      if (w.sold > 0) {
        const dump = w.value - (c.avgCost * w.sold);
        stats.push({
          l: 'Dumped into buy orders now', v: iskBigSigned(dump), c: dump >= 0 ? 'var(--pos)' : 'var(--neg)',
          n: w.left > 0 ? `The bids in the book take ${units(w.sold)} units; the other ${units(w.left)} would have to wait for more buyers`
            : 'Walks down the best bids until your stock is gone, after sales tax',
        });
      } else stats.push({ l: 'Dumped into buy orders now', v: '–', n: 'Nobody is bidding for it in Jita 4-4 right now' });
    }
  }

  async function toggle(tx: Tx, match: string) {
    if (tx.source === 'manual') {
      if (!(await confirmAsk({ title: 'Delete this entry?', body: 'Only entries you added by hand can be deleted. Trades from ESI stay.', confirm: 'Delete', danger: true }))) return;
      update((x) => { const txs = { ...x.txs }; delete txs[tx.id]; return { txs }; });
      return;
    }
    if (match === 'excluded') patchPosition(pos!.id, (p) => ({ excluded: p.excluded.filter((e) => e !== tx.id) }));
    else if (match === 'included') patchPosition(pos!.id, (p) => ({ included: p.included.filter((e) => e !== tx.id) }));
    else patchPosition(pos!.id, (p) => ({ excluded: [...p.excluded, tx.id] }));
  }
  const close = () => { patchPosition(pos.id, { status: 'closed', closedAt: new Date().toISOString() }); toast(`${name} position closed. Result locked in at ${iskBigSigned(c.realized)}.`); };
  const reopen = () => {
    const other = d.positions.find((p) => p.typeId === pos.typeId && p.status === 'open' && p.id !== pos.id);
    if (other) { toast(`Close your other open ${name} position first.`, 'warn'); return; }
    patchPosition(pos.id, { status: 'open', closedAt: undefined });
  };
  async function remove() {
    if (!(await confirmAsk({ title: `Delete the ${name} position?`, body: 'Your ESI trades stay in the app. Entries you added by hand for this position are deleted with it.', confirm: 'Delete position', danger: true }))) return;
    update((x) => {
      const txs = { ...x.txs };
      Object.values(txs).forEach((t) => { if (t.positionId === pos!.id) delete txs[t.id]; });
      return { positions: x.positions.filter((p) => p.id !== pos!.id), txs };
    });
    toast(`Deleted the ${name} position.`, 'info');
    navigate('positions');
  }
  const countNear = () => {
    const ids = near.map((n) => n.tx.id);
    patchPosition(pos.id, (p) => ({ included: [...new Set([...p.included, ...ids])], excluded: p.excluded.filter((e) => !ids.includes(e)) }));
    update((x) => ({ nearDone: [...new Set([...x.nearDone, ...ids])] }));
    toast(`Counted in your ${name} position.`);
  };
  const ignoreNear = () => { update((x) => ({ nearDone: [...new Set([...x.nearDone, ...near.map((n) => n.tx.id)])] })); toast('Ignored — they won’t be suggested again.', 'info'); };
  const pc = c.realized >= 0 ? 'var(--pos)' : 'var(--neg)';

  return (
    <div className="page">
      <div className="page-head" data-rv="">
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', minWidth: 0 }}>
          <div style={{ position: 'relative', width: 76, height: 76, flex: 'none' }} aria-hidden="true">
            <div className="keep-motion" style={{ position: 'absolute', inset: -6, border: '1px solid color-mix(in oklab,var(--acc) 35%,transparent)', borderRadius: '50%', borderTopColor: 'var(--acc)', animation: 'spin 8s linear infinite' }} />
            <div style={{ width: 76, height: 76, borderRadius: '50%', background: `#0b1622 url(https://images.evetech.net/types/${pos.typeId}/icon?size=64) center/cover`, border: '1px solid var(--line-btn)' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <button type="button" className="back-link" onClick={() => navigate('positions')}><ArrowLeft aria-hidden="true" />Positions</button>
            <div className="row" style={{ gap: 12, marginTop: 2 }}>
              <h1 className="page-title" style={{ textTransform: 'none', letterSpacing: '.04em', margin: 0 }}>{name}</h1>
              <span className="status-tag" style={cssVars({ '--c': pos.status === 'open' ? 'var(--acc)' : 'var(--label)', padding: '3px 10px', fontSize: 11 })}>{pos.status === 'open' ? 'Open' : 'Closed'}</span>
            </div>
            <p style={{ margin: '4px 0 0', color: 'var(--label)', fontSize: 13 }}>
              {fmtD(Date.parse(pos.openedAt))} to {pos.closedAt ? fmtD(Date.parse(pos.closedAt)) : 'now'}{pos.jitaOnly ? ', Jita 4-4 trades only' : ', trades at any station'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 'clamp(30px,3vw,42px)', lineHeight: 1, color: pc, textShadow: `0 0 26px ${c.realized >= 0 ? 'rgba(110,231,168,.3)' : 'rgba(255,107,125,.3)'}` }}>{iskBigSigned(c.realized)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--sec)', marginTop: 4 }}>{finished ? 'Final profit after fees and tax' : 'Realized profit so far, after fees and tax'}</div>
            {c.roi != null && <div className="mono" style={{ fontSize: 12.5, color: 'var(--dim)' }}>{pct(c.roi, 1)} return on the cost of what you’ve sold</div>}
          </div>
          <div className="head-actions">
            <OpenInGame typeId={pos.typeId} name={name} label="Open in game" variant="btn" />
            {pos.status === 'open'
              ? <button type="button" className="btn" onClick={close}>Close position</button>
              : <button type="button" className="btn" onClick={reopen}>Reopen</button>}
            <button type="button" className="btn danger" onClick={remove}><Trash2 aria-hidden="true" />Delete</button>
          </div>
        </div>
      </div>

      {allSold && (
        <div className="notice ok" style={{ alignItems: 'center', background: 'rgba(110,231,168,.07)', border: '1px solid rgba(110,231,168,.35)' }}>
          <PartyPopper aria-hidden="true" />
          <span style={{ flex: 1 }}>Everything you bought has sold.</span>
          <button type="button" className="link-btn" style={{ color: 'var(--pos)', fontSize: 12 }} onClick={close}>Close the position to lock in the result</button>
        </div>
      )}
      {near.length > 0 && (
        <div className="row wide" style={{ padding: '12px 16px', background: 'color-mix(in oklab,var(--acc2) 7%,rgba(3,8,14,.8))', border: '1px solid color-mix(in oklab,var(--acc2) 40%,transparent)', animation: 'rise .3s' }}>
          <GitPullRequestArrow aria-hidden="true" style={{ width: 18, height: 18, color: 'var(--acc2)' }} />
          <span style={{ flex: 1, minWidth: 240 }}>
            <span style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>{near.length === 1 ? `1 trade of ${name} wasn’t counted` : `${near.length} trades of ${name} weren’t counted`}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: '#b6c6d4' }}>
              {near.map((n) => `${n.tx.isBuy ? 'Bought' : 'Sold'} ${units(n.tx.qty)} at ${isk(n.tx.unitPrice)} on ${fmtD(Date.parse(n.tx.date))} — ${n.why === 'before' ? 'before this position started' : 'outside Jita 4-4'}`).join('; ')}
            </span>
          </span>
          <button type="button" className="btn primary sm" onClick={countNear}>Count them</button>
          <button type="button" className="link-btn dim" onClick={ignoreNear}>Ignore</button>
        </div>
      )}
      {c.oversold > 0 && (
        <div className="notice warn">
          You sold {units(c.oversold)} more units than this position bought. They were probably bought before its start date: move the
          start date earlier, or count those purchases above. Until then they’re costed at your average buy price.
        </div>
      )}

      <div data-rv="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 10 }}>
        {stats.map((s) => (
          <div key={s.l} className="tile" style={cssVars({ '--c': s.c, padding: '11px 14px', borderColor: 'var(--line-2)', borderTopColor: s.c ?? 'var(--line-2)' })}>
            <div className="tile-l">{s.l}</div>
            <div className="tile-v" style={{ fontSize: 16 }}>{s.v}</div>
            {s.n && <div className="tile-n" style={{ fontSize: 11.5, marginTop: 2 }}>{s.n}</div>}
          </div>
        ))}
      </div>
      {snap && (
        <div className="row tight" style={{ fontSize: 12, color: 'var(--note)', marginTop: -6 }}>
          Market figures from the Jita book at {bookTime} EVE, re-read every five minutes while this is open.
          <button type="button" className="link-btn" disabled={refreshing} onClick={() => readMarket(true)}><RefreshCw aria-hidden="true" className={refreshing ? 'spinning' : undefined} />Check again</button>
        </div>
      )}

      {c.buys.length + c.sells.length > 0 ? <Charts pos={pos} c={c} hist={hist} /> : (
        <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--label)', border: '1px dashed var(--line-strong)' }}>
          <Inbox aria-hidden="true" style={{ width: 30, height: 30, color: 'var(--void)' }} />
          <p style={{ margin: '10px auto 0', maxWidth: 560, textWrap: 'pretty' }}>No trades counted yet. Place your orders in game, then sync. Trades of {name} at Jita 4-4 since {fmtD(Date.parse(pos.openedAt))} will show up here.</p>
        </div>
      )}

      <div data-rv="" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <section aria-label="Trades" className="panel flush" style={{ flex: '2 1 560px', minWidth: 0 }}>
          <div style={{ padding: '14px 16px 10px' }}>
            <div className="panel-title" style={{ fontSize: 12, letterSpacing: '.16em' }}>Trades</div>
            <p className="note small" style={{ marginTop: 4 }}>Exclude a purchase you made for your own use and it won’t count. Buy fees are tracked per order, so they show in the broker fee total rather than per row.</p>
          </div>
          <div className="tbl-scroll" style={{ maxHeight: 420 }}>
            {!c.rows.length ? <p className="note" style={{ padding: '0 16px 16px' }}>Nothing yet.</p> : (
              <table className="tbl short" style={{ minWidth: 860, fontSize: 12 }}>
                <thead><tr><Th left>Date</Th><Th left>Trade</Th><Th>Quantity</Th><Th>Price</Th><Th>Value</Th><Th>Tax and fees</Th><Th left>Counts</Th><th scope="col" style={{ color: 'var(--faint-2)' }}>Action</th></tr></thead>
                <tbody>
                  {c.rows.map(({ tx, match, fee, feeActual }) => (
                    <tr key={tx.id} className={'hover' + (match === 'excluded' ? ' dimmer' : '')}>
                      <td className="l" style={{ color: 'var(--dim)' }}>{fmtDT(tx.date)}</td>
                      <td className="l lbl" style={{ color: tx.isBuy ? 'var(--buy)' : 'var(--neg-t)', fontSize: 11.5 }}>{tx.isBuy ? 'Buy' : 'Sell'}{tx.source === 'manual' ? ' (manual)' : ''}</td>
                      <td>{units(tx.qty)}</td>
                      <td>{isk(tx.unitPrice)}</td>
                      <td>{iskBig(tx.qty * tx.unitPrice)}</td>
                      <td style={{ color: 'var(--sec)' }}>{fee > 0 ? `${iskBig(fee)}${feeActual ? '' : ' est.'}` : '–'}</td>
                      <td className="l txt" style={{ color: match === 'excluded' ? 'var(--neg)' : 'var(--dim)' }}>{match === 'excluded' ? 'No, excluded' : match === 'included' ? 'Yes, added by you' : 'Yes'}</td>
                      <td><button type="button" className={'link-btn' + (tx.source === 'manual' ? ' danger' : '')} onClick={() => toggle(tx, match)}>{tx.source === 'manual' ? 'Delete' : match === 'excluded' ? 'Count it' : match === 'included' ? 'Remove' : 'Exclude'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <div className="col" style={{ gap: 14, flex: '1 1 300px' }}>
          <section aria-label="What counts" className="panel" style={{ clipPath: 'none', padding: 16, gap: 12 }}>
            <div className="panel-title" style={{ fontSize: 12, letterSpacing: '.16em' }}>What counts</div>
            <div className="field">
              <label htmlFor="ps-from">Count trades from <span style={{ color: 'var(--faint)', textTransform: 'none' }}>EVE time</span></label>
              <input id="ps-from" type="date" className="num" style={{ colorScheme: 'dark' }} value={pos.openedAt.slice(0, 10)}
                onChange={(e) => e.target.value && patchPosition(pos.id, { openedAt: `${e.target.value}T00:00:00Z` })} />
            </div>
            <Check bare checked={pos.jitaOnly} onChange={(v) => patchPosition(pos.id, { jitaOnly: v })}>Only count trades in Jita 4-4</Check>
          </section>
          <ManualEntry pos={pos} />
        </div>
      </div>
    </div>
  );
}

function vsNote(v: number | null): string | undefined {
  return v == null ? undefined : `${v >= 0 ? '+' : ''}${pct(v, 1)} vs daily average`;
}

function Charts({ pos, c, hist }: { pos: Position; c: PositionCalc; hist: HistRow[] }) {
  const W = 800, H = 240;
  const t1 = pos.closedAt ? Date.parse(pos.closedAt) : Date.now();
  const t0 = (c.firstT ?? t1 - 30 * DAY) - 3 * DAY;
  const X = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const market = hist.map((h) => ({ t: Date.parse(h.date + 'T00:00:00Z'), p: h.average })).filter((h) => h.t >= t0 - DAY && h.t <= t1 + DAY);
  const cost = c.series.filter((p) => p.avgCost != null).map((p) => ({ t: p.t, v: p.avgCost as number }));
  const prices = [...market.map((m) => m.p), ...c.buys.map((b) => b.price), ...c.sells.map((s) => s.price), ...cost.map((x) => x.v)];
  const mn = Math.min(...prices) * 0.995, mx = Math.max(...prices) * 1.005;
  const Y = (v: number) => 14 + (1 - (v - mn) / (mx - mn || 1)) * (H - 28);
  const mline = market.map((m, i) => `${i ? 'L' : 'M'}${X(m.t).toFixed(1)} ${Y(m.p).toFixed(1)}`).join('');
  let cpath = '';
  cost.forEach((p, i) => { cpath += i ? `H${X(p.t).toFixed(1)}V${Y(p.v).toFixed(1)}` : `M${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`; });
  if (cost.length) cpath += `H${W}`;
  const qm = Math.max(1, ...c.buys.map((b) => b.qty), ...c.sells.map((s) => s.qty));
  const rad = (q: number) => 3 + Math.sqrt(q / qm) * 8;

  const sMax = Math.max(1, ...c.series.map((p) => p.stock));
  const rs = c.series.map((p) => p.realized);
  const rmn = Math.min(0, ...rs), rmx = Math.max(1, ...rs);
  const Ys = (v: number) => H - 6 - (v / sMax) * (H - 30);
  const Yr = (v: number) => 14 + (1 - (v - rmn) / (rmx - rmn || 1)) * (H - 28);
  let sp = `M0 ${H}`, rp = `M0 ${Yr(0).toFixed(1)}`, prevS = 0, prevR = 0;
  for (const e of c.series) {
    const x = X(e.t).toFixed(1);
    sp += `L${x} ${Ys(prevS).toFixed(1)}L${x} ${Ys(e.stock).toFixed(1)}`;
    rp += `L${x} ${Yr(prevR).toFixed(1)}L${x} ${Yr(e.realized).toFixed(1)}`;
    prevS = e.stock; prevR = e.realized;
  }
  sp += `L${W} ${Ys(prevS).toFixed(1)}L${W} ${H}Z`;
  rp += `L${W} ${Yr(prevR).toFixed(1)}`;
  const rc = c.realized >= 0 ? 'var(--pos)' : 'var(--neg)';
  const end = pos.closedAt ? fmtD(t1) : 'today';

  return (
    <div data-rv="" className="g-440" style={{ gap: 14 }}>
      <section className="panel" aria-label="Your prices against the market" style={{ gap: 0 }}>
        <div className="panel-title" style={{ fontSize: 12, letterSpacing: '.16em' }}>Your prices against the market</div>
        <p className="note small" style={{ margin: '4px 0 10px' }}>Dot size shows quantity. The dashed line is your average cost for the stock you held at the time. Hover a dot for the trade.</p>
        <div className="chart-box" style={{ height: 240, background: 'rgba(2,7,12,.4)' }}>
          <svg className="plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 60H800M0 120H800M0 180H800" stroke="rgba(130,185,225,.07)" vectorEffect="non-scaling-stroke" fill="none" />
            <path d={mline} fill="none" stroke="var(--label)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <path d={cpath} fill="none" stroke="var(--acc2)" strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
          </svg>
          {c.buys.map((b, i) => (
            <span key={'b' + i} className="evdot" tabIndex={0} data-tip={`Bought ${units(b.qty)} at ${isk(b.price)}`} data-tip-title={fmtD(b.t)}
              style={cssVars({ left: `${(X(b.t) / W) * 100}%`, top: `${(Y(b.price) / H) * 100}%`, width: rad(b.qty) * 2, height: rad(b.qty) * 2, margin: `${-rad(b.qty)}px 0 0 ${-rad(b.qty)}px`, '--c': 'color-mix(in oklab,var(--acc) 75%,transparent)', boxShadow: '0 0 0 1px var(--acc)' })} />
          ))}
          {c.sells.map((s, i) => {
            const rr = rad(s.qty) * 1.2;
            return (
              <span key={'s' + i} className="evdot" tabIndex={0} data-tip={`Sold ${units(s.qty)} at ${isk(s.price)}`} data-tip-title={fmtD(s.t)}
                style={cssVars({ left: `${(X(s.t) / W) * 100}%`, top: `${(Y(s.price) / H) * 100}%`, width: rr * 1.4, height: rr * 1.4, margin: `${-rr * 0.7}px 0 0 ${-rr * 0.7}px`, borderRadius: 0, transform: 'rotate(45deg)', '--c': 'rgba(255,107,125,.7)', boxShadow: '0 0 0 1px var(--neg)' })} />
            );
          })}
          <span className="ax" style={{ left: 8, top: 6 }}>{iskBig(mx)}</span>
          <span className="ax" style={{ left: 8, bottom: 20 }}>{iskBig(mn)}</span>
          <span className="ax f" style={{ left: 8, bottom: 4 }}>{fmtD(t0)}</span>
          <span className="ax f" style={{ right: 8, bottom: 4 }}>{end}</span>
        </div>
        <div className="legend" style={{ marginTop: 10, fontSize: 12, color: 'var(--sec)', gap: 16 }}>
          <span><i style={{ width: 14, height: 2, background: 'var(--label)' }} />Daily average in The Forge</span>
          <span><i style={{ width: 14, height: 0, borderTop: '2px dashed var(--acc2)' }} />Your average cost</span>
          <span><i style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--acc)' }} />Your buys</span>
          <span><i style={{ width: 9, height: 9, background: 'var(--neg)', transform: 'rotate(45deg)' }} />Your sells</span>
        </div>
      </section>
      <section className="panel" aria-label="Profit and stock over time" style={{ gap: 0 }}>
        <div className="panel-title" style={{ fontSize: 12, letterSpacing: '.16em' }}>Profit and stock over time</div>
        <p className="note small" style={{ margin: '4px 0 10px' }}>Profit drops when you pay fees and rises as units sell. The shaded area is how many units you held.</p>
        <div className="chart-box" style={{ height: 240, background: 'rgba(2,7,12,.4)' }}>
          <svg className="plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <path d={sp} fill="color-mix(in oklab,var(--acc) 16%,transparent)" stroke="color-mix(in oklab,var(--acc) 50%,transparent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <path d={`M0 ${Yr(0).toFixed(1)}H${W}`} stroke="rgba(130,185,225,.25)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" fill="none" />
            <path d={rp} fill="none" stroke={rc} strokeWidth={2.5} vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 5px ${rc})` }} />
          </svg>
          <span className="ax" style={{ left: 8, top: 6, color: rc }}>{iskBigSigned(rmx)}</span>
          <span className="ax" style={{ right: 8, top: 6, color: 'var(--acc)' }}>{units(sMax)} u</span>
          <span className="ax f" style={{ left: 8, bottom: 4 }}>{fmtD(t0)}</span>
          <span className="ax f" style={{ right: 8, bottom: 4 }}>{end}</span>
        </div>
        <div className="legend" style={{ marginTop: 10, fontSize: 12, color: 'var(--sec)', gap: 16 }}>
          <span><i style={{ width: 14, height: 2, background: rc }} />Realized profit</span>
          <span><i style={{ width: 10, height: 10, background: 'color-mix(in oklab,var(--acc) 30%,transparent)' }} />Units held</span>
        </div>
      </section>
    </div>
  );
}

function ManualEntry({ pos }: { pos: Position }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'buy' | 'sell'>('buy');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('');

  function add() {
    const q = parseISK(qty), p = parseISK(price), f = fees.trim() ? parseISK(fees) : undefined;
    if (!(q > 0) || !(p > 0) || !date) { toast('Enter a date, a quantity and a price.', 'err'); return; }
    if (f !== undefined && !(f >= 0)) { toast('Fees must be a number, or leave them empty to estimate.', 'err'); return; }
    const tx: Tx = {
      id: 'm-' + rid(), source: 'manual', typeId: pos.typeId, positionId: pos.id,
      date: `${date}T12:00:00Z`, isBuy: kind === 'buy', qty: q, unitPrice: p, fees: f,
    };
    update((x) => ({ txs: { ...x.txs, [tx.id]: tx } }));
    setQty(''); setPrice(''); setFees('');
    toast('Trade added by hand.');
  }

  return (
    <section className="panel flush" style={{ clipPath: 'none' }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'none', border: 0, color: 'var(--ink)', textAlign: 'left' }}>
        <PenLine aria-hidden="true" style={{ width: 15, height: 15, color: 'var(--acc)' }} />
        <span className="panel-title" style={{ flex: 1, fontSize: 12, letterSpacing: '.16em' }}>Add a trade by hand</span>
        <ChevronDown aria-hidden="true" style={{ width: 15, height: 15, color: 'var(--label)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .3s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'unfold .32s cubic-bezier(.2,.8,.2,1)' }}>
          <p className="note small">For trades older than ESI’s wallet history (about 30 days), or made on another character.</p>
          <Seg label="Trade" value={kind} onChange={setKind} size="md" options={[{ v: 'buy', label: 'Buy' }, { v: 'sell', label: 'Sell' }]} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="m-date">Date</label><input id="m-date" type="date" className="num" style={{ colorScheme: 'dark' }} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="field"><label htmlFor="m-qty">Quantity</label><input id="m-qty" className="num" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div className="field"><label htmlFor="m-price">Price per unit</label><input id="m-price" className="num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="m-fees">Fees and tax paid <span style={{ color: 'var(--faint)', textTransform: 'none' }}>optional</span></label>
              <input id="m-fees" className="num" inputMode="decimal" placeholder="Leave empty to estimate" value={fees} onChange={(e) => setFees(e.target.value)} />
            </div>
          </div>
          <button type="button" className="btn primary" onClick={add}>Add trade</button>
        </div>
      )}
    </section>
  );
}
