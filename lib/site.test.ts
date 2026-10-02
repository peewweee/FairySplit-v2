import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function load() {
  return import("./site");
}

describe("inviteLink", () => {
  it("points at the live site by default", async () => {
    const { inviteLink } = await load();
    expect(inviteLink("K7QM2P")).toBe("https://fairy-split-v2.vercel.app/?join=K7QM2P");
  });

  it("is empty until the room has a code", async () => {
    const { inviteLink } = await load();
    expect(inviteLink("")).toBe("");
  });

  it("ignores the address the app is being browsed from", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    const { inviteLink } = await load();
    expect(inviteLink("K7QM2P")).not.toContain("localhost");
  });

  it("follows NEXT_PUBLIC_SITE_URL, with a trailing slash trimmed", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://fairysplit.example/");
    const { inviteLink } = await load();
    expect(inviteLink("K7QM2P")).toBe("https://fairysplit.example/?join=K7QM2P");
  });
});
