/*
 * Logging a saved meal.
 *
 * A saved meal is a recipe, not a receipt. You made fried rice once with
 * 200 g of rice; tonight you had more. Tapping the meal used to log the
 * saved amounts silently and immediately, which meant the only way to be
 * accurate was to not use meals at all.
 *
 * So this opens instead: scale the whole plate, override any single
 * ingredient, choose the sitting, choose the day. Nothing is written until
 * you say so.
 */

import { el, clear, icon, kcal, toast, sheet, segmented } from '../ui.js';
import {
  logMeal, mealTotals, MEALS, dayKey, shiftDay, macrosFor, entryMacros,
} from '../store.js';
import { haptic } from '../feedback.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
const PRESETS = [['½', 0.5], ['¾', 0.75], ['1', 1], ['1½', 1.5], ['2', 2]];

export function openMealLogger(meal, { dateKey = dayKey(), onSaved = () => {} } = {}) {
  const state = {
    scale: 1,
    grams: {},                       // index -> grams, set only when you edit one
    meal: meal.meal || 'lunch',
    date: dateKey,
  };

  const gramsFor = i => state.grams[i] != null
    ? state.grams[i]
    : (meal.items[i].grams || 0) * state.scale;

  /* Totals recompute from whatever the rows currently say, so the number at
     the top is always the meal you are actually about to log. */
  const totalsNow = () => {
    const sum = { kcal: 0, p: 0, c: 0, f: 0 };
    meal.items.forEach((it, i) => {
      const m = macrosFor(it.per100, gramsFor(i));
      for (const k in sum) sum[k] += m[k] || 0;
    });
    return sum;
  };

  const readout = el('div.readout');
  const rows = el('div.tile.flush');

  function paintReadout() {
    const t = totalsNow();
    readout.replaceChildren(
      el('div', {},
        el('div.micro', {}, 'This serving'),
        el('div.readout-main', { style: { fontSize: '34px' } }, Math.round(t.kcal))),
      el('div.readout-side', {},
        el('div.micro', {}, 'P · C · F'),
        el('div.v', {}, `${Math.round(t.p)} · ${Math.round(t.c)} · ${Math.round(t.f)}`)));
  }

  /* Only the edited row is rebuilt. Redrawing the list on every keystroke
     is what used to throw the caret out of the box mid-number. */
  function paintRow(i) {
    const row = rows.children[i];
    if (!row) return;
    const g = gramsFor(i);
    row.querySelector('.mi-amt').value = Math.round(g);
    row.querySelector('.mi-kcal').textContent = kcal(macrosFor(meal.items[i].per100, g).kcal);
    row.classList.toggle('is-edited', state.grams[i] != null);
  }

  function paintAll() {
    meal.items.forEach((_, i) => paintRow(i));
    paintReadout();
  }

  meal.items.forEach((it, i) => {
    const amt = el('input.mi-amt', {
      type: 'number', inputMode: 'decimal', min: '0', step: '5',
      value: String(Math.round(gramsFor(i))),
      oninput: e => {
        const v = parseFloat(e.target.value);
        state.grams[i] = isNaN(v) ? 0 : v;
        // this row's own kcal, and the header — never the row itself
        const row = rows.children[i];
        row.querySelector('.mi-kcal').textContent =
          kcal(macrosFor(it.per100, state.grams[i]).kcal);
        row.classList.add('is-edited');
        paintReadout();
      },
    });

    rows.append(el('div.meal-item', {},
      el('div.grow', {},
        el('div.title', {}, it.name),
        el('div.sub', {}, it.brand || `saved at ${Math.round(it.grams)} g`)),
      amt,
      el('span.micro', {}, 'g'),
      el('span.mi-kcal.num', {}, kcal(macrosFor(it.per100, gramsFor(i)).kcal))));
  });

  const scaleRow = el('div.scale-row');
  PRESETS.forEach(([label, mult]) => {
    scaleRow.append(el('button.scale-btn' + (mult === 1 ? '.is-on' : ''), {
      onclick: e => {
        state.scale = mult;
        state.grams = {};                       // a new scale replaces manual edits
        [...scaleRow.children].forEach(b => b.classList.remove('is-on'));
        e.currentTarget.classList.add('is-on');
        haptic('select');
        paintAll();
      },
    }, label));
  });

  const dateLabelEl = el('span.num', {}, dateWord(state.date));
  const shift = n => {
    const next = shiftDay(state.date, n);
    if (next > dayKey()) return;                // no logging into the future
    state.date = next;
    dateLabelEl.textContent = dateWord(state.date);
    haptic('tap');
  };

  paintReadout();

  const sh = sheet({
    title: meal.name,
    body: el('div', {},
      el('div.tile.tile-hero', {}, readout),

      el('div.section-label', {}, el('span.micro', {}, 'Portion')),
      scaleRow,

      el('div.section-label', {}, el('span.micro', {}, 'What went in')),
      rows,
      el('div.fine', { style: { marginTop: '8px' } },
        'Change any amount and only that ingredient moves. Picking a portion again resets them.'),

      el('div.section-label', {}, el('span.micro', {}, 'Sitting')),
      segmented(MEALS.map(m => ({ value: m, label: MEAL_LABELS[m] })), state.meal,
        v => { state.meal = v; }, { wrap: true }),

      el('div.section-label', {}, el('span.micro', {}, 'Day')),
      el('div.tile.between', {},
        el('button.btn.sm', { onclick: () => shift(-1) }, icon('chevron-left', 16), 'Earlier'),
        dateLabelEl,
        el('button.btn.sm', { onclick: () => shift(1) }, 'Later', icon('chevron', 16))),
    ),
    foot: el('button.btn.primary.block', {
      style: { fontSize: '17px', padding: '15px' },
      onclick: () => {
        const t = totalsNow();
        if (!(t.kcal > 0)) { haptic('warn'); toast('Nothing to log.', 'err'); return; }
        logMeal(state.date, meal.id, {
          targetMeal: state.meal,
          scale: state.scale,
          grams: state.grams,
        });
        haptic('success');
        toast(`${meal.name} · ${Math.round(t.kcal)} kcal logged.`);
        sh.close();
        onSaved();
      },
    }, 'Log it'),
  });

  return sh;
}

function dateWord(key) {
  const today = dayKey();
  if (key === today) return 'Today';
  if (key === shiftDay(today, -1)) return 'Yesterday';
  const d = new Date(key + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
