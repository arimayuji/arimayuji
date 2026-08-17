"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import { formatDeltaDuration } from "@/lib/tracking/geoFilter";
import { TIER_LABEL, type Achievement } from "@/lib/tracking/achievements";
import type { RunRecord } from "@/lib/tracking/personalRecords";
import { TIER_PAINT, tintedStops } from "@/lib/plateMetal";
import { AchievementPlate } from "./achievement-plate";
import { ModalPortal } from "./modal-portal";
import { HORSE_FULL_BODY_PATHS } from "../horse-mark";

/**
 * Opening the box.
 *
 * A shoebox drawn in the same chrome/ink register as the showcase shoe, in a
 * three-quarter view: lid lifts and tips away, light floods out of the mouth
 * in the tier's colour, and the plate rises out and settles into the shared
 * `pr-drift`/`pr-tumble-*` float. The whole sequence is one `data-unbox` flip
 * — the choreography is per-element transition delays in globals.css, so
 * there is no timer chain to keep in sync and nothing to unwind if the modal
 * is closed mid-reveal.
 *
 * The lid's own chrome is tinted to the tier now too — a rubi/platina/
 * diamante/prata/ouro finish the same way a Rainbow Six crate skin reads its
 * rarity off the case, not just the drop inside it — using the exact same
 * `tintedStops` ramp the plate itself is painted with, so the box and what
 * comes out of it are provably the same metal.
 */

const VIEW_BOX = "0 -80 240 240";

const BOX = {
  frontBottomLeft: "30 150",
  frontBottomRight: "170 150",
  frontTopLeft: "30 92",
  frontTopRight: "170 92",
  backTopLeft: "76 62",
  backTopRight: "216 62",
  backBottomRight: "216 120",
};

const BOX_FRONT = `M ${BOX.frontBottomLeft} L ${BOX.frontBottomRight} L ${BOX.frontTopRight} L ${BOX.frontTopLeft} Z`;
const BOX_SIDE = `M ${BOX.frontBottomRight} L ${BOX.backBottomRight} L ${BOX.backTopRight} L ${BOX.frontTopRight} Z`;
const BOX_MOUTH = `M ${BOX.frontTopLeft} L ${BOX.frontTopRight} L ${BOX.backTopRight} L ${BOX.backTopLeft} Z`;

/** Overhangs the body by 4 units on each side, the way a real shoebox lid does. */
const LID_FRONT = "M 26 96 L 174 96 L 174 79 L 26 79 Z";
const LID_SIDE = "M 174 96 L 222 64 L 222 47 L 174 79 Z";
const LID_TOP = "M 26 79 L 174 79 L 222 47 L 74 47 Z";

/**
 * Maps the horse mark's own 0–100 art space flat onto `LID_TOP`'s
 * parallelogram — bottom-left (26,79), a (148,0) width vector along the
 * front edge, a (48,-32) depth vector up the receding side — instead of an
 * eyeballed rotate() that never actually matched that quad's shear. Occupies
 * the middle 60% of the face (`F`), so it reads as stamped flat into the lid
 * rather than floating tilted above it.
 */
const LID_TOP_BL: readonly [number, number] = [26, 79];
const LID_TOP_WIDTH: readonly [number, number] = [148, 0];
const LID_TOP_DEPTH: readonly [number, number] = [48, -32];
const LID_MARK_FILL = 0.6;

function lidMarkMatrix(): string {
  const [bx, by] = LID_TOP_BL;
  const [wx] = LID_TOP_WIDTH;
  const [dx, dy] = LID_TOP_DEPTH;
  const f = LID_MARK_FILL;
  const a = (wx / 100) * f;
  const c = (dx / 100) * f;
  const d = (dy / 100) * f;
  const e = bx + (wx + dx) * ((1 - f) / 2);
  const g = by + dy * ((1 - f) / 2);
  return `matrix(${a} 0 ${c} ${d} ${e} ${g})`;
}

function ChromeStops({ stops }: { stops: ReadonlyArray<readonly [number, string]> }) {
  return (
    <>
      {stops.map(([offset, color]) => (
        <stop key={offset} offset={`${offset}%`} stopColor={color} />
      ))}
    </>
  );
}

