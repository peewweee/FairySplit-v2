"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { repo, type Member } from "@/lib/data";
import { useRepoAction, useResetOnChange } from "@/lib/data/hooks";
import { optionalHoursSchema } from "@/lib/forms/numeric";
import { parseField } from "@/lib/forms/schemas";

/**
 * One person's logged hours for one bill.
 *
 * Always optional (3.1) — blank means zero days, and blank is never an error.
 * Saves on blur and on Enter so a row of these can be tabbed straight through.
 */
export function MemberHoursInput({
  billId,
  member,
  hours,
  daysCovered,
}: {
  billId: string;
  member: Member;
  hours: number | null;
  daysCovered: number | null;
}) {
  const [value, setValue] = useState(hours === null ? "" : String(hours));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const action = useRepoAction();

  // Keep in step when the store changes underneath us (another tab, a reset).
  if (useResetOnChange(String(hours))) setValue(hours === null ? "" : String(hours));

  const parsedNow = parseField(optionalHoursSchema, value);
  const overPeriod =
    parsedNow.ok &&
    parsedNow.value !== null &&
    daysCovered !== null &&
    parsedNow.value / 24 > daysCovered;

  async function save() {
    const parsed = parseField(optionalHoursSchema, value);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    if (parsed.value === hours) return;
    const done = await action.run(() => repo.setMemberHours(billId, member.id, parsed.value));
    if (!done) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  const id = `days-${member.id}`;

  return (
    <div className="rounded-xl border border-fairy-hair bg-card px-3.5 py-2.5">
      <div className="flex items-center gap-3">
      <label htmlFor={id} className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fairy-ink">
        {member.name}
      </label>

      <div className="relative w-28 shrink-0">
        <Input
          id={id}
          value={value}
          inputMode="decimal"
          data-numeric
          placeholder="e.g. 624"
          className="h-9 pr-11 text-right tabular-nums"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-[11.5px] font-medium text-fairy-grey"
        >
          hrs
        </span>
      </div>

      <span className="w-4 shrink-0" aria-live="polite">
        {saved && <Check className="animate-sparkle size-4 text-fairy-moss" aria-label="Saved" />}
      </span>
      </div>

      {(error || overPeriod) && (
        <p
          id={`${id}-error`}
          className={`mt-1 text-xs ${error ? "text-fairy-danger" : "text-fairy-ember"}`}
        >
          {error ?? `That is more than the ${daysCovered} days this bill covers.`}
        </p>
      )}
    </div>
  );
}
