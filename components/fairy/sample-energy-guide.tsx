import { Circled, SampleChip, SpecRow } from "@/components/fairy/mock-parts";
import { SAMPLE_ENERGY_GUIDE } from "@/lib/sample-energy-guide";

/**
 * A mock-up refrigerator energy guide, laid out like a Philippine DOE one: the maker, the spec
 * list ending in "Energy Consumption" (kWh per 24 hours), the dark "ENERGY GUIDE" band, the
 * efficiency factor and the cost formula. It is on the app's theme, left aligned, and leaves
 * out the DOE's logos, legal notice and contact lines. The kWh figure is ringed. It is a
 * drawing, not a document, so it is one labelled image. Every name and figure comes from
 * `lib/sample-energy-guide.ts`, and none of it is real.
 */
export function SampleEnergyGuide() {
  const g = SAMPLE_ENERGY_GUIDE;

  return (
    <div
      role="img"
      aria-label="A sample refrigerator energy guide. The kWh figure is circled."
      className="overflow-hidden border border-fairy-hair bg-card text-[11.5px] leading-snug font-medium text-fairy-ink-2"
    >
      <div className="flex items-center justify-between gap-3 bg-fairy-tint px-5 py-3">
        <p className="min-w-0 text-[13px] font-extrabold tracking-[0.04em] text-fairy-tint-ink uppercase">
          {g.company}
        </p>
        <SampleChip />
      </div>

      <div className="px-5 pt-4 pb-5">
        {/* One value column for every line. The last line is the ringed one, so it sits a
            little apart: the ring reaches 12px up and must clear the line above. */}
        <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-2.5">
          <SpecRow label="Brand:" value={g.brand} />
          <SpecRow label="Model:" value={g.model} />
          <SpecRow label="Type:" value={g.type} />
          <SpecRow label="Total Storage Volume:" value={`${g.storageLitres} L`} />
          <SpecRow label="Rated Power Input (W):" value={g.powerWatts.toFixed(2)} />
          <SpecRow label="Rated Voltage:" value={`${g.volts} V`} />
          <SpecRow label="Rated Current:" value={`${g.amps} A`} />
          <SpecRow label="Rated Frequency:" value={`${g.hertz} Hz`} />
          <SpecRow
            label="Energy Consumption:"
            value={<Circled>{g.kwhPer24h} kWh/24h</Circled>}
            className="mt-3.5"
          />
        </div>
      </div>

      <div className="bg-fairy-tint-ink px-5 py-2.5">
        <p className="text-[17px] leading-none font-extrabold tracking-[0.06em] text-card">
          ENERGY GUIDE
        </p>
      </div>

      <div className="px-5 pt-4 pb-5">
        <p className="text-[12px] font-extrabold tracking-[0.02em] text-fairy-ink">
          REFRIGERATORS AND FREEZERS
        </p>

        <p className="mt-4 text-[10.5px] font-bold tracking-[0.04em] text-fairy-ink-2">
          ENERGY EFFICIENCY FACTOR
        </p>
        <div className="mt-1.5 border border-fairy-ink-2 px-4 py-2">
          <p className="fs-val text-[34px] leading-none" data-numeric>
            {g.efficiencyFactor}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-fairy-grey-strong">
            (At standard test condition)
          </p>
        </div>

        <p className="mt-3.5 text-[12px] font-bold text-fairy-ink">
          Higher EEF means lower operating cost
        </p>

        <p className="mt-3.5 text-[10px] font-semibold text-fairy-grey-strong">
          The daily operating cost of this model will be approximately:
        </p>
        <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-x-2 text-[10px] leading-tight font-semibold text-fairy-ink-2">
          <span>Energy Consumption (kWh/24h)</span>
          <span className="font-extrabold text-fairy-ink">×</span>
          <span>Energy Cost (Pesos/kW-h)</span>
          <span className="font-extrabold text-fairy-ink">=</span>
          <span>Cost of Operation (Pesos per 24hr)</span>
        </div>
      </div>
    </div>
  );
}
