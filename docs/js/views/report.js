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
  el, sheet, kcal, g, grams, icon, segmented, explain, dateLabel, field,
} from '../ui.js';
import { healthLine } from '../charts.js';
import { get, totals, byMeal, dayKey, shiftDay, entryMacros } from '../store.js';
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

  for (const key of days) {
    const d = store.days[key];
    const t = totals(key);
    const has = d && d.entries && d.entries.length >= 2;
    if (d && d.weight > 0) weights.push({ date: key, kg: d.weight });

    rows.push({ date: key, kcal: has ? t.kcal : null, p: has ? t.p : null,
                logged: !!has, water: t.water || 0, weight: d?.weight || null });
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
    timing: { lateNights, longGaps },
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
  const { lateNights, longGaps } = r.timing;
  if (!r.logged) return null;
  if (!lateNights && !longGaps) return null;
  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Timing')),
    el('div.tile', {},
      el('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
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

export function openReport(ctx, initialDays = 7) {
  const store = get();
  let days = initialDays;
  let customFrom = null, customTo = null, customOpen = false;

  const body = el('div');

  const render = () => {
    const to = customTo || dayKey();
    const from = customFrom || shiftDay(to, -(days - 1));
    const r = buildReport(store, from, to);

    const t = r.targets;
    const vsTarget = t ? Math.round(r.mean.kcal - t.kcal) : null;

    body.replaceChildren(
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
  return sheet({ title: 'Report', body });
}
