"use client";

import { useEffect, useState } from "react";
import {
  collectibleDisplay,
  crossedElevationMilestones,
  crossedTimeMilestones,
  ELEVATION_LADDER_M,
  formatElevationM,
  formatTimeHours,
  nextElevationMilestone,
  nextTimeMilestone,
  TIME_LADDER_HOURS,
  totalElevationMeters,
  totalMovingHours,
} from "@/lib/tracking/collectibles";
import {
  crossedMilestones,
  EMBLEM_LADDER_KM,
  formatEmblemKm,
  nextMilestone,
  totalDistanceMeters,
} from "@/lib/tracking/emblems";
import {
  listCompletedRuns,
  listOpenedEmblems,
  markEmblemOpened,
  type CompletedRun,
  type EmblemCategory,
} from "@/lib/tracking/storage";
import { EmblemBadge } from "../emblem-badge";
import { EmblemReveal } from "../emblem-reveal";
import { useHeaderClose } from "../app-shell";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../ui";

/**
 * The collectible's own home — three ladders (quilometragem, elevação,
 * tempo), each with every rung always visible, not just the ones already
 * reached, so each collection reads as a fixed set to fill in rather than an
 * open-ended feed. See emblems.ts for why this stays a separate system from
 * the per-run PR achievements on /historico, and collectibles.ts for the two
 * newer ladders.
 */

