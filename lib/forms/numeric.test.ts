import { describe, expect, it } from "vitest";
import { optionalHoursSchema, optionalRateSchema } from "@/lib/forms/numeric";
import { parseField } from "@/lib/forms/schemas";

describe("the electricity rate field", () => {
  it("turns a typed peso rate into millicents", () => {
    expect(parseField(optionalRateSchema, "14.86")).toEqual({ ok: true, value: 1_486_000 });
  });

  it("stays blank for the simple split", () => {
    expect(parseField(optionalRateSchema, "")).toEqual({ ok: true, value: null });
  });

  it("stops at 100 pesos a kWh, so a missing decimal point (148.6) is refused", () => {
    expect(parseField(optionalRateSchema, "100")).toEqual({ ok: true, value: 10_000_000 });
    for (const typo of ["100.01", "148.6", "1486"]) {
      const result = parseField(optionalRateSchema, typo);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toBe("A rate over ₱100/kWh is almost certainly a typo.");
    }
  });
});

describe("hours stayed", () => {
  it("allows up to the hours in a year, and no more", () => {
    expect(parseField(optionalHoursSchema, "8784")).toEqual({ ok: true, value: 8784 });
    const result = parseField(optionalHoursSchema, "8785");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("That is more hours than a year holds.");
  });
});
