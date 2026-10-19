/**
 * The cloud's structure search, for a character whose login the browser doesn't hold (docs/notes/industry.md, stage 4; spec B9).
 * ESI searches the structures a character can see only with that character's own login, and an alt's is kept by the cloud alone
 * (docs/notes/characters.md). Run as the character asked for: the ledger's own, or an alt on its roster; anything else is refused
 * before EVE is asked. Read-only, and nothing is written: what it finds goes back to the browser, which adds the one picked as a
 * build site or a home market. A structure the character can't read is left out, as the browser's `structureInfo` leaves it out.
 */
import { onRoster } from './alts';
import { altReaderFor, EveError, esiGet, ledgerReader, readerLogin } from './eve';
import { SCOPE_STRUCTURES } from './industryJobs';
import { BadRequest } from './sync';

export const SCOPE_SEARCH = 'esi-search.search_structures.v1';
/** As the browser's FindStructure: the first fifteen found. */
export const MAX_FOUND = 15;

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };
/** The browser's FindStructure shape (src/lib/industrySites.ts), so either search fills the same list. */
export type FoundStructure = { id: number; name: string; systemId: number; system: string; security: number | null; typeId?: number };

export async function searchStructures(env: Env, ledger: number, char: number, q: string): Promise<{ found: FoundStructure[] }> {
  const query = (q ?? '').trim();
  if (query.length < 3) throw new BadRequest('Type at least three letters of its name.');
  if (char !== ledger && !(await onRoster(env.DB, ledger, char))) throw new BadRequest('That character isn’t one of yours.');
  const main = char === ledger;
  const where = main ? 'under Settings → Your data' : 'on Characters';
  const named = main ? 'you' : (await env.DB.prepare('SELECT name FROM alts WHERE char_id = ?1 AND ledger = ?2').bind(char, ledger).first<{ name: string | null }>())?.name ?? 'that character';
  const login = await readerLogin(env, main ? ledgerReader(ledger) : await altReaderFor(env.DB, ledger, char));
  if (!login) throw new BadRequest(`The cloud holds no login for ${named}: hand it over ${where} first.`);
  const lacks = [SCOPE_SEARCH, SCOPE_STRUCTURES].find((s) => !login.scopes.includes(s));
  if (lacks) throw new BadRequest(`${main ? 'Your' : `${login.name}’s`} login was handed over without EVE’s permission to ${lacks === SCOPE_SEARCH ? 'search structures' : 'read structures'}: hand it over again ${where}.`);
  const { data } = await esiGet<{ structure?: number[] }>(`/characters/${char}/search/`, { token: login.access, query: { categories: 'structure', search: query, strict: 'false' } });
  const systems = new Map<number, { name: string; security: number } | null>();
  const found: FoundStructure[] = [];
  for (const id of (data.structure ?? []).slice(0, MAX_FOUND)) {
    let s: { name: string; solar_system_id: number; type_id?: number };
    try { s = (await esiGet<typeof s>(`/universe/structures/${id}/`, { token: login.access })).data; }
    catch (e) { if (e instanceof EveError && (e.status === 403 || e.status === 404)) continue; throw e; }
    if (!systems.has(s.solar_system_id)) {
      // A system is public: read without the login, once for all the structures in it.
      systems.set(s.solar_system_id, await esiGet<{ name: string; security_status: number }>(`/universe/systems/${s.solar_system_id}/`)
        .then((r) => ({ name: r.data.name, security: r.data.security_status }), () => null));
    }
    const sys = systems.get(s.solar_system_id) ?? null;
    found.push({ id, name: s.name, systemId: s.solar_system_id, system: sys?.name ?? '', security: sys?.security ?? null, ...(s.type_id != null ? { typeId: s.type_id } : {}) });
  }
  return { found };
}
