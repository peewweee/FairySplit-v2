"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Info, Pencil, Sparkles, Trash2 } from "lucide-react";
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
import { AppliancesPanel } from "@/components/fairy/appliances-panel";
import { BillDialog } from "@/components/fairy/bill-dialog";
import { OtherChargesPanel } from "@/components/fairy/other-charges-panel";
import { ShareTable } from "@/components/fairy/share-table";
import { WarningBanner } from "@/components/fairy/warning-banner";
import { Crumbs, ErrorNote, LoadingRows, TickItem } from "@/components/fairy/shell-bits";
import { describeCoverage } from "@/components/fairy/bills-panel";
import { MemberHoursInput } from "@/components/fairy/member-days-input";
import {
  coverageDays,
  memberDaysFor,
  totalPersonDays,
  unfilledCount,
} from "@/lib/billing/occupancy";
import { applyRoundUp } from "@/lib/billing/engine";
import { splitBill, trackerProblems } from "@/lib/billing/from-bill";
import { formatCentavos } from "@/lib/billing/money";
import { repo, type Bill, type Member, type Room } from "@/lib/data";
import { useRepoAction, useRepoQuery } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

export function BillScreen({ roomId, billId }: { roomId: string; billId: string }) {
  const room = useRepoQuery(() => repo.getRoom(roomId), [roomId]);
  const bill = useRepoQuery(() => repo.getBill(billId), [billId]);
  const members = useRepoQuery(() => repo.listMembers(roomId), [roomId]);

  if (bill.loading || room.loading || members.loading) return <LoadingRows rows={3} />;

  if (!bill.data || !room.data) {
    return (
      <>
        <Crumbs items={[{ label: "Rooms", href: "/" }, { label: "Not found" }]} />
        <ErrorNote>{bill.error ?? room.error ?? "That bill isn't on this device."}</ErrorNote>
      </>
    );
  }

  return (
    <BillBody
      room={room.data}
      bill={bill.data}
      members={members.data ?? []}
    />
  );
}

function BillBody({
  room,
  bill,
  members,
}: {
  room: Room;
  bill: Bill;
  members: Member[];
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {/* The share table is the point of the screen, so it leads. */}
        <div className="order-2 grid gap-4 lg:order-1">
          <WarningBanner warnings={result?.warnings ?? []} />

          {/* An appliance pointing at a deleted log costs nothing, which looks
              exactly like an appliance nobody used. Say which it is. */}
          {trackerProblems(bill, trackers.data ?? []).map((message) => (
            <ErrorNote key={message}>{message}</ErrorNote>
          ))}

          {result ? (
            <>
              <ShareTable
                result={result}
                members={members}
                billedCentavos={billed}
                paidMemberIds={bill.paidMemberIds}
                onTogglePaid={(memberId, paid) =>
                  void action.run(() => repo.setPaid(bill.id, memberId, paid))
                }
              />
              <ReconciliationNote billed={billed} result={result} />
              <SettleSummary bill={bill} result={result} />
              <SplitBreakdown bill={bill} result={result} />
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

        <div className="order-1 grid gap-5 lg:order-2">
          <EditBillButton bill={bill} roomId={room.id} members={members} />
          <DaysPanel bill={bill} members={members} />
          <DeleteBill bill={bill} roomId={room.id} />
        </div>

        {/* Section 3: the appliance section does not exist until a rate is
            entered. Not greyed out, not empty — not rendered. */}
        {bill.rateMillicents !== null && (
          <div className="order-3 lg:col-span-2">
            <AppliancesPanel bill={bill} members={members} />
          </div>
        )}

        <div className="order-4 lg:col-span-2">
          <OtherChargesPanel bill={bill} members={members} />
        </div>
      </div>
    </>
  );
}

function ReconciliationNote({
  billed,
  result,
}: {
  billed: number;
  result: NonNullable<ReturnType<typeof splitBill>["result"]>;
}) {
  const personDays = result.rows.reduce((acc, r) => acc + r.days, 0);
  const reconciles = result.grandTotalCentavos === billed;
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] font-medium text-fairy-grey-strong">
      <Info className="size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-bold text-fairy-ink" data-numeric>
          {formatCentavos(result.residualCentavos)}
        </span>{" "}
        shared across {personDays} person-days
        {personDays > 0 && (
          <>
            {" = "}
            <span className="font-bold text-fairy-ink" data-numeric>
              {formatCentavos(Math.round(result.dailyFeeCentavos))}
            </span>{" "}
            per day stayed
          </>
        )}
      </span>
      <span className="size-[3px] rounded-full bg-fairy-hair-2" aria-hidden />
      <span className={reconciles ? "text-fairy-moss" : "font-bold text-fairy-danger"}>
        Column totals {formatCentavos(result.grandTotalCentavos)}, bill is{" "}
        {formatCentavos(billed)}.
      </span>
    </p>
  );
}

