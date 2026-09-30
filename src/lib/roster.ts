/**
 * Several characters in one ledger: the rules that need no I/O, shared with the cloud Worker (so free of the store,
 * config and React). An alt is a character on another of your accounts whose login the cloud keeps and reads; it
 * never logs in to the app, and its data lives under its own character ID.
 */

/** Alpha or Omega right now, as far as ESI lets it be told. */
export type CloneState = 'alpha' | 'omega' | 'unknown';
/** One skill as ESI reports it: the level trained, and the level usable now. They differ only while Alpha caps it. */
export type SkillLevel = { id: number; trained: number; active: number };

/**
 * ESI has no clone-state field. A skill usable below its trained level is an Alpha's cap at work, for certain. A skill
 * usable above Alpha's cap for it (`caps`, from CCP's static data; a skill not listed has cap 0) can only be an
 * Omega's. A character that has trained nothing past Alpha's limits looks the same either way: unknown.
 */
export function cloneState(skills: SkillLevel[], caps: Record<number, number>): CloneState {
  if (skills.some((s) => s.active < s.trained)) return 'alpha';
  if (skills.some((s) => s.active > (caps[s.id] ?? 0))) return 'omega';
  return 'unknown';
}

/** What a character can use now: its trained levels, with the active level wherever the two differ. */
export function usableSkills(trained: Record<number, number>, active?: Record<number, number>): Record<number, number> {
  return active ? { ...trained, ...active } : trained;
}

/** Which login the app asked EVE for. */
export type Asked = 'main' | 'mailer' | 'alt';
export type Sorted = { as: Asked } | { refuse: 'notMain' | 'isMain' | 'isAlt' };

/**
 * EVE's login page, not the app, decides which character a login is for, and it has already stopped that
 * character's earlier logins with a different set of permissions by the time the cloud is handed the new one. So a
 * wrong pick while adding an alt is kept as what it is: the main as the main's login, the mail sender as the
 * sender's (the alt flow asks for the main's permissions, which include sending and tidying mail). Both are offered
 * on EVE's page whenever you're still signed in to the main account there.
 *
 * The reverse can't be kept: a sender login has two permissions and can't read for an alt. `onRoster`: the character
 * is an alt of this ledger now (one removed from the roster is nobody's alt, and may be the sender).
 */
export function sortLogin(asked: Asked, char: number, ledger: number, mailer: number | null, onRoster: boolean): Sorted {
  if (asked === 'main') return char === ledger ? { as: 'main' } : { refuse: 'notMain' };
  if (asked === 'mailer') return char === ledger ? { refuse: 'isMain' } : onRoster ? { refuse: 'isAlt' } : { as: 'mailer' };
  if (char === ledger) return { as: 'main' };
  if (char === mailer) return { as: 'mailer' };
  return { as: 'alt' };
}
