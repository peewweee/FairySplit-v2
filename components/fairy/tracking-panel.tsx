"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, ChevronDown, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, LoadingRows } from "@/components/fairy/shell-bits";
import { findMe } from "@/components/fairy/bills-panel";
import { AddLogForm } from "@/components/fairy/add-log-dialog";
import {
  dayKeyOf,
  describeQuantity,
  formatDuration,
  formatQuantity,
  nextMidnight,
  runningSince,
  todayFor,
} from "@/lib/tracking/elapsed";
import {
  TRACKER_MODE_META,
  repo,
  type LogEntry,
  type Member,
  type Tracker,
} from "@/lib/data";
import { useRepoAction, useRepoQuery } from "@/lib/data/hooks";
import { usageQuantitySchema } from "@/lib/forms/numeric";
import { labelSchema, parseField } from "@/lib/forms/schemas";
import { cn } from "@/lib/utils";

/**
 * Your own tracking for a room: clock in when you are in the unit, and keep a
 * running count of anything else worth splitting.
 *
 * This is the clock in/out system. Everything here is yours alone — other
 * people's runs live on their own devices until sync lands (§9).
 *
 * The wall clock is read in two places and two only: the repository, when it
 * stamps a start or an end, and `useNow` below, which exists purely to make the
 * seconds on screen advance. Nothing is ever *stored* from `useNow`.
 */
export function TrackingPanel({ roomId, members }: { roomId: string; members: Member[] }) {
  const trackers = useRepoQuery(() => repo.listTrackers(roomId), [roomId]);
  const identity = useRepoQuery(() => repo.getIdentity(), []);
  const me = findMe(identity.data?.name, members);

  return (
    <section aria-labelledby="tracking-heading" className="fs-card mb-6 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="tracking-heading" className="text-[14.5px] text-fairy-ink">
          Your tracking
        </h2>
        {me && <AddTrackerDialog roomId={roomId} />}
      </div>

      <ErrorNote>{trackers.error ?? identity.error}</ErrorNote>

      {!me ? (
        <p className="text-[11.5px] leading-[1.5] font-medium text-fairy-grey-strong">
          We can&rsquo;t tell which of these {members.length} people you are. Set
          your name in the header to match your name in this room and your clock
          appears here.
        </p>
      ) : trackers.loading ? (
        <LoadingRows rows={2} />
      ) : (
        <TrackerList
          roomId={roomId}
          trackers={trackers.data ?? []}
          me={me}
          members={members}
        />
      )}
    </section>
  );
}

/* -- ordering ------------------------------------------------------------- *
 * Drag to sort, built on pointer events rather than HTML5 drag-and-drop: the
 * native API does not fire on touch, and this app is used on phones. Arrow keys
 * do the same job for anyone not using a pointer at all.
 * ------------------------------------------------------------------------- */

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** The `gap-2.5` between cards, in px — part of how far a card has to move. */
const CARD_GAP = 10;

interface DragState {
  id: string;
  /** Where it started and where it would land, as indices into the list. */
  from: number;
  to: number;
  /** How far the pointer has travelled since the grab. */
  dy: number;
  /** One card plus the gap: how far the others step to open a slot. */
  step: number;
}

