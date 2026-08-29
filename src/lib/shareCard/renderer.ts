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
import { renderShoe3DFrame } from "./shoe3d";
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

/**
 * Wall-clock length of the finished video. Everything after the route
 * finishes drawing (music chip, stat text, medal) is timed relative to
 * `ROUTE_DRAW_END` below. The very first pass at the 15s total dumped the
 * whole increase into the route draw (+6000ms) and left the post-route
 * runway at its original ~2540ms — fine in isolation, but at a 15s total
 * that runway shrank to ~17% of the video, so the distance/pace/time
 * numbers and the medal only had a sliver at the very end to reveal and
 * settle in. Watched at anything less than full attention (or captured in
 * a screenshot mid-route-draw) that read as "the numbers/medal never show
 * up" — reported as a bug, not a slow reveal. `ROUTE_DRAW_MS` below was
 * pulled back from 12200 to restore a runway closer to that original
 * ~30% share (now ~4440ms) without giving up on "the route line still
 * draws noticeably slower than the original 6200ms" — the actual thing
 * that was asked for.
 */
export const SHARE_CARD_DURATION_MS = 15000;

/**
 * Picker options for `/compartilhar` — `SHARE_CARD_DURATION_MS` above is both
 * the reference timeline every constant below is hand-tuned against *and*
 * the default/"padrão" choice, so picking it changes nothing. Picking "curto"
 * or "longo" scales `elapsed` itself in `drawShareCardFrame` (see its own
 * comment) rather than touching any of those constants individually.
 */
export const SHARE_CARD_DURATION_OPTIONS = [
  { id: "curto", label: "7s", ms: 7000 },
  { id: "padrao", label: "15s", ms: SHARE_CARD_DURATION_MS },
  { id: "longo", label: "30s", ms: 30000 },
] as const;
export type ShareCardDurationId = (typeof SHARE_CARD_DURATION_OPTIONS)[number]["id"];

const ROUTE_DRAW_START = 260;
const ROUTE_DRAW_MS = 10300;
const ROUTE_DRAW_END = ROUTE_DRAW_START + ROUTE_DRAW_MS;

const NUMBER_FONT_FALLBACK = "system-ui, sans-serif";

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

/** Standard "bounce" easing (Penner-style) — used by the "queda" style for a physical drop-and-settle instead of a single overshoot. */
function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  const clamped = clamp01(t);
  if (clamped < 1 / d1) return n1 * clamped * clamped;
  if (clamped < 2 / d1) {
    const x = clamped - 1.5 / d1;
    return n1 * x * x + 0.75;
  }
  if (clamped < 2.5 / d1) {
    const x = clamped - 2.25 / d1;
    return n1 * x * x + 0.9375;
  }
  const x = clamped - 2.625 / d1;
  return n1 * x * x + 0.984375;
}

interface TextMotion {
  alpha: number;
  offsetX: number;
  offsetY: number;
  settle: number;
  /** Horizontal-only scale multiplier, layered on top of `settle` — 1 for every style except "virar", which uses it for the card-flip squash. */
  scaleX: number;
  /** Gaussian blur radius, device px — 0 for every style except "desfoque". */
  blurPx: number;
  /** How much of each string to actually draw, 0-1 of its character count — 1 (the whole string) for every style except "escrita", which reveals/erases progressively instead of moving or fading the whole run at once. */
  revealFraction: number;
}

/**
 * Generalizes `dartLanding` into a family of entrance *and* exit motions for
 * on-card text/numbers, selectable per share the same way the photo filters
 * are — "efeito do texto" instead of a colour preset, CapCut-style. Every
 * style returns this same shape, so call sites don't branch on style
 * themselves: they just plug the fields into the same position/scale math
 * they already had for `dartLanding`, plus one `ctx.scale(scaleX, 1)` and an
 * optional blur filter that are no-ops for styles that don't use them. The
 * exit half mirrors (or knowingly diverges from, e.g. "queda" falling on
 * through rather than bouncing back up) the entrance, timed to land
 * `TEXT_EXIT_LEAD_MS` before the card's own `SHARE_CARD_DURATION_MS` ends —
 * never shown as text just vanishing.
 */
