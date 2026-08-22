"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { formatCentavos } from "@/lib/billing/money";
import type { BillResult } from "@/lib/billing/engine";
import type { Member } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * The share table. Everyone sees everyone's numbers — that is the whole point
 * of the app, so this is the calmest element on the screen: a plain hairline
 * surface, no decoration at all, tabular figures, and a total row that visibly
 * equals the bill.
 *
 * Columns that are entirely zero are hidden, so a water bill shows three
 * columns instead of six.
 */
export function ShareTable({
  result,
  members,
  billedCentavos,
  paidMemberIds,
  onTogglePaid,
}: {
  result: BillResult;
  members: Member[];
  billedCentavos: number;
  paidMemberIds?: string[];
  onTogglePaid?: (memberId: string, paid: boolean) => void;
}) {
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

  const showFixed = result.rows.some((r) => r.fixedCentavos !== 0);
  const showMetered = result.rows.some((r) => r.meteredCentavos !== 0);
  const showOther = result.rows.some((r) => r.otherCentavos !== 0);
  const showPaid = Boolean(onTogglePaid);

  const column = (
    key: "sharedCentavos" | "fixedCentavos" | "meteredCentavos" | "otherCentavos",
  ) => result.rows.reduce((acc, r) => acc + r[key], 0);

  const grand = result.rows.reduce((acc, r) => acc + r.totalCentavos, 0);
  const reconciles = grand === billedCentavos;

  return (
    <div className="fs-table-surface overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-fairy-hair-2">
            <Th>Person</Th>
            <Th right>Days</Th>
            <Th right>Shared</Th>
            {showFixed && <Th right>Always-on</Th>}
            {showMetered && <Th right>Usage</Th>}
            {showOther && <Th right>Other</Th>}
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
                <Td right className="text-fairy-grey">
                  {r.days}
                </Td>
                <Money value={r.sharedCentavos} />
                {showFixed && <Money value={r.fixedCentavos} />}
                {showMetered && <Money value={r.meteredCentavos} />}
                {showOther && <Money value={r.otherCentavos} />}
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
                    <Checkbox
                      checked={paid}
                      onCheckedChange={(next) => onTogglePaid?.(r.memberId, next === true)}
                      aria-label={`Mark ${nameOf.get(r.memberId) ?? "this person"} as paid`}
                      className="data-[state=checked]:border-fairy-moss data-[state=checked]:bg-fairy-moss data-[state=checked]:text-white"
                    />
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
            <Td right className="text-fairy-grey">
              {result.rows.reduce((acc, r) => acc + r.days, 0)}
            </Td>
            <Money value={column("sharedCentavos")} strong />
            {showFixed && <Money value={column("fixedCentavos")} strong />}
            {showMetered && <Money value={column("meteredCentavos")} strong />}
            {showOther && <Money value={column("otherCentavos")} strong />}
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
