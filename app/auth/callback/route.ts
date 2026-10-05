import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { JOIN_COOKIE, afterSignInPath, cleanJoinCode, loginPath } from "@/lib/auth/join-intent";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google sends people back to.
 *
 * The `code` here is useless on its own — it only becomes a session when
 * swapped for one alongside the PKCE verifier cookie that signInWithGoogle
 * left behind. That swap happens below, and the session cookies it sets ride
 * home on this response.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  // A room invite that went out to Google with them. Kept on every way home,
  // including the unhappy ones, so trying again does not lose it.
  const jar = await cookies();
  const invite = cleanJoinCode(jar.get(JOIN_COOKIE)?.value);

  // Closing Google's window, or refusing the consent screen, lands here with
  // an error and no code. Not a fault worth alarming anybody about.
  if (oauthError) {
    redirect(loginPath(invite, "google-cancelled"));
  }

  if (!code) {
    redirect(loginPath(invite, "google-unavailable"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirect(loginPath(invite, "google-unavailable"));
  }

  // Signed in: the invite has done its job, so it must not linger and
  // redirect somebody else who signs in on this browser later.
  jar.delete(JOIN_COOKIE);
  redirect(invite ? afterSignInPath(invite) : safeNext(searchParams.get("next")));
}

/**
 * Only ever our own paths. An attacker who can put `?next=https://evil.test`
 * on the end of this URL would otherwise have a link that passes through a
 * real sign-in and then hands the person to somebody else's page.
 */
function safeNext(next: string | null): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  return next;
}
