import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { onSignInRequest, requestSignIn } from "./sign-in-request";

// The module talks to `window`; tests run in Node, so give it the one thing it needs.
const realWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = new EventTarget();
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = realWindow;
});

describe("the sign-in request", () => {
  it("tells the popup, once per request", () => {
    let asked = 0;
    onSignInRequest(() => {
      asked += 1;
    });
    requestSignIn();
    requestSignIn();
    expect(asked).toBe(2);
  });

  it("stops telling a popup that has gone away", () => {
    let asked = 0;
    const stop = onSignInRequest(() => {
      asked += 1;
    });
    requestSignIn();
    stop();
    requestSignIn();
    expect(asked).toBe(1);
  });

  it("does nothing, and does not throw, when nothing is listening", () => {
    expect(() => requestSignIn()).not.toThrow();
  });
});
