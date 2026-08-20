/*
 * Tap a macro, see what it was actually made of.
 *
 * The bar on Today answers "how much". This answers "of what" — which is
 * the question that changes what you put on the plate tomorrow.
 */

import { el, sheet, kcal, g, grams, rail, icon, explain, explainNote } from '../ui.js';
import { get, byMeal, entryMacros, totals, dayKey } from '../store.js';
import {
  dayQuality, leucineByMeal, qualityAdvice, LEUCINE_THRESHOLD_G, ESSENTIAL_AA,
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
      explain(`Leucine is the one building block that actually flips the switch on muscle building, and it works per meal, not per day. `
        + `A sitting needs roughly ${LEUCINE_THRESHOLD_G} g to cross the line — about 25–30 g of animal protein, or one scoop of whey.`,
        { style: { marginTop: '8px' } })),

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
      explain('Complete sources — meat, fish, egg, dairy, soy — carry every essential amino acid. '
        + 'Grains are short of lysine, legumes short of methionine. Eaten together they fill each other’s gaps, which is what dal with roti has always been doing.')),

    p.sources.length ? el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Which food did what')),
      sourceRows(p.sources, s => el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, s.name),
          el('div.sub', { style: { color: s.complete ? 'var(--good)' : 'var(--caution)' } },
            s.complete
              ? `has all nine building blocks (complete protein) · quality ${s.diaas}`
              : `short on ${s.limiting} (its limiting amino acid) · quality ${s.diaas}`),
          !s.complete && s.pairsWith
            ? el('div.fine', { style: { marginTop: '2px' } }, `pair with ${s.pairsWith}`)
            : null),
        el('span.kcal', {}, g(s.g, 0) + ' g',
          el('div.micro', { style: { marginTop: '2px' } }, g(s.leucine, 2) + ' g leu')))),

      explainNote(null,
        `Protein is made of building blocks, and nine of them your body cannot make itself (essential amino acids): `
        + `${ESSENTIAL_AA.join(', ')}. `
        + `A food is "complete" when it has all nine in useful amounts. The others are not missing one entirely — they are short of one, `
        + `and that shortest one caps how much of the rest can be used (the limiting amino acid). `
        + `Grains run short on lysine, pulses on methionine, and each covers the other's gap. That is what dal with roti has always been doing.`)) : null,
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

    el('div.section-label', {}, el('span.micro', {}, '1 · Where it came from')),
    el('div.tile', {},
      el('div.macros', {},
        ...['good', 'ok', 'limit'].map(t =>
          bar(TIER_LABEL[t], c.tiers[t], tierTotal, TIER_COLOUR[t]))),
      explain('Whole means the fibre is still attached — oats, brown rice, dal, fruit. '
        + 'Starchy staples are the middle ground: white rice, potato, plain pasta. '
        + 'Refined is flour, sugar, white bread and anything with the fibre stripped out.')),

    el('div.section-label', {}, el('span.micro', {}, '2 · How fast it reaches you')),
    el('div.tile', {},
      el('div.macros', {},
        bar('Slow / starchy (complex)', c.starch, c.covered, 'var(--m-c)'),
        bar('Fast / sugars (simple)', c.sugar, c.covered, 'var(--warn)'),
        bar('Fibre (indigestible)', c.fibre, c.covered, 'var(--m-fib)')),
      explain('Slow carbs are long chains your gut has to take apart first, so the energy arrives gradually. '
        + 'Fast carbs are single sugars already broken down, so they hit the blood almost immediately. '
        + 'Fibre your body cannot break down at all — it feeds gut bacteria instead of you, which is why it fills you up without the calories.')),

    /* The question this sheet kept prompting: the two sections are not
       independent, and saying so is more useful than either one alone. */
    explainNote(null,
        'These two sections are the same food seen twice — the first is where it came from, the second is what that does to you. '
        + 'They line up most of the time: whole food is usually slow, because the fibre is physically in the way of your digestive enzymes. '
        + 'Strip the fibre out and the same starch becomes fast. That is the whole difference between an apple and apple juice, '
        + 'or brown rice and white bread. '
        + 'Where they part company is fruit — high in fast sugar, but the fibre and water slow it down anyway, which is why it still counts as whole.'),

    c.sources.length ? el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Which food did what')),
      sourceRows(c.sources, s => el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, s.name),
          el('div.sub', { style: { color: TIER_COLOUR[s.tier] || 'var(--muted)' } },
            `${s.cls}${s.gi ? ' · ' + s.gi + ' blood-sugar impact' : ''}`),
          el('div.fine', { style: { marginTop: '2px' } },
            `${g(s.complex, 0)} g slow · ${g(s.simple, 0)} g fast · ${g(s.fibre, 1)} g fibre`)),
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
      explain('These three make up all the fat you eat, and they always add up to the total. '
        + 'Saturated comes from ghee, butter, fatty meat and fried food, and is the one to keep down. '
        + 'Monounsaturated comes from olive oil, nuts and avocado. Polyunsaturated comes from seeds and fish.')),

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
      explain('These two are shown separately because they are not a fourth and fifth type — they sit inside the three above. '
        + 'Omega-3 is a particular kind of polyunsaturated fat, singled out because your body cannot make it and most people get too little: '
        + 'walnuts, flax and chia give the plant form, oily fish the stronger marine form. '
        + 'Trans fat is a damaged version of unsaturated fat created by industrial frying, and it is the only one with no safe level at all.')),

    f.sources.length ? el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Which food did what')),
      sourceRows(f.sources, s => el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, s.name),
          el('div.sub', { style: { color: s.sat / Math.max(0.1, s.g) > 0.5 ? 'var(--warn)' : 'var(--muted)' } },
            `${s.cls} · ${Math.round((s.sat / Math.max(0.1, s.g)) * 100)}% saturated`),
          el('div.fine', { style: { marginTop: '2px' } },
            `${g(s.sat, 1)} saturated · ${g(s.mufa, 1)} mono · ${g(s.pufa, 1)} poly`
            + (s.omega3 > 0.05 ? ` · ${g(s.omega3, 2)} g omega-3` : ''))),
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
