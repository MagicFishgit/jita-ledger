import { useEffect, useState, useSyncExternalStore } from 'react';
import { getAuth, getMailer, onAuthChange } from './auth';

export function useAuth() {
  return useSyncExternalStore(onAuthChange, getAuth);
}

/** The character that sends alert mail, when one is logged in. */
export function useMailer() {
  return useSyncExternalStore(onAuthChange, getMailer);
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

/** The home page. The Inbox it replaced has no page of its own any more, so its links land here. */
export const HOME = 'wallet';
/** Old addresses, still in bookmarks and alert mails. Tonight's run became To do: people don't only play at night. */
const RENAMED: Record<string, string> = { inbox: HOME, tonight: 'todo' };

export function parseHash(hash = window.location.hash): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [p, q] = raw.split('?');
  const path = (p || HOME).split('/').filter(Boolean);
  if (path.length && RENAMED[path[0]]) path.splice(0, path.length, RENAMED[path[0]]);
  return { path: path.length ? path : [HOME], query: new URLSearchParams(q || '') };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/**
 * The page-leave animation, registered by the frame that owns the content area. Navigation plays it
 * before the hash changes so the old page warps out rather than blinking away.
 */
let leave: ((done: () => void) => void) | null = null;
export function onLeave(fn: ((done: () => void) => void) | null) { leave = fn; }

export function navigate(to: string) {
  const hash = to.startsWith('#') ? to : '#/' + to.replace(/^\//, '');
  if (hash === window.location.hash) return;
  const go = () => { window.location.hash = hash; };
  // Same page, different detail (a query or a sub-path): no need to animate the whole page out.
  const samePage = parseHash(hash).path[0] === parseHash().path[0];
  if (leave && !samePage) leave(go); else go();
}
