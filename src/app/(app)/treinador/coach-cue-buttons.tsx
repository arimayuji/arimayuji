"use client";

import { useState } from "react";
import { sendCoachCue, type CoachCueId } from "@/lib/liveRuns";

const CUES: { id: CoachCueId; label: string }[] = [
  { id: "reduce-pace", label: "Pedir pra reduzir o ritmo" },
  { id: "increase-pace", label: "Pedir pra acelerar" },
  { id: "stop", label: "Pedir pra parar" },
];

/**
 * "Coach ao vivo" — the three pre-recorded voice cues a coach can send to a
 * student mid-run (never free text, see `CoachCueId`/`announceCoachCue`).
 * Shared between `/treinador/sala` and `/treinador/aluno`, which each render
 * their own live card (not a shared component) but should offer the same
 * cue controls either way.
 */
export function CoachCueButtons({ studentId }: { studentId: string }) {
  const [sendingId, setSendingId] = useState<CoachCueId | null>(null);
  const [sentId, setSentId] = useState<CoachCueId | null>(null);

  async function handleSend(cueId: CoachCueId) {
    if (sendingId) return;
    setSendingId(cueId);
    setSentId(null);
    const ok = await sendCoachCue(studentId, cueId);
    setSendingId(null);
    if (ok) {
      setSentId(cueId);
      window.setTimeout(() => setSentId((current) => (current === cueId ? null : current)), 3000);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mandar aviso</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {CUES.map((cue) => (
          <button
            key={cue.id}
            type="button"
            disabled={sendingId !== null}
            onClick={() => handleSend(cue.id)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent disabled:opacity-60"
          >
            {sendingId === cue.id ? "Enviando…" : sentId === cue.id ? "Enviado" : cue.label}
          </button>
        ))}
      </div>
    </div>
  );
}
