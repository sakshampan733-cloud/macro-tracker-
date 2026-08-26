/*
 * Caffeine.
 *
 * Caffeine sits awkwardly across the app's own categories, and the split
 * was wrong in a way that mattered: coffee is a supplement in the data and
 * a drink in real life. Someone logging a cold coffee as food had it
 * counted as calories and not as caffeine; someone logging a pre-workout
 * as a supplement had the reverse. Both are the same molecule and the
 * ceiling applies to their sum.
 *
 * So caffeine is tracked as a nutrient rather than as a category: anything
 * logged, food or supplement, contributes to one daily total.
 *
 * The other half is timing. A ceiling is about the day; caffeine is about
 * the night. What decides whether a coffee costs you sleep is not the hour
 * on the clock but how much of it is still circulating when you lie down,
 * which depends on the dose and on your own bedtime — and the app already
 * knows your bedtime from the wake-time model.
 */

/* Milligrams per 100 g or 100 ml, as served. */
export const CAFFEINE_MG = {
  /* Coffee */
  'coffee-black': 40,
  'coffee-milk': 30,
  'coffee-instant': 32,
  'espresso': 212,
  'cafe-cold-coffee': 22,
  'cold-brew': 45,
  'decaf': 1.5,

  /* Tea */
  'tea-milk': 18,
  'chai': 18,
  'tea-black': 20,
  'tea-green': 12,
  'matcha': 28,

  /* Cola and energy, per 100 ml. Colas do carry caffeine — a can of diet
     cola is about 45 mg, which is half a cup of tea and worth counting
     rather than rounding to nothing. */
  'cola': 10,
  'diet-cola': 13,
  'red-bull': 32,
  'red-bull-sf': 32,
  'monster': 32,
  'monster-zero': 30,
  'sting': 30,
  'celsius': 56,
  'energy-drink': 32,
  'sports-drink': 0,
  'iced-tea': 9,

  /* Supplements, per gram of powder rather than per 100 g */
  'pre-workout': 1000,
};

/*
 * Chocolate carries a little, and enough dark chocolate at night is a real
 * dose — but it is small enough that guessing wrong is harmless.
 */
const NAME_RULES = [
  [/espresso|ristretto/i, 212],
  [/cold brew/i, 45],
  [/americano/i, 40],
  [/filter coffee|drip coffee|black coffee|brewed coffee/i, 40],
  [/frappuccino|frappe/i, 25],
  [/latte|cappuccino|macchiato|mocha|flat white|cort/i, 26],
  [/cold coffee|iced coffee/i, 22],
  [/instant coffee|nescafe/i, 32],
  [/decaf/i, 1.5],
  [/\bcoffee\b/i, 35],
  [/matcha/i, 28],
  [/green tea/i, 12],
  [/masala chai|\bchai\b|tea with milk/i, 18],
  [/black tea|\btea\b/i, 20],
  [/monster|red bull|energy drink|sting\b/i, 32],
  [/\bcola\b|pepsi|coke\b/i, 10],
  [/dark chocolate/i, 60],
  [/milk chocolate/i, 20],
];

/*
 * How much caffeine one logged thing carries.
 *
 * An explicit per-100 value on the entry wins — that is either a label the
 * user read off a packet or a Starbucks build with a known shot count, and
 * both beat any guess made from the name.
 */
export function caffeineOf(entry, grams) {
  const g = grams ?? entry.grams ?? 0;
  if (!g) return 0;

  const per100 = entry.per100?.caff ?? entry.caff100 ?? null;
  if (per100 != null) return (per100 * g) / 100;

  const id = String(entry.ref || entry.id || '').replace(/^off:|^my:|^dish:/, '');
  if (CAFFEINE_MG[id] != null) return (CAFFEINE_MG[id] * g) / 100;

  const name = entry.name || entry.n || '';
  for (const [re, mg] of NAME_RULES) if (re.test(name)) return (mg * g) / 100;
  return 0;
}

/* Every caffeinated thing logged today, newest last. */
export function caffeineDay(entries = []) {
  const items = [];
  let total = 0;
  for (const e of entries) {
    const mg = caffeineOf(e, e.grams);
    if (mg < 1) continue;
    items.push({ name: e.name || e.n, mg, at: e.ts || e.at || null });
    total += mg;
  }
  return { total, items };
}

/*
 * Caffeine's half-life is about five hours in most adults — longer on
 * hormonal contraceptives, shorter in heavy smokers, and genuinely
 * variable between people. Five is the number worth reasoning with.
 */
export const HALF_LIFE_H = 5;

export function remainingAt(mg, hoursLater) {
  if (!(mg > 0) || !(hoursLater >= 0)) return mg || 0;
  return mg * Math.pow(0.5, hoursLater / HALF_LIFE_H);
}

/*
 * How much of today's caffeine is still in you at bedtime.
 *
 * Each dose decays from the hour it was drunk, so the answer depends on
 * when you drank rather than on how much.
 */
export function stillInYouAt(items, bedHour, now = new Date()) {
  let mg = 0;
  for (const it of items) {
    const at = it.at ? new Date(it.at) : null;
    const hour = at ? at.getHours() + at.getMinutes() / 60
                    : now.getHours() + now.getMinutes() / 60;
    const gap = bedHour >= hour ? bedHour - hour : bedHour + 24 - hour;
    mg += remainingAt(it.mg, gap);
  }
  return mg;
}

/*
 * The latest hour a given dose can be drunk and still be under the
 * threshold by bedtime. Returns null when the dose is small enough that
 * the question does not arise.
 */
export function latestHourFor(mg, bedHour, threshold = 50) {
  if (!(mg > threshold)) return null;
  const hoursNeeded = HALF_LIFE_H * Math.log2(mg / threshold);
  const h = bedHour - hoursNeeded;
  return (h + 24) % 24;
}

/*
 * A daily ceiling. 400 mg is the figure health authorities converge on for
 * healthy adults; it is a ceiling rather than a target, and nothing in the
 * app should push anyone towards it.
 */
export const DAILY_CEILING_MG = 400;

export const hourText = h => {
  const hh = Math.floor((h + 24) % 24);
  const mm = Math.round(((h + 24) % 24 - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
