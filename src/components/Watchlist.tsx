import { useState } from 'react';
import { ArrowDownWideNarrow, EyeOff, Plus, RefreshCw, X } from 'lucide-react';
import { calc } from '../lib/fees';
import { ago, isk, iskBig, iskSigned, pct, plainNum, units } from '../lib/format';
import { snapshot } from '../lib/market';
import { update, useData } from '../lib/store';
import { addToWatchlist, startPosition } from '../lib/actions';
import { navigate, useNow } from '../lib/hooks';
import { tickDown, tickUp } from '../lib/tick';
import { EVEN_SPLIT, throughput } from '../lib/split';
import { toast } from '../lib/toast';
import { ItemSearch, OpenInGame, useTypeName } from './common';
import { Empty, Guide, ItemIcon, PageHead, Th } from './ui';

export function Watchlist() {
  const d = useData();
  const nameOf = useTypeName();
  const now = useNow(30_000);
  const [busy, setBusy] = useState<number | 'all' | null>(null);

  async function refresh(typeIds: number[], mark: number | 'all') {
    setBusy(mark);
    try {
      const snaps = await Promise.all(typeIds.map((id) => snapshot(id, true).catch(() => null)));
      const failed = snaps.filter((s) => !s).length;
      update((x) => ({
        watchlist: x.watchlist.map((w) => {
          const s = snaps.find((sn) => sn && sn.typeId === w.typeId);
          return s ? { ...w, snap: s } : w;
        }),
      }));
      if (failed) toast(`${failed} item${failed > 1 ? 's' : ''} couldn’t be refreshed. Try again in a minute.`, 'err');
    } finally {
      setBusy(null);
    }
  }

  const rows = d.watchlist.map((w) => {
    const s = w.snap;
    const buy = tickUp(s?.bestBuy ?? NaN);
    const sell = tickDown(s?.bestSell ?? NaN);
    const c = calc({ buy, sell, qty: 1 }, d.settings);
    // Only one side of the volume fills each order, at your share scaled for the queue on that side.
    const flow = s?.avgVol7 ? throughput(s.avgVol7, s.buyerShare ?? EVEN_SPLIT, d.settings.share, s.buyOrders, s.sellOrders) : NaN;
    const perDay = c.ok ? c.net * flow : NaN;
    return { w, s, c, perDay };
  });
  rows.sort((a, b) => (Number.isFinite(b.perDay) ? b.perDay : -1e18) - (Number.isFinite(a.perDay) ? a.perDay : -1e18));
  const top = Math.max(1, ...rows.map((r) => (Number.isFinite(r.perDay) ? Math.abs(r.perDay) : 0)));

  return (
    <div className="page" style={{ minHeight: 560 }}>
      <PageHead
        kicker="03 · Items you’re considering" title="Watchlist" wide
        lede={`Priced one step inside the current Jita 4-4 spread. Estimated ISK per day assumes you capture ${plainNum(d.settings.share)}% of the side of the 7-day average volume that fills your orders — change it in Settings. A rough guide, not a forecast.`}
        actions={<>
          <ItemSearch button="Add to watchlist" placeholder="Add an item, e.g. Warrior II" width={300}
            onFound={(t) => { if (addToWatchlist(t.id)) { toast(`Added ${t.name} to your watchlist.`); refresh([t.id], t.id); } else toast(`${t.name} is already on your watchlist.`, 'warn'); }} />
          {d.watchlist.length > 0 && (
            <button type="button" className="btn primary tall" disabled={busy !== null} onClick={() => refresh(d.watchlist.map((w) => w.typeId), 'all')}>
              <RefreshCw aria-hidden="true" className={busy === 'all' ? 'spinning' : undefined} />{busy === 'all' ? 'Refreshing…' : 'Refresh all'}
            </button>
          )}
        </>}
      />

      <section className="panel flush" data-rv="" style={{ flex: 1, minHeight: 260 }}>
        {!rows.length ? (
          <Empty icon={EyeOff}>Add items to compare their spreads, volume and likely profit side by side.</Empty>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <Th left>#</Th><Th left>Item</Th><Th>Top buy</Th><Th>Lowest sell</Th><Th>Spread</Th><Th>Return</Th>
                  <Th>Profit / unit</Th><Th>7-day volume</Th>
                  <Th tip="Net profit per unit times the units a day your orders can expect: the slower of the two sides of the volume, at your share, scaled for how many orders you queue among.">Est. ISK per day</Th>
                  <Th>Updated</Th><th scope="col" style={{ color: 'var(--faint-2)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ w, s, c, perDay }, i) => {
                  const name = nameOf(w.typeId);
                  const col = c.ok ? (c.roi >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined;
                  const pd = Number.isFinite(perDay);
                  return (
                    <tr key={w.typeId} className="hover">
                      <td className="l" style={{ color: 'var(--ghost)', fontSize: 11, width: 36 }}>{String(i + 1).padStart(2, '0')}</td>
                      <td className="l"><span className="cellrow"><ItemIcon id={w.typeId} /><span className="name ellipsis">{name}</span></span></td>
                      <td style={{ color: 'var(--bid-t)' }}>{isk(s?.bestBuy)}</td>
                      <td style={{ color: 'var(--neg-t)' }}>{isk(s?.bestSell)}</td>
                      <td>{c.ok ? pct(c.spreadPct, 1) : '–'}</td>
                      <td style={{ color: col }}>{c.ok ? pct(c.roi, 1) : '–'}</td>
                      <td style={{ color: col }}>{c.ok ? iskSigned(c.net) : '–'}</td>
                      <td>{units(s?.avgVol7 ?? NaN)}</td>
                      <td style={{ minWidth: 150 }}>
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <span style={{ color: pd ? (perDay >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined }}>{pd ? iskBig(perDay) : '–'}</span>
                          <span className="track h3" style={{ width: '100%' }}>
                            {pd && <span className="fill glow" style={{ marginLeft: 'auto', width: `${Math.max(2, (Math.abs(perDay) / top) * 100)}%`, background: perDay >= 0 ? 'var(--pos)' : 'var(--neg)', ['--c' as string]: perDay >= 0 ? 'var(--pos)' : 'var(--neg)' }} />}
                          </span>
                        </span>
                      </td>
                      <td style={{ color: 'var(--note)', fontSize: 11.5 }}>{busy === w.typeId || busy === 'all' ? 'Refreshing…' : s ? ago(s.fetchedAt, now) : 'never'}</td>
                      <td>
                        <span className="acts">
                          <button type="button" className="link-btn" onClick={() => navigate(`calculator?type=${w.typeId}`)} aria-label={`Open ${name} in the calculator`}>Calc</button>
                          <button type="button" className="link-btn" onClick={() => navigate(`positions/${startPosition(w.typeId).id}`)} aria-label={`Start trading ${name}`}>Start trading</button>
                          <OpenInGame typeId={w.typeId} name={name} variant="dim" />
                          <button type="button" className="icon-btn plain" aria-label={`Remove ${name} from the watchlist`} onClick={() => { update((x) => ({ watchlist: x.watchlist.filter((it) => it.typeId !== w.typeId) })); toast(`Removed ${name} from the watchlist.`, 'info'); }}><X aria-hidden="true" /></button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Guide
        title="How to use the Watchlist"
        intro="Keep an eye on items you’re considering. Each is priced one step inside the live spread so you can compare them side by side."
        steps={[
          { icon: Plus, title: 'Add candidates', body: 'Add items from here, from Prospects or from the Calculator. It’s a scratchpad — add freely, remove freely.' },
          { icon: ArrowDownWideNarrow, title: 'It’s sorted by ISK per day', body: 'The estimate uses your share of the side of the market that fills your orders, so it’s realistic rather than generous.' },
          { icon: RefreshCw, title: 'Refresh before deciding', body: 'Prices move. Refresh all, then start trading the ones that still look good.' },
        ]}
      />
    </div>
  );
}
