/*
 * Medication.
 *
 * A separate segment from supplements, because the two are not the same
 * kind of thing. Supplements are a preference; a prescription is an
 * instruction from somebody who examined you.
 *
 * That difference sets the tone of every screen here. The app records
 * what is due and whether it was taken, and it will describe what a drug
 * does — but it never suggests taking one, skipping one, or moving a time.
 * Where it has nothing certain to say it says nothing, which is why an
 * unrecognised medication logs perfectly well and simply carries no
 * description.
 */

import {
  el, clear, sheet, toast, icon, field, append, replaceKids, confirmSheet, live,
} from '../ui.js';
import {
  get, dayKey, medications, addMedication, updateMedication, removeMedication,
  takeDose, untakeDose, doseLog, subscribe,
} from '../store.js';
import { haptic } from '../feedback.js';
import { findMedication, medicationById, dayEffects } from '../data/medications.js';

/* ── The daily tile ─────────────────────────────────────────────────── */

export function medicationTile(s, key, ctx) {
  /* Ticking a dose should mark that dose, not reload the screen under
     your thumb. */
  return live(paint => buildMedication(get(), key, ctx, paint),
              { subscribe, on: ['meds'] });
}

function buildMedication(s, key, ctx, repaint) {
  const meds = medications();

  if (!meds.length) {
    return el('div.tile', {},
      el('div.between', {},
        el('div', {},
          el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Medication'),
          el('div.fine', { style: { marginTop: '3px' } },
            'Prescriptions, kept separate from supplements. Add one and its times '
            + 'appear here each day.')),
        el('button.btn.sm', { onclick: () => openMedicationList(ctx) }, 'Set up')));
  }

  const log = doseLog(key);
  const done = log.filter(d => d.taken).length;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = key === dayKey();

  const rows = log.map(d => {
    const [hh, mm] = d.time.split(':').map(Number);
    const dueMin = hh * 60 + mm;
    /* Overdue is a statement of fact about the clock, not a reprimand. */
    const overdue = isToday && !d.taken && nowMin > dueMin + 30;

    return el('div.dose-row' + (d.taken ? '.is-done' : overdue ? '.is-late' : ''), {},
      el('button.dose-check', {
        'aria-label': d.taken ? `Mark ${d.med.name} at ${d.time} as not taken`
                              : `Mark ${d.med.name} at ${d.time} as taken`,
        'aria-pressed': String(d.taken),
        onclick: () => {
          if (d.taken) untakeDose(key, d.med.id, d.time);
          else takeDose(key, d.med.id, d.time);
          haptic(d.taken ? 'tap' : 'success');
          repaint();
        },
      }, d.taken ? icon('check', 14) : ''),
      el('button.grow.dose-open', {
        onclick: () => openMedication(d.med, ctx),
      },
        el('div.dose-name', {}, d.med.nickname || d.med.name),
        el('div.micro', {},
          [d.time, d.med.mg ? `${d.med.mg} ${d.med.unit}` : null,
           d.taken && d.lateMin != null && Math.abs(d.lateMin) > 45
             ? (d.lateMin > 0 ? `${Math.round(d.lateMin / 60)} h late` : 'early')
             : null,
          ].filter(Boolean).join(' · '))),
      overdue ? el('span.micro.is-late-tag', {}, 'due') : null);
  });

  return el('div.tile', {},
    el('div.between', { style: { marginBottom: '10px' } },
      el('div.flex', { style: { gap: '7px' } }, icon('pill', 15), el('h3', {}, 'Medication')),
      el('span.num', {
        style: { fontSize: '13px', color: done === log.length ? 'var(--good)' : 'var(--muted)' },
      }, log.length ? `${done}/${log.length}` : 'none due')),
    ...rows,
    el('button.btn.sm.ghost.block', { style: { marginTop: '10px' },
      onclick: () => openMedicationList(ctx) }, 'Manage'));
}

/* ── The list ───────────────────────────────────────────────────────── */

