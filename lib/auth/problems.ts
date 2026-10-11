/**
 * What to tell somebody whose sign-in did not work out, from the `?error=` code a
 * failed attempt comes back to the landing page with.
 *
 * Only a code we know maps to text. It is read off the URL, so it must never be
 * echoed back as written — and a `switch`, not an object lookup, so a code like
 * "constructor" is just an unknown code instead of something that resolves.
 *
 * Whether a message points at the email form depends on whether that form is on.
 */
export function signInProblem(code: unknown, emailPasswordEnabled: boolean): string | undefined {
  if (typeof code !== "string") return undefined;

  const retry = emailPasswordEnabled
    ? "Try again, or use your email and password below."
    : "Try again in a moment.";

  switch (code) {
    case "link-invalid":
      return "That confirmation link was not readable. Try signing in.";
    case "link-expired":
      return "That confirmation link has expired or was already used. Sign in, or create the account again.";
    case "google-cancelled":
    case "facebook-cancelled":
      return "No problem — nothing was signed in. Try again whenever.";
    case "google-unavailable":
      return `Google sign-in did not come back to us properly. ${retry}`;
    case "facebook-unavailable":
      return `Facebook sign-in did not come back to us properly. ${retry}`;
    default:
      return undefined;
  }
}
