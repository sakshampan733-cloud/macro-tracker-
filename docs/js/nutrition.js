/*
 * Energy and macro maths.
 *
 * Three ways to know your maintenance calories, in ascending order of
 * accuracy. Basal uses the best one it has data for and always tells you
 * which one it used.
 *
 *   1. Predicted   Mifflin-St Jeor (or Katch-McArdle if body fat is known)
 *                  times an activity factor. A population average. Routinely
 *                  off by 15% for any given person.
 *   2. Measured    Whoop's own daily energy expenditure. Device-measured,
 *                  but the calorie model is proprietary and drifts.
 *   3. Adaptive    Back-calculated from your logged intake and the observed
 *                  trend in your weight. This is the only method that uses
 *                  *your* physiology instead of a stand-in for it, and it
 *                  gets sharper every day you log.
 */

const KCAL_PER_KG_TISSUE = 7700;   // ~1 kg of mixed body tissue

/* Day keys are local dates. toISOString() is UTC, so east of Greenwich it
   names yesterday for the first hours of every morning — which would drop a
   day off the front of the adaptive window. */
function localDayKey(d = new Date()) {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 10);
}

export const ACTIVITY = {
  sedentary:  { f: 1.20, label: 'Sedentary',   hint: 'Desk work, little movement' },
  light:      { f: 1.375, label: 'Light',      hint: 'Training 1–3 days a week' },
  moderate:   { f: 1.55, label: 'Moderate',    hint: 'Training 3–5 days a week' },
  high:       { f: 1.725, label: 'High',       hint: 'Training 6–7 days a week' },
  athlete:    { f: 1.90, label: 'Very high',   hint: 'Twice a day, or physical job' },
};

/*
 * `rate` is the weight change aimed for, in kg a week. `protein` overrides
 * the default protein rule where a goal needs one — recomposition is the
 * case that motivated it, since it is not defined by a rate at all.
 */
export const GOALS = {
  cut:      { label: 'Lose fat',      rate: -0.5, hint: 'Deficit, protein held high' },
  lean:     { label: 'Lean slowly',   rate: -0.25, hint: 'Small deficit, keeps training quality' },
  maintain: { label: 'Maintain',      rate: 0,    hint: 'Hold weight, no particular push' },
  /*
   * Build muscle without the scale moving.
   *
   * The common request that no rate can express: "I am happy with my
   * weight, I want more muscle." That is recomposition — calories at
   * maintenance so weight holds, protein pushed high enough to build on,
   * and the progress read from the mirror, the tape and your lifts rather
   * than from the scale, which by design will not move.
   *
   * It works best for people newer to training or carrying some fat to
   * spend; it is slow for everyone, and honest about that.
   */
  recomp:   { label: 'Recomposition', rate: 0, protein: 2.4, recomp: true,
              hint: 'Hold weight, build muscle — the scale stays put on purpose' },
  gain:     { label: 'Build',         rate: 0.25, hint: 'Slow surplus, minimal fat gain' },
  bulk:     { label: 'Gain fast',     rate: 0.5,  hint: 'Larger surplus' },
};

export function age(birthYear, birthMonth = 6) {
  const now = new Date();
  return now.getFullYear() - birthYear - (now.getMonth() + 1 < birthMonth ? 1 : 0);
}

/* Mifflin-St Jeor — the best-validated prediction equation for BMR. */
export function bmrMifflin({ sex, weightKg, heightCm, years }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * years;
  return Math.round(sex === 'female' ? base - 161 : base + 5);
}

/* Katch-McArdle — better than Mifflin when body fat % is actually known,
   because lean mass, not total mass, drives resting expenditure. */
export function bmrKatch({ weightKg, bodyFatPct }) {
  const lean = weightKg * (1 - bodyFatPct / 100);
  return Math.round(370 + 21.6 * lean);
}

export function bmrFor(profile) {
  if (profile.bodyFatPct > 0) {
    return { kcal: bmrKatch(profile), method: 'Katch-McArdle', note: 'uses your lean mass' };
  }
  return {
    kcal: bmrMifflin({ ...profile, years: age(profile.birthYear) }),
    method: 'Mifflin-St Jeor',
    note: 'add body fat % for a sharper figure',
  };
}

