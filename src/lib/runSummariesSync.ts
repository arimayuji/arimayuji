/**
 * Cross-device sync of a lightweight per-run summary — distance, moving
 * time, date, never the GPS trace (`CompletedRun.points`). This is what
 * lets a desktop session draw a real progression graph instead of only the
 * current week's plan state; gated the same way as `runnerProfileSync.ts`
 * (`Profile.runSyncOptIn`, checked by every call site before invoking these
 * functions — never enforced inside the functions themselves, same
 * convention `placeLeaderboard.ts`'s `recordRunAtPlace` already documents).
 *
 * Row ID is the run's own local id (`CompletedRun.id`, already unique) —
 * one row per run, owner-only (`Permission.read/update/delete(Role.user(userId))`),
 * no sharing, no coach/friend audience.
 */
import { ExecutionMethod, Query, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import { runMovingSeconds, type CompletedRun } from "./tracking/storage";

export interface RunSummary extends Models.Row {
  userId: string;
  startedAtMs: number;
  distanceMeters: number;
  movingSeconds: number;
}

const BACKFILL_CHUNK_SIZE = 500;

function summaryPayload(run: CompletedRun) {
  return {
    runId: run.id,
    startedAtMs: run.startedAt,
    distanceMeters: run.distanceMeters,
    movingSeconds: runMovingSeconds(run),
  };
}

/** Creates (or updates, if it already exists) the `run_summaries` row for one finished run. Never throws — a failure here shouldn't block finishing/saving a run. */
export async function syncRunSummary(run: CompletedRun): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "sync-run-summary", ...summaryPayload(run) }),
    });
    const body = JSON.parse(execution.responseBody || "{}") as { ok?: boolean };
    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !body.ok) {
      throw new Error("failed");
    }
  } catch {
    // Best-effort — same convention as syncProfileStats' callers.
  }
}

/** Deletes the synced summary for a run that was discarded/removed locally. Legal as a direct client call — the row's own owner-only permissions were set at creation. */
export async function deleteRunSummary(runId: string): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;
  try {
    await appwrite.tablesDB.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId: TABLES.runSummaries, rowId: runId });
  } catch {
    // Already gone, never synced, or offline — nothing more to do.
  }
}

/** Every synced run summary for an account, newest first — for a future desktop progression view. */
export async function listRunSummaries(userId: string): Promise<RunSummary[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  try {
    const result = await appwrite.tablesDB.listRows<RunSummary>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.runSummaries,
      queries: [Query.equal("userId", userId), Query.orderDesc("startedAtMs"), Query.limit(500)],
    });
    return result.rows;
  } catch {
    return [];
  }
}

/** Chunks `runs` into batches of `BACKFILL_CHUNK_SIZE` and pushes each in one Function execution — called once, right after `runSyncOptIn` is turned on, so years of local history don't need one execution per run. */
export async function backfillRunSummaries(runs: CompletedRun[]): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite || runs.length === 0) return;
  for (let i = 0; i < runs.length; i += BACKFILL_CHUNK_SIZE) {
    const chunk = runs.slice(i, i + BACKFILL_CHUNK_SIZE);
    try {
      await appwrite.functions.createExecution({
        functionId: CLIENT_ACTIONS_FUNCTION_ID,
        method: ExecutionMethod.POST,
        body: JSON.stringify({ action: "backfill-run-summaries", items: chunk.map(summaryPayload) }),
      });
    } catch {
      // Best-effort — a later manual sync/opt-in toggle can retry.
    }
  }
}
