/*
 * Reading a nutrition label.
 *
 * The honest constraint first: real OCR in this app is not available. The
 * app is a static, offline-capable page with no build step, and every
 * JavaScript OCR engine worth using pulls a multi-megabyte WASM blob from
 * a CDN — which breaks offline use and the content policy both. Shipping a
 * button called "scan label" that quietly failed would be worse than not
 * having one.
 *
 * What does work, on every phone the app runs on:
 *
 *   1. iOS Live Text and Android Lens both let you select the text in a
 *      photograph and copy it. Paste it here and this parses it. That is
 *      the whole label, read by an OCR engine far better than anything
 *      shippable here, with two taps.
 *   2. Where the browser exposes TextDetector — Chrome on Android — the
 *      photo is read directly and the same parser runs on the result.
 *
 * A multivitamin panel has thirty rows and nobody is typing those in, so
 * the parser goes well beyond macros: it reads the vitamins and minerals
 * too, which is what makes a supplement label worth capturing at all.
 */

/* Everything is normalised to per 100 g / 100 ml before it is returned. */
const NUM = String.raw`(-?[\d]+(?:[.,]\d+)?)`;

/*
 * Order matters. "of which sugars" has to be tried before "sugars", and
 * "saturated" before "fat", or the looser pattern eats the line first.
 */
const FIELDS = [
  ['kcal', [/energy[^\n]*?(\d+(?:[.,]\d+)?)\s*k?cal/i, new RegExp(NUM + String.raw`\s*kcal`, 'i'),
            /calories[^\n]*?(\d+(?:[.,]\d+)?)/i]],
  ['kj',   [new RegExp(String.raw`energy[^\n]*?` + NUM + String.raw`\s*kj`, 'i'),
            new RegExp(NUM + String.raw`\s*kj`, 'i')]],
  ['sat',  [new RegExp(String.raw`(?:of which\s+)?satur\w*[^\d\n]*` + NUM, 'i'),
            new RegExp(String.raw`saturated fat[^\d\n]*` + NUM, 'i')]],
  ['trans',[new RegExp(String.raw`trans[^\d\n]*` + NUM, 'i')]],
  ['f',    [new RegExp(String.raw`total fat[^\d\n]*` + NUM, 'i'),
            new RegExp(String.raw`\bfat\b(?!\s*,?\s*satur)[^\d\n]*` + NUM, 'i')]],
  ['sug',  [new RegExp(String.raw`(?:of which\s+)?(?:total\s+)?sugar\w*[^\d\n]*` + NUM, 'i'),
            new RegExp(String.raw`added sugar[^\d\n]*` + NUM, 'i')]],
  ['fib',  [new RegExp(String.raw`(?:dietary\s+)?fib(?:re|er)[^\d\n]*` + NUM, 'i')]],
  ['c',    [new RegExp(String.raw`(?:total\s+)?carbohydrate\w*[^\d\n]*` + NUM, 'i'),
            new RegExp(String.raw`\bcarbs?\b[^\d\n]*` + NUM, 'i')]],
  ['p',    [new RegExp(String.raw`protein[^\d\n]*` + NUM, 'i')]],
  ['na',   [new RegExp(String.raw`sodium[^\d\n]*` + NUM + String.raw`\s*(mg|g)?`, 'i')]],
  ['salt', [new RegExp(String.raw`\bsalt\b[^\d\n]*` + NUM, 'i')]],
];

/* Micronutrients, for supplement panels. */
const MICROS = [
  ['vd',  /vitamin\s*d3?\b/i, 'µg'],
  ['va',  /vitamin\s*a\b/i, 'µg'],
  ['vc',  /vitamin\s*c\b|ascorbic/i, 'mg'],
  ['ve',  /vitamin\s*e\b|tocopherol/i, 'mg'],
  ['vk',  /vitamin\s*k\b/i, 'µg'],
  ['b12', /vitamin\s*b\s*-?\s*12\b|cobalamin/i, 'µg'],
  ['b6',  /vitamin\s*b\s*-?\s*6\b|pyridoxine/i, 'mg'],
  ['b1',  /thiamin/i, 'mg'],
  ['b2',  /riboflavin/i, 'mg'],
  ['b3',  /niacin/i, 'mg'],
  ['fol', /folate|folic/i, 'µg'],
  ['fe',  /\biron\b/i, 'mg'],
  ['ca',  /calcium/i, 'mg'],
  ['mg',  /magnesium/i, 'mg'],
  ['zn',  /\bzinc\b/i, 'mg'],
  ['se',  /selenium/i, 'µg'],
  ['i',   /iodine/i, 'µg'],
];

const num = v => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/*
 * Which basis the panel is quoted on.
 *
 * Indian labels usually give per 100 g; American ones give per serving and
 * declare the serving size separately. Getting this wrong scales the whole
 * panel by a factor of two or three, so it is worth reading explicitly
 * rather than assuming.
 */
