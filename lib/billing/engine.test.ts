import { describe, expect, it } from "vitest";
import {
  applyRoundUp,
  computeBill,
  type BillInput,
  type BillResult,
  type ShareRow,
} from "@/lib/billing/engine";
import { formatCentavos, pesosToMillicents } from "@/lib/billing/money";
import type { ApplianceUse, BillAppliance, OtherCharge } from "@/lib/data/types";

/* ------------------------------------------------------------------------- *
 * helpers
 * ------------------------------------------------------------------------- */

const PHP_1000 = 100_000;
const RATE_10 = pesosToMillicents(10);

/** Neutral defaults; every test overrides only what it is about. */
function input(over: Partial<BillInput> = {}): BillInput {
  return {
    billedCentavos: PHP_1000,
    rateMillicents: null,
    daysCovered: null,
    members: [
      { id: "ANA", days: null },
      { id: "BEN", days: null },
      { id: "CY", days: null },
    ],
    appliances: [],
    uses: [],
    otherCharges: [],
    ...over,
  };
}

const members = (spec: Record<string, number | null>) =>
  Object.entries(spec).map(([id, days]) => ({ id, days }));

const appliance = (over: Partial<BillAppliance> & { id: string }): BillAppliance => ({
  label: over.id,
  mode: "per_hour",
  kwhPerUnit: 1,
  trackerId: null,
  ...over,
});

const use = (over: Partial<ApplianceUse> & { applianceId: string; participantIds: string[] }): ApplianceUse => ({
  id: `use-${over.applianceId}-${over.participantIds.join("+")}`,
  quantity: 1,
  occurredOn: null,
  note: null,
  ...over,
});

const charge = (over: Partial<OtherCharge> & { id: string; amountCentavos: number }): OtherCharge => ({
  label: over.id,
  participantIds: null,
  ...over,
});

const row = (result: BillResult, memberId: string): ShareRow => {
  const found = result.rows.find((r) => r.memberId === memberId);
  if (!found) throw new Error(`no row for ${memberId}`);
  return found;
};

const totals = (result: BillResult) => result.rows.map((r) => r.totalCentavos);
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** Every assertion in the ladder is written the way the brief writes it. */
const pesos = (result: BillResult, memberId: string) =>
  formatCentavos(row(result, memberId).totalCentavos);

/* ------------------------------------------------------------------------- *
 * 8.1 - the ladder
 * ------------------------------------------------------------------------- */

