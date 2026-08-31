/*
 * Supplement log.
 *
 * Two screens' worth of idea in one: pick the handful you actually take,
 * then tick them off each day. Anything ticked feeds its micronutrients
 * into the day's totals, so the vitamin D screen stops nagging about a
 * deficit you closed at breakfast.
 */

import { el, sheet, toast, icon, g, replaceKids, live } from '../ui.js';
import {
  get, commit, dayKey, suppsTaken, toggleSupplement, setSupplementList, peekDay,
  subscribe,
} from '../store.js';
import { SUPPLEMENTS, SUPPLEMENT_TAGS } from '../data/supplements.js';
import {
  caffeineDay, stillInYouAt, latestHourFor, remainingAt, DAILY_CEILING_MG, hourText,
} from '../data/caffeine.js';
import { sleepSchedule } from './sleep.js';
import { NUTRIENTS } from '../data/nutrients.js';

/* ── Caffeine ───────────────────────────────────────────────────────── */

/*
 * Caffeine belongs here even though most of it arrives as food.
 *
 * The complaint that produced this tile was exact: "I drink coffee, that
 * might go under supplements — but I log a coffee as a food, because I'm
 * having coffee as a food." Both are true, and the app was making the
 * person choose. So the coffee stays logged as a drink with its calories,
 * and its caffeine surfaces here, next to the pre-workout, because the
 * ceiling and the bedtime question apply to the sum.
 */
/*
 * The day's caffeine, from every source at once.
 *
 * Shared so the ceiling row and the caffeine tile can never disagree —
 * two places computing the same total independently is how they drift.
 */
export function dayCaffeineMg(s, key) {
  const entries = peekDay(key).entries || [];
  const fromFood = caffeineDay(entries).total;
  const fromSupps = (suppsTaken(key) || []).reduce(
    (a, id) => a + (SUPPLEMENTS[id]?.caffeine || s.supplementsCustom?.[id]?.caffeine || 0), 0);
  return fromFood + fromSupps;
}

export function caffeineTile(s, key, now = new Date()) {
  return live(() => buildCaffeine(get(), key, now) || el('div'),
              { subscribe, on: ['entry:add', 'entry:update', 'entry:remove', 'supplements', 'settings'] });
}

function buildCaffeine(s, key, now = new Date()) {
  const { total, items } = caffeineSources(s, key);
  if (total < 5) return null;

  const bedHour = bedHourFor(s, now);
  const atBed = bedHour == null ? null : stillInYouAt(items, bedHour, now);
  const over = total > DAILY_CEILING_MG;

  /*
   * One line, and it has to be about sleep rather than about a number.
   * The old version said a coffee after three "is the one that reaches
   * it", which meant nothing — "it" was an internal 50 mg threshold, and
   * nobody has a caffeine target to reach. What people want to know is
   * whether tonight is affected and when to stop tomorrow.
   */
  let line, tone = '';
  if (bedHour == null) {
    line = 'Set a sleep goal and this can tell you which of these is still in you at bedtime.';
  } else if (atBed >= 100) {
    line = `About ${Math.round(atBed)} mg still in you at ${hourText(bedHour)}. That much `
         + 'usually costs you deep sleep even if you fall asleep fine.';
    tone = 'is-warn';
  } else if (atBed >= 50) {
    line = `About ${Math.round(atBed)} mg still in you at ${hourText(bedHour)} — enough to `
         + 'make falling asleep slower than usual.';
    tone = 'is-warn';
  } else {
    const cut = lastCallFor(150, bedHour);
    line = `Clear by bedtime. A large coffee is fine up to about ${hourText(cut)}.`;
    tone = 'is-good';
  }

  return el('div.tile.tappable.caff-card', {
    role: 'button', tabIndex: '0',
    'aria-label': `Caffeine, ${Math.round(total)} milligrams today. Open for detail.`,
    onclick: () => openCaffeine(key),
    onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCaffeine(key); } },
  },
    el('div.between', {},
      el('div.flex', { style: { gap: '7px' } },
        icon('bolt', 15), el('h3', {}, 'Caffeine')),
      el('div.flex', { style: { gap: '8px' } },
        el('span.num', { style: { color: over ? 'var(--caution)' : 'var(--text)' } },
          `${Math.round(total)} mg`),
        icon('chevron', 13))),

    el('div.caff-bar', { style: { marginTop: '10px' } },
      el('div.caff-fill' + (over ? '.is-over' : ''), {
        style: { width: Math.min(100, (total / DAILY_CEILING_MG) * 100) + '%' } })),

    el('div.fine.' + (tone || 'is-plain'), { style: { marginTop: '9px' } }, line));
}

