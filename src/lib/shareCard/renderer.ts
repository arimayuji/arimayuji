/**
 * The share card, drawn frame by frame onto a Canvas 2D context.
 *
 * This exists as explicit draw calls rather than as the CSS/SVG composition in
 * src/app/(app)/share-card.tsx for one hard technical reason: what actually
 * gets posted to a WhatsApp status is a *video file*, and the only way to
 * record one in a browser is `canvas.captureStream()`, which captures the
 * pixels painted onto one specific canvas and nothing else — not a DOM
 * subtree, not an SVG `<animate>`, not a CSS transition happening next to it.
 * So the choreography the preview card already had (route draws itself in,
 * then the numbers land) is re-expressed here as a pure function of elapsed
 * milliseconds, which both the recorder and the on-screen preview drive.
 *
 * Everything drawn is measured. The trace is the run's own GPS fixes, played
 * back over the run's own clock via the same replay timeline /historico uses,
 * so a kilometre that was crawled takes longer to draw than one that was
 * surged — and stretches where tracking gapped are never drawn across, exactly
 * as `routeSegments` refuses to draw a straight line over ground that was
 * never recorded.
 */

import { HORSE_BUST_PATHS, HORSE_FULL_BODY_PATHS } from "@/app/horse-mark";
import { PHOTO_FILTERS, type PhotoFilterId } from "./photoFilters";
import type { DistanceUnit } from "../preferences";
import {
  TIER_PAINT,
  plateLabelFontSize,
  platePolygon,
  sampleRamp,
  tintedStops,
} from "../plateMetal";
import type { Achievement } from "../tracking/achievements";
import { projectRoute } from "../tracking/routeProjection";
import {
  buildReplayTimeline,
  replayFrameAt,
  replayStretches,
  type ReplayTimeline,
} from "../tracking/replay";
import { runMovingSeconds, type CompletedRun } from "../tracking/storage";
import { formatAveragePace, formatDistance, unitLabel } from "../units";
import {
  RIDGE_FAR_PATH,
  RIDGE_NEAR_PATH,
  SCENARIOS,
  SCENARIO_ART_HEIGHT,
  SCENARIO_ART_WIDTH,
  scenarioForHour,
  type ScenarioId,
} from "./scenarios";

/**
 * 9:16 at 720p. The destination is a WhatsApp status or an Instagram story, so
 * the frame is portrait-full-bleed rather than the preview card's 4:5 crop.
 * 720 rather than 1080 because the encoder has to keep up in real time on a
 * mid-range Android — capture runs on the wall clock, so an encoder that falls
 * behind drops frames rather than taking longer.
 */
export const SHARE_CARD_WIDTH = 720;
export const SHARE_CARD_HEIGHT = 1280;

/** Wall-clock length of the finished video. */
export const SHARE_CARD_DURATION_MS = 6200;

const ROUTE_DRAW_START = 260;
const ROUTE_DRAW_MS = 3400;
const ROUTE_DRAW_END = ROUTE_DRAW_START + ROUTE_DRAW_MS;

const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Cubic ease-out — the same "arrives fast, settles" feel as the CSS `pr-enter` the preview card uses. */
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

const stage = (elapsed: number, start: number, duration: number) =>
  clamp01((elapsed - start) / duration);

/**
 * The "zero gravity" bob/tumble the shoe and the medal already do in CSS
 * (`pr-drift`/`pr-tumble-x`/`pr-tumble-y` in globals.css) — re-expressed as a
 * pure function of elapsed time so it can be baked into recorded frames,
 * where a CSS animation next to the canvas would simply not be captured.
 * translateY and rotateZ map straight onto `ctx.translate`/`ctx.rotate`; the
 * true 3D turn of rotateY has no 2D equivalent, so it's faked with a
 * horizontal scale oscillation — the same trick a flipping coin sprite uses.
 */
function floatingMotion(elapsed: number) {
  const t = elapsed / 1000;
  const bobY = Math.sin((t / 6) * Math.PI * 2) * 11;
  const rotZ = (0.5 + 4.5 * Math.sin((t / 6.5) * Math.PI * 2)) * (Math.PI / 180);
  const turnDeg = 30 * Math.sin((t / 9) * Math.PI * 2);
  const turnScaleX = Math.cos((turnDeg * Math.PI) / 180);
  return { bobY, rotZ, turnScaleX };
}

/**
 * `"trajeto"` is the original card: a small route map with the stats
 * anchored bottom-left. `"numero"` leads with the distance instead — a
 * single huge number centred on the frame, photo or scenario filling the
 * rest, no route drawn at all. Same underlying data either way; only how
 * `drawShareCardFrame` composes it changes.
 */
export type ShareCardLayout = "trajeto" | "numero";

export interface ShareCardRecord {
  label: string;
  achievement: Achievement;
}

export interface ShareCardShoe {
  name: string;
  color: string;
}

export interface ShareCardTrack {
  name: string;
  artist: string;
}

/**
 * `"none"` never mentions the track even if the run has one logged.
 * `"chip"` keeps the usual photo/scenario background and adds a small
 * "playing" pill naming the track. `"background"` replaces the photo/scenario
 * background outright with the album artwork itself — the "só música"
 * template, no personal photo or illustrated sky at all.
 */
