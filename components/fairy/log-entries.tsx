"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote } from "@/components/fairy/shell-bits";
import { ParticipantPicker } from "@/components/fairy/participant-picker";
import { HISTORY_DAYS, amountToday, describeQuantity } from "@/lib/tracking/elapsed";
import {
  TRACKER_MODE_META,
  repo,
  type LogEntry,
  type Member,
  type Tracker,
} from "@/lib/data";
import { useRepoAction } from "@/lib/data/hooks";
import { usageQuantitySchema } from "@/lib/forms/numeric";
import { parseField } from "@/lib/forms/schemas";
import { cn } from "@/lib/utils";

/**
 * Recorded entries: reading them, fixing them, and typing in the ones a clock
 * missed.
 *
 * Lives apart from the tracking panel because the logs-history page shows the
 * same rows, and importing them from there would close a cycle through
 * bills-panel.
 */

/** A time of day, local. Shared with the span editor below. */
export function timeOfDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Today's entries, on the card. Open it to fix a mis-tap.
 *
 * TODAY only, to match the counter above it — a card that reads 00:00:00 while
 * listing last week's runs is just confusing. Everything else is a click away
 * under Logs history.
 */
export function EntryList({
  tracker,
  entries,
  members,
  me,
  roomId,
  now,
}: {
  tracker: Tracker;
  entries: LogEntry[];
  members: Member[];
  me: Member;
  roomId: string;
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const action = useRepoAction();
  // A log only records what somebody remembered, so an entry can always be
  // typed in after the fact — as a span for a clock, as an amount otherwise.
  const spanned = TRACKER_MODE_META[tracker.mode].live;

  // Anything that CONTRIBUTES to today, which is not the same as anything
  // stamped today: a run from 10pm to 2am counts on both days, and belongs in
  // both lists.
  const todays = entries.filter((e) => amountToday(e, now) > 0);

  // Newest first — the one you just logged is the one you might fix.
  const ordered = [...todays].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="mt-3 border-t border-fairy-hair pt-2.5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-bold text-fairy-grey-strong hover:text-fairy-ink"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
            aria-hidden
          />
          {todays.length} {todays.length === 1 ? "entry" : "entries"} today
        </button>

        {!adding && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setAdding(true);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-fairy-rose hover:text-fairy-tint-ink"
          >
            <Plus className="size-3.5" aria-hidden />
            Add entry
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2">
          {spanned ? (
            <NewRunForm
              tracker={tracker}
              me={me}
              members={members}
              onDone={() => setAdding(false)}
            />
          ) : (
            <NewManualForm
              tracker={tracker}
              me={me}
              members={members}
              onDone={() => setAdding(false)}
            />
          )}
        </div>
      )}

      {open && (
        <>
          {ordered.length > 0 ? (
            <ul className="mt-2 grid gap-1.5">
              {ordered.map((entry) => (
                <li key={entry.id}>
                  <EntryRow tracker={tracker} entry={entry} members={members} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] font-medium text-fairy-grey-strong">
              Nothing logged today.
            </p>
          )}

          {/* Under the day's entries: you read today first, and only then ask
              what came before. Straight to THIS log's tab, not the panel. */}
          <div className="mt-3 flex justify-center">
            <Link
              href={`/rooms/${roomId}/logs?log=${tracker.id}`}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-fairy-rose underline decoration-fairy-pink decoration-2 underline-offset-2"
            >
              <History className="size-3.5" aria-hidden />
              See all logs
            </Link>
          </div>
        </>
      )}
      <ErrorNote>{action.error}</ErrorNote>
    </div>
  );
}

/**
 * Runs typed in after the fact — several days at once.
 *
 * Clocking in is a per-day habit, so catching up is usually "I was here all of
 * these days". One From/To applies to every date picked: the times are the
 * shape of the day, and the calendar says which days had that shape. Anything
 * that did not is a separate entry, edited afterwards.
 *
 * Clock logs only. A manual log has no times to give a day, so it keeps the
 * single-date form.
 */
/** A date on the list, with the times AND people it was picked with. */
interface PickedDay {
  day: string;
  from: string;
  to: string;
  people: string[];
}

export function NewRunForm({
  tracker,
  me,
  members,
  onDone,
}: {
  tracker: Tracker;
  me: Member;
  members: Member[];
  onDone: () => void;
}) {
  // Only the occupancy clock is yours alone; an added one can be shared.
  const sharable = !tracker.builtIn;
  // Each date keeps the times it was picked with. Changing the fields is aiming
  // at the NEXT date, not rewriting the ones already in the list — otherwise
  // there would be no way to record two days that ran differently.
  const [picked, setPicked] = useState<PickedDay[]>(() => [
    { day: toDateInput(new Date().toISOString()), from: "00:00", to: "23:59", people: [me.id] },
  ]);
  // The whole day, because the commonest thing anyone types in is a day they
  // were simply here for.
  const [from, setFrom] = useState("00:00");
  const [to, setTo] = useState("23:59");
  // Until the calendar is touched, the form is still "one entry, today" and the
  // time fields are editing THAT — so the default follows them. After the first
  // pick, times belong to whichever date was current when they were set.
  const [touched, setTouched] = useState(false);
  const [people, setPeople] = useState<string[]>([me.id]);
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();

  const ordered = [...picked].sort((a, b) => a.day.localeCompare(b.day));

  function retime(next: { from?: string; to?: string }) {
    setError(null);
    if (next.from !== undefined) setFrom(next.from);
    if (next.to !== undefined) setTo(next.to);
    if (touched) return;
    setPicked((prev) => prev.map((p) => ({ ...p, ...next })));
  }

  /** Same rule as the times: aimed at the next date, not the ones listed. */
  function repeople(update: (prev: string[]) => string[]) {
    setError(null);
    setPeople(update);
    if (touched) return;
    setPicked((prev) => prev.map((p) => ({ ...p, people: update(p.people) })));
  }

  function toggleDay(day: string) {
    setError(null);
    setTouched(true);
    setPicked((prev) =>
      prev.some((p) => p.day === day)
        ? prev.filter((p) => p.day !== day)
        : [...prev, { day, from, to, people }],
    );
  }

  async function submit() {
    if (ordered.length === 0) {
      setError("Pick at least one date.");
      return;
    }
    if (sharable && ordered.some((entry) => entry.people.length === 0)) {
      setError("Every date needs at least one person it is charged to.");
      return;
    }

    const spans: { startedAt: string; endedAt: string; participantIds: string[] }[] = [];
    for (const entry of ordered) {
      const bad = dateProblem(entry.day);
      if (bad) {
        setError(bad);
        return;
      }
      const span = toSpan(entry.day, entry.from, entry.to);
      if (!span) {
        setError("Fill in both times.");
        return;
      }
      spans.push({
        startedAt: span.startedAt,
        endedAt: span.endedAt,
        participantIds: sharable ? entry.people : [me.id],
      });
    }

    setError(null);
    const done = await action.run(() =>
      repo.addClockEntries(tracker.id, spans),
    );
    if (done) onDone();
  }

  return (
    <div className="grid gap-3 border border-fairy-pink bg-card px-3 py-3">
      {sharable && (
        <ParticipantPicker
          members={members}
          selected={people}
          onChange={repeople}
          idPrefix={`new-run-${tracker.id}`}
          label="Charged to"
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <span className="text-[10.5px] font-bold tracking-[0.1em] text-fairy-grey-strong uppercase">
          Select Dates
        </span>
        <div className="flex items-end gap-2">
          <label className="grid gap-1">
            <span className="text-[10.5px] font-bold text-fairy-grey-strong">From</span>
            <Input
              type="time"
              value={from}
              className="h-8 w-[6.5rem] text-[12px]"
              onChange={(e) => retime({ from: e.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[10.5px] font-bold text-fairy-grey-strong">To</span>
            <Input
              type="time"
              value={to}
              className="h-8 w-[6.5rem] text-[12px]"
              onChange={(e) => retime({ to: e.target.value })}
            />
          </label>
        </div>
      </div>

      <MultiDateCalendar selected={ordered.map((p) => p.day)} onToggle={toggleDay} />

      {/* What is about to be saved, one box each. Seeing the list is the whole
          point of picking dates on a calendar rather than typing them. */}
      {ordered.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {ordered.map((entry) => (
            <li
              key={entry.day}
              className="grid max-w-[10rem] gap-0.5 border border-fairy-hair bg-fairy-tint px-2 py-1.5 text-center"
            >
              <span className="text-[11px] font-bold text-fairy-tint-ink">
                {shortDay(entry.day)}
              </span>
              <span className="text-[10px] font-medium text-fairy-tint-ink/80 tabular-nums">
                {entry.from || "--:--"}–{entry.to || "--:--"}
              </span>
              {/* Only a shared log has a choice to show. The occupancy clock is
                  always yours alone, so naming you would be noise. */}
              {sharable && (
                <span className="text-[10px] leading-[1.35] font-medium text-fairy-tint-ink/70">
                  {entry.people.length > 0
                    ? describePeople(members, entry.people)
                    : "nobody yet"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <ErrorNote>{error ?? action.error}</ErrorNote>

      <div className="flex justify-end gap-1.5 border-t border-fairy-hair pt-2.5">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" disabled={action.pending} onClick={() => void submit()}>
          <Check className="size-3.5" aria-hidden />
          Save {ordered.length} {ordered.length === 1 ? "entry" : "entries"}
        </Button>
      </div>
    </div>
  );
}

/**
 * A month grid you can pick several days from.
 *
 * Built rather than installed: nothing in the project ships a calendar, and the
 * whole job is a month of buttons. Days outside the retention window or in the
 * future are disabled, so the picker cannot offer a date the save would refuse.
 */
function MultiDateCalendar({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (day: string) => void;
}) {
  const bounds = entryDateBounds();
  const [cursor, setCursor] = useState(() => startOfMonth(selected[0] ?? bounds.max));

  const chosen = new Set(selected);
  const todayKey = toDateInput(new Date().toISOString());

  const first = new Date(cursor);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  // Blank cells before the 1st, so the columns line up under their weekday.
  const lead = first.getDay();

  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      toDateInput(new Date(first.getFullYear(), first.getMonth(), i + 1).toISOString()),
    ),
  ];

  const step = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  // A month with no selectable day in it is a dead end; do not offer it.
  const canGoBack = toDateInput(
    new Date(first.getFullYear(), first.getMonth(), 0).toISOString(),
  ) >= bounds.min;
  const canGoForward = toDateInput(
    new Date(first.getFullYear(), first.getMonth() + 1, 1).toISOString(),
  ) <= bounds.max;

  return (
    <div className="border border-fairy-hair bg-fairy-screen p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          disabled={!canGoBack}
          onClick={() => step(-1)}
          className="flex size-6 items-center justify-center text-fairy-grey-strong hover:text-fairy-rose disabled:opacity-30"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-[11.5px] font-bold text-fairy-ink">
          {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          aria-label="Next month"
          disabled={!canGoForward}
          onClick={() => step(1)}
          className="flex size-6 items-center justify-center text-fairy-grey-strong hover:text-fairy-rose disabled:opacity-30"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
          <span
            key={i}
            aria-hidden
            className="py-1 text-center text-[9.5px] font-bold tracking-[0.06em] text-fairy-grey-strong uppercase"
          >
            {label}
          </span>
        ))}

        {cells.map((day, i) => {
          if (!day) return <span key={`gap-${i}`} />;
          const picked = chosen.has(day);
          const outside = day < bounds.min || day > bounds.max;
          return (
            <button
              key={day}
              type="button"
              role="checkbox"
              aria-checked={picked}
              aria-label={longDay(day)}
              disabled={outside}
              onClick={() => onToggle(day)}
              className={cn(
                "flex h-7 items-center justify-center rounded-md text-[11.5px] font-semibold tabular-nums transition-colors",
                outside && "cursor-not-allowed text-fairy-hair-2",
                !outside && picked && "bg-fairy-rose font-bold text-white",
                !outside && !picked && "text-fairy-ink hover:bg-fairy-tint",
                !outside && !picked && day === todayKey && "ring-1 ring-fairy-pink",
              )}
            >
              {Number(day.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** First of the month a date sits in. */
function startOfMonth(day: string): Date {
  const [y, m] = day.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

/** "Sep 9" — the label on a chosen-date box. */
function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** The full date, for a screen reader on a calendar cell. */
function longDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** An amount typed in for a day that is not today. */
export function NewManualForm({
  tracker,
  me,
  members,
  onDone,
}: {
  tracker: Tracker;
  me: Member;
  members: Member[];
  onDone: () => void;
}) {
  const meta = TRACKER_MODE_META[tracker.mode];
  const [day, setDay] = useState(() => toDateInput(new Date().toISOString()));
  const [amount, setAmount] = useState("");
  const [people, setPeople] = useState<string[]>([me.id]);
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();

  async function submit() {
    const parsed = parseField(usageQuantitySchema, amount);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    const bad = dateProblem(day);
    if (bad) {
      setError(bad);
      return;
    }
    const occurredAt = toDayStart(day);
    if (!occurredAt) {
      setError("Pick a date.");
      return;
    }
    if (people.length === 0) {
      setError("Tick at least one person this is charged to.");
      return;
    }
    setError(null);
    const done = await action.run(() =>
      repo.addLogEntry(tracker.id, people, parsed.value, occurredAt),
    );
    if (done) onDone();
  }

  return (
    <div className="grid gap-2 border border-fairy-pink bg-card px-2.5 py-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="text-[10.5px] font-bold text-fairy-grey-strong">Date</span>
          <Input
            type="date"
            value={day}
            autoFocus
            min={entryDateBounds().min}
            max={entryDateBounds().max}
            className="h-8 w-[9.5rem] text-[12px]"
            onChange={(e) => {
              setDay(e.target.value);
              setError(null);
            }}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[10.5px] font-bold text-fairy-grey-strong">
            {meta.unitPlural}
          </span>
          <Input
            value={amount}
            inputMode="decimal"
            data-numeric
            placeholder={tracker.mode === "per_cycle" ? "e.g. 2" : "e.g. 1.5"}
            className="h-8 w-20 text-right tabular-nums"
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </label>
      </div>

      <ParticipantPicker
        members={members}
        selected={people}
        onChange={(update) => {
          setPeople(update);
          setError(null);
        }}
        idPrefix={`new-manual-${tracker.id}`}
        label="Charged to"
      />

      <ErrorNote>{error ?? action.error}</ErrorNote>

      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" disabled={action.pending} onClick={() => void submit()}>
          <Check className="size-3.5" aria-hidden />
          Add entry
        </Button>
      </div>
    </div>
  );
}

/**
 * One recorded entry: when it ran, how much it came to, and who it is charged
 * to — all of it changeable, because a log only records what somebody
 * remembered to press.
 *
 * A run with a span is edited AS a span: a date and two times, with the hours
 * derived. The occupancy clock has no "charged to" at all — you can only be in
 * the unit yourself.
 */
export function EntryRow({
  tracker,
  entry,
  members,
}: {
  tracker: Tracker;
  entry: LogEntry;
  members: Member[];
}) {
  const meta = TRACKER_MODE_META[tracker.mode];
  const spanned = Boolean(entry.startedAt && entry.endedAt);
  const sharable = !tracker.builtIn;

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(() => String(round3(entry.quantity)));
  const [day, setDay] = useState(() => toDateInput(entry.startedAt ?? entry.createdAt));
  const [from, setFrom] = useState(() => toTimeInput(entry.startedAt));
  const [to, setTo] = useState(() => toTimeInput(entry.endedAt));
  const [people, setPeople] = useState<string[]>(entry.participantIds);
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();

  function reset() {
    setDraft(String(round3(entry.quantity)));
    setDay(toDateInput(entry.startedAt ?? entry.createdAt));
    setFrom(toTimeInput(entry.startedAt));
    setTo(toTimeInput(entry.endedAt));
    setPeople(entry.participantIds);
    setError(null);
  }

  async function save() {
    if (sharable && people.length === 0) {
      setError("Tick at least one person this is charged to.");
      return;
    }

    if (spanned) {
      const bad = dateProblem(day);
    if (bad) {
      setError(bad);
      return;
    }
    const span = toSpan(day, from, to);
      if (!span) {
        setError("Fill in the date and both times.");
        return;
      }
      setError(null);
      const done = await action.run(() =>
        repo.updateLogEntry(tracker.id, entry.id, {
          startedAt: span.startedAt,
          endedAt: span.endedAt,
          ...(sharable ? { participantIds: people } : {}),
        }),
      );
      if (done) setEditing(false);
      return;
    }

    const parsed = parseField(usageQuantitySchema, draft);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    const bad = dateProblem(day);
    if (bad) {
      setError(bad);
      return;
    }
    const occurredAt = toDayStart(day);
    if (!occurredAt) {
      setError("Pick a date.");
      return;
    }
    setError(null);
    const done = await action.run(() =>
      repo.updateLogEntry(tracker.id, entry.id, {
        quantity: parsed.value,
        createdAt: occurredAt,
        ...(sharable ? { participantIds: people } : {}),
      }),
    );
    if (done) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3 border border-fairy-hair bg-fairy-screen px-2.5 py-2">
        <div className="min-w-0 text-[11.5px] font-medium text-fairy-grey-strong">
          <p>
            <span data-numeric className="font-bold text-fairy-ink">
              {describeQuantity(entry.quantity, tracker.mode, meta.unit, meta.unitPlural)}
            </span>
            {" · "}
            {fullStamp(entry)}
            {spanned && ` · ${timeOfDay(entry.startedAt)}–${timeOfDay(entry.endedAt)}`}
          </p>
          {sharable && (
            <p className="mt-0.5 truncate">
              Charged to {describePeople(members, entry.participantIds)}
            </p>
          )}
        </div>

        {/* Asking in place rather than in a modal: an entry is a small row in a
            list, and a dialog per row would be heavier than what it guards.
            Deleting one is not undoable — the hours simply stop counting. */}
        {confirming ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10.5px] font-bold text-fairy-grey-strong">Delete it?</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 bg-fairy-danger-tint px-2 text-[11px] text-fairy-danger hover:bg-fairy-danger-tint"
              disabled={action.pending}
              onClick={() => void action.run(() => repo.removeLogEntry(tracker.id, entry.id))}
            >
              Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="Edit this entry"
              onClick={() => {
                reset();
                setEditing(true);
              }}
              className="flex size-6 items-center justify-center text-fairy-grey-strong hover:text-fairy-rose"
            >
              <Pencil className="size-3" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Remove this entry"
              onClick={() => setConfirming(true)}
              className="flex size-6 items-center justify-center text-fairy-grey-strong hover:text-fairy-danger"
            >
              <Trash2 className="size-3" aria-hidden />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2 border border-fairy-pink bg-card px-2.5 py-2.5">
      {spanned ? (
        <SpanFields
          idPrefix={`entry-${entry.id}`}
          day={day}
          from={from}
          to={to}
          setDay={(v) => {
            setDay(v);
            setError(null);
          }}
          setFrom={(v) => {
            setFrom(v);
            setError(null);
          }}
          setTo={(v) => {
            setTo(v);
            setError(null);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            <span className="text-[10.5px] font-bold text-fairy-grey-strong">Date</span>
            <Input
              type="date"
              value={day}
              min={entryDateBounds().min}
              max={entryDateBounds().max}
              className="h-8 w-[9.5rem] text-[12px]"
              onChange={(e) => {
                setDay(e.target.value);
                setError(null);
              }}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[10.5px] font-bold text-fairy-grey-strong">
              {meta.unitPlural}
            </span>
            <Input
              aria-label={`How many ${meta.unitPlural}`}
              value={draft}
              autoFocus
              inputMode="decimal"
              data-numeric
              className="h-8 w-20 text-right tabular-nums"
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setEditing(false);
              }}
              aria-invalid={Boolean(error)}
            />
          </label>
        </div>
      )}

      {sharable && (
        <ParticipantPicker
          members={members}
          selected={people}
          onChange={(update) => {
            setPeople(update);
            setError(null);
          }}
          idPrefix={`entry-${entry.id}`}
          label="Charged to"
        />
      )}

      <ErrorNote>{error ?? action.error}</ErrorNote>

      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button size="sm" disabled={action.pending} onClick={() => void save()}>
          <Check className="size-3.5" aria-hidden />
          Save
        </Button>
      </div>
    </div>
  );
}

/** A date and two times — the shape a clock run is actually edited in. */
function SpanFields({
  idPrefix,
  day,
  from,
  to,
  setDay,
  setFrom,
  setTo,
}: {
  idPrefix: string;
  day: string;
  from: string;
  to: string;
  setDay: (v: string) => void;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="text-[10.5px] font-bold text-fairy-grey-strong">Date</span>
          <Input
            id={`${idPrefix}-day`}
            type="date"
            value={day}
            autoFocus
            min={entryDateBounds().min}
            max={entryDateBounds().max}
            className="h-8 w-[9.5rem] text-[12px]"
            onChange={(e) => setDay(e.target.value)}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[10.5px] font-bold text-fairy-grey-strong">From</span>
          <Input
            id={`${idPrefix}-from`}
            type="time"
            value={from}
            className="h-8 w-[6.5rem] text-[12px]"
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[10.5px] font-bold text-fairy-grey-strong">To</span>
          <Input
            id={`${idPrefix}-to`}
            type="time"
            value={to}
            className="h-8 w-[6.5rem] text-[12px]"
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The window a date is allowed to name.
 *
 * Nothing in the future — a log records what happened, not what is planned —
 * and nothing past the retention cut, since an entry older than that would be
 * pruned the moment it was saved.
 */
/**
 * Why a date cannot be used, or null if it can.
 *
 * `min`/`max` on the element only steer the picker; a date typed straight in
 * ignores them, so every save checks again. ISO dates compare correctly as
 * strings, which is why this is a comparison and not date arithmetic.
 */
export function dateProblem(day: string): string | null {
  if (!day) return "Pick a date.";
  const { min, max } = entryDateBounds();
  if (day > max) return "That day hasn't happened yet.";
  if (day < min) return `Logs only go back ${HISTORY_DAYS} days.`;
  return null;
}

export function entryDateBounds(): { min: string; max: string } {
  const today = new Date();
  const oldest = new Date();
  oldest.setDate(oldest.getDate() - HISTORY_DAYS);
  return {
    min: toDateInput(oldest.toISOString()),
    max: toDateInput(today.toISOString()),
  };
}

/** "2026-09-09" in LOCAL time, which is what a date input expects. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "14:30", local. */
function toTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A date and two times back into a pair of instants.
 *
 * An end at or before the start rolls to the next day rather than erroring:
 * "in at 10pm, out at 8am" is the ordinary shape of a night at home, and
 * refusing it would make the commonest correction the hardest one to type.
 */
function toSpan(
  day: string,
  from: string,
  to: string,
): { startedAt: string; endedAt: string; overnight: boolean } | null {
  const [y, m, d] = day.split("-").map(Number);
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  if (!y || !m || !d) return null;
  if ([fh, fm, th, tm].some((n) => !Number.isFinite(n))) return null;

  const start = new Date(y, m - 1, d, fh, fm, 0);
  const end = new Date(y, m - 1, d, th, tm, 0);
  const overnight = end.getTime() <= start.getTime();
  if (overnight) end.setDate(end.getDate() + 1);
  return {
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    overnight,
  };
}

/**
 * Local midnight of a chosen day.
 *
 * An entry with no span counts on the day it is stamped, so this is what moves
 * one from one bill to another.
 */
function toDayStart(day: string): string | null {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

/** "Sep 9" — always shown, so an entry never floats without a date. */
function fullStamp(entry: LogEntry): string {
  const at = Date.parse(entry.startedAt ?? entry.createdAt);
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Ana, Ben, Cy" — names, never ids, and commas all the way. */
function describePeople(members: Member[], ids: string[]): string {
  const names = ids
    .map((id) => members.find((m) => m.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return names.length === 0 ? "nobody" : names.join(", ");
}

/**
 * Whichever add-form this log takes: a span for a clock, an amount otherwise.
 *
 * The caller should not have to know which — it only knows it wants to record
 * something that was missed.
 */
export function AddEntryForm({
  tracker,
  me,
  members,
  onDone,
}: {
  tracker: Tracker;
  me: Member;
  members: Member[];
  onDone: () => void;
}) {
  return TRACKER_MODE_META[tracker.mode].live ? (
    <NewRunForm tracker={tracker} me={me} members={members} onDone={onDone} />
  ) : (
    <NewManualForm tracker={tracker} me={me} members={members} onDone={onDone} />
  );
}
