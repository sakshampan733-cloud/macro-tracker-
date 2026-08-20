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
  let items = meal ? meal.items.map(i => ({
    ...i,
    key: Math.random().toString(36).slice(2),
    // stored meals keep grams only, so reopen them in grams
    unit: 'g',
    qty: Math.round(i.grams),
  })) : [];
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

  /*
   * Rows and summary are rendered separately, on purpose.
   *
   * Typing a gram amount used to call a single render() that rebuilt the
   * whole list — including the input being typed into, which was destroyed
   * and recreated on every keystroke, so focus jumped away after each
   * digit. Amount changes now only recompute the summary; the rows are
   * rebuilt solely when an item is added or removed.
   */
  function renderRows() {
    list.replaceChildren();
    if (!items.length) {
      list.append(el('div', { style: { padding: '16px', color: 'var(--muted)', fontSize: '13.5px' } },
        'Nothing in it yet. Add what you actually put in — including the oil, which is usually the part that gets forgotten.'));
    }

    items.forEach((it, i) => {
      const sub = el('div.sub', {}, describe(it));

      /* Recompute grams from whatever unit is selected. Grams stay the
         stored value, so every calculation downstream is unaffected by
         which unit happened to be convenient at the time. */
      const recompute = () => {
        const item = items[i];
        item.grams = item.unit === 'g'
          ? item.qty
          : +(item.qty * (item.serv[item.unit]?.g || 100)).toFixed(1);
        sub.textContent = describe(item);
        renderSummary();
      };

      const qty = el('input.num-in', {
        type: 'number', inputmode: 'decimal', min: '0',
        step: it.unit === 'g' ? '5' : '0.5',
        value: String(it.qty),
        style: { width: '68px', flex: 'none' },
        'aria-label': 'Amount of ' + it.name,
        oninput: e => {
          items[i].qty = Math.max(0, +e.target.value || 0);
          recompute();   // never rebuilds the row — the caret lives here
        },
      });

      const unitSel = el('select', {
        style: { width: 'auto', flex: 'none', maxWidth: '132px', padding: '9px 8px' },
        'aria-label': 'Unit for ' + it.name,
        onchange: e => {
          const item = items[i];
          const v = e.target.value;
          item.unit = v === 'g' ? 'g' : +v;
          // Carry the amount across sensibly: switching to grams should
          // show the grams you already had, not the number 1.
          item.qty = item.unit === 'g' ? Math.round(item.grams) : 1;
          item.method = item.unit === 'g' ? 'weighed' : 'portion';
          qty.value = String(item.qty);
          qty.step = item.unit === 'g' ? '5' : '0.5';
          recompute();
        },
      });
      (it.serv || []).forEach((sv, si) => {
        unitSel.append(el('option', { value: String(si), selected: it.unit === si }, sv.l));
      });
      unitSel.append(el('option', { value: 'g', selected: it.unit === 'g' }, 'grams'));

      list.append(el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, it.name),
          sub),
        qty,
        unitSel,
        el('button.x-btn', {
          'aria-label': 'Remove ' + it.name,
          onclick: () => { items.splice(i, 1); render(); },
        }, icon('trash', 15)),
      ));
    });

    renderSummary();
  }

  const describe = it => {
    const m = macrosFor(it.per100, it.grams);
    const asGrams = it.unit === 'g' ? '' : ` · ${Math.round(it.grams)} g`;
    return `${Math.round(m.kcal)} kcal${asGrams} · ${Math.round(m.p)}P ${Math.round(m.c)}C ${Math.round(m.f)}F`;
  };

  function renderSummary() {
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

  /* Full rebuild — only when the set of items actually changes. */
  function render() { renderRows(); }

  const stat = (label, v, hue) =>
    el('div', {},
      el('div.micro', { style: { color: hue } }, label),
      el('div.num', { style: { fontSize: '15px', marginTop: '2px' } }, g(v, 0) + ' g'));

  /* ── picking what goes in ── */
  const search = el('input', { type: 'search', placeholder: 'Search foods', autocomplete: 'off' });
  const hits = el('div.chips', { style: { marginTop: '8px' } });

  const addFood = f => {
    const serv = (f.serv || []).map(x => Array.isArray(x) ? { l: x[0], g: x[1] } : x);
    // Default to the food's own household serving where it has one — "1
    // medium onion" is how the thing is actually eaten, and 199 of the 225
    // reference foods define one. Grams remain what gets stored.
    const first = serv[0];
    items.push({
      key: Math.random().toString(36).slice(2),
      name: f.n, brand: f.brand || '', ref: f.id,
      per100: f.per100, serv,
      unit: first ? 0 : 'g',        // index into serv, or 'g' for raw grams
      qty: 1,
      grams: first ? first.g : 100,
      method: first ? 'portion' : 'weighed',
      grade: f.grade || 'B',
    });
    search.value = ''; showHits(''); render();
  };

  const addDish = style => {
    const d = densityFor(store, style);
    items.push({
      key: Math.random().toString(36).slice(2),
      name: STYLES[style].label, brand: '', ref: 'dish:' + style,
      per100: per100For(style, d), serv: [], unit: 'g', qty: 200, grams: 200,
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
    return { name: n, items: items.map(({ key, qty, unit, ...rest }) => rest), meal: target };
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
