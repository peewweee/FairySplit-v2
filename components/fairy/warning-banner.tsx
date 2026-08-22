"use client";

import { useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { Notice } from "@/components/fairy/shell-bits";
import { WARNING_COPY, type Warning } from "@/lib/billing/engine";

/**
 * Engine warnings render as a soft, dismissible notice above the share table —
 * never as a blocking error (10.2). The split is still correct; the warning is
 * about the inputs.
 */
export function WarningBanner({ warnings }: { warnings: Warning[] }) {
  const [dismissed, setDismissed] = useState<Warning[]>([]);
  const showing = warnings.filter((w) => !dismissed.includes(w));
  if (showing.length === 0) return null;

  return (
    <div className="grid gap-2">
      {showing.map((warning) => (
        <div key={warning} role="status" className="animate-reveal">
          <Notice tone="ember" icon={<TriangleAlert className="size-4" aria-hidden />}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-fairy-ember">{WARNING_COPY[warning].title}</p>
                <p className="mt-1 font-medium text-fairy-ink-2">
                  {WARNING_COPY[warning].detail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDismissed((d) => [...d, warning])}
                aria-label={`Dismiss: ${WARNING_COPY[warning].title}`}
                className="-my-1 shrink-0 p-1 text-fairy-ember/70 transition-colors hover:text-fairy-ember"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </Notice>
        </div>
      ))}
    </div>
  );
}
