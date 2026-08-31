/*
 * Workouts, as the person doing them defines them.
 *
 * The first version of this shipped a fixed vocabulary — push, pull, legs
 * — and a calendar to hang it on. Both were wrong, and wrong in the same
 * way: they described one way of training as though it were the only one.
 * Plenty of people run a bro split, or chest-and-triceps, or just back;
 * plenty more train in a rotation with rest taken whenever it is needed
 * rather than on Wednesdays. An app that cannot record that is not
 * flexible, it is simply wrong about its user.
 *
 * So a workout here is a name and the muscle groups it covers, and both
 * belong to whoever is training. What follows is a starting library, not
 * a menu — every entry can be edited, renamed or deleted, and new ones
 * built from the groups.
 *
 * The groups are the part the app reasons about, and they are deliberately
 * coarse. "Long head of triceps" is not a distinction anyone makes looking
 * back at their month; "have I trained legs" is.
 */

export const GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'];

export const GROUP_LABEL = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps',
  triceps: 'Triceps', legs: 'Legs', core: 'Core',
};

/* Cardio is not a muscle group and pretending otherwise made the coverage
   check nonsense. It is tracked, it just does not count towards whether
   your back got trained. */
export const CARDIO = 'cardio';

export const PRESETS = [
  { id: 'p-chest-tri',  name: 'Chest & Triceps',  groups: ['chest', 'triceps'] },
  { id: 'p-back-bi',    name: 'Back & Biceps',    groups: ['back', 'biceps'] },
  { id: 'p-shoulders',  name: 'Shoulders',        groups: ['shoulders'] },
  { id: 'p-arms',       name: 'Arms',             groups: ['biceps', 'triceps'] },
  { id: 'p-back',       name: 'Back',             groups: ['back'] },
  { id: 'p-chest',      name: 'Chest',            groups: ['chest'] },
  { id: 'p-legs',       name: 'Legs',             groups: ['legs', 'core'] },
  { id: 'p-push',       name: 'Push',             groups: ['chest', 'shoulders', 'triceps'] },
  { id: 'p-pull',       name: 'Pull',             groups: ['back', 'biceps'] },
  { id: 'p-upper',      name: 'Upper body',       groups: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
  { id: 'p-lower',      name: 'Lower body',       groups: ['legs', 'core'] },
  { id: 'p-full',       name: 'Full body',        groups: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core'] },
  { id: 'p-core',       name: 'Core',             groups: ['core'] },
  { id: 'p-run',        name: 'Run',              groups: [], cardio: true },
  { id: 'p-cycle',      name: 'Cycle',            groups: [], cardio: true },
  { id: 'p-swim',       name: 'Swim',             groups: [], cardio: true },
  { id: 'p-hiit',       name: 'Intervals',        groups: [], cardio: true },
  { id: 'p-sport',      name: 'Sport',            groups: [], cardio: true },
  { id: 'p-mobility',   name: 'Mobility',         groups: [], cardio: true },
];

/*
 * How hard a session was, from the only number worth asking for.
 *
 * Sets taken close to failure is what drives adaptation, and it is one
 * number a person can supply in three seconds on the way out of the gym.
 * Asking for exercises, reps and loads gets a more complete picture from
 * the few who will do it every time, and nothing at all from everyone
 * else — so that stays optional and this is what the app reasons with.
 *
 * The thresholds are per-session and deliberately wide. Anything tighter
 * would be inventing precision: what counts as a hard set varies more
 * between two people than these bands do.
 */
export function sessionLoad({ sets, minutes, strain }) {
  const bySets = sets != null
    ? (sets >= 20 ? 'hard' : sets >= 10 ? 'solid' : sets >= 4 ? 'light' : 'token')
    : null;
  /* Whoop's day strain and Apple's exercise minutes both describe the
     whole day, not the session, so they can only ever corroborate — never
     override something the person actually reported. */
  const byBand = strain != null
    ? (strain >= 15 ? 'hard' : strain >= 10 ? 'solid' : strain >= 6 ? 'light' : 'token')
    : minutes != null
      ? (minutes >= 75 ? 'hard' : minutes >= 40 ? 'solid' : minutes >= 15 ? 'light' : 'token')
      : null;
  return { bySets, byBand, agreed: bySets && byBand ? bySets === byBand : null };
}

const RANK = { token: 0, light: 1, solid: 2, hard: 3 };

/*
 * When the diary and the strap disagree about the same session.
 *
 * "I wrote chest day and did four sets" is a real thing, and so is a
 * genuinely brutal hour that the log records as three sets because the
 * person was too tired to type. Neither is a lie worth accusing anyone of,
 * so this reports the disagreement and its direction and stops there.
 */
export function loadMismatch(load) {
  if (!load.bySets || !load.byBand || load.agreed) return null;
  const gap = RANK[load.bySets] - RANK[load.byBand];
  if (Math.abs(gap) < 2) return null;
  return gap > 0 ? 'sets-high' : 'band-high';
}

/*
 * What the last fortnight actually covered.
 *
 * Counted from sessions rather than from a plan, because in a rotation
 * there is no weekday to be behind on — the only honest question is
 * whether each group has come round often enough lately.
 */
export function coverage(sessions, types, days = 14) {
  const hits = Object.fromEntries(GROUPS.map(g => [g, 0]));
  let cardio = 0, total = 0;
  for (const s of sessions) {
    /* A session whose workout was later deleted still happened. It counts
       towards how much you trained; it simply cannot say which groups it
       covered, so it contributes to neither. */
    total++;
    const t = types.find(x => x.id === s.type);
    if (!t) continue;
    if (t.cardio || !t.groups?.length) { cardio++; continue; }
    for (const g of t.groups) if (g in hits) hits[g] += 1;
  }
  return {
    hits, cardio, total, days,
    untrained: GROUPS.filter(g => hits[g] === 0),
    thin: GROUPS.filter(g => hits[g] === 1),
  };
}
