/*
 * What to trust.
 *
 * An app whose whole claim is that it shows you its error bars owes you the
 * same about itself. This is written in plain words on purpose — no jargon,
 * because a warning you cannot read is not a warning.
 */

import { el, sheet } from '../ui.js';

const SOLID = [
  ['Adding up what you ate',
   'Straight arithmetic on the numbers you gave it. If the numbers going in are right, the total is right.'],
  ['How sure it is about a day',
   'If you weighed most of your food, the total really is close. If you guessed most of it, it really is not. The app is honest about which.'],
  ['Your maintenance calories, after a few weeks',
   'Once you have logged around ten days and weighed yourself a few times, it works out your real number from your own body instead of a formula. This is the most trustworthy thing in the app.'],
  ['Your weight trend',
   'The thick line, not the daily number. Day-to-day weight swings by up to a kilo on water alone. The trend is the real signal.'],
  ['Protein target',
   'Roughly 2 grams per kilo of bodyweight while losing fat is one of the better-supported findings in nutrition research.'],
  ['Where your Whoop numbers sit',
   'Comparing today against your own past readings. That is just sorting your own data, and it is solid.'],
];

const SHAKY = [
  ['Your starting calorie target',
   'It comes from an equation built on population averages. For any one person it is commonly 10–15% off. Treat the first two or three weeks as the app finding its feet.'],
  ['The exact ± percentages',
   'That a weighed food is more accurate than a guessed one is obviously true. The precise figures — 2%, 5%, 12%, 25% — are my judgement, not measurements from a study.'],
  ['The food database numbers',
   'Reference values for a typical version of each food. Your roti is not the reference roti. Good enough for most things, not a laboratory result.'],
  ['Home dish calorie estimates',
   'A sensible range for that style of cooking. It is a range for a reason. Use the Pot to make one exact.'],
  ['Food versus recovery patterns',
   'It compares ten different things at once against how you slept. Compare ten things and one will look important by accident. Treat anything it finds as worth testing, never as proven.'],
  ['Meal timings',
   'How the day is split across meals is a sensible convention, not a finding. Total protein over the day matters much more than when you eat it.'],
];

const NEVER = [
  ['It knows nothing about your health',
   'No blood tests, no thyroid, no blood sugar, no medication, no injuries. It cannot see any of it, and it will never warn you about something it cannot see.'],
  ['It is not medical advice',
   'It was built by an AI for one person. It has not been reviewed by a doctor, a dietitian, or anybody else.'],
  ['It cannot tell if you are unwell',
   'If you feel exhausted, keep getting ill, stop sleeping, or lose your appetite, the app will carry on showing tidy numbers. Your body is the better instrument. Believe it over this.'],
  ['It does not know if losing weight is right for you',
   'It will happily aim at whatever you select. Whether you should is a question for a person, not a program.'],
];

const row = ([title, body]) =>
  el('div', { style: { padding: '12px 0', borderBottom: '1px solid var(--line)' } },
    el('div', { style: { fontSize: '14.5px', fontWeight: '500', marginBottom: '4px' } }, title),
    el('div.fine', {}, body));

export function openTrust() {
  return sheet({
    title: 'What to trust',
    body: el('div', {},
      el('p', { style: { color: 'var(--text-2)', lineHeight: '1.55', marginTop: 0 } },
        'This app tells you how sure it is about your food. It should do the same about itself.'),

      el('div.section-label', {}, el('span.micro', { style: { color: 'var(--good)' } }, 'Trust this')),
      ...SOLID.map(row),

      el('div.section-label', {}, el('span.micro', { style: { color: 'var(--caution)' } }, 'Take with salt')),
      ...SHAKY.map(row),

      el('div.section-label', {}, el('span.micro', { style: { color: 'var(--warn)' } }, 'Never rely on this for')),
      ...NEVER.map(row),

      el('div.note.info', { style: { marginTop: '18px' } },
        el('div.fine', {},
          'The short version: it is good at measuring what you ate and honest about how well it knows. '
          + 'It is much weaker at telling you what you should eat. '
          + 'If the screen and your body disagree over a few weeks, your body is right.')),
    ),
  });
}
