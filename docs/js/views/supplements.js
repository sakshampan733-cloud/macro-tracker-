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
  const all = done === chosen.length;
  const open = s.settings.suppsOpen === true;

  /*
   * Chips wrapped badly at five or six items and turned into a block of
   * text. A checklist is what this actually is, so it looks like one — and
   * it stays folded behind a count, because on most days the only question
   * is whether they are done.
   */
  const header = el('button', {
    style: { display: 'block', width: '100%', textAlign: 'left', padding: 0, background: 'none' },
    'aria-expanded': String(open),
    onclick: () => { commit(st => { st.settings.suppsOpen = !open; }); ctx.refresh(); },
  },
    el('div.between', {},
      el('div.flex', {},
        el('h3', {}, 'Supplements'),
        el('span.micro', { style: { marginLeft: '8px' } }, open ? '▾' : '▸')),
      el('span.num', {
        style: { fontSize: '13px', color: all ? 'var(--good)' : 'var(--muted)' },
      }, all ? `all ${chosen.length} taken` : `${done}/${chosen.length}`)));

  if (!open) return el('div.tile', {}, header);

  return el('div.tile', {},
    header,
    el('div', { style: { height: '10px' } }),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
      ...chosen.map(id => {
        const sup = SUPPLEMENTS[id];
        if (!sup) return null;
        const on = taken.includes(id);
        return el('button', {
          type: 'button',
          'aria-pressed': String(on),
          style: {
            display: 'flex', alignItems: 'center', gap: '11px', width: '100%',
            padding: '9px 2px', background: 'none', textAlign: 'left',
          },
          onclick: () => { toggleSupplement(key, id); ctx.refresh(); },
        },
          el('span', {
            style: {
              width: '20px', height: '20px', flex: 'none', borderRadius: '50%',
              border: '1.5px solid ' + (on ? 'var(--good)' : 'var(--line-2)'),
              background: on ? 'var(--good)' : 'transparent',
              color: on ? 'var(--bg)' : 'transparent',
              display: 'grid', placeItems: 'center',
              fontSize: '12px', fontWeight: '700', lineHeight: '1',
            },
          }, '✓'),
          el('span', { style: { flex: '1', minWidth: '0' } },
            el('div', { style: { fontSize: '14.5px', color: on ? 'var(--text)' : 'var(--text-2)' } }, sup.label),
            el('div.micro', { style: { marginTop: '2px' } }, sup.dose || '')),
        );
      }).filter(Boolean)),
    el('button.btn.sm.ghost.block', { style: { marginTop: '10px' },
      onclick: () => openSupplementPicker(ctx) }, 'Change which ones'),
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
