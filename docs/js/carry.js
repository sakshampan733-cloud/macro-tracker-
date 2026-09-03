/*
 * Carrying yesterday forward.
 *
 * The body does not reset at midnight. Energy balance is genuinely
 * cumulative: four hundred under on Monday really does offset four hundred
 * over on Tuesday, and a week's total predicts weight change far better
 * than any single day of it. So letting a shortfall roll into tomorrow
 * makes the app more accurate, not less — it is the same reasoning behind
 * a weekly calorie budget, which people run deliberately.
 *
 * That is true of ENERGY. It is not true of protein, and this module
 * deliberately refuses to pretend otherwise. Protein is not stored: there
 * is no reserve to draw down and refill, and muscle protein synthesis is a
 * per-day process whose window closes. Forty grams missed yesterday cannot
 * be repaid today — the extra is mostly oxidised. A card reading "you owe
 * 40 g protein" would be a false model wearing a precise number, which is
 * worse than saying nothing. What is true is that CHRONICALLY low protein
 * matters, so that is reported as a trend instead (see macroTrend below):
 * same information, no fiction.
 *
 * Fat and carbs get the same refusal for a different reason. Going over on
 * fat yesterday did not create a fat obligation; it created a calorie
 * surplus, which the energy carry already handles. Charging for it twice
 * would penalise one mistake in two currencies.
 *
 * Everything here adjusts TARGETS and never touches the log. What you ate
 * is a fact and stays one — which is also what keeps adaptiveTDEE honest,
 * since it learns from logged intake rather than from what you were aiming
 * at.
 */

import { get, dayKey, shiftDay, peekDay, totals, MEALS } from './store.js';
import { safeFloor } from './nutrition.js';
import { stepTarget, stepSeries } from './steps.js';

/*
 * The guardrails, in one place so they can be argued with.
 *
 * WINDOW — three days. A shortfall from last Tuesday is not on the books
 * any more; carrying it implies a precision about a week-old day that
 * nobody has.
 *
 * CAP — the smaller of 400 kcal and a fifth of the day's target. Without a
 * cap, one sick day leaves you "owing" two thousand calories and the app
 * spends tomorrow instructing you to eat them. The cap is what keeps this
 * a nudge rather than a licence.
 *
 * SPREAD (steps) — a step debt lands over three days rather than all on
 * today, because "walk 25,000 today" is not a plan, it is a way to teach
 * somebody to ignore the number.
 */
export const CARRY_WINDOW = 3;
export const CARRY_CAP_KCAL = 400;
export const CARRY_CAP_FRAC = 0.2;
export const STEP_SPREAD = 3;
export const STEP_CAP_FRAC = 0.4;

export const carryOn = (s = get()) => s.settings?.carryForward === true;

/*
 * Is this day complete enough to be worth carrying?
 *
 * This is the load-bearing question in the whole feature, and getting it
 * wrong is the one failure that would do real damage. Picture the ordinary
 * case: breakfast and lunch logged, dinner eaten out and never entered.
 * The app sees a 900 kcal shortfall that did not happen, and tomorrow
 * morning it tells you to eat 900 more. The most common logging mistake
 * there is would quietly become an instruction to overeat.
 *
 * So a day has to earn it. Three ways, in descending order of certainty:
 *
 *  closed — you pressed "start a new day", which is a person saying "I am
 *           done eating". Nothing beats being told.
 *  full   — food logged in at least three of the four meal slots AND the
 *           day reaching 60% of its target. Either test alone is too easy:
 *           three snacks pass the first, one enormous lunch passes the
 *           second. Together they are hard to trip by accident.
 *  thin   — everything else. Not carried, and said out loud rather than
 *           silently skipped, because a person who sees nothing carried
 *           deserves to know why.
 */
export function dayCompleteness(key, targetKcal) {
  const d = peekDay(key);
  const entries = d.entries || [];
  if (!entries.length) return { level: 'empty', why: 'nothing logged' };
  if (d.closedAt) return { level: 'closed', why: 'you closed this day' };

  const slots = new Set(entries.map(e => e.meal).filter(m => MEALS.includes(m)));
  const kcal = totals(key).kcal;
  const share = targetKcal > 0 ? kcal / targetKcal : 0;

  if (slots.size >= 3 && share >= 0.6) {
    return { level: 'full', why: `${slots.size} meals logged` };
  }
  return {
    level: 'thin',
    why: slots.size < 3
      ? `only ${slots.size} meal${slots.size === 1 ? '' : 's'} logged`
      : `only ${Math.round(share * 100)}% of the target logged`,
  };
}

/*
 * What the last few settled days left on the table.
 *
 * Deliberately excludes the open day — a day still being eaten has a
 * shortfall by definition, and carrying it forward would be carrying the
 * afternoon into tomorrow morning.
 */
