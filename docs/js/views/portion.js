/*
 * Logging one food.
 *
 * The single most-used screen in the app, so it is built for speed above
 * everything else. Three principles, taken from watching how this actually
 * gets used rather than from what is tidy to build:
 *
 *   1. Never require the keyboard. Fractions and steppers cover almost
 *      every real amount; typing is there when you want it, not demanded.
 *   2. The unit is whatever the food is actually served in. "One katori"
 *      and "one medium onion" are how food arrives; grams are for a scale.
 *   3. Show the consequence while the amount is being chosen, not after.
 *
 * The measurement method still decides the error bar, but it is now
 * inferred from HOW the amount was set — a tapped serving is a portion, a
 * typed weight is weighed — and only surfaced as a small chip you can
 * override. Asking outright was friction on every single entry.
 */

import {
  el, sheet, toast, grams, kcal, g, icon, append, explain,
} from '../ui.js';
import { haptic } from '../feedback.js';
import {
  METHODS, GRADE_MULT, macrosFor, addEntry, updateEntry, MEALS,
  mealForNow, dayKey, toggleFavourite, isFavourite,
} from '../store.js';
import { atwater } from '../data/foods.js';

const MEAL_META = {
  breakfast: { label: 'Breakfast', glyph: '☕' },
  lunch:     { label: 'Lunch',     glyph: '🥗' },
  snack:     { label: 'Snack',     glyph: '🥜' },
  dinner:    { label: 'Dinner',    glyph: '🍽' },
};

/* The fractions people actually eat in. */
const FRACTIONS = [
  ['¼', 0.25], ['⅓', 1 / 3], ['½', 0.5], ['⅔', 2 / 3],
  ['¾', 0.75], ['1', 1], ['1½', 1.5], ['2', 2], ['3', 3],
];

