/*
 * Blood markers.
 *
 * A deliberately narrow feature. It records what your report said, tracks it
 * over time, and puts it next to what you were eating. It does not
 * interpret, diagnose, or tell you what to take — that is a doctor's job,
 * and an app guessing at it is worse than an app that stays quiet.
 *
 * The reference ranges here are the ordinary adult ones printed on Indian
 * lab reports. Where your own report gives a different range, believe your
 * report: ranges vary by lab, by assay and by population.
 *
 * The one thing this can do that a lab cannot is join a marker to your
 * food. "Your B12 is low" is where a blood test stops. "Your B12 is low and
 * you have averaged 0.9 µg a day against a 2.4 µg requirement" points at
 * intake; "your B12 is low and you average 6 µg a day" points somewhere
 * else entirely, and that is a different conversation with a doctor.
 */

export const MARKERS = {
  hb:        { label: 'Haemoglobin',      unit: 'g/dL',  lo: 13.0, hi: 17.0, dp: 1, group: 'Blood count',
               linkedNutrient: 'fe', note: 'Low haemoglobin is often, but not always, iron.' },
  ferritin:  { label: 'Ferritin',         unit: 'ng/mL', lo: 30,   hi: 300,  dp: 0, group: 'Blood count',
               linkedNutrient: 'fe', note: 'Iron stores. Rises with inflammation, so it can read high for unrelated reasons.' },
  b12:       { label: 'Vitamin B12',      unit: 'pg/mL', lo: 200,  hi: 900,  dp: 0, group: 'Vitamins',
               linkedNutrient: 'b12' },
  vitd:      { label: 'Vitamin D (25-OH)', unit: 'ng/mL', lo: 30,  hi: 100,  dp: 1, group: 'Vitamins',
               linkedNutrient: 'vd', note: 'Deficiency is close to universal in urban India.' },
  folate:    { label: 'Folate',           unit: 'ng/mL', lo: 3,    hi: 20,   dp: 1, group: 'Vitamins',
               linkedNutrient: 'fol' },

  glucose:   { label: 'Fasting glucose',  unit: 'mg/dL', lo: 70,   hi: 99,   dp: 0, group: 'Metabolic' },
  hba1c:     { label: 'HbA1c',            unit: '%',     lo: 4.0,  hi: 5.6,  dp: 1, group: 'Metabolic',
               note: 'Average blood sugar over about three months.' },
  insulin:   { label: 'Fasting insulin',  unit: 'µIU/mL', lo: 2,   hi: 12,   dp: 1, group: 'Metabolic' },

  tc:        { label: 'Total cholesterol', unit: 'mg/dL', lo: 0,   hi: 200,  dp: 0, group: 'Lipids' },
  ldl:       { label: 'LDL',              unit: 'mg/dL', lo: 0,    hi: 100,  dp: 0, group: 'Lipids',
               linkedNutrient: null, note: 'Saturated fat intake moves this one.' },
  hdl:       { label: 'HDL',              unit: 'mg/dL', lo: 40,   hi: 100,  dp: 0, group: 'Lipids',
               higherIsBetter: true },
  tg:        { label: 'Triglycerides',    unit: 'mg/dL', lo: 0,    hi: 150,  dp: 0, group: 'Lipids',
               note: 'Responds to refined carbohydrate and alcohol more than to dietary fat.' },

  tsh:       { label: 'TSH',              unit: 'µIU/mL', lo: 0.4, hi: 4.0,  dp: 2, group: 'Thyroid' },
  t3:        { label: 'T3, free',         unit: 'pg/mL', lo: 2.3,  hi: 4.2,  dp: 2, group: 'Thyroid' },
  t4:        { label: 'T4, free',         unit: 'ng/dL', lo: 0.8,  hi: 1.8,  dp: 2, group: 'Thyroid' },

  creatinine:{ label: 'Creatinine',       unit: 'mg/dL', lo: 0.7,  hi: 1.3,  dp: 2, group: 'Kidney & liver',
               note: 'Rises with muscle mass and with creatine supplementation — not automatically a kidney signal.' },
  urea:      { label: 'Urea',             unit: 'mg/dL', lo: 15,   hi: 40,   dp: 0, group: 'Kidney & liver' },
  alt:       { label: 'ALT / SGPT',       unit: 'U/L',   lo: 0,    hi: 50,   dp: 0, group: 'Kidney & liver' },
  ast:       { label: 'AST / SGOT',       unit: 'U/L',   lo: 0,    hi: 50,   dp: 0, group: 'Kidney & liver',
               note: 'Hard training alone can raise this for a few days.' },

  testost:   { label: 'Testosterone, total', unit: 'ng/dL', lo: 300, hi: 1000, dp: 0, group: 'Hormones',
               higherIsBetter: true },
  crp:       { label: 'CRP (hs)',         unit: 'mg/L',  lo: 0,    hi: 3,    dp: 2, group: 'Inflammation' },
};

export const MARKER_GROUPS = ['Blood count', 'Vitamins', 'Metabolic', 'Lipids',
                              'Thyroid', 'Kidney & liver', 'Hormones', 'Inflammation'];

/* Where a value sits against the printed range. Descriptive only. */
export function statusOf(key, value) {
  const m = MARKERS[key];
  if (!m || value == null) return null;
  if (value < m.lo) return m.higherIsBetter ? 'low' : (m.lo > 0 ? 'low' : 'in');
  if (value > m.hi) return 'high';
  return 'in';
}

export const STATUS_LABEL = { low: 'below range', in: 'in range', high: 'above range' };
export const STATUS_COLOUR = { low: 'var(--caution)', in: 'var(--good)', high: 'var(--warn)' };
