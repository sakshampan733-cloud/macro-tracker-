/*
 * What a workout is for.
 *
 * A training log that only records that you went is a diary, not a tool.
 * The question worth answering is whether the week you trained matches the
 * week you meant to train — which needs the app to know what each session
 * actually does, so it can notice that you have hit chest three times and
 * legs never.
 *
 * So each type carries the muscle groups it works and the quality it
 * builds. Those are what the adherence check reads; the prose is for the
 * person deciding what to put in the empty Thursday slot.
 */

export const QUALITIES = {
  strength:   'Maximal force. Heavy, low reps, long rests.',
  hypertrophy:'Muscle size. Moderate loads, moderate reps, close to failure.',
  endurance:  'Sustained output. Long, repeatable, aerobic.',
  power:      'Force applied fast. Explosive, fully rested.',
  mobility:   'Range of motion and tissue quality.',
  conditioning:'Work capacity. Short rests, high heart rate.',
};

/* Groups are deliberately coarse. "Anterior deltoid" is not a distinction
   anyone makes when looking at their week; "did I train legs" is. */
export const GROUPS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full body'];

export const WORKOUTS = {
  push: {
    name: 'Push', groups: ['chest', 'shoulders', 'arms'], quality: 'hypertrophy',
    why: 'Chest, shoulders and triceps share the same pressing pattern, so training '
       + 'them together means each one is fresh when it matters and fully recovered '
       + 'before its next turn.',
    how: 'Press first while you are strong — bench or overhead — then the isolation '
       + 'work. 10 to 20 hard sets across the session.',
  },
  pull: {
    name: 'Pull', groups: ['back', 'arms'], quality: 'hypertrophy',
    why: 'Back and biceps both pull. Pairing them stops your arms being the fresh '
       + 'limiting factor on rows the day after a heavy curl session.',
    how: 'One vertical pull and one horizontal pull, then arms. Rows and chin-ups '
       + 'train different things — most weeks want both.',
  },
  legs: {
    name: 'Legs', groups: ['legs', 'core'], quality: 'hypertrophy',
    why: 'The largest muscles you have, and the ones most often skipped. They also '
       + 'drive most of the metabolic effect of training.',
    how: 'A squat pattern and a hinge pattern are not interchangeable — the first '
       + 'builds quads, the second hamstrings and glutes. Most weeks want both.',
  },
  upper: {
    name: 'Upper body', groups: ['chest', 'back', 'shoulders', 'arms'], quality: 'hypertrophy',
    why: 'Everything above the waist in one session. Fits a four-day week where '
       + 'push/pull/legs would need six.',
    how: 'Alternate a push and a pull so one recovers while the other works.',
  },
  lower: {
    name: 'Lower body', groups: ['legs', 'core'], quality: 'strength',
    why: 'The partner to an upper day. Heavier and lower-rep than a hypertrophy '
       + 'leg day, which is why the two are listed separately.',
    how: 'Squat or deadlift first, rested. Accessories after.',
  },
  fullbody: {
    name: 'Full body', groups: ['full body'], quality: 'hypertrophy',
    why: 'Everything hit every session. The most efficient split for two or three '
       + 'days a week, because each muscle still gets trained twice.',
    how: 'One push, one pull, one leg movement, then whatever time allows.',
  },
  run: {
    name: 'Run', groups: ['legs'], quality: 'endurance',
    why: 'Aerobic base. Raises the ceiling on how much training you can recover from, '
       + 'which is what limits progress once technique is not the problem.',
    how: 'Most of it easy enough to hold a conversation. The hard days only work '
       + 'because the easy days were easy.',
  },
  cycle: {
    name: 'Cycle', groups: ['legs'], quality: 'endurance',
    why: 'Aerobic work with far less impact than running, so it costs less recovery '
       + 'and interferes less with leg training.',
    how: 'Duration over intensity for base work.',
  },
  swim: {
    name: 'Swim', groups: ['full body'], quality: 'endurance',
    why: 'Aerobic work with no impact at all, and the only common cardio that loads '
       + 'the upper body.',
    how: 'Technique limits most people long before fitness does.',
  },
  hiit: {
    name: 'Intervals', groups: ['full body'], quality: 'conditioning',
    why: 'Work capacity in the least time. Also the most expensive session you can '
       + 'do in recovery terms — this is the one to move when recovery is red.',
    how: 'Hard enough that the rest is genuinely needed. Twice a week is plenty '
       + 'alongside lifting.',
  },
  sport: {
    name: 'Sport', groups: ['full body'], quality: 'conditioning',
    why: 'Unstructured effort, usually harder than it feels at the time.',
    how: 'Worth logging even when it was not training, because your body does not '
       + 'know the difference.',
  },
  mobility: {
    name: 'Mobility', groups: ['full body'], quality: 'mobility',
    why: 'Range of motion, and the sessions that make the hard ones possible.',
    how: 'Little and often beats one long session a week.',
  },
  rest: {
    name: 'Rest', groups: [], quality: null,
    why: 'Training is the stimulus; rest is where the adaptation happens. A rest day '
       + 'on the plan is a session, not an absence.',
    how: 'Deliberately scheduled, so a missed session and a rest day never look the same.',
  },
};

export const WORKOUT_LIST = Object.entries(WORKOUTS)
  .map(([id, w]) => ({ id, ...w }));

/*
 * How a week's plan spreads across the muscle groups.
 *
 * Counts sessions, not sets — the app cannot know your sets and should not
 * pretend to. Twice a week per group is the coarse threshold most training
 * research settles on for growth, and one is enough to hold what you have.
 */
export function weekBalance(planIds) {
  const hits = Object.fromEntries(GROUPS.map(g => [g, 0]));
  for (const id of planIds) {
    const w = WORKOUTS[id];
    if (!w) continue;
    if (w.groups.includes('full body')) {
      for (const g of GROUPS) if (g !== 'full body') hits[g] += 1;
      hits['full body'] += 1;
    } else for (const g of w.groups) hits[g] += 1;
  }
  const named = GROUPS.filter(g => g !== 'full body');
  return {
    hits,
    untrained: named.filter(g => hits[g] === 0),
    thin: named.filter(g => hits[g] === 1),
    sessions: planIds.filter(id => id && id !== 'rest').length,
  };
}
