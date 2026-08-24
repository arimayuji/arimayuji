"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listCoachConnections, type CoachConnection } from "@/lib/coachRelationships";
import { listPlanOverridesForStudent, type ParsedPlanOverride } from "@/lib/coachPlanOverrides";
import { listLiveRunsForStudents, type LiveRun } from "@/lib/liveRuns";
import { listRunsSharedByStudents, type SyncedRun } from "@/lib/runsSync";
import { useAuth } from "@/lib/useAuth";
import { mondayOf } from "@/lib/tracking/stats";
import { formatElapsed, formatPace } from "@/lib/tracking/geoFilter";
import { usePreferences } from "@/lib/usePreferences";
import { formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { LiveMap } from "../../live-map";
import { useHeaderClose } from "../../app-shell";
import { Avatar } from "../../avatar";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader } from "../../ui";
import { isoDateFromMs, MS_PER_DAY, WeekPlanEditor } from "../week-plan-editor";

/** Same threshold as `/treinador/aluno` — a ping older than this reads as "the run probably ended without telling us" rather than a frozen live dot. */
const LIVE_STALE_MS = 45_000;
const LIVE_POLL_MS = 5_000;
const NO_CONTACT_DAYS = 7;

const relativeDateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** How long ago `startedAt` was, in whole days — used only to bucket "sem contato há 7+ dias", not shown as an exact count anywhere. */
function daysSince(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / MS_PER_DAY);
}

/**
 * The Fase C dashboard: a coach's overview across every student at once,
 * instead of `/treinador/aluno`'s one-student-per-navigation. Deliberately
 * NOT a single map showing every student's live position together — the
 * product decision behind this screen (see PROJECT-CONTEXT.md, "Fase C")
 * is "visão geral simples + entrar num aluno por vez", so the live map here
 * only ever renders for whichever one student is currently selected.
 *
 * Read-only/planning surface: this page never touches GPS or tracking —
 * every run and live position it shows was already recorded and synced by
 * the student's own native app.
 */
