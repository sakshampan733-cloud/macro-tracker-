/*
 * The entry editor.
 *
 * Every logged item passes through here, which is why it asks for two
 * things rather than one: how much, and how you know. A number without a
 * method is a guess wearing a lab coat.
 */

import { el, sheet, toast, grams, kcal, g, icon, segmented, field } from '../ui.js';
import { METHODS, GRADE_MULT, macrosFor, addEntry, updateEntry, MEALS, mealForNow, dayKey } from '../store.js';
import { atwater } from '../data/foods.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

export function openPortion(food, {
  dateKey = dayKey(),
  meal = null,
  entry = null,
  onSaved = () => {},
} = {}) {
  const servings = (food.serv || []).map(s => Array.isArray(s) ? { l: s[0], g: s[1] } : s);
  const grade = food.grade || (food.src === 'openfoodfacts' ? 'B' : 'C');

  let state = {
    grams: entry?.grams ?? (servings[0]?.g ?? 100),
    method: entry?.method ?? (servings.length ? (grade === 'B' ? 'label' : 'portion') : 'weighed'),
    meal: entry?.meal ?? meal ?? mealForNow(),
    servIndex: entry ? -1 : (servings.length ? 0 : -1),
    mult: 1,
  };

  const check = atwater(food.per100);

  /* ── live readout ── */
  const readout = el('div');
  const uncertainty = el('div');

  const render = () => {
    const m = macrosFor(food.per100, state.grams);
    const meth = METHODS[state.method];
    const sigma = m.kcal * meth.sigma * (GRADE_MULT[grade] || 1.3);
    const pctErr = m.kcal ? (sigma / m.kcal) * 100 : 0;

    readout.replaceChildren(
      el('div.readout', {},
        el('div', {},
          el('div.micro', {}, 'Energy'),
          el('div.readout-main', {}, kcal(m.kcal),
            el('span.readout-pm', {}, ` ±${Math.round(sigma)}`))),
        el('div.readout-side', {},
          el('div.micro', {}, 'Amount'),
          el('div.v', {}, grams(state.grams) + ' g'))),
      el('div', { style: { display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '10px' } },
        macroChip('Protein', m.p, 'var(--m-p)'),
        macroChip('Carbs', m.c, 'var(--m-c)'),
        macroChip('Fat', m.f, 'var(--m-f)'),
        m.fib ? macroChip('Fibre', m.fib, 'var(--m-fib)') : null),
    );

    uncertainty.replaceChildren(
      el('div.note', {},
        el('div', {},
          el('b', {}, `${meth.label} · ±${pctErr.toFixed(0)}%`),
          el('div', { style: { color: 'var(--muted)', fontSize: '12.5px', marginTop: '3px' } },
            errorSentence(state.method, grade, sigma))))
    );
  };

  const macroChip = (name, v, colour) =>
    el('div', {},
      el('div.micro', { style: { color: colour } }, name),
      el('div.num', { style: { fontSize: '15px', marginTop: '1px' } }, g(v, 1) + ' g'));

  /* ── amount controls ── */
  const gramInput = el('input.num-in', {
    type: 'number', inputmode: 'decimal', min: '0', step: '1',
    value: String(Math.round(state.grams)),
    oninput: e => {
      state.grams = Math.max(0, +e.target.value || 0);
      state.servIndex = -1;
      state.method = 'weighed';
      syncChips(); syncMethod(); render();
    },
  });

  const servChips = el('div.chips');
  const syncChips = () => {
    [...servChips.children].forEach((c, i) => c.setAttribute('aria-pressed', String(i === state.servIndex)));
  };
  servings.forEach((s, i) => {
    servChips.append(el('button.chip', {
      type: 'button', 'aria-pressed': String(i === state.servIndex),
      onclick: () => {
        state.servIndex = i;
        state.grams = s.g * state.mult;
        state.method = grade === 'B' ? 'label' : 'portion';
        gramInput.value = String(Math.round(state.grams));
        syncChips(); syncMethod(); render();
      },
    }, s.l));
  });

  const quickMult = el('div.chips', { style: { marginTop: '8px' } },
    ...[0.5, 1, 1.5, 2, 3].map(mult => el('button.chip', {
      type: 'button',
      onclick: () => {
        const base = state.servIndex >= 0 ? servings[state.servIndex].g : 100;
        state.mult = mult;
        state.grams = +(base * mult).toFixed(1);
        gramInput.value = String(Math.round(state.grams));
        render();
      },
    }, `×${mult}`)));

  /* ── method ── */
  const methodBox = el('div');
  const syncMethod = () => {
    methodBox.replaceChildren(segmented(
      Object.entries(METHODS).map(([k, v]) => ({ value: k, label: v.short })),
      state.method,
      v => { state.method = v; render(); },
    ));
  };
  syncMethod();

  const mealBox = segmented(
    MEALS.map(m => ({ value: m, label: MEAL_LABELS[m] })),
    state.meal,
    v => { state.meal = v; },
  );

  render();
  syncChips();

  const body = el('div', {},
    el('div.tile', { style: { marginBottom: '14px' } }, readout),

    servings.length ? field('Serving', servChips) : null,
    field('Weight in grams', gramInput,
      servings.length ? 'Typing a weight switches the method to Weighed.' : null),
    quickMult,

    el('div', { style: { height: '14px' } }),
    field('How do you know the amount?', methodBox,
      METHODS[state.method].hint),
    uncertainty,

    field('Meal', mealBox),

    check.off ? el('div.note.warn', {},
      el('div', {},
        el('b', {}, 'These numbers do not add up'),
        el('div', { style: { color: 'var(--muted)', fontSize: '12.5px', marginTop: '3px' } },
          `The label says ${check.stated} kcal per 100 g, but its own protein, carbohydrate and fat come to ${check.derived}. `
          + `That is ${Math.abs(Math.round(check.delta * 100))}% out. Check the packet before trusting this one.`))) : null,
  );

  const s = sheet({
    title: food.n || food.name,
    body,
    foot: el('button.btn.primary.block', {
      onclick: () => {
        if (!(state.grams > 0)) { toast('Enter an amount first.', 'err'); return; }
        const payload = {
          name: food.n || food.name,
          brand: food.brand || '',
          ref: food.id || food.barcode || null,
          barcode: food.barcode || null,
          per100: food.per100,
          serv: servings,
          grams: state.grams,
          method: state.method,
          meal: state.meal,
          grade,
        };
        if (entry) {
          updateEntry(dateKey, entry.id, payload);
          toast('Entry updated.');
        } else {
          addEntry(dateKey, payload);
          toast(`${Math.round(macrosFor(food.per100, state.grams).kcal)} kcal logged.`);
        }
        s.close();
        onSaved();
      },
    }, entry ? 'Save changes' : 'Log it'),
  });

  return s;
}

function errorSentence(method, grade, sigma) {
  const base = {
    weighed: 'A scale is the tightest this gets.',
    label: 'Packaged servings are tightly regulated but portions still vary.',
    portion: 'Household portions vary by roughly a tenth either way.',
    estimate: 'Eyeballed amounts are routinely a quarter out in either direction.',
  }[method];
  const dish = grade === 'D'
    ? ' Restaurant and street food adds a lot on top — oil is the big unknown.'
    : grade === 'C' ? ' Composite dishes vary with whoever cooked them.' : '';
  return `${base}${dish} Roughly ±${Math.round(sigma)} kcal on this entry.`;
}
