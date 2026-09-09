"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Crumbs, ErrorNote, LoadingRows, PageHeader } from "@/components/fairy/shell-bits";
import { findMe } from "@/components/fairy/bills-panel";
import { AddEntryForm, EntryRow } from "@/components/fairy/log-entries";
import { HISTORY_DAYS, dayKeyOf } from "@/lib/tracking/elapsed";
import { repo, type LogEntry, type Member, type Tracker } from "@/lib/data";
import { useRepoQuery } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

/**
 * Everything a room's logs have recorded, one tab per log.
 *
 * The cards on the room screen only show today, because that is what their
 * counters mean. This is where the rest lives — and it is the same row, so an
 * entry is edited, deleted or added the same way wherever you find it.
 */
export function LogsHistoryScreen({ roomId }: { roomId: string }) {
  const room = useRepoQuery(() => repo.getRoom(roomId), [roomId]);
  const members = useRepoQuery(() => repo.listMembers(roomId), [roomId]);
  const trackers = useRepoQuery(() => repo.listTrackers(roomId), [roomId]);
  const identity = useRepoQuery(() => repo.getIdentity(), []);
  const me = findMe(identity.data?.name, members.data ?? []);

  const logs = trackers.data ?? [];
  const [selected, setSelected] = useState<string | null>(null);

  // A card links here with "?log=<id>", so you land on the one you came from.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("log");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (wanted) setSelected(wanted);
  }, []);

  if (room.loading || trackers.loading) return <LoadingRows rows={3} />;

  if (room.error || !room.data) {
    return (
      <>
        <Crumbs items={[{ label: "Rooms", href: "/" }, { label: "Not found" }]} />
        <ErrorNote>{room.error ?? "That room isn't on this device."}</ErrorNote>
      </>
    );
  }

  const active = logs.find((t) => t.id === selected) ?? logs[0] ?? null;

  return (
    <>
      <Crumbs
        items={[
          { label: "Rooms", href: "/" },
          { label: room.data.name, href: `/rooms/${roomId}` },
          { label: "Logs history" },
        ]}
      />
      <PageHeader title="Logs history" />

      <ErrorNote>{trackers.error ?? members.error}</ErrorNote>

      {logs.length === 0 ? (
        <p className="text-[13px] font-medium text-fairy-grey-strong">
          This room has no logs yet.
        </p>
      ) : (
        <>
          {/* A tab per log. Scrolls sideways rather than wrapping, so the row
              stays one line however many logs a room collects. */}
          <div
            role="tablist"
            aria-label="Logs"
            className="mb-5 flex gap-1.5 overflow-x-auto border-b border-fairy-hair pb-px"
          >
            {logs.map((log) => {
              const current = active?.id === log.id;
              return (
                <button
                  key={log.id}
                  type="button"
                  role="tab"
                  aria-selected={current}
                  onClick={() => setSelected(log.id)}
                  className={cn(
                    "shrink-0 border-b-2 px-3 py-2 text-[12.5px] font-bold whitespace-nowrap transition-colors",
                    current
                      ? "border-fairy-pink text-fairy-ink"
                      : "border-transparent text-fairy-grey-strong hover:text-fairy-ink",
                  )}
                >
                  {log.name}
                </button>
              );
            })}
          </div>

          {active && me ? (
            <LogHistory tracker={active} me={me} members={members.data ?? []} />
          ) : (
            <p className="text-[13px] font-medium text-fairy-grey-strong">
              We can&rsquo;t tell which of these {(members.data ?? []).length} people
              you are. Set your name in the header to match your name in this room.
            </p>
          )}
        </>
      )}
    </>
  );
}

/** One log's entries, newest day first. */
function LogHistory({
  tracker,
  me,
  members,
}: {
  tracker: Tracker;
  me: Member;
  members: Member[];
}) {
  const [adding, setAdding] = useState(false);

  // Yours only, as everywhere else: a log is read from where you stand in it.
  const mine = tracker.entries.filter((e) => e.participantIds.includes(me.id));
  const days = groupByDay(mine);

  return (
    <section aria-labelledby="log-history-heading" className="fs-card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="log-history-heading" className="text-[14.5px] text-fairy-ink">
          {tracker.name}
        </h2>
        {!adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden />
            Add entry
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-4">
          <AddEntryForm
            tracker={tracker}
            me={me}
            members={members}
            onDone={() => setAdding(false)}
          />
        </div>
      )}

      {days.length === 0 ? (
        <p className="text-[12.5px] font-medium text-fairy-grey-strong">
          Nothing recorded in this log yet.
        </p>
      ) : (
        <div className="grid gap-4">
          {days.map(({ key, label, entries }) => (
            <div key={key}>
              <p className="mb-1.5 text-[10.5px] font-bold tracking-[0.1em] text-fairy-grey-strong uppercase">
                {label}
              </p>
              <ul className="grid gap-1.5">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <EntryRow tracker={tracker} entry={entry} members={members} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 border-t border-fairy-hair pt-3 text-[11px] leading-[1.5] font-medium text-fairy-grey-strong">
        Only the last {HISTORY_DAYS} days are kept. Older logs are automatically cleared.
      </p>
    </section>
  );
}

/** Entries bucketed by the day they happened, newest day first. */
function groupByDay(entries: LogEntry[]) {
  const buckets = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    // Dated by when it happened, not when the row was written.
    const at = Date.parse(entry.startedAt ?? entry.createdAt);
    const key = Number.isFinite(at) ? dayKeyOf(at) : "unknown";
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => ({
      key,
      label: labelForDay(key),
      entries: [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }));
}

function labelForDay(key: string): string {
  if (key === "unknown") return "Undated";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (key === dayKeyOf(Date.now())) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKeyOf(yesterday.getTime())) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
