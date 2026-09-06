/*
 * Does the adaptive model actually recover the truth?
 *
 * Every other spec in this suite checks an equation against its own
 * definition. That is not enough here. adaptiveTDEE and planVsActual are the
 * two places where the app stops reporting arithmetic and starts making a
 * claim about your body — "your real maintenance is 2,540", "you are eating
 * more than you logged" — and a claim like that can be wrong in a way that
 * is entirely self-consistent.
 *
 * So these tests do something different: they invent a person whose true
 * maintenance is known by construction, generate the log and the weigh-ins
 * that person would actually produce, and ask whether the app arrives back
 * at the number it was never told.
 *
 * The three failures worth catching, in order of how much damage they do:
 *
 *   Confidently wrong. A maintenance figure hundreds of calories off, stated
 *   without qualification, is worse than no figure — every target built on
 *   it inherits the error and the person eats to it for months.
 *
 *   Wrong sign. planVsActual exists to answer one question: is the log
 *   honest? If the direction of the gap inverted, it would accuse a truthful
 *   person of hiding food, or reassure someone who is under-reporting.
 *
 *   Ready too early. An estimate from four days and two weigh-ins is noise
 *   with a decimal point. Refusing to answer is the correct answer, and the
 *   thresholds are checked here rather than trusted.
 */

import { describe, it, eq, near, ok, notOk, isNull, within } from './harness.js';
import { adaptiveTDEE, planVsActual, trendWeight, bestTDEE, bandBias } from '../nutrition.js';

const KCAL_PER_KG = 7700;

const dayKey = daysAgo => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/*
 * One day of eating, split across two entries.
 *
 * Two because adaptiveTDEE only counts a day as logged when it has at least
 * two — a single entry is somebody who logged breakfast and gave up, and
 * treating that as a full day is how a fortnight of half-days turns into a
 * maintenance figure hundreds of calories too low.
 */
const dayOf = kcal => ({
  entries: [
    { per100: { kcal: 100, p: 5, c: 10, f: 3 }, grams: kcal / 2, method: 'weighed', grade: 'A' },
    { per100: { kcal: 100, p: 5, c: 10, f: 3 }, grams: kcal / 2, method: 'weighed', grade: 'A' },
  ],
});

/*
 * A person, simulated honestly.
 *
 * Weight follows from energy balance and nothing else: every day's surplus
 * or deficit moves the scale by that many calories over 7,700. Then daily
 * noise is added on top, because a real scale swings a kilo on water and an
 * estimator that only works on clean data is an estimator that never works.
 *
 * The noise is deterministic rather than random — the same wobble every run.
 * A test that fails one time in twenty teaches people to re-run it.
 */
function simulate({ trueTDEE, intake, days = 28, startKg = 80, noiseKg = 0.4,
                    weighEvery = 1, logEvery = 1 }) {
  const store = { days: {}, profile: null };
  let kg = startKg;

  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(i);
    const day = {};
    const eaten = typeof intake === 'function' ? intake(days - 1 - i) : intake;

    if ((days - 1 - i) % logEvery === 0) Object.assign(day, dayOf(eaten));
    else day.entries = [];

    /* The scale moves on what was actually eaten, which is not always what
       was logged — that difference is the whole point of planVsActual. */
    kg += (eaten - trueTDEE) / KCAL_PER_KG;

    if ((days - 1 - i) % weighEvery === 0) {
      const wobble = Math.sin((days - i) * 1.7) * noiseKg;
      day.weight = +(kg + wobble).toFixed(2);
    }
    store.days[key] = day;
  }
  return store;
}

