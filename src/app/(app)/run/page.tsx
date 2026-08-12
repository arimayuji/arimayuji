"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRunTracker } from "@/lib/tracking/useRunTracker";
import { formatDistanceKm, formatElapsed, formatPace } from "@/lib/tracking/geoFilter";
import { listCompletedRuns, summarizeShoes } from "@/lib/tracking/storage";
import { ANNOUNCE_OPTIONS, announceLabel } from "@/lib/preferences";
import { usePreferences } from "@/lib/usePreferences";
import { useNowPlayingDuringRun } from "@/lib/spotify/useNowPlayingDuringRun";
import { useImmersiveMode } from "../app-shell";

const GPS_LABEL: Record<string, { label: string; className: string }> = {
  searching: { label: "Procurando sinal", className: "bg-bad" },
  weak: { label: "Sinal fraco", className: "bg-warn" },
  good: { label: "Sinal bom", className: "bg-good" },
};

function GpsDot({ quality }: { quality: string }) {
  const info = GPS_LABEL[quality] ?? GPS_LABEL.searching;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
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
  const { state, start, pause, resume, finish, reset } = useRunTracker();
  const [goalKm, setGoalKm] = useState("5");
  const [goalMinutes, setGoalMinutes] = useState("");
  const [shoeName, setShoeName] = useState("");
  const [shoeSuggestions, setShoeSuggestions] = useState<string[]>([]);

  /** Previously used shoe names, for the datalist below — no separate "add a shoe" flow needed. */
  useEffect(() => {
    listCompletedRuns().then((runs) => {
      setShoeSuggestions(summarizeShoes(runs).map((s) => s.name));
    });
  }, []);

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
   * `paused` counts as active here (unlike immersive mode above) so a
   * pause/resume cycle doesn't look like a new run starting and wipe the
   * tracks already collected — the reset only happens explicitly, once, in
   * `handleStart` below.
   */
  const { tracks: spotifyTracks, reset: resetSpotifyTracks } = useNowPlayingDuringRun(
    state.status === "tracking" || state.status === "paused",
  );

  const handleStart = () => {
    resetSpotifyTracks();
    const distanceMeters = goalKm ? Number(goalKm) * 1000 : undefined;
    const durationSeconds = goalMinutes ? Number(goalMinutes) * 60 : undefined;
    start({
      announceIntervalMeters: announceMeters,
      goal: distanceMeters ? { distanceMeters, durationSeconds } : undefined,
    });
  };

  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          &larr; Pegasus Run
        </Link>
        {state.status !== "idle" && <GpsDot quality={state.gpsQuality} />}
      </header>

      {state.status === "idle" && (
        <main className="flex flex-1 flex-col justify-center gap-8 px-6 pb-16">
          <div className="mx-auto w-full max-w-sm space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-balance">Preparar corrida</h1>
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

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Aviso por voz a cada</span>
              <div className="flex gap-2">
                {ANNOUNCE_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updatePreferences({ announceIntervalMeters: m })}
                    className={`flex-1 rounded-lg border px-3 py-3 text-sm font-medium transition-colors ${
                      announceMeters === m
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface text-foreground hover:border-accent"
                    }`}
                  >
                    {announceLabel(m)}
                  </button>
                ))}
              </div>
            </label>

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

            <button
              type="button"
              onClick={handleStart}
              className="w-full rounded-full bg-accent px-6 py-4 text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Iniciar corrida
            </button>

            {state.error && <p className="text-sm text-bad">{state.error}</p>}
          </div>
        </main>
      )}

      {state.status === "warming" && (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="h-3 w-3 animate-pulse rounded-full bg-warn" />
          <p className="text-lg font-medium">Procurando GPS&hellip;</p>
          <p className="max-w-xs text-sm text-muted">
            Fique a céu aberto. O cronômetro começa assim que o sinal ficar estável.
          </p>
          <button type="button" onClick={reset} className="mt-4 text-sm text-muted underline">
            Cancelar
          </button>
        </main>
      )}

      {(state.status === "tracking" || state.status === "paused") && (
        <main className="flex flex-1 flex-col px-6 pb-10">
          <div className="flex flex-1 flex-col items-center justify-center gap-1">
            <span className="font-mono text-7xl font-semibold tabular-nums">
              {formatPace(state.currentPaceSecPerKm)}
            </span>
            <span className="text-sm text-muted">min/km</span>
          </div>

          <div className="grid grid-cols-2 gap-4 py-6">
            <div className="rounded-xl border border-border bg-surface p-4">
              <span className="text-xs uppercase tracking-wide text-muted">Distância</span>
              <p className="mt-1 font-mono text-2xl tabular-nums">
                {formatDistanceKm(state.distanceMeters)} <span className="text-base text-muted">km</span>
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <span className="text-xs uppercase tracking-wide text-muted">Tempo</span>
              <p className="mt-1 font-mono text-2xl tabular-nums">{formatElapsed(state.elapsedSeconds)}</p>
            </div>
            {state.goal?.distanceMeters && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <span className="text-xs uppercase tracking-wide text-muted">Chegada prevista em</span>
                <p className="mt-1 font-mono text-2xl tabular-nums">
                  {formatGoalEta(state.forecastSecondsRemaining)}
                </p>
              </div>
            )}
            {state.paceNeededSecPerKm !== null && (
              <div className="rounded-xl border border-border bg-surface p-4">
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
                className="flex-1 rounded-full border border-border py-4 text-base font-semibold hover:border-accent"
              >
                Pausar
              </button>
            ) : (
              <button
                type="button"
                onClick={resume}
                className="flex-1 rounded-full border border-accent py-4 text-base font-semibold text-accent"
              >
                Retomar
              </button>
            )}
            <button
              type="button"
              onClick={() => finish({ tracks: spotifyTracks, shoeName })}
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
          <div className="grid w-full max-w-xs grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <span className="text-xs uppercase tracking-wide text-muted">Tempo</span>
              <p className="mt-1 font-mono text-xl tabular-nums">
                {formatElapsed(
                  Math.round((state.finishedRun.finishedAt - state.finishedRun.startedAt) / 1000),
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <span className="text-xs uppercase tracking-wide text-muted">Pace médio</span>
              <p className="mt-1 font-mono text-xl tabular-nums">
                {formatPace(
                  state.finishedRun.distanceMeters > 0
                    ? ((state.finishedRun.finishedAt - state.finishedRun.startedAt) / 1000 /
                        state.finishedRun.distanceMeters) *
                        1000
                    : null,
                )}
              </p>
            </div>
          </div>
          {state.finishedRun.shoeName && (
            <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 text-left">
              <span className="text-xs uppercase tracking-wide text-muted">Tênis</span>
              <p className="mt-1 text-sm font-medium">{state.finishedRun.shoeName}</p>
            </div>
          )}
          {state.finishedRun.tracks && state.finishedRun.tracks.length > 0 && (
            <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-4 text-left">
              <span className="text-xs uppercase tracking-wide text-muted">
                Trilha sonora da corrida
              </span>
              <ul className="mt-2 flex flex-col gap-1.5">
                {state.finishedRun.tracks.map((track, i) => (
                  <li key={i} className="truncate text-sm">
                    {track.name} <span className="text-muted">— {track.artist}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="max-w-xs text-xs leading-relaxed text-muted">
            O card animado pra compartilhar essa corrida chega depois que o pipeline de tracking
            estiver validado em corridas reais.{" "}
            <Link href="/compartilhar" className="text-accent underline underline-offset-2">
              Ver a prévia do formato
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground"
          >
            Nova corrida
          </button>
        </main>
      )}
    </div>
  );
}