describe("the ladder (8.1)", () => {
  it("L1 simple: no days entered at all falls back to an equal split", () => {
    const result = computeBill(input());

    expect(pesos(result, "ANA")).toBe("₱333.34");
    expect(pesos(result, "BEN")).toBe("₱333.33");
    expect(pesos(result, "CY")).toBe("₱333.33");
    expect(result.warnings).toEqual(["NO_OCCUPANCY_EQUAL_SPLIT"]);
    expect(result.residualCentavos).toBe(PHP_1000);
    expect(result.grandTotalCentavos).toBe(PHP_1000);
    expect(sum(totals(result))).toBe(PHP_1000);
  });

  it("L2 simple: days 20 / 10 / 0", () => {
    const result = computeBill(
      input({ members: members({ ANA: 20, BEN: 10, CY: 0 }) }),
    );

    expect(pesos(result, "ANA")).toBe("₱666.67");
    expect(pesos(result, "BEN")).toBe("₱333.33");
    expect(pesos(result, "CY")).toBe("₱0.00");
    expect(result.warnings).toEqual([]);
    expect(result.residualCentavos).toBe(PHP_1000);
    expect(sum(totals(result))).toBe(PHP_1000);
  });

  it("L3 itemized: L2 + rate PHP 10/kWh, 30 days, fridge 1 kWh/day", () => {
    const result = computeBill(
      input({
        members: members({ ANA: 20, BEN: 10, CY: 0 }),
        rateMillicents: RATE_10,
        daysCovered: 30,
        appliances: [
          appliance({ id: "fridge", label: "Fridge", mode: "always_on", kwhPerUnit: 1 }),
        ],
      }),
    );

    expect(pesos(result, "ANA")).toBe("₱566.67");
    expect(pesos(result, "BEN")).toBe("₱333.33");
    expect(pesos(result, "CY")).toBe("₱100.00");
    expect(result.warnings).toEqual([]);
    // Fridge = 1 x 30 x PHP 10 = PHP 300, so PHP 100 each.
    expect(result.rows.map((r) => r.fixedCentavos)).toEqual([10_000, 10_000, 10_000]);
    expect(result.residualCentavos).toBe(70_000);
    expect(sum(totals(result))).toBe(PHP_1000);
  });

  it("L4 itemized: L3 + aircon 0.5 kWh/hr, 4 hrs ANA+BEN, 2 hrs solo CY", () => {
    const result = computeBill(
      input({
        members: members({ ANA: 20, BEN: 10, CY: 0 }),
        rateMillicents: RATE_10,
        daysCovered: 30,
        appliances: [
          appliance({ id: "fridge", label: "Fridge", mode: "always_on", kwhPerUnit: 1 }),
          appliance({ id: "aircon", label: "Aircon", mode: "per_hour", kwhPerUnit: 0.5 }),
        ],
        uses: [
          use({ applianceId: "aircon", quantity: 4, participantIds: ["ANA", "BEN"] }),
          use({ applianceId: "aircon", quantity: 2, participantIds: ["CY"] }),
        ],
      }),
    );

    expect(pesos(result, "ANA")).toBe("₱556.67");
    expect(pesos(result, "BEN")).toBe("₱333.33");
    expect(pesos(result, "CY")).toBe("₱110.00");
    expect(result.warnings).toEqual([]);
    expect(result.residualCentavos).toBe(67_000);
    expect(sum(totals(result))).toBe(PHP_1000);

    // 4 hrs x 0.5 kWh x PHP 10 = PHP 20, halved between ANA and BEN.
    expect(row(result, "ANA").meteredCentavos).toBe(1_000);
    expect(row(result, "BEN").meteredCentavos).toBe(1_000);
    // 2 hrs x 0.5 kWh x PHP 10 = PHP 10, all CY.
    expect(row(result, "CY").meteredCentavos).toBe(1_000);

    // The per-appliance breakdown the UI renders.
    expect(row(result, "ANA").breakdown).toEqual({ fridge: 10_000, aircon: 1_000 });
    expect(row(result, "CY").breakdown).toEqual({ fridge: 10_000, aircon: 1_000 });
  });

  it("runs L1 and L2 through the same computeBill as L3 and L4", () => {
    // Not a separate "simple mode" function: an empty appliance list.
    const simple = input({ members: members({ ANA: 20, BEN: 10, CY: 0 }) });
    expect(simple.appliances).toEqual([]);
    expect(simple.uses).toEqual([]);
    expect(simple.rateMillicents).toBeNull();
    expect(sum(totals(computeBill(simple)))).toBe(PHP_1000);
  });
});

/* ------------------------------------------------------------------------- *
 * 7.3 step 0 - round up to the peso
 * ------------------------------------------------------------------------- */

describe("round up to the peso (step 0)", () => {
  it("collects the rounded-up amount", () => {
    expect(applyRoundUp(178_374, true)).toBe(178_400);
    expect(applyRoundUp(178_374, false)).toBe(178_374);
    expect(applyRoundUp(178_400, true)).toBe(178_400);
    expect(applyRoundUp(0, true)).toBe(0);
    expect(applyRoundUp(1, true)).toBe(100);
  });

  it("splits the collected amount, not the invoiced one", () => {
    const result = computeBill(
      input({ billedCentavos: applyRoundUp(178_374, true), members: members({ ONLY: 5 }) }),
    );
    expect(result.grandTotalCentavos).toBe(178_400);
    expect(pesos(result, "ONLY")).toBe("₱1,784.00");
  });
});

/* ------------------------------------------------------------------------- *
 * 8.2 - the rest of the required coverage
 * ------------------------------------------------------------------------- */

describe("scaling to any headcount (8.2)", () => {
  // The test that catches a hardcoded /3: a loop over counts, not six cases.
  for (const count of [1, 2, 3, 4, 7, 12]) {
    it(`reconciles with ${count} member${count === 1 ? "" : "s"}`, () => {
      const ids = Array.from({ length: count }, (_, i) => `M${String(i).padStart(2, "0")}`);
      const result = computeBill(
        input({
          billedCentavos: 178_374,
          members: ids.map((id, i) => ({ id, days: i % 4 === 0 ? 0 : (i * 3) % 28 })),
          rateMillicents: RATE_10,
          daysCovered: 30,
          appliances: [
            appliance({ id: "fridge", mode: "always_on", kwhPerUnit: 0.8 }),
            appliance({ id: "aircon", mode: "per_hour", kwhPerUnit: 0.5 }),
          ],
          uses: [
            use({ applianceId: "aircon", quantity: 3, participantIds: ids }),
            use({ applianceId: "aircon", quantity: 1.5, participantIds: [ids[0]] }),
          ],
          otherCharges: [charge({ id: "late", amountCentavos: 5_000 })],
        }),
      );

      expect(result.rows).toHaveLength(count);
      expect(sum(totals(result))).toBe(178_374);
      expect(result.grandTotalCentavos).toBe(178_374);
      for (const r of result.rows) expect(r.totalCentavos).toBeGreaterThanOrEqual(0);
    });
  }
});

