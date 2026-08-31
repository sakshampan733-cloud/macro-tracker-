/*
 * Setup and settings.
 *
 * Onboarding asks only for what the maths genuinely needs, explains what
 * each answer changes, and then gets out of the way.
 */

import { el, clear, field, segmented, toast, icon, sheet, confirmSheet, kcal, empty, append } from '../ui.js';
import { get, commit, exportJSON, importJSON, reset, pushBackup } from '../store.js';
import {
  ACTIVITY, GOALS, bmrFor, predictedTDEE, macroTargets, bestTDEE, waterTarget, age,
} from '../nutrition.js';
import { openWhoopImport, openWhoopConnect } from './body.js';
import { openTrust } from './trust.js';
import { generateDemo } from '../demo.js';
import { openSleepGoal, sleepSchedule, sleepHours, clockText } from './sleep.js';
import { ORBS, applyOrb } from '../theme.js';
import { goalTile } from './goal.js';
import { openGuide } from './guide.js';
import { openAppleHealth } from './apple.js';
import { openHealthSetup } from './body.js';
import { healthSource } from '../applehealth.js';
import { VERSION } from '../app.js';
import {
  HEIGHT_UNITS, WEIGHT_UNITS, cmToFtIn, ftInToCm, kgToLb, lbToKg,
} from '../units.js';
import { SUPPLEMENTS, SUPPLEMENT_TAGS, supplementTargetShift } from '../data/supplements.js';

/* ── Onboarding ─────────────────────────────────────────────────────── */

export function renderOnboarding(root, ctx) {
  clear(root);

  const draft = {
    name: '', sex: 'male', birthYear: new Date().getFullYear() - 25,
    heightCm: 175, weightKg: 70, bodyFatPct: 0,
    activity: 'moderate', goal: 'lean', rate: null,
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

  const goalBox = el('div');
  goalBox.append(segmented(
    Object.entries(GOALS).map(([k, v]) => ({ value: k, label: v.label })),
    draft.goal, v => { draft.goal = v; update(); }, { wrap: true }));

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
    draft.rate = GOALS[draft.goal].rate;
    return draft;
  };

  function update() {
    const p = read();
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

    preview.replaceChildren(
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
    );
  }

  [fHeight, fFt, fIn, fWeight, fBf, fYear, fName].forEach(i => i.addEventListener('input', update));

  root.append(
    el('div', { style: { padding: '30px 0 18px' } },
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
    field('Goal', goalBox),
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
          s.profile = p;
          s.targets = macroTargets(p, tdee.kcal);
          s.supplementsTaken = [...draft.supplements];
          s.settings.heightUnit = units.height;
          s.settings.weightUnit = units.weight;
        }, 'profile');
        toast('Ready.');
        ctx.go('today');
      },
    }, 'Start logging'),
    el('div', { style: { height: '30px' } }),
  );

  update();
}

const stat = (label, value, hue) =>
  el('div', {},
    el('div.micro', { style: { color: hue } }, label),
    el('div.num', { style: { fontSize: '16px', marginTop: '2px' } }, value));

/* ── Settings ───────────────────────────────────────────────────────── */

/* Six hues, shown as what they are rather than named in a dropdown —
   you are picking a colour, so the control should be the colour. */
function orbPicker(ctx) {
  const row = el('div.orb-row');
  const current = get().settings.orb || 'none';
  for (const [key, o] of Object.entries(ORBS)) {
    const dot = el('button.orb-dot' + (key === current ? '.is-on' : ''), {
      type: 'button', title: o.label, 'aria-label': o.label,
      'aria-pressed': String(key === current),
      style: { '--swatch': `rgb(${o.dark})` },
      onclick: () => {
        commit(st => { st.settings.orb = key; }, 'settings');
        applyOrb(key, 'dark');
        [...row.children].forEach(c => {
          c.classList.remove('is-on');
          c.setAttribute('aria-pressed', 'false');
        });
        dot.classList.add('is-on');
        dot.setAttribute('aria-pressed', 'true');
      },
    });
    row.append(dot);
  }
  return row;
}


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
  const fRate = num(p.rate ?? GOALS[p.goal].rate, '0.05');
  const fGlass = num(s.settings.glassMl, '10');

  const actBox = el('div');
  actBox.append(segmented(Object.entries(ACTIVITY).map(([k, v]) => ({ value: k, label: v.label })),
    p.activity, v => save({ activity: v }), { wrap: true }));

  const goalBox = el('div');
  goalBox.append(segmented(Object.entries(GOALS).map(([k, v]) => ({ value: k, label: v.label })),
    p.goal, v => save({ goal: v, rate: GOALS[v].rate }), { wrap: true }));

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
      rate: +fRate.value,
    });
    toast('Saved.');
  };
  [fHeight, fWeight, fBf, fYear, fRate].forEach(i => i.addEventListener('change', applyBody));

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
      field('Goal', goalBox),
      field('Rate (kg per week)', fRate,
        'Negative loses, positive gains. Beyond about 0.75 kg a week in either direction the cost lands on muscle.'),

      /* A goal with a deadline is configuration, not a daily reading, so it
         belongs here rather than taking space on a screen you check hourly. */
      goalTile(s, ctx)),

    group(ctx, 'target', 'Targets',
      'Where your maintenance figure comes from.',
      field('Maintenance source', tdeeBox,
        'Best available prefers your own adaptive figure, falls back to Whoop, then the formula.')),

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
                ? `After ${clockText(get().settings.workoutHour)}, Home asks whether you trained. `
                  + 'One tap logs it with the next session in your rotation.'
                : 'Not set. Set the hour you usually finish training and Home will ask, '
                  + 'rather than you having to remember to open the Train tab.')),
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
      'Theme and the glow behind the glass.',
      field('Background', orbPicker(ctx),
        'The glow behind the glass. It tints both themes.'),
      el('div.tile', {},
        el('div.fine', {},
          'Basal is dark only. The light theme was a second palette kept alongside the '
          + 'real one and it never looked like the app — the colours inverted but the '
          + 'corrections that make dark work did not. True black rather than dark grey: '
          + 'on an OLED screen those pixels are genuinely off.'))),

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
