import { useEffect, useState, useSyncExternalStore } from 'react';
import { getAuth, onAuthChange } from './auth';

export function useAuth() {
  return useSyncExternalStore(onAuthChange, getAuth);
}

/**
 * A clock that re-renders. Relative times are worked out during render, and nothing else in the
 * app renders on a timer, so without this a countdown sits frozen on whatever it said when the
 * page last changed --- which reads exactly like the page having stopped noticing anything.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export type Route = { path: string[]; query: URLSearchParams };
function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [p, q] = raw.split('?');
  const path = (p || 'calculator').split('/').filter(Boolean);
  return { path: path.length ? path : ['calculator'], query: new URLSearchParams(q || '') };
}
export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export function navigate(to: string) {
  window.location.hash = to.startsWith('#') ? to : '#/' + to.replace(/^\//, '');
}

const VARS = ['--ink', '--muted', '--rule', '--accent', '--profit', '--loss', '--warn', '--buy', '--sell', '--line', '--surface', '--surface-2', '--seg-spread'] as const;
export type ThemeColors = Record<(typeof VARS)[number], string>;
function readColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as ThemeColors;
  VARS.forEach((v) => (out[v] = cs.getPropertyValue(v).trim() || '#888'));
  return out;
}
/** Chart libraries need real colour values, so read the CSS tokens and follow light/dark changes. */
export function useThemeColors(): ThemeColors {
  const [c, setC] = useState(readColors);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setC(readColors());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return c;
}
