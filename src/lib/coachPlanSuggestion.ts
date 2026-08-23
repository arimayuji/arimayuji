/**
 * "Fase B" of the coach plan-override feature (see PROJECT-CONTEXT.md) — a
 * one-shot AI suggestion for a single week, RAG-grounded in
 * `src/lib/evidence/facts.ts` and clamped server-side to the same
 * progression safety cap `src/lib/plan/volumeProgression.ts` enforces. This
 * never writes anything: the Function only returns a suggested draft, and
 * `coachPlanOverrides.ts`'s `setPlanOverride` is still the only path that
 * actually persists a week — the coach reviews/edits the suggestion in the
 * Fase A editor first, same "os dois juntos" architecture decided for this
 * feature (AI suggests, engine caps, coach confirms).
 */
import { ExecutionMethod } from "appwrite";
import { CLIENT_ACTIONS_FUNCTION_ID, getAppwrite } from "./appwrite";
import type { PlannedSession } from "./plan";

export interface PlanSuggestion {
  sessions: PlannedSession[];
  note: string;
  /** Coach-facing explanation of why the week looks like this — distinct tone/audience from `note`. Always non-empty (the schema requires it): references the actual weekly-km trend, and explicitly says whether/how the coach's own free-text context was factored in, rather than silently ignoring it. */
  reasoning: string;
  totalKm: number;
  /** True when the model's own suggestion exceeded the safety cap and was scaled down to fit it — surfaced so the coach knows the numbers were adjusted, not just accepted as-is. */
  capped: boolean;
  capKm: number;
  /** The model's own total before the cap above clipped it — only meaningful when `capped` is true. */
  rawSuggestedTotalKm: number;
}

export type SuggestPlanOverrideReason =
  | "unavailable"
  | "not-coach"
  | "no-history"
  | "ai-not-configured"
  | "ai-unavailable"
  | "ai-invalid-response"
  | "failed";

export type SuggestPlanOverrideResult =
  | ({ ok: true } & PlanSuggestion)
  | { ok: false; reason: SuggestPlanOverrideReason };

/** `coachNote` is optional free-text context for the model only (e.g. "joelho doendo essa semana") — distinct from the athlete-facing note the coach later saves via `setPlanOverride`, though the suggestion's own `note` is a reasonable starting point for that field. */
export async function suggestPlanOverride(
  studentId: string,
  weekStartDate: string,
  coachNote?: string,
): Promise<SuggestPlanOverrideResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "suggest-plan-override", studentId, weekStartDate, coachNote: coachNote ?? "" }),
    });
    const responseBody = JSON.parse(execution.responseBody || "{}") as
      | ({ ok: true } & PlanSuggestion)
      | { ok?: false; error?: string };
    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !responseBody.ok) {
      const reason = "error" in responseBody ? responseBody.error : undefined;
      const knownReasons: SuggestPlanOverrideReason[] = [
        "not-coach",
        "no-history",
        "ai-not-configured",
        "ai-unavailable",
        "ai-invalid-response",
      ];
      return {
        ok: false,
        reason: (knownReasons as string[]).includes(reason ?? "") ? (reason as SuggestPlanOverrideReason) : "failed",
      };
    }
    return {
      ok: true,
      sessions: responseBody.sessions,
      note: responseBody.note,
      reasoning: responseBody.reasoning,
      totalKm: responseBody.totalKm,
      capped: responseBody.capped,
      capKm: responseBody.capKm,
      rawSuggestedTotalKm: responseBody.rawSuggestedTotalKm,
    };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
