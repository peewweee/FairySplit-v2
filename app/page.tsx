import { RoomsScreen } from "@/components/fairy/rooms-screen";
import { requireUser } from "@/lib/auth/dal";

export default async function Home() {
  // Every room read is RLS-scoped to the signed-in account, and `anon` has
  // no table grants at all — a signed-out visitor would not see an empty
  // list, they would see a permission error. Gate here instead.
  await requireUser();
  return <RoomsScreen />;
}
