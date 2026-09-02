"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import { collectibleDisplay } from "@/lib/tracking/collectibles";
import type { EmblemCategory } from "@/lib/tracking/storage";
import { EmblemBadge } from "./emblem-badge";
import { ModalPortal } from "./modal-portal";
import { delay } from "./ui";

/**
 * Opening one milestone emblem — deliberately a simpler reveal than the PR
 * shoebox (`achievement-reveal.tsx`): the sealed sphere is charged open
 * (see `CrackBurst`) into its real design, no 3D lid to animate. The whole
 * point is that this collection is a different kind of thing from a PR
 * trophy case, and the reveal should read that way too, not reuse the same
 * ceremony for two systems that are meant to stay separate.
 *
 * Two things were rebuilt here after watching the old version frame by
 * frame (Playwright, 60ms apart) instead of reading the JSX:
 *
 * 1. **The whole ceremony was over in ~150ms.** The shell fractured on
 *    schedule, but the tier line, title, subtitle and button were all
 *    already at full opacity in the very first frame — arriving *before*
 *    the emblem they are supposed to be announcing. Nothing had weight
 *    because nothing waited its turn. They now cascade after the emblem
 *    lands (`REVEAL_BEATS`), which is the entire difference between a
 *    state change and a moment.
 *
 * 2. **The ring around the sphere promised a mechanic it did not have.**
 *    It read as a progress arc but was ambient decoration on a loop, and
 *    the emblem opened on a dry tap. It is now driven by a real hold —
 *    see `CHARGE_MS`. This is also the one interaction in the app that
 *    earns overshoot: the burst inherits momentum the finger built up,
 *    which is exactly the condition the spring tokens in globals.css
 *    reserve bounce for.
 */

/** How long the hold runs before the shell gives. Long enough to feel like effort, short enough that nobody thinks it is stuck. */
const CHARGE_MS = 620;

/**
 * When each line of copy arrives, in ms after the burst. The emblem's own
 * emerge animation ends around 760ms (200ms delay + 560ms), so the first
 * line lands just as it settles and the rest follow close behind — a
 * cascade, never a stack that appears at once.
 */
const REVEAL_BEATS = { tier: 620, title: 720, subtitle: 820, button: 960 } as const;

/**
 * The instant beat between "sealed" and "opened": the ambient `.pr-orbit`
 * shimmer winds up into a fast spin, fracture lines flash across the shell,
 * two shards fly clear, and the emblem itself bursts out from underneath —
 * see the `pr-crack-*` keyframes in globals.css. Mounted only on the actual
 * tap-to-open transition (the caller gates this on `!alreadyOpened`), so
 * revisiting an emblem you already own never replays it.
 */
