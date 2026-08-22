/*
 * Home.
 *
 * One job: log food, and show the three numbers that decide what to log
 * next. Everything that explains, qualifies or analyses lives one tab
 * across, because none of it changes what you tap.
 *
 * The layout is fixed rather than flowing: the readout occupies the top,
 * the grid fills the rest, and neither grows with the size of your log.
 * Adding your fourth meal of the day should not be further down the page
 * than adding your first.
 */

import { el, clear, icon, kcal, toast } from '../ui.js';
import {
  get, totals, dayKey, byMeal, MEALS, removeEntry, entryMacros, frequentFoods,
  recentFoods, mealsList, mealTotals, logMeal,
} from '../store.js';
import { dayTargets } from './today.js';
import { openPortion } from './portion.js';
import { openScanner, openQuickAdd, openBuilder, searchLocal, toItem } from './add.js';
import { searchProducts, resolveBarcode, validEAN } from '../off.js';
import { openDish } from './dish.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

export function renderHome(root, ctx) {
  const s = get();
  const key = ctx.date || dayKey();
  const t = totals(key);
  const targets = dayTargets(s, key);

  clear(root);
  root.append(
    readout(t, targets, ctx),
    actions(ctx),
    picker(s, ctx, key),
    miniLog(key, ctx),
  );
}

/*
 * The readout.
 *
 * Calories left is the headline because it is the number that ends the
 * day; the three macros sit under it as cups you can read at a glance.
 * The whole block is one button into the detail tab — there is nothing
 * here you can tap and get something other than "explain this".
 */
function readout(t, targets, ctx) {
  const left = Math.max(0, Math.round((targets.kcal || 0) - (t.kcal || 0)));
  const over = (t.kcal || 0) > (targets.kcal || 0);

  /*
   * A cup that is merely full and a cup that is overflowing have to look
   * different. Clamping the fill at 100% made 215 g of carbs against a
   * 203 g target indistinguishable from hitting it exactly, which is the
   * one thing this readout exists to tell you.
   */
  const cup = (name, have, want, colour) => {
    const ratio = want ? have / want : 0;
    const over = ratio > 1.02;
    const pct = Math.min(1, ratio);
    return el('div.cup' + (over ? '.is-over' : ''), {},
      el('div.cup-bar', {},
        el('i', { style: { height: (pct * 100).toFixed(1) + '%', background: over ? 'var(--warn)' : colour } }),
        over ? el('span.cup-over', {}, '+' + Math.round(have - want)) : null),
      el('div.cup-n', {}, Math.round(have) + ' g'),
      el('div.cup-l', {}, name),
      el('div.cup-t', {}, over ? 'over ' + Math.round(want || 0) : 'of ' + Math.round(want || 0)));
  };

  return el('button.tile.tile-hero.readout-block', {
    onclick: () => ctx.go('detail'),
    'aria-label': 'Open the full breakdown',
  },
    el('div.readout-top', {},
      el('div', {},
        el('div.micro', {}, over ? 'Over by' : 'Calories left'),
        el('div.readout-main', {},
          over ? Math.round((t.kcal || 0) - (targets.kcal || 0)) : left)),
      el('div.readout-side', {},
        el('div.micro', {}, 'Eaten'),
        el('div.v', {}, kcal(t.kcal || 0)),
        el('div.micro', { style: { marginTop: '4px' } }, 'of ' + Math.round(targets.kcal || 0)))),

    el('div.cups', {},
      cup('Protein', t.p || 0, targets.p, 'var(--m-p)'),
      cup('Carbs', t.c || 0, targets.c, 'var(--m-c)'),
      cup('Fat', t.f || 0, targets.f, 'var(--m-f)')),

    el('div.readout-more', {}, 'Full breakdown', icon('chevron', 14)),
  );
}

function actions(ctx) {
  return el('div.home-actions', {},
    el('button.chip', { onclick: () => openScanner(ctx) }, icon('scan', 17), 'Scan'),
    el('button.chip', { onclick: () => openQuickAdd(ctx) }, icon('bolt', 17), 'Quick'),
    el('button.chip', { onclick: () => openDish({ dateKey: ctx.date || dayKey(), onSaved: ctx.refresh }) },
      icon('pot', 17), 'Dish'),
    el('button.chip', { onclick: () => openBuilder({ onSaved: ctx.refresh }) }, icon('plus', 17), 'New'),
  );
}

/*
 * Search and grid share one region: typing replaces the grid rather than
 * pushing it down the page, so the results appear where your eye already
 * is and the screen never gets taller than it started.
 */
