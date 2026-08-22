import type {
  ApplianceTemplate,
  ApplianceUse,
  Bill,
  BillAppliance,
  BillKind,
  Identity,
  Member,
  OtherCharge,
  Room,
  Tracker,
} from "@/lib/data/types";
import { OCCUPANCY_TRACKER_NAME } from "@/lib/data/types";
import { HOURS_PER_DAY } from "@/lib/billing/occupancy";
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

/**
 * The Phase A implementation: one JSON blob in localStorage.
 *
 * This is the ONLY file in the codebase that names a storage key or touches
 * `localStorage`. Phase B adds `supabase-repository.ts` beside it and swaps the
 * export in `index.ts`.
 */
const STORAGE_KEY = "fairysplit:v2";
const LEGACY_KEY_V1 = "fairysplit:v1";
const SCHEMA_VERSION = 2;

/** 6 chars. 0/O/1/I deliberately absent - they get misread out loud (section 5). */
const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const JOIN_CODE_LENGTH = 6;

interface FairyDb {
  version: number;
  identity: Identity | null;
  members: Record<string, Member>;
  rooms: Record<string, Room>;
  bills: Record<string, Bill>;
  trackers: Record<string, Tracker>;
}

const emptyDb = (): FairyDb => ({
  version: SCHEMA_VERSION,
  identity: null,
  members: {},
  rooms: {},
  bills: {},
  trackers: {},
});

/** Notifies open screens that the store changed, including other tabs. */
const CHANGE_EVENT = "fairysplit:changed";

/**
 * The v1 shape, kept only so existing data survives the move to bill-owned
 * coverage. v1 hung day counts off a separate Period record; v2 folds each
 * period into the bills that used it.
 */
interface LegacyPeriodV1 {
  id: string;
  roomId: string;
  startsOn: string | null;
  endsOn: string | null;
  dayCount: number | null;
  memberDays: Record<string, number | null>;
}

function migrateV1(raw: string): FairyDb {
  const old = JSON.parse(raw) as {
    identity?: Identity | null;
    members?: Record<string, Member>;
    rooms?: Record<string, Room>;
    periods?: Record<string, LegacyPeriodV1>;
    bills?: Record<string, Bill & { periodId?: string }>;
  };
  const db = emptyDb();
  db.identity = old.identity ?? null;
  db.members = old.members ?? {};
  db.rooms = old.rooms ?? {};

  for (const bill of Object.values(old.bills ?? {})) {
    const period = bill.periodId ? old.periods?.[bill.periodId] : undefined;
    // A bill whose period vanished has no room to belong to; it was already
    // orphaned in v1, so there is nothing to carry forward.
    if (!period) continue;
    const carried = { ...bill };
    delete carried.periodId;
    delete (carried as { dayCount?: unknown }).dayCount;
    db.bills[bill.id] = {
      ...carried,
      kind: inferKind(bill),
      roomId: period.roomId,
      startsOn: period.startsOn ?? null,
      endsOn: period.endsOn ?? null,
      memberHours: Object.fromEntries(
        Object.entries(period.memberDays ?? {}).map(([id, days]) => [
          id,
          days == null ? null : days * HOURS_PER_DAY,
        ]),
      ),
    };
  }
  return db;
}

/**
 * `kind` arrived after the first bills did. A bill with a rate was an
 * electricity bill; anything else behaves like water (dates required), which is
 * how those bills already worked. Never guess "other" — that would quietly make
 * required dates optional on a bill that already has them.
 */
function inferKind(bill: Bill): BillKind {
  if (bill.kind) return bill.kind;
  return bill.rateMillicents !== null ? "electricity" : "water";
}

/**
 * Occupancy used to be stored as whole DAYS. It is hours now, because that is
 * what the clock in/out system will record. Reading a day count as an hour
 * count would quietly shrink everyone's stay 24-fold, so convert it.
 */
