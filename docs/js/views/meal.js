/*
 * Building a meal.
 *
 * Distinct from the Pot on purpose. The Pot is for food somebody else
 * cooked, where the recipe is unknown and the answer has to come from
 * weighing the finished dish. A meal is the opposite: you made it, so you
 * know exactly what went in — 100 g of pasta, 100 g of sauce, a spoon of
 * oil — and the only thing you want is to stop typing it out every time.
 *
 * So it stores the items, not a blended total. Your timeline still shows
 * pasta, sauce and oil separately, the macros stay exact, and changing the
 * pasta to 120 g later is an edit rather than starting again.
 */

import {
  el, sheet, toast, kcal, grams, g, icon, field, segmented, confirmSheet,
} from '../ui.js';
import { get, saveMeal, updateMeal, MEALS, METHODS, macrosFor, dayKey, logMeal } from '../store.js';
import { FOODS, BY_ID } from '../data/foods.js';
import { STYLES, per100For, densityFor } from '../dishes.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

/* Things that turn up in a home-assembled meal, nearest the top. */
const HANDY = [
  'pasta-dry', 'rice-white-raw', 'oats-dry', 'bread-brown',
  'chicken-breast-raw', 'egg-whole', 'egg-white', 'paneer', 'whey-conc',
  'oil-generic', 'olive-oil', 'ghee', 'butter', 'cheese-slice',
  'onion', 'tomato', 'bell-pepper', 'mushroom-raw', 'broccoli-ckd', 'spinach-raw',
];

