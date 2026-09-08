import { applyRoundUp, computeBill, type BillInput, type BillResult } from "@/lib/billing/engine";
import { coverageDays, memberDaysFor } from "@/lib/billing/occupancy";
import { amountForMemberInRange } from "@/lib/tracking/elapsed";
import type { ApplianceUse, Bill, Member, Tracker } from "@/lib/data/types";

/**
 * The one adapter between stored records and the pure engine.
 *
 * Everything the engine needs is assembled here - including step 0's round-up,
 * because `BillInput.billedCentavos` is defined as the total AFTER rounding,
 * and including the usage that logs supply (see `usesFromTrackers`).
 */
export function toBillInput(bill: Bill, members: Member[], trackers: Tracker[]): BillInput {
  return {
    billedCentavos: applyRoundUp(bill.totalCentavos, bill.roundUpToPeso),
    rateMillicents: bill.rateMillicents,
    daysCovered: coverageDays(bill),
    members: memberDaysFor(bill, members),
    appliances: bill.appliances,
    uses: [...bill.uses, ...usesFromTrackers(bill, members, trackers)],
    otherCharges: bill.otherCharges,
  };
}

/**
 * The window a bill covers, as millisecond bounds.
 *
 * Local midnights, and the end is the midnight AFTER the last day, because
 * `endsOn` is inclusive — a bill running to the 13th covers all of the 13th.
 * Returns null for a bill with no dates, which cannot attribute anything.
 */
export function billWindow(bill: Bill): { start: number; end: number } | null {
  if (!bill.startsOn || !bill.endsOn) return null;
  const [sy, sm, sd] = bill.startsOn.split("-").map(Number);
  const [ey, em, ed] = bill.endsOn.split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return null;
  return {
    start: new Date(sy, sm - 1, sd).getTime(),
    end: new Date(ey, em - 1, ed + 1).getTime(),
  };
}

/**
 * Turn logged hours and cycles into usage this bill can be costed from.
 *
 * An appliance answers "how is it charged?" with either "equally" (trackerId
 * null, handled by the engine's step 1) or the name of a log. When it names a
 * log, the quantities come from that log's entries that fall inside the bill's
 * dates — nobody retypes what the clock already recorded.
 *
 * Each person's total becomes ONE solo use. Deliberately solo: a log is per
 * person, so there is no shared event to divide, and the engine already prices
 * a solo use as quantity x kWh x rate straight to that person.
 *
 * Anything logged outside the bill's dates belongs to a different bill and is
 * left for it. A bill with no dates attributes nothing at all rather than
 * guessing a window.
 */
export function usesFromTrackers(bill: Bill, members: Member[], trackers: Tracker[]): ApplianceUse[] {
  const bound = bill.appliances.filter((a) => a.trackerId !== null);
  if (bound.length === 0) return [];

  const window = billWindow(bill);
  if (!window) return [];

  const byId = new Map(trackers.map((t) => [t.id, t]));
  const out: ApplianceUse[] = [];

  for (const appliance of bound) {
    const tracker = byId.get(appliance.trackerId!);
    // A log that was deleted after the bill linked to it. Silently costing zero
    // would be wrong, but so would throwing - the appliance still shows on the
    // bill, and `trackerProblems` below is what tells the user about it.
    if (!tracker) continue;

    for (const member of members) {
      const quantity = amountForMemberInRange(tracker, member.id, window.start, window.end);
      if (quantity <= 0) continue;
      out.push({
        // Stable and derived, so re-rendering never renumbers a row.
        id: `tracked:${appliance.id}:${member.id}`,
        applianceId: appliance.id,
        quantity,
        participantIds: [member.id],
        occurredOn: null,
        note: null,
      });
    }
  }

  return out;
}

/** Appliances pointing at a log that is no longer in the room. */
export function trackerProblems(bill: Bill, trackers: Tracker[]): string[] {
  const ids = new Set(trackers.map((t) => t.id));
  return bill.appliances
    .filter((a) => a.trackerId !== null && !ids.has(a.trackerId))
    .map((a) => `"${a.label}" is charged from a log that no longer exists.`);
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
export function splitBill(bill: Bill, members: Member[], trackers: Tracker[] = []): SplitOutcome {
  if (members.length === 0) {
    return { result: null, problem: "Add at least one person to this room first." };
  }
  try {
    return { result: computeBill(toBillInput(bill, members, trackers)), problem: null };
  } catch (error: unknown) {
    return {
      result: null,
      problem: error instanceof Error ? error.message : "This bill can't be calculated yet.",
    };
  }
}
