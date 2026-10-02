"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BillDialog } from "@/components/fairy/bill-dialog";
import { ShareTable } from "@/components/fairy/share-table";
import { WarningBanner } from "@/components/fairy/warning-banner";
import { Crumbs, ErrorNote, LoadingRows } from "@/components/fairy/shell-bits";
import { describeCoverage } from "@/components/fairy/bills-panel";
import {
} from "@/lib/billing/occupancy";
import { applyRoundUp } from "@/lib/billing/engine";
import { splitBill, trackerProblems } from "@/lib/billing/from-bill";
import { BillLogsPanel } from "@/components/fairy/bill-logs-panel";
import { BillExportButton } from "@/components/fairy/bill-export";
import { formatCentavos } from "@/lib/billing/money";
import { repo, type Bill, type Member, type Room } from "@/lib/data";
import { useRepoAction, useRepoQuery } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export function BillScreen({ roomId, billId }: { roomId: string; billId: string }) {
  const room = useRepoQuery(() => repo.getRoom(roomId), [roomId]);
  const bill = useRepoQuery(() => repo.getBill(billId), [billId]);
  const members = useRepoQuery(() => repo.listMembers(roomId), [roomId]);
  const me = useRepoQuery(() => repo.getMyMember(roomId), [roomId]);

  if (bill.loading || room.loading || members.loading || me.loading) {
    return <LoadingRows rows={3} />;
  }

  if (!bill.data || !room.data) {
    return (
      <>
        <Crumbs items={[{ label: "Rooms", href: "/" }, { label: "Not found" }]} />
        <ErrorNote>
          {bill.error ?? room.error ?? "That bill doesn't exist, or you're not in its room."}
        </ErrorNote>
      </>
    );
  }

  return (
    <BillBody
      room={room.data}
      bill={bill.data}
      members={members.data ?? []}
      me={me.data ?? null}
    />
  );
}

