/**
 * Self-service twin of `coachPlanSuggestion.ts`'s `suggestPlanOverride` —
 * same Function dispatcher, same RAG-grounded Gemini call, same safety cap,
 * same "suggests, never saves" contract, but for the athlete asking about
 * their own week instead of a coach asking about a student's. See the spec
 * at /root/.claude/plans/cronograma-ia-autoatendimento.md for why this
 * needed no coach relationship, no Appwrite table read, and no new
 * cross-device sync: the athlete's own recent volume already lives on this
 * device, computed by the caller (`src/lib/tracking/stats.ts`'s
 * `weeklyBuckets`) and sent straight in the request body.
 *
 * Still requires a session, same as every other `client-actions` action
 * except the two native-signin bootstrap ones — calling Gemini costs real
 * money per request, so this rides the same login gate amigos/treinador/
 * ranking already use rather than opening the dispatcher's first
 * unauthenticated paid-API surface.
 */
import { ExecutionMethod } from "appwrite";
import { CLIENT_ACTIONS_FUNCTION_ID, getAppwrite } from "./appwrite";
import type { PlanSuggestion } from "./coachPlanSuggestion";
import type { PainSeverity } from "./tracking/storage";

export type { PlanSuggestion };

export interface SuggestPlanForSelfInput {
  weekStartDate: string;
  /** Real weekly totals, oldest first, computed locally from the athlete's own run history — never invented, same convention `estimateWeeklyKm`/`weeklyBuckets` already follow. */
  recentWeeksKm: number[];
  goalDistanceMeters: number;
  /** ISO date (yyyy-mm-dd). */
  goalDate: string;
  weeklyRunDays?: number;
  recentRace?: { distanceMeters: number; timeSeconds: number };
  /** The athlete's own active pain check-in, if any — see `activePainSignal`. Passed straight through rather than re-derived server-side, since the Function has no access to `/perfil/dados`'s local check-in log. */
  painSignal?: { severity: PainSeverity; region?: string };
  /** Free-text context the athlete wrote about themselves — the self-service equivalent of the coach's `coachNote`. */
  athleteNote?: string;
}

export type SuggestPlanForSelfReason =
  | "unavailable"
  | "no-history"
  | "missing-goal"
  | "ai-not-configured"
  | "ai-unavailable"
  | "ai-invalid-response"
  | "failed";

export type SuggestPlanForSelfResult =
  | ({ ok: true } & PlanSuggestion)
  | { ok: false; reason: SuggestPlanForSelfReason };

export async function suggestPlanForSelf(input: SuggestPlanForSelfInput): Promise<SuggestPlanForSelfResult> {
  const appwrite = getAppwrite();
  if (!appwrite) return { ok: false, reason: "unavailable" };
  try {
    const execution = await appwrite.functions.createExecution({
      functionId: CLIENT_ACTIONS_FUNCTION_ID,
      method: ExecutionMethod.POST,
      body: JSON.stringify({ action: "suggest-plan-for-self", ...input, athleteNote: input.athleteNote ?? "" }),
    });
    const responseBody = JSON.parse(execution.responseBody || "{}") as
      | ({ ok: true } & PlanSuggestion)
      | { ok?: false; error?: string };
    if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || !responseBody.ok) {
      const reason = "error" in responseBody ? responseBody.error : undefined;
      const knownReasons: SuggestPlanForSelfReason[] = [
        "no-history",
        "missing-goal",
        "ai-not-configured",
        "ai-unavailable",
        "ai-invalid-response",
      ];
      return {
        ok: false,
        reason: (knownReasons as string[]).includes(reason ?? "") ? (reason as SuggestPlanForSelfReason) : "failed",
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
