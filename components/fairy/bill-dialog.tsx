"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ChevronDown, Pencil, Plug, Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApplianceForm, type ApplianceDraft } from "@/components/fairy/appliance-form";
import { Field } from "@/components/fairy/field";
import { ParticipantPicker, describeParticipants } from "@/components/fairy/participant-picker";
import { RateHelper } from "@/components/fairy/rate-helper";
import { ErrorNote } from "@/components/fairy/shell-bits";
import { applyRoundUp } from "@/lib/billing/engine";
import { daysBetween } from "@/lib/billing/occupancy";
import { centavosToPesos, formatCentavos, millicentsToPesoString } from "@/lib/billing/money";
import {
  APPLIANCE_MODE_META,
  BILL_KINDS,
  BILL_KIND_META,
  repo,
  type ApplianceMode,
  type Bill,
  type BillKind,
  type Member,
  type Tracker,
} from "@/lib/data";
import { useRepoAction, useRepoQuery } from "@/lib/data/hooks";
import { billTotalSchema, chargeAmountSchema, optionalRateSchema } from "@/lib/forms/numeric";
import { isoDateSchema, labelSchema, optionalIsoDateSchema, parseField } from "@/lib/forms/schemas";
import { cn } from "@/lib/utils";

/* -- draft rows ----------------------------------------------------------- *
 * Both editors work on DRAFTS, so nothing is written until Save. An existing
 * row keeps its real `id`, which is what lets the save step tell an edit from
 * an add — and lets an appliance keep its identity, so the usage already logged
 * against it survives.
 * ------------------------------------------------------------------------- */

interface DraftAppliance {
  key: string;
  id?: string;
  label: string;
  mode: ApplianceMode;
  kwhPerUnit: number | null;
  trackerId: string | null;
}

interface DraftCharge {
  key: string;
  id?: string;
  label: string;
  amountCentavos: number;
  participantIds: string[] | null;
}

const newKey = () => crypto.randomUUID();