describe("edge cases (8.2)", () => {
  it("a single member with nothing else filled in owes exactly the total", () => {
    const result = computeBill(input({ members: members({ SOLO: null }) }));
    expect(totals(result)).toEqual([PHP_1000]);
    expect(pesos(result, "SOLO")).toBe("₱1,000.00");
    expect(result.warnings).toEqual(["NO_OCCUPANCY_EQUAL_SPLIT"]);
  });

  it("five members with days 7, 0, 3, 3, 1 on a PHP 1,000 bill", () => {
    const result = computeBill(
      input({ members: members({ M1: 7, M2: 0, M3: 3, M4: 3, M5: 1 }) }),
    );
    // The two 3-day members differ by a centavo: largestRemainder doing its job.
    expect(result.rows.map((r) => formatCentavos(r.totalCentavos))).toEqual([
      "₱500.00",
      "₱0.00",
      "₱214.29",
      "₱214.28",
      "₱71.43",
    ]);
    expect(sum(totals(result))).toBe(PHP_1000);
  });

  it("keeps the tie-break deterministic across repeated runs", () => {
    const build = () => input({ members: members({ M1: 7, M2: 0, M3: 3, M4: 3, M5: 1 }) });
    expect(totals(computeBill(build()))).toEqual(totals(computeBill(build())));
  });

  it("a use with one participant and a use with every member both behave", () => {
    const result = computeBill(
      input({
        billedCentavos: 100_000,
        members: members({ ANA: 10, BEN: 10, CY: 10 }),
        rateMillicents: RATE_10,
        appliances: [appliance({ id: "washer", mode: "per_cycle", kwhPerUnit: 1 })],
        uses: [
          // PHP 10, all ANA.
          use({ applianceId: "washer", quantity: 1, participantIds: ["ANA"] }),
          // PHP 30, split three ways -> PHP 10 each.
          use({ applianceId: "washer", quantity: 3, participantIds: ["ANA", "BEN", "CY"] }),
        ],
      }),
    );

    expect(row(result, "ANA").meteredCentavos).toBe(2_000);
    expect(row(result, "BEN").meteredCentavos).toBe(1_000);
    expect(row(result, "CY").meteredCentavos).toBe(1_000);
    expect(sum(totals(result))).toBe(100_000);
  });

  it("adding a 0-day member leaves occupancy alone but re-splits the fridge", () => {
    const base = {
      billedCentavos: PHP_1000,
      rateMillicents: RATE_10,
      daysCovered: 30,
      appliances: [appliance({ id: "fridge", mode: "always_on", kwhPerUnit: 1 })],
    };
    const before = computeBill(
      input({ ...base, members: members({ ANA: 20, BEN: 10, CY: 0 }) }),
    );
    const after = computeBill(
      input({ ...base, members: members({ ANA: 20, BEN: 10, CY: 0, DEE: 0 }) }),
    );

    // Occupancy shares are untouched - DEE stayed zero days.
    for (const id of ["ANA", "BEN", "CY"]) {
      expect(row(after, id).sharedCentavos).toBe(row(before, id).sharedCentavos);
    }
    expect(row(after, "DEE").sharedCentavos).toBe(0);

    // The fridge now divides four ways instead of three.
    expect(before.rows.map((r) => r.fixedCentavos)).toEqual([10_000, 10_000, 10_000]);
    expect(after.rows.map((r) => r.fixedCentavos)).toEqual([7_500, 7_500, 7_500, 7_500]);
    expect(sum(totals(after))).toBe(PHP_1000);
  });

  it("emits DAYS_EXCEED_COVERAGE without refusing to calculate", () => {
    const result = computeBill(
      input({ daysCovered: 30, members: members({ ANA: 31, BEN: 10 }) }),
    );
    expect(result.warnings).toContain("DAYS_EXCEED_COVERAGE");
    expect(sum(totals(result))).toBe(PHP_1000);
  });

  it("treats a null day count as zero days", () => {
    const withNull = computeBill(input({ members: members({ ANA: 20, BEN: null }) }));
    const withZero = computeBill(input({ members: members({ ANA: 20, BEN: 0 }) }));
    expect(totals(withNull)).toEqual(totals(withZero));
    expect(row(withNull, "BEN").days).toBe(0);
  });

  it("splits other charges across the named participants, or everyone", () => {
    const result = computeBill(
      input({
        members: members({ ANA: 10, BEN: 10, CY: 10 }),
        otherCharges: [
          charge({ id: "reconnect", amountCentavos: 30_000, participantIds: ["ANA", "BEN"] }),
          charge({ id: "stamp", amountCentavos: 300, participantIds: null }),
        ],
      }),
    );

    expect(row(result, "ANA").otherCentavos).toBe(15_100);
    expect(row(result, "BEN").otherCentavos).toBe(15_100);
    expect(row(result, "CY").otherCentavos).toBe(100);
    expect(result.residualCentavos).toBe(PHP_1000 - 30_300);
    expect(sum(totals(result))).toBe(PHP_1000);
  });
});

