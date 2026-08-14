"use client";

import { Suspense, useEffect, useMemo, useState, type ChangeEvent } from "react";
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
import { buildShareCardScene, scenarioForRun, type ShareCardLayout } from "@/lib/shareCard/renderer";
import { buildShareCardVideoFile, canRecordShareVideo } from "@/lib/shareCard/video";
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
 * numbers, and the button records that exact animation to a video file and
 * hands it to the share sheet. With no runs recorded yet it falls back to the
 * illustrative composition on invented numbers, clearly labeled — a scenario
 * picker you can play with before your first run is still worth having.
 */

const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

const NO_RUN_TEXT = "Fui correr 🏃 — Xanthus";

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
  const [layout, setLayout] = useState<ShareCardLayout>("trajeto");
  const [scenario, setScenario] = useState<ScenarioId | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [shoes, setShoes] = useState<Shoe[] | null>(null);
  const [shoeId, setShoeId] = useState<string | null>(null);
  const [runs, setRuns] = useState<CompletedRun[] | null>(null);
  const shareSupport = useShareSupport();
  const reducedMotion = usePrefersReducedMotion();
  const [preferences] = usePreferences();
  const [copied, setCopied] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
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

  /** Defaults to the sky matching the hour the run actually started at, until the athlete picks another. */
  const activeScenario = scenario ?? (run ? scenarioForRun(run) : "madrugada");

  const shoe = shoes?.find((s) => s.id === shoeId) ?? null;

  const scene = useMemo(() => {
    if (!run || !runs) return null;
    const headline =
      computeRunRecords(run, runs)
        .filter((record) => record.isNewRecord)
        .sort((a, b) => b.targetMeters - a.targetMeters)[0] ?? null;

    const built = buildShareCardScene({
      run,
      scenario: activeScenario,
      layout,
      unit: preferences.distanceUnit,
      photo,
      shoe: shoe ? { name: shoe.name, color: shoe.color } : null,
      record: headline
        ? { label: headline.label, achievement: computeAchievement(run.id, headline) }
        : null,
    });
    return built.projected.length >= 2 ? built : null;
  }, [run, runs, activeScenario, layout, preferences.distanceUnit, photo, shoe]);

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

  async function handleShare() {
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
          const payload = navigator.canShare({ files: [file], text: shareText, url })
            ? { files: [file], text: shareText, url }
            : { files: [file], text: shareText };
          try {
            await navigator.share(payload);
          } catch (shareErr) {
            // AbortError is the user cancelling the sheet themselves — not a failure worth surfacing.
            if (shareErr instanceof Error && shareErr.name !== "AbortError") {
              setShareNotice(
                "O aparelho recusou compartilhar o vídeo — tenta de novo, ou copia o link abaixo.",
              );
            }
          }
          return;
        }
        // buildShareCardVideoFile resolved to null: recording produced no usable
        // file (blocked codec, zero-byte capture, canShare rejected the result).
        // Falling through silently here is exactly what read as "diz que gera e
        // não gera nada" — say so instead of pretending the text fallback below
        // was what was asked for.
        setShareNotice("Não deu pra gerar o vídeo dessa vez — compartilhando só o texto.");
      } catch {
        setShareNotice("Não deu pra gerar o vídeo dessa vez — compartilhando só o texto.");
      } finally {
        setVideoProgress(null);
      }
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

  const buttonLabel =
    videoProgress !== null
      ? `Gerando vídeo… ${Math.round(videoProgress * 100)}%`
      : copied
        ? "Link copiado!"
        : shareSupport === "clipboard"
          ? "Copiar link pra compartilhar"
          : scene
            ? "Compartilhar vídeo da corrida"
            : "Compartilhar";

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
            ? "Sua última corrida, do jeito que ela vira vídeo pro status."
            : "Como a corrida vira card. Grave uma corrida pra ver a sua aqui."
        }
      />

      <Screen>
        <div className="pr-enter mx-auto w-full max-w-[300px]" style={delay(80)}>
          {scene ? (
            <ShareCardPreview scene={scene} />
          ) : (
            <ShareCard
              scenario={activeScenario}
              layout={layout}
              photoUrl={photoUrl ?? undefined}
              shoe={shoe ? { name: shoe.name, color: shoe.color } : undefined}
            />
          )}
        </div>

        <p className="pr-enter text-center text-xs leading-relaxed text-muted" style={delay(140)}>
          {scene
            ? "Traçado, distância, tempo e pace acima são dessa corrida — o vídeo compartilhado é exatamente essa animação."
            : "Percurso, distância, tempo e pace acima são de demonstração — não são de nenhuma corrida real."}
        </p>

        <Card className="pr-enter" style={delay(155)}>
          <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>Estilo do card</CardTitle>
          <p className="text-xs leading-relaxed text-muted text-pretty">
            Trajeto mostra o mapinha da corrida. Número deixa a distância gigante, ocupando o
            centro do card.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                { id: "trajeto" as const, label: "Trajeto", hint: "mapa + números" },
                { id: "numero" as const, label: "Número", hint: "número em destaque" },
              ]
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setLayout(option.id)}
                aria-pressed={layout === option.id}
                className={`min-h-14 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  layout === option.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-foreground hover:border-accent"
                }`}
              >
                <span className="block">{option.label}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-muted">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="pr-enter" style={delay(185)}>
          <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>Sua foto</CardTitle>
          <p className="text-xs leading-relaxed text-muted text-pretty">
            Suba uma foto da sua corrida pra usar como fundo do card, no lugar de um cenário
            desenhado.
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
          onClick={handleShare}
          disabled={videoProgress !== null}
          aria-live="polite"
          className="pr-enter relative min-h-14 w-full overflow-hidden rounded-full bg-accent px-6 py-4 text-base font-semibold text-accent-foreground disabled:cursor-progress"
          style={delay(260)}
        >
          {videoProgress !== null && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-accent-foreground/20 transition-[width] duration-200 ease-linear"
              style={{ width: `${Math.round(videoProgress * 100)}%` }}
            />
          )}
          <span className="relative">{buttonLabel}</span>
        </button>
        {shareNotice && (
          <p className="-mt-2 text-center text-xs leading-relaxed text-warn" role="status">
            {shareNotice}
          </p>
        )}
        <p className="pr-enter -mt-2 text-center text-xs leading-relaxed text-muted" style={delay(280)}>
          {shareSupport === "clipboard"
            ? "Esse navegador não abre o menu nativo de compartilhar — copia o link e cola onde quiser."
            : scene
              ? "Grava a animação acima em vídeo e abre o menu do aparelho — WhatsApp, Instagram e Facebook aparecem ali como destino. Leva os segundos que a animação dura."
              : "Abre o menu de compartilhar do aparelho. Sem corrida gravada ainda, vai só o texto e o link."}
        </p>
      </Screen>
    </>
  );
}
