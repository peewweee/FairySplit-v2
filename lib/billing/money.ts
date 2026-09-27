import type { Centavos, Millicents } from "@/lib/data/types";

/**
 * The only place in the codebase that divides money or converts kWh (section 6).
 *
 * Money is integer centavos everywhere else. Rates are millicents: 1/1000 of a
 * centavo, so a peso rate is `pesos x 100 x 1000`. PHP 14.86/kWh is 1_486_000,
 * and `kwhToCentavos(1, 1_486_000)` gives back 1486 centavos - PHP 14.86.
 * An off-by-10x here is invisible in review and wrong by an order of magnitude
 * on the bill, so it is pinned by `money.test.ts`.
 */

export const CENTAVOS_PER_PESO = 100;
export const MILLICENTS_PER_CENTAVO = 1_000;
export const MILLICENTS_PER_PESO = CENTAVOS_PER_PESO * MILLICENTS_PER_CENTAVO; // 100_000

export const kwhToCentavos = (kwh: number, rate: Millicents): Centavos =>
  Math.round((kwh * rate) / MILLICENTS_PER_CENTAVO);

export const formatCentavos = (c: Centavos): string =>
  "₱" + (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Pesos the user typed -> integer centavos. `19.99 * 100` is 1998.99999... */
export const pesosToCentavos = (pesos: number): Centavos =>
  Math.round(pesos * CENTAVOS_PER_PESO);

export const centavosToPesos = (c: Centavos): number => c / CENTAVOS_PER_PESO;

/** A peso-per-kWh rate the user typed -> millicents. */
export const pesosToMillicents = (pesos: number): Millicents =>
  Math.round(pesos * MILLICENTS_PER_PESO);

export const millicentsToPesos = (m: Millicents): number => m / MILLICENTS_PER_PESO;

/** For putting a stored rate back into a text input the user can edit. */
export const millicentsToPesoString = (m: Millicents): string =>
  String(millicentsToPesos(m));

/**
 * Split `total` across `weights`, guaranteeing the parts sum to exactly `total`.
 * Floor every share, then hand the leftover centavos one at a time to the
 * largest fractional parts. The `ids` tie-break keeps it deterministic —
 * without it, equal splits hand the spare centavo to a different person on
 * every render.
 */
export function largestRemainder(
  total: Centavos,
  weights: number[],
  ids: string[],
): Centavos[] {
  const sum = weights.reduce((a, b) => a + b, 0);

  if (sum === 0) {
    const base = Math.floor(total / weights.length);
    const out = weights.map(() => base);
    const left = total - base * weights.length;
    const order = ids.map((id, i) => ({ i, id })).sort((a, b) => a.id.localeCompare(b.id));
    for (let k = 0; k < left && k < order.length; k++) out[order[k].i]++;
    return out;
  }

  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  const left = total - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v), id: ids[i] }))
    .sort((a, b) => b.frac - a.frac || a.id.localeCompare(b.id));
  // The `k < order.length` guard only matters if floating point ever left more
  // than one spare centavo per share; the engine's step 7 assert is the real
  // backstop, and this keeps the failure legible instead of an undefined read.
  for (let k = 0; k < left && k < order.length; k++) out[order[k].i]++;
  return out;
}

/**
 * Split `total` into `count` IDENTICAL shares — what a spreadsheet's
 * `=total/count` cell shows once it is formatted as money, and what
 * `largestRemainder` deliberately does NOT do: give everyone the same
 * number rather than guarantee the parts sum back to `total` exactly.
 *
 * That trade is only safe where nothing downstream needs the sum to be
 * exact. It is: the engine's steps 1-3 (always-on, metered, other charges)
 * feed straight into "whatever's left over" for step 4's residual, so a
 * centavo this rounds away here reappears there automatically — the bill's
 * grand total (step 7's assert) is unaffected regardless of how these three
 * are split internally. Nothing else may use this: `largestRemainder`
 * is what steps 5 and 6 still use, because a scaled-down carve-out or an
 * occupancy-weighted share has nowhere further to hand a leftover centavo.
 */
export function equalShare(total: Centavos, count: number): Centavos[] {
  return new Array(count).fill(Math.round(total / count));
}
