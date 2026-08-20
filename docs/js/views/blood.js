/*
 * Blood work.
 *
 * Records what the report said, tracks it over time, and — the only thing
 * here a lab cannot do — puts each marker next to what you were actually
 * eating in the weeks before the draw.
 *
 * It does not interpret and it does not recommend. "Your B12 is low" is
 * where the lab stops; this adds "and you averaged 0.9 µg a day against
 * 2.4", which points at intake, or "and you averaged 6 µg a day", which
 * points somewhere else and is a different conversation with a doctor.
 */

import {
  el, sheet, toast, icon, g, field, sparkline, confirmSheet, explain,
} from '../ui.js';
import { get, commit, dayKey, totals } from '../store.js';
import {
  MARKERS, MARKER_GROUPS, statusOf, STATUS_LABEL, STATUS_COLOUR,
} from '../data/bloodwork.js';
import { NUTRIENTS, nutrientTargets } from '../data/nutrients.js';

const fmt = (v, dp) => (v == null ? '—' : Number(v).toFixed(dp));

/* ── Average intake of a nutrient over the weeks before a date ───────── */

/*
 * The join that makes this worth having. Looks back over the window before
 * a blood draw and reports what the food log actually delivered, so a low
 * marker can be read against intake rather than in isolation.
 */
function intakeBefore(store, isoDate, nutrientKey, days = 30) {
  const end = new Date(isoDate + 'T12:00:00');
  const start = new Date(end); start.setDate(start.getDate() - days);
  const keys = Object.keys(store.days).filter(k => {
    const d = new Date(k + 'T12:00:00');
    return d >= start && d <= end;
  });

  let sum = 0, n = 0;
  for (const k of keys) {
    const day = store.days[k];
    if (!day.entries || day.entries.length < 2) continue;
    // the same totals maths the rest of the app uses, so supplements count too
    const t = totals(k);
    if (t.micro && t.micro[nutrientKey] != null) { sum += t.micro[nutrientKey]; n++; }
  }
  return n ? { mean: sum / n, days: n } : null;
}

/* ── The Body tile ──────────────────────────────────────────────────── */

export function bloodTile(s, ctx) {
  const panels = Object.values(s.blood || {});
  const latest = panels.sort((a, b) => b.date.localeCompare(a.date))[0];

  if (!latest) {
    return el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'Blood work')),
      el('div.tile', {},
        el('div', { style: { fontSize: '13.5px', color: 'var(--text-2)', lineHeight: '1.55' } },
          'Nothing recorded yet.'),
        explain('A blood panel is the one thing this app genuinely cannot see. Recording it here puts your markers next to what you were eating in the weeks before the draw — which is the part a lab report cannot tell you.'),
        el('button.btn.primary.block', { style: { marginTop: '12px' },
          onclick: () => openPanelEditor({ ctx }) }, icon('plus', 16), 'Add a panel')));
  }

  const vals = Object.entries(latest.values || {});
  const outOf = vals.filter(([k, v]) => statusOf(k, v) !== 'in');

  return el('div', {},
    el('div.section-label', {}, el('span.micro', {}, 'Blood work')),
    el('div.tile', {},
      el('div.tile-head', {},
        el('h3', {}, 'Latest panel'),
        el('span.micro', {}, latest.date)),
      el('div.between', { style: { marginBottom: '10px' } },
        el('span.fine', {}, `${vals.length} markers recorded`),
        el('span.num', {
          style: { fontSize: '13px', color: outOf.length ? 'var(--caution)' : 'var(--good)' },
        }, outOf.length ? `${outOf.length} outside range` : 'all in range')),

      el('div.tile.flush', { style: { margin: 0, border: '1px solid var(--line)' } },
        ...vals.slice(0, 6).map(([k, v]) => markerRow(k, v, ctx, latest.date))),

      el('div.btn-row', { style: { marginTop: '12px' } },
        el('button.btn.sm', { onclick: () => openPanelList(ctx) }, 'All panels'),
        el('button.btn.sm.primary', { onclick: () => openPanelEditor({ ctx }) }, 'Add panel'))),
  );
}

