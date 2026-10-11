"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { describeCoverage } from "@/components/fairy/bills-panel";
import { tableText } from "@/components/fairy/share-table";
import { formatCentavos } from "@/lib/billing/money";
import type { BillResult } from "@/lib/billing/engine";
import type { Bill, Member, Room, Tracker } from "@/lib/data";
import { cn } from "@/lib/utils";

/** Everything the share sheet is drawn from, for the image and for the PDF alike. */
export interface Sheet {
  bill: Bill;
  room: Room;
  members: Member[];
  trackers: Tracker[];
  result: BillResult;
  billedCentavos: number;
}

/**
 * The sheet that prints when someone chooses "Save as PDF".
 *
 * It exists only for the printer: hidden on screen, and the print stylesheet hides everything
 * else on the page, so what comes out is this and nothing of the app around it. It is rendered
 * into `document.body` rather than where the button sits, so no on-screen layout (a sidebar, a
 * column, a margin) can push it off the page.
 *
 * Branded the way the app is: the logo, the rose rule and tint, and the footer's tagline
 * ("Fairly split expenses, like magic.", as in the app shell; not the splash line). Page margins live
 * here, as padding, because the page itself has none; with no margin the browser has nowhere to
 * stamp its own URL and date. Everything reads left to right from the left edge; only the money
 * lines up on the right, so the digits do.
 */
export function PrintSheet({ sheet, printedOn }: { sheet: Sheet; printedOn: string }) {
  const { bill, room, billedCentavos } = sheet;
  const { head, body, foot, memberIds } = tableText(
    bill,
    sheet.members,
    sheet.trackers,
    sheet.result,
  );
  const paid = new Set(bill.paidMemberIds);

  return (
    <div
      data-print-sheet
      aria-hidden
      className="hidden bg-white px-[18mm] py-[16mm] text-fairy-ink print:block"
    >
      <div className="flex items-center justify-between gap-6 border-b-2 border-fairy-pink pb-4">
        <Image
          src="/fairysplit-logo.svg"
          alt="FairySplit"
          width={2697}
          height={543}
          loading="eager"
          className="h-[8mm] w-auto"
        />
        <p className="text-[10px] font-bold tracking-[0.14em] text-fairy-rose uppercase">
          Split summary
        </p>
      </div>

      <p className="mt-6 text-[11px] font-semibold text-fairy-grey-strong">{room.name}</p>
      <h1 className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.03em]">
        {bill.name}
      </h1>
      <p className="mt-1 text-[12px] font-medium text-fairy-grey-strong">
        {describeCoverage(bill)}
      </p>

      <div className="mt-5 flex items-baseline gap-4 bg-fairy-tint px-4 py-3 text-fairy-tint-ink">
        <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase">Total billed</span>
        <span className="text-[22px] leading-none font-extrabold tracking-[-0.03em]" data-numeric>
          {formatCentavos(billedCentavos)}
        </span>
      </div>

      <table className="mt-6 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-b-2 border-fairy-ink text-[10px] tracking-[0.06em] text-fairy-grey-strong uppercase">
            {head.map((cell, i) => (
              <th key={cell + i} className={cn("px-2 py-2 font-bold", i === 0 ? "text-left" : "text-right")}>
                {cell}
              </th>
            ))}
            <th className="py-2 pr-2 pl-6 text-left font-bold">Paid</th>
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={memberIds[r]} className="border-b border-fairy-hair [break-inside:avoid]">
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-2 py-2.5",
                    i === 0 ? "text-left font-bold" : "text-right font-semibold",
                    i === row.length - 1 && "font-extrabold",
                  )}
                  data-numeric={i > 0 ? "" : undefined}
                >
                  {cell}
                </td>
              ))}
              <td className="py-2.5 pr-2 pl-6">
                <span className="inline-grid size-[3.5mm] place-items-center border border-fairy-ink-2 align-middle">
                  {paid.has(memberIds[r]) && (
                    <Check className="size-3 text-fairy-rose" strokeWidth={3.5} />
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        {/* table-row-group, not the default footer group: a footer group repeats at the
            foot of every page, and the total belongs once, at the end. */}
        <tfoot className="table-row-group">
          <tr className="border-t-2 border-fairy-ink">
            {foot.map((cell, i) => (
              <td
                key={i}
                className={cn("px-2 py-3 font-extrabold", i === 0 ? "text-left" : "text-right")}
                data-numeric={i > 0 ? "" : undefined}
              >
                {cell}
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>

      <div className="mt-10 flex items-end justify-between gap-6 border-t border-fairy-hair pt-3 text-[10px] font-medium text-fairy-grey-strong">
        <p>
          Split by hours stayed · {printedOn}
        </p>
        <p className="font-bold text-fairy-rose">FairySplit · Fairly split expenses, like magic.</p>
      </div>
    </div>
  );
}
