"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { estimateCalories } from "@/lib/calories";
import { listCoachConnections, type CoachConnection } from "@/lib/coachRelationships";
import { computeElevationGain } from "@/lib/elevation";
import { listRunComments, type RunComment } from "@/lib/runComments";
import { getSyncedRun, shareRunWithCoaches } from "@/lib/runsSync";
import { formatElapsed } from "@/lib/tracking/geoFilter";
import { computeAchievement } from "@/lib/tracking/achievements";
import { computeRunRecords, type RunRecord } from "@/lib/tracking/personalRecords";
import { computeSplits, type Split } from "@/lib/tracking/splits";
import {
  computeVdot,
  paceZonesFromVdot,
  timeInZones,
  ZONE_NUMBER,
  ZONE_ORDER,
  type PaceZoneName,
} from "@/lib/plan";
import {
  deleteCompletedRun,
  getCompletedRun,
  listCompletedRuns,
  markRecordOpened,
  runMovingSeconds,
  updateRunElevationGain,
  type CompletedRun,
  type StoredPoint,
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

function ShareIcon() {
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
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.7 7.6-4.4M8.2 13.3l7.6 4.4" />
    </svg>
  );
}

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

const ZONE_LABEL: Record<PaceZoneName, string> = {
  easy: "Fácil",
  marathon: "Maratona",
  threshold: "Limiar",
  interval: "Intervalado",
  repetition: "Repetição",
};

/** Green-to-red intensity ramp using the app's existing semantic colors — no new palette, just Z1 calm through Z5 hardest. */
const ZONE_BAR_COLOR: Record<PaceZoneName, string> = {
  easy: "bg-good/60",
  marathon: "bg-good",
  threshold: "bg-accent",
  interval: "bg-warn",
  repetition: "bg-bad",
};

/**
 * Time spent in each pace zone, one km split at a time — always computed on
 * real kilometers regardless of the athlete's display unit preference,
 * since the zone paces themselves (`PaceZones`) are defined in seconds per
 * km. Null when there's no recent-race time on file to derive zones from
 * (`/perfil`), or the run's too short for even one full split.
 */
function ZonesCard({ points }: { points: Pick<StoredPoint, "lat" | "lon" | "timestamp">[] }) {
  const [runnerProfile] = useRunnerProfile();
  if (!runnerProfile.recentRaceDistanceMeters || !runnerProfile.recentRaceTimeSeconds) return null;

  const kmSplits = computeSplits(points, 1000);
  if (kmSplits.length === 0) return null;

  const zones = paceZonesFromVdot(
    computeVdot(runnerProfile.recentRaceDistanceMeters, runnerProfile.recentRaceTimeSeconds),
  );
  const seconds = timeInZones(kmSplits, zones);
  const totalSeconds = ZONE_ORDER.reduce((sum, zone) => sum + seconds[zone], 0);
  if (totalSeconds <= 0) return null;

  return (
    <Card className="pr-enter" style={delay(150)}>
      <CardTitle>Tempo por zona</CardTitle>
      <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-background">
        {ZONE_ORDER.map((zone) =>
          seconds[zone] > 0 ? (
            <div
              key={zone}
              className={ZONE_BAR_COLOR[zone]}
              style={{ width: `${(seconds[zone] / totalSeconds) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {ZONE_ORDER.filter((zone) => seconds[zone] > 0).map((zone) => (
          <li key={zone} className="flex items-center gap-3 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ZONE_BAR_COLOR[zone]}`} />
            <span className="flex-1 text-foreground">
              Z{ZONE_NUMBER[zone]} · {ZONE_LABEL[zone]}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
              {formatElapsed(seconds[zone])}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Read-only comments a coach left on this run — only shows up once this run
 * has actually been shared (a `SyncedRun` row exists for it); a run kept
 * entirely local was never visible to any coach in the first place, so
 * there's nothing to look up.
 */
function CommentsCard({ startedAtMs }: { startedAtMs: number }) {
  const [comments, setComments] = useState<RunComment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSyncedRun(startedAtMs).then((synced) => {
      if (cancelled) return;
      if (!synced) {
        setComments([]);
        return;
      }
      listRunComments([synced.$id]).then((byRun) => {
        if (!cancelled) setComments(byRun.get(synced.$id) ?? []);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [startedAtMs]);

  if (!comments || comments.length === 0) return null;

  return (
    <Card className="pr-enter" style={delay(160)}>
      <CardTitle>Comentários do treinador</CardTitle>
      <ul className="flex flex-col gap-2">
        {comments.map((comment) => (
          <li key={comment.$id} className="rounded-lg bg-background px-3 py-2 text-sm leading-relaxed text-pretty">
            {comment.text}
          </li>
        ))}
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
  const [coaches, setCoaches] = useState<CoachConnection[] | null>(null);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [sharingId, setSharingId] = useState<string | null>(null);

  useEffect(() => {
    listCoachConnections("accepted").then((rows) => setCoaches(rows.filter((c) => c.myRole === "student")));
  }, []);

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

  const handleShareWithCoach = async (coachId: string) => {
    setSharingId(coachId);
    const result = await shareRunWithCoaches(run, [coachId]);
    setSharingId(null);
    if (result.ok) setSharedWith((current) => [...current, coachId]);
  };

  return (
    <>
      <ScreenHeader
        title={formatRunDate(started)}
        subtitle={`${timeFormatter.format(started)} · gravado neste aparelho`}
        badge={
          <Link
            href={`/compartilhar?run=${run.id}`}
            aria-label="Compartilhar essa corrida"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted hover:text-accent"
          >
            <ShareIcon />
          </Link>
        }
      />

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
          {(run.shoeName || elevationGain !== null || calories !== null || run.rpe !== undefined) && (
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
              {run.rpe !== undefined && (
                <p>
                  <span className="uppercase tracking-wide">Esforço percebido</span>{" "}
                  <span className="text-foreground">{run.rpe}/10</span>
                </p>
              )}
              {run.rpe !== undefined && (
                <p>
                  {/* Foster's session-RPE: load = RPE × minutes moved — the same hardware-free training-load formula Strava falls back to without a heart-rate sensor. */}
                  <span className="uppercase tracking-wide">Carga do treino</span>{" "}
                  <span className="text-foreground">{Math.round(run.rpe * (seconds / 60))}</span>
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

        <ZonesCard points={run.points} />

        <CommentsCard startedAtMs={run.startedAt} />

        {coaches !== null && coaches.length > 0 && (
          <Card className="pr-enter" style={delay(170)}>
            <CardTitle>Enviar pro treinador</CardTitle>
            <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
              Só essa corrida, só pra quem você escolher aqui — nada é enviado automaticamente.
            </p>
            <ul className="flex flex-col gap-2">
              {coaches.map((connection) => {
                const sent = sharedWith.includes(connection.otherId);
                return (
                  <li key={connection.relationship.$id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">
                      {connection.profile?.displayName ?? "Corredor(a)"}
                    </span>
                    <button
                      type="button"
                      disabled={sent || sharingId === connection.otherId}
                      onClick={() => handleShareWithCoach(connection.otherId)}
                      className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold disabled:opacity-60 ${
                        sent ? "bg-good/15 text-good" : "bg-accent text-accent-foreground"
                      }`}
                    >
                      {sent ? "Enviado" : sharingId === connection.otherId ? "Enviando…" : "Enviar"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

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
