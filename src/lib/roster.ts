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

/**
 * The purpose a login handed to the cloud is sent with. This browser's own mail sender, picked on EVE's page while
 * adding a character, goes as the sender: a sender that comes back is kept as the sender, never added as an alt (and
 * the cloud can't know this browser's sender unless it holds one itself). Unless that character is already one of your
 * characters (`chars`, which keeps removed ones too): then it's being added back, and the cloud would refuse it as a
 * sender and mark its alt login refused.
 */
export function handOverAs(asked: Asked, char: number, browserSender: number | null | undefined, knownAlt = false): Asked {
  return asked === 'alt' && !knownAlt && browserSender != null && char === browserSender ? 'mailer' : asked;
}

/**
 * Whether a login this browser holds was stopped by one that just came back: the same character, with a different set
 * of permissions. EVE stops a character's earlier logins that carry a different set, at its own login page
 * (docs/notes/eve-facts.md); the order the permissions are listed in doesn't matter.
 */
export function stoppedBy(held: { characterId: number; scopes: string[] } | null | undefined, came: { charId: number; scopes: string[] }): boolean {
  if (!held || held.characterId !== came.charId) return false;
  const a = new Set(held.scopes), b = new Set(came.scopes);
  return a.size !== b.size || [...b].some((s) => !a.has(s));
}

// --- In the browser: the roster as the cloud lists it, and an alt's copy ------------------------------------------

/** One alt as the cloud's roster lists it (GET /v1/alts): its login (never the token), its jobs, its ship when last read. */
export type RosterEntry = {
  charId: number; name: string | null; addedAt: number;
  /** The permissions its login carries; `at`: when the login last worked (null: none kept). */
  scopes: string[]; at: number | null; refusedAt: number | null; refused: string | null;
  /** The newest revision of its cloud copy: the browser pulls only when this has moved. */
  rev: number;
  ship: number | null; shipAt: number | null;
  jobs: { job: string; lastRun: number; lastOk: number | null; lastError: string | null }[];
};

/**
 * An alt's cloud copy as this browser keeps it: its records by kind and ID, its documents, the revision reached.
 * `addedAt`: when the roster says this alt was added, as it said when the copy was made (missing from a copy made
 * before it was kept).
 */
export type AltSaved = { rev: number; records: Record<string, Record<string, unknown>>; docs: Record<string, unknown>; addedAt?: number };
export const emptyAlt = (): AltSaved => ({ rev: 0, records: {}, docs: {} });

/**
 * The copy to pull an alt's changes onto: the one held, or a fresh one when the held copy can't be built on.
 *
 * - A roster revision below the one held can't be pulled from.
 * - A different `addedAt` is a different stay on the roster. "Remove and delete" deletes the alt's rows outright,
 *   with no removal left to pull, and keeps its revision, so a device that missed the removal and the re-add would
 *   pull only what came after and keep every deleted row. A re-add after "keep" keeps its `addedAt`, and its rows.
 * - A held copy with no `addedAt` predates it being kept: unknown, so it's kept (not every alt pulled again on the
 *   first load) and takes the roster's.
 *
 * Returns the held copy itself when nothing about it changes, so the caller knows there is nothing to save.
 */
export function altCopyFor(held: AltSaved | undefined, entry: { rev: number; addedAt: number }): AltSaved {
  if (!held || entry.rev < held.rev || (held.addedAt != null && held.addedAt !== entry.addedAt)) return { ...emptyAlt(), addedAt: entry.addedAt };
  return held.addedAt === entry.addedAt ? held : { ...held, addedAt: entry.addedAt };
}

/** One page of GET /v1/alts/<id>/pull. `next` is the cursor for the page after it, null on the last. */
export type AltPage = { rev: number; next: string | null; records: { k: string; i: string; d: unknown }[]; docs: { key: string; d: unknown }[] };

/**
 * An alt's copy with one page of a pull applied. The revision moves only with the last page (`next` null): a pull cut
 * off halfway is then asked for again from the revision it started at, and the pages already applied are applied
 * again, which changes nothing. Returns a new copy; the one passed in is left as it was.
 */
export function applyAltPull(saved: AltSaved, page: AltPage): AltSaved {
  const records = { ...saved.records };
  const copied = new Set<string>();
  for (const r of page.records) {
    if (!copied.has(r.k)) { records[r.k] = { ...(records[r.k] ?? {}) }; copied.add(r.k); }
    if (r.d == null) delete records[r.k][r.i]; else records[r.k][r.i] = r.d;
  }
  const docs = { ...saved.docs };
  for (const x of page.docs) docs[x.key] = x.d;
  return { ...saved, rev: page.next ? saved.rev : page.rev, records, docs };
}

/** What a character's card shows. Null where nothing has been read: a card never shows a zero for "not known". */
export type CharFacts = {
  wallet: number | null; walletAt: string | null;
  /** The newest daily net-worth point, with its date. */
  netWorth: { date: string; total: number } | null;
  clone: CloneState; cloneSince: string | null;
  /** The first level the queue hasn't finished (`finish` null while the queue is paused), and when the queue ends. */
  training: { skillId: number; level: number; finish: string | null } | null;
  queueEnds: string | null;
  /** The queue has been read: with no training, it's known to be empty rather than not read. */
  queueKnown: boolean;
  totalSp: number | null;
};

