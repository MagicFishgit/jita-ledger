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
};

/**
 * The usable levels for one copy, kept so the same copy gives the same object: `usableSkills` spreads a new one whenever
 * Alpha caps something, and effects keyed on the skills (useTrainTimes) would otherwise run again on every render.
 */
const usableMemo = new WeakMap<Record<number, number>, WeakMap<Record<number, number>, Record<number, number>>>();
function usableOf(trained: Record<number, number>, active: Record<number, number> | undefined): Record<number, number> {
  if (!active) return usableSkills(trained);
  let byActive = usableMemo.get(trained);
  if (!byActive) usableMemo.set(trained, (byActive = new WeakMap()));
  let hit = byActive.get(active);
  if (!hit) byActive.set(active, (hit = usableSkills(trained, active)));
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
  const skills = !usable ? d.skills
    : d.skills && Object.keys(d.skills).length ? usableOf(d.skills, m.activeSkills) : undefined;
  return {
    charId: who.charId, name: who.name, isMain: who.isMain,
    skills, skillQueue: m.skillQueue, skillSp: m.skillSp, attributes: m.attributes, alpha: d.settings.clone === 'alpha',
  };
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
