"use client";

import { useCallback, useState } from "react";

/**
 * A tiny puff of fairy dust on a successful save (section 11).
 *
 * Motion is gated globally by the `prefers-reduced-motion` block in
 * globals.css, which collapses the animation to ~0ms. The burst is decorative
 * only - it is aria-hidden and never carries information on its own.
 */
export function SparkleBurst({ burst }: { burst: number }) {
  if (burst === 0) return null;
  return (
    <span
      key={burst}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
    >
      {SPARKS.map((spark, i) => (
        <span
          key={i}
          className="animate-sparkle absolute size-1.5 rounded-full bg-fairy-pink"
          style={{
            left: spark.left,
            top: spark.top,
            animationDelay: spark.delay,
            boxShadow: "0 0 6px 1px var(--pink)",
          }}
        />
      ))}
    </span>
  );
}

const SPARKS = [
  { left: "12%", top: "30%", delay: "0ms" },
  { left: "38%", top: "10%", delay: "70ms" },
  { left: "62%", top: "42%", delay: "140ms" },
  { left: "84%", top: "18%", delay: "40ms" },
  { left: "50%", top: "68%", delay: "180ms" },
] as const;

/** `sparkle()` after a successful write; feed `burst` to <SparkleBurst />. */
export function useSparkle() {
  const [burst, setBurst] = useState(0);
  const sparkle = useCallback(() => setBurst((n) => n + 1), []);
  return { burst, sparkle };
}
