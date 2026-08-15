/**
 * Instagram-style presets for the athlete's own photo on the share card —
 * a CSS `filter` string, applied both live (the `<img>` preview and the
 * canvas render use the exact same string) so what's picked is what ships.
 */
export type PhotoFilterId = "original" | "moderno" | "vintage";

export const PHOTO_FILTERS: Record<PhotoFilterId, { label: string; css: string }> = {
  original: { label: "Original", css: "none" },
  moderno: {
    label: "Moderno",
    css: "contrast(1.16) saturate(1.35) brightness(1.03)",
  },
  vintage: {
    label: "Vintage",
    css: "sepia(0.35) saturate(0.8) contrast(0.92) brightness(1.06) hue-rotate(-8deg)",
  },
};

export const PHOTO_FILTER_IDS: readonly PhotoFilterId[] = ["original", "moderno", "vintage"];
