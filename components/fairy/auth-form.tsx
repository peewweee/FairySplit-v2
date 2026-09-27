"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AuthState } from "@/lib/auth/actions";

type Action = (state: AuthState, formData: FormData) => Promise<AuthState>;

const EMPTY: AuthState = {};

export function AuthForm({
  mode,
  action,
}: {
  mode: "sign-in" | "sign-up";
  action: Action;
}) {
  const [state, formAction] = useActionState(action, EMPTY);
  const signingUp = mode === "sign-up";

  // Success replaces the form outright. Leaving the fields on screen after
  // "check your email" invites people to submit again and wonder why nothing
  // new arrives.
  if (state.message) {
    return (
      <div className="rounded-xl border border-fairy-hair bg-fairy-screen p-5">
        <p className="text-[13.5px] leading-[1.6] font-medium text-fairy-ink">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      {signingUp && (
        <AuthField
          id="displayName"
          name="displayName"
          label="Your name"
          type="text"
          autoComplete="name"
          placeholder="Phoebe"
          helper="Shown on your account. Each room can still call you something else."
          error={state.fieldErrors?.displayName}
          defaultValue={state.values?.displayName}
        />
      )}

      <AuthField
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={state.fieldErrors?.email}
        defaultValue={state.values?.email}
      />

      <AuthField
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete={signingUp ? "new-password" : "current-password"}
        helper={signingUp ? "At least 8 characters." : undefined}
        error={state.fieldErrors?.password}
      />

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-fairy-danger/8 px-3 py-2 text-[12px] font-semibold text-fairy-danger"
        >
          {state.error}
        </p>
      )}

      <Submit label={signingUp ? "Create account" : "Sign in"} />

      <p className="text-center text-[12px] font-medium text-fairy-grey-strong">
        {signingUp ? "Already have an account? " : "New here? "}
        <Link
          href={signingUp ? "/login" : "/signup"}
          className="font-bold text-fairy-rose underline underline-offset-2"
        >
          {signingUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  // useFormStatus reads the parent form, so this has to be its own component.
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 h-10 w-full">
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {pending ? "One moment…" : label}
    </Button>
  );
}

function AuthField({
  id,
  name,
  label,
  type,
  autoComplete,
  placeholder,
  helper,
  error,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  placeholder?: string;
  helper?: string;
  error?: string;
  defaultValue?: string;
}) {
  const helperId = helper ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="grid gap-1.5">
      <Label
        htmlFor={id}
        className="text-[12.5px] font-bold tracking-[-0.01em] text-fairy-ink"
      >
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={cn(helperId, errorId) || undefined}
        className="h-10"
      />
      {helper && (
        <p
          id={helperId}
          className="text-[11.5px] leading-[1.5] font-medium text-fairy-grey"
        >
          {helper}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[11.5px] font-semibold text-fairy-danger">
          {error}
        </p>
      )}
    </div>
  );
}