function TrackerList({
  roomId,
  trackers,
  me,
  members,
}: {
  roomId: string;
  trackers: Tracker[];
  me: Member;
  members: Member[];
}) {
  const action = useRepoAction();
  const [drag, setDrag] = useState<DragState | null>(null);
  // Holds the dropped order until the store hands it back, so the list does not
  // snap to the old one for a frame.
  const [pending, setPending] = useState<string[] | null>(null);
  const grabbedAt = useRef(0);
  const nodes = useRef(new Map<string, HTMLElement | null>());
  /**
   * Where every card sat when the drag began.
   *
   * The DOM order does NOT change while dragging — the cards are only moved by
   * transforms, which do not affect layout. So these boxes stay true for the
   * whole gesture, and the drop target can be worked out against them without
   * re-measuring a list that is sliding around.
   */
  const boxes = useRef<{ top: number; bottom: number; middle: number }[]>([]);

  const byId = new Map(trackers.map((t) => [t.id, t]));
  const ids = pending ?? trackers.map((t) => t.id);
  const shown = ids.map((id) => byId.get(id)).filter((t): t is Tracker => Boolean(t));

  function begin(id: string, event: ReactPointerEvent<HTMLButtonElement>) {
    // Capture on the handle so the drag survives the pointer leaving it.
    event.currentTarget.setPointerCapture(event.pointerId);
    const from = ids.indexOf(id);
    boxes.current = ids.map((each) => {
      const box = nodes.current.get(each)?.getBoundingClientRect();
      const top = box?.top ?? 0;
      const bottom = box?.bottom ?? 0;
      return { top, bottom, middle: (top + bottom) / 2 };
    });
    grabbedAt.current = event.clientY;
    const height = boxes.current[from].bottom - boxes.current[from].top;
    setDrag({ id, from, to: from, dy: 0, step: height + CARD_GAP });
  }

  function over(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const dy = event.clientY - grabbedAt.current;

    // Whichever card the dragged one's CENTRE is over is the slot it takes.
    // Centre rather than pointer position, so a card grabbed by its handle at
    // the top edge does not need dragging a whole card past the target.
    const centre = boxes.current[drag.from].middle + dy;
    let to = drag.from;
    boxes.current.forEach((box, index) => {
      if (centre >= box.top && centre <= box.bottom) to = index;
    });
    if (centre < boxes.current[0].top) to = 0;
    if (centre > boxes.current[boxes.current.length - 1].bottom) to = boxes.current.length - 1;

    if (dy !== drag.dy || to !== drag.to) setDrag({ ...drag, dy, to });
  }

  async function drop() {
    if (!drag) return;
    const next = moveItem(ids, drag.from, drag.to);
    const moved = drag.to !== drag.from;
    // Clearing the drag drops every transform in the same commit that renders
    // the new order, so the cards land where they already appear to be.
    setPending(next);
    setDrag(null);
    if (moved) await action.run(() => repo.reorderTrackers(roomId, next));
    setPending(null);
  }

  function nudge(id: string, delta: number) {
    const current = trackers.map((t) => t.id);
    const from = current.indexOf(id);
    const to = Math.min(Math.max(from + delta, 0), current.length - 1);
    if (to === from || from < 0) return;
    void action.run(() => repo.reorderTrackers(roomId, moveItem(current, from, to)));
  }

  /** How far card `index` has slid from where it is laid out. */
  function offsetFor(index: number): number {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    // Everything between the old slot and the new one steps one place to make
    // room, in whichever direction closes the gap the dragged card left.
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.step;
    if (drag.from > drag.to && index >= drag.to && index < drag.from) return drag.step;
    return 0;
  }

  return (
    <>
      <div className={cn("grid gap-2.5", drag && "cursor-grabbing select-none")}>
        {shown.map((tracker, index) => (
          <TrackerCard
            key={tracker.id}
            tracker={tracker}
            me={me}
            members={members}
            dragging={drag?.id === tracker.id}
            offset={offsetFor(index)}
            settling={!drag}
            index={index}
            total={shown.length}
            // Block body on purpose: React 19 reads a ref callback's return
            // value as a cleanup function, and Map.set returns the map.
            nodeRef={(node) => {
              nodes.current.set(tracker.id, node);
            }}
            onDragStart={(event) => begin(tracker.id, event)}
            onDragMove={over}
            onDragEnd={() => void drop()}
            onNudge={(delta) => nudge(tracker.id, delta)}
          />
        ))}
      </div>
      <ErrorNote>{action.error}</ErrorNote>
    </>
  );
}

