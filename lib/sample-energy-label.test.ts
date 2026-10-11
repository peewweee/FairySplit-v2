import { describe, expect, it } from "vitest";
import { kwhPerHourFromMonthly, LABEL_DAYS_IN_MONTH } from "@/lib/billing/label-energy";
import { SAMPLE_ENERGY_LABEL, sampleEnergyLabelFigures } from "@/lib/sample-energy-label";

describe("the sample energy label behind the monthly energy and hours-a-day help", () => {
  const { hoursPerDay, daysInMonth } = SAMPLE_ENERGY_LABEL;
  const { monthlyKwh } = sampleEnergyLabelFigures();

  it("prints a monthly figure that follows from its power input, hours, days and load factor", () => {
    expect(monthlyKwh).toBe(153.9);
    expect(monthlyKwh.toFixed(2)).toBe("153.90");
  });

  it("says it is based on 9-hour daily usage, over the 30 days the converter counts", () => {
    expect(hoursPerDay).toBe(9);
    expect(daysInMonth).toBe(LABEL_DAYS_IN_MONTH);
  });

  it("agrees with the converter: its monthly kWh at 9 hours a day comes to the energy per hour it would store", () => {
    expect(kwhPerHourFromMonthly(monthlyKwh, hoursPerDay)).toBe(0.57);
  });
});