type MetaLike = {
  walletBalance?: number; walletAt?: string; totalSp?: number; cloneDetected?: 'alpha' | 'omega'; cloneSince?: string;
  skillQueue?: { skillId: number; level: number; finish: string | null }[];
};

/** A character's card facts from its `meta` document and its net-worth points: the main's or an alt's alike. */
export function charFacts(meta: MetaLike | undefined, points: { date: string; total: number }[], now: number): CharFacts {
  const m = meta ?? {};
  const latest = [...points].sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null;
  const left = (m.skillQueue ?? []).filter((q) => !q.finish || Date.parse(q.finish) > now);
  const first = left[0];
  return {
    wallet: m.walletBalance ?? null, walletAt: m.walletAt ?? null,
    netWorth: latest ? { date: latest.date, total: latest.total } : null,
    clone: m.cloneDetected ?? 'unknown', cloneSince: m.cloneSince ?? null,
    training: first ? { skillId: first.skillId, level: first.level, finish: first.finish ?? null } : null,
    queueEnds: left.length ? left[left.length - 1].finish ?? null : null,
    queueKnown: m.skillQueue !== undefined,
    totalSp: m.totalSp ?? null,
  };
}

/** What a card's Training tile says with nothing training: an empty queue only when it was read. Null while one trains. */
export const idleQueueSaid = (f: CharFacts): string | null => (f.training ? null : f.queueKnown ? 'Nothing in the queue' : 'Not read yet');

export const altFacts = (saved: AltSaved, now: number): CharFacts =>
  charFacts(saved.docs.meta as MetaLike | undefined, Object.values(saved.records.netWorth ?? {}) as { date: string; total: number }[], now);

/** When the cloud last read an alt in full: the newer of its copy (`archive`) and its sheet. Null before either has run. */
export function lastRead(e: RosterEntry): number | null {
  const at = Math.max(0, ...e.jobs.filter((j) => j.job === 'archive' || j.job === 'sheet').map((j) => j.lastOk ?? 0));
  return at || null;
}

/** When one of an alt's cloud jobs last worked (`archive`, `sheet`, `mining`), or null if it never has. */
export const jobOk = (e: RosterEntry, job: string): number | null => e.jobs.find((j) => j.job === job)?.lastOk ?? null;

/**
 * Which parts of an alt the cloud has read, each on its own evidence: its wallet once trades or journal are kept or its
 * `archive` job has worked; its mining once mining records are kept or its `mining` job has worked. A read skill sheet
 * says nothing of either, and "Nothing earned" for a wallet never read would be a zero standing for not known (the
 * final review of stage 2b). Mining not read is `permission` when the login works but was handed over without
 * `miningScope` (config's SCOPE.mining, passed in: this module is shared with the Worker), else `unread`.
 */
export function altReadState(saved: AltSaved, e: RosterEntry, wanted: string[], miningScope: string): { earned: boolean; mining: 'read' | 'permission' | 'unread' } {
  const kept = (kind: string) => Object.keys(saved.records[kind] ?? {}).length > 0;
  const login = loginState(e, wanted);
  return {
    earned: kept('txs') || kept('journal') || jobOk(e, 'archive') != null,
    mining: kept('mining') || jobOk(e, 'mining') != null ? 'read'
      : login.state === 'working' && login.missing.includes(miningScope) ? 'permission' : 'unread',
  };
}

/** The jobs that have failed since they last worked. */
export const failingJobs = (e: RosterEntry) => e.jobs.filter((j) => j.lastError && (j.lastOk ?? 0) < j.lastRun);

/**
 * The state of an alt's login: refused by EVE, none kept, or working. `missing`: the permissions the app asks for
 * today that this login was handed over without (it keeps working; what needs them doesn't, until it's handed over again).
 */
export function loginState(e: RosterEntry, wanted: string[]): { state: 'working' | 'refused' | 'none'; missing: string[] } {
  if (e.refusedAt != null) return { state: 'refused', missing: [] };
  if (e.at == null) return { state: 'none', missing: [] };
  return { state: 'working', missing: wanted.filter((s) => !e.scopes.includes(s)) };
}

/** Your characters' IDs: the main and every character in `chars` (removed ones too: past transfers stay transfers). */
export function ownIds(mainId: number | null | undefined, chars: Record<string, unknown>): Set<number> {
  const ids = new Set<number>();
  if (mainId != null) ids.add(mainId);
  for (const k of Object.keys(chars ?? {})) { const n = Number(k); if (Number.isFinite(n)) ids.add(n); }
  return ids;
}

/**
 * A donation, direct trade or contract entry whose two parties are both yours: ISK moving between your own
 * characters, not income or spending. Fails safe: a missing party, or either not yours, is not a transfer; nor is an
 * entry naming one character on both sides, which CCP writes for some of a character's own entries (132 of
 * the 202 escrow releases in the user's journal, and a sale to themselves), so the set holding only the main never makes one.
 */
export function ownTransfer(
  e: { refType: string; firstPartyId?: number | null; secondPartyId?: number | null },
  mine: Set<number> | undefined,
): boolean {
  if (!mine) return false;
  if (e.refType !== 'player_donation' && e.refType !== 'player_trading' && !e.refType.startsWith('contract_')) return false;
  return e.firstPartyId != null && e.secondPartyId != null && e.firstPartyId !== e.secondPartyId
    && mine.has(e.firstPartyId) && mine.has(e.secondPartyId);
}
