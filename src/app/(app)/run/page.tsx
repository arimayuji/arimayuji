"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRunTracker } from "@/lib/tracking/useRunTracker";
import { listCoachConnections, type CoachConnection } from "@/lib/coachRelationships";
import { startLiveSession, updateLiveSession, endLiveSession } from "@/lib/liveRuns";
import {
  formatDeltaDuration,
  formatDistanceKm,
  formatElapsed,
  formatPace,
} from "@/lib/tracking/geoFilter";
import {
  deleteCompletedRun,
  listCompletedRuns,
  listShoes,
  markEmblemOpened,
  markRecordOpened,
  runMovingSeconds,
  summarizeShoes,
  updateRunRpe,
  updateRunTracks,
  type CompletedRun,
  type RunTrack,
  type Shoe,
} from "@/lib/tracking/storage";
import { RouteMap } from "../route-map";
import { computeAchievement } from "@/lib/tracking/achievements";
import { computeRunRecords, type RunRecord } from "@/lib/tracking/personalRecords";
import {
  EMBLEM_ACCENT,
  formatEmblemKm,
  milestonesJustCrossed,
  nextMilestone,
  totalDistanceMeters,
} from "@/lib/tracking/emblems";
import {
  formatTimeHours,
  nextTimeMilestone,
  TIME_ACCENT,
  totalMovingHours,
} from "@/lib/tracking/collectibles";
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
import type { DistanceUnit } from "@/lib/preferences";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { useShareSupport } from "@/lib/share";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import { buildShareCardScene, scenarioForRun } from "@/lib/shareCard/renderer";
import { buildShareCardVideoFile, canRecordShareVideo } from "@/lib/shareCard/video";
import { useImmersiveMode, useTabReclick } from "../app-shell";
import { NoticeBadge } from "../ui";
import { PillSlider } from "../pill-slider";
import { StatIconBadge } from "../stat-icon-badge";

const RECENT_GHOST_CANDIDATES = 6;

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

