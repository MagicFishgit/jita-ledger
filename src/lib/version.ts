/**
 * Notices when a newer version of the app is live. A tab left open keeps running the version it loaded, for days if
 * nobody reloads it, and phones can't pull to reload this app's fixed layout; the site's own caching also holds the
 * page for up to 10 minutes. After the owner-only lock went out, the user's phone kept showing the old, open app.
 *
 * Every five minutes, and whenever the tab comes back into view, this reads the site's version.json (bypassing every
 * cache) and compares it with the build it's running. A hidden tab reloads at once; one in view says so and reloads
 * when you ask, or by itself when you next leave it, so nothing you're doing is interrupted.
 */
import { useSyncExternalStore } from 'react';
import { reloadApp } from './reload';

export const BUILD = __BUILD__;
const EVERY_MS = 5 * 60_000;

let newer: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** The build that's out, when it isn't this one; null otherwise. */
export const useNewerVersion = () => useSyncExternalStore(subscribe, () => newer);

/** Whether a version file names a build other than this one. Pure, for the check. */
export const isNewer = (file: unknown, running: string): string | null => {
  const b = (file as { build?: unknown } | null)?.build;
  return typeof b === 'string' && b && b !== running ? b : null;
};

async function check() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const b = isNewer(await r.json(), BUILD);
    if (!b) return;
    if (document.hidden) { void reloadApp(); return; }
    if (newer !== b) { newer = b; listeners.forEach((l) => l()); }
  } catch { /* offline, or the site mid-deploy: next time */ }
}

export function startVersionCheck(): () => void {
  // The dev server has no version file, and reloads itself anyway.
  if (import.meta.env.DEV) return () => {};
  const id = setInterval(check, EVERY_MS);
  const onVisible = () => {
    if (document.hidden) { if (newer) void reloadApp(); } else void check();
  };
  document.addEventListener('visibilitychange', onVisible);
  void check();
  return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
}
