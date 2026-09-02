"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, Screen, ScreenHeader, SPAN_COLUMNS } from "../../ui";
import { Readout } from "../../route-replay";
import { usePreferences } from "@/lib/usePreferences";
import type { DistanceUnit } from "@/lib/preferences";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { buildReplayTimeline, replayFrameAt, type ReplayTimeline } from "@/lib/tracking/replay";
import { getCompletedRun, type CompletedRun } from "@/lib/tracking/storage";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";

/**
 * A HUD (distância/tempo/ritmo, updating live like a car speedometer) laid
 * over a video the athlete recorded on their OWN device during the run —
 * smart glasses, a chest cam, whatever — not anything captured through this
 * app. There's no shared clock between the two recordings, so the one thing
 * this screen actually has to solve is calibration: the athlete scrubs the
 * video to the exact moment they started running and marks it, which is
 * enough to map any later point in the video back to "how far into the run
 * was this" via `replayFrameAt` — the same timeline math `RouteReplay`
 * already uses to drive its own scrubber, just fed by the video element's
 * real playback clock (`timeupdate`) instead of a synthetic
 * `requestAnimationFrame` one.
 *
 * v1 is playback-only: watch the import with the HUD live on top. Baking the
 * HUD into an exportable video (reusing `shareCard/video.ts`'s
 * `MediaRecorder` pipeline) is a real follow-up, but re-encoding a whole
 * run's worth of footage client-side on a phone is a big enough unknown
 * (memory, time, file size) that it deserves its own pass rather than
 * riding along with this one.
 */

const MARK_HELP =
  "Pausa o vídeo bem no instante em que você começou a correr, depois toca no botão abaixo.";

export default function VideoHudPage() {
  return (
    <Suspense fallback={null}>
      <VideoHudContent />
    </Suspense>
  );
}

function VideoHudContent() {
  useHeaderClose("/perfil?tab=progresso");
  const runId = useSearchParams().get("run");
  const [prefs] = usePreferences();
  const [load, setLoad] = useState<{ status: "loading" } | { status: "not-found" } | { status: "ready"; run: CompletedRun }>(
    () => (runId ? { status: "loading" } : { status: "not-found" }),
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  /** Seconds into the *video's own* timeline that lines up with the run's own t=0 — null until the athlete marks it. */
  const [markSeconds, setMarkSeconds] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoTime, setVideoTime] = useState(0);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    getCompletedRun(runId).then((run) => {
      if (cancelled) return;
      setLoad(run ? { status: "ready", run } : { status: "not-found" });
    });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  function handlePickVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setVideoUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setMarkSeconds(null);
  }

  const handleMark = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setMarkSeconds(video.currentTime);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setVideoTime(video.currentTime);
  }, []);

  // Called unconditionally (before the early returns below) since hooks
  // can't be conditional — `load.status !== "ready"` just means an empty
  // points array, which `buildReplayTimeline` already treats as "nothing
  // to build a timeline from" and returns `null` for on its own.
  const timeline: ReplayTimeline | null = useMemo(
    () => buildReplayTimeline(load.status === "ready" ? load.run.points : []),
    [load],
  );

  if (load.status === "loading") {
    return (
      <Screen>
        <Card className={`animate-pulse lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${SPAN_COLUMNS}`}>
          <div className="h-48 rounded-xl bg-border/70" />
        </Card>
      </Screen>
    );
  }

  if (load.status === "not-found") {
    return (
      <Screen>
        <Card className={`lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${SPAN_COLUMNS}`}>
          <CardTitle>Corrida não encontrada</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Esse registro não existe mais neste aparelho — pode já ter sido excluído.
          </p>
          <Link
            href="/perfil?tab=progresso"
            className="pr-press mt-4 flex w-full items-center justify-center rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-accent hover:text-foreground active:scale-[0.98]"
          >
            Voltar pro progresso
          </Link>
        </Card>
      </Screen>
    );
  }

  return (
    <>
      <ScreenHeader title="Vídeo sincronizado" />
      <Screen singleColumn>
        {!timeline ? (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(30)}>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Essa corrida não tem rota registrada o bastante pra sincronizar com um vídeo.
            </p>
          </Card>
        ) : !videoUrl ? (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(30)}>
            <CardTitle>Escolher vídeo</CardTitle>
            <p className="mb-4 text-sm leading-relaxed text-muted text-pretty">
              Qualquer vídeo do aparelho — o app nunca grava nada por conta própria aqui, só sobrepõe os
              números da corrida em cima do que você já gravou.
            </p>
            <label className="pr-press flex w-full items-center justify-center rounded-xl border border-border bg-background py-3 text-sm font-semibold hover:border-accent active:scale-[0.98]">
              Escolher vídeo do aparelho
              <input type="file" accept="video/*" className="hidden" onChange={handlePickVideo} />
            </label>
          </Card>
        ) : (
          <VideoHudPlayer
            videoUrl={videoUrl}
            videoRef={videoRef}
            timeline={timeline}
            markSeconds={markSeconds}
            videoTime={videoTime}
            unit={prefs.distanceUnit}
            onTimeUpdate={handleTimeUpdate}
            onMark={handleMark}
            onRecalibrate={() => setMarkSeconds(null)}
            onChangeVideo={() => {
              setVideoUrl((current) => {
                if (current) URL.revokeObjectURL(current);
                return null;
              });
              setMarkSeconds(null);
            }}
          />
        )}
      </Screen>
    </>
  );
}

