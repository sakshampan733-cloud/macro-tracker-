/*
 * The ambient orb, as an option nobody is given by default.
 *
 * It shipped on, tinting every card a slightly different colour than the
 * one it had been handed, and with the Health palette on true black that
 * was the main reason the app did not look like Health. So the default is
 * off and the exterior is flat.
 *
 * It is still here because a flat black ground is a preference rather than
 * a fact, and somebody who wants a room for the glass to sit in should be
 * able to have one. Off is a first-class choice in the list rather than
 * the absence of one.
 */
export const ORBS = {
  none:    { label: 'Off',     dark: null,            light: null },
  red:     { label: 'Red',     dark: '198, 76, 66',   light: '208, 88, 76' },
  amber:   { label: 'Amber',   dark: '206, 134, 78',  light: '216, 146, 88' },
  rose:    { label: 'Rose',    dark: '196, 110, 122', light: '206, 124, 134' },
  violet:  { label: 'Violet',  dark: '138, 120, 186', light: '148, 132, 194' },
  ocean:   { label: 'Ocean',   dark: '94, 138, 178',  light: '104, 148, 186' },
  emerald: { label: 'Emerald', dark: '92, 152, 132',  light: '100, 160, 140' },
};

export function applyOrb(name, theme = 'dark') {
  const root = document.documentElement;
  const orb = ORBS[name] || ORBS.none;

  /* Switched off entirely rather than faded to zero: a transparent
     full-screen gradient still costs a paint on every frame. */
  if (!orb.dark) {
    root.style.removeProperty('--orb');
    root.setAttribute('data-orb', 'none');
    return;
  }
  root.removeAttribute('data-orb');
  root.style.setProperty('--orb', theme === 'light' ? orb.light : orb.dark);
}
