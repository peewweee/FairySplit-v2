import { describe, expect, it } from "vitest";
import {
  amountToday,
  dayBounds,
  dayKeyOf,
  describeQuantity,
  formatDuration,
  formatQuantity,
  hoursSince,
  runningCount,
  nextMidnight,
  settledFor,
  shareOf,
  todayFor,
  totalFor,
} from "@/lib/tracking/elapsed";
import type { LogEntry, Tracker } from "@/lib/data/types";

const T0 = Date.parse("2026-08-22T09:00:00.000Z");
const at = (hours: number) => T0 + hours * 3_600_000;

function entry(memberId: string, quantity: number, id = `e-${memberId}-${quantity}`): LogEntry {
  return {
    id,
    participantIds: [memberId],
    quantity,
    startedAt: null,
    endedAt: null,
    createdAt: "2026-08-22T09:00:00.000Z",
  };
}

function tracker(over: Partial<Tracker> = {}): Tracker {
  return {
    id: "T1",
    roomId: "R1",
    name: "Hours in the unit",
    mode: "clock",
    builtIn: true,
    sortOrder: 0,
    runningSince: {},
    runningWith: {},
    entries: [],
    createdAt: "2026-08-22T09:00:00.000Z",
    ...over,
  };
}

describe("hoursSince", () => {
  it("measures forward in hours", () => {
    expect(hoursSince("2026-08-22T09:00:00.000Z", at(2.5))).toBe(2.5);
  });

  it("floors at zero when the device clock has moved backwards", () => {
    // An NTP correction or a manual timezone change must never hand somebody
    // negative hours — that is a credit for time they did not stay.
    expect(hoursSince("2026-08-22T09:00:00.000Z", at(-3))).toBe(0);
  });

  it("reads an unparseable instant as zero rather than NaN", () => {
    expect(hoursSince("not a date", at(5))).toBe(0);
  });
});

describe("settledFor / totalFor", () => {
  const t = tracker({
    entries: [entry("P1", 3), entry("P1", 1.5), entry("P2", 40)],
    runningSince: { P1: "2026-08-22T09:00:00.000Z" },
  });

  it("adds up only that person's entries", () => {
    expect(settledFor(t, "P1")).toBe(4.5);
    expect(settledFor(t, "P2")).toBe(40);
    expect(settledFor(t, "P3")).toBe(0);
  });

  it("settled total ignores the running clock", () => {
    expect(settledFor(t, "P1")).toBe(4.5);
  });

  it("total folds the running clock in", () => {
    expect(totalFor(t, "P1", at(2))).toBe(6.5);
  });

  it("total equals settled for somebody who is not clocked in", () => {
    expect(totalFor(t, "P2", at(2))).toBe(40);
  });

  it("counts who is running", () => {
    expect(runningCount(t)).toBe(1);
    expect(runningCount(tracker())).toBe(0);
  });
});

describe("formatDuration", () => {
  it("shows hours, minutes and seconds", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(1)).toBe("01:00:00");
    expect(formatDuration(4 + 15 / 60 + 9 / 3600)).toBe("04:15:09");
  });

  it("splits days out once it passes twenty-four hours", () => {
    expect(formatDuration(24)).toBe("1d 00:00:00");
    expect(formatDuration(76.25)).toBe("3d 04:15:00");
  });

  it("never renders a negative clock", () => {
    expect(formatDuration(-5)).toBe("00:00:00");
  });
});

describe("formatQuantity", () => {
  it("keeps a whole cycle whole, but does not round a share to one", () => {
    expect(formatQuantity(4, "per_cycle")).toBe("4");
    // A 2-cycle entry split three ways. Rounding this to "1" would contradict
    // the formula shown beside it on the bill.
    expect(formatQuantity(2 / 3, "per_cycle")).toBe("0.67");
  });

  it("drops pointless decimals on hours and days", () => {
    expect(formatQuantity(12, "per_hour")).toBe("12");
    expect(formatQuantity(12.5, "per_hour")).toBe("12.5");
    expect(formatQuantity(12.507, "per_hour")).toBe("12.51");
    expect(formatQuantity(2, "per_day")).toBe("2");
  });
});

describe("describeQuantity", () => {
  it("agrees with the number", () => {
    expect(describeQuantity(1, "per_cycle", "cycle", "cycles")).toBe("1 cycle");
    expect(describeQuantity(4, "per_cycle", "cycle", "cycles")).toBe("4 cycles");
    expect(describeQuantity(1.5, "per_hour", "hour", "hours")).toBe("1.5 hours");
    expect(describeQuantity(0, "per_day", "day", "days")).toBe("0 days");
  });
});

/* -- the daily reset ------------------------------------------------------ *
 * Everything below is built from the local-date constructor rather than from
 * fixed UTC strings, so these pass wherever the machine running them sits.
 * ------------------------------------------------------------------------- */

/** A local instant on 22 Aug 2026. */
const local = (h: number, m = 0, day = 22) => new Date(2026, 7, day, h, m, 0).getTime();
const iso = (h: number, m = 0, day = 22) => new Date(2026, 7, day, h, m, 0).toISOString();

function clockEntry(memberId: string, fromH: number, toH: number, fromDay = 22, toDay = 22): LogEntry {
  const startedAt = iso(fromH, 0, fromDay);
  const endedAt = iso(toH, 0, toDay);
  return {
    id: `c-${fromDay}-${fromH}`,
    participantIds: [memberId],
    quantity: (Date.parse(endedAt) - Date.parse(startedAt)) / 3_600_000,
    startedAt,
    endedAt,
    createdAt: endedAt,
  };
}

