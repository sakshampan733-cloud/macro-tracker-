/*
 * Setup and settings.
 *
 * Onboarding asks only for what the maths genuinely needs, explains what
 * each answer changes, and then gets out of the way.
 */

import { el, clear, field, segmented, toast, icon, sheet, confirmSheet, kcal, empty, append, replaceKids, dateLabel } from '../ui.js';
import { get, commit, exportJSON, importJSON, reset, pushBackup, dayKey } from '../store.js';
import {
  ACTIVITY, GOALS, bmrFor, predictedTDEE, macroTargets, bestTDEE, waterTarget, age,
  goalFeasibility,
} from '../nutrition.js';
import { openWhoopImport, openWhoopConnect } from './body.js';
import { openTrust } from './trust.js';
import { openTargetEditor } from './targets.js';
import { openGoalEditor, feasibilityHead } from './goal.js';
import { generateDemo } from '../demo.js';
import { openSleepGoal, sleepSchedule, sleepHours, clockText } from './sleep.js';
import { goalTile } from './goal.js';
import { openGuide } from './guide.js';
import { openAppleHealth } from './apple.js';
import { openHealthSetup } from './body.js';
import { healthSource } from '../applehealth.js';
import { ORBS, applyOrb } from '../theme.js';
import { VERSION } from '../app.js';
import {
  HEIGHT_UNITS, WEIGHT_UNITS, cmToFtIn, ftInToCm, kgToLb, lbToKg,
} from '../units.js';
import { SUPPLEMENTS, SUPPLEMENT_TAGS, supplementTargetShift } from '../data/supplements.js';

/* ── Onboarding ─────────────────────────────────────────────────────── */

/*
 * The opening questions, openable again.
 *
 * Everything here is a thing about you that changes — your weight, your
 * training, what you are actually training for — and the only way to
 * revisit it was a scattering of individual controls in Settings that
 * never added up to the same page. Six answers went in together; they
 * should be reviewable together.
 *
 * With a profile already saved this seeds from it and edits in place. The
 * supplements list is deliberately not re-seeded — it is a live record of
 * what you take, kept elsewhere, and quietly rewriting it from a setup
 * screen would lose changes made since.
 */
