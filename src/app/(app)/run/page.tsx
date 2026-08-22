"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRunTracker } from "@/lib/tracking/useRunTracker";
import { isNativePlatform } from "@/lib/platform";
import { onNotificationAction } from "@/lib/tracking/geolocation";
import { useEffectiveColorScheme } from "@/lib/theme";
import { listCoachConnections, type CoachConnection } from "@/lib/coachRelationships";
import { startLiveSession, updateLiveSession, endLiveSession, refreshLiveSessionAudience } from "@/lib/liveRuns";
import { getActiveGroupRunCode, getGroupRun, listParticipants, type GroupRun } from "@/lib/groupRuns";
import { useGroupLiveRuns, buildGroupMarkers } from "@/lib/useGroupLiveRuns";
import { useAuth } from "@/lib/useAuth";
import { GroupLiveMap } from "../group-live-map";
import { ModalPortal } from "../modal-portal";
import { TransparentLoopVideo } from "../transparent-loop-video";
import {
  formatDeltaDuration,
  formatDistanceKm,
  formatElapsed,
  formatPace,
} from "@/lib/tracking/geoFilter";
import {
  clearActiveRun,
  deleteCompletedRun,
  listCompletedRuns,
  listPainCheckIns,
  listShoes,
  loadActiveRun,
  markEmblemOpened,
  markRecordOpened,
  runMovingSeconds,
  updateRunElevationGain,
  updateRunRpe,
  updateRunTracks,
  type ActiveRunSnapshot,
  type CompletedRun,
  type PainCheckIn,
  type RunTrack,
  type Shoe,
  type StoredPoint,
} from "@/lib/tracking/storage";
import { applyCoachOverride, computeCurrentPlanWeek, isoWeekday, paceForZone, ZONE_LABEL } from "@/lib/plan";
import { listPlanOverridesForStudent, type ParsedPlanOverride } from "@/lib/coachPlanOverrides";
import { useRunnerProfile } from "@/lib/useRunnerProfile";
import { computeElevationGain } from "@/lib/elevation";
import { matchPlaceForRoute } from "@/lib/placeMatch";
import { recordRunAtPlace } from "@/lib/placeLeaderboard";
import { recordFinishedRun } from "@/lib/profileStats";
import { updateProfile } from "@/lib/auth";
import type { RunningPlace } from "@/lib/places";
import { projectRoute } from "@/lib/tracking/routeProjection";
import { RouteMap } from "../route-map";
import { computeAchievement } from "@/lib/tracking/achievements";
import { computeRunRecords, type RunRecord } from "@/lib/tracking/personalRecords";
import {
  EMBLEM_LADDER_KM,
  formatEmblemKm,
  milestonesJustCrossed,
  nextMilestone,
  totalDistanceMeters,
} from "@/lib/tracking/emblems";
import {
  formatTimeHours,
  nextTimeMilestone,
  TIME_LADDER_HOURS,
  totalMovingHours,
} from "@/lib/tracking/collectibles";
import { metalForMilestone } from "@/lib/rankMetal";
import { AchievementReveal } from "../achievement-reveal";
import { EmblemBadge } from "../emblem-badge";
import { EmblemProgressBar } from "../emblem-progress-bar";
import { EmblemReveal } from "../emblem-reveal";
import { PrBadge } from "../pr-badge";
import { hasSeenRunTips, markRunTipsSeen, RunOnboarding } from "../run-onboarding";
import { searchTracks, type TrackCandidate } from "@/lib/music/itunesLookup";
import {
  ANNOUNCE_MAX_METERS,
  ANNOUNCE_MIN_METERS,
  ANNOUNCE_STEP_METERS,
  announceLabel,
} from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import { useHeaderGpsStatus, useImmersiveMode, useTabReclick } from "../app-shell";
import { Card, NoticeBadge } from "../ui";
import { PillSlider } from "../pill-slider";

const RECENT_GHOST_CANDIDATES = 6;

const noopSubscribe = () => () => {};

/** Same `useSyncExternalStore` shape as `usePrefersReducedMotion` elsewhere — a browser-only read decided once, with no hydration mismatch. */
function useIsNative(): boolean {
  return useSyncExternalStore(noopSubscribe, isNativePlatform, () => false);
}


const PAUSE_ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Same small-icon convention as the bottom nav (`STROKE` in app-shell.tsx) — a glance at the shape should place the reason before the label finishes registering. */
const PAUSE_REASONS: { label: string; icon: (props: { className: string }) => ReactNode }[] = [
  {
    label: "Água",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...PAUSE_ICON_STROKE}>
        <path d="M12 3c3.2 4.1 6 7.7 6 11a6 6 0 1 1-12 0c0-3.3 2.8-6.9 6-11Z" />
      </svg>
    ),
  },
  {
    label: "Banheiro",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...PAUSE_ICON_STROKE}>
        <circle cx="12" cy="4.8" r="2.1" />
        <path d="M8.5 21v-7.5H7l1.6-6.3h6.8L17 13.5h-1.5V21" />
      </svg>
    ),
  },
  {
    label: "Gel/carboidrato",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...PAUSE_ICON_STROKE}>
        <path d="M13 3 5.5 13.5H11l-1 7.5 8.5-11H13l1-7Z" />
      </svg>
    ),
  },
  {
    label: "Foto",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...PAUSE_ICON_STROKE}>
        <path d="M8 7 9.3 4.5h5.4L16 7" />
        <rect x="3" y="7" width="18" height="13" rx="2.4" />
        <circle cx="12" cy="13.5" r="3.4" />
      </svg>
    ),
  },
  {
    label: "Alongamento",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...PAUSE_ICON_STROKE}>
        <circle cx="12" cy="4.3" r="2" />
        <path d="M12 6.3v6.2M12 8.2 6.8 5M12 8.2l5.2-3.2M12 12.5 7.5 19M12 12.5l4.5 6.5" />
      </svg>
    ),
  },
  {
    label: "Outro",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor" stroke="none">
        <circle cx="6" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="18" cy="12" r="1.6" />
      </svg>
    ),
  },
];

function formatPauseDuration(startedAt: number, endedAt: number | null): string {
  const seconds = ((endedAt ?? Date.now()) - startedAt) / 1000;
  return formatDeltaDuration(seconds);
}

/** How long a hold has to last before it counts — long enough that a stray tap or a bump mid-stride can't trigger it, short enough that a deliberate hold doesn't feel like it's stuck. */
const HOLD_TO_FINISH_MS = 850;

/** The exact background color baked into `running-loop(.dark).mp4`, sampled directly from the clip's own pixels (not the CSS `--background` token, which is a separate value this can't be kept in permanent lockstep with) — see `TransparentLoopVideo`. */
const RUNNING_LOOP_LIGHT_BG: readonly [number, number, number] = [251, 251, 251];
const RUNNING_LOOP_DARK_BG: readonly [number, number, number] = [5, 7, 5];

/** Preset chip values for the four pickers on Preparar Corrida — same shape as Xanthus Preparar Corrida.dc.html's GOAL_OPTS/VOICE_OPTS, adapted where a mock preset would fall outside a range this app already validates elsewhere (voice interval stays within `ANNOUNCE_MIN_METERS`–`ANNOUNCE_MAX_METERS`). */
const DISTANCE_PRESETS_KM = [1, 3, 5, 10, 21];
const TIME_PRESETS_MIN = [20, 30, 45, 60, 90];
const PACE_PRESETS_SEC = [270, 300, 330, 360, 390]; // 4:30–6:30 /km
const VOICE_PRESETS_M = [250, 500, 1000, 2000, 5000];

/**
 * Ending a run is the one action here with no undo — the summary screen is
 * already built from whatever `finish()` freezes into `finishedRun`, and
 * that's exactly what a sweaty thumb or a phone bouncing in an armband can
 * hit by accident mid-run. A plain tap-to-confirm dialog doesn't help; on a
 * touchscreen, dismissing that dialog is itself just another tap that can
 * land wrong. Holding it down is the one gesture an accidental brush can't
 * reproduce.
 */
function HoldToFinishButton({
  onConfirm,
  disabled,
}: {
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  }, []);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(() => {
    if (disabled || timerRef.current !== null) return;
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      onConfirm();
    }, HOLD_TO_FINISH_MS);
  }, [disabled, onConfirm]);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      className="relative flex-1 overflow-hidden rounded-full bg-bad py-4 text-base font-semibold text-white select-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 bg-white/25"
        style={{
          height: holding ? "100%" : "0%",
          transition: holding ? `height ${HOLD_TO_FINISH_MS}ms linear` : "height 150ms ease-out",
        }}
      />
      <span className="relative">Finalizar</span>
    </button>
  );
}

function GhostDeltaPill({ deltaSeconds }: { deltaSeconds: number }) {
  const ahead = deltaSeconds >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        ahead ? "border-good/40 bg-good/10 text-good" : "border-warn/40 bg-warn/10 text-warn"
      }`}
    >
      {formatDeltaDuration(deltaSeconds)} {ahead ? "à frente do fantasma" : "atrás do fantasma"}
    </span>
  );
}

/** Same shell as `GhostDeltaPill`, for the "Ritmo" goal instead of a ghost race — `deltaSecPerKm` is `current pace - target pace`, so ≤0 means holding the target pace or faster. */
function PaceDeltaPill({ deltaSecPerKm }: { deltaSecPerKm: number }) {
  const ahead = deltaSecPerKm <= 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        ahead ? "border-good/40 bg-good/10 text-good" : "border-warn/40 bg-warn/10 text-warn"
      }`}
    >
      {formatDeltaDuration(deltaSecPerKm)}/km {ahead ? "mais rápido que a meta" : "mais lento que a meta"}
    </span>
  );
}

/** Borg CR10 anchors, condensed to plain pt-BR — the same 1-10 scale Strava falls back to as "Perceived Exertion" when there's no heart-rate sensor. */
const RPE_LABEL: Record<number, string> = {
  1: "Muito leve",
  2: "Leve",
  3: "Leve",
  4: "Moderado",
  5: "Moderado",
  6: "Um pouco forte",
  7: "Forte",
  8: "Forte",
  9: "Muito forte",
  10: "Máximo esforço",
};

/**
 * The one intensity signal GPS pace alone can't give — a cool flat easy day
 * and a hot hilly one can log the same pace but felt nothing alike. Asked
 * once, right here, while the run is still fresh: this is what the athlete
 * would forget by tomorrow, not something worth a settings-page form later.
 */
function RpeCard({ value, onSelect }: { value: number | null; onSelect: (rpe: number) => void }) {
  const shown = value ?? 5;
  return (
    <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 text-left">
      <span className="text-xs uppercase tracking-wide text-muted">Como foi o esforço?</span>
      <PillSlider
        className="mt-3"
        min={1}
        max={10}
        step={1}
        value={shown}
        onChange={onSelect}
        formatValue={(n) => `${n}/10`}
      />
      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
        <span>1 — leve</span>
        <span>10 — máximo</span>
      </div>
      <p className="mt-2 text-xs text-muted">
        {value !== null ? `${value} — ${RPE_LABEL[value]}` : "Arraste pra marcar como foi o esforço."}
      </p>
    </div>
  );
}

const GPS_LABEL: Record<string, { label: string; bars: 1 | 2 | 3; className: string }> = {
  searching: { label: "Procurando sinal", bars: 1, className: "bg-bad" },
  weak: { label: "Sinal fraco", bars: 2, className: "bg-warn" },
  good: { label: "Sinal bom", bars: 3, className: "bg-good" },
};

/**
 * Rotated while `status === "warming"` — one fixed pair (title stuck on
 * "Procurando GPS…" forever included) reads as the app being stuck, not
 * just the GPS chip taking its usual stretch. The third message used to
 * promise "só alguns segundos" — real devices indoors have taken up to
 * ~20s to lock a first fix, so it now sets a real range instead of a
 * false one.
 */
