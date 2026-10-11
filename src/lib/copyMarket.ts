/**
 * The Forge's blueprint copies on public contracts (docs/notes/industry.md, stage 3), read every six hours by the cloud
 * (worker/src/copies.ts) from EVE Ref's snapshot: the set of single-kind copy contracts kept between reads, what vanished
 * before expiry (sold, most likely: a seller cancelling looks the same), and the summary the Copies section reads. Two
 * snapshots days apart miss a contract listed and sold between them; six hours apart they saw 327 and 430 vanish on 11
 * October 2026, where the research's multi-day reads counted about 320 a day. Pure; the Worker imports it.
 */
import type { BpContract } from './bpContracts';

/** What a buyer pays for: the blueprint, its ME and TE, and the runs on each copy. */
export type CopyKind = { typeId: number; me: number; te: number; runs: number };
export const copyKindKey = (k: CopyKind): string => `${k.typeId}|${k.me}|${k.te}|${k.runs}`;
/** One kept contract: [contract, type, ME, TE, runs a copy, copies, price, issuer, expires (seconds), its items' IDs]. */
export type CopyRow = [id: number, typeId: number, me: number, te: number, runs: number, copies: number, price: number, issuer: number, expires: number, items: number[]];
/** One comparison of two sets: from the older snapshot's time to the newer's, and how many vanished. */
export type CopyRead = [from: number, to: number, sold: number];
/** A contract that vanished before expiry, at the newer snapshot's time. */
export type SoldRow = { contractId: number; typeId: number; me: number; te: number; runs: number; copies: number; price: number; issuer: number; at: number };
export type KindSold = CopyKind & { contracts: number; copies: number; sellers: number; perRun: number };
/** The asks now for a kind, a run: the cheapest, the median, how many contracts and sellers. */
export type Ask = [cheapest: number, median: number, contracts: number, sellers: number];
export type CopySummary = {
  /** The newest snapshot's time. */
  at: string;
  /** Days counted in the window: from the first read in it (or the window's start) to the newest. */
  days: number;
  /** The longest comparison in the window, in hours: a copy listed and sold within it was missed. */
  gapHours: number;
  reads: number;
  sold: KindSold[];
  asks: Record<string, Ask>;
};

/** The window the summary counts, and how long what sold is kept (a day more, so the window is always whole). */
export const COPY_WINDOW_DAYS = 7;
export const COPY_KEEP_DAYS = 8;
const DAY = 86_400_000;
const median = (xs: readonly number[]): number => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * A snapshot's single-kind copy contracts: every item a copy of one type at one ME, TE and runs (`blueprintContracts` already
 * left out any asking for items, and anything not a blueprint), with a price and runs. Sorted by contract.
 */
export function compactCopies(contracts: readonly BpContract[]): CopyRow[] {
  const out: CopyRow[] = [];
  for (const c of contracts) {
    const i = c.items[0];
    if (!i || i.runs == null || i.runs <= 0) continue;
    if (!c.items.every((x) => x.copy && x.typeId === i.typeId && x.me === i.me && x.te === i.te && x.runs === i.runs)) continue;
    const exp = Math.floor(Date.parse(c.expires) / 1000);
    if (!Number.isFinite(exp) || !(c.price > 0)) continue;
    out.push([c.id, i.typeId, i.me, i.te, i.runs, c.items.reduce((n, x) => n + x.qty, 0), c.price, c.issuer, exp, c.items.map((x) => x.itemId).filter((x): x is number => x != null)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Every item of every contract in a snapshot, to its seller: what tells a reprice (back by the same seller) from a sale. */
export function itemIssuers(contracts: readonly BpContract[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of contracts) for (const i of c.items) if (i.itemId != null) m.set(i.itemId, c.issuer);
  return m;
}

/**
 * The kept contracts gone from the newer snapshot before their expiry (at the newer snapshot's time), none of whose items
 * came back in a contract by the same seller (`vanishedSince`'s rule, against every contract of the newer snapshot, a bundle
 * included: correction 5). Back under another seller, it was bought and relisted: a sale.
 */
export function copiesSold(older: readonly CopyRow[], newerIds: ReadonlySet<number>, itemIssuer: ReadonlyMap<number, number>, now: number): CopyRow[] {
  return older.filter((r) => !newerIds.has(r[0]) && r[8] * 1000 > now && !r[9].some((it) => itemIssuer.get(it) === r[7]));
}

export const soldRows = (rows: readonly CopyRow[], at: number): SoldRow[] =>
  rows.map((r) => ({ contractId: r[0], typeId: r[1], me: r[2], te: r[3], runs: r[4], copies: r[5], price: r[6], issuer: r[7], at }));

/**
 * What the Copies section reads, worked out once a round: each kind sold in the window (contracts, copies, sellers, the
 * median price a run), the asks now per kind, how many days are counted and the longest gap. `exclude`: your own characters,
 * whose contracts are no one's market. `at`: the newest snapshot's time, which the window ends at.
 */
export function copySummary(o: { sold: readonly SoldRow[]; current: readonly CopyRow[]; reads: readonly CopyRead[]; exclude: ReadonlySet<number>; at: number }): CopySummary {
  const start = o.at - COPY_WINDOW_DAYS * DAY;
  const reads = o.reads.filter((r) => r[1] > start).sort((a, b) => a[1] - b[1]);
  const from = reads.length ? Math.max(start, reads[0][0]) : o.at, to = reads.length ? reads[reads.length - 1][1] : o.at;
  const gapHours = reads.length ? Math.max(...reads.map((r) => (r[1] - Math.max(r[0], start)) / 3_600_000)) : 0;
  const groups = new Map<string, SoldRow[]>();
  for (const s of o.sold) {
    if (s.at <= start || o.exclude.has(s.issuer)) continue;
    const k = copyKindKey(s), g = groups.get(k);
    if (g) g.push(s); else groups.set(k, [s]);
  }
  const sold: KindSold[] = [...groups.values()].map((g) => ({
    typeId: g[0].typeId, me: g[0].me, te: g[0].te, runs: g[0].runs, contracts: g.length, copies: g.reduce((n, s) => n + s.copies, 0),
    sellers: new Set(g.map((s) => s.issuer)).size, perRun: median(g.map((s) => s.price / (s.copies * s.runs))),
  })).sort((a, b) => a.typeId - b.typeId || a.me - b.me || a.te - b.te || a.runs - b.runs);
  const ask = new Map<string, { per: number[]; sellers: Set<number> }>();
  for (const r of o.current) {
    if (o.exclude.has(r[7])) continue;
    const k = copyKindKey({ typeId: r[1], me: r[2], te: r[3], runs: r[4] });
    const a = ask.get(k) ?? { per: [], sellers: new Set<number>() };
    a.per.push(r[6] / (r[5] * r[4])); a.sellers.add(r[7]); ask.set(k, a);
  }
  const asks: Record<string, Ask> = {};
  for (const [k, a] of [...ask].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))) asks[k] = [Math.min(...a.per), median(a.per), a.per.length, a.sellers.size];
  return { at: new Date(o.at).toISOString(), days: (to - from) / DAY, gapHours, reads: reads.length, sold, asks };
}
