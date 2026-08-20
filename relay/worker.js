/*
 * Basal — Whoop relay.
 *
 * A browser cannot talk to Whoop. Their API sends no CORS headers at all, so
 * every request from a web page is blocked before it leaves, no matter what
 * token you hold. That is not a limitation of this app; it is true of any
 * website. Something server-side has to sit in the middle, and this is the
 * smallest thing that can.
 *
 * It does exactly two jobs:
 *   1. Holds the Whoop client secret, which cannot live in a public page,
 *      and uses it for the two exchanges that require it.
 *   2. Forwards API calls and adds the CORS headers Whoop omits.
 *
 * It deliberately does NOT store your data or your tokens. The tokens go
 * back to your phone and live there, the same as the rest of your log.
 * Nothing about you is retained here — which also means there is nothing
 * here to lose.
 *
 * Deploy by pasting this into the Cloudflare Workers editor. No build step,
 * no Node, no command line.
 *
 * Required environment variables (set as Secrets, not plain text):
 *   WHOOP_CLIENT_ID
 *   WHOOP_CLIENT_SECRET
 * Optional:
 *   ALLOWED_ORIGINS   comma-separated; defaults to the two below
 */

const WHOOP_AUTH  = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API   = 'https://api.prod.whoop.com/developer';

const SCOPES = 'read:recovery read:cycles read:sleep read:profile read:body_measurement offline';

const DEFAULT_ORIGINS = [
  'https://sakshampan733-cloud.github.io',
  'http://localhost:8765',
];

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
    .concat(DEFAULT_ORIGINS);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const ok = allowedOrigins(env).some(o => origin === o || origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': ok ? origin : DEFAULT_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

const json = (obj, request, env, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
  });

function page(title, body) {
  return new Response(
    `<!doctype html><meta charset=utf-8>
     <meta name=viewport content="width=device-width,initial-scale=1">
     <title>${title}</title>
     <style>body{background:#0E1216;color:#E9EEF3;font:16px/1.55 -apple-system,system-ui,sans-serif;
     display:grid;place-items:center;height:100vh;margin:0;padding:24px;text-align:center}
     h1{font-size:20px;margin:0 0 8px}p{color:#A6B2BE;max-width:34em;margin:0}</style>
     <h1>${title}</h1><p>${body}</p>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET) {
      return json({ error: 'The relay is deployed but has no Whoop credentials set. '
        + 'Add WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET as secrets.' }, request, env, 500);
    }

    /* Somewhere to point the app at to confirm the relay is alive. */
    if (path === '/' || path === '/health') {
      return json({ ok: true, service: 'basal-whoop-relay',
                    redirect_uri: `${url.origin}/callback` }, request, env);
    }

    /*
     * Start the OAuth dance. `app` is where to send the browser back to
     * afterwards, carried through Whoop in the state parameter so the
     * callback knows where home is.
     */
    if (path === '/auth') {
      const app = url.searchParams.get('app') || DEFAULT_ORIGINS[0];
      const nonce = crypto.randomUUID().replace(/-/g, '');
      const state = `${nonce}.${btoa(app).replace(/=/g, '')}`;
      const q = new URLSearchParams({
        client_id: env.WHOOP_CLIENT_ID,
        response_type: 'code',
        scope: SCOPES,
        state,
        redirect_uri: `${url.origin}/callback`,
      });
      return Response.redirect(`${WHOOP_AUTH}?${q}`, 302);
    }

    /*
     * Whoop sends the user back here with a code. Swap it for tokens using
     * the secret, then hand the tokens to the app in the URL fragment —
     * fragments are never sent to a server, so they do not appear in any
     * log along the way.
     */
    if (path === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state') || '';
      if (!code) return page('Authorisation failed', 'Whoop did not return a code. Try connecting again.');

      let app = DEFAULT_ORIGINS[0];
      try {
        const encoded = state.split('.')[1];
        if (encoded) app = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
      } catch { /* fall back to the default */ }

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: env.WHOOP_CLIENT_ID,
        client_secret: env.WHOOP_CLIENT_SECRET,
        redirect_uri: `${url.origin}/callback`,
      });

      const r = await fetch(WHOOP_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!r.ok) {
        const detail = (await r.text()).slice(0, 300);
        return page('Whoop refused the exchange', `${r.status}: ${detail}`);
      }

      const tok = await r.json();
      const payload = btoa(JSON.stringify({
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at: Date.now() + (tok.expires_in || 3600) * 1000,
      }));
      return Response.redirect(`${app}#whoop=${encodeURIComponent(payload)}`, 302);
    }

    /* Refreshing needs the secret, so it has to happen here. */
    if (path === '/refresh' && request.method === 'POST') {
      let incoming;
      try { incoming = await request.json(); }
      catch { return json({ error: 'bad json' }, request, env, 400); }
      if (!incoming.refresh_token) return json({ error: 'no refresh_token' }, request, env, 400);

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: incoming.refresh_token,
        client_id: env.WHOOP_CLIENT_ID,
        client_secret: env.WHOOP_CLIENT_SECRET,
        scope: 'offline',
      });
      const r = await fetch(WHOOP_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!r.ok) return json({ error: `refresh rejected (${r.status})` }, request, env, r.status);

      const tok = await r.json();
      return json({
        access_token: tok.access_token,
        // Whoop rotates refresh tokens; keep the old one if none came back.
        refresh_token: tok.refresh_token || incoming.refresh_token,
        expires_at: Date.now() + (tok.expires_in || 3600) * 1000,
      }, request, env);
    }

    /*
     * Everything under /v1 is forwarded to Whoop untouched, with the app's
     * own bearer token, and comes back with the CORS headers Whoop leaves
     * off. The relay never reads or keeps the response.
     */
    if (path.startsWith('/v1/')) {
      const auth = request.headers.get('Authorization');
      if (!auth) return json({ error: 'no Authorization header' }, request, env, 401);

      const target = `${WHOOP_API}${path}${url.search}`;
      const r = await fetch(target, { headers: { Authorization: auth } });
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
      });
    }

    return json({ error: 'not found', path }, request, env, 404);
  },
};
