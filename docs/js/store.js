/*
 * Persistence and the day model.
 *
 * Everything lives in localStorage under one key, versioned, with a full
 * JSON export. The server also accepts a nightly snapshot, so clearing
 * Safari's storage can't take the log with it.
 */

import { per100For, STYLES } from './dishes.js';
import { MICROS, NUTRIENTS } from './data/nutrients.js';
import { supplementMicros } from './data/supplements.js';
import { PRESETS as PRESET_TYPES } from './data/workouts.js';

const KEY = 'basal.v1';
const LEGACY_KEYS = ['assay.v1'];   // the app was called Assay before this
const listeners = new Set();

export const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];

/*
 * How the amount was determined. This is the backbone of the app: an entry
 * is not just a number, it is a measurement with a known method, and the
 * method sets how far the number can be off.
 */
export const METHODS = {
  weighed:  { label: 'Weighed',   short: 'WGH', sigma: 0.02, hint: 'On a scale, in grams' },
  label:    { label: 'Label',     short: 'LBL', sigma: 0.05, hint: 'Packaged serving or barcode' },
  portion:  { label: 'Portion',   short: 'PTN', sigma: 0.12, hint: 'Standard household serving' },
  estimate: { label: 'Estimated', short: 'EST', sigma: 0.25, hint: 'Eyeballed, or eaten out' },
  dish:     { label: 'Home dish',  short: 'HOM', sigma: 0.18, hint: 'Weighed serving, density being learned' },
};

/* A composite dish varies by whoever cooked it, on top of the method error. */
export const GRADE_MULT = { A: 1.0, B: 1.2, C: 1.6, D: 2.2 };

/*
 * Current best density for each home-cooked style, kcal per gram, refreshed
 * by the app whenever the log changes.
 *
 * A home-dish entry deliberately stores grams and a style, never fixed
 * macros. The grams are a fact; the density is an estimate that sharpens
 * over weeks. Resolving it at read time means the day you logged three
 * weeks ago corrects itself once the app works out what your dal actually
 * is, instead of staying quietly wrong forever.
 */
let dishDensities = {};

export function setDishDensities(map) { dishDensities = map || {}; }
export function getDishDensity(style) { return dishDensities[style] || null; }

const EMPTY = () => ({
  v: 1,
  profile: null,
  targets: null,
  days: {},
  library: {},
  meals: {},
  supplementsTaken: [],     // which supplement ids the user actually takes
  medications: [],          // prescriptions, kept apart from supplements
  /* What the watch recorded, kept whole and separate from the merged
     whoop rows so "show me only Apple" has something to show. */
  appleHealth: { rows: {}, importedAt: null },
  favourites: [],           // food ids starred for the top of the list
  hidden: [],               // refs you never want suggested again
  blood: {},                // blood panels, keyed by id
  goal: null,               // { startKg, targetKg, startDate, byDate }
  plans: {},                // date -> [ planned items ], a day rehearsed before it happens
  recipes: {},
  cache: {},
  whoop: { rows: {}, importedAt: null },
  settings: {
    openGroups: [],        // which settings categories are expanded
    guideSeen: false,      // the first-run walkthrough has been shown
    healthKey: null,       // ties an iPhone Shortcut to this app
    healthSyncedAt: null,
    units: 'metric',
    diet: 'all',
    waterUnit: 'ml',
    glassMl: 250,
    autoBackup: true,
    tdeeSource: 'auto',
    checkInDays: 14,        // fortnight by default — see the Body screen for why
    energyView: 'remaining',
    explain: true,          // show the teaching text, or just the numbers
    theme: 'dark',          // 'dark' | 'light' | 'auto'
    isDemo: false,          // generated data is loaded, not real logging
    relayUrl: '',           // Cloudflare worker that fronts Whoop
    limitsOpen: false,
    microOpen: false,
    suppsOpen: false,
    lastCheckInSeen: null,
  },
});

let state = load();

function load() {
  try {
    let raw = localStorage.getItem(KEY);

    /*
     * Carry over a log written under the old name. Renaming the app must
     * never cost someone their history, and a bare key change silently
     * would — the data would still be sitting in the browser, invisible.
     */
    if (!raw) {
      for (const old of LEGACY_KEYS) {
        const legacy = localStorage.getItem(old);
        if (legacy) {
          localStorage.setItem(KEY, legacy);
          localStorage.removeItem(old);
          raw = legacy;
          console.info(`Carried your log over from ${old}.`);
          break;
        }
      }
    }

    if (!raw) return EMPTY();
    const parsed = JSON.parse(raw);
    return { ...EMPTY(), ...parsed, settings: { ...EMPTY().settings, ...(parsed.settings || {}) } };
  } catch (e) {
    console.warn('Stored data unreadable, starting fresh', e);
    return EMPTY();
  }
}

