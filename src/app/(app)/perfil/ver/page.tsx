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
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profile, viewerStatus, reloadKey]);

  const isFriend = friendshipId !== null;
  const isSelf = viewer !== null && profile !== null && profile !== undefined && viewer.id === profile.$id;

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
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {formatDistance(stats.totalMeters, unit)}
                </p>
                <p className="text-xs text-muted">{unitLabel(unit)} corridos</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{stats.totalRuns}</p>
                <p className="text-xs text-muted">{stats.totalRuns === 1 ? "corrida" : "corridas"}</p>
              </div>
            </div>
          </Card>
        )}

        {isFriend && !stats && (
          <Card className="pr-enter">
            <p className="text-sm text-muted">Ainda sem corridas registradas.</p>
          </Card>
        )}

        {(isFriend || isSelf) && profile.playlistUrl && (
          <Card className="pr-enter">
            <a
              href={profile.playlistUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-3"
            >
              {profile.playlistCoverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- an external cover URL, next/image's optimizer isn't available in a static export anyway.
                <img
                  src={profile.playlistCoverUrl}
                  alt="Capa da playlist"
                  className="h-12 w-12 flex-none rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-surface text-muted">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l10-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="16" cy="16" r="3" />
                  </svg>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold">Playlist pra corrida</p>
                <p className="truncate text-xs text-muted">{profile.playlistUrl}</p>
              </div>
            </a>
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