export function renderOnboarding(root, ctx, { editing = false } = {}) {
  clear(root);

  const existing = editing ? (get().profile || null) : null;
  const draft = {
    name: '', sex: 'male', birthYear: new Date().getFullYear() - 25,
    heightCm: 175, weightKg: 70, bodyFatPct: 0,
    activity: 'moderate', goal: 'lean', rate: null,
    ...(existing || {}),
  };

  const preview = el('div.tile');

  const num = (val, step = '1') => el('input.num-in', {
    type: 'number', inputmode: 'decimal', step, value: String(val),
  });

  /*
   * Height and weight each get their own unit, because plenty of people
   * think in feet and kilos, or centimetres and pounds. Tying both to one
   * switch guarantees one of the two is always being converted in
   * somebody's head.
   */
  const units = { height: 'cm', weight: 'kg' };
  draft.supplements = [];

  const fHeight = num(draft.heightCm);
  const fFt = num(5); const fIn = num(9);
  const ftInBox = el('div.field-2', { style: { display: 'none' } },
    field('Feet', fFt), field('Inches', fIn));
  const cmBox = el('div', {}, field('Height', fHeight));

  const heightUnitBox = el('div');
  heightUnitBox.append(segmented(
    Object.entries(HEIGHT_UNITS).map(([k, v]) => ({ value: k, label: v.label })),
    units.height,
    v => {
      /* Carry the value across rather than resetting it — switching units
         is a change of notation, not of height. */
      if (v === 'ftin') {
        const { ft, in: inch } = cmToFtIn(+fHeight.value || 175);
        fFt.value = String(ft); fIn.value = String(inch);
        ftInBox.style.display = ''; cmBox.style.display = 'none';
      } else {
        fHeight.value = String(Math.round(ftInToCm(fFt.value, fIn.value)));
        ftInBox.style.display = 'none'; cmBox.style.display = '';
      }
      units.height = v;
      update();
    }));

  const fWeight = num(draft.weightKg, '0.1');
  const weightUnitBox = el('div');
  weightUnitBox.append(segmented(
    Object.entries(WEIGHT_UNITS).map(([k, v]) => ({ value: k, label: v.label })),
    units.weight,
    v => {
      const kg = units.weight === 'lb' ? lbToKg(+fWeight.value) : +fWeight.value;
      fWeight.value = (v === 'lb' ? kgToLb(kg) : kg).toFixed(1);
      units.weight = v;
      update();
    }));

  /*
   * Supplements, asked at the start.
   *
   * Not for completeness — because some of them change the targets. The
   * one that prompted this: creatine draws water into muscle, so it needs
   * more water alongside it, and the app knew both halves without ever
   * joining them.
   */
  const suppBox = el('div.chips');
  for (const [id, sup] of Object.entries(SUPPLEMENTS)) {
    suppBox.append(el('button.chip', {
      type: 'button', 'aria-pressed': 'false',
      onclick: e => {
        const on = draft.supplements.includes(id);
        draft.supplements = on ? draft.supplements.filter(x => x !== id) : [...draft.supplements, id];
        e.currentTarget.setAttribute('aria-pressed', String(!on));
        update();
      },
    }, sup.label));
  }
  const suppNote = el('div.fine');
  const fBf = num('', '0.1');
  const fYear = num(draft.birthYear);
  const fName = el('input', { type: 'text', placeholder: 'What should the app call you?' });

  const sexBox = el('div');
  sexBox.append(segmented([
    { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' },
  ], draft.sex, v => { draft.sex = v; update(); }));

  const actBox = el('div');
  actBox.append(segmented(
    Object.entries(ACTIVITY).map(([k, v]) => ({ value: k, label: v.label })),
    draft.activity, v => { draft.activity = v; update(); }, { wrap: true }));

  /*
   * The goal hint, shown.
   *
   * Every goal has carried an explanation of what it actually does since
   * the beginning, and the picker rendered the labels alone — so
   * "Recomposition" was a bare word next to "Lose fat", and somebody who
   * wanted to get leaner without getting lighter had no way of knowing
   * that was the one. Naming it "Lose fat, build muscle" helps; saying
   * what it means helps more.
   */
  /*
   * The goal, asked the way it is actually held in someone's head.
   *
   * "Which of nine presets" and "how many kg a week" are both the app's
   * framing. Nobody thinks in kilos per week. They think "I want to be 78
   * by March", and the pace falls out of that — which is also the only
   * version that stays true as time passes, because the app can recompute
   * it from how far there still is to go.
   *
   * So this asks for a destination and a date, and the weekly rate is
   * derived. Holding weight is its own branch, because "stay here and get
   * stronger" has no target weight to aim at and never did.
   */
  const isoDate = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);

  const existingGoal = existing ? get().goal : null;
  const startW = () => draft.weightKg || 70;

  let dir = existingGoal
    ? (existingGoal.targetKg < existingGoal.startKg ? 'lose' : 'gain')
    : (['gain', 'bulk', 'bulkfast'].includes(draft.goal)) ? 'gain'
    : (['maintain', 'recomp'].includes(draft.goal)) ? 'hold' : 'lose';

  let holdKind = draft.goal === 'recomp' ? 'recomp' : 'maintain';

  const fTarget = el('input.num-in', {
    type: 'number', inputmode: 'decimal', step: '0.5', min: '30',
    'aria-label': 'Target weight',
    value: existingGoal?.targetKg != null ? String(existingGoal.targetKg) : '',
  });

  const defEnd = new Date(); defEnd.setDate(defEnd.getDate() + 90);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const fDate = el('input.num-in', {
    type: 'date', min: isoDate(tomorrow),
    'aria-label': 'Target date',
    value: existingGoal?.byDate || isoDate(defEnd),
    style: { padding: '11px', width: '100%' },
  });

  const holdBox = el('div');
  const paceRow = el('div.chips');
  const targetBox = el('div');
  const goalNote = el('div.fine', { style: { marginTop: '8px' } });

  const dirBox = el('div', {}, segmented([
    { value: 'lose', label: 'Lose weight' },
    { value: 'hold', label: 'Hold weight' },
    { value: 'gain', label: 'Gain weight' },
  ], dir, v => {
    dir = v;
    if (v !== 'hold' && !fTarget.value) {
      fTarget.value = String(+(startW() + (v === 'lose' ? -5 : 5)).toFixed(1));
    }
    update();
  }));

  holdBox.append(segmented([
    { value: 'maintain', label: 'Just maintain' },
    { value: 'recomp', label: 'Build muscle at this weight' },
  ], holdKind, v => { holdKind = v; update(); }, { wrap: true }));

  /* Pace chips write the date, exactly as they do in the goal editor —
     one concept, one behaviour, in both places it appears. */
  for (const q of ONBOARD_PACES) {
    paceRow.append(el('button.chip', {
      type: 'button', dataset: { pace: q.id },
      onclick: () => {
        const target = +fTarget.value || startW();
        const perWeek = startW() * q.pct;
        const weeks = Math.abs(target - startW()) / Math.max(0.01, perWeek);
        const end = new Date();
        end.setDate(end.getDate() + Math.max(7, Math.round(weeks * 7)));
        fDate.value = isoDate(end);
        update();
      },
    }, q.label));
  }

  targetBox.append(
    el('div.micro', { style: { margin: '12px 0 5px', color: 'var(--dim)' } }, 'Target weight'),
    el('div.flex', { style: { gap: '8px', alignItems: 'center' } },
      fTarget, el('span.micro', {}, 'kg')),
    el('div.micro', { style: { margin: '12px 0 5px', color: 'var(--dim)' } }, 'How fast'),
    paceRow,
    el('div.micro', { style: { margin: '12px 0 5px', color: 'var(--dim)' } }, 'By when'),
    fDate);

  fTarget.addEventListener('input', update);
  fDate.addEventListener('input', update);
  fDate.addEventListener('change', update);

  const goalBox = el('div', {}, dirBox, holdBox, targetBox, goalNote);

  const read = () => {
    draft.heightCm = units.height === 'ftin'
      ? Math.round(ftInToCm(fFt.value, fIn.value))
      : (+fHeight.value || 175);
    draft.weightKg = units.weight === 'lb'
      ? +lbToKg(+fWeight.value).toFixed(1)
      : (+fWeight.value || 70);
    draft.suppShift = supplementTargetShift(draft.supplements, null);
    draft.bodyFatPct = +fBf.value || 0;
    draft.birthYear = +fYear.value || 2000;
    draft.name = fName.value.trim();

    /*
     * The weekly rate is a consequence now, not an input.
     *
     * Holding weight has no destination, so it keeps its own two goals.
     * Losing or gaining derives the pace from how far it is to the target
     * and how long there is to get there — the same arithmetic the goal
     * editor and the boot-time refresh use, so all three agree rather than
     * each keeping their own copy of the answer.
     */
    if (dir === 'hold') {
      draft.goal = holdKind;
      draft.rate = 0;
      draft.targetKg = null;
      draft.byDate = null;
    } else {
      const target = +fTarget.value;
      const days = Math.max(1, Math.round(
        (new Date(fDate.value + 'T12:00:00') - new Date()) / 86400000));
      draft.goal = dir === 'lose' ? 'cut' : 'gain';
      draft.targetKg = Number.isFinite(target) && target > 30 ? target : null;
      draft.byDate = fDate.value;
      draft.rate = draft.targetKg
        ? +((draft.targetKg - draft.weightKg) / (days / 7)).toFixed(3)
        : GOALS[draft.goal].rate;
    }
    return draft;
  };

  function update() {
    const p = read();

    /* Only one branch of the goal question is ever relevant. */
    holdBox.hidden = dir !== 'hold';
    targetBox.hidden = dir === 'hold';

    if (dir === 'hold') {
      goalNote.textContent = (GOALS[p.goal] || {}).hint || '';
    } else if (!p.targetKg) {
      goalNote.textContent = 'Put in the weight you are aiming for and the app works out the pace.';
    } else {
      const wk = Math.abs(p.rate);
      const perDay = Math.abs(Math.round((p.rate * 7700) / 7));
      const days = Math.max(1, Math.round(
        (new Date(fDate.value + 'T12:00:00') - new Date()) / 86400000));
      const f = goalFeasibility(p.weightKg, p.targetKg, days);
      /* Mark whichever pace chip this date corresponds to. */
      const pct = Math.abs(f.perWeek) / (p.weightKg || 70);
      let near = null, best = Infinity;
      for (const q of ONBOARD_PACES) { const d = Math.abs(pct - q.pct); if (d < best) { best = d; near = q; } }
      [...paceRow.children].forEach(c =>
        c.setAttribute('aria-pressed', String(c.dataset.pace === near?.id && best < 0.002)));

      goalNote.textContent =
        `${wk.toFixed(2)} kg a week — ${perDay} kcal ${p.rate < 0 ? 'under' : 'over'} `
        + `maintenance every day. ${Math.abs(p.targetKg - p.weightKg).toFixed(1)} kg `
        + `over ${days} days. ${feasibilityHead(f)}.`;
    }
    const bmr = bmrFor(p);
    const tdee = predictedTDEE(p);
    const t = macroTargets(p, tdee.kcal);

    /* Say what the supplements did, at the moment they do it. */
    const shift = p.suppShift;
    suppNote.textContent = shift?.waterMl
      ? `${shift.reasons.join(' and ')} raises your water target by `
        + `${shift.waterMl} ml a day — creatine pulls water into muscle, which is `
        + 'most of how it works.'
      : '';

    /* replaceChildren stringifies null where the app's own append() drops
       it — the notes below are conditional, so they have to be filtered
       rather than passed straight in. */
    replaceKids(preview,
      el('div.micro', {}, 'Your starting numbers'),
      el('div.readout', { style: { marginTop: '6px' } },
        el('div', {},
          el('div.readout-main', { style: { fontSize: '36px' } }, kcal(t.kcal)),
          el('div.micro', { style: { marginTop: '2px' } }, 'kcal a day')),
        el('div.readout-side', {},
          el('div.micro', {}, 'Maintenance'),
          el('div.v', {}, kcal(tdee.kcal)))),
      el('div', { style: { display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' } },
        stat('Protein', t.p + ' g', 'var(--m-p)'),
        stat('Carbs', t.c + ' g', 'var(--m-c)'),
        stat('Fat', t.f + ' g', 'var(--m-f)'),
        stat('Water', (t.water / 1000).toFixed(1) + ' L', 'var(--m-water)')),
      el('div.fine', { style: { marginTop: '12px' } },
        `${bmr.method} puts your resting burn at ${kcal(bmr.kcal)} kcal. `
        + `These are a starting point only — once you have logged ten days and weighed in four times, `
        + `the app replaces them with your measured maintenance.`),

      /*
       * Said here, where the goal is being chosen, rather than buried in a
       * screen nobody opens. If the app is going to hand a fifteen-year-old
       * a number, it owes them the reason it is the number it is.
       */
      youthNote(p, t, bmr),
      compositionNote(p, t),
    );
  }

  [fHeight, fFt, fIn, fWeight, fBf, fYear, fName].forEach(i => i.addEventListener('input', update));

  root.append(
    /* First run gets the wordmark and the pitch. Coming back to it does
       not — the app is already open above this, and repeating the brand
       bar under the brand bar just looks like a bug. */
    existing
      ? el('div', { style: { padding: '4px 0 14px' } },
          el('h1', { style: { fontSize: '26px' } }, 'Your details'),
          el('p', { style: { color: 'var(--text-2)', lineHeight: '1.55', marginTop: '8px' } },
            'The same six answers you started with. Changing your weight or goal re-suggests '
            + 'your calories and split; anything you set by hand in Targets stays as you set it.'))
      : el('div', { style: { padding: '30px 0 18px' } },
          el('div.brand', {}, 'BAS', el('span', {}, 'AL')),
          el('h1', { style: { marginTop: '14px', fontSize: '30px' } }, 'Measure what you eat.'),
          el('p', { style: { color: 'var(--text-2)', lineHeight: '1.55', marginTop: '8px' } },
            'Six answers and you are logging. Every one of them is used in a calculation you can see.')),

    field('Name', fName),
    field('Height in', heightUnitBox),
    cmBox, ftInBox,
    field('Weight in', weightUnitBox),
    el('div', {}, field('Weight', fWeight)),
    el('div.field-2', {}, field('Born', fYear), field('Body fat %', fBf)),
    el('div.field', {}, el('div.help', { style: { marginTop: '-6px' } },
      'Body fat is optional. If you know it, the app uses Katch-McArdle instead of Mifflin-St Jeor, which is more accurate because it works off lean mass.')),

    field('Sex', sexBox, 'Used by the resting-metabolism equation.'),
    field('Training', actBox),
    /*
     * One place for the goal, once a dated one exists.
     *
     * A target weight with a date now sets the pace, and it recomputes
     * every launch from how far you still have to go. Leaving a second
     * pace control here would show a number the goal overwrites on the
     * next boot — two goals again, with the losing one still on screen.
     */
    field('Goal', goalBox,
      'Where you want to be, and by when. The weekly pace and your calories both '
      + 'follow from that, and keep following it as you go.'),
    field('Anything you take', suppBox,
      'Optional, and changeable later. Some of these move your targets.'),
    suppNote,

    preview,

    el('button.btn.primary.block', {
      style: { marginTop: '4px' },
      onclick: () => {
        const p = read();
        if (!(p.heightCm > 100 && p.weightKg > 25)) { toast('Check your height and weight.', 'err'); return; }
        const tdee = predictedTDEE(p);
        commit(s => {
          /* Editing keeps what this form does not ask about — a custom
             split above all. Changing your goal here should re-suggest,
             not silently discard numbers you set by hand. */
          /* The destination is not part of the profile — it lives in
             s.goal, which is what the goal card, the feasibility check and
             the boot-time pace refresh all read. */
          const { targetKg, byDate, ...prof } = p;
          s.profile = existing ? { ...existing, ...prof } : prof;
          if (targetKg && byDate) {
            s.goal = {
              startKg: prof.weightKg,
              targetKg,
              startDate: s.goal?.startDate || dayKey(),
              byDate,
              createdAt: s.goal?.createdAt || Date.now(),
            };
          } else {
            delete s.goal;
          }
          s.targets = macroTargets(s.profile, tdee.kcal);
          if (!existing) s.supplementsTaken = [...draft.supplements];
          s.settings.heightUnit = units.height;
          s.settings.weightUnit = units.weight;
        }, 'profile');
        toast(existing ? 'Updated.' : 'Ready.');
        ctx.go(existing ? 'settings' : 'today');
      },
    }, existing ? 'Save changes' : 'Start logging'),
    el('div', { style: { height: '30px' } }),
  );

  update();
}

/*
 * When the target is too low to be composed well.
 *
 * Not a warning about the split — the split is doing the best it can. It
 * is a warning about the calorie number, which is the thing that has to
 * move. If protein at its ceiling and fat at its floor still cannot leave
 * 130 g of carbohydrate, the pace is the problem, and printing a smaller
 * carb figure without comment would be the app quietly agreeing to it.
 */
function compositionNote(p, t) {
  if (!t.basis?.carbFloored) return null;
  const rate = t.basis?.rate;
  return el('div.tile', {
    style: { marginTop: '12px', borderLeft: '3px solid var(--caution)' },
  },
    el('div', { style: { fontSize: '13.5px', fontWeight: '600' } },
      'This pace does not leave room to eat well'),
    el('div.fine', { style: { marginTop: '5px' } },
      `At ${kcal(t.kcal)} kcal there is no way to fit enough protein, the fat you need for `
      + `hormones, and the ${t.basis.carbRda} g of carbohydrate your brain runs on. Carbs come `
      + `out at ${t.c} g because they are what is left, not because that is a good amount.`),
    el('div.fine', { style: { marginTop: '6px' } },
      rate?.suggested
        ? `A slower ${rate.suggested} kg a week fits, and loses roughly the same fat over a `
          + 'few months with a lot less taken away from you.'
        : 'A slower pace, or a smaller deficit, would fit.'));
}

/*
 * What the app says to somebody who is still growing.
 *
 * Two things, and only when they apply: that holding weight is the better
 * plan at this age and why, and — if a deficit has been chosen anyway —
 * that the pace is steeper than it should be. Stated once, in the place
 * the decision is made, and never as a refusal. The goal is not wrong; it
 * is a thing to do with a doctor watching rather than alone with an app.
 */
function youthNote(p, t, bmr) {
  const y = t.basis?.youth;
  if (!y) return null;

  const rate = t.basis?.rate;
  const cutting = (t.basis?.rateKgPerWeek ?? 0) < 0;

  return el('div.tile', {
    style: { marginTop: '12px', borderLeft: '3px solid var(--caution)' },
  },
    el('div', { style: { fontSize: '13.5px', fontWeight: '600' } },
      `You are ${y.years}, so the numbers work differently`),
    el('div.fine', { style: { marginTop: '5px' } }, y.why),
    cutting
      ? el('div.fine', { style: { marginTop: '6px' } },
          (rate?.suggested
            ? `At this pace you are losing faster than is sensible while growing. `
              + `${rate.suggested} kg a week would be the ceiling — or pick Maintain and let `
              + `height do the work. `
            : '')
          + y.seeSomeone)
      : null,
    /* The number matches a calorie calculator, deliberately. Saying what
       the age-specific equation would have given is information; quietly
       using it instead would be the app overruling a choice. */
    el('div.fine', { style: { marginTop: '6px' } },
      `Carbohydrate is held at ${t.basis?.carbRda ?? 130} g — the amount your brain runs on — `
      + 'rather than being whatever is left over after protein and fat.'
      + (bmr.schofield
        ? ` Your resting burn uses the same equation a calorie calculator does. The equation `
          + `meant for your age would put it nearer ${kcal(bmr.schofield)} kcal, so if you find `
          + `this hard to eat to, that is why.`
        : '')));
}

/* Same three paces the goal editor offers, as shares of bodyweight so
   they scale with the person. Shared so the two screens cannot drift. */
const ONBOARD_PACES = [
  { id: 'slow',   label: 'Slow',   pct: 0.0035 },
  { id: 'steady', label: 'Steady', pct: 0.0065 },
  { id: 'fast',   label: 'Fast',   pct: 0.0100 },
];

const stat = (label, value, hue) =>
  el('div', {},
    el('div.micro', { style: { color: hue } }, label),
    el('div.num', { style: { fontSize: '16px', marginTop: '2px' } }, value));

/* ── Settings ───────────────────────────────────────────────────────── */

/* Six hues, shown as what they are rather than named in a dropdown —
   you are picking a colour, so the control should be the colour. */
/*
 * A settings group.
 *
 * Settings had grown to eleven labelled sections on one page — everything
 * visible at once, which means nothing is findable. Collapsing them turns
 * it into a short list of categories you can scan, with the contents one
 * tap away.
 *
 * Open state is persisted rather than held in a local variable, because
 * almost every control in here calls ctx.refresh() when you change it —
 * an unsaved open state would slam every group shut the moment you
 * touched a toggle.
 */
function group(ctx, key, title, subtitle, ...children) {
  const s = get();
  const open = (s.settings.openGroups || []).includes(key);

  const body = el('div.set-body');
  if (open) append(body, ...children);

  const head = el('button.set-head', {
    type: 'button',
    'aria-expanded': String(open),
    onclick: () => {
      commit(st => {
        const list = st.settings.openGroups || [];
        const i = list.indexOf(key);
        if (i >= 0) list.splice(i, 1); else list.push(key);
        st.settings.openGroups = list;
      }, 'settings');
      ctx.refresh();
    },
  },
    el('div.grow', {},
      el('div.set-title', {}, title),
      el('div.set-sub', {}, subtitle)),
    el('span.set-chev', {}, icon('chevron', 16)));

  return el('div.set-group' + (open ? '.is-open' : ''), {}, head, body);
}

export function renderSettings(root, ctx) {
  const s = get();
  const p = s.profile;
  clear(root);

  const num = (val, step = '1') => el('input.num-in', { type: 'number', inputmode: 'decimal', step, value: String(val ?? '') });

  const mode = healthSource();
  const hUnit = HEIGHT_UNITS[s.settings.heightUnit] ? s.settings.heightUnit : 'cm';
  const wUnit = WEIGHT_UNITS[s.settings.weightUnit] ? s.settings.weightUnit : 'kg';

  const fHeight = num(hUnit === 'ftin' ? '' : p.heightCm);
  const hFt = num(cmToFtIn(p.heightCm).ft);
  const hIn = num(cmToFtIn(p.heightCm).in);
  const fWeight = num(wUnit === 'lb' ? +kgToLb(p.weightKg).toFixed(1) : p.weightKg, '0.1');

  const hUnitBox = el('div');
  hUnitBox.append(segmented(
    Object.entries(HEIGHT_UNITS).map(([k, v]) => ({ value: k, label: v.label })),
    hUnit, v => { commit(st => { st.settings.heightUnit = v; }); ctx.refresh(); }, {}));

  const wUnitBox = el('div');
  wUnitBox.append(segmented(
    Object.entries(WEIGHT_UNITS).map(([k, v]) => ({ value: k, label: v.label })),
    wUnit, v => { commit(st => { st.settings.weightUnit = v; }); ctx.refresh(); }, {}));

  /* Writing back always converts to the stored unit, never the other way:
     centimetres and kilograms are what the app keeps. */
  hFt.addEventListener('change', () => save({ heightCm: Math.round(ftInToCm(hFt.value, hIn.value)) }));
  hIn.addEventListener('change', () => save({ heightCm: Math.round(ftInToCm(hFt.value, hIn.value)) }));
  const fBf = num(p.bodyFatPct || '', '0.1');
  const fYear = num(p.birthYear);
  const fGlass = num(s.settings.glassMl, '10');

  const actBox = el('div');
  actBox.append(segmented(Object.entries(ACTIVITY).map(([k, v]) => ({ value: k, label: v.label })),
    p.activity, v => save({ activity: v }), { wrap: true }));

  const dietBox = el('div');
  dietBox.append(segmented([
    { value: 'all', label: 'Everything' }, { value: 'egg', label: 'No meat' }, { value: 'veg', label: 'Vegetarian' },
  ], s.settings.diet, v => { commit(st => { st.settings.diet = v; }); toast('Filter applied.'); ctx.refresh(); }));

  const tdeeBox = el('div');
  tdeeBox.append(segmented([
    { value: 'auto', label: 'Best available' },
    { value: 'adaptive', label: 'Adaptive' },
    { value: 'whoop', label: 'Whoop' },
    { value: 'predicted', label: 'Formula' },
  ], s.settings.tdeeSource, v => { commit(st => { st.settings.tdeeSource = v; }); toast('Target source changed.'); ctx.refresh(); }, { wrap: true }));

  fGlass.addEventListener('change', () => {
    commit(st => { st.settings.glassMl = +fGlass.value || 250; });
    ctx.refresh();
  });

  function save(patch) {
    commit(st => { Object.assign(st.profile, patch); }, 'profile');
    ctx.refresh();
  }

  const applyBody = () => {
    save({
      heightCm: hUnit === 'ftin'
        ? Math.round(ftInToCm(hFt.value, hIn.value))
        : (+fHeight.value || p.heightCm),
      /* Typed in pounds, stored in kilos. The unit is a display choice;
         the stored number never changes meaning. */
      weightKg: wUnit === 'lb'
        ? +lbToKg(+fWeight.value || kgToLb(p.weightKg)).toFixed(1)
        : (+fWeight.value || p.weightKg),
      bodyFatPct: +fBf.value || 0,
      birthYear: +fYear.value || p.birthYear,
    });
    toast('Saved.');
  };
  [fHeight, fWeight, fBf, fYear].forEach(i => i.addEventListener('change', applyBody));

  const best = bestTDEE(s, p);
  const targets = macroTargets(p, best.kcal);

  append(root,

    el('h1', { style: { marginBottom: '14px' } }, 'Settings'),

    el('div.tile', {},
      el('div.micro', {}, 'Current target'),
      el('div.readout', { style: { marginTop: '4px' } },
        el('div', {}, el('div.readout-main', { style: { fontSize: '32px' } }, kcal(targets.kcal))),
        el('div.readout-side', {},
          el('div.micro', {}, 'Maintenance · ' + best.source),
          el('div.v', {}, kcal(best.kcal), best.sigma ? ` ±${best.sigma}` : ''))),
      el('div.fine', { style: { marginTop: '8px' } }, best.why || '')),

    group(ctx, 'body', 'Body and goal',
      'Height, weight, training, and the goal everything is measured against.',
      el('div.field-2', {}, field(`Height (${hUnit === 'ftin' ? 'ft, in' : 'cm'})`,
        hUnit === 'ftin' ? el('div.field-2', {}, field('Feet', hFt), field('Inches', hIn)) : fHeight),
      field(`Weight (${wUnit})`, fWeight)),
    el('div.field-2', {}, field('Show height in', hUnitBox), field('Show weight in', wUnitBox)),
      el('div.field-2', {}, field('Born', fYear), field('Body fat %', fBf)),
      field('Training', actBox),

      /*
       * The goal is asked once, in Your details, as a destination and a
       * date. A third copy of it here — a nine-way picker and a raw weekly
       * rate, both of which the dated goal overwrites on the next launch —
       * was the duplication this was meant to end.
       */
      goalTile(s, ctx)),

    group(ctx, 'target', 'Targets',
      'Your calories and split, where the figure comes from, and whether it looks back.',
      el('div.tile', {},
        el('div.between', {},
          el('div', { style: { flex: '1', paddingRight: '12px' } },
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Calories and split'),
            el('div.fine', { style: { marginTop: '3px' } },
              s.profile?.custom
                ? `Yours: ${s.targets?.p ?? '—'} g protein · ${s.targets?.c ?? '—'} g carbs · `
                  + `${s.targets?.f ?? '—'} g fat.`
                : 'Drag protein, carbs and fat against your calorie total, or type exact '
                  + 'numbers. The app suggests; you decide.')),
          el('button.btn.sm', { onclick: () => openTargetEditor(ctx) },
            s.profile?.custom ? 'Edit' : 'Adjust'))),
      el('div.tile', {},
        el('div.between', {},
          el('div', { style: { flex: '1', paddingRight: '12px' } },
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Your details'),
            el('div.fine', { style: { marginTop: '3px' } },
              'Height, weight, age, training and goal — the six answers you gave at the start, '
              + 'on the same screen you gave them on.')),
          el('button.btn.sm', { onclick: () => ctx.go('profile') }, 'Open'))),
      field('Maintenance source', tdeeBox,
        'Best available prefers your own adaptive figure, falls back to Whoop, then the formula.'),
      el('div.tile', {},
        el('div.between', {},
          el('div', { style: { flex: '1', paddingRight: '12px' } },
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Carry the day forward'),
            el('div.fine', { style: { marginTop: '3px' } },
              'Energy balance is cumulative, so a shortfall or a surplus rolls into '
              + 'the next day rather than vanishing at midnight. Capped at 400 kcal, '
              + 'expires after three days, and only counts days it can tell were '
              + 'finished — a half-logged day is never treated as a real deficit. '
              + 'Calories only: protein is not stored and cannot be repaid, so it is '
              + 'reported as a seven-day trend instead.')),
          el('button.btn.sm', {
            onclick: () => {
              commit(st => { st.settings.carryForward = st.settings.carryForward !== true; });
              toast(get().settings.carryForward
                ? 'Carrying forward. Capped at 400 kcal.'
                : 'Each day stands on its own again.');
              ctx.refresh();
            },
          }, s.settings.carryForward === true ? 'On' : 'Off')))),

    group(ctx, 'food', 'Food',
      'Your library, suggestions, and glass size.',
      el('div.tile', {},
        el('div.between', {},
          el('div', {},
            el('div', { style: { fontWeight: '500' } }, 'Food library and meals'),
            el('div.fine', { style: { marginTop: '3px' } },
              'Everything you have built, scanned or saved.')),
          el('button.btn.sm', { onclick: () => ctx.go('foods') }, 'Open'))),
      field('Show me', dietBox,
      'Hides what you do not eat from search, menus and suggestions. Foods you '
      + 'saved yourself always stay visible.'),
      field('Glass size (ml)', fGlass)),

    /*
     * Sleep sits in its own group rather than under Whoop, because the
     * people who most need it are the ones with no band at all — burying
     * it under a brand they do not own is how it stayed unfindable.
     */
    group(ctx, 'sleep', 'Sleep',
      'Your bedtime and wake time, with or without a band.',
      el('div.tile', {},
        el('div.between', {},
          el('div', { style: { flex: '1', paddingRight: '12px' } },
            el('div', { style: { fontWeight: '500' } }, 'Sleep goal'),
            el('div.fine', { style: { marginTop: '3px' } },
              sleepSchedule()
                ? `Asleep ${clockText(sleepSchedule().bed)} to ${clockText(sleepSchedule().wake)}`
                  + ` — ${sleepHours(sleepSchedule()).toFixed(1)} h.`
                : 'Not set. The coach, the water pacing and the caffeine cutoff are all '
                  + 'measured from your wake time and bedtime — without a band this is '
                  + 'where they come from.')),
          el('button.btn.sm', { onclick: () => openSleepGoal(ctx) },
            sleepSchedule() ? 'Change' : 'Set it')))),

    group(ctx, 'weighing', 'Weighing',
      'When the app asks for your weight.',
      el('div.tile', {},
        el('div.between', {},
          el('div', { style: { flex: '1', paddingRight: '12px' } },
            el('div', { style: { fontWeight: '500' } }, 'Ask when it matters'),
            el('div.fine', { style: { marginTop: '3px' } },
              s.settings?.weighReminder === false
                ? 'Off. Nothing will ask, and the trend and your maintenance figure get '
                  + 'whatever you happen to log.'
                : 'On. Nothing daily — it speaks up only when a missing weight is actually '
                  + 'costing something, and says which thing.')),
          el('button.btn.sm', {
            onclick: () => {
              commit(st => { st.settings.weighReminder = st.settings.weighReminder === false; }, 'settings');
              ctx.refresh();
            },
          }, s.settings?.weighReminder === false ? 'Turn on' : 'Turn off')),

        el('div.fine', { style: { marginTop: '14px' } },
          'It asks when your maintenance figure has fewer than the four weigh-ins a month '
          + 'it needs, when a week has passed and the ten-day trend has gone stale, or when '
          + 'a thin month is leaving the ± wider than it has to be. Weigh most mornings and '
          + 'you will never see it, which is the point — a reminder that fires when nothing '
          + 'is wrong is one you learn to ignore.'),
        el('div.fine', { style: { marginTop: '8px' } },
          'Morning readings are the comparable ones. Evening weight runs a kilo or two '
          + 'higher — gut contents, glycogen and the water bound to it, salt — and by a '
          + 'different amount each day, so it is not an offset that could be corrected for. '
          + 'Anything logged outside the morning is marked rather than quietly averaged in.'))),

    /*
     * When you train, which is the only thing the app needs in order to
     * ask about it at a useful moment. Logging a session otherwise means
     * opening a tab, and most days the answer is one word.
     */
    group(ctx, 'training', 'Training',
      'When you usually train, so the app can ask on the day.',
      el('div.tile', {},
        el('div.between', {},
          el('div', { style: { flex: '1', paddingRight: '12px' } },
            el('div', { style: { fontWeight: '500' } }, 'Ask me at'),
            el('div.fine', { style: { marginTop: '3px' } },
              get().settings?.workoutHour != null
                ? `After ${clockText(get().settings.workoutHour)}, Home asks whether you trained — `
                  + 'and sooner if your band records a hard day before then. One tap logs it '
                  + 'with the next session in your rotation. Skip, and it stops asking until '
                  + 'tomorrow.'
                : 'Not set. Your band can still prompt you when it records a hard day; set an '
                  + 'hour as well and Home asks then too, rather than you having to remember '
                  + 'to open the Train tab.')),
          el('select.sel', {
            onchange: e => {
              const v = e.target.value;
              commit(st => {
                if (v === '') delete st.settings.workoutHour;
                else st.settings.workoutHour = +v;
              }, 'settings');
              ctx.refresh();
            },
          },
            el('option', { value: '', selected: get().settings?.workoutHour == null }, 'Off'),
            ...Array.from({ length: 18 }, (_, i) => i + 5).map(h =>
              el('option', { value: String(h), selected: get().settings?.workoutHour === h },
                clockText(h))))))),

    /*
     * Named for what it is rather than for one brand. Somebody with an
     * Apple Watch should not have to open a section called "Whoop" to set
     * their watch up, and the choice of band belongs at the top of it
     * rather than buried in the Body tab.
     */
    group(ctx, 'wearable', 'Wearable',
      mode === 'apple' ? 'Your Apple Watch.'
        : mode === 'whoop' ? 'Your Whoop band.'
        : mode === 'both' ? 'Your Whoop band and your Apple Watch.'
        : 'Whether you wear anything, and what.',

      el('div.tile', {},
        el('div.between', {},
          el('div', { style: { flex: '1', paddingRight: '12px' } },
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'What you wear'),
            el('div.fine', { style: { marginTop: '3px' } },
              mode === 'apple' ? 'Apple Watch. The app shows only what your watch can measure.'
                : mode === 'whoop' ? 'Whoop. The app shows only what your band can measure.'
                : mode === 'both' ? 'Whoop and Apple Watch. Apple fills the step count Whoop withholds.'
                : mode === 'none' ? 'Nothing. Weight, intake and the adaptive TDEE do the work.'
                : 'Not set — the app cannot tell which readings to offer you.')),
          el('button.btn.sm', { onclick: () => openHealthSetup(ctx) },
            mode ? 'Change' : 'Choose'))),

      mode === 'apple' || mode === 'both'
        ? el('div.tile', {},
            el('div.between', {},
              el('div', { style: { flex: '1', paddingRight: '12px' } },
                el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Apple Health'),
                el('div.fine', { style: { marginTop: '3px' } },
                  'Apple has no web API, so your phone pushes the data on a schedule '
                  + 'through a Shortcut.')),
              el('button.btn.sm', { onclick: () => openAppleHealth(ctx) }, 'Set up')))
        : null,
      mode === 'whoop' || mode === 'both' || !mode
        ? el('div.tile', {},
            el('div.between', {},
              el('div', {},
                el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Whoop data'),
                el('div.micro', { style: { marginTop: '3px' } },
                  /* Someone who has never synced has no whoop object at
                     all, and this reached straight through to .rows —
                     taking the whole Settings screen down with it. */
                  Object.keys(s.whoop?.rows || {}).length
                    ? `${Object.keys(s.whoop.rows).length} days imported`
                    : 'Not imported')),
              el('button.btn.sm', { onclick: () => openWhoopConnect(ctx) }, 'Set up')))
        : null),

    group(ctx, 'look', 'Appearance',
      'How the app looks.',
      el('div.tile', {},
        el('div.set-label', { style: { marginBottom: '8px' } },
          el('span.micro', {}, 'Background glow')),
        el('div.orb-row', {},
          ...Object.entries(ORBS).map(([key, o]) => el('button.orb-dot'
              + ((get().settings.orb || 'none') === key ? '.is-on' : ''), {
            type: 'button', title: o.label, 'aria-label': o.label,
            ...(o.dark ? {} : { 'data-none': '' }),
            style: o.dark ? { '--swatch': `rgb(${o.dark})` } : {},
            onclick: () => {
              commit(st => { st.settings.orb = key; }, 'settings');
              applyOrb(key, document.documentElement.getAttribute('data-theme') || 'dark');
              ctx.refresh();
            },
          }))),
        el('div.fine', { style: { margin: '8px 0 16px' } },
          'Off by default — a flat ground is what makes the cards read as objects. '
          + 'Pick a colour if you would rather the app sat in a lit room.'),
        el('div.theme-row', {},
          ...[
            ['dark',  'Dark'],
            ['light', 'Light'],
            ['auto',  'System'],
          ].map(([value, label]) => el('button.theme-opt', {
            type: 'button',
            'aria-pressed': String((s.settings.theme || 'dark') === value),
            onclick: () => {
              commit(st => { st.settings.theme = value; }, 'settings');
              ctx.refresh();
            },
          },
            el('div', { class: 'theme-swatch ' + value }),
            el('span.micro', {}, label)))),
        el('div.fine', { style: { marginTop: '10px' } },
          'Dark is true black — on an OLED screen those pixels are genuinely off. '
          + 'Light is a cool near-white with white cards, not the cream it used to be.'))),

    group(ctx, 'read', 'Reading',
      'How much the app explains, and how much to trust it.',
      el('div.tile', {},
        el('div.between', {},
          el('div', { style: { flex: '1', paddingRight: '12px' } },
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Guide'),
            el('div.fine', { style: { marginTop: '3px' } },
              'What each screen is for, how meals and scanning work, and what the ± means.')),
          el('button.btn.sm', { onclick: () => openGuide() }, 'Read'))),
      el('div.tile', {},
        el('div.between', {},
          el('div', { style: { flex: '1', paddingRight: '12px' } },
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Explanations'),
            el('div.fine', { style: { marginTop: '3px' } },
              'The paragraphs explaining what fibre, leucine or a limiting amino acid actually are. '
              + 'Useful the first few times, clutter once you know. Your numbers and warnings stay either way.')),
          el('button.btn.sm', {
            onclick: () => {
              commit(st => { st.settings.explain = st.settings.explain === false; });
              toast(get().settings.explain === false ? 'Explanations off.' : 'Explanations on.');
              ctx.refresh();
            },
          }, s.settings.explain === false ? 'Off' : 'On'))),
      el('div.tile', {},
        el('div.between', {},
          el('div', {},
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'What to trust'),
            el('div.fine', { style: { marginTop: '3px' } },
              'Which parts of this app are solid, which are guesses, and what it cannot see at all.')),
          el('button.btn.sm', { onclick: () => openTrust() }, 'Read')))),

    group(ctx, 'data', 'Data',
      'Export, backup, demo data, and erasing.',
      el('div.tile', {},
        el('div', { style: { fontSize: '14px', fontWeight: '500' } },
          get().settings.isDemo ? 'Demo data is loaded' : 'Try two years of data'),
        el('div.fine', { style: { marginTop: '4px' } },
          get().settings.isDemo
            ? 'Everything you are looking at is generated. Clear it before you start logging for real — otherwise your first weeks get averaged in with someone who does not exist.'
            : 'Fills the app with two years of plausible logs, weigh-ins, Whoop days and blood panels so every report has something to show. '
              + 'Deliberately imperfect — a holiday where logging stopped, an eleven-week plateau, a festive regain.'),
        el('div.btn-row', { style: { marginTop: '12px' } },
          el('button.btn', {
            onclick: async () => {
              if (!(await confirmSheet({
                title: 'Load two years of demo data?',
                message: 'This replaces everything currently in the app — your log, weigh-ins, Whoop data and settings. Export a backup first if any of it is real.',
                confirmLabel: 'Load demo data', danger: true,
              }))) return;
              toast('Generating two years…');
              setTimeout(() => {
                const demo = generateDemo({ years: 2 });
                commit(st => {
                  /*
                   * Keep what the demo is about to overwrite.
                   *
                   * The demo carries its own profile — birth year 1996,
                   * 178 cm, its own weight — and it was written straight
                   * over the real one, so anybody who tapped this button
                   * ended up with the demo's body. Two people who both
                   * tried it got identical maintenance figures, and
                   * neither matched a calorie calculator run on their own
                   * numbers, with nothing on screen connecting the two
                   * facts. Clearing the demo did not undo it either: the
                   * profile was simply gone.
                   */
                  st.settings.preDemo = {
                    profile: st.profile ? { ...st.profile } : null,
                    settings: {
                      healthSource: st.settings.healthSource ?? null,
                      sleepGoal: st.settings.sleepGoal ?? null,
                      workoutHour: st.settings.workoutHour ?? null,
                    },
                  };
                  st.days = demo.days;
                  st.whoop = demo.whoop;
                  st.blood = demo.blood;
                  st.meals = demo.meals;
                  st.library = demo.library;
                  st.supplementsTaken = demo.supplementsTaken;
                  st.medications = demo.medications || [];
                  st.plans = demo.plans || {};
                  st.train = demo.train || undefined;
                  st.appleHealth = demo.appleHealth || undefined;
                  if (demo.profile) st.profile = { ...(st.profile || {}), ...demo.profile };
                  st.settings.isDemo = true;
                  /* The demo has to exercise what the app now does, or it
                     shows a version of the app that no longer exists. */
                  Object.assign(st.settings, demo.settings || {});
                }, 'import');
                toast(`${demo.stats.days} days loaded.`);
                location.reload();
              }, 60);
            },
          }, get().settings.isDemo ? 'Regenerate' : 'Load demo data'),
          get().settings.isDemo ? el('button.btn.danger', {
            onclick: async () => {
              if (!(await confirmSheet({
                title: 'Clear the demo data?',
                message: 'Everything generated will be removed and you will start from an empty app.',
                confirmLabel: 'Clear it', danger: true,
              }))) return;
              commit(st => {
                st.days = {}; st.whoop = { rows: {}, importedAt: null };
                st.blood = {}; st.meals = {}; st.library = {};
                st.supplementsTaken = []; st.settings.isDemo = false;
                /* Hand back the body the demo borrowed. */
                const kept = st.settings.preDemo;
                if (kept) {
                  if (kept.profile) st.profile = kept.profile;
                  for (const [k, v] of Object.entries(kept.settings || {})) {
                    if (v == null) delete st.settings[k]; else st.settings[k] = v;
                  }
                  delete st.settings.preDemo;
                }
              }, 'import');
              location.reload();
            },
          }, 'Clear demo') : null)),
      el('div.tile', {},
        el('div.btn-row', { style: { marginBottom: '10px' } },
          el('button.btn', { onclick: doExport }, icon('upload', 16), 'Export'),
          el('button.btn', { onclick: doImport }, 'Import')),
        el('button.btn.block', { onclick: async () => { await pushBackup(); toast('Snapshot sent to the Mac.'); } },
          'Back up to the Mac now'),
        el('div.fine', { style: { marginTop: '10px' } },
          'Everything lives in this browser. Export regularly, and keep the Mac backup on — clearing Safari data would otherwise take the log with it.')),

      el('div.tile', {},
        el('button.btn.danger.block', {
          onclick: async () => {
            if (await confirmSheet({
              title: 'Erase everything?',
              message: 'Every logged day, your food library, and your Whoop import will be deleted from this device. Export first if you want a copy.',
              confirmLabel: 'Erase everything', danger: true,
            })) { reset(); location.reload(); }
          },
        }, 'Erase all data')),

      el('div.tile', {},
        el('div.between', {},
          el('div', {},
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Version'),
            el('div.micro', { style: { marginTop: '3px' } }, VERSION)),
          el('button.btn.sm', {
            onclick: async () => {
              toast('Checking…');
              try {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(r => r.unregister()));
                for (const k of await caches.keys()) await caches.delete(k);
              } catch { /* nothing cached, nothing to clear */ }
              location.reload();
            },
          }, 'Force update'))),

      el('div', { style: { height: '20px' } })),

    
  );

  function doExport() {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `basal-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function doImport() {
    const f = el('input', { type: 'file', accept: '.json,application/json' });
    f.addEventListener('change', async () => {
      const file = f.files[0];
      if (!file) return;
      try {
        importJSON(await file.text());
        toast('Restored.');
        location.reload();
      } catch (e) { toast(e.message, 'err'); }
    });
    f.click();
  }
}
