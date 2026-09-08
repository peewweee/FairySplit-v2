"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillDialog } from "@/components/fairy/bill-dialog";
import { EmptyState, ErrorNote, LoadingRows } from "@/components/fairy/shell-bits";
import { SparkleBurst, useSparkle } from "@/components/fairy/sparkle-burst";
import { applyRoundUp } from "@/lib/billing/engine";
import { splitBill } from "@/lib/billing/from-bill";
import { formatCentavos } from "@/lib/billing/money";
import { repo, type Bill, type Member, type Tracker } from "@/lib/data";
import { useRepoQuery } from "@/lib/data/hooks";

export function BillsPanel({ roomId, members }: { roomId: string; members: Member[] }) {
  const bills = useRepoQuery(() => repo.listBills(roomId), [roomId]);
  const identity = useRepoQuery(() => repo.getIdentity(), []);
  const me = findMe(identity.data?.name, members);
  const trackers = useRepoQuery(() => repo.listTrackers(roomId), [roomId]);
  const list = bills.data ?? [];

  return (
    <section aria-labelledby="bills-heading" className="fs-card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="bills-heading" className="text-[14.5px] text-fairy-ink">
          Bills
        </h2>
        {/* When there are none, the empty state below owns the call to action. */}
        {list.length > 0 && <NewBillDialog roomId={roomId} members={members} compact />}
      </div>

      <ErrorNote>{bills.error}</ErrorNote>

      {bills.loading ? (
        <LoadingRows rows={2} />
      ) : list.length > 0 ? (
        <ul className="grid gap-2">
          {list.map((bill) => (
            <li key={bill.id}>
              <BillRow
                roomId={roomId}
                bill={bill}
                members={members}
                me={me}
                trackers={trackers.data ?? []}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Receipt className="size-5" aria-hidden />}
          title="No bills yet"
          description="Add the electric bill, the water bill, the internet — anything you split. Each one carries its own dates and day counts."
          action={<NewBillDialog roomId={roomId} members={members} />}
          className="py-10"
        />
      )}
    </section>
  );
}

/** Formats an ISO date without touching the local timezone. */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function describeCoverage(bill: Bill): string {
  if (bill.startsOn && bill.endsOn) {
    return `${formatDay(bill.startsOn)} – ${formatDay(bill.endsOn)}`;
  }
  return "No dates yet";
}

/**
 * The collapsed view of a bill: name, the dates it covers, an edit button, and
 * the amount underneath. Nothing else.
 *
 * The whole row opens the bill — a stretched link covering the card — while the
 * edit button sits above it in the stacking order, so the two never fight. That
 * keeps one link and one button instead of a button nested inside a link.
 */
function BillRow({
  roomId,
  bill,
  members,
  me,
  trackers,
}: {
  roomId: string;
  bill: Bill;
  members: Member[];
  /** The member this browser belongs to, if we can tell. */
  me: Member | null;
  trackers: Tracker[];
}) {
  const [editing, setEditing] = useState(false);
  const billed = applyRoundUp(bill.totalCentavos, bill.roundUpToPeso);
  cons
  return (
    <div className="relative border border-fairy-hair bg-card px-3.5 py-3 transition-colors hover:bg-fairy-screen">
      <Link
        href={`/rooms/${roomId}/bills/${bill.id}`}
        className="absolute inset-0"
        aria-label={`Open ${bill.name}`}
      />

      <div className="flex items-center gap-2.5">
        <span className="truncate text-[13.5px] font-bold tracking-[-0.02em] text-fairy-ink">
          {bill.name}
        </span>
        <span className="shrink-0 text-[11.5px] font-medium text-fairy-grey">
          {describeCoverage(bill)}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${bill.name}`}
          className="relative ml-auto shrink-0"
        >
          <Pencil className="size-3.5 text-fairy-grey" />
        </Button>
      </div>

      <p
        className="mt-0.5 text-[17px] font-extrabold tracking-[-0.035em] text-fairy-ink"
        data-numeric
      >
        {formatCentavos(billed)}
      </p>

      {mine && (
        <div className="mt-1.5 grid gap-0.5 text-[11.5px] font-medium text-fairy-grey">
          <p>
            Your total hours logged:{" "}
            <span className="font-bold text-fairy-ink" data-numeric>
              {mine.hours} {mine.hours === 1 ? "hour" : "hours"}
            </span>
          </p>
          <p>
            Your share:{" "}
            <span className="font-bold text-fairy-ink" data-numeric>
              {formatCentavos(mine.share)}
            </span>
          </p>
        </div>
      )}

      {editing && (
        <BillDialog
          open
          onOpenChange={setEditing}
          roomId={roomId}
          members={members}
          bill={bill}
        />
      )}
    </div>
  );
}

/** The "+ New bill" trigger. Same dialog, with nothing filled in. */
export function NewBillDialog({
  roomId,
  members,
  compact,
}: {
  roomId: string;
  members: Member[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { burst, sparkle } = useSparkle();

  return (
    <>
      <Button
        size={compact ? "sm" : "lg"}
        variant={compact ? "secondary" : "default"}
        className="relative"
        onClick={() => {
          sparkle();
          setOpen(true);
        }}
      >
        <SparkleBurst burst={burst} />
        <Plus className={compact ? "size-3.5" : "size-4"} aria-hidden />
        New bill
      </Button>
      {open && (
        <BillDialog open onOpenChange={setOpen} roomId={roomId} members={members} />
      )}
    </>
  );
}

/**
 * Which member is "me"?
 *
 * Phase A has no accounts — the identity in the header is just a name, and it
 * seeds the first member when you create a room. So this matches on that name.
 * A miss returns null and the per-person lines are simply left off, rather than
 * showing someone else's numbers as yours.
 */
export function findMe(identityName: string | undefined, members: Member[]): Member | null {
  const wanted = identityName?.trim().toLowerCase();
  if (!wanted) return null;
  return members.find((m) => m.name.trim().toLowerCase() === wanted) ?? null;
}

/** This person's logged hours and their share of one bill. */
function myLine(bill: Bill, members: Member[], me: Member, trackers: Tracker[]) {
  const perHour = new Set(
    bill.appliances.filter((a) => a.mode === "per_hour").map((a) => a.id),
  );
  const hours = bill.uses
    .filter((u) => perHour.has(u.applianceId) && u.participantIds.includes(me.id))
    .reduce((acc, u) => acc + u.quantity, 0);

  const { result } = splitBill(bill, members, trackers);
  const row = result?.rows.find((r) => r.memberId === me.id);
  if (!row) return null;

  return { hours: Math.round(hours * 1000) / 1000, share: row.totalCentavos };
}
