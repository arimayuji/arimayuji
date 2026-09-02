"use client";

import { useEffect, useState } from "react";
import { listCompletedRuns, type CompletedRun } from "@/lib/tracking/storage";
import { usePreferences } from "@/lib/usePreferences";
import { CardTitle, EmptyState, Screen, ScreenHeader } from "../ui";
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
      {/* No `Card` chrome anywhere on this screen — a bordered box floating
          with margin makes sense when it's one widget among several (this
          same content sits inside a `Card` on /perfil's Progresso tab,
          next to other cards it needs to visually match), not when it's
          the entire page. Here the content sits directly on the page
          background, the same call already made for the Feed's own posts. */}
      <Screen>
        {load.status === "loading" && (
          <div className="animate-pulse">
            <div className="h-4 w-32 rounded bg-border" />
            <div className="mt-4 h-14 rounded-xl bg-border/70" />
          </div>
        )}

        {load.status === "error" && (
          <div>
            <CardTitle>Não deu pra ler o histórico</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              O armazenamento local do aparelho não respondeu. Em janela anônima ou com
              armazenamento bloqueado, o histórico não tem de onde vir.
            </p>
          </div>
        )}

        {load.status === "ready" && load.runs.length === 0 && (
          <EmptyState
            title="Nada pra mostrar ainda"
            description="Assim que a primeira corrida for salva, ela aparece aqui."
          />
        )}

        {load.status === "ready" && load.runs.length > 0 && (
          <ActivityCard runs={load.runs} unit={unit} onRunDeleted={handleRunDeleted} delayMs={0} bare />
        )}
      </Screen>
    </>
  );
}
