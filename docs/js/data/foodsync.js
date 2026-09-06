/*
 * Keeping the food library current without shipping a new app.
 *
 * The whole point of this file. In a store app, code changes cost a build
 * and a review — a few days to add one dish, which is an absurd price for
 * "aloo kachori is missing". So the food list stops being code and becomes
 * data: published as JSON, fetched here, cached, and picked up by foods.js
 * on the next launch.
 *
 * The list is not a feature and does not change what the app is, so this is
 * ordinary data loading rather than the kind of remote code delivery app
 * stores object to. Screens, maths and behaviour all still ship in builds.
 *
 * Three rules the implementation follows:
 *
 *   Never worse than what shipped. The built-in list is the floor; a fetch
 *   can only replace it with a strictly higher version, and only if what
 *   arrives actually looks like a food list.
 *
 *   Never mid-session. A fetch stores the new list and stops. foods.js
 *   applies it at the next launch, before anything has read FOODS, so no
 *   screen is left holding a different list from the one beside it.
 *
 *   Never in the way. It runs in the background, it never blocks a draw,
 *   and every failure is silent — offline, a 404, a truncated response, a
 *   captive portal serving a login page. The app already works.
 */

import { FOODS_VERSION } from './foods.js';

const CACHE_KEY = 'basal.foods';
const STAMP_KEY = 'basal.foods.checkedAt';

/* Once a day is plenty. The list changes when somebody asks for a food,
   which is a human-scale event, not a real-time one. */
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/*
 * Where the published list lives.
 *
 * On the web, relative — same origin, and it keeps working on a local
 * server or a fork without anything being configured.
 *
 * In the native app, relative would be wrong in the quietest possible way.
 * The shell serves from capacitor://localhost with the web files copied in
 * at build time, so 'data/foods.json' resolves to the copy baked into the
 * binary: the app would dutifully fetch its own shipped list, find it is
 * not newer than itself, and conclude it was up to date forever. The whole
 * point of moving foods out of the code was that adding one does not need a
 * new build, and that only holds if the installed app looks somewhere a
 * push can reach.
 */
const PUBLISHED = 'https://sakshampan733-cloud.github.io/macro-tracker-/data/foods.json';
const isNative = () => !!(globalThis.Capacitor?.isNativePlatform?.());
const feedUrl = () => (isNative() ? PUBLISHED : 'data/foods.json');

/* What the app is running right now — the built-in version, or a newer
   cached one that foods.js has already applied. */
export function currentFoodsVersion() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Math.max(FOODS_VERSION, cached?.version || 0);
  } catch {
    return FOODS_VERSION;
  }
}

/*
 * Is this actually a food list?
 *
 * Worth checking properly. A captive portal returns a login page with a
 * 200, a half-written deploy returns a truncated file, and either would
 * otherwise be cached and applied at the next launch — replacing 607 real
 * foods with nothing. The count floor is deliberately blunt: a genuine
 * list never shrinks to a handful.
 */
function looksRight(data) {
  if (!data || typeof data !== 'object') return false;
  if (!(data.version > 0)) return false;
  if (!Array.isArray(data.foods) || data.foods.length < 100) return false;
  const good = data.foods.filter(f => f && f.id && f.n && f.per100?.kcal != null);
  return good.length >= data.foods.length * 0.95;
}

export async function syncFoods({ force = false } = {}) {
  try {
    const last = +(localStorage.getItem(STAMP_KEY) || 0);
    if (!force && Date.now() - last < CHECK_EVERY_MS) return { skipped: true };

    const r = await fetch(feedUrl(), { cache: 'no-cache' });
    if (!r.ok) return { ok: false, status: r.status };

    const data = await r.json();
    localStorage.setItem(STAMP_KEY, String(Date.now()));

    if (!looksRight(data)) return { ok: false, error: 'not a food list' };
    if (!(data.version > currentFoodsVersion())) {
      return { ok: true, current: true, version: data.version };
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    /* Deliberately not applied now. foods.js takes it at the next launch. */
    return { ok: true, staged: true, version: data.version, count: data.foods.length };
  } catch (e) {
    /* Offline is the normal case, not an error worth reporting. */
    return { ok: false, error: e.message };
  }
}

/* Undo, for when a bad list somehow gets published and cached. Drops back
   to the rows that shipped with the app; takes effect on the next launch. */
export function forgetCachedFoods() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(STAMP_KEY);
  } catch { /* nothing to do */ }
}
