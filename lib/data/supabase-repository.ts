import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { HISTORY_DAYS, isDuplicateSpan } from "@/lib/tracking/elapsed";
import type {
  ApplianceTemplate,
  ApplianceUse,
  Bill,
  BillAppliance,
  BillKind,
  Identity,
  LogEntry,
  Member,
  OtherCharge,
  Room,
  Tracker,
  TrackerMode,
} from "@/lib/data/types";
import {
  RepositoryError,
  type ApplianceInput,
  type CreateBillInput,
  type MemberFootprint,
  type OtherChargeInput,
  type Repository,
  type TrackerInput,
  type UpdateBillInput,
  type UseInput,
} from "@/lib/data/repository";
import { normaliseJoinCode, randomJoinCode } from "@/lib/data/join-code";
import { notifyChanged } from "@/lib/data/change-event";

/**
 * The Phase B implementation: a real Postgres database, behind row-level
 * security that scopes every read and write to rooms the signed-in account is
 * actually in.
 *
 * Three operations that touch more than one row run as database functions
 * instead of several client calls — `create_room` and `join_room` (already in
 * schema.sql) and `start_clock` / `stop_clock` / `remove_member`
 * (supabase/migrations/002_repository_rpcs.sql) — so they cannot half-happen.
 * Everything else here is plain single-table reads and writes, which RLS
 * already scopes correctly on its own.
 *
 * A bill's own contents (appliances, uses, other charges) stay JSONB columns,
 * matching the schema's own design: they are edited as a unit inside one
 * dialog by one person, so a read-modify-write of the whole column is the
 * right level of care, not a race worth engineering around.
 */

/* -- row shapes, exactly as the columns in schema.sql -------------------- */

interface RoomRow {
  id: string;
  name: string;
  join_code: string;
  created_by: string;
  appliance_defaults: unknown;
  created_at: string;
}

interface MemberRow {
  id: string;
  room_id: string;
  user_id: string | null;
  name: string;
  created_at: string;
}

interface TrackerRow {
  id: string;
  room_id: string;
  name: string;
  mode: string;
  built_in: boolean;
  sort_order: number;
  created_at: string;
}

interface TrackerRunRow {
  tracker_id: string;
  member_id: string;
  started_at: string;
  charged_to: string[];
}

interface LogEntryRow {
  id: string;
  tracker_id: string;
  participant_ids: string[];
  quantity: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

interface BillRow {
  id: string;
  room_id: string;
  kind: string;
  name: string;
  total_centavos: number;
  round_up_to_peso: boolean;
  rate_millicents: number | null;
  due_on: string | null;
  starts_on: string | null;
  ends_on: string | null;
  appliances: unknown;
  uses: unknown;
  other_charges: unknown;
  created_at: string;
}

/* -- error handling --------------------------------------------------------
 * Messages this repository itself raises (in the RPC functions, or thrown
 * below) are already written for the UI and pass straight through. Anything
 * else — a raw constraint name, a PostgREST internals string — is not fit to
 * show somebody who just wanted to rename a room, so it gets a generic
 * fallback instead. Section 9's rule for LocalRepository applies here too.
 * ------------------------------------------------------------------------ */

const KNOWN_MESSAGES = new Set([
  "No room has that code",
  "Not signed in",
  "Not a member of this room",
  "That person is no longer in this room",
]);

function humanize(error: Pick<PostgrestError, "message"> | null | undefined): string {
  if (!error) return "Something went wrong.";
  if (KNOWN_MESSAGES.has(error.message)) return error.message;
  return "Something went wrong talking to the server. Try again.";
}

function fail(error: Pick<PostgrestError, "message"> | null | undefined): never {
  throw new RepositoryError(humanize(error));
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Hours between two instants, refusing a run that ends before it starts. */
function spanHours(startedAt: string, endedAt: string): number {
  const from = Date.parse(startedAt);
  const to = Date.parse(endedAt);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new RepositoryError("That date and time don't look right.");
  }
  if (to <= from) throw new RepositoryError("The end has to come after the start.");
  return (to - from) / 3_600_000;
}

/** Same floor LocalRepository uses: history a room can actually still reach. */
function pruneEntries(entries: LogEntry[]): LogEntry[] {
  const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => {
    const at = Date.parse(entry.endedAt ?? entry.startedAt ?? entry.createdAt);
    return !Number.isFinite(at) || at >= cutoff;
  });
}

/* -- row -> domain mappers ------------------------------------------------- */

function memberFromRow(row: MemberRow): Member {
  return { id: row.id, name: row.name };
}

function roomFromRow(row: RoomRow, memberIds: string[]): Room {
  return {
    id: row.id,
    name: row.name,
    joinCode: row.join_code,
    memberIds,
    applianceDefaults: (row.appliance_defaults ?? []) as ApplianceTemplate[],
    createdAt: row.created_at,
  };
}

