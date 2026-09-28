"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { signInWithFacebook } from "@/lib/auth/actions";

export function FacebookButton({ label }: { label: string }) {
  return (
    <form action={signInWithFacebook}>
      <Inner label={label} />
    </form>
  );
}

function Inner({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      className="h-10 w-full bg-white"
    >
      <FacebookMark />
      {pending ? "Taking you to Facebook…" : label}
    </Button>
  );
}

/** Facebook's "f" mark, per their branding rules — never recoloured. */
function FacebookMark() {
  return (
    <svg className="size-4" viewBox="0 0 36 36" aria-hidden focusable="false">
      <path
        fill="#1877F2"
        d="M36 18c0-9.94-8.06-18-18-18S0 8.06 0 18c0 8.98 6.58 16.42 15.19 17.78V23.2h-4.57V18h4.57v-3.97c0-4.51 2.69-7 6.8-7 1.97 0 4.03.35 4.03.35v4.43h-2.27c-2.24 0-2.94 1.39-2.94 2.81V18h5.01l-.8 5.2h-4.21v12.58C29.42 34.42 36 26.98 36 18Z"
      />
      <path
        fill="#FFFFFF"
        d="M25.01 23.2 25.81 18h-5.01v-3.38c0-1.42.7-2.81 2.94-2.81h2.27V7.38s-2.06-.35-4.03-.35c-4.11 0-6.8 2.49-6.8 7V18h-4.57v5.2h4.57v12.58a18.18 18.18 0 0 0 5.63 0V23.2h4.21Z"
      />
    </svg>
  );
}
