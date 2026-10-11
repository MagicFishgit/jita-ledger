/**
 * Your own copy contracts (docs/notes/industry.md, stage 3): every item exchange you issued whose items are all blueprint
 * copies, kept as a synced document of its own (correction 10): ESI lists a character's contracts only 30 days back and the
 * sync replaces meta.contracts' list each time, so a sale would drop out of Results after a month, and meta goes up every sync.
 * The main's only: the cloud reads no alt's contracts. Pure; browser only.
 */
import type { ContractItem, MyContract } from './contracts';

/** A kind of copy in one of your contracts, from ESI's public contract items: [type, ME, TE, runs a copy, copies]. */
export type ContractKind = [typeId: number, me: number, te: number, runs: number, count: number];
export type CopyContract = {
  id: number; issued: string; expires: string;
  /** ESI's status as last read (outstanding, finished, deleted…): kept when it leaves ESI's list. */
  status: string;
  price: number;
  availability: string | null;
  acceptor: number | null;
  completed: string | null;
  /** Where it was made: its copies go back there when it's deleted. */
  station: number | null;
  /** The copies given, by type: how many, from your own contract items. */
  copies: [typeId: number, count: number][];
  /** Their kinds from ESI's public items, or why not: `private` (not public), `gone` (no longer outstanding, or no copy in the answer, before they were read). Absent: not read yet. */
  kinds?: ContractKind[] | 'private' | 'gone';
  /** When a read of your contracts first didn't list it (ESI lists 30 days back). */
  gone?: string;
};
export type CopyContractsDoc = { list: CopyContract[] };
export const MAX_COPY_CONTRACTS = 5000;

/** Items that make a copy contract: at least one, every one given (nothing asked) and a copy (raw_quantity −2). */
export const allCopies = (items: readonly ContractItem[] | undefined): boolean => !!items?.length && items.every((i) => i.included && i.raw === -2);

/**
 * The document after a read of your contracts (`list`, `items` as the sync keeps them): every item exchange you issued whose
 * items are all copies, with the read's status, price, acceptor and completion; the kinds read this sync (`kinds`) where none
 * were kept; `private` for a contract that isn't public and `gone` for one no longer outstanding, neither ever asked; one no
 * longer listed stamped `gone` once with the read's time, its last status kept. Never drops one; sorted by contract.
 */
export function copyContractsOf(prev: CopyContractsDoc | undefined, list: readonly MyContract[], items: Readonly<Record<number, ContractItem[] | undefined>>,
  kinds: Readonly<Record<number, ContractKind[] | 'gone'>>, me: number, readAt: string): CopyContractsDoc {
  const now = Date.parse(readAt);
  const byId = new Map((prev?.list ?? []).map((c) => [c.id, c]));
  const listed = new Set<number>();
  for (const c of list) {
    if (c.type !== 'item_exchange' || c.issuer !== me) continue;
    const old = byId.get(c.id), its = items[c.id];
    if (!its) {
      // Listed, its items not read this sync (past the 500 kept, waiting their turn): one kept before stays, its state followed (M14).
      if (old) { const keep: CopyContract = { ...old, status: c.status, price: c.price, acceptor: c.acceptor > 0 ? c.acceptor : null, completed: c.completed }; delete keep.gone; byId.set(c.id, keep); listed.add(c.id); }
      continue;
    }
    if (!allCopies(its)) continue;
    listed.add(c.id);
    const copies = [...its.reduce((m, i) => m.set(i.typeId, (m.get(i.typeId) ?? 0) + i.qty), new Map<number, number>())].sort((a, b) => a[0] - b[0]) as [number, number][];
    const availability = c.availability ?? null;
    // Never asked: a private one, and one no longer outstanding or past its expiry (M8: a 404 there would be asked every sync).
    const k = old?.kinds ?? kinds[c.id] ?? (availability != null && availability !== 'public' ? 'private' : c.status !== 'outstanding' || Date.parse(c.expires) <= now ? 'gone' : undefined);
    byId.set(c.id, { id: c.id, issued: c.issued, expires: c.expires, status: c.status, price: c.price, availability, acceptor: c.acceptor > 0 ? c.acceptor : null,
      completed: c.completed, station: c.start, copies, ...(k ? { kinds: k } : {}) });
  }
  for (const [id, c] of byId) if (!listed.has(id) && !c.gone) byId.set(id, { ...c, gone: readAt });
  return { list: [...byId.values()].sort((a, b) => a.id - b.id).slice(-MAX_COPY_CONTRACTS) };
}