function normaliseBills(bills: Record<string, Bill>): Record<string, Bill> {
  for (const bill of Object.values(bills)) {
    bill.kind = inferKind(bill);
    const legacy = (bill as unknown as { memberDays?: Record<string, number | null> }).memberDays;
    if (legacy && !bill.memberHours) {
      bill.memberHours = Object.fromEntries(
        Object.entries(legacy).map(([id, days]) => [id, days == null ? null : days * HOURS_PER_DAY]),
      );
      delete (bill as unknown as { memberDays?: unknown }).memberDays;
    }
    bill.memberHours ??= {};
  }
  return bills;
}

function readDb(): FairyDb {
  if (typeof window === "undefined") return emptyDb();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FairyDb>;
      const db = { ...emptyDb(), ...parsed };
      db.bills = normaliseBills(db.bills);
      return db;
    }
    const legacy = window.localStorage.getItem(LEGACY_KEY_V1);
    if (legacy) {
      const migrated = migrateV1(legacy);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return emptyDb();
  } catch {
    // Corrupt blob: start clean rather than wedging the whole app.
    return emptyDb();
  }
}

function writeDb(db: FairyDb): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Read, mutate, write, return - every writer goes through here. */
function mutate<T>(fn: (db: FairyDb) => T): T {
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return result;
}

const clone = <T>(value: T): T => structuredClone(value);
const newId = () => crypto.randomUUID();

function makeJoinCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(JOIN_CODE_LENGTH));
    let code = "";
    for (const b of bytes) code += JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length];
    if (!taken.has(code)) return code;
  }
  throw new RepositoryError("Could not generate a unique join code.");
}

/** Normalises what the user typed so "abc 123" finds "ABC123". */
export function normaliseJoinCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function requireRoom(db: FairyDb, id: string): Room {
  const room = db.rooms[id];
  if (!room) throw new RepositoryError("That room no longer exists on this device.");
  return room;
}

function requireBill(db: FairyDb, id: string): Bill {
  const bill = db.bills[id];
  if (!bill) throw new RepositoryError("That bill no longer exists.");
  return bill;
}

function requireTracker(db: FairyDb, id: string): Tracker {
  const tracker = db.trackers[id];
  if (!tracker) throw new RepositoryError("That log no longer exists.");
  return tracker;
}

/**
 * Every room has an occupancy clock, including rooms that predate trackers
 * entirely. Created on first read rather than in a schema migration, so an
 * older blob heals itself the moment somebody opens the room.
 */
function ensureOccupancyTracker(db: FairyDb, roomId: string): Tracker {
  const existing = Object.values(db.trackers).find((t) => t.roomId === roomId && t.builtIn);
  if (existing) return existing;
  const tracker: Tracker = {
    id: newId(),
    roomId,
    name: OCCUPANCY_TRACKER_NAME,
    mode: "clock",
    builtIn: true,
    runningSince: {},
    entries: [],
    createdAt: new Date().toISOString(),
  };
  db.trackers[tracker.id] = tracker;
  return tracker;
}

export class LocalRepository implements Repository {
  /* -- identity ---------------------------------------------------------- */

  async getIdentity(): Promise<Identity | null> {
    return clone(readDb().identity);
  }

  async setIdentity(name: string): Promise<Identity> {
    return mutate((db) => {
      db.identity = { name: name.trim() };
      return clone(db.identity);
    });
  }

  /* -- rooms ------------------------------------------------------------- */

  async listRooms(): Promise<Room[]> {
    const db = readDb();
    return Object.values(db.rooms)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(clone);
  }

  async getRoom(id: string): Promise<Room | null> {
    const room = readDb().rooms[id];
    return room ? clone(room) : null;
  }

