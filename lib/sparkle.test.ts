import { describe, expect, it } from "vitest";
import { START_SPREAD, rollField, rollSparkle, sketch } from "@/lib/sparkle";

/** A small repeatable random source (mulberry32), so a drawing can be pinned down. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every number in a path, in order. */
const numbers = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);

describe("sketch", () => {
  it("draws a real stroke, however the hand shakes", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const d = sketch(seeded(seed));
      expect(d.startsWith("M")).toBe(true);
      expect(d).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it("is one stroke of four curves: a four-pointed diamond and nothing else", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const d = sketch(seeded(seed));
      expect(d.match(/M/g)).toHaveLength(1); // one stroke, no lifting the pen
      expect(d.match(/Q/g)).toHaveLength(4); // four sides
      expect(d.match(/[LCTAa]/g)).toBeNull(); // nothing but those curves
    }
  });

  it("puts the four points at the top, right, bottom and left of its box", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      // M x y, then Q cx cy x y four times: the points are the pairs that end each Q.
      const n = numbers(sketch(seeded(seed)));
      const top = [n[0], n[1]];
      const right = [n[4], n[5]];
      const bottom = [n[8], n[9]];
      const left = [n[12], n[13]];
      expect(Math.abs(top[0] - 50)).toBeLessThan(6);
      expect(top[1]).toBeLessThan(12);
      expect(right[0]).toBeGreaterThan(88);
      expect(Math.abs(right[1] - 50)).toBeLessThan(6);
      expect(Math.abs(bottom[0] - 50)).toBeLessThan(6);
      expect(bottom[1]).toBeGreaterThan(88);
      expect(left[0]).toBeLessThan(12);
      expect(Math.abs(left[1] - 50)).toBeLessThan(6);
    }
  });

  it("sags in toward the middle: each curve's pull sits well inside its two points", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const n = numbers(sketch(seeded(seed)));
      // The first side runs from the top to the right; its pull is the Q's first pair.
      const [pullX, pullY] = [n[2], n[3]];
      expect(pullX).toBeGreaterThan(50);
      expect(pullX).toBeLessThan(70);
      expect(pullY).toBeLessThan(50);
      expect(pullY).toBeGreaterThan(30);
    }
  });

  it("keeps every number in, or very near, its 100 by 100 box", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      for (const n of numbers(sketch(seeded(seed)))) {
        expect(n).toBeGreaterThan(-4);
        expect(n).toBeLessThan(104);
      }
    }
  });

  it("draws the same sparkle from the same numbers, and a different one from others", () => {
    expect(sketch(seeded(7))).toEqual(sketch(seeded(7)));
    expect(sketch(seeded(7))).not.toEqual(sketch(seeded(8)));
  });
});

describe("rollSparkle", () => {
  const rolls = Array.from({ length: 400 }, (_, i) => rollSparkle(seeded(i + 1)));

  it("keeps out of the middle, where the line and the button are", () => {
    for (const { x, y } of rolls) {
      const inMiddle = x > 24 && x < 76 && y > 24 && y < 76;
      expect(inMiddle).toBe(false);
    }
  });

  it("stays on the page", () => {
    for (const { x, y } of rolls) {
      expect(x).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThanOrEqual(96);
      expect(y).toBeGreaterThanOrEqual(6);
      expect(y).toBeLessThanOrEqual(94);
    }
  });

  it("varies in tone, size, tilt, pace and place", () => {
    expect(new Set(rolls.map((r) => r.tone))).toEqual(new Set(["pink", "rose", "ink"]));
    for (const r of rolls) {
      expect(r.size).toBeGreaterThanOrEqual(26);
      expect(r.size).toBeLessThanOrEqual(60);
      expect(Math.abs(r.turn)).toBeLessThanOrEqual(24);
      expect(r.seconds).toBeGreaterThanOrEqual(6);
      expect(r.seconds).toBeLessThanOrEqual(9);
    }
    // Not just within range: they actually differ, or a field of them would look stamped.
    expect(new Set(rolls.map((r) => Math.round(r.size))).size).toBeGreaterThan(20);
    expect(new Set(rolls.map((r) => Math.round(r.turn))).size).toBeGreaterThan(20);
    expect(new Set(rolls.map((r) => r.seconds.toFixed(1))).size).toBeGreaterThan(20);
    expect(new Set(rolls.map((r) => r.x.toFixed(1))).size).toBeGreaterThan(300);
    expect(new Set(rolls.map((r) => r.outline)).size).toBe(rolls.length);
  });

  it("only ever rolls diamonds", () => {
    for (const r of rolls) {
      expect(r.outline.match(/Q/g)).toHaveLength(4);
      expect(r.outline.match(/M/g)).toHaveLength(1);
    }
  });

  it("starts from any corner of the diamond, going either way round it", () => {
    expect(new Set(rolls.map((r) => r.start))).toEqual(new Set([0, 1, 2, 3]));
    expect(new Set(rolls.map((r) => r.mirror))).toEqual(new Set([true, false]));
  });

  it("has no waiting to do when it is only moving house", () => {
    for (const r of rolls) expect(r.startAfter).toBe(0);
  });
});

describe("rollField", () => {
  const field = rollField(10, seeded(42));

  it("opens with as many sparkles as asked for, each a real one", () => {
    expect(field).toHaveLength(10);
    for (const s of field) {
      expect(s.outline.match(/Q/g)).toHaveLength(4);
      const inMiddle = s.x > 24 && s.x < 76 && s.y > 24 && s.y < 76;
      expect(inMiddle).toBe(false);
    }
  });

  it("starts the first at once, and every one inside the opening spread", () => {
    const starts = field.map((s) => s.startAfter);
    expect(Math.min(...starts)).toBe(0);
    expect(Math.max(...starts)).toBeCloseTo(START_SPREAD, 5);
    for (const s of starts) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(START_SPREAD);
    }
  });

  it("gives every sparkle a moment of its own, evenly spread, so none start together", () => {
    const starts = field.map((s) => s.startAfter).sort((a, b) => a - b);
    expect(new Set(starts.map((s) => s.toFixed(4))).size).toBe(10);
    for (let i = 1; i < starts.length; i += 1) {
      expect(starts[i] - starts[i - 1]).toBeCloseTo(START_SPREAD / 9, 5);
    }
  });

  it("deals the moments out in a different order each time, not sparkle by sparkle", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) {
      orders.add(rollField(10, seeded(seed)).map((s) => s.startAfter.toFixed(2)).join(","));
    }
    expect(orders.size).toBeGreaterThan(25);
    // And it is not just the same order every time.
    const ascending = [...orders].filter((o) => {
      const v = o.split(",").map(Number);
      return v.every((n, i) => i === 0 || n >= v[i - 1]);
    });
    expect(ascending.length).toBeLessThan(orders.size);
  });

  it("copes with a field of one, and of none", () => {
    expect(rollField(1, seeded(3)).map((s) => s.startAfter)).toEqual([0]);
    expect(rollField(0, seeded(3))).toEqual([]);
  });
});
