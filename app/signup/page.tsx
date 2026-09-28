import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/fairy/auth-form";
import { AuthCard, OrDivider } from "@/components/fairy/auth-card";
import { GoogleButton } from "@/components/fairy/google-button";
import { FacebookButton } from "@/components/fairy/facebook-button";
import { signUp } from "@/lib/auth/actions";
import { getUser } from "@/lib/auth/dal";
import { EMAIL_PASSWORD_ENABLED } from "@/lib/auth/config";

export const metadata: Metadata = { title: "Create an account · FairySplit" };

export default async function SignUpPage() {
  if (await getUser()) redirect("/");

  return (
    <AuthCard
      title="Create your account"
      subtitle="An account is what lets a join code reach your housemates' phones."
    >
      <div className="grid gap-2.5">
        <GoogleButton label="Sign up with Google" />
        <FacebookButton label="Sign up with Facebook" />
      </div>
      {EMAIL_PASSWORD_ENABLED && (
        <>
          <OrDivider />
          <AuthForm mode="sign-up" action={signUp} />
        </>
      )}
    </AuthCard>
  );
}
