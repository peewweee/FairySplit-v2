/**
 * Which sign-in paths the UI offers right now.
 *
 * Email+password needs a verified sending domain to actually work for
 * anyone but the account holder — Resend's unverified sender can only
 * deliver to the email its own account was signed up with (see the
 * fairysplit-prelaunch-branding memory). Off until that domain exists.
 *
 * Nothing about `signIn`/`signUp` in lib/auth/actions.ts changes when this
 * is off — only whether the UI offers the path. Flip back to `true` once
 * the domain and SMTP sender are sorted; no other change needed.
 */
export const EMAIL_PASSWORD_ENABLED = false;

// Parked until the Facebook app is published (needs Business Verification); anyone without an app role gets "App not active".
export const FACEBOOK_ENABLED = false;
