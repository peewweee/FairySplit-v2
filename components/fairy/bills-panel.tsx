"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillDialog } from "@/components/fairy/bill-dialog";
import { EmptyState, ErrorNote, LoadingRows } from "@/components/fairy/shell-bits";
import { SparkleBurst, useSparkle } from "@/components/fairy/sparkle-burst";
import { applyRoundUp } from "@/lib/billing/engine";
import { HOURS_PER_DAY } from "@/lib/billing/occupancy";
import { splitBill } from "@/lib/billing/from-bill";
import { formatCentavos } from "@/lib/billing/money";
import { repo, type Bill, type Member, type Tracker } from "@/lib/data";
import { useRepoQuery } from "@/lib/data/hooks";

export function BillsPanel({ roomId, members }: { roomId: string; members: Member[] }) {
  const bills = useRepoQuery(() => repo.listBills(roomId), [roomId]);
  const mine = useRepoQuery(() => repo.getMyMember(roomId), [roomId]);
  const me = mine.data ?? null;
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
  /** The signed-in person's own row in this room, if they have one. */
  me: Member | null;
  trackers: Tracker[];
}) {
  const billed = applyRoundUp(bill.totalCentavos, bill.roundUpToPeso);
  const mine = me ? myLine(bill, members, me, trackers) : null;

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
        {/* Decorative: the whole row is already the link, and a second
            focusable control pointing at the same place would only add a stop
            to the tab order. Editing lives behind the bill's own menu. */}
        <ChevronRight className="ml-auto size-4 shrink-0 text-fairy-hair-2" aria-hidden />
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

/** This person's logged hours and their share of one bill. */
function myLine(bill: Bill, members: Member[], me: Member, trackers: Tracker[]) {
  const { result } = splitBill(bill, members, trackers);
  const row = result?.rows.find((r) => r.memberId === me.id);
  if (!row) return null;

  // Straight off the row the split was computed from, so this line and the
  // bill's own summary can never quote different hours for the same stay.
  const hours = row.days * HOURS_PER_DAY;
  return { hours: Math.round(hours * 100) / 100, share: row.totalCentavos };
}