  async createRoom(name: string, creatorName: string): Promise<Room> {
    return mutate((db) => {
      const taken = new Set(Object.values(db.rooms).map((r) => r.joinCode));
      const room: Room = {
        id: newId(),
        name: name.trim(),
        joinCode: makeJoinCode(taken),
        memberIds: [],
        applianceDefaults: [],
        // Wall-clock is read here, at the edge - never inside the engine.
        createdAt: new Date().toISOString(),
      };
      const creator = creatorName.trim();
      if (creator) {
        const member: Member = { id: newId(), name: creator };
        db.members[member.id] = member;
        room.memberIds.push(member.id);
      }
      db.rooms[room.id] = room;
      return clone(room);
    });
  }

  async joinRoom(code: string): Promise<Room> {
    const wanted = normaliseJoinCode(code);
    const db = readDb();
    const room = Object.values(db.rooms).find((r) => r.joinCode === wanted);
    if (!room) {
      // Be honest (section 9): with no backend this can only search THIS browser.
      throw new RepositoryError(
        `No room with code ${wanted} on this device. Join codes cannot reach another phone or laptop until sync is added.`,
      );
    }
    return clone(room);
  }

  async renameRoom(id: string, name: string): Promise<Room> {
    return mutate((db) => {
      const room = requireRoom(db, id);
      room.name = name.trim();
      return clone(room);
    });
  }

  async deleteRoom(id: string): Promise<void> {
    mutate((db) => {
      const room = requireRoom(db, id);
      for (const bill of Object.values(db.bills)) {
        if (bill.roomId === id) delete db.bills[bill.id];
      }
      for (const memberId of room.memberIds) delete db.members[memberId];
      for (const tracker of Object.values(db.trackers)) {
        if (tracker.roomId === id) delete db.trackers[tracker.id];
      }
      delete db.rooms[id];
    });
  }

  /* -- members ----------------------------------------------------------- */

  async listMembers(roomId: string): Promise<Member[]> {
    const db = readDb();
    const room = requireRoom(db, roomId);
    return room.memberIds
      .map((id) => db.members[id])
      .filter((m): m is Member => Boolean(m))
      .map(clone);
  }

  async addMember(roomId: string, name: string): Promise<Member> {
    return mutate((db) => {
      const room = requireRoom(db, roomId);
      const member: Member = { id: newId(), name: name.trim() };
      db.members[member.id] = member;
      room.memberIds.push(member.id);
      // Every existing bill gains an unfilled slot for the newcomer.
      for (const bill of Object.values(db.bills)) {
        if (bill.roomId === roomId) bill.memberHours[member.id] = null;
      }
      return clone(member);
    });
  }

  async renameMember(roomId: string, memberId: string, name: string): Promise<Member> {
    return mutate((db) => {
      requireRoom(db, roomId);
      const member = db.members[memberId];
      if (!member) throw new RepositoryError("That person is no longer in this room.");
      member.name = name.trim();
      return clone(member);
    });
  }

  async getMemberFootprint(roomId: string, memberId: string): Promise<MemberFootprint> {
    const db = readDb();
    requireRoom(db, roomId);
    const roomBills = Object.values(db.bills).filter((b) => b.roomId === roomId);

    let usageCount = 0;
    let chargeCount = 0;
    for (const bill of roomBills) {
      usageCount += bill.uses.filter((u) => u.participantIds.includes(memberId)).length;
      chargeCount += bill.otherCharges.filter((c) =>
        c.participantIds ? c.participantIds.includes(memberId) : false,
      ).length;
    }

    const billsWithDays = roomBills.filter((b) => {
      const hours = b.memberHours[memberId];
      return typeof hours === "number" && hours > 0;
    }).length;

    return { usageCount, chargeCount, billsWithDays };
  }