export type ShareCardMusicMode = "none" | "chip" | "background";

export interface ShareCardInput {
  run: CompletedRun;
  scenario: ScenarioId;
  unit: DistanceUnit;
  /** Defaults to "trajeto" — the original route-map card. */
  layout?: ShareCardLayout;
  record?: ShareCardRecord | null;
  shoe?: ShareCardShoe | null;
  /** A photo the athlete chose, already decoded. Replaces the illustrated sky when present — unless `musicMode` is "background", which takes over the whole backdrop instead. */
  photo?: HTMLImageElement | null;
  /** Defaults to "original" — a no-op filter. Ignored when `photo` is null. */
  photoFilter?: PhotoFilterId;
  track?: ShareCardTrack | null;
  /** Defaults to "none". Ignored (treated as "none") when `track` is null. */
  musicMode?: ShareCardMusicMode;
  /** The track's decoded artwork, already loaded — required for `musicMode: "background"`, optional (shown as a small thumbnail) for `"chip"`. */
  albumArt?: HTMLImageElement | null;
}

interface Point {
  x: number;
  y: number;
}

export interface ShareCardScene {
  scenario: ScenarioId;
  layout: ShareCardLayout;
  photo: HTMLImageElement | null;
  photoFilter: PhotoFilterId;
  track: ShareCardTrack | null;
  musicMode: ShareCardMusicMode;
  albumArt: HTMLImageElement | null;
  /** Every fix's timestamp, in input order — `replayStretches` splits on these to honour tracking gaps. */
  points: { timestamp: number }[];
  /** Same points projected into the route box, in device pixels. */
  projected: Point[];
  timeline: ReplayTimeline | null;
  distance: string;
  distanceUnit: string;
  duration: string;
  pace: string;
  when: string;
  record: ShareCardRecord | null;
  shoe: ShareCardShoe | null;
  fontFamily: string;
}

/** Which illustrated sky this run gets, from the hour it actually started at. */
export function scenarioForRun(run: CompletedRun): ScenarioId {
  return scenarioForHour(new Date(run.startedAt).getHours());
}

