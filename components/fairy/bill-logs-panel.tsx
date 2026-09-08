"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Info, Pencil, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ErrorNote } from "@/components/fairy/shell-bits";
import { amountFor, overrideFor } from "@/lib/billing/from-bill";
import { formatCentavos, millicentsToPesoString } from "@/lib/billing/money";
import { HOURS_PER_DAY } from "@/lib/billing/occupancy";
import { formatQuantity } from "@/lib/tracking/elapsed";
import { repo, type Bill, type Member, type Tracker } from "@/lib/data";
import { useRepoAction, useResetOnChange } from "@/lib/data/hooks";
import { optionalUsageQuantitySchema } from "@/lib/forms/numeric";
import { parseField } from "@/lib/forms/schemas";
import type { BillResult, ShareRow } from "@/lib/billing/engine";
import { cn } from "@/lib/utils";

/**
 * One line of the summary: a log, what it counted for you on this bill, and
 * what that came to in pesos.
 */
export interface LogLine {
  tracker: Tracker;
  /** In the log's own unit — hours, days or cycles. */
  amount: number;
  /** Set when somebody typed over the log. null means the log is in charge. */
  override: number | null;
  unit: string;
  unitPlural: string;
  costCentavos: number;
  /** How that cost was arrived at, in words. */
  formula: string;
}

/**
 * Everything one person's logs did to one bill.
 *
 * The amounts are editable because a clock is not a witness: it misses the
 * evening you forgot to press it, and it keeps running when you leave it on.
 * Typing a figure here overrides the log for THIS bill only; the log itself is
 * never rewritten, and "Use the log" puts the row back under its control.
 */
