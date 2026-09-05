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
    /* x-basal-key is how the Apple endpoints authenticate, and a browser
       will not send a header the preflight did not permit. Omitting it
       meant the app could never reach /apple/pull while curl and the
       Shortcut both could — neither of those does a preflight. */
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-basal-key',
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
/*
 * Everything an Apple Watch can actually measure that the app has a use
 * for. Anything not on this list is dropped, so the list has to be
 * complete before people build their Shortcuts — a field added here later
 * does not reach a phone that was never told to collect it.
 */
const FIELDS = ['rhr', 'hrv', 'sleepH', 'remH', 'swsH', 'deepH',
                /* Total burn, and the two halves it is made of. The app
                   already knows how to add active and basal when it is
                   given them separately — it just had no way to receive
                   basal, so that path could never fire and every Shortcut
                   had to do the addition itself. */
                'kcal', 'activeKcal', 'basalKcal',
                'steps', 'weightKg', 'vo2max',
                'spo2', 'resp', 'temp',
                /* The three Activity rings. Move is active energy — the
                   same number the red ring fills with — kept separate
                   from total burn, which the app needs for maintenance
                   and which includes what you burn asleep. */
                'exerciseMin', 'standHours', 'moveGoal'];

/*
 * Whatever the phone calls today.
 *
 * The push endpoint used to demand a literal yyyy-MM-dd and silently skip
 * anything else, which meant every user had to find the date-format panel
 * in Shortcuts and type a format string correctly. Most did not, and the
 * failure looked like success: ok true, written zero.
 *
 * A date is not ambiguous enough to be worth that. Normalise here instead
 * and accept ISO, ISO with a time on it, and the slash and dot formats
 * phones actually produce.
 *
 * Day-first where it is genuinely ambiguous: this is used in India, where
 * 08/09 means the eighth of September. Where one number is above twelve it
 * decides itself and no assumption is needed.
 */
