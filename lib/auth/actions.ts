"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { JOIN_COOKIE, cleanJoinCode, loginPath } from "@/lib/auth/join-intent";
import { signInSchema, signUpSchema } from "@/lib/auth/schemas";

export interface AuthState {
  /** Whole-form failure, e.g. wrong password. */
  error?: string;
  /** Per-field failures, keyed by input name. */
  fieldErrors?: Record<string, string>;
  /** Success text shown in place of the form, e.g. "check your email". */
  message?: string;
  /**
   * What they typed, echoed back so a rejected submit does not empty the form.
   * Never includes the password — a re-rendered value would put it in the HTML.
   */
  values?: { email?: string; displayName?: string };
}

/** zod's flattened errors, narrowed to the first message per field. */
function firstErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * Where Supabase should send people back to after they click the link in a
 * confirmation email. Derived from the request rather than hardcoded, so it is
 * right on localhost, on a Vercel preview and in production alike.
 */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

/** Keep a room invite across the trip to Google and back; drop a stale one if there is none. */
async function rememberInvite(formData: FormData): Promise<string | null> {
  const jar = await cookies();
  const invite = cleanJoinCode(formData.get("join"));
  if (!invite) {
    jar.delete(JOIN_COOKIE);
    return null;
  }
  jar.set(JOIN_COOKIE, invite, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30,
  });
  return invite;
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const values = { email: String(formData.get("email") ?? "") };

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: firstErrors(parsed.error.issues), values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately one message for both "no such account" and "wrong
    // password" — telling them apart tells a stranger which emails are
    // registered here.
    return {
      error: "That email and password do not match an account.",
      values,
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const values = {
    email: String(formData.get("email") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
  };

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    return { fieldErrors: firstErrors(parsed.error.issues), values };
  }

  const { email, password, displayName } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The `on_auth_user_created` trigger reads display_name out of here to
      // seed public.profiles, so the app never meets a user without a profile.
      data: { display_name: displayName },
      emailRedirectTo: `${await origin()}/auth/confirm`,
    },
  });

  if (error) {
    return { error: error.message, values };
  }

  // With email confirmation on, Supabase returns a user but no session. Say so
  // rather than dropping them on a signed-out home page wondering what broke.
  if (data.user && !data.session) {
    return {
      message: `Almost there — we sent a confirmation link to ${email}. Click it and you are in.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Start the Google handshake.
 *
 * Nothing is emailed on this path — Google has already proven the person owns
 * the address, so Supabase skips confirmation entirely. That is why this route
 * is not subject to the email rate limit the password path lives under.
 *
 * signInWithOAuth does not sign anybody in; it returns the URL to send them
 * to, and stashes the PKCE verifier in a cookie that /auth/callback needs.
 *
 * A room invite (the form's `join` field) rides along in a cookie of its own.
 * It is not put in `redirectTo`: Supabase only honours redirect URLs on its
 * allow-list, and a changed URL could quietly break sign-in for everyone.
 */
export async function signInWithGoogle(formData: FormData): Promise<never> {
  const invite = await rememberInvite(formData);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await origin()}/auth/callback`,
      queryParams: {
        // Ask Google for a refresh token, and let people pick which account
        // rather than silently reusing whichever one the browser remembers.
        access_type: "offline",
        prompt: "consent select_account",
      },
    },
  });

  if (error || !data.url) {
    redirect(loginPath(invite, "google-unavailable"));
  }

  redirect(data.url);
}

/**
 * Start the Facebook handshake. Same shape as signInWithGoogle, and the
 * same reasoning about not going through the email path — but Facebook
 * does NOT bundle email into its basic login the way Google's OIDC scopes
 * do, so it has to be asked for explicitly. `getUser()` (lib/auth/dal.ts)
 * treats a signed-in user with no email as signed out, so without this a
 * Facebook account that had the email permission declined would be
 * invisibly broken rather than clearly rejected.
 */
export async function signInWithFacebook(): Promise<never> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "facebook",
    options: {
      redirectTo: `${await origin()}/auth/callback`,
      scopes: "email,public_profile",
    },
  });

  if (error || !data.url) {
    redirect("/login?error=facebook-unavailable");
  }

  redirect(data.url);
}
