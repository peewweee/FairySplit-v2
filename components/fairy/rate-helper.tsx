"use client";

import { Field } from "@/components/fairy/field";

/**
 * The one field that decides the whole shape of the screen (section 3).
 *
 * Blank => simple split, and the appliance section does not exist. A figure =>
 * itemized, and the appliance section appears. The helper text below it spells
 * out that consequence, because it is not guessable from the label.
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
