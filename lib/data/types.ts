/**
 * FairySplit domain model (§5).
 *
 * Money is ALWAYS integer centavos. There is no float-holding-pesos anywhere in
 * this codebase. Formatting to "₱1,234.56" happens once, at render time, in
 * `lib/billing/money.ts`.
 */

/** Integer. ₱1,234.56 => 123456 */
export type Centavos = number;

/** 1/1000 of a centavo. ₱14.86/kWh => 14_860_000 */
export type Millicents = number;

export type ApplianceMode = "always_on" | "per_hour" | "per_cycle" | "per_day";

/**
 * What kind of bill this is. It decides which fields exist, so it has to be
 * stored: you cannot tell a Water bill from an Others bill by looking at the
 * data, and they disagree about whether the dates are required.
 */
export type BillKind = "electricity" | "water" | "other";

export const BILL_KINDS: readonly BillKind[] = ["electricity", "water", "other"] as const;

export const BILL_KIND_META: Record<
  BillKind,
  {
    label: string;
    /** Can carry a per-kWh rate, and therefore appliances (section 3). */
    itemizable: boolean;
    /** Weighted by days stayed, so the window it covers is required. */
    datesRequired: boolean;
  }
> = {
  electricity: {
    label: "Electricity",
    itemizable: true,
    datesRequired: true,
  },
  water: {
    label: "Water",
    itemizable: false,
    datesRequired: true,
  },
  other: {
    label: "Others",
    itemizable: false,
    datesRequired: false,
  },
};

export const APPLIANCE_MODES: readonly ApplianceMode[] = [
  "always_on",
  "per_hour",
  "per_cycle",
  "per_day",
] as const;

/** What `kwhPerUnit` is measured against, per mode (§10.3). */
export const APPLIANCE_MODE_META: Record<
  ApplianceMode,
  { label: string; unit: string; unitPlural: string; hint: string }
> = {
  always_on: {
    label: "Always on",
    unit: "day",
    unitPlural: "days",
    hint: "Runs 24/7. Cost is kWh/day × the period's day count, split equally among everyone.",
  },
  per_hour: {
    label: "Per hour",
    unit: "hour",
    unitPlural: "hours",
    hint: "Charged to whoever logged the hours.",
  },
  per_cycle: {
    label: "Per cycle",
    unit: "cycle",
    unitPlural: "cycles",
    hint: "Charged to whoever logged the cycles.",
  },
  per_day: {
    label: "Per day",
    unit: "day",
    unitPlural: "days",
    hint: "Charged to whoever logged the days.",
  },
};

export interface Identity {
  /** The name this browser introduces itself with. */
  name: string;
}

export interface Member {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
  /** 6 chars, alphabet excludes 0/O/1/I. */
  joinCode: string;
  memberIds: string[];
  /** Reused each month; copied (never referenced) into each bill. */
  applianceDefaults: ApplianceTemplate[];
  createdAt: string;
}

export interface ApplianceTemplate {
  id: string;
  /** User-typed: "Fridge", "Rice Cooker", anything. */
  label: string;
  mode: ApplianceMode;
  /** null = not provided yet. */
  kwhPerUnit: number | null;
  /** See BillAppliance.trackerId — the same meaning, carried into each bill. */
  trackerId: string | null;
  active: boolean;
}

export interface Bill {
  id: string;
  roomId: string;
  /** Decides which fields the bill has at all — see BILL_KIND_META. */
  kind: BillKind;
  /** "Electricity", "Water", anything. */
  name: string;
  /** The only truly required number. */
  totalCentavos: Centavos;
  roundUpToPeso: boolean;
  /** THE MODE SWITCH (section 3). null => simple split, no appliance section. */
  rateMillicents: Millicents | null;
  dueOn: string | null;

  /* -- what the bill covers ------------------------------------------------
   * A bill IS its own billing period. There is no separate Period record:
   * two bills almost never share one, and making them share it cost a whole
   * extra screen to navigate.
   * ---------------------------------------------------------------------- */
  /** ISO date (YYYY-MM-DD). Both are required by every form that writes a
   *  bill; they stay nullable only so a record migrated from the old
   *  period-based shape cannot silently claim dates it never had. */
  startsOn: string | null;
  endsOn: string | null;
  /* NOTE: there is no stored `dayCount`. The number of days a bill covers is
     DERIVED from the two dates by `coverageDays()` in lib/billing/occupancy.ts.
     Storing it too would let the two drift apart, and the derived one is the
     number the split actually uses. */
  /**
   * memberId -> HOURS stayed. null = unfilled, which the engine reads as 0.
   *
   * Hours, not days, because that is what the coming clock in/out system
   * produces. The day count the split is weighted by is DERIVED from this in
   * `memberDaysFor` — storing both would let the two drift apart.
   */
  memberHours: Record<string, number | null>;

  /**
   * Hand-entered amounts that stand in for what a log counted.
   *
   * trackerId -> memberId -> amount, in that log's own unit. ABSENT means "use
   * the log", which is the point of having a clock: you only store a number
   * here when you disagree with it.
   *
   * `memberHours` above is the same idea for the occupancy clock; it predates
   * this and is read directly by the engine, so it stays where it is.
   */
  logAmounts: Record<string, Record<string, number>>;

