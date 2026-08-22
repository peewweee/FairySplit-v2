import { z } from "zod";

/**
 * Form inputs arrive as strings and JavaScript lies about them (section 4):
 * `Number("")` is 0 and `parseFloat("14 pesos")` is 14. Every value that
 * reaches the repository is parsed here first.
 *
 * Numeric schemas live in `lib/forms/numeric.ts` so they can sit next to the
 * money helpers that do the actual unit conversion.
 */

const trimmed = z.string().transform((s) => s.trim());

export const personNameSchema = trimmed.pipe(
  z
    .string()
    .min(1, "Type a name.")
    .max(40, "That name is a bit long - 40 characters max."),
);

export const roomNameSchema = trimmed.pipe(
  z
    .string()
    .min(1, "Give the room a name.")
    .max(60, "That name is a bit long - 60 characters max."),
);

export const labelSchema = trimmed.pipe(
  z
    .string()
    .min(1, "Type a label.")
    .max(60, "That label is a bit long - 60 characters max."),
);

export const joinCodeSchema = trimmed.pipe(
  z
    .string()
    .min(1, "Type the 6-character code.")
    .transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .pipe(z.string().length(6, "Join codes are exactly 6 characters.")),
);

/** Optional free text: blank becomes null rather than an empty string. */
export const optionalNoteSchema = trimmed.pipe(
  z
    .string()
    .max(140, "Keep the note under 140 characters.")
    .transform((s) => (s === "" ? null : s)),
);

/** ISO date (YYYY-MM-DD), required. Both bill dates use this. */
export const isoDateSchema = trimmed.pipe(
  z
    .string()
    .min(1, "Pick a date.")
    .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), "Use a real date."),
);

/** ISO date (YYYY-MM-DD) from a native date input; blank becomes null. */
export const optionalIsoDateSchema = trimmed.pipe(
  z
    .string()
    .refine((s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s), "Use a real date.")
    .transform((s) => (s === "" ? null : s)),
);

/** First error message from a failed parse, ready to render under a field. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That value doesn't look right.";
}

/** Parse, returning either the value or a message - never throwing at a form. */
export function parseField<T>(
  schema: z.ZodType<T>,
  value: unknown,
): { ok: true; value: T } | { ok: false; message: string } {
  const result = schema.safeParse(value);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, message: firstError(result.error) };
}
