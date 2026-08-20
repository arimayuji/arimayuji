"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listRunsSharedByStudent, type SyncedRun } from "@/lib/runsSync";
import { addRunComment, listRunComments, type RunComment } from "@/lib/runComments";
import { getActiveLiveSession, type LiveRun } from "@/lib/liveRuns";
import { getProfile, type Profile } from "@/lib/auth";
import { formatElapsed, formatPace } from "@/lib/tracking/geoFilter";
import { usePreferences } from "@/lib/usePreferences";
import { formatAveragePace, formatDistance, paceLabel, unitLabel } from "@/lib/units";
import { LiveMap } from "../../live-map";
import { useHeaderClose } from "../../app-shell";
import { Card, CardTitle, delay, Screen, ScreenHeader } from "../../ui";

/** A ping older than this reads as "not really live anymore" rather than a frozen dot pretending to be current — most likely the app closed without a clean end. */
const LIVE_STALE_MS = 45_000;
const LIVE_POLL_MS = 5_000;

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
        {liveRun && !liveStale && (
          <Card className="pr-enter overflow-hidden !p-0" style={delay(0)}>
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
          <Card className="pr-enter border-warn/30 bg-warn/5" style={delay(0)}>
            <p className="text-xs leading-relaxed text-muted text-pretty">
              Última posição recebida há um tempo — provavelmente a corrida já terminou sem avisar (app
              fechado, sinal perdido). Isso some sozinho na próxima sincronização.
            </p>
          </Card>
        )}

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
          style={delay(60)}
        >
          Voltar pro treinador
        </Link>
      </Screen>
    </>
  );
}
