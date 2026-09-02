"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProfile, type Profile } from "@/lib/auth";
import type { RunningPlace } from "@/lib/places";
import {
  averageRatings,
  CRITERIA_KEYS,
  getMyRating,
  getRatingsForPlace,
  type PlaceRating,
} from "@/lib/placeRatings";
import { getLeaderboardForPlace, type PlaceLeaderboardEntry } from "@/lib/placeLeaderboard";
import { listFriendConnections } from "@/lib/friendships";
import { formatDistanceKm } from "@/lib/tracking/geoFilter";
import { useAuth } from "@/lib/useAuth";
import { AccountPrompt } from "../account-prompt";
import { useHeaderClose } from "../app-shell";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader, SegmentedButton } from "../ui";
import { CircuitMap } from "./circuit-map";
import { CriteriaRow } from "./criteria";
import { RatePlaceModal } from "./rate-place-modal";

type LeaderboardScope = "public" | "friends";

/**
 * Top-N by cumulative km at this place, two views sharing one dataset: the
 * "amigos" tab is a client-side filter over the same public rows
 * `getLeaderboardForPlace` returns, cross-referenced against the caller's
 * own accepted friends — see `placeLeaderboard.ts`'s own header comment
 * for why there's no separately-gated friends dataset. Name shown per
 * scope: `publicDisplayName` (falling back to `handle`) in "público", the
 * real `displayName` in "amigos" — same split the opt-in card in /perfil
 * explains to the athlete before they ever turn this on. The real name
 * comes from `listFriendConnections`'s own resolved profiles, never from
 * the leaderboard entry itself — `getLeaderboardForPlace` only ever
 * carries the public-safe fields (see its own comment), since that list
 * is fetched by anyone who opens the place, not gated on friendship.
 */
