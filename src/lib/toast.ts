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
export type Toast = { id: string; text: string; kind: ToastKind };
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

function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Start (or restart) the clock on whichever toast is in front. */
function arm() {
  stop();
  const front = state.list[0];
  if (!front) { frontId = null; return; }
  if (front.id !== frontId) { frontId = front.id; remaining = state.lifeMs ?? Infinity; }
  if (state.paused || state.lifeMs == null) return;
  startedAt = Date.now();
  const id = front.id;
  timer = setTimeout(() => dismiss(id), remaining);
}

export function toast(text: string, kind: ToastKind = 'ok'): void {
  const id = Math.random().toString(36).slice(2);
  let list = [...state.list, { id, text, kind }];
  if (list.length > MAX_QUEUED) list = [list[0], ...list.slice(list.length - MAX_QUEUED + 1)];
  set({ list });
  if (list.length === 1) arm();
}

export function dismiss(id: string): void {
  if (!state.list.some((t) => t.id === id)) return;
  const wasFront = state.list[0].id === id;
  set({ list: state.list.filter((t) => t.id !== id) });
  if (wasFront) arm();
}

export function dismissAll(): void {
  stop();
  frontId = null;
  set({ list: [] });
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