export function detectBasis(text) {
  if (/per\s*100\s*(g|ml|gm)/i.test(text)) return { basis: 'per100', servingG: null };

  const m = text.match(/serving size[^\d\n]*(\d+(?:[.,]\d+)?)\s*(g|ml|gm)/i)
        || text.match(/per\s+serve[^\d\n]*(\d+(?:[.,]\d+)?)\s*(g|ml|gm)/i)
        || text.match(/\((\d+(?:[.,]\d+)?)\s*(g|ml|gm)\)\s*(?:per\s+)?serv/i);
  if (m) return { basis: 'perServing', servingG: num(m[1]) };
  return { basis: 'unknown', servingG: null };
}

/*
 * Parse a label into a per-100 panel.
 *
 * Returns what it found and, just as importantly, what it did not: a
 * half-read label presented as complete is how a 400 kcal snack becomes a
 * 40 kcal one. The caller shows every field for correction either way.
 */
export function parseLabel(raw) {
  const text = String(raw || '')
    .replace(/ /g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/[ \t]+/g, ' ');
  if (!text.trim()) return null;

  const found = {};
  const lines = text.split(/\n+/);

  for (const [field, patterns] of FIELDS) {
    for (const re of patterns) {
      /* Line by line first: labels are tabular, and a whole-blob match can
         pair the word "protein" with a number three rows away. */
      let hit = null;
      for (const line of lines) {
        const m = line.match(re);
        if (m) { hit = m; break; }
      }
      if (!hit) hit = text.match(re);
      if (hit) { found[field] = num(hit[1]); break; }
    }
  }

  /* kJ is the primary figure on many Indian labels; kcal follows from it. */
  if (found.kcal == null && found.kj != null) found.kcal = Math.round(found.kj / 4.184);
  delete found.kj;

  /* Salt and sodium are the same declaration in different units. */
  if (found.na == null && found.salt != null) found.na = Math.round(found.salt * 400);
  delete found.salt;
  /* Sodium quoted in grams on a per-100 g panel is always a mistake of
     units on our side, not theirs — under 10 means grams. */
  if (found.na != null && found.na < 10) found.na = Math.round(found.na * 1000);

  const micros = {};
  for (const [k, re, unit] of MICROS) {
    for (const line of lines) {
      const at = line.match(re);
      if (!at) continue;
      /* Read the number from after the nutrient's name, never from inside
         it. Searching the whole line made "Vitamin B12 1 mcg" report 12 µg
         of B12 — the digits in the name won, and the actual dose was
         twelve times out. */
      const rest = line.slice(at.index + at[0].length);
      const m = rest.match(new RegExp(NUM + String.raw`\s*(mcg|µg|ug|mg|g|iu)?`, 'i'));
      if (!m) continue;
      let v = num(m[1]);
      const u = (m[2] || unit).toLowerCase();
      if (v == null) continue;
      /* Normalise to the unit the app stores each nutrient in. */
      if (unit === 'µg' && u === 'mg') v *= 1000;
      if (unit === 'mg' && (u === 'mcg' || u === 'µg' || u === 'ug')) v /= 1000;
      if (u === 'iu' && k === 'vd') v /= 40;
      if (u === 'iu' && k === 'va') v /= 3.33;
      micros[k] = Math.round(v * 100) / 100;
      break;
    }
  }

  const { basis, servingG } = detectBasis(text);
  const per100 = { ...found };

  /* Rescale a per-serving panel onto the app's per-100 basis. */
  if (basis === 'perServing' && servingG > 0) {
    for (const k of Object.keys(per100)) {
      if (per100[k] != null) per100[k] = +(per100[k] * 100 / servingG).toFixed(2);
    }
  }

  const missing = ['kcal', 'p', 'c', 'f'].filter(k => per100[k] == null);
  return {
    per100, micros, basis, servingG,
    missing,
    confident: missing.length === 0 && basis !== 'unknown',
    lineCount: lines.length,
  };
}

/*
 * Read a photograph directly, where the browser can.
 *
 * TextDetector exists in Chrome on Android and nowhere else that matters.
 * When it is missing this returns null and the caller falls back to paste,
 * which is the path most people will use anyway.
 */
export async function readImage(file) {
  if (typeof window === 'undefined' || !('TextDetector' in window)) return null;
  try {
    const bmp = await createImageBitmap(file);
    const det = new window.TextDetector();
    const blocks = await det.detect(bmp);
    bmp.close?.();
    if (!blocks?.length) return null;
    /* Top to bottom, so the parser sees the label in reading order. */
    return blocks
      .sort((a, b) => (a.boundingBox?.top ?? 0) - (b.boundingBox?.top ?? 0))
      .map(b => b.rawValue)
      .join('\n');
  } catch { return null; }
}

export const canReadImages = () => typeof window !== 'undefined' && 'TextDetector' in window;
