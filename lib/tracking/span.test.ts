import { describe, expect, it } from "vitest";
import { spanFromTimes } from "@/lib/tracking/span";

/** A local instant on Oct 11, 2026 — built the way the code under test builds them. */
const at = (hour: number, minute = 0) => new Date(2026, 9, 11, hour, minute, 0).toISOString();

const NOT_AFTER_START = { ok: false, problem: "not-after-start" };
const INCOMPLETE = { ok: false, problem: "incomplete" };

describe("spanFromTimes", () => {
  it("reads a date and two times as local instants", () => {
    expect(spanFromTimes("2026-10-11", "09:00", "17:30")).toEqual({
      ok: true,
      startedAt: at(9),
      endedAt: at(17, 30),
    });
  });

  it("refuses 9:00 AM to 3:59 AM — 3:59 AM has already gone by 9:00 AM that day", () => {
    // The case that was reported. It used to be saved as a 19-hour entry that
    // ended the next morning.
    expect(spanFromTimes("2026-10-11", "09:00", "03:59")).toEqual(NOT_AFTER_START);
  });

  it("refuses an end equal to the start — it used to become a full 24 hours", () => {
    expect(spanFromTimes("2026-10-11", "09:00", "09:00")).toEqual(NOT_AFTER_START);
    expect(spanFromTimes("2026-10-11", "00:00", "00:00")).toEqual(NOT_AFTER_START);
  });

  it("refuses a night that runs past midnight, whose two halves are each fine", () => {
    expect(spanFromTimes("2026-10-10", "22:00", "08:00")).toEqual(NOT_AFTER_START);
    // Typed the way the message says: the evening on one date, the morning on the next.
    expect(spanFromTimes("2026-10-10", "22:00", "23:59").ok).toBe(true);
    expect(spanFromTimes("2026-10-11", "00:00", "08:00").ok).toBe(true);
  });

  it("accepts the whole day, and a single minute", () => {
    expect(spanFromTimes("2026-10-11", "00:00", "23:59")).toEqual({
      ok: true,
      startedAt: at(0),
      endedAt: at(23, 59),
    });
    expect(spanFromTimes("2026-10-11", "23:58", "23:59").ok).toBe(true);
  });

  it("refuses 23:59 to 00:00, the wrap that looks like one minute", () => {
    expect(spanFromTimes("2026-10-11", "23:59", "00:00")).toEqual(NOT_AFTER_START);
  });

  it("never produces a span that leaves its day", () => {
    let accepted = 0;
    for (let a = 0; a < 24; a += 1) {
      for (let b = 0; b < 24; b += 1) {
        const hh = (n: number) => `${String(n).padStart(2, "0")}:00`;
        const span = spanFromTimes("2026-10-11", hh(a), hh(b));
        if (!span.ok) {
          // The only reason an hour-to-hour span is refused is that it does not move forward.
          expect(b).toBeLessThanOrEqual(a);
          continue;
        }
        accepted += 1;
        const start = new Date(span.startedAt);
        const end = new Date(span.endedAt);
        expect(start.getDate()).toBe(11);
        expect(end.getDate()).toBe(11);
        expect(end.getTime()).toBeGreaterThan(start.getTime());
      }
    }
    // 24 choose 2: every strictly forward pair, and nothing else.
    expect(accepted).toBe(276);
  });

  it("calls a blank or unreadable date or time incomplete, not wrong", () => {
    expect(spanFromTimes("", "09:00", "10:00")).toEqual(INCOMPLETE);
    expect(spanFromTimes("not-a-date", "09:00", "10:00")).toEqual(INCOMPLETE);
    expect(spanFromTimes("2026-10-11", "", "10:00")).toEqual(INCOMPLETE);
    expect(spanFromTimes("2026-10-11", "09:00", "")).toEqual(INCOMPLETE);
    expect(spanFromTimes("2026-10-11", "ab:cd", "10:00")).toEqual(INCOMPLETE);
  });

  it("calls a date no calendar can hold incomplete rather than throwing", () => {
    // Past the largest date a JavaScript Date can represent: toISOString would throw.
    expect(spanFromTimes("999999-01-01", "09:00", "10:00")).toEqual(INCOMPLETE);
  });
});
