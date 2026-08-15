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
import type { TextEntranceId } from "./textEntrances";
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

/** Overshoots past 1 before settling back — the impact wobble for something that "sticks" into place rather than fading in gently. */
const easeOutBack = (t: number, overshoot = 1.7) => {
  const clamped = clamp01(t);
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(clamped - 1, 3) + overshoot * Math.pow(clamped - 1, 2);
};

/**
 * A dart/boomerang landing instead of a fade-in: travels in fast from
 * `(fromX, fromY)` — device pixels, pre-scale — overshoots its resting spot,
 * and snaps back, the "unlocked" impact a lot of games use for a stat or
 * badge that just appeared. `settle` goes 0 → ~1.15 → 1, so a caller wanting
 * a matching scale-punch can drive it from the same number the position
 * offset uses instead of computing its own curve. Alpha ramps in over the
 * first slice of the stage so nothing is drawn fully transparent mid-flight.
 */
function dartLanding(elapsed: number, start: number, duration: number, fromX: number, fromY: number) {
  const t = stage(elapsed, start, duration);
  const settle = easeOutBack(t, 2.4);
  return {
    alpha: Math.min(1, t / 0.28),
    offsetX: fromX * (1 - settle),
    offsetY: fromY * (1 - settle),
    settle,
  };
}

/** How long before the card ends the exit motion finishes, and how long the exit itself takes. */
const TEXT_EXIT_LEAD_MS = 480;
const TEXT_EXIT_MS = 360;

/**
 * Generalizes `dartLanding` into a family of entrance *and* exit motions for
 * on-card text/numbers, selectable per share the same way the photo filters
 * are — "efeito do texto" instead of a colour preset. Every style returns
 * this same shape (`alpha`/`offsetX`/`offsetY`/`settle`), so call sites don't
 * branch on style themselves: they just plug the fields into the same
 * position/scale math they already had for `dartLanding`. The exit half
 * mirrors the entrance, timed to land `TEXT_EXIT_LEAD_MS` before the card's
 * own `SHARE_CARD_DURATION_MS` ends — never shown as text just vanishing.
 */
function textMotion(
  style: TextEntranceId,
  elapsed: number,
  start: number,
  duration: number,
  fromX: number,
  fromY: number,
) {
  const exitStart = Math.max(start + duration, SHARE_CARD_DURATION_MS - TEXT_EXIT_LEAD_MS);
  if (elapsed >= exitStart) {
    const t = clamp01(stage(elapsed, exitStart, TEXT_EXIT_MS));
    const easedIn = t * t; // ease-in — accelerates away, the mirror of the entrance's ease-out
    switch (style) {
      case "deslizar":
        // Keeps travelling the same direction it slid in from, off the
        // opposite side — a continuous pass-through rather than a retreat.
        return { alpha: 1 - easedIn, offsetX: -fromX * easedIn, offsetY: -fromY * easedIn, settle: 1 };
      case "zoom":
        // No positional offset either way — shrinks back down in place.
        return { alpha: 1 - easedIn, offsetX: 0, offsetY: 0, settle: 1 - 0.4 * easedIn };
      case "bumerangue":
      default:
        // True to the name: leaves exactly the way it arrived.
        return { alpha: 1 - easedIn, offsetX: fromX * easedIn, offsetY: fromY * easedIn, settle: 1 - 0.12 * easedIn };
    }
  }

  switch (style) {
    case "deslizar": {
      const t = stage(elapsed, start, duration);
      const eased = easeOut(t);
      return { alpha: Math.min(1, t / 0.4), offsetX: fromX * (1 - eased), offsetY: fromY * (1 - eased), settle: eased };
    }
    case "zoom": {
      const t = stage(elapsed, start, duration);
      const settle = easeOutBack(t, 1.6);
      return { alpha: Math.min(1, t / 0.3), offsetX: 0, offsetY: 0, settle };
    }
    case "bumerangue":
    default:
      return dartLanding(elapsed, start, duration, fromX, fromY);
  }
}

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
  /**
   * A video the athlete chose, already playing (muted, looping) so every
   * `drawImage` call below simply samples whatever frame is live — no
   * separate timing/seek logic needed here, the browser keeps decoding it
   * on its own clock. Takes over from `photo` when present; the two are
   * mutually exclusive at the call site, not merged here.
   */
  video?: HTMLVideoElement | null;
  /** Defaults to "original" — a no-op filter. Ignored when neither `photo` nor `video` is set. */
  photoFilter?: PhotoFilterId;
  /** Defaults to "bumerangue" — how the numbers/labels arrive and leave. */
  textEntrance?: TextEntranceId;
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
  video: HTMLVideoElement | null;
  photoFilter: PhotoFilterId;
  textEntrance: TextEntranceId;
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
  video = null,
  photoFilter = "original",
  textEntrance = "bumerangue",
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
    video,
    photoFilter,
    textEntrance,
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

