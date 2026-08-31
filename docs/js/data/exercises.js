/*
 * The exercise library, and what a sensible amount of it looks like.
 *
 * This exists so a workout can be defined in as much detail as the person
 * wants. "Chest & Triceps" is enough for most people and always will be;
 * for anyone who wants to write down that it is four sets of incline
 * dumbbell press, three of pec deck and three of cable pushdowns, that
 * should be possible without leaving the app.
 *
 * Every exercise carries the groups it actually trains, including the ones
 * it trains incidentally — a bench press is a triceps exercise whether or
 * not you were thinking about your triceps. Those secondary groups count
 * for less when the app totals the work up, because they receive less.
 */

export const EXERCISES = [
  /* ── Chest ── */
  { id: 'bench-bb',      name: 'Barbell bench press',    primary: ['chest'], secondary: ['triceps', 'shoulders'], compound: true },
  { id: 'bench-db',      name: 'Dumbbell bench press',   primary: ['chest'], secondary: ['triceps', 'shoulders'], compound: true },
  { id: 'bench-incline', name: 'Incline bench press',    primary: ['chest'], secondary: ['shoulders', 'triceps'], compound: true },
  { id: 'bench-decline', name: 'Decline bench press',    primary: ['chest'], secondary: ['triceps'], compound: true },
  { id: 'press-smith',   name: 'Smith machine press',    primary: ['chest'], secondary: ['triceps'], compound: true },
  { id: 'press-machine', name: 'Chest press machine',    primary: ['chest'], secondary: ['triceps'], compound: true },
  { id: 'pec-deck',      name: 'Pec deck',               primary: ['chest'], secondary: [] },
  { id: 'fly-cable',     name: 'Cable fly',              primary: ['chest'], secondary: [] },
  { id: 'fly-db',        name: 'Dumbbell fly',           primary: ['chest'], secondary: [] },
  { id: 'pushup',        name: 'Push-up',                primary: ['chest'], secondary: ['triceps', 'core'], compound: true },
  { id: 'dip-chest',     name: 'Chest dip',              primary: ['chest'], secondary: ['triceps'], compound: true },

  /* ── Back ── */
  { id: 'pullup',        name: 'Pull-up',                primary: ['back'], secondary: ['biceps'], compound: true },
  { id: 'chinup',        name: 'Chin-up',                primary: ['back'], secondary: ['biceps'], compound: true },
  { id: 'pulldown',      name: 'Lat pulldown',           primary: ['back'], secondary: ['biceps'], compound: true },
  { id: 'row-bb',        name: 'Barbell row',            primary: ['back'], secondary: ['biceps'], compound: true },
  { id: 'row-db',        name: 'Dumbbell row',           primary: ['back'], secondary: ['biceps'], compound: true },
  { id: 'row-cable',     name: 'Seated cable row',       primary: ['back'], secondary: ['biceps'], compound: true },
  { id: 'row-tbar',      name: 'T-bar row',              primary: ['back'], secondary: ['biceps'], compound: true },
  { id: 'row-machine',   name: 'Machine row',            primary: ['back'], secondary: ['biceps'], compound: true },
  { id: 'pullover',      name: 'Straight-arm pulldown',  primary: ['back'], secondary: [] },
  { id: 'shrug',         name: 'Shrug',                  primary: ['back'], secondary: [] },
  { id: 'deadlift',      name: 'Deadlift',               primary: ['back', 'legs'], secondary: ['core'], compound: true },

  /* ── Shoulders ── */
  { id: 'ohp',           name: 'Overhead press',         primary: ['shoulders'], secondary: ['triceps'], compound: true },
  { id: 'press-db-sh',   name: 'Dumbbell shoulder press',primary: ['shoulders'], secondary: ['triceps'], compound: true },
  { id: 'raise-lat',     name: 'Lateral raise',          primary: ['shoulders'], secondary: [] },
  { id: 'raise-cable',   name: 'Cable lateral raise',    primary: ['shoulders'], secondary: [] },
  { id: 'raise-front',   name: 'Front raise',            primary: ['shoulders'], secondary: [] },
  { id: 'rear-delt',     name: 'Rear delt fly',          primary: ['shoulders'], secondary: ['back'] },
  { id: 'face-pull',     name: 'Face pull',              primary: ['shoulders'], secondary: ['back'] },
  { id: 'upright-row',   name: 'Upright row',            primary: ['shoulders'], secondary: ['back'] },

  /* ── Biceps ── */
  { id: 'curl-bb',       name: 'Barbell curl',           primary: ['biceps'], secondary: [] },
  { id: 'curl-db',       name: 'Dumbbell curl',          primary: ['biceps'], secondary: [] },
  { id: 'curl-hammer',   name: 'Hammer curl',            primary: ['biceps'], secondary: [] },
  { id: 'curl-preacher', name: 'Preacher curl',          primary: ['biceps'], secondary: [] },
  { id: 'curl-cable',    name: 'Cable curl',             primary: ['biceps'], secondary: [] },
  { id: 'curl-incline',  name: 'Incline dumbbell curl',  primary: ['biceps'], secondary: [] },
  { id: 'curl-concent',  name: 'Concentration curl',     primary: ['biceps'], secondary: [] },

  /* ── Triceps ── */
  { id: 'pushdown',      name: 'Cable pushdown',         primary: ['triceps'], secondary: [] },
  { id: 'pushdown-rope', name: 'Rope pushdown',          primary: ['triceps'], secondary: [] },
  { id: 'tri-overhead',  name: 'Overhead extension',     primary: ['triceps'], secondary: [] },
  { id: 'skullcrusher',  name: 'Skullcrusher',           primary: ['triceps'], secondary: [] },
  { id: 'cgbp',          name: 'Close-grip bench press', primary: ['triceps'], secondary: ['chest'], compound: true },
  { id: 'dip-tri',       name: 'Triceps dip',            primary: ['triceps'], secondary: ['chest'], compound: true },
  { id: 'kickback',      name: 'Triceps kickback',       primary: ['triceps'], secondary: [] },

  /* ── Legs ── */
  { id: 'squat-bb',      name: 'Back squat',             primary: ['legs'], secondary: ['core'], compound: true },
  { id: 'squat-front',   name: 'Front squat',            primary: ['legs'], secondary: ['core'], compound: true },
  { id: 'squat-hack',    name: 'Hack squat',             primary: ['legs'], secondary: [], compound: true },
  { id: 'leg-press',     name: 'Leg press',              primary: ['legs'], secondary: [], compound: true },
  { id: 'rdl',           name: 'Romanian deadlift',      primary: ['legs'], secondary: ['back'], compound: true },
  { id: 'leg-ext',       name: 'Leg extension',          primary: ['legs'], secondary: [] },
  { id: 'leg-curl',      name: 'Leg curl',               primary: ['legs'], secondary: [] },
  { id: 'lunge',         name: 'Walking lunge',          primary: ['legs'], secondary: ['core'], compound: true },
  { id: 'split-squat',   name: 'Bulgarian split squat',  primary: ['legs'], secondary: ['core'], compound: true },
  { id: 'hip-thrust',    name: 'Hip thrust',             primary: ['legs'], secondary: [] },
  { id: 'calf-raise',    name: 'Calf raise',             primary: ['legs'], secondary: [] },

  /* ── Core ── */
  { id: 'plank',         name: 'Plank',                  primary: ['core'], secondary: [] },
  { id: 'leg-raise',     name: 'Hanging leg raise',      primary: ['core'], secondary: [] },
  { id: 'cable-crunch',  name: 'Cable crunch',           primary: ['core'], secondary: [] },
  { id: 'ab-wheel',      name: 'Ab wheel',               primary: ['core'], secondary: [] },
  { id: 'russian-twist', name: 'Russian twist',          primary: ['core'], secondary: [] },
  { id: 'sit-up',        name: 'Sit-up',                 primary: ['core'], secondary: [] },
];