export function openPortion(food, {
  dateKey = dayKey(),
  meal = null,
  entry = null,
  onSaved = () => {},
} = {}) {
  const servings = (food.serv || []).map(s => Array.isArray(s) ? { l: s[0], g: s[1] } : s);
  const units = [...servings, { l: 'grams', g: 1, raw: true }];
  const grade = food.grade || (food.src === 'openfoodfacts' || food.barcode ? 'B' : 'C');
  const foodId = food.id || food.barcode || null;

  /* Start from the food's own serving where it has one — that is how it is
     eaten, and it means the first thing on screen is usually already right. */
  const startUnit = entry ? units.length - 1 : (servings.length ? 0 : units.length - 1);
  const startQty = entry
    ? entry.grams
    : (servings.length ? 1 : 100);

  const state = {
    unit: startUnit,
    qty: startQty,
    meal: entry?.meal ?? meal ?? mealForNow(),
    method: entry?.method ?? (servings.length ? (grade === 'B' ? 'label' : 'portion') : 'weighed'),
    manualMethod: !!entry,
  };

  const gramsNow = () => {
    const u = units[state.unit];
    return u.raw ? state.qty : +(state.qty * u.g).toFixed(1);
  };

  /* ── live readout ── */
  const readout = el('div');
  const amountBox = el('div');
  const methodChip = el('div');

  const inferMethod = () => {
    if (state.manualMethod) return;
    state.method = units[state.unit].raw ? 'weighed'
      : (grade === 'B' ? 'label' : 'portion');
  };

  const render = () => {
    const gr = gramsNow();
    const m = macrosFor(food.per100, gr);
    const meth = METHODS[state.method] || METHODS.portion;
    const sigma = m.kcal * meth.sigma * (GRADE_MULT[grade] || 1.3);

    readout.replaceChildren(
      el('div', { style: { textAlign: 'center' } },
        el('div.readout-main', { style: { fontSize: '44px' } }, kcal(m.kcal),
          el('span.readout-pm', {}, ` ±${Math.round(sigma)}`)),
        el('div.micro', { style: { marginTop: '2px' } },
          `kcal · ${grams(gr)} g`)),

      el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
                           gap: '10px', marginTop: '16px' } },
        macroPill('Protein', m.p, 'var(--m-p)'),
        macroPill('Carbs', m.c, 'var(--m-c)'),
        macroPill('Fat', m.f, 'var(--m-f)')),
    );

    methodChip.replaceChildren(
      el('button', {
        class: 'conf ' + state.method,
        style: { cursor: 'pointer' },
        title: meth.hint,
        onclick: cycleMethod,
      }, `${meth.short} · ±${Math.round(meth.sigma * (GRADE_MULT[grade] || 1.3) * 100)}%`),
    );
  };

  const macroPill = (name, v, hue) =>
    el('div', { style: { textAlign: 'center' } },
      el('div.micro', { style: { color: hue } }, name),
      el('div.num', { style: { fontSize: '17px', marginTop: '2px' } }, g(v, 1)),
      el('div.micro', { style: { marginTop: '1px' } }, 'g'));

  const cycleMethod = () => {
    const order = ['weighed', 'label', 'portion', 'estimate'];
    const i = order.indexOf(state.method);
    state.method = order[(i + 1) % order.length];
    state.manualMethod = true;
    render();
  };

  /* ── amount: steppers, a big number, and the unit it is in ── */
  const qtyField = el('input.num-in', {
    type: 'number', inputmode: 'decimal', step: 'any', min: '0',
    style: { fontSize: '30px', textAlign: 'center', fontWeight: '500',
             padding: '10px 6px', width: '100%' },
    'aria-label': 'Amount',
  });

  const step = dir => {
    const u = units[state.unit];
    // A gram step of 0.25 is useless; a katori step of 5 is absurd. The
    // sensible increment depends entirely on what is being counted.
    const inc = u.raw ? (state.qty >= 200 ? 10 : 5) : 0.25;
    state.qty = Math.max(0, +(state.qty + dir * inc).toFixed(2));
    syncAmount();
  };

  const cycleUnit = () => {
    const gr = gramsNow();
    state.unit = (state.unit + 1) % units.length;
    const u = units[state.unit];
    // keep the same real amount across the switch rather than resetting
    state.qty = u.raw ? Math.round(gr) : +(gr / u.g).toFixed(2);
    inferMethod();
    syncAmount();
  };

  function syncAmount() {
    qtyField.value = String(state.qty);
    const u = units[state.unit];
    unitBtn.replaceChildren(
      icon('scan', 13),
      el('span', {}, u.raw ? 'grams' : u.l),
    );
    render();
  }

  qtyField.addEventListener('input', () => {
    state.qty = Math.max(0, +qtyField.value || 0);
    render();          // never re-render the field itself while typing
  });

  const unitBtn = el('button.btn.sm', {
    style: { width: '100%', marginTop: '8px' },
    onclick: cycleUnit,
    title: 'Change unit',
  });

  const fractionRow = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '6px' },
  },
    ...FRACTIONS.map(([label, mult]) => el('button.btn.sm', {
      style: { padding: '9px 2px' },
      onclick: () => {
        const u = units[state.unit];
        // On a serving unit the fraction IS the quantity; in grams it
        // scales the food's own serving, which is the only sensible base.
        state.qty = u.raw
          ? Math.round((servings[0]?.g || 100) * mult)
          : +mult.toFixed(3);
        inferMethod();
        syncAmount();
      },
    }, label)),
  );

  const amountCard = el('div.tile', {},
    el('div.micro', { style: { marginBottom: '9px' } }, 'Quick portion'),
    fractionRow,
    el('div', { style: { display: 'grid', gridTemplateColumns: '52px 1fr 52px',
                         gap: '8px', alignItems: 'center', marginTop: '14px' } },
      el('button.btn', { style: { padding: '14px 0', fontSize: '20px' },
        'aria-label': 'Less', onclick: () => step(-1) }, '−'),
      qtyField,
      el('button.btn', { style: { padding: '14px 0', fontSize: '20px' },
        'aria-label': 'More', onclick: () => step(1) }, '+')),
    unitBtn,
  );

  /* ── which meal ── */
  const mealRow = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '7px' },
  });
  const syncMeal = () => {
    [...mealRow.children].forEach(c => {
      c.setAttribute('aria-pressed', String(c.dataset.meal === state.meal));
    });
  };
  for (const m of MEALS) {
    mealRow.append(el('button.chip', {
      type: 'button',
      dataset: { meal: m },
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center',
               gap: '3px', padding: '10px 4px', justifyContent: 'center' },
      onclick: () => { state.meal = m; syncMeal(); },
    },
      el('span', { style: { fontSize: '17px' } }, MEAL_META[m].glyph),
      el('span', { style: { fontSize: '10.5px' } }, MEAL_META[m].label)));
  }

  const check = atwater(food.per100);

  inferMethod();
  syncAmount();
  syncMeal();

  const s = sheet({
    title: food.n || food.name,
    body: el('div', {},
      el('div.tile.tile-hero', { style: { marginBottom: '12px' } }, readout),
      mealRow,
      el('div', { style: { height: '12px' } }),
      amountCard,
      el('div.between', { style: { marginTop: '10px' } },
        methodChip,
        el('button.btn.sm.ghost', {
          onclick: e => {
            if (!foodId) { toast('Save it to your foods first to favourite it.', 'err'); return; }
            toggleFavourite(foodId);
            e.currentTarget.textContent = isFavourite(foodId) ? '★ Favourite' : '☆ Favourite';
          },
        }, foodId && isFavourite(foodId) ? '★ Favourite' : '☆ Favourite')),

      check.off ? el('div.note.warn', { style: { marginTop: '12px' } },
        el('div', {},
          el('b', {}, 'These numbers do not add up'),
          el('div.fine', { style: { marginTop: '3px' } },
            `The label says ${check.stated} kcal per 100 g, but its own protein, carbohydrate and fat come to `
            + `${check.derived} — ${Math.abs(Math.round(check.delta * 100))}% out. Check the packet.`))) : null,

      explain('The method chip sets the error bar and is worked out from how you set the amount — '
        + 'a tapped serving is a portion, a typed weight is weighed. Tap it to override.',
        { style: { marginTop: '12px' } }),
    ),
    foot: el('button.btn.primary.block', {
      style: { fontSize: '17px', padding: '15px' },
      onclick: () => {
        const gr = gramsNow();
        if (!(gr > 0)) { haptic('warn'); toast('Set an amount first.', 'err'); return; }
        const payload = {
          name: food.n || food.name,
          brand: food.brand || '',
          ref: foodId,
          barcode: food.barcode || null,
          per100: food.per100,
          serv: servings,
          grams: gr,
          method: state.method,
          meal: state.meal,
          grade,
        };
        if (entry) { updateEntry(dateKey, entry.id, payload); toast('Updated.'); }
        else {
          addEntry(dateKey, payload);
          toast(`${Math.round(macrosFor(food.per100, gr).kcal)} kcal logged.`);
        }
        haptic('success');
        s.close();
        onSaved();
      },
    }, entry ? 'Save changes' : 'Log it'),
  });

  return s;
}
