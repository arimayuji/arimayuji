/**
 * A coach's note on a specific run the student shared — closing the
 * otherwise one-way "student shares, coach only watches" pipe (see
 * runsSync.ts). One row per comment, not one growing text blob per run, so
 * several notes over time never require rewriting history.
 *
 * Same degrade-to-empty/null convention as the rest of the backend layer.
 */
import { ID, type Models, Permission, Query, Role } from "appwrite";
import { APPWRITE_DATABASE_ID, TABLES, getAppwrite } from "./appwrite";
import { getCurrentAccount } from "./auth";
import type { SyncedRun } from "./runsSync";

export interface RunComment extends Models.Row {
  runRowId: string;
  authorId: string;
  text: string;
}

const MAX_COMMENT_LENGTH = 500;

/**
 * Adds a comment to `runRowId` (a `runs` table row — see `SyncedRun.$id`).
 * The run's owner is *not* a parameter: it's read back here via `getRow`
 * under the caller's own session, so Appwrite's row-level read permission
 * on `runs` is what actually proves the caller (a coach the run was shared
 * with) may comment on it. Trusting a caller-supplied owner id here would
 * let anyone with any account attach a comment — readable by an arbitrary
 * victim — to any run, no relationship required; `getRow` throwing on a
 * run the caller can't read is the whole enforcement.
 */
export async function addRunComment(runRowId: string, text: string): Promise<RunComment | null> {
  const trimmed = text.trim().slice(0, MAX_COMMENT_LENGTH);
  if (!trimmed) return null;

  const appwrite = getAppwrite();
  if (!appwrite) return null;
  const account = await getCurrentAccount();
  if (!account) return null;
  const authorId = account.id;

  try {
    const run = await appwrite.tablesDB.getRow<SyncedRun>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.runs,
      rowId: runRowId,
    });
    return await appwrite.tablesDB.createRow<RunComment>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.runComments,
      rowId: ID.unique(),
      data: { runRowId, authorId, text: trimmed },
      permissions: [
        Permission.read(Role.user(authorId)),
        Permission.update(Role.user(authorId)),
        Permission.delete(Role.user(authorId)),
        Permission.read(Role.user(run.userId)),
      ],
    });
  } catch {
    return null;
  }
}

/**
 * Every comment on any of the given `runs` rows, grouped by which run they
 * belong to — one query for a whole list of shared runs rather than one per
 * run. Row-level permissions do the actual filtering: a coach only gets
 * back the comments they wrote themselves, the student gets back every
 * comment on their own run.
 */
export async function listRunComments(runRowIds: string[]): Promise<Map<string, RunComment[]>> {
  const byRun = new Map<string, RunComment[]>();
  if (runRowIds.length === 0) return byRun;

  const appwrite = getAppwrite();
  if (!appwrite) return byRun;

  try {
    const result = await appwrite.tablesDB.listRows<RunComment>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.runComments,
      queries: [Query.equal("runRowId", runRowIds), Query.orderAsc("$createdAt"), Query.limit(500)],
    });
    for (const comment of result.rows) {
      const list = byRun.get(comment.runRowId);
      if (list) list.push(comment);
      else byRun.set(comment.runRowId, [comment]);
    }
  } catch {
    // Degrades to empty — same convention as every other list function here.
  }
  return byRun;
}
