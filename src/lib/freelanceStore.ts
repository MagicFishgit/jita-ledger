/**
 * Your freelance history, read from ESI: every job a reward in your journal names (its public details, with the app's
 * X-Compatibility-Date, which a finished job needs), every job on your joined list (esi-characters.read_freelance_jobs.v1,
 * with your participation), and the corporations you were in while they paid, for working out a reward's tax when the
 * journal doesn't give it. The sync keeps it in `meta.freelance` for the Wallet, Results and the Freelance tab, which
 * reads it again when it opens. I/O; the rules are in freelance.ts.
 */
import { get, set } from 'idb-keyval';
import { esi } from './esi';
import { corpSpans, historyFrom, jobFromDetail, mergeJobs, rewardJob, rewardJobName, stubJob, withRead, type CorpSpan, type JoinedJob, type RawCorpFounded, type RawFreelanceJob } from './freelance';
import { pool } from './lootMarket';
import { cacheStore, getData, update } from './store';
import { groupTypes } from './universe';

const kept = new Map<string, RawFreelanceJob>();
const going = new Map<string, Promise<RawFreelanceJob | null>>();
/**
 * A job's public details, or null when ESI won't give them (gone, or failing). A finished job's never change, so they're
 * kept in this browser for good and read once; a running job's are read afresh. Two asks at once share one read.
 */
export function jobDetail(id: string): Promise<RawFreelanceJob | null> {
  const hit = kept.get(id);
  if (hit) return Promise.resolve(hit);
  let p = going.get(id);
  if (!p) {
    p = (async () => {
      const key = `freelance-job:${id}`;
      const stored = (await get(key, cacheStore).catch(() => undefined)) as RawFreelanceJob | undefined;
      if (stored) { kept.set(id, stored); return stored; }
      const data = await esi<RawFreelanceJob>(`/freelance-jobs/${id}`).then((r) => r.data).catch(() => null);
      if (data && data.state !== 'Active') {
        // Kept without the description: the history never shows it, and some run to kilobytes of markup.
        const slim = { ...data, details: data.details ? { ...data.details, description: undefined } : undefined } as RawFreelanceJob;
        kept.set(id, slim);
        await set(key, slim, cacheStore).catch(() => undefined);
      }
      return data;
    })().finally(() => going.delete(id));
    going.set(id, p);
  }
  return p;
}

/**
 * Every job you took part in: those your journal's rewards name and those ESI lists as joined, added to what was known
 * (`known`), never replaced by the current list. A finished job read whole is kept as it is, with no request; a job ESI
 * won't describe is kept as it was read before, or by its rewards' name. `joinedToo`: the freelance permission is
 * granted, so the joined list and your part in each are read.
 */
export async function readJobHistory(characterId: number, journal: Iterable<{ refType: string; reason?: string }>, known: JoinedJob[], joinedToo: boolean): Promise<JoinedJob[]> {
  let listed: Map<string, { id: string; name: string; state: string }> | null = null;
  if (joinedToo) {
    try {
      const { data } = await esi<{ freelance_jobs: { id: string; name: string; state: string }[] }>(`/characters/${characterId}/freelance-jobs`, { auth: true });
      listed = new Map((data.freelance_jobs ?? []).map((j) => [j.id, j]));
    } catch { /* the joined list is read on a later try; the history stands */ }
  }
  const named = new Map<string, string>();
  for (const e of journal) {
    if (e.refType !== 'freelance_jobs_reward') continue;
    const id = rewardJob(e.reason);
    if (id && !named.has(id)) named.set(id, rewardJobName(e.reason) ?? '');
  }
  const had = new Map(known.map((j) => [j.id, j]));
  const ids = [...new Set([...had.keys(), ...named.keys(), ...(listed?.keys() ?? [])])];
  const out: JoinedJob[] = [];
  await pool(ids, 4, async (id) => {
    const before = had.get(id);
    const onList = listed?.get(id);
    const joined = listed ? !!onList : before?.joined;
    // A finished job read whole doesn't change: no request.
    if (before && before.described !== false && before.state !== 'Active' && before.state !== 'Unknown' && 'finished' in before && !onList) {
      out.push(joined === before.joined ? before : { ...before, joined });
      return;
    }
    const [detail, part] = await Promise.all([
      jobDetail(id),
      onList ? esi<{ contributed: number; state: string }>(`/characters/${characterId}/freelance-jobs/${id}/participation`, { auth: true }).then((r) => r.data).catch(() => null) : null,
    ]);
    if (!detail) {
      out.push(before ? { ...before, ...(joined != null ? { joined } : {}) } : { ...stubJob(id, onList?.name ?? named.get(id) ?? ''), ...(joined != null ? { joined } : {}) });
      return;
    }
    const it = detail.configuration?.parameters?.corporation_item_delivery?.corporation_item_delivery?.item_type?.values?.[0];
    const ids = (it?.values ?? []).map(Number).filter((n) => n > 0);
    const types = it?.value_type === 'item_group' ? (await Promise.all(ids.map((g) => groupTypes(g).catch(() => [] as number[])))).flat() : ids;
    out.push(jobFromDetail(detail, types, {
      standing: part?.state ?? before?.standing, delivered: part?.contributed ?? before?.delivered, joined: !!joined,
    }));
  });
  return mergeJobs(known, out);
}