export function carryFor(s, key, targetKcal) {
  if (!carryOn(s)) return null;

  const days = [];
  for (let i = 1; i <= CARRY_WINDOW; i++) {
    const k = shiftDay(key, -i);
    const c = dayCompleteness(k, targetKcal);
    if (c.level === 'empty') continue;          // a day you did not use at all
    days.push({ date: k, ...c, delta: c.level === 'thin' ? 0 : totals(k).kcal - targetKcal });
  }
  if (!days.length) return null;

  const counted = days.filter(d => d.level !== 'thin');
  const skipped = days.filter(d => d.level === 'thin');
  const raw = counted.reduce((a, d) => a + d.delta, 0);

  /* Under-eating gives a negative delta and should RAISE today's target,
     so the adjustment is the opposite sign of the sum. */
  const cap = Math.min(CARRY_CAP_KCAL, Math.round(targetKcal * CARRY_CAP_FRAC));
  const adj = Math.max(-cap, Math.min(cap, -raw));

  return {
    kcal: adj, raw: -raw, cap,
    capped: Math.abs(raw) > cap,
    counted, skipped,
    /* Nothing worth showing for a rounding error. */
    material: Math.abs(adj) >= 25,
  };
}

/*
 * Today's target, with the carry applied and the floor respected.
 *
 * The floor is not negotiable. safeFloor is the number below which the app
 * will not point somebody, and a surplus rolled forward is exactly the
 * situation that would otherwise push a target under it — you ate well
 * over on Sunday, so Monday's number goes down, and if Monday was already
 * a hard day it lands somewhere it should not. Trimmed instead, and the
 * trim is reported rather than hidden.
 */
export function applyCarry(targets, carry, profile) {
  if (!carry?.material) return targets;

  const floor = safeFloor(profile);
  const wanted = targets.kcal + carry.kcal;
  const kcal = Math.max(floor.kcal, wanted);

  return {
    ...targets,
    kcal,
    carry: { ...carry, applied: kcal - targets.kcal, floored: kcal > wanted, floor },
  };
}

/*
 * Steps, as a week rather than seven separate days.
 *
 * The daily target was always a convenience — what the deficit actually
 * notices is the week's total, and a big Saturday genuinely does offset a
 * flat Tuesday in a way that a big Saturday of eating does not offset a
 * missed protein day. So the honest unit here is the rolling week.
 *
 * The shortfall lands over three days rather than all on today, and is
 * capped, for the same reason the calorie carry is capped: a target nobody
 * can hit is a target everybody learns to ignore.
 */
export function stepCarry(s = get()) {
  const target = stepTarget();
  if (!target || !carryOn(s)) return null;

  const today = dayKey();
  const series = stepSeries(7);
  const settled = series.filter(d => d.date !== today);
  if (settled.length < 3) return null;

  const weekTarget = target * 7;
  const done = settled.reduce((a, d) => a + d.steps, 0);
  const todaySoFar = series.find(d => d.date === today)?.steps || 0;

  /* Pace against where you should be by now, today included as a day in
     progress rather than as a day already lost. */
  const expected = target * settled.length;
  const shortfall = expected - done;              // positive means behind

  const cap = Math.round(target * STEP_CAP_FRAC);
  const adj = Math.max(-cap, Math.min(cap, Math.round(shortfall / STEP_SPREAD)));

  return {
    target, weekTarget, done, todaySoFar,
    days: settled.length,
    shortfall: Math.round(shortfall),
    adjusted: Math.max(0, target + adj),
    adj, cap,
    capped: Math.abs(Math.round(shortfall / STEP_SPREAD)) > cap,
    ahead: shortfall < 0,
    material: Math.abs(adj) >= 250,
  };
}

/*
 * Macros, as a trend instead of a debt.
 *
 * This is the honest version of the thing people ask for when they ask to
 * carry protein forward. The question underneath — "have I been getting
 * enough lately?" — is a good one; it is only the arithmetic of repayment
 * that is wrong. So: how many of the last seven days came in under, and by
 * how much on average. A run of low days is a real finding and worth
 * acting on. Yesterday's forty grams is not a bill.
 */
export function macroTrend(s, days = 7, targetsFor = null) {
  const today = dayKey();
  const keys = [];
  for (let i = 1; i <= days; i++) keys.push(shiftDay(today, -i));

  const out = {};
  for (const k of ['p', 'f', 'fib']) out[k] = { under: 0, days: 0, sum: 0, target: 0 };

  let counted = 0;
  for (const key of keys) {
    const t = targetsFor ? targetsFor(key) : s.targets;
    if (!t) continue;
    const c = dayCompleteness(key, t.kcal);
    if (c.level === 'empty' || c.level === 'thin') continue;
    counted++;
    const tot = totals(key);
    for (const k of ['p', 'f', 'fib']) {
      out[k].days++;
      out[k].sum += tot[k] || 0;
      out[k].target += t[k] || 0;
      if ((tot[k] || 0) < (t[k] || 0) * 0.9) out[k].under++;
    }
  }

  if (counted < 3) return { ready: false, counted };

  for (const k of ['p', 'f', 'fib']) {
    const m = out[k];
    m.mean = Math.round(m.sum / m.days);
    m.meanTarget = Math.round(m.target / m.days);
    m.pct = m.meanTarget ? Math.round((m.mean / m.meanTarget) * 100) : null;
  }
  return { ready: true, counted, ...out };
}
