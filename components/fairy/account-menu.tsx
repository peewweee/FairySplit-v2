import Link from "next/link";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { getUser } from "@/lib/auth/dal";

/**
 * Account state in the header: "Sign in" when signed out, a sign-out icon when
 * signed in. A Server Component, so the signed-out markup is never briefly shown
 * to somebody who is in fact signed in.
 *
 * Note this is separate from <WhoAreYou>, which is the per-room display name
 * Phase A runs on. They converge when the repository moves to Supabase; until
 * then an account is how you get back in, and the name is what a room calls you.
 */
export async function AccountMenu() {
  const user = await getUser();

  if (!user) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link href="/login" className="text-fairy-grey-strong hover:text-fairy-ink">
          Sign in
        </Link>
      </Button>
    );
  }

  // Just the icon. What the account is called lives in the menu, under the name
  // housemates see, so the header does not need to say it twice.
  return (
    <form action={signOut}>
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label="Sign out"
        title="Sign out"
        className="text-fairy-grey-strong hover:text-fairy-ink"
      >
        <LogOut className="size-3.5" aria-hidden />
      </Button>
    </form>
  );
}
