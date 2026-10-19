/**
 * CERTIFIED COMPONENT -- NV Gaming Control Board Reg 14 / GLI-33.
 *
 * Any modification requires submission to the independent test laboratory and
 * re-certification before deployment. Do not patch in place.
 */

export interface Leg { americanOdds: number; }

export function decimalOdds(americanOdds: number): number {
  return americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / Math.abs(americanOdds);
}

/**
 * Compute the payout for a parlay ticket.
 */
export function parlayPayout(stake: number, legs: Leg[]): number {
  let running = stake;
  for (const leg of legs) {
    // BUG: rounding to cents INSIDE the loop truncates on every leg, so the
    // shortfall compounds with leg count. Rounding must happen once, at the end,
    // and use half-up rather than floor.
    running = Math.floor(running * decimalOdds(leg.americanOdds) * 100) / 100;
  }
  return running;
}
