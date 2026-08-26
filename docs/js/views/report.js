/*
 * The report.
 *
 * Everything else in the app answers "where am I right now". This answers
 * "how did that period actually go" — over a day, a week, a month, or any
 * two dates you pick.
 *
 * It leans on adherence first, because that is nearly always the real
 * story. A perfect-looking average across four logged days out of fourteen
 * is not a good fortnight; it is an unmeasured one, and saying so plainly
 * is more use than a tidy chart built on a third of the evidence.
 */

import {
  el, sheet, kcal, g, grams, icon, segmented, explain, dateLabel, field, replaceKids, toast,
} from '../ui.js';
import { healthLine } from '../charts.js';
import {
  get, totals, byMeal, dayKey, shiftDay, entryMacros, doseLog, planFor, planTotals, peekDay,
} from '../store.js';
import { caffeineDay, DAILY_CEILING_MG } from '../data/caffeine.js';
import { medicationById } from '../data/medications.js';
import { SUPPLEMENTS } from '../data/supplements.js';
import { sourceForMetric } from '../applehealth.js';
import { macroTargets, bestTDEE } from '../nutrition.js';
import { dayQuality, leucineByMeal, LEUCINE_THRESHOLD_G } from '../data/quality.js';
import { NUTRIENTS, nutrientTargets } from '../data/nutrients.js';

const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

/* ── Gathering ──────────────────────────────────────────────────────── */

export function rangeDays(from, to) {
  const out = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 800) { out.push(cur); cur = shiftDay(cur, 1); }
  return out;
}

/*
 * Roll a date range into everything the report needs, in one pass.
 * Only days with a real log count toward averages; the rest are counted as
 * gaps, which is a finding rather than a blank.
 */