export function openMedicationList(ctx) {
  const body = el('div');

  const draw = () => {
    const meds = medications();
    const kids = [];

    kids.push(el('button.btn.primary.block', {
      onclick: () => { sh.close(); openAddMedication(ctx); },
    }, icon('plus', 16), 'Add a medication'));

    if (!meds.length) {
      kids.push(el('div.fine', { style: { marginTop: '14px' } },
        'Nothing added yet. The app will tell you what a medication does where it is '
        + 'certain, and record whether you took it. It has no view on whether or when '
        + 'you should — that is between you and whoever prescribed it.'));
    }

    for (const m of meds) {
      const ref = m.ref ? medicationById(m.ref) : null;
      kids.push(el('div.food-cell.cell-wrap', { style: { marginTop: '9px' } },
        el('button.cell-main', { onclick: () => { sh.close(); openMedication(m, ctx); } },
          el('span.fc-name', {}, m.nickname ? `${m.nickname} (${m.name})` : m.name),
          el('span.fc-kcal', {},
            [m.mg ? `${m.mg} ${m.unit}` : null,
             (m.times || []).join(', ') || 'no times set',
             ref ? ref.klass : null].filter(Boolean).join(' · ')))));
    }

    replaceKids(body, ...kids);
  };
  draw();

  const sh = sheet({ title: 'Medication', body });
  return sh;
}

/* ── Add or edit ────────────────────────────────────────────────────── */

export function openAddMedication(ctx, existing = null) {
  const draft = existing ? { ...existing } : {
    name: '', nickname: '', ref: null, purpose: '', mg: null, unit: 'mg',
    perDose: 1, times: [],
  };

  const matches = el('div');
  const known = el('div');
  const timesWrap = el('div');

  const nameInput = el('input', {
    type: 'text', placeholder: 'Sertraline, Amaryl, Telma…', autocomplete: 'off',
    value: draft.name,
    oninput: e => { draft.name = e.target.value; draft.ref = null; drawMatches(); drawKnown(); },
  });

  /*
   * Matching against the reference is offered, never applied silently. The
   * person knows what is in the box; the app is guessing from a string.
   */
  function drawMatches() {
    clear(matches);
    if (draft.ref || draft.name.trim().length < 2) return;
    const hits = findMedication(draft.name);
    if (!hits.length) return;
    matches.append(el('div.fine', { style: { margin: '8px 0 6px' } }, 'Is it one of these?'));
    for (const h of hits.slice(0, 4)) {
      matches.append(el('button.chip', {
        style: { marginRight: '6px', marginBottom: '6px' },
        onclick: () => {
          draft.ref = h.id;
          draft.name = h.label;
          nameInput.value = h.label;
          if (!draft.purpose) draft.purpose = h.for;
          purposeInput.value = draft.purpose;
          haptic('tap');
          clear(matches);
          drawKnown();
        },
      }, h.label));
    }
  }

  /* What we know, shown before anything is saved. */
  function drawKnown() {
    clear(known);
    if (!draft.ref) {
      if (draft.name.trim().length > 2) {
        known.append(el('div.fine', { style: { marginTop: '10px' } },
          'Not in the reference — it will be recorded exactly as you enter it, with no '
          + 'description attached. That is deliberate: a guess from a similar name '
          + 'would be worse than nothing.'));
      }
      return;
    }
    const ref = medicationById(draft.ref);
    known.append(
      el('div.tile', { style: { marginTop: '12px' } },
        el('div.micro', {}, ref.klass),
        el('div', { style: { fontSize: '14px', marginTop: '5px' } }, ref.for),
        el('div.fine', { style: { marginTop: '8px' } }, ref.day)));
  }

  const purposeInput = el('input', {
    type: 'text', placeholder: 'What it is for, in your words', value: draft.purpose,
    oninput: e => { draft.purpose = e.target.value; },
  });

  const nickInput = el('input', {
    type: 'text', placeholder: 'The blue one, morning tablet…', value: draft.nickname,
    oninput: e => { draft.nickname = e.target.value; },
  });

  const mgInput = el('input.num-in', {
    type: 'number', inputMode: 'decimal', min: '0', step: '5',
    value: draft.mg == null ? '' : String(draft.mg),
    oninput: e => { draft.mg = e.target.value === '' ? null : Math.max(0, +e.target.value || 0); },
  });

  /* ── times ── */
  function drawTimes() {
    const kids = [];
    for (const t of draft.times) {
      kids.push(el('span.chip', { style: { marginRight: '6px', marginBottom: '6px' } },
        t,
        el('button.chip-x', {
          'aria-label': `Remove ${t}`,
          onclick: () => { draft.times = draft.times.filter(x => x !== t); drawTimes(); },
        }, '×')));
    }
    const picker = el('input', {
      type: 'time',
      onchange: e => {
        const v = e.target.value;
        if (v && !draft.times.includes(v)) {
          draft.times = [...draft.times, v].sort();
          drawTimes();
        }
        e.target.value = '';
      },
    });
    kids.push(el('div', { style: { marginTop: '8px' } },
      el('div.micro', { style: { marginBottom: '5px' } }, 'Add a time'), picker));
    replaceKids(timesWrap, ...kids);
  }
  drawTimes();
  drawMatches();
  drawKnown();

  const sh = sheet({
    title: existing ? 'Edit medication' : 'Add a medication',
    body: el('div', {},
      el('div.field', {}, el('div.micro', {}, 'Name on the box'), nameInput),
      matches,
      known,
      el('div.field', { style: { marginTop: '12px' } },
        el('div.micro', {}, 'Your name for it'), nickInput),
      el('div.field', { style: { marginTop: '12px' } },
        el('div.micro', {}, 'What it is for'), purposeInput),
      el('div.tile', { style: { marginTop: '12px' } }, field('Milligrams', mgInput)),
      el('div.section-label', {}, el('span.micro', {}, 'When it is due')),
      el('div.fine', { style: { marginBottom: '8px' } },
        'The times your prescriber set. The app reminds you at them and records what '
        + 'happened — it does not have a view on what they should be.'),
      timesWrap),
    foot: el('button.btn.primary.block', {
      onclick: () => {
        if (!draft.name.trim() && !draft.nickname.trim()) {
          toast('Give it a name or a nickname.', 'err');
          return;
        }
        if (!draft.name.trim()) draft.name = draft.nickname;
        if (existing) updateMedication(existing.id, draft);
        else addMedication(draft);
        haptic('success');
        toast(existing ? 'Updated.' : `${draft.nickname || draft.name} added.`);
        sh.close();
        ctx.refresh?.();
      },
    }, existing ? 'Save' : 'Add it'),
  });
  return sh;
}