let saveTimer = null;

function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    // Quota is the only realistic failure here. Say so plainly.
    emit('error', 'Storage is full. Export a backup from Settings, then clear old barcode cache.');
    return false;
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 120);
}

/*
 * Write immediately, discarding the debounce.
 *
 * The debounce exists so that dragging a portion slider does not hammer
 * localStorage, but it opened a 120 ms window in which the app could be
 * suspended with a logged meal still only in memory. iOS freezes a
 * backgrounded PWA quickly and without warning, so a food logged and
 * immediately switched away from was genuinely lost.
 *
 * pagehide and visibilitychange are the only events mobile reliably
 * delivers — beforeunload is not fired when the system kills a suspended
 * tab, so it cannot be the safety net.
 */
export function flush() {
  if (saveTimer === null) return false;
  return writeNow();
}

function emit(evt, payload) {
  listeners.forEach(fn => fn(evt, payload));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function get() { return state; }

export function commit(mutator, evt = 'change') {
  mutator(state);
  persist();
  emit(evt, state);
}

/* ── Dates ──────────────────────────────────────────────────────────── */

export function dayKey(d = new Date()) {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 10);
}

/*
 * The day you are still logging, which is not always the day the clock is on.
 *
 * A day ends when you stop eating, not at midnight. Someone finishing
 * dinner at half past one has not started tomorrow, and an app that rolls
 * over on the clock puts that meal on a day they have not lived yet — and
 * then reports both days wrong.
 *
 * So the open day is a stored fact, moved only when the person says so.
 * With one exception: if the clock has run more than a day ahead, they
 * were not up all night, they simply did not open the app. Asking "are
 * you still on Tuesday?" on Friday is not a question worth asking, so
 * that case moves on its own.
 */
/*
 * Remember which day the app was last used on, so midnight can be noticed.
 *
 * The rollover prompt could never fire. It compares the open day against
 * today, and the open day was only ever written when somebody answered the
 * prompt — so on a fresh install, or for anybody who had not already used
 * the feature, there was nothing stored, the getter fell back to today,
 * and the day rolled at midnight in silence. Which is the exact thing the
 * whole feature exists to prevent.
 *
 * Called once at boot, before anything renders: if there is no open day
 * yet, the last day the app was used is the honest answer, and that is
 * what makes "it is tomorrow, are you done?" possible at 00:11.
 */
export function noteAppOpen() {
  const today = dayKey();
  commit(s => {
    s.settings = s.settings || {};
    if (!s.settings.openDay) s.settings.openDay = s.settings.lastOpen || today;
    s.settings.lastOpen = today;
  }, 'settings');
}

export function openDay() {
  const s = get();
  const stored = s.settings?.openDay;
  const today = dayKey();
  if (!stored || stored > today) return today;
  const gapDays = Math.round(
    (new Date(today + 'T12:00:00') - new Date(stored + 'T12:00:00')) / 86400000);
  return gapDays > 1 ? today : stored;
}

/* True when the clock has passed midnight but the person has not. */
export function dayPending() {
  return openDay() !== dayKey();
}

export function startNewDay() {
  commit(s => { s.settings.openDay = dayKey(); }, 'settings');
}

/* Staying put explicitly: the same value the getter already returns, but
   written down, so the prompt can stop asking for the rest of the night. */
export function keepDayOpen(key) {
  commit(s => {
    s.settings.openDay = key;
    s.settings.openDayAsked = dayKey();
  }, 'settings');
}

export function rolloverAsked() {
  return get().settings?.openDayAsked === dayKey();
}

export function shiftDay(key, n) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

const BLANK_DAY = Object.freeze({ entries: [], water: [], weight: null, note: '', supps: [] });

/*
 * The writable day record, created on demand. Only call this inside a
 * commit — it mutates the store, so using it to *read* a date silently
 * fills state.days with blank records every time you page backwards.
 */
export function day(key = dayKey()) {
  if (!state.days[key]) {
    state.days[key] = { entries: [], water: [], weight: null, note: '', supps: [] };
  }
  if (!state.days[key].supps) state.days[key].supps = [];
  return state.days[key];
}

/* The read-only view. Returns a shared blank for days that don't exist
   rather than bringing them into being. */
export function peekDay(key = dayKey()) {
  return state.days[key] || BLANK_DAY;
}

export function loggedDays() {
  return Object.keys(state.days).filter(k => state.days[k].entries.length).sort();
}

/* ── Entries ────────────────────────────────────────────────────────── */

const uid = () => Math.random().toString(36).slice(2, 10);

/*
 * Scale a per-100 g nutrient block to an actual gram amount, carrying the
 * measurement uncertainty with it. Absolute sigma is in kcal.
 */