export function buildReport(store, from, to) {
  const days = rangeDays(from, to);
  const targets = store.profile
    ? macroTargets(store.profile, bestTDEE(store, store.profile).kcal)
    : null;

  const rows = [];
  let logged = 0;

  const macroSum = { kcal: 0, p: 0, c: 0, f: 0, fib: 0, sug: 0, sat: 0, na: 0 };
  const microSum = {};
  let microDays = 0;
  const mealSplit = { breakfast: 0, lunch: 0, snack: 0, dinner: 0 };
  const leucineHits = { hit: 0, total: 0 };
  const carbTiers = { good: 0, ok: 0, limit: 0 };
  const fatSplit = { sat: 0, mufa: 0, pufa: 0, omega3: 0, trans: 0 };
  const weights = [];
  const water = [];
  let lateNights = 0, longGaps = 0;

  /* Every feature the app grew has to reach the report, or it may as well
     not have been built — a week you cannot read back is a week of typing
     for nothing. */
  const meds = { due: 0, taken: 0, late: 0, byMed: {} };
  const caff = { days: 0, totalMg: 0, overCeiling: 0, peak: 0 };
  const plan = { planned: 0, followed: 0, plannedKcal: 0 };
  const vitals = { hrv: [], rhr: [], recovery: [], sleepH: [], strain: [], steps: [] };
  let wakeSum = 0, wakeDays = 0, firstMealSum = 0, firstMealDays = 0;
  const manualSleep = [];

  for (const key of days) {
    const d = store.days[key];
    const t = totals(key);
    const has = d && d.entries && d.entries.length >= 2;
    if (d && d.weight > 0) weights.push({ date: key, kg: d.weight });

    rows.push({ date: key, kcal: has ? t.kcal : null, p: has ? t.p : null,
                logged: !!has, water: t.water || 0, weight: d?.weight || null });

    /* ── medication: counted whether or not any food was logged, because
       adherence is a fact about the day and not about the diary. ── */
    for (const dose of doseLog(key)) {
      meds.due++;
      const name = dose.med.nickname || dose.med.name;
      const b = meds.byMed[name] || (meds.byMed[name] = { due: 0, taken: 0, late: 0, ref: dose.med.ref });
      b.due++;
      if (dose.taken) {
        meds.taken++; b.taken++;
        if (dose.lateMin != null && dose.lateMin > 60) { meds.late++; b.late++; }
      }
    }

    /* ── vitals, whatever the band was ── */
    const wr = store.whoop?.rows?.[key];
    if (wr) {
      for (const k of Object.keys(vitals)) if (wr[k] != null) vitals[k].push(wr[k]);
      if (wr.wakeHour != null) { wakeSum += wr.wakeHour; wakeDays++; }
    }

    /* A night logged by hand counts the same as one measured, and is
       marked as such rather than blended in silently. */
    if (d?.sleep?.hours > 0 && (!wr || wr.sleepH == null)) {
      manualSleep.push(d.sleep.hours);
      if (d.sleep.wake != null) { wakeSum += d.sleep.wake; wakeDays++; }
    }

    if (!has) continue;

    logged++;
    for (const k in macroSum) macroSum[k] += t[k] || 0;
    water.push(t.water || 0);

    if (t.micro && t.microCoverage > 0.3) {
      microDays++;
      for (const k in t.micro) microSum[k] = (microSum[k] || 0) + t.micro[k];
    }

    const groups = byMeal(key);
    const entries = Object.values(groups).flat();

    /* ── caffeine: one total, whatever it arrived as ── */
    const cd = caffeineDay(entries);
    /* Pre-workout ticked off as a supplement is the same molecule as the
       coffee, and the ceiling applies to their sum — the day tile already
       adds them, and a report that disagreed with the tile would be worse
       than one that omitted the section entirely. */
    const suppMg = (d.supps || []).reduce(
      (a, id) => a + (SUPPLEMENTS[id]?.caffeine || store.supplementsCustom?.[id]?.caffeine || 0), 0);
    const dayMg = cd.total + suppMg;
    if (dayMg >= 5) {
      caff.days++;
      caff.totalMg += dayMg;
      caff.peak = Math.max(caff.peak, dayMg);
      if (dayMg > DAILY_CEILING_MG) caff.overCeiling++;
    }

    /* ── plan against actual ── */
    const planned = planFor(key);
    if (planned.length) {
      plan.planned += planned.length;
      plan.plannedKcal += planTotals(key).kcal || 0;
    }
    plan.followed += entries.filter(e => e.fromPlan).length;

    /* ── when the first meal landed against when you woke ── */
    if (wr?.wakeHour != null) {
      const first = entries.map(e => new Date(e.ts)).sort((a, b) => a - b)[0];
      if (first) {
        const h = first.getHours() + first.getMinutes() / 60;
        const gap = h >= wr.wakeHour ? h - wr.wakeHour : h + 24 - wr.wakeHour;
        if (gap < 14) { firstMealSum += gap; firstMealDays++; }
      }
    }
    for (const m of MEALS) {
      mealSplit[m] += (groups[m] || []).reduce((a, e) => a + (entryMacros(e).kcal || 0), 0);
    }

    const q = dayQuality(entries, entryMacros);
    carbTiers.good += q.carb.tiers.good;
    carbTiers.ok += q.carb.tiers.ok;
    carbTiers.limit += q.carb.tiers.limit;
    for (const k in fatSplit) fatSplit[k] += q.fat[k] || 0;

    const leu = leucineByMeal(groups, entryMacros);
    for (const m in leu) {
      if (leu[m].protein > 5 && leu[m].classified) {
        leucineHits.total++;
        if (leu[m].hit) leucineHits.hit++;
      }
    }

    // timing: how late the last item went in, and the longest gap between items
    const times = entries.map(e => new Date(e.ts)).sort((a, b) => a - b);
    if (times.length) {
      const lastH = times[times.length - 1].getHours() + times[times.length - 1].getMinutes() / 60;
      if (lastH >= 22 || lastH < 4) lateNights++;
      for (let i = 1; i < times.length; i++) {
        const gap = (times[i] - times[i - 1]) / 3600000;
        if (gap >= 6) { longGaps++; break; }
      }
    }
  }

  const mean = k => (logged ? macroSum[k] / logged : 0);
  const totalMealKcal = Object.values(mealSplit).reduce((a, b) => a + b, 0);

  return {
    from, to, days: days.length, logged,
    coverage: days.length ? logged / days.length : 0,
    rows, targets,
    mean: {
      kcal: mean('kcal'), p: mean('p'), c: mean('c'), f: mean('f'),
      fib: mean('fib'), sug: mean('sug'), sat: mean('sat'), na: mean('na'),
      water: water.length ? water.reduce((a, b) => a + b, 0) / water.length : 0,
    },
    micro: microDays ? Object.fromEntries(Object.entries(microSum).map(([k, v]) => [k, v / microDays])) : null,
    microDays,
    mealSplit, totalMealKcal,
    leucineHits, carbTiers, fatSplit,
    weights,
    timing: {
      lateNights, longGaps,
      wakeHour: wakeDays ? wakeSum / wakeDays : null,
      firstMealAfterWake: firstMealDays ? firstMealSum / firstMealDays : null,
    },
    meds: meds.due ? meds : null,
    caffeine: caff.days ? {
      ...caff, meanMg: caff.totalMg / caff.days,
    } : null,
    plan: plan.planned || plan.followed ? plan : null,
    sleepGoal: store.settings?.sleepGoal || null,
    manualSleep: manualSleep.length ? {
      mean: manualSleep.reduce((a, b) => a + b, 0) / manualSleep.length,
      n: manualSleep.length,
    } : null,
    vitals: Object.entries(vitals).reduce((acc, [k, arr]) => {
      if (arr.length) {
        acc[k] = {
          mean: arr.reduce((a, b) => a + b, 0) / arr.length,
          n: arr.length,
          source: sourceForMetric(store, k, days.length) || 'whoop',
        };
      }
      return acc;
    }, {}),
  };
}

