import Link from "next/link";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { getUser } from "@/lib/auth/dal";

/**
 * Account state in the header. A Server Component, so the signed-out markup is
 * never briefly shown to somebody who is in fact signed in.
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

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="hidden max-w-[160px] truncate text-[12px] font-semibold text-fairy-grey-strong sm:block"
        title={user.email}
      >
        {user.displayName || user.email}
      </span>
      <form action={signOut}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-fairy-grey-strong hover:text-fairy-ink"
        >
          <LogOut className="size-3.5" aria-hidden />
          <span className="sr-only sm:not-sr-only">Sign out</span>
        </Button>
      </form>
    </div>
  );
}
