import type { LogEntry, Tracker, TrackerMode } from "@/lib/data/types";

/**
 * Turning a running clock into a number.
 *
 * Pure, like the billing engine: `now` is passed in, never read from the
 * system. That keeps every one of these testable at a fixed instant, and it
 * keeps wall-clock reads at the edges where they belong.
 */

export const MS_PER_HOUR = 3_600_000;

/**
 * How much log history is kept. Anything older is dropped.
 *
 * Deliberately longer than any billing period, so a bill can always still reach
 * the entries it covers; short enough that the store does not grow forever. It
 * also bounds what a date field will accept — there is no point recording a day
 * that will be forgotten before anyone reads it.
 */
export const HISTORY_DAYS = 120;

/**
 * Hours from an ISO instant to a millisecond timestamp.
 *
 * Never negative. A device whose clock jumps backwards — a manual change, a
 * timezone fix, an NTP correction — would otherwise hand somebody a credit for
 * time they did not stay, which is money moving the wrong way. Zero is the
 * honest floor: the run counts from now on.
 */
export function hoursSince(startIso: string, nowMs: number): number {
  const started = Date.parse(startIso);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, (nowMs - started) / MS_PER_HOUR);
}

/**
 * One person's share of an entry.
 *
 * An entry charged to three people is a third each — the same rule §7.2 uses
 * for a shared appliance event, so the shares of any entry always add back up
 * to the whole of it and the bill still reconciles.
 */
export function shareOf(entry: LogEntry, memberId: string): number {
  if (!entry.participantIds.includes(memberId)) return 0;
  return entry.quantity / entry.participantIds.length;
}

/** Everything this person has finished logging. No clock reading involved. */
export function settledFor(tracker: Tracker, memberId: string): number {
  return tracker.entries.reduce((sum, e) => sum + shareOf(e, memberId), 0);
}

/** The instant this person's clock started, or null if it is not running. */
export function runningSince(tracker: Tracker, memberId: string): string | null {
  return tracker.runningSince[memberId] ?? null;
}

/** Settled entries plus whatever the running clock has picked up so far. */
export function totalFor(tracker: Tracker, memberId: string, nowMs: number): number {
  const open = runningSince(tracker, memberId);
  return settledFor(tracker, memberId) + (open ? hoursSince(open, nowMs) : 0);
}

/* -- today ---------------------------------------------------------------- *
 * The counter on screen is a TODAY counter: it starts each local day at zero.
 * The entries themselves are never touched — only the window we add up.
 * ------------------------------------------------------------------------- */

/**
 * The local midnights either side of an instant.
 *
 * Built from the Date constructor rather than by subtracting 24 hours, so the
 * 23- and 25-hour days either side of a daylight-saving change still start and
 * end exactly at midnight.
 */
export function dayBounds(nowMs: number): { start: number; end: number } {
  const d = new Date(nowMs);
  return {
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(),
  };
}

/** The next local midnight — when a counter on screen has to fall back to zero. */
export function nextMidnight(nowMs: number): number {
  return dayBounds(nowMs).end;
}

/** Local calendar day as YYYY-MM-DD. Used to tell "is this still today?". */
export function dayKeyOf(nowMs: number): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * How much of one entry belongs to the day containing `nowMs`.
 *
 * A clock run is counted by its OVERLAP with the day, so a shift that starts at
 * 10pm and ends at 2am gives two hours to one day and two to the next instead
 * of dumping all four on whichever end you looked at.
 *
 * A typed entry has no span, so it belongs to the day it was typed. The number
 * comes back in the tracker's own unit — hours, days, or cycles.
 */
export function amountToday(entry: LogEntry, nowMs: number): number {
  const { start, end } = dayBounds(nowMs);
  return amountInRange(entry, start, end);
}

/**
 * How much of one entry belongs to an arbitrary window [startMs, endMs).
 *
 * The same rule the daily counter uses, widened so a bill can ask the same
 * question of its own dates. A clock run is counted by its OVERLAP with the
 * window, so a stay that begins before the billing period only contributes the
 * part inside it. A typed entry has no span and belongs to the day it was
 * typed, whole.
 */
export function amountInRange(entry: LogEntry, startMs: number, endMs: number): number {
  if (entry.startedAt && entry.endedAt) {
    const from = Date.parse(entry.startedAt);
    const to = Date.parse(entry.endedAt);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
    const overlap = Math.min(to, endMs) - Math.max(from, startMs);
    return Math.max(0, overlap) / MS_PER_HOUR;
  }
  const at = Date.parse(entry.createdAt);
  return Number.isFinite(at) && at >= startMs && at < endMs ? entry.quantity : 0;
}

/** Everything one person logged against one tracker inside a window. */
export function amountForMemberInRange(
  tracker: Tracker,
  memberId: string,
  startMs: number,
  endMs: number,
): number {
  return tracker.entries
    .filter((e) => e.participantIds.includes(memberId))
    .reduce((sum, e) => sum + amountInRange(e, startMs, endMs) / e.participantIds.length, 0);
}

/**
 * This person's total for today, running clock included.
 *
 * A clock still running from yesterday counts only from midnight, which is what
 * makes the display reset on its own with nobody having to press anything.
 */
export function todayFor(tracker: Tracker, memberId: string, nowMs: number): number {
  const settled = tracker.entries
    .filter((e) => e.participantIds.includes(memberId))
    .reduce((sum, e) => sum + amountToday(e, nowMs) / e.participantIds.length, 0);

  const open = runningSince(tracker, memberId);
  if (!open) return settled;

  const started = Date.parse(open);
  const from = Math.max(Number.isFinite(started) ? started : nowMs, dayBounds(nowMs).start);
  return settled + Math.max(0, nowMs - from) / MS_PER_HOUR;
}

/** How many people in the room have this one running right now. */
export function runningCount(tracker: Tracker): number {
  return Object.keys(tracker.runningSince).length;
}

/**
 * A duration in hours as "04:15:09", or "3d 04:15:09" once it passes a day.
 *
 * Seconds are shown because a clock that does not visibly move looks broken.
 * Days are split out because "743:12:04" is unreadable at a glance.
 */
export function formatDuration(hours: number): string {
  const totalSeconds = Math.max(0, Math.floor(hours * 3600));
  const days = Math.floor(totalSeconds / 86_400);
  const rest = totalSeconds - days * 86_400;
  const hh = Math.floor(rest / 3600);
  const mm = Math.floor((rest % 3600) / 60);
  const ss = rest % 60;
  const clock = [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * A logged amount, in the tracker's own unit.
 *
 * Two decimal places at most, and none when the number is whole. Cycles used to
 * be forced to whole numbers, but an entry charged to three people gives each a
 * third of it — rounding that to "1" would contradict the formula beside it.
 */
export function formatQuantity(value: number, mode: TrackerMode): string {
  void mode;
  // String() rather than toFixed(2): 12.5 should read "12.5", not "12.50".
  return String(Math.round(value * 100) / 100);
}

/** "4 cycles", "1 day", "12.5 hours" — the unit agrees with the number. */
export function describeQuantity(value: number, mode: TrackerMode, unit: string, plural: string) {
  const shown = formatQuantity(value, mode);
  return `${shown} ${shown === "1" ? unit : plural}`;
}