export default function SalaDeTreinoPage() {
  useHeaderClose("/treinador");
  const { status } = useAuth();
  const [{ distanceUnit: unit }] = usePreferences();
  const [connections, setConnections] = useState<CoachConnection[] | null>(null);
  const [liveRuns, setLiveRuns] = useState<Map<string, LiveRun>>(new Map());
  const [runsByStudent, setRunsByStudent] = useState<Map<string, SyncedRun[]>>(new Map());
  const [now, setNow] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "signed-in") return;
    let cancelled = false;
    listCoachConnections("accepted").then((rows) => {
      if (!cancelled) setConnections(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const myStudents = useMemo(() => (connections ?? []).filter((c) => c.myRole === "coach"), [connections]);
  const studentIds = useMemo(() => myStudents.map((c) => c.otherId), [myStudents]);

  useEffect(() => {
    if (studentIds.length === 0) return;
    listRunsSharedByStudents(studentIds).then(setRunsByStudent);
  }, [studentIds]);

  /** Same polling rationale as `/treinador/aluno`: a coach glancing at pace numbers doesn't need sub-second freshness, so a plain GET on an interval is simpler than a realtime subscription. */
  useEffect(() => {
    if (studentIds.length === 0) return;
    let cancelled = false;
    const poll = () => {
      listLiveRunsForStudents(studentIds).then((rows) => {
        if (cancelled) return;
        setLiveRuns(new Map(rows.map((row) => [row.userId, row])));
        setNow(Date.now());
      });
    };
    poll();
    const timer = setInterval(poll, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [studentIds]);

  const isLive = (studentId: string): LiveRun | null => {
    const row = liveRuns.get(studentId);
    if (!row || now === null) return null;
    return now - row.updatedAtMs > LIVE_STALE_MS ? null : row;
  };

  const liveCount = studentIds.filter((id) => isLive(id) !== null).length;
  const noContactCount = studentIds.filter((id) => {
    const lastRun = runsByStudent.get(id)?.[0];
    if (!lastRun || now === null) return true;
    return daysSince(lastRun.startedAt, now) >= NO_CONTACT_DAYS;
  }).length;

  const selected = myStudents.find((c) => c.otherId === selectedId) ?? null;

  return (
    <>
      <ScreenHeader
        title="Sala de Treino"
        badge={<NoticeBadge>dados reais</NoticeBadge>}
        subtitle="Visão geral de quem você treina — clique num aluno pra ver a planilha da semana e a corrida ao vivo, se houver."
      />

      <Screen>
        {status === "loading" && (
          <Card className="pr-enter" style={delay(40)}>
            <p className="text-sm text-muted">Verificando sua conta…</p>
          </Card>
        )}

        {status !== "loading" && status !== "signed-in" && (
          <Card className="pr-enter" style={delay(40)}>
            <CardTitle>Entra pra acessar a Sala de Treino</CardTitle>
            <Link href="/treinador" className="mt-2 inline-block text-sm text-accent underline underline-offset-2">
              Voltar pro treinador
            </Link>
          </Card>
        )}

        {status === "signed-in" && connections !== null && myStudents.length === 0 && (
          <Card className="pr-enter" style={delay(40)}>
            <CardTitle>Nenhum aluno ainda</CardTitle>
            <p className="text-sm leading-relaxed text-muted text-pretty">
              Convide alguém pelo @ marcando &quot;É meu aluno&quot; no Treinador — assim que aceitar, essa
              tela mostra todo mundo que você treina de uma vez só.
            </p>
            <Link href="/treinador" className="mt-3 inline-block text-sm text-accent underline underline-offset-2">
              Voltar pro treinador
            </Link>
          </Card>
        )}

        {status === "signed-in" && myStudents.length > 0 && (
          <>
            <Card className="pr-enter" style={delay(40)}>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-metal font-mono text-2xl tabular-nums">{myStudents.length}</p>
                  <span className="text-[10px] uppercase tracking-wide text-muted">Ativos</span>
                </div>
                <div>
                  <p className="text-metal font-mono text-2xl tabular-nums text-good">{liveCount}</p>
                  <span className="text-[10px] uppercase tracking-wide text-muted">Correndo agora</span>
                </div>
                <div>
                  <p className="text-metal font-mono text-2xl tabular-nums">{noContactCount}</p>
                  <span className="text-[10px] uppercase tracking-wide text-muted">Sem contato 7d+</span>
                </div>
              </div>
            </Card>

            <Card className="pr-enter !p-0" style={delay(60)}>
              <ul>
                {myStudents.map((connection) => {
                  const live = isLive(connection.otherId);
                  const lastRun = runsByStudent.get(connection.otherId)?.[0];
                  const isSelected = selectedId === connection.otherId;
                  return (
                    <li key={connection.relationship.$id} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected ? null : connection.otherId)}
                        className={`flex w-full items-center gap-3 px-5 py-3.5 text-left ${isSelected ? "bg-background" : ""}`}
                      >
                        <Avatar
                          name={connection.profile?.displayName ?? "?"}
                          avatarUrl={connection.profile?.avatarUrl}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {connection.profile?.displayName ?? "Corredor(a)"}
                          </p>
                          <p className="truncate font-mono text-xs text-muted">
                            {connection.profile ? `@${connection.profile.handle}` : "conta sem @ ainda"}
                          </p>
                        </div>
                        {live ? (
                          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-good/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-good">
                            <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden="true" />
                            Ao vivo
                          </span>
                        ) : lastRun ? (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted">
                            {relativeDateFormatter.format(new Date(lastRun.startedAt))}
                          </span>
                        ) : (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted">
                            sem corrida
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {selected && (
              <StudentPanel key={selected.otherId} connection={selected} live={isLive(selected.otherId)} unit={unit} />
            )}
          </>
        )}
      </Screen>
    </>
  );
}

/**
 * The detail panel for whichever student is selected in the list above —
 * same "Planilha da semana" editor `/treinador/aluno` uses (shared via
 * `week-plan-editor.tsx`, not duplicated), plus that student's live card
 * when they're actively running. Deliberately doesn't repeat the full
 * shared-runs history here (that stays on `/treinador/aluno`, one click
 * away) — this panel is the "glance and act" surface, not a replacement.
 */
function StudentPanel({
  connection,
  live,
  unit,
}: {
  connection: CoachConnection;
  live: LiveRun | null;
  unit: "km" | "mi";
}) {
  const studentId = connection.otherId;
  const [weekStartMs, setWeekStartMs] = useState(() => mondayOf(Date.now()));
  const [overrides, setOverrides] = useState<Map<string, ParsedPlanOverride>>(new Map());
  const weekStartIso = useMemo(() => isoDateFromMs(weekStartMs), [weekStartMs]);

  useEffect(() => {
    listPlanOverridesForStudent(studentId).then(setOverrides);
  }, [studentId]);

  return (
    <>
      <div className="pr-enter flex items-center justify-between gap-3" style={delay(80)}>
        <h2 className="text-sm font-semibold">
          {connection.profile?.displayName ?? "Corredor(a)"}
        </h2>
        <Link
          href={`/treinador/aluno?id=${studentId}`}
          className="shrink-0 text-xs text-accent underline underline-offset-2"
        >
          Ver corridas completas →
        </Link>
      </div>

      {live && (
        <Card className="pr-enter overflow-hidden !p-0" style={delay(90)}>
          <div className="h-56 w-full">
            <LiveMap lat={live.lat} lon={live.lon} className="h-full w-full" />
          </div>
          <div className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-good">
              <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden="true" />
              Ao vivo agora
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] uppercase tracking-wide text-muted">Distância</span>
                <p className="font-mono text-lg tabular-nums">
                  {formatDistance(live.distanceMeters, unit)}
                  <span className="ml-1 text-xs text-muted">{unitLabel(unit)}</span>
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-muted">Tempo</span>
                <p className="font-mono text-lg tabular-nums">{formatElapsed(live.elapsedSeconds)}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-muted">{paceLabel(unit)}</span>
                <p className="font-mono text-lg tabular-nums">{formatPace(live.currentPaceSecPerKm ?? null)}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      <WeekPlanEditor
        key={weekStartIso}
        studentId={studentId}
        weekStartMs={weekStartMs}
        weekStartIso={weekStartIso}
        existingOverride={overrides.get(weekStartIso)}
        onPrevWeek={() => setWeekStartMs((current) => current - 7 * MS_PER_DAY)}
        onNextWeek={() => setWeekStartMs((current) => current + 7 * MS_PER_DAY)}
        onSaved={(override) =>
          setOverrides((current) => {
            const next = new Map(current);
            next.set(weekStartIso, override);
            return next;
          })
        }
        onRemoved={() =>
          setOverrides((current) => {
            const next = new Map(current);
            next.delete(weekStartIso);
            return next;
          })
        }
      />
    </>
  );
}
