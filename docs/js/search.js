/*
 * Search.
 *
 * Its own module because both the food picker and the meal builder need
 * it, and having the meal builder import it from the food picker — which
 * already imports the meal builder — made a cycle. Cycles happen to work
 * when everything is called late, which is exactly why they are worth
 * removing before something is called early.
 */

import { get, frequentFoods, mealsList } from './store.js';
import { FOODS } from './data/foods.js';

/*
 * A food from any source, in the shape the rest of the app expects.
 *
 * Grade matters: it multiplies the measurement error. A packaged product
 * with a printed panel is grade B; defaulting everything to C would widen
 * the error bars on the most reliable data in the app.
 */
export function toItem(f) {
  return {
    id: f.id || f.ref,
    n: f.n || f.name,
    brand: f.brand || '',
    per100: f.per100,
    serv: (f.serv || []).map(x => Array.isArray(x) ? { l: x[0], g: x[1] } : x),
    grade: f.grade || (f.src === 'openfoodfacts' || f.barcode ? 'B' : 'C'),
    grp: f.grp || '',
    basis: f.basis,
    barcode: f.barcode,
    src: f.src,
  };
}

/*
 * Matching a typed query against one piece of text.
 *
 * Returns a tier, not a percentage — the tiers are far enough apart that
 * ownership and frequency can be added on top without a good reference
 * match ever leapfrogging something you scanned yourself.
 *
 * The last tier is a subsequence match, which is what makes short typing
 * work: "pgs" finds "Post-gym shake", "brnrice" finds "Brown rice". It
 * scores low, so it only surfaces things nothing better matched.
 */
/*
 * Punctuation is not information here.
 *
 * "Parle-G" is typed "parle g", "Lay's" is typed "lays", "50-50" is typed
 * "50 50". Comparing the raw strings, none of those match at any tier —
 * "parle g" is not a prefix of "parle-g", is not contained in it, and is
 * not even a subsequence of it, because the space is not there. Flattening
 * hyphens, dots, slashes and apostrophes to spaces on both sides costs
 * nothing and fixes the whole class.
 */
