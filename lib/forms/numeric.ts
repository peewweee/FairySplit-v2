import { z } from "zod";
import { pesosToCentavos, pesosToMillicents } from "@/lib/billing/money";

/**
 * Strict string -> number parsing.
 *
 * `Number("")` is 0. `parseFloat("14 pesos")` is 14. `Number("1e3")` is 1000.
 * None of those are acceptable answers to "how many kWh?", so the whole string
 * must match a plain decimal after we strip the separators a human would type.
 */
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

/** Removes spaces, thousands commas and a leading peso sign. Nothing else. */
export function cleanNumericInput(raw: string): string {
  return raw.replace(/[\s,₱]/g, "");
}

export interface DecimalRules {
  emptyMessage: string;
  badMessage: string;
  min?: number;
  minMessage?: string;
  max?: number;
  maxMessage?: string;
  integer?: boolean;
  /** Reject exact zero — "1.5 hours" is fine, "0 hours" is a mis-entry. */
  positive?: boolean;
  /** Pesos have two; a per-kWh rate is quoted to four. */
  maxDecimals?: number;
  decimalsMessage?: string;
}

/** Shared validation body, so required and optional never drift apart. */
function check(value: string, rules: DecimalRules, ctx: z.RefinementCtx): void {
  if (!PLAIN_DECIMAL.test(value)) {
    ctx.addIssue({ code: "custom", message: rules.badMessage });
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: rules.badMessage });
    return;
  }
  if (rules.integer && !Number.isInteger(n)) {
    ctx.addIssue({ code: "custom", message: "Whole numbers only." });
    return;
  }
  if (rules.maxDecimals !== undefined) {
    const decimals = value.split(".")[1]?.length ?? 0;
    if (decimals > rules.maxDecimals) {
      ctx.addIssue({
        code: "custom",
        message:
          rules.decimalsMessage ??
          `At most ${rules.maxDecimals} decimal place${rules.maxDecimals === 1 ? "" : "s"}.`,
      });
      return;
    }
  }
  if (rules.positive && n <= 0) {
    ctx.addIssue({ code: "custom", message: "Must be more than zero." });
    return;
  }
  if (rules.min !== undefined && n < rules.min) {
    ctx.addIssue({
      code: "custom",
      message: rules.minMessage ?? `Must be at least ${rules.min}.`,
    });
  }
  if (rules.max !== undefined && n > rules.max) {
    ctx.addIssue({
      code: "custom",
      message: rules.maxMessage ?? `That looks too large — ${rules.max} is the ceiling.`,
    });
  }
}

/** A required decimal input. Blank is an error, not zero. */
export function decimalSchema(rules: DecimalRules) {
  return z
    .string()
    .transform(cleanNumericInput)
    .superRefine((value, ctx) => {
      if (value === "") {
        ctx.addIssue({ code: "custom", message: rules.emptyMessage });
        return;
      }
      check(value, rules, ctx);
    })
    .transform((value) => Number(value));
}

/** The same rules, but blank means "not provided" and parses to null. */
export function optionalDecimalSchema(rules: DecimalRules) {
  return z
    .string()
    .transform(cleanNumericInput)
    .superRefine((value, ctx) => {
      if (value === "") return;
      check(value, rules, ctx);
    })
    .transform((value): number | null => (value === "" ? null : Number(value)));
}

/** kWh per unit — per hour, per cycle, or per day depending on mode (10.3). */
const KWH_RULES: DecimalRules = {
  emptyMessage: "How many kWh per unit?",
  badMessage: "Type a number, like 0.73",
  min: 0,
  max: 100_000,
};
export const kwhPerUnitSchema = decimalSchema(KWH_RULES);
export const optionalKwhPerUnitSchema = optionalDecimalSchema(KWH_RULES);

/** Days stayed. Whole days, and nobody stays for 400 of them. */
const DAY_RULES: DecimalRules = {
  emptyMessage: "How many days?",
  badMessage: "Type a whole number of days.",
  min: 0,
  max: 366,
  maxMessage: "A billing period longer than a year is probably a typo.",
  integer: true,
};
export const dayCountSchema = decimalSchema(DAY_RULES);
/** Days-in-unit is always optional; blank means zero days (3.1). */
export const optionalDayCountSchema = optionalDecimalSchema(DAY_RULES);

/** How much of an appliance got used: 1.5 hours, 3 cycles. */
export const usageQuantitySchema = decimalSchema({
  emptyMessage: "How much?",
  badMessage: "Type a number, like 1.5",
  max: 100_000,
  positive: true,
});

/** Hours per day, used only by the kWh/month -> kWh/hour converter (10.3). */
export const hoursPerDaySchema = decimalSchema({
  emptyMessage: "About how many hours a day?",
  badMessage: "Type a number, like 9",
  max: 24,
  maxMessage: "There are only 24 hours in a day.",
  positive: true,
});

/** kWh over a whole month, for the same converter. */
export const kwhPerMonthSchema = decimalSchema({
  emptyMessage: "How many kWh a month?",
  badMessage: "Type a number, like 153.9",
  min: 0,
  max: 1_000_000,
});

/* -- money -------------------------------------------------------------- *
 * These are the only schemas that touch peso figures, and they hand off the
 * actual unit conversion to `lib/billing/money.ts` (section 6).
 * ----------------------------------------------------------------------- */

/** The bill total. The one truly required number on a bill (section 3). */
export const billTotalSchema = decimalSchema({
  emptyMessage: "How much is the bill?",
  badMessage: "Type an amount, like 1783.74",
  max: 10_000_000,
  maxMessage: "That is a very large bill — check the decimal point.",
  maxDecimals: 2,
  decimalsMessage: "Centavos only go to two decimal places.",
  positive: true,
}).transform(pesosToCentavos);

/** Any other peso amount: a late fee, a reconnection charge. */
export const chargeAmountSchema = decimalSchema({
  emptyMessage: "How much?",
  badMessage: "Type an amount, like 250.00",
  max: 10_000_000,
  maxDecimals: 2,
  decimalsMessage: "Centavos only go to two decimal places.",
  positive: true,
}).transform(pesosToCentavos);

/**
 * THE MODE SWITCH (section 3). Blank means simple split and no appliance
 * section at all; a figure means itemized.
 */
export const optionalRateSchema = optionalDecimalSchema({
  emptyMessage: "",
  badMessage: "Type a rate, like 14.86",
  max: 1_000,
  maxMessage: "A rate over ₱1,000/kWh is almost certainly a typo.",
  maxDecimals: 4,
  decimalsMessage: "Rates go to four decimal places at most.",
  positive: true,
}).transform((pesos) => (pesos === null ? null : pesosToMillicents(pesos)));

/* -- logged quantities ---------------------------------------------------- */

/** Hours stayed. Fractional, because a clock in/out gives 48.01 not 48. */
export const optionalHoursSchema = optionalDecimalSchema({
  emptyMessage: "",
  badMessage: "Type a number of hours, like 48.5",
  min: 0,
  max: 100_000,
  maxMessage: "That is more hours than the period can hold.",
});

/** A logged appliance quantity: hours or cycles, depending on the appliance. */
export const optionalUsageQuantitySchema = optionalDecimalSchema({
  emptyMessage: "",
  badMessage: "Type a number, like 1.5",
  min: 0,
  max: 100_000,
});
