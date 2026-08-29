"use client";

import { useEffect, useState } from "react";
import { closeGroupRun, leaveGroupRun, setParticipantReady, startGroupRun } from "@/lib/groupRuns";
import { useGroupRunLobby } from "@/lib/useGroupRunLobby";
import { ModalPortal } from "./modal-portal";
import { ParticipantRow } from "./participant-row";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function ReadyDot({ ready }: { ready: boolean }) {
  if (ready) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-good/15 text-good">
        <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      </span>
    );
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border-2 border-border" aria-hidden="true" />;
}

/**
 * The shared "waiting room" after a QR pairing lands (see PROJECT-CONTEXT.md
 * for the bug report this fixes: pairing used to just reload `/run` in
 * silence, with no shared confirmation for either side). Polls the session
 * + roster every `LOBBY_POLL_MS` (`useGroupRunLobby`) — same
 * poll-not-realtime convention as every other "live" screen in this
 * codebase — and calls `onStarted()` the instant any device's poll sees
 * `groupRun.startedAt` become non-null, which is the actual synchronization
 * mechanism: everyone reacts to the same row within one poll window of
 * each other, not a literal simultaneous instant.
 *
 * Rendered as a non-trivially-dismissable full-screen overlay (same
 * `ModalPortal` shell as `AccountPrompt`) rather than inline in the idle
 * form — this is a "wait here" moment for two people, not a form section.
 */
export function GroupRunLobby({
  sessionCode,
  myUserId,
  isHost,
  onStarted,
  onCancelled,
}: {
  sessionCode: string;
  myUserId: string;
  isHost: boolean;
  onStarted: () => void;
  onCancelled: () => void;
}) {
  const { groupRun, participants } = useGroupRunLobby(sessionCode, true);
  const [togglingReady, setTogglingReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (groupRun?.startedAt) onStarted();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the transition into "started" should fire this, not every poll tick
  }, [groupRun?.startedAt]);

  const myConnection = participants.find((p) => p.participant.userId === myUserId) ?? null;
  const myReady = myConnection?.participant.ready ?? false;
  const everyoneReady = participants.length >= 2 && participants.every((p) => p.participant.ready);

  const handleToggleReady = async () => {
    if (togglingReady) return;
    setTogglingReady(true);
    await setParticipantReady(sessionCode, !myReady);
    setTogglingReady(false);
  };

  const handleStartNow = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    const result = await startGroupRun(sessionCode);
    setStarting(false);
    if (!result.ok) setError("Não deu pra começar agora — tenta de novo.");
    // No local onStarted() call needed on success — this device's own next
    // poll (or the one already in flight) sees `startedAt` and reacts the
    // same way everyone else's does, one single code path either way.
  };

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    const ok = isHost ? await closeGroupRun(sessionCode) : await leaveGroupRun(sessionCode);
    setEnding(false);
    if (ok) onCancelled();
    else setError("Não deu pra sair agora — tenta de novo.");
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
        <div className="w-full max-w-sm rounded-t-3xl bg-background text-foreground sm:rounded-3xl">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-base font-semibold text-balance">Sala de espera</h2>
            <button
              type="button"
              onClick={() => void handleEnd()}
              disabled={ending}
              aria-label={isHost ? "Encerrar" : "Sair"}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" {...STROKE}>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="px-5 pb-6">
            <p className="mt-1 text-sm leading-relaxed text-muted text-pretty">
              {everyoneReady
                ? isHost
                  ? "Todo mundo pronto — pode começar."
                  : "Todo mundo pronto — esperando o host começar."
                : "Esperando todo mundo marcar pronto."}
            </p>

            <ul className="mt-4 flex flex-col gap-3.5">
              {participants.map((connection) => (
                <li key={connection.participant.$id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <ParticipantRow connection={connection} />
                  </div>
                  <ReadyDot ready={connection.participant.ready} />
                </li>
              ))}
            </ul>

            {error && <p className="mt-3 text-xs text-bad">{error}</p>}

            <button
              type="button"
              onClick={() => void handleToggleReady()}
              disabled={togglingReady}
              className={`mt-5 w-full rounded-xl py-3.5 text-sm font-semibold disabled:opacity-60 ${
                myReady ? "border border-border text-muted" : "bg-accent text-accent-foreground"
              }`}
            >
              {togglingReady ? "Atualizando…" : myReady ? "Cancelar pronto" : "Estou pronto"}
            </button>

            {isHost && (
              <button
                type="button"
                onClick={() => void handleStartNow()}
                disabled={!everyoneReady || starting}
                className="mt-3 w-full rounded-xl border border-accent py-3.5 text-sm font-semibold text-accent disabled:opacity-40"
              >
                {starting ? "Começando…" : "Começar agora"}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
