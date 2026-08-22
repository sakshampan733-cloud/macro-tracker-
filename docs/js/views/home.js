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

import { el, clear, icon, kcal, toast, sheet, confirmSheet, append } from '../ui.js';
import { flyToTotals, haptic } from '../feedback.js';
import { openMealLogger } from './meallog.js';
import { openMealBuilder } from './meal.js';
import { topWhoopAdvice } from '../coachwhoop.js';
import {
  get, totals, dayKey, MEALS, removeEntry, entryMacros, frequentFoods,
  recentFoods, mealsList, mealTotals, groupedEntries,
  favouriteFoods, toggleFavourite, isFavourite, toggleHidden, deleteFood,
} from '../store.js';
import { dayTargets } from './today.js';
import { openPortion } from './portion.js';
import { openScanner, openQuickAdd, openBuilder } from './add.js';
import { searchLocal, searchMeals, toItem } from '../search.js';
import { searchProducts, resolveBarcode, validEAN } from '../off.js';
import { openDish } from './dish.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

export function renderHome(root, ctx) {
  const s = get();
  const key = ctx.date || dayKey();
  const t = totals(key);
  const targets = dayTargets(s, key);

  clear(root);
  /* append() filters nulls; Element.append stringifies them, which is how
     a literal "null" ended up sitting under the readout whenever Whoop
     had nothing to say. */
  append(root,
    readout(t, targets, ctx),
    coachCard(s, targets, key, ctx),
    actions(ctx),
    picker(s, ctx, key),
    logSection(key, ctx),
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

/*
 * Four things you actually start from.
 *
 * "Make a meal" was reachable only from a tab that no longer exists, which
 * made the single most common action — combining ingredients you already
 * have into a dish you eat weekly — effectively undiscoverable. It gets a
 * button. The Indian dish estimator moved behind "Food", where it belongs:
 * it is a way of describing one thing you ate, not a way of building.
 */
/*
 * What Whoop has to say, on the screen where you log.
 *
 * This used to live only on Detail, which is the tab you open to read
 * rather than the one you open to eat — so the strap's influence on the
 * day was invisible at exactly the moment it mattered. It shows one card
 * at a time, and nothing at all when there is no strap data or nothing
 * worth saying.
 */
function coachCard(store, targets, key, ctx) {
  let advice = null;
  try { advice = topWhoopAdvice(store, targets, key); }
  catch { return null; }
  if (!advice) return null;

  const card = el('div.tile.coach-card.' + (advice.tone === 'warn' ? 'is-warn' : 'is-good'), {},
    el('div.coach-top', {},
      el('span.coach-tag', {}, 'WHOOP'),
      el('div.coach-head', {}, advice.headline)),
    el('div.coach-body', {}, advice.body));

  /* Named foods, tappable — a recommendation you cannot act on is a lecture. */
  if (advice.action && advice.action.kind === 'foods' && advice.action.picks.length) {
    const row = el('div.coach-picks');
    for (const p of advice.action.picks) {
      row.append(el('button.coach-pick', {
        onclick: () => openPortion(toItem(p.food), { dateKey: key, onSaved: ctx.refresh }),
      },
        el('span.cp-name', {}, p.food.n || p.food.name),
        el('span.cp-meta', {}, `${p.typical} g · ${p.wouldCost} kcal`)));
    }
    card.append(
      el('div.coach-action-label', {}, advice.action.label),
      row);
  }
  return card;
}

function actions(ctx) {
  return el('div.home-actions', {},
    el('button.chip', { onclick: () => openScanner(ctx) }, icon('scan', 17), 'Scan'),
    el('button.chip', { onclick: () => openMealBuilder({ onSaved: ctx.refresh }) },
      icon('pot', 17), 'Meal'),
    el('button.chip', { onclick: () => openBuilder({ onSaved: ctx.refresh }) }, icon('plus', 17), 'Food'),
    el('button.chip', { onclick: () => openQuickAdd(ctx) }, icon('bolt', 17), 'Quick'),
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
      const ref = f.id || f.ref || f.n;
      const cell = el('button.food-cell' + (isFavourite(ref) ? '.is-fav' : ''), {
        onclick: () => openPortion(f, { dateKey: key, onSaved: ctx.refresh }),
      },
        el('span.fc-name', {}, f.n),
        el('span.fc-kcal', {}, `${Math.round(per.kcal || 0)} · ${Math.round(per.p || 0)}P`));
      attachHold(cell, () => openFoodActions(f, ref, ctx));
      g.append(cell);
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

      /* Meals first. A saved meal is the thing you are most likely to be
         reaching for by name — "fried rice" should find the dish you built,
         not just the rice in it — and it was the one thing search could not
         see. */
      const meals = searchMeals(q);
      if (meals.length) {
        grid.append(label('Your meals'));
        const mg = el('div.food-grid');
        for (const m of meals) {
          const mt = mealTotals(m);
          mg.append(el('button.food-cell.is-meal', {
            onclick: () => openMealLogger(m, { dateKey: key, onSaved: ctx.refresh }),
          },
            el('span.fc-name', {}, m.name),
            el('span.fc-kcal', {}, `${Math.round(mt.kcal || 0)} · ${m.items.length} items`)));
        }
        grid.append(mg);
      }

      const hits = searchLocal(q);
      if (hits.length) {
        if (meals.length) grid.append(label('Foods'));
        grid.append(cells(hits.slice(0, 24).map(toItem)));
      }
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
          /* Opens rather than logs: you almost never eat exactly the
             portion you saved, and silently assuming you did was wrong. */
          onclick: () => openMealLogger(m, { dateKey: key, onSaved: ctx.refresh }),
        },
          el('span.fc-name', {}, m.name),
          el('span.fc-kcal', {}, `${Math.round(mt.kcal || 0)} · ${m.items.length} items`)));
      }
      grid.append(g);
    }

    const favs = favouriteFoods().map(toItem);
    if (favs.length) grid.append(label('Favourites'), cells(favs));

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

