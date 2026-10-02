import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { BookOpen, Check as CheckIcon, ChevronRight, CircleAlert, Funnel, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { canPress, pressTile, showingSaid } from '../lib/tileFilter';

/**
 * The pieces every page is made of. Each mirrors one recurring part of the HUD design so a page reads
 * as layout and data, not as styling.
 */

export const cssVars = (v: Record<string, string | number | undefined>): CSSProperties => v as CSSProperties;

export function PageHead(props: { kicker: string; title: ReactNode; lede?: ReactNode; actions?: ReactNode; wide?: boolean }) {
  return (
    <div className="page-head" data-rv="">
      <div>
        <div className="kicker">{props.kicker}</div>
        <h1 className="page-title">{props.title}</h1>
        {props.lede && <p className="lede" style={props.wide ? { maxWidth: 860 } : undefined}>{props.lede}</p>}
      </div>
      {props.actions && <div className="head-actions">{props.actions}</div>}
    </div>
  );
}

export function Panel(props: { title?: ReactNode; sub?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties; label?: string; tip?: string }) {
  return (
    <section className={'panel ' + (props.className ?? '')} style={props.style} aria-label={props.label} data-rv="">
      {(props.title || props.sub) && (
        <div className="panel-head">
          {props.title && <span className="panel-title">{props.title}{props.tip && <Tip text={props.tip} title={typeof props.title === 'string' ? props.title : undefined} />}</span>}
          {props.sub && <span className="panel-sub">{props.sub}</span>}
        </div>
      )}
      {props.children}
    </section>
  );
}

/** A big figure with a line under it. */
export function Figure({ value, sub, color }: { value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="figure-stack">
      <span className="big" style={color ? { color } : undefined}>{value}</span>
      {sub && <span className="big-sub">{sub}</span>}
    </div>
  );
}

/**
 * A count tile that filters the table below it (lib/tileFilter.ts): whether it's the one filtering, what pressing it
 * does, and whether it can be pressed (it counts nothing). One that can't is marked so rather than disabled, which would
 * take it out of hover and keyboard focus, and with it its tip (List loot's "0 of 0 free slots" says why in its tip).
 */
export type TilePress = { on: boolean; onPress: () => void; disabled?: boolean };
/** A tile's button attributes for its TilePress. */
export const pressProps = (p: TilePress) => ({
  'aria-pressed': p.on, 'aria-disabled': p.disabled || undefined, onClick: p.disabled ? undefined : p.onPress,
});

/**
 * Brings the table a tile has just filtered into view when none of it shows: on a phone, or where the tiles sit well
 * above it (the Sniper's), pressing one would otherwise change nothing that can be seen.
 */
export function revealTable(id: string) {
  window.setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top > window.innerHeight - 80 || r.bottom < 80) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, 60);
}

/**
 * One table's tile filter (lib/tileFilter.ts): which tile is on, and each tile's TilePress from its key and its count.
 * `tableId` is the element to bring into view when a tile turns on; `onOn` runs then too (the Sniper opens its table).
 */
export function useTileFilter<K extends string>(tableId: string, onOn?: () => void) {
  const [on, setOn] = useState<K | null>(null);
  const press = (k: K, count: number): TilePress => ({
    on: on === k,
    disabled: !canPress(on, k, count),
    onPress: () => {
      const next = pressTile(on, k, count);
      setOn(next);
      if (next != null) { onOn?.(); revealTable(tableId); }
    },
  });
  return { on, setOn, press };
}

