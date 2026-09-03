/*
 * Macro quality — what the gram totals don't tell you.
 *
 * 40 g of protein from whey and 40 g from rice are not the same 40 g. A
 * spoon of ghee and a spoon of olive oil are both 14 g of fat. Rice and
 * refined flour are both carbohydrate. The calorie total is blind to all
 * of it, and those differences are where the actual decisions live.
 *
 * HOW THESE NUMBERS ARE MADE, because it matters:
 *
 * Each food is tagged with a class, and the breakdown is derived from that
 * class rather than from 1,800 hand-entered figures. Leucine really does
 * sit at a fairly stable fraction of protein within a source type — around
 * 10.5% for whey, 8% for meat, 7% for grains — so classing a food and
 * multiplying is closer to the truth than inventing a precise-looking
 * number for each one would be.
 *
 * That means these are good to roughly ±15%, not ±2%. Right for "am I
 * getting enough leucine at breakfast", wrong for anything clinical. The
 * saturated fat and fibre figures are real per-food data; everything
 * derived here is flagged as derived in the UI.
 */

/* ── Protein ────────────────────────────────────────────────────────── */

/*
 * Leucine is the trigger, not just a building block.
 *
 * Muscle protein synthesis is switched on by leucine crossing a threshold
 * in a single sitting — roughly 2.5 to 3 g for a young adult. Below it a
 * meal largely fails to start the process no matter how much total protein
 * it carried; above it, more leucine adds little. This is the entire reason
 * protein timing across meals matters at all, and why a 45 g protein dinner
 * plus a 10 g protein breakfast is worse than splitting them evenly.
 */
export const LEUCINE_THRESHOLD_G = 2.5;

/*
 * A protein is "complete" when it supplies all nine essential amino acids —
 * histidine, isoleucine, leucine, lysine, methionine, phenylalanine,
 * threonine, tryptophan, valine — in usable proportion. Incomplete sources
 * are not missing one outright; they are short of one relative to need, and
 * that one is the LIMITING amino acid, because it caps how much of the rest
 * can be used for synthesis.
 *
 * This is why the classic pairings work. Cereals are limited by lysine,
 * pulses by methionine, and each supplies what the other lacks — dal with
 * roti, rajma with chawal. Complementation does not have to happen in the
 * same mouthful, but the same meal is the reliable version.
 *
 * DIAAS is the modern digestibility-corrected quality score; the tiers here
 * track it approximately without pretending to measure it.
 */
export const ESSENTIAL_AA = [
  'histidine', 'isoleucine', 'leucine', 'lysine', 'methionine',
  'phenylalanine', 'threonine', 'tryptophan', 'valine',
];

export const PROTEIN_CLASS = {
  whey:   { leu: 0.105, complete: true,  label: 'Whey',      diaas: 'very high', limiting: null },
  dairy:  { leu: 0.095, complete: true,  label: 'Dairy',     diaas: 'very high', limiting: null },
  egg:    { leu: 0.086, complete: true,  label: 'Egg',       diaas: 'very high', limiting: null },
  meat:   { leu: 0.082, complete: true,  label: 'Meat',      diaas: 'high',      limiting: null },
  fish:   { leu: 0.081, complete: true,  label: 'Fish',      diaas: 'high',      limiting: null },
  soy:    { leu: 0.078, complete: true,  label: 'Soy',       diaas: 'moderate',  limiting: null },
  legume: { leu: 0.075, complete: false, label: 'Legume',    diaas: 'moderate',  limiting: 'methionine',
            short: 'limited by methionine', pairsWith: 'cereals — rice, roti' },
  grain:  { leu: 0.070, complete: false, label: 'Cereal',    diaas: 'low',       limiting: 'lysine',
            short: 'limited by lysine', pairsWith: 'pulses — dal, rajma, chana' },
  nut:    { leu: 0.068, complete: false, label: 'Nut / seed',diaas: 'low',       limiting: 'lysine',
            short: 'limited by lysine', pairsWith: 'pulses or dairy' },
  veg:    { leu: 0.060, complete: false, label: 'Vegetable', diaas: 'low',       limiting: 'methionine',
            short: 'limited by methionine', pairsWith: 'cereals or dairy' },
  none:   { leu: 0,     complete: false, label: '—',         diaas: null,        limiting: null },
};

/* ── Fat ────────────────────────────────────────────────────────────── */

/*
 * Saturated fat is measured per food already. What is missing is how the
 * REST of the fat splits — mono versus poly — and how much of it is
 * omega-3, which is the one most people are short of and the one that has
 * to come from food.
 *
 * mufaOfRest: share of the non-saturated fat that is monounsaturated.
 * o3: omega-3 as a share of total fat.
 * trans: share of total fat that is trans, which only meaningfully appears
 *        in commercially fried and bakery items.
 */
