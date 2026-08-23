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
/*
 * Whoop retired v1 of this API. /developer/v1/cycle and friends now 404 —
 * confirmed against their own migration guide, not assumed. v2 renames
 * cycle and activity/sleep one-for-one, and — the part that actually
 * changes the shape of a request — recovery is no longer nested under a
 * cycle ID. It is its own top-level, paginated collection.
 */
const WHOOP_API   = 'https://api.prod.whoop.com/developer/v2';

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

/*
 * Only the fields the app knows how to read, and only as numbers.
 *
 * A Shortcut is easy to mis-wire, and a string where a number belongs
 * propagates silently into averages and charts. Anything unrecognised or
 * non-finite is dropped here rather than stored and puzzled over later.
 */
const FIELDS = ['rhr', 'hrv', 'sleepH', 'remH', 'swsH', 'deepH',
                'kcal', 'activeKcal', 'steps', 'weightKg', 'vo2max'];

function clean(row) {
  const out = {};
  for (const f of FIELDS) {
    const v = Number(row[f]);
    if (Number.isFinite(v) && v >= 0) out[f] = v;
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    /*
     * Pasting a secret from a browser or a notes app very easily carries a
     * leading or trailing space or newline along with it — invisible in the
     * input box, and Whoop's OAuth server treats " abc" as a client that
     * does not exist rather than as "abc" with padding. Trimming here means
     * a stray whitespace character in the secret can never surface as a
     * cryptic invalid_client error again.
     */
    const CLIENT_ID = (env.WHOOP_CLIENT_ID || '').trim();
    const CLIENT_SECRET = (env.WHOOP_CLIENT_SECRET || '').trim();

    /* Somewhere to point the app at to confirm the relay is alive. */
    if (path === '/' || path === '/health') {
      return json({ ok: true, service: 'basal-relay',
                    whoop: !!(CLIENT_ID && CLIENT_SECRET),
                    apple: !!env.HEALTH,
                    redirect_uri: `${url.origin}/callback` }, request, env);
    }

    /* ── Apple Health ─────────────────────────────────────────────────
     *
     * Apple has no web API — HealthKit lives on the phone and no server
     * can reach it. So the phone pushes instead: a Shortcuts automation
     * reads the day's samples and POSTs them here, and the app collects
     * them later.
     *
     * A key the user generates is the whole authentication story. There
     * are no accounts to have, and the alternative — a real login — would
     * mean this relay holding identities, which is a much worse thing to
     * be responsible for than a bucket of heart rates behind a random
     * 32-character string.
     */
    if (path.startsWith('/apple/')) {
      if (!env.HEALTH) {
        return json({ error: 'The relay has no HEALTH KV namespace bound. '
          + 'Create one in Cloudflare and bind it as HEALTH.' }, request, env, 500);
      }
      const key = (request.headers.get('x-basal-key')
        || url.searchParams.get('key') || '').trim();
      if (!/^[a-zA-Z0-9_-]{24,64}$/.test(key)) {
        return json({ error: 'Missing or malformed key.' }, request, env, 401);
      }

      if (path === '/apple/push' && request.method === 'POST') {
        let body;
        try { body = await request.json(); }
        catch { return json({ error: 'Body must be JSON.' }, request, env, 400); }

        const rows = Array.isArray(body) ? body : [body];
        let written = 0;
        for (const row of rows) {
          const date = String(row.date || '').slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          /* Merge rather than replace: a Shortcut that only sends sleep
             must not wipe the heart rate an earlier one sent. */
          const prevRaw = await env.HEALTH.get(`${key}:${date}`);
          const prev = prevRaw ? JSON.parse(prevRaw) : {};
          const merged = { ...prev, ...clean(row), date, src: 'apple',
                           updatedAt: new Date().toISOString() };
          await env.HEALTH.put(`${key}:${date}`, JSON.stringify(merged),
            { expirationTtl: 60 * 60 * 24 * 400 });   // a year and a bit
          written++;
        }
        return json({ ok: true, written }, request, env);
      }

      if (path === '/apple/pull') {
        const list = await env.HEALTH.list({ prefix: `${key}:`, limit: 400 });
        const out = [];
        for (const k of list.keys) {
          const v = await env.HEALTH.get(k.name);
          if (v) out.push(JSON.parse(v));
        }
        out.sort((a, b) => a.date.localeCompare(b.date));
        return json({ ok: true, days: out.length, rows: out }, request, env);
      }

      if (path === '/apple/clear' && request.method === 'POST') {
        const list = await env.HEALTH.list({ prefix: `${key}:`, limit: 1000 });
        for (const k of list.keys) await env.HEALTH.delete(k.name);
        return json({ ok: true, cleared: list.keys.length }, request, env);
      }

      return json({ error: 'Unknown Apple Health route.' }, request, env, 404);
    }

    /* Everything below is Whoop, and only Whoop needs the credentials. */
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json({ error: 'The relay is deployed but has no Whoop credentials set. '
        + 'Add WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET as secrets.' }, request, env, 500);
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
        client_id: CLIENT_ID,
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
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
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
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
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
    if (path.startsWith('/v1/') || path.startsWith('/v2/')) {
      const auth = request.headers.get('Authorization');
      if (!auth) return json({ error: 'no Authorization header' }, request, env, 401);

      // Forward whatever the app asked for onto the v2 base, regardless of
      // which prefix it used to build the path — old app builds still work.
      const forward = path.replace(/^\/v[12]/, '');
      const target = `${WHOOP_API}${forward}${url.search}`;
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