/**
 * The corporations you were in since `since` (freelance.ts `corpSpans`): ESI's public corporation history, and each
 * corporation's answer for its tax. `current`: this sync's affiliation read and its corporation's answer, else the last
 * one kept.
 */
export async function readCorpSpans(characterId: number, since: number, current: { id: number; body: RawCorpFounded } | null): Promise<CorpSpan[]> {
  const { data } = await esi<{ corporation_id: number; start_date: string }[]>(`/characters/${characterId}/corporationhistory/`, { fresh: true });
  const bodies = new Map<number, RawCorpFounded | null>();
  await Promise.all([...new Set(historyFrom(data, since).map((h) => h.corporation_id))].filter((id) => id !== current?.id).map(async (id) => {
    bodies.set(id, await esi<RawCorpFounded>(`/corporations/${id}/`).then((r) => r.data).catch(() => null));
  }));
  return corpSpans(characterId, data, since, bodies, current);
}

/**
 * Your corporation now and its answer for its tax, both public: the affiliation lookup, a POST (never kept in the
 * browser's cache) that ESI holds an hour at most (/characters/{id}/ answers `max-age=86400`, which would show the
 * corporation you left for a day), then the corporation, asked afresh. Null when either read fails.
 */
export async function readCurrentCorp(characterId: number): Promise<{ affiliation: { character_id: number; corporation_id: number }; body: RawCorpFounded } | null> {
  const { data: aff } = await esi<{ character_id: number; corporation_id: number }[]>('/characters/affiliation/', { method: 'POST', body: [characterId] });
  const mine = aff.find((a) => a.character_id === characterId);
  if (!mine) return null;
  const { data: body } = await esi<RawCorpFounded>(`/corporations/${mine.corporation_id}/`, { fresh: true });
  return { affiliation: mine, body };
}

/** The earliest reward whose tax the journal doesn't give: what the corporation history has to cover. */
export function untaxedSince(journal: Iterable<{ refType: string; date: string; tax?: number }>): number | null {
  let t: number | null = null;
  for (const e of journal) if (e.refType === 'freelance_jobs_reward' && e.tax == null) { const x = Date.parse(e.date); if (t == null || x < t) t = x; }
  return t;
}

/**
 * The history read again and kept, as the Freelance tab does when it opens: merged with what the store holds now, never
 * a snapshot written back. While a reward's tax isn't in the journal, the corporations you were in are read too, as the
 * sync reads them: left to the sync, a tab opened before the first sync with this code (or on a new device, or after
 * "Delete all data") had the jobs and no corporations, and read "not recorded" on every job and "–" for every total
 * until the sync came round (the user's tab, 2 October 2026). A failed read keeps the corporations already held.
 */
export async function refreshJobHistory(characterId: number, joinedToo: boolean): Promise<void> {
  const d = getData();
  const journal = Object.values(d.journal);
  const jobs = await readJobHistory(characterId, journal, d.meta.freelance?.jobs ?? [], joinedToo);
  const since = untaxedSince(journal);
  let corps: CorpSpan[] | undefined;
  if (since != null) {
    const now = await readCurrentCorp(characterId).then((c) => (c ? { id: c.affiliation.corporation_id, body: c.body } : null)).catch(() => null);
    const kept = d.meta.corp ? { id: d.meta.corp.id, body: { name: d.meta.corp.name, tax_rate: d.meta.corp.taxRate } } : null;
    corps = await readCorpSpans(characterId, since, now ?? kept).catch(() => undefined);
  }
  update((x) => ({ meta: { ...x.meta, freelance: withRead(x.meta.freelance, { at: new Date().toISOString(), jobs, ...(corps ? { corps } : {}) }) } }));
}