  async removeMember(roomId: string, memberId: string): Promise<void> {
    mutate((db) => {
      const room = requireRoom(db, roomId);
      room.memberIds = room.memberIds.filter((id) => id !== memberId);
      delete db.members[memberId];

      for (const bill of Object.values(db.bills)) {
        if (bill.roomId !== roomId) continue;
        delete bill.memberHours[memberId];
        {
          // Drop them from every use; a use with nobody left is meaningless.
          bill.uses = bill.uses
            .map((use) => ({
              ...use,
              participantIds: use.participantIds.filter((id) => id !== memberId),
            }))
            .filter((use) => use.participantIds.length > 0);
          bill.otherCharges = bill.otherCharges.map((charge) => {
            if (charge.participantIds === null) return charge;
            const left = charge.participantIds.filter((id) => id !== memberId);
            // An empty list would mean "nobody", but the charge still has to go
            // somewhere for the bill to reconcile — so it reverts to everyone.
            return { ...charge, participantIds: left.length > 0 ? left : null };
          });
          bill.paidMemberIds = bill.paidMemberIds.filter((id) => id !== memberId);
        }
      }

      // Their logs leave with them, running clocks included.
      for (const tracker of Object.values(db.trackers)) {
        if (tracker.roomId !== roomId) continue;
        delete tracker.runningSince[memberId];
        tracker.entries = tracker.entries.filter((e) => e.memberId !== memberId);
      }
    });
  }

  /* -- room appliance templates ------------------------------------------ */

  async addApplianceTemplate(roomId: string, input: ApplianceInput): Promise<ApplianceTemplate> {
    return mutate((db) => {
      const room = requireRoom(db, roomId);
      const template: ApplianceTemplate = {
        id: newId(),
        label: input.label.trim(),
        mode: input.mode,
        kwhPerUnit: input.kwhPerUnit,
        active: true,
      };
      room.applianceDefaults.push(template);
      return clone(template);
    });
  }

  async updateApplianceTemplate(
    roomId: string,
    templateId: string,
    patch: Partial<ApplianceInput> & { active?: boolean },
  ): Promise<ApplianceTemplate> {
    return mutate((db) => {
      const room = requireRoom(db, roomId);
      const template = room.applianceDefaults.find((t) => t.id === templateId);
      if (!template) throw new RepositoryError("That appliance template no longer exists.");
      if (patch.label !== undefined) template.label = patch.label.trim();
      if (patch.mode !== undefined) template.mode = patch.mode;
      if (patch.kwhPerUnit !== undefined) template.kwhPerUnit = patch.kwhPerUnit;
      if (patch.active !== undefined) template.active = patch.active;
      return clone(template);
    });
  }

  async removeApplianceTemplate(roomId: string, templateId: string): Promise<void> {
    mutate((db) => {
      const room = requireRoom(db, roomId);
      room.applianceDefaults = room.applianceDefaults.filter((t) => t.id !== templateId);
    });
  }

  /* -- bills ------------------------------------------------------------- */

  async listBills(roomId: string): Promise<Bill[]> {
    const db = readDb();
    return Object.values(db.bills)
      .filter((b) => b.roomId === roomId)
      // Newest coverage first; a bill with no dates falls back to when it was
      // created, so the list still has a stable, sensible order.
      .sort(
        (a, b) =>
          (b.startsOn ?? "").localeCompare(a.startsOn ?? "") ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
      )
      .map(clone);
  }

  async getBill(id: string): Promise<Bill | null> {
    const bill = readDb().bills[id];
    return bill ? clone(bill) : null;
  }

  async createBill(roomId: string, input: CreateBillInput): Promise<Bill> {
    return mutate((db) => {
      const room = requireRoom(db, roomId);

      // Section 5: a FROZEN COPY. If this referenced the room template, editing
      // next month's aircon rating would silently rewrite a bill someone paid.
      // Only meaningful in itemized mode - with no rate there are no appliances.
      // A template with no kWh figure yet is skipped rather than copied in as a
      // half-configured appliance the engine would have to guess at.
      const appliances: BillAppliance[] =
        input.seedFromRoomTemplates && input.rateMillicents !== null
          ? room.applianceDefaults
              .filter((t) => t.active && t.kwhPerUnit !== null)
              .map((t) => ({
                id: newId(),
                label: t.label,
                mode: t.mode,
                kwhPerUnit: t.kwhPerUnit,
              }))
          : [];

      // Every member starts with an unfilled day count, so the bill screen can
      // render a row per person the moment it opens.
      const memberHours: Record<string, number | null> = {};
      for (const memberId of room.memberIds) memberHours[memberId] = null;

      const bill: Bill = {
        id: newId(),
        roomId,
        kind: input.kind,
        name: input.name.trim(),
        totalCentavos: input.totalCentavos,
        roundUpToPeso: input.roundUpToPeso,
        rateMillicents: input.rateMillicents,
        dueOn: input.dueOn,
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
        memberHours,
        appliances,
        uses: [],
        otherCharges: [],
        paidMemberIds: [],
        createdAt: new Date().toISOString(),
      };
      db.bills[bill.id] = bill;
      return clone(bill);
    });
  }

