import { useSyncExternalStore } from 'react';
import { getAuth, hasScope } from './auth';
import { esi, esiAllPages } from './esi';
import { ALPHA_CAPS, JITA_44, NPC_FALLBACK_IDS, NPC_NAMES, SCOPES, SKILL_FALLBACK_IDS, SKILL_NAMES, type SkillKey } from './config';
import { resolveIds, resolveNames } from './market';
import { getData, update, type Data } from './store';
import { sanitizeSettings, type Settings } from './fees';
import type { JournalEntry, Meta, Order, Stock, Tx } from './types';

const [WALLET, ORDERS, SKILLS, STANDINGS, , ASSETS] = SCOPES;

/** How long to wait after a failed sync before trying again. */
const RETRY_AFTER_FAIL_MS = 5 * 60_000;

type SyncState = { running: boolean; message: string; error: string | null; lastAdded: number | null };
let state: SyncState = { running: false, message: '', error: null, lastAdded: null };
const listeners = new Set<() => void>();
function setState(p: Partial<SyncState>) { state = { ...state, ...p }; listeners.forEach((l) => l()); }
export function useSyncState(): SyncState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

type RawTx = {
  transaction_id: number; date: string; is_buy: boolean; quantity: number;
  type_id: number; unit_price: number; location_id: number; journal_ref_id: number;
};
type RawJournal = {
  id: number; date: string; ref_type: string; amount?: number;
  context_id?: number; context_id_type?: string;
};
type RawCharOrder = {
  order_id: number; type_id: number; is_buy_order?: boolean; price: number;
  volume_total: number; volume_remain: number; issued: string; state?: string; location_id: number;
};

function toOrder(o: RawCharOrder, fallbackState: string): Order {
  return {
    orderId: o.order_id, typeId: o.type_id, isBuy: !!o.is_buy_order, price: o.price,
    volumeTotal: o.volume_total, volumeRemain: o.volume_remain, issued: o.issued,
    state: o.state ?? fallbackState, locationId: o.location_id,
  };
}

const SKILL_KEYS = Object.keys(SKILL_NAMES) as SkillKey[];

async function ensureIds(d: Data) {
  const cached = d.meta.skillIds;
  if (cached && SKILL_KEYS.every((k) => cached[k]) && d.meta.npcIds) {
    return { skillIds: cached as Record<SkillKey, number>, npcIds: d.meta.npcIds };
  }
  const skillIds = { ...SKILL_FALLBACK_IDS };
  let npcIds = { ...NPC_FALLBACK_IDS };
  try {
    const r = await resolveIds([...Object.values(SKILL_NAMES), NPC_NAMES.faction, NPC_NAMES.corp]);
    const byName = (list: { id: number; name: string }[] | undefined, n: string) => list?.find((x) => x.name === n)?.id;
    for (const k of SKILL_KEYS) skillIds[k] = byName(r.inventory_types, SKILL_NAMES[k]) ?? skillIds[k];
    npcIds = {
      faction: byName(r.factions, NPC_NAMES.faction) ?? npcIds.faction,
      corp: byName(r.corporations, NPC_NAMES.corp) ?? npcIds.corp,
    };
  } catch { /* fall back to known IDs */ }
  return { skillIds, npcIds };
}

type RawSkill = { skill_id: number; active_skill_level: number; trained_skill_level: number };

type RawAsset = { type_id: number; quantity: number; location_id: number; location_flag: string; location_type: string };

/**
 * Count what the character is holding, per item.
 *
 * ESI reports an item's location as whatever contains it, so anything inside a can or a ship is
 * listed against that container's id rather than a station. Those cannot be attributed to a place,
 * so they are counted separately and reported rather than quietly folded in.
 */
function countStock(raw: RawAsset[]): Stock {
  const jita: Record<number, number> = {};
  const total: Record<number, number> = {};
  const stations = new Set(raw.filter((a) => a.location_type === 'station').map((a) => a.location_id));
  let inContainers = 0;
  for (const a of raw) {
    total[a.type_id] = (total[a.type_id] ?? 0) + a.quantity;
    if (a.location_id === JITA_44 && a.location_flag === 'Hangar') {
      jita[a.type_id] = (jita[a.type_id] ?? 0) + a.quantity;
    } else if (a.location_type === 'item' && !stations.has(a.location_id)) {
      inContainers += a.quantity;
    }
  }
  return { at: new Date().toISOString(), jita, total, inContainers };
}

