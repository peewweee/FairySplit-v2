import { describe, expect, it } from "vitest";

import { afterSignInPath, cleanJoinCode, loginPath } from "./join-intent";

describe("cleanJoinCode", () => {
  it("accepts a real code, however it was typed", () => {
    expect(cleanJoinCode("K7QM2P")).toBe("K7QM2P");
    expect(cleanJoinCode("k7qm2p")).toBe("K7QM2P");
    expect(cleanJoinCode(" k7q m2p ")).toBe("K7QM2P");
  });

  it("rejects anything that is not a code we could have minted", () => {
    expect(cleanJoinCode("K7QM2")).toBeNull(); // too short
    expect(cleanJoinCode("K7QM2PX")).toBeNull(); // too long
    expect(cleanJoinCode("K7QM0P")).toBeNull(); // 0 is never in a code
    expect(cleanJoinCode("K7QMIP")).toBeNull(); // nor I
    expect(cleanJoinCode("")).toBeNull();
  });

  it("rejects things that are not strings, and attempts to smuggle a path", () => {
    expect(cleanJoinCode(undefined)).toBeNull();
    expect(cleanJoinCode(["K7QM2P"])).toBeNull();
    expect(cleanJoinCode("//evil.test")).toBeNull();
    expect(cleanJoinCode("/rooms/x?join=K7QM2P")).toBeNull();
  });
});

describe("loginPath", () => {
  it("is plain /login with nothing to carry", () => {
    expect(loginPath(null)).toBe("/login");
  });

  it("remembers the invite", () => {
    expect(loginPath("K7QM2P")).toBe("/login?join=K7QM2P");
  });

  it("keeps the invite alongside an error, so a retry still has it", () => {
    expect(loginPath("K7QM2P", "google-cancelled")).toBe(
      "/login?error=google-cancelled&join=K7QM2P",
    );
    expect(loginPath(null, "google-unavailable")).toBe("/login?error=google-unavailable");
  });
});

describe("afterSignInPath", () => {
  it("opens the Join dialog for an invite, and the plain rooms page otherwise", () => {
    expect(afterSignInPath("K7QM2P")).toBe("/?join=K7QM2P");
    expect(afterSignInPath(null)).toBe("/");
  });
});