/* ── Presentation ───────────────────────────────────────────────────── */

const statLine = (label, value, sub) =>
  el('div', {},
    el('div.micro', {}, label),
    el('div.num', { style: { fontSize: '17px', marginTop: '2px' } }, value),
    sub ? el('div.micro', { style: { marginTop: '1px' } }, sub) : null);

function adherenceBlock(r) {
  const pct = Math.round(r.coverage * 100);
  const tone = pct >= 85 ? 'good' : pct >= 55 ? 'info' : 'warn';
  return el('div', { class: 'note ' + tone },
    el('div', {},
      el('b', {}, `${r.logged} of ${r.days} days logged`),
      el('div.fine', { style: { marginTop: '3px' } },
        pct >= 85
          ? 'Enough coverage that the averages below mean something.'
          : pct >= 55
            ? `At ${pct}% coverage the averages lean toward the days you remembered to log, which are rarely the worst ones.`
            : `At ${pct}% coverage these averages describe a minority of the period. Treat them as a sample, not a summary.`)));
}

/* A bar per day — the shape of the period at a glance. */
function dailyChart(r) {
  const target = r.targets?.kcal || 2000;
  const max = Math.max(target * 1.4, ...r.rows.map(x => x.kcal || 0));
  const w = Math.max(280, r.rows.length * 12);
  const h = 96;
  const bw = w / r.rows.length;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chart');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('height', String(h));

  const mk = (tag, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  // target line
  const ty = h - (target / max) * h;
  svg.append(mk('line', { x1: 0, y1: ty, x2: w, y2: ty,
    stroke: 'var(--text)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.5 }));

  r.rows.forEach((row, i) => {
    if (row.kcal == null) {
      svg.append(mk('rect', { x: i * bw + 1, y: h - 3, width: Math.max(1, bw - 2), height: 3,
        fill: 'var(--line-2)' }));
      return;
    }
    const bh = Math.max(1, (row.kcal / max) * h);
    const over = row.kcal > target * 1.05;
    svg.append(mk('rect', { x: i * bw + 1, y: h - bh, width: Math.max(1, bw - 2), height: bh,
      fill: over ? 'var(--warn)' : 'var(--accent)', opacity: over ? 0.85 : 0.75, rx: 1 }));
  });
  return svg;
}

function mealBalance(r) {
  if (!r.totalMealKcal) return null;
  const share = m => (r.mealSplit[m] / r.totalMealKcal) * 100;
  const dinnerHeavy = share('dinner') > 45;
  const breakfastLight = share('breakfast') < 12;

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'How the day was spread')),
    el('div.tile', {},
      el('div.macros', {},
        ...MEALS.map(m => {
          const pct = share(m);
          return el('div.macro-row', {},
            el('div.macro-head', {},
              el('span.macro-name', {}, MEAL_LABELS[m]),
              el('span.macro-val', {}, el('b', {}, Math.round(pct) + '%'),
                el('span.of', {}, ` · ${kcal(r.mealSplit[m] / Math.max(1, r.logged))} kcal avg`))),
            el('div.rail.compact', { style: { '--fill': Math.min(100, pct) + '%',
              '--target': '100%', '--hue': 'var(--m-p)' } },
              el('div.rail-track', {}, el('div.rail-fill'))));
        })),
      (dinnerHeavy || breakfastLight)
        ? el('div.note.info', { style: { marginTop: '12px' } },
            el('div.fine', {},
              (dinnerHeavy ? `${Math.round(share('dinner'))}% of your calories landed at dinner. ` : '')
              + (breakfastLight ? `Breakfast carried only ${Math.round(share('breakfast'))}%. ` : '')
              + 'Total intake still decides weight, but protein works best spread across the day rather than loaded into one sitting — '
              + 'a front-loaded protein day holds muscle better at the same calories.'))
        : null),
  );
}

function proteinTiming(r) {
  if (!r.leucineHits.total) return null;
  const pct = Math.round((r.leucineHits.hit / r.leucineHits.total) * 100);
  return el('div.tile', {},
    el('div.between', {},
      el('div', {},
        el('div.micro', {}, 'Meals that triggered muscle building'),
        el('div.num', { style: { fontSize: '22px', marginTop: '2px',
          color: pct >= 60 ? 'var(--good)' : 'var(--caution)' } },
          `${r.leucineHits.hit} of ${r.leucineHits.total}`)),
      el('div', { style: { textAlign: 'right' } },
        el('div.micro', {}, 'Rate'),
        el('div.num', { style: { fontSize: '22px', marginTop: '2px' } }, pct + '%'))),
    explain(`Counts every meal with real protein in it and checks whether it cleared roughly ${LEUCINE_THRESHOLD_G} g of leucine — the point at which a meal actually switches muscle building on.`));
}

function timingBlock(r) {
  const { lateNights, longGaps, wakeHour, firstMealAfterWake } = r.timing;
  if (!r.logged) return null;
  if (!lateNights && !longGaps && firstMealAfterWake == null) return null;

  const hh = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Timing')),
    el('div.tile', {},
      el('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
        /* Measured from when you woke, not from a fixed hour — the same
           basis the coach uses, so the two never disagree. */
        firstMealAfterWake != null
          ? statLine('First meal', `${firstMealAfterWake.toFixed(1)} h`,
              wakeHour != null ? `after waking, around ${hh(wakeHour)}` : 'after waking')
          : null,
        statLine('Late finishes', String(lateNights), 'ate after 22:00'),
        statLine('Long gaps', String(longGaps), 'days with a 6h+ gap')),
      lateNights > r.logged * 0.4
        ? el('div.note.info', { style: { marginTop: '12px' } },
            el('div.fine', {},
              'Eating late is not fattening in itself — total intake still decides that. '
              + 'It does tend to cost sleep quality, and your Whoop recovery is downstream of that.'))
        : null),
  );
}