export const exerciseById = id => EXERCISES.find(e => e.id === id) || null;

export function exercisesFor(groups) {
  const want = new Set(groups || []);
  if (!want.size) return EXERCISES;
  return EXERCISES.filter(e => e.primary.some(g => want.has(g)));
}

/*
 * Sets per muscle, counted the way they are actually received.
 *
 * A set of bench press is a set of chest work and something rather less
 * than a set of triceps work — the triceps are loaded, but through a
 * shorter range and not to the same limit. Counting it as a whole set for
 * both would tell someone doing push days that their triceps are getting
 * twice what they really are. Half is the convention, and it is a
 * convention rather than a measurement, which is why the app never
 * reports these to a decimal place it cannot support.
 */
export const SECONDARY_WEIGHT = 0.5;

export function setsByGroup(plan) {
  const out = {};
  for (const item of plan || []) {
    const ex = exerciseById(item.exerciseId);
    if (!ex) continue;
    const sets = item.sets || 0;
    for (const g of ex.primary) out[g] = (out[g] || 0) + sets;
    for (const g of ex.secondary) out[g] = (out[g] || 0) + sets * SECONDARY_WEIGHT;
  }
  return out;
}

/*
 * How much work a muscle should get in a week, and why it depends.
 *
 * The number the evidence supports is roughly ten to twenty hard sets per
 * muscle per week for growth, with somewhere below ten enough to hold what
 * you already have, and returns flattening past twenty for most people.
 *
 * What genuinely moves those bounds is not who you are but what you are
 * eating. Training is a stimulus you have to recover from, and recovery is
 * paid for with energy — in a deficit the same volume costs more than it
 * returns, which is why hard cuts and high volume go badly together. A
 * surplus buys the opposite.
 *
 * Deliberately NOT adjusted for sex. It is a natural thing to assume, and
 * the evidence does not support it: women tolerate volume at least as well
 * as men at the same training age. Encoding a lower ceiling for women
 * would be inventing a limit and then telling somebody it was theirs.
 */
