import { applyRoundUp, computeBill, type BillInput, type BillResult } from "@/lib/billing/engine";
import { coverageDays, memberDaysFor } from "@/lib/billing/occupancy";
import type { Bill, Member } from "@/lib/data/types";

/**
 * The one adapter between stored records and the pure engine.
 *
 * Everything the engine needs is assembled here - including step 0's round-up,
 * because `BillInput.billedCentavos` is defined as the total AFTER rounding.
 * A bill is self-contained, so this takes no other record.
 */
export function toBillInput(bill: Bill, members: Member[]): BillInput {
  return {
    billedCentavos: applyRoundUp(bill.totalCentavos, bill.roundUpToPeso),
    rateMillicents: bill.rateMillicents,
    daysCovered: coverageDays(bill),
    members: memberDaysFor(bill, members),
    appliances: bill.appliances,
    uses: bill.uses,
    otherCharges: bill.otherCharges,
  };
}

export interface SplitOutcome {
  result: BillResult | null;
  /** Set when the stored data violates an engine invariant. */
  problem: string | null;
}

/**
 * Compute a split without letting a bad record blank the screen (10.2).
 *
 * A throw from the engine means a form let bad data through - the UI should say
 * so loudly and point at the fix, not render an empty page or a wrong number.
 */
export function splitBill(bill: Bill, members: Member[]): SplitOutcome {
  if (members.length === 0) {
    return { result: null, problem: "Add at least one person to this room first." };
  }
  try {
    return { result: computeBill(toBillInput(bill, members)), problem: null };
  } catch (error: unknown) {
    return {
      result: null,
      problem: error instanceof Error ? error.message : "This bill can't be calculated yet.",
    };
  }
}