export type TileData = { l: ReactNode; v: ReactNode; n?: ReactNode; c?: string; tip?: string; press?: TilePress };
export function Tiles({ items, min = 200, inset }: { items: TileData[]; min?: number; inset?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(min(100%,${min}px),1fr))`, gap: 10 }} data-rv="">
      {items.map((t, i) => (t.press ? (
        // A button can't hold the "i" button, so a tile that filters carries its tip itself, the "i" drawn as a mark.
        <button key={i} type="button" className={'tile press' + (inset ? ' inset' : '')} style={cssVars({ '--c': t.c })}
          {...pressProps(t.press)} data-tip={t.tip} data-tip-title={t.tip && typeof t.l === 'string' ? t.l : undefined}>
          <span className="tile-l">{t.l}{t.tip && <span className="tip-i" aria-hidden="true">i</span>}</span>
          <span className="tile-v">{t.v}</span>
          {t.n && <span className="tile-n">{t.n}</span>}
        </button>
      ) : (
        <div key={i} className={'tile' + (inset ? ' inset' : '')} style={cssVars({ '--c': t.c })}>
          <div className="tile-l">{t.l}{t.tip && <Tip text={t.tip} title={typeof t.l === 'string' ? t.l : undefined} />}</div>
          <div className="tile-v">{t.v}</div>
          {t.n && <div className="tile-n">{t.n}</div>}
        </div>
      )))}
    </div>
  );
}

/** The line over a table a tile filters: how many rows of how many, by which tile, and the way back to all of them. */
export function TileShowing({ shown, of, what, onClear }: { shown: number; of: number; what: string; onClear: () => void }) {
  return (
    <p className="tile-showing" role="status">
      <Funnel aria-hidden="true" />{showingSaid(shown, of, what)}<span aria-hidden="true"> · </span>
      <button type="button" className="link-btn" onClick={onClear}>Show all</button>
    </p>
  );
}

/** The "i" beside a term. A button, so the tooltip is reachable by keyboard and by tapping. */
export function Tip({ text, title, big, glyph = 'i' }: { text: string; title?: string; big?: boolean; glyph?: string }) {
  return (
    <button type="button" className={'tip-i' + (big ? ' lg' : '')} data-tip={text} data-tip-title={title} aria-label={title ? `About ${title}` : 'More about this'}>
      {glyph}
    </button>
  );
}

export function Seg<T extends string | number>(props: {
  value: T; options: { v: T; label: ReactNode; n?: ReactNode; tip?: string; tipTitle?: string }[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'md';
}) {
  return (
    <div className={'seg' + (props.size ? ' ' + props.size : '')} role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={props.value === o.v} onClick={() => props.onChange(o.v)} data-tip={o.tip} data-tip-title={o.tip ? o.tipTitle : undefined}>
          {o.label}{o.n != null && <span className="n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function Check(props: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; tip?: string; bare?: boolean; desc?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={props.checked} className={'check' + (props.bare ? ' bare' : '')}
      onClick={() => !props.disabled && props.onChange(!props.checked)} data-tip={props.tip} disabled={props.disabled}
      style={props.disabled ? { opacity: 0.5 } : undefined}
    >
      <span className="box"><CheckIcon aria-hidden="true" /></span>
      <span><span className="ct">{props.children}</span>{props.desc && <span className="cd">{props.desc}</span>}</span>
    </button>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)} />;
}

export function Flag({ children, why, title, color }: { children: ReactNode; why?: string; title?: string; color?: string }) {
  return <span className="flag" data-tip={why} data-tip-title={title} style={cssVars({ '--c': color })} tabIndex={why ? 0 : undefined}>{children}</span>;
}

export function Notice({ kind = 'info', children, icon }: { kind?: 'info' | 'warn' | 'err' | 'ok'; children: ReactNode; icon?: LucideIcon }) {
  const Icon = icon ?? (kind === 'err' ? CircleAlert : kind === 'warn' ? TriangleAlert : Info);
  return <div className={'notice ' + kind} role={kind === 'err' ? 'alert' : undefined}><Icon aria-hidden="true" /><div>{children}</div></div>;
}

export function Empty({ icon: Icon, children, action }: { icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon aria-hidden="true" />
      <p>{children}</p>
      {action}
    </div>
  );
}

/** The busy panel: a radar sweep, what is happening, and how far along it is. */
export function Busy({ title, done, total, left, sub }: { title: ReactNode; done?: number; total?: number; left?: string | null; sub?: ReactNode }) {
  const pct = total ? Math.min(100, ((done ?? 0) / total) * 100) : null;
  return (
    <div className="busy" role="status">
      <div className="radar keep-motion" aria-hidden="true">
        <div className="sweep-arm keep-motion" />
        <div className="blip" style={{ left: '30%', top: '36%', width: 4, height: 4, boxShadow: '0 0 8px var(--acc2)' }} />
        <div className="blip" style={{ left: '64%', top: '60%', width: 3, height: 3, animationDelay: '.5s' }} />
      </div>
      <div className="grow">
        <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <span className="busy-t">{title}</span>
          {total != null && total > 0 && (
            <span className="busy-n"><b>{(done ?? 0).toLocaleString('en-US')}</b> of {total.toLocaleString('en-US')}{left ? ` · About ${left} left.` : ''}</span>
          )}
        </div>
        <div className={'busy-bar' + (pct == null ? ' indet' : '')}><div style={{ width: `${pct ?? 30}%` }} /></div>
        {sub && <div className="busy-s">{sub}</div>}
      </div>
    </div>
  );
}

/** An item's icon from the image server, or nothing if it fails to load. */
/** An item's icon. A blueprint has none at `icon` (400): its picture is `bp` for an original, `bpc` for a copy. */
export function ItemIcon({ id, size = 'md', render, bp }: { id: number; size?: 'sm' | 'md' | 'lg'; render?: boolean; bp?: 'bp' | 'bpc' }) {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [id]);
  if (!id) return null;
  const url = `https://images.evetech.net/types/${id}/${bp ?? (render ? 'render' : 'icon')}?size=64`;
  return (
    <span className={'ticon' + (size === 'md' ? '' : ' ' + size)} aria-hidden="true" style={ok ? { backgroundImage: `url(${url})` } : undefined}>
      {/* A hidden probe so a missing icon leaves a plain square rather than a broken-image glyph. */}
      <img src={url} alt="" onError={() => setOk(false)} style={{ display: 'none' }} />
    </span>
  );
}

