"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardTitle, delay, ExampleBadge, NoticeBadge, Screen, ScreenHeader } from "../ui";
import { SCENARIOS, ShareCard, type ScenarioId } from "../share-card";
import { ShareCardPreview } from "../share-card-preview";
import { useShareSupport } from "@/lib/share";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import { usePreferences } from "@/lib/usePreferences";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { computeAchievement } from "@/lib/tracking/achievements";
import { computeRunRecords } from "@/lib/tracking/personalRecords";
import {
  buildShareCardScene,
  scenarioForRun,
  SHARE_CARD_DURATION_MS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  drawShareCardFrame,
  type ShareCardLayout,
  type ShareCardMusicMode,
  type ShareCardScene,
} from "@/lib/shareCard/renderer";
import { buildShareCardVideoFile, canRecordShareVideo } from "@/lib/shareCard/video";
import { buildShareCardPngFile, downloadFile } from "@/lib/shareCard/image";
import {
  listCompletedRuns,
  listShoes,
  runMovingSeconds,
  type CompletedRun,
  type Shoe,
} from "@/lib/tracking/storage";

/**
 * Where the shareable card gets set up.
 *
 * Everything on this screen is real once there's a run in the history: the
 * preview is the actual canvas renderer painting the athlete's own trace and
 * numbers. A static PNG (built off the same renderer's final frame) is the
 * primary way to get the card out — instant, works everywhere a canvas
 * does, posts to a feed and not just a story — with the recorded, animated
 * video kept as a secondary option for whoever specifically wants that. With
 * no runs recorded yet it falls back to the illustrative composition on
 * invented numbers, clearly labeled.
 */

const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

const NO_RUN_TEXT = "Fui correr 🏃 — Xanthus";

interface TemplateOption {
  id: string;
  layout: ShareCardLayout;
  musicMode: ShareCardMusicMode;
  label: string;
  hint: string;
}

const LAYOUTS: { id: ShareCardLayout; label: string }[] = [
  { id: "trajeto", label: "Trajeto" },
  { id: "numero", label: "Número" },
];

const MUSIC_MODES: { id: ShareCardMusicMode; label: string; hint: string; requiresTrack: boolean }[] = [
  { id: "none", label: "Foto", hint: "sua foto ou cenário", requiresTrack: false },
  { id: "chip", label: "Foto + música", hint: "com o que tocou", requiresTrack: true },
  { id: "background", label: "Música", hint: "capa do álbum de fundo", requiresTrack: true },
];

/** Every template combo worth swiping through — `trajeto`/`número` crossed with the background source, skipping the music variants when the run has nothing playing to show. */
function buildTemplateOptions(hasTrack: boolean): TemplateOption[] {
  const options: TemplateOption[] = [];
  for (const layout of LAYOUTS) {
    for (const music of MUSIC_MODES) {
      if (music.requiresTrack && !hasTrack) continue;
      options.push({
        id: `${layout.id}-${music.id}`,
        layout: layout.id,
        musicMode: music.id,
        label: `${layout.label} · ${music.label}`,
        hint: music.hint,
      });
    }
  }
  return options;
}

/** One swipeable card in the template row — a real, once-drawn static frame of that exact combo over the athlete's own data, not a generic icon standing in for it. */
function TemplateThumb({
  scene,
  active,
  onClick,
}: {
  scene: ShareCardScene;
  active: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawShareCardFrame(ctx, scene, SHARE_CARD_DURATION_MS);
  }, [scene]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`block shrink-0 snap-center overflow-hidden rounded-2xl border-2 transition-colors ${
        active ? "border-accent" : "border-border"
      }`}
      style={{ width: 128, aspectRatio: `${SHARE_CARD_WIDTH} / ${SHARE_CARD_HEIGHT}` }}
    >
      <canvas
        ref={canvasRef}
        width={SHARE_CARD_WIDTH}
        height={SHARE_CARD_HEIGHT}
        className="block h-full w-full"
      />
    </button>
  );
}

/**
 * `?run=<id>` — set when opened from a specific run's own detail screen
 * (see historico/detalhe/run-detail.tsx's share button) so that run gets
 * shared instead of always defaulting to the most recent one. A query
 * param rather than a dynamic segment for the same reason /historico/detalhe
 * uses one: run ids are generated per-device in IndexedDB, so there is no
 * static list to give a static export.
 */
export default function CompartilharPage() {
  return (
    <Suspense fallback={null}>
      <CompartilharContent />
    </Suspense>
  );
}

