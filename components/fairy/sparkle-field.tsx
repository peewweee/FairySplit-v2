"use client";

import { useState, type CSSProperties } from "react";

import { rollSparkle, type SparkleSpec, type Tone } from "@/lib/sparkle";
import { cn } from "@/lib/utils";

/** How many of the sparkles a small screen keeps: the rest are hidden below `sm`. */
const SMALL_SCREEN = 6;

/**
 * The pens: a bright pink, a deeper rose and a soft ink, so it reads as a doodle in
 * a few colours rather than a repeating pattern.
 */
const PEN: Record<Tone, { color: string; opacity: number }> = {
  pink: { color: "var(--pink)", opacity: 0.95 },
  rose: { color: "var(--pink-deep)", opacity: 0.6 },
  ink: { color: "var(--ink-2)", opacity: 0.32 },
};

/**
 * Hand-drawn diamond sparkles scattered behind the landing page, each drawn as a
 * single line being traced round, held for a moment, and rubbed out again.
 *
 * The first sparkles are chosen on the server, once per visit, and handed in. That is
 * what lets them be in the page from the very first paint, so they begin drawing
 * before anything else on the page does: nothing here waits for the browser to run any
 * script. Every move after that is chosen in the browser.
 *
 * Decorative only: hidden from screen readers and never in the way of a click.
 */
export function SparkleField({ initial }: { initial: SparkleSpec[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {initial.map((first, i) => (
        <Sparkle key={i} first={first} className={i >= SMALL_SCREEN ? "max-sm:hidden" : undefined} />
      ))}
    </div>
  );
}

/**
 * One sparkle: drawn on, held, rubbed out, and then drawn somewhere else.
 *
 * It moves when its stroke starts a new cycle. At that moment the stroke is hidden
 * (a cycle begins with nothing drawn), so nobody sees it jump: a fresh diamond in a
 * new place is simply what gets drawn next. `roll` is the key, which gives the new
 * stroke a fresh animation that starts from nothing.
 */
function Sparkle({ first, className }: { first: SparkleSpec; className?: string }) {
  const [roll, setRoll] = useState(0);
  const [spec, setSpec] = useState(first);

  const pen = PEN[spec.tone];

  return (
    <svg
      key={roll}
      viewBox="0 0 100 100"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("absolute", className)}
      style={{
        left: `${spec.x}%`,
        top: `${spec.y}%`,
        width: spec.size,
        height: spec.size,
        // The pen starts at the top of the outline and goes clockwise. Turning the
        // sparkle by quarters changes which corner that is, and mirroring it changes
        // which way round it goes, so no two begin quite alike.
        transform: `translate(-50%, -50%) rotate(${spec.start * 90 + spec.turn}deg) scaleX(${spec.mirror ? -1 : 1})`,
        stroke: pen.color,
        // About two pixels wide whatever the size: the drawing box is 100 units across.
        strokeWidth: (2 / spec.size) * 100,
        opacity: pen.opacity,
      }}
    >
      <path
        d={spec.outline}
        pathLength={1}
        className="fs-sparkle-stroke"
        style={
          {
            "--sparkle-seconds": `${spec.seconds}s`,
            "--sparkle-delay": `${spec.startAfter}s`,
          } as CSSProperties
        }
        onAnimationIteration={() => {
          setSpec(rollSparkle(Math.random));
          setRoll((n) => n + 1);
        }}
      />
    </svg>
  );
}
