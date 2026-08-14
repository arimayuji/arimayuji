/**
 * The static counterpart to video.ts: a single PNG frame of the finished
 * card instead of a recorded animation. Exists because forcing every share
 * through a recorded video was the actual complaint — a still image posts
 * to a feed (not just a story), downloads instantly with no encoding wait,
 * and works on browsers that can't record a canvas stream at all.
 */

import {
  SHARE_CARD_DURATION_MS,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  drawShareCardFrame,
  shareCardFontSpecs,
  type ShareCardScene,
} from "./renderer";

/** Canvas substitutes a missing face silently, so the card would render in a proportional fallback if this were skipped — same reasoning video.ts's own copy of this follows. */
async function ensureFontsLoaded(scene: ShareCardScene): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all(shareCardFontSpecs(scene).map((spec) => document.fonts.load(spec)));
    await document.fonts.ready;
  } catch {
    // A face that refuses to load still renders in the fallback mono — worse looking, not broken.
  }
}

/** The card's fully-revealed final frame (`elapsed = SHARE_CARD_DURATION_MS`), rendered once — no recording, no wall-clock wait. Null only if the canvas itself can't be created or exported. */
export async function buildShareCardPngBlob(scene: ShareCardScene): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  await ensureFontsLoaded(scene);
  drawShareCardFrame(ctx, scene, SHARE_CARD_DURATION_MS);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export function shareImageFileName(): string {
  return "corrida-xanthus.png";
}

/** The rendered card as a `File`, ready for `navigator.share` or a download link. Null only when the blob itself couldn't be produced. */
export async function buildShareCardPngFile(scene: ShareCardScene): Promise<File | null> {
  const blob = await buildShareCardPngBlob(scene);
  if (!blob) return null;
  return new File([blob], shareImageFileName(), { type: "image/png" });
}

/**
 * Saves a file to disk via a synthetic `<a download>` click — the standard
 * fallback for browsers/contexts where `navigator.share` with files isn't
 * available (desktop Chrome, Firefox on any platform). The object URL is
 * revoked right after the click dispatches; the browser has already queued
 * the download by then, same pattern the rest of the app uses for any
 * client-generated download.
 */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
