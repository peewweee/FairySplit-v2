import { z } from "zod";

import { personNameSchema } from "@/lib/forms/schemas";

/**
 * Credentials are validated here, on the server, before they reach Supabase.
 * The browser may also check them for a faster message, but this is the copy
 * that decides.
 */

const trimmed = z.string().transform((s) => s.trim());

export const emailSchema = trimmed.pipe(
  z
    .string()
    .min(1, "Type your email.")
    .max(254, "That email is too long.")
    .pipe(z.email("That does not look like an email address.")),
);

/**
 * Eight is Supabase's own floor for this project. Deliberately no upper-case
 * or symbol rule: length beats punctuation, and fussy rules push people
 * towards passwords they have used elsewhere.
 */
export const passwordSchema = z
  .string()
  .min(8, "Passwords need at least 8 characters.")
  .max(72, "Passwords can be at most 72 characters.");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Type your password."),
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: personNameSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
