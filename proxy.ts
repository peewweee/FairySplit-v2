import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Session refresh, and nothing else.
 *
 * Next 16 renamed Middleware to Proxy, and the docs are explicit that Proxy
 * "should not be used as a full session management or authorization solution".
 * So this file does exactly one job: hand Supabase the request cookies, let it
 * rotate an expiring token, and copy whatever it wrote onto the response. The
 * question "is this person allowed to see this?" is answered in
 * lib/auth/dal.ts, next to the data, where it cannot be skipped by a route
 * that the matcher happens not to cover.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Onto the request first, so anything rendering downstream in this
        // same pass sees the refreshed token rather than the stale one.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not put anything between creating the client and this call. getUser()
  // is what actually triggers the refresh, and any await in between can let a
  // request through holding a token that has already expired.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — those never carry a
     * session and refreshing on each one just burns time.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
