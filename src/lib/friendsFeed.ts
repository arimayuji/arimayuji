/**
 * The friends activity feed — a chronological list of runs friends chose
 * to share (`runsSync.ts`'s `setRunFriendsVisibility`), plus kudos.
 *
 * Deliberately a thin shell over two `client-actions` Function calls
 * (`list-friends-feed`/`toggle-run-kudos`), never a direct `tablesDB`
 * read of `runs`/`run_kudos` the way most of this backend layer works —
 * see `list-friends-feed`'s own comment in main.js for why: the feed's
 * audience is "whoever is an accepted friend right now," which changes
 * continuously, so there's no stable per-row permission grant a client
 * session could read against. The Function resolves that fresh on every
 * call with its privileged key instead.
 *
 * Same degrade-to-empty/false convention as the rest of the backend
 * layer — none of this is needed to record or view your own runs.
 */
import { ExecutionMethod } from "appwrite";
import { CLIENT_ACTIONS_FUNCTION_ID, getAppwrite } from "./appwrite";

export interface FriendFeedItem {
  runRowId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  startedAt: string;
  finishedAt: string;
  distanceMeters: number;
  movingSeconds: number;
  shoeName: string | null;
  kudosCount: number;
  kudosGivenByMe: boolean;
}

export async function listFriendsFeed(): Promise<FriendFeedItem[]> {
  const appwrite = getAppwrite();
  if (!appwrite) return [];
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "list-friends-feed" }),
    });
    const parsed = JSON.parse(execution.responseBody || "{}") as { ok?: boolean; items?: FriendFeedItem[] };
    return parsed.ok && parsed.items ? parsed.items : [];
  } catch (error) {
    console.error("[friendsFeed] listFriendsFeed failed", error);
    return [];
  }
}

export type ToggleKudosResult =
  | { ok: true; kudosCount: number; kudosGivenByMe: boolean }
  | { ok: false };

/** Toggles the signed-in account's own kudos on `runRowId` — gives it if absent, takes it back if already given. */
export async function toggleRunKudos(runRowId: string): Promise<ToggleKudosResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false };
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "toggle-run-kudos", runRowId }),
    });
    const parsed = JSON.parse(execution.responseBody || "{}") as {
      ok?: boolean;
      kudosCount?: number;
      kudosGivenByMe?: boolean;
    };
    if (!parsed.ok || typeof parsed.kudosCount !== "number" || typeof parsed.kudosGivenByMe !== "boolean") {
      return { ok: false };
    }
    return { ok: true, kudosCount: parsed.kudosCount, kudosGivenByMe: parsed.kudosGivenByMe };
  } catch (error) {
    console.error("[friendsFeed] toggleRunKudos failed", error);
    return { ok: false };
  }
}
