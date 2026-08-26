/*
 * The Starbucks counter.
 *
 * Ordering is a sequence of small decisions, and this sheet is the same
 * sequence: which drink, which size, which milk, how many shots, how many
 * pumps, whip or not. The panel and the caffeine update as you go, because
 * the point of the exercise is watching the number move when you say
 * "skim" or "one less pump" — that is the decision being made, and it is
 * invisible on a menu board.
 */

import {
  el, clear, sheet, toast, icon, field, segmented, append, replaceKids,
} from '../ui.js';
import { addEntry, dayKey, MEALS } from '../store.js';
import { haptic } from '../feedback.js';
import {
  DRINKS, DRINK_LIST, SIZES, MILKS, PUMPS, defaultBuild, buildMacros, buildName,
} from '../data/starbucks.js';

const KINDS = [
  ['espresso', 'Espresso'],
  ['frapp', 'Frappuccino'],
  ['brewed', 'Brewed & cold brew'],
  ['tea', 'Teavana & chai'],
  ['other', 'No coffee'],
];

/* ── Pick a drink ───────────────────────────────────────────────────── */

export function openStarbucks(ctx, { dateKey = null } = {}) {
  const key = dateKey || ctx?.date || dayKey();
  const results = el('div');
  const search = el('input', {
    type: 'search', placeholder: 'Latte, frappuccino, chai…', autocomplete: 'off',
    oninput: e => draw(e.target.value),
  });

  function cell(d) {
    const m = buildMacros(defaultBuild(d.id, 'grande'));
    return el('button.food-cell', {
      onclick: () => { sh.close(); openBuilder(d.id, key, ctx); },
    },
      el('span.fc-name', {}, d.name),
      el('span.fc-kcal', {}, `${m.kcal} kcal · ${m.caffeine} mg`));
  }

  function draw(q) {
    clear(results);
    const needle = (q || '').trim().toLowerCase();

    if (needle.length >= 2) {
      const hits = DRINK_LIST.filter(d => d.name.toLowerCase().includes(needle));
      results.append(hits.length
        ? el('div.food-grid', {}, ...hits.map(cell))
        : el('div.fine', {}, `Nothing on the menu matches “${q}”.`));
      return;
    }

    results.append(el('div.fine', { style: { marginBottom: '12px' } },
      'Grande, standard build. Everything is adjustable on the next screen.'));
    for (const [kind, label] of KINDS) {
      const group = DRINK_LIST.filter(d => d.kind === kind);
      if (!group.length) continue;
      results.append(
        el('div.section-label', {}, el('span.micro', {}, label)),
        el('div.food-grid', {}, ...group.map(cell)));
    }
  }

  draw('');
  const sh = sheet({
    title: 'Starbucks',
    body: el('div', {}, el('div.field', {}, search), results),
  });
  return sh;
}

/* ── Build it ───────────────────────────────────────────────────────── */