function CollectionGrid({
  category,
  ladder,
  crossedValues,
  openedValues,
  onSelect,
}: {
  category: EmblemCategory;
  ladder: readonly number[];
  crossedValues: number[];
  openedValues: number[];
  onSelect: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {ladder.map((value) => {
        const isCrossed = crossedValues.includes(value);
        const isOpened = isCrossed && openedValues.includes(value);
        const state = !isCrossed ? "locked" : isOpened ? "opened" : "sealed";
        const { metal, gridLabel } = collectibleDisplay(category, value);
        return (
          <button
            key={value}
            type="button"
            disabled={!isCrossed}
            onClick={() => onSelect(value)}
            className="flex flex-col items-center gap-1.5 rounded-xl p-2 disabled:cursor-default"
          >
            <EmblemBadge
              category={category}
              value={value}
              metal={metal}
              state={state}
              className="block h-16 w-16"
            />
            <span className={`font-mono text-[10px] ${isCrossed ? "text-foreground" : "text-muted/60"}`}>
              {gridLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function EmblemasPage() {
  useHeaderClose("/perfil?tab=progresso");
  const [runs, setRuns] = useState<CompletedRun[] | null>(null);
  const [openedByCategory, setOpenedByCategory] = useState<Record<EmblemCategory, number[]>>({
    distancia: [],
    elevacao: [],
    tempo: [],
  });
  const [revealing, setRevealing] = useState<{ category: EmblemCategory; value: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCompletedRuns().then((loaded) => {
      if (!cancelled) setRuns(loaded);
    });
    listOpenedEmblems().then((rows) => {
      if (cancelled) return;
      const next: Record<EmblemCategory, number[]> = { distancia: [], elevacao: [], tempo: [] };
      for (const row of rows) next[row.category].push(row.value);
      setOpenedByCategory(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalMeters = runs === null ? null : totalDistanceMeters(runs);
  const totalElevation = runs === null ? null : totalElevationMeters(runs);
  const totalHours = runs === null ? null : totalMovingHours(runs);

  const crossedDistance = totalMeters === null ? [] : crossedMilestones(totalMeters);
  const crossedElevation = totalElevation === null ? [] : crossedElevationMilestones(totalElevation);
  const crossedTime = totalHours === null ? [] : crossedTimeMilestones(totalHours);

  const nextDistance = totalMeters === null ? null : nextMilestone(totalMeters);
  const nextElevation = totalElevation === null ? null : nextElevationMilestone(totalElevation);
  const nextTime = totalHours === null ? null : nextTimeMilestone(totalHours);

  const handleOpened = (category: EmblemCategory, value: number) => {
    setOpenedByCategory((current) =>
      current[category].includes(value)
        ? current
        : { ...current, [category]: [...current[category], value] },
    );
    void markEmblemOpened(category, value);
  };

  return (
    <>
      <ScreenHeader title="Emblemas" />

      <Screen>
        <Card className="pr-enter" style={delay(0)}>
          <CardTitle>Quilometragem na vida</CardTitle>
          <p className="font-mono text-3xl font-semibold tabular-nums">
            {totalMeters === null
              ? "—"
              : (totalMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            <span className="ml-1 text-sm text-muted">km</span>
          </p>
          {nextDistance && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${nextDistance.progress * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Faltam{" "}
                {(nextDistance.remainingMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{" "}
                km pro próximo emblema, {formatEmblemKm(nextDistance.km)} km.
              </p>
            </div>
          )}
          {!nextDistance && totalMeters !== null && (
            <p className="mt-4 text-xs leading-relaxed text-muted">Coleção completa.</p>
          )}
        </Card>

        <Card className="pr-enter" style={delay(20)}>
          <CardTitle>Coleção · Quilometragem</CardTitle>
          <CollectionGrid
            category="distancia"
            ladder={EMBLEM_LADDER_KM}
            crossedValues={crossedDistance}
            openedValues={openedByCategory.distancia}
            onSelect={(value) => setRevealing({ category: "distancia", value })}
          />
        </Card>

        <Card className="pr-enter" style={delay(40)}>
          <CardTitle>Elevação na vida</CardTitle>
          <p className="font-mono text-3xl font-semibold tabular-nums">
            {totalElevation === null ? "—" : Math.round(totalElevation).toLocaleString("pt-BR")}
            <span className="ml-1 text-sm text-muted">m</span>
          </p>
          {nextElevation && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${nextElevation.progress * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Faltam {Math.round(nextElevation.remaining).toLocaleString("pt-BR")} m pro próximo emblema,{" "}
                {formatElevationM(nextElevation.value)}.
              </p>
            </div>
          )}
          {!nextElevation && totalElevation !== null && (
            <p className="mt-4 text-xs leading-relaxed text-muted">Coleção completa.</p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted/70">
            Calculado a partir das corridas que você já abriu pelo menos uma vez — abrir uma corrida
            antiga soma a elevação dela aqui também.
          </p>
        </Card>

        <Card className="pr-enter" style={delay(60)}>
          <CardTitle>Coleção · Elevação</CardTitle>
          <CollectionGrid
            category="elevacao"
            ladder={ELEVATION_LADDER_M}
            crossedValues={crossedElevation}
            openedValues={openedByCategory.elevacao}
            onSelect={(value) => setRevealing({ category: "elevacao", value })}
          />
        </Card>

        <Card className="pr-enter" style={delay(80)}>
          <CardTitle>Tempo na vida</CardTitle>
          <p className="font-mono text-3xl font-semibold tabular-nums">
            {totalHours === null ? "—" : totalHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            <span className="ml-1 text-sm text-muted">h</span>
          </p>
          {nextTime && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-accent" style={{ width: `${nextTime.progress * 100}%` }} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Faltam {nextTime.remaining.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h pro
                próximo emblema, {formatTimeHours(nextTime.value)}.
              </p>
            </div>
          )}
          {!nextTime && totalHours !== null && (
            <p className="mt-4 text-xs leading-relaxed text-muted">Coleção completa.</p>
          )}
        </Card>

        <Card className="pr-enter" style={delay(100)}>
          <CardTitle>Coleção · Tempo</CardTitle>
          <CollectionGrid
            category="tempo"
            ladder={TIME_LADDER_HOURS}
            crossedValues={crossedTime}
            openedValues={openedByCategory.tempo}
            onSelect={(value) => setRevealing({ category: "tempo", value })}
          />
        </Card>
      </Screen>

      {revealing && (
        <EmblemReveal
          category={revealing.category}
          value={revealing.value}
          alreadyOpened={openedByCategory[revealing.category].includes(revealing.value)}
          onOpened={() => handleOpened(revealing.category, revealing.value)}
          onClose={() => setRevealing(null)}
        />
      )}
    </>
  );
}