function formatGoalEta(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return "--:--";
  return formatElapsed(Math.round(totalSeconds));
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
      accent: EMBLEM_ACCENT[nextDistanceAfter.km] ?? "#5b8dff",
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
      accent: TIME_ACCENT[nextTimeAfter.value] ?? "#5b8dff",
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
  const { state, start, pause, resume, finish, reset, setPauseReason } = useRunTracker();
  const [discarding, setDiscarding] = useState(false);
  const [goalKm, setGoalKm] = useState("5");
  const [goalMinutes, setGoalMinutes] = useState("");
  const [shoeName, setShoeName] = useState("");
  const [shoeSuggestions, setShoeSuggestions] = useState<string[]>([]);
  const [registeredShoes, setRegisteredShoes] = useState<Shoe[]>([]);
  /** True once the athlete has typed into the manual field, or picked a shoe not in `registeredShoes` (e.g. from a previous run) — keeps the free-text field visible instead of it disappearing the moment a card is selectable. */
  const [typingShoe, setTypingShoe] = useState(false);
  const [recentRuns, setRecentRuns] = useState<CompletedRun[]>([]);
  const [selectedGhostId, setSelectedGhostId] = useState<string | null>(null);
  /** True once the athlete has tapped a ghost option this idle cycle — gates the auto-pick-most-recent default below so it never fights an explicit "Sem fantasma" choice. */
  const [ghostTouched, setGhostTouched] = useState(false);
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
  const shareSupport = useShareSupport();
  const reducedMotion = usePrefersReducedMotion();
  const [shareCopied, setShareCopied] = useState(false);
  /** Null while nothing is recording; 0–1 while the card animation is being captured. */
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  /** Accepted coaches this athlete could go live with — empty for almost everyone, which is why the picker below only renders when it isn't. */
  const [coaches, setCoaches] = useState<CoachConnection[]>([]);
  /** Which coach (if any) this run is being shared live with — chosen before starting, null means "not live". */
  const [liveCoachId, setLiveCoachId] = useState<string | null>(null);

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
    Promise.all([listShoes(), listCompletedRuns()]).then(([shoes, runs]) => {
      const used = summarizeShoes(runs).map((s) => s.name);
      setShoeSuggestions([...new Set([...shoes.map((s) => s.name), ...used])]);
      setRegisteredShoes(shoes);
      const sorted = [...runs].sort((a, b) => b.startedAt - a.startedAt);
      setRecentRuns(sorted.slice(0, RECENT_GHOST_CANDIDATES));
      // Defaults to racing the last run — the comparison most people actually
      // want ("am I faster than last time") — without fighting an explicit
      // "Sem fantasma" tap, which also sets `selectedGhostId` to null but
      // marks `ghostTouched` so this default doesn't override it.
      setSelectedGhostId((current) => (ghostTouched || current !== null ? current : (sorted[0]?.id ?? null)));
    });
  }, [state.status, ghostTouched]);

  /** Same re-fetch-on-return-to-idle reasoning as the effect above — a coach accepted mid-session should be pickable for the very next run. */
  useEffect(() => {
    if (state.status !== "idle") return;
    listCoachConnections("accepted").then((rows) => {
      const asStudent = rows.filter((c) => c.myRole === "student");
      setCoaches(asStudent);
      setLiveCoachId((current) => (asStudent.some((c) => c.otherId === current) ? current : null));
    });
  }, [state.status]);

  const selectedGhost = recentRuns.find((r) => r.id === selectedGhostId) ?? null;

  /**
   * The announcement interval comes from the preference set on /perfil, and
   * changing it here writes it back — same single source, no second copy of
   * the setting. The tracker hook still owns the announcing itself; this is
   * only the value handed to `start()`.
   */
  const [preferences, updatePreferences] = usePreferences();
  const announceMeters = preferences.announceIntervalMeters;

  /**
   * Live position sharing — a ping to the chosen coach every few seconds
   * while `tracking`/`paused`, never more often than that (a live map only
   * needs to be roughly current, not frame-perfect, and every extra request
   * is data and battery the athlete is paying for mid-run). The session
   * starts the moment tracking actually begins (not at the idle "choose a
   * coach" step, since warmup might never complete) and ends the moment
   * it stops being `tracking`/`paused` for any reason — finished, or this
   * screen unmounting entirely — so a coach never keeps watching a dot that
   * stopped moving for a reason they can't see.
   */
  const liveSessionActiveRef = useRef(false);
  const lastLivePushRef = useRef(0);
  const LIVE_PUSH_INTERVAL_MS = 6000;

  useEffect(() => {
    const live = state.status === "tracking" || state.status === "paused";
    if (live && liveCoachId && state.runId) {
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
            [liveCoachId],
            payload,
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
   * Tracks added through the manual iTunes-lookup form, kept apart from
   * `state.finishedRun.tracks` (empty until a manual add persists it) and
   * merged with it only for display — this is what lets the "Trilha sonora"
   * list update immediately without waiting on a reload.
   */
  const [manualTracks, setManualTracks] = useState<RunTrack[]>([]);
  const [musicQuery, setMusicQuery] = useState("");
  const [musicResults, setMusicResults] = useState<TrackCandidate[] | null>(null);
  const [musicSearching, setMusicSearching] = useState(false);
  const [musicSearchFailed, setMusicSearchFailed] = useState(false);

  const displayedTracks = [...(state.finishedRun?.tracks ?? []), ...manualTracks];

  /** Narrowing on `state.finishedRun` doesn't survive into the record callbacks below. */
  const finishedRun = state.finishedRun;

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

  const handleAddManualTrack = useCallback(
    async (candidate: TrackCandidate) => {
      if (!state.finishedRun) return;
      const newTrack: RunTrack = {
        name: candidate.name,
        artist: candidate.artist,
        playedAt: Date.now(),
        artworkUrl: candidate.artworkUrl || undefined,
      };
      const nextManualTracks = [...manualTracks, newTrack];
      setManualTracks(nextManualTracks);
      setMusicQuery("");
      setMusicResults(null);
      await updateRunTracks(state.finishedRun.id, [
        ...(state.finishedRun.tracks ?? []),
        ...nextManualTracks,
      ]);
    },
    [state.finishedRun, manualTracks],
  );

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
    const distanceMeters = Number(goalKm) > 0 ? Number(goalKm) * 1000 : undefined;
    const durationSeconds = Number(goalMinutes) > 0 ? Number(goalMinutes) * 60 : undefined;
    setActiveGhost(selectedGhost);
    start({
      announceIntervalMeters: announceMeters,
      goal: distanceMeters ? { distanceMeters, durationSeconds } : undefined,
      ghostRun: selectedGhost ?? undefined,
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
    setGhostTouched(false);
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

  /**
   * The animated card for this run, as a real video file, built from its own
   * GPS trace and its own numbers. Returns null for every reason it can't be
   * made — no trace to draw, no recorder, a share sheet that won't take files
   * — which the caller reads as "share the text instead".
   */
  const buildShareVideo = useCallback(
    async (run: CompletedRun, unit: DistanceUnit): Promise<File | null> => {
      // The longest distance the run set a record at: a 10k PR is the headline
      // even when the 1 km inside it also happens to be a best.
      const headline =
        runRecords
          .filter((record) => record.isNewRecord)
          .sort((a, b) => b.targetMeters - a.targetMeters)[0] ?? null;

      const shoes = run.shoeName ? await listShoes().catch(() => []) : [];
      const shoe = shoes.find((candidate) => candidate.name === run.shoeName) ?? null;

      const scene = buildShareCardScene({
        run,
        scenario: scenarioForRun(run),
        unit,
        record: headline
          ? { label: headline.label, achievement: computeAchievement(run.id, headline) }
          : null,
        shoe: shoe ? { name: shoe.name, color: shoe.color } : null,
      });
      if (scene.projected.length < 2) return null;

      let lastShown = 0;
      return buildShareCardVideoFile(scene, {
        onProgress: (fraction) => {
          // Coarse steps on purpose: capture runs on the wall clock, so a
          // re-render per animation frame would compete with the encoder.
          if (fraction - lastShown < 0.05 && fraction < 1) return;
          lastShown = fraction;
          setVideoProgress(fraction);
        },
      });
    },
    [runRecords],
  );

  /**
   * One button, three outcomes, best first: the animated card as a video file
   * through the native share sheet — which already lists WhatsApp status and
   * Instagram stories as targets on a real phone, no per-platform integration
   * or API key needed; failing that, the same numbers as text and a link;
   * failing *that*, the text on the clipboard. The text path is the one that
   * has to keep working, so nothing above it is allowed to throw its way out.
   */
  const handleShare = async () => {
    const run = state.finishedRun;
    if (!run || videoProgress !== null) return;

    const unit = preferences.distanceUnit;
    const seconds = runMovingSeconds(run);
    const pace =
      run.distanceMeters > 0 ? formatAveragePace(run.distanceMeters, seconds, unit) : null;
    const text = `Corri ${formatDistance(run.distanceMeters, unit)} ${unitLabel(unit)} em ${formatElapsed(seconds)}${
      pace !== null ? ` (${pace} ${paceLabel(unit)})` : ""
    } 🏃 — Xanthus`;
    const url = window.location.origin;

    // Someone who asked the OS for less motion gets the text, not a six-second
    // animation generated on their behalf.
    if (shareSupport === "share" && !reducedMotion && canRecordShareVideo()) {
      setVideoProgress(0);
      try {
        const file = await buildShareVideo(run, unit);
        if (file) {
          const payload = navigator.canShare({ files: [file], text, url })
            ? { files: [file], text, url }
            : { files: [file], text };
          try {
            await navigator.share(payload);
          } catch {
            // Cancelled or blocked — the sheet closing is feedback enough, and
            // silently re-opening it with text instead would be worse.
          }
          return;
        }
      } catch {
        // Recording failed outright — fall through to the text share below.
      } finally {
        setVideoProgress(null);
      }
    }

    if (shareSupport === "share") {
      try {
        await navigator.share({ text, url });
      } catch {
        // Cancelled or blocked — no error state, the sheet closing is feedback enough.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} — ${url}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions, insecure context) — nothing else to fall back to here.
    }
  };

  const isLiveRun = state.status === "tracking" || state.status === "paused";

  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <header className="relative z-10 flex items-center justify-between px-5 py-4">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          &larr; Xanthus
        </Link>
        {state.status !== "idle" && <GpsDot quality={state.gpsQuality} />}
      </header>

      {isLiveRun && showWeakSignalWarning && (
        <div className="relative z-10 mx-5 -mt-1 mb-2 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-xs leading-relaxed text-warn">
          Sinal de GPS fraco há mais de {Math.round(WEAK_SIGNAL_WARNING_MS / 1000)}s — o trajeto e a
          distância podem ficar imprecisos até melhorar.
        </div>
      )}

      {state.status === "idle" && (
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
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium">Meta de distância (km)</span>
              <PillSlider
                className="mt-2"
                min={0}
                max={42}
                step={1}
                value={Number(goalKm) || 0}
                onChange={(km) => setGoalKm(String(km))}
                formatValue={(km) => (km === 0 ? "sem meta" : `${km} km`)}
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium">Meta de tempo (min)</span>
              <PillSlider
                className="mt-2"
                min={0}
                max={180}
                step={5}
                value={Number(goalMinutes) || 0}
                onChange={(minutes) => setGoalMinutes(String(minutes))}
                formatValue={(minutes) => (minutes === 0 ? "sem meta" : `${minutes} min`)}
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium">Aviso por voz a cada</span>
              <PillSlider
                className="mt-2"
                min={ANNOUNCE_MIN_METERS}
                max={ANNOUNCE_MAX_METERS}
                step={ANNOUNCE_STEP_METERS}
                value={announceMeters}
                onChange={(meters) => updatePreferences({ announceIntervalMeters: meters })}
                formatValue={announceLabel}
              />
            </div>

            <div className="block space-y-1.5">
              <span className="text-sm font-medium">Tênis (opcional)</span>
              {registeredShoes.length > 0 && !typingShoe ? (
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
                  <button
                    type="button"
                    onClick={() => setTypingShoe(true)}
                    className="rounded-full border border-dashed border-border px-3 py-2 text-xs font-medium text-muted hover:border-accent"
                  >
                    Outro
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    list="shoe-suggestions"
                    value={shoeName}
                    onChange={(e) => setShoeName(e.target.value)}
                    placeholder="Ex.: Meu xodó"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
                  />
                  <datalist id="shoe-suggestions">
                    {shoeSuggestions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  {registeredShoes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTypingShoe(false)}
                      className="text-xs text-accent underline underline-offset-2"
                    >
                      Ver meu kit
                    </button>
                  )}
                </>
              )}
            </div>

            {recentRuns.length > 0 && (
              <div className="block space-y-1.5">
                <span className="text-sm font-medium">Corrida fantasma</span>
                <p className="text-xs text-muted">
                  Por padrão compara com sua última corrida — tempo até a mesma distância
                  percorrida, não o trajeto. Pode trocar ou desligar abaixo.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGhostId(null);
                      setGhostTouched(true);
                    }}
                    className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                      selectedGhostId === null
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-foreground hover:border-accent"
                    }`}
                  >
                    Sem fantasma
                  </button>
                  {recentRuns.map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      onClick={() => {
                        setSelectedGhostId(run.id);
                        setGhostTouched(true);
                      }}
                      className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                        selectedGhostId === run.id
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border bg-surface text-foreground hover:border-accent"
                      }`}
                    >
                      {formatDistanceKm(run.distanceMeters)} km ·{" "}
                      {new Date(run.startedAt).toLocaleDateString("pt-BR")}
                    </button>
                  ))}
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
           * Same treatment as the splash clip (see splash.tsx): the source is
           * baked black-line-art-on-white with no alpha channel. A CSS mask
           * can only crop that white square into a softer-edged white square
           * — it never actually removes the background, which is what showed
           * up as a stark light box on a dark screen. In light mode the
           * clip's own white background already matches the app's, so it
           * plays untouched; in dark mode `invert` flips it to white-on-black
           * and `mix-blend-screen` drops the now-black ground out entirely,
           * leaving just the runners floating on the real theme background.
           */}
          <video
            autoPlay
            loop
            muted
            playsInline
            className="block h-56 w-56 sm:h-64 sm:w-64 dark:invert dark:mix-blend-screen"
            src="/running-loop.mp4"
          />
          <p className="text-lg font-medium">Procurando GPS&hellip;</p>
          <p className="max-w-xs text-sm text-muted">
            Fique a céu aberto. O cronômetro começa assim que o sinal ficar estável.
          </p>
          <button type="button" onClick={handleReset} className="mt-4 text-sm text-muted underline">
            Cancelar
          </button>
        </main>
      )}

      {isLiveRun && (
        <main className="relative z-10 flex flex-1 flex-col px-6 pb-10">
          <div className="flex flex-1 flex-col items-center justify-center gap-1">
            <div className="flex flex-col items-center gap-1">
              <span className="text-metal font-mono text-[7rem] leading-none font-semibold tabular-nums whitespace-nowrap">
                {formatPace(state.currentPaceSecPerKm)}
              </span>
              <span className="text-sm text-muted">min/km</span>
              {state.ghostDeltaSeconds !== null && (
                <div className="mt-2">
                  <GhostDeltaPill deltaSeconds={state.ghostDeltaSeconds} />
                </div>
              )}
            </div>
          </div>

          {state.status === "paused" &&
            (() => {
              const currentPause = state.pauseEvents[state.pauseEvents.length - 1];
              return (
                <div className="mt-4 rounded-xl border border-border bg-surface p-4">
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

          <div className="grid grid-cols-2 gap-4 py-6">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-muted">Distância</span>
                <StatIconBadge icon="distancia" />
              </div>
              <p className="text-metal mt-1 font-mono text-2xl tabular-nums">
                {formatDistanceKm(state.distanceMeters)} <span className="text-base text-muted">km</span>
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-muted">Tempo</span>
                <StatIconBadge icon="tempo" />
              </div>
              <p className="text-metal mt-1 font-mono text-2xl tabular-nums">{formatElapsed(state.elapsedSeconds)}</p>
            </div>
            {state.goal?.distanceMeters && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted">Chegada prevista em</span>
                  <StatIconBadge icon="eta" />
                </div>
                <p className="text-metal mt-1 font-mono text-2xl tabular-nums">
                  {formatGoalEta(state.forecastSecondsRemaining)}
                </p>
              </div>
            )}
            {state.paceNeededSecPerKm !== null && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <span className="text-xs uppercase tracking-wide text-muted">Pace necessário</span>
                <p className="text-metal mt-1 font-mono text-2xl tabular-nums">
                  {formatPace(state.paceNeededSecPerKm)}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
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
            <HoldToFinishButton onConfirm={() => finish({ shoeName })} />
          </div>
        </main>
      )}

      {state.status === "finished" && state.finishedRun && (
        <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
          <div>
            <p className="text-sm text-muted">Corrida concluída</p>
            <p className="text-metal mt-2 font-mono text-5xl font-semibold tabular-nums">
              {formatDistanceKm(state.finishedRun.distanceMeters)} km
            </p>
          </div>

          <RouteMap points={state.finishedRun.points} className="max-w-xs" />

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
          </div>

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
                    <span className="truncate">
                      {track.name} <span className="text-muted">— {track.artist}</span>
                    </span>
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
            <button
              type="button"
              onClick={handleShare}
              disabled={videoProgress !== null}
              aria-live="polite"
              className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground disabled:cursor-progress"
            >
              {videoProgress !== null && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-accent-foreground/20 transition-[width] duration-200 ease-linear"
                  style={{ width: `${Math.round(videoProgress * 100)}%` }}
                />
              )}
              <svg viewBox="0 0 24 24" className="relative h-4.5 w-4.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="2.75" />
                <circle cx="6" cy="12" r="2.75" />
                <circle cx="18" cy="19" r="2.75" />
                <path d="M8.5 10.5l7-4.2M8.5 13.5l7 4.2" />
              </svg>
              <span className="relative">
                {videoProgress !== null
                  ? "Gerando vídeo…"
                  : shareCopied
                    ? "Copiado!"
                    : "Compartilhar"}
              </span>
            </button>
            <p className="max-w-xs text-xs leading-relaxed text-muted">
              {videoProgress !== null
                ? "O card é gravado em tempo real, então leva os segundos que a animação dura. Não feche a tela."
                : "Gera um vídeo com o seu traçado desenhando e os números dessa corrida — pronto pro status do WhatsApp ou pros stories."}{" "}
              <Link href="/compartilhar" className="text-accent underline underline-offset-2">
                Ver os cenários de fundo
              </Link>
              .
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
            <button
              type="button"
              onClick={handleDiscard}
              disabled={discarding}
              className="w-full rounded-full border border-border px-6 py-3 text-sm font-semibold text-bad disabled:opacity-60"
            >
              {discarding ? "Descartando…" : "Descartar corrida"}
            </button>
          </div>
        </main>
      )}

      {showRunTips && <RunOnboarding onDone={handleRunTipsDone} onSkip={handleRunTipsSkip} />}
    </div>
  );
}
