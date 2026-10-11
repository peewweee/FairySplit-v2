import { describe, expect, it } from "vitest";
import { roomIdFromPath } from "@/lib/nav";

describe("roomIdFromPath", () => {
  it("finds the room on its own page and on every page under it", () => {
    expect(roomIdFromPath("/rooms/abc")).toBe("abc");
    expect(roomIdFromPath("/rooms/abc/")).toBe("abc");
    expect(roomIdFromPath("/rooms/abc/settings")).toBe("abc");
    expect(roomIdFromPath("/rooms/abc/logs")).toBe("abc");
    expect(roomIdFromPath("/rooms/abc/bills/xyz")).toBe("abc");
  });

  it("is null on any page that is not inside a room", () => {
    expect(roomIdFromPath("/")).toBeNull();
    expect(roomIdFromPath("/rooms")).toBeNull();
    expect(roomIdFromPath("/rooms/")).toBeNull();
    expect(roomIdFromPath("/auth/callback")).toBeNull();
    expect(roomIdFromPath("/privacy")).toBeNull();
    // A path that merely starts with the letters is not a room.
    expect(roomIdFromPath("/roomsmate/abc")).toBeNull();
  });
});
