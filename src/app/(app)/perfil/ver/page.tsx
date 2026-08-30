"use client";

import { Suspense, useEffect, useState } from "react";
import type { Profile } from "@/lib/auth";
import {
  getProfileByHandle,
  listFriendConnections,
  removeFriendship,
  sendFriendRequest,
} from "@/lib/friendships";
import { getProfileStats, type ProfileStats } from "@/lib/profileStats";
import { parsePlaylists } from "@/lib/playlistLink";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { listCompletedRuns } from "@/lib/tracking/storage";
import { buildStatsSnapshot, type StatsSnapshot } from "@/lib/tracking/stats";
import { formatDistance, unitLabel } from "@/lib/units";
import { usePreferences } from "@/lib/usePreferences";
import { useAuth } from "@/lib/useAuth";
import { AccountPrompt } from "../../account-prompt";
import { useHeaderClose } from "../../app-shell";
import { Avatar } from "../../avatar";
import { Card, Screen, ScreenHeader } from "../../ui";

/**
 * Visiting someone else's profile — a query-string route (`?h=`), not a
 * `[handle]` dynamic segment, same reasoning as `/convite` and
 * historico/detalhe's `?id=`: handles are created at runtime and never
 * exist at build time, so there's no `generateStaticParams` list to give a
 * static export for a real dynamic segment.
 *
 * What shows depends entirely on whether the signed-in viewer and the
 * visited account are already friends — there's no third, "public opt-in"
 * tier the way the place leaderboard has:
 * - Friends see the real `displayName`, the totals from `profile_stats`,
 *   and a "Desfazer amizade" button.
 * - Anyone else sees only `publicDisplayName ?? handle`, no totals at all
 *   (profile_stats is never even fetched), and an "Adicionar amigo" button.
 * This mirrors the public/friends split `publicDisplayName` already has
 * for the place leaderboard, rather than inventing a third privacy rule.
 */
