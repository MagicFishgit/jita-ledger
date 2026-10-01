import { computePosition } from './positions';
import type { ItemCalc } from './longRange';
import type { Data } from './store';

/** A position that follows every trade of an item, whenever it was, less the ones you tagged Personal. */
export const everything = (typeId: number, excluded: string[]) => ({ id: `all:${typeId}`, typeId, openedAt: '2003-05-06T00:00:00Z', status: 'open' as const, jitaOnly: false, excluded, included: [] });

/**
 * One ledger's answer, kept while the inputs it read are the same objects (the store replaces what changes). Not
 * `d.positions`: `computePosition` reads it only to ask whether the position it works out is one of the ledger's own
 * (`mine`, by ID), which then shares the item's trades with its rivals; the `all:` positions here never are.
 */
const memo = new WeakMap<object, { key: unknown[]; calcs: ItemCalc[] }>();

/**
 * Every item you traded, worked out as a position over all its trades (lib/longRange.ts reads a period from each):
 * Results' "Every item traded" and Omega's "Could trading pay for it?", which counted only tracked positions (17.77 M
 * of the user's 30 days, against 92.13 M over every item, 29 September 2026).
 */
export function everyItemCalcs(d: Data): ItemCalc[] {
  const key = [d.journal, d.orders, d.settings, d.meta.rateHistory, d.ignored];
  const hit = memo.get(d.txs);
  if (hit && hit.key.every((k, i) => k === key[i])) return hit.calcs;
  const calcs = computeEveryItem(d);
  memo.set(d.txs, { key, calcs });
  return calcs;
}

function computeEveryItem(d: Data): ItemCalc[] {
  const personal = new Map<number, string[]>();
  for (const id of d.ignored) { const t = d.txs[id]; if (t) personal.set(t.typeId, [...(personal.get(t.typeId) ?? []), id]); }
  const esiTxs = Object.values(d.txs).filter((t) => t.source === 'esi');
  // An item whose every trade is Personal (a ship bought to fly, fittings for it) isn't trading at all: left
  // out whole, or its buy orders' fees, with their fills left out, would read as orders that sold nothing.
  const ignored = new Set(d.ignored);
  const traded = new Set(esiTxs.filter((t) => !ignored.has(t.id)).map((t) => t.typeId));
  const personalOnly = new Set([...personal.keys()].filter((id) => !traded.has(id)));
  const bids = new Set(Object.values(d.orders).filter((o) => o.isBuy && !personalOnly.has(o.typeId)).map((o) => o.typeId));
  const types = [...new Set([...traded, ...bids])];
  return types.map((typeId) => {
    const c = computePosition(everything(typeId, personal.get(typeId) ?? []), d, d.settings);
    return { typeId, series: c.series, buys: c.buys, sells: c.sells, ordered: bids.has(typeId), relists: c.relistEvents };
  });
}
