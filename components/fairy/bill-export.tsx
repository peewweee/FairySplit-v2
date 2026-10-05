"use client";

import { useState } from "react";
import { Download, FileText, Image as ImageIcon, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorNote } from "@/components/fairy/shell-bits";
import { costColumns } from "@/components/fairy/share-table";
import { describeCoverage } from "@/components/fairy/bills-panel";
import { formatCentavos } from "@/lib/billing/money";
import type { BillResult } from "@/lib/billing/engine";
import type { Bill, Member, Room, Tracker } from "@/lib/data";

/**
 * Taking the share table out of the app.
 *
 * Two routes, because they are genuinely different jobs. An IMAGE is drawn here
 * on a canvas from the same numbers the table renders — not a screenshot, so it
 * is crisp at any zoom and carries no UI chrome. A PDF is left to the browser's
 * own print-to-PDF, which is the only way to get real page setup and a working
 * peso sign: the fonts a hand-rolled PDF can rely on have no glyph for it.
 *
 * Neither needs a dependency, which is why neither is a library.
 */
export function BillExportButton({
  bill,
  room,
  members,
  trackers,
  result,
  billedCentavos,
}: {
  bill: Bill;
  room: Room;
  members: Member[];
  trackers: Tracker[];
  result: BillResult;
  billedCentavos: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sheet = { bill, room, members, trackers, result, billedCentavos };
  const fileName = `${slug(room.name)}-${slug(bill.name)}.png`;

  async function saveImage() {
    setBusy(true);
    setError(null);
    try {
      const blob = await drawSheet(sheet);
      if (!blob) throw new Error("Could not draw the table.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      // Give the click a tick to start before the URL stops resolving.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setOpen(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not save the image.");
    } finally {
      setBusy(false);
    }
  }

  async function shareImage() {
    setBusy(true);
    setError(null);
    try {
      const blob = await drawSheet(sheet);
      if (!blob) throw new Error("Could not draw the table.");
      const file = new File([blob], fileName, { type: "image/png" });
      await navigator.share({ files: [file], title: `${bill.name} — ${room.name}` });
      setOpen(false);
    } catch (problem) {
      // Dismissing the OS sheet rejects too; that is not worth an error.
      if (problem instanceof DOMException && problem.name === "AbortError") return;
      setError(problem instanceof Error ? problem.message : "Could not share the image.");
    } finally {
      setBusy(false);
    }
  }

  function savePdf() {
    // The print stylesheet leaves only the marked sheet on the page, so what is
    // printed is the table and its heading, not the whole screen.
    setOpen(false);
    window.setTimeout(() => window.print(), 100);
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-fairy-grey-strong hover:text-fairy-ink"
      >
        <Share2 className="size-3.5" aria-hidden />
        Share
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[21px] text-fairy-ink">Share this split</DialogTitle>
            <DialogDescription>
              {bill.name} — {describeCoverage(bill)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <ExportChoice
              icon={<ImageIcon className="size-4" aria-hidden />}
              title="Download image"
              detail="A PNG of the table, ready to paste into a chat."
              disabled={busy}
              onSelect={() => void saveImage()}
            />
            <ExportChoice
              icon={<FileText className="size-4" aria-hidden />}
              title="Save as PDF"
              detail="Opens your browser's print dialog — choose Save as PDF."
              disabled={busy}
              onSelect={savePdf}
            />
            {canShareFiles() && (
              <ExportChoice
                icon={<Share2 className="size-4" aria-hidden />}
                title="Share image…"
                detail="Send it straight to another app."
                disabled={busy}
                onSelect={() => void shareImage()}
              />
            )}
          </div>

          <ErrorNote>{error}</ErrorNote>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExportChoice({
  icon,
  title,
  detail,
  disabled,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-start gap-3 rounded-lg border border-fairy-hair bg-card px-3 py-2.5 text-left transition-colors hover:border-fairy-pink hover:bg-fairy-tint disabled:opacity-45"
    >
      <span className="mt-0.5 shrink-0 text-fairy-rose">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold tracking-[-0.01em] text-fairy-ink">
          {title}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-[1.45] font-medium text-fairy-grey-strong">
          {detail}
        </span>
      </span>
      <Download className="mt-0.5 ml-auto size-3.5 shrink-0 text-fairy-hair-2" aria-hidden />
    </button>
  );
}

/** Whether the OS share sheet will take a file. Desktop browsers mostly will not. */
function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({
      files: [new File([new Blob(["x"])], "x.png", { type: "image/png" })],
    });
  } catch {
    return false;
  }
}

/* -- drawing the sheet ---------------------------------------------------- */

interface Sheet {
  bill: Bill;
  room: Room;
  members: Member[];
  trackers: Tracker[];
  result: BillResult;
  billedCentavos: number;
}

const INK = "#1c1518";
const GREY = "#6e6065";
const HAIR = "#f0e4e7";
const HAIR_2 = "#e6d6db";
const TINT = "#fcebf1";
const ROSE = "#b5416b";
const FONT = "'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * The table as a PNG, laid out from the same columns the screen uses.
 *
 * Drawn rather than screenshotted: a canvas has no dependency, no cross-origin
 * font problem, and gives the same result whatever the page is scrolled to.
 */
async function drawSheet(sheet: Sheet): Promise<Blob | null> {
  const { bill, room, members, trackers, result, billedCentavos } = sheet;
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const columns = costColumns(bill, trackers, result);

  const head = ["Person", ...columns.map((c) => c.label), "Owes"];
  const body = result.rows.map((row) => [
    nameOf.get(row.memberId) ?? "Someone",
    ...columns.map((c) => formatCentavos(c.valueOf(row))),
    formatCentavos(row.totalCentavos),
  ]);
  const foot = [
    "Total",
    ...columns.map((c) => formatCentavos(result.rows.reduce((a, r) => a + c.valueOf(r), 0))),
    formatCentavos(result.rows.reduce((a, r) => a + r.totalCentavos, 0)),
  ];

  const pad = 28;
  const cellPad = 14;
  const rowH = 34;
  const headH = 30;

  // Measure first, then size the canvas to the content — a fixed width would
  // either clip a wide table or pad a narrow one.
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  const widths = head.map((_, i) => {
    probe.font = `700 13px ${FONT}`;
    let max = probe.measureText(head[i]).width;
    for (const row of [...body, foot]) {
      probe.font = `600 13px ${FONT}`;
      max = Math.max(max, probe.measureText(row[i]).width);
    }
    return Math.ceil(max) + cellPad * 2;
  });

  const tableW = widths.reduce((a, w) => a + w, 0);
  const titleH = 78;
  const footerH = 34;
  const width = Math.max(tableW, 420) + pad * 2;
  const height = pad + titleH + headH + rowH * body.length + rowH + footerH + pad;

  // Draw at 2x so it stays sharp when someone pinches into it.
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Title block
  ctx.fillStyle = INK;
  ctx.font = `800 22px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(bill.name, pad, pad + 24);

  ctx.fillStyle = GREY;
  ctx.font = `500 13px ${FONT}`;
  ctx.fillText(`${room.name} · ${describeCoverage(bill)}`, pad, pad + 44);

  ctx.fillStyle = ROSE;
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText(formatCentavos(billedCentavos), pad, pad + 66);

  let y = pad + titleH;

  const drawRow = (
    cells: string[],
    rowTop: number,
    height_: number,
    opts: { bold?: boolean; colour?: string; size?: number },
  ) => {
    let x = pad;
    cells.forEach((cell, i) => {
      ctx.fillStyle = opts.colour ?? INK;
      ctx.font = `${opts.bold ? 700 : 600} ${opts.size ?? 13}px ${FONT}`;
      // First column reads left; every money column reads right, so the digits
      // line up the way they do on screen.
      const tx = i === 0 ? x + cellPad : x + widths[i] - cellPad - ctx.measureText(cell).width;
      ctx.fillText(cell, tx, rowTop + height_ / 2 + 4.5);
      x += widths[i];
    });
  };

  // Header
  ctx.fillStyle = TINT;
  ctx.fillRect(pad, y, tableW, headH);
  drawRow(head, y, headH, { bold: true, colour: ROSE, size: 10.5 });
  y += headH;

  // Body
  body.forEach((row, i) => {
    if (i % 2 === 1) {
      ctx.fillStyle = "#fdf7f7";
      ctx.fillRect(pad, y, tableW, rowH);
    }
    drawRow(row, y, rowH, {});
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y + rowH - 0.5);
    ctx.lineTo(pad + tableW, y + rowH - 0.5);
    ctx.stroke();
    y += rowH;
  });

  // Total, ruled off like the table on screen
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(pad + tableW, y);
  ctx.stroke();
  drawRow(foot, y, rowH, { bold: true });
  y += rowH;

  ctx.strokeStyle = HAIR_2;
  ctx.lineWidth = 1;
  ctx.strokeRect(pad + 0.5, pad + titleH + 0.5, tableW - 1, y - pad - titleH - 1);

  ctx.fillStyle = GREY;
  ctx.font = `500 11px ${FONT}`;
  ctx.fillText(
    `Split by hours stayed · FairySplit · ${new Date().toLocaleDateString()}`,
    pad,
    y + 22,
  );

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** "unit-12b" — a file name nobody has to rename before sending. */
function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "bill"
  );
}