  async updateBill(id: string, patch: UpdateBillInput): Promise<Bill> {
    return mutate((db) => {
      const bill = requireBill(db, id);
      if (patch.name !== undefined) bill.name = patch.name.trim();
      if (patch.kind !== undefined) bill.kind = patch.kind;
      if (patch.totalCentavos !== undefined) bill.totalCentavos = patch.totalCentavos;
      if (patch.roundUpToPeso !== undefined) bill.roundUpToPeso = patch.roundUpToPeso;
      if (patch.dueOn !== undefined) bill.dueOn = patch.dueOn;
      if (patch.startsOn !== undefined) bill.startsOn = patch.startsOn;
      if (patch.endsOn !== undefined) bill.endsOn = patch.endsOn;
      if (patch.rateMillicents !== undefined) {
        bill.rateMillicents = patch.rateMillicents;
        // Section 3 precondition: no rate => no appliances, no uses. The UI
        // warns before this happens; the store enforces it so the engine's
        // precondition can never be violated by a stale record.
        if (patch.rateMillicents === null) {
          bill.appliances = [];
          bill.uses = [];
        }
      }
      return clone(bill);
    });
  }

  async deleteBill(id: string): Promise<void> {
    mutate((db) => {
      requireBill(db, id);
      delete db.bills[id];
    });
  }

  /**
   * The ONE writer of occupancy (section 12). Phase C writes here from the
   * timer instead of from a typed field, and nothing above this line changes.
   */
  async setMemberHours(billId: string, memberId: string, hours: number | null): Promise<Bill> {
    return mutate((db) => {
      const bill = requireBill(db, billId);
      bill.memberHours[memberId] = hours;
      return clone(bill);
    });
  }

  /* -- a bill's frozen appliance copy ------------------------------------ */

  async addBillAppliance(billId: string, input: ApplianceInput): Promise<BillAppliance> {
    return mutate((db) => {
      const bill = requireBill(db, billId);
      if (bill.rateMillicents === null) {
        throw new RepositoryError("Add an electricity rate before adding appliances.");
      }
      const appliance: BillAppliance = {
        id: newId(),
        label: input.label.trim(),
        mode: input.mode,
        kwhPerUnit: input.kwhPerUnit,
      };
      bill.appliances.push(appliance);
      return clone(appliance);
    });
  }

  async updateBillAppliance(
    billId: string,
    applianceId: string,
    patch: Partial<ApplianceInput>,
  ): Promise<BillAppliance> {
    return mutate((db) => {
      const bill = requireBill(db, billId);
      const appliance = bill.appliances.find((a) => a.id === applianceId);
      if (!appliance) throw new RepositoryError("That appliance is no longer on this bill.");
      if (patch.label !== undefined) appliance.label = patch.label.trim();
      if (patch.mode !== undefined) {
        appliance.mode = patch.mode;
        // Hours logged against a now-always-on appliance would be nonsense.
        if (patch.mode === "always_on") {
          bill.uses = bill.uses.filter((u) => u.applianceId !== applianceId);
        }
      }
      if (patch.kwhPerUnit !== undefined) appliance.kwhPerUnit = patch.kwhPerUnit;
      return clone(appliance);
    });
  }

