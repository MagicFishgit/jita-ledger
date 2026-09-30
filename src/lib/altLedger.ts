import type { Data } from './store';
import type { AltSaved } from './roster';
import { SKILL_FALLBACK_IDS, SKILL_NAMES, type SkillKey } from './constants';
import { DEFAULT_SETTINGS, sanitizeSettings } from './fees';
import { emptyData } from './emptyData';
import type { NetWorthPoint } from './types';

/**
 * An alt's copy as the cloud pulled it, as a ledger the app's own rules read unchanged (docs/notes/characters.md).
 * What an alt doesn't have is supplied empty: positions, tags, Personal marks, killmails (not read for an alt). Its
 * fees come from its own trade skills and clone state with standings 0; a clone state nobody can tell is taken as
 * Omega, which is the same thing when nothing is past Alpha's caps. Worked out once for each pulled copy: the alt
 * store replaces the copy when its revision moves, so the same copy means the same answer.
 */
const memo = new WeakMap<AltSaved, Map<string, Data>>();

export function altLedger(saved: AltSaved, byHand?: 'alpha' | 'omega'): Data {
  const key = byHand ?? '';
  const hit = memo.get(saved)?.get(key);
  if (hit) return hit;
  const rec = <T>(kind: string) => (saved.records[kind] ?? {}) as Record<string, T>;
  const meta = (saved.docs.meta ?? {}) as Data['meta'];
  const skills = (saved.docs.skills ?? {}) as Record<number, number>;
  const detected = (meta as { cloneDetected?: 'alpha' | 'omega' }).cloneDetected;
  const levels = Object.fromEntries((Object.keys(SKILL_NAMES) as SkillKey[]).map((k) => [k, skills[SKILL_FALLBACK_IDS[k]] ?? 0]));
  const d: Data = {
    ...emptyData(),
    txs: rec('txs'), journal: rec('journal'), orders: rec('orders'), names: rec('names'), mining: rec('mining'),
    netWorth: Object.values(rec<NetWorthPoint>('netWorth')).sort((a, b) => a.date.localeCompare(b.date)),
    meta, skills, stock: saved.docs.stock as Data['stock'],
    settings: sanitizeSettings({ ...DEFAULT_SETTINGS, ...levels, clone: detected ?? byHand ?? 'omega', faction: 0, corp: 0 }),
  };
  if (!memo.has(saved)) memo.set(saved, new Map());
  memo.get(saved)!.set(key, d);
  return d;
}
