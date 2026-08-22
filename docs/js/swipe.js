/*
 * Swiping between tabs.
 *
 * Two things make this feel right rather than merely work.
 *
 * First, the page follows your finger — it does not wait for you to let
 * go and then animate. A transition that starts on release always feels
 * like a request being processed; one that tracks the finger feels like
 * the thing itself moving.
 *
 * Second, the glass clears as you drag. Every pane in this app is a
 * frosted surface over a single coloured orb, and during a swipe the
 * frost is dropped so the orb comes through sharp, then re-frosts when
 * you settle. That is the half-blurred, half-clear look in the reference
 * — and it doubles as a performance win, because animating a page of
 * backdrop-filters is exactly what makes web gestures stutter.
 *
 * Vertical scrolling must always win. The gesture stays undecided until
 * the finger has moved far enough to reveal intent, and once it commits
 * to a direction it does not change its mind.
 */

const THRESHOLD = 0.22;      // share of the width that counts as a swipe
const SLOP = 12;             // px before we decide horizontal vs vertical
const MAX_TILT = 0.6;        // dy/dx above this is a scroll, not a swipe

export function installSwipe({ surface, scroller, order, current, go }) {
  let startX = 0, startY = 0, dx = 0;
  let axis = null;            // null | 'x' | 'y'
  let active = false;
  let width = 1;

  const at = () => order.indexOf(current());
  const canGo = d => {
    const i = at();
    return i >= 0 && i + d >= 0 && i + d < order.length;
  };

  const setShift = (px, animate) => {
    surface.style.transition = animate
      ? 'transform .34s cubic-bezier(.22,1,.36,1)' : 'none';
    surface.style.transform = px ? `translate3d(${px}px,0,0)` : '';
  };

  const clearGlass = on => document.documentElement.classList.toggle('swiping', on);

  const end = (commit, dir) => {
    active = false; axis = null;
    clearGlass(false);
    if (commit && canGo(dir)) {
      /* Finish the throw, then swap content at the far edge and let the
         new screen come in from the other side. */
      setShift(dir > 0 ? -width : width, true);
      setTimeout(() => {
        go(order[at() + dir]);
        setShift(dir > 0 ? width * 0.28 : -width * 0.28, false);
        requestAnimationFrame(() => setShift(0, true));
      }, 170);
    } else {
      setShift(0, true);
    }
    setTimeout(() => { surface.style.transition = ''; surface.style.transform = ''; }, 420);
  };

  surface.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    if (e.target.closest('.sheet, .scrim, input, textarea, select, .food-grid')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    width = surface.clientWidth || window.innerWidth;
    dx = 0; axis = null; active = true;
  }, { passive: true });

  surface.addEventListener('touchmove', e => {
    if (!active || e.touches.length !== 1) return;
    const x = e.touches[0].clientX - startX;
    const y = e.touches[0].clientY - startY;

    if (!axis) {
      if (Math.abs(x) < SLOP && Math.abs(y) < SLOP) return;
      /* Decide once. A gesture that can flip axis mid-drag feels broken,
         and scrolling a long list must never be hijacked. */
      axis = (Math.abs(y) / Math.max(Math.abs(x), 1) > MAX_TILT) ? 'y' : 'x';
      if (axis === 'x') clearGlass(true);
    }
    if (axis !== 'x') return;

    /* Rubber-band at the ends rather than refusing to move: the resistance
       is what tells you there is nothing there. */
    dx = x;
    if (!canGo(x < 0 ? 1 : -1)) dx = x * 0.28;
    setShift(dx, false);
  }, { passive: true });

  const finish = () => {
    if (!active) return;
    if (axis !== 'x') { active = false; axis = null; return; }
    const past = Math.abs(dx) > width * THRESHOLD;
    end(past, dx < 0 ? 1 : -1);
  };

  surface.addEventListener('touchend', finish, { passive: true });
  surface.addEventListener('touchcancel', () => { active = false; axis = null; clearGlass(false); setShift(0, true); }, { passive: true });
}
