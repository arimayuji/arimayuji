"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { GpsQuality } from "@/lib/tracking/useRunTracker";
import { HORSE_BUST_BODY_PATH, HORSE_BUST_LEGS_PATH, HORSE_BUST_LEGS_PIVOT } from "../horse-mark";
import { AccountMenuButton } from "./account-menu";
import { NotificationBell } from "./notification-bell";
import { PrivacyConsentGate } from "./privacy-consent";
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
  /** Marks the one tab (always Corrida — see BottomNav's own comment on why it's never swapped) rendered as the elevated circular button in the middle of the bar, not a plain flex-1 item like the other four. */
  primary?: boolean;
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
    href: "/feed",
    label: "Feed",
    // Its own top-level tab, not a sub-page reached through /amigos — the
    // opposite direction of every other merge in this file. Requested
    // explicitly ("tem q ser um feed como foco principal para nao ser uma
    // tela so de coisa pessoal, no strava a primeira tela é feed"):
    // /amigos (managing who you're connected to — adding by @, accepting
    // requests) stays reachable from here (a header link) and from
    // /perfil's Discovery row, but the feed itself needed its own
    // destination to read as the app's social home, not a tab buried
    // inside a "friends settings" screen.
    alsoMatches: ["/amigos"],
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
        <rect x="3.5" y="3.5" width="13" height="8.5" rx="2.2" />
        <rect x="7.5" y="12.5" width="13" height="8" rx="2.2" />
      </svg>
    ),
  },
  {
    href: "/historico",
    label: "Histórico",
    // Its own tab again — was folded into /progresso (see activity-feed.tsx),
    // then /progresso itself folded into /perfil's own tab bar. Reopened as
    // a direct destination on request, without undoing either merge:
    // ActivityCard/ActivityFeed now mount both here and inside /perfil's
    // Progresso tab, same component, never a fork of it. `/historico/detalhe`
    // and `/historico/video` already share this prefix, so they light this
    // tab up for free without needing their own `alsoMatches` entry.
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
        <circle cx="12" cy="12.5" r="8.5" />
        <path d="M12 7.5v5l3.5 2" />
      </svg>
    ),
  },
  {
    href: "/run",
    label: "Corrida",
    // The one primary action of the app — elevated into its own circular
    // button in the middle of the bar (see BottomNav's render) instead of
    // a plain tab like the other four, same idea as a fitness app's
    // "start" FAB (screenshot reference: Duolingo's center "+" button).
    primary: true,
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
        <circle cx="12" cy="13.5" r="7.5" />
        <path d="M12 10v3.5l2.4 1.6M9.5 2.5h5M12 2.5V6M18.6 6.4l1.5-1.5" />
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
    // /progresso used to be its own tab; its content (charts + the
    // personal activity feed, see progresso-content.tsx — not the social
    // feed above, a different thing despite the shared name) folded into
    // a tab inside /perfil.
    alsoMatches: ["/compartilhar", "/longao", "/progresso"],
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
        <circle cx="12" cy="8.25" r="3.75" />
        <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
      </svg>
    ),
  },
];

/**
 * Used to stand in for the mobile bottom nav's "Corrida" tab when `appMode`
 * was "treinador" (preferences.ts's `AppMode`) — removed once Corrida
 * became the raised central FAB (see BottomNav's own comment: that button
 * always means "start a run", so it can't double as a destination
 * switcher anymore). Kept around only because DESKTOP_TABS' "Alunos &
 * convites" entry still reuses its `icon`, the same one used for the
 * "Treinador" discovery row on /perfil, so all three surfaces read as the
 * same concept.
 */
const TREINADOR_TAB: TabDefinition = {
  href: "/treinador",
  label: "Treinador",
  icon: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
      <path d="M3.5 10.3v3.9h2.5l7.3 3.9V6.4l-7.3 3.9H3.5Z" />
      <path d="M13.8 9.3a4.1 4.1 0 0 1 0 6.9" />
      <path d="M16.6 7.3a7.6 7.6 0 0 1 0 10.9" />
    </svg>
  ),
};