describe('Adaptive maintenance recovers a known truth', () => {
  it('finds the maintenance of someone eating at maintenance', () => {
    /* Flat weight, 2,500 in every day. The answer can only be 2,500. */
    const store = simulate({ trueTDEE: 2500, intake: 2500 });
    const r = adaptiveTDEE(store);
    ok(r.ready, 'four weeks of logs and weigh-ins is enough to answer');
    near(r.kcal, 2500, 150, 'recovered maintenance');
    near(r.slopeKgPerWeek, 0, 0.15, 'and sees the weight as flat');
  });

  it('finds it for someone in a deficit, losing weight', () => {
    /* 2,000 in against a 2,600 burn is 600 a day, which is 0.55 kg a week.
       The estimator has to add the loss back to the intake to get 2,600. */
    const store = simulate({ trueTDEE: 2600, intake: 2000 });
    const r = adaptiveTDEE(store);
    ok(r.ready);
    near(r.kcal, 2600, 180, 'the deficit is added back, not subtracted');
    ok(r.slopeKgPerWeek < 0, 'and the weight is seen to be falling');
    near(r.slopeKgPerWeek, -0.55, 0.2);
  });

  it('finds it for someone gaining', () => {
    const store = simulate({ trueTDEE: 2400, intake: 2900 });
    const r = adaptiveTDEE(store);
    ok(r.ready);
    near(r.kcal, 2400, 180);
    ok(r.slopeKgPerWeek > 0);
  });

  it('is not fooled by a heavy scale', () => {
    /* A kilo of daily swing on water is normal and must not move the answer,
       which is the entire reason the slope comes from a least-squares fit
       rather than from first minus last. */
    const quiet = adaptiveTDEE(simulate({ trueTDEE: 2500, intake: 2100, noiseKg: 0.1 }));
    const noisy = adaptiveTDEE(simulate({ trueTDEE: 2500, intake: 2100, noiseKg: 1.0 }));
    near(noisy.kcal, quiet.kcal, 400, 'the noisy answer is close to the quiet one');
    ok(noisy.sigma > quiet.sigma, 'and it says it is less sure');
  });

  it('reports a band, and the band is not decorative', () => {
    const r = adaptiveTDEE(simulate({ trueTDEE: 2500, intake: 2100 }));
    ok(r.sigma > 0, 'an uncertainty is reported');
    ok(Math.abs(r.kcal - 2500) <= r.sigma * 3,
       'and the truth lies inside a sane multiple of it');
  });
});

describe('Adaptive maintenance refuses to answer too early', () => {
  it('says no on a week of data', () => {
    const r = adaptiveTDEE(simulate({ trueTDEE: 2500, intake: 2200, days: 7 }));
    notOk(r.ready);
    isNull(r.kcal, 'and offers no number at all rather than a bad one');
    eq(r.need.intakeDays, 10);
    eq(r.need.weighIns, 4);
  });

  it('says no when the logging is there but the weigh-ins are not', () => {
    const r = adaptiveTDEE(simulate({ trueTDEE: 2500, intake: 2200, weighEvery: 14 }));
    notOk(r.ready, 'two weigh-ins cannot give a slope worth trusting');
    isNull(r.kcal);
  });

  it('says no when the weigh-ins are there but the logging is not', () => {
    const r = adaptiveTDEE(simulate({ trueTDEE: 2500, intake: 2200, logEvery: 5 }));
    notOk(r.ready);
    isNull(r.kcal);
  });

  it('counts what it has, so the screen can say how far off it is', () => {
    const r = adaptiveTDEE(simulate({ trueTDEE: 2500, intake: 2200, days: 7 }));
    ok(r.have.intakeDays >= 0 && r.have.weighIns >= 0);
    ok(r.have.intakeDays < r.need.intakeDays || r.have.weighIns < r.need.weighIns);
  });
});

