"use client";

import { InfoButton } from "@/components/fairy/info-button";
import { SampleEnergyGuide } from "@/components/fairy/sample-energy-guide";
import { SampleEnergyLabel, type EnergyLabelFigure } from "@/components/fairy/sample-energy-label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** The three fields that carry an icon: the energy per unit, and the converter's two. */
export type EnergyGuideFigure = "perUnit" | EnergyLabelFigure;

const COPY: Record<EnergyGuideFigure, { label: string; title: string; description: string }> = {
  perUnit: {
    label: "Where to find your appliance's energy use",
    title: "Find your appliance's energy use",
    description:
      "Check the energy guide of your appliance for how much energy it uses. The kWh figure is circled on this sample.",
  },
  monthly: {
    label: "Where to find the monthly energy consumption",
    title: "Find the monthly energy consumption",
    description:
      "Check the energy guide of your appliance for its monthly energy consumption. It is circled on this sample. A month is counted as 30 days, as energy labels do.",
  },
  hours: {
    label: "Where to find the hours a day",
    title: "Find the hours a day",
    description:
      "Check the energy guide of your appliance for the hours a day its monthly energy consumption is based on. It is circled on this sample.",
  },
};

/**
 * The info icon beside the appliance form's energy fields. Tap it and a dialog shows a sample
 * with that field's figure circled, under one line telling you to check your own appliance's
 * energy guide. The energy per unit gets a refrigerator's guide; the converter's monthly energy
 * and hours a day get the same air conditioner label, circled in different places. The same
 * dialog as `RateInfo`, for the same reasons: hover does nothing on a phone, and a mock-up needs
 * the room.
 */
export function EnergyGuideInfo({ figure }: { figure: EnergyGuideFigure }) {
  const copy = COPY[figure];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <InfoButton label={copy.label} />
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader className="pr-6">
          <DialogTitle className="text-[17px] text-fairy-ink">{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {figure === "perUnit" ? <SampleEnergyGuide /> : <SampleEnergyLabel circled={figure} />}
      </DialogContent>
    </Dialog>
  );
}
