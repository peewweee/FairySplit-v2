"use client";

import { useState } from "react";
import { Calculator, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { AddLogForm } from "@/components/fairy/add-log-dialog";
import { cn } from "@/lib/utils";

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
/** Tracked, but the log has not been chosen yet — the dropdown sits empty. */
const TRACKED = "tracked";

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
  roomId,
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
  /** Enables "Add a log" from inside this form. Without it the link is text. */
  roomId?: string;
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

  const [addingLog, setAddingLog] = useState(false);
  // A log made from inside this form exists before the parent's query has
  // refetched, so hold on to it — otherwise the dropdown would briefly not
  // contain the very thing it was just told to select.
  const [justAdded, setJustAdded] = useState<Tracker | null>(null);
  const logs =
    justAdded && !trackers.some((t) => t.id === justAdded.id)
      ? [...trackers, justAdded]
      : trackers;

  const picked = logs.find((t) => t.id === choice) ?? null;
  // "Track based on logs" is chosen the moment the option is ticked, even
  // before a log is named — that is what leaves the dropdown showing its
  // prompt instead of quietly picking one for you.
  const tracked = choice === TRACKED || Boolean(picked);
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
  const [errors, setErrors] = useState<{ label?: string; kwh?: string; tracker?: string }>({});

  const meta = APPLIANCE_MODE_META[mode];
  // Until a log is named there is no unit to name either, so the kWh field says
  // "per unit" rather than claiming a day.
  const unitLabel = tracked && !picked ? "unit" : meta.unit;

  function submit() {
    const parsedLabel = parseField(labelSchema, label);
    const parsedKwh = parseField(
      kwhRequired ? kwhPerUnitSchema : optionalKwhPerUnitSchema,
      kwh,
    );
    const next: { label?: string; kwh?: string; tracker?: string } = {};
    if (!parsedLabel.ok) next.label = parsedLabel.message;
    if (!parsedKwh.ok) next.kwh = parsedKwh.message;
    // Saving now would store an appliance with nothing to price it from, which
    // costs zero and looks exactly like one nobody used.
    if (tracked && !picked) next.tracker = "Pick which log this is charged from.";
    setErrors(next);
    if (!parsedLabel.ok || !parsedKwh.ok || next.tracker) return;

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

      <div className="grid gap-2">
        {/* A radiogroup, not checkboxes: the two answers are exclusive, and a
            reader that announces "checkbox" would suggest you could pick both.
            The tick square is the look; the semantics stay honest. */}
        <span
          id="appliance-charge-label"
          className="text-[12.5px] font-bold tracking-[-0.01em] text-fairy-ink"
        >
          How is it charged?
          <span aria-hidden className="ml-0.5 font-bold text-fairy-danger">
            *
          </span>
        </span>

        <div
          role="radiogroup"
          aria-labelledby="appliance-charge-label"
          aria-required
          className="grid gap-1.5"
        >
          <ChargeOption
            checked={choice === EQUALLY}
            disabled={!allowAlwaysOn}
            label="Equally"
            hint={APPLIANCE_MODE_META.always_on.hint}
            onSelect={() => setChoice(EQUALLY)}
          />

          <ChargeOption
            checked={tracked}
            label="Track based on logs"
            hint="Charged to whoever logged it, for the dates this bill covers."
            // Deliberately does NOT choose a log. Picking one silently would
            // put a number on somebody's bill that nobody asked for.
            onSelect={() => {
              setChoice(picked?.id ?? TRACKED);
              setErrors((e) => ({ ...e, tracker: undefined }));
            }}
          />

          {/* Only ever shown to an appliance already in this state — never
              offered to a new one. Dropping it would silently re-cost a bill
              that predates logs. */}
          {legacyMode && (
            <ChargeOption
              checked={choice === UNLINKED}
              label="Logged on this bill only"
              hint="Keeps the usage entries already on this bill."
              onSelect={() => setChoice(UNLINKED)}
            />
          )}
        </div>

        {/* The list of logs belongs to the second answer, so it appears with
            it rather than sitting there greyed out. */}
        {tracked && (
          <div className="grid gap-1.5 pl-7">
            <Select
              value={picked?.id ?? ""}
              onValueChange={(value) => {
                setChoice(value);
                setErrors((e) => ({ ...e, tracker: undefined }));
              }}
            >
              <SelectTrigger
                id="appliance-tracker"
                aria-invalid={Boolean(errors.tracker)}
                aria-describedby={errors.tracker ? "appliance-tracker-error" : undefined}
                className="h-10 w-full"
              >
                <SelectValue placeholder="Select from your existing logs" />
              </SelectTrigger>
              <SelectContent>
                {logs.map((tracker) => (
                  <SelectItem key={tracker.id} value={tracker.id}>
                    {tracker.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.tracker && (
              <p
                id="appliance-tracker-error"
                className="text-[11.5px] font-semibold text-fairy-danger"
              >
                {errors.tracker}
              </p>
            )}
            <p className="text-[11px] leading-[1.4] font-medium text-fairy-grey-strong">
              Want to charge it by something else?{" "}
              {roomId ? (
                <button
                  type="button"
                  onClick={() => setAddingLog(true)}
                  // Not .fs-link: that class pins 12.5px, which would break
                  // out of this 11px line.
                  className="cursor-pointer font-bold text-fairy-rose underline decoration-fairy-pink decoration-2 underline-offset-2 hover:text-fairy-tint-ink"
                >
                  Add a log
                </button>
              ) : (
                <span className="font-bold">Add a log</span>
              )}{" "}
              under Your tracking.
            </p>
          </div>
        )}

        {addingLog && roomId && (
          <AddLogForm
            roomId={roomId}
            onDone={(created) => {
              setAddingLog(false);
              // Straight to the log they just made — that is why they opened it.
              if (created) {
                setJustAdded(created);
                setChoice(created.id);
                setErrors((e) => ({ ...e, tracker: undefined }));
              }
            }}
          />
        )}

        {!allowAlwaysOn && (
          <p className="text-[11.5px] leading-[1.5] font-medium text-fairy-ember">
            &ldquo;Equally&rdquo; needs the dates this bill covers — its cost is
            kWh/day × days. Fill in From and To and it unlocks.
          </p>
        )}
      </div>

      <Field
        id="appliance-kwh"
        label={`Energy per ${unitLabel}`}
        value={kwh}
        onChange={(v) => {
          setKwh(v);
          setErrors((e) => ({ ...e, kwh: undefined }));
        }}
        placeholder={mode === "always_on" ? "e.g. 1.2" : "e.g. 0.73"}
        suffix={`kWh / ${unitLabel}`}
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

/**
 * One answer to "how is it charged?".
 *
 * A tick square, because that is the shape the choice wants — but `role="radio"`
 * inside a radiogroup, because only one answer can be true at a time.
 */
function ChargeOption({
  checked,
  disabled,
  label,
  hint,
  onSelect,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
        checked
          ? "border-fairy-pink bg-fairy-tint"
          : "border-fairy-hair bg-card hover:border-fairy-hair-2",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-px flex size-4 shrink-0 items-center justify-center rounded-[4px] border-2",
          checked ? "border-fairy-rose bg-fairy-rose text-white" : "border-fairy-hair-2",
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold tracking-[-0.01em] text-fairy-ink">
          {label}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-[1.45] font-medium text-fairy-grey-strong">
          {hint}
        </span>
      </span>
    </button>
  );
}

