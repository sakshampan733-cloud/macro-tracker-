/*
 * Planning a day before you eat it.
 *
 * Two things people actually do with a plan, and the app supported
 * neither.
 *
 * The first is rehearsal: write down what today is going to look like,
 * see whether it lands on target, and change it while changing it is
 * free. Doing that by logging the food would put tomorrow's dinner in
 * today's log and destroy every timing signal the app has — so planned
 * items live apart and move across only when you say you have eaten
 * them, stamped at that moment rather than at the hour they were planned
 * for.
 *
 * The second is choosing between two foods. Not "how much is pasta" but
 * "pasta or fried rice", which is a comparison and reads terribly as two
 * separate lookups. Compare puts them side by side at a portion you
 * choose, so the difference is a difference and not two facts you have to
 * subtract in your head.
 */

import {
  el, clear, sheet, toast, icon, kcal, g, grams, segmented, append, confirmSheet, field,
} from '../ui.js';
import {
  get, commit, dayKey, shiftDay, macrosFor, MEALS,
  planFor, addPlanned, removePlanned, updatePlanned, clearPlan, planTotals, eatPlanned,
} from '../store.js';
import { searchLocal, searchMeals, toItem } from '../search.js';
import { FOODS } from '../data/foods.js';
import { qualityFor, classOf, PROTEIN_CLASS, FAT_CLASS, CARB_CLASS } from '../data/quality.js';
import { openPortion } from './portion.js';
import { haptic } from '../feedback.js';
import { BY_ID } from '../data/foods.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

/* ── The plan panel, for the Plan tab ─────────────────────────────────── */

export function plannerTile(ctx, targets) {
  const wrap = el('div');

  const draw = () => {
    const key = ctx.planDate || dayKey();
    const items = planFor(key);
    const t = planTotals(key);
    const kids = [];

    kids.push(el('div.between', { style: { margin: '26px 2px 11px' } },
      el('span.micro', {}, 'Plan a day'),
      el('div.flex', { style: { gap: '6px' } },
        el('button.btn.sm.ghost', { onclick: () => { ctx.planDate = shiftDay(key, -1); draw(); } },
          icon('chevron-left', 14)),
        el('span.micro', { style: { minWidth: '78px', textAlign: 'center' } }, dayWord(key)),
        el('button.btn.sm.ghost', { onclick: () => { ctx.planDate = shiftDay(key, 1); draw(); } },
          icon('chevron', 14)))));

    /* Where the plan lands, against the target for that day. */
    const over = targets.kcal ? t.kcal - targets.kcal : 0;
    kids.push(el('div.tile.tile-hero', {},
      el('div.readout', {},
        el('div', {},
          el('div.micro', {}, items.length ? 'Planned' : 'Nothing planned'),
          el('div.readout-main', { style: { fontSize: '34px' } }, Math.round(t.kcal))),
        el('div.readout-side', {},
          el('div.micro', {}, 'Target'),
          el('div.v', {}, Math.round(targets.kcal || 0)))),
      items.length ? el('div.plan-bars', {},
        bar('Protein', t.p, targets.p, 'var(--m-p)'),
        bar('Carbs', t.c, targets.c, 'var(--m-c)'),
        bar('Fat', t.f, targets.f, 'var(--m-f)')) : null,
      items.length ? el('div.fine', { style: { marginTop: '12px' } },
        Math.abs(over) < 60
          ? 'This lands on target.'
          : over > 0
            ? `${Math.round(over)} kcal over. Swapping one item is usually easier than shrinking three.`
            : `${Math.round(-over)} kcal under — there is room for something else.`) : null));

    kids.push(el('div.btn-row', { style: { marginTop: '12px' } },
      el('button.btn.primary.grow', { onclick: () => openPlanSearch(key, draw) },
        icon('plus', 16), 'Add to plan'),
      el('button.btn', { onclick: () => openCompare(key, draw) },
        icon('foods', 16), 'Compare')));

    if (items.length) {
      const list = el('div.tile.flush', { style: { marginTop: '12px' } });
      for (const m of MEALS) {
        const inMeal = items.filter(i => i.meal === m);
        if (!inMeal.length) continue;
        list.append(el('div.mini-head', {}, MEAL_LABELS[m]));
        for (const it of inMeal) {
          const mm = macrosFor(it.per100, it.grams);
          list.append(el('div.plan-row', {},
            el('button.grow.mini-open', { onclick: () => openPlanItem(key, it, draw) },
              el('span', {}, it.name),
              el('span.mini-count', {}, Math.round(it.grams) + ' g'),
              icon('chevron', 13)),
            el('span.num', {}, kcal(mm.kcal)),
            /* The only button that moves anything into the real log. */
            el('button.btn.sm.primary.plan-eat', {
              title: 'Log it now',
              onclick: () => {
                eatPlanned(key, it.id);
                haptic('success');
                toast(`${it.name} logged.`);
                draw(); ctx.refresh?.();
              },
            }, 'Ate it')));
        }
      }
      kids.push(list);

      kids.push(el('div.fine', { style: { marginTop: '10px' } },
        'Nothing here counts until you tap “Ate it”, which logs it at the time you tap — '
        + 'so the plan never pretends you ate breakfast at midnight.'));

      kids.push(el('button.btn.sm.ghost.block', { style: { marginTop: '12px' },
        onclick: async () => {
          if (!(await confirmSheet({ title: 'Clear this plan?',
            message: 'The planned items go. Anything you already logged stays.',
            confirmLabel: 'Clear', danger: true }))) return;
          clearPlan(key); draw();
        } }, 'Clear the plan'));
    }

    clear(wrap);
    append(wrap, ...kids);
  };

  draw();
  return wrap;
}

