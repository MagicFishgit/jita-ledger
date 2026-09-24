import { useSyncExternalStore } from 'react';
import { getAuth, hasScope } from './auth';
import { esi, esiAllPages } from './esi';
import { ALPHA_CAPS, NPC_FALLBACK_IDS, NPC_NAMES, SCOPES, SKILL_FALLBACK_IDS, SKILL_NAMES, type SkillKey } from './config';
import { resolveIds, resolveNames } from './market';
import { getData, update, type Data } from './store';
import { sanitizeSettings } from './fees';
import type { JournalEntry, Order, Tx } from './types';

const [WALLET, ORDERS, SKILLS, STANDINGS] = SCOPES;

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
    const d = getData();
    const patch: Partial<Data> = {};
    const { skillIds, npcIds } = await ensureIds(d);
    const meta = { ...d.meta, skillIds, npcIds };

    if (d.settings.fromCharacter) {
      const s = { ...d.settings };
      if (hasScope(SKILLS)) {
        setState({ message: 'Reading skills…' });
        const { data } = await esi<{ skills: RawSkill[] }>(`/characters/${cid}/skills/`, { auth: true });
        // Store trained levels; Alpha caps are applied when rates are worked out.
        for (const k of SKILL_KEYS) s[k] = data.skills.find((x) => x.skill_id === skillIds[k])?.trained_skill_level ?? 0;
        const clone = detectClone(data.skills, skillIds);
        if (clone) { s.clone = clone; meta.cloneDetected = clone; }
      }
      if (hasScope(STANDINGS)) {
        setState({ message: 'Reading standings…' });
        const { data } = await esi<{ from_id: number; standing: number }[]>(`/characters/${cid}/standings/`, { auth: true });
        s.faction = Math.max(0, data.find((x) => x.from_id === npcIds.faction)?.standing ?? 0);
        s.corp = Math.max(0, data.find((x) => x.from_id === npcIds.corp)?.standing ?? 0);
      }
      patch.settings = sanitizeSettings(s);
    }

    let added = 0;
    if (hasScope(WALLET)) {
      setState({ message: 'Reading wallet balance…' });
      const { data: balance } = await esi<number>(`/characters/${cid}/wallet/`, { auth: true });
      meta.walletBalance = balance;
      meta.walletAt = new Date().toISOString();

      setState({ message: 'Reading wallet transactions…' });
      const txs: Record<string, Tx> = { ...d.txs };
      let fromId: number | undefined;
      for (let loop = 0; loop < 10; loop++) {
        const { data } = await esi<RawTx[]>(`/characters/${cid}/wallet/transactions/`, { auth: true, query: { from_id: fromId } });
        if (!data.length) break;
        let fresh = 0;
        for (const t of data) {
          const id = String(t.transaction_id);
          if (!txs[id]) { fresh++; added++; }
          txs[id] = {
            id, source: 'esi', typeId: t.type_id, date: t.date, isBuy: t.is_buy,
            qty: t.quantity, unitPrice: t.unit_price, locationId: t.location_id,
          };
        }
        const minId = Math.min(...data.map((t) => t.transaction_id));
        if (fresh === 0 || data.length < 500 || (fromId !== undefined && minId >= fromId)) break;
        fromId = minId - 1;
      }
      patch.txs = txs;

      setState({ message: 'Reading fees and tax from your wallet journal…' });
      const raw = await esiAllPages<RawJournal>(`/characters/${cid}/wallet/journal/`, { auth: true });
      const journal: Record<string, JournalEntry> = { ...d.journal };
      for (const j of raw) {
        if (j.ref_type !== 'brokers_fee' && j.ref_type !== 'transaction_tax') continue;
        journal[String(j.id)] = {
          id: String(j.id), date: j.date, refType: j.ref_type, amount: j.amount ?? 0,
          contextId: j.context_id, contextIdType: j.context_id_type,
        };
      }
      patch.journal = journal;
    }

    if (hasScope(ORDERS)) {
      setState({ message: 'Reading your market orders…' });
      const orders: Record<string, Order> = { ...d.orders };
      const [open, hist] = await Promise.all([
        esi<RawCharOrder[]>(`/characters/${cid}/orders/`, { auth: true }).then((r) => r.data),
        esiAllPages<RawCharOrder>(`/characters/${cid}/orders/history/`, { auth: true }),
      ]);
      hist.forEach((o) => (orders[String(o.order_id)] = toOrder(o, 'closed')));
      open.forEach((o) => (orders[String(o.order_id)] = toOrder(o, 'open')));
      patch.orders = orders;
    }

    const allTypeIds = [
      ...Object.values(patch.txs ?? d.txs).map((t) => t.typeId),
      ...Object.values(patch.orders ?? d.orders).map((o) => o.typeId),
    ];
    const missing = [...new Set(allTypeIds)].filter((id) => !d.names[id]);
    if (missing.length) {
      setState({ message: 'Looking up item names…' });
      try { patch.names = { ...d.names, ...(await resolveNames(missing)) }; } catch { /* names are cosmetic */ }
    }

    meta.lastSync = new Date().toISOString();
    meta.lastSyncError = undefined;
    meta.syncedCharacterId = cid;
    patch.meta = meta;
    update(patch);
    // From the first successful sync on, rate changes (like going Omega) are kept as history.
    if (getData().meta.rateSeededAt) update((x) => ({ meta: { ...x.meta, rateSeededAt: undefined } }));
    setState({ running: false, message: '', lastAdded: added });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    update((d) => ({ meta: { ...d.meta, lastSyncError: msg } }));
    setState({ running: false, message: '', error: msg });
  }
}
