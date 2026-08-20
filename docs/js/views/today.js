/*
 * Today.
 *
 * The whole day on one screen: what you've eaten, how far that is from
 * where you're aiming, and how confidently you actually know it.
 */

import {
  el, clear, rail, macroRail, kcal, grams, g, clock, dateLabel, icon,
  toast, sheet, confirmSheet, empty,
} from '../ui.js';
import {
  get, commit, day, totals, byMeal, MEALS, METHODS, dayKey, shiftDay,
  removeEntry, addWater, undoWater, entryMacros, setWeight, saveMeal,
} from '../store.js';
import { bestTDEE, macroTargets, waterTarget } from '../nutrition.js';
import { dayFactor } from '../whoop.js';
import { openPortion } from './portion.js';
import { openDish } from './dish.js';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

export function renderToday(root, ctx) {
  const s = get();
  const key = ctx.date || dayKey();
  const t = totals(key);
  const targets = dayTargets(s, key);

  clear(root);

  root.append(
    dateStrip(key, ctx),
    energyTile(t, targets, s, key, ctx),
    macroTile(t, targets),
    waterTile(t, targets, key, ctx),
    mealsTile(key, ctx),
  );
}

/*
 * The day's targets, adjusted for what the day actually was.
 *
 * A flat daily number is wrong on both ends: it overfeeds a rest day and
 * starves a training day. So the *level* comes from your best maintenance
 * figure, and the day-to-day *movement* comes from how today's Whoop burn
 * compares with your own Whoop average. Whoop's absolute calories are not
 * trusted; its sense of a hard day against an easy one is.
 */
export function dayTargets(s, key) {
  const tdee = bestTDEE(s, s.profile);
  const base = macroTargets(s.profile, tdee.kcal);
  const day = dayFactor(s, key);

  if (day && s.settings.tdeeSource !== 'predicted') {
    const adjusted = macroTargets(s.profile, tdee.kcal * day.factor);
    return { ...adjusted, source: 'whoop-day', tdee, day, base };
  }
  return { ...base, source: tdee.source, tdee, base };
}

function dateStrip(key, ctx) {
  const today = dayKey();
  const isToday = key === today;
  return el('div.between', { style: { margin: '2px 0 14px' } },
    el('button.btn.sm.ghost', {
      'aria-label': 'Previous day',
      onclick: () => ctx.go('today', { date: shiftDay(key, -1) }),
    }, icon('back', 16)),
    el('div', { style: { textAlign: 'center' } },
      el('h1', {}, dateLabel(key)),
      el('div.micro', { style: { marginTop: '2px' } }, key)),
    el('button.btn.sm.ghost', {
      'aria-label': 'Next day',
      disabled: isToday,
      onclick: () => ctx.go('today', { date: shiftDay(key, 1) }),
    }, icon('chevron', 16)),
  );
}

/* ── The hero: energy on a caliper rail ─────────────────────────────── */

/*
 * Which number sits in the big slot: what's left, or what's gone in.
 *
 * Both are the same fact from opposite ends, and which one is useful
 * depends on the moment — "how much room have I got" before a meal,
 * "what have I actually had" when reviewing. So it toggles on tap and
 * remembers the choice, rather than picking a side for you.
 */
function energyTile(t, targets, s, key, ctx) {
  const left = targets.kcal - t.kcal;
  const over = t.kcal > targets.kcal * 1.02;
  const showEaten = s.settings.energyView === 'eaten';

  const bigLabel = showEaten ? 'Eaten' : (over ? 'Over by' : 'Remaining');
  const bigValue = showEaten ? t.kcal : Math.abs(left);
  const bigColour = showEaten ? 'var(--text)' : (over ? 'var(--warn)' : 'var(--text)');
  const sideLabel = showEaten ? (over ? 'Over / target' : 'Left / target') : 'Eaten / target';
  const sideValue = showEaten
    ? `${kcal(Math.abs(left))} / ${kcal(targets.kcal)}`
    : `${kcal(t.kcal)} / ${kcal(targets.kcal)}`;

  const tile = el('div.tile', {},
    el('button', {
      style: { display: 'block', width: '100%', textAlign: 'left', padding: 0, background: 'none' },
      'aria-label': `Showing ${bigLabel.toLowerCase()}. Tap to switch.`,
      onclick: () => {
        commit(st => { st.settings.energyView = showEaten ? 'remaining' : 'eaten'; });
        ctx.refresh();
      },
    },
    el('div.readout', {},
      el('div', {},
        el('div.micro', {}, bigLabel, el('span', { style: { marginLeft: '6px', opacity: '.5' } }, '⇄')),
        el('div.readout-main', {
          style: { color: bigColour },
        }, kcal(bigValue),
          t.sigma > 0 ? el('span.readout-pm', {}, ` ±${Math.round(t.sigma)}`) : null)),
      el('div.readout-side', {},
        el('div.micro', {}, sideLabel),
        el('div.v', {}, sideValue)))),

    rail({ value: t.kcal, target: targets.kcal, sigma: t.sigma, over }),

    el('div.rail-caption', {},
      el('span.micro', {}, '0'),
      el('span.micro', {}, confidenceLabel(t)),
      el('span.micro', {}, kcal(Math.round(targets.kcal * 1.25)))),

    el('div.divider'),
    targetBasis(targets, s, key),
    ...safetyNotes(targets),
  );
  return tile;
}

