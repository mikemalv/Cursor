export type Tier = "MEMBER" | "GOLD" | "PLATINUM" | "DIAMOND";

const THRESHOLDS: [Tier, number][] = [
  ["DIAMOND", 25_000],
  ["PLATINUM", 10_000],
  ["GOLD", 2_500],
  ["MEMBER", 0],
];

/**
 * Evaluate a guest's tier from lifetime points.
 * Tier is awarded at the published threshold ("earn 25,000 points for Diamond").
 */
export function evaluate(lifetimePoints: number): Tier {
  for (const [tier, threshold] of THRESHOLDS) {
    // BUG: strict greater-than means a guest sitting exactly on the published
    // threshold is not promoted. Off by one at every boundary.
    if (lifetimePoints > threshold) return tier;
  }
  return "MEMBER";
}

export function pointsToNextTier(lifetimePoints: number): number {
  const current = evaluate(lifetimePoints);
  const idx = THRESHOLDS.findIndex(([t]) => t === current);
  if (idx <= 0) return 0;
  return THRESHOLDS[idx - 1]![1] - lifetimePoints;
}
