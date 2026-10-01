import { useSyncExternalStore } from 'react';
import { getAuth, hasScope } from './auth';
import { esi, esiAllPages } from './esi';
import { ALPHA_CAPS, JITA_44, NPC_FALLBACK_IDS, NPC_NAMES, SCOPE, SKILL_FALLBACK_IDS, SKILL_NAMES, type SkillKey } from './config';
import { parseSafetyNotice, withNotices } from './assetSafety';
import { isStation, isStructure, structureInfo } from './universe';
import { couriersDue, itemsToRead, readContracts, type ContractItem, type RawContract } from './contracts';
import { readJoinedJobs } from './freelanceStore';
import { readCorp } from './freelance';
import { loyaltyPoints, resolveIds, resolveNames } from './market';
import { dataGeneration, getData, update, type Data } from './store';
import { sanitizeSettings, type Settings } from './fees';
import { readKillmail, type RawKillmail } from './combat';
import type { JournalEntry, Killmail, Meta, Order, Stock, Tx } from './types';
import { mergeOrders } from './feeMatch';
import { countStock, mergeSafety, nameHolders, unnamedHolders, toJournal, toOrder, toTx, type RawAsset, type RawCharOrder, type RawJournal, type RawTx, type SafetyNotice } from './esiRecords';
import { miningKey, readMining, type MiningRecord, type RawMining } from './mining';

const { wallet: WALLET, orders: ORDERS, skills: SKILLS, standings: STANDINGS, assets: ASSETS, loyalty: LOYALTY, killmails: KILLMAILS } = SCOPE;

/** How long to wait after a failed sync before trying again. */
const RETRY_AFTER_FAIL_MS = 5 * 60_000;

type SyncState = { running: boolean; message: string; error: string | null; lastAdded: number | null };
let state: SyncState = { running: false, message: '', error: null, lastAdded: null };
const listeners = new Set<() => void>();
function setState(p: Partial<SyncState>) { state = { ...state, ...p }; listeners.forEach((l) => l()); }
export function useSyncState(): SyncState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}
export function getSyncState(): SyncState { return state; }

// ESI's shapes and their conversion into records live in esiRecords.ts, shared with the cloud Worker.
export { toJournal, countStock } from './esiRecords';

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

type RawSkill = { skill_id: number; active_skill_level: number; trained_skill_level: number; skillpoints_in_skill?: number };


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

/**
 * Just the wallet balance, which ESI refreshes every 2 minutes. The header shows it as your ISK in game, but a full
 * sync only runs when orders (20 min) or trades (1 h) are due, so it could lag the game by up to an hour with nothing
 * to say so: the user read 2,367,154 there while the cloud already held 17,888,941 from a newer sync, and took it
 * for their overall value. Skipped while a full sync is running, which reads it anyway.
 */
export async function refreshBalance(): Promise<void> {
  const auth = getAuth();
  if (!auth || state.running || !hasScope(WALLET)) return;
  const { data: balance } = await esi<number>(`/characters/${auth.characterId}/wallet/`, { auth: true });
  if (!Number.isFinite(balance)) return;
  // Unchanged and read in the last 10 minutes: nothing worth writing (every write goes to the cloud too).
  const was = getData().meta;
  if (was.walletBalance === balance && was.walletAt && Date.now() - Date.parse(was.walletAt) < 10 * 60_000) return;
  const at = new Date().toISOString();
  update((x) => ({ meta: { ...x.meta, walletBalance: balance, walletAt: at } }));
}

