import { describe, expect, it } from "vitest";
import { splitBill, toBillInput } from "@/lib/billing/from-bill";
import { daysBetween, memberDaysFor, totalPersonDays } from "@/lib/billing/occupancy";
import { formatCentavos, pesosToMillicents } from "@/lib/billing/money";
import type { Bill, Member } from "@/lib/data/types";

const members: Member[] = [
  { id: "ANA", name: "Ana" },
  { id: "BEN", name: "Ben" },
  { id: "CY", name: "Cy" },
];

/** A bill is self-contained: it carries its own coverage and day counts. */
const bill = (over: Partial<Bill> = {}): Bill => ({
  id: "B1",
  roomId: "R1",
  kind: "electricity",
  name: "Electricity",
  totalCentavos: 100_000,
  roundUpToPeso: false,
  rateMillicents: null,
  dueOn: null,
  startsOn: "2026-08-01",
  endsOn: "2026-08-30",
  memberHours: { ANA: 480, BEN: 240, CY: 0 },
  appliances: [],
  uses: [],
  otherCharges: [],
  paidMemberIds: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

describe("occupancy (section 12: one function supplies member days)", () => {
  it("turns the bill's logged hours into the days the split is weighted by", () => {
    expect(memberDaysFor(bill(), members)).toEqual([
      { id: "ANA", days: 20 },
      { id: "BEN", days: 10 },
      { id: "CY", days: 0 },
    ]);
  });

  it("gives every member a null slot when the bill doesn't know them yet", () => {
    expect(memberDaysFor(bill({ memberHours: {} }), members)).toEqual([
      { id: "ANA", days: null },
      { id: "BEN", days: null },
      { id: "CY", days: null },
    ]);
    expect(memberDaysFor(null, members).every((d) => d.days === null)).toBe(true);
  });

  it("totals person-days for the per-day display", () => {
    expect(totalPersonDays(memberDaysFor(bill(), members))).toBe(30);
  });

  it("suggests an inclusive day count from a date range", () => {
    expect(daysBetween("2026-08-01", "2026-08-30")).toBe(30);
    expect(daysBetween("2026-02-01", "2026-02-28")).toBe(28);
    expect(daysBetween("2026-08-01", "2026-08-01")).toBe(1);
    expect(daysBetween("2026-08-30", "2026-08-01")).toBeNull();
    expect(daysBetween("2026-08-01", null)).toBeNull();
  });
});

describe("toBillInput", () => {
  it("applies step 0's round-up before the engine sees the total", () => {
    expect(
      toBillInput(bill({ totalCentavos: 178_374, roundUpToPeso: true }), members).billedCentavos,
    ).toBe(178_400);
    expect(
      toBillInput(bill({ totalCentavos: 178_374, roundUpToPeso: false }), members).billedCentavos,
    ).toBe(178_374);
  });

  it("carries the bill's own day count through for always-on costing", () => {
    expect(toBillInput(bill({ endsOn: "2026-08-31" }), members).daysCovered).toBe(31);
    expect(toBillInput(bill({ endsOn: null }), members).daysCovered).toBeNull();
  });
});

describe("splitBill", () => {
  it("renders the L2 ladder row from a stored bill", () => {
    const { result, problem } = splitBill(bill(), members);
    expect(problem).toBeNull();
    expect(result!.rows.map((r) => formatCentavos(r.totalCentavos))).toEqual([
      "₱666.67",
      "₱333.33",
      "₱0.00",
    ]);
  });

  it("renders the L4 ladder row from a stored bill", () => {
    const { result } = splitBill(
      bill({
        rateMillicents: pesosToMillicents(10),
        appliances: [
          { id: "fridge", label: "Fridge", mode: "always_on", kwhPerUnit: 1 },
          { id: "aircon", label: "Aircon", mode: "per_hour", kwhPerUnit: 0.5 },
        ],
        uses: [
          {
            id: "u1",
            applianceId: "aircon",
            quantity: 4,
            participantIds: ["ANA", "BEN"],
            occurredOn: null,
            note: null,
          },
          {
            id: "u2",
            applianceId: "aircon",
            quantity: 2,
            participantIds: ["CY"],
            occurredOn: null,
            note: null,
          },
        ],
      }),
      members,
    );
    expect(result!.rows.map((r) => formatCentavos(r.totalCentavos))).toEqual([
      "₱556.67",
      "₱333.33",
      "₱110.00",
    ]);
  });

  it("reports a problem instead of throwing into a render", () => {
    const broken = splitBill(
      bill({
        rateMillicents: pesosToMillicents(10),
        endsOn: null,
        appliances: [{ id: "fridge", label: "Fridge", mode: "always_on", kwhPerUnit: 1 }],
      }),
      members,
    );
    expect(broken.result).toBeNull();
    expect(broken.problem).toMatch(/dates/i);

    const empty = splitBill(bill(), []);
    expect(empty.result).toBeNull();
    expect(empty.problem).toMatch(/person/i);
  });

  it("splits two bills in one room independently, each on its own days", () => {
    const power = splitBill(bill({ memberHours: { ANA: 480, BEN: 240, CY: 0 } }), members);
    const water = splitBill(
      bill({ id: "B2", name: "Water", totalCentavos: 45_000, memberHours: { ANA: 624, BEN: 48, CY: 336 } }),
      members,
    );
    expect(power.result!.grandTotalCentavos).toBe(100_000);
    expect(water.result!.grandTotalCentavos).toBe(45_000);
    // Different coverage, different weights - no shared period to couple them.
    expect(power.result!.rows[0].days).toBe(20);
    expect(water.result!.rows[0].days).toBe(26);
  });
});
