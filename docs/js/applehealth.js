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
export function pushUrl(relay) {
  const base = (relay || get().settings?.relayUrl || '').replace(/\/+$/, '');
  return base ? `${base}/apple/push` : null;
}

/*
 * Which source a stored day came from.
 *
 * Rows written before sources were recorded are Whoop by construction —
 * it was the only importer that existed.
 */
export function rowSource(row) { return row?.src === 'apple' ? 'apple' : 'whoop'; }

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
  const base = (relay || store.settings?.relayUrl || '').replace(/\/+$/, '');
  const k = key || healthKey();
  if (!base) return { ok: false, error: 'No relay address set.' };
  if (!k) return { ok: false, error: 'No health key yet — generate one first.' };

  const prior = existingSource(store);
  if (prior === 'whoop') {
    return { ok: false, mixed: true,
      error: 'This app already holds Whoop data. Mixing the two would corrupt '
           + 'your HRV history — Whoop reports RMSSD and Apple reports SDNN, '
           + 'which are different scales for the same thing. Clear the Whoop '
           + 'import first if you want to switch.' };
  }

  let payload;
  try {
    const r = await fetch(`${base}/apple/pull`, { headers: { 'x-basal-key': k } });
    if (!r.ok) return { ok: false, error: `The relay answered ${r.status}.` };
    payload = await r.json();
  } catch (e) {
    return { ok: false, error: 'Could not reach the relay. ' + e.message };
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
      s.whoop.rows[r.date] = {
        ...prevRow,
        date: r.date,
        src: 'apple',
        ...(r.rhr    != null ? { rhr: r.rhr } : {}),
        ...(r.hrv    != null ? { hrv: r.hrv } : {}),
        ...(r.sleepH != null ? { sleepH: r.sleepH } : {}),
        ...(r.remH   != null ? { remH: r.remH } : {}),
        ...((r.swsH ?? r.deepH) != null ? { swsH: r.swsH ?? r.deepH } : {}),
        ...(kcal     != null ? { kcal } : {}),
      };
      added++;
    }
    s.whoop.importedAt = Date.now();
    s.settings.healthSyncedAt = Date.now();
  }, 'whoop');

  return { ok: true, days: added, from: rows[0].date, to: rows[rows.length - 1].date };
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
