/*
 * Demo data — two years of a plausible life.
 *
 * Not a flattering dataset. A perfectly logged, steadily improving two years
 * would show every screen at its best and teach you nothing about how the
 * app behaves in the situations you will actually be in: the fortnight you
 * stopped logging, the plateau where nothing moved, the month the weight
 * went back up.
 *
 * So this includes all of that. Adherence starts poor and improves, then
 * collapses during a holiday. Weight falls, stalls for eleven weeks, regains
 * over Christmas, then falls again. Vitamin D starts deficient, gets
 * supplemented, and recovers by the third blood panel. The point is to see
 * what the reports say when the data is messy, because that is when you need
 * them to say something useful.
 *
 * Deterministic: the same seed always produces the same two years, so what
 * you see is what you can point at and discuss.
 */

import { FOODS, BY_ID } from './data/foods.js';

/* A small seeded generator — Mulberry32. Same seed, same life. */
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10);

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const jitter = (r, base, spread) => Math.max(0, Math.round(base + (r() - 0.5) * spread));

/*
 * The days themselves.
 *
 * Breakfast is near-identical every day, which is true of most people and is
 * also what makes the leucine-per-meal screen interesting: a bread-and-jam
 * breakfast never clears the threshold no matter how good dinner was.
 */
const BREAKFAST = [
  [['egg-white', 200], ['egg-whole', 100], ['bread-brown', 90]],
  [['oats-dry', 80], ['milk-toned', 250], ['banana', 118]],
  [['egg-whole', 150], ['bread-white', 60], ['coffee-milk', 180]],
];

const LUNCH = [
  [['chicken-breast-ckd', 200], ['rice-white-ckd', 250], ['salad-kachumber', 100]],
  [['rajma', 200], ['rice-white-ckd', 220]],
  [['pasta-dry', 90], ['pasta-sauce-tomato', 120], ['olive-oil', 12], ['cheddar', 25]],
  [['chole', 200], ['roti', 80]],
];

const DINNER = [
  [['paneer', 130], ['dal-tadka', 200], ['roti', 80], ['ghee', 8]],
  [['chicken-curry', 220], ['rice-white-ckd', 200]],
  [['fish-surmai', 180], ['broccoli-ckd', 150], ['olive-oil', 12]],
  [['dal-makhani', 200], ['rice-basmati-ckd', 200], ['curd', 120]],
  [['egg-bhurji', 160], ['roti', 60]],
];

const SNACKS = [
  [['whey-conc', 30], ['milk-toned', 250]],
  [['almonds', 30]],
  [['greek-yogurt', 170]],
  [['potato-chips', 52]],
  [['dark-choc-70', 20]],
];

const EATING_OUT = [
  [['mcd-mcaloo', 155], ['mcd-fries-med', 110], ['cola', 330]],
  [['kfc-zinger', 210], ['kfc-popcorn-sm', 85]],
  [['dom-margherita-slice', 189], ['dom-garlic-bread', 70]],
  [['street-chicken-roll', 220]],
  [['sub-chicken-teriyaki-6', 260]],
];

const MEAL_HOUR = { breakfast: 8, lunch: 13.5, snack: 17, dinner: 20.5 };

function entryFor(r, id, grams, meal, date) {
  const f = BY_ID[id];
  if (!f) return null;
  const h = MEAL_HOUR[meal] + (r() - 0.5) * 1.2;
  const t = new Date(date);
  t.setHours(Math.floor(h), Math.floor((h % 1) * 60), 0, 0);
  const g = Math.max(5, Math.round(grams * (0.85 + r() * 0.3)));
  return {
    id: Math.random().toString(36).slice(2, 10),
    ts: t.getTime(), meal,
    method: ['whey-conc', 'olive-oil', 'ghee', 'almonds'].includes(id) ? 'weighed'
      : f.grp === 'Eating out' ? 'label' : (r() < 0.7 ? 'weighed' : 'portion'),
    grade: f.grade,
    name: f.n, ref: f.id, per100: f.per100,
    serv: (f.serv || []).map(x => Array.isArray(x) ? { l: x[0], g: x[1] } : x),
    grams: g,
  };
}

/*
 * Adherence and weight over two years, as phases rather than a smooth curve.
 * Each phase is a thing that actually happens to people.
 */
