/*
 * Supplement log.
 *
 * Two screens' worth of idea in one: pick the handful you actually take,
 * then tick them off each day. Anything ticked feeds its micronutrients
 * into the day's totals, so the vitamin D screen stops nagging about a
 * deficit you closed at breakfast.
 */

import { el, sheet, toast, icon, g } from '../ui.js';
import {
  get, commit, dayKey, suppsTaken, toggleSupplement, setSupplementList,
} from '../store.js';
import { SUPPLEMENTS, SUPPLEMENT_TAGS } from '../data/supplements.js';
import { NUTRIENTS } from '../data/nutrients.js';

/* ── The daily tile ─────────────────────────────────────────────────── */

export function supplementsTile(s, key, ctx) {
  const chosen = s.supplementsTaken || [];
  if (!chosen.length) {
    return el('div.tile', {},
      el('div.between', {},
        el('div', {},
          el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Supplements'),
          el('div.fine', { style: { marginTop: '3px' } },
            'Pick the ones you take and they appear here each day.')),
        el('button.btn.sm', { onclick: () => openSupplementPicker(ctx) }, 'Set up')));
  }

  const taken = suppsTaken(key);
  const done = chosen.filter(id => taken.includes(id)).length;

  return el('div.tile', {},
    el('div.tile-head', {},
      el('div.flex', {}, icon('plus', 15), el('h3', {}, 'Supplements')),
      el('div.flex', {},
        el('span.num', { style: { fontSize: '13px', color: done === chosen.length ? 'var(--good)' : 'var(--muted)' } },
          `${done}/${chosen.length}`),
        el('button.btn.sm.ghost', { style: { marginLeft: '8px' },
          onclick: () => openSupplementPicker(ctx) }, 'Edit'))),

    el('div.chips', {},
      ...chosen.map(id => {
        const sup = SUPPLEMENTS[id];
        if (!sup) return null;
        const on = taken.includes(id);
        return el('button.chip', {
          type: 'button',
          'aria-pressed': String(on),
          style: on ? { borderColor: 'var(--good)', color: 'var(--good)',
                        background: 'rgba(95,208,138,.08)' } : {},
          onclick: () => { toggleSupplement(key, id); ctx.refresh(); },
        }, (on ? '✓ ' : '') + sup.label);
      }).filter(Boolean)),
  );
}

/* ── Choosing which ones you take ───────────────────────────────────── */

export function openSupplementPicker(ctx) {
  const s = get();
  let chosen = [...(s.supplementsTaken || [])];

  const body = el('div', {});

  const render = () => {
    body.replaceChildren(
      el('p', { style: { color: 'var(--text-2)', marginTop: 0, lineHeight: '1.55' } },
        'Tick what you actually take. Only these show up on Today, and what you tick off each day counts toward your micronutrient totals.'),

      ...Object.entries(SUPPLEMENT_TAGS).map(([tag, label]) =>
        el('div', {},
          el('div.section-label', {}, el('span.micro', {}, label)),
          el('div.tile.flush', {},
            ...Object.entries(SUPPLEMENTS)
              .filter(([, v]) => v.tag === tag)
              .map(([id, sup]) => {
                const on = chosen.includes(id);
                const gives = Object.entries(sup.provides || {})
                  .map(([k, v]) => `${NUTRIENTS[k]?.label || k} ${g(v, NUTRIENTS[k]?.dp ?? 0)}${NUTRIENTS[k]?.unit || ''}`)
                  .slice(0, 3).join(' · ');
                return el('button.row', {
                  onclick: () => {
                    chosen = on ? chosen.filter(x => x !== id) : [...chosen, id];
                    setSupplementList(chosen);
                    render();
                  },
                },
                  el('span.grow', {},
                    el('div.title', {}, (on ? '✓ ' : '') + sup.label),
                    el('div.sub', {}, [sup.dose, gives].filter(Boolean).join(' · ') || '—'),
                    sup.note ? el('div.fine', { style: { marginTop: '3px' } }, sup.note) : null),
                  on ? el('span.conf.weighed', {}, 'ON') : null);
              })))),

      el('div.note.info', {},
        el('div.fine', {},
          'Whey and mass gainer carry real calories and protein, so log those as food instead — ticking them here as well would count them twice.')),
    );
  };

  render();
  return sheet({ title: 'Your supplements', body, onClose: () => ctx.refresh() });
}
