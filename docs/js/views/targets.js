/*
 * Your split, set by you.
 *
 * The app picks a sensible protein/carb/fat split from your goal, and for
 * most people that is the end of it. But "most people" is doing a lot of
 * work there. Somebody chasing the fastest possible loss picks the most
 * aggressive goal, and the aggressive goal spends its whole budget on
 * protein and fat and leaves almost nothing for carbs — which is a
 * defensible split on paper and a miserable one to eat, especially for
 * somebody with a lot of weight to lose who has to keep this up for
 * months. The sustainable version of a diet beats the optimal one, because
 * the optimal one gets abandoned in week three.
 *
 * So: three sliders. Drag one and the other two give way, because the
 * calorie total is the constraint that makes a split a split. Type into
 * one instead and nothing moves — a typed number is a decision, and an app
 * that silently rebalances the figures somebody just entered off a plan
 * has thrown away the reason they opened the screen.
 *
 * Typed numbers are allowed not to add up. The app says by how much, says
 * once what it would suggest instead, and then gets out of the way. It
 * warns; it does not refuse. Refusing would be pretending this is the
 * app's decision, and it is not.
 */

import { el, sheet, toast, explain, append, kcal as kcalFmt } from '../ui.js';
import { get, commit } from '../store.js';
import { recommendedTargets, bestTDEE, safeFloor, macroTargets } from '../nutrition.js';

/* 4 kcal a gram for protein and carbohydrate, 9 for fat. */
const KCAL = { p: 4, c: 4, f: 9 };
const NAMES = { p: 'Protein', c: 'Carbs', f: 'Fat' };
const HUES = { p: 'var(--m-p)', c: 'var(--m-c)', f: 'var(--m-f)' };

const energyOf = m => m.p * KCAL.p + m.c * KCAL.c + m.f * KCAL.f;

/*
 * Floors worth defending, and one that is not a floor at all.
 *
 * Protein and fat have real physiological minimums and the app says so.
 * Carbohydrate does not have one — the body can make what little glucose
 * it strictly needs — so a low-carb split is a preference rather than a
 * deficiency, and the app should not imply otherwise. What low carbs *do*
 * cost is training quality and, for most people, the will to keep going,
 * which is a fair thing to mention and an unfair thing to alarm about.
 */
function advice(m, kcalTarget, profile) {
  const w = profile.weightKg || 70;
  const out = [];

  /* Stated in grams, not in g/kg. Rounding "0.475 g/kg" to one decimal
     printed "Fat is 0.5 g per kg. Below about 0.5 g/kg..." — a warning
     that appears to argue with itself at exactly the boundary where it
     matters most. Grams are also the number on the slider. */
  const pFloor = Math.round(w * 1.6);
  if (m.p < pFloor) {
    out.push({ tone: 'warn', text: `Protein at ${Math.round(m.p)} g is under ${pFloor} g. `
      + 'In a deficit that is where the weight you lose starts including muscle rather than '
      + 'just fat — the one thing worth protecting while the rest comes off.' });
  }

  const fFloor = Math.round(w * 0.5);
  if (m.f < fFloor) {
    out.push({ tone: 'warn', text: `Fat at ${Math.round(m.f)} g is under ${fFloor} g. `
      + 'Hormone production and the fat-soluble vitamins both need dietary fat; '
      + `${Math.round(w * 0.6)} g is a more comfortable floor.` });
  }

  const carbKcal = m.c * KCAL.c;
  const carbShare = kcalTarget > 0 ? carbKcal / kcalTarget : 0;
  if (carbShare < 0.15 && m.c < 130) {
    out.push({ tone: 'note', text: `Carbs are ${Math.round(carbShare * 100)}% of your calories. `
      + 'There is no medical minimum for carbohydrate, so this is a preference, not a deficiency — '
      + 'but hard training feels worse on it, and most people find a low-carb diet harder to stay on. '
      + 'Worth choosing on purpose rather than by accident.' });
  }

  return out;
}

