import { useState } from 'react';
import { calc } from '../lib/fees';
import { ago, isk, iskBig, iskSigned, pct, plainNum, units } from '../lib/format';
import { snapshot } from '../lib/market';
import { update, useData } from '../lib/store';
import { addToWatchlist, startPosition } from '../lib/actions';
import { navigate } from '../lib/hooks';
import { tickDown, tickUp } from '../lib/tick';
import { ItemFinder, OpenInGame, useTypeName } from './common';

export function Watchlist() {
  const d = useData();
  const nameOf = useTypeName();
  const [busy, setBusy] = useState<number | 'all' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const share = d.settings.share / 100;

  async function refresh(typeIds: number[], mark: number | 'all') {
    setBusy(mark); setErr(null);
    try {
      const snaps = await Promise.all(typeIds.map((id) => snapshot(id, true).catch(() => null)));
      const failed = snaps.filter((s) => !s).length;
      update((x) => ({
        watchlist: x.watchlist.map((w) => {
          const s = snaps.find((sn) => sn && sn.typeId === w.typeId);
          return s ? { ...w, snap: s } : w;
        }),
      }));
      if (failed) setErr(`${failed} item${failed > 1 ? 's' : ''} couldn’t be refreshed. Try again in a minute.`);
    } finally {
      setBusy(null);
    }
  }

  const rows = d.watchlist.map((w) => {
    const s = w.snap;
    const buy = tickUp(s?.bestBuy ?? NaN);
    const sell = tickDown(s?.bestSell ?? NaN);
    const c = calc({ buy, sell, qty: 1 }, d.settings);
    const perDay = c.ok && s?.avgVol7 ? (c.net) * s.avgVol7 * share : NaN;
    return { w, s, c, perDay };
  });
  rows.sort((a, b) => (Number.isFinite(b.perDay) ? b.perDay : -1e18) - (Number.isFinite(a.perDay) ? a.perDay : -1e18));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Watchlist</h1>
          <p>
            Items you’re considering, priced one step inside the current Jita 4-4 spread. EVE order prices carry only four
            significant figures, so a step is 1,000 ISK on a million-ISK item and 0.01 ISK on a cheap one. Estimated ISK per day assumes you
            capture {plainNum(d.settings.share)}% of the 7-day average volume, which you can change in Settings. It’s a rough guide, not a forecast.
          </p>
        </div>
        {d.watchlist.length > 0 && (
          <button className="btn btn-primary" disabled={busy !== null} onClick={() => refresh(d.watchlist.map((w) => w.typeId), 'all')}>
            {busy === 'all' ? 'Refreshing…' : 'Refresh all'}
          </button>
        )}
      </div>
      <div className="card" style={{ marginBottom: 20 }}>
        <ItemFinder label="Add an item" button="Add to watchlist" onFound={(t) => { if (addToWatchlist(t.id)) refresh([t.id], t.id); }} />
      </div>
      {err && <p className="notice err" role="alert">{err}</p>}
      {!d.watchlist.length ? (
        <p className="empty">Add items to compare their spreads, volume and likely profit side by side.</p>
      ) : (
        <div className="table-wrap">
          <table className="data wide">
            <thead>
              <tr>
                <th scope="col">Item</th><th scope="col">Top buy</th><th scope="col">Lowest sell</th><th scope="col">Spread</th>
                <th scope="col">Return</th><th scope="col">Profit per unit</th><th scope="col">7-day volume</th>
                <th scope="col">Est. ISK per day</th><th scope="col">Updated</th><th scope="col"><span className="opt">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ w, s, c, perDay }) => {
                const name = nameOf(w.typeId);
                return (
                  <tr key={w.typeId}>
                    <td className="name">{name}</td>
                    <td>{isk(s?.bestBuy)}</td>
                    <td>{isk(s?.bestSell)}</td>
                    <td>{c.ok ? pct(c.spreadPct, 1) : '–'}</td>
                    <td className={c.ok ? (c.roi >= 0 ? 'pos' : 'neg') : ''}>{c.ok ? pct(c.roi, 1) : '–'}</td>
                    <td className={c.ok ? (c.net >= 0 ? 'pos' : 'neg') : ''}>{c.ok ? iskSigned(c.net) : '–'}</td>
                    <td>{units(s?.avgVol7 ?? NaN)}</td>
                    <td className={Number.isFinite(perDay) ? (perDay >= 0 ? 'pos' : 'neg') : ''}>{iskBig(perDay)}</td>
                    <td className="muted">{busy === w.typeId ? 'Refreshing…' : ago(s?.fetchedAt)}</td>
                    <td>
                      <button className="link-btn" onClick={() => navigate(`calculator?type=${w.typeId}`)} aria-label={`Open ${name} in the calculator`}>Calculator</button>
                      <button className="link-btn" onClick={() => navigate(`positions/${startPosition(w.typeId).id}`)} aria-label={`Start trading ${name}`}>Start trading</button>
                      <OpenInGame typeId={w.typeId} name={name} label="In game" />
                      <button className="link-btn danger" onClick={() => update((x) => ({ watchlist: x.watchlist.filter((i) => i.typeId !== w.typeId) }))} aria-label={`Remove ${name} from the watchlist`}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
