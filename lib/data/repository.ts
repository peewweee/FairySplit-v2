import type {
  ApplianceMode,
  ApplianceTemplate,
  ApplianceUse,
  Bill,
  BillAppliance,
  BillKind,
  Centavos,
  Identity,
  Member,
  Millicents,
  OtherCharge,
  Room,
  Tracker,
  TrackerMode,
} from "@/lib/data/types";

/**
 * The seam (§9).
 *
 * EVERY method is async, even though today's implementation is synchronous
 * localStorage. That is the entire point: components already `await`, already
 * render loading states, and Phase B swaps in Supabase by changing one line in
 * `lib/data/index.ts` — no component touched.
 *
 * Rules enforced by convention and by `npm run lint:seam`:
 *   - no component imports `localStorage` directly, ever
 *   - no component builds its own storage key
 *   - ids come from `crypto.randomUUID()`
 */

export interface CreateBillInput {
  name: string;
  kind: BillKind;
  totalCentavos: Centavos;
  roundUpToPeso: boolean;
  rateMillicents: Millicents | null;
  dueOn: string | null;
  /** Required for every kind except "other", which may leave them null. */
  startsOn: string | null;
  endsOn: string | null;
  /** Seed the frozen appliance copy from the room's active templates. */
  seedFromRoomTemplates?: boolean;
}

export interface UpdateBillInput {
  name?: string;
  kind?: BillKind;
  totalCentavos?: Centavos;
  roundUpToPeso?: boolean;
  rateMillicents?: Millicents | null;
  dueOn?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface ApplianceInput {
  label: string;
  mode: ApplianceMode;
  kwhPerUnit: number | null;
  /** null = shared equally; otherwise the Tracker its quantities come from. */
  trackerId: string | null;
}

export interface UseInput {
  applianceId: string;
  quantity: number;
  participantIds: string[];
  occurredOn: string | null;
  note: string | null;
}

export interface TrackerInput {
  name: string;
  mode: TrackerMode;
}

export interface OtherChargeInput {
  label: string;
  amountCentavos: Centavos;
  participantIds: string[] | null;
}

/** What a person would take with them if removed. Backs the delete confirm. */
export interface MemberFootprint {
  usageCount: number;
  chargeCount: number;
  billsWithDays: number;
}

export interface Repository {
  /* -- identity ---------------------------------------------------------- */
  getIdentity(): Promise<Identity | null>;
  setIdentity(name: string): Promise<Identity>;

  /* -- rooms ------------------------------------------------------------- */
  listRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | null>;
  createRoom(name: string, creatorName: string): Promise<Room>;
  joinRoom(code: string): Promise<Room>;
  renameRoom(id: string, name: string): Promise<Room>;
  deleteRoom(id: string): Promise<void>;

  /* -- members ----------------------------------------------------------- */
  listMembers(roomId: string): Promise<Member[]>;
  addMember(roomId: string, name: string): Promise<Member>;
  renameMember(roomId: string, memberId: string, name: string): Promise<Member>;
  removeMember(roomId: string, memberId: string): Promise<void>;
  /** A COUNT query, so the UI can warn before deleting someone with history. */
  getMemberFootprint(roomId: string, memberId: string): Promise<MemberFootprint>;

  /* -- room appliance templates ------------------------------------------ */
  addApplianceTemplate(roomId: string, input: ApplianceInput): Promise<ApplianceTemplate>;
  updateApplianceTemplate(
    roomId: string,
    templateId: string,
    patch: Partial<ApplianceInput> & { active?: boolean },
  ): Promise<ApplianceTemplate>;
  removeApplianceTemplate(roomId: string, templateId: string): Promise<void>;

  /* -- bills ------------------------------------------------------------- */
  listBills(roomId: string): Promise<Bill[]>;
  getBill(id: string): Promise<Bill | null>;
  createBill(roomId: string, input: CreateBillInput): Promise<Bill>;
  updateBill(id: string, patch: UpdateBillInput): Promise<Bill>;
  deleteBill(id: string): Promise<void>;
  /** The ONE writer of occupancy (section 12). Phase C writes here from the
   *  timer instead of from a typed number. */
  setMemberHours(billId: string, memberId: string, hours: number | null): Promise<Bill>;
  /** null clears the override, putting that row back under the log's control. */
  setLogAmount(
    billId: string,
    trackerId: string,
    memberId: string,
    amount: number | null,
  ): Promise<Bill>;

  /* -- a bill's frozen appliance copy ------------------------------------ */
  addBillAppliance(billId: string, input: ApplianceInput): Promise<BillAppliance>;
  updateBillAppliance(
    billId: string,
    applianceId: string,
    patch: Partial<ApplianceInput>,
  ): Promise<BillAppliance>;
  removeBillAppliance(billId: string, applianceId: string): Promise<void>;

  /* -- usage log --------------------------------------------------------- */
  addUse(billId: string, input: UseInput): Promise<ApplianceUse>;
  updateUse(billId: string, useId: string, patch: Partial<UseInput>): Promise<ApplianceUse>;
  removeUse(billId: string, useId: string): Promise<void>;

  /* -- other charges ----------------------------------------------------- */
  addOtherCharge(billId: string, input: OtherChargeInput): Promise<OtherCharge>;
  updateOtherCharge(
    billId: string,
    chargeId: string,
    patch: Partial<OtherChargeInput>,
  ): Promise<OtherCharge>;
  removeOtherCharge(billId: string, chargeId: string): Promise<void>;

  /* -- time tracking ------------------------------------------------------ *
   * Wall-clock is read HERE, in the repository, and nowhere above it. A
   * component that wanted `new Date()` of its own could start a clock at a
   * moment the store never agreed to.
   * ----------------------------------------------------------------------- */
  /** Always returns at least the room's built-in occupancy clock. */
  listTrackers(roomId: string): Promise<Tracker[]>;
  addTracker(roomId: string, input: TrackerInput): Promise<Tracker>;
  renameTracker(trackerId: string, name: string): Promise<Tracker>;
  /** Refuses on the built-in occupancy clock. */
  removeTracker(trackerId: string): Promise<void>;
  /** Rewrites the whole room's order from a list of ids, first to last. */
  reorderTrackers(roomId: string, orderedIds: string[]): Promise<Tracker[]>;
  /** No-op if this person's clock is already running. */
  startClock(trackerId: string, memberId: string): Promise<Tracker>;
  /** Closes the open run into an entry. No-op if nothing is running. */
  stopClock(trackerId: string, memberId: string): Promise<Tracker>;
  /** A typed amount, in the tracker's own unit. */
  addLogEntry(trackerId: string, memberId: string, quantity: number): Promise<Tracker>;
  removeLogEntry(trackerId: string, entryId: string): Promise<Tracker>;

  /* -- settling up ------------------------------------------------------- */
  setPaid(billId: string, memberId: string, paid: boolean): Promise<Bill>;
}

/** Thrown for "you asked for something that isn't here" — surfaced as UI copy. */
export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}
