/*
 * Adding food.
 *
 * Four ways in, in the order a specific eater actually needs them: the
 * things you eat constantly, the barcode in your hand, a search, and
 * finally building the food yourself from a packet.
 */

import {
  el, clear, sheet, toast, icon, kcal, grams, g, empty, field, segmented, confirmSheet, explain,
} from '../ui.js';
import {
  get, saveFood, frequentFoods, recentFoods, dayKey, totals, addEntry,
  mealsList, mealTotals, logMeal, deleteMeal, renameMeal, MEALS,
} from '../store.js';
import { FOODS, GROUPS, atwater } from '../data/foods.js';
import { resolveBarcode, searchProducts, validEAN, isIndian } from '../off.js';
import { Scanner, cameraSupported, secureEnough, decodeImageFile, diagnose } from '../scanner.js';
import { openPortion } from './portion.js';
import { openDish } from './dish.js';
import { openPot } from './pot.js';
import { openMealBuilder } from './meal.js';
import { dayTargets } from './today.js';

/*
 * A live header of what you have eaten so far, pinned above the search.
 *
 * Adding food and watching the day fill up were on separate tabs, so you
 * logged blind and then went somewhere else to find out what it did. This
 * is the single most useful thing Stupid Simple does: the consumed macros
 * sit on the same screen you add from, and they move as you add.
 */
function consumedHeader(s, ctx) {
  const key = ctx.date || dayKey();
  const t = totals(key);
  const targets = dayTargets(s, key);

  const bar = (label, val, target, hue) => {
    const pct = target > 0 ? Math.min(100, (val / target) * 100) : 0;
    return el('div', {},
      el('div.between', { style: { marginBottom: '3px' } },
        el('span.micro', { style: { color: hue } }, label),
        el('span.num', { style: { fontSize: '11.5px' } },
          `${Math.round(val)}/${Math.round(target)}`)),
      el('div', { style: {
        height: '5px', borderRadius: '3px', background: 'var(--line)', overflow: 'hidden',
      } },
        el('div', { style: {
          height: '100%', width: pct + '%', background: hue, borderRadius: '3px',
          transition: 'width .5s cubic-bezier(.22,1,.36,1)',
        } })));
  };

  const left = Math.round(targets.kcal - t.kcal);
  return el('div.sticky-glass', {},
    el('div.between', { style: { marginBottom: '9px' } },
      el('div.flex', {},
        el('span.num', { style: { fontSize: '21px', fontWeight: '500' } }, kcal(t.kcal)),
        el('span.micro', { style: { marginLeft: '6px' } }, `of ${kcal(targets.kcal)}`)),
      el('span.num', {
        style: { fontSize: '13px', color: left < 0 ? 'var(--warn)' : 'var(--good)' },
      }, left < 0 ? `${Math.abs(left)} over` : `${left} left`)),
    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' } },
      bar('Protein', t.p, targets.p, 'var(--m-p)'),
      bar('Carbs', t.c, targets.c, 'var(--m-c)'),
      bar('Fat', t.f, targets.f, 'var(--m-f)')),
  );
}

export function renderAdd(root, ctx) {
  clear(root);
  root.append(consumedHeader(get(), ctx), el('div', { style: { height: '14px' } }),
    foodSurface(ctx));
}

/*
 * The food-entry surface: search, the shortcut buttons, and the grid of
 * things you actually eat. Today hosts this directly so that logging a
 * meal never costs a tab change — you add the food and watch the numbers
 * above it move. Add kept its own tab only as a deep link.
 */