const flatten = s => s.toLowerCase().replace(/[-_/.,()'’&+]/g, ' ').replace(/\s+/g, ' ').trim();

export function matchScore(text, needle) {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (t === needle) return 1000;
  if (t.startsWith(needle)) return 800;
  if (t.split(/[\s,/()\-]+/).some(w => w.startsWith(needle))) return 650;
  if (t.includes(needle)) return 450;

  /* The same four tiers again, with punctuation flattened away. Scored a
     shade lower so an exact literal hit still wins where both apply. */
  const tf = flatten(text), nf = flatten(needle);
  if (nf && tf !== t) {
    if (tf === nf) return 990;
    if (tf.startsWith(nf)) return 790;
    if (tf.split(' ').some(w => w.startsWith(nf))) return 640;
    if (tf.includes(nf)) return 440;
  }

  /*
   * Every word you typed, in any order.
   *
   * Foods are named the way a database names them and typed the way a
   * person speaks. "Momos, chicken (steamed)" is what the row is called;
   * "chicken momo" is what someone types, and before this that matched
   * nothing at all — not the substring test, not the word-prefix test,
   * and not the subsequence pass, which needs the letters in order.
   *
   * Requiring every typed word to appear as a word-prefix somewhere in
   * the name is strict enough not to be noisy and forgiving about order,
   * which is the only thing that was actually wrong.
   */
  /* Single-letter words are dropped only when they are noise beside a
     longer one; with two or more tokens they carry meaning — the "g" in
     "parle g" is half the name. */
  const raw = needle.split(/\s+/).filter(Boolean);
  const words = raw.length > 1 ? raw : raw.filter(w => w.length > 1);
  if (words.length > 1) {
    const parts = flatten(text).split(' ').filter(Boolean);
    const all = words.every(w => parts.some(part => part.startsWith(w)));
    if (all) return 620;
    /* Or present as a whole word anywhere. Plain containment matched
       "red" inside "jarred", which ranked a pasta sauce above the pasta
       dish for the query "pasta red" — a substring is not a word. */
    const whole = w => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t);
    if (words.every(whole)) return 430;
  }

  /*
   * Subsequence, but only a tight one starting at a word.
   *
   * A plain in-order scan matches almost anything: "whey" is a
   * subsequence of "Subway Chicken Teriyaki". Requiring the run to begin
   * at a word start and to finish inside a short span keeps the useful
   * case ("mbwh" for "MB Whey Isolate") without the noise.
   */
  if (needle.length < 3) return 0;
  const span = Math.max(12, needle.length * 4);
  for (let start = 0; start < t.length; start++) {
    if (start && !/[\s,/()\-]/.test(t[start - 1])) continue;   // word starts only
    if (t[start] !== needle[0]) continue;
    let i = 0;
    for (let j = start; j < t.length && j - start < span; j++) {
      if (t[j] === needle[i]) i++;
      if (i === needle.length) return 200;
    }
  }
  return 0;
}

/*
 * Search your foods and the reference database together.
 *
 * Yours come first, always. The old scoring gave a library food +25 while
 * the match tiers were 35 apart, so something you had scanned yourself
 * lost to a stock entry that happened to match nearer the start of its
 * name — you had to type a food's full name to see your own version of
 * it. Ownership is now worth more than any difference in match quality,
 * because a food you took the trouble to add is by definition one you
 * eat, and the stock database is the fallback rather than the point.
 *
 * Frequency breaks ties beneath that: among your own foods, the ones you
 * actually eat surface first.
 */
export function searchLocal(q) {
  const s = get();
  const needle = q.toLowerCase().trim();
  if (!needle) return [];

  const uses = new Map();
  for (const f of frequentFoods(400)) uses.set(f.ref || f.name, f.times || 0);

  const hits = [];
  const consider = (item, ownership) => {
    const base = Math.max(
      matchScore(item.n, needle),
      matchScore(item.brand || '', needle) * 0.6,
    );
    if (!base) return;
    const seen = uses.get(item.id) || uses.get(item.n) || 0;
    hits.push({ f: item, score: base + ownership + Math.min(seen, 25) * 10 });
  };

  /* 2000 clears the whole match-tier range, so anything of yours outranks
     anything stock, however well the stock entry happens to match. */
  for (const f of Object.values(s.library)) consider(toItem(f), 2000);
  for (const f of FOODS) consider(toItem(f), 0);

  /*
   * Ties break towards the shorter name.
   *
   * "chicken momo" matches both "Momos, chicken (steamed)" and "Wow! Momo,
   * steamed chicken, 5 pc" at exactly the same tier, and the plain one is
   * what somebody typing two generic words meant — a brand is something
   * you name on purpose. Length is a decent proxy for how specific a name
   * is, and it only ever decides an otherwise exact tie.
   */
  hits.sort((a, b) => (b.score - a.score) || ((a.f.n || '').length - (b.f.n || '').length));

  /* De-duplicate by name: a food you scanned and its stock twin should
     appear once, as yours. */
  const seenNames = new Set();
  const out = [];
  for (const h of hits) {
    const key = (h.f.n || '').toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    out.push(h.f);
    if (out.length >= 25) break;
  }
  return out;
}

/* Your saved meals, matched the same way, so partial typing finds them. */
export function searchMeals(q) {
  const needle = q.toLowerCase().trim();
  if (!needle) return [];
  return mealsList()
    .map(m => ({ m, match: matchScore(m.name, needle), uses: Math.min(m.uses || 0, 25) * 10 }))
    /* Filter on the match, not the total — adding the use-count first meant
       every meal you had ever logged scored above zero and came back for
       any query at all. */
    .filter(x => x.match > 0)
    .sort((a, b) => (b.match + b.uses) - (a.match + a.uses))
    .map(x => x.m);
}
