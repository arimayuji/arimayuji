"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRunTracker } from "@/lib/tracking/useRunTracker";
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
  runMovingSeconds,
  summarizeShoes,
  updateRunTracks,
  type CompletedRun,
  type RunTrack,
} from "@/lib/tracking/storage";
import { RouteMap } from "../route-map";
import { computeRunRecords, type RunRecord } from "@/lib/tracking/personalRecords";
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
import { useImmersiveMode } from "../app-shell";
import { NoticeBadge } from "../ui";
import { PillSlider } from "../pill-slider";

const RECENT_GHOST_CANDIDATES = 6;

const PAUSE_REASONS = ["Água", "Banheiro", "Gel/carboidrato", "Foto", "Alongamento", "Outro"];

function formatPauseDuration(startedAt: number, endedAt: number | null): string {
  const seconds = ((endedAt ?? Date.now()) - startedAt) / 1000;
  return formatDeltaDuration(seconds);
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
  const [recentRuns, setRecentRuns] = useState<CompletedRun[]>([]);
  const [selectedGhostId, setSelectedGhostId] = useState<string | null>(null);
  /** The ghost actually used for the in-progress run, captured at start — kept separate from the
   * picker above so a later change to `selectedGhostId` (e.g. after resetting for a new run)
   * doesn't retroactively change what the finished summary says was raced against. */
  const [activeGhost, setActiveGhost] = useState<CompletedRun | null>(null);
  const [runRecords, setRunRecords] = useState<RunRecord[]>([]);

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
      setRecentRuns(
        [...runs].sort((a, b) => b.startedAt - a.startedAt).slice(0, RECENT_GHOST_CANDIDATES),
      );
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
    handleStart();
  };

  const handleRunTipsSkip = () => {
    markRunTipsSeen();
    setShowRunTips(false);
  };

  const handleReset = () => {
    setSelectedGhostId(null);
    setActiveGhost(null);
    setManualTracks([]);
    setMusicQuery("");
    setMusicResults(null);
    setDiscarding(false);
    setRunRecords([]);
    reset();
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
                A tela precisa ficar ligada durante o treino para o GPS se manter preciso.
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

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Tênis (opcional)</span>
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
            </label>

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
          <div className="overflow-hidden rounded-2xl bg-white p-1 shadow-sm">
            {/*
             * Fixed light chip, not `bg-surface` — the clip's own background
             * is a near-white off-white (#fbfbfb), and that token flips dark
             * in dark mode. A themed background would put a stark white
             * rectangle in the middle of a dark screen; a fixed one reads as
             * a deliberate framed sticker either way.
             */}
            <video
              autoPlay
              loop
              muted
              playsInline
              className="block h-28 w-28 rounded-xl"
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
            <button
              type="button"
              onClick={() => finish({ shoeName })}
              className="flex-1 rounded-full bg-bad py-4 text-base font-semibold text-white hover:opacity-90"
            >
              Finalizar
            </button>
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

          {runRecords.some((r) => r.isNewRecord) && (
            <div className="flex w-full max-w-xs flex-col gap-2">
              {runRecords
                .filter((r) => r.isNewRecord)
                .map((record) => (
                  <PrBadge key={record.targetMeters} record={record} />
                ))}
            </div>
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

          <p className="max-w-xs text-xs leading-relaxed text-muted">
            O card animado pra compartilhar essa corrida chega depois que o pipeline de tracking
            estiver validado em corridas reais.{" "}
            <Link href="/compartilhar" className="text-accent underline underline-offset-2">
              Ver a prévia do formato
            </Link>
            .
          </p>
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
