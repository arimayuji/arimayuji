/**
 * Cross-device sync of `RunnerProfile` (goal/plan fields) — opt-in
 * (`Profile.runSyncOptIn`, off by default), last-write-wins by a plain
 * epoch-ms timestamp, no per-field merge. The whole object is pushed/pulled
 * as a single unit each time: this is a deliberate simplicity choice
 * matching the product decision ("o mais recente vence"), not a real CRDT —
 * a genuine two-device race (edit on phone, then edit on desktop before
 * either has synced) resolves by discarding the older edit entirely, which
 * is the accepted, known trade-off of choosing LWW over conflict UI.
 *
 * Never touches `saveRunnerProfile()` on the pull path — see
 * `applySyncedRunnerProfile`'s own comment in runnerProfile.ts for why a
 * sync pull has to bypass that function's goal-change/re-anchor logic
 * entirely.
 *
 * This table (`runner_profile_sync`) has no `read("any")` and is never read
 * by any coach-facing code — a coach still can't see a student's real
 * `planStartDate`/goal, exactly as before this feature existed.
 */
import { ExecutionMethod, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import {
  applySyncedRunnerProfile,
  loadRunnerProfile,
  loadRunnerProfileUpdatedAtMs,
  type RunnerProfile,
} from "./runnerProfile";
import { invalidateRunnerProfileCache } from "./useRunnerProfile";

export interface RunnerProfileSyncRow extends Models.Row, RunnerProfile {
  userId: string;
  updatedAtMs: number;
}

function isEmptyProfile(profile: RunnerProfile): boolean {
  return Object.keys(profile).length === 0;
}

/**
 * Runs one round of the last-write-wins comparison — call after every local
 * edit that matters (gated on `runSyncOptIn` by the caller) and on app
 * foreground (see `runner-profile-sync-ping.tsx`). Never throws: a sync
 * failure (offline, Appwrite down) just means this device's own local data
 * stays authoritative until the next successful call.
 */
export async function syncRunnerProfile(): Promise<void> {
  const appwrite = getAppwrite();
  if (!appwrite) return;

  try {
    const account = await appwrite.account.get();
    const userId = account.$id;
    const local = loadRunnerProfile();
    const localMeta = loadRunnerProfileUpdatedAtMs() ?? 0;

    let remote: RunnerProfileSyncRow | null = null;
    try {
      remote = await appwrite.tablesDB.getRow<RunnerProfileSyncRow>({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: TABLES.runnerProfileSync,
        rowId: userId,
      });
    } catch {
      remote = null;
    }

    if (!remote) {
      if (isEmptyProfile(local)) return; // nothing local worth pushing yet
      const updatedAtMs = localMeta || Date.now();
      const execution = await appwrite.functions.createExecution({
        functionId: CLIENT_ACTIONS_FUNCTION_ID,
        method: ExecutionMethod.POST,
        body: JSON.stringify({ action: "claim-owned-row", tableId: TABLES.runnerProfileSync, ...local, updatedAtMs }),
      });
      const body = JSON.parse(execution.responseBody || "{}") as { ok?: boolean; error?: string };
      if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !body.ok) {
        // "already-exists" (409) just means another device won the race to
        // create it first — a later sync call will pick up the real row.
        if (body.error !== "already-exists") throw new Error(body.error ?? "failed");
      }
      return;
    }

    if (remote.updatedAtMs > localMeta) {
      applySyncedRunnerProfile(remote, remote.updatedAtMs);
      invalidateRunnerProfileCache();
      return;
    }

    if (localMeta > remote.updatedAtMs) {
      await appwrite.tablesDB.updateRow<RunnerProfileSyncRow>({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: TABLES.runnerProfileSync,
        rowId: userId,
        data: { ...local, updatedAtMs: localMeta },
      });
    }
    // Equal timestamps: this device's own last sync, nothing to do.
  } catch {
    // Offline, Appwrite unreachable, whatever — local data stays
    // authoritative on this device until the next successful sync.
  }
}