describe("the water bill (8.2) - no rate, no appliances, no uses", () => {
  it("splits purely by days through the same call site", () => {
    const result = computeBill(
      input({
        billedCentavos: 45_000,
        members: members({ ANA: 26, BEN: 2, CY: 14 }),
      }),
    );
    expect(result.rows.every((r) => r.fixedCentavos === 0)).toBe(true);
    expect(result.rows.every((r) => r.meteredCentavos === 0)).toBe(true);
    expect(result.residualCentavos).toBe(45_000);
    expect(sum(totals(result))).toBe(45_000);
    // 26 / 42 of PHP 450.
    expect(row(result, "ANA").sharedCentavos).toBe(27_857);
  });

  it("rejects appliances configured without a rate (the 3 precondition)", () => {
    expect(() =>
      computeBill(
        input({
          rateMillicents: null,
          appliances: [appliance({ id: "ghost", mode: "per_hour", kwhPerUnit: 1 })],
        }),
      ),
    ).toThrow(/rate/i);
  });
});

describe("two bills in one period (8.2)", () => {
  it("reconcile independently while sharing the same member days", () => {
    const shared = members({ ANA: 20, BEN: 10, CY: 0 });

    const water = computeBill(input({ billedCentavos: 45_000, members: shared }));
    const power = computeBill(
      input({
        billedCentavos: PHP_1000,
        members: shared,
        rateMillicents: RATE_10,
        daysCovered: 30,
        appliances: [appliance({ id: "fridge", mode: "always_on", kwhPerUnit: 1 })],
      }),
    );

    expect(sum(totals(water))).toBe(45_000);
    expect(sum(totals(power))).toBe(PHP_1000);
    // Same occupancy weights, different bills.
    expect(row(water, "ANA").days).toBe(row(power, "ANA").days);
    expect(row(water, "CY").totalCentavos).toBe(0);
    expect(row(power, "CY").totalCentavos).toBe(10_000);
  });
});

/* ------------------------------------------------------------------------- *
 * 7.3 step 5 - the overflow guard. Written before the implementation, because
 * the obvious version zeroes the residual and leaves the carve-outs at full
 * size: a PHP 1,000 bill returning PHP 2,229 in shares.
 * ------------------------------------------------------------------------- */

