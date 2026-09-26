import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { iskBig, pct, units } from '../lib/format';
import type { HistRow } from '../lib/types';
import { cssVars } from './ui';

const DAY = 86400_000;
const dayT = (date: string) => Date.parse(date + 'T00:00:00Z');
export const fmtDay = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '.');

export type Overlay = { price: number; label: string; color: string };

/**
 * An item's trading over a window: each day's high-to-low band, the average line, volume bars under
 * it, dashed lines for your own prices, and a crosshair that reads out any day. Drawn as SVG paths
 * so it takes the theme's colours and stays sharp at any size.
 *
 * Days are placed by date, not by row, so a gap in the history --- a day nothing traded --- shows as
 * a gap rather than being closed up.
 */
export function HistoryChart({ rows, days, overlays = [], now, height = 220 }: { rows: HistRow[]; days: number; overlays?: Overlay[]; now: number; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const end = Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z');
  const start = end - (days - 1) * DAY;
  const win = useMemo(() => rows.filter((r) => dayT(r.date) >= start && dayT(r.date) <= end), [rows, start, end]);

  const geo = useMemo(() => {
    if (!win.length) return null;
    const W = 600, H = 200;
    const mid = win.reduce((t, r) => t + r.average, 0) / win.length;
    // Your own prices only stretch the scale when they are near the market; a typo should not flatten it.
    const shown = overlays.filter((o) => Number.isFinite(o.price) && o.price > 0 && Math.abs(o.price - mid) / mid < 0.3);
    const ps = win.flatMap((r) => [r.lowest, r.highest, r.average]).concat(shown.map((o) => o.price));
    const mn = Math.min(...ps), mx = Math.max(...ps);
    const vm = Math.max(...win.map((r) => r.volume), 1);
    const X = (t: number) => ((t - start) / Math.max(DAY, end - start)) * W;
    const Y = (p: number) => H * 0.06 + (1 - (p - mn) / (mx - mn || 1)) * H * 0.6;
    const line = win.map((r, i) => `${i ? 'L' : 'M'}${X(dayT(r.date)).toFixed(1)} ${Y(r.average).toFixed(1)}`).join('');
    const band = win.map((r, i) => `${i ? 'L' : 'M'}${X(dayT(r.date)).toFixed(1)} ${Y(r.highest).toFixed(1)}`).join('')
      + [...win].reverse().map((r) => `L${X(dayT(r.date)).toFixed(1)} ${Y(r.lowest).toFixed(1)}`).join('') + 'Z';
    const first = X(dayT(win[0].date)), last = X(dayT(win[win.length - 1].date));
    const area = line + `L${last.toFixed(1)} ${H}L${first.toFixed(1)} ${H}Z`;
    const bw = (W / Math.max(days, 2)) * 0.6;
    const vol = win.map((r) => {
      const h = (r.volume / vm) * H * 0.26;
      return `M${(X(dayT(r.date)) - bw / 2).toFixed(1)} ${H}v${(-h).toFixed(1)}h${bw.toFixed(1)}v${h.toFixed(1)}Z`;
    }).join('');
    return { W, H, X, Y, line, band, area, vol, mn, mx, shown, yPct: (p: number) => `${((Y(p) / H) * 100).toFixed(2)}%` };
  }, [win, overlays, start, end, days]);

  if (!geo) {
    return <div className="chart-box" style={{ height, display: 'grid', placeItems: 'center' }}><span className="faint" style={{ fontSize: 12.5 }}>No trades in this window.</span></div>;
  }

  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = start + ((e.clientX - r.left) / r.width) * (end - start);
    let best = 0;
    for (let i = 1; i < win.length; i++) if (Math.abs(dayT(win[i].date) - t) < Math.abs(dayT(win[best].date) - t)) best = i;
    if (best !== hover) setHover(best);
  };
  const h = hover != null ? win[hover] : null;
  const avg = win.reduce((t, r) => t + r.average, 0) / win.length;
  const hx = h ? (geo.X(dayT(h.date)) / geo.W) * 100 : 0;
  const vs = h ? h.average / avg - 1 : 0;

  return (
    <div className="chart-box cross" style={{ height, minHeight: height }} onMouseMove={move} onMouseLeave={() => setHover(null)}>
      <svg className="plot" viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 50H600M0 100H600M0 150H600" stroke="rgba(130,185,225,.07)" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
        <path d={geo.vol} fill="color-mix(in oklab,var(--acc2) 38%,transparent)" />
        <path d={geo.area} fill="color-mix(in oklab,var(--acc) 6%,transparent)" />
        <path d={geo.band} fill="color-mix(in oklab,var(--acc) 16%,transparent)" stroke="color-mix(in oklab,var(--acc) 35%,transparent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={geo.line} fill="none" stroke="var(--acc)" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ filter: 'drop-shadow(0 0 4px var(--acc))' }} />
      </svg>
      {geo.shown.map((o) => (
        <div key={o.label} className="overlay-line" style={cssVars({ top: geo.yPct(o.price), '--c': o.color })}>
          <span>{o.label} {iskBig(o.price).replace(' ISK', '')}</span>
        </div>
      ))}
      {h && (
        <>
          <div className="hover-x" style={{ left: `${hx}%` }} />
          <div className="hover-dot" style={{ left: `${hx}%`, top: geo.yPct(h.average) }} />
          <div className="hover-card" style={{ left: hx < 65 ? `calc(${hx}% + 14px)` : `calc(${hx}% - 174px)` }}>
            <div style={{ color: 'var(--label)' }}>{fmtDay(dayT(h.date))}</div>
            <div style={{ color: 'var(--acc)' }}>avg {iskBig(h.average)}</div>
            <div style={{ color: 'var(--dim)' }}>{iskBig(h.lowest).replace(' ISK', '')} – {iskBig(h.highest)}</div>
            <div style={{ color: 'var(--acc2)' }}>{units(h.volume)} units</div>
            <div style={{ color: vs >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{vs >= 0 ? '+' : ''}{pct(vs, 1)} vs {days}d avg</div>
          </div>
        </>
      )}
      <span className="ax" style={{ left: 8, top: 6 }}>{iskBig(geo.mx)}</span>
      <span className="ax" style={{ left: 8, top: '58%' }}>{iskBig(geo.mn)}</span>
      <span className="ax f" style={{ left: 8, bottom: 4 }}>{fmtDay(start)}</span>
      <span className="ax f" style={{ right: 8, bottom: 4 }}>today</span>
    </div>
  );
}

/**
 * A time series drawn as a line with a soft area under it, and optional dots marking events.
 * Used for the wallet balance.
 */
export function AreaLine(props: {
  points: { t: number; v: number }[];
  from: number; to: number; height?: number; color?: string;
  events?: { t: number; v: number; color: string; tip: string; title: string }[];
  labels?: { max: string; min: string; start: string; end?: string };
  step?: boolean;
  children?: ReactNode;
}) {
  const { points, from, to } = props;
  const H = 200, W = 600;
  if (points.length < 1) return null;
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  // More room underneath than above: the lowest value's label sits in the bottom-left corner.
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.02 || 1;
  const mn = lo - pad * 3, mx = hi + pad;
  const X = (t: number) => ((t - from) / Math.max(1, to - from)) * W;
  const Y = (v: number) => 190 - ((v - mn) / (mx - mn)) * 175;
  let d = '';
  points.forEach((p, i) => {
    const x = X(p.t).toFixed(1), y = Y(p.v).toFixed(1);
    if (!i) d += `M${x} ${y}`;
    else if (props.step) d += `H${x}V${y}`;
    else d += `L${x} ${y}`;
  });
  // Carry the last value to the right edge: the balance has not changed since the last entry.
  d += `H${X(to).toFixed(1)}`;
  const area = d + `L${X(to).toFixed(1)} ${H}L${X(points[0].t).toFixed(1)} ${H}Z`;
  const color = props.color ?? 'var(--acc)';
  return (
    <div className="chart-box" style={{ height: props.height ?? 230 }}>
      <svg className="plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 50H600M0 100H600M0 150H600" stroke="rgba(130,185,225,.07)" vectorEffect="non-scaling-stroke" fill="none" />
        <path d={area} fill={`color-mix(in oklab,${color} 12%,transparent)`} />
        <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      </svg>
      {props.events?.map((e, i) => (
        <button
          key={i} type="button" className="evdot" data-tip={e.tip} data-tip-title={e.title} aria-label={`${e.title}: ${e.tip}`}
          style={cssVars({ left: `${(X(e.t) / W) * 100}%`, top: `${(Y(e.v) / H) * 100}%`, '--c': e.color })}
        />
      ))}
      {props.labels && (
        <>
          <span className="ax" style={{ left: 8, top: 6 }}>{props.labels.max}</span>
          <span className="ax" style={{ left: 8, bottom: 20 }}>{props.labels.min}</span>
          <span className="ax f" style={{ left: 8, bottom: 4 }}>{props.labels.start}</span>
          <span className="ax f" style={{ right: 8, bottom: 4 }}>{props.labels.end ?? 'now'}</span>
        </>
      )}
      {props.children}
    </div>
  );
}

/** Just a line, for small trend panels. */
export function MiniLine({ values, color = 'var(--pos)', height = 70 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const Y = (v: number) => 64 - ((v - lo) / (hi - lo || 1)) * 58;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * 600).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  return (
    <svg viewBox="0 0 600 70" preserveAspectRatio="none" style={{ width: '100%', height }} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
}
