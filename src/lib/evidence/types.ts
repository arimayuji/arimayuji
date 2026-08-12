/**
 * The evidence base behind the (not yet built) training-plan engine.
 *
 * This is deliberately NOT a vector-search RAG. The corpus is ~25 curated
 * facts, hand-graded by evidence strength — running that through embeddings
 * and semantic retrieval would be slower, costlier, and *less* reliable than
 * a plain lookup keyed by decision type, for a corpus this small. Real RAG
 * earns its cost once this grows into hundreds of sources; until then a
 * structured table is the honest architecture, not a placeholder for one.
 *
 * When the plan engine exists, each numeric decision it makes (pace zone,
 * weekly volume cap, taper length, warm-up structure) looks up its
 * `DecisionTopic` here and surfaces the matching facts as "why" — the
 * differentiator the market research found nobody else in this space does.
 */

/** Matches the numeric decision points the plan engine will eventually make. */
export type DecisionTopic =
  | "pace_zones"
  | "race_time_prediction"
  | "volume_progression"
  | "periodization"
  | "taper"
  | "overtraining"
  | "warmup"
  | "static_stretch_pre"
  | "static_stretch_post"
  | "cooldown"
  | "hydration"
  | "nutrition_timing"
  | "injury_prevention";

/**
 * How much weight a claim should carry when the plan engine cites it —
 * distinct from whether it's *true*, since "limitada" findings and "mito
 * popular sem base" findings are both worth surfacing to an honest user, just
 * framed differently.
 */
export type EvidenceStrength =
  | "forte" // controlled trial(s) or systematic review/meta-analysis
  | "moderada" // observational/prospective cohort, or an official position stand summarizing mixed trials
  | "consenso" // expert/coach convention, explicitly not backed by a strong study
  | "mito"; // popular belief the evidence actually contradicts

export interface EvidenceSource {
  name: string;
  org?: string;
  url?: string;
  /** Set false for anything derived from a copyrighted book/curriculum — cite the finding, never reproduce the source's tables/text. */
  citable: boolean;
}

export interface EvidenceFact {
  id: string;
  topic: DecisionTopic;
  /** The full claim, in Portuguese — canonical record of what the source actually says, not itself rendered as a paragraph anywhere anymore (see `bullets`). */
  claim: string;
  /** 2-3 short, scannable fragments pulled from `claim` — same numbers and wording, just broken out of paragraph form. What the UI actually shows. */
  bullets: string[];
  strength: EvidenceStrength;
  source: EvidenceSource;
  /** Only set when the strength alone would be misleading — e.g. a "forte" finding that is a null result, or a claim later nuanced by newer research. */
  caveat?: string;
}
