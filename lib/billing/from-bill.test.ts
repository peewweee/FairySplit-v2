import { describe, expect, it } from "vitest";
import { billWindow, splitBill, toBillInput, trackerProblems } from "@/lib/billing/from-bill";
import { daysBetween, memberDaysFor, totalPersonDays } from "@/lib/billing/occupancy";
import { formatCentavos, pesosToMillicents } from "@/lib/billing/money";
import type { Bill, Member, Tracker } from "@/lib/data/types";

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
      toBillInput(bill({ totalCentavos: 178_374, roundUpToPeso: true }), members, []).billedCentavos,
    ).toBe(178_400);
    expect(
      toBillInput(bill({ totalCentavos: 178_374, roundUpToPeso: false }), members, []).billedCentavos,
    ).toBe(178_374);
  });

  it("carries the bill's own day count through for always-on costing", () => {
    expect(toBillInput(bill({ endsOn: "2026-08-31" }), members, []).daysCovered).toBe(31);
    expect(toBillInput(bill({ endsOn: null }), members, []).daysCovered).toBeNull();
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
          { id: "fridge", label: "Fridge", mode: "always_on", kwhPerUnit: 1, trackerId: null },
          { id: "aircon", label: "Aircon", mode: "per_hour", kwhPerUnit: 0.5, trackerId: null },
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
        appliances: [{ id: "fridge", label: "Fridge", mode: "always_on", kwhPerUnit: 1, trackerId: null }],
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

/* -- charged from a log --------------------------------------------------- *
 * "How is it charged?" answers with either "Equally" or the name of a log.
 * When it names one, these are the rules that turn logged hours into pesos.
 * Local-date constructors throughout, so the window maths is timezone-proof.
 * ------------------------------------------------------------------------- */

const RATE_10_PESOS = pesosToMillicents(10);

/** A local instant in August 2026. */
const inst = (day: number, hour: number, minute = 0) =>
  new Date(2026, 7, day, hour, minute, 0).toISOString();

function clockRun(memberId: string, fromDay: number, fromHour: number, toDay: number, toHour: number) {
  const startedAt = inst(fromDay, fromHour);
  const endedAt = inst(toDay, toHour);
  return {
    id: `run-${memberId}-${fromDay}-${fromHour}`,
    memberId,
    quantity: (Date.parse(endedAt) - Date.parse(startedAt)) / 3_600_000,
    startedAt,
    endedAt,
    createdAt: endedAt,
  };
}

const aircon = (trackerId: string | null) => ({
  id: "aircon",
  label: "Aircon",
  mode: "per_hour" as const,
  kwhPerUnit: 1,
  trackerId,
});

const airconTracker = (entries: ReturnType<typeof clockRun>[]): Tracker => ({
  id: "T-AC",
  roomId: "R1",
  name: "Air conditioner",
  mode: "clock",
  builtIn: false,
  sortOrder: 0,
  runningSince: {},
  entries,
  createdAt: "2026-08-01T00:00:00.000Z",
});

describe("billWindow", () => {
  it("runs from the first local midnight to the one after the last day", () => {
    const w = billWindow(bill())!;
    expect(w.start).toBe(new Date(2026, 7, 1).getTime());
    // endsOn is INCLUSIVE, so a bill to the 30th covers all of the 30th.
    expect(w.end).toBe(new Date(2026, 7, 31).getTime());
  });

  it("is null when the bill has no dates to attribute against", () => {
    expect(billWindow(bill({ endsOn: null }))).toBeNull();
  });
});

describe("usage taken from a log", () => {
  it("turns each person's logged hours into one solo use", () => {
    const input = toBillInput(
      bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] }),
      members,
      [airconTracker([clockRun("ANA", 5, 10, 5, 12), clockRun("BEN", 6, 9, 6, 10)])],
    );
    expect(input.uses).toEqual([
      expect.objectContaining({ applianceId: "aircon", quantity: 2, participantIds: ["ANA"] }),
      expect.objectContaining({ applianceId: "aircon", quantity: 1, participantIds: ["BEN"] }),
    ]);
  });

  it("prices those hours onto the person who logged them", () => {
    const { result } = splitBill(
      bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] }),
      members,
      [airconTracker([clockRun("ANA", 5, 10, 5, 12)])],
    );
    // 2 hours x 1 kWh x P10 = P20, all of it Ana's.
    const ana = result!.rows.find((r) => r.memberId === "ANA")!;
    expect(ana.meteredCentavos).toBe(2_000);
    expect(result!.rows.find((r) => r.memberId === "BEN")!.meteredCentavos).toBe(0);
  });

  it("leaves hours logged outside the bill's dates for another bill", () => {
    const { result } = splitBill(
      bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] }),
      members,
      // The bill covers Aug 1-30; this run is on the 31st.
      [airconTracker([clockRun("ANA", 31, 10, 31, 12)])],
    );
    expect(result!.rows.find((r) => r.memberId === "ANA")!.meteredCentavos).toBe(0);
  });

  it("counts only the part of a run that falls inside the dates", () => {
    const { result } = splitBill(
      bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] }),
      members,
      // 10pm on Jul 31 to 2am on Aug 1: four hours run, two of them billable.
      [airconTracker([clockRun("ANA", 0, 22, 1, 2)])],
    );
    expect(result!.rows.find((r) => r.memberId === "ANA")!.meteredCentavos).toBe(2_000);
  });

  it("still reconciles to the billed total exactly", () => {
    const b = bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] });
    const { result } = splitBill(b, members, [
      airconTracker([clockRun("ANA", 5, 10, 5, 12), clockRun("BEN", 6, 9, 6, 10)]),
    ]);
    const summed = result!.rows.reduce((acc, r) => acc + r.totalCentavos, 0);
    expect(summed).toBe(b.totalCentavos);
    expect(formatCentavos(summed)).toBe("₱1,000.00");
  });

  it("costs nothing, and says so, when the log has been deleted", () => {
    const b = bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] });
    const { result } = splitBill(b, members, []);
    expect(result!.rows.every((r) => r.meteredCentavos === 0)).toBe(true);
    expect(trackerProblems(b, [])).toEqual([
      '"Aircon" is charged from a log that no longer exists.',
    ]);
  });

  it("attributes nothing when the bill has no dates to attribute against", () => {
    const { result } = splitBill(
      bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")], endsOn: null }),
      members,
      [airconTracker([clockRun("ANA", 5, 10, 5, 12)])],
    );
    expect(result!.rows.find((r) => r.memberId === "ANA")!.meteredCentavos).toBe(0);
  });

  it("ignores logs entirely for an appliance answering 'Equally'", () => {
    const input = toBillInput(
      bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon(null)] }),
      members,
      [airconTracker([clockRun("ANA", 5, 10, 5, 12)])],
    );
    expect(input.uses).toEqual([]);
  });
});
