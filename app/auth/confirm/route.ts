import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * The landing point for the link in a confirmation email. Supabase appends a
 * one-time token; exchanging it here is what turns a pending signup into a
 * real session, and the cookies it sets ride back on this response.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (!tokenHash || !type) {
    redirect("/login?error=link-invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  // Expired and already-used links land here too, which is why the message is
  // about the link rather than about the account.
  if (error) {
    redirect("/login?error=link-expired");
  }

  redirect(next);
}