describe("carve-outs exceeding the bill (step 5)", () => {
  it("scales carve-outs down so the column still totals the bill", () => {
    const result = computeBill(
      input({
        billedCentavos: PHP_1000,
        members: members({ ANA: 20, BEN: 10, CY: 0 }),
        rateMillicents: RATE_10,
        daysCovered: 30,
        appliances: [
          // 8 kWh/day x 30 days x PHP 10 = PHP 2,400 of fridge on a PHP 1,000 bill.
          appliance({ id: "fridge", mode: "always_on", kwhPerUnit: 8 }),
        ],
      }),
    );

    expect(result.warnings).toContain("CARVEOUTS_EXCEED_TOTAL");
    expect(result.residualCentavos).toBe(0);
    expect(sum(totals(result))).toBe(PHP_1000);
    expect(result.grandTotalCentavos).toBe(PHP_1000);
    for (const r of result.rows) {
      expect(r.totalCentavos).toBeGreaterThanOrEqual(0);
      expect(r.sharedCentavos).toBe(0);
    }
    // PHP 2,400 shared equally would be PHP 800 each; scaled to PHP 1,000 total.
    expect(totals(result)).toEqual([33_334, 33_333, 33_333]);
  });

  it("keeps every column non-negative and consistent when scaling", () => {
    const result = computeBill(
      input({
        billedCentavos: 50_000,
        members: members({ ANA: 5, BEN: 5 }),
        rateMillicents: RATE_10,
        daysCovered: 30,
        appliances: [
          appliance({ id: "fridge", mode: "always_on", kwhPerUnit: 2 }),
          appliance({ id: "aircon", mode: "per_hour", kwhPerUnit: 1.5 }),
        ],
        uses: [use({ applianceId: "aircon", quantity: 20, participantIds: ["ANA"] })],
        otherCharges: [charge({ id: "fine", amountCentavos: 20_000 })],
      }),
    );

    expect(result.warnings).toContain("CARVEOUTS_EXCEED_TOTAL");
    expect(sum(totals(result))).toBe(50_000);
    for (const r of result.rows) {
      expect(r.fixedCentavos).toBeGreaterThanOrEqual(0);
      expect(r.meteredCentavos).toBeGreaterThanOrEqual(0);
      expect(r.otherCentavos).toBeGreaterThanOrEqual(0);
      expect(r.sharedCentavos).toBe(0);
      expect(r.fixedCentavos + r.meteredCentavos + r.otherCentavos + r.sharedCentavos).toBe(
        r.totalCentavos,
      );
      expect(sum(Object.values(r.breakdown))).toBe(r.fixedCentavos + r.meteredCentavos);
    }
  });
});

/* ------------------------------------------------------------------------- *
 * bad data the UI is supposed to make impossible
 * ------------------------------------------------------------------------- */

describe("invariants the engine refuses to guess at", () => {
  it("throws when an always-on appliance has no kWh figure", () => {
    expect(() =>
      computeBill(
        input({
          rateMillicents: RATE_10,
          daysCovered: 30,
          appliances: [appliance({ id: "fridge", mode: "always_on", kwhPerUnit: null })],
        }),
      ),
    ).toThrow(/kWh/i);
  });

  it("throws when an always-on appliance has no coverage to cost it over", () => {
    expect(() =>
      computeBill(
        input({
          rateMillicents: RATE_10,
          daysCovered: null,
          appliances: [appliance({ id: "fridge", mode: "always_on", kwhPerUnit: 1 })],
        }),
      ),
    ).toThrow(/dates/i);
  });

  it("throws when a usage points at an appliance that isn't on the bill", () => {
    expect(() =>
      computeBill(
        input({
          rateMillicents: RATE_10,
          appliances: [appliance({ id: "aircon", kwhPerUnit: 0.5 })],
          uses: [use({ applianceId: "ghost", participantIds: ["ANA"] })],
        }),
      ),
    ).toThrow(/appliance/i);
  });

  it("throws when a usage has no participants", () => {
    expect(() =>
      computeBill(
        input({
          rateMillicents: RATE_10,
          appliances: [appliance({ id: "aircon", kwhPerUnit: 0.5 })],
          uses: [use({ applianceId: "aircon", participantIds: [] })],
        }),
      ),
    ).toThrow(/participant/i);
  });

  it("throws when there are no members at all", () => {
    expect(() => computeBill(input({ members: [] }))).toThrow(/member/i);
  });
});

/* ------------------------------------------------------------------------- *
 * 8.2 - property test, 10 000 random inputs
 * ------------------------------------------------------------------------- */

