const MS_PER_HOUR = 3_600_000;

/** One non-overlapping slice of time and who was actually using it then. */
export interface TimeSegment {
  /** Sorted, deduplicated — the union of everyone whose span covered this slice. */
  participantIds: string[];
  /** Hours, already clipped to the window passed in. */
  hours: number;
}

interface Span {
  startMs: number;
  endMs: number;
  participantIds: string[];
}

/**
 * Turns a set of possibly-overlapping clock spans into the non-overlapping
 * slices they actually describe.
 *
 * Two people who each ran the aircon 2-4pm and 3-5pm were not using 4 hours
 * of it between them — they were using 3: one hour each alone, and one hour
 * together. That third slice is what this computes: cut the timeline at
 * every point a span starts or ends, and for each resulting slice, whoever's
 * span fully covers it (which, by construction of the cuts, is anyone whose
 * span covers ANY of it) shares that slice's cost equally — the same rule
 * an entry deliberately logged for several people already uses, just found
 * automatically instead of requiring everyone to remember to tick each
 * other's names when their times happen to coincide.
 *
 * Slices with the same participant set are summed together, so a person
 * clocked in across several separate stretches gets one total, not one row
 * per stretch. A slice nobody's span covers (a gap between runs) contributes
 * nothing.
 *
 * Pure — like the engine and the rest of this module, `windowStartMs` and
 * `windowEndMs` are passed in rather than read from `Date.now()`, so this is
 * exactly as testable at a fixed instant as everything else here.
 */
export function decomposeOverlaps(
  entries: { startedAt: string; endedAt: string; participantIds: string[] }[],
  windowStartMs: number,
  windowEndMs: number,
): TimeSegment[] {
  const spans: Span[] = [];
  for (const entry of entries) {
    if (entry.participantIds.length === 0) continue;
    const from = Date.parse(entry.startedAt);
    const to = Date.parse(entry.endedAt);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const startMs = Math.max(from, windowStartMs);
    const endMs = Math.min(to, windowEndMs);
    if (endMs <= startMs) continue;
    spans.push({ startMs, endMs, participantIds: entry.participantIds });
  }
  if (spans.length === 0) return [];

  // Every point where who's active could change. A span covering any part of
  // a slice between two consecutive cuts necessarily covers the whole of it
  // — there is no earlier or later cut inside the slice where it could have
  // started or stopped — so checking full coverage is enough to know if a
  // span is active for that slice.
  const cuts = [...new Set(spans.flatMap((s) => [s.startMs, s.endMs]))].sort((a, b) => a - b);

  const totals = new Map<string, TimeSegment>();
  for (let i = 0; i < cuts.length - 1; i++) {
    const sliceStart = cuts[i];
    const sliceEnd = cuts[i + 1];
    if (sliceEnd <= sliceStart) continue;

    const active = new Set<string>();
    for (const span of spans) {
      if (span.startMs <= sliceStart && span.endMs >= sliceEnd) {
        for (const id of span.participantIds) active.add(id);
      }
    }
    if (active.size === 0) continue;

    const participantIds = [...active].sort();
    const key = participantIds.join(",");
    const hours = (sliceEnd - sliceStart) / MS_PER_HOUR;
    const existing = totals.get(key);
    if (existing) existing.hours += hours;
    else totals.set(key, { participantIds, hours });
  }

  return [...totals.values()];
}
