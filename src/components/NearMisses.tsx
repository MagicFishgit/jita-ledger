import { useEffect, useRef, useState } from 'react';
import { Check, GitPullRequestArrow, ListChecks } from 'lucide-react';
import { fmtShort, isk, iskBig, units } from '../lib/format';
import { patchPosition } from '../lib/actions';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import type { NearMiss } from '../lib/signals';
import type { Position } from '../lib/types';

/**
 * Trades a position skipped, said in one line rather than listed: how many bought and sold, for how
 * much, when, and why they weren't counted. "10 trades" of ones and fifteens reads as noise otherwise.
 */
export function nearSummary(near: NearMiss[], pos: Pick<Position, 'openedAt'>): string {
  const sum = (buy: boolean) => near.filter((n) => n.tx.isBuy === buy).reduce((t, n) => ({ q: t.q + n.tx.qty, v: t.v + n.tx.qty * n.tx.unitPrice }), { q: 0, v: 0 });
  const b = sum(true), s = sum(false);
  const parts = [
    s.q ? `sold ${units(s.q)} for ${iskBig(s.v)}` : null,
    b.q ? `bought ${units(b.q)} for ${iskBig(b.v)}` : null,
  ].filter(Boolean).join(' and ');
  const times = near.map((n) => Date.parse(n.tx.date));
  const first = fmtShort(Math.min(...times)), last = fmtShort(Math.max(...times));
  const when = first === last ? `on ${first}` : `between ${first} and ${last}`;
  const before = near.filter((n) => n.why === 'before').length;
  const elsewhere = near.length - before;
  const why = !elsewhere ? `before this position started on ${fmtShort(pos.openedAt)}`
    : !before ? 'outside Jita 4-4'
      : `${before} before this position started, ${elsewhere} outside Jita 4-4`;
  return `${parts.charAt(0).toUpperCase()}${parts.slice(1)} ${when} — ${why}.`;
}

/** The banner on a position, and the dialog behind it for dealing with the trades one by one. */
export function NearMissBanner({ pos, near, name }: { pos: Position; near: NearMiss[]; name: string }) {
  const [open, setOpen] = useState(false);
  const count = (ids: string[]) => {
    patchPosition(pos.id, (p) => ({ included: [...new Set([...p.included, ...ids])], excluded: p.excluded.filter((e) => !ids.includes(e)) }));
    update((x) => ({ nearDone: [...new Set([...x.nearDone, ...ids])] }));
    toast(`${ids.length === 1 ? '1 trade' : `${ids.length} trades`} counted in your ${name} position.`);
  };
  const ignore = (ids: string[]) => {
    update((x) => ({ nearDone: [...new Set([...x.nearDone, ...ids])] }));
    toast(`${ids.length === 1 ? '1 trade' : `${ids.length} trades`} ignored — ${ids.length === 1 ? 'it' : 'they'} won’t be suggested again.`, 'info');
  };
  const all = near.map((n) => n.tx.id);
  return (
    <>
      <div className="near-banner" role="region" aria-label="Trades this position skipped">
        <GitPullRequestArrow aria-hidden="true" />
        <span style={{ flex: 1, minWidth: 240 }}>
          <span className="nb-title">{near.length === 1 ? `1 trade of ${name} wasn’t counted` : `${near.length} trades of ${name} weren’t counted`}</span>
          <span className="nb-sub">{nearSummary(near, pos)}</span>
        </span>
        <button type="button" className="btn sm" onClick={() => setOpen(true)}><ListChecks aria-hidden="true" />Review</button>
        <button type="button" className="btn primary sm" onClick={() => count(all)}>Count all</button>
        <button type="button" className="link-btn dim" onClick={() => ignore(all)}>Ignore all</button>
      </div>
      {open && <NearMissDialog pos={pos} near={near} name={name} onCount={count} onIgnore={ignore} onClose={() => setOpen(false)} />}
    </>
  );
}