export function openTargetEditor(ctx) {
  const s = get();
  const profile = s.profile || {};
  const tdee = bestTDEE(s, profile);
  const rec = recommendedTargets(profile, tdee.kcal);
  const floor = safeFloor(profile);

  const stored = profile.custom || null;
  /* Working copy. Starts from whatever is in force — your split if you have
     one, the recommendation if you do not — so the screen opens showing the
     numbers you are actually eating to. */
  let kcalTarget = Number.isFinite(stored?.kcal) ? stored.kcal : rec.kcal;
  let fixedKcal = Number.isFinite(stored?.kcal);
  let m = (stored && ['p', 'c', 'f'].every(k => Number.isFinite(stored[k])))
    ? { p: stored.p, c: stored.c, f: stored.f }
    : { p: rec.p, c: rec.c, f: rec.f };

  const body = el('div');
  const rows = {};
  let kcalInput, kcalNote, gapBox, adviceBox, foot;

  /*
   * Dragging: the other two give way, in proportion to how much they
   * currently hold.
   *
   * Proportional rather than equal, because taking 40 g off a 300 g carb
   * figure and a 60 g fat figure equally would empty the fat first. This
   * keeps the shape of the split you already have while changing the one
   * thing you grabbed.
   */
  const redistribute = (moved, grams) => {
    const others = ['p', 'c', 'f'].filter(k => k !== moved);
    const budget = kcalTarget - grams * KCAL[moved];
    const held = others.reduce((a, k) => a + m[k] * KCAL[k], 0);

    m[moved] = grams;
    if (budget <= 0) { others.forEach(k => { m[k] = 0; }); return; }
    if (held <= 0) {
      /* Nothing left to scale, so split what is left evenly by energy. */
      others.forEach(k => { m[k] = Math.round((budget / 2) / KCAL[k]); });
      return;
    }
    others.forEach(k => { m[k] = Math.max(0, Math.round((m[k] * KCAL[k]) * (budget / held) / KCAL[k])); });
  };

  const maxFor = k => Math.max(10, Math.ceil((kcalTarget * 1.05) / KCAL[k]));

  const paint = () => {
    for (const k of ['p', 'c', 'f']) {
      const r = rows[k];
      r.range.max = String(maxFor(k));
      if (document.activeElement !== r.range) r.range.value = String(Math.round(m[k]));
      if (document.activeElement !== r.num) r.num.value = String(Math.round(m[k]));
      const e = m[k] * KCAL[k];
      r.kcal.textContent = `${Math.round(e)} kcal`;
      r.pct.textContent = kcalTarget > 0 ? `${Math.round((e / kcalTarget) * 100)}%` : '';
      r.range.style.setProperty('--fill',
        `${Math.min(100, (m[k] / Math.max(1, maxFor(k))) * 100)}%`);
    }

    const total = energyOf(m);
    const gap = Math.round(total - kcalTarget);
    /* replaceChildren stringifies null where the app's own append() drops
       it, which is how the word "null" ended up under "Adds up to". */
    const gapKids = [
      el('div.between', {},
        el('span.micro', {}, 'Adds up to'),
        el('span.num', { style: { fontSize: '16px',
          color: Math.abs(gap) <= 25 ? 'var(--good-ink)' : 'var(--caution)' } },
          `${Math.round(total)} kcal`)),
      Math.abs(gap) > 25
        ? el('div.fine', { style: { marginTop: '4px' } },
            `${gap > 0 ? 'Over' : 'Under'} your ${Math.round(kcalTarget)} by ${Math.abs(gap)}. `
            + (gap > 0
              ? 'Eating to these macros means eating more than your calorie target.'
              : 'Eating to these macros leaves calories unspent.')
            + ' You can leave it — the sliders will square it up if you would rather.')
        : null,
    ].filter(Boolean);
    gapBox.replaceChildren(...gapKids);

    const list = advice(m, kcalTarget, profile);
    adviceBox.replaceChildren(...list.map(a => el('div.tile', {
      style: { borderLeft: `3px solid ${a.tone === 'warn' ? 'var(--caution)' : 'var(--line)'}`,
               marginTop: '8px' },
    }, el('div.fine', {}, a.text))));

    const changed = Math.round(m.p) !== rec.p || Math.round(m.c) !== rec.c
                 || Math.round(m.f) !== rec.f || fixedKcal;
    foot.textContent = changed ? 'Save my split' : 'Save';
  };

  const row = k => {
    const range = el('input.macro-range', {
      type: 'range', min: '0', max: String(maxFor(k)), step: '1',
      value: String(Math.round(m[k])),
      'aria-label': `${NAMES[k]} grams`,
      oninput: e => { redistribute(k, +e.target.value); paint(); },
    });
    range.style.setProperty('--hue', HUES[k]);

    const num = el('input.num-in', {
      type: 'number', inputmode: 'decimal', min: '0', step: '1',
      value: String(Math.round(m[k])),
      'aria-label': `${NAMES[k]} grams, exact`,
      /* Typed values stand. Nothing else moves — see the header. */
      oninput: e => { const v = +e.target.value; if (Number.isFinite(v) && v >= 0) { m[k] = v; paint(); } },
    });

    const kcal = el('span.micro');
    const pct = el('span.micro');

    rows[k] = { range, num, kcal, pct };

    return el('div', { style: { marginTop: '14px' } },
      el('div.between', {},
        el('span', { style: { color: HUES[k], fontWeight: '600', fontSize: '13.5px' } }, NAMES[k]),
        el('span.flex', { style: { gap: '8px', alignItems: 'baseline' } }, pct, kcal)),
      el('div.flex', { style: { gap: '10px', alignItems: 'center', marginTop: '6px' } },
        range,
        el('div.flex', { style: { gap: '4px', alignItems: 'baseline', flex: 'none' } },
          num, el('span.micro', {}, 'g'))));
  };

  /* ── Calories ── */
  kcalInput = el('input.num-in', {
    type: 'number', inputmode: 'numeric', min: '0', step: '10',
    value: String(Math.round(kcalTarget)),
    'aria-label': 'Daily calories',
    oninput: e => {
      const v = +e.target.value;
      if (!Number.isFinite(v) || v <= 0) return;
      kcalTarget = v;
      fixedKcal = Math.round(v) !== rec.kcal;
      paintKcalNote();
      paint();
    },
  });

  kcalNote = el('div.fine', { style: { marginTop: '6px' } });
  const paintKcalNote = () => {
    const bits = [];
    if (!fixedKcal) {
      bits.push(`The app's figure, from ${tdee.source} maintenance of ${kcalFmt(tdee.kcal)} kcal.`);
    } else {
      bits.push(`Fixed at your number. While this is set the daily band adjustment, `
        + `the red-recovery hold and carry-forward all stand down — your number stays your number.`);
      if (kcalTarget < floor.kcal) {
        bits.push(`That is below the floor of ${floor.kcal} kcal this app will point anyone at. `
          + `Very low intakes cost muscle and rebound hard; ${floor.kcal} is not a rule, `
          + `but going under it is worth doing with a doctor rather than an app.`);
      }
    }
    kcalNote.replaceChildren(el('div', {
      style: kcalTarget < floor.kcal && fixedKcal ? { color: 'var(--caution)' } : {},
    }, bits.join(' ')));
  };

  gapBox = el('div.tile', { style: { marginTop: '14px' } });
  adviceBox = el('div');

  const recLine = el('div.fine', { style: { marginTop: '10px' } },
    `Recommended for your goal: ${rec.p} g protein · ${rec.c} g carbs · ${rec.f} g fat `
    + `at ${kcalFmt(rec.kcal)} kcal.`);

  foot = el('button.btn.primary.grow', {
    onclick: () => {
      const custom = {
        kcal: fixedKcal ? Math.round(kcalTarget) : null,
        p: Math.round(m.p), c: Math.round(m.c), f: Math.round(m.f),
      };
      const isRec = !fixedKcal && custom.p === rec.p && custom.c === rec.c && custom.f === rec.f;
      commit(st => {
        st.profile.custom = isRec ? null : custom;
        /* Keep the stored snapshot in step, since screens that predate
           dayTargets still read s.targets. */
        st.targets = macroTargets(st.profile, bestTDEE(st, st.profile).kcal);
      }, 'profile');
      toast(isRec ? 'Back on the recommended split.' : 'Saved. These are your numbers now.');
      sh.close();
      ctx.refresh?.();
    },
  }, 'Save');

  /* The app's append(), not the DOM's — explain() returns null when the
     Reading setting is off, and Element.append stringifies that into a
     literal "null" at the foot of the sheet. */
  append(body,
    el('div.fine', {},
      'Drag a slider and the other two move to keep the total. Type a number and nothing else '
      + 'moves — the app will tell you if it stops adding up, and then leave it to you.'),

    el('div.section-label', { style: { marginTop: '14px' } },
      el('span.micro', {}, 'Daily calories')),
    el('div.flex', { style: { gap: '8px', alignItems: 'center' } },
      kcalInput, el('span.micro', {}, 'kcal')),
    kcalNote,

    el('div.section-label', { style: { marginTop: '16px' } },
      el('span.micro', {}, 'The split')),
    row('p'), row('c'), row('f'),
    gapBox,
    adviceBox,
    recLine,

    explain('Protein and fat have real minimums and the app says so when you cross them. '
      + 'Carbohydrate does not — a low-carb split is a preference, not a deficiency. '
      + 'Nothing here is blocked; the numbers are yours.',
      { style: { marginTop: '12px' } }),
  );

  const sh = sheet({
    title: 'Your targets',
    body,
    foot: el('div.btn-row', {},
      el('button.btn.ghost.grow', {
        onclick: () => {
          kcalTarget = rec.kcal; fixedKcal = false;
          m = { p: rec.p, c: rec.c, f: rec.f };
          kcalInput.value = String(rec.kcal);
          paintKcalNote(); paint();
          toast('Reset to the recommendation. Save to keep it.');
        },
      }, 'Recommended'),
      foot),
  });

  paintKcalNote();
  paint();
  return sh;
}