export function openMealBuilder({ meal = null, onSaved = () => {} } = {}) {
  const store = get();

  // { key, name, brand, ref, per100, serv, grams, method, grade, dish }
  let items = meal ? meal.items.map(i => ({ ...i, key: Math.random().toString(36).slice(2) })) : [];
  let target = meal?.meal || 'lunch';

  const nameInput = el('input', {
    type: 'text',
    value: meal?.name || '',
    placeholder: 'Pasta with sauce',
  });

  const list = el('div.tile.flush');
  const summary = el('div');

  const totals = () => items.reduce((a, it) => {
    const m = macrosFor(it.per100, it.grams);
    for (const k of ['kcal', 'p', 'c', 'f', 'fib']) a[k] += m[k] || 0;
    return a;
  }, { kcal: 0, p: 0, c: 0, f: 0, fib: 0 });

  function render() {
    list.replaceChildren();
    if (!items.length) {
      list.append(el('div', { style: { padding: '16px', color: 'var(--muted)', fontSize: '13.5px' } },
        'Nothing in it yet. Add what you actually put in — including the oil, which is usually the part that gets forgotten.'));
    }

    items.forEach((it, i) => {
      const m = macrosFor(it.per100, it.grams);
      list.append(el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, it.name),
          el('div.sub', {}, `${Math.round(m.kcal)} kcal · ${Math.round(m.p)}P ${Math.round(m.c)}C ${Math.round(m.f)}F`)),
        el('input.num-in', {
          type: 'number', inputmode: 'decimal', min: '0', step: '5',
          value: String(it.grams),
          style: { width: '82px', flex: 'none' },
          'aria-label': 'Grams of ' + it.name,
          oninput: e => { items[i].grams = Math.max(0, +e.target.value || 0); render(); },
        }),
        el('span.micro', { style: { flex: 'none' } }, 'g'),
        el('button.x-btn', {
          'aria-label': 'Remove ' + it.name,
          onclick: () => { items.splice(i, 1); render(); },
        }, icon('trash', 15)),
      ));
    });

    const t = totals();
    summary.replaceChildren(
      el('div.tile', {},
        el('div.readout', {},
          el('div', {},
            el('div.micro', {}, 'Whole meal'),
            el('div.readout-main', { style: { fontSize: '34px' } }, kcal(t.kcal))),
          el('div.readout-side', {},
            el('div.micro', {}, 'Items'),
            el('div.v', {}, String(items.length)))),
        items.length ? el('div', { style: { display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' } },
          stat('Protein', t.p, 'var(--m-p)'),
          stat('Carbs', t.c, 'var(--m-c)'),
          stat('Fat', t.f, 'var(--m-f)'),
          t.fib ? stat('Fibre', t.fib, 'var(--m-fib)') : null) : null),
    );
  }

  const stat = (label, v, hue) =>
    el('div', {},
      el('div.micro', { style: { color: hue } }, label),
      el('div.num', { style: { fontSize: '15px', marginTop: '2px' } }, g(v, 0) + ' g'));

  /* ── picking what goes in ── */
  const search = el('input', { type: 'search', placeholder: 'Search foods', autocomplete: 'off' });
  const hits = el('div.chips', { style: { marginTop: '8px' } });

  const addFood = f => {
    items.push({
      key: Math.random().toString(36).slice(2),
      name: f.n, brand: f.brand || '', ref: f.id,
      per100: f.per100,
      serv: (f.serv || []).map(x => Array.isArray(x) ? { l: x[0], g: x[1] } : x),
      grams: (f.serv && f.serv[0]) ? (Array.isArray(f.serv[0]) ? f.serv[0][1] : f.serv[0].g) : 100,
      method: 'weighed',      // you assembled it, so you can weigh it
      grade: f.grade || 'B',
    });
    search.value = ''; showHits(''); render();
  };

  const addDish = style => {
    const d = densityFor(store, style);
    items.push({
      key: Math.random().toString(36).slice(2),
      name: STYLES[style].label, brand: '', ref: 'dish:' + style,
      per100: per100For(style, d), serv: [], grams: 200,
      method: 'dish', grade: 'C', dish: style,
    });
    search.value = ''; showHits(''); render();
  };

  function showHits(q) {
    hits.replaceChildren();
    const lib = Object.values(store.library);
    if (q.length >= 2) {
      const n = q.toLowerCase();
      const pool = [...lib, ...FOODS].filter(f => (f.n || '').toLowerCase().includes(n)).slice(0, 14);
      pool.forEach(f => hits.append(el('button.chip', { type: 'button', onclick: () => addFood(f) }, f.n)));
      Object.keys(STYLES).filter(k => STYLES[k].label.toLowerCase().includes(n))
        .forEach(k => hits.append(el('button.chip', { type: 'button', onclick: () => addDish(k) },
          STYLES[k].label)));
      if (!hits.children.length) {
        hits.append(el('span.fine', {}, 'Nothing matches. Build it as a food first, from Add.'));
      }
      return;
    }
    lib.slice(0, 6).forEach(f => hits.append(el('button.chip', { type: 'button', onclick: () => addFood(f) }, f.n)));
    HANDY.map(id => BY_ID[id]).filter(Boolean)
      .forEach(f => hits.append(el('button.chip', { type: 'button', onclick: () => addFood(f) }, f.n)));
  }

  search.addEventListener('input', e => showHits(e.target.value));
  showHits('');

  const mealBox = el('div', {}, segmented(
    MEALS.map(x => ({ value: x, label: MEAL_LABELS[x] })), target, v => { target = v; }));

  render();

  const build = () => {
    const n = nameInput.value.trim();
    if (!n) { toast('Give the meal a name.', 'err'); return null; }
    if (!items.length) { toast('Add what goes in it.', 'err'); return null; }
    if (items.some(i => !(i.grams > 0))) { toast('Every item needs an amount.', 'err'); return null; }
    return { name: n, items: items.map(({ key, ...rest }) => rest), meal: target };
  };

  const s = sheet({
    title: meal ? 'Edit meal' : 'New meal',
    body: el('div', {},
      summary,
      field('Name', nameInput),

      el('div.section-label', {}, el('span.micro', {}, 'What goes in')),
      list,
      field('Add an item', search,
        'Weights are what you actually use. Include oil — a tablespoon is 120 kcal and it is the thing everyone leaves out.'),
      hits,

      el('div', { style: { height: '10px' } }),
      field('Usually eaten at', mealBox),
    ),
    foot: el('div.btn-row', {},
      el('button.btn', {
        onclick: () => {
          const b = build(); if (!b) return;
          if (meal) { updateMeal(meal.id, b); toast('Meal updated.'); }
          else { saveMeal(b.name, b.items, b.meal); toast(`"${b.name}" saved.`); }
          s.close(); onSaved();
        },
      }, meal ? 'Save changes' : 'Save only'),
      el('button.btn.primary', {
        onclick: () => {
          const b = build(); if (!b) return;
          let id = meal?.id;
          if (meal) updateMeal(meal.id, b);
          else id = saveMeal(b.name, b.items, b.meal).id;
          const n = logMeal(dayKey(), id, b.meal);
          toast(`${b.name} logged — ${n} items.`);
          s.close(); onSaved();
        },
      }, 'Save and log'),
    ),
  });

  return s;
}
