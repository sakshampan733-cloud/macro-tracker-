/*
 * Apple Health.
 *
 * Apple has no web API. HealthKit lives on the phone, encrypted, readable
 * only by native apps the user has permitted — so unlike Whoop there is
 * nothing for a server to call. The phone pushes instead: a Shortcuts
 * automation reads the day's samples each morning and POSTs them to the
 * relay, and this pulls them down.
 *
 * Two things Apple does not have, and which are therefore not invented
 * here:
 *
 *   recovery — Whoop's own composite. Apple ships no equivalent, so the
 *              coaching rules that key on it simply stay quiet.
 *   strain   — likewise. Energy burned is real and gets used; a strain
 *              score would be a number with no referent.
 *
 * And one thing that looks compatible and is not: HRV. Whoop reports
 * RMSSD, Apple reports SDNN. They measure the same phenomenon on
 * different scales, and a series that silently switches between them
 * would produce a step change the app would read as a physiological
 * event. Sources are recorded per row and mixing is refused.
 */

import { get, commit } from './store.js';

const KEY_BYTES = 24;

export function healthKey() { return get().settings?.healthKey || null; }

export function makeHealthKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const key = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  commit(s => { s.settings.healthKey = key; }, 'settings');
  return key;
}

export function forgetHealthKey() {
  commit(s => { s.settings.healthKey = null; }, 'settings');
}

/* The endpoint your Shortcut posts to. */
/*
 * A relay address, tidied.
 *
 * Pasted addresses arrive with trailing newlines, stray spaces from a
 * share sheet, and often no scheme at all. fetch() rejects all of that
 * with "The string did not match the expected pattern", which tells the
 * person nothing about which string or which pattern.
 */
export function relayBase(relay) {
  let base = String(relay ?? get().settings?.relayUrl ?? '')
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, '')   /* spaces, newlines, zero-widths */
    .replace(/\/+$/, '');
  if (!base) return '';
  /* A bare host is what people paste when they copy from a dashboard. */
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  try {
    const u = new URL(base);
    /* A hostname with no dot in it is not a relay, it is a typo — "hello
       world" survives URL parsing perfectly happily otherwise. */
    if (!u.hostname.includes('.')) return '';
    return u.origin;
  } catch { return ''; }
}

export function pushUrl(relay) {
  const base = relayBase(relay);
  return base ? `${base}/apple/push` : null;
}

/*
 * Which source a stored day came from.
 *
 * Rows written before sources were recorded are Whoop by construction —
 * it was the only importer that existed.
 */
export function rowSource(row) { return row?.src === 'apple' ? 'apple' : 'whoop'; }

/*
 * Which bands you actually wear.
 *
 * Four answers, and the app behaves differently for each — not because
 * the cases are hard, but because guessing wrong is worse than asking.
 * Someone with both devices should be offered both syncs; someone with
 * neither should not be shown a sync button at all.
 */
export const HEALTH_SOURCES = ['none', 'whoop', 'apple', 'both'];

export function healthSource() {
  const v = get().settings?.healthSource;
  return HEALTH_SOURCES.includes(v) ? v : null;
}

export function setHealthSource(v) {
  if (!HEALTH_SOURCES.includes(v)) return;
  commit(s => { s.settings.healthSource = v; }, 'settings');
}

/*
 * What Apple is allowed to write when you wear both.
 *
 * Whoop's API does not return step counts, so steps are a genuine gap and
 * Apple can fill them without any risk of disagreement. Everything else
 * Apple offers, Whoop already measures — and taking Apple's version would
 * not add a reading, it would overwrite one. HRV is the sharp case: Whoop
 * reports RMSSD and Apple reports SDNN, and the same wrist on the same
 * night produces numbers that differ by a factor of two or more. A trend
 * built from both is not a noisy trend, it is a meaningless one.
 */
/*
 * What each band can actually measure.
 *
 * The app should not mention hardware you do not own. Someone with an
 * Apple Watch has no Recovery score and never will — it is Whoop's own
 * calculation, not a measurement — so showing them an empty Recovery row,
 * or the word "Whoop" at all, is the app talking about somebody else's
 * wrist. Equally, a Whoop user has no step count, because Whoop's API
 * withholds it, and a blank Steps row would look like a fault.
 *
 * So capability is declared once here and every screen asks rather than
 * assuming.
 */
