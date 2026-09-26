import { useEffect, useState } from 'react';
import { effectiveMotion } from './prefs';
import { useData } from './store';
import type { Motion } from './types';

/**
 * How much the interface moves. Your choice in Settings wins; left unset it follows the system's
 * reduced-motion preference, which asks for Calm rather than stillness.
 */
export function useMotion(): Motion {
  const chosen = useData().prefs.motion;
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return effectiveMotion(chosen, reduced);
}

/**
 * The starfield's speed boost. Page changes and big moments bump it and it decays back on its own,
 * which is what reads as a warp jump.
 */
let warp = 1.4;
export const bumpWarp = (n: number) => { warp = Math.max(warp, n); };
export const takeWarp = () => { const w = warp; warp *= 0.935; return w; };
