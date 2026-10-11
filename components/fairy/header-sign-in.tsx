"use client";

import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requestSignIn } from "@/lib/auth/sign-in-request";

/**
 * "Sign in" at the top right of the landing page.
 *
 * It asks the page's popup to open (see lib/auth/sign-in-request.ts) rather than
 * owning one, so the invite or the failed sign-in the page knows about goes through
 * it too. Only on the landing page: that is where the popup is, and a "Sign in"
 * that did nothing anywhere else would be worse than none.
 */
export function HeaderSignIn() {
  if (usePathname() !== "/") return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-haspopup="dialog"
      onClick={requestSignIn}
      className="text-fairy-grey-strong hover:text-fairy-ink"
    >
      Sign in
    </Button>
  );
}