const WARMING_MESSAGES: { title: string; body: string }[] = [
  {
    title: "Procurando GPS…",
    body: "Fique a céu aberto. O cronômetro começa assim que o sinal ficar estável.",
  },
  {
    title: "Ajustando o sinal…",
    body: "Perto de prédios altos ou árvores densas, o GPS demora um pouco mais.",
  },
  {
    title: "Quase lá…",
    body: "Costuma levar de 10 a 30 segundos pra travar a primeira vez, principalmente em ambiente fechado.",
  },
  {
    title: "Só mais um instante…",
    body: "Assim que o sinal firmar, a corrida começa sozinha — não precisa tocar em nada.",
  },
];
const WARMING_MESSAGE_INTERVAL_MS = 3500;

/** Three ascending dots, wifi-bar style: how many are lit says the strength, the colour says whether that's good enough. Replaces a single dot + text label, which said the same thing twice. */
function GpsDot({ quality }: { quality: string }) {
  const info = GPS_LABEL[quality] ?? GPS_LABEL.searching;

  // No fix yet: nothing to rate on a 3-bar scale, so this shows the search
  // itself happening — a segment inching back and forth — rather than a
  // dot sitting at "1 bar" as if that were a real (bad) reading.
  if (quality === "searching") {
    return (
      <span
        role="img"
        aria-label={info.label}
        title={info.label}
        className="inline-flex items-center rounded-full bg-background/70 px-3 py-2.5 backdrop-blur-md"
      >
        <span className="relative h-1.5 w-7 overflow-hidden rounded-full bg-border/60">
          <span aria-hidden="true" className="pr-worm absolute inset-y-0 left-0 w-[24%] rounded-full bg-bad" />
        </span>
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={info.label}
      title={info.label}
      className="inline-flex items-end gap-1 rounded-full bg-background/70 px-3 py-2 backdrop-blur-md"
    >
      {([1, 2, 3] as const).map((step) => (
        <span
          key={step}
          className={`block rounded-full ${step <= info.bars ? info.className : "bg-border"}`}
          style={{ width: 5 + step * 1.5, height: 5 + step * 1.5 }}
        />
      ))}
    </span>
  );
}

/** The "Tipo de meta" tab icons (Xanthus Preparar Corrida.dc.html) — `distancia`/`tempo`/`ritmo`/`livre`. */
function GoalTypeIcon({
  id,
  className,
}: {
  id: "distancia" | "tempo" | "ritmo" | "livre";
  className?: string;
}) {
  const common = { viewBox: "0 0 24 24", className, "aria-hidden": true } as const;
  if (id === "distancia") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.3" />
      </svg>
    );
  }
  if (id === "tempo") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    );
  }
  if (id === "ritmo") {
    return (
      <svg {...common} fill="currentColor" stroke="none">
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M7 12a3 3 0 1 0 5-2 3 3 0 1 0-5 2 3 3 0 1 0 5 2 3 3 0 1 0-5-2z" />
    </svg>
  );
}

const GOAL_TYPE_LABELS: Record<"distancia" | "tempo" | "ritmo" | "livre", string> = {
  distancia: "Distância",
  tempo: "Tempo",
  ritmo: "Ritmo",
  livre: "Livre",
};

/**
 * "Tipo de meta" category row (Xanthus Preparar Corrida.dc.html) — bare tabs
 * (icon + label, active in accent with an underline bar) rather than boxed
 * pill buttons, so it reads as a different *kind* of control than the preset
 * options below it (`PresetChipRow`, which keeps the bordered/filled-pill
 * look — those really are a flat set of interchangeable choices). Category
 * vs. option had the exact same visual weight before this, which is what
 * made the two hard to tell apart at a glance. Same icon-above-label +
 * width-animated underline recipe as BottomNav's active-tab indicator
 * (app-shell.tsx), reused here instead of invented fresh.
 */
function GoalTypeTabs({
  value,
  onChange,
}: {
  value: "distancia" | "tempo" | "ritmo" | "livre";
  onChange: (id: "distancia" | "tempo" | "ritmo" | "livre") => void;
}) {
  const ids = ["distancia", "tempo", "ritmo", "livre"] as const;
  return (
    <div className="flex items-stretch justify-between">
      {ids.map((id) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={`flex flex-1 flex-col items-center gap-1.5 pb-2 text-[13px] transition-colors ${
              active ? "font-semibold text-accent" : "font-medium text-muted hover:text-foreground"
            }`}
          >
            <GoalTypeIcon id={id} className="h-5 w-5" />
            {GOAL_TYPE_LABELS[id]}
            <span
              className="h-[3px] rounded-full bg-accent transition-[width] duration-200 ease-out"
              style={{ width: active ? "28px" : "0px" }}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

function RepeatIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4v5h5" />
      <path d="M4.5 9A8 8 0 1 1 4 15" />
    </svg>
  );
}

/** Small calendar-check glyph — the "treino de hoje" chip pulling a session straight from /plano's engine, distinct from the plain repeat arrow above. */
function PlanIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14M6.5 2.5v3M13.5 2.5v3" />
      <path d="M7 12l2 2 4-4" />
    </svg>
  );
}

function formatGoalEta(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return "--:--";
  return formatElapsed(Math.round(totalSeconds));
}

/**
 * A row of preset chips plus a trailing "Custom" chip that opens a
 * bottom-sheet stepper — the picker pattern Xanthus Preparar Corrida.dc.html
 * uses for every value on this screen (distância, tempo, ritmo, aviso por
 * voz). "Custom" itself displays the live custom value once one is set,
 * instead of just the word "Custom" — same as the mock.
 */
