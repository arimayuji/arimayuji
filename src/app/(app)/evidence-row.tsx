import { strengthLabel, topicLabel, type DecisionTopic, type EvidenceFact, type EvidenceStrength } from "@/lib/evidence";
import { TopicIcon } from "./topic-icons";

/**
 * Shared with `/estudos` on purpose — one row renderer for "here's the fact
 * and where it came from" so the two screens that show real citations can
 * never drift out of sync with each other.
 *
 * `topic` is optional and off by default: /estudos already groups facts
 * under a per-topic Card with its own heading and icon, so labeling it again
 * on every row would just repeat itself. /plano shows one fact per topic in
 * a flat list with no such grouping — there `topic` is what tells the
 * reader which decision the fact is actually backing, instead of a run of
 * "EVIDÊNCIA FORTE" rows with nothing to tell them apart.
 */

const STRENGTH_COLOR: Record<EvidenceStrength, string> = {
  forte: "text-accent",
  moderada: "text-accent/70",
  consenso: "text-muted",
  mito: "text-warn",
};

/** `**...**` marks the number/figure inside a bullet — same lightweight convention as the facts themselves, parsed here into an accent-colored `<strong>` instead of pulled in from a markdown renderer for two asterisks. */
function renderBullet(text: string) {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) =>
      i % 2 === 1 ? (
        <strong key={i} className="font-semibold text-accent">
          {part}
        </strong>
      ) : (
        part
      ),
    );
}

export function EvidenceFactRow({ fact, topic }: { fact: EvidenceFact; topic?: DecisionTopic }) {
  return (
    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      {topic && (
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <TopicIcon topic={topic} className="h-3.5 w-3.5 text-accent" />
          {topicLabel(topic)}
        </p>
      )}
      <span
        className={`font-mono text-[10px] uppercase tracking-wide ${STRENGTH_COLOR[fact.strength]}`}
      >
        {strengthLabel(fact.strength)}
      </span>
      <ul className="mt-1 flex flex-col gap-0.5">
        {fact.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-1.5 text-sm leading-snug text-pretty">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-40" aria-hidden="true" />
            <span>{renderBullet(bullet)}</span>
          </li>
        ))}
      </ul>
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
