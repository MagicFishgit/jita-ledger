import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { formatCountdown, parseCountdown, safetyTimes, unpackCost } from '../lib/assetSafety';
import type { SafetyWrap } from '../lib/esiRecords';
import { ago, fmtDateTime, iskBig, units } from '../lib/format';
import { useNow } from '../lib/hooks';
import { resolveNames } from '../lib/market';
import { update, type Data } from '../lib/store';
import { toast } from '../lib/toast';
import { isStation } from '../lib/universe';
import { useTypeName } from './common';
import { Panel } from './ui';

/**
 * Your items in asset safety: each wrap, what's in it and roughly what that's worth, a countdown to its automatic
 * delivery, and what unpacking costs. ESI lists the wrap but not its timing, so the countdown comes from the one the
 * game shows (typed in once) or from when the cloud saw the wrap go in (assetSafety.ts). Shown only while you have one.
 */
export function AssetSafety({ d, rough }: { d: Data; rough: Record<number, number> | null }) {
  const wraps = d.stock?.safety ?? [];
  const now = useNow(1000);
  const [names, setNames] = useState<Record<number, string>>({});
  const stationKey = wraps.map((w) => w.stationId).filter((id): id is number => id != null && isStation(id)).join(',');
  useEffect(() => {
    if (!stationKey) return;
    let alive = true;
    resolveNames(stationKey.split(',').map(Number)).then((n) => { if (alive) setNames(n); }).catch(() => undefined);
    return () => { alive = false; };
  }, [stationKey]);
  if (!wraps.length) return null;
  return (
    <Panel title="In asset safety" sub="Your things from a structure you lost, waiting to be delivered and unpacked">
      <div className="col" style={{ gap: 16 }}>
        {wraps.map((w) => <Wrap key={w.id} w={w} d={d} rough={rough} now={now} station={w.stationId != null ? names[w.stationId] ?? null : null} />)}
      </div>
    </Panel>
  );
}

function Wrap({ w, d, rough, now, station }: { w: SafetyWrap; d: Data; rough: Record<number, number> | null; now: number; station: string | null }) {
  const name = useTypeName();
  const typed = d.safetyTimes[String(w.id)] ?? null;
  const t = safetyTimes(w, typed);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);
  const cost = useMemo(() => unpackCost(w.items, (id) => rough?.[id]), [w.items, rough]);
  const rows = useMemo(() => Object.entries(w.items).map(([id, q]) => ({ id: Number(id), q, v: rough?.[Number(id)] != null ? rough[Number(id)] * q : null }))
    .sort((a, b) => (b.v ?? -1) - (a.v ?? -1)), [w.items, rough]);
  const count = rows.reduce((n, r) => n + r.q, 0);
  const save = () => {
    const ms = parseCountdown(text);
    if (ms == null) { toast('Type it as the game shows it, like 14d 7h 24m 32s.', 'warn'); return; }
    const at = new Date().toISOString();
    update((x) => ({ safetyTimes: { ...x.safetyTimes, [String(w.id)]: { autoAt: new Date(Date.now() + ms).toISOString(), at } } }));
    setEditing(false); setText('');
  };
  const delivered = w.state === 'delivered';
  const ask = !delivered && (t.autoAt == null || editing);
  return (
    <div className="inset-box col" style={{ gap: 10, padding: '14px 16px' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="row tight" style={{ minWidth: 0 }}>
          <ShieldAlert aria-hidden="true" style={{ width: 15, height: 15, color: 'var(--acc2)', flex: 'none' }} />
          <b style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{w.name ?? 'A wrap of your items'}</b>
        </span>
        <span className="lbl" style={{ color: delivered ? 'var(--pos)' : 'var(--acc2)' }}>{delivered ? 'Delivered' : 'In asset safety'}</span>
      </div>

      {delivered ? (
        <p style={{ margin: 0 }}>
          Delivered to <b>{station ?? 'a station'}</b>{w.deliveredAt ? ` ${ago(w.deliveredAt, now)}` : ''}. Unpack it there: dragging items out of the wrap
          costs 15% of each one’s estimate, about <b>{iskBig(cost.auto)}</b> for everything (it shows in your wallet as an asset safety fee).
        </p>
      ) : ask ? (
        <div className="col" style={{ gap: 8 }}>
          <label htmlFor={`as-${w.id}`} style={{ fontSize: 13, color: 'var(--body)' }}>
            {t.autoAt == null ? 'When is it delivered? The game shows it under Assets → Asset Safety → Auto Delivery. Type it once and this counts down.' : 'Type the countdown the game shows now.'}
          </label>
          <div className="row" style={{ gap: 8 }}>
            <input id={`as-${w.id}`} className="num" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              placeholder="14d 7h 24m 32s" autoComplete="off" style={{ width: 180, maxWidth: '100%' }} />
            <button type="button" className="btn sm primary" onClick={save}>Start the countdown</button>
            {editing && <button type="button" className="link-btn dim" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 4 }}>
          <div className="row" style={{ alignItems: 'baseline', gap: 12 }}>
            <span className="mono" style={{ fontSize: 'clamp(19px, 5.4vw, 26px)', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{t.autoAt! > now ? formatCountdown(t.autoAt! - now) : 'Due now'}</span>
            <span style={{ fontSize: 13, color: 'var(--sec)' }}>
              {t.autoAt! > now ? `until it’s delivered automatically, around ${fmtDateTime(t.autoAt!)}` : 'It should show as delivered at the next check of your assets.'}
            </span>
          </div>
          <span className="note small" style={{ margin: 0 }}>
            {t.from === 'typed' ? 'From the countdown you typed in. ' : 'Counted from when the cloud saw it go in, within a couple of hours. '}
            {t.manualAt! <= now
              ? 'You can have it delivered by hand to a station in the same system now (Deliver To… in the game), for 0.5% instead of 15%.'
              : `Delivery by hand to a station in the same system opens ${fmtDateTime(t.manualAt!)}, for 0.5% instead of 15%.`}
            {' '}<button type="button" className="link-btn" onClick={() => { setEditing(true); setText(''); }}>Change</button>
          </span>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="tbl compact" style={{ minWidth: 360 }}>
          <thead><tr><th scope="col" className="l">Item</th><th scope="col">Qty</th><th scope="col">Worth</th><th scope="col">To unpack</th></tr></thead>
          <tbody>
            {rows.slice(0, all ? undefined : 8).map((r) => (
              <tr key={r.id}>
                <td className="l" style={{ whiteSpace: 'normal' }}>{name(r.id)}</td>
                <td>{units(r.q)}</td>
                <td>{r.v != null ? iskBig(r.v) : '–'}</td>
                <td style={{ color: 'var(--sec)' }}>{r.v != null ? iskBig(r.v * 0.15) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${units(rows.length)}`}</button>}
      <p className="note small" style={{ margin: 0 }}>
        {units(count)} item{count === 1 ? '' : 's'}, worth about <b>{rough ? iskBig(cost.value) : '…'}</b> at CCP’s estimated prices{cost.unpriced.length ? ` (${units(cost.unpriced.length)} with no estimate count as nothing)` : ''}.
        {' '}Unpacking after the automatic delivery costs 15% of each item’s estimate, about {iskBig(cost.auto)}; delivered by hand within the system, 0.5%, about {iskBig(cost.manual)}.
        {w.firstSeen ? ` The app has tracked it since ${fmtDateTime(Date.parse(w.firstSeen))}.` : ''}
      </p>
    </div>
  );
}
