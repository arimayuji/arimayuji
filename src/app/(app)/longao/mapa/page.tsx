"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getGroupRun, normalizeJoinCode, type GroupRun } from "@/lib/groupRuns";
import { useGroupLiveRuns, buildGroupMarkers, GROUP_LIVE_STALE_MS } from "@/lib/useGroupLiveRuns";
import { useAuth } from "@/lib/useAuth";
import { formatDistanceKm, formatPace } from "@/lib/tracking/geoFilter";
import { GroupLiveMap } from "../../group-live-map";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../../ui";

export default function LongaoMapaPage() {
  return (
    <Suspense fallback={null}>
      <LongaoMapaContent />
    </Suspense>
  );
}

/** Seconds-since-update, formatted the same rough way `/treinador/aluno` already does — an exact figure would just be noise on a number that only needs to answer "is this still current". */
function agoLabel(updatedAtMs: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - updatedAtMs) / 1000));
  if (seconds < 60) return `há ${seconds}s`;
  return `há ${Math.round(seconds / 60)} min`;
}

/**
 * The spectator's view of a "longão" — someone not currently running
 * themselves (hasn't started yet, finished early, or is just watching from
 * the sidelines) opens this to see the whole group on one map. A runner
 * mid-run gets the same map from a sheet inside /run instead (see
 * run/page.tsx's "Grupo" button) — see the plan's own note on why
 * `useRunTracker` being page-local state rules out sending them here.
 */
function LongaoMapaContent() {
  useHeaderClose("/longao");
  const codeParam = useSearchParams().get("c");
  const code = codeParam ? normalizeJoinCode(codeParam) : null;
  const { account } = useAuth();
  const [session, setSession] = useState<GroupRun | null | undefined>(undefined);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    getGroupRun(code).then((row) => {
      if (!cancelled) setSession(row);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const data = useGroupLiveRuns(code, true);
  const markers = buildGroupMarkers(data, account?.id ?? null);
  const liveByUserId = new Map(data.liveRuns.map((run) => [run.userId, run]));

  if (!code) {
    return (
      <Screen>
        <Card className="lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <CardTitle>Nenhum longão selecionado</CardTitle>
          <Link href="/longao" className="mt-2 inline-block text-sm text-accent underline underline-offset-2">
            Voltar pro longão
          </Link>
        </Card>
      </Screen>
    );
  }

  return (
    <>
      <ScreenHeader
        title={session?.name ?? "Longão"}
        subtitle={code ? `Código ${code}` : undefined}
      />

      <Screen>
        {session === undefined && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(0)}>
            <p className="text-sm text-muted">Carregando…</p>
          </Card>
        )}

        {session === null && (
          <Card className="pr-enter lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" style={delay(0)}>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Não achei esse longão — o código pode estar errado, ou a sessão já venceu.
            </p>
            <Link href="/longao" className="mt-3 inline-block text-sm text-accent underline underline-offset-2">
              Voltar pro longão
            </Link>
          </Card>
        )}

        {session && (
          <>
            <div className="pr-enter overflow-hidden rounded-xl" style={delay(0)}>
              <div className="h-72 w-full">
                <GroupLiveMap markers={markers} className="h-full w-full" />
              </div>
            </div>

            <Card
              className="pr-enter lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none"
              style={delay(40)}
            >
              <CardTitle>Quem está no longão</CardTitle>
              {data.participants.length === 0 ? (
                <div className="h-10 animate-pulse rounded-lg bg-background" />
              ) : (
                <ul className="flex flex-col gap-3.5">
                  {data.participants.map((connection) => {
                    const run = liveByUserId.get(connection.participant.userId);
                    const stale = run ? data.now - run.updatedAtMs > GROUP_LIVE_STALE_MS : false;
                    return (
                      <li
                        key={connection.participant.$id}
                        className="flex items-center justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {connection.profile?.displayName ?? "Corredor(a)"}
                          </p>
                          {run && !stale ? (
                            <p className="font-mono text-xs text-muted">
                              {formatDistanceKm(run.distanceMeters)} km ·{" "}
                              {formatPace(run.currentPaceSecPerKm ?? null)} · {agoLabel(run.updatedAtMs, data.now)}
                            </p>
                          ) : run && stale ? (
                            <p className="text-xs text-muted">sem sinal — última posição {agoLabel(run.updatedAtMs, data.now)}</p>
                          ) : (
                            <p className="text-xs text-muted">não está compartilhando agora</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}
      </Screen>
    </>
  );
}
