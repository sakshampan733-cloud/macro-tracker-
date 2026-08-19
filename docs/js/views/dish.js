/*
 * Logging food somebody else cooked.
 *
 * Two inputs only: what it is, and what your serving weighs. No recipe, no
 * ingredient list, no pretending you know how much oil went in the pot.
 * The app carries the range honestly and narrows it as it learns.
 */

import {
  el, sheet, toast, kcal, grams, g, icon, field, segmented, append,
} from '../ui.js';
import { addEntry, updateEntry, MEALS, mealForNow, dayKey, get } from '../store.js';
import { STYLES, STYLE_KEYS, fromStyle, per100For, densityFor, solveDensities } from '../dishes.js';
import { openPot } from './pot.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

/* A katori is about 150 g of dal, a serving spoon of rice about 100 g.
   Offered as a starting point, not as a substitute for the scale. */
const QUICK_G = [100, 150, 200, 250, 300];

export function openDish({ dateKey = dayKey(), meal = null, entry = null, onSaved = () => {} } = {}) {
  const store = get();
  const solved = solveDensities(store);

  let state = {
    style: entry?.dish || 'dal-regular',
    grams: entry?.grams || 200,
    meal: entry?.meal || meal || mealForNow(),
    name: entry?.name || '',
  };

  const readout = el('div');
  const provenance = el('div');

  const render = () => {
    const d = densityFor(store, state.style, solved);
    const m = fromStyle(state.style, state.grams, d);
    const lo = Math.round(m.kcal - m.sigmaKcal);
    const hi = Math.round(m.kcal + m.sigmaKcal);

    readout.replaceChildren(
      el('div.readout', {},
        el('div', {},
          el('div.micro', {}, 'Energy'),
          el('div.readout-main', {}, kcal(m.kcal),
            el('span.readout-pm', {}, ` ±${Math.round(m.sigmaKcal)}`))),
        el('div.readout-side', {},
          el('div.micro', {}, 'Serving'),
          el('div.v', {}, grams(state.grams) + ' g'))),
      el('div.fine', { style: { marginTop: '6px' } },
        `Somewhere between ${lo} and ${hi} kcal, at ${d.mean.toFixed(2)} kcal per gram.`),
      el('div', { style: { display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '12px' } },
        chip('Protein', m.p, 'var(--m-p)'),
        chip('Carbs', m.c, 'var(--m-c)'),
        chip('Fat', m.f, 'var(--m-f)')),
    );

    provenance.replaceChildren(
      d.source === 'yours'
        ? el('div.note.good', {},
            el('div', {},
              el('b', {}, `Calibrated to your kitchen`),
              el('div.fine', { style: { marginTop: '3px' } },
                `Worked out from ${d.servings} serving${d.servings === 1 ? '' : 's'} and the way your weight actually moved. `
                + `Your ${STYLES[state.style].label.toLowerCase()} runs ${d.mean.toFixed(2)} kcal/g `
                + `against a book figure of ${((STYLES[state.style].lo + STYLES[state.style].hi) / 2).toFixed(2)}.`)))
        : el('div.note.info', {},
            el('div', {},
              el('b', {}, 'Using the published range'),
              el('div.fine', { style: { marginTop: '3px' } },
                `This is an honest ±${Math.round((m.sigmaKcal / m.kcal) * 100)}% — better than not logging it, and worse than it needs to be. `
                + `To make it exact, catch the dish once at the pot: weigh what goes in, weigh what comes out, and every serving after that is precise.`),
              el('button.btn.sm', { style: { marginTop: '10px' },
                onclick: () => { s.close(); openPot({ onSaved }); } }, 'Build this pot once'))),
    );
  };

  const chip = (name, v, hue) =>
    el('div', {},
      el('div.micro', { style: { color: hue } }, name),
      el('div.num', { style: { fontSize: '15px', marginTop: '1px' } }, g(v, 0) + ' g'));

  /* style picker, grouped so the list is scannable */
  const styleBox = el('div.chips');
  const syncStyle = () => [...styleBox.children].forEach(c =>
    c.setAttribute('aria-pressed', String(c.dataset.style === state.style)));

  for (const k of STYLE_KEYS) {
    styleBox.append(el('button.chip', {
      type: 'button',
      dataset: { style: k },
      'aria-pressed': String(k === state.style),
      onclick: () => { state.style = k; syncStyle(); render(); },
    }, STYLES[k].label));
  }

  const gramInput = el('input.num-in', {
    type: 'number', inputmode: 'decimal', min: '0', step: '5',
    value: String(state.grams),
    oninput: e => { state.grams = Math.max(0, +e.target.value || 0); render(); },
  });

  const quick = el('div.chips', { style: { marginTop: '8px' } },
    ...QUICK_G.map(v => el('button.chip', {
      type: 'button',
      onclick: () => { state.grams = v; gramInput.value = String(v); render(); },
    }, v + ' g')));

  const nameInput = el('input', {
    type: 'text', value: state.name,
    placeholder: STYLES[state.style].label,
    oninput: e => { state.name = e.target.value; },
  });

  const mealBox = segmented(MEALS.map(m => ({ value: m, label: MEAL_LABELS[m] })),
    state.meal, v => { state.meal = v; });

  render();

  const s = sheet({
    title: entry ? 'Edit home dish' : 'Home dish',
    body: el('div', {},
      el('div.tile', { style: { marginBottom: '14px' } }, readout),

      field('What is it?', styleBox, STYLES[state.style].hint),
      field('What does your serving weigh?', gramInput,
        'Put the katori on a kitchen scale, tare it empty first. This is the one measurement that matters.'),
      quick,

      el('div', { style: { height: '14px' } }),
      provenance,
      field('Call it something (optional)', nameInput),
      field('Meal', mealBox),

      el('div.note', {},
        el('div.fine', {},
          'You are not being asked for the recipe, because you do not have it. '
          + 'What matters is how many calories are in a gram of your household’s cooking, '
          + 'and that stays put because the same person cooks it the same way.')),
    ),
    foot: el('button.btn.primary.block', {
      onclick: () => {
        if (!(state.grams > 0)) { toast('Weigh the serving first.', 'err'); return; }
        const d = densityFor(store, state.style, solved);
        const payload = {
          name: state.name.trim() || STYLES[state.style].label,
          brand: '',
          dish: state.style,
          density: d.mean,
          densitySd: d.sd,
          per100: per100For(state.style, d),
          serv: [],
          grams: state.grams,
          method: 'dish',
          grade: 'C',
          meal: state.meal,
          ref: 'dish:' + state.style,
        };
        if (entry) { updateEntry(dateKey, entry.id, payload); toast('Updated.'); }
        else {
          addEntry(dateKey, payload);
          const m = fromStyle(state.style, state.grams, d);
          toast(`${Math.round(m.kcal)} ±${Math.round(m.sigmaKcal)} kcal logged.`);
        }
        s.close();
        onSaved();
      },
    }, entry ? 'Save changes' : 'Log it'),
  });

  return s;
}

