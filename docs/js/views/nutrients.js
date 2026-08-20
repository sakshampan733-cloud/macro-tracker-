/*
 * Micronutrients, today.
 *
 * Only reference-database foods carry this data — a custom food, a Pot
 * recipe or a home dish contributes nothing here, because the app was
 * never told their iron or folate content and showing a zero would read as
 * a fact rather than a gap. So this tile says, up front, how much of the
 * day it could actually see, and only makes claims about that part.
 */

import { el, rail, g } from '../ui.js';
import { get, totals, dayKey } from '../store.js';
import { NUTRIENTS, nutrientTargets } from '../data/nutrients.js';

const ORDER = ['fe', 'ca', 'vd', 'b12', 'fol', 'zn', 'mg', 'k', 'vc', 'va'];

export function nutrientsTile(s, key = dayKey()) {
  const t = totals(key);
  if (!t.count) return null;

  const targets = nutrientTargets(s.profile);
  const coveragePct = Math.round((t.microCoverage || 0) * 100);

  const rows = ORDER.map(k => {
    const info = NUTRIENTS[k];
    const value = t.micro?.[k] || 0;
    const target = targets[k];
    const pct = target ? (value / target) * 100 : 0;
    return el('div.macro-row', {},
      el('div.macro-head', {},
        el('span.macro-name', {}, info.label),
        el('span.macro-val', {},
          el('b', {}, g(value, info.dp)),
          el('span.of', {}, ` / ${g(target, info.dp)}${info.unit} · ${Math.round(pct)}%`))),
      rail({ value, target, compact: true, over: false,
             hue: pct >= 100 ? 'var(--good)' : pct >= 60 ? 'var(--m-p)' : 'var(--caution)' }));
  });

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Micronutrients, today')),
    el('div.tile', {},
      coveragePct < 90
        ? el('div.note.info', { style: { marginBottom: '12px' } },
            el('div.fine', {},
              coveragePct === 0
                ? "Nothing logged today has micronutrient data yet — this only covers the reference database, not custom foods, home dishes or the Pot."
                : `Based on ${coveragePct}% of today's calories — the reference-database items only. `
                  + `Custom foods, home dishes and Pot recipes don't carry this data, so the real picture is fuller than this.`))
        : null,
      el('div.macros', {}, ...rows),
      el('div.fine', { style: { marginTop: '10px' } },
        'Reference values for typical foods, not a lab analysis of yours — same caution as the rest of the database. '
        + 'See What to trust in Settings.')),
  );
}
