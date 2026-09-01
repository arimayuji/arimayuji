"use client";

import { useState } from "react";
import { GoalDatePicker } from "../date-picker";
import { PillSlider } from "../pill-slider";
import { DistanceTileGrid, MIN_WEEKLY_DAYS, MAX_WEEKLY_DAYS } from "./goal-fields";
import type { RunnerProfile } from "@/lib/runnerProfile";

/**
 * Desktop-only first-run replacement for `GoalCard` in `page.tsx`'s empty
 * state — see that file's own render logic for why: it only ever mounts
 * this while `!hasGoal`, and falls back to the same always-editable
 * `GoalCard` everyone else uses (mobile, and desktop once a goal already
 * exists). The problem this solves is specific to *first* setting a goal:
 * `GoalCard` writes to `RunnerProfile` on every keystroke with no
 * concluding action, which reads fine as an inline settings form but
 * leaves a first-time desktop visitor unsure whether anything happened.
 *
 * Deliberately holds its own local `draft` and never calls `updateProfile`
 * until the final step's "Elaborar meu plano" — a single write, not the
 * same per-keystroke `localStorage` round-trip `GoalCard` does. Once that
 * write lands, this component's job is done: `page.tsx` already recomputes
 * `hasGoal`/`hasHistory` on the next render and either reveals the
 * existing `PlanBuildSequence` (if there's run history to build from) or
 * the existing "O que falta pro seu plano de verdade" checklist (if not) —
 * neither of those is duplicated here.
 */