  async removeBillAppliance(billId: string, applianceId: string): Promise<void> {
    mutate((db) => {
      const bill = requireBill(db, billId);
      bill.appliances = bill.appliances.filter((a) => a.id !== applianceId);
      bill.uses = bill.uses.filter((u) => u.applianceId !== applianceId);
    });
  }

  /* -- usage log --------------------------------------------------------- */

  async addUse(billId: string, input: UseInput): Promise<ApplianceUse> {
    return mutate((db) => {
      const bill = requireBill(db, billId);
      if (!bill.appliances.some((a) => a.id === input.applianceId)) {
        throw new RepositoryError("That appliance is no longer on this bill.");
      }
      if (input.participantIds.length === 0) {
        throw new RepositoryError("Pick at least one person for this usage.");
      }
      const use: ApplianceUse = {
        id: newId(),
        applianceId: input.applianceId,
        quantity: input.quantity,
        participantIds: [...input.participantIds],
        occurredOn: input.occurredOn,
        note: input.note,
      };
      bill.uses.push(use);
      return clone(use);
    });
  }

  async updateUse(billId: string, useId: string, patch: Partial<UseInput>): Promise<ApplianceUse> {
    return mutate((db) => {
      const bill = requireBill(db, billId);
      const use = bill.uses.find((u) => u.id === useId);
      if (!use) throw new RepositoryError("That usage entry no longer exists.");
      if (patch.applianceId !== undefined) use.applianceId = patch.applianceId;
      if (patch.quantity !== undefined) use.quantity = patch.quantity;
      if (patch.participantIds !== undefined) {
        if (patch.participantIds.length === 0) {
          throw new RepositoryError("Pick at least one person for this usage.");
        }
        use.participantIds = [...patch.participantIds];
      }
      if (patch.occurredOn !== undefined) use.occurredOn = patch.occurredOn;
      if (patch.note !== undefined) use.note = patch.note;
      return clone(use);
    });
  }

  async removeUse(billId: string, useId: string): Promise<void> {
    mutate((db) => {
      const bill = requireBill(db, billId);
      bill.uses = bill.uses.filter((u) => u.id !== useId);
    });
  }

  /* -- other charges ----------------------------------------------------- */

  async addOtherCharge(billId: string, input: OtherChargeInput): Promise<OtherCharge> {
    return mutate((db) => {
      const bill = requireBill(db, billId);
      const charge: OtherCharge = {
        id: newId(),
        label: input.label.trim(),
        amountCentavos: input.amountCentavos,
        participantIds: input.participantIds ? [...input.participantIds] : null,
      };
      bill.otherCharges.push(charge);
      return clone(charge);
    });
  }

  async updateOtherCharge(
    billId: string,
    chargeId: string,
    patch: Partial<OtherChargeInput>,
  ): Promise<OtherCharge> {
    return mutate((db) => {
      const bill = requireBill(db, billId);
      const charge = bill.otherCharges.find((c) => c.id === chargeId);
      if (!charge) throw new RepositoryError("That charge no longer exists.");
      if (patch.label !== undefined) charge.label = patch.label.trim();
      if (patch.amountCentavos !== undefined) charge.amountCentavos = patch.amountCentavos;
      if (patch.participantIds !== undefined) {
        charge.participantIds = patch.participantIds ? [...patch.participantIds] : null;
      }
      return clone(charge);
    });
  }

  async removeOtherCharge(billId: string, chargeId: string): Promise<void> {
    mutate((db) => {
      const bill = requireBill(db, billId);
      bill.otherCharges = bill.otherCharges.filter((c) => c.id !== chargeId);
    });
  }

  /* -- time tracking ------------------------------------------------------ */

