/*
 * Pull down to refresh.
 *
 * Two problems, one gesture.
 *
 * The first is stale band data: Whoop syncs on its own schedule and there
 * was no way to say "go and look now" short of digging into Body and
 * finding a button. Every other app on the phone answers that with a pull.
 *
 * The second is worse and less obvious. This is a service-worker app, so a
 * new version sits and waits for every tab to close before it takes over —
 * which on a phone can be days, because a PWA on the home screen is rarely
 * closed. That is the "sometimes I have to close and reopen it" problem.
 * A pull now asks the worker to check for an update, and if one is waiting
 * it is told to take over and the page reloads onto it.
 *
 * The gesture only arms at the very top of the scroller, and only claims a
 * drag that is clearly vertical, so it never fights the horizontal swipe
 * between tabs.
 */

import { el } from './ui.js';
import { haptic } from './feedback.js';

const THRESHOLD = 72;        /* how far to pull before it will fire */
const MAX = 110;             /* how far the indicator can travel */

export function installPullToRefresh(scroller, onRefresh) {
  if (!scroller) return () => {};

  const spinner = el('div.ptr', {},
    el('div.ptr-ring', {}, el('div.ptr-arc')));
  scroller.parentElement.insertBefore(spinner, scroller);

  let startY = null;
  let pull = 0;
  let armed = false;        /* the gesture has been claimed as vertical */
  let busy = false;

  const setPull = (px) => {
    pull = px;
    const t = Math.min(px, MAX);
    spinner.style.transform = `translateY(${t}px)`;
    spinner.style.opacity = String(Math.min(1, px / (THRESHOLD * 0.6)));
    /* The ring fills as you approach the threshold, so the gesture tells
       you when it is going to work rather than making you guess. */
    spinner.style.setProperty('--turn', String(Math.min(1, px / THRESHOLD)));
    spinner.classList.toggle('is-ready', px >= THRESHOLD);
  };

  const reset = (animate = true) => {
    spinner.style.transition = animate ? 'transform .25s ease, opacity .25s ease' : 'none';
    setPull(0);
    spinner.classList.remove('is-ready', 'is-busy');
    setTimeout(() => { spinner.style.transition = ''; }, animate ? 260 : 0);
  };

  scroller.addEventListener('touchstart', (e) => {
    if (busy || e.touches.length !== 1) return;
    /* Only from a resting position at the very top. Mid-scroll pulls are
       the browser's own overscroll and not ours to take. */
    if (scroller.scrollTop > 0) { startY = null; return; }
    startY = e.touches[0].clientY;
    pull = 0;
    armed = false;
  }, { passive: true });

  scroller.addEventListener('touchmove', (e) => {
    if (startY == null || busy) return;
    const dy = e.touches[0].clientY - startY;

    if (!armed) {
      /* Claim it only once it is clearly a downward pull. Anything else —
         a sideways swipe between tabs, a diagonal — is left alone. */
      if (dy > 8) { armed = true; spinner.style.transition = 'none'; }
      else return;
    }
    if (dy <= 0 || scroller.scrollTop > 0) { reset(); startY = null; return; }

    /* Resistance: the further you pull the less it moves, which is what
       makes the gesture feel attached to something. */
    setPull(dy * 0.45);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  const release = async () => {
    if (startY == null || busy) { startY = null; return; }
    const fire = pull >= THRESHOLD;
    startY = null;
    armed = false;

    if (!fire) { reset(); return; }

    busy = true;
    haptic('tap');
    spinner.classList.add('is-busy');
    spinner.style.transition = 'transform .2s ease';
    spinner.style.transform = `translateY(${THRESHOLD}px)`;

    try { await onRefresh(); }
    catch { /* a refresh that fails should still let go of the spinner */ }

    busy = false;
    reset();
  };

  scroller.addEventListener('touchend', release, { passive: true });
  scroller.addEventListener('touchcancel', () => { startY = null; reset(); }, { passive: true });

  return () => { spinner.remove(); };
}

/*
 * What a refresh actually does.
 *
 * Ordered so the slow network calls happen while the spinner is up, and
 * the redraw happens last with whatever arrived.
 */
export async function refreshEverything({ redraw }) {
  const jobs = [];

  /* 1 — a newer version of the app, if the worker has one waiting. */
  jobs.push((async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) return false;
      await reg.update();
      const waiting = reg.waiting;
      if (waiting) {
        /* Tell it to stop waiting, then reload onto it once it is in
           charge. Without the controllerchange listener the reload can
           land back on the old worker. */
        await new Promise((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
          /* The worker listens for this exact string — see sw.js. */
          waiting.postMessage('skip-waiting');
          setTimeout(resolve, 1500);
        });
        location.reload();
        return true;
      }
    } catch { /* no worker, or offline — neither is worth a message */ }
    return false;
  })());

  /* 2 — the band, whichever one is connected. */
  jobs.push((async () => {
    try {
      const { isConnected, syncWhoop } = await import('./whooprelay.js');
      if (isConnected()) await syncWhoop({ days: 14 });
    } catch { /* offline, or not connected */ }
  })());

  jobs.push((async () => {
    try {
      const { healthKey, syncApple } = await import('./applehealth.js');
      if (healthKey()) await syncApple({});
    } catch { /* likewise */ }
  })());

  await Promise.all(jobs);
  redraw?.();
}
