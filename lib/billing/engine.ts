import { kwhToCentavos, largestRemainder } from "@/lib/billing/money";
import type {
  ApplianceUse,
  BillAppliance,
  Centavos,
  Millicents,
  OtherCharge,
} from "@/lib/data/types";

/**
 * The calculation engine (section 7).
 *
 * A PURE module. It imports nothing from React, Next.js or any storage layer,
 * and it never calls `new Date()`. Plain objects in, plain objects out. That is
 * what makes the maths testable, and it is why Phase C can feed it days
 * measured by a timer without the engine noticing the difference.
 */

/* -- 7.1 signature -------------------------------------------------------- */

export interface BillInput {
  /** The total AFTER the round-up-to-peso step. See `applyRoundUp`. */
  billedCentavos: Centavos;
  rateMillicents: Millicents | null;
  daysCovered: number | null;
  /** ANY length >= 1. Nothing here may depend on how many. */
  members: { id: string; days: number | null }[];
  appliances: BillAppliance[];
  uses: ApplianceUse[];
  otherCharges: OtherCharge[];
}

export interface ShareRow {
  memberId: string;
  days: number;
  /** Occupancy-weighted portion of the leftover. */
  sharedCentavos: Centavos;
  /** Always-on appliances, split equally. */
  fixedCentavos: Centavos;
  /** This person's own appliance usage. */
  meteredCentavos: Centavos;
  otherCentavos: Centavos;
  totalCentavos: Centavos;
  /** applianceId -> amount, for the UI. */
  breakdown: Record<string, Centavos>;
}

export interface BillResult {
  rows: ShareRow[];
  residualCentavos: Centavos;
  /** For display: residual divided by the total person-days. Not rounded. */
  dailyFeeCentavos: number;
  /** MUST equal billedCentavos. */
  grandTotalCentavos: Centavos;
  warnings: Warning[];
}

export type Warning =
  /** Nobody has days -> fell back to equal split. */
  | "NO_OCCUPANCY_EQUAL_SPLIT"
  /** Appliance estimates exceed the bill. */
  | "CARVEOUTS_EXCEED_TOTAL"
  /** Someone's days > the days the bill covers. */
  | "DAYS_EXCEED_COVERAGE";

export const WARNING_COPY: Record<Warning, { title: string; detail: string }> = {
  NO_OCCUPANCY_EQUAL_SPLIT: {
    title: "Split equally — no days entered",
    detail:
      "Nobody has a day count on this bill, so the shared portion was divided evenly. Fill in days below to weight it by who actually stayed.",
  },
  CARVEOUTS_EXCEED_TOTAL: {
    title: "Appliance estimates exceed the bill",
    detail:
      "The appliance and charge figures add up to more than the bill itself, so they were scaled down to fit. Check the kWh ratings and the rate.",
  },
  DAYS_EXCEED_COVERAGE: {
    title: "Someone stayed longer than the bill covers",
    detail:
      "At least one person's days are greater than the number of days this bill covers. The split still works, but one of the two numbers is probably a typo.",
  },
};

/** Thrown when the input violates something a form was supposed to guarantee. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

/* -- 7.3 step 0 ----------------------------------------------------------- */

/**
 * The collected amount is what gets split, so a PHP 1,783.74 bill collects
 * PHP 1,784.00. Applied by the caller; `BillInput.billedCentavos` is the result.
 */
export function applyRoundUp(totalCentavos: Centavos, roundUpToPeso: boolean): Centavos {
  return roundUpToPeso ? Math.ceil(totalCentavos / 100) * 100 : totalCentavos;
}

/* -- the pipeline --------------------------------------------------------- */

