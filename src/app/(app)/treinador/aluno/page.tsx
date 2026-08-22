"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listRunsSharedByStudent, type SyncedRun } from "@/lib/runsSync";
import { addRunComment, listRunComments, type RunComment } from "@/lib/runComments";
import { getActiveLiveSession, type LiveRun } from "@/lib/liveRuns";
import { getProfile, type Profile } from "@/lib/auth";
import {
  deletePlanOverride,
  listPlanOverridesForStudent,
  setPlanOverride,
  type ParsedPlanOverride,
} from "@/lib/coachPlanOverrides";
import { ZONE_LABEL, ZONE_NUMBER, ZONE_ORDER, type PaceZoneName, type PlannedSession, type SessionKind } from "@/lib/plan";
import { mondayOf } from "@/lib/tracking/stats";
import { formatElapsed, formatPace } from "@/lib/tracking/geoFilter";
import { usePreferences } from "@/lib/usePreferences";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { LiveMap } from "../../live-map";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, NoticeBadge, Screen, ScreenHeader, SegmentedButton } from "../../ui";

/** A ping older than this reads as "not really live anymore" rather than a frozen dot pretending to be current — most likely the app closed without a clean end. */
const LIVE_STALE_MS = 45_000;
const LIVE_POLL_MS = 5_000;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

const DAY_LABELS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const KIND_LABEL: Record<SessionKind, string> = {
  rest: "Descanso",
  easy: "Leve",
  quality: "Forte",
  long: "Longo",
};

const SESSION_KINDS: SessionKind[] = ["rest", "easy", "quality", "long"];

/** A fresh, all-rest week — the starting draft whenever the selected week has no override yet. A new array every call, since callers put this straight into state and two weeks must never share one mutable array. */
function blankWeek(): PlannedSession[] {
  return Array.from({ length: 7 }, () => ({ kind: "rest" as const, km: 0 }));
}

