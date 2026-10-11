import { describe, expect, it } from "vitest";
import {
  allowedRange,
  fromParts,
  hourBlocked,
  meridiemBlocked,
  minuteBlocked,
  toMinutes,
  toParts,
  toTime,
  withPart,
} from "@/lib/tracking/time-of-day";
import { spanFromTimes } from "@/lib/tracking/span";

describe("toMinutes / toTime", () => {
  it("reads HH:MM and writes it back", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("04:00")).toBe(240);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("23:59")).toBe(1439);
    for (const minutes of [0, 1, 59, 60, 241, 719, 720, 1438, 1439]) {
      expect(toMinutes(toTime(minutes))).toBe(minutes);
    }
    expect(toTime(570)).toBe("09:30");
    expect(toTime(0)).toBe("00:00");
  });

  it("refuses anything that is not a time of day", () => {
    for (const bad of ["", "9", "ab:cd", "24:00", "12:60", "12:5", "-1:30", "09:30 AM"]) {
      expect(toMinutes(bad)).toBeNull();
    }
  });
});

describe("12-hour parts", () => {
  it("splits and joins every minute of the day without loss", () => {
    for (let minutes = 0; minutes < 1440; minutes += 1) {
      expect(fromParts(toParts(minutes))).toBe(minutes);
    }
  });

  it("puts midnight at 12 AM and noon at 12 PM", () => {
    expect(toParts(0)).toEqual({ hour12: 12, minute: 0, meridiem: "AM" });
    expect(toParts(720)).toEqual({ hour12: 12, minute: 0, meridiem: "PM" });
    expect(toParts(1439)).toEqual({ hour12: 11, minute: 59, meridiem: "PM" });
  });
});

describe("allowedRange", () => {
  it("lets the whole day through when nothing is paired with it", () => {
    expect(allowedRange({})).toEqual({ lo: 0, hi: 1439 });
  });

  it("starts an end one minute after its start", () => {
    expect(allowedRange({ after: "04:00" })).toEqual({ lo: 241, hi: 1439 });
    // The defaults of the add form: 00:00 to 23:59 is valid, and 00:00 is not an end.
    expect(allowedRange({ after: "00:00" }).lo).toBe(1);
  });

  it("stops a start one minute before its end", () => {
    expect(allowedRange({ before: "03:08" })).toEqual({ lo: 0, hi: 187 });
    expect(allowedRange({ before: "23:59" }).hi).toBe(1438);
  });

  it("never comes out empty, even when the other time is at the edge of the day", () => {
    expect(allowedRange({ after: "23:59" })).toEqual({ lo: 1439, hi: 1439 });
    expect(allowedRange({ before: "00:00" })).toEqual({ lo: 0, hi: 0 });
  });
});