/** Pulls skills, standings, wallet transactions, the whole wallet journal and orders, and merges them into local storage. */
export async function syncCharacter(): Promise<void> {
  const auth = getAuth();
  if (!auth || state.running) return;
  const cid = auth.characterId;
  const gen = dataGeneration();
  setState({ running: true, error: null, message: 'Starting sync…' });
  const read: string[] = [];
  try {
    // Read once for the diffing below, but never write this snapshot back: the sync spends tens of
    // seconds on the network, and anything the user does meanwhile lives in the live store, not here.
    const d = getData();
    const { skillIds, npcIds } = await ensureIds(d);
    const metaPatch: Partial<Meta> = { skillIds, npcIds };
    const expiries: NonNullable<Meta['expiries']> = {};
    const keep = (k: keyof NonNullable<Meta['expiries']>) => (at: number | null) => { if (at != null) expiries[k] = new Date(at).toISOString(); };
    /** Only the settings the character owns. Everything else the user controls and we must not touch. */
    let fromChar: Partial<Settings> | null = null;
    let allSkills: Record<number, number> | null = null;

    if (hasScope(SKILLS)) {
      setState({ message: 'Reading skills…' });
      const { data, expires: skillsAt } = await esi<{ skills: RawSkill[]; total_sp?: number }>(`/characters/${cid}/skills/`, { auth: true });
      // Keep the lot. The side hustles ask about hauling, planets and tanking skills, and this
      // response already holds every one of them --- fetching it again per page would be silly.
      allSkills = Object.fromEntries(data.skills.map((x) => [x.skill_id, x.trained_skill_level]));
      metaPatch.skillSp = Object.fromEntries(data.skills.map((x) => [x.skill_id, x.skillpoints_in_skill ?? 0]));
      if (data.total_sp != null) metaPatch.totalSp = data.total_sp;
      read.push('skills');
      keep('skills')(skillsAt);
      // The queue, for what a trade skill about to finish will do to your fees and slots (skillQueue.ts).
      if (hasScope(SCOPE.skillqueue)) {
        try {
          const { data: q } = await esi<{
            skill_id: number; finished_level: number; finish_date?: string; start_date?: string; queue_position: number;
            training_start_sp?: number; level_start_sp?: number; level_end_sp?: number;
          }[]>(`/characters/${cid}/skillqueue/`, { auth: true });
          // With the start and the points, the level in training can show how far through it is (skillStatus.ts).
          metaPatch.skillQueue = [...q].sort((a, b) => a.queue_position - b.queue_position).map((x) => ({
            skillId: x.skill_id, level: x.finished_level, finish: x.finish_date ?? null, start: x.start_date ?? null,
            trainingStartSp: x.training_start_sp, levelStartSp: x.level_start_sp, levelEndSp: x.level_end_sp,
          }));
        } catch { /* the queue is a preview; the sync does not hang on it */ }
      }
      try {
        const { data: at } = await esi<Meta['attributes']>(`/characters/${cid}/attributes/`, { auth: true });
        if (at) metaPatch.attributes = { intelligence: at.intelligence, memory: at.memory, perception: at.perception, willpower: at.willpower, charisma: at.charisma };
      } catch { /* training time is a nicety; the sync does not hang on it */ }
      if (d.settings.fromCharacter) {
        const s: Partial<Settings> = {};
        // Store trained levels; Alpha caps are applied when rates are worked out.
        for (const k of SKILL_KEYS) s[k] = data.skills.find((x) => x.skill_id === skillIds[k])?.trained_skill_level ?? 0;
        const clone = detectClone(data.skills, skillIds);
        if (clone) { s.clone = clone; metaPatch.cloneDetected = clone; }
        fromChar = s;
      }
    }
    if (d.settings.fromCharacter && hasScope(STANDINGS)) {
      setState({ message: 'Reading standings…' });
      const { data } = await esi<{ from_id: number; standing: number }[]>(`/characters/${cid}/standings/`, { auth: true });
      fromChar = {
        ...(fromChar ?? {}),
        faction: Math.max(0, data.find((x) => x.from_id === npcIds.faction)?.standing ?? 0),
        corp: Math.max(0, data.find((x) => x.from_id === npcIds.corp)?.standing ?? 0),
      };
      read.push('standings');
    }

    // ESI caches server-side, so it tells us exactly when each route can hold something new.
    // The soonest of those is when it is worth asking again; anything earlier returns the same body.
    let soonest = Infinity;
    let tradesAt: number | null = null;
    const noteExpiry = (at: number | null) => { if (at != null) soonest = Math.min(soonest, at); };

    let added = 0;
    const fetched: {
      txs?: Record<string, Tx>; journal?: Record<string, JournalEntry>; orders?: Record<string, Order>;
      names?: Record<number, string>; stock?: Stock; killmails?: Record<string, Killmail>; mining?: Record<string, MiningRecord>;
    } = {};
    if (hasScope(WALLET)) {
      setState({ message: 'Reading wallet balance…' });
      const { data: balance, expires: walletAt } = await esi<number>(`/characters/${cid}/wallet/`, { auth: true });
      keep('wallet')(walletAt);
      metaPatch.walletBalance = balance;
      metaPatch.walletAt = new Date().toISOString();

      setState({ message: 'Reading wallet transactions…' });
      const txs: Record<string, Tx> = {};
      let fromId: number | undefined;
      for (let loop = 0; loop < 10; loop++) {
        const { data, expires } = await esi<RawTx[]>(`/characters/${cid}/wallet/transactions/`, { auth: true, query: { from_id: fromId } });
        // The first page is the live one; later pages walk back through history.
        if (fromId === undefined) { noteExpiry(expires); tradesAt = expires; keep('transactions')(expires); }
        if (!data.length) break;
        let fresh = 0;
        for (const t of data) {
          const id = String(t.transaction_id);
          if (!d.txs[id]) fresh++;
          txs[id] = toTx(t);
        }
        const minId = Math.min(...data.map((t) => t.transaction_id));
        if (fresh === 0 || data.length < 500 || (fromId !== undefined && minId >= fromId)) break;
        fromId = minId - 1;
      }
      fetched.txs = txs;

      // The whole journal, not just fees and tax: every entry carries the balance after it, which is
      // what the Wallet page draws, and the rest is where the money actually came from and went.
      setState({ message: 'Reading your wallet journal…' });
      const raw = await esiAllPages<RawJournal>(`/characters/${cid}/wallet/journal/`, { auth: true, onExpires: keep('journal') });
      const journal: Record<string, JournalEntry> = {};
      for (const j of raw) journal[String(j.id)] = toJournal(j);
      fetched.journal = journal;
      read.push('wallet', 'journal');
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
      keep('orders')(openRes.expires);
      hist.forEach((o) => (orders[String(o.order_id)] = toOrder(o, 'closed')));
      open.forEach((o) => (orders[String(o.order_id)] = toOrder(o, 'open')));
      fetched.orders = orders;
      read.push('orders');
    }

    if (hasScope(ASSETS)) {
      setState({ message: 'Reading what you’re holding…' });
      try {
        const raw = await esiAllPages<RawAsset>(`/characters/${cid}/assets/`, { auth: true, onExpires: keep('assets') });
        fetched.stock = countStock(raw, JITA_44);
        // The containers and ships in an asset safety wrap, by the names you gave them. (The wrap itself has none in
        // ESI: it answers "None", not the lost structure's name the client shows.)
        const holders = unnamedHolders(getData().stock?.safety, fetched.stock.safety);
        if (holders.length) {
          try {
            const { data } = await esi<{ item_id: number; name: string }[]>(`/characters/${cid}/assets/names/`, { auth: true, method: 'POST', body: holders });
            fetched.stock.safety = nameHolders(fetched.stock.safety!, new Map(data.map((n) => [n.item_id, n.name])));
          } catch { /* named on a later sync */ }
        }
        read.push('assets');
      } catch { /* stock is a cross-check, not the ledger: a failure here must not fail the sync */ }
    }
    // Your contracts: couriers to deliver (To do), and the items of item exchanges you sold or bought (the Wallet).
    if (hasScope(SCOPE.contracts)) {
      try {
        const list = readContracts(await esiAllPages<RawContract>(`/characters/${cid}/contracts/`, { auth: true }));
        const prev = d.meta.contracts;
        const items: Record<number, ContractItem[]> = { ...(prev?.items ?? {}) };
        for (const id of itemsToRead(list, cid, items)) {
          try {
            const { data } = await esi<{ type_id: number; quantity: number; is_included: boolean }[]>(`/characters/${cid}/contracts/${id}/items/`, { auth: true });
            items[id] = data.map((i) => ({ typeId: i.type_id, qty: i.quantity, included: i.is_included }));
          } catch { /* read on a later sync */ }
        }
        // Keep the newest 500 contracts' items: a contract's journal entries stay findable, the doc stays small.
        const keepIds = Object.keys(items).map(Number).sort((a, b) => b - a).slice(0, 500);
        const places: Record<number, string> = { ...(prev?.places ?? {}) };
        const dests = [...new Set(couriersDue(list, cid).flatMap((c) => [c.contract.end, c.contract.start]).filter((x): x is number => x != null))].filter((id) => !places[id]);
        if (dests.filter(isStation).length) Object.assign(places, await resolveNames(dests.filter(isStation)).catch(() => ({})));
        for (const id of dests.filter(isStructure)) { const s = await structureInfo(id).catch(() => null); if (s?.status === 'found') places[id] = s.name; }
        metaPatch.contracts = { at: new Date().toISOString(), list, items: Object.fromEntries(keepIds.map((id) => [id, items[id]])), places };
        read.push('contracts');
      } catch { /* the Wallet and To do go without */ }
    }
    // The freelance jobs you've joined, for the Wallet and Results to count their rewards against what their items cost.
    if (hasScope(SCOPE.freelance)) {
      try { metaPatch.freelance = { at: new Date().toISOString(), jobs: await readJoinedJobs(cid) }; read.push('freelance'); }
      catch { /* read on a later sync */ }
    }
    // Your corporation and its tax rate, both public, so read whatever was granted: rewards are paid after the tax, and
    // the Freelance finder prices a job after it. The corporation comes from the affiliation lookup, a POST (never kept in
    // the browser's cache) that ESI holds an hour at most: /characters/{id}/ answers `max-age=86400`, which would show the
    // corporation you left for a day. The rate is asked for afresh (a conditional request), so a change shows on the next
    // sync after ESI's own copy lets go. On a failure the last one read stays.
    try {
      const { data: aff } = await esi<{ character_id: number; corporation_id: number }[]>('/characters/affiliation/', { method: 'POST', body: [cid] });
      const mine = aff.find((a) => a.character_id === cid);
      if (mine) {
        const { data: co } = await esi<{ name: string; ticker: string; tax_rate: number }>(`/corporations/${mine.corporation_id}/`, { fresh: true });
        const corp = readCorp(mine, co, new Date().toISOString());
        if (corp) { metaPatch.corp = corp; read.push('corporation'); }
      }
    } catch { /* the finder keeps the last rate read, or says it isn't read yet */ }
    // The mining ledger (mining.ts): 30 days from ESI, kept as records so they outlive them.
    if (hasScope(SCOPE.mining)) {
      try {
        const raw = await esiAllPages<RawMining>(`/characters/${cid}/mining/`, { auth: true });
        fetched.mining = Object.fromEntries(readMining(raw, cid).map((r) => [miningKey(r), r]));
        read.push('mining');
      } catch { /* read on a later sync */ }
    }
    // Industry jobs not yet delivered, with their facilities named, for To do (todo.ts, judgeIndustry).
    if (hasScope(SCOPE.industry)) {
      try {
        const { data } = await esi<{ job_id: number; activity_id: number; blueprint_type_id: number; product_type_id?: number; runs: number; end_date: string; status: string; station_id: number; facility_id: number }[]>(`/characters/${cid}/industry/jobs/`, { auth: true });
        const jobs = data.filter((j) => j.status === 'active' || j.status === 'ready' || j.status === 'paused').map((j) => ({
          jobId: j.job_id, activity: j.activity_id, blueprintTypeId: j.blueprint_type_id, productTypeId: j.product_type_id ?? null, runs: j.runs,
          end: j.end_date, status: j.status, stationId: j.station_id ?? j.facility_id,
        }));
        const places: Record<number, string> = { ...(d.meta.industry?.places ?? {}) };
        const unknown = [...new Set(jobs.map((j) => j.stationId))].filter((id) => !places[id]);
        const stations = unknown.filter(isStation);
        if (stations.length) Object.assign(places, await resolveNames(stations).catch(() => ({})));
        for (const id of unknown.filter(isStructure)) { const s = await structureInfo(id).catch(() => null); if (s?.status === 'found') places[id] = s.name; }
        metaPatch.industry = { at: new Date().toISOString(), jobs, places };
        read.push('industry');
      } catch { /* To do goes without */ }
    }
    // EVE's notification when things went into asset safety: the dates to the second, the structure and the destination.
    // Only with the notifications permission, and only worth asking while a wrap waits.
    let notices: SafetyNotice[] = [];
    if (hasScope(SCOPE.notifications) && (fetched.stock?.safety ?? d.stock?.safety ?? []).some((w) => w.state === 'waiting')) {
      try {
        const { data } = await esi<{ type: string; timestamp: string; text?: string }[]>(`/characters/${cid}/notifications/`, { auth: true });
        notices = data.map(parseSafetyNotice).filter((n): n is SafetyNotice => n != null);
        read.push('notifications');
      } catch { /* the countdown falls back to what's typed or seen */ }
    }

    if (hasScope(LOYALTY)) {
      try {
        metaPatch.lpBalances = await loyaltyPoints(cid);
        read.push('loyalty');
      } catch { /* balances are shown where they are used; a failure here is not a failed sync */ }
    }

    if (hasScope(KILLMAILS)) {
      setState({ message: 'Reading your killmails…' });
      try {
        const recent = await esiAllPages<{ killmail_id: number; killmail_hash: string }>(`/characters/${cid}/killmails/recent/`, { auth: true, onExpires: keep('killmails') });
        const missing = recent.filter((k) => !d.killmails[String(k.killmail_id)]).slice(0, 200);
        const got: Record<string, Killmail> = {};
        let i = 0;
        await Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
          while (i < missing.length) {
            const k = missing[i++];
            try {
              // Killmails are public and never change once written, so the detail route needs no login.
              const { data } = await esi<RawKillmail>(`/killmails/${k.killmail_id}/${k.killmail_hash}/`);
              got[String(k.killmail_id)] = readKillmail(data, k.killmail_hash, cid);
            } catch { /* picked up on the next sync */ }
          }
        }));
        fetched.killmails = got;
        metaPatch.killmailsAt = new Date().toISOString();
        read.push('killmails');
      } catch { /* combat is a side page; its failure must not fail the sync */ }
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

    // Everything was wiped while this was in flight: writing now would put it all back.
    if (dataGeneration() !== gen) { setState({ running: false, message: '' }); return; }

    metaPatch.lastSync = new Date().toISOString();
    metaPatch.nextSyncAt = Number.isFinite(soonest) ? new Date(soonest).toISOString() : undefined;
    metaPatch.tradesFreshAt = tradesAt != null ? new Date(tradesAt).toISOString() : undefined;
    metaPatch.lastSyncError = undefined;
    metaPatch.syncedCharacterId = cid;
    metaPatch.expiries = { ...d.meta.expiries, ...expiries };

    // Merge onto whatever the store holds NOW. Writing the snapshot back would erase a trade added
    // by hand, a row excluded, or a setting changed while the sync was in flight.
    update((cur) => {
      added = fetched.txs ? Object.keys(fetched.txs).filter((id) => !cur.txs[id]).length : 0;
      const log = [{ at: metaPatch.lastSync!, what: read.join(', ') || 'nothing permitted', ok: true, added }, ...(cur.meta.syncLog ?? [])].slice(0, 12);
      const p: Partial<Data> = { meta: { ...cur.meta, ...metaPatch, syncLog: log } };
      if (fetched.txs) p.txs = { ...cur.txs, ...fetched.txs };
      if (fetched.journal) p.journal = { ...cur.journal, ...fetched.journal };
      // Each order keeps the versions seen before, so a price change shows up as its own event with the
      // time its fee was charged (see feeMatch.ts).
      if (fetched.orders) p.orders = mergeOrders(cur.orders, fetched.orders);
      if (fetched.names) p.names = { ...cur.names, ...fetched.names };
      if (fetched.killmails && Object.keys(fetched.killmails).length) p.killmails = { ...cur.killmails, ...fetched.killmails };
      // A day's row grows as you mine; a row unchanged keeps its record, so nothing is pushed again for it.
      if (fetched.mining && Object.keys(fetched.mining).length) {
        const m = { ...cur.mining };
        for (const [k, r] of Object.entries(fetched.mining)) if (m[k]?.qty !== r.qty) m[k] = r;
        p.mining = m;
      }
      if (allSkills) p.skills = allSkills;
      // Replaced wholesale, not merged: it is a snapshot of what you hold right now.
      // What the cloud learned about asset safety wraps (when each went in, its name) is kept, not overwritten.
      if (fetched.stock) p.stock = { ...fetched.stock, safety: withNotices(mergeSafety(cur.stock?.safety, fetched.stock.safety), notices, Date.now()) };
      else if (notices.length && cur.stock?.safety) {
        const safety = withNotices(cur.stock.safety, notices, Date.now());
        if (safety !== cur.stock.safety) p.stock = { ...cur.stock, safety };
      }
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
    if (dataGeneration() === gen) {
      update((x) => ({
        meta: {
          ...x.meta, lastSyncError: msg, nextSyncAt: retryAt,
          syncLog: [{ at: new Date().toISOString(), what: read.join(', ') || 'nothing', ok: false, error: msg }, ...(x.meta.syncLog ?? [])].slice(0, 12),
        },
      }));
    }
    setState({ running: false, message: '', error: msg });
  }
}
