"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { repo } from "@/lib/data";
import { useMounted, useRepoAction, useRepoQuery, useResetOnChange } from "@/lib/data/hooks";
import { parseField, personNameSchema } from "@/lib/forms/schemas";

/**
 * "Who are you" (Phase 1).
 *
 * The name is only a label - there are no accounts in Phase A. It seeds the
 * first member when you create a room, so the room isn't born empty.
 */
/**
 * Routes where this must stay out of the way. Being asked "who are you? No
 * account, no password" on top of a Create Account form reads as a
 * contradiction, and it opens itself unprompted on a first visit — which is
 * exactly when somebody is most likely to be on one of these pages.
 */
const AUTH_ROUTES = ["/login", "/signup", "/auth"];

export function WhoAreYou() {
  const pathname = usePathname();
  const mounted = useMounted();
  const identity = useRepoQuery(() => repo.getIdentity(), []);
  const [manuallyOpen, setManuallyOpen] = useState(false);

  // First visit: ask, unprompted and underivably. Derived from the query rather
  // than pushed in by an effect, so there is no render where the app looks
  // ready but hasn't asked yet.
  const firstTime = !identity.loading && identity.data === null;
  const open = firstTime || manuallyOpen;

  if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) return null;

  if (!mounted || identity.loading) {
    return <div className="h-8 w-28 animate-pulse rounded-lg bg-fairy-screen" />;
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setManuallyOpen(true)}
        className="text-fairy-grey-strong hover:text-fairy-ink"
      >
        <UserRound className="size-3.5" aria-hidden />
        {identity.data?.name ?? "Set your name"}
      </Button>
      <IdentityDialog
        open={open}
        onOpenChange={setManuallyOpen}
        current={identity.data?.name ?? ""}
        firstTime={firstTime}
      />
    </>
  );
}

function IdentityDialog({
  open,
  onOpenChange,
  current,
  firstTime,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string;
  firstTime: boolean;
}) {
  const [name, setName] = useState(current);
  const [message, setMessage] = useState<string | null>(null);
  const action = useRepoAction();

  // Reopening starts from what is stored, never from a half-typed abandon.
  if (useResetOnChange(`${open}|${current}`) && open) {
    setName(current);
    setMessage(null);
  }

  async function save() {
    const parsed = parseField(personNameSchema, name);
    if (!parsed.ok) {
      setMessage(parsed.message);
      return;
    }
    const saved = await action.run(() => repo.setIdentity(parsed.value));
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let the very first prompt be dismissed into a nameless state.
        if (!next && firstTime) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm" showCloseButton={!firstTime}>
        <DialogHeader>
          <DialogTitle className="text-[21px] text-fairy-ink">
            {firstTime ? "Hello — who are you?" : "Change your name"}
          </DialogTitle>
          <DialogDescription>
            Just a label so your housemates know which row is yours. No account,
            no password.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="identity-name">Your name</Label>
          <Input
            id="identity-name"
            autoFocus
            value={name}
            placeholder="e.g. Phoebe"
            onChange={(e) => {
              setName(e.target.value);
              setMessage(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            aria-invalid={message !== null}
            aria-describedby={message ? "identity-name-error" : undefined}
          />
          {(message ?? action.error) && (
            <p id="identity-name-error" className="text-[11.5px] font-semibold text-fairy-danger">
              {message ?? action.error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button size="lg" onClick={() => void save()} disabled={action.pending}>
            {action.pending ? "Saving…" : "That's me"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