function VideoHudPlayer({
  videoUrl,
  videoRef,
  timeline,
  markSeconds,
  videoTime,
  unit,
  onTimeUpdate,
  onMark,
  onRecalibrate,
  onChangeVideo,
}: {
  videoUrl: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  timeline: ReplayTimeline;
  markSeconds: number | null;
  videoTime: number;
  unit: DistanceUnit;
  onTimeUpdate: () => void;
  onMark: () => void;
  onRecalibrate: () => void;
  onChangeVideo: () => void;
}) {
  const elapsedFromMark = markSeconds === null ? null : videoTime - markSeconds;
  const inRange = elapsedFromMark !== null && elapsedFromMark >= 0 && elapsedFromMark <= timeline.totalSeconds;
  const frame = inRange ? replayFrameAt(timeline, elapsedFromMark / timeline.totalSeconds) : null;

  return (
    <Card className="pr-enter overflow-hidden lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(30)}>
      <div className="relative -mx-5 -mt-5 mb-4 bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          onTimeUpdate={onTimeUpdate}
          className="block w-full"
        />

        {frame && (
          <div className="dark pointer-events-none absolute inset-x-0 top-0 flex items-start gap-4 bg-gradient-to-b from-black/80 via-black/50 to-transparent px-4 pt-3 pb-8">
            <Readout label="Distância" value={formatDistance(frame.meters, unit)} unit={unitLabel(unit)} />
            <Readout label="Tempo" value={formatElapsed(Math.round(frame.seconds))} />
            <Readout
              label="Ritmo agora"
              value={formatAveragePace(frame.windowMeters, frame.windowSeconds, unit)}
              unit={paceLabel(unit)}
            />
          </div>
        )}
      </div>

      {markSeconds === null ? (
        <>
          <p className="mb-3 text-sm leading-relaxed text-muted text-pretty">{MARK_HELP}</p>
          <button
            type="button"
            onClick={onMark}
            className="pr-press w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground hover:opacity-90 active:scale-[0.98]"
          >
            Marcar esse instante como o início da corrida
          </button>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs leading-relaxed text-muted text-pretty">
            {inRange
              ? "Números ao vivo, sincronizados com esse trecho do vídeo."
              : "Fora do trecho da corrida — os números somem até o vídeo chegar nesse intervalo."}
          </p>
          <button
            type="button"
            onClick={onRecalibrate}
            className="pr-press shrink-0 rounded-full border border-border px-3.5 py-2 text-xs font-semibold hover:border-accent active:scale-95"
          >
            Recalibrar
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onChangeVideo}
        className="pr-press mt-3 w-full rounded-xl border border-border py-2.5 text-xs font-medium text-muted hover:border-accent hover:text-foreground active:scale-[0.98]"
      >
        Trocar vídeo
      </button>
    </Card>
  );
}
