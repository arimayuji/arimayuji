/**
 * Local-only twin of `coachPlanOverrides.ts` — where an athlete's own
 * accepted AI suggestion (`selfPlanSuggestion.ts`) actually lives once they
 * click through the mandatory disclaimer. Deliberately never touches
 * Appwrite: same `localStorage` pattern `preferences.ts`/`runnerProfile.ts`
 * already use, one entry per week (`weekStartDate`), so this needs no new
 * table and opens no cross-device sync question at all — see the spec at
 * /root/.claude/plans/cronograma-ia-autoatendimento.md for why that's a
 * deliberate simplification, not an oversight.
 *
 * Shape matches `ParsedPlanOverride` (`coachPlanOverrides.ts`) closely on
 * purpose: both feed the same `applyCoachOverride` merge — a coach's
 * override always wins if both exist for the same week (see call sites in
 * plano/page.tsx and run/page.tsx), since it's a human decision, never
 * overridden by an unsupervised AI suggestion.
 */
import type { PlannedSession } from "./plan";

export interface SelfPlanOverride {
  weekStartDate: string;
  totalKm: number;
  sessions: PlannedSession[];
  note: string | null;
  /** The model's own explanation, shown alongside the override so the athlete can see why the week looks like this — never discarded after the disclaimer step. */
  reasoning: string;
  generatedAt: number;
}

const KEY_PREFIX = "xanthus:self-plan-override:";

function sanitize(raw: unknown): SelfPlanOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<Record<keyof SelfPlanOverride, unknown>>;
  if (typeof value.weekStartDate !== "string") return null;
  if (typeof value.totalKm !== "number" || !Number.isFinite(value.totalKm)) return null;
  if (!Array.isArray(value.sessions) || value.sessions.length !== 7) return null;
  return {
    weekStartDate: value.weekStartDate,
    totalKm: value.totalKm,
    sessions: value.sessions as PlannedSession[],
    note: typeof value.note === "string" ? value.note : null,
    reasoning: typeof value.reasoning === "string" ? value.reasoning : "",
    generatedAt: typeof value.generatedAt === "number" ? value.generatedAt : Date.now(),
  };
}

/** `null` with nothing stored for that week, or on the server — same "degrade to nothing rather than throw" convention as the rest of this backend layer. */
export function getSelfPlanOverride(weekStartDate: string): SelfPlanOverride | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(`${KEY_PREFIX}${weekStartDate}`);
    if (!stored) return null;
    return sanitize(JSON.parse(stored));
  } catch {
    return null;
  }
}

/**
 * One override per week, full stop — calling this again for a week that
 * already has one overwrites it rather than merging, since a fresh
 * suggestion is meant to fully replace the previous one, never blend with
 * it. The UI is what actually enforces "ask again only after removing the
 * current one" (see /plano's "Sugestão da IA" card): once
 * `getSelfPlanOverride` returns non-null for the current week, the
 * "Sugerir com IA" button gives way to the existing suggestion plus a
 * "Remover" action, the same one-per-week gate `week-plan-editor.tsx`
 * already uses for the coach's own override.
 */
export function setSelfPlanOverride(override: SelfPlanOverride): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${override.weekStartDate}`, JSON.stringify(override));
  } catch {
    // Storage disabled (private mode, quota): the suggestion just doesn't stick.
  }
}

export function removeSelfPlanOverride(weekStartDate: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${KEY_PREFIX}${weekStartDate}`);
  } catch {
    // Nothing to recover from here.
  }
}