export function predictedTDEE(profile) {
  const bmr = bmrFor(profile);
  const f = (ACTIVITY[profile.activity] || ACTIVITY.moderate).f;
  return { kcal: Math.round(bmr.kcal * f), bmr: bmr.kcal, method: bmr.method, source: 'predicted' };
}

/*
 * Adaptive TDEE.
 *
 * Energy balance says: intake - expenditure = tissue change. Rearranged,
 * expenditure = mean intake - (weight slope x 7700 / days). Weight is noisy
 * day to day — water, glycogen, gut contents swing it by a kilo — so the
 * slope comes from a least-squares fit over the window rather than
 * first-minus-last, and short or sparse windows are reported as low
 * confidence instead of being quietly trusted.
 */
export function adaptiveTDEE(store, windowDays = 28) {
  const days = Object.entries(store.days)
    .map(([date, d]) => ({ date, d }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const key = localDayKey(cutoff);
  const win = days.filter(x => x.date >= key);

  const intakeDays = win.filter(x => x.d.entries.length >= 2);
  const weights = win.filter(x => x.d.weight > 0);

  if (intakeDays.length < 10 || weights.length < 4) {
    return {
      kcal: null,
      source: 'adaptive',
      ready: false,
      have: { intakeDays: intakeDays.length, weighIns: weights.length },
      need: { intakeDays: 10, weighIns: 4 },
    };
  }

  // Least-squares slope of weight against day index.
  const t0 = new Date(weights[0].date).getTime();
  const pts = weights.map(w => ({
    x: (new Date(w.date).getTime() - t0) / 86400000,
    y: w.d.weight,
  }));
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const num = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const slopeKgPerDay = den ? num / den : 0;

  // Residual scatter around the fit tells us how trustworthy the slope is.
  const resid = pts.map(p => p.y - (my + slopeKgPerDay * (p.x - mx)));
  const rms = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / n);
  const spanDays = Math.max(1, pts[n - 1].x - pts[0].x);

  let intakeSum = 0, sigmaSq = 0;
  for (const x of intakeDays) {
    const t = dayTotals(x.d);
    intakeSum += t.kcal;
    sigmaSq += t.sigma * t.sigma;
  }
  const meanIntake = intakeSum / intakeDays.length;
  const intakeSigma = Math.sqrt(sigmaSq) / intakeDays.length;

  const tdee = meanIntake - slopeKgPerDay * KCAL_PER_KG_TISSUE;

  // Uncertainty in the slope translates straight into uncertainty in TDEE.
  const slopeSigma = den ? rms / Math.sqrt(den) : 0.05;
  const sigma = Math.sqrt(
    intakeSigma ** 2 + (slopeSigma * KCAL_PER_KG_TISSUE) ** 2
  );

  return {
    kcal: Math.round(tdee),
    sigma: Math.round(sigma),
    source: 'adaptive',
    ready: true,
    slopeKgPerWeek: +(slopeKgPerDay * 7).toFixed(3),
    meanIntake: Math.round(meanIntake),
    spanDays: Math.round(spanDays),
    samples: { intakeDays: intakeDays.length, weighIns: n },
    scatterKg: +rms.toFixed(2),
  };
}

/*
 * Local copy of the totals maths so this module stays independent of store.
 * Home dishes carry no fixed per100 block, so they are valued from whatever
 * density estimate was current when they were logged.
 */
function dayTotals(d) {
  const M = { weighed: 0.02, label: 0.05, portion: 0.12, estimate: 0.25 };
  const G = { A: 1.0, B: 1.2, C: 1.6, D: 2.2 };
  let kcal = 0, varSum = 0;
  for (const e of d.entries) {
    if (e.dish) {
      const density = e.density || 1.2;
      const k = e.grams * density;
      kcal += k;
      const s = e.grams * (e.densitySd || 0.2);
      varSum += s * s;
      continue;
    }
    const k = (e.per100.kcal || 0) * e.grams / 100;
    kcal += k;
    const s = k * (M[e.method] ?? 0.12) * (G[e.grade] ?? 1.3);
    varSum += s * s;
  }
  return { kcal, sigma: Math.sqrt(varSum) };
}

/* Whoop reports total daily energy expenditure directly. */
export function whoopTDEE(store, windowDays = 14) {
  const rows = Object.entries(store.whoop?.rows || {}).sort();
  const recent = rows.slice(-windowDays).filter(([, r]) => r.kcal > 0);
  if (recent.length < 5) return { kcal: null, source: 'whoop', ready: false, have: recent.length };
  const vals = recent.map(([, r]) => r.kcal);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  return {
    kcal: Math.round(mean),
    sigma: Math.round(sd),
    source: 'whoop',
    ready: true,
    days: recent.length,
  };
}

/*
 * Pick the best available estimate. Adaptive wins once it has enough data,
 * because it is measured on the actual person rather than predicted for a
 * population or modelled by a wrist strap.
 */
export function bestTDEE(store, profile) {
  const adaptive = adaptiveTDEE(store);
  const whoop = whoopTDEE(store);
  const predicted = predictedTDEE(profile);
  const pref = store.settings?.tdeeSource || 'auto';

  if (pref === 'predicted') return { ...predicted, why: 'You chose the formula estimate.' };
  if (pref === 'whoop' && whoop.ready) return { ...whoop, why: `Mean of your last ${whoop.days} Whoop days.` };
  if (pref === 'adaptive' && adaptive.ready) return { ...adaptive, why: 'Back-calculated from your own log.' };

  if (adaptive.ready) {
    return { ...adaptive, why: `From ${adaptive.samples.intakeDays} logged days and ${adaptive.samples.weighIns} weigh-ins.`, alternatives: { whoop, predicted } };
  }
  if (whoop.ready) {
    return { ...whoop, why: `Mean of your last ${whoop.days} Whoop days.`, alternatives: { adaptive, predicted } };
  }
  return {
    ...predicted,
    why: 'Formula estimate. Log 10 days and 4 weigh-ins and this switches to your real number.',
    alternatives: { adaptive, whoop },
  };
}

/*
 * Macro targets.
 *
 * Protein is set per kg of bodyweight (or lean mass when known) and held
 * high in a deficit, because that is what protects muscle. Fat gets a floor
 * for hormone function. Carbohydrate takes whatever energy is left, which
 * is what actually fuels training.
 */
/*
 * Two floors, not one.
 *
 * A flat 1,200 kcal is the wrong floor for a 91 kg man and the wrong floor
 * for a 50 kg woman. The one that actually means something is your own
 * resting burn: the energy your body spends existing, before you stand up.
 * Eating under that for weeks is how people lose muscle, wreck their
 * training and stall anyway.
 *
 * So the target never drops below resting burn, and the app says when it
 * has stepped in rather than quietly handing back a smaller number.
 */
export function safeFloor(profile) {
  const bmr = bmrFor(profile).kcal;
  return { kcal: Math.max(1200, Math.round(bmr)), bmr, reason: bmr > 1200 ? 'resting burn' : 'absolute minimum' };
}

/*
 * How fast is too fast?
 *
 * Losing more than about 1% of bodyweight a week reliably costs muscle
 * alongside fat, and the heavier you are the more absolute loss that
 * allows. Expressed as a share of bodyweight rather than a flat number so
 * it scales with the person.
 */
export function rateAdvice(profile, rateKgPerWeek) {
  if (rateKgPerWeek >= 0) return null;
  const pctPerWeek = (Math.abs(rateKgPerWeek) / profile.weightKg) * 100;
  if (pctPerWeek <= 0.55) return null;
  return {
    pctPerWeek,
    severe: pctPerWeek > 1.0,
    suggested: +(profile.weightKg * 0.005).toFixed(2),
  };
}

export function macroTargets(profile, tdeeKcal) {
  const goal = GOALS[profile.goal] || GOALS.maintain;
  const rateKgPerWeek = profile.rate ?? goal.rate;
  const delta = (rateKgPerWeek * KCAL_PER_KG_TISSUE) / 7;

  const floor = safeFloor(profile);
  const wanted = Math.round(tdeeKcal + delta);
  const kcal = Math.max(floor.kcal, wanted);
  const floored = kcal > wanted;

  const lean = profile.bodyFatPct > 0
    ? profile.weightKg * (1 - profile.bodyFatPct / 100)
    : null;

  const cutting = rateKgPerWeek < 0;
  /* A goal may set its own protein rule. Recomposition does, because
     building at maintenance calories depends on protein far more than a
     surplus does — it is the only lever left once energy is fixed. */
  const perKg = goal.protein ?? (cutting ? 2.2 : 1.8);
  const leanPerKg = goal.protein ? goal.protein * 1.15 : (cutting ? 2.6 : 2.2);
  const proteinG = Math.round(lean ? lean * leanPerKg : profile.weightKg * perKg);

  const fatFloor = Math.round(profile.weightKg * 0.8);
  const fatFromPct = Math.round((kcal * 0.27) / 9);
  const fatG = Math.max(fatFloor, fatFromPct);

  const remaining = kcal - proteinG * 4 - fatG * 9;
  const carbG = Math.max(40, Math.round(remaining / 4));

  return {
    kcal,
    p: proteinG,
    c: carbG,
    f: fatG,
    fib: Math.round(Math.min(45, Math.max(25, kcal / 1000 * 14))),
    water: waterTarget(profile, profile.suppShift),

    /*
     * Ceilings, not goals.
     *
     * Protein and fibre are things to reach; these are things to stay
     * under, and the app draws them differently for that reason. Sodium
     * 2,300 mg is the standard adult upper limit. Saturated fat at 10% of
     * energy and free sugars at 10% are the WHO figures. Hitting 40% of a
     * target is good news here and bad news everywhere else in the app.
     */
    na: 2300,
    sug: Math.round((kcal * 0.10) / 4),
    sat: Math.round((kcal * 0.10) / 9),
    basis: {
      tdee: Math.round(tdeeKcal), delta: Math.round(delta), rateKgPerWeek,
      proteinPerKg: lean ? null : perKg,
      floored, floor, wanted,
      rate: rateAdvice(profile, rateKgPerWeek),
    },
  };
}

/* 35 ml per kg, plus a litre on hard training days. */
/*
 * Water.
 *
 * 35 ml per kilo, more if you train hard — and more again for what you
 * take. Creatine is the one that matters here: it draws water into muscle,
 * which is most of how it works, and the standard advice alongside it is
 * to drink more. An app that tracks both and never connected them was
 * leaving the obvious on the table.
 */
export function waterTarget(profile, shift = null) {
  const base = Math.round(profile.weightKg * 35 / 50) * 50;
  const bump = ['high', 'athlete'].includes(profile.activity) ? 500 : 0;
  return base + bump + (shift?.waterMl || 0);
}

/* What's left of each target for the rest of the day. */
export function remaining(targets, totals) {
  const r = {};
  for (const k of ['kcal', 'p', 'c', 'f', 'fib', 'water']) {
    r[k] = Math.round((targets[k] || 0) - (totals[k] || 0));
  }
  return r;
}

/*
 * A trend weight, not a scale weight.
 *
 * Daily bodyweight swings by up to a kilo on water alone, which is why the
 * scale lies and people quit. An exponentially weighted moving average with
 * a ~10-day half-life shows the signal underneath.
 */
export function trendWeight(series, halfLife = 10) {
  if (!series.length) return [];
  const alpha = 1 - Math.pow(0.5, 1 / halfLife);
  let ema = series[0].kg;
  return series.map((pt, i) => {
    ema = i === 0 ? pt.kg : ema + alpha * (pt.kg - ema);
    return { ...pt, trend: +ema.toFixed(2) };
  });
}


/* ── The check-in ──────────────────────────────────────────────────── */

/*
 * A weekly or fortnightly look back, not a daily one.
 *
 * Day to day, weight bounces on water and gut contents by up to a kilo, and
 * one bad-adherence day proves nothing. A window this short is why the
 * scale feels like it's lying and why people quit. Give the same data a
 * week to breathe and the signal is unmistakable — which is the entire
 * argument for checking in on this cadence rather than daily.
 */
export function checkIn(store, days = 7) {
  const dayKeys = Object.keys(store.days).sort();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const from = new Date(cutoff.getTime() - cutoff.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);

  const window_ = dayKeys.filter(k => k >= from);
  const logged = window_.filter(k => store.days[k].entries?.length >= 2);
  const weighed = window_.filter(k => store.days[k].weight > 0);

  if (logged.length < Math.ceil(days * 0.4)) {
    return { ready: false, days, logged: logged.length, needed: Math.ceil(days * 0.4) };
  }

  // Intake, with its own uncertainty carried through rather than dropped.
  let kcalSum = 0, sigmaSq = 0, adherence = 0;
  const targets = [];
  for (const k of logged) {
    const t = totalsFor(store.days[k]);
    kcalSum += t.kcal;
    sigmaSq += t.sigma * t.sigma;
  }
  const meanIntake = kcalSum / logged.length;
  const intakeSigma = Math.sqrt(sigmaSq) / logged.length;

  // Weight change across the window, from the first and last available
  // reading rather than a single noisy pair.
  let weightChange = null, startKg = null, endKg = null;
  if (weighed.length >= 2) {
    startKg = store.days[weighed[0]].weight;
    endKg = store.days[weighed[weighed.length - 1]].weight;
    weightChange = endKg - startKg;
  }

  // How much of the window was actually logged.
  const coverage = logged.length / window_.length;

  return {
    ready: true,
    days, from, to: window_[window_.length - 1],
    loggedDays: logged.length, totalDays: window_.length, coverage,
    weighIns: weighed.length,
    meanIntake: Math.round(meanIntake), intakeSigma: Math.round(intakeSigma),
    weightChange: weightChange != null ? +weightChange.toFixed(2) : null,
    startKg, endKg,
    weeklyRate: weightChange != null ? +(weightChange * (7 / days)).toFixed(2) : null,
  };
}

function totalsFor(day) {
  let kcal = 0, varSum = 0;
  const M = { weighed: 0.02, label: 0.05, portion: 0.12, estimate: 0.25, dish: 0.18 };
  const G = { A: 1.0, B: 1.2, C: 1.6, D: 2.2 };
  for (const e of day.entries || []) {
    if (e.dish) {
      const d = e.grams * (e.density || 1.2);
      kcal += d;
      varSum += (e.grams * (e.densitySd || 0.2)) ** 2;
      continue;
    }
    const k = (e.per100.kcal || 0) * e.grams / 100;
    kcal += k;
    const s = k * (M[e.method] ?? 0.12) * (G[e.grade] ?? 1.3);
    varSum += s * s;
  }
  return { kcal, sigma: Math.sqrt(varSum) };
}

/*
 * Turn the numbers into a sentence, in the register the app uses
 * throughout: plain, specific, no cheerleading and no scolding. A
 * fortnightly loss target that expects 0.5 kg and got 0.1 is a fact to
 * report, not a failure to soften.
 */
export function checkInVerdict(ci, profile, targetRateKgPerWeek) {
  if (!ci.ready) {
    return {
      tone: 'info',
      headline: 'Not enough logged yet',
      body: `${ci.logged} of the last ${ci.days} days have a real log. `
          + `With ${ci.needed}+ the app can tell you something true instead of guessing.`,
    };
  }

  const parts = [];
  const tone1 = ci.coverage >= 0.85 ? 'good' : ci.coverage >= 0.5 ? 'info' : 'warn';
  parts.push(
    `Logged ${ci.loggedDays} of ${ci.totalDays} days`
    + (ci.coverage < 0.85 ? ` (${Math.round(ci.coverage * 100)}%) — the gaps make everything below softer than it looks.` : '.'));

  if (ci.weightChange == null) {
    parts.push('No weigh-ins to compare, so no trend to report — the calorie side is real, the weight side is a guess until you weigh in a few times.');
  } else {
    const wantedKg = -(targetRateKgPerWeek || 0) * (ci.days / 7);
    const gotKg = -ci.weightChange;   // loss framed positive, matching how people think about it
    const diff = gotKg - wantedKg;

    if (targetRateKgPerWeek < 0) {
      if (Math.abs(diff) < 0.15) {
        parts.push(`Lost ${gotKg.toFixed(1)} kg, right where the ${wantedKg.toFixed(1)} kg target aimed. This is working.`);
      } else if (diff > 0) {
        parts.push(`Lost ${gotKg.toFixed(1)} kg against a ${wantedKg.toFixed(1)} kg target — faster than planned. Worth checking the pace isn't costing more than fat.`);
      } else if (gotKg > 0.05) {
        parts.push(`Lost ${gotKg.toFixed(1)} kg against a ${wantedKg.toFixed(1)} kg target — real progress, just slower than aimed. That is usually intake creeping up, not a broken metabolism.`);
      } else if (Math.abs(gotKg) <= 0.05) {
        /* Flat is its own outcome, not a loss of zero. Saying weight moved
           "the wrong way" when it did not move at all is simply wrong. */
        parts.push(`Weight held flat against a ${wantedKg.toFixed(1)} kg target. `
          + (ci.coverage >= 0.7
              ? `At an average of ${kcal_(ci.meanIntake)} kcal a day that points at the target being set too high rather than at anything you did.`
              : `With ${Math.round(ci.coverage * 100)}% of days logged there is not enough here to say why.`));
      } else {
        /*
         * Weight moved the wrong way. Whether that means "too many
         * calories" depends on how much was actually logged: with most
         * days covered, the intake figure is trustworthy enough to blame.
         * With half the window missing, the honest read is that the gap
         * is unmeasured, not that the logged number was too high — saying
         * otherwise would tell someone eating 785 kcal that they ate too
         * much, which is backwards and would send them the wrong way.
         */
        if (ci.coverage >= 0.7) {
          parts.push(`Weight moved ${(-gotKg).toFixed(1)} kg the wrong way against an average of ${kcal_(ci.meanIntake)} kcal a day. `
            + `That is a real gap between what was eaten and what was logged, or the target itself needs revisiting.`);
        } else {
          parts.push(`Weight moved ${(-gotKg).toFixed(1)} kg the wrong way, but only ${Math.round(ci.coverage * 100)}% of days were logged. `
            + `The ${kcal_(ci.meanIntake)} kcal average is from the days that were tracked — the unlogged days are the more likely explanation, not those numbers.`);
        }
      }
    } else {
      parts.push(`Weight moved ${ci.weightChange >= 0 ? '+' : ''}${ci.weightChange.toFixed(1)} kg over ${ci.days} days.`);
    }
  }

  /*
   * Tone and headline must come from the same judgement.
   *
   * They were computed separately, which produced a green dot next to
   * "Off from the plan" — the colour and the words contradicting each
   * other on the same line.
   */
  const status = checkInStatus(ci, targetRateKgPerWeek);
  return { tone: status.tone, headline: status.headline, body: parts.join(' ') };
}

function kcal_(n) { return Math.round(n).toLocaleString('en-IN'); }

/* One judgement, used for both the words and the colour. */
function checkInStatus(ci, targetRateKgPerWeek) {
  if (!ci.ready) return { headline: 'Keep logging', tone: 'info' };
  if (ci.weightChange == null) {
    return { headline: 'Intake tracked, no weight trend yet', tone: 'info' };
  }

  const poorCoverage = ci.coverage < 0.5;
  const flat = Math.abs(ci.weightChange) <= 0.05;
  const moving = targetRateKgPerWeek < 0 ? -ci.weightChange
               : targetRateKgPerWeek > 0 ? ci.weightChange
               : -Math.abs(ci.weightChange);

  if (targetRateKgPerWeek === 0) {
    return flat || Math.abs(ci.weightChange) < 0.3
      ? { headline: 'Holding steady', tone: 'good' }
      : { headline: 'Drifting from maintenance', tone: 'info' };
  }

  if (flat) return { headline: 'Not moving', tone: 'info' };
  if (moving > 0) {
    return poorCoverage
      ? { headline: 'Moving, but barely logged', tone: 'info' }
      : { headline: 'On track', tone: 'good' };
  }
  return { headline: 'Going the wrong way', tone: 'warn' };
}


/* ── Goals with a deadline ─────────────────────────────────────────── */

/*
 * "Lose 3 kg in two months" is how people actually think about this, and
 * it is a more useful way to set a target than picking a weekly rate in the
 * abstract — the rate falls out of the goal rather than the other way
 * round.
 *
 * The honest part is what happens next: once there is a weight trend, the
 * app compares the pace the goal needs against the pace actually happening
 * and reports the gap, rather than quietly moving the finish line.
 */
export function goalStatus(store, profile, today = new Date()) {
  const goal = store.goal;
  if (!goal || !goal.targetKg || !goal.byDate) return null;

  const start = new Date(goal.startDate + 'T12:00:00');
  const end = new Date(goal.byDate + 'T12:00:00');
  const totalDays = Math.max(1, Math.round((end - start) / 86400000));
  const elapsed = Math.max(0, Math.round((today - start) / 86400000));
  const daysLeft = Math.max(0, Math.round((end - today) / 86400000));

  const series = Object.entries(store.days)
    .filter(([, d]) => d.weight > 0)
    .map(([date, d]) => ({ date, kg: d.weight }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const withTrend = trendWeight(series);
  const current = withTrend.length ? withTrend[withTrend.length - 1].trend : profile.weightKg;

  const totalChange = goal.targetKg - goal.startKg;
  const doneChange = current - goal.startKg;
  const remaining = goal.targetKg - current;

  // progress against the goal, not against the calendar
  const progress = totalChange !== 0
    ? Math.max(0, Math.min(1, doneChange / totalChange))
    : 0;

  const neededPerWeek = daysLeft > 0 ? (remaining / daysLeft) * 7 : 0;

  /* Actual pace from the last three weeks of trend, which is the shortest
     window where the number means anything. */
  let actualPerWeek = null;
  const recent = withTrend.slice(-21);
  if (recent.length >= 6) {
    const t0 = new Date(recent[0].date).getTime();
    const pts = recent.map(p => ({
      x: (new Date(p.date).getTime() - t0) / 86400000, y: p.trend,
    }));
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p.x, 0) / n;
    const my = pts.reduce((a, p) => a + p.y, 0) / n;
    const num = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
    const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    if (den) actualPerWeek = (num / den) * 7;
  }

  let projectedDate = null;
  if (actualPerWeek && Math.abs(actualPerWeek) > 0.01
      && Math.sign(actualPerWeek) === Math.sign(remaining || totalChange)) {
    const weeks = remaining / actualPerWeek;
    if (weeks > 0 && weeks < 260) {
      const d = new Date(today);
      d.setDate(d.getDate() + Math.round(weeks * 7));
      projectedDate = d.toISOString().slice(0, 10);
    }
  }

  const onPace = actualPerWeek != null && neededPerWeek !== 0
    ? actualPerWeek / neededPerWeek
    : null;

  return {
    ...goal,
    current: +current.toFixed(1),
    remaining: +remaining.toFixed(1),
    progress,
    totalDays, elapsed, daysLeft,
    neededPerWeek: +neededPerWeek.toFixed(2),
    actualPerWeek: actualPerWeek == null ? null : +actualPerWeek.toFixed(2),
    onPace,
    projectedDate,
    reached: totalChange < 0 ? current <= goal.targetKg : current >= goal.targetKg,
  };
}

/*
 * The pace a goal implies, and whether it is a sane one to attempt.
 * Beyond roughly 1% of bodyweight a week the loss stops being mostly fat,
 * so a goal that requires more than that is worth flagging before it is set
 * rather than after it has failed.
 */
export function goalFeasibility(startKg, targetKg, days) {
  const weeks = Math.max(0.1, days / 7);
  const perWeek = (targetKg - startKg) / weeks;
  const pctPerWeek = Math.abs(perWeek) / startKg * 100;
  const losing = perWeek < 0;

  let verdict = 'sensible';
  if (pctPerWeek > 1.0) verdict = losing ? 'too fast' : 'mostly fat gain';
  else if (pctPerWeek > 0.7) verdict = 'aggressive';
  else if (pctPerWeek < 0.08) verdict = 'very gentle';

  return {
    perWeek: +perWeek.toFixed(2),
    pctPerWeek: +pctPerWeek.toFixed(2),
    verdict, losing,
    suggestedDays: pctPerWeek > 1.0
      ? Math.ceil(Math.abs(targetKg - startKg) / (startKg * 0.0075) * 7)
      : null,
  };
}