export function BillDialog({
  open,
  onOpenChange,
  roomId,
  members,
  bill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  members: Member[];
  /** Absent = creating a new bill; present = editing that one. */
  bill?: Bill;
}) {
  const router = useRouter();
  const editing = bill !== undefined;
  const action = useRepoAction();

  const [name, setName] = useState(bill?.name ?? "");
  const [kind, setKind] = useState<BillKind>(bill?.kind ?? "electricity");
  const [total, setTotal] = useState(
    bill ? String(centavosToPesos(bill.totalCentavos)) : "",
  );
  const [rate, setRate] = useState(
    bill?.rateMillicents != null ? millicentsToPesoString(bill.rateMillicents) : "",
  );
  const [startsOn, setStartsOn] = useState(bill?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(bill?.endsOn ?? "");
  const [dueOn, setDueOn] = useState(bill?.dueOn ?? "");
  const [roundUp, setRoundUp] = useState(bill?.roundUpToPeso ?? true);
  const [appliances, setAppliances] = useState<DraftAppliance[]>(
    bill?.appliances.map((a) => ({ ...a, key: a.id, id: a.id })) ?? [],
  );
  const [charges, setCharges] = useState<DraftCharge[]>(
    bill?.otherCharges.map((c) => ({ ...c, key: c.id, id: c.id })) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  // The room's logs are what "how is it charged?" offers beyond "Equally".
  const trackers = useRepoQuery(() => repo.listTrackers(roomId), [roomId]);

  // COUNTED from the two dates, never typed.
  const covered = daysBetween(startsOn || null, endsOn || null);
  const meta = BILL_KIND_META[kind];
  const parsedRate = parseField(optionalRateSchema, rate);
  // Section 3 still holds, now behind the kind: only an itemizable kind offers a
  // rate at all, and only a rate brings out the appliance section.
  const itemized = meta.itemizable && parsedRate.ok && parsedRate.value !== null;

  const parsedTotalPreview = parseField(billTotalSchema, total);
  const roundedPreview =
    roundUp && parsedTotalPreview.ok ? applyRoundUp(parsedTotalPreview.value, true) : null;

  async function save() {
    const parsedName = parseField(labelSchema, name);
    const parsedTotal = parseField(billTotalSchema, total);
    const dateSchema = meta.datesRequired ? isoDateSchema : optionalIsoDateSchema;
    const parsedStart = parseField(dateSchema, startsOn);
    const parsedEnd = parseField(dateSchema, endsOn);
    const parsedDue = parseField(optionalIsoDateSchema, dueOn);

    const next: Record<string, string | undefined> = {};
    if (!parsedName.ok) next.name = parsedName.message;
    if (!parsedTotal.ok) next.total = parsedTotal.message;
    if (!parsedRate.ok) next.rate = parsedRate.message;
    if (!parsedStart.ok) next.startsOn = parsedStart.message;
    if (!parsedEnd.ok) next.endsOn = parsedEnd.message;
    if (!parsedDue.ok) next.dueOn = parsedDue.message;
    // Only a complete range can run backwards; a half-filled optional one just
    // means "no window", which "Others" is allowed to have.
    if (
      parsedStart.ok &&
      parsedEnd.ok &&
      parsedStart.value &&
      parsedEnd.value &&
      daysBetween(parsedStart.value, parsedEnd.value) === null
    ) {
      next.endsOn = "The end date is before the start date.";
    }
    setErrors(next);
    if (
      !parsedName.ok ||
      !parsedTotal.ok ||
      !parsedRate.ok ||
      !parsedStart.ok ||
      !parsedEnd.ok ||
      !parsedDue.ok ||
      Object.values(next).some(Boolean)
    ) {
      return;
    }

    // A kind that cannot be itemized carries no rate, and therefore no
    // appliances — the store enforces the second half of that too.
    const savedRate = meta.itemizable ? parsedRate.value : null;
    const keptAppliances = savedRate === null ? [] : appliances;

    const saved = await action.run(async () => {
      const target = editing
        ? await repo.updateBill(bill.id, {
            name: parsedName.value,
            kind,
            totalCentavos: parsedTotal.value,
            roundUpToPeso: roundUp,
            rateMillicents: savedRate,
            startsOn: parsedStart.value || null,
            endsOn: parsedEnd.value || null,
            dueOn: parsedDue.value,
          })
        : await repo.createBill(roomId, {
            name: parsedName.value,
            kind,
            totalCentavos: parsedTotal.value,
            roundUpToPeso: roundUp,
            rateMillicents: savedRate,
            startsOn: parsedStart.value || null,
            endsOn: parsedEnd.value || null,
            dueOn: parsedDue.value,
          });

      // Appliances: update in place, add the new, remove only what was deleted.
      // Removing and re-adding would take the logged usage with it.
      const keptIds = new Set(keptAppliances.map((a) => a.id).filter(Boolean));
      for (const existing of target.appliances) {
        if (!keptIds.has(existing.id)) await repo.removeBillAppliance(target.id, existing.id);
      }
      for (const draft of keptAppliances) {
        const payload = {
          label: draft.label,
          mode: draft.mode,
          kwhPerUnit: draft.kwhPerUnit,
          trackerId: draft.trackerId,
        };
        if (draft.id) await repo.updateBillAppliance(target.id, draft.id, payload);
        else await repo.addBillAppliance(target.id, payload);
      }

      const keptChargeIds = new Set(charges.map((c) => c.id).filter(Boolean));
      for (const existing of target.otherCharges) {
        if (!keptChargeIds.has(existing.id)) await repo.removeOtherCharge(target.id, existing.id);
      }
      for (const draft of charges) {
        const payload = {
          label: draft.label,
          amountCentavos: draft.amountCentavos,
          participantIds: draft.participantIds,
        };
        if (draft.id) await repo.updateOtherCharge(target.id, draft.id, payload);
        else await repo.addOtherCharge(target.id, payload);
      }

      return target;
    });

    if (!saved) return;
    onOpenChange(false);
    if (!editing) router.push(`/rooms/${roomId}/bills/${saved.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          {/* Radix needs a title for the dialog's accessible name; the visible
              heading is the editable field below it. */}
          <DialogTitle className="sr-only">
            {editing ? `Edit ${bill.name}` : "New bill"}
          </DialogTitle>
          {/* The heading IS the field. A pencil beside it says so — it is a
              <label>, so clicking it focuses the input with no JS and adds
              nothing to the tab order or the accessibility tree. */}
          <div className="flex items-center gap-2 pr-7">
            <input
              id="bill-name"
              value={name}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setErrors((err) => ({ ...err, name: undefined }));
              }}
              placeholder="New Bill"
              aria-label="Bill name"
              aria-required
              aria-invalid={Boolean(errors.name)}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[21px] font-extrabold tracking-[-0.035em] text-fairy-ink outline-none placeholder:font-extrabold placeholder:text-fairy-hair-2"
            />
            <label
              htmlFor="bill-name"
              aria-hidden
              className="shrink-0 cursor-text text-fairy-grey transition-colors hover:text-fairy-rose"
            >
              <Pencil className="size-3.5" />
            </label>
          </div>
          {errors.name && (
            <p className="text-[11.5px] font-semibold text-fairy-danger">{errors.name}</p>
          )}
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label
                htmlFor="bill-kind"
                className="text-[12.5px] font-bold tracking-[-0.01em] text-fairy-ink"
              >
                What is it?
                <span aria-hidden className="ml-0.5 font-bold text-fairy-danger">
                  *
                </span>
              </Label>
            </div>
            <Select value={kind} onValueChange={(v) => setKind(v as BillKind)}>
              <SelectTrigger id="bill-kind" aria-required className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILL_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {BILL_KIND_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11.5px] leading-[1.5] font-medium text-fairy-grey">
              {BILL_KIND_META[kind].hint}
            </p>
          </div>

          <Field
            id="bill-total"
            label="Total on the bill"
            value={total}
            onChange={(v) => {
              setTotal(v);
              setErrors((e) => ({ ...e, total: undefined }));
            }}
            placeholder="e.g. 1783.74"
            prefix="₱"
            inputMode="decimal"
            requirement="required"
            error={errors.total}
          />

          <div className="flex items-start justify-between gap-3 border border-fairy-hair bg-fairy-screen px-3.5 py-2.5">
            <div className="min-w-0">
              <Label htmlFor="bill-roundup" className="text-[12.5px] font-bold text-fairy-ink">
                Round up to the peso
              </Label>

            </div>
            <Switch id="bill-roundup" checked={roundUp} onCheckedChange={setRoundUp} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="bill-starts"
              label="From"
              type="date"
              value={startsOn}
              onChange={(v) => {
                setStartsOn(v);
                setErrors((e) => ({ ...e, startsOn: undefined }));
              }}
              requirement={meta.datesRequired ? "required" : "optional"}
              error={errors.startsOn}
            />
            <Field
              id="bill-ends"
              label="To"
              type="date"
              // The native picker greys out anything before the start date. The
              // backwards-range check on save stays as the real guard, since a
              // typed date can still slip past `min`.
              min={startsOn || undefined}
              value={endsOn}
              onChange={(v) => {
                setEndsOn(v);
                setErrors((e) => ({ ...e, endsOn: undefined }));
              }}
              requirement={meta.datesRequired ? "required" : "optional"}
              error={errors.endsOn}
            />
          </div>

          {covered !== null && (
            <p className="text-[11.5px] font-medium text-fairy-grey">
              Covers{" "}
              <span className="font-bold text-fairy-ink" data-numeric>
                {covered} {covered === 1 ? "day" : "days"}
              </span>
            </p>
          )}

          <Field
            id="bill-due"
            label="Due date"
            type="date"
            value={dueOn}
            onChange={(v) => {
              setDueOn(v);
              setErrors((e) => ({ ...e, dueOn: undefined }));
            }}
            requirement="optional"
            error={errors.dueOn}
          />

          {/* Only an itemizable kind offers a rate. Water and Others have
              nothing to price per kWh, so the field is not there at all. */}
          {meta.itemizable && (
            <RateHelper
              id="bill-rate"
              value={rate}
              onChange={(v) => {
                setRate(v);
                setErrors((e) => ({ ...e, rate: undefined }));
              }}
              error={errors.rate}
            />
          )}

          {meta.itemizable && !itemized && appliances.length > 0 && (
            <p className="border-l-[2.5px] border-fairy-ember bg-fairy-ember-tint px-3.5 py-2.5 text-[11.5px] font-semibold text-fairy-ember">
              Saving without a rate discards the {appliances.length}{" "}
              {appliances.length === 1 ? "appliance" : "appliances"} below, and any
              usage logged against {appliances.length === 1 ? "it" : "them"}.
              There would be nothing left to price {appliances.length === 1 ? "it" : "them"} against.
            </p>
          )}

          {/* Section 3: not greyed out, not empty — not rendered. */}
          {!meta.itemizable && appliances.length > 0 && (
            <p className="border-l-[2.5px] border-fairy-ember bg-fairy-ember-tint px-3.5 py-2.5 text-[11.5px] font-semibold text-fairy-ember">
              A non-electricity (water or others) bill has no appliances to itemize.
              Saving discards the {appliances.length}{" "}
              {appliances.length === 1 ? "appliance" : "appliances"} on this bill,
              and any usage logged against {appliances.length === 1 ? "it" : "them"}.
            </p>
          )}

          {itemized && (
            <CollapsibleSection
              icon={<Plug className="size-3.5" aria-hidden />}
              title="Appliances"
              count={appliances.length}
              className="animate-reveal"
            >
              <ApplianceDrafts
                drafts={appliances}
                onChange={setAppliances}
                allowAlwaysOn={covered !== null}
                trackers={trackers.data ?? []}
                roomId={roomId}
              />
            </CollapsibleSection>
          )}

          <CollapsibleSection
            icon={<Receipt className="size-3.5" aria-hidden />}
            title="Other charges"
            count={charges.length}
          >
            <ChargeDrafts drafts={charges} onChange={setCharges} members={members} />
          </CollapsibleSection>
        </div>

        <ErrorNote>{action.error}</ErrorNote>

        <DialogFooter>
          <Button variant="ghost" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" onClick={() => void save()} disabled={action.pending}>
            {action.pending ? "Saving…" : editing ? "Save changes" : "Create bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A section that starts collapsed behind a chevron.
 *
 * The count rides on the header so a folded section still says whether there is
 * anything inside — otherwise editing a bill would hide its own appliances with
 * no hint they exist.
 */
function CollapsibleSection({
  icon,
  title,
  count,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={cn("border-t border-fairy-hair pt-4", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-1.5 text-[11px] font-bold text-fairy-rose"
      >
        {icon}
        {title}
        {count > 0 && (
          <span
            className="bg-fairy-tint px-1.5 py-0.5 text-[10px] text-fairy-tint-ink"
            data-numeric
          >
            {count}
          </span>
        )}
        <ChevronDown
          className={cn("ml-auto size-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className="mt-4 grid gap-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* -- appliances ----------------------------------------------------------- */

function ApplianceDrafts({
  drafts,
  onChange,
  allowAlwaysOn,
  trackers,
  roomId,
}: {
  drafts: DraftAppliance[];
  onChange: (next: DraftAppliance[]) => void;
  allowAlwaysOn: boolean;
  trackers: Tracker[];
  roomId: string;
}) {
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editingDraft = drafts.find((d) => d.key === editingKey);

  function upsert(draft: ApplianceDraft) {
    if (editingDraft) {
      onChange(drafts.map((d) => (d.key === editingDraft.key ? { ...d, ...draft } : d)));
      setEditingKey(null);
      return;
    }
    onChange([...drafts, { key: newKey(), ...draft }]);
    setAdding(false);
  }

  return (
    <div className="grid gap-2">


      {drafts.map((draft) => (
        <div
          key={draft.key}
          className="flex items-center gap-2 border border-fairy-hair bg-card px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-fairy-ink">{draft.label}</div>
            <div className="text-[11.5px] font-medium text-fairy-grey">
              {APPLIANCE_MODE_META[draft.mode].label}
              {draft.kwhPerUnit !== null && (
                <span data-numeric>
                  {" · "}
                  {draft.kwhPerUnit} kWh / {APPLIANCE_MODE_META[draft.mode].unit}
                </span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setEditingKey(draft.key);
            }}
          >
            Edit
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onChange(drafts.filter((d) => d.key !== draft.key))}
            aria-label={`Remove ${draft.label}`}
          >
            <Trash2 className="size-3.5 text-fairy-grey" />
          </Button>
        </div>
      ))}

      {(adding || editingDraft) && (
        <div className="border border-fairy-hair-2 bg-fairy-screen p-3">
          <ApplianceForm
            key={editingDraft?.key ?? "new"}
            initial={
              editingDraft
                ? {
                    label: editingDraft.label,
                    mode: editingDraft.mode,
                    kwhPerUnit: editingDraft.kwhPerUnit,
                    trackerId: editingDraft.trackerId,
                  }
                : undefined
            }
            allowAlwaysOn={allowAlwaysOn}
            trackers={trackers}
            roomId={roomId}
            submitLabel={editingDraft ? "Update appliance" : "Add appliance"}
            onSubmit={upsert}
            onCancel={() => {
              setAdding(false);
              setEditingKey(null);
            }}
          />
        </div>
      )}

      {!adding && !editingDraft && (
        <Button
          size="sm"
          variant="secondary"
          className="w-fit"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" aria-hidden />
          Add appliance
        </Button>
      )}
    </div>
  );
}

/* -- other charges -------------------------------------------------------- */

function ChargeDrafts({
  drafts,
  onChange,
  members,
}: {
  drafts: DraftCharge[];
  onChange: (next: DraftCharge[]) => void;
  members: Member[];
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [everyone, setEveryone] = useState(true);
  const [participants, setParticipants] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  function reset() {
    setLabel("");
    setAmount("");
    setEveryone(true);
    setParticipants([]);
    setErrors({});
    setAdding(false);
  }

  function add() {
    const parsedLabel = parseField(labelSchema, label);
    const parsedAmount = parseField(chargeAmountSchema, amount);
    const next: Record<string, string | undefined> = {};
    if (!parsedLabel.ok) next.label = parsedLabel.message;
    if (!parsedAmount.ok) next.amount = parsedAmount.message;
    if (!everyone && participants.length === 0) next.who = "Pick at least one person.";
    setErrors(next);
    if (!parsedLabel.ok || !parsedAmount.ok || Object.values(next).some(Boolean)) return;

    onChange([
      ...drafts,
      {
        key: newKey(),
        label: parsedLabel.value,
        amountCentavos: parsedAmount.value,
        // null adapts if someone joins the room later; a list does not.
        participantIds: everyone ? null : participants,
      },
    ]);
    reset();
  }

  return (
    <div className="grid gap-2">
      {drafts.map((draft) => (
        <div
          key={draft.key}
          className="flex items-center gap-2 border border-fairy-hair bg-card px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-fairy-ink">{draft.label}</div>
            <div className="text-[11.5px] font-medium text-fairy-grey">
              {draft.participantIds === null
                ? "Everyone"
                : `${describeParticipants(members, draft.participantIds)}`}
            </div>
          </div>
          <span className="shrink-0 text-[13px] font-bold tabular-nums text-fairy-ink">
            {formatCentavos(draft.amountCentavos)}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onChange(drafts.filter((d) => d.key !== draft.key))}
            aria-label={`Remove ${draft.label}`}
          >
            <Trash2 className="size-3.5 text-fairy-grey" />
          </Button>
        </div>
      ))}

      {adding ? (
        <div className="grid gap-4 border border-fairy-hair-2 bg-fairy-screen p-3">
          <Field
            id="charge-label"
            label="What is it?"
            value={label}
            onChange={(v) => {
              setLabel(v);
              setErrors((e) => ({ ...e, label: undefined }));
            }}
            placeholder="e.g. Late payment fee"
            requirement="required"
            autoFocus
            error={errors.label}
          />
          <Field
            id="charge-amount"
            label="Amount"
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setErrors((e) => ({ ...e, amount: undefined }));
            }}
            placeholder="e.g. 250.00"
            prefix="₱"
            inputMode="decimal"
            requirement="required"
            error={errors.amount}
          />

          <div className="grid gap-2">
            <span className="text-[12.5px] font-bold text-fairy-ink">Who pays it?</span>
            <div className="flex gap-1.5">
              <SplitChoice active={everyone} onClick={() => setEveryone(true)}>
                Everyone
              </SplitChoice>
              <SplitChoice active={!everyone} onClick={() => setEveryone(false)}>
                Only some people
              </SplitChoice>
            </div>
            {!everyone && (
              <ParticipantPicker
                members={members}
                selected={participants}
                onChange={(update) => {
                  setParticipants(update);
                  setErrors((e) => ({ ...e, who: undefined }));
                }}
                idPrefix="charge"
                label="Split between"
              />
            )}
            {errors.who && (
              <p className="text-[11.5px] font-semibold text-fairy-danger">{errors.who}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
            <Button size="sm" onClick={add}>
              Add charge
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" className="w-fit" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" aria-hidden />
          Add charge
        </Button>
      )}
    </div>
  );
}

function SplitChoice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "border px-3 py-1.5 text-[12px] font-semibold transition-colors",
        active
          ? "border-fairy-ink bg-fairy-tint text-fairy-tint-ink"
          : "border-fairy-hair-2 bg-card text-fairy-grey hover:bg-fairy-screen",
      )}
    >
      {children}
    </button>
  );
}