function BoxInterior({ uid, glow }: { uid: string; glow: string }) {
  return (
    <svg viewBox={VIEW_BOX} className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        {/* Used to reach zero exactly at the top of the viewBox — any
            container even a hair shorter than assumed then clips the shaft
            mid-fade, showing its hard straight top edge instead of a
            dissolve. Now finishes fading a full 70 units of margin before
            that edge (y2 -10, not -80), and drops faster up front (steeper
            early stops) so most of the shaft is already near-invisible well
            within the visible frame — a real buffer, not an exact edge
            match, is what actually survives varying container sizes. */}
        <linearGradient id={`${uid}-shaft`} x1="0" y1="76" x2="0" y2="-10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={glow} stopOpacity="0.55" />
          <stop offset="20%" stopColor={glow} stopOpacity="0.22" />
          <stop offset="55%" stopColor={glow} stopOpacity="0.05" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-mouth`} cx="0.5" cy="0.55" r="0.62">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="46%" stopColor={glow} />
          <stop offset="100%" stopColor={glow} stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <path d={BOX_MOUTH} fill="#05070a" />
      {/* Blurred rather than left hard-edged — a real light shaft (or the
          searchlight beams this is going for) is soft and hazy at every
          edge, not a flat-shaded polygon with a visible straight side and
          corner. The blur also folds into the margin above: it softens
          whatever sliver of the fade is still faintly non-zero into
          nothing perceptible, instead of relying on opacity alone. */}
      <g className="pr-unbox-shaft blur-md">
        <path d="M 78 63 L 214 63 L 330 -150 L -40 -150 Z" fill={`url(#${uid}-shaft)`} />
        <path d={BOX_MOUTH} fill={`url(#${uid}-mouth)`} />
      </g>
    </svg>
  );
}

function BoxShell({ uid, achievement }: { uid: string; achievement: Achievement }) {
  const paint = TIER_PAINT[achievement.tier];
  const lidStops = tintedStops(paint, achievement.hueShift, achievement.tintScale);
  const lidMarkTransform = lidMarkMatrix();

  return (
    <svg viewBox={VIEW_BOX} className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-lid`} x1="0" y1="42" x2="0" y2="100" gradientUnits="userSpaceOnUse">
          <ChromeStops stops={lidStops} />
        </linearGradient>
        <linearGradient id={`${uid}-lidtop`} x1="26" y1="98" x2="222" y2="45" gradientUnits="userSpaceOnUse">
          <ChromeStops stops={lidStops} />
        </linearGradient>
        <linearGradient id={`${uid}-body`} x1="0" y1="90" x2="0" y2="152" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#333c46" />
          <stop offset="38%" stopColor="#1b222a" />
          <stop offset="100%" stopColor="#0c1015" />
        </linearGradient>
        <linearGradient id={`${uid}-side`} x1="170" y1="96" x2="222" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10161d" />
          <stop offset="100%" stopColor="#262e38" />
        </linearGradient>
      </defs>

      <g stroke="#0a0e12" strokeWidth="2" strokeLinejoin="round">
        <path d={BOX_SIDE} fill={`url(#${uid}-side)`} />
        <path d={BOX_FRONT} fill={`url(#${uid}-body)`} />
      </g>
      <path d="M 30 121 L 170 121" stroke={paint.glow} strokeWidth="2.6" opacity="0.6" strokeLinecap="round" />
      <text
        x="100"
        y="141"
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize="10"
        letterSpacing="3.4"
        fill="#7c858e"
      >
        XANTHUS
      </text>

      <g className="pr-unbox-lid">
        <g stroke="#0a0e12" strokeWidth="2" strokeLinejoin="round">
          <path d={LID_SIDE} fill={`url(#${uid}-lid)`} />
          <path d={LID_TOP} fill={`url(#${uid}-lidtop)`} />
          <path d={LID_FRONT} fill={`url(#${uid}-lid)`} />
        </g>
        {/* Flat on the lid's own face, not tilted above it — see lidMarkMatrix(). */}
        <g transform={lidMarkTransform} fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <g transform="translate(2.4 2.4)" stroke="#ffffff" opacity="0.5">
            {HORSE_FULL_BODY_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g stroke="#11151a" opacity="0.85">
            {HORSE_FULL_BODY_PATHS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </g>
      </g>
    </svg>
  );
}

/**
 * `left`/`top`/`width` park the plate art (120 units wide) so its centre lands
 * just clear of the open mouth inside the 240-unit box viewBox. It is plain
 * HTML rather than part of either SVG so it can sit *between* the two layers —
 * genuinely occluded by the box front while it is still inside — and still use
 * the shared 3D tumble divs.
 */
function Stage({
  achievement,
  label,
  uid,
  tumbleDelayMs,
}: {
  achievement: Achievement;
  label: string;
  uid: string;
  tumbleDelayMs: number;
}) {
  const glow = TIER_PAINT[achievement.tier].glow;
  const delay = { animationDelay: `${tumbleDelayMs}ms` };

  return (
    <>
      <BoxInterior uid={uid} glow={glow} />
      <div
        className="pr-unbox-item absolute left-[26.25%] top-[7.5%] w-1/2"
        style={{ perspective: "900px" }}
      >
        <div
          className="pr-unbox-glow pointer-events-none absolute left-1/2 top-1/2 h-[190%] w-[190%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl"
          style={{ background: `radial-gradient(closest-side, ${glow}, transparent 74%)` }}
        />
        <div className="pr-drift relative" style={delay}>
          <div
            className="pr-tumble-y"
            style={{ ...delay, transformStyle: "preserve-3d", transform: "rotateY(-26deg)" }}
          >
            <div
              className="pr-tumble-x"
              style={{ ...delay, transformStyle: "preserve-3d", transform: "rotateX(8deg) rotateZ(-3deg)" }}
            >
              <AchievementPlate achievement={achievement} label={label} />
            </div>
          </div>
        </div>
      </div>
      <BoxShell uid={uid} achievement={achievement} />
    </>
  );
}

function improvementLine(record: RunRecord, achievement: Achievement): string {
  if (record.previousBestSeconds === null || achievement.improvement === null) {
    return "Primeira vez que você cobre essa distância.";
  }
  const saved = formatDeltaDuration(record.previousBestSeconds - record.splitSeconds);
  const percent = (achievement.improvement * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  });
  return `${saved} mais rápido que seu melhor anterior — ${percent}% de ganho.`;
}

export function AchievementReveal({
  record,
  achievement,
  alreadyOpened,
  onOpened,
  onClose,
}: {
  record: RunRecord;
  achievement: Achievement;
  alreadyOpened: boolean;
  /** Fires the instant the lid starts moving, never on mount — the card underneath must not wear its tier before the athlete has seen it. */
  onOpened: () => void;
  onClose: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [opened, setOpened] = useState(alreadyOpened || reducedMotion);
  const paint = TIER_PAINT[achievement.tier];
  const tiltRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    setOpened(true);
    onOpened();
    const el = tiltRef.current;
    if (el) {
      el.classList.remove("pr-box-tilt-active");
      el.style.transform = "";
      el.style.setProperty("--sheen-o", "0");
    }
  };

  /**
   * Sealed box only — a Pokémon-card-style tilt the athlete drives with a
   * finger or the cursor, not an ambient loop. No transition while the
   * pointer is actively moving so it tracks 1:1; `pr-box-tilt-active` is
   * what suppresses it, and comes off on release so the spring-back in
   * globals.css can take over.
   */
  const handleTiltMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (opened || reducedMotion) return;
    const el = tiltRef.current;
    if (!el) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    el.classList.add("pr-box-tilt-active");
    el.style.transform = `rotateX(${(0.5 - py) * 22}deg) rotateY(${(px - 0.5) * 30}deg)`;
    el.style.setProperty("--sheen-x", `${px * 100}%`);
    el.style.setProperty("--sheen-y", `${py * 100}%`);
    el.style.setProperty("--sheen-o", "1");
  };

  const handleTiltEnd = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.classList.remove("pr-box-tilt-active");
    el.style.transform = "";
    el.style.setProperty("--sheen-o", "0");
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-black/95 px-6 py-8 text-foreground backdrop-blur-md">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="w-full max-w-[340px]" data-unbox={opened ? "open" : "sealed"}>
          <button
            type="button"
            disabled={opened}
            onClick={handleOpen}
            onPointerMove={handleTiltMove}
            onPointerLeave={handleTiltEnd}
            onPointerUp={handleTiltEnd}
            onPointerCancel={handleTiltEnd}
            aria-label={opened ? undefined : "Abrir a caixa — arraste pra girar"}
            className="relative block aspect-square w-full overflow-hidden disabled:cursor-default"
            style={{ perspective: opened ? undefined : "1000px", touchAction: opened ? undefined : "none" }}
          >
            <div ref={tiltRef} className="pr-box-tilt absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
              <Stage
                achievement={achievement}
                label={record.label}
                uid={`unbox-${record.targetMeters}`}
                tumbleDelayMs={alreadyOpened || reducedMotion ? 0 : 1850}
              />
              {!opened && !reducedMotion && (
                <div className="pr-box-sheen pointer-events-none absolute inset-0" aria-hidden="true" />
              )}
            </div>
          </button>

          {opened ? (
            <div className="pr-unbox-copy mt-2 text-center">
              <p
                className="font-mono text-xs font-semibold uppercase tracking-[0.3em]"
                style={{ color: paint.glow }}
              >
                {TIER_LABEL[achievement.tier]}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-balance text-white">
                Seu melhor tempo nos {record.label}!
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-pretty text-white/70">
                {improvementLine(record, achievement)}
              </p>
              <p className="mt-4 font-mono text-[11px] tracking-[0.18em] text-white/40">
                Nº {achievement.serial}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 rounded-full border border-white/25 px-6 py-2.5 text-sm font-semibold text-white"
              >
                Guardar
              </button>
            </div>
          ) : (
            <div className="mt-2 text-center">
              <p className="text-sm font-semibold text-white">Toque pra abrir</p>
              <p className="mt-1 text-xs text-white/55">
                Cada conquista vem com uma peça só sua, gerada a partir dessa corrida.
              </p>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