/** Deterministic PRNG so a failure is reproducible from the seed alone. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInput(rnd: () => number): BillInput {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

  const memberCount = int(1, 12);
  const ids = Array.from({ length: memberCount }, (_, i) => `M${String(i).padStart(2, "0")}`);
  const memberList = ids.map((id) => ({
    id,
    days: rnd() < 0.25 ? null : int(0, 40),
  }));

  const itemized = rnd() < 0.7;
  const rateMillicents = itemized ? int(10_000, 3_000_000) : null;
  // An always-on appliance needs a day count (3.1), so decide that first.
  const daysCovered = rnd() < 0.2 ? null : int(1, 40);

  const appliances: BillAppliance[] = [];
  if (itemized) {
    const applianceCount = int(0, 4);
    for (let i = 0; i < applianceCount; i++) {
      const mode = daysCovered === null ? pick(["per_hour", "per_cycle"] as const) : pick(["always_on", "per_hour", "per_cycle"] as const);
      appliances.push({
        id: `A${i}`,
        label: `Appliance ${i}`,
        mode,
        // Section 3.1 makes this required on any appliance form.
        kwhPerUnit: Math.round(rnd() * 3000) / 1000,
        // The engine is handed uses directly; where they came from is the
        // adapter's business, so the link is irrelevant here.
        trackerId: null,
      });
    }
  }

  const metered = appliances.filter((a) => a.mode !== "always_on");
  const uses: ApplianceUse[] = [];
  if (metered.length > 0) {
    const useCount = int(0, 8);
    for (let i = 0; i < useCount; i++) {
      const participants = ids.filter(() => rnd() < 0.5);
      if (participants.length === 0) participants.push(pick(ids));
      uses.push({
        id: `U${i}`,
        applianceId: pick(metered).id,
        quantity: Math.round(rnd() * 6000) / 1000 + 0.001,
        participantIds: participants,
        occurredOn: null,
        note: null,
      });
    }
  }

  const otherCharges: OtherCharge[] = [];
  const chargeCount = int(0, 3);
  for (let i = 0; i < chargeCount; i++) {
    const named = rnd() < 0.5;
    const participants = named ? ids.filter(() => rnd() < 0.5) : [];
    otherCharges.push({
      id: `C${i}`,
      label: `Charge ${i}`,
      amountCentavos: int(0, 40_000),
      participantIds: named && participants.length > 0 ? participants : null,
    });
  }

  return {
    billedCentavos: int(0, 500_000),
    rateMillicents,
    daysCovered,
    members: memberList,
    appliances,
    uses,
    otherCharges,
  };
}

describe("property: 10 000 random inputs (8.2)", () => {
  it("shares always sum to exactly the billed total and none is negative", () => {
    const rnd = mulberry32(0xfa1_2ee);
    // A property test that never reaches the interesting branches proves
    // nothing, so count what the generator actually produced and assert on it.
    const seen = {
      overflow: 0,
      noOccupancy: 0,
      daysExceed: 0,
      simple: 0,
      itemized: 0,
      alwaysOn: 0,
      sharedUse: 0,
      soloUse: 0,
      singleMember: 0,
      twelveMembers: 0,
    };

    for (let i = 0; i < 10_000; i++) {
      const spec = randomInput(rnd);
      const result = computeBill(spec);

      if (result.warnings.includes("CARVEOUTS_EXCEED_TOTAL")) seen.overflow++;
      if (result.warnings.includes("NO_OCCUPANCY_EQUAL_SPLIT")) seen.noOccupancy++;
      if (result.warnings.includes("DAYS_EXCEED_COVERAGE")) seen.daysExceed++;
      if (spec.rateMillicents === null) seen.simple++;
      else seen.itemized++;
      if (spec.appliances.some((a) => a.mode === "always_on")) seen.alwaysOn++;
      if (spec.uses.some((u) => u.participantIds.length > 1)) seen.sharedUse++;
      if (spec.uses.some((u) => u.participantIds.length === 1)) seen.soloUse++;
      if (spec.members.length === 1) seen.singleMember++;
      if (spec.members.length === 12) seen.twelveMembers++;

      const shares = totals(result);
      if (sum(shares) !== spec.billedCentavos) {
        throw new Error(
          `iteration ${i}: shares summed to ${sum(shares)}, expected ${spec.billedCentavos}\n` +
            JSON.stringify(spec),
        );
      }
      expect(result.grandTotalCentavos).toBe(spec.billedCentavos);
      expect(result.rows).toHaveLength(spec.members.length);
      expect(result.residualCentavos).toBeGreaterThanOrEqual(0);

      for (const r of result.rows) {
        if (
          r.totalCentavos < 0 ||
          r.sharedCentavos < 0 ||
          r.fixedCentavos < 0 ||
          r.meteredCentavos < 0 ||
          r.otherCentavos < 0
        ) {
          throw new Error(`iteration ${i}: negative share\n${JSON.stringify({ r, spec })}`);
        }
        expect(
          r.sharedCentavos + r.fixedCentavos + r.meteredCentavos + r.otherCentavos,
        ).toBe(r.totalCentavos);
        expect(Number.isInteger(r.totalCentavos)).toBe(true);
      }
    }

    // Every branch that matters was actually exercised.
    for (const [name, count] of Object.entries(seen)) {
      expect(count, `the generator never produced: ${name}`).toBeGreaterThan(50);
    }
    // 10 000 iterations run in ~2.4s, against Vitest's 5s default — under 2.2x
    // headroom, so this failed on a machine that was also building the app.
    // The suite's central correctness proof must never fail for load reasons.
  }, 60_000);
});
