import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
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

/** The "i" itself. Open state lives with whatever owns the note, so it can place it sensibly. */
function InfoButton(p: { term: string; open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button
      type="button" className="info" aria-expanded={p.open} aria-controls={p.controls}
      aria-label={`What \u201c${p.term}\u201d means`} onClick={p.onToggle}
    >i</button>
  );
}

/**
 * A small "i" whose note appears on hover, for a term that isn't a form field.
 *
 * The note is positioned out of the flow, so showing it never pushes the rest of the page around ---
 * a tooltip that shifts every row below it is worse than no tooltip. Hover and keyboard focus both
 * reveal it through CSS alone; the button stays a real button so touch, where there is no hover,
 * can still tap it open.
 */
export function Explain({ term, children }: { term: string; children: ReactNode }) {
  const [tapped, setTapped] = useState(false);
  const id = useId();
  return (
    <span className={'tipwrap' + (tapped ? ' tapped' : '')}>
      <button
        type="button" className="info" aria-describedby={id}
        aria-label={`What \u201c${term}\u201d means`}
        onClick={() => setTapped((t) => !t)}
        onBlur={() => setTapped(false)}
      >i</button>
      <span className="explain" id={id} role="tooltip">{children}</span>
    </span>
  );
}

/**
 * A labelled input with an "i" explaining the term in plain English.
 * The note opens under the field and takes the whole row, so a long one reads as a
 * paragraph rather than a tall column of two-word lines.
 */
export function Field(props: { id: string; label: string; opt?: string; tip?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  return (
    <div className={'field' + (open ? ' explaining' : '')}>
      <div className="field-head">
        <label htmlFor={props.id}>{props.label}{props.opt && <span className="opt"> {props.opt}</span>}</label>
        {props.tip && <InfoButton term={props.label} open={open} controls={tipId} onToggle={() => setOpen(!open)} />}
      </div>
      {props.children}
      {props.tip && open && <p className="explain" id={tipId}>{props.tip}</p>}
    </div>
  );
}

/** Exact in-game item name to type ID, with names you've already seen offered as suggestions. */
export function ItemFinder(props: { label?: string; button?: string; onFound: (t: { id: number; name: string }) => void; initial?: string; tip?: ReactNode }) {
  const d = useData();
  const [text, setText] = useState(props.initial ?? '');
  // Follow the item the page is showing, so a #/calculator?type=123 link fills the box in.
  // This alone can't clear it: Clear sets the item to null, and null -> null leaves the
  // dependency unchanged, so the parent remounts this with a key instead.
  const { initial } = props;
  useEffect(() => { setText(initial ?? ''); setErr(null); }, [initial]);
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
      <Field id={inputId} label={props.label ?? 'Item'} tip={props.tip}>
        <input id={inputId} type="text" list={listId} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Hammerhead II" autoComplete="off" />
        <datalist id={listId}>{known.map((n) => <option key={n} value={n} />)}</datalist>
      </Field>
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
