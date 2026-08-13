"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { estimateCalories } from "@/lib/calories";
import { computeElevationGain } from "@/lib/elevation";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { computeAchievement } from "@/lib/tracking/achievements";
import { computeRunRecords, type RunRecord } from "@/lib/tracking/personalRecords";
import { computeSplits, type Split } from "@/lib/tracking/splits";
import {
  deleteCompletedRun,
  getCompletedRun,
  listCompletedRuns,
  markRecordOpened,
  runMovingSeconds,
  updateRunElevationGain,
  type CompletedRun,
} from "@/lib/tracking/storage";
import { usePreferences } from "@/lib/usePreferences";
import { useRunnerProfile } from "@/lib/useRunnerProfile";
import { formatAveragePace, formatDistance, metersPerUnit, paceLabel, unitLabel } from "@/lib/units";
import { AchievementReveal } from "../../achievement-reveal";
import { PrBadge } from "../../pr-badge";
import { RouteReplay } from "../../route-replay";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader } from "../../ui";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function formatRunDate(date: Date): string {
  const text = dateFormatter.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; run: CompletedRun; records: RunRecord[] };

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7m2 0-.7 12.4A2 2 0 0 1 14.31 21H9.69a2 2 0 0 1-1.99-1.6L7 7" />
    </svg>
  );
}

