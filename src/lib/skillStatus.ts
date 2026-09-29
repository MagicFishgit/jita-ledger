/**
 * Where one skill stands in your training: the level you have, the level training now and how far through it is, and
 * the levels queued after it. From ESI's skill queue (/characters/{id}/skillqueue, kept in `meta.skillQueue` by the
 * sync), so every page that shows a skill can say "IV in 2 d 4 h" rather than only the level trained. Pure.
 */
import { fmtShort } from './format';

export const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

/** One queue entry as the sync keeps it. The start and points are missing from syncs before 29 September 2026. */
export type QueuedLevel = {
  skillId: number; level: number; finish: string | null; start?: string | null;
  trainingStartSp?: number; levelStartSp?: number; levelEndSp?: number;
};

export type SkillStatus = {
  /** The level trained, counting any the queue has finished since the last sync. */
  have: number;
  /** The level training now: when it finishes, and how far through the level it is (0 to 1; null when unknown). */
  training: { level: number; finish: number; progress: number | null } | null;
  /** Levels queued behind it, in order, with when each finishes (null while the queue is paused). */
  queued: { level: number; finish: number | null }[];
};

/**
 * How far through a level the entry training now is. The queue gives the points the level started and ends at and
 * those it had when training started; points accrue at a steady rate between start and finish. Without the points
 * (an older sync), the share of the time gone.
 */
export function progressOf(q: QueuedLevel, start: number, finish: number, now: number): number {
  const f = finish > start ? Math.min(1, Math.max(0, (now - start) / (finish - start))) : 1;
  const { trainingStartSp: t, levelStartSp: a, levelEndSp: b } = q;
  if (t == null || a == null || b == null || b <= a) return f;
  return Math.min(1, Math.max(0, (t + (b - t) * f - a) / (b - a)));
}

export function skillStatus(skillId: number | null | undefined, trained: number, queue: QueuedLevel[] | undefined, now: number): SkillStatus {
  let have = Math.max(0, Math.min(5, trained));
  let training: SkillStatus['training'] = null;
  const queued: SkillStatus['queued'] = [];
  if (skillId == null) return { have, training, queued };
  const list = queue ?? [];
  // The queue trains its first unfinished entry. Syncs before the start was kept don't say when it began: the entry
  // before it finishing is when, and without one how far through it is isn't known.
  const head = list.findIndex((q) => q.finish != null && Date.parse(q.finish) > now);
  list.forEach((q, i) => {
    if (q.skillId !== skillId || q.level <= have) return;
    const finish = q.finish ? Date.parse(q.finish) : null;
    // Finished since the sync read the skills: ESI keeps it in the queue until the client catches up.
    if (finish != null && finish <= now) { have = Math.max(have, q.level); return; }
    const start = q.start ? Date.parse(q.start) : q.start === undefined && i === head && i > 0 && list[i - 1].finish ? Date.parse(list[i - 1].finish!) : null;
    const runs = finish != null && (start != null ? start <= now : q.start === undefined && i === head);
    if (!training && runs) training = { level: q.level, finish: finish!, progress: start != null ? progressOf(q, start, finish!, now) : null };
    else queued.push({ level: q.level, finish });
  });
  return { have, training, queued };
}

/** The level a skill will reach once everything queued for it has trained. */
export const queuedTo = (s: SkillStatus): number => Math.max(s.have, s.training?.level ?? 0, ...s.queued.map((q) => q.level));

/** Outstanding contracts Contracting allows: one, and four more a level ("up to a maximum of 21 at level 5", ESI's description). */
export const contractsAllowed = (level: number): number => 1 + 4 * Math.max(0, Math.min(5, level));

/** A training time the way the game's queue says it: "3 d 4 h", "5 h 20 min", "40 min". */
export function trainSaid(ms: number): string {
  if (!Number.isFinite(ms)) return 'no time known';
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d} d ${hh} h` : `${d} d`;
}

/**
 * How long a skill takes to a level from the points already in it, at your attributes, and what stands in the way: a
 * skillbook never injected (ESI lists every injected skill, untrained ones at level 0: 39 of the user's 210), and the
 * skills it needs first that you don't have.
 */
export type Train = { to: number; days: number | null; injected: boolean; needs: { id: number; level: number }[] };

/** Where a skill stands, in a few words, and how to colour it. `name` names a missing prerequisite. */
export function queueSaid(s: SkillStatus, t: Train | null | undefined, now: number, name: (id: number) => string = (id) => `skill #${id}`): { text: string; tone: 'run' | 'queued' | 'idle' | 'max' } {
  if (s.training) return { text: `Training ${ROMAN[s.training.level]}: ${trainSaid(s.training.finish - now)} left`, tone: 'run' };
  const q = s.queued[0];
  if (q) return { text: `Queued: ${ROMAN[q.level]}${q.finish ? `, done ${fmtShort(q.finish)}` : ', queue paused'}`, tone: 'queued' };
  if (s.have >= 5) return { text: 'Trained to V', tone: 'max' };
  if (t?.needs.length) return { text: `Needs ${t.needs.map((n) => `${name(n.id)} ${ROMAN[n.level]}`).join(' and ')} first`, tone: 'idle' };
  const time = t?.days != null && Number.isFinite(t.days) ? `${ROMAN[t.to]} takes ${trainSaid(t.days * 86400_000)}` : null;
  if (t && !t.injected) return { text: `Skillbook not injected${time ? `; ${time} once it is` : ''}`, tone: 'idle' };
  return { text: time ? `Not queued: ${time}` : 'Not queued', tone: 'idle' };
}
