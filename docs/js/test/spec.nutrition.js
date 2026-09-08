/*
 * The energy model, pinned.
 *
 * These are the numbers a native port has to reproduce. Where a figure
 * comes from a published equation the expected value is worked by hand in
 * the comment, so a failure tells you whether the code drifted or the test
 * was wrong — a test whose expected value is "whatever the function
 * returned when I wrote it" cannot tell you that, and is worth very little
 * during a rewrite.
 */

import { describe, it, eq, near, ok, notOk, isNull, within } from './harness.js';
import {
  ACTIVITY, GOALS, CARB_RDA,
  bmrMifflin, bmrKatch, bmrSchofield, bmrFor, bmiFor,
  predictedTDEE, macroTargets, recommendedTargets, safeFloor,
  youthGuidance, isYouth, rateAdvice, remaining, trendWeight,
  waterTarget, goalFeasibility, age,
} from '../nutrition.js';

/* A stable adult and a stable adolescent, used throughout. birthYear is
   derived from the current year so the suite does not rot. */
const YEAR = new Date().getFullYear();
const adult = {
  sex: 'male', weightKg: 80, heightCm: 180, birthYear: YEAR - 30,
  activity: 'moderate', goal: 'cut', bodyFatPct: 0,
};
const teen = {
  sex: 'male', weightKg: 90, heightCm: 172, birthYear: YEAR - 16,
  activity: 'moderate', goal: 'cut', bodyFatPct: 0,
};

describe('BMR equations', () => {
  it('Mifflin-St Jeor, male: 10w + 6.25h - 5a + 5', () => {
    /* 10(80) + 6.25(180) - 5(30) + 5 = 800 + 1125 - 150 + 5 = 1780 */
    eq(bmrMifflin({ sex: 'male', weightKg: 80, heightCm: 180, years: 30 }), 1780);
  });

  it('Mifflin-St Jeor, female: the same, minus 161 instead of plus 5', () => {
    /* 800 + 1125 - 150 - 161 = 1614 */
    eq(bmrMifflin({ sex: 'female', weightKg: 80, heightCm: 180, years: 30 }), 1614);
  });

  it('Katch-McArdle works off lean mass, not total', () => {
    /* lean = 80 x 0.80 = 64; 370 + 21.6(64) = 370 + 1382.4 = 1752 */
    eq(bmrKatch({ weightKg: 80, bodyFatPct: 20 }), 1752);
  });

  it('Katch-McArdle is fat-sensitive: same weight, more fat, lower BMR', () => {
    const lean = bmrKatch({ weightKg: 80, bodyFatPct: 12 });
    const fat = bmrKatch({ weightKg: 80, bodyFatPct: 32 });
    ok(lean > fat, 'lean mass drives resting burn');
  });

  it('Schofield 10–18 male: 17.5w + 651', () => {
    /* 17.5(90) + 651 = 1575 + 651 = 2226 */
    eq(bmrSchofield({ sex: 'male', weightKg: 90, years: 16 }), 2226);
  });

  it('Schofield 10–18 female: 12.2w + 746', () => {
    /* 12.2(55) + 746 = 671 + 746 = 1417 */
    eq(bmrSchofield({ sex: 'female', weightKg: 55, years: 16 }), 1417);
  });

  it('Schofield reads higher than Mifflin on an adolescent', () => {
    /* The whole reason it exists: Mifflin was derived in adults and
       understates a growing body. */
    const s = bmrSchofield({ sex: 'male', weightKg: 90, years: 16 });
    const m = bmrMifflin({ sex: 'male', weightKg: 90, heightCm: 172, years: 16 });
    ok(s > m, 'Schofield above Mifflin at 16');
  });
});

describe('Which equation gets used', () => {
  it('no body fat known: Mifflin', () => {
    eq(bmrFor(adult).method, 'Mifflin-St Jeor');
  });

  it('body fat known: Katch-McArdle', () => {
    eq(bmrFor({ ...adult, bodyFatPct: 20 }).method, 'Katch-McArdle');
  });

  it('an adolescent still gets Mifflin or Katch, with Schofield carried alongside', () => {
    const b = bmrFor(teen);
    ok(b.youth, 'flagged as still growing');
    ok(b.schofield > 0, 'Schofield computed for comparison');
    ok(b.method === 'Mifflin-St Jeor' || b.method === 'Katch-McArdle');
  });

  it('an adult carries no Schofield figure', () => {
    isNull(bmrFor(adult).schofield);
  });
});

