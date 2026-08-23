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
  get, totals, dayKey, shiftDay, MEALS, removeEntry, entryMacros, frequentFoods,
  recentFoods, mealsList, mealTotals, groupedEntries,
  favouriteFoods, toggleFavourite, isFavourite, toggleHidden, deleteFood, deleteMeal,
  scannedFoods, builtFoods,
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
    header(key, ctx),
    readout(t, targets, ctx),
    coachCard(s, targets, key, ctx),
    actions(ctx),
    picker(s, ctx, key),
    logSection(key, ctx),
  );
}

/*
 * The header.
 *
 * The wordmark bar was a logo, a spacer and a gear — three things none of
 * which you need while logging lunch, taking the most valuable strip of
 * the screen to tell you which app you already knew you had opened.
 *
 * This says what day it is and lets you change it, which matters because
 * Home could not reach yesterday at all: you had to go to Detail to log
 * something you forgot. The greeting is there because the top of a home
 * screen reading as a blank shelf was the actual complaint, and a line
 * that changes through the day makes it feel occupied rather than
 * decorated.
 */
function header(key, ctx) {
  const today = dayKey();
  const isToday = key === today;
  const d = new Date(key + 'T12:00:00');

  const label = isToday
    ? 'Today'
    : (key === shiftDay(today, -1) ? 'Yesterday'
      : d.toLocaleDateString(undefined, { weekday: 'long' }));

  const sub = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

  const step = n => {
    const next = shiftDay(key, n);
    if (next > today) return;
    ctx.go('home', { date: next });
  };

  return el('div.home-head', {},
    el('div.hh-top', {},
      el('span.hh-greet', {}, greeting(), recoveryNote(key)),
      el('button.x-btn', {
        'aria-label': 'Settings',
        onclick: () => ctx.go('settings'),
      }, icon('gear', 17))),

    el('div.hh-date', {},
      el('button.hh-arrow', { 'aria-label': 'Previous day', onclick: () => step(-1) },
        icon('chevron-left', 18)),
      el('div.hh-when', {},
        el('div.hh-day', {}, label),
        el('div.hh-sub', {}, sub)),
      el('button.hh-arrow' + (isToday ? '.is-off' : ''), {
        'aria-label': 'Next day', disabled: isToday, onclick: () => step(1),
      }, icon('chevron', 18))),

    isToday ? null : el('button.btn.sm.hh-back', {
      onclick: () => ctx.go('home', { date: today }),
    }, 'Back to today'));
}

/*
 * One strap figure beside the greeting, chosen by the hour.
 *
 * A fixed metric is wrong two thirds of the day. What you want to know
 * changes: in the morning it is how the night went, by the middle of the
 * day it is what you have to spend, and by the evening it is what you
 * actually did with it.
 *
 * Strain is the clearest case — it accumulates as the day goes on, so a
 * strain figure at eight in the morning is a number about nothing. Sleep
 * is the opposite: settled the moment you wake and stale by dinner.
 *
 * If the hour's own metric is missing the others stand in, because a true
 * figure of a different kind beats an empty greeting — the label always
 * says which one you are looking at.
 */
const STRAP_METRICS = {
  sleep: {
    read: r => (r.sleepH != null && Number.isFinite(r.sleepH)) ? r.sleepH : null,
    text: v => `slept ${v.toFixed(1)}h`,
    colour: (v, r) => {
      const p = r.sleepPerf;
      if (p == null) return 'var(--text-2)';
      return p >= 85 ? 'var(--good)' : p >= 70 ? 'var(--caution)' : 'var(--warn)';
    },
  },
  recovery: {
    read: r => (r.recovery != null && Number.isFinite(r.recovery)) ? r.recovery : null,
    text: v => `recovery ${Math.round(v)}%`,
    colour: v => v >= 67 ? 'var(--good)' : v >= 34 ? 'var(--caution)' : 'var(--warn)',
  },
  strain: {
    read: r => (r.strain != null && Number.isFinite(r.strain)) ? r.strain : null,
    text: v => `strain ${v.toFixed(1)}`,
    colour: () => 'var(--m-p)',
  },
};

/* Which one the hour calls for, then the others as fallbacks. */
function strapOrder(hour) {
  if (hour < 11) return ['sleep', 'recovery', 'strain'];
  if (hour < 18) return ['recovery', 'strain', 'sleep'];
  return ['strain', 'recovery', 'sleep'];
}

function recoveryNote(key, now = new Date()) {
  const row = get().whoop?.rows?.[key];
  if (!row) return null;

  /* On a past day the hour you happen to be reading it makes no odds —
     the day is over, so show what it came to. */
  const past = key !== dayKey();
  const order = past ? ['strain', 'recovery', 'sleep'] : strapOrder(now.getHours());

  for (const name of order) {
    const m = STRAP_METRICS[name];
    const v = m.read(row);
    if (v == null) continue;
    return el('span.hh-rec', { style: { color: m.colour(v, row) } },
      ' \u00b7 ' + m.text(v));
  }
  return null;
}

