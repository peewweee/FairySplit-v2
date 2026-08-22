import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Buttons, per the blush design system.
 *
 * Square corners, 700 weight, tight tracking. The filled button is pink with
 * near-black text — the pink is a background colour and never a text colour.
 * The outline button carries a HEAVY 1.8px near-black stroke, not a timid grey
 * one; that contrast is most of what makes the pair read as designed.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-fairy-pink text-fairy-ink hover:bg-[color-mix(in_oklab,var(--pink),var(--ink)_9%)]",
        outline:
          "border-[length:var(--bw-outline)] border-fairy-ink bg-transparent text-fairy-ink hover:bg-fairy-ink hover:text-white",
        secondary:
          "bg-fairy-tint text-fairy-tint-ink hover:bg-[color-mix(in_oklab,var(--pink-tint),var(--pink)_35%)]",
        ghost: "text-fairy-ink-2 hover:bg-fairy-screen hover:text-fairy-ink",
        destructive:
          "bg-fairy-danger-tint text-fairy-danger hover:bg-[color-mix(in_oklab,var(--danger-tint),var(--danger)_12%)]",
        link: "text-fairy-ink underline-offset-4 hover:underline",
      },
      size: {
        // 15px/700 with generous padding is the sample's primary action.
        default: "h-9 gap-2 px-3.5 text-[14px] tracking-[-0.012em]",
        xs: "h-6 gap-1 px-2 text-[11.5px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-2.5 text-[12.5px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-4 text-[15px] tracking-[-0.012em]",
        /** Full-bleed, the way the sample stacks its primary actions. */
        block: "h-[50px] w-full gap-2 px-4 text-[15px] tracking-[-0.012em]",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
