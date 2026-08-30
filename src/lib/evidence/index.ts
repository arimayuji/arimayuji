import { EVIDENCE_FACTS } from "./facts";
import type { DecisionTopic, EvidenceFact, EvidenceStrength } from "./types";

export type { DecisionTopic, EvidenceFact, EvidenceSource, EvidenceStrength } from "./types";
export { EVIDENCE_FACTS } from "./facts";

/**
 * Every `DecisionTopic` that actually has at least one fact, in the order
 * they matter to a runner (what shapes the plan, then technique/recovery
 * topics) — the order a "browse everything" screen should render sections
 * in, since `DecisionTopic`'s own declaration order in `types.ts` is just
 * source-file tidiness, not a deliberate reading order.
 */
export const DECISION_TOPICS_IN_DISPLAY_ORDER: DecisionTopic[] = [
  "volume_progression",
  "periodization",
  "taper",
  "overtraining",
  "injury_prevention",
  "injury_rehab",
  "pace_zones",
  "race_time_prediction",
  "warmup",
  "static_stretch_pre",
  "static_stretch_post",
  "cooldown",
  "hydration",
  "nutrition_timing",
];

const TOPIC_LABEL: Record<DecisionTopic, string> = {
  volume_progression: "Progressão de volume",
  periodization: "Periodização",
  taper: "Taper",
  overtraining: "Overtraining",
  injury_prevention: "Prevenção de lesão",
  injury_rehab: "Reabilitação e retorno",
  pace_zones: "Zonas de pace",
  race_time_prediction: "Previsão de tempo de prova",
  warmup: "Aquecimento",
  static_stretch_pre: "Alongamento antes de correr",
  static_stretch_post: "Alongamento depois de correr",
  cooldown: "Desaquecimento",
  hydration: "Hidratação",
  nutrition_timing: "Nutrição e timing",
};

export function topicLabel(topic: DecisionTopic): string {
  return TOPIC_LABEL[topic];
}

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