/* Enough of a nod to the time of day to feel present, without pretending
   to know anything about how it is going. */
function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Late one';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
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
      /*
       * A visible button rather than a long press.
       *
       * Press-and-hold on a web page triggers the OS text-selection
       * callout before any JavaScript sees it, so on an iPhone holding a
       * tile selected half the screen instead of opening a menu. There is
       * no reliable way to have both, and a control you can see is better
       * than a gesture you have to be told about anyway.
       */
      const cell = el('div.food-cell.cell-wrap' + (isFavourite(ref) ? '.is-fav' : ''), {},
        el('button.cell-main', {
          onclick: () => openPortion(f, { dateKey: key, onSaved: ctx.refresh }),
        },
          el('span.fc-name', {}, f.n),
          el('span.fc-kcal', {}, `${Math.round(per.kcal || 0)} · ${Math.round(per.p || 0)}P`)),
        el('button.cell-more', {
          'aria-label': `More for ${f.n}`,
          onclick: e => { e.stopPropagation(); openFoodActions(f, ref, ctx); },
        }, '\u22EF'));
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
          mg.append(el('div.food-cell.is-meal.cell-wrap', {},
            el('button.cell-main', {
              onclick: () => openMealLogger(m, { dateKey: key, onSaved: ctx.refresh }),
            },
              el('span.fc-name', {}, m.name),
              el('span.fc-kcal', {}, `${Math.round(mt.kcal || 0)} · ${m.items.length} items`)),
            el('button.cell-more', {
              'aria-label': `More for ${m.name}`,
              onclick: e => { e.stopPropagation(); openMealActions(m, ctx); },
            }, '\u22EF')));
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
        g.append(el('div.food-cell.is-meal.cell-wrap', {},
          el('button.cell-main', {
            /* Opens rather than logs: you almost never eat exactly the
               portion you saved, and assuming you did was wrong. */
            onclick: () => openMealLogger(m, { dateKey: key, onSaved: ctx.refresh }),
          },
            el('span.fc-name', {}, m.name),
            el('span.fc-kcal', {}, `${Math.round(mt.kcal || 0)} · ${m.items.length} items`)),
          el('button.cell-more', {
            'aria-label': `More for ${m.name}`,
            onclick: e => { e.stopPropagation(); openMealActions(m, ctx); },
          }, '\u22EF')));
      }
      grid.append(g);
    }

    const favs = favouriteFoods().map(toItem);
    if (favs.length) grid.append(label('Favourites'), cells(favs));

    /*
     * Your own foods, split by where they came from.
     *
     * "Most eaten" and "Recent" are computed from the log, so a food you
     * saved but have not eaten yet appears in neither — which is exactly
     * the food you are most likely to be hunting for, having just scanned
     * it. These rows are the library itself, and separating scanned from
     * hand-entered matters because you remember which one a thing was.
     */
    const scanned = scannedFoods(12).map(toItem);
    if (scanned.length) grid.append(label('Scanned'), cells(scanned));

    const built = builtFoods(12).map(toItem);
    if (built.length) grid.append(label('Added by hand'), cells(built));

    const freq = frequentFoods(18).map(toItem);
    if (freq.length) grid.append(label('Most eaten'), cells(freq));

    const recent = recentFoods(12).map(toItem);
    if (recent.length) grid.append(label('Recent'), cells(recent));

    if (!meals.length && !freq.length && !recent.length && !scanned.length && !built.length) {
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

/*
 * The meal's own actions.
 *
 * Editing one used to be reachable only from a route with no tab, so
 * changing an ingredient — swapping the paneer in your fried rice — had
 * no path from the screen you actually use.
 */
function openMealActions(meal, ctx) {
  const sh = sheet({
    title: meal.name,
    body: el('div', {},
      el('div.tile.flush', {},
        action('Edit ingredients', 'edit', () => {
          sh.close();
          openMealBuilder({ meal, onSaved: ctx.refresh });
        }),
        action('Delete this meal', 'trash', async () => {
          if (!(await confirmSheet({
            title: 'Delete ' + meal.name + '?',
            message: 'The saved recipe goes. Days you already logged it on keep their entries.',
            confirmLabel: 'Delete', danger: true,
          }))) return;
          deleteMeal(meal.id);
          toast('Deleted.');
          sh.close(); ctx.refresh();
        }, true)),
      el('div.fine', { style: { marginTop: '10px' } },
        'Editing changes the recipe from now on. Meals you have already logged keep the amounts they were logged with.')),
  });
  return sh;
}
