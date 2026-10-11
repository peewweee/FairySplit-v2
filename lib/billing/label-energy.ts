import type { ApplianceMode } from "@/lib/data/types";

/**
 * Turning an energy label's monthly kWh into the per-unit figure an appliance stores (10.3).
 *
 * A label works its monthly figure out over 30 days (the Philippine DOE's own sheet: watts / 1000
 * x hours x 30 days x a load factor) and never prints the 30. So nobody can read it off the
 * paper, and the converter does not ask for it. It also does not borrow the bill's dates: the
 * label's month is the label's, and the engine applies the bill's own days later, to the per-day
 * figure stored here. The hours a day, by contrast, ARE printed ("based on 9-hour daily usage"),
 * so the converter asks for those.
 */
export const LABEL_DAYS_IN_MONTH = 30;

/** What a converted figure is measured against: a day, or an hour of use. */
export type ConvertedUnit = "day" | "hour";

/**
 * Which per-unit figure "Know it per month instead?" can give for a charge, if any.
 *
 * Around the clock ("always_on") and per-day logs count days, so the answer is monthly / 30.
 * Per-hour logs count hours, so it also needs the hours the label is based on. Per-cycle logs
 * get nothing: a label gives energy per cycle itself, and a month does not say how many cycles
 * it holds. `"unpicked"` is "Track based on logs" ticked before a log is named: the unit is not
 * known yet, and the logs a room starts with count hours, so ask for them.
 */
export function convertibleUnit(
  mode: ApplianceMode | "unpicked",
): ConvertedUnit | null {
  switch (mode) {
    case "always_on":
    case "per_day":
      return "day";
    case "per_hour":
    case "unpicked":
      return "hour";
    case "per_cycle":
      return null;
  }
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** kWh a day, for an appliance that runs around the clock ("Equally"). */
export function kwhPerDayFromMonthly(monthlyKwh: number): number {
  return round4(monthlyKwh / LABEL_DAYS_IN_MONTH);
}

/** kWh per hour of use, given the hours a day the label's figure is based on. */
export function kwhPerHourFromMonthly(monthlyKwh: number, hoursPerDay: number): number {
  return round4(monthlyKwh / LABEL_DAYS_IN_MONTH / hoursPerDay);
}
