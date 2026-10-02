"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ErrorNote } from "@/components/fairy/shell-bits";
import { HOURS_PER_DAY, hoursToDays } from "@/lib/billing/occupancy";
import {
  APPLIANCE_MODE_META,
  repo,
  type ApplianceUse,
  type Bill,
  type BillAppliance,
  type Member,
} from "@/lib/data";
import { useRepoAction, useResetOnChange } from "@/lib/data/hooks";
import { optionalHoursSchema, optionalUsageQuantitySchema } from "@/lib/forms/numeric";
import { parseField } from "@/lib/forms/schemas";
import type { ZodType } from "zod";

/**
 * Your own logs for one bill: the hours you stayed, and how much of each
 * appliance you used.
 *
 * This is the surface the clock in/out system will write to. Until it exists
 * the numbers are typed, but they are the same numbers — hours stayed, hours
 * per appliance, cycles per appliance — so nothing above this line changes when
 * tracking lands.
 *
 * Always-on appliances are deliberately absent: a fridge runs whether you are
 * home or not, so there is nothing personal to log against it.
 */
export function MyLogsPanel({ bill, me }: { bill: Bill; me: Member | null }) {
  const loggable = bill.appliances.filter((a) => a.mode !== "always_on");

  if (!me) {
    return (
      <section aria-labelledby="my-logs-heading" className="fs-card mb-6 p-4 sm:p-5">
        <h2 id="my-logs-heading" className="mb-1 text-[14.5px] text-fairy-ink">
          Your logs
        </h2>
        <p className="text-[11.5px] leading-[1.5] font-medium text-fairy-grey">
          You&rsquo;re not one of the people in this room, so there are no logs of
          yours to show here.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="my-logs-heading" className="fs-card mb-6 p-4 sm:p-5">
      <h2 id="my-logs-heading" className="mb-4 text-[14.5px] text-fairy-ink">
        Your logs
      </h2>

      <div className="grid gap-5 sm:grid-cols-2">
        <HoursStayed bill={bill} me={me} />

        {loggable.map((appliance) => (
          <ApplianceLog key={appliance.id} bill={bill} me={me} appliance={appliance} />
        ))}
      </div>

      {loggable.length === 0 && bill.rateMillicents !== null && (
        <p className="mt-4 text-[11.5px] font-medium text-fairy-grey">
          No metered appliances on this bill yet. Add one and it shows up here to
          log against.
        </p>
      )}
    </section>
  );
}

/** Hours stayed, with the day count the split actually uses derived beneath. */
function HoursStayed({ bill, me }: { bill: Bill; me: Member }) {
  const stored = bill.memberHours[me.id] ?? null;
  const days = hoursToDays(stored);

  return (
    <div>
      <LogRow
        id={`log-hours-${me.id}`}
        label="Total hours"
        caption="Based on your logged hours"
        value={stored}
        schema={optionalHoursSchema}
        decimals={2}
        onSave={(next) => repo.setMemberHours(bill.id, me.id, next)}
      />
      <p className="mt-2 text-[13px] font-bold tracking-[-0.02em] text-fairy-ink">
        Total days:{" "}
        <span data-numeric>{days === null ? "—" : days.toFixed(2)}</span>
      </p>
      <p className="mt-0.5 text-[10.5px] font-medium text-fairy-grey">
        {HOURS_PER_DAY} logged hours make one day. This is the figure the split is
        weighted by.
      </p>
    </div>
  );
}

/** One appliance's personal total: "Air conditioner hours", "Washer cycles". */
function ApplianceLog({
  bill,
  me,
  appliance,
}: {
  bill: Bill;
  me: Member;
  appliance: BillAppliance;
}) {
  const meta = APPLIANCE_MODE_META[appliance.mode];
  const mine = soloUse(bill.uses, appliance.id, me.id);
  // Usage logged as a shared event belongs to several people at once, so it is
  // not yours to edit here. Shown, never silently folded in.
  const shared = bill.uses
    .filter(
      (u) =>
        u.applianceId === appliance.id &&
        u.participantIds.includes(me.id) &&
        u.participantIds.length > 1,
    )
    .reduce((acc, u) => acc + u.quantity, 0);

  const noun = `${appliance.label} ${meta.unitPlural}`;

  return (
    <div>
      <LogRow
        id={`log-${appliance.id}-${me.id}`}
        label={`${appliance.label} ${meta.unitPlural}`}
        caption={`Based on your logged ${noun.toLowerCase()}`}
        value={mine?.quantity ?? null}
        schema={optionalUsageQuantitySchema}
        decimals={appliance.mode === "per_cycle" ? 0 : 2}
        onSave={async (next) => {
          if (next === null || next === 0) {
            if (mine) await repo.removeUse(bill.id, mine.id);
            return;
          }
          if (mine) {
            await repo.updateUse(bill.id, mine.id, { quantity: next });
            return;
          }
          await repo.addUse(bill.id, {
            applianceId: appliance.id,
            quantity: next,
            participantIds: [me.id],
            occurredOn: null,
            note: null,
          });
        }}
      />
      {shared > 0 && (
        <p className="mt-1 text-[10.5px] font-medium text-fairy-ember">
          Plus {round(shared, 2)} {meta.unitPlural} logged together with others —
          edit those in the usage log below.
        </p>
      )}
    </div>
  );
}

/** A label, an inline number you can edit, and the caption under it. */
function LogRow({
  id,
  label,
  caption,
  value,
  schema,
  decimals,
  onSave,
}: {
  id: string;
  label: string;
  caption: string;
  value: number | null;
  schema: ZodType<number | null, string>;
  decimals: number;
  onSave: (next: number | null) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(format(value, decimals));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const action = useRepoAction();

  // Follow the store when it changes underneath us.
  if (useResetOnChange(String(value))) setDraft(format(value, decimals));

  async function commit() {
    const parsed = parseField(schema, draft);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    if (parsed.value === value) return;
    const done = await action.run(() => onSave(parsed.value));
    if (done === undefined) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <label htmlFor={id} className="text-[13px] font-bold tracking-[-0.02em] text-fairy-ink">
          {label}:
        </label>
        <Input
          id={id}
          value={draft}
          inputMode="decimal"
          data-numeric
          placeholder="—"
          className="h-8 w-24 px-2 text-[13px] font-bold tabular-nums"
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-caption`}
        />
        <span className="w-4 shrink-0" aria-live="polite">
          {saved && <Check className="animate-sparkle size-4 text-fairy-moss" aria-label="Saved" />}
        </span>
      </div>
      <p id={`${id}-caption`} className="mt-0.5 text-[10.5px] font-medium text-fairy-grey">
        {caption}
      </p>
      <ErrorNote>{error ?? action.error}</ErrorNote>
    </div>
  );
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

function format(value: number | null, decimals: number): string {
  if (value === null) return "";
  return decimals === 0 ? String(round(value, 0)) : value.toFixed(decimals);
}

/** The one use on this appliance that is this person's alone. */
function soloUse(uses: ApplianceUse[], applianceId: string, memberId: string) {
  return uses.find(
    (u) =>
      u.applianceId === applianceId &&
      u.participantIds.length === 1 &&
      u.participantIds[0] === memberId,
  );
}
