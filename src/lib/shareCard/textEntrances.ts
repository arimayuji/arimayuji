/**
 * How the numbers/labels on the share card arrive and leave — the motion
 * equivalent of `photoFilters.ts`'s colour presets. The actual curves live
 * in `renderer.ts` (they're canvas animation math, not UI concerns); this
 * file is just the picker's menu.
 */
export type TextEntranceId = "bumerangue" | "deslizar" | "zoom";

export const TEXT_ENTRANCE_IDS: TextEntranceId[] = ["bumerangue", "deslizar", "zoom"];

export const TEXT_ENTRANCES: Record<TextEntranceId, { label: string; description: string }> = {
  bumerangue: {
    label: "Bumerangue",
    description: "Voa e finca com impacto — e volta do mesmo jeito na saída.",
  },
  deslizar: {
    label: "Deslizar",
    description: "Desliza suave pra dentro e continua deslizando pro outro lado na saída.",
  },
  zoom: {
    label: "Zoom",
    description: "Cresce no lugar com um leve baque, sem se deslocar — encolhe do mesmo jeito ao sair.",
  },
};
