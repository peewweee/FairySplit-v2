"use client";

import { useState } from "react";
import { Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApplianceForm, type ApplianceDraft } from "@/components/fairy/appliance-form";
import {
  ParticipantPicker,
  describeParticipants,
} from "@/components/fairy/participant-picker";
import { EmptyState, ErrorNote } from "@/components/fairy/shell-bits";
import { SparkleBurst, useSparkle } from "@/components/fairy/sparkle-burst";
import { formatCentavos, kwhToCentavos, largestRemainder } from "@/lib/billing/money";
import {
  APPLIANCE_MODE_META,
  repo,
  type Bill,
  type BillAppliance,
  type Member,
  type Tracker,
} from "@/lib/data";
import { coverageDays } from "@/lib/billing/occupancy";
import { usesFromTrackers } from "@/lib/billing/from-bill";
import { useRepoAction, useRepoQuery } from "@/lib/data/hooks";
import { usageQuantitySchema } from "@/lib/forms/numeric";
import { parseField } from "@/lib/forms/schemas";

/**
 * The appliance section (section 3).
 *
 * This component is only ever MOUNTED when the bill has a rate — the parent
 * does not render it otherwise. Not greyed out, not empty: not there. An
 * appliance with no rate to price it against would sit in the UI contributing
 * ₱0 while looking like it was doing something.
 */
