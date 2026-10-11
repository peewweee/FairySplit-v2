/**
 * An invented refrigerator energy guide, for the help beside the appliance form's "Appliance
 * energy per ..." field: it shows where a real guide keeps the kWh figure. It copies the layout
 * of a Philippine DOE refrigerator guide, whose "Energy Consumption" is printed per 24 hours,
 * which is the form's "per day". Nothing here belongs to a real brand or product, and it
 * carries none of the DOE's marks.
 */
export const SAMPLE_ENERGY_GUIDE = {
  company: "Fairyland Appliances Inc.",
  brand: "Fairyland",
  model: "FL-200S",
  type: "Single Door",
  storageLitres: 200,
  powerWatts: 70,
  volts: 230,
  amps: 0.62,
  hertz: 60,
  /** What the fridge uses in 24 hours: the figure that field asks for under "Equally". */
  kwhPer24h: 0.61,
  /** The efficiency factor on the sheet. Drawn for looks; the app never reads it. */
  efficiencyFactor: 344,
};
