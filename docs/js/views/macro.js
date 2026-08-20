/*
 * Tap a macro, see what it was actually made of.
 *
 * The bar on Today answers "how much". This answers "of what" — which is
 * the question that changes what you put on the plate tomorrow.
 */

import { el, sheet, kcal, g, grams, rail, icon } from '../ui.js';
import { get, byMeal, entryMacros, totals, dayKey } from '../store.js';
import {
  dayQuality, leucineByMeal, qualityAdvice, LEUCINE_THRESHOLD_G,
} from '../data/quality.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

const bar = (label, value, total, hue) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return el('div.macro-row', {},
    el('div.macro-head', {},
      el('span.macro-name', { style: { color: hue } }, label),
      el('span.macro-val', {},
        el('b', {}, g(value, 1)),
        el('span.of', {}, ` g · ${Math.round(pct)}%`))),
    rail({ value, target: total || 1, compact: true, hue }));
};

const sourceRows = (list, render) =>
  el('div.tile.flush', {}, ...list.slice(0, 8).map(render));

function coverageNote(coverage) {
  if (coverage >= 0.95) return null;
  const pct = Math.round(coverage * 100);
  return el('div.note.info', { style: { marginBottom: '12px' } },
    el('div.fine', {},
      pct === 0
        ? 'None of today’s food is classified — custom foods, Pot recipes and home dishes carry no type information.'
        : `Covers ${pct}% of today. Custom foods, Pot recipes and home dishes have no type information, so the rest is unaccounted for rather than zero.`));
}

const adviceBlock = advice => advice.length
  ? el('div', { style: { marginTop: '4px' } },
      ...advice.map(a => el('div', { class: 'note ' + (a.tone === 'warn' ? 'warn' : a.tone === 'good' ? 'good' : 'info') },
        el('div.fine', {}, a.text))))
  : null;

/* ── Protein ────────────────────────────────────────────────────────── */

function proteinBody(q, mealLeu, targets) {
  const p = q.protein;
  const hitCount = Object.values(mealLeu).filter(v => v.hit).length;
  const mealCount = Object.values(mealLeu).filter(v => v.protein > 5).length;

  return el('div', {},
    coverageNote(p.coverage),

    el('div.tile', {},
      el('div.readout', {},
        el('div', {},
          el('div.micro', {}, 'Leucine today'),
          el('div.readout-main', { style: { fontSize: '34px' } }, g(p.leucine, 1),
            el('span.readout-pm', {}, ' g'))),
        el('div.readout-side', {},
          el('div.micro', {}, 'Meals over threshold'),
          el('div.v', {}, `${hitCount} / ${mealCount}`))),
      el('div.fine', { style: { marginTop: '8px' } },
        `Leucine is the amino acid that actually switches on muscle building, and it works per meal, not per day. `
        + `A sitting needs roughly ${LEUCINE_THRESHOLD_G} g to cross the line — about 25–30 g of animal protein, or one scoop of whey.`)),

    el('div.section-label', {}, el('span.micro', {}, 'By meal')),
    el('div.tile.flush', {},
      ...Object.entries(mealLeu).map(([meal, v]) => el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, MEAL_LABELS[meal] || meal),
          el('div.sub', {}, `${Math.round(v.protein)} g protein`)),
        el('span.kcal', { style: { color: v.hit ? 'var(--good)' : 'var(--caution)' } },
          g(v.leucine, 1) + ' g',
          el('div.micro', { style: { marginTop: '2px' } }, v.hit ? 'over' : 'under'))))),

    el('div.section-label', {}, el('span.micro', {}, 'Complete or not')),
    el('div.tile', {},
      el('div.macros', {},
        bar('Complete', p.complete, p.covered, 'var(--good)'),
        bar('Incomplete', p.incomplete, p.covered, 'var(--caution)')),
      el('div.fine', { style: { marginTop: '10px' } },
        'Complete sources — meat, fish, egg, dairy, soy — carry every essential amino acid. '
        + 'Grains are short of lysine, legumes short of methionine. Eaten together they fill each other’s gaps, which is what dal with roti has always been doing.')),

    p.sources.length ? el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Where it came from')),
      sourceRows(p.sources, s => el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, s.name),
          el('div.sub', {}, `${s.cls}${s.complete ? '' : ' · incomplete'}`)),
        el('span.kcal', {}, g(s.g, 0) + ' g',
          el('div.micro', { style: { marginTop: '2px' } }, g(s.leucine, 1) + ' g leu'))))) : null,
  );
}

/* ── Carbohydrate ───────────────────────────────────────────────────── */

const TIER_COLOUR = { good: 'var(--good)', ok: 'var(--m-c)', limit: 'var(--warn)' };
const TIER_LABEL  = { good: 'Whole', ok: 'Starchy staples', limit: 'Refined or sugar' };

