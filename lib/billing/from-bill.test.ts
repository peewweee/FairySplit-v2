import { describe, expect, it } from "vitest";
import {
  billWindow,
  resolvedMemberDays,
  splitBill,
  toBillInput,
  trackerProblems,
} from "@/lib/billing/from-bill";
import { daysBetween, memberDaysFor, totalPersonDays } from "@/lib/billing/occupancy";
import { formatCentavos, pesosToMillicents } from "@/lib/billing/money";
import type { Bill, LogEntry, Member, Tracker } from "@/lib/data/types";

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
  logAmounts: {},
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

  it("gives everyone the identical figure for an equal split, and the grand total still reconciles exactly", () => {
    // A fridge that does not divide evenly three ways: 1 kWh/day x 31 days
    // x P10/kWh = P310.00. P310.00 / 3 = P103.33333... — no way to hand
    // three people an identical whole-centavo amount that also sums back to
    // exactly P310.00. This is the actual trade the fix makes: identical
    // beats exact-to-the-fridge, and the OVERALL bill stays exact regardless.
    const { result } = splitBill(
      bill({
        endsOn: "2026-08-31",
        rateMillicents: RATE_10_PESOS,
        appliances: [{ id: "fridge", label: "Fridge", mode: "always_on", kwhPerUnit: 1, trackerId: null }],
      }),
      members,
    );

    const fixed = result!.rows.map((r) => r.fixedCentavos);
    // All three identical — P103.33, not the P103.34/.33/.33 largestRemainder
    // would have given.
    expect(fixed).toEqual([10_333, 10_333, 10_333]);
    // Those three P103.33s sum to P309.99, one centavo LESS than the fridge's
    // real P310.00 cost — the centavo largestRemainder would have found for
    // it instead flows into the residual below, unnoticed.
    expect(fixed.reduce((a, b) => a + b, 0)).toBe(30_999);

    // The bill's grand total is still exactly right - nothing was lost, it
    // just moved into the occupancy-weighted column instead of the fridge's.
    expect(result!.rows.reduce((acc, r) => acc + r.totalCentavos, 0)).toBe(100_000);
    expect(result!.grandTotalCentavos).toBe(100_000);
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
    participantIds: [memberId],
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

const airconTracker = (entries: LogEntry[]): Tracker => ({
  id: "T-AC",
  roomId: "R1",
  name: "Air conditioner",
  mode: "clock",
  builtIn: false,
  sortOrder: 0,
  runningSince: {},
  runningWith: {},
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

describe("hand-entered amounts", () => {
  const airconBill = (over: Partial<Bill> = {}) =>
    bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")], ...over });

  it("a typed figure replaces what the log counted", () => {
    const { result } = splitBill(
      // Ana logged 2 hours, but says it was really 5.
      airconBill({ logAmounts: { "T-AC": { ANA: 5 } } }),
      members,
      [airconTracker([clockRun("ANA", 5, 10, 5, 12)])],
    );
    expect(result!.rows.find((r) => r.memberId === "ANA")!.meteredCentavos).toBe(5_000);
  });

  it("only overrides the person it names", () => {
    const { result } = splitBill(
      airconBill({ logAmounts: { "T-AC": { ANA: 5 } } }),
      members,
      [airconTracker([clockRun("ANA", 5, 10, 5, 12), clockRun("BEN", 6, 9, 6, 10)])],
    );
    // Ben keeps his logged hour.
    expect(result!.rows.find((r) => r.memberId === "BEN")!.meteredCentavos).toBe(1_000);
  });

  it("an override of zero means zero, not 'go back to the log'", () => {
    const { result } = splitBill(
      airconBill({ logAmounts: { "T-AC": { ANA: 0 } } }),
      members,
      [airconTracker([clockRun("ANA", 5, 10, 5, 12)])],
    );
    expect(result!.rows.find((r) => r.memberId === "ANA")!.meteredCentavos).toBe(0);
  });

  it("still reconciles once a figure is overridden", () => {
    const b = airconBill({ logAmounts: { "T-AC": { ANA: 5 } } });
    const { result } = splitBill(b, members, [
      airconTracker([clockRun("ANA", 5, 10, 5, 12)]),
    ]);
    expect(result!.rows.reduce((acc, r) => acc + r.totalCentavos, 0)).toBe(b.totalCentavos);
  });
});

describe("occupancy counted from the clock", () => {
  const clock = (entries: ReturnType<typeof clockRun>[]): Tracker => ({
    ...airconTracker(entries),
    id: "T-HOURS",
    name: "Hours in the unit",
    builtIn: true,
  });

  it("falls back to the occupancy clock when no hours are stored", () => {
    // 48 hours inside the bill's dates = 2 days.
    const days = resolvedMemberDays(
      bill({ memberHours: {} }),
      members,
      [clock([clockRun("ANA", 5, 0, 7, 0)])],
    );
    expect(days.find((d) => d.id === "ANA")!.days).toBe(2);
  });

  it("a stored figure still wins over the clock", () => {
    const days = resolvedMemberDays(
      bill({ memberHours: { ANA: 240 } }),
      members,
      [clock([clockRun("ANA", 5, 0, 7, 0)])],
    );
    expect(days.find((d) => d.id === "ANA")!.days).toBe(10);
  });

  it("is zero for a room whose clock has never run", () => {
    const days = resolvedMemberDays(bill({ memberHours: {} }), members, [clock([])]);
    expect(days.every((d) => d.days === 0)).toBe(true);
  });
});

describe("a log entry shared between people", () => {
  it("charges each of them their share, and the bill still reconciles", () => {
    const b = bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] });
    const shared = {
      id: "shared-1",
      participantIds: ["ANA", "BEN"],
      quantity: 4,
      startedAt: null,
      endedAt: null,
      createdAt: inst(5, 10),
    };
    const { result } = splitBill(b, members, [airconTracker([shared])]);

    // 4 hours between two people is 2 each: 2 x 1 kWh x P10 = P20.
    expect(result!.rows.find((r) => r.memberId === "ANA")!.meteredCentavos).toBe(2_000);
    expect(result!.rows.find((r) => r.memberId === "BEN")!.meteredCentavos).toBe(2_000);
    expect(result!.rows.find((r) => r.memberId === "CY")!.meteredCentavos).toBe(0);
    expect(result!.rows.reduce((acc, r) => acc + r.totalCentavos, 0)).toBe(b.totalCentavos);
  });

  it("costs the same in total however many names are on it", () => {
    const b = bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] });
    const entry = (participantIds: string[]) => ({
      id: "e",
      participantIds,
      quantity: 6,
      startedAt: null,
      endedAt: null,
      createdAt: inst(5, 10),
    });
    const metered = (ids: string[]) =>
      splitBill(b, members, [airconTracker([entry(ids)])]).result!.rows.reduce(
        (acc, r) => acc + r.meteredCentavos,
        0,
      );
    // 6 hours is 6 hours whether one person or three are charged for it.
    expect(metered(["ANA"])).toBe(metered(["ANA", "BEN", "CY"]));
  });
});

