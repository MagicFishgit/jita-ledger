/**
 * Your own copy contracts (docs/notes/industry.md, stage 3): every item exchange you issued whose items are all blueprint
 * copies, kept as a synced document of its own (correction 10): ESI lists a character's contracts only 30 days back and the
 * sync replaces meta.contracts' list each time, so a sale would drop out of Results after a month, and meta goes up every sync.
 * The main's only: the cloud reads no alt's contracts. Pure; browser only.
 */
import type { ContractItem, MyContract } from './contracts';
import type { JobRecord } from './industryTrack';

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
/**
 * The document goes up as one D1 value, which holds 2 MB at most. Measured 11 October 2026: 5,000 contracts with one kind each
 * come to about 1.54 MB and with five kinds each 2.16 MB, so 3,000 (about 1.3 MB at five kinds) is the cap, for the sync's
 * own list and for the merge alike.
 */
export const MAX_COPY_CONTRACTS = 3000;

/** Items that make a copy contract: at least one, every one given (nothing asked) and a copy (raw_quantity −2). */
export const allCopies = (items: readonly ContractItem[] | undefined): boolean => !!items?.length && items.every((i) => i.included && i.raw === -2);

/** ESI lists a character's contracts this far back (correction 13). */
const ESI_LIST_DAYS = 30;

/**
 * The document after a read of your contracts (`list`, `items` as the sync keeps them): every item exchange you issued whose
 * items are all copies, with the read's status, price, acceptor and completion; the kinds read this sync (`kinds`) where none
 * were kept; `private` for a contract that isn't public and `gone` for one no longer outstanding, neither ever asked.
 *
 * `gone` is stamped (once, with the read's time, the last status kept) only against ESI's own list: a held contract that is no
 * longer among the item exchanges you issued in `list`, whatever their items, AND was issued more than 30 days before the read.
 * ESI lists a character's contracts 30 days back (correction 13), so a younger one missing from the list is a partial or stale
 * read, or one issued after the read, never one that left; if ESI's window is measured from completion instead, this only delays
 * a stamp until the contract is missing anyway. A listed contract whose items aren't usable this read (read before `raw` was kept,
 * not read, past the 500 kept) keeps its old record and follows its status. A `gone` stamp already held is carried forward, never
 * stripped, so this and `mergeCopyContracts` agree and a sync writes nothing when nothing changed. Never drops one; sorted by contract.
 */