function markerRow(key, value, ctx, date) {
  const m = MARKERS[key];
  if (!m) return null;
  const st = statusOf(key, value);
  return el('button.row', {
    onclick: () => openMarkerDetail(key, ctx),
  },
    el('span.grow', {},
      el('div.title', {}, m.label),
      el('div.sub', { style: { color: STATUS_COLOUR[st] } },
        `${STATUS_LABEL[st]} · reference ${fmt(m.lo, m.dp)}–${fmt(m.hi, m.dp)} ${m.unit}`)),
    el('span.kcal', { style: { color: STATUS_COLOUR[st] } }, fmt(value, m.dp),
      el('div.micro', { style: { marginTop: '2px' } }, m.unit)),
  );
}

/* ── One marker over time, against intake ───────────────────────────── */

export function openMarkerDetail(key, ctx) {
  const s = get();
  const m = MARKERS[key];
  const series = Object.values(s.blood || {})
    .filter(p => p.values && p.values[key] != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(p => ({ date: p.date, v: p.values[key] }));

  const latest = series[series.length - 1];
  const st = latest ? statusOf(key, latest.v) : null;

  // what the food log delivered around the most recent draw
  let intakeLine = null;
  if (m.linkedNutrient && latest) {
    const t = nutrientTargets(s.profile)[m.linkedNutrient];
    const info = NUTRIENTS[m.linkedNutrient];
    const got = intakeBefore(s, latest.date, m.linkedNutrient, 30);
    if (got) {
      const pct = Math.round((got.mean / t) * 100);
      intakeLine = el('div', { class: 'note ' + (pct < 70 ? 'warn' : 'good') },
        el('div', {},
          el('b', {}, `${info.label} intake around that draw`),
          el('div.fine', { style: { marginTop: '3px' } },
            `${g(got.mean, info.dp)} ${info.unit} a day across ${got.days} logged days — ${pct}% of the ${g(t, info.dp)} ${info.unit} reference. `
            + (pct < 70
              ? 'A low marker alongside low intake points at what you are eating.'
              : 'Intake looks adequate, so a low marker here points at something other than diet — worth asking about.'))));
    }
  }

  return sheet({
    title: m.label,
    body: el('div', {},
      latest ? el('div.tile', {},
        el('div.readout', {},
          el('div', {},
            el('div.micro', {}, 'Latest · ' + latest.date),
            el('div.readout-main', { style: { fontSize: '34px', color: STATUS_COLOUR[st] } },
              fmt(latest.v, m.dp), el('span.readout-pm', {}, ' ' + m.unit))),
          el('div.readout-side', {},
            el('div.micro', {}, 'Reference'),
            el('div.v', {}, `${fmt(m.lo, m.dp)}–${fmt(m.hi, m.dp)}`))),
        el('div.fine', { style: { marginTop: '8px', color: STATUS_COLOUR[st] } },
          STATUS_LABEL[st])) : null,

      series.length > 1 ? el('div.tile', {},
        el('div.micro', { style: { marginBottom: '8px' } }, `${series.length} panels`),
        sparkline(series.map(p => ({ v: p.v })), { h: 80 }),
        el('div.between', { style: { marginTop: '6px' } },
          el('span.micro', {}, series[0].date),
          el('span.micro', {}, latest.date))) : null,

      intakeLine,

      m.note ? el('div.fine', { style: { marginTop: '12px' } }, m.note) : null,

      el('div.note.warn', { style: { marginTop: '14px' } },
        el('div.fine', {},
          'Reference ranges vary by lab and by assay. Where your own report prints a different range, believe your report. '
          + 'This screen records and compares; it does not diagnose, and nothing here is a substitute for the person who ordered the test.')),
    ),
  });
}

/* ── Entering a panel ───────────────────────────────────────────────── */

export function openPanelEditor({ ctx, existing = null }) {
  const s = get();
  const id = existing?.id || 'bp:' + Math.random().toString(36).slice(2, 9);
  const values = { ...(existing?.values || {}) };

  const dateInput = el('input', { type: 'date', value: existing?.date || dayKey() });
  const labInput = el('input', { type: 'text', value: existing?.lab || '', placeholder: 'Lab name, optional' });

  const inputs = {};
  const body = el('div', {},
    el('div.field-2', {}, field('Date of draw', dateInput), field('Lab', labInput)),
    explain('Enter only what your report actually lists — blanks are simply not recorded. Nothing is sent anywhere; this stays on your device like the rest of your log.'),

    ...MARKER_GROUPS.map(group => {
      const keys = Object.keys(MARKERS).filter(k => MARKERS[k].group === group);
      return el('div', {},
        el('div.section-label', {}, el('span.micro', {}, group)),
        el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } },
          ...keys.map(k => {
            const m = MARKERS[k];
            const inp = el('input.num-in', {
              type: 'number', inputmode: 'decimal', step: 'any',
              value: values[k] != null ? String(values[k]) : '',
              placeholder: `${fmt(m.lo, m.dp)}–${fmt(m.hi, m.dp)}`,
            });
            inputs[k] = inp;
            return el('div.field', {},
              el('label', {}, `${m.label} (${m.unit})`), inp);
          })));
    }),
  );

  const s2 = sheet({
    title: existing ? 'Edit panel' : 'New blood panel',
    body,
    foot: el('button.btn.primary.block', {
      onclick: () => {
        const out = {};
        for (const k in inputs) {
          const v = inputs[k].value.trim();
          if (v !== '' && Number.isFinite(+v)) out[k] = +v;
        }
        if (!Object.keys(out).length) { toast('Enter at least one marker.', 'err'); return; }
        commit(st => {
          st.blood = st.blood || {};
          st.blood[id] = { id, date: dateInput.value || dayKey(), lab: labInput.value.trim(), values: out };
        }, 'blood');
        toast(`${Object.keys(out).length} markers saved.`);
        s2.close();
        ctx.refresh();
      },
    }, existing ? 'Save changes' : 'Save panel'),
  });
  return s2;
}

