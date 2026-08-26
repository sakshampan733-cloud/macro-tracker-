/*
 * Swiping between tabs.
 *
 * The first version was stiff for three reasons, all fixed here.
 *
 * 1. touchmove was passive, so it could not call preventDefault. The
 *    browser kept scrolling vertically underneath a horizontal drag,
 *    which is why the page wandered up and down while you swiped. Once
 *    the gesture claims the horizontal axis it now cancels the scroll
 *    outright.
 *
 * 2. It only asked "did you move far enough". A flick is fast and short,
 *    so it failed that test constantly and sprang back. Velocity is now
 *    counted alongside distance: a quick flick commits at a fraction of
 *    the distance a slow drag needs.
 *
 * 3. Committing meant animating out, waiting, swapping, animating in —
 *    two animations and a timer, which reads as lag. The swap now happens
 *    at the moment the outgoing screen clears, in one continuous motion.
 */

const COMMIT_FRACTION = 0.16;   // slow drag: this share of the width
const FLICK_VELOCITY  = 0.45;   // px/ms — a flick commits regardless
const SLOP            = 6;      // px before the axis is decided
const VERTICAL_RATIO  = 1.0;    // dy must beat dx outright to be a scroll

export function installSwipe({ surface, order, current, go }) {
  let startX = 0, startY = 0, lastX = 0, lastT = 0, dx = 0, vx = 0;
  let axis = null, active = false, width = 1;

  const at = () => order.indexOf(current());
  const canGo = d => { const i = at(); return i >= 0 && i + d >= 0 && i + d < order.length; };

  const shift = (px, ms) => {
    surface.style.transition = ms ? `transform ${ms}ms cubic-bezier(.22,.9,.28,1)` : 'none';
    surface.style.transform = px ? `translate3d(${px}px,0,0)` : 'translate3d(0,0,0)';
  };
  const glass = on => document.documentElement.classList.toggle('swiping', on);

  const reset = () => {
    active = false; axis = null; dx = 0; vx = 0;
    glass(false);
    surface.style.transition = '';
    surface.style.transform = '';
  };

  const commit = dir => {
    const from = at();
    const target = order[from + dir];
    /* Nothing to go to — treat it as a cancelled drag rather than
       navigating to undefined, which is what happened when the safety net
       fired after the route had already changed. */
    if (from < 0 || !target) { shift(0, 220); setTimeout(reset, 230); return; }

    const out = dir > 0 ? -width : width;
    shift(out, 190);

    /*
     * Exactly once.
     *
     * transitionend and the timeout that covers a dropped transitionend
     * are both wired up, and before this guard both fired: the screen
     * advanced twice from a single flick, and the second call read a
     * route that had already moved, producing '#undefined'.
     */
    let swapped = false;
    const done = () => {
      if (swapped) return;
      swapped = true;
      surface.removeEventListener('transitionend', done);
      go(target);
      shift(dir > 0 ? width * 0.22 : -width * 0.22, 0);
      requestAnimationFrame(() => {
        shift(0, 230);
        setTimeout(reset, 250);
      });
    };
    surface.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 250);            // covers a transitionend that never arrives
  };

  surface.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    /* .no-swipe marks anything that handles its own horizontal drag —
       a dismissible coach note, for instance. Without this the tab
       swiper and the card would both claim the same gesture. */
    if (e.target.closest('.sheet, .scrim, input, textarea, select, .no-swipe')) return;
    const t = e.touches[0];
    startX = lastX = t.clientX; startY = t.clientY;
    lastT = e.timeStamp;
    width = surface.clientWidth || window.innerWidth;
    dx = 0; vx = 0; axis = null; active = true;
    surface.style.transition = '';
  }, { passive: true });

  /* Not passive: claiming the axis has to be able to stop the scroll. */
  surface.addEventListener('touchmove', e => {
    if (!active || e.touches.length !== 1) return;
    const t = e.touches[0];
    const x = t.clientX - startX;
    const y = t.clientY - startY;

    if (!axis) {
      if (Math.abs(x) < SLOP && Math.abs(y) < SLOP) return;
      axis = Math.abs(y) > Math.abs(x) * VERTICAL_RATIO ? 'y' : 'x';
      if (axis === 'x') glass(true);
    }
    if (axis !== 'x') return;

    /* This is ours now — no vertical scrolling underneath it. */
    if (e.cancelable) e.preventDefault();

    const dt = Math.max(1, e.timeStamp - lastT);
    vx = (t.clientX - lastX) / dt;
    lastX = t.clientX; lastT = e.timeStamp;

    dx = canGo(x < 0 ? 1 : -1) ? x : x * 0.3;   // rubber-band at the ends
    shift(dx, 0);
  }, { passive: false });

  const release = () => {
    if (!active) return;
    if (axis !== 'x') { active = false; axis = null; return; }
    const dir = dx < 0 ? 1 : -1;
    const far  = Math.abs(dx) > width * COMMIT_FRACTION;
    const fast = Math.abs(vx) > FLICK_VELOCITY && Math.abs(dx) > 24;
    if ((far || fast) && canGo(dir)) commit(dir);
    else { shift(0, 240); setTimeout(reset, 250); }
  };

  surface.addEventListener('touchend', release, { passive: true });
  surface.addEventListener('touchcancel', () => { shift(0, 200); setTimeout(reset, 210); }, { passive: true });
}
