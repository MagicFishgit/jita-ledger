import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MonitorUp, Search } from 'lucide-react';
import { openMarketWindow, resolveNames, resolveType } from '../lib/market';
import { hasScope } from '../lib/auth';
import { SCOPE } from '../lib/config';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import { iskBig } from '../lib/format';
import { typeName } from '../lib/universe';
import { relistPace, type RelistPace } from '../lib/flow';
import { useFlow, watchedFlow } from '../lib/flowStore';

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

/** Skill level picker. `cap` marks levels you've trained but can't use as Alpha. */
export function LevelBoxes(props: { label: string; help?: string; value: number; cap?: number | null; disabled?: boolean; onChange: (n: number) => void }) {
  const { label, help, value, disabled, onChange } = props;
  const cap = props.cap ?? null;
  const id = useId();
  const set = (n: number) => { if (!disabled) onChange(Math.min(5, Math.max(0, n))); };
  const onKey = (e: KeyboardEvent) => {
    let n: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = value + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = value - 1;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = 5;
    else if (/^[0-5]$/.test(e.key)) n = +e.key;
    if (n !== null) { e.preventDefault(); set(n); }
  };
  const capped = cap !== null && value > cap;
  const text = !value ? 'Not trained'
    : capped ? `Level ${ROMAN[value]} trained, ${cap ? `Level ${ROMAN[cap]}` : 'none'} usable as Alpha`
    : `Level ${ROMAN[value]}`;
  return (
    <div className="lvl-row">
      <span>
        <span className="ln" id={id}>{label}</span>
        <span className="lt" style={{ display: 'block', color: capped ? 'var(--acc2)' : 'var(--sec)' }}>{text}</span>
      </span>
      <div
        className="lvl-boxes" role="slider" tabIndex={disabled ? -1 : 0}
        aria-labelledby={id} aria-valuemin={0} aria-valuemax={5} aria-valuenow={value} aria-valuetext={text}
        aria-disabled={disabled || undefined} onKeyDown={onKey}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= value;
          const over = cap !== null && n > cap && on;
          return (
            <button
              key={n} type="button" tabIndex={-1} title={`Level ${ROMAN[n]}`} aria-hidden="true"
              className={over ? 'over' : on ? 'on' : ''} onClick={() => set(value === n ? n - 1 : n)}
            />
          );
        })}
      </div>
      {help && <span className="lh">{help}</span>}
    </div>
  );
}

/**
 * Find an item by its exact in-game name, offering the ones you have already seen as you type.
 * Anything not in this browser yet is looked up on ESI when you press Enter or the button.
 */