describe('Plan against actual points the right way', () => {
  const profileFor = () => ({
    sex: 'male', weightKg: 80, heightCm: 180,
    birthYear: new Date().getFullYear() - 30,
    activity: 'moderate', bodyFatPct: 0, goal: 'cut',
  });

  it('an honest log tracks the scale', () => {
    /* Eats 2,000, burns 2,600, logs every calorie. The predicted line and
       the measured line should end up on top of each other — anything else
       is the app accusing a truthful person. */
    const store = simulate({ trueTDEE: 2600, intake: 2000, days: 45 });
    store.profile = profileFor();
    const r = planVsActual(store);
    ok(r.ready, 'six weeks is enough to draw both lines');
    ok(Math.abs(r.gapKg) < 1.2, `honest logging keeps the lines together, gap ${r.gapKg} kg`);
  });

  /*
   * The limit of this chart, pinned deliberately.
   *
   * Under-reporting is only visible when the maintenance figure comes from
   * somewhere other than the log. Left on 'auto', the adaptive estimate is
   * computed FROM the same under-reported log — eat 2,600, write 2,000, hold
   * your weight, and it concludes your maintenance is 2,000. Both lines then
   * agree perfectly and the gap is zero.
   *
   * That is not a bug in adaptiveTDEE: absorbing your logging bias is what
   * makes its targets work in practice, because the deficit it prescribes is
   * relative to how you log rather than to how you eat. But it does mean the
   * chart cannot detect hidden food while reading a maintenance figure
   * derived from the same hidden food, and these two tests exist to state
   * that in a form that will fail loudly if anyone ever claims otherwise.
   */
  it('under-reporting shows the scale above the plan — against a formula maintenance', () => {
    /* Eats 2,600, writes down 2,000, weight follows 2,600 and stays flat.
       Against an independent maintenance figure the plan predicts a loss
       that never happens, so the measured line sits ABOVE it. Inverted, the
       chart would tell somebody hiding 600 calories a day that they were
       fine. */
    const store = simulate({ trueTDEE: 2600, intake: 2600, days: 45 });
    for (const d of Object.values(store.days)) {
      if (d.entries?.length) d.entries = dayOf(2000).entries;
    }
    store.profile = profileFor();
    store.settings = { tdeeSource: 'predicted' };
    const r = planVsActual(store);
    ok(r.ready);
    ok(r.gapKg > 0.3,
       `the scale should sit above the plan when food is missing, got ${r.gapKg} kg`);
  });

  it('over-reporting shows the scale below the plan', () => {
    const store = simulate({ trueTDEE: 2600, intake: 2000, days: 45 });
    for (const d of Object.values(store.days)) {
      if (d.entries?.length) d.entries = dayOf(2600).entries;
    }
    store.profile = profileFor();
    store.settings = { tdeeSource: 'predicted' };
    const r = planVsActual(store);
    ok(r.ready);
    ok(r.gapKg < -0.3, `the scale should sit below the plan, got ${r.gapKg} kg`);
  });

  it('on auto, a biased log is absorbed into maintenance rather than shown as a gap', () => {
    /* The behaviour the two tests above are contrasted against, stated
       directly so nobody has to infer it. */
    const store = simulate({ trueTDEE: 2600, intake: 2600, days: 45 });
    for (const d of Object.values(store.days)) {
      if (d.entries?.length) d.entries = dayOf(2000).entries;
    }
    store.profile = profileFor();
    const adaptive = adaptiveTDEE(store);
    ok(adaptive.ready);
    near(adaptive.kcal, 2000, 250,
         'maintenance follows what was logged, not what was eaten');
  });

  it('a day with nothing logged is skipped, not treated as maintenance', () => {
    /* Carrying the line flat through an unlogged day asserts something the
       log never said. It has to pause and count the day instead. */
    const store = simulate({ trueTDEE: 2500, intake: 2200, days: 45, logEvery: 3 });
    store.profile = profileFor();
    const r = planVsActual(store);
    ok(r.skipped > 0, 'unlogged days are counted');
    ok(r.have.loggedDays < r.days, 'and are not counted as logged');
  });

  it('refuses to draw before there is anything to draw', () => {
    const store = simulate({ trueTDEE: 2500, intake: 2200, days: 4 });
    store.profile = profileFor();
    const r = planVsActual(store);
    notOk(r.ready);
    eq(r.need.loggedDays, 7);
  });

  it('flags when the comparison cannot mean what it looks like', () => {
    /* The screen phrases agreement differently depending on this, so it is
       worth failing loudly if it ever stops being reported. */
    const biased = simulate({ trueTDEE: 2600, intake: 2600, days: 45 });
    for (const d of Object.values(biased.days)) {
      if (d.entries?.length) d.entries = dayOf(2000).entries;
    }
    biased.profile = profileFor();
    ok(planVsActual(biased).circular,
       'a maintenance figure taken from the log cannot audit that log');

    const independent = { ...biased, settings: { tdeeSource: 'predicted' } };
    notOk(planVsActual(independent).circular,
          'a formula figure is independent, so the comparison is real');
  });

  it('says which maintenance figure the line was drawn from', () => {
    const store = simulate({ trueTDEE: 2600, intake: 2000, days: 45 });
    store.profile = profileFor();
    const r = planVsActual(store);
    ok(r.maintenance > 0);
    ok(typeof r.maintenanceSource === 'string',
       'so the reader can tell a measured line from a predicted one');
  });
});