/**
 * ESI has no clone-state field, but Alpha clones have skills whose active level is below the trained level.
 * If none are capped and a trade skill is active above the Alpha cap, the character is Omega. Otherwise we can't tell.
 */
function detectClone(all: RawSkill[], ids: Record<SkillKey, number>): 'alpha' | 'omega' | undefined {
  if (all.some((x) => x.active_skill_level < x.trained_skill_level)) return 'alpha';
  const aboveCap = SKILL_KEYS.some((k) => {
    const sk = all.find((x) => x.skill_id === ids[k]);
    return sk ? sk.active_skill_level > ALPHA_CAPS[k] : false;
  });
  return aboveCap ? 'omega' : undefined;
}

/** Pulls skills, standings, wallet transactions, fee journal entries and orders, and merges them into local storage. */
export async function syncCharacter(): Promise<void> {
  const auth = getAuth();
  if (!auth || state.running) return;
  const cid = auth.characterId;
  setState({ running: true, error: null, message: 'Starting sync…' });
  try {
    // Read once for the diffing below, but never write this snapshot back: the sync spends tens of
    // seconds on the network, and anything the user does meanwhile lives in the live store, not here.
    const d = getData();
    const { skillIds, npcIds } = await ensureIds(d);
    const metaPatch: Partial<Meta> = { skillIds, npcIds };
    /** Only the settings the character owns. Everything else the user controls and we must not touch. */
    let fromChar: Partial<Settings> | null = null;
    let allSkills: Record<number, number> | null = null;

    if (d.settings.fromCharacter) {
      const s: Partial<Settings> = {};
      if (hasScope(SKILLS)) {
        setState({ message: 'Reading skills…' });
        const { data } = await esi<{ skills: RawSkill[]; total_sp?: number }>(`/characters/${cid}/skills/`, { auth: true });
        // Store trained levels; Alpha caps are applied when rates are worked out.
        for (const k of SKILL_KEYS) s[k] = data.skills.find((x) => x.skill_id === skillIds[k])?.trained_skill_level ?? 0;
        // Keep the lot. The side hustles ask about hauling, planets and tanking skills, and this
        // response already holds every one of them --- fetching it again per page would be silly.
        allSkills = Object.fromEntries(data.skills.map((x) => [x.skill_id, x.trained_skill_level]));
        if (data.total_sp != null) metaPatch.totalSp = data.total_sp;
        const clone = detectClone(data.skills, skillIds);
        if (clone) { s.clone = clone; metaPatch.cloneDetected = clone; }
      }
      if (hasScope(STANDINGS)) {
        setState({ message: 'Reading standings…' });
        const { data } = await esi<{ from_id: number; standing: number }[]>(`/characters/${cid}/standings/`, { auth: true });
        s.faction = Math.max(0, data.find((x) => x.from_id === npcIds.faction)?.standing ?? 0);
        s.corp = Math.max(0, data.find((x) => x.from_id === npcIds.corp)?.standing ?? 0);
      }
      fromChar = s;
    }

    // ESI caches server-side, so it tells us exactly when each route can hold something new.
    // The soonest of those is when it is worth asking again; anything earlier returns the same body.
    let soonest = Infinity;
    let tradesAt: number | null = null;
    const noteExpiry = (at: number | null) => { if (at != null) soonest = Math.min(soonest, at); };

    let added = 0;
    const fetched: { txs?: Record<string, Tx>; journal?: Record<string, JournalEntry>; orders?: Record<string, Order>; names?: Record<number, string>; stock?: Stock } = {};
    if (hasScope(WALLET)) {
      setState({ message: 'Reading wallet balance…' });
      const { data: balance } = await esi<number>(`/characters/${cid}/wallet/`, { auth: true });
      metaPatch.walletBalance = balance;
      metaPatch.walletAt = new Date().toISOString();

      setState({ message: 'Reading wallet transactions…' });
      const txs: Record<string, Tx> = {};
      let fromId: number | undefined;
      for (let loop = 0; loop < 10; loop++) {
        const { data, expires } = await esi<RawTx[]>(`/characters/${cid}/wallet/transactions/`, { auth: true, query: { from_id: fromId } });
        // The first page is the live one; later pages walk back through history.
        if (fromId === undefined) { noteExpiry(expires); tradesAt = expires; }
        if (!data.length) break;
        let fresh = 0;
        for (const t of data) {
          const id = String(t.transaction_id);
          if (!d.txs[id]) fresh++;
          txs[id] = {
            id, source: 'esi', typeId: t.type_id, date: t.date, isBuy: t.is_buy,
            qty: t.quantity, unitPrice: t.unit_price, locationId: t.location_id,
          };
        }
        const minId = Math.min(...data.map((t) => t.transaction_id));
        if (fresh === 0 || data.length < 500 || (fromId !== undefined && minId >= fromId)) break;
        fromId = minId - 1;
      }
      fetched.txs = txs;

      setState({ message: 'Reading fees and tax from your wallet journal…' });
      const raw = await esiAllPages<RawJournal>(`/characters/${cid}/wallet/journal/`, { auth: true });
      const journal: Record<string, JournalEntry> = {};
      for (const j of raw) {
        if (j.ref_type !== 'brokers_fee' && j.ref_type !== 'transaction_tax') continue;
        journal[String(j.id)] = {
          id: String(j.id), date: j.date, refType: j.ref_type, amount: j.amount ?? 0,
          contextId: j.context_id, contextIdType: j.context_id_type,
        };
      }
      fetched.journal = journal;
    }

    if (hasScope(ORDERS)) {
      setState({ message: 'Reading your market orders…' });
      const orders: Record<string, Order> = {};
      const [openRes, hist] = await Promise.all([
        esi<RawCharOrder[]>(`/characters/${cid}/orders/`, { auth: true }),
        esiAllPages<RawCharOrder>(`/characters/${cid}/orders/history/`, { auth: true }),
      ]);
      const open = openRes.data;
      noteExpiry(openRes.expires);
      hist.forEach((o) => (orders[String(o.order_id)] = toOrder(o, 'closed')));
      open.forEach((o) => (orders[String(o.order_id)] = toOrder(o, 'open')));
      fetched.orders = orders;
    }

    if (hasScope(ASSETS)) {
      setState({ message: 'Reading what you\u2019re holding\u2026' });
      try {
        const raw = await esiAllPages<RawAsset>(`/characters/${cid}/assets/`, { auth: true });
        fetched.stock = countStock(raw);
      } catch { /* stock is a cross-check, not the ledger: a failure here must not fail the sync */ }
    }

    const allTypeIds = [
      ...Object.values(fetched.txs ?? d.txs).map((t) => t.typeId),
      ...Object.values(fetched.orders ?? d.orders).map((o) => o.typeId),
    ];
    const missing = [...new Set(allTypeIds)].filter((id) => !d.names[id]);
    if (missing.length) {
      setState({ message: 'Looking up item names…' });
      try { fetched.names = await resolveNames(missing); } catch { /* names are cosmetic */ }
    }

    metaPatch.lastSync = new Date().toISOString();
    metaPatch.nextSyncAt = Number.isFinite(soonest) ? new Date(soonest).toISOString() : undefined;
    metaPatch.tradesFreshAt = tradesAt != null ? new Date(tradesAt).toISOString() : undefined;
    metaPatch.lastSyncError = undefined;
    metaPatch.syncedCharacterId = cid;

    // Merge onto whatever the store holds NOW. Writing the snapshot back would erase a trade added
    // by hand, a row excluded, or a setting changed while the sync was in flight.
    update((cur) => {
      const p: Partial<Data> = { meta: { ...cur.meta, ...metaPatch } };
      if (fetched.txs) {
        added = Object.keys(fetched.txs).filter((id) => !cur.txs[id]).length;
        p.txs = { ...cur.txs, ...fetched.txs };
      }
      if (fetched.journal) p.journal = { ...cur.journal, ...fetched.journal };
      if (fetched.orders) p.orders = { ...cur.orders, ...fetched.orders };
      if (fetched.names) p.names = { ...cur.names, ...fetched.names };
      if (allSkills) p.skills = allSkills;
      // Replaced wholesale, not merged: it is a snapshot of what you hold right now.
      if (fetched.stock) p.stock = fetched.stock;
      if (fromChar) p.settings = sanitizeSettings({ ...cur.settings, ...fromChar });
      return p;
    });
    // From the first successful sync on, rate changes (like going Omega) are kept as history.
    if (getData().meta.rateSeededAt) update((x) => ({ meta: { ...x.meta, rateSeededAt: undefined } }));
    setState({ running: false, message: '', lastAdded: added });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Back off, or the minute-by-minute scheduler retries a failing sync forever.
    const retryAt = new Date(Date.now() + RETRY_AFTER_FAIL_MS).toISOString();
    update((x) => ({ meta: { ...x.meta, lastSyncError: msg, nextSyncAt: retryAt } }));
    setState({ running: false, message: '', error: msg });
  }
}
