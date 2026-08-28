"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useHeaderClose } from "../app-shell";
import {
  Card,
  CardTitle,
  delay,
  ExampleBadge,
  NoticeBadge,
  PreferenceToggle,
  Screen,
  ScreenHeader,
  SegmentedButton,
} from "../ui";
import { SCENARIOS, ShareCard, type ScenarioId } from "../share-card";
import { ShareCardPreview } from "../share-card-preview";
import { useShareSupport } from "@/lib/share";
import { publicOrigin } from "@/lib/platform";
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
  SHARE_CARD_DURATION_OPTIONS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  drawShareCardFrame,
  type PhotoGridLayout,
  type ShareCardDurationId,
  type ShareCardLayout,
  type ShareCardLayoutOverrides,
  type ShareCardMusicMode,
  type ShareCardScene,
} from "@/lib/shareCard/renderer";
import { buildShareCardVideoFile, canRecordShareVideo } from "@/lib/shareCard/video";
import { buildShareCardPngFile, downloadFile } from "@/lib/shareCard/image";
import {
  listCompletedRuns,
  listShoes,
  runMovingSeconds,
  updateRunTracks,
  type CompletedRun,
  type RunTrack,
  type Shoe,
} from "@/lib/tracking/storage";
import { searchTracks, type TrackCandidate } from "@/lib/music/itunesLookup";
import { PHOTO_FILTER_IDS, PHOTO_FILTERS, type PhotoFilterId } from "@/lib/shareCard/photoFilters";
import { TEXT_ENTRANCE_IDS, TEXT_ENTRANCES, type TextEntranceId } from "@/lib/shareCard/textEntrances";

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

const CATEGORY_LABEL: Record<(typeof SCENARIOS)[ScenarioId]["category"], string> = {
  hora: "Hora do dia",
  clima: "Clima",
  bioma: "Biomas",
  capital: "Capitais",
};

/**
 * Scenario ids grouped by category, in a fixed display order — flattened
 * back to a single list for `Math.random()` picks and other places that just
 * need "any scenario", but grouped here so 20 thumbnails in one scroll strip
 * don't read as one undifferentiated wall (hora/clima kept first since those
 * are what a run actually gets picked automatically from).
 */
const SCENARIO_GROUPS: { category: (typeof SCENARIOS)[ScenarioId]["category"]; ids: ScenarioId[] }[] = (
  ["hora", "clima", "bioma", "capital"] as const
).map((category) => ({
  category,
  ids: SCENARIO_IDS.filter((id) => SCENARIOS[id].category === category),
}));

const NO_RUN_TEXT = "Fui correr 🏃 — Xanthus";

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M6 3l1.2 3.3L10.5 7.5 7.2 8.7 6 12l-1.2-3.3L1.5 7.5 4.8 6.3 6 3z" />
      <path d="M17.5 11l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5L10 18.5l5.5-2 2-5.5z" />
    </svg>
  );
}

interface TemplateOption {
  id: string;
  layout: ShareCardLayout;
  musicMode: ShareCardMusicMode;
  label: string;
  hint: string;
  /** True when this combo needs a logged track and the run doesn't have one yet — still listed, so the option is discoverable, just not drawable. */
  locked: boolean;
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

/**
 * Every template combo worth swiping through — `trajeto`/`número` crossed
 * with the background source. The music variants stay in the list even
 * without a logged track, marked `locked`, so they're something to discover
 * and unlock (via the "Trilha sonora" search below) rather than options
 * that silently don't exist until a track happens to be logged.
 */
function buildTemplateOptions(hasTrack: boolean): TemplateOption[] {
  const options: TemplateOption[] = [];
  for (const layout of LAYOUTS) {
    for (const music of MUSIC_MODES) {
      options.push({
        id: `${layout.id}-${music.id}`,
        layout: layout.id,
        musicMode: music.id,
        label: `${layout.label} · ${music.label}`,
        hint: music.hint,
        locked: music.requiresTrack && !hasTrack,
      });
    }
  }
  return options;
}

/**
 * One swipeable card in the template row — a real, once-drawn static frame
 * of that exact combo over the athlete's own data, not a generic icon
 * standing in for it. The label overlay exists because the row is
 * frequently mostly `LockedTemplateThumb` cards (any run without a logged
 * track locks 4 of the 6 combos) — those carry their own big, obvious
 * label, and a bare unlabeled canvas sitting next to them just reads as a
 * decorative preview rather than a distinct, selectable option. Without a
 * label of its own, "Trajeto · Foto" — the one combo that never needs a
 * track — was easy to miss entirely.
 */
function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v11m0 0-4-4m4 4 4-4" />
      <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
    </svg>
  );
}

