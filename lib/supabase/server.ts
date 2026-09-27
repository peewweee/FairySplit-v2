import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * The server-side client, for Server Components, Server Actions and Route
 * Handlers. `cookies()` is async in this version of Next, so this is too — and
 * a fresh client is built per request, because the cookie jar is per request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components are not allowed to set cookies. That is fine:
          // proxy.ts refreshes the session on every request, so the write here
          // is only ever a duplicate of one that already happened.
        }
      },
    },
  });
}
