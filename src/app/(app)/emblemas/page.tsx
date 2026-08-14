"use client";

import { useEffect, useState } from "react";
import {
  computeEmblem,
  crossedMilestones,
  EMBLEM_LADDER_KM,
  formatEmblemKm,
  nextMilestone,
  totalDistanceMeters,
} from "@/lib/tracking/emblems";
import { listCompletedRuns, listOpenedEmblemKm, markEmblemOpened } from "@/lib/tracking/storage";
import { EmblemBadge } from "../emblem-badge";
import { EmblemReveal } from "../emblem-reveal";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../ui";

/**
 * The collectible's own home — every rung of the ladder always visible, not
 * just the ones already reached, so the collection reads as a fixed set to
 * fill in rather than an open-ended feed. See emblems.ts for why this stays
 * a separate system from the per-run PR achievements on /historico.
 */

export default function EmblemasPage() {
  const [totalMeters, setTotalMeters] = useState<number | null>(null);
  const [openedKm, setOpenedKm] = useState<number[]>([]);
  const [revealingKm, setRevealingKm] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCompletedRuns().then((runs) => {
      if (!cancelled) setTotalMeters(totalDistanceMeters(runs));
    });
    listOpenedEmblemKm().then((km) => {
      if (!cancelled) setOpenedKm(km);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const crossed = totalMeters === null ? [] : crossedMilestones(totalMeters);
  const next = totalMeters === null ? null : nextMilestone(totalMeters);

  const handleOpened = (km: number) => {
    setOpenedKm((current) => (current.includes(km) ? current : [...current, km]));
    void markEmblemOpened(km);
  };

  return (
    <>
      <ScreenHeader
        title="Emblemas"
        subtitle="Um emblema por marco de quilometragem — a soma de tudo que você já correu aqui dentro."
      />

      <Screen>
        <Card className="pr-enter" style={delay(0)}>
          <CardTitle>Quilometragem na vida</CardTitle>
          <p className="font-mono text-3xl font-semibold tabular-nums">
            {totalMeters === null
              ? "—"
              : (totalMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            <span className="ml-1 text-sm text-muted">km</span>
          </p>
          {next && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${next.progress * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Faltam{" "}
                {(next.remainingMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km
                pro próximo emblema, {formatEmblemKm(next.km)} km.
              </p>
            </div>
          )}
          {!next && totalMeters !== null && (
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Você já tem todos os emblemas — a coleção está completa.
            </p>
          )}
        </Card>

        <Card className="pr-enter" style={delay(20)}>
          <CardTitle>Coleção</CardTitle>
          <div className="grid grid-cols-3 gap-3">
            {EMBLEM_LADDER_KM.map((km) => {
              const isCrossed = crossed.includes(km);
              const isOpened = isCrossed && openedKm.includes(km);
              const state = !isCrossed ? "locked" : isOpened ? "opened" : "sealed";
              return (
                <button
                  key={km}
                  type="button"
                  disabled={!isCrossed}
                  onClick={() => setRevealingKm(km)}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-2 disabled:cursor-default"
                >
                  <EmblemBadge emblem={computeEmblem(km)} state={state} className="block h-16 w-16" />
                  <span
                    className={`font-mono text-[10px] ${isCrossed ? "text-foreground" : "text-muted/60"}`}
                  >
                    {formatEmblemKm(km)} km
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </Screen>

      {revealingKm !== null && (
        <EmblemReveal
          km={revealingKm}
          alreadyOpened={openedKm.includes(revealingKm)}
          onOpened={() => handleOpened(revealingKm)}
          onClose={() => setRevealingKm(null)}
        />
      )}
    </>
  );
}