export function foodSurface(ctx) {
  const s = get();
  const root = el('div');

  const search = el('input', {
    type: 'search', placeholder: 'Search your foods and the database',
    autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
    oninput: e => runSearch(e.target.value),
  });

  const results = el('div');

  root.append(
    el('div.btn-row', { style: { marginBottom: '10px' } },
      el('button.btn.primary', { onclick: () => openScanner(ctx) }, icon('scan', 18), 'Scan'),
      el('button.btn.primary', { onclick: () => openMealBuilder({ onSaved: ctx.refresh }) },
        icon('plus', 18), 'New meal')),

    el('div.btn-row', { style: { marginBottom: '14px' } },
      el('button.btn', { onclick: () => openDish({ dateKey: ctx.date || dayKey(), onSaved: ctx.refresh }) },
        icon('pot', 18), 'Home dish'),
      el('button.btn', { onclick: () => openBuilder({ onSaved: ctx.refresh }) },
        icon('foods', 18), 'New food')),

    el('div.btn-row', { style: { marginBottom: '14px' } },
      el('button.btn.ghost', { onclick: () => openQuickAdd(ctx) },
        icon('bolt', 18), 'Quick add macros')),

    el('div.field', {}, search),
    results,
  );

  let seq = 0;
  async function runSearch(q) {
    const mine = ++seq;
    q = q.trim();
    if (q.length < 2) { showShortcuts(); return; }

    clear(results);
    results.append(sectionLabel('Your foods and reference database'));

    const local = searchLocal(q);
    if (local.length) {
      results.append(listTile(local, ctx));
    } else {
      results.append(el('div.tile', {}, el('div.dim', { style: { fontSize: '13.5px' } },
        'Nothing local matches. Checking packaged products…')));
    }

    if (validEAN(q.replace(/\s/g, ''))) {
      await lookupTyped(q.replace(/\s/g, ''));
      return;
    }

    const loading = el('div.tile.flex', {}, el('div.spinner'),
      el('span.dim', { style: { fontSize: '13.5px' } }, 'Searching packaged products…'));
    results.append(sectionLabel('Packaged products'), loading);

    const r = await searchProducts(q);
    if (mine !== seq) return;
    loading.remove();

    if (r.offline) {
      results.append(el('div.tile', {}, el('div.dim', { style: { fontSize: '13.5px' } },
        'Packaged product search needs the Mac server running. Local results still work.')));
    } else if (!r.products.length) {
      results.append(el('div.tile', {}, el('div.dim', { style: { fontSize: '13.5px' } },
        'No packaged product found. Build it from the packet instead.'),
        el('button.btn.sm', { style: { marginTop: '10px' },
          onclick: () => openBuilder({ name: q, onSaved: ctx.refresh }) }, 'Build it')));
    } else {
      results.append(listTile(r.products.map(toItem), ctx));
    }
  }

  /*
   * Someone typed a barcode into the search box instead of scanning it —
   * the fallback offered whenever the print is scuffed or the light is bad.
   * It has to land in the same place a good scan does.
   */
  async function lookupTyped(code) {
    clear(results);
    results.append(sectionLabel('Barcode ' + code));
    const pending = el('div.tile.flex', {}, el('div.spinner'),
      el('span.dim', { style: { fontSize: '13.5px' } }, 'Looking it up…'));
    results.append(pending);

    const food = await resolveBarcode(code);
    pending.remove();

    if (food.found) {
      results.append(listTile([toItem(food)], ctx));
      openPortion(toItem(food), { dateKey: ctx.date || dayKey(), onSaved: ctx.refresh });
      return;
    }

    results.append(el('div.tile', {},
      el('div', { style: { fontSize: '13.5px', color: 'var(--text-2)', lineHeight: '1.55' } },
        food.offline
          ? 'The Mac server is not reachable, so packaged lookups are off. You can still build this food by hand.'
          : `Open Food Facts has no entry for ${code}${isIndian(code) ? ', an Indian product code' : ''}. `
            + 'Build it once from the packet and it is yours permanently.'),
      el('button.btn.primary.block', { style: { marginTop: '12px' },
        onclick: () => openBuilder({ barcode: code, onSaved: ctx.refresh }) },
        'Enter it from the packet')));
  }

  function showShortcuts() {
    clear(results);
    const freq = frequentFoods(10);
    const recent = recentFoods(10);
    const meals = mealsList();

    // The whole point: the thing you eat every morning should be one tap,
    // not five searches. So it sits above everything else.
    if (meals.length) {
      results.append(sectionLabel('Your meals'), mealsTile(meals, ctx));
    }

    if (freq.length) {
      results.append(sectionLabel('You eat these most'), foodGrid(freq.map(toItem), ctx));
    }
    if (recent.length) {
      results.append(sectionLabel('Recent'), foodGrid(recent.map(toItem), ctx));
    }
    const lib = Object.values(s.library);
    if (lib.length) {
      results.append(sectionLabel('Your foods'), foodGrid(lib.slice(0, 12).map(toItem), ctx));
    }
    if (!freq.length && !recent.length && !lib.length && !meals.length) {
      results.append(el('div.tile', {}, empty(
        'Start with what you actually eat',
        'Scan a barcode, or build a food once from its packet and it stays in your library for good.',
        el('button.btn.primary', { onclick: () => openBuilder({ onSaved: ctx.refresh }) }, 'Build a food'))));
    }
  }

  showShortcuts();
  return root;
}

