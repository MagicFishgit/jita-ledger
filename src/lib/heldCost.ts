/**
 * What the stock you hold of an item cost you, when no open position says. Orders' guards against selling at a loss
 * (a move that would sell under cost is "Not worth it"; selling into bids never under cost) read the cost from open
 * positions only, so stock no position covers had none: a sniped item (the Sniper's buys are followed on its own
 * page, never as positions) could be told to move under what the snipe cost. The user asked on 28 September 2026 for
 * a sniped item never to be moved to a loss.
 *
 * Your latest buys of the item, newest first, until they cover what you hold (the Jita hangar plus what's listed),
 * averaged over those units. A buy from a listing (a snipe) cost its price; a fill of your own buy order also paid the
 * broker fee on it. Trades tagged Personal are left out. Null with no buys: loot has no cost to fall under. Pure.
 */
import type { Tx } from './types';

export function heldCost(buys: Pick<Tx, 'id' | 'date' | 'qty' | 'unitPrice'>[], held: number, fromListing: Set<string>, brokerFee: number): number | null {
  if (!(held > 0) || !buys.length) return null;
  let units = 0, cost = 0;
  for (const t of [...buys].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) {
    const take = Math.min(t.qty, held - units);
    cost += take * t.unitPrice * (fromListing.has(t.id) ? 1 : 1 + brokerFee);
    units += take;
    if (units >= held) break;
  }
  return units > 0 ? cost / units : null;
}