/* ── One medication ─────────────────────────────────────────────────── */

export function openMedication(med, ctx) {
  const ref = med.ref ? medicationById(med.ref) : null;
  const effects = dayEffects(ref);

  const body = el('div', {},
    el('div.tile.tile-hero', {},
      el('div.micro', {}, med.nickname ? med.name : (ref?.klass || 'Medication')),
      el('div.readout-main', { style: { fontSize: '26px' } }, med.nickname || med.name),
      med.mg ? el('div.micro', { style: { marginTop: '6px' } },
        `${med.mg} ${med.unit}${med.perDose > 1 ? ` × ${med.perDose}` : ''}`
        + ((med.times || []).length ? ` · ${med.times.join(', ')}` : '')) : null),

    med.purpose ? el('div.tile', { style: { marginTop: '12px' } },
      el('div.micro', {}, 'What it is for'),
      el('div', { style: { fontSize: '14px', marginTop: '5px' } }, med.purpose)) : null,

    ref ? el('div.tile', { style: { marginTop: '12px' } },
      el('div.micro', {}, 'What it does'),
      el('div', { style: { fontSize: '14px', marginTop: '5px' } }, ref.for),
      el('div.fine', { style: { marginTop: '9px' } }, ref.day)) : null,

    effects.length ? el('div', {},
      el('div.section-label', {}, el('span.micro', {}, 'What your day might look like')),
      ...effects.map(e => el('div.note', {}, el('div', {}, e.text)))) : null,

    !ref ? el('div.fine', { style: { marginTop: '12px' } },
      'This one is not in the reference, so the app has nothing certain to tell you '
      + 'about it and will not guess.') : null,

    /* The disclaimer sits at the bottom of the description, where it is
       read after the content rather than instead of it. */
    ref ? el('div.fine', { style: { marginTop: '14px', opacity: '.75' } },
      'General information about the medicine, not advice about your prescription. '
      + 'Your prescriber set your dose and your times.') : null,

    el('button.btn.block', { style: { marginTop: '16px' },
      onclick: () => { sh.close(); openAddMedication(ctx, med); } }, 'Edit'),
    el('button.btn.danger.block', { style: { marginTop: '9px' },
      onclick: () => {
        confirmSheet({
          title: 'Remove this medication?',
          body: 'Its history stays in past days. It stops appearing from today.',
          confirm: 'Remove',
          onConfirm: () => {
            removeMedication(med.id);
            sh.close();
            ctx.refresh?.();
          },
        });
      },
    }, 'Remove'));

  const sh = sheet({ title: med.nickname || med.name, body });
  return sh;
}
