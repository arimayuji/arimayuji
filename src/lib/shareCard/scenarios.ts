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
  | "inverno"
  | "amazonia"
  | "mataatlantica"
  | "cerrado"
  | "caatinga"
  | "pantanal"
  | "pampa"
  | "rio"
  | "brasilia"
  | "salvador"
  | "manaus"
  | "florianopolis"
  | "saopaulo"
  | "recife";

/** Groups the scenario picker on /compartilhar — purely a UI label, no effect on rendering. */
export type ScenarioCategory = "hora" | "clima" | "bioma" | "capital";

export interface ScenarioDef {
  label: string;
  /** Short form for the on-card badge, where "Noite fechada" wraps and collides with the wordmark. */
  short: string;
  hint: string;
  category: ScenarioCategory;
  sky: [string, string, string, string];
  ridgeFar: string;
  ridgeNear: string;
  /** Override for RIDGE_FAR_PATH — a biome needs its own far silhouette (dense canopy, flat wetland...), not just a recolored generic hill. Falls back to the generic hill when absent. */
  ridgeFarPath?: string;
  /** Override for RIDGE_NEAR_PATH — every capital sets this to its own landmark/skyline silhouette; biomes set it alongside ridgeFarPath. Falls back to the generic hill when absent. */
  ridgeNearPath?: string;
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
    category: "hora",
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
    category: "hora",
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
    category: "clima",
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
    category: "hora",
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
    category: "hora",
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
    category: "clima",
    sky: ["#2b3038", "#3f4750", "#5a6169", "#23262b"],
    ridgeFar: "#1c1f24",
    ridgeNear: "#121417",
    ridgeOpacity: 0.95,
  },
  inverno: {
    label: "Inverno",
    short: "Inverno",
    hint: "ar frio e seco, luz pálida de manhã de inverno",
    category: "clima",
    sky: ["#7fa3c2", "#b9d3e3", "#e8f1f5", "#c7d6dd"],
    ridgeFar: "#3d4f5c",
    ridgeNear: "#2a343d",
    ridgeOpacity: 0.7,
    celestial: { cx: 240, cy: 100, r: 20, fill: "#fdfdf5", opacity: 0.85 },
  },

  // --- Biomas brasileiros (os 6 biomas oficiais do IBGE) ---------------------
  // Both ridge paths are overridden for every biome: the whole landscape
  // silhouette needs to change, not just its color, for these to read as
  // their biome instead of "the usual hill, tinted differently".
  amazonia: {
    label: "Amazônia",
    short: "Amazônia",
    hint: "dossel denso e irregular, névoa baixa entre as copas",
    category: "bioma",
    sky: ["#132e1f", "#2f6b46", "#8fae5c", "#0e2016"],
    ridgeFar: "#173a26",
    ridgeNear: "#0e2417",
    ridgeFarPath:
      "M0 232 L18 208 L34 226 L50 198 L66 222 L82 202 L98 224 L114 196 L130 220 L146 204 L162 226 L178 198 L194 220 L210 202 L226 224 L242 200 L258 222 L274 204 L290 226 L306 200 L320 218 V400 H0 Z",
    ridgeNearPath:
      "M0 300 L20 278 L36 296 L52 272 L60 250 L68 272 L84 294 L100 270 L116 292 L132 268 L148 290 L164 266 L180 288 L196 264 L212 286 L228 262 L236 240 L244 262 L260 284 L276 260 L292 282 L308 266 L320 280 V400 H0 Z",
    ridgeOpacity: 0.88,
    fog: true,
  },
  mataatlantica: {
    label: "Mata Atlântica",
    short: "Mata Atlântica",
    hint: "encosta coberta de floresta, ar úmido",
    category: "bioma",
    sky: ["#1a3a3a", "#3f7a68", "#a9c98f", "#16281f"],
    ridgeFar: "#264a3e",
    ridgeNear: "#1a3229",
    ridgeFarPath: "M0 235 L40 210 L80 230 L120 205 L160 228 L200 208 L240 232 L280 210 L320 230 V400 H0 Z",
    ridgeNearPath: "M0 300 L30 276 L60 296 L90 270 L120 294 L150 268 L180 292 L210 266 L240 290 L270 268 L300 292 L320 276 V400 H0 Z",
    ridgeOpacity: 0.78,
    fog: true,
  },
  cerrado: {
    label: "Cerrado",
    short: "Cerrado",
    hint: "vegetação rala e arredondada sobre a savana",
    category: "bioma",
    sky: ["#5a4a24", "#9c7a3c", "#e0c27a", "#4a3a1e"],
    ridgeFar: "#6b5730",
    ridgeNear: "#4a3c20",
    ridgeFarPath: "M0 270 L80 262 L160 268 L240 260 L320 266 V400 H0 Z",
    ridgeNearPath:
      "M0 320 L50 320 L58 302 L66 320 L130 320 L138 300 L148 320 L210 320 L220 304 L230 320 L280 320 L288 303 L298 320 L320 320 V400 H0 Z",
    ridgeOpacity: 0.85,
  },
  caatinga: {
    label: "Caatinga",
    short: "Caatinga",
    hint: "vegetação seca e esparsa, terra rachada, luz dura",
    category: "bioma",
    sky: ["#6b3a20", "#a85c30", "#e8a860", "#4a2818"],
    ridgeFar: "#5a3520",
    ridgeNear: "#3e2415",
    ridgeFarPath: "M0 275 L100 270 L200 274 L320 271 V400 H0 Z",
    ridgeNearPath:
      "M0 320 L60 320 L62 288 L66 288 L68 320 L140 320 L142 292 L144 300 L148 292 L150 320 L220 320 L222 286 L226 286 L228 320 L300 320 L302 294 L306 294 L308 320 L320 320 V400 H0 Z",
    ridgeOpacity: 0.9,
  },
  pantanal: {
    label: "Pantanal",
    short: "Pantanal",
    hint: "planície alagada, horizonte quase plano",
    category: "bioma",
    sky: ["#2a3550", "#6a7a4a", "#d8c67a", "#1e2838"],
    ridgeFar: "#3a4a30",
    ridgeNear: "#28351f",
    ridgeFarPath: "M0 310 L100 306 L200 309 L320 305 V400 H0 Z",
    ridgeNearPath: "M0 340 L90 336 L180 339 L280 335 L320 338 V400 H0 Z",
    ridgeOpacity: 0.6,
  },
  pampa: {
    label: "Pampa",
    short: "Pampa",
    hint: "campo aberto, colinas suaves de grama",
    category: "bioma",
    sky: ["#3a4a5a", "#7a8a6a", "#c9d4a0", "#2a3830"],
    ridgeFar: "#4a5a48",
    ridgeNear: "#333f30",
    ridgeFarPath: "M0 300 L80 292 L160 298 L240 288 L320 296 V400 H0 Z",
    ridgeNearPath: "M0 330 L100 326 L200 329 L320 325 V400 H0 Z",
    ridgeOpacity: 0.75,
  },

  // --- Capitais (uma por região + 2 grandes centros) -------------------------
  // Only the near ridge is overridden here — the generic far ridge stays as a
  // hazy backdrop of distant hills behind each skyline/landmark, which is
  // cheaper to author and still reads fine (most of these cities do sit near
  // real hills anyway).
  rio: {
    label: "Rio de Janeiro",
    short: "Rio de Janeiro",
    hint: "Corcovado e Pão de Açúcar contra a luz dourada da baía",
    category: "capital",
    sky: ["#1a2f52", "#3d6a92", "#e8b070", "#2a1f30"],
    ridgeFar: "#241c30",
    ridgeNear: "#160f1c",
    ridgeNearPath:
      "M0 315 L40 312 L70 300 L85 240 L88 200 L90 196 L92 200 L92 208 L95 240 L110 300 L140 313 L170 316 L190 300 L205 270 L215 255 L225 250 L235 252 L245 262 L255 280 L265 300 L280 314 L320 316 V400 H0 Z",
    ridgeOpacity: 0.92,
  },
  brasilia: {
    label: "Brasília",
    short: "Brasília",
    hint: "cúpulas do Congresso Nacional no horizonte plano",
    category: "capital",
    sky: ["#20345a", "#4a6a9a", "#c8d4e8", "#1a2438"],
    ridgeFar: "#22304a",
    ridgeNear: "#161e30",
    ridgeNearPath:
      "M0 308 L55 306 L85 305 L90 280 L98 272 L118 272 L126 280 L131 305 L148 305 L152 200 L160 198 L168 200 L172 305 L189 305 L194 280 L202 272 L222 272 L230 280 L235 305 L265 307 L320 308 V400 H0 Z",
    ridgeOpacity: 0.9,
  },
  salvador: {
    label: "Salvador",
    short: "Salvador",
    hint: "Farol da Barra e casario colonial ao entardecer",
    category: "capital",
    sky: ["#2a2040", "#6a4a68", "#e0905a", "#241830"],
    ridgeFar: "#2c2038",
    ridgeNear: "#1c1424",
    ridgeNearPath:
      "M0 314 L20 306 L35 312 L50 300 L65 310 L78 296 L92 306 L96 306 L100 235 L112 235 L116 306 L120 306 L135 296 L150 306 L165 298 L180 308 L195 300 L210 310 L225 302 L240 312 L255 304 L270 314 L320 315 V400 H0 Z",
    ridgeOpacity: 0.9,
  },
  manaus: {
    label: "Manaus",
    short: "Manaus",
    hint: "cúpula do Teatro Amazonas na neblina do rio",
    category: "capital",
    sky: ["#2a3a2e", "#5a7a5a", "#c8d488", "#1e2a1e"],
    ridgeFar: "#28382a",
    ridgeNear: "#18241a",
    ridgeNearPath:
      "M0 312 L40 308 L70 300 L85 280 L92 258 L100 235 L108 228 L116 235 L124 258 L131 280 L146 300 L176 308 L210 312 L320 314 V400 H0 Z",
    ridgeOpacity: 0.8,
    fog: true,
  },
  florianopolis: {
    label: "Florianópolis",
    short: "Florianópolis",
    hint: "Ponte Hercílio Luz recortada contra o entardecer",
    category: "capital",
    sky: ["#1e2f4a", "#3f6088", "#e8a868", "#20182c"],
    ridgeFar: "#22344a",
    ridgeNear: "#141e2c",
    ridgeNearPath:
      "M0 316 L65 316 L68 210 L82 210 L85 260 L110 292 L150 304 L170 306 L190 304 L230 292 L255 260 L258 210 L272 210 L275 316 L320 316 V400 H0 Z",
    ridgeOpacity: 0.92,
  },
  saopaulo: {
    label: "São Paulo",
    short: "São Paulo",
    hint: "skyline denso, prédio depois de prédio até o fim da vista",
    category: "capital",
    sky: ["#2a2a34", "#5a5560", "#c9a468", "#201e26"],
    ridgeFar: "#2c2a34",
    ridgeNear: "#18171e",
    ridgeNearPath:
      "M0 320 L0 300 L14 300 L14 280 L28 280 L28 310 L42 310 L42 260 L56 260 L56 295 L70 295 L70 270 L84 270 L84 305 L98 305 L98 245 L112 245 L112 290 L126 290 L126 265 L140 265 L140 300 L154 300 L154 255 L168 255 L168 285 L182 285 L182 240 L196 240 L196 295 L210 295 L210 270 L224 270 L224 305 L238 305 L238 250 L252 250 L252 288 L266 288 L266 265 L280 265 L280 300 L294 300 L294 275 L308 275 L308 310 L320 310 L320 400 L0 400 Z",
    ridgeOpacity: 0.94,
  },
  recife: {
    label: "Recife",
    short: "Recife",
    hint: "pontes sobre o rio e o marco zero ao entardecer",
    category: "capital",
    sky: ["#26314a", "#4f6f8a", "#e8b878", "#1e2230"],
    ridgeFar: "#283248",
    ridgeNear: "#18202e",
    ridgeNearPath:
      "M0 314 L30 310 L45 314 L60 300 L64 296 L74 296 L78 300 L92 314 L108 308 L114 250 L128 250 L134 308 L148 312 L162 300 L166 296 L176 296 L180 300 L195 314 L210 308 L225 314 L245 302 L249 298 L259 298 L263 302 L278 314 L320 315 V400 H0 Z",
    ridgeOpacity: 0.9,
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