/** "hoje"/"ontem"/"há N dias" — coarse on purpose, this is a comparison card, not a precise log. */
function formatRelativeDays(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

function formatStreakWeeks(weeks: number): string {
  return `${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
}

/**
 * Bar width (%) for one side of a head-to-head comparison, scaled against
 * the larger of the two values so the two bars are always readable side by
 * side. For a "lower is better" metric (PR times — a faster runner has a
 * *smaller* number) the raw value would draw backwards, so this compares
 * `1/value` instead — the visually longer bar always means "better",
 * whichever direction the underlying numbers go. `null`/non-positive reads
 * as "no bar" (the row already shows "—" as its label in that case).
 */
function comparisonBarPct(value: number | null, other: number | null, higherIsBetter: boolean): number {
  if (value == null || value <= 0) return 0;
  const scale = (v: number) => (higherIsBetter ? v : 1 / v);
  const mine = scale(value);
  const theirs = other != null && other > 0 ? scale(other) : 0;
  const max = Math.max(mine, theirs);
  if (max <= 0) return 0;
  return Math.max(6, Math.round((mine / max) * 100));
}

/**
 * One metric as two stacked head-to-head bars ("Você" / the friend's first
 * name) instead of the old plain two-column number table — same numbers,
 * but a glance at bar length says who's ahead without reading digits first.
 * `null` still renders as "—" text, never a fake zero-length bar that could
 * read as "this person ran zero".
 */
function CompareBarRow({
  label,
  theirName,
  mine,
  theirs,
  formatValue,
  higherIsBetter = true,
}: {
  label: string;
  theirName: string;
  mine: number | null;
  theirs: number | null;
  formatValue: (value: number) => string;
  higherIsBetter?: boolean;
}) {
  if (mine == null && theirs == null) return null;
  const minePct = comparisonBarPct(mine, theirs, higherIsBetter);
  const theirsPct = comparisonBarPct(theirs, mine, higherIsBetter);
  return (
    <div>
      <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="w-14 shrink-0 truncate text-right text-[11px] text-muted">Você</span>
        <div className="h-2 flex-1 rounded-full bg-border/50">
          <div className="h-2 rounded-full bg-accent" style={{ width: `${minePct}%` }} />
        </div>
        <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums">
          {mine != null ? formatValue(mine) : "—"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="w-14 shrink-0 truncate text-right text-[11px] text-muted">{theirName}</span>
        <div className="h-2 flex-1 rounded-full bg-border/50">
          <div className="h-2 rounded-full bg-good" style={{ width: `${theirsPct}%` }} />
        </div>
        <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums">
          {theirs != null ? formatValue(theirs) : "—"}
        </span>
      </div>
    </div>
  );
}

/** Race distances worth comparing between friends — see `buildStatsSnapshot` (stats.ts) for why training splits are left out. Same key names on both `StatsSnapshot` (my own, computed locally) and `ProfileStats` (the friend's, synced) so one lookup works for either side. */
const PR_COMPARISON_ROWS: { label: string; key: "pr5kSeconds" | "pr10kSeconds" | "prHalfSeconds" | "prFullSeconds" }[] = [
  { label: "PR 5 km", key: "pr5kSeconds" },
  { label: "PR 10 km", key: "pr10kSeconds" },
  { label: "PR 21 km", key: "prHalfSeconds" },
  { label: "PR 42 km", key: "prFullSeconds" },
];

export default function VerPerfilPage() {
  return (
    <Suspense fallback={null}>
      <VerPerfilContent />
    </Suspense>
  );
}

function VerPerfilContent() {
  useHeaderClose("/amigos");
  const { status: viewerStatus, account: viewer } = useAuth();
  const [{ distanceUnit: unit }] = usePreferences();
  // `undefined` = URL not read yet, `null` = confirmed no ?h= present.
  const [handle, setHandle] = useState<string | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  /** The viewer's own equivalent numbers, computed locally — never round-tripped through Appwrite, same as every other local-only screen (`/progresso`, `/plano`) already does for its own use. */
  const [myStats, setMyStats] = useState<StatsSnapshot | null>(null);
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Read straight off the URL instead of useSearchParams() — same reasoning
  // as amigos/page.tsx's own ?h= read, just once on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external source (the URL), not from other React state.
    setHandle(new URLSearchParams(window.location.search).get("h"));
  }, []);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    void getProfileByHandle(handle).then((result) => {
      if (!cancelled) setProfile(result);
    });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  useEffect(() => {
    if (!profile || viewerStatus !== "signed-in") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting to "not a friend" as soon as the visited profile or the viewer's own signed-in status changes away from the case this effect's fetch below applies to.
      setFriendshipId(null);
      setStats(null);
      setMyStats(null);
      return;
    }
    let cancelled = false;
    void listFriendConnections("accepted").then((connections) => {
      if (cancelled) return;
      const match = connections.find((c) => c.otherId === profile.$id);
      setFriendshipId(match?.friendship.$id ?? null);
      if (match) {
        void getProfileStats(profile.$id).then((result) => {
          if (!cancelled) setStats(result);
        });
        void listCompletedRuns().then((runs) => {
          if (!cancelled) setMyStats(buildStatsSnapshot(runs));
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profile, viewerStatus, reloadKey]);

  const isFriend = friendshipId !== null;
  const isSelf = viewer !== null && profile !== null && profile !== undefined && viewer.id === profile.$id;
  const playlists = parsePlaylists(profile?.playlists);

  async function handleAddFriend() {
    if (!profile) return;
    if (viewerStatus !== "signed-in") {
      setShowAccountPrompt(true);
      return;
    }
    setSending(true);
    const result = await sendFriendRequest(profile.handle);
    setSending(false);
    setFeedback(
      result.ok
        ? "Convite enviado."
        : result.reason === "duplicate"
          ? "Vocês já têm um convite ou uma amizade em aberto."
          : "Não deu pra enviar agora — tenta de novo em instantes.",
    );
  }

  async function handleRemoveFriend() {
    if (!friendshipId) return;
    setRemoving(true);
    const ok = await removeFriendship(friendshipId);
    setRemoving(false);
    if (ok) setReloadKey((key) => key + 1);
    else setFeedback("Não deu pra concluir agora — tenta de novo em instantes.");
  }

  if (handle === undefined) {
    return (
      <Screen>
        <Card className="pr-enter">
          <p className="text-sm text-muted">Carregando…</p>
        </Card>
      </Screen>
    );
  }

  if (handle === null) {
    return (
      <>
        <ScreenHeader title="Perfil" />
        <Screen>
          <Card className="pr-enter">
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Não achamos essa conta — o @ pode ter mudado ou a conta não existe mais.
            </p>
          </Card>
        </Screen>
      </>
    );
  }

  if (profile === undefined) {
    return (
      <Screen>
        <Card className="pr-enter">
          <p className="text-sm text-muted">Carregando…</p>
        </Card>
      </Screen>
    );
  }

  if (profile === null) {
    return (
      <>
        <ScreenHeader title="Perfil" />
        <Screen>
          <Card className="pr-enter">
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Não achamos essa conta — o @ pode ter mudado ou a conta não existe mais.
            </p>
          </Card>
        </Screen>
      </>
    );
  }

  const displayName = isFriend || isSelf ? profile.displayName : (profile.publicDisplayName ?? profile.handle);

  return (
    <>
      <ScreenHeader title={displayName} subtitle={`@${profile.handle}`} />
      <Screen>
        <Card className="pr-enter flex flex-col items-center text-center">
          <Avatar name={profile.displayName} avatarUrl={profile.avatarUrl} />
          <p className="mt-3 text-base font-semibold">{displayName}</p>
          <p className="font-mono text-xs text-muted">@{profile.handle}</p>

          {!isSelf && (
            <button
              type="button"
              onClick={() => void (isFriend ? handleRemoveFriend() : handleAddFriend())}
              disabled={sending || removing}
              className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-60 ${
                isFriend ? "border border-border text-bad" : "bg-accent text-accent-foreground"
              }`}
            >
              {isFriend
                ? removing
                  ? "Desfazendo…"
                  : "Desfazer amizade"
                : sending
                  ? "Enviando…"
                  : "Adicionar amigo"}
            </button>
          )}
          {feedback && <p className="mt-3 text-xs leading-relaxed text-muted">{feedback}</p>}
        </Card>

        {isFriend && stats && (
          <Card className="pr-enter">
            <p className="mb-4 text-sm font-semibold">Comparar</p>
            <div className="space-y-4">
              <CompareBarRow
                label={`${unitLabel(unit)} corridos`}
                theirName={displayName.split(" ")[0]}
                mine={myStats?.totalMeters ?? 0}
                theirs={stats.totalMeters}
                formatValue={(meters) => formatDistance(meters, unit)}
              />
              <CompareBarRow
                label="Corridas"
                theirName={displayName.split(" ")[0]}
                mine={myStats?.totalRuns ?? 0}
                theirs={stats.totalRuns}
                formatValue={(count) => String(count)}
              />
              <CompareBarRow
                label="Essa semana"
                theirName={displayName.split(" ")[0]}
                mine={myStats?.weekMeters ?? 0}
                theirs={stats.weekMeters ?? null}
                formatValue={(meters) => formatDistance(meters, unit)}
              />
              <CompareBarRow
                label="Sequência"
                theirName={displayName.split(" ")[0]}
                mine={myStats?.streakWeeks ?? 0}
                theirs={stats.streakWeeks ?? null}
                formatValue={(weeks) => formatStreakWeeks(weeks)}
              />

              {(myStats?.lastRunAt || stats.lastRunAt != null) && (
                <div>
                  <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">
                    Última corrida
                  </span>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted">Você</span>
                    <span className="font-mono tabular-nums">
                      {myStats?.lastRunAt ? formatRelativeDays(myStats.lastRunAt) : "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-muted">{displayName.split(" ")[0]}</span>
                    <span className="font-mono tabular-nums">
                      {stats.lastRunAt != null ? formatRelativeDays(stats.lastRunAt) : "—"}
                    </span>
                  </div>
                </div>
              )}

              {PR_COMPARISON_ROWS.map(({ label, key }) => (
                <CompareBarRow
                  key={key}
                  label={label}
                  theirName={displayName.split(" ")[0]}
                  mine={myStats?.[key] ?? null}
                  theirs={stats[key] ?? null}
                  formatValue={(seconds) => formatElapsed(seconds)}
                  higherIsBetter={false}
                />
              ))}
            </div>
          </Card>
        )}

        {isFriend && !stats && (
          <Card className="pr-enter">
            <p className="text-sm text-muted">Ainda sem corridas registradas.</p>
          </Card>
        )}

        {(isFriend || isSelf) && playlists.length > 0 && (
          <Card className="pr-enter">
            <p className="mb-3 text-sm font-semibold">
              {playlists.length > 1 ? "Playlists pra corrida" : "Playlist pra corrida"}
            </p>
            <div className="flex flex-wrap gap-3">
              {playlists.map((entry, index) => (
                <a
                  key={`${entry.url}-${index}`}
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block"
                >
                  {entry.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- an external cover URL, next/image's optimizer isn't available in a static export anyway.
                    <img
                      src={entry.coverUrl}
                      alt="Capa da playlist"
                      className="h-20 w-20 rounded-xl border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-surface text-muted">
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18V5l10-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="16" cy="16" r="3" />
                      </svg>
                    </div>
                  )}
                </a>
              ))}
            </div>
          </Card>
        )}

        {!isFriend && !isSelf && (
          <Card className="pr-enter">
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Vira amigo pra ver as estatísticas e o que essa pessoa decidir compartilhar.
            </p>
          </Card>
        )}
      </Screen>

      {showAccountPrompt && (
        <AccountPrompt onClose={() => setShowAccountPrompt(false)} returnTo="/perfil/ver" />
      )}
    </>
  );
}