/** Local calendar date, not `toISOString()` — this has to match `PlannedWeek.startDate`'s ISO date as the athlete's own device will see it, and `currentMondayIsoDate` (runnerProfile.ts) already anchors plans the same local way. */
function isoDateFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  useHeaderClose("/treinador");
  const studentId = useSearchParams().get("id");
  const [{ distanceUnit: unit }] = usePreferences();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [runs, setRuns] = useState<SyncedRun[] | null>(null);
  const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [comments, setComments] = useState<Map<string, RunComment[]>>(new Map());
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [postingComment, setPostingComment] = useState<string | null>(null);

  const [weekStartMs, setWeekStartMs] = useState(() => mondayOf(Date.now()));
  const [overrides, setOverrides] = useState<Map<string, ParsedPlanOverride>>(new Map());
  const weekStartIso = useMemo(() => isoDateFromMs(weekStartMs), [weekStartMs]);

  useEffect(() => {
    if (!studentId) return;
    listPlanOverridesForStudent(studentId).then(setOverrides);
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    getProfile(studentId).then((p) => {
      if (!cancelled) setProfile(p);
    });
    listRunsSharedByStudent(studentId).then((rows) => {
      if (cancelled) return;
      setRuns(rows);
      listRunComments(rows.map((r) => r.$id)).then((byRun) => {
        if (!cancelled) setComments(byRun);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  /**
   * Polled, not a realtime subscription — a coach glancing at a pace number
   * doesn't need sub-second latency, and a plain GET on an interval is far
   * simpler to reason about (and to have verified) than a WebSocket channel.
   * `now` just drives the "atualizado há Xs" readout below; it isn't used
   * for anything that needs to be exact.
   */
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    const poll = () => {
      getActiveLiveSession(studentId).then((row) => {
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
  }, [studentId]);

  const liveStale = liveRun !== null && now !== null && now - liveRun.updatedAtMs > LIVE_STALE_MS;

  const handlePostComment = async (run: SyncedRun) => {
    if (!studentId) return;
    const text = (commentDrafts[run.$id] ?? "").trim();
    if (!text) return;
    setPostingComment(run.$id);
    const created = await addRunComment(run.$id, text);
    setPostingComment(null);
    if (!created) return;
    setComments((current) => {
      const next = new Map(current);
      next.set(run.$id, [...(next.get(run.$id) ?? []), created]);
      return next;
    });
    setCommentDrafts((current) => ({ ...current, [run.$id]: "" }));
  };

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

        {liveRun && !liveStale && (
          <Card className="pr-enter overflow-hidden !p-0" style={delay(20)}>
            <div className="h-56 w-full">
              <LiveMap lat={liveRun.lat} lon={liveRun.lon} className="h-full w-full" />
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
          </Card>
        )}

        {liveRun && liveStale && (
          <Card className="pr-enter border-warn/30 bg-warn/5" style={delay(20)}>
            <p className="text-xs leading-relaxed text-muted text-pretty">
              Última posição recebida há um tempo — provavelmente a corrida já terminou sem avisar (app
              fechado, sinal perdido). Isso some sozinho na próxima sincronização.
            </p>
          </Card>
        )}

        <Card className="pr-enter" style={delay(40)}>
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

                  {(comments.get(run.$id) ?? []).length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2">
                      {(comments.get(run.$id) ?? []).map((comment) => (
                        <li key={comment.$id} className="rounded-lg bg-background px-3 py-2 text-xs leading-relaxed text-pretty">
                          {comment.text}
                        </li>
                      ))}
                    </ul>
                  )}

                  <form
                    className="mt-3 flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handlePostComment(run);
                    }}
                  >
                    <input
                      type="text"
                      value={commentDrafts[run.$id] ?? ""}
                      onChange={(event) =>
                        setCommentDrafts((current) => ({ ...current, [run.$id]: event.target.value }))
                      }
                      placeholder="Deixar um comentário..."
                      maxLength={500}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
                    />
                    <button
                      type="submit"
                      disabled={postingComment === run.$id || !(commentDrafts[run.$id] ?? "").trim()}
                      className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-40"
                    >
                      {postingComment === run.$id ? "Enviando…" : "Enviar"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Link
          href="/treinador"
          className="pr-enter text-center text-xs text-muted underline underline-offset-2"
          style={delay(80)}
        >
          Voltar pro treinador
        </Link>
      </Screen>
    </>
  );
}

/**
 * The actual "planilha": a coach's manual override of one week of a
 * student's plan (no AI involved yet — that's a later phase). Keyed by
 * `weekStartIso` at the call site so switching weeks remounts this with a
 * fresh `useState` initializer instead of an effect calling `setState` to
 * resync the draft — the same data, just not fighting React's own render
 * cycle to get there. `existingOverride` only matters as that initial
 * value; after that the draft is this component's own until Save/Remove.
 */
function WeekPlanEditor({
  studentId,
  weekStartMs,
  weekStartIso,
  existingOverride,
  onPrevWeek,
  onNextWeek,
  onSaved,
  onRemoved,
}: {
  studentId: string;
  weekStartMs: number;
  weekStartIso: string;
  existingOverride: ParsedPlanOverride | undefined;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onSaved: (override: ParsedPlanOverride) => void;
  onRemoved: () => void;
}) {
  const [draftSessions, setDraftSessions] = useState<PlannedSession[]>(() => existingOverride?.sessions ?? blankWeek());
  const [draftNote, setDraftNote] = useState(() => existingOverride?.note ?? "");
  const [savingOverride, setSavingOverride] = useState(false);
  const [removingOverride, setRemovingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const draftTotalKm = useMemo(
    () => Math.round(draftSessions.reduce((sum, session) => sum + session.km, 0) * 10) / 10,
    [draftSessions],
  );

  const updateSessionKind = (day: number, kind: SessionKind) => {
    setDraftSessions((current) =>
      current.map((session, i) => {
        if (i !== day) return session;
        if (kind === "quality") return { kind, km: session.km, paceZone: session.paceZone ?? "threshold" };
        return { kind, km: session.km };
      }),
    );
  };

  const updateSessionKm = (day: number, km: number) => {
    setDraftSessions((current) => current.map((session, i) => (i === day ? { ...session, km } : session)));
  };

  const updateSessionPaceZone = (day: number, paceZone: PaceZoneName) => {
    setDraftSessions((current) => current.map((session, i) => (i === day ? { ...session, paceZone } : session)));
  };

  const handleSaveOverride = async () => {
    setSavingOverride(true);
    setOverrideError(null);
    const result = await setPlanOverride(studentId, weekStartIso, draftTotalKm, draftSessions, draftNote.trim() || null);
    setSavingOverride(false);
    if (!result.ok) {
      setOverrideError(
        result.reason === "not-coach"
          ? "Vínculo de treinador com esse aluno não está mais ativo."
          : "Não deu pra salvar agora — tenta de novo.",
      );
      return;
    }
    onSaved({ weekStartDate: weekStartIso, totalKm: draftTotalKm, sessions: draftSessions, note: draftNote.trim() || null });
  };

  const handleRemoveOverride = async () => {
    setRemovingOverride(true);
    const ok = await deletePlanOverride(studentId, weekStartIso);
    setRemovingOverride(false);
    if (!ok) {
      setOverrideError("Não deu pra remover agora — tenta de novo.");
      return;
    }
    setDraftSessions(blankWeek());
    setDraftNote("");
    onRemoved();
  };

  return (
    <Card className="pr-enter" style={delay(0)}>
      <CardTitle aside={<NoticeBadge>{draftTotalKm} km na semana</NoticeBadge>}>Planilha da semana</CardTitle>

      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrevWeek}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent"
        >
          ← Anterior
        </button>
        <span className="text-xs font-semibold tabular-nums">
          {shortDateFormatter.format(new Date(weekStartMs))} –{" "}
          {shortDateFormatter.format(new Date(weekStartMs + 6 * MS_PER_DAY))}
        </span>
        <button
          type="button"
          onClick={onNextWeek}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent"
        >
          Próxima →
        </button>
      </div>

      {!existingOverride && (
        <p className="mb-3 text-xs leading-relaxed text-muted text-pretty">
          Sem override nessa semana ainda — o aluno continua vendo o plano calculado
          automaticamente. Preencher e salvar abaixo substitui isso só pra essa semana.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {draftSessions.map((session, day) => (
          <li key={day} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{DAY_LABELS[day]}</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={session.km || ""}
                  onChange={(event) => updateSessionKm(day, Math.max(0, Number(event.target.value) || 0))}
                  placeholder="0"
                  className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-right font-mono text-sm tabular-nums outline-none focus:border-accent"
                />
                <span className="text-[10px] uppercase tracking-wide text-muted">km</span>
              </div>
            </div>
            <div className="mt-2 flex gap-1">
              {SESSION_KINDS.map((kind) => (
                <SegmentedButton key={kind} selected={session.kind === kind} onClick={() => updateSessionKind(day, kind)}>
                  {KIND_LABEL[kind]}
                </SegmentedButton>
              ))}
            </div>
            {session.kind === "quality" && (
              <div className="mt-2 flex gap-1">
                {ZONE_ORDER.map((zone) => (
                  <SegmentedButton
                    key={zone}
                    selected={session.paceZone === zone}
                    onClick={() => updateSessionPaceZone(day, zone)}
                  >
                    <span title={ZONE_LABEL[zone]}>{`Z${ZONE_NUMBER[zone]}`}</span>
                  </SegmentedButton>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <textarea
        value={draftNote}
        onChange={(event) => setDraftNote(event.target.value.slice(0, 300))}
        placeholder="Recado pro aluno sobre essa semana (opcional)"
        rows={2}
        className="mt-4 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
      />

      {overrideError && <p className="mt-3 text-xs leading-relaxed text-bad">{overrideError}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSaveOverride}
          disabled={savingOverride}
          className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
        >
          {savingOverride ? "Salvando…" : "Salvar semana"}
        </button>
        {existingOverride && (
          <button
            type="button"
            onClick={handleRemoveOverride}
            disabled={removingOverride}
            className="rounded-lg border border-bad/30 px-3 py-2.5 text-sm font-medium text-bad disabled:opacity-40"
          >
            {removingOverride ? "Removendo…" : "Remover"}
          </button>
        )}
      </div>
    </Card>
  );
}
