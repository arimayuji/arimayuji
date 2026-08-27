"use client";

import { useState } from "react";
import { CRITERIA_KEYS, submitRating, type CriteriaKey, type PlaceRating, type Visibility } from "@/lib/placeRatings";
import { ModalPortal } from "../modal-portal";
import { PillSlider } from "../pill-slider";
import { CRITERIA_LABELS } from "./criteria";

const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Pública", hint: "qualquer pessoa no app vê sua nota e seu @" },
  { value: "private", label: "Só eu", hint: "vira sua anotação particular sobre o lugar" },
];

/**
 * Always mounted behind a signed-in account — signing in itself is handled
 * by `AccountPrompt` one layer up, same gate-only-what-needs-it split used
 * everywhere else identity shows up. `submitRating` reads the account ID
 * from the live session itself rather than taking it as a parameter here,
 * so there's no `userId` prop to thread through.
 */
export function RatePlaceModal({
  placeId,
  existing,
  onClose,
  onSaved,
}: {
  placeId: string;
  existing: PlaceRating | null;
  onClose: () => void;
  onSaved: (rating: PlaceRating) => void;
}) {
  const [scores, setScores] = useState<Record<CriteriaKey, number>>(() => ({
    seguranca: existing?.seguranca ?? 3,
    percurso: existing?.percurso ?? 3,
    estrutura: existing?.estrutura ?? 3,
    iluminacao: existing?.iluminacao ?? 3,
    fluxo: existing?.fluxo ?? 3,
  }));
  const [note, setNote] = useState(existing?.note ?? "");
  const [visibility, setVisibility] = useState<Visibility>(existing?.visibility ?? "public");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const rating = await submitRating(placeId, { ...scores, note: note.trim(), visibility });
      onSaved(rating);
    } catch {
      setError("Não deu pra salvar agora — tenta de novo em instantes.");
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
        <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-background px-6 pt-6 pb-8 text-foreground sm:rounded-3xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{existing ? "Atualizar avaliação" : "Avaliar esse lugar"}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-6">
            {CRITERIA_KEYS.map((key) => (
              <div key={key}>
                <span className="mb-2 block text-sm font-medium">{CRITERIA_LABELS[key]}</span>
                <PillSlider
                  min={1}
                  max={5}
                  step={1}
                  value={scores[key]}
                  onChange={(value) => setScores((s) => ({ ...s, [key]: value }))}
                  formatValue={(value) => String(value)}
                  tickCount={5}
                />
              </div>
            ))}
          </div>

          <label className="mt-6 block">
            <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-muted uppercase">
              Nota (opcional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Algo que quem for correr lá devia saber?"
              className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none focus:border-accent"
            />
          </label>

          <div className="mt-5">
            <span className="mb-1.5 block text-[11px] font-semibold tracking-wide text-muted uppercase">
              Quem vê essa avaliação
            </span>
            <div className="flex gap-2">
              {VISIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVisibility(opt.value)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-left text-xs ${
                    visibility === opt.value ? "border-accent bg-accent/10" : "border-border bg-surface"
                  }`}
                >
                  <span className="block font-semibold">{opt.label}</span>
                  <span className="mt-0.5 block text-muted">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-bad">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-6 w-full rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {submitting ? "Salvando…" : existing ? "Atualizar avaliação" : "Enviar avaliação"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