/**
 * The `lg:` sidebar's own navigation — deliberately NOT a reskinned copy
 * of the phone's 5 tabs (Corrida in particular makes no sense here: no
 * browser equivalent of a run in progress, no GPS to track from a
 * laptop). Originally scoped as "what does a coach need at a desk"
 * (Sala de Treino, Alunos & convites) plus Perfil for anyone — but
 * "desktop = only ever a coach" stopped being true once /plano grew its
 * own reason to be read on a bigger screen (charts, the full week at a
 * glance, the self-service AI suggestion — see PROJECT-CONTEXT.md's
 * cronograma-ia-autoatendimento spec): an athlete with no coach at all
 * still benefits from opening their own plan here. Kept independent of
 * `TABS`/`TREINADOR_TAB` above (a couple of icons duplicated) rather than
 * indexing into that array, since this list answers a different question
 * and shouldn't silently drift if the athlete tab set ever changes shape.
 */
const DESKTOP_TABS: TabDefinition[] = [
  {
    href: "/treinador/sala",
    label: "Sala de Treino",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...STROKE}>
        <path d="M4 15.5 9.5 10l3.5 3.5L20 6" />
        <path d="M14.5 6h5.5v5.5" />
      </svg>
    ),
  },
  {
    href: "/treinador",
    label: "Alunos & convites",
    icon: TREINADOR_TAB.icon,
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
  // "Perfil" used to be a 4th tab here — removed once AccountMenuButton
  // (rendered in AppHeader, next to the notification bell) took over
  // account access on desktop. See that component's own comment.
];

