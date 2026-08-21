"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { GpsQuality } from "@/lib/tracking/useRunTracker";
import { HORSE_BUST_PATHS } from "../horse-mark";
import { InstallPrompt } from "./install-prompt";
import { NotificationBell } from "./notification-bell";
import { useScrollChromeVisibility } from "./use-scroll-chrome";

/**
 * App shell: the logged-in surface of Xanthus.
 *
 * The landing page (`/`) deliberately sits outside this group — it is
 * marketing, not the app, and gets no tab bar.
 *
 * The one piece of state the shell owns is "immersive mode". While a run is
 * actually being recorded the tab bar disappears: a sweaty thumb on a moving
 * arm must not be one mistap away from leaving the recording screen, and the
 * numbers get the whole display. `/run` opts in through `useImmersiveMode`,
 * which is why the shell exposes a setter instead of sniffing the pathname —
 * only the recording screen knows whether it is recording.
 */
const ImmersiveContext = createContext<(active: boolean) => void>(() => {});

/**
 * Hides the bottom tab bar while `active` is true, and always restores it when
 * the caller unmounts (navigating away mid-run leaves no orphaned state).
 */
export function useImmersiveMode(active: boolean): void {
  const setImmersive = useContext(ImmersiveContext);
  useEffect(() => {
    setImmersive(active);
    return () => setImmersive(false);
  }, [active, setImmersive]);
}

/**
 * The header's "X" only makes sense on a screen you can actually close back
 * out of — a flow/detail screen reached FROM one of the 5 tabs (run detail,
 * a friend's place page, notification inbox, plan setup fields...). The 5
 * tab roots themselves have nowhere to "close" to, so they render the same
 * header without it. A route string rather than a callback: every caller
 * here wants "go to this fixed parent route," never a one-off closure, and
 * a string is stable across re-renders the same way `useImmersiveMode`'s
 * boolean already is — no risk of re-registering every render the way a
 * fresh inline function would.
 */
const HeaderCloseContext = createContext<(href: string | null) => void>(() => {});

/** Shows the header's "X" button while mounted, navigating to `closeHref` when tapped. Cleared on unmount, same shape as `useImmersiveMode`. */
export function useHeaderClose(closeHref: string): void {
  const setCloseHref = useContext(HeaderCloseContext);
  useEffect(() => {
    setCloseHref(closeHref);
    return () => setCloseHref(null);
  }, [closeHref, setCloseHref]);
}

/**
 * A small GPS-quality dot in the header, replacing the "Buscando GPS…"/"GPS
 * pronto" text pill Preparar Corrida used to show under its own title — same
 * idea as `useHeaderClose` above (context setter + cleanup-on-unmount), just
 * carrying a reading instead of a route. `null` hides the dot entirely
 * (nothing GPS-related to show — most screens never call this at all).
 */
const HeaderGpsContext = createContext<(quality: GpsQuality | null) => void>(() => {});

export function useHeaderGpsStatus(quality: GpsQuality | null): void {
  const setQuality = useContext(HeaderGpsContext);
  useEffect(() => {
    setQuality(quality);
    return () => setQuality(null);
  }, [quality, setQuality]);
}

interface TabDefinition {
  href: string;
  label: string;
  /** Extra path prefixes that should keep this tab lit (e.g. /compartilhar). */
  alsoMatches?: string[];
  icon: (props: { className: string }) => React.ReactElement;
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const TABS: TabDefinition[] = [
  {
    href: "/run",
    label: "Corrida",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
        <circle cx="12" cy="13.5" r="7.5" />
        <path d="M12 10v3.5l2.4 1.6M9.5 2.5h5M12 2.5V6M18.6 6.4l1.5-1.5" />
      </svg>
    ),
  },
  {
    href: "/historico",
    label: "Histórico",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
        <path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h6" />
      </svg>
    ),
  },
  {
    href: "/progresso",
    label: "Progresso",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
        <path d="M4 15.5 9.5 10l3.5 3.5L20 6" />
        <path d="M14.5 6h5.5v5.5" />
      </svg>
    ),
  },
  {
    href: "/plano",
    label: "Plano",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
        <rect x="3.25" y="4.75" width="17.5" height="16" rx="3" />
        <path d="M3.25 9.75h17.5M8 2.75v4M16 2.75v4" />
        <circle cx="9" cy="14.5" r="1.15" fill="currentColor" stroke="none" />
        <circle cx="15" cy="14.5" r="1.15" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/perfil",
    label: "Perfil",
    alsoMatches: ["/compartilhar", "/amigos", "/longao"],
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
        <circle cx="12" cy="8.25" r="3.75" />
        <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
      </svg>
    ),
  },
];