  /** A frozen COPY of the room templates, not a reference (section 5). */
  appliances: BillAppliance[];
  uses: ApplianceUse[];
  otherCharges: OtherCharge[];
  /** Who has settled up. Backs the per-member "mark as paid" box. */
  paidMemberIds: string[];
  createdAt: string;
}

export interface BillAppliance {
  id: string;
  label: string;
  mode: ApplianceMode;
  kwhPerUnit: number | null;
  /**
   * Which log supplies the quantities — the answer to "how is it charged?".
   *
   * null means shared equally: it runs for everyone whether they were home or
   * not, so there is nothing to log against it. That is the only built-in
   * answer; every other one names a Tracker in the room, and `mode` follows
   * that tracker's unit.
   *
   * A null here with a metered `mode` is a record from before logs existed. It
   * still prices from this bill's own usage entries, and the form offers to
   * link it to a log rather than silently re-costing it.
   */
  trackerId: string | null;
}

/**
 * One logged event: "ran the aircon 1.5 hours".
 *
 * §7.2 — this is deliberately an EVENT with a participant set, not a grid of
 * every possible pairing. Cost is split equally across `participantIds`, so it
 * works for 1 person or 12 with no divisors typed anywhere.
 */
export interface ApplianceUse {
  id: string;
  applianceId: string;
  quantity: number;
  /** One person, or several who used it together. Never empty. */
  participantIds: string[];
  occurredOn: string | null;
  note: string | null;
}

export interface OtherCharge {
  id: string;
  label: string;
  amountCentavos: Centavos;
  /** null = split equally among all members. */
  participantIds: string[] | null;
}

/* -- time tracking (the clock in / out system) ---------------------------- *
 * A Tracker is one thing you keep a running count of: the unit itself, the
 * aircon, the washer. Each member logs against it independently.
 * ------------------------------------------------------------------------ */

/**
 * How a tracker is fed.
 *
 * "clock" runs a live timer you start and stop. The manual modes take a typed
 * amount instead, in whatever unit the thing is naturally counted in.
 */
export type TrackerMode = "clock" | "per_day" | "per_hour" | "per_cycle";

export const TRACKER_MODES: readonly TrackerMode[] = [
  "clock",
  "per_day",
  "per_hour",
  "per_cycle",
] as const;

export const TRACKER_MODE_META: Record<
  TrackerMode,
  {
    label: string;
    hint: string;
    unit: string;
    unitPlural: string;
    /** Fed by a running timer rather than by typing a number. */
    live: boolean;
  }
> = {
  clock: {
    label: "Clock in / out",
    hint: "A live timer you start and stop, like the one above.",
    unit: "hour",
    unitPlural: "hours",
    live: true,
  },
  per_day: {
    label: "Per day",
    hint: "You type the number of days.",
    unit: "day",
    unitPlural: "days",
    live: false,
  },
  per_hour: {
    label: "Per hour",
    hint: "You type the number of hours.",
    unit: "hour",
    unitPlural: "hours",
    live: false,
  },
  per_cycle: {
    label: "Per cycle",
    hint: "You type the number of runs — a wash, a dry, a cook.",
    unit: "cycle",
    unitPlural: "cycles",
    live: false,
  },
};

/** One logged amount: a finished clock run, or a number somebody typed. */
export interface LogEntry {
  id: string;
  /**
   * Who this is charged to. Never empty.
   *
   * A clock run has one name on it — you can only clock yourself in. A typed
   * entry can name several, and then its cost divides equally between them,
   * the same rule §7.2 already uses for a shared appliance event.
   */
  participantIds: string[];
  /** In the tracker's own unit — hours, days, or cycles. */
  quantity: number;
  /** A clock entry keeps the span it came from. A manual one has none. */
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface Tracker {
  id: string;
  roomId: string;
  /** User-typed and freely editable. */
  name: string;
  mode: TrackerMode;
  /**
   * The occupancy clock every room gets for free. It cannot be deleted or
   * switched to a manual mode — it is the one whose hours weight the split.
   */
  builtIn: boolean;
  /**
   * Where it sits in the list. Shared, like the tracker itself — one person
   * dragging the aircon to the top moves it for the whole room.
   */
  sortOrder: number;
  /** memberId -> ISO instant their clock started. Absent means stopped. */
  runningSince: Record<string, string>;
  /**
   * memberId -> who the run they started will be charged to.
   *
   * Stored rather than held on screen so a reload mid-run cannot quietly turn
   * a shared run into a solo one. Absent means "just them".
   */
  runningWith: Record<string, string[]>;
  entries: LogEntry[];
  createdAt: string;
}

/** What the built-in occupancy clock is called when a room first gets one. */
export const OCCUPANCY_TRACKER_NAME = "Hours in the unit";

/**
 * What an appliance charged from a given log is measured in.
 *
 * A running clock produces hours, so it prices per hour. The manual modes
 * already name their own unit.
 */
export function applianceModeForTracker(mode: TrackerMode): ApplianceMode {
  switch (mode) {
    case "clock":
    case "per_hour":
      return "per_hour";
    case "per_cycle":
      return "per_cycle";
    case "per_day":
      return "per_day";
  }
}
