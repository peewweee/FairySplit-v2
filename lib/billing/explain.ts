import { formatCentavos, kwhToCentavos, millicentsToPesoString } from "@/lib/billing/money";
import type { BillAppliance } from "@/lib/data/types";

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * One line of words for what a person's logged usage cost them on a bill.
 *
 * `bound` is every appliance charged from the log: more than one can be (a TV and a lamp on the
 * same living-room hours), and then the person's cost is the SUM of what each one came to, so
 * the line multiplies by their kWh added together and says which they are.
 *
 * `amount` is every unit this person logged and `cost` is what they actually owe. Those agree
 * exactly UNLESS some of it was shared with someone else, either because two people clocked in
 * for an overlapping stretch (see `decomposeOverlaps`) or because an amount split between several
 * people did not divide into a round number (see `equalShare`, which gives everyone the same
 * figure rather than the exact fraction). Either way the plain multiplication is only honest when
 * it matches the real figure; otherwise it would assert an equation that is not true, so the line
 * is worded as an explanation instead.
 */
export function applianceFormula(
  amount: number,
  bound: Pick<BillAppliance, "label" | "kwhPerUnit">[],
  rate: number | null,
  plural: string,
  cost: number,
): string {
  if (rate === null) return "This bill has no rate, so logged usage costs nothing.";

  const unpriced = bound.find((a) => a.kwhPerUnit === null || a.kwhPerUnit === undefined);
  if (unpriced) {
    return `"${unpriced.label}" has no kWh figure yet, so there is nothing to price this against.`;
  }

  const kwhs = bound.map((a) => a.kwhPerUnit as number);
  const straightforward = kwhs.reduce((sum, kwh) => sum + kwhToCentavos(amount * kwh, rate), 0);
  if (straightforward === cost) {
    const kwhText =
      bound.length === 1
        ? `${kwhs[0]} kWh`
        : `${round4(kwhs.reduce((a, b) => a + b, 0))} kWh (${bound
            .map((a, i) => `${a.label} ${kwhs[i]}`)
            .join(" + ")})`;
    return (
      `${round2(amount)} ${plural} × ${kwhText} × ₱${millicentsToPesoString(rate)}/kWh ` +
      `= ${formatCentavos(cost)}.`
    );
  }
  return (
    `${round2(amount)} ${plural} logged, but some of that was shared with someone else. ` +
    `Your share of it: ${formatCentavos(cost)}.`
  );
}
