import { describe, expect, it } from "vitest";
import { applianceFormula } from "@/lib/billing/explain";
import { pesosToMillicents } from "@/lib/billing/money";

const rate = pesosToMillicents(10);
const tv = { label: "TV", kwhPerUnit: 0.1 };
const lamp = { label: "Lamp", kwhPerUnit: 0.05 };

describe("the line that explains what a log cost somebody", () => {
  it("multiplies it out when it is exactly that", () => {
    expect(applianceFormula(10, [tv], rate, "hours", 1000)).toBe(
      "10 hours × 0.1 kWh × ₱10/kWh = ₱10.00.",
    );
  });

  it("adds the kWh of every appliance charged from the same log, and names them", () => {
    // 10 hours of the TV (₱10.00) plus 10 hours of the lamp (₱5.00), nobody sharing anything.
    expect(applianceFormula(10, [tv, lamp], rate, "hours", 1500)).toBe(
      "10 hours × 0.15 kWh (TV 0.1 + Lamp 0.05) × ₱10/kWh = ₱15.00.",
    );
  });

  it("only says it was shared when the multiplication really does not come to the cost", () => {
    // 10 hours were logged, but two people overlapped and the cost is lower.
    expect(applianceFormula(10, [tv], rate, "hours", 750)).toBe(
      "10 hours logged, but some of that was shared with someone else. Your share of it: ₱7.50.",
    );
  });

  it("does not claim sharing for two appliances on one log (the line that used to)", () => {
    expect(applianceFormula(10, [tv, lamp], rate, "hours", 1500)).not.toContain("shared");
  });

  it("says so when there is no rate, or when an appliance has no kWh figure yet", () => {
    expect(applianceFormula(10, [tv], null, "hours", 0)).toBe(
      "This bill has no rate, so logged usage costs nothing.",
    );
    expect(applianceFormula(10, [tv, { label: "Lamp", kwhPerUnit: null }], rate, "hours", 0)).toBe(
      '"Lamp" has no kWh figure yet, so there is nothing to price this against.',
    );
  });
});
