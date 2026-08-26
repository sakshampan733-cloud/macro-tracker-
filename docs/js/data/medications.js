/*
 * Medication reference.
 *
 * The rule this file is built around, in the user's own words: the app
 * should have no say in whether or when a prescribed medication is taken.
 * A prescriber set that schedule with information the app does not have.
 * So nothing here advises, warns, flags, or suggests moving a dose.
 *
 * What it does is describe. Someone taking a drug they know only as "the
 * blue one" should be able to find out what it is for and what their day
 * might feel like on it — the ordinary, well-established effects that a
 * pharmacist would mention across the counter and that nobody remembers
 * three months later.
 *
 * The second rule follows from the first: describe only what is certain.
 * A guess made from a similar-sounding name is worse than silence, because
 * silence is obviously silence and a wrong description reads as fact. Every
 * entry here is a common generic with effects that are not in dispute;
 * anything not listed is recorded without commentary, and says so.
 *
 * Nothing here is dosing guidance, and none of it is a substitute for the
 * person who wrote the prescription.
 */

/*
 * `day` is the honest bit: what the day tends to feel like. It is written
 * for someone deciding whether their tiredness is worth mentioning at
 * their next appointment, not for someone deciding what to take.
 */
export const MEDICATIONS = {
  /* ── Mood and anxiety ── */
  'sertraline': {
    label: 'Sertraline', brands: ['Zoloft', 'Daxid', 'Serlift', 'Sertima'],
    klass: 'SSRI antidepressant',
    for: 'Depression, anxiety, OCD, panic and PTSD.',
    day: 'Often unsettles sleep and appetite for the first couple of weeks, either '
       + 'direction, then settles. Nausea early on is common and usually passes. '
       + 'Some people feel a flattening of both lows and highs.',
    food: 'Usually taken with food to soften the nausea.',
  },
  'escitalopram': {
    label: 'Escitalopram', brands: ['Lexapro', 'Nexito', 'Cipralex'],
    klass: 'SSRI antidepressant',
    for: 'Depression and generalised anxiety.',
    day: 'Commonly drowsy at first, sometimes the opposite. Appetite can rise once '
       + 'mood lifts, which shows up on the scale before anyone connects the two.',
  },
  'fluoxetine': {
    label: 'Fluoxetine', brands: ['Prozac', 'Fludac'],
    klass: 'SSRI antidepressant',
    for: 'Depression, OCD, bulimia and panic disorder.',
    day: 'More activating than most SSRIs — it can feel stimulating, and it stays in '
       + 'the body far longer than the others. Appetite is often suppressed early.',
  },
  'venlafaxine': {
    label: 'Venlafaxine', brands: ['Effexor', 'Venlor'],
    klass: 'SNRI antidepressant',
    for: 'Depression and anxiety.',
    day: 'Can raise blood pressure and resting heart rate a little, which is worth '
       + 'knowing if you watch those numbers here. Sweating is common.',
  },
  'bupropion': {
    label: 'Bupropion', brands: ['Wellbutrin', 'Bupron'],
    klass: 'Atypical antidepressant',
    for: 'Depression, and as an aid to stopping smoking.',
    day: 'Activating rather than sedating, and it tends to blunt appetite. Taken late '
       + 'it can keep people awake.',
  },
  'alprazolam': {
    label: 'Alprazolam', brands: ['Xanax', 'Alprax', 'Restyl'],
    klass: 'Benzodiazepine',
    for: 'Anxiety and panic.',
    day: 'Sedating, and it slows reaction time. Alcohol compounds that considerably.',
  },

  /* ── Diabetes ── */
  'metformin': {
    label: 'Metformin', brands: ['Glycomet', 'Glucophage', 'Obimet'],
    klass: 'Biguanide',
    for: 'Type 2 diabetes, and sometimes PCOS.',
    day: 'Digestive upset is the usual complaint, worst in the first weeks and much '
       + 'better when taken with a meal. Long use can lower B12 over years.',
    food: 'Taken with food. Splitting the dose across meals is a common approach.',
    nutrient: 'b12',
  },
  'glimepiride': {
    label: 'Glimepiride', brands: ['Amaryl', 'Glimestar'],
    klass: 'Sulfonylurea',
    for: 'Type 2 diabetes.',
    day: 'Can drop blood sugar low, particularly if a meal is skipped or delayed '
       + 'after a dose, or after unusually hard exercise.',
    food: 'Paired with a meal.',
    watchMeals: true,
  },
  'insulin': {
    label: 'Insulin', brands: ['Lantus', 'Humalog', 'Novomix', 'Actrapid'],
    klass: 'Insulin',
    for: 'Type 1 and advanced type 2 diabetes.',
    day: 'Timing against meals and against exercise is the whole game, and both are '
       + 'individual. Low sugar feels like shakiness, sweating and sudden hunger.',
    watchMeals: true,
  },
  'sitagliptin': {
    label: 'Sitagliptin', brands: ['Januvia', 'Istavel', 'Zituvia'],
    klass: 'DPP-4 inhibitor',
    for: 'Type 2 diabetes.',
    day: 'Usually uneventful day to day. Low blood sugar is uncommon on its own.',
  },

  /* ── Heart and circulation ── */
  'atorvastatin': {
    label: 'Atorvastatin', brands: ['Lipitor', 'Atorva', 'Storvas'],
    klass: 'Statin',
    for: 'Lowering LDL cholesterol and cardiovascular risk.',
    day: 'Mostly unnoticed. Muscle aching is the effect worth reporting if it appears, '
       + 'especially alongside hard training.',
  },
  'rosuvastatin': {
    label: 'Rosuvastatin', brands: ['Crestor', 'Rosuvas'],
    klass: 'Statin',
    for: 'Lowering LDL cholesterol.',
    day: 'As with other statins, usually unnoticed; muscle aching is the one to mention.',
  },
  'metoprolol': {
    label: 'Metoprolol', brands: ['Betaloc', 'Metolar', 'Lopressor'],
    klass: 'Beta blocker',
    for: 'Blood pressure, angina, and rate control after a cardiac event.',
    day: 'Holds heart rate down, including during exercise — a training session will '
       + 'feel harder than the heart rate suggests, and your resting figures here '
       + 'will read lower than they otherwise would. Tiredness and cold hands are common.',
    affectsHR: true,
  },
  'atenolol': {
    label: 'Atenolol', brands: ['Tenormin', 'Aten'],
    klass: 'Beta blocker',
    for: 'Blood pressure and angina.',
    day: 'Blunts heart rate at rest and during exercise. Effort feels heavier than '
       + 'the numbers imply.',
    affectsHR: true,
  },
  'amlodipine': {
    label: 'Amlodipine', brands: ['Norvasc', 'Amlong', 'Amlokind'],
    klass: 'Calcium channel blocker',
    for: 'Blood pressure.',
    day: 'Ankle swelling by evening is the classic one, along with flushing.',
  },
  'telmisartan': {
    label: 'Telmisartan', brands: ['Telma', 'Micardis'],
    klass: 'ARB',
    for: 'Blood pressure.',
    day: 'Usually quiet. Standing up quickly can bring on lightheadedness early on.',
  },
  'ramipril': {
    label: 'Ramipril', brands: ['Cardace', 'Altace'],
    klass: 'ACE inhibitor',
    for: 'Blood pressure and heart protection.',
    day: 'A dry persistent cough is the well-known one, and it does not settle.',
  },
  'clopidogrel': {
    label: 'Clopidogrel', brands: ['Plavix', 'Clopilet', 'Deplatt'],
    klass: 'Antiplatelet',
    for: 'Preventing clots after a stent or a cardiac event.',
    day: 'Bruising and bleeding take longer to stop — worth knowing before contact sport.',
  },
  'warfarin': {
    label: 'Warfarin', brands: ['Coumadin', 'Warf'],
    klass: 'Anticoagulant',
    for: 'Preventing and treating clots.',
    day: 'Vitamin K in food interacts with it, which is why consistency in leafy '
       + 'greens matters more than avoiding them. Bleeding takes longer to stop.',
    watchVitK: true,
  },

  /* ── Thyroid, stomach, and other common ones ── */
  'levothyroxine': {
    label: 'Levothyroxine', brands: ['Eltroxin', 'Thyronorm', 'Synthroid'],
    klass: 'Thyroid hormone',
    for: 'An underactive thyroid.',
    day: 'Absorption drops sharply when taken near food, calcium, iron or coffee, '
       + 'which is why it is usually prescribed well before breakfast.',
    food: 'Taken on an empty stomach, away from calcium and iron.',
    watchCaffeine: true,
  },
  'pantoprazole': {
    label: 'Pantoprazole', brands: ['Pantocid', 'Pan', 'Protonix'],
    klass: 'Proton pump inhibitor',
    for: 'Acid reflux and ulcers.',
    day: 'Usually quiet. Long-term use can reduce B12, magnesium and calcium absorption.',
    nutrient: 'b12',
  },
  'omeprazole': {
    label: 'Omeprazole', brands: ['Omez', 'Prilosec'],
    klass: 'Proton pump inhibitor',
    for: 'Acid reflux and ulcers.',
    day: 'Taken before a meal. Long use affects B12 and magnesium absorption.',
    nutrient: 'b12',
  },
  'cetirizine': {
    label: 'Cetirizine', brands: ['Zyrtec', 'Alerid', 'Cetzine'],
    klass: 'Antihistamine',
    for: 'Allergies and hives.',
    day: 'Drowsy for a good number of people despite the "non-drowsy" label.',
  },
  'montelukast': {
    label: 'Montelukast', brands: ['Singulair', 'Montair'],
    klass: 'Leukotriene antagonist',
    for: 'Asthma and allergic rhinitis.',
    day: 'Usually taken in the evening. Vivid dreams and mood changes are reported.',
  },
  'prednisolone': {
    label: 'Prednisolone', brands: ['Wysolone', 'Omnacortil'],
    klass: 'Corticosteroid',
    for: 'Inflammation, autoimmune flares and severe allergy.',
    day: 'Appetite and fluid retention both rise, and the scale moves for reasons that '
       + 'are not fat. Sleep is often disturbed, and blood sugar runs higher.',
    watchWeight: true,
  },
  'thyroxine-t3': {
    label: 'Liothyronine (T3)', brands: ['Thyronorm T3', 'Cytomel'],
    klass: 'Thyroid hormone',
    for: 'An underactive thyroid, usually alongside or instead of T4.',
    day: 'Acts faster than levothyroxine; palpitations and jitteriness suggest the '
       + 'dose is worth discussing.',
  },
  'vitamin-d-rx': {
    label: 'Cholecalciferol, prescription strength', brands: ['Uprise D3', 'Calcirol'],
    klass: 'Vitamin D',
    for: 'Correcting a diagnosed deficiency.',
    day: 'Nothing noticeable. Absorbed better with a meal containing some fat.',
    food: 'With a meal that has fat in it.',
    nutrient: 'vd',
  },
};

