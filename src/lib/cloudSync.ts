import type { Data } from './store';

/**
 * What the cloud copy of the ledger is made of, and how a change on one side becomes a change on the other.
 *
 * Collections go up record by record (a trade, a journal entry, a position), so two devices changing
 * different things never overwrite each other and a push only carries what changed. Small whole values
 * (settings, stock, skills) go up as one document each; the newest write wins. Things that only make sense
 * in one browser stay out: display preferences, when you last visited, the alert mails this browser sent.
 */

type Rec = Record<string, unknown>;

/** Collections synced record by record, with how to find each record's ID and rebuild the collection. */
export const RECORD_KEYS = {
  txs: 'map', journal: 'map', orders: 'map', names: 'map', killmails: 'map', tags: 'map',
  positions: 'id', goals: 'id', watchlist: 'typeId', netWorth: 'date',
} as const;
export type RecordKey = keyof typeof RECORD_KEYS;

/** Whole values synced as one document each. */
export const DOC_KEYS = ['settings', 'meta', 'prefs', 'alerts', 'stock', 'skills', 'ignored', 'nearDone', 'unusualOk', 'leave', 'safetyTimes', 'notSnipes'] as const;
export type DocKey = (typeof DOC_KEYS)[number];

/**
 * Meta fields that belong to this browser, not the ledger: when it was last open, when its own next sync is
 * due, the alert mails it sent. Syncing them would have two devices overwrite each other's visits.
 */
export const LOCAL_META = ['lastSeenAt', 'prevVisitAt', 'nextSyncAt', 'tradesFreshAt', 'lastSyncError', 'alertMails', 'mailCleanAt'] as const;

/** Fields of a doc that stay in this browser: meta's visits and mail, and how much motion this screen wants. */
export const LOCAL_FIELDS: Partial<Record<DocKey, readonly string[]>> = { meta: LOCAL_META, prefs: ['motion'] };

export const isRecordKey = (k: string): k is RecordKey => k in RECORD_KEYS;
export const isDocKey = (k: string): k is DocKey => (DOC_KEYS as readonly string[]).includes(k);

/** A collection as a map of ID to record, whatever its shape in the store. */
export function asMap(key: RecordKey, value: unknown): Map<string, unknown> {
  const how = RECORD_KEYS[key];
  const out = new Map<string, unknown>();
  if (!value) return out;
  if (how === 'map') {
    for (const [id, v] of Object.entries(value as Rec)) out.set(id, v);
  } else {
    for (const v of value as Rec[]) out.set(String(v[how]), v);
  }
  return out;
}

/**
 * What changed in one collection: records added or replaced, and IDs removed. Records are compared by
 * identity, which is how the store changes them (an unchanged record keeps its object), so a sync that
 * rewrites the whole map still only reports what really changed. Falls back to comparing the JSON when an
 * object was rebuilt with the same content.
 */
export function diffRecords(key: RecordKey, before: unknown, after: unknown): { changed: string[]; removed: string[] } {
  if (before === after) return { changed: [], removed: [] };
  const a = asMap(key, before), b = asMap(key, after);
  const changed: string[] = [], removed: string[] = [];
  for (const [id, v] of b) {
    const old = a.get(id);
    if (old === v) continue;
    if (old !== undefined && JSON.stringify(old) === JSON.stringify(v)) continue;
    changed.push(id);
  }
  for (const id of a.keys()) if (!b.has(id)) removed.push(id);
  return { changed, removed };
}

/** A doc without this browser's own fields. */
export function sharedDoc(key: DocKey, value: unknown): unknown {
  const local = LOCAL_FIELDS[key];
  if (!local || !value || typeof value !== 'object') return value;
  const out: Rec = { ...(value as Rec) };
  for (const k of local) delete out[k];
  return out;
}

export type Pulled = { records: { k: string; i: string; d: unknown }[]; docs: { key: string; d: unknown }[] };

/**
 * The store patch that applies what came down. Records replace theirs by ID or are removed; new ones in
 * array collections go first (newest first, as the app adds them), except net worth, which stays in date
 * order. Docs replace the local value, keeping this browser's own fields of meta and prefs.
 */
export function applyPulled(data: Data, pulled: Pulled): Partial<Data> {
  const patch: Rec = {};
  const byKey = new Map<RecordKey, { i: string; d: unknown }[]>();
  for (const r of pulled.records) {
    if (!isRecordKey(r.k)) continue;
    if (!byKey.has(r.k)) byKey.set(r.k, []);
    byKey.get(r.k)!.push({ i: r.i, d: r.d });
  }
  for (const [key, rows] of byKey) {
    const how = RECORD_KEYS[key];
    const current = (data as unknown as Rec)[key];
    if (how === 'map') {
      const next: Rec = { ...((current as Rec) ?? {}) };
      for (const { i, d } of rows) { if (d == null) delete next[i]; else next[i] = d; }
      patch[key] = next;
    } else {
      const list = [...((current as Rec[]) ?? [])];
      const at = new Map(list.map((v, n) => [String(v[how]), n]));
      const added: Rec[] = [];
      const gone = new Set<string>();
      for (const { i, d } of rows) {
        if (d == null) { gone.add(i); continue; }
        const n = at.get(i);
        if (n != null) list[n] = d as Rec; else added.push(d as Rec);
      }
      let next = [...added, ...list].filter((v) => !gone.has(String(v[how])));
      if (key === 'netWorth') next = next.sort((x, y) => String(x.date).localeCompare(String(y.date)));
      patch[key] = next;
    }
  }
  for (const doc of pulled.docs) {
    if (!isDocKey(doc.key)) continue;
    const localFields = LOCAL_FIELDS[doc.key];
    if (localFields) {
      const mine = (data as unknown as Rec)[doc.key] as Rec | undefined;
      const keep: Rec = {};
      for (const k of localFields) if (mine?.[k] !== undefined) keep[k] = mine[k];
      patch[doc.key] = { ...(doc.d as Rec), ...keep };
    } else {
      patch[doc.key] = doc.d;
    }
  }
  return patch as Partial<Data>;
}

/** Every record and doc the store holds, as a push body: the first upload of a ledger. */
export function everything(data: Data): { records: { k: RecordKey; i: string }[]; docs: DocKey[] } {
  const records: { k: RecordKey; i: string }[] = [];
  for (const key of Object.keys(RECORD_KEYS) as RecordKey[]) for (const id of asMap(key, (data as unknown as Rec)[key]).keys()) records.push({ k: key, i: id });
  const docs = DOC_KEYS.filter((k) => (data as unknown as Rec)[k] !== undefined);
  return { records, docs };
}

/** The value to send for a doc. */
export const docValue = (data: Data, key: DocKey): unknown => sharedDoc(key, (data as unknown as Rec)[key]);

/** The value to send for a record: the record, or null when it has been removed. */
export const recordValue = (data: Data, key: RecordKey, id: string): unknown => asMap(key, (data as unknown as Rec)[key]).get(id) ?? null;
