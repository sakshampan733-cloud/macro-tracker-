/*
 * Setup and settings.
 *
 * Onboarding asks only for what the maths genuinely needs, explains what
 * each answer changes, and then gets out of the way.
 */

import { el, clear, field, segmented, toast, icon, sheet, confirmSheet, kcal, empty } from '../ui.js';
import { get, commit, exportJSON, importJSON, reset, pushBackup } from '../store.js';
import {
  ACTIVITY, GOALS, bmrFor, predictedTDEE, macroTargets, bestTDEE, waterTarget, age,
} from '../nutrition.js';
import { openWhoopImport, openWhoopConnect } from './body.js';
import { openTrust } from './trust.js';
import { VERSION } from '../app.js';

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

  const fHeight = num(draft.heightCm);
  const fWeight = num(draft.weightKg, '0.1');
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
    draft.heightCm = +fHeight.value || 175;
    draft.weightKg = +fWeight.value || 70;
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

  [fHeight, fWeight, fBf, fYear, fName].forEach(i => i.addEventListener('input', update));

  root.append(
    el('div', { style: { padding: '30px 0 18px' } },
      el('div.brand', {}, 'BAS', el('span', {}, 'AL')),
      el('h1', { style: { marginTop: '14px', fontSize: '30px' } }, 'Measure what you eat.'),
      el('p', { style: { color: 'var(--text-2)', lineHeight: '1.55', marginTop: '8px' } },
        'Six answers and you are logging. Every one of them is used in a calculation you can see.')),

    field('Name', fName),
    el('div.field-2', {}, field('Height (cm)', fHeight), field('Weight (kg)', fWeight)),
    el('div.field-2', {}, field('Born', fYear), field('Body fat %', fBf)),
    el('div.field', {}, el('div.help', { style: { marginTop: '-6px' } },
      'Body fat is optional. If you know it, the app uses Katch-McArdle instead of Mifflin-St Jeor, which is more accurate because it works off lean mass.')),

    field('Sex', sexBox, 'Used by the resting-metabolism equation.'),
    field('Training', actBox),
    field('Goal', goalBox),

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

export function renderSettings(root, ctx) {
  const s = get();
  const p = s.profile;
  clear(root);

  const num = (val, step = '1') => el('input.num-in', { type: 'number', inputmode: 'decimal', step, value: String(val ?? '') });

  const fHeight = num(p.heightCm);
  const fWeight = num(p.weightKg, '0.1');
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
  ], s.settings.diet, v => { commit(st => { st.settings.diet = v; }); toast('Suggestions updated.'); }));

  const tdeeBox = el('div');
  tdeeBox.append(segmented([
    { value: 'auto', label: 'Best available' },
    { value: 'adaptive', label: 'Adaptive' },
    { value: 'whoop', label: 'Whoop' },
    { value: 'predicted', label: 'Formula' },
  ], s.settings.tdeeSource, v => { commit(st => { st.settings.tdeeSource = v; }); toast('Target source changed.'); ctx.refresh(); }, { wrap: true }));

  function save(patch) {
    commit(st => { Object.assign(st.profile, patch); }, 'profile');
    ctx.refresh();
  }

  const applyBody = () => {
    save({
      heightCm: +fHeight.value || p.heightCm,
      weightKg: +fWeight.value || p.weightKg,
      bodyFatPct: +fBf.value || 0,
      birthYear: +fYear.value || p.birthYear,
      rate: +fRate.value,
    });
    toast('Saved.');
  };
  [fHeight, fWeight, fBf, fYear, fRate].forEach(i => i.addEventListener('change', applyBody));

  const best = bestTDEE(s, p);
  const targets = macroTargets(p, best.kcal);

  root.append(
    el('h1', { style: { marginBottom: '14px' } }, 'Settings'),

    el('div.tile', {},
      el('div.micro', {}, 'Current target'),
      el('div.readout', { style: { marginTop: '4px' } },
        el('div', {}, el('div.readout-main', { style: { fontSize: '32px' } }, kcal(targets.kcal))),
        el('div.readout-side', {},
          el('div.micro', {}, 'Maintenance · ' + best.source),
          el('div.v', {}, kcal(best.kcal), best.sigma ? ` ±${best.sigma}` : ''))),
      el('div.fine', { style: { marginTop: '8px' } }, best.why || '')),

    el('div.section-label', {}, el('span.micro', {}, 'Body')),
    el('div.field-2', {}, field('Height (cm)', fHeight), field('Weight (kg)', fWeight)),
    el('div.field-2', {}, field('Born', fYear), field('Body fat %', fBf)),
    field('Training', actBox),
    field('Goal', goalBox),
    field('Rate (kg per week)', fRate,
      'Negative loses, positive gains. Beyond about 0.75 kg a week in either direction the cost lands on muscle.'),

    el('div.section-label', {}, el('span.micro', {}, 'How targets are set')),
    field('Maintenance source', tdeeBox,
      'Best available prefers your own adaptive figure, falls back to Whoop, then the formula.'),

    el('div.section-label', {}, el('span.micro', {}, 'Preferences')),
    field('Suggestions', dietBox),
    field('Glass size (ml)', fGlass),
    (() => { fGlass.addEventListener('change', () => { commit(st => { st.settings.glassMl = +fGlass.value || 250; }); ctx.refresh(); }); return null; })(),

    el('div.section-label', {}, el('span.micro', {}, 'Whoop')),
    el('div.tile', {},
      el('div.between', {},
        el('div', {},
          el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Whoop data'),
          el('div.micro', { style: { marginTop: '3px' } },
            Object.keys(s.whoop.rows || {}).length
              ? `${Object.keys(s.whoop.rows).length} days imported`
              : 'Not imported')),
        el('button.btn.sm', { onclick: () => openWhoopConnect(ctx) }, 'Set up'))),

    el('div.section-label', {}, el('span.micro', {}, 'How much to trust this')),
    el('div.tile', {},
      el('div.between', {},
        el('div', {},
          el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'What to trust'),
          el('div.fine', { style: { marginTop: '3px' } },
            'Which parts of this app are solid, which are guesses, and what it cannot see at all.')),
        el('button.btn.sm', { onclick: () => openTrust() }, 'Read'))),

    el('div.section-label', {}, el('span.micro', {}, 'Your data')),
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

    el('div', { style: { height: '20px' } }),
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