export function GoalWizard({
  profile,
  updateProfile,
  hasGoal,
}: {
  profile: RunnerProfile;
  updateProfile: (patch: Partial<RunnerProfile>) => void;
  hasGoal: boolean;
}) {
  const [stage, setStage] = useState<"intro" | 0 | 1 | 2>("intro");
  const [draft, setDraft] = useState<Partial<RunnerProfile>>(() => ({
    goalDistanceMeters: profile.goalDistanceMeters,
    goalDate: profile.goalDate,
    weeklyRunDays: profile.weeklyRunDays ?? 4,
    recentRaceDistanceMeters: profile.recentRaceDistanceMeters,
    recentRaceTimeSeconds: profile.recentRaceTimeSeconds,
  }));

  // The parent already stops rendering this once a goal exists (it swaps
  // to GoalCard instead) — this is a defensive second layer for the one
  // render tick between the commit below and that swap taking effect.
  if (hasGoal) return null;

  if (stage === "intro") {
    return (
      <div>
        <h2 className="text-lg font-semibold text-foreground">Vamos montar seu plano</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
          Distância e data viram a rampa de volume e o taper; o tempo recente (opcional) vira suas
          zonas de pace. Leva menos de um minuto.
        </p>
        <button
          type="button"
          onClick={() => setStage(0)}
          className="mt-5 rounded-md bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground"
        >
          Começar
        </button>
      </div>
    );
  }

  const recentMinutes = draft.recentRaceTimeSeconds ? Math.floor(draft.recentRaceTimeSeconds / 60) : "";
  const recentSeconds = draft.recentRaceTimeSeconds ? draft.recentRaceTimeSeconds % 60 : "";
  const setRecentRaceTime = (minutes: number, seconds: number) => {
    const total = minutes * 60 + seconds;
    setDraft((d) => ({ ...d, recentRaceTimeSeconds: total > 0 ? total : undefined }));
  };

  const canAdvanceFromStep0 = Boolean(draft.goalDistanceMeters && draft.goalDate);
  const isLastStep = stage === 2;

  return (
    <div>
      <StepProgress current={stage} />

      {stage === 0 && (
        <div className="mt-5">
          <fieldset>
            <legend className="mb-2.5 block text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
              Distância da prova
            </legend>
            <DistanceTileGrid
              selected={draft.goalDistanceMeters}
              onSelect={(meters) => setDraft((d) => ({ ...d, goalDistanceMeters: meters }))}
            />
          </fieldset>
          <div className="mt-5 space-y-1.5">
            <p className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">Data da prova</p>
            <GoalDatePicker
              value={draft.goalDate}
              onChange={(goalDate) => setDraft((d) => ({ ...d, goalDate }))}
            />
          </div>
        </div>
      )}

      {stage === 1 && (
        <fieldset className="mt-5">
          <legend className="mb-2.5 block text-[11px] font-bold tracking-[0.05em] text-muted uppercase">
            Dias de corrida por semana
          </legend>
          <PillSlider
            min={MIN_WEEKLY_DAYS}
            max={MAX_WEEKLY_DAYS}
            step={1}
            value={draft.weeklyRunDays ?? 4}
            onChange={(days) => setDraft((d) => ({ ...d, weeklyRunDays: days }))}
            formatValue={(days) => String(days)}
          />
        </fieldset>
      )}

      {stage === 2 && (
        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Seu tempo recente (opcional)</legend>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Uma prova ou treino forte recente numa distância conhecida — dá as suas zonas de pace
            reais. Sem isso o plano ainda calcula volume, só não mostra pace por zona.
          </p>
          <div className="mt-3">
            <DistanceTileGrid
              selected={draft.recentRaceDistanceMeters}
              onSelect={(meters) => setDraft((d) => ({ ...d, recentRaceDistanceMeters: meters }))}
            />
          </div>
          <div className="mt-4 flex items-end justify-center gap-2.5">
            <div className="flex flex-col items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                placeholder="00"
                value={recentMinutes}
                onChange={(event) =>
                  setRecentRaceTime(
                    Number(event.target.value.replace(/\D/g, "").slice(0, 2)) || 0,
                    Number(recentSeconds) || 0,
                  )
                }
                className={`w-16 rounded-sm border-b-2 bg-transparent text-center text-3xl font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  recentMinutes ? "border-accent" : "border-border"
                }`}
              />
              <span className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">min</span>
            </div>
            <span className="pb-5 text-2xl font-extrabold text-muted">:</span>
            <div className="flex flex-col items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                placeholder="00"
                value={recentSeconds}
                onChange={(event) =>
                  setRecentRaceTime(
                    Number(recentMinutes) || 0,
                    Number(event.target.value.replace(/\D/g, "").slice(0, 2)) || 0,
                  )
                }
                className={`w-16 rounded-sm border-b-2 bg-transparent text-center text-3xl font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  recentSeconds ? "border-accent" : "border-border"
                }`}
              />
              <span className="text-[11px] font-bold tracking-[0.05em] text-muted uppercase">seg</span>
            </div>
          </div>
          {draft.recentRaceTimeSeconds && !draft.recentRaceDistanceMeters && (
            <p className="mt-2 text-center text-xs text-warn">Falta escolher a distância desse tempo.</p>
          )}
        </fieldset>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
        {stage > 0 ? (
          <button
            type="button"
            onClick={() => setStage((s) => ((s as number) - 1) as 0 | 1)}
            className="text-sm font-semibold text-muted"
          >
            Voltar
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={stage === 0 && !canAdvanceFromStep0}
          onClick={() => {
            if (isLastStep) {
              updateProfile(draft);
            } else {
              setStage((s) => ((s as number) + 1) as 1 | 2);
            }
          }}
          className="rounded-md bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
        >
          {isLastStep ? "Elaborar meu plano" : "Avançar"}
        </button>
      </div>
    </div>
  );
}

const STEP_LABELS = ["Sua prova", "Frequência", "Tempo recente"] as const;

/** Stripe-checkout-style progress: numbered circles joined by a hairline, not a full-screen dot indicator — this sits inside a dense desktop panel instead. */
function StepProgress({ current }: { current: 0 | 1 | 2 }) {
  return (
    <div className="flex items-center gap-2">
      {STEP_LABELS.map((label, index) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                index < current
                  ? "bg-accent text-accent-foreground"
                  : index === current
                    ? "border-2 border-accent text-accent"
                    : "border border-border text-muted"
              }`}
            >
              {index < current ? (
                <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" aria-hidden="true">
                  <path
                    d="M4.5 10.5l3.5 3.5L15.5 6.5"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className={`hidden text-xs font-semibold uppercase tracking-[0.05em] lg:inline ${index === current ? "text-foreground" : "text-muted"}`}>
              {label}
            </span>
          </div>
          {index < STEP_LABELS.length - 1 && <span className="h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  );
}