function PresetChipRow({
  presets,
  value,
  onSelect,
  onOpenCustom,
  customLabel,
}: {
  presets: { value: number; label: string }[];
  value: number;
  onSelect: (value: number) => void;
  onOpenCustom: () => void;
  /** Non-null once the active value doesn't match any preset — shown on the "Custom" chip in place of the word itself. */
  customLabel: string | null;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {presets.map((preset) => (
        <button
          key={preset.value}
          type="button"
          onClick={() => onSelect(preset.value)}
          aria-pressed={value === preset.value}
          className={`min-h-11 rounded-xl border-2 px-2 py-2.5 text-sm font-semibold transition-colors ${
            value === preset.value
              ? "border-white/80 bg-accent text-accent-foreground"
              : "border-border bg-background text-foreground hover:border-accent"
          }`}
        >
          {preset.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onOpenCustom}
        aria-pressed={customLabel !== null}
        className={`min-h-11 rounded-xl border-2 px-2 py-2.5 text-sm font-semibold transition-colors ${
          customLabel !== null
            ? "border-white/80 bg-accent text-accent-foreground"
            : "border-dashed border-border bg-background text-muted hover:border-accent"
        }`}
      >
        {customLabel ?? "Custom"}
      </button>
    </div>
  );
}

/**
 * The bottom sheet a "Custom" chip opens — same shell (`ModalPortal`,
 * stepper -/+, big number) `/perfil/dados`'s weight picker already
 * established, parameterized here for whichever of the four values on this
 * screen opened it.
 */
function CustomValueSheet({
  title,
  value,
  min,
  max,
  step,
  formatValue,
  onConfirm,
  onClose,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (value: number) => string;
  onConfirm: (value: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-label={title}
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-sm rounded-t-3xl bg-background p-5 pb-8 text-foreground sm:rounded-3xl"
        >
          <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-border" />
          <p className="mb-6 text-center text-base font-bold">{title}</p>
          <div className="mb-7 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => setDraft((d) => Math.max(min, d - step))}
              aria-label="Diminuir"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl font-bold hover:border-accent"
            >
              –
            </button>
            <p className="min-w-28 text-center font-mono text-4xl font-extrabold tabular-nums">
              {formatValue(draft)}
            </p>
            <button
              type="button"
              onClick={() => setDraft((d) => Math.min(max, d + step))}
              aria-label="Aumentar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xl font-bold hover:border-accent"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => onConfirm(draft)}
            className="min-h-12 w-full rounded-full bg-accent px-4 py-3 text-sm font-bold text-accent-foreground"
          >
            Confirmar
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

type MetricId = "ritmo" | "distancia" | "tempo" | "medio" | "parcial";

/** The five always-available readouts the athlete can pick between for the giant focus number (see `metricTemplate` state) — the goal-dependent extras (chegada prevista, pace necessário, pace do km atual) stay outside this set since they only exist for some runs, and always render as extra grid cells instead of being pickable as the featured number. */
const METRICS: { id: MetricId; label: string; short: string; chip: string; unit: string }[] = [
  { id: "ritmo", label: "Ritmo atual", short: "Ritmo", chip: "Ritmo", unit: "min/km" },
  { id: "distancia", label: "Distância", short: "Distância", chip: "Distância", unit: "km" },
  { id: "tempo", label: "Tempo", short: "Tempo", chip: "Tempo", unit: "" },
  { id: "medio", label: "Ritmo médio", short: "Ritmo médio", chip: "Médio", unit: "min/km" },
  { id: "parcial", label: "Ritmo parcial", short: "Ritmo parcial", chip: "Parcial", unit: "min/km" },
];

function MetricIcon({ id, className }: { id: MetricId; className: string }) {
  const common = { viewBox: "0 0 24 24", className, "aria-hidden": true as const };
  switch (id) {
    case "ritmo":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
        </svg>
      );
    case "distancia":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.3" />
        </svg>
      );
    case "tempo":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="12" cy="12" r="9" strokeLinecap="butt" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case "medio":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d="M4 18a8 8 0 0 1 16 0" />
          <path d="M12 18l4-6" />
          <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "parcial":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 21V4" />
          <path d="M6 4h11l-3 3.5L17 11H6" />
        </svg>
      );
  }
}

/** One tile in the tracking screen's metric grid — icon-labeled card, same shape whether the reading comes from `METRICS` or from a goal/preference-gated extra. */
function MetricCard({
  icon,
  label,
  value,
  unit,
}: {
  icon: MetricId;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">{label}</span>
        <MetricIcon id={icon} className="h-4 w-4 text-accent" />
      </div>
      <p className="text-metal-run text-[26px] leading-none tabular-nums">
        {value}
        {unit && <span className="ml-1 text-[13px] font-sans font-medium text-muted">{unit}</span>}
      </p>
    </div>
  );
}

/**
 * A small live preview of the route, drawn as a plain SVG polyline via the
 * same flat local projection `historico/detalhe` uses for its own thumbnail
 * — deliberately not a real tiled map here: this redraws on every GPS fix
 * while tracking, and reloading map tiles that often would cost data and
 * battery for a 76px strip nobody is navigating by. The full basemap
 * (`RouteMap`) still renders once the run is over, on the finished screen.
 */
function RouteStrip({ points }: { points: StoredPoint[] }) {
  const projected = points.length >= 2 ? projectRoute(points, { viewBoxSize: 100, paddingFraction: 0.14 }) : null;
  return (
    <div className="relative mt-3 h-[76px] shrink-0 overflow-hidden rounded-2xl border border-border bg-surface">
      <span className="absolute top-2 left-2.5 text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
        Rota
      </span>
      {projected ? (
        <svg
          viewBox={`0 0 ${projected.viewBoxSize} ${projected.viewBoxSize}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
        >
          {projected.polylines.map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          ))}
        </svg>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted">Aguardando rota…</div>
      )}
    </div>
  );
}

interface EmblemProgressEntry {
  key: string;
  icon: ReactNode;
  accent: string;
  label: string;
  deltaLabel: string;
  milestoneLabel: string;
  beforeProgress: number;
  afterProgress: number;
  remainingLabel: string;
}

const DISTANCE_PROGRESS_ICON = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19 9 6 13 15 16 9 20 19" />
  </svg>
);

const TIME_PROGRESS_ICON = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

/**
 * The distância/tempo bars for the finish screen's "XP gained" strip — see
 * emblem-progress-bar.tsx. Elevação is left out: its gain is computed
 * lazily the first time a run's own detail screen is opened (see
 * `CompletedRun.elevationGainMeters`), so it simply isn't known yet at the
 * instant a run finishes.
 */
function computeEmblemProgress(run: CompletedRun, allRuns: CompletedRun[]): EmblemProgressEntry[] {
  const entries: EmblemProgressEntry[] = [];

  const afterMeters = totalDistanceMeters(allRuns);
  const beforeMeters = afterMeters - run.distanceMeters;
  const nextDistanceBefore = nextMilestone(beforeMeters);
  const nextDistanceAfter = nextMilestone(afterMeters);
  if (nextDistanceBefore && nextDistanceAfter && nextDistanceBefore.km === nextDistanceAfter.km) {
    entries.push({
      key: "distancia",
      icon: DISTANCE_PROGRESS_ICON,
      accent: metalForMilestone(EMBLEM_LADDER_KM, nextDistanceAfter.km).accent,
      label: "Distância",
      deltaLabel: `+${(run.distanceMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km`,
      milestoneLabel: `${formatEmblemKm(nextDistanceAfter.km)} km`,
      beforeProgress: nextDistanceBefore.progress,
      afterProgress: nextDistanceAfter.progress,
      remainingLabel: `Faltam ${(nextDistanceAfter.remainingMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km`,
    });
  }

  const afterHours = totalMovingHours(allRuns);
  const beforeHours = afterHours - runMovingSeconds(run) / 3600;
  const nextTimeBefore = nextTimeMilestone(beforeHours);
  const nextTimeAfter = nextTimeMilestone(afterHours);
  if (nextTimeBefore && nextTimeAfter && nextTimeBefore.value === nextTimeAfter.value) {
    entries.push({
      key: "tempo",
      icon: TIME_PROGRESS_ICON,
      accent: metalForMilestone(TIME_LADDER_HOURS, nextTimeAfter.value).accent,
      label: "Tempo",
      deltaLabel: `+${(runMovingSeconds(run) / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`,
      milestoneLabel: formatTimeHours(nextTimeAfter.value),
      beforeProgress: nextTimeBefore.progress,
      afterProgress: nextTimeAfter.progress,
      remainingLabel: `Faltam ${nextTimeAfter.remaining.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`,
    });
  }

  return entries;
}

export default function RunPage() {
  const { state, start, pause, resume, finish, reset, setPauseReason, recover, prewarm, cancelPrewarm } =
    useRunTracker();

  const [discarding, setDiscarding] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [warmingMessageIndex, setWarmingMessageIndex] = useState(0);
  /**
   * A run whose process died mid-recording (screen locked, Android reclaimed
   * the memory, no foreground service keeping it alive) — checked once on
   * mount against the buffer `persistIfDue` writes every 10s during an
   * active run. Non-null blocks the normal idle form: starting a fresh run
   * before this is resolved would silently overwrite the recoverable
   * snapshot the moment the new run's own persistence kicks in.
   */
  const [recoverableRun, setRecoverableRun] = useState<ActiveRunSnapshot | null>(null);
  /** Which of `goalKm`/`goalMinutes`/`goalPaceSec` actually becomes the run's goal on start — mutually exclusive in the UI (Xanthus Preparar Corrida.dc.html's "Tipo de meta" tabs) even though `RunGoal` itself supports distância+tempo together, since showing every value permanently read as "set them all" when only one was ever meant to gate the run. */
  const [goalType, setGoalType] = useState<"distancia" | "tempo" | "ritmo" | "livre">("distancia");
  const [goalKm, setGoalKm] = useState(5);
  const [goalMinutes, setGoalMinutes] = useState(30);
  /** Target pace to hold, seconds/km — 330 = 5:30/km, a typical easy-run pace. */
  const [goalPaceSec, setGoalPaceSec] = useState(330);
  /** Which "Custom" chip's sheet is currently open — at most one at a time, across all four pickers on this screen. */
  const [customSheet, setCustomSheet] = useState<"distancia" | "tempo" | "ritmo" | "voz" | null>(null);
  const [shoeName, setShoeName] = useState("");
  const [registeredShoes, setRegisteredShoes] = useState<Shoe[]>([]);
  const [recentRuns, setRecentRuns] = useState<CompletedRun[]>([]);
  const [completedRunsForPlan, setCompletedRunsForPlan] = useState<CompletedRun[] | null>(null);
  const [coachOverrides, setCoachOverrides] = useState<Map<string, ParsedPlanOverride>>(new Map());
  const [painCheckInsForPlan, setPainCheckInsForPlan] = useState<PainCheckIn[]>([]);
  const [runnerProfile] = useRunnerProfile();
  const [selectedGhostId, setSelectedGhostId] = useState<string | null>(null);
  /** The ghost actually used for the in-progress run, captured at start — kept separate from the
   * picker above so a later change to `selectedGhostId` (e.g. after resetting for a new run)
   * doesn't retroactively change what the finished summary says was raced against. */
  const [activeGhost, setActiveGhost] = useState<CompletedRun | null>(null);
  const [runRecords, setRunRecords] = useState<RunRecord[]>([]);
  const [openedRecordMeters, setOpenedRecordMeters] = useState<number[]>([]);
  const [savedRpe, setSavedRpe] = useState<number | null>(null);
  const [revealing, setRevealing] = useState<{ record: RunRecord; wasOpened: boolean } | null>(null);
  /** Lifetime-distance milestones this run's own distance pushed the total past — see emblems.ts. Kept entirely separate from `runRecords`/`revealing` above, same as the two systems stay separate everywhere else. */
  const [crossedEmblemsKm, setCrossedEmblemsKm] = useState<number[]>([]);
  const [openedEmblemsKm, setOpenedEmblemsKm] = useState<number[]>([]);
  /** "XP gained" bars toward whichever ladder rung this run moved the needle on without finishing it — see emblem-progress-bar.tsx for why a crossed milestone excludes that ladder from this list instead of also appearing here. */
  const [emblemProgress, setEmblemProgress] = useState<EmblemProgressEntry[]>([]);
  const [revealingEmblemKm, setRevealingEmblemKm] = useState<number | null>(null);
  /** Persisted via `updateRunElevationGain` so `/historico/detalhe` opens with it already known instead of recomputing. */
  const [elevationGain, setElevationGain] = useState<number | null>(null);
  /** Distinguishes "still waiting on the lookup" (show "calculando…") from "lookup came back null" (show nothing, same as `/historico/detalhe` does) — see the `elevationPending` derivation below. */
  const [elevationFailed, setElevationFailed] = useState(false);
  /** Accepted coaches this athlete could go live with — empty for almost everyone, which is why the picker below only renders when it isn't. */
  const [coaches, setCoaches] = useState<CoachConnection[]>([]);
  /** Which coach (if any) this run is being shared live with — chosen before starting, null means "not live". */
  const [liveCoachId, setLiveCoachId] = useState<string | null>(null);
  /** Own account id (needed to keep this athlete's own id out of the live-viewer permission list computed from the longão's participants below), plus `profile`/`refresh` for the post-run "ranking de lugares" confirmation below. */
  const { account, profile, refresh: refreshAuth } = useAuth();
  /** The "longão" this device currently remembers being part of, if any and still open — resolved from `getActiveGroupRunCode()`'s localStorage pointer, same re-check-on-return-to-idle timing as `coaches` above. */
  const [longaoSession, setLongaoSession] = useState<GroupRun | null>(null);
  /** Pre-selected on by default when there's an active longão — same reasoning `install-prompt.tsx` uses for defaults that should be visible but always a tap away from off. */
  const [shareLongao, setShareLongao] = useState(true);

  /** Which metric gets the giant focus number on the tracking screen — a per-run UI choice, not persisted anywhere (defaults back to "ritmo" on the next run). */
  const [metricTemplate, setMetricTemplate] = useState<MetricId>("ritmo");
  /**
   * Manual lap marks — local to this screen, same reasoning as `manualTracks`
   * below: a pacing aid the athlete controls by tapping the lap button, not
   * something `useRunTracker` needs to know about or persist. Each entry
   * freezes the split pace since the *previous* mark (or since the run
   * started, for the first one) at the moment it was tapped.
   */
  const [laps, setLaps] = useState<{ atDistanceMeters: number; atElapsedSeconds: number; paceSecPerKm: number }[]>(
    [],
  );
  const [lapToast, setLapToast] = useState<string | null>(null);
  const lapToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** See `recoverableRun`'s own comment — checked once, not on every re-render, since `start()`/`recover()` are the only things that should ever change what's buffered. */
  useEffect(() => {
    loadActiveRun().then((snapshot) => {
      if (snapshot && (snapshot.points.length > 0 || snapshot.distanceMeters > 0)) {
        setRecoverableRun(snapshot);
      }
    });
  }, []);

  useEffect(() => {
    // No reset-to-0 on leaving "warming" — the only other setState here
    // would run synchronously in the effect body, which cascades renders.
    // Starting the next warmup mid-cycle instead of at message 1 is a cost
    // worth paying to avoid that.
    if (state.status !== "warming") return;
    const id = setInterval(() => {
      setWarmingMessageIndex((i) => (i + 1) % WARMING_MESSAGES.length);
    }, WARMING_MESSAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.status]);

  /**
   * Personal-record check: best split for each standard distance this run
   * covers, compared against every prior run's own best split for that same
   * distance — not "did the total distance land near 5km", an actual
   * fastest-contiguous-5km-anywhere-in-the-run check, same idea as Strava's
   * PR badges. Runs once against the full history right after `finish()`
   * writes the record, not on every render.
   */
  useEffect(() => {
    if (state.status !== "finished" || !state.finishedRun) return;
    const run = state.finishedRun;
    listCompletedRuns().then((allRuns) => {
      setRunRecords(computeRunRecords(run, allRuns));
      // `allRuns` already includes this run (finish() saves it before this
      // effect's fetch fires), so subtracting its own distance back out is
      // what the lifetime total looked like the instant before it counted.
      const newTotal = totalDistanceMeters(allRuns);
      setCrossedEmblemsKm(milestonesJustCrossed(newTotal - run.distanceMeters, newTotal));
      setEmblemProgress(computeEmblemProgress(run, allRuns));
    });
  }, [state.status, state.finishedRun]);

  /**
   * Elevation gain for the finish screen — same lookup `/historico/detalhe`
   * does lazily, just kicked off immediately instead of waiting for that
   * screen to ever be opened. Genuinely can't be known any earlier than
   * this (see the comment on `computeEmblemProgress` above), so the finish
   * screen shows "calculando…" for the moment this takes.
   */
  useEffect(() => {
    if (state.status !== "finished" || !state.finishedRun) return;
    const run = state.finishedRun;
    if (run.elevationGainMeters !== undefined) return;
    let cancelled = false;
    computeElevationGain(run.points).then((gain) => {
      if (cancelled) return;
      if (gain === null) {
        setElevationFailed(true);
        return;
      }
      setElevationGain(gain);
      void updateRunElevationGain(run.id, gain);
    });
    return () => {
      cancelled = true;
    };
  }, [state.status, state.finishedRun]);

  /**
   * Cumulative km/run count for the friends-only profile view
   * (/perfil/ver) — recorded automatically, no confirmation needed. Unlike
   * the place match below, there's no ambiguity to confirm here: this
   * account really did just finish a run of this exact distance.
   */
  useEffect(() => {
    if (state.status !== "finished" || !state.finishedRun || !account) return;
    void recordFinishedRun(state.finishedRun.distanceMeters);
  }, [state.status, state.finishedRun, account]);

  /**
   * "Ranking de lugares" match — same run-once-per-finish timing as the
   * elevation lookup above, just local geometry instead of a network call
   * (see `matchPlaceForRoute`'s own comment for why most runs match
   * nothing). `placeConfirmed`/`placeDismissed` reset alongside the match
   * itself so a *previous* run's confirmation state can never leak onto
   * this one's prompt.
   */
  const [placeMatch, setPlaceMatch] = useState<RunningPlace | null>(null);
  const [placeConfirming, setPlaceConfirming] = useState(false);
  const [placeConfirmed, setPlaceConfirmed] = useState(false);
  const [placeDismissed, setPlaceDismissed] = useState(false);

  useEffect(() => {
    if (state.status !== "finished" || !state.finishedRun) return;
    const points = state.finishedRun.points;
    // Deferred a tick — same reasoning documented elsewhere in this file
    // (the coach/session idle-refresh effects above) for why a synchronous
    // `setState` right in the effect body trips the cascading-render lint
    // rule; resolving through a microtask first is enough to satisfy it.
    void Promise.resolve().then(() => {
      setPlaceMatch(matchPlaceForRoute(points));
      setPlaceConfirmed(false);
      setPlaceDismissed(false);
    });
  }, [state.status, state.finishedRun]);

  /**
   * "Sim" here does double duty for someone who's never touched the
   * /perfil toggle: it turns `leaderboardOptIn` on *and* records this run
   * in the same tap, rather than making a first-time confirm a dead end
   * that quietly does nothing until the athlete separately finds the
   * setting. Every later confirm on an already-opted-in account just
   * skips straight to `recordRunAtPlace`.
   */
  const handleConfirmPlace = useCallback(async () => {
    if (!placeMatch || !state.finishedRun || placeConfirming) return;
    setPlaceConfirming(true);
    if (account && !profile?.leaderboardOptIn) {
      await updateProfile(account.id, { leaderboardOptIn: true });
      await refreshAuth();
    }
    await recordRunAtPlace(placeMatch.id, state.finishedRun.distanceMeters);
    setPlaceConfirming(false);
    setPlaceConfirmed(true);
  }, [placeMatch, state.finishedRun, placeConfirming, account, profile, refreshAuth]);

  /**
   * Shoe names for the datalist below, and the runner's most recent completed
   * runs to offer as ghosts to race against. Suggestions lead with the shoes
   * registered on /perfil — one registered today with zero runs still needs
   * to autocomplete — and history fills in names typed here before the
   * catalog existed. Re-fetched every time the screen returns to `idle` (not
   * just on mount) so a run just finished in this same session shows up as a
   * ghost candidate for the next one, without needing a page reload.
   */
  useEffect(() => {
    if (state.status !== "idle") return;
    Promise.all([listShoes(), listCompletedRuns(), listPainCheckIns()]).then(([shoes, runs, painCheckIns]) => {
      setRegisteredShoes(shoes);
      const sorted = [...runs].sort((a, b) => b.startedAt - a.startedAt);
      setRecentRuns(sorted.slice(0, RECENT_GHOST_CANDIDATES));
      setCompletedRunsForPlan(runs);
      setPainCheckInsForPlan(painCheckIns);
    });
  }, [state.status]);

  // Same coach-override lookup /plano applies — only meaningful once
  // signed in, since an override is keyed by the real account ID.
  useEffect(() => {
    if (!account) return;
    listPlanOverridesForStudent(account.id).then(setCoachOverrides);
  }, [account]);

  /**
   * Real "GPS pronto"/"Buscando GPS…" on Preparar Corrida (Xanthus Preparar
   * Corrida.dc.html) instead of no status at all — begins the same watch a
   * real run uses while this screen is up, so there's an actual reading to
   * show rather than one invented ahead of ever asking the OS for a fix.
   * `recoverableRun` gates this off: that screen is "resume or discard a
   * dead run", not Preparar Corrida, and has no use for a GPS reading.
   * Cleanup stops the watch on unmount (navigated to another tab without
   * starting) — a no-op if `start()` already took ownership of it (see
   * `cancelPrewarm`'s own guard).
   */
  useEffect(() => {
    if (state.status !== "idle" || recoverableRun) return;
    prewarm();
    return () => {
      cancelPrewarm();
    };
  }, [state.status, recoverableRun, prewarm, cancelPrewarm]);

  /** Same re-fetch-on-return-to-idle reasoning as the effect above — a coach accepted mid-session should be pickable for the very next run. */
  useEffect(() => {
    if (state.status !== "idle") return;
    listCoachConnections("accepted").then((rows) => {
      const asStudent = rows.filter((c) => c.myRole === "student");
      setCoaches(asStudent);
      setLiveCoachId((current) => (asStudent.some((c) => c.otherId === current) ? current : null));
    });
  }, [state.status]);

  /**
   * Same idle-refresh timing as the coach effect above — also drops a
   * remembered session that expired or got closed since the last visit,
   * instead of offering to share with something that no longer exists.
   * Both branches resolve through the async function below rather than one
   * setting state directly in the effect body, since only one of them did
   * originally and that was enough to trip the cascading-render lint rule.
   */
  useEffect(() => {
    if (state.status !== "idle") return;
    let cancelled = false;
    (async () => {
      const code = getActiveGroupRunCode();
      const session = code ? await getGroupRun(code) : null;
      const usable =
        session && session.status === "open" && new Date(session.expiresAt).getTime() > Date.now();
      if (!cancelled) setLongaoSession(usable ? session : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  const selectedGhost = recentRuns.find((r) => r.id === selectedGhostId) ?? null;
  /** Most recent real run with actual distance — powers the "Repetir última corrida" chip (Xanthus Preparar Corrida.dc.html). `recentRuns` is already sorted newest-first. */
  const lastRealRun = recentRuns.find((r) => r.distanceMeters > 0) ?? null;

  /**
   * Today's session from `/plano`'s own engine, if a real plan exists —
   * closes the gap between "we compute a training plan" and "the plan
   * actually reaches the screen where a run gets started." Without this,
   * Preparar Corrida had no idea a plan existed at all: every goal here was
   * always typed by hand, even on a day the athlete had already told /plano
   * they wanted a specific quality session at a specific pace. Null on a
   * rest day, same as `computeCurrentPlanWeek` returning null for "no plan
   * yet" — the chip below just doesn't render either way.
   */
  const todaysPlan = useMemo(() => {
    if (completedRunsForPlan === null) return null;
    return computeCurrentPlanWeek(runnerProfile, completedRunsForPlan, painCheckInsForPlan);
  }, [runnerProfile, completedRunsForPlan, painCheckInsForPlan]);
  /** A coach's explicit choice for this week (if any) wins here too — same override /plano applies, so "treino de hoje" never contradicts what the athlete's own plan screen shows. */
  const todaysWeek = todaysPlan ? applyCoachOverride(todaysPlan.currentWeek, coachOverrides.get(todaysPlan.currentWeek.startDate)) : undefined;
  const todaysSession = todaysWeek?.sessions[isoWeekday(new Date())];
  const todaysPlannedSession = todaysSession && todaysSession.kind !== "rest" ? todaysSession : null;

  /**
   * The announcement interval comes from the preference set on /perfil, and
   * changing it here writes it back — same single source, no second copy of
   * the setting. The tracker hook still owns the announcing itself; this is
   * only the value handed to `start()`.
   */
  const [preferences, updatePreferences] = usePreferences();
  const announceMeters = preferences.announceIntervalMeters;

  /**
   * Live position sharing — a ping to whoever's watching (the chosen coach,
   * and/or everyone currently in the active "longão") every few seconds
   * while `tracking`/`paused`, never more often than that (a live map only
   * needs to be roughly current, not frame-perfect, and every extra request
   * is data and battery the athlete is paying for mid-run). The session
   * starts the moment tracking actually begins (not at the idle "choose a
   * coach" step, since warmup might never complete) and ends the moment
   * it stops being `tracking`/`paused` for any reason — finished, or this
   * screen unmounting entirely — so nobody watching keeps seeing a dot that
   * stopped moving for a reason they can't see.
   */
  const liveSessionActiveRef = useRef(false);
  const lastLivePushRef = useRef(0);
  const LIVE_PUSH_INTERVAL_MS = 6000;

  /** Kept outside React state — read fresh by the push effect below on its own next tick rather than becoming a dependency, same reasoning `liveSessionActiveRef` already follows. */
  const groupRunParticipantIdsRef = useRef<string[]>([]);
  const PARTICIPANT_POLL_MS = 20_000;
  const activeSessionCode = shareLongao ? (longaoSession?.$id ?? null) : null;

  /**
   * The "Grupo" sheet — its own map instead of navigating to `/longao/mapa`,
   * since leaving this page mid-run would end the run (see the plan's own
   * note on why `useRunTracker` being page-local state rules that out).
   * `useGroupLiveRuns` only polls while `groupSheetOpen` is true — no
   * background cost for a button that isn't currently showing anything.
   */
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const groupLiveActive =
    activeSessionCode !== null && (state.status === "tracking" || state.status === "paused");
  const groupData = useGroupLiveRuns(groupLiveActive ? activeSessionCode : null, groupSheetOpen);
  const groupMarkers = buildGroupMarkers(groupData, account?.id ?? null);

  /**
   * Re-reads who's actually in the longão every 20s while live, and pushes
   * the updated viewer list onto the already-running row (see
   * `refreshLiveSessionAudience`'s own comment for why permissions set at
   * creation time alone aren't enough — someone joining mid-run wouldn't
   * otherwise ever be granted read on this athlete's dot).
   */
  useEffect(() => {
    const live = state.status === "tracking" || state.status === "paused";
    if (!live || !activeSessionCode) return;
    let cancelled = false;
    const poll = async () => {
      const rows = await listParticipants(activeSessionCode);
      if (cancelled) return;
      const ids = rows.map((row) => row.participant.userId).filter((id) => id !== account?.id);
      const current = groupRunParticipantIdsRef.current;
      const changed = ids.length !== current.length || ids.some((id) => !current.includes(id));
      groupRunParticipantIdsRef.current = ids;
      if (changed && liveSessionActiveRef.current && state.runId) {
        void refreshLiveSessionAudience(state.runId, [...(liveCoachId ? [liveCoachId] : []), ...ids]);
      }
    };
    void poll();
    const interval = setInterval(poll, PARTICIPANT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state.status, activeSessionCode, state.runId, liveCoachId, account?.id]);

  useEffect(() => {
    const live = state.status === "tracking" || state.status === "paused";
    const viewerIds = [...(liveCoachId ? [liveCoachId] : []), ...groupRunParticipantIdsRef.current];
    if (live && viewerIds.length > 0 && state.runId) {
      const lastPoint = state.points[state.points.length - 1];
      if (lastPoint) {
        const payload = {
          distanceMeters: state.distanceMeters,
          currentPaceSecPerKm: state.currentPaceSecPerKm,
          elapsedSeconds: state.elapsedSeconds,
          lat: lastPoint.lat,
          lon: lastPoint.lon,
        };
        if (!liveSessionActiveRef.current) {
          liveSessionActiveRef.current = true;
          lastLivePushRef.current = Date.now();
          void startLiveSession(
            state.runId,
            Date.now() - state.elapsedSeconds * 1000,
            viewerIds,
            payload,
            activeSessionCode ?? undefined,
          );
        } else if (Date.now() - lastLivePushRef.current >= LIVE_PUSH_INTERVAL_MS) {
          lastLivePushRef.current = Date.now();
          void updateLiveSession(state.runId, payload);
        }
      }
    } else if (liveSessionActiveRef.current && state.runId) {
      liveSessionActiveRef.current = false;
      void endLiveSession(state.runId);
    }
  }, [
    liveCoachId,
    activeSessionCode,
    state.runId,
    state.status,
    state.distanceMeters,
    state.currentPaceSecPerKm,
    state.elapsedSeconds,
    state.points,
  ]);

  // Belt-and-suspenders: if this screen unmounts mid-run (navigated away,
  // not "finished" the normal way) the effect above never gets a chance to
  // see the status change, so the live row would otherwise linger until the
  // coach's own staleness check catches it.
  useEffect(() => {
    return () => {
      if (liveSessionActiveRef.current && state.runId) void endLiveSession(state.runId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * While a run is being recorded the app's bottom tab bar is hidden: no
   * accidental navigation away from an in-progress recording, and the readout
   * gets the full screen. `idle` and `finished` keep the tabs.
   */
  useImmersiveMode(
    state.status === "warming" || state.status === "tracking" || state.status === "paused",
  );

  /**
   * Header GPS dot (see `useHeaderGpsStatus` in app-shell.tsx) — the
   * replacement for the old "Buscando GPS…"/"GPS pronto" text pill this
   * screen used to render under its own title. Only meaningful while the
   * header is actually on screen: "warming" briefly overlaps with
   * `useImmersiveMode(true)` above (which hides the header entirely), so
   * this covers "idle" only in practice — kept simple rather than trying to
   * track which of the two is currently winning.
   */
  useHeaderGpsStatus(state.status === "idle" ? state.gpsQuality : null);

  /**
   * A signal that's merely weak for a few seconds is normal (tree cover, a
   * tall building) and not worth interrupting anyone about. One that stays
   * bad for a while means the recorded route is actually degrading, and the
   * three little dots up top are easy to not notice mid-stride — this
   * surfaces the same information as a banner you'd actually catch.
   */
  const WEAK_SIGNAL_WARNING_MS = 20_000;
  const [showWeakSignalWarning, setShowWeakSignalWarning] = useState(false);
  const badSignalSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const isLiveRun = state.status === "tracking" || state.status === "paused";
    if (!isLiveRun || state.gpsQuality === "good") {
      badSignalSinceRef.current = null;
      // Clearing an already-shown warning the instant the signal recovers —
      // there's no external event to hang this off of, `gpsQuality` itself
      // (a dependency here) is the signal.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowWeakSignalWarning(false);
      return;
    }
    if (badSignalSinceRef.current === null) badSignalSinceRef.current = Date.now();

    const id = setInterval(() => {
      if (badSignalSinceRef.current !== null) {
        setShowWeakSignalWarning(Date.now() - badSignalSinceRef.current >= WEAK_SIGNAL_WARNING_MS);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state.status, state.gpsQuality]);

  /**
   * The single source of truth for "Trilha sonora" once a run is finished —
   * seeded from `state.finishedRun.tracks` below, then added to/removed from
   * locally so the list updates immediately without waiting on a reload.
   * Kept apart from `state.finishedRun` itself since that's owned by
   * `useRunTracker` and has no setter this screen can reach.
   */
  const [manualTracks, setManualTracks] = useState<RunTrack[]>([]);
  const [musicQuery, setMusicQuery] = useState("");
  const [musicResults, setMusicResults] = useState<TrackCandidate[] | null>(null);
  const [musicSearching, setMusicSearching] = useState(false);
  const [musicSearchFailed, setMusicSearchFailed] = useState(false);

  const displayedTracks = manualTracks;

  /** Narrowing on `state.finishedRun` doesn't survive into the record callbacks below. */
  const finishedRun = state.finishedRun;

  /**
   * Pausar/Finalizar tapped from the Android lock-screen notification (see
   * `updateLiveNotification` in useRunTracker.ts) — reaches JS as a plugin
   * event only while this screen's WebView is alive. Calls the exact same
   * `pause()`/`finish()` the on-screen buttons already use, so there's no
   * second copy of that logic. `finish()` here mirrors `HoldToFinishButton`'s
   * `onConfirm` below (same `shoeName`, same `setManualTracks` follow-up) —
   * the notification's own "Finalizar" is a single tap rather than a hold,
   * since reaching the notification, expanding it, and hitting the right
   * button is already deliberate enough.
   */
  useEffect(
    () =>
      onNotificationAction((action) => {
        if (action === "pause") {
          pause();
        } else {
          const run = finish({ shoeName });
          setManualTracks(run.tracks ?? []);
        }
      }),
    [pause, finish, shoeName],
  );

  const handleMusicSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!musicQuery.trim()) return;
    setMusicSearching(true);
    setMusicSearchFailed(false);
    try {
      const results = await searchTracks(musicQuery);
      setMusicResults(results);
    } catch {
      setMusicResults(null);
      setMusicSearchFailed(true);
    } finally {
      setMusicSearching(false);
    }
  };

  /* eslint-disable react-hooks/preserve-manual-memoization -- compiler's own dependency inference disagrees with these arrays on a component this large; functionally identical either way, just opts these two callbacks out of auto-memoization. */
  const handleAddManualTrack = useCallback(
    async (candidate: TrackCandidate) => {
      if (!state.finishedRun) return;
      const newTrack: RunTrack = {
        name: candidate.name,
        artist: candidate.artist,
        playedAt: Date.now(),
        artworkUrl: candidate.artworkUrl || undefined,
      };
      const next = [...manualTracks, newTrack];
      setManualTracks(next);
      setMusicQuery("");
      setMusicResults(null);
      await updateRunTracks(state.finishedRun.id, next);
    },
    [state.finishedRun, manualTracks],
  );

  const handleRemoveTrack = useCallback(
    async (index: number) => {
      if (!state.finishedRun) return;
      const next = manualTracks.filter((_, i) => i !== index);
      setManualTracks(next);
      await updateRunTracks(state.finishedRun.id, next);
    },
    [state.finishedRun, manualTracks],
  );
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const [showRunTips, setShowRunTips] = useState(false);
  /** True when the checklist was opened from the idle screen's "Rever dicas" link rather than as the gate before starting — completing it should just close it, not also start a run. */
  const [reviewingTips, setReviewingTips] = useState(false);
  /** Drives the arrow-travels-across-the-button animation on tap. */
  const [starting, setStarting] = useState(false);
  const START_ANIMATION_MS = 420;

  const handleStart = () => {
    setManualTracks([]);
    setMusicQuery("");
    setMusicResults(null);
    const distanceMeters = goalType === "distancia" && goalKm > 0 ? goalKm * 1000 : undefined;
    const durationSeconds = goalType === "tempo" && goalMinutes > 0 ? goalMinutes * 60 : undefined;
    const targetPaceSecPerKm = goalType === "ritmo" && goalPaceSec > 0 ? goalPaceSec : undefined;
    setActiveGhost(selectedGhost);
    start({
      announceIntervalMeters: announceMeters,
      goal:
        distanceMeters || durationSeconds || targetPaceSecPerKm
          ? { distanceMeters, durationSeconds, targetPaceSecPerKm }
          : undefined,
      ghostRun: selectedGhost ?? undefined,
      vibrateOnPaceDelay: preferences.vibrateOnPaceDelay,
    });
  };

  /** First tap ever shows the run-tips checklist instead of starting immediately; every tap after that starts right away. Either way, the tap itself always gets the arrow-travel feedback before anything else happens. */
  const handleStartClick = () => {
    setStarting(true);
    window.setTimeout(() => {
      if (hasSeenRunTips()) {
        handleStart();
        return;
      }
      setShowRunTips(true);
      setStarting(false);
    }, START_ANIMATION_MS);
  };

  const handleRunTipsDone = () => {
    markRunTipsSeen();
    setShowRunTips(false);
    if (reviewingTips) {
      setReviewingTips(false);
      return;
    }
    handleStart();
  };

  const handleRunTipsSkip = () => {
    markRunTipsSeen();
    setShowRunTips(false);
    setReviewingTips(false);
  };

  const handleReviewTips = () => {
    setReviewingTips(true);
    setShowRunTips(true);
  };

  const handleReset = () => {
    setSelectedGhostId(null);
    setActiveGhost(null);
    setManualTracks([]);
    setMusicQuery("");
    setMusicResults(null);
    setDiscarding(false);
    setRunRecords([]);
    setOpenedRecordMeters([]);
    setSavedRpe(null);
    setRevealing(null);
    setCrossedEmblemsKm([]);
    setOpenedEmblemsKm([]);
    setRevealingEmblemKm(null);
    setEmblemProgress([]);
    setElevationGain(null);
    setElevationFailed(false);
    setMetricTemplate("ritmo");
    setLaps([]);
    clearTimeout(lapToastTimerRef.current ?? undefined);
    setLapToast(null);
    // `handleStartClick` sets this the moment "Iniciar corrida" is tapped
    // and only ever clears it itself on the *first-ever* tap (the run-tips
    // gate branch) — every tap after that hands off straight to
    // `handleStart()` and leaves it `true` forever. Canceling out of
    // "warming" (or discarding a run) back to idle used to land on that
    // same stuck `true`, leaving the button's label invisible and the
    // button itself disabled with no way to start another run short of
    // reloading the page.
    setStarting(false);
    reset();
  };

  /**
   * Tapping "Corrida" while already on it is a router no-op — `Link` to the
   * current URL doesn't navigate, so someone parked on the post-run summary
   * (scrolled down past RPE, PRs, the share card...) who taps the tab
   * expecting to land back on the start screen would otherwise see nothing
   * happen at all, which reads as the screen being stuck. Only fires from
   * `"finished"`: a live run has its own reasons not to be nuked by a tab tap
   * (see `useImmersiveMode` above — the tab bar isn't even reachable then).
   */
  useTabReclick("/run", () => {
    if (state.status === "finished") handleReset();
  });

  /** See the same handler in historico/detalhe/run-detail.tsx — the persisted flag only decides whether the box animation replays. */
  const handleRecordUnboxed = (runId: string, record: RunRecord) => {
    if (openedRecordMeters.includes(record.targetMeters)) return;
    setOpenedRecordMeters((current) => [...current, record.targetMeters]);
    markRecordOpened(runId, record.targetMeters).catch(() => {});
  };

  const handleEmblemOpened = (km: number) => {
    if (openedEmblemsKm.includes(km)) return;
    setOpenedEmblemsKm((current) => [...current, km]);
    markEmblemOpened("distancia", km).catch(() => {});
  };

  const handleRpeSelect = (runId: string, rpe: number) => {
    setSavedRpe(rpe);
    updateRunRpe(runId, rpe).catch(() => {});
  };

  /**
   * `finish()` already wrote the run to IndexedDB unconditionally — cheap
   * and crash-safe, and simpler than gating the save on a confirmation. This
   * is the explicit undo: a run finished "só pra testar" doesn't have to
   * stay in the history it was just written to.
   */
  const handleDiscard = async () => {
    if (!state.finishedRun) return;
    setDiscarding(true);
    await deleteCompletedRun(state.finishedRun.id);
    handleReset();
  };

  const handleRecoverContinue = () => {
    if (!recoverableRun) return;
    recover(recoverableRun);
    setRecoverableRun(null);
  };

  const handleRecoverDiscard = () => {
    void clearActiveRun();
    setRecoverableRun(null);
  };

  /**
   * Freezes the split pace since the previous mark (or since the run
   * started, for the first tap) into `laps`, then starts a fresh split from
   * this instant — mirrors how a real stopwatch lap button works. Guards
   * against a double-tap with nothing new to measure (zero elapsed time or
   * distance since the last mark) rather than recording a divide-by-zero
   * pace.
   */
  const markLap = () => {
    const prev = laps[laps.length - 1];
    const fromDistanceMeters = prev?.atDistanceMeters ?? 0;
    const fromElapsedSeconds = prev?.atElapsedSeconds ?? 0;
    const deltaMeters = state.distanceMeters - fromDistanceMeters;
    const deltaSeconds = state.elapsedSeconds - fromElapsedSeconds;
    if (deltaMeters <= 0 || deltaSeconds <= 0) return;
    const paceSecPerKm = deltaSeconds / (deltaMeters / 1000);
    const next = [
      ...laps,
      { atDistanceMeters: state.distanceMeters, atElapsedSeconds: state.elapsedSeconds, paceSecPerKm },
    ];
    setLaps(next);
    clearTimeout(lapToastTimerRef.current ?? undefined);
    setLapToast(`Volta ${next.length} marcada · ${formatPace(paceSecPerKm)}/km`);
    lapToastTimerRef.current = setTimeout(() => setLapToast(null), 2400);
  };

  const isLiveRun = state.status === "tracking" || state.status === "paused";
  const native = useIsNative();
  // The user's own resolved theme (Preferences.theme, /perfil) — not a raw
  // `matchMedia` read of the OS setting, which used to pick the wrong clip
  // whenever someone had explicitly overridden the app to light or dark
  // while their OS stayed on the other one.
  const isDarkMode = useEffectiveColorScheme() === "dark";
  // Same condition passed to useImmersiveMode() above — while it's true,
  // AppShell skips its own top safe-area inset to keep the map full-bleed,
  // so this header has to carry that inset itself instead. The rest of the
  // time (idle/finished) AppShell already accounts for it, and adding it
  // here too would double the gap under the status bar.
  const immersive = state.status === "warming" || state.status === "tracking" || state.status === "paused";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      {/*
        The "← Xanthus" link is skipped in the native app: it targets "/",
        the marketing landing page, but StandaloneGate redirects any native
        launch straight back to /run before the landing page ever paints —
        so the link would just bounce right back here, while still costing
        space right where the OS draws its own status bar (clock, battery,
        signal).
      */}
      <header
        className="relative z-10 flex items-center justify-between px-5 py-4"
        style={immersive ? { paddingTop: "calc(1rem + env(safe-area-inset-top))" } : undefined}
      >
        {!native && (
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            &larr; Xanthus
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          {groupLiveActive && (
            <button
              type="button"
              onClick={() => setGroupSheetOpen(true)}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:border-accent"
            >
              Grupo
            </button>
          )}
          {state.status !== "idle" && <GpsDot quality={state.gpsQuality} />}
        </div>
      </header>

      {isLiveRun && showWeakSignalWarning && (
        <div className="relative z-10 mx-5 -mt-1 mb-2 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-warn">
          Sinal de GPS fraco há mais de {Math.round(WEAK_SIGNAL_WARNING_MS / 1000)}s — o trajeto e a
          distância podem ficar imprecisos até melhorar.
        </div>
      )}

      {state.status === "idle" && recoverableRun && (
        <main className="flex flex-1 flex-col justify-center gap-8 px-6 pb-16">
          <div className="mx-auto w-full max-w-sm space-y-6 text-center">
            <div>
              <h1 className="font-mono text-2xl font-semibold tracking-wide text-balance">
                Corrida recuperada
              </h1>
              <p className="mt-1 text-sm text-muted">
                O app foi encerrado no meio dessa corrida (tela apagada por tempo demais, provavelmente)
                antes de salvar. Encontramos {formatDistanceKm(recoverableRun.distanceMeters)} km já
                gravados — continuar de onde parou ou descartar?
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleRecoverContinue}
                className="w-full rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground"
              >
                Continuar corrida
              </button>
              <button
                type="button"
                onClick={handleRecoverDiscard}
                className="w-full rounded-full border border-border px-6 py-3 text-sm font-semibold text-bad"
              >
                Descartar
              </button>
            </div>
          </div>
        </main>
      )}

      {state.status === "idle" && !recoverableRun && (
        <main className="flex flex-1 flex-col justify-center gap-8 px-6 pb-16">
          <div className="mx-auto w-full max-w-sm space-y-6">
            <div>
              <h1 className="font-mono text-2xl font-semibold tracking-wide text-balance">
                Preparar corrida
              </h1>
              <p className="mt-1 text-sm text-muted">
                A tela precisa ficar ligada durante o treino para o GPS se manter preciso. Se possível,
                deixe o tempo até bloquear a tela no máximo antes de sair —{" "}
                <button
                  type="button"
                  onClick={handleReviewTips}
                  className="text-accent underline underline-offset-2"
                >
                  rever as dicas
                </button>
                .
              </p>
              {todaysPlannedSession && (
                <button
                  type="button"
                  onClick={() => {
                    const zones = todaysPlan?.plan.paceZones;
                    if (todaysPlannedSession.paceZone && zones) {
                      setGoalType("ritmo");
                      setGoalPaceSec(Math.round(paceForZone(zones, todaysPlannedSession.paceZone)));
                    } else {
                      setGoalType("distancia");
                      setGoalKm(todaysPlannedSession.km);
                    }
                  }}
                  className="mt-3 flex items-center gap-2 self-start rounded-full border border-accent/40 bg-accent/10 px-3.5 py-2 text-xs font-semibold text-accent hover:border-accent hover:bg-accent/15"
                >
                  <PlanIcon className="h-3.5 w-3.5" />
                  Treino de hoje ·{" "}
                  {todaysPlannedSession.paceZone
                    ? `${ZONE_LABEL[todaysPlannedSession.paceZone]}, ${todaysPlannedSession.km} km`
                    : `${todaysPlannedSession.km} km`}
                </button>
              )}
              {!todaysPlannedSession && lastRealRun && (
                <button
                  type="button"
                  onClick={() => {
                    setGoalType("distancia");
                    setGoalKm(Math.round((lastRealRun.distanceMeters / 1000) * 10) / 10);
                  }}
                  className="mt-3 flex items-center gap-2 self-start rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-muted hover:border-accent hover:text-foreground"
                >
                  <RepeatIcon className="h-3.5 w-3.5" />
                  Repetir última corrida · {formatDistanceKm(lastRealRun.distanceMeters)} km
                </button>
              )}
            </div>

            <Card>
              <span className="mb-3 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                Tipo de meta
              </span>
              <div className="mb-3">
                <GoalTypeTabs value={goalType} onChange={setGoalType} />
              </div>

              {goalType === "distancia" && (
                <PresetChipRow
                  presets={DISTANCE_PRESETS_KM.map((km) => ({ value: km, label: `${km} km` }))}
                  value={goalKm}
                  onSelect={setGoalKm}
                  onOpenCustom={() => setCustomSheet("distancia")}
                  customLabel={DISTANCE_PRESETS_KM.includes(goalKm) ? null : `${goalKm} km`}
                />
              )}
              {goalType === "tempo" && (
                <PresetChipRow
                  presets={TIME_PRESETS_MIN.map((min) => ({ value: min, label: `${min} min` }))}
                  value={goalMinutes}
                  onSelect={setGoalMinutes}
                  onOpenCustom={() => setCustomSheet("tempo")}
                  customLabel={TIME_PRESETS_MIN.includes(goalMinutes) ? null : `${goalMinutes} min`}
                />
              )}
              {goalType === "ritmo" && (
                <PresetChipRow
                  presets={PACE_PRESETS_SEC.map((sec) => ({ value: sec, label: `${formatPace(sec)}/km` }))}
                  value={goalPaceSec}
                  onSelect={setGoalPaceSec}
                  onOpenCustom={() => setCustomSheet("ritmo")}
                  customLabel={PACE_PRESETS_SEC.includes(goalPaceSec) ? null : `${formatPace(goalPaceSec)}/km`}
                />
              )}
              {goalType === "livre" && (
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Sem meta — só cronômetro, mapa e pace ao vivo.
                </p>
              )}
            </Card>

            <div className="space-y-1.5">
              <span className="text-sm font-medium">Aviso por voz a cada</span>
              <PresetChipRow
                presets={VOICE_PRESETS_M.map((m) => ({ value: m, label: announceLabel(m) }))}
                value={announceMeters}
                onSelect={(meters) => updatePreferences({ announceIntervalMeters: meters })}
                onOpenCustom={() => setCustomSheet("voz")}
                customLabel={VOICE_PRESETS_M.includes(announceMeters) ? null : announceLabel(announceMeters)}
              />
            </div>

            {customSheet === "distancia" && (
              <CustomValueSheet
                title="Distância personalizada"
                value={goalKm}
                min={1}
                max={42}
                step={1}
                formatValue={(km) => `${km} km`}
                onConfirm={(km) => {
                  setGoalKm(km);
                  setCustomSheet(null);
                }}
                onClose={() => setCustomSheet(null)}
              />
            )}
            {customSheet === "tempo" && (
              <CustomValueSheet
                title="Tempo personalizado"
                value={goalMinutes}
                min={5}
                max={180}
                step={5}
                formatValue={(min) => `${min} min`}
                onConfirm={(min) => {
                  setGoalMinutes(min);
                  setCustomSheet(null);
                }}
                onClose={() => setCustomSheet(null)}
              />
            )}
            {customSheet === "ritmo" && (
              <CustomValueSheet
                title="Ritmo personalizado"
                value={goalPaceSec}
                min={180}
                max={600}
                step={5}
                formatValue={(sec) => `${formatPace(sec)}/km`}
                onConfirm={(sec) => {
                  setGoalPaceSec(sec);
                  setCustomSheet(null);
                }}
                onClose={() => setCustomSheet(null)}
              />
            )}
            {customSheet === "voz" && (
              <CustomValueSheet
                title="Aviso por voz personalizado"
                value={announceMeters}
                min={ANNOUNCE_MIN_METERS}
                max={ANNOUNCE_MAX_METERS}
                step={ANNOUNCE_STEP_METERS}
                formatValue={announceLabel}
                onConfirm={(meters) => {
                  updatePreferences({ announceIntervalMeters: meters });
                  setCustomSheet(null);
                }}
                onClose={() => setCustomSheet(null)}
              />
            )}

            <div className="block space-y-1.5">
              <span className="text-sm font-medium">Tênis (opcional)</span>
              {registeredShoes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShoeName("")}
                    className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                      shoeName === ""
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-foreground hover:border-accent"
                    }`}
                  >
                    Nenhum
                  </button>
                  {registeredShoes.map((shoe) => (
                    <button
                      key={shoe.id}
                      type="button"
                      onClick={() => setShoeName(shoe.name)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                        shoeName === shoe.name
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border bg-surface text-foreground hover:border-accent"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                        style={{ backgroundColor: shoe.color }}
                      />
                      {shoe.name}
                    </button>
                  ))}
                </div>
              ) : (
                // No free-text fallback here on purpose — a made-up name
                // typed once and never again isn't worth what it costs later
                // (histórico/progresso can't tell "Nike Pegasus" from a typo
                // of the same shoe). Registering once in Perfil is what
                // makes the mileage-per-shoe tracking there mean anything.
                <p className="text-xs leading-relaxed text-muted">
                  Nenhum tênis cadastrado ainda —{" "}
                  <Link href="/perfil" className="text-accent underline underline-offset-2">
                    cadastre um no seu perfil
                  </Link>{" "}
                  pra escolher aqui.
                </p>
              )}
            </div>

            {longaoSession && (
              <div className="block space-y-1.5">
                <span className="text-sm font-medium">Longão: {longaoSession.name}</span>
                <p className="text-xs text-muted">
                  Quem já entrou nesse longão (código {longaoSession.$id}) vê sua posição enquanto a
                  corrida rolar.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShareLongao(true)}
                    className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                      shareLongao
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-foreground hover:border-accent"
                    }`}
                  >
                    Compartilhar com o longão
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareLongao(false)}
                    className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                      !shareLongao
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-foreground hover:border-accent"
                    }`}
                  >
                    Não compartilhar
                  </button>
                </div>
              </div>
            )}

            {coaches.length > 0 && (
              <div className="block space-y-1.5">
                <span className="text-sm font-medium">Compartilhar ao vivo (opcional)</span>
                <p className="text-xs text-muted">
                  Enquanto a corrida rolar, essa pessoa vê sua posição e seu pace num mapa. Some sozinho
                  quando a corrida terminar.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setLiveCoachId(null)}
                    className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                      liveCoachId === null
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-foreground hover:border-accent"
                    }`}
                  >
                    Não compartilhar
                  </button>
                  {coaches.map((connection) => (
                    <button
                      key={connection.relationship.$id}
                      type="button"
                      onClick={() => setLiveCoachId(connection.otherId)}
                      className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                        liveCoachId === connection.otherId
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border bg-surface text-foreground hover:border-accent"
                      }`}
                    >
                      {connection.profile?.displayName ?? "Corredor(a)"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleStartClick}
              disabled={starting}
              className="relative flex w-full items-center justify-center overflow-hidden rounded-full bg-accent px-6 py-4 text-base font-semibold text-accent-foreground disabled:cursor-default"
            >
              {/*
                No `hover:`/`group-hover:` here on purpose — this is a touch-only
                screen, and a phone browser applying `:hover` on tap (and not
                clearing it until some other tap elsewhere) previously left the
                button stuck showing just the arrow with the label faded out,
                which read as "the start button is broken" since there was no
                second tap on this button to trigger the un-hover.
              */}
              <span className={`transition-opacity duration-300 ${starting ? "opacity-0" : ""}`}>
                Iniciar corrida
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className={`pointer-events-none absolute top-1/2 left-6 h-5 w-5 -translate-y-1/2 text-accent-foreground transition-all ease-out ${
                  starting
                    ? "!left-[calc(100%-3.25rem)] !h-8 !w-8 !translate-x-0 duration-[420ms]"
                    : "duration-300"
                }`}
              >
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {state.error && <p className="text-sm text-bad">{state.error}</p>}
          </div>
        </main>
      )}

      {state.status === "warming" && (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          {/*
           * Two separate clips (not one clip plus a runtime invert), same
           * reasoning as before: `running-loop-dark.mp4` is the same clip
           * pre-inverted (white line art, solid near-black background) so
           * dark mode needs no runtime recoloring. What changed is how the
           * background itself disappears — `TransparentLoopVideo` keys it
           * out pixel-by-pixel on a canvas instead of relying on the clip's
           * baked-in background matching the page underneath closely enough
           * to pass as transparent. `mix-blend-mode` was tried for that and
           * looked right in every desktop browser, but left a visible
           * mismatched box behind the runners on a real Android build
           * (WebViews don't reliably apply blend modes to `<video>`) — and
           * even a color-corrected clip can never be an exact, permanent
           * match for `--background`, so this makes the mismatch moot
           * instead of chasing ever-closer hex values.
           */}
          <TransparentLoopVideo
            key={isDarkMode ? "dark" : "light"}
            src={isDarkMode ? "/running-loop-dark.mp4" : "/running-loop.mp4"}
            bgColor={isDarkMode ? RUNNING_LOOP_DARK_BG : RUNNING_LOOP_LIGHT_BG}
            size={360}
            className="h-56 w-56 sm:h-64 sm:w-64"
          />
          <p key={`title-${warmingMessageIndex}`} className="pr-enter text-lg font-medium">
            {WARMING_MESSAGES[warmingMessageIndex].title}
          </p>
          <p key={`body-${warmingMessageIndex}`} className="pr-enter max-w-xs text-sm text-muted">
            {WARMING_MESSAGES[warmingMessageIndex].body}
          </p>
          <button type="button" onClick={handleReset} className="mt-4 text-sm text-muted underline">
            Cancelar
          </button>
        </main>
      )}

      {isLiveRun &&
        (() => {
          const featured = METRICS.find((m) => m.id === metricTemplate) ?? METRICS[0];
          const avgPaceSecPerKm = state.distanceMeters > 10 ? (state.elapsedSeconds / state.distanceMeters) * 1000 : NaN;
          const lastLap = laps[laps.length - 1] ?? null;
          const splitPaceSecPerKm = lastLap ? lastLap.paceSecPerKm : avgPaceSecPerKm;
          const metricValues: Record<MetricId, string> = {
            ritmo: formatPace(state.currentPaceSecPerKm),
            distancia: formatDistanceKm(state.distanceMeters),
            tempo: formatElapsed(state.elapsedSeconds),
            medio: formatPace(avgPaceSecPerKm),
            parcial: formatPace(splitPaceSecPerKm),
          };
          // "medio" only fills a grid slot when the athlete opted into it on
          // /perfil (same preference the old plain-text layout respected) —
          // unless it's the featured pick, in which case showing it there
          // already satisfies "I want to see this".
          const gridMetrics = METRICS.filter(
            (m) => m.id !== featured.id && (m.id !== "medio" || preferences.showAveragePaceLive),
          );

          return (
            <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-8">
              <div className="flex items-center justify-end">
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
                  {laps.length} {laps.length === 1 ? "volta" : "voltas"}
                </span>
              </div>

              {/*
               * Template picker — pick which metric gets the giant number
               * below. Purely a display choice: nothing about how the run is
               * actually tracked changes with it.
               */}
              <div className="mt-3 flex flex-wrap gap-2">
                {METRICS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetricTemplate(m.id)}
                    className={`flex flex-1 basis-[30%] items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2.5 text-[13px] font-bold whitespace-nowrap transition-colors ${
                      m.id === featured.id
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border bg-surface text-foreground"
                    }`}
                  >
                    <MetricIcon id={m.id} className="h-4 w-4" />
                    {m.chip}
                  </button>
                ))}
              </div>

              <div className="flex flex-col items-center px-3 py-6">
                <span className="text-metal-run text-metal-run-giant text-[4.75rem] leading-none tabular-nums whitespace-nowrap">
                  {metricValues[featured.id]}
                </span>
                <span className="mt-2.5 text-xs font-semibold tracking-[0.1em] text-accent uppercase">
                  {featured.label}
                  {featured.unit ? ` · ${featured.unit}` : ""}
                </span>
                {state.paceDeltaSecPerKm !== null ? (
                  <div className="mt-3">
                    <PaceDeltaPill deltaSecPerKm={state.paceDeltaSecPerKm} />
                  </div>
                ) : (
                  state.ghostDeltaSeconds !== null && (
                    <div className="mt-3">
                      <GhostDeltaPill deltaSeconds={state.ghostDeltaSeconds} />
                    </div>
                  )
                )}
              </div>

              {state.status === "paused" &&
                (() => {
                  const currentPause = state.pauseEvents[state.pauseEvents.length - 1];
                  return (
                    <div className="mb-2 rounded-xl border border-border bg-surface p-4">
                      <span className="text-xs uppercase tracking-wide text-muted">
                        Pausado — por quê? (opcional)
                      </span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {PAUSE_REASONS.map((reason) => (
                          <button
                            key={reason.label}
                            type="button"
                            onClick={() => setPauseReason(reason.label)}
                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              currentPause?.reason === reason.label
                                ? "border-accent bg-accent text-accent-foreground"
                                : "border-border bg-background text-foreground hover:border-accent"
                            }`}
                          >
                            <reason.icon className="h-3.5 w-3.5" />
                            {reason.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

              <div className="grid grid-cols-2 gap-2.5">
                {gridMetrics.map((m) => (
                  <MetricCard
                    key={m.id}
                    icon={m.id}
                    label={m.short}
                    value={metricValues[m.id]}
                    unit={m.unit === "min/km" ? "/km" : m.unit || undefined}
                  />
                ))}
                {state.goal?.distanceMeters && (
                  <MetricCard icon="tempo" label="Chegada prevista" value={formatGoalEta(state.forecastSecondsRemaining)} />
                )}
                {state.paceNeededSecPerKm !== null && (
                  <MetricCard icon="ritmo" label="Pace necessário" value={formatPace(state.paceNeededSecPerKm)} unit="/km" />
                )}
                {preferences.showCurrentKmPaceLive && state.currentKmPaceSecPerKm !== null && (
                  <MetricCard icon="ritmo" label="Pace do km atual" value={formatPace(state.currentKmPaceSecPerKm)} unit="/km" />
                )}
              </div>

              <RouteStrip points={state.points} />

              <div className="mt-4 flex flex-1 items-end gap-3">
                <button
                  type="button"
                  onClick={markLap}
                  disabled={state.status !== "tracking"}
                  aria-label="Marcar volta"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-surface disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 3v18M5 5h13l-3 4 3 4H5" />
                  </svg>
                </button>
                {state.status === "tracking" ? (
                  <button
                    type="button"
                    onClick={pause}
                    className="flex-1 rounded-full border border-border bg-surface py-4 text-base font-semibold hover:border-accent"
                  >
                    Pausar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={resume}
                    disabled={state.gpsQuality !== "good"}
                    title={
                      state.gpsQuality !== "good"
                        ? "Aguardando o sinal de GPS melhorar antes de retomar"
                        : undefined
                    }
                    className="flex-1 rounded-full border border-accent bg-surface py-4 text-base font-semibold text-accent disabled:cursor-not-allowed disabled:border-border disabled:text-muted"
                  >
                    {state.gpsQuality !== "good" ? "Aguardando sinal…" : "Retomar"}
                  </button>
                )}
                <HoldToFinishButton
                  onConfirm={() => {
                    const run = finish({ shoeName });
                    setManualTracks(run.tracks ?? []);
                  }}
                />
              </div>

              {lapToast && (
                <div
                  className="pr-enter absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-xs font-bold whitespace-nowrap text-accent-foreground"
                  style={{ "--pr-dur": "0.25s" } as CSSProperties}
                >
                  {lapToast}
                </div>
              )}
            </main>
          );
        })()}

      {state.status === "finished" && state.finishedRun && (
        <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
          <div>
            <p className="text-sm text-muted">Corrida concluída</p>
            <p className="text-metal mt-2 font-mono text-5xl font-semibold tabular-nums">
              {formatDistanceKm(state.finishedRun.distanceMeters)} km
            </p>
          </div>

          {/* Breaks out of the screen's own px-6 to run edge-to-edge — square aspect ratio means this also grows the map's height, not just its width. RouteMap's own className already sets w-full, so the negative margin alone is what pulls it past the padding. */}
          <RouteMap points={state.finishedRun.points} className="-mx-6" />

          <div className="grid w-full max-w-xs grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <span className="text-xs uppercase tracking-wide text-muted">Tempo</span>
              <p className="text-metal mt-1 font-mono text-xl tabular-nums">
                {formatElapsed(runMovingSeconds(state.finishedRun))}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <span className="text-xs uppercase tracking-wide text-muted">Pace médio</span>
              <p className="text-metal mt-1 font-mono text-xl tabular-nums">
                {formatPace(
                  state.finishedRun.distanceMeters > 0
                    ? (runMovingSeconds(state.finishedRun) / state.finishedRun.distanceMeters) * 1000
                    : null,
                )}
              </p>
            </div>
            {(() => {
              const gain = state.finishedRun.elevationGainMeters ?? elevationGain;
              if (gain === null && elevationFailed) return null;
              return (
                <div className="col-span-2 rounded-xl border border-border bg-surface p-4">
                  <span className="text-xs uppercase tracking-wide text-muted">Ganho de elevação</span>
                  <p className="text-metal mt-1 font-mono text-xl tabular-nums">
                    {gain !== null ? `${Math.round(gain)} m` : "calculando…"}
                  </p>
                </div>
              );
            })()}
          </div>

          {state.goal?.targetPaceSecPerKm && state.finishedRun.distanceMeters > 0 && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs uppercase tracking-wide text-muted">
                Meta de ritmo · {formatPace(state.goal.targetPaceSecPerKm)}/km
              </span>
              <PaceDeltaPill
                deltaSecPerKm={
                  (runMovingSeconds(state.finishedRun) / state.finishedRun.distanceMeters) * 1000 -
                  state.goal.targetPaceSecPerKm
                }
              />
            </div>
          )}

          {finishedRun && (
            <RpeCard
              value={savedRpe ?? finishedRun.rpe ?? null}
              onSelect={(rpe) => handleRpeSelect(finishedRun.id, rpe)}
            />
          )}

          {finishedRun && runRecords.some((r) => r.isNewRecord) && (
            <div className="flex w-full max-w-xs flex-col gap-2">
              {runRecords
                .filter((r) => r.isNewRecord)
                .map((record) => (
                  <PrBadge
                    key={record.targetMeters}
                    record={record}
                    achievement={computeAchievement(finishedRun.id, record)}
                    opened={openedRecordMeters.includes(record.targetMeters)}
                    onOpen={() =>
                      setRevealing({
                        record,
                        wasOpened: openedRecordMeters.includes(record.targetMeters),
                      })
                    }
                  />
                ))}
            </div>
          )}

          {revealing && finishedRun && (
            <AchievementReveal
              record={revealing.record}
              achievement={computeAchievement(finishedRun.id, revealing.record)}
              alreadyOpened={revealing.wasOpened}
              onOpened={() => handleRecordUnboxed(finishedRun.id, revealing.record)}
              onClose={() => setRevealing(null)}
            />
          )}

          {crossedEmblemsKm.filter((km) => !openedEmblemsKm.includes(km)).length > 0 && (
            <div className="flex w-full max-w-xs flex-col gap-2">
              {crossedEmblemsKm
                .filter((km) => !openedEmblemsKm.includes(km))
                .map((km) => (
                  <button
                    key={km}
                    type="button"
                    onClick={() => setRevealingEmblemKm(km)}
                    className="flex w-full items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4 text-left"
                  >
                    <span className="h-11 w-11 shrink-0">
                      <EmblemBadge category="distancia" value={km} state="sealed" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">Novo emblema!</p>
                      <p className="text-xs text-muted">{formatEmblemKm(km)} km na vida</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
                      Abrir
                    </span>
                  </button>
                ))}
            </div>
          )}

          {emblemProgress.length > 0 && (
            <div className="flex w-full max-w-xs flex-col gap-2">
              {emblemProgress.map(({ key, ...entry }) => (
                <EmblemProgressBar key={key} {...entry} />
              ))}
            </div>
          )}

          {revealingEmblemKm !== null && (
            <EmblemReveal
              category="distancia"
              value={revealingEmblemKm}
              alreadyOpened={openedEmblemsKm.includes(revealingEmblemKm)}
              onOpened={() => handleEmblemOpened(revealingEmblemKm)}
              onClose={() => setRevealingEmblemKm(null)}
            />
          )}

          {state.finishedRun.pauseEvents && state.finishedRun.pauseEvents.length > 0 && (
            <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-muted">
                  {state.finishedRun.pauseEvents.length}{" "}
                  {state.finishedRun.pauseEvents.length === 1 ? "pausa" : "pausas"}
                </span>
                <NoticeBadge>privado</NoticeBadge>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {state.finishedRun.pauseEvents.map((pause, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-foreground">{pause.reason ?? "Sem motivo registrado"}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">
                      {formatPauseDuration(pause.startedAt, pause.endedAt)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-border pt-2 text-xs text-muted">
                Pausas não aparecem quando você compartilha essa corrida.
              </p>
            </div>
          )}

          {state.finishedRun.gpsGaps && state.finishedRun.gpsGaps.length > 0 && (
            <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 text-left">
              <span className="text-xs uppercase tracking-wide text-muted">
                {state.finishedRun.gpsGaps.length === 1
                  ? "Sinal de GPS perdido"
                  : `${state.finishedRun.gpsGaps.length} trechos sem sinal de GPS`}
              </span>
              <ul className="mt-2 flex flex-col gap-1.5">
                {state.finishedRun.gpsGaps.map((gap, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-foreground">Trecho {i + 1}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">
                      {formatDeltaDuration((gap.endedAt - gap.startedAt) / 1000)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-border pt-2 text-xs text-muted">
                A tela travou ou o app foi pra segundo plano — esse tempo já saiu do tempo em
                movimento, e a rota quebra no mapa em vez de desenhar reto.
              </p>
            </div>
          )}

          {state.finishedRun.shoeName && (
            <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 text-left">
              <span className="text-xs uppercase tracking-wide text-muted">Tênis</span>
              <p className="mt-1 text-sm font-medium">{state.finishedRun.shoeName}</p>
            </div>
          )}

          {placeMatch && !placeConfirmed && !placeDismissed && (
            <div className="w-full max-w-xs rounded-xl border border-accent/40 bg-surface p-4 text-left">
              <span className="text-xs uppercase tracking-wide text-muted">Ranking de lugares</span>
              <p className="mt-1 text-sm font-medium">Essa corrida foi em {placeMatch.name}?</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Confirma pra contar esse km no ranking desse lugar.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmPlace}
                  disabled={placeConfirming}
                  className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {placeConfirming ? "Contando…" : "Sim, contar"}
                </button>
                <button
                  type="button"
                  onClick={() => setPlaceDismissed(true)}
                  className="rounded-full border border-border px-4 py-2 text-xs font-medium"
                >
                  Não
                </button>
              </div>
            </div>
          )}
          {placeConfirmed && placeMatch && (
            <p className="text-xs text-muted">Contado pro ranking de {placeMatch.name}.</p>
          )}

          {activeGhost && (
            <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-muted">Fantasma</span>
                <NoticeBadge>não salvo</NoticeBadge>
              </div>
              {state.finishedGhostDeltaSeconds !== null ? (
                <p
                  className={`mt-1 text-sm font-medium ${
                    state.finishedGhostDeltaSeconds >= 0 ? "text-good" : "text-warn"
                  }`}
                >
                  {state.finishedGhostDeltaSeconds >= 0
                    ? `Você bateu o fantasma por ${formatDeltaDuration(state.finishedGhostDeltaSeconds)}.`
                    : `Você ficou ${formatDeltaDuration(state.finishedGhostDeltaSeconds)} atrás do fantasma.`}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  Você passou dos {formatDistanceKm(activeGhost.distanceMeters)} km que o fantasma
                  percorreu, então não dá pra comparar depois disso.
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                Comparado pela distância percorrida em relação à corrida de{" "}
                {new Date(activeGhost.startedAt).toLocaleDateString("pt-BR")}, não pelo mesmo
                trajeto.
              </p>
            </div>
          )}
          <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 text-left">
            <span className="text-xs uppercase tracking-wide text-muted">
              Trilha sonora da corrida
            </span>

            {displayedTracks.length > 0 && (
              <ul className="mt-2 flex flex-col gap-2">
                {displayedTracks.map((track, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    {track.artworkUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={track.artworkUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {track.name} <span className="text-muted">— {track.artist}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRemoveTrack(i)}
                      aria-label={`Remover ${track.name}`}
                      className="shrink-0 rounded-full p-1.5 text-muted hover:bg-bad/10 hover:text-bad"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              onSubmit={handleMusicSearch}
              className="mt-3 flex gap-2 border-t border-border pt-3"
            >
              <input
                type="text"
                value={musicQuery}
                onChange={(e) => setMusicQuery(e.target.value)}
                placeholder="nome da música ou artista"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={musicSearching || !musicQuery.trim()}
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:border-accent disabled:opacity-60"
              >
                {musicSearching ? "Buscando…" : "Buscar"}
              </button>
            </form>

            {musicSearchFailed && (
              <p className="mt-2 text-xs text-bad">
                Não deu pra buscar agora — confere a internet e tenta de novo.
              </p>
            )}

            {!musicSearchFailed && musicResults !== null && musicResults.length === 0 && (
              <p className="mt-2 text-xs text-muted">Nada encontrado.</p>
            )}

            {musicResults !== null && musicResults.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {musicResults.map((candidate, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => handleAddManualTrack(candidate)}
                      className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-background"
                    >
                      {candidate.artworkUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={candidate.artworkUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <span className="truncate">
                        {candidate.name} <span className="text-muted">— {candidate.artist}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex w-full max-w-xs flex-col items-center gap-2">
            <Link
              href={state.finishedRun ? `/compartilhar?run=${state.finishedRun.id}` : "/compartilhar"}
              className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground"
            >
              <svg viewBox="0 0 24 24" className="relative h-4.5 w-4.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="2.75" />
                <circle cx="6" cy="12" r="2.75" />
                <circle cx="18" cy="19" r="2.75" />
                <path d="M8.5 10.5l7-4.2M8.5 13.5l7 4.2" />
              </svg>
              <span className="relative">Compartilhar</span>
            </Link>
            <p className="max-w-xs text-xs leading-relaxed text-muted">
              Escolha foto, filtro, cenário e efeitos, e gere um vídeo com o seu traçado desenhando
              e os números dessa corrida — pronto pro status do WhatsApp ou pros stories.
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground"
            >
              Nova corrida
            </button>
            {confirmingDiscard ? (
              <div className="flex w-full flex-col gap-2">
                <p className="text-center text-xs leading-snug text-pretty text-muted">
                  Descartar essa corrida? Não dá pra desfazer.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingDiscard(false)}
                    disabled={discarding}
                    className="flex-1 rounded-full border border-border px-6 py-3 text-sm font-semibold disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscard}
                    disabled={discarding}
                    className="flex-1 rounded-full bg-bad px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {discarding ? "Descartando…" : "Descartar"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDiscard(true)}
                className="w-full rounded-full border border-border px-6 py-3 text-sm font-semibold text-bad"
              >
                Descartar corrida
              </button>
            )}
          </div>
        </main>
      )}

      {showRunTips && <RunOnboarding onDone={handleRunTipsDone} onSkip={handleRunTipsSkip} />}

      {groupSheetOpen && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
            onClick={() => setGroupSheetOpen(false)}
          >
            <div
              className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-background text-foreground sm:rounded-3xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 pt-4">
                <p className="text-sm font-semibold">
                  {longaoSession?.name ?? "Longão"}
                </p>
                <button
                  type="button"
                  onClick={() => setGroupSheetOpen(false)}
                  aria-label="Fechar"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 h-64 shrink-0 px-4">
                <GroupLiveMap markers={groupMarkers} className="h-full w-full overflow-hidden rounded-2xl" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                {groupData.participants.length === 0 ? (
                  <p className="mt-4 text-center text-xs text-muted">Carregando o grupo…</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-3">
                    {groupData.participants.map((connection) => {
                      const run = groupData.liveRuns.find((r) => r.userId === connection.participant.userId);
                      return (
                        <li
                          key={connection.participant.$id}
                          className="flex items-center justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0"
                        >
                          <p className="truncate text-sm font-semibold">
                            {connection.profile?.displayName ?? "Corredor(a)"}
                          </p>
                          <p className="shrink-0 font-mono text-xs text-muted">
                            {run
                              ? `${formatDistanceKm(run.distanceMeters)} km · ${formatPace(run.currentPaceSecPerKm ?? null)}`
                              : "sem sinal"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