export function macrosFor(per100, grams) {
  const k = grams / 100;
  const n = {};
  for (const key of ['kcal', 'p', 'c', 'f', 'fib', 'sug', 'sat', 'na', 'alc']) {
    const v = per100[key];
    n[key] = v == null ? 0 : +(v * k);
  }
  return n;
}

/*
 * Micronutrients for one entry, or null if there is nothing to report.
 *
 * Only reference-database foods carry micronutrient data (looked up by
 * `ref`, e.g. 'chicken-breast-ckd'). A custom food, a Pot recipe or a home
 * dish has none — and the honest response to that is null, not zero. Zero
 * would read as "this food has no iron," when the truth is "the app was
 * never told." Totals below track how much of the day actually had data,
 * for exactly this reason.
 */
export function microsFor(entry) {
  const id = (entry.ref || '').replace(/^off:|^my:|^dish:/, '');
  const row = MICROS[id];
  if (!row) return null;
  const k = entry.grams / 100;
  const out = {};
  for (const key in row) out[key] = row[key] * k;
  return out;
}

/*
 * An entry's macros.
 *
 * For a home dish this is recomputed from the live density estimate, so
 * history improves as the estimate does. Everything else uses the numbers
 * captured when it was logged.
 */
export function entryMacros(entry) {
  if (entry.dish && STYLES[entry.dish]) {
    const d = dishDensities[entry.dish] || null;
    return macrosFor(per100For(entry.dish, d), entry.grams);
  }
  return macrosFor(entry.per100, entry.grams);
}

export function entrySigma(entry) {
  if (entry.dish && STYLES[entry.dish]) {
    // The uncertainty is the density's, scaled by how much you ate — not a
    // percentage of a number the app was never confident about.
    const d = dishDensities[entry.dish];
    const sd = d ? d.sd : (entry.densitySd || 0.2);
    return entry.grams * sd;
  }
  const m = METHODS[entry.method] || METHODS.portion;
  const mult = GRADE_MULT[entry.grade] || 1.3;
  const kcal = macrosFor(entry.per100, entry.grams).kcal;
  return kcal * m.sigma * mult;
}

export function addEntry(key, entry) {
  const e = {
    id: uid(),
    ts: Date.now(),
    meal: entry.meal || mealForNow(),
    method: entry.method || 'portion',
    grade: entry.grade || 'C',
    ...entry,
  };
  commit(s => { day(key).entries.push(e); }, 'entry:add');
  return e;
}

export function updateEntry(key, id, patch) {
  commit(s => {
    const d = day(key);
    const i = d.entries.findIndex(e => e.id === id);
    if (i >= 0) d.entries[i] = { ...d.entries[i], ...patch };
  }, 'entry:update');
}

export function removeEntry(key, id) {
  commit(s => {
    const d = day(key);
    d.entries = d.entries.filter(e => e.id !== id);
  }, 'entry:remove');
}

export function mealForNow(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 18.5) return 'snack';
  return 'dinner';
}

/*
 * Day totals, with uncertainty propagated correctly.
 *
 * Independent measurement errors add in quadrature, not linearly — logging
 * twenty carefully weighed items does not make the day twenty times more
 * uncertain. sigma_total = sqrt(sum(sigma_i^2)).
 */
export function totals(key = dayKey()) {
  const d = peekDay(key);
  const sum = { kcal: 0, p: 0, c: 0, f: 0, fib: 0, sug: 0, sat: 0, na: 0, alc: 0 };
  let varSum = 0;

  const micro = Object.fromEntries(Object.keys(NUTRIENTS).map(k => [k, 0]));
  let microKcal = 0;   // calories from entries that DID carry micro data

  for (const e of d.entries) {
    const m = entryMacros(e);
    for (const k in sum) sum[k] += m[k] || 0;
    const s = entrySigma(e);
    varSum += s * s;

    const mic = microsFor(e);
    if (mic) {
      for (const k in micro) micro[k] += mic[k] || 0;
      microKcal += m.kcal || 0;
    }
  }

  /*
   * Supplements count toward micronutrients but not toward calories.
   * A multivitamin is real vitamin D even though the food log never saw it,
   * and leaving it out would keep flagging a deficit already closed.
   */
  const supp = supplementMicros(d.supps || [], state);
  for (const k in supp.micros) micro[k] = (micro[k] || 0) + supp.micros[k];

  const sigma = Math.sqrt(varSum);
  return {
    ...sum,
    sigma,
    // A single honest number for "how well do I actually know today?"
    confidence: sum.kcal > 0 ? 1 - Math.min(0.5, sigma / sum.kcal) : 1,
    water: (d.water || []).reduce((a, w) => a + w.ml, 0),
    count: d.entries.length,
    micro,
    suppOmega3: supp.omega3,
    suppCount: (d.supps || []).length,
    // What share of today's calories actually carried micronutrient data —
    // the figure the UI uses to say "this is a partial picture" honestly.
    microCoverage: sum.kcal > 0 ? microKcal / sum.kcal : 0,
  };
}

