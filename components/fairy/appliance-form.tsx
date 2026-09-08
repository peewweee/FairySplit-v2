"use client";

import { useState } from "react";
import { Calculator, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/fairy/field";
import { ErrorNote } from "@/components/fairy/shell-bits";
import {
  APPLIANCE_MODE_META,
  applianceModeForTracker,
  type ApplianceMode,
  type Tracker,
} from "@/lib/data";
import {
  dayCountSchema,
  hoursPerDaySchema,
  kwhPerMonthSchema,
  kwhPerUnitSchema,
  optionalKwhPerUnitSchema,
} from "@/lib/forms/numeric";
import { labelSchema, parseField } from "@/lib/forms/schemas";

export interface ApplianceDraft {
  label: string;
  mode: ApplianceMode;
  kwhPerUnit: number | null;
  /** null = shared equally. Otherwise the log its quantities come from. */
  trackerId: string | null;
}

/** The one built-in answer: it runs for everyone, so nobody logs against it. */
const EQUALLY = "equally";
/** Only ever offered to an appliance that is already in this state. */
const UNLINKED = "unlinked";

/**
 * The appliance form, shared by room templates and by a bill's frozen copy.
 *
 * Section 3.1: opening this form is optional, but once it is open its fields
 * are required — except on a room template, where the kWh figure may be left
 * for later (`kwhRequired={false}`) because no bill depends on it yet.
 */
export function ApplianceForm({
  initial,
  kwhRequired = true,
  allowAlwaysOn = true,
  trackers = [],
  submitLabel,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  initial?: ApplianceDraft;
  kwhRequired?: boolean;
  /** Section 3.1: an always-on appliance also needs the bill's day count. */
  allowAlwaysOn?: boolean;
  /** The room's logs. Each one becomes a way to charge this appliance. */
  trackers?: Tracker[];
  submitLabel: string;
  onSubmit: (draft: ApplianceDraft) => void;
  onCancel?: () => void;
  pending?: boolean;
  error?: string | null;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");

  // An appliance saved before logs existed: metered, but pointing at nothing.
  // Its old mode is kept so choosing "leave as is" does not re-cost the bill.
  const legacyMode =
    initial && initial.trackerId === null && initial.mode !== "always_on" ? initial.mode : null;

  const [choice, setChoice] = useState<string>(() => {
    if (initial?.trackerId) return initial.trackerId;
    if (legacyMode) return UNLINKED;
    return EQUALLY;
  });

  const picked = trackers.find((t) => t.id === choice) ?? null;
  const mode: ApplianceMode = picked
    ? applianceModeForTracker(picked.mode)
    : choice === UNLINKED && legacyMode
      ? legacyMode
      : "always_on";
  const trackerId = picked ? picked.id : null;
  const [kwh, setKwh] = useState(
    initial?.kwhPerUnit === null || initial?.kwhPerUnit === undefined
      ? ""
      : String(initial.kwhPerUnit),
  );
  const [errors, setErrors] = useState<{ label?: string; kwh?: string }>({});

  const meta = APPLIANCE_MODE_META[mode];

  function submit() {
    const parsedLabel = parseField(labelSchema, label);
    const parsedKwh = parseField(
      kwhRequired ? kwhPerUnitSchema : optionalKwhPerUnitSchema,
      kwh,
    );
    const next: { label?: string; kwh?: string } = {};
    if (!parsedLabel.ok) next.label = parsedLabel.message;
    if (!parsedKwh.ok) next.kwh = parsedKwh.message;
    setErrors(next);
    if (!parsedLabel.ok || !parsedKwh.ok) return;

    onSubmit({
      label: parsedLabel.value,
      mode,
      kwhPerUnit: parsedKwh.value as number | null,
      trackerId,
    });
  }

  return (
    <div className="grid gap-4">
      <Field
        id="appliance-label"
        label="What is it?"
        value={label}
        onChange={(v) => {
          setLabel(v);
          setErrors((e) => ({ ...e, label: undefined }));
        }}
        placeholder="e.g. Rice Cooker"
        requirement="required"
        autoFocus
        error={errors.label}
        onEnter={submit}
      />

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="appliance-mode">
            How is it charged?
            <span aria-hidden className="ml-0.5 font-bold text-fairy-danger">
              *
            </span>
          </Label>
        </div>
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger id="appliance-mode" aria-required className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* Equally is the only answer that needs no log, so it sits on its
                own above the rule rather than in the list of logs. */}
            <SelectItem value={EQUALLY} disabled={!allowAlwaysOn}>
              <span className="font-bold">Equally</span>
              <span className="ml-2 rounded-full bg-fairy-tint px-1.5 py-0.5 text-[10px] font-bold text-fairy-tint-ink">
                Built in
              </span>
            </SelectItem>

            {legacyMode && (
              <SelectItem value={UNLINKED}>Logged on this bill only</SelectItem>
            )}

            <SelectSeparator />

            {trackers.map((tracker) => (
              <SelectItem key={tracker.id} value={tracker.id}>
                Track based on &lsquo;{tracker.name}&rsquo;
              </SelectItem>
            ))}

            <p className="px-2 py-1.5 text-[11px] leading-[1.4] font-medium text-fairy-grey-strong">
              Want to charge it by something else? Add a log under Your tracking.
            </p>
          </SelectContent>
        </Select>

        <p className="text-[11.5px] leading-[1.5] font-medium text-fairy-grey">
          {trackerId
            ? `Charged to whoever logged the ${meta.unitPlural}, from that log.`
            : choice === UNLINKED
              ? "Keeps using the usage entries already on this bill."
              : APPLIANCE_MODE_META.always_on.hint}
        </p>

        {!allowAlwaysOn && (
          <p className="text-[11.5px] leading-[1.5] font-medium text-fairy-ember">
            &ldquo;Equally&rdquo; needs the dates this bill covers — its cost is
            kWh/day × days. Fill in From and To and it unlocks.
          </p>
        )}
      </div>

      <Field
        id="appliance-kwh"
        label={`Energy per ${meta.unit}`}
        value={kwh}
        onChange={(v) => {
          setKwh(v);
          setErrors((e) => ({ ...e, kwh: undefined }));
        }}
        placeholder={mode === "always_on" ? "e.g. 1.2" : "e.g. 0.73"}
        suffix={`kWh / ${meta.unit}`}
        inputMode="decimal"
        requirement={kwhRequired ? "required" : "optional"}
        error={errors.kwh}
        onEnter={submit}
        helper={
          kwhRequired
            ? undefined
            : "You can fill this in later — a bill will ask for it when it copies this appliance."
        }
      />

      <PerMonthConverter
        mode={mode}
        onConverted={(perUnit) => {
          setKwh(String(perUnit));
          setErrors((e) => ({ ...e, kwh: undefined }));
        }}
      />

      <ErrorNote>{error}</ErrorNote>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button size="lg" onClick={submit} disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Section 10.3: the old spreadsheet stored "153.9 kWh per month" and
 * back-derived a per-hour figure, which made the aircon's apparent wattage
 * change with the length of the billing period. This converts once, up front,
 * and stores only the per-unit result.
 */
function PerMonthConverter({
  mode,
  onConverted,
}: {
  mode: ApplianceMode;
  onConverted: (perUnit: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [monthly, setMonthly] = useState("");
  const [days, setDays] = useState("");
  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);

  const perDayOnly = mode === "always_on";

  function convert() {
    const m = parseField(kwhPerMonthSchema, monthly);
    if (!m.ok) {
      setError(m.message);
      return;
    }
    const d = parseField(dayCountSchema, days);
    if (!d.ok || d.value <= 0) {
      setError(d.ok ? "That month needs at least one day." : d.message);
      return;
    }
    if (perDayOnly) {
      onConverted(round4(m.value / d.value));
      setOpen(false);
      setError(null);
      return;
    }
    const h = parseField(hoursPerDaySchema, hours);
    if (!h.ok) {
      setError(h.message);
      return;
    }
    onConverted(round4(m.value / d.value / h.value));
    setOpen(false);
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-1.5 rounded-lg text-xs text-fairy-rose underline-offset-4 hover:underline"
      >
        <Calculator className="size-3.5" aria-hidden />
        Know it per month instead?
      </button>
    );
  }

  return (
    <div className="grid gap-3 rounded-xl border border-fairy-hair-2 bg-fairy-tint p-3">
      <p className="text-[11.5px] leading-[1.5] font-medium text-fairy-grey">
        Convert a monthly reading into a per-{APPLIANCE_MODE_META[mode].unit} figure.
        Only the converted result is stored, so it won&rsquo;t drift when February
        comes around.
      </p>
      <div className={perDayOnly ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-3"}>
        <Field
          id="conv-monthly"
          label="kWh that month"
          value={monthly}
          onChange={setMonthly}
          placeholder="e.g. 153.9"
          inputMode="decimal"
        />
        <Field
          id="conv-days"
          label="Days in the month"
          value={days}
          onChange={setDays}
          placeholder="e.g. 30"
          inputMode="decimal"
        />
        {!perDayOnly && (
          <Field
            id="conv-hours"
            label="Hours a day"
            value={hours}
            onChange={setHours}
            placeholder="e.g. 9"
            inputMode="decimal"
          />
        )}
      </div>
      {error && <p className="text-[11.5px] font-semibold text-fairy-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
        <Button size="sm" variant="secondary" onClick={convert}>
          <Check className="size-3.5" aria-hidden />
          Use this figure
        </Button>
      </div>
    </div>
  );
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
