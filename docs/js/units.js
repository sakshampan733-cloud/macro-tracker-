/*
 * Height and weight units, chosen separately.
 *
 * The usual approach is one "metric or imperial" switch, and it is wrong
 * for most of the world outside America. Plenty of people think of their
 * height in feet and inches and their weight in kilos, or the reverse, and
 * forcing both to move together means one of the two numbers is always
 * being converted in someone's head — which is exactly the arithmetic an
 * app exists to remove.
 *
 * So they are two settings, not one. Storage never changes: centimetres
 * and kilograms throughout, because a stored value that changes meaning
 * with a display preference is a data corruption waiting to happen. These
 * helpers convert only at the edges, on the way in and on the way out.
 */

export const HEIGHT_UNITS = {
  cm:   { label: 'Centimetres', short: 'cm' },
  ftin: { label: 'Feet & inches', short: 'ft' },
};

export const WEIGHT_UNITS = {
  kg: { label: 'Kilograms', short: 'kg' },
  lb: { label: 'Pounds', short: 'lb' },
};

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

export const heightUnit = s => (HEIGHT_UNITS[s?.settings?.heightUnit] ? s.settings.heightUnit : 'cm');
export const weightUnit = s => (WEIGHT_UNITS[s?.settings?.weightUnit] ? s.settings.weightUnit : 'kg');

/* ── Weight ─────────────────────────────────────────────────────────── */

export const kgToLb = kg => (kg || 0) * LB_PER_KG;
export const lbToKg = lb => (lb || 0) / LB_PER_KG;

/* A weight for display, in whichever unit is set. */
export function showWeight(kg, unit = 'kg', { dp = 1, withUnit = true } = {}) {
  if (kg == null || Number.isNaN(kg)) return '—';
  const v = unit === 'lb' ? kgToLb(kg) : kg;
  const n = v.toFixed(dp);
  return withUnit ? `${n} ${unit}` : n;
}

/* A typed weight, back to the kilograms everything is stored in. */
export const readWeight = (value, unit = 'kg') => {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return unit === 'lb' ? lbToKg(n) : n;
};

/*
 * A difference in weight.
 *
 * Kept separate from showWeight because a delta of zero should read as
 * "0.0 kg" rather than "—", and because the sign matters.
 */
export function showWeightDelta(kg, unit = 'kg', { dp = 1 } = {}) {
  const v = unit === 'lb' ? kgToLb(kg) : kg;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(dp)} ${unit}`;
}

/* ── Height ─────────────────────────────────────────────────────────── */

export function cmToFtIn(cm) {
  const totalIn = (cm || 0) / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  /* 5 ft 12 in is nobody's height. */
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, in: inch };
}

export const ftInToCm = (ft, inch) =>
  ((Number(ft) || 0) * 12 + (Number(inch) || 0)) * CM_PER_IN;

export function showHeight(cm, unit = 'cm') {
  if (cm == null || Number.isNaN(cm)) return '—';
  if (unit === 'ftin') {
    const { ft, in: inch } = cmToFtIn(cm);
    return `${ft}′ ${inch}″`;
  }
  return `${Math.round(cm)} cm`;
}

/* ── A rate, which is a weight per week ─────────────────────────────── */

export function showRate(kgPerWeek, unit = 'kg', { dp = 2 } = {}) {
  if (!kgPerWeek) return 'hold steady';
  const v = unit === 'lb' ? kgToLb(kgPerWeek) : kgPerWeek;
  const dir = v > 0 ? 'gain' : 'lose';
  return `${dir} ${Math.abs(v).toFixed(dp)} ${unit} a week`;
}
