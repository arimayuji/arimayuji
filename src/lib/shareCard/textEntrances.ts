/**
 * How the numbers/labels on the share card arrive and leave — the motion
 * equivalent of `photoFilters.ts`'s colour presets. The actual curves live
 * in `renderer.ts` (they're canvas animation math, not UI concerns); this
 * file is just the picker's menu. Most styles are entrance/exit only;
 * "tremer" also keeps animating the whole time text is on screen (a
 * continuous tremble, not just an arrival), and "escrita" reveals/erases
 * character by character instead of moving or fading the whole string.
 */
export type TextEntranceId =
  | "bumerangue"
  | "deslizar"
  | "zoom"
  | "queda"
  | "desfoque"
  | "virar"
  | "tremer"
  | "escrita";

export const TEXT_ENTRANCE_IDS: TextEntranceId[] = [
  "bumerangue",
  "deslizar",
  "zoom",
  "queda",
  "desfoque",
  "virar",
  "tremer",
  "escrita",
];

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
  queda: {
    label: "Queda",
    description: "Cai de cima e quica antes de assentar — na saída, continua caindo pra baixo da tela.",
  },
  desfoque: {
    label: "Desfoque",
    description: "Aparece desfocado e vai ficando nítido no lugar — desfoca de novo ao sumir.",
  },
  virar: {
    label: "Virar",
    description: "Vira como uma cartinha, de lado pra de frente — fecha do mesmo jeito na saída.",
  },
  tremer: {
    label: "Tremer",
    description: "Chega com um leve baque e fica tremendo o tempo todo em que aparece na tela.",
  },
  escrita: {
    label: "Escrita",
    description: "Vai digitando letra por letra — e apaga de trás pra frente na saída.",
  },
};