function DeleteBill({ bill, roomId }: { bill: Bill; roomId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const action = useRepoAction();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 border border-transparent px-3 py-2 text-[11.5px] font-semibold text-fairy-grey-strong transition-colors hover:border-fairy-danger/25 hover:bg-fairy-danger-tint hover:text-fairy-danger"
      >
        <Trash2 className="size-3.5" aria-hidden />
        Delete this bill
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[21px] text-fairy-ink">Delete {bill.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its dates, day counts, appliances, usage log and charges all go with
              it. Other bills in the room are untouched.
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
    </>
  );
}


/**
 * "How this was split" — the sample's pink-tick breakdown. Says where the money
 * went BEFORE occupancy is applied, so the share table's numbers are
 * explainable rather than merely correct.
 */
function SplitBreakdown({
  bill,
  result,
}: {
  bill: Bill;
  result: NonNullable<ReturnType<typeof splitBill>["result"]>;
}) {
  // Sum each appliance across every member's breakdown.
  const perAppliance = bill.appliances
    .map((appliance) => ({
      appliance,
      total: result.rows.reduce((acc, r) => acc + (r.breakdown[appliance.id] ?? 0), 0),
    }))
    .filter((entry) => entry.total > 0);

  const chargesTotal = bill.otherCharges.reduce((acc, c) => acc + c.amountCentavos, 0);
  const personDays = result.rows.reduce((acc, r) => acc + r.days, 0);
  const covered = coverageDays(bill);

  const items: { label: string; value: string }[] = [
    {
      label: `Days covered · ${personDays} person-days`,
      value: covered !== null ? `${covered} ${covered === 1 ? "day" : "days"}` : "no dates yet",
    },
    { label: "Shared portion · split by days", value: formatCentavos(result.residualCentavos) },
    ...perAppliance.map(({ appliance, total }) => ({
      label:
        appliance.mode === "always_on"
          ? `${appliance.label} · shared equally`
          : `${appliance.label} · charged to whoever used it`,
      value: formatCentavos(total),
    })),
    ...(chargesTotal > 0
      ? [{ label: "Other charges", value: formatCentavos(chargesTotal) }]
      : []),
  ];

  return (
    <section aria-labelledby="breakdown-heading" className="mt-2">
      <h2 id="breakdown-heading" className="mb-1 text-[16px] text-fairy-ink">
        How this was split
      </h2>
      <div className="grid sm:grid-cols-2 sm:gap-x-7">
        {items.map((item, i) => (
          <TickItem
            key={item.label}
            label={item.label}
            value={item.value}
            last={i >= items.length - (items.length % 2 === 0 ? 2 : 1)}
          />
        ))}
      </div>
    </section>
  );
}


/**
 * Days in the unit, per person, for THIS bill.
 *
 * Every bill owns its own counts: two bills in a room almost never cover the
 * same stretch, so there is nothing to share and nothing to keep in sync.
 */
function DaysPanel({ bill, members }: { bill: Bill; members: Member[] }) {
  const days = memberDaysFor(bill, members);
  const unfilled = unfilledCount(days);

  return (
    <section aria-labelledby="days-heading" className="fs-card p-4 sm:p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id="days-heading" className="text-[14.5px] text-fairy-ink">
          Hours in the unit
        </h2>
        <span className="text-[11.5px] font-medium text-fairy-grey" data-numeric>
          {round2(totalPersonDays(days))} person-days
        </span>
      </div>
      <p className="mb-4 text-[11.5px] leading-[1.5] font-medium text-fairy-grey">
        Everyone&rsquo;s logged hours for what this bill covers — yours included,
        and the same number as in Your logs above. Blank counts as zero, so
        nobody is charged for time they weren&rsquo;t here.
        {unfilled > 0 && (
          <span className="text-fairy-ember"> {unfilled} still blank.</span>
        )}
      </p>

      {members.length === 0 ? (
        <p className="text-[13px] font-medium text-fairy-grey">
          Add people to the room first.
        </p>
      ) : (
        <div className="grid gap-1.5">
          {members.map((member) => (
            <MemberHoursInput
              key={member.id}
              billId={bill.id}
              member={member}
              hours={bill.memberHours[member.id] ?? null}
              daysCovered={coverageDays(bill)}
            />
          ))}
        </div>
      )}
    </section>
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
          <Sparkles className="size-3.5 text-fairy-moss" aria-hidden />
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

/** One editor for a bill, everywhere: the same dialog the bills list opens. */
function EditBillButton({
  bill,
  roomId,
  members,
}: {
  bill: Bill;
  roomId: string;
  members: Member[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-4" aria-hidden />
        Edit this bill
      </Button>
      {open && (
        <BillDialog
          open
          onOpenChange={setOpen}
          roomId={roomId}
          members={members}
          bill={bill}
        />
      )}
    </>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
