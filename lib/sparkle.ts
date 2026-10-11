/**
 * Hand-drawn sparkles for the landing page: the outline each one is drawn with, where
 * it goes, and how it begins.
 *
 * A sparkle is a single pen stroke round a four-pointed diamond, nudged a little off
 * true so it reads as a doodle rather than a stamped icon. It is drawn in a 100 by
 * 100 box and sized by whoever places it. Pure: all the randomness comes in through
 * `random`, so the same numbers always give the same drawing, and the tests can pin
 * it down.
 */

export type Random = () => number;

const fixed = (n: number) => n.toFixed(1);

/** A number nudged by up to ±amount, the way a hand never quite lands on the mark. */
function shake(random: Random, n: number, amount: number): number {
  return n + (random() * 2 - 1) * amount;
}

/** "x y", nudged. */
function pt(random: Random, x: number, y: number, amount = 2.2): string {
  return `${fixed(shake(random, x, amount))} ${fixed(shake(random, y, amount))}`;
}

/**
 * One four-pointed diamond: four points, joined by four curves that sag in toward the
 * middle, traced in one go.
 *
 * How far the points reach and how hard the sides sag differ a little from sparkle to
 * sparkle, so a field of them is a family and not copies. The stroke comes back round
 * to the top and a little past it, because a pen does not stop on the mark.
 */
export function sketch(random: Random): string {
  const reachX = 44 + random() * 4;
  const reachY = 44 + random() * 5;
  const sag = 5 + random() * 5;

  return [
    `M${pt(random, 50, 50 - reachY)}`,
    `Q${pt(random, 50 + sag, 50 - sag, 3)} ${pt(random, 50 + reachX, 50)}`,
    `Q${pt(random, 50 + sag, 50 + sag, 3)} ${pt(random, 50, 50 + reachY)}`,
    `Q${pt(random, 50 - sag, 50 + sag, 3)} ${pt(random, 50 - reachX, 50)}`,
    `Q${pt(random, 50 - sag, 50 - sag, 3)} ${pt(random, 53, 50 - reachY + 5, 2)}`,
  ].join(" ");
}

export type Tone = "pink" | "rose" | "ink";

export interface SparkleSpec {
  /** The path of its one stroke, in a 100 by 100 box. */
  outline: string;
  /** Where it sits, as a percentage of the area it floats in. */
  x: number;
  y: number;
  /** Side of its box, in pixels. */
  size: number;
  /** A little tilt, in degrees, so no two sit quite the same way. */
  turn: number;
  /**
   * Quarter turns on top of the tilt. The pen always starts at the top of the outline,
   * so this is which corner of the diamond it starts from once it is turned.
   */
  start: 0 | 1 | 2 | 3;
  /** Drawn the other way round (counter-clockwise), as if by a left hand. */
  mirror: boolean;
  tone: Tone;
  /** Seconds for one cycle: drawn on, held, rubbed out, and a rest. */
  seconds: number;
  /** Seconds to wait before drawing for the first time. 0 for one that is only moving house. */
  startAfter: number;
}

/**
 * The middle of the area, where the line and the button are. Sparkles keep out of it,
 * which is a box and not an ellipse because the thing it protects is a box of text.
 */
const MIDDLE = { left: 24, right: 76, top: 24, bottom: 76 };

/** A fresh sparkle: a new drawing, in a random place, at a random size and pace. */
export function rollSparkle(random: Random): SparkleSpec {
  const outline = sketch(random);

  // Anywhere but the middle. A few tries, then take what it landed on rather than
  // loop for ever.
  let x = 0;
  let y = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    x = 4 + random() * 92;
    y = 6 + random() * 88;
    const inMiddle = x > MIDDLE.left && x < MIDDLE.right && y > MIDDLE.top && y < MIDDLE.bottom;
    if (!inMiddle) break;
  }

  const shade = random();

  return {
    outline,
    x,
    y,
    size: 26 + random() * 34,
    turn: (random() * 2 - 1) * 24,
    start: Math.floor(random() * 4) as 0 | 1 | 2 | 3,
    mirror: random() < 0.5,
    tone: shade < 0.45 ? "pink" : shade < 0.85 ? "rose" : "ink",
    seconds: 6 + random() * 3,
    startAfter: 0,
  };
}

/**
 * How long, in seconds, it takes for every sparkle in the first field to have begun.
 * The landing page holds its line back until just after this, so the sparkles lead.
 */
export const START_SPREAD = 0.9;

/**
 * The sparkles a page opens with. Each begins at a different moment: one slot per
 * sparkle, spread evenly over the first `START_SPREAD` seconds and dealt out in a
 * random order, so they set off one after another across the page instead of all at
 * once, or in a clump, or in a line. The first starts at once.
 */
export function rollField(count: number, random: Random): SparkleSpec[] {
  const slots = Array.from({ length: count }, (_, i) =>
    count > 1 ? (i / (count - 1)) * START_SPREAD : 0,
  );

  // Fisher-Yates, so no order is likelier than another.
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  return slots.map((startAfter) => ({ ...rollSparkle(random), startAfter }));
}