describe('TDEE', () => {
  it('predicted TDEE is BMR times the activity factor', () => {
    /* 1780 x 1.55 = 2759 */
    const t = predictedTDEE(adult);
    eq(t.bmr, 1780);
    near(t.kcal, 2759, 1);
  });

  it('the activity factors are the standard ones', () => {
    eq(ACTIVITY.sedentary.f, 1.20);
    eq(ACTIVITY.light.f, 1.375);
    eq(ACTIVITY.moderate.f, 1.55);
    eq(ACTIVITY.high.f, 1.725);
    eq(ACTIVITY.athlete.f, 1.90);
  });

  it('more training means more calories', () => {
    const low = predictedTDEE({ ...adult, activity: 'sedentary' }).kcal;
    const high = predictedTDEE({ ...adult, activity: 'athlete' }).kcal;
    ok(high > low);
  });
});

describe('BMI', () => {
  it('weight over height squared', () => {
    /* 80 / 1.8^2 = 24.69 -> 24.7 */
    near(bmiFor(adult).bmi, 24.7, 0.05);
  });

  it('an adult gets a band', () => {
    eq(bmiFor(adult).label, 'Healthy range');
    /* 95 kg at 1.8 m is 29.3 — still Overweight; 100 kg is 30.9. */
    eq(bmiFor({ ...adult, weightKg: 95 }).label, 'Overweight');
    eq(bmiFor({ ...adult, weightKg: 100 }).label, 'Obese, class I');
  });

  it('an adolescent gets the number and no band', () => {
    /* The adult WHO bands are wrong on a sixteen-year-old, and a wrong
       category is worse than none. */
    const b = bmiFor(teen);
    ok(b.bmi > 0);
    isNull(b.label, 'no adult band on a growing body');
    ok(b.youth);
  });

  it('reports the healthy weight range for the height', () => {
    /* 18.5 x 1.8^2 = 59.9 ; 24.9 x 1.8^2 = 80.7 */
    const b = bmiFor(adult);
    near(b.healthyLow, 59.9, 0.2);
    near(b.healthyHigh, 80.7, 0.2);
  });

  it('returns null rather than guessing when height is missing', () => {
    isNull(bmiFor({ ...adult, heightCm: 0 }));
  });
});

describe('The calorie floor', () => {
  it('an adult floor is resting burn, never below 1200', () => {
    const f = safeFloor(adult);
    eq(f.kcal, 1780, 'resting burn, which is above the 1200 convention');
    const small = safeFloor({ ...adult, weightKg: 45, heightCm: 150, sex: 'female' });
    ok(small.kcal >= 1200, 'the 1200 convention holds underneath');
  });

  it('an adolescent floor is their whole resting burn, with no 1200 escape hatch', () => {
    const f = safeFloor(teen);
    ok(f.youth);
    eq(f.kcal, f.bmr, 'floor is resting burn exactly');
  });
});

describe('Still growing', () => {
  it('under 18 is youth, 18 and over is not', () => {
    ok(isYouth(teen));
    notOk(isYouth(adult));
    notOk(isYouth({ birthYear: YEAR - 18 }));
  });

  it('youth guidance caps the pace at 0.35% of bodyweight a week', () => {
    /* 90 x 0.0035 = 0.315 -> 0.32 */
    const g = youthGuidance(teen);
    near(g.maxRate, 0.32, 0.01);
    ok(g.holdInstead, 'holding weight is the recommendation, not a deficit');
  });

  it('no youth guidance for an adult', () => {
    isNull(youthGuidance(adult));
  });

  it('an adult may lose 0.55% a week without comment; a teenager may not', () => {
    /* 80 x 0.0055 = 0.44 kg/wk sits exactly on the adult line. */
    isNull(rateAdvice(adult, -0.44), 'adult, on the line, no warning');
    ok(rateAdvice(teen, -0.44), 'same pace flagged for a sixteen-year-old');
  });

  it('gaining is never flagged as too fast', () => {
    isNull(rateAdvice(adult, +0.5));
    isNull(rateAdvice(teen, +0.5));
  });
});

