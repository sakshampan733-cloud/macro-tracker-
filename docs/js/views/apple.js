/*
 * Setting up Apple Health.
 *
 * The instructions live in the app rather than in a document because the
 * two things every generic guide leaves blank — your relay address and
 * your key — are exactly the two things that have to be right, and the
 * app is the only place that knows them.
 */

import { el, sheet, toast, icon, field, confirmSheet, append } from '../ui.js';
import { get, commit } from '../store.js';
import {
  healthKey, makeHealthKey, forgetHealthKey, pushUrl, syncApple, existingSource,
} from '../applehealth.js';

const copy = async (text, what) => {
  try { await navigator.clipboard.writeText(text); toast(what + ' copied.'); }
  catch { toast('Could not copy — select it by hand.', 'err'); }
};

const codeRow = (label, value) => el('div.code-row', {},
  el('div', { style: { flex: '1', minWidth: '0' } },
    el('div.micro', {}, label),
    el('div.code-val', {}, value)),
  el('button.btn.sm', { onclick: () => copy(value, label) }, 'Copy'));

export function openAppleHealth(ctx) {
  const body = el('div');

  const render = () => {
    const s = get();
    const relay = (s.settings.relayUrl || '').replace(/\/+$/, '');
    const key = healthKey();
    const url = pushUrl(relay);
    const source = existingSource(s);

    const kids = [];

    if (source === 'whoop') {
      kids.push(el('div.note.warn', {}, el('div', {},
        el('b', {}, 'This app already holds Whoop data.'),
        el('div.fine', { style: { marginTop: '4px' } },
          'Whoop reports HRV as RMSSD and Apple reports it as SDNN — different '
          + 'scales for the same measurement. Mixing them would put a step change '
          + 'in your history that the app would read as something happening to you. '
          + 'Clear the Whoop import in Settings first if you are switching.'))));
    }

    if (!relay) {
      kids.push(el('div.note.warn', {}, el('div', {},
        el('b', {}, 'No relay address set.'),
        el('div.fine', { style: { marginTop: '4px' } },
          'Apple Health needs the same relay Whoop uses. Set it up under '
          + 'Settings → Whoop first — the address is all that is needed here, '
          + 'not a Whoop account.'))));
    }

    kids.push(
      el('div.section-label', {}, el('span.micro', {}, 'Step 1 — your key')),
      el('div.tile', {},
        key
          ? el('div', {},
              codeRow('Key', key),
              el('div.fine', { style: { marginTop: '10px' } },
                'Anyone holding this key can read and write the health data you '
                + 'push. It is a random 32 characters and nothing else identifies '
                + 'you, but treat it like a password.'),
              el('button.btn.sm.danger', { style: { marginTop: '10px' },
                onclick: async () => {
                  if (!(await confirmSheet({
                    title: 'Make a new key?',
                    message: 'The Shortcut on your phone will stop working until you '
                           + 'update it with the new key. Data already pushed stays put.',
                    confirmLabel: 'New key', danger: true,
                  }))) return;
                  makeHealthKey(); render();
                } }, 'Replace it'))
          : el('div', {},
              el('div.fine', {}, 'One random string that ties your phone to your app. '
                + 'No account, no sign-in.'),
              el('button.btn.primary.block', { style: { marginTop: '12px' },
                onclick: () => { makeHealthKey(); render(); } }, 'Generate a key'))),
    );

    if (key && url) {
      kids.push(
        el('div.section-label', {}, el('span.micro', {}, 'Step 2 — on your iPhone')),
        el('div.tile', {},
          el('ol.steps', {},
            el('li', {}, 'Open ', el('b', {}, 'Shortcuts'), ' and make a new shortcut.'),
            el('li', {}, 'Add ', el('b', {}, 'Find Health Samples'), '. Set it to ',
              el('b', {}, 'Resting Heart Rate'), ', sorted by ', el('b', {}, 'End Date'),
              ', limit ', el('b', {}, '1'), '.'),
            el('li', {}, 'Repeat that for ', el('b', {}, 'Heart Rate Variability'), ', ',
              el('b', {}, 'Sleep Analysis'), ' and ', el('b', {}, 'Active Energy'), '.'),
            el('li', {}, 'Add ', el('b', {}, 'Get Contents of URL'), ' and set it up as below.'),
            el('li', {}, 'Then ', el('b', {}, 'Automation → Time of Day'),
              ', pick something after you normally wake, and run it daily.')),
          el('div.fine', { style: { marginTop: '10px' } },
            'The Shortcut has to run on the phone, not the watch — the watch syncs '
            + 'to the phone and the phone is where HealthKit actually lives.')),

        el('div.section-label', {}, el('span.micro', {}, 'Step 3 — the request')),
        el('div.tile', {},
          codeRow('URL', url),
          codeRow('Method', 'POST'),
          codeRow('Header', 'x-basal-key: ' + key),
          codeRow('Body type', 'JSON'),
          el('div.fine', { style: { marginTop: '12px', marginBottom: '8px' } },
            'The JSON fields, each set to the matching variable from the steps above. '
            + 'Send only the ones you set up — anything missing is simply not recorded.'),
          codeRow('JSON', '{ "date": "<Current Date, formatted yyyy-MM-dd>", '
            + '"rhr": <Resting Heart Rate>, "hrv": <HRV>, '
            + '"sleepH": <Sleep hours>, "activeKcal": <Active Energy> }')),

        el('div.section-label', {}, el('span.micro', {}, 'Step 4 — bring it in')),
        el('div.tile', {},
          el('div.fine', {}, 'Run the Shortcut once on your phone, then pull it here.'),
          el('button.btn.primary.block', { style: { marginTop: '12px' },
            onclick: async e => {
              const btn = e.currentTarget;
              btn.disabled = true; btn.textContent = 'Checking…';
              const r = await syncApple({});
              btn.disabled = false; btn.textContent = 'Pull from the relay';
              if (!r.ok) { toast(r.error, 'err'); return; }
              if (!r.days) { toast(r.note || 'Nothing there yet.'); return; }
              toast(`${r.days} day${r.days === 1 ? '' : 's'} imported.`);
              ctx.refresh();
            } }, 'Pull from the relay')),
      );
    }

    kids.push(
      el('div.section-label', {}, el('span.micro', {}, 'What Apple can and cannot give')),
      el('div.tile', {},
        el('div.fine', { style: { lineHeight: '1.65' } },
          'Resting heart rate, HRV, sleep and energy burned all come across, and the '
          + 'daily target moves with your energy burn exactly as it does for Whoop.'),
        el('div.fine', { style: { marginTop: '10px', lineHeight: '1.65' } },
          'Recovery and strain do not exist in Apple Health — they are Whoop’s own '
          + 'scores. The coaching that keys on them stays quiet rather than inventing '
          + 'a number, which is the same thing it does when no strap is connected at all.')),
    );

    body.replaceChildren();
    append(body, ...kids);
  };

  render();
  return sheet({ title: 'Apple Health', body });
}
