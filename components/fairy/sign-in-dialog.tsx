"use client";

import { useEffect, useState } from "react";

import { AuthForm } from "@/components/fairy/auth-form";
import { FacebookButton } from "@/components/fairy/facebook-button";
import { GoogleButton } from "@/components/fairy/google-button";
import { SparkleBurst, useSparkle } from "@/components/fairy/sparkle-burst";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { signIn, signUp } from "@/lib/auth/actions";
import { onSignInRequest } from "@/lib/auth/sign-in-request";

/**
 * "Clock me in": the button on the landing page, and the sign-in popup it opens.
 * There is no sign-in page any more; this is the whole of it. The header's "Sign in"
 * opens this same popup, by asking (lib/auth/sign-in-request.ts).
 *
 * The popup opens by itself when a sign-in has just failed, so the message is
 * where the person is already looking. A room invite rides along on the Google
 * form, so the trip to Google and back does not lose it.
 *
 * The Facebook and email + password paths are still parked behind their flags
 * (lib/auth/config.ts). When one comes back it appears in here; no page is needed.
 */
export function ClockMeIn({
  invite,
  problem,
  showFacebook,
  showEmailPassword,
}: {
  invite: string | null;
  /** What went wrong with a sign-in that just failed, if one did. */
  problem?: string;
  showFacebook: boolean;
  showEmailPassword: boolean;
}) {
  const [open, setOpen] = useState(Boolean(problem));
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const { burst, sparkle } = useSparkle();

  // The header's "Sign in" lives in the layout, which knows nothing of an invite or a
  // failed sign-in, so it asks this popup to open rather than owning one.
  useEffect(() => onSignInRequest(() => setOpen(true)), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="relative min-w-44" onClick={sparkle}>
          <SparkleBurst burst={burst} />
          Clock me in
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[21px] text-fairy-ink">Welcome back!</DialogTitle>
          <DialogDescription>Sign in to get to your rooms.</DialogDescription>
        </DialogHeader>

        {problem && (
          <p
            role="status"
            className="border border-fairy-hair bg-fairy-screen px-3 py-2.5 text-[12px] leading-[1.5] font-semibold text-fairy-ink-2"
          >
            {problem}
          </p>
        )}

        <div className="grid gap-2.5">
          <GoogleButton label="Continue with Google" invite={invite} />
          {showFacebook && <FacebookButton label="Continue with Facebook" />}
        </div>

        {showEmailPassword && (
          <>
            <OrDivider />
            <AuthForm
              key={mode}
              mode={mode}
              action={mode === "sign-in" ? signIn : signUp}
              onSwitchMode={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Separates the one-tap path from the typing path. Decorative, so it is hidden
 * from screen readers — the two forms already read as distinct.
 */
function OrDivider() {
  return (
    <div aria-hidden className="flex items-center gap-3">
      <span className="h-px flex-1 bg-fairy-hair" />
      <span className="text-[11px] font-bold text-fairy-grey">or</span>
      <span className="h-px flex-1 bg-fairy-hair" />
    </div>
  );
}