export const CAPABILITY = {
  whoop: ['recovery', 'strain', 'hrv', 'rhr', 'sleepH', 'remH', 'swsH',
          'kcal', 'spo2', 'resp', 'temp', 'sleepPerf', 'debtH'],
  apple: ['steps', 'hrv', 'rhr', 'sleepH', 'remH', 'swsH', 'kcal',
          'spo2', 'resp', 'temp', 'vo2max', 'weightKg'],
};

/* Which metrics the setup you declared can produce at all. */
export function canMeasure(metric, mode = null) {
  const m = mode || healthSource();
  if (m === 'both') {
    return CAPABILITY.whoop.includes(metric) || CAPABILITY.apple.includes(metric);
  }
  if (m === 'whoop') return CAPABILITY.whoop.includes(metric);
  if (m === 'apple') return CAPABILITY.apple.includes(metric);
  /* Nothing declared: fall back to permissive, since hiding a row someone
     already has data for is worse than showing one they do not. */
  return true;
}

/*
 * What to call the band on screen. An Apple-only user should never read
 * the word Whoop, and vice versa.
 */
export function bandName(mode = null) {
  const m = mode || healthSource();
  if (m === 'apple') return 'Apple Health';
  if (m === 'whoop') return 'Whoop';
  if (m === 'both') return 'your bands';
  return 'your band';
}

export const APPLE_GAP_FIELDS = ['steps', 'standH', 'exerciseMin'];

/*
 * Where one metric's numbers came from, judged on the recent rows rather
 * than on a global setting — the setting says what you wear now, the rows
 * say what actually produced the history you are looking at.
 */
export function sourceForMetric(store, metric, lastN = 30) {
  const rows = Object.entries(store.whoop?.rows || {}).sort().slice(-lastN).map(e => e[1]);
  let apple = 0, whoop = 0;
  for (const r of rows) {
    if (r?.[metric] == null) continue;
    const by = r.by?.[metric] || rowSource(r);
    if (by === 'apple') apple++; else whoop++;
  }
  if (!apple && !whoop) return null;
  return apple > whoop ? 'apple' : 'whoop';
}

export function existingSource(store) {
  const rows = Object.values(store.whoop?.rows || {});
  if (!rows.length) return null;
  const apple = rows.filter(r => rowSource(r) === 'apple').length;
  return apple > rows.length / 2 ? 'apple' : 'whoop';
}

/*
 * Pull whatever the phone has pushed and fold it into the day rows.
 *
 * Whoop's own fields are left untouched where both exist: Whoop measures
 * more, and the app's day factor and coaching were built against it.
 */