function textMotion(
  style: TextEntranceId,
  elapsed: number,
  start: number,
  duration: number,
  fromX: number,
  fromY: number,
): TextMotion {
  const exitStart = Math.max(start + duration, SHARE_CARD_DURATION_MS - TEXT_EXIT_LEAD_MS);
  if (elapsed >= exitStart) {
    const t = clamp01(stage(elapsed, exitStart, TEXT_EXIT_MS));
    const easedIn = t * t; // ease-in — accelerates away, the mirror of most entrances' ease-out
    switch (style) {
      case "deslizar":
      case "queda":
        // Keeps travelling the same direction it arrived from, off the
        // opposite side — a continuous pass-through rather than a retreat.
        // "Queda" falling on through (rather than bouncing back up) reads
        // as more natural than reversing gravity on the way out.
        return {
          alpha: 1 - easedIn,
          offsetX: -fromX * easedIn,
          offsetY: -fromY * easedIn,
          settle: 1,
          scaleX: 1,
          blurPx: 0,
          revealFraction: 1,
        };
      case "zoom":
        return {
          alpha: 1 - easedIn,
          offsetX: 0,
          offsetY: 0,
          settle: 1 - 0.4 * easedIn,
          scaleX: 1,
          blurPx: 0,
          revealFraction: 1,
        };
      case "desfoque":
        // Blurs back out in place, the mirror of how it arrived.
        return {
          alpha: 1 - easedIn,
          offsetX: 0,
          offsetY: 0,
          settle: 1,
          scaleX: 1,
          blurPx: 14 * easedIn,
          revealFraction: 1,
        };
      case "virar":
        // Flips shut — the same card-flip squash run in reverse.
        return {
          alpha: 1 - easedIn * 0.7,
          offsetX: 0,
          offsetY: 0,
          settle: 1,
          scaleX: 1 - easedIn,
          blurPx: 0,
          revealFraction: 1,
        };
      case "tremer": {
        // Keeps trembling right up until it's gone, rather than freezing
        // still and only then fading — the shake is what's leaving, too.
        const { jitterX, jitterY } = trembleJitter(elapsed, start);
        return {
          alpha: 1 - easedIn,
          offsetX: jitterX,
          offsetY: jitterY,
          settle: 1,
          scaleX: 1,
          blurPx: 0,
          revealFraction: 1,
        };
      }
      case "escrita":
        // Erases backward — the mirror of typing forward — rather than
        // fading the whole string at once.
        return {
          alpha: 1,
          offsetX: 0,
          offsetY: 0,
          settle: 1,
          scaleX: 1,
          blurPx: 0,
          revealFraction: 1 - easedIn,
        };
      case "bumerangue":
      default:
        // True to the name: leaves exactly the way it arrived.
        return {
          alpha: 1 - easedIn,
          offsetX: fromX * easedIn,
          offsetY: fromY * easedIn,
          settle: 1 - 0.12 * easedIn,
          scaleX: 1,
          blurPx: 0,
          revealFraction: 1,
        };
    }
  }

  switch (style) {
    case "deslizar": {
      const t = stage(elapsed, start, duration);
      const eased = easeOut(t);
      return {
        alpha: Math.min(1, t / 0.4),
        offsetX: fromX * (1 - eased),
        offsetY: fromY * (1 - eased),
        settle: eased,
        scaleX: 1,
        blurPx: 0,
        revealFraction: 1,
      };
    }
    case "zoom": {
      const t = stage(elapsed, start, duration);
      const settle = easeOutBack(t, 1.6);
      return { alpha: Math.min(1, t / 0.3), offsetX: 0, offsetY: 0, settle, scaleX: 1, blurPx: 0, revealFraction: 1 };
    }
    case "queda": {
      // Falls from `(fromX, fromY)` with real gravity — a bounce-out curve
      // instead of a single overshoot-and-snap, so it visibly settles after
      // one or two little hops rather than one smooth impact.
      const t = stage(elapsed, start, duration);
      const settle = easeOutBounce(t);
      return {
        alpha: Math.min(1, t / 0.2),
        offsetX: fromX * (1 - settle),
        offsetY: fromY * (1 - settle),
        settle,
        scaleX: 1,
        blurPx: 0,
        revealFraction: 1,
      };
    }
    case "desfoque": {
      // Stays put — no positional travel at all — and simply resolves from
      // a soft blur into focus as it fades in.
      const t = stage(elapsed, start, duration);
      const eased = easeOut(t);
      return {
        alpha: Math.min(1, t / 0.35),
        offsetX: 0,
        offsetY: 0,
        settle: eased,
        scaleX: 1,
        blurPx: 14 * (1 - eased),
        revealFraction: 1,
      };
    }
    case "virar": {
      // A fake 3D card-flip: squashes horizontally from edge-on (scaleX 0)
      // to facing (scaleX 1, with a slight overshoot snap), while the
      // regular vertical-driving `settle` stays at 1 the whole time so only
      // the width animates — the height never changes.
      const t = stage(elapsed, start, duration);
      const scaleX = easeOutBack(t, 1.2);
      return { alpha: Math.min(1, t / 0.25), offsetX: 0, offsetY: 0, settle: 1, scaleX, blurPx: 0, revealFraction: 1 };
    }
    case "tremer": {
      // A quick, small pop-in (not the full dart travel — the tremble
      // itself is the point, not a big arrival) followed by a continuous
      // small-amplitude shake for as long as the text stays on screen.
      const t = stage(elapsed, start, duration);
      if (t < 1) {
        const eased = easeOut(t);
        return {
          alpha: Math.min(1, t / 0.3),
          offsetX: fromX * 0.3 * (1 - eased),
          offsetY: fromY * 0.3 * (1 - eased),
          settle: eased,
          scaleX: 1,
          blurPx: 0,
          revealFraction: 1,
        };
      }
      const { jitterX, jitterY } = trembleJitter(elapsed, start);
      return { alpha: 1, offsetX: jitterX, offsetY: jitterY, settle: 1, scaleX: 1, blurPx: 0, revealFraction: 1 };
    }
    case "escrita": {
      // Types forward instead of moving or fading — position/scale/blur all
      // stay neutral, only how much of the string gets drawn changes.
      const t = stage(elapsed, start, duration);
      return { alpha: 1, offsetX: 0, offsetY: 0, settle: 1, scaleX: 1, blurPx: 0, revealFraction: t };
    }
    case "bumerangue":
    default: {
      const dart = dartLanding(elapsed, start, duration, fromX, fromY);
      return { ...dart, scaleX: 1, blurPx: 0, revealFraction: 1 };
    }
  }
}

