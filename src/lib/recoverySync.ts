/**
 * Cross-device sync of a weekly recovery snapshot — resting heart rate,
 * HRV, sleep hours, VO2 max, read from the phone's own HealthKit/Health
 * Connect via health.ts's `fetchRecoveryContext`. Nested one level deeper
 * than `runnerProfileSync.ts`/`runSummariesSync.ts`: those sync generic
 * goal/pace data, this syncs health-derived signals, which is why it has
 * its own opt-in (`Profile.recoverySyncOptIn`) checked by every call site
 * before invoking these functions — never enforced inside the functions
 * themselves, same convention as `runSyncOptIn` elsewhere.
 *
 * Row ID is `${userId}_${weekStartIso}` — one row per account per week,
 * owner-only (`Permission.read/update/delete(Role.user(userId))`), never
 * shared with a coach/friend. Unlike `runnerProfileSync.ts` this is
 * append-only (no last-write-wins comparison needed): only the device
 * that actually has a watch synced ever calls `syncRecoverySnapshot`, so
 * there's no two-device race to resolve.
 */
import { ExecutionMethod, Query, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import type { RecoveryContext } from "./health";

export interface RecoverySnapshot extends Models.Row {
  userId: string;
  weekStartIso: string;
  restingHeartRateBpm?: number;
  hrvMs?: number;
  vo2Max?: number;
  sleepHours?: number;
}

/** Creates (or updates, if this week already has a row) the `recovery_snapshots` row for one week. Never throws — a failure here shouldn't block opening /plano. */
export async function syncRecoverySnapshot(weekStartIso: string, context: RecoveryContext): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({
        action: "sync-recovery-snapshot",
        weekStartIso,
        restingHeartRateBpm: context.restingHeartRateBpm ?? undefined,
        hrvMs: context.hrvMs ?? undefined,
        vo2Max: context.vo2Max ?? undefined,
        sleepHours: context.sleepHours ?? undefined,
      }),
    });
    const body = JSON.parse(execution.responseBody || "{}") as { ok?: boolean };
    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !body.ok) {
      throw new Error("failed");
    }
  } catch {
    // Best-effort — same convention as syncRunSummary's caller.
  }
}

/** Every synced recovery snapshot for an account, oldest first — feeds the desktop dashboard's recovery trend card. */
export async function listRecoverySnapshots(userId: string): Promise<RecoverySnapshot[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  try {
    const result = await appwrite.tablesDB.listRows<RecoverySnapshot>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.recoverySnapshots,
      queries: [Query.equal("userId", userId), Query.orderAsc("weekStartIso"), Query.limit(52)],
    });
    return result.rows;
  } catch {
    return [];
  }
}