export function BillLogsPanel({
  bill,
  me,
  members,
  trackers,
  result,
}: {
  bill: Bill;
  me: Member | null;
  members: Member[];
  trackers: Tracker[];
  result: BillResult | null;
}) {
  const lines = me ? logLinesFor(bill, me.id, trackers, result) : [];

  return (
    <section aria-labelledby="bill-logs-heading" className="fs-card mb-6 p-4 sm:p-5">
      <h2 id="bill-logs-heading" className="mb-1 text-[14.5px] text-fairy-ink">
        Your logs covered in this bill
      </h2>

      {!me ? (
        <p className="text-[11.5px] leading-[1.5] font-medium text-fairy-grey-strong">
          We can&rsquo;t tell which of these {members.length} people you are. Set
          your name in the header to match your name in this room.
        </p>
      ) : lines.length === 0 ? (
        <p className="text-[11.5px] leading-[1.5] font-medium text-fairy-grey-strong">
          No logs feed this bill yet.
        </p>
      ) : (
        <ul className="grid gap-2">
          {lines.map((line) => (
            <li key={line.tracker.id}>
              <LogRow bill={bill} me={me} line={line} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -- one row -------------------------------------------------------------- */

function LogRow({ bill, me, line }: { bill: Bill; me: Member; line: LogLine }) {
  const [draft, setDraft] = useState(() => format(line.amount, line.tracker.mode));
  const isOccupancy = line.tracker.builtIn;
  // The occupancy clock is entered either way round. Two drafts rather than one
  // derived from the other, so a half-typed "26." is not rewritten to "26"
  // under the caret; whichever field is committed refreshes both.
  const [daysDraft, setDaysDraft] = useState(() => formatDays(line.amount));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();

  // Follow the store when it changes underneath us — another edit, or the log
  // being counted again after an override is cleared.
  if (useResetOnChange(`${line.amount}|${line.override}`)) {
    setDraft(format(line.amount, line.tracker.mode));
    setDaysDraft(formatDays(line.amount));
  }

  async function save(next: number | null) {
    setError(null);
    await action.run(() =>
      isOccupancy
        ? repo.setMemberHours(bill.id, me.id, next)
        : repo.setLogAmount(bill.id, line.tracker.id, me.id, next),
    );
  }

  const current = Number.parseFloat(draft) || 0;

  /** One unit up or down, committed straight away — there is no blur to wait for. */
  async function step(delta: number) {
    const next = Math.max(0, round2(current + delta));
    setDraft(String(next));
    setError(null);
    await save(next);
  }

  async function commit() {
    const parsed = parseField(optionalUsageQuantitySchema, draft);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    // Blank means "stop overriding", not "zero" — otherwise there would be no
    // way back to the log once you had typed over it.
    if (parsed.value === line.override) return;
    await save(parsed.value);
  }

  const currentDays = Number.parseFloat(daysDraft) || 0;

  /** The same edits, a day at a time. Hours is what gets stored either way. */
  async function stepDays(delta: number) {
    const next = Math.max(0, round2(currentDays + delta));
    setDaysDraft(String(next));
    setError(null);
    await save(next * HOURS_PER_DAY);
  }

  async function commitDays() {
    const parsed = parseField(optionalUsageQuantitySchema, daysDraft);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    const hours = parsed.value === null ? null : parsed.value * HOURS_PER_DAY;
    if (hours === line.override) return;
    await save(hours);
  }

  return (
    <div className="rounded-xl border border-fairy-hair bg-card px-3.5 py-3">
      <p className="truncate text-[13px] font-bold tracking-[-0.02em] text-fairy-ink">
        {line.tracker.name}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {editing ? (
          <div className="flex shrink-0 flex-wrap items-stretch gap-1">
            {isOccupancy && (
              <NumberField
                ariaLabel={`${line.tracker.name} — days on this bill`}
                suffix="days"
                draft={daysDraft}
                setDraft={setDaysDraft}
                onCommit={() => void commitDays()}
                onStep={(delta) => void stepDays(delta)}
                canDecrease={currentDays > 0}
                pending={action.pending}
                invalid={Boolean(error)}
                autoFocus
                onDone={() => {
                  void commitDays();
                  setEditing(false);
                }}
                onCancel={() => {
                  setDaysDraft(formatDays(line.amount));
                  setEditing(false);
                }}
                stepLabels={[`Add a day to ${line.tracker.name}`, `Take a day off ${line.tracker.name}`]}
              />
            )}

            <NumberField
              ariaLabel={`${line.tracker.name} — ${line.unitPlural} on this bill`}
              suffix={shortUnit(line.unit)}
              draft={draft}
              setDraft={setDraft}
              onCommit={() => void commit()}
              onStep={(delta) => void step(delta)}
              canDecrease={current > 0}
              pending={action.pending}
              invalid={Boolean(error)}
              autoFocus={!isOccupancy}
              onDone={() => {
                void commit();
                setEditing(false);
              }}
              onCancel={() => {
                setDraft(format(line.amount, line.tracker.mode));
                setEditing(false);
              }}
              stepLabels={[
                `Add one ${line.unit} to ${line.tracker.name}`,
                `Take one ${line.unit} off ${line.tracker.name}`,
              ]}
            />

            <button
              type="button"
              aria-label={`Done editing ${line.tracker.name}`}
              onClick={() => {
                void commit();
                setEditing(false);
              }}
              className="flex w-8 items-center justify-center rounded-md border border-fairy-hair text-fairy-moss hover:bg-fairy-moss-tint"
            >
              <Check className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              data-numeric
              className="text-[13px] font-semibold tabular-nums text-fairy-ink-2"
            >
              {describeAmount(line)}
            </span>
            <button
              type="button"
              aria-label={`Edit ${line.tracker.name}`}
              onClick={() => {
                setDraft(format(line.amount, line.tracker.mode));
                setDaysDraft(formatDays(line.amount));
                setEditing(true);
              }}
              className="flex size-6 items-center justify-center rounded text-fairy-grey-strong hover:text-fairy-rose"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          </div>
        )}

        {/* ml-auto rather than a fixed width: the cost keeps to the right
            edge whichever side of the edit toggle the row is on. */}
        <span
          data-numeric
          className="ml-auto shrink-0 text-[14px] font-bold tracking-[-0.02em] tabular-nums text-fairy-ink"
        >
          {formatCentavos(line.costCentavos)}
        </span>

        <FormulaHint label={line.tracker.name} formula={line.formula} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {line.override !== null ? (
          <>
            <span className="text-[10.5px] font-bold text-fairy-ember">Edited</span>
            <button
              type="button"
              disabled={action.pending}
              onClick={() => void save(null)}
              className="inline-flex items-center gap-1 text-[10.5px] font-bold text-fairy-rose underline decoration-fairy-pink decoration-2 underline-offset-2 disabled:opacity-45"
            >
              <RotateCcw className="size-3" aria-hidden />
              Use the log
            </button>
          </>
        ) : (
          <span className="text-[10.5px] font-medium text-fairy-grey-strong">
            Counted from your log
          </span>
        )}
      </div>

      <ErrorNote>{error ?? action.error}</ErrorNote>
    </div>
  );
}

/** One number, its unit, and an up/down pair. Two of these make the hours
 *  row editable in days as well. */
function NumberField({
  ariaLabel,
  suffix,
  draft,
  setDraft,
  onCommit,
  onStep,
  canDecrease,
  pending,
  invalid,
  autoFocus,
  onDone,
  onCancel,
  stepLabels,
}: {
  ariaLabel: string;
  suffix: string;
  draft: string;
  setDraft: (next: string) => void;
  onCommit: () => void;
  onStep: (delta: number) => void;
  canDecrease: boolean;
  pending: boolean;
  invalid: boolean;
  autoFocus?: boolean;
  onDone: () => void;
  onCancel: () => void;
  stepLabels: [string, string];
}) {
  return (
    <div className="flex items-stretch gap-1">
      <div className="relative w-[5.5rem]">
        <Input
          aria-label={ariaLabel}
          value={draft}
          autoFocus={autoFocus}
          inputMode="decimal"
          data-numeric
          className="h-9 pr-10 text-right tabular-nums"
          onChange={(e) => {
            // Strip rather than reject. Refusing the keystroke looks the same
            // for one character, but it relies on React re-rendering the old
            // value before the next one arrives — which it does not when
            // somebody types quickly or pastes.
            const cleaned = onlyNumber(e.target.value);
            // And when the cleaned value equals what state already holds, React
            // has nothing to re-render, so the stray character would sit in the
            // DOM. Put the element straight.
            if (cleaned !== e.target.value) e.target.value = cleaned;
            setDraft(cleaned);
          }}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onDone();
            if (e.key === "Escape") onCancel();
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onStep(1);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onStep(-1);
            }
          }}
          aria-invalid={invalid}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-[10.5px] font-medium text-fairy-grey-strong"
        >
          {suffix}
        </span>
      </div>

      {/* A stepper of our own: native number spinners differ per browser,
          vanish on mobile, and let you type "1e5". */}
      <div className="flex w-6 flex-col overflow-hidden rounded-md border border-fairy-hair">
        <Stepper label={stepLabels[0]} disabled={pending} onPress={() => onStep(1)}>
          <ChevronUp className="size-3" aria-hidden />
        </Stepper>
        <Stepper
          label={stepLabels[1]}
          disabled={pending || !canDecrease}
          onPress={() => onStep(-1)}
        >
          <ChevronDown className="size-3" aria-hidden />
        </Stepper>
      </div>
    </div>
  );
}

/** Half of the up/down control. Kept unfocusable so Tab still goes field to
 *  field — the arrow keys do the same job from inside the input. */
function Stepper({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      disabled={disabled}
      // Keep the caret in the field: a click would otherwise move focus here,
      // blurring the input on every press.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className="flex flex-1 items-center justify-center text-fairy-grey-strong hover:bg-fairy-screen hover:text-fairy-ink disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/* -- the formula ---------------------------------------------------------- */

/**
 * The little ⓘ.
 *
 * Opens on hover for a mouse AND on click for a finger — a plain tooltip only
 * does the first, and a popover only the second. A click pins it open so it
 * survives the pointer moving away to read it.
 */
function FormulaHint({ label, formula }: { label: string; formula: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <span ref={wrap} className="relative shrink-0">
      <button
        type="button"
        aria-label={`How ${label} was worked out`}
        aria-expanded={open}
        onClick={() => {
          setPinned(!pinned);
          setOpen(!pinned);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        className="flex size-6 items-center justify-center rounded-full text-fairy-grey-strong hover:text-fairy-rose"
      >
        <Info className="size-3.5" aria-hidden />
      </button>

      <span
        role="tooltip"
        hidden={!open}
        className={cn(
          "absolute right-0 bottom-full z-20 mb-1.5 w-60 rounded-lg border border-fairy-hair-2 bg-card p-2.5",
          "text-[11px] leading-[1.5] font-medium text-fairy-ink-2 shadow-[0_8px_20px_rgba(28,21,24,0.14)]",
        )}
      >
        {formula}
      </span>
    </span>
  );
}

/* -- what to show --------------------------------------------------------- */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Digits and at most one decimal point.
 *
 * Blank is allowed and means "use the log". Anything else is dropped, so a
 * pasted "14 pesos" becomes 14 rather than an error.
 */
function onlyNumber(raw: string): string {
  const [head, ...rest] = raw.replace(/[^\d.]/g, "").split(".");
  return rest.length > 0 ? `${head}.${rest.join("")}` : head;
}

function format(value: number, mode: Tracker["mode"]): string {
  return value === 0 ? "" : formatQuantity(value, mode);
}

/**
 * The figure as it reads when nobody is editing it.
 *
 * Hours in the unit shows BOTH: days is the number the split is actually
 * weighted by, and hours is the number the clock recorded — seeing only one of
 * them leaves you converting in your head.
 */
function describeAmount(line: LogLine): string {
  const amount = formatQuantity(line.amount, line.tracker.mode);
  if (!line.tracker.builtIn) return `${amount} ${shortUnit(line.unit)}`;
  const days = round2(line.amount / HOURS_PER_DAY);
  return `${days} ${days === 1 ? "day" : "days"} · ${amount} hrs`;
}

/** The same figure in days, for the occupancy row's second field. */
function formatDays(hours: number): string {
  return hours === 0 ? "" : String(round2(hours / HOURS_PER_DAY));
}

function shortUnit(unit: string): string {
  return unit === "hour" ? "hrs" : unit === "cycle" ? "cyc" : "days";
}

/**
 * Which logs this bill is made of, and what each one cost the person.
 *
 * The occupancy clock is always in, because every bill is weighted by it. The
 * rest are the logs that an appliance on this bill is charged from — a log
 * nothing points at did not touch this bill and would only add a zero row.
 */
export function logLinesFor(
  bill: Bill,
  memberId: string,
  trackers: Tracker[],
  result: BillResult | null,
): LogLine[] {
  const row = result?.rows.find((r) => r.memberId === memberId) ?? null;
  const rate = bill.rateMillicents;
  const lines: LogLine[] = [];

  for (const tracker of trackers) {
    const bound = bill.appliances.filter((a) => a.trackerId === tracker.id);
    if (!tracker.builtIn && bound.length === 0) continue;

    const override = overrideFor(bill, tracker.id, memberId);
    const stored = tracker.builtIn ? (bill.memberHours[memberId] ?? null) : override;
    const amount = tracker.builtIn
      ? (stored ?? amountFor(bill, tracker, memberId, null))
      : amountFor(bill, tracker, memberId, override);

    if (tracker.builtIn) {
      lines.push({
        tracker,
        amount,
        override: stored,
        unit: "hour",
        unitPlural: "hours",
        costCentavos: row?.sharedCentavos ?? 0,
        formula: occupancyFormula(amount, row, result),
      });
      continue;
    }

    const cost = bound.reduce((sum, a) => sum + (row?.breakdown[a.id] ?? 0), 0);
    const unit = bound[0] ? unitOf(bound[0].mode) : { unit: "unit", plural: "units" };
    lines.push({
      tracker,
      amount,
      override,
      unit: unit.unit,
      unitPlural: unit.plural,
      costCentavos: cost,
      formula: applianceFormula(amount, bound, rate, unit.plural, cost),
    });
  }

  return lines;
}

function unitOf(mode: string) {
  if (mode === "per_cycle") return { unit: "cycle", plural: "cycles" };
  if (mode === "per_day") return { unit: "day", plural: "days" };
  return { unit: "hour", plural: "hours" };
}

function occupancyFormula(hours: number, row: ShareRow | null, result: BillResult | null): string {
  const days = round2(hours / HOURS_PER_DAY);
  if (!row || !result) return `${round2(hours)} hours ÷ ${HOURS_PER_DAY} = ${days} days.`;
  const personDays = round2(result.rows.reduce((acc, r) => acc + r.days, 0));
  return (
    `${round2(hours)} hours ÷ ${HOURS_PER_DAY} = ${days} days. ` +
    `Your ${days} of ${personDays} person-days share of ` +
    `${formatCentavos(result.residualCentavos)} = ${formatCentavos(row.sharedCentavos)}.`
  );
}

function applianceFormula(
  amount: number,
  bound: Bill["appliances"],
  rate: number | null,
  plural: string,
  cost: number,
): string {
  if (rate === null) return "This bill has no rate, so logged usage costs nothing.";
  const kwh = bound[0]?.kwhPerUnit;
  if (kwh === null || kwh === undefined) {
    return `"${bound[0]?.label}" has no kWh figure yet, so there is nothing to price this against.`;
  }
  return (
    `${round2(amount)} ${plural} × ${kwh} kWh × ₱${millicentsToPesoString(rate)}/kWh ` +
    `= ${formatCentavos(cost)}.`
  );
}
