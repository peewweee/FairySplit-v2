import { describe, expect, it } from "vitest";

import { signInProblem } from "./problems";

describe("signInProblem", () => {
  it("has something to say for every way a sign-in comes back unhappy", () => {
    for (const code of [
      "link-invalid",
      "link-expired",
      "google-cancelled",
      "google-unavailable",
      "facebook-cancelled",
      "facebook-unavailable",
    ]) {
      expect(signInProblem(code, false)).toEqual(expect.any(String));
      expect(signInProblem(code, false)?.length).toBeGreaterThan(10);
    }
  });

  it("says nothing for a code it does not know, whatever the URL put there", () => {
    expect(signInProblem("something-else", false)).toBeUndefined();
    expect(signInProblem("", false)).toBeUndefined();
    expect(signInProblem(undefined, false)).toBeUndefined();
    expect(signInProblem(["google-cancelled"], false)).toBeUndefined();
    expect(signInProblem(42, false)).toBeUndefined();
  });

  it("does not echo what it was given, and treats object keys as unknown codes", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    expect(signInProblem(hostile, false)).toBeUndefined();
    for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(signInProblem(key, false)).toBeUndefined();
    }
  });

  it("only points at the email form when that form is on", () => {
    expect(signInProblem("google-unavailable", true)).toContain("email and password");
    expect(signInProblem("google-unavailable", false)).not.toContain("email");
    expect(signInProblem("facebook-unavailable", true)).toContain("email and password");
    expect(signInProblem("facebook-unavailable", false)).not.toContain("email");
  });

  it("treats a cancelled Google or Facebook sign-in the same way: no harm done", () => {
    expect(signInProblem("google-cancelled", false)).toBe(signInProblem("facebook-cancelled", false));
    expect(signInProblem("google-cancelled", false)).toContain("nothing was signed in");
  });
});