export function byMeal(key = dayKey()) {
  const d = peekDay(key);
  const out = {};
  for (const m of MEALS) out[m] = [];
  for (const e of d.entries) (out[e.meal] || (out[e.meal] = [])).push(e);
  for (const m in out) out[m].sort((a, b) => a.ts - b.ts);
  return out;
}

/* ── Water ──────────────────────────────────────────────────────────── */

export function addWater(key, ml) {
  commit(s => { day(key).water.push({ ts: Date.now(), ml }); }, 'water');
}

export function undoWater(key) {
  commit(s => { day(key).water.pop(); }, 'water');
}

/* ── Planning a day before you eat it ──────────────────────────────────
 *
 * A plan is not a log. Logging tomorrow's dinner tonight would put the
 * calories in the wrong day and destroy every timing signal the app has —
 * meal spacing, the gap since eating, how late the last meal was. So
 * planned items live in their own store and move into the log only when
 * you say you have actually eaten them, stamped at that moment.
 */

export function planFor(key) { return (state.plans && state.plans[key]) || []; }

export function addPlanned(key, item) {
  /* The spread has to come first. With it last, an item that already
     carries an id — anything re-planned from an existing row, which is
     exactly what a swap does — kept the old id, and two planned rows
     sharing an id meant removing one removed the other. */
  const it = { ...item, id: uid(), meal: item.meal || 'lunch' };
  commit(s => {
    s.plans = s.plans || {};
    (s.plans[key] = s.plans[key] || []).push(it);
  }, 'plan');
  return it;
}

export function removePlanned(key, id) {
  commit(s => {
    if (!s.plans?.[key]) return;
    s.plans[key] = s.plans[key].filter(p => p.id !== id);
  }, 'plan');
}

export function updatePlanned(key, id, patch) {
  commit(s => {
    const list = s.plans?.[key];
    if (!list) return;
    const i = list.findIndex(p => p.id === id);
    if (i >= 0) list[i] = { ...list[i], ...patch };
  }, 'plan');
}

export function clearPlan(key) {
  commit(s => { if (s.plans) delete s.plans[key]; }, 'plan');
}

/* What the plan comes to, using the same maths as a logged day. */
export function planTotals(key) {
  const sum = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
  for (const it of planFor(key)) {
    const m = macrosFor(it.per100, it.grams);
    for (const k in sum) sum[k] += m[k] || 0;
  }
  return sum;
}

/*
 * Eat a planned item for real.
 *
 * Stamped now, not at the hour it was planned for — the whole reason a
 * plan is kept separate is so that when you actually eat matters.
 */
export function eatPlanned(key, id) {
  const it = planFor(key).find(p => p.id === id);
  if (!it) return null;
  const entry = addEntry(key, {
    name: it.name, brand: it.brand || '', ref: it.ref || null,
    barcode: it.barcode || null, per100: it.per100, serv: it.serv || [],
    grams: it.grams, method: it.method || 'portion', grade: it.grade || 'C',
    meal: it.meal, fromPlan: true,
  });
  removePlanned(key, id);
  return entry;
}

/* ── Weight ─────────────────────────────────────────────────────────── */

export function setWeight(key, kg) {
  commit(s => { day(key).weight = kg; }, 'weight');
}

/* A weigh-in typed by mistake had no way back — the only entry in the app
   that could be written and never unwritten. */
export function clearWeight(key) {
  commit(s => { if (s.days?.[key]) delete s.days[key].weight; }, 'weight');
}

