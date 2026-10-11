import { describe, expect, it } from "vitest";
import { NAME_MAX, parseField, personNameSchema, roomNameSchema } from "@/lib/forms/schemas";

describe("the name limit", () => {
  it("is one length for rooms and for people", () => {
    expect(NAME_MAX).toBe(40);
  });

  for (const [what, schema] of [
    ["a room name", roomNameSchema],
    ["a display name", personNameSchema],
  ] as const) {
    it(`accepts ${what} of exactly the limit, and refuses one character more`, () => {
      const atLimit = parseField(schema, "a".repeat(NAME_MAX));
      expect(atLimit.ok).toBe(true);

      const over = parseField(schema, "a".repeat(NAME_MAX + 1));
      expect(over.ok).toBe(false);
      if (!over.ok) expect(over.message).toContain(String(NAME_MAX));
    });

    it(`measures ${what} after trimming, so stray spaces never cost a character`, () => {
      const padded = parseField(schema, `  ${"a".repeat(NAME_MAX)}  `);
      expect(padded).toEqual({ ok: true, value: "a".repeat(NAME_MAX) });
    });

    it(`still refuses ${what} that is empty or only spaces`, () => {
      expect(parseField(schema, "").ok).toBe(false);
      expect(parseField(schema, "    ").ok).toBe(false);
    });
  }

  it("keeps the room limit well above the names it was set for", () => {
    // The 60 it replaced would have let this through; a room name this long is
    // what the lower limit exists to stop.
    const sixty = "Room ".repeat(12).trim();
    expect(sixty.length).toBeGreaterThan(NAME_MAX);
    expect(parseField(roomNameSchema, sixty).ok).toBe(false);
  });
});