function PlaceLeaderboardSection({ placeId }: { placeId: string }) {
  const { status, account } = useAuth();
  const [entries, setEntries] = useState<PlaceLeaderboardEntry[] | null>(null);
  const [friendProfiles, setFriendProfiles] = useState<Map<string, Profile> | null>(null);
  const [scope, setScope] = useState<LeaderboardScope>("public");

  useEffect(() => {
    let cancelled = false;
    getLeaderboardForPlace(placeId).then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  useEffect(() => {
    if (status !== "signed-in") return;
    let cancelled = false;
    listFriendConnections("accepted").then((rows) => {
      if (cancelled) return;
      const map = new Map<string, Profile>();
      for (const row of rows) {
        if (row.profile) map.set(row.otherId, row.profile);
      }
      setFriendProfiles(map);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const visible =
    scope === "public"
      ? entries
      : entries?.filter((entry) => entry.userId === account?.id || friendProfiles?.has(entry.userId));

  return (
    <Card
      className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
      style={delay(145)}
    >
      <CardTitle aside={<NoticeBadge>opcional</NoticeBadge>}>Ranking</CardTitle>
      <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
        Km total corrido aqui, entre quem ligou o ranking em Perfil e confirmou pelo menos uma
        corrida neste lugar.
      </p>

      <div className="mb-3 flex gap-2">
        <SegmentedButton selected={scope === "public"} onClick={() => setScope("public")}>
          Público
        </SegmentedButton>
        <SegmentedButton selected={scope === "friends"} onClick={() => setScope("friends")}>
          Amigos
        </SegmentedButton>
      </div>

      {scope === "friends" && status !== "signed-in" ? (
        <p className="text-sm leading-relaxed text-muted">Entre com sua conta pra ver o ranking entre amigos.</p>
      ) : visible === undefined || visible === null ? (
        <p className="text-sm leading-relaxed text-muted">Carregando ranking…</p>
      ) : visible.length === 0 ? (
        scope === "public" ? (
          <div className="text-center">
            <div className="mx-auto mb-4 h-32 w-full max-w-[220px] overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway. */}
              <img
                src="/lugares-ranking-empty.png"
                alt="Ilustração de uma placa de trilha num caminho vazio"
                className="h-full w-full object-cover"
              />
            </div>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Ninguém participando ainda — seja a primeira pessoa a contar uma corrida aqui.
            </p>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted text-pretty">
            Nenhum amigo seu participa do ranking neste lugar ainda.
          </p>
        )
      ) : (
        <ol className="flex flex-col gap-3.5">
          {visible.map((entry, i) => {
            const name =
              scope === "public"
                ? entry.profile?.publicDisplayName || (entry.profile ? `@${entry.profile.handle}` : "corredor(a)")
                : (entry.userId === account?.id ? account.name : undefined) ??
                  friendProfiles?.get(entry.userId)?.displayName ??
                  (entry.profile ? `@${entry.profile.handle}` : "corredor(a)");
            return (
              <li key={entry.userId} className="flex items-center gap-3 border-t border-border pt-2.5 first:border-t-0 first:pt-0">
                <span className="w-5 shrink-0 text-center font-mono text-xs text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                <span className="shrink-0 font-mono text-sm tabular-nums">
                  {formatDistanceKm(entry.totalMeters)} <span className="text-xs text-muted">km</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

const RETURN_TO = "/lugares";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function PlaceDetail({ place }: { place: RunningPlace }) {
  useHeaderClose("/lugares");
  const { status, account, refresh } = useAuth();
  const [ratings, setRatings] = useState<PlaceRating[] | null>(null);
  const [raterProfiles, setRaterProfiles] = useState<Record<string, Profile>>({});
  // Tagged with which account it answered for, so a stale rating from a
  // previous session can never be attributed to whoever's signed in now —
  // same pattern as HandlePicker's `availability` state.
  const [myRatingState, setMyRatingState] = useState<{ accountId: string; rating: PlaceRating | null } | null>(null);
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRatingsForPlace(place.id).then((rows) => {
      if (cancelled) return;
      setRatings(rows);
      Promise.all(rows.map((row) => getProfile(row.userId))).then((profiles) => {
        if (cancelled) return;
        const map: Record<string, Profile> = {};
        rows.forEach((row, i) => {
          const profile = profiles[i];
          if (profile) map[row.userId] = profile;
        });
        setRaterProfiles(map);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [place.id]);

  useEffect(() => {
    if (status !== "signed-in" || !account) return;
    let cancelled = false;
    getMyRating(place.id, account.id).then((rating) => {
      if (!cancelled) setMyRatingState({ accountId: account.id, rating });
    });
    return () => {
      cancelled = true;
    };
  }, [status, account, place.id]);

  const myRating =
    status === "signed-in" && account && myRatingState?.accountId === account.id ? myRatingState.rating : null;

  const averages = ratings && ratings.length > 0 ? averageRatings(ratings) : null;
  const communityCount = ratings?.length ?? 0;

  return (
    <>
      <ScreenHeader title={place.name} subtitle={place.neighborhood} />

      <Screen>
        <Card
          className="pr-enter overflow-hidden lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
          style={delay(40)}
        >
          {place.coverImage && (
            <div className="-mx-5 -mt-5 mb-4 h-40 overflow-hidden lg:mx-0 lg:mt-0 lg:rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway. */}
              <img src={place.coverImage} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <p className="text-sm leading-relaxed text-pretty">{place.description}</p>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
            <strong className="font-medium text-foreground">Melhor horário:</strong> {place.bestTime}
          </p>
        </Card>

        {place.circuits && place.circuits.length > 0 && (
          <div className="pr-enter" style={delay(60)}>
            <CardTitle>Circuitos sugeridos</CardTitle>
            <CircuitMap circuits={place.circuits} />
          </div>
        )}

        {place.safetyFlag && (
          <Card
            className="pr-enter border-bad/30 bg-bad/5 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-2"
            style={delay(70)}
          >
            <div className="flex items-start gap-2.5">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden="true" {...STROKE}>
                <path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-bad">Atenção</p>
                <p className="mt-1 text-sm leading-relaxed text-pretty">{place.safetyFlag}</p>
              </div>
            </div>
          </Card>
        )}

        <Card
          className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
          style={delay(100)}
        >
          <CardTitle aside={<NoticeBadge>curadoria inicial</NoticeBadge>}>Critérios</CardTitle>
          <div className="flex flex-col gap-3.5">
            {CRITERIA_KEYS.map((key) => (
              <CriteriaRow key={key} criteriaKey={key} score={place.criteria[key].score} note={place.criteria[key].note} />
            ))}
          </div>
          <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted">
            Fontes:{" "}
            {place.sources.map((source, i) => (
              <span key={source}>
                {i > 0 && ", "}
                <a href={source} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-accent">
                  {hostnameOf(source)}
                </a>
              </span>
            ))}
          </p>
        </Card>

        <Card
          className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
          style={delay(130)}
        >
          <CardTitle
            aside={
              <NoticeBadge>
                {ratings === null ? "carregando…" : communityCount > 0 ? `${communityCount} avaliação(ões)` : "ninguém ainda"}
              </NoticeBadge>
            }
          >
            Avaliação da comunidade
          </CardTitle>

          {averages ? (
            <div className="flex flex-col gap-3.5">
              {CRITERIA_KEYS.map((key) => (
                <CriteriaRow key={key} criteriaKey={key} score={averages[key].average} />
              ))}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted text-pretty">
              {ratings === null
                ? "Carregando avaliações…"
                : "Ainda sem avaliações reais — os números acima são só a curadoria inicial. Seja a primeira pessoa a avaliar."}
            </p>
          )}

          {status === "signed-in" && (
            <button
              type="button"
              onClick={() => setShowRateModal(true)}
              className="mt-5 w-full rounded-xl border border-accent py-3 text-sm font-semibold text-accent"
            >
              {myRating ? "Atualizar sua avaliação" : "Avaliar esse lugar"}
            </button>
          )}
          {status === "signed-out" && (
            <button
              type="button"
              onClick={() => setShowAccountPrompt(true)}
              className="mt-5 w-full rounded-xl border border-accent py-3 text-sm font-semibold text-accent"
            >
              Avaliar esse lugar
            </button>
          )}
          {status === "needs-handle" && (
            <p className="mt-5 text-center text-xs text-muted">
              <Link href="/perfil" className="underline underline-offset-2 hover:text-accent">
                Termina de criar sua conta no Perfil
              </Link>{" "}
              pra avaliar.
            </p>
          )}

          {ratings && ratings.length > 0 && (
            <ul className="mt-5 flex flex-col gap-3.5">
              {ratings.map((rating) => {
                const rater = raterProfiles[rating.userId];
                return (
                  <li key={rating.$id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold">{rater ? `@${rater.handle}` : "corredor(a)"}</span>
                      <span className="font-mono text-[10px] text-muted">
                        {new Date(rating.$createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {rating.note && (
                      <p className="mt-1 text-xs leading-relaxed text-muted text-pretty">{rating.note}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <PlaceLeaderboardSection placeId={place.id} />

        <Link
          href="/lugares"
          className="pr-enter text-center text-xs text-muted underline underline-offset-2"
          style={delay(160)}
        >
          Voltar pra todos os lugares
        </Link>
      </Screen>

      {showAccountPrompt && <AccountPrompt onClose={() => setShowAccountPrompt(false)} returnTo={RETURN_TO} />}

      {showRateModal && account && (
        <RatePlaceModal
          placeId={place.id}
          existing={myRating}
          onClose={() => setShowRateModal(false)}
          onSaved={(rating) => {
            setMyRatingState({ accountId: account.id, rating });
            setShowRateModal(false);
            void refresh();
            getRatingsForPlace(place.id).then(setRatings);
          }}
        />
      )}
    </>
  );
}
