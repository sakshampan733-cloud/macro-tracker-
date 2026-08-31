/*
 * How hard a session actually was.
 *
 * Three witnesses, none of them sufficient alone.
 *
 * The strap knows how much load the day carried, but not why — and its
 * numbers only mean anything against your own. A strain of ten is a hard
 * day for one person and a walk for another, which is exactly the
 * observation that prompted this: "my average is fourteen, today was ten,
 * so maybe I did not work as hard." That is the right way to read it, and
 * it is the way this reads it. Absolute thresholds were wrong.
 *
 * The set count knows the volume, but a set is a set whether it was taken
 * to failure or stopped four reps short.
 *
 * You know whether you pushed. Nothing else does.
 *
 * So each is scored where it exists, and the result says which witnesses
 * spoke. A session with no strap and no effort rating still gets an
 * honest reading from its sets; it is just a narrower one, and the tile
 * says so rather than implying three sources agreed.
 */

/* Your own strain, over the days you actually wore the strap. */
export function strainBaseline(rows, days = 28) {
  const vals = Object.values(rows || {})
    .filter(r => r.strain != null)
    .slice(-days)
    .map(r => r.strain);
  if (vals.length < 5) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  return { mean: +mean.toFixed(1), sd: +sd.toFixed(2), n: vals.length };
}

const EFFORT_SCORE = { easy: 0.3, solid: 0.6, hard: 0.85, max: 1 };

/*
 * A session's intensity, 0 to 1, and the reasoning behind it.
 *
 * Deliberately not a single opaque score. Every part that contributed is
 * returned with it, because "you trained hard" is worth nothing next to
 * "your strain was four above your average and you said you pushed".
 */
export function sessionIntensity(session, { baseline = null, plannedSets = null } = {}) {
  const parts = [];
  let sum = 0, weight = 0;

  if (session?.effort && EFFORT_SCORE[session.effort] != null) {
    const v = EFFORT_SCORE[session.effort];
    parts.push({ from: 'you', v, why: null });
    sum += v * 1.1; weight += 1.1;          /* the only direct evidence */
  }

  if (session?.sets != null && session.sets > 0) {
    /* Against the session's own plan where there is one, because twelve
       sets is a full chest day and half an upper-body day. */
    const ref = plannedSets || 16;
    const v = clamp(session.sets / (ref * 1.25));
    parts.push({ from: 'sets', v, why: plannedSets ? `${session.sets} of ${plannedSets} planned` : `${session.sets} sets` });
    sum += v; weight += 1;
  }

  if (session?.strain != null && baseline) {
    /*
     * Relative to your own normal day, not to a scale printed on a box.
     * One standard deviation above your mean is a hard day for you; the
     * same distance below is an easy one.
     */
    const z = baseline.sd > 0.2 ? (session.strain - baseline.mean) / baseline.sd : 0;
    const v = clamp(0.55 + z * 0.22);
    parts.push({
      from: 'strap', v,
      why: `strain ${session.strain.toFixed(1)} against your usual ${baseline.mean}`,
      z: +z.toFixed(2),
    });
    sum += v; weight += 1;
  }

  if (!weight) return { score: null, parts: [], sources: 0 };
  const score = clamp(sum / weight);
  return { score, parts, sources: parts.length, label: labelFor(score) };
}

const clamp = v => Math.max(0, Math.min(1, v));

function labelFor(score) {
  if (score >= 0.82) return 'very hard';
  if (score >= 0.62) return 'hard';
  if (score >= 0.4) return 'moderate';
  if (score >= 0.22) return 'light';
  return 'very light';
}

/*
 * When the witnesses disagree, and by how much.
 *
 * Two sources more than a third of the scale apart is worth a sentence.
 * Less than that is noise, and an app that comments on noise stops being
 * read.
 */
export function disagreement(intensity) {
  if (intensity.sources < 2) return null;
  const vals = intensity.parts.map(p => p.v);
  const hi = Math.max(...vals), lo = Math.min(...vals);
  if (hi - lo < 0.34) return null;
  const top = intensity.parts.find(p => p.v === hi);
  const bot = intensity.parts.find(p => p.v === lo);
  return { spread: +(hi - lo).toFixed(2), high: top.from, low: bot.from };
}
