import { RoomsScreen } from "@/components/fairy/rooms-screen";
import { requireUser } from "@/lib/auth/dal";
import { cleanJoinCode, loginPath } from "@/lib/auth/join-intent";

export default async function Home(props: PageProps<"/">) {
  // Every room read is RLS-scoped to the signed-in account, and `anon` has
  // no table grants at all — a signed-out visitor would not see an empty
  // list, they would see a permission error. Gate here instead. An invite
  // link (`/?join=CODE`) is passed along so it survives the trip through sign-in.
  const { join } = await props.searchParams;
  await requireUser(loginPath(cleanJoinCode(join)));
  return <RoomsScreen />;
}
