/**
 * What your skill queue is about to do to your trading: a trade skill finishing changes your sales tax (Accounting),
 * broker fee (Broker Relations), the price-change discount (Advanced Broker Relations) or your order slots (Trade,
 * Retail, Wholesale, Tycoon). The app already follows a finished level on the next sync; this says what's coming, from
 * ESI's /characters/{id}/skillqueue (scope esi-skills.read_skillqueue.v1, registered 29 September 2026), so a fee drop
 * next week can be planned around. Pure.
 */
import { SKILL_NAMES, type SkillKey } from './constants';
import { orderSlots, effectiveSkills, rates, type Settings } from './fees';

/** One queue entry: the skill, the level it trains to, and when (null while the queue is paused). */
export type QueueEntry = { skillId: number; level: number; finish: string | null };

export type Effect = { what: 'tax' | 'broker' | 'relist' | 'slots'; before: number; after: number };
export type Coming = { key: SkillKey; name: string; level: number; finish: string | null; effects: Effect[] };

/**
 * The trade skills in the queue that will raise a level you have, in queue order, each with what it changes: rates as
 * worked out from skills and standings (not typed-in figures), and order slots. Levels queued one after another build on
 * each other (Accounting IV, then V).
 */
export function tradeSkillsComing(queue: QueueEntry[], skillIds: Partial<Record<SkillKey, number>>, s: Settings, now: number): Coming[] {
  const byId = new Map(Object.entries(skillIds).map(([k, id]) => [id, k as SkillKey]));
  let cur: Settings = { ...s, override: false };
  const out: Coming[] = [];
  for (const q of queue) {
    const key = byId.get(q.skillId);
    if (!key || q.level <= cur[key]) continue;
    if (q.finish && Date.parse(q.finish) <= now) continue;
    const next: Settings = { ...cur, [key]: q.level };
    const before = rates(cur), after = rates(next);
    const effects: Effect[] = [];
    if (after.t !== before.t) effects.push({ what: 'tax', before: before.t, after: after.t });
    if (after.f !== before.f) effects.push({ what: 'broker', before: before.f, after: after.f });
    if (after.k !== before.k) effects.push({ what: 'relist', before: before.k, after: after.k });
    const sb = orderSlots(effectiveSkills(cur)), sa = orderSlots(effectiveSkills(next));
    if (sa !== sb) effects.push({ what: 'slots', before: sb, after: sa });
    if (effects.length) out.push({ key, name: SKILL_NAMES[key], level: q.level, finish: q.finish, effects });
    cur = next;
  }
  return out;
}