/*
 * The log, with a heading.
 *
 * Without one it sat flush against the bottom of the food grid — two
 * translucent panels sharing a single edge, which with blur and rounded
 * corners reads as one crashing into the other rather than as two
 * sections. A label separates them and says what the panel is.
 */
function logSection(key, ctx) {
  const log = miniLog(key, ctx);
  if (!log) return null;
  log.classList.add('home-log');
  return el('div.home-log-wrap', {},
    el('div.section-label', {}, el('span.micro', {}, 'Logged today')),
    log);
}

/*
 * The log.
 *
 * A meal you cooked is one thing you ate, so it is one line — the five
 * ingredients that went into it scattered through the list told you what
 * the app stored, not what you had. Tapping the line opens the parts.
 */
export function miniLog(key, ctx) {
  const rows = groupedEntries(key);
  if (!rows.length) return null;

  const bySitting = new Map(MEALS.map(m => [m, []]));
  for (const r of rows) {
    const sitting = r.kind === 'meal' ? r.meal : r.entry.meal;
    (bySitting.get(sitting) || bySitting.get('snack')).push(r);
  }

  const wrap = el('div.tile.flush');
  for (const m of MEALS) {
    const list = bySitting.get(m) || [];
    if (!list.length) continue;
    wrap.append(el('div.mini-head', {}, MEAL_LABELS[m]));

    for (const r of list) {
      if (r.kind === 'entry') {
        const mm = entryMacros(r.entry);
        wrap.append(entryRow(r.entry.name, mm.kcal, () => {
          removeEntry(key, r.entry.id); toast('Removed.'); ctx.refresh();
        }, () => openEntryDetail(r.entry, key, ctx)));
        continue;
      }

      const total = r.items.reduce((a, e) => a + (entryMacros(e).kcal || 0), 0);
      wrap.append(entryRow(r.name, total, () => {
        for (const e of r.items) removeEntry(key, e.id);
        toast(`${r.name} removed.`); ctx.refresh();
      }, () => openMealGroup(r, key, ctx), r.items.length));
    }
  }
  return wrap;
}

function entryRow(name, kcalValue, onRemove, onOpen, count = 0) {
  return el('div.mini-row', {},
    el('button.grow.mini-open', { onclick: onOpen },
      el('span', {}, name),
      count ? el('span.mini-count', {}, `${count} items`) : null,
      icon('chevron', 13)),
    el('span.num', {}, kcal(kcalValue)),
    el('button.mini-x', { 'aria-label': 'Remove ' + name, onclick: onRemove }, '\u00d7'));
}

