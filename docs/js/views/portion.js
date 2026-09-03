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
  METHODS, shiftDay, GRADE_MULT, macrosFor, addEntry, updateEntry, MEALS,
  mealForNow, dayKey, toggleFavourite, isFavourite, saveFood, get, commit,
} from '../store.js';
import { atwater, BY_ID } from '../data/foods.js';
import { qualityFor, LEUCINE_THRESHOLD_G } from '../data/quality.js';

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
  /*
   * A food with no nutrition panel cannot be portioned, and every
   * calculation downstream assumes one exists. The callers all check
   * before opening, but a function that throws a TypeError deep in a
   * chart helper when handed an incomplete record is a trap for the next
   * caller — say so plainly instead.
   */
  if (!food || !food.per100) {
    toast('That food has no nutrition panel yet. Build it from the packet.', 'err');
    return null;
  }

  /*
   * A panel that exists but has no energy in it is the same trap wearing a
   * disguise, and it is the one that actually bit: Open Food Facts returns
   * a per100 object for entries nobody has filled in, so the check above
   * passes, macrosFor turns every null into a 0, and the packet logs as
   * free food. Nothing on screen said so — the sheet opened normally and
   * the day's total simply did not move.
   *
   * Energy is the one field with no sensible default. Refuse here, at the
   * single door every food goes through, rather than at each caller.
   */
  if (food.per100.kcal == null) {
    toast('No calories on that entry — fill it in from the packet.', 'err');
    return null;
  }

  const servings = (food.serv || []).map(s => Array.isArray(s) ? { l: s[0], g: s[1] } : s);
  const units = [...servings, { l: 'grams', g: 1, raw: true }];
  const grade = food.grade || (food.src === 'openfoodfacts' || food.barcode ? 'B' : 'C');
  const foodId = food.id || food.barcode || null;

  /*
   * Is this food already yours?
   *
   * A scanned product exists only in the sheet you are looking at until
   * something writes it down. Nothing did: portion.js logged an entry and
   * never touched the library, so a scanned food survived only because
   * "Recent" is computed from the log. Scan something and close without
   * logging and it was gone — you had to eat it to keep it.
   *
   * Reference foods are excluded: they are already available everywhere
   * and copying them into your library would just create duplicates.
   */
  const isReference = !!(foodId && BY_ID[foodId]);

  /*
   * Already saved?
   *
   * Not by key: saveFood mints a fresh 'my:' id, so a scanned product is
   * never stored under the id it arrived with, and looking it up that way
   * offered to save it again every single time. A barcode is the thing
   * that actually identifies it; name is the fallback for foods built by
   * hand, which have no barcode at all.
   */
  const inLibrary = Object.values(get().library).some(f =>
    (food.barcode && f.barcode && f.barcode === food.barcode)
    || (f.n || '').toLowerCase() === String(food.n || food.name || '').toLowerCase());
  /* inLibrary gates the action; it has to gate the button too, or a food
     you already saved keeps offering to save itself. */
  const savable = !entry && !isReference && !inLibrary
    && !!(food.n || food.name) && !!food.per100;

  let saved = inLibrary;

  const rememberFood = () => {
    if (!savable || saved) return null;
    const rec = saveFood({
      n: food.n || food.name,
      brand: food.brand || '',
      per100: food.per100,
      barcode: food.barcode || null,
      serv: servings,
      grade,
      src: food.src || (food.barcode ? 'openfoodfacts' : 'custom'),
    });
    saved = true;
    return rec;
  };

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
    spreadDays: 1,
  };

  /*
   * How many days this one amount is spread across.
   *
   * A big packet of chips is not a meal, it is a fortnight of small
   * handfuls, and weighing each handful is a chore nobody sustains — so
   * the packet goes unlogged entirely, which is worse than logging it
   * roughly. Logging the whole packet on the day it runs out and dividing
   * it back over the days it was open puts the calories where they
   * happened, at the cost of not knowing exactly which day got which
   * handful.
   */
  const gramsNow = () => {
    const u = units[state.unit];
    return u.raw ? state.qty : +(state.qty * u.g).toFixed(1);
  };

  /* ── live readout ── */
  const readout = el('div');
  const amountBox = el('div');
  const methodChip = el('div');
  const depth = el('div');

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

    drawDepth(m, gr);
  };

  /*
   * What this food actually is, before you commit to it.
   *
   * The breakdown existed only after logging — you had to eat a thing,
   * open Detail and read back that its protein was incomplete, which is
   * an answer arriving after the decision it was meant to inform. It is
   * the same computation either way, so it belongs here too.
   *
   * Folded by default: most logging is a two-tap job and this would be in
   * the way of it. Open once and it stays open, because someone who wants
   * this wants it every time.
   */
  function drawDepth(m, gr) {
    const q = qualityFor({ ref: foodId, n: food.n || food.name, per100: food.per100 }, m);
    const open = get().settings?.portionDepth === true;

    const head = el('button.sec-head', {
      'aria-expanded': String(open),
      onclick: () => {
        commit(st => { st.settings.portionDepth = !open; }, 'settings');
        haptic('tap');
        render();
      },
    },
      el('span.micro', {}, 'What this is made of'),
      el('span.sec-caret', {}, open ? '\u25BE' : '\u25B8'));

    if (!open) { depth.replaceChildren(head); return; }

    if (!q) {
      depth.replaceChildren(head, el('div.fine', { style: { padding: '4px 2px 10px' } },
        'No quality profile for this one — it was built by hand, so the app will not '
        + 'guess what its protein or fat are made of.'));
      return;
    }

    const row = (k, v, sub) => el('div.caff-row', {},
      el('span.grow', {}, el('div', {}, k), sub ? el('div.micro', {}, sub) : null),
      el('span.num', {}, v));

    const leu = q.protein.leucine;
    const hitsLeucine = leu >= LEUCINE_THRESHOLD_G;

    depth.replaceChildren(head, el('div.tile', { style: { marginBottom: '10px' } },
      /* Protein first: it is the question people actually open this for. */
      row('Protein',
        q.protein.classified
          ? (q.protein.complete ? 'Complete' : 'Incomplete')
          : 'Unclassified',
        q.protein.classified
          ? q.protein.classLabel + (q.protein.limiting ? ` · low in ${q.protein.limiting}` : '')
          : null),

      q.protein.classified && !q.protein.complete && q.protein.pairsWith
        ? el('div.fine', { style: { padding: '2px 0 8px' } },
            `Pair it with ${q.protein.pairsWith} and the two together are complete.`)
        : null,

      row('Leucine', `${leu.toFixed(1)} g`,
        hitsLeucine
          ? `past the ${LEUCINE_THRESHOLD_G} g that triggers muscle protein synthesis`
          : `${(LEUCINE_THRESHOLD_G - leu).toFixed(1)} g short of the ${LEUCINE_THRESHOLD_G} g trigger`),

      row('Carbohydrate', q.carb.classLabel,
        `${Math.round(q.carb.sugar)} g sugar · ${Math.round(q.carb.starch)} g starch · `
        + `${Math.round(q.carb.fibre)} g fibre`),

      row('Fat', q.fat.classLabel,
        `${q.fat.sat.toFixed(1)} g saturated · ${q.fat.mufa.toFixed(1)} g mono · `
        + `${q.fat.pufa.toFixed(1)} g poly`),

      q.inferred
        ? el('div.fine', { style: { marginTop: '8px' } },
            'Classified from the name and the panel rather than from a known food, '
            + 'so treat these as indicative.')
        : null));
  }

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

  /*
   * "I finished the packet, but not today."
   *
   * Shown only when logging something new — editing one slice of a spread
   * and silently re-spreading it would multiply the food.
   */
  const spreadNote = el('div.fine');
  const spreadRow = el('div.spread-row', {},
    el('div.between', {},
      el('span', {}, 'Eaten over'),
      el('div.stepper', {},
        el('button.btn.sm.ghost', {
          'aria-label': 'Fewer days',
          onclick: () => setSpread(state.spreadDays - 1),
        }, '−'),
        el('span.stepper-val', {}, '1 day'),
        el('button.btn.sm.ghost', {
          'aria-label': 'More days',
          onclick: () => setSpread(state.spreadDays + 1),
        }, '+'))),
    spreadNote);

  function setSpread(n) {
    state.spreadDays = Math.max(1, Math.min(60, Math.round(n) || 1));
    const val = spreadRow.querySelector('.stepper-val');
    val.textContent = state.spreadDays === 1 ? '1 day' : `${state.spreadDays} days`;
    spreadRow.classList.toggle('is-on', state.spreadDays > 1);
    const gr = gramsNow();
    if (state.spreadDays === 1) {
      spreadNote.textContent = 'All of it today.';
    } else {
      const per = macrosFor(food.per100, gr / state.spreadDays);
      const first = shiftDay(dateKey, -(state.spreadDays - 1));
      spreadNote.textContent =
        `Split evenly back to ${first} — about ${Math.round(per.kcal)} kcal a day. `
        + 'The total is what you measured; which day got which handful is not, '
        + 'so each day is logged as an estimate.';
    }
  }

  inferMethod();
  syncAmount();
  syncMeal();
  setSpread(1);

  const s = sheet({
    title: food.n || food.name,
    body: el('div', {},
      el('div.tile.tile-hero', { style: { marginBottom: '12px' } }, readout),
      mealRow,
      el('div', { style: { height: '12px' } }),
      amountCard,
      entry ? null : spreadRow,
      depth,
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
    foot: el('div.btn-row', {},
      savable ? el('button.btn.ghost', {
        style: { flex: '0 0 auto', padding: '15px 16px' },
        onclick: e => {
          const rec = rememberFood();
          if (!rec) { toast('Already in your foods.'); return; }
          haptic('success');
          toast(`${rec.n} saved to your foods.`);
          e.currentTarget.disabled = true;
          e.currentTarget.textContent = 'Saved';
          onSaved();
        },
      }, icon('plus', 16), 'Save only') : null,
      el('button.btn.primary.grow', {
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
          /* Logging something scanned should keep it too — otherwise the
             only copy of it is the log line you just wrote. */
          rememberFood();
          const n = state.spreadDays;
          if (n > 1) {
            /*
             * One entry per day, rather than one entry that other screens
             * have to know how to divide. Every total, target, report and
             * TDEE calculation in the app already reads a day's entries;
             * a special kind of entry that spans days would need each of
             * them taught about it, and each one taught separately is a
             * place for it to be forgotten.
             *
             * The amount you measured is real, so it keeps your method.
             * Which day got which handful is not, so the per-day slice is
             * marked estimated — the log should not claim a precision
             * about Tuesday that nobody has.
             */
            const spreadId = 'sp' + Date.now().toString(36);
            for (let i = 0; i < n; i++) {
              addEntry(shiftDay(dateKey, -i), {
                ...payload,
                grams: gr / n,
                method: 'estimate',
                spread: { id: spreadId, days: n, index: i, totalGrams: gr, method: state.method },
              });
            }
            toast(`${Math.round(macrosFor(food.per100, gr).kcal)} kcal split over ${n} days.`);
          } else {
            addEntry(dateKey, payload);
            toast(`${Math.round(macrosFor(food.per100, gr).kcal)} kcal logged.`);
          }
        }
        haptic('success');
        s.close();
        onSaved();
      },
    }, entry ? 'Save changes' : 'Log it')),
  });

  return s;
}