describe("dayBounds / dayKeyOf / nextMidnight", () => {
  it("brackets the local day", () => {
    const { start, end } = dayBounds(local(13, 30));
    expect(start).toBe(new Date(2026, 7, 22, 0, 0, 0).getTime());
    expect(end).toBe(new Date(2026, 7, 23, 0, 0, 0).getTime());
  });

  it("rolls over month ends", () => {
    expect(dayBounds(new Date(2026, 7, 31, 23, 59).getTime()).end).toBe(
      new Date(2026, 8, 1, 0, 0, 0).getTime(),
    );
  });

  it("names the day it is in", () => {
    expect(dayKeyOf(local(0, 1))).toBe("2026-08-22");
    expect(dayKeyOf(local(23, 59))).toBe("2026-08-22");
  });

  it("next midnight is the end of today", () => {
    expect(nextMidnight(local(13))).toBe(dayBounds(local(13)).end);
  });
});

describe("amountToday", () => {
  it("counts a run that sits inside today in full", () => {
    expect(amountToday(clockEntry("P1", 9, 12), local(15))).toBe(3);
  });

  it("ignores a run from another day", () => {
    expect(amountToday(clockEntry("P1", 9, 12, 21, 21), local(15))).toBe(0);
  });

  it("splits a run that crosses midnight across both days", () => {
    // 10pm on the 21st to 2am on the 22nd.
    const overnight = clockEntry("P1", 22, 2, 21, 22);
    expect(overnight.quantity).toBe(4);
    expect(amountToday(overnight, local(12, 0, 21))).toBe(2);
    expect(amountToday(overnight, local(12, 0, 22))).toBe(2);
  });

  it("gives a typed entry to the day it was typed", () => {
    const manual = entry("P1", 4);
    const today = { ...manual, createdAt: iso(10) };
    expect(amountToday(today, local(15))).toBe(4);
    expect(amountToday(today, local(15, 0, 23))).toBe(0);
  });

  it("counts a typed entry at its own quantity, whatever the unit", () => {
    // Cycles, not hours — this function never converts.
    expect(amountToday({ ...entry("P1", 7), createdAt: iso(10) }, local(15))).toBe(7);
  });
});

describe("todayFor", () => {
  const t = tracker({
    entries: [clockEntry("P1", 9, 12), clockEntry("P1", 9, 12, 20, 20), clockEntry("P2", 8, 9)],
  });

  it("adds up only today, only that person", () => {
    expect(todayFor(t, "P1", local(15))).toBe(3);
    expect(todayFor(t, "P2", local(15))).toBe(1);
  });

  it("is zero once the day turns over, without touching the entries", () => {
    expect(todayFor(t, "P1", local(0, 30, 23))).toBe(0);
    expect(settledFor(t, "P1")).toBe(6);
  });

  it("counts a clock still running from yesterday only from midnight", () => {
    const overnight = tracker({ runningSince: { P1: iso(22, 0, 21) } });
    // 22:00 yesterday -> 03:00 today is 5 hours run, but 3 of them are today.
    expect(todayFor(overnight, "P1", local(3))).toBe(3);
    expect(totalFor(overnight, "P1", local(3))).toBe(5);
  });

  it("adds the running clock to what is already settled today", () => {
    const running = tracker({
      entries: [clockEntry("P1", 9, 12)],
      runningSince: { P1: iso(14) },
    });
    expect(todayFor(running, "P1", local(15, 30))).toBe(4.5);
  });
});

describe("entries charged to several people", () => {
  const shared = (ids: string[], quantity: number): LogEntry => ({
    id: `s-${ids.join("+")}`,
    participantIds: ids,
    quantity,
    startedAt: null,
    endedAt: null,
    createdAt: iso(10),
  });

  it("splits an entry equally between whoever it names", () => {
    const t = tracker({ mode: "per_cycle", entries: [shared(["P1", "P2", "P3"], 6)] });
    expect(shareOf(t.entries[0], "P1")).toBe(2);
    expect(shareOf(t.entries[0], "P2")).toBe(2);
    expect(shareOf(t.entries[0], "P3")).toBe(2);
  });

  it("gives nothing to somebody it does not name", () => {
    const t = tracker({ entries: [shared(["P1"], 6)] });
    expect(shareOf(t.entries[0], "P2")).toBe(0);
  });

  it("the shares of an entry add back up to the whole of it", () => {
    // This is what keeps a bill reconciling once entries are shared.
    const entry = shared(["P1", "P2", "P3"], 7);
    const total = ["P1", "P2", "P3"].reduce((sum, id) => sum + shareOf(entry, id), 0);
    expect(total).toBeCloseTo(7, 10);
  });

  it("settled totals count only a person's share", () => {
    const t = tracker({
      mode: "per_cycle",
      entries: [shared(["P1", "P2"], 4), shared(["P1"], 3)],
    });
    expect(settledFor(t, "P1")).toBe(5);
    expect(settledFor(t, "P2")).toBe(2);
  });

  it("today's counter shares an entry the same way", () => {
    const t = tracker({ mode: "per_cycle", entries: [shared(["P1", "P2"], 8)] });
    expect(todayFor(t, "P1", local(15))).toBe(4);
    expect(todayFor(t, "P1", local(15, 0, 23))).toBe(0);
  });
});
