/**
 * Illustrated backgrounds for the share card, as plain data.
 *
 * Authored against a 320×400 art space and consumed twice over: as SVG by the
 * in-app preview (src/app/(app)/share-card.tsx) and as Canvas 2D draw calls by
 * the video renderer next door. Both read these exact numbers — the card a
 * runner previews and the card that lands in someone's WhatsApp have to be the
 * same picture, so there is only ever one copy of the colours.
 *
 * They exist because the rural/trail runner who doesn't have a skyline photo
 * handy still deserves a background: an illustrated stand-in for the time of
 * day they actually ran beats picking a stock photo.
 */

export type ScenarioId =
  | "madrugada"
  | "manha"
  | "neblina"
  | "noite"
  | "poente"
  | "tempestade"
  | "inverno";

export interface ScenarioDef {
  label: string;
  /** Short form for the on-card badge, where "Noite fechada" wraps and collides with the wordmark. */
  short: string;
  hint: string;
  sky: [string, string, string, string];
  ridgeFar: string;
  ridgeNear: string;
  ridgeOpacity: number;
  fog?: boolean;
  celestial?: { cx: number; cy: number; r: number; fill: string; opacity: number };
  stars?: { cx: number; cy: number; r: number }[];
}

/** The art space every coordinate above is expressed in. */
export const SCENARIO_ART_WIDTH = 320;
export const SCENARIO_ART_HEIGHT = 400;

/** Far and near ridge silhouettes, filled down to the bottom of the art space. */
export const RIDGE_FAR_PATH =
  "M0 250 L64 214 L112 240 L168 196 L228 236 L280 210 L320 236 V400 H0 Z";
export const RIDGE_NEAR_PATH =
  "M0 296 L58 268 L126 300 L196 264 L268 296 L320 274 V400 H0 Z";

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  madrugada: {
    label: "Madrugada",
    short: "Madrugada",
    hint: "céu de transição, primeira luz no horizonte",
    sky: ["#1b2a4a", "#4d4270", "#b06a52", "#2a2130"],
    ridgeFar: "#1d1b2b",
    ridgeNear: "#14121d",
    ridgeOpacity: 0.9,
    celestial: { cx: 232, cy: 196, r: 26, fill: "#f0b27a", opacity: 0.75 },
  },
  manha: {
    label: "Manhã",
    short: "Manhã",
    hint: "luz alta, céu claro",
    sky: ["#2f5f8a", "#7cb2d1", "#eed49a", "#8a7a4f"],
    ridgeFar: "#233524",
    ridgeNear: "#182619",
    ridgeOpacity: 0.85,
    celestial: { cx: 250, cy: 92, r: 22, fill: "#fff3c4", opacity: 0.9 },
  },
  neblina: {
    label: "Neblina",
    short: "Neblina",
    hint: "baixo contraste, relevo se perdendo na cerração",
    sky: ["#5c6670", "#7c868e", "#a9b1b6", "#8f979c"],
    ridgeFar: "#495158",
    ridgeNear: "#3a4147",
    ridgeOpacity: 0.4,
    fog: true,
  },
  noite: {
    label: "Noite fechada",
    short: "Noite",
    hint: "céu escuro, lua e estrelas",
    sky: ["#04060c", "#0a0f1e", "#0f1830", "#050810"],
    ridgeFar: "#050608",
    ridgeNear: "#020304",
    ridgeOpacity: 1,
    celestial: { cx: 246, cy: 84, r: 16, fill: "#cdd6e8", opacity: 0.85 },
    stars: [
      { cx: 60, cy: 60, r: 1.4 },
      { cx: 100, cy: 110, r: 1 },
      { cx: 150, cy: 50, r: 1.2 },
      { cx: 200, cy: 100, r: 1 },
      { cx: 280, cy: 60, r: 1.3 },
      { cx: 300, cy: 140, r: 1 },
      { cx: 40, cy: 150, r: 1 },
      { cx: 130, cy: 30, r: 1 },
    ],
  },
  poente: {
    label: "Pôr do sol",
    short: "Pôr do sol",
    hint: "hora dourada, sol baixo se pondo no horizonte",
    sky: ["#1a1f3d", "#c2547a", "#f2965c", "#3a1f2e"],
    ridgeFar: "#241521",
    ridgeNear: "#160d14",
    ridgeOpacity: 0.92,
    celestial: { cx: 200, cy: 232, r: 34, fill: "#ffd9a0", opacity: 0.9 },
  },
  tempestade: {
    label: "Tempestade se formando",
    short: "Tempestade",
    hint: "nuvens carregadas, luz baixa e dramática",
    sky: ["#2b3038", "#3f4750", "#5a6169", "#23262b"],
    ridgeFar: "#1c1f24",
    ridgeNear: "#121417",
    ridgeOpacity: 0.95,
  },
  inverno: {
    label: "Inverno",
    short: "Inverno",
    hint: "ar frio e seco, luz pálida de manhã de inverno",
    sky: ["#7fa3c2", "#b9d3e3", "#e8f1f5", "#c7d6dd"],
    ridgeFar: "#3d4f5c",
    ridgeNear: "#2a343d",
    ridgeOpacity: 0.7,
    celestial: { cx: 240, cy: 100, r: 20, fill: "#fdfdf5", opacity: 0.85 },
  },
};

/**
 * Which illustrated sky a run gets when nobody picked one — from the hour it
 * actually started at. Only the four time-of-day scenarios are ever chosen
 * automatically: fog, storm and winter are weather, and the app has no weather
 * data, so guessing those would put a claim on the card that nothing backs.
 */
export function scenarioForHour(hour: number): ScenarioId {
  if (hour < 4) return "noite";
  if (hour < 7) return "madrugada";
  if (hour < 16) return "manha";
  if (hour < 19) return "poente";
  return "noite";
}
