import { useCallback, useMemo, useState } from 'react';
import { hasScope } from '../lib/auth';
import { SCOPES } from '../lib/config';
import { rates } from '../lib/fees';
import { ago, isk, iskBig, plainNum, units } from '../lib/format';
import { useAuth, useNow, navigate } from '../lib/hooks';
import { jitaOrders, marketHistory, openMarketWindow, recentAverages, tradedAtJita, type OrderLite } from '../lib/market';
import { adviseRelist, byUrgency, type Relist, type Verdict } from '../lib/relist';
import { update, useData } from '../lib/store';
import { computePosition } from '../lib/positions';
import { Explain, useTypeName } from './common';

/** Plain-English notes behind the "i" on each column. */
const TIPS: Record<string, string> = {
  Verdict: 'Whether this order is worth doing something about. Being undercut on its own is not a reason to move \u2014 what matters is how long the people ahead of you will stay ahead.',
  'Ahead of you': 'How many units are queued in front of your price, and how many separate traders that is. One big order is better news than a crowd: when it sells you jump straight to the front, whereas a crowd will each undercut you again.',
  'Clears in': 'Roughly how long the stock ahead of you takes to sell at this item\u2019s usual daily pace. If that is short, waiting costs you nothing and a relist would just be a wasted broker fee.',
  'Your price': 'What you are asking, or bidding, right now.',
  'Move to': 'The price that would put you back in front \u2014 one legal step past the best rival. EVE prices carry only four significant figures, so this is the smallest move the game allows.',
  'Costs you': 'What getting back in front would cost: the margin you give up by changing price, plus the broker fee on the new order value. Hover the number for the split.',
  'Your stock': 'How much of this order is left, and roughly how long that would take to sell once you reach the front. If your own stock is days of the market, being at the front matters more.',
  'ISK in order': 'The ISK currently tied up in this order at its own price. Bigger numbers cost you more to leave sitting behind someone else.',
};

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  move: { label: 'Move it', cls: 'v-move' },
  wait: { label: 'Leave it', cls: 'v-wait' },
  front: { label: 'In front', cls: 'v-front' },
  loss: { label: 'Not worth it', cls: 'v-loss' },
};

const UI_SCOPE = SCOPES[4];

/** The shape of the queue ahead, in words rather than a ratio. */
function rivalShape(orders: number, topShare: number, isBuy: boolean): string {
  const who = isBuy ? 'buyer' : 'seller';
  if (orders === 0) return '';
  if (orders === 1) return `one ${who}`;
  if (topShare >= 0.6) return `${orders} ${who}s, mostly one order`;
  if (orders >= 10) return `a crowd of ${orders} ${who}s`;
  return `${orders} ${who}s`;
}

/** A wait, in the largest unit that still reads naturally. */
function hours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

