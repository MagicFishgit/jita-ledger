import type { PiIndex } from './piBundle';
import { ALPHA_NO_PI, charWhy, type PlanChar } from './piChar';
import type { KindOption } from './piFinder';
import type { SetupKind } from './piPlan';

/**
 * Planets in four steps (planets-flow.md): 1 Product (the Chart), 2 Who and how, 3 System (Find), 4 Plan. The user (25 October 2026): "I
 * think my first screen should be to pick a product and then it takes me to the second screen to select the setup type I would like and
 * letting me choose which characters I am going to include for this and then take me to the system finder and after I have selected that
 * show me the planner so I can build it." This module holds step 2's rules (who's ticked, the factory character, the setup type, the
 * skills what-if) and when each step is complete. Not the factory character's search (piTeam.ts): who and how a plan is made for, never
 * how it's worked out. Imports nothing of the planner but types, so the tab's shell (Planets.tsx) can use it: which setup types can make
 * a good, and what a setup makes across the characters ticked, are piFinder.ts' (`kindOptions`, `teamFigure`). Pure: no config, store,
 * React or DOM.
 */

/** The setup types step 2 offers: "the best for this team", or one kind pinned. Bought stays out: it uses none of the system's planets. */
export type FlowKind = 'best' | Exclude<SetupKind, 'bought'>;
export const FLOW_KINDS: readonly Exclude<SetupKind, 'bought'>[] = ['p1', 'p2', 'feed', 'team', 'chain'];

/**
 * Step 2's choices, kept per browser: the characters left out (`unticked`, so a character added later is ticked, as every one doing
 * planetary industry is by default), the setup type, and the skills what-if (`atV`).
 */
export type FlowChoice = { unticked: number[]; kind: FlowKind; atV: boolean };
export const DEFAULT_FLOW: FlowChoice = { unticked: [], kind: 'best', atV: false };
export function sanitizeFlow(x: unknown): FlowChoice {
  const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  const unticked = Array.isArray(o.unticked) ? [...new Set(o.unticked.filter((n): n is number => Number.isInteger(n) && (n as number) > 0))].sort((a, b) => a - b) : [];
  const kind = o.kind === 'best' || FLOW_KINDS.includes(o.kind as never) ? (o.kind as FlowKind) : 'best';
  return { unticked, kind, atV: o.atV === true };
}

/** The what-if, said wherever it applies (step 3's head, step 4's head and glance). */
export const WHAT_IF_SAID = 'Planned as if everyone had Interplanetary Consolidation V and Command Center Upgrades V';
/** Interplanetary Consolidation V: one planet and five more. */
export const PLANETS_AT_V = 6;

/** A character at the what-if's skills: six planets and Command Center Upgrades V. One that can't do planetary industry stays as it is. */
export const atV = (c: PlanChar): PlanChar => (charWhy(c) ? c : { ...c, planets: PLANETS_AT_V, ccLevel: 5 });

/**
 * Each character as step 2 lists it: whether it can do planetary industry (`why` not, in words), and whether it's ticked. `factory`: it's the
 * factory character (Show for), always ticked when it can do planetary industry (fix round 1: Show for picked elsewhere, then step 3 or 4
 * reached from the switch, planned with it unticked), its box not one to untick.
 */
export type FlowChar = { c: PlanChar; can: boolean; why: string | null; ticked: boolean; factory: boolean };
const cantSaid = (c: PlanChar) => {
  const w = charWhy(c);
  return w == null ? null : w === ALPHA_NO_PI ? 'Alphas can’t do planetary industry' : 'Its skills aren’t read yet, so it can’t be planned';
};
export function flowChars(chars: readonly PlanChar[], choice: FlowChoice, factory: number | null = null): FlowChar[] {
  return chars.map((c) => {
    const why = cantSaid(c), isFactory = c.charId === factory;
    return { c, can: why == null, why, ticked: why == null && (isFactory || !choice.unticked.includes(c.charId)), factory: isFactory };
  });
}

/**
 * Who a plan is made for: the character shown (the factory character, Show for) and the others the planner may use (the repeat line, the
 * chain and the factory character's team): every character ticked, at the what-if's skills when it's on. Characters that can't do planetary
 * industry stay among the others as they are (they're never ticked, and the chain and the team say an Alpha could make one up once Omega);
 * `unticked`, those that could but aren't, for the words. `everyone`: every character, as Check my setup and a kept plan want them (a kept
 * plan's colonies stay with the characters it was kept for, ticked or not).
 */
