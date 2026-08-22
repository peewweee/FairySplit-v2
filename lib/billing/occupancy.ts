import type { Bill, Member } from "@/lib/data/types";

/**
 * The single source of occupancy (section 12).
 *
 * Today it reads whatever the user typed onto the bill. In Phase C, when the
 * dorm timer lands, occupancy becomes an append-only log of intervals and THIS
 * FUNCTION computes the same shape from it - the manually typed day count
 * staying as a fallback for corrections.
 *
 * Nothing else in the codebase may read occupancy from anywhere else, and the
 * engine takes `days` as a plain number and never asks where it came from.
 */
export interface MemberDays {
  id: string;
  /** null = unfilled. The engine treats it as zero. */
  days: number | null;
}

/** A day of occupancy is 24 logged hours. The one place that ratio lives. */
export const HOURS_PER_DAY = 24;

/** Hours -> days, for display beside an hours input. */
export function hoursToDays(hours: number | null): number | null {
  return hours == null ? null : hours / HOURS_PER_DAY;
}

/** The raw logged hours, before they become days. */
export function memberHoursFor(bill: Bill | null, members: Member[]): MemberDays[] {
  return members.map((member) => ({
    id: member.id,
    days: bill?.memberHours[member.id] ?? null,
  }));
}

export function memberDaysFor(bill: Bill | null, members: Member[]): MemberDays[] {
  return members.map((member) => ({
    id: member.id,
    days: hoursToDays(bill?.memberHours[member.id] ?? null),
  }));
}

/** Total person-days on the bill. Used for the "per day stayed" display. */
export function totalPersonDays(days: MemberDays[]): number {
  return days.reduce((acc, d) => acc + (d.days ?? 0), 0);
}

/** How many members still have no day count - drives the nudge on the bill. */
export function unfilledCount(days: MemberDays[]): number {
  return days.filter((d) => d.days === null).length;
}

/**
 * How many days a bill covers — DERIVED from its dates, never stored.
 *
 * One source of truth: a stored copy could drift from the dates beside it, and
 * this is the number the split is actually weighted against.
 */
export function coverageDays(bill: Pick<Bill, "startsOn" | "endsOn">): number | null {
  return daysBetween(bill.startsOn, bill.endsOn);
}

/** Inclusive day count between two ISO dates, or null if either is missing. */
export function daysBetween(startsOn: string | null, endsOn: string | null): number | null {
  if (!startsOn || !endsOn) return null;
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}