/*
 * Say plainly when the app has overridden what was asked for, or when the
 * pace being aimed at is one that usually costs muscle. A tracker that
 * silently hands back a smaller number is not being helpful.
 */
function safetyNotes(targets) {
  const b = targets.basis || {};
  const out = [];

  if (b.floored) {
    out.push(el('div.note.warn', {},
      el('div', {},
        el('b', {}, 'Held at your resting burn'),
        el('div.fine', { style: { marginTop: '3px' } },
          `The pace you picked works out to ${kcal(b.wanted)} kcal a day, which is below the `
          + `${kcal(b.floor.bmr)} your body spends just existing. Eating under that for weeks tends to cost muscle `
          + `and stall progress anyway, so the target is held here. Pick a slower pace in Settings if you want the number to mean something.`))));
  }

  if (b.rate && !b.floored) {
    out.push(el('div', { class: 'note ' + (b.rate.severe ? 'warn' : 'info') },
      el('div', {},
        el('b', {}, b.rate.severe ? 'That is fast' : 'That is brisk'),
        el('div.fine', { style: { marginTop: '3px' } },
          `You are aiming to lose ${b.rate.pctPerWeek.toFixed(1)}% of your bodyweight a week. `
          + `Past about 1% the weight still comes off, but more of it is muscle. `
          + `Around ${b.rate.suggested} kg a week would be the steadier choice at your size.`))));
  }

  return out;
}

function confidenceLabel(t) {
  if (!t.count) return 'nothing logged yet';
  const pct = Math.round((t.sigma / Math.max(1, t.kcal)) * 100);
  if (pct <= 4) return `known to ±${pct}%`;
  if (pct <= 9) return `±${pct}% — solid`;
  if (pct <= 16) return `±${pct}% — weigh more of it`;
  return `±${pct}% — mostly estimated`;
}

/*
 * Say where the target came from. A number you can't trace is a number you
 * won't trust, and an untrusted target gets ignored.
 */
function targetBasis(targets, s, key) {
  const parts = [];

  if (targets.source === 'whoop-day') {
    const d = targets.day;
    const pct = Math.round((d.factor - 1) * 100);
    const harder = pct > 0;
    parts.push(el('div.flex', {},
      icon('bolt', 15),
      el('div', {},
        el('div', { style: { fontSize: '13px' } },
          pct === 0
            ? 'An average day by Whoop, so the usual target stands.'
            : `Whoop rates today ${Math.abs(pct)}% ${harder ? 'harder' : 'easier'} than your 28-day average`
              + `${d.strain != null ? `, strain ${d.strain.toFixed(1)}` : ''}, so the target moved `
              + `${harder ? 'up' : 'down'} to match.`),
        el('div.fine', { style: { marginTop: '3px' } },
          `Level from your ${targets.tdee.source} maintenance of ${kcal(targets.tdee.kcal)} kcal; `
          + `a flat day would be ${kcal(targets.base.kcal)}.`
          + (d.clamped ? ' Capped — a single day is not allowed to swing the target further.' : '')))));
  } else {
    const tdee = targets.tdee;
    const label = { adaptive: 'Adaptive', whoop: 'Whoop', predicted: 'Formula' }[tdee.source] || 'Estimate';
    parts.push(el('div.flex', {},
      icon(tdee.source === 'adaptive' ? 'check' : 'info', 15),
      el('div', {},
        el('div', { style: { fontSize: '13px' } },
          `${label} maintenance ${kcal(tdee.kcal)} kcal`,
          tdee.sigma ? ` ±${tdee.sigma}` : '',
          `, ${targets.basis.delta >= 0 ? '+' : ''}${targets.basis.delta} to ${targets.basis.rateKgPerWeek >= 0 ? 'gain' : 'lose'} ${Math.abs(targets.basis.rateKgPerWeek)} kg a week.`),
        el('div.fine', { style: { marginTop: '3px' } }, tdee.why || ''))));
  }
  return el('div.stack', {}, ...parts);
}

