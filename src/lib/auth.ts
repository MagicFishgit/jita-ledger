import { CLIENT_ID, REDIRECT_URI, SCOPE, SCOPES, SSO_AUTHORIZE, SSO_REVOKE, SSO_TOKEN } from './config';

export type Auth = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
  characterId: number;
  characterName: string;
  scopes: string[];
};

const PKCE_KEY = 'jita-ledger:pkce';
const listeners = new Set<() => void>();

/**
 * A stored login. There are two: the character you trade with, and optionally a second one that only
 * sends alert mail. EVE doesn't tell the client about mail a character sends itself --- it reaches the
 * server's Inbox at once but only shows after logging in again --- so alerts come from another character
 * and arrive like any other mail.
 */
type Slot = { key: string; auth: Auth | null; refreshing: Promise<string> | null };

function readAuth(key: string): Auth | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Auth) : null;
  } catch {
    return null;
  }
}
const slot = (key: string): Slot => ({ key, auth: readAuth(key), refreshing: null });
const main = slot('jita-ledger:auth');
const mailer = slot('jita-ledger:mailer');

function write(s: Slot, a: Auth | null) {
  s.auth = a;
  try {
    if (a) localStorage.setItem(s.key, JSON.stringify(a));
    else localStorage.removeItem(s.key);
  } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}
const writeAuth = (a: Auth | null) => write(main, a);

export function getAuth(): Auth | null { return main.auth; }
export function onAuthChange(cb: () => void): () => void { listeners.add(cb); return () => listeners.delete(cb); }
export function hasScope(scope: string): boolean { return !!main.auth?.scopes.includes(scope); }

/** The character that sends alert mail, when one is set up. */
export function getMailer(): Auth | null { return mailer.auth; }
/** Only what sending needs: send, and delete its own sent copies. */
export const MAILER_SCOPES = [SCOPE.mailSend, SCOPE.mailOrganize];
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

/**
 * Which login a redirect was for. The two `cloud` ones never stay in this browser: their refresh token is
 * handed to the cloud Worker, which keeps it (encrypted) to read ESI and send mail while no tab is open.
 */
type Purpose = 'main' | 'mailer' | 'cloud' | 'cloud-mailer';

async function startLogin(purpose: Purpose, scopes: string[]): Promise<void> {
  if (!isConfigured()) throw new Error('No EVE client ID is set. See the README.');
  const verifier = randomString(32);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = randomString(16);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnHash: window.location.hash, purpose }));
  const q = new URLSearchParams({
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    scope: scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  window.location.assign(`${SSO_AUTHORIZE}?${q.toString()}`);
}

export const login = () => startLogin('main', SCOPES);
/** Log in the character that will send alert mail. EVE's login page asks which character. */
export const loginMailer = () => startLogin('mailer', MAILER_SCOPES);
/** A login for the cloud's background jobs, with the same permissions as the trading login. */
export const loginForCloud = () => startLogin('cloud', SCOPES);
/** A login for the cloud to send alert mail from the second character. */
export const loginMailerForCloud = () => startLogin('cloud-mailer', MAILER_SCOPES);

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
export async function handleCallback(): Promise<{ handled: boolean; error?: string; cloudKey?: { purpose: 'main' | 'mailer'; refreshToken: string; name: string } }> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code && !params.get('error')) return { handled: false };

  let saved: { verifier: string; state: string; returnHash: string; purpose?: Purpose } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null'); } catch { saved = null; }
  sessionStorage.removeItem(PKCE_KEY);
  const clean = () => window.history.replaceState(null, '', REDIRECT_URI + (saved?.returnHash || '#/settings'));

  if (params.get('error')) { clean(); return { handled: true, error: `Login was cancelled or refused (${params.get('error')}).` }; }
  if (!saved || saved.state !== state) { clean(); return { handled: true, error: 'The login response didn’t match this browser session. Try logging in again.' }; }
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code: code!, client_id: CLIENT_ID, code_verifier: saved.verifier });
    const got = toAuth(t);
    clean();
    // For the cloud: hand the refresh token on, and keep nothing here.
    if (saved.purpose === 'cloud' || saved.purpose === 'cloud-mailer') {
      return { handled: true, cloudKey: { purpose: saved.purpose === 'cloud' ? 'main' : 'mailer', refreshToken: got.refreshToken, name: got.characterName } };
    }
    if (saved.purpose === 'mailer') {
      // The same character would be mailing itself, which is the thing this login exists to avoid.
      if (got.characterId === main.auth?.characterId) {
        await revoke(got);
        return { handled: true, error: `${got.characterName} is the character alerts are sent to. Log in with your other character to send them from — EVE’s login page lets you pick.` };
      }
      write(mailer, got);
      return { handled: true };
    }
    writeAuth(got);
    return { handled: true };
  } catch (e) {
    clean();
    return { handled: true, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A valid access token for a login, refreshed when it's within a minute of expiring. */
async function tokenFor(s: Slot, who: string): Promise<string> {
  const a = s.auth;
  if (!a) throw new Error(`${who} isn’t logged in.`);
  if (a.expiresAt - Date.now() > 60_000) return a.accessToken;
  if (!s.refreshing) {
    s.refreshing = (async () => {
      try {
        const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: a.refreshToken, client_id: CLIENT_ID });
        const next = toAuth(t);
        write(s, next);
        return next.accessToken;
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 400 || status === 401) write(s, null); // refresh token revoked or expired
        throw e;
      } finally {
        s.refreshing = null;
      }
    })();
  }
  return s.refreshing;
}

export const getAccessToken = () => tokenFor(main, 'Your character');
export const getMailerToken = () => tokenFor(mailer, 'The character that sends alert mail');

async function revoke(a: Auth): Promise<void> {
  try {
    await fetch(SSO_REVOKE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token_type_hint: 'refresh_token', token: a.refreshToken, client_id: CLIENT_ID }).toString(),
    });
  } catch { /* best effort: the token is gone from this browser either way */ }
}

/** Log out the trading character. The mail sender, if any, stays. */
export async function logout(): Promise<void> {
  const a = main.auth;
  writeAuth(null);
  if (a) await revoke(a);
}

/** Stop sending alert mail from the second character. The trading login is untouched. */
export async function logoutMailer(): Promise<void> {
  const a = mailer.auth;
  write(mailer, null);
  if (a) await revoke(a);
}
