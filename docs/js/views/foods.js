/*
 * Your foods.
 *
 * The library you build yourself, plus the reference database behind it.
 * A specific eater ends up living almost entirely in the first list.
 */

import { el, clear, icon, kcal, toast, confirmSheet, empty, segmented } from '../ui.js';
import { get, deleteFood, dayKey } from '../store.js';
import { FOODS, GROUPS, atwater } from '../data/foods.js';
import { openPortion } from './portion.js';
import { openBuilder } from './add.js';

export function renderFoods(root, ctx) {
  const s = get();
  clear(root);

  let tab = ctx.tab || 'mine';
  let group = 'All';

  const list = el('div');

  const draw = () => {
    clear(list);
    if (tab === 'mine') drawMine();
    else drawReference();
  };

  function drawMine() {
    const mine = Object.values(s.library).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    if (!mine.length) {
      list.append(el('div.tile', {}, empty(
        'Your library is empty',
        'Build a food once from its packet — name, serving weight, and the panel — and it is here for good, '
        + 'with a barcode attached if you scanned one.',
        el('button.btn.primary', { onclick: () => openBuilder({ onSaved: ctx.refresh }) }, 'Build a food'))));
      return;
    }

    const tile = el('div.tile.flush');
    for (const f of mine) {
      const check = atwater(f.per100);
      tile.append(el('div.row', {},
        el('button', {
          class: 'grow', style: { textAlign: 'left', padding: 0 },
          onclick: () => openPortion(f, { dateKey: ctx.date || dayKey(), onSaved: ctx.refresh }),
        },
          el('div.title', {}, f.n),
          el('div.sub', {},
            [f.brand, f.barcode ? '#' + f.barcode : null, f.basis].filter(Boolean).join(' · ') || 'per 100 g',
            ` · ${Math.round(f.per100.p || 0)}P ${Math.round(f.per100.c || 0)}C ${Math.round(f.per100.f || 0)}F`)),
        check.off ? el('span.conf.estimate', { title: 'Macros do not reconcile with stated energy' }, '!') : null,
        el('span.kcal', {}, kcal(f.per100.kcal)),
        el('button.x-btn', {
          'aria-label': 'Edit ' + f.n,
          onclick: () => openBuilder({ food: f, onSaved: ctx.refresh }),
        }, icon('edit', 15)),
        el('button.x-btn', {
          'aria-label': 'Delete ' + f.n,
          onclick: async () => {
            if (await confirmSheet({
              title: 'Delete this food?',
              message: `${f.n} will be removed from your library. Entries already logged keep their numbers.`,
              confirmLabel: 'Delete', danger: true,
            })) { deleteFood(f.id); toast('Deleted.'); ctx.refresh(); }
          },
        }, icon('trash', 15)),
      ));
    }
    list.append(tile);
  }

  function drawReference() {
    const chips = el('div.chips', { style: { marginBottom: '12px' } });
    for (const gname of ['All', ...GROUPS]) {
      chips.append(el('button.chip', {
        'aria-pressed': String(group === gname),
        onclick: () => { group = gname; draw(); },
      }, gname));
    }
    list.append(chips);

    const items = FOODS.filter(f => group === 'All' || f.grp === group);
    const tile = el('div.tile.flush');
    for (const f of items) {
      tile.append(el('button.row', {
        onclick: () => openPortion(f, { dateKey: ctx.date || dayKey(), onSaved: ctx.refresh }),
      },
        el('span.grow', {},
          el('div.title', {}, f.n),
          el('div.sub', {},
            `${f.basis} · grade ${f.grade}`,
            ` · ${Math.round(f.per100.p)}P ${Math.round(f.per100.c)}C ${Math.round(f.per100.f)}F`)),
        el('span.kcal', {}, kcal(f.per100.kcal), el('div.micro', { style: { marginTop: '2px' } }, '/100g')),
      ));
    }
    list.append(tile);
    list.append(el('div.note', {}, el('div', {},
      'Grade A rows come from weighed laboratory tables. C and D are composite and street dishes, where the '
      + 'recipe is the variable — the app widens the error bars on those automatically.')));
  }

  root.append(
    el('div.between', { style: { marginBottom: '14px' } },
      el('h1', {}, 'Foods'),
      el('button.btn.sm.primary', { onclick: () => openBuilder({ onSaved: ctx.refresh }) }, icon('plus', 15), 'New')),

    segmented([
      { value: 'mine', label: `Yours (${Object.keys(s.library).length})` },
      { value: 'ref', label: `Reference (${FOODS.length})` },
    ], tab, v => { tab = v; ctx.tab = v; draw(); }),

    el('div', { style: { height: '14px' } }),
    list,
  );

  draw();
}