export function weightSeries() {
  return Object.entries(state.days)
    .filter(([, d]) => d.weight)
    .map(([k, d]) => ({ date: k, kg: d.weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Favourites ─────────────────────────────────────────────────────── */

/* The handful of foods that should never need searching for. */
export function toggleFavourite(id) {
  if (!id) return;
  commit(s => {
    s.favourites = s.favourites || [];
    const i = s.favourites.indexOf(id);
    if (i >= 0) s.favourites.splice(i, 1);
    else s.favourites.unshift(id);
  }, 'favourites');
}

export function isFavourite(id) {
  return !!(state.favourites || []).includes(id);
}

export function favouriteIds() { return [...(state.favourites || [])]; }

/*
 * Hiding a suggestion.
 *
 * "Most eaten" and "Recent" are computed from your log, so there is
 * nothing to delete — the history is real and should stay. What you can
 * say is "stop offering me this", which is a different claim and the one
 * actually wanted: a food logged once by mistake should not sit at the
 * top of the grid forever, and not everything you ate is something you
 * want on screen when someone is looking over your shoulder.
 */
export function toggleHidden(ref) {
  if (!ref) return;
  commit(s => {
    s.hidden = s.hidden || [];
    const i = s.hidden.indexOf(ref);
    if (i >= 0) s.hidden.splice(i, 1);
    else s.hidden.push(ref);
  }, 'hidden');
}

export function isHidden(ref) { return !!(state.hidden || []).includes(ref); }

/* Favourites, resolved to something the grid can render. */
export function favouriteFoods() {
  const want = new Set(state.favourites || []);
  if (!want.size) return [];
  const found = new Map();

  for (const id of want) {
    const lib = state.library[id];
    if (lib) found.set(id, { ...lib, ref: id });
  }
  // anything starred that lives in the reference database or only in the log
  for (const k in state.days) {
    for (const e of state.days[k].entries) {
      const rid = e.ref || e.name;
      if (want.has(rid) && !found.has(rid)) {
        found.set(rid, { name: e.name, brand: e.brand, per100: e.per100, grade: e.grade,
                         ref: e.ref, grams: e.grams, method: e.method, serv: e.serv || [] });
      }
    }
  }
  return [...found.values()];
}

/* ── Supplements ────────────────────────────────────────────────────── */

/* Which supplements this person actually takes — the shortlist that shows
   up each day, rather than the whole catalogue. */
export function setSupplementList(ids) {
  commit(s => { s.supplementsTaken = [...ids]; }, 'supplements');
}

export function toggleSupplement(key, id) {
  commit(s => {
    const d = day(key);
    const i = d.supps.indexOf(id);
    if (i >= 0) d.supps.splice(i, 1);
    else d.supps.push(id);
  }, 'supplements');
}

/* ── Medication ─────────────────────────────────────────────────────
 *
 * Kept in its own list rather than folded into supplements. A supplement
 * is a choice you can change on a whim; a prescription has a schedule
 * somebody else set, and missing one is a different kind of event from
 * skipping creatine. The app records both facts — that it was due, and
 * whether it was taken — without ever having an opinion about the
 * schedule itself.
 */
export function medications() { return state.medications || []; }

export function addMedication(med) {
  const m = {
    id: 'med:' + uid(),
    name: '', nickname: '', ref: null, purpose: '',
    mg: null, unit: 'mg', perDose: 1,
    times: [],                 // ['08:00', '21:00']
    addedAt: Date.now(),
    ...med,
  };
  commit(s => { s.medications = s.medications || []; s.medications.push(m); }, 'meds');
  return m;
}

export function updateMedication(id, patch) {
  commit(s => {
    const i = (s.medications || []).findIndex(m => m.id === id);
    if (i >= 0) s.medications[i] = { ...s.medications[i], ...patch };
  }, 'meds');
}

export function removeMedication(id) {
  commit(s => { s.medications = (s.medications || []).filter(m => m.id !== id); }, 'meds');
}

/*
 * Doses are recorded per day and per scheduled time, so "took the morning
 * one late" and "skipped the evening one" stay distinguishable — which is
 * the distinction the report is built on.
 */
export function doseKey(medId, time) { return `${medId}@${time}`; }

export function takeDose(key, medId, time, at = Date.now()) {
  commit(s => {
    const d = day(key);
    d.doses = d.doses || {};
    d.doses[doseKey(medId, time)] = { at, time, medId };
  }, 'meds');
}

export function untakeDose(key, medId, time) {
  commit(s => {
    const d = day(key);
    if (d.doses) delete d.doses[doseKey(medId, time)];
  }, 'meds');
}

export function dosesFor(key) { return peekDay(key).doses || {}; }

/*
 * Every dose that was due on a day, with whether and when it was taken.
 * A medication added on Tuesday is not counted as missed on Monday.
 */
export function doseLog(key) {
  const taken = dosesFor(key);
  const dayStart = new Date(key + 'T00:00:00').getTime();
  const out = [];
  for (const m of medications()) {
    if (m.addedAt && m.addedAt > dayStart + 864e5) continue;
    for (const time of m.times || []) {
      const rec = taken[doseKey(m.id, time)];
      let lateMin = null;
      if (rec) {
        const [hh, mm] = time.split(':').map(Number);
        const due = new Date(key + 'T00:00:00');
        due.setHours(hh, mm, 0, 0);
        lateMin = Math.round((rec.at - due.getTime()) / 60000);
      }
      out.push({ med: m, time, taken: !!rec, at: rec?.at || null, lateMin });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/*
 * Coach notes you have read and want gone.
 *
 * Dismissal is per day rather than forever: "you haven't eaten since you
 * woke up" is true again tomorrow morning, and a note you silenced once
 * should not be silenced for good. The id is the headline, which is
 * stable for a given rule and changes when the rule's numbers change —
 * which is exactly when you want to see it again.
 */
export function dismissNote(key, id) {
  commit(s => {
    const d = day(key);
    d.dismissed = d.dismissed || [];
    if (!d.dismissed.includes(id)) d.dismissed.push(id);
  }, 'coach');
}

export function noteDismissed(key, id) {
  return (peekDay(key).dismissed || []).includes(id);
}

export function restoreNotes(key) {
  commit(s => { day(key).dismissed = []; }, 'coach');
}

export function suppsTaken(key = dayKey()) {
  return peekDay(key).supps || [];
}

/* ── Saved meals ────────────────────────────────────────────────────── */

/*
 * A meal you eat the same way most days, stored once and logged in a tap.
 *
 * It keeps each item's own numbers rather than a single combined total, so
 * a saved breakfast still shows as eggs, whites and bread in the timeline —
 * and swapping one item out later is an edit, not a rebuild. Home dishes
 * keep their style rather than a frozen calorie figure, so a saved meal
 * containing dal still improves as the app learns your kitchen.
 */
export function saveMeal(name, entries, meal) {
  const items = entries.map(e => ({
    name: e.name, brand: e.brand || '', ref: e.ref || null, barcode: e.barcode || null,
    per100: e.per100, serv: e.serv || [], grams: e.grams,
    method: e.method, grade: e.grade,
    dish: e.dish || null,
  }));
  const id = 'meal:' + uid();
  const record = {
    id, name: name.trim(), meal: meal || mealForNow(),
    items, createdAt: Date.now(), lastUsed: null, uses: 0,
  };
  commit(s => { s.meals[id] = record; }, 'meals');
  return record;
}

export function deleteMeal(id) {
  commit(s => { delete s.meals[id]; }, 'meals');
}

export function updateMeal(id, patch) {
  commit(s => { if (s.meals[id]) Object.assign(s.meals[id], patch); }, 'meals');
}

export function renameMeal(id, name) {
  commit(s => { if (s.meals[id]) s.meals[id].name = name.trim(); }, 'meals');
}

/*
 * Log a saved meal.
 *
 * You almost never eat exactly what you saved. `scale` multiplies the whole
 * meal — half a portion, a double serving — and `grams` overrides single
 * items, for the evening you took 250 g of rice instead of 200. Each
 * logging gets its own `mealGroup` so the day can show "Fried rice" as one
 * line that opens into its parts, rather than scattering five ingredients
 * through the log with no sign they were one plate.
 */
export function logMeal(key, id, opts = {}) {
  const m = state.meals[id];
  if (!m) return 0;

  // Callers used to pass the sitting as a bare third argument.
  const o = typeof opts === 'string' ? { targetMeal: opts } : (opts || {});
  const when = o.targetMeal || m.meal || mealForNow();
  const scale = o.scale > 0 ? o.scale : 1;
  const grams = o.grams || {};
  const group = 'mg:' + uid();

  commit(s => {
    const d = day(key);
    m.items.forEach((it, i) => {
      const g = grams[i] != null ? grams[i] : (it.grams || 0) * scale;
      if (!(g > 0)) return;                 // an item scaled to nothing is not eaten
      d.entries.push({
        id: uid(), ts: Date.now(), meal: when,
        name: it.name, brand: it.brand, ref: it.ref, barcode: it.barcode,
        per100: it.per100, serv: it.serv, grams: g,
        method: it.method, grade: it.grade,
        ...(it.dish ? { dish: it.dish } : {}),
        fromMeal: id, mealGroup: group, mealName: m.name,
      });
    });
    s.meals[id].lastUsed = Date.now();
    s.meals[id].uses = (s.meals[id].uses || 0) + 1;
  }, 'entry:add');
  return m.items.length;
}

export function mealsList() {
  return Object.values(state.meals)
    .sort((a, b) => (b.uses || 0) - (a.uses || 0) || (b.lastUsed || 0) - (a.lastUsed || 0));
}

/*
 * A day's entries, with the ones that came from a saved meal folded into a
 * single group. The log should read the way you ate: one line for the meal
 * you made, opening into what went in it.
 */
export function groupedEntries(key) {
  const list = peekDay(key)?.entries || [];
  const out = [];
  const groups = new Map();
  for (const e of list) {
    if (!e.mealGroup) { out.push({ kind: 'entry', entry: e }); continue; }
    let g = groups.get(e.mealGroup);
    if (!g) {
      g = { kind: 'meal', id: e.mealGroup, mealId: e.fromMeal,
            name: e.mealName || 'Meal', meal: e.meal, items: [] };
      groups.set(e.mealGroup, g);
      out.push(g);
    }
    g.items.push(e);
  }
  return out;
}

/* What a saved meal comes to, using current numbers. */
export function mealTotals(m) {
  const sum = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
  for (const it of m.items) {
    const mac = entryMacros(it);
    for (const k in sum) sum[k] += mac[k] || 0;
  }
  return sum;
}

/* ── Personal food library ──────────────────────────────────────────── */

/*
 * Save a food to your library, keeping where it came from.
 *
 * This used to stamp src:'custom' on everything, which destroyed the one
 * fact that distinguishes a scanned packet from something you typed in by
 * hand — the scan flow passed 'openfoodfacts' and it was overwritten on
 * the way in. Origin is worth keeping: a printed panel and your own
 * estimate deserve to be told apart, and you should be able to find
 * either one on its own.
 */
export function saveFood(food) {
  const id = food.id && food.id.startsWith('my:') ? food.id : 'my:' + uid();
  const src = food.src || (food.barcode ? 'openfoodfacts' : 'custom');
  const f = { ...food, id, src, savedAt: Date.now() };
  commit(s => { s.library[id] = f; }, 'library');
  return f;
}

/* Where a library food came from. Barcode is the fallback for records
   saved before origin was preserved. */
export function foodOrigin(f) {
  if (!f) return 'custom';
  if (f.src === 'openfoodfacts' || f.src === 'off') return 'scanned';
  if (f.barcode) return 'scanned';
  return 'custom';
}

const byNewest = (a, b) => (b.savedAt || 0) - (a.savedAt || 0);

/* Everything you scanned, newest first. */
export function scannedFoods(limit = 18) {
  const hide = new Set(state.hidden || []);
  return Object.values(state.library)
    .filter(f => foodOrigin(f) === 'scanned' && !hide.has(f.id))
    .sort(byNewest)
    .slice(0, limit);
}

/* Everything you entered yourself. */
export function builtFoods(limit = 18) {
  const hide = new Set(state.hidden || []);
  return Object.values(state.library)
    .filter(f => foodOrigin(f) === 'custom' && !hide.has(f.id))
    .sort(byNewest)
    .slice(0, limit);
}

export function deleteFood(id) {
  commit(s => { delete s.library[id]; }, 'library');
}

export function cacheFood(food) {
  if (!food || !food.barcode) return;
  commit(s => { s.cache[food.barcode] = food; }, 'cache');
}

export function recentFoods(n = 24) {
  const seen = new Map();
  const hide = new Set(state.hidden || []);
  const keys = Object.keys(state.days).sort().reverse();
  for (const k of keys) {
    for (const e of [...state.days[k].entries].reverse()) {
      const rid = e.ref || e.name;
      if (hide.has(rid)) continue;
      if (!seen.has(rid)) {
        seen.set(rid, { name: e.name, brand: e.brand, per100: e.per100, grade: e.grade,
                        ref: e.ref, grams: e.grams, method: e.method, serv: e.serv || [] });
      }
      if (seen.size >= n) return [...seen.values()];
    }
  }
  return [...seen.values()];
}

/*
 * Foods logged most often — the shortlist a specific eater actually needs.
 * The tally is called `times`, not `n`: `n` is the food schema's name field,
 * and a collision there silently renders counts where names should be.
 */
export function frequentFoods(limit = 12) {
  const count = new Map();
  for (const k in state.days) {
    for (const e of state.days[k].entries) {
      const rid = e.ref || e.name;
      const prev = count.get(rid);
      if (prev) prev.times++;
      else count.set(rid, { times: 1, name: e.name, brand: e.brand, per100: e.per100,
                            grade: e.grade, ref: e.ref, grams: e.grams,
                            method: e.method, serv: e.serv || [] });
    }
  }
  const hide = new Set(state.hidden || []);
  return [...count.values()]
    .filter(f => !hide.has(f.ref || f.name))
    .sort((a, b) => b.times - a.times)
    .slice(0, limit);
}

/* ── Backup ─────────────────────────────────────────────────────────── */

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('days' in parsed)) {
    throw new Error('That file is not an Basal backup.');
  }
  state = { ...EMPTY(), ...parsed };
  persist();
  emit('import', state);
}

/*
 * Snapshot to the Mac, when there is a Mac.
 *
 * Served from GitHub Pages there is no server behind this, so the first
 * failure switches it off for the session rather than firing a doomed
 * request after every meal.
 */
let backupReachable = true;

export async function pushBackup() {
  if (!state.settings.autoBackup || !backupReachable) return;
  try {
    const r = await fetch('api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!r.ok) backupReachable = false;
  } catch {
    backupReachable = false;   // offline, or no helper running
  }
}

export function reset() {
  state = EMPTY();
  persist();
  emit('reset', state);
}


/* ── Training ───────────────────────────────────────────────────────── */

/*
 * A rotation, not a timetable.
 *
 * The first version of this bound workouts to weekdays, which quietly
 * asserted that Wednesday means legs and that a Wednesday without legs is
 * a failure. Plenty of people — including the person this was built for —
 * train in a cycle instead: back, then chest, then shoulders, with rest
 * taken when it is needed rather than when the calendar says. Under a
 * weekday plan, doing Wednesday's session on Thursday is recorded as one
 * miss and one unplanned extra. It was neither. It was Thursday.
 *
 * So the plan is an ordered list that advances when you train, and the
 * calendar has no opinion about it. Skip three days and the next one up is
 * still the next one up. Nothing is ever "late".
 */

const seedTypes = () => PRESET_TYPES.map(t => ({ ...t }));

export function trainState() {
  const s = get();
  const t = s.train || {};
  return {
    types: t.types?.length ? t.types : seedTypes(),
    rotation: t.rotation || [],
    sessions: t.sessions || {},
  };
}

function mutTrain(fn, evt = 'train') {
  commit(s => {
    s.train = s.train || {};
    if (!s.train.types?.length) s.train.types = seedTypes();
    s.train.rotation = s.train.rotation || [];
    s.train.sessions = s.train.sessions || {};
    fn(s.train);
  }, evt);
}

export const trainTypes = () => trainState().types;
export const typeById = id => trainState().types.find(t => t.id === id) || null;

export function saveType(type) {
  mutTrain(t => {
    const i = t.types.findIndex(x => x.id === type.id);
    if (i >= 0) t.types[i] = { ...t.types[i], ...type };
    else t.types.push({ ...type, id: type.id || 'w' + uid() });
  });
}

export function removeType(id) {
  mutTrain(t => {
    t.types = t.types.filter(x => x.id !== id);
    t.rotation = t.rotation.filter(x => x !== id);
    /* Sessions keep their type id deliberately. Deleting a workout should
       not rewrite what you did last month into something you did not do. */
  });
}

export const rotation = () => trainState().rotation;
export function setRotation(ids) { mutTrain(t => { t.rotation = ids.slice(); }); }

export const sessionFor = key => trainState().sessions?.[key] || null;

export function logSession(key, session) {
  mutTrain(t => {
    t.sessions[key] = { ...(t.sessions[key] || {}), ...session, date: key, loggedAt: Date.now() };
  });
}

export function removeSession(key) {
  mutTrain(t => { delete t.sessions[key]; });
}

/* Every session, newest last, optionally limited to a recent window. */
export function sessions(days = null) {
  const all = Object.values(trainState().sessions)
    .filter(s => s && s.type)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!days) return all;
  const from = shiftDay(dayKey(), -(days - 1));
  return all.filter(s => s.date >= from);
}

/*
 * What comes next in the cycle.
 *
 * Read from the last thing actually trained rather than from a counter,
 * so logging a session out of order, editing one, or deleting one all
 * leave the rotation pointing somewhere sensible without any repair step.
 */
export function nextUp() {
  const { rotation: rot } = trainState();
  if (!rot.length) return null;
  const past = sessions().filter(s => rot.includes(s.type));
  if (!past.length) return rot[0];
  const last = past[past.length - 1];
  return rot[(rot.indexOf(last.type) + 1) % rot.length];
}

/*
 * How often, not how obedient.
 *
 * With no timetable there is nothing to be behind on, so the honest
 * measure is frequency and the gaps between sessions. A rest day is
 * simply a day without one — it needs no declaring, which is the whole
 * point of dropping the calendar.
 */
export function trainStats(days = 28) {
  const from = shiftDay(dayKey(), -(days - 1));
  const list = sessions().filter(s => s.date >= from);
  const perWeek = list.length ? +(list.length / (days / 7)).toFixed(1) : 0;

  let longestGap = 0, currentGap = 0;
  const have = new Set(list.map(s => s.date));
  for (let i = 0; i < days; i++) {
    const key = shiftDay(dayKey(), -i);
    if (have.has(key)) break;
    currentGap++;
  }
  let run = 0;
  for (let i = days - 1; i >= 0; i--) {
    if (have.has(shiftDay(dayKey(), -i))) run = 0;
    else { run++; longestGap = Math.max(longestGap, run); }
  }
  return { sessions: list.length, days, perWeek, daysSince: currentGap, longestGap };
}

/* The day grid: one entry per day, newest last. */
export function trainGrid(days = 28, endKey = dayKey()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = shiftDay(endKey, -i);
    out.push({ key, session: trainState().sessions?.[key] || null, today: key === dayKey() });
  }
  return out;
}
