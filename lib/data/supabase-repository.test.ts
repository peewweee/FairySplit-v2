import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => holder.client }));

import { SupabaseRepository } from "./supabase-repository";

type Row = Record<string, unknown>;

/** Just enough of the Supabase client for `.from().select().eq()….maybeSingle()`. */
function fakeClient(userId: string | null, tables: Record<string, Row[]>) {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }),
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
