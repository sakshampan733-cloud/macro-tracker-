/*
 * Classifying a food the database has never seen.
 *
 * The quality map is keyed by food id, so anything scanned, built by hand
 * or imported had no protein/fat/carb class at all — and the detail views
 * quietly showed nothing. Scanning a whey isolate and being told nothing
 * about it, when typing the same product in by hand gave a full read, is
 * indefensible: the packet has more information than the guess, not less.
 *
 * So: infer the class from the product name first, and fall back to the
 * shape of the macros themselves. Every result is marked `inferred`, and
 * the UI says so — an inferred class is a good guess about which *kind* of
 * food this is, not a measurement, and the difference matters when the
 * answer is "this protein is complete".
 */

/* Name rules run in order; the first hit wins, so put the specific ones
   first. "protein bar" must beat "bar", "coconut oil" must beat "oil". */
const PROTEIN_RULES = [
  [/\b(whey|wpc|wpi|isolate|hydrolys|protein\s*(powder|shake|blend))\b/i, 'whey'],
  [/\b(casein|micellar)\b/i, 'dairy'],
  [/\b(paneer|cheese|milk|yogh?urt|yogurt|curd|dahi|cream|butter|ghee|khoya|lassi|shrikhand)\b/i, 'dairy'],
  [/\b(egg|omelet|omelette|anda)\b/i, 'egg'],
  [/\b(chicken|mutton|lamb|beef|pork|turkey|bacon|ham|sausage|salami|keema|kheema|meat|steak)\b/i, 'meat'],
  [/\b(fish|tuna|salmon|prawn|shrimp|surmai|rohu|pomfret|mackerel|sardine|anchov)\b/i, 'fish'],
  [/\b(soy|soya|tofu|tempeh|edamame)\b/i, 'soy'],
  [/\b(dal|daal|lentil|chana|chickpea|rajma|kidney bean|moong|mung|toor|arhar|urad|masoor|lobia|bean|pulse|hummus|besan)\b/i, 'legume'],
  [/\b(almond|cashew|peanut|walnut|pista|pistachio|hazelnut|pecan|nut butter|seed|tahini|chia|flax)\b/i, 'nut'],
  [/\b(rice|wheat|atta|maida|roti|chapati|bread|pasta|noodle|macaroni|oat|corn|maize|quinoa|millet|bajra|jowar|ragi|poha|suji|rava|semolina|biscuit|cookie|cracker|cereal|granola|muesli)\b/i, 'grain'],
  [/\b(spinach|palak|broccoli|carrot|tomato|onion|cabbage|cauliflower|gobi|bhindi|okra|vegetable|salad|mushroom)\b/i, 'veg'],
];

const FAT_RULES = [
  [/\bolive oil\b/i, 'oliveoil'],
  [/\b(ghee|clarified butter)\b/i, 'ghee'],
  [/\b(walnut|flax|chia)\b/i, 'walnutish'],
  [/\b(salmon|sardine|mackerel|anchov|oily fish)\b/i, 'oilyfish'],
  [/\b(tuna|surmai|rohu|pomfret|prawn|shrimp|white fish)\b/i, 'leanfish'],
  [/\b(fried|fries|chips|crisps|pakora|samosa|puri|vada|bhaji|namkeen|doughnut|donut)\b/i, 'fried'],
  [/\b(paneer|cheese|milk|yogh?urt|curd|cream|butter|khoya)\b/i, 'dairyfat'],
  [/\b(chicken|mutton|lamb|beef|pork|bacon|sausage|keema|meat)\b/i, 'meatfat'],
  [/\b(sunflower|soybean oil|refined oil|vanaspati|palm oil|canola|rapeseed|margarine)\b/i, 'seedoil'],
  [/\b(almond|cashew|peanut|pista|pistachio|hazelnut|pecan|nut)\b/i, 'nut'],
];

const CARB_RULES = [
  [/\b(sugar|candy|toffee|chocolate|jam|honey|syrup|jalebi|gulab|barfi|halwa|ladoo|laddu|soft ?drink|cola|pepsi|juice|squash|energy drink)\b/i, 'sugary'],
  [/\b(whole ?wheat|whole ?grain|brown rice|oat|multigrain|bran|millet|bajra|jowar|ragi|quinoa|dalia)\b/i, 'whole'],
  [/\b(dal|daal|lentil|chana|chickpea|rajma|bean|moong|mung|toor|urad|masoor|pulse|besan)\b/i, 'legume'],
  [/\b(apple|banana|mango|orange|grape|papaya|guava|berry|berries|fruit|melon|pear|peach)\b/i, 'fruit'],
  [/\b(spinach|palak|broccoli|carrot|tomato|onion|cabbage|cauliflower|gobi|bhindi|okra|vegetable|salad|mushroom)\b/i, 'veg'],
  [/\b(maida|white bread|white rice|refined|biscuit|cookie|cracker|pastry|cake|noodle|pasta|naan|bun|pav)\b/i, 'refined'],
  [/\b(rice|potato|aloo|bread|roti|chapati|cereal|corn|maize|poha|suji|rava)\b/i, 'starchy'],
];