describe('Macro targets', () => {
  const t = macroTargets(adult, 2759);

  it('calories land below maintenance for a cut', () => {
    ok(t.kcal < 2759, 'a deficit');
    ok(t.kcal >= safeFloor(adult).kcal, 'and never below the floor');
  });

  it('protein is set per kilo of bodyweight, in a defensible band', () => {
    /* Anything from 1.6 to 3.0 g/kg is defensible in a deficit; the point
       of the test is that it scales with the person and stays sane. */
    within(t.p / adult.weightKg, 1.4, 3.2, 'g per kg');
  });

  it('the carbohydrate RDA is the IOM figure and is stated', () => {
    eq(CARB_RDA, 130, 'grams a day, the brain glucose requirement');
    eq(t.basis.carbRda, 130);
  });

  it('fibre is scaled to energy and bounded', () => {
    within(t.fib, 25, 45);
  });

  it('sodium, sugar and saturated fat are ceilings at the standard limits', () => {
    eq(t.na, 2300, 'mg, adult upper limit');
    near(t.sug, Math.round(t.kcal * 0.10 / 4), 1, 'WHO free sugars, 10% of energy');
    near(t.sat, Math.round(t.kcal * 0.10 / 9), 1, 'WHO saturated fat, 10% of energy');
  });

  it('the basis records what it did, so the screen can explain it', () => {
    ok(t.basis.tdee > 0);
    ok('delta' in t.basis);
    ok('floored' in t.basis);
  });

  it('an adolescent on the same goal is not pushed to an adult deficit', () => {
    const y = macroTargets(teen, predictedTDEE(teen).kcal);
    ok(y.basis.youth, 'youth recorded on the basis');
    ok(y.kcal >= safeFloor(teen).kcal, 'never under a growing floor');
  });

  it('recommendedTargets ignores a custom split so the editor has something to revert to', () => {
    const withCustom = { ...adult, custom: { p: 300, c: 10, f: 10 } };
    const rec = recommendedTargets(withCustom, 2759);
    ok(rec.p !== 300, 'the suggestion is unaffected by what was typed');
  });
});

describe('Water', () => {
  it('35 ml per kilo, rounded to 50', () => {
    /* 80 x 35 = 2800 */
    eq(waterTarget({ weightKg: 80, activity: 'moderate' }), 2800);
  });

  it('hard training adds 500 ml', () => {
    eq(waterTarget({ weightKg: 80, activity: 'athlete' }), 3300);
  });
});

describe('Remaining', () => {
  it('subtracts what was eaten from the target', () => {
    const r = remaining({ kcal: 2000, p: 150, c: 200, f: 60, fib: 30, water: 2800 },
                        { kcal: 1200, p: 90, c: 140, f: 30, fib: 12, water: 1000 });
    eq(r.kcal, 800);
    eq(r.p, 60);
    eq(r.water, 1800);
  });

  it('treats a missing total as zero rather than NaN', () => {
    const r = remaining({ kcal: 2000, p: 150 }, {});
    eq(r.kcal, 2000);
    eq(r.p, 150);
  });
});