/* Brand names and generics, flattened for lookup. */
const INDEX = (() => {
  const rows = [];
  for (const [id, m] of Object.entries(MEDICATIONS)) {
    rows.push({ id, term: m.label.toLowerCase(), m });
    for (const b of m.brands || []) rows.push({ id, term: b.toLowerCase(), m });
  }
  return rows;
})();

/*
 * Look a medication up.
 *
 * Prefix matching only, and never fuzzy. "Sert" finding sertraline is
 * helpful; "Sertra" finding something else because the letters are close
 * would be the exact failure this file is written to avoid.
 */
export function findMedication(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (needle.length < 2) return [];
  const seen = new Set();
  const out = [];
  for (const row of INDEX) {
    if (!row.term.startsWith(needle) || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ id: row.id, ...row.m });
  }
  /* Then a looser contains-pass, still not fuzzy. */
  for (const row of INDEX) {
    if (seen.has(row.id) || !row.term.includes(needle)) continue;
    seen.add(row.id);
    out.push({ id: row.id, ...row.m });
  }
  return out.slice(0, 8);
}

export function medicationById(id) {
  const m = MEDICATIONS[id];
  return m ? { id, ...m } : null;
}

export const MEDICATION_LIST = Object.entries(MEDICATIONS)
  .map(([id, m]) => ({ id, ...m }))
  .sort((a, b) => a.label.localeCompare(b.label));