function picker(s, ctx, key) {
  const grid = el('div');
  const wrap = el('div', {});

  /*
   * Local results are instant; the packaged-product lookup waits for you to
   * stop typing. Firing a request per keystroke meant "lays" launched three
   * overlapping searches that raced each other, and the loser frequently
   * won — which is why a query with 22 000 matches rendered as "nothing
   * matches". It also rate-limits the API for no benefit.
   */
  let debounce;
  const search = el('input', {
    type: 'search', placeholder: 'Search foods',
    autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
    oninput: e => {
      const q = e.target.value;
      clearTimeout(debounce);
      drawLocal(q);
      debounce = setTimeout(() => drawRemote(q), 320);
    },
  });

  function cells(items) {
    const g = el('div.food-grid');
    for (const f of items) {
      const per = f.per100 || {};
      g.append(el('button.food-cell', {
        onclick: () => openPortion(f, { dateKey: key, onSaved: ctx.refresh }),
      },
        el('span.fc-name', {}, f.n),
        el('span.fc-kcal', {}, `${Math.round(per.kcal || 0)} · ${Math.round(per.p || 0)}P`)));
    }
    return g;
  }

  let seq = 0;
  const remote = el('div');

  /* Whatever we already hold, drawn on the keystroke. */
  function drawLocal(q) {
    q = (q || '').trim();
    seq++;                       // any in-flight remote result is now stale
    clear(remote);
    if (q.length >= 2) {
      clear(grid);
      const hits = searchLocal(q);
      if (hits.length) grid.append(cells(hits.slice(0, 24).map(toItem)));
      grid.append(remote);
      return;
    }
    drawShortcuts();
  }

  /* The network half, once you have stopped typing. */
  async function drawRemote(q) {
    q = (q || '').trim();
    if (q.length < 2) return;
    const mine = ++seq;

    /* A typed barcode is the fallback for a scuffed or badly lit packet,
       so it has to land in the same place a scan does. */
    const digits = q.replace(/\s/g, '');
    if (validEAN(digits)) {
      remote.replaceChildren(el('div.grid-empty', {}, `Looking up ${digits}…`));
      const food = await resolveBarcode(digits);
      if (mine !== seq) return;
      clear(grid);
      grid.append(remote);
      remote.replaceChildren(food.found
        ? cells([toItem(food)])
        : el('div.grid-empty', {}, 'No entry for that barcode.',
            el('button.btn.sm', { style: { marginTop: '10px' },
              onclick: () => openBuilder({ barcode: digits, onSaved: ctx.refresh }) },
              'Enter it from the packet')));
      return;
    }

    const localCount = searchLocal(q).length;
    remote.replaceChildren(el('div.grid-empty', {}, 'Checking packaged products…'));
    const r = await searchProducts(q);
    if (mine !== seq) return;

    if (r.products && r.products.length) {
      remote.replaceChildren(label('Packaged'), cells(r.products.map(toItem).slice(0, 18)));
    } else if (!localCount) {
      remote.replaceChildren(el('div.grid-empty', {},
        r.offline ? 'Packaged search is unreachable right now.' : `Nothing matches “${q}”.`,
        el('button.btn.sm', { style: { marginTop: '10px' },
          onclick: () => openBuilder({ name: q, onSaved: ctx.refresh }) }, 'Build it')));
    } else {
      remote.replaceChildren();
    }
  }

  function drawShortcuts() {
    clear(grid);

    const meals = mealsList();
    if (meals.length) {
      grid.append(label('Your meals'));
      const g = el('div.food-grid');
      for (const m of meals.slice(0, 6)) {
        const mt = mealTotals(m);
        g.append(el('button.food-cell.is-meal', {
          onclick: () => { logMeal(key, m.id); toast(`${m.name} logged.`); ctx.refresh(); },
        },
          el('span.fc-name', {}, m.name),
          el('span.fc-kcal', {}, `${Math.round(mt.kcal || 0)} · ${m.items.length} items`)));
      }
      grid.append(g);
    }

    const freq = frequentFoods(18).map(toItem);
    if (freq.length) grid.append(label('Most eaten'), cells(freq));

    const recent = recentFoods(12).map(toItem);
    if (recent.length) grid.append(label('Recent'), cells(recent));

    if (!meals.length && !freq.length && !recent.length) {
      grid.append(el('div.grid-empty', {},
        'Scan something or build a food, and it lands here for good.'));
    }
  }

  const label = text => el('div.section-label', {}, el('span.micro', {}, text));

  wrap.append(el('div.field.home-search', {}, icon('search', 16), search), grid);
  drawShortcuts();
  return wrap;
}

/* The log, compact. It answers "did I already add that?" and nothing more;
   the detail tab carries the version with methods and error bars. */
export function miniLog(key, ctx) {
  const groups = byMeal(key);
  const any = MEALS.some(m => groups[m] && groups[m].length);
  if (!any) return null;

  const wrap = el('div.tile.flush');
  for (const m of MEALS) {
    const list = groups[m] || [];
    if (!list.length) continue;
    wrap.append(el('div.mini-head', {}, MEAL_LABELS[m]));
    for (const e of list) {
      const mm = entryMacros(e);
      wrap.append(el('div.mini-row', {},
        el('span.grow', {}, e.name),
        el('span.num', {}, kcal(mm.kcal)),
        el('button.mini-x', {
          'aria-label': 'Remove ' + e.name,
          onclick: () => { removeEntry(key, e.id); toast('Removed.'); ctx.refresh(); },
        }, '×')));
    }
  }
  return wrap;
}
