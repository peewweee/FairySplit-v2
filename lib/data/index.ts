import { SupabaseRepository } from "@/lib/data/supabase-repository";
import type { Repository } from "@/lib/data/repository";

/**
 * The active implementation. Was LocalRepository through Phase A; this is
 * the one-line Phase B switch (§9's whole point — nothing above this file
 * needed to know which one it got, and nothing did).
 *
 * LocalRepository is not deleted: `subscribeToChanges` below still comes
 * from it (repository-agnostic — it only listens for the shared change
 * event, never cares who fired it), and it stays as the reference
 * implementation the 108 tests were written against.
 */
export const repo: Repository = new SupabaseRepository();

export { RepositoryError } from "@/lib/data/repository";
export { subscribeToChanges } from "@/lib/data/local-repository";
export { normaliseJoinCode } from "@/lib/data/join-code";

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
