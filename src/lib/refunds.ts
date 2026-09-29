/**
 * Fees a GM refunded. The user's fat-fingered Sniper relist (1,893,000 instead of 1,893 on 19,489 units) paid a
 * 467,749,600.65 ISK broker fee on 28 September 2026 at 01:24:26; CCP support refunded exactly that at 22:54:39 as a
 * `gm_cash_transfer` from Caldari Navy, "Ticket #2734940". Counted as they came, the fee stayed a cost on the snipe, in
 * Results and in what standings are worth (about 36 billion ISK of phantom trading), and the refund was "Other income".
 *
 * So a refund is paired with the fee it returns: a GM transfer for exactly a fee's amount (to the cent), from the party
 * the fee was paid to, within REFUND_WINDOW_DAYS after it; the latest such fee before the refund. Both then count as
 * nothing (`withRefunds`): the fee stays in the journal as a zero, so it's still matched to its order and nothing
 * estimates a fee in its place, keeping its original amount (`refunded`) for telling a placing fee from a change. The
 * stored journal is never changed: this is how figures read it. A transfer that matches no fee stays as it was. Pure.
 */
import type { JournalEntry } from './types';

/** Journal types a refund comes as, and the charges one can return. */
export const REFUND_TYPES: ReadonlySet<string> = new Set(['gm_cash_transfer']);
export const REFUNDABLE_TYPES: ReadonlySet<string> = new Set(['brokers_fee', 'transaction_tax']);
export const REFUND_WINDOW_DAYS = 30;

export type RefundPair = { feeId: string; refundId: string; amount: number; refType: string; feeAt: string; refundAt: string; reason?: string };

export function refundPairs(journal: JournalEntry[]): RefundPair[] {
  const refunds = journal.filter((e) => REFUND_TYPES.has(e.refType) && e.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
  const fees = journal.filter((e) => REFUNDABLE_TYPES.has(e.refType) && e.amount < 0);
  const used = new Set<string>();
  const out: RefundPair[] = [];
  for (const r of refunds) {
    const t = Date.parse(r.date);
    let best: JournalEntry | null = null;
    for (const f of fees) {
      if (used.has(f.id)) continue;
      const ft = Date.parse(f.date);
      if (ft > t || t - ft > REFUND_WINDOW_DAYS * 86400_000) continue;
      if (Math.abs(f.amount + r.amount) > 0.005) continue;
      if (f.secondPartyId != null && r.firstPartyId != null && f.secondPartyId !== r.firstPartyId) continue;
      if (!best || ft > Date.parse(best.date)) best = f;
    }
    if (!best) continue;
    used.add(best.id);
    out.push({ feeId: best.id, refundId: r.id, amount: r.amount, refType: best.refType, feeAt: best.date, refundAt: r.date, ...(r.reason ? { reason: r.reason } : {}) });
  }
  return out;
}

/** The journal as figures read it: each refunded fee and its refund at zero, the fee keeping its original amount. */
export function withRefunds(journal: Record<string, JournalEntry>): Record<string, JournalEntry> {
  const pairs = refundPairs(Object.values(journal));
  if (!pairs.length) return journal;
  const out = { ...journal };
  for (const p of pairs) {
    out[p.feeId] = { ...journal[p.feeId], amount: 0, refunded: journal[p.feeId].amount, refundId: p.refundId };
    out[p.refundId] = { ...journal[p.refundId], amount: 0, refunded: journal[p.refundId].amount, refundOf: p.feeId };
  }
  return out;
}

const netted = new WeakMap<object, Record<string, JournalEntry>>();
const paired = new WeakMap<object, RefundPair[]>();

/** `withRefunds`, worked out once per version of the journal. */
export function nettedJournal(journal: Record<string, JournalEntry>): Record<string, JournalEntry> {
  let n = netted.get(journal);
  if (!n) { n = withRefunds(journal); netted.set(journal, n); }
  return n;
}

/** The refunds found, once per version of the journal: for saying so where the figures leave them out. */
export function refundsIn(journal: Record<string, JournalEntry>): RefundPair[] {
  let p = paired.get(journal);
  if (!p) { p = refundPairs(Object.values(journal)); paired.set(journal, p); }
  return p;
}
