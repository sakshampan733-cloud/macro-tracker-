/*
 * The guide.
 *
 * Everything in this app is discoverable once you know it exists, which
 * is not the same as being discoverable. A new person opening it sees
 * four tabs, a grid of foods and a number — nothing tells them that a
 * meal can be scaled when logged, that holding a food hides it, or why
 * the calorie target has a ± on it.
 *
 * So: shown once on the first run, and available from Settings forever
 * after, because the second time you need an explanation is usually a
 * month later when you finally wonder what a grade C means.
 *
 * Written as short pages rather than one long document. A wall of text
 * shown to someone who wants to log breakfast is a wall they skip.
 */

import { el, sheet, icon, append } from '../ui.js';
import { get, commit } from '../store.js';

const PAGES = [
  {
    title: 'Basal',
    lead: 'A measuring instrument for what you eat.',
    body: [
      'Most trackers give you a number and let you believe it. This one tells you how confident that number actually is, because a weighed 200 g of rice and a guessed bowl of it are not the same measurement even when they read the same.',
      'Everything else follows from that.',
    ],
  },
  {
    title: 'Home',
    lead: 'Where you log, and nothing else.',
    rows: [
      ['scan',  'Scan',  'A packet barcode. Indian products included — it looks them up and remembers them.'],
      ['pot',   'Meal',  'Build something you eat often out of ingredients once. Rice, paneer, oil — saved as one thing.'],
      ['plus',  'Food',  'Type a food in from its label when nothing else has it.'],
      ['bolt',  'Quick', 'Three numbers for a meal you cannot itemise. Graded low, and the day says so.'],
    ],
    body: [
      'Under those: search, then a grid of what you actually eat — favourites, most eaten, recent. Tap to log. Press and hold any of them to favourite it, hide it, or delete it.',
      'The three cups at the top move as you log. Tap them for the full breakdown.',
    ],
  },
  {
    title: 'Meals',
    lead: 'Build once, eat often.',
    body: [
      'Tap a saved meal and it opens rather than logging straight away — because you rarely eat exactly the portion you saved.',
      'Scale the whole plate by half or double, or change one ingredient on its own if you took more rice than usual. Pick the sitting, and the day, so you can log something you forgot on Tuesday.',
      'In the log it stays one line. Tap it to see what went in.',
    ],
  },
  {
    title: 'Detail',
    lead: 'The same day, with everything on it.',
    body: [
      'Protein split into complete and incomplete, and what each food contributed. Carbohydrate by type. Three kinds of fat. Micronutrients, water, supplements.',
      'Scanned foods get this too — the class is inferred from the label and marked as inferred, so you can tell a measurement from a good guess.',
    ],
  },
  {
    title: 'Body',
    lead: 'What your body is doing about it.',
    body: [
      'Weight with a trend line — the thin one is the scale, the thick one is what actually matters, because daily weight swings a kilo on water alone.',
      'Whoop lives here: recovery, sleep, strain, resting heart rate. Tap any panel to open it.',
      'Whoop also changes your daily target. Not by trusting its calorie figure, which runs high, but by comparing today against your own 28-day average. On a hard day Home tells you so, and what to eat.',
    ],
  },
  {
    title: 'The ± sign',
    lead: 'Why nothing here is a round number.',
    body: [
      'Every entry carries a method — weighed, from a label, a portion, an estimate — and each has a different error. Those combine across the day in quadrature, which is why the total says 1,840 ± 90 rather than 1,840.',
      'Foods carry a grade from A to D for how well the underlying data is known. A day built from scanned labels is tighter than one built from guesses, and the app will not pretend otherwise.',
    ],
  },
  {
    title: 'Getting around',
    lead: 'Two things worth knowing.',
    body: [
      'Swipe left and right anywhere to move between the four tabs.',
      'Settings holds your body figures, goal, targets, Whoop setup, appearance, and your data — including a backup you should take occasionally, because everything lives in this browser and clearing Safari would take it with it.',
      'This guide is in there too, whenever you want it again.',
    ],
  },
];

export function openGuide({ onDone = () => {} } = {}) {
  let i = 0;

  const dots = el('div.guide-dots');
  const body = el('div.guide-body');
  const back = el('button.btn.ghost', { onclick: () => go(i - 1) }, 'Back');
  const next = el('button.btn.primary.grow', { onclick: () => {
    if (i < PAGES.length - 1) go(i + 1);
    else {
      commit(s => { s.settings.guideSeen = true; }, 'settings');
      sh.close();
      onDone();
    }
  } }, 'Next');

  function go(n) {
    i = Math.max(0, Math.min(PAGES.length - 1, n));
    const p = PAGES[i];

    const kids = [
      el('div.guide-step', {}, `${i + 1} of ${PAGES.length}`),
      el('h2.guide-title', {}, p.title),
      el('div.guide-lead', {}, p.lead),
    ];

    if (p.rows) {
      const list = el('div.guide-rows');
      for (const [ic, name, text] of p.rows) {
        list.append(el('div.guide-row', {},
          el('span.guide-ic', {}, icon(ic, 18)),
          el('div', {},
            el('div.guide-row-name', {}, name),
            el('div.guide-row-text', {}, text))));
      }
      kids.push(list);
    }

    for (const para of p.body) kids.push(el('p.guide-para', {}, para));

    body.replaceChildren();
    append(body, ...kids);

    dots.replaceChildren();
    for (let d = 0; d < PAGES.length; d++) {
      dots.append(el('i' + (d === i ? '.is-on' : ''), {
        onclick: () => go(d), role: 'button', 'aria-label': `Page ${d + 1}`,
      }));
    }

    back.style.visibility = i === 0 ? 'hidden' : 'visible';
    next.textContent = i === PAGES.length - 1 ? 'Start using it' : 'Next';
  }

  go(0);

  const sh = sheet({
    title: 'How this works',
    body: el('div', {}, body, dots),
    foot: el('div.btn-row', {}, back, next),
    onClose: () => {
      /* Dismissing counts as seen — nobody wants this reappearing every
         launch because they swiped it away once. */
      commit(s => { s.settings.guideSeen = true; }, 'settings');
      onDone();
    },
  });
  return sh;
}

/* Shown once, after onboarding, before the first log. */
export function maybeShowGuide() {
  const s = get();
  if (!s.profile?.done) return false;     // still onboarding
  if (s.settings?.guideSeen) return false;
  setTimeout(() => openGuide(), 450);     // let the first screen paint first
  return true;
}
