"use client";

import { useEffect, useState } from "react";
import { listCompletedRuns, type CompletedRun } from "@/lib/tracking/storage";
import { usePreferences } from "@/lib/usePreferences";
import { Card, CardTitle, Screen, ScreenHeader } from "../ui";
import { ActivityCard } from "../progresso/activity-feed";

type LoadState = { status: "loading" } | { status: "ready"; runs: CompletedRun[] } | { status: "error" };

/**
 * Its own bottom-nav tab again (was folded into /perfil's Progresso tab —
 * see PROJECT-CONTEXT.md's "Reorganização de IA" — after `/historico` had
 * already been folded into /progresso before that). Reopened as a direct
 * destination on request, without undoing either merge: this is a second
 * mount point for the exact same `ActivityCard`/`ActivityFeed` Progresso's
 * tab already renders, not a fork of it — the charts/constancy/emblems
 * cards Progresso also shows stay exactly where they are, inside /perfil.
 */
export default function HistoricoPage() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [{ distanceUnit: unit }] = usePreferences();

  useEffect(() => {
    let cancelled = false;
    listCompletedRuns()
      .then((runs) => {
        if (!cancelled) setLoad({ status: "ready", runs });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRunDeleted = (id: string) => {
    setLoad((current) =>
      current.status === "ready"
        ? { status: "ready", runs: current.runs.filter((run) => run.id !== id) }
        : current,
    );
  };

  return (
    <>
      {/* hideTitle: the bottom nav tab right below already reads "Histórico" — repeating it as a heading is redundant (2026-08-31). */}
      <ScreenHeader title="Histórico" hideTitle />
      <Screen>
        {load.status === "loading" && (
          <Card className="animate-pulse">
            <div className="h-4 w-32 rounded bg-border" />
            <div className="mt-4 h-14 rounded-xl bg-border/70" />
          </Card>
        )}

        {load.status === "error" && (
          <Card>
            <CardTitle>Não deu pra ler o histórico</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              O armazenamento local do aparelho não respondeu. Em janela anônima ou com
              armazenamento bloqueado, o histórico não tem de onde vir.
            </p>
          </Card>
        )}

        {load.status === "ready" && load.runs.length === 0 && (
          <Card className="overflow-hidden">
            <div className="-mx-5 -mt-5 mb-6 h-48 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export has no image optimizer; a fixed /public asset doesn't need next/image anyway. */}
              <img
                src="/progresso-empty.png"
                alt="Ilustração de pegadas numa trilha, começando uma jornada"
                className="h-full w-full object-cover"
              />
            </div>
            <CardTitle>Nada pra mostrar ainda</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              Assim que a primeira corrida for salva, ela aparece aqui.
            </p>
          </Card>
        )}

        {load.status === "ready" && load.runs.length > 0 && (
          <ActivityCard runs={load.runs} unit={unit} onRunDeleted={handleRunDeleted} delayMs={0} />
        )}
      </Screen>
    </>
  );
}
