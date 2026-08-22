"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * A square switch. The design system is zero-radius everywhere except true
 * circles, and a toggle track is not a circle.
 *
 * Uses explicit `data-[state=...]` variants rather than shadcn's `data-checked:`
 * shorthand — the shorthand did not win over the checked rule here, leaving the
 * track pink in both states.
 */
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center border transition-colors outline-none",
        // an expanded hit area so a 32px control still meets the 24px minimum
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "data-[size=default]:h-[20px] data-[size=default]:w-[34px]",
        "data-[size=sm]:h-[16px] data-[size=sm]:w-[26px]",
        "data-[state=unchecked]:border-fairy-hair-2 data-[state=unchecked]:bg-fairy-screen",
        "data-[state=checked]:border-fairy-ink data-[state=checked]:bg-fairy-pink",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block transition-transform",
          "group-data-[size=default]/switch:size-[14px] group-data-[size=sm]/switch:size-[10px]",
          "data-[state=unchecked]:translate-x-[2px] data-[state=unchecked]:bg-fairy-grey",
          "data-[state=checked]:bg-fairy-ink",
          "group-data-[size=default]/switch:data-[state=checked]:translate-x-[18px]",
          "group-data-[size=sm]/switch:data-[state=checked]:translate-x-[14px]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
