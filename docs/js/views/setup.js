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
import { ORBS, applyOrb } from '../theme.js';
import { goalTile } from './goal.js';
import { openGuide } from './guide.js';
import { openAppleHealth } from './apple.js';
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

/* Six hues, shown as what they are rather than named in a dropdown —
   you are picking a colour, so the control should be the colour. */
function orbPicker(ctx) {
  const row = el('div.orb-row');
  const current = get().settings.orb || 'red';
  for (const [key, o] of Object.entries(ORBS)) {
    const dot = el('button.orb-dot' + (key === current ? '.is-on' : ''), {
      type: 'button', title: o.label, 'aria-label': o.label,
      'aria-pressed': String(key === current),
      style: { '--swatch': `rgb(${o.dark})` },
      onclick: () => {
        commit(st => { st.settings.orb = key; }, 'settings');
        applyOrb(key, get().settings.theme || 'dark');
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
      el('div.field-2', {}, field('Height (cm)', fHeight), field('Weight (kg)', fWeight)),
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
      field('Suggestions', dietBox),
      field('Glass size (ml)', fGlass)),

    group(ctx, 'whoop', 'Whoop',
      'Whoop, or Apple Health from an iPhone.',
      el('div.tile', {},
        el('div.between', {},
          el('div', { style: { flex: '1', paddingRight: '12px' } },
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Apple Health'),
            el('div.fine', { style: { marginTop: '3px' } },
              'For an Apple Watch instead of a Whoop. Apple has no web API, so your '
              + 'phone pushes the data on a schedule.')),
          el('button.btn.sm', { onclick: () => openAppleHealth(ctx) }, 'Set up'))),
      el('div.tile', {},
        el('div.between', {},
          el('div', {},
            el('div', { style: { fontSize: '14px', fontWeight: '500' } }, 'Whoop data'),
            el('div.micro', { style: { marginTop: '3px' } },
              Object.keys(s.whoop.rows || {}).length
                ? `${Object.keys(s.whoop.rows).length} days imported`
                : 'Not imported')),
          el('button.btn.sm', { onclick: () => openWhoopConnect(ctx) }, 'Set up')))),

    group(ctx, 'look', 'Appearance',
      'Theme and the glow behind the glass.',
      field('Background', orbPicker(ctx),
        'The glow behind the glass. It tints both themes.'),
      el('div.tile', {},
        el('div.theme-row', {},
          ...[
            ['dark',  'Dark',   'dark'],
            ['light', 'Light',  'light'],
            ['auto',  'System', 'auto'],
          ].map(([value, label, swatch]) => el('button.theme-opt', {
            type: 'button',
            'aria-pressed': String((s.settings.theme || 'dark') === value),
            onclick: () => {
              commit(st => { st.settings.theme = value; });
              ctx.refresh();
            },
          },
            el('div', { class: 'theme-swatch ' + swatch }),
            el('span.micro', {}, label)))),
        el('div.fine', { style: { marginTop: '10px' } },
          'Dark is true black rather than dark grey — on an OLED screen those pixels are genuinely off, '
          + 'which saves power and lets the cards read as objects floating in nothing.'))),

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
                  st.settings.isDemo = true;
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
