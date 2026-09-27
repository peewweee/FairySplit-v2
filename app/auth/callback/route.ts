import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

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

  // Closing Google's window, or refusing the consent screen, lands here with
  // an error and no code. Not a fault worth alarming anybody about.
  if (oauthError) {
    redirect("/login?error=google-cancelled");
  }

  if (!code) {
    redirect("/login?error=google-unavailable");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirect("/login?error=google-unavailable");
  }

  redirect(safeNext(searchParams.get("next")));
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