/** The grip. A real button, so the keyboard can reorder without a pointer. */
function DragHandle({
  label,
  index,
  total,
  onDragStart,
  onDragMove,
  onDragEnd,
  onNudge,
}: {
  label: string;
  index: number;
  total: number;
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onNudge: (delta: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Reorder ${label}, ${index + 1} of ${total}. Drag, or use the up and down arrow keys.`}
      // touch-none stops the browser treating the drag as a page scroll.
      className="-ml-1 shrink-0 cursor-grab touch-none rounded p-1 text-fairy-hair-2 hover:text-fairy-ink active:cursor-grabbing"
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onNudge(-1);
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onNudge(1);
        }
      }}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

/* -- the ticking ---------------------------------------------------------- */

/**
 * Wall-clock in milliseconds, re-read once a second — but only while something
 * is actually running, so a room full of stopped clocks costs nothing.
 *
 * When `active` flips on, the value here is stale by however long the panel sat
 * idle, which would make a freshly started run look negative. `hoursSince`
 * floors at zero, so it reads 00:00:00 until the first tick a second later.
 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  // A stopped card has no interval, but it still has to fall back to zero when
  // the day turns over. One timeout, re-armed once a day rather than once a
  // second — hence the dependency on the day and not on `now`.
  const today = dayKeyOf(now);
  useEffect(() => {
    const id = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(1000, nextMidnight(Date.now()) - Date.now() + 50),
    );
    return () => window.clearTimeout(id);
  }, [today]);

  return now;
}

/* -- one tracker ---------------------------------------------------------- */

function TrackerCard({
  tracker,
  me,
  members,
  dragging,
  offset,
  settling,
  index,
  total,
  nodeRef,
  onDragStart,
  onDragMove,
  onDragEnd,
  onNudge,
}: {
  tracker: Tracker;
  me: Member;
  members: Member[];
  dragging: boolean;
  /** How far this card has slid from where it is laid out, in px. */
  offset: number;
  /** No drag in flight — transforms are gone and nothing should animate back. */
  settling: boolean;
  index: number;
  total: number;
  nodeRef: (node: HTMLElement | null) => void;
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onNudge: (delta: number) => void;
}) {
  const meta = TRACKER_MODE_META[tracker.mode];
  const openedAt = runningSince(tracker, me.id);
  const now = useNow(Boolean(openedAt));
  const mine = tracker.entries.filter((e) => e.memberId === me.id);

  return (
    <article
      ref={nodeRef}
      className={cn(
        "relative rounded-xl p-3.5 sm:p-4",
        // The occupancy clock decides how every bill is weighted, so it is the
        // one card that should catch your eye across a list of added logs.
        tracker.builtIn
          ? "border-2 border-fairy-pink bg-fairy-tint"
          : cn("border bg-card", dragging ? "border-fairy-pink" : "border-fairy-hair"),
        dragging && "z-10 shadow-[0_14px_30px_rgba(28,21,24,0.18)]",
      )}
      style={{
        // The lift is a transform, not a layout change: the card leaves the
        // flow visually while its slot stays put, which is what lets the
        // others slide into a gap of exactly the right size.
        transform: dragging
          ? `translateY(${offset}px) scale(1.015)`
          : offset
            ? `translateY(${offset}px)`
            : undefined,
        // The dragged card must track the pointer with no lag; the ones making
        // room should glide. Nothing animates once the drag ends, or every card
        // would slide back from a position it no longer holds.
        transition: dragging || settling ? "none" : "transform 170ms cubic-bezier(0.2, 0, 0, 1)",
        willChange: dragging || offset ? "transform" : undefined,
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <DragHandle
            label={tracker.name}
            index={index}
            total={total}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onNudge={onNudge}
          />
          <TrackerName tracker={tracker} />
        </div>
        {!tracker.builtIn && <RemoveTracker tracker={tracker} />}
      </div>

      {meta.live ? (
        <ClockBody tracker={tracker} me={me} members={members} openedAt={openedAt} now={now} />
      ) : (
        <ManualBody tracker={tracker} me={me} now={now} />
      )}

      <EntryList tracker={tracker} entries={mine} now={now} />
    </article>
  );
}

/* -- clock mode ----------------------------------------------------------- */

function ClockBody({
  tracker,
  me,
  members,
  openedAt,
  now,
}: {
  tracker: Tracker;
  me: Member;
  members: Member[];
  openedAt: string | null;
  now: number;
}) {
  const action = useRepoAction();
  // The counter is a TODAY counter — it starts each local day at zero. The
  // entries behind it are never touched, only the window that is added up.
  const today = todayFor(tracker, me.id, now);
  const running = Boolean(openedAt);

  // Everyone else the store knows is clocked in. Only meaningful once sync
  // lands, but it costs nothing and it is true of the data we hold today.
  const othersIn = members.filter((m) => m.id !== me.id && tracker.runningSince[m.id]);

  return (
    <>
      <div className="min-w-0">
        <TodayLabel accent={tracker.builtIn} />
        <p
          data-numeric
          aria-live="off"
          className={cn(
            "text-[40px] leading-none font-bold tracking-[-0.03em] tabular-nums sm:text-[46px]",
            tracker.builtIn
              ? running
                ? "text-fairy-rose"
                : "text-fairy-tint-ink"
              : running
                ? "text-fairy-ink"
                : "text-fairy-grey-strong",
          )}
        >
          {formatDuration(today)}
        </p>
      </div>

      <InOut
        label={tracker.name}
        builtIn={tracker.builtIn}
        running={running}
        pending={action.pending}
        onIn={() => void action.run(() => repo.startClock(tracker.id, me.id))}
        onOut={() => void action.run(() => repo.stopClock(tracker.id, me.id))}
      />

      {othersIn.length > 0 && (
        <p className="mt-2 text-[10.5px] font-medium text-fairy-grey-strong">
          {othersIn.map((m) => m.name).join(", ")}{" "}
          {othersIn.length === 1 ? "is" : "are"} clocked in too.
        </p>
      )}

      <ErrorNote>{action.error}</ErrorNote>
    </>
  );
}

/**
 * The switch.
 *
 * Two buttons rather than one toggle: with a single control, tapping the half
 * that already reads "I'm in" would clock you OUT, which is the one mistake
 * this thing must not make. Here each button states where you land.
 */
function InOut({
  label,
  builtIn,
  running,
  pending,
  onIn,
  onOut,
}: {
  label: string;
  /** Only the occupancy clock is about where YOU are. */
  builtIn: boolean;
  running: boolean;
  pending: boolean;
  onIn: () => void;
  onOut: () => void;
}) {
  // "I'm in" answers "are you in the unit?" and belongs to that clock alone. An
  // added log is usually a thing, not a person — "I'm in" beside "Air
  // conditioner" reads as nonsense — so those say clock in and clock out.
  const [inLabel, outLabel] = builtIn ? ["I'm in", "I'm out"] : ["Clock in", "Clock out"];

  return (
    <div
      role="group"
      aria-label={`Clock in or out of ${label}`}
      className={cn(
        "mt-4 flex w-full rounded-full border-2 p-1",
        builtIn ? "border-fairy-pink bg-card" : "border-fairy-hair-2 bg-fairy-screen",
      )}
    >
      <Half
        label={inLabel}
        on={running}
        pending={pending}
        onClick={onIn}
        tone={builtIn ? "primary" : "in"}
      />
      <Half label={outLabel} on={!running} pending={pending} onClick={onOut} tone="out" />
    </div>
  );
}

function Half({
  label,
  on,
  pending,
  onClick,
  tone,
}: {
  label: string;
  on: boolean;
  pending: boolean;
  onClick: () => void;
  tone: "primary" | "in" | "out";
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={pending}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-full px-4 py-3 text-[15px] font-bold whitespace-nowrap transition-colors disabled:opacity-45 sm:text-[16px]",
        on
          ? tone === "primary"
            ? "bg-fairy-rose text-white"
            : tone === "in"
              ? "bg-fairy-moss text-white"
              : "bg-fairy-ink text-white"
          : "text-fairy-grey-strong hover:text-fairy-ink",
      )}
    >
      {label}
    </button>
  );
}

/** Says out loud that the big number underneath is a daily one. */
function TodayLabel({ accent = false }: { accent?: boolean }) {
  return (
    <p
      className={cn(
        "mb-1 text-[10px] font-bold tracking-[0.13em] uppercase",
        accent ? "text-fairy-tint-ink" : "text-fairy-grey-strong",
      )}
    >
      Today
    </p>
  );
}

function timeOfDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/* -- manual modes --------------------------------------------------------- */

function ManualBody({ tracker, me, now }: { tracker: Tracker; me: Member; now: number }) {
  const meta = TRACKER_MODE_META[tracker.mode];
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();
  // Same daily window as the clock cards, so one card never means "today" while
  // the one under it means "ever".
  const today = todayFor(tracker, me.id, now);

  async function log() {
    const parsed = parseField(usageQuantitySchema, draft);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    const done = await action.run(() => repo.addLogEntry(tracker.id, me.id, parsed.value));
    if (done) setDraft("");
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <TodayLabel />
          <p
            data-numeric
            className="text-[30px] leading-none font-bold tracking-[-0.03em] tabular-nums text-fairy-ink sm:text-[34px]"
          >
            {formatQuantity(today, tracker.mode)}
            <span className="ml-1.5 text-[13px] font-semibold text-fairy-grey-strong">
              {meta.unitPlural}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            aria-label={`Add ${meta.unitPlural} to ${tracker.name}`}
            value={draft}
            inputMode="decimal"
            data-numeric
            placeholder={tracker.mode === "per_cycle" ? "e.g. 2" : "e.g. 1.5"}
            className="h-9 w-24 text-right tabular-nums"
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void log();
            }}
            aria-invalid={Boolean(error)}
          />
          <Button size="sm" variant="secondary" disabled={action.pending} onClick={() => void log()}>
            <Plus className="size-3.5" aria-hidden />
            Log
          </Button>
        </div>
      </div>

      <ErrorNote>{error ?? action.error}</ErrorNote>
    </>
  );
}

/* -- shared bits ---------------------------------------------------------- */

/** The name, with a pencil that turns it into a field in place. */
function TrackerName({ tracker }: { tracker: Tracker }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tracker.name);
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();

  async function save() {
    const parsed = parseField(labelSchema, draft);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    if (parsed.value === tracker.name) {
      setEditing(false);
      return;
    }
    const done = await action.run(() => repo.renameTracker(tracker.id, parsed.value));
    if (done) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <h3 className="min-w-0 truncate text-[13px] font-bold tracking-[-0.02em] text-fairy-ink">
          {tracker.name}
        </h3>
        <button
          type="button"
          aria-label={`Rename ${tracker.name}`}
          onClick={() => {
            setDraft(tracker.name);
            setError(null);
            setEditing(true);
          }}
          className="shrink-0 text-fairy-grey-strong hover:text-fairy-pink-deep"
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <Input
          aria-label="Log name"
          value={draft}
          autoFocus
          className="h-8 max-w-56 text-[13px] font-bold"
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
        <button
          type="button"
          aria-label="Save name"
          disabled={action.pending}
          onClick={() => void save()}
          className="shrink-0 text-fairy-moss disabled:opacity-45"
        >
          <Check className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Cancel rename"
          onClick={() => setEditing(false)}
          className="shrink-0 text-fairy-grey-strong hover:text-fairy-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ErrorNote>{error ?? action.error}</ErrorNote>
    </div>
  );
}

function RemoveTracker({ tracker }: { tracker: Tracker }) {
  const [confirming, setConfirming] = useState(false);
  const action = useRepoAction();

  if (!confirming) {
    return (
      <button
        type="button"
        aria-label={`Remove ${tracker.name}`}
        onClick={() => setConfirming(true)}
        className="shrink-0 text-fairy-grey-strong hover:text-fairy-danger"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-[11px] font-semibold text-fairy-grey-strong">
        Remove it and its {tracker.entries.length} entries?
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 bg-fairy-danger-tint px-2 text-[11.5px] text-fairy-danger hover:bg-fairy-danger-tint"
        disabled={action.pending}
        onClick={() => void action.run(() => repo.removeTracker(tracker.id))}
      >
        Remove
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-[11.5px]"
        onClick={() => setConfirming(false)}
      >
        Keep
      </Button>
    </div>
  );
}

/** Collapsed history. Open it to fix a mis-tap. */
function EntryList({
  tracker,
  entries,
  now,
}: {
  tracker: Tracker;
  entries: LogEntry[];
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const meta = TRACKER_MODE_META[tracker.mode];
  const action = useRepoAction();
  const todayKey = dayKeyOf(now);

  if (entries.length === 0) return null;

  // Newest first — the one you just logged is the one you might undo.
  const ordered = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="mt-3 border-t border-fairy-hair pt-2.5">
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
        {entries.length} {entries.length === 1 ? "entry" : "entries"}
      </button>

      {open && (
        <ul className="mt-2 grid gap-1">
          {ordered.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 text-[11.5px] font-medium text-fairy-grey-strong"
            >
              <span className="min-w-0 truncate">
                <span data-numeric className="font-bold text-fairy-ink">
                  {describeQuantity(entry.quantity, tracker.mode, meta.unit, meta.unitPlural)}
                </span>
                {/* The counter above only shows today, so anything older says
                    which day it was — otherwise the history looks like it
                    disagrees with the number. */}
                {stampOf(entry, todayKey) && ` · ${stampOf(entry, todayKey)}`}
                {entry.startedAt && ` · ${timeOfDay(entry.startedAt)}–${timeOfDay(entry.endedAt)}`}
              </span>
              <button
                type="button"
                aria-label="Remove this entry"
                disabled={action.pending}
                onClick={() => void action.run(() => repo.removeLogEntry(tracker.id, entry.id))}
                className="shrink-0 text-fairy-grey-strong hover:text-fairy-danger disabled:opacity-45"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote>{action.error}</ErrorNote>
    </div>
  );
}

/** "Aug 21" for an entry from another day; nothing at all for today's. */
function stampOf(entry: LogEntry, todayKey: string): string {
  const at = Date.parse(entry.startedAt ?? entry.createdAt);
  if (!Number.isFinite(at) || dayKeyOf(at) === todayKey) return "";
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* -- adding one ----------------------------------------------------------- */

function AddTrackerDialog({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden />
        Add log
      </Button>
      {/* Mounted only while open, so it never reopens holding the last entry. */}
      {open && <AddLogForm roomId={roomId} onDone={() => setOpen(false)} />}
    </>
  );
}
