"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listRunsSharedByStudent, type SyncedRun } from "@/lib/runsSync";
import { getProfile, type Profile } from "@/lib/auth";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { usePreferences } from "@/lib/usePreferences";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../../ui";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * A coach's read-only view of one student's shared runs — sourced from the
 * Appwrite `runs` table, never from this device's own IndexedDB, since
 * these are runs someone else recorded on their own phone. Access control
 * is entirely row-level permissions: `listRunsSharedByStudent` just returns
 * whatever the signed-in account can actually read, so an unaccepted or
 * revoked relationship shows an empty list here rather than needing its own
 * check.
 */
export default function AlunoPage() {
  return (
    <Suspense fallback={null}>
      <AlunoContent />
    </Suspense>
  );
}

function AlunoContent() {
  const studentId = useSearchParams().get("id");
  const [{ distanceUnit: unit }] = usePreferences();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [runs, setRuns] = useState<SyncedRun[] | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    getProfile(studentId).then((p) => {
      if (!cancelled) setProfile(p);
    });
    listRunsSharedByStudent(studentId).then((rows) => {
      if (!cancelled) setRuns(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (!studentId) {
    return (
      <Screen>
        <Card>
          <CardTitle>Nenhum aluno selecionado</CardTitle>
          <Link href="/treinador" className="mt-2 inline-block text-sm text-accent underline underline-offset-2">
            Voltar pro treinador
          </Link>
        </Card>
      </Screen>
    );
  }

  return (
    <>
      <ScreenHeader
        title={profile?.displayName ?? "Corredor(a)"}
        subtitle={profile ? `@${profile.handle} · corridas que decidiu compartilhar com você` : undefined}
      />

      <Screen>
        <Card className="pr-enter" style={delay(20)}>
          <CardTitle>Corridas compartilhadas</CardTitle>
          {runs === null ? (
            <div className="h-12 animate-pulse rounded-lg bg-background" />
          ) : runs.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted">
              Nada por aqui ainda — o aluno envia uma corrida quando quiser, na tela de detalhe dela.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {runs.map((run) => (
                <li key={run.$id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted">
                      {dateFormatter.format(new Date(run.startedAt))}
                    </span>
                    {run.shoeName && <span className="truncate text-xs text-muted">{run.shoeName}</span>}
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] uppercase tracking-wide text-muted">Distância</span>
                      <p className="font-mono text-base tabular-nums">
                        {formatDistance(run.distanceMeters, unit)}
                        <span className="ml-1 text-xs text-muted">{unitLabel(unit)}</span>
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wide text-muted">Tempo</span>
                      <p className="font-mono text-base tabular-nums">{formatElapsed(run.movingSeconds)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wide text-muted">{paceLabel(unit)}</span>
                      <p className="font-mono text-base tabular-nums">
                        {formatAveragePace(run.distanceMeters, run.movingSeconds, unit)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Link
          href="/treinador"
          className="pr-enter text-center text-xs text-muted underline underline-offset-2"
          style={delay(60)}
        >
          Voltar pro treinador
        </Link>
      </Screen>
    </>
  );
}
