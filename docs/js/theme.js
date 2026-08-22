/*
 * The ambient orb.
 *
 * Its own module rather than living in app.js: Settings needs the palette
 * and app.js needs Settings, and a cycle between them works only by
 * accident of when each binding happens to be evaluated.
 *
 * Hues are stored as RGB triples so the gradient can vary alpha at each
 * stop without recomputing the colour. Both themes share your choice; the
 * light values are lifted a little so the glow still reads on a pale
 * ground instead of disappearing into it.
 */

export const ORBS = {
  amber:   { label: 'Amber',   dark: '232, 132, 58',  light: '246, 152, 66' },
  rose:    { label: 'Rose',    dark: '236, 92, 122',  light: '240, 104, 134' },
  violet:  { label: 'Violet',  dark: '150, 108, 255', light: '156, 118, 250' },
  ocean:   { label: 'Ocean',   dark: '56, 148, 232',  light: '72, 158, 236' },
  emerald: { label: 'Emerald', dark: '48, 190, 148',  light: '52, 178, 142' },
  ember:   { label: 'Ember',   dark: '228, 84, 62',   light: '234, 98, 74' },
};

export function applyOrb(name, theme) {
  const orb = ORBS[name] || ORBS.amber;
  const dark = theme === 'dark'
    || (theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches !== false);
  document.documentElement.style.setProperty('--orb', dark ? orb.dark : orb.light);
}
