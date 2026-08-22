"use client";

import { Check } from "lucide-react";
import type { Member } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * A checkbox per member (10.1). Section 7.2 is the reason this is a set and not
 * a grid: one usage event with N participants, no pairings to enumerate.
 *
 * Each chip is a SINGLE control with `role="checkbox"`, not a checkbox nested
 * inside a label. Nesting one meant a real click on the box toggled twice —
 * once from the control, once from the label forwarding activation to Radix's
 * hidden input — so the tick never appeared. One element, one click, and the
 * whole chip is the hit target.
 */
export function ParticipantPicker({
  members,
  selected,
  onChange,
  idPrefix,
  label = "Who used it?",
}: {
  members: Member[];
  selected: string[];
  /** A state updater, not a value: two ticks in one batch must both survive. */
  onChange: (update: (prev: string[]) => string[]) => void;
  idPrefix: string;
  label?: string;
}) {
  const toggle = (id: string) =>
    onChange((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const everyone = selected.length === members.length && members.length > 0;
  const groupLabelId = `${idPrefix}-group-label`;

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span id={groupLabelId} className="text-sm font-medium text-fairy-ink">
          {label}
        </span>
        <button
          type="button"
          onClick={() => onChange(() => (everyone ? [] : members.map((m) => m.id)))}
          className="text-[11px] font-bold text-fairy-rose underline-offset-4 hover:underline"
        >
          {everyone ? "Clear" : "Everyone"}
        </button>
      </div>

      <div role="group" aria-labelledby={groupLabelId} className="flex flex-wrap gap-1.5">
        {members.map((member) => {
          const on = selected.includes(member.id);
          return (
            <button
              key={member.id}
              id={`${idPrefix}-${member.id}`}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(member.id)}
              className={cn(
                "flex items-center gap-1.5 border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
                on
                  ? "border-fairy-ink bg-fairy-tint text-fairy-tint-ink"
                  : "border-fairy-hair-2 bg-card text-fairy-grey hover:bg-fairy-screen",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-3.5 shrink-0 place-items-center border",
                  on
                    ? "border-fairy-ink bg-fairy-pink text-fairy-ink"
                    : "border-fairy-hair-2",
                )}
              >
                {on && <Check className="size-2.5" strokeWidth={3.5} />}
              </span>
              {member.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Ana and Ben", "Ana, Ben and Cy", "Nobody yet". */
export function describeParticipants(members: Member[], ids: string[]): string {
  const names = ids
    .map((id) => members.find((m) => m.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return "Nobody yet";
  if (names.length === members.length && members.length > 1) return "Everyone";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
