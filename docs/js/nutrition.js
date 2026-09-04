import { entryMacros } from './store.js';
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
  cut:      { label: 'Lose fat',      rate: -0.5,
              hint: 'A real deficit with protein held high. The fastest of the sensible '
                  + 'options, and the one that asks the most of you to stick to.' },
  lean:     { label: 'Lean slowly',   rate: -0.25,
              hint: 'Half the deficit, most of the result, and your training stays good. '
                  + 'The one most people should pick and do not.' },
  maintain: { label: 'Maintain',      rate: 0,
              hint: 'Hold your weight. Not a lack of a goal — if you are still growing, '
                  + 'or coming off a long diet, it is the goal.' },
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
  recomp:   { label: 'Lose fat, build muscle', rate: 0, protein: 2.4, recomp: true,
              hint: 'Calories at maintenance so the scale holds, protein high enough to build '
                  + 'on. You get leaner without getting lighter, so judge it by the mirror, '
                  + 'the tape and your lifts — the scale will not move, by design.' },
  gain:     { label: 'Build',         rate: 0.25,
              hint: 'A slow surplus. Muscle with as little fat alongside it as possible.' },
  bulk:     { label: 'Gain fast',     rate: 0.5,
              hint: 'A bigger surplus. Faster, and more of what you gain will be fat.' },
};

export function age(birthYear, birthMonth = 6) {
  const now = new Date();
  return now.getFullYear() - birthYear - (now.getMonth() + 1 < birthMonth ? 1 : 0);
}

/* Mifflin-St Jeor — the best-validated prediction equation for BMR.
   Derived in adults aged 19–78, which is why it is not used below that. */
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

/*
 * Schofield, as adopted by FAO/WHO/UNU — the equations for people who are
 * still growing.
 *
 * Mifflin-St Jeor was derived in adults and reads low on an adolescent,
 * who runs a higher resting burn per kilo and is spending energy on growth
 * besides. Feeding a sixteen-year-old off an adult equation understates
 * what he needs before any deficit is applied, and then the deficit comes
 * off that.
 *
 * Weight-based rather than weight-and-height, which is the form these are
 * normally quoted and used in. For somebody carrying a lot of fat it reads
 * high, since fat mass is less metabolically active than the equation
 * assumes — an error in the safe direction here, and one that disappears
 * as soon as body fat % is known.
 */
const SCHOFIELD = {
  male:   [[3, 10, 22.7, 495], [10, 18, 17.5, 651], [18, 30, 15.3, 679], [30, 60, 11.6, 879]],
  female: [[3, 10, 22.5, 499], [10, 18, 12.2, 746], [18, 30, 14.7, 496], [30, 60, 8.7, 829]],
};

export function bmrSchofield({ sex, weightKg, years }) {
  const bands = SCHOFIELD[sex === 'female' ? 'female' : 'male'];
  const b = bands.find(([lo, hi]) => years >= lo && years < hi) || bands[bands.length - 1];
  return Math.round(b[2] * weightKg + b[3]);
}

/* Still growing, in the sense that matters here: peak bone mass is still
   being laid down, height may still be increasing, and puberty is either
   under way or recent. Eighteen is the line the equations themselves draw. */
export const isYouth = profile => age(profile?.birthYear) < 18;

/*
 * Which equation the app actually uses.
 *
 * Mifflin-St Jeor, or Katch-McArdle when body fat is known — which is
 * exactly what the calorie calculators everybody checks against do, and
 * matching them is the point. A number that disagrees with every other
 * number a person can find is a number they stop believing, however well
 * it is argued.
 *
 * For under-18s Schofield reads higher (see above) and there is a real
 * case for it. It is not used, but it is not hidden either: the figure
 * comes back alongside so the screens can say what the age-specific
 * equation would have given. Informing beats overruling.
 *
 * None of the guardrails depend on this choice. The carbohydrate RDA, the
 * protein ceiling, the slower deficit limit for people still growing and
 * the resting-burn floor all still apply, because those are about what the
 * app is willing to RECOMMEND rather than about which equation produced
 * the starting figure.
 */
