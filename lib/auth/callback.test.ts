import { NextRequest } from "next/server";
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
    exchangeError: null as unknown,
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      world.cookies.has(name) ? { name, value: world.cookies.get(name) } : undefined,
    delete: (name: string) => {
      world.cookies.delete(name);
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new world.Redirected(url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession: async () => ({ error: world.exchangeError }) },
  }),
}));

import { GET } from "@/app/auth/callback/route";

/** Come back from Google with this query; return where the person ends up. */
async function comeBack(query: string): Promise<string> {
  try {
    await GET(new NextRequest(`https://fairy-split-v2.vercel.app/auth/callback${query}`));
  } catch (err) {
    if (err instanceof world.Redirected) return err.url;
    throw err;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  world.cookies.clear();
  world.exchangeError = null;
});

describe("/auth/callback", () => {
  it("lands an invited person on the Join dialog, and forgets the invite", async () => {
    world.cookies.set("fairysplit_join", "K7QM2P");
    expect(await comeBack("?code=abc")).toBe("/?join=K7QM2P");
    expect(world.cookies.has("fairysplit_join")).toBe(false);
  });

  it("lands everybody else on the rooms page, or where `next` says if it is ours", async () => {
    expect(await comeBack("?code=abc")).toBe("/");
    expect(await comeBack("?code=abc&next=/rooms/x")).toBe("/rooms/x");
    expect(await comeBack("?code=abc&next=//evil.test")).toBe("/");
  });

  it("ignores a cookie that is not a real code", async () => {
    world.cookies.set("fairysplit_join", "//evil.test");
    expect(await comeBack("?code=abc")).toBe("/");
  });

  it("keeps the invite through a cancelled sign-in", async () => {
    world.cookies.set("fairysplit_join", "K7QM2P");
    expect(await comeBack("?error=access_denied")).toBe(
      "/login?error=google-cancelled&join=K7QM2P",
    );
  });

  it("keeps the invite when there is no code or the swap fails", async () => {
    world.cookies.set("fairysplit_join", "K7QM2P");
    expect(await comeBack("")).toBe("/login?error=google-unavailable&join=K7QM2P");

    world.exchangeError = { message: "bad verifier" };
    expect(await comeBack("?code=abc")).toBe("/login?error=google-unavailable&join=K7QM2P");
  });

  it("sends a failed sign-in with no invite to a plain error page", async () => {
    world.exchangeError = { message: "bad verifier" };
    expect(await comeBack("?code=abc")).toBe("/login?error=google-unavailable");
  });
});
