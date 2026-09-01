/**
 * Comments on a shared run — a coach's note on a student's run
 * (`treinador/aluno`), or (2026-09-01) a Strava-style comment in the
 * friends Feed. Both funnel through the same `client-actions` Function
 * actions (`add-run-comment`/`list-run-comments`), never a direct
 * `tablesDB` call the way the old version of this file worked: that old
 * version tried to grant `Permission.read(Role.user(run.userId))` from a
 * plain client session — the coach's — which Appwrite always refuses (the
 * same `401 user_unauthorized` root cause already fixed for friendships/
 * live_runs/share-run/run_kudos, just never noticed here because the bare
 * `catch` swallowed the rejection). Every `run_comments` row now carries
 * `permissions: []` — see main.js's own comment on canAccessRun for why a
 * comment's audience (owner, accepted coach, or accepted friend once a run
 * is friends-visible) has no stable per-row grant worth assigning anyway.
 *
 * Same degrade-to-empty/null convention as the rest of the backend layer.
 */
import { ExecutionMethod } from "appwrite";
import { CLIENT_ACTIONS_FUNCTION_ID, getAppwrite } from "./appwrite";

export interface RunComment {
  id: string;
  runRowId: string;
  authorId: string;
  displayName: string;
  avatarUrl: string | null;
  text: string;
  photoUrl: string | null;
  createdAt: string;
}

/**
 * Adds a comment (text, a photo, or both) to `runRowId` — the Function
 * decides whether the caller may comment at all (own run, accepted coach,
 * or accepted friend of a friends-visible run), never this client.
 * `photoUrl` is the result of `uploadSharedPhoto` (src/lib/avatar.ts),
 * already uploaded — this call only ever attaches the resulting URL.
 */
export async function addRunComment(
  runRowId: string,
  text: string,
  photoUrl?: string | null,
): Promise<RunComment | null> {
  const appwrite = getAppwrite();
  if (!appwrite) return null;
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "add-run-comment", runRowId, text, photoUrl: photoUrl || undefined }),
    });
    const parsed = JSON.parse(execution.responseBody || "{}") as { ok?: boolean; comment?: RunComment };
    return parsed.ok && parsed.comment ? parsed.comment : null;
  } catch (error) {
    console.error("[runComments] addRunComment failed", error);
    return null;
  }
}

/**
 * Every comment on any of the given `runs` rows, grouped by which run they
 * belong to — one Function call for a whole list of runs rather than one
 * per run. The Function re-checks access per run on every call (same
 * "recompute, never trust a stored grant" rule `list-friends-feed` already
 * follows for kudos), so a run that stopped being visible to this caller
 * just silently drops out of the result instead of erroring.
 */
export async function listRunComments(runRowIds: string[]): Promise<Map<string, RunComment[]>> {
  const byRun = new Map<string, RunComment[]>();
  if (runRowIds.length === 0) return byRun;

  const appwrite = getAppwrite();
  if (!appwrite) return byRun;

  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "list-run-comments", runRowIds }),
    });
    const parsed = JSON.parse(execution.responseBody || "{}") as {
      ok?: boolean;
      byRun?: Record<string, RunComment[]>;
    };
    if (parsed.ok && parsed.byRun) {
      for (const [runRowId, comments] of Object.entries(parsed.byRun)) byRun.set(runRowId, comments);
    }
  } catch (error) {
    console.error("[runComments] listRunComments failed", error);
  }
  return byRun;
}
