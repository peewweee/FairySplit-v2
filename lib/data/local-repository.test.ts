import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalRepository } from "./local-repository";

/**
 * The local store is no longer what the app runs on, but it is the plainest
 * statement of how a run that crosses midnight is cut — the database function
 * `checkpoint_clock` does the same thing — so the rule is pinned down here.
 *
 * Dates come from the local-date constructor: the cuts are LOCAL midnights, and
 * these must pass wherever the machine running them sits.
 */

function memoryWindow() {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
    dispatchEvent: () => true,
  };
}

/** Freeze the wall clock; only Date is faked, so promises keep working. */
function itIs(now: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
}

const EVENING = new Date(2026, 7, 22, 19, 10);
const MORNING = new Date(2026, 7, 23, 3, 30);
const midnight = (day: number) => new Date(2026, 7, day).getTime();
/** The last instant of the day before `midnight(day)` — an entry ends here. */
const dayEnd = (day: number) => new Date(midnight(day) - 1).toISOString();

async function setup(start: Date) {
  vi.stubGlobal("window", memoryWindow());
  itIs(start);
  const repo = new LocalRepository();
  const room = await repo.createRoom("Unit 4", "Phoebe");
  const other = await repo.addMember(room.id, "Jem");
  const [clock] = await repo.listTrackers(room.id);
  return { repo, clock, me: room.memberIds[0], other: other.id };
}

describe("a run that crosses midnight", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is stopped as one entry per day", async () => {
    const { repo, clock, me } = await setup(EVENING);
    await repo.startClock(clock.id, me);
    itIs(MORNING);
    const stopped = await repo.stopClock(clock.id, me);

    expect(stopped.runningSince[me]).toBeUndefined();
    // 7:10 PM to 11:59 PM, then 12:00 AM to 3:30 AM — the example the feature
    // was asked for with.
    expect(stopped.entries.map((e) => [e.startedAt, e.endedAt])).toEqual([
      [EVENING.toISOString(), dayEnd(23)],
      [new Date(midnight(23)).toISOString(), MORNING.toISOString()],
    ]);
    expect(stopped.entries[1].quantity).toBeCloseTo(3.5, 10);
    // Logged when they ended, like every other clock entry — the history lists a
    // day newest-first by this, so the evening has to sort before the morning.
    expect(stopped.entries.map((e) => e.createdAt)).toEqual(stopped.entries.map((e) => e.endedAt));
  });

  it("loses nothing but the millisecond each cut steps over", async () => {
    const { repo, clock, me } = await setup(EVENING);
    await repo.startClock(clock.id, me);
    itIs(MORNING);
    const stopped = await repo.stopClock(clock.id, me);

    const logged = stopped.entries.reduce((sum, e) => sum + e.quantity, 0);
    const ran = (MORNING.getTime() - EVENING.getTime()) / 3_600_000;
    expect(logged).toBeCloseTo(ran, 6);
    expect(logged).toBeLessThanOrEqual(ran);
  });

  it("keeps running after a checkpoint, from the last midnight", async () => {
    const { repo, clock, me } = await setup(new Date(2026, 7, 21, 22, 0));
    await repo.startClock(clock.id, me);
    itIs(new Date(2026, 7, 23, 2, 0));
    const cut = await repo.checkpointClock(clock.id, me);

    // The 21st and the whole of the 22nd are logged; the 23rd is still open.
    expect(cut.entries.map((e) => [e.startedAt, e.endedAt])).toEqual([
      [new Date(2026, 7, 21, 22, 0).toISOString(), dayEnd(22)],
      [new Date(midnight(22)).toISOString(), dayEnd(23)],
    ]);
    expect(cut.runningSince[me]).toBe(new Date(midnight(23)).toISOString());

    // Stopping later adds only what is left, and cuts nothing twice.
    itIs(new Date(2026, 7, 23, 3, 0));
    const stopped = await repo.stopClock(clock.id, me);
    expect(stopped.entries).toHaveLength(3);
    expect(stopped.entries[2].startedAt).toBe(new Date(midnight(23)).toISOString());
    expect(stopped.entries[2].quantity).toBeCloseTo(3, 10);
  });

  it("checkpointing twice in a row logs each day once", async () => {
    const { repo, clock, me } = await setup(EVENING);
    await repo.startClock(clock.id, me);
    itIs(MORNING);
    await repo.checkpointClock(clock.id, me);
    const again = await repo.checkpointClock(clock.id, me);
    expect(again.entries).toHaveLength(1);
  });

  it("keeps charging every piece to whoever it was charged to when it began", async () => {
    const { repo, clock, me, other } = await setup(EVENING);
    await repo.startClock(clock.id, me, [me, other]);
    itIs(MORNING);
    const stopped = await repo.stopClock(clock.id, me);
    expect(stopped.entries).toHaveLength(2);
    for (const entry of stopped.entries) expect(entry.participantIds).toEqual([me, other]);
  });

  it("drops a piece too short to count rather than logging a zero or negative entry", async () => {
    // Started one millisecond before midnight: the cut would end before it began.
    const { repo, clock, me } = await setup(new Date(midnight(23) - 1));
    await repo.startClock(clock.id, me);
    itIs(MORNING);
    const cut = await repo.checkpointClock(clock.id, me);
    expect(cut.entries).toEqual([]);
    expect(cut.runningSince[me]).toBe(new Date(midnight(23)).toISOString());
  });
});

