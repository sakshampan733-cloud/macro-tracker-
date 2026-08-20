/*
 * Talking to Whoop through the relay.
 *
 * The tokens live here, on the device, exactly like the rest of your log.
 * The relay only ever holds the client secret — it stores nothing about you,
 * which is why losing it would cost you nothing but a reconnection.
 */

import { get, commit } from './store.js';

const KEY = 'basal.whoop.tokens';

export function relayUrl() {
  return (get().settings?.relayUrl || '').replace(/\/+$/, '');
}

export function tokens() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
  catch { return null; }
}

export function setTokens(t) {
  if (t) localStorage.setItem(KEY, JSON.stringify(t));
  else localStorage.removeItem(KEY);
}

export function isConnected() { return !!tokens(); }

/*
 * The callback hands tokens back in the URL fragment. Catch them on load,
 * store them, then strip the fragment so they do not sit in the address bar
 * or get carried into a bookmark.
 */
export function captureFromUrl() {
  const m = location.hash.match(/[#&]whoop=([^&]+)/);
  if (!m) return false;
  try {
    const t = JSON.parse(atob(decodeURIComponent(m[1])));
    if (!t.access_token) return false;
    setTokens(t);
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch {
    return false;
  }
}

export function connectUrl() {
  const base = relayUrl();
  if (!base) return null;
  const app = location.origin + location.pathname;
  return `${base}/auth?app=${encodeURIComponent(app)}`;
}

export async function checkRelay(url) {
  const base = (url || relayUrl()).replace(/\/+$/, '');
  if (!base) return { ok: false, error: 'No relay address set.' };
  try {
    const r = await fetch(`${base}/health`);
    if (!r.ok) return { ok: false, error: `The relay answered ${r.status}.` };
    const d = await r.json();
    if (!d.ok) return { ok: false, error: d.error || 'The relay is not configured.' };
    return { ok: true, redirectUri: d.redirect_uri };
  } catch (e) {
    return { ok: false, error: 'Could not reach that address. Check it and that the worker is deployed.' };
  }
}

async function freshToken() {
  const t = tokens();
  if (!t) return null;
  if (t.expires_at && t.expires_at > Date.now() + 90000) return t.access_token;

  const r = await fetch(`${relayUrl()}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: t.refresh_token }),
  });
  if (!r.ok) { setTokens(null); throw new Error('Whoop sign-in expired. Connect again.'); }
  const next = await r.json();
  setTokens(next);
  return next.access_token;
}

async function collect(path, token, start) {
  const out = [];
  let next = null, guard = 0;
  while (guard++ < 60) {
    const q = new URLSearchParams({ limit: '25', start });
    if (next) q.set('nextToken', next);
    const r = await fetch(`${relayUrl()}${path}?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 429) { await new Promise(s => setTimeout(s, 1500)); continue; }
    if (!r.ok) throw new Error(`Whoop returned ${r.status}`);
    const page = await r.json();
    out.push(...(page.records || []));
    next = page.next_token;
    if (!next) break;
  }
  return out;
}

/*
 * Pull recent cycles, recoveries and sleeps and reshape them into the same
 * rows the CSV import produces, so everything downstream — the day factor,
 * the percentiles, the correlations — is identical either way.
 */
export async function syncWhoop({ days = 180 } = {}) {
  if (!relayUrl()) throw new Error('No relay address set.');
  const token = await freshToken();
  if (!token) throw new Error('Not connected.');

  /*
   * Whoop retired v1 in favour of v2. Confirmed against their own migration
   * guide after the relay started 404ing: the paths rename one-for-one, but
   * recovery stops being nested under a cycle and becomes its own top-level
   * paginated collection, referencing cycle_id and sleep_id directly.
   */
  const start = new Date(Date.now() - days * 86400000).toISOString();
  const [cycles, recoveries, sleeps] = await Promise.all([
    collect('/v2/cycle', token, start),
    collect('/v2/recovery', token, start),
    collect('/v2/activity/sleep', token, start),
  ]);

  const byCycle = {};
  for (const c of cycles) {
    const sc = c.score || {};
    byCycle[c.id] = {
      end: c.end, strain: sc.strain,
      kcal: sc.kilojoule ? Math.round(sc.kilojoule / 4.184) : null,
    };
  }

  const bySleep = {};
  for (const s of sleeps) {
    const sc = s.score || {};
    const st = sc.stage_summary || {};
    const h = k => (st[k] || 0) / 3600000;
    bySleep[s.id] = {
      end: s.end,
      sleepH: +(h('total_in_bed_time_milli') - h('total_awake_time_milli')).toFixed(2) || null,
      remH: +h('total_rem_sleep_time_milli').toFixed(2) || null,
      swsH: +h('total_slow_wave_sleep_time_milli').toFixed(2) || null,
      sleepPerf: sc.sleep_performance_percentage,
      sleepEff: sc.sleep_efficiency_percentage,
      resp: sc.respiratory_rate,
    };
  }

  const rows = {};
  for (const rec of recoveries) {
    const sc = rec.score || {};
    const cyc = byCycle[rec.cycle_id] || {};
    const slp = bySleep[rec.sleep_id] || {};
    const iso = slp.end || cyc.end || rec.created_at;
    if (!iso) continue;
    const date = String(iso).slice(0, 10);
    const wake = String(slp.end || '').match(/T(\d{2}):(\d{2})/);

    rows[date] = {
      recovery: sc.recovery_score ?? null,
      rhr: sc.resting_heart_rate ?? null,
      hrv: sc.hrv_rmssd_milli ?? null,
      spo2: sc.spo2_percentage ?? null,
      temp: sc.skin_temp_celsius ?? null,
      strain: cyc.strain ?? null,
      kcal: cyc.kcal ?? null,
      sleepH: slp.sleepH ?? null,
      remH: slp.remH ?? null,
      swsH: slp.swsH ?? null,
      sleepPerf: slp.sleepPerf ?? null,
      sleepEff: slp.sleepEff ?? null,
      resp: slp.resp ?? null,
      debtH: null,
      wakeHour: wake ? +wake[1] + +wake[2] / 60 : null,
    };
  }

  const dates = Object.keys(rows).sort();
  if (!dates.length) throw new Error('Whoop returned no days. Is the strap syncing?');

  // Merge rather than replace, so a CSV import from before is not thrown away.
  commit(s => {
    const existing = s.whoop?.rows || {};
    s.whoop = { rows: { ...existing, ...rows }, importedAt: Date.now(), source: 'relay' };
  }, 'whoop');

  return { count: dates.length, from: dates[0], to: dates[dates.length - 1] };
}

export function disconnect() { setTokens(null); }
