/**
 * Who is asking: the EVE character behind the access token the app already holds.
 *
 * EVE's SSO issues its access tokens as JWTs signed with keys it publishes (`/oauth/jwks`), so the Worker
 * can check one itself: the signature, that it came from EVE's login server, that it was issued to this
 * app's client ID, and that it hasn't expired. The character ID in `sub` then keys everything stored. No
 * second account, no password: being logged in to the app is being logged in to the cloud.
 */

const JWKS_URL = 'https://login.eveonline.com/oauth/jwks';
const ISSUERS = ['https://login.eveonline.com', 'login.eveonline.com'];

type Jwk = JsonWebKey & { kid?: string; alg?: string };
let keys: { at: number; list: Jwk[] } | null = null;

async function signingKeys(force = false): Promise<Jwk[]> {
  // EVE rotates keys rarely; an hour's cache saves a fetch on almost every request.
  if (!force && keys && Date.now() - keys.at < 3600_000) return keys.list;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new AuthError(503, `EVE's signing keys couldn't be read (${res.status})`);
  const body = (await res.json()) as { keys: Jwk[] };
  keys = { at: Date.now(), list: body.keys };
  return keys.list;
}

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const text = new TextDecoder();

export type Caller = { charId: number; name: string; scopes: string[] };

/** The caller, from `Authorization: Bearer <EVE access token>`, or an AuthError. */
export async function caller(request: Request, clientId: string): Promise<Caller> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError(401, 'Log in with EVE first');
  let head: { alg?: string; kid?: string };
  let claims: { iss?: string; aud?: string | string[]; sub?: string; exp?: number; name?: string; scp?: string | string[] };
  try {
    head = JSON.parse(text.decode(b64url(parts[0])));
    claims = JSON.parse(text.decode(b64url(parts[1])));
  } catch {
    throw new AuthError(401, 'That login token isn’t readable');
  }
  if (head.alg !== 'RS256') throw new AuthError(401, 'Unexpected token signature');

  const verify = async (list: Jwk[]) => {
    const jwk = list.find((k) => k.kid === head.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  };
  let ok = await verify(await signingKeys());
  // A key we haven't seen: EVE may have rotated since the cache was filled.
  if (ok === null) ok = await verify(await signingKeys(true));
  if (!ok) throw new AuthError(401, 'That login token wasn’t signed by EVE');

  if (!claims.iss || !ISSUERS.includes(claims.iss)) throw new AuthError(401, 'That token wasn’t issued by EVE’s login server');
  const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!aud.includes(clientId)) throw new AuthError(401, 'That token was issued to a different application');
  if (!claims.exp || claims.exp * 1000 < Date.now() - 30_000) throw new AuthError(401, 'The login has expired; the app refreshes it and tries again');
  const m = /^CHARACTER:EVE:(\d+)$/.exec(claims.sub ?? '');
  if (!m) throw new AuthError(401, 'That token isn’t for a character');
  const scopes = Array.isArray(claims.scp) ? claims.scp : claims.scp ? [claims.scp] : [];
  return { charId: Number(m[1]), name: claims.name ?? '', scopes };
}
