import { useCallback, useMemo, useState } from 'react';
import { hasScope } from '../lib/auth';
import { SCOPES } from '../lib/config';
import { rates } from '../lib/fees';
import { ago, isk, iskBig, units } from '../lib/format';
import { useAuth, useNow, navigate } from '../lib/hooks';
import { jitaOrders, openMarketWindow, tradedAtJita, type OrderLite } from '../lib/market';
import { adviseRelist, byUrgency, type Relist } from '../lib/relist';
import { useData } from '../lib/store';
import { useTypeName } from './common';

const UI_SCOPE = SCOPES[4];

export function Orders() {
  const d = useData();
  const auth = useAuth();
  const nameOf = useTypeName();
  const now = useNow();
  const [books, setBooks] = useState<Record<number, OrderLite[]> | null>(null);
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
    let failed = 0, done = 0;
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(4, typeIds.length) }, async () => {
      while (i < typeIds.length) {
        const id = typeIds[i++];
        try { out[id] = await jitaOrders(id, true); } catch { failed++; }
        setBusy({ done: ++done, total: typeIds.length });
      }
    }));
    setBooks(out);
    setCheckedAt(new Date().toISOString());
    setBusy(null);
    if (failed) setErr(`${failed} item${failed > 1 ? 's' : ''} couldn’t be read. Try again in a minute.`);
  }, [mine]);

  const k = rates(d.settings).k;
  const rows: Relist[] = useMemo(() => {
    if (!books) return [];
    return mine.filter((o) => books[o.typeId]).map((o) => adviseRelist(o, books[o.typeId], k)).sort(byUrgency);
  }, [books, mine, k]);
  const unread = books ? mine.filter((o) => !books[o.typeId]).length : 0;

  const beaten = rows.filter((r) => r.beaten);
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
              ? ` Prices checked ${ago(checkedAt, now)}: ${beaten.length ? `${units(beaten.length)} of ${units(rows.length)} beaten.` : 'you are still in front on all of them.'}`
              : ' Check prices to see which have been beaten.'}
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

          {rows.length > 0 && (
            <div className="table-wrap">
              <table className="data wide">
                <thead>
                  <tr>
                    <th scope="col">Item</th><th scope="col">Side</th><th scope="col">Your price</th>
                    <th scope="col">Best rival</th><th scope="col">Behind by</th><th scope="col">Move to</th>
                    <th scope="col">Costs you</th><th scope="col">Left</th><th scope="col">ISK in order</th>
                    <th scope="col"><span className="opt">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const name = nameOf(r.typeId);
                    return (
                      <tr key={r.orderId} className={r.beaten ? '' : 'muted'}>
                        <td className="name">{name}</td>
                        <td>{r.isBuy ? 'Buy' : 'Sell'}</td>
                        <td>{isk(r.price)}</td>
                        <td>{r.best === null ? <span className="muted">alone</span> : isk(r.best)}</td>
                        <td className={r.beaten ? 'neg' : ''}>{r.beaten ? isk(r.gap) : '–'}</td>
                        <td className={r.beaten ? 'pos' : ''}>
                          {r.beaten ? (Number.isFinite(r.newPrice) ? isk(r.newPrice) : <span className="muted">can’t go lower</span>) : '–'}
                        </td>
                        <td>{r.beaten && r.cost > 0 ? <span title={`${isk(r.give)} of margin plus a ${isk(r.fee)} broker fee`}>{iskBig(r.cost)}</span> : '–'}</td>
                        <td>{units(r.volumeRemain)}</td>
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