/* ── Calibration panel, shown on Body ───────────────────────────────── */

export function calibrationTile(store) {
  const solved = solveDensities(store);

  if (!solved.ready) {
    if (solved.reason === 'no home dishes logged') return null;

    const stuck = solved.identifiable === false;
    return el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Home cooking')),
      el('div.tile', {},
        el('div', { style: { fontSize: '13.5px', color: 'var(--text-2)', lineHeight: '1.55' } },
          stuck ? 'This cannot be worked out from your weight alone.' : `Still working it out — ${solved.reason}.`),
        el('div.fine', { style: { marginTop: '8px' } },
          stuck
            ? solved.remedy
            : 'Weigh the serving each time and weigh yourself most mornings.'),
        el('button.btn.sm', { style: { marginTop: '12px' },
          onclick: () => openPot({ onSaved: () => location.reload() }) }, 'Build a pot instead')));
  }

  const rows = Object.entries(solved.styles)
    .sort((a, b) => b[1].servings - a[1].servings);

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Your kitchen, calibrated')),
    el('div.tile.flush', {},
      ...rows.map(([key, r]) => {
        const pct = Math.round(r.learned * 100);
        const vsBook = ((r.mean - r.prior) / r.prior) * 100;
        return el('div.row', {},
          el('span.grow', {},
            el('div.title', {}, r.label),
            el('div.sub', {},
              `${r.servings} serving${r.servings === 1 ? '' : 's'} · `
              + (pct > 15
                  ? `${pct}% yours · ${vsBook >= 0 ? '+' : ''}${vsBook.toFixed(0)}% vs the book`
                  : 'still mostly the book figure'))),
          el('span.kcal', {}, r.mean.toFixed(2),
            el('div.micro', { style: { marginTop: '2px' } }, `±${r.sd.toFixed(2)} kcal/g`)));
      })),
    el('div.note', {}, el('div.fine', {},
      `Solved across ${solved.blocks} weeks of logging. `
      + `The same fit puts your maintenance at ${kcal(solved.tdee.mean)} ±${Math.round(solved.tdee.sd)} kcal, `
      + `which is an independent check on the figure on this screen — if the two disagree badly, trust neither yet.`)));
}