export function ItemSearch(props: {
  onFound: (t: { id: number; name: string }) => void;
  initial?: string;
  button?: string;
  placeholder?: string;
  tip?: string;
  tipTitle?: string;
  width?: number;
  busyLabel?: string;
  /** Keep what was typed after a successful find, as the calculator does. */
  keep?: boolean;
  prices?: Record<number, number>;
}) {
  const d = useData();
  const [text, setText] = useState(props.initial ?? '');
  const [focus, setFocus] = useState(false);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const inputId = useId();
  // Follow the item the page is showing, so a deep link fills the box in.
  const { initial } = props;
  useEffect(() => { setText(initial ?? ''); }, [initial]);

  const known = useMemo(() => {
    const ids = new Set<number>();
    Object.values(d.txs).forEach((t) => ids.add(t.typeId));
    Object.values(d.orders).forEach((o) => ids.add(o.typeId));
    d.positions.forEach((p) => ids.add(p.typeId));
    d.watchlist.forEach((w) => ids.add(w.typeId));
    return [...ids].filter((id) => d.names[id]).map((id) => ({ id, name: d.names[id] }));
  }, [d.txs, d.orders, d.positions, d.watchlist, d.names]);

  const q = text.trim().toLowerCase();
  const sug = q ? known.filter((i) => i.name.toLowerCase().includes(q) && i.name.toLowerCase() !== q).slice(0, 6) : [];

  async function find(name: string) {
    const clean = name.trim();
    if (!clean) { toast('Type an item name first.', 'err'); return; }
    setBusy(true);
    try {
      const hit = known.find((k) => k.name.toLowerCase() === clean.toLowerCase())
        ?? Object.entries(d.names).map(([id, n]) => ({ id: Number(id), name: n })).find((k) => k.name.toLowerCase() === clean.toLowerCase());
      const t = hit ?? await resolveType(clean);
      if (!t) { toast(`No item is called “${clean}”. Use the exact name from the game.`, 'err'); return; }
      if (!d.names[t.id]) update((x) => ({ names: { ...x.names, [t.id]: t.name } }));
      setText(props.keep ? t.name : '');
      setFocus(false);
      props.onFound(t);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (sug.length && focus) find(sug[Math.min(sel, sug.length - 1)].name); else find(text);
    } else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(sug.length - 1, sel + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(0, sel - 1)); }
    else if (e.key === 'Escape') setFocus(false);
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <label htmlFor={inputId} className="chip search" data-tip={props.tip} data-tip-title={props.tipTitle} style={props.width ? { width: props.width } : undefined}>
        <Search aria-hidden="true" />
        <input
          id={inputId} type="text" autoComplete="off" value={text} placeholder={props.placeholder ?? 'Item, e.g. Hammerhead II'}
          role="combobox" aria-expanded={focus && sug.length > 0} aria-controls={listId} aria-autocomplete="list"
          onChange={(e) => { setText(e.target.value); setFocus(true); setSel(0); }}
          onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)} onKeyDown={onKey}
        />
      </label>
      <button type="button" className="btn primary" style={{ clipPath: 'none', height: 36 }} disabled={busy} onClick={() => find(text)}>
        {busy ? props.busyLabel ?? 'Finding…' : props.button ?? 'Find'}
      </button>
      {focus && sug.length > 0 && (
        <div className="suggest" id={listId} role="listbox">
          {sug.map((s, i) => (
            <button key={s.id} type="button" role="option" aria-selected={i === sel} onMouseDown={(e) => { e.preventDefault(); find(s.name); }}>
              <span>{s.name}</span>
              {props.prices?.[s.id] != null && <span>{iskBig(props.prices[s.id])}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const UI_SCOPE = SCOPE.ui;

/**
 * Opens an item's market window in the running EVE client.
 *
 * This is as far as ESI reaches: it can put the right window in front of you inside the game, but
 * nothing on a web page can raise the game itself --- a browser is not allowed to focus another
 * application. So you will still need to switch to the client; the window will be waiting.
 *
 * Renders nothing without the scope, since a button that cannot work is worse than no button.
 */
async function openInGame(typeId: number, name: string): Promise<void> {
  try {
    await openMarketWindow(typeId);
    toast(`Opened ${name}’s market window in your client. You’ll still need to switch to the game.`, 'info');
  } catch (e) {
    toast(`Couldn’t open the market window: ${e instanceof Error ? e.message : String(e)}`, 'err');
  }
}

export function OpenInGame({ typeId, name, label = 'In game', variant = 'link' }: { typeId: number; name: string; label?: string; variant?: 'link' | 'btn' | 'dim' }) {
  const [busy, setBusy] = useState(false);
  if (!hasScope(UI_SCOPE)) return null;
  const go = async () => {
    setBusy(true);
    try { await openInGame(typeId, name); } finally { setBusy(false); }
  };
  if (variant === 'btn') {
    return (
      <button type="button" className="btn" disabled={busy} onClick={go} aria-label={`Open ${name}'s market window in the EVE client`}>
        <MonitorUp aria-hidden="true" />{busy ? 'Opening…' : label}
      </button>
    );
  }
  return (
    <button
      type="button" className={'link-btn' + (variant === 'dim' ? ' dim' : '')} disabled={busy} onClick={go}
      aria-label={`Open ${name}'s market window in the EVE client`}
      data-tip="Opens the market window in your EVE client. You’ll still need to switch to the game."
    >
      {busy ? 'Opening…' : label}
    </button>
  );
}

/**
 * An item's name that opens its market window in the client when clicked, where the login allows it;
 * plain text where it doesn't. For tables whose rows are items you act on in game.
 */
export function NameInGame({ typeId, name, className }: { typeId: number; name: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  if (!hasScope(UI_SCOPE)) return <span className={className}>{name}</span>;
  return (
    <button
      type="button" className={'name-btn' + (className ? ' ' + className : '')} disabled={busy}
      onClick={async () => { setBusy(true); try { await openInGame(typeId, name); } finally { setBusy(false); } }}
      aria-label={`${name}: open its market window in the EVE client`}
      data-tip="Opens the market window in your EVE client. You’ll still need to switch to the game."
    >
      {name}
    </button>
  );
}

/** Whether the "open in game" buttons can work at all, for pages that say so. */
export const canOpenInGame = () => hasScope(UI_SCOPE);

export function useTypeName() {
  const d = useData();
  return (id: number) => d.names[id] ?? `Item #${id}`;
}

/** Makes sure every type here has a name, fetching the missing ones once and keeping them. */
export function useEnsureNames(ids: number[]) {
  const d = useData();
  const key = [...new Set(ids)].filter((id) => !d.names[id]).slice(0, 1000).join(',');
  useEffect(() => {
    if (!key) return;
    let live = true;
    const ids = key.split(',').map(Number);
    const keep = (n: Record<number, string>) => { if (live && Object.keys(n).length) update((x) => ({ names: { ...x.names, ...n } })); };
    // /universe/names/ refuses the whole batch if one ID is bad, so fall back to asking one at a time.
    resolveNames(ids).then(keep).catch(() => Promise.all(ids.map((id) => typeName(id).then((n) => [id, n] as const).catch(() => null)))
      .then((rows) => keep(Object.fromEntries(rows.filter((r): r is readonly [number, string] => !!r && !!r[1])))));
    return () => { live = false; };
  }, [key]);
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="faint">{children}</span>;
}

/**
 * "Busy relisting" under an item's name when the front is undercut (or outbid) every half hour or more often
 * while the app watched it (`relistPace`). One side for an order; either side for an item. It only says so:
 * a busy market can still be worth trading, patiently, so nothing is hidden or ranked lower for it.
 */
export function BusyRelisting({ typeId, isBuy }: { typeId: number; isBuy?: boolean }) {
  useFlow();
  const f = watchedFlow(typeId);
  const sides = (isBuy == null ? [false, true] : [isBuy]).map((b) => relistPace(f, b)).filter((p) => p?.busy) as RelistPace[];
  if (!sides.length) return null;
  return (
    <span className="sub" tabIndex={0} style={{ color: 'var(--acc2)' }} data-tip-title="Busy relisting"
      data-tip={`${sides.map((p) => p.said).join(' ')}\n\nExpect to be undercut soon after you list or move. Pricing patiently, at a level that sells over time, usually beats chasing the front with a fee each time.`}>
      Busy relisting
    </span>
  );
}
