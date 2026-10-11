import { Info } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The small "i" that opens an explanation. Every info icon in the app is this one, so they
 * all look and behave alike. The padding and the matching negative margin make a tap target
 * of about 26px around an icon that stays 14px. It takes the props of a button (a Radix
 * trigger hands it its handlers and ref), and always says what it opens.
 */
export function InfoButton({
  label,
  className,
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "-m-1.5 inline-flex p-1.5 text-fairy-grey transition-colors hover:text-fairy-ink",
        className,
      )}
      {...props}
    >
      <Info aria-hidden className="size-3.5" />
    </button>
  );
}
