import { afterEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => holder.client }));

import { SupabaseRepository } from "./supabase-repository";

type Row = Record<string, unknown>;
type RpcCall = { name: string; args: Record<string, unknown> };

/**
 * Just enough of the Supabase client for `.from().select().eq()….maybeSingle()`
 * and `.rpc()`. Every rpc is written to `rpcLog`; one named in `failing` answers
 * the way PostgREST does when a function is missing or raises.
 */
function fakeClient(
  userId: string | null,
  tables: Record<string, Row[]>,
  rpcLog: RpcCall[] = [],
  failing: string[] = [],
) {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }),
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcLog.push({ name, args });
      return { data: null, error: failing.includes(name) ? { message: `${name} failed` } : null };
    },
    from(table: string) {
      const filters: [string, unknown][] = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        // Like PostgREST: more than one row is an error, not "the first one".
        maybeSingle: async () => {
          const hits = (tables[table] ?? []).filter((row) =>
            filters.every(([column, value]) => row[column] === value),
          );
          if (hits.length > 1) return { data: null, error: { message: "multiple rows returned" } };
          return { data: hits[0] ?? null, error: null };
        },
      };
      return query;
    },
  };
}

const ROOM = "room-1";
const tables = {
  profiles: [
    { id: "user-a", display_name: "Phoebe" },
    { id: "user-b", display_name: "Phoebe" },
    // Renamed in the header after joining; the room still says the long name.
    { id: "user-c", display_name: "Phoebe" },
  ],
  members: [
    { id: "m-1", room_id: ROOM, user_id: "user-a", name: "Phoebe" },
    { id: "m-2", room_id: ROOM, user_id: "user-b", name: "Phoebe" },
    { id: "m-3", room_id: ROOM, user_id: "user-c", name: "Phoebe Rhone Gangoso" },
    { id: "m-4", room_id: ROOM, user_id: null, name: "Jem" },
    { id: "m-5", room_id: "room-2", user_id: "user-a", name: "Phoebe" },
  ],
};

function asUser(userId: string | null) {
  holder.client = fakeClient(userId, tables);
  return new SupabaseRepository();
}

describe("getMyMember", () => {
  it("finds you by account, even when your header name no longer matches the room", async () => {
    const me = await asUser("user-c").getMyMember(ROOM);
    expect(me).toEqual({ id: "m-3", name: "Phoebe Rhone Gangoso" });
  });

  it("tells two people apart who share a name", async () => {
    expect((await asUser("user-a").getMyMember(ROOM))?.id).toBe("m-1");
    expect((await asUser("user-b").getMyMember(ROOM))?.id).toBe("m-2");
  });

  it("only looks inside the room you asked about", async () => {
    expect((await asUser("user-a").getMyMember("room-2"))?.id).toBe("m-5");
  });

  it("is null when your account is not in the room", async () => {
    expect(await asUser("user-z").getMyMember(ROOM)).toBeNull();
    expect(await asUser("user-b").getMyMember("room-2")).toBeNull();
  });

  it("is null when signed out", async () => {
    expect(await asUser(null).getMyMember(ROOM)).toBeNull();
  });
});

/* -- a clock left running across midnight ---------------------------------- *
 * Dates are built from the local-date constructor, because the cutoffs are
 * LOCAL midnights and these must pass wherever the machine running them sits.
 * ------------------------------------------------------------------------- */

const TRACKER = "tracker-1";
/** 3:30 AM on the 23rd — the morning after the evening a run began. */
const MORNING = new Date(2026, 7, 23, 3, 30);
const EVENING = new Date(2026, 7, 22, 19, 10);

function clockRepo(startedAt: Date | null, failing: string[] = []) {
  const calls: RpcCall[] = [];
  const runs: Row[] = startedAt
    ? [{ tracker_id: TRACKER, member_id: "m-1", started_at: startedAt.toISOString() }]
    : [];
  holder.client = fakeClient("user-a", { tracker_runs: runs }, calls, failing);
  // Reading the tracker back is its own long chain of queries. What matters
  // here is what gets SENT, so that part is stubbed.
  vi.spyOn(
    SupabaseRepository.prototype as unknown as { getTracker: () => Promise<unknown> },
    "getTracker",
  ).mockResolvedValue({ id: TRACKER });
  return { repo: new SupabaseRepository(), calls, names: () => calls.map((c) => c.name) };
}

function itIs(now: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
}

describe("a clock left running across midnight", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is cut at midnight before it is stopped", async () => {
    itIs(MORNING);
    const { repo, calls } = clockRepo(EVENING);
    await repo.stopClock(TRACKER, "m-1");
    expect(calls.map((c) => c.name)).toEqual(["checkpoint_clock", "stop_clock"]);
    expect(calls[0].args).toEqual({
      p_tracker_id: TRACKER,
      p_member_id: "m-1",
      p_cutoffs: [new Date(2026, 7, 23).toISOString()],
    });
  });

  it("is simply stopped when it stayed inside one day", async () => {
    itIs(new Date(2026, 7, 22, 22, 0));
    const { repo, names } = clockRepo(EVENING);
    await repo.stopClock(TRACKER, "m-1");
    expect(names()).toEqual(["stop_clock"]);
  });

  it("still stops when the cut fails — one long entry beats a clock that will not stop", async () => {
    itIs(MORNING);
    const { repo, names } = clockRepo(EVENING, ["checkpoint_clock"]);
    await expect(repo.stopClock(TRACKER, "m-1")).resolves.toBeDefined();
    expect(names()).toEqual(["checkpoint_clock", "stop_clock"]);
  });

  it("still reports a failure of the stop itself", async () => {
    itIs(MORNING);
    const { repo } = clockRepo(EVENING, ["stop_clock"]);
    await expect(repo.stopClock(TRACKER, "m-1")).rejects.toThrow();
  });

  it("can be checkpointed while it runs, sending every midnight it has crossed", async () => {
    itIs(new Date(2026, 7, 24, 2, 0));
    const { repo, calls } = clockRepo(new Date(2026, 7, 21, 22, 0));
    await repo.checkpointClock(TRACKER, "m-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("checkpoint_clock");
    expect(calls[0].args.p_cutoffs).toEqual([
      new Date(2026, 7, 22).toISOString(),
      new Date(2026, 7, 23).toISOString(),
      new Date(2026, 7, 24).toISOString(),
    ]);
  });

  it("is not checkpointed when it stayed inside one day", async () => {
    itIs(new Date(2026, 7, 22, 22, 0));
    const { repo, calls } = clockRepo(EVENING);
    await repo.checkpointClock(TRACKER, "m-1");
    expect(calls).toEqual([]);
  });

  it("is not checkpointed when nothing is running", async () => {
    itIs(MORNING);
    const { repo, calls } = clockRepo(null);
    await repo.checkpointClock(TRACKER, "m-1");
    expect(calls).toEqual([]);
  });

  it("reports a failed checkpoint, so the caller can decide what to do about it", async () => {
    itIs(MORNING);
    const { repo } = clockRepo(EVENING, ["checkpoint_clock"]);
    await expect(repo.checkpointClock(TRACKER, "m-1")).rejects.toThrow();
  });

  it("tells the open screens once it has been cut, so the logs update", async () => {
    itIs(MORNING);
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    const { repo } = clockRepo(EVENING);
    await repo.checkpointClock(TRACKER, "m-1");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
