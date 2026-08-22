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

/*
 * Muted rather than saturated.
 *
 * The first pass used near-primary hues, which behind a translucent pane
 * read as a lit toy rather than as a room the glass is sitting in. These
 * are pulled toward earth: lower chroma, a little darker, so the glow
 * still tints the panes without becoming the subject.
 */
export const ORBS = {
  red:     { label: 'Red',     dark: '198, 76, 66',   light: '208, 88, 76' },
  amber:   { label: 'Amber',   dark: '206, 134, 78',  light: '216, 146, 88' },
  rose:    { label: 'Rose',    dark: '196, 110, 122', light: '206, 124, 134' },
  violet:  { label: 'Violet',  dark: '138, 120, 186', light: '148, 132, 194' },
  ocean:   { label: 'Ocean',   dark: '94, 138, 178',  light: '104, 148, 186' },
  emerald: { label: 'Emerald', dark: '92, 152, 132',  light: '100, 160, 140' },
};

export function applyOrb(name, theme) {
  const orb = ORBS[name] || ORBS.red;
  const dark = theme === 'dark'
    || (theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches !== false);
  document.documentElement.style.setProperty('--orb', dark ? orb.dark : orb.light);
}
