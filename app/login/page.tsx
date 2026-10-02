import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/fairy/auth-form";
import { AuthCard, OrDivider } from "@/components/fairy/auth-card";
import { GoogleButton } from "@/components/fairy/google-button";
import { FacebookButton } from "@/components/fairy/facebook-button";
import { signIn } from "@/lib/auth/actions";
import { getUser } from "@/lib/auth/dal";
import { EMAIL_PASSWORD_ENABLED, FACEBOOK_ENABLED } from "@/lib/auth/config";

export const metadata: Metadata = { title: "Sign in · FairySplit" };

const PROBLEMS: Record<string, string> = {
  "link-invalid": "That confirmation link was not readable. Try signing in.",
  "link-expired":
    "That confirmation link has expired or was already used. Sign in, or create the account again.",
  "google-cancelled": "No problem — nothing was signed in. Try again whenever.",
  "google-unavailable": EMAIL_PASSWORD_ENABLED
    ? "Google sign-in did not come back to us properly. Try again, or use your email and password below."
    : "Google sign-in did not come back to us properly. Try again in a moment.",
  "facebook-cancelled": "No problem — nothing was signed in. Try again whenever.",
  "facebook-unavailable": EMAIL_PASSWORD_ENABLED
    ? "Facebook sign-in did not come back to us properly. Try again, or use your email and password below."
    : "Facebook sign-in did not come back to us properly. Try again in a moment.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getUser()) redirect("/");

  const { error } = await props.searchParams;
  const notice = typeof error === "string" ? PROBLEMS[error] : undefined;

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to reach your rooms from any device."
      notice={notice}
    >
      <div className="grid gap-2.5">
        <GoogleButton label="Continue with Google" />
        {FACEBOOK_ENABLED && <FacebookButton label="Continue with Facebook" />}
      </div>
      {EMAIL_PASSWORD_ENABLED && (
        <>
          <OrDivider />
          <AuthForm mode="sign-in" action={signIn} />
        </>
      )}
    </AuthCard>
  );
}
