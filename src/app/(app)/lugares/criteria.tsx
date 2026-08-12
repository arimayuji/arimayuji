import type { CriteriaKey } from "@/lib/placeRatings";

export const CRITERIA_LABELS: Record<CriteriaKey, string> = {
  seguranca: "Segurança",
  percurso: "Percurso",
  estrutura: "Estrutura",
  iluminacao: "Iluminação",
  fluxo: "Fluxo",
};

function scoreColor(score: number): string {
  if (score >= 4) return "bg-good";
  if (score >= 3) return "bg-warn";
  return "bg-bad";
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function CriteriaDots({ score }: { score: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < Math.round(score) ? scoreColor(score) : "bg-border"}`}
        />
      ))}
    </span>
  );
}

/** Compact summary row used on place cards — label, dots, number, no note. */
export function CriteriaMiniRow({ criteriaKey, score }: { criteriaKey: CriteriaKey; score: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted">{CRITERIA_LABELS[criteriaKey]}</span>
      <span className="flex items-center gap-1.5">
        <CriteriaDots score={score} />
        <span className="w-4 text-right font-mono text-[11px] tabular-nums text-muted">{formatScore(score)}</span>
      </span>
    </div>
  );
}

/** Full row with justification note, used on the detail screen. */
export function CriteriaRow({
  criteriaKey,
  score,
  note,
}: {
  criteriaKey: CriteriaKey;
  score: number;
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{CRITERIA_LABELS[criteriaKey]}</p>
        {note && <p className="mt-0.5 text-xs leading-relaxed text-muted text-pretty">{note}</p>}
      </div>
      <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
        <CriteriaDots score={score} />
        <span className="w-4 text-right font-mono text-xs tabular-nums text-muted">{formatScore(score)}</span>
      </span>
    </div>
  );
}