export function volumeBand(profile, opts = {}) {
  const rate = profile?.rate ?? 0;
  const deficit = rate < -0.15;
  const hardCut = rate <= -0.6;
  const surplus = rate > 0.15;

  let min = 10, max = 20;
  let why = 'Ten to twenty hard sets a week per muscle is where growth reliably happens.';

  if (hardCut) {
    min = 6; max = 14;
    why = 'You are losing weight quickly, and recovery is paid for with energy. '
        + 'Enough work to keep the muscle you have matters more right now than '
        + 'adding to it — this band is lower on purpose.';
  } else if (deficit) {
    min = 8; max = 16;
    why = 'You are in a deficit, so the same volume costs more to recover from '
        + 'than it would at maintenance. Slightly less work, taken closer to '
        + 'failure, holds up better.';
  } else if (surplus) {
    min = 12; max = 22;
    why = 'You are eating in a surplus, which is when higher volumes actually '
        + 'get recovered from and turned into something.';
  }

  /* A run of poor recovery is evidence about this person, not a population,
     and it outranks anything inferred from their diet. */
  if (opts.recovery != null && opts.recovery < 40) {
    max = Math.round(max * 0.8);
    why += ' Your recovery has been low lately, so the top of the band is pulled in.';
  }
  return { min, max, why, deficit, surplus };
}

export function bandVerdict(weeklySets, band) {
  if (weeklySets === 0) return { level: 'none', label: 'nothing' };
  if (weeklySets < band.min * 0.6) return { level: 'low', label: 'well under' };
  if (weeklySets < band.min) return { level: 'under', label: 'a little under' };
  if (weeklySets <= band.max) return { level: 'in', label: 'in the band' };
  if (weeklySets <= band.max * 1.35) return { level: 'over', label: 'above the band' };
  return { level: 'high', label: 'well above' };
}

/*
 * How the session felt, which no strap and no set count can tell you.
 *
 * Two identical sessions on paper are different sessions if one was taken
 * to failure and the other was phoned in. This is the only part of the
 * picture that has to come from the person, so it is one tap and never
 * required.
 */
/*
 * Three, not four.
 *
 * "Everything" and "Pushed" were asking the same question twice — the gap
 * between close to failure and at failure is real in a programme and
 * invisible in a one-tap rating, and a scale with a rung nobody can
 * reliably pick is a scale that returns noise.
 */
export const EFFORT = [
  { id: 'easy',  label: 'Held back', note: 'Left several reps in reserve throughout.' },
  { id: 'solid', label: 'Solid',     note: 'Worked properly, stopped short of failure.' },
  { id: 'hard',  label: 'Pushed',    note: 'Close to failure on the working sets.' },
];
export const effortById = id => EFFORT.find(e => e.id === id) || null;
