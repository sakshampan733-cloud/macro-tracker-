/*
 * Supplements.
 *
 * The point is not the tick box. It is that a multivitamin swallowed at
 * breakfast is 10 µg of vitamin D and 2.4 µg of B12 that the food log has
 * no way of knowing about — so a micronutrient screen that ignores
 * supplements will keep reporting a deficit that was closed hours ago.
 *
 * Doses are the common over-the-counter strengths sold in India. Where a
 * product varies wildly, the figure here is the typical one and the dose
 * is editable, because a 60,000 IU weekly vitamin D sachet and a 1,000 IU
 * daily capsule are not remotely the same thing.
 *
 * `provides` uses the same units as data/nutrients.js:
 * iron mg, B12 µg, vitamin D µg, calcium mg, folate µg, zinc mg,
 * magnesium mg, potassium mg, vitamin C mg, vitamin A µg.
 */

export const SUPPLEMENTS = {
  'multivitamin': {
    label: 'Multivitamin', dose: '1 tablet', tag: 'general',
    provides: { fe: 10, b12: 2.4, vd: 10, ca: 100, fol: 200, zn: 8, mg: 50, vc: 60, va: 500 },
    note: 'Covers a bit of everything, rarely a full RDA of anything.',
  },
  'vitamin-d3': {
    label: 'Vitamin D3', dose: '2,000 IU', tag: 'general',
    provides: { vd: 50 },
    note: 'The one most people in India are genuinely short of. 2,000 IU is 50 µg.',
  },
  'vitamin-d3-weekly': {
    label: 'Vitamin D3, weekly sachet', dose: '60,000 IU', tag: 'general',
    provides: { vd: 1500 },
    note: 'A weekly dose. Log it on the day you take it, not every day.',
  },
  'b12': {
    label: 'Vitamin B12', dose: '500 µg', tag: 'general',
    provides: { b12: 500 },
    note: 'Absorption is poor at high doses, which is why tablets are far above the RDA.',
  },
  'iron': {
    label: 'Iron', dose: '60 mg elemental', tag: 'general',
    provides: { fe: 60 },
    note: 'Only worth taking on evidence of deficiency — excess iron is genuinely harmful.',
  },
  'calcium-d': {
    label: 'Calcium + D3', dose: '500 mg', tag: 'general',
    provides: { ca: 500, vd: 5 },
  },
  'magnesium': {
    label: 'Magnesium', dose: '300 mg', tag: 'general',
    provides: { mg: 300 },
    note: 'Glycinate and citrate absorb better than oxide.',
  },
  'zinc': {
    label: 'Zinc', dose: '25 mg', tag: 'general',
    provides: { zn: 25 },
  },
  'omega3': {
    label: 'Omega-3 / fish oil', dose: '1,000 mg', tag: 'general',
    provides: {},
    omega3g: 0.3,
    note: 'What matters is the EPA + DHA on the label, not the capsule weight.',
  },
  'vitamin-c': {
    label: 'Vitamin C', dose: '500 mg', tag: 'general',
    provides: { vc: 500 },
  },

  /* Training supplements. These carry macros, so they belong in the food
     log rather than here — logging them twice would double-count. */
  'creatine': {
    label: 'Creatine monohydrate', dose: '5 g', tag: 'training',
    provides: {},
    /*
     * Creatine pulls water into muscle cells, which is most of why it
     * works and all of why the scale jumps in the first fortnight. Both
     * facts matter to the app: the water target goes up, and a weight
     * gain of a kilo or two early on is water, not fat — which the
     * trend line would otherwise read as a diet going wrong.
     */
    waterMl: 500,
    scaleBump: true,
    note: 'No calories. Timing does not matter; daily consistency does. '
        + 'Draws water into muscle, so drink more and expect the scale to '
        + 'rise a kilo or so in the first two weeks — that is water.',
  },
  'whey': {
    label: 'Whey protein', dose: '1 scoop', tag: 'training',
    provides: {}, isFood: true,
    note: 'Log this as food instead — it carries real protein and calories.',
  },
  'caffeine': {
    label: 'Caffeine', dose: '200 mg', tag: 'training', caffeine: 200,
    provides: {},
    waterMl: 250,
    note: 'Half of it is still in you five hours later. Watch it against your sleep.',
  },
  'pre-workout': {
    label: 'Pre-workout', dose: '1 scoop', tag: 'training', caffeine: 200,
    provides: {},
    waterMl: 250,
    note: 'Most scoops sit between 150 and 300 mg of caffeine. Counted against the daily total.',
  },
  'electrolytes': {
    label: 'Electrolytes', dose: '1 serving', tag: 'training',
    provides: { k: 200 },
  },
};

export const SUPPLEMENT_TAGS = { general: 'Everyday', training: 'Training' };

/*
 * What the day's taken supplements add to micronutrient totals.
 * Returns the same shape as a food's micro block so it can simply be added.
 */
/*
 * What the supplements you take do to the day's targets.
 *
 * Only where the effect is real and well established. Creatine is the
 * clear case — it is osmotically active in muscle, and every credible
 * source that recommends it also recommends drinking more.
 */
export function supplementTargetShift(takenIds, store) {
  let waterMl = 0;
  const reasons = [];
  let scaleBump = false;
  for (const id of takenIds || []) {
    const sup = SUPPLEMENTS[id] || store?.supplementsCustom?.[id];
    if (!sup) continue;
    if (sup.waterMl) {
      waterMl += sup.waterMl;
      reasons.push(sup.label);
    }
    if (sup.scaleBump) scaleBump = true;
  }
  return { waterMl, reasons, scaleBump };
}

export function supplementMicros(takenIds, store) {
  const out = {};
  let omega3 = 0;
  for (const id of takenIds || []) {
    const s = SUPPLEMENTS[id] || store?.supplementsCustom?.[id];
    if (!s) continue;
    for (const k in (s.provides || {})) out[k] = (out[k] || 0) + s.provides[k];
    if (s.omega3g) omega3 += s.omega3g;
  }
  return { micros: out, omega3 };
}
