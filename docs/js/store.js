/*
 * Persistence and the day model.
 *
 * Everything lives in localStorage under one key, versioned, with a full
 * JSON export. The server also accepts a nightly snapshot, so clearing
 * Safari's storage can't take the log with it.
 */

import { per100For, STYLES } from './dishes.js';

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
  recipes: {},
  cache: {},
  whoop: { rows: {}, importedAt: null },
  settings: {
    units: 'metric',
    diet: 'all',
    waterUnit: 'ml',
    glassMl: 250,
    autoBackup: true,
    tdeeSource: 'auto',
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
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // Quota is the only realistic failure here. Say so plainly.
      emit('error', 'Storage is full. Export a backup from Settings, then clear old barcode cache.');
    }
  }, 120);
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

export function shiftDay(key, n) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

const BLANK_DAY = Object.freeze({ entries: [], water: [], weight: null, note: '' });

/*
 * The writable day record, created on demand. Only call this inside a
 * commit — it mutates the store, so using it to *read* a date silently
 * fills state.days with blank records every time you page backwards.
 */
export function day(key = dayKey()) {
  if (!state.days[key]) {
    state.days[key] = { entries: [], water: [], weight: null, note: '' };
  }
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

  for (const e of d.entries) {
    const m = entryMacros(e);
    for (const k in sum) sum[k] += m[k] || 0;
    const s = entrySigma(e);
    varSum += s * s;
  }

  const sigma = Math.sqrt(varSum);
  return {
    ...sum,
    sigma,
    // A single honest number for "how well do I actually know today?"
    confidence: sum.kcal > 0 ? 1 - Math.min(0.5, sigma / sum.kcal) : 1,
    water: (d.water || []).reduce((a, w) => a + w.ml, 0),
    count: d.entries.length,
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

/* ── Weight ─────────────────────────────────────────────────────────── */

export function setWeight(key, kg) {
  commit(s => { day(key).weight = kg; }, 'weight');
}

export function weightSeries() {
  return Object.entries(state.days)
    .filter(([, d]) => d.weight)
    .map(([k, d]) => ({ date: k, kg: d.weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
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

/* Log every item, stamped now, into whichever sitting you're in. */
export function logMeal(key, id, targetMeal) {
  const m = state.meals[id];
  if (!m) return 0;
  const when = targetMeal || m.meal || mealForNow();
  commit(s => {
    const d = day(key);
    for (const it of m.items) {
      d.entries.push({
        id: uid(), ts: Date.now(), meal: when,
        name: it.name, brand: it.brand, ref: it.ref, barcode: it.barcode,
        per100: it.per100, serv: it.serv, grams: it.grams,
        method: it.method, grade: it.grade,
        ...(it.dish ? { dish: it.dish } : {}),
        fromMeal: id,
      });
    }
    s.meals[id].lastUsed = Date.now();
    s.meals[id].uses = (s.meals[id].uses || 0) + 1;
  }, 'entry:add');
  return m.items.length;
}

export function mealsList() {
  return Object.values(state.meals)
    .sort((a, b) => (b.uses || 0) - (a.uses || 0) || (b.lastUsed || 0) - (a.lastUsed || 0));
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

export function saveFood(food) {
  const id = food.id && food.id.startsWith('my:') ? food.id : 'my:' + uid();
  const f = { ...food, id, src: 'custom', savedAt: Date.now() };
  commit(s => { s.library[id] = f; }, 'library');
  return f;
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
  const keys = Object.keys(state.days).sort().reverse();
  for (const k of keys) {
    for (const e of [...state.days[k].entries].reverse()) {
      const rid = e.ref || e.name;
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
  return [...count.values()].sort((a, b) => b.times - a.times).slice(0, limit);
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