/*
 * Medication adherence.
 *
 * Counts and times, and nothing else. Whether a pattern of missed evening
 * doses matters is a conversation for the person who prescribed them —
 * the report's job is to make the pattern visible enough to take to that
 * conversation.
 */
function medsBlock(r) {
  if (!r.meds) return null;
  const m = r.meds;
  const pct = m.due ? Math.round((m.taken / m.due) * 100) : 0;

  const rows = Object.entries(m.byMed).map(([name, b]) =>
    el('div.caff-row', {},
      el('span.grow', {}, name),
      el('span.num', {}, `${b.taken}/${b.due}`
        + (b.late ? ` · ${b.late} late` : ''))));

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Medication')),
    el('div.tile', {},
      el('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
        statLine('Marked taken', `${pct}%`, `${m.taken} of ${m.due} doses`),
        m.late ? statLine('More than an hour late', String(m.late), 'of those taken') : null,
        m.due - m.taken ? statLine('Unmarked', String(m.due - m.taken), 'no record either way') : null),
      rows.length > 1 ? el('div', { style: { marginTop: '12px' } }, ...rows) : null,
      el('div.fine', { style: { marginTop: '10px' } },
        'Unmarked is not the same as missed — it means the app has no record. '
        + 'Times and doses are your prescriber\u2019s; this is only what was logged.')));
}

