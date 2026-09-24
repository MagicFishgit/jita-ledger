import { useId, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { resolveType } from '../lib/market';
import { update, useData } from '../lib/store';
import { fmtDate, isk, units } from '../lib/format';

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
    <div className="skill">
      <span className="skill-name" id={id}>{label}</span>
      <span className="skill-level">{text}</span>
      <div
        className="levels" role="slider" tabIndex={disabled ? -1 : 0}
        aria-labelledby={id} aria-valuemin={0} aria-valuemax={5} aria-valuenow={value} aria-valuetext={text}
        aria-disabled={disabled || undefined} onKeyDown={onKey}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={'box' + (n <= value ? ' on' : '') + (cap !== null && n > cap ? ' over-cap' : '')} title={`Level ${ROMAN[n]}`} onClick={() => set(value === n ? n - 1 : n)} />
        ))}
      </div>
      {help && <span className="skill-help">{help}</span>}
    </div>
  );
}

/** Exact in-game item name to type ID, with names you've already seen offered as suggestions. */
export function ItemFinder(props: { label?: string; button?: string; onFound: (t: { id: number; name: string }) => void; initial?: string }) {
  const d = useData();
  const [text, setText] = useState(props.initial ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listId = useId();
  const inputId = useId();
  const known = useMemo(() => [...new Set(Object.values(d.names))].sort().slice(0, 2000), [d.names]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = text.trim();
    if (!name) { setErr('Type an item name first.'); return; }
    setBusy(true); setErr(null);
    try {
      const hit = Object.entries(d.names).find(([, n]) => n.toLowerCase() === name.toLowerCase());
      const t = hit ? { id: Number(hit[0]), name: hit[1] } : await resolveType(name);
      if (!t) { setErr(`No item is called “${name}”. Use the exact name from the game.`); return; }
      if (!d.names[t.id]) update((x) => ({ names: { ...x.names, [t.id]: t.name } }));
      setText(t.name);
      props.onFound(t);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor={inputId}>{props.label ?? 'Item'}</label>
        <input id={inputId} type="text" list={listId} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Hammerhead II" autoComplete="off" />
        <datalist id={listId}>{known.map((n) => <option key={n} value={n} />)}</datalist>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Finding…' : props.button ?? 'Find'}</button>
      {err && <p className="hint neg" style={{ flexBasis: '100%', margin: 0 }} role="alert">{err}</p>}
    </form>
  );
}

export function useTypeName() {
  const d = useData();
  return (id: number) => d.names[id] ?? `Item #${id}`;
}

export function Stat(props: { label: string; value: ReactNode; note?: ReactNode; cls?: string }) {
  return (
    <div className="stat">
      <dt>{props.label}</dt>
      <dd className={props.cls}>{props.value}{props.note && <small>{props.note}</small>}</dd>
    </div>
  );
}

type TipEntry = { name?: string; value?: number | string; dataKey?: string | number; payload?: Record<string, number> };
/** Tooltip body for time-based charts. */
export function ChartTip(props: { active?: boolean; payload?: TipEntry[]; label?: number | string; unitsKeys?: string[] }) {
  if (!props.active || !props.payload?.length) return null;
  const t = props.payload[0]?.payload?.t ?? props.label;
  return (
    <div className="tip">
      {t != null && <b>{fmtDate(Number(t))}</b>}
      {props.payload.map((p, i) => {
        const isUnits = props.unitsKeys?.includes(String(p.dataKey));
        const qty = p.payload?.qty;
        return (
          <div key={i}>
            {p.name}: {isUnits ? units(Number(p.value)) : isk(Number(p.value))}
            {qty != null && !isUnits ? ` × ${units(qty)}` : ''}
          </div>
        );
      })}
    </div>
  );
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
