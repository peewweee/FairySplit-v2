import { Zap } from "lucide-react";
import { formatCentavos, pesosToCentavos } from "@/lib/billing/money";
import { SAMPLE_BILL, sampleBillFigures } from "@/lib/sample-bill";

/**
 * A mock-up electricity bill on the app's theme, with the rate picked out by a pink
 * highlight, a plain rose ring round it and a "Your rate this month" label above it. It is
 * a drawing, not a document, so it is one labelled image rather than a pile of text for a
 * screen reader to wade through. Every name and figure comes from `lib/sample-bill.ts`, and
 * none of it is real.
 */

function Fact({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="fs-lab text-[10.5px]">{label}</p>
      <p className="font-bold text-fairy-ink" data-numeric>
        {value}
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span>{label}</span>
      <span className="font-semibold text-fairy-ink" data-numeric>
        {value}
      </span>
    </div>
  );
}

export function SampleBill() {
  const { kwhUsed, totalCentavos } = sampleBillFigures();
  const rate = formatCentavos(pesosToCentavos(SAMPLE_BILL.ratePesos));
  const reading = (n: number) => n.toLocaleString("en-US");

  return (
    <div
      role="img"
      aria-label={`A sample electricity bill. Your rate this month, ${rate} per kWh, is circled.`}
      className="overflow-hidden border border-fairy-hair bg-card text-[11.5px] leading-snug font-medium text-fairy-ink-2"
    >
      <div className="flex items-center justify-between gap-3 bg-fairy-tint px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center bg-card text-fairy-rose">
            <Zap className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold tracking-[-0.01em] text-fairy-tint-ink">
              {SAMPLE_BILL.company}
            </p>
            <p className="text-[10.5px] font-semibold text-fairy-tint-ink">Electricity bill</p>
          </div>
        </div>
        <span className="shrink-0 border border-fairy-tint-ink px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-[0.14em] text-fairy-tint-ink">
          SAMPLE
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-b border-fairy-hair px-4 py-3">
        <Fact label="Customer" value={SAMPLE_BILL.customer} />
        <Fact label="Account no." value={SAMPLE_BILL.accountNo} />
        <Fact label="Service address" value={SAMPLE_BILL.address} className="col-span-2" />
        <Fact label="Billing period" value={SAMPLE_BILL.period} />
        <Fact label="Due date" value={SAMPLE_BILL.dueOn} />
      </div>

      <div className="border-b border-fairy-hair px-4 py-3">
        <Line label="Previous reading" value={reading(SAMPLE_BILL.readings.previous)} />
        <Line label="Present reading" value={reading(SAMPLE_BILL.readings.present)} />
        <Line label="Energy used" value={`${kwhUsed} kWh`} />
      </div>

      <div className="px-4 pt-3">
        <p className="fs-lab mb-1 text-[10.5px]">Charges</p>
        {SAMPLE_BILL.charges.map((charge) => (
          <Line key={charge.label} label={charge.label} value={formatCentavos(charge.centavos)} />
        ))}
      </div>

      {/* The line to find: highlighted, ringed, and labelled above. The ring is an ellipse sized
          off the highlighted band (a tenth of its width each side, 14px above and below) so
          the band's corners sit inside it, and the margins keep it clear of the card's edge. */}
      <div className="px-4 pt-4 pb-5">
        <p className="mb-5 text-center text-[11px] font-extrabold text-fairy-rose">
          Your rate this month
        </p>
        <div className="relative mx-8">
          <div className="flex items-baseline justify-between gap-3 bg-fairy-tint px-3 py-2">
            <span className="font-bold text-fairy-tint-ink">Rate per kWh</span>
            <span className="text-[13px] font-extrabold text-fairy-tint-ink" data-numeric>
              {rate}
            </span>
          </div>
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-x-[10%] -inset-y-3.5 rounded-[50%] border-2 border-fairy-rose"
          />
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 border-t border-fairy-hair px-4 py-3">
        <span className="font-extrabold text-fairy-ink">Total amount due</span>
        <span className="fs-val text-[19px] leading-none" data-numeric>
          {formatCentavos(totalCentavos)}
        </span>
      </div>
    </div>
  );
}
