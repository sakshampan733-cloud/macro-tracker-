/*
 * Physical feedback.
 *
 * Two jobs: fire the device's haptic engine where the web is allowed to,
 * and confirm a logged food with a movement rather than a toast you have
 * to read.
 *
 * The honest caveat is that iOS Safari does not implement the Vibration
 * API at all, so on an iPhone the haptic calls here are inert and the
 * visual feedback is doing all the work. That is why the press states in
 * app.css matter more than this file does.
 */

const canVibrate = typeof navigator !== 'undefined'
  && typeof navigator.vibrate === 'function';

const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Durations chosen to be felt, not heard: past about 25 ms a phone buzzes
   audibly, which reads as a notification rather than a button. */
const PATTERNS = {
  tap:     12,
  select:  18,
  success: [14, 40, 22],
  warn:    [26, 60, 26],
};

export function haptic(kind = 'tap') {
  if (!canVibrate || reduced()) return false;
  try { return navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tap); }
  catch { return false; }
}

export const hapticsAvailable = canVibrate;

/*
 * Fly a logged food into the readout.
 *
 * The confirmation people actually trust is seeing the thing they tapped
 * arrive somewhere. This clones the tapped element, animates the clone to
 * the totals, and pulses the target — so the number that changed is the
 * one your eye is already following.
 */
export function flyToTotals(fromEl, targetSelector = '.readout-block, .sticky-glass') {
  if (!fromEl || reduced()) return;
  const target = document.querySelector(targetSelector);
  if (!target) return;

  const a = fromEl.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  if (!a.width || !b.width) return;

  const ghost = fromEl.cloneNode(true);
  ghost.style.cssText = `
    position: fixed; left: ${a.left}px; top: ${a.top}px;
    width: ${a.width}px; height: ${a.height}px;
    margin: 0; z-index: 70; pointer-events: none;
    transition: transform .52s cubic-bezier(.4,0,.25,1), opacity .52s ease;
    will-change: transform, opacity;`;
  document.body.appendChild(ghost);

  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);

  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(.14)`;
    ghost.style.opacity = '0';
  });

  let cleaned = false;
  const done = () => {
    if (cleaned) return;
    cleaned = true;
    ghost.remove();
    target.classList.add('pulse');
    setTimeout(() => target.classList.remove('pulse'), 460);
  };
  ghost.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 800);          // rAF is throttled in background tabs
}

/*
 * One delegated listener for the whole app.
 *
 * Attaching a handler per control would mean every new button has to
 * remember to opt in; a single pointerdown at the root means anything
 * that looks pressable feels pressable, including things not written yet.
 */
export function installFeedback(root = document) {
  root.addEventListener('pointerdown', e => {
    const hit = e.target.closest(
      'button, .tab, .row, .food-cell, .chip, .tile.tappable, .readout-block, .seg-item');
    if (!hit || hit.disabled) return;
    haptic(hit.matches('.food-cell, .row') ? 'select' : 'tap');
  }, { passive: true });
}
