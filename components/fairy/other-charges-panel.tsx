"use client";

import { useState } from "react";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/fairy/field";
import {
  ParticipantPicker,
  describeParticipants,
} from "@/components/fairy/participant-picker";
import { EmptyState, ErrorNote } from "@/components/fairy/shell-bits";
import { SparkleBurst, useSparkle } from "@/components/fairy/sparkle-burst";
import { formatCentavos } from "@/lib/billing/money";
import { repo, type Bill, type Member } from "@/lib/data";
import { useRepoAction } from "@/lib/data/hooks";
import { chargeAmountSchema } from "@/lib/forms/numeric";
import { labelSchema, parseField } from "@/lib/forms/schemas";
import { cn } from "@/lib/utils";

/**
 * Other charges (7.3 step 3): anything on the bill that isn't electricity —
 * a late fee, a reconnection charge. Split equally across whoever it applies
 * to, then subtracted from the bill before the residual is shared out.
 */
export function OtherChargesPanel({ bill, members }: { bill: Bill; members: Member[] }) {
  const [adding, setAdding] = useState(false);
  const action = useRepoAction();

  const total = bill.otherCharges.reduce((acc, c) => acc + c.amountCentavos, 0);

  return (
    <section aria-labelledby="charges-heading" className="fs-card p-4 sm:p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id="charges-heading" className="text-[14.5px] text-fairy-ink">
          Other charges
        </h2>
        {!adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        )}
      </div>
      <p className="mb-4 max-w-prose text-[11.5px] leading-[1.5] font-medium text-fairy-grey">
        A late fee, a reconnection charge — anything on the bill that isn&rsquo;t
        usage. Carved out before the rest is split by days.
        {total > 0 && (
          <>
            {" "}
            <span className="text-fairy-ink">{formatCentavos(total)} so far.</span>
          </>
        )}
      </p>

      <ErrorNote>{action.error}</ErrorNote>

      {bill.otherCharges.length === 0 && !adding ? (
        <EmptyState
          icon={<Receipt className="size-5" aria-hidden />}
          title="No extra charges"
          description="Most months there aren't any."
          className="py-8"
        />
      ) : (
        <ul className="grid gap-1.5">
          {bill.otherCharges.map((charge) => (
            <li
              key={charge.id}
              className="flex items-center gap-2 rounded-xl border border-fairy-hair bg-card px-3.5 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold text-fairy-ink">{charge.label}</div>
                <div className="text-[11.5px] font-medium text-fairy-grey">
                  {charge.participantIds === null
                    ? "Everyone, equally"
                    : `${describeParticipants(members, charge.participantIds)}, equally`}
                </div>
              </div>
              <span className="shrink-0 text-sm tabular-nums text-fairy-ink">
                {formatCentavos(charge.amountCentavos)}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() =>
                  void action.run(() => repo.removeOtherCharge(bill.id, charge.id))
                }
                aria-label={`Remove ${charge.label}`}
              >
                <Trash2 className="size-3.5 text-fairy-grey" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddChargeForm
          billId={bill.id}
          members={members}
          onDone={() => setAdding(false)}
          className={bill.otherCharges.length > 0 ? "mt-3" : ""}
        />
      )}
    </section>
  );
}

function AddChargeForm({
  billId,
  members,
  onDone,
  className,
}: {
  billId: string;
  members: Member[];
  onDone: () => void;
  className?: string;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [everyone, setEveryone] = useState(true);
  const [participants, setParticipants] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const action = useRepoAction();
  const { burst, sparkle } = useSparkle();

  async function add() {
    const parsedLabel = parseField(labelSchema, label);
    const parsedAmount = parseField(chargeAmountSchema, amount);
    const next: Record<string, string | undefined> = {};
    if (!parsedLabel.ok) next.label = parsedLabel.message;
    if (!parsedAmount.ok) next.amount = parsedAmount.message;
    if (!everyone && participants.length === 0) next.who = "Pick at least one person.";
    setErrors(next);
    if (!parsedLabel.ok || !parsedAmount.ok || (!everyone && participants.length === 0)) return;

    const created = await action.run(() =>
      repo.addOtherCharge(billId, {
        label: parsedLabel.value,
        amountCentavos: parsedAmount.value,
        // null adapts if someone joins the room later; an explicit list does not.
        participantIds: everyone ? null : participants,
      }),
    );
    if (!created) return;
    sparkle();
    onDone();
  }

  return (
    <div
      className={cn(
        "relative grid gap-4 rounded-xl border border-fairy-hair-2 bg-fairy-tint p-3",
        className,
      )}
    >
      <SparkleBurst burst={burst} />

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
        <span className="text-sm font-medium text-fairy-ink">Who pays it?</span>
        <div className="flex gap-1.5">
          <SplitChoice active={everyone} onClick={() => setEveryone(true)}>
            Everyone
          </SplitChoice>
          <SplitChoice active={!everyone} onClick={() => setEveryone(false)}>
            Only some people
          </SplitChoice>
        </div>
        {everyone ? (
          <p className="text-[11.5px] font-medium text-fairy-grey">
            Split equally, and it keeps up if someone joins the room later.
          </p>
        ) : (
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
        {errors.who && <p className="text-[11.5px] font-semibold text-fairy-danger">{errors.who}</p>}
      </div>

      <ErrorNote>{action.error}</ErrorNote>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="lg" onClick={onDone}>
          Cancel
        </Button>
        <Button size="lg" onClick={() => void add()} disabled={action.pending}>
          {action.pending ? "Adding…" : "Add charge"}
        </Button>
      </div>
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
