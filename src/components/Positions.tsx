import { useMemo, useState } from 'react';
import { computePosition } from '../lib/positions';
import { ago, fmtDate, isk, iskBig, iskBigSigned, pct, units, until } from '../lib/format';
import { useData } from '../lib/store';
import { syncCharacter, useSyncState } from '../lib/sync';
import { effectiveSkills, orderSlots } from '../lib/fees';
import { startPosition } from '../lib/actions';
import { navigate, useNow } from '../lib/hooks';
import { ItemFinder, OpenInGame, Stat, useTypeName } from './common';

const todayUTC = () => new Date().toISOString().slice(0, 10);

export function Positions() {
  const d = useData();
  const nameOf = useTypeName();
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [from, setFrom] = useState(todayUTC);
  const [jitaOnly, setJitaOnly] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const sync = useSyncState();
  const now = useNow();

  const all = useMemo(
    () => d.positions.map((p) => ({ p, c: computePosition(p, d, d.settings) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.positions, d.txs, d.journal, d.orders, d.settings],
  );
  const shown = all.filter(({ p }) => filter === 'all' || p.status === filter);
  const realized = all.reduce((s, x) => s + x.c.realized, 0);
  const atCost = all.reduce((s, x) => s + x.c.costOfStock, 0);
  const open = all.filter((x) => x.p.status === 'open').length;
  const openOrders = Object.values(d.orders).filter((o) => o.state === 'open').length;
  const slots = orderSlots(effectiveSkills(d.settings));

  function create(t: { id: number; name: string }) {
    const openedAt = from ? `${from}T00:00:00Z` : new Date().toISOString();
    const r = startPosition(t.id, openedAt, jitaOnly);
    if (r.existed) setMsg(`You already have an open position for ${t.name}.`);
    navigate(`positions/${r.id}`);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Positions</h1>
          <p>
            A position is an item you’re trading. From its start date, your buys and sells of that item in Jita 4-4 count towards it.
            Anything else you buy stays out, and you can exclude a single purchase if it was for your own use.
          </p>
        </div>
        <div className="row">
          <button className="btn" disabled={sync.running} onClick={() => syncCharacter()}>
            {sync.running ? 'Checking…' : 'Check for new trades'}
          </button>
        </div>
      </div>

      <p className="notice" style={{ marginBottom: 20 }}>
        <strong>Trades arrive on EVE’s schedule, not yours.</strong> ESI holds your wallet transactions for an
        hour before it hands over new ones, so a buy or sell that just filled in game won’t show here straight
        away. Jita Ledger now asks the moment that hour is up, rather than on a timer of its own.
        {' '}{d.meta.lastSync ? `Last checked ${ago(d.meta.lastSync, now)}.` : 'Not checked yet.'}
        {until(d.meta.tradesFreshAt, now) && ` New trades can appear ${until(d.meta.tradesFreshAt, now)}.`}
      </p>

      {d.stock && (
        <p className="small muted" style={{ margin: '0 0 14px' }}>
          Stock checked against what you actually hold, as of {ago(d.stock.at, now)}.
          {d.stock.inContainers > 0 && ` ${units(d.stock.inContainers)} items sit in containers or ships, which ESI reports against the container rather than a station, so they aren't counted.`}
        </p>
      )}

      {all.length > 0 && (
        <dl className="stats" style={{ marginBottom: 22 }}>
          <Stat label="Realized profit, all positions" value={iskBigSigned(realized)} cls={realized >= 0 ? 'pos' : 'neg'} />
          <Stat label="Stock held, at cost" value={iskBig(atCost)} />
          <Stat label="Open positions" value={units(open)} />
          {Object.keys(d.orders).length > 0 && (
            <Stat label="Market orders open" value={`${units(openOrders)} of ${units(slots)}`} note={`Order slots as ${d.settings.clone === 'alpha' ? 'Alpha' : 'Omega'}`} cls={openOrders >= slots ? 'warn' : undefined} />
          )}
        </dl>
      )}

      <section className="card stack" style={{ marginBottom: 24 }} aria-label="Start a position">
        <h2 className="section" style={{ margin: 0 }}>Start a position</h2>
        <div className="fields">
          <div className="field">
            <label htmlFor="p-from">Count trades from <span className="opt">EVE time</span></label>
            <input id="p-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <p className="hint">Set this to before your first buy order for the item.</p>
          </div>
          <div className="field" style={{ alignSelf: 'center' }}>
            <label className="check"><input type="checkbox" checked={jitaOnly} onChange={(e) => setJitaOnly(e.target.checked)} /> <span>Only count trades in Jita 4-4</span></label>
          </div>
        </div>
        <ItemFinder label="Item" button="Start position" onFound={create} />
        {msg && <p className="small muted" role="status" style={{ margin: 0 }}>{msg}</p>}
      </section>

      <div className="row" role="group" aria-label="Show" style={{ marginBottom: 12 }}>
        {(['open', 'closed', 'all'] as const).map((f) => (
          <button key={f} className={'btn btn-small' + (filter === f ? ' btn-primary' : '')} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'open' ? 'Open' : f === 'closed' ? 'Closed' : 'All'}
          </button>
        ))}
      </div>

      {!shown.length ? (
        <p className="empty">{all.length ? 'No positions here.' : 'Start a position for an item you want to trade. Your ESI trades for it will be matched automatically after each sync.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="data wide">
            <thead>
              <tr>
                <th scope="col">Item</th><th scope="col" className="left">Status</th><th scope="col">Since</th>
                <th scope="col">Bought</th><th scope="col">Sold</th><th scope="col">In stock</th>
                <th scope="col">Avg buy</th><th scope="col">Avg sell</th><th scope="col">Realized profit</th><th scope="col">Return</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ p, c }) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`positions/${p.id}`)}>
                  <td className="name">
                    <a href={`#/positions/${p.id}`} onClick={(e) => e.stopPropagation()}>{nameOf(p.typeId)}</a>
                    {/* The row itself navigates, so keep the button's click to itself. */}
                    <span onClick={(e) => e.stopPropagation()}>
                      <OpenInGame typeId={p.typeId} name={nameOf(p.typeId)} label="In game" />
                    </span>
                  </td>
                  <td className="left"><span className={'pill ' + p.status}>{p.status === 'open' ? 'Open' : 'Closed'}</span></td>
                  <td>{fmtDate(p.openedAt)}</td>
                  <td>{units(c.bought)}</td>
                  <td>{units(c.sold)}</td>
                  <td>{units(c.stock)}</td>
                  <td>{isk(c.avgBuy)}</td>
                  <td>{isk(c.avgSell)}</td>
                  <td className={c.realized >= 0 ? 'pos' : 'neg'}>{iskBigSigned(c.realized)}</td>
                  <td className={c.roi == null ? '' : c.roi >= 0 ? 'pos' : 'neg'}>{pct(c.roi, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
