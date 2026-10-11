"use client";

import type { ReactNode } from "react";
import { Clock } from "lucide-react";

import {
  type ClockParts,
  type Meridiem,
  allowedRange,
  hourBlocked,
  meridiemBlocked,
  minuteBlocked,
  toMinutes,
  toParts,
  toTime,
  withPart,
} from "@/lib/tracking/time-of-day";
import { cn } from "@/lib/utils";

/** The hours in the order a clock reads them: 12 first. */
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);
const MERIDIEMS: Meridiem[] = ["AM", "PM"];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A time of day, picked from hour / minute / AM-PM lists.
 *
 * It blocks rather than scolds. With `after`, that time and everything before it
 * is switched off in the lists; with `before`, that time and everything after it.
 * A 'To' paired with a 'From' has no way to be set earlier than it, and the other
 * way round, so there is no error to show afterwards.
 *
 * Built from lists instead of the browser's own time input because that input's
 * `min` and `max` cannot be trusted to block: iOS Safari ignores them on a time
 * input, and Android shows a time as greyed out but still lets it be chosen. A
 * disabled option in a list is refused everywhere.
 *
 * `value` is "HH:MM" on a 24-hour clock — what a time input holds, and what the
 * rest of the app already passes around.
 */
export function TimeField({
  label,
  value,
  onChange,
  after,
  before,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** This time and everything before it is blocked. */
  after?: string;
  /** This time and everything after it is blocked. */
  before?: string;
}) {
  const range = allowedRange({ after, before });
  // A value that is not a time (it should never be) starts at the first one allowed.
  const minutes = toMinutes(value) ?? range.lo;
  const parts = toParts(minutes);

  function pick(change: Partial<ClockParts>) {
    onChange(toTime(withPart(minutes, change, range)));
  }

  return (
    <div role="group" aria-label={label} className="grid gap-1">
      <span aria-hidden className="text-[10.5px] font-bold text-fairy-grey-strong">
        {label}
      </span>
      <div className="inline-flex h-8 items-center border border-fairy-hair-2 bg-card pr-2 pl-1 text-[12px] font-medium text-fairy-ink transition-colors focus-within:border-fairy-rose">
        <Part
          label={`${label} hour`}
          value={String(parts.hour12)}
          onChange={(v) => pick({ hour12: Number(v) })}
        >
          {HOURS.map((hour) => (
            <option key={hour} value={hour} disabled={hourBlocked(hour, parts.meridiem, range)}>
              {pad(hour)}
            </option>
          ))}
        </Part>
        <span aria-hidden>:</span>
        <Part
          label={`${label} minutes`}
          value={String(parts.minute)}
          onChange={(v) => pick({ minute: Number(v) })}
        >
          {MINUTES.map((minute) => (
            <option
              key={minute}
              value={minute}
              disabled={minuteBlocked(minute, parts.hour12, parts.meridiem, range)}
            >
              {pad(minute)}
            </option>
          ))}
        </Part>
        <Part
          label={`${label} AM or PM`}
          value={parts.meridiem}
          onChange={(v) => pick({ meridiem: v as Meridiem })}
          className="ml-1"
        >
          {MERIDIEMS.map((meridiem) => (
            <option key={meridiem} value={meridiem} disabled={meridiemBlocked(meridiem, range)}>
              {meridiem}
            </option>
          ))}
        </Part>
        <Clock className="ml-1.5 size-3.5 shrink-0 text-fairy-grey-strong" aria-hidden />
      </div>
    </div>
  );
}

/** One of the three lists, bare: the field around it draws the border. */
function Part({
  label,
  value,
  onChange,
  className,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-7 cursor-pointer appearance-none bg-transparent px-1 text-center tabular-nums outline-none [text-align-last:center] hover:bg-fairy-screen focus-visible:bg-fairy-tint",
        className,
      )}
    >
      {children}
    </select>
  );
}
