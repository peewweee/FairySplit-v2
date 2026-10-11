"use client";

import { Field } from "@/components/fairy/field";
import { RateInfo } from "@/components/fairy/rate-info";

/**
 * The one field that decides the whole shape of the screen (section 3).
 *
 * Blank => simple split, and appliances cannot be added yet (the appliance section
 * is there, its Add button muted). A figure => itemized, and appliances can be added.
 * The helper text below it spells out that consequence, because it is not guessable
 * from the label; the info icon shows where on a bill to find the number.
 */
export function RateHelper({
  id,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <Field
      id={id}
      label="Electricity rate"
      labelAddon={<RateInfo />}
      value={value}
      onChange={onChange}
      placeholder="e.g. 14.86"
      prefix="₱"
      suffix="/ kWh"
      inputMode="decimal"
      requirement="optional"
      disabled={disabled}
      error={error}
      helper="Add a rate if you want to charge appliance use separately."
    />
  );
}
