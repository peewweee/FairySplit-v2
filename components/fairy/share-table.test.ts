import { describe, expect, it } from "vitest";
import { costColumns } from "@/components/fairy/share-table";
import type { BillResult, ShareRow } from "@/lib/billing/engine";
import type { Bill } from "@/lib/data/types";

/**
 * Regression test for a real crash: `logged()` used to close over the live
 * `columns` array, and "unlogged" gets pushed into that same array right
 * after `logged` is defined. The moment anything called `.valueOf` on the
 * "unlogged" column — which the table body does for every row, on every
 * render — `logged` would include "unlogged" in its own sum, call its
 * `valueOf`, which calls `logged` again, forever: `Maximum call stack size
 * exceeded`. Reproduced here with the simplest bill that has metered usage
 * no tracker-derived column covers, which is exactly what pushes "unlogged"
 * in the first place.
 */
describe("costColumns", () => {
  it("does not recurse when a column reads every other column's value", () => {
    const bill: Bill = {
      id: "bill-1",
      roomId: "room-1",
      kind: "electricity",
      name: "Test bill",
      totalCentavos: 50000,
      roundUpToPeso: false,
      rateMillicents: 14_860_000,
      dueOn: null,
      startsOn: "2026-01-01",
      endsOn: "2026-01-31",
      memberHours: {},
      logAmounts: {},
      appliances: [],
      uses: [],
      otherCharges: [],
      paidMemberIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const row: ShareRow = {
      memberId: "m1",
      days: 1,
      sharedCentavos: 0,
      fixedCentavos: 0,
      // Nonzero with no covering tracker column is exactly what makes
      // costColumns add the "unlogged" catch-all.
      meteredCentavos: 500,
      otherCentavos: 0,
      totalCentavos: 500,
      breakdown: {},
    };

    const result: BillResult = {
      rows: [row],
      residualCentavos: 0,
      dailyFeeCentavos: 0,
      grandTotalCentavos: 500,
      warnings: [],
    };

    const columns = costColumns(bill, [], result);
    expect(columns.map((c) => c.key)).toContain("unlogged");

    // The table body reads every column's value once per row, then the
    // footer reads it again for the total — exactly the repeated calls that
    // triggered the recursion, so call each column's valueOf twice.
    for (const column of columns) {
      expect(Number.isFinite(column.valueOf(row))).toBe(true);
      expect(Number.isFinite(column.valueOf(row))).toBe(true);
    }

    const unlogged = columns.find((c) => c.key === "unlogged");
    expect(unlogged?.valueOf(row)).toBe(500);
  });
});
