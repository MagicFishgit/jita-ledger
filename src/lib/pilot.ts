import type { Data } from './store';
import type { Meta } from './types';
import type { QueuedLevel } from './skillStatus';
import { usableSkills } from './roster';

/**
 * Whose skills a skill-reading component shows (stage 3 of several characters, docs/notes/characters.md): the ship trees,
 * the skill strips and needs, the fits' Save button. Every page reads the main, built from the store exactly as those
 * components read it before (`usePilot` in components/pilot.tsx); Mining's Scaling up can be handed an alt's, built from
 * its pulled copy (altLedger). Pure: no React, no store, no config, so check.mjs loads it.
 */
export type Pilot = {
  charId: number | null; name: string; isMain: boolean;
  /** Levels the pilot can use; undefined until its skills have been read. */
  skills: Record<number, number> | undefined;
  skillQueue: QueuedLevel[] | undefined; skillSp: Record<number, number> | undefined;
  attributes: Meta['attributes']; alpha: boolean;
  /**
   * What Alpha caps, for an alt: each skill trained past the level Alpha lets it use, with both levels (from its
   * `meta.activeSkills`, which the cloud's sheet read lists only where the active level is below the trained one). Its
   * training time is no answer there: the points already cover the trained level, so it read "takes 1 min". Omega is.
   * Undefined for the main, whose path is as it always was, and for an alt nothing caps.
   */
  capped?: Record<number, Capped>;
  /**
   * For an alt the cloud can't read (its login refused by EVE, or none kept): a first read isn't coming, so what isn't
   * read says to hand the login over again rather than "Not read yet", which would never resolve.
   */
  lost?: 'refused' | 'none';
};
/** A skill Alpha caps: the level trained, and the level Alpha uses (0: Alpha can't use it at all). */
export type Capped = { trained: number; active: number };

type Usable = { usable: Record<number, number>; capped: Record<number, Capped> | undefined };
/**
 * The usable levels for one copy, and what Alpha caps in it, kept so the same copy gives the same objects:
 * `usableSkills` spreads a new one whenever Alpha caps something, and effects keyed on the skills or the caps
 * (useTrainTimes) would otherwise run again on every render.
 */
const usableMemo = new WeakMap<Record<number, number>, WeakMap<Record<number, number>, Usable>>();
function usableOf(trained: Record<number, number>, active: Record<number, number> | undefined): Usable {
  if (!active) return { usable: usableSkills(trained), capped: undefined };
  let byActive = usableMemo.get(trained);
  if (!byActive) usableMemo.set(trained, (byActive = new WeakMap()));
  let hit = byActive.get(active);
  if (!hit) {
    // Only where the active level is below the trained one: the sheet read lists no other, and one that did would be
    // no cap.
    const capped = Object.entries(active).flatMap(([id, a]) => ((trained[Number(id)] ?? 0) > a ? [[id, { trained: trained[Number(id)], active: a }] as const] : []));
    byActive.set(active, (hit = { usable: usableSkills(trained, active), capped: capped.length ? Object.fromEntries(capped) : undefined }));
  }
  return hit;
}

/**
 * A pilot from a ledger. `usable: false` is the main, as the components have always read the store: its trained levels
 * (`d.skills`, the same object), queue, skill points, attributes and the clone setting. `usable: true` is an alt's copy:
 * the levels it can use (an Alpha's capped ones at their active level), and an empty skills doc read as not read yet,
 * since altLedger fills an unread one in as {} and every character has skills; drawn as trained-nothing, it would show
 * every ship locked. It reads only the skills, meta and settings, so a caller can memo on those three.
 */
export function pilotFrom(d: Pick<Data, 'skills' | 'meta' | 'settings'>, who: { charId: number | null; name: string; isMain: boolean }, usable: boolean): Pilot {
  const m = d.meta;
  const alt = usable && d.skills && Object.keys(d.skills).length ? usableOf(d.skills, m.activeSkills) : null;
  const skills = !usable ? d.skills : alt?.usable;
  return {
    charId: who.charId, name: who.name, isMain: who.isMain,
    skills, skillQueue: m.skillQueue, skillSp: m.skillSp, attributes: m.attributes, alpha: d.settings.clone === 'alpha',
    capped: alt?.capped,
  };
}

/**
 * The cap that stands between a pilot and a level of a skill, or null: Alpha caps the skill below that level. Training
 * isn't the answer then (its points may already be there), Omega is. Always null for the main.
 */
export function alphaCap(p: Pick<Pilot, 'capped'>, skill: number, level: number): Capped | null {
  const c = p.capped?.[skill];
  return c && c.active < level ? c : null;
}

/**
 * Whose, in a sentence: "your" for the main, "Miner Two’s" for an alt. The skill components say whose skills a figure is
 * at through this, so Scaling up shown for an alt doesn't say "at your skills" under the alt's figures.
 */
export const whose = (p: Pick<Pilot, 'isMain' | 'name'>): string => (p.isMain ? 'your' : `${p.name}’s`);
/** The same at the start of a sentence: "Your", "Miner Two’s". */
export const whoseStart = (p: Pick<Pilot, 'isMain' | 'name'>): string => (p.isMain ? 'Your' : `${p.name}’s`);
/** Who, as a sentence's subject: "you" for the main, the alt's name ("Miner Two can fly it"). */
export const who = (p: Pick<Pilot, 'isMain' | 'name'>): string => (p.isMain ? 'you' : p.name);

/**
 * An alt whose skills the cloud hasn't read yet: its figures can't be worked out at its skills, and its tree isn't drawn
 * as trained-nothing. The main's unread skills are drawn as they always were (every other page unchanged).
 */
export const skillsUnread = (p: Pick<Pilot, 'isMain' | 'skills'>): boolean => !p.isMain && !p.skills;

/** Why an unread alt's skills aren't shown, as a clause: its first read still to come, or its login to hand over again. */
export const unreadNote = (p: Pick<Pilot, 'name' | 'lost'>): string => (
  p.lost === 'refused' ? `Not read: EVE refused ${p.name}’s login; hand it over again on the Characters page`
    : p.lost === 'none' ? `Not read: the cloud holds no login for ${p.name}; hand one over on the Characters page`
      : `Not read yet: ${p.name}’s skills come with the cloud’s first read`);
