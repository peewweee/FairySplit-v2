import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

/**
 * Just the icon. What the account is called lives in the menu, under the name
 * housemates see, so the header does not need to say it twice. Only ever rendered
 * for somebody signed in: signed out, the header has nothing to offer but the
 * wordmark, and the way in is the "Clock me in" button on the landing page.
 */
export function SignOutButton() {
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