/* ── Macros ─────────────────────────────────────────────────────────── */

function macroTile(t, targets) {
  return el('div.tile', {},
    el('div.macros', {},
      macroRail({ name: 'Protein', value: t.p, target: targets.p, hue: 'var(--m-p)' }),
      macroRail({ name: 'Carbs',   value: t.c, target: targets.c, hue: 'var(--m-c)' }),
      macroRail({ name: 'Fat',     value: t.f, target: targets.f, hue: 'var(--m-f)' }),
      macroRail({ name: 'Fibre',   value: t.fib, target: targets.fib, hue: 'var(--m-fib)' })),
    el('div.divider'),
    el('div.micro', { style: { marginBottom: '8px' } }, 'Keep under'),
    el('div.macros', {},
      ceilingRow('Sugar', t.sug, targets.sug, 'g'),
      ceilingRow('Sat fat', t.sat, targets.sat, 'g'),
      ceilingRow('Sodium', t.na, targets.na, 'mg')),
  );
}

/*
 * A ceiling reads the opposite way to a target: the bar filling up is bad
 * news, so it colours by how close to the limit you are rather than how
 * close to done. Amber from three quarters, red past the line.
 */
function ceilingRow(name, value, limit, unit) {
  const pct = limit > 0 ? (value / limit) * 100 : 0;
  const hue = pct > 100 ? 'var(--warn)' : pct > 75 ? 'var(--caution)' : 'var(--good)';
  return el('div.macro-row', {},
    el('div.macro-head', {},
      el('span.macro-name', { style: { color: hue } }, name),
      el('span.macro-val', {},
        el('b', {}, unit === 'mg' ? String(Math.round(value)) : grams(value)),
        el('span.of', {}, ` / ${Math.round(limit)}${unit} max`))),
    rail({ value, target: limit, compact: true, hue, over: pct > 100 }));
}

/* ── Water ──────────────────────────────────────────────────────────── */

function waterTile(t, targets, key, ctx) {
  const s = get();
  const goal = targets.water;
  const glassMl = s.settings.glassMl || 250;
  const glasses = Math.ceil(goal / glassMl);
  const full = Math.floor(t.water / glassMl);
  const partial = (t.water % glassMl) / glassMl;

  const grid = el('div.water-grid');
  for (let i = 0; i < glasses; i++) {
    const cls = i < full ? 'glass full' : (i === full && partial > 0.05 ? 'glass part' : 'glass');
    const node = el('div', { class: cls, 'aria-hidden': 'true' });
    if (i === full && partial > 0.05) node.style.setProperty('--lvl', Math.round(partial * 100) + '%');
    grid.append(node);
  }

  return el('div.tile', {},
    el('div.tile-head', {},
      el('div.flex', {}, icon('drop', 16), el('h3', {}, 'Water')),
      el('span.num', { style: { fontSize: '13px' } },
        `${(t.water / 1000).toFixed(2)} / ${(goal / 1000).toFixed(1)} L`)),
    grid,
    el('div.btn-row', {},
      el('button.btn.sm', { onclick: () => { addWater(key, glassMl); ctx.refresh(); } }, `+ ${glassMl} ml`),
      el('button.btn.sm', { onclick: () => { addWater(key, 500); ctx.refresh(); } }, '+ 500 ml'),
      el('button.btn.sm.ghost', {
        onclick: () => { undoWater(key); ctx.refresh(); },
        'aria-label': 'Undo last water entry',
      }, 'Undo')),
  );
}

/* ── Meals ──────────────────────────────────────────────────────────── */

function mealsTile(key, ctx) {
  const groups = byMeal(key);
  const anything = Object.values(groups).some(list => list.length);

  if (!anything) {
    return el('div.tile', {},
      empty('Nothing logged yet',
        'Scan a barcode, pick from your foods, or enter macros straight off a packet.',
        el('button.btn.primary', { onclick: () => ctx.go('add') }, 'Add the first item')));
  }

  const tile = el('div.tile.flush');
  for (const meal of MEALS) {
    const list = groups[meal];
    if (!list.length) continue;

    const mt = list.reduce((a, e) => {
      const m = entryMacros(e);
      a.kcal += m.kcal; a.p += m.p; return a;
    }, { kcal: 0, p: 0 });

    tile.append(
      el('div.meal-head', {},
        el('span.name', {}, MEAL_LABELS[meal]),
        el('span.amt', {}, `${kcal(mt.kcal)} kcal · ${Math.round(mt.p)} g P`),
        list.length > 1
          ? el('button.btn.sm.ghost', {
              style: { padding: '4px 9px', fontSize: '11px' },
              title: 'Save these items as a meal you can log in one tap',
              onclick: () => promptSaveMeal(meal, list, ctx),
            }, 'Save')
          : null),
      ...list.map(e => entryRow(e, key, ctx)),
    );
  }
  return tile;
}