export function openPanelList(ctx) {
  const s = get();
  const panels = Object.values(s.blood || {}).sort((a, b) => b.date.localeCompare(a.date));

  const body = el('div', {},
    ...(panels.length ? panels.map(p => {
      const vals = Object.entries(p.values || {});
      const out = vals.filter(([k, v]) => statusOf(k, v) !== 'in').length;
      return el('div.row', {},
        el('button', { class: 'grow', style: { textAlign: 'left', padding: 0, background: 'none' },
          onclick: () => { s3.close(); openPanelEditor({ ctx, existing: p }); } },
          el('div.title', {}, p.date),
          el('div.sub', {}, `${vals.length} markers${p.lab ? ' · ' + p.lab : ''}${out ? ' · ' + out + ' outside range' : ''}`)),
        el('button.x-btn', {
          'aria-label': 'Delete panel',
          onclick: async () => {
            if (await confirmSheet({ title: 'Delete this panel?',
              message: `The results from ${p.date} will be removed.`,
              confirmLabel: 'Delete', danger: true })) {
              commit(st => { delete st.blood[p.id]; }, 'blood');
              s3.close(); ctx.refresh();
            }
          },
        }, icon('trash', 15)));
    }) : [el('div.fine', {}, 'No panels recorded yet.')]),
  );

  const s3 = sheet({ title: 'Blood panels', body,
    foot: el('button.btn.primary.block', {
      onclick: () => { s3.close(); openPanelEditor({ ctx }); } }, 'Add a panel') });
  return s3;
}
