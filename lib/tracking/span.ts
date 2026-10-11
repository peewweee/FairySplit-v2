/**
 * Why a date and two times could not be read as a clock span.
 *
 * - `incomplete`: the date or one of the times is blank or unreadable.
 * - `not-after-start`: the end is not later than the start on that day.
 */
export type SpanProblem = "incomplete" | "not-after-start";

export type SpanResult =
  | { ok: true; startedAt: string; endedAt: string }
  | { ok: false; problem: SpanProblem };

/**
 * What to tell somebody whose end is not after their start.
 *
 * A span lives inside one day — by 9:00 AM, 3:59 AM that day has already gone —
 * so a night that runs past midnight is two entries, the same way a clock left
 * running overnight is recorded a day at a time.
 */
export const END_NOT_AFTER_START =
  "The end has to come after the start, on the same day. For a night past midnight, add the evening on one date and the morning on the next.";

/**
 * A date and two times of day back into a pair of instants, in local time.
 *
 * The end has to come after the start ON THE SAME DAY. An earlier end used to roll
 * to the next morning ("in at 10pm, out at 8am"), which also turned a slip —
 * 9:00 AM to 3:59 AM — into a 19-hour entry nobody meant, and left a span crossing
 * midnight that nothing else in the logs produces any more.
 *
 * Compared as instants rather than as the typed strings, so it is the values that
 * will be stored that have to be in order.
 */
export function spanFromTimes(day: string, from: string, to: string): SpanResult {
  const incomplete: SpanResult = { ok: false, problem: "incomplete" };

  const [y, m, d] = day.split("-").map(Number);
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  if (!y || !m || !d) return incomplete;
  if ([fh, fm, th, tm].some((n) => !Number.isFinite(n))) return incomplete;

  const start = new Date(y, m - 1, d, fh, fm, 0);
  const end = new Date(y, m - 1, d, th, tm, 0);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return incomplete;

  if (end.getTime() <= start.getTime()) return { ok: false, problem: "not-after-start" };
  return { ok: true, startedAt: start.toISOString(), endedAt: end.toISOString() };
}