/*
 * Everything caffeinated today, from both halves of the app.
 */
export function caffeineSources(s, key) {
  const entries = peekDay(key).entries || [];
  const { total, items } = caffeineDay(entries);
  let all = total;
  for (const id of suppsTaken(key) || []) {
    const mg = SUPPLEMENTS[id]?.caffeine || s.supplementsCustom?.[id]?.caffeine || 0;
    if (!mg) continue;
    items.push({ name: SUPPLEMENTS[id]?.label || s.supplementsCustom?.[id]?.label || 'Supplement',
                 mg, at: null });
    all += mg;
  }
  return { total: all, items };
}

/*
 * The last hour you can have a given dose and still be under 50 mg by
 * bedtime — 50 mg being roughly the point below which caffeine stops
 * measurably delaying sleep onset for most people.
 */
function lastCallFor(mg, bedHour) {
  const h = latestHourFor(mg, bedHour);
  return h == null ? bedHour : h;
}

/* ── The detail sheet ───────────────────────────────────────────────── */

export function openCaffeine(key, now = new Date()) {
  const s = get();
  const { total, items } = caffeineSources(s, key);
  const bedHour = bedHourFor(s, now);
  const atBed = bedHour == null ? null : stillInYouAt(items, bedHour, now);

  const timeOf = at => {
    if (!at) return 'no time recorded';
    const d = new Date(at);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const rows = [...items].sort((a, b) => (b.at || 0) - (a.at || 0)).map(it => {
    const left = bedHour == null || !it.at ? null
      : remainingAt(it.mg, ((bedHour - (new Date(it.at).getHours()
          + new Date(it.at).getMinutes() / 60)) + 24) % 24);
    return el('div.caff-row', {},
      el('span.grow', {},
        el('div', {}, it.name),
        el('div.micro', {}, timeOf(it.at)
          + (left != null && left >= 10 ? ` · ${Math.round(left)} mg left at bedtime` : ''))),
      el('span.num', {}, Math.round(it.mg) + ' mg'));
  });

  /* Last call, per kind of drink, because the dose differs enormously. */
  const cutoffs = bedHour == null ? [] : [
    ['Espresso or small coffee', 80],
    ['Large coffee or cold brew', 150],
    ['Energy drink (500 ml can)', 160],
    ['Pre-workout scoop', 200],
  ].map(([label, mg]) => el('div.caff-row', {},
    el('span.grow', {}, label),
    el('span.num', {}, 'by ' + hourText(latestHourFor(mg, bedHour) ?? bedHour))));

  const body = el('div', {},
    el('div.tile.tile-hero', {},
      el('div.readout', {},
        el('div', {},
          el('div.micro', {}, 'Today'),
          el('div.readout-main', { style: { fontSize: '34px' } }, Math.round(total),
            el('span', { style: { fontSize: '15px' } }, ' mg'))),
        atBed != null ? el('div.readout-side', {},
          el('div.micro', {}, 'Still in you at bedtime'),
          el('div.v', { style: { color: atBed >= 50 ? 'var(--caution)' : 'var(--good-ink)' } },
            `${Math.round(atBed)} mg`)) : null)),

    el('div.section-label', {}, el('span.micro', {}, 'Where it came from')),
    el('div.tile', {}, ...rows),

    cutoffs.length ? el('div', {},
      el('div.section-label', {}, el('span.micro', {}, `Last call, for a ${hourText(bedHour)} bedtime`)),
      el('div.tile', {}, ...cutoffs),
      el('div.fine', { style: { marginTop: '9px' } },
        'Have it after these times and a meaningful amount is still circulating when '
        + 'you lie down. It rarely stops you falling asleep — what it does is flatten '
        + 'the deep sleep in the first half of the night, which is the part you feel '
        + 'the loss of the next day.')) : null,

    el('div.section-label', {}, el('span.micro', {}, 'How this is worked out')),
    el('div.tile', {},
      el('div.fine', { style: { lineHeight: '1.6' } },
        'Caffeine halves roughly every five hours, so a 160 mg can at 15:00 is still '
        + 'about 80 mg at 20:00 and 40 mg at 01:00. Each drink is decayed from the time '
        + 'you logged it, which is why the hour matters more than the amount.'),
      el('div.fine', { style: { marginTop: '10px', lineHeight: '1.6' } },
        `The ${DAILY_CEILING_MG} mg line is the daily figure health authorities converge `
        + 'on for adults. It is a ceiling, not a target — there is nothing to aim for here.'),
      el('div.fine', { style: { marginTop: '10px', lineHeight: '1.6' } },
        'Five hours is an average. It runs longer on hormonal contraceptives and in '
        + 'pregnancy, and shorter in smokers, so treat these times as a guide to your '
        + 'own pattern rather than a rule.')));

  return sheet({ title: 'Caffeine', body });
}

/*
 * Your typical bed hour, from the same sleep history the coach uses:
 * wake time minus how long you usually sleep. Without a band there is no
 * honest answer, and the tile simply drops the sleep line.
 */
function bedHourFor(s, now) {
  const rows = Object.entries(s.whoop?.rows || {}).sort().slice(-14).map(e => e[1]);
  const wakes = rows.map(r => r?.wakeHour).filter(v => v != null);
  const sleeps = rows.map(r => r?.sleepH).filter(v => v != null);
  if (wakes.length && sleeps.length) {
    const wake = wakes.reduce((a, b) => a + b, 0) / wakes.length;
    const slept = sleeps.reduce((a, b) => a + b, 0) / sleeps.length;
    return (wake + 24 - slept) % 24;
  }
  /* No band: the schedule you set by hand answers the same question. */
  return sleepSchedule()?.bed ?? null;
}

/* ── The daily tile ─────────────────────────────────────────────────── */

export function supplementsTile(s, key, ctx) {
  /* Folding the list open, and ticking a supplement off, both used to
     rebuild the whole screen. Neither needs to: this tile redraws itself,
     and the store event carries the change to anything else that cares. */
  return live(paint => buildSupplements(get(), key, ctx, paint),
              { subscribe, on: ['supplements', 'settings'] });
}

function buildSupplements(s, key, ctx, repaint) {
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
    onclick: () => { commit(st => { st.settings.suppsOpen = !open; }, 'settings'); repaint(); },
  },
    el('div.between', {},
      el('div.flex', {},
        el('h3', {}, 'Supplements'),
        el('span.micro', { style: { marginLeft: '8px' } }, open ? '▾' : '▸')),
      el('span.num', {
        style: { fontSize: '13px', color: all ? 'var(--good-ink)' : 'var(--muted)' },
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
          onclick: () => { toggleSupplement(key, id); repaint(); },
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
    replaceKids(body, 
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
                return el('div.supp-row' + (on ? '.is-on' : ''), {},
                  el('button.grow.supp-pick', {
                    onclick: () => {
                      chosen = on ? chosen.filter(x => x !== id) : [...chosen, id];
                      setSupplementList(chosen);
                      render();
                    },
                  },
                    el('div.title', {}, (on ? '\u2713 ' : '') + sup.label),
                    el('div.sub', {}, [sup.dose, gives].filter(Boolean).join(' \u00b7 ') || '\u2014'),
                    sup.note ? el('div.fine', { style: { marginTop: '3px' } }, sup.note) : null),
                  /* How to take it is the question people actually have, and
                     it was sitting in the data with nowhere to appear. */
                  sup.how ? el('button.supp-info', {
                    'aria-label': `How to take ${sup.label}`,
                    onclick: e => { e.stopPropagation(); openSupplementGuide(id, sup); },
                  }, icon('info', 15)) : null,
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

/*
 * What the coach says about caffeine.
 *
 * Home carries no caffeine widget on purpose — nobody opens a food app to
 * watch a caffeine bar. What they want is to be told, once, when it
 * actually matters: when a drink they just had is going to reach bedtime,
 * or when the day has run past the ceiling. Everything else lives in
 * Detail for anyone who goes looking.
 */
export function caffeineNote(key, now = new Date()) {
  const s = get();
  const { total, items } = caffeineSources(s, key);
  if (total < 5) return null;

  const bedHour = bedHourFor(s, now);
  const hour = now.getHours() + now.getMinutes() / 60;

  if (bedHour != null) {
    const atBed = stillInYouAt(items, bedHour, now);
    const toBed = ((bedHour - hour) + 24) % 24;

    /* Only worth saying while the night is still ahead of you. */
    if (atBed >= 60 && toBed > 0.5 && toBed < 14) {
      return {
        urgency: 55, tone: 'warn', source: 'caffeine',
        headline: `${Math.round(atBed)} mg still in you at bedtime`,
        body: `You are on ${Math.round(total)} mg today, and about ${Math.round(atBed)} mg of `
            + `it is still circulating at ${hourText(bedHour)}. It will not stop you falling `
            + 'asleep — it flattens the deep sleep in the first half of the night. Nothing to '
            + 'do about today; worth knowing for tomorrow.',
      };
    }
  }

  if (total > DAILY_CEILING_MG) {
    return {
      urgency: 45, tone: 'warn', source: 'caffeine',
      headline: `${Math.round(total)} mg of caffeine today`,
      body: `Past the ${DAILY_CEILING_MG} mg a day most guidance settles on for adults. `
          + 'Open Detail to see which drinks it came from.',
    };
  }

  /* The useful, quiet version: you still have room, and here is until when. */
  if (bedHour != null) {
    const cut = latestHourFor(150, bedHour);
    const toCut = cut == null ? null : ((cut - hour) + 24) % 24;
    if (toCut != null && toCut > 0 && toCut < 1.5) {
      return {
        urgency: 40, tone: 'good', source: 'caffeine',
        headline: `Last call for coffee, about ${hourText(cut)}`,
        body: 'A large coffee after that is still with you at bedtime. A small one, or '
            + 'anything decaf, is fine later.',
      };
    }
  }
  return null;
}

/*
 * How to take one supplement.
 *
 * Half of these have a rule that decides whether they work at all — iron
 * with tea, calcium above 500 mg, D3 without fat — and the app knew every
 * one of them while showing none. A tick list that tells you what a pill
 * contains but not when to swallow it is answering the easier question.
 */
export function openSupplementGuide(id, sup) {
  const gives = Object.entries(sup.provides || {})
    .map(([k, v]) => el('div.caff-row', {},
      el('span.grow', {}, NUTRIENTS[k]?.label || k),
      el('span.num', {}, `${g(v, NUTRIENTS[k]?.dp ?? 0)}${NUTRIENTS[k]?.unit || ''}`)));

  return sheet({
    title: sup.label,
    body: el('div', {},
      el('div.tile.tile-hero', {},
        el('div.micro', {}, 'Typical dose'),
        el('div.readout-main', { style: { fontSize: '28px' } }, sup.dose || '—')),

      sup.how ? el('div', {},
        el('div.section-label', {}, el('span.micro', {}, 'How to take it')),
        el('div.tile', {}, el('div', { style: { fontSize: '14.5px', lineHeight: '1.5' } }, sup.how))) : null,

      sup.why ? el('div', {},
        el('div.section-label', {}, el('span.micro', {}, 'Why that way')),
        el('div.tile', {}, el('div.fine', { style: { lineHeight: '1.6' } }, sup.why))) : null,

      gives.length ? el('div', {},
        el('div.section-label', {}, el('span.micro', {}, 'What it provides')),
        el('div.tile', {}, ...gives)) : null,

      sup.waterMl ? el('div.note', {}, el('div', {},
        `Raises your water target by ${sup.waterMl} ml a day.`)) : null,

      sup.isFood ? el('div.note.warn', {}, el('div', {},
        el('b', {}, 'Log this as food'),
        el('div.fine', { style: { marginTop: '3px' } },
          'It carries real calories and protein. Ticking it here as well would '
          + 'count it twice.'))) : null,

      el('div.fine', { style: { marginTop: '14px', opacity: '.75' } },
        'General information about the supplement, not advice for your situation. '
        + 'Check with a doctor before starting anything alongside prescribed '
        + 'medication or in pregnancy.')),
  });
}