/** `object-fit: cover` for a photo or a live video frame, cropped evenly rather than squeezed into 9:16. */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  photo: HTMLImageElement | HTMLVideoElement,
  filter: PhotoFilterId,
) {
  const isVideo = "videoWidth" in photo;
  const width = isVideo ? photo.videoWidth : photo.naturalWidth || photo.width;
  const height = isVideo ? photo.videoHeight : photo.naturalHeight || photo.height;
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

const BRAND_PILL_POP_START = 40;

/**
 * The brand mark, chip-sized, in place of a spelled-out "XANTHUS" pill — same
 * dark chrome chip, the horse bust stamped in it instead of type. Lands the
 * same way the record plate does: drops in from above and stamps down with
 * `dartLanding`'s overshoot, like a seal pressed into the card, rather than
 * just fading in.
 */
function drawBrandPill(ctx: CanvasRenderingContext2D, left: number, top: number, elapsed: number) {
  const dart = dartLanding(elapsed, BRAND_PILL_POP_START, 420, 0, -90);
  if (dart.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = dart.alpha;
  const size = 76;
  const cx = left + size / 2;
  const cy = top + size / 2;
  ctx.translate(cx, cy + dart.offsetY);
  ctx.scale(dart.settle, dart.settle);
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();
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

  // Darts in from up and to the left instead of just scaling up in place —
  // overshoots its resting spot by a few px and snaps back, same impact
  // read as an unlocked stat in a game rather than a number fading on.
  const distanceDart = textMotion(scene.textEntrance, elapsed, ROUTE_DRAW_END + 160, 460, -52, -40);
  if (distanceDart.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = distanceDart.alpha;
    ctx.translate(left + distanceDart.offsetX, STAT_DISTANCE_BASELINE + distanceDart.offsetY);
    ctx.scale(0.82 + 0.18 * distanceDart.settle, 0.82 + 0.18 * distanceDart.settle);
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
    const dart = textMotion(scene.textEntrance, elapsed, ROUTE_DRAW_END + 300 + index * 110, 420, 0, -34);
    if (dart.alpha <= 0) return;
    const x = left + index * 250;
    ctx.save();
    ctx.globalAlpha = dart.alpha;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = `400 22px ${scene.fontFamily}`;
    trackedText(ctx, column.label, x, STAT_LABEL_BASELINE + dart.offsetY, 2.4);
    ctx.fillStyle = "#ffffff";
    ctx.font = `400 42px ${scene.fontFamily}`;
    ctx.fillText(column.value, x, STAT_VALUE_BASELINE + dart.offsetY);
    if (column.suffix) {
      const valueWidth = ctx.measureText(column.value).width;
      ctx.font = `400 24px ${scene.fontFamily}`;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillText(column.suffix, x + valueWidth + 8, STAT_VALUE_BASELINE + dart.offsetY);
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
const TRAJETO_PLATE_SLOT: PlateSlot = { x: 570, y: 1032, size: 260 };
/** Centred below the stats row — the "numero" layout has nothing off to one side for it to sit next to. */
const NUMERO_PLATE_SLOT: PlateSlot = { x: SHARE_CARD_WIDTH / 2, y: 990, size: 220 };
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
  // A boomerang landing rather than a fade-in: flies in from off to the
  // side with a fast spin that unwinds as it settles, overshoots its slot
  // by a few degrees/px, and snaps into place — the "achievement unlocked"
  // impact this is standing in for, not a gentle pop.
  const dart = dartLanding(elapsed, popStart, 520, 100, -80);
  if (dart.alpha <= 0) return;

  const { achievement } = record;
  const paint = TIER_PAINT[achievement.tier];
  const stops = tintedStops(paint, achievement.hueShift, achievement.tintScale);
  const scale = (slot.size / 120) * (0.7 + 0.3 * dart.settle);
  const spin = (1 - dart.settle) * Math.PI * 2.2;

  ctx.save();
  ctx.globalAlpha = dart.alpha;
  ctx.translate(slot.x + dart.offsetX, slot.y + dart.offsetY);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, slot.size * 0.85);
  glow.addColorStop(0, `${paint.glow}66`);
  glow.addColorStop(1, `${paint.glow}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, slot.size * 0.85, 0, Math.PI * 2);
  ctx.fill();

  const float = floatingMotion(elapsed);
  ctx.translate(0, float.bobY * dart.alpha);
  ctx.rotate(float.rotZ * dart.alpha + spin);
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
  ctx.globalAlpha = dart.alpha * 0.92;
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

/** Keychain-sized charm, fully on-canvas — small enough to float in its zero-gravity tumble without dominating the card. */
const TRAJETO_SHOE_SLOT: ShoeSlot = { x: 560, y: 890, width: 130 };
const NUMERO_SHOE_SLOT: ShoeSlot = { x: (SHARE_CARD_WIDTH - 110) / 2, y: 980, width: 110 };

function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [47, 111, 237];
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * A generic "whitelabel" sneaker silhouette — a simple vector shape, not
 * photographed collectible art — tinted in the shoe's registered colour.
 * The real photo art (see ShoeShowcase on /perfil) reads great full-size,
 * but at the keychain scale this card draws the shoe at, that much
 * photographic/duotone detail just turns to noise; a flat vector shape
 * holds up at any size the same way the horse-bust brand mark does.
 * Authored at a 140×40 reference box — `scale` maps that to `width` device
 * pixels — facing right, heel on the left. The one cue that keeps this
 * reading as "shoe" instead of "blob" is the shallow concave scoop into the
 * ankle opening between the heel counter and the tongue: too deep and it
 * reads as a bird's head, too shallow (or omitted, like the first attempt
 * at this) and it reads as a smooth loaf with no read as footwear at all.
 */
function drawShoeSilhouette(ctx: CanvasRenderingContext2D, colorHex: string, width: number) {
  const [r, g, b] = parseHex(colorHex);
  const scale = width / 140;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-70, -18);

  // Sole — a thin flat strip, separated from the upper by a visible gap.
  ctx.beginPath();
  ctx.moveTo(8, 34);
  ctx.bezierCurveTo(4, 35, 3, 38, 6, 40);
  ctx.bezierCurveTo(14, 42.5, 122, 42.5, 132, 40);
  ctx.bezierCurveTo(137, 38, 136, 35, 131, 33.5);
  ctx.lineTo(10, 33.2);
  ctx.closePath();
  ctx.fillStyle = "#14181d";
  ctx.fill();

  // Upper.
  ctx.beginPath();
  ctx.moveTo(10, 32);
  ctx.bezierCurveTo(6, 28, 6, 16, 10, 9);
  ctx.bezierCurveTo(13, 4, 17, 2, 22, 3);
  ctx.bezierCurveTo(27, 4, 26, 9, 30, 12);
  ctx.bezierCurveTo(33, 14, 36, 7, 42, 4);
  ctx.bezierCurveTo(60, -3, 90, 3, 112, 12);
  ctx.bezierCurveTo(124, 17, 134, 22, 138, 27);
  ctx.bezierCurveTo(141, 31, 135, 33.5, 126, 34);
  ctx.bezierCurveTo(90, 36.5, 40, 35.5, 10, 32);
  ctx.closePath();

  const grad = ctx.createLinearGradient(6, 0, 138, 32);
  grad.addColorStop(0, `rgb(${Math.min(255, r + 75)},${Math.min(255, g + 75)},${Math.min(255, b + 75)})`);
  grad.addColorStop(0.5, `rgb(${r},${g},${b})`);
  grad.addColorStop(1, `rgb(${Math.max(0, r - 60)},${Math.max(0, g - 60)},${Math.max(0, b - 60)})`);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Toe cap — a darker wedge near the tip for definition.
  ctx.beginPath();
  ctx.moveTo(108, 13);
  ctx.bezierCurveTo(119, 17, 130, 22, 136, 27);
  ctx.bezierCurveTo(139, 30, 134, 32.5, 126, 33.5);
  ctx.bezierCurveTo(118, 29, 112, 21, 108, 13);
  ctx.closePath();
  ctx.fillStyle = `rgba(${Math.max(0, r - 70)},${Math.max(0, g - 70)},${Math.max(0, b - 70)},0.4)`;
  ctx.fill();

  // Laces, over the tongue.
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (const [x1, y1, x2, y2] of [
    [36, 14, 44, 6],
    [41, 19, 50, 11],
    [46, 24, 56, 16],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Sole seam highlight.
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(14, 33.5);
  ctx.lineTo(120, 34);
  ctx.stroke();

  ctx.restore();
}

/** The registered shoe — a whitelabel vector silhouette tinted the colour it was registered in, floating in the card's zero-gravity motion. */
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
  ctx.scale(float.turnScaleX, 1);

  drawShoeSilhouette(ctx, shoe.color, targetWidth);

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
  const dart = textMotion(scene.textEntrance, elapsed, NUMBER_POP_START, NUMBER_POP_MS, 0, -60);
  if (dart.alpha <= 0) return;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 ${NUMBER_FONT_PX}px ${scene.fontFamily}`;
  const numberWidth = ctx.measureText(scene.distance).width;
  ctx.font = `400 ${NUMBER_UNIT_FONT_PX}px ${scene.fontFamily}`;
  const unitWidth = ctx.measureText(scene.distanceUnit).width;
  const gap = 16;
  const startX = (SHARE_CARD_WIDTH - (numberWidth + gap + unitWidth)) / 2;

  ctx.globalAlpha = dart.alpha;
  const scale = 0.8 + 0.2 * dart.settle;
  ctx.translate(SHARE_CARD_WIDTH / 2, NUMBER_BASELINE_Y + dart.offsetY);
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
    const dart = textMotion(scene.textEntrance, elapsed, NUMBER_STATS_START + index * 110, 400, 0, -30);
    if (dart.alpha <= 0) return;
    const x = startX + index * NUMBER_STATS_COLUMN_WIDTH;

    ctx.save();
    ctx.globalAlpha = dart.alpha;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `400 22px ${scene.fontFamily}`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    const labelWidth = trackedWidth(ctx, column.label, 2.4);
    trackedText(ctx, column.label, x - labelWidth / 2, NUMBER_STATS_LABEL_Y + dart.offsetY, 2.4);

    ctx.textAlign = "center";
    ctx.font = `400 40px ${scene.fontFamily}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(column.value, x, NUMBER_STATS_VALUE_Y + dart.offsetY);
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
  else if (scene.video) drawPhoto(ctx, scene.video, scene.photoFilter);
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
  drawBrandPill(ctx, STAT_LEFT, CHROME_TOP, elapsed);
  // The scenario badge names the illustrated sky; over someone's own photo —
  // or the album art in "só música" — it would be naming a background that
  // isn't there.
  if (!scene.photo && !scene.video && scene.musicMode !== "background") {
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
