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
import { firePaceDelayVibration, useRunTracker, type HeartRateConnectionState } from "@/lib/tracking/useRunTracker";
import { isNativePlatform } from "@/lib/platform";
import { onNotificationAction, onWatchAction } from "@/lib/tracking/geolocation";
import { useEffectiveColorScheme } from "@/lib/theme";
import { listCoachConnections, type CoachConnection } from "@/lib/coachRelationships";
import { listFriendConnections, type FriendConnection } from "@/lib/friendships";
import { useNearbyFriends } from "@/lib/useNearbyFriends";
import {
  startLiveSession,
  updateLiveSession,
  endLiveSession,
  refreshLiveSessionAudience,
  ackCoachCue,
  getActiveLiveSession,
} from "@/lib/liveRuns";
import { fetchLiveHeartRate } from "@/lib/health";
import { announceCoachCue } from "@/lib/tracking/voiceBank";
import {
  buildPairingUrl,
  closeGroupRun,
  createGroupRun,
  getActiveGroupRunCode,
  getGroupRun,
  leaveGroupRun,
  listParticipants,
  pairRunSession,
  type GroupRun,
} from "@/lib/groupRuns";
import { PairingQrCode } from "../pairing-qr";
import { RunWeatherCard } from "./weather-card";
import { AccountPrompt } from "../account-prompt";
import { GroupRunLobby } from "../group-run-lobby";
import { useGroupLiveRuns, buildGroupMarkers } from "@/lib/useGroupLiveRuns";
import { useAuth } from "@/lib/useAuth";
import { GroupLiveMap } from "../group-live-map";
import { ModalPortal } from "../modal-portal";
import { TransparentLoopVideo } from "../transparent-loop-video";
import {
  formatDeltaDuration,
  formatDistanceKm,
  formatElapsed,
  formatGoalEta,
  formatPace,
} from "@/lib/tracking/geoFilter";
import {
  clearActiveRun,
  deleteCompletedRun,
  getCompletedRun,
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
  type RunGoal,
  type RunTrack,
  type Shoe,
} from "@/lib/tracking/storage";
import { applyCoachOverride, computeCurrentPlanWeek, isoWeekday, paceForZone, ZONE_LABEL } from "@/lib/plan";
import { listPlanOverridesForStudent, type ParsedPlanOverride } from "@/lib/coachPlanOverrides";
import { getSelfPlanOverride } from "@/lib/selfPlanOverride";
import { useRunnerProfile } from "@/lib/useRunnerProfile";
import { computeElevationGain } from "@/lib/elevation";
import { matchPlaceForRoute } from "@/lib/placeMatch";
import { recordRunAtPlace } from "@/lib/placeLeaderboard";
import { sendMilestoneNotification } from "@/lib/milestoneNotifications";
import { syncProfileStats } from "@/lib/profileStats";
import { syncRunSummary, deleteRunSummary } from "@/lib/runSummariesSync";
import { getProfile, updateProfile } from "@/lib/auth";
import type { RunningPlace } from "@/lib/places";
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
import { searchTracks, type TrackCandidate } from "@/lib/music/itunesLookup";
import {
  ANNOUNCE_MAX_METERS,
  ANNOUNCE_MAX_SECONDS,
  ANNOUNCE_MIN_METERS,
  ANNOUNCE_MIN_SECONDS,
  ANNOUNCE_STEP_METERS,
  ANNOUNCE_STEP_SECONDS,
  announceLabel,
  announceSecondsLabel,
} from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import { useHeaderGpsStatus, useImmersiveMode, useTabReclick } from "../app-shell";
import { Card, NoticeBadge, PillTabs, PreferenceToggle, ToggleChip } from "../ui";
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

/** "Aviso de parcial a cada" mode switch — a `PillTabs` bar sitting above a `PillSlider` bound to `ANNOUNCE_MIN/MAX/STEP_METERS|SECONDS`, one widget instead of a mode toggle plus a grid of preset chips. */
const ANNOUNCE_MODE_TABS = [
  { id: "distance", label: "Distância" },
  { id: "time", label: "Tempo" },
] as const;

/** "Como avisar" / "Voz" switches inside the same card — `PillTabs`, same full-width tap target as `ANNOUNCE_MODE_TABS` above, instead of the old cramped bordered-button pair that felt too small to tap. */
const ANNOUNCE_STYLE_TABS = [
  { id: "voz", label: "Voz" },
  { id: "vibracao", label: "Vibração" },
] as const;

const VOICE_GENDER_TABS = [
  { id: "female", label: "Feminina" },
  { id: "male", label: "Masculina" },
] as const;

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
  id: "distancia" | "tempo" | "ritmo" | "livre" | "prova";
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
  if (id === "prova") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M6 21V4M6 4h12l-3 3.5L18 11H6" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M7 12a3 3 0 1 0 5-2 3 3 0 1 0-5 2 3 3 0 1 0 5 2 3 3 0 1 0-5-2z" />
    </svg>
  );
}

const GOAL_TYPE_LABELS: Record<"distancia" | "tempo" | "ritmo" | "livre" | "prova", string> = {
  distancia: "Distância",
  tempo: "Tempo",
  ritmo: "Ritmo",
  livre: "Livre",
  prova: "Prova",
};

/**
 * Maps a past run's persisted `goal` back onto one of the goal-type tabs
 * above, for "Repetir corrida" (run-detail.tsx) — the inverse of
 * `handleStart`'s own `distanceMeters`/`durationSeconds`/`targetPaceSecPerKm`
 * construction. Runs saved before `CompletedRun.goal` existed, or a "livre"
 * run with no goal, return `null` — the caller falls back to reconstructing
 * distance from what actually happened instead.
 */
function goalTypeFromRunGoal(goal: RunGoal): "distancia" | "tempo" | "ritmo" | "prova" | null {
  if (goal.distanceMeters && goal.durationSeconds) return "prova";
  if (goal.distanceMeters) return "distancia";
  if (goal.durationSeconds) return "tempo";
  if (goal.targetPaceSecPerKm) return "ritmo";
  return null;
}

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
  value: "distancia" | "tempo" | "ritmo" | "livre" | "prova";
  onChange: (id: "distancia" | "tempo" | "ritmo" | "livre" | "prova") => void;
}) {
  const ids = ["distancia", "tempo", "ritmo", "prova", "livre"] as const;
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

/** Flame glyph for "Aquecer antes de correr" — the same idea any workout app uses for a warmup shortcut, not a literal exercise depiction. */
function WarmupIcon({ className }: { className?: string }) {
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
      <path d="M10 2.5c1 2.5-1.5 3.5-1.5 6a3.5 3.5 0 0 0 7 0c0-1-.5-1.8-1-2.3.2 1-.3 1.8-1 1.8-1 0-1-1-.7-2 .5-1.5-.3-2.8-2.8-3.5Z" />
      <path d="M6.5 9.5c-.8 1-1.2 2-1.2 3a4.7 4.7 0 0 0 9.4 0c0-1-.2-1.8-.5-2.5" />
    </svg>
  );
}

