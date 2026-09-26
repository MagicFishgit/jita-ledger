import { useSyncExternalStore } from 'react';

/**
 * Short messages in the corner, for things that just happened: a watchlist add, a backup saved, an
 * alert.
 *
 * They queue rather than pile up. Only the one in front is on screen and only its clock runs; the rest
 * wait behind it, and the next surfaces when it goes, so a burst of alerts is read one at a time
 * instead of as a wall. How long each stays is yours to set (Settings → Alerts), including until you
 * close it, and hovering holds the clock. Nothing important should live only in a toast either way.
 */
export type ToastKind = 'ok' | 'info' | 'warn' | 'err';
/** A toast can also appear as a system notification, for when this tab isn't the one in front. */
export type ToastSystem = { title: string; tag?: string };
export type Toast = { id: string; text: string; kind: ToastKind; system?: ToastSystem };
export type ToastState = { list: Toast[]; lifeMs: number | null; paused: boolean };

/** How long a toast stays when nothing else is set. */
export const DEFAULT_TOAST_SECONDS = 10;
/** A queue longer than this drops the oldest waiting (never the one being read). */
const MAX_QUEUED = 30;

let state: ToastState = { list: [], lifeMs: DEFAULT_TOAST_SECONDS * 1000, paused: false };
const listeners = new Set<() => void>();
const set = (p: Partial<ToastState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };

let timer: ReturnType<typeof setTimeout> | null = null;
let frontId: string | null = null;
let remaining = 0;
let startedAt = 0;
let shown: { id: string; n: Notification } | null = null;

/**
 * The system notification follows the queue too: it's shown when its toast comes to the front, and
 * closed when that toast goes. So a burst arrives one at a time there as well, each for as long as you
 * set, and "until closed" asks the system to keep it until you dismiss it. Only while this tab is in
 * the background: when you're looking at the page, the toast is enough.
 */
function showSystem(t: Toast) {
  closeSystem();
  if (!t.system || typeof Notification === 'undefined' || typeof document === 'undefined') return;
  if (Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const n = new Notification(t.system.title, { body: t.text, tag: t.system.tag, requireInteraction: state.lifeMs == null });
    n.onclick = () => { window.focus(); dismiss(t.id); };
    shown = { id: t.id, n };
  } catch { /* some browsers refuse outside a service worker */ }
}
function closeSystem() {
  try { shown?.n.close(); } catch { /* already gone */ }
  shown = null;
}

function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Start (or restart) the clock on whichever toast is in front. */
function arm() {
  stop();
  const front = state.list[0];
  if (!front) { frontId = null; closeSystem(); return; }
  if (front.id !== frontId) { frontId = front.id; remaining = state.lifeMs ?? Infinity; showSystem(front); }
  if (state.paused || state.lifeMs == null) return;
  startedAt = Date.now();
  const id = front.id;
  timer = setTimeout(() => dismiss(id), remaining);
}

export function toast(text: string, kind: ToastKind = 'ok', opts: { system?: ToastSystem } = {}): void {
  const id = Math.random().toString(36).slice(2);
  let list = [...state.list, { id, text, kind, system: opts.system }];
  if (list.length > MAX_QUEUED) list = [list[0], ...list.slice(list.length - MAX_QUEUED + 1)];
  set({ list });
  if (list.length === 1) arm();
}

export function dismiss(id: string): void {
  if (!state.list.some((t) => t.id === id)) return;
  const wasFront = state.list[0].id === id;
  const list = state.list.filter((t) => t.id !== id);
  // Closing the last one while hovering it removes the stack from under the pointer, so the "pointer
  // left" that would resume the clock never fires. An empty queue can't be paused.
  set(list.length ? { list } : { list, paused: false });
  if (wasFront) arm();
}

export function dismissAll(): void {
  stop();
  frontId = null;
  closeSystem();
  set({ list: [], paused: false });
}

/** Hold the front toast's clock while the pointer is over it, so it can't vanish mid-read. */
export function pauseToasts(): void {
  if (state.paused) return;
  if (timer) { remaining = Math.max(0, remaining - (Date.now() - startedAt)); stop(); }
  set({ paused: true });
}

export function resumeToasts(): void {
  if (!state.paused) return;
  set({ paused: false });
  arm();
}

/** Null keeps each toast until it is closed. A change restarts the clock on the one in front. */
export function setToastLife(seconds: number | null): void {
  const lifeMs = seconds == null ? null : seconds * 1000;
  if (lifeMs === state.lifeMs) return;
  set({ lifeMs });
  frontId = null;
  arm();
}

export function useToasts(): ToastState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

/** The queue as it stands, for the checks. */
export const __peek = (): ToastState => state;