const bar = (name, have, want, colour) => {
  const pct = want ? Math.min(1.15, have / want) : 0;
  return el('div.plan-bar', {},
    el('div.between', {},
      el('span.micro', {}, name),
      el('span.num', { style: { fontSize: '12px' } }, `${Math.round(have)} / ${Math.round(want || 0)} g`)),
    el('div.plan-track', {},
      el('i', { style: { width: (pct * 100).toFixed(1) + '%', background: colour } })));
};

function dayWord(key) {
  const today = dayKey();
  if (key === today) return 'Today';
  if (key === shiftDay(today, 1)) return 'Tomorrow';
  if (key === shiftDay(today, -1)) return 'Yesterday';
  return new Date(key + 'T12:00:00')
    .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ── Adding to a plan ─────────────────────────────────────────────────── */

function openPlanSearch(key, onDone) {
  const results = el('div');
  const search = el('input', {
    type: 'search', placeholder: 'Search foods', autocomplete: 'off',
    oninput: e => draw(e.target.value),
  });

  function draw(q) {
    clear(results);
    q = (q || '').trim();
    if (q.length < 2) {
      /* A meal you have already built is the most likely thing you are
         planning to eat again, so it beats making you retype its parts. */
      const saved = savedMealsBlock(key, onDone, () => sh.close());
      results.append(saved || el('div.fine', {}, 'Type to find something to plan.'));
      return;
    }
    const hits = searchLocal(q).slice(0, 12).map(toItem);
    if (!hits.length) { results.append(el('div.fine', {}, `Nothing matches “${q}”.`)); return; }
    const grid = el('div.food-grid');
    for (const f of hits) {
      const per = f.per100 || {};
      grid.append(el('button.food-cell', {
        onclick: () => { sh.close(); openPlanPortion(key, f, onDone); },
      },
        el('span.fc-name', {}, f.n),
        el('span.fc-kcal', {}, `${Math.round(per.kcal || 0)} · ${Math.round(per.p || 0)}P`)));
    }
    results.append(grid);
  }

  draw('');
  const sh = sheet({
    title: 'Add to the plan',
    body: el('div', {}, el('div.field', {}, search), results),
  });
  return sh;
}

function openPlanPortion(key, food, onDone) {
  const servings = (food.serv || []).map(x => Array.isArray(x) ? { l: x[0], g: x[1] } : x);
  const state = { grams: servings.length ? servings[0].g : 100, meal: 'lunch' };

  const readout = el('div.readout');
  const paint = () => {
    const m = macrosFor(food.per100, state.grams);
    readout.replaceChildren(
      el('div', {},
        el('div.micro', {}, food.n),
        el('div.readout-main', { style: { fontSize: '32px' } }, Math.round(m.kcal))),
      el('div.readout-side', {},
        el('div.micro', {}, 'P · C · F'),
        el('div.v', {}, `${Math.round(m.p)} · ${Math.round(m.c)} · ${Math.round(m.f)}`)));
  };
  paint();

  const amount = el('input.num-in', {
    type: 'number', inputMode: 'decimal', min: '0', step: '5', value: String(state.grams),
    oninput: e => { state.grams = Math.max(0, +e.target.value || 0); paint(); },
  });

  const sh = sheet({
    title: 'Plan it',
    body: el('div', {},
      el('div.tile.tile-hero', {}, readout),
      servings.length ? el('div.btn-row', { style: { marginTop: '12px' } },
        ...servings.slice(0, 4).map(sv => el('button.btn.sm', {
          onclick: () => { state.grams = sv.g; amount.value = String(sv.g); paint(); },
        }, sv.l))) : null,
      el('div.tile', { style: { marginTop: '12px' } },
        field('Grams', amount)),
      el('div.section-label', {}, el('span.micro', {}, 'Sitting')),
      segmented(MEALS.map(m => ({ value: m, label: MEAL_LABELS[m] })), state.meal,
        v => { state.meal = v; }, { wrap: true })),
    foot: el('button.btn.primary.block', {
      onclick: () => {
        if (!(state.grams > 0)) { toast('Set an amount first.', 'err'); return; }
        addPlanned(key, {
          name: food.n, brand: food.brand || '', ref: food.id || null,
          barcode: food.barcode || null, per100: food.per100, serv: food.serv || [],
          grams: state.grams, grade: food.grade || 'C', method: 'portion', meal: state.meal,
        });
        haptic('success');
        sh.close(); onDone();
      },
    }, 'Add to plan'),
  });
  return sh;
}

function openPlanItem(key, item, onDone) {
  const state = { grams: item.grams, meal: item.meal };
  const readout = el('div.readout');
  const paint = () => {
    const m = macrosFor(item.per100, state.grams);
    readout.replaceChildren(
      el('div', {},
        el('div.micro', {}, item.name),
        el('div.readout-main', { style: { fontSize: '32px' } }, Math.round(m.kcal))),
      el('div.readout-side', {},
        el('div.micro', {}, 'P · C · F'),
        el('div.v', {}, `${Math.round(m.p)} · ${Math.round(m.c)} · ${Math.round(m.f)}`)));
  };
  paint();

  const sh = sheet({
    title: item.name,
    body: el('div', {},
      el('div.tile.tile-hero', {}, readout),
      el('div.tile', { style: { marginTop: '12px' } },
        field('Grams', el('input.num-in', {
          type: 'number', inputMode: 'decimal', min: '0', step: '5', value: String(state.grams),
          oninput: e => { state.grams = Math.max(0, +e.target.value || 0); paint(); },
        }))),
      el('div.section-label', {}, el('span.micro', {}, 'Sitting')),
      segmented(MEALS.map(m => ({ value: m, label: MEAL_LABELS[m] })), state.meal,
        v => { state.meal = v; }, { wrap: true }),
      el('button.btn.block', { style: { marginTop: '16px' },
        onclick: () => { sh.close(); openSwap(key, item, onDone); } },
        'Find a swap'),
      el('button.btn.danger.block', { style: { marginTop: '10px' },
        onclick: () => { removePlanned(key, item.id); sh.close(); onDone(); } },
        'Remove from plan')),
    foot: el('button.btn.primary.block', {
      onclick: () => {
        updatePlanned(key, item.id, { grams: state.grams, meal: state.meal });
        sh.close(); onDone();
      },
    }, 'Save'),
  });
  return sh;
}

/* ── Comparing foods ──────────────────────────────────────────────────── */

/*
 * "Pasta or fried rice" is a comparison, and reads terribly as two
 * separate lookups where you hold one set of numbers in your head while
 * fetching the other.
 *
 * Matching on calories rather than weight is the default because that is
 * the question being asked. 300 kcal of each shows you what you actually
 * get for the same cost — which is usually a surprise, and always more
 * useful than 100 g of each.
 */
export function openCompare(key, onDone) {
  const chosen = [];
  const mode = { by: 'kcal', amount: 300 };

  const body = el('div');
  const draw = () => {
    const kids = [];

    kids.push(el('div.seg', { style: { marginBottom: '12px' } },
      el('button', { type: 'button', 'aria-pressed': String(mode.by === 'kcal'),
        onclick: () => { mode.by = 'kcal'; mode.amount = 300; draw(); } }, 'Same calories'),
      el('button', { type: 'button', 'aria-pressed': String(mode.by === 'grams'),
        onclick: () => { mode.by = 'grams'; mode.amount = 200; draw(); } }, 'Same weight')));

    kids.push(el('div.tile', {},
      field(mode.by === 'kcal' ? 'Calories each' : 'Grams each',
        el('input.num-in', {
          type: 'number', inputMode: 'numeric', min: '0', step: '25',
          value: String(mode.amount),
          oninput: e => { mode.amount = Math.max(0, +e.target.value || 0); paintTable(); },
        }))));

    kids.push(el('button.btn.block', { style: { marginTop: '12px' },
      onclick: () => openCompareSearch(f => {
        if (chosen.length >= 3) chosen.shift();
        chosen.push(f); draw();
      }) }, icon('plus', 16), chosen.length ? 'Add another' : 'Pick a food'));

    if (chosen.length) kids.push(table);
    paintTable();

    clear(body);
    append(body, ...kids);
  };

  const table = el('div.tile.flush', { style: { marginTop: '12px' } });

  function paintTable() {
    if (!chosen.length) return;
    table.replaceChildren();

    const rows = chosen.map(f => {
      const per = f.per100 || {};
      const gramsFor = mode.by === 'kcal'
        ? (per.kcal ? (mode.amount / per.kcal) * 100 : 0)
        : mode.amount;
      return { f, grams: gramsFor, m: macrosFor(per, gramsFor) };
    });

    const best = {
      p: Math.max(...rows.map(r => r.m.p || 0)),
      fib: Math.max(...rows.map(r => r.m.fib || 0)),
      f: Math.min(...rows.map(r => r.m.f || 0)),
    };

    /* The depth that makes a comparison a decision rather than a calorie
       count: two plates can match on kcal and macros and still differ
       entirely in what the carbohydrate and the fat actually are. */
    const leastSugar = Math.min(...rows.map(r => r.m.sug ?? Infinity));
    const leastSat   = Math.min(...rows.map(r => r.m.sat ?? Infinity));
    const leastSalt  = Math.min(...rows.map(r => r.m.na ?? Infinity));

    for (const r of rows) {
      const q = qualityFor({ ref: r.f.id, n: r.f.n, per100: r.f.per100 }, r.m);
      /* For a plate, the labels come from the parts rather than from the
         blended panel, which belongs to no single food and classifies as
         nothing. */
      const blend = r.f.isMeal ? mealClasses(r.f.items || []) : null;
      table.append(el('div.cmp-row', {},
        el('div.cmp-head', {},
          el('div.cmp-name', {}, r.f.n),
          el('div.micro', {},
            mode.by === 'kcal'
              ? `${Math.round(r.grams)} g for ${Math.round(mode.amount)} kcal`
              : `${Math.round(r.m.kcal)} kcal for ${Math.round(mode.amount)} g`)),
        r.f.isMeal ? el('div.fine.cmp-parts', {}, r.f.parts.join(' · ')) : null,
        el('div.cmp-macros', {},
          cmpCell('P', r.m.p, (r.m.p || 0) === best.p && chosen.length > 1, 'var(--m-p)'),
          cmpCell('C', r.m.c, false, 'var(--m-c)'),
          cmpCell('F', r.m.f, (r.m.f || 0) === best.f && chosen.length > 1, 'var(--m-f)'),
          cmpCell('Fib', r.m.fib, (r.m.fib || 0) === best.fib && chosen.length > 1, 'var(--m-fib)')),

        /* What the carbs and the fat are made of. */
        el('div.cmp-deep', {},
          deepCell('Sugar', r.m.sug, 'g', (r.m.sug ?? Infinity) === leastSugar && chosen.length > 1),
          deepCell('Starch', q ? q.carb.starch : null, 'g', false),
          deepCell('Sat fat', r.m.sat, 'g', (r.m.sat ?? Infinity) === leastSat && chosen.length > 1),
          deepCell('Salt', r.m.na, 'mg', (r.m.na ?? Infinity) === leastSalt && chosen.length > 1)),

        (() => {
          const carbL = blend?.c || (q && q.carb.classLabel);
          const fatL  = blend?.f || (q && q.fat.classLabel);
          const protL = blend?.p || (q && q.protein.classLabel);
          const real  = x => x && x !== '\u2014';
          if (!real(carbL) && !real(fatL) && !real(protL)) {
            return el('div.fine', {}, 'No quality profile for this one — it was built by hand.');
          }
          const warnCarb = !blend && q && (q.carb.tier === 'refined' || q.carb.tier === 'sugary');
          return el('div.cmp-tags', {},
            real(carbL) ? el('span.cmp-tag.is-c' + (warnCarb ? '.is-warn' : ''), {}, carbL) : null,
            real(fatL) ? el('span.cmp-tag.is-f' + (fatL === 'Fried oil' ? '.is-warn' : ''), {}, fatL) : null,
            real(protL) ? el('span.cmp-tag.is-p', {}, protL) : null,
            !blend && q && q.protein.complete === false
              ? el('span.cmp-tag.is-warn', {}, 'Incomplete protein') : null,
            blend ? el('span.cmp-tag', {}, 'blended from the plate')
                  : (q && q.inferred ? el('span.cmp-tag', {}, 'estimated') : null));
        })(),
        el('div.btn-row', { style: { marginTop: '10px' } },
          el('button.btn.sm', {
            onclick: () => {
              addPlanned(key, {
                name: r.f.n, brand: r.f.brand || '', ref: r.f.id || null,
                per100: r.f.per100, serv: r.f.serv || [], grams: Math.round(r.grams),
                grade: r.f.grade || 'C', method: 'portion', meal: 'lunch',
              });
              haptic('success');
              toast(`${r.f.n} added to the plan.`);
              onDone?.();
            },
          }, 'Plan this'),
          el('button.btn.sm.ghost', {
            onclick: () => { const i = chosen.indexOf(r.f); if (i >= 0) chosen.splice(i, 1); draw(); },
          }, 'Remove'))));
    }

    if (chosen.length > 1) {
      table.append(el('div.cmp-note', {},
        mode.by === 'kcal'
          ? 'Same calories from each. The differences are what you actually get for that spend.'
          : 'Same weight of each. The calorie column is the difference here.'));
    }
  }

  draw();
  return sheet({ title: 'Compare', body });
}

/* A secondary figure. Dimmer than the macro cells because it is detail,
   not headline — but starred the same way when it wins. */
/*
 * A plate has no single class — the dal is a legume and the roti is a
 * cereal — so asking what "the meal" is made of only answers if you weight
 * each part by how much of that macro it actually contributes. The rice in
 * a thali decides the carb label; the ghee decides the fat one.
 */
function mealClasses(items) {
  const pick = (macroKey, table, clsKey) => {
    const bins = {};
    for (const it of items) {
      const cls = classOf(it.ref, it);
      const k = cls && cls[clsKey];
      if (!k || !table[k]) continue;
      const m = macrosFor(it.per100, it.grams);
      bins[k] = (bins[k] || 0) + (m[macroKey] || 0);
    }
    const top = Object.entries(bins).sort((a, b) => b[1] - a[1])[0];
    return top ? table[top[0]].label : null;
  };
  return {
    p: pick('p', PROTEIN_CLASS, 'p'),
    f: pick('f', FAT_CLASS, 'f'),
    c: pick('c', CARB_CLASS, 'c'),
  };
}

const deepCell = (label, v, unit, best) =>
  el('div.deep-cell' + (best ? '.is-best' : ''), {},
    el('span.deep-k', {}, label),
    el('span.deep-v', {}, v == null ? '\u2014'
      : String(unit === 'mg' ? Math.round(v) : Math.round(v * 10) / 10)),
    best ? el('span.deep-star', {}, '\u2605') : null);

const cmpCell = (label, v, isBest, colour) =>
  el('div.cmp-cell' + (isBest ? '.is-best' : ''), {},
    el('div.cmp-v', { style: { color: colour } }, Math.round(v || 0), el('i', {}, 'g')),
    el('div.cmp-l', {}, label));

/*
 * A saved meal, flattened into something comparable to a single food.
 *
 * "Pasta or fried rice" and "my usual breakfast or my usual lunch" are the
 * same question, and the second one is the more useful one — but a meal is
 * a list and a food is a panel, so the meal has to be reduced to a panel
 * before the two can sit in the same table. Summing the parts and dividing
 * by the total weight gives exactly that: a per-100 g panel for the plate
 * as a whole, which then scales like any other food.
 */
export function mealAsFood(m) {
  const tot = { kcal: 0, p: 0, c: 0, f: 0, fib: 0, sug: 0, sat: 0, na: 0 };
  let weight = 0;
  for (const it of m.items || []) {
    const x = macrosFor(it.per100, it.grams);
    for (const k of Object.keys(tot)) tot[k] += x[k] || 0;
    weight += it.grams || 0;
  }
  if (!weight) return null;
  const per100 = {};
  for (const k of Object.keys(tot)) per100[k] = (tot[k] / weight) * 100;
  return {
    id: m.id, n: m.name, brand: '', per100, isMeal: true,
    items: m.items || [],
    parts: (m.items || []).map(it => it.name),
    serv: [{ l: `the whole plate (${Math.round(weight)} g)`, g: Math.round(weight) }],
    grade: 'C',
  };
}

/*
 * Picking something to compare.
 *
 * "Search foods" used to mean the reference library only, which quietly
 * excluded the two kinds of food most worth comparing: the packaged thing
 * you scanned, and the plate you eat every week. Both live in the store,
 * both are searchable, and neither was reachable from here.
 */
function openCompareSearch(pick) {
  const results = el('div');
  const search = el('input', {
    type: 'search', placeholder: 'Foods, packets, meals you have saved', autocomplete: 'off',
    oninput: e => draw(e.target.value),
  });

  const cell = (f, sub) => el('button.food-cell', {
    onclick: () => { sh.close(); pick(f); },
  },
    el('span.fc-name', {}, f.n),
    el('span.fc-kcal', {}, sub));

  function draw(q) {
    clear(results);
    q = (q || '').trim();

    if (q.length < 2) {
      /* With nothing typed, offer the meals — they are the things you
         already decided are worth eating. */
      const meals = Object.values(get().meals || {})
        .map(mealAsFood).filter(Boolean).slice(0, 8);
      if (meals.length) {
        const grid = el('div.food-grid');
        for (const f of meals) {
          grid.append(cell(f, `${Math.round(f.per100.kcal)} · ${Math.round(f.per100.p)}P per 100 g`));
        }
        results.append(el('div.section-label', {}, el('span.micro', {}, 'Your meals')), grid);
      }
      results.append(el('div.fine', { style: { marginTop: '10px' } },
        'Or search anything — library foods, packets you have scanned, foods you built.'));
      return;
    }

    const mealHits = searchMeals(q).map(mealAsFood).filter(Boolean).slice(0, 4);
    if (mealHits.length) {
      const grid = el('div.food-grid');
      for (const f of mealHits) grid.append(cell(f, `${f.parts.length} items · ${Math.round(f.per100.kcal)}/100 g`));
      results.append(el('div.section-label', {}, el('span.micro', {}, 'Your meals')), grid);
    }

    /* searchLocal already spans the reference library, everything scanned
       and everything built by hand, ranked with your own foods on top. */
    const hits = searchLocal(q).slice(0, 12).map(toItem);
    if (hits.length) {
      const grid = el('div.food-grid');
      for (const f of hits) {
        grid.append(cell(f, `${Math.round(f.per100?.kcal || 0)} · ${Math.round(f.per100?.p || 0)}P`));
      }
      if (mealHits.length) results.append(el('div.section-label', {}, el('span.micro', {}, 'Foods')));
      results.append(grid);
    }

    if (!hits.length && !mealHits.length) {
      results.append(el('div.fine', {}, `Nothing matches \u201C${q}\u201D.`));
    }
  }

  draw('');
  const sh = sheet({ title: 'Pick something', body: el('div', {}, el('div.field', {}, search), results) });
  return sh;
}


/*
 * Planning out of meals you have already built.
 *
 * Everything in a saved meal keeps its own grams, so a plan assembled
 * this way is the same food at the same amounts you actually eat — not
 * an approximation of it typed in again.
 */
function savedMealsBlock(key, onDone, close) {
  const meals = Object.values(get().meals || {})
    .sort((a, b) => (b.lastUsed || b.createdAt || 0) - (a.lastUsed || a.createdAt || 0));
  if (!meals.length) return null;

  const wrap = el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Your meals')),
    el('div.fine', { style: { marginBottom: '10px' } },
      'Adds every item at the amount you saved it.'));

  for (const m of meals.slice(0, 8)) {
    const t = (m.items || []).reduce((a, it) => {
      const x = macrosFor(it.per100, it.grams);
      a.kcal += x.kcal; a.p += x.p; return a;
    }, { kcal: 0, p: 0 });
    const n = (m.items || []).length;
    wrap.append(el('div.food-cell.cell-wrap', {},
      el('button.cell-main', {
        onclick: () => {
          for (const it of m.items || []) addPlanned(key, { ...it, meal: m.meal || 'lunch' });
          haptic('success');
          toast(`${m.name} added to the plan.`);
          close(); onDone();
        },
      },
        el('span.fc-name', {}, m.name),
        el('span.fc-kcal', {}, `${n} item${n === 1 ? '' : 's'} · ${Math.round(t.kcal)} · ${Math.round(t.p)}P`))));
  }
  return wrap;
}

