/**
 * The main's colonies, read hourly and kept as the synced `colonies` document, whatever the alert settings say.
 *
 * The read used to live inside the alert round, behind `cfg.ev.pi && cfg.mailEv.pi` and the round's own interval and
 * sender checks, so a ledger with PI alerts off (or no sender) never had its colonies kept. Now this runs on its own,
 * before the alert round, and the round's PI findings are worked out from the kept document (alerts.ts), never from ESI.
 */
import type { PlanetHead, RawColony } from '../../src/lib/colony';
import { keptFromEsi, mergeColonies, sanitizeColonies, type ColoniesDoc } from '../../src/lib/colonies';
import { noteJob } from './archive';
import { lastRun, PI_EVERY, PLANETS_SCOPE } from './alerts';
import { esiGet, ledgerReader, readerLogin, stillKept, type Reader } from './eve';
import { push } from './sync';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string; APP_URL: string };
type RawPlanetHead = { planet_id: number; planet_type: string; solar_system_id: number; upgrade_level: number; num_pins: number; last_update: string };

/** D1's colonies document for a character, or undefined when none is kept or it doesn't parse. */
export async function keptColonies(db: D1Database, charId: number): Promise<ColoniesDoc | undefined> {
  const row = await db.prepare('SELECT data FROM docs WHERE char_id = ?1 AND key = ?2').bind(charId, 'colonies').first<{ data: string }>();
  if (!row) return undefined;
  try { return sanitizeColonies(JSON.parse(row.data)); } catch { return undefined; }
}

/**
 * Reads the character's colonies with `login` (its access token) and merges them against the kept document. Returns the
 * merged document and whether it differs from what is held; writes nothing. Throws when ESI does.
 */
export async function colonyDocFor(env: Env, who: Reader, access: string): Promise<{ doc: ColoniesDoc; changed: boolean }> {
  const heads: PlanetHead[] = (await esiGet<RawPlanetHead[]>(`/characters/${who.char}/planets/`, { token: access })).data.map((p) => ({
    planetId: p.planet_id, planetType: p.planet_type, solarSystemId: p.solar_system_id,
    upgradeLevel: p.upgrade_level, numPins: p.num_pins, lastUpdate: p.last_update,
  }));
  const read = [];
  for (const h of heads) read.push(keptFromEsi(h, (await esiGet<RawColony>(`/characters/${who.char}/planets/${h.planetId}/`, { token: access })).data));
  const held = await keptColonies(env.DB, who.char);
  const merged = mergeColonies(held, read);
  return { doc: merged, changed: !(held != null && JSON.stringify(held) === JSON.stringify(merged)) };
}

/**
 * Reads the character's colonies from ESI, merges them against the kept document and pushes only when that changed.
 * Throws when ESI does (the caller notes the job). Nothing is written for a reader whose login isn't kept or lacks
 * the permission. Pushed under `who.char`, the character the colonies are of: for the main that is its ledger, for an
 * alt its own (the hourly sheet reads an alt's through `colonyDocFor` and pushes with its other documents).
 */
export async function readColoniesFor(env: Env, who: Reader, _now: number): Promise<{ colonies: number; pushed: boolean }> {
  const login = await readerLogin(env, who);
  if (!login || !login.scopes.includes(PLANETS_SCOPE)) return { colonies: 0, pushed: false };
  const { doc, changed } = await colonyDocFor(env, who, login.access);
  // Not written for a login dropped while the read ran.
  if (!changed || !(await stillKept(env.DB, who))) return { colonies: doc.colonies.length, pushed: false };
  await push(env.DB, who.char, { records: [], docs: [{ key: 'colonies', d: doc }] });
  return { colonies: doc.colonies.length, pushed: true };
}

/** The hourly read for a ledger's main, when its login holds the permission and an hour has passed since the last. */
export async function mainColoniesHourly(env: Env, charId: number, now: number): Promise<void> {
  const login = await readerLogin(env, ledgerReader(charId));
  if (!login || !login.scopes.includes(PLANETS_SCOPE)) return;
  if (now - (await lastRun(env.DB, charId, 'pi')) < PI_EVERY - 60_000) return;
  try {
    const r = await readColoniesFor(env, ledgerReader(charId), now);
    await noteJob(env.DB, charId, 'pi', { ok: true, detail: { colonies: r.colonies } }, now);
  } catch (e) {
    await noteJob(env.DB, charId, 'pi', { ok: false, error: e instanceof Error ? e.message : String(e) }, now);
  }
}
