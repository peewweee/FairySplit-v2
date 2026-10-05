import { beforeEach, describe, expect, it, vi } from "vitest";

const world = vi.hoisted(() => {
  class Redirected extends Error {
    constructor(readonly url: string) {
      super(`redirected to ${url}`);
    }
  }
  return {
    Redirected,
    cookies: new Map<string, string>(),
    cookieWrites: [] as { name: string; value: string; options: Record<string, unknown> }[],
    oauthCalls: [] as { provider: string; options: { redirectTo: string } }[],
    oauthResult: { data: { url: null as string | null }, error: null as unknown },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      world.cookies.has(name) ? { name, value: world.cookies.get(name) } : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => {
      world.cookies.set(name, value);
      world.cookieWrites.push({ name, value, options });
    },
    delete: (name: string) => {
      world.cookies.delete(name);
    },
    getAll: () => [],
  }),
  headers: async () =>
    new Headers({ host: "fairy-split-v2.vercel.app", "x-forwarded-proto": "https" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new world.Redirected(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithOAuth: async (args: { provider: string; options: { redirectTo: string } }) => {
        world.oauthCalls.push(args);
        return world.oauthResult;
      },
    },
  }),
}));

import { signInWithGoogle } from "./actions";

const GOOGLE = "https://accounts.google.com/o/oauth2/v2/auth?state=x";

/** Press the Google button with these form fields; return where it sent the person. */
async function press(fields: Record<string, string> = {}): Promise<string> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  try {
    await signInWithGoogle(form);
  } catch (err) {
    if (err instanceof world.Redirected) return err.url;
    throw err;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  world.cookies.clear();
  world.cookieWrites.length = 0;
  world.oauthCalls.length = 0;
  world.oauthResult = { data: { url: GOOGLE }, error: null };
});

describe("signInWithGoogle", () => {
  it("sends people to Google, with the redirect URL exactly as Supabase allows it", async () => {
    expect(await press({ join: "K7QM2P" })).toBe(GOOGLE);
    // No query on it: Supabase only honours addresses on its allow-list.
    expect(world.oauthCalls[0].options.redirectTo).toBe(
      "https://fairy-split-v2.vercel.app/auth/callback",
    );
  });

  it("keeps a room invite in a short-lived cookie", async () => {
    await press({ join: "k7q m2p" });
    expect(world.cookieWrites).toEqual([
      {
        name: "fairysplit_join",
        value: "K7QM2P",
        options: expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 1800,
        }),
      },
    ]);
  });

  it("ignores an invite that is not a real code, and clears a stale one", async () => {
    world.cookies.set("fairysplit_join", "ABCDEF"); // left over from an earlier attempt
    await press({ join: "//evil.test" });
    expect(world.cookieWrites).toEqual([]);
    expect(world.cookies.has("fairysplit_join")).toBe(false);
  });

  it("clears a stale invite when signing in without one", async () => {
    world.cookies.set("fairysplit_join", "ABCDEF");
    await press();
    expect(world.cookies.has("fairysplit_join")).toBe(false);
  });

  it("keeps the invite for the retry if Google could not be started", async () => {
    world.oauthResult = { data: { url: null }, error: { message: "boom" } };
    expect(await press({ join: "K7QM2P" })).toBe("/login?error=google-unavailable&join=K7QM2P");
  });
});
