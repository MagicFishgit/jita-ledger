// Optional Cloudflare Worker. Only deploy this if logging in fails because the browser
// blocks the request to EVE's token endpoint (a CORS error in the console).
// It forwards the token request unchanged; it never sees a client secret because the app uses PKCE.

const ALLOWED_ORIGINS = ['https://magicfishgit.github.io', 'http://localhost:5173'];
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed) return new Response('Forbidden', { status: 403, headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: await request.text(),
    });
    return new Response(res.body, {
      status: res.status,
      headers: { ...cors, 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    });
  },
};
