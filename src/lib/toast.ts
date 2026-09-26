import { useSyncExternalStore } from 'react';

/**
 * Short messages in the corner, for things that just happened: a watchlist add, a backup saved, an
 * alert. They go on their own after a few seconds, so nothing important should live only in a toast.
 */
export type ToastKind = 'ok' | 'info' | 'warn' | 'err';
export type Toast = { id: string; text: string; kind: ToastKind };

const LIFE_MS = 3500;
let list: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, kind: ToastKind = 'ok'): void {
  const id = Math.random().toString(36).slice(2);
  list = [...list.slice(-3), { id, text, kind }];
  emit();
  setTimeout(() => dismiss(id), LIFE_MS);
}

export function dismiss(id: string): void {
  if (!list.some((t) => t.id === id)) return;
  list = list.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => list);
}

export const TOAST_MS = LIFE_MS;
