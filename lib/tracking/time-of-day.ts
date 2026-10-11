/**
 * Times of day as minutes since midnight, and which hours and minutes a time
 * field has to switch off.
 *
 * A clock span lives inside one day, so its end has to come after its start. The
 * time fields enforce that by blocking rather than by scolding: the end cannot be
 * set to anything at or before the start, and the start cannot be set to anything
 * at or after the end.
 *
 * Pure, like the rest of this module: nothing here reads the clock or the DOM.
 */

const MINUTES_PER_DAY = 24 * 60;
const LAST_MINUTE = MINUTES_PER_DAY - 1;
const NOON = MINUTES_PER_DAY / 2;

export type Meridiem = "AM" | "PM";

/** A time on the 12-hour clock, the way it is picked: hour 1–12, minute 0–59, AM or PM. */
export interface ClockParts {
  hour12: number;
  minute: number;
  meridiem: Meridiem;
}

/** The earliest and latest minute of the day a field may take, both included. */
export interface Allowed {
  lo: number;
  hi: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "09:30" is 570 minutes into the day. Null when it is not a time of day. */
export function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
}

/** 570 is "09:30" — the form a time input's value takes, and what the app stores. */
export function toTime(minutes: number): string {
  const whole = Math.min(Math.max(Math.round(minutes), 0), LAST_MINUTE);
  return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}`;
}

export function toParts(minutes: number): ClockParts {
  const hour24 = Math.floor(minutes / 60);
  return {
    hour12: hour24 % 12 || 12,
    minute: minutes % 60,
    meridiem: hour24 >= 12 ? "PM" : "AM",
  };
}

export function fromParts({ hour12, minute, meridiem }: ClockParts): number {
  return ((hour12 % 12) + (meridiem === "PM" ? 12 : 0)) * 60 + minute;
}

/**
 * What a field may be set to, given the field it is paired with.
 *
 * `after`: this time has to come later than that one (an end, against its start).
 * `before`: this time has to come earlier than that one (a start, against its end).
 * A minute is the smallest step, so "later than 04:00" begins at 04:01.
 */
export function allowedRange({ after, before }: { after?: string; before?: string }): Allowed {
  const later = after === undefined ? null : toMinutes(after);
  const earlier = before === undefined ? null : toMinutes(before);
  const lo = later === null ? 0 : Math.min(later + 1, LAST_MINUTE);
  const hi = earlier === null ? LAST_MINUTE : Math.max(earlier - 1, 0);
  // When the other time already sits on the edge of the day nothing fits. Keep the
  // range from being empty so there is still a value to show.
  return { lo, hi: Math.max(hi, lo) };
}

/** Nearest allowed minute: a time outside the range snaps to the edge of it. */
export function clampMinutes(minutes: number, range: Allowed): number {
  return Math.min(Math.max(minutes, range.lo), range.hi);
}

/** True when no minute of this hour can be chosen. */
export function hourBlocked(hour12: number, meridiem: Meridiem, range: Allowed): boolean {
  const first = fromParts({ hour12, minute: 0, meridiem });
  return first + 59 < range.lo || first > range.hi;
}

/** True when this exact minute, in this hour, is outside the range. */
export function minuteBlocked(
  minute: number,
  hour12: number,
  meridiem: Meridiem,
  range: Allowed,
): boolean {
  const at = fromParts({ hour12, minute, meridiem });
  return at < range.lo || at > range.hi;
}

/** True when nothing in this half of the day can be chosen. */
export function meridiemBlocked(meridiem: Meridiem, range: Allowed): boolean {
  return meridiem === "AM" ? range.lo >= NOON : range.hi < NOON;
}

/**
 * What a field becomes when one of its three pieces is changed. The pieces left
 * alone are kept, and if that lands outside the range — the hour moved to the edge
 * while the minute was somewhere the edge does not allow — it snaps to the nearest
 * allowed time instead of settling on a bad one.
 */
export function withPart(current: number, change: Partial<ClockParts>, range: Allowed): number {
  return clampMinutes(fromParts({ ...toParts(current), ...change }), range);
}
