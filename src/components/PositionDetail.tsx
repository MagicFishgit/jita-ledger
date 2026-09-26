import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, Inbox, PartyPopper, PenLine, RefreshCw, Trash2 } from 'lucide-react';
import { computePosition, vsMarketDetail, type PositionCalc } from '../lib/positions';
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
import { typicalDailyVolume } from '../lib/prospects';
import { JITA_44 } from '../lib/constants';
import { toast } from '../lib/toast';
import type { HistRow, MarketSnap, Position, Tx } from '../lib/types';
import { OpenInGame, useTypeName } from './common';
import { NearMissBanner } from './NearMisses';
import { flip } from './Prospects';
import { Check, cssVars, Seg, Th, Tip } from './ui';

const DAY = 86400_000;
const fmtD = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '.');
const fmtDT = (iso: string) => iso.slice(0, 16).replace('T', ' ').replace(/-/g, '.');

export function PositionDetail({ id }: { id: string }) {
  const d = useData();
  const nameOf = useTypeName();
  const pos = d.positions.find((p) => p.id === id);
  const [hist, setHist] = useState<HistRow[]>([]);
  const [snap, setSnap] = useState<MarketSnap | null>(null);
  const [book, setBook] = useState<OrderLite[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const typeId = pos?.typeId;
  const readMarket = async (force: boolean) => {
    if (!typeId) return;
    setRefreshing(true);
    try {
      const [s, o] = await Promise.all([snapshot(typeId, force), jitaOrders(typeId, force)]);
      setSnap(s);
      setBook(o.orders);
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
  // A typical day's volume keeps real cheap sellers from being waved away as a token listing on a thin
  // item. The median, because one enormous day (often your own buying) would inflate an average.
  const typicalDay = typicalDailyVolume(hist);
  const realBest = snap ? marketBest(snap.topSells, false, typicalDay) : null;
  const mispriced = realBest != null && snap?.bestSell != null && realBest !== snap.bestSell;
  const bookTime = snap ? new Date(snap.fetchedAt).toISOString().slice(11, 16) : null;

  const bids = book?.filter((x) => x.isBuy) ?? null;
  // Lines for the price chart: your open orders at their live price, and today's best prices from others.
  const ownIds = new Set(Object.values(d.orders).map((o) => o.orderId));
  const openMine = Object.values(d.orders).filter((o) => o.typeId === pos.typeId && o.state === 'open' && o.volumeRemain > 0 && (!pos.jitaOnly || o.locationId === JITA_44));
  const others = (book ?? []).filter((x) => !ownIds.has(x.id));
  const otherSells = others.filter((x) => !x.isBuy).map((x) => ({ price: x.price, volume: x.volume }));
  const otherBids = others.filter((x) => x.isBuy).map((x) => ({ price: x.price, volume: x.volume }));
  const bestOtherSell = otherSells.length ? marketBest(otherSells, false, typicalDay) : null;
  const bestOtherBid = otherBids.length ? marketBest(otherBids, true, typicalDay) : null;
  const marks: { price: number; label: string; color: string; dashed?: boolean }[] = [
    ...openMine.map((o) => ({ price: book?.find((x) => x.id === o.orderId)?.price ?? o.price, label: o.isBuy ? 'Your buy' : 'Your sell', color: o.isBuy ? 'var(--acc)' : 'var(--acc2)', dashed: true })),
    ...(bestOtherSell != null ? [{ price: bestOtherSell, label: 'Cheapest now', color: 'var(--neg-t)' }] : []),
    ...(bestOtherBid != null ? [{ price: bestOtherBid, label: 'Best bid now', color: 'var(--bid-t)' }] : []),
  ].filter((m, i, a) => a.findIndex((x) => x.label === m.label && x.price === m.price) === i);
  type Stat = { l: string; v: string; n?: string; c?: string; tip?: string };
  const buyVs = vsMarketDetail(c.buys, hist), sellVs = vsMarketDetail(c.sells, hist);
  const stats: Stat[] = [
    { l: 'Bought', v: `${units(c.bought)} units`, n: `for ${iskBig(c.boughtValue)}` },
    { l: 'Average buy price', v: isk(c.avgBuy), n: vsNote(buyVs, true) },
    { l: 'Sold', v: `${units(c.sold)} units`, n: c.sold ? `for ${iskBig(c.soldValue)}` : 'Nothing sold yet' },
    { l: 'Average sell price', v: isk(c.avgSell), n: c.sold ? vsNote(sellVs, false) : undefined },
    {
      l: 'Still to sell', v: `${units(c.stock)} units`,
      n: c.stock > 0 ? `They cost you ${iskBig(c.costOfStock)}, ${isk(c.avgCost)} each including the fee on the buy` : 'Everything bought has sold',
    },
  ];
  if (actual !== null) {
    stats.push({
      l: 'In your hangar and orders', v: `${units(actual)} units`, c: drift !== 0 ? 'var(--acc2)' : undefined,
      n: drift === 0 ? `Matches what your trades say you should have${committed > 0 ? ` (${units(committed)} of them listed for sale)` : ''}`
        : `${units(Math.abs(drift as number))} ${(drift as number) > 0 ? 'more' : 'fewer'} than your trades say you should have${committed > 0 ? `; ${units(committed)} are listed for sale` : ''}`,
      tip: 'Counted from your assets at the last sync: loose in your Jita 4-4 hangar plus whatever is listed in your sell orders, which hold their own goods. If this differs from "Still to sell", some trades are missing from this position or were counted by another.',
    });
  }
  stats.push({
    l: 'Broker fees', v: iskBig(c.brokerFees),
    n: c.prepaidFees > 0 ? `${iskBig(c.prepaidFees)} of it is for orders still waiting to fill, and counts against your profit only as they do` : c.brokerFees ? 'Charged against the units they were paid for' : 'No orders found yet',
    tip: `A fee charged when you place an order, on the whole order, plus one each time you change its price. ESI’s journal doesn’t say which order a fee was for, so each is matched to your order by the second it was charged; ${c.brokerEstimatedOrders ? `${units(c.brokerEstimatedOrders)} of ${units(c.brokerActualOrders + c.brokerEstimatedOrders)} orders’ placing fees couldn’t be matched and are worked out from your rate` : 'every order’s placing fee was matched'}. Each order’s fee is split across its units, so a listing for 2,000 units isn’t counted as a loss on the first 5 that sell.`,
  });
  stats.push({
    l: 'Sales tax', v: iskBig(c.salesTax),
    n: c.taxActual && !c.taxEstimated ? 'From your wallet journal' : c.taxActual ? `${units(c.taxEstimated)} of ${units(c.taxActual + c.taxEstimated)} sales worked out from your tax rate` : c.taxEstimated ? 'Worked out from your tax rate' : undefined,
    tip: 'Charged on every sale. Read from your wallet journal, matched to the sale by the second it happened and its size; worked out from your tax rate at the time when no entry matches.',
  });
  if (c.manualFees > 0) stats.push({ l: 'Fees on manual entries', v: iskBig(c.manualFees) });
  stats.push({
    l: 'Price changes', v: c.priceChanges ? iskBig(c.relistFees) : 'None seen', c: c.priceChanges ? 'var(--acc2)' : undefined,
    n: c.priceChanges
      ? `${units(c.priceChanges)} change${c.priceChanges === 1 ? '' : 's'}${c.relistsEstimated ? `; ${units(c.relistsEstimated)} of the fees worked out from your rates` : ', each fee read from your journal'}`
      : 'Moving an order’s price costs a fee each time; they’ll show here',
    tip: 'Each time you change an order’s price to get back on top, you pay a fee. The app keeps every version of your orders it sees at each sync: a new price is a change, and its fee is matched to your wallet journal by the second it was charged, or worked out from your rates if no entry matches. Two changes between syncs show as one, and changes made before the app started keeping order history can’t be counted. A change’s fee is charged on the units still on the order, so like the listing fee it comes off your profit a share at a time as those units sell.',
  });

  if (c.stock > 0 && c.avgCost != null && keep > 0) {
    const be = priceUp(breakEvenSell(c.avgCost, r, 0));
    const be2 = priceUp(breakEvenSell(c.avgCost, r, 2));
    stats.push({
      l: 'Break-even price', v: isk(be),
      n: 'Sell above this and each unit makes money',
      tip: `What a unit has to sell for to get back the ${isk(c.avgCost)} it cost you, after the broker fee and sales tax on the sale itself. Example: sell one at ${isk(be)} and you end up with exactly what you paid.`,
    });
    stats.push({
      l: 'Break-even after 2 price cuts', v: isk(be2), c: 'var(--acc2)',
      n: 'The same, if you have to lower your price twice before it all sells',
      tip: `Changing an order’s price costs another fee, and on a busy item you’ll usually be undercut and change it a couple of times. This assumes two changes, each charged on the half of the order still unsold. Example: list at ${isk(be2)}, get undercut twice, and you still break even.`,
    });
    const sug = realBest != null ? tickDown(realBest) : NaN;
    if (Number.isFinite(sug) && snap) {
      const profit = (sug * keep - c.avgCost) * c.stock;
      const fills = snap.avgVol7 ? sideVolume(snap.avgVol7, snap.buyerShare ?? EVEN_SPLIT, false) * competitionShare(d.settings.share, snap.sellOrders) : 0;
      stats.push({
        l: 'Undercut the cheapest seller', v: isk(sug), c: profit >= 0 ? 'var(--pos)' : 'var(--neg)',
        n: `${profit >= 0 ? 'Makes' : 'Loses'} ${iskBig(Math.abs(profit))} if all ${units(c.stock)} sell at this price${fills > 0 ? `, in about ${flip(c.stock / fills)} at your share of buyers` : ''}`,
        tip: `One price step under the cheapest real listing in Jita right now (${isk(realBest)})${mispriced ? `, ignoring a token listing at ${isk(snap.bestSell)} that’s too small to matter` : ''}. The profit is after the broker fee and sales tax on the sale, against what the units cost you. How long it takes comes from how many units a day buyers take and the share of them you’d get.`,
      });
    }
    if (bids) {
      const w = walkBids(c.stock, bids, r.t);
      if (w.sold > 0) {
        const dump = w.value - (c.avgCost * w.sold);
        stats.push({
          l: 'Sell to buyers right now', v: iskBigSigned(dump), c: dump >= 0 ? 'var(--pos)' : 'var(--neg)',
          n: w.left > 0 ? `The buy orders in Jita take ${units(w.sold)} of your ${units(c.stock)}; nobody is bidding for the other ${units(w.left)}`
            : `The buy orders in Jita take all ${units(c.stock)}, at ${isk(w.value / w.sold)} each after tax`,
          tip: 'What you’d make or lose selling straight into the buy orders in Jita now, instead of listing: the best bid first, then the next, until your stock runs out or the bids do. After sales tax, against what those units cost you. The quick way out, usually at a loss.',
        });
      } else stats.push({ l: 'Sell to buyers right now', v: '–', n: 'Nobody is bidding for it in Jita 4-4 right now' });
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
            <div style={{ fontSize: 12.5, color: 'var(--sec)', marginTop: 4 }}>{finished ? 'Final profit, after fees and tax' : `Profit on the ${units(c.sold)} sold so far, after their fees and tax`}</div>
            {c.roi != null && <div className="mono" style={{ fontSize: 12.5, color: 'var(--dim)' }}>{c.roi >= 0 ? '+' : ''}{pct(c.roi, 1)} on what those units cost you</div>}
            {c.prepaidFees > 0 && <div style={{ fontSize: 12, color: 'var(--note)', marginTop: 2 }} data-tip="A broker fee is paid on a whole order when you place it. The part for units that haven’t traded yet isn’t a loss on what has sold, so it’s set aside and comes off as those units sell." data-tip-title="Fees paid up front">+ {iskBig(c.prepaidFees)} of broker fees paid up front on your open orders</div>}
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

      <YourOrders pos={pos} book={book} bookTime={bookTime} />

      {allSold && (
        <div className="notice ok" style={{ alignItems: 'center', background: 'rgba(110,231,168,.07)', border: '1px solid rgba(110,231,168,.35)' }}>
          <PartyPopper aria-hidden="true" />
          <span style={{ flex: 1 }}>Everything you bought has sold.</span>
          <button type="button" className="link-btn" style={{ color: 'var(--pos)', fontSize: 12 }} onClick={close}>Close the position to lock in the result</button>
        </div>
      )}
      {near.length > 0 && <NearMissBanner pos={pos} near={near} name={name} />}
      {c.oversold > 0 && (
        <div className="notice warn">
          You sold {units(c.oversold)} more units than this position bought. They were probably bought before its start date: move the
          start date earlier, or count those purchases above. Until then they’re costed at your average buy price.
        </div>
      )}

      <div data-rv="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 10 }}>
        {stats.map((s) => (
          <div key={s.l} className="tile" style={cssVars({ '--c': s.c, padding: '11px 14px', borderColor: 'var(--line-2)', borderTopColor: s.c ?? 'var(--line-2)' })}>
            <div className="tile-l">{s.l}{s.tip && <Tip text={s.tip} title={s.l} />}</div>
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

      {c.buys.length + c.sells.length > 0 ? <Charts pos={pos} c={c} hist={hist} marks={marks} /> : (
        <div style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--label)', border: '1px dashed var(--line-strong)' }}>
          <Inbox aria-hidden="true" style={{ width: 30, height: 30, color: 'var(--void)' }} />
          <p style={{ margin: '10px auto 0', maxWidth: 560, textWrap: 'pretty' }}>No trades counted yet. Place your orders in game, then sync. Trades of {name} at Jita 4-4 since {fmtD(Date.parse(pos.openedAt))} will show up here.</p>
        </div>
      )}

      <div data-rv="" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <section aria-label="Trades" className="panel flush" style={{ flex: '2 1 560px', minWidth: 0 }}>
          <div style={{ padding: '14px 16px 10px' }}>
            <div className="panel-title" style={{ fontSize: 12, letterSpacing: '.16em' }}>Trades</div>
            <p className="note small" style={{ marginTop: 4 }}>Exclude a purchase you made for your own use and it won’t count. Broker fees are charged per order, not per trade, so they’re in the broker fee total rather than on each row.</p>
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

/**
 * Your open orders for this item, with the price each is at now and where it stands. The price comes
 * from the live book where the order is in it, since a relist made in game shows there within minutes
 * while the synced order list is cached for twenty.
 */
function YourOrders({ pos, book, bookTime }: { pos: Position; book: OrderLite[] | null; bookTime: string | null }) {
  const d = useData();
  const mine = Object.values(d.orders)
    .filter((o) => o.typeId === pos.typeId && o.state === 'open' && o.volumeRemain > 0 && (!pos.jitaOnly || o.locationId === JITA_44))
    .sort((a, b) => Number(a.isBuy) - Number(b.isBuy) || a.price - b.price);
  const myIds = new Set(Object.values(d.orders).map((o) => o.orderId));
  return (
    <section className="panel" aria-label="Your orders" style={{ padding: '12px 16px', gap: 8 }}>
      <div className="panel-head">
        <span className="panel-title" style={{ fontSize: 12, letterSpacing: '.16em' }}>Your orders</span>
        {mine.length > 0 && <button type="button" className="link-btn" onClick={() => navigate('orders')}>Should I move them? See Orders</button>}
      </div>
      {!mine.length ? (
        <p className="note small">No open orders for this item{d.meta.lastSync ? '' : ' — sync to see them'}. Anything still in stock isn’t listed for sale.</p>
      ) : (
        <div className="your-orders">
          {mine.map((o) => {
            const live = book?.find((x) => x.id === o.orderId);
            const price = live?.price ?? o.price;
            const left = live?.volume ?? o.volumeRemain;
            // The competition: everyone else on the same side, best first.
            const others = (book ?? []).filter((x) => x.isBuy === o.isBuy && !myIds.has(x.id));
            const best = others.length ? (o.isBuy ? Math.max(...others.map((x) => x.price)) : Math.min(...others.map((x) => x.price))) : null;
            const ahead = others.filter((x) => (o.isBuy ? x.price > price : x.price < price));
            let status: { t: string; c: string };
            if (!book) status = { t: 'Checking the market…', c: 'var(--note)' };
            else if (!live) status = { t: 'Not in the market right now — it may have just filled, expired or been changed. The next sync will say.', c: 'var(--acc2)' };
            else if (best == null) status = { t: `Nobody else is ${o.isBuy ? 'buying' : 'selling'} in Jita`, c: 'var(--pos)' };
            else if (ahead.length) status = { t: `Undercut: ${units(ahead.length)} ${o.isBuy ? 'higher bid' : 'cheaper listing'}${ahead.length === 1 ? '' : 's'}, the best at ${isk(best)} (${o.isBuy ? '+' : '−'}${isk(Math.abs(best - price))})`, c: 'var(--neg)' };
            else if (best === price) status = { t: `Tied with another ${o.isBuy ? 'bid' : 'listing'} at the best price; the older order fills first`, c: 'var(--acc2)' };
            else status = { t: `${o.isBuy ? 'Highest bid' : 'Cheapest listing'} in Jita — next best is ${isk(best)}`, c: 'var(--pos)' };
            return (
              <div key={o.orderId} className="yo-row">
                <span className="flag" style={{ fontSize: 10, color: o.isBuy ? 'var(--bid-t)' : 'var(--neg-t)', borderColor: 'currentColor' }}>{o.isBuy ? 'Buying' : 'Selling'}</span>
                <span className="mono" style={{ fontSize: 16, color: 'var(--ink)' }}>{isk(price)}</span>
                <span style={{ fontSize: 12.5, color: 'var(--sec)' }}>{units(left)} of {units(o.volumeTotal)} left</span>
                <span style={{ fontSize: 12.5, color: status.c, flex: '1 1 260px' }}>{status.t}</span>
              </div>
            );
          })}
        </div>
      )}
      {book && mine.length > 0 && <p className="note small">Prices from the Jita book at {bookTime} EVE.</p>}
    </section>
  );
}

/** How your prices sat against the market on the days you traded, in words. */
function vsNote(v: { diff: number | null; ownShare: number | null }, buying: boolean): string {
  if (v.diff == null) return 'No market history yet for the days you traded; ESI adds each day after it ends';
  const words = Math.abs(v.diff) < 0.005 ? 'about the same as' : `${pct(Math.abs(v.diff), 1)} ${v.diff > 0 ? 'above' : 'below'}`;
  const good = buying ? v.diff < 0 : v.diff > 0;
  const base = `${words} the market’s average those days${Math.abs(v.diff) >= 0.005 ? (good ? ' — better than average' : ' — worse than average') : ''}`;
  // On a thin item the day's average is largely your own trades, so the comparison says little.
  const text = v.ownShare != null && v.ownShare >= 0.5 ? `${base}. You were ${pct(v.ownShare, 0)} of that trading, so the average is mostly you` : base;
  return text[0].toUpperCase() + text.slice(1);
}

type Mark = { price: number; label: string; color: string; dashed?: boolean };

function Charts({ pos, c, hist, marks }: { pos: Position; c: PositionCalc; hist: HistRow[]; marks: Mark[] }) {
  const W = 800, H = 240;
  const t1 = pos.closedAt ? Date.parse(pos.closedAt) : Date.now();
  const end = pos.closedAt ? fmtD(t1) : 'now';

  // Prices: a few days of market before your first trade, for context.
  const t0 = (c.firstT ?? t1 - 30 * DAY) - 3 * DAY;
  const X = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const market = hist.map((h) => ({ t: Date.parse(h.date + 'T00:00:00Z'), p: h.average })).filter((h) => h.t >= t0 - DAY && h.t <= t1 + DAY);
  const cost = c.series.filter((p) => p.avgCost != null).map((p) => ({ t: p.t, v: p.avgCost as number }));
  const prices = [...market.map((m) => m.p), ...c.buys.map((b) => b.price), ...c.sells.map((x) => x.price), ...cost.map((x) => x.v), ...marks.map((m) => m.price)];
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const pad = (hi - lo) * 0.06 || hi * 0.02 || 1;
  const mn = lo - pad, mx = hi + pad;
  const Y = (v: number) => 14 + (1 - (v - mn) / (mx - mn)) * (H - 28);
  const mline = market.map((m, i) => `${i ? 'L' : 'M'}${X(m.t).toFixed(1)} ${Y(m.p).toFixed(1)}`).join('');
  let cpath = '';
  cost.forEach((p, i) => { cpath += i ? `H${X(p.t).toFixed(1)}V${Y(p.v).toFixed(1)}` : `M${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`; });
  if (cost.length) cpath += `H${W}`;
  const qm = Math.max(1, ...c.buys.map((b) => b.qty), ...c.sells.map((x) => x.qty));
  const rad = (q: number) => 3 + Math.sqrt(q / qm) * 8;

  // Profit and stock: from the first trade, when there was first anything to show.
  const u0 = c.firstT ?? t1 - DAY;
  const u0p = u0 - Math.max(3600_000, (t1 - u0) * 0.03);
  const Xu = (t: number) => ((t - u0p) / Math.max(1, t1 - u0p)) * W;
  const sMax = Math.max(1, ...c.series.map((p) => p.stock));
  const rs = c.series.map((p) => p.realized);
  const rmn = Math.min(0, ...rs), rmx = Math.max(0, ...rs);
  const rspan = rmx - rmn || 1;
  const Ys = (v: number) => H - 6 - (v / sMax) * (H - 30);
  const Yr = (v: number) => 14 + (1 - (v - rmn) / rspan) * (H - 28);
  const base = Ys(0).toFixed(1);
  let sp = `M0 ${base}`, rp = `M0 ${Yr(0).toFixed(1)}`, prevS = 0, prevR = 0;
  for (const e of c.series) {
    const x = Xu(e.t).toFixed(1);
    sp += `L${x} ${Ys(prevS).toFixed(1)}L${x} ${Ys(e.stock).toFixed(1)}`;
    rp += `L${x} ${Yr(prevR).toFixed(1)}L${x} ${Yr(e.realized).toFixed(1)}`;
    prevS = e.stock; prevR = e.realized;
  }
  sp += `L${W} ${Ys(prevS).toFixed(1)}L${W} ${base}Z`;
  rp += `L${W} ${Yr(prevR).toFixed(1)}`;
  const rc = c.realized >= 0 ? 'var(--pos)' : 'var(--neg)';
  const zeroPct = (Yr(0) / H) * 100;

  return (
    <div data-rv="" className="g-440" style={{ gap: 14 }}>
      <section className="panel" aria-label="Your prices against the market" style={{ gap: 0 }}>
        <div className="panel-title" style={{ fontSize: 12, letterSpacing: '.16em' }}>Your prices against the market</div>
        <p className="note small" style={{ margin: '4px 0 10px' }}>Each dot is one of your trades; bigger means more units. The grey line is what the item traded at on average each day. Dotted lines are your open orders; short bars at the right are today’s best prices from others. Hover a dot for the trade.</p>
        <div className="chart-box" style={{ height: 240, background: 'rgba(2,7,12,.4)' }}>
          <svg className="plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 60H800M0 120H800M0 180H800" stroke="rgba(130,185,225,.07)" vectorEffect="non-scaling-stroke" fill="none" />
            <path d={mline} fill="none" stroke="var(--label)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <path d={cpath} fill="none" stroke="var(--acc2)" strokeWidth={2} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
            {marks.map((m) => (
              <path key={m.label} d={m.dashed ? `M0 ${Y(m.price).toFixed(1)}H${W}` : `M${W * 0.9} ${Y(m.price).toFixed(1)}H${W}`}
                stroke={m.color} strokeWidth={m.dashed ? 1.5 : 3} strokeDasharray={m.dashed ? '2 4' : undefined} vectorEffect="non-scaling-stroke" fill="none" />
            ))}
          </svg>
          {market.map((m) => (
            <span key={m.t} className="mdot" style={{ left: `${(X(m.t) / W) * 100}%`, top: `${(Y(m.p) / H) * 100}%` }}
              tabIndex={0} data-tip={`Averaged ${isk(m.p)} across the day’s trades`} data-tip-title={fmtD(m.t)} />
          ))}
          {c.buys.map((b, i) => (
            <span key={'b' + i} className="evdot" tabIndex={0} data-tip={`Bought ${units(b.qty)} at ${isk(b.price)}`} data-tip-title={fmtD(b.t)}
              style={cssVars({ left: `${(X(b.t) / W) * 100}%`, top: `${(Y(b.price) / H) * 100}%`, width: rad(b.qty) * 2, height: rad(b.qty) * 2, margin: `${-rad(b.qty)}px 0 0 ${-rad(b.qty)}px`, '--c': 'color-mix(in oklab,var(--acc) 75%,transparent)', boxShadow: '0 0 0 1px var(--acc)' })} />
          ))}
          {c.sells.map((x, i) => {
            const rr = rad(x.qty) * 1.2;
            return (
              <span key={'s' + i} className="evdot" tabIndex={0} data-tip={`Sold ${units(x.qty)} at ${isk(x.price)}`} data-tip-title={fmtD(x.t)}
                style={cssVars({ left: `${(X(x.t) / W) * 100}%`, top: `${(Y(x.price) / H) * 100}%`, width: rr * 1.4, height: rr * 1.4, margin: `${-rr * 0.7}px 0 0 ${-rr * 0.7}px`, borderRadius: 0, transform: 'rotate(45deg)', '--c': 'rgba(255,107,125,.7)', boxShadow: '0 0 0 1px var(--neg)' })} />
            );
          })}
          <span className="ax" style={{ left: 8, top: 6 }}>{iskBig(mx)}</span>
          <span className="ax" style={{ left: 8, bottom: 20 }}>{iskBig(mn)}</span>
          <span className="ax f" style={{ left: 8, bottom: 4 }}>{fmtD(t0)}</span>
          <span className="ax f" style={{ right: 8, bottom: 4 }}>{end}</span>
        </div>
        <div className="legend" style={{ marginTop: 10, fontSize: 12, color: 'var(--sec)', gap: 16 }}>
          <span><i style={{ width: 14, height: 2, background: 'var(--label)' }} />Market’s daily average</span>
          <span><i style={{ width: 14, height: 0, borderTop: '2px dashed var(--acc2)' }} />What your stock cost you, each</span>
          <span><i style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--acc)' }} />Your buys</span>
          <span><i style={{ width: 9, height: 9, background: 'var(--neg)', transform: 'rotate(45deg)' }} />Your sells</span>
          {/* The lines' prices live here rather than on the chart, where they'd cover your latest trades. */}
          {marks.map((m) => (
            <span key={'k' + m.label + m.price}>
              <i style={m.dashed ? { width: 14, height: 0, borderTop: `2px dotted ${m.color}` } : { width: 10, height: 3, background: m.color }} />
              {m.label} <b className="mono" style={{ color: m.color, fontWeight: 400 }}>{isk(m.price)}</b>
            </span>
          ))}
        </div>
      </section>
      <section className="panel" aria-label="Profit and stock over time" style={{ gap: 0 }}>
        <div className="panel-title" style={{ fontSize: 12, letterSpacing: '.16em' }}>Profit and stock over time</div>
        <p className="note small" style={{ margin: '4px 0 10px' }}>The line is your profit from what’s sold, after its fees and tax: it steps up as units sell. The shaded area is how many units you held.</p>
        <div className="chart-box" style={{ height: 240, background: 'rgba(2,7,12,.4)' }}>
          <svg className="plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <path d={sp} fill="color-mix(in oklab,var(--acc) 16%,transparent)" stroke="color-mix(in oklab,var(--acc) 50%,transparent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <path d={`M0 ${Yr(0).toFixed(1)}H${W}`} stroke="rgba(130,185,225,.3)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" fill="none" />
            <path d={rp} fill="none" stroke={rc} strokeWidth={2.5} vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 5px ${rc})` }} />
          </svg>
          {rmx > 0 && <span className="ax" style={{ left: 8, top: 6, color: 'var(--pos)' }}>{iskBigSigned(rmx)}</span>}
          {rmn < 0 && <span className="ax" style={{ left: 8, bottom: 20, color: 'var(--neg)' }}>{iskBigSigned(rmn)}</span>}
          {/* Zero sits on its own line; at the very bottom it would clash with the date. */}
          {rmn < 0 && rmx > 0 && <span className="ax" style={{ left: 8, top: `calc(${zeroPct}% - 16px)` }}>0</span>}
          {rmn === 0 && <span className="ax" style={{ left: 8, bottom: 20 }}>0</span>}
          {rmx === 0 && <span className="ax" style={{ left: 8, top: 6 }}>0</span>}
          <span className="ax" style={{ right: 8, top: 6, color: 'var(--acc)' }}>{units(sMax)} units</span>
          <span className="ax f" style={{ left: 8, bottom: 4 }}>{fmtD(u0)}</span>
          <span className="ax f" style={{ right: 8, bottom: 4 }}>{end}</span>
        </div>
        <div className="legend" style={{ marginTop: 10, fontSize: 12, color: 'var(--sec)', gap: 16 }}>
          <span><i style={{ width: 14, height: 2, background: rc }} />Profit from what’s sold</span>
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
