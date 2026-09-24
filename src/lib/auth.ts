import { CLIENT_ID, REDIRECT_URI, SCOPES, SSO_AUTHORIZE, SSO_REVOKE, SSO_TOKEN } from './config';

export type Auth = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
  characterId: number;
  characterName: string;
  scopes: string[];
};

const AUTH_KEY = 'jita-ledger:auth';
const PKCE_KEY = 'jita-ledger:pkce';
const listeners = new Set<() => void>();

let current: Auth | null = readAuth();

function readAuth(): Auth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as Auth) : null;
  } catch {
    return null;
  }
}
function writeAuth(a: Auth | null) {
  current = a;
  try {
    if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    else localStorage.removeItem(AUTH_KEY);
  } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

export function getAuth(): Auth | null { return current; }
export function onAuthChange(cb: () => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }
export function hasScope(scope: string): boolean { return !!current?.scopes.includes(scope); }
export const isConfigured = () => CLIENT_ID.length > 0;

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  arr.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(n = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

export async function login(): Promise<void> {
  if (!isConfigured()) throw new Error('No EVE client ID is set. See the README.');
  const verifier = randomString(32);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = randomString(16);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnHash: window.location.hash }));
  const q = new URLSearchParams({
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  window.location.assign(`${SSO_AUTHORIZE}?${q.toString()}`);
}

function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4));
  return JSON.parse(decodeURIComponent(escape(json)));
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

function toAuth(t: TokenResponse): Auth {
  // The token comes straight from EVE SSO over TLS in exchange for our own PKCE verifier,
  // and ESI checks its signature on every call, so we only read the claims here.
  const claims = decodeJwt(t.access_token);
  const sub = String(claims.sub ?? ''); // "EVE:CHARACTER:<id>"
  const characterId = Number(sub.split(':').pop());
  const scp = claims.scp;
  const scopes = Array.isArray(scp) ? scp.map(String) : typeof scp === 'string' ? [scp] : [];
  if (!Number.isFinite(characterId)) throw new Error('The login token didn’t include a character.');
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + (t.expires_in ?? 1199) * 1000,
    characterId,
    characterName: String(claims.name ?? 'Unknown pilot'),
    scopes,
  };
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(SSO_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
  } catch {
    throw new Error(
      'The browser couldn’t reach the EVE login server. If this keeps happening, the token request is probably blocked by CORS. See "If login fails" in the README.',
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`EVE login returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Call once on startup. Returns true when it finished a login redirect. */
export async function handleCallback(): Promise<{ handled: boolean; error?: string }> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code && !params.get('error')) return { handled: false };

  let saved: { verifier: string; state: string; returnHash: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null'); } catch { saved = null; }
  sessionStorage.removeItem(PKCE_KEY);
  const clean = () => window.history.replaceState(null, '', REDIRECT_URI + (saved?.returnHash || '#/settings'));

  if (params.get('error')) { clean(); return { handled: true, error: `Login was cancelled or refused (${params.get('error')}).` }; }
  if (!saved || saved.state !== state) { clean(); return { handled: true, error: 'The login response didn’t match this browser session. Try logging in again.' }; }
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code: code!, client_id: CLIENT_ID, code_verifier: saved.verifier });
    writeAuth(toAuth(t));
    clean();
    return { handled: true };
  } catch (e) {
    clean();
    return { handled: true, error: e instanceof Error ? e.message : String(e) };
  }
}

let refreshing: Promise<string> | null = null;

/** A valid access token, refreshed when it's within a minute of expiring. */
export async function getAccessToken(): Promise<string> {
  const a = current;
  if (!a) throw new Error('Not logged in.');
  if (a.expiresAt - Date.now() > 60_000) return a.accessToken;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: a.refreshToken, client_id: CLIENT_ID });
        const next = toAuth(t);
        writeAuth(next);
        return next.accessToken;
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 400 || status === 401) writeAuth(null); // refresh token revoked or expired
        throw e;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

export async function logout(): Promise<void> {
  const a = current;
  writeAuth(null);
  if (!a) return;
  try {
    await fetch(SSO_REVOKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token_type_hint: 'refresh_token', token: a.refreshToken, client_id: CLIENT_ID }).toString(),
    });
  } catch { /* best effort: the token is gone from this browser either way */ }
}
