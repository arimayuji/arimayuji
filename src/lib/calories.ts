/**
 * Energy cost of a run — real physiology, not a made-up multiplier.
 *
 * The net cost of running on flat ground is close to weight- and
 * pace-independent per kilometer, at roughly 1.036 kcal/kg/km — one of the
 * more consistently replicated numbers in exercise physiology (the classic
 * reference is Léger & Mercier's review of oxygen cost of running).
 * Climbing adds real, separate cost on top of that: roughly 2 kcal/kg per
 * 100m of gain (the extra work of lifting body mass against gravity, not
 * captured by the flat-ground number at all).
 *
 * Requires a real body weight — see `RunnerProfile.weightKg`. There is no
 * fallback/default weight on purpose: a calorie count computed from a
 * guessed weight is a fabricated number wearing a real one's clothes.
 */

const KCAL_PER_KG_PER_KM = 1.036;
const KCAL_PER_KG_PER_100M_CLIMB = 2;

export function estimateCalories(
  distanceMeters: number,
  elevationGainMeters: number | null | undefined,
  weightKg: number,
): number {
  const flat = KCAL_PER_KG_PER_KM * weightKg * (distanceMeters / 1000);
  const climb = ((elevationGainMeters ?? 0) / 100) * KCAL_PER_KG_PER_100M_CLIMB * weightKg;
  return Math.round(flat + climb);
}