describe("what the 'To' field blocks once 'From' is 4:00 AM", () => {
  const range = allowedRange({ after: "04:00" });

  it("blocks every hour before 4 AM, including 12 AM", () => {
    for (const hour of [12, 1, 2, 3]) expect(hourBlocked(hour, "AM", range)).toBe(true);
    expect(hourBlocked(4, "AM", range)).toBe(false);
    for (const hour of [5, 6, 7, 8, 9, 10, 11]) expect(hourBlocked(hour, "AM", range)).toBe(false);
  });

  it("leaves the whole afternoon open", () => {
    for (const hour of [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(hourBlocked(hour, "PM", range)).toBe(false);
    }
  });

  it("blocks the minutes up to and including :00 inside 4 AM itself", () => {
    expect(minuteBlocked(0, 4, "AM", range)).toBe(true);
    expect(minuteBlocked(1, 4, "AM", range)).toBe(false);
    expect(minuteBlocked(59, 4, "AM", range)).toBe(false);
    // Any other hour at or after 5 AM is whole.
    expect(minuteBlocked(0, 5, "AM", range)).toBe(false);
  });
});

describe("what the 'From' field blocks once 'To' is 3:08 AM", () => {
  const range = allowedRange({ before: "03:08" });

  it("blocks every hour after 3 AM, and the whole afternoon", () => {
    for (const hour of [4, 5, 6, 7, 8, 9, 10, 11]) expect(hourBlocked(hour, "AM", range)).toBe(true);
    for (const hour of [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(hourBlocked(hour, "PM", range)).toBe(true);
    }
    expect(meridiemBlocked("PM", range)).toBe(true);
    expect(meridiemBlocked("AM", range)).toBe(false);
  });

  it("blocks the minutes from :08 on inside 3 AM itself", () => {
    expect(minuteBlocked(7, 3, "AM", range)).toBe(false);
    expect(minuteBlocked(8, 3, "AM", range)).toBe(true);
    expect(minuteBlocked(59, 3, "AM", range)).toBe(true);
    expect(minuteBlocked(30, 2, "AM", range)).toBe(false);
  });
});

describe("meridiemBlocked", () => {
  it("blocks AM once the earliest allowed time is in the afternoon", () => {
    expect(meridiemBlocked("AM", allowedRange({ after: "13:00" }))).toBe(true);
    expect(meridiemBlocked("PM", allowedRange({ after: "13:00" }))).toBe(false);
    // 11:59 AM is the last morning minute, so an end after it has no AM left either.
    expect(meridiemBlocked("AM", allowedRange({ after: "11:59" }))).toBe(true);
    expect(meridiemBlocked("AM", allowedRange({ after: "11:58" }))).toBe(false);
  });
});

describe("the three lists agree with the range, minute by minute", () => {
  // Every minute of the day is reachable through the lists exactly when it is allowed.
  for (const [name, range] of [
    ["the whole day", allowedRange({})],
    ["after 04:00", allowedRange({ after: "04:00" })],
    ["after 12:00", allowedRange({ after: "12:00" })],
    ["before 03:08", allowedRange({ before: "03:08" })],
    ["before 12:00", allowedRange({ before: "12:00" })],
    ["after 23:58", allowedRange({ after: "23:58" })],
  ] as const) {
    it(`for a field ${name}`, () => {
      for (let minutes = 0; minutes < 1440; minutes += 1) {
        const parts = toParts(minutes);
        const reachable =
          !meridiemBlocked(parts.meridiem, range) &&
          !hourBlocked(parts.hour12, parts.meridiem, range) &&
          !minuteBlocked(parts.minute, parts.hour12, parts.meridiem, range);
        expect(reachable).toBe(minutes >= range.lo && minutes <= range.hi);
      }
    });
  }
});

describe("withPart", () => {
  it("changes one piece and keeps the other two", () => {
    const whole = allowedRange({});
    expect(withPart(570, { hour12: 11 }, whole)).toBe(11 * 60 + 30);
    expect(withPart(570, { minute: 45 }, whole)).toBe(9 * 60 + 45);
    expect(withPart(570, { meridiem: "PM" }, whole)).toBe(21 * 60 + 30);
  });

  it("snaps to the edge instead of settling on a blocked time", () => {
    // 'To' after 4:00 AM, sitting at 5:30 PM. Flipping it to AM and then to the
    // hour 3 would be 3:30 AM, which is blocked: it lands on 4:01 AM.
    const range = allowedRange({ after: "04:00" });
    expect(withPart(17 * 60 + 30, { hour12: 3, meridiem: "AM" }, range)).toBe(4 * 60 + 1);
    // Moving into the first allowed hour while the minute is :00 is blocked too.
    expect(withPart(17 * 60, { hour12: 4, meridiem: "AM" }, range)).toBe(4 * 60 + 1);
    // 'From' before 3:08 AM, sitting at 1:00 AM. Hour 5 is blocked: it lands on 3:07 AM.
    const early = allowedRange({ before: "03:08" });
    expect(withPart(60, { hour12: 5 }, early)).toBe(3 * 60 + 7);
  });
});

describe("a pair built from the allowed ranges is always a real span", () => {
  it("never lets 'From' and 'To' meet or cross", () => {
    for (let from = 0; from < 1439; from += 37) {
      for (let to = from + 1; to < 1440; to += 41) {
        const fromRange = allowedRange({ before: toTime(to) });
        const toRange = allowedRange({ after: toTime(from) });
        expect(from >= fromRange.lo && from <= fromRange.hi).toBe(true);
        expect(to >= toRange.lo && to <= toRange.hi).toBe(true);
        expect(spanFromTimes("2026-10-11", toTime(from), toTime(to)).ok).toBe(true);
      }
    }
  });
});
