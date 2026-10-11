"use client";

import type { ReactNode } from "react";
import { InfoButton } from "@/components/fairy/info-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * An info icon with a short explanation that opens beside it: tap to open, tap anywhere
 * else (or press Escape) to close. A popover rather than a hover tooltip, because hover does
 * nothing on a phone. For anything bigger than a line or two, use a dialog the way
 * `RateInfo` does.
 */
export function InfoPopover({
  label,
  children,
  className,
}: {
  /** What the icon opens, for the button's accessible name and the panel's. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <InfoButton label={label} className={className} />
      </PopoverTrigger>
      <PopoverContent
        aria-label={label}
        className="text-[12.5px] leading-[1.5] font-medium text-fairy-ink-2"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
