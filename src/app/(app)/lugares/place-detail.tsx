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
import { useAuth } from "@/lib/useAuth";
import { AccountPrompt } from "../account-prompt";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader } from "../ui";
import { CircuitMap } from "./circuit-map";
import { CriteriaRow } from "./criteria";
import { RatePlaceModal } from "./rate-place-modal";

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
        <Card className="pr-enter" style={delay(40)}>
          <p className="text-sm leading-relaxed text-pretty">{place.description}</p>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
            <strong className="font-medium text-foreground">Melhor horário:</strong> {place.bestTime}
          </p>
        </Card>

        {place.circuits && place.circuits.length > 0 && (
          <Card className="pr-enter" style={delay(60)}>
            <CardTitle>Circuitos sugeridos</CardTitle>
            <CircuitMap circuits={place.circuits} />
          </Card>
        )}

        {place.safetyFlag && (
          <Card className="pr-enter border-bad/30 bg-bad/5" style={delay(70)}>
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

        <Card className="pr-enter" style={delay(100)}>
          <CardTitle aside={<NoticeBadge>curadoria inicial</NoticeBadge>}>Critérios</CardTitle>
          <div className="flex flex-col gap-3">
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

        <Card className="pr-enter" style={delay(130)}>
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
            <div className="flex flex-col gap-3">
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
            <ul className="mt-5 flex flex-col gap-3">
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
