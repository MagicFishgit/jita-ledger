import { useMemo, useState } from 'react';
import { unassigned } from '../lib/positions';
import { fmtDateTime, isk, iskBig, units } from '../lib/format';
import { update, useData } from '../lib/store';
import { patchPosition, startPosition } from '../lib/actions';
import { JITA_44 } from '../lib/config';
import { confirmAsk } from '../lib/confirm';
import { OpenInGame, useTypeName } from './common';

const LIMIT = 300;

export function Inbox() {
  const d = useData();
  const nameOf = useTypeName();
  const [showPersonal, setShowPersonal] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const list = useMemo(() => unassigned(d), [d]);
  const personal = useMemo(
    () => Object.values(d.txs).filter((t) => d.ignored.includes(t.id)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    [d.txs, d.ignored],
  );
  const rows = (showPersonal ? personal : list).slice(0, LIMIT);

  const markPersonal = (ids: string[]) => update((x) => ({ ignored: [...new Set([...x.ignored, ...ids])] }));
  const unmark = (id: string) => update((x) => ({ ignored: x.ignored.filter((i) => i !== id) }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Inbox</h1>
          <p>
            Trades from your wallet that no position counts. Mark the ones you made for yourself as personal, count one in an open position,
            or start a position from a purchase.
          </p>
        </div>
        <div className="row">
          <button className="btn btn-small" aria-pressed={showPersonal} onClick={() => setShowPersonal((v) => !v)}>
            {showPersonal ? 'Show new trades' : `Show personal (${units(personal.length)})`}
          </button>
          {!showPersonal && list.length > 0 && (
            <button className="btn btn-small" onClick={async () => {
              if (await confirmAsk({ title: `Mark all ${list.length} trades as personal?`, body: 'They stay in the app but stop counting towards any position.', confirm: 'Mark as personal' })) {
                markPersonal(list.map((t) => t.id));
              }
            }}>
              Mark all as personal
            </button>
          )}
        </div>
      </div>
      {msg && <p className="notice" role="status">{msg}</p>}
      {!rows.length ? (
        <p className="empty">{showPersonal ? 'Nothing is marked as personal.' : 'All caught up. New trades appear here after each sync.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="data wide">
            <thead>
              <tr>
                <th scope="col">Item</th><th scope="col">Date</th><th scope="col" className="left">Trade</th><th scope="col">Quantity</th>
                <th scope="col">Price</th><th scope="col">Value</th><th scope="col" className="left">Where</th><th scope="col"><span className="opt">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => {
                const name = nameOf(tx.typeId);
                const open = d.positions.find((p) => p.typeId === tx.typeId && p.status === 'open');
                return (
                  <tr key={tx.id}>
                    <td className="name">{name}</td>
                    <td>{fmtDateTime(tx.date)}</td>
                    <td className="left">{tx.isBuy ? 'Buy' : 'Sell'}</td>
                    <td>{units(tx.qty)}</td>
                    <td>{isk(tx.unitPrice)}</td>
                    <td>{iskBig(tx.qty * tx.unitPrice)}</td>
                    <td className="left muted">{tx.locationId === JITA_44 ? 'Jita 4-4' : 'Elsewhere'}</td>
                    <td>
                      {showPersonal ? (
                        <button className="link-btn" onClick={() => unmark(tx.id)}>Not personal</button>
                      ) : (
                        <>
                          {open ? (
                            <button className="link-btn" onClick={() => {
                              patchPosition(open.id, (p) => ({ included: [...p.included, tx.id], excluded: p.excluded.filter((e) => e !== tx.id) }));
                              setMsg(`Counted in your ${name} position.`);
                            }}>Count in position</button>
                          ) : (
                            <button className="link-btn" onClick={() => {
                              startPosition(tx.typeId, tx.date, tx.locationId === JITA_44);
                              setMsg(`Started a ${name} position from ${fmtDateTime(tx.date)}. Later trades of it will count too.`);
                            }}>Start position from here</button>
                          )}
                          <button className="link-btn" onClick={() => markPersonal([tx.id])}>Personal</button>
                          <OpenInGame typeId={tx.typeId} name={name} label="In game" />
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(showPersonal ? personal : list).length > LIMIT && <p className="small muted">Showing the newest {LIMIT}.</p>}
        </div>
      )}
    </div>
  );
}