/**
 * Deterministic, continuous small-amplitude jitter for the "tremer" style —
 * two summed sine waves per axis (not a single one, which would read as a
 * too-mechanical metronome-wobble instead of a hand-shake) and pure
 * functions of `elapsed`/`start`, never `Math.random()`: the recorder steps
 * through the same `elapsed` values a live preview does, and a random
 * source would make the exported video's shake diverge from what was
 * previewed. `start` (each call site's own pop time, already distinct per
 * element) doubles as a phase seed so different stats don't shake in
 * lockstep.
 */
function trembleJitter(elapsed: number, start: number): { jitterX: number; jitterY: number } {
  const jitterX = Math.sin(elapsed * 0.055 + start) * 3 + Math.sin(elapsed * 0.13 + start * 2.3) * 1.5;
  const jitterY =
    Math.sin(elapsed * 0.061 + start * 1.4 + 47) * 2.4 + Math.sin(elapsed * 0.11 + start * 0.7) * 1.2;
  return { jitterX, jitterY };
}

/** The "escrita" style's typewriter reveal — the prefix of `text` that should actually be drawn this frame. `fraction` is of character count, not measured width; simple, and CapCut's own typewriter presets work the same way. */
function revealText(text: string, fraction: number): string {
  if (fraction >= 1) return text;
  return text.slice(0, Math.max(0, Math.round(text.length * fraction)));
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
  const turnRad = (turnDeg * Math.PI) / 180;
  const turnScaleX = Math.cos(turnRad);
  // sin of the same turn angle — 0 face-on, ±1 near edge-on — a 2D fake for
  // depth (perspective shear, directional shading) that things without a
  // real 3D scene to rotate in fall back on; `drawShoe`'s real WebGL turn
  // uses `turnRad` directly instead and doesn't need this.
  const turnSin = Math.sin(turnRad);
  return { bobY, rotZ, turnScaleX, turnSin, turnRad };
}

/**
 * `"trajeto"` is the original card: a small route map with the stats
 * anchored bottom-left. `"numero"` leads with the distance instead — a
 * single huge number centred on the frame, photo or scenario filling the
 * rest, no route drawn at all. Same underlying data either way; only how
 * `drawShareCardFrame` composes it changes.
 */
export type ShareCardLayout = "trajeto" | "numero";

/**
 * How 2-4 photos compose into the card's backdrop instead of one full-bleed
 * cover shot. "colunas"/"linhas" split evenly; "grade" adapts per count — a
 * hero + stacked pair at 3 photos, an even quadrant at 4 — rather than
 * leaving a cell empty.
 */
