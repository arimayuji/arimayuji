/**
 * A coach's explicit override of one week of a student's plan — real data
 * entry ("a planilha"), not the plan engine's own guess. `src/lib/plan/
 * coachOverride.ts`'s `applyCoachOverride` is the pure merge step that
 * overlays this onto `computeCurrentPlanWeek`'s output; this module is only
 * the Appwrite round trip.
 *
 * Writes always go through the `set-plan-override` Appwrite Function —
 * "is this account an accepted coach of that student" has no Appwrite Role
 * to express, same reasoning `groupRuns.ts`'s `createGroupRun` documents
 * for join-group-run. Reads are a plain `listRows`: `plan_overrides` grants
 * no table-level read at all (see scripts/appwrite-setup.ts), but the
 * Function stamps each row's own permissions with both the coach's and the
 * student's user ID, so a `listRows` call from either party already only
 * ever sees rows they're allowed to.
 *
 * Same degrade-to-empty/false convention as the rest of the backend layer.
 */
import { ExecutionMethod, Query, type Models } from "appwrite";
import { APPWRITE_DATABASE_ID, CLIENT_ACTIONS_FUNCTION_ID, TABLES, getAppwrite } from "./appwrite";
import type { PlannedSession } from "./plan";

interface PlanOverrideRow extends Models.Row {
  coachId: string;
  studentId: string;
  weekStartDate: string;
  totalKm: number;
  /** JSON-encoded PlannedSession[7] — see plan_overrides.sessions in scripts/appwrite-setup.ts. */
  sessions: string;
  note: string | null;
}

export interface ParsedPlanOverride {
  weekStartDate: string;
  totalKm: number;
  sessions: PlannedSession[];
  note: string | null;
}

function parseOverride(row: PlanOverrideRow): ParsedPlanOverride | null {
  try {
    const sessions = JSON.parse(row.sessions) as unknown;
    if (!Array.isArray(sessions) || sessions.length !== 7) return null;
    return { weekStartDate: row.weekStartDate, totalKm: row.totalKm, sessions: sessions as PlannedSession[], note: row.note };
  } catch {
    return null;
  }
}

export type SetPlanOverrideResult = { ok: true } | { ok: false; reason: "unavailable" | "not-coach" | "failed" };

/** `weekStartDate` must be the same ISO Monday `PlannedWeek.startDate` already uses — the athlete's `/plano` looks an override up by that exact string, no date math at read time. */
export async function setPlanOverride(
  studentId: string,
  weekStartDate: string,
  totalKm: number,
  sessions: PlannedSession[],
  note?: string | null,
): Promise<SetPlanOverrideResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "set-plan-override", studentId, weekStartDate, totalKm, sessions, note: note ?? null }),
    });
    const body = JSON.parse(execution.responseBody || "{}") as { ok?: boolean; error?: string };
    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !body.ok) {
      return { ok: false, reason: body.error === "not-coach" ? "not-coach" : "failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Every override a student currently has, keyed by `weekStartDate` — the shape `/plano` needs for a plain lookup per week. */
export async function listPlanOverridesForStudent(studentId: string): Promise<Map<string, ParsedPlanOverride>> {
  const appwrite = getAppwrite();
  if (!appwrite) return new Map();
  try {
    const result = await appwrite.tablesDB.listRows<PlanOverrideRow>({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.planOverrides,
      queries: [Query.equal("studentId", studentId), Query.limit(100)],
    });
    const map = new Map<string, ParsedPlanOverride>();
    for (const row of result.rows) {
      const parsed = parseOverride(row);
      if (parsed) map.set(parsed.weekStartDate, parsed);
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Only the coach who created it can actually delete it — enforced by the row's own permissions (set at creation by set-plan-override), not by anything checked here. A student calling this on a row they don't own simply fails silently, same convention as everywhere else in this file. */
export async function deletePlanOverride(studentId: string, weekStartDate: string): Promise<boolean> {
  const appwrite = getAppwrite();
  if (!appwrite) return false;
  try {
    await appwrite.tablesDB.deleteRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: TABLES.planOverrides,
      rowId: `${studentId}_${weekStartDate}`,
    });
    return true;
  } catch {
    return false;
  }
}