/*
 * Swapping one planned food for another.
 *
 * The constraint people actually hit is not "find me something lighter",
 * it is "I can't eat non-veg today" or "no rice tonight" — the calories
 * were fine, the food isn't allowed. So a swap holds the calories of the
 * thing being replaced and varies the food, ranked by how closely the
 * replacement eats like the original: same split of protein, carbs and
 * fat per calorie, so the rest of the day does not have to move.
 */
const AVOID = {
  rice: /\brice\b|biryani|pulao|pilaf|poha|khichdi|risotto/i,
  wheat: new RegExp([
    'roti', 'chapati', 'phulka', 'paratha', 'naan', 'kulcha', 'bhatur', 'puri', 'poori',
    'bread', 'toast', 'sandwich', 'bun', 'pav', 'burger', 'pizza', 'margherita', 'garlic bread',
    'pasta', 'macaroni', 'noodle', 'chowmein', 'hakka', 'schezwan', 'maggi', 'ramen', 'seviyan',
    'momo', 'frankie', 'burrito', 'wrap', 'roll', 'samosa', 'kachori', 'spring roll',
    'biscuit', 'cookie', 'cake', 'rusk', 'croissant', 'muffin', 'donut', 'doughnut', 'paratha',
    'wheat', 'atta', 'maida', 'suji', 'rava', 'semolina', 'upma', 'dalia', 'daliya', 'couscous',
  ].join('|'), 'i'),
};