export function computeBill(spec: BillInput): BillResult {
  const { billedCentavos, rateMillicents, daysCovered, members, appliances, uses } = spec;

  if (members.length === 0) {
    throw new EngineError("A bill needs at least one member to split between.");
  }

  // Section 3 precondition: no rate means no appliances and no uses, so steps 1
  // and 2 contribute nothing and the residual is the whole bill. One code path,
  // no "simple mode" branch at the call site.
  if (rateMillicents === null && (appliances.length > 0 || uses.length > 0)) {
    throw new EngineError(
      "Appliances were configured without an electricity rate to price them against.",
    );
  }

  const memberIds = members.map((m) => m.id);
  const days = members.map((m) => m.days ?? 0);
  const warnings = new Set<Warning>();

  // Per-member accumulators. Indexed the same as `members`, always.
  const fixed = memberIds.map(() => 0);
  const metered = memberIds.map(() => 0);
  const other = memberIds.map(() => 0);
  const breakdown: Record<string, Centavos>[] = memberIds.map(() => ({}));

  const addBreakdown = (i: number, applianceId: string, amount: Centavos) => {
    if (amount === 0) {
      breakdown[i][applianceId] ??= 0;
      return;
    }
    breakdown[i][applianceId] = (breakdown[i][applianceId] ?? 0) + amount;
  };

  /* -- step 1: always-on appliances (the fridge) ------------------------- */

  for (const item of appliances) {
    if (item.mode !== "always_on") continue;

    // Guaranteed present by 3.1. If either is null a form let bad data through,
    // and guessing would put a wrong number on someone's bill.
    if (item.kwhPerUnit === null) {
      throw new EngineError(
        `"${item.label}" runs all the time but has no kWh figure to price it with.`,
      );
    }
    if (daysCovered === null) {
      throw new EngineError(
        `"${item.label}" runs all the time, so this bill needs its From and To dates before it can be costed.`,
      );
    }

    const cost = kwhToCentavos(item.kwhPerUnit * daysCovered, rateMillicents!);
    // It runs 24/7 and benefits everyone whether they were home or not, so
    // occupancy is irrelevant here: split equally across ALL members.
    const parts = largestRemainder(cost, memberIds.map(() => 1), memberIds);
    parts.forEach((part, i) => {
      fixed[i] += part;
      addBreakdown(i, item.id, part);
    });
  }

  /* -- step 2: metered uses (aircon, washing machine, anything) ---------- */

  const applianceById = new Map(appliances.map((a) => [a.id, a]));

  for (const event of uses) {
    const item = applianceById.get(event.applianceId);
    if (!item) {
      throw new EngineError("A logged usage points at an appliance that isn't on this bill.");
    }
    if (item.kwhPerUnit === null) {
      throw new EngineError(`"${item.label}" has usage logged but no kWh figure.`);
    }
    if (event.participantIds.length === 0) {
      throw new EngineError(`A logged usage of "${item.label}" has no participants.`);
    }

    // 7.2: cost of one use = quantity x kwhPerUnit x rate, and each participant
    // pays cost / (number of participants). No grid, no typed divisors, works
    // for one person or twelve.
    const cost = kwhToCentavos(event.quantity * item.kwhPerUnit, rateMillicents!);
    const participants = event.participantIds;
    const shares = largestRemainder(cost, participants.map(() => 1), participants);

    participants.forEach((participantId, p) => {
      const i = memberIds.indexOf(participantId);
      // A participant who has since left the room simply drops out of the split.
      if (i === -1) return;
      metered[i] += shares[p];
      addBreakdown(i, item.id, shares[p]);
    });
  }

  /* -- step 3: other charges --------------------------------------------- */

  for (const item of spec.otherCharges) {
    const participants = item.participantIds ?? memberIds;
    const known = participants.filter((id) => memberIds.includes(id));
    const targets = known.length > 0 ? known : memberIds;
    const shares = largestRemainder(item.amountCentavos, targets.map(() => 1), targets);
    targets.forEach((targetId, t) => {
      other[memberIds.indexOf(targetId)] += shares[t];
    });
  }

  /* -- step 4: the residual is DEFINED as the leftover ------------------- */

  const carveOutTotal =
    sum(fixed) + sum(metered) + sum(other);
  let residual = billedCentavos - carveOutTotal;

  /* -- step 5: overflow guard -------------------------------------------- */

  if (residual < 0) {
    // The obvious version zeroes the residual and leaves the carve-outs at full
    // size, so a PHP 1,000 bill returns PHP 2,229 in shares. Scale instead.
    warnings.add("CARVEOUTS_EXCEED_TOTAL");

    const combined = memberIds.map((_, i) => fixed[i] + metered[i] + other[i]);
    const scaled = largestRemainder(billedCentavos, combined, memberIds);

    const BUCKETS = ["fixed", "metered", "other"];
    memberIds.forEach((_, i) => {
      const before = [fixed[i], metered[i], other[i]];
      const after = largestRemainder(scaled[i], before, BUCKETS);
      // Rescale the per-appliance breakdown to match the new appliance total.
      const applianceTotal = after[0] + after[1];
      const entries = Object.entries(breakdown[i]);
      if (entries.length > 0) {
        const scaledEntries = largestRemainder(
          applianceTotal,
          entries.map(([, amount]) => amount),
          entries.map(([id]) => id),
        );
        breakdown[i] = Object.fromEntries(
          entries.map(([id], e) => [id, scaledEntries[e]]),
        );
      }
      fixed[i] = after[0];
      metered[i] = after[1];
      other[i] = after[2];
    });

    residual = 0;
  }

  /* -- step 6: split the residual by occupancy --------------------------- */

  const totalDays = sum(days);
  if (totalDays === 0) {
    // Never divide by zero: fall back to an equal split and say so.
    warnings.add("NO_OCCUPANCY_EQUAL_SPLIT");
  }
  if (daysCovered !== null && days.some((d) => d > daysCovered)) {
    warnings.add("DAYS_EXCEED_COVERAGE");
  }

  // `largestRemainder` already falls back to an equal split when every weight
  // is zero, which is exactly the behaviour this step wants.
  const shared = largestRemainder(residual, days, memberIds);

  /* -- step 7: total and assert ------------------------------------------ */

  const rows: ShareRow[] = members.map((member, i) => ({
    memberId: member.id,
    days: days[i],
    sharedCentavos: shared[i],
    fixedCentavos: fixed[i],
    meteredCentavos: metered[i],
    otherCentavos: other[i],
    totalCentavos: shared[i] + fixed[i] + metered[i] + other[i],
    breakdown: breakdown[i],
  }));

  const grandTotal = sum(rows.map((r) => r.totalCentavos));
  if (grandTotal !== billedCentavos) {
    // A wrong bill must never render.
    throw new EngineError(
      `Split does not reconcile: shares total ${grandTotal} but the bill is ${billedCentavos}.`,
    );
  }

  return {
    rows,
    residualCentavos: residual,
    dailyFeeCentavos: totalDays === 0 ? 0 : residual / totalDays,
    grandTotalCentavos: grandTotal,
    warnings: [...warnings],
  };
}

const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);
