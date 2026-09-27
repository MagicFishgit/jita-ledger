/**
 * Refresh tokens at rest: AES-GCM with a key held only as the Worker's TOKEN_KEY secret (32 random bytes,
 * base64). A copy of the database alone can't be used to log in as anyone.
 */

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let cached: { raw: string; key: CryptoKey } | null = null;
async function key(secret: string): Promise<CryptoKey> {
  if (cached?.raw === secret) return cached.key;
  const k = await crypto.subtle.importKey('raw', unb64(secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
  cached = { raw: secret, key: k };
  return k;
}

export async function seal(secret: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), new TextEncoder().encode(plain)));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function open(secret: string, sealed: string): Promise<string> {
  const [iv, ct] = sealed.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(secret), unb64(ct));
  return new TextDecoder().decode(plain);
}
