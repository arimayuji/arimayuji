"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getActiveLiveSession, type LiveRun } from "@/lib/liveRuns";
import { getProfile, type Profile } from "@/lib/auth";
import { formatElapsed, formatPace } from "@/lib/tracking/geoFilter";
import { usePreferences } from "@/lib/usePreferences";
import { formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { LiveMap } from "../../live-map";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../../ui";

/** Same threshold `/treinador/aluno` uses — a ping older than this reads as "not really live anymore" rather than a frozen dot, most likely the app closed without a clean end. */
const LIVE_STALE_MS = 45_000;
const LIVE_POLL_MS = 5_000;

/**
 * A friend's live position, mirroring the coach's own live card in
 * `/treinador/aluno` — same `getActiveLiveSession`/`LiveMap` combo, just a
 * standalone screen instead of one card among several, since a friend has
 * no after-the-fact run history to show here (that's `runsSync.ts`'s
 * `listRunsSharedByStudent`, coach-only — a friend only ever sees a run
 * while it's actually happening, never a synced list of past ones).
 */
export default function AmigoAoVivoPage() {
  return (
    <Suspense fallback={null}>
      <AmigoAoVivoContent />
    </Suspense>
  );
}

function AmigoAoVivoContent() {
  useHeaderClose("/amigos");
  const friendId = useSearchParams().get("id");
  const [{ distanceUnit: unit }] = usePreferences();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!friendId) return;
    let cancelled = false;
    getProfile(friendId).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [friendId]);

  /** Polled, not realtime — same reasoning `/treinador/aluno` documents for its own poll. */
  useEffect(() => {
    if (!friendId) return;
    let cancelled = false;
    const poll = () => {
      getActiveLiveSession(friendId).then((row) => {
        if (!cancelled) {
          setLiveRun(row);
          setNow(Date.now());
        }
      });
    };
    poll();
    const timer = setInterval(poll, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [friendId]);

  const liveStale = liveRun !== null && now !== null && now - liveRun.updatedAtMs > LIVE_STALE_MS;

  if (!friendId) {
    return (
      <Screen>
        <Card className="lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <CardTitle>Nenhum amigo selecionado</CardTitle>
          <Link href="/amigos" className="mt-2 inline-block text-sm text-accent underline underline-offset-2">
            Voltar pros amigos
          </Link>
        </Card>
      </Screen>
    );
  }

  return (
    <>
      <ScreenHeader
        title={profile?.displayName ?? "Corredor(a)"}
        subtitle={profile ? `@${profile.handle} · ao vivo enquanto a corrida rolar` : undefined}
      />

      <Screen>
        {liveRun && !liveStale ? (
          <>
            <div className="pr-enter overflow-hidden rounded-xl" style={delay(0)}>
              <div className="h-56 w-full">
                <LiveMap lat={liveRun.lat} lon={liveRun.lon} className="h-full w-full" />
              </div>
            </div>
            <div
              className="pr-enter rounded-2xl border border-border bg-surface p-4 lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4"
              style={delay(20)}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-good">
                <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden="true" />
                Ao vivo agora
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted">Distância</span>
                  <p className="font-mono text-lg tabular-nums">
                    {formatDistance(liveRun.distanceMeters, unit)}
                    <span className="ml-1 text-xs text-muted">{unitLabel(unit)}</span>
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted">Tempo</span>
                  <p className="font-mono text-lg tabular-nums">{formatElapsed(liveRun.elapsedSeconds)}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted">{paceLabel(unit)}</span>
                  <p className="font-mono text-lg tabular-nums">
                    {formatPace(liveRun.currentPaceSecPerKm ?? null)}
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : liveRun && liveStale ? (
          <Card
            className="pr-enter border-warn/30 bg-warn/5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
            style={delay(0)}
          >
            <p className="text-xs leading-relaxed text-muted text-pretty">
              Última posição recebida há um tempo — provavelmente a corrida já terminou sem avisar (app
              fechado, sinal perdido). Isso some sozinho na próxima sincronização.
            </p>
          </Card>
        ) : (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(0)}>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              {profile?.displayName ?? "Essa pessoa"} não está correndo agora. Essa tela atualiza sozinha
              assim que a corrida começar, se ela escolher compartilhar com você.
            </p>
          </Card>
        )}

        <Link
          href="/amigos"
          className="pr-enter text-center text-xs text-muted underline underline-offset-2"
          style={delay(20)}
        >
          Voltar pros amigos
        </Link>
      </Screen>
    </>
  );
}