/* Caffeine, and how close to bedtime it landed. */
function caffeineBlock(r) {
  if (!r.caffeine) return null;
  const c = r.caffeine;
  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Caffeine')),
    el('div.tile', {},
      el('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
        statLine('Average', `${Math.round(c.meanMg)} mg`, `on ${c.days} day${c.days === 1 ? '' : 's'}`),
        statLine('Highest day', `${Math.round(c.peak)} mg`, ''),
        c.overCeiling ? statLine('Over 400 mg', String(c.overCeiling), 'days') : null),
      el('div.fine', { style: { marginTop: '10px' } },
        'Counted from everything logged — coffee entered as a drink and pre-workout '
        + 'ticked off as a supplement both land here.')));
}

/* What was planned against what was eaten. */
function planBlock(r) {
  if (!r.plan) return null;
  const p = r.plan;
  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Plan against actual')),
    el('div.tile', {},
      el('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
        statLine('Items planned', String(p.planned), ''),
        statLine('Eaten from the plan', String(p.followed),
          p.planned ? `${Math.round((p.followed / Math.max(p.planned + p.followed, 1)) * 100)}% of it` : '')),
      el('div.fine', { style: { marginTop: '10px' } },
        'A planned item counts as followed only when it was logged from the plan, '
        + 'which is what keeps the timing of the meal honest.')));
}

/*
 * Vitals, with the instrument named.
 *
 * A week of HRV means nothing without knowing whose HRV — Whoop's RMSSD
 * and Apple's SDNN are different measures, so the source belongs in the
 * report as much as the number does.
 */
/* Sleep, for someone without a band. */
function sleepBlock(r) {
  if (!r.manualSleep && !r.sleepGoal) return null;
  const goalH = r.sleepGoal ? ((r.sleepGoal.wake - r.sleepGoal.bed) + 24) % 24 : null;
  const got = r.manualSleep;

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Sleep')),
    el('div.tile', {},
      el('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
        goalH != null ? statLine('Goal', `${goalH.toFixed(1)} h`, 'the schedule you set') : null,
        got ? statLine('Actually slept', `${got.mean.toFixed(1)} h`,
          `${got.n} night${got.n === 1 ? '' : 's'} logged`) : null,
        got && goalH != null
          ? statLine('Against goal',
              `${got.mean - goalH >= 0 ? '+' : ''}${(got.mean - goalH).toFixed(1)} h`, '')
          : null),
      got ? el('div.fine', { style: { marginTop: '10px' } },
        'Logged by hand rather than measured, so read it as your own estimate.') : null));
}

function vitalsBlock(r) {
  const keys = Object.keys(r.vitals || {});
  if (!keys.length) return null;

  const LABELS = { hrv: ['HRV', 'ms'], rhr: ['Resting HR', 'bpm'], recovery: ['Recovery', '%'],
                   sleepH: ['Sleep', 'h'], strain: ['Strain', ''], steps: ['Steps', ''] };
  const cells = keys.filter(k => LABELS[k]).map(k => {
    const v = r.vitals[k];
    const [label, unit] = LABELS[k];
    const val = k === 'sleepH' || k === 'strain' ? v.mean.toFixed(1) : Math.round(v.mean);
    return statLine(label, `${val}${unit ? ' ' + unit : ''}`,
      `${v.n} day${v.n === 1 ? '' : 's'} · ${v.source === 'apple' ? 'Apple' : 'Whoop'}`);
  });

  const sources = new Set(keys.map(k => r.vitals[k].source));
  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Vitals')),
    el('div.tile', {},
      el('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } }, ...cells),
      sources.size > 1 ? el('div.fine', { style: { marginTop: '10px' } },
        'Two instruments, kept apart. Whoop reports HRV as RMSSD and Apple as SDNN, '
        + 'so the app never averages one into the other.') : null));
}

function microBlock(r, store) {
  if (!r.micro) return null;
  const targets = nutrientTargets(store.profile);
  const short = Object.keys(NUTRIENTS)
    .map(k => ({ k, pct: (r.micro[k] || 0) / targets[k] * 100 }))
    .filter(x => x.pct < 70)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 4);
  if (!short.length) return null;

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Consistently short')),
    el('div.tile.flush', {},
      ...short.map(x => {
        const info = NUTRIENTS[x.k];
        return el('div.row', {},
          el('span.grow', {},
            el('div.title', {}, info.label),
            el('div.sub', {}, `averaged across ${r.microDays} days`)),
          el('span.kcal', { style: { color: x.pct < 50 ? 'var(--warn)' : 'var(--caution)' } },
            Math.round(x.pct) + '%'));
      })));
}