function formatWhen(startedAt: number): string {
  const date = new Date(startedAt);
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
  const month = date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${day} ${month} · ${hours}h${minutes}`;
}

function formatDurationClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/**
 * The mono face the rest of the app uses, read off the CSS custom property
 * next/font defines. Falls back to the platform mono rather than failing —
 * canvas silently substitutes an unknown family, so a wrong guess here would
 * show up as a proportional-font card and nothing else.
 */
function monoFontFamily(): string {
  if (typeof window === "undefined") return MONO_FALLBACK;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-geist-mono")
    .trim();
  return value ? `${value}, ${MONO_FALLBACK}` : MONO_FALLBACK;
}

/**
 * Everything is inset from the top and bottom edges further than a card
 * designed for a feed would be: a WhatsApp status puts its own progress bar
 * and author line over the first ~150px and a reply field over the last ~150px,
 * and Instagram stories do the same. Numbers hidden behind someone else's UI
 * are the one failure this card cannot recover from.
 */
const CHROME_TOP = 108;
const STAT_LEFT = 52;
const STAT_WHEN_BASELINE = 920;
const STAT_DISTANCE_BASELINE = 1026;
const STAT_LABEL_BASELINE = 1084;
const STAT_VALUE_BASELINE = 1130;

/** Square region the trace is drawn into, in device pixels. */
const ROUTE_BOX = { x: 90, y: 200, size: 540 };

export function buildShareCardScene({
  run,
  scenario,
  unit,
  layout = "trajeto",
  record = null,
  shoe = null,
  photo = null,
  photoFilter = "original",
  track = null,
  musicMode = "none",
  albumArt = null,
}: ShareCardInput): ShareCardScene {
  const projection = projectRoute(run.points, { viewBoxSize: 1, paddingFraction: 0.04 });
  const seconds = runMovingSeconds(run);

  return {
    scenario,
    layout,
    photo,
    photoFilter,
    track,
    musicMode: track ? musicMode : "none",
    albumArt,
    points: run.points.map((point) => ({ timestamp: point.timestamp })),
    projected: (projection?.projected ?? []).map((point) => ({
      x: ROUTE_BOX.x + point.x * ROUTE_BOX.size,
      y: ROUTE_BOX.y + point.y * ROUTE_BOX.size,
    })),
    timeline: buildReplayTimeline(run.points),
    distance: formatDistance(run.distanceMeters, unit),
    distanceUnit: unitLabel(unit),
    duration: formatDurationClock(seconds),
    pace: formatAveragePace(run.distanceMeters, seconds, unit),
    when: formatWhen(run.startedAt),
    record,
    shoe,
    fontFamily: monoFontFamily(),
  };
}

/** Font specs the card paints with — handed to `document.fonts.load` before recording, since canvas substitutes silently for a face that hasn't loaded. */
export function shareCardFontSpecs(scene: ShareCardScene): string[] {
  return [
    `600 108px ${scene.fontFamily}`,
    `400 44px ${scene.fontFamily}`,
    `400 26px ${scene.fontFamily}`,
    `700 22px ${scene.fontFamily}`,
    `600 176px ${scene.fontFamily}`,
    `400 54px ${scene.fontFamily}`,
    `400 40px ${scene.fontFamily}`,
  ];
}

function lerpPoint(from: Point, to: Point, fraction: number): Point {
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Manual letter-spacing: `ctx.letterSpacing` is recent and silently ignored where it's missing, which would misalign the pills it centres. */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  return chars.reduce((sum, char) => sum + ctx.measureText(char).width + spacing, 0) - spacing;
}

function trackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  let cursor = x;
  for (const char of [...text]) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  }
}

function strokePathData(ctx: CanvasRenderingContext2D, data: readonly string[]) {
  for (const d of data) ctx.stroke(new Path2D(d));
}

/** The scrim that keeps the white overlay readable over any background, illustrated or photographed. */
function drawScrim(ctx: CanvasRenderingContext2D) {
  const scrim = ctx.createLinearGradient(0, 0, 0, SHARE_CARD_HEIGHT);
  scrim.addColorStop(0, "rgba(0,0,0,0.42)");
  scrim.addColorStop(0.42, "rgba(0,0,0,0.12)");
  scrim.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
}

/** `object-fit: cover` for a photo of any shape, cropped evenly rather than squeezed into 9:16. */
function drawPhoto(ctx: CanvasRenderingContext2D, photo: HTMLImageElement, filter: PhotoFilterId) {
  const width = photo.naturalWidth || photo.width;
  const height = photo.naturalHeight || photo.height;
  if (!width || !height) return;
  const scale = Math.max(SHARE_CARD_WIDTH / width, SHARE_CARD_HEIGHT / height);
  ctx.save();
  ctx.filter = PHOTO_FILTERS[filter].css;
  ctx.drawImage(
    photo,
    (SHARE_CARD_WIDTH - width * scale) / 2,
    (SHARE_CARD_HEIGHT - height * scale) / 2,
    width * scale,
    height * scale,
  );
  ctx.restore();
  drawScrim(ctx);
}

function drawScenario(ctx: CanvasRenderingContext2D, scenario: ScenarioId) {
  const art = SCENARIOS[scenario];
  // `xMidYMid slice`, the same fit the preview card's SVG uses: the art fills
  // the frame and the overflow is cropped evenly, so the ridgeline keeps its
  // authored proportions instead of stretching into the taller 9:16 frame.
  const scale = Math.max(
    SHARE_CARD_WIDTH / SCENARIO_ART_WIDTH,
    SHARE_CARD_HEIGHT / SCENARIO_ART_HEIGHT,
  );
  const offsetX = (SHARE_CARD_WIDTH - SCENARIO_ART_WIDTH * scale) / 2;
  const offsetY = (SHARE_CARD_HEIGHT - SCENARIO_ART_HEIGHT * scale) / 2;

  const sky = ctx.createLinearGradient(0, offsetY, 0, offsetY + SCENARIO_ART_HEIGHT * scale);
  sky.addColorStop(0, art.sky[0]);
  sky.addColorStop(0.46, art.sky[1]);
  sky.addColorStop(0.78, art.sky[2]);
  sky.addColorStop(1, art.sky[3]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

  if (art.stars) {
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.8;
    for (const star of art.stars) {
      ctx.beginPath();
      ctx.arc(star.cx, star.cy, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (art.celestial) {
    ctx.fillStyle = art.celestial.fill;
    ctx.globalAlpha = art.celestial.opacity;
    ctx.beginPath();
    ctx.arc(art.celestial.cx, art.celestial.cy, art.celestial.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = art.ridgeOpacity;
  ctx.fillStyle = art.ridgeFar;
  ctx.fill(new Path2D(RIDGE_FAR_PATH));
  ctx.globalAlpha = Math.min(1, art.ridgeOpacity + 0.1);
  ctx.fillStyle = art.ridgeNear;
  ctx.fill(new Path2D(RIDGE_NEAR_PATH));
  ctx.globalAlpha = 1;

  ctx.restore();

  if (art.fog) {
    const fog = ctx.createLinearGradient(0, offsetY, 0, offsetY + SCENARIO_ART_HEIGHT * scale);
    fog.addColorStop(0, "rgba(255,255,255,0)");
    fog.addColorStop(0.55, "rgba(255,255,255,0.22)");
    fog.addColorStop(0.8, "rgba(255,255,255,0.08)");
    fog.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  }

  drawScrim(ctx);
}

function drawRoute(ctx: CanvasRenderingContext2D, scene: ShareCardScene, elapsed: number) {
  if (!scene.timeline || scene.projected.length < 2) return;

  const progress = easeOut(stage(elapsed, ROUTE_DRAW_START, ROUTE_DRAW_MS));
  const head = replayFrameAt(scene.timeline, progress);
  const stretches = replayStretches(scene.points, scene.projected, lerpPoint, head);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const pass of [
    { width: 20, style: "rgba(255,255,255,0.18)" },
    { width: 9, style: "#ffffff" },
  ]) {
    ctx.lineWidth = pass.width;
    ctx.strokeStyle = pass.style;
    for (const stretch of stretches) {
      ctx.beginPath();
      ctx.moveTo(stretch[0].x, stretch[0].y);
      for (let i = 1; i < stretch.length; i++) ctx.lineTo(stretch[i].x, stretch[i].y);
      ctx.stroke();
    }
  }

  const start = scene.projected[0];
  const startPop = easeOut(stage(elapsed, 120, 300));
  if (startPop > 0) {
    ctx.globalAlpha = startPop;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(start.x, start.y, 14 * startPop, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const finish = scene.projected[scene.projected.length - 1];
  const endPop = easeOut(stage(elapsed, ROUTE_DRAW_END - 120, 340));
  if (endPop > 0) {
    ctx.globalAlpha = endPop;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(finish.x, finish.y, 14 * endPop, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  scene: ShareCardScene,
  text: string,
  right: number | null,
  left: number | null,
  top: number,
  alpha: number,
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `400 22px ${scene.fontFamily}`;
  ctx.textBaseline = "middle";
  const spacing = 3;
  const width = trackedWidth(ctx, text, spacing) + 40;
  const height = 46;
  const x = left !== null ? left : (right ?? 0) - width;
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  roundedRect(ctx, x, top, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  trackedText(ctx, text, x + 20, top + height / 2 + 1, spacing);
  ctx.restore();
}

/** The brand mark, chip-sized, in place of a spelled-out "XANTHUS" pill — same dark chrome chip, the horse bust stamped in it instead of type. */
function drawBrandPill(ctx: CanvasRenderingContext2D, left: number, top: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const size = 66;
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath();
  ctx.arc(left + size / 2, top + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(left + size / 2, top + size / 2);
  ctx.scale((size * 0.62) / 100, (size * 0.62) / 100);
  ctx.translate(-50, -50);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokePathData(ctx, HORSE_BUST_PATHS);
  ctx.restore();
}

/** Binary-searches the longest prefix of `text` (plus an ellipsis) that still fits `maxWidth` at the context's current font. */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

/**
 * The "playing" pill for `musicMode: "chip"` — a small rounded artwork
 * thumbnail (when the lookup returned one) plus a truncated "Track —
 * Artista" line. Each layout hands this its own safe slot: `align` controls
 * whether `x` is the pill's left edge or its centre, so trajeto (left-aligned
 * chrome throughout) and numero (centred throughout) each get a pill that
 * matches the rest of their own text instead of a third alignment style.
 */
function drawMusicChip(
  ctx: CanvasRenderingContext2D,
  scene: ShareCardScene,
  elapsed: number,
  x: number,
  y: number,
  align: "left" | "center",
  popStart: number,
) {
  if (!scene.track) return;
  const alpha = easeOut(stage(elapsed, popStart, 380));
  if (alpha <= 0) return;

  const height = 56;
  const artSize = height - 14;
  const hasArt = !!scene.albumArt;
  const label = hasArt ? `${scene.track.name} — ${scene.track.artist}` : `♪ ${scene.track.name} — ${scene.track.artist}`;
  const padLeft = hasArt ? artSize + 26 : 24;
  const maxWidth = 560;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `400 24px ${scene.fontFamily}`;
  ctx.textBaseline = "middle";
  const text = truncateToWidth(ctx, label, maxWidth - padLeft - 24);
  const textWidth = ctx.measureText(text).width;
  const width = padLeft + textWidth + 24;
  const left = align === "left" ? x : x - width / 2;

  ctx.fillStyle = "rgba(0,0,0,0.42)";
  roundedRect(ctx, left, y, width, height, height / 2);
  ctx.fill();

  if (hasArt && scene.albumArt) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(left + 7 + artSize / 2, y + height / 2, artSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(scene.albumArt, left + 7, y + 7, artSize, artSize);
    ctx.restore();
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, left + padLeft, y + height / 2 + 1);
  ctx.restore();
}

const TRAJETO_MUSIC_CHIP_POP_START = ROUTE_DRAW_END + 40;
const NUMERO_MUSIC_CHIP_POP_START = 160;
const NUMERO_MUSIC_CHIP_Y = 250;

function drawStats(ctx: CanvasRenderingContext2D, scene: ShareCardScene, elapsed: number) {
  const left = STAT_LEFT;
  ctx.textBaseline = "alphabetic";

  // The music chip takes over the "when" line's slot when there's a track to
  // show — the two are never both drawn, since both are a single small line
  // of context sitting right above the big distance number.
  if (scene.musicMode !== "none" && scene.track) {
    drawMusicChip(ctx, scene, elapsed, left, STAT_WHEN_BASELINE - 40, "left", TRAJETO_MUSIC_CHIP_POP_START);
  } else {
    const whenAlpha = easeOut(stage(elapsed, ROUTE_DRAW_END + 40, 420));
    if (whenAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = whenAlpha;
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.font = `400 26px ${scene.fontFamily}`;
      ctx.fillText(scene.when, left, STAT_WHEN_BASELINE + (1 - whenAlpha) * 18);
      ctx.restore();
    }
  }

  const distanceAlpha = easeOut(stage(elapsed, ROUTE_DRAW_END + 160, 460));
  if (distanceAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = distanceAlpha;
    // Scales up from the baseline's left edge, so the number lands rather than slides.
    ctx.translate(left, STAT_DISTANCE_BASELINE);
    ctx.scale(0.94 + 0.06 * distanceAlpha, 0.94 + 0.06 * distanceAlpha);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 108px ${scene.fontFamily}`;
    ctx.fillText(scene.distance, 0, 0);
    const numberWidth = ctx.measureText(scene.distance).width;
    ctx.font = `400 44px ${scene.fontFamily}`;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText(scene.distanceUnit, numberWidth + 14, 0);
    ctx.restore();
  }

  const columns: { label: string; value: string; suffix?: string }[] = [
    { label: "TEMPO", value: scene.duration },
    { label: "PACE", value: scene.pace, suffix: `/${scene.distanceUnit}` },
  ];

  columns.forEach((column, index) => {
    const alpha = easeOut(stage(elapsed, ROUTE_DRAW_END + 300 + index * 110, 420));
    if (alpha <= 0) return;
    const x = left + index * 250;
    const rise = (1 - alpha) * 16;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = `400 22px ${scene.fontFamily}`;
    trackedText(ctx, column.label, x, STAT_LABEL_BASELINE + rise, 2.4);
    ctx.fillStyle = "#ffffff";
    ctx.font = `400 42px ${scene.fontFamily}`;
    ctx.fillText(column.value, x, STAT_VALUE_BASELINE + rise);
    if (column.suffix) {
      const valueWidth = ctx.measureText(column.value).width;
      ctx.font = `400 24px ${scene.fontFamily}`;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillText(column.suffix, x + valueWidth + 8, STAT_VALUE_BASELINE + rise);
    }
    ctx.restore();
  });
}