/**
 * The thumbnail draws the exact rendered card, same pixels the download
 * produces — but on its own that reads as a static preview, not something
 * tappable that hands you a file. The download badge (icon dimming the
 * middle of the frame on top) is purely UI chrome layered over the canvas,
 * same as the label bar below it; neither ships in the actual exported
 * image, only in this picker.
 */
function TemplateThumb({
  scene,
  label,
  active,
  onClick,
}: {
  scene: ShareCardScene;
  label: string;
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
      className={`relative block shrink-0 snap-center overflow-hidden rounded-2xl border-2 transition-colors ${
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
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/28">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
          <DownloadIcon className="h-4.5 w-4.5" />
        </span>
      </span>
      <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 truncate rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] leading-tight font-medium text-white">
        {label}
      </span>
    </button>
  );
}

/** The music templates before a track is logged — a real slot in the row rather than a hidden one, so there's something to discover and a clear next step (tap scrolls to the search below). */
function LockedTemplateThumb({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 snap-center flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface px-3 text-center"
      style={{ width: 128, aspectRatio: `${SHARE_CARD_WIDTH} / ${SHARE_CARD_HEIGHT}` }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6 text-muted"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
      <span className="text-[11px] leading-tight font-medium text-muted">{label}</span>
      <span className="text-[10px] leading-tight text-accent">Busca uma música</span>
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
/** Above 4, `photoGridCells` in the renderer has no more layouts to fit — extra picks beyond this are silently dropped, not queued. */
const MAX_SHARE_PHOTOS = 4;

const PHOTO_GRID_LAYOUTS: { id: PhotoGridLayout; label: string }[] = [
  { id: "colunas", label: "Colunas" },
  { id: "linhas", label: "Linhas" },
  { id: "grade", label: "Grade" },
];

export default function CompartilharPage() {
  return (
    <Suspense fallback={null}>
      <CompartilharContent />
    </Suspense>
  );
}

function CompartilharContent() {
  useHeaderClose("/perfil");
  const requestedRunId = useSearchParams().get("run");
  const [scenario, setScenario] = useState<ScenarioId | null>(null);
  /**
   * Which background actually renders when both a photo/video AND a
   * scenario are available. Picking a photo or video sets this to "foto"
   * (the natural expectation right after upload), but nothing here ever
   * clears `photoUrls`/`videoUrl` — flipping back to "cenario" just hides
   * the media from the render without losing it, so going back and forth
   * doesn't require re-uploading.
   */
  const [backgroundMode, setBackgroundMode] = useState<"foto" | "cenario">("cenario");
  /** Which upload control "Sua foto ou vídeo" shows — foto and vídeo are mutually exclusive (see handlePhotoChange/handleVideoChange), so a toggle instead of two stacked pickers matches that. */
  const [mediaPickerTab, setMediaPickerTab] = useState<"foto" | "video">("foto");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photos, setPhotos] = useState<HTMLImageElement[]>([]);
  const [photoGridLayout, setPhotoGridLayout] = useState<PhotoGridLayout>("colunas");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  /**
   * True only once every photo in the current `photoUrls` set has finished
   * loading (decoded or failed) — while a pick is still in flight this stays
   * false so the render below can tell "still loading" apart from "loaded
   * and genuinely empty," and never silently falls back to the cenário
   * background just because `photos` hasn't caught up yet.
   */
  const [photosSettled, setPhotosSettled] = useState(true);
  /** Set when every photo in the current pick failed to decode (e.g. a HEIC file the browser can't render) — surfaced as an explicit message instead of quietly drawing the cenário while "Sua foto" stays selected. */
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const [photoFilter, setPhotoFilter] = useState<PhotoFilterId>("original");
  const [textEntrance, setTextEntrance] = useState<TextEntranceId>("bumerangue");
  /** On by default (the medal is the whole point of a PR share) — but the athlete may want a plainer card even on a record run, and hiding it falls back to the shoe plate below, same as any other run without a record. */
  const [showRecord, setShowRecord] = useState(true);
  /** Where the athlete dragged the stats block/medal-or-shoe, if at all — see `ShareCardLayoutOverrides`'s own comment. Shared across every template on purpose: switching template keeps "how far I dragged it," not a per-template saved position. */
  const [layoutOverrides, setLayoutOverrides] = useState<ShareCardLayoutOverrides>({});
  const [durationId, setDurationId] = useState<ShareCardDurationId>("padrao");
  const durationMs = SHARE_CARD_DURATION_OPTIONS.find((o) => o.id === durationId)!.ms;
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

  /** Seeded from `run.tracks` when the target run loads, then the sole source of truth from there on — additions/removals here update this directly and persist via `updateRunTracks`, the same pattern /run's own finish screen uses. */
  const [manualTracks, setManualTracks] = useState<RunTrack[]>([]);
  const [musicQuery, setMusicQuery] = useState("");
  const [musicResults, setMusicResults] = useState<TrackCandidate[] | null>(null);
  const [musicSearching, setMusicSearching] = useState(false);
  const [musicSearchFailed, setMusicSearchFailed] = useState(false);
  const musicCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listShoes().then(setShoes);
    listCompletedRuns().then(setRuns);
  }, []);

  const run = useMemo(() => {
    if (!runs) return null;
    const requested = requestedRunId ? runs.find((r) => r.id === requestedRunId) : null;
    return requested ?? [...runs].sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
  }, [runs, requestedRunId]);

  useEffect(() => {
    // Reseeds from this run's own saved tracks (and resets the in-progress
    // search) whenever the target run changes — e.g. arriving via a
    // different ?run= id. No cleaner derivation, since this is genuinely
    // "start fresh from what this run has," not state computable from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setManualTracks(run?.tracks ?? []);
    setMusicQuery("");
    setMusicResults(null);
    setMusicSearchFailed(false);
  }, [run?.id, run?.tracks]);

  /** The most recently logged track for this run — a run can have several; the last one is the closest thing to "what was playing when I finished." */
  const track = useMemo(() => {
    if (manualTracks.length === 0) return null;
    return [...manualTracks].sort((a, b) => b.playedAt - a.playedAt)[0];
  }, [manualTracks]);

  const handleMusicSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!musicQuery.trim()) return;
    setMusicSearching(true);
    setMusicSearchFailed(false);
    try {
      setMusicResults(await searchTracks(musicQuery));
    } catch {
      setMusicResults(null);
      setMusicSearchFailed(true);
    } finally {
      setMusicSearching(false);
    }
  };

  const handleAddManualTrack = useCallback(
    async (candidate: TrackCandidate) => {
      if (!run) return;
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
      await updateRunTracks(run.id, next);
    },
    [run, manualTracks],
  );

  const handleRemoveTrack = useCallback(
    async (removed: RunTrack) => {
      if (!run) return;
      const next = manualTracks.filter((t) => t !== removed);
      setManualTracks(next);
      await updateRunTracks(run.id, next);
    },
    [run, manualTracks],
  );

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

  const hasMedia = photoUrls.length > 0 || !!videoUrl;
  const usingMedia = hasMedia && backgroundMode === "foto";
  /** True once a photo/video pick in "foto" mode has finished loading and none of it decoded — the exact case that used to draw the cenário in its place while "Sua foto" stayed selected, with nothing on screen explaining why. */
  const mediaLoadFailed =
    backgroundMode === "foto" &&
    ((photoUrls.length > 0 && photosSettled && photoLoadFailed) || (!!videoUrl && videoLoadFailed));

  const shoe = shoes?.find((s) => s.id === shoeId) ?? null;

  const templates = useMemo(() => buildTemplateOptions(!!track), [track]);
  const activeTemplate = templates.find((t) => t.id === templateId) ?? templates[0];

  /** The PR this run earned, if any — independent of `showRecord` (the toggle only decides whether it's *drawn*, not whether one exists to offer the toggle for). */
  const headline = useMemo(() => {
    if (!run || !runs) return null;
    return (
      computeRunRecords(run, runs)
        .filter((record) => record.isNewRecord)
        .sort((a, b) => b.targetMeters - a.targetMeters)[0] ?? null
    );
  }, [run, runs]);

  // One scene per swipeable template — cheap (a single object each, the
  // expensive part is the canvas draw the thumbnails and the big preview do
  // on their own), and it's what lets every thumbnail show the athlete's
  // real data instead of a generic icon standing in for the combo.
  const scenes = useMemo(() => {
    if (!run || !runs) return [];
    const record =
      showRecord && headline
        ? { label: headline.label, achievement: computeAchievement(run.id, headline) }
        : null;
    const sharedShoe = shoe ? { name: shoe.name, color: shoe.color } : null;
    const sharedTrack = track ? { name: track.name, artist: track.artist } : null;

    return templates
      .filter((t) => !t.locked)
      .map((t) => {
        const built = buildShareCardScene({
          run,
          scenario: activeScenario,
          layout: t.layout,
          unit: preferences.distanceUnit,
          photos: usingMedia ? photos : [],
          photoGridLayout,
          video: usingMedia ? video : null,
          photoFilter,
          textEntrance,
          shoe: sharedShoe,
          record,
          track: sharedTrack,
          musicMode: t.musicMode,
          albumArt,
          layoutOverrides,
        });
        return { id: t.id, scene: built.projected.length >= 2 ? built : null };
      })
      .filter((entry): entry is { id: string; scene: ShareCardScene } => entry.scene !== null);
  }, [
    run,
    runs,
    activeScenario,
    preferences.distanceUnit,
    photos,
    photoGridLayout,
    video,
    usingMedia,
    photoFilter,
    textEntrance,
    showRecord,
    headline,
    layoutOverrides,
    shoe,
    track,
    albumArt,
    templates,
  ]);

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
        const ok = await shareFileWithFallback(file, shareText, publicOrigin());
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
    const url = publicOrigin();

    if (scene && shareSupport === "share" && !reducedMotion && canRecordShareVideo()) {
      setVideoProgress(0);
      try {
        let lastShown = 0;
        const file = await buildShareCardVideoFile(scene, {
          durationMs,
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

  // Revokes the *previous* object URLs whenever they're replaced or the
  // screen unmounts — the cleanup closes over the values from the render it
  // belongs to, so this never revokes a URL that's actually in use.
  useEffect(() => {
    return () => {
      photoUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoUrls]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // The canvas needs decoded bitmaps, not URLs, and it needs all of them
  // before the first frame is painted — a half-loaded image draws as
  // nothing at all, and a grid missing one cell reflows every other cell
  // the instant it does arrive. `photos` only updates once every URL in the
  // current set has resolved (decoded or failed), never partially.
  useEffect(() => {
    if (photoUrls.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhotosSettled(true);
      return;
    }
    let cancelled = false;
    // A fresh pick starts "not settled" so the render below can wait instead of assuming these photos already failed.
    setPhotosSettled(false);
    Promise.all(
      photoUrls.map(
        (url) =>
          new Promise<HTMLImageElement | null>((resolve) => {
            const image = new Image();
            // Neither `onload` nor `onerror` is guaranteed to fire on every
            // device for every file — seen in the wild as the picked photo
            // just silently never decoding, leaving the card stuck on its
            // cenário background with "Sua foto" still showing selected and
            // no warning, since `photosSettled` never had a reason to become
            // true. A resolve-anyway timeout turns that indefinite hang into
            // the same explicit "falhou" path a real decode error already
            // takes, instead of a state nothing here can ever recover from.
            const giveUp = setTimeout(() => resolve(null), 8000);
            image.onload = () => {
              clearTimeout(giveUp);
              resolve(image);
            };
            image.onerror = () => {
              clearTimeout(giveUp);
              resolve(null);
            };
            image.src = url;
          }),
      ),
    ).then((images) => {
      if (cancelled) return;
      const decoded = images.filter((img): img is HTMLImageElement => img !== null);
      setPhotos(decoded);
      setPhotosSettled(true);
      setPhotoLoadFailed(decoded.length === 0);
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrls]);

  // Same idea as the photo effect above, except the canvas doesn't need one
  // decoded frame — `drawImage` on a playing `<video>` samples whatever frame
  // is live at the moment it's called, so this just has to keep the element
  // playing (muted + playsInline for autoplay on iOS Safari) and hand the
  // element itself to the scene. No manual seeking or frame-timing here.
  useEffect(() => {
    if (!videoUrl) return;
    let cancelled = false;
    const el = document.createElement("video");
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.preload = "auto";
    el.onloadeddata = () => {
      if (cancelled) return;
      void el.play().catch(() => {});
      setVideo(el);
    };
    el.onerror = () => {
      if (cancelled) return;
      setVideo(null);
      setVideoLoadFailed(true);
    };
    el.src = videoUrl;
    return () => {
      cancelled = true;
      el.pause();
    };
  }, [videoUrl]);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_SHARE_PHOTOS);
    event.target.value = "";
    if (files.length === 0) return;
    setPhotos([]);
    setPhotoFilter("original");
    setPhotoLoadFailed(false);
    setPhotoUrls(files.map((file) => URL.createObjectURL(file)));
    setVideo(null);
    setVideoUrl(null);
    setVideoLoadFailed(false);
    setBackgroundMode("foto");
    setMediaPickerTab("foto");
  }

  function handleVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setVideo(null);
    setVideoLoadFailed(false);
    setPhotoFilter("original");
    setVideoUrl(URL.createObjectURL(file));
    setPhotos([]);
    setPhotoUrls([]);
    setPhotoLoadFailed(false);
    setBackgroundMode("foto");
    setMediaPickerTab("video");
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
      />

      <Screen>
        <div className="pr-enter mx-auto w-full max-w-[300px]" style={delay(80)}>
          {scene ? (
            <ShareCardPreview
              scene={scene}
              durationMs={durationMs}
              layoutOverrides={layoutOverrides}
              onLayoutOverridesChange={setLayoutOverrides}
            />
          ) : (
            <ShareCard scenario={activeScenario} photoUrl={usingMedia ? photoUrls[0] : undefined} />
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
            <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
              {templates.map((t) => {
                if (t.locked) {
                  return (
                    <LockedTemplateThumb
                      key={t.id}
                      label={t.label}
                      onClick={() =>
                        musicCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                    />
                  );
                }
                const templateScene = scenes.find((s) => s.id === t.id)?.scene;
                if (!templateScene) return null;
                return (
                  <TemplateThumb
                    key={t.id}
                    scene={templateScene}
                    label={t.label}
                    active={t.id === activeTemplate?.id}
                    onClick={() => setTemplateId(t.id)}
                  />
                );
              })}
            </div>
            <p className="mt-2 px-1 text-xs text-muted">{activeTemplate?.hint}</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setScenario(SCENARIO_IDS[Math.floor(Math.random() * SCENARIO_IDS.length)]);
            setTextEntrance(TEXT_ENTRANCE_IDS[Math.floor(Math.random() * TEXT_ENTRANCE_IDS.length)]);
          }}
          className="pr-enter flex h-11.5 items-center justify-center gap-2 rounded-full border border-border bg-surface text-sm font-bold hover:border-accent"
          style={delay(170)}
        >
          <SparkleIcon className="h-3.5 w-3.5 text-accent" />
          Surpreenda-me
        </button>

        <Card className="pr-enter" style={delay(185)}>
          <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>Sua foto ou vídeo</CardTitle>
          <p className="text-xs leading-relaxed text-muted text-pretty">
            Suba até {MAX_SHARE_PHOTOS} fotos ou um vídeo da sua corrida pra usar como fundo do
            card, no lugar de um cenário desenhado — o vídeo toca em loop atrás do trajeto e dos
            números, e 2+ fotos entram lado a lado numa grade. Um substitui o outro. Vale pros
            templates de foto — o de música usa a capa do álbum.
          </p>
          <div className="mt-3 flex gap-2">
            <SegmentedButton selected={mediaPickerTab === "foto"} onClick={() => setMediaPickerTab("foto")}>
              Foto
            </SegmentedButton>
            <SegmentedButton selected={mediaPickerTab === "video"} onClick={() => setMediaPickerTab("video")}>
              Vídeo
            </SegmentedButton>
          </div>

          {mediaPickerTab === "foto" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label
                htmlFor="share-photo-input"
                className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-accent"
              >
                {photoUrls.length > 0 ? "Trocar fotos" : "Escolher fotos"}
              </label>
              <input
                id="share-photo-input"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={handlePhotoChange}
              />
              {photoUrls.length > 0 && (
                <>
                  <span className="text-xs text-muted">
                    {photoUrls.length} {photoUrls.length === 1 ? "foto" : "fotos"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotos([]);
                      setPhotoUrls([]);
                    }}
                    className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-muted transition-colors hover:border-warn hover:text-warn"
                  >
                    Remover fotos
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label
                htmlFor="share-video-input"
                className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-accent"
              >
                {videoUrl ? "Trocar vídeo" : "Escolher vídeo"}
              </label>
              <input
                id="share-video-input"
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={handleVideoChange}
              />
              {videoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setVideo(null);
                    setVideoUrl(null);
                  }}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-muted transition-colors hover:border-warn hover:text-warn"
                >
                  Remover vídeo
                </button>
              )}
            </div>
          )}

          {(photos.length > 0 || video) && (
            <div className="mt-4 border-t border-border pt-4">
              <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                Filtro
              </span>
              <div className="flex gap-2">
                {PHOTO_FILTER_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPhotoFilter(id)}
                    aria-pressed={photoFilter === id}
                    className={`flex-1 overflow-hidden rounded-xl border-2 transition-colors ${
                      photoFilter === id ? "border-accent" : "border-transparent"
                    }`}
                  >
                    {photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- object URL preview, not an optimizable static asset.
                      <img
                        src={photos[0].src}
                        alt=""
                        style={{ filter: PHOTO_FILTERS[id].css }}
                        className="h-16 w-full object-cover"
                      />
                    ) : (
                      <div
                        style={{ filter: PHOTO_FILTERS[id].css }}
                        className="flex h-16 w-full items-center justify-center bg-gradient-to-br from-accent/60 to-accent/20"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 text-white"
                          aria-hidden="true"
                          fill="currentColor"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    )}
                    <span
                      className={`block py-1.5 text-center text-xs font-medium ${
                        photoFilter === id ? "text-accent" : "text-muted"
                      }`}
                    >
                      {PHOTO_FILTERS[id].label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {photos.length >= 2 && (
            <div className="mt-4 border-t border-border pt-4">
              <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
                Organização das fotos
              </span>
              <div className="grid grid-cols-3 gap-2">
                {PHOTO_GRID_LAYOUTS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPhotoGridLayout(id)}
                    aria-pressed={photoGridLayout === id}
                    className={`rounded-xl border-2 px-2 py-2.5 text-center transition-colors ${
                      photoGridLayout === id
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted hover:border-foreground/30"
                    }`}
                  >
                    <span className="block text-xs font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
              Chegada e saída do texto
            </span>
            <div className="grid grid-cols-3 gap-2">
              {TEXT_ENTRANCE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTextEntrance(id)}
                  aria-pressed={textEntrance === id}
                  className={`rounded-xl border-2 px-2 py-2.5 text-center transition-colors ${
                    textEntrance === id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted hover:border-foreground/30"
                  }`}
                >
                  <span className="block text-xs font-semibold">{TEXT_ENTRANCES[id].label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 px-1 text-xs text-muted">{TEXT_ENTRANCES[textEntrance].description}</p>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <span className="mb-2 block text-[11px] font-semibold tracking-wide text-muted uppercase">
              Duração do vídeo
            </span>
            <div className="grid grid-cols-3 gap-2">
              {SHARE_CARD_DURATION_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setDurationId(option.id)}
                  aria-pressed={durationId === option.id}
                  className={`rounded-xl border-2 px-2 py-2.5 text-center transition-colors ${
                    durationId === option.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted hover:border-foreground/30"
                  }`}
                >
                  <span className="block text-xs font-semibold">{option.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 px-1 text-xs text-muted">
              Quanto mais longo, mais devagar o traçado da rota e os textos aparecem — a coreografia
              inteira estica junto, não só a duração total.
            </p>
          </div>
        </Card>

        {run && (
          <Card className="pr-enter" style={delay(192)}>
            <div ref={musicCardRef} />
            <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>
              Trilha sonora
            </CardTitle>
            <p className="text-xs leading-relaxed text-muted text-pretty">
              Busca a música que tocou nessa corrida pra desbloquear os templates &ldquo;foto +
              música&rdquo; e &ldquo;música&rdquo; acima.
            </p>

            {track && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
                {track.artworkUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.artworkUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {track.name} <span className="text-muted">— {track.artist}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleRemoveTrack(track)}
                  aria-label={`Remover ${track.name}`}
                  className="shrink-0 rounded-full p-1.5 text-muted hover:bg-bad/10 hover:text-bad"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            )}

            <form onSubmit={handleMusicSearch} className="mt-3 flex gap-2">
              <input
                type="text"
                value={musicQuery}
                onChange={(event) => setMusicQuery(event.target.value)}
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
                      onClick={() => void handleAddManualTrack(candidate)}
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
          </Card>
        )}

        <Card className="pr-enter" style={delay(200)}>
          <CardTitle aside={<NoticeBadge>funciona de verdade</NoticeBadge>}>
            Cenário de fundo
          </CardTitle>
          {hasMedia && (
            <div className="mb-4 flex gap-2">
              <SegmentedButton selected={backgroundMode === "foto"} onClick={() => setBackgroundMode("foto")}>
                {videoUrl ? "Seu vídeo" : "Sua foto"}
              </SegmentedButton>
              <SegmentedButton selected={backgroundMode === "cenario"} onClick={() => setBackgroundMode("cenario")}>
                Cenário
              </SegmentedButton>
            </div>
          )}
          {mediaLoadFailed && (
            <p className="mb-4 text-xs leading-relaxed text-warn" role="status">
              Esse {videoUrl ? "vídeo" : "arquivo"} não abriu — o formato pode não ser suportado
              (ex.: fotos em HEIC). Por enquanto o card usa um cenário no lugar. Tenta escolher
              outra foto ou vídeo, ou exportar em JPG/PNG antes de subir.
            </p>
          )}
          <div
            className={`-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-1 ${usingMedia ? "opacity-50" : ""}`}
          >
            {SCENARIO_GROUPS.map(({ category, ids }) => (
              <div key={category} className="flex shrink-0 snap-start flex-col gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {CATEGORY_LABEL[category]}
                </span>
                <div className="flex gap-2">
                  {ids.map((id) => {
                    const def = SCENARIOS[id];
                    const [sky0, sky1, sky2, sky3] = def.sky;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={usingMedia}
                        onClick={() => setScenario(id)}
                        aria-pressed={activeScenario === id}
                        className={`relative block w-24 shrink-0 snap-center overflow-hidden rounded-2xl border-2 transition-colors disabled:cursor-not-allowed ${
                          activeScenario === id ? "border-accent" : "border-border"
                        }`}
                        style={{
                          aspectRatio: "92 / 128",
                          background: `linear-gradient(180deg, ${sky0} 0%, ${sky1} 46%, ${sky2} 78%, ${sky3} 100%)`,
                        }}
                      >
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/75 to-transparent px-2 pt-8 pb-2 text-left text-[11px] leading-tight font-semibold text-white">
                          {def.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted text-pretty">
            {SCENARIOS[activeScenario].hint}
          </p>
        </Card>

        {headline && (
          <Card className="pr-enter" style={delay(210)}>
            <PreferenceToggle
              label="Mostrar a medalha do recorde"
              hint={
                showRecord
                  ? "Essa corrida bateu recorde — a medalha aparece no card."
                  : "Desligado: o card fica sem a medalha, mesmo essa corrida tendo batido recorde."
              }
              checked={showRecord}
              onChange={setShowRecord}
            />
          </Card>
        )}

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
