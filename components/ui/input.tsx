import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 border border-fairy-hair-2 bg-card px-3 py-1 text-[14px] font-medium text-fairy-ink transition-colors outline-none placeholder:font-normal placeholder:text-fairy-grey/80 focus-visible:border-fairy-rose disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-fairy-screen disabled:opacity-60 aria-invalid:border-fairy-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