const match = (rules, text) => {
  for (const [re, cls] of rules) if (re.test(text)) return cls;
  return null;
};

/*
 * A flavour is not an ingredient.
 *
 * "Whey Protein Isolate, Chocolate" was landing on the added-sugar class
 * because the word chocolate appears in it — a product that is 80%
 * protein and 8% carbohydrate. Flavour descriptors get stripped before
 * the carbohydrate rules run, since they describe how something tastes
 * rather than what it is made of.
 */
const FLAVOUR_WORD =
  'chocolate|vanilla|strawberry|mango|banana|caramel|coffee|mocha|cookies? ?n? ?cream'
  + '|kesar|pista|butterscotch|orange|lemon|mint|blueberry|berry|cafe ?mocha|malai';

/* Two shapes, both global: a flavour word that follows a comma or dash
   ("Isolate, Chocolate"), and one that is explicitly labelled as a flavour
   ("Chocolate Flavour"). Anchoring to the end of the string was the bug —
   the brand name is appended after it, so nothing ever matched. */
const FLAVOUR = new RegExp(
  '[,\\u2013-]\\s*(' + FLAVOUR_WORD + ')\\b'
  + '|\\b(' + FLAVOUR_WORD + ')\\s+flavou?r\\w*'
  + '|\\bflavou?r(ed)?\\b',
  'gi');

const deflavour = text => text.replace(FLAVOUR, ' ');

/*
 * When the name says nothing useful, the macros still do. These are
 * deliberately conservative: they only fire on shapes that are hard to
 * mistake, and anything ambiguous returns null so the UI shows "not
 * classified" rather than a confident wrong answer.
 */
function fromMacros(per100) {
  const p = per100.p || 0, c = per100.c || 0, f = per100.f || 0;
  const kcal = per100.kcal || (p * 4 + c * 4 + f * 9);
  if (!kcal) return null;

  const pShare = (p * 4) / kcal;
  const cShare = (c * 4) / kcal;
  const fShare = (f * 9) / kcal;
  const sat = per100.sat;
  const sug = per100.sug || 0;

  const out = {};

  // A powder: overwhelmingly protein, almost no fat. Nothing else looks like this.
  if (pShare > 0.7 && f < 8) out.p = 'whey';
  else if (pShare > 0.45) out.p = (sat != null && sat / Math.max(f, 0.01) > 0.45) ? 'dairy' : 'meat';
  else if (pShare > 0.18 && cShare > 0.4) out.p = 'legume';
  else if (cShare > 0.6) out.p = 'grain';

  // Saturated share is the one fat signal a label reliably carries.
  if (f >= 3 && sat != null) {
    const satShare = sat / f;
    if (satShare > 0.55) out.f = 'dairyfat';
    else if (satShare < 0.2) out.f = 'seedoil';
  }

  // Sugar against total carbohydrate separates a biscuit from a bowl of rice.
  if (c >= 5) {
    const sugShare = sug / c;
    if (sugShare > 0.5) out.c = 'sugary';
    else if ((per100.fib || 0) / c > 0.12) out.c = 'whole';
    else if (cShare > 0.35) out.c = 'refined';
  }

  return Object.keys(out).length ? out : null;
}

/*
 * Infer a class for a food with no entry in the quality map.
 * Returns null when nothing can be said honestly.
 */
export function inferClass(food) {
  if (!food) return null;
  const text = [food.n, food.name, food.brand].filter(Boolean).join(' ');
  const per100 = food.per100 || {};

  const byName = {
    p: match(PROTEIN_RULES, text),
    f: match(FAT_RULES, text),
    c: match(CARB_RULES, deflavour(text)),
  };
  const byMacro = fromMacros(per100) || {};

  /* Macros veto a name match that the numbers plainly contradict. A food
     called sugary that is 4% sugar is a flavour name, not a confection. */
  const carbG = per100.c || 0;
  if (byName.c === 'sugary' && carbG >= 3 && (per100.sug || 0) / carbG < 0.35) byName.c = null;

  /* Name beats macros wherever both have an opinion: "whey isolate" on the
     label is a stronger claim than a protein-heavy macro split, which a
     lean chicken breast shares. */
  const p = byName.p || byMacro.p || null;
  const f = byName.f || byMacro.f || null;
  const c = byName.c || byMacro.c || null;
  if (!p && !f && !c) return null;

  /* A macro that is essentially absent needs no class, and saying 'none'
     is more honest than leaving it blank. */
  const has = (g) => (g || 0) >= 0.5;

  /* A dairy or whey protein carries dairy fat; inheriting that beats
     leaving the fat unclassified over a rounding-error quantity. */
  const fFallback = (p === 'whey' || p === 'dairy') ? 'dairyfat'
    : (p === 'meat' ? 'meatfat' : null);

  return {
    p: p || (has(per100.p) ? null : 'none'),
    f: f || fFallback || (has(per100.f) ? null : 'none'),
    c: c || (has(per100.c) ? null : 'none'),
    inferred: true,
    basis: (byName.p || byName.f || byName.c) ? 'name' : 'macros',
  };
}
