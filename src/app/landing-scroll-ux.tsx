"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll interaction layer for the landing page — a fixed progress bar, a
 * side rail tracking the three numbered sections, scroll-snap between
 * sections, and the hero's "role para explorar" cue. Purely an interaction
 * layer on top of what's already there: no copy, no palette, no existing
 * component touched. Kept separate from `reveal.tsx` — that one already
 * handles the fade/rise-in-on-scroll for individual elements and needs
 * nothing added.
 */

const SECTIONS: { id: string; label: string }[] = [
  { id: "evolucao", label: "01" },
  { id: "comunidade", label: "02" },
  { id: "pilares", label: "03" },
];

/** Fixed 3px bar at the very top of the viewport, filled left-to-right by how far down the page the reader is. `transform: scaleX` (not `width`) so the update never triggers layout — only compositing, which is what "no lag" actually requires at 60fps. */
export function ScrollProgressBar() {
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const fraction = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${fraction})`;
    };

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-50 h-[3px] bg-transparent"
    >
      <div
        ref={barRef}
        className="h-full w-full origin-left bg-accent"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}

/**
 * Right-edge dot column, one per numbered section — the active one grows and
 * takes the accent color. `IntersectionObserver` with a 1px-tall root band
 * pinned to the vertical middle of the viewport (`rootMargin: "-50% 0px
 * -50% 0px"`) marks a section active exactly when its own top crosses that
 * midline, which is the same "last section whose top has passed the middle
 * of the screen" rule a scroll+getBoundingClientRect loop would compute by
 * hand — this just gets it from the browser without polling every frame.
 */
export function SectionRail() {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const targets = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Seções da página"
      className="fixed right-3 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-3 sm:right-5"
    >
      {SECTIONS.map((section) => {
        const active = section.id === activeId;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-label={`Ir para a seção ${section.label}`}
            aria-current={active ? "true" : undefined}
            className={`rounded-full transition-all ${
              active ? "h-2.5 w-2.5 bg-accent" : "h-1.5 w-1.5 bg-muted/50 hover:bg-muted"
            }`}
          />
        );
      })}
    </nav>
  );
}

/**
 * Toggles scroll-snap on `<html>` only while the landing page is mounted —
 * every other screen in the app (tracking a run, scrolling histórico...)
 * has no business snapping between sections, so this can't just live as a
 * permanent rule in globals.css the way the rest of the landing's styling
 * does. `proximity`, not `mandatory`: it should help a swipe land on a
 * section's top, not fight a reader trying to stop mid-section on a tall
 * desktop viewport.
 */
export function LandingScrollSnap() {
  useEffect(() => {
    document.documentElement.classList.add("pr-landing-snap");
    return () => document.documentElement.classList.remove("pr-landing-snap");
  }, []);
  return null;
}

/** "Role para explorar" — bottom-left of the hero, bounces gently, fades out the first time the reader actually scrolls. */
export function HeroScrollCue() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onScroll = () => setDismissed(true);
    window.addEventListener("scroll", onScroll, { passive: true, once: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-6 left-5 z-10 flex items-center gap-2 text-muted transition-opacity duration-500 sm:left-8 ${
        dismissed ? "opacity-0" : "opacity-100"
      }`}
    >
      <svg viewBox="0 0 24 24" className="pr-scroll-cue h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="3" width="8" height="13" rx="4" />
        <path d="M12 7v3" strokeLinecap="round" />
      </svg>
      <span className="font-mono text-[11px] uppercase tracking-[0.18em]">role para explorar</span>
    </div>
  );
}