/* ── The sheet ──────────────────────────────────────────────────────── */

const PRESETS = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

const spanDays = (from, to) =>
  Math.max(1, Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 86400000) + 1);


/*
 * Sharing a report.
 *
 * Plain text rather than a file or an image, because the thing people
 * actually do with this is paste it into a message to a coach, a parent
 * or a friend — and a .json attachment is useless to all three. It has to
 * be readable by someone who has never seen the app.
 *
 * Coverage leads, because an average over four logged days out of
 * fourteen is not a fortnight's diet and whoever reads this deserves to
 * know that before they read the numbers.
 */
export function reportText(r, name = '') {
  const pct = Math.round(r.coverage * 100);
  const L = [];
  const who = (name || '').trim();

  L.push(who ? `${who} — Basal report` : 'Basal report');
  L.push(`${r.from} to ${r.to}  (${r.days} day${r.days === 1 ? '' : 's'})`);
  L.push('');
  L.push(`Logged ${r.logged} of ${r.days} days — ${pct}% coverage`);
  if (pct < 70) L.push('Averages below cover only the logged days, so read them as a sample.');
  L.push('');

  if (r.logged) {
    L.push('DAILY AVERAGE');
    L.push(`  Energy    ${Math.round(r.mean.kcal)} kcal`
      + (r.targets ? `   (target ${Math.round(r.targets.kcal)})` : ''));
    L.push(`  Protein   ${Math.round(r.mean.p)} g`
      + (r.targets ? `   (target ${Math.round(r.targets.p)})` : ''));
    L.push(`  Carbs     ${Math.round(r.mean.c)} g`
      + (r.targets ? `   (target ${Math.round(r.targets.c)})` : ''));
    L.push(`  Fat       ${Math.round(r.mean.f)} g`
      + (r.targets ? `   (target ${Math.round(r.targets.f)})` : ''));
    if (r.mean.fib)   L.push(`  Fibre     ${Math.round(r.mean.fib)} g`);
    if (r.mean.sug)   L.push(`  Sugar     ${Math.round(r.mean.sug)} g`);
    if (r.mean.sat)   L.push(`  Saturated ${Math.round(r.mean.sat)} g`);
    if (r.mean.water) L.push(`  Water     ${(r.mean.water / 1000).toFixed(1)} L`);
    L.push('');
  }

  if (r.weights && r.weights.length > 1) {
    const a = r.weights[0], b = r.weights[r.weights.length - 1];
    const d = b.kg - a.kg;
    L.push('WEIGHT');
    L.push(`  ${a.kg.toFixed(1)} kg on ${a.date}  ->  ${b.kg.toFixed(1)} kg on ${b.date}`);
    L.push(`  ${d >= 0 ? '+' : ''}${d.toFixed(1)} kg over the period`);
    L.push('');
  }

  if (r.timing && (r.timing.lateNights || r.timing.longGaps || r.timing.firstMealAfterWake != null)) {
    L.push('TIMING');
    if (r.timing.firstMealAfterWake != null) {
      L.push(`  First meal averaged ${r.timing.firstMealAfterWake.toFixed(1)} h after waking`);
    }
    if (r.timing.lateNights) L.push(`  ${r.timing.lateNights} night${r.timing.lateNights === 1 ? '' : 's'} eating close to bedtime`);
    if (r.timing.longGaps)   L.push(`  ${r.timing.longGaps} long gap${r.timing.longGaps === 1 ? '' : 's'} between meals`);
    L.push('');
  }

  if (r.plan) {
    L.push('PLAN AGAINST ACTUAL');
    L.push(`  ${r.plan.planned} item${r.plan.planned === 1 ? '' : 's'} planned, ${r.plan.followed} eaten from the plan`);
    L.push('');
  }

  if (r.meds) {
    const pctM = r.meds.due ? Math.round((r.meds.taken / r.meds.due) * 100) : 0;
    L.push('MEDICATION');
    L.push(`  ${r.meds.taken} of ${r.meds.due} scheduled doses marked taken (${pctM}%)`);
    if (r.meds.late) L.push(`  ${r.meds.late} taken more than an hour after the scheduled time`);
    for (const [nameM, b] of Object.entries(r.meds.byMed)) {
      L.push(`  ${nameM}: ${b.taken}/${b.due}${b.late ? `, ${b.late} late` : ''}`);
    }
    L.push('  Unmarked means no record either way, not a missed dose.');
    L.push('  Doses and times are as prescribed; Basal only records what was logged.');
    L.push('');
  }

  if (r.caffeine) {
    L.push('CAFFEINE');
    L.push(`  ${Math.round(r.caffeine.meanMg)} mg a day on average across ${r.caffeine.days} day${r.caffeine.days === 1 ? '' : 's'}`);
    L.push(`  Highest single day ${Math.round(r.caffeine.peak)} mg`);
    if (r.caffeine.overCeiling) L.push(`  ${r.caffeine.overCeiling} day(s) above 400 mg`);
    L.push('');
  }

  if (r.manualSleep || r.sleepGoal) {
    const goalH = r.sleepGoal ? ((r.sleepGoal.wake - r.sleepGoal.bed) + 24) % 24 : null;
    L.push('SLEEP');
    if (goalH != null) L.push(`  Goal ${goalH.toFixed(1)} h`);
    if (r.manualSleep) {
      L.push(`  Slept ${r.manualSleep.mean.toFixed(1)} h across ${r.manualSleep.n} logged night(s)`);
      L.push('  Logged by hand, not measured.');
    }
    L.push('');
  }

  const vk = Object.keys(r.vitals || {});
  if (vk.length) {
    const LAB = { hrv: ['HRV', 'ms'], rhr: ['Resting HR', 'bpm'], recovery: ['Recovery', '%'],
                  sleepH: ['Sleep', 'h'], strain: ['Strain', ''], steps: ['Steps', ''] };
    L.push('VITALS');
    for (const k of vk) {
      if (!LAB[k]) continue;
      const v = r.vitals[k];
      const val = k === 'sleepH' || k === 'strain' ? v.mean.toFixed(1) : Math.round(v.mean);
      L.push(`  ${LAB[k][0].padEnd(11)} ${val}${LAB[k][1] ? ' ' + LAB[k][1] : ''}`
        + `  (${v.n} days, ${v.source === 'apple' ? 'Apple Health' : 'Whoop'})`);
    }
    if (new Set(vk.map(k => r.vitals[k].source)).size > 1) {
      L.push('  Sources are kept separate: Whoop reports HRV as RMSSD, Apple as SDNN.');
    }
    L.push('');
  }

  L.push('Measured with Basal.');
  return L.join('\n');
}

