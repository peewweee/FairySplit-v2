"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** The room's 6-character code, as a square pink-tint block with one-click copy. */
export function JoinCode({
  code,
  copyable = false,
  className,
}: {
  code: string;
  copyable?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const body = (
    <span className="text-[12.5px] font-extrabold tracking-[0.18em] tabular-nums">
      {code}
    </span>
  );

  if (!copyable) {
    return (
      <span
        className={cn(
          "shrink-0 bg-fairy-tint px-2.5 py-1.5 text-fairy-tint-ink",
          className,
        )}
      >
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(code).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5 bg-fairy-tint px-3 py-2 text-fairy-tint-ink transition-colors hover:bg-[color-mix(in_oklab,var(--pink-tint),var(--pink)_35%)]",
        className,
      )}
      aria-label={copied ? "Join code copied" : `Copy join code ${code}`}
    >
      {body}
      {copied ? (
        <Check className="size-3.5 text-fairy-moss" aria-hidden />
      ) : (
        <Copy className="size-3.5 opacity-70" aria-hidden />
      )}
    </button>
  );
}