function phaseFor(dayIndex, total) {
  const p = dayIndex / total;
  if (p < 0.10) return { name: 'finding my feet', adherence: 0.55, drift: -0.010, out: 0.22 };
  if (p < 0.28) return { name: 'it is working',   adherence: 0.88, drift: -0.022, out: 0.10 };
  if (p < 0.40) return { name: 'plateau',         adherence: 0.82, drift: -0.001, out: 0.16 };
  if (p < 0.46) return { name: 'holiday',         adherence: 0.30, drift: +0.030, out: 0.55 };
  if (p < 0.52) return { name: 'back to it',      adherence: 0.70, drift: -0.012, out: 0.18 };
  if (p < 0.72) return { name: 'steady',          adherence: 0.92, drift: -0.018, out: 0.12 };
  if (p < 0.80) return { name: 'festive',         adherence: 0.55, drift: +0.020, out: 0.40 };
  if (p < 0.94) return { name: 'lean again',      adherence: 0.93, drift: -0.014, out: 0.10 };
  return { name: 'maintaining', adherence: 0.90, drift: -0.002, out: 0.15 };
}

export function generateDemo({ years = 2, seed = 20260820 } = {}) {
  const r = rng(seed);
  const total = Math.round(years * 365);
  const today = new Date();

  const days = {};
  const whoop = {};
  let weight = 91.0;
  let hrvBase = 52;

  for (let i = total - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = iso(d);
    const idx = total - 1 - i;
    const phase = phaseFor(idx, total);
    const dow = d.getDay();

    /* ── Whoop, every day, since the strap does not take days off ── */
    const weekendDrag = (dow === 0 || dow === 6) ? -4 : 0;
    const trainingDay = dow !== 0 && r() < 0.62;
    const strain = trainingDay ? 12 + r() * 7 : 5 + r() * 6;
    const sleepH = Math.max(4.2, 7.1 + (r() - 0.5) * 2.2 + (dow === 5 ? -0.7 : 0));
    hrvBase += (r() - 0.5) * 1.2;
    hrvBase = Math.max(38, Math.min(72, hrvBase + (phase.drift < 0 ? 0.012 : -0.02)));
    const hrv = Math.round(hrvBase + (sleepH - 7) * 3 + (r() - 0.5) * 8);
    const recovery = Math.max(8, Math.min(99, Math.round(
      42 + (hrv - 52) * 1.1 + (sleepH - 7) * 6 + weekendDrag + (r() - 0.5) * 16)));

    whoop[key] = {
      recovery, hrv,
      rhr: Math.round(56 - (hrvBase - 52) * 0.25 + (r() - 0.5) * 4),
      strain: +strain.toFixed(1),
      kcal: Math.round(2350 + strain * 78 + (r() - 0.5) * 220),
      spo2: +(96.2 + r() * 1.6).toFixed(1),
      temp: +(33.6 + r() * 0.7).toFixed(1),
      resp: +(14.2 + r() * 1.4).toFixed(1),
      sleepH: +sleepH.toFixed(2),
      sleepPerf: Math.round(Math.min(100, (sleepH / 8) * 100 + (r() - 0.5) * 12)),
      sleepEff: Math.round(88 + r() * 8),
      remH: +(sleepH * (0.20 + r() * 0.04)).toFixed(2),
      swsH: +(sleepH * (0.16 + r() * 0.05)).toFixed(2),
      debtH: +(Math.max(0, 7.8 - sleepH) * (0.5 + r())).toFixed(2),
      wakeHour: 6.4 + (r() - 0.5) * 1.1,
      /* Steps come from the phone, not the strap — Whoop's API withholds
         them. Marked per field so the Vitals panel can say so. */
      steps: Math.round(6800 + strain * 420 + (r() - 0.5) * 3000),
      by: { steps: 'apple' },
    };

    /* ── Weight, most mornings, with real scale noise ── */
    weight += phase.drift + (r() - 0.5) * 0.10;
    const weighs = r() < (phase.adherence > 0.7 ? 0.85 : 0.45);

    /* ── Food, when it got logged ── */
    const logged = r() < phase.adherence;
    const entries = [];

    /* Coffee on most mornings and an energy drink now and then, so the
       caffeine card has something real to decay against bedtime. */
    if (logged) {
      const at = (hh, mm) => { const t = new Date(d); t.setHours(hh, mm, 0, 0); return t.getTime(); };
      const drink = (fid, g, hh, mm, meal) => {
        const f = BY_ID[fid];
        if (!f) return;
        entries.push({ id: 'e' + key + fid, ts: at(hh, mm), meal,
          name: f.n, ref: f.id, per100: f.per100,
          serv: (f.serv || []).map(x => Array.isArray(x) ? { l: x[0], g: x[1] } : x),
          grams: g, method: 'portion', grade: f.grade });
      };
      if (r() < 0.85) drink('coffee-milk', 250, 8, 20, 'breakfast');
      if (r() < 0.30) drink('coffee-black', 200, 15 + Math.floor(r() * 3), 30, 'snack');
      if (trainingDay && r() < 0.25) drink('monster', 500, 17, 0, 'snack');
    }
    if (logged) {
      for (const [id, g] of pick(r, BREAKFAST)) {
        const e = entryFor(r, id, g, 'breakfast', d); if (e) entries.push(e);
      }
      const outToday = r() < phase.out;
      for (const [id, g] of (outToday ? pick(r, EATING_OUT) : pick(r, LUNCH))) {
        const e = entryFor(r, id, g, 'lunch', d); if (e) entries.push(e);
      }
      if (r() < 0.75) {
        for (const [id, g] of pick(r, SNACKS)) {
          const e = entryFor(r, id, g, 'snack', d); if (e) entries.push(e);
        }
      }
      for (const [id, g] of pick(r, DINNER)) {
        const e = entryFor(r, id, g, 'dinner', d); if (e) entries.push(e);
      }
    }

    const water = [];
    if (logged) {
      const glasses = 5 + Math.floor(r() * 6);
      for (let gI = 0; gI < glasses; gI++) {
        water.push({ ts: d.getTime() + gI * 3.4e6, ml: 250 });
      }
    }

    // supplements only from about a third of the way in — people start later
    const supps = [];
    if (idx > total * 0.35 && logged) {
      if (r() < 0.9) supps.push('vitamin-d3');
      if (r() < 0.8) supps.push('creatine');
      if (r() < 0.55) supps.push('multivitamin');
      if (r() < 0.4) supps.push('omega3');
    }

    days[key] = {
      entries, water,
      weight: weighs ? +weight.toFixed(1) : null,
      note: '', supps,
    };
  }

  /* ── Blood panels: deficient, treated, recovered ── */
  const panelDate = frac => {
    const d = new Date(today); d.setDate(d.getDate() - Math.round(total * (1 - frac)));
    return iso(d);
  };
  const blood = {
    'bp:demo1': { id: 'bp:demo1', date: panelDate(0.06), lab: 'Demo Diagnostics',
      values: { hb: 14.2, ferritin: 48, b12: 210, vitd: 11.4, glucose: 96, hba1c: 5.5,
                tc: 214, ldl: 138, hdl: 38, tg: 186, tsh: 2.4, alt: 46, creatinine: 1.05 } },
    'bp:demo2': { id: 'bp:demo2', date: panelDate(0.40), lab: 'Demo Diagnostics',
      values: { hb: 14.6, ferritin: 62, b12: 288, vitd: 24.8, glucose: 91, hba1c: 5.3,
                tc: 196, ldl: 118, hdl: 43, tg: 142, tsh: 2.1, alt: 38, creatinine: 1.08 } },
    'bp:demo3': { id: 'bp:demo3', date: panelDate(0.74), lab: 'Demo Diagnostics',
      values: { hb: 15.1, ferritin: 78, b12: 402, vitd: 38.2, glucose: 88, hba1c: 5.1,
                tc: 178, ldl: 98, hdl: 49, tg: 108, tsh: 1.9, alt: 31, creatinine: 1.11,
                testost: 612, crp: 0.9 } },
    'bp:demo4': { id: 'bp:demo4', date: panelDate(0.97), lab: 'Demo Diagnostics',
      values: { hb: 15.3, ferritin: 84, b12: 455, vitd: 44.1, glucose: 86, hba1c: 5.0,
                tc: 172, ldl: 92, hdl: 52, tg: 96, tsh: 1.8, alt: 27, creatinine: 1.12,
                testost: 658, crp: 0.7 } },
  };

  /* A couple of saved meals and one Pot recipe, since a two-year user would
     certainly have them. */
  const meals = {};
  const mk = (id, name, meal, items) => {
    meals[id] = {
      id, name, meal, createdAt: Date.now() - 3e10, lastUsed: Date.now() - 8.6e7,
      uses: 40 + Math.floor(r() * 120),
      items: items.map(([fid, g]) => {
        const f = BY_ID[fid];
        return { name: f.n, brand: '', ref: f.id, barcode: null, per100: f.per100,
                 serv: (f.serv || []).map(x => Array.isArray(x) ? { l: x[0], g: x[1] } : x),
                 grams: g, method: 'weighed', grade: f.grade, dish: null };
      }),
    };
  };
  mk('meal:demo1', 'Usual breakfast', 'breakfast',
     [['egg-white', 200], ['egg-whole', 100], ['bread-brown', 90]]);
  mk('meal:demo2', 'Pasta night', 'dinner',
     [['pasta-dry', 90], ['pasta-sauce-tomato', 120], ['olive-oil', 12], ['cheddar', 25]]);
  mk('meal:demo3', 'Post-gym shake', 'snack',
     [['whey-conc', 30], ['milk-toned', 250], ['banana', 118]]);

  const library = {
    'my:demo-dal': {
      id: 'my:demo-dal', n: 'Amma’s dal (from the pot)', brand: 'from your kitchen',
      basis: 'as-served', grade: 'B', grp: 'Yours',
      per100: { kcal: 134, p: 6.2, c: 15.1, f: 5.4, fib: 3.6, sug: 1.1, sat: 1.4, na: 380 },
      serv: [{ l: '1 serving (200 g)', g: 200 }, { l: '100 g', g: 100 }],
      savedAt: Date.now() - 2.4e10,
      pot: { items: [{ id: 'dal-toor-ckd', grams: 900 }, { id: 'oil-generic', grams: 45 },
                     { id: 'onion', grams: 150 }, { id: 'tomato', grams: 200 }],
             cookedG: 1150, rawG: 1295 },
    },
  };

  /*
   * Medication, with a realistic adherence record.
   *
   * The morning dose is nearly always taken and often a little late; the
   * evening one gets missed about one night in five, which is the pattern
   * the report exists to make visible.
   */
  const addedAt = Date.now() - 1.6e10;
  const medications = [
    { id: 'med:demo1', name: 'Metformin', nickname: 'morning one', ref: 'metformin',
      purpose: 'blood sugar', mg: 500, unit: 'mg', perDose: 1,
      times: ['08:00', '20:00'], addedAt },
    { id: 'med:demo2', name: 'Cholecalciferol', nickname: '', ref: 'vitamin-d-rx',
      purpose: 'vitamin D deficiency', mg: 60000, unit: 'IU', perDose: 1,
      times: ['09:00'], addedAt },
  ];

  for (let i = 0; i < 120; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = iso(d);
    if (!days[key]) continue;
    const doses = {};
    const stamp = (hh, mm) => { const t = new Date(d); t.setHours(hh, mm, 0, 0); return t.getTime(); };
    if (r() < 0.95) doses['med:demo1@08:00'] = { at: stamp(8, 5 + Math.floor(r() * 70)), time: '08:00', medId: 'med:demo1' };
    if (r() < 0.80) doses['med:demo1@20:00'] = { at: stamp(20, 5 + Math.floor(r() * 110)), time: '20:00', medId: 'med:demo1' };
    if (d.getDay() === 0 && r() < 0.9) doses['med:demo2@09:00'] = { at: stamp(9, 10), time: '09:00', medId: 'med:demo2' };
    days[key].doses = doses;
  }

  /* A plan for tomorrow, so the Plan tab has something to show. */
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const planned = (fid, g, meal) => {
    const f = BY_ID[fid];
    return f && { id: 'p' + fid, name: f.n, ref: f.id, per100: f.per100,
                  serv: (f.serv || []).map(x => Array.isArray(x) ? { l: x[0], g: x[1] } : x),
                  grams: g, grade: f.grade, method: 'portion', meal };
  };
  const plans = {
    [iso(tomorrow)]: [
      planned('egg-whole', 150, 'breakfast'),
      planned('biryani-veg', 300, 'lunch'),
      planned('dal-makhani', 150, 'dinner'),
      planned('roti', 100, 'dinner'),
    ].filter(Boolean),
  };

  return {
    days, whoop: { rows: whoop, importedAt: Date.now(), source: 'demo' },
    blood, meals, library, medications, plans,
    supplementsTaken: ['vitamin-d3', 'creatine', 'multivitamin', 'omega3'],
    /* The demo carries its own profile. Without one the whole app renders
       targets of zero — every macro reads "of 0" — because BMR needs a
       birth year and there is nowhere else for the demo to get one. */
    profile: {
      name: 'Demo', sex: 'male', birthYear: 1996, heightCm: 178,
      weightKg: +weight.toFixed(1), bodyFatPct: null,
      activity: 'moderate', goal: 'lean',
    },
    settings: {
      healthSource: 'both',
      sleepGoal: { bed: 22.75, wake: 6.5, setAt: addedAt },
    },
    stats: { days: total, years },
  };
}