/*
 * Quick add.
 *
 * For the meal you cannot itemise and are not going to pretend you can:
 * a restaurant plate, someone else's cooking, the thing you ate an hour
 * ago from memory. Typing three numbers you half-know beats logging
 * nothing at all, so this exists — but it is graded 'D' and carries the
 * estimate error bar, so the day's confidence widens honestly rather
 * than the guess passing itself off as a weighed measurement.
 */
export function openQuickAdd(ctx) {
  const key = ctx.date || dayKey();
  const v = { p: '', c: '', f: '', kcal: '', name: '', meal: mealForNowLocal() };

  const num = (label, k, unit) => el('label.field-row', {},
    el('span.fl', {}, label),
    el('input', {
      type: 'number', inputMode: 'decimal', min: '0', step: '0.1', placeholder: '0',
      oninput: e => { v[k] = e.target.value; sync(); },
    }),
    el('span.fu', {}, unit));

  const derived = el('div.fine');
  const sync = () => {
    const p = +v.p || 0, c = +v.c || 0, f = +v.f || 0;
    const fromMacros = p * 4 + c * 4 + f * 9;
    derived.textContent = (+v.kcal)
      ? `Stated ${Math.round(+v.kcal)} kcal · macros account for ${Math.round(fromMacros)} kcal`
      : `${Math.round(fromMacros)} kcal from the macros you entered`;
  };
  sync();

  const sh = sheet({
    title: 'Quick add',
    body: el('div', {},
      el('div.tile', {},
        el('label.field-row', {},
          el('span.fl', {}, 'Name'),
          el('input', { type: 'text', placeholder: 'Lunch out',
            oninput: e => { v.name = e.target.value; } })),
        num('Protein', 'p', 'g'),
        num('Carbs', 'c', 'g'),
        num('Fat', 'f', 'g'),
        num('Calories', 'kcal', 'kcal'),
        el('div', { style: { marginTop: '10px' } }, derived)),

      el('div.tile', {},
        el('div.micro', { style: { marginBottom: '8px' } }, 'Meal'),
        segmented(MEALS.map(m => ({ id: m, label: MEAL_LABELS[m] })), v.meal,
          m => { v.meal = m; })),

      explain('Entered by hand, so this is graded D and carries a ±25% error bar. '
        + 'It counts toward your day, and the day\u2019s uncertainty widens to say so.'),

      el('button.btn.primary.block', {
        style: { marginTop: '14px' },
        onclick: () => {
          const p = +v.p || 0, c = +v.c || 0, f = +v.f || 0;
          const kc = +v.kcal || (p * 4 + c * 4 + f * 9);
          if (!kc) { toast('Enter at least one number.'); return; }
          /* Expressed as 100 g of a food whose per-100 g values are the
             numbers typed. That keeps it inside the existing entry model,
             so totals, error propagation and the day report all handle it
             without a special case. */
          addEntry(key, {
            name: v.name.trim() || 'Quick add',
            meal: v.meal, method: 'estimate', grade: 'D', quick: true,
            grams: 100,
            per100: { kcal: kc, p, c, f },
          });
          toast('Added.');
          sh.close();
          ctx.refresh?.();
        },
      }, 'Add to today'),
    ),
  });
}

function mealForNowLocal() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
}

const sectionLabel = text => el('div.section-label', {}, el('span.micro', {}, text));

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

function mealsTile(meals, ctx) {
  const tile = el('div.tile.flush');
  for (const m of meals) {
    const t = mealTotals(m);
    tile.append(el('div.row', {},
      el('button', {
        class: 'grow', style: { textAlign: 'left', padding: 0 },
        onclick: () => {
          const n = logMeal(ctx.date || dayKey(), m.id);
          toast(`${m.name} logged — ${n} items, ${kcal(t.kcal)} kcal.`);
          ctx.go('today');
        },
      },
        el('div.title', {}, m.name),
        el('div.sub', {},
          `${m.items.length} items · ${Math.round(t.p)}P ${Math.round(t.c)}C ${Math.round(t.f)}F`
          + (m.uses ? ` · used ${m.uses}×` : ''))),
      el('span.kcal', {}, kcal(t.kcal)),
      el('button.x-btn', {
        'aria-label': 'Options for ' + m.name,
        onclick: () => openMealOptions(m, ctx),
      }, icon('edit', 15)),
    ));
  }
  return tile;
}

