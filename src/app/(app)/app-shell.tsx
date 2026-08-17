"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { InstallPrompt } from "./install-prompt";
import { NotificationBell } from "./notification-bell";

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

/** Fired when a tab already active gets tapped again — `Link` to the same URL is a router no-op, so a page sitting in some non-idle state (the run summary, mid-scroll) needs its own way to hear "take me back to start" from that tap. See `useTabReclick` in run/page.tsx for the one listener that currently cares. */
const TAB_RECLICK_EVENT = "xanthus:tab-reclick";

function BottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/92 backdrop-blur-md"
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
                className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 text-[11px] font-medium transition-colors ${
                  active ? "text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                <span
                  className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-accent/12" : ""
                  }`}
                >
                  <tab.icon className="h-[22px] w-[22px]" />
                </span>
                {tab.label}
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const [immersive, setImmersive] = useState(false);
  const setter = useCallback((active: boolean) => setImmersive(active), []);
  const value = useMemo(() => setter, [setter]);

  return (
    <ImmersiveContext.Provider value={value}>
      {/*
        Safe-area insets live here, once, instead of on every screen's own
        header — `ScreenHeader` (ui.tsx) used to add its own top inset, and
        every screen paid for it individually; a screen that renders
        something ABOVE its own header (InstallPrompt) still needed the
        same inset applied even earlier than that. `/run` is the one screen
        that opts out (`immersive`) — it wants an edge-to-edge map
        background during a live recording, and handles the top inset on
        its own single header instead (see run/page.tsx), since the shell
        skipping it here is what makes the map full-bleed in the first
        place.
      */}
      <div
        className={`flex flex-1 flex-col ${
          immersive
            ? ""
            : "pt-[env(safe-area-inset-top)] pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
        }`}
      >
        {!immersive && <InstallPrompt />}
        {children}
      </div>
      {/* Fixed, not inside the padded flow above — same reasoning as
          BottomNav below: it needs to stay pinned to the viewport corner
          across scroll, not just sit above whatever screen happens to be
          showing. */}
      {!immersive && <NotificationBell />}
      {!immersive && <BottomNav />}
    </ImmersiveContext.Provider>
  );
}
