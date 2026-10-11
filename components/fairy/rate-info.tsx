"use client";

import { InfoButton } from "@/components/fairy/info-button";
import { SampleBill } from "@/components/fairy/sample-bill";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The info icon beside "Electricity rate". Tap it and a dialog shows a sample bill with the
 * rate circled, under one line saying the rate is on your bill. A dialog rather than a hover
 * tooltip because hover does nothing on a phone, and a mock bill needs the room. It opens
 * over the bill dialog it sits in, and closes back onto it.
 */
export function RateInfo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <InfoButton label="Where to find your electricity rate" />
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader className="pr-6">
          <DialogTitle className="text-[17px] text-fairy-ink">Find your electricity rate</DialogTitle>
          <DialogDescription>
            Your electricity rate is on your electricity bill, as the price for each kWh. It is
            circled on this sample.
          </DialogDescription>
        </DialogHeader>
        <SampleBill />
      </DialogContent>
    </Dialog>
  );
}
