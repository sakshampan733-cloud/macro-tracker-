/*
 * The Pot.
 *
 * The exact answer to food somebody else cooked, and it only has to be done
 * once per dish. Weigh what goes into the pot, weigh what comes out, and the
 * calories per gram of the finished dish follow — no statistics, no
 * estimating, no waiting weeks for a fit to converge.
 *
 * Water boils off, which is why the finished weight has to be measured
 * rather than assumed: the same ingredients cooked down to 1.4 kg are half
 * again as dense as at 2.1 kg, and that is the single biggest reason
 * home-cooked food gets mis-tracked.
 *
 * You are not being asked to cook. You are being asked, once, what went in.
 */

import {
  el, sheet, toast, kcal, grams, g, icon, field, append, confirmSheet, replaceKids } from '../ui.js';
import { get, saveFood, dayKey } from '../store.js';
import { FOODS, BY_ID, atwater } from '../data/foods.js';
import { openPortion } from './portion.js';

/* The things that actually go in an Indian pot, ordered by how much they
   move the answer. Fat is first because it is almost the whole variance. */
const COMMON = [
  'oil-generic', 'ghee', 'butter',
  'dal-toor-ckd', 'dal-moong-ckd', 'dal-masoor-ckd', 'chana-boiled',
  'rice-white-raw', 'onion', 'tomato', 'potato-boiled',
  'paneer', 'chicken-breast-raw', 'chicken-mince-raw',
  'milk-full', 'curd', 'cashew', 'peanuts-roast',
];

