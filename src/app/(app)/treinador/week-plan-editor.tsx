"use client";

import { useMemo, useState } from "react";
import {
  deletePlanOverride,
  setPlanOverride,
  type ParsedPlanOverride,
} from "@/lib/coachPlanOverrides";
import { suggestPlanOverride, type SuggestPlanOverrideReason } from "@/lib/coachPlanSuggestion";
import { ZONE_LABEL, ZONE_NUMBER, ZONE_ORDER, type PaceZoneName, type PlannedSession, type SessionKind } from "@/lib/plan";
import { Card, CardTitle, delay, NoticeBadge, SegmentedButton } from "../ui";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Local calendar date, not `toISOString()` — this has to match `PlannedWeek.startDate`'s ISO date as the athlete's own device will see it, and `currentMondayIsoDate` (runnerProfile.ts) already anchors plans the same local way. */
export function isoDateFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

const SUGGEST_ERROR_LABEL: Record<SuggestPlanOverrideReason, string> = {
  unavailable: "Recurso indisponível agora.",
  "not-coach": "Vínculo de treinador com esse aluno não está mais ativo.",
  "no-history": "Sem corridas compartilhadas recentes desse aluno — a IA precisa desse histórico pra sugerir com segurança. Preenche a planilha manualmente por enquanto.",
  "ai-not-configured": "IA não configurada nesse ambiente ainda.",
  "ai-unavailable": "IA indisponível agora — tenta de novo em instantes.",
  "ai-invalid-response": "A IA devolveu algo que não deu pra usar — tenta de novo.",
  failed: "Não deu pra gerar uma sugestão agora — tenta de novo.",
};

/**
 * The actual "planilha": a coach's manual override of one week of a
 * student's plan, with an optional AI-generated starting point. Keyed by
 * `weekStartIso` at the call site so switching weeks remounts this with a
 * fresh `useState` initializer instead of an effect calling `setState` to
 * resync the draft — the same data, just not fighting React's own render
 * cycle to get there. `existingOverride` only matters as that initial
 * value; after that the draft is this component's own until Save/Remove.
 *
 * Shared between `/treinador/aluno` (one student, own page) and
 * `/treinador/sala` (the multi-student dashboard, one panel per selection)
 * — same editor either way, just mounted in a different place.
 */
export function WeekPlanEditor({
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

  const [aiInstruction, setAiInstruction] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionNotice, setSuggestionNotice] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

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

  /**
   * Fills the draft from an AI suggestion — never saves it. The Function
   * already clamps the total to the same progression safety cap the engine
   * uses (see suggest-plan-override/src/main.js), but the coach still has
   * to review the shape and click "Salvar semana" themselves, same as if
   * they'd typed it by hand — this button is a starting point, not an
   * autopilot.
   */
  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestError(null);
    setSuggestionNotice(null);
    const result = await suggestPlanOverride(studentId, weekStartIso, aiInstruction.trim() || undefined);
    setSuggesting(false);
    if (!result.ok) {
      setSuggestError(SUGGEST_ERROR_LABEL[result.reason]);
      return;
    }
    setDraftSessions(result.sessions);
    setDraftNote(result.note);
    // `reasoning` always leads — it's the model's own account of what drove
    // this week's numbers, including whether/how any context typed above
    // was factored in (the prompt requires it to say either way, never
    // silently ignore it). The cap sentence only appends when it actually
    // fired, naming both numbers (what the AI suggested vs. the safety
    // ceiling) rather than just the already-adjusted result, which used to
    // read as if the AI had suggested the safe number all along.
    const capNote = result.capped
      ? ` A IA sugeriu ${result.rawSuggestedTotalKm} km ao todo, mas o limite seguro de progressão pra essa semana é ${result.capKm} km — os números acima já foram ajustados pra caber nisso.`
      : "";
    setSuggestionNotice(`${result.reasoning}${capNote}`);
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

      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={aiInstruction}
          onChange={(event) => setAiInstruction(event.target.value.slice(0, 300))}
          placeholder="Contexto pra IA (opcional): ex. joelho doendo, quer soltar essa semana"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={handleSuggest}
          disabled={suggesting}
          className="shrink-0 rounded-lg border border-accent px-3 py-2 text-xs font-semibold text-accent disabled:opacity-40"
        >
          {suggesting ? "Pensando…" : "Sugerir com IA"}
        </button>
      </div>

      {suggestionNotice && (
        <p className="mb-3 text-xs leading-relaxed text-accent text-pretty">{suggestionNotice}</p>
      )}
      {suggestError && <p className="mb-3 text-xs leading-relaxed text-bad text-pretty">{suggestError}</p>}

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
            className="rounded-lg bg-bad px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {removingOverride ? "Removendo…" : "Remover"}
          </button>
        )}
      </div>
    </Card>
  );
}