interface PlateSlot {
  x: number;
  y: number;
  size: number;
}

/** To the right of the numbers, not over the route: the medal and the stats read as one block that way. */
const TRAJETO_PLATE_SLOT: PlateSlot = { x: 582, y: 1020, size: 200 };
/** Centred below the stats row — the "numero" layout has nothing off to one side for it to sit next to. */
const NUMERO_PLATE_SLOT: PlateSlot = { x: SHARE_CARD_WIDTH / 2, y: 970, size: 170 };
/** The route-draw phase runs first on "trajeto"; "numero" has no equivalent runway, so its accessory pops in much sooner, right after the stats settle. */
const TRAJETO_PLATE_POP_START = ROUTE_DRAW_END + 480;
const NUMERO_PLATE_POP_START = 1450;

/**
 * The gem-cut plate, drawn the same way the SVG component draws it: every
 * facet of the rim is filled by *sampling* the tinted chrome ramp at the
 * position its outward normal faces the light, with no interpolation, so
 * neighbouring facets jump between blown-out white and ink the way real
 * bevels do.
 */
function drawPlate(
  ctx: CanvasRenderingContext2D,
  scene: ShareCardScene,
  record: ShareCardRecord,
  elapsed: number,
  slot: PlateSlot,
  popStart: number,
) {
  const pop = easeOut(stage(elapsed, popStart, 520));
  if (pop <= 0) return;

  const { achievement } = record;
  const paint = TIER_PAINT[achievement.tier];
  const stops = tintedStops(paint, achievement.hueShift, achievement.tintScale);
  const scale = (slot.size / 120) * (0.86 + 0.14 * pop);

  ctx.save();
  ctx.globalAlpha = pop;
  ctx.translate(slot.x, slot.y);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, slot.size * 0.85);
  glow.addColorStop(0, `${paint.glow}66`);
  glow.addColorStop(1, `${paint.glow}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, slot.size * 0.85, 0, Math.PI * 2);
  ctx.fill();

  const float = floatingMotion(elapsed);
  ctx.translate(0, float.bobY * pop);
  ctx.rotate(float.rotZ * pop);
  ctx.scale(float.turnScaleX, 1);

  ctx.scale(scale, scale);
  ctx.translate(-60, -60);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const outer = platePolygon(achievement.facets, 56, achievement.faceSpin);
  const inner = platePolygon(achievement.facets, 41, achievement.faceSpin);

  const trace = (points: Array<[number, number]>) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };

  outer.forEach((point, i) => {
    const next = outer[(i + 1) % outer.length];
    const midAngle = ((i + 0.5) / outer.length) * 360 + achievement.faceSpin - 90;
    const delta = ((midAngle - achievement.lightAngle + 540) % 360) - 180;
    const facing = (1 - Math.cos((delta * Math.PI) / 180)) / 2;
    trace([point, next, inner[(i + 1) % inner.length], inner[i]]);
    ctx.fillStyle = sampleRamp(stops, facing * 100);
    ctx.fill();
    ctx.strokeStyle = "#0b0f13";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  });

  trace(outer);
  ctx.strokeStyle = "#0b0f13";
  ctx.lineWidth = 2;
  ctx.stroke();

  const face = ctx.createLinearGradient(0, 8, 0, 112);
  for (const [offset, color] of stops) face.addColorStop(offset / 100, color);
  trace(inner);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.strokeStyle = "#0b0f13";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.save();
  trace(inner);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fill(new Path2D("M -10 30 L 130 6 L 130 22 L -10 46 Z"));
  ctx.fillStyle = "rgba(255,255,255,0.24)";
  ctx.fill(new Path2D("M -10 78 L 130 56 L 130 63 L -10 85 Z"));
  ctx.restore();

  // Stamped twice, light offset under dark, so the mark survives both the
  // blown-out and the ink bands of the ramp.
  ctx.save();
  ctx.translate(39.8, 25.5);
  ctx.scale(0.37, 0.37);
  ctx.lineWidth = 5;
  ctx.save();
  ctx.translate(2.4, 2.4);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  strokePathData(ctx, HORSE_FULL_BODY_PATHS);
  ctx.restore();
  ctx.strokeStyle = paint.ink;
  ctx.globalAlpha = pop * 0.92;
  strokePathData(ctx, HORSE_FULL_BODY_PATHS);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const labelSize = plateLabelFontSize(record.label);
  ctx.font = `700 ${labelSize}px ${scene.fontFamily}`;
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(record.label, 60.7, 78.7);
  ctx.fillStyle = paint.ink;
  ctx.fillText(record.label, 60, 78);
  ctx.font = `400 5.4px ${scene.fontFamily}`;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText(achievement.serial, 60.4, 88.4);
  ctx.fillStyle = paint.ink;
  ctx.fillText(achievement.serial, 60, 88);
  ctx.textAlign = "left";

  ctx.restore();
}

interface ShoeSlot {
  x: number;
  y: number;
  width: number;
}

/** Bleeds off the right edge, the way the preview card floats it. */
const TRAJETO_SHOE_SLOT: ShoeSlot = { x: 300, y: 806, width: 440 };
/** Centred and smaller — "numero" has no route box for it to bleed past. */
const NUMERO_SHOE_SLOT: ShoeSlot = { x: (SHARE_CARD_WIDTH - 320) / 2, y: 980, width: 320 };

/**
 * The real generated collectible art (see /public/shoe) instead of a
 * hand-drawn vector shoe. Only three angles exist — not a full 3D model —
 * so "turning" is a cross-fade between them rather than a true rotation;
 * see `shoeAngleAt` below for the sequence and timing that sells it.
 */
const SHOE_IMAGE_SRC = {
  side: "/shoe/shoe-side.png",
  front: "/shoe/shoe-front.png",
  rear: "/shoe/shoe-rear.png",
} as const;
type ShoeAngle = keyof typeof SHOE_IMAGE_SRC;

const shoeImageCache: Partial<Record<ShoeAngle, HTMLImageElement>> = {};

/**
 * Kicks off loading on first request and returns the element only once it's
 * actually decoded — `img.complete`/`naturalWidth` is the standard readiness
 * check, cheaper than tracking load state separately. `null` before that
 * just means this frame draws nothing for the shoe; at 720p over localhost
 * that window is milliseconds, well before the shoe's own pop-in delay ever
 * makes it visible in the first place.
 */
function getShoeImage(angle: ShoeAngle): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  let img = shoeImageCache[angle];
  if (!img) {
    img = new Image();
    img.src = SHOE_IMAGE_SRC[angle];
    shoeImageCache[angle] = img;
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Look around, don't spin: side, glance to the front, back to side, glance
 * to the back — then settle, never looping. Timed to actually finish inside
 * the real window the shoe is ever on screen for: it pops in at
 * `ROUTE_DRAW_END + 480` and the whole card ends at `SHARE_CARD_DURATION_MS`,
 * which leaves under 2.1s total — a slower cycle would just get cut off
 * mid-fade on every single card, never seen in full.
 */
const SHOE_ANGLE_SEQUENCE: readonly ShoeAngle[] = ["side", "front", "side", "rear"];
const SHOE_ANGLE_HOLD_MS = 380;
const SHOE_ANGLE_FADE_MS = 280;
const SHOE_ANGLE_SEGMENT_MS = SHOE_ANGLE_HOLD_MS + SHOE_ANGLE_FADE_MS;

function shoeAngleAt(elapsedSincePop: number): { from: ShoeAngle; to: ShoeAngle; mix: number } {
  const clamped = Math.max(0, elapsedSincePop);
  const maxIndex = SHOE_ANGLE_SEQUENCE.length - 2;
  const index = Math.min(Math.floor(clamped / SHOE_ANGLE_SEGMENT_MS), maxIndex);
  const from = SHOE_ANGLE_SEQUENCE[index];
  const to = SHOE_ANGLE_SEQUENCE[index + 1];
  const withinSegment = clamped - index * SHOE_ANGLE_SEGMENT_MS;
  if (withinSegment < SHOE_ANGLE_HOLD_MS) return { from, to: from, mix: 0 };
  return { from, to, mix: easeOut(clamp01((withinSegment - SHOE_ANGLE_HOLD_MS) / SHOE_ANGLE_FADE_MS)) };
}

function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [47, 111, 237];
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Same duotone trick ShoeShowcase does in CSS (desaturate, then blend a flat
 * colour in with `mix-blend-mode: color`, masked to the source alpha), just
 * done once per angle+colour with canvas composite operations instead,
 * since a `<canvas>` recording has no DOM layers to stack. Cached because
 * it's identical every frame — recomputing a full-res composite 30+ times a
 * second for a shoe that never changes colour mid-video would be wasted work.
 */
const tintedShoeCache = new Map<string, HTMLCanvasElement>();

function getTintedShoeImage(angle: ShoeAngle, colorHex: string): HTMLCanvasElement | null {
  const source = getShoeImage(angle);
  if (!source) return null;
  const key = `${angle}:${colorHex}`;
  const cached = tintedShoeCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const tintCtx = canvas.getContext("2d");
  if (!tintCtx) return null;

  tintCtx.filter = "grayscale(1) brightness(1.08) contrast(1.05)";
  tintCtx.drawImage(source, 0, 0);
  tintCtx.filter = "none";

  tintCtx.globalCompositeOperation = "color";
  tintCtx.fillStyle = colorHex;
  tintCtx.fillRect(0, 0, canvas.width, canvas.height);

  // Blending with "color" paints every pixel, including the transparent
  // background — clip back to the shoe's own silhouette by multiplying the
  // original alpha channel back in.
  tintCtx.globalCompositeOperation = "destination-in";
  tintCtx.drawImage(source, 0, 0);
  tintCtx.globalCompositeOperation = "source-over";

  tintedShoeCache.set(key, canvas);
  return canvas;
}

/** One angle, centred at the current origin, scaled to `targetWidth` with its own aspect ratio. */
function drawShoeAngle(
  ctx: CanvasRenderingContext2D,
  angle: ShoeAngle,
  colorHex: string,
  targetWidth: number,
  alpha: number,
) {
  if (alpha <= 0) return;
  const img = getTintedShoeImage(angle, colorHex);
  if (!img) return;
  const h = targetWidth * (img.height / img.width);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -targetWidth / 2, -h / 2, targetWidth, h);
}

/**
 * The registered shoe — real photographed collectible art, duotoned to the
 * colour it was registered in (see `getTintedShoeImage`) the same way
 * ShoeShowcase tints its own copy of the same photos, so the shoe reads as
 * the same object whether it's sitting on /perfil or turning in this video.
 */
function drawShoe(
  ctx: CanvasRenderingContext2D,
  shoe: ShareCardShoe,
  elapsed: number,
  slot: ShoeSlot,
  popStart: number,
) {
  const pop = easeOut(stage(elapsed, popStart, 520));
  if (pop <= 0) return;

  const [r, g, b] = parseHex(shoe.color);
  const targetWidth = slot.width * (0.9 + 0.1 * pop);

  ctx.save();
  ctx.globalAlpha = pop;
  ctx.translate(slot.x + slot.width / 2, slot.y);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, slot.width * 0.6);
  glow.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
  glow.addColorStop(0.55, `rgba(${r},${g},${b},0.22)`);
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, slot.width * 0.6, 0, Math.PI * 2);
  ctx.fill();

  const float = floatingMotion(elapsed);
  ctx.translate(0, float.bobY * pop);
  ctx.rotate(float.rotZ * pop);

  const cardAlpha = pop;
  const { from, to, mix } = shoeAngleAt(Math.max(0, elapsed - popStart));
  ctx.save();
  drawShoeAngle(ctx, from, shoe.color, targetWidth, cardAlpha * (1 - mix));
  ctx.restore();
  if (mix > 0) {
    ctx.save();
    drawShoeAngle(ctx, to, shoe.color, targetWidth, cardAlpha * mix);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Paints one complete frame. Pure in the sense that matters here: the same
 * `elapsed` always produces the same pixels, which is what lets the recorder
 * step it on the wall clock and a preview step it on rAF without the two
 * drifting apart.
 */
/**
 * "numero" leads with the distance itself instead of the route: one huge
 * number, centred, with time and pace small underneath — the composition a
 * lot of runners already build by hand in a photo editor before posting
 * (a big stat stamped over an action shot), done natively instead of asking
 * them to leave the app to get it. No route box in this layout at all; the
 * number is the whole point.
 */
const NUMBER_POP_START = 260;
const NUMBER_POP_MS = 600;
const NUMBER_FONT_PX = 176;
const NUMBER_UNIT_FONT_PX = 54;
const NUMBER_BASELINE_Y = 660;

function drawNumberHero(ctx: CanvasRenderingContext2D, scene: ShareCardScene, elapsed: number) {
  const pop = easeOut(stage(elapsed, NUMBER_POP_START, NUMBER_POP_MS));
  if (pop <= 0) return;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${NUMBER_FONT_PX}px ${scene.fontFamily}`;
  const numberWidth = ctx.measureText(scene.distance).width;
  ctx.font = `400 ${NUMBER_UNIT_FONT_PX}px ${scene.fontFamily}`;
  const unitWidth = ctx.measureText(scene.distanceUnit).width;
  const gap = 16;
  const startX = (SHARE_CARD_WIDTH - (numberWidth + gap + unitWidth)) / 2;

  ctx.globalAlpha = pop;
  const scale = 0.94 + 0.06 * pop;
  ctx.translate(SHARE_CARD_WIDTH / 2, NUMBER_BASELINE_Y);
  ctx.scale(scale, scale);
  ctx.translate(-SHARE_CARD_WIDTH / 2, -NUMBER_BASELINE_Y);

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${NUMBER_FONT_PX}px ${scene.fontFamily}`;
  ctx.fillText(scene.distance, startX, NUMBER_BASELINE_Y);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = `400 ${NUMBER_UNIT_FONT_PX}px ${scene.fontFamily}`;
  ctx.fillText(scene.distanceUnit, startX + numberWidth + gap, NUMBER_BASELINE_Y);
  ctx.restore();
}

const NUMBER_STATS_START = NUMBER_POP_START + 420;
const NUMBER_STATS_LABEL_Y = 760;
const NUMBER_STATS_VALUE_Y = 808;
const NUMBER_STATS_COLUMN_WIDTH = 220;

function drawNumberStats(ctx: CanvasRenderingContext2D, scene: ShareCardScene, elapsed: number) {
  const columns: { label: string; value: string }[] = [
    { label: "TEMPO", value: scene.duration },
    { label: "PACE", value: `${scene.pace}/${scene.distanceUnit}` },
  ];
  const totalWidth = NUMBER_STATS_COLUMN_WIDTH * columns.length;
  const startX = (SHARE_CARD_WIDTH - totalWidth) / 2 + NUMBER_STATS_COLUMN_WIDTH / 2;

  columns.forEach((column, index) => {
    const alpha = easeOut(stage(elapsed, NUMBER_STATS_START + index * 110, 400));
    if (alpha <= 0) return;
    const x = startX + index * NUMBER_STATS_COLUMN_WIDTH;
    const rise = (1 - alpha) * 14;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `400 22px ${scene.fontFamily}`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    const labelWidth = trackedWidth(ctx, column.label, 2.4);
    trackedText(ctx, column.label, x - labelWidth / 2, NUMBER_STATS_LABEL_Y + rise, 2.4);

    ctx.textAlign = "center";
    ctx.font = `400 40px ${scene.fontFamily}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(column.value, x, NUMBER_STATS_VALUE_Y + rise);
    ctx.restore();
  });
  ctx.textAlign = "left";
}