/** Two overlapping heads — "amigo por perto", not the single-person icon `Avatar` already stands in for elsewhere. */
function NearbyFriendsIcon({ className }: { className?: string }) {
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
      <circle cx="7" cy="6.5" r="2.3" />
      <path d="M2.8 15c0-2.5 1.9-4.2 4.2-4.2s4.2 1.7 4.2 4.2" />
      <circle cx="13.5" cy="6.8" r="1.9" />
      <path d="M11.8 10.9c1.6.4 2.9 1.8 2.9 4" />
    </svg>
  );
}

/**
 * "Fulano tá por perto agora, bora correr junto?" — reads the same
 * `friend_presence` opt-in data /amigos already shows as a passive badge
 * (see `useNearbyFriends`'s own comment), but surfaces it here as an actual
 * suggestion at the one moment it's directly actionable: about to start a
 * run. Dismissible per this screen visit only (plain local state, not
 * persisted) — reappears next time /run opens and someone's still nearby,
 * same "quiet, no push notification" posture as the rest of this feature.
 */
function NearbyFriendCard() {
  const nearby = useNearbyFriends();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || nearby.length === 0) return null;

  const names =
    nearby.length === 1
      ? nearby[0].displayName
      : nearby.length === 2
        ? `${nearby[0].displayName} e ${nearby[1].displayName}`
        : `${nearby[0].displayName} e mais ${nearby.length - 1}`;

  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <NearbyFriendsIcon className="h-5 w-5 shrink-0 text-accent" />
      <p className="flex-1 text-xs leading-relaxed text-pretty">
        <strong className="font-semibold">{names}</strong> {nearby.length === 1 ? "tá" : "tão"} por perto
        agora — bora correr junto?
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dispensar"
        className="shrink-0 text-muted hover:text-foreground"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
  );
}

/** Pencil glyph standing in for the word "Custom" on the trailing chip of `PresetChipRow` — "Personalizado" already reads fine written out, but a preset row of short numeric chips (5 km, 10 km, 21 km...) doesn't have room for a whole word on that last one, and "Custom" in English says nothing in Portuguese. */
function EditIcon({ className }: { className?: string }) {
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
      <path d="M13.5 3.5l3 3L6 17l-3.8.8L3 14l10.5-10.5Z" />
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

/**
 * A row of preset chips plus a trailing chip that opens a bottom-sheet
 * stepper — the picker pattern Xanthus Preparar Corrida.dc.html uses for
 * every value on this screen (distância, tempo, ritmo, aviso por voz). That
 * trailing chip displays the live custom value once one is set; unset, it
 * shows a pencil icon rather than the word "Custom" (English, means nothing
 * in Portuguese) or "Personalizado" (too long to fit next to "5 km"/"10 km").
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
  /** Non-null once the active value doesn't match any preset — shown on the trailing chip in place of the pencil icon. */
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
        aria-label={customLabel ?? "Valor personalizado"}
        className={`flex min-h-11 items-center justify-center rounded-xl border-2 px-2 py-2.5 text-sm font-semibold transition-colors ${
          customLabel !== null
            ? "border-white/80 bg-accent text-accent-foreground"
            : "border-dashed border-border bg-background text-muted hover:border-accent"
        }`}
      >
        {customLabel ?? <EditIcon className="h-4.5 w-4.5" />}
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

type MetricId =
  | "ritmo"
  | "tempo"
  | "distancia"
  | "medio"
  | "parcial"
  | "eta"
  | "paceNecessario"
  | "paceKmAtual"
  | "fc";

/**
 * The five always-available readouts, ordered by priority to a runner
 * mid-run (current pace and current time first — the two numbers glanced
 * at most) — the athlete picks one to become the giant focus number (see
 * `metricTemplate` state). Nothing else renders alongside it: no fixed
 * grid of every other reading regardless of the pick, since only one
 * category is ever the one on screen at a time.
 */
const METRICS: { id: MetricId; label: string; short: string; chip: string; unit: string }[] = [
  { id: "ritmo", label: "Ritmo atual", short: "Ritmo", chip: "Ritmo", unit: "min/km" },
  { id: "tempo", label: "Tempo", short: "Tempo", chip: "Tempo", unit: "" },
  { id: "distancia", label: "Distância", short: "Distância", chip: "Distância", unit: "km" },
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
    case "eta":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="12" cy="12" r="9" strokeLinecap="butt" />
          <path d="M12 7v5l3.5 2" strokeDasharray="1.5 2.5" />
        </svg>
      );
    case "paceNecessario":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "paceKmAtual":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" stroke="none" opacity={0.55} />
          <circle cx="18.5" cy="5.5" r="3.5" />
        </svg>
      );
    case "fc":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h4l2-5 3 10 2-8 2 3h5" />
        </svg>
      );
  }
}

/**
 * FC isn't a number the run always has — it degrades to text instead of a
 * fake reading while a monitor connects, or when it's unavailable, same as
 * every other live stat.
 */