function openMealOptions(m, ctx) {
  const t = mealTotals(m);
  const nameInput = el('input', { type: 'text', value: m.name });

  let target = m.meal;
  const mealBox = el('div', {}, segmented(
    MEALS.map(x => ({ value: x, label: MEAL_LABELS[x] })), target, v => { target = v; }));

  const s = sheet({
    title: m.name,
    body: el('div', {},
      el('div.tile', {},
        el('div.readout', {},
          el('div', {},
            el('div.micro', {}, 'Whole meal'),
            el('div.readout-main', { style: { fontSize: '32px' } }, kcal(t.kcal))),
          el('div.readout-side', {},
            el('div.micro', {}, 'Protein'),
            el('div.v', {}, Math.round(t.p) + ' g')))),

      el('div.tile.flush', {},
        ...m.items.map(it => el('div.row', {},
          el('span.grow', {},
            el('div.title', {}, it.name),
            el('div.sub', {}, `${grams(it.grams)} g`)),
          el('span.kcal', {}, kcal((it.per100.kcal || 0) * it.grams / 100))))),

      el('div.field', {}, el('label', {}, 'Name'), nameInput),
      el('div.field', {}, el('label', {}, 'Log it into'), mealBox),

      el('button.btn.block', {
        onclick: () => { s.close(); openMealBuilder({ meal: m, onSaved: ctx.refresh }); },
      }, icon('edit', 16), 'Change what is in it'),
    ),
    foot: el('div.btn-row', {},
      el('button.btn.danger', {
        onclick: async () => {
          s.close();
          if (await confirmSheet({
            title: 'Delete this meal?',
            message: `"${m.name}" will be removed. Anything already logged from it stays.`,
            confirmLabel: 'Delete', danger: true,
          })) { deleteMeal(m.id); toast('Deleted.'); ctx.refresh(); }
        },
      }, 'Delete'),
      el('button.btn.primary', {
        onclick: () => {
          if (nameInput.value.trim()) renameMeal(m.id, nameInput.value);
          logMeal(ctx.date || dayKey(), m.id, target);
          toast(`${nameInput.value.trim() || m.name} logged.`);
          s.close();
          ctx.go('today');
        },
      }, 'Log it')),
  });
}

/*
 * A food from any source, in the shape the rest of the app expects.
 *
 * Grade matters: it multiplies the measurement error. A packaged product
 * with a printed panel is grade B; defaulting everything to C would widen
 * the error bars on the most reliable data in the app.
 */
export function toItem(f) {
  return {
    id: f.id || f.ref,
    n: f.n || f.name,
    brand: f.brand || '',
    per100: f.per100,
    serv: (f.serv || []).map(x => Array.isArray(x) ? { l: x[0], g: x[1] } : x),
    grade: f.grade || (f.src === 'openfoodfacts' || f.barcode ? 'B' : 'C'),
    grp: f.grp || '',
    basis: f.basis,
    barcode: f.barcode,
    src: f.src,
  };
}

