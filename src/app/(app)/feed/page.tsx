"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { listFriendConnections } from "@/lib/friendships";
import { listFriendsFeed, parseFeedRoutePoints, toggleRunKudos, type FriendFeedItem } from "@/lib/friendsFeed";
import type { DistanceUnit } from "@/lib/preferences";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { formatAveragePace, formatDistance, unitLabel } from "@/lib/units";
import { usePreferences } from "@/lib/usePreferences";
import { useAuth } from "@/lib/useAuth";
import { AccountPrompt } from "../account-prompt";
import { Avatar } from "../avatar";
import { RouteMap } from "../route-map";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../ui";

/**
 * Mounts `children` only once this element scrolls near the viewport, and
 * never un-mounts it again — a real basemap (`RouteMap`, MapLibre/WebGL) per
 * card is too expensive to give every item in a feed of up to 30 posts for
 * free, but a feed only ever has a couple of cards near the viewport at
 * once, so lazily mounting as the athlete scrolls keeps concurrent WebGL
 * contexts bounded to what's actually on screen instead of every basemap
 * loading (and fighting over network) the instant the feed opens.
 */
function useInView<T extends Element>(rootMargin = "300px"): { ref: (node: T | null) => void; inView: boolean } {
  const [inView, setInView] = useState(false);
  const nodeRef = useRef<T | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = (node: T | null) => {
    nodeRef.current = node;
    observerRef.current?.disconnect();
    if (!node || inView) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { rootMargin },
    );
    observerRef.current.observe(node);
  };

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, inView };
}

const RETURN_TO = "/feed";

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function FriendsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="8.7" cy="8" r="3" />
      <path d="M2.8 19.5a5.9 5.9 0 0 1 11.8 0" />
      <path d="M15.5 5.3a3 3 0 0 1 0 5.9M18.7 19.5a5.9 5.9 0 0 0-3.4-6.3" />
    </svg>
  );
}

/** Bounces once (`pr-heart-pop`, globals.css) the moment `filled` flips from
 * false to true — confirms the tap registered, same idea as any social app's
 * like button. Never plays on the reverse (removing kudos) or on the initial
 * mount with `filled` already true (a feed refresh showing kudos you gave
 * earlier shouldn't replay the bounce). */
function HeartIcon({ className, filled }: { className?: string; filled: boolean }) {
  const [pulse, setPulse] = useState(false);
  const wasFilled = useRef(filled);
  useEffect(() => {
    if (filled && !wasFilled.current) setPulse(true);
    wasFilled.current = filled;
  }, [filled]);

  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} ${pulse ? "animate-[pr-heart-pop_300ms_cubic-bezier(0.23,1,0.32,1)]" : ""}`}
      onAnimationEnd={() => setPulse(false)}
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.3s-7.5-4.6-9.8-9.1C.7 8 2.1 4.6 5.4 3.8a5 5 0 0 1 6.6 2.2A5 5 0 0 1 18.6 3.8c3.3.8 4.7 4.2 3.2 7.4C19.5 15.7 12 20.3 12 20.3Z" />
    </svg>
  );
}

/** Same silhouette as `PrBadge`'s trophy in run-detail.tsx — reused here so a "new record" reads the same way in both places. */
function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M7 4h10v3.5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4.5a2 2 0 0 0 0 4H7M17 5h2.5a2 2 0 0 1 0 4H17" />
      <path d="M12 12.5v3M9 19.5h6M9.5 19.5c0-2 .8-2.7 2.5-3.5 1.7.8 2.5 1.5 2.5 3.5" />
    </svg>
  );
}

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17" cy="16" r="2.5" />
      <path d="M9 18V6.5L19.5 4v11.5" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  );
}

/**
 * The GPS trace on the app's real basemap (`RouteMap`, MapLibre + Protomaps —
 * same component /historico's detail screen and live tracking already use),
 * not a bare flattened line on blank background. A first pass here drew just
 * the line via `projectRoute` (same math as `matched-runs-card.tsx`'s 56px
 * corner thumbnail) — fine at icon size, but blown up to a full-width hero
 * with nothing around it, a route with no geography reads as a random
 * scribble, not a place ("esse risco aí na tela nada a ver, tudo perdido",
 * reported 2026-08-31 looking at exactly this card). Lazily mounted via
 * `useInView` — a live WebGL map per feed card is real cost a flat SVG
 * never was, so only cards actually near the viewport get one.
 * Edge-to-edge (negative margins matching the Card's own `p-5`, same trick
 * historico/page.tsx's empty-state illustration uses) so it reads as this
 * card's hero visual — the same role a photo plays on Strava's card,
 * without pretending to be a photo the app never took. `points` comes
 * straight from `runs.points` (a downsampled trace, see runsSync.ts), so a
 * friend's card draws the same shape their own device would.
 */
function RouteBanner({ points }: { points: FriendFeedItem["points"] }) {
  const parsed = parseFeedRoutePoints(points);
  const { ref, inView } = useInView<HTMLDivElement>();
  if (parsed.length < 2) return null;

  return (
    <div ref={ref} className="-mx-5 h-52 w-[calc(100%+2.5rem)] overflow-hidden bg-background">
      {inView && <RouteMap points={parsed} square={false} rounded={false} className="h-52 w-full" />}
    </div>
  );
}

/** One Strava-style "label above, big value below" stat — used in a row so the numbers that matter (distância/ritmo/tempo) read at a glance instead of hiding in a small inline cluster. */
function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="truncate font-mono text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** "Hoje às 08:30" / "Ontem às 08:30" / "24 ago às 08:30" — Strava shows both day and time-of-day on its feed cards; the previous version here only showed the date. */
function formatFeedTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dayDiff = Math.round((now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);
  if (dayDiff === 0) return `Hoje às ${time}`;
  if (dayDiff === 1) return `Ontem às ${time}`;
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} às ${time}`;
}