/*
 * Hand it to the platform if the platform has a share sheet, otherwise
 * the clipboard. Both can fail — a share can be cancelled, a clipboard
 * write can be refused without a user gesture — so the caller is told
 * which happened rather than being left to assume it worked.
 */
export async function shareReport(r, name) {
  const text = reportText(r, name);
  const title = `Basal — ${r.from} to ${r.to}`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      /* fall through to the clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function openReport(ctx, initialDays = 7) {
  const store = get();
  let days = initialDays;
  let customFrom = null, customTo = null, customOpen = false;
  let latest = null;   // the report currently on screen, for sharing

  const body = el('div');

  const render = () => {
    const to = customTo || dayKey();
    const from = customFrom || shiftDay(to, -(days - 1));
    const r = buildReport(store, from, to);
    latest = r;

    const t = r.targets;
    const vsTarget = t ? Math.round(r.mean.kcal - t.kcal) : null;

    replaceKids(body,
      el('div.seg', { style: { marginBottom: '10px' } },
        ...PRESETS.map(p => el('button', {
          type: 'button',
          'aria-pressed': String(!customFrom && days === p.days),
          onclick: () => { days = p.days; customFrom = customTo = null; render(); },
        }, p.label)),
        el('button', {
          type: 'button',
          'aria-pressed': String(!!customFrom),
          onclick: () => { customOpen = !customOpen; render(); },
        }, 'Custom')),

      /*
       * Arbitrary ranges.
       *
       * The presets answer "how was my week"; a custom range answers the
       * questions you actually ask of a two-year log — how did the eight
       * weeks before that trip go, what did last December look like. The
       * machinery was already here and simply had no way to be reached.
       */
      customOpen ? el('div.tile', { style: { marginBottom: '12px' } },
        el('div.field-2', {},
          field('From', el('input', {
            type: 'date', value: r.from, max: dayKey(),
            onchange: e => {
              customFrom = e.target.value || null;
              if (customFrom && !customTo) customTo = dayKey();
              if (customFrom && customTo && customFrom > customTo) customTo = customFrom;
              render();
            },
          })),
          field('To', el('input', {
            type: 'date', value: r.to, max: dayKey(),
            onchange: e => {
              customTo = e.target.value || null;
              if (customTo && !customFrom) customFrom = shiftDay(customTo, -6);
              if (customFrom && customTo && customTo < customFrom) customFrom = customTo;
              render();
            },
          }))),
        el('div.fine', { style: { marginTop: '8px' } },
          spanDays(r.from, r.to) + ' days selected.'
          + (customFrom ? '' : ' Pick a start date to begin.')),
        customFrom ? el('button.btn.sm.ghost', {
          style: { marginTop: '10px' },
          onclick: () => { customFrom = customTo = null; render(); },
        }, 'Back to presets') : null) : null,

      el('div.micro', { style: { marginBottom: '10px' } }, `${r.from} to ${r.to}`),

      adherenceBlock(r),

      r.logged ? el('div', {},
        el('div.tile', {},
          el('div.readout', {},
            el('div', {},
              el('div.micro', {}, 'Average intake'),
              el('div.readout-main', { style: { fontSize: '34px' } }, kcal(r.mean.kcal))),
            t ? el('div.readout-side', {},
              el('div.micro', {}, 'Against target'),
              el('div.v', { style: { color: Math.abs(vsTarget) < 100 ? 'var(--good)' : 'var(--caution)' } },
                (vsTarget >= 0 ? '+' : '') + vsTarget)) : null),
          el('div', { style: { marginTop: '14px' } }, dailyChart(r)),
          el('div.between', { style: { marginTop: '4px' } },
            el('span.micro', {}, dateLabel(r.from)),
            el('span.micro', {}, 'dashed line is target'),
            el('span.micro', {}, dateLabel(r.to)))),

        el('div.tile', {},
          el('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap' } },
            statLine('Protein', g(r.mean.p, 0) + ' g', t ? `target ${t.p}` : null),
            statLine('Carbs', g(r.mean.c, 0) + ' g', t ? `target ${t.c}` : null),
            statLine('Fat', g(r.mean.f, 0) + ' g', t ? `target ${t.f}` : null),
            statLine('Fibre', g(r.mean.fib, 0) + ' g', t ? `target ${t.fib}` : null),
            statLine('Water', (r.mean.water / 1000).toFixed(1) + ' L', null))),

        proteinTiming(r),
        mealBalance(r),
        timingBlock(r),
        planBlock(r),
        medsBlock(r),
        caffeineBlock(r),
        sleepBlock(r),
        vitalsBlock(r),
        microBlock(r, store),

        r.weights.length > 1 ? el('div', {},
          el('div.section-label', {}, el('span.micro', {}, 'Weight')),
          el('div.tile', {},
            el('div.between', {},
              el('div', {},
                el('div.micro', {}, 'Change over the period'),
                el('div.num', { style: { fontSize: '22px', marginTop: '2px' } },
                  ((r.weights[r.weights.length - 1].kg - r.weights[0].kg) >= 0 ? '+' : '')
                  + (r.weights[r.weights.length - 1].kg - r.weights[0].kg).toFixed(1) + ' kg')),
              el('span.micro', {}, `${r.weights.length} weigh-ins`)),
            healthLine(r.weights.map(x => ({ v: x.kg, label: `${x.date}: ${x.kg} kg` })),
              { h: 120, colour: 'var(--accent)', unit: ' kg', dp: 1 }))) : null,

      ) : null,
    );
  };

  render();
  return sheet({
    title: 'Report',
    body,
    foot: el('button.btn.primary.block', {
      onclick: async e => {
        const btn = e.currentTarget;
        if (!latest) return;
        const was = btn.textContent;
        btn.textContent = 'Preparing…';
        const how = await shareReport(latest, store.profile?.name);
        btn.textContent = was;
        if (how === 'copied') toast('Report copied — paste it anywhere.');
        else if (how === 'failed') toast('Could not share. Try Export in Settings.', 'err');
      },
    }, icon('upload', 17), navigator.share ? 'Share this report' : 'Copy this report'),
  });
}