/* What actually went on the plate, and the chance to correct it. */
function openMealGroup(group, key, ctx) {
  const body = el('div');
  const list = el('div.tile.flush');
  for (const e of group.items) {
    const mm = entryMacros(e);
    list.append(el('div.mini-row', {},
      el('button.grow.mini-open', { onclick: () => { sh.close(); openEntryDetail(e, key, ctx); } },
        el('span', {}, e.name),
        el('span.mini-count', {}, `${Math.round(e.grams)} g`),
        icon('chevron', 13)),
      el('span.num', {}, kcal(mm.kcal)),
      el('button.mini-x', {
        'aria-label': 'Remove ' + e.name,
        onclick: () => {
          removeEntry(key, e.id);
          toast('Removed.');
          sh.close(); ctx.refresh();
        },
      }, '\u00d7')));
  }

  const t = group.items.reduce((a, e) => {
    const m = entryMacros(e);
    a.kcal += m.kcal || 0; a.p += m.p || 0; a.c += m.c || 0; a.f += m.f || 0;
    return a;
  }, { kcal: 0, p: 0, c: 0, f: 0 });

  body.append(
    el('div.tile.tile-hero', {},
      el('div.readout', {},
        el('div', {},
          el('div.micro', {}, MEAL_LABELS[group.meal] || 'Logged'),
          el('div.readout-main', { style: { fontSize: '34px' } }, Math.round(t.kcal))),
        el('div.readout-side', {},
          el('div.micro', {}, 'P · C · F'),
          el('div.v', {}, `${Math.round(t.p)} · ${Math.round(t.c)} · ${Math.round(t.f)}`)))),
    el('div.section-label', {}, el('span.micro', {}, 'What went in')),
    list,
    el('div.fine', { style: { marginTop: '8px' } },
      'Tap an ingredient to change how much of it you had.'));

  const sh = sheet({ title: group.name, body });
  return sh;
}

function openEntryDetail(entry, key, ctx) {
  openPortion({ n: entry.name, brand: entry.brand, per100: entry.per100, serv: entry.serv,
                barcode: entry.barcode, id: entry.ref },
    { dateKey: key, entry, onSaved: ctx.refresh });
}

/*
 * Press and hold.
 *
 * A grid cell has one obvious job — log this — so the second action has
 * nowhere to live without adding a button to every tile and making the
 * grid busier than the list it replaced. Hold is the iOS convention for
 * "more about this thing", and it costs nothing until used.
 *
 * The tricky part is that a hold must not also fire the tap, and must not
 * fire while you are scrolling the grid with your finger down.
 */
const HOLD_MS = 420;
const HOLD_SLOP = 10;

function attachHold(node, onHold) {
  let timer = null, sx = 0, sy = 0, fired = false;

  const cancel = () => { clearTimeout(timer); timer = null; };

  node.addEventListener('pointerdown', e => {
    if (e.button != null && e.button !== 0) return;
    fired = false; sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => {
      fired = true;
      haptic('select');
      onHold();
    }, HOLD_MS);
  });

  node.addEventListener('pointermove', e => {
    if (!timer) return;
    if (Math.abs(e.clientX - sx) > HOLD_SLOP || Math.abs(e.clientY - sy) > HOLD_SLOP) cancel();
  });

  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    node.addEventListener(ev, cancel);
  }

  /* Swallow the click that follows a completed hold, in the capture phase,
     so the portion sheet does not open behind the menu. */
  node.addEventListener('click', e => {
    if (fired) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; }
  }, true);

  node.addEventListener('contextmenu', e => e.preventDefault());
}

function openFoodActions(food, ref, ctx) {
  const fav = isFavourite(ref);
  const s = get();
  const isMine = !!(s.library && s.library[ref]);

  const sh = sheet({
    title: food.n,
    body: el('div', {},
      el('div.tile.flush', {},
        action(fav ? 'Remove from favourites' : 'Add to favourites', 'star', () => {
          toggleFavourite(ref);
          toast(fav ? 'Removed from favourites.' : 'Added to favourites.');
          sh.close(); ctx.refresh();
        }),
        action('Hide from suggestions', 'eye', () => {
          toggleHidden(ref);
          toast('Hidden. Your log is unchanged.');
          sh.close(); ctx.refresh();
        }),
        isMine ? action('Delete this food', 'trash', async () => {
          if (!(await confirmSheet({
            title: 'Delete ' + food.n + '?',
            message: 'It goes from your library. Days you already logged it on keep their numbers.',
            confirmLabel: 'Delete', danger: true,
          }))) return;
          deleteFood(ref);
          toast('Deleted.');
          sh.close(); ctx.refresh();
        }, true) : null),
      el('div.fine', { style: { marginTop: '10px' } },
        'Hiding only stops this being suggested. Nothing you have already logged changes.')),
  });
  return sh;
}

const action = (label, ic, onclick, danger = false) =>
  el('button.row' + (danger ? '.is-danger' : ''), { onclick },
    icon(ic, 17), el('span.grow', {}, label), icon('chevron', 14));