/**
 * One shared run in the friends feed — no link to a detail screen (see
 * `friendsFeed.ts`'s own comment: v1 only ever shows this aggregate
 * summary, never a friend's splits), but everything the sharer's own
 * device already knew about the run: the route, new records it set, and
 * whatever track was logged playing. `Avatar` here takes
 * `displayName`/`avatarUrl` straight off the Function's already-resolved
 * response, not another profile lookup.
 */
function FeedItemCard({
  item,
  unit,
  busy,
  isOwn,
  onToggleKudos,
  enterDelayMs,
}: {
  item: FriendFeedItem;
  unit: DistanceUnit;
  busy: boolean;
  isOwn: boolean;
  onToggleKudos: () => void;
  /** Staggers this card's entrance behind the ones above it — capped by the
   * caller so a feed of 30 posts doesn't grow an ever-longer tail of delay
   * for cards already below the fold. */
  enterDelayMs: number;
}) {
  const pace = formatAveragePace(item.distanceMeters, item.movingSeconds, unit);
  const track = item.tracks[0];

  return (
    <Card className="pr-enter flex flex-col gap-4" style={delay(enterDelayMs)}>
      <div className="flex items-start gap-3">
        <Avatar name={item.displayName} avatarUrl={item.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{isOwn ? "Você" : item.displayName}</p>
          <p className="truncate text-xs text-muted">
            {formatFeedTimestamp(item.startedAt)}
            {item.shoeName ? ` · ${item.shoeName}` : ""}
          </p>
          {item.placeName && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
              <PinIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.placeName}</span>
            </p>
          )}
        </div>
      </div>

      {/* The closest thing this app has to Strava's activity title — the athlete's own free-text line, never generated (see FriendFeedItem.caption's own comment) — styled as a real headline instead of a small quoted aside, so the card has the same anchor a named activity gives Strava's. */}
      {item.caption && <p className="-mt-1 text-lg font-semibold text-balance">{item.caption}</p>}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <StatBlock label="Distância" value={`${formatDistance(item.distanceMeters, unit)} ${unitLabel(unit)}`} />
        <StatBlock label="Ritmo" value={pace} />
        <StatBlock label="Tempo" value={formatElapsed(item.movingSeconds)} />
        {(item.elevationGainMeters ?? 0) > 0 && (
          <StatBlock label="Ganho de elevação" value={`${Math.round(item.elevationGainMeters ?? 0)} m`} />
        )}
      </div>

      <RouteBanner points={item.points} />

      {item.achievements.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-accent/10 px-3.5 py-3 text-accent">
          <TrophyIcon className="h-5 w-5 shrink-0" />
          <p className="text-sm font-semibold text-pretty">
            Novo recorde{item.achievements.length > 1 ? "s" : ""}: {item.achievements.join(", ")}
          </p>
        </div>
      )}

      {track && (
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <MusicIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {track.name} — {track.artist}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end border-t border-border pt-3">
        {isOwn ? (
          // Own post: kudos is something friends give you, not something
          // you toggle on yourself — a static count instead of a button
          // (the server rejects self-kudos anyway, see toggle-run-kudos).
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted">
            <HeartIcon className="h-3.5 w-3.5" filled={item.kudosCount > 0} />
            {item.kudosCount > 0 ? item.kudosCount : "Kudos"}
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onToggleKudos}
            aria-pressed={item.kudosGivenByMe}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
              item.kudosGivenByMe ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
            }`}
          >
            <HeartIcon className="h-3.5 w-3.5" filled={item.kudosGivenByMe} />
            {item.kudosCount > 0 ? item.kudosCount : "Kudos"}
          </button>
        )}
      </div>
    </Card>
  );
}

/**
 * Feed's own top-level tab (bottom nav: Corrida, Feed, Plano, Perfil) —
 * used to live as a tab inside /amigos, promoted out on request ("tem q
 * ser um feed como foco principal para nao ser uma tela so de coisa
 * pessoal, no strava a primeira tela é feed"). /amigos itself went back
 * to being just Amigos/Convites (managing who you're connected to); this
 * screen links there via the header badge for that management surface,
 * same relationship Strava has between its feed and its "find friends"
 * screen.
 *
 * Each item is its own full-width `Card` (route banner, achievement/track
 * badges, kudos) rather than rows packed into one shared list — asked for
 * directly ("nao tem nem mostrando mapa, conquistas, playlist escutada
 * etc, tem que ser bem dopamina"), same visual weight Strava gives each
 * activity in its own feed.
 */
export default function FeedPage() {
  const { status, account } = useAuth();
  const [{ distanceUnit: unit }] = usePreferences();
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [feedItems, setFeedItems] = useState<FriendFeedItem[] | null>(null);
  const [kudosBusyId, setKudosBusyId] = useState<string | null>(null);
  /**
   * Synchronous guard against a run being toggled twice in the same tap —
   * `kudosBusyId`'s `disabled` only takes effect on the *next* render, which
   * is too late for a near-simultaneous second call (a ghost/duplicate
   * click event from the WebView, or an eager double-tap). Without this, the
   * exact symptom reported (2026-08-31): the heart flashes filled, then
   * reverts a moment later — the toggle fired twice (give, then take back)
   * before the button had actually become `disabled`.
   */
  const kudosInFlightRef = useRef<Set<string>>(new Set());
  /** Only used to tell "no friends yet" apart from "friends, but nobody's shared a run" in the empty state below. */
  const [friendCount, setFriendCount] = useState<number | null>(null);

  useEffect(() => {
    if (status !== "signed-in") return;
    let cancelled = false;
    listFriendsFeed().then((items) => {
      if (!cancelled) setFeedItems(items);
    });
    listFriendConnections("accepted").then((rows) => {
      if (!cancelled) setFriendCount(rows.length);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleToggleKudos = async (runRowId: string) => {
    if (kudosInFlightRef.current.has(runRowId)) return;
    kudosInFlightRef.current.add(runRowId);
    setKudosBusyId(runRowId);
    const result = await toggleRunKudos(runRowId);
    kudosInFlightRef.current.delete(runRowId);
    setKudosBusyId(null);
    if (result.ok) {
      setFeedItems((current) =>
        (current ?? []).map((item) =>
          item.runRowId === runRowId
            ? { ...item, kudosCount: result.kudosCount, kudosGivenByMe: result.kudosGivenByMe }
            : item,
        ),
      );
    }
  };

  return (
    <>
      {/* hideTitle: the bottom nav tab right below already reads "Feed" — repeating it as a heading is redundant (2026-08-31). The Amigos badge stays, it's a real link, not a label. */}
      <ScreenHeader
        title="Feed"
        hideTitle
        badge={
          <Link
            href="/amigos"
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-foreground"
          >
            <FriendsIcon className="h-4 w-4" />
            Amigos
          </Link>
        }
      />

      <Screen>
        {status === "loading" && (
          <Card className="pr-enter" style={delay(40)}>
            <p className="text-sm text-muted">Verificando sua conta…</p>
          </Card>
        )}

        {status === "signed-out" && (
          <Card className="pr-enter" style={delay(40)}>
            <CardTitle>Entra pra ver o feed</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              O feed mostra as corridas que seus amigos escolheram compartilhar — amizade é entre
              duas contas, é a única parte disso que precisa de login.
            </p>
            <button
              type="button"
              onClick={() => setShowAccountPrompt(true)}
              className="mt-5 w-full rounded-xl border border-accent py-3 text-sm font-semibold text-accent"
            >
              Entrar
            </button>
          </Card>
        )}

        {status === "needs-handle" && (
          <Card className="pr-enter" style={delay(40)}>
            <CardTitle>Falta escolher seu @</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Seu @ é como as pessoas te acham aqui.{" "}
              <Link href="/perfil" className="underline underline-offset-2 hover:text-accent">
                Termina de criar sua conta no Perfil
              </Link>{" "}
              pra ver o feed dos seus amigos.
            </p>
          </Card>
        )}

        {status === "signed-in" &&
          (feedItems === null ? (
            <Card className="pr-enter animate-pulse" style={delay(40)}>
              <div className="h-36 rounded-xl bg-background" />
            </Card>
          ) : feedItems.length === 0 ? (
            <Card className="pr-enter" style={delay(40)}>
              <div className="py-2 text-center">
                <p className="text-xs leading-relaxed text-muted">
                  {friendCount === 0 ? (
                    <>
                      Você ainda não tem amigos aceitos —{" "}
                      <Link href="/amigos" className="text-accent underline underline-offset-2">
                        adicione pelo @
                      </Link>{" "}
                      pra ver as corridas deles aqui.
                    </>
                  ) : (
                    "Nada por aqui ainda — aparece quando um amigo compartilhar uma corrida."
                  )}
                </p>
              </div>
            </Card>
          ) : (
            feedItems.map((item, index) => (
              <FeedItemCard
                key={item.runRowId}
                item={item}
                unit={unit}
                busy={kudosBusyId === item.runRowId}
                isOwn={item.userId === account?.id}
                onToggleKudos={() => handleToggleKudos(item.runRowId)}
                enterDelayMs={Math.min(index, 5) * 40}
              />
            ))
          ))}
      </Screen>

      {showAccountPrompt && <AccountPrompt onClose={() => setShowAccountPrompt(false)} returnTo={RETURN_TO} />}
    </>
  );
}