export const FAT_CLASS = {
  oliveoil:  { mufaOfRest: 0.87, o3: 0.008, trans: 0,     label: 'Olive oil' },
  seedoil:   { mufaOfRest: 0.35, o3: 0.010, trans: 0,     label: 'Seed oil' },
  ghee:      { mufaOfRest: 0.85, o3: 0.005, trans: 0.03,  label: 'Ghee / butter' },
  dairyfat:  { mufaOfRest: 0.80, o3: 0.005, trans: 0.03,  label: 'Dairy fat' },
  meatfat:   { mufaOfRest: 0.78, o3: 0.004, trans: 0.01,  label: 'Meat fat' },
  oilyfish:  { mufaOfRest: 0.45, o3: 0.220, trans: 0,     label: 'Oily fish' },
  leanfish:  { mufaOfRest: 0.40, o3: 0.120, trans: 0,     label: 'Fish' },
  nut:       { mufaOfRest: 0.62, o3: 0.020, trans: 0,     label: 'Nut' },
  walnutish: { mufaOfRest: 0.20, o3: 0.140, trans: 0,     label: 'Omega-3 seed' },
  fried:     { mufaOfRest: 0.55, o3: 0.005, trans: 0.06,  label: 'Fried / bakery' },
  plant:     { mufaOfRest: 0.45, o3: 0.020, trans: 0,     label: 'Plant' },
  none:      { mufaOfRest: 0.50, o3: 0,     trans: 0,     label: '—' },
};

/* ── Carbohydrate ───────────────────────────────────────────────────── */

/*
 * Sugar and fibre are already measured. Starch is what's left, and the
 * distinction that actually matters is not starch-versus-sugar but whether
 * the carbohydrate arrived with its fibre still attached.
 *
 * Whole grains, legumes, fruit and vegetables release glucose slowly and
 * carry the micronutrients with them. Refined flour, white rice, juice and
 * confectionery deliver the same energy stripped of both. That is the rice
 * versus maida question, and it is the one worth surfacing.
 */
export const CARB_CLASS = {
  whole:   { tier: 'good',    gi: 'low',    label: 'Whole / intact' },
  legume:  { tier: 'good',    gi: 'low',    label: 'Legume' },
  fruit:   { tier: 'good',    gi: 'medium', label: 'Fruit' },
  veg:     { tier: 'good',    gi: 'low',    label: 'Vegetable' },
  starchy: { tier: 'ok',      gi: 'medium', label: 'Starchy staple' },
  refined: { tier: 'limit',   gi: 'high',   label: 'Refined' },
  sugary:  { tier: 'limit',   gi: 'high',   label: 'Added sugar' },
  none:    { tier: 'none',    gi: null,     label: '—' },
};

/* ── Derivation ─────────────────────────────────────────────────────── */

import { QUALITY } from './quality-map.js';
import { inferClass } from './classify.js';

/*
 * The curated class if we have one, an inferred class otherwise.
 *
 * `food` is optional and only used for inference — passing it is what
 * makes a scanned packet or a hand-built food carry the same depth as a
 * database entry, which it should, since the label is right there.
 */
export function classOf(foodId, food = null) {
  const id = String(foodId || '').replace(/^off:|^my:|^dish:/, '');
  const known = QUALITY[id];
  if (known) return known;
  return food ? inferClass(food) : null;
}

/*
 * Break one logged entry into its quality components. Returns null when the
 * food has no classification — a custom food or a Pot recipe — so the UI
 * can say so instead of quietly reporting zeros.
 */
