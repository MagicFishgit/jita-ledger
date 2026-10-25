/**
 * Whose plan, in Planets (moved out of piPlan.ts on 25 October 2026, word for word, which re-exports it): a character's planets allowed,
 * Command Center Upgrades level and clone state, from its skills, and why it can't plan at all. Its own module so the Planets tab's shell
 * (Planets.tsx, in the Side hustles chunk every tab loads) and the four steps' rules (piFlow.ts) can use it without the planner.
 * Pure: no config, store, React or DOM.
 */

/** Whose setup: planets allowed (1 + Interplanetary Consolidation), Command Center Upgrades, the clone state. Null is not read. */
export type PlanChar = { charId: number; name: string; planets: number | null; ccLevel: number | null; alpha: boolean | null };
export const NO_SKILLS = 'Skills not read';
export const ALPHA_NO_PI = 'Alphas can’t do planetary industry';

/** The skills a character's planets rest on, by CCP's static data (build 3569502): Interplanetary Consolidation, Command Center Upgrades, Customs Code Expertise. */
export const PI_SKILL = { consolidation: 2495, ccu: 2505, customs: 33467 } as const;
/** Skills read: absent before the main's first sync, an empty map in an alt's copy before the cloud's first read. */
const skillsRead = (s: Record<number, number> | undefined): s is Record<number, number> => !!s && Object.keys(s).length > 0;
/**
 * Whose setup, from a character's skills and clone state: 1 + Interplanetary Consolidation planets, Command Center Upgrades for
 * the fits. Skills not read are null, never level 0; once read, a skill missing from them was never injected, and is 0. Alpha
 * only when known: a clone state not read is null, worked out as Omega and said by the page.
 */
export function planCharOf(c: { charId: number; name: string; skills: Record<number, number> | undefined; clone: 'alpha' | 'omega' | 'unknown' }): PlanChar {
  const read = skillsRead(c.skills);
  return {
    charId: c.charId, name: c.name,
    planets: read ? 1 + (c.skills![PI_SKILL.consolidation] ?? 0) : null,
    ccLevel: read ? c.skills![PI_SKILL.ccu] ?? 0 : null,
    alpha: c.clone === 'alpha' ? true : c.clone === 'omega' ? false : null,
  };
}
/** Customs Code Expertise's level (a high-sec player office's NPC part), or null while the skills aren't read. */
export const customsLevel = (skills: Record<number, number> | undefined): number | null => (skillsRead(skills) ? skills[PI_SKILL.customs] ?? 0 : null);

/** Why a character can't plan at all, or null. */
export function charWhy(c: PlanChar): string | null {
  if (c.alpha === true) return ALPHA_NO_PI;
  if (c.planets == null || c.ccLevel == null || !(c.planets > 0)) return NO_SKILLS;
  return null;
}