export function drawShareCardFrame(
  ctx: CanvasRenderingContext2D,
  scene: ShareCardScene,
  elapsed: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.clearRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  // "Só música" replaces the photo/scenario backdrop outright with the
  // track's own artwork — the whole point of that template. Falls through to
  // the usual photo-or-scenario choice if the artwork somehow isn't loaded.
  if (scene.musicMode === "background" && scene.albumArt) drawPhoto(ctx, scene.albumArt, "original");
  else if (scene.photo) drawPhoto(ctx, scene.photo, scene.photoFilter);
  else drawScenario(ctx, scene.scenario);

  if (scene.layout === "numero") drawNumberHero(ctx, scene, elapsed);
  else drawRoute(ctx, scene, elapsed);

  // A record and a shoe want the same slot; the record wins, because a card
  // announcing a PR is doing a different job than one showing off the kit.
  const [plateSlot, plateStart, shoeSlot, shoeStart] =
    scene.layout === "numero"
      ? [NUMERO_PLATE_SLOT, NUMERO_PLATE_POP_START, NUMERO_SHOE_SLOT, NUMERO_PLATE_POP_START]
      : [TRAJETO_PLATE_SLOT, TRAJETO_PLATE_POP_START, TRAJETO_SHOE_SLOT, TRAJETO_PLATE_POP_START];
  if (scene.record) drawPlate(ctx, scene, scene.record, elapsed, plateSlot, plateStart);
  else if (scene.shoe) drawShoe(ctx, scene.shoe, elapsed, shoeSlot, shoeStart);

  const chromeAlpha = easeOut(stage(elapsed, 0, 360));
  drawBrandPill(ctx, STAT_LEFT, CHROME_TOP, chromeAlpha);
  // The scenario badge names the illustrated sky; over someone's own photo —
  // or the album art in "só música" — it would be naming a background that
  // isn't there.
  if (!scene.photo && scene.musicMode !== "background") {
    drawPill(
      ctx,
      scene,
      SCENARIOS[scene.scenario].short.toUpperCase(),
      SHARE_CARD_WIDTH - STAT_LEFT,
      null,
      CHROME_TOP,
      chromeAlpha,
    );
  }

  if (scene.layout === "numero") {
    drawNumberStats(ctx, scene, elapsed);
    if (scene.musicMode !== "none") {
      drawMusicChip(
        ctx,
        scene,
        elapsed,
        SHARE_CARD_WIDTH / 2,
        NUMERO_MUSIC_CHIP_Y,
        "center",
        NUMERO_MUSIC_CHIP_POP_START,
      );
    }
  } else {
    drawStats(ctx, scene, elapsed);
  }
}
