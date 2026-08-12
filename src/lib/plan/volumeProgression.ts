/**
 * Weekly volume ramp: how total km moves from where the athlete is now to
 * where the plan needs them to peak, and back down for the race.
 *
 * Two numbers from the evidence base bound this, and they disagree in an
 * important way — a 10%/week step is *convention* (NATA itself grades it
 * "consensus, not strong evidence"; a GRONORUN randomized trial found no
 * injury difference at all between 10%/week and ~24%/week). What the data
 * actually flags as risky is a jump over 30% in any 2-week window (Nielsen
 * et al., a prospective cohort). So: use 10%/week as the default step
 * (nothing wrong with being conservative), but the number this module
 * refuses to cross is the 30%-per-2-weeks ceiling, because that one has an
 * actual signal behind it.
 */

const WEEKLY_STEP = 1.1; // +10%/week default — convention, see `nata-10-percent-grade-c`
const TWO_WEEK_CEILING = 1.3; // hard limit — see `nielsen-30-percent-2-weeks`
const TAPER_FRACTIONS = [0.75, 0.5]; // last 2 weeks: ~25% then ~50% cut off peak, within the 41–60% cumulative range — see `taper-2-weeks-exponential`

/**
 * What an active pain check-in does to the ramp: an immediate cut to the
 * starting volume, then a run of weeks held flat before normal stepping (and
 * the ceiling above) resumes. Unlike `WEEKLY_STEP`/`TWO_WEEK_CEILING`, these
 * two numbers aren't graded against a specific study — they're a
 * conservative product default for "back off, then resume gradually",
 * consistent with the general overtraining-consensus principle (see
 * `ecss-acsm-overtraining-consensus`) that pushing through a red flag
 * instead of backing off is the actual risk, not a claim about exact
 * percentages or week counts for any specific injury.
 */
export const PAIN_VOLUME_ADJUSTMENT: Record<"leve" | "moderada" | "forte", { factor: number; holdWeeks: number }> = {
  leve: { factor: 1, holdWeeks: 1 },
  moderada: { factor: 0.85, holdWeeks: 2 },
  forte: { factor: 0.7, holdWeeks: 3 },
};

export interface VolumeRampWeek {
  weekIndex: number;
  km: number;
  isTaper: boolean;
}

/**
 * Builds one km figure per week. `totalWeeks` includes the taper weeks at
 * the end. Volume ramps from `startKm`, capped by the 2-week ceiling, until
 * either it plateaus naturally (the ceiling binds every week) or the ramp
 * weeks run out — then holds flat until the taper begins. `holdWeeks` freezes
 * the ramp at `startKm` for that many weeks *before* stepping resumes — how
 * an active pain check-in re-enters the ramp (see `PAIN_VOLUME_ADJUSTMENT`),
 * separate from the plateau above since this hold is unconditional, not a
 * side effect of the ceiling binding.
 */
export function buildVolumeRamp(
  startKm: number,
  totalWeeks: number,
  taperWeeks = 2,
  holdWeeks = 0,
): VolumeRampWeek[] {
  const rampWeeks = Math.max(0, totalWeeks - taperWeeks);
  const weeks: number[] = [];

  for (let i = 0; i < rampWeeks; i++) {
    if (i === 0 || i <= holdWeeks) {
      weeks.push(startKm);
      continue;
    }
    const uncapped = weeks[i - 1] * WEEKLY_STEP;
    // The 2-week-back figure is what actually bounds this week, per Nielsen.
    const twoWeeksAgo = weeks[i - 2] ?? weeks[i - 1];
    const capped = Math.min(uncapped, twoWeeksAgo * TWO_WEEK_CEILING);
    weeks.push(capped);
  }

  const peak = weeks[weeks.length - 1] ?? startKm;
  const taper = TAPER_FRACTIONS.slice(0, taperWeeks).map((fraction) => peak * fraction);
  // If a plan is shorter than the taper table, taper still gets its own weeks — building volume and tapering in the same week isn't a real option.
  while (taper.length < taperWeeks) taper.push(peak * 0.5);

  return [
    ...weeks.map((km, i) => ({ weekIndex: i, km: Math.round(km * 10) / 10, isTaper: false })),
    ...taper.map((km, i) => ({
      weekIndex: rampWeeks + i,
      km: Math.round(km * 10) / 10,
      isTaper: true,
    })),
  ];
}
