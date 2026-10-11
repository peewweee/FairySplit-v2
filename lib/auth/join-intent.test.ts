import { describe, expect, it } from "vitest";

import { afterSignInPath, cleanJoinCode, landingPath } from "./join-intent";

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

describe("landingPath", () => {
  it("is the plain landing page with nothing to carry", () => {
    expect(landingPath(null)).toBe("/");
  });

  it("remembers the invite", () => {
    expect(landingPath("K7QM2P")).toBe("/?join=K7QM2P");
  });

  it("keeps the invite alongside an error, so a retry still has it", () => {
    expect(landingPath("K7QM2P", "google-cancelled")).toBe(
      "/?error=google-cancelled&join=K7QM2P",
    );
    expect(landingPath(null, "google-unavailable")).toBe("/?error=google-unavailable");
  });

  it("never points at a sign-in page, which no longer exists", () => {
    for (const path of [landingPath(null), landingPath("K7QM2P", "link-expired")]) {
      expect(path.startsWith("/login")).toBe(false);
      expect(path.startsWith("/signup")).toBe(false);
    }
  });
});

describe("afterSignInPath", () => {
  it("opens the Join dialog for an invite, and the plain rooms page otherwise", () => {
    expect(afterSignInPath("K7QM2P")).toBe("/?join=K7QM2P");
    expect(afterSignInPath(null)).toBe("/");
  });
});
