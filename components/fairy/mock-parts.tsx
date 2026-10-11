import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small pieces the mock-up documents (the sample bill, the energy guide and label) share. */

/**
 * Rings its children with a plain, still, rose ellipse, or does nothing when `on` is false.
 * The ring is absolutely placed, so ringing a figure or not never moves anything: the versions
 * of a mock-up are the same page apart from the ring. It reaches 14px out sideways and 12px up
 * and down, which the layout around each ringed figure leaves room for.
 */
export function Circled({ on = true, children }: { on?: boolean; children: ReactNode }) {
  return (
    <span className="relative inline-block">
      {children}
      {on && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-x-3.5 -inset-y-3 rounded-[50%] border-2 border-fairy-rose"
        />
      )}
    </span>
  );
}

/**
 * One "Label: value" line of a spec list. It renders two grid cells, so put it in a two-column
 * grid; every row then shares one left-aligned value column, as on the real labels.
 */
export function SpecRow({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <>
      <span className={className}>{label}</span>
      <span className={cn("font-bold text-fairy-ink", className)} data-numeric>
        {value}
      </span>
    </>
  );
}

/** A caption over a bold value, left aligned like everything else on these mock-ups. */
export function Fact({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="fs-lab text-[10.5px]">{label}</p>
      <p className="font-bold text-fairy-ink" data-numeric>
        {value}
      </p>
    </div>
  );
}

/** The stamp that says this is a drawing, not somebody's real paperwork. */
export function SampleChip() {
  return (
    <span className="shrink-0 border border-fairy-tint-ink px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-[0.14em] text-fairy-tint-ink">
      SAMPLE
    </span>
  );
}