export function bmrFor(profile) {
  const years = age(profile.birthYear);
  const youth = years < 18;
  /* What the age-specific equation would say, carried for comparison. */
  const schofield = youth ? bmrSchofield({ ...profile, years }) : null;

  if (profile.bodyFatPct > 0) {
    return {
      kcal: bmrKatch(profile), method: 'Katch-McArdle',
      note: 'uses your lean mass', youth, schofield,
    };
  }
  return {
    kcal: bmrMifflin({ ...profile, years }),
    method: 'Mifflin-St Jeor',
    note: 'add body fat % for a sharper figure',
    youth, schofield,
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
export function whoopTDEE(store, windowDays = 14, rowsOverride = null) {
  const rows = Object.entries(rowsOverride || store.whoop?.rows || {}).sort();
  const recent = rows.slice(-windowDays).filter(([, r]) => r.kcal > 0);
  if (recent.length < 5) return { kcal: null, source: 'whoop', ready: false, have: recent.length };
  const vals = recent.map(([, r]) => r.kcal);
  /* Which wrist the burn was actually read off, counted rather than
     assumed — the tile beside this names a band, and naming the wrong one
     is worse than naming none. */
  const fromApple = recent.filter(([, r]) => r.by?.kcal === 'apple').length;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  return {
    kcal: Math.round(mean),
    sigma: Math.round(sd),
    source: 'whoop',
    ready: true,
    days: recent.length,
    fromApple,
    fromWhoop: recent.length - fromApple,
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
/*
 * The carbohydrate figure nobody should be recommended below.
 *
 * 130 g a day is the RDA for everyone over one year old, and it is not a
 * lifestyle number — it is set by what the brain burns as glucose. Low-carb
 * diets run under it deliberately and adults are entitled to make that
 * choice, which is why this constrains what the app RECOMMENDS and not
 * what you are allowed to set.
 *
 * It matters most for the people least able to argue with an app. A
 * sixteen-year-old told to eat 100 g of carbs by software he trusts has
 * been given a number below the RDA by something that sounded official.
 */
export const CARB_RDA = 130;

/*
 * What changes when the person is still growing.
 *
 * Adolescence is when peak bone mass is laid down, when height is still
 * being added, and when the hormonal machinery is still coming online.
 * Energy restriction across that window is not the same intervention it is
 * at thirty: it can cost final height, it can delay or disrupt puberty, and
 * bone laid down poorly is not laid down again later.
 *
 * Which is why the standard clinical answer to adolescent obesity is not a
 * deficit at all — it is holding weight steady while height keeps coming.
 * The ratio improves without anything being taken away, because the
 * denominator is still moving. That is a genuinely better recommendation
 * than a cut, not a softer one, and it is what the app now suggests.
 *
 * Nothing here is a block. A sixteen-year-old who insists on a deficit can
 * still set one, and the app will still count it honestly. But it should
 * never be the thing the app proposed.
 */
export function youthGuidance(profile) {
  const years = age(profile?.birthYear);
  if (years >= 18) return null;

  const w = profile?.weightKg || 0;
  return {
    years,
    /* A third of a percent of bodyweight a week, against the 0.55% an
       adult can run without comment. Slow enough that growth is not
       competing with the deficit for the same energy. */
    maxRate: +(w * 0.0035).toFixed(2),
    holdInstead: true,
    why: 'Still growing: holding your weight while you get taller lowers the ratio '
       + 'on its own, without taking energy away from growth, bone and puberty. '
       + 'That is what doctors do first at your age, and it is the recommendation here.',
    seeSomeone: 'Losing weight on purpose before eighteen is worth doing with a doctor '
       + 'rather than an app — not because the goal is wrong, but because someone should '
       + 'be checking growth and bloods while it happens.',
  };
}

export function safeFloor(profile) {
  const bmr = bmrFor(profile).kcal;
  const youth = youthGuidance(profile);
  /* For someone still growing the floor is their whole resting burn, with
     no 1,200 kcal escape hatch underneath it — that figure is an adult
     convention and has no business being applied to a fifteen-year-old. */
  const hard = youth ? bmr : 1200;
  return {
    kcal: Math.max(hard, Math.round(bmr)),
    bmr,
    youth: !!youth,
    reason: youth ? 'your resting burn, and you are still growing'
          : bmr > 1200 ? 'resting burn' : 'absolute minimum',
  };
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
  const youth = youthGuidance(profile);

  /* Gaining fast is its own question at this age and not one the app
     should be pushing either, but the thing that does damage is the
     deficit, so that is what is checked. */
  if (rateKgPerWeek >= 0) return null;

  const pctPerWeek = (Math.abs(rateKgPerWeek) / profile.weightKg) * 100;

  if (youth) {
    if (pctPerWeek <= 0.35) return null;
    return {
      pctPerWeek,
      severe: pctPerWeek > 0.7,
      suggested: youth.maxRate,
      youth,
    };
  }

  if (pctPerWeek <= 0.55) return null;
  return {
    pctPerWeek,
    severe: pctPerWeek > 1.0,
    suggested: +(profile.weightKg * 0.005).toFixed(2),
  };
}

export function macroTargets(profile, tdeeKcal) {
  /* A split you set applies wherever targets are read, including the
     stored s.targets snapshot that Settings and the older screens use.
     Applied at the end, so everything below still computes the
     recommendation that "back to recommended" returns you to. */
  return applyCustom(computeTargets(profile, tdeeKcal), profile);
}

function computeTargets(profile, tdeeKcal) {
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

  const youth = youthGuidance(profile);
  const cutting = rateKgPerWeek < 0;
  /* A goal may set its own protein rule. Recomposition does, because
     building at maintenance calories depends on protein far more than a
     surplus does — it is the only lever left once energy is fixed. */
  let perKg = goal.protein ?? (cutting ? 2.2 : 1.8);
  let leanPerKg = goal.protein ? goal.protein * 1.15 : (cutting ? 2.6 : 2.2);
  /*
   * Protein is capped while growing, which sounds backwards and is not.
   * Adolescents need generous protein and get it easily; what they cannot
   * afford is protein so high that it crowds carbohydrate out of a budget
   * that also has to fund growth. 2.0 g/kg is ample at this age and leaves
   * the room the rest of this function then spends on carbs.
   */
  if (youth) { perKg = Math.min(perKg, 2.0); leanPerKg = Math.min(leanPerKg, 2.3); }
  let proteinG = Math.round(lean ? lean * leanPerKg : profile.weightKg * perKg);

  /*
   * Protein also gets a ceiling as a share of energy, not just per kilo.
   *
   * Grams-per-kilo of TOTAL bodyweight overshoots badly for anyone
   * carrying a lot of fat, because protein requirements track lean mass
   * and fat mass does not ask to be fed. At 118 kg the 2.2 g/kg rule
   * asked for 260 g — more than a thousand calories, roughly half an
   * aggressive target — which then left 76 g of carbohydrate for the day.
   * The number was not wrong for a lean 118 kg athlete; it was wrong for
   * the person actually typing it in.
   *
   * Above about 40% of energy there is no further benefit to protein, so
   * that is where it stops, and the room goes back to the other two. The
   * per-kilo floor still applies underneath — this trims excess, it never
   * cuts into what protects muscle in a deficit. Knowing your body fat %
   * sidesteps the whole thing, since lean mass is then used directly.
   */
  const proteinCeil = Math.floor((kcal * 0.40) / 4);
  const proteinFloorG = Math.round(profile.weightKg * 1.6);
  if (proteinG > proteinCeil) proteinG = Math.max(proteinFloorG, proteinCeil);

  const fatFloorG = Math.round(profile.weightKg * 0.8);
  const fatFromPct = Math.round((kcal * 0.27) / 9);
  let fatG = Math.max(fatFloorG, fatFromPct);

  /*
   * Carbohydrate gets what is left — unless what is left is under the RDA,
   * in which case fat gives way down to its own floor to make room.
   *
   * This is the line that produced "100 g of carbs" for a sixteen-year-old.
   * Carbs were simply the remainder after protein and fat had taken what
   * they wanted, with a token 40 g backstop that no real diet would ever
   * hit — so an aggressive goal quietly pushed carbohydrate below the
   * amount the brain runs on, and the app presented that as its
   * recommendation.
   *
   * Fat yields first because it has the more generous margin above its
   * floor. If even that is not enough the shortfall is reported rather
   * than hidden: a target that cannot fund 130 g of carbohydrate alongside
   * its own protein and fat is a target set too low, and saying so is more
   * use than silently printing a smaller number.
   */
  let carbG = Math.round((kcal - proteinG * 4 - fatG * 9) / 4);
  let carbFloored = false;

  if (carbG < CARB_RDA) {
    const needKcal = (CARB_RDA - carbG) * 4;
    const fatRoomKcal = Math.max(0, (fatG - fatFloorG) * 9);
    const takeKcal = Math.min(needKcal, fatRoomKcal);
    fatG = Math.round(fatG - takeKcal / 9);
    carbG = Math.round((kcal - proteinG * 4 - fatG * 9) / 4);
    carbFloored = carbG < CARB_RDA;
  }
  carbG = Math.max(40, carbG);

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
      youth,
      /* True when even a floor-level fat figure could not free up the RDA,
         which says the calorie target itself is too low rather than the
         split being badly chosen. */
      carbFloored,
      carbRda: CARB_RDA,
    },
  };
}

/*
 * The split the app would choose, ignoring anything you have chosen.
 *
 * Kept separate so the editor can show both at once — what you have set
 * against what was suggested — and so "back to recommended" has something
 * to go back to.
 */
export function recommendedTargets(profile, tdeeKcal) {
  return computeTargets(profile, tdeeKcal);
}

/*
 * Your split, if you have set one.
 *
 * Applied here rather than at any single screen, so every consumer — the
 * readout, the coach, the report, the planner — sees the same numbers.
 * There is no separate "custom mode" flag: a stored split IS custom mode,
 * and clearing it is how you go back.
 *
 * Deliberately permissive. The macros are allowed not to add up to the
 * calories, because a person typing exact numbers off a plan their coach
 * gave them is not making an arithmetic mistake, and an app that silently
 * "corrects" them is worse than one that says plainly what the gap is.
 * The saying-so lives in the editor and on the Detail screen; the model
 * just carries the numbers.
 */
export function applyCustom(targets, profile) {
  const c = profile?.custom;
  if (!c) return targets;

  const has = ['p', 'c', 'f'].every(k => Number.isFinite(c[k]));
  const kcal = Number.isFinite(c.kcal) ? c.kcal : targets.kcal;
  const out = { ...targets, kcal };

  if (has) {
    out.p = Math.round(c.p);
    out.c = Math.round(c.c);
    out.f = Math.round(c.f);
    /* Fibre tracks energy, not the split, so it follows the calorie
       number rather than being frozen at whatever it was when you dragged
       a slider. */
    out.fib = Math.round(Math.min(45, Math.max(25, kcal / 1000 * 14)));
    out.sug = Math.round((kcal * 0.10) / 4);
    out.sat = Math.round((kcal * 0.10) / 9);
  }

  const fromMacros = has ? out.p * 4 + out.c * 4 + out.f * 9 : kcal;
  out.custom = {
    ...c,
    macros: has,
    fixedKcal: Number.isFinite(c.kcal),
    /* What the split actually adds up to, against what the day is set to.
       Only meaningful when they disagree, which only typing can cause. */
    macroKcal: Math.round(fromMacros),
    gap: Math.round(fromMacros - kcal),
  };
  return out;
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

/*
 * What the log says your weight should be doing, against what it is doing.
 *
 * This is the app checking itself, and it is the only check that can catch
 * the failure mode every food log has: not lying, exactly, but leaving
 * things out. A handful of nuts, the oil the vegetables were cooked in,
 * the second helping. None of it gets logged, all of it is eaten, and the
 * numbers on screen stay reassuring while the scale refuses to move.
 *
 * Two lines answer it. One is arithmetic on what you logged: every day's
 * intake minus that day's maintenance, accumulated, divided by the energy
 * in a kilogram of body tissue. The other is your actual trend weight.
 *
 * When they track together the log is honest and maintenance is right —
 * and only then does anything else the app tells you mean much. When they
 * separate, exactly one of two things is true, and the direction says
 * which: the scale falling behind the plan means the deficit is smaller
 * than the log claims, which is almost always food that never got typed
 * in; the scale falling faster than the plan means maintenance is set too
 * low, and the target is stricter than it needs to be.
 *
 * 7700 kcal per kilogram: 3500 per pound, the standard figure for mixed
 * tissue. It is an approximation and the caption says so — the shape of
 * the gap is the finding here, not its third significant figure.
 */
const KCAL_PER_KG = 7700;

export function planVsActual(store, windowDays = 60) {
  const maint = bestTDEE(store, store.profile);
  if (!maint?.kcal) return { ready: false, reason: 'no maintenance figure yet' };

  const cutoff = localDayKey(new Date(Date.now() - windowDays * 86400000));
  const days = Object.entries(store.days || {})
    .filter(([date]) => date >= cutoff)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (!days.length) return { ready: false, reason: 'nothing logged yet' };

  /* Anchored on the first real weigh-in, because a predicted line has to
     start somewhere true. Before that there is nothing to predict from. */
  const firstWeighed = days.find(([, d]) => d.weight > 0);
  if (!firstWeighed) return { ready: false, reason: 'no weigh-ins yet' };
  const startDate = firstWeighed[0];
  const startKg = firstWeighed[1].weight;

  const trend = trendWeight(
    days.filter(([, d]) => d.weight > 0).map(([date, d]) => ({ date, kg: d.weight })));
  const trendBy = new Map(trend.map(p => [p.date, p.trend]));

  let cum = 0, logged = 0, skipped = 0;
  const raw = [];
  for (const [date, d] of days) {
    if (date < startDate) continue;
    const eaten = (d.entries || []).length
      ? entriesKcal(d.entries)
      : null;
    /* A day with nothing logged is not a day at maintenance — it is a day
       with no information. Carrying the line flat through it would quietly
       assert something the log never said, so the line pauses and the
       count of skipped days is reported instead. */
    if (eaten == null) skipped++;
    else { cum += eaten - maint.kcal; logged++; }
    raw.push({ date, kg: startKg + cum / KCAL_PER_KG, logged: eaten != null });
  }

  /*
   * Smooth the prediction the same way the scale is smoothed.
   *
   * The measured line is a ten-day trend, which by construction lags a
   * steady change by about ten days' worth of it. Compared against an
   * unsmoothed prediction, that lag alone opened a gap of nearly a
   * kilogram on someone logging perfectly — the chart would have accused
   * an honest person of hiding food, which is the one thing it must never
   * do. Both lines carry the same lag now, so what is left between them
   * is the disagreement and nothing else.
   */
  const smoothed = trendWeight(raw, 10);
  /*
   * The measured line carries forward across days with no weigh-in.
   *
   * It is a ten-day trend, not a reading — it does not cease to exist on a
   * morning you skipped the scale, and breaking the line there produced a
   * dashed prediction running under a row of disconnected stubs. Held flat
   * until the next weigh-in updates it, which is what the trend is
   * actually doing.
   */
  let carried = null;
  const points = smoothed.map((p, i) => {
    if (trendBy.has(p.date)) carried = trendBy.get(p.date);
    return {
      date: p.date,
      expected: p.trend,
      actual: carried,
      measured: trendBy.has(p.date),
      logged: raw[i].logged,
    };
  });

  const withBoth = points.filter(p => p.actual != null);
  const last = withBoth[withBoth.length - 1] || null;
  const gapKg = last ? +(last.actual - last.expected).toFixed(2) : null;

  return {
    ready: logged >= 7 && withBoth.length >= 3,
    need: { loggedDays: 7, weighIns: 3 },
    have: { loggedDays: logged, weighIns: withBoth.length },
    points, gapKg, skipped, maintenance: maint.kcal, maintenanceSource: maint.source,
    startDate, days: points.length,
  };
}

/*
 * Kilocalories on a day, resolved the way the rest of the app resolves
 * them — a home-dish entry stores grams and a style, and its density is
 * worked out at read time, so reconstructing the arithmetic here would
 * quietly disagree with the number on the day's own tile.
 */
function entriesKcal(entries) {
  let sum = 0;
  for (const e of entries) sum += entryMacros(e).kcal;
  return sum;
}