/* -- two people who each clocked in separately, at overlapping times ------ *
 * Nobody ticked the other's name when they clocked in - they just happened
 * to both be running the aircon for part of the same stretch. This is the
 * case decomposeOverlaps exists for: the overlap is found from the clock
 * data itself, not from anyone remembering to share the entry up front.
 * ------------------------------------------------------------------------- */

describe("clocked usage that overlaps between people", () => {
  it("splits the shared hour, leaves the rest solo, and does not double-bill it", () => {
    const b = bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] });
    const { result } = splitBill(b, members, [
      // ANA 2-4pm, BEN 3-5pm: they share 3-4pm.
      airconTracker([clockRun("ANA", 5, 14, 5, 16), clockRun("BEN", 5, 15, 5, 17)]),
    ]);

    // ANA: 1 solo hour + half of the shared hour = 1.5h x 1kWh x P10 = P15.
    expect(result!.rows.find((r) => r.memberId === "ANA")!.meteredCentavos).toBe(1_500);
    // BEN: the same, symmetrically.
    expect(result!.rows.find((r) => r.memberId === "BEN")!.meteredCentavos).toBe(1_500);
    // The household used 3 hours of aircon, not 4 - the old solo-only path
    // would have billed P40 (2h + 2h, each at full price); this bills P30.
    const meteredTotal = result!.rows.reduce((acc, r) => acc + r.meteredCentavos, 0);
    expect(meteredTotal).toBe(3_000);
    expect(result!.rows.reduce((acc, r) => acc + r.totalCentavos, 0)).toBe(b.totalCentavos);
  });

  it("shares a three-way overlap between everyone who was in it at that moment", () => {
    const b = bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] });
    const { result } = splitBill(b, members, [
      airconTracker([
        clockRun("ANA", 5, 13, 5, 16), // 1-4pm
        clockRun("BEN", 5, 14, 5, 17), // 2-5pm
        clockRun("CY", 5, 15, 5, 16), // 3-4pm only
      ]),
    ]);
    // ANA: solo 1-2pm (1h) + ANA&BEN 2-3pm (0.5h) + all three 3-4pm (1/3 h).
    const ana = result!.rows.find((r) => r.memberId === "ANA")!.meteredCentavos;
    const ben = result!.rows.find((r) => r.memberId === "BEN")!.meteredCentavos;
    const cy = result!.rows.find((r) => r.memberId === "CY")!.meteredCentavos;
    // CY was only ever in the fully-shared slice: a third of one hour.
    expect(cy).toBe(Math.round(((1 / 3) * 1 * 10) * 100));
    // Whatever the exact split, it still reconciles to the billed total.
    expect(ana + ben + cy).toBeGreaterThan(0);
    expect(result!.rows.reduce((acc, r) => acc + r.totalCentavos, 0)).toBe(b.totalCentavos);
  });

  it("an override pulls that person out of the overlap entirely, leaving the other person's share solo", () => {
    const b = bill({
      rateMillicents: RATE_10_PESOS,
      appliances: [aircon("T-AC")],
      // ANA disagrees with the clock for this log; BEN does not.
      logAmounts: { "T-AC": { ANA: 3 } },
    });
    const { result } = splitBill(b, members, [
      airconTracker([clockRun("ANA", 5, 14, 5, 16), clockRun("BEN", 5, 15, 5, 17)]),
    ]);
    // ANA: her own typed figure, full price, not shared with anyone.
    expect(result!.rows.find((r) => r.memberId === "ANA")!.meteredCentavos).toBe(3_000);
    // BEN: with ANA pulled out, his whole 3-5pm run is solo - 2 full hours,
    // not half of an hour he now has no one to share with.
    expect(result!.rows.find((r) => r.memberId === "BEN")!.meteredCentavos).toBe(2_000);
    expect(result!.rows.reduce((acc, r) => acc + r.totalCentavos, 0)).toBe(b.totalCentavos);
  });

  it("touching runs that do not actually overlap stay solo, same as before", () => {
    const b = bill({ rateMillicents: RATE_10_PESOS, appliances: [aircon("T-AC")] });
    const { result } = splitBill(b, members, [
      // ANA's run ends exactly when BEN's starts - never in it together.
      airconTracker([clockRun("ANA", 5, 14, 5, 16), clockRun("BEN", 5, 16, 5, 18)]),
    ]);
    expect(result!.rows.find((r) => r.memberId === "ANA")!.meteredCentavos).toBe(2_000);
    expect(result!.rows.find((r) => r.memberId === "BEN")!.meteredCentavos).toBe(2_000);
  });
});
