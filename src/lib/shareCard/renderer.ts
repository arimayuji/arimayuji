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
import type { DistanceUnit } from "../preferences";
import {
  CHROME_STOPS,
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

export interface ShareCardRecord {
  label: string;
  achievement: Achievement;
}

export interface ShareCardShoe {
  name: string;
  color: string;
}

export interface ShareCardInput {
  run: CompletedRun;
  scenario: ScenarioId;
  unit: DistanceUnit;
  record?: ShareCardRecord | null;
  shoe?: ShareCardShoe | null;
  /** A photo the athlete chose, already decoded. Replaces the illustrated sky when present. */
  photo?: HTMLImageElement | null;
}

interface Point {
  x: number;
  y: number;
}

export interface ShareCardScene {
  scenario: ScenarioId;
  photo: HTMLImageElement | null;
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
  record = null,
  shoe = null,
  photo = null,
}: ShareCardInput): ShareCardScene {
  const projection = projectRoute(run.points, { viewBoxSize: 1, paddingFraction: 0.04 });
  const seconds = runMovingSeconds(run);

  return {
    scenario,
    photo,
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
function drawPhoto(ctx: CanvasRenderingContext2D, photo: HTMLImageElement) {
  const width = photo.naturalWidth || photo.width;
  const height = photo.naturalHeight || photo.height;
  if (!width || !height) return;
  const scale = Math.max(SHARE_CARD_WIDTH / width, SHARE_CARD_HEIGHT / height);
  ctx.drawImage(
    photo,
    (SHARE_CARD_WIDTH - width * scale) / 2,
    (SHARE_CARD_HEIGHT - height * scale) / 2,
    width * scale,
    height * scale,
  );
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

function drawStats(ctx: CanvasRenderingContext2D, scene: ShareCardScene, elapsed: number) {
  const left = STAT_LEFT;
  ctx.textBaseline = "alphabetic";

  const whenAlpha = easeOut(stage(elapsed, ROUTE_DRAW_END + 40, 420));
  if (whenAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = whenAlpha;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = `400 26px ${scene.fontFamily}`;
    ctx.fillText(scene.when, left, STAT_WHEN_BASELINE + (1 - whenAlpha) * 18);
    ctx.restore();
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

/** To the right of the numbers, not over the route: the medal and the stats read as one block that way. */
const PLATE_SLOT = { x: 582, y: 1020, size: 200 };

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
) {
  const pop = easeOut(stage(elapsed, ROUTE_DRAW_END + 480, 520));
  if (pop <= 0) return;

  const { achievement } = record;
  const paint = TIER_PAINT[achievement.tier];
  const stops = tintedStops(paint, achievement.hueShift, achievement.tintScale);
  const scale = (PLATE_SLOT.size / 120) * (0.86 + 0.14 * pop);

  ctx.save();
  ctx.globalAlpha = pop;
  ctx.translate(PLATE_SLOT.x, PLATE_SLOT.y);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, PLATE_SLOT.size * 0.85);
  glow.addColorStop(0, `${paint.glow}66`);
  glow.addColorStop(1, `${paint.glow}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, PLATE_SLOT.size * 0.85, 0, Math.PI * 2);
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

/** Bleeds off the right edge, the way the preview card floats it. */
const SHOE_SLOT = { x: 300, y: 806, width: 440 };

const SHOE_MIDSOLE = `M 17 56 C 9 61, 5.5 70, 9.5 78 C 13 84.4, 22 86.8, 32 86.8 L 120 86.8
  C 145 86.8, 166 79.5, 179 68 C 183.5 64, 185.5 60.6, 183.5 58.8
  C 181.5 57.2, 178 58.8, 174.5 61.4 C 165 66.4, 153 68.6, 137 69.8
  C 110 71.6, 76 71.4, 51 67.6 C 34.5 65, 23.5 60.6, 17 56 Z`;
const SHOE_OUTSOLE = `M 8 73 C 9 81.4, 20 85.1, 30 85.1 L 120 85.1
  C 144 85.1, 165 78, 178 66.4 L 185 59`;
const SHOE_PLATE = `M 12 67 C 15.5 75, 31 79, 56 80.4 C 92 82.2, 124 80.6, 146 75.4
  C 165 70.8, 177.5 62.2, 187 51.2`;
const SHOE_PLATE_SHEEN = `M 12 64.4 C 15.5 72.4, 31 76.4, 56 77.8 C 92 79.6, 124 78, 146 72.8
  C 165 68.2, 177.5 59.6, 187 48.6`;
const SHOE_UPPER = `M 171 62.8 C 173.5 56, 168 50, 158 48.5 C 144 46, 128 40, 112 32.6
  C 100 27.2, 90 22.6, 80 19.6 C 72 17.4, 67 19.4, 66 23.4
  C 65 27, 63.5 29.4, 59.5 30.6 C 52 32.8, 45 28.4, 39 21.4
  C 34.5 16, 30.5 11.6, 26 11.4 C 19.5 11.2, 14 16.4, 11.5 25.4
  C 9.6 33, 10.4 45, 17 56 C 23.5 60.6, 34.5 65, 51 67.6
  C 76 71.4, 110 71.6, 137 69.8 C 151 68.8, 163 66.6, 171 62.8 Z`;
const SHOE_OVERLAY = `M 84 30 C 87 45, 96 58, 110 66 C 120 71, 132 73.4, 146 71.6
  C 134 66, 122 58.4, 111 49 C 100 39.4, 89 30.6, 84 30 Z`;
const SHOE_DETAILS = [
  "M 18 26 C 15.5 36, 15.5 47, 18 56",
  "M 76 22 C 70 27, 62 31, 55 30",
  "M 133 42 C 118 35.5, 104 29.5, 92 25",
];
const SHOE_LACES: ReadonlyArray<readonly [number, number, number, number]> = [
  [131, 45.5, 133, 40.5],
  [118, 39.5, 120, 34.5],
  [105, 33.5, 107, 28.5],
  [93, 28, 95, 23],
];

function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [47, 111, 237];
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * The registered shoe, in the same chrome register as the locker's showcase —
 * a side-profile racer whose body stays polished metal whatever colour the
 * athlete picked, so `color` speaks through the glow and the plate line rather
 * than repainting the whole shoe.
 */
function drawShoe(
  ctx: CanvasRenderingContext2D,
  shoe: ShareCardShoe,
  elapsed: number,
) {
  const pop = easeOut(stage(elapsed, ROUTE_DRAW_END + 480, 520));
  if (pop <= 0) return;

  const [r, g, b] = parseHex(shoe.color);
  const scale = (SHOE_SLOT.width / 184) * (0.9 + 0.1 * pop);

  ctx.save();
  ctx.globalAlpha = pop;
  ctx.translate(SHOE_SLOT.x + SHOE_SLOT.width / 2, SHOE_SLOT.y);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, SHOE_SLOT.width * 0.6);
  glow.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
  glow.addColorStop(0.55, `rgba(${r},${g},${b},0.22)`);
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, SHOE_SLOT.width * 0.6, 0, Math.PI * 2);
  ctx.fill();

  const float = floatingMotion(elapsed);
  ctx.translate(0, float.bobY * pop);
  ctx.rotate(float.rotZ * pop);
  ctx.scale(float.turnScaleX, 1);

  ctx.scale(scale, scale);
  ctx.translate(-96, -49);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const midsole = new Path2D(SHOE_MIDSOLE);
  const upper = new Path2D(SHOE_UPPER);

  ctx.save();
  ctx.clip(midsole);
  const foam = ctx.createLinearGradient(0, 55, 0, 88);
  foam.addColorStop(0, "#ffffff");
  foam.addColorStop(0.2, "#edf2f7");
  foam.addColorStop(0.48, "#c6d0da");
  foam.addColorStop(0.76, "#9aa6b2");
  foam.addColorStop(1, "#79848f");
  ctx.fillStyle = foam;
  ctx.fillRect(0, 0, 200, 96);
  ctx.fillStyle = `rgba(${r},${g},${b},0.09)`;
  ctx.fillRect(0, 0, 200, 96);
  ctx.strokeStyle = "#7b8793";
  ctx.lineWidth = 6;
  ctx.stroke(new Path2D(SHOE_OUTSOLE));
  ctx.strokeStyle = `rgb(${Math.round(r * 0.28)},${Math.round(g * 0.28)},${Math.round(b * 0.28)})`;
  ctx.lineWidth = 2.6;
  ctx.stroke(new Path2D(SHOE_PLATE));
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 1.1;
  ctx.stroke(new Path2D(SHOE_PLATE_SHEEN));
  ctx.restore();

  ctx.strokeStyle = "#11151a";
  ctx.lineWidth = 2.2;
  ctx.stroke(midsole);

  const chrome = ctx.createLinearGradient(0, 10, 0, 72);
  for (const [offset, color] of CHROME_STOPS) chrome.addColorStop(offset / 100, color);
  ctx.fillStyle = chrome;
  ctx.fill(upper);
  ctx.stroke(upper);

  ctx.save();
  ctx.clip(upper);
  ctx.fillStyle = `rgba(${r},${g},${b},0.1)`;
  ctx.fillRect(0, 0, 200, 96);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.6;
  ctx.stroke(new Path2D("M 14 20 C 38 22, 68 30, 94 40"));
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.4;
  ctx.stroke(new Path2D("M 122 46 C 142 52, 158 56, 172 58"));
  ctx.fillStyle = "#11151a";
  ctx.fill(new Path2D(SHOE_OVERLAY));
  ctx.restore();

  ctx.strokeStyle = "rgba(201,212,223,0.7)";
  ctx.lineWidth = 1.5;
  strokePathData(ctx, SHOE_DETAILS);

  ctx.strokeStyle = "#e6edf4";
  ctx.lineWidth = 2.4;
  for (const [x1, y1, x2, y2] of SHOE_LACES) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.fillStyle = "#eef2f7";
  ctx.strokeStyle = "#11151a";
  ctx.lineWidth = 0.6;
  for (const [x, y] of SHOE_LACES) {
    ctx.beginPath();
    ctx.arc(x, y, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(92, 38);
  ctx.scale(0.24, 0.24);
  ctx.strokeStyle = "#f4f6fb";
  ctx.lineWidth = 5;
  strokePathData(ctx, HORSE_BUST_PATHS);
  ctx.restore();

  ctx.restore();
}

/**
 * Paints one complete frame. Pure in the sense that matters here: the same
 * `elapsed` always produces the same pixels, which is what lets the recorder
 * step it on the wall clock and a preview step it on rAF without the two
 * drifting apart.
 */
export function drawShareCardFrame(
  ctx: CanvasRenderingContext2D,
  scene: ShareCardScene,
  elapsed: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.clearRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  if (scene.photo) drawPhoto(ctx, scene.photo);
  else drawScenario(ctx, scene.scenario);
  drawRoute(ctx, scene, elapsed);

  // A record and a shoe want the same slot; the record wins, because a card
  // announcing a PR is doing a different job than one showing off the kit.
  if (scene.record) drawPlate(ctx, scene, scene.record, elapsed);
  else if (scene.shoe) drawShoe(ctx, scene.shoe, elapsed);

  const chromeAlpha = easeOut(stage(elapsed, 0, 360));
  drawPill(ctx, scene, "XANTHUS", null, STAT_LEFT, CHROME_TOP, chromeAlpha);
  // The scenario badge names the illustrated sky; over someone's own photo it
  // would be naming a background that isn't there.
  if (!scene.photo) {
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

  drawStats(ctx, scene, elapsed);
}