export function openBuilder(drinkId, key, ctx) {
  const d = DRINKS[drinkId];
  if (!d) return null;

  let build = defaultBuild(drinkId, 'grande');
  const state = { meal: 'snack' };

  const readout = el('div.readout');
  const controls = el('div');
  const caffLine = el('div.fine');

  const paint = () => {
    const m = buildMacros(build);

    readout.replaceChildren(
      el('div', {},
        el('div.micro', {}, buildName(build)),
        el('div.readout-main', { style: { fontSize: '34px' } }, m.kcal)),
      el('div.readout-side', {},
        el('div.micro', {}, 'P · C · F'),
        el('div.v', {}, `${Math.round(m.p)} · ${Math.round(m.c)} · ${Math.round(m.f)}`)));

    caffLine.textContent = m.caffeine
      ? `${m.caffeine} mg of caffeine, ${m.sug.toFixed(0)} g of sugar, ${m.ml} ml in the cup.`
      : `No caffeine. ${m.sug.toFixed(0)} g of sugar, ${m.ml} ml in the cup.`;

    drawControls();
  };

  /* A stepper, because shot and pump counts are small integers and a
     number field for "2" is a keyboard for no reason. */
  const stepper = (label, value, lo, hi, set) => el('div.step-row', {},
    el('span.grow', {}, label),
    el('button.btn.sm', {
      'aria-label': `One fewer ${label.toLowerCase()}`,
      onclick: () => { if (value > lo) { set(value - 1); haptic('tap'); paint(); } },
    }, '−'),
    el('span.step-val', {}, String(value)),
    el('button.btn.sm', {
      'aria-label': `One more ${label.toLowerCase()}`,
      onclick: () => { if (value < hi) { set(value + 1); haptic('tap'); paint(); } },
    }, '+'));

  function drawControls() {
    const kids = [];

    kids.push(el('div.section-label', {}, el('span.micro', {}, 'Size')));
    kids.push(segmented(
      Object.entries(SIZES).map(([v, s]) => ({ value: v, label: s.label })),
      build.size,
      v => {
        /* Changing size re-standardises the build, the way reordering in a
           bigger cup would — but a deliberate extra shot survives it. */
        const wasExtra = build.shots - defaultBuild(build.id, build.size).shots;
        const wasPumps = build.pumps - defaultBuild(build.id, build.size).pumps;
        const next = defaultBuild(build.id, v);
        build = { ...next, milk: build.milk, whip: build.whip,
                  shots: Math.max(0, next.shots + wasExtra),
                  pumps: Math.max(0, next.pumps + wasPumps) };
        paint();
      }));

    if (d.milk > 0) {
      kids.push(el('div.section-label', {}, el('span.micro', {}, 'Milk')));
      kids.push(el('div.chips', {},
        ...Object.entries(MILKS).filter(([v]) => v !== 'none').map(([v, m]) =>
          el('button.chip', {
            'aria-pressed': String(build.milk === v),
            onclick: () => { build.milk = v; haptic('tap'); paint(); },
          }, m.label))));
    }

    const rows = el('div.tile', { style: { marginTop: '12px' } });
    if (d.kind !== 'other' && d.kind !== 'tea') {
      rows.append(stepper('Shots', build.shots, 0, 6, v => { build.shots = v; }));
    }
    if (build.syrup !== 'none') {
      rows.append(stepper(`Pumps of ${PUMPS[build.syrup].label.toLowerCase()}`,
        build.pumps, 0, 8, v => { build.pumps = v; }));
    }
    rows.append(el('div.step-row', {},
      el('span.grow', {}, 'Whipped cream'),
      el('button.chip', {
        'aria-pressed': String(build.whip),
        onclick: e => { build.whip = !build.whip; e.currentTarget.setAttribute('aria-pressed', String(build.whip)); haptic('tap'); paint(); },
      }, build.whip ? 'On' : 'Off')));
    kids.push(rows);

    /* Syrup swap: the pumps mean nothing without knowing which syrup. */
    if (d.kind === 'espresso' || d.kind === 'frapp') {
      kids.push(el('div.section-label', {}, el('span.micro', {}, 'Syrup')));
      kids.push(el('div.chips', {},
        ...['none', 'classic', 'vanilla', 'caramel', 'hazelnut', 'mocha', 'whitemocha']
          .map(v => el('button.chip', {
            'aria-pressed': String(build.syrup === v),
            onclick: () => {
              build.syrup = v;
              if (v === 'none') build.pumps = 0;
              else if (!build.pumps) build.pumps = defaultBuild(build.id, build.size).pumps || 3;
              haptic('tap'); paint();
            },
          }, PUMPS[v].label))));
    }

    kids.push(el('div.section-label', {}, el('span.micro', {}, 'Sitting')));
    kids.push(segmented(MEALS.map(m => ({ value: m, label: m[0].toUpperCase() + m.slice(1) })),
      state.meal, v => { state.meal = v; }, { wrap: true }));

    replaceKids(controls, ...kids);
  }

  paint();

  const sh = sheet({
    title: d.name,
    body: el('div', {},
      el('div.tile.tile-hero', {}, readout, caffLine),
      controls),
    foot: el('button.btn.primary.block', {
      onclick: () => {
        const m = buildMacros(build);
        if (!m.ml) { toast('Nothing in the cup.', 'err'); return; }
        addEntry(key, {
          name: buildName(build),
          brand: 'Starbucks',
          ref: 'sbux:' + build.id,
          grams: m.ml,
          /* Stored per 100 ml so the entry rescales like any other food,
             with the caffeine riding along on the same panel. */
          per100: {
            kcal: (m.kcal / m.ml) * 100, p: (m.p / m.ml) * 100, c: (m.c / m.ml) * 100,
            f: (m.f / m.ml) * 100, fib: 0, sug: (m.sug / m.ml) * 100,
            sat: (m.sat / m.ml) * 100, na: (m.na / m.ml) * 100,
            caff: (m.caffeine / m.ml) * 100,
          },
          serv: [{ l: `the cup (${m.ml} ml)`, g: m.ml }],
          method: 'label', grade: 'B', meal: state.meal,
          build: { ...build },
        });
        haptic('success');
        toast(`${buildName(build)} logged.`);
        sh.close();
        ctx?.refresh?.();
      },
    }, 'Log it'),
  });
  return sh;
}
