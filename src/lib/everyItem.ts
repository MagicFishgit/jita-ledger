import { builtClaims } from './industryTrack';
import { computePosition, countedIn } from './positions';
import type { ItemCalc } from './longRange';
import type { Data } from './store';

/** A position that follows every trade of an item, whenever it was, less the ones you tagged Personal, and the units Industry claims. */
export const everything = (typeId: number, excluded: string[], claimed?: Record<string, number>) => ({ id: `all:${typeId}`, typeId, openedAt: '2003-05-06T00:00:00Z', status: 'open' as const, jitaOnly: false, excluded, included: [], ...(claimed ? { claimed } : {}) });

const NO_CLAIMS = new Map<string, number>();
const claimMemo = new WeakMap<object, { key: unknown[]; claims: Map<string, number> }>();
/**
 * Industry's claims on this ledger's sales (industryTrack.ts builtClaims): its jobs against its sales no position counts and
 * not marked Personal. Kept while the jobs, trades, positions and Personal marks are the same objects; none without jobs.
 */
export function claimsOf(d: Data): Map<string, number> {
  const jobs = d.jobs ?? {};
  if (!Object.keys(jobs).length) return NO_CLAIMS;
  const key = [d.txs, d.positions, d.ignored];
  const hit = claimMemo.get(jobs);
  if (hit && hit.key.every((k, i) => k === key[i])) return hit.claims;
  const txs = Object.values(d.txs).filter((t) => t.source === 'esi');
  const tracked = new Set(txs.filter((t) => d.positions.some((p) => countedIn(p, t))).map((t) => t.id));
  const personal = new Set(d.ignored);
  const claims = builtClaims(Object.values(jobs), txs, (id) => tracked.has(id) || personal.has(id));
  claimMemo.set(jobs, { key, claims });
  return claims;
}

/**
 * One ledger's answer, kept while the inputs it read are the same objects (the store replaces what changes). Industry's
 * claims are in the key as `claimsOf(d)` itself: the same Map while its jobs, trades, positions and Personal marks hold, and
 * one constant with no jobs, so a ledger without jobs isn't worked out again when only a position moves. Not `d.positions`
 * otherwise: `computePosition` reads it only to ask whether the position it works out is one of the ledger's own (`mine`,
 * by ID), which then shares the item's trades with its rivals; the `all:` positions here never are.
 */
const memo = new WeakMap<object, { key: unknown[]; calcs: ItemCalc[] }>();

/**
 * Every item you traded, worked out as a position over all its trades (lib/longRange.ts reads a period from each):
 * Results' "Every item traded" and Omega's "Could trading pay for it?", which counted only tracked positions (17.77 M
 * of the user's 30 days, against 92.13 M over every item, 29 September 2026).
 */
export function everyItemCalcs(d: Data): ItemCalc[] {
  const key = [d.journal, d.orders, d.settings, d.meta.rateHistory, d.ignored, claimsOf(d)];
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
  // Units Industry claims come off their sales, so an item both built and bought keeps its bought part in trading.
  const claimedByType = new Map<number, Record<string, number>>();
  for (const [id, n] of claimsOf(d)) {
    const t = d.txs[id];
    if (!t) continue;
    const rec = claimedByType.get(t.typeId) ?? {};
    rec[id] = n;
    claimedByType.set(t.typeId, rec);
  }
  return types.map((typeId) => {
    const c = computePosition(everything(typeId, personal.get(typeId) ?? [], claimedByType.get(typeId)), d, d.settings);
    return { typeId, series: c.series, buys: c.buys, sells: c.sells, ordered: bids.has(typeId), relists: c.relistEvents };
  });
}
