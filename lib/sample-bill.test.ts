import { describe, expect, it } from "vitest";
import { formatCentavos, kwhToCentavos, pesosToMillicents } from "@/lib/billing/money";
import { SAMPLE_BILL, sampleBillFigures } from "@/lib/sample-bill";

describe("the sample bill behind the electricity-rate help", () => {
  const { kwhUsed, totalCentavos } = sampleBillFigures();

  it("reads off the meter: the present reading less the previous one", () => {
    expect(kwhUsed).toBe(120);
  });

  it("adds up its own charges to the total it prints", () => {
    expect(totalCentavos).toBe(178_320);
    expect(formatCentavos(totalCentavos)).toBe("₱1,783.20");
  });

  it("agrees with the rate it circles: the kWh used, at that rate, come to the total to the centavo", () => {
    expect(kwhToCentavos(kwhUsed, pesosToMillicents(SAMPLE_BILL.ratePesos))).toBe(totalCentavos);
  });
});