export function flowTeam(shown: PlanChar, all: readonly PlanChar[], choice: FlowChoice): { char: PlanChar; others: PlanChar[]; unticked: PlanChar[]; everyone: PlanChar[] } {
  const v = (c: PlanChar) => (choice.atV ? atV(c) : c);
  const rest = all.filter((c) => c.charId !== shown.charId);
  const listed = flowChars(rest, choice, shown.charId);
  return {
    char: v(shown),
    others: listed.filter((f) => f.ticked || !f.can).map((f) => v(f.c)),
    unticked: listed.filter((f) => f.can && !f.ticked).map((f) => f.c),
    everyone: [v(shown), ...rest.map(v)],
  };
}

/** One line each, saying what it is. */
export const KIND_SAID: Record<FlowKind, { label: string; said: string }> = {
  best: { label: 'The best for this team', said: 'Every type below that can make it, worked out for each system, and the one making the most of it a day across the characters ticked.' },
  p1: { label: 'P0 → P1 on each planet', said: 'Each planet refines two of its P0s into P1 in Basic factories; repeated on each character ticked.' },
  p2: { label: 'P0 → P2 on each planet', said: 'Each planet makes a P2 alone, Basic and Advanced factories side by side; repeated on each character ticked.' },
  feed: { label: 'A fed factory', said: 'Planets make P1 and ship it to one factory planet that makes the good; repeated on each character ticked.' },
  team: { label: 'A factory character', said: 'The factory character’s factory planets make the good, fed by every character ticked, its own other planets too.' },
  chain: { label: 'A chain', said: 'A P4, or a P3 one character’s planets can’t make, built across the characters ticked: each extracts or builds a part.' },
};
/** The setup type in force: the one kept when it can make the good, else the best for this team (the kept one comes back with a good it can). */
export const kindFor = (kept: FlowKind, options: readonly KindOption[]): FlowKind => (kept !== 'best' && options.find((o) => o.kind === kept)?.can ? kept : 'best');
/** The kinds to work out for a choice: the one pinned, or every one that can make the good. */
export const kindsFor = (kind: FlowKind, options: readonly KindOption[]): Exclude<SetupKind, 'bought'>[] =>
  (kind === 'best' ? options.filter((o) => o.can && o.kind !== 'best').map((o) => o.kind as Exclude<SetupKind, 'bought'>) : [kind]);

// ---- The steps ----

export type FlowStep = 'chart' | 'setup' | 'find' | 'plan';
export const FLOW_STEPS: readonly FlowStep[] = ['chart', 'setup', 'find', 'plan'];
/** Step 1 is complete with a good a setup makes: a P1 to a P4. */
export function goodWhy(ix: PiIndex, good: number | null): string | null {
  if (good == null) return 'Pick a good on the chart first';
  const g = ix.byId.get(good);
  if (!g) return 'The planets’ data doesn’t know this good';
  if (g.tier === 'P0') return `${g.name} comes straight out of the ground: pick a good made from it`;
  return null;
}
/**
 * Step 2 is complete with the factory character (the one shown, always ticked when it can do planetary industry: `flowChars`' `factory`)
 * one that can: a Show for picked elsewhere that can't (an Alpha, skills not read) says so. Listed with that `factory`, nobody ticked can only
 * mean the factory character can't.
 */
export function setupWhy(listed: readonly FlowChar[], shown: number): string | null {
  const s = listed.find((f) => f.c.charId === shown);
  if (s && !s.can) return `${s.c.name} can’t be the factory character (${s.why!.charAt(0).toLowerCase()}${s.why!.slice(1)}): pick one among those ticked`;
  if (!listed.some((f) => f.ticked)) return 'Tick at least one character doing planetary industry';
  if (!s) return 'Pick the factory character among those ticked';
  if (!s.ticked) return `${s.c.name}, shown, isn’t ticked: tick ${s.c.name}, or pick the factory character among those ticked`;
  return null;
}
/** Step 3 is complete with a system picked: a row of the list, or one chosen by name. */
export const systemWhy = (systemId: number | null): string | null => (systemId == null ? 'Pick a system: a row of the list, or one by name' : null);
