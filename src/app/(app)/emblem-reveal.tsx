"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import { collectibleDisplay } from "@/lib/tracking/collectibles";
import type { EmblemCategory } from "@/lib/tracking/storage";
import { EmblemBadge } from "./emblem-badge";
import { ModalPortal } from "./modal-portal";

/**
 * Opening one milestone emblem — deliberately a simpler reveal than the PR
 * shoebox (`achievement-reveal.tsx`): a tap pops the sealed pin into its
 * real design with a scale/glow beat, no 3D lid to animate. The whole point
 * is that this collection is a different kind of thing from a PR trophy
 * case, and the reveal should read that way too, not reuse the same
 * ceremony for two systems that are meant to stay separate.
 */
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
                className={`relative block transition-transform duration-500 ease-out ${
                  opened ? "scale-100" : "scale-90 active:scale-95"
                }`}
              >
                <EmblemBadge
                  category={category}
                  value={value}
                  metal={metal}
                  state={opened ? "opened" : "sealed"}
                />
              </span>
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