export function qualityFor(entry, macros) {
  /* The entry itself carries everything the inference needs — its name and
     its per-100 g panel — so a food with no id still gets classified. */
  const cls = classOf(entry.ref, entry);
  if (!cls) return null;

  /*
   * 'none' is a truthy string, which is how it slipped past the guard
   * below for so long: a coffee resolves to the `none` protein class, that
   * class carries complete:false, and the protein sheet duly announced
   * "short on null (its limiting amino acid) · quality null" about a cup
   * of coffee. `none` is the absence of a verdict, not a bad one, so it
   * counts as unclassified exactly like a food we could not read at all.
   */
  const P = PROTEIN_CLASS[cls.p] || PROTEIN_CLASS.none;
  const pClassified = !!cls.p && cls.p !== 'none';
  const F = FAT_CLASS[cls.f] || FAT_CLASS.none;
  const C = CARB_CLASS[cls.c] || CARB_CLASS.none;

  const protein = macros.p || 0;
  const fat = macros.f || 0;
  const sat = Math.min(macros.sat || 0, fat);
  const rest = Math.max(0, fat - sat);
  const carb = macros.c || 0;
  const sug = macros.sug || 0;
  const fib = macros.fib || 0;

  return {
    inferred: !!cls.inferred,
    basis: cls.basis || null,
    protein: {
      g: protein,
      leucine: protein * P.leu,
      /* Unknown is not the same as incomplete. Reporting "incomplete" for
         a food we simply could not classify reads as a verdict on it. */
      complete: pClassified ? P.complete : null,
      classified: pClassified,
      classLabel: P.label,
      note: P.short || null,
      limiting: P.limiting || null,
      pairsWith: P.pairsWith || null,
      diaas: P.diaas || null,
    },
    fat: {
      g: fat,
      sat,
      mufa: rest * F.mufaOfRest,
      pufa: rest * (1 - F.mufaOfRest),
      omega3: fat * F.o3,
      trans: fat * F.trans,
      classLabel: F.label,
    },
    carb: {
      g: carb,
      sugar: sug,
      fibre: fib,
      starch: Math.max(0, carb - sug - fib),
      tier: C.tier,
      gi: C.gi,
      classLabel: C.label,
    },
  };
}

/* ── Day-level aggregation ──────────────────────────────────────────── */

/*
 * Roll a day's entries into a quality picture, per macro, keeping track of
 * which foods contributed what. `covered` is the share of that macro the
 * app could actually classify — a Pot recipe or a custom food has no class,
 * and the honest response is to say so rather than report a total built
 * from half the plate.
 */
export function dayQuality(entries, macrosOf) {
  const acc = {
    /* `unclassified` is its own bucket, not a share of `incomplete`. The
       per-food record already keeps complete === null distinct from false
       for exactly this reason; folding it in here would undo that one line
       later and report a verdict the app never reached. */
    protein: { g: 0, leucine: 0, complete: 0, incomplete: 0, unclassified: 0, covered: 0, total: 0, sources: [] },
    fat:     { g: 0, sat: 0, mufa: 0, pufa: 0, omega3: 0, trans: 0, covered: 0, total: 0, sources: [] },
    carb:    { g: 0, sugar: 0, fibre: 0, starch: 0, covered: 0, total: 0, sources: [],
               tiers: { good: 0, ok: 0, limit: 0 } },
  };

  for (const e of entries) {
    const m = macrosOf(e);
    acc.protein.total += m.p || 0;
    acc.fat.total += m.f || 0;
    acc.carb.total += m.c || 0;

    const q = qualityFor(e, m);
    if (!q) continue;

    acc.protein.g += q.protein.g;
    acc.protein.leucine += q.protein.leucine;
    acc.protein.covered += q.protein.g;
    acc.protein[q.protein.complete === null ? 'unclassified'
              : q.protein.complete ? 'complete' : 'incomplete'] += q.protein.g;
    if (q.protein.g > 0.5) {
      acc.protein.sources.push({ name: e.name, g: q.protein.g, leucine: q.protein.leucine,
                                 complete: q.protein.complete, cls: q.protein.classLabel,
                                 limiting: q.protein.limiting, pairsWith: q.protein.pairsWith,
                                 diaas: q.protein.diaas, meal: e.meal });
    }

    acc.fat.g += q.fat.g;
    acc.fat.sat += q.fat.sat;
    acc.fat.mufa += q.fat.mufa;
    acc.fat.pufa += q.fat.pufa;
    acc.fat.omega3 += q.fat.omega3;
    acc.fat.trans += q.fat.trans;
    acc.fat.covered += q.fat.g;
    if (q.fat.g > 0.5) {
      acc.fat.sources.push({ name: e.name, g: q.fat.g, sat: q.fat.sat, omega3: q.fat.omega3,
                             mufa: q.fat.mufa, pufa: q.fat.pufa, trans: q.fat.trans,
                             cls: q.fat.classLabel, meal: e.meal });
    }

    acc.carb.g += q.carb.g;
    acc.carb.sugar += q.carb.sugar;
    acc.carb.fibre += q.carb.fibre;
    acc.carb.starch += q.carb.starch;
    acc.carb.covered += q.carb.g;
    if (q.carb.tier !== 'none') acc.carb.tiers[q.carb.tier] += q.carb.g;
    if (q.carb.g > 0.5) {
      acc.carb.sources.push({ name: e.name, g: q.carb.g, tier: q.carb.tier, gi: q.carb.gi,
                              fibre: q.carb.fibre, cls: q.carb.classLabel,
                              simple: q.carb.sugar, complex: q.carb.starch, meal: e.meal });
    }
  }

  for (const k of ['protein', 'fat', 'carb']) {
    acc[k].sources.sort((a, b) => b.g - a.g);
    acc[k].coverage = acc[k].total > 0 ? acc[k].covered / acc[k].total : 1;
  }
  return acc;
}

