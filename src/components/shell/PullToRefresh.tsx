import { useEffect, useState, type RefObject } from 'react';
import { RotateCw } from 'lucide-react';
import { reloadApp } from '../../lib/reload';

/** How far to pull before letting go reloads, and the most the indicator travels. */
const THRESHOLD = 70;
const MAX = 110;

/**
 * Pull down to reload, on touch screens. The app is a fixed shell whose pages scroll inside `.content`, so the
 * document itself never scrolls, and phone browsers only offer their own pull-to-refresh on a document that does:
 * the user couldn't reload the app on their phone in any browser. This gives the gesture back, from the top of
 * whatever `target` scrolls.
 *
 * It starts only with one finger, from the very top, dragging down more than sideways, and never from inside
 * something scrolled down of its own (a long table), so it doesn't take over a scroll or a wide table's swipe.
 */
export function PullToRefresh({ target }: { target: RefObject<HTMLElement | null> }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!el || !window.matchMedia?.('(pointer: coarse)').matches) return;
    let active = false, pulling = false, y0 = 0, x0 = 0, dist = 0;
    const scrolledWithin = (node: EventTarget | null) => {
      for (let n = node as HTMLElement | null; n && n !== el; n = n.parentElement) if (n.scrollTop > 0) return true;
      return false;
    };
    const start = (e: TouchEvent) => {
      active = e.touches.length === 1 && el.scrollTop <= 0 && !scrolledWithin(e.target);
      pulling = false; dist = 0;
      if (active) { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; }
    };
    const move = (e: TouchEvent) => {
      if (!active) return;
      const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
      if (!pulling) {
        if (dy < 0 || Math.abs(dx) > dy) { active = false; return; }
        if (dy < 8) return;
        pulling = true;
      }
      e.preventDefault();
      dist = Math.min(MAX, Math.max(0, dy * 0.55));
      setPull(dist);
    };
    const end = () => {
      if (!active) return;
      active = false;
      if (pulling && dist >= THRESHOLD) { setBusy(true); setPull(THRESHOLD); void reloadApp(); }
      else setPull(0);
      pulling = false;
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [target]);
  if (!pull && !busy) return null;
  const ready = busy || pull >= THRESHOLD;
  return (
    <div className={'ptr' + (ready ? ' ready' : '')} role="status" style={{ transform: `translate(-50%, ${Math.round(pull - 40)}px)` }}>
      <RotateCw aria-hidden="true" className={busy ? 'spinning' : undefined} style={busy ? undefined : { transform: `rotate(${Math.round(pull * 3)}deg)` }} />
      {busy ? 'Reloading…' : ready ? 'Release to reload' : 'Pull to reload'}
    </div>
  );
}
