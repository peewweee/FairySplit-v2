import { describe, expect, it } from "vitest";
import { decomposeOverlaps } from "@/lib/tracking/overlap";

/** A local instant on a fixed day, hour precision. `h(14)` is 2pm. */
const h = (hour: number, day = 1) => new Date(2026, 7, day, hour, 0, 0).toISOString();
const WINDOW_START = new Date(2026, 7, 1).getTime();
const WINDOW_END = new Date(2026, 7, 2).getTime();

const span = (startedAt: string, endedAt: string, participantIds: string[]) => ({
  startedAt,
  endedAt,
  participantIds,
});

describe("decomposeOverlaps", () => {
  it("splits the exact case it exists for: A 2-4pm, B 3-5pm share the 3-4pm hour", () => {
    const segments = decomposeOverlaps(
      [span(h(14), h(16), ["A"]), span(h(15), h(17), ["B"])],
      WINDOW_START,
      WINDOW_END,
    );
    expect(segments).toEqual(
      expect.arrayContaining([
        { participantIds: ["A"], hours: 1 },
        { participantIds: ["A", "B"], hours: 1 },
        { participantIds: ["B"], hours: 1 },
      ]),
    );
    expect(segments).toHaveLength(3);
    // The household did not use 4 hours of aircon between them — 3.
    expect(segments.reduce((sum, s) => sum + s.hours, 0)).toBe(3);
  });

  it("leaves disjoint spans alone — no false overlap between unrelated runs", () => {
    const segments = decomposeOverlaps(
      [span(h(10), h(12), ["A"]), span(h(14), h(15), ["B"])],
      WINDOW_START,
      WINDOW_END,
    );
    expect(segments).toEqual(
      expect.arrayContaining([
        { participantIds: ["A"], hours: 2 },
        { participantIds: ["B"], hours: 1 },
      ]),
    );
    expect(segments).toHaveLength(2);
  });

  it("touching but not overlapping (one ends exactly when the other starts) stays solo", () => {
    const segments = decomposeOverlaps(
      [span(h(10), h(12), ["A"]), span(h(12), h(14), ["B"])],
      WINDOW_START,
      WINDOW_END,
    );
    expect(segments).toEqual(
      expect.arrayContaining([
        { participantIds: ["A"], hours: 2 },
        { participantIds: ["B"], hours: 2 },
      ]),
    );
    expect(segments).toHaveLength(2);
  });

  it("three-way overlap shares the triple-covered slice between all three", () => {
    // A 1-4pm, B 2-5pm, C 3-4pm only.
    const segments = decomposeOverlaps(
      [span(h(13), h(16), ["A"]), span(h(14), h(17), ["B"]), span(h(15), h(16), ["C"])],
      WINDOW_START,
      WINDOW_END,
    );
    expect(segments).toEqual(
      expect.arrayContaining([
        { participantIds: ["A"], hours: 1 }, // 1-2pm
        { participantIds: ["A", "B"], hours: 1 }, // 2-3pm
        { participantIds: ["A", "B", "C"], hours: 1 }, // 3-4pm
        { participantIds: ["B"], hours: 1 }, // 4-5pm
      ]),
    );
    expect(segments).toHaveLength(4);
  });

  it("an entry already logged for several people contributes its whole group to any overlap", () => {
    // Janna+Jem together 1-3pm; Phoebe solo 2-4pm.
    const segments = decomposeOverlaps(
      [span(h(13), h(15), ["Janna", "Jem"]), span(h(14), h(16), ["Phoebe"])],
      WINDOW_START,
      WINDOW_END,
    );
    expect(segments).toEqual(
      expect.arrayContaining([
        { participantIds: ["Janna", "Jem"], hours: 1 }, // 1-2pm
        { participantIds: ["Janna", "Jem", "Phoebe"], hours: 1 }, // 2-3pm
        { participantIds: ["Phoebe"], hours: 1 }, // 3-4pm
      ]),
    );
  });

  it("merges non-contiguous slices for the same group into one total", () => {
    // A alone 1-2pm, A+B together 2-3pm, gap, A+B together again 4-5pm.
    const segments = decomposeOverlaps(
      [span(h(13), h(15), ["A"]), span(h(14), h(15), ["B"]), span(h(16), h(17), ["A", "B"])],
      WINDOW_START,
      WINDOW_END,
    );
    const ab = segments.find((s) => s.participantIds.join(",") === "A,B");
    expect(ab?.hours).toBe(2); // 1 hour at 2-3pm + 1 hour at 4-5pm, summed.
  });

  it("clips every span to the window, same rule a solo entry already follows", () => {
    // Run starts before the window and ends after it: only the middle counts.
    const before = new Date(2026, 6, 31, 22).toISOString(); // 10pm the day before
    const after = new Date(2026, 7, 2, 2).toISOString(); // 2am the day after
    const segments = decomposeOverlaps([span(before, after, ["A"])], WINDOW_START, WINDOW_END);
    expect(segments).toEqual([{ participantIds: ["A"], hours: 24 }]);
  });

  it("a gap between two runs contributes nothing, not a phantom shared slice", () => {
    const segments = decomposeOverlaps(
      [span(h(10), h(11), ["A"]), span(h(13), h(14), ["B"])],
      WINDOW_START,
      WINDOW_END,
    );
    expect(segments.reduce((sum, s) => sum + s.hours, 0)).toBe(2);
  });

  it("is empty for no entries, and ignores an entry with nobody on it", () => {
    expect(decomposeOverlaps([], WINDOW_START, WINDOW_END)).toEqual([]);
    expect(decomposeOverlaps([span(h(10), h(11), [])], WINDOW_START, WINDOW_END)).toEqual([]);
  });

  it("drops a span entirely clipped away by the window", () => {
    const nextDay = new Date(2026, 7, 3, 10).toISOString();
    const nextDayEnd = new Date(2026, 7, 3, 11).toISOString();
    expect(decomposeOverlaps([span(nextDay, nextDayEnd, ["A"])], WINDOW_START, WINDOW_END)).toEqual([]);
  });

  it("never invents hours: total output always equals total wall-clock coverage", () => {
    // A messy set: some solo, some overlapping, some touching.
    const entries = [
      span(h(9), h(11), ["A"]),
      span(h(10), h(12), ["B"]),
      span(h(12), h(13), ["A", "B"]),
      span(h(15), h(18), ["C"]),
      span(h(16), h(17), ["A"]),
    ];
    const segments = decomposeOverlaps(entries, WINDOW_START, WINDOW_END);
    // Wall-clock union covered: 9am-1pm (4h) + 3pm-6pm (3h) = 7h.
    const totalWallClockHours = 7;
    // Each hour of wall-clock time appears in exactly one segment's duration
    // regardless of how many people were in it, EXCEPT the 4-5pm slice which
    // is double-covered by C's 3-6pm run and A's 4-5pm run — that hour
    // legitimately becomes a 2-person slice, not double-counted time.
    const bySlice = segments.reduce((sum, s) => sum + s.hours, 0);
    expect(bySlice).toBeCloseTo(totalWallClockHours, 10);
  });
});
