"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatCentavos } from "@/lib/billing/money";
import type { BillResult, ShareRow } from "@/lib/billing/engine";
import type { Bill, Member, Tracker } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * The share table. Everyone sees everyone's numbers — that is the whole point
 * of the app, so this is the calmest element on the screen: a plain hairline
 * surface, no decoration at all, tabular figures, and a total row that visibly
 * equals the bill.
 *
 * Columns that are entirely zero are hidden, so a water bill shows two money
 * columns instead of six.
 */
export interface Column {
  key: string;
  label: string;
  valueOf: (row: ShareRow) => number;
}

/**
 * The money columns: one per log this bill draws on, then whatever is not a
 * log at all.
 *
 * Every column is pesos — the day counts moved to the logs summary above. The
 * set is built so the columns always add up to what somebody owes; that is why
 * the last two exist, and why nothing is dropped just for being awkward.
 */
export function costColumns(bill: Bill, trackers: Tracker[], result: BillResult): Column[] {
  const columns: Column[] = [];

  // The occupancy clock IS the shared portion: it is what the leftover is
  // weighted by, so it leads rather than sitting under a separate heading.
  const clock = trackers.find((t) => t.builtIn);
  columns.push({
    key: "shared",
    label: clock?.name ?? "Shared",
    valueOf: (row) => row.sharedCentavos,
  });

  for (const tracker of trackers) {
    if (tracker.builtIn) continue;
    const ids = bill.appliances.filter((a) => a.trackerId === tracker.id).map((a) => a.id);
    if (ids.length === 0) continue;
    columns.push({
      key: tracker.id,
      label: tracker.name,
      valueOf: (row) => ids.reduce((acc, id) => acc + (row.breakdown[id] ?? 0), 0),
    });
  }

  // Appliances answering "Equally" are not logged by anyone, so they have no
  // column of their own above.
  if (result.rows.some((r) => r.fixedCentavos !== 0)) {
    columns.push({ key: "fixed", label: "Shared equally", valueOf: (row) => row.fixedCentavos });
  }

  // Usage on an appliance no log feeds — a record from before logs existed.
  // Without this the columns would quietly fail to reach the Owes figure.
  const logged = (row: ShareRow) =>
    columns.filter((c) => c.key !== "shared" && c.key !== "fixed").reduce((a, c) => a + c.valueOf(row), 0);
  if (result.rows.some((r) => r.meteredCentavos - logged(r) !== 0)) {
    columns.push({
      key: "unlogged",
      label: "Unlinked usage",
      valueOf: (row) => row.meteredCentavos - logged(row),
    });
  }

  if (result.rows.some((r) => r.otherCentavos !== 0)) {
    columns.push({ key: "other", label: "Other", valueOf: (row) => row.otherCentavos });
  }

  return columns;
}

export function ShareTable({
  bill,
  trackers,
  result,
  members,
  billedCentavos,
  paidMemberIds,
  onTogglePaid,
}: {
  bill: Bill;
  trackers: Tracker[];
  result: BillResult;
  members: Member[];
  billedCentavos: number;
  paidMemberIds?: string[];
  onTogglePaid?: (memberId: string, paid: boolean) => void;
}) {
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const columns = costColumns(bill, trackers, result);
  const showPaid = Boolean(onTogglePaid);

  const totalOf = (column: Column) => result.rows.reduce((acc, r) => acc + column.valueOf(r), 0);

  const grand = result.rows.reduce((acc, r) => acc + r.totalCentavos, 0);
  const reconciles = grand === billedCentavos;

  return (
    <div className="fs-table-surface overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-fairy-hair-2">
            <Th>Person</Th>
            {columns.map((column) => (
              <Th key={column.key} right>
                {column.label}
              </Th>
            ))}
            <Th right emphasis>
              Owes
            </Th>
            {showPaid && <Th right>Paid</Th>}
          </tr>
        </thead>

        <tbody>
          {result.rows.map((r) => {
            const paid = paidMemberIds?.includes(r.memberId) ?? false;
            return (
              <tr key={r.memberId} className="border-b border-fairy-hair">
                <Td className="text-[13.5px] font-bold tracking-[-0.02em] text-fairy-ink">
                  {nameOf.get(r.memberId) ?? "Someone"}
                </Td>
                {columns.map((column) => (
                  <Money key={column.key} value={column.valueOf(r)} />
                ))}
                <Td
                  right
                  className={cn(
                    "text-[14.5px] font-extrabold tracking-[-0.035em]",
                    paid ? "text-fairy-moss" : "text-fairy-ink",
                  )}
                >
                  {formatCentavos(r.totalCentavos)}
                </Td>
                {showPaid && (
                  <Td right>
                    {/* The box is display:flex, so the cell's text-align cannot
                        move it — it needs a flex parent to sit under the
                        right-aligned "Paid" heading. */}
                    <span className="flex justify-end">
                      <Checkbox
                        checked={paid}
                        onCheckedChange={(next) => onTogglePaid?.(r.memberId, next === true)}
                        aria-label={`Mark ${nameOf.get(r.memberId) ?? "this person"} as paid`}
                        className="data-[state=checked]:border-fairy-moss data-[state=checked]:bg-fairy-moss data-[state=checked]:text-white"
                      />
                    </span>
                  </Td>
                )}
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr className="border-t-[1.8px] border-fairy-ink bg-fairy-screen">
            <Td className="text-[13.5px] font-extrabold tracking-[-0.02em] text-fairy-ink">
              Total
            </Td>
            {columns.map((column) => (
              <Money key={column.key} value={totalOf(column)} strong />
            ))}
            <Td
              right
              className={cn(
                "text-[14.5px] font-extrabold tracking-[-0.035em]",
                reconciles ? "text-fairy-ink" : "text-fairy-danger",
              )}
            >
              {formatCentavos(grand)}
            </Td>
            {showPaid && <Td right />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Th({
  children,
  right,
  emphasis,
}: {
  children?: React.ReactNode;
  right?: boolean;
  emphasis?: boolean;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3.5 py-3 text-[11px] font-bold tracking-[0.08em] uppercase",
        right && "text-right",
        emphasis ? "text-fairy-ink" : "text-fairy-grey",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  className,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3.5 py-3 text-[13px] font-semibold tabular-nums",
        right && "text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

function Money({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <Td
      right
      className={cn(
        strong
          ? "font-bold text-fairy-ink-2"
          : value === 0
            ? "font-medium text-fairy-grey"
            : "text-fairy-ink-2",
      )}
    >
      {formatCentavos(value)}
    </Td>
  );
}
