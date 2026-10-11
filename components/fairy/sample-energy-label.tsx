import { AirVent, Star } from "lucide-react";
import { Circled, SampleChip, SpecRow } from "@/components/fairy/mock-parts";
import { SAMPLE_ENERGY_LABEL, sampleEnergyLabelFigures } from "@/lib/sample-energy-label";

/** Which part of the label is ringed. The two help dialogs differ in this and nothing else. */
export type EnergyLabelFigure = "monthly" | "hours";

const RINGED_NAME: Record<EnergyLabelFigure, string> = {
  monthly: "monthly energy consumption",
  hours: "hours a day",
};

/**
 * A mock-up air conditioner energy label, laid out like a Philippine DOE one: a rating band, the
 * stars, the monthly energy consumption with its asterisk, the model's details, and the small
 * "*based on 9-hour daily usage" under the tagline. It is on the app's theme, left aligned, and
 * leaves out the DOE's seal, QR code and legal text. One figure is ringed. It is a drawing, not
 * a document, so it is one labelled image. Every name and figure comes from
 * `lib/sample-energy-label.ts`, and none of it is real.
 */
export function SampleEnergyLabel({ circled }: { circled: EnergyLabelFigure }) {
  const { appliance, rating, stars, issuanceYear, brand, model, coolingKw, powerWatts, hoursPerDay } =
    SAMPLE_ENERGY_LABEL;
  const { monthlyKwh } = sampleEnergyLabelFigures();
  const twoDecimals = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      role="img"
      aria-label={`A sample ${appliance.toLowerCase()} energy label. The ${RINGED_NAME[circled]} is circled.`}
      className="overflow-hidden border border-fairy-hair bg-card text-[11.5px] leading-snug font-medium text-fairy-ink-2"
    >
      <div className="bg-fairy-tint px-5 py-4 text-fairy-tint-ink">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[19px] leading-none font-extrabold tracking-[0.04em]">ENERGY LABEL</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-bold">
              <AirVent className="size-4 shrink-0" aria-hidden />
              {appliance}
            </p>
          </div>
          <SampleChip />
        </div>
        <p className="mt-4 text-[10.5px] font-semibold">Energy Efficiency Rating:</p>
        <p className="mt-0.5 flex items-baseline gap-2">
          <span className="text-[34px] leading-none font-extrabold tracking-[-0.03em]" data-numeric>
            {rating}
          </span>
          <span className="text-[10.5px] font-semibold">under test conditions</span>
        </p>
      </div>

      <div className="flex gap-1.5 border-b border-fairy-hair px-5 py-3.5 text-fairy-rose">
        {Array.from({ length: stars }, (_, i) => (
          <Star key={i} className="size-5 fill-current" aria-hidden />
        ))}
      </div>

      <div className="px-5 pt-4 pb-5">
        <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-4">
          <SpecRow label="Issuance Year of Energy Rating:" value={issuanceYear} />
          <SpecRow
            label="Monthly Energy Consumption*:"
            value={<Circled on={circled === "monthly"}>{twoDecimals(monthlyKwh)} kWh</Circled>}
          />
          <SpecRow label="Brand Name:" value={brand} />
          <SpecRow label="Product Model:" value={model} />
          <SpecRow label="Cooling Capacity (kW):" value={twoDecimals(coolingKw)} />
          <SpecRow label="Power Input (W):" value={twoDecimals(powerWatts)} />
        </div>

        <p className="mt-5 text-[13px] leading-snug font-extrabold text-fairy-ink">
          &ldquo;More stars and higher rating means more savings&rdquo;
        </p>
        <p className="mt-4 text-[10px] font-semibold text-fairy-grey-strong">
          <Circled on={circled === "hours"}>*based on {hoursPerDay}-hour daily usage</Circled>
        </p>
      </div>
    </div>
  );
}