export function AppliancesPanel({ bill, members }: { bill: Bill; members: Member[] }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BillAppliance | null>(null);
  const action = useRepoAction();
  const trackers = useRepoQuery(() => repo.listTrackers(bill.roomId), [bill.roomId]);

  const rate = bill.rateMillicents ?? 0;
  const daysCovered = coverageDays(bill);

  async function add(draft: ApplianceDraft) {
    const created = await action.run(() => repo.addBillAppliance(bill.id, draft));
    if (created) setAdding(false);
  }

  async function update(draft: ApplianceDraft) {
    if (!editing) return;
    const saved = await action.run(() =>
      repo.updateBillAppliance(bill.id, editing.id, draft),
    );
    if (saved) setEditing(null);
  }

  return (
    <section
      aria-labelledby="appliances-heading"
      className="fs-card animate-reveal p-4 sm:p-5"
    >
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2
          id="appliances-heading"
          className="text-[14.5px] text-fairy-ink"
        >
          Appliances
        </h2>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" aria-hidden />
          Add appliance
        </Button>
      </div>
      <p className="mb-4 max-w-prose text-[11.5px] leading-[1.5] font-medium text-fairy-grey">
        Carved out of the bill before the rest is split by days. Always-on things
        are shared equally; everything else is charged to whoever logged it.
      </p>

      <ErrorNote>{action.error}</ErrorNote>

      {bill.appliances.length === 0 ? (
        <EmptyState
          icon={<Plug className="size-5" aria-hidden />}
          title="Nothing carved out yet"
          description="Add the fridge to share it equally, or the aircon to charge it to whoever ran it."
          className="py-10"
        />
      ) : (
        <ul className="grid gap-3">
          {bill.appliances.map((item) => (
            <li key={item.id}>
              <ApplianceCard
                bill={bill}
                appliance={item}
                members={members}
                rate={rate}
                daysCovered={daysCovered}
                trackers={trackers.data ?? []}
                onEdit={() => setEditing(item)}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[21px] text-fairy-ink">Add an appliance</DialogTitle>
            <DialogDescription>
              This bill keeps its own copy — editing the room default later
              won&rsquo;t change what someone already paid.
            </DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so reopening never resurrects the last
              appliance someone typed. Stale values are the bug this app exists
              to eliminate. */}
          {adding && (
            <ApplianceForm
              submitLabel="Add appliance"
              allowAlwaysOn={daysCovered !== null}
              trackers={trackers.data ?? []}
              onSubmit={add}
              onCancel={() => setAdding(false)}
              pending={action.pending}
              error={action.error}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[21px] text-fairy-ink">Edit {editing?.label}</DialogTitle>
            <DialogDescription>
              Changes apply to this bill only.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ApplianceForm
              key={editing.id}
              initial={{
                label: editing.label,
                mode: editing.mode,
                kwhPerUnit: editing.kwhPerUnit,
                trackerId: editing.trackerId,
              }}
              submitLabel="Save changes"
              allowAlwaysOn={daysCovered !== null}
              trackers={trackers.data ?? []}
              onSubmit={update}
              onCancel={() => setEditing(null)}
              pending={action.pending}
              error={action.error}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ApplianceCard({
  bill,
  appliance,
  members,
  rate,
  daysCovered,
  trackers,
  onEdit,
}: {
  bill: Bill;
  appliance: BillAppliance;
  members: Member[];
  rate: number;
  daysCovered: number | null;
  trackers: Tracker[];
  onEdit: () => void;
}) {
  const action = useRepoAction();
  const meta = APPLIANCE_MODE_META[appliance.mode];

  // An appliance charged from a log reads its quantities out of that log, so
  // showing this bill's hand-typed entries would contradict the share table.
  // Same function the engine is fed, so the two cannot drift.
  const linked = trackers.find((t) => t.id === appliance.trackerId) ?? null;
  const uses = appliance.trackerId
    ? usesFromTrackers(bill, members, trackers).filter((u) => u.applianceId === appliance.id)
    : bill.uses.filter((u) => u.applianceId === appliance.id);

  // Running total of logged usage, so double-entry is obvious (10.2).
  const loggedQuantity = uses.reduce((acc, u) => acc + u.quantity, 0);
  const loggedCost =
    appliance.kwhPerUnit === null
      ? 0
      : uses.reduce(
          (acc, u) => acc + kwhToCentavos(u.quantity * appliance.kwhPerUnit!, rate),
          0,
        );

  const alwaysOnCost =
    appliance.mode === "always_on" && appliance.kwhPerUnit !== null && daysCovered !== null
      ? kwhToCentavos(appliance.kwhPerUnit * daysCovered, rate)
      : null;

  return (
    <div className="rounded-xl border border-fairy-hair bg-fairy-screen p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-medium text-fairy-ink">
              {appliance.label}
            </span>
            <span className="text-[11.5px] font-medium text-fairy-grey">
              {meta.label}
              {appliance.kwhPerUnit !== null && (
                <span data-numeric>
                  {" · "}
                  {appliance.kwhPerUnit} kWh / {meta.unit}
                </span>
              )}
            </span>
          </div>

          <div className="mt-0.5 text-xs">
            {appliance.mode === "always_on" ? (
              alwaysOnCost === null ? (
                <span className="text-fairy-ember">
                  Needs a day count on this bill before it can be costed.
                </span>
              ) : (
                <span className="text-fairy-grey">
                  {appliance.kwhPerUnit} × {daysCovered} days ={" "}
                  <span className="text-fairy-ink" data-numeric>
                    {formatCentavos(alwaysOnCost)}
                  </span>{" "}
                  shared equally
                </span>
              )
            ) : (
              <span className="text-fairy-grey">
                <span data-numeric>{round3(loggedQuantity)}</span> {meta.unitPlural} logged
                {" · "}
                <span className="text-fairy-ink" data-numeric>
                  {formatCentavos(loggedCost)}
                </span>
              </span>
            )}
          </div>
        </div>

        <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${appliance.label}`}>
          <Pencil className="size-3.5 text-fairy-grey" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => void action.run(() => repo.removeBillAppliance(bill.id, appliance.id))}
          aria-label={`Remove ${appliance.label}`}
        >
          <Trash2 className="size-3.5 text-fairy-grey" />
        </Button>
      </div>

      {appliance.trackerId !== null && (
        <p className="mt-2 text-[11.5px] font-medium text-fairy-grey-strong">
          {linked
            ? `Counted from your ‘${linked.name}’ log, for the dates this bill covers.`
            : "The log this was charged from no longer exists."}
        </p>
      )}

      {appliance.mode !== "always_on" && appliance.trackerId === null && (
        <>
          {uses.length > 0 && (
            <ul className="mt-3 grid gap-1">
              {uses.map((u) => {
                const cost =
                  appliance.kwhPerUnit === null
                    ? 0
                    : kwhToCentavos(u.quantity * appliance.kwhPerUnit, rate);
                const each = largestRemainder(
                  cost,
                  u.participantIds.map(() => 1),
                  u.participantIds,
                )[0];
                return (
                  <li
                    key={u.id}
                    className="flex items-center gap-2.5 border border-fairy-hair bg-card px-3 py-2 text-[12px] font-medium"
                  >
                    <span className="shrink-0 tabular-nums text-fairy-ink">
                      {round3(u.quantity)} {u.quantity === 1 ? meta.unit : meta.unitPlural}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-fairy-grey-strong">
                      {describeParticipants(members, u.participantIds)}
                      {u.participantIds.length > 1 && (
                        <span> · {formatCentavos(each)} each</span>
                      )}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-fairy-ink-2">
                      {formatCentavos(cost)}
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => void action.run(() => repo.removeUse(bill.id, u.id))}
                      aria-label={`Remove this ${meta.unit} entry`}
                    >
                      <Trash2 className="size-3 text-fairy-grey" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <LogUsageForm
            billId={bill.id}
            appliance={appliance}
            members={members}
            rate={rate}
          />
        </>
      )}
    </div>
  );
}

/** Quantity + a checkbox per member. Three clicks, start to finish (10.1). */
function LogUsageForm({
  billId,
  appliance,
  members,
  rate,
}: {
  billId: string;
  appliance: BillAppliance;
  members: Member[];
  rate: number;
}) {
  const [quantity, setQuantity] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();
  const { burst, sparkle } = useSparkle();

  const meta = APPLIANCE_MODE_META[appliance.mode];
  const parsedQuantity = parseField(usageQuantitySchema, quantity);
  const previewCost =
    parsedQuantity.ok && appliance.kwhPerUnit !== null
      ? kwhToCentavos(parsedQuantity.value * appliance.kwhPerUnit, rate)
      : null;
  const previewEach =
    previewCost !== null && participants.length > 0
      ? largestRemainder(previewCost, participants.map(() => 1), participants)[0]
      : null;

  async function log() {
    if (!parsedQuantity.ok) {
      setError(parsedQuantity.message);
      return;
    }
    if (participants.length === 0) {
      setError("Pick at least one person.");
      return;
    }
    const added = await action.run(() =>
      repo.addUse(billId, {
        applianceId: appliance.id,
        quantity: parsedQuantity.value,
        participantIds: participants,
        occurredOn: null,
        note: null,
      }),
    );
    if (!added) return;
    sparkle();
    setQuantity("");
    setError(null);
    // Keep the participant selection: logging "Ana and Ben again" is the
    // common case, and re-ticking two boxes every time is a tax.
  }

  const inputId = `qty-${appliance.id}`;

  return (
    <div className="relative mt-3 grid gap-3 rounded-xl border border-fairy-hair-2 bg-fairy-tint p-3">
      <SparkleBurst burst={burst} />

      <div className="grid gap-1.5">
        <Label htmlFor={inputId} className="text-sm">
          Log {meta.unitPlural}
        </Label>
        <div className="flex items-center gap-2">
          <div className="relative w-36">
            <Input
              id={inputId}
              value={quantity}
              inputMode="decimal"
              data-numeric
              placeholder={appliance.mode === "per_hour" ? "e.g. 1.5" : "e.g. 2"}
              className="h-9 pr-14 tabular-nums"
              onChange={(e) => {
                setQuantity(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void log();
              }}
              aria-invalid={Boolean(error) && !parsedQuantity.ok}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-[11.5px] font-medium text-fairy-grey-strong"
            >
              {meta.unitPlural}
            </span>
          </div>
          <Button size="lg" variant="secondary" onClick={() => void log()} disabled={action.pending}>
            <Plus className="size-4" aria-hidden />
            Log it
          </Button>
        </div>
      </div>

      <ParticipantPicker
        members={members}
        selected={participants}
        onChange={(update) => {
          setParticipants(update);
          setError(null);
        }}
        idPrefix={`use-${appliance.id}`}
      />

      {/* Live "who's included" summary. */}
      <p className="text-[11.5px] font-medium text-fairy-grey-strong" aria-live="polite">
        {participants.length === 0 ? (
          "Tick whoever used it — one person, or several who used it together."
        ) : (
          <>
            <span className="text-fairy-ink">
              {describeParticipants(members, participants)}
            </span>
            {previewCost !== null && (
              <>
                {" · "}
                {formatCentavos(previewCost)}
                {participants.length > 1 && previewEach !== null && (
                  <> split {participants.length} ways = {formatCentavos(previewEach)} each</>
                )}
              </>
            )}
          </>
        )}
      </p>

      {(error ?? action.error) && (
        <p className="text-[11.5px] font-semibold text-fairy-danger">{error ?? action.error}</p>
      )}
    </div>
  );
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