/* Protein, carb and fat as shares of a food's own calories. Comparing
   these rather than grams is what makes two different portions of two
   different foods comparable at all. */
const split = per => {
  const k = per.kcal || 1;
  return { p: (per.p || 0) * 4 / k, c: (per.c || 0) * 4 / k, f: (per.f || 0) * 9 / k };
};

function openSwap(key, item, onDone) {
  const base = macrosFor(item.per100, item.grams);
  const orig = FOODS.find(f => f.id === item.ref);
  const want = split(item.per100);
  const on = { veg: false, rice: false, wheat: false };
  const list = el('div');

  function draw() {
    clear(list);
    const hits = FOODS
      .filter(f => f.id !== item.ref && (f.per100.kcal || 0) > 20)
      .filter(f => !on.veg || f.diet === 'veg')
      .filter(f => !on.rice || !AVOID.rice.test(f.n + ' ' + (f.alt || '')))
      .filter(f => !on.wheat || !AVOID.wheat.test(f.n + ' ' + (f.alt || '')))
      .map(f => {
        const r = split(f.per100);
        const d = Math.abs(r.p - want.p) + Math.abs(r.c - want.c) + Math.abs(r.f - want.f);
        return { f, d: d + (orig && f.grp === orig.grp ? 0 : 0.3) };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, 12);

    if (!hits.length) {
      list.append(el('div.fine', {}, 'Nothing in the library clears all of those at once.'));
      return;
    }

    for (const { f } of hits) {
      const gr = (base.kcal / (f.per100.kcal || 1)) * 100;
      const m = macrosFor(f.per100, gr);
      list.append(el('div.food-cell.cell-wrap', {},
        el('button.cell-main', {
          onclick: () => {
            removePlanned(key, item.id);
            addPlanned(key, {
              name: f.n, brand: '', ref: f.id, barcode: null,
              per100: f.per100, serv: f.serv || [], grams: Math.round(gr),
              grade: f.grade || 'C', method: 'portion', meal: item.meal,
            });
            haptic('success');
            toast(`Swapped for ${f.n}.`);
            sh.close(); onDone();
          },
        },
          el('span.fc-name', {}, f.n),
          el('span.fc-kcal', {},
            `${grams(gr)} · ${Math.round(m.p)}P ${Math.round(m.c)}C ${Math.round(m.f)}F`))));
    }
  }

  const chip = (id, label) => el('button.chip', {
    'aria-pressed': String(on[id]),
    onclick: e => {
      on[id] = !on[id];
      e.currentTarget.setAttribute('aria-pressed', String(on[id]));
      haptic('tap');
      draw();
    },
  }, label);

  draw();
  const sh = sheet({
    title: `Instead of ${item.name}`,
    body: el('div', {},
      el('div.fine', { style: { marginBottom: '12px' } },
        `Portioned to the same ${Math.round(base.kcal)} kcal, closest match to how it eats first.`),
      el('div.chips', { style: { marginBottom: '14px' } },
        chip('veg', 'Veg only'), chip('rice', 'No rice'), chip('wheat', 'No wheat')),
      list),
  });
  return sh;
}