/** Your outstanding public copy contracts, not past their expiry, whose kinds aren't read yet: at most `max` a sync (correction 14). */
export const kindsToRead = (doc: CopyContractsDoc, now: number, max = 20): number[] =>
  doc.list.filter((c) => c.kinds === undefined && !c.gone && c.status === 'outstanding' && c.availability === 'public' && Date.parse(c.expires) > now).slice(0, max).map((c) => c.id);

/** ESI's public contract item (`/contracts/public/items/{id}/`, no login), as read on 11 October 2026. */
export type PublicItem = { type_id: number; quantity: number; is_included: boolean; is_blueprint_copy?: boolean; material_efficiency?: number; time_efficiency?: number; runs?: number; item_id?: number; record_id?: number };
/** A contract's copies by kind; `gone` for a 204 (no body: expired or accepted) or an answer with no copy in it. */
export function readKinds(items: readonly PublicItem[] | undefined | null): ContractKind[] | 'gone' {
  const copies = (items ?? []).filter((i) => i.is_included && i.is_blueprint_copy && (i.runs ?? 0) > 0);
  if (!copies.length) return 'gone';
  const m = new Map<string, ContractKind>();
  for (const i of copies) {
    const me = i.material_efficiency ?? 0, te = i.time_efficiency ?? 0, key = `${i.type_id}|${me}|${te}|${i.runs}`;
    const k = m.get(key);
    if (k) k[4] += i.quantity; else m.set(key, [i.type_id, me, te, i.runs!, i.quantity]);
  }
  return [...m.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
}

export type CopyState = 'listed' | 'expired' | 'sold' | 'deleted' | 'other';
/** ESI has no expired status: an outstanding contract past its expiry is expired, its copies in it until deleted (correction 12). */
export function copyState(c: Pick<CopyContract, 'status' | 'expires'>, now: number): CopyState {
  if (c.status === 'outstanding') return Date.parse(c.expires) <= now ? 'expired' : 'listed';
  if (c.status === 'finished' || c.status === 'finished_issuer' || c.status === 'finished_contractor') return 'sold';
  return c.status === 'deleted' ? 'deleted' : 'other';
}

/** What a contract holds, in words: "2× Large Trimark Armor Pump I Blueprint, 1× Raven Blueprint" (three, then "and N more"). */
export function copiesSaid(copies: readonly [number, number][], name: (typeId: number) => string, max = 3): string {
  const parts = copies.slice(0, max).map(([t, n]) => `${n.toLocaleString('en-US')}× ${name(t)}`);
  return copies.length > max ? `${parts.join(', ')} and ${copies.length - max} more` : parts.join(', ');
}

/** On disk and on a pull: a row that isn't one is dropped, the rest kept as written. */
export function sanitizeCopyContracts(v: unknown): CopyContractsDoc | undefined {
  if (!v || typeof v !== 'object' || !Array.isArray((v as { list?: unknown }).list)) return undefined;
  const list: CopyContract[] = [];
  for (const x of (v as { list: unknown[] }).list) {
    const c = (x ?? {}) as Partial<CopyContract>;
    if (!Number.isInteger(c.id) || typeof c.issued !== 'string' || typeof c.expires !== 'string' || typeof c.status !== 'string' || typeof c.price !== 'number' || !Array.isArray(c.copies)) continue;
    const copies = c.copies.filter((p): p is [number, number] => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[1] > 0);
    const kinds = c.kinds === 'private' || c.kinds === 'gone' ? c.kinds
      : Array.isArray(c.kinds) ? c.kinds.filter((k): k is ContractKind => Array.isArray(k) && k.length === 5 && k.every((n) => Number.isFinite(n))) : undefined;
    list.push({ id: c.id!, issued: c.issued, expires: c.expires, status: c.status, price: c.price, availability: typeof c.availability === 'string' ? c.availability : null,
      acceptor: Number.isInteger(c.acceptor) ? c.acceptor! : null, completed: typeof c.completed === 'string' ? c.completed : null, station: Number.isInteger(c.station) ? c.station! : null,
      copies, ...(kinds !== undefined ? { kinds } : {}), ...(typeof c.gone === 'string' ? { gone: c.gone } : {}) });
  }
  return { list: list.sort((a, b) => a.id - b.id).slice(-MAX_COPY_CONTRACTS) };
}
