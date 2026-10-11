import type { Centavos } from "@/lib/data/types";

/**
 * An invented electricity bill, for the help beside the "Electricity rate" field: it shows
 * where a real bill keeps the rate. Nothing here belongs to a real company or person.
 *
 * The figures are made to agree with each other (what the meter read, what was charged, and
 * the rate that gives that total), so the picture teaches the same arithmetic the app uses:
 * kWh used x rate = the bill.
 */
export const SAMPLE_BILL = {
  company: "Fairyland Electric Co.",
  customer: "Jane Doe",
  address: "123 Magic St., Fairyland City",
  accountNo: "0000 0000 00",
  period: "Sep 14 to Oct 13",
  dueOn: "Oct 28",
  readings: { previous: 4210, present: 4330 },
  /** What each kWh cost, in pesos: the total divided by the kWh used. */
  ratePesos: 14.86,
  charges: [
    { label: "Generation", centavos: 78_000 },
    { label: "Transmission", centavos: 15_600 },
    { label: "Distribution", centavos: 33_600 },
    { label: "Taxes and other charges", centavos: 51_120 },
  ] satisfies { label: string; centavos: Centavos }[],
};

/** What the sample bill adds up to, worked out from its own lines rather than typed twice. */
export function sampleBillFigures(): { kwhUsed: number; totalCentavos: Centavos } {
  return {
    kwhUsed: SAMPLE_BILL.readings.present - SAMPLE_BILL.readings.previous,
    totalCentavos: SAMPLE_BILL.charges.reduce((sum, charge) => sum + charge.centavos, 0),
  };
}