  async listTrackers(roomId: string): Promise<Tracker[]> {
    return mutate((db) => {
      requireRoom(db, roomId);
      ensureOccupancyTracker(db, roomId);
      return Object.values(db.trackers)
        .filter((t) => t.roomId === roomId)
        // Built-in first, then oldest-added; id breaks a same-instant tie so
        // the order never shuffles between reads.
        .sort(
          (a, b) =>
            Number(b.builtIn) - Number(a.builtIn) ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.id.localeCompare(b.id),
        )
        .map(clone);
    });
  }

  async addTracker(roomId: string, input: TrackerInput): Promise<Tracker> {
    return mutate((db) => {
      requireRoom(db, roomId);
      const tracker: Tracker = {
        id: newId(),
        roomId,
        name: input.name.trim(),
        mode: input.mode,
        builtIn: false,
        runningSince: {},
        entries: [],
        createdAt: new Date().toISOString(),
      };
      db.trackers[tracker.id] = tracker;
      return clone(tracker);
    });
  }

  async renameTracker(trackerId: string, name: string): Promise<Tracker> {
    return mutate((db) => {
      const tracker = requireTracker(db, trackerId);
      tracker.name = name.trim();
      return clone(tracker);
    });
  }

  async removeTracker(trackerId: string): Promise<void> {
    mutate((db) => {
      const tracker = requireTracker(db, trackerId);
      if (tracker.builtIn) {
        throw new RepositoryError(
          "The hours-in-the-unit clock is what the split is weighted by, so it cannot be removed.",
        );
      }
      delete db.trackers[trackerId];
    });
  }

  async startClock(trackerId: string, memberId: string): Promise<Tracker> {
    return mutate((db) => {
      const tracker = requireTracker(db, trackerId);
      if (tracker.mode !== "clock") {
        throw new RepositoryError("That log is typed in by hand, not clocked.");
      }
      // Already running: leave the original start alone. Restarting it here
      // would silently discard however long they have been clocked in.
      tracker.runningSince[memberId] ??= new Date().toISOString();
      return clone(tracker);
    });
  }

  async stopClock(trackerId: string, memberId: string): Promise<Tracker> {
    return mutate((db) => {
      const tracker = requireTracker(db, trackerId);
      const startedAt = tracker.runningSince[memberId];
      if (!startedAt) return clone(tracker);
      const endedAt = new Date().toISOString();
      const hours = Math.max(0, (Date.parse(endedAt) - Date.parse(startedAt)) / 3_600_000);
      delete tracker.runningSince[memberId];
      // A run of a few milliseconds — a mis-tap — is not worth a row.
      if (hours > 0) {
        tracker.entries.push({
          id: newId(),
          memberId,
          quantity: hours,
          startedAt,
          endedAt,
          createdAt: endedAt,
        });
      }
      return clone(tracker);
    });
  }

  async addLogEntry(trackerId: string, memberId: string, quantity: number): Promise<Tracker> {
    return mutate((db) => {
      const tracker = requireTracker(db, trackerId);
      const now = new Date().toISOString();
      tracker.entries.push({
        id: newId(),
        memberId,
        quantity,
        startedAt: null,
        endedAt: null,
        createdAt: now,
      });
      return clone(tracker);
    });
  }

  async removeLogEntry(trackerId: string, entryId: string): Promise<Tracker> {
    return mutate((db) => {
      const tracker = requireTracker(db, trackerId);
      tracker.entries = tracker.entries.filter((e) => e.id !== entryId);
      return clone(tracker);
    });
  }

  /* -- settling up ------------------------------------------------------- */

  async setPaid(billId: string, memberId: string, paid: boolean): Promise<Bill> {
    return mutate((db) => {
      const bill = requireBill(db, billId);
      const already = bill.paidMemberIds.includes(memberId);
      if (paid && !already) bill.paidMemberIds.push(memberId);
      if (!paid && already) {
        bill.paidMemberIds = bill.paidMemberIds.filter((id) => id !== memberId);
      }
      return clone(bill);
    });
  }
}

/** Subscribe to store changes (this tab and, via `storage`, other tabs). */
export function subscribeToChanges(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