export type GuideStep = { icon: LucideIcon; title: string; body: ReactNode };
export type Habit = { icon: LucideIcon; title: string; body: ReactNode; color?: string };

/**
 * "How to use" at the foot of a page: numbered steps, then good habits. Steps can come in titled
 * groups ("Setting it up", "Reading the result"), numbered straight through.
 */
export function Guide({ title, intro, steps, groups, habits }: {
  title: string; intro: ReactNode; steps?: GuideStep[]; groups?: { title: string; steps: GuideStep[] }[]; habits?: Habit[];
}) {
  const step = (s: GuideStep, n: number) => (
    <div key={s.title} className="guide-step">
      <span className="guide-ic"><s.icon aria-hidden="true" /></span>
      <div>
        <div className="guide-t"><span className="n">{String(n).padStart(2, '0')}</span><span className="h">{s.title}</span></div>
        <div className="guide-b">{s.body}</div>
      </div>
    </div>
  );
  let n = 0;
  return (
    <section className="guide" aria-label={title} data-rv="">
      <div className="guide-head"><BookOpen aria-hidden="true" /><span>{title}</span></div>
      <p className="guide-intro">{intro}</p>
      {steps && <div className="guide-steps">{steps.map((s) => step(s, ++n))}</div>}
      {groups && (
        <div className="guide-groups">
          {groups.map((g) => (
            <div key={g.title}>
              <span className="lbl sp">{g.title}</span>
              <div className="col" style={{ gap: 14 }}>{g.steps.map((s) => step(s, ++n))}</div>
            </div>
          ))}
        </div>
      )}
      {habits && habits.length > 0 && (
        <>
          <span className="lbl sp">Good habits</span>
          <div className="guide-habits">
            {habits.map((h) => (
              <div key={h.title} className="habit" style={cssVars({ '--c': h.color })}>
                <h.icon aria-hidden="true" />
                <div><div className="h">{h.title}</div><div className="b">{h.body}</div></div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** A chip-style labelled input, as in the calculator's order bar and the filter bars. */
export function Chip(props: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; tip?: string; width?: number;
  placeholder?: string; unit?: string; mode?: 'decimal' | 'numeric' | 'text'; h34?: boolean; id?: string;
}) {
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <label htmlFor={id} className={'chip' + (props.h34 ? ' h34' : '')} data-tip={props.tip} data-tip-title={props.tip ? props.label : undefined}>
      <span className="cl">{props.label}</span>
      <input
        id={id} type="text" inputMode={props.mode ?? 'decimal'} value={props.value} placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)} onBlur={props.onBlur} style={{ width: props.width ?? 108 }} autoComplete="off"
      />
      {props.unit && <span className="cu">{props.unit}</span>}
    </label>
  );
}

type SortHead<K extends string> = { k: K; label: string; tip?: string; title?: string };
type SortState<K extends string> = { key: K; dir: 'asc' | 'desc' };

/** One header's sort button and its "i", for SortTh and SortThPair. */
function SortHeadLine<K extends string>({ h, sort, onSort, lit }: { h: SortHead<K>; sort: SortState<K>; onSort: (k: K) => void; lit?: boolean }) {
  const on = sort.key === h.k;
  return (
    <span className={'th' + (lit && on ? ' on' : '')}>
      <button type="button" className="sort" onClick={() => onSort(h.k)}>
        {h.label}<span className="arrow" aria-hidden="true">{on ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
      {h.tip && <Tip text={h.tip} title={h.title ?? h.label} />}
    </span>
  );
}

/** A sortable table header cell. */
export function SortTh<K extends string>(props: {
  k: K; label: string; sort: SortState<K>; onSort: (k: K) => void; left?: boolean; tip?: string; title?: string;
}) {
  const on = props.sort.key === props.k;
  return (
    <th scope="col" className={props.left ? 'l' : undefined} aria-sort={on ? (props.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <SortHeadLine h={props} sort={props.sort} onSort={props.onSort} />
    </th>
  );
}

/**
 * Two sortable headers stacked in one cell, for a column that shows two figures one under the other (Orders' Item over
 * Side, Move to over Costs you): each line keeps its own sort and its own "i", and only the one sorting is lit.
 */
export function SortThPair<K extends string>({ top, bottom, sort, onSort, left }: {
  top: SortHead<K>; bottom: SortHead<K>; sort: SortState<K>; onSort: (k: K) => void; left?: boolean;
}) {
  const on = sort.key === top.k || sort.key === bottom.k;
  return (
    <th scope="col" className={'pair' + (left ? ' l' : '')} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <SortHeadLine h={top} sort={sort} onSort={onSort} lit />
      <SortHeadLine h={bottom} sort={sort} onSort={onSort} lit />
    </th>
  );
}

/** A plain header cell with an optional "i". */
export function Th({ children, tip, left, title }: { children: ReactNode; tip?: string; left?: boolean; title?: string }) {
  return (
    <th scope="col" className={left ? 'l' : undefined}>
      <span className="th">{children}{tip && <Tip text={tip} title={title ?? (typeof children === 'string' ? children : undefined)} />}</span>
    </th>
  );
}

export function Expander({ open, onToggle, children, label }: { open: boolean; onToggle: () => void; children: ReactNode; label?: string }) {
  return (
    <button type="button" className="expander" aria-expanded={open} onClick={onToggle} aria-label={label}>
      <ChevronRight className="chev" aria-hidden="true" />
      {children}
    </button>
  );
}

/** A small line chart of any series, scaled to its own range. */
export function Sparkline({ values, label, color = 'var(--acc)', baseline }: { values: number[]; label: string; color?: string; baseline?: number }) {
  if (values.length < 2) return <span className="faint">–</span>;
  const lo = Math.min(...values, baseline ?? Infinity), hi = Math.max(...values, baseline ?? -Infinity);
  const span = hi - lo || 1;
  const y = (v: number) => (26 - ((v - lo) / span) * 22).toFixed(1);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * 100).toFixed(1)} ${y(v)}`).join('');
  return (
    <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={label}>
      {baseline != null && <path d={`M0 ${y(baseline)}H100`} stroke="var(--acc2)" strokeDasharray="3 3" fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A labelled horizontal bar, as in the money in and out lists. */
export function BarLine({ label, value, frac, color, kind, kindColor }: { label: ReactNode; value: ReactNode; frac: number; color: string; kind?: string; kindColor?: string }) {
  return (
    <div>
      <div className="kv">
        <span style={{ color: 'var(--body)' }}>
          {label}
          {kind && <span className="lbl" style={{ marginLeft: 6, fontSize: 10, letterSpacing: '.08em', color: kindColor }}>{kind}</span>}
        </span>
        <span className="v" style={{ color }}>{value}</span>
      </div>
      <div className="track" style={{ marginTop: 4 }}><span className="fill" style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color }} /></div>
    </div>
  );
}

/** Progress ring, for "what's left". */
export function Ring({ frac, children, color = 'var(--acc)', r = 34 }: { frac: number; children?: ReactNode; color?: string; r?: number }) {
  const c = 2 * Math.PI * r;
  const size = (r + 8) * 2;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(2,7,12,.9)" strokeWidth={6} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${(Math.max(0, Math.min(1, frac)) * c).toFixed(1)} ${c.toFixed(1)}`}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="rv">{children}</div>
    </div>
  );
}

/**
 * A chip whose value is a number kept elsewhere. What you type is left alone while you type it and
 * tidied when you leave the box, so a half-typed figure is never reformatted under your cursor.
 */
export function NumChip(props: {
  label: string; value: number | null; onChange: (n: number | null) => void; tip?: string; tipTitle?: string; width?: number;
  placeholder?: string; decimals?: number; id?: string; percent?: boolean;
  /** Keep the label for screen readers only, for a chip sitting under a column that already says it. */
  hideLabel?: boolean;
}) {
  const fmt = (n: number | null) => (n == null || !Number.isFinite(n) ? '' : n.toLocaleString('en-US', { maximumFractionDigits: props.decimals ?? 2 }));
  const [text, setText] = useState(() => fmt(props.value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(fmt(props.value)); }, [props.value, focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const auto = useId();
  const id = props.id ?? auto;
  return (
    <label htmlFor={id} className="chip h34" data-tip={props.tip} data-tip-title={props.tipTitle ?? (props.tip ? props.label : undefined)}>
      <span className={props.hideLabel ? 'sr-only' : 'cl'}>{props.label}</span>
      <input
        id={id} type="text" inputMode="decimal" value={text} placeholder={props.placeholder} autoComplete="off" style={{ width: props.width ?? 100 }}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); setText(fmt(props.value)); }}
        onChange={(e) => { setText(e.target.value); props.onChange(parseLoose(e.target.value)); }}
      />
      {props.percent && <span className="cu">%</span>}
    </label>
  );
}

/** 1.2m, 350k, 2b, "1,234.5" — or null when the box is empty or not a number. */
export function parseLoose(v: string): number | null {
  const s = v.trim().toLowerCase().replace(/,/g, '').replace(/isk/g, '').trim();
  if (!s) return null;
  const m = /^(-?[0-9]*\.?[0-9]+)\s*([kmb])?$/.exec(s);
  if (!m) return null;
  return parseFloat(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : m[2] === 'b' ? 1e9 : 1);
}