export function copyContractsOf(prev: CopyContractsDoc | undefined, list: readonly MyContract[], items: Readonly<Record<number, ContractItem[] | undefined>>,
  kinds: Readonly<Record<number, ContractKind[] | 'gone'>>, me: number, readAt: string): CopyContractsDoc {
  const now = Date.parse(readAt);
  const byId = new Map((prev?.list ?? []).map((c) => [c.id, c]));
  const listed = new Set<number>();
  for (const c of list) {
    if (c.type !== 'item_exchange' || c.issuer !== me) continue;
    listed.add(c.id);
    const old = byId.get(c.id), its = items[c.id];
    if (!its || !allCopies(its)) {
      // Listed, its items unusable this read: one kept before stays, its state followed (M14); its `gone`, if any, is carried.
      if (old) byId.set(c.id, { ...old, status: c.status, price: c.price, acceptor: c.acceptor > 0 ? c.acceptor : null, completed: c.completed });
      continue;
    }
    const copies = [...its.reduce((m, i) => m.set(i.typeId, (m.get(i.typeId) ?? 0) + i.qty), new Map<number, number>())].sort((a, b) => a[0] - b[0]) as [number, number][];
    const availability = c.availability ?? null;
    // Never asked: a private one, and one no longer outstanding or past its expiry (M8: a 404 there would be asked every sync).
    const k = old?.kinds ?? kinds[c.id] ?? (availability != null && availability !== 'public' ? 'private' : c.status !== 'outstanding' || Date.parse(c.expires) <= now ? 'gone' : undefined);
    byId.set(c.id, { id: c.id, issued: c.issued, expires: c.expires, status: c.status, price: c.price, availability, acceptor: c.acceptor > 0 ? c.acceptor : null,
      completed: c.completed, station: c.start, copies, ...(k ? { kinds: k } : {}), ...(old?.gone ? { gone: old.gone } : {}) });
  }
  const oldest = now - ESI_LIST_DAYS * 86_400_000;
  for (const [id, c] of byId) if (!listed.has(id) && !c.gone && Date.parse(c.issued) < oldest) byId.set(id, { ...c, gone: readAt });
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

export type CopyState = 'listed' | 'expired' | 'unlisted' | 'sold' | 'taken' | 'deleted' | 'other';
/**
 * ESI has no expired status: an outstanding contract past its expiry is expired, its copies in it until deleted (correction 12).
 * One that left ESI's list while outstanding (`gone`) is `unlisted`: nobody knows whether it expired, sold or was deleted. A
 * finished one whose acceptor is one of your own characters (`mine`) is `taken`, not a sale.
 */
export function copyState(c: Pick<CopyContract, 'status' | 'expires'> & { gone?: string; acceptor?: number | null }, now: number, mine?: ReadonlySet<number>): CopyState {
  if (c.status === 'outstanding') return c.gone ? 'unlisted' : Date.parse(c.expires) <= now ? 'expired' : 'listed';
  if (c.status === 'finished' || c.status === 'finished_issuer' || c.status === 'finished_contractor') return c.acceptor != null && mine?.has(c.acceptor) ? 'taken' : 'sold';
  return c.status === 'deleted' ? 'deleted' : 'other';
}

const TERMINAL_RANK = (status: string): number => (status === 'outstanding' ? 0 : status === 'in_progress' ? 1
  : status === 'finished' || status === 'finished_issuer' || status === 'finished_contractor' ? 4 : status === 'deleted' ? 3 : 2);
const KINDS_RANK = (k: CopyContract['kinds']): number => (Array.isArray(k) ? 3 : k === 'private' ? 2 : k === 'gone' ? 1 : 0);

/**
 * Two copies of one contract (this browser's, the cloud's): never moves back. The record whose status is further on wins its
 * own fields (outstanding, then in progress, then other terminal statuses, then deleted, then finished; equal ranks by the
 * status's text, then the record's JSON, so the choice never depends on the order); an acceptor or completion either side
 * knows is kept; `gone` is the earliest stamp (ESI's 30-day window only moves forward); kinds read beat `private`, which
 * beats `gone`, which beats not read.
 */
export function mergeCopyContract(a: CopyContract, b: CopyContract): CopyContract {
  const key = (c: CopyContract): [number, string, string] => [TERMINAL_RANK(c.status), c.status, JSON.stringify(c)];
  const ka = key(a), kb = key(b);
  const aWins = ka[0] !== kb[0] ? ka[0] > kb[0] : ka[1] !== kb[1] ? ka[1] > kb[1] : ka[2] >= kb[2];
  const [w, l] = aWins ? [a, b] : [b, a];
  const kinds = KINDS_RANK(w.kinds) >= KINDS_RANK(l.kinds) ? w.kinds : l.kinds;
  const gone = w.gone != null && l.gone != null ? (w.gone < l.gone ? w.gone : l.gone) : (w.gone ?? l.gone);
  return { id: w.id, issued: w.issued, expires: w.expires, status: w.status, price: w.price, availability: w.availability, acceptor: w.acceptor ?? l.acceptor,
    completed: w.completed ?? l.completed, station: w.station ?? l.station, copies: w.copies, ...(kinds !== undefined ? { kinds } : {}), ...(gone !== undefined ? { gone } : {}) };
}

/**
 * The union of two copies of the document, by contract (a browser that met the cloud after a month would otherwise write only
 * ESI's 30 days over the cloud's history, which ESI can't list again): sorted, capped to the newest, commutative and idempotent.
 * Used by the browser's pull and by the Worker's push, as `mergeJob` is for jobs.
 */
export function mergeCopyContracts(a: CopyContractsDoc | undefined, b: CopyContractsDoc | undefined): CopyContractsDoc {
  const by = new Map<number, CopyContract>();
  for (const c of [...(a?.list ?? []), ...(b?.list ?? [])]) { const had = by.get(c.id); by.set(c.id, had ? mergeCopyContract(had, c) : mergeCopyContract(c, c)); }
  return { list: [...by.values()].sort((x, y) => x.id - y.id).slice(-MAX_COPY_CONTRACTS) };
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

/** A copy contract's own fees in the journal, by the contract its context names. Unseen in the user's journal so far (stage 3's evidence). */
export const CONTRACT_FEE_REFS: ReadonlySet<string> = new Set(['contract_brokers_fee', 'contract_sales_tax']);
export type CopySales = {
  events: { t: number; isk: number }[];
  /** Copies sold that no delivered copy job of yours made before the contract was listed: bought, given, or from before the records. Not counted. */
  notMade: { contractId: number; copies: number }[];
  /** Copy contracts one of your own characters accepted: a transfer, not a sale. */
  toOwn: number[];
};

/**
 * Industry's copy sales (correction 1): each copy contract sold, not to one of your characters, counted at its price (the
 * journal's `contract_price` naming it, else the contract's own at its completion) times the share of its copies your
 * delivered copy jobs had made before it was listed, claimed in the order the contracts were listed, each copy once; and the
 * contract fees the journal names for a copy contract of a blueprint you'd copied before listing it. The copy jobs' own fees
 * are builtAndSold's, at each job's start: never charged here. Only a `sold` contract is a sale: `taken` (accepted by one of
 * `mine`) goes to `toOwn`, and `unlisted` (left ESI's list while outstanding), listed, expired and deleted claim nothing.
 */
export function copySales(o: { doc: CopyContractsDoc | undefined; jobs: readonly JobRecord[]; journal: readonly { date: string; refType: string; amount: number; contextId?: number; contextIdType?: string }[]; mine?: ReadonlySet<number> }): CopySales {
  const out: CopySales = { events: [], notMade: [], toOwn: [] };
  if (!o.doc?.list.length) return out;
  // What your delivered copy jobs made, by blueprint, oldest first: a copy job's runs are the copies it makes.
  const made = new Map<number, { t: number; left: number }[]>();
  for (const j of o.jobs) {
    if (j.activity !== 5 || j.status !== 'delivered') continue;
    const n = j.successfulRuns ?? j.runs;
    if (!(n > 0)) continue;
    const list = made.get(j.blueprintTypeId) ?? [];
    list.push({ t: Date.parse(j.completed ?? j.end), left: n });
    made.set(j.blueprintTypeId, list);
  }
  for (const l of made.values()) l.sort((a, b) => a.t - b.t);
  const named = new Map<number, { t: number; isk: number; refType: string }[]>();
  for (const e of o.journal) {
    if (e.contextIdType !== 'contract_id' || e.contextId == null || (e.refType !== 'contract_price' && !CONTRACT_FEE_REFS.has(e.refType))) continue;
    const l = named.get(e.contextId) ?? [];
    l.push({ t: Date.parse(e.date), isk: e.amount, refType: e.refType });
    named.set(e.contextId, l);
  }
  const copiedBefore = (typeId: number, t: number) => (made.get(typeId) ?? []).some((b) => b.t <= t);
  for (const c of [...o.doc.list].sort((a, b) => Date.parse(a.issued) - Date.parse(b.issued) || a.id - b.id)) {
    const issued = Date.parse(c.issued);
    const entries = named.get(c.id) ?? [];
    if (c.copies.some(([t]) => copiedBefore(t, issued))) for (const f of entries) if (CONTRACT_FEE_REFS.has(f.refType)) out.events.push({ t: f.t, isk: f.isk });
    const state = copyState(c, Infinity, o.mine);
    if (state === 'taken') { out.toOwn.push(c.id); continue; }
    if (state !== 'sold') continue;
    const total = c.copies.reduce((n, [, k]) => n + k, 0);
    let claimed = 0;
    for (const [typeId, count] of c.copies) {
      let want = count;
      for (const b of made.get(typeId) ?? []) {
        if (want <= 0 || b.t > issued) break;
        const take = Math.min(b.left, want);
        b.left -= take; want -= take; claimed += take;
      }
    }
    if (claimed < total) out.notMade.push({ contractId: c.id, copies: total - claimed });
    if (!claimed) continue;
    const paid = entries.filter((e) => e.refType === 'contract_price' && e.isk > 0);
    const isk = paid.length ? paid.reduce((n, e) => n + e.isk, 0) : c.price;
    out.events.push({ t: paid.length ? paid[0].t : Date.parse(c.completed ?? c.expires), isk: (isk * claimed) / total });
  }
  return out;
}