function SplitsTable({ splits, unit }: { splits: Split[]; unit: "km" | "mi" }) {
  if (splits.length === 0) return null;
  const paces = splits.map((s) => s.durationSeconds / (s.distanceMeters / metersPerUnit(unit)));
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);

  return (
    <Card className="pr-enter" style={delay(140)}>
      <CardTitle>Parciais por {unitLabel(unit)}</CardTitle>
      <ul className="flex flex-col gap-2">
        {splits.map((split, i) => {
          const pace = paces[i];
          const isFastest = pace === fastest && fastest !== slowest;
          const barPercent = slowest > fastest ? ((pace - fastest) / (slowest - fastest)) * 100 : 0;
          return (
            <li key={split.index} className="flex items-center gap-3 text-sm">
              <span className="w-5 shrink-0 font-mono text-xs text-muted">{split.index}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full rounded-full ${isFastest ? "bg-good" : "bg-accent"}`}
                  style={{ width: `${100 - barPercent * 0.7}%` }}
                />
              </div>
              <span
                className={`w-14 shrink-0 text-right font-mono text-xs tabular-nums ${isFastest ? "font-semibold text-good" : "text-foreground"}`}
              >
                {formatAveragePace(split.distanceMeters, split.durationSeconds, unit)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function RunDetail({ id }: { id: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [{ distanceUnit: unit }] = usePreferences();
  const [runnerProfile] = useRunnerProfile();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [computedElevationGain, setComputedElevationGain] = useState<number | null>(null);
  const [openedMeters, setOpenedMeters] = useState<number[]>([]);
  const [revealing, setRevealing] = useState<{ record: RunRecord; wasOpened: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCompletedRun(id), listCompletedRuns()]).then(([run, allRuns]) => {
      if (cancelled) return;
      if (!run) {
        setLoad({ status: "not-found" });
        return;
      }
      setOpenedMeters(run.openedRecordMeters ?? []);
      setLoad({ status: "ready", run, records: computeRunRecords(run, allRuns) });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (load.status !== "ready" || load.run.elevationGainMeters !== undefined) return;
    let cancelled = false;
    computeElevationGain(load.run.points).then((gain) => {
      if (cancelled || gain === null) return;
      setComputedElevationGain(gain);
      void updateRunElevationGain(load.run.id, gain);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (load.status === "loading") {
    return (
      <Screen>
        <Card className="animate-pulse">
          <div className="h-48 rounded-xl bg-border/70" />
        </Card>
      </Screen>
    );
  }

  if (load.status === "not-found") {
    return (
      <Screen>
        <Card>
          <CardTitle>Corrida não encontrada</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            Esse registro não existe mais neste aparelho — pode já ter sido excluído.
          </p>
          <Link href="/historico" className="mt-4 inline-block text-sm text-accent underline underline-offset-2">
            Voltar pro histórico
          </Link>
        </Card>
      </Screen>
    );
  }

  const { run, records } = load;
  const seconds = runMovingSeconds(run);
  const started = new Date(run.startedAt);
  const newRecords = records.filter((r) => r.isNewRecord);
  const splits = computeSplits(run.points, metersPerUnit(unit));
  const elevationGain = run.elevationGainMeters ?? computedElevationGain;
  const calories = runnerProfile.weightKg
    ? estimateCalories(run.distanceMeters, elevationGain, runnerProfile.weightKg)
    : null;

  /**
   * The flag is written optimistically and its failure swallowed: it only
   * decides whether the box animation replays, and a record whose "opened"
   * state was never persisted still shows the same item. It is written when
   * the lid actually comes off, not when the modal opens, so the card behind
   * doesn't give the tier away while the box is still shut.
   */
  const handleRecordUnboxed = (record: RunRecord) => {
    if (openedMeters.includes(record.targetMeters)) return;
    setOpenedMeters((current) => [...current, record.targetMeters]);
    markRecordOpened(run.id, record.targetMeters).catch(() => {});
  };

  const handleDelete = async () => {
    setDeleting(true);
    await deleteCompletedRun(run.id);
    router.push("/historico");
  };

  return (
    <>
      <ScreenHeader title={formatRunDate(started)} subtitle={`${timeFormatter.format(started)} · gravado neste aparelho`} />

      <Screen>
        <div className="pr-enter" style={delay(20)}>
          <RouteReplay points={run.points} unit={unit} />
        </div>

        <Card className="pr-enter" style={delay(50)}>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted">Distância</span>
              <p className="mt-0.5 font-mono text-2xl tabular-nums">
                {formatDistance(run.distanceMeters, unit)}
                <span className="ml-1 text-sm text-muted">{unitLabel(unit)}</span>
              </p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted">Tempo</span>
              <p className="mt-0.5 font-mono text-2xl tabular-nums">{formatElapsed(seconds)}</p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted">{paceLabel(unit)}</span>
              <p className="mt-0.5 font-mono text-2xl tabular-nums">
                {formatAveragePace(run.distanceMeters, seconds, unit)}
              </p>
            </div>
          </div>
          {(run.shoeName || elevationGain !== null || calories !== null) && (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted">
              {elevationGain !== null && (
                <p>
                  <span className="uppercase tracking-wide">Ganho de elevação</span>{" "}
                  <span className="text-foreground">{elevationGain}m</span>
                </p>
              )}
              {calories !== null && (
                <p>
                  <span className="uppercase tracking-wide">Calorias</span>{" "}
                  <span className="text-foreground">{calories} kcal</span>
                </p>
              )}
              {run.shoeName && (
                <p>
                  <span className="uppercase tracking-wide">Tênis</span>{" "}
                  <span className="text-foreground">{run.shoeName}</span>
                </p>
              )}
            </div>
          )}
        </Card>

        {newRecords.length > 0 && (
          <Card className="pr-enter" style={delay(90)}>
            <CardTitle aside={<NoticeBadge>{newRecords.length}</NoticeBadge>}>Conquistas dessa corrida</CardTitle>
            <div className="flex flex-col gap-2.5">
              {newRecords.map((record) => (
                <PrBadge
                  key={record.targetMeters}
                  record={record}
                  achievement={computeAchievement(run.id, record)}
                  opened={openedMeters.includes(record.targetMeters)}
                  onOpen={() =>
                    setRevealing({ record, wasOpened: openedMeters.includes(record.targetMeters) })
                  }
                />
              ))}
            </div>
          </Card>
        )}

        <SplitsTable splits={splits} unit={unit} />

        <Card className="pr-enter" style={delay(180)}>
          {confirmingDelete ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs leading-snug text-pretty">Excluir essa corrida? Não dá pra desfazer.</p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="rounded-full border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="rounded-full bg-bad px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {deleting ? "Excluindo…" : "Excluir"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium text-muted hover:border-bad hover:text-bad"
            >
              <TrashIcon />
              Excluir corrida
            </button>
          )}
        </Card>

        <Link
          href="/historico"
          className="pr-enter text-center text-xs text-muted underline underline-offset-2"
          style={delay(210)}
        >
          Voltar pro histórico
        </Link>
      </Screen>

      {revealing && (
        <AchievementReveal
          record={revealing.record}
          achievement={computeAchievement(run.id, revealing.record)}
          alreadyOpened={revealing.wasOpened}
          onOpened={() => handleRecordUnboxed(revealing.record)}
          onClose={() => setRevealing(null)}
        />
      )}
    </>
  );
}
