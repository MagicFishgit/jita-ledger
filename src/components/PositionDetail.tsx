import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Area, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { computePosition, vsMarket } from '../lib/positions';
import { priceUp, tickDown } from '../lib/tick';
import { confirmAsk } from '../lib/confirm';
import { rates } from '../lib/fees';
import { fmtDate, fmtDateTime, fmtShort, isk, iskAxis, iskBig, iskBigSigned, parseISK, pct, rid, timeTicks, units } from '../lib/format';
import { marketHistory, snapshot } from '../lib/market';
import { update, useData } from '../lib/store';
import { patchPosition } from '../lib/actions';
import { navigate, useThemeColors } from '../lib/hooks';
import type { HistRow, MarketSnap, Tx } from '../lib/types';
import { ChartTip, OpenInGame, Stat, useTypeName } from './common';

const DAY = 86400_000;

export function PositionDetail({ id }: { id: string }) {
  const d = useData();
  const nameOf = useTypeName();
  const colors = useThemeColors();
  const pos = d.positions.find((p) => p.id === id);
  const [hist, setHist] = useState<HistRow[]>([]);
  const [snap, setSnap] = useState<MarketSnap | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!pos) return;
    marketHistory(pos.typeId).then(setHist).catch(() => undefined);
    snapshot(pos.typeId).then(setSnap).catch(() => undefined);
  }, [pos?.typeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = useMemo(
    () => (pos ? computePosition(pos, d, d.settings) : null),
    [pos, d.txs, d.journal, d.orders, d.settings], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!pos || !c) {
    return (
      <div className="page">
        <p className="empty">This position doesn’t exist any more. <a href="#/positions">Back to positions</a></p>
      </div>
    );
  }
  const name = nameOf(pos.typeId);
  const r = rates(d.settings);
  const finished = pos.status === 'closed' && c.stock === 0;

  // What your trades imply you hold, against what you actually hold. A sell order keeps the goods
  // itself, so real stock is the hangar plus whatever is still committed to open sell orders.
  const held = d.stock?.jita[pos.typeId] ?? null;
  const committed = Object.values(d.orders)
    .filter((o) => o.typeId === pos.typeId && !o.isBuy && o.state === 'open')
    .reduce((n, o) => n + o.volumeRemain, 0);
  const actual = held === null ? null : held + committed;
  const drift = actual === null ? null : actual - c.stock;
  const unrealized = snap?.bestSell && c.stock > 0 ? c.stock * snap.bestSell * (1 - r.f - r.t) - c.costOfStock : null;

  // What to ask when the stock is ready to go out. A sale nets price x (1 - broker fee - sales tax),
  // so breaking even on what the stock cost means asking cost / (1 - f - t), rounded up to a price
  // EVE will take. The suggestion is one legal step under the cheapest seller, where you'd place it.
  const sellPlan = (() => {
    if (c.stock <= 0 || c.avgCost == null) return null;
    const keep = 1 - r.f - r.t;
    if (!(keep > 0)) return null;
    const suggested = snap?.bestSell != null ? tickDown(snap.bestSell) : NaN;
    const has = Number.isFinite(suggested);
    return {
      breakEven: priceUp(c.avgCost / keep),
      suggested,
      ok: has && suggested * keep >= c.avgCost,
      profit: has ? (suggested * keep - c.avgCost) * c.stock : NaN,
    };
  })();
  const sellVs = vsMarket(c.sells, hist);
  const buyVs = vsMarket(c.buys, hist);

  // Chart window: from a few days before the first trade to the end of the position (or today).
  const endT = pos.closedAt ? Date.parse(pos.closedAt) : Date.now();
  const startT = c.firstT != null ? c.firstT - 3 * DAY : endT - 30 * DAY;
  const market = hist.map((h) => ({ t: Date.parse(h.date), average: h.average })).filter((h) => h.t >= startT - DAY && h.t <= endT + DAY);
  const avgCost = c.series.filter((p) => p.avgCost != null).map((p) => ({ t: p.t, avgCost: p.avgCost as number }));
  const hasTrades = c.buys.length + c.sells.length > 0;
  const ticks = timeTicks(startT, endT);

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

  function close() {
    patchPosition(pos!.id, { status: 'closed', closedAt: new Date().toISOString() });
  }
  function reopen() {
    const other = d.positions.find((p) => p.typeId === pos!.typeId && p.status === 'open' && p.id !== pos!.id);
    if (other) { setMsg(`Close your other open ${name} position first.`); return; }
    patchPosition(pos!.id, { status: 'open', closedAt: undefined });
  }
  async function remove() {
    if (!(await confirmAsk({ title: `Delete the ${name} position?`, body: 'Your ESI trades stay in the app. Entries you added by hand for this position are deleted with it.', confirm: 'Delete position', danger: true }))) return;
    update((x) => {
      const txs = { ...x.txs };
      Object.values(txs).forEach((t) => { if (t.positionId === pos!.id) delete txs[t.id]; });
      return { positions: x.positions.filter((p) => p.id !== pos!.id), txs };
    });
    navigate('positions');
  }

  return (
    <div className="page">
      <p className="small" style={{ margin: '0 0 8px' }}><a href="#/positions">Positions</a></p>
      <div className="ledger-head">
        <div>
          <div className="row" style={{ gap: 12 }}>
            <h1 className="display" style={{ margin: 0, fontSize: 'clamp(28px,4vw,40px)', lineHeight: 1.05 }}>{name}</h1>
            <span className={'pill ' + pos.status}>{pos.status === 'open' ? 'Open' : 'Closed'}</span>
          </div>
          <p className="muted" style={{ margin: '4px 0 14px' }}>
            {fmtDate(pos.openedAt)} to {pos.closedAt ? fmtDate(pos.closedAt) : 'now'}
            {pos.jitaOnly ? ', Jita 4-4 trades only' : ', trades at any station'}
          </p>
          <p className={'hl-value ' + (c.realized >= 0 ? 'pos' : 'neg')}>{iskBigSigned(c.realized)}</p>
          <p className="hl-sub">{finished ? 'Final profit after fees and tax' : 'Realized profit so far, after fees and tax'}</p>
          {c.roi != null && <p className="hl-total">{pct(c.roi, 1)} return on the cost of what you’ve sold</p>}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <OpenInGame typeId={pos.typeId} name={name} />
          {pos.status === 'open'
            ? <button className="btn" onClick={close}>Close position</button>
            : <button className="btn" onClick={reopen}>Reopen</button>}
          <button className="btn btn-danger" onClick={remove}>Delete</button>
        </div>
      </div>

      {msg && <p className="notice warn" role="status">{msg}</p>}
      {pos.status === 'open' && c.bought > 0 && c.stock === 0 && (
        <p className="notice">Everything you bought has sold. <button className="link-btn" onClick={close}>Close the position</button> to lock in the result.</p>
      )}
      {c.oversold > 0 && (
        <p className="notice warn">
          You sold {units(c.oversold)} more units than this position bought. They were probably bought before its start date.
          Move the start date earlier, or count those purchases from the Inbox. Until then they’re costed at your average buy price.
        </p>
      )}

      <dl className="stats">
        <Stat label="Bought" value={`${units(c.bought)} units`} note={iskBig(c.boughtValue)} />
        <Stat label="Average buy price" value={isk(c.avgBuy)} note={buyVs != null ? `${pct(buyVs, 1)} vs daily average` : undefined} />
        <Stat label="Sold" value={`${units(c.sold)} units`} note={iskBig(c.soldValue)} />
        <Stat label="Average sell price" value={isk(c.avgSell)} note={sellVs != null ? `${pct(sellVs, 1)} vs daily average` : undefined} />
        <Stat label="In stock" value={`${units(c.stock)} units`} note={c.stock > 0 ? `${iskBig(c.costOfStock)} at cost` : undefined} />
        {actual !== null && (
          <Stat
            label="Actually held"
            value={`${units(actual)} units`}
            cls={drift !== 0 ? 'warn' : undefined}
            note={
              drift === 0
                ? 'Matches what your trades imply'
                : `${units(Math.abs(drift as number))} ${(drift as number) > 0 ? 'more' : 'fewer'} than your trades imply` +
                  (committed > 0 ? `; ${units(committed)} sitting in sell orders` : '')
            }
          />
        )}
        <Stat
          label="Broker fees"
          value={iskBig(c.brokerFees)}
          note={c.brokerEstimatedOrders ? `${units(c.brokerEstimatedOrders)} of ${units(c.brokerActualOrders + c.brokerEstimatedOrders)} orders estimated` : c.brokerActualOrders ? 'From your wallet journal' : 'No orders found yet'}
        />
        <Stat label="Sales tax" value={iskBig(c.salesTax)} note={c.taxEstimated ? `${units(c.taxEstimated)} of ${units(c.taxActual + c.taxEstimated)} sales estimated` : c.taxActual ? 'From your wallet journal' : undefined} />
        {c.manualFees > 0 && <Stat label="Fees on manual entries" value={iskBig(c.manualFees)} />}
        {c.priceChanges != null && <Stat label="Price changes" value={units(c.priceChanges)} note="Counted from broker fee entries" />}
        {sellPlan && (
          <Stat
            label="Break-even sell price"
            value={isk(sellPlan.breakEven)}
            note={`Covers the ${isk(c.avgCost)} a unit the stock cost you, after broker fee and sales tax`}
          />
        )}
        {sellPlan && Number.isFinite(sellPlan.suggested) && (
          <Stat
            label="Suggested sell price"
            value={isk(sellPlan.suggested)}
            cls={sellPlan.ok ? 'pos' : 'neg'}
            note={
              sellPlan.ok
                ? `One step under the cheapest seller. Clears ${iskBigSigned(sellPlan.profit)} on your ${units(c.stock)} units`
                : `One step under the cheapest seller, which is below your break-even — you'd lose ${iskBig(Math.abs(sellPlan.profit))}`
            }
          />
        )}
        {unrealized != null && (
          <Stat label="Stock if sold now" value={iskBigSigned(unrealized)} cls={unrealized >= 0 ? 'pos' : 'neg'} note={`At today’s lowest sell, ${isk(snap?.bestSell)}, after fees`} />
        )}
      </dl>

      {hasTrades ? (
        <>
          <div className="chart-block">
            <h3>Your prices against the market</h3>
            <p className="small muted">Dot size shows quantity. The dashed line is your average cost for the stock you held at the time.</p>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="t" type="number" scale="time" domain={[startT, endT]} ticks={ticks} tickFormatter={fmtShort} stroke={colors['--muted']} fontSize={13} allowDuplicatedCategory={false} />
                  <YAxis tickFormatter={iskAxis} stroke={colors['--muted']} fontSize={13} width={60} domain={['auto', 'auto']} />
                  <ZAxis dataKey="qty" range={[30, 260]} />
                  <Tooltip content={<ChartTip />} />
                  <Line data={market} dataKey="average" name="Daily average" stroke={colors['--line']} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line data={avgCost} dataKey="avgCost" name="Your average cost" type="stepAfter" stroke={colors['--accent']} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Scatter data={c.buys} dataKey="price" name="You bought" fill={colors['--buy']} isAnimationActive={false} />
                  <Scatter data={c.sells} dataKey="price" name="You sold" fill={colors['--sell']} shape="diamond" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="legend" aria-hidden="true">
              <span style={{ color: colors['--line'] }}><i className="solid" /> Daily average in The Forge</span>
              <span style={{ color: colors['--accent'] }}><i className="dash" /> Your average cost</span>
              <span><i className="dot" style={{ background: colors['--buy'] }} /> Your buys</span>
              <span><i className="dot" style={{ background: colors['--sell'] }} /> Your sells</span>
            </div>
          </div>

          <div className="chart-block">
            <h3>Profit and stock over time</h3>
            <p className="small muted">Profit drops when you pay fees and rises as units sell. The shaded area is how many units you held.</p>
            <div className="chart short">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={c.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="t" type="number" scale="time" domain={[startT, endT]} ticks={ticks} tickFormatter={fmtShort} stroke={colors['--muted']} fontSize={13} />
                  <YAxis yAxisId="isk" tickFormatter={iskAxis} stroke={colors['--muted']} fontSize={13} width={60} />
                  <YAxis yAxisId="units" orientation="right" tickFormatter={iskAxis} stroke={colors['--muted']} fontSize={13} width={48} />
                  <Tooltip content={<ChartTip unitsKeys={['stock']} />} />
                  <Area yAxisId="units" dataKey="stock" name="Units held" type="stepAfter" stroke={colors['--seg-spread']} fill={colors['--seg-spread']} fillOpacity={0.35} isAnimationActive={false} />
                  <Line yAxisId="isk" dataKey="realized" name="Realized profit" type="stepAfter" stroke={c.realized >= 0 ? colors['--profit'] : colors['--loss']} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <p className="empty" style={{ marginTop: 24 }}>
          No trades counted yet. Place your orders in game, then sync. Trades of {name} at Jita 4-4 since {fmtDate(pos.openedAt)} will show up here.
        </p>
      )}

      <PositionSettings posId={pos.id} openedAt={pos.openedAt} jitaOnly={pos.jitaOnly} />

      <section style={{ marginTop: 32 }} aria-label="Trades">
        <h2 className="section">Trades</h2>
        <p className="small muted" style={{ marginTop: -6 }}>
          Exclude a purchase you made for your own use and it won’t count. Buy fees are tracked per order, so they show in the broker fee total rather than per row.
        </p>
        {!c.rows.length ? <p className="empty">Nothing yet.</p> : (
          <div className="table-wrap">
            <table className="data wide">
              <thead>
                <tr>
                  <th scope="col">Date</th><th scope="col" className="left">Trade</th><th scope="col">Quantity</th><th scope="col">Price</th>
                  <th scope="col">Value</th><th scope="col">Tax and fees</th><th scope="col" className="left">Counts</th><th scope="col"><span className="opt">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map(({ tx, match, fee, feeActual }) => (
                  <tr key={tx.id} className={match === 'excluded' ? 'dim' : ''}>
                    <td>{fmtDateTime(tx.date)}</td>
                    <td className="left">{tx.isBuy ? 'Buy' : 'Sell'}{tx.source === 'manual' ? ' (manual)' : ''}</td>
                    <td>{units(tx.qty)}</td>
                    <td>{isk(tx.unitPrice)}</td>
                    <td>{iskBig(tx.qty * tx.unitPrice)}</td>
                    <td>{fee > 0 ? `${iskBig(fee)}${feeActual ? '' : ' est.'}` : '–'}</td>
                    <td className="left">{match === 'excluded' ? 'No, excluded' : match === 'included' ? 'Yes, added by you' : 'Yes'}</td>
                    <td>
                      <button className={'link-btn' + (tx.source === 'manual' ? ' danger' : '')} onClick={() => toggle(tx, match)}>
                        {tx.source === 'manual' ? 'Delete' : match === 'excluded' ? 'Count it' : match === 'included' ? 'Remove' : 'Exclude'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ManualEntry posId={pos.id} typeId={pos.typeId} />
      </section>
    </div>
  );
}

function PositionSettings(props: { posId: string; openedAt: string; jitaOnly: boolean }) {
  return (
    <section className="card" style={{ marginTop: 28 }} aria-label="Position rules">
      <h2 className="section">What counts</h2>
      <div className="fields">
        <div className="field">
          <label htmlFor="ps-from">Count trades from <span className="opt">EVE time</span></label>
          <input
            id="ps-from" type="date" value={props.openedAt.slice(0, 10)}
            onChange={(e) => e.target.value && patchPosition(props.posId, { openedAt: `${e.target.value}T00:00:00Z` })}
          />
        </div>
        <div className="field" style={{ alignSelf: 'center' }}>
          <label className="check">
            <input type="checkbox" checked={props.jitaOnly} onChange={(e) => patchPosition(props.posId, { jitaOnly: e.target.checked })} />
            <span>Only count trades in Jita 4-4</span>
          </label>
        </div>
      </div>
    </section>
  );
}

function ManualEntry(props: { posId: string; typeId: number }) {
  const [kind, setKind] = useState<'buy' | 'sell'>('buy');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function add(e: FormEvent) {
    e.preventDefault();
    const q = parseISK(qty), p = parseISK(price), f = fees.trim() ? parseISK(fees) : undefined;
    if (!(q > 0) || !(p > 0) || !date) { setErr('Enter a date, a quantity and a price.'); return; }
    if (f !== undefined && !(f >= 0)) { setErr('Fees must be a number, or leave them empty to estimate.'); return; }
    const tx: Tx = {
      id: 'm-' + rid(), source: 'manual', typeId: props.typeId, positionId: props.posId,
      date: `${date}T12:00:00Z`, isBuy: kind === 'buy', qty: q, unitPrice: p, fees: f,
    };
    update((x) => ({ txs: { ...x.txs, [tx.id]: tx } }));
    setQty(''); setPrice(''); setFees(''); setErr(null);
  }

  return (
    <details className="card" style={{ marginTop: 20 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Add a trade by hand</summary>
      <p className="small muted">For trades older than ESI’s wallet history (about 30 days), or made on another character.</p>
      <form className="fields" onSubmit={add}>
        <div className="field">
          <label htmlFor="m-kind">Trade</label>
          <select id="m-kind" value={kind} onChange={(e) => setKind(e.target.value as 'buy' | 'sell')}>
            <option value="buy">Buy</option><option value="sell">Sell</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="m-date">Date</label>
          <input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-qty">Quantity</label>
          <input id="m-qty" type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-price">Price per unit</label>
          <input id="m-price" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="field wide">
          <label htmlFor="m-fees">Fees and tax paid <span className="opt">optional</span></label>
          <input id="m-fees" type="text" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="Leave empty to estimate from your rates" />
        </div>
        <div className="wide row">
          <button className="btn btn-primary" type="submit">Add trade</button>
          {err && <span className="small neg" role="alert">{err}</span>}
        </div>
      </form>
    </details>
  );
}