describe('Trend weight', () => {
  it('smooths a noisy series and lags the raw value', () => {
    /* Real dates, one day apart. The trend weights by elapsed days, so a
       placeholder like 'd0' exercises only the unparseable-date fallback
       and tells you nothing about the smoothing. */
    const raw = [80, 81, 79.5, 80.5, 79, 80, 78.5]
      .map((kg, i) => ({ date: `2026-09-0${i + 1}`, kg }));
    const out = trendWeight(raw);
    eq(out.length, 7);
    eq(out[0].trend, 80, 'seeded on the first reading');
    /* The trend must sit inside the range of the data and move less than
       the raw series does — that is the entire point of it. */
    const trends = out.map(p => p.trend);
    const spread = Math.max(...trends) - Math.min(...trends);
    ok(spread < 2.5, 'trend swings less than the raw 2.5 kg spread');
  });

  it('an empty series gives an empty result, not a crash', () => {
    eq(trendWeight([]).length, 0);
  });

  /*
   * The bug this pair exists for.
   *
   * The average used to step once per weigh-in regardless of the gap, so
   * "ten-day half-life" meant ten readings. Somebody weighing twice a week
   * got a trend a third of the intended speed and a goal frozen at 0% while
   * they were visibly losing weight.
   */
  it('a gap of days counts as days, not as one reading', () => {
    const drop = [{ kg: 100 }, { kg: 96 }];
    const daily = trendWeight(drop.map((p, i) => ({ ...p, date: `2026-09-0${i + 1}` })));
    const weekly = trendWeight([
      { date: '2026-09-01', kg: 100 }, { date: '2026-09-08', kg: 96 },
    ]);
    ok(weekly.at(-1).trend < daily.at(-1).trend,
       'a week apart moves the trend further than a day apart');
  });

  it('survives a date it cannot read, rather than turning the series to NaN', () => {
    const out = trendWeight([
      { date: '2026-09-01', kg: 80 }, { date: 'not a date', kg: 79 },
      { date: '2026-09-03', kg: 78 },
    ]);
    ok(out.every(p => Number.isFinite(p.trend)), 'every trend point is a real number');
  });

  /*
   * The complaint this pins down: "I logged a huge drop and the bar did not
   * move." The old average was seeded with the first reading, so early on
   * the seed dominated and a 13.7 kg fall registered as under a kilo.
   */
  it('a large drop moves the trend a large amount, even on the second reading', () => {
    const out = trendWeight([
      { date: '2026-09-01', kg: 123.7 }, { date: '2026-09-02', kg: 110 },
    ]);
    const moved = out[0].trend - out[1].trend;
    ok(moved > 5, `a 13.7 kg drop should move the trend several kg, moved ${moved.toFixed(1)}`);
    /* Still damped: one reading a day later is not yet the whole story. */
    ok(out[1].trend > 110, 'but not all the way to the raw value');
  });

  it('a single weigh-in is its own trend, with nothing to average against', () => {
    eq(trendWeight([{ date: '2026-09-07', kg: 110 }])[0].trend, 110);
  });

  it('a shorter half-life follows the scale more closely', () => {
    const raw = [80, 80, 80, 80, 84]
      .map((kg, i) => ({ date: `2026-09-0${i + 1}`, kg }));
    const fast = trendWeight(raw, 3).at(-1).trend;
    const slow = trendWeight(raw, 20).at(-1).trend;
    ok(fast > slow, 'the fast average reacts harder to the jump');
  });
});

describe('Goals', () => {
  it('every goal declares a rate and a group', () => {
    for (const [id, g] of Object.entries(GOALS)) {
      ok(typeof g.rate === 'number', `${id} has a rate`);
      ok(typeof g.group === 'string', `${id} has a group`);
      ok(typeof g.label === 'string', `${id} has a label`);
    }
  });

  it('maintain means no change', () => {
    eq(GOALS.maintain.rate, 0);
  });

  it('losing goals are negative, gaining goals are positive', () => {
    ok(GOALS.cut.rate < 0);
    ok(GOALS.extreme.rate < GOALS.cut.rate, 'extreme is a bigger deficit than cut');
    ok(GOALS.lean.rate > GOALS.cut.rate, 'lean is gentler than cut');
  });

  it('feasibility rejects a pace nobody can hold', () => {
    /* 20 kg in 30 days is 4.67 kg a week, 5.2% of bodyweight. */
    const f = goalFeasibility(90, 70, 30);
    near(Math.abs(f.perWeek), 4.67, 0.05);
    eq(f.verdict, 'too fast');
    ok(f.losing);
    ok(f.suggestedDays > 30, 'and says how long it should actually take');
  });

  it('feasibility accepts a sensible one', () => {
    /* 5 kg in 120 days is 0.29 kg a week, 0.32% of bodyweight. */
    const f = goalFeasibility(90, 85, 120);
    within(Math.abs(f.perWeek), 0.2, 0.4);
    eq(f.verdict, 'sensible');
    isNull(f.suggestedDays, 'nothing to suggest when the pace is already fine');
  });

  it('feasibility calls a fast gain what it is', () => {
    const f = goalFeasibility(70, 80, 30);
    notOk(f.losing);
    eq(f.verdict, 'mostly fat gain');
  });
});

describe('Age', () => {
  it('counts whole years from the birth year', () => {
    eq(age(YEAR - 30), 30);
    eq(age(YEAR - 16), 16);
  });
});
