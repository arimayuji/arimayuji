"use client";

import { useState } from "react";
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
  const { accent, rank, title, subtitle } = collectibleDisplay(category, value);

  const handleOpen = () => {
    setOpened(true);
    onOpened();
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
            className="relative mx-auto block w-full disabled:cursor-default"
          >
            {!opened && !reducedMotion && (
              <span
                className="pr-halo pointer-events-none absolute inset-0 rounded-full blur-2xl"
                style={{ backgroundColor: accent, opacity: 0.4 }}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative block transition-transform duration-500 ease-out ${
                opened ? "scale-100" : "scale-90 active:scale-95"
              }`}
            >
              <EmblemBadge
                category={category}
                value={value}
                accent={accent}
                state={opened ? "opened" : "sealed"}
              />
            </span>
          </button>

          {opened ? (
            <div className="mt-4">
              <p
                className="font-mono text-xs font-semibold uppercase tracking-[0.3em]"
                style={{ color: accent }}
              >
                Emblema Nº {rank}
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
