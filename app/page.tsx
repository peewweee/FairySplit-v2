import { RoomsScreen } from "@/components/fairy/rooms-screen";
import { Splash } from "@/components/fairy/splash";
import { EMAIL_PASSWORD_ENABLED } from "@/lib/auth/config";
import { getUser } from "@/lib/auth/dal";
import { cleanJoinCode } from "@/lib/auth/join-intent";
import { signInProblem } from "@/lib/auth/problems";

export default async function Home(props: PageProps<"/">) {
  const { join, error } = await props.searchParams;

  // Signed out, this is the landing page. Every room read is RLS-scoped to the
  // signed-in account and `anon` has no table grants at all, so a signed-out
  // visitor would not see an empty list, they would see a permission error: the
  // rooms are only ever rendered for somebody signed in. An invite link
  // (`/?join=CODE`) and a sign-in that just failed (`/?error=…`) are both carried
  // into the sign-in popup.
  if (!(await getUser())) {
    return (
      <Splash
        invite={cleanJoinCode(join)}
        problem={signInProblem(error, EMAIL_PASSWORD_ENABLED)}
      />
    );
  }

  return <RoomsScreen />;
}
