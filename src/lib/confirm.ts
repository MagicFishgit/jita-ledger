import { useSyncExternalStore } from 'react';

/**
 * A replacement for the browser's confirm().
 *
 * The native one is unstyled, blocks the whole tab, and looks nothing like the rest of the app.
 * This keeps the same shape at the call site --- await it, act on the answer --- while the dialog
 * itself is drawn by the app. It is built on <dialog>, so the focus trap, Escape to dismiss and
 * the backdrop come from the platform rather than from a library.
 */
export type Ask = {
  title: string;
  body?: string;
  /** Label for the button that goes ahead. */
  confirm?: string;
  /** Marks the action as destructive, so it reads as one. */
  danger?: boolean;
  /**
   * A third choice beside Cancel and the main button: a safer way to the same end ("Close instead" of
   * deleting a position). Only `chooseAsk` can tell it apart; `confirmAsk` reads it as declining.
   */
  alt?: string;
};

export type Answer = 'yes' | 'alt' | 'no';

type State = { ask: Ask | null };
let state: State = { ask: null };
let pending: ((a: Answer) => void) | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useConfirmState(): State {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

/** Put the question up and wait for which button was pressed. Dismissing it is 'no'. */
export function chooseAsk(ask: Ask): Promise<Answer> {
  // A second question while one is open would strand the first caller waiting forever.
  pending?.('no');
  state = { ask };
  emit();
  return new Promise<Answer>((resolve) => { pending = resolve; });
}

/** Put the question up and wait for an answer. Resolves false if it is dismissed. */
export function confirmAsk(ask: Ask): Promise<boolean> {
  return chooseAsk(ask).then((a) => a === 'yes');
}

/** Called by the dialog itself. */
export function answer(a: Answer | boolean): void {
  const resolve = pending;
  pending = null;
  state = { ask: null };
  emit();
  resolve?.(typeof a === 'boolean' ? (a ? 'yes' : 'no') : a);
}
