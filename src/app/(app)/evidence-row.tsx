import { strengthLabel, type EvidenceFact, type EvidenceStrength } from "@/lib/evidence";

/**
 * Shared with `/estudos` on purpose — one row renderer for "here's the fact
 * and where it came from" so the two screens that show real citations can
 * never drift out of sync with each other.
 */

const STRENGTH_COLOR: Record<EvidenceStrength, string> = {
  forte: "text-accent",
  moderada: "text-accent/70",
  consenso: "text-muted",
  mito: "text-warn",
};

export function EvidenceFactRow({ fact }: { fact: EvidenceFact }) {
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <span
        className={`font-mono text-[10px] uppercase tracking-wide ${STRENGTH_COLOR[fact.strength]}`}
      >
        {strengthLabel(fact.strength)}
      </span>
      <p className="mt-1 text-sm leading-relaxed text-pretty">{fact.claim}</p>
      {fact.caveat && (
        <p className="mt-1 text-xs leading-relaxed text-muted text-pretty">{fact.caveat}</p>
      )}
      {fact.source.url ? (
        <a
          href={fact.source.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-block text-xs text-muted underline underline-offset-2 hover:text-accent"
        >
          {fact.source.name}
        </a>
      ) : (
        <p className="mt-1.5 text-xs text-muted">{fact.source.name}</p>
      )}
    </li>
  );
}
