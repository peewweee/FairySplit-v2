"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * One labelled input, following the section 10.2 rules:
 *   - placeholders are grey examples, never pre-filled values
 *   - optional fields say "Optional" in muted text; no red asterisks anywhere
 *   - required fields (the ones inside a section you chose to open) say so
 *   - errors render under the field, never as a blocking dialog
 */
export interface FieldProps {
  id: string;
  label: string;
  /** A small thing beside the label, outside the <label> itself (an info icon, say). */
  labelAddon?: ReactNode;
  /** A small line directly under the label, above the input: where to find the figure. */
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: ReactNode;
  error?: string | null;
  requirement?: "required" | "optional" | "none";
  type?: "text" | "number" | "date";
  /** Bounds for a date input — the native picker greys out the rest. */
  min?: string;
  max?: string;
  inputMode?: "text" | "decimal" | "numeric";
  /** The field stops taking characters past this, rather than complaining after. */
  maxLength?: number;
  prefix?: string;
  suffix?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  onEnter?: () => void;
}

export function Field({
  id,
  label,
  labelAddon,
  hint,
  value,
  onChange,
  placeholder,
  helper,
  error,
  requirement = "none",
  type = "text",
  min,
  max,
  inputMode,
  maxLength,
  prefix,
  suffix,
  autoFocus,
  disabled,
  className,
  onEnter,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={id} className="text-[12.5px] font-bold tracking-[-0.01em] text-fairy-ink">
            {label}
            {requirement === "required" && (
              <span aria-hidden className="ml-0.5 font-bold text-fairy-danger">
                *
              </span>
            )}
          </Label>
          {labelAddon}
        </div>
        {requirement === "optional" && (
          <span className="text-[11px] font-medium text-fairy-grey">Optional</span>
        )}
      </div>

      {hint && (
        <p id={hintId} className="-mt-1 text-[11px] leading-[1.4] font-medium text-fairy-grey-strong">
          {hint}
        </p>
      )}

      <div className="relative">
        {prefix && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[14px] font-medium text-fairy-grey"
          >
            {prefix}
          </span>
        )}
        <Input
          id={id}
          type={type}
          min={min}
          max={max}
          inputMode={inputMode}
          maxLength={maxLength}
          value={value}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
          aria-required={requirement === "required" || undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={cn(hintId, helperId, errorId) || undefined}
          className={cn(
            "h-10",
            prefix && "pl-7",
            suffix && "pr-16",
            inputMode === "decimal" && "tabular-nums",
          )}
          data-numeric={inputMode === "decimal" || type === "number" ? "" : undefined}
        />
        {suffix && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[11.5px] font-medium text-fairy-grey"
          >
            {suffix}
          </span>
        )}
      </div>

      {helper && (
        <p id={helperId} className="text-[11.5px] leading-[1.5] font-medium text-fairy-grey">
          {helper}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[11.5px] font-semibold text-fairy-danger">
          {error}
        </p>
      )}
    </div>
  );
}
