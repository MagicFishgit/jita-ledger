import { useEffect, useReducer, useRef, useState } from 'react';

/**
 * The one tooltip. Anything with `data-tip` gets it on hover or keyboard focus, titled by
 * `data-tip-title`, with optional timer rows from `data-tip-rows` (JSON: label, value, fraction, every).
 *
 * It is positioned out of the flow, so showing it never pushes a row down, and it flips below its
 * target when there is no room above. It re-reads its target every second, so a countdown inside a
 * tooltip keeps counting while you look at it. On touch, tapping an "i" pins it until the next tap.
 */
type Shown = { el: Element; x: number; y: number; below: boolean };
type Row = [string, string, string | number, string];

const WIDTH = 300;

function place(el: Element): Shown {
  const r = el.getBoundingClientRect();
  const w = Math.min(WIDTH, window.innerWidth - 24);
  const x = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
  const below = r.top < 220;
  return { el, x, y: below ? r.bottom + 10 : r.top - 10, below };
}

export function TipLayer({ routeKey }: { routeKey: string }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const pinned = useRef(false);
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let current: Element | null = null;
    const show = (el: Element) => { current = el; setShown(place(el)); };
    const hide = () => { if (!current) return; current = null; pinned.current = false; setShown(null); };
    const onOver = (e: Event) => {
      if (pinned.current) return;
      const t = (e.target as Element | null)?.closest?.('[data-tip]');
      if (!t) { hide(); return; }
      if (t !== current) show(t);
    };
    const onFocus = (e: Event) => {
      const t = (e.target as Element | null)?.closest?.('[data-tip]');
      if (t) show(t); else hide();
    };
    const onBlur = () => { if (!pinned.current) hide(); };
    const onTap = (e: Event) => {
      const t = (e.target as Element | null)?.closest?.('.tip-i[data-tip]');
      if (!t) { if (pinned.current) hide(); return; }
      if (pinned.current && t === current) { hide(); return; }
      pinned.current = true;
      show(t);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    const onScroll = () => hide();
    document.addEventListener('mouseover', onOver);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    document.addEventListener('click', onTap);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      document.removeEventListener('click', onTap);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // A page change takes the tooltip's target away with it.
  useEffect(() => { pinned.current = false; setShown(null); }, [routeKey]);

  // Re-read the target each second so a live value in it keeps moving, and drop it if it has gone.
  useEffect(() => {
    if (!shown) return;
    const id = setInterval(() => {
      if (!document.contains(shown.el)) { pinned.current = false; setShown(null); } else tick();
    }, 1000);
    return () => clearInterval(id);
  }, [shown]);

  if (!shown) return null;
  const text = shown.el.getAttribute('data-tip') ?? '';
  if (!text) return null;
  const title = shown.el.getAttribute('data-tip-title') ?? '';
  let rows: Row[] = [];
  try { rows = JSON.parse(shown.el.getAttribute('data-tip-rows') || '[]'); } catch { rows = []; }

  return (
    <div
      className="tooltip" role="tooltip"
      style={{ left: shown.x, top: shown.y, ['--tt' as string]: shown.below ? 'none' : 'translateY(-100%)' }}
    >
      {title && <div className="tt">{title}</div>}
      <div className="tx">{text}</div>
      {rows.length > 0 && (
        <div className="trs">
          {rows.map(([l, v, f, every]) => (
            <div key={l}>
              <div className="trr"><span>{l}</span><span className="v">{v}</span></div>
              <div className="trb">
                <span className="track h3" style={{ flex: 1 }}><span className="fill" style={{ width: `${Math.max(0, Math.min(1, Number(f))) * 100}%`, transition: 'none' }} /></span>
                <span className="ev">every {every}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