/*
 * What a medication might mean for the rest of the app's readings.
 *
 * Still descriptive. "Your resting heart rate reads lower on a beta
 * blocker" is a fact about the instrument, not advice about the drug.
 */
export function dayEffects(med) {
  if (!med) return [];
  const out = [];
  if (med.affectsHR) {
    out.push({ tone: '', text:
      'Beta blockers hold heart rate down at rest and under load. Your resting HR and '
      + 'training heart rates here will read lower than they otherwise would, and a '
      + 'session can feel harder than the numbers suggest.' });
  }
  if (med.watchMeals) {
    out.push({ tone: '', text:
      'This one works against your meals. Skipped or late meals, and hard training '
      + 'after a dose, are the situations where blood sugar drops.' });
  }
  if (med.watchCaffeine) {
    out.push({ tone: '', text:
      'Coffee near the dose reduces how much is absorbed — the app tracks your caffeine, '
      + 'so the timing is visible in the same place.' });
  }
  if (med.watchVitK) {
    out.push({ tone: '', text:
      'Vitamin K from leafy greens interacts with this. Consistency week to week is '
      + 'what matters, and the app can show you whether your greens are steady.' });
  }
  if (med.watchWeight) {
    out.push({ tone: '', text:
      'Appetite and water retention both rise on this, so weight can climb for reasons '
      + 'that are not fat. Worth remembering when reading the trend line here.' });
  }
  if (med.nutrient) {
    out.push({ tone: '', text:
      `Long-term use is associated with lower ${med.nutrient === 'b12' ? 'B12' : 'vitamin D'}. `
      + 'That nutrient is already tracked in this app.' });
  }
  if (med.food) out.push({ tone: '', text: 'Food: ' + med.food });
  return out;
}