function CrackBurst({ accent }: { accent: string }) {
  return (
    <>
      {/* Thrown clear of the sphere's own bounds — the point is force leaving it, so it must not be clipped to the disc. */}
      <span
        className="pr-shockwave pointer-events-none absolute inset-0 rounded-full border border-solid"
        style={{ borderColor: accent }}
        aria-hidden="true"
      />
      <span
        className="pr-flash pointer-events-none absolute -inset-[40%] rounded-full"
        style={{ background: `radial-gradient(circle, #ffffff 0%, ${accent}80 38%, transparent 68%)` }}
        aria-hidden="true"
      />
      <span
        className="pr-crack-spin pointer-events-none absolute inset-0 overflow-hidden rounded-full"
        aria-hidden="true"
      >
        <span
          className="absolute -inset-[25%]"
          style={{
            background: `conic-gradient(from 0deg, transparent 0%, transparent 55%, ${accent}66 68%, #ffffffe6 76%, ${accent}66 84%, transparent 96%, transparent 100%)`,
          }}
        />
      </span>
      {/* Two shell halves, clipped to a jagged seam instead of a flat diameter — the same reason a shard reads as broken glass rather than a cleanly cut disc. */}
      <span
        className="pr-crack-shard-a pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 24%, rgba(255,255,255,0.7) 0%, transparent 40%), rgba(6,8,11,0.85)",
          clipPath: "polygon(0% 0%, 100% 0%, 58% 42%, 34% 62%, 46% 74%, 22% 78%, 0% 58%)",
        }}
        aria-hidden="true"
      />
      <span
        className="pr-crack-shard-b pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 72% 78%, rgba(0,0,0,0.85) 0%, transparent 55%), rgba(6,8,11,0.8)",
          clipPath: "polygon(100% 100%, 0% 100%, 40% 60%, 58% 66%, 46% 44%, 66% 36%, 100% 48%)",
        }}
        aria-hidden="true"
      />
      <svg viewBox="0 0 120 120" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {[
            { d: "M60 14 L54 40 L70 52 L58 78 L66 106", delay: "0ms" },
            { d: "M14 50 L44 56 L36 72 L60 66 L96 92", delay: "40ms" },
            { d: "M106 30 L76 50 L88 66 L60 60 L30 100", delay: "70ms" },
          ].map((line) => (
            <path
              key={line.d}
              d={line.d}
              className="pr-crack-line"
              stroke="#ffffff"
              style={{ animationDelay: line.delay }}
            />
          ))}
        </g>
      </svg>
    </>
  );
}
export function EmblemReveal({
  category = "distancia",
  value,
  alreadyOpened,
  onOpened,
  onClose,
}: {
  category?: EmblemCategory;
  value: number;
  alreadyOpened: boolean;
  /** Fires the instant the pop starts, never on mount — same rule the PR reveal follows. */
  onOpened: () => void;
  onClose: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [opened, setOpened] = useState(alreadyOpened || reducedMotion);
  const { metal, rank, title, subtitle } = collectibleDisplay(category, value);
  const accent = metal.accent;

  /**
   * The hold. `--charge` (0..1) is written straight onto the node by the rAF
   * loop and never through React state: at 60fps a state-driven charge would
   * re-render this tree ~37 times across one press for a value only CSS ever
   * reads. `charging` is a boolean because it gates classes, and a boolean
   * flips twice, not every frame.
   */
  const orbRef = useRef<HTMLSpanElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [charging, setCharging] = useState(false);
  const chargingRef = useRef(false);
  const lastTickRef = useRef(0);

  const setCharge = (value: number) => {
    orbRef.current?.style.setProperty("--charge", String(value));
  };

  const stopLoop = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const handleOpen = useCallback(() => {
    stopLoop();
    chargingRef.current = false;
    setCharging(false);
    setCharge(0);
    // Fires on the same frame the shell gives, never on a timer of its own —
    // visual, haptic and (on native) the sound the OS plays for an impact all
    // have to land together or the illusion of one physical event breaks.
    void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    setOpened(true);
    onOpened();
  }, [onOpened]);

  const beginCharge = () => {
    if (opened || reducedMotion || chargingRef.current) return;
    chargingRef.current = true;
    setCharging(true);
    const startedAt = performance.now();
    lastTickRef.current = 0;

    const step = (now: number) => {
      if (!chargingRef.current) return;
      const progress = Math.min(1, (now - startedAt) / CHARGE_MS);
      setCharge(progress);
      // Ticks that get closer together as the ring fills — the wind-up is
      // felt, not just watched, and the accelerating rhythm is what tells a
      // finger it is nearly there without a number on screen.
      const tick = Math.floor(progress * progress * 7);
      if (tick > lastTickRef.current) {
        lastTickRef.current = tick;
        void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      }
      if (progress >= 1) {
        handleOpen();
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  /** Let go early and it springs back rather than holding a half-charge — a partial charge that persisted would be a state nobody asked to be in. */
  const releaseCharge = () => {
    if (!chargingRef.current) return;
    chargingRef.current = false;
    setCharging(false);
    stopLoop();
    const node = orbRef.current;
    if (!node) return;
    const from = Number(node.style.getPropertyValue("--charge") || 0);
    const startedAt = performance.now();
    const decay = (now: number) => {
      const t = Math.min(1, (now - startedAt) / 260);
      setCharge(from * (1 - t));
      if (t < 1) rafRef.current = requestAnimationFrame(decay);
    };
    rafRef.current = requestAnimationFrame(decay);
  };

  useEffect(() => stopLoop, []);

  // The cascade only plays on a real first open; a revisit renders the card
  // already finished, with no delay to sit through.
  const staging = opened && !alreadyOpened && !reducedMotion;
  const cascade = staging ? "pr-enter" : "";
  const beat = (ms: number) => (staging ? delay(ms) : undefined);

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

        <div className="w-full max-w-[260px] text-center">
          <button
            type="button"
            disabled={opened}
            onPointerDown={beginCharge}
            onPointerUp={releaseCharge}
            onPointerLeave={releaseCharge}
            onPointerCancel={releaseCharge}
            // Keyboard and assistive tech never get a press-and-hold, so the
            // charge is a progressive enhancement over a plain activation,
            // not the only door in.
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") handleOpen();
            }}
            aria-label={opened ? undefined : "Segurar para abrir o emblema"}
            className={`relative mx-auto block w-full touch-none disabled:cursor-default ${
              !opened && !reducedMotion && !charging ? "pr-float-zerog" : ""
            }`}
          >
            <span
              ref={orbRef}
              className="relative block"
              style={{
                // Compresses as it charges, then releases — the squash is the
                // energy going in, so the burst reads as it coming back out.
                transform: "scale(calc(1 - var(--charge, 0) * 0.09))",
                transition: charging ? "none" : "transform 260ms var(--ease-spring)",
              }}
            >
              {!opened && !reducedMotion && (
                <>
                  <span
                    className="pr-halo pointer-events-none absolute inset-0 rounded-full blur-2xl"
                    style={{ backgroundColor: accent, opacity: 0.4 }}
                    aria-hidden="true"
                  />
                  {/*
                    The charge ring. This arc used to be ambient decoration
                    that *looked* like progress; it is now the real thing —
                    `--charge` is the same value the rAF loop is writing, so
                    what the sphere appears to be doing is what it is doing.
                    Sits outside the disc's own bounds so it reads as a gauge
                    around the orb rather than a band painted on it.
                  */}
                  <span
                    className="pointer-events-none absolute -inset-[7%] rounded-full"
                    aria-hidden="true"
                    style={{
                      background: `conic-gradient(from -90deg, ${accent} 0deg, #ffffff calc(var(--charge, 0) * 360deg), transparent calc(var(--charge, 0) * 360deg))`,
                      opacity: charging ? 0.95 : 0,
                      transition: "opacity 200ms ease-out",
                      // A ring, not a filled pie: punch the middle out.
                      mask: "radial-gradient(circle, transparent 0 calc(50% - 3px), #000 calc(50% - 3px))",
                      WebkitMask:
                        "radial-gradient(circle, transparent 0 calc(50% - 3px), #000 calc(50% - 3px))",
                    }}
                  />
                  {/* A light source slowly circling the sealed sphere — reads as glass/orb rather than a flat dark disc. */}
                  <span
                    className="pr-orbit pointer-events-none absolute inset-0 overflow-hidden rounded-full"
                    aria-hidden="true"
                  >
                    <span
                      className="absolute -inset-[15%]"
                      style={{
                        background: `conic-gradient(from 0deg, transparent 0%, transparent 62%, ${accent}55 72%, #ffffffb3 78%, ${accent}55 84%, transparent 94%, transparent 100%)`,
                      }}
                    />
                  </span>
                  <span
                    className="pointer-events-none absolute top-[16%] left-[22%] h-[18%] w-[18%] rounded-full bg-white/70 blur-md"
                    aria-hidden="true"
                  />
                  {/*
                    Disco-ball facets: small coloured glints scattered across the
                    sphere instead of just the one edge-riding ring, each on its
                    own twinkle timer — a mirror ball never catches the light in
                    only one spot at a time.
                  */}
                  <span
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
                    aria-hidden="true"
                  >
                    {[
                      { top: "28%", left: "62%", size: "10%", color: accent, delay: "0s" },
                      { top: "58%", left: "20%", size: "7%", color: "#ffffff", delay: "0.5s" },
                      { top: "70%", left: "68%", size: "8%", color: accent, delay: "1.1s" },
                      { top: "40%", left: "42%", size: "6%", color: "#ffffff", delay: "1.6s" },
                      { top: "20%", left: "40%", size: "6%", color: accent, delay: "0.85s" },
                    ].map((glint, i) => (
                      <span
                        key={i}
                        className="pr-glint absolute rounded-full blur-[2px]"
                        style={{
                          top: glint.top,
                          left: glint.left,
                          width: glint.size,
                          height: glint.size,
                          backgroundColor: glint.color,
                          animationDelay: glint.delay,
                        }}
                      />
                    ))}
                  </span>
                </>
              )}
              {/* Behind the emblem, never over it — light arriving to meet the thing that just landed. */}
              {opened && !alreadyOpened && !reducedMotion && (
                <span
                  className="pr-godray pointer-events-none absolute -inset-[55%] -z-10"
                  aria-hidden="true"
                  style={{
                    background: `conic-gradient(from 0deg, transparent 0deg, ${accent}66 12deg, transparent 26deg, transparent 62deg, #ffffff4d 72deg, transparent 86deg, transparent 140deg, ${accent}59 152deg, transparent 168deg, transparent 232deg, #ffffff40 242deg, transparent 258deg, transparent 310deg, ${accent}4d 322deg, transparent 338deg)`,
                    maskImage: "radial-gradient(circle, #000 12%, transparent 62%)",
                    WebkitMaskImage: "radial-gradient(circle, #000 12%, transparent 62%)",
                  }}
                />
              )}
              <span
                className={`relative block ${
                  opened
                    ? !alreadyOpened && !reducedMotion
                      ? "pr-crack-emerge"
                      : "scale-100"
                    : "scale-90 transition-transform duration-500 ease-out"
                }`}
              >
                <EmblemBadge
                  category={category}
                  value={value}
                  metal={metal}
                  state={opened ? "opened" : "sealed"}
                />
              </span>
              {/* Sibling, not a child of the span above — that span carries its own
                  opacity/transform animation for the badge emerging, and nesting
                  the burst inside it would drag the crack/shards/spin along for
                  that same fade-and-delay instead of playing immediately. */}
              {opened && !alreadyOpened && !reducedMotion && <CrackBurst accent={accent} />}
            </span>
          </button>

          {opened ? (
            // Staged, not simultaneous. Skipped entirely on a revisit
            // (`alreadyOpened`) — an emblem you already own should show its
            // card instantly, not re-perform the ceremony every time you
            // tap it in the grid.
            <div className="mt-4">
              <p
                className={`font-mono text-xs font-semibold uppercase tracking-[0.3em] ${cascade}`}
                style={{ color: accent, ...beat(REVEAL_BEATS.tier) }}
              >
                Emblema Nº {rank} · {metal.name}
              </p>
              <h2
                className={`mt-2 text-lg font-semibold text-balance text-white ${cascade}`}
                style={beat(REVEAL_BEATS.title)}
              >
                {title}
              </h2>
              <p
                className={`mt-2 text-sm leading-relaxed text-pretty text-white/70 ${cascade}`}
                style={beat(REVEAL_BEATS.subtitle)}
              >
                {subtitle}
              </p>
              <button
                type="button"
                onClick={onClose}
                className={`pr-press mt-6 rounded-full border border-white/25 px-6 py-2.5 text-sm font-semibold text-white active:scale-95 ${cascade}`}
                style={beat(REVEAL_BEATS.button)}
              >
                Guardar
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm font-semibold text-white">
                {charging ? "Segura…" : "Segure pra abrir"}
              </p>
              <p className="mt-1 text-xs text-white/55">Um emblema novo pra sua coleção.</p>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
