import { useSyncExternalStore } from 'react';
import { marketHistory, resolveNames } from './market';
import { getData, update } from './store';
import { groupName, typeInfo } from './universe';
import { activityOf, matchInsurance, priceOnDay, valueKillmail, type CombatActivity } from './combat';
import type { HistRow, Killmail } from './types';

/**
 * Pricing killmails, once each.
 *
 * A killmail is priced from market history on the day it happened and the result is stored with it.
 * It is never priced again: a loss in March cost March's prices, whatever the market has done since.
 */

type State = { running: boolean; done: number; total: number };
let state: State = { running: false, done: 0, total: 0 };
const listeners = new Set<() => void>();
const setState = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export function usePricingState(): State {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

export async function priceKillmails(): Promise<void> {
  if (state.running) return;
  const d = getData();
  const todo = Object.values(d.killmails).filter((k) => !k.value);
  const payouts = Object.values(d.journal).filter((j) => j.refType === 'insurance' && j.amount > 0);
  const losses = Object.values(d.killmails).filter((k) => k.kind === 'loss');
  const insurance = matchInsurance(losses, payouts.map((p) => ({ id: p.id, date: p.date, amount: p.amount })));
  const needsInsurance = losses.filter((k) => k.insurance == null && insurance[k.id] != null);
  if (!todo.length && !needsInsurance.length) return;

  const types = [...new Set(todo.flatMap((k) => [k.victim.shipTypeId, ...k.items.map((i) => i.typeId)]).filter((x): x is number => !!x))];
  setState({ running: true, done: 0, total: types.length });
  const hist = new Map<number, HistRow[]>();
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(4, types.length) }, async () => {
    while (i < types.length) {
      const id = types[i++];
      try { hist.set(id, await marketHistory(id)); } catch { hist.set(id, []); }
      setState({ done: ++done });
    }
  }));

  const valued: Record<string, Killmail> = {};
  for (const k of todo) {
    const day = k.time.slice(0, 10);
    valued[String(k.id)] = { ...k, value: valueKillmail(k, (id) => priceOnDay(hist.get(id) ?? [], day)?.price ?? null) };
  }
  // Names for everyone and everything on the mails, so the page reads as names rather than numbers.
  const ids = new Set<number>();
  for (const k of todo) {
    for (const p of [k.victim, ...k.attackers]) {
      for (const x of [p.characterId, p.corporationId, p.allianceId, p.shipTypeId, p.weaponTypeId]) if (x) ids.add(x);
    }
    k.items.forEach((it) => ids.add(it.typeId));
    ids.add(k.systemId);
  }
  const missing = [...ids].filter((x) => !d.names[x]);
  const names = missing.length ? await resolveNames(missing).catch(() => ({})) : {};

  update((cur) => {
    const next = { ...cur.killmails };
    for (const [id, k] of Object.entries(valued)) if (next[id] && !next[id].value) next[id] = { ...next[id], value: k.value };
    for (const k of needsInsurance) if (next[String(k.id)]) next[String(k.id)] = { ...next[String(k.id)], insurance: insurance[k.id] };
    return { killmails: next, names: { ...cur.names, ...names } };
  });
  setState({ running: false });
}

/** Ship group names, for telling a hauler loss from a combat one. Cached for good. */
const groups = new Map<number, string | null>();
export async function shipGroup(shipTypeId: number): Promise<string | null> {
  if (groups.has(shipTypeId)) return groups.get(shipTypeId)!;
  try {
    const t = await typeInfo(shipTypeId);
    const g = await groupName(t.groupId);
    groups.set(shipTypeId, g);
    return g;
  } catch {
    groups.set(shipTypeId, null);
    return null;
  }
}

/** Every killmail with the activity it happened in, once the ship groups are known. */
export async function classify(list: Killmail[]): Promise<Record<number, CombatActivity>> {
  const out: Record<number, CombatActivity> = {};
  for (const k of list) {
    const g = k.kind === 'loss' && k.victim.shipTypeId ? await shipGroup(k.victim.shipTypeId) : null;
    out[k.id] = activityOf(k, g);
  }
  return out;
}
