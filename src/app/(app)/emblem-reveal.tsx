"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import { collectibleDisplay } from "@/lib/tracking/collectibles";
import type { EmblemCategory } from "@/lib/tracking/storage";
import { EmblemBadge } from "./emblem-badge";
import { ModalPortal } from "./modal-portal";

/**
 * Opening one milestone emblem — deliberately a simpler reveal than the PR
 * shoebox (`achievement-reveal.tsx`): a tap cracks the sealed sphere open
 * (see `CrackBurst`) into its real design, no 3D lid to animate. The whole
 * point is that this collection is a different kind of thing from a PR
 * trophy case, and the reveal should read that way too, not reuse the same
 * ceremony for two systems that are meant to stay separate.
 */

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

  const handleOpen = () => {
    setOpened(true);
    onOpened();
  };

  // Something weightless pushes back when you nudge it — a drag offset,
  // clamped short and eased with an overshoot on release (the spring),
  // layered on the ambient float instead of replacing it: the two transforms
  // live on nested elements so neither's `transform` overwrites the other's.
  const NUDGE_MAX = 26;
  const [nudge, setNudge] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOriginRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (opened || reducedMotion) return;
    // Safari and a couple of Android WebViews throw on a pointer id that
    // isn't (yet) active — capture is a nice-to-have (keeps the drag
    // tracking even if the finger slides off the sphere), not a
    // precondition for the nudge itself.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignored — see above
    }
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!dragging) return;
    const dx = event.clientX - dragOriginRef.current.x;
    const dy = event.clientY - dragOriginRef.current.y;
    const distance = Math.hypot(dx, dy);
    const scale = distance > NUDGE_MAX ? NUDGE_MAX / distance : 1;
    setNudge({ x: dx * scale, y: dy * scale });
  };

  const endDrag = () => {
    setDragging(false);
    setNudge({ x: 0, y: 0 });
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

        <div className="w-full max-w-[260px] text-center">
          <button
            type="button"
            disabled={opened}
            onClick={handleOpen}
            aria-label={opened ? undefined : "Abrir o emblema"}
            className={`relative mx-auto block w-full touch-none disabled:cursor-default ${
              !opened && !reducedMotion ? "pr-float-zerog" : ""
            }`}
          >
            <span
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="relative block"
              style={{
                transform: `translate(${nudge.x}px, ${nudge.y}px)`,
                transition: dragging ? "none" : "transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              {!opened && !reducedMotion && (
                <>
                  <span
                    className="pr-halo pointer-events-none absolute inset-0 rounded-full blur-2xl"
                    style={{ backgroundColor: accent, opacity: 0.4 }}
                    aria-hidden="true"
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
              <span
                className={`relative block ${
                  opened
                    ? !alreadyOpened && !reducedMotion
                      ? "pr-crack-emerge"
                      : "scale-100"
                    : "scale-90 transition-transform duration-500 ease-out active:scale-95"
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
            <div className="mt-4">
              <p
                className="font-mono text-xs font-semibold uppercase tracking-[0.3em]"
                style={{ color: accent }}
              >
                Emblema Nº {rank} · {metal.name}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-balance text-white">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-pretty text-white/70">{subtitle}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 rounded-full border border-white/25 px-6 py-2.5 text-sm font-semibold text-white"
              >
                Guardar
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm font-semibold text-white">Toque pra abrir</p>
              <p className="mt-1 text-xs text-white/55">Um emblema novo pra sua coleção.</p>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
