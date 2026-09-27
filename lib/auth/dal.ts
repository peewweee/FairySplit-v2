// No `server-only` import: the package is not a dependency here, and this
// module reaches for `next/headers` (via lib/supabase/server), which already
// fails the build if a Client Component ever pulls it in.
import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { displayNameFrom } from "@/lib/auth/display-name";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * The one place that answers "who is asking?".
 *
 * Always `getUser()`, never `getSession()`: the session comes straight from a
 * cookie the browser could have edited, whereas getUser() is checked against
 * the auth server. `cache` keeps that to a single round trip per request no
 * matter how many components ask.
 */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.email) return null;

  return {
    id: data.user.id,
    email: data.user.email,
    displayName: displayNameFrom(data.user.user_metadata),
  };
});

/**
 * For pages that make no sense signed out. Returns a user or does not return.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
