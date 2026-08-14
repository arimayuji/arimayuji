"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
  markRecordOpened,
  runMovingSeconds,
  summarizeShoes,
  updateRunTracks,
  type CompletedRun,
  type RunTrack,
  type Shoe,
} from "@/lib/tracking/storage";
import { RouteMap } from "../route-map";
import { computeAchievement } from "@/lib/tracking/achievements";
import { computeRunRecords, type RunRecord } from "@/lib/tracking/personalRecords";
import { AchievementReveal } from "../achievement-reveal";
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
import {
  buildShareCardVideoFile,
  canRecordShareVideo,
  canShareVideoFiles,
} from "@/lib/shareCard/video";
import { useImmersiveMode } from "../app-shell";
import { NoticeBadge } from "../ui";
import { PillSlider } from "../pill-slider";

const RECENT_GHOST_CANDIDATES = 6;

const PAUSE_REASONS = ["Água", "Banheiro", "Gel/carboidrato", "Foto", "Alongamento", "Outro"];

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
        className="absolute inset-y-0 left-0 bg-white/25"
        style={{
          width: holding ? "100%" : "0%",
          transition: holding ? `width ${HOLD_TO_FINISH_MS}ms linear` : "width 150ms ease-out",
        }}
      />
      <span className="relative">{holding ? "Segura pra finalizar…" : "Finalizar"}</span>
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

const GPS_LABEL: Record<string, { label: string; className: string }> = {
  searching: { label: "Procurando sinal", className: "bg-bad" },
  weak: { label: "Sinal fraco", className: "bg-warn" },
  good: { label: "Sinal bom", className: "bg-good" },
};

function GpsDot({ quality }: { quality: string }) {
  const info = GPS_LABEL[quality] ?? GPS_LABEL.searching;
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1.5 text-sm text-muted backdrop-blur-md">
      <span className={`h-2.5 w-2.5 rounded-full ${info.className}`} />
      {info.label}
    </span>
  );
}