export function Orders() {
  const d = useData();
  const auth = useAuth();
  const nameOf = useTypeName();
  const now = useNow();
  const [books, setBooks] = useState<Record<number, OrderLite[]> | null>(null);
  const [daily, setDaily] = useState<Record<number, number | null>>({});
  const [side, setSide] = useState<'all' | 'sell' | 'buy'>('all');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const open = useMemo(
    () => Object.values(d.orders).filter((o) => o.state === 'open' && o.volumeRemain > 0),
    [d.orders],
  );
  // Only Jita 4-4 orders can be judged here: the book this compares against is Jita's, so an
  // order anywhere else would be scored against a market it is not even in.
  const mine = useMemo(() => open.filter((o) => tradedAtJita(o.typeId, o.locationId)), [open]);
  const elsewhere = open.length - mine.length;

  const check = useCallback(async () => {
    const typeIds = [...new Set(mine.map((o) => o.typeId))];
    if (!typeIds.length) return;
    setBusy({ done: 0, total: typeIds.length }); setErr(null); setMsg(null);
    const out: Record<number, OrderLite[]> = {};
    const vol: Record<number, number | null> = {};
    let failed = 0, done = 0;
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(4, typeIds.length) }, async () => {
      while (i < typeIds.length) {
        const id = typeIds[i++];
        try { out[id] = await jitaOrders(id, true); } catch { failed++; }
        // How fast the item moves is what decides whether a queue ahead is worth waiting out.
        try { vol[id] = recentAverages(await marketHistory(id), 7).avgVol; } catch { vol[id] = null; }
        setBusy({ done: ++done, total: typeIds.length });
      }
    }));
    setBooks(out);
    setDaily(vol);
    setCheckedAt(new Date().toISOString());
    setBusy(null);
    if (failed) setErr(`${failed} item${failed > 1 ? 's' : ''} couldn’t be read. Try again in a minute.`);
  }, [mine]);

  const r = rates(d.settings);
  const costOf = useMemo(() => {
    const out: Record<number, number> = {};
    for (const p of d.positions) {
      if (p.status !== 'open') continue;
      const avg = computePosition(p, d, d.settings).avgCost;
      if (avg != null) out[p.typeId] = avg;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.positions, d.txs, d.journal, d.orders, d.settings]);

  const all: Relist[] = useMemo(() => {
    if (!books) return [];
    return mine
      .filter((o) => books[o.typeId])
      .map((o) => {
        const book = books[o.typeId];
        const sells = book.filter((x) => !x.isBuy).map((x) => x.price);
        return adviseRelist(o, {
          book,
          dailyVolume: daily[o.typeId],
          avgCost: costOf[o.typeId],
          bestSell: sells.length ? Math.min(...sells) : null,
        }, r, d.settings.waitHours);
      })
      .sort(byUrgency);
  }, [books, mine, daily, costOf, r, d.settings.waitHours]);
  const rows = useMemo(
    () => (side === 'all' ? all : all.filter((x) => (side === 'buy' ? x.isBuy : !x.isBuy))),
    [all, side],
  );
  const unread = books ? mine.filter((o) => !books[o.typeId]).length : 0;

  const worth = all.filter((x) => x.verdict === 'move');
  const holding = all.filter((x) => x.verdict === 'wait');
  const canOpen = hasScope(UI_SCOPE);

  async function openInGame(typeId: number, name: string) {
    setMsg(null); setErr(null);
    try {
      await openMarketWindow(typeId);
      setMsg(`Opened ${name} in the market window in game.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p>
            Your open market orders, checked against the live Jita 4-4 book so you can see which ones have been beaten
            without hunting through them in game. ESI can’t place or change an order — no tool can, and automating the
            client is a bannable offence — so this finds the work and you do the clicking.
          </p>
        </div>
        <div className="row">
          <button className="btn btn-primary" disabled={!!busy || !mine.length} onClick={check}>
            {busy ? `Checking ${busy.done} of ${busy.total}…` : checkedAt ? 'Check again' : 'Check prices'}
          </button>
        </div>
      </div>

      {err && <p className="notice err" role="alert">{err}</p>}
      {msg && <p className="notice" role="status">{msg}</p>}

      {!auth ? (
        <p className="empty">Log in with EVE Online to see your orders.</p>
      ) : !open.length ? (
        <p className="empty">
          No open market orders. They come from your last sync — ESI holds them for twenty minutes, so an order you
          placed a moment ago may take that long to appear.
        </p>
      ) : !mine.length ? (
        <p className="empty">
          All {units(elsewhere)} of your open orders are in other stations. Jita Ledger only knows the Jita 4-4 book,
          so it can’t tell you whether those have been beaten.
        </p>
      ) : (
        <>
          <p className="small muted" style={{ margin: '0 0 14px' }}>
            {units(mine.length)} order{mine.length > 1 ? 's' : ''} in Jita 4-4, from your last sync ({ago(d.meta.lastSync, now)}).
            {checkedAt
              ? ` Prices checked ${ago(checkedAt, now)}: ${
                  worth.length
                    ? `${units(worth.length)} worth moving${holding.length ? `, ${units(holding.length)} beaten but clearing on their own` : ''}.`
                    : holding.length
                      ? `nothing worth moving — ${units(holding.length)} beaten, but the stock ahead should clear shortly.`
                      : 'you are in front on all of them.'
                }`
              : ' Check prices to see which are worth moving.'}
            {elsewhere > 0 && ` ${units(elsewhere)} more ${elsewhere > 1 ? 'are' : 'is'} in other stations and can’t be checked here.`}
            {unread > 0 && ` ${units(unread)} couldn’t be read from ESI — check again.`}
          </p>
          {!canOpen && (
            <p className="notice warn">
              Your login predates the “Open in game” button. Add <code>esi-ui.open_window.v1</code> to your application
              on developers.eveonline.com, then log out and in again, and each row will open that item’s market window
              in your client.
            </p>
          )}

          {all.length > 0 && (
            <div className="row" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
              <div className="seg-control" role="group" aria-label="Which orders to show">
                {([['all', 'All'], ['sell', 'Sell orders'], ['buy', 'Buy orders']] as const).map(([key, label]) => {
                  const n = key === 'all' ? all.length : all.filter((x) => (key === 'buy' ? x.isBuy : !x.isBuy)).length;
                  return (
                    <button key={key} type="button" aria-pressed={side === key} onClick={() => setSide(key)}>
                      {label} <span className="opt">{units(n)}</span>
                    </button>
                  );
                })}
              </div>
              <label className="wait">
                <span>Leave orders that clear within</span>
                <input
                  type="number" min={0} max={168} step={1} value={plainNum(d.settings.waitHours)}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    update((x) => ({ settings: { ...x.settings, waitHours: Number.isFinite(n) ? Math.min(168, Math.max(0, n)) : 0 } }));
                  }}
                />
                <span>hours</span>
              </label>
            </div>
          )}

          {rows.length > 0 && (
            <div className="table-wrap">
              <table className="data wide">
                <thead>
                  <tr>
                    <th scope="col">Item</th><th scope="col">Side</th>
                    {(['Verdict', 'Ahead of you', 'Clears in', 'Your price', 'Move to', 'Costs you', 'Your stock', 'ISK in order'] as const).map((h) => (
                      <th scope="col" key={h}>{h}{TIPS[h] && <Explain term={h}>{TIPS[h]}</Explain>}</th>
                    ))}
                    <th scope="col"><span className="opt">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const name = nameOf(r.typeId);
                    return (
                      <tr key={r.orderId} className={r.verdict === 'move' ? '' : 'muted'}>
                        <td className="name">{name}</td>
                        <td>{r.isBuy ? 'Buy' : 'Sell'}</td>
                        <td><span className={'flag ' + VERDICT[r.verdict].cls} title={r.why}>{VERDICT[r.verdict].label}</span></td>
                        <td>
                          {r.beaten ? <>{units(r.aheadUnits)}<small className="sub">{rivalShape(r.aheadOrders, r.topRivalShare, r.isBuy)}</small></> : '–'}
                        </td>
                        <td className={r.verdict === 'wait' ? 'pos' : ''}>
                          {!r.beaten ? '–' : !Number.isFinite(r.hoursToFront) ? <span className="muted">barely trades</span> : hours(r.hoursToFront)}
                        </td>
                        <td>{isk(r.price)}</td>
                        <td className={r.verdict === 'move' ? 'pos' : ''}>
                          {Number.isFinite(r.newPrice) ? isk(r.newPrice) : '–'}
                        </td>
                        <td>{r.cost > 0 ? <span title={`${isk(r.give)} of margin plus a ${isk(r.fee)} broker fee`}>{iskBig(r.cost)}</span> : '–'}</td>
                        <td>
                          {units(r.volumeRemain)}
                          {Number.isFinite(r.yourHours) && <small className="sub">{hours(r.yourHours)} to sell</small>}
                        </td>
                        <td>{iskBig(r.atRisk)}</td>
                        <td>
                          {canOpen && <button className="link-btn" onClick={() => openInGame(r.typeId, name)}>Open in game</button>}
                          <button className="link-btn" onClick={() => navigate(`calculator?type=${r.typeId}`)}>Calculator</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
