import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/fairy/auth-form";
import { AuthCard, OrDivider } from "@/components/fairy/auth-card";
import { GoogleButton } from "@/components/fairy/google-button";
import { signIn } from "@/lib/auth/actions";
import { getUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Sign in · FairySplit" };

const PROBLEMS: Record<string, string> = {
  "link-invalid": "That confirmation link was not readable. Try signing in.",
  "link-expired":
    "That confirmation link has expired or was already used. Sign in, or create the account again.",
  "google-cancelled": "No problem — nothing was signed in. Try again whenever.",
  "google-unavailable":
    "Google sign-in did not come back to us properly. Try again, or use your email and password below.",
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
      <GoogleButton label="Continue with Google" />
      <OrDivider />
      <AuthForm mode="sign-in" action={signIn} />
    </AuthCard>
  );
}
