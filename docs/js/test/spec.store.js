/*
 * The log itself: portions, uncertainty, totals, and the day boundary.
 *
 * Several of these pin bugs that actually shipped. They are kept as tests
 * rather than as comments because a rewrite is exactly the moment a fixed
 * bug comes back — the native port will reimplement addEntry and byMeal,
 * and these say what those have to keep doing.
 */

import { describe, it, eq, near, ok, notOk, isNull, within } from './harness.js';
import {
  MEALS, METHODS, GRADE_MULT,
  macrosFor, entryMacros, entrySigma,
  dayKey, shiftDay, mealForNow,
} from '../store.js';

const poha = { kcal: 150, p: 3.3, c: 24.4, f: 4.4, fib: 1.2 };

describe('Portion arithmetic', () => {
  it('scales per-100 g values by grams', () => {
    const m = macrosFor(poha, 180);
    near(m.kcal, 270, 0.5);
    near(m.p, 5.94, 0.02);
    near(m.c, 43.92, 0.02);
  });

  it('100 g is the per-100 figure unchanged', () => {
    eq(macrosFor(poha, 100).kcal, 150);
  });

  it('an absent nutrient reads as zero rather than NaN', () => {
    /* Half the library has no sugar or sodium figure. A NaN here
       propagates into the day's total and blanks the whole screen. */
    const m = macrosFor({ kcal: 100 }, 100);
    eq(m.p, 0);
    eq(m.na, 0);
    ok(!Number.isNaN(m.kcal));
  });

  it('zero grams is zero, not a division artefact', () => {
    eq(macrosFor(poha, 0).kcal, 0);
  });

  it('entryMacros reads an entry the same way', () => {
    near(entryMacros({ per100: poha, grams: 180 }).kcal, 270, 0.5);
  });
});

describe('Uncertainty', () => {
  it('every logging method declares a sigma', () => {
    for (const [id, m] of Object.entries(METHODS)) {
      ok(typeof m.sigma === 'number', `${id} has a sigma`);
      ok(m.sigma >= 0);
    }
  });

  it('grade multipliers get worse from A to D', () => {
    ok(GRADE_MULT.A < GRADE_MULT.B);
    ok(GRADE_MULT.B < GRADE_MULT.C);
    ok(GRADE_MULT.C < GRADE_MULT.D);
    eq(GRADE_MULT.A, 1.0, 'a weighed, verified food carries no penalty');
  });

  it('a worse grade widens the band on the same food', () => {
    const base = { per100: poha, grams: 180, method: 'portion' };
    const a = entrySigma({ ...base, grade: 'A' });
    const d = entrySigma({ ...base, grade: 'D' });
    ok(d > a, 'a guessed restaurant dish is less certain than a weighed one');
  });

  it('sigma scales with the amount eaten', () => {
    const small = entrySigma({ per100: poha, grams: 50, method: 'portion', grade: 'B' });
    const large = entrySigma({ per100: poha, grams: 500, method: 'portion', grade: 'B' });
    ok(large > small);
  });

  it('a weighed entry is more certain than an eyeballed one', () => {
    const weighed = entrySigma({ per100: poha, grams: 180, method: 'weighed', grade: 'A' });
    const eyed = entrySigma({ per100: poha, grams: 180, method: 'portion', grade: 'A' });
    ok(weighed <= eyed);
  });
});

describe('Day keys', () => {
  it('a key is yyyy-mm-dd', () => {
    ok(/^\d{4}-\d{2}-\d{2}$/.test(dayKey()));
  });

  it('shifting back one day steps the calendar, not the string', () => {
    eq(shiftDay('2026-03-01', -1), '2026-02-28');
    eq(shiftDay('2024-03-01', -1), '2024-02-29', 'leap year');
    eq(shiftDay('2026-01-01', -1), '2025-12-31', 'year boundary');
  });

  it('shifting forward works the same', () => {
    eq(shiftDay('2026-12-31', 1), '2027-01-01');
  });

  it('shifting by zero is identity', () => {
    eq(shiftDay('2026-09-05', 0), '2026-09-05');
  });
});

describe('Meal slots', () => {
  it('there are four, in the order people eat them', () => {
    eq(MEALS.length, 4);
    eq(MEALS[0], 'breakfast');
    eq(MEALS[3], 'dinner');
  });

  it('the clock picks a real slot, never undefined', () => {
    /* A meal of undefined once rendered as a log heading reading exactly
       that. Whatever the hour, this has to name one of the four. */
    for (let h = 0; h < 24; h++) {
      const at = new Date(2026, 8, 5, h, 30);
      ok(MEALS.includes(mealForNow(at)), `hour ${h} gives a real slot`);
    }
  });
});
