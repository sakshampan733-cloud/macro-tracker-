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
    how: 'With a meal.',
    why: 'The fat-soluble half — A, D, E, K — needs some fat alongside it to be absorbed at all, so a meal beats an empty stomach.'
  },
  'vitamin-d3': {
    label: 'Vitamin D3', dose: '2,000 IU', tag: 'general',
    provides: { vd: 50 },
    note: 'The one most people in India are genuinely short of. 2,000 IU is 50 µg.',
    how: 'With the meal of the day that has the most fat in it.',
    why: 'Fat-soluble, and absorption roughly doubles with a proper meal versus water. Time of day does not matter.'
  },
  'vitamin-d3-weekly': {
    label: 'Vitamin D3, weekly sachet', dose: '60,000 IU', tag: 'general',
    provides: { vd: 1500 },
    note: 'A weekly dose. Log it on the day you take it, not every day.',
    how: 'One day a week, with a meal. Log it only on the day you take it.',
    why: "A 60,000 IU sachet is a week's worth in one go. Logging it daily would tell the app you are taking seven times what you are."
  },
  'b12': {
    label: 'Vitamin B12', dose: '500 µg', tag: 'general',
    provides: { b12: 500 },
    note: 'Absorption is poor at high doses, which is why tablets are far above the RDA.',
    how: 'Any time, with or without food.',
    why: 'Absorption is poor at high doses, which is why tablets are far above the RDA — that is expected, not a mistake.'
  },
  'iron': {
    label: 'Iron', dose: '60 mg elemental', tag: 'general',
    provides: { fe: 60 },
    note: 'Only worth taking on evidence of deficiency — excess iron is genuinely harmful.',
    how: 'Empty stomach if you can tolerate it, with vitamin C. Away from tea, coffee, calcium and dairy.',
    why: 'Tannins in tea and coffee, and calcium, both cut iron absorption substantially. Vitamin C does the opposite. If it upsets your stomach, food is better than not taking it.'
  },
  'calcium-d': {
    label: 'Calcium + D3', dose: '500 mg', tag: 'general',
    provides: { ca: 500, vd: 5 },
    how: 'Split it — 500 mg at a time, with food.',
    why: 'Absorption falls off above about 500 mg in one dose, so two smaller doses beat one large one. Keep it away from iron.'
  },
  'magnesium': {
    label: 'Magnesium', dose: '300 mg', tag: 'general',
    provides: { mg: 300 },
    note: 'Glycinate and citrate absorb better than oxide.',
    how: 'Evening, with or after food.',
    why: 'Often taken at night because it is mildly relaxing. Citrate and glycinate are gentler on the gut than oxide.'
  },
  'zinc': {
    label: 'Zinc', dose: '25 mg', tag: 'general',
    provides: { zn: 25 },
    how: 'With food, and not at the same time as iron or calcium.',
    why: 'On an empty stomach it commonly causes nausea. Zinc and iron compete for the same transporter.'
  },
  'omega3': {
    label: 'Omega-3 / fish oil', dose: '1,000 mg', tag: 'general',
    provides: {},
    omega3g: 0.3,
    note: 'What matters is the EPA + DHA on the label, not the capsule weight.',
    how: 'With the largest meal of the day.',
    why: 'Absorption is markedly better with fat present. Taking it with a meal also reduces the fishy repeat.'
  },
  'vitamin-c': {
    label: 'Vitamin C', dose: '500 mg', tag: 'general',
    provides: { vc: 500 },
    how: 'Any time. Split it if you take more than about 500 mg.',
    why: 'Water-soluble, so what you cannot use is excreted. Large single doses can loosen the stomach.'
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
    how: '5 g daily, any time. Consistency matters, timing does not.',
    why: 'Saturation is what works, and it takes about a month at 5 g a day. Loading at 20 g for a week gets there faster and needs noticeably more water. Expect the scale to rise a kilo or so early on — that is water drawn into muscle.'
  },
  'whey': {
    label: 'Whey protein', dose: '1 scoop', tag: 'training',
    provides: {}, isFood: true,
    note: 'Log this as food instead — it carries real protein and calories.',
    how: 'Whenever it fits your protein for the day.',
    why: 'The anabolic window is far wider than it was once sold as. Total daily protein, spread across meals, is what decides the outcome.'
  },
  'caffeine': {
    label: 'Caffeine', dose: '200 mg', tag: 'training', caffeine: 200,
    provides: {},
    waterMl: 250,
    note: 'Half of it is still in you five hours later. Watch it against your sleep.',
    how: '30 to 60 minutes before you need it, and not within about eight hours of bed.',
    why: 'Half of a dose is still in you five hours later. The app works your own cutoff out from your bedtime.'
  },
  'pre-workout': {
    label: 'Pre-workout', dose: '1 scoop', tag: 'training', caffeine: 200,
    provides: {},
    waterMl: 250,
    note: 'Most scoops sit between 150 and 300 mg of caffeine. Counted against the daily total.',
    how: '20 to 30 minutes before training. Not for an evening session unless you sleep late.',
    why: 'Most of the effect is the caffeine, which is counted against your daily total here.'
  },
  'electrolytes': {
    label: 'Electrolytes', dose: '1 serving', tag: 'training',
    provides: { k: 200 },
    how: 'Around long or sweaty sessions, and in heat.',
    why: 'Water alone does not replace sodium. Worth it past roughly an hour of hard sweating; below that, plain water is fine.'
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