export type PhotoGridLayout = "colunas" | "linhas" | "grade";

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
 * Athlete-dragged pixel offsets from each element's default position (in
 * canvas units, at `SHARE_CARD_WIDTH`×`SHARE_CARD_HEIGHT` — never screen
 * pixels), added on top of the template's own fixed layout rather than
 * replacing it. Absent/zero means exactly today's fixed position, so a card
 * built with no `layoutOverrides` renders identically to before this
 * existed. `plate` covers whichever accessory is actually showing in that
 * slot — the record medal or the shoe, never both — since they already
 * share one slot (see drawShareCardFrame's own comment on that).
 */
export interface ShareCardLayoutOverrides {
  stats?: { dx: number; dy: number };
  plate?: { dx: number; dy: number };
  /** The route trace itself (the "trajeto" layout's GPS line) — never offered on "numero", which has no line to move. */
  route?: { dx: number; dy: number };
  /**
   * True removes that element from the render entirely — every element on
   * this card is optional, not just draggable. Kept separate from
   * `stats`/`plate` above (a position offset) rather than folded into
   * them, since hiding needs to survive independently of whatever offset
   * was already dragged in — un-hiding later should put it back exactly
   * where it was, not reset to the default position too. The route has no
   * hide flag — dropping the trace entirely defeats the point of the
   * "trajeto" template (pick "número" instead if the route shouldn't show).
   */
  hidden?: { stats?: boolean; plate?: boolean };
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
  /**
   * Photos the athlete chose, already decoded. Replaces the illustrated sky
   * when present — unless `musicMode` is "background", which takes over the
   * whole backdrop instead. One photo draws full-bleed same as before;
   * 2-4 compose into `photoGridLayout` instead (extras beyond 4 are
   * ignored — pick a layout that fits, not the call site's job to enforce).
   */
  photos?: HTMLImageElement[];
  /** Defaults to "colunas". Ignored when fewer than 2 photos are set. */
  photoGridLayout?: PhotoGridLayout;
  /**
   * A video the athlete chose, already playing (muted, looping) so every
   * `drawImage` call below simply samples whatever frame is live — no
   * separate timing/seek logic needed here, the browser keeps decoding it
   * on its own clock. Takes over from `photos` when present; the two are
   * mutually exclusive at the call site, not merged here.
   */
  video?: HTMLVideoElement | null;
  /** Defaults to "original" — a no-op filter. Ignored when neither `photos` nor `video` is set. */
  photoFilter?: PhotoFilterId;
  /** Defaults to "bumerangue" — how the numbers/labels arrive and leave. */
  textEntrance?: TextEntranceId;
  track?: ShareCardTrack | null;
  /** Defaults to "none". Ignored (treated as "none") when `track` is null. */
  musicMode?: ShareCardMusicMode;
  /** The track's decoded artwork, already loaded — required for `musicMode: "background"`, optional (shown as a small thumbnail) for `"chip"`. */
  albumArt?: HTMLImageElement | null;
  /** Defaults to `{}` — every element at its normal fixed position. */
  layoutOverrides?: ShareCardLayoutOverrides;
}

interface Point {
  x: number;
  y: number;
}

export interface ShareCardScene {
  scenario: ScenarioId;
  layout: ShareCardLayout;
  /** 0 = none, 1 = a normal single photo, 2-4 = composed into `photoGridLayout`. */
  photos: HTMLImageElement[];
  photoGridLayout: PhotoGridLayout;
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
  layoutOverrides: ShareCardLayoutOverrides;
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
 * The face every numeric readout in the app uses (the same `font-mono`
 * Tailwind class resolves to elsewhere — Nunito at a fixed Black weight,
 * not literally monospace despite the name), read off the CSS custom
 * property next/font defines. Falls back to a generic sans rather than
 * failing — canvas silently substitutes an unknown family, so a wrong
 * guess here would show up as a mismatched system-font card and nothing
 * else.
 */
function numberFontFamily(): string {
  if (typeof window === "undefined") return NUMBER_FONT_FALLBACK;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-nunito-numbers")
    .trim();
  return value ? `${value}, ${NUMBER_FONT_FALLBACK}` : NUMBER_FONT_FALLBACK;
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
  photos = [],
  photoGridLayout = "colunas",
  video = null,
  photoFilter = "original",
  textEntrance = "bumerangue",
  track = null,
  musicMode = "none",
  albumArt = null,
  layoutOverrides = {},
}: ShareCardInput): ShareCardScene {
  const projection = projectRoute(run.points, { viewBoxSize: 1, paddingFraction: 0.04 });
  const seconds = runMovingSeconds(run);

  return {
    scenario,
    layout,
    photos,
    photoGridLayout,
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
    fontFamily: numberFontFamily(),
    layoutOverrides,
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

/** `object-fit: cover` into an arbitrary rect — crops evenly rather than squeezing, the shared math behind both a full-bleed photo and one cell of a photo grid. */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLVideoElement,
  rectX: number,
  rectY: number,
  rectW: number,
  rectH: number,
) {
  const isVideo = "videoWidth" in img;
  const width = isVideo ? img.videoWidth : img.naturalWidth || img.width;
  const height = isVideo ? img.videoHeight : img.naturalHeight || img.height;
  if (!width || !height) return;
  const scale = Math.max(rectW / width, rectH / height);
  const drawW = width * scale;
  const drawH = height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rectX, rectY, rectW, rectH);
  ctx.clip();
  ctx.drawImage(img, rectX + (rectW - drawW) / 2, rectY + (rectH - drawH) / 2, drawW, drawH);
  ctx.restore();
}

/** A single photo (or a live video frame) filling the whole card, `object-fit: cover`. */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  photo: HTMLImageElement | HTMLVideoElement,
  filter: PhotoFilterId,
) {
  ctx.save();
  ctx.filter = PHOTO_FILTERS[filter].css;
  drawImageCover(ctx, photo, 0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  ctx.restore();
  drawScrim(ctx);
}

interface GridCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cell rects for 2-4 photos. "grade" adapts per count — a hero + stacked pair at 3, an even quadrant at 4 — rather than leaving a cell empty. */
function photoGridCells(count: number, layout: PhotoGridLayout): GridCell[] {
  const w = SHARE_CARD_WIDTH;
  const h = SHARE_CARD_HEIGHT;
  if (layout === "colunas") {
    const colWidth = w / count;
    return Array.from({ length: count }, (_, i) => ({ x: i * colWidth, y: 0, w: colWidth, h }));
  }
  if (layout === "linhas") {
    const rowHeight = h / count;
    return Array.from({ length: count }, (_, i) => ({ x: 0, y: i * rowHeight, w, h: rowHeight }));
  }
  // "grade"
  if (count === 3) {
    const heroW = w * 0.6;
    const sideW = w - heroW;
    const sideH = h / 2;
    return [
      { x: 0, y: 0, w: heroW, h },
      { x: heroW, y: 0, w: sideW, h: sideH },
      { x: heroW, y: sideH, w: sideW, h: sideH },
    ];
  }
  if (count >= 4) {
    const colWidth = w / 2;
    const rowHeight = h / 2;
    return [
      { x: 0, y: 0, w: colWidth, h: rowHeight },
      { x: colWidth, y: 0, w: colWidth, h: rowHeight },
      { x: 0, y: rowHeight, w: colWidth, h: rowHeight },
      { x: colWidth, y: rowHeight, w: colWidth, h: rowHeight },
    ];
  }
  // count === 2, "grade" falls back to an even top/bottom split.
  const rowHeight = h / 2;
  return [
    { x: 0, y: 0, w, h: rowHeight },
    { x: 0, y: rowHeight, w, h: rowHeight },
  ];
}

const PHOTO_GRID_GAP = 4;

/** 2-4 photos composed into one backdrop instead of a single full-bleed cover shot — a thin dark seam between cells, same scrim over the whole composite as a single photo gets. */
function drawPhotoGrid(
  ctx: CanvasRenderingContext2D,
  photos: HTMLImageElement[],
  layout: PhotoGridLayout,
  filter: PhotoFilterId,
) {
  const cells = photoGridCells(Math.min(photos.length, 4), layout);
  ctx.save();
  ctx.fillStyle = "#0b0f13";
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  ctx.filter = PHOTO_FILTERS[filter].css;
  cells.forEach((cell, i) => {
    const photo = photos[i];
    if (!photo) return;
    drawImageCover(
      ctx,
      photo,
      cell.x + PHOTO_GRID_GAP / 2,
      cell.y + PHOTO_GRID_GAP / 2,
      cell.w - PHOTO_GRID_GAP,
      cell.h - PHOTO_GRID_GAP,
    );
  });
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
  ctx.fill(new Path2D(art.ridgeFarPath ?? RIDGE_FAR_PATH));
  ctx.globalAlpha = Math.min(1, art.ridgeOpacity + 0.1);
  ctx.fillStyle = art.ridgeNear;
  ctx.fill(new Path2D(art.ridgeNearPath ?? RIDGE_NEAR_PATH));
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

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const EQ_BAR_COUNT = 4;
const EQ_BAR_WIDTH = 3;
const EQ_BAR_GAP = 3;
const EQ_BARS_TOTAL_WIDTH = EQ_BAR_COUNT * EQ_BAR_WIDTH + (EQ_BAR_COUNT - 1) * EQ_BAR_GAP;

/**
 * A small "now playing" equalizer — vertical bars pulsing at slightly
 * different, deterministic-per-track rates (hashed from the track name +
 * artist, so the same song always animates the same way instead of looking
 * random from render to render). This is deliberately NOT a real BPM/audio
 * analysis: the card only ever has the iTunes lookup's metadata, never the
 * actual audio, so there's nothing to measure — purely a decorative "it's
 * playing" cue, the same spirit as a loading spinner rather than a chart.
 */
function drawEqualizerBars(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  elapsed: number,
  seed: string,
) {
  const hash = hashString(seed);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < EQ_BAR_COUNT; i++) {
    const phase = (((hash >> (i * 5)) & 0xff) / 255) * Math.PI * 2;
    const speed = 0.0052 + (((hash >> (i * 3 + 1)) & 0x7) * 0.0006);
    const wave = (Math.sin(elapsed * speed + phase + i * 1.7) + 1) / 2;
    const barHeight = Math.max(3, height * (0.22 + 0.78 * wave));
    const bx = x + i * (EQ_BAR_WIDTH + EQ_BAR_GAP);
    const by = y + (height - barHeight) / 2;
    roundedRect(ctx, bx, by, EQ_BAR_WIDTH, barHeight, EQ_BAR_WIDTH / 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The "playing" pill for `musicMode: "chip"` — a small rounded artwork
 * thumbnail (when the lookup returned one), a pulsing equalizer, and a
 * truncated "Track — Artista" line. Each layout hands this its own safe
 * slot: `align` controls whether `x` is the pill's left edge or its centre,
 * so trajeto (left-aligned chrome throughout) and numero (centred
 * throughout) each get a pill that matches the rest of their own text
 * instead of a third alignment style.
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
  const label = `${scene.track.name} — ${scene.track.artist}`;
  const barsStart = hasArt ? 7 + artSize + 12 : 16;
  const padLeft = barsStart + EQ_BARS_TOTAL_WIDTH + 12;
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

  drawEqualizerBars(ctx, left + barsStart, y + 14, height - 28, elapsed, `${scene.track.name}:${scene.track.artist}`);

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
    ctx.scale((0.82 + 0.18 * distanceDart.settle) * distanceDart.scaleX, 0.82 + 0.18 * distanceDart.settle);
    if (distanceDart.blurPx > 0) ctx.filter = `blur(${distanceDart.blurPx.toFixed(1)}px)`;
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 108px ${scene.fontFamily}`;
    ctx.fillText(revealText(scene.distance, distanceDart.revealFraction), 0, 0);
    // Measures the *full* string, not the revealed prefix, so the unit's
    // position stays put instead of creeping left-to-right while it types.
    const numberWidth = ctx.measureText(scene.distance).width;
    ctx.font = `400 44px ${scene.fontFamily}`;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText(revealText(scene.distanceUnit, distanceDart.revealFraction), numberWidth + 14, 0);
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
    ctx.translate(x, 0);
    ctx.scale(dart.scaleX, 1);
    if (dart.blurPx > 0) ctx.filter = `blur(${dart.blurPx.toFixed(1)}px)`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = `400 22px ${scene.fontFamily}`;
    trackedText(ctx, revealText(column.label, dart.revealFraction), 0, STAT_LABEL_BASELINE + dart.offsetY, 2.4);
    ctx.fillStyle = "#ffffff";
    ctx.font = `400 42px ${scene.fontFamily}`;
    ctx.fillText(revealText(column.value, dart.revealFraction), 0, STAT_VALUE_BASELINE + dart.offsetY);
    if (column.suffix) {
      // Full-string width again, for the same reason as the distance number above.
      const valueWidth = ctx.measureText(column.value).width;
      ctx.font = `400 24px ${scene.fontFamily}`;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillText(revealText(column.suffix, dart.revealFraction), valueWidth + 8, STAT_VALUE_BASELINE + dart.offsetY);
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

export interface ShareCardHitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Generous approximation of the TEMPO/PACE row's footprint on "numero" — centred, same math `drawNumberStats` uses to place it. */
const NUMERO_STATS_BOX: ShareCardHitBox = { x: 120, y: 704, width: 480, height: 148 };
/** Covers the "when" line, the big distance number and the TEMPO/PACE row on "trajeto" — wide enough for a long distance string, tight enough to stay clear of the plate slot beside it. */
const TRAJETO_STATS_BOX: ShareCardHitBox = { x: 36, y: 850, width: 520, height: 320 };

function plateHitBox(slot: PlateSlot): ShareCardHitBox {
  const pad = 14;
  return { x: slot.x - slot.size / 2 - pad, y: slot.y - slot.size / 2 - pad, width: slot.size + pad * 2, height: slot.size + pad * 2 };
}

/**
 * Where the draggable stats block, plate/shoe accessory and (on "trajeto")
 * the route trace actually sit — direct hit-areas over each element's real
 * footprint, not a small handle floating near a single anchor point, so
 * touching the number/medal/line itself is what starts a drag (see
 * `share-card-preview.tsx`'s own comment on why: a separate floating
 * "joystick" icon read as an odd control widget rather than the card's own
 * content, real-device feedback 2026-08-29). The route box is computed from
 * `scene.projected` (the run's actual traced points) since — unlike
 * stats/plate — its footprint isn't a fixed layout constant; `null` when
 * there's no line to drag (the "numero" layout never draws one).
 */
export function shareCardHitBoxes(scene: ShareCardScene): {
  stats: ShareCardHitBox;
  plate: ShareCardHitBox;
  route: ShareCardHitBox | null;
} {
  const isNumero = scene.layout === "numero";
  const plateSlot = isNumero ? NUMERO_PLATE_SLOT : TRAJETO_PLATE_SLOT;
  let route: ShareCardHitBox | null = null;
  if (!isNumero && scene.timeline && scene.projected.length >= 2) {
    const xs = scene.projected.map((p) => p.x);
    const ys = scene.projected.map((p) => p.y);
    // Half the thickest outer stroke (20px) plus the start/end circle radius
    // (14px), rounded up — enough padding that the hit-area covers the line
    // itself, not just the points it interpolates between.
    const pad = 36;
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    route = { x: minX - pad, y: minY - pad, width: Math.max(...xs) - minX + pad * 2, height: Math.max(...ys) - minY + pad * 2 };
  }
  return {
    stats: isNumero ? NUMERO_STATS_BOX : TRAJETO_STATS_BOX,
    plate: plateHitBox(plateSlot),
    route,
  };
}

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

/**
 * Sized as a compromise between the two things a vector silhouette couldn't
 * be both at once: small enough not to dominate the card (the original
 * complaint, at 440px), and big enough that the real photo art still reads
 * as a real shoe instead of a mush of duotone noise (the keychain size,
 * 130px, was too far the other way for the photo to survive shrinking).
 */
const TRAJETO_SHOE_SLOT: ShoeSlot = { x: 480, y: 900, width: 220 };
const NUMERO_SHOE_SLOT: ShoeSlot = { x: (SHARE_CARD_WIDTH - 190) / 2, y: 980, width: 190 };

/** The real generated collectible art (see /public/shoe) — a photo, tinted to the registered colour below, applied as a texture on a real rotating WebGL plane (see `shoe3d.ts`) instead of a hand-drawn 3D model. */
const SHOE_IMAGE_SRC = "/shoe/shoe-side.png";

let shoeImage: HTMLImageElement | null = null;

/**
 * Kicks off loading on first request and returns the element only once it's
 * actually decoded — `img.complete`/`naturalWidth` is the standard readiness
 * check, cheaper than tracking load state separately. `null` before that
 * just means this frame draws nothing for the shoe; at 720p over localhost
 * that window is milliseconds, well before the shoe's own pop-in delay ever
 * makes it visible in the first place.
 */
function getShoeImage(): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  if (!shoeImage) {
    shoeImage = new Image();
    shoeImage.src = SHOE_IMAGE_SRC;
  }
  return shoeImage.complete && shoeImage.naturalWidth > 0 ? shoeImage : null;
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
 * done once per colour with canvas composite operations instead, since a
 * `<canvas>` recording has no DOM layers to stack. Cached because it's
 * identical every frame — recomputing a full-res composite 30+ times a
 * second for a shoe that never changes colour mid-video would be wasted
 * work. The result feeds `shoe3d.ts` as a WebGL texture, same as an
 * `<img>` would — a canvas is just as valid a texture source.
 */
const tintedShoeCache = new Map<string, HTMLCanvasElement>();

function getTintedShoeImage(colorHex: string): HTMLCanvasElement | null {
  const source = getShoeImage();
  if (!source) return null;
  const cached = tintedShoeCache.get(colorHex);
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

  tintedShoeCache.set(colorHex, canvas);
  return canvas;
}

/**
 * The registered shoe — real photographed collectible art, tinted to the
 * colour it was registered in, wrapped on a real lit, rotating WebGL plane
 * (`renderShoe3DFrame` in `shoe3d.ts`) and composited onto this 2D canvas
 * like the photo/video background already is. Genuine perspective and
 * lighting response as it turns, not a 2D approximation of either.
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

  const tinted = getTintedShoeImage(shoe.color);
  if (!tinted) return;

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

  // A slower, independent nod on the tilt axis — the turn (`turnRad`) and
  // the tilt don't share a period, so the object never settles into a
  // back-and-forth-on-one-axis loop that reads as flat/mechanical.
  const tiltRad = Math.sin((elapsed / 1000 / 7) * Math.PI * 2) * 0.09;
  const frame = renderShoe3DFrame(tinted, shoe.color, float.turnRad * pop, tiltRad * pop);
  if (frame) {
    const h = targetWidth * (frame.height / frame.width);
    ctx.drawImage(frame, -targetWidth / 2, -h / 2, targetWidth, h);
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
  ctx.scale(scale * dart.scaleX, scale);
  ctx.translate(-SHARE_CARD_WIDTH / 2, -NUMBER_BASELINE_Y);
  if (dart.blurPx > 0) ctx.filter = `blur(${dart.blurPx.toFixed(1)}px)`;

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${NUMBER_FONT_PX}px ${scene.fontFamily}`;
  ctx.fillText(revealText(scene.distance, dart.revealFraction), startX, NUMBER_BASELINE_Y);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = `400 ${NUMBER_UNIT_FONT_PX}px ${scene.fontFamily}`;
  ctx.fillText(revealText(scene.distanceUnit, dart.revealFraction), startX + numberWidth + gap, NUMBER_BASELINE_Y);
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
    ctx.translate(x, 0);
    ctx.scale(dart.scaleX, 1);
    if (dart.blurPx > 0) ctx.filter = `blur(${dart.blurPx.toFixed(1)}px)`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `400 22px ${scene.fontFamily}`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    // Widths from the *full* label/value, not the revealed prefix, so
    // typing in doesn't re-centre the text as characters appear.
    const labelWidth = trackedWidth(ctx, column.label, 2.4);
    trackedText(ctx, revealText(column.label, dart.revealFraction), -labelWidth / 2, NUMBER_STATS_LABEL_Y + dart.offsetY, 2.4);

    ctx.font = `400 40px ${scene.fontFamily}`;
    ctx.fillStyle = "#ffffff";
    const valueWidth = ctx.measureText(column.value).width;
    ctx.fillText(revealText(column.value, dart.revealFraction), -valueWidth / 2, NUMBER_STATS_VALUE_Y + dart.offsetY);
    ctx.restore();
  });
  ctx.textAlign = "left";
}

export function drawShareCardFrame(
  ctx: CanvasRenderingContext2D,
  scene: ShareCardScene,
  elapsed: number,
  durationMs: number = SHARE_CARD_DURATION_MS,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.clearRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  /**
   * Every stage()/dartLanding()/textMotion() call below (route draw, text
   * darts, emblem pop, plus the ambient float/equalizer loops that key off
   * plain `elapsed` directly) was hand-tuned against a SHARE_CARD_DURATION_MS
   * timeline. Rather than rescale each of those constants one by one, the
   * caller's `elapsed` is remapped into that same reference timeline once,
   * right here: picking a duration twice as long runs the *entire*
   * choreography — reveal pacing and ambient motion alike — at half speed,
   * instead of just stretching the total runtime while everything inside it
   * still ticks at the original pace.
   */
  const scale = durationMs / SHARE_CARD_DURATION_MS;
  const t = elapsed / scale;

  // "Só música" replaces the photo/scenario backdrop outright with the
  // track's own artwork — the whole point of that template. Falls through to
  // the usual photo-or-scenario choice if the artwork somehow isn't loaded.
  if (scene.musicMode === "background" && scene.albumArt) drawPhoto(ctx, scene.albumArt, "original");
  else if (scene.video) drawPhoto(ctx, scene.video, scene.photoFilter);
  else if (scene.photos.length >= 2) drawPhotoGrid(ctx, scene.photos, scene.photoGridLayout, scene.photoFilter);
  else if (scene.photos.length === 1) drawPhoto(ctx, scene.photos[0], scene.photoFilter);
  else drawScenario(ctx, scene.scenario);

  if (scene.layout === "numero") {
    drawNumberHero(ctx, scene, t);
  } else {
    const routeOffset = scene.layoutOverrides.route;
    if (routeOffset) ctx.translate(routeOffset.dx, routeOffset.dy);
    drawRoute(ctx, scene, t);
    if (routeOffset) ctx.translate(-routeOffset.dx, -routeOffset.dy);
  }

  // A record and a shoe want the same slot; the record wins, because a card
  // announcing a PR is doing a different job than one showing off the kit.
  const [plateSlotBase, plateStart, shoeSlotBase, shoeStart] =
    scene.layout === "numero"
      ? [NUMERO_PLATE_SLOT, NUMERO_PLATE_POP_START, NUMERO_SHOE_SLOT, NUMERO_PLATE_POP_START]
      : [TRAJETO_PLATE_SLOT, TRAJETO_PLATE_POP_START, TRAJETO_SHOE_SLOT, TRAJETO_PLATE_POP_START];
  // Same offset for both slots — whichever accessory is actually showing is
  // the one the athlete dragged, and the other slot's position never
  // matters since the two are mutually exclusive.
  const plateOffset = scene.layoutOverrides.plate;
  const plateSlot = plateOffset ? { ...plateSlotBase, x: plateSlotBase.x + plateOffset.dx, y: plateSlotBase.y + plateOffset.dy } : plateSlotBase;
  const shoeSlot = plateOffset ? { ...shoeSlotBase, x: shoeSlotBase.x + plateOffset.dx, y: shoeSlotBase.y + plateOffset.dy } : shoeSlotBase;
  if (!scene.layoutOverrides.hidden?.plate) {
    if (scene.record) drawPlate(ctx, scene, scene.record, t, plateSlot, plateStart);
    else if (scene.shoe) drawShoe(ctx, scene.shoe, t, shoeSlot, shoeStart);
  }

  const chromeAlpha = easeOut(stage(t, 0, 360));
  drawBrandPill(ctx, STAT_LEFT, CHROME_TOP, t);
  // The scenario badge names the illustrated sky; over someone's own photo —
  // or the album art in "só música" — it would be naming a background that
  // isn't there.
  if (scene.photos.length === 0 && !scene.video && scene.musicMode !== "background") {
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

  if (!scene.layoutOverrides.hidden?.stats) {
    const statsOffset = scene.layoutOverrides.stats;
    if (statsOffset) ctx.translate(statsOffset.dx, statsOffset.dy);

    if (scene.layout === "numero") {
      drawNumberStats(ctx, scene, t);
    } else {
      drawStats(ctx, scene, t);
    }

    if (statsOffset) ctx.translate(-statsOffset.dx, -statsOffset.dy);
  }

  // The music chip stays put even when the stats block is dragged — it
  // isn't part of the "stats" element the athlete is offered a handle for
  // (see ShareCardLayoutOverrides), just something that happens to sit near
  // it in the default layout.
  if (scene.layout === "numero" && scene.musicMode !== "none") {
    drawMusicChip(ctx, scene, t, SHARE_CARD_WIDTH / 2, NUMERO_MUSIC_CHIP_Y, "center", NUMERO_MUSIC_CHIP_POP_START);
  }
}
