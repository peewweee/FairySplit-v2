import { LocalRepository } from "@/lib/data/local-repository";
import type { Repository } from "@/lib/data/repository";

/**
 * The active implementation. Phase B changes exactly this line:
 *
 *   export const repo: Repository = new SupabaseRepository();
 *
 * Nothing above this file needs to know which one it got.
 */
export const repo: Repository = new LocalRepository();

export { RepositoryError } from "@/lib/data/repository";
export { normaliseJoinCode, subscribeToChanges } from "@/lib/data/local-repository";

export type {
  ApplianceInput,
  CreateBillInput,
  MemberFootprint,
  OtherChargeInput,
  Repository,
  TrackerInput,
  UpdateBillInput,
  UseInput,
} from "@/lib/data/repository";

export * from "@/lib/data/types";
