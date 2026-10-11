import { describe, expect, it } from "vitest";
import {
  convertibleUnit,
  kwhPerDayFromMonthly,
  kwhPerHourFromMonthly,
  LABEL_DAYS_IN_MONTH,
} from "@/lib/billing/label-energy";

describe("converting a label's monthly kWh", () => {
  it("counts a month as 30 days, as the DOE's labels do", () => {
    expect(LABEL_DAYS_IN_MONTH).toBe(30);
  });

  it("gives the energy per day for an appliance that never stops", () => {
    expect(kwhPerDayFromMonthly(153.9)).toBe(5.13);
  });

  it("gives the energy per hour of use from the hours the label is based on", () => {
    expect(kwhPerHourFromMonthly(153.9, 9)).toBe(0.57);
  });

  it("keeps four decimals, as the form always has", () => {
    expect(kwhPerDayFromMonthly(100)).toBe(3.3333);
    expect(kwhPerHourFromMonthly(100, 9)).toBe(0.3704);
  });
});

describe("which figure the converter can give", () => {
  it("is per day for an appliance that never stops and for a per-day log", () => {
    expect(convertibleUnit("always_on")).toBe("day");
    expect(convertibleUnit("per_day")).toBe("day");
  });

  it("is per hour for a per-hour log, and while no log has been picked yet", () => {
    expect(convertibleUnit("per_hour")).toBe("hour");
    expect(convertibleUnit("unpicked")).toBe("hour");
  });

  it("is nothing for a per-cycle log, which a monthly figure cannot describe", () => {
    expect(convertibleUnit("per_cycle")).toBeNull();
  });

  it("never lets an hourly figure stand in for a per-day one: a per-day log billed 0.57 a day instead of 5.13 would cost 9 times too little", () => {
    // 153.9 kWh a month, based on 9 hours a day.
    expect(kwhPerHourFromMonthly(153.9, 9)).toBe(0.57);
    expect(kwhPerDayFromMonthly(153.9)).toBe(5.13);
    expect(convertibleUnit("per_day")).not.toBe(convertibleUnit("per_hour"));
  });
});