function logEntryFromRow(row: LogEntryRow): LogEntry {
  return {
    id: row.id,
    participantIds: row.participant_ids,
    quantity: row.quantity,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

function trackerFromRow(row: TrackerRow, runs: TrackerRunRow[], entryRows: LogEntryRow[]): Tracker {
  const runningSince: Record<string, string> = {};
  const runningWith: Record<string, string[]> = {};
  for (const run of runs) {
    runningSince[run.member_id] = run.started_at;
    runningWith[run.member_id] = run.charged_to;
  }
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    mode: row.mode as TrackerMode,
    builtIn: row.built_in,
    sortOrder: row.sort_order,
    runningSince,
    runningWith,
    entries: pruneEntries(entryRows.map(logEntryFromRow)),
    createdAt: row.created_at,
  };
}

function billFromRow(
  row: BillRow,
  memberIds: string[],
  hours: { member_id: string; hours: number }[],
  amounts: { tracker_id: string; member_id: string; amount: number }[],
  paid: { member_id: string }[],
): Bill {
  const memberHours: Record<string, number | null> = {};
  for (const id of memberIds) memberHours[id] = null;
  for (const h of hours) memberHours[h.member_id] = h.hours;

  const logAmounts: Record<string, Record<string, number>> = {};
  for (const a of amounts) {
    (logAmounts[a.tracker_id] ??= {})[a.member_id] = a.amount;
  }

  return {
    id: row.id,
    roomId: row.room_id,
    kind: row.kind as BillKind,
    name: row.name,
    totalCentavos: row.total_centavos,
    roundUpToPeso: row.round_up_to_peso,
    rateMillicents: row.rate_millicents,
    dueOn: row.due_on,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    memberHours,
    logAmounts,
    appliances: (row.appliances ?? []) as BillAppliance[],
    uses: (row.uses ?? []) as ApplianceUse[],
    otherCharges: (row.other_charges ?? []) as OtherCharge[],
    paidMemberIds: paid.map((p) => p.member_id),
    createdAt: row.created_at,
  };
}

/**
 * Every method that writes. LocalRepository's every write goes through one
 * `mutate()` that fires the change event on the way out; there is no single
 * choke point here — a browser client issues each write as its own request —
 * so the constructor below wraps exactly these names instead of trusting 36
 * method bodies to each remember the call.
 */
const WRITE_METHODS = new Set<string>([
  "setIdentity",
  "createRoom",
  "joinRoom",
  "renameRoom",
  "deleteRoom",
  "addMember",
  "renameMember",
  "removeMember",
  "addApplianceTemplate",
  "updateApplianceTemplate",
  "removeApplianceTemplate",
  "createBill",
  "updateBill",
  "deleteBill",
  "setMemberHours",
  "setLogAmount",
  "addBillAppliance",
  "updateBillAppliance",
  "removeBillAppliance",
  "addUse",
  "updateUse",
  "removeUse",
  "addOtherCharge",
  "updateOtherCharge",
  "removeOtherCharge",
  "addTracker",
  "renameTracker",
  "removeTracker",
  "reorderTrackers",
  "startClock",
  "stopClock",
  "addLogEntry",
  "addClockEntry",
  "addClockEntries",
  "updateLogEntry",
  "removeLogEntry",
  "setPaid",
]);

export class SupabaseRepository implements Repository {
  private readonly client: SupabaseClient = createClient();

  constructor() {
    // A constructor may return a different object in its place — this keeps
    // `new SupabaseRepository()` (see lib/data/index.ts) working unchanged
    // while every write, wherever it is called from, notifies afterward. A
    // read that happens to be named oddly is not at risk either way: the
    // Set above is the only thing that decides, not a guess about the name.
    return new Proxy(this, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (typeof value !== "function" || !WRITE_METHODS.has(String(prop))) {
          return value;
        }
        return async (...args: unknown[]) => {
          const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          notifyChanged();
          return result;
        };
      },
    });
  }

  /* -- identity -----------------------------------------------------------
   * There is no separate "who am I typing as" store here — the account IS
   * the identity, and its name lives in `profiles.display_name`. `null`
   * means the same thing it did in Phase A: nothing set yet.
   * ---------------------------------------------------------------------- */

  async getIdentity(): Promise<Identity | null> {
    const {
      data: { user },
    } = await this.client.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.client
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (error) fail(error);

    const name = data?.display_name?.trim();
    return name ? { name } : null;
  }

  async setIdentity(name: string): Promise<Identity> {
    const {
      data: { user },
    } = await this.client.auth.getUser();
    if (!user) throw new RepositoryError("You need to be signed in to set your name.");

    const trimmed = name.trim();
    const { error } = await this.client
      .from("profiles")
      .update({ display_name: trimmed })
      .eq("id", user.id);
    if (error) fail(error);
    return { name: trimmed };
  }

  /* -- rooms ---------------------------------------------------------------
   * RLS already scopes every select here to rooms the caller is a member of
   * — `listRooms` needs no explicit filter at all.
   * ---------------------------------------------------------------------- */

  private async membersOf(roomId: string): Promise<MemberRow[]> {
    const { data, error } = await this.client
      .from("members")
      .select("id, room_id, user_id, name, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) fail(error);
    return data ?? [];
  }

  private async hydrateRoom(row: RoomRow): Promise<Room> {
    const members = await this.membersOf(row.id);
    return roomFromRow(row, members.map((m) => m.id));
  }

  async listRooms(): Promise<Room[]> {
    const { data, error } = await this.client
      .from("rooms")
      .select("id, name, join_code, created_by, appliance_defaults, created_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) fail(error);
    const rows = (data ?? []) as RoomRow[];
    if (rows.length === 0) return [];

    const { data: allMembers, error: memberError } = await this.client
      .from("members")
      .select("id, room_id, user_id, name, created_at")
      .in(
        "room_id",
        rows.map((r) => r.id),
      )
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (memberError) fail(memberError);
    const byRoom = groupBy((allMembers ?? []) as MemberRow[], (m) => m.room_id);

    return rows.map((row) => roomFromRow(row, (byRoom.get(row.id) ?? []).map((m) => m.id)));
  }

  async getRoom(id: string): Promise<Room | null> {
    const { data, error } = await this.client
      .from("rooms")
      .select("id, name, join_code, created_by, appliance_defaults, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error) fail(error);
    if (!data) return null;
    return this.hydrateRoom(data as RoomRow);
  }

  async createRoom(name: string, creatorName: string): Promise<Room> {
    // The client generates the code because RLS means a not-yet-a-member
    // caller cannot even SELECT existing codes to check for a collision.
    // The `join_code` unique constraint is the real guard; a collision here
    // surfaces as a 23505 and is worth one retry, not 200 of them.
    let lastError: PostgrestError | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data, error } = await this.client.rpc("create_room", {
        p_name: name.trim(),
        p_display_name: creatorName.trim(),
        p_join_code: randomJoinCode(),
      });
      if (!error) return this.hydrateRoom(data as RoomRow);
      if (error.code !== "23505") fail(error);
      lastError = error;
    }
    fail(lastError);
  }

  async joinRoom(code: string): Promise<Room> {
    const { data: identity } = await this.client.auth.getUser();
    const displayName =
      (await this.getIdentity())?.name?.trim() ||
      (identity.user?.user_metadata?.display_name as string | undefined)?.trim() ||
      "";

    const { data, error } = await this.client.rpc("join_room", {
      p_code: normaliseJoinCode(code),
      p_display_name: displayName,
    });
    if (error) fail(error);
    return this.hydrateRoom(data as RoomRow);
  }

  async renameRoom(id: string, name: string): Promise<Room> {
    const { data, error } = await this.client
      .from("rooms")
      .update({ name: name.trim() })
      .eq("id", id)
      .select("id, name, join_code, created_by, appliance_defaults, created_at")
      .maybeSingle();
    if (error) fail(error);
    if (!data) throw new RepositoryError("That room no longer exists.");
    return this.hydrateRoom(data as RoomRow);
  }

  async deleteRoom(id: string): Promise<void> {
    // FK cascades take members, trackers, tracker_runs, log_entries, bills
    // and every per-member bill table with it — nothing else to clean up.
    const { error, count } = await this.client
      .from("rooms")
      .delete({ count: "exact" })
      .eq("id", id);
    if (error) fail(error);
    if (!count) throw new RepositoryError("That room no longer exists.");
  }

  /* -- members --------------------------------------------------------- */

  async listMembers(roomId: string): Promise<Member[]> {
    return (await this.membersOf(roomId)).map(memberFromRow);
  }

  async addMember(roomId: string, name: string): Promise<Member> {
    // Nothing to seed into existing bills: an absent bill_member_hours row
    // already reads back as "unfilled" for anyone, new member included.
    const { data, error } = await this.client
      .from("members")
      .insert({ room_id: roomId, name: name.trim() })
      .select("id, room_id, user_id, name, created_at")
      .single();
    if (error) fail(error);
    return memberFromRow(data as MemberRow);
  }

  async renameMember(roomId: string, memberId: string, name: string): Promise<Member> {
    const { data, error } = await this.client
      .from("members")
      .update({ name: name.trim() })
      .eq("id", memberId)
      .eq("room_id", roomId)
      .select("id, room_id, user_id, name, created_at")
      .maybeSingle();
    if (error) fail(error);
    if (!data) throw new RepositoryError("That person is no longer in this room.");
    return memberFromRow(data as MemberRow);
  }

  async getMemberFootprint(roomId: string, memberId: string): Promise<MemberFootprint> {
    const { data: bills, error: billsError } = await this.client
      .from("bills")
      .select("id, uses, other_charges")
      .eq("room_id", roomId);
    if (billsError) fail(billsError);

    const billRows = (bills ?? []) as { id: string; uses: unknown; other_charges: unknown }[];

    let usageCount = 0;
    let chargeCount = 0;
    for (const bill of billRows) {
      const uses = (bill.uses ?? []) as ApplianceUse[];
      const charges = (bill.other_charges ?? []) as OtherCharge[];
      usageCount += uses.filter((u) => u.participantIds.includes(memberId)).length;
      chargeCount += charges.filter((c) => c.participantIds?.includes(memberId)).length;
    }

    let billsWithDays = 0;
    if (billRows.length > 0) {
      const { data: hoursRows, error: hoursError } = await this.client
        .from("bill_member_hours")
        .select("bill_id")
        .eq("member_id", memberId)
        .gt("hours", 0)
        .in(
          "bill_id",
          billRows.map((b) => b.id),
        );
      if (hoursError) fail(hoursError);
      billsWithDays = (hoursRows ?? []).length;
    }

    return { usageCount, chargeCount, billsWithDays };
  }

  async removeMember(roomId: string, memberId: string): Promise<void> {
    void roomId; // room membership is re-derived from memberId inside the RPC
    const { error } = await this.client.rpc("remove_member", { p_member_id: memberId });
    if (error) fail(error);
  }

  /* -- room appliance templates ------------------------------------------ */

  private async loadTemplates(roomId: string): Promise<ApplianceTemplate[]> {
    const { data, error } = await this.client
      .from("rooms")
      .select("appliance_defaults")
      .eq("id", roomId)
      .maybeSingle();
    if (error) fail(error);
    if (!data) throw new RepositoryError("That room no longer exists.");
    return (data.appliance_defaults ?? []) as ApplianceTemplate[];
  }

  private async saveTemplates(roomId: string, templates: ApplianceTemplate[]): Promise<void> {
    const { error } = await this.client
      .from("rooms")
      .update({ appliance_defaults: templates })
      .eq("id", roomId);
    if (error) fail(error);
  }

  async addApplianceTemplate(roomId: string, input: ApplianceInput): Promise<ApplianceTemplate> {
    const templates = await this.loadTemplates(roomId);
    const template: ApplianceTemplate = {
      id: crypto.randomUUID(),
      label: input.label.trim(),
      mode: input.mode,
      kwhPerUnit: input.kwhPerUnit,
      trackerId: input.trackerId,
      active: true,
    };
    await this.saveTemplates(roomId, [...templates, template]);
    return template;
  }

  async updateApplianceTemplate(
    roomId: string,
    templateId: string,
    patch: Partial<ApplianceInput> & { active?: boolean },
  ): Promise<ApplianceTemplate> {
    const templates = await this.loadTemplates(roomId);
    const index = templates.findIndex((t) => t.id === templateId);
    if (index === -1) throw new RepositoryError("That appliance template no longer exists.");
    const updated: ApplianceTemplate = {
      ...templates[index],
      ...(patch.label !== undefined && { label: patch.label.trim() }),
      ...(patch.mode !== undefined && { mode: patch.mode }),
      ...(patch.kwhPerUnit !== undefined && { kwhPerUnit: patch.kwhPerUnit }),
      ...(patch.trackerId !== undefined && { trackerId: patch.trackerId }),
      ...(patch.active !== undefined && { active: patch.active }),
    };
    const next = [...templates];
    next[index] = updated;
    await this.saveTemplates(roomId, next);
    return updated;
  }

  async removeApplianceTemplate(roomId: string, templateId: string): Promise<void> {
    const templates = await this.loadTemplates(roomId);
    await this.saveTemplates(
      roomId,
      templates.filter((t) => t.id !== templateId),
    );
  }

  /* -- bills --------------------------------------------------------------- */

  private async hydrateBills(rows: BillRow[], roomId: string): Promise<Bill[]> {
    if (rows.length === 0) return [];
    const billIds = rows.map((r) => r.id);

    const [members, hoursRes, amountsRes, paidRes] = await Promise.all([
      this.membersOf(roomId),
      this.client.from("bill_member_hours").select("bill_id, member_id, hours").in("bill_id", billIds),
      this.client
        .from("bill_log_amounts")
        .select("bill_id, tracker_id, member_id, amount")
        .in("bill_id", billIds),
      this.client.from("bill_paid").select("bill_id, member_id").in("bill_id", billIds),
    ]);
    if (hoursRes.error) fail(hoursRes.error);
    if (amountsRes.error) fail(amountsRes.error);
    if (paidRes.error) fail(paidRes.error);

    const memberIds = members.map((m) => m.id);
    const hoursByBill = groupBy(hoursRes.data ?? [], (h) => h.bill_id as string);
    const amountsByBill = groupBy(amountsRes.data ?? [], (a) => a.bill_id as string);
    const paidByBill = groupBy(paidRes.data ?? [], (p) => p.bill_id as string);

    return rows.map((row) =>
      billFromRow(
        row,
        memberIds,
        hoursByBill.get(row.id) ?? [],
        amountsByBill.get(row.id) ?? [],
        paidByBill.get(row.id) ?? [],
      ),
    );
  }

  private static readonly BILL_COLUMNS =
    "id, room_id, kind, name, total_centavos, round_up_to_peso, rate_millicents, due_on, starts_on, ends_on, appliances, uses, other_charges, created_at";

  async listBills(roomId: string): Promise<Bill[]> {
    const { data, error } = await this.client
      .from("bills")
      .select(SupabaseRepository.BILL_COLUMNS)
      .eq("room_id", roomId)
      .order("starts_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (error) fail(error);
    return this.hydrateBills((data ?? []) as BillRow[], roomId);
  }

  async getBill(id: string): Promise<Bill | null> {
    const { data, error } = await this.client
      .from("bills")
      .select(SupabaseRepository.BILL_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) fail(error);
    if (!data) return null;
    const row = data as BillRow;
    const [bill] = await this.hydrateBills([row], row.room_id);
    return bill;
  }

  async createBill(roomId: string, input: CreateBillInput): Promise<Bill> {
    let appliances: BillAppliance[] = [];
    if (input.seedFromRoomTemplates && input.rateMillicents !== null) {
      const templates = await this.loadTemplates(roomId);
      appliances = templates
        .filter((t) => t.active && t.kwhPerUnit !== null)
        .map((t) => ({
          id: crypto.randomUUID(),
          label: t.label,
          mode: t.mode,
          kwhPerUnit: t.kwhPerUnit,
          trackerId: t.trackerId ?? null,
        }));
    }

    const { data, error } = await this.client
      .from("bills")
      .insert({
        room_id: roomId,
        kind: input.kind,
        name: input.name.trim(),
        total_centavos: input.totalCentavos,
        round_up_to_peso: input.roundUpToPeso,
        rate_millicents: input.rateMillicents,
        due_on: input.dueOn,
        starts_on: input.startsOn ?? null,
        ends_on: input.endsOn ?? null,
        appliances,
        uses: [],
        other_charges: [],
      })
      .select(SupabaseRepository.BILL_COLUMNS)
      .single();
    if (error) fail(error);
    const row = data as BillRow;
    const [bill] = await this.hydrateBills([row], roomId);
    return bill;
  }

  async updateBill(id: string, patch: UpdateBillInput): Promise<Bill> {
    const current = await this.getBill(id);
    if (!current) throw new RepositoryError("That bill no longer exists.");

    const patchRow: Record<string, unknown> = {};
    if (patch.name !== undefined) patchRow.name = patch.name.trim();
    if (patch.kind !== undefined) patchRow.kind = patch.kind;
    if (patch.totalCentavos !== undefined) patchRow.total_centavos = patch.totalCentavos;
    if (patch.roundUpToPeso !== undefined) patchRow.round_up_to_peso = patch.roundUpToPeso;
    if (patch.dueOn !== undefined) patchRow.due_on = patch.dueOn;
    if (patch.startsOn !== undefined) patchRow.starts_on = patch.startsOn;
    if (patch.endsOn !== undefined) patchRow.ends_on = patch.endsOn;
    if (patch.rateMillicents !== undefined) {
      patchRow.rate_millicents = patch.rateMillicents;
      // Section 3 precondition: no rate => no appliances, no uses.
      if (patch.rateMillicents === null) {
        patchRow.appliances = [];
        patchRow.uses = [];
      }
    }

    const { data, error } = await this.client
      .from("bills")
      .update(patchRow)
      .eq("id", id)
      .select(SupabaseRepository.BILL_COLUMNS)
      .maybeSingle();
    if (error) fail(error);
    if (!data) throw new RepositoryError("That bill no longer exists.");
    const row = data as BillRow;
    const [bill] = await this.hydrateBills([row], row.room_id);
    return bill;
  }

  async deleteBill(id: string): Promise<void> {
    const { error, count } = await this.client.from("bills").delete({ count: "exact" }).eq("id", id);
    if (error) fail(error);
    if (!count) throw new RepositoryError("That bill no longer exists.");
  }

  async setMemberHours(billId: string, memberId: string, hours: number | null): Promise<Bill> {
    if (hours === null) {
      const { error } = await this.client
        .from("bill_member_hours")
        .delete()
        .eq("bill_id", billId)
        .eq("member_id", memberId);
      if (error) fail(error);
    } else {
      const { error } = await this.client
        .from("bill_member_hours")
        .upsert({ bill_id: billId, member_id: memberId, hours }, { onConflict: "bill_id,member_id" });
      if (error) fail(error);
    }
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    return bill;
  }

  async setLogAmount(
    billId: string,
    trackerId: string,
    memberId: string,
    amount: number | null,
  ): Promise<Bill> {
    if (amount === null) {
      const { error } = await this.client
        .from("bill_log_amounts")
        .delete()
        .eq("bill_id", billId)
        .eq("tracker_id", trackerId)
        .eq("member_id", memberId);
      if (error) fail(error);
    } else {
      const { error } = await this.client.from("bill_log_amounts").upsert(
        { bill_id: billId, tracker_id: trackerId, member_id: memberId, amount },
        { onConflict: "bill_id,tracker_id,member_id" },
      );
      if (error) fail(error);
    }
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    return bill;
  }

  /* -- a bill's frozen appliance copy -------------------------------------- */

  async addBillAppliance(billId: string, input: ApplianceInput): Promise<BillAppliance> {
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    if (bill.rateMillicents === null) {
      throw new RepositoryError("Add an electricity rate before adding appliances.");
    }
    const appliance: BillAppliance = {
      id: crypto.randomUUID(),
      label: input.label.trim(),
      mode: input.mode,
      kwhPerUnit: input.kwhPerUnit,
      trackerId: input.trackerId,
    };
    const { error } = await this.client
      .from("bills")
      .update({ appliances: [...bill.appliances, appliance] })
      .eq("id", billId);
    if (error) fail(error);
    return appliance;
  }

  async updateBillAppliance(
    billId: string,
    applianceId: string,
    patch: Partial<ApplianceInput>,
  ): Promise<BillAppliance> {
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    const index = bill.appliances.findIndex((a) => a.id === applianceId);
    if (index === -1) throw new RepositoryError("That appliance is no longer on this bill.");

    const updated: BillAppliance = {
      ...bill.appliances[index],
      ...(patch.label !== undefined && { label: patch.label.trim() }),
      ...(patch.mode !== undefined && { mode: patch.mode }),
      ...(patch.kwhPerUnit !== undefined && { kwhPerUnit: patch.kwhPerUnit }),
      ...(patch.trackerId !== undefined && { trackerId: patch.trackerId }),
    };
    const appliances = [...bill.appliances];
    appliances[index] = updated;

    // Hours logged against a now-always-on appliance would be nonsense.
    const uses =
      patch.mode === "always_on" ? bill.uses.filter((u) => u.applianceId !== applianceId) : bill.uses;

    const { error } = await this.client.from("bills").update({ appliances, uses }).eq("id", billId);
    if (error) fail(error);
    return updated;
  }

  async removeBillAppliance(billId: string, applianceId: string): Promise<void> {
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    const { error } = await this.client
      .from("bills")
      .update({
        appliances: bill.appliances.filter((a) => a.id !== applianceId),
        uses: bill.uses.filter((u) => u.applianceId !== applianceId),
      })
      .eq("id", billId);
    if (error) fail(error);
  }

  /* -- usage log ------------------------------------------------------------ */

  async addUse(billId: string, input: UseInput): Promise<ApplianceUse> {
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    if (!bill.appliances.some((a) => a.id === input.applianceId)) {
      throw new RepositoryError("That appliance is no longer on this bill.");
    }
    if (input.participantIds.length === 0) {
      throw new RepositoryError("Pick at least one person for this usage.");
    }
    const use: ApplianceUse = {
      id: crypto.randomUUID(),
      applianceId: input.applianceId,
      quantity: input.quantity,
      participantIds: [...input.participantIds],
      occurredOn: input.occurredOn,
      note: input.note,
    };
    const { error } = await this.client
      .from("bills")
      .update({ uses: [...bill.uses, use] })
      .eq("id", billId);
    if (error) fail(error);
    return use;
  }

  async updateUse(billId: string, useId: string, patch: Partial<UseInput>): Promise<ApplianceUse> {
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    const index = bill.uses.findIndex((u) => u.id === useId);
    if (index === -1) throw new RepositoryError("That usage entry no longer exists.");
    if (patch.participantIds !== undefined && patch.participantIds.length === 0) {
      throw new RepositoryError("Pick at least one person for this usage.");
    }

    const updated: ApplianceUse = {
      ...bill.uses[index],
      ...(patch.applianceId !== undefined && { applianceId: patch.applianceId }),
      ...(patch.quantity !== undefined && { quantity: patch.quantity }),
      ...(patch.participantIds !== undefined && { participantIds: [...patch.participantIds] }),
      ...(patch.occurredOn !== undefined && { occurredOn: patch.occurredOn }),
      ...(patch.note !== undefined && { note: patch.note }),
    };
    const uses = [...bill.uses];
    uses[index] = updated;

    const { error } = await this.client.from("bills").update({ uses }).eq("id", billId);
    if (error) fail(error);
    return updated;
  }

  async removeUse(billId: string, useId: string): Promise<void> {
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    const { error } = await this.client
      .from("bills")
      .update({ uses: bill.uses.filter((u) => u.id !== useId) })
      .eq("id", billId);
    if (error) fail(error);
  }

  /* -- other charges ---------------------------------------------------------- */

  async addOtherCharge(billId: string, input: OtherChargeInput): Promise<OtherCharge> {
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    const charge: OtherCharge = {
      id: crypto.randomUUID(),
      label: input.label.trim(),
      amountCentavos: input.amountCentavos,
      participantIds: input.participantIds ? [...input.participantIds] : null,
    };
    const { error } = await this.client
      .from("bills")
      .update({ other_charges: [...bill.otherCharges, charge] })
      .eq("id", billId);
    if (error) fail(error);
    return charge;
  }

  async updateOtherCharge(
    billId: string,
    chargeId: string,
    patch: Partial<OtherChargeInput>,
  ): Promise<OtherCharge> {
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    const index = bill.otherCharges.findIndex((c) => c.id === chargeId);
    if (index === -1) throw new RepositoryError("That charge no longer exists.");

    const updated: OtherCharge = {
      ...bill.otherCharges[index],
      ...(patch.label !== undefined && { label: patch.label.trim() }),
      ...(patch.amountCentavos !== undefined && { amountCentavos: patch.amountCentavos }),
      ...(patch.participantIds !== undefined && {
        participantIds: patch.participantIds ? [...patch.participantIds] : null,
      }),
    };
    const otherCharges = [...bill.otherCharges];
    otherCharges[index] = updated;

    const { error } = await this.client.from("bills").update({ other_charges: otherCharges }).eq("id", billId);
    if (error) fail(error);
    return updated;
  }

  async removeOtherCharge(billId: string, chargeId: string): Promise<void> {
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    const { error } = await this.client
      .from("bills")
      .update({ other_charges: bill.otherCharges.filter((c) => c.id !== chargeId) })
      .eq("id", billId);
    if (error) fail(error);
  }

  /* -- time tracking --------------------------------------------------------- */

  private async hydrateTrackers(rows: TrackerRow[]): Promise<Tracker[]> {
    if (rows.length === 0) return [];
    const trackerIds = rows.map((r) => r.id);

    const [runsRes, entriesRes] = await Promise.all([
      this.client
        .from("tracker_runs")
        .select("tracker_id, member_id, started_at, charged_to")
        .in("tracker_id", trackerIds),
      this.client
        .from("log_entries")
        .select("id, tracker_id, participant_ids, quantity, started_at, ended_at, created_at")
        .in("tracker_id", trackerIds),
    ]);
    if (runsRes.error) fail(runsRes.error);
    if (entriesRes.error) fail(entriesRes.error);

    const runsByTracker = groupBy((runsRes.data ?? []) as TrackerRunRow[], (r) => r.tracker_id);
    const entriesByTracker = groupBy((entriesRes.data ?? []) as LogEntryRow[], (e) => e.tracker_id);

    return rows.map((row) =>
      trackerFromRow(row, runsByTracker.get(row.id) ?? [], entriesByTracker.get(row.id) ?? []),
    );
  }

  private async getTracker(trackerId: string): Promise<Tracker> {
    const { data, error } = await this.client
      .from("trackers")
      .select("id, room_id, name, mode, built_in, sort_order, created_at")
      .eq("id", trackerId)
      .maybeSingle();
    if (error) fail(error);
    if (!data) throw new RepositoryError("That log no longer exists.");
    const [tracker] = await this.hydrateTrackers([data as TrackerRow]);
    return tracker;
  }

  async listTrackers(roomId: string): Promise<Tracker[]> {
    // Every room gets its built-in clock inside create_room()'s own
    // transaction, so unlike LocalRepository there is nothing to self-heal.
    const { data, error } = await this.client
      .from("trackers")
      .select("id, room_id, name, mode, built_in, sort_order, created_at")
      .eq("room_id", roomId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) fail(error);
    return this.hydrateTrackers((data ?? []) as TrackerRow[]);
  }

  async addTracker(roomId: string, input: TrackerInput): Promise<Tracker> {
    const { data: existing, error: sortError } = await this.client
      .from("trackers")
      .select("sort_order")
      .eq("room_id", roomId);
    if (sortError) fail(sortError);
    const nextOrder =
      (existing ?? []).length === 0 ? 0 : Math.max(...existing!.map((t) => t.sort_order as number)) + 1;

    const { data, error } = await this.client
      .from("trackers")
      .insert({ room_id: roomId, name: input.name.trim(), mode: input.mode, built_in: false, sort_order: nextOrder })
      .select("id, room_id, name, mode, built_in, sort_order, created_at")
      .single();
    if (error) fail(error);
    const [tracker] = await this.hydrateTrackers([data as TrackerRow]);
    return tracker;
  }

  async renameTracker(trackerId: string, name: string): Promise<Tracker> {
    const { error } = await this.client.from("trackers").update({ name: name.trim() }).eq("id", trackerId);
    if (error) fail(error);
    return this.getTracker(trackerId);
  }

  async removeTracker(trackerId: string): Promise<void> {
    const { data, error: selectError } = await this.client
      .from("trackers")
      .select("built_in")
      .eq("id", trackerId)
      .maybeSingle();
    if (selectError) fail(selectError);
    if (!data) throw new RepositoryError("That log no longer exists.");
    if (data.built_in) {
      throw new RepositoryError(
        "The hours-in-the-unit clock is what the split is weighted by, so it cannot be removed.",
      );
    }
    const { error } = await this.client.from("trackers").delete().eq("id", trackerId);
    if (error) fail(error);
  }

  async reorderTrackers(roomId: string, orderedIds: string[]): Promise<Tracker[]> {
    const current = await this.listTrackers(roomId);
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    await Promise.all(
      current.map((tracker) => {
        const sortOrder = rank.has(tracker.id)
          ? rank.get(tracker.id)!
          : orderedIds.length + tracker.sortOrder;
        return this.client.from("trackers").update({ sort_order: sortOrder }).eq("id", tracker.id);
      }),
    );
    return this.listTrackers(roomId);
  }

  async startClock(trackerId: string, memberId: string, chargedTo?: string[]): Promise<Tracker> {
    const { error } = await this.client.rpc("start_clock", {
      p_tracker_id: trackerId,
      p_member_id: memberId,
      p_charged_to: chargedTo?.length ? chargedTo : [],
    });
    if (error) fail(error);
    return this.getTracker(trackerId);
  }

  async stopClock(trackerId: string, memberId: string): Promise<Tracker> {
    const { error } = await this.client.rpc("stop_clock", {
      p_tracker_id: trackerId,
      p_member_id: memberId,
    });
    if (error) fail(error);
    return this.getTracker(trackerId);
  }

  async addLogEntry(
    trackerId: string,
    participantIds: string[],
    quantity: number,
    occurredAt?: string,
  ): Promise<Tracker> {
    if (participantIds.length === 0) {
      throw new RepositoryError("Tick at least one person this is charged to.");
    }
    const { error } = await this.client.from("log_entries").insert({
      tracker_id: trackerId,
      participant_ids: participantIds,
      quantity,
      started_at: null,
      ended_at: null,
      created_at: occurredAt ?? new Date().toISOString(),
    });
    if (error) fail(error);
    return this.getTracker(trackerId);
  }

  /** Every existing clocked span on a tracker, for the duplicate check below. */
  private async existingSpans(
    trackerId: string,
  ): Promise<{ startedAt: string; endedAt: string; participantIds: string[] }[]> {
    const { data, error } = await this.client
      .from("log_entries")
      .select("started_at, ended_at, participant_ids")
      .eq("tracker_id", trackerId)
      .not("started_at", "is", null)
      .not("ended_at", "is", null);
    if (error) fail(error);
    return (data ?? []).map((row) => ({
      startedAt: row.started_at as string,
      endedAt: row.ended_at as string,
      participantIds: row.participant_ids as string[],
    }));
  }

  async addClockEntry(
    trackerId: string,
    participantIds: string[],
    startedAt: string,
    endedAt: string,
  ): Promise<Tracker> {
    if (participantIds.length === 0) {
      throw new RepositoryError("Tick at least one person this is charged to.");
    }
    const hours = spanHours(startedAt, endedAt);
    // A double-tap or a retry resubmits the exact same span — skip it rather
    // than log the same stretch of time twice.
    const existing = await this.existingSpans(trackerId);
    if (!isDuplicateSpan(existing, startedAt, endedAt, participantIds)) {
      const { error } = await this.client.from("log_entries").insert({
        tracker_id: trackerId,
        participant_ids: participantIds,
        quantity: hours,
        started_at: startedAt,
        ended_at: endedAt,
      });
      if (error) fail(error);
    }
    return this.getTracker(trackerId);
  }

  async addClockEntries(
    trackerId: string,
    spans: { startedAt: string; endedAt: string; participantIds: string[] }[],
  ): Promise<Tracker> {
    if (spans.some((span) => span.participantIds.length === 0)) {
      throw new RepositoryError("Every entry needs at least one person it is charged to.");
    }
    // Validate every span BEFORE writing any: half a batch would leave the
    // log in a state nobody asked for.
    const hours = spans.map((span) => spanHours(span.startedAt, span.endedAt));

    // Checked against a list that GROWS as spans are accepted, so a
    // duplicate earlier in this same batch is caught too, not just one
    // already on the log.
    const known = await this.existingSpans(trackerId);
    const rows: {
      tracker_id: string;
      participant_ids: string[];
      quantity: number;
      started_at: string;
      ended_at: string;
    }[] = [];
    spans.forEach((span, i) => {
      if (isDuplicateSpan(known, span.startedAt, span.endedAt, span.participantIds)) return;
      known.push(span);
      rows.push({
        tracker_id: trackerId,
        participant_ids: span.participantIds,
        quantity: hours[i],
        started_at: span.startedAt,
        ended_at: span.endedAt,
      });
    });

    if (rows.length > 0) {
      const { error } = await this.client.from("log_entries").insert(rows);
      if (error) fail(error);
    }
    return this.getTracker(trackerId);
  }

  async updateLogEntry(
    trackerId: string,
    entryId: string,
    patch: {
      quantity?: number;
      participantIds?: string[];
      startedAt?: string;
      endedAt?: string;
      createdAt?: string;
    },
  ): Promise<Tracker> {
    if (patch.participantIds !== undefined && patch.participantIds.length === 0) {
      throw new RepositoryError("Tick at least one person this is charged to.");
    }
    const { data, error: selectError } = await this.client
      .from("log_entries")
      .select("id, tracker_id, participant_ids, quantity, started_at, ended_at, created_at")
      .eq("id", entryId)
      .eq("tracker_id", trackerId)
      .maybeSingle();
    if (selectError) fail(selectError);
    if (!data) throw new RepositoryError("That entry is no longer in this log.");
    const current = data as LogEntryRow;

    const startedAt = patch.startedAt ?? current.started_at;
    const endedAt = patch.endedAt ?? current.ended_at;
    // A span entry's hours ARE its span — derived here so the two can never
    // disagree, same rule LocalRepository enforces.
    const quantity =
      startedAt && endedAt ? spanHours(startedAt, endedAt) : (patch.quantity ?? current.quantity);

    const { error } = await this.client
      .from("log_entries")
      .update({
        quantity,
        started_at: startedAt,
        ended_at: endedAt,
        created_at: patch.createdAt ?? current.created_at,
        ...(patch.participantIds !== undefined && { participant_ids: patch.participantIds }),
      })
      .eq("id", entryId);
    if (error) fail(error);
    return this.getTracker(trackerId);
  }

  async removeLogEntry(trackerId: string, entryId: string): Promise<Tracker> {
    const { error } = await this.client.from("log_entries").delete().eq("id", entryId);
    if (error) fail(error);
    return this.getTracker(trackerId);
  }

  /* -- settling up ------------------------------------------------------------ */

  async setPaid(billId: string, memberId: string, paid: boolean): Promise<Bill> {
    if (paid) {
      const { error } = await this.client
        .from("bill_paid")
        .upsert({ bill_id: billId, member_id: memberId }, { onConflict: "bill_id,member_id" });
      if (error) fail(error);
    } else {
      const { error } = await this.client
        .from("bill_paid")
        .delete()
        .eq("bill_id", billId)
        .eq("member_id", memberId);
      if (error) fail(error);
    }
    const bill = await this.getBill(billId);
    if (!bill) throw new RepositoryError("That bill no longer exists.");
    return bill;
  }
}