/*
 * Per-meal leucine, which is the number that actually decides whether a
 * meal did anything for muscle. Reported per sitting rather than per day
 * because the threshold is per sitting — the daily total can look fine
 * while three of four meals sat under the line.
 */
export function leucineByMeal(byMealGroups, macrosOf) {
  const out = {};
  for (const meal in byMealGroups) {
    let leu = 0, prot = 0, classified = false;
    for (const e of byMealGroups[meal]) {
      const m = macrosOf(e);
      prot += m.p || 0;
      const q = qualityFor(e, m);
      if (q) { leu += q.protein.leucine; classified = true; }
    }
    if (byMealGroups[meal].length) {
      out[meal] = { leucine: leu, protein: prot, classified,
                    hit: leu >= LEUCINE_THRESHOLD_G };
    }
  }
  return out;
}

/* ── What to actually do about it ───────────────────────────────────── */

/*
 * Reads the day and says the useful thing. Deliberately few findings, in
 * priority order — a wall of advice gets ignored, and most days only one
 * or two things are genuinely worth changing.
 */
export function qualityAdvice(q, mealLeucine, targets) {
  const out = [];

  // Protein: completeness and the leucine threshold
  const pc = q.protein;
  if (pc.covered > 5) {
    const incompleteShare = pc.incomplete / Math.max(1, pc.covered);
    if (incompleteShare > 0.6) {
      out.push({ macro: 'protein', tone: 'warn',
        text: `${Math.round(incompleteShare * 100)}% of today's protein came from grains, pulses or nuts, and each of those is short of one building block your body cannot make (an essential amino acid). `
            + `They cover each other — dal with roti, rajma with rice — but adding dairy, egg or meat to the same meal does it more reliably.` });
    }
    const missed = Object.entries(mealLeucine).filter(([, v]) => v.classified && v.protein > 5 && !v.hit);
    if (missed.length) {
      out.push({ macro: 'protein', tone: 'info',
        text: `${missed.map(([m]) => m).join(' and ')} came in under the leucine mark. `
            + `Leucine is the building block that flips the switch on muscle building, and a meal needs about ${LEUCINE_THRESHOLD_G} g of it — roughly 25–30 g of animal protein, or a scoop of whey. `
            + `Below that the protein is still used, but the meal does much less for holding onto muscle.` });
    }
  }

  // Fat: saturated share and omega-3
  const fc = q.fat;
  if (fc.covered > 5) {
    const satShare = fc.sat / Math.max(1, fc.covered);
    if (satShare > 0.42) {
      out.push({ macro: 'fat', tone: 'warn',
        text: `${Math.round(satShare * 100)}% of today's fat was the saturated kind — the sort that is solid at room temperature. Swapping some ghee or fried food for olive oil, nuts or fish moves it without changing the calories.` });
    }
    if (fc.omega3 < 1.0 && fc.covered > 20) {
      out.push({ macro: 'fat', tone: 'info',
        text: `Only ${fc.omega3.toFixed(1)} g of omega-3 today. Your body cannot make it, so every gram has to come from food — oily fish, walnuts, flax or chia.` });
    }
    if (fc.trans > 2) {
      out.push({ macro: 'fat', tone: 'warn',
        text: `About ${fc.trans.toFixed(1)} g of trans fat, mostly from fried or bakery items. This is the one fat with no safe level at all.` });
    }
  }

  // Carbs: refined share and fibre
  const cc = q.carb;
  const tierTotal = cc.tiers.good + cc.tiers.ok + cc.tiers.limit;
  if (tierTotal > 10) {
    const limitShare = cc.tiers.limit / tierTotal;
    if (limitShare > 0.45) {
      out.push({ macro: 'carb', tone: 'warn',
        text: `${Math.round(limitShare * 100)}% of today's carbs were refined or added sugar. Same energy as whole grains and fruit but stripped of the fibre and vitamins — and it is the part that leaves you hungry sooner.` });
    } else if (limitShare < 0.2 && cc.tiers.good > 20) {
      out.push({ macro: 'carb', tone: 'good',
        text: `Most of today's carbohydrate came from whole sources. That is the version that holds you between meals.` });
    }
    if (targets?.fib && cc.fibre < targets.fib * 0.6) {
      out.push({ macro: 'carb', tone: 'info',
        text: `Fibre is at ${Math.round(cc.fibre)} g against ${targets.fib} g. Legumes, whole grains and fruit are the cheapest way to move it.` });
    }
  }

  return out;
}
