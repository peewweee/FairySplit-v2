import { describe, expect, it } from "vitest";
import {
  centavosToPesos,
  formatCentavos,
  kwhToCentavos,
  largestRemainder,
  MILLICENTS_PER_PESO,
  millicentsToPesoString,
  pesosToCentavos,
  pesosToMillicents,
} from "@/lib/billing/money";

/**
 * Section 6 warns that an off-by-10x in the millicent conversion is invisible
 * in review and wrong by an order of magnitude on the bill. These are the tests
 * that pin it down.
 */
describe("millicents", () => {
  it("holds a peso rate as 1/1000 of a centavo", () => {
    // 1 peso = 100 centavos = 100_000 millicents.
    expect(MILLICENTS_PER_PESO).toBe(100_000);
    expect(pesosToMillicents(1)).toBe(100_000);
    expect(pesosToMillicents(10)).toBe(1_000_000);
    expect(pesosToMillicents(14.86)).toBe(1_486_000);
  });

  it("round-trips a rate back to the peso figure a human typed", () => {
    expect(millicentsToPesoString(pesosToMillicents(14.86))).toBe("14.86");
    expect(millicentsToPesoString(pesosToMillicents(9.5))).toBe("9.5");
    expect(millicentsToPesoString(pesosToMillicents(0.0001))).toBe("0.0001");
  });

  it("prices one kWh at exactly the rate that was typed", () => {
    // THE off-by-10x test: one kWh at PHP 14.86/kWh must cost PHP 14.86.
    const rate = pesosToMillicents(14.86);
    expect(kwhToCentavos(1, rate)).toBe(1_486);
    expect(formatCentavos(kwhToCentavos(1, rate))).toBe("₱14.86");
  });

  it("prices the ladder's fridge exactly", () => {
    // 1 kWh/day x 30 days at PHP 10/kWh = PHP 300.00 (section 8.1, L3).
    const rate = pesosToMillicents(10);
    expect(kwhToCentavos(1 * 30, rate)).toBe(30_000);
    expect(formatCentavos(kwhToCentavos(1 * 30, rate))).toBe("₱300.00");
  });

  it("prices fractional usage", () => {
    // 4 hours of a 0.5 kWh/hr aircon at PHP 10/kWh = PHP 20.00 (L4).
    const rate = pesosToMillicents(10);
    expect(kwhToCentavos(4 * 0.5, rate)).toBe(2_000);
    // 1.5 hours of a 0.73 kWh/hr aircon at PHP 14.86/kWh.
    expect(kwhToCentavos(1.5 * 0.73, pesosToMillicents(14.86))).toBe(1_627);
  });

  it("rounds to the nearest centavo, never truncates", () => {
    expect(kwhToCentavos(1, 1_005)).toBe(1); // 1.005 centavos -> 1
    expect(kwhToCentavos(1, 1_500)).toBe(2); // 1.5 centavos   -> 2
    expect(kwhToCentavos(0, 999_999)).toBe(0);
  });
});

describe("pesos and centavos", () => {
  it("converts pesos to integer centavos", () => {
    expect(pesosToCentavos(1783.74)).toBe(178_374);
    expect(pesosToCentavos(0)).toBe(0);
    expect(pesosToCentavos(0.01)).toBe(1);
    // The classic float trap: 19.99 * 100 is 1998.9999999999998.
    expect(pesosToCentavos(19.99)).toBe(1_999);
  });

  it("converts back for display", () => {
    expect(centavosToPesos(178_374)).toBe(1783.74);
  });
});

describe("formatCentavos", () => {
  it("formats with a peso sign, two decimals and thousands commas", () => {
    expect(formatCentavos(123_456)).toBe("₱1,234.56");
    expect(formatCentavos(0)).toBe("₱0.00");
    expect(formatCentavos(1)).toBe("₱0.01");
    expect(formatCentavos(100)).toBe("₱1.00");
    expect(formatCentavos(100_000)).toBe("₱1,000.00");
    expect(formatCentavos(123_456_789)).toBe("₱1,234,567.89");
  });

  it("keeps the minus sign outside the digits", () => {
    expect(formatCentavos(-123_456)).toBe("₱-1,234.56");
  });
});

describe("largestRemainder", () => {
  it("always sums to exactly the total", () => {
    expect(largestRemainder(100_000, [1, 1, 1], ["ANA", "BEN", "CY"])).toEqual([
      33_334, 33_333, 33_333,
    ]);
    expect(largestRemainder(100_000, [20, 10, 0], ["ANA", "BEN", "CY"])).toEqual([
      66_667, 33_333, 0,
    ]);
  });

  it("breaks ties by id so the spare centavo never moves between renders", () => {
    const first = largestRemainder(100, [1, 1, 1], ["CY", "ANA", "BEN"]);
    const again = largestRemainder(100, [1, 1, 1], ["CY", "ANA", "BEN"]);
    expect(first).toEqual(again);
    // 100 / 3 = 33 each with 1 spare; ANA sorts first, and ANA is index 1.
    expect(first).toEqual([33, 34, 33]);
  });

  it("falls back to an equal split when every weight is zero", () => {
    expect(largestRemainder(100_000, [0, 0, 0], ["ANA", "BEN", "CY"])).toEqual([
      33_334, 33_333, 33_333,
    ]);
    expect(largestRemainder(10, [0, 0, 0, 0], ["D", "C", "B", "A"])).toEqual([
      2, 2, 3, 3,
    ]);
  });

  it("handles a single share and a zero total", () => {
    expect(largestRemainder(100_000, [7], ["ONLY"])).toEqual([100_000]);
    expect(largestRemainder(100_000, [0], ["ONLY"])).toEqual([100_000]);
    expect(largestRemainder(0, [1, 1], ["A", "B"])).toEqual([0, 0]);
  });

  it("never hands anyone a negative share", () => {
    for (const total of [0, 1, 2, 7, 99, 100_000, 178_374]) {
      for (const weights of [[1], [1, 1], [3, 0, 1], [0, 0, 0], [7, 0, 3, 3, 1]]) {
        const ids = weights.map((_, i) => `M${i}`);
        const parts = largestRemainder(total, weights, ids);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        for (const part of parts) expect(part).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