function NearMissDialog(props: {
  pos: Position; near: NearMiss[]; name: string;
  onCount: (ids: string[]) => void; onIgnore: (ids: string[]) => void; onClose: () => void;
}) {
  const { pos, near, name } = props;
  const d = useData();
  const ref = useRef<HTMLDialogElement>(null);
  const [sel, setSel] = useState<Set<string>>(() => new Set(near.map((n) => n.tx.id)));
  useEffect(() => { ref.current?.showModal(); }, []);
  // Close once everything has been dealt with.
  useEffect(() => { if (!near.length) props.onClose(); }, [near.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Rows dealt with elsewhere drop out of the selection.
  const live = new Set(near.map((n) => n.tx.id));
  const chosen = [...sel].filter((id) => live.has(id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = chosen.length === near.length;

  // The trades before the start are usually the first of this position's stock: moving the start back
  // counts them the ordinary way. Only offered when no other position trades this item, since a moved
  // start could then overlap one and count trades twice.
  const before = near.filter((n) => n.why === 'before');
  const earliest = before.length ? Math.min(...before.map((n) => Date.parse(n.tx.date))) : null;
  const alone = !d.positions.some((p) => p.id !== pos.id && p.typeId === pos.typeId);
  const moveStart = () => {
    const at = new Date(earliest!);
    at.setUTCHours(0, 0, 0, 0);
    patchPosition(pos.id, { openedAt: at.toISOString() });
    toast(`${name} position now starts ${fmtShort(at.getTime())}, so trades from then count.`);
  };

  return (
    <dialog
      className="confirm" ref={ref} aria-labelledby="nm-title"
      onClose={props.onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
    >
      <div className="dlg wide" role="document">
        <div className="dlg-head"><GitPullRequestArrow aria-hidden="true" /><span>Trades this position skipped</span></div>
        <div className="dlg-body">
          <h2 id="nm-title">{near.length === 1 ? `1 trade of ${name} wasn’t counted` : `${near.length} trades of ${name} weren’t counted`}</h2>
          <p>
            A position counts trades of its item {pos.jitaOnly ? 'in Jita 4-4 ' : ''}from its start date. These fell just outside that.
            Count the ones that belong to this position; ignore the rest and they won’t be suggested again.
          </p>
          {earliest != null && alone && (
            <div className="notice" style={{ marginTop: 14, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                {before.length === near.length ? 'All of these' : `${before.length} of these`} came before the start date. Starting the position on {fmtShort(earliest)} instead counts {before.length === 1 ? 'it' : 'them'} the ordinary way, along with anything else of {name} traded {pos.jitaOnly ? 'in Jita ' : ''}since.
              </div>
              <button type="button" className="btn sm" onClick={moveStart}>Start it on {fmtShort(earliest)}</button>
            </div>
          )}
          <div className="nm-table">
            <table className="tbl short">
              <thead><tr>
                <th scope="col" style={{ width: 36 }}>
                  <button type="button" className="tn-box" role="checkbox" aria-checked={allOn} aria-label={allOn ? 'Select none' : 'Select all'}
                    onClick={() => setSel(allOn ? new Set() : new Set(near.map((n) => n.tx.id)))} style={{ width: 18, height: 18 }}><Check aria-hidden="true" /></button>
                </th>
                <th scope="col" className="l">When (EVE)</th><th scope="col" className="l">Trade</th><th scope="col">Qty</th><th scope="col">Price</th><th scope="col">Value</th><th scope="col" className="l">Why it was skipped</th>
              </tr></thead>
              <tbody>
                {near.map((n) => {
                  const on = sel.has(n.tx.id);
                  return (
                    <tr key={n.tx.id} className={'click' + (on ? ' chosen' : '')} onClick={() => toggle(n.tx.id)}>
                      <td><button type="button" className="tn-box" role="checkbox" aria-checked={on} aria-label={`Select the ${n.tx.isBuy ? 'buy' : 'sale'} of ${n.tx.qty}`} onClick={(e) => { e.stopPropagation(); toggle(n.tx.id); }} style={{ width: 18, height: 18 }}><Check aria-hidden="true" /></button></td>
                      <td className="l" style={{ color: 'var(--sec)' }}>{n.tx.date.slice(0, 16).replace('T', ' ')}</td>
                      <td className="l txt" style={{ color: n.tx.isBuy ? 'var(--bid-t)' : 'var(--neg-t)' }}>{n.tx.isBuy ? 'Bought' : 'Sold'}</td>
                      <td>{units(n.tx.qty)}</td>
                      <td>{isk(n.tx.unitPrice)}</td>
                      <td>{iskBig(n.tx.qty * n.tx.unitPrice)}</td>
                      <td className="l txt">{n.why === 'before' ? 'Before the start date' : 'Outside Jita 4-4'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="dlg-actions">
            <button type="button" className="no" onClick={() => ref.current?.close()}>Close</button>
            <button type="button" className="no" disabled={!chosen.length} onClick={() => { props.onIgnore(chosen); setSel(new Set()); }}>Ignore {chosen.length === near.length ? 'all' : chosen.length || ''}</button>
            <button type="button" className="yes" disabled={!chosen.length} onClick={() => { props.onCount(chosen); setSel(new Set()); }}>Count {chosen.length === near.length ? 'all' : chosen.length || ''}</button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