export function openPot({ onSaved = () => {} } = {}) {
  let items = [];            // { id, grams }
  let cookedG = 0;
  let servesNote = '';

  const nameInput = el('input', { type: 'text', placeholder: 'Amma’s dal' });
  const cookedInput = el('input.num-in', {
    type: 'number', inputmode: 'decimal', min: '0', step: '10',
    placeholder: 'weight of the finished dish',
    oninput: e => { cookedG = +e.target.value || 0; renderSummary(); },
  });

  const list = el('div.tile.flush');
  const summary = el('div');

  /* Grams from whichever unit is selected. Grams remain what the yield
     calculation actually uses, so the maths is untouched by the choice. */
  const gramsOf = it => {
    const f = BY_ID[it.id];
    if (it.unit === 'g') return it.qty;
    const sv = f?.serv?.[it.unit];
    return +(it.qty * (sv ? sv[1] : 100)).toFixed(1);
  };

  const raw = () => items.reduce((a, it) => {
    const f = BY_ID[it.id];
    if (!f) return a;
    const k = it.grams / 100;
    for (const key of ['kcal', 'p', 'c', 'f', 'fib', 'sug', 'sat', 'na']) {
      a[key] = (a[key] || 0) + (f.per100[key] || 0) * k;
    }
    a.grams += it.grams;
    return a;
  }, { grams: 0 });

  /*
   * Same split as the meal builder: typing an amount must not rebuild the
   * row containing the caret, or focus is lost after every digit.
   */
  function renderRows() {
    // pots saved before units existed stored grams only
    items.forEach(it => {
      if (it.unit === undefined) { it.unit = 'g'; it.qty = Math.round(it.grams); }
    });
    list.replaceChildren();
    if (!items.length) {
      list.append(el('div', { style: { padding: '16px', color: 'var(--muted)', fontSize: '13.5px' } },
        'Nothing in the pot yet. Add the oil first — it is usually most of what you are missing.'));
    }
    items.forEach((it, i) => {
      const f = BY_ID[it.id];
      const describe = () => {
        const m = (f.per100.kcal || 0) * it.grams / 100;
        return `${grams(it.grams)} g · ${Math.round(m)} kcal`;
      };
      const sub = el('div.sub', {}, describe());
      const qty = el('input.num-in', {
        type: 'number', inputmode: 'decimal', min: '0',
        step: it.unit === 'g' ? '5' : '0.5',
        value: String(it.qty ?? it.grams),
        style: { width: '66px', flex: 'none' },
        'aria-label': 'Amount of ' + f.n,
        oninput: e => {
          items[i].qty = Math.max(0, +e.target.value || 0);
          items[i].grams = gramsOf(items[i]);
          sub.textContent = describe();
          renderSummary();      // never renderRows() — the caret is in here
        },
      });

      /* Ingredients get measured the way a kitchen actually measures them —
         a spoon of oil, one onion — rather than forced onto a scale. */
      const unitSel = el('select', {
        style: { width: 'auto', flex: 'none', maxWidth: '124px', padding: '9px 8px' },
        'aria-label': 'Unit for ' + f.n,
        onchange: e => {
          const v = e.target.value;
          items[i].unit = v === 'g' ? 'g' : +v;
          items[i].qty = items[i].unit === 'g' ? Math.round(items[i].grams) : 1;
          items[i].grams = gramsOf(items[i]);
          qty.value = String(items[i].qty);
          qty.step = items[i].unit === 'g' ? '5' : '0.5';
          sub.textContent = describe();
          renderSummary();
        },
      });
      (f.serv || []).forEach((sv, si) => {
        unitSel.append(el('option', { value: String(si), selected: it.unit === si }, sv[0]));
      });
      unitSel.append(el('option', { value: 'g', selected: it.unit === 'g' }, 'grams'));

      list.append(el('div.row', {},
        el('span.grow', {},
          el('div.title', {}, f.n),
          sub),
        qty,
        unitSel,
        el('button.x-btn', { 'aria-label': 'Remove ' + f.n,
          onclick: () => { items.splice(i, 1); render(); } }, icon('trash', 15))));
    });

    renderSummary();
  }

  function renderSummary() {
    const r = raw();
    const yielded = cookedG > 0 ? cookedG : r.grams;
    const density = yielded > 0 ? r.kcal / yielded : 0;
    const lossPct = r.grams > 0 && cookedG > 0 ? (1 - cookedG / r.grams) * 100 : null;

    replaceKids(summary, 
      el('div.tile', {},
        el('div.readout', {},
          el('div', {},
            el('div.micro', {}, 'Whole pot'),
            el('div.readout-main', { style: { fontSize: '34px' } }, kcal(r.kcal))),
          el('div.readout-side', {},
            el('div.micro', {}, 'Per gram'),
            el('div.v', {}, density ? density.toFixed(2) + ' kcal' : '—'))),
        el('div.fine', { style: { marginTop: '8px' } },
          cookedG > 0
            ? `${grams(r.grams)} g went in, ${grams(cookedG)} g came out — `
              + `${lossPct > 0 ? `${lossPct.toFixed(0)}% cooked off as water` : 'it gained water'}. `
              + `A 200 g serving of this is ${Math.round(density * 200)} kcal.`
            : 'Weigh the finished dish, pot and all, then subtract the empty pot. Without that the density is a guess.'),
        r.kcal > 0 ? el('div', { style: { display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' } },
          stat('Protein', (r.p / yielded) * 100, 'var(--m-p)'),
          stat('Carbs', (r.c / yielded) * 100, 'var(--m-c)'),
          stat('Fat', (r.f / yielded) * 100, 'var(--m-f)')) : null),
    );
  }

  function render() { renderRows(); }

  const stat = (label, per100, hue) =>
    el('div', {},
      el('div.micro', { style: { color: hue } }, label),
      el('div.num', { style: { fontSize: '15px', marginTop: '2px' } }, g(per100, 1) + ' g'),
      el('div.micro', { style: { marginTop: '1px' } }, 'per 100 g'));

  /* ingredient picker */
  const search = el('input', { type: 'search', placeholder: 'Search ingredients', autocomplete: 'off' });
  const hits = el('div.chips', { style: { marginTop: '8px' } });

  const showHits = q => {
    hits.replaceChildren();
    const pool = q.length >= 2
      ? FOODS.filter(f => f.n.toLowerCase().includes(q.toLowerCase())).slice(0, 12)
      : COMMON.map(id => BY_ID[id]).filter(Boolean);
    for (const f of pool) {
      hits.append(el('button.chip', {
        type: 'button',
        onclick: () => {
          const exists = items.find(i => i.id === f.id);
          if (exists) { exists.qty += 1; exists.grams = gramsOf(exists); }
          else {
            const hasServ = !!(f.serv && f.serv[0]);
            items.push({
              id: f.id,
              unit: hasServ ? 0 : 'g',
              qty: hasServ ? 1 : 100,
              grams: hasServ ? f.serv[0][1] : 100,
            });
          }
          search.value = ''; showHits(''); render();
        },
      }, f.n));
    }
  };
  search.addEventListener('input', e => showHits(e.target.value));
  showHits('');

  render();

  const s = sheet({
    title: 'Build a pot',
    body: el('div', {},
      el('div.note', {}, el('div.fine', {},
        'Do this once per dish, on a day you can ask what went in. '
        + 'After that you only ever weigh your own serving, and the number is exact — '
        + 'no ranges, no waiting for the app to work it out.')),

      field('What is the dish?', nameInput),

      el('div.section-label', {}, el('span.micro', {}, 'What went in')),
      list,
      field('Add an ingredient', search),
      hits,

      el('div.section-label', {}, el('span.micro', {}, 'What came out')),
      field('Finished weight (g)', cookedInput,
        'The cooked dish on a scale, minus the empty pot. Water boiling off is what sets the density.'),

      summary,
    ),
    foot: el('button.btn.primary.block', {
      onclick: () => {
        const name = nameInput.value.trim();
        if (!name) { toast('Give the dish a name.', 'err'); return; }
        if (!items.length) { toast('Add what went into the pot.', 'err'); return; }
        if (!(cookedG > 0)) { toast('Weigh the finished dish.', 'err'); return; }

        const r = raw();
        const k = 100 / cookedG;
        const per100 = {};
        for (const key of ['kcal', 'p', 'c', 'f', 'fib', 'sug', 'sat', 'na']) {
          per100[key] = +((r[key] || 0) * k).toFixed(2);
        }

        const food = saveFood({
          n: name,
          brand: 'from your kitchen',
          basis: 'as-served',
          per100,
          serv: [{ l: '1 serving (200 g)', g: 200 }, { l: '100 g', g: 100 }],
          grade: 'B',                    // weighed ingredients, weighed yield
          grp: 'Yours',
          pot: { items, cookedG, rawG: r.grams },
        });
        toast(`${name} saved at ${(r.kcal / cookedG).toFixed(2)} kcal/g.`);
        s.close();
        onSaved();
        openPortion(food, { onSaved });
      },
    }, 'Save the dish'),
  });

  return s;
}
