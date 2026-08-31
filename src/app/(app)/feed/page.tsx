"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listFriendConnections } from "@/lib/friendships";
import { listFriendsFeed, parseFeedRoutePoints, toggleRunKudos, type FriendFeedItem } from "@/lib/friendsFeed";
import type { DistanceUnit } from "@/lib/preferences";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { projectRoute } from "@/lib/tracking/routeProjection";
import { formatAveragePace, formatDistance, unitLabel } from "@/lib/units";
import { usePreferences } from "@/lib/usePreferences";
import { useAuth } from "@/lib/useAuth";
import { AccountPrompt } from "../account-prompt";
import { Avatar } from "../avatar";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../ui";

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

function HeartIcon({ className, filled }: { className?: string; filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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

function ElevationIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...ICON_STROKE}>
      <path d="M3 17.5 9 8l4 5.5 2.5-3L21 17.5" />
      <path d="M15.5 6.5h4v4" />
    </svg>
  );
}

/**
 * The GPS trace as a flattened SVG, same `projectRoute` math /historico and
 * `matched-runs-card.tsx`'s thumbnail already use — real geometry (breaks at
 * tracking gaps, honest to what the route actually looked like), just
 * rendered bigger and full-width as this card's focal visual instead of a
 * 56px corner thumbnail. `points` comes straight from `runs.points` (a
 * downsampled trace, see runsSync.ts), so a friend's card draws the same
 * shape their own device would.
 */
function RouteBanner({ points }: { points: FriendFeedItem["points"] }) {
  const parsed = parseFeedRoutePoints(points);
  if (parsed.length < 2) return null;
  const projected = projectRoute(parsed, { viewBoxSize: 100, paddingFraction: 0.1 });
  if (!projected) return null;

  return (
    <svg
      viewBox={`0 0 ${projected.viewBoxSize} ${projected.viewBoxSize}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-36 w-full rounded-xl border border-border bg-background text-accent"
      role="img"
      aria-label="Traçado da corrida"
    >
      {projected.polylines.map((pts, i) => (
        <polyline key={i} points={pts} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
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
}: {
  item: FriendFeedItem;
  unit: DistanceUnit;
  busy: boolean;
  isOwn: boolean;
  onToggleKudos: () => void;
}) {
  const pace = formatAveragePace(item.distanceMeters, item.movingSeconds, unit);
  const track = item.tracks[0];

  return (
    <Card className="pr-enter flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={item.displayName} avatarUrl={item.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{isOwn ? "Você" : item.displayName}</p>
          <p className="truncate text-xs text-muted">
            {new Date(item.startedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            {item.shoeName ? ` · ${item.shoeName}` : ""}
          </p>
        </div>
      </div>

      {item.caption && <p className="text-sm text-foreground text-pretty">&quot;{item.caption}&quot;</p>}

      {(item.placeName || (item.elevationGainMeters ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {item.placeName && (
            <span className="flex items-center gap-1">
              <PinIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.placeName}</span>
            </span>
          )}
          {(item.elevationGainMeters ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <ElevationIcon className="h-3.5 w-3.5 shrink-0" />
              {Math.round(item.elevationGainMeters ?? 0)} m
            </span>
          )}
        </div>
      )}

      <RouteBanner points={item.points} />

      {item.achievements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.achievements.map((label) => (
            <span
              key={label}
              className="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent"
            >
              <TrophyIcon className="h-3.5 w-3.5" />
              Recorde: {label}
            </span>
          ))}
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

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="flex items-baseline gap-3 font-mono text-xs tabular-nums text-muted">
          <span className="text-sm font-semibold text-foreground">
            {formatDistance(item.distanceMeters, unit)} {unitLabel(unit)}
          </span>
          <span>{formatElapsed(item.movingSeconds)}</span>
          <span>{pace}</span>
        </span>
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
    setKudosBusyId(runRowId);
    const result = await toggleRunKudos(runRowId);
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
            feedItems.map((item) => (
              <FeedItemCard
                key={item.runRowId}
                item={item}
                unit={unit}
                busy={kudosBusyId === item.runRowId}
                isOwn={item.userId === account?.id}
                onToggleKudos={() => handleToggleKudos(item.runRowId)}
              />
            ))
          ))}
      </Screen>

      {showAccountPrompt && <AccountPrompt onClose={() => setShowAccountPrompt(false)} returnTo={RETURN_TO} />}
    </>
  );
}
