/**
 * An alt's sheet: what the app's own sync reads for the main in the browser, read by the cloud for a character that
 * never logs in to the app. Its skills (the `skills` doc, trained levels, the main's shape) and a `meta` doc with the
 * main's field names (wallet, skill points, queue, attributes, loyalty points, clone state), so the app's own rules
 * read an alt unchanged. Run with the hourly copy (alts.ts), which hands it the wallet and points it already read.
 */
import { ALPHA_SKILL_CAPS } from '../../src/lib/alphaCaps';
import { cloneState, type CloneState } from '../../src/lib/roster';
import { esiGet, readerLogin, stillKept, type Reader } from './eve';
import { push } from './sync';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };

const S = { skills: 'esi-skills.read_skills.v1', queue: 'esi-skills.read_skillqueue.v1' };

type RawSkill = { skill_id: number; trained_skill_level: number; active_skill_level: number; skillpoints_in_skill?: number };
type RawQueue = {
  skill_id: number; finished_level: number; finish_date?: string; start_date?: string; queue_position: number;
  training_start_sp?: number; level_start_sp?: number; level_end_sp?: number;
};
type Attributes = { intelligence: number; memory: number; perception: number; willpower: number; charisma: number };

export type SheetResult = { skills: number; clone: CloneState | null; pushed: number };

async function doc<T>(db: D1Database, charId: number, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT data FROM docs WHERE char_id = ?1 AND key = ?2').bind(charId, key).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as T) : null;
}

/** A meta doc without the time its wallet was read: a read that changed nothing else isn't worth a push. */
const settled = (m: Record<string, unknown>) => JSON.stringify({ ...m, walletAt: '' });

export async function readSheet(
  env: Env, who: Reader, extra: { wallet: number | null; lp: { corporationId: number; points: number }[] | null }, now = Date.now(),
): Promise<SheetResult> {
  const login = await readerLogin(env, who);
  if (!login) throw new Error('No login kept for this character');
  const db = env.DB, token = login.access, char = who.char;
  const before = await doc<Record<string, unknown>>(db, char, 'meta');
  const meta: Record<string, unknown> = { ...(before ?? {}) };
  const docs: { key: string; d: unknown }[] = [];
  let clone: CloneState | null = null;
  let count = 0;

  if (login.scopes.includes(S.skills)) {
    const { data } = await esiGet<{ skills: RawSkill[]; total_sp?: number }>(`/characters/${char}/skills/`, { token });
    count = data.skills.length;
    const trained = Object.fromEntries(data.skills.map((x) => [x.skill_id, x.trained_skill_level]));
    if (JSON.stringify(await doc<Record<string, number>>(db, char, 'skills')) !== JSON.stringify(trained)) docs.push({ key: 'skills', d: trained });
    meta.skillSp = Object.fromEntries(data.skills.map((x) => [x.skill_id, x.skillpoints_in_skill ?? 0]));
    if (data.total_sp != null) meta.totalSp = data.total_sp;
    // Only the skills Alpha is capping: what the character can use is its trained level everywhere else (usableSkills).
    meta.activeSkills = Object.fromEntries(data.skills.filter((x) => x.active_skill_level < x.trained_skill_level).map((x) => [x.skill_id, x.active_skill_level]));
    clone = cloneState(data.skills.map((x) => ({ id: x.skill_id, trained: x.trained_skill_level, active: x.active_skill_level })), ALPHA_SKILL_CAPS);
    // "Since" is known only for a change the cloud saw happen: the first read can't say when the state began.
    const was = (before?.cloneDetected as CloneState | undefined) ?? 'unknown';
    if (before && was !== clone) meta.cloneSince = new Date(now).toISOString();
    if (clone === 'unknown') delete meta.cloneDetected; else meta.cloneDetected = clone;

    if (login.scopes.includes(S.queue)) {
      try {
        const { data: q } = await esiGet<RawQueue[]>(`/characters/${char}/skillqueue/`, { token });
        meta.skillQueue = [...q].sort((a, b) => a.queue_position - b.queue_position).map((x) => ({
          skillId: x.skill_id, level: x.finished_level, finish: x.finish_date ?? null, start: x.start_date ?? null,
          trainingStartSp: x.training_start_sp, levelStartSp: x.level_start_sp, levelEndSp: x.level_end_sp,
        }));
      } catch { /* the queue is a preview; the sheet does not hang on it */ }
    }
    try {
      const { data: at } = await esiGet<Attributes>(`/characters/${char}/attributes/`, { token });
      meta.attributes = { intelligence: at.intelligence, memory: at.memory, perception: at.perception, willpower: at.willpower, charisma: at.charisma };
    } catch { /* training time is a nicety */ }
  }
  if (extra.wallet != null) { meta.walletBalance = extra.wallet; meta.walletAt = new Date(now).toISOString(); }
  if (extra.lp) meta.lpBalances = extra.lp;

  if (!before || settled(before) !== settled(meta)) docs.push({ key: 'meta', d: meta });
  if (docs.length && (await stillKept(db, who))) await push(db, char, { records: [], docs });
  return { skills: count, clone, pushed: docs.length };
}