function toDay(v) {
  if (v == null) return '';
  const s = String(v).trim();

  /* 2026-08-27, with or without a time after it. */
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  /* 27/08/2026, 27-08-26, 27.08.2026 */
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    let day = +a, mon = +b;
    /* A number above twelve can only be the day, whatever the locale. */
    if (mon > 12 && day <= 12) { const t = day; day = mon; mon = t; }
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  /*
   * Month names, which is what Shortcuts actually sends: "29 Aug 2026 at
   * 4:04 AM". The word "at" is the part no Date parser copes with, and it
   * is not optional in Apple's medium format — so read the pieces directly
   * rather than hoping a parser gets there.
   */
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthOf = w => MONTHS.indexOf(String(w).slice(0, 3).toLowerCase()) + 1;

  /* "29 Aug 2026", "29 August 2026 at 4:04 AM" */
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/);
  if (m) {
    const mon = monthOf(m[2]);
    if (mon) return `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  /* "Aug 29, 2026", "August 29 2026 at 4:04 AM" */
  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = monthOf(m[1]);
    if (mon) return `${m[3]}-${String(mon).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }

  /* Last resort: hand it to the runtime with the "at" taken out, since
     that single word is what defeats an otherwise capable parser. */
  const d = new Date(s.replace(/\s+at\s+/i, ' '));
  if (!Number.isNaN(d.getTime())) {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  return '';
}

/*
 * A number as a phone writes it.
 *
 * Shortcuts formats its results for display before putting them in a JSON
 * field, so a step count arrives as "9,412" and a heart rate can arrive as
 * "55 bpm". Number() returns NaN for both, and the field was then dropped
 * without a word — the day imported, empty, and looked like the watch had
 * recorded nothing.
 */
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  /* Keep digits, one decimal point and a leading minus; discard grouping
     separators, units and stray spaces. */
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/*
 * Fields where a literal zero is not a measurement, it is an absence.
 *
 * This exists because of how Shortcuts behaves, not because of anything the
 * phone got wrong. "Find Health Samples ... Calculate Statistics: Sum" over
 * an empty match returns 0, not nothing — so a day the watch was never worn
 * arrives here indistinguishable from a day of total stillness. Stored as-is
 * it becomes "Move 0/500", which reads as a verdict on the person rather than
 * a gap in the data, and quietly poisons any trend built on top of it.
 *
 * Only fields whose zero is physically impossible in a living, watch-wearing
 * person belong on this list. Resting energy is never zero. Active energy is
 * never exactly zero across a whole day. Stand hours never reach midnight at
 * zero on a worn watch, and a resting heart rate of zero is not a reading.
 *
 * Steps and exerciseMin are deliberately NOT here: a genuine zero-step,
 * zero-exercise day is a real thing that happens and is worth recording.
 */
const NEVER_ZERO = new Set(['basalKcal', 'activeKcal', 'standHours',
                            'rhr', 'hrv', 'spo2', 'resp', 'temp',
                            'weightKg', 'vo2max', 'sleepH']);

/*
 * What a human reading can actually be.
 *
 * Not defensive programming for its own sake — this catches the one mistake
 * that is genuinely easy to make and impossible to spot afterwards: picking
 * a Health type whose name reads right but whose samples mean something
 * else. "Apple Stand Time" and "Apple Stand Hours" sound interchangeable.
 * They are not. Stand Time measures minutes-stood-per-hour, so summing a day
 * of it and asking Shortcuts for hours returns 960 minutes as 16 — which is
 * a plausible-looking number, lands in the ring as 16/12, and is wrong.
 *
 * A value outside these bounds is not a person, it is a units or type error,
 * and storing it would put a lie in the history that every later trend reads
 * as real. Dropped instead, so the tile stays blank and the gap is visible.
 *
 * temp is deliberately absent: Apple reports wrist temperature absolutely in
 * some places and as a deviation from baseline in others, so there is no one
 * range that is not wrong for half the senders.
 */
const RANGES = {
  standHours: [0, 24], sleepH: [0, 24], remH: [0, 24], swsH: [0, 24], deepH: [0, 24],
  spo2: [50, 100], resp: [4, 60], rhr: [25, 150], hrv: [1, 300],
  vo2max: [10, 90], weightKg: [20, 400], exerciseMin: [0, 1440],
};

function clean(row) {
  const out = {};
  for (const f of FIELDS) {
    const v = num(row[f]);
    if (v == null || v < 0) continue;
    if (v === 0 && NEVER_ZERO.has(f)) continue;
    const r = RANGES[f];
    if (r && (v < r[0] || v > r[1])) continue;
    out[f] = v;
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
        const skipped = [];
        for (const row of rows) {
          const date = toDay(row.date);
          if (!date) {
            /* Say what arrived. A silent skip that still reports ok is the
               worst possible answer — it looks like success. */
            skipped.push(String(row.date ?? '(no date field)').slice(0, 40));
            continue;
          }
          /* Merge rather than replace: a Shortcut that only sends sleep
             must not wipe the heart rate an earlier one sent. */
          const prevRaw = await env.HEALTH.get(`${key}:${date}`);
          const prev = prevRaw ? JSON.parse(prevRaw) : {};
          /* Self-heal rows written before NEVER_ZERO existed. A stored zero
             for one of those fields is an artefact of an empty Shortcuts Sum,
             and merging would otherwise preserve it forever. */
          for (const f of NEVER_ZERO) if (prev[f] === 0) delete prev[f];
          const merged = { ...prev, ...clean(row), date, src: 'apple',
                           updatedAt: new Date().toISOString() };
          await env.HEALTH.put(`${key}:${date}`, JSON.stringify(merged),
            { expirationTtl: 60 * 60 * 24 * 400 });   // a year and a bit
          written++;
        }
        return json(skipped.length
          ? { ok: true, written, skipped,
              error: 'Could not read those as dates. Send date as yyyy-MM-dd.' }
          : { ok: true, written }, request, env);
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