function carbBody(q, targets) {
  const c = q.carb;
  const tierTotal = c.tiers.good + c.tiers.ok + c.tiers.limit;

  return el('div', {},
    coverageNote(c.coverage),

    el('div.section-label', {}, el('span.micro', {}, 'What kind')),
    el('div.tile', {},
      el('div.macros', {},
        ...['good', 'ok', 'limit'].map(t =>
          bar(TIER_LABEL[t], c.tiers[t], tierTotal, TIER_COLOUR[t]))),
      el('div.fine', { style: { marginTop: '10px' } },
        'The distinction that matters is not sugar versus starch — it is whether the carbohydrate still has its fibre. '
        + 'Rice and refined flour are both starch, but whole grains, legumes and fruit release glucose slowly and bring micronutrients with them.')),

    el('div.section-label', {}, el('span.micro', {}, 'Broken down')),
    el('div.tile', {},
      el('div.macros', {},
        bar('Starch', c.starch, c.covered, 'var(--m-c)'),
        bar('Sugar', c.sugar, c.covered, 'var(--warn)'),
        bar('Fibre', c.fibre, c.covered, 'var(--m-fib)'))),

    c.sources.length ? el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Where it came from')),
      sourceRows(c.sources, s => el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, s.name),
          el('div.sub', {}, `${s.cls}${s.gi ? ' · ' + s.gi + ' GI' : ''}`)),
        el('span.kcal', { style: { color: TIER_COLOUR[s.tier] || 'var(--text)' } }, g(s.g, 0) + ' g')))) : null,
  );
}

/* ── Fat ────────────────────────────────────────────────────────────── */

function fatBody(q, targets) {
  const f = q.fat;
  return el('div', {},
    coverageNote(f.coverage),

    el('div.section-label', {}, el('span.micro', {}, 'The three fats')),
    el('div.tile', {},
      el('div.macros', {},
        bar('Saturated', f.sat, f.covered, 'var(--warn)'),
        bar('Monounsaturated', f.mufa, f.covered, 'var(--good)'),
        bar('Polyunsaturated', f.pufa, f.covered, 'var(--m-p)')),
      el('div.fine', { style: { marginTop: '10px' } },
        'Saturated is the one to keep a lid on — ghee, butter, fatty meat, fried food. '
        + 'Monounsaturated is olive oil, nuts, avocado. Polyunsaturated includes the omega-3s your body cannot make at all.')),

    el('div.tile', {},
      el('div.between', {},
        el('div', {},
          el('div.micro', {}, 'Omega-3'),
          el('div.num', { style: { fontSize: '22px', marginTop: '2px',
            color: f.omega3 >= 1.5 ? 'var(--good)' : 'var(--caution)' } }, g(f.omega3, 2) + ' g')),
        el('div', { style: { textAlign: 'right' } },
          el('div.micro', {}, 'Trans fat'),
          el('div.num', { style: { fontSize: '22px', marginTop: '2px',
            color: f.trans > 1 ? 'var(--warn)' : 'var(--muted)' } }, g(f.trans, 2) + ' g'))),
      el('div.fine', { style: { marginTop: '10px' } },
        'Omega-3 has to come from food — oily fish, walnuts, flax, chia. Trans fat has no safe intake and comes almost entirely from commercial frying and bakery fat.')),

    f.sources.length ? el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Where it came from')),
      sourceRows(f.sources, s => el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, s.name),
          el('div.sub', {}, `${s.cls} · ${g(s.sat, 1)} g saturated`)),
        el('span.kcal', {}, g(s.g, 0) + ' g')))) : null,
  );
}

/* ── Entry point ────────────────────────────────────────────────────── */

export function openMacroDetail(which, key = dayKey()) {
  const s = get();
  const groups = byMeal(key);
  const entries = Object.values(groups).flat();
  const q = dayQuality(entries, entryMacros);
  const mealLeu = leucineByMeal(groups, entryMacros);
  const t = totals(key);

  const targets = s.targets || {};
  const advice = qualityAdvice(q, mealLeu, targets).filter(a => a.macro === which);

  const bodies = { protein: proteinBody, carb: carbBody, fat: fatBody };
  const titles = { protein: 'Protein', carb: 'Carbohydrate', fat: 'Fat' };

  const body = el('div', {},
    adviceBlock(advice),
    bodies[which](q, which === 'protein' ? mealLeu : targets, targets),
    el('div.fine', { style: { marginTop: '16px' } },
      'Type breakdowns are derived from each food’s class rather than measured per item — good to roughly ±15%, '
      + 'which is right for spotting a pattern and wrong for anything clinical. Saturated fat and fibre are real per-food figures.'),
  );

  return sheet({ title: titles[which], body });
}