/* Ranked so an exact word match beats a substring buried mid-name. */
export function searchLocal(q) {
  const s = get();
  const needle = q.toLowerCase();
  const pool = [...Object.values(s.library).map(toItem), ...FOODS.map(toItem)];
  const hits = [];

  for (const f of pool) {
    const name = (f.n || '').toLowerCase();
    const brand = (f.brand || '').toLowerCase();
    let score = 0;
    if (name === needle) score = 100;
    else if (name.startsWith(needle)) score = 70;
    else if (name.split(/[\s,/()-]+/).some(w => w.startsWith(needle))) score = 55;
    else if (name.includes(needle)) score = 35;
    else if (brand.includes(needle)) score = 20;
    if (!score) continue;
    if (String(f.id).startsWith('my:')) score += 25;
    hits.push({ f, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 25).map(h => h.f);
}

/*
 * The grid. Deliberately no icons: there is no honest pictogram for
 * "moong dal" or "whey isolate", and a stock one would slow recognition
 * rather than speed it. The name is the fastest identifier available,
 * so the cell gives it two lines and gets out of the way.
 */
function foodGrid(items, ctx) {
  const grid = el('div.food-grid');
  for (const f of items) {
    const per = f.per100 || {};
    grid.append(el('button.food-cell', {
      onclick: () => openPortion(f, { dateKey: ctx.date || dayKey(), onSaved: ctx.refresh }),
    },
      el('span.fc-name', {}, f.n),
      el('span.fc-kcal', {}, `${Math.round(per.kcal || 0)} kcal · ${Math.round(per.p || 0)}P`)));
  }
  return grid;
}

function listTile(items, ctx) {
  const tile = el('div.tile.flush');
  for (const f of items) {
    const per = f.per100 || {};
    tile.append(el('button.row', {
      onclick: () => openPortion(f, { dateKey: ctx.date || dayKey(), onSaved: ctx.refresh }),
    },
      el('span.grow', {},
        el('div.title', {}, f.n),
        el('div.sub', {},
          [f.brand, f.basis, basisNote(f.basis)].filter(Boolean).join(' · ') || 'per 100 g',
          ` · ${Math.round(per.p || 0)}P ${Math.round(per.c || 0)}C ${Math.round(per.f || 0)}F`)),
      el('span.kcal', {}, kcal(per.kcal), el('div.micro', { style: { marginTop: '2px' } }, '/100g')),
      icon('chevron', 15),
    ));
  }
  return tile;
}

const basisNote = b => (b === 'raw' ? 'weighed raw' : b === 'dry' ? 'weighed dry' : b === 'cooked' ? 'weighed cooked' : '');

/* ── Scanner ────────────────────────────────────────────────────────── */

export function openScanner(ctx) {
  const video = el('video', { playsinline: true, muted: true });
  const status = el('div.scan-status', {}, el('div.spinner'), el('span', {}, 'Starting camera…'));
  const wrap = el('div.scan-wrap', {}, video,
    el('div.reticle', {}, el('div.reticle-line')), status);

  const manual = el('input.num-in', {
    type: 'text', inputmode: 'numeric', placeholder: 'or type the digits under the barcode',
    autocomplete: 'off',
  });

  /*
   * A photo works when the live camera does not — refused permission, an
   * old iOS, a packet you photographed in the shop. Same decoder either way.
   */
  const photo = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  photo.addEventListener('change', async () => {
    const f = photo.files[0];
    if (!f) return;
    status.replaceChildren(el('div.spinner'), el('span', {}, 'Reading the photo…'));
    try {
      const code = await decodeImageFile(f);
      if (code) { handle(code); return; }
      status.replaceChildren(el('span', {}, 'No barcode found in that photo. Get closer to the code and try again.'));
    } catch (e) {
      status.replaceChildren(el('span', {}, String(e.message || e)));
    }
    photo.value = '';
  });

  const failureBox = el('div');

  let scanner = null;
  let busy = false;

  const s = sheet({
    title: 'Scan a barcode',
    body: el('div', {}, wrap,
      failureBox,
      el('div', { style: { height: '14px' } }),

      el('button.btn.block', { onclick: () => photo.click() },
        icon('scan', 16), 'Use a photo instead'),
      photo,

      el('div', { style: { height: '14px' } }),
      field('Barcode number', manual, 'Every packet prints the digits under the bars. This always works.'),
      el('button.btn.block', {
        onclick: () => {
          const code = manual.value.replace(/\D/g, '');
          if (!code) { toast('Enter the digits first.', 'err'); return; }
          handle(code);
        },
      }, 'Look it up')),
    onClose: () => scanner && scanner.stop(),
  });

  async function handle(code) {
    if (busy) return;
    busy = true;
    status.replaceChildren(el('div.spinner'), el('span', {}, `Looking up ${code}…`));

    const food = await resolveBarcode(code);
    busy = false;

    if (!food.found) {
      status.replaceChildren(el('span', {}, food.offline
        ? 'Server unreachable — start it on the Mac, or build the food by hand.'
        : `Not in the database yet.`));
      scanner && scanner.stop();
      s.close();
      notFound(code, food, ctx);
      return;
    }

    scanner && scanner.stop();
    s.close();
    openPortion(toItem(food), { dateKey: ctx.date || dayKey(), onSaved: ctx.refresh });
  }

  function notFound(code, food, ctx) {
    sheet({
      title: 'Not in the database',
      body: el('div', {},
        el('p', { style: { color: 'var(--text-2)', marginTop: 0, lineHeight: '1.55' } },
          `Barcode ${code}`, isIndian(code) ? ' is an Indian product code' : '',
          ` but Open Food Facts has no entry for it. Build it once from the packet and it's yours permanently.`),
        el('button.btn.primary.block', {
          onclick: () => openBuilder({ barcode: code, onSaved: ctx.refresh }),
        }, 'Enter it from the packet')),
    });
  }

  scanner = new Scanner(video, {
    onResult: handle,
    onError: (msg, d) => {
      // Collapse the dead video box and say plainly what to do instead.
      wrap.style.display = 'none';
      failureBox.replaceChildren(el('div.note.warn', {},
        el('div', {},
          el('b', {}, (d && d.title) || 'The camera did not start'),
          el('div.fine', { style: { marginTop: '4px' } }, msg),
          el('div.fine', { style: { marginTop: '6px' } },
            'A photo of the barcode works just as well, and typing the digits always works.'))));
    },
  });

  scanner.start().then(ok => {
    if (ok) {
      status.replaceChildren(el('span', {},
        `Hold the barcode inside the frame · ${scanner.engine === 'native' ? 'fast decoder' : 'compatibility decoder'}`));
      if (scanner.hasTorch()) {
        const torch = el('button.btn.sm', { style: { marginLeft: 'auto' } }, 'Light');
        let on = false;
        torch.onclick = async () => { on = !on; await scanner.torch(on); torch.textContent = on ? 'Light off' : 'Light'; };
        status.append(torch);
      }
    }
  });

  return s;
}

/* ── Custom food builder ────────────────────────────────────────────── */

/*
 * Building a food by hand.
 *
 * Packets in India list per 100 g, per serving, or both, and the two often
 * disagree. You enter whichever the packet actually shows and the app
 * converts, rather than making you do arithmetic at the kitchen counter.
 */
export function openBuilder({ name = '', barcode = null, food = null, onSaved = () => {} } = {}) {
  let mode = 'per100';
  let servingG = food?.serv?.[0]?.g || 100;

  const inp = (ph, val = '', step = '0.1') => el('input.num-in', {
    type: 'number', inputmode: 'decimal', step, min: '0',
    placeholder: ph, value: val === 0 || val ? String(val) : '',
  });

  const p100 = food?.per100 || {};
  const fName = el('input', { type: 'text', value: food?.n || name, placeholder: 'Whey isolate, chocolate' });
  const fBrand = el('input', { type: 'text', value: food?.brand || '', placeholder: 'Brand, optional' });
  const fBarcode = el('input.num-in', { type: 'text', inputmode: 'numeric', value: food?.barcode || barcode || '', placeholder: 'Barcode, optional' });

  const fKcal = inp('kcal', p100.kcal, '1');
  const fP = inp('protein g', p100.p);
  const fC = inp('carbs g', p100.c);
  const fF = inp('fat g', p100.f);
  const fFib = inp('fibre g', p100.fib);
  const fSug = inp('sugar g', p100.sug);
  const fSat = inp('sat fat g', p100.sat);
  const fNa = inp('sodium mg', p100.na, '1');

  const fServG = inp('grams', servingG, '0.1');
  const fServL = el('input', { type: 'text', value: food?.serv?.[0]?.l || '', placeholder: '1 scoop' });

  const basisBox = el('div');
  let basis = food?.basis || 'as-served';
  basisBox.append(segmented([
    { value: 'as-served', label: 'As eaten' },
    { value: 'raw', label: 'Raw' },
    { value: 'dry', label: 'Dry' },
    { value: 'cooked', label: 'Cooked' },
  ], basis, v => { basis = v; }, { wrap: true }));

  const checkBox = el('div');

  const readValues = () => {
    const raw = {
      kcal: +fKcal.value || 0, p: +fP.value || 0, c: +fC.value || 0, f: +fF.value || 0,
      fib: +fFib.value || 0, sug: +fSug.value || 0, sat: +fSat.value || 0, na: +fNa.value || 0,
    };
    if (mode === 'perServing') {
      const sg = +fServG.value || 0;
      if (sg > 0) {
        const k = 100 / sg;
        for (const key in raw) raw[key] = +(raw[key] * k).toFixed(2);
      }
    }
    return raw;
  };

  /*
   * A printed nutrition panel should reconcile with its own macros to within
   * a few percent. Anything wider is a typo, a mixed-up column, or a
   * rounded panel — and the app says which band you are in rather than
   * passing everything under one loose threshold.
   */
  const validate = () => {
    const per100 = readValues();
    const check = atwater(per100);
    checkBox.replaceChildren();

    if (!per100.kcal && !per100.p && !per100.c && !per100.f) return;

    const off = Math.abs(check.delta);
    const pctOff = Math.round(off * 100);
    const gap = Math.abs(check.stated - check.derived);

    let tone, head, detail;
    if (off <= 0.04 || gap <= 8) {
      tone = 'good';
      head = 'Reconciles';
      detail = `Its macros account for ${check.derived} kcal against the ${check.stated} stated. That is what a correct panel looks like.`;
    } else if (off <= 0.10) {
      tone = 'info';
      head = `${pctOff}% apart`;
      detail = `Macros come to ${check.derived} kcal, the panel says ${check.stated}. Rounding on the packet explains a gap this size, but it is worth a second look.`;
    } else {
      tone = 'warn';
      head = `Off by ${pctOff}%`;
      detail = `You entered ${check.stated} kcal per 100 g, but the macros you entered come to ${check.derived}. `
             + `That is too wide to be rounding — usually a typo, or the per-serving column mixed in with the per-100 g one.`;
    }

    checkBox.append(el('div', { class: 'note ' + tone },
      el('div', {},
        el('b', {}, head),
        el('div.fine', { style: { marginTop: '3px' } }, detail))));
  };

  [fKcal, fP, fC, fF, fFib, fServG].forEach(i => i.addEventListener('input', validate));

  const modeBox = el('div');
  const modeHelp = el('div.help');

  const syncModeHelp = () => {
    modeHelp.textContent = mode === 'per100'
      ? 'Enter the numbers from the per-100 g column.'
      : 'Enter the numbers from the per-serving column. The serving weight above is what they get divided by.';
  };

  modeBox.append(segmented([
    { value: 'per100', label: 'Per 100 g' },
    { value: 'perServing', label: 'Per serving' },
  ], mode, v => { mode = v; syncModeHelp(); validate(); }));
  syncModeHelp();

  const body = el('div', {},
    field('Name', fName),
    el('div.field-2', {}, field('Brand', fBrand), field('Barcode', fBarcode)),
    field('Weighed how?', basisBox,
      'Say which state you weigh this in. Dry oats and cooked oats are not the same food.'),

    el('div.section-label', {}, el('span.micro', {}, 'Nutrition panel')),
    el('div.field', {},
      el('label', {}, 'The packet lists values'),
      modeBox,
      modeHelp),
    el('div.field-2', {}, field('Serving weight (g)', fServG), field('Serving name', fServL)),

    el('div.field-2', {}, field('Energy (kcal)', fKcal), field('Protein (g)', fP)),
    el('div.field-2', {}, field('Carbohydrate (g)', fC), field('Fat (g)', fF)),
    el('div.field-2', {}, field('Fibre (g)', fFib), field('Sugar (g)', fSug)),
    el('div.field-2', {}, field('Saturated fat (g)', fSat), field('Sodium (mg)', fNa)),

    checkBox,
  );

  const s = sheet({
    title: food ? 'Edit food' : 'New food',
    body,
    foot: el('div.btn-row', {},
      el('button.btn', {
        onclick: () => { const f = build(); if (f) { saveFood(f); toast('Saved to your foods.'); s.close(); onSaved(); } },
      }, 'Save only'),
      el('button.btn.primary', {
        onclick: () => {
          const f = build();
          if (!f) return;
          const saved = saveFood(f);
          s.close(); onSaved();
          openPortion(saved, { onSaved });
        },
      }, 'Save and log')),
  });

  function build() {
    const n = fName.value.trim();
    if (!n) { toast('Give it a name.', 'err'); return null; }
    const per100 = readValues();
    if (!per100.kcal) { toast('Energy is required.', 'err'); return null; }

    const serv = [];
    const sg = +fServG.value || 0;
    if (sg > 0) serv.push({ l: fServL.value.trim() || `1 serving (${sg} g)`, g: sg });
    serv.push({ l: '100 g', g: 100 });

    return {
      id: food?.id,
      n, brand: fBrand.value.trim(),
      barcode: fBarcode.value.replace(/\D/g, '') || null,
      basis, per100, serv,
      grade: 'B',
      grp: 'Yours',
      diet: 'veg',
    };
  }

  validate();
  return s;
}