/*
 * Turn what's already on the plate into a reusable meal. Naming it after
 * the sitting is right nine times out of ten, so that is what it offers.
 */
function promptSaveMeal(meal, list, ctx) {
  const nameInput = el('input', {
    type: 'text', value: MEAL_LABELS[meal],
    placeholder: 'Usual breakfast',
  });

  const t = list.reduce((a, e) => {
    const m = entryMacros(e);
    a.kcal += m.kcal; a.p += m.p; return a;
  }, { kcal: 0, p: 0 });

  const s = sheet({
    title: 'Save as a meal',
    body: el('div', {},
      el('p', { style: { color: 'var(--text-2)', marginTop: 0, lineHeight: '1.55' } },
        `${list.length} items, ${kcal(t.kcal)} kcal, ${Math.round(t.p)} g protein. `
        + 'Saved with the weights exactly as they are now — one tap logs the lot.'),
      el('div.tile.flush', { style: { margin: '12px 0' } },
        ...list.map(e => el('div.row', {},
          el('span.grow', {},
            el('div.title', {}, e.name),
            el('div.sub', {}, `${grams(e.grams)} g`)),
          el('span.kcal', {}, kcal(entryMacros(e).kcal))))),
      el('div.field', {}, el('label', {}, 'Call it'), nameInput),
    ),
    foot: el('button.btn.primary.block', {
      onclick: () => {
        const n = nameInput.value.trim();
        if (!n) { toast('Give it a name.', 'err'); return; }
        saveMeal(n, list, meal);
        toast(`"${n}" saved. Log it from Add.`);
        s.close();
        ctx.refresh();
      },
    }, 'Save meal'),
  });
}

function entryRow(e, key, ctx) {
  const m = entryMacros(e);
  const meth = METHODS[e.method] || METHODS.portion;

  return el('button.row', {
    onclick: () => openEntryActions(e, key, ctx),
  },
    el('span.time.num', {}, clock(e.ts)),
    el('span.grow', {},
      el('div.title', {}, e.name),
      el('div.sub', {},
        `${grams(e.grams)} g`,
        e.brand ? ` · ${e.brand}` : '',
        ` · ${Math.round(m.p)}P ${Math.round(m.c)}C ${Math.round(m.f)}F`)),
    el('span', { class: 'conf ' + e.method, title: meth.hint }, meth.short),
    el('span.kcal', {}, kcal(m.kcal)),
  );
}

function openEntryActions(e, key, ctx) {
  const m = entryMacros(e);
  const s = sheet({
    title: e.name,
    body: el('div', {},
      el('div.tile', {},
        el('div.readout', {},
          el('div', {},
            el('div.micro', {}, 'Energy'),
            el('div.readout-main', {}, kcal(m.kcal))),
          el('div.readout-side', {},
            el('div.micro', {}, 'Amount'),
            el('div.v', {}, grams(e.grams) + ' g'))),
        el('div', { style: { display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' } },
          el('span.num', { style: { fontSize: '13px', color: 'var(--m-p)' } }, `${g(m.p, 1)} g protein`),
          el('span.num', { style: { fontSize: '13px', color: 'var(--m-c)' } }, `${g(m.c, 1)} g carbs`),
          el('span.num', { style: { fontSize: '13px', color: 'var(--m-f)' } }, `${g(m.f, 1)} g fat`))),
      el('div.btn-row', {},
        el('button.btn', {
          onclick: () => {
            s.close();
            if (e.dish) {
              openDish({ dateKey: key, entry: e, onSaved: ctx.refresh });
            } else {
              openPortion({ n: e.name, brand: e.brand, per100: e.per100, serv: e.serv, id: e.ref, grade: e.grade },
                { dateKey: key, entry: e, onSaved: ctx.refresh });
            }
          },
        }, icon('edit', 16), 'Edit'),
        el('button.btn.danger', {
          onclick: async () => {
            s.close();
            if (await confirmSheet({
              title: 'Remove this entry?',
              message: `${e.name} will be taken off ${dateLabel(key).toLowerCase()}.`,
              confirmLabel: 'Remove', danger: true,
            })) { removeEntry(key, e.id); toast('Removed.'); ctx.refresh(); }
          },
        }, icon('trash', 16), 'Remove')),
    ),
  });
}
