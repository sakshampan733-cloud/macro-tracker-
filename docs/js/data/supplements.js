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
  /* ── Protein and amino acids ─────────────────────────────────────── */
  'collagen': {
    label: 'Collagen peptides', dose: '10 g', tag: 'joints',
    provides: {},
    /*
     * Worth being straight about: collagen is protein by weight but a poor
     * one for building muscle. It contains no tryptophan at all, which is
     * what makes it an incomplete protein by definition, and its leucine
     * is very low. The evidence for skin elasticity and joint comfort is
     * modest but real; the evidence for it doing anything a whey shake
     * would do better is not there.
     */
    isFood: true,
    note: 'About 9 g of protein per 10 g scoop, but it has no tryptophan and very '
        + 'little leucine — count it as food, not as your protein target.',
    how: 'Any time, in coffee, water or a shake. 10 g daily, most trials ran 8 to 12 weeks.',
    why: 'Skin elasticity and joint comfort are where the evidence sits, and it is '
       + 'modest. It is not a muscle-building protein: no tryptophan means incomplete, '
       + 'and the leucine is too low to trigger much. Take it for skin and joints, and '
       + 'get your protein elsewhere.',
  },
  'casein': {
    label: 'Casein protein', dose: '1 scoop', tag: 'training',
    provides: {}, isFood: true,
    note: 'Log this as food — it carries real protein and calories.',
    how: 'Often taken before bed, though total daily protein matters far more.',
    why: 'Digests slowly, so it trickles amino acids for hours rather than spiking. '
       + 'The overnight advantage over whey is small and only shows up when total '
       + 'protein is already low.',
  },
  'eaa': {
    label: 'EAA / BCAA', dose: '10 g', tag: 'training',
    provides: {},
    note: 'Largely redundant if you already hit your protein target from food.',
    how: 'Around training, if at all.',
    why: 'EAAs contain all nine essentials and can do something when protein intake '
       + 'is genuinely low. BCAAs contain three, cannot build protein on their own, '
       + 'and are close to useless alongside an adequate diet. Whole protein beats both.',
  },
  'beta-alanine': {
    label: 'Beta-alanine', dose: '3-5 g', tag: 'training',
    provides: {},
    note: 'The tingling is harmless and fades. Split the dose if it bothers you.',
    how: '3 to 5 g daily, timing irrelevant. Split into smaller doses to reduce tingling.',
    why: 'Builds muscle carnosine over weeks, which buffers acid. Helps efforts lasting '
       + 'roughly one to four minutes — intervals, not one-rep maxes.',
  },
  'citrulline': {
    label: 'L-citrulline', dose: '6-8 g', tag: 'training',
    provides: {},
    note: 'Citrulline malate at 8 g is the dose most studies used.',
    how: '30 to 60 minutes before training.',
    why: 'Raises nitric oxide and may add a rep or two on higher-volume sets. '
       + 'The effect is real but small.',
  },
  'hmb': {
    label: 'HMB', dose: '3 g', tag: 'training',
    provides: {},
    note: 'Most useful to people returning after a break, not to trained lifters.',
    how: '3 g daily, split across the day.',
    why: 'Reduces muscle breakdown. Clear benefit in untrained or detrained people; '
       + 'in trained lifters eating enough protein the effect is close to nothing.',
  },

  /* ── Vitamins and minerals ───────────────────────────────────────── */
  'b-complex': {
    label: 'Vitamin B complex', dose: '1 tablet', tag: 'general',
    provides: { b12: 10, fol: 400 },
    note: 'Bright yellow urine afterwards is riboflavin passing through — harmless.',
    how: 'With breakfast.',
    why: 'Water-soluble, so excess is excreted rather than stored. Useful on a plant-based '
       + 'diet, where B12 in particular is genuinely hard to get.',
  },
  'vitamin-e': {
    label: 'Vitamin E', dose: '400 IU', tag: 'general',
    provides: {},
    note: 'High doses long-term are not benign. Food sources are the safer route.',
    how: 'With a meal containing fat.',
    why: 'Fat-soluble antioxidant. Large doses taken around training may actually blunt '
       + 'the adaptation you trained for, so keep it modest.',
  },
  'vitamin-k2': {
    label: 'Vitamin K2', dose: '100 µg', tag: 'general',
    provides: {},
    note: 'Often paired with vitamin D. Speak to a doctor first if you take warfarin.',
    how: 'With a meal containing fat, often alongside D3.',
    why: 'Directs calcium towards bone rather than arteries. It interacts with '
       + 'anticoagulants, which is the one situation where it genuinely matters who '
       + 'you ask before starting.',
  },
  'selenium': {
    label: 'Selenium', dose: '100 µg', tag: 'general',
    provides: {},
    note: 'The gap between enough and too much is narrower than for most minerals.',
    how: 'With food.',
    why: 'Thyroid function and antioxidant defence. Two Brazil nuts cover a day, and '
       + 'chronic high doses cause hair and nail problems.',
  },
  'iodine': {
    label: 'Iodine', dose: '150 µg', tag: 'general',
    provides: {},
    note: 'Iodised salt already covers most people in India.',
    how: 'With food.',
    why: 'Needed to make thyroid hormone. Both too little and too much cause thyroid '
       + 'trouble, so it is not one to take casually on top of iodised salt.',
  },
  'potassium': {
    label: 'Potassium', dose: '99 mg', tag: 'general',
    provides: { k: 99 },
    note: 'Supplements are capped low by law. Food is by far the better source.',
    how: 'With food.',
    why: 'Most people fall short because they eat too little fruit and veg, not because '
       + 'they lack a tablet. Do not supplement it on heart or kidney medication '
       + 'without asking first.',
  },
  'chromium': {
    label: 'Chromium picolinate', dose: '200 µg', tag: 'general',
    provides: {},
    note: 'Widely sold for cravings and blood sugar; evidence is weak.',
    how: 'With a meal.',
    why: 'Trials on appetite and glucose control are small and inconsistent. Not harmful '
       + 'at normal doses, but do not expect much.',
  },
  'coq10': {
    label: 'CoQ10', dose: '100 mg', tag: 'general',
    provides: {},
    note: 'Most relevant to people on statins, who deplete it.',
    how: 'With the fattiest meal of the day — absorption is poor without fat.',
    why: 'Statins lower the body\u2019s own CoQ10, and it is sometimes used for the muscle '
       + 'aching that goes with them. Evidence for that is mixed but the safety is good.',
  },
  'iron-folic': {
    label: 'Iron + folic acid', dose: '1 tablet', tag: 'general',
    provides: { fe: 60, fol: 500 },
    note: 'The standard Indian combination. Same rules as iron alone.',
    how: 'Empty stomach with vitamin C if tolerated. Away from tea, coffee, calcium and milk.',
    why: 'Tea and coffee cut iron absorption sharply, which matters a great deal in a '
       + 'country where both are drunk with most meals.',
  },

  /* ── Sleep, stress, gut ──────────────────────────────────────────── */
  'melatonin': {
    label: 'Melatonin', dose: '0.5-3 mg', tag: 'sleep',
    provides: {},
    note: 'Lower doses work as well as high ones. It shifts timing; it is not a sedative.',
    how: '30 to 60 minutes before the bedtime you are aiming for.',
    why: 'It moves your body clock rather than knocking you out, which is why it helps '
       + 'jet lag and a shifted schedule more than ordinary insomnia. Doses above about '
       + '3 mg add grogginess, not sleep.',
  },
  'ashwagandha': {
    label: 'Ashwagandha', dose: '300-600 mg', tag: 'herbal',
    provides: {},
    note: 'Avoid in pregnancy and with thyroid medication without asking a doctor.',
    how: 'Daily, often in the evening. KSM-66 and Sensoril are the studied extracts.',
    why: 'Reasonable evidence for lowering perceived stress and cortisol over eight to '
       + 'twelve weeks. It can raise thyroid hormone, which matters if you already take '
       + 'thyroxine.',
  },
  'probiotic': {
    label: 'Probiotic', dose: '1 capsule', tag: 'gut',
    provides: {},
    note: 'Strain matters more than the CFU count on the front of the box.',
    how: 'Daily, with or just before a meal. Keep refrigerated if the label says so.',
    why: 'Effects are strain-specific: what helps antibiotic-associated diarrhoea is not '
       + 'what helps IBS. A big CFU number on an unnamed strain tells you nothing.',
  },
  'psyllium': {
    label: 'Psyllium husk (isabgol)', dose: '5-10 g', tag: 'gut',
    provides: {},
    note: 'Counts towards your fibre. Take it with a full glass of water, never dry.',
    how: 'Stirred into a full glass of water, once or twice daily. Drink it promptly.',
    why: 'Soluble fibre that softens stool and modestly lowers LDL. Taken with too little '
       + 'water it can do the opposite of what you wanted.',
  },
  'digestive-enzymes': {
    label: 'Digestive enzymes', dose: '1 capsule', tag: 'gut',
    provides: {},
    note: 'Genuinely useful for diagnosed insufficiency; unnecessary for most people.',
    how: 'With the meal, not after it.',
    why: 'Lactase for lactose intolerance is well established. Broad-spectrum blends for '
       + 'ordinary bloating are not.',
  },

  /* ── Joints, skin, and the rest ──────────────────────────────────── */
  'glucosamine': {
    label: 'Glucosamine + chondroitin', dose: '1500 mg', tag: 'joints',
    provides: {},
    note: 'Give it two to three months before deciding it does nothing.',
    how: 'Daily with food, in split doses.',
    why: 'Trials are split. Where it helps, it helps knee osteoarthritis pain slowly. It '
       + 'does not rebuild cartilage, whatever the packaging suggests.',
  },
  'turmeric': {
    label: 'Turmeric / curcumin', dose: '500 mg', tag: 'herbal',
    provides: {},
    note: 'Look for piperine or a phytosome form — plain curcumin is barely absorbed.',
    how: 'With a meal containing fat, and with black pepper or a formulated extract.',
    why: 'Curcumin on its own has famously poor bioavailability. Piperine raises it '
       + 'substantially. Mild anti-inflammatory effect at studied doses.',
  },
  'spirulina': {
    label: 'Spirulina', dose: '3-5 g', tag: 'general',
    provides: { fe: 2 },
    note: 'Not a reliable B12 source — the form in it is largely inactive in humans.',
    how: 'Daily, in water or a smoothie.',
    why: 'Decent protein and iron by weight, but you would need a lot to matter. The B12 '
       + 'claim is the one to ignore: it is mostly pseudo-B12, which does not work.',
  },
  'shilajit': {
    label: 'Shilajit', dose: '300-500 mg', tag: 'herbal',
    provides: {},
    note: 'Buy purified, tested product only — contamination is a real risk.',
    how: 'Daily, dissolved in warm milk or water.',
    why: 'Traditional use is long; controlled evidence is thin and mostly small studies. '
       + 'Heavy-metal contamination in unpurified resin is the genuine concern.',
  },
  'algae-omega3': {
    label: 'Algal omega-3 (vegan)', dose: '1 capsule', tag: 'general',
    provides: {}, omega3g: 0.5,
    note: 'The vegan route to EPA and DHA, which flaxseed does not reliably provide.',
    how: 'With the largest meal of the day.',
    why: 'Fish get their omega-3 from algae, so this skips a step. Conversion from '
       + 'flaxseed ALA to EPA and DHA is poor in humans, which is why algal oil exists.',
  },
  'apple-cider-vinegar': {
    label: 'Apple cider vinegar', dose: '1 tbsp', tag: 'herbal',
    provides: {},
    note: 'Dilute it. Neat vinegar damages tooth enamel and the throat.',
    how: 'Diluted in water, before a meal.',
    why: 'A small blunting of the post-meal glucose rise is about the extent of it. '
       + 'The weight-loss claims are not supported at any meaningful size.',
  },
  'electrolytes': {
    label: 'Electrolytes', dose: '1 serving', tag: 'training',
    provides: { k: 200 },
    how: 'Around long or sweaty sessions, and in heat.',
    why: 'Water alone does not replace sodium. Worth it past roughly an hour of hard sweating; below that, plain water is fine.'
  },
};

export const SUPPLEMENT_TAGS = {
  general: 'Everyday',
  training: 'Training',
  sleep: 'Sleep & stress',
  gut: 'Gut & digestion',
  joints: 'Joints & skin',
  herbal: 'Herbal',
};

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