describe('The weight curve itself', () => {
  it('lags the scale rather than chasing it', () => {
    /* Steady at 80, then a single 2 kg water day. The trend must barely
       move — that spike is the thing it exists to absorb. */
    const flat = Array.from({ length: 14 }, (_, i) => ({ date: dayKey(14 - i), kg: 80 }));
    flat.push({ date: dayKey(0), kg: 82 });
    const out = trendWeight(flat);
    const last = out[out.length - 1].trend;
    within(last, 80, 80.4, 'a one-day spike moves the trend by very little');
  });

  it('follows a real change rather than ignoring it', () => {
    /* The other half of the same requirement: a genuine month of loss has
       to come through, or the trend is just a flat line that never lies
       because it never says anything. */
    const series = Array.from({ length: 30 }, (_, i) => ({ date: dayKey(30 - i), kg: 80 - i * 0.05 }));
    const out = trendWeight(series);
    ok(out[out.length - 1].trend < out[0].trend - 0.8, 'a month of real loss shows up');
  });

  it('never invents a reading', () => {
    eq(trendWeight([]).length, 0);
    eq(trendWeight([{ date: dayKey(0), kg: 80 }]).length, 1);
  });
});

describe('Which maintenance figure gets used', () => {
  const profile = {
    sex: 'male', weightKg: 80, heightCm: 180,
    birthYear: new Date().getFullYear() - 30,
    activity: 'moderate', bodyFatPct: 0, goal: 'cut',
  };

  it('falls back to the formula when there is nothing measured', () => {
    const r = bestTDEE({ days: {}, profile, whoop: { rows: {} }, settings: {} }, profile);
    ok(r.kcal > 0);
    eq(r.source, 'predicted', 'and says so, rather than passing a guess off as measured');
  });

  it('prefers the adaptive figure once it is ready', () => {
    const store = simulate({ trueTDEE: 2600, intake: 2000 });
    store.profile = profile;
    store.whoop = { rows: {} };
    store.settings = {};
    const r = bestTDEE(store, profile);
    eq(r.source, 'adaptive', 'measured beats predicted');
    near(r.kcal, 2600, 200);
  });
});


describe('A band that reads high', () => {
  const profile = {
    sex: 'male', weightKg: 80, heightCm: 180,
    birthYear: new Date().getFullYear() - 30,
    activity: 'moderate', bodyFatPct: 0, goal: 'cut',
  };

  /* A watch claiming `over`% more burn than the person actually spends. */
  const withBand = (trueTDEE, intake, overPct, days = 28) => {
    const store = simulate({ trueTDEE, intake, days });
    store.profile = profile;
    store.settings = {};
    store.whoop = { rows: {} };
    for (const date of Object.keys(store.days)) {
      store.whoop.rows[date] = { kcal: Math.round(trueTDEE * (1 + overPct / 100)), by: { kcal: 'apple' } };
    }
    return store;
  };

  it('measures how far the band is out, using the one figure it cannot inflate', () => {
    /* Energy that was never spent does not move a scale, so the adaptive
       number is the reference and the watch is the thing being measured. */
    const b = bandBias(withBand(2500, 2100, 30));
    ok(b.ready);
    near(b.overPct, 30, 8, 'recovers roughly the overstatement it was given');
    ok(b.material);
  });

  it('says nothing when the band is close enough to be trusted', () => {
    const b = bandBias(withBand(2500, 2100, 3));
    ok(b.ready);
    notOk(b.material, 'a few per cent is noise, not a bias worth naming');
  });

  it('refuses when there is nothing to check it against', () => {
    const store = simulate({ trueTDEE: 2500, intake: 2100, days: 7 });
    store.profile = profile; store.whoop = { rows: {} }; store.settings = {};
    notOk(bandBias(store).ready, 'no adaptive figure means no reference');
  });

  it('refuses a ratio too wild to be a device error', () => {
    /* Far more likely to be a fortnight of half-logged days, and a bad
       correction is worse than none. */
    const b = bandBias(withBand(2500, 2100, 300));
    notOk(b.ready);
    ok(b.outOfRange);
  });

  it('cuts the band figure when the band is the one in use', () => {
    const store = withBand(2500, 2100, 30);
    store.settings = { tdeeSource: 'whoop' };
    const r = bestTDEE(store, profile);
    eq(r.source, 'whoop');
    ok(r.kcal < r.raw, 'the reported figure is below the raw band reading');
    near(r.kcal, 2500, 300, 'and lands near what the body actually spent');
  });

  it('leaves the raw figure alone when no bias has been measured', () => {
    const store = simulate({ trueTDEE: 2500, intake: 2100, days: 7 });
    store.profile = profile; store.settings = { tdeeSource: 'whoop' };
    store.whoop = { rows: {} };
    for (const date of Object.keys(store.days)) {
      store.whoop.rows[date] = { kcal: 3200, by: { kcal: 'apple' } };
    }
    const r = bestTDEE(store, profile);
    near(r.kcal, 3200, 1, 'uncorrected, and the caption says so rather than pretending');
  });
});