function isActive(pathname: string, tab: TabDefinition): boolean {
  const candidates = [tab.href, ...(tab.alsoMatches ?? [])];
  return candidates.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/** Reserved space at the top/bottom of the scroll container for the header/nav bars, plus the safe-area inset on top of that — both bars size themselves to match. */
const HEADER_HEIGHT = "4.5rem";
const BOTTOMNAV_HEIGHT = "4.5rem";

/** Fired when a tab already active gets tapped again — `Link` to the same URL is a router no-op, so a page sitting in some non-idle state (the run summary, mid-scroll) needs its own way to hear "take me back to start" from that tap. See `useTabReclick` in run/page.tsx for the one listener that currently cares. */
const TAB_RECLICK_EVENT = "xanthus:tab-reclick";

function BottomNav({ hidden }: { hidden: boolean }) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Navegação principal"
      className="chrome-gradient-nav absolute inset-x-0 bottom-0 z-40 rounded-t-[28px] shadow-[0_-12px_28px_-10px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-out"
      style={{ transform: hidden ? "translateY(100%)" : "translateY(0)" }}
    >
      <ul className="mx-auto flex max-w-md pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (active) window.dispatchEvent(new CustomEvent(TAB_RECLICK_EVENT, { detail: tab.href }));
                }}
                /* 64px+ tall target: this gets tapped mid-exercise. */
                className={`flex min-h-16 flex-col items-center justify-center gap-1.5 px-1 pt-2.5 pb-1.5 text-[11px] transition-colors ${
                  active ? "font-bold text-white" : "font-medium text-white/50"
                }`}
              >
                <tab.icon className="h-[22px] w-[22px]" />
                {tab.label}
                {/* Selection indicator: a thin underline, not a pill behind the icon — tested, a background pill there read as visually busy. Width transitions in/out instead of a hard cut. */}
                <span
                  className="h-[3px] rounded-full bg-white transition-[width] duration-200 ease-out"
                  style={{ width: active ? "16px" : "0px" }}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A tab tapped while already active — see `TAB_RECLICK_EVENT` above. `href` is the tab's own route (e.g. `"/run"`), so a listener only mounted on that page needs no pathname check of its own. */
export function useTabReclick(href: string, onReclick: () => void): void {
  useEffect(() => {
    const handler = (event: Event) => {
      if ((event as CustomEvent<string>).detail === href) onReclick();
    };
    window.addEventListener(TAB_RECLICK_EVENT, handler);
    return () => window.removeEventListener(TAB_RECLICK_EVENT, handler);
  }, [href, onReclick]);
}

function CloseIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/**
 * Header counterpart to Preparar Corrida's old "Buscando GPS…"/"GPS pronto"
 * text pill — a dot instead of a sentence, same circular-badge treatment as
 * the bell/close buttons either side of it so it reads as one family of
 * header controls rather than a bolted-on label. `title` covers desktop
 * hover; `role="status"` + `aria-label` carry the same "ready or not" read
 * for screen readers, which a bare colored dot can't.
 */