describe("the same stretch logged twice", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const startedAt = new Date(2026, 7, 21, 3, 0).toISOString();
  const endedAt = new Date(2026, 7, 21, 5, 30).toISOString();

  it("is one entry when a housemate adds it after another, whatever order the people are ticked in", async () => {
    const { repo, clock, me, other } = await setup(EVENING);
    await repo.addClockEntries(clock.id, [{ startedAt, endedAt, participantIds: [me, other] }]);
    const after = await repo.addClockEntries(clock.id, [
      { startedAt, endedAt, participantIds: [other, me] },
    ]);
    expect(after.entries.filter((e) => e.startedAt)).toHaveLength(1);
  });

  it("is still one entry when one copy came from a live clock and has seconds on it", async () => {
    const { repo, clock, me, other } = await setup(EVENING);
    await repo.addClockEntries(clock.id, [
      {
        startedAt: new Date(2026, 7, 21, 3, 0, 12).toISOString(),
        endedAt: new Date(2026, 7, 21, 5, 30, 41).toISOString(),
        participantIds: [me, other],
      },
    ]);
    const after = await repo.addClockEntries(clock.id, [
      { startedAt, endedAt, participantIds: [me, other] },
    ]);
    expect(after.entries.filter((e) => e.startedAt)).toHaveLength(1);
  });

  it("is two entries when it is not the same people, or not the same minutes", async () => {
    const { repo, clock, me, other } = await setup(EVENING);
    await repo.addClockEntries(clock.id, [{ startedAt, endedAt, participantIds: [me, other] }]);
    await repo.addClockEntries(clock.id, [{ startedAt, endedAt, participantIds: [me] }]);
    const after = await repo.addClockEntries(clock.id, [
      { startedAt, endedAt: new Date(2026, 7, 21, 5, 31).toISOString(), participantIds: [me, other] },
    ]);
    expect(after.entries.filter((e) => e.startedAt)).toHaveLength(3);
  });
});

describe("a run that does not cross midnight", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is stopped as the single entry it always was", async () => {
    const { repo, clock, me } = await setup(EVENING);
    await repo.startClock(clock.id, me);
    itIs(new Date(2026, 7, 22, 22, 10));
    const stopped = await repo.stopClock(clock.id, me);
    expect(stopped.entries).toHaveLength(1);
    expect(stopped.entries[0].startedAt).toBe(EVENING.toISOString());
    expect(stopped.entries[0].quantity).toBeCloseTo(3, 10);
  });

  it("is left alone by a checkpoint", async () => {
    const { repo, clock, me } = await setup(EVENING);
    await repo.startClock(clock.id, me);
    itIs(new Date(2026, 7, 22, 22, 10));
    const cut = await repo.checkpointClock(clock.id, me);
    expect(cut.entries).toEqual([]);
    expect(cut.runningSince[me]).toBe(EVENING.toISOString());
  });

  it("is a no-op when nothing is running", async () => {
    const { repo, clock, me } = await setup(MORNING);
    const cut = await repo.checkpointClock(clock.id, me);
    expect(cut.entries).toEqual([]);
    expect(cut.runningSince[me]).toBeUndefined();
  });
});