function formatGoalEta(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return "--:--";
  return formatElapsed(Math.round(totalSeconds));
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
  /** The ghost actually used for the in-progress run, captured at start — kept separate from the
   * picker above so a later change to `selectedGhostId` (e.g. after resetting for a new run)
   * doesn't retroactively change what the finished summary says was raced against. */
  const [activeGhost, setActiveGhost] = useState<CompletedRun | null>(null);
  const [runRecords, setRunRecords] = useState<RunRecord[]>([]);
  const [openedRecordMeters, setOpenedRecordMeters] = useState<number[]>([]);
  const [revealing, setRevealing] = useState<{ record: RunRecord; wasOpened: boolean } | null>(null);
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
      setRecentRuns(
        [...runs].sort((a, b) => b.startedAt - a.startedAt).slice(0, RECENT_GHOST_CANDIDATES),
      );
    });
  }, [state.status]);

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
  /** Drives the arrow-travels-across-the-button animation on tap — `group-hover` alone never fires on a touchscreen, which is most of this button's actual audience. */
  const [starting, setStarting] = useState(false);
  const START_ANIMATION_MS = 420;

  const handleStart = () => {
    setManualTracks([]);
    setMusicQuery("");
    setMusicResults(null);
    const distanceMeters = goalKm ? Number(goalKm) * 1000 : undefined;
    const durationSeconds = goalMinutes ? Number(goalMinutes) * 60 : undefined;
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
    setActiveGhost(null);
    setManualTracks([]);
    setMusicQuery("");
    setMusicResults(null);
    setDiscarding(false);
    setRunRecords([]);
    setOpenedRecordMeters([]);
    setRevealing(null);
    reset();
  };

  /** See the same handler in historico/detalhe/run-detail.tsx — the persisted flag only decides whether the box animation replays. */
  const handleRecordUnboxed = (runId: string, record: RunRecord) => {
    if (openedRecordMeters.includes(record.targetMeters)) return;
    setOpenedRecordMeters((current) => [...current, record.targetMeters]);
    markRecordOpened(runId, record.targetMeters).catch(() => {});
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
    if (
      shareSupport === "share" &&
      !reducedMotion &&
      canRecordShareVideo() &&
      canShareVideoFiles()
    ) {
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
      {isLiveRun && (
        <div className="fixed inset-0">
          <RouteMap points={state.points} live square={false} rounded={false} className="h-full" />
        </div>
      )}

      <header className="relative z-10 flex items-center justify-between px-5 py-4">
        <Link
          href="/"
          className={`text-sm text-muted hover:text-foreground ${isLiveRun ? "rounded-full bg-background/70 px-3 py-1.5 backdrop-blur-md" : ""}`}
        >
          &larr; Xanthus
        </Link>
        {state.status !== "idle" && <GpsDot quality={state.gpsQuality} />}
      </header>

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

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Meta de distância (km)</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={goalKm}
                onChange={(e) => setGoalKm(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-mono tabular-nums outline-none focus:border-accent"
                placeholder="opcional"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Meta de tempo (min)</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={goalMinutes}
                onChange={(e) => setGoalMinutes(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-mono tabular-nums outline-none focus:border-accent"
                placeholder="opcional"
              />
            </label>

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
                <span className="text-sm font-medium">Corrida fantasma (opcional)</span>
                <p className="text-xs text-muted">
                  Compara o tempo até a mesma distância percorrida, não o trajeto.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedGhostId(null)}
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
                      onClick={() => setSelectedGhostId(run.id)}
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
              className="group relative flex w-full items-center justify-center overflow-hidden rounded-full bg-accent px-6 py-4 text-base font-semibold text-accent-foreground disabled:cursor-default"
            >
              <span
                className={`transition-opacity duration-300 group-hover:opacity-0 ${starting ? "opacity-0" : ""}`}
              >
                Iniciar corrida
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className={`pointer-events-none absolute top-1/2 left-6 h-5 w-5 -translate-y-1/2 text-accent-foreground transition-all ease-out group-hover:left-1/2 group-hover:h-8 group-hover:w-8 group-hover:-translate-x-1/2 ${
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
          <div className="relative flex items-center justify-center">
            {/*
             * A soft halo in the clip's own off-white, well past its edges —
             * bridges the hard cut from the video's near-white background
             * (#fbfbfb, fixed regardless of theme — see below) into the dark
             * screen so it reads as one glowing loading centerpiece instead
             * of a small sticker dropped on black.
             */}
            <div
              className="absolute h-64 w-64 rounded-full bg-white/20 blur-3xl"
              aria-hidden="true"
            />
            {/*
             * Fixed light background, not `bg-surface` — the clip's own
             * background is a near-white off-white, and that token flips
             * dark in dark mode. A themed background would put a stark white
             * rectangle in the middle of a dark screen; a fixed one plus the
             * feathered mask below is what actually blends it in.
             */}
            <video
              autoPlay
              loop
              muted
              playsInline
              className="relative block h-56 w-56 bg-white sm:h-64 sm:w-64"
              style={{
                maskImage: "radial-gradient(circle, black 60%, transparent 88%)",
                WebkitMaskImage: "radial-gradient(circle, black 60%, transparent 88%)",
              }}
              src="/running-loop.mp4"
            />
          </div>
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
            <div className="flex flex-col items-center gap-1 rounded-3xl bg-background/70 px-8 py-5 backdrop-blur-md">
              <span className="font-mono text-7xl font-semibold tabular-nums">
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
                <div className="mt-4 rounded-xl border border-border/60 bg-surface/85 p-4 backdrop-blur-md">
                  <span className="text-xs uppercase tracking-wide text-muted">
                    Pausado — por quê? (opcional)
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PAUSE_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setPauseReason(reason)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          currentPause?.reason === reason
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border bg-background text-foreground hover:border-accent"
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

          <div className="grid grid-cols-2 gap-4 py-6">
            <div className="rounded-xl border border-border/60 bg-surface/85 p-4 backdrop-blur-md">
              <span className="text-xs uppercase tracking-wide text-muted">Distância</span>
              <p className="mt-1 font-mono text-2xl tabular-nums">
                {formatDistanceKm(state.distanceMeters)} <span className="text-base text-muted">km</span>
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-surface/85 p-4 backdrop-blur-md">
              <span className="text-xs uppercase tracking-wide text-muted">Tempo</span>
              <p className="mt-1 font-mono text-2xl tabular-nums">{formatElapsed(state.elapsedSeconds)}</p>
            </div>
            {state.goal?.distanceMeters && (
              <div className="rounded-xl border border-border/60 bg-surface/85 p-4 backdrop-blur-md">
                <span className="text-xs uppercase tracking-wide text-muted">Chegada prevista em</span>
                <p className="mt-1 font-mono text-2xl tabular-nums">
                  {formatGoalEta(state.forecastSecondsRemaining)}
                </p>
              </div>
            )}
            {state.paceNeededSecPerKm !== null && (
              <div className="rounded-xl border border-border/60 bg-surface/85 p-4 backdrop-blur-md">
                <span className="text-xs uppercase tracking-wide text-muted">Pace necessário</span>
                <p className="mt-1 font-mono text-2xl tabular-nums">
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
                className="flex-1 rounded-full border border-border bg-background/70 py-4 text-base font-semibold backdrop-blur-md hover:border-accent"
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
                className="flex-1 rounded-full border border-accent bg-background/70 py-4 text-base font-semibold text-accent backdrop-blur-md disabled:cursor-not-allowed disabled:border-border disabled:text-muted"
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
            <p className="mt-2 font-mono text-5xl font-semibold tabular-nums">
              {formatDistanceKm(state.finishedRun.distanceMeters)} km
            </p>
          </div>

          <RouteMap points={state.finishedRun.points} className="max-w-xs" />

          <div className="grid w-full max-w-xs grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <span className="text-xs uppercase tracking-wide text-muted">Tempo</span>
              <p className="mt-1 font-mono text-xl tabular-nums">
                {formatElapsed(runMovingSeconds(state.finishedRun))}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <span className="text-xs uppercase tracking-wide text-muted">Pace médio</span>
              <p className="mt-1 font-mono text-xl tabular-nums">
                {formatPace(
                  state.finishedRun.distanceMeters > 0
                    ? (runMovingSeconds(state.finishedRun) / state.finishedRun.distanceMeters) * 1000
                    : null,
                )}
              </p>
            </div>
          </div>

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
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={discarding}
              className="text-sm text-muted underline hover:text-bad disabled:opacity-60"
            >
              {discarding ? "Descartando…" : "Descartar corrida"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground"
            >
              Nova corrida
            </button>
          </div>
        </main>
      )}

      {showRunTips && <RunOnboarding onDone={handleRunTipsDone} onSkip={handleRunTipsSkip} />}
    </div>
  );
}