function formatHeartRateValue(bpm: number | null, connection: HeartRateConnectionState): string {
  if (connection === "connected" && bpm !== null) return String(bpm);
  if (connection === "connecting") return "conectando";
  if (connection === "unavailable") return "indisponível";
  return "--";
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
  const [goalType, setGoalType] = useState<"distancia" | "tempo" | "ritmo" | "livre" | "prova">("distancia");
  /** Overwritten by the `?repeatRunId=` effect below when the screen was opened via a past run's "Repetir corrida" button (run-detail.tsx). */
  const [goalKm, setGoalKm] = useState(5);
  const [goalMinutes, setGoalMinutes] = useState(30);
  /** Target pace to hold, seconds/km — 330 = 5:30/km, a typical easy-run pace. */
  const [goalPaceSec, setGoalPaceSec] = useState(330);
  /** Which "Custom" chip's sheet is currently open — at most one at a time, across all four pickers on this screen. */
  const [customSheet, setCustomSheet] = useState<"distancia" | "tempo" | "ritmo" | null>(null);
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
  /** Accepted friends this athlete could go live with — same picker pattern as `coaches`, but multi-select (a coach is naturally one person; friends watching a run isn't). */
  const [friends, setFriends] = useState<FriendConnection[]>([]);
  /** Which friends (if any) this run is being shared live with — chosen before starting, empty means "not live" with any friend. */
  const [liveFriendIds, setLiveFriendIds] = useState<string[]>([]);
  /** Own account id (needed to keep this athlete's own id out of the live-viewer permission list computed from the longão's participants below), plus `profile`/`refresh` for the post-run "ranking de lugares" confirmation below. */
  const { account, profile, refresh: refreshAuth } = useAuth();
  /** The "longão" this device currently remembers being part of, if any and still open — resolved from `getActiveGroupRunCode()`'s localStorage pointer, same re-check-on-return-to-idle timing as `coaches` above. */
  const [longaoSession, setLongaoSession] = useState<GroupRun | null>(null);
  /** Pre-selected on by default when there's an active longão — same reasoning `install-prompt.tsx` uses for defaults that should be visible but always a tap away from off. */
  const [shareLongao, setShareLongao] = useState(true);
  /** Which of the "share my live position" audiences is showing — Convite (QR/longão) is always available, Treinador/Amigos only appear once `coaches`/`friends` load, folded into one widget instead of 3 separately-titled blocks stacked on the page. */
  const [shareTab, setShareTab] = useState<"convite" | "treinador" | "amigos">("convite");

  /** "Correr com alguém" (QR pairing) — generating a code from this device. */
  const [generatingPairing, setGeneratingPairing] = useState(false);
  const [pairingGenerateError, setPairingGenerateError] = useState<string | null>(null);
  /** Backing out of an active pairing — host closes the session for everyone, a joined participant just leaves it. Both routes are already exposed to /longao's own UI; this is the same action from the lighter-weight shortcut here. */
  const [endingLongao, setEndingLongao] = useState(false);
  /** Hosting a pairing session needs an account (createGroupRun's own "unavailable" reason) — same gate /longao already shows for the same underlying reason, just triggered from this shortcut instead of a dedicated signed-out screen. */
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  /** An incoming pairing invite opened via `?parear=` (see src/app/parear/page.tsx and oauth-callback-listener.tsx) — resolved once on mount, confirmed explicitly rather than joined silently. */
  const [pairingInvite, setPairingInvite] = useState<{ code: string; groupRun: GroupRun; hostName: string } | null>(
    null,
  );
  const [pairingInviteBusy, setPairingInviteBusy] = useState(false);
  const [pairingInviteError, setPairingInviteError] = useState<string | null>(null);
  /** The shared "waiting room" after generating or confirming a pairing — see group-run-lobby.tsx. */
  const [lobbyOpen, setLobbyOpen] = useState(false);

  /**
   * Resolves a `?parear=CODE` opened via deep link (QR scan) into a
   * confirm prompt — never joins straight from the URL, since that would
   * accept a friendship + expose live position with zero human confirmation
   * on this side. Runs once; the param is a one-shot deep-link payload, not
   * something client-side navigation should re-trigger on.
   */
  useEffect(() => {
    const codigo = new URLSearchParams(window.location.search).get("parear");
    if (!codigo) return;
    let cancelled = false;
    (async () => {
      const groupRun = await getGroupRun(codigo);
      if (cancelled) return;
      if (!groupRun || groupRun.status !== "open" || new Date(groupRun.expiresAt).getTime() < Date.now()) {
        setPairingInviteError("Esse convite não é mais válido — peça outro QR.");
        return;
      }
      const hostProfile = await getProfile(groupRun.hostId);
      if (cancelled) return;
      setPairingInvite({ code: codigo, groupRun, hostName: hostProfile?.displayName ?? "Alguém" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Resolves a `?repeatRunId=<id>` opened via a past run's "Repetir
   * corrida" button (run-detail.tsx) — an async IndexedDB lookup, so
   * (unlike `?parear=`'s simple string) this can't be a lazy state
   * initializer. Reconstructs the exact original goal type when the run
   * has one (`CompletedRun.goal`, added specifically for this); falls back
   * to a plain distance goal from what actually happened for a "livre" run
   * or a run saved before `goal` existed. Also arms the ghost comparison
   * against this same run by default — the closest thing this app has to
   * "repeat the same route" (see `ghostRun.ts`: distance-vs-time only,
   * never a GPS overlay) — visible and changeable in the ghost picker
   * below, not a hidden decision.
   */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("repeatRunId");
    if (!id) return;
    let cancelled = false;
    (async () => {
      const run = await getCompletedRun(id);
      if (cancelled || !run) return;
      setRecentRuns((prev) => (prev.some((r) => r.id === run.id) ? prev : [run, ...prev]));
      setSelectedGhostId(run.id);
      const type = run.goal ? goalTypeFromRunGoal(run.goal) : null;
      if (type && run.goal) {
        setGoalType(type);
        if (run.goal.distanceMeters) setGoalKm(Math.round((run.goal.distanceMeters / 1000) * 10) / 10);
        if (run.goal.durationSeconds) setGoalMinutes(Math.round(run.goal.durationSeconds / 60));
        if (run.goal.targetPaceSecPerKm) setGoalPaceSec(run.goal.targetPaceSecPerKm);
      } else {
        setGoalType("distancia");
        setGoalKm(Math.round((run.distanceMeters / 1000) * 10) / 10);
      }
    })();
    window.history.replaceState(null, "", "/run");
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGeneratePairing = async () => {
    if (!account) {
      setShowAccountPrompt(true);
      return;
    }
    setGeneratingPairing(true);
    setPairingGenerateError(null);
    const firstName = profile?.displayName?.trim().split(/\s+/)[0];
    const result = await createGroupRun(firstName ? `Corrida com ${firstName}` : "Corrida em dupla", Date.now());
    setGeneratingPairing(false);
    if (!result.ok) {
      setPairingGenerateError("Não deu pra gerar o código agora — tenta de novo.");
      return;
    }
    setLongaoSession(result.groupRun);
    setShareLongao(true);
    setLobbyOpen(true);
  };

  const handleEndLongao = async () => {
    if (!longaoSession || endingLongao) return;
    setEndingLongao(true);
    const ok =
      longaoSession.hostId === account?.id
        ? await closeGroupRun(longaoSession.$id)
        : await leaveGroupRun(longaoSession.$id);
    setEndingLongao(false);
    if (ok) {
      setLongaoSession(null);
      setLobbyOpen(false);
    }
  };

  const handleConfirmPairing = async () => {
    if (!pairingInvite) return;
    setPairingInviteBusy(true);
    setPairingInviteError(null);
    const result = await pairRunSession(pairingInvite.code);
    setPairingInviteBusy(false);
    if (!result.ok) {
      setPairingInviteError(
        result.reason === "expired" || result.reason === "closed"
          ? "Esse convite não é mais válido — peça outro QR."
          : "Não deu pra parear agora — tenta de novo.",
      );
      return;
    }
    // Local state, not a full reload — the reload used to be the only way
    // this screen re-resolved `longaoSession`, but it also meant pairing
    // success was silent: the joiner just landed back on the same idle
    // form with zero confirmation anything happened. Dropping straight
    // into the lobby is the actual fix for that "escaneei, voltei, não
    // aconteceu nada" report.
    setLongaoSession(result.groupRun);
    setShareLongao(true);
    setPairingInvite(null);
    setLobbyOpen(true);
    window.history.replaceState(null, "", "/run");
  };

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

  const [carbToast, setCarbToast] = useState<string | null>(null);
  /**
   * `state.carbReminderFiredAt` is a one-shot signal from useRunTracker's own
   * tick loop, not something this screen decides on its own. Read during
   * render rather than inside a `useEffect` — same "adjusting state when a
   * dependency changes" pattern used elsewhere in this app (see /plano's
   * `loadedWeekKey`) — so this only reacts the one time the value actually
   * changes, turning it into the visual half of the reminder for
   * accessibility parity with the voice cue useRunTracker already plays.
   * The auto-dismiss timer itself is a real side effect (refs/timers can't
   * be touched during render), so that part lives in the effect right below,
   * synchronized to `carbToast`'s own lifecycle rather than to the fired-at
   * timestamp directly.
   */
  const [lastCarbReminderShownAt, setLastCarbReminderShownAt] = useState<number | null>(null);
  if (state.carbReminderFiredAt !== null && state.carbReminderFiredAt !== lastCarbReminderShownAt) {
    setLastCarbReminderShownAt(state.carbReminderFiredAt);
    setCarbToast("Hora do gel");
  }
  useEffect(() => {
    if (!carbToast) return;
    const timer = setTimeout(() => setCarbToast(null), 2400);
    return () => clearTimeout(timer);
  }, [carbToast]);

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
      const records = computeRunRecords(run, allRuns);
      setRunRecords(records);
      // `allRuns` already includes this run (finish() saves it before this
      // effect's fetch fires), so subtracting its own distance back out is
      // what the lifetime total looked like the instant before it counted.
      const newTotal = totalDistanceMeters(allRuns);
      setCrossedEmblemsKm(milestonesJustCrossed(newTotal - run.distanceMeters, newTotal));
      setEmblemProgress(computeEmblemProgress(run, allRuns));

      // Push milestones — only meaningful for a signed-in account (a push
      // target is tied to one), and mutually exclusive by construction: the
      // very first run can't also beat a "previous" best (that's null by
      // definition the first time a distance is covered), so there's
      // nothing to guard against sending both.
      if (!account) return;
      if (allRuns.length === 1) {
        sendMilestoneNotification("primeira-corrida");
        return;
      }
      const beaten = records.find((r) => r.isNewRecord && r.previousBestSeconds !== null);
      if (beaten) sendMilestoneNotification("novo-recorde", { label: beaten.label });
    });
  }, [state.status, state.finishedRun, account]);

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
    void syncProfileStats();
    if (profile?.runSyncOptIn) void syncRunSummary(state.finishedRun);
  }, [state.status, state.finishedRun, account, profile?.runSyncOptIn]);

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

  /** Same re-fetch-on-return-to-idle reasoning as the coach effect above — also drops any previously-picked friend who got unfriended since the last visit, instead of quietly trying to share with someone no longer in the list. */
  useEffect(() => {
    if (state.status !== "idle") return;
    listFriendConnections("accepted").then((rows) => {
      setFriends(rows);
      setLiveFriendIds((current) => current.filter((id) => rows.some((f) => f.otherId === id)));
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
  /**
   * A coach's explicit choice for this week (if any) wins here too — same
   * override /plano applies, so "treino de hoje" never contradicts what the
   * athlete's own plan screen shows. A self-suggested AI override (see
   * selfPlanOverride.ts) applies the same way when there's no coach
   * override — same precedence /plano uses.
   */
  const todaysCoachOverride = todaysPlan ? coachOverrides.get(todaysPlan.currentWeek.startDate) : undefined;
  const todaysSelfOverride = todaysPlan ? getSelfPlanOverride(todaysPlan.currentWeek.startDate) : null;
  const todaysWeek = todaysPlan
    ? applyCoachOverride(todaysPlan.currentWeek, todaysCoachOverride ?? todaysSelfOverride ?? undefined)
    : undefined;
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
  const announceSeconds = preferences.announceIntervalSeconds;
  const announceMode = preferences.announceMode;
  const announceStyle = preferences.announceStyle;
  const voiceGender = preferences.voiceGender;
  /** Drives the "Testar" vibration button's own label swap, moved here from /perfil — see that button's own comment below for why it exists. */
  const [vibrateTested, setVibrateTested] = useState(false);
  /** Tabs for the "Compartilhar corrida" widget below — Convite (QR/longão) always available, Treinador/Amigos only once there's someone to share with; a single available tab skips the tab bar entirely rather than showing a bar with nothing to switch to. */
  const shareTabs: { id: "convite" | "treinador" | "amigos"; label: string }[] = [
    { id: "convite", label: "Convite" },
    ...(coaches.length > 0 ? [{ id: "treinador" as const, label: "Treinador" }] : []),
    ...(friends.length > 0 ? [{ id: "amigos" as const, label: "Amigos" }] : []),
  ];
  /** Falls back to "convite" if the tab the athlete was on stopped being offered (e.g. `coaches`/`friends` hadn't loaded yet when they picked it) — never renders a selected tab that vanished from the bar. */
  const effectiveShareTab = shareTabs.some((t) => t.id === shareTab) ? shareTab : "convite";

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

  /** "Coach ao vivo" HR — updated by its own slower poll below (health reads are comparatively expensive/slow), read synchronously by the position-push effect so that effect itself doesn't need to become async. */
  const liveHeartRateRef = useRef<number | null>(null);
  const HEART_RATE_POLL_MS = 20_000;
  const lastPlayedCueAtMsRef = useRef<number | null>(null);
  const CUE_POLL_MS = 8_000;
  /** A cue older than this is ignored outright — e.g. the app was closed and reopened well after the coach sent it. */
  const CUE_MAX_AGE_MS = 120_000;

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
        void refreshLiveSessionAudience(
          state.runId,
          [...(liveCoachId ? [liveCoachId] : []), ...liveFriendIds, ...ids],
          activeSessionCode,
        );
      }
    };
    void poll();
    const interval = setInterval(poll, PARTICIPANT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state.status, activeSessionCode, state.runId, liveCoachId, liveFriendIds, account?.id]);

  useEffect(() => {
    const live = state.status === "tracking" || state.status === "paused";
    const viewerIds = [...(liveCoachId ? [liveCoachId] : []), ...liveFriendIds, ...groupRunParticipantIdsRef.current];
    if (live && viewerIds.length > 0 && state.runId) {
      const lastPoint = state.points[state.points.length - 1];
      if (lastPoint) {
        const payload = {
          distanceMeters: state.distanceMeters,
          currentPaceSecPerKm: state.currentPaceSecPerKm,
          elapsedSeconds: state.elapsedSeconds,
          lat: lastPoint.lat,
          lon: lastPoint.lon,
          // "Coach ao vivo" — both scoped to "a coach is actually in the
          // viewer set for this run", never sent when only sharing with
          // friends/a longão.
          heartRateBpm: liveCoachId ? (liveHeartRateRef.current ?? undefined) : undefined,
          forecastSecondsRemaining: liveCoachId ? (state.forecastSecondsRemaining ?? undefined) : undefined,
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
    liveFriendIds,
    activeSessionCode,
    state.runId,
    state.status,
    state.distanceMeters,
    state.currentPaceSecPerKm,
    state.elapsedSeconds,
    state.points,
    state.forecastSecondsRemaining,
  ]);

  /**
   * "Coach ao vivo" HR feed — its own slower poll, separate from the
   * position-push effect above, since a health-store read is comparatively
   * expensive and doesn't need the same 6s cadence as GPS. Only runs when
   * actually sharing with a coach AND the athlete opted in for this run
   * (`preferences.shareHeartRateWithCoach`) — see that preference's own
   * comment for why this is a per-run choice, separate from the general
   * `healthDataConsent`.
   */
  useEffect(() => {
    const live = state.status === "tracking" || state.status === "paused";
    if (!live || !liveCoachId || !preferences.shareHeartRateWithCoach) {
      liveHeartRateRef.current = null;
      return;
    }
    // A connected BLE monitor outranks the HealthKit/Health Connect poll
    // below — it's a live reading updating roughly once a second, not a
    // slow store lookup — so this only falls back to `fetchLiveHeartRate()`
    // when no sensor is paired/connected.
    if (state.heartRateConnection === "connected") {
      liveHeartRateRef.current = state.heartRateBpm;
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const bpm = await fetchLiveHeartRate();
      if (!cancelled) liveHeartRateRef.current = bpm;
    };
    void poll();
    const interval = setInterval(poll, HEART_RATE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    state.status,
    liveCoachId,
    preferences.shareHeartRateWithCoach,
    state.heartRateConnection,
    state.heartRateBpm,
  ]);

  /**
   * "Coach ao vivo" cue playback — the athlete's side of `sendCoachCue`
   * (src/lib/liveRuns.ts). Reads back the athlete's own live_runs row
   * (something this app otherwise never does — every other write here is
   * fire-and-forget) looking for a `pendingCueId` the coach just set. Plays
   * the clip once, acks it so it never replays, and ignores anything too
   * old (the app having been closed and reopened well after the cue was
   * sent, for instance).
   */
  useEffect(() => {
    const live = state.status === "tracking" || state.status === "paused";
    if (!live || !liveCoachId || !state.runId || !account) return;
    let cancelled = false;
    const runId = state.runId;
    const myUserId = account.id;
    const poll = async () => {
      // getActiveLiveSession queries by userId, not by row id — this is the
      // athlete reading their OWN row back (something this app otherwise
      // never does), not looking up a coach/friend's.
      const row = await getActiveLiveSession(myUserId);
      if (cancelled || !row?.pendingCueId || !row.pendingCueAtMs) return;
      if (row.pendingCueAtMs === lastPlayedCueAtMsRef.current) return; // already played
      if (Date.now() - row.pendingCueAtMs > CUE_MAX_AGE_MS) return; // too old to bother with
      lastPlayedCueAtMsRef.current = row.pendingCueAtMs;
      announceCoachCue(row.pendingCueId, voiceGender);
      void ackCoachCue(runId);
    };
    void poll();
    const interval = setInterval(poll, CUE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state.status, liveCoachId, state.runId, voiceGender, account]);

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

  /** Drives the arrow-travels-across-the-button animation on tap. */
  const [starting, setStarting] = useState(false);
  const START_ANIMATION_MS = 420;

  const handleStart = () => {
    setManualTracks([]);
    setMusicQuery("");
    setMusicResults(null);
    const distanceMeters =
      (goalType === "distancia" || goalType === "prova") && goalKm > 0 ? goalKm * 1000 : undefined;
    const durationSeconds =
      (goalType === "tempo" || goalType === "prova") && goalMinutes > 0 ? goalMinutes * 60 : undefined;
    // "Prova" (distância + tempo juntos) implica um ritmo médio alvo mesmo
    // sem a pessoa ter digitado um diretamente — sem isso, `paceDeltaSecPerKm`
    // (a pílula "à frente/atrás" sob o número gigante) nunca populava numa
    // corrida de prova, deixando a tela igual à de qualquer outra meta em vez
    // de mostrar a única coisa que importa aqui: ritmo atual contra o alvo.
    const targetPaceSecPerKm =
      goalType === "ritmo" && goalPaceSec > 0
        ? goalPaceSec
        : goalType === "prova" && distanceMeters && durationSeconds
          ? durationSeconds / (distanceMeters / 1000)
          : undefined;
    setActiveGhost(selectedGhost);
    start({
      announceIntervalMeters: announceMeters,
      announceIntervalSeconds: announceSeconds,
      announceMode,
      announceStyle: preferences.announceStyle,
      voiceGender,
      goal:
        distanceMeters || durationSeconds || targetPaceSecPerKm
          ? { distanceMeters, durationSeconds, targetPaceSecPerKm }
          : undefined,
      ghostRun: selectedGhost ?? undefined,
      vibrateOnPaceDelay: preferences.vibrateOnPaceDelay,
      carbReminderEnabled: preferences.carbReminderEnabled,
      carbReminderIntervalSeconds: preferences.carbReminderIntervalMinutes * 60,
      iosSkipRoadSnapping: preferences.iosSkipRoadSnapping,
      heartRateMonitorDeviceId: preferences.heartRateMonitorDeviceId,
    });
  };
  // Lets the watch-action effect below call the latest `handleStart`
  // without listing it as a dependency — `handleStart` is a plain function
  // (this file relies on the React Compiler's own memoization, not manual
  // useCallback), so it's a new reference every render; updated in an
  // effect (post-render), never during render itself.
  const handleStartRef = useRef(handleStart);
  useEffect(() => {
    handleStartRef.current = handleStart;
  });

  /**
   * Button taps from the tethered Apple Watch companion app (see
   * PhoneConnector.swift / PROJECT-CONTEXT.md's smartwatch section) — same
   * bridge shape as `onNotificationAction` above, just its own event name
   * since the watch can send "start"/"resume", which the notification
   * buttons never do.
   *
   * Known v1 limitation: "start" only does something when this screen is
   * already idle and ready — there's no way yet for the watch to make the
   * phone navigate here first. Tapping "Iniciar" on the watch before
   * opening /run on the phone silently does nothing.
   */
  useEffect(
    () =>
      onWatchAction((action) => {
        if (action === "start") {
          if (state.status === "idle") handleStartRef.current();
        } else if (action === "pause") {
          pause();
        } else if (action === "resume") {
          resume();
        } else {
          const run = finish({ shoeName });
          setManualTracks(run.tracks ?? []);
        }
      }),
    [state.status, pause, resume, finish, shoeName],
  );

  const toggleLiveFriend = (friendId: string) => {
    setLiveFriendIds((current) =>
      current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId],
    );
  };

  const handleStartClick = () => {
    setStarting(true);
    window.setTimeout(handleStart, START_ANIMATION_MS);
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
    if (account) void syncProfileStats();
    if (profile?.runSyncOptIn) void deleteRunSummary(state.finishedRun.id);
    handleReset();
  };

  const handleRecoverContinue = () => {
    if (!recoverableRun) return;
    recover(recoverableRun, preferences.heartRateMonitorDeviceId);
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
          <div className="mx-auto w-full max-w-sm space-y-7 text-center">
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
            <div className="flex flex-col gap-3.5">
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
                className="w-full rounded-full bg-bad px-6 py-3 text-sm font-semibold text-white"
              >
                Descartar
              </button>
            </div>
          </div>
        </main>
      )}

      {state.status === "idle" && !recoverableRun && (
        <main className="flex flex-1 flex-col justify-center gap-8 px-6 pb-16">
          <div className="mx-auto w-full max-w-sm space-y-7">
            {pairingInvite && (
              <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4">
                <p className="text-sm font-semibold">{pairingInvite.hostName} te chamou pra correr</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Vocês vão ver a posição um do outro ao vivo enquanto correm. Se ainda não são amigos
                  no app, isso já resolve — parear aceita a amizade pra vocês.
                </p>
                {pairingInviteError && <p className="mt-2 text-xs text-bad">{pairingInviteError}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmPairing}
                    disabled={pairingInviteBusy}
                    className="flex-1 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-60"
                  >
                    {pairingInviteBusy ? "Pareando…" : "Parear"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPairingInvite(null)}
                    className="rounded-full border border-border px-3.5 py-2 text-xs font-medium"
                  >
                    Agora não
                  </button>
                </div>
              </div>
            )}

            <div>
              <h1 className="font-mono text-2xl font-semibold tracking-wide text-balance">
                Preparar corrida
              </h1>
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
                    const type = lastRealRun.goal ? goalTypeFromRunGoal(lastRealRun.goal) : null;
                    if (type && lastRealRun.goal) {
                      setGoalType(type);
                      if (lastRealRun.goal.distanceMeters) setGoalKm(Math.round((lastRealRun.goal.distanceMeters / 1000) * 10) / 10);
                      if (lastRealRun.goal.durationSeconds) setGoalMinutes(Math.round(lastRealRun.goal.durationSeconds / 60));
                      if (lastRealRun.goal.targetPaceSecPerKm) setGoalPaceSec(lastRealRun.goal.targetPaceSecPerKm);
                    } else {
                      setGoalType("distancia");
                      setGoalKm(Math.round((lastRealRun.distanceMeters / 1000) * 10) / 10);
                    }
                  }}
                  className="mt-3 flex items-center gap-2 self-start rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-muted hover:border-accent hover:text-foreground"
                >
                  <RepeatIcon className="h-3.5 w-3.5" />
                  Repetir última corrida · {formatDistanceKm(lastRealRun.distanceMeters)} km
                </button>
              )}
              <Link
                href="/aquecimento?tipo=aquecimento"
                className="mt-3 flex items-center gap-2 self-start rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-muted hover:border-accent hover:text-foreground"
              >
                <WarmupIcon className="h-3.5 w-3.5" />
                Aquecer antes de correr
              </Link>
            </div>

            <NearbyFriendCard />

            <RunWeatherCard />

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
              {goalType === "prova" && (
                <div className="space-y-4">
                  <div>
                    <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                      Distância
                    </span>
                    <PresetChipRow
                      presets={DISTANCE_PRESETS_KM.map((km) => ({ value: km, label: `${km} km` }))}
                      value={goalKm}
                      onSelect={setGoalKm}
                      onOpenCustom={() => setCustomSheet("distancia")}
                      customLabel={DISTANCE_PRESETS_KM.includes(goalKm) ? null : `${goalKm} km`}
                    />
                  </div>
                  <div>
                    <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                      Terminar em
                    </span>
                    <PresetChipRow
                      presets={TIME_PRESETS_MIN.map((min) => ({ value: min, label: `${min} min` }))}
                      value={goalMinutes}
                      onSelect={setGoalMinutes}
                      onOpenCustom={() => setCustomSheet("tempo")}
                      customLabel={TIME_PRESETS_MIN.includes(goalMinutes) ? null : `${goalMinutes} min`}
                    />
                  </div>
                  {goalKm > 0 && goalMinutes > 0 && (
                    <p className="text-xs leading-relaxed text-muted">
                      Pace médio necessário: <span className="font-semibold text-foreground">{formatPace(Math.round((goalMinutes * 60) / goalKm))}/km</span>.
                      Durante a corrida, o &quot;Pace necessário&quot; recalcula isso pro trecho que falta, de acordo com o que você já correu.
                    </p>
                  )}
                </div>
              )}
              {goalType === "livre" && (
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Sem meta — só cronômetro, mapa e pace ao vivo.
                </p>
              )}
            </Card>

            <Card>
              <span className="mb-3 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                Aviso de parcial a cada
              </span>
              <PillTabs
                tabs={ANNOUNCE_MODE_TABS}
                active={announceMode}
                onChange={(mode) => updatePreferences({ announceMode: mode })}
              />
              <div className="mt-3">
                {announceMode === "distance" ? (
                  <PillSlider
                    min={ANNOUNCE_MIN_METERS}
                    max={ANNOUNCE_MAX_METERS}
                    step={ANNOUNCE_STEP_METERS}
                    value={announceMeters}
                    onChange={(meters) => updatePreferences({ announceIntervalMeters: meters })}
                    formatValue={announceLabel}
                  />
                ) : (
                  <PillSlider
                    min={ANNOUNCE_MIN_SECONDS}
                    max={ANNOUNCE_MAX_SECONDS}
                    step={ANNOUNCE_STEP_SECONDS}
                    value={announceSeconds}
                    onChange={(seconds) => updatePreferences({ announceIntervalSeconds: seconds })}
                    formatValue={announceSecondsLabel}
                  />
                )}
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                  Como avisar
                </span>
                <PillTabs
                  tabs={ANNOUNCE_STYLE_TABS}
                  active={announceStyle}
                  onChange={(style) => updatePreferences({ announceStyle: style })}
                />
              </div>
              {announceStyle === "voz" ? (
                <div className="mt-3">
                  <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                    Voz
                  </span>
                  <PillTabs
                    tabs={VOICE_GENDER_TABS}
                    active={voiceGender}
                    onChange={(gender) => updatePreferences({ voiceGender: gender })}
                  />
                </div>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  Vibra a cada marca, sem voz.
                </p>
              )}

              {/* "Ritmo médio"/"Ritmo parcial" are always categories in the
                  picker now, no opt-in needed. "Pace do km atual" is the
                  one still gated here — it's a goal-only reading that
                  doesn't apply to every run, unlike the five base ones. */}
              <div className="mt-4 border-t border-border pt-4">
                <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                  Estatísticas na tela de corrida
                </span>
                <div className="flex gap-2">
                  <ToggleChip
                    label="Pace do km atual"
                    checked={preferences.showCurrentKmPaceLive}
                    onChange={(checked) => updatePreferences({ showCurrentKmPaceLive: checked })}
                  />
                </div>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                  Vibração
                </span>
                {/*
                  Isolates "o toggle não vibra durante a corrida" into two
                  separate questions someone can answer without waiting 20s
                  atrasado no meio de uma corrida de verdade: aperta aqui —
                  se não vibrar, o problema é o aparelho/plugin (modo
                  silencioso bloqueando o motor, permissão negada, etc.), não
                  a lógica de atraso de ritmo em si; se vibrar aqui mas nunca
                  durante uma corrida, o problema é a condição de disparo
                  (meta não é "Ritmo", ou nunca ficou 20s atrasado de verdade).
                */}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <PreferenceToggle
                      label="Vibrar quando atrasar do ritmo"
                      hint="só com meta de ritmo, ao passar 20s do alvo"
                      checked={preferences.vibrateOnPaceDelay}
                      onChange={(checked) => updatePreferences({ vibrateOnPaceDelay: checked })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setVibrateTested(true);
                      firePaceDelayVibration();
                      window.setTimeout(() => setVibrateTested(false), 2000);
                    }}
                    className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted transition-colors active:text-foreground"
                  >
                    {vibrateTested ? "Vibrou?" : "Testar"}
                  </button>
                </div>
              </div>
            </Card>

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
            <div className="block space-y-2">
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
                <Link
                  href="/perfil"
                  className="block rounded-xl border border-dashed border-border bg-background px-3 py-2.5 text-xs leading-relaxed text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  Nenhum tênis cadastrado ainda — cadastre um no seu perfil pra escolher aqui.
                </Link>
              )}
            </div>

            <Card>
              <span className="mb-3 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                Compartilhar corrida
              </span>
              {shareTabs.length > 1 && (
                <div className="mb-3">
                  <PillTabs tabs={shareTabs} active={effectiveShareTab} onChange={setShareTab} />
                </div>
              )}

              {effectiveShareTab === "convite" &&
                (longaoSession ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">
                      Quem entrou com esse código ({longaoSession.$id}) vê sua posição enquanto a corrida
                      rolar.
                    </p>

                    {longaoSession.hostId === account?.id && (
                      <div className="mt-1 flex flex-col items-center gap-2 rounded-2xl border border-border bg-background p-4">
                        <PairingQrCode url={buildPairingUrl(longaoSession.$id)} className="w-40" />
                        <p className="font-mono text-sm font-semibold tracking-wider">{longaoSession.$id}</p>
                        <p className="text-center text-[11px] text-muted">
                          Peça pra escanear com a câmera do celular dela
                        </p>
                      </div>
                    )}

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
                        Compartilhar
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
                      <button
                        type="button"
                        onClick={handleEndLongao}
                        disabled={endingLongao}
                        className="rounded-full border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-bad hover:text-bad disabled:opacity-60"
                      >
                        {endingLongao ? "Cancelando…" : longaoSession.hostId === account?.id ? "Cancelar" : "Sair"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">
                      Compartilhem posição um do outro, sem precisar ser amigos no app.
                    </p>
                    <button
                      type="button"
                      onClick={handleGeneratePairing}
                      disabled={generatingPairing}
                      className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent/10 px-3.5 py-2 text-xs font-semibold text-accent disabled:opacity-60"
                    >
                      {generatingPairing && (
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true">
                          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth={2.5} fill="none" strokeDasharray="24 44" strokeLinecap="round" />
                        </svg>
                      )}
                      {generatingPairing ? "Gerando…" : "Gerar QR"}
                    </button>
                    {pairingGenerateError && <p className="text-xs text-bad">{pairingGenerateError}</p>}
                  </div>
                ))}

              {effectiveShareTab === "treinador" && coaches.length > 0 && (
                <div className="space-y-2">
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
                  {liveCoachId !== null && (
                    <label className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3.5 py-3">
                      <span className="text-xs leading-relaxed text-muted">
                        Compartilhar frequência cardíaca ao vivo com esse treinador — só aparece se um
                        relógio estiver sincronizando FC quase em tempo real.
                      </span>
                      <input
                        type="checkbox"
                        checked={preferences.shareHeartRateWithCoach}
                        onChange={(e) => updatePreferences({ shareHeartRateWithCoach: e.target.checked })}
                        className="h-5 w-5 shrink-0 accent-accent"
                      />
                    </label>
                  )}
                </div>
              )}

              {effectiveShareTab === "amigos" && friends.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted">Escolha quem vê sua posição e pace ao vivo — some ao terminar.</p>
                  <div className="flex flex-wrap gap-2">
                    {friends.map((connection) => (
                      <button
                        key={connection.friendship.$id}
                        type="button"
                        onClick={() => toggleLiveFriend(connection.otherId)}
                        className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                          liveFriendIds.includes(connection.otherId)
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
            </Card>

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
          const avgPaceSecPerKm = state.distanceMeters > 10 ? (state.elapsedSeconds / state.distanceMeters) * 1000 : NaN;
          const lastLap = laps[laps.length - 1] ?? null;
          const splitPaceSecPerKm = lastLap ? lastLap.paceSecPerKm : avgPaceSecPerKm;
          const metricValues: Record<MetricId, string> = {
            ritmo: formatPace(state.currentPaceSecPerKm),
            distancia: formatDistanceKm(state.distanceMeters),
            tempo: formatElapsed(state.elapsedSeconds),
            medio: formatPace(avgPaceSecPerKm),
            parcial: formatPace(splitPaceSecPerKm),
            eta: state.goal?.distanceMeters ? formatGoalEta(state.forecastSecondsRemaining) : "--",
            paceNecessario: state.paceNeededSecPerKm !== null ? formatPace(state.paceNeededSecPerKm) : "--",
            paceKmAtual: state.currentKmPaceSecPerKm !== null ? formatPace(state.currentKmPaceSecPerKm) : "--",
            fc: formatHeartRateValue(state.heartRateBpm, state.heartRateConnection),
          };
          // The situational readings (only some runs have a goal/paired
          // sensor) join the same picker as full categories instead of
          // sitting fixed on screen regardless of what's selected — one
          // category is ever the one shown at a time, same as the five
          // always-available ones.
          const pickerMetrics: { id: MetricId; label: string; chip: string; unit: string }[] = [...METRICS];
          if (state.goal?.distanceMeters) {
            pickerMetrics.push({ id: "eta", label: "Chegada prevista", chip: "Chegada", unit: "" });
          }
          if (state.paceNeededSecPerKm !== null) {
            pickerMetrics.push({ id: "paceNecessario", label: "Pace necessário", chip: "Necessário", unit: "min/km" });
          }
          if (preferences.showCurrentKmPaceLive && state.currentKmPaceSecPerKm !== null) {
            pickerMetrics.push({ id: "paceKmAtual", label: "Pace do km atual", chip: "Pace do km", unit: "min/km" });
          }
          if (preferences.heartRateMonitorDeviceId) {
            pickerMetrics.push({ id: "fc", label: "Frequência cardíaca", chip: "FC", unit: "bpm" });
          }
          const featured = pickerMetrics.find((m) => m.id === metricTemplate) ?? METRICS[0];

          return (
            <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-8">
              <div className="flex items-center justify-end">
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
                  {laps.length} {laps.length === 1 ? "volta" : "voltas"}
                </span>
              </div>

              {/*
               * Template picker — pick which category gets the giant number
               * below. All categories visible at once (wrapping, never a
               * scroll row that hides some off-screen) so every one is a
               * single tap away, not a tap-then-scroll-to-find — 5 always
               * available, up to 4 more only when this run actually has
               * that data. Everything else about the run stays reachable
               * here instead of sitting fixed on screen regardless of pick.
               */}
              <div className="mt-3 flex flex-wrap gap-2">
                {pickerMetrics.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetricTemplate(m.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-bold whitespace-nowrap transition-colors ${
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

              {/*
               * Only the selected category renders below — no fixed grid of
               * every other reading regardless of the pick. The giant number
               * takes all the vertical space this leaves, since a runner
               * mid-stride needs to read it at a glance, not hunt for it.
               */}
              <div className="flex flex-1 flex-col items-center justify-center px-3">
                <span
                  className={`text-metal-run text-metal-run-giant leading-none tabular-nums whitespace-nowrap ${
                    // "Tempo" past an hour ("1:23:45") or a marathon-length
                    // "distância" ("42.195") is too wide for the bigger size
                    // on a small phone at this weight — same size as before
                    // for those, bumped up for the common short values
                    // (pace, most distances/times) the request was about.
                    metricValues[featured.id].length > 5 ? "text-[5.5rem]" : "text-[7.5rem]"
                  }`}
                >
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

              <div className="mt-4 flex items-center gap-3">
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

              {carbToast && (
                <div
                  className="pr-enter absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-xs font-bold whitespace-nowrap text-accent-foreground"
                  style={{ "--pr-dur": "0.25s" } as CSSProperties}
                >
                  {carbToast}
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

          {(() => {
            // "Ritmo" goals carry the target pace directly; "Prova" goals
            // (distância + tempo juntos) don't — the target average pace
            // there is implied, not stated, so it's derived the same way
            // the live "Pace necessário" card already does.
            const raceTargetPaceSecPerKm =
              state.goal?.targetPaceSecPerKm ??
              (state.goal?.distanceMeters && state.goal?.durationSeconds
                ? state.goal.durationSeconds / (state.goal.distanceMeters / 1000)
                : null);
            if (!raceTargetPaceSecPerKm || state.finishedRun.distanceMeters === 0) return null;
            return (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-xs uppercase tracking-wide text-muted">
                  Meta de ritmo · {formatPace(raceTargetPaceSecPerKm)}/km
                </span>
                <PaceDeltaPill
                  deltaSecPerKm={
                    (runMovingSeconds(state.finishedRun) / state.finishedRun.distanceMeters) * 1000 -
                    raceTargetPaceSecPerKm
                  }
                />
              </div>
            );
          })()}

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
              <ul className="mt-2 flex flex-col gap-2">
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
              <ul className="mt-2 flex flex-col gap-2">
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
              <ul className="mt-2 flex flex-col gap-2.5">
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
              <ul className="mt-2 flex flex-col gap-1.5">
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
            <Link
              href="/aquecimento?tipo=alongamento"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-6 py-3 text-sm font-semibold text-muted hover:border-accent hover:text-foreground"
            >
              <WarmupIcon className="h-4 w-4" />
              Alongar agora
            </Link>
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
                  <ul className="mt-3 flex flex-col gap-3.5">
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

      {showAccountPrompt && <AccountPrompt onClose={() => setShowAccountPrompt(false)} returnTo="/run" />}

      {lobbyOpen && longaoSession && account && (
        <GroupRunLobby
          sessionCode={longaoSession.$id}
          myUserId={account.id}
          isHost={longaoSession.hostId === account.id}
          onStarted={() => {
            setLobbyOpen(false);
            // Same trigger the Apple Watch/Wear OS "start" action already
            // uses (see the onWatchAction effect below) — reuses whatever
            // options the idle form already has configured, rather than
            // re-deriving them here.
            if (state.status === "idle") handleStartRef.current();
          }}
          onCancelled={() => {
            setLobbyOpen(false);
            setLongaoSession(null);
          }}
        />
      )}
    </div>
  );
}
