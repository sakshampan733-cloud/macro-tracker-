/*
 * Steps, as the part of the burn you can actually move.
 *
 * The band already counts them and the Body tab already shows them, but
 * shown as a bare number a step count is trivia. It is the one input on
 * the burn side that responds to a decision — you cannot decide to have a
 * higher metabolism, and training is three or four hours a week, but
 * walking is available all day and most people's deficit fails here rather
 * than at the table.
 *
 * The target is your own. A default of ten thousand is a marketing figure
 * from a 1960s Japanese pedometer, and setting somebody's goal above what
 * they have ever done teaches them to ignore it. So the suggestion is the
 * median of the days you actually walked, nudged up — a target you miss
 * every day is not a target.
 */

import { get, dayKey, shiftDay } from './store.js';
import { rowsFor, healthSource } from './applehealth.js';

const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* Every day with a step count, newest last. */
export function stepSeries(days = 28) {
  const s = get();
  if (!healthSource()) return [];
  const rows = rowsFor(s, 'all') || {};
  const from = shiftDay(dayKey(), -(days - 1));
  return Object.entries(rows)
    .filter(([d, r]) => d >= from && r.steps != null && r.steps > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, r]) => ({ date, steps: Math.round(r.steps) }));
}

/*
 * What to aim for, when nobody has said.
 *
 * Rounded to the nearest five hundred, because a target of 8,347 is a
 * measurement pretending to be a decision. Floored at 4,000 and capped at
 * 15,000: below the floor the number stops being a goal, and above the cap
 * it stops being a walk.
 */
export function suggestedTarget() {
  const vals = stepSeries(28).map(d => d.steps);
  if (vals.length < 5) return null;
  const med = median(vals);
  const aim = med * 1.1;
  return Math.max(4000, Math.min(15000, Math.round(aim / 500) * 500));
}

export function stepTarget() {
  const set = get().settings?.stepTarget;
  if (set != null) return set;
  return suggestedTarget();
}

/*
 * How the last fortnight went against it.
 *
 * Reported as days hit rather than as an average, because the average
 * hides the shape: twelve thousand on Saturday does not undo four days of
 * two thousand, and it is the four days that the deficit noticed.
 */
export function stepReport(days = 14) {
  const target = stepTarget();
  const series = stepSeries(days);
  if (!series.length) return { ready: false, target, series };

  const today = dayKey();
  /* Today is still being counted, so it cannot be judged as a miss. */
  const settled = series.filter(d => d.date !== today);
  const hit = settled.filter(d => d.steps >= (target || Infinity)).length;
  const vals = settled.map(d => d.steps);
  const mean = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  const med = vals.length ? Math.round(median(vals)) : null;
  const todayRow = series.find(d => d.date === today) || null;

  return {
    ready: settled.length >= 3,
    target, series, mean, median: med,
    days: settled.length, hit,
    today: todayRow ? todayRow.steps : null,
    /* The lowest three days, because that is where the week was actually
       lost and it is the part people do not remember. */
    worst: [...settled].sort((a, b) => a.steps - b.steps).slice(0, 3),
  };
}

/*
 * What the gap is worth, in calories.
 *
 * Deliberately approximate and deliberately stated as a range. Roughly
 * 0.04 kcal per step per kilogram of body weight is the usual figure for
 * walking on the flat, which for most people lands near 0.03–0.05 kcal a
 * step — so a thousand steps is somewhere around thirty to fifty.
 *
 * This is NOT added to anything. The band already measures the day's burn
 * and those steps are inside that number; adding an estimate on top would
 * count the same walking twice. It exists to answer "is this worth
 * bothering with", which is a question about magnitude, not a number to
 * budget against.
 */
export function stepsWorth(steps, weightKg) {
  if (!steps || !weightKg) return null;
  const lo = Math.round(steps * 0.035 * (weightKg / 70));
  const hi = Math.round(steps * 0.05 * (weightKg / 70));
  return { lo, hi };
}
