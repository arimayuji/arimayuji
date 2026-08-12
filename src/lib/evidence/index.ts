import { EVIDENCE_FACTS } from "./facts";
import type { DecisionTopic, EvidenceFact, EvidenceStrength } from "./types";

export type { DecisionTopic, EvidenceFact, EvidenceSource, EvidenceStrength } from "./types";
export { EVIDENCE_FACTS } from "./facts";

/** Every fact backing a given plan decision — this is the whole "retrieval" step. */
export function getEvidenceForTopic(topic: DecisionTopic): EvidenceFact[] {
  return EVIDENCE_FACTS.filter((fact) => fact.topic === topic);
}

export function getEvidenceById(id: string): EvidenceFact | undefined {
  return EVIDENCE_FACTS.find((fact) => fact.id === id);
}

const STRENGTH_RANK: Record<EvidenceStrength, number> = {
  forte: 0,
  moderada: 1,
  consenso: 2,
  mito: 3,
};

/** Strongest evidence first, for when a UI can only show the top N facts for a topic. */
export function getEvidenceForTopicRanked(topic: DecisionTopic): EvidenceFact[] {
  return getEvidenceForTopic(topic).sort(
    (a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength],
  );
}

const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  forte: "Evidência forte",
  moderada: "Evidência moderada",
  consenso: "Consenso de treinador",
  mito: "Mito popular",
};

export function strengthLabel(strength: EvidenceStrength): string {
  return STRENGTH_LABEL[strength];
}