export async function syncApple({ relay, key } = {}) {
  const store = get();
  const base = relayBase(relay);
  const k = key || healthKey();
  if (!base) {
    return { ok: false, error: 'No relay address set, or the one saved is not a '
      + 'usable web address. Set it under Whoop live sync.' };
  }
  if (!k) return { ok: false, error: 'No health key yet — generate one first.' };

  /* Both bands is a supported setup, not a conflict — but it means Apple
     fills only what Whoop cannot measure. Without a declared setup, fall
     back to the old rule and refuse rather than guess. */
  const mode = healthSource();
  const prior = existingSource(store);
  const gapsOnly = mode === 'both' || (mode == null && prior === 'whoop');

  if (mode == null && prior === 'whoop') {
    return { ok: false, mixed: true,
      error: 'This app already holds Whoop data. Tell it you wear both bands '
           + 'and Apple will fill only the gaps — steps, which Whoop\u2019s API '
           + 'does not return. Left to merge freely it would overwrite your '
           + 'HRV history with a different measure of it: Whoop reports RMSSD, '
           + 'Apple reports SDNN.' };
  }

  let payload;
  try {
    const r = await fetch(`${base}/apple/pull`, { headers: { 'x-basal-key': k } });
    if (!r.ok) return { ok: false, error: `The relay answered ${r.status}.` };
    payload = await r.json();
  } catch (e) {
    return { ok: false,
      error: `Could not reach ${base}/apple/pull — ${e.message}. `
           + 'Check the relay address under Whoop live sync.' };
  }

  const rows = payload.rows || [];
  if (!rows.length) {
    return { ok: true, days: 0,
      note: 'The relay has nothing yet. Run the Shortcut once on your phone.' };
  }

  let added = 0;
  commit(s => {
    s.whoop = s.whoop || { rows: {}, importedAt: null };
    for (const r of rows) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) continue;
      const prevRow = s.whoop.rows[r.date] || {};
      /* Apple gives total energy as active + basal; the app's day factor
         compares total burn against your own average, so both are needed
         and active alone would understate a rest day badly. */
      const kcal = r.kcal ?? (r.activeKcal != null && r.basalKcal != null
        ? r.activeKcal + r.basalKcal : r.activeKcal);
      /* Provenance is recorded per field, not per row. A day where Whoop
         gave the HRV and Apple gave the steps is the normal case for
         someone wearing both, and a single row-level label could only
         lie about one of them. */
      const by = { ...(prevRow.by || {}) };
      const take = {};
      const put = (field, value) => {
        if (value == null) return;
        take[field] = value;
        by[field] = 'apple';
      };

      /* Steps are the gap Whoop leaves, so they come across in every mode. */
      put('steps', r.steps);

      if (!gapsOnly) {
        put('rhr', r.rhr);
        put('hrv', r.hrv);
        put('sleepH', r.sleepH);
        put('remH', r.remH);
        put('swsH', r.swsH ?? r.deepH);
        put('kcal', kcal);
        /* An Apple Watch measures these too — Series 6 upwards for blood
           oxygen, Series 8 upwards for wrist temperature, and respiratory
           rate overnight. Without them an Apple-only Body tab was three
           rows emptier than it needed to be. */
        put('spo2', r.spo2);
        put('resp', r.resp);
        put('temp', r.temp);
        put('vo2max', r.vo2max);
      }

      s.whoop.rows[r.date] = {
        ...prevRow,
        date: r.date,
        src: gapsOnly ? (prevRow.src || 'whoop') : 'apple',
        by,
        ...take,
      };

      /* A weigh-in is not a vital sign — it belongs on the day, where the
         trend line and the adaptive TDEE read it from. Never overwrite a
         weight already entered by hand. */
      if (r.weightKg > 20 && r.weightKg < 400) {
        s.days = s.days || {};
        const d = s.days[r.date] || (s.days[r.date] =
          { entries: [], water: [], weight: null, note: '', supps: [] });
        if (d.weight == null) d.weight = +Number(r.weightKg).toFixed(1);
      }

      added++;
    }
    s.whoop.importedAt = Date.now();
    s.settings.healthSyncedAt = Date.now();
  }, 'whoop');

  return { ok: true, days: added, gapsOnly,
           from: rows[0].date, to: rows[rows.length - 1].date };
}

/*
 * The Shortcut, written out.
 *
 * Kept here rather than in a document so it can quote the user's own
 * relay address and key — the two things every set of generic
 * instructions on the internet leaves as a blank you have to work out.
 */
export function shortcutSteps(relay, key) {
  const url = pushUrl(relay) || 'https://YOUR-RELAY/apple/push';
  return { url, key: key || 'YOUR-KEY' };
}

/*
 * Pull on opening, without being asked.
 *
 * The phone pushes to the relay on a schedule, but the app was only
 * fetching when somebody went to Settings and tapped a button — which
 * makes an automatic pipeline end in a manual step, and means the data is
 * always as stale as the last time you remembered.
 *
 * Throttled to once an hour: the Shortcut runs daily, so checking on every
 * single app open would be a request per glance for nothing.
 */
export async function autoSyncApple() {
  const s = get();
  const mode = healthSource();
  if (mode !== 'apple' && mode !== 'both') return false;
  if (!healthKey() || !(s.settings?.relayUrl || '').trim()) return false;

  const last = s.settings.healthPulledAt || 0;
  if (Date.now() - last < 60 * 60 * 1000) return false;

  const r = await syncApple({});
  commit(st => { st.settings.healthPulledAt = Date.now(); }, 'settings');
  return !!(r && r.ok && r.days);
}