function CompartilharContent() {
  const requestedRunId = useSearchParams().get("run");
  const [scenario, setScenario] = useState<ScenarioId | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [albumArt, setAlbumArt] = useState<HTMLImageElement | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [shoes, setShoes] = useState<Shoe[] | null>(null);
  const [shoeId, setShoeId] = useState<string | null>(null);
  const [runs, setRuns] = useState<CompletedRun[] | null>(null);
  const shareSupport = useShareSupport();
  const reducedMotion = usePrefersReducedMotion();
  const [preferences] = usePreferences();
  const [copied, setCopied] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  useEffect(() => {
    listShoes().then(setShoes);
    listCompletedRuns().then(setRuns);
  }, []);

  const run = useMemo(() => {
    if (!runs) return null;
    const requested = requestedRunId ? runs.find((r) => r.id === requestedRunId) : null;
    return requested ?? [...runs].sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
  }, [runs, requestedRunId]);

  /** The most recently logged track for this run — a run can have several; the last one is the closest thing to "what was playing when I finished." */
  const track = useMemo(() => {
    const tracks = run?.tracks;
    if (!tracks || tracks.length === 0) return null;
    return [...tracks].sort((a, b) => b.playedAt - a.playedAt)[0];
  }, [run]);

  // The canvas needs a decoded bitmap, not a URL — same reasoning as the
  // photo decode below. Cross-origin (the iTunes artwork CDN) needs
  // crossOrigin set before `src`, or the canvas that later draws it is
  // "tainted" and can never be exported to a blob.
  useEffect(() => {
    if (!track?.artworkUrl) {
      // Clears stale art from a previous run/track — nothing to derive this
      // from other than "the thing this effect exists to load is gone."
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAlbumArt(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!cancelled) setAlbumArt(image);
    };
    image.onerror = () => {
      if (!cancelled) setAlbumArt(null);
    };
    image.src = track.artworkUrl;
    return () => {
      cancelled = true;
    };
  }, [track?.artworkUrl]);

  /** Defaults to the sky matching the hour the run actually started at, until the athlete picks another. */
  const activeScenario = scenario ?? (run ? scenarioForRun(run) : "madrugada");

  const shoe = shoes?.find((s) => s.id === shoeId) ?? null;

  const templates = useMemo(() => buildTemplateOptions(!!track), [track]);
  const activeTemplate = templates.find((t) => t.id === templateId) ?? templates[0];

  // One scene per swipeable template — cheap (a single object each, the
  // expensive part is the canvas draw the thumbnails and the big preview do
  // on their own), and it's what lets every thumbnail show the athlete's
  // real data instead of a generic icon standing in for the combo.
  const scenes = useMemo(() => {
    if (!run || !runs) return [];
    const headline =
      computeRunRecords(run, runs)
        .filter((record) => record.isNewRecord)
        .sort((a, b) => b.targetMeters - a.targetMeters)[0] ?? null;
    const record = headline
      ? { label: headline.label, achievement: computeAchievement(run.id, headline) }
      : null;
    const sharedShoe = shoe ? { name: shoe.name, color: shoe.color } : null;
    const sharedTrack = track ? { name: track.name, artist: track.artist } : null;

    return templates
      .map((t) => {
        const built = buildShareCardScene({
          run,
          scenario: activeScenario,
          layout: t.layout,
          unit: preferences.distanceUnit,
          photo,
          shoe: sharedShoe,
          record,
          track: sharedTrack,
          musicMode: t.musicMode,
          albumArt,
        });
        return { id: t.id, scene: built.projected.length >= 2 ? built : null };
      })
      .filter((entry): entry is { id: string; scene: ShareCardScene } => entry.scene !== null);
  }, [run, runs, activeScenario, preferences.distanceUnit, photo, shoe, track, albumArt, templates]);

  const scene = scenes.find((s) => s.id === activeTemplate?.id)?.scene ?? scenes[0]?.scene ?? null;

  const shareText = useMemo(() => {
    if (!run) return NO_RUN_TEXT;
    const unit = preferences.distanceUnit;
    const seconds = runMovingSeconds(run);
    const pace =
      run.distanceMeters > 0 ? formatAveragePace(run.distanceMeters, seconds, unit) : null;
    return `Corri ${formatDistance(run.distanceMeters, unit)} ${unitLabel(unit)} em ${formatElapsed(seconds)}${
      pace !== null ? ` (${pace} ${paceLabel(unit)})` : ""
    } 🏃 — Xanthus`;
  }, [run, preferences.distanceUnit]);

  /**
   * Shares a file, retrying once without `url` if the device rejects the
   * full payload — `canShare` saying yes doesn't guarantee `share` actually
   * succeeds with files+text+url together, a known Android quirk. Returns
   * true once the sheet has genuinely been handed the file (or the user
   * cancelled it themselves), false if it should fall back to something else.
   */
  async function shareFileWithFallback(file: File, text: string, url: string): Promise<boolean> {
    const withUrl = navigator.canShare?.({ files: [file], text, url }) ?? false;
    try {
      await navigator.share(withUrl ? { files: [file], text, url } : { files: [file], text });
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return true;
      if (withUrl) {
        try {
          await navigator.share({ files: [file], text });
          return true;
        } catch (retryErr) {
          if (retryErr instanceof Error && retryErr.name === "AbortError") return true;
        }
      }
      return false;
    }
  }

  async function handleDownloadImage() {
    if (!scene || imageBusy) return;
    setImageBusy(true);
    setShareNotice(null);
    try {
      const file = await buildShareCardPngFile(scene);
      if (!file) {
        setShareNotice("Não deu pra gerar a imagem dessa vez — tenta de novo.");
        return;
      }
      if (shareSupport === "share" && navigator.canShare?.({ files: [file] })) {
        const ok = await shareFileWithFallback(file, shareText, window.location.origin);
        if (ok) return;
      }
      downloadFile(file);
    } finally {
      setImageBusy(false);
    }
  }

  async function handleShareVideo() {
    if (videoProgress !== null) return;
    setShareNotice(null);
    const url = window.location.origin;

    if (scene && shareSupport === "share" && !reducedMotion && canRecordShareVideo()) {
      setVideoProgress(0);
      try {
        let lastShown = 0;
        const file = await buildShareCardVideoFile(scene, {
          onProgress: (fraction) => {
            if (fraction - lastShown < 0.05 && fraction < 1) return;
            lastShown = fraction;
            setVideoProgress(fraction);
          },
        });
        if (file) {
          const ok = await shareFileWithFallback(file, shareText, url);
          if (!ok) {
            setShareNotice(
              "O aparelho recusou compartilhar o vídeo — tenta de novo, ou baixa a imagem acima.",
            );
          }
          return;
        }
        setShareNotice("Não deu pra gerar o vídeo dessa vez.");
      } catch {
        setShareNotice("Não deu pra gerar o vídeo dessa vez.");
      } finally {
        setVideoProgress(null);
      }
      return;
    }

    if (shareSupport === "share") {
      try {
        await navigator.share({ text: shareText, url });
      } catch {
        // Cancelled or blocked — no error state, the sheet closing is feedback enough.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${shareText} — ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions, insecure context) — nothing else to fall back to here.
    }
  }

  // Revokes the *previous* object URL whenever it's replaced or the screen
  // unmounts — the cleanup closes over the value from the render it belongs
  // to, so this never revokes the URL that's actually in use.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  // The canvas needs a decoded bitmap, not a URL, and it needs it before the
  // first frame is painted — a half-loaded image draws as nothing at all.
  useEffect(() => {
    if (!photoUrl) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setPhoto(image);
    };
    image.onerror = () => {
      if (!cancelled) setPhoto(null);
    };
    image.src = photoUrl;
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhoto(null);
    setPhotoUrl(URL.createObjectURL(file));
  }

  const showVideoOption =
    !!scene && shareSupport === "share" && !reducedMotion && canRecordShareVideo();

  const imageButtonLabel = imageBusy
    ? "Gerando imagem…"
    : shareSupport === "share"
      ? "Compartilhar imagem"
      : "Baixar imagem";

  const videoButtonLabel =
    videoProgress !== null ? `Gerando vídeo… ${Math.round(videoProgress * 100)}%` : "Compartilhar vídeo animado";

  return (
    <>
      <div className="px-5 pt-6">
        <div className="mx-auto w-full max-w-md">
          <Link href="/perfil" className="text-sm text-muted hover:text-foreground">
            &larr; Perfil
          </Link>
        </div>
      </div>

      <ScreenHeader
        title="Card pra compartilhar"
        badge={scene ? <NoticeBadge>corrida de verdade</NoticeBadge> : <ExampleBadge>prévia estática</ExampleBadge>}
        subtitle={
          scene
            ? "Arrasta pra escolher o template — a imagem sai pronta, na hora."
            : "Como a corrida vira card. Grave uma corrida pra ver a sua aqui."
        }
      />

      <Screen>
        <div className="pr-enter mx-auto w-full max-w-[300px]" style={delay(80)}>
          {scene ? (
            <ShareCardPreview scene={scene} />
          ) : (
            <ShareCard scenario={activeScenario} photoUrl={photoUrl ?? undefined} />
          )}
        </div>

        <p className="pr-enter text-center text-xs leading-relaxed text-muted" style={delay(140)}>
          {scene
            ? "Traçado, distância, tempo e pace acima são dessa corrida."
            : "Percurso, distância, tempo e pace acima são de demonstração — não são de nenhuma corrida real."}
        </p>

        {scenes.length > 0 && (
          <div className="pr-enter" style={delay(155)}>
            <p className="mb-2 px-1 text-xs font-semibold tracking-[0.14em] text-muted uppercase">
              Template
            </p>
            <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
              {scenes.map(({ id, scene: templateScene }) => (
                <TemplateThumb
                  key={id}
                  scene={templateScene}
                  active={id === activeTemplate?.id}
                  onClick={() => setTemplateId(id)}
                />
              ))}
            </div>
            <p className="mt-2 px-1 text-xs text-muted">{activeTemplate?.hint}</p>
          </div>
        )}

        <Card className="pr-enter" style={delay(185)}>
          <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>Sua foto</CardTitle>
          <p className="text-xs leading-relaxed text-muted text-pretty">
            Suba uma foto da sua corrida pra usar como fundo do card, no lugar de um cenário
            desenhado. Vale pros templates de foto — o de música usa a capa do álbum.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label
              htmlFor="share-photo-input"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-accent"
            >
              {photoUrl ? "Trocar foto" : "Escolher foto"}
            </label>
            <input
              id="share-photo-input"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handlePhotoChange}
            />
            {photoUrl && (
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  setPhotoUrl(null);
                }}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-muted transition-colors hover:border-warn hover:text-warn"
              >
                Remover foto
              </button>
            )}
          </div>
        </Card>

        <Card className={`pr-enter ${photoUrl ? "opacity-50" : ""}`} style={delay(200)}>
          <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>
            Cenário de fundo
          </CardTitle>
          {photoUrl && (
            <p className="mb-3 text-xs text-muted">
              Desativado enquanto uma foto está selecionada.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {SCENARIO_IDS.map((id) => (
              <button
                key={id}
                type="button"
                disabled={!!photoUrl}
                onClick={() => setScenario(id)}
                aria-pressed={activeScenario === id}
                className={`min-h-14 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  activeScenario === id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-foreground hover:border-accent disabled:hover:border-border"
                }`}
              >
                <span className="block">{SCENARIOS[id].label}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-muted">
                  {SCENARIOS[id].hint}
                </span>
              </button>
            ))}
          </div>
        </Card>

        {shoes && shoes.length > 0 && (
          <Card className="pr-enter" style={delay(215)}>
            <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>
              Tênis em destaque
            </CardTitle>
            <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
              Escolha um dos tênis que você registrou pra ele flutuar no card, na cor que você
              cadastrou. Numa corrida que bateu recorde, a medalha entra no lugar dele.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShoeId(null)}
                aria-pressed={shoeId === null}
                className={`min-h-14 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  shoeId === null
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-foreground hover:border-accent"
                }`}
              >
                <span className="block">Nenhum</span>
                <span className="mt-0.5 block text-[11px] font-normal text-muted">
                  card sem tênis
                </span>
              </button>
              {shoes.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setShoeId(option.id)}
                  aria-pressed={shoeId === option.id}
                  className={`flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    shoeId === option.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-background text-foreground hover:border-accent"
                  }`}
                >
                  <span
                    aria-hidden
                    style={{ backgroundColor: option.color }}
                    className="h-5 w-5 shrink-0 rounded-full border border-border"
                  />
                  <span className="min-w-0">
                    {option.brand && (
                      <span className="block truncate text-[11px] font-normal text-muted">
                        {option.brand}
                      </span>
                    )}
                    <span className="block truncate">{option.name}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <button
          type="button"
          onClick={handleDownloadImage}
          disabled={imageBusy || !scene}
          aria-live="polite"
          className="pr-enter min-h-14 w-full rounded-full bg-accent px-6 py-4 text-base font-semibold text-accent-foreground disabled:cursor-progress disabled:opacity-60"
          style={delay(260)}
        >
          {scene ? imageButtonLabel : copied ? "Link copiado!" : "Compartilhar"}
        </button>

        {showVideoOption && (
          <button
            type="button"
            onClick={handleShareVideo}
            disabled={videoProgress !== null}
            aria-live="polite"
            className="pr-enter relative -mt-2 min-h-11 w-full overflow-hidden rounded-full border border-border px-6 py-2.5 text-sm font-medium text-muted disabled:cursor-progress"
            style={delay(275)}
          >
            {videoProgress !== null && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-accent/15 transition-[width] duration-200 ease-linear"
                style={{ width: `${Math.round(videoProgress * 100)}%` }}
              />
            )}
            <span className="relative">{videoButtonLabel}</span>
          </button>
        )}

        {shareNotice && (
          <p className="-mt-2 text-center text-xs leading-relaxed text-warn" role="status">
            {shareNotice}
          </p>
        )}
        <p className="pr-enter -mt-2 text-center text-xs leading-relaxed text-muted" style={delay(290)}>
          {!scene
            ? "Sem corrida gravada ainda, vai só o texto e o link."
            : shareSupport === "share"
              ? "Abre o menu do aparelho com a imagem pronta — WhatsApp, Instagram e Facebook aparecem ali como destino."
              : "Esse navegador não abre o menu nativo de compartilhar — a imagem baixa direto, poste de onde quiser."}
        </p>
      </Screen>
    </>
  );
}