function GpsStatusBadge({ quality }: { quality: GpsQuality }) {
  const ready = quality === "good";
  const label = ready ? "GPS pronto" : "Buscando sinal de GPS…";
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/16"
    >
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${ready ? "bg-good" : "bg-warn animate-pulse"}`} />
    </span>
  );
}

/**
 * The one header every non-immersive screen shares — brand mark + wordmark
 * on the left, notification bell (+ a "close" button on flow/detail screens
 * only, see `useHeaderClose`) on the right, on the app's own accent
 * gradient instead of a flat/transparent bar. Scrolls away with the rest of
 * the screen on scroll-down and returns on scroll-up (`hidden` prop, driven
 * by `useScrollChromeVisibility` in the shell below) — never `position:
 * sticky`, which used to read as "stuck on top of my content" instead of a
 * header.
 */
function AppHeader({
  hidden,
  closeHref,
  gpsQuality,
}: {
  hidden: boolean;
  closeHref: string | null;
  gpsQuality: GpsQuality | null;
}) {
  const router = useRouter();

  return (
    <header
      className="chrome-gradient-header absolute inset-x-0 top-0 z-40 overflow-hidden rounded-b-[36px] shadow-[0_12px_28px_-8px_rgba(74,120,224,0.4)] transition-transform duration-200 ease-out"
      style={{
        transform: hidden ? "translateY(-100%)" : "translateY(0)",
        paddingTop: "env(safe-area-inset-top)",
        boxShadow: hidden
          ? undefined
          : "0 12px 28px -8px rgba(74,120,224,0.4), inset 0 1px 0 rgba(255,255,255,0.12)",
      }}
    >
      {/* Purely decorative — partially clipped by the header's own rounded/opaque bounds via overflow-hidden above. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/8"
      />

      <div className="relative flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/16">
            <svg viewBox="0 0 100 100" className="h-5 w-5" aria-hidden="true">
              <path d={HORSE_BUST_PATHS[0]} fill="none" stroke="#fff" strokeWidth="4.5" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-mono text-lg font-semibold tracking-wide text-white">Xanthus</span>
        </div>

        <div className="flex items-center gap-2">
          {gpsQuality && <GpsStatusBadge quality={gpsQuality} />}
          <NotificationBell />
          {closeHref && (
            <button
              type="button"
              onClick={() => router.push(closeHref)}
              aria-label="Fechar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/16 text-white"
            >
              <CloseIcon className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [immersive, setImmersive] = useState(false);
  const immersiveSetter = useCallback((active: boolean) => setImmersive(active), []);
  const immersiveValue = useMemo(() => immersiveSetter, [immersiveSetter]);

  const [closeHref, setCloseHref] = useState<string | null>(null);
  const closeValue = useMemo(() => setCloseHref, []);

  const [gpsQuality, setGpsQuality] = useState<GpsQuality | null>(null);
  const gpsValue = useMemo(() => setGpsQuality, []);

  /**
   * The scroll container as state, not a plain `useRef` — see
   * `useScrollChromeVisibility`'s own comment for why a stale ref used to
   * freeze the header/nav after leaving `/run`. This element itself is now
   * the *same* DOM node across an immersive-mode toggle (see the render
   * below — restyled in place, never unmounted), so this only actually
   * fires once, at mount; the callback-ref-as-state pattern is kept anyway
   * since it's what `chromeVisible` needs to subscribe to it at all.
   */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const chromeVisible = useScrollChromeVisibility(scrollEl);
  const pathname = usePathname();

  // Next's own "scroll to top on navigate" only targets window scroll — this
  // container is its own scroller (see the comment on it below), so a route
  // change needs to reset it explicitly, and bring the bars back with it
  // (arriving on a fresh screen already scrolled-away-from would be a bug,
  // not a feature).
  useEffect(() => {
    scrollEl?.scrollTo({ top: 0 });
  }, [scrollEl, pathname]);

  return (
    <ImmersiveContext.Provider value={immersiveValue}>
      <HeaderCloseContext.Provider value={closeValue}>
      <HeaderGpsContext.Provider value={gpsValue}>
        {/*
          `{children}` must sit at the exact same position in this tree in
          both immersive states — a fixed root div wrapping a fixed scroll
          div, always. Toggling `immersive` used to swap between two
          differently-shaped subtrees (a bare flex div vs. this same
          structure), and since React reconciles by tree shape/position, not
          by the identity of the `children` element, that swap unmounted and
          remounted the *entire page* underneath: whatever screen sat below
          AppShell — `useRunTracker`'s state included — got torn down and
          rebuilt from scratch. `/run` calls `useImmersiveMode` the instant a
          run starts (`status → "warming"`), which made this fire mid-start:
          the run tracker reset back to "idle" a frame after starting,
          reading as "Iniciar corrida" silently doing nothing. Restyling one
          stable div instead of branching the tree is what keeps the child
          alive across the toggle.

          `h-dvh` on the outer div, deliberately not paired with `flex-1`:
          this sits directly in body's flex column, which itself is only
          `min-h-full` (no definite height of its own) — `flex-1` sets
          `flex-basis: 0%`, which wins over an explicit height as the
          sizing basis, and grow then has nothing definite to distribute
          against, so the div silently reverts to shrinking to fit its
          content instead of being capped to the viewport. `h-dvh` alone,
          outside the flex sizing algorithm entirely, is what actually
          caps it — confirmed the hard way: without this, scrollHeight
          and clientHeight matched here (nothing to scroll), because the
          *window* had quietly become the real scroller again underneath.
        */}
        <div className="relative h-dvh overflow-hidden">
          {/*
            The only scroll container on non-immersive screens; plain flex
            column with nothing to scroll on immersive ones (the map screen
            sizes itself to fill it). Header and BottomNav below are
            `position: absolute` siblings of this, not children — hiding
            either one on scroll must never change this element's own
            scrollHeight, or hiding a bar shortens the scrollable area,
            which fires another scroll event, which can hide/show the bar
            again: a jitter loop. Keeping them as absolutely-positioned
            overlays with their own fixed height instead of `position:
            sticky`/`fixed` in-flow siblings is what breaks that loop.
          */}
          <div
            ref={setScrollEl}
            className={immersive ? "flex h-full flex-col" : "h-full overflow-y-auto overscroll-y-contain"}
            style={
              immersive
                ? undefined
                : {
                    paddingTop: `calc(${HEADER_HEIGHT} + env(safe-area-inset-top))`,
                    paddingBottom: `calc(${BOTTOMNAV_HEIGHT} + env(safe-area-inset-bottom))`,
                  }
            }
          >
            {!immersive && <InstallPrompt />}
            {children}
          </div>
          {!immersive && (
            <>
              <AppHeader hidden={!chromeVisible} closeHref={closeHref} gpsQuality={gpsQuality} />
              <BottomNav hidden={!chromeVisible} />
            </>
          )}
        </div>
      </HeaderGpsContext.Provider>
      </HeaderCloseContext.Provider>
    </ImmersiveContext.Provider>
  );
}
