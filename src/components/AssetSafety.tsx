import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, ShieldAlert } from 'lucide-react';
import { AUTO_FEE, formatCountdown, holderWorth, parseCountdown, safetyTimes, unpackCost } from '../lib/assetSafety';
import type { SafetyHolder, SafetyStack, SafetyWrap } from '../lib/esiRecords';
import { ago, fmtDateTime, iskBig, units } from '../lib/format';
import { useNow } from '../lib/hooks';
import { resolveNames } from '../lib/market';
import { update, type Data } from '../lib/store';
import { toast } from '../lib/toast';
import { isStation } from '../lib/universe';
import { useEnsureNames, useTypeName } from './common';
import { Panel } from './ui';
import { Figures } from './Facts';

/**
 * Your items in asset safety: each wrap, what's in it and roughly what that's worth, a countdown to its automatic
 * delivery, and what unpacking costs. ESI lists the wrap but not its timing, so the countdown comes from the one the
 * game shows (typed in once) or from when the cloud saw the wrap go in (assetSafety.ts). Shown only while you have one.
 */
export function AssetSafety({ d, rough }: { d: Data; rough: Record<number, number> | null }) {
  const wraps = d.stock?.safety ?? [];
  const now = useNow(1000);
  // Everything in a wrap gets a name, not only what you've traded: the user's five blueprint copies read "Item #47971".
  const ids = useMemo(() => {
    const out: number[] = [];
    const walk = (hs: SafetyHolder[] | undefined) => {
      for (const h of hs ?? []) { out.push(h.typeId, ...Object.keys(h.items).map(Number), ...(h.contents ?? []).map((c) => c.typeId)); walk(h.holders); }
    };
    for (const w of wraps) { out.push(...Object.keys(w.items).map(Number), ...(w.contents ?? []).map((c) => c.typeId)); walk(w.holders); }
    return out;
  }, [wraps]);
  useEnsureNames(ids);
  const [names, setNames] = useState<Record<number, string>>({});
  const stationKey = wraps.flatMap((w) => [w.stationId, w.notice?.stationId]).filter((id): id is number => id != null && isStation(id)).join(',');
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
        {wraps.map((w) => <Wrap key={w.id} w={w} d={d} rough={rough} now={now} station={w.stationId != null ? names[w.stationId] ?? null : null}
          dest={w.notice?.stationId != null ? names[w.notice.stationId] ?? null : null} />)}
      </div>
    </Panel>
  );
}

/** One line of a wrap's list: a stack of one item, or a container or ship with everything in it. */
type Row = { key: string; typeId: number; q: number; v: number | null; h?: SafetyHolder; inside?: number; bay?: string; copy?: boolean };

/** Where in a ship things are listed, in the game's order; any other bay after these, by name. */
const BAYS = ['Fitted', 'Cargo hold', 'Drone bay', 'Fighter bay', 'Fleet hangar', 'Ship maintenance bay'];
const bayRank = (b: string | undefined) => (b == null ? 99 : BAYS.includes(b) ? BAYS.indexOf(b) : 50);

/**
 * What's in something as packed, most valuable first: its containers and ships and its loose items (blueprint copies
 * too, worth nothing on the market), grouped by where they sit when it's a ship. Reads older records without
 * `contents` from the plain count by type.
 */
function rowsOf(contents: SafetyStack[] | undefined, loose: Record<number, number>, holders: SafetyHolder[] | undefined, price: (id: number) => number | undefined): Row[] {
  const rows: Row[] = [];
  for (const h of holders ?? []) {
    const w = holderWorth(h, price);
    rows.push({ key: `h${h.id}`, typeId: h.typeId, q: 1, v: w.priced ? w.value : null, h, inside: w.inside, bay: h.bay });
  }
  const stacks = contents ?? Object.entries(loose).map(([id, q]) => ({ typeId: Number(id), q }) as SafetyStack);
  for (const s of stacks) {
    const p = s.copy ? undefined : price(s.typeId);
    rows.push({ key: `t${s.typeId}|${s.bay ?? ''}|${s.copy ? 1 : 0}`, typeId: s.typeId, q: s.q, v: p != null ? p * s.q : null, bay: s.bay, copy: s.copy });
  }
  return rows.sort((a, b) => bayRank(a.bay) - bayRank(b.bay) || (a.bay ?? '').localeCompare(b.bay ?? '') || (b.v ?? -1) - (a.v ?? -1));
}