function isActive(pathname: string, tab: TabDefinition): boolean {
  const candidates = [tab.href, ...(tab.alsoMatches ?? [])];
  return candidates.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * `isActive` alone double-highlights on the desktop sidebar specifically:
 * "/treinador" (Alunos & convites) and "/treinador/sala" (Sala de Treino)
 * are sibling top-level destinations in `DESKTOP_TABS`, not parent/child —
 * but `/treinador/sala` also satisfies "/treinador"'s own prefix match
 * (`pathname.startsWith("/treinador/")`), so both tabs lit up at once on
 * that one URL. Only `DESKTOP_TABS` has this shape (two of its own hrefs
 * share a prefix); `TABS`/`TREINADOR_TAB` below never do, so this is kept
 * local to the desktop sidebar rather than changing `isActive` itself.
 * Picks the single *longest* matching href instead of letting every match
 * win independently — the same "most specific route wins" rule most
 * routers already apply, which also keeps `/treinador/aluno` correctly
 * highlighting "Alunos & convites" (its only match) without needing an
 * explicit `alsoMatches` entry.
 */
function desktopActiveIndex(pathname: string): number {
  let bestIndex = -1;
  let bestLength = -1;
  DESKTOP_TABS.forEach((tab, index) => {
    if (!isActive(pathname, tab)) return;
    if (tab.href.length > bestLength) {
      bestLength = tab.href.length;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/** Reserved space at the top/bottom of the scroll container for the header/nav bars, plus the safe-area inset on top of that — both bars size themselves to match. */
const HEADER_HEIGHT = "4.5rem";
const BOTTOMNAV_HEIGHT = "4.5rem";

/** Fired when a tab already active gets tapped again — `Link` to the same URL is a router no-op, so a page sitting in some non-idle state (the run summary, mid-scroll) needs its own way to hear "take me back to start" from that tap. See `useTabReclick` in run/page.tsx for the one listener that currently cares. */
const TAB_RECLICK_EVENT = "xanthus:tab-reclick";

/**
 * Width of the `lg:` sidebar this becomes on a wide (desktop browser)
 * viewport — kept as one constant since the scroll container's own left
 * padding (in AppShell below) has to match it exactly, and AppHeader's
 * left offset does too. Never applies on the native app: Capacitor's
 * WebView never reports a viewport this wide, so every `lg:` class below
 * is a pure no-op there, and on any narrow browser window.
 */
/**
 * The rail rests collapsed (icon-only) and expands to full width on hover —
 * same interaction as Aceternity's Sidebar component (21st.dev), picked
 * specifically because a permanently-expanded rail down the left edge is
 * the one piece of chrome every native-mobile-tab-bar-reskinned-for-desktop
 * critique kept landing on. Since the rail is `position: absolute` (an
 * overlay, not a flex sibling — see the `<nav>` below), only the COLLAPSED
 * width needs reserving in the header/content layout; the expanded state
 * on hover overlays on top of content instead of reflowing it, which is
 * also why it's a pure CSS `group-hover` trick rather than JS state.
 */
const SIDEBAR_COLLAPSED_WIDTH_CLASS = "lg:w-16";
const SIDEBAR_OFFSET_CLASS = "lg:left-16";
/** Collapses a label to nothing at rest, reveals it once `.group` (the nav) is hovered — shared by the brand wordmark and every DESKTOP_TABS label below. `max-w` (not `w`) because `width: auto` can't be transitioned; a generous cap plus `overflow-hidden` gets the same clipped-to-content result while staying animatable. */
const SIDEBAR_LABEL_CLASS =
  "max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 ease-out lg:group-hover:max-w-40 lg:group-hover:opacity-100";

function BottomNav({ hidden }: { hidden: boolean }) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Navegação principal"
      // Bottom tab bar on mobile/native, sliding off-screen on scroll (the
      // `hidden`-driven translate classes below); a persistent left sidebar
      // on `lg:` instead — a coach's dashboard has no reason to hide its own
      // nav on scroll, and `lg:translate-x-0 lg:translate-y-0` overrides
      // whatever the mobile scroll-hide state was, unconditionally.
      className={`chrome-gradient-nav group absolute inset-x-0 bottom-0 z-40 rounded-t-[28px] shadow-[0_-12px_28px_-10px_rgba(0,0,0,0.45)] transition-[transform,width] duration-200 ease-out ${
        hidden ? "translate-y-full" : "translate-y-0"
      } lg:inset-y-0 lg:right-auto lg:top-0 ${SIDEBAR_COLLAPSED_WIDTH_CLASS} lg:translate-x-0 lg:translate-y-0 lg:rounded-none lg:shadow-none lg:hover:w-60 lg:hover:shadow-2xl`}
    >
      {/* Brand mark, sidebar-only — the flat desktop rail carries its own
          identity instead of doubling it with the header's, so the header
          (below) hides its copy at this breakpoint via SIDEBAR_OFFSET_CLASS's
          sibling `lg:hidden`. White-on-accent, matching the mobile header's
          own brand mark treatment just below (same paths, same white),
          since the rail itself is solid accent blue rather than a neutral
          background. */}
      <div className="hidden h-16 shrink-0 items-center gap-3 border-b border-white/15 px-4 lg:flex">
        <svg viewBox="0 0 100 100" className="h-8 w-8 shrink-0 text-white" aria-hidden="true">
          <path d={HORSE_BUST_BODY_PATH} fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" />
          <path d={HORSE_BUST_LEGS_PATH} fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" />
        </svg>
        <span className={`font-mono text-lg font-semibold tracking-wide text-white ${SIDEBAR_LABEL_CLASS}`}>Xanthus</span>
      </div>

      {/* Mobile/native tab bar — always Feed/Histórico/Corrida/Plano/Perfil,
          same set regardless of `appMode`: the raised FAB in the middle
          reads as "start a run" (see the `primary` render branch below),
          so it never stands in for Treinador the way tab 0 used to before
          this became a FAB — a coach still reaches /treinador via Perfil,
          same as before "modo treino" existed. Hidden outright at `lg:`,
          where the sidebar list below takes over with its own, different
          set of destinations. */}
      <ul className="relative mx-auto flex max-w-md pb-[env(safe-area-inset-bottom)] lg:hidden">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          const onClick = () => {
            if (active) window.dispatchEvent(new CustomEvent(TAB_RECLICK_EVENT, { detail: tab.href }));
          };

          if (tab.primary) {
            return (
              <li key={tab.href} className="flex flex-1 items-start justify-center">
                {/* Elevated circular button, popping above the bar's own top
                    edge (`-mt-6`) instead of sitting flush like the other
                    four — the one primary action of the app (or, in
                    treinador mode, its equivalent) gets more visual weight
                    than a same-size tab icon would. Glossy accent orb
                    (chrome-gradient-fab, globals.css) rather than a flat
                    opaque fill, with a colored (not plain black) shadow to
                    lift it further off the bar's white background. */}
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onClick}
                  className="-mt-6 flex flex-col items-center gap-1 text-[11px] font-bold text-accent"
                >
                  <span className="chrome-gradient-fab flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_20px_-6px_rgba(47,111,237,0.6)]">
                    <tab.icon className="h-7 w-7" />
                  </span>
                  {tab.label}
                </Link>
              </li>
            );
          }

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                onClick={onClick}
                /* 56px+ tall target: still generous for a mid-exercise tap, just less padding than before — the bar itself was reading too tall. */
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1 text-[11px] transition-colors ${
                  active ? "font-bold text-accent" : "font-medium text-muted"
                }`}
              >
                <tab.icon className="h-[26px] w-[26px]" />
                {tab.label}
                {/* Selection indicator: a thin underline, not a pill behind the icon — tested, a background pill there read as visually busy. Width transitions in/out instead of a hard cut. */}
                <span
                  className="h-[3px] rounded-full bg-accent transition-[width] duration-200 ease-out"
                  style={{ width: active ? "16px" : "0px" }}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop sidebar list — DESKTOP_TABS, not `tabs`: see that constant's
          own comment for why this is a genuinely different destination set,
          not the athlete tabs reskinned. Own background-highlight active
          state instead of the mobile underline, which reads oddly on a
          horizontal row of icon+label rather than a stacked icon-over-label.
          White-on-accent variants (not `bg-accent/10 text-accent`, which
          reads as invisible on the rail's own accent-blue background) since
          the rail is solid accent now, not a neutral surface. */}
      <ul className="hidden lg:flex lg:flex-col lg:items-stretch lg:gap-1 lg:px-3 lg:py-4">
        {DESKTOP_TABS.map((tab, index) => {
          const active = index === desktopActiveIndex(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                  active ? "bg-white/15 font-semibold text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <tab.icon className="h-[25px] w-[25px] shrink-0" />
                <span className={SIDEBAR_LABEL_CLASS}>{tab.label}</span>
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
      className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
    >
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${ready ? "bg-good" : "bg-warn animate-pulse"}`} />
    </span>
  );
}

/**
 * The one header every non-immersive screen shares — brand mark + wordmark
 * on the left, notification bell (+ a "close" button on flow/detail screens
 * only, see `useHeaderClose`) on the right, on a flat/neutral bar (see
 * `.chrome-gradient-header` in globals.css — it used to carry the app's own
 * accent gradient, dropped in favor of the bottom nav being the only blue
 * chrome). Scrolls away with the rest of the screen on scroll-down and
 * returns on scroll-up (`hidden` prop, driven by `useScrollChromeVisibility`
 * in the shell below) — never `position: sticky`, which used to read as
 * "stuck on top of my content" instead of a header.
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  return (
    <header
      // `lg:left-60` clears the sidebar BottomNav becomes at that same
      // breakpoint (SIDEBAR_OFFSET_CLASS below it) — without this the two
      // would overlap in the top-left corner, since both sit at z-40.
      className={`chrome-gradient-header absolute inset-x-0 top-0 z-40 overflow-hidden rounded-b-[36px] shadow-none transition-transform duration-200 ease-out lg:rounded-none ${SIDEBAR_OFFSET_CLASS}`}
      style={{
        transform: hidden ? "translateY(-100%)" : "translateY(0)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      {/* Brand mark: this header's own copy on mobile/native, hidden at `lg:` where the sidebar (BottomNav) carries it instead — one identity mark per screen, not two. `lg:justify-end`: with the left block gone, `justify-between` on a single remaining flex item collapses to flex-start (left) instead of staying pinned right. */}
      <div className="relative flex h-16 items-center justify-between px-4 lg:justify-end lg:px-6">
        <div className="flex items-center gap-2.5 lg:hidden">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
            <svg viewBox="0 0 100 100" className="h-5 w-5 text-accent" aria-hidden="true">
              <path d={HORSE_BUST_BODY_PATH} fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" />
              <g
                style={{
                  transformOrigin: `${HORSE_BUST_LEGS_PIVOT.x}px ${HORSE_BUST_LEGS_PIVOT.y}px`,
                  animation: "pr-horse-paw 2.4s ease-in-out infinite",
                }}
              >
                <path d={HORSE_BUST_LEGS_PATH} fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" />
              </g>
            </svg>
          </span>
          <span className="font-mono text-lg font-semibold tracking-wide text-foreground">Xanthus</span>
        </div>

        <div className="flex items-center gap-2">
          {gpsQuality && <GpsStatusBadge quality={gpsQuality} />}
          <NotificationBell />
          <AccountMenuButton open={accountMenuOpen} onOpenChange={setAccountMenuOpen} />
          {closeHref && (
            <button
              type="button"
              onClick={() => router.push(closeHref)}
              aria-label="Fechar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted hover:text-foreground"
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
            // `lg:pl-16` clears the sidebar BottomNav becomes at that
            // breakpoint — matching its COLLAPSED width (SIDEBAR_COLLAPSED_WIDTH_CLASS),
            // not the width it grows to on hover: the rail is `position:
            // absolute`, so its hover-expanded state is a floating overlay
            // on top of this content rather than something content reflows
            // around. The bottom padding below (still sized for the
            // now-gone bottom tab bar) is left as a small amount of unused
            // space at that width rather than reworked, since it's set via
            // inline `style` below and an inline style always wins over any
            // `lg:` class here regardless of specificity, so overriding it
            // per-breakpoint isn't possible without restructuring that
            // scroll/immersive padding scheme — which this file's own
            // comments already flag as having broken run-tracking once
            // (see the `{children}` tree-position note above) and isn't
            // worth the risk for a few pixels of harmless dead space.
            className={
              immersive ? "flex h-full flex-col" : "h-full overflow-y-auto overscroll-y-contain lg:pl-16"
            }
            style={
              immersive
                ? undefined
                : {
                    paddingTop: `calc(${HEADER_HEIGHT} + env(safe-area-inset-top))`,
                    paddingBottom: `calc(${BOTTOMNAV_HEIGHT} + env(safe-area-inset-bottom))`,
                  }
            }
          >
            {children}
          </div>
          {!immersive && (
            <>
              <AppHeader hidden={!chromeVisible} closeHref={closeHref} gpsQuality={gpsQuality} />
              <BottomNav hidden={!chromeVisible} />
            </>
          )}
          {/*
            Portals to `document.body`, so its position here costs nothing
            in layout terms — it sits outside the scroll container purely so
            nothing about `{children}`'s own position in the tree changes
            when the gate appears or goes away (see the long comment above
            for what that costs).
          */}
          <PrivacyConsentGate />
        </div>
      </HeaderGpsContext.Provider>
      </HeaderCloseContext.Provider>
    </ImmersiveContext.Provider>
  );
}
