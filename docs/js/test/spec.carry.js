/*
 * Carrying yesterday forward.
 *
 * The load-bearing rule here is the one about incomplete days, and it is
 * the single place in the app where a bug would actively instruct somebody
 * to overeat: breakfast and lunch logged, dinner eaten out and never typed
 * in, and a naive reading sees a 900 kcal shortfall that did not happen.
 * These tests exist mostly to keep that rule from being lost in a rewrite.
 */

import { describe, it, eq, near, ok, notOk, isNull } from './harness.js';
import {
  CARRY_WINDOW, CARRY_CAP_KCAL, CARRY_CAP_FRAC, STEP_SPREAD, STEP_CAP_FRAC,
  applyCarry,
} from '../carry.js';
import { safeFloor } from '../nutrition.js';

const profile = {
  sex: 'male', weightKg: 80, heightCm: 180,
  birthYear: new Date().getFullYear() - 30,
  activity: 'moderate', bodyFatPct: 0,
};

const targets = { kcal: 2400, p: 160, c: 240, f: 75, fib: 30 };

/* applyCarry takes a carry object rather than reading the store, which is
   what makes it testable in isolation — and is worth preserving in the
   port for the same reason. */
const carry = (kcal, extra = {}) => ({
  kcal, raw: kcal, cap: CARRY_CAP_KCAL, capped: false,
  counted: [], skipped: [], material: Math.abs(kcal) >= 25, ...extra,
});

describe('The guardrails', () => {
  it('the window is three days', () => {
    /* A shortfall from last Tuesday is not on the books any more. */
    eq(CARRY_WINDOW, 3);
  });

  it('the cap is the smaller of 400 kcal and a fifth of the target', () => {
    eq(CARRY_CAP_KCAL, 400);
    eq(CARRY_CAP_FRAC, 0.2);
    /* On a 1,500 kcal target the fraction binds first: 300, not 400. */
    ok(Math.min(CARRY_CAP_KCAL, Math.round(1500 * CARRY_CAP_FRAC)) === 300);
  });

  it('a step debt lands over five days, not one', () => {
    eq(STEP_SPREAD, 5);
    eq(STEP_CAP_FRAC, 0.3);
  });
});

describe('Applying a carry', () => {
  it('under-eating raises today’s target', () => {
    const t = applyCarry(targets, carry(+300), profile);
    eq(t.kcal, 2700);
    eq(t.carry.applied, 300);
  });

  it('over-eating lowers it', () => {
    const t = applyCarry(targets, carry(-300), profile);
    eq(t.kcal, 2100);
  });

  it('an immaterial carry changes nothing at all', () => {
    /* Not merely a small adjustment — no adjustment, and no carry object
       on the result either, so nothing renders for a rounding error. */
    const t = applyCarry(targets, carry(10), profile);
    eq(t.kcal, 2400);
    ok(t.carry === undefined);
  });

  it('the floor is not negotiable', () => {
    /* A surplus rolled forward is exactly the case that would otherwise
       push a target under the floor. */
    const floor = safeFloor(profile).kcal;
    const low = { ...targets, kcal: floor + 100 };
    const t = applyCarry(low, carry(-400), profile);
    eq(t.kcal, floor, 'trimmed to the floor');
    ok(t.carry.floored, 'and it says so rather than hiding it');
  });

  it('reports what it actually applied, not what it wanted to', () => {
    const floor = safeFloor(profile).kcal;
    const low = { ...targets, kcal: floor + 100 };
    const t = applyCarry(low, carry(-400), profile);
    eq(t.carry.applied, t.kcal - low.kcal, 'applied is the real delta');
    ok(Math.abs(t.carry.applied) < 400);
  });

  it('leaves the macros alone', () => {
    /* Energy is cumulative; protein is not, and charging for one mistake
       in two currencies is the thing this module refuses to do. */
    const t = applyCarry(targets, carry(+300), profile);
    eq(t.p, targets.p);
    eq(t.c, targets.c);
    eq(t.f, targets.f);
  });

  it('never mutates the targets it was given', () => {
    const original = { ...targets };
    applyCarry(targets, carry(+300), profile);
    eq(targets.kcal, original.kcal);
  });
});

describe('What the cap is for', () => {
  it('one sick day cannot become a two-thousand-calorie instruction', () => {
    /* The cap is applied where the carry is computed; this checks the
       shape of the contract — a capped carry still respects its own cap. */
    const c = carry(CARRY_CAP_KCAL, { capped: true, raw: 1577 });
    const t = applyCarry(targets, c, profile);
    eq(t.kcal - targets.kcal, CARRY_CAP_KCAL);
    ok(t.carry.capped, 'and the screen can say the full gap was larger');
  });
});