function Wrap({ w, d, rough, now, station, dest }: { w: SafetyWrap; d: Data; rough: Record<number, number> | null; now: number; station: string | null; dest: string | null }) {
  const name = useTypeName();
  const typed = d.safetyTimes[String(w.id)] ?? null;
  const t = safetyTimes(w, typed);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const price = (id: number) => rough?.[id];
  const cost = useMemo(() => unpackCost(w.items, (id) => rough?.[id]), [w.items, rough]);
  const rows = useMemo(() => rowsOf(w.contents, w.loose ?? w.items, w.holders, (id) => rough?.[id]), [w.contents, w.loose, w.items, w.holders, rough]);
  const count = Object.values(w.items).reduce((n, q) => n + q, 0);
  const copies = useMemo(() => {
    let n = 0;
    const walk = (cs: SafetyStack[] | undefined, hs: SafetyHolder[] | undefined) => {
      for (const s of cs ?? []) if (s.copy) n += s.q;
      for (const h of hs ?? []) walk(h.contents, h.holders);
    };
    walk(w.contents, w.holders);
    return n;
  }, [w.contents, w.holders]);
  const packed = rows.some((r) => r.h);
  const toggle = (id: number) => setOpen((was) => {
    const next = new Set(was);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Containers and ships open to what's in them, a step in; loose items line up with the names beside a chevron. A
  // ship's things sit under where they are in it, as the game lists them: fitted, cargo hold, drone bay.
  const lines = (rs: Row[], depth: number, path = ''): ReactNode[] => rs.flatMap((r, i) => {
    const pad = 16 + depth * 22 + (packed && !r.h ? 22 : 0);
    const head = r.bay && r.bay !== rs[i - 1]?.bay ? (
      <tr key={`${path}bay:${r.bay}`}>
        <td className="l" colSpan={4} style={{ height: 30, paddingLeft: 16 + depth * 22 + 22, paddingTop: 10 }}><span className="lbl">{r.bay}</span></td>
      </tr>
    ) : null;
    const line = (
      <tr key={path + r.key}>
        <td className="l" style={{ whiteSpace: 'normal', paddingLeft: pad }}>
          {r.h ? (
            <button type="button" className="panel-toggle" aria-expanded={open.has(r.h.id)} onClick={() => toggle(r.h!.id)}>
              <ChevronRight className="chev" aria-hidden="true" />
              <span>
                {r.h.name ?? name(r.typeId)}
                <span className="faint">{r.h.name ? ` · ${name(r.typeId)}` : ''} · {units(r.inside ?? 0)} inside</span>
              </span>
            </button>
          ) : <>{name(r.typeId)}{r.copy && <span className="faint"> · copy</span>}</>}
        </td>
        <td>{units(r.q)}</td>
        <td>{r.v != null ? iskBig(r.v) : '–'}</td>
        <td style={{ color: 'var(--sec)' }}>{r.v != null ? iskBig(r.v * AUTO_FEE) : '–'}</td>
      </tr>
    );
    const out = head ? [head, line] : [line];
    return r.h && open.has(r.h.id) ? [...out, ...lines(rowsOf(r.h.contents, r.h.items, r.h.holders, price), depth + 1, `${path}${r.key}/`)] : out;
  });
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
          costs 15% of each one’s estimate, about <b>{rough ? iskBig(cost.auto) : '…'}</b> for everything (it shows in your wallet as an asset safety fee).
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
              {t.autoAt! > now ? `until it’s delivered automatically${dest ? ` to ${dest}` : ''}, ${t.from === 'notice' ? '' : 'around '}${fmtDateTime(t.autoAt!)}` : 'It should show as delivered at the next check of your assets.'}
            </span>
          </div>
          <span className="note small" style={{ margin: 0 }}>
            {t.from === 'notice' ? `From EVE’s notification when it went in, ${fmtDateTime(Date.parse(w.notice!.at))}. ` : t.from === 'typed' ? 'From the countdown you typed in. ' : 'Counted from when the cloud saw it go in, within a couple of hours. '}
            {t.manualAt! <= now
              ? 'You can have it delivered by hand to a station in the same system now (Deliver To… in the game), for 0.5% instead of 15%.'
              : `Delivery by hand to a station in the same system opens ${fmtDateTime(t.manualAt!)}, for 0.5% instead of 15%.`}
            {t.from !== 'notice' && <>{' '}<button type="button" className="link-btn" onClick={() => { setEditing(true); setText(''); }}>Change</button></>}
          </span>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="tbl compact" style={{ minWidth: 360 }}>
          <thead><tr><th scope="col" className="l">Item</th><th scope="col">Qty</th><th scope="col">Worth</th><th scope="col">To unpack</th></tr></thead>
          <tbody>
            {lines(rows.slice(0, all ? undefined : 8), 0)}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${units(rows.length)}`}</button>}
      <Figures items={[
        { key: 'n', value: units(count), label: `item${count === 1 ? '' : 's'}${copies ? `, and ${units(copies)} blueprint cop${copies === 1 ? 'y' : 'ies'} (no market price)` : ''}` },
        { key: 'worth', value: rough ? iskBig(cost.value) : '…', label: `at CCP’s estimates${rough && cost.unpriced.length ? `; ${units(cost.unpriced.length)} with none count as nothing` : ''}` },
        { key: 'auto', value: rough ? iskBig(cost.auto) : '…', label: 'to unpack after the automatic delivery (15%)' },
        { key: 'hand', value: rough ? iskBig(cost.manual) : '…', label: 'delivered by hand in the system (0.5%)' },
      ]} />
      {w.firstSeen && <span className="note small" style={{ margin: 0 }}>Tracked since {fmtDateTime(Date.parse(w.firstSeen))}.</span>}
    </div>
  );
}