function BillBody({
  room,
  bill,
  members,
  me,
}: {
  room: Room;
  bill: Bill;
  members: Member[];
  /** The signed-in person's own row in this room, if they have one. */
  me: Member | null;
}) {
  const billed = applyRoundUp(bill.totalCentavos, bill.roundUpToPeso);
  // Appliances charged from a log read their quantities out of it, so the
  // split cannot be computed without them.
  const trackers = useRepoQuery(() => repo.listTrackers(bill.roomId), [bill.roomId]);
  const { result, problem } = splitBill(bill, members, trackers.data ?? []);
  const action = useRepoAction();

  return (
    <>
      <Crumbs
        items={[
          { label: "Rooms", href: "/" },
          { label: room.name, href: `/rooms/${room.id}` },
          { label: bill.name },
        ]}
      />
      {/* The sample's hero: arc bleed, caption, a 29px amount, a meta row
          separated by dots. The one loud element on the screen. */}
      <div className="fs-card mb-6 px-5 py-5">
        <span className="fs-arc fs-arc-a" aria-hidden />
        <span className="fs-arc fs-arc-b" aria-hidden />
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="fs-lab mb-1.5">{bill.name}</p>
            <p className="fs-val mb-2 text-[29px] leading-none" data-numeric>
              {formatCentavos(billed)}
            </p>
            {/* Name, amount, dates. Nothing else — how it splits is spelled out
                below, and the due date lives in the bill's own editor. */}
            <p className="text-[12.5px] font-semibold text-fairy-grey">
              {describeCoverage(bill)}
            </p>
          </div>
          <BillActions bill={bill} roomId={room.id} members={members} />
        </div>
      </div>

      <BillLogsPanel bill={bill} me={me} trackers={trackers.data ?? []} result={result} />

      <div className="grid gap-5">
        {/* The share table is the point of the screen, so it leads. */}
        <div className="grid gap-4">
          <WarningBanner warnings={result?.warnings ?? []} />

          {/* An appliance pointing at a deleted log costs nothing, which looks
              exactly like an appliance nobody used. Say which it is. */}
          {trackerProblems(bill, trackers.data ?? []).map((message) => (
            <ErrorNote key={message}>{message}</ErrorNote>
          ))}

          {result ? (
            <>
              {/* The printable sheet: a heading the page does not otherwise
                  need, then the table. Print CSS shows only this. */}
              <div data-print-sheet>
                <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="hidden text-[18px] font-extrabold tracking-[-0.03em] text-fairy-ink print:block">
                      {bill.name}
                    </p>
                    <p className="hidden text-[12px] font-medium text-fairy-grey-strong print:block">
                      {room.name} · {describeCoverage(bill)} · {formatCentavos(billed)}
                    </p>
                  </div>
                  <div data-print-hide className="ml-auto">
                    <BillExportButton
                      bill={bill}
                      room={room}
                      members={members}
                      trackers={trackers.data ?? []}
                      result={result}
                      billedCentavos={billed}
                    />
                  </div>
                </div>

                <ShareTable
                  bill={bill}
                  trackers={trackers.data ?? []}
                  result={result}
                  members={members}
                  billedCentavos={billed}
                  paidMemberIds={bill.paidMemberIds}
                  onTogglePaid={(memberId, paid) =>
                    void action.run(() => repo.setPaid(bill.id, memberId, paid))
                  }
                />
              </div>
              <SettleSummary bill={bill} result={result} />
            </>
          ) : (
            <div className="border-l-[2.5px] border-fairy-ember bg-fairy-ember-tint px-4 py-3.5">
              <p className="text-[13px] font-bold text-fairy-ember">{problem}</p>
              <p className="mt-1.5 text-[12px] font-medium text-fairy-ink-2">
                Nothing is lost — fix the flagged figure and the split appears.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The two things you do TO a bill, behind one quiet control.
 *
 * Editing and deleting are rare next to reading the split, so they get a single
 * icon rather than two buttons competing with the amount.
 */
function BillActions({
  bill,
  roomId,
  members,
}: {
  bill: Bill;
  roomId: string;
  members: Member[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const action = useRepoAction();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Options for ${bill.name}`}
            className="shrink-0 text-fairy-grey-strong hover:text-fairy-ink"
          >
            <Settings2 className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden />
            Edit this bill
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setConfirming(true)}
            className="text-fairy-danger focus:bg-fairy-danger-tint focus:text-fairy-danger"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete this bill
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mounted only while open, so the editor never reopens half-filled. */}
      {editing && (
        <BillDialog
          open
          onOpenChange={setEditing}
          roomId={roomId}
          members={members}
          bill={bill}
        />
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[21px] text-fairy-ink">
              Delete {bill.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its dates, appliances, charges and any hand-edited figures go with
              it. The logs it counted from stay in the room, and other bills are
              untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-fairy-danger-tint text-fairy-danger hover:bg-fairy-danger-tint"
              onClick={async () => {
                const done = await action.run(async () => {
                  await repo.deleteBill(bill.id);
                  return true;
                });
                if (done) router.push(`/rooms/${roomId}`);
              }}
            >
              Delete bill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ErrorNote>{action.error}</ErrorNote>
    </>
  );
}

/** "2 of 3 paid · ₱333.33 still owed" — the state everyone actually asks about. */
function SettleSummary({
  bill,
  result,
}: {
  bill: Bill;
  result: NonNullable<ReturnType<typeof splitBill>["result"]>;
}) {
  const outstanding = result.rows
    .filter((r) => !bill.paidMemberIds.includes(r.memberId))
    .reduce((acc, r) => acc + r.totalCentavos, 0);
  const paidCount = result.rows.filter((r) => bill.paidMemberIds.includes(r.memberId)).length;
  const settled = paidCount === result.rows.length && result.rows.length > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 border px-3 py-2.5 text-xs",
        settled ? "border-fairy-moss/30 bg-fairy-moss-tint" : "border-fairy-hair bg-card",
      )}
    >
      {settled ? (
        <>
          <span className="font-medium text-fairy-moss">Everyone has paid.</span>
        </>
      ) : (
        <>
          <span className="text-fairy-grey-strong">
            {paidCount} of {result.rows.length} paid
          </span>
          <span aria-hidden className="size-[3px] rounded-full bg-fairy-hair-2" />
          <span className="font-medium text-fairy-ember" data-numeric>
            {formatCentavos(outstanding)} still owed
          </span>
        </>
      )}
    </div>
  );
}

