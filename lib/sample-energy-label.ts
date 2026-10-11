import { LABEL_DAYS_IN_MONTH } from "@/lib/billing/label-energy";

/**
 * An invented air conditioner energy label, for the help beside the converter's "Monthly energy
 * consumption" and "Hours a day": it shows where a real label keeps them. It copies the layout
 * of a Philippine DOE label, which prints the monthly kWh and, in small type, "based on 9-hour
 * daily usage". Nothing here belongs to a real brand or product, and it carries none of the DOE's
 * marks.
 *
 * The figures agree with each other. A label's monthly figure is its power input x the hours a
 * day it assumes x the days in a month x a load factor (the DOE's own sheet for an inverter unit
 * uses 9 hours, 30 days and 0.5), so the picture teaches the same arithmetic the converter undoes:
 * monthly kWh / days in the month / hours a day.
 */
export const SAMPLE_ENERGY_LABEL = {
  appliance: "Air Conditioner",
  /** The efficiency rating under test conditions, and how many of the five stars it earns. */
  rating: "4.20",
  stars: 5,
  issuanceYear: 2023,
  brand: "Fairyland",
  model: "FL-150AC",
  coolingKw: 3.67,
  powerWatts: 1140,
  hoursPerDay: 9,
  daysInMonth: LABEL_DAYS_IN_MONTH,
  loadFactor: 0.5,
};

/** What the sample prints, worked out from its own numbers rather than typed twice. */
export function sampleEnergyLabelFigures(): { monthlyKwh: number } {
  const { powerWatts, hoursPerDay, daysInMonth, loadFactor } = SAMPLE_ENERGY_LABEL;
  return {
    monthlyKwh: Math.round((powerWatts / 1000) * hoursPerDay * daysInMonth * loadFactor * 100) / 100,
  };
}
